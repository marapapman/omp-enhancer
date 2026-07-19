import { createHash, randomUUID } from 'node:crypto'
import {
  browserCheckExecutionFailureEvidence,
  invalidBrowserCheckEvidence,
  parseBrowserCheckParams,
  readBrowserEvidenceValue
} from '../browserSchemas.js'
import { evaluateBrowserEvidenceGate } from '../gates/browserEvidenceGate.js'
import { evaluateIndirectTestGate } from '../gates/indirectTestGate.js'
import { evaluateTestCommandGate, type TestCommandResult } from '../gates/testCommandGate.js'
import { evaluateTestFileScopeGate } from '../gates/testFileScopeGate.js'
import { readTestingEnhancerConfig, type TestingEnhancerConfig } from '../config/testingConfig.js'
import { findPublicEntryHints, findRelatedTests, readRepoFiles } from '../repo/repoScanner.js'
import { isRecord } from '../utils.js'
import type { BrowserCheckParams } from './browserCheck.js'
import type { ObservedTestCommandEvidence } from '../session/testingState.js'
import type { AgentToolResult, ExtensionToolContext, ToolDefinition } from '../ompApi.js'
import type { ApiPlan, BrowserEvidence, BrowserPlan, CandidateFileChange, CandidateTest, ChangedTarget, CoverageAnalysis, CoverageGap, GateResult, MutationAnalysis, MutationSurvivor, PropertyPlan, RiskLevel, TargetKind } from '../types.js'

interface ChangedFileInput {
  path: string
  content: string
}

export type AnalyzeNextTool = 'omp_test_context' | 'omp_test_browser_check' | 'omp_test_coverage_analyze' | 'omp_test_mutation_context' | 'omp_test_review' | 'omp_test_report'

export interface AnalyzeOutput {
  runId: string
  targets: ChangedTarget[]
  warnings: string[]
  nextTools: AnalyzeNextTool[]
}

export interface ContextOutput {
  targetId: string
  testingStyle: 'direct' | 'indirect'
  guidance: string
  preferredAssertions: string[]
  existingTests: string[]
  publicEntryHints: string[]
  browserPlan?: BrowserPlan
  propertyPlan?: PropertyPlan
  apiPlan?: ApiPlan
}

export interface ReviewOutput {
  passed: boolean
  status: 'ready' | 'findings'
  advisory: true
  criticalFindings: GateResult['gate'][]
  results: GateResult[]
}

export interface ReportOutput {
  markdown: string
}

export interface TestingToolCallbacks {
  onAnalyze?(output: AnalyzeOutput, ctx: ExtensionToolContext): Promise<void> | void
  onBrowserCheck?(output: BrowserEvidence, ctx: ExtensionToolContext): Promise<void> | void
  onReview?(output: ReviewOutput, ctx: ExtensionToolContext): Promise<void> | void
  getRecentReviewResults?(): GateResult[]
  getObservedTestCommandEvidence?(): ObservedTestCommandEvidence | undefined
  getObservedBrowserEvidence?(ctx: ExtensionToolContext): BrowserEvidence | undefined
  runBrowserCheck?(params: BrowserCheckParams, ctx: ExtensionToolContext): Promise<BrowserEvidence>
}

interface ZodLike {
  object(shape: Record<string, unknown>): unknown
  string(): unknown
  boolean(): unknown
  unknown(): unknown
  array(schema: unknown): unknown
  enum(values: readonly [string, ...string[]]): unknown
  optional(schema: unknown): unknown
}

interface AnalyzeParams {
  files?: string[]
  changedFiles?: Array<{ path: string; content: string }>
}

interface ContextParams {
  target: ChangedTarget
}
interface ReviewParams {
  targets: ChangedTarget[]
  candidate: CandidateTest
  testCommand?: string
}

interface ReviewSeverityConfig {
  indirectTest: GateResult['severity']
  productionEdits: GateResult['severity']
  testCommand: GateResult['severity']
  browserEvidence: GateResult['severity']
}

interface RunTestReviewOptions {
  reviewSeverities?: Partial<ReviewSeverityConfig>
}

interface CoverageParams {
  coverageReport?: unknown
  reportPath?: string
}

interface MutationParams {
  mutationReport?: unknown
  reportPath?: string
}

interface ReportParams {
  reviewResults?: GateResult[]
  runId?: string
}

interface PropertyRetrievalSource {
  path: string
  reason: string
  content: string
}

interface PropertyExperienceEntry {
  name: string
  assertion: string
  repairHint: string
  match: string[]
  kind?: TargetKind
  sourcePath: string
}

interface PropertyRetrievalContext {
  sources: PropertyRetrievalSource[]
  experienceEntries: PropertyExperienceEntry[]
}

type PropertyItem = PropertyPlan['properties'][number]

const PROPERTY_TARGET_KINDS: TargetKind[] = ['pure-function', 'validator', 'parser', 'formatter']
const PROPERTY_EXPERIENCE_PATHS = [
  '.omp/testing-enhancer/property-examples.json',
  '.omp/testing-enhancer-properties.json',
  '.omp/testing-properties.json'
]
const PROPERTY_GREP_PATTERN = 'fast-check|fc\\.property|fc\\.assert|property\\(|round[ -]?trip|idempotent|invariant|Object\\.freeze|toThrow|malformed|invalid|boundary|edge case'

export function createTestingEnhancerTools(z: ZodLike, callbacks: TestingToolCallbacks = {}): ToolDefinition[] {
  const changedFileSchema = z.object({ path: z.string(), content: z.string() })
  const targetSchema = z.unknown()
  const candidateSchema = z.unknown()
  const gateResultSchema = z.unknown()

  return [
    {
      name: 'omp_test_analyze',
      label: 'Analyze test targets',
      description: '分析改动并找出需要补测的目标',
      defaultInactive: true,
      approval: 'read',
      parameters: z.object({
        files: z.optional(z.array(z.string())),
        changedFiles: z.optional(z.array(changedFileSchema))
      }),
      execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
        const output = await executeAnalyze(params as AnalyzeParams, ctx)
        await callbacks.onAnalyze?.(output, ctx)
        return textResult(output.targets.length === 1 ? 'Found 1 test target.' : `Found ${output.targets.length} test targets.`, output)
      }
    },
    {
      name: 'omp_test_context',
      label: 'Build test context',
      description: '读取目标相关的公开入口和现有测试上下文',
      defaultInactive: true,
      approval: 'read',
      parameters: z.object({ target: targetSchema }),
      execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
        const output = await executeContext(params as ContextParams, ctx)
        return textResult(`Testing style: ${output.testingStyle}.`, output)
      }
    },
    {
      name: 'omp_test_browser_check',
      label: 'Run browser check',
      description: '打开浏览器执行前端用户事件、视觉检查和操作错误采集',
      defaultInactive: true,
      approval: 'exec',
      parameters: z.object({
        baseUrl: z.string(),
        serverCommand: z.optional(z.string()),
        artifactDir: z.optional(z.string()),
        targetIds: z.optional(z.array(z.string())),
        setup: z.optional(z.unknown()),
        scenarios: z.array(z.unknown())
      }),
      execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
        const parsed = parseBrowserCheckParams(params)
        let output: BrowserEvidence
        if (!parsed.ok) {
          output = invalidBrowserCheckEvidence(params, parsed.error)
        } else {
          try {
            const rawOutput = await (callbacks.runBrowserCheck ?? runDefaultBrowserCheck)(parsed.value, ctx)
            output = readBrowserEvidenceValue(rawOutput)
              ?? invalidBrowserCheckEvidence(params, { path: '$.result', message: 'Browser runner returned malformed evidence.' })
          } catch (error: unknown) {
            output = browserCheckExecutionFailureEvidence(parsed.value, error)
          }
        }
        await callbacks.onBrowserCheck?.(output, ctx)
        return textResult(output.status === 'passed' ? 'Browser check passed.' : output.status === 'skipped' ? 'Browser check skipped.' : 'Browser check failed.', output)
      }
    },
    {
      name: 'omp_test_coverage_analyze',
      label: 'Analyze coverage gaps',
      description: '读取覆盖率报告并找出未覆盖的行、分支和函数',
      defaultInactive: true,
      approval: 'read',
      parameters: z.object({
        coverageReport: z.optional(z.unknown()),
        reportPath: z.optional(z.string())
      }),
      execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
        const output = await executeCoverageAnalyze(params as CoverageParams, ctx)
        return textResult(output.status === 'available' ? `Found ${output.gaps.length} coverage gaps.` : 'No coverage report found.', output)
      }
    },
    {
      name: 'omp_test_mutation_context',
      label: 'Analyze mutation survivors',
      description: '读取 mutation 报告并把 surviving mutants 转成补测建议',
      defaultInactive: true,
      approval: 'read',
      parameters: z.object({
        mutationReport: z.optional(z.unknown()),
        reportPath: z.optional(z.string())
      }),
      execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
        const output = await executeMutationAnalyze(params as MutationParams, ctx)
        return textResult(output.status === 'available' ? `Found ${output.survivedMutants.length} mutation survivors.` : 'No mutation report found.', output)
      }
    },
    {
      name: 'omp_test_review',
      label: 'Review test evidence',
      description: '只读汇总当前 task context 中宿主已观察到的测试和浏览器证据；不会执行命令、阻止会话或触发修复',
      defaultInactive: true,
      approval: 'read',
      parameters: z.object({
        targets: z.array(targetSchema),
        candidate: candidateSchema,
        testCommand: z.optional(z.string())
      }),
      execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
        const observedBrowserEvidence = callbacks.getObservedBrowserEvidence?.(ctx)
        const observedTestCommandEvidence = callbacks.getObservedTestCommandEvidence?.()
        const output = await executeReview(
          params as ReviewParams,
          ctx,
          observedTestCommandEvidence,
          observedBrowserEvidence
        )
        await callbacks.onReview?.(output, ctx)
        return textResult(output.passed ? 'Test review is ready.' : 'Test review found critical findings.', output)
      }
    },
    {
      name: 'omp_test_report',
      label: 'Build test report',
      description: '生成测试增强报告',
      defaultInactive: true,
      approval: 'read',
      parameters: z.object({
        reviewResults: z.optional(z.array(gateResultSchema)),
        runId: z.optional(z.string())
      }),
      execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
        const reportParams = params as ReportParams
        const explicitResults = Array.isArray(reportParams.reviewResults) ? reportParams.reviewResults : undefined
        const stateResults = explicitResults ?? callbacks.getRecentReviewResults?.()

        if (!stateResults || stateResults.length === 0) {
          return textResult('No test review result found.', { found: false })
        }

        const output = buildTestReport({ reviewResults: stateResults })
        return textResult(output.markdown, output)
      }
    }
  ]
}

async function runDefaultBrowserCheck(params: BrowserCheckParams, ctx: ExtensionToolContext): Promise<BrowserEvidence> {
  // Dynamic import is required here because browserCheck imports Playwright, an optional browser-only runtime dependency.
  // Loading it statically makes the whole testing enhancer fail to register when Playwright is not installed.
  try {
    const { executeBrowserCheck } = await import('./browserCheck.js')
    return executeBrowserCheck(params, ctx)
  } catch (error: unknown) {
    return {
      framework: 'playwright',
      status: 'skipped',
      runId: 'browser-check-unavailable',
      baseUrl: params.baseUrl,
      targetIds: params.targetIds ?? [],
      browser: 'chromium',
      scenarioCount: 0,
      stepCount: 0,
      captureCount: 0,
      visualAssertionCount: 0,
      findings: [{
        gate: 'browser-interaction',
        passed: false,
        severity: 'warning',
        category: 'setup',
        summary: 'Playwright is not installed.',
        evidence: { message: error instanceof Error ? error.message : String(error) },
        repairHint: 'Report missing Playwright as a coverage limitation; install it only when dependency installation is already in scope.'
      }]
    }
  }
}

export function analyzeTestTargets(input: unknown): AnalyzeOutput {
  const changedFiles = readChangedFiles(input)
  const targets = classifyChangedFiles(changedFiles)

  return {
    runId: 'local-analysis',
    targets,
    warnings: [],
    nextTools: ['omp_test_context', 'omp_test_browser_check', 'omp_test_coverage_analyze', 'omp_test_mutation_context', 'omp_test_review', 'omp_test_report']
  }
}

export function buildTestContext(input: unknown): ContextOutput {
  const target = readTargetInput(input)
  return buildContextForTarget(target, target.relatedTests ?? [], target.publicEntryHints ?? [])
}

export function analyzeCoverageReport(input: unknown): CoverageAnalysis {
  const params = readCoverageParams(input)
  if (!params.coverageReport) return { status: 'missing-report', gaps: [] }
  return { status: 'available', gaps: collectCoverageGaps(params.coverageReport), ...(params.reportPath ? { reportPath: params.reportPath } : {}) }
}

export function analyzeMutationReport(input: unknown): MutationAnalysis {
  const params = readMutationParams(input)
  if (!params.mutationReport) return { status: 'missing-report', survivedMutants: [] }
  return { status: 'available', survivedMutants: collectMutationSurvivors(params.mutationReport), ...(params.reportPath ? { reportPath: params.reportPath } : {}) }
}

export function runTestReview(input: unknown, testCommandResult?: TestCommandResult, options: RunTestReviewOptions = {}): ReviewOutput {
  const candidate = readCandidate(input)
  const targets = readTargets(input)
  const severities = normalizeReviewSeverities(options.reviewSeverities)
  const browserTargets = targets.filter(requiresBrowserEvidence)
  const results = [
    ...evaluateTestFileScopeGate({ candidate, severity: severities.productionEdits }),
    ...evaluateIndirectTestGate({ candidate, targets, severity: severities.indirectTest }),
    ...evaluateBrowserEvidenceGate(readBrowserEvidence(input), {
      required: browserTargets.length > 0,
      severity: severities.browserEvidence,
      targetIds: browserTargets.map(target => target.id)
    }),
    ...evaluateTestCommandGate(testCommandResult, {
      severity: options.reviewSeverities?.testCommand ?? (testCommandResult ? 'critical' : 'warning')
    })
  ]

  return buildAdvisoryReviewOutput(results)
}

export function buildTestReport(input: unknown): ReportOutput {
  const reviewResults = readReviewResults(input)
  const criticalFindings = reviewResults.filter(result => !result.passed && result.severity === 'critical')
  const lines: string[] = [
    '# OMP Testing Enhancer report',
    '',
    'Mode: advisory-only',
    `Review: ${criticalFindings.length === 0 ? 'ready' : 'findings'}`,
    'Review effect: advisory guidance only',
    ''
  ]

  for (const result of reviewResults) {
    if (result.severity === 'warning') {
      lines.push(`* ${result.gate}: warning, ${result.summary}`)
      lines.push(...evidenceLines(result.evidence))
      continue
    }

    if (result.passed) {
      lines.push(`* ${result.gate}: passed`)
      continue
    }

    lines.push(`* ${result.gate}: critical finding, ${result.summary}`)
    if (result.repairHint) lines.push(`  * Repair: ${result.repairHint}`)
    lines.push(...evidenceLines(result.evidence))
  }

  return { markdown: lines.join('\n') }
}

function evidenceLines(evidence: unknown): string[] {
  if (!isRecord(evidence)) return []
  const lines: string[] = []
  if (typeof evidence.category === 'string') lines.push(`  * Evidence: ${evidence.category}`)
  if (isRecord(evidence.details)) {
    if (typeof evidence.details.diffRatio === 'number') lines.push(`  * Diff ratio: ${evidence.details.diffRatio}`)
    if (typeof evidence.details.threshold === 'number') lines.push(`  * Threshold: ${evidence.details.threshold}`)
    if (typeof evidence.details.message === 'string') lines.push(`  * Message: ${evidence.details.message}`)
  }
  if (isRecord(evidence.artifacts)) {
    for (const key of ['actualImagePath', 'expectedImagePath', 'diffImagePath', 'tracePath', 'videoPath', 'harPath']) {
      const value = evidence.artifacts[key]
      if (typeof value === 'string') lines.push(`  * Artifact ${key}: ${value}`)
    }
  }
  return lines
}

function contextCwd(ctx: ExtensionToolContext): string {
  return typeof ctx.cwd === 'string' && ctx.cwd.trim() !== '' ? ctx.cwd : process.cwd()
}

async function executeAnalyze(params: AnalyzeParams, ctx: ExtensionToolContext): Promise<AnalyzeOutput> {
  const cwd = contextCwd(ctx)
  const warnings: string[] = []
  let files: ChangedFileInput[] = []

  if (Array.isArray(params.changedFiles)) {
    files = params.changedFiles.filter(isChangedFileInput)
  } else if (Array.isArray(params.files)) {
    files = await readRepoFiles(cwd, params.files)
    if (params.files.length > 0 && files.length === 0) warnings.push('No readable changed files detected. Check that requested files are relative paths inside the repository.')
    if (files.length > 0 && files.length < params.files.length) warnings.push('Some requested files were skipped because they are missing or outside the repository.')
  } else {
    const changedPaths = await readGitChangedPaths(ctx)
    if (changedPaths.length === 0) warnings.push('No changed files detected. Pass explicit workspace-relative paths through omp_test_analyze.files.')
    files = await readRepoFiles(cwd, changedPaths)
  }

  const targets = await enrichTargets(cwd, classifyChangedFiles(files))

  return {
    runId: `test-${randomUUID()}`,
    targets,
    warnings,
    nextTools: ['omp_test_context', 'omp_test_browser_check', 'omp_test_coverage_analyze', 'omp_test_mutation_context', 'omp_test_review', 'omp_test_report']
  }
}

async function executeContext(params: ContextParams, ctx: ExtensionToolContext): Promise<ContextOutput> {
  const cwd = contextCwd(ctx)
  const target = readTarget(isRecord(params.target) ? params.target : {})
  const existingTests = target.relatedTests ?? await findRelatedTests(cwd, target.sourceFile)
  const publicEntryHints = target.publicEntryHints ?? await findPublicEntryHints(cwd, target.sourceFile, target.symbolName)
  const propertyContext = await collectPropertyRetrievalContext(ctx, target, existingTests)
  return buildContextForTarget(target, existingTests, publicEntryHints, propertyContext)
}

async function executeCoverageAnalyze(params: CoverageParams, ctx: ExtensionToolContext): Promise<CoverageAnalysis> {
  const report = params.coverageReport ?? await readJsonReport(contextCwd(ctx), params.reportPath)
  return analyzeCoverageReport({ coverageReport: report, reportPath: params.reportPath })
}

async function executeMutationAnalyze(params: MutationParams, ctx: ExtensionToolContext): Promise<MutationAnalysis> {
  const report = params.mutationReport ?? await readJsonReport(contextCwd(ctx), params.reportPath)
  return analyzeMutationReport({ mutationReport: report, reportPath: params.reportPath })
}

async function readJsonReport(cwd: string, reportPath: string | undefined): Promise<unknown> {
  if (!reportPath) return undefined
  try {
    const [file] = await readRepoFiles(cwd, [reportPath])
    if (!file) return undefined
    return JSON.parse(file.content) as unknown
  } catch {
    return undefined
  }
}

async function executeReview(
  params: ReviewParams,
  ctx: ExtensionToolContext,
  observedTestCommand?: ObservedTestCommandEvidence,
  observedBrowserEvidence?: BrowserEvidence
): Promise<ReviewOutput> {
  const config = await readTestingEnhancerConfig(contextCwd(ctx))
  const severities = reviewSeveritiesFromConfig(config)
  const candidate = await readCandidateForReview(params, ctx)
  const targets = readTargets(params)
  const browserTargets = targets.filter(requiresBrowserEvidence)
  const staticResults = [
    ...evaluateTestFileScopeGate({ candidate, severity: severities.productionEdits }),
    ...evaluateIndirectTestGate({ candidate, targets, severity: severities.indirectTest })
  ]
  const browserResults = evaluateBrowserEvidenceGate(observedBrowserEvidence, {
    required: browserTargets.length > 0,
    severity: severities.browserEvidence,
    targetIds: browserTargets.map(target => target.id)
  })
  const configuredCommand = normalizeCommand(config?.test.command)
  const suppliedCommand = normalizeCommand(params.testCommand)
  const expectedCommand = configuredCommand ?? suppliedCommand
  const hasCommandConflict = Boolean(
    configuredCommand && suppliedCommand && digestCommand(configuredCommand) !== digestCommand(suppliedCommand)
  )
  const commandResult = !hasCommandConflict
    ? observedTestCommandResult(observedTestCommand, expectedCommand)
    : undefined
  const commandSeverity = expectedCommand || observedTestCommand || config ? severities.testCommand : 'warning'
  const commandResults = hasCommandConflict && configuredCommand && suppliedCommand
    ? [configuredCommandConflictResult(configuredCommand, suppliedCommand, commandSeverity)]
    : evaluateTestCommandGate(commandResult, {
        severity: commandSeverity
      })
  const results = [
    ...staticResults,
    ...browserResults,
    ...commandResults
  ]

  return buildAdvisoryReviewOutput(results)
}

function buildAdvisoryReviewOutput(results: GateResult[]): ReviewOutput {
  const criticalFindings = [...new Set(results
    .filter(result => !result.passed && result.severity === 'critical')
    .map(result => result.gate))]
  return {
    passed: criticalFindings.length === 0,
    status: criticalFindings.length === 0 ? 'ready' : 'findings',
    advisory: true,
    criticalFindings,
    results
  }
}

async function readCandidateForReview(params: ReviewParams, ctx: ExtensionToolContext): Promise<CandidateTest> {
  const candidate = readCandidate(params)
  if (!ctx.exec) return candidate

  const changedTestPaths = (await readGitChangedPaths(ctx)).filter(isTestFilePath)
  const candidatePaths = candidate.files.map(file => file.path)
  const paths = uniqueStrings([...candidatePaths, ...changedTestPaths])
  if (paths.length === 0) return candidate

  const workspaceFiles = await readRepoFiles(contextCwd(ctx), paths)
  const workspaceByPath = new Map(workspaceFiles.map(file => [file.path, file.content]))
  const fallbackByPath = new Map(candidate.files.map(file => [file.path, file]))

  return {
    ...candidate,
    files: paths.map(path => {
      const fallback = fallbackByPath.get(path)
      const content = workspaceByPath.get(path)
      if (content === undefined) {
        return {
          path,
          action: fallback?.action ?? 'modify',
          content: fallback?.content ?? '',
          missingFromWorkspace: true
        }
      }

      return {
        path,
        action: fallback?.action ?? 'modify',
        content
      }
    })
  }
}

function reviewSeveritiesFromConfig(config: TestingEnhancerConfig | undefined): ReviewSeverityConfig {
  if (!config) {
    return normalizeReviewSeverities({ testCommand: 'warning' })
  }

  return normalizeReviewSeverities({
    indirectTest: config.review.indirectTest,
    productionEdits: config.review.productionEdits,
    testCommand: config.review.testCommand,
    browserEvidence: config.review.browserEvidence
  })
}

function normalizeReviewSeverities(config: Partial<ReviewSeverityConfig> = {}): ReviewSeverityConfig {
  return {
    indirectTest: config.indirectTest ?? 'critical',
    productionEdits: config.productionEdits ?? 'critical',
    testCommand: config.testCommand ?? 'critical',
    browserEvidence: config.browserEvidence ?? 'critical'
  }
}

async function enrichTargets(cwd: string, targets: ChangedTarget[]): Promise<ChangedTarget[]> {
  const enriched: ChangedTarget[] = []

  for (const target of targets) {
    enriched.push({
      ...target,
      relatedTests: await findRelatedTests(cwd, target.sourceFile),
      publicEntryHints: await findPublicEntryHints(cwd, target.sourceFile, target.symbolName)
    })
  }

  return enriched
}

async function readGitChangedPaths(ctx: ExtensionToolContext): Promise<string[]> {
  if (!ctx.exec) return []

  return uniqueStrings([
    ...await readGitPathList(ctx, ['diff', '--name-only', 'HEAD']),
    ...await readGitPathList(ctx, ['ls-files', '--others', '--exclude-standard'])
  ])
}

async function readGitPathList(ctx: ExtensionToolContext, args: string[]): Promise<string[]> {
  if (!ctx.exec) return []

  try {
    const result = await ctx.exec('git', args, { cwd: contextCwd(ctx), timeout: 10000 })
    if (result.exitCode !== 0) return []
    return result.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  } catch {
    return []
  }
}

function observedTestCommandResult(evidence: ObservedTestCommandEvidence | undefined, expectedCommand?: string): TestCommandResult | undefined {
  if (!evidence) return undefined
  if (expectedCommand && digestCommand(expectedCommand) !== evidence.commandDigest) return undefined
  return {
    command: `host-observed:sha256:${evidence.commandDigest.slice(0, 16)}`,
    exitCode: evidence.exitCode,
    stdout: '',
    stderr: ''
  }
}

function configuredCommandConflictResult(configuredCommand: string, suppliedCommand: string, severity: GateResult['severity']): GateResult {
  return {
    gate: 'test-command',
    passed: false,
    severity,
    summary: 'Tool testCommand conflicts with the project-configured test command.',
    evidence: {
      configuredCommandDigest: digestCommand(configuredCommand),
      suppliedCommandDigest: digestCommand(suppliedCommand)
    },
    repairHint: 'Remove the tool-level testCommand override and use the command configured in .omp/testing-enhancer.yml.'
  }
}

function normalizeCommand(command: string | undefined): string | undefined {
  const normalized = String(command ?? '').trim()
  return normalized || undefined
}

function digestCommand(command: string): string {
  return createHash('sha256').update(String(command).trim()).digest('hex')
}

function buildContextForTarget(target: ChangedTarget, existingTests: string[], publicEntryHints: string[], propertyContext?: PropertyRetrievalContext): ContextOutput {
  const indirectKinds: TargetKind[] = ['api-client', 'api-provider', 'service', 'repository', 'react-component', 'cli', 'unknown']
  const testingStyle = indirectKinds.includes(target.kind) ? 'indirect' : 'direct'
  const browserPlan = buildBrowserPlanForTarget(target, existingTests)
  const propertyPlan = buildPropertyPlanForTarget(target, propertyContext)
  const apiPlan = buildApiPlanForTarget(target, publicEntryHints)

  if (testingStyle === 'direct') {
    const output: ContextOutput = {
      targetId: target.id,
      testingStyle,
      guidance: 'Test the exported function directly with edge cases and error paths.',
      preferredAssertions: ['return value', 'thrown error', 'input invariant', ...(propertyPlan ? ['property invariant'] : [])],
      existingTests,
      publicEntryHints
    }
    if (browserPlan) output.browserPlan = browserPlan
    if (propertyPlan) output.propertyPlan = propertyPlan
    if (apiPlan) output.apiPlan = apiPlan
    return output
  }

  const preferredAssertions = ['public behavior', 'observable output', 'state change through public API']
  if (browserPlan) preferredAssertions.push('visible UI output', 'role/name', 'user event result', 'browser error absence')

  const output: ContextOutput = {
    targetId: target.id,
    testingStyle,
    guidance: 'Test through public behavior. Use a route, service method, UI output, CLI output, or persisted result instead of private implementation details.',
    preferredAssertions,
    existingTests,
    publicEntryHints
  }
  if (browserPlan) output.browserPlan = browserPlan
  if (propertyPlan) {
    output.propertyPlan = propertyPlan
    output.preferredAssertions.push('property invariant')
  }
  if (apiPlan) {
    output.apiPlan = apiPlan
    output.preferredAssertions.push('HTTP status', 'response body', 'contract fields')
  }
  return output
}
function buildPropertyPlanForTarget(target: ChangedTarget, propertyContext?: PropertyRetrievalContext): PropertyPlan | undefined {
  if (!PROPERTY_TARGET_KINDS.includes(target.kind)) return undefined

  const properties: PropertyItem[] = [
    {
      name: 'input invariant',
      assertion: 'Generated valid inputs keep the documented invariant true.',
      repairHint: 'Use generated inputs for normal, boundary, empty, and malformed values; assert the public result, not internal branches.'
    }
  ]

  if (target.kind === 'pure-function') {
    properties.push({
      name: 'range bound',
      assertion: 'Generated numeric and boundary inputs keep the result inside the allowed range.',
      repairHint: 'Generate values around min, max, and outside the range; assert the result never leaves the allowed range.'
    })
  }

  if (target.kind === 'parser' || target.kind === 'formatter') {
    properties.push({
      name: 'round trip',
      assertion: 'Parsing and formatting preserve the semantic value for generated examples.',
      repairHint: 'Generate valid values, format them, parse the output, and assert semantic equality.'
    })
  }

  if (target.kind === 'validator') {
    properties.push({
      name: 'reject invalid input',
      assertion: 'Generated invalid inputs are rejected with public errors or false results.',
      repairHint: 'Generate missing fields, wrong types, empty strings, and boundary values; assert the public validation result.'
    })
  }

  if (propertyContext) {
    properties.push(...deriveRetrievedProperties(target, propertyContext))
  }

  const plan: PropertyPlan = {
    frameworkSuggestion: 'fast-check',
    properties: dedupePropertyItems(properties)
  }

  if (propertyContext) {
    plan.retrieval = {
      strategy: 'local-similar-code-and-tests',
      sources: summarizePropertySources(propertyContext.sources, propertyContext.experienceEntries),
      webSearchQueries: buildPropertyWebSearchQueries(target)
    }
  }

  return plan
}

async function collectPropertyRetrievalContext(ctx: ExtensionToolContext, target: ChangedTarget, existingTests: string[]): Promise<PropertyRetrievalContext | undefined> {
  if (!PROPERTY_TARGET_KINDS.includes(target.kind)) return undefined

  const directPaths = uniqueStrings([target.sourceFile, ...existingTests, ...PROPERTY_EXPERIENCE_PATHS])
  const directPathSet = new Set(directPaths)
  const similarPaths = await findLocalPropertySearchPaths(ctx, target, directPathSet)
  const files = await readRepoFiles(contextCwd(ctx), uniqueStrings([...directPaths, ...similarPaths]))
  const experiencePathSet = new Set(PROPERTY_EXPERIENCE_PATHS)
  const experienceEntries = files.flatMap(file => experiencePathSet.has(file.path) ? parsePropertyExperienceEntries(file) : [])
  const similarPathSet = new Set(similarPaths)
  const sources = files
    .filter(file => !experiencePathSet.has(file.path))
    .map(file => ({
      path: file.path,
      content: file.content,
      reason: propertySourceReason(target, existingTests, similarPathSet, file.path)
    }))

  return { sources, experienceEntries }
}

async function findLocalPropertySearchPaths(ctx: ExtensionToolContext, target: ChangedTarget, directPathSet: Set<string>): Promise<string[]> {
  if (!ctx.exec) return []

  const grepPaths = await readGitPropertyGrepPaths(ctx)
  const trackedPaths = await readGitPathList(ctx, ['ls-files'])
  const scoredPaths = scoreSimilarPropertyPaths(trackedPaths, target)

  return uniqueStrings([...grepPaths, ...scoredPaths])
    .filter(path => !directPathSet.has(path))
    .filter(isPropertyReadablePath)
    .slice(0, 16)
}

async function readGitPropertyGrepPaths(ctx: ExtensionToolContext): Promise<string[]> {
  if (!ctx.exec) return []

  try {
    const result = await ctx.exec('git', [
      'grep',
      '-l',
      '-E',
      PROPERTY_GREP_PATTERN,
      '--',
      '*.ts',
      '*.tsx',
      '*.js',
      '*.jsx',
      '*.mjs',
      '*.cjs'
    ], { cwd: contextCwd(ctx), timeout: 10000 })
    if (result.exitCode !== 0) return []
    return result.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  } catch {
    return []
  }
}

function scoreSimilarPropertyPaths(paths: string[], target: ChangedTarget): string[] {
  const tokens = propertyTokenCandidates(target)
  const kindTerms = propertyKindTerms(target.kind)

  return paths
    .map(path => ({ path, score: scoreSimilarPropertyPath(path, tokens, kindTerms) }))
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .map(item => item.path)
}

function scoreSimilarPropertyPath(path: string, tokens: string[], kindTerms: string[]): number {
  if (!isPropertyReadablePath(path)) return 0

  const lowerPath = path.toLowerCase()
  let score = 0
  if (isTestFilePath(path)) score += 2
  if (/property|fast-check|invariant|fuzz/i.test(path)) score += 3

  for (const token of tokens) {
    if (lowerPath.includes(token)) score += 2
  }
  for (const term of kindTerms) {
    if (lowerPath.includes(term)) score += 1
  }

  return score
}

function propertyTokenCandidates(target: ChangedTarget): string[] {
  const fileName = target.sourceFile.split('/').at(-1)?.replace(/\.[^.]+$/, '') ?? ''
  return uniqueStrings([
    ...splitIdentifier(target.symbolName),
    ...splitIdentifier(fileName),
    ...target.sourceFile.split(/[/.\\_-]+/).map(part => part.toLowerCase())
  ]).filter(token => token.length > 2)
}

function splitIdentifier(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .map(part => part.toLowerCase())
    .filter(Boolean)
}

function propertyKindTerms(kind: TargetKind): string[] {
  if (kind === 'parser') return ['parse', 'parser', 'roundtrip', 'round-trip']
  if (kind === 'formatter') return ['format', 'formatter', 'roundtrip', 'round-trip']
  if (kind === 'validator') return ['validate', 'validator', 'schema', 'invalid']
  if (kind === 'pure-function') return ['property', 'invariant', 'boundary', 'range']
  return []
}

function isPropertyReadablePath(path: string): boolean {
  if (!/\.[cm]?[tj]sx?$/.test(path)) return false
  return !/(^|\/)(dist|build|coverage|node_modules|vendor|\.git)\//.test(path)
}

function propertySourceReason(target: ChangedTarget, existingTests: string[], similarPathSet: Set<string>, path: string): string {
  if (path === target.sourceFile) return 'target source for invariant signals'
  if (existingTests.includes(path)) return 'existing related test'
  if (similarPathSet.has(path) && isTestFilePath(path)) return 'local similar test with property signals'
  if (similarPathSet.has(path)) return 'local similar implementation'
  if (isTestFilePath(path)) return 'local test context'
  return 'local code context'
}

function parsePropertyExperienceEntries(file: { path: string; content: string }): PropertyExperienceEntry[] {
  try {
    const parsed = JSON.parse(file.content) as unknown
    const values = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.properties) ? parsed.properties : []
    return values.map(value => readPropertyExperienceEntry(value, file.path)).filter((value): value is PropertyExperienceEntry => Boolean(value))
  } catch {
    return []
  }
}

function readPropertyExperienceEntry(value: unknown, sourcePath: string): PropertyExperienceEntry | undefined {
  if (!isRecord(value)) return undefined
  if (typeof value.name !== 'string') return undefined
  if (typeof value.assertion !== 'string') return undefined
  if (typeof value.repairHint !== 'string') return undefined

  const match = readStringList(value.match)
  const entry: PropertyExperienceEntry = {
    name: value.name,
    assertion: value.assertion,
    repairHint: value.repairHint,
    match,
    sourcePath
  }

  if (typeof value.kind === 'string') {
    const kind = readTargetKind(value.kind)
    if (kind !== 'unknown' || value.kind === 'unknown') entry.kind = kind
  }

  return entry
}

function readStringList(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function deriveRetrievedProperties(target: ChangedTarget, propertyContext: PropertyRetrievalContext): PropertyItem[] {
  const properties: PropertyItem[] = []
  const haystack = propertyRetrievalHaystack(target, propertyContext)

  for (const entry of propertyContext.experienceEntries) {
    if (!matchesPropertyExperienceEntry(target, haystack, entry)) continue
    properties.push(propertyItem(entry.name, entry.assertion, entry.repairHint, [entry.sourcePath]))
  }

  addPatternProperty(properties, propertyContext.sources, /fast-check|fc\.property|fc\.assert|fc\.anything|fc\.record|fc\.array/i, {
    name: 'retrieved generator model',
    assertion: 'Generated inputs should reuse the closest existing generator or model pattern from local property tests.',
    repairHint: 'Adapt the retrieved fast-check arbitraries first, then specialize them for the changed public behavior.'
  })
  addPatternProperty(properties, propertyContext.sources, /round[ -]?trip|parse\w*\s*\([^)]*format|format\w*\s*\([^)]*parse/i, {
    name: 'retrieved round trip',
    assertion: 'Generated values should survive the same encode/decode or parse/format cycle used by similar code.',
    repairHint: 'Generate valid public values, pass them through both directions, and assert semantic equality instead of string identity when formatting is lossy.'
  })
  addPatternProperty(properties, propertyContext.sources, /idempot|normalize\w*\s*\([^)]*normalize|format\w*\s*\([^)]*format|sanitize\w*\s*\([^)]*sanitize/i, {
    name: 'retrieved idempotence',
    assertion: 'Applying the public operation twice should not change the result after the first application.',
    repairHint: 'Generate already-normalized and messy inputs; assert f(f(input)) equals f(input) through the public API.'
  })
  addPatternProperty(properties, propertyContext.sources, /toThrow|rejects\.toThrow|invalid|malformed|null|undefined|wrong type|missing field/i, {
    name: 'retrieved invalid input rejection',
    assertion: 'Generated malformed inputs should be rejected through the documented public result or error.',
    repairHint: 'Generate missing, nullish, wrong-type, empty, and malformed values; assert the public rejection behavior only.'
  })
  addPatternProperty(properties, propertyContext.sources, /Object\.freeze|does not mutate|not\.toBe|immutab|mutate/i, {
    name: 'retrieved input immutability',
    assertion: 'Generated inputs should not be mutated by the public operation.',
    repairHint: 'Freeze or clone generated objects before calling the target; assert the original input remains structurally equal afterward.'
  })
  addPatternProperty(properties, propertyContext.sources, /boundary|edge case|min|max|clamp|range|lower bound|upper bound|overflow|underflow/i, {
    name: 'retrieved boundary stability',
    assertion: 'Generated boundary values should preserve the same bounds and edge-case behavior as similar tests.',
    repairHint: 'Bias generators around min, max, empty, overflow, and just-outside-boundary values, then assert the public boundary contract.'
  })

  return properties
}

function propertyRetrievalHaystack(target: ChangedTarget, propertyContext: PropertyRetrievalContext): string {
  return [
    target.symbolName,
    target.sourceFile,
    target.kind,
    ...propertyContext.sources.map(source => `${source.path}\n${source.content.slice(0, 4000)}`)
  ].join('\n').toLowerCase()
}

function matchesPropertyExperienceEntry(target: ChangedTarget, haystack: string, entry: PropertyExperienceEntry): boolean {
  if (entry.kind && entry.kind !== target.kind) return false
  if (entry.match.length === 0) return true
  return entry.match.some(term => haystack.includes(term.toLowerCase()))
}

function addPatternProperty(properties: PropertyItem[], sources: PropertyRetrievalSource[], pattern: RegExp, template: Omit<PropertyItem, 'sources'>): void {
  const matchingSources = matchingPropertySourcePaths(sources, pattern)
  if (matchingSources.length === 0) return
  properties.push(propertyItem(template.name, template.assertion, template.repairHint, matchingSources))
}

function matchingPropertySourcePaths(sources: PropertyRetrievalSource[], pattern: RegExp): string[] {
  return uniqueStrings(sources.filter(source => pattern.test(`${source.path}\n${source.content}`)).map(source => source.path))
}

function propertyItem(name: string, assertion: string, repairHint: string, sources: string[]): PropertyItem {
  const item: PropertyItem = { name, assertion, repairHint }
  const uniqueSources = uniqueStrings(sources)
  if (uniqueSources.length > 0) item.sources = uniqueSources
  return item
}

function dedupePropertyItems(properties: PropertyItem[]): PropertyItem[] {
  const byName = new Map<string, PropertyItem>()

  for (const property of properties) {
    const key = property.name.toLowerCase()
    const existing = byName.get(key)
    if (!existing) {
      byName.set(key, property)
      continue
    }

    if (property.sources && property.sources.length > 0) {
      existing.sources = uniqueStrings([...(existing.sources ?? []), ...property.sources])
    }
  }

  return [...byName.values()]
}

function summarizePropertySources(sources: PropertyRetrievalSource[], experienceEntries: PropertyExperienceEntry[]): Array<{ path: string; reason: string }> {
  const byPath = new Map<string, string>()

  for (const source of sources) {
    byPath.set(source.path, source.reason)
  }
  for (const entry of experienceEntries) {
    if (!byPath.has(entry.sourcePath)) byPath.set(entry.sourcePath, 'local property experience base')
  }

  return [...byPath.entries()].map(([path, reason]) => ({ path, reason }))
}

function buildPropertyWebSearchQueries(target: ChangedTarget): string[] {
  const symbol = target.symbolName === 'unknown' ? target.sourceFile.split('/').at(-1)?.replace(/\.[^.]+$/, '') ?? 'target' : target.symbolName
  const kindTerms = propertyKindTerms(target.kind).slice(0, 2).join(' ')

  return [
    `${symbol} ${target.kind} property based testing invariant fast-check`,
    `${symbol} similar implementation property test`,
    `${target.kind} ${kindTerms} property based test examples`
  ].filter(query => query.trim().length > 0)
}

function buildApiPlanForTarget(target: ChangedTarget, publicEntryHints: string[]): ApiPlan | undefined {
  if (target.kind !== 'api-client' && target.kind !== 'api-provider') return undefined

  const contractSources = publicEntryHints.filter(hint => /openapi|swagger|contract|pact|msw/i.test(hint))
  return {
    contractSources,
    cases: [
      {
        status: '2xx',
        assertion: 'successful response shape matches the public contract',
        repairHint: 'Call the public endpoint or client and assert status, response body, and required fields.'
      },
      {
        status: '400',
        assertion: 'invalid requests return documented validation errors',
        repairHint: 'Send malformed or missing fields through the public endpoint and assert the documented error response.'
      },
      {
        status: '401/403',
        assertion: 'unauthorized or forbidden requests are rejected through the public endpoint',
        repairHint: 'Call the public endpoint without credentials or with insufficient permissions and assert the public error.'
      },
      {
        status: '404/409',
        assertion: 'missing or conflicting resources return documented errors',
        repairHint: 'Use a public request for a missing resource or conflict case and assert the documented status and body.'
      },
      {
        status: '5xx/upstream',
        assertion: 'upstream failures are surfaced or mapped through the public contract',
        repairHint: 'Use MSW, a contract fixture, or an injected test server to simulate upstream failure through the public API.'
      }
    ]
  }
}


function buildBrowserPlanForTarget(target: ChangedTarget, existingTests: string[]): BrowserPlan | undefined {
  const isFrontendTarget = target.kind === 'react-component' || isFrontendEntryFile(target.sourceFile) || existingTests.some(isBrowserTestPath)
  if (!isFrontendTarget) return undefined

  return {
    framework: 'playwright',
    targetIds: [target.id],
    setup: {
      viewport: { width: 1280, height: 720 },
      trace: 'retain-on-failure',
      screenshot: 'only-on-failure',
      serviceWorkers: 'block'
    },
    locatorPriority: ['role', 'label', 'text', 'placeholder', 'testId', 'css'],
    scenarios: [{
      name: `${target.symbolName} user-visible behavior`,
      goal: 'Exercise the changed UI through user-visible controls and assert observable output.',
      steps: [
        { action: 'goto', url: '/', description: 'Open the route or preview page that renders the changed UI.' },
        { action: 'assertVisible', description: 'Assert the changed UI is visible through role, label, text, or test id.' },
        { action: 'click', description: 'Trigger the primary user action if the target exposes one.' },
        { action: 'assertVisible', description: 'Assert the visible result, validation message, navigation, or changed state after the action.' }
      ],
      visualChecks: [{
        kind: 'locator',
        name: `${target.symbolName}-primary-state`
      }]
    }],
    evidenceToCollect: ['actionability', 'console-error', 'page-error', 'network-failure', 'accessibility', 'visual-diff']
  }
}

function isFrontendEntryFile(path: string): boolean {
  return /(^|\/)(app|pages|routes)\//i.test(path) || /(^|\/)(page|layout|template|loading|error|not-found|App|Root|main)\.[cm]?[tj]sx?$/.test(path)
}

function isBrowserTestPath(path: string): boolean {
  return /\.(browser|e2e)\.(test|spec)\.[cm]?[tj]sx?$/.test(path) || /(^|\/)(playwright|e2e|browser)(\/|$)/i.test(path)
}

function requiresBrowserEvidence(target: ChangedTarget): boolean {
  return target.kind === 'react-component' ||
    isFrontendEntryFile(target.sourceFile) ||
    (target.relatedTests ?? []).some(isBrowserTestPath)
}

function isTestFilePath(path: string): boolean {
  return /\.(test|spec|cy)\.[cm]?[tj]sx?$/.test(path) || /(^|\/)__tests__\//.test(path) || /(^|\/)tests\//.test(path)
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

function classifyChangedFiles(changedFiles: ChangedFileInput[]): ChangedTarget[] {
  return changedFiles
    .filter(file => /\.[cm]?[tj]sx?$/.test(file.path))
    .filter(file => !/\.(test|spec)\.[cm]?[tj]sx?$/.test(file.path))
    .map(file => {
      const symbolName = inferSymbolName(file)
      const kind = inferTargetKind(file, symbolName)
      const risk = inferRisk(kind)

      return {
        id: `${file.path}#${symbolName}`,
        sourceFile: file.path,
        symbolName,
        kind,
        risk
      }
    })
}

function textResult(text: string, details: unknown): AgentToolResult {
  return { content: [{ type: 'text', text }], details }
}

function readChangedFiles(input: unknown): ChangedFileInput[] {
  if (!isRecord(input)) return []

  const value = input.changedFiles
  if (!Array.isArray(value)) return []

  const files: ChangedFileInput[] = []

  for (const item of value) {
    if (isChangedFileInput(item)) files.push(item)
  }

  return files
}

function isChangedFileInput(value: unknown): value is ChangedFileInput {
  return isRecord(value) && typeof value.path === 'string' && typeof value.content === 'string'
}

function readTargetInput(input: unknown): ChangedTarget {
  if (!isRecord(input)) return fallbackTarget()
  if (!isRecord(input.target)) return fallbackTarget()

  return readTarget(input.target)
}

function readTargets(input: unknown): ChangedTarget[] {
  if (!isRecord(input)) return []
  if (!Array.isArray(input.targets)) return []

  const targets: ChangedTarget[] = []

  for (const item of input.targets) {
    if (!isRecord(item)) continue
    targets.push(readTarget(item))
  }

  return targets
}

function readCoverageParams(input: unknown): CoverageParams {
  if (!isRecord(input)) return {}
  const params: CoverageParams = {}
  if (isRecord(input.coverageReport)) params.coverageReport = input.coverageReport
  if (typeof input.reportPath === 'string') params.reportPath = input.reportPath
  return params
}

function readMutationParams(input: unknown): MutationParams {
  if (!isRecord(input)) return {}
  const params: MutationParams = {}
  if (isRecord(input.mutationReport)) params.mutationReport = input.mutationReport
  if (typeof input.reportPath === 'string') params.reportPath = input.reportPath
  return params
}

function collectCoverageGaps(report: unknown): CoverageGap[] {
  if (!isRecord(report)) return []
  const gaps: CoverageGap[] = []

  for (const [file, coverage] of Object.entries(report)) {
    if (!isRecord(coverage)) continue
    if (!isRecord(coverage.statementMap) || !isRecord(coverage.s)) continue

    for (const [id, count] of Object.entries(coverage.s)) {
      if (typeof count !== 'number' || count > 0) continue
      const line = lineFromLocation(coverage.statementMap[id])
      if (!line) continue
      gaps.push({
        file,
        line,
        kind: 'statement',
        summary: `Statement on line ${line} is not covered.`,
        repairHint: 'Add a test that reaches this statement through public behavior.'
      })
    }

    if (isRecord(coverage.fnMap) && isRecord(coverage.f)) {
      for (const [id, count] of Object.entries(coverage.f)) {
        if (typeof count !== 'number' || count > 0) continue
        const meta = coverage.fnMap[id]
        const line = lineFromFunctionMeta(meta)
        if (!line) continue
        const symbolName = isRecord(meta) && typeof meta.name === 'string' ? meta.name : undefined
        gaps.push({
          file,
          line,
          kind: 'function',
          ...(symbolName ? { symbolName } : {}),
          summary: `Function${symbolName ? ` ${symbolName}` : ''} on line ${line} is not covered.`,
          repairHint: 'Add a test that calls this public behavior or reaches it through the public entry point.'
        })
      }
    }

    if (isRecord(coverage.branchMap) && isRecord(coverage.b)) {
      for (const [id, counts] of Object.entries(coverage.b)) {
        if (!Array.isArray(counts)) continue
        const branch = coverage.branchMap[id]
        const locations = isRecord(branch) && Array.isArray(branch.locations) ? branch.locations : []
        counts.forEach((count, index) => {
          if (typeof count !== 'number' || count > 0) return
          const line = lineFromLocation(locations[index]) ?? lineFromLocation(branch)
          if (!line) return
          gaps.push({
            file,
            line,
            kind: 'branch',
            summary: `Branch path ${index + 1} on line ${line} is not covered.`,
            repairHint: 'Add a test that drives the missing conditional branch through public behavior.'
          })
        })
      }
    }
  }

  return gaps
}

function collectMutationSurvivors(report: unknown): MutationSurvivor[] {
  if (!isRecord(report)) return []
  const files = isRecord(report.files) ? report.files : report
  const survivors: MutationSurvivor[] = []

  for (const [file, fileReport] of Object.entries(files)) {
    if (!isRecord(fileReport) || !Array.isArray(fileReport.mutants)) continue
    for (const mutant of fileReport.mutants) {
      if (!isRecord(mutant)) continue
      if (mutant.status !== 'Survived' && mutant.status !== 'NoCoverage') continue
      const line = lineFromLocation(mutant.location)
      if (!line) continue
      const mutatorName = typeof mutant.mutatorName === 'string' ? mutant.mutatorName : undefined
      const replacement = typeof mutant.replacement === 'string' ? mutant.replacement : undefined
      survivors.push({
        file,
        line,
        ...(mutatorName ? { mutatorName } : {}),
        ...(replacement ? { replacement } : {}),
        summary: `${mutatorName ?? 'Mutation'} survived on line ${line}.`,
        repairHint: 'Add a test that fails when this mutant is applied, preferably through the public API.'
      })
    }
  }

  return survivors
}

function lineFromFunctionMeta(value: unknown): number | undefined {
  if (!isRecord(value)) return undefined
  return lineFromLocation(value.decl) ?? lineFromLocation(value.loc)
}

function lineFromLocation(value: unknown): number | undefined {
  if (!isRecord(value)) return undefined
  if (isRecord(value.start) && typeof value.start.line === 'number') return value.start.line
  if (typeof value.line === 'number') return value.line
  return undefined
}

function readBrowserEvidence(input: unknown): BrowserEvidence | undefined {
  if (!isRecord(input)) return undefined
  return readBrowserEvidenceValue(input.browserEvidence)
}

function readTarget(input: Record<string, unknown>): ChangedTarget {
  const kind = readTargetKind(input.kind)
  const risk = readRisk(input.risk, kind)
  const sourceFile = typeof input.sourceFile === 'string' ? input.sourceFile : 'unknown'
  const symbolName = typeof input.symbolName === 'string' ? input.symbolName : 'unknown'
  const id = typeof input.id === 'string' ? input.id : `${sourceFile}#${symbolName}`
  const target: ChangedTarget = { id, sourceFile, symbolName, kind, risk }

  if (Array.isArray(input.relatedTests)) target.relatedTests = input.relatedTests.filter((item): item is string => typeof item === 'string')
  if (Array.isArray(input.publicEntryHints)) target.publicEntryHints = input.publicEntryHints.filter((item): item is string => typeof item === 'string')

  return target
}

function readCandidate(input: unknown): CandidateTest {
  if (!isRecord(input)) return fallbackCandidate()
  if (!isRecord(input.candidate)) return fallbackCandidate()

  const candidate = input.candidate
  const id = typeof candidate.id === 'string' ? candidate.id : 'candidate'
  const targetId = typeof candidate.targetId === 'string' ? candidate.targetId : 'target'
  const filesValue = candidate.files
  const files: CandidateFileChange[] = []

  if (Array.isArray(filesValue)) {
    for (const item of filesValue) {
      if (!isRecord(item)) continue
      if (typeof item.path !== 'string') continue
      if (typeof item.content !== 'string') continue

      files.push({
        path: item.path,
        action: item.action === 'create' ? 'create' : 'modify',
        content: item.content
      })
    }
  }

  return { id, targetId, files }
}

function readReviewResults(input: unknown): GateResult[] {
  if (!isRecord(input)) return []
  if (!Array.isArray(input.reviewResults)) return []

  const results: GateResult[] = []

  for (const item of input.reviewResults) {
    if (!isRecord(item)) continue
    if (!isGateNameValue(item.gate)) continue
    if (typeof item.passed !== 'boolean') continue
    if (item.severity !== 'critical' && item.severity !== 'warning') continue
    if (typeof item.summary !== 'string') continue

    const result: GateResult = {
      gate: item.gate,
      passed: item.passed,
      severity: item.severity,
      summary: item.summary,
      evidence: item.evidence
    }

    if (typeof item.repairHint === 'string') result.repairHint = item.repairHint

    results.push(result)
  }

  return results
}

function isGateNameValue(value: unknown): value is GateResult['gate'] {
  return value === 'indirect-test' ||
    value === 'test-file-scope' ||
    value === 'test-command' ||
    value === 'browser-interaction' ||
    value === 'browser-visual'
}

function inferSymbolName(file: ChangedFileInput): string {
  const symbolMatch = file.content.match(/export\s+(?:default\s+)?(?:class|function|const)\s+([A-Za-z0-9_]+)/)

  if (symbolMatch?.[1]) return symbolMatch[1]

  const baseName = file.path.split('/').at(-1)?.replace(/\.[^.]+$/, '')
  if (baseName) return baseName

  return 'module'
}

function inferTargetKind(file: ChangedFileInput, symbolName: string): TargetKind {
  if (/\.(jsx|tsx)$/.test(file.path)) return 'react-component'
  if (/Service$/.test(symbolName) || /service/i.test(file.path)) return 'service'
  if (/Repository$/.test(symbolName) || /repository/i.test(file.path)) return 'repository'
  if (/Client$/.test(symbolName) || /client/i.test(file.path)) return 'api-client'
  if (/Controller$/.test(symbolName) || /route|api/i.test(file.path)) return 'api-provider'
  if (/cli/i.test(file.path)) return 'cli'
  if (/parse|parser/i.test(symbolName) || /parser/i.test(file.path)) return 'parser'
  if (/validate|schema/i.test(symbolName) || /validator|schema/i.test(file.path)) return 'validator'
  if (/format/i.test(symbolName) || /formatter/i.test(file.path)) return 'formatter'

  return 'pure-function'
}

function inferRisk(kind: TargetKind): RiskLevel {
  if (kind === 'api-provider' || kind === 'repository' || kind === 'service') return 'high'
  if (kind === 'api-client' || kind === 'react-component' || kind === 'cli') return 'medium'
  if (kind === 'unknown') return 'medium'

  return 'low'
}

function readTargetKind(input: unknown): TargetKind {
  const allowed: TargetKind[] = ['pure-function', 'validator', 'parser', 'formatter', 'api-client', 'api-provider', 'service', 'repository', 'react-component', 'cli', 'unknown']

  if (typeof input !== 'string') return 'unknown'
  if (allowed.includes(input as TargetKind)) return input as TargetKind

  return 'unknown'
}

function readRisk(input: unknown, kind: TargetKind): RiskLevel {
  if (input === 'low' || input === 'medium' || input === 'high') return input

  return inferRisk(kind)
}

function fallbackTarget(): ChangedTarget {
  return {
    id: 'unknown#unknown',
    sourceFile: 'unknown',
    symbolName: 'unknown',
    kind: 'unknown',
    risk: 'medium'
  }
}

function fallbackCandidate(): CandidateTest {
  return {
    id: 'candidate',
    targetId: 'target',
    files: []
  }
}
