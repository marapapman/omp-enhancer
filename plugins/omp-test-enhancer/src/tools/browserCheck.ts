import { mkdir, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { chromium, type Locator, type Page } from 'playwright'
import { invalidBrowserCheckEvidence, parseBrowserCheckParams } from '../browserSchemas.js'
import { comparePng } from './imageDiff.js'
import { isRecord } from '../utils.js'
import type { BrowserArtifactRefs, BrowserEvidence, BrowserFinding, BrowserLocatorSpec, BrowserPlanStep, BrowserVisualCheck } from '../types.js'
import type { ExtensionToolContext } from '../ompApi.js'

export interface BrowserCheckParams {
  baseUrl: string
  targetIds?: string[]
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
    goal?: string
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

export interface BrowserExecutionCounts {
  scenarioCount: number
  stepCount: number
  captureCount: number
  visualAssertionCount: number
}

export async function executeBrowserCheck(input: unknown, ctx: ExtensionToolContext): Promise<BrowserEvidence> {
  const parsed = parseBrowserCheckParams(input)
  if (!parsed.ok) return invalidBrowserCheckEvidence(input, parsed.error)
  const params = parsed.value
  const cwd = typeof ctx.cwd === 'string' && ctx.cwd.trim() !== '' ? ctx.cwd : process.cwd()
  const runId = `browser-${Date.now().toString(36)}`
  const findings: BrowserFinding[] = []
  const artifacts: BrowserArtifactRefs = {}
  const executionCounts: BrowserExecutionCounts = { scenarioCount: 0, stepCount: 0, captureCount: 0, visualAssertionCount: 0 }
  const headless = params.setup?.headless ?? true
  const viewport = params.setup?.viewport ?? { width: 1280, height: 720 }
  const artifactDir = await resolveSafeBrowserArtifactDir(cwd, params.artifactDir, runId)
  if (!artifactDir) {
    findings.push({
      gate: 'browser-interaction',
      passed: false,
      severity: 'critical',
      category: 'setup',
      summary: 'Browser artifact directory escapes the trusted artifact root or crosses a symbolic link.',
      evidence: {},
      repairHint: 'Use the default artifact directory or a path under .omp/testing-enhancer-artifacts without symbolic links.'
    })
    return buildEvidence(params, runId, headless, viewport, findings, artifacts, executionCounts)
  }

  let server: ChildProcess | undefined
  let serverClosed = false
  let serverError: unknown
  let serverClosePromise: Promise<void> | undefined
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
      if (!isAllowedBrowserServerCommand(params.serverCommand)) {
        findings.push({
          gate: 'browser-interaction',
          passed: false,
          severity: 'critical',
          category: 'setup',
          summary: 'Browser serverCommand is not an allowed local package-manager dev-server command.',
          evidence: {},
          repairHint: 'Start the server separately or use npm, pnpm, yarn, or bun with start, dev, serve, or preview.'
        })
        return buildEvidence(params, runId, headless, viewport, findings, artifacts, executionCounts)
      }
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
          return buildEvidence(params, runId, headless, viewport, findings, artifacts, executionCounts)
        }
      }
    }

    const reachable = await waitForReachable(params.baseUrl, 30000)
    if (!reachable) {
      findings.push({
        gate: 'browser-interaction',
        passed: false,
        severity: 'critical',
        category: 'network-failure',
        summary: 'Browser base URL was not reachable.',
        evidence: { baseUrl: params.baseUrl },
        repairHint: 'Report that no reachable server was available; start one only when server execution is already in scope.'
      })
      return buildEvidence(params, runId, headless, viewport, findings, artifacts, executionCounts)
    }

    try {
      browser = await chromium.launch({ headless })
    } catch (error: unknown) {
      return {
        framework: 'playwright',
        status: 'skipped',
        runId,
        baseUrl: params.baseUrl,
        targetIds: params.targetIds ?? [],
        browser: 'chromium',
        ...executionCounts,
        findings: [{
          gate: 'browser-interaction',
          passed: false,
          severity: 'warning',
          category: 'setup',
          summary: 'Playwright Chromium could not be launched.',
          evidence: { message: error instanceof Error ? error.message : String(error) },
          repairHint: 'Report the missing Playwright browser; install it only when dependency installation is already in scope.'
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

    const scenarioExecution = await executeBrowserScenarios(page, params, artifactDir)
    findings.push(...scenarioExecution.findings)
    Object.assign(artifacts, scenarioExecution.artifacts)
    Object.assign(executionCounts, scenarioExecution.executionCounts)

    findings.push(...normalizeBrowserFindings({ consoleErrors, consoleWarnings, pageErrors, failedRequests, badResponses }))
    return buildEvidence(params, runId, headless, viewport, findings, artifacts, executionCounts)
  } finally {
    const hasCriticalFinding = findings.some(finding => !finding.passed && finding.severity === 'critical')
    if (context && tracingStarted) {
      if (hasCriticalFinding) {
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

export function isAllowedBrowserServerCommand(command: string): boolean {
  const source = String(command).trim()
  if (!source || /[;&|<>`]|\$\(|\r|\n/.test(source)) return false
  const [program, ...args] = splitCommandLine(source)
  if (!['npm', 'pnpm', 'yarn', 'bun'].includes(program ?? '')) return false
  const values = args.filter(arg => arg !== '--')
  if (program === 'npm') {
    if (values[0] === 'start') return true
    return values[0] === 'run' && /^(?:start|dev|serve|preview)$/.test(values[1] ?? '')
  }
  if (values[0] === 'run') return /^(?:start|dev|serve|preview)$/.test(values[1] ?? '')
  return /^(?:start|dev|serve|preview)$/.test(values[0] ?? '')
}

export async function resolveSafeBrowserArtifactDir(cwd: string, requested: string | undefined, runId: string): Promise<string | null> {
  try {
    const trustedCwd = await realpath(cwd)
    const root = join(trustedCwd, '.omp', 'testing-enhancer-artifacts')
    await mkdir(root, { recursive: true })
    const trustedRoot = await realpath(root)
    const candidate = requested ? resolve(trustedCwd, requested) : join(trustedRoot, runId)
    if (!pathIsWithin(trustedRoot, candidate)) return null

    let existingAncestor = candidate
    while (pathIsWithin(trustedRoot, existingAncestor)) {
      try {
        const resolvedAncestor = await realpath(existingAncestor)
        if (!pathIsWithin(trustedRoot, resolvedAncestor)) return null
        break
      } catch {
        if (existingAncestor === trustedRoot) return null
        existingAncestor = dirname(existingAncestor)
      }
    }

    await mkdir(candidate, { recursive: true })
    const resolved = await realpath(candidate)
    return pathIsWithin(trustedRoot, resolved) ? resolved : null
  } catch {
    return null
  }
}

function pathIsWithin(root: string, candidate: string): boolean {
  const fromRoot = relative(root, candidate)
  return fromRoot === '' || (!fromRoot.startsWith('..') && !isAbsolute(fromRoot))
}

function serverCommandFailureFinding(command: string, error: unknown): BrowserFinding {
  return {
    gate: 'browser-interaction',
    passed: false,
    severity: 'critical',
    category: 'setup',
    summary: 'Browser server command could not be started.',
    evidence: {
      command,
      message: error instanceof Error ? error.message : String(error)
    },
    repairHint: 'Report the server startup failure and correct it only when server execution is already in scope.'
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
    findings.push({ gate: 'browser-interaction', passed: false, severity: 'critical', category: 'console-error', summary: 'Browser console error was emitted.', evidence: item, repairHint: 'Fix the runtime error reported in the browser console.' })
  }
  for (const item of input.consoleWarnings) {
    findings.push({ gate: 'browser-interaction', passed: false, severity: 'warning', category: 'console-error', summary: 'Browser console warning was emitted.', evidence: item, repairHint: 'Review whether the warning indicates broken frontend behavior.' })
  }
  for (const item of input.pageErrors) {
    findings.push({ gate: 'browser-interaction', passed: false, severity: 'critical', category: 'page-error', summary: 'Browser page error was emitted.', evidence: item, repairHint: 'Fix the uncaught browser exception.' })
  }
  for (const item of input.failedRequests) {
    findings.push({ gate: 'browser-interaction', passed: false, severity: 'critical', category: 'network-failure', summary: 'Browser request failed.', evidence: item, repairHint: 'Fix or mock the failed network dependency through the tested public behavior.' })
  }
  for (const item of input.badResponses) {
    const status = isRecord(item) && typeof item.status === 'number' ? item.status : 0
    findings.push({
      gate: 'browser-interaction',
      passed: false,
      severity: status >= 500 ? 'critical' : 'warning',
      category: 'network-failure',
      summary: `Browser response returned HTTP ${status}.`,
      evidence: item,
      repairHint: 'Review the failed browser network response before accepting the test.'
    })
  }
  return findings
}

export async function executeBrowserScenarios(
  page: Page,
  params: BrowserCheckParams,
  artifactDir: string
): Promise<{ executionCounts: BrowserExecutionCounts; findings: BrowserFinding[]; artifacts: BrowserArtifactRefs }> {
  const findings: BrowserFinding[] = []
  const artifacts: BrowserArtifactRefs = {}
  const executionCounts: BrowserExecutionCounts = { scenarioCount: 0, stepCount: 0, captureCount: 0, visualAssertionCount: 0 }

  for (const [scenarioIndex, scenario] of params.scenarios.entries()) {
    let scenarioFailed = false
    if (scenario.steps[0]?.action !== 'goto') {
      try {
        await page.goto(params.baseUrl)
      } catch (error: unknown) {
        findings.push({
          gate: 'browser-interaction',
          passed: false,
          severity: 'critical',
          category: 'actionability',
          summary: `Browser scenario setup failed: ${scenario.name}`,
          evidence: { message: error instanceof Error ? error.message : String(error) },
          repairHint: 'Check the browser base URL and route setup before executing scenario steps.'
        })
        scenarioFailed = true
      }
    }
    for (const [stepIndex, step] of scenario.steps.entries()) {
      if (scenarioFailed) break
      try {
        await executeStep(page, step, params.baseUrl, artifactDir, scenario.name, artifacts, executionCounts)
        executionCounts.stepCount += 1
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        const failurePath = join(artifactDir, `failure-${scenarioIndex}-${stepIndex}.png`)
        await page.screenshot({ path: failurePath, fullPage: true }).catch(() => undefined)
        if (!artifacts.actualImagePath) artifacts.actualImagePath = failurePath
        findings.push({
          gate: 'browser-interaction',
          passed: false,
          severity: 'critical',
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
        try {
          await executeVisualCheck(page, visualCheck, artifactDir, findings, artifacts, executionCounts)
        } catch (error: unknown) {
          findings.push({
            gate: 'browser-visual',
            passed: false,
            severity: 'critical',
            category: 'setup',
            summary: `Browser visual check failed: ${visualCheck.name}`,
            evidence: { message: error instanceof Error ? error.message : String(error) },
            repairHint: 'Check the visual locator, expected baseline path, and image format.'
          })
          scenarioFailed = true
          break
        }
      }
    }
    if (!scenarioFailed) executionCounts.scenarioCount += 1
  }

  return { executionCounts, findings, artifacts }
}

async function executeStep(
  page: Page,
  step: BrowserPlanStep,
  baseUrl: string,
  artifactDir: string,
  scenarioName: string,
  artifacts: BrowserArtifactRefs,
  executionCounts: BrowserExecutionCounts
): Promise<void> {
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
    executionCounts.captureCount += 1
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
  if (!['click', 'fill', 'press', 'hover', 'check', 'select', 'assertVisible'].includes(step.action)) {
    throw new Error(`Unsupported browser action: ${String(step.action)}`)
  }
}

async function executeVisualCheck(
  page: Page,
  visualCheck: BrowserVisualCheck,
  artifactDir: string,
  findings: BrowserFinding[],
  artifacts: BrowserArtifactRefs,
  executionCounts: BrowserExecutionCounts
): Promise<void> {
  const actualImagePath = join(artifactDir, `${safeArtifactName(visualCheck.name)}.actual.png`)
  const locator = visualCheck.locator ? resolveLocator(page, visualCheck.locator) : undefined
  if (visualCheck.kind === 'locator' && locator) await locator.screenshot({ path: actualImagePath })
  else await page.screenshot({ path: actualImagePath, fullPage: true })
  if (!artifacts.actualImagePath) artifacts.actualImagePath = actualImagePath
  executionCounts.captureCount += 1

  if (!visualCheck.expectedPath) return

  const diffImagePath = join(artifactDir, `${safeArtifactName(visualCheck.name)}.diff.png`)
  const compareOptions: { threshold: number; maxDiffPixels?: number; maxDiffPixelRatio?: number; diffPath?: string } = {
    threshold: visualCheck.threshold ?? 0.1,
    diffPath: diffImagePath
  }
  if (typeof visualCheck.maxDiffPixels === 'number') compareOptions.maxDiffPixels = visualCheck.maxDiffPixels
  if (typeof visualCheck.maxDiffPixelRatio === 'number') compareOptions.maxDiffPixelRatio = visualCheck.maxDiffPixelRatio
  const result = await comparePng(visualCheck.expectedPath, actualImagePath, compareOptions)
  executionCounts.visualAssertionCount += 1
  if (!result.passed) {
    findings.push({
      gate: 'browser-visual',
      passed: false,
      severity: 'critical',
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
  if (locator.kind === 'css') return page.locator(locator.value ?? '')
  throw new Error(`Unsupported browser locator kind: ${String(locator.kind)}`)
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

function buildEvidence(
  params: BrowserCheckParams,
  runId: string,
  headless: boolean,
  viewport: { width: number; height: number },
  findings: BrowserFinding[],
  artifacts: BrowserArtifactRefs,
  executionCounts: BrowserExecutionCounts
): BrowserEvidence {
  const hasCriticalFinding = findings.some(finding => !finding.passed && finding.severity === 'critical')
  const hasRequiredInteractionExecution = executionCounts.scenarioCount > 0 && executionCounts.stepCount > 0
  return {
    framework: 'playwright',
    status: hasCriticalFinding || !hasRequiredInteractionExecution ? 'failed' : 'passed',
    runId,
    baseUrl: params.baseUrl,
    targetIds: params.targetIds ?? [],
    browser: 'chromium',
    headless,
    viewport,
    ...executionCounts,
    findings,
    ...(artifacts && Object.keys(artifacts).length > 0 ? { artifacts } : {})
  }
}
