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
        '  分析当前改动，选择需要补测的目标，指导 agent 写测试并运行建议型审查。',
        '',
        '/test <file>',
        '  只处理指定文件。例如：',
        '  /test src/auth/parseToken.ts',
        '',
        '/test check',
        '  只运行建议型测试审查，不会执行测试命令。先用宿主 shell 运行期望测试，再调用兼容工具 omp_test_gate。',
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
        '建议型测试审查：',
        '插件会报告测试是否在验证公开行为，而不是内部实现。前端目标还可以检查浏览器交互和视觉证据。findings 不会阻止工具或会话。',
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
        '7. 写完测试后通过宿主 shell 显式运行期望测试命令。',
        '8. 测试后可运行兼容工具 omp_test_gate；它只消费当前 route 的宿主证据，不执行命令。',
        '9. 将 critical findings 和 repairHints 作为修复建议。',
        '10. 按需生成报告。',
        '11. 缺少证据时说明 limitation；插件不会强制续跑或自动重试。'
    ].join('\n');
}
