import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { chromium, type Locator, type Page } from 'playwright'
import { comparePng } from './imageDiff.js'
import type { BrowserArtifactRefs, BrowserEvidence, BrowserFinding, BrowserLocatorSpec, BrowserPlanStep, BrowserVisualCheck } from '../types.js'
import type { ExtensionToolContext } from '../ompApi.js'

export interface BrowserCheckParams {
  baseUrl: string
  serverCommand?: string
  artifactDir?: string
  setup?: {
    headless?: boolean
    viewport?: { width: number; height: number }
    trace?: 'off' | 'retain-on-failure'
    screenshot?: 'off' | 'only-on-failure'
    serviceWorkers?: 'allow' | 'block'
  }
  scenarios: Array<{
    name: string
    steps: BrowserPlanStep[]
    visualChecks?: BrowserVisualCheck[]
  }>
}

interface BrowserSignalInput {
  consoleErrors: unknown[]
  consoleWarnings: unknown[]
  pageErrors: unknown[]
  failedRequests: unknown[]
  badResponses: unknown[]
}

export async function executeBrowserCheck(params: BrowserCheckParams, ctx: ExtensionToolContext): Promise<BrowserEvidence> {
  const cwd = typeof ctx.cwd === 'string' && ctx.cwd.trim() !== '' ? ctx.cwd : process.cwd()
  const runId = `browser-${Date.now().toString(36)}`
  const artifactDir = params.artifactDir ?? join(cwd, '.omp', 'testing-enhancer-artifacts', runId)
  await mkdir(artifactDir, { recursive: true })

  let server: ChildProcess | undefined
  let serverClosed = false
  let serverError: unknown
  let serverClosePromise: Promise<void> | undefined
  const findings: BrowserFinding[] = []
  const artifacts: BrowserArtifactRefs = {}
  const headless = params.setup?.headless ?? true
  const viewport = params.setup?.viewport ?? { width: 1280, height: 720 }
  const traceMode = params.setup?.trace ?? 'off'
  const serviceWorkers = params.setup?.serviceWorkers ?? 'block'
  const consoleErrors: unknown[] = []
  const consoleWarnings: unknown[] = []
  const pageErrors: unknown[] = []
  const failedRequests: unknown[] = []
  const badResponses: unknown[] = []
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  let context: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>['newContext']>> | undefined
  let page: Page | undefined
  let tracingStarted = false

  try {
    if (params.serverCommand) {
      const [program, ...args] = splitCommandLine(params.serverCommand)
      if (program) {
        server = spawn(program, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
        serverClosePromise = new Promise(resolve => {
          server?.once('error', error => {
            serverError = error
            serverClosed = true
            resolve()
          })
          server?.once('close', () => {
            serverClosed = true
            resolve()
          })
        })
        await new Promise(resolve => setTimeout(resolve, 0))
        if (serverError) {
          findings.push(serverCommandFailureFinding(params.serverCommand, serverError))
          return buildEvidence(params, runId, headless, viewport, findings, artifacts)
        }
      }
    }

    const reachable = await waitForReachable(params.baseUrl, 30000)
    if (!reachable) {
      findings.push({
        gate: 'browser-interaction',
        passed: false,
        severity: 'blocker',
        category: 'network-failure',
        summary: 'Browser base URL was not reachable.',
        evidence: { baseUrl: params.baseUrl },
        repairHint: 'Start the dev server or pass serverCommand before running omp_test_browser_check.'
      })
      return buildEvidence(params, runId, headless, viewport, findings, artifacts)
    }

    try {
      browser = await chromium.launch({ headless })
    } catch (error: unknown) {
      return {
        framework: 'playwright',
        status: 'skipped',
        runId,
        baseUrl: params.baseUrl,
        browser: 'chromium',
        findings: [{
          gate: 'browser-interaction',
          passed: true,
          severity: 'warning',
          category: 'setup',
          summary: 'Playwright Chromium could not be launched.',
          evidence: { message: error instanceof Error ? error.message : String(error) },
          repairHint: 'Install Playwright browsers with the target package manager before running omp_test_browser_check.'
        }]
      }
    }

    context = await browser.newContext({ viewport, serviceWorkers })
    if (traceMode === 'retain-on-failure') {
      await context.tracing.start({ screenshots: true, snapshots: true })
      tracingStarted = true
    }
    page = await context.newPage()
    page.on('console', message => {
      const type = message.type()
      if (type === 'error') consoleErrors.push({ message: message.text(), type })
      if (type === 'warning') consoleWarnings.push({ message: message.text(), type })
    })
    page.on('pageerror', error => pageErrors.push({ message: error.message, stack: error.stack }))
    page.on('requestfailed', request => failedRequests.push({ url: request.url(), failure: request.failure()?.errorText }))
    page.on('response', response => {
      if (response.status() >= 400) badResponses.push({ url: response.url(), status: response.status(), statusText: response.statusText() })
    })

    for (const [scenarioIndex, scenario] of params.scenarios.entries()) {
      if (scenario.steps[0]?.action !== 'goto') await page.goto(params.baseUrl)
      let scenarioFailed = false
      for (const [stepIndex, step] of scenario.steps.entries()) {
        try {
          await executeStep(page, step, params.baseUrl, artifactDir, scenario.name, artifacts)
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error)
          const failurePath = join(artifactDir, `failure-${scenarioIndex}-${stepIndex}.png`)
          await page.screenshot({ path: failurePath, fullPage: true }).catch(() => undefined)
          if (!artifacts.actualImagePath) artifacts.actualImagePath = failurePath
          findings.push({
            gate: 'browser-interaction',
            passed: false,
            severity: 'blocker',
            category: /timeout/i.test(message) ? 'timeout' : 'actionability',
            summary: `Browser step failed: ${step.description}`,
            evidence: { action: step.action, message },
            repairHint: 'Check locator actionability, route setup, and visible UI state.',
            artifacts: { actualImagePath: failurePath }
          })
          scenarioFailed = true
          break
        }
      }

      if (!scenarioFailed) {
        for (const visualCheck of scenario.visualChecks ?? []) {
          await executeVisualCheck(page, visualCheck, artifactDir, findings, artifacts)
        }
      }
    }

    findings.push(...normalizeBrowserFindings({ consoleErrors, consoleWarnings, pageErrors, failedRequests, badResponses }))
    return buildEvidence(params, runId, headless, viewport, findings, artifacts)
  } finally {
    const hasBlocker = findings.some(finding => !finding.passed && finding.severity === 'blocker')
    if (context && tracingStarted) {
      if (hasBlocker) {
        const tracePath = join(artifactDir, 'trace.zip')
        await context.tracing.stop({ path: tracePath }).catch(() => undefined)
        artifacts.tracePath = tracePath
      } else {
        await context.tracing.stop().catch(() => undefined)
      }
    }
    await page?.close().catch(() => undefined)
    await context?.close().catch(() => undefined)
    await browser?.close().catch(() => undefined)
    if (server) {
      if (!serverClosed && server.exitCode === null) server.kill()
      await serverClosePromise
    }
  }
}

function serverCommandFailureFinding(command: string, error: unknown): BrowserFinding {
  return {
    gate: 'browser-interaction',
    passed: false,
    severity: 'blocker',
    category: 'setup',
    summary: 'Browser server command could not be started.',
    evidence: {
      command,
      message: error instanceof Error ? error.message : String(error)
    },
    repairHint: 'Fix the browser serverCommand or start the dev server before running omp_test_browser_check.'
  }
}

export function splitCommandLine(command: string): string[] {
  const parts: string[] = []
  let current = ''
  let quote: 'single' | 'double' | undefined

  for (const char of command) {
    if (char === "'" && quote !== 'double') {
      quote = quote === 'single' ? undefined : 'single'
      continue
    }
    if (char === '"' && quote !== 'single') {
      quote = quote === 'double' ? undefined : 'double'
      continue
    }
    if (/\s/.test(char) && !quote) {
      if (current) parts.push(current)
      current = ''
      continue
    }
    current += char
  }

  if (current) parts.push(current)
  return parts
}

export function normalizeBrowserFindings(input: BrowserSignalInput): BrowserFinding[] {
  const findings: BrowserFinding[] = []
  for (const item of input.consoleErrors) {
    findings.push({ gate: 'browser-interaction', passed: false, severity: 'blocker', category: 'console-error', summary: 'Browser console error was emitted.', evidence: item, repairHint: 'Fix the runtime error reported in the browser console.' })
  }
  for (const item of input.consoleWarnings) {
    findings.push({ gate: 'browser-interaction', passed: false, severity: 'warning', category: 'console-error', summary: 'Browser console warning was emitted.', evidence: item, repairHint: 'Review whether the warning indicates broken frontend behavior.' })
  }
  for (const item of input.pageErrors) {
    findings.push({ gate: 'browser-interaction', passed: false, severity: 'blocker', category: 'page-error', summary: 'Browser page error was emitted.', evidence: item, repairHint: 'Fix the uncaught browser exception.' })
  }
  for (const item of input.failedRequests) {
    findings.push({ gate: 'browser-interaction', passed: false, severity: 'blocker', category: 'network-failure', summary: 'Browser request failed.', evidence: item, repairHint: 'Fix or mock the failed network dependency through the tested public behavior.' })
  }
  for (const item of input.badResponses) {
    const status = isRecord(item) && typeof item.status === 'number' ? item.status : 0
    findings.push({
      gate: 'browser-interaction',
      passed: false,
      severity: status >= 500 ? 'blocker' : 'warning',
      category: 'network-failure',
      summary: `Browser response returned HTTP ${status}.`,
      evidence: item,
      repairHint: 'Review the failed browser network response before accepting the test.'
    })
  }
  return findings
}

async function executeStep(page: Page, step: BrowserPlanStep, baseUrl: string, artifactDir: string, scenarioName: string, artifacts: BrowserArtifactRefs): Promise<void> {
  if (step.action === 'goto') {
    await page.goto(new URL(step.url ?? '/', baseUrl).toString())
    return
  }

  const locator = step.locator ? resolveLocator(page, step.locator) : undefined
  if (step.action === 'screenshot') {
    const path = join(artifactDir, `${safeArtifactName(scenarioName)}-${safeArtifactName(step.description)}.png`)
    if (locator) await locator.screenshot({ path })
    else await page.screenshot({ path, fullPage: true })
    if (!artifacts.actualImagePath) artifacts.actualImagePath = path
    return
  }
  if (!locator) throw new Error(`Missing locator for ${step.action}`)
  if (step.action === 'click') await locator.click()
  if (step.action === 'fill') await locator.fill(step.value ?? '')
  if (step.action === 'press') await locator.press(step.value ?? 'Enter')
  if (step.action === 'hover') await locator.hover()
  if (step.action === 'check') await locator.check()
  if (step.action === 'select') await locator.selectOption(step.value ?? '')
  if (step.action === 'assertVisible') await locator.waitFor({ state: 'visible', timeout: 5000 })
}

async function executeVisualCheck(page: Page, visualCheck: BrowserVisualCheck, artifactDir: string, findings: BrowserFinding[], artifacts: BrowserArtifactRefs): Promise<void> {
  const actualImagePath = join(artifactDir, `${safeArtifactName(visualCheck.name)}.actual.png`)
  const locator = visualCheck.locator ? resolveLocator(page, visualCheck.locator) : undefined
  if (visualCheck.kind === 'locator' && locator) await locator.screenshot({ path: actualImagePath })
  else await page.screenshot({ path: actualImagePath, fullPage: true })
  if (!artifacts.actualImagePath) artifacts.actualImagePath = actualImagePath

  if (!visualCheck.expectedPath) return

  const diffImagePath = join(artifactDir, `${safeArtifactName(visualCheck.name)}.diff.png`)
  const compareOptions: { threshold: number; maxDiffPixels?: number; maxDiffPixelRatio?: number; diffPath?: string } = {
    threshold: visualCheck.threshold ?? 0.1,
    diffPath: diffImagePath
  }
  if (typeof visualCheck.maxDiffPixels === 'number') compareOptions.maxDiffPixels = visualCheck.maxDiffPixels
  if (typeof visualCheck.maxDiffPixelRatio === 'number') compareOptions.maxDiffPixelRatio = visualCheck.maxDiffPixelRatio
  const result = await comparePng(visualCheck.expectedPath, actualImagePath, compareOptions)
  if (!result.passed) {
    findings.push({
      gate: 'browser-visual',
      passed: false,
      severity: 'blocker',
      category: 'visual-diff',
      summary: `${visualCheck.name} visual diff exceeded threshold.`,
      evidence: result,
      repairHint: 'Review the diff image before updating the baseline.',
      artifacts: { actualImagePath, expectedImagePath: visualCheck.expectedPath, diffImagePath }
    })
  }
}

function resolveLocator(page: Page, locator: BrowserLocatorSpec): Locator {
  if (locator.kind === 'role') {
    const options: Parameters<Page['getByRole']>[1] = {}
    if (locator.name !== undefined) options.name = locator.name
    if (locator.exact !== undefined) options.exact = locator.exact
    return page.getByRole(locator.role as Parameters<Page['getByRole']>[0], options)
  }
  if (locator.kind === 'text') return page.getByText(locator.value ?? '', locatorExactOption(locator))
  if (locator.kind === 'label') return page.getByLabel(locator.value ?? '', locatorExactOption(locator))
  if (locator.kind === 'placeholder') return page.getByPlaceholder(locator.value ?? '', locatorExactOption(locator))
  if (locator.kind === 'altText') return page.getByAltText(locator.value ?? '', locatorExactOption(locator))
  if (locator.kind === 'title') return page.getByTitle(locator.value ?? '', locatorExactOption(locator))
  if (locator.kind === 'testId') return page.getByTestId(locator.value ?? '')
  return page.locator(locator.value ?? '')
}

function locatorExactOption(locator: BrowserLocatorSpec): { exact?: boolean } {
  const option: { exact?: boolean } = {}
  if (locator.exact !== undefined) option.exact = locator.exact
  return option
}

function safeArtifactName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, '-')
}

async function waitForReachable(baseUrl: string, timeoutMs: number): Promise<boolean> {
  const url = new URL(baseUrl)
  if (url.protocol === 'file:') return true
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return true

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl)
      if (response.status < 500) return true
    } catch {
      // Keep polling until the dev server is ready or the timeout expires.
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  return false
}

function buildEvidence(params: BrowserCheckParams, runId: string, headless: boolean, viewport: { width: number; height: number }, findings: BrowserFinding[], artifacts: BrowserArtifactRefs): BrowserEvidence {
  const hasBlocker = findings.some(finding => !finding.passed && finding.severity === 'blocker')
  return {
    framework: 'playwright',
    status: hasBlocker ? 'failed' : 'passed',
    runId,
    baseUrl: params.baseUrl,
    browser: 'chromium',
    headless,
    viewport,
    findings,
    ...(artifacts && Object.keys(artifacts).length > 0 ? { artifacts } : {})
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
