import {
  analyzeExternalActionContracts,
  analyzeExternalActionPrompt,
  normalizeExternalActionContract,
} from './external-action-policy.js';

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
const TEST_EXCLUSION_ORDER = ['unit', 'integration', 'e2e', 'smoke'];
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
  const text = prompt.toLowerCase();
  const language = languageFor(prompt);
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
      language,
      provenance: {
        ruleConfidence: 0.99,
        reasons: ['completed gate status report'],
        requiresPolicyRoute: false,
        needsClassifier: false,
      },
    });
  }
  const signals = collectSignals(text, prompt);
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

  if (normalized === 'testing') {
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
  const normalizedDomains = (value.domains?.length ? value.domains : ['general'])
    .filter((domain) => DOMAIN_VALUES.has(domain));
  const domains = orderedUnique(normalizedDomains.length ? normalizedDomains : ['general'], DOMAIN_ORDER);
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

function collectSignals(text, prompt) {
  const externalActionContract = analyzeExternalActionPrompt(prompt);
  const externalActionContracts = analyzeExternalActionContracts(prompt);
  const externalActionRequested = ['complete', 'incomplete', 'conflicting'].includes(externalActionContract?.state);
  const workspaceScopes = workspaceWriteScopesFor(prompt);
  const externalScopes = externalWriteScopesFor(prompt);
  const workspaceConstraintText = maskScopedWorkspaceWriteNegatives(normalizeAffirmativeWorkspacePhrases(text));
  const testConstraintText = maskAffirmativeTestPhrases(text);
  const testAllowlist = testAllowlistFor(testConstraintText);
  const testExclusions = testExclusionsFor(testConstraintText);
  const testExecutionTargets = testExecutionTargetsFor(prompt);
  const globalTestConstraintText = maskSelectiveTestExclusions(testConstraintText);
  const networkConstraintText = maskAffirmativeNetworkPhrases(text);
  const externalConstraintText = maskScopedExternalWriteNegatives(normalizeAffirmativeExternalWritePhrases(text));
  const subagentConstraintText = normalizeAffirmativeSubagentPhrases(text);
  const documentTargetWithCodeExclusion = workspaceScopes.targets.some((target) => /(?:^|\/)(?:readme(?:\.[a-z0-9]+)?|[^/]+\.(?:md|mdx|rst|txt|tex|docx?))$/i.test(target))
    && /(?:不要|不|别|不得|禁止)\s*(?:修改|改动|编辑|更新|写入|触碰)\s*(?:代码|源代码)|\b(?:do not|don't|never)\s+(?:modify|edit|change|update|write(?:\s+to)?|touch)\s+(?:the\s+)?(?:code|source code)\b/i.test(workspaceConstraintText);
  const noWorkspaceWrite = !documentTargetWithCodeExclusion
    && /(?:不要|不|别|无需|不用)[^，。；、：;,:.!\n]{0,16}(?:修改|改动|改|编辑|写入|修复|实现)(?:[^，。；、：;,:.!\n]{0,8}(?:代码|文件|实现|它))?|(?:只读|只检查|只分析|只报告|仅报告)|\bread[- ]?only\b|(?:do not|don't|without|no need to)[^,.;!\n]{0,24}(?:modify|edit|change|write|fix|implement)|(?:report|findings?)\s+only/.test(workspaceConstraintText);
  const noActionExecution = /(?:不要|不|别|无需|不用)\s*(?:实际)?(?:执行|运行)(?!\s*(?:测试|tests?))\s*(?:(?:任何|这个|该|上述)\s*)?(?:操作|命令|动作|内容)?\s*(?:[，。；;,.!！]|$)|(?:do not|don't|without|no need to)\s+(?:actually\s+)?(?:execute|run|perform|do)(?!\s+tests?)(?:\s+(?:it|anything|the\s+(?:command|action|operation)))?\s*(?:[,.;!]|$)|without\s+(?:actually\s+)?doing\s+it/.test(text);
  const instructionalAdvice = /(?:请)?(?:告诉|解释|说明)(?:我)?.{0,16}(?:如何|怎么)|(?:如何|怎么).{0,12}(?:做|操作|执行|删除|推送)|\bhow\s+(?:do|can|should|would)\s+i\b|\bexplain\s+how\s+to\b/.test(text);
  const advisory = /有什么.{0,30}(?:优化|改进).{0,12}(?:地方|建议)|(?:可以|可).{0,12}(?:优化|改进)|(?:优化|改进)建议|给出.{0,12}(?:优化|改进)建议|suggest\s+(?:improvements?|optimizations?)|assess\s+whether.{0,30}(?:reasonable|sound)/.test(text);
  const noTestExecution = /(?:不要|不|别|无需|不用)[^，。；;,.!\n]{0,16}(?:运行|执行|跑|重跑)[^，。；;,.!\n]{0,12}(?:测试|test)|(?:测试|test)[^，。；;,.!\n]{0,16}(?:不要|不|别)[^，。；;,.!\n]{0,8}(?:运行|执行)|(?:do not|don't|without)[^,.;!\n]{0,18}(?:run|execute|rerun)[^,.;!\n]{0,12}(?:tests?|testing)|(?:command|命令).{0,24}(?:不要|不|别|do not|don't).{0,8}(?:执行|运行|execute|run)/.test(globalTestConstraintText)
    || hasNaturalNoTestExecution(globalTestConstraintText)
    || englishNegativeClauseIncludes(globalTestConstraintText, /\b(?:(?:run|execute|rerun|do)\s+)?(?:the\s+)?(?:tests?|testing)\b/i);
  const noExternalWrite = hasExplicitNoExternalWrite(externalConstraintText)
    || englishNegativeClauseIncludes(externalConstraintText, /\b(?:push|publish|release|deploy)\b/i);
  const noNetworkAccess = /(?:只|仅).{0,12}(?:本地|离线)|(?:local|offline)\s+only/.test(networkConstraintText)
    || hasNaturalNoNetworkAccess(networkConstraintText)
    || englishNegativeClauseIncludes(networkConstraintText, /\b(?:(?:use|access|browse|search)\s+(?:the\s+)?(?:web|internet|network|online(?:\s+sources?)?)|go\s+online)\b/i);
  const noSubagents = /(?:不要|不|别|无需|不用).{0,18}(?:子代理|子 agent|subagent|sub-agent)|(?:只由|仅由).{0,12}(?:主代理|主 agent|main agent)|(?:do not|don't|without|no).{0,18}(?:subagents?|sub-agents?)|(?:main agent only|only the main agent)/.test(subagentConstraintText)
    || englishNegativeClauseIncludes(subagentConstraintText, /\b(?:use\s+)?(?:subagents?|sub-agents?)\b/i);
  const releaseArtifact = /(?:release notes?|changelog|发布公告|发布说明|release announcement|release report)/.test(text);
  const dependencyUpgrade = /(?:升级|更新).{0,18}(?:npm|依赖|dependencies?|packages?)|\b(?:upgrade|update).{0,18}(?:dependencies?|packages?)\b/.test(text);
  const localReleaseCache = /(?:发布缓存|release cache)/.test(text);
  const releaseConcept = /(?:release|发布).{0,12}(?:是什么|含义|概念)|(?:what is|explain).{0,18}(?:a\s+)?release\b/.test(text);
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
    && /(?:推送|发布|部署|上线|升级.{0,8}(?:插件|marketplace))|\b(?:push|publish|deploy|release)\b|\bupgrade\s+\S+@\S+/.test(text);
  const factWork = /(?:事实核查|事实审查|查证|核验事实|引用核验|引用真实性)|(?:核查|检查|核验).{0,24}(?:事实|声明|主张|引用)|\bfact[- ]?check\b|(?:verify|check)\s+(?:the\s+)?(?:facts?|claims?)/.test(text);
  const writingWork = /(?:润色|改写|写作|撰写|起草|中文表述|英文表述|文案|措辞|readme|安装说明)|\b(?:polish|proofread|rewrite|prose|wording|readme)\b/.test(text)
    || /(?:写|撰写|起草).{0,24}(?:报告|提案|论文|摘要|说明|文档)/.test(text)
    || /\b(?:draft|write|revise|edit)\b.{0,36}\b(?:proposal|report|paper|manuscript|abstract|paragraph|section|letter|email|memo|announcement|documentation|docs?)\b/.test(text);
  const securityWork = /(?:安全|漏洞|鉴权|认证|权限|越权|注入|密钥)|\b(?:security|vulnerabilit(?:y|ies)|auth(?:entication|orization)?|permissions?|privilege|xss|ssrf|injection|secrets?)\b/.test(text);
  const testWork = /(?:测试|回归测试|单元测试|覆盖率)|\b(?:tests?|testing|regression|coverage|vitest|pytest|npm test)\b/.test(text);
  const noTestAuthoring = /(?:不要|不|别|无需|不用).{0,16}(?:生成|编写|新增|添加|写).{0,12}(?:测试代码|测试文件|测试用例|tests?|test code)|(?:do not|don't|without).{0,20}(?:generate|write|add|create).{0,16}(?:tests?|test code)/.test(text);
  const broadBugAudit = (
    /(?:检查|审查|审计|排查).{0,24}(?:(?:整个|全|全部|所有).{0,8})?(?:项目|代码库|代码).{0,20}(?:(?:所有|全部|全面).{0,8})?(?:bugs?|缺陷)/.test(text)
    || /\b(?:audit|inspect|review|check|find|hunt)\b.{0,36}\b(?:the\s+)?(?:whole|entire|full|all)\s+(?:project|codebase|repository|repo|code)\b.{0,36}\b(?:bugs?|defects?)\b/.test(text)
  );
  const explicitTestTargetExecution = /(?:只|仅)?\s*(?:运行|执行|跑|重跑)\s+(?:node\s+--test\s+)?[`'"]?[^\s，。；;!！]+(?:\.test|\.spec)\.(?:[cm]?[jt]sx?|py|go|rs|java)\b/i.test(text)
    || /\b(?:only\s+)?(?:run|execute|rerun)\s+(?:node\s+--test\s+)?[`'"]?[^\s,.;!]+(?:\.test|\.spec)\.(?:[cm]?[jt]sx?|py|go|rs|java)\b/i.test(text);
  const directTestExecution = !noTestExecution && (testAllowlist.length > 0 || explicitTestTargetExecution || broadBugAudit || (
    testWork && !(writingWork && noTestAuthoring) && (
      /(?:运行|执行|跑|重跑).{0,16}(?:测试|test)|(?:测试|test).{0,16}(?:运行|执行|跑|重跑)|\b(?:run|execute|rerun)\b.{0,16}\btests?\b/.test(globalTestConstraintText)
      || /(?:全面|完整|系统性地?)?测试.{0,18}(?:整个|全|本)?(?:项目|插件|代码库|系统)|\btest\b.{0,18}\b(?:the\s+)?(?:entire|whole|full)\s+(?:project|plugin|codebase|system)\b/.test(globalTestConstraintText)
      || /(?:验证|verify).{0,12}(?:测试|test|代码|实现|修复)/.test(globalTestConstraintText)
    )
  ));
  const directTestAuthoring = !noTestAuthoring && testWork && /(?:补|添加|新增|编写|写).{0,12}(?:测试|用例)|\b(?:add|write|create).{0,32}(?:tests?|test cases?)\b/.test(text);
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
    .replace(/(?:不要|不|别|无需|不用)[^，。；;,.!\n]{0,24}(?:修改|改动|改|编辑|写入|修复|实现)(?:[^，。；;,.!\n]{0,8}(?:代码|文件|实现|它))?/g, '')
    .replace(/(?:do not|don't|without|no need to)[^,.;!\n]{0,32}(?:modify|edit|change|write|fix|implement)(?:[^,.;!\n]{0,12}(?:code|files?|it))?/g, '');
  const effectiveActionText = actionText
    .replace(/(?:不要|不|别|无需|不用).{0,20}(?:生成|编写|新增|添加|写).{0,12}(?:测试代码|测试文件|测试用例)/g, '')
    .replace(/(?:do not|don't|without).{0,24}(?:generate|write|add|create).{0,16}(?:tests?|test code)/g, '');
  const codeTarget = hasCodeTarget(effectiveActionText) || workspaceScopes.exclusions.length > 0;
  const directCodeCreate = !noWorkspaceWrite && !noActionExecution && codeTarget && (
    /^(?:(?:please|can\s+you|could\s+you|would\s+you)\s+)?(?:create|build)\b.{0,96}\b(?:function|file|module|parser|handler|listener|class|component)\b/.test(effectiveActionText.trim())
    || /^(?:(?:please|can\s+you|could\s+you|would\s+you)\s+)?(?:create|build)\s+[`'"]?(?:src\/|lib\/|app\/)?[a-z0-9_./-]+\.[cm]?[jt]sx?\b/.test(effectiveActionText.trim())
    || /^(?:(?:please)\s+)?schedule\b.{0,64}\b(?:event\s+loop|task|handler)\b.{0,64}(?:src\/|lib\/|app\/|\.[cm]?[jt]sx?\b)/.test(effectiveActionText.trim())
    || /^(?:(?:请|帮我|麻烦)\s*)?(?:在.{0,64})?(?:创建|新建|构建)\s*.{0,80}(?:函数|文件|模块|解析器|处理器|监听器|类|组件)/.test(effectiveActionText.trim())
    || /^(?:(?:请|帮我|麻烦)\s*)?(?:在.{0,64})?(?:安排|创建|实现)\s*.{0,48}(?:事件循环|任务|处理器).{0,64}(?:src\/|lib\/|app\/|\.[cm]?[jt]sx?\b)/.test(effectiveActionText.trim())
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
  const directModify = !advisory && !noActionExecution && (directDestructiveModify || localGitMetadata || implicitModify || dependencyUpgrade
    || /(?:修复|修改|修正|实现|重构|更新|调整|收紧|加固|撰写|起草|添加|新增|删除|只修复|补.{0,8}(?:测试|用例))|\b(?:fix|modify|implement|refactor|update|harden|tighten|add|remove|draft|write|revise|edit|polish|rewrite)\b/.test(effectiveActionText));
  const visualWork = /(?:视觉|界面|页面|组件|动效)/.test(text)
    || /\b(?:visual|dashboard|landing page|responsive|hover|ui)\b/.test(text);
  const directCreate = directCodeCreate
    || /(?:创建|生成|设计并实现)|\b(?:create|build|implement)\b/.test(text) && visualWork;
  const diagnosis = /(?:为什么|原因|诊断|定位|排查)|\b(?:why|diagnos(?:e|is)|root cause|investigate)\b/.test(text) && !directModify;
  const review = /(?:检查|审查|审计|分析|评估|是否合理|问题)|\b(?:review|inspect|audit|analy[sz]e|assess|check|findings?)\b/.test(text);
  const conceptOnly = /(?:解释|是什么|含义|概念)|\b(?:what is|explain|define)\b/.test(text)
    && !review && !directModify && !directTestAuthoring;
  const answerOnly = (noTestExecution && /(?:命令|command)/.test(text) || noActionExecution && instructionalAdvice) && !directModify;
  const pluginWork = /(?:(?<![#a-z0-9_-])omp(?![a-z0-9_-])|omp-enhancer|插件|路由|门禁|分类器|工作流|github)|\b(?:plugin|classifier|workflow|gate logic)\b/.test(text)
    || releaseRequested
    || noExternalWrite && !externalActionRequested;
  const codeWork = localBuildExecution || localGitMetadata || codeTarget
    || /(?:代码|代码库|实现|函数|模块|接口|bug|鉴权漏洞)|(?:路由|门禁).{0,8}逻辑|逻辑.{0,8}(?:路由|门禁)|\b(?:code|codebase|repository|repo|function|module|api|bugs?|router|routenaturallanguagetask|implementation)\b/.test(effectiveActionText)
    || directModify && !writingWork;
  const documentWork = /(?:readme|安装说明|docx|word 文档|latex)|\b(?:readme|docx|latex|markdown document)\b/.test(text)
    || /(?:^|[\s`'"])(?:[a-z0-9_.-]+\/)*[a-z0-9_.-]+\.(?:md|mdx|rst|txt|tex|docx?)(?=$|[\s`'"，。；、：;,:.!！])/i.test(text);
  const configWork = dependencyInstallExecution || setupScriptExecution
    || /(?:配置资产|配置模板|config assets?|config doctor)|\b(?:config assets?|config doctor)\b/.test(text);
  const ambiguous = ambiguousCodeAction || /(?:不确定|可能是|ambiguous|unclear)/.test(text);
  const localCompanionModify = externalActionRequested && directModify && (codeTarget || writingWork || documentWork);
  const reasons = [];
  if (noWorkspaceWrite || advisory) reasons.push('read-only or advisory language');
  if (workspaceScopes.targets.length || workspaceScopes.exclusions.length) reasons.push('scoped workspace write targets requested');
  if (noTestExecution) reasons.push('test execution forbidden');
  if (testAllowlist.length) reasons.push('test kind allowlist requested');
  if (testExclusions.length) reasons.push('test kind exclusions requested');
  if (testExecutionTargets.length) reasons.push('exact test execution targets requested');
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
  if (securityWork && directModify) reasons.push('security-sensitive implementation');
  if (implicitModify) reasons.push('implicit code modification imperative');
  if (localGitMetadata) reasons.push('local git metadata mutation requested');
  if (localAutomationExecution) reasons.push('local project automation requested');
  if (ambiguousCodeAction) reasons.push('ambiguous code-target imperative');

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
    factWork,
    writingWork,
    securityWork,
    testWork,
    noTestAuthoring,
    broadBugAudit,
    directTestExecution,
    directTestAuthoring,
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
    directCreate,
    diagnosis,
    review,
    conceptOnly,
    answerOnly,
    pluginWork,
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
  const exclusions = collectScopedTargets(source, [
    /\b(?:do not|don't|never)\s+(?:modify|edit|change|update|write(?:\s+to)?|touch)\s+(?:the\s+)?[`'"]?([a-z0-9_./-]+\.[a-z0-9_.-]+)[`'"]?/gi,
    /\bbut\s+(?:do\s+)?not\s+(?:(?:modify|edit|change|update|write(?:\s+to)?|touch)\s+)?(?:the\s+)?[`'"]?([a-z0-9_./-]+\.[a-z0-9_.-]+)[`'"]?/gi,
    /(?:不要|不|别|不得|禁止)\s*(?:修改|改动|编辑|更新|写入|触碰)\s*[`'"]?([a-z0-9_./-]+\.[a-z0-9_.-]+)[`'"]?/gi,
  ], normalizeWorkspaceTarget);
  const positiveSource = maskScopedWorkspaceWriteNegatives(source);
  const targets = collectScopedTargets(positiveSource, [
    /\b(?:fix|update|edit|modify|change|write(?:\s+to)?|polish|proofread|rewrite|revise)\s+(?:the\s+)?[`'"]?([a-z0-9_./-]+\.[a-z0-9_.-]+)[`'"]?/gi,
    /(?:修复|更新|修改|编辑|调整|润色|改写)\s*[`'"]?([a-z0-9_./-]+\.[a-z0-9_.-]+)[`'"]?/gi,
  ], normalizeWorkspaceTarget);
  return { targets, exclusions };
}

function maskScopedWorkspaceWriteNegatives(value = '') {
  return String(value)
    .replace(/\b(?:do not|don't|never)\s+(?:modify|edit|change|update|write(?:\s+to)?|touch)\s+(?:the\s+)?[`'"]?[a-z0-9_./-]+\.[a-z0-9_.-]+[`'"]?/gi, ' ')
    .replace(/\bbut\s+(?:do\s+)?not\s+(?:(?:modify|edit|change|update|write(?:\s+to)?|touch)\s+)?(?:the\s+)?[`'"]?[a-z0-9_./-]+\.[a-z0-9_.-]+[`'"]?/gi, ' ')
    .replace(/(?:不要|不|别|不得|禁止)\s*(?:修改|改动|编辑|更新|写入|触碰)\s*[`'"]?[a-z0-9_./-]+\.[a-z0-9_.-]+[`'"]?/gi, ' ');
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
    .replace(/(?:不要|别|不能|不得)\s*(?:只|仅)\s*(?:分析|检查|审查|报告)/g, ' ')
    .replace(/(?:不要|别|不能|不得)\s*(?:犹豫|避免)\s*(?:修改|改动|编辑|写入|修复|实现)/g, '实现');
}

function normalizeAffirmativeExternalWritePhrases(text) {
  return String(text)
    .replace(/\b(?:no need to|do not|don't|dont|never)\s+(?:wait|delay|postpone|hold\s+off)(?:\s+(?:for\s+)?(?:the\s+)?(?:release|deployment|publication))?/g, ' ')
    .replace(/\bthere\s+(?:are|is)\s+no\s+(?:blockers?|blocking\s+issues?)\b/g, ' ')
    .replace(/\b(?:do not|don't|dont|never)\s+(?:skip|omit|avoid)\s+(?:the\s+)?(?:publish(?:ing)?|release|deployment)\s*(?:step)?/g, ' publish ')
    .replace(/(?:不要|别|无需|不用|不必|不需要)\s*(?:再)?(?:等待|等|延迟|推迟|拖延)(?:\s*(?:发布|部署|上线))?/g, ' ')
    .replace(/(?:没有|不存在)\s*(?:发布|部署|上线)?\s*(?:阻碍|阻塞|障碍|问题)/g, ' ')
    .replace(/(?:不要|别|不能|不得)\s*(?:跳过|省略|避免)\s*(?:发布|部署|上线)(?:步骤|环节)?/g, ' 发布 ');
}

function hasExplicitNoExternalWrite(text) {
  const clause = '(?:^|[，。；、：;,:.!！]\\s*|\\b(?:but|and)\\s+)';
  const english = new RegExp(
    `${clause}(?:please\\s+)?(?:do not|don't|dont|never|no need to)\\s+(?:actually\\s+)?(?:push|publish|release|deploy)\\b`
      + '|\\bwithout\\s+(?:pushing|publishing|releasing|deploying)\\b',
    'i',
  );
  const chinese = /(?:^|[，。；、：;,:.!！]\s*|(?:但|并且|然后)\s*)(?:请)?(?:不要|别|无需|不用|不必|不)\s*(?:再|实际)?\s*(?:推送|发布|部署|上线|升级\s*(?:插件|marketplace))/;
  return english.test(text) || chinese.test(text);
}

function normalizeAffirmativeSubagentPhrases(text) {
  return String(text)
    .replace(/\b(?:do not|don't|dont|never)\s+hesitate\s+to\s+use\s+(?:subagents?|sub-agents?)\b/g, ' use subagents ')
    .replace(/\b(?:no need to|do not|don't|dont|never)\s+(?:avoid|skip)\s+(?:using\s+)?(?:subagents?|sub-agents?)\b/g, ' use subagents ')
    .replace(/(?:不要|别|不能|不得)\s*(?:犹豫|跳过|避免)(?:\s*[，,])?\s*(?:直接)?\s*(?:使用)?\s*(?:子代理|子\s*agent)(?:协作)?/g, ' 使用子代理 ')
    .replace(/(?:不用|无需|不必)\s*(?:等待|等)(?:\s*[，,])?\s*(?:直接)?\s*使用\s*(?:子代理|子\s*agent)/g, ' 使用子代理 ');
}

function maskAffirmativeTestPhrases(text) {
  return String(text)
    .replace(/\b(?:do not|don't|dont|never)\s+(?:skip|omit|avoid)\s+(?:(?:running|doing)\s+)?(?:the\s+)?(?:tests?|testing)\b/g, ' ')
    .replace(/(?:不要|别|不能|不得)\s*(?:跳过|省略|略过|避免)\s*(?:运行|执行|做|进行)?\s*(?:这些?|所有|全部)?\s*测试/g, ' ');
}

function testAllowlistFor(text = '') {
  const source = String(text);
  const allowlist = [];
  const kinds = {
    unit: { english: 'unit', chinese: '单元' },
    integration: { english: 'integration', chinese: '集成' },
    e2e: { english: '(?:end[- ]to[- ]end|e2e)', chinese: '(?:端到端|e2e)' },
    smoke: { english: 'smoke', chinese: '冒烟' },
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
  };
  for (const kind of TEST_EXCLUSION_ORDER) {
    if (patterns[kind].test(source)) exclusions.push(kind);
  }
  return exclusions;
}

function maskSelectiveTestExclusions(text = '') {
  return String(text)
    .replace(/\b(?:(?:do not|don't|dont|never|skip|omit)\s+(?:(?:run|execute|rerun)\s+)?(?:the\s+)?|without\s+(?:running|executing|rerunning)\s+(?:the\s+)?)(?:unit|integration|end[- ]to[- ]end|e2e|smoke)\s+(?:tests?|testing)\b/gi, ' ')
    .replace(/(?:不要|不|别|无需|不用|跳过|省略|略过)\s*(?:运行|执行|跑|重跑|做|进行)?\s*(?:单元|集成|端到端|e2e|冒烟)\s*测试/gi, ' ');
}

function hasNaturalNoTestExecution(text) {
  const clause = '(?:^|[，。；、：;,:.!！]\\s*|\\b(?:but|and)\\s+)';
  const english = new RegExp(
    `${clause}(?:please\\s+)?(?:skip|omit)\\s+(?:all\\s+|any\\s+|the\\s+)?(?:tests?|testing)\\b`
      + `|${clause}(?:please\\s+)?(?:do not|don't|dont|never|no need to)\\s+(?:test(?:\\s+(?:it|this|that|the\\s+(?:change|fix|code)))?|(?:run|execute|rerun)\\s+(?:the\\s+)?(?:tests?|testing))\\b`
      + '|\\bwithout\\s+(?:(?:running|executing|rerunning)\\s+(?:the\\s+)?(?:tests?|testing)|testing(?:\\s+(?:it|this|that|the\\s+(?:change|fix|code)))?)\\b',
    'i',
  );
  const chinese = /(?:^|[，。；、：;,:.!！]\s*|(?:但|并且|然后)\s*)(?:请)?(?:跳过|省略|略过)\s*(?:所有|全部|这些?|相关)?\s*测试|(?:^|[，。；、：;,:.!！]\s*|(?:但|并且|然后)\s*)(?:请)?(?:不要|别|无需|不用|不必)\s*(?:再)?(?:运行|执行|跑|重跑|做|进行)?\s*(?:任何|这些?|相关|现有|全部|所有)?\s*测试/;
  return english.test(text) || chinese.test(text);
}

function maskAffirmativeNetworkPhrases(text) {
  return String(text)
    .replace(/\b(?:do not|don't|dont|never)\s+(?:skip|omit|avoid)\s+(?:(?:the|any)\s+)?(?:(?:web|internet|online|network)\s+)?(?:browsing|search|access)\b/g, ' ')
    .replace(/(?:不要|别|不能|不得)\s*(?:跳过|省略|略过|避免)\s*(?:网页|网络|互联网|在线)?\s*(?:搜索|浏览|访问|上网)/g, ' ');
}

function hasNaturalNoNetworkAccess(text) {
  const clause = '(?:^|[，。；、：;,:.!！]\\s*|\\b(?:but|and)\\s+)';
  const english = new RegExp(
    `${clause}(?:please\\s+)?(?:do not|don't|dont|never|no need to)\\s+(?:(?:browse|search|access|use)\\s+(?:the\\s+)?(?:web|internet|network|online(?:\\s+sources?)?)|go\\s+online)`
      + `|${clause}(?:please\\s+)?(?:skip|omit)\\s+(?:the\\s+)?(?:(?:web|internet|network|online)\\s+)?(?:browsing|search|access)`
      + '|\\bwithout\\s+(?:(?:the\\s+)?(?:web|internet|network)(?:\\s+(?:browsing|search|access))?|going\\s+online)\\b'
      + '|\\bno\\s+(?:web\\s+browsing|internet\\s+access|network\\s+access)\\b',
    'i',
  );
  const chinese = /(?:^|[，。；、：;,:.!！]\s*|(?:但|并且|然后)\s*)(?:请)?(?:不要|别|无需|不用|不必)\s*(?:上网|联网|访问\s*(?:外网|互联网|网络)|浏览\s*(?:网页|互联网|网络)|(?:进行)?\s*(?:网页|网络|互联网)搜索|使用\s*(?:网络|互联网)|(?:网络|互联网)访问|(?:网络|互联网)(?=\s|[，。；、：;,:.!！]|$))|(?:^|[，。；、：;,:.!！]\s*|(?:但|并且|然后)\s*)(?:请)?(?:跳过|省略|略过)\s*(?:网页|网络|互联网|在线)\s*(?:搜索|浏览|访问)/;
  return english.test(text) || chinese.test(text);
}

function englishNegativeClauseIncludes(text, targetPattern) {
  for (const match of String(text).matchAll(/\b(?:do not|don't|dont|never|no need to)\s+([^.;!\n]{1,200})/gi)) {
    if (targetPattern.test(match[1])) return true;
  }
  return false;
}

function operationFor(signals) {
  if (signals.answerOnly) return 'answer';
  if (signals.conceptOnly) return 'answer';
  if (signals.externalActionRequested && !signals.localCompanionModify) return 'execute';
  if (signals.localDevExecution || signals.localMigrationExecution || signals.localAutomationExecution || signals.irreversibleExternalOperation) return 'execute';
  if (!signals.noTestExecution && signals.directTestExecution && !signals.directModify && !signals.directTestAuthoring
    && !(signals.review && signals.codeWork)) return 'execute';
  if ((signals.noWorkspaceWrite || signals.advisory) && signals.review) return 'inspect';
  if (signals.diagnosis) return 'diagnose';
  if (signals.directCreate && !signals.directModify) return 'create';
  if (signals.directModify || signals.directTestAuthoring || signals.writingWork && /(?:润色|改写|更新|撰写|起草|写)|\b(?:polish|rewrite|update|draft|write|revise|edit)\b/.test(signals.text)) return 'modify';
  if (signals.releaseRequested) return 'release';
  if (signals.review || signals.factWork || signals.securityWork) return 'inspect';
  return 'answer';
}

function domainsFor(signals, operation) {
  if (signals.externalActionDestructive) return ['general'];
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
  const codeOrDocumentWrite = operation === 'modify'
    && (domains.includes('code') || domains.includes('document'))
    && !(signals.factWork && signals.writingWork);
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
    : signals.directTestExecution || signals.directTestAuthoring
      ? 'required'
      : 'unspecified';
  return {
    workspaceWrite,
    testExecution,
    networkAccess: signals.noNetworkAccess
      ? 'forbidden'
      : signals.externalActionRequested || signals.irreversibleExternalOperation || signals.dependencyInstallExecution || signals.factWork || signals.releaseRequested && ['modify', 'release'].includes(operation)
        ? 'required'
        : 'unspecified',
    externalWrite: signals.externalActionRequested || signals.irreversibleExternalOperation || signals.releaseRequested && ['modify', 'release'].includes(operation) ? 'required' : 'forbidden',
    subagents: signals.noSubagents ? 'forbidden' : 'unspecified',
  };
}

function complexityFor(signals, operation, domains) {
  if (signals.factWork || signals.securityWork && (operation === 'modify' || operation === 'inspect')) return 'broad';
  if (signals.broadBugAudit) return 'broad';
  if (domains.includes('writing')
    && /(?:完整|长篇|全面|研究提案|项目总结)|\b(?:full|long|substantive|complete|comprehensive)\b.{0,36}\b(?:proposal|report|paper|document)\b/.test(signals.text)) return 'broad';
  if (domains.includes('writing')
    && /(?:论文|摘要|报告|提案).{0,24}(?:润色|检查逻辑|检查表达|审查)|(?:润色|审查).{0,24}(?:论文|摘要|报告|提案)/.test(signals.text)) return 'broad';
  if (domains.includes('writing')
    && /(?:写|撰写|起草).{0,18}(?:报告|提案|论文)|\b(?:write|draft)\b.{0,24}\b(?:report|proposal|paper)\b/.test(signals.text)) return 'broad';
  if (domains.includes('writing')
    && /(?:检查|审查).{0,18}(?:逻辑|表达|风格)|\b(?:check|review)\b.{0,24}\b(?:logic|style|wording|structure)\b|\brelated work\b/.test(signals.text)) return 'broad';
  if (operation === 'inspect' && domains.includes('code') && domains.includes('tests')
    && !/(?:focused|直接|单个|一个|single|router\.js|\bfunction\b)/.test(signals.text)) return 'broad';
  if (/(?:找|检查|审计|测试).{0,20}(?:bug|缺陷)|(?:find|hunt|check|audit|test).{0,24}(?:bugs?|defects?)/.test(signals.text)
    && !/(?:focused|直接|单个|一个|single|router\.js|\bfunction\b)/.test(signals.text)) return 'broad';
  if (operation === 'modify'
    && /(?:大规模|全面|多个文件|跨文件|整个(?:项目|代码库)|全项目)|\b(?:large[- ]scale|multi[- ]file|cross[- ]file|codebase[- ]wide|repo[- ]wide|substantial refactor)\b/.test(signals.text)) return 'broad';
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
  if (operation === 'diagnose') return [{ kind: 'inspect', domain: 'code' }, { kind: 'diagnose', domain: 'code' }];
  if (operation === 'release') return [{ kind: 'release', domain: 'plugin' }];
  if (operation === 'create' && domains.includes('visual')) return [{ kind: 'create', domain: 'visual' }, { kind: 'review', domain: 'visual' }];

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
      { kind: 'modify', domain: 'writing' },
      { kind: 'review', domain: 'writing' },
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
  if (domains.includes('writing') && domains.includes('document')) {
    return compactPhases([
      { kind: 'inspect', domain: 'writing' },
      { kind: 'modify', domain: 'writing' },
      { kind: 'verify', domain: 'writing' },
      { kind: 'review', domain: 'writing' },
      externalPhase,
    ]);
  }
  if (domains.includes('code')) {
    return compactPhases([
      { kind: 'inspect', domain: 'code' },
      { kind: 'modify', domain: 'code' },
      constraints.testExecution === 'required' ? { kind: 'verify', domain: 'tests' } : null,
      { kind: 'review', domain: 'code' },
      externalPhase,
    ]);
  }
  if (domains.includes('writing')) return compactPhases([
    { kind: 'inspect', domain: 'writing' },
    { kind: 'modify', domain: 'writing' },
    { kind: 'review', domain: 'writing' },
    externalPhase,
  ]);
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
    || signals.noExternalWrite
    || signals.noNetworkAccess
    || signals.releaseRequested
    || signals.irreversibleExternalOperation
    || signals.localGitMetadata
    || signals.implicitModify
    || signals.ambiguous
    || operation === 'execute'
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

function languageFor(prompt) {
  const value = String(prompt ?? '');
  if (/[一-鿿]/.test(value)) return 'zh';
  if (/[A-Za-z]/.test(value)) return 'en';
  return 'unknown';
}

function clamp(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}
