import {
  analyzeExternalActionContracts,
  analyzeExternalActionPrompt,
  normalizeExternalActionContract,
} from './external-action-policy.js';
import { createHash } from 'node:crypto';

const DOMAIN_ORDER = [
  'general',
  'code',
  'tests',
  'writing',
  'document',
  'facts',
  'security',
  'config',
  'visual',
  'plugin',
];

const OPERATION_VALUES = new Set(['answer', 'inspect', 'diagnose', 'modify', 'create', 'execute', 'release']);
const PHASE_KIND_VALUES = new Set(['answer', 'inspect', 'diagnose', 'modify', 'create', 'execute', 'verify', 'review', 'release']);
const DOMAIN_VALUES = new Set(DOMAIN_ORDER);
const TEST_EXCLUSION_ORDER = ['unit', 'integration', 'e2e', 'smoke', 'full-suite'];
const TEST_EXCLUSION_VALUES = new Set(TEST_EXCLUSION_ORDER);

const CAPABILITY_ORDER = [
  'fs.read',
  'fs.write',
  'shell.execute',
  'tests.execute',
  'network.read',
  'browser',
  'subagents',
  'external.write',
  'credentials',
];

const RISK_FLAG_ORDER = [
  'external-write',
  'security-sensitive',
  'test-execution',
  'workspace-write',
  'factual-claims',
  'network-read',
  'irreversible-file-operation',
  'credential-dependent',
  'user-approval-required',
  'ambiguous',
];

const DEFAULT_CONSTRAINTS = Object.freeze({
  workspaceWrite: 'forbidden',
  testExecution: 'unspecified',
  networkAccess: 'unspecified',
  externalWrite: 'forbidden',
  subagents: 'unspecified',
});

export function describeNaturalLanguageTask(input = {}) {
  const prompt = String(input.prompt ?? input.text ?? '');
  const directivePrompt = writingDirectivePromptForSignals(prompt);
  const operationalPrompt = writingOperationalPromptForSignals(directivePrompt);
  const text = operationalPrompt.toLowerCase();
  const promptLanguage = languageFor(prompt);
  if (isCompletedGateStatusReport(text)) {
    return normalizeTaskDescriptor({
      version: 1,
      operation: 'diagnose',
      domains: ['plugin'],
      constraints: DEFAULT_CONSTRAINTS,
      capabilities: ['fs.read', 'shell.execute'],
      phases: [{ kind: 'inspect', domain: 'plugin' }, { kind: 'diagnose', domain: 'plugin' }],
      risk: { level: 'low', flags: [] },
      complexity: 'focused',
      language: promptLanguage,
      provenance: {
        ruleConfidence: 0.99,
        reasons: ['completed gate status report'],
        requiresPolicyRoute: false,
        needsClassifier: false,
      },
    });
  }
  if (isExclusiveRouteTaskDiagnosticProbe(text)) {
    const probePrompt = exclusiveRouteProbePrompt(prompt);
    return normalizeTaskDescriptor({
      version: 1,
      operation: 'diagnose',
      domains: ['plugin'],
      constraints: {
        workspaceWrite: 'forbidden',
        testExecution: 'forbidden',
        networkAccess: 'forbidden',
        externalWrite: 'forbidden',
        subagents: 'forbidden',
      },
      capabilities: ['fs.read'],
      phases: [{ kind: 'inspect', domain: 'plugin' }, { kind: 'diagnose', domain: 'plugin' }],
      risk: { level: 'low', flags: [] },
      complexity: 'focused',
      language: promptLanguage,
      exclusiveToolContract: makeExclusiveToolContract('omp_core_route_task', {
        kind: 'route-probe',
        ...(probePrompt ? { digest: descriptorDigest(probePrompt) } : { status: 'ambiguous' }),
      }),
      provenance: {
        ruleConfidence: 0.99,
        reasons: ['exclusive route task diagnostic probe'],
        requiresPolicyRoute: true,
        needsClassifier: false,
      },
    });
  }
  if (isExclusiveSubagentStatusDiagnosticProbe(text)) {
    return normalizeTaskDescriptor({
      version: 1,
      operation: 'diagnose',
      domains: ['plugin'],
      constraints: {
        workspaceWrite: 'forbidden',
        testExecution: 'forbidden',
        networkAccess: 'forbidden',
        externalWrite: 'forbidden',
        subagents: 'forbidden',
      },
      capabilities: ['fs.read'],
      phases: [{ kind: 'inspect', domain: 'plugin' }, { kind: 'diagnose', domain: 'plugin' }],
      risk: { level: 'low', flags: [] },
      complexity: 'focused',
      language: promptLanguage,
      exclusiveToolContract: makeExclusiveToolContract('omp_core_subagent_status', {
        kind: 'status-probe',
        digest: descriptorDigest('{}'),
      }),
      provenance: {
        ruleConfidence: 0.99,
        reasons: ['exclusive subagent status diagnostic probe'],
        requiresPolicyRoute: true,
        needsClassifier: false,
      },
    });
  }
  if (isRouteStatusSkillDiagnosticProbe(text)) {
    return normalizeTaskDescriptor({
      version: 1,
      operation: 'diagnose',
      domains: ['plugin'],
      constraints: { ...DEFAULT_CONSTRAINTS, testExecution: 'forbidden' },
      capabilities: ['fs.read', 'shell.execute'],
      phases: [{ kind: 'inspect', domain: 'plugin' }, { kind: 'diagnose', domain: 'plugin' }],
      risk: { level: 'low', flags: [] },
      complexity: 'focused',
      language: promptLanguage,
      provenance: {
        ruleConfidence: 0.99,
        reasons: ['route status skill diagnostic probe'],
        requiresPolicyRoute: true,
        needsClassifier: false,
      },
    });
  }
  const signals = collectSignals(text, operationalPrompt, {
    scopePrompt: directivePrompt,
    rawPrompt: directivePrompt,
  });
  const language = signals.writingWork
    ? resolveWritingTargetLanguage(directivePrompt, promptLanguage)
    : promptLanguage;
  const operation = operationFor(signals);
  const domains = domainsFor(signals, operation);
  const constraints = constraintsFor(signals, operation, domains);
  const complexity = complexityFor(signals, operation, domains);
  const capabilities = capabilitiesFor({ operation, domains, constraints, complexity });
  const phases = phasesFor({ operation, domains, constraints, signals });
  const risk = riskFor({ operation, domains, constraints, signals });
  const requiresPolicyRoute = shouldUseDescriptorPolicy({ operation, domains, constraints, phases, signals });

  return normalizeTaskDescriptor({
    version: 1,
    operation,
    domains,
    constraints,
    workspaceWriteTargets: signals.workspaceWriteTargets,
    workspaceWriteExclusions: signals.workspaceWriteExclusions,
    externalWriteTargets: signals.externalWriteTargets,
    externalWriteExclusions: signals.externalWriteExclusions,
    externalActionContract: signals.externalActionContract,
    externalActionContracts: signals.externalActionContracts,
    testAllowlist: signals.testAllowlist,
    testExclusions: signals.testExclusions,
    testExecutionTargets: signals.testExecutionTargets,
    testExecutionCommand: signals.testExecutionCommand,
    exclusiveToolContract: signals.exclusiveToolContract,
    capabilities,
    phases,
    risk,
    complexity,
    language,
    provenance: {
      ruleConfidence: requiresPolicyRoute ? 0.94 : 0.72,
      reasons: signals.reasons,
      requiresPolicyRoute,
      needsClassifier: signals.ambiguous,
    },
  });
}

export function descriptorFromLegacyIntent(intent = 'unknown', options = {}) {
  const normalized = String(intent || 'unknown');
  const language = options.language ?? languageFor(options.prompt ?? '');
  const focused = options.auditMode === 'focused';

  if (normalized === 'testing' || normalized === 'code.test') {
    return legacyDescriptor({
      operation: 'execute',
      domains: ['tests'],
      constraints: { testExecution: 'required' },
      phases: [{ kind: 'verify', domain: 'tests' }],
      risk: { level: 'medium', flags: ['test-execution'] },
      complexity: 'focused',
      language,
    });
  }

  const canonical = canonicalLegacyIntent(normalized);
  const templates = {
    'agentic.simple': {
      operation: 'answer', domains: ['general'], phases: [{ kind: 'answer', domain: 'general' }],
    },
    'writing.zh': writingLegacyTemplate('zh'),
    'writing.en': writingLegacyTemplate('en'),
    'writing.latex': writingLegacyTemplate(language, 'document'),
    'writing.markdown': writingLegacyTemplate(language, 'document'),
    'doc.convert.word': {
      operation: 'modify', domains: ['document'], constraints: { workspaceWrite: 'required' },
      phases: [{ kind: 'inspect', domain: 'document' }, { kind: 'modify', domain: 'document' }, { kind: 'review', domain: 'document' }],
    },
    'factcheck.document': {
      operation: 'inspect', domains: ['facts'], constraints: { networkAccess: 'required' },
      phases: [{ kind: 'inspect', domain: 'facts' }], risk: { level: 'medium', flags: ['factual-claims', 'network-read'] }, complexity: 'broad',
    },
    'code.dev': {
      operation: 'modify', domains: ['code', 'tests'], constraints: { workspaceWrite: 'required', testExecution: 'required' },
      phases: [{ kind: 'inspect', domain: 'code' }, { kind: 'modify', domain: 'code' }, { kind: 'verify', domain: 'tests' }, { kind: 'review', domain: 'code' }],
      risk: { level: 'medium', flags: ['test-execution', 'workspace-write'] }, complexity: focused ? 'focused' : 'broad',
    },
    'code.debug': {
      operation: 'diagnose', domains: ['code'],
      phases: [{ kind: 'inspect', domain: 'code' }, { kind: 'diagnose', domain: 'code' }], complexity: 'focused',
    },
    'code.review': {
      operation: 'inspect', domains: ['code'],
      phases: [{ kind: 'inspect', domain: 'code' }, { kind: 'review', domain: 'code' }], complexity: focused ? 'focused' : 'broad',
    },
    'omp.plugin': {
      operation: 'inspect', domains: ['plugin'],
      phases: [{ kind: 'inspect', domain: 'plugin' }], complexity: focused ? 'focused' : 'broad',
    },
    'security.review': {
      operation: 'inspect', domains: ['security'],
      phases: [{ kind: 'inspect', domain: 'security' }, { kind: 'review', domain: 'security' }],
      risk: { level: 'high', flags: ['security-sensitive'] }, complexity: 'broad',
    },
    'design.visual': {
      operation: 'create', domains: ['visual'], constraints: { workspaceWrite: 'required' },
      phases: [{ kind: 'create', domain: 'visual' }, { kind: 'review', domain: 'visual' }], complexity: 'focused',
    },
    release: {
      operation: 'release', domains: ['plugin'],
      constraints: { networkAccess: 'required', externalWrite: 'required' },
      phases: [{ kind: 'release', domain: 'plugin' }],
      risk: { level: 'high', flags: ['external-write'] }, complexity: 'focused',
    },
    unknown: {
      operation: 'answer', domains: ['general'], phases: [{ kind: 'answer', domain: 'general' }],
    },
  };

  return legacyDescriptor({ ...(templates[canonical] ?? templates.unknown), language });
}

export function normalizeTaskDescriptor(value = {}) {
  const operation = OPERATION_VALUES.has(value.operation) ? value.operation : 'answer';
  const constraints = normalizeConstraints(value.constraints);
  if (operation === 'answer' || operation === 'inspect') constraints.externalWrite = 'forbidden';
  const workspaceWriteTargets = constraints.workspaceWrite === 'required'
    ? normalizeScopedTargets(value.workspaceWriteTargets)
    : [];
  const workspaceWriteExclusions = normalizeScopedTargets(value.workspaceWriteExclusions);
  const externalWriteTargets = constraints.externalWrite === 'required'
    ? normalizeScopedTargets(value.externalWriteTargets)
    : [];
  const externalWriteExclusions = normalizeScopedTargets(value.externalWriteExclusions);
  const externalActionContract = normalizeExternalActionContract(value.externalActionContract);
  const externalActionContracts = (Array.isArray(value.externalActionContracts)
    ? value.externalActionContracts
    : externalActionContract ? [externalActionContract] : [])
    .map((entry) => normalizeExternalActionContract(entry))
    .filter(Boolean);
  const testAllowlist = constraints.testExecution === 'forbidden'
    ? []
    : orderedUnique(
      (Array.isArray(value.testAllowlist) ? value.testAllowlist : [])
        .filter((kind) => TEST_EXCLUSION_VALUES.has(kind)),
      TEST_EXCLUSION_ORDER,
    );
  const testExclusions = constraints.testExecution === 'forbidden'
    ? []
    : orderedUnique(
      (Array.isArray(value.testExclusions) ? value.testExclusions : [])
        .filter((kind) => TEST_EXCLUSION_VALUES.has(kind)),
      TEST_EXCLUSION_ORDER,
    );
  const testExecutionTargets = constraints.testExecution === 'required'
    ? normalizeTestExecutionTargets(value.testExecutionTargets)
    : [];
  const testExecutionCommand = constraints.testExecution === 'required'
    ? normalizeTestExecutionCommand(value.testExecutionCommand)
    : '';
  const normalizedDomains = (value.domains?.length ? value.domains : ['general'])
    .filter((domain) => DOMAIN_VALUES.has(domain));
  const domains = orderedUnique(normalizedDomains.length ? normalizedDomains : ['general'], DOMAIN_ORDER);
  const exclusiveToolContract = normalizeExclusiveToolContract(value.exclusiveToolContract, {
    operation,
    domains,
    constraints,
    testExecutionCommand,
  });
  const complexity = ['simple', 'focused', 'broad'].includes(value.complexity) ? value.complexity : 'focused';
  const capabilityCeiling = new Set(capabilitiesFor({
    operation,
    domains,
    constraints,
    complexity,
  }));
  const requestedCapabilities = Array.isArray(value.capabilities)
    ? value.capabilities
    : [...capabilityCeiling];
  const capabilities = orderedUnique(
    requestedCapabilities.filter((capability) => capabilityCeiling.has(capability)),
    CAPABILITY_ORDER,
  );
  const phases = uniquePhases(value.phases ?? [])
    .filter((phase) => phaseAllowedByConstraints(phase, constraints));
  const risk = {
    level: ['low', 'medium', 'high', 'critical'].includes(value.risk?.level) ? value.risk.level : 'low',
    flags: orderedUnique(value.risk?.flags ?? [], RISK_FLAG_ORDER),
  };
  return {
    version: 1,
    operation,
    domains,
    constraints,
    workspaceWriteTargets,
    workspaceWriteExclusions,
    externalWriteTargets,
    externalWriteExclusions,
    externalActionContract,
    externalActionContracts,
    testAllowlist,
    testExclusions,
    testExecutionTargets,
    ...(testExecutionCommand ? { testExecutionCommand } : {}),
    ...(exclusiveToolContract ? { exclusiveToolContract } : {}),
    capabilities,
    phases: phases.length ? phases : [defaultPhaseFor(operation, domains)],
    risk,
    complexity,
    language: ['zh', 'en', 'mixed', 'unknown'].includes(value.language) ? value.language : 'unknown',
    provenance: {
      ruleConfidence: clamp(value.provenance?.ruleConfidence ?? 1),
      reasons: uniqueStrings(value.provenance?.reasons ?? []),
      requiresPolicyRoute: value.provenance?.requiresPolicyRoute === true,
      needsClassifier: value.provenance?.needsClassifier === true,
    },
  };
}

function collectSignals(text, prompt, { scopePrompt = prompt, rawPrompt = prompt } = {}) {
  const positiveDomainText = positiveDomainSignalText(text);
  const rawExclusiveCompanionMutation = hasExclusiveCompanionMutation(rawPrompt);
  const externalActionContract = analyzeExternalActionPrompt(prompt);
  const externalActionContracts = analyzeExternalActionContracts(prompt);
  const externalActionRequested = ['complete', 'incomplete', 'conflicting'].includes(externalActionContract?.state);
  const workspaceScopes = workspaceWriteScopesFor(scopePrompt);
  const externalScopes = externalWriteScopesFor(prompt);
  const workspaceConstraintText = maskScopedWorkspaceWriteNegatives(normalizeAffirmativeWorkspacePhrases(stripQuotedConstraintMentions(text)));
  const testConstraintText = maskAffirmativeTestPhrases(text);
  const testAllowlist = testAllowlistFor(testConstraintText);
  const testExclusions = testExclusionsFor(testConstraintText);
  const testExecutionBinding = testExecutionBindingFor(prompt);
  const testExecutionTargets = testExecutionBinding.ambiguous
    ? []
    : testExecutionBinding.targets.length
    ? testExecutionBinding.targets
    : testExecutionTargetsFor(prompt);
  const globalTestConstraintText = maskSelectiveTestExclusions(testConstraintText);
  const networkConstraintText = maskAffirmativeNetworkPhrases(text);
  const externalConstraintText = maskScopedExternalWriteNegatives(normalizeAffirmativeExternalWritePhrases(text));
  const subagentConstraintText = normalizeAffirmativeSubagentPhrases(text);
  const documentTargetWithCodeExclusion = workspaceScopes.targets.some((target) => /(?:^|\/)(?:readme(?:\.[a-z0-9]+)?|[^/]+\.(?:md|mdx|rst|txt|tex|docx?))$/i.test(target))
    && /(?:不要|不|别|不得|禁止)\s*(?:修改|改动|编辑|更新|写入|触碰)\s*(?:代码|源代码)|\b(?:do not|don't|never)\s+(?:modify|edit|change|update|write(?:\s+to)?|touch)\s+(?:the\s+)?(?:code|source code)\b/i.test(workspaceConstraintText);
  const testArtifactWriteWithCodeExclusion = (
    /(?:补充|补|添加|新增|编写|写)\s*(?:一些|一组)?\s*(?:(?:高信号|聚焦|安全|单元|回归|集成|端到端|e2e|边界|错误路径)\s*)*(?:测试(?!报告|总结|说明|结果|覆盖率|计划|文档)|用例)/.test(positiveDomainText)
    || /\b(?:add|write|create)\s+(?:(?:exactly|only)\s+)?(?:(?:an?|one)\s+)?(?:(?:high[- ]signal|focused|new|additional|security|unit|regression|integration|e2e|boundary)\s+)*(?:tests?|test cases?)\b(?!\s+(?:report|summary|results?|plan|document|email|notes?|coverage))/.test(positiveDomainText)
  ) && (
    /(?:不要|不|别|不得|禁止)\s*(?:修改|改动|编辑|更新|写入|触碰|更改|改)\s*(?:任何)?\s*(?:生产|业务|项目)?\s*(?:代码|源码|实现)/.test(workspaceConstraintText)
    || /\b(?:do not|don't|never)\s+(?:modify|edit|change|update|write(?:\s+to)?|touch)\s+(?:the\s+)?(?:production\s+)?(?:code|implementation)\b/.test(workspaceConstraintText)
    || /\bwithout\s+(?:(?:modifying|editing|changing|updating|writing\s+to|touching)\s+(?:the\s+)?(?:production\s+)?(?:code|implementation)|(?:production\s+)?(?:code|implementation)\s+changes?)\b/.test(workspaceConstraintText)
  );
  const boundedWorkspaceWritePattern = /(?:不要|不|别|无需|不用|禁止|不得)\s*(?:修改|改动|编辑|更新|写入|触碰)\s*(?:任何)?\s*(?:其他|其它|其余)\s*(?:文件|代码|内容)?|\b(?:do not|don't|never)\s+(?:modify|edit|change|update|write(?:\s+to)?|touch)\s+(?:any\s+)?other\s+(?:files?|code)\b/gi;
  const boundedWorkspaceWriteTarget = workspaceScopes.targets.length > 0
    && boundedWorkspaceWritePattern.test(workspaceConstraintText);
  boundedWorkspaceWritePattern.lastIndex = 0;
  const workspaceWriteCeilingText = boundedWorkspaceWriteTarget
    ? workspaceConstraintText.replace(boundedWorkspaceWritePattern, ' ')
    : workspaceConstraintText;
  const noWorkspaceWrite = !documentTargetWithCodeExclusion
    && !testArtifactWriteWithCodeExclusion
    && (/(?:不要|不|别|无需|不用|禁止|不得)\s*(?:实际)?(?:做|进行)?\s*(?:任何|全部|所有)?\s*(?:修改|改动|改变|更改|改|编辑|写入|修复|实现)\s*(?:(?:任何|全部|所有)?\s*(?:代码|源代码|文件|实现|工作区|内容|项目|仓库|代码库|它)|(?=[，。；、：;,:.!\n]|$))|(?:只读|只检查|只分析|只报告|仅报告)|\bread[- ]?only\b|\bno\s+(?:edits?|changes?|writes?|modifications?)\b|(?:do not|don't|without|no need to)\s+(?:actually\s+)?(?:modify(?:ing)?|edit(?:ing)?|chang(?:e|ing)|writ(?:e|ing)(?:\s+to)?|fix(?:ing)?|implement(?:ing)?)\s*(?:(?:(?:any|all)\s+)?(?:code|source\s+code|files?|implementation|workspace|project|repository|repo|it|anything)\b|(?=[,.;!\n]|$))|(?:report|findings?)\s+only/.test(workspaceWriteCeilingText)
      || chineseNegativeClauseIncludes(workspaceWriteCeilingText, /(?:修改|改动|改变|更改|编辑|写入|修复|实现|改)\s*(?:任何|全部|所有)?\s*(?:代码|源代码|文件|实现|工作区|内容|项目|仓库|代码库|它)/i)
      || englishSharedNegativeClauseIncludes(workspaceWriteCeilingText, /\b(?:modify(?:ing)?|edit(?:ing)?|chang(?:e|ing)|writ(?:e|ing)(?:\s+to)?|fix(?:ing)?|implement(?:ing)?)\b.{0,20}\b(?:code|source\s+code|files?|implementation|workspace|project|repository|repo|it|anything)\b/i)
      || /\bno\b[^.;!\n]{1,80}\b(?:or|and)\s+(?:edits?|changes?|writes?|modifications?)\b/i.test(workspaceWriteCeilingText));
  const noActionExecution = /(?:不要|不|别|无需|不用|禁止|不得)\s*(?:实际)?(?:执行|运行)(?!\s*(?:测试|tests?))\s*(?:(?:任何|这个|该|上述)\s*)?(?:操作|命令|动作|内容)?\s*(?:[，。；;,.!！]|$)|(?:do not|don't|without|no need to)\s+(?:actually\s+)?(?:execute|run|perform|do)(?!\s+tests?)(?:\s+(?:it|anything|the\s+(?:command|action|operation)))?\s*(?:[,.;!]|$)|without\s+(?:actually\s+)?doing\s+it/.test(text);
  const instructionalAdvice = /(?:请)?(?:告诉|解释|说明)(?:我)?.{0,16}(?:如何|怎么)|(?:如何|怎么).{0,12}(?:做|操作|执行|删除|推送)|\bhow\s+(?:do|can|should|would)\s+i\b|\bexplain\s+how\s+to\b/.test(text);
  const advisory = /有什么.{0,30}(?:优化|改进).{0,12}(?:地方|建议)|(?:可以|可).{0,12}(?:优化|改进)|(?:优化|改进)建议|给出.{0,12}(?:优化|改进)建议|suggest\s+(?:improvements?|optimizations?)|assess\s+whether.{0,30}(?:reasonable|sound)/.test(text);
  const observedTestSummaryWriting = /(?:总结|汇总|归纳|整理).{0,96}(?:已观测|观察到|本轮|这一轮|当前|e2e|测试|验证|诊断).{0,96}(?:结果|问题|观察|现象|结论|记录|发现)/.test(text)
    || /(?:本轮|这一轮|当前).{0,48}(?:测试|验证|e2e).{0,48}(?:暴露|发现).{0,16}(?:哪些)?问题/.test(text)
    || /\b(?:summarize|summarise|condense)\b.{0,96}\b(?:observed|completed|previous|e2e|test|testing|diagnostic)\b.{0,96}\b(?:results?|issues?|observations?|findings?|failures?|notes?)\b/.test(text);
  const observedSummaryRerunRequested = observedTestSummaryWriting && (
    /(?:然后|并且|同时|接着).{0,24}(?:重新运行|重跑|运行|执行).{0,16}(?:失败)?测试/.test(text)
    || /\b(?:then|and|also)\b.{0,24}\b(?:rerun|run|execute)\b.{0,16}\b(?:failed\s+)?tests?\b/.test(text)
    || /^(?:请\s*)?(?:重新运行|重跑|运行|执行).{0,16}(?:失败)?测试/.test(text.trim())
    || /^(?:(?:please)\s+)?(?:rerun|run|execute)\b.{0,16}\b(?:failed\s+)?tests?\b/.test(text.trim())
  );
  const laterExactTestExecution = /(?:^|[.;；。]\s*|\b(?:then|next)\s+)(?:(?:please)\s+)?(?:run|execute|rerun)\s+(?:exactly\s+)?(?:node\s+--test\s+)?[`'"]?(?:\.\/)?(?:[a-z0-9_.-]+\/)*[a-z0-9_.-]+(?:\.test|\.spec)\.[cm]?[jt]sx?/i.test(globalTestConstraintText)
    || /(?:^|[；。]\s*|(?:然后|接着|再)\s*)(?:请)?(?:运行|执行|跑|重跑)\s*(?:node\s+--test\s+)?[`'"]?(?:\.\/)?(?:[a-z0-9_.-]+\/)*[a-z0-9_.-]+(?:\.test|\.spec)\.[cm]?[jt]sx?/i.test(globalTestConstraintText);
  const noTestExecution = !testExecutionBinding.command && !laterExactTestExecution && (/(?:(?:不要|别|无需|不用|禁止|不得)[^，。；;,.!\n]{0,16}|不\s*(?:再|重新)?\s*)(?:运行|执行|跑|重跑)[^，。；;,.!\n]{0,12}(?:测试|test)|(?:测试|test)[^，。；;,.!\n]{0,16}(?:(?:不要|别|禁止|不得)[^，。；;,.!\n]{0,8}|不\s*(?:再|重新)?\s*)(?:运行|执行)|(?:do not|don't|without)[^,.;!\n]{0,18}(?:run|execute|rerun)[^,.;!\n]{0,12}(?:tests?|testing)|(?:command|命令).{0,24}(?:不要|不|别|禁止|不得|do not|don't).{0,8}(?:执行|运行|execute|run)/.test(globalTestConstraintText)
    || hasNaturalNoTestExecution(globalTestConstraintText)
    || chineseNegativeClauseIncludes(globalTestConstraintText, /(?:运行|执行|跑|重跑)?\s*(?:测试|test)/i)
    || englishNegativeClauseIncludes(globalTestConstraintText, /\b(?:(?:run|execute|rerun|do)\s+)?(?:the\s+)?(?:tests?|testing)\b/i)
    || observedTestSummaryWriting && !observedSummaryRerunRequested);
  const noExternalWrite = hasExplicitNoExternalWrite(externalConstraintText)
    || chineseNegativeClauseIncludes(externalConstraintText, /(?:提交|推送|发布|部署|上线|升级\s*(?:插件|marketplace))/i)
    || englishNegativeClauseIncludes(externalConstraintText, /\b(?:push|publish|release|deploy)\b/i);
  const noNetworkAccess = /(?:只|仅).{0,12}(?:本地|离线)|(?:local|offline)\s+only/.test(networkConstraintText)
    || hasNaturalNoNetworkAccess(networkConstraintText)
    || chineseNegativeClauseIncludes(networkConstraintText, /(?:上网|联网|外网|互联网|网络|网页搜索|网络搜索)/i)
    || englishNegativeClauseIncludes(networkConstraintText, /\b(?:(?:use|access|browse|search)\s+(?:the\s+)?(?:web|internet|network|online(?:\s+sources?)?)|go\s+online)\b/i);
  const noSubagents = /(?:不要|不|别|无需|不用|禁止|不得).{0,18}(?:子代理|子 agent|subagent|sub-agent)|(?:只由|仅由).{0,12}(?:主代理|主 agent|main agent)|(?:do not|don't|without|no).{0,18}(?:subagents?|sub-agents?)|(?:main agent only|only the main agent)/.test(subagentConstraintText)
    || chineseNegativeClauseIncludes(subagentConstraintText, /(?:子代理|子\s*agent|subagents?|sub-agents?)/i)
    || englishNegativeClauseIncludes(subagentConstraintText, /\b(?:use\s+)?(?:subagents?|sub-agents?)\b/i);
  const releaseArtifact = /(?:release notes?|changelog|发布公告|发布说明|release announcement|release report)/.test(text);
  const dependencyUpgrade = /(?:升级|更新).{0,18}(?:npm|依赖|dependenc(?:y|ies)|packages?)|\b(?:upgrade|update).{0,18}(?:dependenc(?:y|ies)|packages?)\b/.test(text);
  const localReleaseCache = /(?:发布缓存|release cache)/.test(text);
  const releaseConcept = /(?:release|发布).{0,12}(?:是什么|含义|概念)|(?:what is|explain).{0,18}(?:a\s+)?release\b/.test(text);
  const releaseMentionedAsTestSubject = /(?:运行|执行|测试|run|execute|test).{0,48}(?:release|发布).{0,24}(?:script|workflow|logic|脚本|流程|逻辑)/.test(text);
  const releaseMentionedAsReviewSubject = /(?:评估|检查|审查|分析|review|audit|assess|check|analy[sz]e).{0,64}(?:release|发布|部署).{0,24}(?:workflow|process|pipeline|logic|risk|流程|过程|管线|逻辑|风险)/.test(text);
  const externalActionDestructive = externalActionContract?.state === 'unsupported'
    && externalActionContract.action === 'delete'
    && externalActionContract.reasons.includes('irreversible connector action is unsupported by the reversible external-action contract');
  const irreversibleFileOperation = !externalActionDestructive
    && /(?:删除|清空|移除).*(?:整个|全部|所有|缓存|目录|文件)|(?:delete|remove|wipe|clear).*(?:entire|all|cache|directory|folder|files?)/.test(text);
  const irreversibleExternalOperation = externalActionDestructive || !noActionExecution && !instructionalAdvice
    && !/(?:do not|don't|never|without)\s+(?:delete|remove|destroy|purge|drop|truncate)|(?:不要|别|禁止|不得)\s*(?:删除|移除|销毁|清空|丢弃|截断)/.test(text)
    && (/(?:delete|remove|destroy|purge|drop|truncate)\b.{0,48}\b(?:github|gitlab|notion|slack|remote|production|database|table|record|issue|page|bucket|deployment|cluster)\b/.test(text)
      || /(?:删除|移除|销毁|清空).{0,40}(?:github|gitlab|notion|slack|远程|生产|数据库|记录|issue|页面|存储桶|部署|集群)/.test(text));
  const releaseRequested = !noActionExecution && !noExternalWrite && !releaseArtifact && !dependencyUpgrade && !localReleaseCache && !releaseConcept
    && !releaseMentionedAsTestSubject && !releaseMentionedAsReviewSubject
    && /(?:推送|发布|部署|上线|(?:升级|刷新).{0,32}(?:插件|marketplace|用户安装|已安装|[a-z0-9_.-]+@[a-z0-9_.-]+))|\b(?:push|publish|deploy|release)\b|\b(?:upgrade|refresh)\b.{0,48}\b(?:installed\s+plugins?|plugin\s+install|marketplace\s+install|marketplace|[a-z0-9_.-]+@[a-z0-9_.-]+)\b/.test(text);
  const suppliedFindingsReport = /\b(?:write|draft|prepare|summarize|summarise|compile|turn)\b.{0,72}\b(?:report|summary)\b.{0,72}\b(?:from|based\s+on|using)\b.{0,32}\b(?:supplied|provided|existing|verified|listed|observed)\b.{0,24}\b(?:findings?|results?|logs?|defects?|issues?)\b|\b(?:write|draft|prepare|summarize|summarise|compile|turn)\b.{0,72}\b(?:supplied|provided|existing|verified|already\s+listed|observed)\b.{0,32}\b(?:findings?|results?|logs?|defects?|issues?)\b.{0,72}\b(?:report|summary)\b|\b(?:bug|code\s+review|test\s+(?:failure\s+)?|security\s+audit)\s*(?:report|summary)\b.{0,48}\bfrom\b.{0,32}\b(?:these|the|supplied|provided|existing|verified)\b.{0,24}\b(?:findings?|results?|logs?)\b|(?:把|将|根据|基于).{0,32}(?:已有|已验证|已列出|提供的|上述|这些).{0,96}(?:发现|结论|问题|缺陷|结果|日志).{0,48}(?:整理|总结|汇总|写成|起草|编写).{0,24}(?:报告|摘要|总结)|(?:整理|总结|汇总|起草|编写).{0,48}(?:已有|已验证|已列出|提供的|上述|这些).{0,96}(?:发现|结论|问题|缺陷|结果|日志).{0,32}(?:报告|摘要|总结)|(?:已有|已验证|已列出|提供的|上述|这些).{0,96}(?:安全(?:审计)?发现|bug\s*发现|代码缺陷|测试结果|测试日志|发现).{0,40}(?:整理|总结|汇总|写成|起草|编写).{0,24}(?:报告|摘要|总结)/.test(text);
  const factReviewForbidden = /\b(?:without|do\s+not|don't|no\s+need\s+to)\b[^.!?;\n]{0,32}\b(?:verif(?:y|ying)|fact[- ]?check(?:ing)?|check(?:ing)?)\b[^.!?;\n]{0,24}\b(?:claims?|facts?)\b|(?:不要|不再|无需|不用|不)\s*(?:再|进行|执行)?\s*(?:核验|核查|查证|事实核查)[^。！？；;\n]{0,16}(?:声明|主张|事实)?/.test(text);
  const securityReviewForbidden = /\b(?:without|do\s+not|don't|no\s+need\s+to)\b[^.!?;\n]{0,36}\b(?:perform|run|do)?\s*(?:a\s+)?(?:security\s+)?(?:audit|review|scan)\b|(?:不要|不再|无需|不用|不)[^。！？；;\n]{0,24}(?:做|进行|执行)?\s*(?:代码)?安全(?:审查|审计|扫描)|(?:不要|不再|无需|不用|不)[^。！？；;\n]{0,16}(?:审查|审计|扫描)(?:代码|仓库|实现)/.test(text);
  const codeReviewForbidden = /(?:不要|不|无需|不用)\s*(?:再|进行|执行)?\s*(?:判断|检查|审查|分析)[^。！？；;\n]{0,16}(?:代码|源码|实现)(?:问题)?|\b(?:do\s+not|don't|without|no\s+need\s+to)\b[^.!?;\n]{0,24}\b(?:judge|check|review|inspect|analyze)\b[^.!?;\n]{0,16}\b(?:code|source|implementation)\b/.test(text)
    || chineseNegativeClauseIncludes(text, /(?:判断|检查|审查|分析).{0,16}(?:代码|源码|实现)(?:问题)?/i)
    || englishNegativeClauseIncludes(text, /\b(?:judge|check|review|inspect|analyze)\b.{0,24}\b(?:code|source|implementation)\b/i);
  const testReportWriting = /\b(?:write|draft|prepare|revise|edit|summarize|summarise)\b.{0,48}\btest\s+(?:(?:failure|coverage|execution|result|results|gate)\s+)?report\b|(?:写|起草|撰写|整理|总结|修订|修改).{0,32}(?:测试|覆盖率|失败|门禁).{0,16}(?:报告|总结|结果说明)/.test(text);
  const factSentenceText = text.replace(/((?:[a-z0-9_.-]+\/)*[a-z0-9_.-]+)\.([a-z0-9]{1,10})\b/gi, '$1_fileext_$2');
  const factWork = !suppliedFindingsReport && !factReviewForbidden && (/(?:事实核查|事实审查|查证|核验事实|引用核验|引用真实性)|(?:核查|检查|核验).{0,24}(?:事实|声明|主张|引用)|\bfact[- ]?check\b|(?:verify|check)\s+(?:the\s+)?(?:facts?|claims?)/.test(text)
    || /\b(?:verify|review|check|inspect|assess)\b.{0,96}\b(?:citation authenticity|citation metadata|bibliograph(?:y|ic) metadata|factual errors?|stale numbers?|outdated (?:figures?|numbers?))\b/.test(text)
    || /(?:核查|核验|查证|verify|check)[^。！？.!?\n]{0,120}(?:(?:证据|evidence)[^。！？.!?\n]{0,16}(?:支持|支撑|证明|support(?:s|ed)?)|(?:支持|支撑|证明|support(?:s|ed)?)[^。！？.!?\n]{0,40}(?:证据|evidence))/.test(factSentenceText)
    || /(?:check|verify)[^。！？.!?\n]{0,80}(?:cited\s+source|citation(?:\s+source)?)[^。！？.!?\n]{0,80}supports?[^。！？.!?\n]{0,40}claims?/.test(factSentenceText)
    || /(?:check|verify)[^。！？.!?\n]{0,80}claims?[^。！？.!?\n]{0,80}supported\s+by[^。！？.!?\n]{0,40}(?:the\s+)?(?:cited\s+source|citation(?:\s+source)?)/.test(factSentenceText)
    || /\b(?:inspect|determine|assess)\b[^。！？.!?\n]{0,120}\blocal\s+evidence\b[^。！？.!?\n]{0,32}\bsupports?\b[^。！？.!?\n]{0,32}\bclaims?\b/.test(factSentenceText));
  const explicitFactDocumentTargets = uniqueStrings([...String(scopePrompt).matchAll(/(?:^|[\s`'"])((?:\/)?(?:[a-z0-9_.-]+\/)*[a-z0-9_.-]+\.(?:md|mdx|rst|txt|tex|docx?))(?=$|[\s`'"，。；、：;,:.!！])/gi)]
    .map((match) => match[1]));
  const factDocumentTargets = explicitFactDocumentTargets.length
    ? explicitFactDocumentTargets
    : /\bREADME\b(?!\s*\.)/i.test(scopePrompt) ? ['README.md'] : [];
  const forbidsOtherFactTools = /\b(?:and\s+)?no\s+(?:other|additional)\s+tools?\b/.test(text)
    || /\b(?:do\s+not|don't|never)\b[^.!?\n]{0,80}\b(?:use|call|invoke)\s+(?:any\s+)?(?:other|additional)\s+tools?\b/.test(text)
    || /\bwithout\s+(?:(?:using|calling|invoking)\s+)?(?:any\s+)?(?:other|additional)\s+tools?\b/.test(text);
  const explicitSingleRepositoryFactSearch = /\b(?:use|run|perform)\s+exactly\s+one\s+(?:built[- ]?in\s+)?(?:focused\s+)?grep\b[^.!?\n]{0,80}\b(?:repository|repo)\s+root\b/.test(text)
    && forbidsOtherFactTools;
  const focusedLocalFactWork = factWork
    && noWorkspaceWrite && noNetworkAccess && noSubagents
    && (factDocumentTargets.length === 1 || explicitSingleRepositoryFactSearch && noTestExecution)
    && /(?:证据|evidence)[^。！？.!?\n]{0,20}(?:支持|支撑|证明|support(?:s|ed)?)|(?:支持|支撑|证明|support(?:s|ed)?)[^。！？.!?\n]{0,40}(?:证据|evidence)/.test(factSentenceText)
    && !/(?:全部|所有|整个(?:仓库|项目|代码库)|全仓库|多条|引用)|\b(?:all|every|entire|repo[- ]wide|repository[- ]wide|multiple|citations?)\b/.test(text);
  const explicitDefectAudit = !suppliedFindingsReport && /\b(?:inspect|audit|review|check|find|hunt)\b.{0,80}\b(?:plugin|project|codebase|repository|repo|code|implementation|pull\s+request|pr)\b.{0,80}\b(?:bugs?|defects?)\b|\b(?:inspect|audit|review|check|find|hunt)\b.{0,40}\b(?:bugs?|defects?)\b|(?:检查|审查|审计|排查|查找).{0,64}(?:插件|项目|代码库|仓库|代码|实现).{0,64}(?:bug|缺陷|问题)|(?:检查|审查|审计|排查|查找).{0,40}(?:bug|缺陷)/.test(text);
  const bugReportArtifactRequested = /(?:写|撰写|起草|整理|总结|归纳|创建|准备|提交).{0,24}(?:英文|英语|english)?.{0,12}\bbug\s+report\b/.test(text)
    || /\b(?:draft|write|revise|edit|summarize|summarise|create|prepare|file)\b.{0,48}\bbug\s+report\b/.test(text);
  const bugReportImplementationArtifact = /\bbug\s+report\s+(?:generator|parser|implementation|component|function|class|module|tool)\b/.test(text)
    || /(?:bug\s+report).{0,16}(?:生成器|解析器|实现|组件|函数|类|模块|工具)/.test(text);
  const bugReportTestAction = /\b(?:write|add|create|generate)\s+(?:the\s+)?tests?\b[^.!?\n]{0,48}\bbug\s+report\b/.test(text)
    || /(?:根据|基于|从).{0,20}bug\s+report.{0,20}(?:写|新增|添加|生成).{0,12}(?:测试|用例)/.test(text);
  const bugReportCompanionCodeAction = bugReportArtifactRequested && (
    /(?:^|[.;,!]\s*|\b(?:and|then|also|next)\s+)(?:fix|repair|resolve|implement|refactor|modify|update|patch)\b/.test(text)
    || /(?:^|[，。；、：;,:.!！]\s*|(?:并且|然后|同时|接着|再)\s*)(?:修复|修一下|修正|解决|实现|重构|修改|更新|打补丁|补丁)/.test(text)
  );
  const bugReportWriting = bugReportArtifactRequested
    && !explicitDefectAudit
    && !bugReportImplementationArtifact
    && !bugReportTestAction;
  const pureBugReportWriting = bugReportWriting && !bugReportCompanionCodeAction;
  const documentArtifactCreateRequested = !noWorkspaceWrite && !noActionExecution && (
    /(?:生成|创建|新建|制作|导出).{0,64}(?:word\s*文档|word\s*docx|docx|word document|word doc)(?:.{0,24}(?:报告|文档|模板))?/.test(text)
    || /(?:word\s*文档|word\s*docx|docx|word document|word doc).{0,64}(?:生成|创建|新建|制作|导出)/.test(text)
    || /\b(?:create|generate|produce|export)\b.{0,64}\b(?:word\s+document|word\s+doc|docx)\b/.test(text)
  );
  const documentTransformationRequested = !noWorkspaceWrite && !noActionExecution && (
    /(?:转换|转成|改成|整理成|整理为|套用).{0,80}(?:markdown|latex|word\s*文档|word\s*docx|docx|\bmd\b|\btex\b)/.test(text)
    || /(?:整理|转换|改写|修改).{0,64}(?:为|成)\s*(?:markdown|latex|word\s*文档|word\s*docx|docx|\bmd\b|\btex\b)/.test(text)
    || /\b(?:convert|transform)\b.{0,80}\b(?:to|into|as)\s+(?:markdown|latex|a\s+word\s+document|word|docx)\b/.test(text)
    || /\bapply\b.{0,64}\b(?:latex|conference|journal)\s+template\b/.test(text)
  );
  const visualModificationRequested = !noWorkspaceWrite && !noActionExecution
    && isVisualEditingDirective(text);
  const genericWritingWork = /(?:润色|改写|翻译|写作|撰写|起草|总结|汇总|归纳|综述|中文表述|英文表述|文案|措辞)|\b(?:polish|proofread|rewrite|translate|translation|prose|wording|summarize|summarise)\b/.test(positiveDomainText)
    || /(?:转换|转成|改成).{0,32}(?:markdown|摘要|文档|文本)|\b(?:convert|transform)\b.{0,32}\b(?:markdown|summary|document|text)\b/.test(positiveDomainText)
    || /(?:更新|修改|编辑|写|完善).{0,32}(?:readme|安装说明|发布说明|更新日志|release notes?|changelog)|\b(?:update|modify|edit|write|improve)\b.{0,32}\b(?:readme|release notes?|changelog)\b/.test(positiveDomainText)
    || /(?:段|句|话|文字|文本|摘要|表述).{0,24}(?:改得|改成|改为)/.test(positiveDomainText)
    || /(?:检查|审查).{0,32}(?:逻辑表达|表达|行文|措辞|翻译腔)/.test(positiveDomainText)
    || /(?:写|撰写|起草).{0,24}(?:审稿回复|段落|小节|申请材料|研究计划)/.test(positiveDomainText)
    || /(?:写|撰写|起草).{0,24}(?:报告|提案|论文|摘要|说明|文档)/.test(positiveDomainText)
    || /\b(?:draft|write|revise|edit|summarize|summarise)\b.{0,48}\b(?:proposal|report|paper|manuscript|abstract|paragraph|section|letter|email|policy|memo|announcement|post|release notes?|changelog|documentation|docs?|guide|manual)\b/.test(positiveDomainText)
    || documentArtifactCreateRequested
    || documentTransformationRequested;
  const initialWritingWork = (genericWritingWork && (!/\bbug\s+report\b/.test(text) || bugReportWriting || suppliedFindingsReport))
    || bugReportWriting
    || observedTestSummaryWriting
    || suppliedFindingsReport
    || testReportWriting;
  const securitySignalText = positiveSecurityDomainSignalText(text);
  const explicitSecurityAudit = !securityReviewForbidden && !suppliedFindingsReport
    && isExplicitSecurityAuditRequest(securitySignalText);
  const securityProseWriting = isSecurityProseWritingRequest(securitySignalText, explicitSecurityAudit);
  const diagnosticSummary = /(?:总结|汇总|归纳).{0,48}(?:ci|日志|失败).{0,48}(?:原因|根因|问题)|\b(?:summarize|summarise)\b.{0,48}\b(?:ci|logs?|failures?)\b.{0,48}\b(?:cause|reason|problem)\b/.test(text)
    && !/(?:写|起草|撰写).{0,24}(?:报告|总结)|\b(?:write|draft|prepare)\b.{0,32}\b(?:report|summary)\b/.test(text);
  const writingWork = (initialWritingWork || securityProseWriting)
    && !diagnosticSummary
    && !explicitDefectAudit
    && !visualModificationRequested
    && (!explicitSecurityAudit || isWritingTransformationDirective(prompt));
  const securityWork = !securityProseWriting && !securityReviewForbidden && !suppliedFindingsReport
    && /(?:安全|漏洞|鉴权|认证|权限|越权|注入|密钥|路径遍历|目录遍历)|\b(?:security|vulnerabilit(?:y|ies)|auth(?:entication|orization)?|permissions?|privilege|xss|ssrf|injection|secrets?|path traversal|directory traversal)\b/.test(securitySignalText);
  const explicitTestAction = /(?:运行|执行|跑|重跑|编写|新增|添加|补).{0,24}(?:测试|test)|(?:测试|test).{0,24}(?:运行|执行|跑|重跑)|\b(?:run|execute|rerun|write|add|create)\b.{0,24}\b(?:tests?|testing)\b/.test(globalTestConstraintText);
  const testWork = !testReportWriting && !suppliedFindingsReport
    && (!externalActionRequested || explicitTestAction)
    && /(?:测试|回归测试|单元测试|覆盖率)|\b(?:tests?|testing|regression|coverage|vitest|pytest|npm test|e2e|playwright|flaky|flakiness|smoke suite)\b/.test(positiveDomainText);
  const noTestAuthoring = /(?:不要|不|别|无需|不用|禁止|不得).{0,16}(?:生成|编写|新增|添加|写).{0,12}(?:测试代码|测试文件|测试用例|tests?|test code)|(?:do not|don't|without).{0,20}(?:generate|write|add|create).{0,16}(?:tests?|test code)/.test(text);
  const broadDefectAudit = explicitDefectAudit
    && /(?:整个|全部|全量).{0,16}(?:插件|项目|代码库|仓库|代码)|\b(?:whole|entire|full|all)\b.{0,16}\b(?:plugin|project|codebase|repository|repo|code)\b|\b(?:plugin|project|codebase|repository|repo)\b.{0,80}\b(?:bugs?|defects?)\b/.test(text);
  const broadBugAudit = broadDefectAudit || (
    /(?:检查|审查|审计|排查).{0,24}(?:(?:整个|全|全部|所有).{0,8})?(?:项目|代码库|代码).{0,20}(?:(?:所有|全部|全面).{0,8})?(?:bugs?|缺陷)/.test(text)
    || /\b(?:audit|inspect|review|check|find|hunt)\b.{0,36}\b(?:the\s+)?(?:whole|entire|full|all)\s+(?:project|codebase|repository|repo|code)\b.{0,36}\b(?:bugs?|defects?)\b/.test(text)
  );
  const explicitTestTargetExecution = /(?:只|仅)?\s*(?:运行|执行|跑|重跑)\s+(?:node\s+--test\s+)?[`'"]?[^\s，。；;!！]+(?:\.test|\.spec)\.(?:[cm]?[jt]sx?|py|go|rs|java)\b/i.test(text)
    || /\b(?:only\s+)?(?:run|execute|rerun)\s+(?:exactly\s+)?(?:node\s+--test\s+)?[`'"]?[^\s,.;!]+(?:\.test|\.spec)\.(?:[cm]?[jt]sx?|py|go|rs|java)\b(?:\s+once\b)?/i.test(text);
  const directTestExecution = !noTestExecution && (testAllowlist.length > 0 || explicitTestTargetExecution || broadBugAudit || (
    testWork && !(writingWork && noTestAuthoring) && (
      /(?:运行|执行|跑|重跑).{0,32}(?:测试|test)|(?:测试|test).{0,32}(?:运行|执行|跑|重跑)|\b(?:run|execute|rerun)\b.{0,32}\b(?:tests?|testing\s+workflow)\b/.test(globalTestConstraintText)
      || /\b(?:tests?|testing)\b[^.!?\n]{0,48}\band\s+(?:run|execute|rerun)\s+(?:them|it|these|those)\b/.test(globalTestConstraintText)
      || /(?:测试|test)[^。！？\n]{0,32}(?:并|然后|再)[^。！？\n]{0,16}(?:运行|执行|跑|重跑)(?:它们|这些测试|该测试)?/.test(globalTestConstraintText)
      || /(?:进行|做).{0,16}(?:一次)?(?:端到端|e2e).{0,12}测试/.test(globalTestConstraintText)
      || /(?:全面|完整|系统性地?)?测试.{0,18}(?:整个|全|本)?(?:项目|插件|代码库|系统)|\btest\b.{0,18}\b(?:the\s+)?(?:entire|whole|full)\s+(?:project|plugin|codebase|system)\b/.test(globalTestConstraintText)
      || /(?:验证|verify).{0,12}(?:测试|test|代码|实现|修复)/.test(globalTestConstraintText)
    )
  ));
  const directTestAuthoring = !noTestAuthoring && !testReportWriting && !suppliedFindingsReport && testWork && (
    /(?:补充|补|添加|新增|编写|写)\s*(?:一些|一组)?\s*(?:(?:高信号|聚焦|安全|单元|回归|集成|端到端|e2e|边界|错误路径)\s*)*(?:测试(?!报告|总结|说明|结果|覆盖率|计划|文档)|用例)/.test(text)
    || /\b(?:add|write|create)\s+(?:(?:exactly|only)\s+)?(?:(?:an?|one)\s+)?(?:(?:high[- ]signal|focused|new|additional|security|unit|regression|integration|e2e|boundary)\s+)*(?:tests?|test cases?)\b(?!\s+(?:report|summary|results?|plan|document|email|notes?|coverage))/.test(text)
  );
  const localDevExecution = !noActionExecution && (
    /^(?:(?:please)\s+)?(?:(?:run|start|launch)\s+)?(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:start|dev|serve)\b/.test(text.trim())
    || /^(?:(?:please)\s+)?(?:run|start|launch)\b.{0,64}(?:\blocal\s+(?:dev|development)\s+server\b|\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:start|dev|serve)\b)/.test(text.trim())
    || /^(?:请\s*)?(?:运行|执行|启动)\s*.{0,48}(?:本地开发服务器|开发服务|(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:start|dev|serve)\b)/.test(text.trim())
  );
  const localMigrationExecution = !noActionExecution && (
    /^(?:(?:please)\s+)?(?:run|execute|apply)\b.{0,56}\b(?:local\s+)?(?:database\s+)?migration(?:\s+script)?\b/.test(text.trim())
    || /^(?:请\s*)?(?:运行|执行|应用).{0,40}(?:本地)?(?:数据库)?迁移脚本/.test(text.trim())
  );
  const localBuildExecution = !noActionExecution && (
    /^(?:(?:please)\s+)?(?:run|execute)\s+(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:build|format|fmt)(?:$|[:\s.,，])/.test(text.trim())
    || /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:build|format|fmt)(?:$|[:\s.,，])/.test(text.trim())
    || /^(?:请\s*)?(?:运行|执行)\s*(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:build|format|fmt)(?:$|[:\s。])/.test(text.trim())
  );
  const dependencyInstallExecution = !noActionExecution && (
    /^(?:(?:please)\s+)?install\s+(?:(?:the|this)\s+)?(?:(?:project|repository|repo)\s+)?(?:dependencies|packages)\b/.test(text.trim())
    || /^(?:(?:please)\s+)?(?:run|execute)\s+(?:npm\s+(?:install|i)|pnpm\s+(?:install|i)|yarn\s+install|bun\s+install)\b/.test(text.trim())
    || /^(?:npm\s+(?:install|i)|pnpm\s+(?:install|i)|yarn\s+install|bun\s+install)\b/.test(text.trim())
    || /^(?:请\s*)?(?:安装|装)\s*(?:本|该|这个)?\s*(?:项目|仓库|代码库)?\s*(?:的)?\s*(?:依赖|依赖包)(?:\s|[，。；;,.!！]|$)/.test(text.trim())
  );
  const setupScriptExecution = !noActionExecution && (
    /^(?:(?:please)\s+)?(?:run|execute)\s+(?:(?:the|this|project)\s+)?setup(?:\s+script|\.sh)\b/.test(text.trim())
    || /^(?:(?:bash|sh)\s+)?(?:\.\/)?setup\.sh\b/.test(text.trim())
    || /^(?:请\s*)?(?:运行|执行)\s*(?:项目\s*)?(?:setup|安装|初始化)\s*脚本/.test(text.trim())
  );
  const localAutomationExecution = localBuildExecution || dependencyInstallExecution || setupScriptExecution;
  const directDestructiveModify = !noActionExecution
    && /^(?:(?:please)\s+)?(?:delete|wipe|clear)\b.{0,64}\b(?:all|entire|cache|directory|folder|files?)\b/.test(text.trim());
  const localGitMetadata = !noActionExecution && (
    /^(?:(?:please)\s+)?(?:(?:git\s+)?commit\b|create\s+(?:a\s+)?git\s+commit\b|stage\b.{0,64}\bcommit\b|amend\b.{0,32}\bcommit\b)/.test(text.trim())
    || /^(?:请\s*)?(?:提交当前(?:修改|改动|变更)|创建\s*(?:一个)?\s*git\s+提交|暂存.{0,32}提交|修订.{0,20}(?:上次|最后一次)?提交)/.test(text.trim())
  );
  const actionText = workspaceConstraintText
    .replace(/(?:不要|不|别|无需|不用|禁止|不得)[^，。；;,.!\n]{0,24}(?:修改|改动|改|编辑|写入|修(?:复)?|实现)(?:[^，。；;,.!\n]{0,8}(?:代码|文件|实现|它))?/g, '')
    .replace(/(?:do not|don't|without|no need to)[^,.;!\n]{0,32}(?:modify|edit|change|write|fix|implement)(?:[^,.;!\n]{0,12}(?:code|files?|it))?/g, '');
  const effectiveActionText = actionText
    .replace(/(?:不要|不|别|无需|不用|禁止|不得).{0,20}(?:生成|编写|新增|添加|写).{0,12}(?:测试代码|测试文件|测试用例)/g, '')
    .replace(/(?:do not|don't|without).{0,24}(?:generate|write|add|create).{0,16}(?:tests?|test code)/g, '')
    .replace(/(?:不要|别|无需|不用|禁止|不得|不\s*(?:要|做|进行|触发)?)[^，,。；;.! ！\n]{0,28}(?:代码)?安全(?:审查|审计|扫描)/g, '')
    .replace(/(?:do not|don't|without)[^,.;!\n]{0,36}(?:code\s+)?security\s+(?:review|audit|scan)/g, '')
    .replace(/(?:不要|别|无需|不用|禁止|不得|不\s*(?:要|做|进行|触发)?)\s*(?:审查|审计|扫描|审)\s*(?:代码|代码库|仓库|依赖)/g, '')
    .replace(/(?:do not|don't|without|no need to)\s+(?:(?:perform|run)\s+)?(?:an?\s+)?(?:audit(?:ing)?|review(?:ing)?|inspect(?:ing)?|scan(?:ning)?)\s+(?:the\s+)?(?:code|codebase|repository|repo|dependenc(?:y|ies))/g, '')
    .replace(/(?:不要|不|无需|不用)\s*(?:再|进行|执行)?\s*(?:判断|检查|审查|分析).{0,16}(?:代码|源码|实现)(?:问题)?/g, '')
    .replace(/(?:do not|don't|without|no need to).{0,24}(?:judge|check|review|inspect|analyze).{0,16}(?:code|source|implementation)/g, '')
    .replace(/\b(?:plugin|package)\s+update\b|插件更新/g, ' ')
    .replace(/\b(?:this|that|the|a|an)\s+draft\b/g, ' ')
    .replace(/\b(?:inspect|review|assess|analy[sz]e|verify|check)\s+(?:the\s+)?(?:update|fix|implementation|release)\s+(?:plan|proposal|draft|workflow|risks?)\b/g, ' inspect plan ');
  const codeTarget = hasCodeTarget(effectiveActionText) || workspaceScopes.exclusions.length > 0;
  const nonTestActionText = testExecutionTargets.length
    ? effectiveActionText.replace(/(?:\.\/)?(?:[a-z0-9_.-]+\/)*[a-z0-9_.-]+(?:\.test|\.spec)\.(?:[cm]?[jt]sx?|py|go|rs|java)/gi, ' ')
    : effectiveActionText;
  const nonTestCodeTarget = hasCodeTarget(nonTestActionText) || workspaceScopes.exclusions.length > 0;
  const functionalUiConstructionRequested = isFunctionalUiConstructionDirective(effectiveActionText);
  const directCodeCreate = !noWorkspaceWrite && !noActionExecution && !pureBugReportWriting && !directTestAuthoring && (
    /^(?:(?:please|can\s+you|could\s+you|would\s+you)\s+)?(?:create|build|write|implement)\b.{0,96}\b(?:function|file|module|parser|handler|listener|class|component)\b/.test(effectiveActionText.trim())
    || /^(?:(?:please|can\s+you|could\s+you|would\s+you)\s+)?(?:create|build)\s+[`'"]?(?:src\/|lib\/|app\/)?[a-z0-9_./-]+\.[cm]?[jt]sx?\b/.test(effectiveActionText.trim())
    || /^(?:(?:please)\s+)?schedule\b.{0,64}\b(?:event\s+loop|task|handler)\b.{0,64}(?:src\/|lib\/|app\/|\.[cm]?[jt]sx?\b)/.test(effectiveActionText.trim())
    || /^(?:(?:请|帮我|麻烦)\s*)?(?:在.{0,64})?(?:创建|新建|构建|编写|写|实现)\s*.{0,80}(?:函数|文件|模块|解析器|处理器|监听器|组件)/.test(effectiveActionText.trim())
    || /^(?:(?:请|帮我|麻烦)\s*)?(?:创建|新建|实现|编写)\s*(?:一个|新的)?\s*[a-z0-9_]*\s*类(?:定义|文件)?(?:\s|[，。；;,.!！]|$)/i.test(effectiveActionText.trim())
    || /^(?:(?:请|帮我|麻烦)\s*)?(?:在.{0,64})?(?:安排|创建|实现)\s*.{0,48}(?:事件循环|任务|处理器).{0,64}(?:src\/|lib\/|app\/|\.[cm]?[jt]sx?\b)/.test(effectiveActionText.trim())
    || functionalUiConstructionRequested
  );
  const directWorkflowCreate = !noWorkspaceWrite && !noActionExecution && (
    /^(?:(?:please|can\s+you|could\s+you|would\s+you)\s+)?(?:build|create|implement)\b.{0,80}\b(?:config|plugin|routing|router|gate|hook)\b.{0,32}\b(?:workflow|logic|handler|detection)\b/.test(effectiveActionText.trim())
    || /^(?:(?:请|帮我|麻烦)\s*)?(?:构建|创建|实现|开发)\s*.{0,80}(?:配置|插件|路由|门禁|hook).{0,32}(?:工作流|流程|逻辑|处理器|检测)/.test(effectiveActionText.trim())
  );
  const implicitModify = !noWorkspaceWrite && !noActionExecution && codeTarget && (
    /^(?:(?:please|can\s+you|could\s+you|would\s+you)\s+)?(?:take\s+care\s+of|handle)\s+(?:the\s+)?(?:todo|fixme|issue|bug|problem)\b/.test(effectiveActionText.trim())
    || /^(?:(?:please|can\s+you|could\s+you|would\s+you)\s+)?make\s+.{0,80}\b(?:work|handle|support|accept)\b/.test(effectiveActionText.trim())
    || /^(?:(?:请|帮我|麻烦)\s*)?把\s*.{0,80}(?:处理一下|处理好|弄好|修好)(?:[。！!]|$)/.test(effectiveActionText.trim())
  );
  const ambiguousCodeAction = !noWorkspaceWrite && !noActionExecution && !advisory && !implicitModify && codeTarget && (
    /^(?:(?:please|can\s+you|could\s+you|would\s+you)\s+)?(?:look\s+into|deal\s+with|check\s+out)\b/.test(effectiveActionText.trim())
    || /^(?:(?:请|帮我|麻烦)\s*)?(?:看一下|看下|看看)(?:\s|$)/.test(effectiveActionText.trim())
  );
  const narrowLineEdit = /(?:只|仅)\s*(?:改|修改|调整)(?:动)?\s*(?:一|1)\s*行(?:代码)?/.test(effectiveActionText);
  const narrowScopedEdit = /(?:只|仅)\s*改(?:动)?\s*[`'"]?(?:[a-z0-9_.-]+\/)*[a-z0-9_.-]+\.[a-z0-9_.-]+[`'"]?/i.test(effectiveActionText);
  const releaseCompanionModify = !releaseRequested || (
    /(?:修复|修一下|修正|解决|修改|编辑|实现|重构|调整|加固|打补丁).{0,64}(?:代码|逻辑|实现|文件|模块|函数|插件|漏洞|鉴权|认证|权限|注入|parser)|(?:更新).{0,32}(?:代码|逻辑|实现|文件|模块|函数)|\b(?:fix|repair|resolve|modify|edit|implement|refactor|patch|harden)\b.{0,64}\b(?:code|logic|implementation|files?|module|function|plugin|parser|issue|security|vulnerabilit(?:y|ies)|auth(?:entication|orization)?|permissions?|injection)\b|\bupdate\b.{0,32}\b(?:code|logic|implementation|files?|module|function)\b/.test(effectiveActionText)
    || /(?:润色|改写|修订|编辑|更新).{0,64}(?:文档|说明|指南|readme|docs?\/|\.(?:md|mdx|rst|txt|tex|docx?)\b)|\b(?:rewrite|revise|edit|polish|update)\b.{0,64}(?:documentation|document|guide|readme|docs?\/|\.(?:md|mdx|rst|txt|tex|docx?)\b)/.test(effectiveActionText)
  );
  const explicitModifyAction = /(?:^|[，。；、：;,:.!！]\s*)(?:(?:(?:请|帮我|麻烦)\s*)*)(?:(?:只|仅)\s*)?(?:修复|修一下|修改|编辑|修正|解决|实现|重构|更新|调整|优化|收紧|加固|添加|新增|删除|打补丁)/.test(effectiveActionText.trim())
    || /(?:^|[，。；、：;,:.!！]\s*)(?:(?:(?:请|帮我|麻烦)\s*)*)(?:去|继续|开始)\s*(?:修复|修一下|修改|编辑|修正|解决|实现|重构|更新|调整|优化|收紧|加固|添加|新增|删除|打补丁)/.test(effectiveActionText.trim())
    || /(?:然后|并且|同时|接着|再|继续|开始)\s*(?:修复|修一下|修改|编辑|修正|解决|实现|重构|更新|调整|优化|收紧|加固|添加|新增|删除|打补丁)/.test(effectiveActionText)
    || /(?:^|[.;,!]\s*)(?:(?:please|can\s+you|could\s+you|would\s+you)\s+)?(?:fix|repair|resolve|patch|modify|implement|refactor|update|harden|tighten|add|remove|write|revise|edit|polish|proofread|rewrite|improve)\b/.test(effectiveActionText.trim())
    || /\b(?:then|and|also|next)\s+(?:fix|repair|resolve|patch|modify|implement|refactor|update|harden|tighten|add|remove|write|revise|edit|polish|proofread|rewrite|improve)\b/.test(effectiveActionText);
  const directModify = !advisory && !noActionExecution && releaseCompanionModify && (directDestructiveModify || localGitMetadata || implicitModify || dependencyUpgrade
    || narrowLineEdit || narrowScopedEdit
    || explicitModifyAction
    || !noWorkspaceWrite && rawExclusiveCompanionMutation
    || documentTransformationRequested
    || visualModificationRequested
    || /(?:补充|补).{0,8}(?:测试|用例)/.test(effectiveActionText));
  const codeModificationRequested = directModify
    && !pureBugReportWriting
    && !suppliedFindingsReport
    && (!securityReviewForbidden
      || /\b(?:fix|repair|resolve|patch|modify|implement|refactor|harden)\b[^.!?\n]{0,80}\b(?:code|implementation|parser|router|module|function|handler|api|bugs?|security|vulnerabilit(?:y|ies)|auth(?:entication|orization)?|permissions?|injection)\b|(?:修复|修一下|修正|解决|实现|重构|修改|加固|打补丁).{0,64}(?:代码|实现|解析器|路由|模块|函数|处理器|接口|bug|漏洞|鉴权|认证|权限|注入)/.test(effectiveActionText))
    && (
    !writingWork
    || bugReportCompanionCodeAction
    || /\b(?:fix|repair|resolve|patch|modify|implement|refactor|update|harden|tighten|add|remove|write)\b[^.!?\n]{0,80}\b(?:code|implementation|parser|router|module|function|handler|api|bugs?|security|vulnerabilit(?:y|ies)|auth(?:entication|orization)?|permissions?|injection)\b/.test(effectiveActionText)
    || /(?:修复|修一下|修正|解决|实现|重构|修改|加固|收紧|打补丁|新增|添加).{0,64}(?:代码|实现|解析器|路由|模块|函数|处理器|接口|bug|漏洞|鉴权|认证|权限|注入)/.test(effectiveActionText)
    );
  const primaryDirectTestAuthoring = directTestAuthoring
    && !/\bbug\s+report\b/.test(text)
    && (/^(?:(?:please|can\s+you|could\s+you|would\s+you)\s+)?(?:write|add|create)\s+(?:(?:exactly|only)\s+)?(?:(?:an?|one)\s+)?(?:(?:high[- ]signal|focused|new|additional|security|unit|regression|integration|e2e|boundary)\s+)*(?:tests?|test cases?)\b/.test(text.trim())
      || /^(?:(?:请|帮我|麻烦)\s*)?(?:为.{1,64})?(?:补充|补|添加|新增|编写|写)\s*(?:一些|一组)?\s*(?:(?:高信号|聚焦|安全|单元|回归|集成|端到端|e2e|边界|错误路径)\s*)*(?:测试(?!报告|总结|说明|结果|覆盖率|计划|文档)|用例)/.test(text.trim()));
  const visualWork = !functionalUiConstructionRequested && (
    /(?:视觉|界面|页面|看板|组件|动效)/.test(text)
    || /\b(?:visual|dashboard|landing page|responsive|hover|ui)\b/.test(text)
  );
  const directCreate = directCodeCreate || directWorkflowCreate || documentArtifactCreateRequested
    || !noWorkspaceWrite && !noActionExecution && visualWork && (/(?:创建|生成|设计(?:并实现)?|搭建)|\b(?:create|build|implement|design)\b/.test(text)
      || /(?:写|做).{0,40}(?:页面|看板)|\bwrite\b.{0,40}\b(?:page|dashboard)\b/.test(text));
  const diagnosis = /(?:为什么|原因|诊断|定位|排查)|\b(?:why|diagnos(?:e|is)|root cause|investigate)\b/.test(text) && !directModify;
  const securityConceptOnly = isSecurityConceptOnlyRequest(text);
  const review = !securityConceptOnly && !codeReviewForbidden
    && /(?:检查|审查|审计|分析|评估|核对|列出|查看|是否合理|问题)|\b(?:review|inspect|audit|analy[sz]e|assess|check|list|show|inventory|findings?)\b/.test(text);
  const conceptOnly = securityConceptOnly || /(?:解释|是什么|含义|概念)|\b(?:what is|explain|define)\b/.test(text)
    && !review && !directModify && !directTestAuthoring;
  const answerOnly = (noTestExecution && /(?:命令|command)/.test(text) || noActionExecution && instructionalAdvice) && !directModify;
  const pluginWork = /(?:(?<![#a-z0-9_-])omp(?![a-z0-9_-])|omp-enhancer|插件|路由|门禁|分类器|工作流|github)|\b(?:plugin|classifier|workflow|gate logic)\b/.test(positiveDomainText)
    || releaseRequested;
  const documentWork = /(?:readme|安装说明|docx|word 文档|latex)|\b(?:readme|docx|latex|markdown document)\b/.test(text)
    || workspaceScopes.targets.some((target) => /\.(?:md|mdx|rst|txt|tex|docx?)$/iu.test(target))
    || /(?:^|[\s`'"])(?:\/)?(?:[a-z0-9_.-]+\/)*[a-z0-9_.-]+\.(?:md|mdx|rst|txt|tex|docx?)(?=$|[\s`'"，。；、：;,:.!！])/i.test(text);
  const configWork = dependencyInstallExecution || setupScriptExecution
    || /(?:配置资产|配置模板|技能清单|打包后.{0,16}(?:agents?|skills?|hooks?|代理|技能)|config assets?|config doctor|omp-config)|\b(?:config assets?|config doctor|skill assets?|asset inventory|packaged assets?|packaged hooks?|bundled hooks?|packaged agents?|packaged skills?)\b/.test(text)
    || /(?:\benv\b|modelroles|marketplace|hooks?|agents?).{0,120}(?:配置|清单)|(?:配置|清单).{0,120}(?:\benv\b|modelroles|marketplace|hooks?|agents?)/.test(text);
  const secondaryPositiveAction = releaseRequested
    || externalActionRequested
    || irreversibleExternalOperation
    || localDevExecution
    || localMigrationExecution
    || localAutomationExecution
    || directModify
    || directCreate
    || diagnosis
    || (review && (nonTestCodeTarget || pluginWork || writingWork || documentWork
      || factWork || securityWork || configWork || visualWork))
    || (conceptOnly && nonTestCodeTarget);
  const testExecutionCommand = directTestExecution
    ? testExecutionBinding.command
    : '';
  const exclusiveToolContract = exclusiveToolContractFor({
    text,
    prompt,
    rawPrompt,
    directTestExecution,
    testExecutionTargets,
    testExecutionCommand,
    factWork,
    securityWork,
    review,
    noWorkspaceWrite,
    directModify,
    directCreate,
    directTestAuthoring,
    releaseRequested,
    externalActionRequested,
  });
  const exclusiveToolOnly = exclusiveToolContract?.mode === 'exclusive';
  const pureExactTestExecution = directTestExecution && !directModify && !directTestAuthoring
    && testExecutionTargets.length > 0 && !secondaryPositiveAction;
  const exclusiveExactTestExecution = directTestExecution
    && exclusiveToolContract?.allowedTools?.includes('bash')
    && Boolean(testExecutionCommand || testExecutionTargets.length > 0)
    && !directTestAuthoring && !releaseRequested && !externalActionRequested
    && !irreversibleFileOperation && !irreversibleExternalOperation
    && !hasExclusiveCompanionMutation(rawPrompt);
  const exactTestOnlyExecution = pureExactTestExecution || exclusiveExactTestExecution;
  const effectiveNonTestCodeTarget = codeReviewForbidden && writingWork ? false : nonTestCodeTarget;
  const codeDomainText = suppliedFindingsReport
    ? ''
    : pureBugReportWriting
    ? ''
    : bugReportWriting
    ? nonTestActionText.replace(/\bbug\s+report\b/gi, ' ')
    : observedTestSummaryWriting || codeReviewForbidden && writingWork ? '' : nonTestActionText;
  const codeWork = !exactTestOnlyExecution && (localBuildExecution || localGitMetadata || directTestAuthoring || directCreate && !documentArtifactCreateRequested || explicitDefectAudit || bugReportCompanionCodeAction || effectiveNonTestCodeTarget
    || /(?:代码|代码库|实现|函数|模块|接口|bug|鉴权漏洞)|(?:路由|门禁).{0,8}逻辑|逻辑.{0,8}(?:路由|门禁)|\b(?:code|codebase|repository|repo|function|module|api|bugs?|router|routenaturallanguagetask|implementation)\b/.test(codeDomainText)
    || codeModificationRequested
    || directModify && !writingWork);
  const ambiguous = ambiguousCodeAction || /(?:不确定|可能是|ambiguous|unclear)/.test(text);
  const localCompanionModify = externalActionRequested && directModify && (codeTarget || writingWork || documentWork);
  const reasons = [];
  if (noWorkspaceWrite || advisory) reasons.push('read-only or advisory language');
  if (workspaceScopes.targets.length || workspaceScopes.exclusions.length) reasons.push('scoped workspace write targets requested');
  if (noTestExecution) reasons.push('test execution forbidden');
  if (testAllowlist.length) reasons.push('test kind allowlist requested');
  if (testExclusions.length) reasons.push('test kind exclusions requested');
  if (testExecutionTargets.length) reasons.push('exact test execution targets requested');
  if (exclusiveExactTestExecution) reasons.push('exclusive command-only exact test requested');
  if (exclusiveToolOnly) reasons.push('exclusive single-tool contract requested');
  if (explicitSingleRepositoryFactSearch) reasons.push('explicit single repository fact search requested');
  if (noExternalWrite) reasons.push('external write forbidden');
  if (externalScopes.targets.length || externalScopes.exclusions.length) reasons.push('scoped external write targets requested');
  if (noNetworkAccess) reasons.push('network access forbidden');
  if (noSubagents) reasons.push('subagents forbidden');
  if (releaseRequested) reasons.push('release or external write requested');
  if (externalActionRequested) reasons.push('reversible external connector action requested');
  if (externalActionContract?.state === 'unsupported') reasons.push('unsupported external connector action detected');
  if (irreversibleFileOperation) reasons.push('irreversible file operation requested');
  if (irreversibleExternalOperation) reasons.push('irreversible external operation requested');
  if (factWork && writingWork) reasons.push('compound fact and writing work');
  if (suppliedFindingsReport) reasons.push('supplied findings report requested');
  if (factReviewForbidden) reasons.push('fact re-verification forbidden');
  if (securityReviewForbidden) reasons.push('security re-review forbidden');
  if (securityProseWriting) reasons.push('security prose refinement without security audit');
  if (securityWork && explicitSecurityAudit) reasons.push('explicit security audit requested');
  if (securityWork && directModify) reasons.push('security-sensitive implementation');
  if (observedTestSummaryWriting) reasons.push('observed test summary requested');
  if (directTestAuthoring) reasons.push('direct test authoring requested');
  if (primaryDirectTestAuthoring) reasons.push('primary direct test authoring requested');
  if (bugReportCompanionCodeAction) reasons.push('bug report companion code action');
  if (implicitModify) reasons.push('implicit code modification imperative');
  if (localGitMetadata) reasons.push('local git metadata mutation requested');
  if (localAutomationExecution) reasons.push('local project automation requested');
  if (ambiguousCodeAction) reasons.push('ambiguous code-target imperative');
  if (securityConceptOnly) reasons.push('security concept explanation only');

  return {
    text,
    prompt,
    noWorkspaceWrite,
    noActionExecution,
    advisory,
    workspaceWriteTargets: workspaceScopes.targets,
    workspaceWriteExclusions: workspaceScopes.exclusions,
    noTestExecution,
    testAllowlist,
    testExclusions,
    testExecutionTargets,
    testExecutionCommand,
    exclusiveToolContract,
    noExternalWrite,
    externalWriteTargets: externalScopes.targets,
    externalWriteExclusions: externalScopes.exclusions,
    noNetworkAccess,
    noSubagents,
    releaseArtifact,
    dependencyUpgrade,
    irreversibleFileOperation,
    irreversibleExternalOperation,
    externalActionDestructive,
    releaseRequested,
    externalActionContract,
    externalActionContracts,
    externalActionRequested,
    localCompanionModify,
    suppliedFindingsReport,
    factWork,
    focusedLocalFactWork,
    writingWork,
    documentArtifactCreateRequested,
    documentTransformationRequested,
    bugReportWriting,
    bugReportCompanionCodeAction,
    observedTestSummaryWriting,
    securityProseWriting,
    securityWork,
    testWork,
    noTestAuthoring,
    broadBugAudit,
    directTestExecution,
    pureExactTestExecution: exactTestOnlyExecution,
    directTestAuthoring,
    primaryDirectTestAuthoring,
    localDevExecution,
    localMigrationExecution,
    localBuildExecution,
    dependencyInstallExecution,
    setupScriptExecution,
    localAutomationExecution,
    directDestructiveModify,
    localGitMetadata,
    implicitModify,
    ambiguousCodeAction,
    directModify,
    visualModificationRequested,
    codeModificationRequested,
    directCreate,
    diagnosis,
    review,
    conceptOnly,
    answerOnly,
    pluginWork: exactTestOnlyExecution ? false : pluginWork,
    codeWork,
    documentWork,
    visualWork,
    configWork,
    ambiguous,
    reasons,
  };
}

function workspaceWriteScopesFor(value = '') {
  const source = String(value);
  const exclusions = uniqueStrings([...collectScopedTargets(source, [
    /\b(?:do not|don't|never)\s+(?:modify|edit|change|update|write(?:\s+to)?|touch)\s+(?:the\s+)?[`'"]?([a-z0-9_./-]+\.[a-z0-9_.-]+)[`'"]?/gi,
    /\bbut\s+(?:do\s+)?not\s+(?:(?:modify|edit|change|update|write(?:\s+to)?|touch)\s+)?(?:the\s+)?[`'"]?([a-z0-9_./-]+\.[a-z0-9_.-]+)[`'"]?/gi,
    /(?:不要|不|别|不得|禁止)\s*(?:修改|改动|编辑|更新|写入|触碰)\s*[`'"]?([a-z0-9_./-]+\.[a-z0-9_.-]+)[`'"]?/gi,
  ], normalizeWorkspaceTarget), ...collectQuotedWorkspaceTargets(source, { negative: true })]);
  const positiveSource = maskScopedWorkspaceWriteNegatives(source);
  const targets = uniqueStrings([...collectScopedTargets(positiveSource, [
    /\b(?:fix|update|edit|modify|change|write(?:\s+to)?|polish|proofread|rewrite|revise|improve)\s+(?:only\s+)?(?:the\s+)?[`'"]?([a-z0-9_./-]+\.[a-z0-9_.-]+)[`'"]?/gi,
    /(?:修复|更新|修改|编辑|调整|润色|改写)\s*[`'"]?([a-z0-9_./-]+\.[a-z0-9_.-]+)[`'"]?/gi,
    /(?:只|仅)\s*改(?:动)?\s*[`'"]?([a-z0-9_./-]+\.[a-z0-9_.-]+)[`'"]?/gi,
    /\b(?:polish|proofread|rewrite|revise|edit|improve)\b[^.;!\n]{0,80}?\b(?:in|inside|within)\s+(?:the\s+)?[`'"]?((?:[\p{L}\p{N}_.-]+\/)*[\p{L}\p{N}_.-]+?\.(?:md|mdx|rst|txt|tex|docx?|pdf))[`'"]?/giu,
    /(?:润色|改写|校对|修订|编辑)(?:一下|下)?[^。；;\n]{0,80}?((?:[\p{L}\p{N}_.-]+\/)*[\p{L}\p{N}_.-]+?\.(?:md|mdx|rst|txt|tex|docx?|pdf))\s*(?:中|里|内)(?:的)?\s*(?:措辞|文字|文案|句子|段落|章节|内容|表述)/giu,
    /\b(?:in|inside|within)\s+(?:the\s+)?[`'"]?((?:[\p{L}\p{N}_.-]+\/)*[\p{L}\p{N}_.-]+?\.(?:md|mdx|rst|txt|tex|docx?|pdf))[`'"]?\s*[,;:]?\s*(?:please\s+)?(?:polish|proofread|rewrite|revise|edit|improve)\b/giu,
    /(?:在|把|请把)\s*[`'"]?((?:[\p{L}\p{N}_.-]+\/)*[\p{L}\p{N}_.-]+?\.(?:md|mdx|rst|txt|tex|docx?|pdf))[`'"]?\s*(?:中|里|内)(?:的)?[^。；;\n]{0,32}?(?:润色|改写|校对|修订|编辑|改善|优化)/giu,
    /\b(?:for|about)\s+(?:the\s+)?[`'"]?((?:\/?[\p{L}\p{N}_.-]+\/)*[\p{L}\p{N}_.-]+?\.(?:md|mdx|rst|txt|tex|docx?|pdf))[`'"]?\s*[,;:]?[^.;!\n]{0,32}\b(?:polish|proofread|rewrite|revise|edit|improve)\b/giu,
    /\b(?:polish|proofread|rewrite|revise|edit|improve)\b[^.;!\n]{0,80}?(?:\(|\b(?:of|in|inside|within)\s+)[`'"]?((?:\/?[\p{L}\p{N}_.-]+\/)*[\p{L}\p{N}_.-]+?\.(?:md|mdx|rst|txt|tex|docx?|pdf))[`'"]?/giu,
    /\b(?:polish|proofread|rewrite|revise|edit|improve)\b[^.;!\n:]{0,48}:\s*[`'"]?((?:\/?[\p{L}\p{N}_.-]+\/)*[\p{L}\p{N}_.-]+?\.(?:md|mdx|rst|txt|tex|docx?|pdf))[`'"]?/giu,
    /(?:^|[，,。；;\n])\s*(?:请)?(?:润色|改写|校对|修订|编辑|改善|优化)[^。；;\n]{0,32}(?:文件(?:是|为)|目标(?:是|为))\s*[`'"]?((?:\/?[\p{L}\p{N}_.-]+\/)*[\p{L}\p{N}_.-]+?\.(?:md|mdx|rst|txt|tex|docx?|pdf))[`'"]?/giu,
    /(?:对|针对)\s*[`'"]?((?:\/?[\p{L}\p{N}_.-]+\/)*[\p{L}\p{N}_.-]+?\.(?:md|mdx|rst|txt|tex|docx?|pdf))[`'"]?[^。；;\n]{0,32}(?:润色|改写|校对|修订|编辑|改善|优化)/giu,
    /(?:^|[，,。；;\n]\s*)[`'"]?((?:\/?[\p{L}\p{N}_.-]+\/)*[\p{L}\p{N}_.-]+?\.(?:md|mdx|rst|txt|tex|docx?|pdf))[`'"]?\s*(?:需要|需|要)[^。；;\n]{0,24}(?:润色|改写|校对|修订|编辑|改善|优化)/giu,
    /(?:把|请把)\s*[`'"]?((?:\/?[\p{L}\p{N}_.-]+\/)*[\p{L}\p{N}_.-]+?\.(?:md|mdx|rst|txt|tex|docx?|pdf))[`'"]?[^。；;\n]{0,24}(?:润色|改写|修改|校对|修订|编辑|改善|优化)/giu,
    /(?:^|[.!?;\n]\s*)[`'"]?((?:\/?[\p{L}\p{N}_.-]+\/)*[\p{L}\p{N}_.-]+?\.(?:md|mdx|rst|txt|tex|docx?|pdf))[`'"]?\s+(?:needs?|requires?)\s+[^.!?;\n]{0,32}\b(?:polish|proofread|rewrite|revision|editing|improvement)\b/giu,
  ], normalizeWorkspaceTarget),
  ...collectQuotedWorkspaceTargets(positiveSource),
  ...collectAffirmativeWorkspaceTargetLists(positiveSource)]);
  return { targets, exclusions };
}

function collectAffirmativeWorkspaceTargetLists(value = '') {
  const source = String(value);
  const targets = [];
  const actions = /\b(?:fix|update|edit|modify|change|write(?:\s+to)?|polish|proofread|rewrite|revise|improve)\s+(?:only\s+)?(?:the\s+)?|(?:(?:只|仅)\s*改(?:动)?|修复|更新|修改|编辑|调整|润色|改写|校对|修订)(?:一下|下)?\s*/giu;
  for (const match of source.matchAll(actions)) {
    let remaining = source.slice((match.index ?? 0) + match[0].length).split(/[。；;\n]/u, 1)[0] ?? '';
    let next = consumeLeadingWorkspaceTarget(remaining);
    if (!next) continue;
    targets.push(next.target);
    remaining = next.rest;
    while (remaining) {
      const separator = remaining.match(/^\s*(?:以及|、|，|,|和|与|\band\b|\bor\b)\s*/iu);
      if (!separator) break;
      next = consumeLeadingWorkspaceTarget(remaining.slice(separator[0].length));
      if (!next) break;
      targets.push(next.target);
      remaining = next.rest;
    }
  }
  return uniqueStrings(targets);
}

function consumeLeadingWorkspaceTarget(value = '') {
  const curved = String(value).match(/^\s*(?:“(?<double>[^”\n]+)”|‘(?<single>[^’\n]+)’)/u);
  const curvedValue = curved?.groups?.double ?? curved?.groups?.single;
  if (curvedValue && /\.[\p{L}\p{N}_.-]+$/u.test(curvedValue.trim())) {
    const target = normalizeWorkspaceTarget(curvedValue);
    if (target) return { target, rest: String(value).slice(curved[0].length) };
  }
  const quoted = String(value).match(/^\s*([`'"])([^\n]+?)\1/u);
  if (quoted && /\.[\p{L}\p{N}_.-]+$/u.test(quoted[2].trim())) {
    const target = normalizeWorkspaceTarget(quoted[2]);
    if (target) return { target, rest: String(value).slice(quoted[0].length) };
  }
  const match = String(value).match(/^\s*[`'"]?((?:[\p{L}\p{N}_.-]+\/)*[\p{L}\p{N}_.-]+?\.(?:md|mdx|rst|txt|tex|docx?|pdf|js|mjs|cjs|ts|tsx|jsx|py|go|rs|java|json|jsonc|yml|yaml|toml))[`'"]?(?=$|\s|[，。；、：;,:.!！]|(?:中|里|内)(?:的)?)/iu);
  if (!match) return null;
  const target = normalizeWorkspaceTarget(match[1]);
  return target ? { target, rest: String(value).slice(match[0].length) } : null;
}

function collectQuotedWorkspaceTargets(value = '', { negative = false } = {}) {
  const source = String(value);
  const patterns = negative ? [
    /\b(?:do not|don't|never)\s+(?:modify|edit|change|update|write(?:\s+to)?|touch)\s+(?:the\s+)?([`'"])([^\n]+?)\1/giu,
    /(?:不要|不|别|不得|禁止)\s*(?:修改|改动|编辑|更新|写入|触碰)\s*([`'"])([^\n]+?)\1/giu,
    /\b(?:do not|don't|never)\s+(?:modify|edit|change|update|write(?:\s+to)?|touch)\s+(?:the\s+)?(?:“(?<target>[^”\n]+)”|‘(?<targetSingle>[^’\n]+)’)/giu,
    /(?:不要|不|别|不得|禁止)\s*(?:修改|改动|编辑|更新|写入|触碰)\s*(?:“(?<target>[^”\n]+)”|‘(?<targetSingle>[^’\n]+)’)/giu,
  ] : [
    /\b(?:fix|update|edit|modify|change|write(?:\s+to)?|polish|proofread|rewrite|revise)\s+(?:the\s+)?([`'"])([^\n]+?)\1/giu,
    /(?:修复|更新|修改|编辑|调整|润色|改写)\s*([`'"])([^\n]+?)\1/giu,
    /\b(?:fix|update|edit|modify|change|write(?:\s+to)?|polish|proofread|rewrite|revise)\s+(?:the\s+)?(?:“(?<target>[^”\n]+)”|‘(?<targetSingle>[^’\n]+)’)/giu,
    /(?:修复|更新|修改|编辑|调整|润色|改写)\s*(?:“(?<target>[^”\n]+)”|‘(?<targetSingle>[^’\n]+)’)/giu,
  ];
  const targets = [];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const target = normalizeWorkspaceTarget(match.groups?.target ?? match.groups?.targetSingle ?? match[2]);
      if (target && /\.[\p{L}\p{N}_.-]+$/u.test(target)) targets.push(target);
    }
  }
  return uniqueStrings(targets);
}

function maskScopedWorkspaceWriteNegatives(value = '') {
  return String(value)
    .replace(/\b(?:do not|don't|never)\s+(?:modify|edit|change|update|write(?:\s+to)?|touch)\s+(?:the\s+)?(?:“[^”\n]+”|‘[^’\n]+’)/giu, ' ')
    .replace(/(?:不要|不|别|不得|禁止)\s*(?:修改|改动|编辑|更新|写入|触碰)\s*(?:“[^”\n]+”|‘[^’\n]+’)/giu, ' ')
    .replace(/\b(?:do not|don't|never)\s+(?:modify|edit|change|update|write(?:\s+to)?|touch)\s+(?:the\s+)?([`'"])[^\n]+?\1/giu, ' ')
    .replace(/(?:不要|不|别|不得|禁止)\s*(?:修改|改动|编辑|更新|写入|触碰)\s*([`'"])[^\n]+?\1/giu, ' ')
    .replace(/\b(?:do not|don't|never)\s+(?:modify|edit|change|update|write(?:\s+to)?|touch)\s+(?:the\s+)?[`'"]?[a-z0-9_./-]+\.[a-z0-9_.-]+[`'"]?/gi, ' ')
    .replace(/\bbut\s+(?:do\s+)?not\s+(?:(?:modify|edit|change|update|write(?:\s+to)?|touch)\s+)?(?:the\s+)?[`'"]?[a-z0-9_./-]+\.[a-z0-9_.-]+[`'"]?/gi, ' ')
    .replace(/(?:不要|不|别|不得|禁止)\s*(?:修改|改动|编辑|更新|写入|触碰)\s*[`'"]?[a-z0-9_./-]+\.[a-z0-9_.-]+[`'"]?/gi, ' ');
}

function stripQuotedConstraintMentions(value = '') {
  return String(value)
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/gu, ' ')
    .replace(/^[\t ]*>[^\n]*(?:\n|$)/gmu, ' ')
    .replace(/[“‘]([^”’\n]*)[”’]/gu, (quoted, inner) => quotedPathMention(inner) ? quoted : ' ')
    .replace(/"([^"\n]*)"/gu, (quoted, inner) => quotedPathMention(inner) ? quoted : ' ')
    .replace(/(?<![\p{L}\p{N}])'([^'\n]+)'(?![\p{L}\p{N}])/gu, (quoted, inner) => quotedPathMention(inner) ? quoted : ' ')
    .replace(/`([^`\n]*)`/gu, (quoted, inner) => quotedPathMention(inner) ? quoted : ' ');
}

function quotedPathMention(value = '') {
  return /^(?:\.\/)?(?:[\p{L}\p{N}_.-]+[/\\])*[\p{L}\p{N}_.-]+\.[\p{L}\p{N}_.-]+$/u.test(String(value).trim());
}

function externalWriteScopesFor(value = '') {
  const source = String(value);
  const environment = '(production|prod|staging|stage|development|dev|test)';
  const exclusions = collectScopedTargets(source, [
    new RegExp(`\\b(?:do not|don't|never)\\s+(?:deploy|publish|release|push|promote)\\s+(?:to\\s+)?(?:the\\s+)?${environment}\\b`, 'gi'),
    new RegExp(`\\bbut\\s+(?:do\\s+)?not\\s+(?:(?:deploy|publish|release|push|promote)\\s+)?(?:to\\s+)?(?:the\\s+)?${environment}\\b`, 'gi'),
    /(?:不要|不|别|不得|禁止)\s*(?:部署|发布|上线|推送|晋级)\s*(?:到|至)?\s*(生产|预发布|测试|开发)(?:环境)?/gi,
  ], normalizeEnvironmentTarget);
  const positiveSource = maskScopedExternalWriteNegatives(source);
  const targets = collectScopedTargets(positiveSource, [
    new RegExp(`\\b(?:deploy|publish|release|push|promote)\\s+(?:to\\s+)?(?:the\\s+)?${environment}\\b`, 'gi'),
    /(?:部署|发布|上线|推送|晋级)\s*(?:到|至)\s*(生产|预发布|测试|开发)(?:环境)?/gi,
  ], normalizeEnvironmentTarget);
  return { targets, exclusions };
}

function maskScopedExternalWriteNegatives(value = '') {
  return String(value)
    .replace(/\b(?:do not|don't|never)\s+(?:deploy|publish|release|push|promote)\s+(?:to\s+)?(?:the\s+)?(?:production|prod|staging|stage|development|dev|test)\b/gi, ' ')
    .replace(/\bbut\s+(?:do\s+)?not\s+(?:(?:deploy|publish|release|push|promote)\s+)?(?:to\s+)?(?:the\s+)?(?:production|prod|staging|stage|development|dev|test)\b/gi, ' ')
    .replace(/(?:不要|不|别|不得|禁止)\s*(?:部署|发布|上线|推送|晋级)\s*(?:到|至)?\s*(?:生产|预发布|测试|开发)(?:环境)?/gi, ' ');
}

function collectScopedTargets(source, patterns, normalize) {
  const values = [];
  for (const pattern of patterns) {
    for (const match of String(source).matchAll(pattern)) {
      const value = normalize(match.slice(1).find((entry) => entry != null) ?? '');
      if (value) values.push(value);
    }
  }
  return uniqueStrings(values);
}

function normalizeWorkspaceTarget(value = '') {
  return String(value).trim().replace(/^[`'"]+|[`'",.;:!?]+$/g, '');
}

function normalizeEnvironmentTarget(value = '') {
  const target = String(value).trim().toLowerCase();
  if (['production', 'prod', '生产'].includes(target)) return 'production';
  if (['staging', 'stage', '预发布'].includes(target)) return 'staging';
  if (['development', 'dev', '开发'].includes(target)) return 'development';
  if (['test', '测试'].includes(target)) return 'test';
  return '';
}

function normalizeAffirmativeWorkspacePhrases(text) {
  return String(text)
    .replace(/\b(?:do not|don't|dont|never)\s+hesitate\s+to\s+(modify|edit|change|write|fix|implement)\b/g, '$1')
    .replace(/\b(?:do not|don't|dont|never)\s+(?:avoid|refrain\s+from)\s+(?:changing|modifying|editing|writing|fixing|implementing)\b/g, 'modify')
    .replace(/(?:不要|别|不能|不得|禁止)\s*(?:只|仅)\s*(?:分析|检查|审查|报告)/g, ' ')
    .replace(/(?:不要|别|不能|不得|禁止)\s*(?:犹豫|避免)\s*(?:修改|改动|编辑|写入|修复|实现)/g, '实现');
}

function positiveDomainSignalText(value = '') {
  return normalizeAffirmativeExternalWritePhrases(maskIncidentalStatusReporting(value)
    .replace(/\b(?:do not|don't|dont|never)\s+(?:skip|omit|avoid)\s+(?:(?:running|doing)\s+)?(?:the\s+)?(?:tests?|testing)\b/gi, ' run tests ')
    .replace(/(?:不要|别|不能|不得|禁止)\s*(?:跳过|省略|略过|避免)\s*(?:运行|执行|做|进行)?\s*(?:这些?|所有|全部)?\s*测试/gi, ' 运行测试 '))
    .replace(/\b(?:do not|don't|dont|never|no need to)\s+[^,.;!\n]+/gi, ' ')
    .replace(/\bwithout\s+[^,.;!\n]+/gi, ' ')
    .replace(/(?:不要|别|无需|不用|禁止|不得)\s*[^，,。；;.!！\n]+/g, ' ')
    .replace(/(?:^|[，,。；;.!！\n]\s*|(?:但|并且|然后)\s*)不\s*(?:运行|执行|跑|重跑|提交|推送|发布|部署|上线)\s*[^，,。；;.!！\n]*/g, ' ');
}

function maskIncidentalStatusReporting(value = '') {
  return String(value).replace(
    /(?:,\s*)?\b(?:and|then)\s+report(?:\s+back)?(?:\s+(?:the\s+)?(?:result|outcome|change|changes))?\s+(?:briefly|concisely)(?=\s*[.!?]?(?:\s|$))/gi,
    ' ',
  );
}

function positiveSecurityDomainSignalText(value = '') {
  return positiveDomainSignalText(value)
    .replace(/(?:不要|别|无需|不用|禁止|不得|不\s*(?:要|做|进行|触发)?)[^，,。；;.! ！\n]{0,28}(?:代码)?安全(?:审查|审计|扫描)/g, ' ')
    .replace(/(?:do not|don't|without)[^,.;!\n]{0,36}(?:code\s+)?security\s+(?:review|audit|scan)/g, ' ');
}

function isExplicitSecurityAuditRequest(text = '') {
  const source = String(text);
  return /(?:安全(?:审计|扫描)|(?:审计|扫描).{0,32}安全|(?:检查|审查|审计).{0,64}(?:漏洞|鉴权|认证|权限|越权|绕过|注入|密钥|路径遍历|目录遍历))|\b(?:audit|scan)\b.{0,96}\b(?:security|auth|permissions?|vulnerabilit(?:y|ies)|bypass|injection|secrets?|path traversal|directory traversal)\b|\b(?:security|auth|permissions?|vulnerabilit(?:y|ies)|bypass|injection|secrets?|path traversal|directory traversal)\b.{0,96}\b(?:audit|scan)\b|\b(?:review|check|inspect|assess)\b.{0,128}\b(?:for|against)\b.{0,32}\b(?:security\s+(?:issues?|risks?)|vulnerabilit(?:y|ies)|auth(?:entication|orization)?(?:\s+bypass)?|permissions?(?:\s+issues?)?|bypass(?:\s+risks?)?|injection|secrets?|path traversal|directory traversal)\b/i.test(source);
}

function isSecurityProseWritingRequest(text = '', explicitSecurityAudit = false) {
  const source = String(text);
  const proseArtifact = /(?:安全(?:政策|策略|公告|说明|文案|通知|草案|措辞|表述))|\bsecurity\s+(?:policy|announcement|notice|advisory|draft|wording|prose|copy)\b/.test(source);
  const proseAction = /(?:润色|改写|校对|修订|起草|撰写|措辞|语气|表达|文案)|\b(?:polish|proofread|rewrite|revise|draft|write|wording|clarity|tone|grammar|prose)\b/.test(source);
  const securityThreatReview = /(?:漏洞|鉴权|认证|权限|越权|绕过|注入|密钥)|\b(?:vulnerabilit(?:y|ies)|auth(?:entication|orization)?|permissions?|bypass|xss|ssrf|injection|secrets?)\b/.test(source);
  return proseArtifact && proseAction && !explicitSecurityAudit && !securityThreatReview;
}

function normalizeAffirmativeExternalWritePhrases(text) {
  return String(text)
    .replace(/\b(?:no need to|do not|don't|dont|never)\s+(?:wait|delay|postpone|hold\s+off)(?:\s+(?:for\s+)?(?:the\s+)?(?:release|deployment|publication))?/g, ' ')
    .replace(/\bthere\s+(?:are|is)\s+no\s+(?:blockers?|blocking\s+issues?)\b/g, ' ')
    .replace(/\b(?:do not|don't|dont|never)\s+(?:skip|omit|avoid)\s+(?:the\s+)?(?:publish(?:ing)?|release|deployment)\s*(?:step)?/g, ' publish ')
    .replace(/(?:不要|别|无需|不用|不必|不需要)\s*(?:再)?(?:等待|等|延迟|推迟|拖延)(?:\s*(?:发布|部署|上线))?/g, ' ')
    .replace(/(?:没有|不存在)\s*(?:发布|部署|上线)?\s*(?:阻碍|阻塞|障碍|问题)/g, ' ')
    .replace(/(?:不要|别|不能|不得|禁止)\s*(?:跳过|省略|避免)\s*(?:发布|部署|上线)(?:步骤|环节)?/g, ' 发布 ');
}

function hasExplicitNoExternalWrite(text) {
  const clause = '(?:^|[，。；、：;,:.!！]\\s*|\\b(?:but|and)\\s+)';
  const english = new RegExp(
    `${clause}(?:please\\s+)?(?:do not|don't|dont|never|no need to)\\s+(?:actually\\s+)?(?:push|publish|release|deploy)\\b`
      + `|${clause}(?:please\\s+)?no\\s+(?:push(?:ing)?|publication|publishing|release|deployment|deploy)\\b`
      + '|\\bwithout\\s+(?:pushing|publishing|releasing|deploying)\\b',
    'i',
  );
  const chinese = /(?:^|[，。；、：;,:.!！]\s*|(?:但|并且|然后)\s*)(?:请)?(?:不要|别|无需|不用|不必|不|禁止|不得)\s*(?:再|实际)?\s*(?:提交|推送|发布|部署|上线|升级\s*(?:插件|marketplace))/;
  return english.test(text) || chinese.test(text);
}

function normalizeAffirmativeSubagentPhrases(text) {
  return String(text)
    .replace(/\b(?:do not|don't|dont|never)\s+hesitate\s+to\s+use\s+(?:subagents?|sub-agents?)\b/g, ' use subagents ')
    .replace(/\b(?:no need to|do not|don't|dont|never)\s+(?:avoid|skip)\s+(?:using\s+)?(?:subagents?|sub-agents?)\b/g, ' use subagents ')
    .replace(/(?:不要|别|不能|不得|禁止)\s*(?:犹豫|跳过|避免)(?:\s*[，,])?\s*(?:直接)?\s*(?:使用)?\s*(?:子代理|子\s*agent)(?:协作)?/g, ' 使用子代理 ')
    .replace(/(?:不用|无需|不必)\s*(?:等待|等)(?:\s*[，,])?\s*(?:直接)?\s*使用\s*(?:子代理|子\s*agent)/g, ' 使用子代理 ');
}

function maskAffirmativeTestPhrases(text) {
  return String(text)
    .replace(/\b(?:do not|don't|dont|never)\s+(?:skip|omit|avoid)\s+(?:(?:running|doing)\s+)?(?:the\s+)?(?:tests?|testing)\b/g, ' ')
    .replace(/(?:不要|别|不能|不得|禁止)\s*(?:跳过|省略|略过|避免)\s*(?:运行|执行|做|进行)?\s*(?:这些?|所有|全部)?\s*测试/g, ' ');
}

function testAllowlistFor(text = '') {
  const source = String(text);
  const allowlist = [];
  const kinds = {
    unit: { english: 'unit', chinese: '单元' },
    integration: { english: 'integration', chinese: '集成' },
    e2e: { english: '(?:end[- ]to[- ]end|e2e)', chinese: '(?:端到端|e2e)' },
    smoke: { english: 'smoke', chinese: '冒烟' },
    'full-suite': { english: '(?:(?:full|whole|entire|complete)(?:\\s+test)?\\s+suite)', chinese: '(?:全量|全套|完整|整个)' },
  };
  for (const kind of TEST_EXCLUSION_ORDER) {
    const names = kinds[kind];
    const english = new RegExp(
      `\\b(?:only\\s+(?:run|execute|rerun)\\s+(?:the\\s+)?${names.english}\\s+(?:tests?|testing)`
        + `|(?:run|execute|rerun)\\s+only\\s+(?:the\\s+)?${names.english}\\s+(?:tests?|testing)`
        + `|(?:run|execute|rerun)\\s+(?:the\\s+)?${names.english}\\s+(?:tests?|testing)\\s+only)\\b`,
      'i',
    );
    const chinese = new RegExp(`(?:只|仅)\\s*(?:运行|执行|跑|重跑|做|进行)\\s*${names.chinese}\\s*测试`, 'i');
    if (english.test(source) || chinese.test(source)) allowlist.push(kind);
  }
  return allowlist;
}

function testExecutionTargetsFor(value = '') {
  const targets = [...String(value).matchAll(/(?:^|[\s`'"])((?:\.\/)?(?:[a-z0-9_.-]+\/)*[a-z0-9_.-]+(?:\.test|\.spec)\.(?:[cm]?[jt]sx?|py|go|rs|java))(?=$|[\s`'"，。；、：;,:.!！])/gi)]
    .map((match) => match[1]);
  return normalizeTestExecutionTargets(targets);
}

function testExecutionBindingFor(value = '') {
  const source = String(value).normalize('NFKC')
    .replace(/\b(?:do\s+not|don't|dont|never)\s+(?:run|execute|rerun)\b[^.;!?\n]*/gi, ' ')
    .replace(/(?:不要|别|禁止|不得|不)\s*(?:运行|执行|跑|重跑)[^；。！？\n]*/gu, ' ');
  const candidates = [];
  const commandPattern = /\b(?:run|execute|rerun)\s+(?:exactly\s+)?[`'"]?((?:node\s+--test\s+(?:\.\/)?[a-z0-9_.\/-]+(?:\.test|\.spec)\.[cm]?[jt]sx?(?:\s+(?:\.\/)?[a-z0-9_.\/-]+(?:\.test|\.spec)\.[cm]?[jt]sx?)*|(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test))(?:[`'"])?(?:\s+(?:exactly\s+)?once\b)?/gi;
  for (const match of source.matchAll(commandPattern)) {
    const command = normalizeTestExecutionCommand(match[1]);
    if (command) candidates.push(command);
  }
  const targetPattern = /\b(?:run|execute|rerun)\s+(?:exactly\s+)?[`'"]?((?:\.\/)?(?:[a-z0-9_.-]+\/)*[a-z0-9_.-]+(?:\.test|\.spec)\.[cm]?[jt]sx?(?:\s+(?:\.\/)?(?:[a-z0-9_.-]+\/)*[a-z0-9_.-]+(?:\.test|\.spec)\.[cm]?[jt]sx?)*)(?:[`'"])?(?:\s+(?:exactly\s+)?once\b)?/gi;
  for (const match of source.matchAll(targetPattern)) {
    const command = normalizeTestExecutionCommand(`node --test ${match[1]}`);
    if (command) candidates.push(command);
  }
  const chineseCommandPattern = /(?:运行|执行|跑|重跑)\s*(?:恰好|准确|仅|只)?\s*[`'"]?((?:node\s+--test\s+(?:\.\/)?[a-z0-9_.\/-]+(?:\.test|\.spec)\.[cm]?[jt]sx?(?:\s+(?:\.\/)?[a-z0-9_.\/-]+(?:\.test|\.spec)\.[cm]?[jt]sx?)*|(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test))(?:[`'"])?(?:\s*(?:一次))?/gi;
  for (const match of source.matchAll(chineseCommandPattern)) {
    const command = normalizeTestExecutionCommand(match[1]);
    if (command) candidates.push(command);
  }
  const chineseTargetPattern = /(?:运行|执行|跑|重跑)\s*(?:恰好|准确|仅|只)?\s*[`'"]?((?:\.\/)?(?:[a-z0-9_.-]+\/)*[a-z0-9_.-]+(?:\.test|\.spec)\.[cm]?[jt]sx?(?:\s+(?:\.\/)?(?:[a-z0-9_.-]+\/)*[a-z0-9_.-]+(?:\.test|\.spec)\.[cm]?[jt]sx?)*)(?:[`'"])?(?:\s*(?:一次))?/gi;
  for (const match of source.matchAll(chineseTargetPattern)) {
    const command = normalizeTestExecutionCommand(`node --test ${match[1]}`);
    if (command) candidates.push(command);
  }
  const unique = uniqueStrings(candidates);
  if (unique.length !== 1) return { command: '', targets: [], ambiguous: unique.length > 1 };
  const command = unique[0];
  const targets = /^node\s+--test\b/i.test(command)
    ? normalizeTestExecutionTargets([...command.matchAll(/(?:^|\s)((?:\.\/)?(?:[a-z0-9_.-]+\/)*[a-z0-9_.-]+(?:\.test|\.spec)\.[cm]?[jt]sx?)(?=$|\s)/gi)]
      .map((match) => match[1]))
    : [];
  return { command, targets, ambiguous: false };
}

function exclusiveToolContractFor({
  text = '',
  prompt = '',
  rawPrompt = prompt,
  directTestExecution = false,
  testExecutionTargets = [],
  testExecutionCommand = '',
  factWork = false,
  securityWork = false,
  review = false,
  noWorkspaceWrite = false,
  directModify = false,
  directCreate = false,
  directTestAuthoring = false,
  releaseRequested = false,
  externalActionRequested = false,
} = {}) {
  const directive = stripQuotedConstraintMentions(String(text).toLowerCase());
  const noOtherTools = /\b(?:do\s+not|don't|never|without)\b[^.!?\n]{0,160}\b(?:use|call|invoke)\s+(?:any\s+)?(?:other|additional)\s+tools?\b/.test(directive)
    || /\b(?:and\s+)?no\s+(?:other|additional)\s+tools?\b/.test(directive)
    || /\b(?:and\s+)?nothing\s+else\b|\b(?:do\s+not|don't|never|without)\s+(?:use|call|invoke)?\s*anything\s+else\b/.test(directive)
    || /(?:不要|不得|禁止|别|不)\s*(?:使用|调用|用)\s*(?:任何)?\s*(?:其他|其它|别的)\s*(?:工具)?/.test(directive);
  if (!noOtherTools) return null;

  let tool = '';
  if (/\b(?:use|call|invoke)\s+(?:only\s+)?(?:the\s+)?(?:bash|shell|terminal|exec(?:_command)?|command)\s+(?:tool\s+)?(?:(?:exactly|only)\s+)?once\b/.test(directive)
    || /\b(?:use|call|invoke)\s+(?:only\s+)?(?:the\s+)?(?:bash|shell|terminal|exec(?:_command)?|command)\s+tool\s+exactly\s+once\b/.test(directive)) tool = 'bash';
  else if (/\b(?:use|call|invoke)\s+(?:only\s+|exactly\s+one\s+)?(?:the\s+)?read(?:\s+tool)?(?:\s+(?:(?:exactly|only)\s+)?once|\s+of\b)/.test(directive)) tool = 'read';
  else if (/\bread\b[^.!?\n]{0,96}\bexactly\s+once\b/.test(directive)) tool = 'read';
  else if (/\b(?:use|run|perform)\s+exactly\s+one\s+(?:built[- ]?in\s+)?(?:focused\s+)?grep\b/.test(directive)
    || /\b(?:use|call|invoke)\s+(?:only\s+)?(?:the\s+)?grep(?:\s+tool)?\s+(?:(?:exactly|only)\s+)?once\b/.test(directive)) tool = 'grep';
  else if (/(?:只|仅)?\s*(?:使用|调用|用)\s*(?:一次\s*)?(?:bash|shell|terminal|exec(?:_command)?|command)(?:\s*工具)?\s*(?:一次)/.test(directive)) tool = 'bash';
  else if (/(?:只|仅)?\s*(?:使用|调用|用)\s*(?:一次\s*)?read(?:\s*工具)?\s*(?:一次)/.test(directive)) tool = 'read';
  else if (/(?:只|仅)?\s*(?:使用|调用|用)\s*(?:一次\s*)?(?:内置)?grep(?:\s*工具)?\s*(?:一次)/.test(directive)) tool = 'grep';
  else if (directTestExecution && testExecutionCommand) tool = 'bash';
  if (!tool) return null;
  if (hasExclusiveCompanionMutation(rawPrompt)) return null;

  if (tool === 'bash'
    && (!directTestExecution || !testExecutionCommand || directTestAuthoring
      || releaseRequested || externalActionRequested)) return null;
  if (tool === 'grep' && (!factWork || directModify || directCreate || releaseRequested || externalActionRequested)) return null;
  if (tool === 'read' && (directTestExecution || directTestAuthoring
    || releaseRequested || externalActionRequested)) return null;

  if (tool === 'bash') {
    return makeExclusiveToolContract(tool, {
      kind: 'exact-command',
      digest: descriptorDigest(testExecutionCommand),
    });
  }
  if (tool === 'read') {
    const targets = exclusiveReadTargets(prompt);
    return makeExclusiveToolContract('read', targets.length === 1 ? {
      kind: 'exact-path',
      digest: descriptorDigest(targets[0]),
      target: targets[0],
    } : {
      kind: 'exact-path',
      status: 'ambiguous',
    });
  }
  return makeExclusiveToolContract('grep', {
    kind: 'focused-claim-search',
    digest: descriptorDigest(prompt),
  });
}

function hasExclusiveCompanionMutation(value = '') {
  const source = String(value).normalize('NFKC').toLowerCase();
  return /(?:\b(?:then|next|after(?:wards)?|also)\b|companion\s+instruction\s*:)[^.!?\n]{0,96}["'“‘`]?\s*\b(?:edit|modify|fix|write|implement|refactor|delete|publish|push|deploy|release)\b/.test(source)
    || /(?:然后|接着|之后|随后|再|同时|附加指令\s*[:：])[^。！？\n]{0,72}["'“‘`]?\s*(?:编辑|修改|修复|写入|实现|重构|删除|发布|推送|部署)/.test(source);
}

function exclusiveReadTargets(value = '') {
  const source = String(value)
    .replace(/\b(?:do\s+not|don't|dont|never)\s+(?:run|execute|rerun|read|inspect)\s+(?:node\s+--test\s+)?[`'"]?(?:\.\/)?(?:[a-z0-9_.-]+\/)*[a-z0-9_.-]+(?:\.test|\.spec)\.[cm]?[jt]sx?[`'"]?/gi, ' ')
    .replace(/(?:不要|别|禁止|不得|不)\s*(?:运行|执行|跑|重跑|读取|检查)\s*(?:node\s+--test\s+)?[`'"]?(?:\.\/)?(?:[a-z0-9_.-]+\/)*[a-z0-9_.-]+(?:\.test|\.spec)\.[cm]?[jt]sx?[`'"]?/giu, ' ')
    .replace(/\b(?:do\s+not|don't|dont|never)\s+(?:run|execute|rerun|read|inspect)\b[^.;!?\n]*/gi, ' ')
    .replace(/(?:不要|别|禁止|不得|不)\s*(?:运行|执行|跑|重跑|读取|检查)[^；。！？\n]*/gu, ' ');
  return uniqueStrings([...source.matchAll(/(?:^|[\s`'"])((?:\.\/)?(?:[a-z0-9_.-]+\/)*[a-z0-9_.-]+\.(?:[cm]?[jt]sx?|json|ya?ml|toml|md|mdx|rst|txt|tex))(?=$|[\s`'"，。；、：;,:.!！])/gi)]
    .map((match) => String(match[1]).replace(/^\.\//, '').replace(/\\/g, '/')));
}

function makeExclusiveToolContract(tool, input = null) {
  return {
    schemaVersion: 1,
    mode: 'exclusive',
    allowedTools: [String(tool)],
    maxCalls: 1,
    required: true,
    input,
    onFailure: 'stop',
    alternatives: 'forbidden',
  };
}

function descriptorDigest(value = '') {
  return createHash('sha256').update(String(value)).digest('hex');
}

function testExclusionsFor(text = '') {
  const source = String(text);
  const exclusions = [];
  const negativePrefix = '(?:(?:do not|don\'t|dont|never|skip|omit)\\s+(?:(?:run|execute|rerun)\\s+)?(?:the\\s+)?|without\\s+(?:running|executing|rerunning)\\s+(?:the\\s+)?)';
  const chinesePrefix = '(?:不要|不|别|无需|不用|跳过|省略|略过)\\s*(?:运行|执行|跑|重跑|做|进行)?\\s*';
  const patterns = {
    unit: new RegExp(`(?:${negativePrefix}unit\\s+(?:tests?|testing)\\b|${chinesePrefix}单元测试)`, 'i'),
    integration: new RegExp(`(?:${negativePrefix}integration\\s+(?:tests?|testing)\\b|${chinesePrefix}集成测试)`, 'i'),
    e2e: new RegExp(`(?:${negativePrefix}(?:end[- ]to[- ]end|e2e)\\s+(?:tests?|testing)\\b|${chinesePrefix}(?:端到端|e2e)\\s*测试)`, 'i'),
    smoke: new RegExp(`(?:${negativePrefix}smoke\\s+(?:tests?|testing)\\b|${chinesePrefix}冒烟测试)`, 'i'),
    'full-suite': new RegExp(`(?:${negativePrefix}(?:full|whole|entire|complete)(?:\\s+test)?\\s+suite\\b|\\bavoid\\s+(?:the\\s+)?(?:full|whole|entire|complete)(?:\\s+test)?\\s+suite\\b|${chinesePrefix}(?:(?:全量|全套)测试|(?:完整|整个)测试套件))`, 'i'),
  };
  for (const kind of TEST_EXCLUSION_ORDER) {
    if (patterns[kind].test(source)) exclusions.push(kind);
  }
  return exclusions;
}

function maskSelectiveTestExclusions(text = '') {
  return String(text)
    .replace(/\b(?:(?:do not|don't|dont|never|skip|omit)\s+(?:(?:run|execute|rerun)\s+)?(?:the\s+)?|without\s+(?:running|executing|rerunning)\s+(?:the\s+)?|avoid\s+(?:the\s+)?)(?:(?:unit|integration|end[- ]to[- ]end|e2e|smoke)\s+(?:tests?|testing)|(?:full|whole|entire|complete)(?:\s+test)?\s+suite)\b/gi, ' ')
    .replace(/(?:不要|不|别|无需|不用|跳过|省略|略过)\s*(?:运行|执行|跑|重跑|做|进行)?\s*(?:(?:单元|集成|端到端|e2e|冒烟)\s*测试|(?:全量|全套)测试|(?:完整|整个)测试套件)/gi, ' ');
}

function hasNaturalNoTestExecution(text) {
  const clause = '(?:^|[，。；、：;,:.!！]\\s*|\\b(?:but|and)\\s+)';
  const english = new RegExp(
    `${clause}(?:please\\s+)?(?:skip|omit)\\s+(?:all\\s+|any\\s+|the\\s+)?(?:tests?|testing)\\b`
      + `|${clause}(?:please\\s+)?(?:do not|don't|dont|never|no need to)\\s+(?:test(?:\\s+(?:it|this|that|the\\s+(?:change|fix|code)))?|(?:run|execute|rerun)\\s+(?:the\\s+)?(?:tests?|testing))\\b`
      + `|${clause}(?:please\\s+)?no\\s+(?:tests?|testing)\\b`
      + '|\\bwithout\\b[^.;!\\n]{0,64}\\b(?:(?:running|executing|rerunning)\\s+(?:the\\s+)?(?:tests?|testing)|testing(?:\\s+(?:it|this|that|the\\s+(?:change|fix|code)))?)\\b',
    'i',
  );
  const chinese = /(?:^|[，。；、：;,:.!！]\s*|(?:但|并且|然后)\s*)(?:请)?(?:跳过|省略|略过)\s*(?:所有|全部|这些?|相关)?\s*测试|(?:^|[，。；、：;,:.!！]\s*|(?:但|并且|然后)\s*)(?:请)?(?:不要|别|无需|不用|不必|禁止|不得|不)\s*(?:再|重新)?(?:运行|执行|跑|重跑|做|进行)?\s*(?:任何|这些?|相关|现有|新的|全部|所有)?\s*测试/;
  return english.test(text) || chinese.test(text);
}

function maskAffirmativeNetworkPhrases(text) {
  return String(text)
    .replace(/\b(?:do not|don't|dont|never)\s+(?:skip|omit|avoid)\s+(?:(?:the|any)\s+)?(?:(?:web|internet|online|network)\s+)?(?:browsing|search|access)\b/g, ' ')
    .replace(/(?:不要|别|不能|不得|禁止)\s*(?:跳过|省略|略过|避免)\s*(?:网页|网络|互联网|在线)?\s*(?:搜索|浏览|访问|上网)/g, ' ');
}

function hasNaturalNoNetworkAccess(text) {
  const clause = '(?:^|[，。；、：;,:.!！]\\s*|\\b(?:but|and)\\s+)';
  const english = new RegExp(
    `${clause}(?:please\\s+)?(?:do not|don't|dont|never|no need to)\\s+(?:(?:browse|search|access|use)\\s+(?:the\\s+)?(?:web|internet|network|online(?:\\s+sources?)?)|go\\s+online)`
      + `|${clause}(?:please\\s+)?(?:skip|omit)\\s+(?:the\\s+)?(?:(?:web|internet|network|online)\\s+)?(?:browsing|search|access)`
      + '|\\bwithout\\s+(?:(?:the\\s+)?(?:web|internet|network)(?:\\s+(?:browsing|search|access))?|going\\s+online)\\b'
      + '|\\bno\\s+(?:web(?:\\s+(?:browsing|access))?|internet(?:\\s+access)?|network(?:\\s+access)?|online\\s+access)\\b',
    'i',
  );
  const chinese = /(?:^|[，。；、：;,:.!！]\s*|(?:但|并且|然后)\s*)(?:请)?(?:不要|别|无需|不用|不必|禁止|不得|不(?=\s*(?:上网|联网)))\s*(?:上网|联网|访问\s*(?:外网|互联网|网络)|浏览\s*(?:网页|互联网|网络)|(?:进行)?\s*(?:网页|网络|互联网)搜索|使用\s*(?:网络|互联网)|(?:网络|互联网)访问|(?:网络|互联网)(?=\s|[，。；、：;,:.!！]|$))|(?:^|[，。；、：;,:.!！]\s*|(?:但|并且|然后)\s*)(?:请)?(?:跳过|省略|略过)\s*(?:网页|网络|互联网|在线)\s*(?:搜索|浏览|访问)/;
  return english.test(text) || chinese.test(text);
}

function englishNegativeClauseIncludes(text, targetPattern) {
  for (const match of String(text).matchAll(/\b(?:do not|don't|dont|never|no need to|without)\s+([^.;!\n]{1,200})/gi)) {
    if (targetPattern.test(match[1])) return true;
  }
  return false;
}

function englishSharedNegativeClauseIncludes(text, targetPattern) {
  for (const match of String(text).matchAll(/\b(?:do not|don't|dont|never|no need to|without)\s+([^.;!\n]{1,200})/gi)) {
    const items = match[1].split(/(?:,|\b(?:and|or|as well as)\b)/i).map((item) => item.trim()).filter(Boolean);
    if (items.length > 1 && targetPattern.test(items.slice(1).join(' '))) return true;
  }
  return false;
}

function chineseNegativeClauseIncludes(text, targetPattern) {
  const prefix = /(?:不要|别|无需|不用|禁止|不得|不\s*(?:再|重新)?\s*(?=(?:运行|执行|跑|重跑|测试|提交|推送|发布|部署|上线|联网|上网|访问|浏览|搜索|使用|修改|改动|编辑|写入|修复|实现|判断|检查|审查|分析)))\s*([^，,。；;.!！\n]{1,200})/g;
  for (const match of String(text).matchAll(prefix)) {
    const items = match[1].split(/(?:、|以及|或者|或|和|与|并且|然后)/).map((item) => item.trim()).filter(Boolean);
    if (items.length > 1 && targetPattern.test(items.slice(1).join(' '))) return true;
  }
  return false;
}

function isSecurityConceptOnlyRequest(text = '') {
  const value = String(text).toLowerCase();
  if (!/(?:xss|ssrf|owasp|path traversal|command injection|auth bypass|vulnerabilit(?:y|ies)|漏洞|注入|路径穿越)/.test(value)) return false;
  const cleaned = value
    .replace(/(?:先)?(?:不|不要|无需|不用)\s*(?:审查|检查|看|分析).*(?:项目代码|代码|配置|文件|仓库)/g, ' ')
    .replace(/(?:do not|don't|without|no need to)\s+(?:review|check|audit|inspect|analyze).*(?:code|config|files?|repo)/g, ' ')
    .replace(/\b(?:no|without)\s+(?:a\s+)?(?:code|config|files?|repo|repository|project)\s+(?:review|check|audit|inspection|analysis)\b/g, ' ');
  if (!/(?:是什么|是什么意思|解释|说明|define|explain|what is|what are)/.test(cleaned)) return false;
  return !/(?:审查|检查|分析|audit|review|inspect|check|handler|api|代码|配置|文件|secret|auth|权限|风险)/.test(cleaned);
}

function operationFor(signals) {
  if (signals.exclusiveToolContract?.input?.kind === 'exact-path') return 'inspect';
  if (signals.answerOnly && !signals.factWork) return 'answer';
  if (signals.conceptOnly && signals.noWorkspaceWrite && signals.codeWork) return 'inspect';
  if (signals.conceptOnly) return 'answer';
  if (signals.externalActionRequested && !signals.localCompanionModify) return 'execute';
  if (signals.localDevExecution || signals.localMigrationExecution || signals.localAutomationExecution || signals.irreversibleExternalOperation) return 'execute';
  if (signals.releaseRequested && signals.directTestExecution && !signals.directModify
    && !signals.writingWork && !signals.directCreate) return 'release';
  if (signals.pureExactTestExecution) return 'execute';
  if (signals.writingWork
    && !(signals.observedTestSummaryWriting && signals.directTestExecution)
    && (!signals.directTestExecution
      || signals.releaseRequested
      || /^(?:(?:please|can\s+you|could\s+you|would\s+you)\s+)?(?:polish|rewrite|proofread|translate|convert|transform|update|draft|write|revise|edit|improve|summarize|summarise|condense)\b|^(?:(?:请|帮我|麻烦)\s*)?(?:把.{0,48})?(?:润色|改写|校对|修订|翻译|转换|转成|更新|撰写|起草|总结|汇总|归纳|整理|写)/.test(signals.text.trim()))
    && /(?:润色|改写|改得|改成|改为|校对|修订|翻译|转换|转成|更新|撰写|起草|总结|汇总|归纳|整理|写)|\b(?:polish|rewrite|proofread|translate|convert|transform|update|draft|write|revise|edit|improve|summarize|summarise|condense)\b/.test(signals.text)) return 'modify';
  if (!signals.noTestExecution && signals.directTestExecution && !signals.directModify && !signals.directTestAuthoring
    && !(signals.review && signals.codeWork)) return 'execute';
  if (signals.noWorkspaceWrite && (signals.directModify || signals.directCreate || signals.directTestAuthoring) && !signals.writingWork) return 'inspect';
  if (signals.noWorkspaceWrite && signals.codeWork) return 'inspect';
  if (signals.diagnosis) return 'diagnose';
  if ((signals.noWorkspaceWrite || signals.advisory) && signals.review) return 'inspect';
  if (signals.observedTestSummaryWriting && !signals.directTestExecution) return 'modify';
  if (signals.bugReportWriting) return 'modify';
  if (signals.directCreate && !signals.directModify) return 'create';
  if (signals.directModify || signals.directTestAuthoring) return 'modify';
  if (signals.releaseRequested) return 'release';
  if (signals.review || signals.factWork || signals.securityWork) return 'inspect';
  return 'answer';
}

function domainsFor(signals, operation) {
  if (signals.externalActionDestructive) return ['general'];
  if (signals.exclusiveToolContract?.input?.kind === 'exact-path'
    && !signals.factWork && !signals.securityWork) {
    const target = signals.exclusiveToolContract.input.target ?? '';
    return /\.(?:md|mdx|rst|txt|tex|docx?)$/iu.test(target) ? ['document'] : ['code'];
  }
  const found = [];
  if (signals.externalActionRequested) found.push('general');
  if (signals.irreversibleExternalOperation) found.push(signals.externalActionDestructive ? 'general' : 'plugin');
  if (signals.localDevExecution) found.push('code');
  if (signals.localMigrationExecution) found.push('config');
  if (signals.localBuildExecution) found.push('code');
  if (signals.dependencyInstallExecution || signals.setupScriptExecution) found.push('config');
  if (signals.codeWork && (!signals.externalActionRequested || signals.localCompanionModify)) found.push('code');
  if (signals.testWork && !(signals.broadBugAudit && signals.noTestExecution)) found.push('tests');
  if (signals.writingWork) found.push('writing');
  if (signals.documentWork) found.push('document');
  if (signals.factWork) found.push('facts');
  if (signals.securityWork) found.push('security');
  if (signals.configWork) found.push('config');
  if (signals.visualWork) found.push('visual');
  if (signals.pluginWork) found.push('plugin');
  if (!found.length) found.push(operation === 'execute' ? 'tests' : 'general');
  return orderedUnique(found, DOMAIN_ORDER);
}

function constraintsFor(signals, operation, domains) {
  const exclusiveLocalFactObservation = signals.factWork
    && signals.exclusiveToolContract?.mode === 'exclusive'
    && signals.exclusiveToolContract.allowedTools?.some((tool) => ['read', 'grep'].includes(tool));
  const exclusiveReadObservation = signals.exclusiveToolContract?.input?.kind === 'exact-path';
  const explicitWritingFileEdit = signals.writingWork
    && signals.workspaceWriteTargets.length > 0
    && /(?:润色|改写|校对|修订|翻译|更新|编辑|修改)|\b(?:polish|rewrite|proofread|translate|update|revise|edit|improve)\b/.test(signals.text);
  const codeOrDocumentWrite = operation === 'modify'
    && (domains.includes('code') || domains.includes('document'))
    && !(signals.factWork && signals.writingWork && !signals.directModify && !explicitWritingFileEdit);
  const workspaceWrite = signals.noWorkspaceWrite
    ? 'forbidden'
    : operation === 'execute'
      ? signals.localMigrationExecution || signals.localAutomationExecution
        ? 'required'
        : signals.localDevExecution
          ? 'unspecified'
          : 'forbidden'
      : ['answer', 'inspect', 'diagnose'].includes(operation)
        ? 'forbidden'
        : codeOrDocumentWrite || operation === 'create'
          ? 'required'
          : 'forbidden';
  const testExecution = signals.noTestExecution
    ? 'forbidden'
    : exclusiveReadObservation
      ? 'forbidden'
    : signals.directTestExecution || signals.directTestAuthoring
      ? 'required'
      : 'unspecified';
  return {
    workspaceWrite,
    testExecution,
    networkAccess: signals.noNetworkAccess || exclusiveLocalFactObservation || exclusiveReadObservation
      ? 'forbidden'
      : signals.externalActionRequested || signals.irreversibleExternalOperation || signals.dependencyInstallExecution || signals.factWork || signals.releaseRequested && ['modify', 'release'].includes(operation)
        ? 'required'
        : 'unspecified',
    externalWrite: signals.externalActionRequested || signals.irreversibleExternalOperation || signals.releaseRequested && ['modify', 'release'].includes(operation) ? 'required' : 'forbidden',
    subagents: signals.noSubagents || exclusiveLocalFactObservation || exclusiveReadObservation ? 'forbidden' : 'unspecified',
  };
}

function complexityFor(signals, operation, domains) {
  const writingDirectiveText = signals.text.split('__writing_content__', 1)[0];
  if (signals.suppliedFindingsReport) return 'focused';
  if (signals.factWork && signals.exclusiveToolContract?.allowedTools?.some((tool) => ['read', 'grep'].includes(tool))) return 'focused';
  if (signals.focusedLocalFactWork) return 'focused';
  if (signals.primaryDirectTestAuthoring) return 'focused';
  if (signals.securityProseWriting
    && /(?:起草|撰写|写).{0,32}(?:安全公告|安全政策|安全说明)|\b(?:draft|write)\b.{0,48}\bsecurity\s+(?:announcement|policy|notice|advisory)\b|\bsecurity\s+policy\b/.test(signals.text)) return 'broad';
  if (signals.factWork || signals.securityWork && (operation === 'modify' || operation === 'inspect')) return 'broad';
  if (signals.broadBugAudit) return 'broad';
  if (domains.includes('document')
    && (signals.documentArtifactCreateRequested || signals.documentTransformationRequested)
    && !/(?:完整|长篇|全面)|\b(?:full|long|substantive|complete|comprehensive)\b/i.test(signals.text)) return 'focused';
  if (domains.includes('writing')
    && /\b(?:check|review|proofread|copyedit|polish|improve)\b.{0,96}\bwording\b/.test(writingDirectiveText)
    && !/(?:逻辑|结构|风格)|\b(?:logic|structure|style)\b/.test(writingDirectiveText)) return 'focused';
  if (domains.includes('writing')
    && /(?:单个|一个|这个).{0,12}段落|\b(?:this|a|one|single)\b.{0,24}\bparagraph\b/.test(writingDirectiveText)
    && !/(?:完整|长篇|全面)|\b(?:full|long|substantive|complete|comprehensive)\b/.test(writingDirectiveText)) return 'focused';
  if (domains.includes('writing')
    && /(?:下面这段|下面文字|下面说明|这段话|这段文字)|\b(?:this|the)\s+(?:excerpt|snippet)\b/.test(writingDirectiveText)
    && !/(?:完整|长篇|全面)|\b(?:full|long|substantive|complete|comprehensive)\b/.test(writingDirectiveText)) return 'focused';
  if (domains.includes('writing')
    && /(?:段|句|话|文字|文本|摘要|表述).{0,24}(?:改得|改成|改为)/.test(writingDirectiveText)) return 'focused';
  if (domains.includes('writing')
    && /\b(?:the|this|a)\s+(?:paper|manuscript|report)\s+(?:introduction|abstract|conclusion|section)\b/.test(writingDirectiveText)
    && !/\b(?:full|whole|entire|complete|comprehensive)\b/.test(writingDirectiveText)) return 'focused';
  if (domains.includes('writing')
    && /(?:markdown|md\s*文档)/i.test(signals.text)
    && /(?:整理|转换|改成|格式化|保留.{0,24}(?:标题|层级|代码块))|\b(?:organize|convert|format|preserve)\b/i.test(signals.text)
    && !/(?:完整|长篇|全面)|\b(?:full|long|substantive|complete|comprehensive)\b/i.test(signals.text)) return 'focused';
  if (domains.includes('writing')
    && /(?:完整|长篇|全面|研究提案|项目总结)|\b(?:full|long|substantive|complete|comprehensive)\b.{0,36}\b(?:proposal|report|paper|document)\b/.test(signals.text)) return 'broad';
  if (domains.includes('writing') && !(signals.workspaceWriteTargets ?? []).length
    && /(?:一份|报告|文档|邮件|审稿回复|相关工作|引言|申请材料|研究计划|实验报告|项目报告|风险提示|发布说明|更新日志|章节|第\s*[一二三四五六七八九十\d]+\s*章)|\b(?:report|bug\s+report|document|proposal|letter|email|summary|guide|manual|troubleshooting|release notes?|changelog|related work|section|chapter|manuscript|paper|abstract|writeup|postmortem)\b/.test(signals.text)) return 'broad';
  if (domains.includes('writing')
    && /(?:论文|摘要|报告|提案).{0,24}(?:润色|检查逻辑|检查表达|审查)|(?:润色|审查).{0,24}(?:论文|摘要|报告|提案)/.test(signals.text)) return 'broad';
  if (domains.includes('writing')
    && /(?:写|撰写|起草).{0,18}(?:报告|提案|论文|政策|备忘录|公告)|\b(?:write|draft)\b.{0,32}\b(?:report|proposal|paper|policy|memo|announcement|post)\b/.test(signals.text)) return 'broad';
  if (domains.includes('writing')
    && /(?:检查|审查).{0,18}(?:逻辑|表达|风格)|\b(?:check|review)\b.{0,24}\b(?:logic|style|wording|structure)\b|\brelated work\b/.test(signals.text)) return 'broad';
  if (['modify', 'create'].includes(operation) && domains.includes('code')
    && /(?:功能|模块|页面)|\b(?:feature|module|page)\b/.test(signals.text)
    && !/(?:这个|该).{0,16}(?:功能|模块|页面)|(?:一个|单个).{0,12}函数|\b(?:this|the)\b.{0,16}\b(?:feature|module|page)\b|\b(?:a|one|single)\b.{0,12}\bfunction\b/.test(signals.text)) return 'broad';
  if (signals.visualWork
    && /(?:看板|dashboard).{0,64}(?:包含|包括|with).{0,64}(?:和|及|以及|and)/.test(signals.text)) return 'broad';
  if (['modify', 'create'].includes(operation) && domains.includes('code')
    && !signals.noSubagents
    && /\bagentically\b|(?:并行|使用|启动|调用|委派).{0,24}(?:子代理|subagents?|sub-agents?)|(?:fork|spawn|use|using|with|delegate\s+to).{0,24}(?:subagents?|sub-agents?)/.test(signals.text)) return 'broad';
  if (operation === 'inspect' && domains.includes('code') && domains.includes('tests')
    && !/(?:focused|直接|单个|一个|single|\bone\b|router\.js|\bfunction\b)/.test(signals.text)) return 'broad';
  if (/(?:找|检查|审计|测试).{0,20}(?:bug|缺陷)|\b(?:find|hunt|check|audit|test)\b.{0,24}\b(?:bugs?|defects?)\b/.test(signals.text)
    && !/(?:focused|直接|单个|一个|single|\bone\b|router\.js|routenaturallanguagetask|\bfunction\b)/.test(signals.text)) return 'broad';
  if (operation === 'modify'
    && /(?:大规模|全面|多个文件|跨文件|整个(?:项目|代码库)|全项目)|\b(?:large[- ]scale|multi[- ]file|cross[- ]file|codebase[- ]wide|repo[- ]wide|substantial refactor|multiple files|all affected imports)\b/.test(signals.text)) return 'broad';
  if (domains.length === 1 && domains[0] === 'general') return 'simple';
  return 'focused';
}

function capabilitiesFor({ operation, domains, constraints, complexity }) {
  if (operation === 'answer' && constraints.testExecution !== 'required') return [];
  const capabilities = [];
  if (!domains.includes('general')) capabilities.push('fs.read');
  if (constraints.workspaceWrite === 'required') capabilities.push('fs.write');
  if (domains.some((domain) => ['code', 'tests', 'document', 'plugin', 'config', 'visual'].includes(domain))) capabilities.push('shell.execute');
  if (constraints.testExecution === 'required') capabilities.push('tests.execute');
  if (constraints.networkAccess === 'required') capabilities.push('network.read');
  if (complexity === 'broad' && constraints.subagents !== 'forbidden') capabilities.push('subagents');
  if (constraints.externalWrite === 'required') capabilities.push('external.write', 'credentials');
  return orderedUnique(capabilities, CAPABILITY_ORDER);
}

function phasesFor({ operation, domains, constraints, signals }) {
  if (operation === 'answer') return [{ kind: 'answer', domain: domains[0] ?? 'general' }];
  if (signals.primaryDirectTestAuthoring) {
    return [
      { kind: 'inspect', domain: 'tests' },
      { kind: 'modify', domain: 'tests' },
      { kind: 'verify', domain: 'tests' },
      { kind: 'review', domain: 'tests' },
    ];
  }
  if (operation === 'execute') {
    if (signals.externalActionRequested) {
      const localPhase = signals.localMigrationExecution
        ? { kind: 'execute', domain: 'config' }
        : signals.localDevExecution || signals.localBuildExecution
          ? { kind: 'execute', domain: 'code' }
          : signals.dependencyInstallExecution || signals.setupScriptExecution
            ? { kind: 'execute', domain: 'config' }
            : signals.directTestExecution
              ? { kind: 'verify', domain: 'tests' }
              : null;
      return compactPhases([localPhase, { kind: 'execute', domain: 'general' }]);
    }
    if (signals.externalActionDestructive) return [{ kind: 'execute', domain: 'general' }];
    if (signals.irreversibleExternalOperation) return [{ kind: 'release', domain: 'plugin' }];
    if (signals.localMigrationExecution) return [{ kind: 'execute', domain: 'config' }];
    if (signals.localDevExecution) return [{ kind: 'execute', domain: 'code' }];
    if (signals.localBuildExecution) return [{ kind: 'execute', domain: 'code' }];
    if (signals.dependencyInstallExecution || signals.setupScriptExecution) return [{ kind: 'execute', domain: 'config' }];
    return [{ kind: 'verify', domain: 'tests' }];
  }
  if (operation === 'diagnose') {
    const diagnosisDomain = domains.includes('config')
      ? 'config'
      : domains.includes('code')
        ? 'code'
        : domains.includes('plugin')
          ? 'plugin'
          : domains[0] ?? 'general';
    return [{ kind: 'inspect', domain: diagnosisDomain }, { kind: 'diagnose', domain: diagnosisDomain }];
  }
  if (operation === 'release') return compactPhases([
    signals.directTestExecution ? { kind: 'verify', domain: 'tests' } : null,
    { kind: 'release', domain: 'plugin' },
  ]);
  if (operation === 'create' && domains.includes('visual')) return [{ kind: 'create', domain: 'visual' }, { kind: 'review', domain: 'visual' }];
  if (operation === 'create' && domains.includes('document')) return [
    { kind: 'inspect', domain: 'document' },
    { kind: 'create', domain: 'document' },
    { kind: 'review', domain: 'document' },
  ];

  const externalPhase = signals.externalActionRequested
    ? { kind: 'execute', domain: 'general' }
    : constraints.externalWrite === 'required'
      ? { kind: 'release', domain: 'plugin' }
      : null;

  if (operation === 'inspect') {
    if (domains.includes('security')) return [{ kind: 'inspect', domain: 'security' }, { kind: 'review', domain: 'security' }];
    if (domains.includes('facts')) return [{ kind: 'inspect', domain: 'facts' }];
    if (domains.includes('code')) return compactPhases([
      { kind: 'inspect', domain: 'code' },
      constraints.testExecution === 'required' ? { kind: 'verify', domain: 'tests' } : null,
      { kind: 'review', domain: 'code' },
    ]);
    if (domains.includes('writing')) return [{ kind: 'inspect', domain: 'writing' }, { kind: 'review', domain: 'writing' }];
    if (domains.includes('plugin')) return [{ kind: 'inspect', domain: 'plugin' }];
    return [{ kind: 'inspect', domain: domains[0] ?? 'general' }];
  }

  if (signals.factWork && signals.writingWork) {
    return compactPhases([
      { kind: 'inspect', domain: 'facts' },
      signals.codeModificationRequested ? { kind: 'modify', domain: 'code' } : null,
      { kind: 'modify', domain: 'writing' },
      constraints.testExecution === 'required' ? { kind: 'verify', domain: 'tests' } : null,
      { kind: 'review', domain: 'writing' },
      externalPhase,
    ]);
  }
  if (domains.includes('security') && domains.includes('writing')) {
    return compactPhases([
      { kind: 'inspect', domain: 'security' },
      signals.codeModificationRequested ? { kind: 'modify', domain: 'code' } : null,
      { kind: 'modify', domain: 'writing' },
      { kind: 'verify', domain: 'writing' },
      constraints.testExecution === 'required' ? { kind: 'verify', domain: 'tests' } : null,
      { kind: 'review', domain: 'writing' },
      { kind: 'review', domain: 'security' },
      externalPhase,
    ]);
  }
  if (domains.includes('security')) {
    return compactPhases([
      { kind: 'inspect', domain: 'security' },
      { kind: 'modify', domain: 'code' },
      constraints.testExecution === 'required' ? { kind: 'verify', domain: 'tests' } : null,
      { kind: 'review', domain: 'security' },
      externalPhase,
    ]);
  }
  if (domains.includes('visual') && signals.visualModificationRequested) {
    return compactPhases([
      { kind: 'inspect', domain: 'visual' },
      { kind: 'modify', domain: 'visual' },
      { kind: 'review', domain: 'visual' },
      externalPhase,
    ]);
  }
  if (domains.includes('writing') && domains.includes('document') && !signals.codeModificationRequested) {
    return compactPhases([
      domains.includes('code') ? { kind: 'inspect', domain: 'code' } : null,
      { kind: 'inspect', domain: 'writing' },
      { kind: 'modify', domain: 'writing' },
      { kind: 'verify', domain: 'writing' },
      constraints.testExecution === 'required' ? { kind: 'verify', domain: 'tests' } : null,
      { kind: 'review', domain: 'writing' },
      domains.includes('code') ? { kind: 'review', domain: 'code' } : null,
      externalPhase,
    ]);
  }
  if (domains.includes('code') && (signals.codeModificationRequested || signals.directCreate)) {
    return compactPhases([
      { kind: 'inspect', domain: 'code' },
      { kind: operation === 'create' ? 'create' : 'modify', domain: 'code' },
      constraints.testExecution === 'required' ? { kind: 'verify', domain: 'tests' } : null,
      { kind: 'review', domain: 'code' },
      domains.includes('writing') ? { kind: 'modify', domain: 'writing' } : null,
      domains.includes('writing') ? { kind: 'review', domain: 'writing' } : null,
      externalPhase,
    ]);
  }
  if (domains.includes('writing')) {
    const testPhase = constraints.testExecution === 'required' ? { kind: 'verify', domain: 'tests' } : null;
    const testFirst = /^(?:(?:please)\s+)?(?:run|execute|rerun)\b.{0,48}\b(?:tests?|testing)|^(?:请\s*)?(?:运行|执行|跑|重跑).{0,32}(?:测试|test)/.test(signals.text.trim());
    return compactPhases([
      testFirst ? testPhase : null,
      { kind: 'inspect', domain: 'writing' },
      { kind: 'modify', domain: 'writing' },
      testFirst ? null : testPhase,
      { kind: 'review', domain: 'writing' },
      externalPhase,
    ]);
  }
  return compactPhases([{ kind: 'modify', domain: domains[0] ?? 'general' }, externalPhase]);
}

function riskFor({ operation, domains, constraints, signals = {} }) {
  const executesIrreversibleAction = (signals.irreversibleFileOperation || signals.irreversibleExternalOperation)
    && ['modify', 'execute', 'release'].includes(operation);
  const flags = [];
  if (constraints.externalWrite === 'required') flags.push('external-write');
  if (domains.includes('security')) flags.push('security-sensitive');
  if (constraints.testExecution === 'required') flags.push('test-execution');
  if (constraints.workspaceWrite === 'required') flags.push('workspace-write');
  if (domains.includes('facts')) flags.push('factual-claims');
  if (domains.includes('facts') && constraints.networkAccess === 'required') flags.push('network-read');
  if (executesIrreversibleAction) flags.push('irreversible-file-operation', 'user-approval-required');
  const ordered = orderedUnique(flags, RISK_FLAG_ORDER);
  const level = executesIrreversibleAction
    ? 'critical'
    : domains.includes('security') && constraints.externalWrite === 'required'
    ? 'critical'
    : constraints.externalWrite === 'required'
      ? 'high'
      : domains.includes('security')
        ? 'high'
        : ordered.length
          ? 'medium'
          : 'low';
  return { level, flags: ordered };
}

function shouldUseDescriptorPolicy({ operation, domains, constraints, phases, signals }) {
  return signals.noWorkspaceWrite
    || signals.advisory
    || signals.noTestExecution
    || signals.testExclusions.length > 0
    || signals.noExternalWrite
    || signals.noNetworkAccess
    || signals.releaseRequested
    || signals.irreversibleExternalOperation
    || signals.localGitMetadata
    || signals.implicitModify
    || signals.bugReportCompanionCodeAction
    || signals.ambiguous
    || operation === 'execute'
    || operation === 'diagnose'
    || operation === 'answer' && domains.includes('tests')
    || domains.includes('facts') && domains.includes('writing')
    || domains.includes('security') && operation === 'modify'
    || phases.length >= 4
    || operation === 'inspect' && domains.some((domain) => domain === 'code' || domain === 'plugin');
}

function hasCodeTarget(text) {
  return /(?:^|[\s"'`(])(?:src|lib|app|packages|plugins|extensions|test|tests)\/[^\s"'`)]+/.test(text)
    || /\b[\w.-]+\.(?:js|mjs|cjs|ts|tsx|jsx|py|go|rs|java|kt|swift|cs|cpp|c|h|hpp|rb|php|sh|sql|yml|yaml|json|toml)\b/.test(text)
    || /(?:^|[\s"'`(])(?:scripts|migrations|fixtures)\/[^\s"'`)]+/.test(text);
}

function canonicalLegacyIntent(intent) {
  const aliases = {
    'agentic.simple': 'agentic.simple',
    unknown: 'unknown',
    'writing.zh': 'writing.zh',
    'writing.en': 'writing.en',
    'writing.latex': 'writing.latex',
    'writing.markdown': 'writing.markdown',
    'doc.convert.word': 'doc.convert.word',
    'factcheck.document': 'factcheck.document',
    'fact-check': 'factcheck.document',
    'code.dev': 'code.dev',
    'implementation-with-tests': 'code.dev',
    'code.debug': 'code.debug',
    diagnosis: 'code.debug',
    'code.test': 'testing',
    testing: 'testing',
    'code.review': 'code.review',
    'bug-audit': 'code.review',
    'omp.plugin': 'omp.plugin',
    'config-assets': 'omp.plugin',
    'security.review': 'security.review',
    'security-review': 'security.review',
    'design.visual': 'design.visual',
    release: 'release',
  };
  return aliases[intent] ?? 'unknown';
}

function writingLegacyTemplate(language, domain = 'writing') {
  return {
    operation: 'modify',
    domains: [domain === 'document' ? 'writing' : domain, ...(domain === 'document' ? ['document'] : [])],
    phases: [{ kind: 'inspect', domain: 'writing' }, { kind: 'modify', domain: 'writing' }, { kind: 'review', domain: 'writing' }],
    language,
  };
}

function legacyDescriptor(template) {
  const constraints = normalizeConstraints(template.constraints);
  const domains = orderedUnique(template.domains ?? ['general'], DOMAIN_ORDER);
  const complexity = template.complexity ?? 'focused';
  return normalizeTaskDescriptor({
    ...template,
    domains,
    constraints,
    capabilities: capabilitiesFor({ operation: template.operation, domains, constraints, complexity }),
    complexity,
    risk: template.risk ?? riskFor({ domains, constraints }),
    language: template.language ?? 'unknown',
    provenance: { ruleConfidence: 1, reasons: ['legacy intent compatibility'], requiresPolicyRoute: true },
  });
}

function normalizeConstraints(value = {}) {
  const allowed = new Set(['forbidden', 'unspecified', 'required']);
  return Object.fromEntries(Object.entries(DEFAULT_CONSTRAINTS).map(([key, fallback]) => [
    key,
    allowed.has(value?.[key]) ? value[key] : fallback,
  ]));
}

function isCompletedGateStatusReport(text = '') {
  return /(?:gate validator|validator|门禁|验证器)/.test(text)
    && /(?:报告已交付|无更多工作|审计完成|所有.{0,20}完成|gate complete|no more work)/.test(text);
}

function isRouteStatusSkillDiagnosticProbe(text = '') {
  const hasRouteAndStatusTools = /omp_core_route_task/.test(text)
    && /omp_core_subagent_status/.test(text);
  const asksForDiagnosticProbe = /(?:验证|检查|核对|诊断|probe|check|verify).{0,120}(?:路由|状态|route|routing|status)|(?:路由|状态|route|routing|status).{0,120}(?:验证|检查|核对|诊断|probe|check|verify)/.test(text);
  const forbidsWorkspaceWrite = /(?:不|不要|禁止|不得).{0,16}(?:修改|改动|写入).{0,12}(?:文件|代码|项目)?|(?:do not|don't|without).{0,18}(?:modify|edit|write).{0,12}(?:files?|code|project)?/.test(text);
  const forbidsTestExecution = /(?:不|不要|禁止|不得).{0,16}(?:运行|执行|跑).{0,12}测试|(?:do not|don't|without).{0,18}(?:run|execute).{0,12}tests?/.test(text);
  return hasRouteAndStatusTools && asksForDiagnosticProbe
    && forbidsWorkspaceWrite && forbidsTestExecution;
}

function isExclusiveRouteTaskDiagnosticProbe(text = '') {
  const value = String(text).trim().toLowerCase();
  if (!/\bomp_core_route_task\b/.test(value)) return false;
  if (exclusiveRouteProbeHasCompanionMutation(value)) return false;
  const oneShot = /^(?:(?:please|can\s+you|could\s+you|would\s+you)\s+)?(?:call|invoke|use)\s+(?:only\s+)?omp_core_route_task\s+(?:exactly\s+once|once)\b/.test(value)
    || /^(?:请|帮我|麻烦)?\s*只\s*(?:调用|使用)\s*(?:一次\s*)?omp_core_route_task(?:\s*一次)?(?:[，,:：\s]|$)/.test(value);
  if (!oneShot) return false;
  return /\b(?:do\s+not|don't|without)\s+(?:use|call|invoke|using|calling|invoking)\s+(?:any\s+)?other\s+tools?\b/.test(value)
    || /\b(?:do\s+not|don't|without)\b[^.!?;\n]{0,160}(?:,\s*)?\b(?:and|or)\s+(?:use|call|invoke|using|calling|invoking)\s+(?:any\s+)?other\s+tools?\b/.test(value)
    || /(?:不要|不得|禁止|别|不)\s*(?:使用|调用)\s*(?:任何)?\s*(?:其他|其它)\s*工具/.test(value)
    || /只\s*调用\s*一次\s*omp_core_route_task/.test(value);
}

function exclusiveRouteProbeHasCompanionMutation(value = '') {
  const source = String(value).normalize('NFKC');
  const boundaries = [
    ...source.matchAll(/\s+then\s+(?:report|return|respond)\b/gi),
    ...source.matchAll(/(?:然后|接着|再)\s*(?:只|仅)?\s*(?:报告|返回|输出)/gi),
  ].sort((left, right) => (left.index ?? -1) - (right.index ?? -1));
  const last = boundaries.at(-1);
  if (last?.index == null) return hasExclusiveCompanionMutation(source);
  const outer = source.slice(last.index + last[0].length).replace(/^[^.!?。！？\n]*[.!?。！？]?/u, ' ');
  return hasExclusiveCompanionMutation(outer);
}

function exclusiveRouteProbePrompt(value = '') {
  const source = String(value).normalize('NFKC').trim();
  const extractBeforeBoundary = (startPattern, explicitBoundaryPattern, fallbackBoundaryPattern, { first = false } = {}) => {
    const start = source.match(startPattern);
    if (!start || start.index == null) return '';
    const tail = source.slice(start.index + start[0].length);
    const explicitBoundaries = [...tail.matchAll(explicitBoundaryPattern)];
    const boundaries = explicitBoundaries.length
      ? explicitBoundaries
      : [...tail.matchAll(fallbackBoundaryPattern)];
    const boundary = first ? boundaries[0] : boundaries.at(-1);
    if (boundary?.index == null) return '';
    const payload = tail.slice(0, boundary.index).trim();
    const quoted = payload.match(/^(?:"([\s\S]+)"|“([\s\S]+)”|'([\s\S]+)'|‘([\s\S]+)’|`([\s\S]+)`)$/u);
    return String(quoted ? quoted.slice(1).find((part) => part != null) : payload).trim();
  };
  return extractBeforeBoundary(
    /\b(?:with\s+)?prompt\s+exactly\s*:\s*/i,
    /\s+(?:(?:then|next)\s+(?:report|return|respond)\b|(?:do\s+not|don't|never)\s+(?:use|call|invoke)\s+(?:any\s+)?other\s+tools?\b)/gi,
    /\s+(?:(?:report|return|respond)\b|(?:do\s+not|don't|never)\s+(?:use|call|invoke)\s+(?:any\s+)?other\s+tools?\b)/gi,
    { first: true },
  ) || extractBeforeBoundary(
    /\bwith\s+(?:this\s+)?prompt\s*:\s*/i,
    /\s+then\s+(?:report|return|respond)\b/gi,
    /\s+(?:report|return|respond)\b/gi,
  ) || extractBeforeBoundary(
    /(?:参数\s*)?prompt\s*(?:为|是)?\s*[:：]\s*/i,
    /(?:然后|接着|再)\s*(?:只|仅)?\s*(?:报告|返回|输出)/gi,
    /(?:只|仅)?\s*(?:报告|返回|输出)/gi,
  );
}

function isExclusiveSubagentStatusDiagnosticProbe(text = '') {
  const value = String(text).trim().toLowerCase();
  if (!value || !/\bomp_core_subagent_status\b/.test(value)) return false;
  const firstBoundary = value.search(/[.!?。！？\n]/u);
  const firstClause = (firstBoundary === -1 ? value : value.slice(0, firstBoundary)).trim();
  const remainder = firstBoundary === -1 ? '' : value.slice(firstBoundary + 1).trim();
  const oneShot = /^(?:(?:please|can you|could you|would you)\s+)?(?:call|invoke|use)\s+(?:only\s+)?omp_core_subagent_status\s+(?:exactly\s+once(?:\s+only)?|once)\s+to\s+(?:inspect|check|report)\s+(?:the\s+)?(?:current\s+)?(?:route\s+)?status$/u.test(firstClause)
    || /^(?:请|帮我|麻烦)?\s*只\s*(?:调用|使用)\s*(?:一次\s*)?omp_core_subagent_status\s*(?:一次)?\s*(?:来|以便)?\s*(?:检查|查看|报告)(?:当前)?(?:路由)?状态$/u.test(firstClause);
  if (!oneShot) return false;
  const noOtherTools = /\b(?:do\s+not|don't|without)\b[^.!?\n]{0,160}\b(?:use|call|invoke)\s+(?:any\s+)?other\s+tools?\b/.test(value)
    || /(?:不要|不得|禁止|不)\s*(?:使用|调用)\s*(?:任何)?\s*(?:其他|其它)\s*工具/.test(value);
  if (!noOtherTools || !remainder) return false;
  const responseLiteral = String.raw`(?:[a-z0-9_.-]{1,48}\s*:\s*)?[a-z0-9_.-]{1,48}`;
  const conditionalResponsePattern = new RegExp(
    String.raw`^if\s+(?:it|(?:that|the)\s+(?:tool(?:\s+call)?|status(?:\s+(?:tool|call))?))\s+succeeds?\s*,\s*return\s+exactly\s+${responseLiteral}\s*[;；]\s*otherwise\s*,?\s*return\s+exactly\s+${responseLiteral}$`,
    'u',
  );
  const chineseConditionalResponsePattern = new RegExp(
    String.raw`^(?:如果|若)(?:该|这个)?(?:工具|状态(?:工具|调用)?)(?:调用)?(?:成功|执行成功)[，,]\s*(?:只)?(?:返回|输出)\s*${responseLiteral}\s*[;；]\s*(?:否则|不然)[，,]?\s*(?:只)?(?:返回|输出)\s*${responseLiteral}$`,
    'u',
  );
  const directResponsePattern = new RegExp(
    String.raw`^(?:return|respond|report)\s+exactly\s+${responseLiteral}$`,
    'u',
  );
  const chineseDirectResponsePattern = new RegExp(
    String.raw`^(?:只)?(?:返回|输出|报告)\s*${responseLiteral}$`,
    'u',
  );
  const englishForbiddenItem = String.raw`(?:(?:start|use|fork)\s+(?:any\s+)?subagents?|(?:modify|edit|write(?:\s+to)?)\s+(?:any\s+)?(?:files?|code|project|workspace)|(?:run|execute)\s+(?:any\s+)?tests?|(?:access|use)\s+(?:the\s+)?network|(?:call|use|invoke)\s+(?:any\s+)?(?:other|additional)\s+tools?|(?:push|publish|deploy|release)(?:\s+(?:anything|the\s+(?:plugin|release)))?)`;
  const englishNegativeConstraintPattern = new RegExp(
    String.raw`^(?:do\s+not|don't|never)\s+${englishForbiddenItem}(?:\s*(?:,\s*(?:(?:and|or)\s+)?|\s+(?:and|or)\s+)${englishForbiddenItem})*$`,
    'u',
  );
  const chineseForbiddenItem = String.raw`(?:(?:启动|使用)(?:任何)?子代理|修改(?:任何)?(?:文件|代码|项目|工作区)|运行(?:任何)?测试|访问网络|联网|调用(?:任何)?(?:其他|其它)工具|推送|发布|部署)`;
  const chineseNegativeConstraintPattern = new RegExp(
    String.raw`^(?:不要|不得|禁止|别)\s*${chineseForbiddenItem}(?:\s*(?:[，,、]\s*(?:(?:以及|并且|或)\s*)?|(?:以及|并且|或)\s*)${chineseForbiddenItem})*$`,
    'u',
  );
  const remainderClauses = remainder.split(/[.!?。！？\n]+/u).map((clause) => clause.trim()).filter(Boolean);
  return remainderClauses.length > 0 && remainderClauses.every((clause) => conditionalResponsePattern.test(clause)
    || chineseConditionalResponsePattern.test(clause)
    || directResponsePattern.test(clause)
    || chineseDirectResponsePattern.test(clause)
    || englishNegativeConstraintPattern.test(clause)
    || chineseNegativeConstraintPattern.test(clause));
}

function orderedUnique(values, order) {
  const unique = [...new Set((values ?? []).filter(Boolean))];
  return unique.sort((left, right) => order.indexOf(left) - order.indexOf(right));
}

function uniquePhases(values) {
  const seen = new Set();
  return compactPhases(values).filter((phase) => {
    const key = `${phase.kind}:${phase.domain}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compactPhases(values) {
  return (values ?? []).filter((value) => value
      && PHASE_KIND_VALUES.has(value.kind)
      && DOMAIN_VALUES.has(value.domain))
    .map(({ kind, domain }) => ({ kind, domain }));
}

function phaseAllowedByConstraints(phase, constraints) {
  if (phase.kind === 'release' && constraints.externalWrite !== 'required') return false;
  if (phase.kind === 'verify' && phase.domain === 'tests' && constraints.testExecution !== 'required') return false;
  if ((phase.kind === 'modify' || phase.kind === 'create')
    && ['code', 'document', 'plugin', 'config', 'visual'].includes(phase.domain)
    && constraints.workspaceWrite !== 'required') return false;
  return true;
}

function defaultPhaseFor(operation, domains) {
  const domain = domains[0] ?? 'general';
  if (operation === 'inspect') return { kind: 'inspect', domain };
  if (operation === 'diagnose') return { kind: 'diagnose', domain };
  if (operation === 'modify') return { kind: 'review', domain };
  if (operation === 'create') return { kind: 'review', domain };
  if (operation === 'execute') return { kind: 'execute', domain };
  if (operation === 'release') return { kind: 'answer', domain };
  return { kind: 'answer', domain };
}

function uniqueStrings(values) {
  return [...new Set((values ?? []).map((value) => String(value).trim()).filter(Boolean))];
}

function normalizeScopedTargets(values) {
  return uniqueStrings((Array.isArray(values) ? values : [])
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value)));
}

function normalizeTestExecutionTargets(values) {
  return uniqueStrings((Array.isArray(values) ? values : [])
    .filter((value) => typeof value === 'string')
    .map((value) => String(value).trim().replace(/^\.\//, '').replace(/\\/g, '/').replace(/^[`'"]+|[`'"，。；、：;,:.!！]+$/g, ''))
    .filter((value) => /(?:\.test|\.spec)\.(?:[cm]?[jt]sx?|py|go|rs|java)$/i.test(value)));
}

function normalizeTestExecutionCommand(value = '') {
  const command = String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!command || command.length > 512 || /[\r\n;&|<>`]/.test(command)) return '';
  if (/^node\s+--test\s+(?:\.\/)?[a-z0-9_.\/-]+(?:\.test|\.spec)\.[cm]?[jt]sx?(?:\s+(?:\.\/)?[a-z0-9_.\/-]+(?:\.test|\.spec)\.[cm]?[jt]sx?)*$/i.test(command)) return command;
  if (/^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test$/i.test(command)) return command;
  return '';
}

function normalizeExclusiveToolContract(value, {
  operation = 'answer',
  domains = [],
  constraints = DEFAULT_CONSTRAINTS,
  testExecutionCommand = '',
} = {}) {
  if (!value || value.schemaVersion !== 1 || value.mode !== 'exclusive'
    || value.maxCalls !== 1 || value.required !== true
    || value.onFailure !== 'stop' || value.alternatives !== 'forbidden') return null;
  const allowedTools = uniqueStrings((Array.isArray(value.allowedTools) ? value.allowedTools : [])
    .map(canonicalExclusiveToolName)
    .filter((tool) => /^[a-z0-9_.:-]{1,64}$/.test(tool)));
  if (allowedTools.length !== 1) return null;
  const input = normalizeExclusiveToolInput(value.input);
  if (!input) return null;
  const tool = allowedTools[0];
  const expectedToolByKind = {
    'exact-command': 'bash',
    'exact-path': 'read',
    'focused-claim-search': 'grep',
    'route-probe': 'omp_core_route_task',
    'status-probe': 'omp_core_subagent_status',
  };
  if (expectedToolByKind[input.kind] !== tool) return null;
  if (input.kind === 'exact-command') {
    if (operation !== 'execute' || !domains.includes('tests')
      || constraints.testExecution !== 'required' || !testExecutionCommand
      || input.status !== 'bound' || input.digest !== descriptorDigest(testExecutionCommand)) return null;
  } else if (input.kind === 'exact-path') {
    if (operation !== 'inspect' || constraints.workspaceWrite !== 'forbidden'
      || input.status === 'bound' && input.digest !== descriptorDigest(input.target)) return null;
  } else if (input.kind === 'focused-claim-search') {
    if (operation !== 'inspect' || !domains.includes('facts') || input.status !== 'bound') return null;
  } else if (input.kind === 'route-probe' || input.kind === 'status-probe') {
    if (operation !== 'diagnose' || !domains.includes('plugin') || input.status !== 'bound') return null;
  }
  return {
    schemaVersion: 1,
    mode: 'exclusive',
    allowedTools,
    maxCalls: 1,
    required: true,
    input,
    onFailure: 'stop',
    alternatives: 'forbidden',
  };
}

function canonicalExclusiveToolName(value = '') {
  const name = String(value ?? '').trim().toLowerCase();
  if (['bash', 'shell', 'terminal', 'exec', 'exec_command', 'command', 'run', 'run_command'].includes(name)) return 'bash';
  return name;
}

function normalizeExclusiveToolInput(value) {
  if (!value || !['exact-command', 'exact-path', 'focused-claim-search', 'route-probe', 'status-probe'].includes(value.kind)) return null;
  const status = value.status === 'ambiguous' ? 'ambiguous' : 'bound';
  const digest = /^[a-f0-9]{64}$/.test(String(value.digest ?? '')) ? String(value.digest) : '';
  if (status === 'bound' && !digest) return null;
  const target = value.kind === 'exact-path'
    && typeof value.target === 'string'
    && /^(?:[a-z0-9_.-]+\/)*[a-z0-9_.-]+\.[a-z0-9_.-]+$/i.test(value.target)
    ? value.target
    : '';
  if (status === 'bound' && value.kind === 'exact-path' && !target) return null;
  return {
    kind: value.kind,
    status,
    ...(digest ? { digest } : {}),
    ...(target ? { target } : {}),
  };
}

export function writingDirectivePromptForSignals(prompt = '') {
  const source = activateExplicitQuotedInstruction(maskMetaQuotedInstructionPayload(String(prompt)));
  const withoutQuotedPayload = maskQuotedWritingPayload(source);
  const normalized = normalizeEnglishApostrophes(withoutQuotedPayload);
  if (isVisualEditingDirective(normalized)) return normalized;
  const withoutRelationalPayload = maskRelationalWritingPayload(normalized);
  const withoutColonPayload = maskColonWritingPayload(withoutRelationalPayload);
  return maskEmbeddedWritingAuthority(withoutColonPayload);
}

function activateExplicitQuotedInstruction(value = '') {
  return String(value)
    .replace(/(?:^|(?<=[.!?。！？]\s))(?:(?:please)\s+)?follow\s+(?:this|the\s+following)\s+instruction\s+exactly\s*:\s*(?:"([^"\n]+)"|“([^”\n]+)”|`([^`\n]+)`)/giu, (_match, straight, curly, tick) => ` ${straight ?? curly ?? tick ?? ''} `)
    .replace(/(?:^|(?<=[。！？]\s))请?\s*(?:严格)?(?:按照|遵循|执行)\s*(?:这条|以下|下面)?\s*(?:指令|要求)\s*[:：]\s*(?:“([^”\n]+)”|`([^`\n]+)`)/gu, (_match, curly, tick) => ` ${curly ?? tick ?? ''} `);
}

function maskMetaQuotedInstructionPayload(value = '') {
  const source = String(value);
  const maskedPayloads = source
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/gu, ' __quoted_instruction_example__ ')
    .replace(/^[\t ]*>[^\n]*(?:\n|$)/gmu, ' __quoted_instruction_example__ ')
    .replace(/"[^"\n]*"|“[^”\n]*”|'[^'\n]*'|‘[^’\n]*’|`[^`\n]*`/gu, ' __quoted_instruction_example__ ');
  const metaRequest = /^\s*(?:(?:please|can\s+you|could\s+you)\s+)?(?:explain|analy[sz]e|discuss|compare|assess|review)\b[^\n]{0,96}\b(?:sentence|instruction|phrase|prompt|wording|example|text)\b/i.test(source)
    || /^\s*(?:请)?(?:解释|分析|讨论|比较|评估|审查).{0,48}(?:句子|指令|提示词|短语|措辞|示例|文本)/u.test(source);
  const explicitlyUntrusted = /\b(?:untrusted|non[- ]authoritative)\s+(?:(?:quoted|fenced|blockquoted?)\s+)?(?:data|instruction|prompt|text|sentence|example|block)\b/i.test(maskedPayloads)
    || /\bdo\s+not\s+(?:execute|follow|obey|act\s+on)\b[^.!?\n]{0,48}\b(?:(?:quoted|fenced|blockquoted?)\s+)?(?:instruction|prompt|text|data)\b/i.test(maskedPayloads)
    || /(?:不可信|非权威).{0,12}(?:引用|引述|代码块|块引用|指令|提示词|文本|数据)|不要.{0,12}(?:执行|遵循).{0,12}(?:引用|引述|代码块|块引用|指令|提示词)/u.test(maskedPayloads);
  if (!metaRequest && !explicitlyUntrusted) return source;
  return maskedPayloads;
}

export function writingOperationalPromptForSignals(prompt = '') {
  const source = String(prompt);
  if (isVisualEditingDirective(source)) return source;
  if (!isWritingTransformationDirective(source)) return source;
  let neutralized = source;
  const neutralizeTarget = (match, inner) => {
    if (!isStructuredWritingTargetReference(inner)) return match;
    return ` ${neutralizeStructuredWritingFileReference(inner)} `;
  };
  const operational = neutralizeUnquotedStructuredWritingFileReferences(neutralized
    .replace(/“([^”\n]{1,4000})”/g, neutralizeTarget)
    .replace(/‘([^’\n]{1,4000})’/g, neutralizeTarget)
    .replace(/"((?:\\.|[^"\\\n]){1,4000})"/g, neutralizeTarget)
    .replace(/`([^`\n]{1,4000})`/g, neutralizeTarget)
    .replace(/'((?:\\.|[^'\\\n]){1,4000})'/g, neutralizeTarget));
  const technicalVerification = /(?:重新)?编译|链接检查|\b(?:compile|rebuild|link check)\b/i.test(source);
  return technicalVerification ? operational : `${operational} __writing_content__ wording`;
}

function maskQuotedWritingPayload(source = '') {
  const maskProse = (match, inner, offset) => (
    isStructuredWritingTargetReference(inner) && !isAfterWritingPayloadColon(source, offset)
      ? match
      : ' __payload__ '
  );
  const masked = String(source)
    .replace(/“([^”\n]{1,4000})”/g, maskProse)
    .replace(/‘([^’\n]{1,4000})’/g, maskProse)
    .replace(/"((?:\\.|[^"\\\n]){1,4000})"/g, maskProse)
    .replace(/`([^`\n]{1,4000})`/g, maskProse)
    .replace(/'((?:\\.|[^'\\\n]){1,4000})'/g, maskProse);
  return masked !== source && isWritingTransformationDirective(masked) ? masked : source;
}

function maskRelationalWritingPayload(source = '') {
  const value = String(source).replace(/改(?:成|为)(?=\s*(?:提醒|说明|告诉|写明|注明|声称|建议|要求))/gu, '改写成');
  if (!isWritingTransformationDirective(value)) return value;
  const boundaries = [];
  const addBoundary = (pattern, adjustment = 0) => {
    const match = pattern.exec(value);
    if (match) boundaries.push((match.index ?? 0) + adjustment);
  };
  addBoundary(/\bso(?:\s+that)?\s+(?:(?:it|this|the\s+(?:copy|text|wording|document|file))\s+)?(?:says?|tells?|mentions?|explains?|states?|notes?|reminds?|warns?)\b/i);
  addBoundary(/\bto\s+(?:say|tell|mention|explain|state|note|remind|warn)\b/i);
  addBoundary(/\b(?:with|using)\s+(?:copy|wording|text|content)\s+that\b/i);
  const chineseResult = /(?:改写|修改|改|写|整理)(?:成|为)(?=\s*(?:提醒|说明|告诉|写明|注明|声称|建议|要求))/u.exec(value);
  if (chineseResult) boundaries.push((chineseResult.index ?? 0) + chineseResult[0].length - 1);
  addBoundary(/[，,]\s*(?:让|使)(?:这份|该|其|文案|文本|内容|说明|文档)?[^，,。；;.!！\n]{0,12}(?:提醒|说明|告诉|写明|注明|声称|建议|要求)/u);
  addBoundary(/[，,]\s*(?:(?:用于|以便|来)\s*)?(?:说明|解释|描述|写明|注明|告诉)(?:为什么|为何)?/u);
  const boundary = boundaries.sort((left, right) => left - right)
    .find((index) => containsAuthorityBearingWritingPayload(value.slice(index)));
  if (!Number.isInteger(boundary)) return value;
  const end = independentWritingContinuationBoundary(value, boundary);
  return `${value.slice(0, boundary).trimEnd()} __payload__${value.slice(end)}`;
}

function containsAuthorityBearingWritingPayload(value = '') {
  return /(?:测试|发布|提交|推送|部署|上线|联网|网络|子代理|代理|安全|漏洞|插件|代码|路由|门禁|工作流|安装)|\b(?:tests?|testing|publish|release|commit|push|deploy|network|internet|web|subagents?|agents?|security|vulnerabilit(?:y|ies)|plugins?|code|router|routing|gates?|workflows?|install)\b/i.test(String(value));
}

function independentWritingContinuationBoundary(value = '', start = 0) {
  const tail = String(value).slice(start);
  const continuation = /[，,。！？.!?；;](?=\s*(?:(?:then|next|separately|finally|after\s+that|also)\b\s*,?\s*|(?:然后(?:单独)?|接着|随后|另外|最后|再|单独)(?:请)?))/iu.exec(tail);
  return continuation ? start + (continuation.index ?? 0) : String(value).length;
}

function maskEmbeddedWritingAuthority(source = '') {
  const value = String(source);
  if (!isWritingTransformationDirective(value)) return value;
  const protectedValues = [];
  const protect = (text) => {
    const marker = `__protected_writing_${protectedValues.length}__`;
    protectedValues.push(String(text));
    return marker;
  };
  const englishAction = '(?:(?:actually\\s+)?(?:run|execute|rerun)\\b[^.!?;\\n]{0,24}\\b(?:tests?|testing)\\b|(?:push|publish|deploy|release|commit)\\b|(?:access|browse|search|use)\\b[^.!?;\\n]{0,24}\\b(?:network|internet|web)\\b|(?:use|spawn|fork|call|delegate\\s+to)\\b[^.!?;\\n]{0,24}\\b(?:subagents?|sub-agents?|agents?)\\b|(?:audit|scan|inspect|review|check)\\b[^!?;\\n]{0,96}\\b(?:security|vulnerabilit(?:y|ies)|auth|permissions?|bypass|injection|secrets?|code)\\b|(?:fix|modify|implement)\\b[^!?;\\n]{0,64}(?:(?:src|lib|app|packages|plugins)/|\\bcode\\b))';
  const chineseAction = '(?:(?:实际)?(?:运行|执行|跑|重跑)[^。！？；;\\n]{0,20}(?:测试|npm\\s+test)|(?:提交|推送|发布|部署|上线)|(?:访问|浏览|搜索|使用|连接)[^。！？；;\\n]{0,20}(?:网络|互联网|网页|外网)|(?:使用|调用|创建|派生|委派给)[^。！？；;\\n]{0,20}(?:子代理|子\\s*agent|代理)|(?:审计|扫描|检查|审查)[^。！？；;\\n]{0,64}(?:安全|漏洞|鉴权|权限|越权|注入|密钥|代码)|(?:修复|修改|实现)[^。！？；;\\n]{0,48}(?:(?:src|lib|app|packages|plugins)/|代码))';
  let protectedSource = value;
  const protectCapturedAction = (pattern) => {
    protectedSource = protectedSource.replace(pattern, (match, prefix, action) => `${prefix}${protect(action)}`);
  };
  protectCapturedAction(new RegExp(`(^|[.!?;,]\\s*(?:(?:then|next|separately|finally|after\\s+that|also)\\b\\s*,?\\s*)?)(${englishAction}[^.!?;\\n]*)`, 'gim'));
  protectCapturedAction(new RegExp(`(^|[。！？；;，,]\\s*(?:(?:然后(?:单独)?|接着|随后|另外|最后|再|单独)(?:请)?\\s*)?)(${chineseAction}[^。！？；;\\n]*)`, 'gmu'));
  protectCapturedAction(new RegExp(`((?:readme(?:\\.md)?|(?:\\/?[\\p{L}\\p{N}_.-]+/)*[\\p{L}\\p{N}_.-]+\\.(?:md|mdx|rst|txt|tex|docx?|pdf)|document|file|wording|sentence|paragraph|copy|text)\\s*(?:,\\s*(?:(?:and|then)\\s+)?|\\s+(?:and|then)\\s+))(${englishAction}[^.!?;\\n]*)`, 'gimu'));
  protectCapturedAction(new RegExp(`((?:(?:\\/?[\\p{L}\\p{N}_.-]+/)*[\\p{L}\\p{N}_.-]+\\.(?:md|mdx|rst|txt|tex|docx?|pdf)|文档|文件|措辞|句子|段落|文案|文字)\\s*(?:[，,]\\s*(?:(?:并且|并|然后|再)\\s*)?|\\s*(?:并且|并|然后|再)\\s*))(${chineseAction}[^。！？；;\\n]*)`, 'gmu'));
  protectCapturedAction(/(^|[.!?;,]\s*(?:(?:but|then|next|separately|finally|also)\s+)?)(?:((?:do not|don't|without|no need to)[^.!?;\n]{0,160}))/gim);
  protectCapturedAction(/(^|[。！？；;，,、]\s*(?:(?:但|然后|接着|随后|另外|最后|再)\s*)?)(?:((?:不要|别|无需|不用|禁止|不得|不\s*(?:要|做|进行|触发)?)[^。！？；;、\n]{0,160}))/gmu);
  protectedSource = protectedSource.replace(/((?:润色|改写|修改|更新|校对|修订|编辑)[^。！？；;\n]{0,96}?)(\s*[，,]?\s*(?:并且|并|然后)\s*(?:把(?:这些?|上述)?(?:改动|修改|变更)\s*)?)((?:发布|提交|推送|部署|上线)[^。！？；;\n]*)/gu, (match, directive, coordinator, action) => (
    /(?:改写|修改|编辑)?成|(?:让|使)|关于|以(?:便|用于)?\s*(?:描述|说明)|(?:提醒|要求|告诉).{0,32}$/u.test(directive)
      ? match
      : `${directive}${coordinator}${protect(action)}`
  ));
  protectedSource = protectedSource.replace(/((?:translate|polish|proofread|rewrite|revise|edit|update|improve)\b[^!?;\n]{0,128}?)(\s+(?:and|then)\s+)((?:push|publish|deploy|release|commit)\b[^.!?;\n]*)/giu, (match, directive, coordinator, action) => (
    /\b(?:so|about)\b|\bto\s+(?:say|tell|mention|explain|state|note|remind|warn|instruct|document|describe|recommend)\b|\bwith\s+(?:instructions?|copy|wording|text|content)\b/iu.test(directive)
      ? match
      : `${directive}${coordinator}${protect(action)}`
  ));
  protectedSource = protectedSource.replace(new RegExp(`((?:translate|polish|proofread|rewrite|revise|edit|update|improve)\\b[^!?;\\n]{0,160}?)(\\s+(?:and|then)\\s+(?:(?:separately|also)\\s+)?)(${englishAction}[^.!?;\\n]*)`, 'giu'), (match, directive, coordinator, action) => (
    /\b(?:so|about)\b|\bto\s+(?:say|tell|mention|explain|state|note|remind|warn|instruct|document|describe|recommend)\b|\bwith\s+(?:instructions?|copy|wording|text|content)\b/iu.test(directive)
      ? match
      : `${directive}${coordinator}${protect(action)}`
  ));
  protectedSource = protectQuotedStructuredWritingReferences(protectedSource, protect);
  protectedSource = protectStructuredWritingReferences(protectedSource, protect);
  protectedSource = protectedSource.replace(/(?:安全(?:政策|策略|公告|说明|文案|通知|草案|措辞)|插件\s*(?:readme|文档|说明)|发布(?:说明|公告)|测试(?:覆盖率)?报告|安装说明)|\b(?:security\s+(?:policy|announcement|notice|advisory|draft|wording)|plugin\s+(?:readme|documentation|docs?)|release\s+notes?|test(?:\s+coverage)?\s+report|coverage\s+report|installation\s+(?:guide|instructions?))\b/giu, (match) => protect(match));
  const sanitized = protectedSource
    .replace(/\b(?:npm\s+test|tests?|testing|publish|release|push|deploy|commit|network|internet|web|subagents?|sub-agents?|security|vulnerabilit(?:y|ies)|auth(?:entication|orization)?|permissions?|bypass|injection|secrets?|plugins?|code|router|routing|gates?|workflows?|install)\b/giu, ' __embedded_content__ ')
    .replace(/(?:测试|发布|提交|推送|部署|上线|联网|网络|互联网|网页|子代理|安全|审计|扫描|审查|漏洞|鉴权|认证|权限|越权|注入|密钥|插件|代码|路由|门禁|工作流|安装)/gu, ' __embedded_content__ ');
  let restored = sanitized;
  for (let index = protectedValues.length - 1; index >= 0; index -= 1) {
    restored = restored.split(`__protected_writing_${index}__`).join(protectedValues[index]);
  }
  return restored;
}

function normalizeEnglishApostrophes(value = '') {
  return String(value).replace(/[\u2018\u2019\u02bc\uff07]/gu, "'");
}

function protectStructuredWritingReferences(value, protect) {
  return String(value).replace(/(^|[^\p{L}\p{N}_.-])((?:\/?[\p{L}\p{N}_.-]+\/)*[\p{L}\p{N}_.-]+\.(?:md|mdx|rst|txt|tex|docx?|pdf|js|mjs|cjs|ts|tsx|jsx|py|go|rs|java|kt|swift|cs|cpp|c|h|hpp|rb|php|sh|sql|yml|yaml|json|jsonc|toml|ini|cfg|xml|html|css|scss|less|vue|svelte))(?=$|[^\p{L}\p{N}_-]|[中里内的])/giu, (match, boundary, target) => `${boundary}${protect(target)}`);
}

function protectQuotedStructuredWritingReferences(value, protect) {
  const protectTarget = (match, inner) => (isStructuredWritingTargetReference(inner) ? protect(match) : match);
  return String(value)
    .replace(/“([^”\n]{1,4000})”/g, protectTarget)
    .replace(/‘([^’\n]{1,4000})’/g, protectTarget)
    .replace(/"((?:\\.|[^"\\\n]){1,4000})"/g, protectTarget)
    .replace(/`([^`\n]{1,4000})`/g, protectTarget)
    .replace(/'((?:\\.|[^'\\\n]){1,4000})'/g, protectTarget);
}

function neutralizeUnquotedStructuredWritingFileReferences(value = '') {
  return String(value).replace(/(^|[^\p{L}\p{N}_.-])((?:\/?[\p{L}\p{N}_.-]+\/)*[\p{L}\p{N}_.-]+\.(?:md|mdx|rst|txt|tex|docx?|pdf|js|mjs|cjs|ts|tsx|jsx|py|go|rs|java|kt|swift|cs|cpp|c|h|hpp|rb|php|sh|sql|yml|yaml|json|jsonc|toml|ini|cfg|xml|html|css|scss|less|vue|svelte))(?=$|[^\p{L}\p{N}_-]|[中里内的])/giu, (match, boundary, target) => `${boundary}${neutralizeStructuredWritingFileReference(target)}`);
}

function neutralizeStructuredWritingFileReference(value = '') {
  const target = String(value).trim();
  const attachedDirective = target.match(/^((?:(?:请|帮我|麻烦)\s*)?(?:把\s*)?(?:润色|改写|修改|编辑|校对|修订|更新|改善|优化)(?:一下|下)?)(.+\.(?:md|mdx|rst|txt|tex|docx?|pdf|js|mjs|cjs|ts|tsx|jsx|py|go|rs|java|json|yml|yaml|toml))$/iu);
  if (attachedDirective && isStructuredWritingTargetReference(attachedDirective[2])) {
    return `${attachedDirective[1]}${neutralizeStructuredWritingFileReference(attachedDirective[2])}`;
  }
  const slash = target.lastIndexOf('/');
  const prefix = slash >= 0 ? target.slice(0, slash + 1) : '';
  const basename = slash >= 0 ? target.slice(slash + 1) : target;
  const extension = basename.match(/\.[a-z0-9]{1,12}$/i)?.[0] ?? '';
  return `${prefix}__target__${extension}`;
}

function isAfterWritingPayloadColon(source = '', offset = 0) {
  const value = String(source);
  for (let index = 0; index < offset; index += 1) {
    if (value[index] !== ':' && value[index] !== '：') continue;
    if (value[index] === ':' && isPathOrUrlColon(value, index)) continue;
    if (isWritingTransformationDirective(value.slice(0, index))) return true;
  }
  return false;
}

function isStructuredWritingTargetReference(value = '') {
  const text = String(value).trim();
  if (/^(?:readme|makefile|dockerfile|license)(?:\.[a-z0-9]{1,12})?$/i.test(text)) return true;
  const knownFileExtension = /\.(?:md|mdx|rst|txt|tex|docx?|pdf|js|mjs|cjs|ts|tsx|jsx|py|go|rs|java|kt|swift|cs|cpp|c|h|hpp|rb|php|sh|sql|yml|yaml|json|jsonc|toml|ini|cfg|xml|html|css|scss|less|vue|svelte)$/i;
  if (knownFileExtension.test(text) && !/[\u0000-\u001f\u007f"'`<>|]/.test(text)) return true;
  return false;
}

function maskColonWritingPayload(source = '') {
  const value = String(source);
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== ':' && value[index] !== '：') continue;
    if (value[index] === ':' && isPathOrUrlColon(value, index)) continue;
    const directive = value.slice(0, index);
    if (isWritingTransformationDirective(directive)) {
      if (value.slice(index + 1).includes('__payload__')) return value;
      const payload = value.slice(index + 1).trim().replace(/[。.!！]+$/u, '').trim();
      if (isStructuredWritingTargetReference(payload)) return value;
      const end = independentWritingContinuationBoundary(value, index + 1);
      return `${directive} __payload__${value.slice(end)}`;
    }
  }
  return value;
}

function isPathOrUrlColon(value, index) {
  const before = value[index - 1] ?? '';
  const after = value[index + 1] ?? '';
  return /[a-z]/i.test(before) && /[\\/]/.test(after)
    || after === '/' && value[index + 2] === '/';
}

function isVisualEditingDirective(value = '') {
  const text = String(value).toLowerCase();
  const proseTarget = /(?:文案|文字|文本|措辞|句子|段落|标题|标签|说明)|\b(?:copy|wording|text|sentence|paragraph|title|label|caption|prose)\b/.test(text);
  if (proseTarget) return false;
  const action = /(?:美化|优化|调整|修改|编辑|改善|润色)|\b(?:polish|edit|improve|refine|style|beautify|adjust|update|modify)\b/.test(text);
  const visualTarget = /(?:视觉|界面|页面|看板|组件|布局|色彩|颜色|样式|间距|响应式)|\b(?:visuals?|visually|dashboard|landing\s+page|react\s+component|ui|layout|spacing|typography|colou?rs?|responsive|hover\s+states?)\b/.test(text);
  return action && visualTarget;
}

function isFunctionalUiConstructionDirective(value = '') {
  const text = String(value).toLowerCase().trim();
  const construction = /^(?:(?:please|can\s+you|could\s+you|would\s+you)\s+)?(?:create|build|implement|write)\b.{0,96}\b(?:dashboard|landing\s+page|page|ui\s+component|react\s+component)\b/.test(text)
    || /^(?:(?:请|帮我|麻烦)\s*)?(?:写|创建|新建|构建|实现|开发|搭建)\s*(?:一个|一套|个)?[^。！？.!?\n]{0,64}(?:页面|看板|界面|ui\s*组件|react\s*组件)/.test(text);
  if (!construction) return false;
  return !/(?:设计|美化|漂亮|精美|视觉层次|视觉设计|配色|色彩|排版|间距|响应式|动效)|\b(?:design|aesthetic|polished|beautiful|beautify|visual\s+design|visual\s+hierarchy|color\s+palette|spacing|typography|responsive|hover\s+states?|animation)\b/.test(text);
}

function isWritingTransformationDirective(value = '') {
  const original = String(value).toLowerCase();
  if (/(?:测试用例|测试代码).{0,24}(?:写成|写入|生成|新增|添加).{0,16}(?:测试)?文件|(?:写成|写入|生成|新增|添加).{0,24}(?:测试用例|测试代码|测试文件)|\b(?:write|generate|add|create)\b.{0,48}\b(?:tests?|test cases?|test code|test files?)\b/i.test(original)) return false;
  const text = original
    .replace(/(?:do not|don't|without|no need to)[^.;!\n]{0,80}(?:write|edit|revise|polish|rewrite|draft|improve)[^.;!\n]*/gi, ' ')
    .replace(/(?:不要|别|无需|不用|禁止|不得|不\s*(?:要|做|进行)?)[^。；;！!\n]{0,80}(?:写|编辑|修改|润色|改写|校对|修订|起草|改善|优化)[^。；;！!\n]*/g, ' ');
  return /(?:翻译|润色|改写|校对|修订|写成|整理成)/.test(text)
    || /\b(?:translate|polish|proofread|rewrite)\b/.test(text)
    || /\b(?:edit|revise|update|improve)\b[^。！？.!?\n]{0,64}(?:readme|(?:\/?[\p{L}\p{N}_.-]+\/)*[\p{L}\p{N}_.-]+\.(?:md|mdx|rst|txt|tex|docx?|pdf))\b/iu.test(text)
    || /(?:修改|编辑|更新|改善|优化)[^。！？.!?\n]{0,64}(?:readme|(?:\/?[\p{L}\p{N}_.-]+\/)*[\p{L}\p{N}_.-]+\.(?:md|mdx|rst|txt|tex|docx?|pdf))/u.test(text)
    || /(?:把|请把)\s*(?:\/?[\p{L}\p{N}_.-]+\/)*[\p{L}\p{N}_.-]+\.(?:md|mdx|rst|txt|tex|docx?|pdf)[^。！？.!?\n]{0,32}(?:润色|改写|修改|改为|改成|校对|修订|编辑|改善|优化)/u.test(text)
    || /(?:修改|编辑|写|撰写|起草|改善|优化).{0,48}(?:句子|段落|文字|文案|措辞|标题|摘要|邮件|说明|正文)/.test(text)
    || /\b(?:edit|revise|write|draft|improve)\b.{0,48}\b(?:sentence|paragraph|text|wording|copy|title|abstract|email|prose)\b/.test(text);
}

function languageFor(prompt) {
  const value = String(prompt ?? '');
  if (/[一-鿿]/.test(value)) return 'zh';
  if (/[A-Za-z]/.test(value)) return 'en';
  return 'unknown';
}

export function resolveWritingTargetLanguage(prompt, fallback = 'unknown') {
  const clauses = positiveWritingLanguageClauses(prompt);
  const explicitEnglishTranslation = clauses.some((text) => (
    /(?:翻译|译)(?:成|为)\s*(?:英文|英语|english)/.test(text)
    || /\btranslate\b[^。！？.!?\n]{0,96}\b(?:into|to)\s+english\b/.test(text)
  ));
  const explicitChineseTranslation = clauses.some((text) => (
    /(?:翻译|译)(?:成|为)\s*(?:中文|汉语|chinese)/.test(text)
    || /\btranslate\b[^。！？.!?\n]{0,96}\b(?:into|to)\s+chinese\b/.test(text)
  ));
  if (explicitEnglishTranslation !== explicitChineseTranslation) {
    return explicitEnglishTranslation ? 'en' : 'zh';
  }
  const englishTarget = clauses.some((text) => (
    /(?:翻译成|改成|写成|整理成).{0,12}(?:英文|英语|english)/.test(text)
    || /(?:润色|改写|修订|修改).{0,48}(?:英文|英语|english)\s*(?:句子|sentence|标题|title|段落|paragraph|摘要|abstract|邮件|email|简历|resume|bullet|文案|copy|正文|prose|commit message|conventional commit|changelog|release notes|bug report|linkedin post|post)/.test(text)
    || /(?:英文|英语|english)\s*(?:句子|sentence|标题|title|段落|paragraph|摘要|abstract|邮件|email|简历|resume|bullet|文案|copy|正文|prose|commit message|conventional commit|changelog|release notes|bug report|linkedin post|post)/.test(text)
    || /(?:句子|sentence|标题|title|段落|paragraph|摘要|abstract|邮件|email|简历|resume|bullet|文案|copy|正文|prose|commit message|conventional commit|changelog|release notes|bug report|linkedin post|post)\s+(?:in|into|as)\s+(?:英文|英语|english)/.test(text)
  ));
  if (englishTarget) return 'en';
  const chineseTarget = clauses.some((text) => (
    /(?:翻译成|改成|写成|整理成).{0,12}(?:中文|汉语|chinese)/.test(text)
    || /(?:润色|改写|修订|修改).{0,48}(?:中文|汉语|chinese)\s*(?:句子|sentence|标题|title|段落|paragraph|摘要|abstract|邮件|email|简历|resume|bullet|文案|正文|commit message|conventional commit|changelog|release notes|bug report|linkedin post|post)/.test(text)
    || /(?:中文|汉语|chinese)\s*(?:句子|sentence|标题|title|段落|paragraph|摘要|abstract|邮件|email|简历|resume|bullet|文案|正文|commit message|conventional commit|changelog|release notes|bug report|linkedin post|post)/.test(text)
    || /(?:句子|sentence|标题|title|段落|paragraph|摘要|abstract|邮件|email|简历|resume|bullet|文案|正文|commit message|conventional commit|changelog|release notes|bug report|linkedin post|post)\s+(?:in|into|as)\s+(?:中文|汉语|chinese)/.test(text)
  ));
  return chineseTarget ? 'zh' : fallback;
}

function positiveWritingLanguageClauses(prompt = '') {
  return String(prompt).toLowerCase().split(/[，,。！？；;.!?\n]+|\bbut\b|\band(?=\s+(?:do not|don't|never))|\s+(?=(?:do not|don't|never|without)\b)|但|并且(?=\s*(?:不要|别|禁止|不得|不\s*(?:改|修改|润色|翻译|写)))|(?=(?:不要|别|禁止|不得|无需|不用|不\s*(?:改|修改|润色|翻译|写)))/u)
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => !/(?:不要|别|禁止|不得|无需|不用|不\s*(?:改|修改|润色|翻译|写)|do not|don't|never|without)/i.test(value));
}

function clamp(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}
