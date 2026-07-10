import { decorateWorkflowRoute } from './workflow-routes.js';
import {
  describeNaturalLanguageTask,
  descriptorFromLegacyIntent,
  normalizeTaskDescriptor,
  resolveWritingTargetLanguage,
  writingDirectivePromptForSignals,
  writingOperationalPromptForSignals,
} from './task-descriptor.js';
import { attachCompiledTaskRoute, compileTaskRoutePolicy } from './route-policy.js';
import { resolveGateMode, resolveRouterMode } from './runtime-policy.js';
import { subagentPlans } from './subagent-plans.js';

const zhWritingTerms = ['中文', '论文', '摘要', '润色', '改写', '翻译腔', 'ai 味', '博士', '段落', '写作', '写', '报告', '文档', '起草', '引言', '相关工作', '审稿'];
const strongZhWritingTerms = [
  '中文',
  '论文',
  '摘要',
  '润色',
  '改写',
  '翻译腔',
  'ai 味',
  '博士',
  '段落',
  '写作',
  '报告',
  '文档',
  '起草',
  '引言',
  '相关工作',
  '审稿',
  '这句话',
  '这段话',
  '文字',
  '文本',
  '改成',
  '改得',
  '翻译',
];
const enWritingActionTerms = ['draft', 'write', 'revise', 'polish', 'edit', 'improve', 'proofread', 'copyedit'];
const enWritingObjectTerms = ['paper', 'report', 'manuscript', 'abstract', 'related work', 'paragraph', 'sentence', 'wording', 'grammar', 'release notes', 'changelog', 'commit message', 'letter', 'email', 'proposal', 'summary', 'guide', 'manual', 'section', 'policy', 'memo', 'announcement', 'troubleshooting guide'];
const testingTerms = ['tests', 'testing', 'unit test', 'coverage', 'mutation', 'e2e', 'playwright', 'regression', 'flaky', 'flakiness', 'test flakiness', 'lint', 'eslint', 'prettier', 'benchmark', 'smoke', 'screenshot', '测试', '测试用例', '覆盖率', '门禁', '浏览器', '截图'];
const codingTerms = ['implement', 'refactor', 'fix', 'bug', 'build', 'modify', 'code', 'component', 'migrate', 'migration', 'dependency', 'dependencies', '实现', '重构', '修复', '报错', '功能', '代码', '接口', '迁移', '依赖'];
const configTerms = ['omp-config', 'config asset', 'config assets', 'asset paths', 'config templates', 'config doctor', 'assets', 'hooks', 'templates', 'modelroles', 'model roles', 'agents', 'skills', 'subagent', 'subagents', '配置资产', '配置模板', '技能清单'];
const securityTerms = ['security', 'vulnerability', 'vulnerabilities', 'path traversal', 'path expansion', 'unsafe path', 'dangerous command', 'dangerous commands', 'command injection', 'command execution', 'auth bypass', 'xss', 'ssrf', 'injection', 'auth', 'authentication', 'authorization', 'permissions', 'privilege', 'oauth', 'owasp', 'license', 'privacy', 'high severity', '安全', '漏洞', '注入', '鉴权', '认证', '权限', '越权', '密钥', 'secret', 'secrets', '路径穿越', '危险命令', '隐私', '许可证'];
const noCodeChangeTerms = ['不要改代码', '不改代码', '不要写代码', '不写代码', '不要写入文件', '不要写入项目', '不写入文件', '不写入项目', '不写文件', '不写脚本', '不要改实现', '不改实现', '不修实现', '不要修代码', '不修代码', '不要实现', '先不要实现', '不实现', '不要改', '不要修改代码', '不要修改文件', '不修改文件', '先不要修', '不要修复', '不要修改', '只诊断', '只分析', '只检查', '只列清单', 'do not change', 'do not modify', 'do not fix', 'do not implement', 'do not write code', 'without writing code', 'diagnosis only', 'read-only'];
const diagnosisTerms = ['why', 'diagnose', 'diagnosis', 'investigate', 'root cause', '原因', '为什么', '诊断', '定位', '排查', '是什么导致', '是什么原因', 'warning:', 'failed', 'failure'];
const releaseTerms = ['push', 'publish', 'upgrade', '推送', '发布', '升级', '刷新'];
const noReleaseTerms = ['without publishing', 'without publish', 'do not publish', 'do not push', 'do not release', 'not publish', 'not push', 'not release', '不要发布', '不要推送', '不要刷新', '不发布', '不推送'];
const knowledgeWorkTerms = ['调研', '科研', '研究', '文献', '论文', '资料', '清单', '正文', '官方文档', '文档', '链接', '用法', '示例', '片段', '命令', '表达式', '竞品', 'one-liner', 'command', 'cron', 'pg_dump', 'roadmap', 'sql', '查询', 'bash', 'readme', 'paper', 'papers', 'literature', 'arxiv', 'doi', 'pdf', 'scholar', 'pubmed', 'documentation', 'docs', 'links', 'usage', 'examples', '会议纪要', '待办事项', '日程', 'agenda', 'meeting minutes', 'todo', 'todos'];
const knowledgeWorkActionTerms = ['调研', '检索', '查找', '搜索', '收集', '下载', '整理', '列出', '列', '总结', '分析', '查询', '查', '检查', '核对', '给出', '给', '统计', '演示', '解释', 'research', 'lookup', 'look up', 'search', 'find', 'download', 'collect', 'summarize', 'summarise', 'analyze', 'analyse', 'check', 'list', 'explain'];
const factCheckTerms = ['fact check', 'fact-check', 'factcheck', 'verify facts', 'claim verification', 'factual review', 'factual audit', 'source check', 'citation authenticity', 'citation verification', '事实审查', '事实核查', '事实性审查', '事实检查', '查证', '核验事实', '核查事实', '核验真实性', '真实性核验', '引用真实性', '引用核验', '引用查证', '数据真实性', '结论是否有证据', '是否属实', '是否真实'];
const factCheckToolchain = [
  'fact_check_analyze',
  'fact_check_evidence',
  'fact_check_report',
  'fact_check_gate',
];
const testingEnhancerTools = [
  'omp_test_analyze',
  'omp_test_context',
  'omp_test_browser_check',
  'omp_test_coverage_analyze',
  'omp_test_mutation_context',
  'omp_test_gate',
  'omp_test_report',
];

export const routedIntents = [
  'agentic.simple',
  'writing.zh',
  'writing.en',
  'writing.latex',
  'writing.markdown',
  'doc.convert.word',
  'factcheck.document',
  'code.dev',
  'code.debug',
  'code.test',
  'code.review',
  'omp.plugin',
  'security.review',
  'design.visual',
  'config-assets',
  'fact-check',
  'bug-audit',
  'diagnosis',
  'release',
  'security-review',
  'implementation-with-tests',
  'testing',
  'unknown',
];

export function routeNaturalLanguageTask(input = {}) {
  const prompt = String(input.prompt ?? input.text ?? '');
  const directivePrompt = writingDirectivePromptForSignals(prompt);
  const operationalPrompt = writingOperationalPromptForSignals(directivePrompt);
  const described = describeNaturalLanguageTask({ prompt });
  const legacyRoute = routeNaturalLanguageTaskLegacy({
    ...input,
    prompt: operationalPrompt,
    text: operationalPrompt,
  });
  const policy = compileTaskRoutePolicy(described, { legacyRoute });
  const routerMode = resolveRouterMode(input.routerMode ?? input.mode);
  const gateRecoveryMode = resolveGateMode(input.gateRecoveryMode);
  const canonicalTestExecution = isCanonicalTestingProjection(described, prompt);
  const canonicalPureWriting = isCanonicalPureWritingProjection(described, legacyRoute, prompt);
  const canonicalPureSecurity = isCanonicalPureSecurityProjection(described);
  const canonicalSecurityWriting = isCanonicalSecurityWritingProjection(described);
  const canonicalWritingActions = isCanonicalWritingActionProjection(described);
  const payloadSanitized = directivePrompt !== prompt;
  const alignedPayloadProjection = payloadSanitized && (
    legacyRoute.intent === policy.intent && legacyRoute.workflowRoute === policy.workflowRoute
    || ['writing.zh', 'writing.en'].includes(policy.intent) && legacyRoute.intent !== 'design.visual'
  );
  const authorityBearingTargetNeutralized = writingTargetAuthorityNeutralized(directivePrompt, operationalPrompt);
  const usePolicyRoute = (routerMode !== 'legacy'
    && (canonicalTestExecution || canonicalPureWriting || canonicalPureSecurity || canonicalSecurityWriting
      || canonicalWritingActions
      || alignedPayloadProjection || authorityBearingTargetNeutralized))
    || (routerMode === 'enforce'
      && (policy.shouldOverrideLegacy || shouldOverrideLegacyRoute(described, legacyRoute, prompt)));
  const routed = usePolicyRoute
    ? routeByLegacyIntent(policy.intent, {
      prompt,
      source: 'natural-language',
      workflowRoute: policy.workflowRoute,
      auditMode: policy.auditMode,
      writingComplexity: policy.writingComplexity,
      hardBlock: policy.hardBlock,
      shouldUseClassifier: described.provenance.needsClassifier,
    })
    : legacyRoute;
  const compiled = attachCompiledTaskRoute(routed, described);
  const projected = routerMode !== 'legacy'
    && (isCanonicalFocusedSafeWritingProjection(described) || canonicalSecurityWriting || canonicalWritingActions)
    ? {
      ...compiled,
      requiredSkills: compiled.routePlan.requiredSkills,
      requiredTools: compiled.routePlan.requiredTools,
      requiredSubagents: compiled.routePlan.requiredSubagents,
    }
    : compiled;
  return {
    ...projected,
    routerMode,
    gateRecoveryMode,
    routeObservation: routerMode === 'observe' ? {
      legacyIntent: legacyRoute.intent,
      plannedIntent: policy.intent,
      disagrees: legacyRoute.intent !== policy.intent,
    } : null,
  };
}

function isCanonicalFocusedSafeWritingProjection(descriptor) {
  const domains = descriptor?.domains ?? [];
  if (!['modify', 'inspect'].includes(descriptor?.operation)) return false;
  if (descriptor?.complexity !== 'focused' || !domains.includes('writing')) return false;
  if (!domains.every((domain) => ['writing', 'document', 'plugin'].includes(domain))) return false;
  const focusedSecurityProse = (descriptor?.provenance?.reasons ?? [])
    .includes('security prose refinement without security audit');
  if (!focusedSecurityProse) return false;
  if (descriptor?.constraints?.testExecution === 'required') return false;
  return descriptor?.constraints?.externalWrite !== 'required';
}

function isCanonicalSecurityWritingProjection(descriptor) {
  const domains = descriptor?.domains ?? [];
  if (descriptor?.operation !== 'modify' || !domains.includes('security') || !domains.includes('writing')) return false;
  if (!(descriptor?.provenance?.reasons ?? []).includes('explicit security audit requested')) return false;
  if (descriptor?.constraints?.testExecution === 'required') return false;
  return descriptor?.constraints?.externalWrite !== 'required';
}

function isCanonicalWritingActionProjection(descriptor) {
  const domains = descriptor?.domains ?? [];
  if (descriptor?.operation !== 'modify' || !domains.includes('writing')) return false;
  if (!(descriptor?.workspaceWriteTargets ?? []).length) return false;
  if (!domains.every((domain) => ['tests', 'writing', 'document', 'plugin'].includes(domain))) return false;
  return descriptor?.constraints?.testExecution === 'required'
    || descriptor?.constraints?.externalWrite === 'required';
}

function isCanonicalPureSecurityProjection(descriptor) {
  const domains = descriptor?.domains ?? [];
  if (descriptor?.operation !== 'inspect' || !domains.includes('security')) return false;
  if (!(descriptor?.provenance?.reasons ?? []).includes('explicit security audit requested')) return false;
  if (domains.some((domain) => ['writing', 'facts', 'tests', 'visual'].includes(domain))) return false;
  if (!domains.every((domain) => ['security', 'code', 'plugin', 'config'].includes(domain))) return false;
  return descriptor?.constraints?.testExecution !== 'required';
}

function isCanonicalPureWritingProjection(descriptor, legacyRoute, prompt = '') {
  const domains = descriptor?.domains ?? [];
  if (descriptor?.operation !== 'modify' || !domains.includes('writing')) return false;
  if (!(descriptor?.workspaceWriteTargets ?? []).length) return false;
  if (!domains.every((domain) => ['writing', 'document', 'plugin'].includes(domain))) return false;
  if (descriptor?.constraints?.testExecution === 'required') return false;
  if (legacyRoute?.intent === 'design.visual') return false;
  return !/(?:重新)?编译|链接检查|\b(?:compile|rebuild|link check)\b/i.test(String(prompt));
}

function writingTargetAuthorityNeutralized(directivePrompt = '', operationalPrompt = '') {
  if (directivePrompt === operationalPrompt) return false;
  const authorityPattern = /(?:提交|推送|发布|部署|上线|测试|安全|插件|路由|门禁|工作流)|\b(?:commit|push|publish|release|deploy|tests?|testing|security|plugins?|router|routing|gates?|workflows?)\b/i;
  return authorityPattern.test(directivePrompt) && !authorityPattern.test(operationalPrompt);
}

function isCanonicalTestingProjection(descriptor, prompt = '') {
  if (descriptor?.operation !== 'execute'
    || descriptor?.constraints?.testExecution !== 'required'
    || !descriptor?.domains?.includes('tests')) return false;
  if ((descriptor.testExecutionTargets ?? []).length > 0) return true;
  const text = String(prompt).toLowerCase();
  return /(?:只|仅)\s*(?:运行|执行|跑|重跑)\s*(?:npm\s+test|pnpm\s+test|yarn\s+test|bun\s+test|pytest|vitest)|\bonly\s+(?:run|execute|rerun)\s+(?:npm\s+test|pnpm\s+test|yarn\s+test|bun\s+test|pytest|vitest)\b/.test(text);
}

function shouldOverrideLegacyRoute(descriptor, legacyRoute, prompt = '') {
  const domains = new Set(descriptor?.domains ?? []);
  const text = String(prompt).toLowerCase();
  if (descriptor?.operation === 'execute' && domains.has('tests')
    && /(?:只|仅|only).{0,20}(?:运行|执行|跑|run|execute).{0,20}(?:npm test|bun test|pytest|vitest|tests?)/.test(text)) return true;
  if (descriptor?.operation === 'answer' && domains.has('tests') && /(?:命令|command)/.test(text)) return true;
  if (descriptor?.constraints?.externalWrite === 'required' && descriptor.operation === 'modify') return true;
  if (domains.has('security') && domains.has('code') && descriptor?.operation === 'modify'
    && (!domains.has('writing') || /(?:修复|fix|patch).{0,30}(?:漏洞|鉴权|认证|权限|security|vulnerab|auth|secret|注入)/.test(text))) return true;
  if (descriptor?.operation === 'inspect' && domains.has('code')) {
    if (legacyRoute?.intent === 'implementation-with-tests') return true;
    if (legacyRoute?.intent === 'bug-audit' && descriptor.complexity === 'focused') return true;
    return /有什么.{0,30}(?:优化|改进)|(?:优化|改进)建议|是否合理|suggest\s+(?:improvements?|optimizations?)|assess\s+whether.{0,30}(?:reasonable|sound)|(?:review|分析|检查).{0,40}(?:router\.js|routenaturallanguagetask)|concrete defects/.test(text);
  }
  return false;
}

function routeNaturalLanguageTaskLegacy(input = {}) {
  const prompt = String(input.prompt ?? input.text ?? '');
  const normalized = prompt.toLowerCase();

  if (!normalized.trim()) return unknownRoute();

  const conceptOnly = isConceptOnlyQuestion(normalized);
  const asksNoCodeChange = includesAny(normalized, noCodeChangeTerms);
  const isPlanForCodeChange = isImplementationPlanForCodeChange(normalized);
  const hasTesting = isTestingRequest(normalized);
  const hasDirectTestAuthoring = isDirectTestAuthoring(normalized);
  const hasTestAnalysis = isTestAnalysisRequest(normalized);
  const hasTestReportWriting = isTestReportWritingRequest(normalized);
  const hasBugReportWriting = isBugReportWritingRequest(normalized);
  const hasGateValidatorStatusReport = isGateValidatorStatusReport(normalized);
  const hasFactCheck = isFactCheckRequest(normalized) || isFactCheckDocumentRequest(normalized);
  const hasLocalSmokeOnly = isLocalSmokeOrProcessRunRequest(normalized);
  const hasWorkflowValidation = isWorkflowValidationRequest(normalized);
  const hasKnowledgeOnly = !hasFactCheck && isKnowledgeWorkWithoutWritingArtifact(normalized);
  const hasAuditSummary = isAuditSummaryRequest(normalized);
  const hasRouteToolDiagnostic = isRouteToolDiagnosticRequest(normalized);
  const hasSummaryWriting = !hasAuditSummary && isSummaryWritingRequest(normalized);
  const hasAgenticImplementationCoordination = isAgenticImplementationCoordinationRequest(normalized);
  const hasRawCodeChange = (!asksNoCodeChange || isPlanForCodeChange) && (!hasKnowledgeOnly || hasAgenticImplementationCoordination) && (isCodeChangeRequest(normalized) || hasAgenticImplementationCoordination);
  const hasBugAudit = !hasRouteToolDiagnostic && (hasAuditSummary || (!hasSummaryWriting && (hasWorkflowValidation || (!hasRawCodeChange && !hasGateValidatorStatusReport && !hasBugReportWriting && !hasTestReportWriting && isBugAuditRequest(normalized)))));
  const hasFocusedBugAudit = !hasRouteToolDiagnostic && (hasWorkflowValidation || (hasBugAudit && isFocusedDirectAuditRequest(normalized)));
  const hasCoding = hasRawCodeChange && !hasBugAudit && !hasKnowledgeOnly;
  const hasCodeChange = hasCoding && !hasTestReportWriting;
  const hasSecurityWritingArtifact = isSecurityWritingArtifact(normalized);
  const writingTargetLanguage = resolveWritingTargetLanguage(prompt, 'unknown');
  const hasEnglishWriting = writingTargetLanguage === 'en'
    || writingTargetLanguage === 'unknown' && (isEnglishWriting(normalized)
      || (hasSecurityWritingArtifact && !/[\u4e00-\u9fff]/.test(prompt)));
  const hasChineseWriting = writingTargetLanguage === 'zh'
    || writingTargetLanguage === 'unknown' && !hasEnglishWriting
      && (isChineseWriting(normalized, prompt) || hasSecurityWritingArtifact);
  const hasWriting = hasChineseWriting || hasEnglishWriting;
  const hasSecurity = includesAny(normalized, securityTerms);
  const hasRelease = isReleaseRequest(normalized);
  const hasConfigAssets = !hasGateValidatorStatusReport && isConfigAssetRequest(normalized);
  const hasDiagnosisOnly = hasGateValidatorStatusReport || isDiagnosisOnlyRequest(normalized, asksNoCodeChange);
  const workflowRouteHint = workflowRouteHintForPrompt(normalized, prompt);
  const shouldUseClassifier = shouldUseRouteClassifier(normalized, prompt, { workflowRouteHint, hasCodeChange, hasKnowledgeOnly, hasConfigAssets });
  const routed = (intent, options = {}) => routeByLegacyIntent(intent, {
    ...options,
    prompt,
    workflowRoute: options.workflowRoute ?? workflowRouteForPromptIntent(workflowRouteHint, intent),
    shouldUseClassifier,
  });

  if (isConstrainedE2EWorkflowAuditPrompt(normalized)) {
    return routed('diagnosis');
  }

  if (conceptOnly && !isSecurityConceptQuestion(normalized)) return routed('agentic.simple');

  if (isHardBlockRequest(normalized) && !hasWriting && !hasCodeChange && !hasBugAudit && !hasTestAnalysis && !hasDiagnosisOnly && !hasSecurity) {
    return routed(hasRelease ? 'release' : 'agentic.simple', { workflowRoute: 'agentic.simple', hardBlock: true });
  }

  if (workflowRouteHint === 'doc.convert.word') {
    return routed('doc.convert.word', { workflowRoute: workflowRouteHint });
  }

  if (workflowRouteHint === 'writing.latex' && !hasCodeChange && !hasTestAnalysis) {
    return routed(hasEnglishWriting ? 'writing.en' : 'writing.zh', { workflowRoute: workflowRouteHint, writingComplexity: 'simple' });
  }

  if (workflowRouteHint === 'writing.markdown' && !hasCodeChange) {
    return routed(hasEnglishWriting ? 'writing.en' : 'writing.zh', { workflowRoute: workflowRouteHint, writingComplexity: 'simple' });
  }

  if (workflowRouteHint === 'design.visual' && !hasCodeChange) {
    return routed('design.visual', { workflowRoute: workflowRouteHint });
  }

  if (hasGateValidatorStatusReport && !hasCodeChange) {
    return routed('diagnosis');
  }
  if (isSecurityConceptOnlyRequest(normalized)) {
    return routed('agentic.simple');
  }


  if (hasSecurity && (!hasWriting || isSecurityAuditOrFixRequest(normalized)) && (!hasKnowledgeOnly || isSecurityAuditOrFixRequest(normalized))) {
    return routed('security-review');
  }

  if (hasFactCheck) {
    return routed('fact-check');
  }

  if (hasRouteToolDiagnostic && !hasCodeChange) {
    return routed('diagnosis');
  }

  if (isAgenticRouteSkillProbeWithoutDispatch(normalized)) {
    return routed('bug-audit', { auditMode: 'focused' });
  }

  if (hasSummaryWriting && !hasCodeChange) {
    return routed(hasEnglishWriting ? 'writing.en' : 'writing.zh', { writingComplexity: 'simple' });
  }
  if (hasAgenticImplementationCoordination && !asksNoCodeChange) {
    return routed('implementation-with-tests');
  }


  if (hasBugAudit) {
    return routed('bug-audit', { auditMode: hasFocusedBugAudit ? 'focused' : null });
  }

  if (hasLocalSmokeOnly) {
    return routed('agentic.simple');
  }

  if (hasTestReportWriting) {
    return routed(hasEnglishWriting ? 'writing.en' : 'writing.zh', { writingComplexity: isObservedTestSummary(normalized) ? 'simple' : writingComplexityFor(normalized) });
  }

  if (hasCodeChange && hasTesting) {
    return routed('implementation-with-tests');
  }

  if (hasDirectTestAuthoring) {
    return routed('bug-audit');
  }

  if (hasTestAnalysis && !hasTestReportWriting) {
    return routed('bug-audit');
  }

  if (hasCodeChange) {
    return routed('implementation-with-tests');
  }

  if (hasChineseWriting) {
    return routed('writing.zh', { writingComplexity: writingComplexityFor(normalized) });
  }

  if (hasEnglishWriting) {
    return routed('writing.en', { writingComplexity: writingComplexityFor(normalized) });
  }

  if (hasRelease && !hasDiagnosisOnly) {
    return routed('release', { workflowRoute: 'agentic.simple', hardBlock: true });
  }

  if (hasConfigAssets) {
    return routed('config-assets');
  }

  if (hasKnowledgeOnly) {
    return routed('agentic.simple');
  }

  if (hasDiagnosisOnly) {
    return routed('diagnosis');
  }

  if (hasTesting && !hasWriting) {
    return routed('bug-audit');
  }

  return routed('agentic.simple');
}

export function routeByIntent(intent, options = {}) {
  const descriptor = options.taskDescriptor == null
    ? descriptorFromLegacyIntent(intent, {
      prompt: options.prompt,
      language: options.language,
      auditMode: options.auditMode,
    })
    : normalizeTaskDescriptor(options.taskDescriptor);
  const policy = compileTaskRoutePolicy(descriptor, { requestedIntent: intent });
  const route = routeByLegacyIntent(policy.intent, {
    ...options,
    auditMode: options.auditMode ?? policy.auditMode,
    workflowRoute: options.workflowRoute ?? policy.workflowRoute,
    writingComplexity: options.writingComplexity ?? policy.writingComplexity,
    hardBlock: options.hardBlock ?? policy.hardBlock,
  });
  return attachCompiledTaskRoute(route, descriptor);
}

function routeByLegacyIntent(intent, { source = 'natural-language', writingComplexity = 'complex', auditMode = null, workflowRoute = null, shouldUseClassifier = false, hardBlock = false, prompt = '' } = {}) {
  if (intent === 'testing') {
    return route({
      intent: 'testing',
      agent: null,
      requiredSkills: [],
      requiredTools: [],
      requiredSubagents: [],
      auditMode: auditMode ?? 'focused',
      source,
      workflowRoute: workflowRoute ?? 'code.test',
      shouldUseClassifier,
      hardBlock,
    });
  }

  if (intent === 'agentic.simple' || intent === 'unknown') {
    return route({
      intent: 'unknown',
      agent: null,
      requiredSkills: [],
      requiredTools: [],
      requiredSubagents: [],
      workflowRoute: 'agentic.simple',
      shouldUseClassifier,
      hardBlock,
      source,
    });
  }

  if (intent === 'writing.latex') {
    return route({
      intent,
      agent: 'writing-helper.writer',
      requiredSkills: workflowRoute === 'writing.latex' ? latexSkillsForPrompt(prompt) : ['format-markdown2latex'],
      requiredTools: [],
      requiredSubagents: [],
      workflowRoute: 'writing.latex',
      shouldUseClassifier,
      source,
    });
  }

  if (intent === 'writing.markdown') {
    return route({
      intent,
      agent: 'writing-helper.writer',
      requiredSkills: ['writing-markdown-helper'],
      requiredTools: [],
      requiredSubagents: [],
      workflowRoute: 'writing.markdown',
      shouldUseClassifier,
      source,
    });
  }

  if (intent === 'doc.convert.word') {
    return route({
      intent,
      agent: null,
      requiredSkills: ['docx'],
      requiredTools: [],
      requiredSubagents: [],
      workflowRoute: 'doc.convert.word',
      shouldUseClassifier,
      source,
    });
  }

  if (intent === 'design.visual') {
    return route({
      intent,
      agent: 'designer',
      requiredSkills: visualDesignSkillsForPrompt(prompt),
      requiredTools: [],
      requiredSubagents: [],
      workflowRoute: 'design.visual',
      shouldUseClassifier,
      source,
    });
  }
  if (intent === 'diagnosis') {
    return route({
      intent,
      agent: null,
      requiredSkills: [],
      requiredTools: [],
      requiredSubagents: [],
      source,
      workflowRoute,
      shouldUseClassifier,
      hardBlock,
    });
  }

  if (intent === 'release') {
    return route({
      intent,
      agent: null,
      requiredSkills: [],
      requiredTools: [],
      requiredSubagents: [],
      source,
      workflowRoute,
      shouldUseClassifier,
      hardBlock,
    });
  }

  if (intent === 'config-assets') {
    return route({
      intent,
      agent: 'config-assets',
      requiredSkills: [],
      requiredTools: ['omp_config_doctor', 'omp_config_assets', 'omp_config_plan'],
      requiredSubagents: subagentPlans.configAssets,
      source,
      workflowRoute,
      shouldUseClassifier,
      hardBlock,
    });
  }

  if (intent === 'security-review') {
    return route({
      intent,
      agent: 'ecc-security-reviewer',
      requiredSkills: ['security-review', 'security-scan'],
      requiredTools: [],
      requiredSubagents: subagentPlans.securityReview,
      source,
      workflowRoute,
      shouldUseClassifier,
      hardBlock,
    });
  }

  if (intent === 'fact-check') {
    return route({
      intent,
      agent: 'fact-checker',
      requiredSkills: ['fact-checking', 'claim-extraction', 'source-evaluation', 'citation-authenticity'],
      requiredTools: factCheckToolchain,
      requiredSubagents: subagentPlans.factCheck,
      source,
      workflowRoute,
      shouldUseClassifier,
      hardBlock,
    });
  }

  if (intent === 'bug-audit') {
    if (auditMode === 'focused') {
      return route({
        intent,
        agent: 'tester',
        requiredSkills: ['diagnose', 'test-driven-development', 'verification-before-completion', 'search-first'],
        requiredTools: testingEnhancerTools,
        requiredSubagents: [],
        auditMode,
        source,
        workflowRoute,
        shouldUseClassifier,
        hardBlock,
      });
    }

    return route({
      intent,
      agent: 'tester',
      requiredSkills: ['diagnose', 'test-driven-development', 'subagent-driven-development', 'verification-before-completion', 'search-first', 'ai-regression-testing'],
      requiredTools: testingEnhancerTools,
      requiredSubagents: subagentPlans.bugAudit,
      source,
      workflowRoute,
      shouldUseClassifier,
      hardBlock,
    });
  }

  if (intent === 'implementation-with-tests') {
    return route({
      intent,
      agent: 'implementer',
      requiredSkills: ['brainstorming', 'test-driven-development', 'subagent-driven-development', 'verification-before-completion'],
      requiredTools: testingEnhancerTools,
      requiredSubagents: subagentPlans.implementation,
      source,
      workflowRoute,
      shouldUseClassifier,
      hardBlock,
    });
  }

  if (intent === 'writing.zh') {
    const complex = writingComplexity !== 'simple';
    return route({
      intent,
      agent: 'writing-helper.zh-writer',
      requiredSkills: complex
        ? ['plain-chinese-writing', 'zh-writing-polish', 'zh-writing-checkers']
        : ['plain-chinese-writing', 'zh-writing-polish'],
      requiredTools: complex ? ['writing_logic_check', 'writing_quality_check'] : [],
      requiredSubagents: complex ? subagentPlans.writingZh : [],
      writingComplexity: complex ? 'complex' : 'simple',
      source,
      workflowRoute,
      shouldUseClassifier,
      hardBlock,
    });
  }

  if (intent === 'writing.en') {
    const complex = writingComplexity !== 'simple';
    return route({
      intent,
      agent: 'writing-helper.writer',
      requiredSkills: complex ? ['writing-markdown-helper', 'writing-checkers'] : ['writing-markdown-helper'],
      requiredTools: complex ? ['writing_logic_check', 'writing_quality_check'] : [],
      requiredSubagents: complex ? subagentPlans.writingEn : [],
      writingComplexity: complex ? 'complex' : 'simple',
      source,
      workflowRoute,
      shouldUseClassifier,
      hardBlock,
    });
  }

  return unknownRoute(source);
}

function route({
  intent,
  agent,
  requiredSkills = [],
  requiredTools = [],
  requiredSubagents = [],
  writingComplexity = null,
  auditMode = null,
  workflowRoute = null,
  shouldUseClassifier = false,
  hardBlock = false,
  source = 'natural-language',
}) {
  const routed = {
    intent,
    agent,
    requiredSkills,
    requiredTools,
    requiredSubagents,
    source,
  };
  if (writingComplexity) routed.writingComplexity = writingComplexity;
  if (auditMode) routed.auditMode = auditMode;
  const decorated = decorateWorkflowRoute(routed, { workflowRoute });
  decorated.shouldUseClassifier = Boolean(shouldUseClassifier);
  if (hardBlock) decorated.gateMode = 'hard-block';
  return decorated;
}

function workflowRouteForPromptIntent(workflowRouteHint, intent) {
  if (workflowRouteHint) {
    if (intent === 'implementation-with-tests') return 'code.dev';
    if (intent === 'bug-audit') return 'code.review';
    if (intent === 'diagnosis') return 'code.debug';
    if (intent === 'fact-check') return 'factcheck.document';
    if (intent === 'security-review') return 'security.review';
    if (intent === 'config-assets') return 'omp.plugin';
    if (intent === 'writing.zh' || intent === 'writing.en') return workflowRouteHint;
    if (intent === 'release') return 'agentic.simple';
    if (intent === 'agentic.simple') return 'agentic.simple';
    return workflowRouteHint;
  }
  return null;
}

function workflowRouteHintForPrompt(text, original) {
  if (isWordDocumentRequest(text)) return 'doc.convert.word';
  if (isLatexWritingRequest(text)) return 'writing.latex';
  if (isMarkdownWritingRequest(text)) return 'writing.markdown';
  if (isVisualDesignRequest(text, original)) return 'design.visual';
  return null;
}

function shouldUseRouteClassifier(text, original, { workflowRouteHint = null, hasCodeChange = false, hasKnowledgeOnly = false, hasConfigAssets = false } = {}) {
  if (workflowRouteHint || (hasConfigAssets && !hasCodeChange)) return false;
  if (/(?:补测试|加测试|添加测试|add (?:regression )?tests?|with tests?|并补测试)/.test(text)) return false;
  if (/请写一个|写一个|写个/.test(text) && /(?:看板|页面|模块|功能|组件|dashboard|landing|component)/i.test(original)) return true;
  if (/优化.*(?:workflow|工作流|skills?|技能)|(?:workflow|工作流).*优化/.test(text) && !hasKnowledgeOnly) return true;
  if (/\bcli\b|官方文档|docs?|documentation|用法|参数/.test(text) && !hasCodeChange) return true;
  return false;
}

function isHardBlockRequest(text) {
  if (/(?:运行|检查|核对|verify|check|run).*(?:plugin list|升级成功|安装是否升级)/.test(text)) return false;
  return isIrreversibleFileRequest(text) || (isReleaseRequest(text) && !includesAny(text, noReleaseTerms));
}

function isIrreversibleFileRequest(text) {
  return /(?:删除|清空|移除).*(?:整个|全部|所有|缓存|目录|文件)|(?:delete|remove|wipe|clear).*(?:entire|all|cache|directory|folder|files?)/.test(text);
}

function isWordDocumentRequest(text) {
  return /\b(?:docx|word document|word doc|ms word)\b/.test(text)
    || /(?:word|docx|word\s*文档).*(?:转换|生成|创建|读取|提取|目录|标题|表格|report|document)/.test(text)
    || /(?:转换|生成|创建|读取|提取).*(?:word|docx|word\s*文档)/.test(text);
}

function isLatexWritingRequest(text) {
  return /\b(?:latex|tex)\b/.test(text)
    || /(?:latex|会议模板|期刊模板|模板).*(?:转换|套用|修复|编译|排版)/.test(text)
    || /(?:转换|套用|修复|排版).*(?:latex|tex|会议模板|期刊模板)/.test(text);
}

function isMarkdownWritingRequest(text) {
  return /\bmarkdown\b/.test(text)
    || /(?:整理成|转换成|生成|改写成)\s*(?:markdown|md)\b/.test(text);
}

function isFactCheckDocumentRequest(text) {
  const sentenceText = String(text).replace(/((?:[a-z0-9_.-]+\/)*[a-z0-9_.-]+)\.([a-z0-9]{1,10})\b/gi, '$1_fileext_$2');
  return sentenceText.split(/[。！？.!?\n]+/).some((clause) => (
    /(?:核验|核查|查证|事实核查|事实审查|事实检查|verify|fact.?check)[^。！？.!?\n]{0,160}(?:引用|事实|数据|年份|claims?|citations?|source|evidence|证据)/i.test(clause)
    || /(?:引用|事实|数据|年份|claims?|citations?|source|evidence|证据)[^。！？.!?\n]{0,160}(?:核验|核查|查证|verify|fact.?check)/i.test(clause)
    || /(?:是否|whether|does|do)[^。！？.!?\n]{0,120}(?:evidence|证据)[^。！？.!?\n]{0,40}(?:support|支持|支撑|证明)/i.test(clause)
    || /(?:check|verify)[^。！？.!?\n]{0,80}(?:cited\s+source|citation(?:\s+source)?)[^。！？.!?\n]{0,80}supports?[^。！？.!?\n]{0,40}claims?/i.test(clause)
    || /(?:check|verify)[^。！？.!?\n]{0,80}claims?[^。！？.!?\n]{0,80}supported\s+by[^。！？.!?\n]{0,40}(?:the\s+)?(?:cited\s+source|citation(?:\s+source)?)/i.test(clause)
  ));
}

function isVisualDesignRequest(text, original) {
  if (/[\u4e00-\u9fff]/.test(original)) {
    return /(?:设计|美化|视觉|布局|色彩|海报|首屏|landing page|dashboard).*(?:漂亮|视觉|布局|色彩|层次|海报|首屏|cta|poster|design)/i.test(text);
  }
  return /\b(?:design|beautify|visual|poster|landing page|dashboard|layout|cta)\b.*\b(?:polished|visual|layout|poster|design|style|hierarchy)\b/i.test(original)
    || /\b(?:polish|beautify|style|refine)\b.*\b(?:visually|visual|spacing|typography|color|hover states?|layout)\b/i.test(original);
}

function latexSkillsForPrompt(prompt) {
  const text = String(prompt).toLowerCase();
  if (/latex.*markdown|tex.*markdown|latex.*md/.test(text)) return ['format-latex2markdown'];
  if (/template|会议模板|期刊模板/.test(text)) return ['format-template-latex'];
  if (/markdown|md|转成\s*latex|转换.*latex/.test(text)) return ['format-markdown2latex'];
  return ['format-markdown2latex'];
}

function visualDesignSkillsForPrompt(prompt) {
  const text = String(prompt).toLowerCase();
  if (/poster|海报/.test(text)) return ['canvas-design'];
  return ['frontend-design'];
}

function isChineseWriting(normalized, original) {
  if (!/[\u4e00-\u9fff]/.test(original)) return false;
  if (isConceptOnlyQuestion(normalized)) return false;
  if (isKnowledgeWorkWithoutWritingArtifact(normalized)) return false;
  if (isStandaloneCommandOrSnippetRequest(normalized)) return false;
  if (isReportOnlyAudit(normalized)) return false;
  if (isDirectTestAuthoring(normalized)) return false;
  if (/(?:写|起草|撰写|润色|改写|翻译).*(?:说明|文档|报告|草稿|公告|ticket|法务|memo|changelog|release notes)/.test(normalized)) return true;
  if (/(?:检查|审查|核对).*(?:文案).*(?:清楚|准确|自然|语气|表达)/.test(normalized)) return true;
  if (/整理成\s*(?:markdown\s*)?表格/.test(normalized)) return true;
  if (/(?:修复|修改|润色|改写).*(?:表述|措辞|语气|风格|表达|说明)/.test(normalized)) return true;
  if (includesAny(normalized, strongZhWritingTerms)) return true;
  if (!normalized.includes('写')) return false;
  return !includesAny(normalized, ['函数', '代码', '接口', '实现', 'api', 'component', '组件', '登录', '注册', '弹窗', '路由', 'hook', 'hooks']);
}

function isEnglishWriting(text) {
  if (includesAny(text, enWritingActionTerms) && includesAny(text, enWritingObjectTerms)) return true;
  return /(?:check|review|improve|edit|fix|proofread|copyedit)\s+.*(?:logic|style|grammar|typos?|wording|paragraph|abstract|paper|manuscript|report|release notes|changelog|letter|email|proposal|summary)/.test(text);
}

function writingComplexityFor(text) {
  return isSimpleWritingRequest(text) ? 'simple' : 'complex';
}

function isSimpleWritingRequest(text) {
  const explicitSnippet = /(?:这句话|一句话|这个句子|英文句子|中文句子|短句|这段话|下面这段|下面文字|下面说明|这段说明|这段文字)/.test(text)
    || /(?:sentence|one sentence|short phrase|this(?:\s+\w+){0,3}\s+paragraph|the paragraph|this wording)\b/.test(text);
  if (explicitSnippet) return true;
  if (isComplexWritingRequest(text)) return false;
  return false;
}

function isComplexWritingRequest(text) {
  return /(?:一份|完整|大量|长文|整篇|章节|小节|报告|文档|审稿回复|相关工作|引言|申请材料|研究计划|实验报告|项目报告)/.test(text)
    || /\b(?:report|document|proposal|release notes|changelog|letter|email|summary|related work|section|chapter|manuscript|paper|abstract|writeup|postmortem)\b|\bdocs?\b(?!\/)/.test(text);
}

function isTestingRequest(text) {
  if (isLocalOperationalExecutionRequest(text)) return false;
  return includesAny(text, testingTerms)
    || /(?:write|add|create|run|execute|fix|update|check)\s+tests?\b/.test(text)
    || /\btest\s+(?:this|the|my|our|it|function|code|plugin|workflow|route|logic)\b/.test(text)
    || /(?:测试用例).*(?:测试文件|运行|执行)/.test(text)
    || text.includes('写高信号单元测试')
    || text.includes('写测试')
    || text.includes('补测试');
}

function isLocalOperationalExecutionRequest(text) {
  const value = String(text).trim();
  return /^(?:(?:please)\s+)?(?:(?:run|start|launch)\s+)?(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:start|dev|serve)\b/.test(value)
    || /^(?:(?:please)\s+)?(?:run|start|launch)\b.{0,64}(?:\blocal\s+(?:dev|development)\s+server\b|\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:start|dev|serve)\b)/.test(value)
    || /^(?:请\s*)?(?:运行|执行|启动)\s*.{0,48}(?:本地开发服务器|开发服务|(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:start|dev|serve)\b)/.test(value)
    || /^(?:(?:please)\s+)?(?:run|execute|apply)\b.{0,56}\b(?:local\s+)?(?:database\s+)?migration(?:\s+script)?\b/.test(value)
    || /^(?:请\s*)?(?:运行|执行|应用).{0,40}(?:本地)?(?:数据库)?迁移脚本/.test(value);
}

function isDirectTestAuthoring(text) {
  if (isTestReportWritingRequest(text)) return false;
  return /(?:write|add|create)\s+tests?\b/.test(text)
    || /(?:生成|创建|编写|补充).*(?:测试用例|测试矩阵|边界测试|压力测试)/.test(text)
    || /(?:测试用例).*(?:写成|生成|加入|保存到).*(?:测试文件|test|tests)/.test(text)
    || text.includes('写高信号单元测试')
    || text.includes('写测试')
    || text.includes('补测试');
}

function isRouteToolDiagnosticRequest(text) {
  if (/(?:review|inspect|audit|check|find|hunt|检查|排查|审查|查找|扫描|审计).*(?:omp_core_route_task|omp_core_subagent_status|route_task).*(?:bugs?|defects?|实现|implementation|file-line findings|concrete findings|代码|问题|缺陷|风险)/.test(text)
    && !/(?:tool check only|call exactly|route probe|probe prompt|路由行为|自检|diagnostic self-check)/.test(text)) return false;
  return /(?:omp_core_route_task|omp_core_subagent_status|route_task|route probe|probe prompt|route\s*probe|route tool|tool check only)/.test(text)
    || /(?:验证|检查).*(?:路由行为|route_task|omp_core_route_task|probe).*(?:不修改|不运行测试|不跑测试|已安装|installed|status)/.test(text)
    || /(?:路由|route|gate|门禁).*(?:自检|诊断|验证).*(?:不修改|不运行测试|不跑测试)/.test(text);
}

function isAuditSummaryRequest(text) {
  if (/(?:不要|不|别)\s*(?:找|查找|检查).*(?:bug|缺陷)/.test(text) || /(?:do not|don't|not)\s+(?:find|look for|check for).*(?:bugs?|defects?)/.test(text)) return false;
  if (isConfigAssetRequest(text)) return false;
  return /(?:inspect|audit|review|check|find|hunt).*(?:bugs?|defects?|file-line findings|concrete findings)/.test(text)
    || /(?:检查|排查|审查|查找|扫描|审计|找|发现).*(?:代码|项目|插件|实现|接口|workflow|工作流|门禁|配置|config|docker-compose|文件).*(?:问题|缺陷|bug|风险|错误|隐患|发现)/.test(text);
}

function isSummaryWritingRequest(text) {
  if (asksToRunTestVerification(text)) return false;
  if (/(?:写|起草|撰写).*(?:总结|报告|文档|summary|report|document)/.test(text)) return false;
  if (/(?:inspect|audit|review|check|find|hunt).*(?:bugs?|defects?|file-line findings|concrete findings)/.test(text)) return false;
  if (/(?:检查|排查|审查|查找|扫描|审计|找|发现).*(?:代码|项目|插件|实现|接口|workflow|工作流|门禁|配置|config|docker-compose|文件).*(?:问题|缺陷|bug|风险|错误|隐患|发现)/.test(text)) return false;
  return isObservedTestSummary(text)
    || /(?:本轮|这轮|这一轮|此次|当前).*(?:测试|验证|e2e|门禁|gate|workflow|工作流).*(?:暴露|发现|遇到|出现).*(?:问题|风险|现象|结论)/
      .test(text)
    || /(?:总结|汇总|归纳|整理|压缩).*(?:问题|观察|现象|结论|结果|诊断结果|内容|记录|发现)/.test(text)
    || /(?:summarize|summarise|condense)\s+.*(?:issues?|observations?|findings?|results?|content|notes?|diagnostics?)/.test(text);
}

function isTestReportWritingRequest(text) {
  if (asksToRunTestVerification(text)) return false;
  if (isImplementationPlanForCodeChange(text)) return false;
  if (isReportOnlyAudit(text) && !/(?:写|起草|撰写|润色|改写|整理|总结|归纳|draft|write|revise|polish|edit|improve)/.test(text)) return false;
  return /(?:写|起草|撰写|润色|改写|整理|总结|归纳)(?:一份|一个|这份|这段|当前|一下|统一)?(?:测试|覆盖率|门禁|回归|e2e|playwright)?(?:报告|总结|说明|文档|记录|复盘|计划|问题|观察|现象|结论)/.test(text)
    || /(?:写|起草|撰写|整理|总结|归纳).*(?:测试|覆盖率|门禁|回归|e2e|playwright).*(?:计划|报告|总结|说明|文档|记录|复盘|问题|观察|现象|结论)/.test(text)
    || /(?:总结|归纳|整理).*(?:这一轮|本轮|当前).*(?:测试|验证|e2e).*(?:问题|观察|现象|结论)/.test(text)
    || /(?:检查|审查|核对|修复|修改).*(?:测试|覆盖率|门禁|回归|e2e|playwright).*(?:报告|章节|结论|措辞|表述|计划)/.test(text)
    || /(?:检查|审查|核对|修复|修改).*(?:报告|章节|结论|措辞|表述|计划).*(?:测试|覆盖率|门禁|回归|e2e|playwright)/.test(text)
    || /(?:draft|write|revise|polish|edit|improve|summarize|summarise)\s+.*(?:test|testing|coverage|gate|regression|e2e|playwright).*(?:report|summary|notes|document|doc|writeup|postmortem|observations?|findings?)/.test(text)
    || /(?:draft|write|revise|polish|edit|improve|summarize|summarise)\s+.*(?:report|summary|notes|document|doc|writeup|postmortem|observations?|findings?).*(?:test|testing|coverage|gate|regression|e2e|playwright)/.test(text);
}

function isObservedTestSummary(text) {
  return /(?:总结|归纳|整理).*(?:这一轮|本轮|当前).*(?:测试|验证|e2e).*(?:问题|观察|现象|结论)/.test(text)
    || /(?:统一总结).*(?:测试|验证|e2e).*(?:问题|观察|现象|结论)/.test(text)
    || /(?:summarize|summarise)\s+.*(?:observed|completed|previous).*(?:test|testing|e2e|gate|workflow).*(?:issues?|observations?|findings?)/.test(text);
}

function isTestAnalysisRequest(text) {
  if (isLocalOperationalExecutionRequest(text)) return false;
  if (isBugReportWritingRequest(text)) return false;
  return includesAny(text, ['flaky', 'flakiness', 'test flakiness'])
    || /(?:review|check|analyze|analyse|audit|investigate|inspect)\s+.*(?:tests?|testing|coverage|flaky|flakiness|browser|e2e|playwright)/.test(text)
    || /(?:review|check|analyze|analyse|audit|investigate|inspect|run|execute|rerun)\s+.*(?:lint|eslint|prettier|benchmark|mutation|terraform plan|drift|browser|smoke|screenshot|migration|rollback|plugin list|\bci\b|\bjob\b|\blogs?\b|\bwarnings?\b)/.test(text)
    || /(?:run|execute|rerun)\s+.*(?:tests?|testing|mutation|terraform plan|browser|e2e|playwright|lint|eslint|prettier|benchmark|plugin list|\bci\b|\bjob\b)/.test(text)
    || /(?:检查|分析|审查|排查|运行|执行|重跑|重新运行).*(?:测试|覆盖率|门禁|浏览器|截图|e2e|回归|mutation|terraform plan|drift|lint|eslint|prettier|benchmark|migration|迁移|回滚|ci|job|plugin list)/.test(text)
    || /(?:编译).*(?:latex|warnings?|warning|编译)/.test(text)
    || /(?:检查|审查|测试|排查).*(?:门禁|gate|路由|workflow|工作流|代码|实现|逻辑).*(?:误挡|异常|错误|失败|风险|bug|问题)/.test(text)
    || /(?:发布前|pre[-\s]?release).*(?:check|检查|pack|test|plugin list|marketplace)/.test(text);
}

function isConstrainedE2EWorkflowAuditPrompt(text) {
  if (!/omp_e2e_[a-z0-9_]*workflow_audit/.test(text)) return false;
  const limitsTools = /(?:route\/status\/skill|route.*status.*skill|omp_core_route_task.*omp_core_subagent_status|omp_core_subagent_status.*omp_core_route_task)/.test(text);
  const avoidsStatefulWork = /(?:do not modify|do not run tests|do not fork|不修改|不运行测试|不跑测试|不\s*fork)/.test(text);
  return limitsTools && avoidsStatefulWork;
}

function isWorkflowValidationRequest(text) {
  const mentionsOmpWorkflow = /(?:\bomp\b(?!-config)|mimo|advisor|主\s*agent|后台任务|漏用\s*skills?|不遵守\s*workflow|误挡|误判)/.test(text);
  const hasValidationAction = /(?:端到端|e2e|验证|测试|检查|审计|审查|核对|audit|check|review|inspect)/.test(text);
  const hasWorkflowTarget = /(?:workflow|工作流|门禁|gate|路由|route|routing|subagent|skills?|skill usage|skill\s*使用|技能使用|后台任务|主\s*agent|误挡|误判|漏用|不遵守)/.test(text);
  const validatesWorkflow = /(?:端到端|e2e|验证|测试|检查|审计|审查|核对|audit|check|review|inspect).*(?:workflow|工作流|门禁|gate|路由|route|routing|subagent|skills?|skill usage|skill\s*使用|技能使用|后台任务|主\s*agent|mimo|advisor)/.test(text)
    || /(?:workflow|工作流|门禁|gate|路由|route|routing|subagent|skills?|skill usage|skill\s*使用|技能使用|后台任务|主\s*agent|mimo|advisor).*(?:端到端|e2e|验证|测试|检查|审计|审查|核对|audit|check|review|inspect|误挡|误判|漏用|不遵守|合规|遵守|违规|compliance|adherence|violations?)/.test(text);
  const hasWorkflowReportWriting = isExplicitWritingAction(text)
    || /(?:review|check|proofread|copyedit).*(?:report|document|wording|grammar|clarity|style)/.test(text)
    || /(?:report|document|wording).*(?:grammar|clarity|wording|style)/.test(text);
  const hasGenericWorkflowCompliance = /(?:审计|审查|检查|核对|audit|check|review|inspect).*(?:workflow|工作流|路由|route|routing|skills?|skill usage|skill\s*使用|技能使用).*(?:合规|遵守|违规|compliance|adherence|violations?)/.test(text)
    || /(?:workflow|工作流|路由|route|routing|skills?|skill usage|skill\s*使用|技能使用).*(?:合规|遵守|违规|compliance|adherence|violations?).*(?:审计|审查|检查|核对|audit|check|review|inspect|report\s+violations?)/.test(text);
  const codeChangeText = text
    .replace(/(?:不要|别|不|无需|不用)\s*(?:修复|修改|更新|调整|优化|实现|重构|改|新增|创建|写|编写)\s*(?:代码|代码库|文件|脚本|项目|仓库)?/g, '')
    .replace(/(?:do not|don't|without|no need to)\s+(?:fix|update|modify|implement|refactor|create|add|write|change)(?:\s+(?:code|files?|to\s+(?:the\s+)?(?:repo|repository|project)|in\s+(?:the\s+)?(?:repo|repository|project)))?/g, '');
  const asksForCodeChange = /(?:修复|修改|更新|调整|优化|实现|重构|改代码|新增|创建|fix|update|modify|implement|refactor|create|add)/.test(codeChangeText);
  return !hasWorkflowReportWriting && ((mentionsOmpWorkflow && hasValidationAction && hasWorkflowTarget && validatesWorkflow) || hasGenericWorkflowCompliance) && !asksForCodeChange;
}

function isImplementationPlanForCodeChange(text) {
  if (/(?:不要|先不要|不)\s*(?:写代码|改代码|修改|实现|修复)|(?:do not|don't)\s+(?:write|modify|implement|fix|change)/.test(text)) return false;
  return /(?:先给|给我|制定|生成).*(?:计划|plan).*(?:修复|修改|实现|调整|优化|门禁|gate|路由|route|workflow|工作流|插件|plugin)/.test(text)
    || /(?:修复|修改|实现|调整|优化).*(?:这些|上述|当前)?.*(?:问题|门禁|gate|路由|route|workflow|工作流|插件|plugin).*(?:计划|plan)/.test(text);
}

function isLocalSmokeOrProcessRunRequest(text) {
  if (/(?:browser|playwright|e2e|coverage|mutation|覆盖率|浏览器|截图|回归测试)/.test(text)) return false;
  if (/(?:bug|bugs|缺陷).*(?:检查|审查|audit|find|hunt|定位|报告)/.test(text)) return false;
  if (/(?:测试代码|单元测试|集成测试|测试用例|测试文件|test files?|test cases?)/.test(text)) return false;

  const runsLocalProcess = /(?:后台启动|启动|运行|执行|跑|重跑|launch|start|run|execute|rerun).*(?:omp\s*进程|进程|process|插件加载|extension load|plugin load|smoke|烟测|本地.*验证|local.*verification)/.test(text)
    || /(?:omp\s*进程|进程|process|插件加载|extension load|plugin load).*(?:启动|运行|执行|launch|start|run|execute|smoke|烟测|验证)/.test(text)
    || /(?:后台启动|启动|运行|执行|跑|重跑|launch|start|run|execute|rerun).*(?:mimo|deepseek|advisor|model|模型).*(?:测试结果|验证结果|smoke|烟测)/.test(text);
  const asksForResultOnly = /(?:测试结果|验证结果|是否启动成功|只报告|报告结果|report(?:ed)? result|result only|smoke_done)/.test(text)
    || /(?:不要|不|别)\s*(?:改|修改|写入|审查|查找|检查).*(?:代码|bug|缺陷)/.test(text)
    || /(?:do not|don't|without|no)\s+(?:change|modify|write|audit|inspect|find).*(?:code|bugs?|defects?)/.test(text);

  return runsLocalProcess && asksForResultOnly;
}

function isAgenticRouteSkillProbeWithoutDispatch(text) {
  const mentionsAgenticDispatch = /(?:subagents?|agentic|并行|派发|委派|fork|dispatch|delegate)/.test(text);
  const suppressesDispatch = /(?:不要|别|不|无需|不用).{0,12}(?:真的)?(?:派发|委派|fork|dispatch|delegate|启动|运行|执行)/.test(text)
    || /(?:do not|don't|without|no need to).{0,24}(?:dispatch|delegate|fork|spawn|run)\s+(?:agents?|subagents?)/.test(text);
  const routeSkillGateProbe = /(?:路由|route|routing|router|governance|testing\s*gate|门禁|gate|skills?|skill\s*使用|技能使用)/.test(text);
  const asksToInspect = /(?:检查|审查|核对|验证|测试|check|review|inspect|probe|test)/.test(text);
  return mentionsAgenticDispatch && suppressesDispatch && routeSkillGateProbe && asksToInspect;
}

function isAgenticImplementationCoordinationRequest(text) {
  const withoutNegatedAudit = text
    .replace(/(?:do not|don't|not|without|no)\s+(?:ask(?:ing)?\s+for\s+)?(?:do\s+)?(?:a\s+)?(?:broad\s+)?bug[-\s]?audit/g, '')
    .replace(/(?:不要|不|别)[^，。；\n]*(?:bug\s*audit|bug\s*审计|缺陷审计|查\s*bug|找\s*bug)/g, '');
  const coordinatesAgents = /(?:parallelize|parallel|coordinate|delegate|fork|task subagents?|subagents?|agents?|agentic|并行|协调|委派|子代理|多代理)/.test(withoutNegatedAudit);
  const implementationAction = /(?:implement|implementation|fix|update|modify|refactor|add|create|build|实现|修复|修改|更新|重构|添加|新增)/.test(withoutNegatedAudit);
  const codeTarget = /(?:code|tests?|router|routing|governance|prompt|plugin|behavior|代码|测试|路由|插件|提示词|行为)/.test(withoutNegatedAudit);
  const positiveBugAudit = /(?:bug[-\s]?audit|find bugs?|inspect .*bugs?|audit .*bugs?|查\s*bug|找\s*bug|只报告|report findings)/.test(withoutNegatedAudit);
  return coordinatesAgents && implementationAction && codeTarget && !positiveBugAudit;
}

function asksToRunTestVerification(text) {
  if (/(?:不|不要|无需|不用)\s*(?:运行|执行|重跑).*(?:测试|e2e|playwright)/.test(text)) return false;
  if (/(?:do not|don't|without|no need to)\s+(?:run|execute|rerun).*(?:tests?|e2e|playwright)/.test(text)) return false;
  return /(?:运行|执行|重跑|重新运行).*(?:测试|e2e|playwright)/.test(text)
    || /(?:run|execute|rerun)\s+.*(?:tests?|e2e|playwright)/.test(text);
}

function isBugAuditRequest(text) {
  if (/(?:不要|不|别)\s*(?:找|查找|检查).*(?:bug|缺陷)/.test(text) || /(?:do not|don't|not)\s+(?:find|look for|check for).*(?:bugs?|defects?)/.test(text)) {
    return false;
  }
  const negatesFix = /(?:without|do not|don't|not)\s+(?:fixing|fix|modifying|modify|changing|change)/.test(text)
    || /(?:不要|先不要)(?:修复|修改|改代码|改)|不(?:修复|修改|改代码|改实现)/.test(text);
  const asksForChange = /(?:\b(?:fix|repair|resolve|implement|modify|refactor|update|optimize|improve|adjust)\b|修复|修改|修正|更新|实现|重构|开发|优化|改进|调整|补测试|写测试|add tests?|write tests?)/.test(text);
  if (asksForChange && !negatesFix && !isReportOnlyAudit(text)) {
    return false;
  }
  if (isExplicitWritingAction(text) && !/(?:do not edit|without editing|不要改|不改|只报告)/.test(text) && !/(?:测试|检查|排查|审查|扫描|查找|找|发现|运行|执行|test|run|check|find|audit|hunt|scan|inspect|investigate)/.test(text)) {
    return false;
  }
  if (/(?:不查|不找|不排查)\s*bug|no\s+bug\s+(?:hunt|audit|check)/.test(text)) {
    return false;
  }
  return /(?:check|find|audit|hunt|scan|test|run tests?|inspect|investigate)\s+.*(?:bugs?|defects?)/.test(text)
    || /(?:plugin load|extension load|smoke|插件加载|烟测).*(?:bug|bugs|缺陷).*(?:result only|只报告|只输出|只看结果|不改|不要改)/.test(text)
    || /(?:check|run|execute|运行|执行|检查).*(?:plugin load|extension load|smoke|插件加载|烟测).*(?:bug|bugs|缺陷).*(?:result only|只报告|只输出|只看结果|不改|不要改)/.test(text)
    || /\b(?:bugs?|defects?)\s+(?:audit|investigation|inspection|hunt|scan)\b/.test(text)
    || /(?:bugs?|defects?)\s+.*(?:audit|hunt|report|find|check|list)/.test(text)
    || /(?:测试|检查|排查|审查|扫描|查找|找|发现).*(?:bug|bugs|缺陷)/.test(text)
    || /(?:测试|检查|排查|审查|扫描|查找|找|发现).*(?:代码|项目|插件|实现|接口|workflow|工作流|门禁).*(?:问题)/.test(text)
    || /(?:测试|检查|排查|审查|扫描|查找|找|发现).*(?:问题).*(?:代码|项目|插件|实现|接口|workflow|工作流|门禁)/.test(text)
    || /(?:检查|审查|核对).*(?:fixtures?|fixture|api contract|contract|schema|字段).*(?:只报告|缺|一致|问题|风险)/.test(text)
    || /(?:检查|审查|核对).*(?:api contract|contract|schema).*(?:实现|implementation).*(?:一致|match|matches|matched)/.test(text)
    || /(?:检查|审查|核对).*(?:openapi|openapi spec|schema\.graphql|schema|resolver).*(?:实现|resolver|一致|match|缺|问题|风险)/.test(text)
    || /(?:检查|审查|核对).*(?:docker-compose|docker compose|helm values|k8s|kubernetes|manifest|配置文件|yml|yaml).*(?:只报告|缺|一致|问题|风险|端口|volume|required)/.test(text)
    || /(?:检查|审查|核对).*(?:classifier|router|route|prompt|提示词).*(?:误路由|错误路由|错误|诱导|问题|风险)/.test(text)
    || /(?:review|audit|inspect)\s+.*(?:pull request|pr|code paths?|maintainability|defects?|regressions?).*(?:do not edit|without editing|read-only|report)/.test(text)
    || /(?:bug|bugs|缺陷).*(?:审计|检查|报告|清单|定位)/.test(text);
}

function isFocusedDirectAuditRequest(text) {
  return /\b(?:focused|direct|single-agent|single agent|main-agent|main agent)\s+(?:bug\s+)?(?:audit|investigation|debugging|inspection)\b/.test(text)
    || /\b(?:do|run|handle|perform)\s+(?:the\s+)?(?:bug\s+)?(?:audit|investigation|inspection)\s+directly\b/.test(text)
    || /(?:plugin load|extension load|smoke|插件加载|烟测).*(?:bug|bugs|缺陷).*(?:result only|只报告|只输出|只看结果|不改|不要改)/.test(text)
    || /(?:check|run|execute|运行|执行|检查).*(?:plugin load|extension load|smoke|插件加载|烟测).*(?:bug|bugs|缺陷).*(?:result only|只报告|只输出|只看结果|不改|不要改)/.test(text)
    || /(?:直接|自己|主\s*agent|main\s*agent).*(?:审计|检查|排查|调查|找\s*bug|查\s*bug|bug\s*investigation)/.test(text)
    || /(?:聚焦|小范围|定向|局部|focused).*(?:审计|检查|排查|调查|bug|问题)/.test(text);
}

function isBugReportWritingRequest(text) {
  const writesBugReport = /(?:写|起草|撰写).*(?:bug\s*report|bug.*报告|问题报告|缺陷报告)/.test(text)
    || /(?:draft|write|revise|polish|edit|improve)\s+.*(?:bug report|defect report)/.test(text);
  if (!writesBugReport) return false;
  const cleaned = text
    .replace(/(?:不|不要|无需|不用)\s*(?:运行|执行|跑).*(?:测试|test|tests)/g, '')
    .replace(/(?:do not|don't|without|no need to)\s+(?:run|execute).*(?:tests?|testing)/g, '');
  return !/(?:测试|检查|排查|审查|扫描|查找|找|发现|test|run|check|find|audit|hunt|scan|inspect|investigate)/.test(cleaned);
}

function isCodeChangeRequest(text) {
  const withoutNegatedCodeWriting = text
    .replace(/(?:不要|别|不|无需|不用)\s*(?:写|编写|生成)\s*代码/g, '')
    .replace(/(?:不要|别|不|无需|不用)\s*(?:再)?(?:修改|改动|改|修复|修)\s*(?:文件|代码|实现)?/g, '')
    .replace(/(?:不要|别|不|无需|不用)\s*(?:审|审查|检查|看)\s*代码/g, '')
    .replace(/(?:不要|别|不|无需|不用)\s*写入\s*(?:文件|项目|代码库|仓库)?/g, '')
    .replace(/(?:do not|don't|without|no need to)\s+(?:write|generate)\s+code/g, '');
  const directTestArtifact = /(?:测试用例|测试文件|测试矩阵|边界测试|压力测试|\btests?\b|\btest cases?\b|\btest files?\b)/.test(withoutNegatedCodeWriting);
  const explicitCreatedCodeTarget = /(?:逻辑|代码|功能|接口|模块|实现|handling|logic|feature)/.test(withoutNegatedCodeWriting);
  if (/(?:api reference|api.*文档|api.*document|api.*docs?)/.test(text) && isExplicitWritingAction(text)) return false;
  if (isProseWritingOptimizationRequest(text)) return false;
  return /(?:修改|修复|修正|实现|重构|开发|优化|改)\s*(?:这个|当前|一下|本|这些|上述)?(?:插件|配置|逻辑|代码|功能|接口|hook|hooks|marketplace|workflow|工作流|门禁|gate|路由|提示词|页面|ui|router|route|workflowroute|fallback|回退逻辑|问题)/.test(withoutNegatedCodeWriting)
    || /(?:重构|优化|修改|修复|修正|调整).*(?:逻辑|代码|模块|函数|router|route|workflow|工作流|门禁|gate|路由|fork|subagent|误判|误挡|反复|运行失败|启动失败|warning|dev server|问题)/.test(withoutNegatedCodeWriting)
    || /(?:只改|只修改|改动|修改).*(?:一行|一处|少量|代码|文件)/.test(withoutNegatedCodeWriting)
    || /写.*(?:函数|代码|接口|功能|页面|模块|看板|dashboard|api|component|组件)/.test(withoutNegatedCodeWriting)
    || /(?:实现|implement)\s+[\w$]+(?:\.[\w$]+)*\s*\(/.test(withoutNegatedCodeWriting)
    || /(?:实现|开发).*(?:函数|方法|接口|功能|看板|dashboard|api|component|组件|ui|页面|page|slides|html|路由|hook|流程|router|route|workflowroute|fallback|回退|模式|mode)/.test(withoutNegatedCodeWriting)
    || (/(?:创建|生成).*(?:函数|方法|接口|功能|看板|dashboard|api|component|组件|ui|页面|page|slides|html|路由|hook|流程|router|route|workflowroute|fallback|回退)/.test(withoutNegatedCodeWriting)
      && (!directTestArtifact || explicitCreatedCodeTarget))
    || /(?:implement|build|develop|add|create)\s+.*(?:feature|fallback|handling|workflow|route|router|hook|logic)/.test(withoutNegatedCodeWriting)
    || /(?:fix|implement|update|modify|build)\s+.*(?:skill assignment|skill validation|governance prompt|prompt generation|task prompts?|final evidence|subagent skill)/.test(withoutNegatedCodeWriting)
    || /(?:fix|repair|resolve|update|modify)\s+.*(?:tool|workflow|gate|check|validator).*(?:failure|bug|error|regression)/.test(withoutNegatedCodeWriting)
    || /(?:新增|添加|创建|生成|更新|修改).*(?:mcp tool|tool 定义|makefile|target|schema\.graphql|graphql schema|openapi|terraform|module|resolver|subagent 模板).*(?:测试|验证|运行|接口|字段|定义|限制)?/.test(withoutNegatedCodeWriting)
    || /(?:fix|implement|modify|refactor|build|update)\s+(?:the\s+)?(?:plugin|config|configuration|logic|code|api|hook|hooks|marketplace|workflow|governance|prompt|router|route|validator|gate)/.test(withoutNegatedCodeWriting)
    || /(?:更新|修改|修复).*(?:classifier|router|route|prompt|提示词|模型白名单|白名单).*(?:代码|测试|路由|bug-audit|任务|规则|默认|优先)/.test(withoutNegatedCodeWriting)
    || /(?:更新|修改|修复|调整).*(?:classifier|smart\s*gate|smart-gate|gate|prompt|提示词).*(?:prompt|提示词|恢复循环|错误恢复|测试|路由|规则|gate)/.test(withoutNegatedCodeWriting)
    || /(?:修复|修改|更新).*(?:modelroles|model roles|配置|config|默认模型|模型|白名单|whitelist|classifier).*(?:错误|问题|bug|不同步|默认值|默认模型|代码|测试)/.test(withoutNegatedCodeWriting)
    || /(?:修复|修改|更新).*(?:config assets?|assets?|配置资产).*(?:打包|遗漏|缺失|错误|问题)/.test(withoutNegatedCodeWriting)
    || /(?:修复|解决).*(?:typescript|ts|编译|构建|build|compile|dockerfile|docker|镜像|image).*(?:错误|失败|问题)/.test(withoutNegatedCodeWriting)
    || /(?:修复|修改|更新|调整).*(?:docker-compose|docker compose|k8s|kubernetes|deployment|manifest|helm|端口映射|资源限制|env\.example|\.env\.example)/.test(withoutNegatedCodeWriting)
    || /(?:修复|解决|调整).*(?:移动端|前端|frontend|布局|按钮|文字溢出|溢出|css|样式)/.test(withoutNegatedCodeWriting)
    || /(?:解决|修复).*(?:merge conflict|冲突|合并冲突)/.test(withoutNegatedCodeWriting)
    || /(?:新增|添加|创建|生成).*(?:数据库|db|sql|migration|迁移).*(?:migration|迁移|脚本|文件|表|索引)/.test(withoutNegatedCodeWriting)
    || /(?:修改|更新|调整).*(?:sql|\\.sql|migration|迁移).*(?:索引|字段|表|语句|脚本|文件)/.test(withoutNegatedCodeWriting)
    || /(?:更新|修改|新增|添加).*(?:api contract|contract fixture|fixtures?|fixture|schema).*(?:测试|集成测试|字段|结构)/.test(withoutNegatedCodeWriting)
    || /(?:增加|新增|添加).*(?:环境变量|开关|配置项|选项|option|flag|environment variable|env var)/.test(withoutNegatedCodeWriting)
    || /(?:package\.json|npm script|npm scripts|scripts? 字段).*(?:增加|新增|添加|修改|更新|add|update|modify)/.test(withoutNegatedCodeWriting)
    || /(?:增加|新增|添加|修改|更新).*(?:package\.json|npm script|npm scripts|scripts? 字段)/.test(withoutNegatedCodeWriting)
    || /(?:格式化|format).*(?:模块|代码|文件|src|lib|plugins|router|component)/.test(withoutNegatedCodeWriting)
    || /(?:升级|更新).*(?:npm|依赖|dependency|dependencies|package|packages|breaking changes)/.test(withoutNegatedCodeWriting)
    || /(?:migrate|migration|迁移).*(?:typescript|ts|js|javascript|模块|代码|项目|文件)/.test(withoutNegatedCodeWriting)
    || /(?:新增|添加|创建|生成).*(?:插件|命令|agent|skill|模板|脚手架|plugin|command|template|scaffold)/.test(withoutNegatedCodeWriting)
    || /(?:删除|移除|清理).*(?:旧|废弃|legacy|classifier|fallback|逻辑|代码|功能|测试|文档|临时文件|生成的临时文件|生成文件|\.gitignore)/.test(withoutNegatedCodeWriting)
    || /(?:修改|修复|更新|优化|改).*(?:错误提示|提示文案|error message|报错文案)/.test(withoutNegatedCodeWriting)
    || /(?:错误提示|提示文案|error message|报错文案).*(?:改|修改|更新|优化|清楚|准确)/.test(withoutNegatedCodeWriting)
    || /(?:优化|降低|减少).*(?:advisor|调用频率|成本|cost|benchmark|热点函数)/.test(withoutNegatedCodeWriting)
    || isScopedCodeEditRequest(withoutNegatedCodeWriting);
}

function isProseWritingOptimizationRequest(text) {
  const proseTarget = /(?:中文写作|英文写作|行文|文风|文稿|正文|段落|章节|第一章|第\s*[一二三四五六七八九十\d]+\s*章|论文|摘要|引言|相关工作|表达|表述|措辞|叙述|语言)/.test(text);
  if (!proseTarget) return false;
  return /(?:优化|改进|调整|修改|修订|润色|改写|让|使).{0,24}(?:写作|行文|表达|表述|措辞|逻辑|衔接|顺滑|通畅|流畅|自然|清楚|连贯)/.test(text)
    || /(?:写作|行文|表达|表述|措辞|逻辑|衔接).{0,24}(?:顺滑|通畅|流畅|自然|清楚|连贯|更好|更通顺)/.test(text);
}

function isScopedCodeEditRequest(text) {
  const hasEditAction = /(?:修改|修复|改动|调整|替换|更新|新增|添加|创建|生成|翻译|润色|补全|只改|只修改|change|edit|modify|update|replace|add|create|generate|translate|polish)\b/.test(text)
    || /(?:修改|修复|改动|调整|替换|更新|新增|添加|创建|生成|翻译|润色|补全|只改|只修改)/.test(text);
  if (!hasEditAction) return false;

  return /(?:^|[\s"'`(])(?:src|lib|app|packages|plugins|extensions|test|tests)\/[^\s"'`)]+/.test(text)
    || /\b[\w.-]+\.(?:js|mjs|cjs|ts|tsx|jsx|py|go|rs|java|kt|swift|cs|cpp|c|h|hpp|rb|php|sh|sql|yml|yaml|json|toml|md|tex|bib|ipynb)\b/.test(text)
    || /(?:^|[\s"'`(])(?:notebooks|scripts|migrations|locales|fixtures)\/[^\s"'`)]+/.test(text)
    || /(?:^|[\s"'`(])\.env\.example\b/.test(text)
    || /(?:第\s*)?\d+\s*(?:行|line)|line\s+\d+/.test(text)
    || includesAny(text, ['函数', '方法', '变量', '类', '模块', '代码块', 'function', 'method', 'variable', 'class', 'module']);
}

function isReleaseRequest(text) {
  if (/(?:dry[-\s]?run|试运行).*(?:发布|release|publish)|(?:发布|release|publish).*(?:dry[-\s]?run|试运行)/.test(text)) return true;
  if (includesAny(text, noReleaseTerms)) return false;
  return (includesAny(text, releaseTerms) && includesAny(text, ['github', 'marketplace', '插件', '版本', 'plugin', 'release']))
    || /(?:^|[，。；;]\s*)(?:只)?(?:推送|提交)(?:当前提交|当前改动|这些改动|本次改动|改动)/.test(text)
    || /(?:push|commit)\s+(?:the\s+)?(?:current\s+)?(?:commit|changes?)/.test(text)
    || /(?:push).*(?:branch|github).*(?:create|open).*(?:pr|pull request)/.test(text)
    || /(?:create|open).*(?:pr|pull request).*(?:branch|github|push)/.test(text)
    || /(?:create|cut|prepare|ship)\s+(?:a\s+)?release/.test(text)
    || /\bship\s+(?:the\s+)?(?:plugin\s+)?release/.test(text)
    || /\bupgrade\s+\S+@\S+/.test(text)
    || /\brelease\s+(?:the\s+)?(?:current|plugin|version)/.test(text)
    || /(?:plugin|marketplace)\s+upgrade/.test(text);
}

function isConfigAssetRequest(text) {
  if (isWorkflowValidationRequest(text)) return false;
  const textWithoutNegatedConfigAssets = text.replace(/(?:不要|不|别|无需|不用)[^，。；！\n]*(?:config assets?|配置资产)/g, '');
  if (textWithoutNegatedConfigAssets !== text && !/(?:omp-config|marketplace|packaged|打包|配置资产|config doctor)/.test(textWithoutNegatedConfigAssets)) return false;
  const hasExplicitConfigAsset = includesAny(text, ['omp-config', 'config asset', 'config assets', 'asset paths', 'config templates', 'config doctor', '配置资产', '配置模板', 'modelroles', 'model roles', 'provider 配置', 'provider config']);
  const hasPackagedConfigInventory = includesAny(text, ['打包', 'packaged', 'marketplace', '模板', 'templates', 'hooks', 'hook', 'assets', 'asset'])
    && (includesAny(text, ['config', 'omp-config', '配置', '资产', '模板', '打包']) || /packaged\s+(?:hooks?|agents?|skills?|templates?|assets?)/.test(text));
  const listsConfigInventory = textWithoutNegatedConfigAssets === text
    && /(?:列出|查看|检查|核对).*(?:subagent|subagents|agent|agents|技能|skills?|modelroles|model roles|provider).*(?:清单|可用|当前|齐全|完整|packaged|打包|配置)/.test(text)
    && (hasExplicitConfigAsset || hasPackagedConfigInventory || /(?:config|omp-config|配置|marketplace|packaged|打包)/.test(text));
  return (hasExplicitConfigAsset || hasPackagedConfigInventory)
    && includesAny(text, ['config', 'assets', 'asset', 'hooks', 'hook', 'agents', 'templates', 'omp-config', 'marketplace', '配置', '打包', '模板', '清单', 'modelroles', 'provider'])
    || /(?:运行|执行|检查|排查).*(?:config doctor|doctor).*(?:hooks?|assets?|配置|资产|齐全|完整)/.test(text)
    || listsConfigInventory
    || /(?:检查|核对|列出|查看|排查).*(?:marketplace catalog|marketplace|catalog).*(?:版本|version|插件|plugin|一致|同步)/.test(text);
}

function isFactCheckRequest(text) {
  return includesAny(text, factCheckTerms)
    || /(?:检查|审查|核对|验证|核验|查证).{0,20}(?:事实|真实性|引用|citation|claim|数据|数字|年份|出处|来源|证据)/.test(text)
    || /(?:fact|factual|claim|citation).{0,30}(?:check|verify|verification|review|audit|authenticity)/.test(text);
}

function isGateValidatorStatusReport(text) {
  const mentionsGateValidator = /(?:gate|门禁).*(?:validator|validation|验证器|验证工具|状态追踪|state tracking)/.test(text)
    || /(?:validator|validation|验证器|验证工具|状态追踪|state tracking).*(?:gate|门禁)/.test(text);
  const mentionsSkillEvidence = /(?:skills?_loaded|loaded skills|skills?\s+loaded|missing loaded skills|gate complete|subagent_usage|skill\s*加载|技能加载)/.test(text)
    || /(?:subagent|子代理).*(?:skills?|技能)/.test(text)
    || /(?:skills?|技能).*(?:subagent|子代理)/.test(text);
  const reportMarker = /(?:问题说明|问题描述|事件经过|证据|结论|已知.*bug|known.*bug|报告已交付|审计完成|无更多工作|所有.*subagent.*完成|验证工具无法识别|继续尝试.*无意义|gate.*open|显示为.*open|state tracking bug)/.test(text);

  return mentionsGateValidator && reportMarker && (
    mentionsSkillEvidence
    || /(?:审计完成|报告已交付|无更多工作|所有.*subagent.*完成|已知.*bug|known.*bug|gate.*open|显示为.*open)/.test(text)
  );
}

function isSecurityAuditOrFixRequest(text) {
  if (/(?:不要|不|别).*(?:安全审计|代码安全审计|审代码|审查代码)/.test(text)) return false;
  if (/(?:do not|don't|without|no need to)\s+(?:audit|review|scan|inspect).*(?:code|dependencies|dependency|security)?/.test(text)) return false;
  if (isSecurityWritingArtifact(text)) return false;
  if (isKnowledgeWorkWithoutWritingArtifact(text) && /(?:文档|docs?|documentation|链接|官方文档|lookup|look up)/.test(text)) return false;
  return /(?:审查|检查|扫描|修复|收紧|audit|scan|fix|harden|漏洞|越权|权限|permissions|auth bypass|high severity|危险命令|dangerous command|security risk|安全风险)/.test(text);
}

function isSecurityWritingArtifact(text) {
  return /(?:写|起草|撰写).*(?:安全公告|隐私政策|license.*说明|合规说明|法务|memo|policy|announcement)/.test(text)
    || /(?:draft|write|revise|polish|edit|improve).*(?:security announcement|privacy policy|license compliance memo|license memo|compliance memo|policy draft|policy|memo|announcement)/.test(text)
    || /(?:安全说明|隐私政策|安全公告|安全审查报告|安全报告|合规说明|合规报告|许可证说明|license.*说明).*(?:表达|逻辑|措辞|润色|改写|修订|文案|语气|自然|清楚|准确)/.test(text)
    || /(?:润色|改写|修订|修改|检查|审查|核对).*(?:安全说明|隐私政策|安全公告|安全审查报告|安全报告|合规说明|合规报告|许可证说明|license.*说明|安全.*文案|隐私.*文案|合规.*文案)/.test(text)
    || /(?:检查|审查|核对).*(?:安全|隐私|合规|license|许可证).*(?:文案|公告|说明|政策|memo|报告|段落|句子|表述|措辞|语气|表达|文本|文字|内容|材料).*(?:清楚|准确|自然|语气|表达|措辞|逻辑)/.test(text)
    || /(?:review|check|proofread|copyedit|revise|polish|edit|improve).*(?:security|privacy|compliance|license|safety).*(?:announcement|policy|memo|report|paragraph|sentence|wording|copy|text|draft|document).*(?:wording|tone|style|grammar|clarity|clear|accurate|natural|logic)/.test(text)
    || /(?:review|check|proofread|copyedit|revise|polish|edit|improve).*(?:announcement|policy|memo|report|paragraph|sentence|wording|copy|text|draft|document).*(?:security|privacy|compliance|license|safety)/.test(text);
}

function isDiagnosisOnlyRequest(text, asksNoCodeChange) {
  if (!includesAny(text, diagnosisTerms)) return false;
  return asksNoCodeChange
    || includesAny(text, ['原因', '为什么', 'why', 'root cause', 'what caused', '是什么导致', '是什么原因'])
    || /\b(?:diagnose|investigate)\b.*\b(?:failure|failing|failed|error|warning|root cause|cause)\b/.test(text);
}

function isKnowledgeWorkWithoutWritingArtifact(text) {
  if (!includesAny(text, knowledgeWorkTerms)) return false;
  if (/(?:失败|失败原因|没有通过|未通过|failed|failure|failing|error|warning)/.test(text)) return false;
  if (isExplicitWritingAction(text)) return false;
  if (isCodeChangeRequest(text) || isTestingRequest(text)) return false;
  return includesAny(text, knowledgeWorkActionTerms);
}

function isExplicitWritingAction(text) {
  const cleaned = text
    .replace(/写法/g, '')
    .replace(/(?:不要|别|不|无需|不用)\s*(?:写|编写|生成)\s*代码/g, '')
    .replace(/(?:不要|别|不|无需|不用)\s*写\s*(?:文件|脚本|项目|代码库|仓库)?/g, '')
    .replace(/(?:不要|别|不|无需|不用)\s*写入\s*(?:文件|项目|代码库|仓库)?/g, '')
    .replace(/(?:不要|别|不|无需|不用)\s*(?:写|撰写|生成)\s*正文/g, '')
    .replace(/(?:不要|别|不|无需|不用)\s*(?:写|撰写|生成).*(?:正文|综述)/g, '')
    .replace(/(?:do not|don't|without|no need to)\s+(?:write|generate)(?:\s+(?:code|files?|to\s+(?:the\s+)?(?:repo|repository|project)|in\s+(?:the\s+)?(?:repo|repository|project)))?/g, '');
  return /(?:写|起草|撰写|润色|改写|修订|修饰|改得|改成|翻译|draft|write|revise|polish|edit|improve)\b/.test(cleaned)
    || /(?:写|起草|撰写|润色|改写|修订|修饰|改得|改成|翻译|翻译腔|ai 味|表达|风格|表述|措辞)/.test(cleaned);
}

function isStandaloneCommandOrSnippetRequest(text) {
  if (!/(?:不写|不写入|不要写|不要写入|不改|不修改|不写文件|不写脚本)/.test(text)) return false;
  return /(?:one-liner|cron|pg_dump|命令|表达式|脚本片段|代码片段|sql 查询|sql query)/.test(text);
}

function isReportOnlyAudit(text) {
  return /(?:只|仅)(?:报告|输出|列出|列)\b/.test(text)
    || /(?:只|仅).*(?:报告|清单|结果|问题)/.test(text);
}

function includesAny(text, terms) {
  return terms.some((term) => hasTerm(text, term));
}

function hasTerm(text, term) {
  if (hasNonAscii(term)) return text.includes(term);
  if (/^[a-z0-9][a-z0-9\s_-]*[a-z0-9]$/i.test(term)) return hasWholeWord(text, term);
  return text.includes(term);
}

function hasWholeWord(text, term) {
  const pattern = escapeRegExp(term).replace(/[\s_-]+/g, '[\\s_-]+');
  return new RegExp(`(^|[^a-z0-9_])${pattern}([^a-z0-9_]|$)`).test(text);
}

function hasNonAscii(value) {
  return /[^\x00-\x7F]/.test(value);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isConceptOnlyQuestion(text) {
  if (!/^(?:what\s+(?:is|are|does|do)\b|who\s+(?:is|was)\b|where\s+(?:is|are)\b|when\s+(?:is|was)\b|define\b|explain\b.*\b(?:means?|is|are)\b|什么是|.*是什么[。？?]?$|.*是什么意思[。？?]?$)/.test(text)) {
    return false;
  }
  return !/(?:fix|implement|modify|refactor|build|update|write|draft|revise|polish|review|check|run|execute|publish|push|upgrade|diagnos|debug|investigate|analy[sz]e|修复|实现|修改|检查|分析|排查|运行|执行|发布|推送|升级|写|润色|改写|审查)/.test(text);
}

function isSecurityConceptQuestion(text) {
  return includesAny(text, [
    'xss',
    'ssrf',
    'owasp',
    'path traversal',
    'command injection',
    'auth bypass',
    'vulnerability',
    'vulnerabilities',
    '漏洞',
    '注入',
    '路径穿越',
  ]);
}

function isSecurityConceptOnlyRequest(text) {
  if (!isSecurityConceptQuestion(text)) return false;
  const cleaned = text
    .replace(/(?:先)?(?:不|不要|无需|不用)\s*(?:审查|检查|看|分析).*(?:项目代码|代码|配置|文件|仓库)/g, '')
    .replace(/(?:do not|don't|without|no need to)\s+(?:review|check|audit|inspect|analyze).*(?:code|config|files?|repo)/g, '')
    .replace(/\b(?:no|without)\s+(?:a\s+)?(?:code|config|files?|repo|repository|project)\s+(?:review|check|audit|inspection|analysis)\b/g, '');
  if (!/(?:是什么|是什么意思|解释|说明|define|explain|what is|what are)/.test(cleaned)) return false;
  return !/(?:审查|检查|分析|audit|review|inspect|check|handler|api|代码|配置|文件|secret|auth|权限|风险)/.test(cleaned);
}

function unknownRoute(source = 'natural-language') {
  return decorateWorkflowRoute({
    intent: 'unknown',
    agent: null,
    requiredSkills: [],
    requiredTools: [],
    requiredSubagents: [],
    source,
  }, { workflowRoute: 'agentic.simple' });
}
