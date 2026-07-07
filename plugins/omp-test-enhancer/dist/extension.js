import { buildTestHelpText, parseTestCommandMode } from './commands/testCommand.js';
import { defaultTestingEnhancerConfig, readTestingEnhancerConfig, writeTestingEnhancerConfig } from './config/testingConfig.js';
import { detectPackageManager } from './repo/repoScanner.js';
import { TESTING_STATE_ENTRY, createInitialTestingState, markGateFinished, markGatePending, markReportGenerated, restoreTestingStateFromEntries } from './session/testingState.js';
import { createTestingEnhancerTools } from './tools/testingTools.js';
let currentState = createInitialTestingState();
let currentPi;
export function registerTestingEnhancer(pi) {
    currentState = createInitialTestingState();
    currentPi = pi;
    pi.setLabel('OMP Testing Enhancer');
    pi.registerCommand('test', {
        description: '增强测试生成、门禁和报告',
        handler: (args, ctx) => handleTestCommand(pi, args, ctx)
    });
    for (const tool of createTestingEnhancerTools(pi.zod.z, {
        onAnalyze: output => recordAnalyzeOutput(pi, output),
        onGate: output => recordGateOutput(pi, output),
        onReport: output => recordReportOutput(pi, output),
        getRecentGateResults: () => currentState.lastGateResults
    })) {
        pi.registerTool(tool);
    }
    pi.on('session_start', restoreTestingState);
    pi.on('tool_result', recordTestingToolResult);
    pi.on('session_stop', enforcePendingTestGate);
}
export default registerTestingEnhancer;
async function handleTestCommand(pi, args, ctx) {
    const mode = parseTestCommandMode(args);
    if (mode.kind === 'help') {
        const helpText = buildTestHelpText();
        await ctx.ui.notify(helpText, 'info');
        await pi.appendEntry('omp-testing-enhancer.message', { kind: 'help', markdown: helpText });
        return;
    }
    if (mode.kind === 'invalid') {
        await ctx.ui.notify(mode.message, 'warn');
        await pi.appendEntry('omp-testing-enhancer.message', { kind: 'invalid', markdown: mode.message });
        return;
    }
    if (mode.kind === 'init') {
        await initializeConfig(pi, ctx);
        return;
    }
    await ctx.waitForIdle();
    await pi.sendUserMessage(buildAgentInstruction(mode), { deliverAs: 'steer' });
}
async function initializeConfig(pi, ctx) {
    const cwd = typeof ctx.cwd === 'string' && ctx.cwd.trim() !== '' ? ctx.cwd : process.cwd();
    const existing = await readTestingEnhancerConfig(cwd);
    const configPath = '.omp/testing-enhancer.yml';
    if (existing) {
        const message = `OMP Testing Enhancer config already exists: ${configPath}`;
        await ctx.ui.notify(message, 'info');
        await pi.appendEntry('omp-testing-enhancer.message', { kind: 'init', path: configPath });
        return;
    }
    const packageManager = await detectPackageManager(cwd);
    await writeTestingEnhancerConfig(cwd, defaultTestingEnhancerConfig(packageManager));
    await ctx.ui.notify(`Created ${configPath}`, 'info');
    await pi.appendEntry('omp-testing-enhancer.message', { kind: 'init', path: configPath });
}
function restoreTestingState(_event, ctx) {
    const branch = ctx.sessionManager?.getBranch?.();
    currentState = branch ? restoreTestingStateFromEntries(branch) : createInitialTestingState();
}
async function recordTestingToolResult(event, _ctx) {
    if (!isRecord(event))
        return;
    if (event.name !== 'omp_test_report')
        return;
    if (!isRecord(event.details))
        return;
    if (typeof event.details.markdown !== 'string')
        return;
    currentState = markReportGenerated(currentState, event.details.markdown);
    await currentPi?.appendEntry(TESTING_STATE_ENTRY, currentState);
}
function enforcePendingTestGate() {
    if (!currentState.pendingGate)
        return undefined;
    const failedBlockers = currentState.lastGateResults.filter(result => !result.passed && result.severity === 'blocker');
    if (failedBlockers.length > 0) {
        return {
            continue: true,
            additionalContext: [
                'OMP Testing Enhancer: omp_test_gate failed and the test gate is still open.',
                `Failed gates: ${failedBlockers.map(result => result.gate).join(', ')}.`,
                ...failedBlockers.map(result => {
                    const repair = result.repairHint ? ` Repair: ${result.repairHint}` : '';
                    return `- ${result.gate}: ${result.summary}.${repair}`;
                }),
                'Fix the reported repairHint items, then rerun omp_test_gate before ending the turn.'
            ].join('\n')
        };
    }
    return {
        continue: true,
        additionalContext: 'OMP Testing Enhancer: tests were requested but omp_test_gate has not run yet. Run omp_test_gate before ending the turn.'
    };
}
async function recordAnalyzeOutput(pi, output) {
    if (output.targets.length === 0)
        return;
    currentState = {
        ...markGatePending(currentState, output.targets),
        lastAnalyzeRunId: output.runId
    };
    await pi.appendEntry(TESTING_STATE_ENTRY, currentState);
}
async function recordGateOutput(pi, output) {
    currentState = markGateFinished(currentState, output.results);
    await pi.appendEntry(TESTING_STATE_ENTRY, currentState);
}
async function recordReportOutput(pi, output) {
    currentState = markReportGenerated(currentState, output.markdown);
    await pi.appendEntry(TESTING_STATE_ENTRY, currentState);
}
function buildAgentInstruction(mode) {
    if (mode.kind === 'check') {
        return [
            '请运行测试门禁。',
            '只调用 omp_test_gate，确认候选测试验证公开行为、只修改测试文件，检查浏览器证据，并执行配置的测试命令。',
            '门禁失败时按 repairHint 修复，不要绕过门禁。'
        ].join('\n');
    }
    if (mode.kind === 'report') {
        return [
            '请读取最近一次测试增强结果。',
            '只调用 omp_test_report，汇总通过项、失败门禁和后续修复建议。'
        ].join('\n');
    }
    const targetLine = mode.files.length > 0
        ? `目标文件：${mode.files.join(', ')}`
        : '目标文件：当前会话中的代码改动';
    return [
        '请按 OMP Testing Enhancer 工作流补测试。',
        targetLine,
        '先调用 omp_test_analyze 找出需要补测的目标。',
        '再调用 omp_test_context 获取现有测试、公开入口、propertyPlan 和 apiPlan。',
        '如果 omp_test_context 返回 browserPlan，请调用 omp_test_browser_check 打开浏览器执行用户事件、采集 console/pageerror/network/视觉证据。',
        '如果有 coverage 报告，请调用 omp_test_coverage_analyze 读取未覆盖的行、分支和函数，并据此补测试。',
        '如果有 mutation 报告，请调用 omp_test_mutation_context 读取 survived mutants，并据此补能杀死 mutant 的断言。',
        '只修改必要的测试文件，优先验证公开行为。',
        '写完测试并采集可用证据后调用 omp_test_gate，检查 indirect-test、test-file-scope、browser-interaction、browser-visual 和 test-command 门禁。',
        '门禁通过后调用 omp_test_report 生成简短报告。',
        '必须使用这些工具：omp_test_analyze、omp_test_context、omp_test_gate、omp_test_report。按需使用 omp_test_browser_check、omp_test_coverage_analyze、omp_test_mutation_context。'
    ].join('\n');
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
