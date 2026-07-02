import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { evaluateBrowserEvidenceGate } from '../gates/browserEvidenceGate.js';
import { evaluateIndirectTestGate } from '../gates/indirectTestGate.js';
import { evaluateTestCommandGate } from '../gates/testCommandGate.js';
import { evaluateTestFileScopeGate } from '../gates/testFileScopeGate.js';
import { readTestingEnhancerConfig } from '../config/testingConfig.js';
import { findPublicEntryHints, findRelatedTests, readRepoFiles } from '../repo/repoScanner.js';
import { executeBrowserCheck } from './browserCheck.js';
export function createTestingEnhancerTools(z, callbacks = {}) {
    const changedFileSchema = z.object({ path: z.string(), content: z.string() });
    const targetSchema = z.unknown();
    const candidateSchema = z.unknown();
    const gateResultSchema = z.unknown();
    return [
        {
            name: 'omp_test_analyze',
            label: 'Analyze test targets',
            description: '分析改动并找出需要补测的目标',
            parameters: z.object({
                files: z.optional(z.array(z.string())),
                changedFiles: z.optional(z.array(changedFileSchema))
            }),
            execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
                const output = await executeAnalyze(params, ctx);
                await callbacks.onAnalyze?.(output);
                return textResult(output.targets.length === 1 ? 'Found 1 test target.' : `Found ${output.targets.length} test targets.`, output);
            }
        },
        {
            name: 'omp_test_context',
            label: 'Build test context',
            description: '读取目标相关的公开入口和现有测试上下文',
            parameters: z.object({ target: targetSchema }),
            execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
                const output = await executeContext(params, ctx);
                return textResult(`Testing style: ${output.testingStyle}.`, output);
            }
        },
        {
            name: 'omp_test_browser_check',
            label: 'Run browser check',
            description: '打开浏览器执行前端用户事件、视觉检查和操作错误采集',
            parameters: z.object({
                baseUrl: z.string(),
                serverCommand: z.optional(z.string()),
                artifactDir: z.optional(z.string()),
                setup: z.optional(z.unknown()),
                scenarios: z.array(z.unknown())
            }),
            execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
                const output = await (callbacks.runBrowserCheck ?? executeBrowserCheck)(params, ctx);
                return textResult(output.status === 'passed' ? 'Browser check passed.' : output.status === 'skipped' ? 'Browser check skipped.' : 'Browser check failed.', output);
            }
        },
        {
            name: 'omp_test_coverage_analyze',
            label: 'Analyze coverage gaps',
            description: '读取覆盖率报告并找出未覆盖的行、分支和函数',
            parameters: z.object({
                coverageReport: z.optional(z.unknown()),
                reportPath: z.optional(z.string())
            }),
            execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
                const output = await executeCoverageAnalyze(params, ctx);
                return textResult(output.status === 'available' ? `Found ${output.gaps.length} coverage gaps.` : 'No coverage report found.', output);
            }
        },
        {
            name: 'omp_test_mutation_context',
            label: 'Analyze mutation survivors',
            description: '读取 mutation 报告并把 surviving mutants 转成补测建议',
            parameters: z.object({
                mutationReport: z.optional(z.unknown()),
                reportPath: z.optional(z.string())
            }),
            execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
                const output = await executeMutationAnalyze(params, ctx);
                return textResult(output.status === 'available' ? `Found ${output.survivedMutants.length} mutation survivors.` : 'No mutation report found.', output);
            }
        },
        {
            name: 'omp_test_gate',
            label: 'Run test gate',
            description: '运行测试质量门禁，包含间接测试、测试文件范围和测试命令门禁',
            parameters: z.object({
                targets: z.array(targetSchema),
                candidate: candidateSchema,
                testCommand: z.optional(z.string()),
                browserEvidence: z.optional(z.unknown())
            }),
            execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
                const output = await executeGate(params, ctx);
                await callbacks.onGate?.(output);
                return textResult(output.passed ? 'Test gate passed.' : 'Test gate failed.', output);
            }
        },
        {
            name: 'omp_test_report',
            label: 'Build test report',
            description: '生成测试增强报告',
            parameters: z.object({
                gateResults: z.optional(z.array(gateResultSchema)),
                runId: z.optional(z.string())
            }),
            execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
                const reportParams = params;
                const explicitResults = Array.isArray(reportParams.gateResults) ? reportParams.gateResults : undefined;
                const stateResults = explicitResults ?? callbacks.getRecentGateResults?.();
                if (!stateResults || stateResults.length === 0) {
                    return textResult('No test gate result found.', { found: false });
                }
                const output = buildTestReport({ gateResults: stateResults });
                await callbacks.onReport?.(output);
                return textResult(output.markdown, output);
            }
        }
    ];
}
export function analyzeTestTargets(input) {
    const changedFiles = readChangedFiles(input);
    const targets = classifyChangedFiles(changedFiles);
    return {
        runId: 'local-analysis',
        targets,
        warnings: [],
        nextTools: ['omp_test_context', 'omp_test_browser_check', 'omp_test_coverage_analyze', 'omp_test_mutation_context', 'omp_test_gate', 'omp_test_report']
    };
}
export function buildTestContext(input) {
    const target = readTargetInput(input);
    return buildContextForTarget(target, target.relatedTests ?? [], target.publicEntryHints ?? []);
}
export function analyzeCoverageReport(input) {
    const params = readCoverageParams(input);
    if (!params.coverageReport)
        return { status: 'missing-report', gaps: [] };
    return { status: 'available', gaps: collectCoverageGaps(params.coverageReport), ...(params.reportPath ? { reportPath: params.reportPath } : {}) };
}
export function analyzeMutationReport(input) {
    const params = readMutationParams(input);
    if (!params.mutationReport)
        return { status: 'missing-report', survivedMutants: [] };
    return { status: 'available', survivedMutants: collectMutationSurvivors(params.mutationReport), ...(params.reportPath ? { reportPath: params.reportPath } : {}) };
}
export function runTestGate(input, testCommandResult) {
    const candidate = readCandidate(input);
    const targets = readTargets(input);
    const results = [
        ...evaluateTestFileScopeGate({ candidate }),
        ...evaluateIndirectTestGate({ candidate, targets }),
        ...evaluateBrowserEvidenceGate(readBrowserEvidence(input)),
        ...evaluateTestCommandGate(testCommandResult)
    ];
    return {
        passed: results.every(result => result.passed || result.severity === 'warning'),
        results
    };
}
export function buildTestReport(input) {
    const gateResults = readGateResults(input);
    const failedResults = gateResults.filter(result => !result.passed && result.severity === 'blocker');
    const lines = ['# OMP Testing Enhancer report', '', `Result: ${failedResults.length === 0 ? 'passed' : 'failed'}`, ''];
    for (const result of gateResults) {
        if (result.severity === 'warning') {
            lines.push(`* ${result.gate}: warning, ${result.summary}`);
            lines.push(...evidenceLines(result.evidence));
            continue;
        }
        if (result.passed) {
            lines.push(`* ${result.gate}: passed`);
            continue;
        }
        lines.push(`* ${result.gate}: failed, ${result.summary}`);
        if (result.repairHint)
            lines.push(`  * Repair: ${result.repairHint}`);
        lines.push(...evidenceLines(result.evidence));
    }
    return { markdown: lines.join('\n') };
}
function evidenceLines(evidence) {
    if (!isRecord(evidence))
        return [];
    const lines = [];
    if (typeof evidence.category === 'string')
        lines.push(`  * Evidence: ${evidence.category}`);
    if (isRecord(evidence.details)) {
        if (typeof evidence.details.diffRatio === 'number')
            lines.push(`  * Diff ratio: ${evidence.details.diffRatio}`);
        if (typeof evidence.details.threshold === 'number')
            lines.push(`  * Threshold: ${evidence.details.threshold}`);
        if (typeof evidence.details.message === 'string')
            lines.push(`  * Message: ${evidence.details.message}`);
    }
    if (isRecord(evidence.artifacts)) {
        for (const key of ['actualImagePath', 'expectedImagePath', 'diffImagePath', 'tracePath', 'videoPath', 'harPath']) {
            const value = evidence.artifacts[key];
            if (typeof value === 'string')
                lines.push(`  * Artifact ${key}: ${value}`);
        }
    }
    return lines;
}
async function executeAnalyze(params, ctx) {
    const warnings = [];
    let files = [];
    if (Array.isArray(params.changedFiles)) {
        files = params.changedFiles.filter(isChangedFileInput);
    }
    else if (Array.isArray(params.files)) {
        files = await readRepoFiles(ctx.cwd, params.files);
        if (params.files.length > 0 && files.length === 0)
            warnings.push('No readable changed files detected. Check that requested files are relative paths inside the repository.');
        if (files.length > 0 && files.length < params.files.length)
            warnings.push('Some requested files were skipped because they are missing or outside the repository.');
    }
    else {
        const changedPaths = await readGitChangedPaths(ctx);
        if (changedPaths.length === 0)
            warnings.push('No changed files detected. Pass files to /test <file> or omp_test_analyze.files.');
        files = await readRepoFiles(ctx.cwd, changedPaths);
    }
    const targets = await enrichTargets(ctx.cwd, classifyChangedFiles(files));
    return {
        runId: `test-${Date.now().toString(36)}`,
        targets,
        warnings,
        nextTools: ['omp_test_context', 'omp_test_browser_check', 'omp_test_coverage_analyze', 'omp_test_mutation_context', 'omp_test_gate', 'omp_test_report']
    };
}
async function executeContext(params, ctx) {
    const target = readTarget(isRecord(params.target) ? params.target : {});
    const existingTests = target.relatedTests ?? await findRelatedTests(ctx.cwd, target.sourceFile);
    const publicEntryHints = target.publicEntryHints ?? await findPublicEntryHints(ctx.cwd, target.sourceFile, target.symbolName);
    return buildContextForTarget(target, existingTests, publicEntryHints);
}
async function executeCoverageAnalyze(params, ctx) {
    const report = params.coverageReport ?? await readJsonReport(ctx.cwd, params.reportPath);
    return analyzeCoverageReport({ coverageReport: report, reportPath: params.reportPath });
}
async function executeMutationAnalyze(params, ctx) {
    const report = params.mutationReport ?? await readJsonReport(ctx.cwd, params.reportPath);
    return analyzeMutationReport({ mutationReport: report, reportPath: params.reportPath });
}
async function readJsonReport(cwd, reportPath) {
    if (!reportPath)
        return undefined;
    try {
        return JSON.parse(await readFile(new URL(reportPath, `file://${cwd.endsWith('/') ? cwd : `${cwd}/`}`), 'utf8'));
    }
    catch {
        return undefined;
    }
}
async function executeGate(params, ctx) {
    const candidate = readCandidate(params);
    const targets = readTargets(params);
    const staticResults = [
        ...evaluateTestFileScopeGate({ candidate }),
        ...evaluateIndirectTestGate({ candidate, targets })
    ];
    const browserResults = evaluateBrowserEvidenceGate(readBrowserEvidence(params));
    const hasStaticBlocker = staticResults.some(result => !result.passed && result.severity === 'blocker');
    const command = hasStaticBlocker ? undefined : params.testCommand ?? (await readTestingEnhancerConfig(ctx.cwd))?.test.command;
    const commandResult = command ? await runConfiguredCommand(command, ctx) : undefined;
    const results = [...staticResults, ...browserResults, ...evaluateTestCommandGate(commandResult)];
    return {
        passed: results.every(result => result.passed || result.severity === 'warning'),
        results
    };
}
async function enrichTargets(cwd, targets) {
    const enriched = [];
    for (const target of targets) {
        enriched.push({
            ...target,
            relatedTests: await findRelatedTests(cwd, target.sourceFile),
            publicEntryHints: await findPublicEntryHints(cwd, target.sourceFile, target.symbolName)
        });
    }
    return enriched;
}
async function readGitChangedPaths(ctx) {
    if (!ctx.exec)
        return [];
    try {
        const result = await ctx.exec('git', ['diff', '--name-only', 'HEAD'], { cwd: ctx.cwd, timeout: 10000 });
        if (result.exitCode !== 0)
            return [];
        return result.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    }
    catch {
        return [];
    }
}
async function runConfiguredCommand(command, ctx) {
    const [program, ...args] = splitCommand(command);
    if (!program)
        return undefined;
    if (ctx.exec) {
        const result = await ctx.exec(program, args, { cwd: ctx.cwd, timeout: 120000 });
        return { command, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
    }
    return runCommandDirectly(command, program, args, ctx.cwd);
}
async function runCommandDirectly(command, program, args, cwd) {
    const { promise, resolve } = Promise.withResolvers();
    const child = spawn(program, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (result) => {
        if (settled)
            return;
        settled = true;
        clearTimeout(timeout);
        resolve(result);
    };
    const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        finish({
            command,
            exitCode: 1,
            stdout,
            stderr: stderr ? `${stderr}\nCommand timed out.` : 'Command timed out.'
        });
    }, 120000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += String(chunk); });
    child.stderr.on('data', chunk => { stderr += String(chunk); });
    child.on('error', error => {
        finish({ command, exitCode: 1, stdout, stderr: error.message });
    });
    child.on('close', code => {
        finish({ command, exitCode: code ?? 1, stdout, stderr });
    });
    return promise;
}
function splitCommand(command) {
    const tokens = [];
    let current = '';
    let quote;
    for (const char of command) {
        if (char === "'" && quote !== 'double') {
            quote = quote === 'single' ? undefined : 'single';
            continue;
        }
        if (char === '"' && quote !== 'single') {
            quote = quote === 'double' ? undefined : 'double';
            continue;
        }
        if (/\s/.test(char) && !quote) {
            if (current)
                tokens.push(current);
            current = '';
            continue;
        }
        current += char;
    }
    if (current)
        tokens.push(current);
    return tokens;
}
function buildContextForTarget(target, existingTests, publicEntryHints) {
    const indirectKinds = ['api-client', 'api-provider', 'service', 'repository', 'react-component', 'cli', 'unknown'];
    const testingStyle = indirectKinds.includes(target.kind) ? 'indirect' : 'direct';
    const browserPlan = buildBrowserPlanForTarget(target, existingTests);
    const propertyPlan = buildPropertyPlanForTarget(target);
    const apiPlan = buildApiPlanForTarget(target, publicEntryHints);
    if (testingStyle === 'direct') {
        const output = {
            targetId: target.id,
            testingStyle,
            guidance: 'Test the exported function directly with edge cases and error paths.',
            preferredAssertions: ['return value', 'thrown error', 'input invariant', ...(propertyPlan ? ['property invariant'] : [])],
            existingTests,
            publicEntryHints
        };
        if (browserPlan)
            output.browserPlan = browserPlan;
        if (propertyPlan)
            output.propertyPlan = propertyPlan;
        if (apiPlan)
            output.apiPlan = apiPlan;
        return output;
    }
    const preferredAssertions = ['public behavior', 'observable output', 'state change through public API'];
    if (browserPlan)
        preferredAssertions.push('visible UI output', 'role/name', 'user event result', 'browser error absence');
    const output = {
        targetId: target.id,
        testingStyle,
        guidance: 'Test through public behavior. Use a route, service method, UI output, CLI output, or persisted result instead of private implementation details.',
        preferredAssertions,
        existingTests,
        publicEntryHints
    };
    if (browserPlan)
        output.browserPlan = browserPlan;
    if (propertyPlan) {
        output.propertyPlan = propertyPlan;
        output.preferredAssertions.push('property invariant');
    }
    if (apiPlan) {
        output.apiPlan = apiPlan;
        output.preferredAssertions.push('HTTP status', 'response body', 'contract fields');
    }
    return output;
}
function buildPropertyPlanForTarget(target) {
    if (!['pure-function', 'validator', 'parser', 'formatter'].includes(target.kind))
        return undefined;
    const properties = [
        {
            name: 'input invariant',
            assertion: 'Generated valid inputs keep the documented invariant true.',
            repairHint: 'Use generated inputs for normal, boundary, empty, and malformed values; assert the public result, not internal branches.'
        }
    ];
    if (target.kind === 'pure-function') {
        properties.push({
            name: 'range bound',
            assertion: 'Generated numeric and boundary inputs keep the result inside the allowed range.',
            repairHint: 'Generate values around min, max, and outside the range; assert the result never leaves the allowed range.'
        });
    }
    if (target.kind === 'parser' || target.kind === 'formatter') {
        properties.push({
            name: 'round trip',
            assertion: 'Parsing and formatting preserve the semantic value for generated examples.',
            repairHint: 'Generate valid values, format them, parse the output, and assert semantic equality.'
        });
    }
    if (target.kind === 'validator') {
        properties.push({
            name: 'reject invalid input',
            assertion: 'Generated invalid inputs are rejected with public errors or false results.',
            repairHint: 'Generate missing fields, wrong types, empty strings, and boundary values; assert the public validation result.'
        });
    }
    return { frameworkSuggestion: 'fast-check', properties };
}
function buildApiPlanForTarget(target, publicEntryHints) {
    if (target.kind !== 'api-client' && target.kind !== 'api-provider')
        return undefined;
    const contractSources = publicEntryHints.filter(hint => /openapi|swagger|contract|pact|msw/i.test(hint));
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
    };
}
function buildBrowserPlanForTarget(target, existingTests) {
    const isFrontendTarget = target.kind === 'react-component' || isFrontendEntryFile(target.sourceFile) || existingTests.some(isBrowserTestPath);
    if (!isFrontendTarget)
        return undefined;
    return {
        framework: 'playwright',
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
    };
}
function isFrontendEntryFile(path) {
    return /(^|\/)(app|pages|routes)\//i.test(path) || /(^|\/)(page|layout|template|loading|error|not-found|App|Root|main)\.[cm]?[tj]sx?$/.test(path);
}
function isBrowserTestPath(path) {
    return /\.(browser|e2e)\.(test|spec)\.[cm]?[tj]sx?$/.test(path) || /(^|\/)(playwright|e2e|browser)(\/|$)/i.test(path);
}
function classifyChangedFiles(changedFiles) {
    return changedFiles
        .filter(file => /\.[cm]?[tj]sx?$/.test(file.path))
        .filter(file => !/\.(test|spec)\.[cm]?[tj]sx?$/.test(file.path))
        .map(file => {
        const symbolName = inferSymbolName(file);
        const kind = inferTargetKind(file, symbolName);
        const risk = inferRisk(kind);
        return {
            id: `${file.path}#${symbolName}`,
            sourceFile: file.path,
            symbolName,
            kind,
            risk
        };
    });
}
function textResult(text, details) {
    return { content: [{ type: 'text', text }], details };
}
function readChangedFiles(input) {
    if (!isRecord(input))
        return [];
    const value = input.changedFiles;
    if (!Array.isArray(value))
        return [];
    const files = [];
    for (const item of value) {
        if (isChangedFileInput(item))
            files.push(item);
    }
    return files;
}
function isChangedFileInput(value) {
    return isRecord(value) && typeof value.path === 'string' && typeof value.content === 'string';
}
function readTargetInput(input) {
    if (!isRecord(input))
        return fallbackTarget();
    if (!isRecord(input.target))
        return fallbackTarget();
    return readTarget(input.target);
}
function readTargets(input) {
    if (!isRecord(input))
        return [];
    if (!Array.isArray(input.targets))
        return [];
    const targets = [];
    for (const item of input.targets) {
        if (!isRecord(item))
            continue;
        targets.push(readTarget(item));
    }
    return targets;
}
function readCoverageParams(input) {
    if (!isRecord(input))
        return {};
    const params = {};
    if (isRecord(input.coverageReport))
        params.coverageReport = input.coverageReport;
    if (typeof input.reportPath === 'string')
        params.reportPath = input.reportPath;
    return params;
}
function readMutationParams(input) {
    if (!isRecord(input))
        return {};
    const params = {};
    if (isRecord(input.mutationReport))
        params.mutationReport = input.mutationReport;
    if (typeof input.reportPath === 'string')
        params.reportPath = input.reportPath;
    return params;
}
function collectCoverageGaps(report) {
    if (!isRecord(report))
        return [];
    const gaps = [];
    for (const [file, coverage] of Object.entries(report)) {
        if (!isRecord(coverage))
            continue;
        if (!isRecord(coverage.statementMap) || !isRecord(coverage.s))
            continue;
        for (const [id, count] of Object.entries(coverage.s)) {
            if (typeof count !== 'number' || count > 0)
                continue;
            const line = lineFromLocation(coverage.statementMap[id]);
            if (!line)
                continue;
            gaps.push({
                file,
                line,
                kind: 'statement',
                summary: `Statement on line ${line} is not covered.`,
                repairHint: 'Add a test that reaches this statement through public behavior.'
            });
        }
        if (isRecord(coverage.fnMap) && isRecord(coverage.f)) {
            for (const [id, count] of Object.entries(coverage.f)) {
                if (typeof count !== 'number' || count > 0)
                    continue;
                const meta = coverage.fnMap[id];
                const line = lineFromFunctionMeta(meta);
                if (!line)
                    continue;
                const symbolName = isRecord(meta) && typeof meta.name === 'string' ? meta.name : undefined;
                gaps.push({
                    file,
                    line,
                    kind: 'function',
                    ...(symbolName ? { symbolName } : {}),
                    summary: `Function${symbolName ? ` ${symbolName}` : ''} on line ${line} is not covered.`,
                    repairHint: 'Add a test that calls this public behavior or reaches it through the public entry point.'
                });
            }
        }
        if (isRecord(coverage.branchMap) && isRecord(coverage.b)) {
            for (const [id, counts] of Object.entries(coverage.b)) {
                if (!Array.isArray(counts))
                    continue;
                const branch = coverage.branchMap[id];
                const locations = isRecord(branch) && Array.isArray(branch.locations) ? branch.locations : [];
                counts.forEach((count, index) => {
                    if (typeof count !== 'number' || count > 0)
                        return;
                    const line = lineFromLocation(locations[index]) ?? lineFromLocation(branch);
                    if (!line)
                        return;
                    gaps.push({
                        file,
                        line,
                        kind: 'branch',
                        summary: `Branch path ${index + 1} on line ${line} is not covered.`,
                        repairHint: 'Add a test that drives the missing conditional branch through public behavior.'
                    });
                });
            }
        }
    }
    return gaps;
}
function collectMutationSurvivors(report) {
    if (!isRecord(report))
        return [];
    const files = isRecord(report.files) ? report.files : report;
    const survivors = [];
    for (const [file, fileReport] of Object.entries(files)) {
        if (!isRecord(fileReport) || !Array.isArray(fileReport.mutants))
            continue;
        for (const mutant of fileReport.mutants) {
            if (!isRecord(mutant))
                continue;
            if (mutant.status !== 'Survived' && mutant.status !== 'NoCoverage')
                continue;
            const line = lineFromLocation(mutant.location);
            if (!line)
                continue;
            const mutatorName = typeof mutant.mutatorName === 'string' ? mutant.mutatorName : undefined;
            const replacement = typeof mutant.replacement === 'string' ? mutant.replacement : undefined;
            survivors.push({
                file,
                line,
                ...(mutatorName ? { mutatorName } : {}),
                ...(replacement ? { replacement } : {}),
                summary: `${mutatorName ?? 'Mutation'} survived on line ${line}.`,
                repairHint: 'Add a test that fails when this mutant is applied, preferably through the public API.'
            });
        }
    }
    return survivors;
}
function lineFromFunctionMeta(value) {
    if (!isRecord(value))
        return undefined;
    return lineFromLocation(value.decl) ?? lineFromLocation(value.loc);
}
function lineFromLocation(value) {
    if (!isRecord(value))
        return undefined;
    if (isRecord(value.start) && typeof value.start.line === 'number')
        return value.start.line;
    if (typeof value.line === 'number')
        return value.line;
    return undefined;
}
function readBrowserEvidence(input) {
    if (!isRecord(input))
        return undefined;
    if (!isRecord(input.browserEvidence))
        return undefined;
    const evidence = input.browserEvidence;
    if (evidence.framework !== 'playwright')
        return undefined;
    if (evidence.status !== 'passed' && evidence.status !== 'failed' && evidence.status !== 'skipped')
        return undefined;
    if (!Array.isArray(evidence.findings))
        return undefined;
    if (!evidence.findings.every(isBrowserFindingValue))
        return undefined;
    return evidence;
}
function isBrowserFindingValue(value) {
    if (!isRecord(value))
        return false;
    if (value.gate !== 'browser-interaction' && value.gate !== 'browser-visual')
        return false;
    if (typeof value.passed !== 'boolean')
        return false;
    if (value.severity !== 'blocker' && value.severity !== 'warning')
        return false;
    if (value.category !== 'actionability' &&
        value.category !== 'console-error' &&
        value.category !== 'page-error' &&
        value.category !== 'network-failure' &&
        value.category !== 'accessibility' &&
        value.category !== 'visual-diff' &&
        value.category !== 'timeout' &&
        value.category !== 'setup')
        return false;
    return typeof value.summary === 'string';
}
function readTarget(input) {
    const kind = readTargetKind(input.kind);
    const risk = readRisk(input.risk, kind);
    const sourceFile = typeof input.sourceFile === 'string' ? input.sourceFile : 'unknown';
    const symbolName = typeof input.symbolName === 'string' ? input.symbolName : 'unknown';
    const id = typeof input.id === 'string' ? input.id : `${sourceFile}#${symbolName}`;
    const target = { id, sourceFile, symbolName, kind, risk };
    if (Array.isArray(input.relatedTests))
        target.relatedTests = input.relatedTests.filter((item) => typeof item === 'string');
    if (Array.isArray(input.publicEntryHints))
        target.publicEntryHints = input.publicEntryHints.filter((item) => typeof item === 'string');
    return target;
}
function readCandidate(input) {
    if (!isRecord(input))
        return fallbackCandidate();
    if (!isRecord(input.candidate))
        return fallbackCandidate();
    const candidate = input.candidate;
    const id = typeof candidate.id === 'string' ? candidate.id : 'candidate';
    const targetId = typeof candidate.targetId === 'string' ? candidate.targetId : 'target';
    const filesValue = candidate.files;
    const files = [];
    if (Array.isArray(filesValue)) {
        for (const item of filesValue) {
            if (!isRecord(item))
                continue;
            if (typeof item.path !== 'string')
                continue;
            if (typeof item.content !== 'string')
                continue;
            files.push({
                path: item.path,
                action: item.action === 'create' ? 'create' : 'modify',
                content: item.content
            });
        }
    }
    return { id, targetId, files };
}
function readGateResults(input) {
    if (!isRecord(input))
        return [];
    if (!Array.isArray(input.gateResults))
        return [];
    const results = [];
    for (const item of input.gateResults) {
        if (!isRecord(item))
            continue;
        if (!isGateNameValue(item.gate))
            continue;
        if (typeof item.passed !== 'boolean')
            continue;
        if (item.severity !== 'blocker' && item.severity !== 'warning')
            continue;
        if (typeof item.summary !== 'string')
            continue;
        const result = {
            gate: item.gate,
            passed: item.passed,
            severity: item.severity,
            summary: item.summary,
            evidence: item.evidence
        };
        if (typeof item.repairHint === 'string')
            result.repairHint = item.repairHint;
        results.push(result);
    }
    return results;
}
function isGateNameValue(value) {
    return value === 'indirect-test' ||
        value === 'test-file-scope' ||
        value === 'test-command' ||
        value === 'browser-interaction' ||
        value === 'browser-visual';
}
function inferSymbolName(file) {
    const symbolMatch = file.content.match(/export\s+(?:default\s+)?(?:class|function|const)\s+([A-Za-z0-9_]+)/);
    if (symbolMatch?.[1])
        return symbolMatch[1];
    const baseName = file.path.split('/').at(-1)?.replace(/\.[^.]+$/, '');
    if (baseName)
        return baseName;
    return 'module';
}
function inferTargetKind(file, symbolName) {
    if (/\.(jsx|tsx)$/.test(file.path))
        return 'react-component';
    if (/Service$/.test(symbolName) || /service/i.test(file.path))
        return 'service';
    if (/Repository$/.test(symbolName) || /repository/i.test(file.path))
        return 'repository';
    if (/Client$/.test(symbolName) || /client/i.test(file.path))
        return 'api-client';
    if (/Controller$/.test(symbolName) || /route|api/i.test(file.path))
        return 'api-provider';
    if (/cli/i.test(file.path))
        return 'cli';
    if (/parse|parser/i.test(symbolName) || /parser/i.test(file.path))
        return 'parser';
    if (/validate|schema/i.test(symbolName) || /validator|schema/i.test(file.path))
        return 'validator';
    if (/format/i.test(symbolName) || /formatter/i.test(file.path))
        return 'formatter';
    return 'pure-function';
}
function inferRisk(kind) {
    if (kind === 'api-provider' || kind === 'repository' || kind === 'service')
        return 'high';
    if (kind === 'api-client' || kind === 'react-component' || kind === 'cli')
        return 'medium';
    if (kind === 'unknown')
        return 'medium';
    return 'low';
}
function readTargetKind(input) {
    const allowed = ['pure-function', 'validator', 'parser', 'formatter', 'api-client', 'api-provider', 'service', 'repository', 'react-component', 'cli', 'unknown'];
    if (typeof input !== 'string')
        return 'unknown';
    if (allowed.includes(input))
        return input;
    return 'unknown';
}
function readRisk(input, kind) {
    if (input === 'low' || input === 'medium' || input === 'high')
        return input;
    return inferRisk(kind);
}
function fallbackTarget() {
    return {
        id: 'unknown#unknown',
        sourceFile: 'unknown',
        symbolName: 'unknown',
        kind: 'unknown',
        risk: 'medium'
    };
}
function fallbackCandidate() {
    return {
        id: 'candidate',
        targetId: 'target',
        files: []
    };
}
function isRecord(value) {
    if (typeof value !== 'object')
        return false;
    if (value === null)
        return false;
    if (Array.isArray(value))
        return false;
    return true;
}
