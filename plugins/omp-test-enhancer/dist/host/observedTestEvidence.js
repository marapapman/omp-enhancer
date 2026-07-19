import { createHash } from 'node:crypto';
import { isRecord } from '../utils.js';
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
]);
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
]);
export function observedTestCommandFromHostEvent(event, taskContextIdentity) {
    const command = trustedHostCommand(event);
    if (!command)
        return undefined;
    if (!isExplicitStandaloneTestCommand(command)
        || isNonExecutingTestProbe(command)
        || hasUnsafeShellControlSyntax(command))
        return undefined;
    const exitCodeValue = firstValue(event.exitCode, readNested(event, 'details', 'exitCode'), readNested(event, 'result', 'exitCode'), readNested(event, 'details', 'result', 'exitCode'));
    const exitCode = Number.isInteger(exitCodeValue)
        ? Number(exitCodeValue)
        : event.isError === false ? 0 : event.isError === true ? 1 : undefined;
    const resultText = hostToolResultText(event);
    if (exitCode !== 0 || !isExplicitPositiveTestOutput(resultText, command))
        return undefined;
    return {
        schemaVersion: 2,
        taskContextIdentity,
        commandDigest: createHash('sha256').update(command).digest('hex'),
        exitCode,
        observedAt: Date.now()
    };
}
export function trustedHostCommand(event) {
    const name = String(event.name ?? event.toolName ?? '').toLowerCase();
    if (!TRUSTED_HOST_TEST_EXECUTORS.has(name))
        return undefined;
    return firstString(event.command, readNested(event, 'input', 'command'), readNested(event, 'input', 'cmd'), readNested(event, 'params', 'command'), readNested(event, 'params', 'cmd'), readNested(event, 'details', 'input', 'command'), readNested(event, 'details', 'input', 'cmd'))?.trim();
}
export function isTrustedExplicitTestAttempt(event) {
    const command = trustedHostCommand(event);
    return Boolean(command && isExplicitStandaloneTestCommand(command));
}
export function isExplicitStandaloneTestCommand(command) {
    const text = String(command).trim().toLowerCase();
    const runner = text.replace(/^(?:npx|bunx|npm\s+exec|pnpm\s+exec|yarn\s+dlx)\s+(?:--\s+)?/, '');
    return /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test(?::[\w.-]+)?|unit|integration|e2e|check:test)\b/.test(text)
        || /^(?:node\s+--test|pytest|python(?:\d+(?:\.\d+)?)?\s+-m\s+(?:pytest|unittest|nox)|cargo\s+(?:test|nextest\s+run)|go\s+test|dotnet\s+(?:test|vstest)|(?:\.\/)?mvn(?:w)?\b[^\n]*\b(?:test|verify)\b|(?:\.\/)?gradle(?:w)?\b[^\n]*\b(?:test|check)\b|ctest|make\s+(?:test|check)|(?:bundle\s+exec\s+)?(?:\.\.?\/)?(?:\S+\/)*rspec|(?:\.\/)?(?:\S+\/)*phpunit|mix\s+test|swift\s+test|(?:bazel|bazelisk)\s+test|flutter\s+test|zig\s+build\s+test|(?:unittest|nose2|behave|robot)(?:\s|$)|xcodebuild\b[^\n]*\btest\b|(?:sbt|lein)\s+test|(?:\.\/)?(?:test|tests|run-tests?)\.sh\b)/.test(text)
        || /^(?:vitest|jest)(?:\s|$)|^deno\s+test\b|^(?:\.\.?\/)?(?:\S+\/)*playwright\s+test\b|^(?:\.\.?\/)?(?:\S+\/)*cypress\s+run\b|^(?:\.\.?\/)?(?:\S+\/)*mocha(?:\s|$)|^(?:\.\.?\/)?(?:\S+\/)*(?:tox|nox)(?:\s|$)/.test(runner);
}
export function hasUnsafeShellControlSyntax(command) {
    const source = String(command);
    let quote = null;
    let escaped = false;
    for (let index = 0; index < source.length; index += 1) {
        const char = source.charAt(index);
        const next = source.charAt(index + 1);
        if (char === '\r' || char === '\n')
            return true;
        if (escaped) {
            escaped = false;
            continue;
        }
        if (char === '\\' && quote !== "'") {
            escaped = true;
            continue;
        }
        if (quote) {
            if (char === quote)
                quote = null;
            else if (quote === '"' && (char === '`' || char === '$' && next === '('))
                return true;
            continue;
        }
        if (char === "'" || char === '"') {
            quote = char;
            continue;
        }
        if (';&|<>`'.includes(char) || char === '$' && next === '(')
            return true;
    }
    return quote !== null || escaped;
}
export function isNonExecutingTestProbe(command) {
    return /(?:^|\s)(?:--help|-h|--listtests|--list-tests|--collect-only|--passwithnotests)(?:\s|$)/i.test(command);
}
export function isExplicitPositiveTestOutput(value, command) {
    const text = String(value).trim();
    const goTestCommand = /^go\s+test\b/i.test(String(command).trim());
    const goExecutedSuite = text.split(/\r?\n/).some(line => /^ok\s+\S+/.test(line.trim()) && !/\[no test files\]/i.test(line));
    const gradleTestCommand = /^(?:\.\/)?gradle(?:w)?\b[^\n]*\b(?:test|check)\b/i.test(String(command).trim());
    const gradleTestTaskLines = text.split(/\r?\n/).filter(line => /^>\s*Task\s+:[^\n]*test\b/i.test(line.trim()));
    const gradleExecutedSuite = gradleTestTaskLines.some(line => !/\b(?:NO-SOURCE|SKIPPED|UP-TO-DATE|FROM-CACHE)\b/i.test(line));
    if (!text)
        return false;
    const unittestSummary = text.match(/\bran\s+([1-9]\d*)\s+tests?\b[\s\S]{0,160}(?:^|\n)\s*OK(?:\s*\(([^\n)]*)\))?\s*$/i);
    const unittestSkipped = unittestSummary?.[2]?.match(/\bskipped\s*=\s*(\d+)\b/i);
    if (unittestSummary && unittestSkipped
        && Number(unittestSkipped[1]) >= Number(unittestSummary[1]))
        return false;
    const phpunitIssueSummary = text.match(/\bOK,\s*but there were issues!(?=\s|$)[\s\S]{0,200}\btests?\s*:\s*([1-9]\d*)\s*,\s*assertions?\s*:\s*(\d+)\b/i);
    if (phpunitIssueSummary && Number(phpunitIssueSummary[2]) === 0)
        return false;
    const withoutZeroFailures = text
        .replace(/\b0\s+(?:tests?\s+)?fail(?:ed|ures?)\b/gi, '')
        .replace(/(?:^|\n)\s*#\s*fail\s+0\b/gi, '');
    if (/(?:^|\n)\s*not ok\b|\btests? failed\b|\b[1-9]\d*\s+(?:tests?\s+)?fail(?:s|ed|ures?)?\b|\b(?:failed|failing|failures?|errors?)\s*:\s*[1-9]\d*\b|(?:^|\n)\s*#\s*fail\s+[1-9]\d*\b|\bBUILD FAILED\b|\bfatal:|\berror:/i.test(withoutZeroFailures))
        return false;
    const hasCountedNonzeroSuite = /\b[1-9]\d*\s+(?:tests?\s+)?passed\b|\btests?\s+[1-9]\d*\s+passed\b|\b[1-9]\d*\s+passing\b|\b[1-9]\d*\s+pass\b|(?:^|\n)\s*#\s*pass\s+[1-9]\d*\b|\btest result:\s*ok\.[^\n]*\b[1-9]\d*\s+passed\b|\btests?\s+run:\s*[1-9]\d*\s*,\s*failures?\s*:\s*0\s*,\s*errors?\s*:\s*0\b|\bfailed\s*:\s*0\b[^\n]{0,120}\bpassed\s*:\s*[1-9]\d*\b|\bpassed\s*:\s*[1-9]\d*\b[^\n]{0,120}\bfailed\s*:\s*0\b|\btest summary\s*:\s*total\s*:\s*[1-9]\d*\s*,\s*failed\s*:\s*0\s*,\s*succeeded\s*:\s*[1-9]\d*\b|\btest run successful\b[^\n]{0,120}\btotal tests?\s*:\s*[1-9]\d*\b|\bran\s+[1-9]\d*\s+tests?\b[\s\S]{0,160}(?:^|\n)\s*OK(?:\s*\([^\n)]*\))?\s*$|\bOK,\s*but there were issues!\b[\s\S]{0,200}\btests?\s*:\s*[1-9]\d*\b|\b[1-9]\d*\s+tests?\s+completed\b|\b[1-9]\d*\s+examples?\s*,\s*0\s+failures?\b|\b100%\s+tests?\s+passed\b[^\n]{0,100}\b0\s+tests?\s+failed\s+out\s+of\s+[1-9]\d*\b|\bOK\s*\(\s*[1-9]\d*\s+tests?\s*,\s*[1-9]\d*\s+assertions?\s*\)|\bexecuted\s+[1-9]\d*\s+tests?\s*,\s*with\s+0\s+failures?\b|\b[1-9]\d*\s+tests?\s*,\s*0\s+failures?\b|\btests?\s*:\s*[1-9]\d*\b[\s\S]{0,200}\bpassing\s*:\s*[1-9]\d*\b[\s\S]{0,120}\bfailing\s*:\s*0\b/i.test(text);
    const hasPhpunitIssuesNonzeroSuite = Boolean(phpunitIssueSummary && Number(phpunitIssueSummary[2]) > 0);
    const hasWeakPositiveSuite = /(?:^|\n)\s*PASS\s+\S/i.test(text)
        || !goTestCommand && /(?:^|\n)\s*ok\s+\S+/i.test(text);
    const hasRunnerSpecificNonzeroSuite = goTestCommand && goExecutedSuite
        || gradleTestCommand && gradleExecutedSuite && /\bBUILD SUCCESSFUL\b/i.test(text);
    const hasEmptySuite = /\b(?:no tests? (?:found|collected|run)|zero tests?|ran\s+0\s+tests?|collected\s+0\s+(?:items?|tests?)|0\s+tests?\s+(?:passed|run|collected)|tests?\s+0\s+passed|0\s+passed|0\s+passing)\b/i.test(text)
        || /\[(?:no test files|no tests? to run)\]/i.test(text)
        || /(?:^|\n)\s*#\s*(?:pass|tests?)\s+0\b/i.test(text)
        || gradleTestCommand && gradleTestTaskLines.length > 0 && !gradleExecutedSuite;
    if (hasEmptySuite && !hasCountedNonzeroSuite && !hasRunnerSpecificNonzeroSuite && !hasPhpunitIssuesNonzeroSuite)
        return false;
    return hasCountedNonzeroSuite || hasWeakPositiveSuite || hasRunnerSpecificNonzeroSuite || hasPhpunitIssuesNonzeroSuite;
}
export function hostToolResultText(event) {
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
    ].flatMap(collectResultText).filter(Boolean).join('\n');
}
export function collectResultText(value) {
    const seen = new Set();
    const visit = (candidate) => {
        if (typeof candidate === 'string')
            return [candidate];
        if (Array.isArray(candidate)) {
            if (seen.has(candidate))
                return [];
            seen.add(candidate);
            return candidate.flatMap(item => visit(item));
        }
        if (!isRecord(candidate) || seen.has(candidate))
            return [];
        seen.add(candidate);
        return [candidate.text, candidate.output, candidate.stdout, candidate.content].flatMap(item => visit(item));
    };
    return visit(value);
}
export function isDefiniteWorkspaceMutationHostEvent(event) {
    const name = String(event.name ?? event.toolName ?? '').toLowerCase();
    if (TRUSTED_DIRECT_WORKSPACE_MUTATORS.has(name))
        return true;
    if (!TRUSTED_HOST_TEST_EXECUTORS.has(name))
        return false;
    const command = firstString(event.command, readNested(event, 'input', 'command'), readNested(event, 'input', 'cmd'), readNested(event, 'params', 'command'), readNested(event, 'params', 'cmd'), readNested(event, 'details', 'input', 'command'), readNested(event, 'details', 'input', 'cmd'))?.trim().toLowerCase();
    if (!command)
        return false;
    if (hasUnsafeShellControlSyntax(command))
        return true;
    if (isExplicitStandaloneTestCommand(command)
        && /(?:--updateSnapshot\b|--update-snapshots?\b|(?:^|\s)-u(?:\s|$))/i.test(command))
        return true;
    if (isExplicitStandaloneTestCommand(command))
        return false;
    if (/^git\s+(?:add\b|tag\b(?![^\n]*(?:-d|--delete|-f|--force)))/.test(command))
        return false;
    if (/^git\s+(?:status|diff|log|show|rev-parse|ls-files)\b/.test(command)
        || /^(?:rg|grep|ls|pwd|cat|head|tail|wc|stat|file|which|jq|sha\d*sum)\b/.test(command)
        || /^sed\s+-n\b/.test(command)
        || /^node\s+--check\b/.test(command)
        || /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:lint|typecheck|check(?::(?!test)[\w.-]+)?)\b(?![^\n]*--fix)/.test(command))
        return false;
    return true;
}
function readNested(value, ...keys) {
    let current = value;
    for (const key of keys) {
        if (!isRecord(current))
            return undefined;
        current = current[key];
    }
    return current;
}
function firstString(...values) {
    return values.find((value) => typeof value === 'string' && value.trim() !== '');
}
function firstValue(...values) {
    return values.find(value => value !== undefined);
}
