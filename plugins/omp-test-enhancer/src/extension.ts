import { createHash } from 'node:crypto'
import { buildTestHelpText, parseTestCommandMode, type TestCommandMode } from './commands/testCommand.js'
import { defaultTestingEnhancerConfig, readTestingEnhancerConfig, writeTestingEnhancerConfig } from './config/testingConfig.js'
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

function observedTestCommandFromHostEvent(event: Record<string, unknown>, routeIdentity: string) {
  const command = trustedHostCommand(event)
  if (!command) return undefined
  if (!isExplicitStandaloneTestCommand(command)
    || isNonExecutingTestProbe(command)
    || hasUnsafeShellControlSyntax(command)) return undefined

  const exitCodeValue = firstValue(
    event.exitCode,
    readNested(event, 'details', 'exitCode'),
    readNested(event, 'result', 'exitCode'),
    readNested(event, 'details', 'result', 'exitCode')
  )
  const exitCode = Number.isInteger(exitCodeValue)
    ? Number(exitCodeValue)
    : event.isError === false ? 0 : event.isError === true ? 1 : undefined
  const resultText = hostToolResultText(event)
  if (exitCode !== 0 || !isExplicitPositiveTestOutput(resultText, command)) return undefined
  return {
    schemaVersion: 1 as const,
    routeIdentity,
    commandDigest: createHash('sha256').update(command).digest('hex'),
    exitCode,
    observedAt: Date.now()
  }
}

function trustedHostCommand(event: Record<string, unknown>): string | undefined {
  const name = String(event.name ?? event.toolName ?? '').toLowerCase()
  if (!TRUSTED_HOST_TEST_EXECUTORS.has(name)) return undefined
  return firstString(
    event.command,
    readNested(event, 'input', 'command'),
    readNested(event, 'input', 'cmd'),
    readNested(event, 'params', 'command'),
    readNested(event, 'params', 'cmd'),
    readNested(event, 'details', 'input', 'command'),
    readNested(event, 'details', 'input', 'cmd')
  )?.trim()
}

function isTrustedExplicitTestAttempt(event: Record<string, unknown>): boolean {
  const command = trustedHostCommand(event)
  return Boolean(command && isExplicitStandaloneTestCommand(command))
}

const TRUSTED_HOST_TEST_EXECUTORS = new Set([
  'bash',
  'shell',
  'terminal',
  'exec',
  'exec_command',
  'run',
  'run_command',
  'command',
  'functions.bash',
  'functions.shell',
  'functions.terminal',
  'functions.exec',
  'functions.exec_command',
  'functions.run',
  'functions.run_command',
  'functions.command'
])

const TRUSTED_DIRECT_WORKSPACE_MUTATORS = new Set([
  'edit',
  'write',
  'patch',
  'apply_patch',
  'edit_file',
  'write_file',
  'patch_file',
  'create_file',
  'functions.edit',
  'functions.write',
  'functions.patch',
  'functions.apply_patch',
  'functions.edit_file',
  'functions.write_file',
  'functions.patch_file',
  'functions.create_file'
])

function isExplicitStandaloneTestCommand(command: string): boolean {
  const text = String(command).trim().toLowerCase()
  const runner = text.replace(/^(?:npx|bunx|npm\s+exec|pnpm\s+exec|yarn\s+dlx)\s+(?:--\s+)?/, '')
  return /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test(?::[\w.-]+)?|unit|integration|e2e|check:test)\b/.test(text)
    || /^(?:node\s+--test|pytest|python(?:\d+(?:\.\d+)?)?\s+-m\s+(?:pytest|unittest|nox)|cargo\s+(?:test|nextest\s+run)|go\s+test|dotnet\s+(?:test|vstest)|(?:\.\/)?mvn(?:w)?\b[^\n]*\b(?:test|verify)\b|(?:\.\/)?gradle(?:w)?\b[^\n]*\b(?:test|check)\b|ctest|make\s+(?:test|check)|(?:bundle\s+exec\s+)?(?:\.\.?\/)?(?:\S+\/)*rspec|(?:\.\/)?(?:\S+\/)*phpunit|mix\s+test|swift\s+test|(?:bazel|bazelisk)\s+test|flutter\s+test|zig\s+build\s+test|(?:unittest|nose2|behave|robot)(?:\s|$)|xcodebuild\b[^\n]*\btest\b|(?:sbt|lein)\s+test|(?:\.\/)?(?:test|tests|run-tests?)\.sh\b)/.test(text)
    || /^(?:vitest|jest)(?:\s|$)|^deno\s+test\b|^(?:\.\.?\/)?(?:\S+\/)*playwright\s+test\b|^(?:\.\.?\/)?(?:\S+\/)*cypress\s+run\b|^(?:\.\.?\/)?(?:\S+\/)*mocha(?:\s|$)|^(?:\.\.?\/)?(?:\S+\/)*(?:tox|nox)(?:\s|$)/.test(runner)
}

function hasUnsafeShellControlSyntax(command: string): boolean {
  const source = String(command)
  let quote: "'" | '"' | null = null
  let escaped = false
  for (let index = 0; index < source.length; index += 1) {
    const char = source.charAt(index)
    const next = source.charAt(index + 1)
    if (char === '\r' || char === '\n') return true
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\' && quote !== "'") {
      escaped = true
      continue
    }
    if (quote) {
      if (char === quote) quote = null
      else if (quote === '"' && (char === '`' || char === '$' && next === '(')) return true
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      continue
    }
    if (';&|<>`'.includes(char) || char === '$' && next === '(') return true
  }
  return quote !== null || escaped
}

function isNonExecutingTestProbe(command: string): boolean {
  return /(?:^|\s)(?:--help|-h|--listtests|--list-tests|--collect-only|--passwithnotests)(?:\s|$)/i.test(command)
}

function isExplicitPositiveTestOutput(value: string, command: string): boolean {
  const text = String(value).trim()
  const goTestCommand = /^go\s+test\b/i.test(String(command).trim())
  const goExecutedSuite = text.split(/\r?\n/).some(line => /^ok\s+\S+/.test(line.trim()) && !/\[no test files\]/i.test(line))
  const gradleTestCommand = /^(?:\.\/)?gradle(?:w)?\b[^\n]*\b(?:test|check)\b/i.test(String(command).trim())
  const gradleTestTaskLines = text.split(/\r?\n/).filter(line => /^>\s*Task\s+:[^\n]*test\b/i.test(line.trim()))
  const gradleExecutedSuite = gradleTestTaskLines.some(line => !/\b(?:NO-SOURCE|SKIPPED|UP-TO-DATE|FROM-CACHE)\b/i.test(line))
  if (!text) return false
  const unittestSummary = text.match(/\bran\s+([1-9]\d*)\s+tests?\b[\s\S]{0,160}(?:^|\n)\s*OK(?:\s*\(([^\n)]*)\))?\s*$/i)
  const unittestSkipped = unittestSummary?.[2]?.match(/\bskipped\s*=\s*(\d+)\b/i)
  if (unittestSummary && unittestSkipped
    && Number(unittestSkipped[1]) >= Number(unittestSummary[1])) return false
  const phpunitIssueSummary = text.match(/\bOK,\s*but there were issues!(?=\s|$)[\s\S]{0,200}\btests?\s*:\s*([1-9]\d*)\s*,\s*assertions?\s*:\s*(\d+)\b/i)
  if (phpunitIssueSummary && Number(phpunitIssueSummary[2]) === 0) return false
  const withoutZeroFailures = text
    .replace(/\b0\s+(?:tests?\s+)?fail(?:ed|ures?)\b/gi, '')
    .replace(/(?:^|\n)\s*#\s*fail\s+0\b/gi, '')
  if (/(?:^|\n)\s*not ok\b|\btests? failed\b|\b[1-9]\d*\s+(?:tests?\s+)?fail(?:s|ed|ures?)?\b|\b(?:failed|failing|failures?|errors?)\s*:\s*[1-9]\d*\b|(?:^|\n)\s*#\s*fail\s+[1-9]\d*\b|\bBUILD FAILED\b|\bfatal:|\berror:/i.test(withoutZeroFailures)) return false
  const hasCountedNonzeroSuite = /\b[1-9]\d*\s+(?:tests?\s+)?passed\b|\btests?\s+[1-9]\d*\s+passed\b|\b[1-9]\d*\s+passing\b|\b[1-9]\d*\s+pass\b|(?:^|\n)\s*#\s*pass\s+[1-9]\d*\b|\btest result:\s*ok\.[^\n]*\b[1-9]\d*\s+passed\b|\btests?\s+run:\s*[1-9]\d*\s*,\s*failures?\s*:\s*0\s*,\s*errors?\s*:\s*0\b|\bfailed\s*:\s*0\b[^\n]{0,120}\bpassed\s*:\s*[1-9]\d*\b|\bpassed\s*:\s*[1-9]\d*\b[^\n]{0,120}\bfailed\s*:\s*0\b|\btest summary\s*:\s*total\s*:\s*[1-9]\d*\s*,\s*failed\s*:\s*0\s*,\s*succeeded\s*:\s*[1-9]\d*\b|\btest run successful\b[^\n]{0,120}\btotal tests?\s*:\s*[1-9]\d*\b|\bran\s+[1-9]\d*\s+tests?\b[\s\S]{0,160}(?:^|\n)\s*OK(?:\s*\([^\n)]*\))?\s*$|\bOK,\s*but there were issues!\b[\s\S]{0,200}\btests?\s*:\s*[1-9]\d*\b|\b[1-9]\d*\s+tests?\s+completed\b|\b[1-9]\d*\s+examples?\s*,\s*0\s+failures?\b|\b100%\s+tests?\s+passed\b[^\n]{0,100}\b0\s+tests?\s+failed\s+out\s+of\s+[1-9]\d*\b|\bOK\s*\(\s*[1-9]\d*\s+tests?\s*,\s*[1-9]\d*\s+assertions?\s*\)|\bexecuted\s+[1-9]\d*\s+tests?\s*,\s*with\s+0\s+failures?\b|\b[1-9]\d*\s+tests?\s*,\s*0\s+failures?\b|\btests?\s*:\s*[1-9]\d*\b[\s\S]{0,200}\bpassing\s*:\s*[1-9]\d*\b[\s\S]{0,120}\bfailing\s*:\s*0\b/i.test(text)
  const hasPhpunitIssuesNonzeroSuite = Boolean(phpunitIssueSummary && Number(phpunitIssueSummary[2]) > 0)
  const hasWeakPositiveSuite = /(?:^|\n)\s*PASS\s+\S/i.test(text)
    || !goTestCommand && /(?:^|\n)\s*ok\s+\S+/i.test(text)
  const hasRunnerSpecificNonzeroSuite = goTestCommand && goExecutedSuite
    || gradleTestCommand && gradleExecutedSuite && /\bBUILD SUCCESSFUL\b/i.test(text)
  const hasEmptySuite = /\b(?:no tests? (?:found|collected|run)|zero tests?|ran\s+0\s+tests?|collected\s+0\s+(?:items?|tests?)|0\s+tests?\s+(?:passed|run|collected)|tests?\s+0\s+passed|0\s+passed|0\s+passing)\b/i.test(text)
    || /\[(?:no test files|no tests? to run)\]/i.test(text)
    || /(?:^|\n)\s*#\s*(?:pass|tests?)\s+0\b/i.test(text)
    || gradleTestCommand && gradleTestTaskLines.length > 0 && !gradleExecutedSuite
  if (hasEmptySuite && !hasCountedNonzeroSuite && !hasRunnerSpecificNonzeroSuite && !hasPhpunitIssuesNonzeroSuite) return false
  return hasCountedNonzeroSuite || hasWeakPositiveSuite || hasRunnerSpecificNonzeroSuite || hasPhpunitIssuesNonzeroSuite
}

function hostToolResultText(event: Record<string, unknown>): string {
  return [
    event.output,
    event.stdout,
    event.content,
    event.result,
    readNested(event, 'result', 'output'),
    readNested(event, 'result', 'stdout'),
    readNested(event, 'result', 'content'),
    readNested(event, 'details', 'output'),
    readNested(event, 'details', 'stdout'),
    readNested(event, 'details', 'content'),
    readNested(event, 'details', 'result'),
    readNested(event, 'details', 'result', 'output'),
    readNested(event, 'details', 'result', 'stdout'),
    readNested(event, 'details', 'result', 'content')
  ].flatMap(collectResultText).filter(Boolean).join('\n')
}

function collectResultText(value: unknown): string[] {
  const seen = new Set<object>()
  const visit = (candidate: unknown): string[] => {
    if (typeof candidate === 'string') return [candidate]
    if (Array.isArray(candidate)) {
      if (seen.has(candidate)) return []
      seen.add(candidate)
      return candidate.flatMap(item => visit(item))
    }
    if (!isRecord(candidate) || seen.has(candidate)) return []
    seen.add(candidate)
    return [candidate.text, candidate.output, candidate.stdout, candidate.content].flatMap(item => visit(item))
  }
  return visit(value)
}

function isDefiniteWorkspaceMutationHostEvent(event: Record<string, unknown>): boolean {
  const name = String(event.name ?? event.toolName ?? '').toLowerCase()
  if (TRUSTED_DIRECT_WORKSPACE_MUTATORS.has(name)) return true
  if (!TRUSTED_HOST_TEST_EXECUTORS.has(name)) return false
  const command = firstString(
    event.command,
    readNested(event, 'input', 'command'),
    readNested(event, 'input', 'cmd'),
    readNested(event, 'params', 'command'),
    readNested(event, 'params', 'cmd'),
    readNested(event, 'details', 'input', 'command'),
    readNested(event, 'details', 'input', 'cmd')
  )?.trim().toLowerCase()
  if (!command) return false
  if (hasUnsafeShellControlSyntax(command)) return true
  if (isExplicitStandaloneTestCommand(command)
    && /(?:--updateSnapshot\b|--update-snapshots?\b|(?:^|\s)-u(?:\s|$))/i.test(command)) return true
  if (isExplicitStandaloneTestCommand(command)) return false
  if (/^git\s+(?:add\b|tag\b(?![^\n]*(?:-d|--delete|-f|--force)))/.test(command)) return false
  if (/^git\s+(?:status|diff|log|show|rev-parse|ls-files)\b/.test(command)
    || /^(?:rg|grep|ls|pwd|cat|head|tail|wc|stat|file|which|jq|sha\d*sum)\b/.test(command)
    || /^sed\s+-n\b/.test(command)
    || /^node\s+--check\b/.test(command)
    || /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:lint|typecheck|check(?::(?!test)[\w.-]+)?)\b(?![^\n]*--fix)/.test(command)) return false
  return true
}

function readNested(value: unknown, ...keys: string[]): unknown {
  let current = value
  for (const key of keys) {
    if (!isRecord(current)) return undefined
    current = current[key]
  }
  return current
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.trim() !== '')
}

function firstValue(...values: unknown[]): unknown {
  return values.find(value => value !== undefined)
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
      '再调用兼容工具 omp_test_gate 汇总当前 route 的宿主测试证据，检查候选测试是否验证公开行为、是否包含生产代码修改，以及浏览器证据是否充分；该工具本身不会执行命令或阻止会话。',
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
    '先调用 omp_test_analyze 找出需要补测的目标。',
    '再调用 omp_test_context 获取现有测试、公开入口、propertyPlan 和 apiPlan。',
    '如果 omp_test_context 返回 browserPlan，请调用 omp_test_browser_check 打开浏览器执行用户事件、采集 console/pageerror/network/视觉证据。',
    '如果有 coverage 报告，请调用 omp_test_coverage_analyze 读取未覆盖的行、分支和函数，并据此补测试。',
    '如果有 mutation 报告，请调用 omp_test_mutation_context 读取 survived mutants，并据此补能杀死 mutant 的断言。',
    '只修改必要的测试文件，优先验证公开行为。',
    '写完测试后，通过宿主 shell 显式运行 .omp/testing-enhancer.yml 中的期望测试命令并确认真实成功结果。',
    '写完测试并采集可用证据后，可以调用兼容工具 omp_test_gate 做建议型审查，检查 indirect-test、test-file-scope、browser-interaction、browser-visual 和 test-command findings。',
    '最后可调用 omp_test_report 生成简短报告。',
    '建议使用 omp_test_analyze、omp_test_context、omp_test_gate 和 omp_test_report；按需使用 omp_test_browser_check、omp_test_coverage_analyze、omp_test_mutation_context。缺少某项证据时报告 limitation，不要自动重试或阻止会话结束。'
  ].join('\n')
}
