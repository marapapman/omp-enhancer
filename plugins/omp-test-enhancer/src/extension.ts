import { buildTestHelpText, parseTestCommandMode, type TestCommandMode } from './commands/testCommand.js'
import { defaultTestingEnhancerConfig, readTestingEnhancerConfig, writeTestingEnhancerConfig } from './config/testingConfig.js'
import {
  isDefiniteWorkspaceMutationHostEvent,
  isTrustedExplicitTestAttempt,
  observedTestCommandFromHostEvent
} from './host/observedTestEvidence.js'
import { detectPackageManager } from './repo/repoScanner.js'
import {
  TESTING_EVIDENCE_ENTRY,
  TESTING_STATE_ENTRY,
  buildTestingReviewEvidence,
  completeTestingReview,
  createInitialTestingReviewState,
  hasTestingReviewData,
  invalidateObservedTestCommand,
  recordObservedTestCommand,
  recordTestingReport,
  restoreTestingReviewStateFromEntries,
  scopeTestingReviewToRoute,
  startTestingReview,
  type TestingReviewState
} from './session/testingState.js'
import { readCoreRouteIdentityFromEntries, type SessionEntry } from './session/routeIdentity.js'
import { createTestingEnhancerTools } from './tools/testingTools.js'
import type { AnalyzeOutput, ReportOutput, ReviewOutput } from './tools/testingTools.js'
import { isRecord } from './utils.js'
import type { ExtensionAPI, ExtensionCommandContext, ExtensionToolContext } from './ompApi.js'

export function registerTestingEnhancer(pi: ExtensionAPI): void {
  let currentState: TestingReviewState = createInitialTestingReviewState()

  const branchEntries = (ctx: ExtensionToolContext): SessionEntry[] => ctx.sessionManager?.getBranch?.() ?? []

  const prepareStateForContext = (ctx: ExtensionToolContext): void => {
    const routeIdentity = readCoreRouteIdentityFromEntries(branchEntries(ctx))
    if (!routeIdentity || currentState.routeIdentity === routeIdentity) return
    currentState = scopeTestingReviewToRoute(currentState, routeIdentity)
  }

  const persistTestingReview = async (ctx: ExtensionToolContext): Promise<void> => {
    prepareStateForContext(ctx)
    await pi.appendEntry(TESTING_STATE_ENTRY, currentState)
    if (!hasTestingReviewData(currentState)) return
    await pi.appendEntry(TESTING_EVIDENCE_ENTRY, buildTestingReviewEvidence(currentState))
  }

  const restoreTestingReview = (_event: unknown, ctx: ExtensionToolContext): void => {
    const entries = branchEntries(ctx)
    const routeIdentity = readCoreRouteIdentityFromEntries(entries)
    currentState = restoreTestingReviewStateFromEntries(entries, {
      ...(routeIdentity !== undefined ? { routeIdentity } : {}),
      requireCurrentRoute: routeIdentity !== undefined
    })
  }

  const recordTestingToolResult = async (event: unknown, ctx: ExtensionToolContext): Promise<void> => {
    if (!isRecord(event)) return
    prepareStateForContext(ctx)
    const entries = branchEntries(ctx)
    const routeIdentity = readCoreRouteIdentityFromEntries(entries) ?? currentState.routeIdentity
    const observed = routeIdentity ? observedTestCommandFromHostEvent(event, routeIdentity) : undefined
    let stateChanged = false
    if (currentState.lastObservedTestCommand
      && (isDefiniteWorkspaceMutationHostEvent(event)
        || isTrustedExplicitTestAttempt(event) && !observed)) {
      currentState = invalidateObservedTestCommand(currentState)
      stateChanged = true
    }

    if (observed) {
      currentState = recordObservedTestCommand(currentState, observed)
      stateChanged = true
    }

    if (stateChanged) await persistTestingReview(ctx)

    if (event.name === 'omp_test_report' && isRecord(event.details) && typeof event.details.markdown === 'string') {
      currentState = recordTestingReport(currentState, event.details.markdown)
      await persistTestingReview(ctx)
    }
  }

  const recordAnalyzeOutput = async (output: AnalyzeOutput, ctx: ExtensionToolContext): Promise<void> => {
    if (output.targets.length === 0) return

    prepareStateForContext(ctx)
    const routeIdentity = readCoreRouteIdentityFromEntries(branchEntries(ctx))
      ?? currentState.routeIdentity
      ?? `testing:${output.runId}`
    currentState = startTestingReview(currentState, output.targets, { routeIdentity, runId: output.runId })
    await persistTestingReview(ctx)
  }

  const recordReviewOutput = async (output: ReviewOutput, ctx: ExtensionToolContext): Promise<void> => {
    prepareStateForContext(ctx)
    const routeIdentity = readCoreRouteIdentityFromEntries(branchEntries(ctx))
      ?? currentState.routeIdentity
      ?? 'testing:testing-unscoped'
    currentState = completeTestingReview(
      scopeTestingReviewToRoute(currentState, routeIdentity),
      output.results
    )
    await persistTestingReview(ctx)
  }

  const recordReportOutput = async (output: ReportOutput, ctx: ExtensionToolContext): Promise<void> => {
    prepareStateForContext(ctx)
    currentState = recordTestingReport(currentState, output.markdown)
    await persistTestingReview(ctx)
  }

  pi.setLabel('OMP Testing Enhancer')
  pi.registerCommand('test', {
    description: '增强测试生成、建议型审查和报告',
    handler: (args, ctx) => handleTestCommand(pi, args, ctx)
  })

  for (const tool of createTestingEnhancerTools(pi.zod.z, {
    onAnalyze: recordAnalyzeOutput,
    onReview: recordReviewOutput,
    onReport: recordReportOutput,
    getRecentReviewResults: () => currentState.lastReviewResults,
    getObservedTestCommandEvidence: () => currentState.lastObservedTestCommand
  })) {
    pi.registerTool(tool)
  }

  pi.on('session_start', restoreTestingReview)
  pi.on('tool_result', recordTestingToolResult)
}

export default registerTestingEnhancer

async function handleTestCommand(pi: ExtensionAPI, args: string, ctx: ExtensionCommandContext): Promise<void> {
  const mode = parseTestCommandMode(args)

  if (mode.kind === 'help') {
    const helpText = buildTestHelpText()
    await ctx.ui.notify(helpText, 'info')
    await pi.appendEntry('omp-testing-enhancer.message', { kind: 'help', markdown: helpText })
    return
  }

  if (mode.kind === 'invalid') {
    await ctx.ui.notify(mode.message, 'warn')
    await pi.appendEntry('omp-testing-enhancer.message', { kind: 'invalid', markdown: mode.message })
    return
  }

  if (mode.kind === 'init') {
    await initializeConfig(pi, ctx)
    return
  }

  await ctx.waitForIdle()
  await pi.sendUserMessage(buildAgentInstruction(mode), { deliverAs: 'steer' })
}

async function initializeConfig(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
  const cwd = typeof ctx.cwd === 'string' && ctx.cwd.trim() !== '' ? ctx.cwd : process.cwd()
  const existing = await readTestingEnhancerConfig(cwd)
  const configPath = '.omp/testing-enhancer.yml'

  if (existing) {
    const message = `OMP Testing Enhancer config already exists: ${configPath}`
    await ctx.ui.notify(message, 'info')
    await pi.appendEntry('omp-testing-enhancer.message', { kind: 'init', path: configPath })
    return
  }

  const packageManager = await detectPackageManager(cwd)
  await writeTestingEnhancerConfig(cwd, defaultTestingEnhancerConfig(packageManager))
  await ctx.ui.notify(`Created ${configPath}`, 'info')
  await pi.appendEntry('omp-testing-enhancer.message', { kind: 'init', path: configPath })
}

function buildAgentInstruction(mode: Exclude<TestCommandMode, { kind: 'help' } | { kind: 'invalid' } | { kind: 'init' }>): string {
  if (mode.kind === 'check') {
    return [
      '请运行一次建议型测试审查。',
      '先通过宿主 shell 显式运行 .omp/testing-enhancer.yml 中的期望测试命令，并确认真实成功结果。',
      '再把计划、测试 diff 和当前执行证据交给 test-reviewer 做独立只读审查。test-reviewer 可调用一次兼容工具 omp_test_gate，检查候选测试是否验证公开行为、是否包含生产代码修改，以及浏览器证据是否充分；该工具本身不会执行命令或阻止会话。',
      '把 critical findings 和 repairHint 作为修复建议；是否继续修复由当前任务和用户要求决定。'
    ].join('\n')
  }

  if (mode.kind === 'report') {
    return [
      '请读取最近一次测试增强结果。',
      '只调用 omp_test_report，汇总通过项、critical findings 和后续修复建议。'
    ].join('\n')
  }

  const targetLine = mode.files.length > 0
    ? `目标文件：${mode.files.join(', ')}`
    : '目标文件：当前会话中的代码改动'

  return [
    '请按 OMP Testing Enhancer 工作流补测试。',
    targetLine,
    '先委派 test-planner 做只读规划。它调用 omp_test_analyze 找出目标，再调用 omp_test_context 获取现有测试、公开入口、propertyPlan、apiPlan 和可选 browserPlan。',
    '如果已有 coverage 或 mutation 报告，test-planner 可调用 omp_test_coverage_analyze 或 omp_test_mutation_context，把缺口写进 target-to-behavior TEST_PLAN。它不改文件，也不运行命令。',
    '父级确认计划范围后，委派 test-executor 只修改必要的测试文件和 fixtures，优先验证公开行为，不修改生产代码。',
    '如果计划含 browserPlan，test-executor 调用 omp_test_browser_check 执行用户事件并采集 console、pageerror、network 和视觉证据。',
    'test-executor 写完测试后，通过宿主 shell 显式运行 .omp/testing-enhancer.yml 中的期望测试命令，记录真实输出和 exit status。',
    '获得测试 diff 和当前执行证据后，委派 test-reviewer 做独立只读审查。它不改文件，也不重跑测试。',
    'test-reviewer 可以调用一次兼容工具 omp_test_gate 检查 indirect-test、test-file-scope、browser-interaction、browser-visual 和 test-command findings，并按需调用 omp_test_report。',
    '父级汇总 TEST_PLAN、TEST_EXECUTION 和 TEST_REVIEW。缺少某项证据时报告 limitation，不要自动调度修复、自动重试或阻止会话结束。'
  ].join('\n')
}
