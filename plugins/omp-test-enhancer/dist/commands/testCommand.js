export function parseTestCommandMode(args) {
    const parts = args
        .trim()
        .split(/\s+/)
        .map(item => item.trim())
        .filter(Boolean);
    const first = parts[0];
    if (!first)
        return { kind: 'run', files: [] };
    if (first.startsWith('--')) {
        const suggestion = first.slice(2);
        return {
            kind: 'invalid',
            message: `不支持 ${first}。请使用 /test ${suggestion}。`
        };
    }
    if (first === 'help')
        return { kind: 'help' };
    if (first === 'check')
        return { kind: 'check' };
    if (first === 'report')
        return { kind: 'report' };
    if (first === 'init')
        return { kind: 'init' };
    return { kind: 'run', files: parts };
}
export function buildTestHelpText() {
    return [
        'OMP Testing Enhancer',
        '',
        '常用命令：',
        '',
        '/test',
        '  分析当前改动，选择需要补测的目标，指导 agent 写测试并运行门禁。',
        '',
        '/test <file>',
        '  只处理指定文件。例如：',
        '  /test src/auth/parseToken.ts',
        '',
        '/test check',
        '  只运行测试门禁。适合已经改完测试后检查。',
        '',
        '/test report',
        '  显示最近一次测试增强报告。',
        '',
        '/test init',
        '  初始化 .omp/testing-enhancer.yml 配置。',
        '',
        '/test help',
        '  显示这份帮助。',
        '',
        '测试门禁：',
        '插件会检查测试是否在验证公开行为，而不是内部实现。前端目标还可以检查浏览器交互和视觉证据。',
        'omp_test_context 会为适合的目标返回 propertyPlan 和 apiPlan。agent 可以用它们补属性测试、API 测试和契约测试。',
        '如果已有 coverage 或 mutation 报告，agent 可以调用对应工具读取未覆盖代码和 surviving mutants。',
        '',
        '工作规则：',
        '1. 默认只修改测试文件。',
        '2. 前端目标按 browserPlan 采集浏览器证据。',
        '3. 纯函数、parser、formatter、validator 按 propertyPlan 补不变量测试。',
        '4. API 目标按 apiPlan 补状态码、响应体和契约字段测试。',
        '5. 有 coverage 报告时调用 omp_test_coverage_analyze。',
        '6. 有 mutation 报告时调用 omp_test_mutation_context。',
        '7. 写完测试后必须运行 omp_test_gate。',
        '8. 门禁失败时按 repairHints 修复。',
        '9. 门禁通过后生成报告。',
        '10. 如果测试改了但没有验证，插件会在会话结束前提醒继续检查。'
    ].join('\n');
}
