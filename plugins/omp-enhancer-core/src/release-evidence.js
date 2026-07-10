import { createHash } from 'node:crypto';
import { posix as path } from 'node:path';

const SCHEMA_VERSION = 1;
const SHELL_TOOL = /^(?:bash|shell|terminal|exec|exec_command|run|run_command|command|functions_(?:bash|shell|terminal|exec|exec_command|run|run_command|command))$/i;
const HEX_REVISION = '[0-9a-f]{3,64}';
const SEMVER = '[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?';

/**
 * Convert a successful external mutation into a minimal, serializable record.
 * The record contains only a one-way target fingerprint and the public release
 * value that a later observation must prove. Raw commands and output are never
 * retained.
 */
export function createReleaseMutationRecord(input = {}) {
  const evidence = normalizeEvidenceInput(input);
  if (!evidence || !supportsReleaseAction(evidence)) return null;

  return parseGitPush(evidence)
    ?? parseNpmPublish(evidence)
    ?? parsePluginUpgrade(evidence)
    ?? parseDockerPush(evidence)
    ?? parseGhReleaseCreate(evidence)
    ?? parseKubectlRollout(evidence)
    ?? parseHelmUpgrade(evidence)
    ?? null;
}

/**
 * Return whether a mutation has a deterministic evidence contract before it is
 * allowed to run. Unsupported external writes must be stopped at this boundary;
 * otherwise a successful mutation could leave a completion gate impossible to
 * satisfy.
 */
export function supportsReleaseMutation(input = {}) {
  const action = normalizeActionInput(input);
  return Boolean(action && supportsReleaseAction(action));
}

/**
 * Inspect a trusted user prompt without relying on a model-proposed command.
 * Only one complete, non-conflicting supported target is eligible for a
 * mechanical command repair; every other state requires user clarification.
 */
export function analyzeReleasePromptContract(prompt = '') {
  const text = String(prompt).trim();
  if (!text) return promptContractResult('unsupported');
  const candidates = [
    analyzeGitPrompt(text),
    analyzeNpmPrompt(text),
    analyzeDockerPrompt(text),
    analyzeGithubReleasePrompt(text),
    analyzeKubectlPrompt(text),
    analyzeHelmPrompt(text),
    analyzeOmpPluginPrompt(text),
  ].filter(Boolean);
  if (candidates.some(({ status }) => status === 'conflicting')) {
    const kinds = [...new Set(candidates.map(({ kind }) => kind))];
    return promptContractResult('conflicting', kinds.length === 1 ? kinds[0] : null);
  }
  const complete = candidates.filter(({ status }) => status === 'complete');
  if (complete.length === 1) return promptContractResult('complete', complete[0].kind, complete[0].target);
  if (complete.length > 1) return promptContractResult('conflicting');
  if (candidates.length) {
    const kinds = [...new Set(candidates.map(({ kind }) => kind))];
    const status = candidates.every((candidate) => candidate.status === 'unsupported') ? 'unsupported' : 'incomplete';
    return promptContractResult(status, kinds.length === 1 ? kinds[0] : null);
  }
  return promptContractResult('unsupported');
}

/**
 * Prove that the concrete external target was named by the trusted user
 * request. A generic release intent is insufficient: otherwise a model could
 * choose a different repository, package, registry, cluster, or image while
 * still producing internally consistent mutation and verification evidence.
 */
export function releaseMutationMatchesPrompt(input = {}, prompt = '') {
  const action = normalizeActionInput(input);
  const contract = action && releaseActionContract(action);
  if (!contract) return false;
  if (contract.kind === 'omp-plugin-upgrade' && promptNamesExplicitVersion(prompt)) return false;

  const clauses = String(prompt)
    .split(/[\n;；。!?！？]+|\.(?=\s+(?:[A-Z一-鿿]|$))/)
    .map((clause) => clause.trim())
    .filter(Boolean);
  const normalizedClauses = clauses.map(normalizeAffirmativeReleaseClause);
  const hasAuthorizedAction = normalizedClauses.some((clause) => (
    releaseActionNamedInClause(contract.kind, clause)
    && !releaseActionNegatedInClause(clause)
  ));
  if (!hasAuthorizedAction) return false;
  const requirements = releaseAuthorizationRequirements(contract);
  if (normalizedClauses.some((clause) => (
    releaseActionNamedInClause(contract.kind, clause)
    && releaseActionNegatedInClause(clause)
    && requirements.every((value) => requirementAppearsExactly(clause, value))
  ))) return false;

  // Analyze only non-negated clauses, while retaining actionless structured
  // target lines such as `Repository:` and `Commit:`. This gives prompt target
  // comparison one canonical representation and prevents URL spelling details
  // (for example a registry trailing slash or a GitHub https scheme) from
  // drifting away from the command parser's contract.
  const affirmativePrompt = normalizedClauses
    .filter((clause) => !releaseActionNegatedInClause(clause))
    .join('\n');
  const promptContract = analyzeReleasePromptContract(affirmativePrompt);
  return promptContract.status === 'complete'
    && promptContract.kind === contract.kind
    && releasePromptTargetEquals(contract.kind, contract.target, promptContract.target);
}

/**
 * Verify a mutation record using a later, independent read-only observation.
 * An unrelated target, ref, version, digest, namespace, or release never
 * satisfies the record, even when its tool envelope reports success.
 */
export function verifyReleaseMutation(record, input = {}) {
  if (!isReleaseRecord(record)) return false;
  const evidence = normalizeEvidenceInput(input);
  if (!evidence) return false;

  switch (record.kind) {
    case 'git-push':
      return verifyGitPush(record, evidence);
    case 'npm-publish':
      return verifyNpmPublish(record, evidence);
    case 'omp-plugin-upgrade':
      return verifyPluginUpgrade(record, evidence);
    case 'docker-push':
      return verifyDockerPush(record, evidence);
    case 'gh-release':
      return verifyGhRelease(record, evidence);
    case 'kubectl-rollout':
      return verifyKubectlRollout(record, evidence);
    case 'helm-upgrade':
      return verifyHelmUpgrade(record, evidence);
    default:
      return false;
  }
}

function normalizeActionInput(input) {
  if (input?.masked === true || input?.dryRun === true) return null;
  if (!SHELL_TOOL.test(canonicalReleaseToolName(input?.toolName))) return null;

  const command = String(input?.command ?? '').trim();
  const cwd = normalizeCwd(input?.cwd);
  if (!command || !cwd) return null;
  if (/(?:^|\s)--dry-?run(?:=\S+)?(?:\s|$)|^git\s+push\b[^\n]*(?:^|\s)-n(?:\s|$)/i.test(command)) return null;

  const tokens = tokenizeSimpleCommand(command);
  if (!tokens?.length) return null;
  return {
    tokens,
    cwd,
    npmManifest: normalizeTrustedNpmManifest(input?.npmManifest, cwd),
  };
}

function normalizeEvidenceInput(input) {
  if (input?.successful !== true) return null;
  const action = normalizeActionInput(input);
  const resultText = String(input?.resultText ?? '');
  if (!action || !resultText || resultText.length > 1_000_000 || hasExplicitFailureLine(resultText)) return null;
  return { ...action, resultText };
}

function supportsReleaseAction(action) {
  return Boolean(releaseActionContract(action));
}

function releaseActionContract({ tokens, cwd, npmManifest }) {
  const candidates = [
    ['git-push', parseGitPushTarget(tokens)],
    ['npm-publish', parseNpmPublishTarget(tokens, cwd, npmManifest)],
    ['omp-plugin-upgrade', parsePluginUpgradeTarget(tokens)],
    ['docker-push', parseDockerPushTarget(tokens)],
    ['gh-release', parseGhReleaseTarget(tokens)],
    ['kubectl-rollout', parseKubectlRolloutTarget(tokens)],
    ['helm-upgrade', parseHelmUpgradeTarget(tokens)],
  ];
  const [kind, target] = candidates.find(([, value]) => value) ?? [];
  return target ? { kind, target } : null;
}

function releaseAuthorizationRequirements({ kind, target }) {
  switch (kind) {
    case 'git-push':
      return [target.remote, target.sourceName, target.targetRef];
    case 'npm-publish':
      return [`${target.packageName}@${target.version}`, target.registry, `tag ${target.tag}`];
    case 'omp-plugin-upgrade':
      return [target.pluginId, target.scope];
    case 'docker-push':
      return [target.image];
    case 'gh-release':
      return [target.repo, target.tag, ...(target.prerelease ? ['prerelease'] : []), ...(target.targetCommitish ? [target.targetCommitish] : [])];
    case 'kubectl-rollout':
      return [
        `deployment/${target.deployment}`,
        target.namespace,
        target.context,
        ...target.containerImages.map(({ container, image }) => `${container}=${image}`),
      ];
    case 'helm-upgrade':
      return [target.release, target.chart, target.namespace, target.context, ...(target.chartVersion ? [target.chartVersion] : [])];
    default:
      return [];
  }
}

function releaseActionNamedInClause(kind, clause) {
  const patterns = {
    'git-push': /(?:\bgit\s+push\b|\bpush\b|推送)/i,
    'npm-publish': /(?:\bnpm\s+publish\b|\bpublish\b|发布)/i,
    'omp-plugin-upgrade': /(?:\bomp\s+plugin\s+upgrade\b|\bupgrade\b|升级)/i,
    'docker-push': /(?:\bdocker\s+push\b|\bpush\b|推送)/i,
    'gh-release': /(?:\bgh\s+release\s+create\b|\b(?:pre)?release\b|发布)/i,
    'kubectl-rollout': /(?:\bkubectl\s+set\s+image\b|\bdeploy\b|\brollout\b|部署|更新镜像)/i,
    'helm-upgrade': /(?:\bhelm\s+upgrade\b|\bupgrade\b|\bdeploy\b|升级|部署)/i,
  };
  return patterns[kind]?.test(clause) === true;
}

function releaseActionNegatedInClause(clause) {
  return /(?:\b(?:do not|don't|dont|never|without)\b|不要|别|禁止|不得)[^\n;；。!?！？]{0,48}(?:\b(?:push|publish|deploy|release|upgrade)\b|推送|发布|部署|升级)/i.test(clause);
}

function normalizeAffirmativeReleaseClause(clause) {
  return String(clause)
    .replace(/\b(?:do not|don't|dont|never)\s+hesitate\s+to\s+(push|publish|deploy|release|upgrade)\b/gi, '$1')
    .replace(
      /\b(?:do not|don't|dont|never|no need to)\s+(?:avoid|skip)\s+(pushing|publishing|deploying|releasing|upgrading)\b/gi,
      (_match, action) => ({ pushing: 'push', publishing: 'publish', deploying: 'deploy', releasing: 'release', upgrading: 'upgrade' })[action.toLowerCase()],
    )
    .replace(/(?:不要|别|不能|不得)\s*(?:犹豫|跳过|避免)(?:\s*[，,])?\s*(推送|发布|部署|升级)/g, '$1');
}

function requirementAppearsExactly(text, requirement) {
  const source = String(text).toLowerCase();
  const expected = String(requirement).trim().toLowerCase();
  if (!expected) return false;
  let offset = 0;
  while (offset <= source.length - expected.length) {
    const index = source.indexOf(expected, offset);
    if (index < 0) return false;
    const before = index > 0 ? source[index - 1] : '';
    const afterIndex = index + expected.length;
    const after = source[afterIndex] ?? '';
    const beforeBoundary = !before || !/[a-z0-9._~:/@+=-]/.test(before)
      || before === '.' && (index < 2 || /\s/.test(source[index - 2]));
    const afterBoundary = !after || !/[a-z0-9._~:/@+=-]/.test(after)
      || after === '.' && (!source[afterIndex + 1] || /\s/.test(source[afterIndex + 1]));
    if (beforeBoundary && afterBoundary) return true;
    offset = index + 1;
  }
  return false;
}

function promptNamesExplicitVersion(prompt) {
  return new RegExp(`(?:\\bversion\\s+|\\bto\\s+v?|版本\\s*)${SEMVER}\\b`, 'i').test(String(prompt));
}

function analyzeGitPrompt(text) {
  if (!/(?:\bgit\s+push\b|\bpush\b|推送)/i.test(text) || !/(?:\.git\b|refs\/(?:heads|tags)\/)/i.test(text)) return null;
  const remotes = uniqueMatches(text, /https:\/\/[A-Za-z0-9.-]+(?:\/[A-Za-z0-9._~-]+)+\.git\b|git@[A-Za-z0-9.-]+:[A-Za-z0-9._\/-]+\.git\b/gi);
  const revisions = uniqueMatches(text, /\b[0-9a-f]{40}(?:[0-9a-f]{24})?\b/gi, (value) => value.toLowerCase());
  const refs = uniqueMatches(text, /refs\/(?:heads|tags)\/[A-Za-z0-9._\/-]*[A-Za-z0-9_\/-]/gi);
  const state = targetFieldState([remotes, revisions, refs]);
  if (state !== 'complete') return { kind: 'git-push', status: state };
  const ref = normalizeGitTargetRef(refs[0]);
  return ref ? {
    kind: 'git-push',
    status: 'complete',
    target: { remote: remotes[0], sourceName: revisions[0], ...ref },
  } : { kind: 'git-push', status: 'incomplete' };
}

function analyzeNpmPrompt(text) {
  if (!/(?:\bnpm\s+publish\b|\bpublish\b|发布)/i.test(text) || /(?:\b(?:pre)?release\b|gh\s+release)/i.test(text)) return null;
  const packagePattern = new RegExp(`((?:@[a-z0-9_.~-]+/)?[a-z0-9_.~-]+)@(${SEMVER})(?=$|[^a-z0-9.+-])`, 'gi');
  const packages = uniqueMatches(text, packagePattern, (_value, match) => `${match[1].toLowerCase()}@${match[2]}`);
  const registries = extractHttpsUrls(text).map(normalizeHttpsEndpoint).filter(Boolean);
  const tags = uniqueMatches(text, /\b(?:dist-?tag|tag)\s*(?::|=|is\s+|to\s+)?([A-Za-z][A-Za-z0-9._-]{0,127})\b/gi, (_value, match) => match[1]);
  const state = targetFieldState([packages, registries, tags]);
  if (state !== 'complete') return { kind: 'npm-publish', status: state };
  const parsed = parsePackageVersion(packages[0]);
  return parsed ? {
    kind: 'npm-publish', status: 'complete',
    target: { ...parsed, registry: registries[0], tag: tags[0] },
  } : { kind: 'npm-publish', status: 'incomplete' };
}

function analyzeDockerPrompt(text) {
  if (!/(?:\bdocker\s+push\b|\bpush\b|推送)/i.test(text)) return null;
  const images = uniqueMatches(
    text,
    /(?:localhost|[A-Za-z0-9.-]+\.[A-Za-z0-9.-]+|[A-Za-z0-9.-]+:\d+)\/[A-Za-z0-9._\/-]+:[A-Za-z0-9._-]+/gi,
    (value) => value.replace(/[.,;!?]+$/, ''),
  ).filter((image) => hasExplicitImageTag(image) && hasExplicitRegistry(image));
  if (!images.length && !/\bdocker\s+push\b/i.test(text)) return null;
  const state = targetFieldState([images]);
  return state === 'complete'
    ? { kind: 'docker-push', status: 'complete', target: { image: images[0] } }
    : { kind: 'docker-push', status: state };
}

function analyzeGithubReleasePrompt(text) {
  if (!/(?:\bgh\s+release\b|\bcreate\b.{0,20}\b(?:pre)?release\b|创建.{0,12}发布)/i.test(text)) return null;
  const repos = uniqueMatches(text, /github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/gi, (value) => value.replace(/[.,;!?]+$/, ''));
  const tags = uniqueMatches(text, new RegExp(`\\b(?:pre)?release\\s+(v?${SEMVER})\\b|\\btag\\s+(v?${SEMVER})\\b`, 'gi'), (_value, match) => match[1] ?? match[2]);
  const targets = uniqueMatches(text, new RegExp(`\\btarget(?:ing)?\\s+([0-9a-f]{40}(?:[0-9a-f]{24})?)\\b`, 'gi'), (_value, match) => match[1].toLowerCase());
  const state = targetFieldState([repos, tags]);
  if (state !== 'complete' || targets.length > 1) return { kind: 'gh-release', status: targets.length > 1 ? 'conflicting' : state };
  return {
    kind: 'gh-release', status: 'complete',
    target: {
      repo: repos[0], tag: tags[0], prerelease: /\bprerelease\b/i.test(text),
      ...(targets[0] ? { targetCommitish: targets[0] } : {}),
    },
  };
}

function analyzeKubectlPrompt(text) {
  if (!/(?:kubectl\s+set\s+image|deployment\/|更新镜像)/i.test(text)) return null;
  const deployments = uniqueMatches(text, /deployment\/[a-z0-9](?:[-a-z0-9.]*[a-z0-9])?/gi, (value) => value.slice('deployment/'.length));
  const namespaces = uniqueMatches(text, /\b(?:namespace|in)\s+([A-Za-z0-9._-]+)\b/gi, (_value, match) => match[1]);
  const contexts = uniqueMatches(text, /\b(?:context|on)\s+([A-Za-z0-9._-]+)\b/gi, (_value, match) => match[1]);
  const assignments = uniqueMatches(text, /\b([a-z0-9](?:[-a-z0-9._]*))=([^\s,;]+)/gi, (_value, match) => `${match[1]}=${match[2].replace(/[.!?]+$/, '')}`);
  const state = targetFieldState([deployments, namespaces, contexts, assignments]);
  if (state !== 'complete' && assignments.length > 1 && deployments.length === 1 && namespaces.length === 1 && contexts.length === 1) {
    // Multiple container assignments are expected and are not conflicting.
    return {
      kind: 'kubectl-rollout', status: 'complete',
      target: kubectlPromptTarget(deployments[0], namespaces[0], contexts[0], assignments),
    };
  }
  return state === 'complete'
    ? { kind: 'kubectl-rollout', status: 'complete', target: kubectlPromptTarget(deployments[0], namespaces[0], contexts[0], assignments) }
    : { kind: 'kubectl-rollout', status: state };
}

function analyzeHelmPrompt(text) {
  if (!/(?:\bhelm\s+upgrade\b|\bupgrade\b.{0,30}\bfrom\b|升级.{0,20}chart)/i.test(text)) return null;
  const releases = uniqueMatches(text, /(?:\bhelm\s+upgrade(?:\s+--install)?|\bupgrade)\s+([A-Za-z0-9][A-Za-z0-9._-]*)/gi, (_value, match) => match[1]);
  const charts = uniqueMatches(text, /\bfrom\s+(\.?\.?\/[A-Za-z0-9._\/-]+|[A-Za-z0-9._\/-]+)\b/gi, (_value, match) => match[1]);
  const namespaces = uniqueMatches(text, /\b(?:namespace|in)\s+([A-Za-z0-9._-]+)\b/gi, (_value, match) => match[1]);
  const contexts = uniqueMatches(text, /\b(?:context|on)\s+([A-Za-z0-9._-]+)\b/gi, (_value, match) => match[1]);
  const versions = uniqueMatches(text, new RegExp(`\\bversion\\s+(${SEMVER})\\b`, 'gi'), (_value, match) => match[1]);
  const state = targetFieldState([releases, charts, namespaces, contexts]);
  if (state !== 'complete' || versions.length > 1) return { kind: 'helm-upgrade', status: versions.length > 1 ? 'conflicting' : state };
  return {
    kind: 'helm-upgrade', status: 'complete',
    target: { release: releases[0], chart: charts[0], namespace: namespaces[0], context: contexts[0], ...(versions[0] ? { chartVersion: versions[0] } : {}) },
  };
}

function analyzeOmpPluginPrompt(text) {
  const plugins = uniqueMatches(text, /[A-Za-z0-9_.~-]+@[A-Za-z0-9_.~-]+/g);
  if (!/(?:omp\s+plugin\s+upgrade|升级.{0,20}插件|\bupgrade\b|升级)/i.test(text) || !plugins.length) return null;
  if (promptNamesExplicitVersion(text)) return { kind: 'omp-plugin-upgrade', status: 'unsupported' };
  const scopes = uniqueMatches(text, /\b(user|project)\s+scope\b/gi, (_value, match) => match[1].toLowerCase());
  const state = targetFieldState([plugins, scopes]);
  return state === 'complete'
    ? { kind: 'omp-plugin-upgrade', status: 'complete', target: { pluginId: plugins[0], scope: scopes[0] } }
    : { kind: 'omp-plugin-upgrade', status: state };
}

function kubectlPromptTarget(deployment, namespace, context, assignments) {
  return {
    deployment, namespace, context,
    containerImages: assignments.map((value) => {
      const separator = value.indexOf('=');
      return { container: value.slice(0, separator), image: value.slice(separator + 1) };
    }).sort((left, right) => left.container.localeCompare(right.container)),
  };
}

function uniqueMatches(text, regex, transform = (value) => value) {
  const values = [];
  for (const match of String(text).matchAll(regex)) values.push(transform(match[0], match));
  return [...new Set(values.filter(Boolean))];
}

function extractHttpsUrls(text) {
  return uniqueMatches(text, /https:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:\/[A-Za-z0-9._~:@%+\/-]*)?/gi, (value) => value.replace(/[.,;!?]+$/, ''));
}

function targetFieldState(fields) {
  if (fields.some((values) => values.length > 1)) return 'conflicting';
  return fields.every((values) => values.length === 1) ? 'complete' : 'incomplete';
}

function promptContractResult(status, kind = null, target = null) {
  return deepFreeze({ status, kind, target });
}

function releasePromptTargetEquals(kind, actionTarget, promptTarget) {
  const actual = canonicalReleaseTarget(kind, actionTarget);
  const requested = canonicalReleaseTarget(kind, promptTarget);
  return actual !== null && requested !== null && JSON.stringify(actual) === JSON.stringify(requested);
}

function canonicalReleaseTarget(kind, target) {
  if (!target || typeof target !== 'object') return null;
  switch (kind) {
    case 'git-push':
      return {
        remote: normalizeComparableRemote(target.remote),
        sourceName: String(target.sourceName ?? '').toLowerCase(),
        targetRef: String(target.targetRef ?? ''),
        refType: String(target.refType ?? ''),
      };
    case 'npm-publish':
      return {
        packageName: String(target.packageName ?? '').toLowerCase(),
        version: String(target.version ?? ''),
        registry: normalizeHttpsEndpoint(target.registry),
        tag: String(target.tag ?? ''),
      };
    case 'omp-plugin-upgrade':
      return { pluginId: String(target.pluginId ?? '').toLowerCase(), scope: String(target.scope ?? '').toLowerCase() };
    case 'docker-push':
      return { image: String(target.image ?? '') };
    case 'gh-release':
      return {
        repo: normalizeGithubRepo(target.repo),
        tag: String(target.tag ?? ''),
        prerelease: target.prerelease === true,
        targetCommitish: target.targetCommitish ? String(target.targetCommitish).toLowerCase() : null,
      };
    case 'kubectl-rollout':
      return {
        deployment: String(target.deployment ?? '').toLowerCase(),
        namespace: String(target.namespace ?? '').toLowerCase(),
        context: String(target.context ?? ''),
        containerImages: Array.isArray(target.containerImages)
          ? target.containerImages.map(({ container, image }) => ({
            container: String(container ?? '').toLowerCase(), image: String(image ?? ''),
          })).sort((left, right) => left.container.localeCompare(right.container))
          : [],
      };
    case 'helm-upgrade':
      return {
        release: String(target.release ?? '').toLowerCase(),
        chart: String(target.chart ?? ''),
        namespace: String(target.namespace ?? '').toLowerCase(),
        context: String(target.context ?? ''),
        chartVersion: target.chartVersion ? String(target.chartVersion) : null,
      };
    default:
      return null;
  }
}

function normalizeComparableRemote(remote) {
  const value = String(remote ?? '');
  return /^https:\/\//i.test(value) ? normalizeHttpsEndpoint(value) : value;
}

function normalizeGithubRepo(repo) {
  const match = String(repo ?? '').match(/(?:https:\/\/)?(github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/?$/i);
  return match?.[1]?.toLowerCase() ?? null;
}

function parseGitPushTarget(tokens) {
  if (!commandIs(tokens, 'git', 'push')) return null;
  if (tokens.some((token) => /^(?:--delete|--mirror|--all|--tags|-n|--dry-run)$/.test(token))) return null;
  const args = positionalArgs(tokens.slice(2), new Set(['--receive-pack', '--exec']));
  if (args.length !== 2 || !isExplicitGitRemote(args[0])) return null;
  const pushSpec = args[1].match(/^([0-9a-f]{40}|[0-9a-f]{64}):(.+)$/i);
  if (!pushSpec) return null;
  const target = normalizeGitTargetRef(pushSpec[2]);
  return target ? { remote: args[0], sourceName: pushSpec[1], ...target } : null;
}

function parseNpmPublishTarget(tokens, cwd, npmManifest) {
  if (!commandIs(tokens, 'npm', 'publish')) return null;
  const registry = optionValue(tokens, '--registry');
  if (!npmManifest || npmManifest.cwd !== cwd || !isExplicitHttpsEndpoint(registry)) return null;
  // npm lifecycle hooks run before publication and can mutate package.json
  // after the host preflight has bound its name/version. Until publication is
  // moved to a previously packed immutable artifact, fail closed unless those
  // repository-controlled scripts are explicitly disabled.
  const ignoreScripts = booleanFlagValue(tokens, '--ignore-scripts');
  if (!ignoreScripts.valid || !ignoreScripts.value) return null;
  if (tokens.some((token) => /^(?:--workspace|-w|--workspaces|--include-workspace-root)(?:=|$)/.test(token))) return null;
  const positionals = positionalArgs(tokens.slice(2), new Set([
    '--registry', '--access', '--tag', '--otp', '--workspace', '-w', '--provenance-file',
  ]));
  if (positionals.length > 1 || positionals.length === 1 && !['.', './'].includes(positionals[0])) return null;
  const tag = optionValue(tokens, '--tag') ?? 'latest';
  if (!isNpmDistTag(tag)) return null;
  return {
    registry: normalizeHttpsEndpoint(registry),
    packageName: npmManifest.name,
    version: npmManifest.version,
    manifestDigest: npmManifest.digest,
    tag,
  };
}

function parsePluginUpgradeTarget(tokens) {
  if (!commandIs(tokens, 'omp', 'plugin') || tokens[2] !== 'upgrade') return null;
  const positionals = positionalArgs(tokens.slice(3), new Set(['--scope']));
  const pluginId = positionals[0];
  const scope = optionValue(tokens, '--scope');
  if (positionals.length !== 1 || !/^[A-Za-z0-9_.~-]+@[A-Za-z0-9_.~-]+$/.test(pluginId ?? '')) return null;
  return scope === 'user' || scope === 'project' ? { pluginId, scope } : null;
}

function parseDockerPushTarget(tokens) {
  if (!commandIs(tokens, 'docker', 'push') || tokens.length !== 3) return null;
  return hasExplicitImageTag(tokens[2]) && hasExplicitRegistry(tokens[2]) ? { image: tokens[2] } : null;
}

function parseGhReleaseTarget(tokens) {
  if (!commandIs(tokens, 'gh', 'release') || tokens[2] !== 'create') return null;
  if (tokens.some((token) => token === '-d' || token.startsWith('-d=') || token === '--draft' || token.startsWith('--draft='))) return null;
  const repo = optionValue(tokens, '--repo', '-R');
  const positionals = positionalArgs(tokens.slice(3), new Set([
    '--repo', '-R', '--discussion-category', '--notes', '-n', '--notes-file', '-F',
    '--notes-start-tag', '--target', '--title', '-t',
  ]));
  if (positionals.length !== 1) return null;
  const prerelease = booleanFlagValue(tokens, '--prerelease', '-p');
  if (!prerelease.valid) return null;
  const targetCommitish = optionValue(tokens, '--target');
  if (targetCommitish && !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(targetCommitish)) return null;
  return isExplicitGithubRepo(repo) ? {
    repo,
    tag: positionals[0],
    prerelease: prerelease.value,
    ...(targetCommitish ? { targetCommitish: targetCommitish.toLowerCase() } : {}),
  } : null;
}

function parseKubectlRolloutTarget(tokens) {
  if (!commandIs(tokens, 'kubectl', 'set') || tokens[2] !== 'image') return null;
  if (tokens.some((token) => /^(?:--all|--selector|-l)(?:=|$)/.test(token))) return null;
  const resource = tokens[3]?.match(/^deployment(?:\.apps)?\/([a-z0-9](?:[-a-z0-9.]*[a-z0-9])?)$/i);
  const namespace = optionValue(tokens, '--namespace', '-n');
  const context = optionValue(tokens, '--context');
  const positionals = positionalArgs(tokens.slice(3), new Set(['--namespace', '-n', '--context']));
  if (!resource || !namespace || !context || positionals.length < 2) return null;
  const containerImages = [];
  const seenContainers = new Set();
  for (const value of positionals.slice(1)) {
    const assignment = value.match(/^([a-z0-9](?:[-a-z0-9._]*))=(\S+)$/i);
    if (!assignment || seenContainers.has(assignment[1])) return null;
    seenContainers.add(assignment[1]);
    containerImages.push({ container: assignment[1], image: assignment[2] });
  }
  containerImages.sort((left, right) => left.container.localeCompare(right.container));
  return { deployment: resource[1], namespace, context, containerImages };
}

function parseHelmUpgradeTarget(tokens) {
  if (!commandIs(tokens, 'helm', 'upgrade')) return null;
  const namespace = optionValue(tokens, '--namespace', '-n');
  const context = optionValue(tokens, '--kube-context');
  if (!namespace || !context) return null;
  const positionals = positionalArgs(tokens.slice(2), new Set([
    '--namespace', '-n', '--kube-context', '--version', '--values', '-f', '--set', '--set-string',
  ]));
  const release = positionals[0];
  const chart = positionals[1];
  const chartVersion = optionValue(tokens, '--version');
  if (chartVersion && !new RegExp(`^${SEMVER}$`).test(chartVersion)) return null;
  return positionals.length === 2 && release && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(release) && chart
    ? { release, chart, namespace, context, ...(chartVersion ? { chartVersion } : {}) }
    : null;
}

function parseGitPush({ tokens, cwd, resultText }) {
  const target = parseGitPushTarget(tokens);
  if (!target) return null;
  const { remote, sourceName, targetRef, refType } = target;
  if (/(?:^|\n)\s*Everything up-to-date\s*(?:\n|$)/i.test(resultText)) {
    return releaseRecord('git-push', [cwd, remote, targetRef], {
      revision: sourceName.toLowerCase(),
      outcome: 'desired-state-pending-verification',
      refType,
    });
  }
  const destination = targetRef.replace(/^refs\/(?:heads|tags)\//, '');
  const updatePattern = new RegExp(
    `(?:^|\\n)\\s*[+ ]*(${HEX_REVISION})\\.{2,3}(${HEX_REVISION})\\s+\\S+\\s+->\\s+(?:refs/heads/)?${escapeRegex(destination)}(?:\\s|$)`,
    'i',
  );
  const update = resultText.match(updatePattern);
  if (update && !/^0+$/.test(update[2]) && sourceName.toLowerCase().startsWith(update[2].toLowerCase())) {
    return releaseRecord('git-push', [cwd, remote, targetRef], {
      revision: sourceName.toLowerCase(),
      refType,
    });
  }

  const newLabel = refType === 'tag' ? 'new tag' : 'new branch';
  const newBranchPattern = new RegExp(
    `(?:^|\\n)\\s*\\*\\s+\\[${newLabel}\\]\\s+\\S+\\s+->\\s+(?:refs/(?:heads|tags)/)?${escapeRegex(destination)}(?:\\s|$)`,
    'i',
  );
  if (!newBranchPattern.test(resultText)) return null;
  return releaseRecord('git-push', [cwd, remote, targetRef], {
    revision: sourceName.toLowerCase(),
    outcome: refType === 'tag' ? 'new-tag' : 'new-branch',
    refType,
  });
}

function verifyGitPush(record, { tokens, cwd, resultText }) {
  if (!commandIs(tokens, 'git', 'ls-remote') || tokens.length !== 4) return false;
  const [, , remote, targetName] = tokens;
  if (!isExplicitGitRemote(remote)) return false;
  const target = normalizeGitTargetRef(targetName);
  const targetRef = target?.targetRef;
  if (!targetRef || targetFingerprint([cwd, remote, targetRef]) !== record.targetFingerprint) return false;
  if (target.refType !== record.expectation.refType) return false;

  const refLine = new RegExp(`(?:^|\\n)(${HEX_REVISION})\\s+${escapeRegex(targetRef)}(?:\\s|$)`, 'i');
  const observed = resultText.match(refLine)?.[1]?.toLowerCase();
  const expected = record.expectation.revision;
  if (!observed) return false;
  return Boolean(expected && observed === expected);
}

function parseNpmPublish({ tokens, cwd, npmManifest, resultText }) {
  const target = parseNpmPublishTarget(tokens, cwd, npmManifest);
  if (!target) return null;
  const published = resultText.match(new RegExp(
    `(?:^|\\n)\\s*\\+\\s+((?:@[a-z0-9_.~-]+/)?[a-z0-9_.~-]+)@(${SEMVER})\\s*(?:\\n|$)`,
    'i',
  ));
  const publishedTo = resultText.match(/(?:^|\n).*?Publishing\s+to\s+(https:\/\/\S+)\s+with\s+tag\s+(\S+)\s+and\s+/i);
  if (!published
    || published[1].toLowerCase() !== target.packageName.toLowerCase()
    || published[2] !== target.version
    || !publishedTo
    || normalizeHttpsEndpoint(publishedTo[1]) !== target.registry
    || publishedTo[2] !== target.tag) return null;
  return releaseRecord(
    'npm-publish',
    [cwd, target.registry, target.packageName.toLowerCase(), target.manifestDigest],
    { version: target.version, tag: target.tag, manifestDigest: target.manifestDigest },
  );
}

function verifyNpmPublish(record, { tokens, cwd, resultText }) {
  if (!(commandIs(tokens, 'npm', 'view') || commandIs(tokens, 'npm', 'info'))) return false;
  const positionals = positionalArgs(tokens.slice(2), new Set(['--registry']));
  if (positionals.length !== 2 || positionals[1] !== 'dist-tags') return false;
  const packageName = parsePackageName(positionals[0]);
  const registry = normalizeHttpsEndpoint(optionValue(tokens, '--registry'));
  const jsonFlag = booleanFlagValue(tokens, '--json');
  if (!packageName || !registry || !jsonFlag.valid || jsonFlag.value !== true) return false;
  const manifestDigest = record.expectation.manifestDigest;
  if (!/^[0-9a-f]{64}$/.test(manifestDigest ?? '')) return false;
  if (targetFingerprint([cwd, registry, packageName.toLowerCase(), manifestDigest]) !== record.targetFingerprint) return false;
  const distTags = parseJsonObject(resultText);
  return typeof record.expectation.tag === 'string'
    && typeof record.expectation.version === 'string'
    && Object.hasOwn(distTags ?? {}, record.expectation.tag)
    && distTags[record.expectation.tag] === record.expectation.version;
}

function parsePluginUpgrade({ tokens, cwd, resultText }) {
  const target = parsePluginUpgradeTarget(tokens);
  if (!target) return null;
  const { pluginId, scope } = target;
  const upgraded = resultText.match(new RegExp(
    `(?:^|\\n)\\s*Upgraded\\s+${escapeRegex(pluginId)}\\s+\\((user|project)\\)\\s+to\\s+(${SEMVER})\\s*(?:\\n|$)`,
    'i',
  ));
  if (!upgraded || upgraded[1].toLowerCase() !== scope) return null;
  return releaseRecord('omp-plugin-upgrade', [cwd, pluginId, scope], {
    version: upgraded[2],
    scope,
  });
}

function verifyPluginUpgrade(record, { tokens, cwd, resultText }) {
  if (!commandIs(tokens, 'omp', 'plugin') || tokens[2] !== 'list') return false;
  if (!(tokens.length === 3 || tokens.length === 4 && tokens[3] === '--json')) return false;

  if (tokens[3] === '--json') {
    try {
      const parsed = JSON.parse(resultText);
      if (!Array.isArray(parsed?.marketplace)) return false;
      return parsed.marketplace.some((plugin) => {
        if (plugin?.scope !== record.expectation.scope || !Array.isArray(plugin?.entries)) return false;
        if (targetFingerprint([cwd, plugin.id, plugin.scope]) !== record.targetFingerprint) return false;
        return plugin.entries.some((entry) => entry?.scope === plugin.scope && entry?.version === record.expectation.version);
      });
    } catch {
      return false;
    }
  }

  return resultText.split(/\r?\n/).some((line) => {
    const match = line.trim().match(new RegExp(`^(\\S+)\\s+\\((${SEMVER})\\)\\s+\\((user|project)\\)(?:\\s+\\[shadowed\\])?$`, 'i'));
    return Boolean(match
      && match[2] === record.expectation.version
      && match[3].toLowerCase() === record.expectation.scope
      && targetFingerprint([cwd, match[1], match[3].toLowerCase()]) === record.targetFingerprint);
  });
}

function parseDockerPush({ tokens, cwd, resultText }) {
  const target = parseDockerPushTarget(tokens);
  if (!target) return null;
  const digest = resultText.match(/\bdigest:\s*(sha256:[0-9a-f]{64})\b/i)?.[1]?.toLowerCase();
  if (!digest) return null;
  return releaseRecord('docker-push', [cwd, target.image], { digest });
}

function verifyDockerPush(record, { tokens, cwd, resultText }) {
  let image = null;
  if (commandIs(tokens, 'docker', 'manifest') && tokens[2] === 'inspect' && tokens.length === 4) image = tokens[3];
  if (commandIs(tokens, 'docker', 'buildx') && tokens[2] === 'imagetools' && tokens[3] === 'inspect' && tokens.length === 5) image = tokens[4];
  if (!image || !hasExplicitRegistry(image) || targetFingerprint([cwd, image]) !== record.targetFingerprint) return false;
  const digests = [...resultText.matchAll(/sha256:[0-9a-f]{64}/gi)].map((match) => match[0].toLowerCase());
  return digests.includes(record.expectation.digest);
}

function parseGhReleaseCreate({ tokens, cwd, resultText }) {
  const target = parseGhReleaseTarget(tokens);
  if (!target || !resultContainsGithubRelease(resultText, target.repo, target.tag)) return null;
  return releaseRecord('gh-release', [cwd, target.repo.toLowerCase(), target.tag], {
    status: 'published',
    prerelease: target.prerelease,
    ...(target.targetCommitish ? { targetCommitish: target.targetCommitish } : {}),
  });
}

function verifyGhRelease(record, { tokens, cwd, resultText }) {
  if (!commandIs(tokens, 'gh', 'release') || tokens[2] !== 'view') return false;
  const positionals = positionalArgs(tokens.slice(3), new Set(['--repo', '-R', '--json', '--jq', '-q', '--template', '-t']));
  if (positionals.length !== 1) return false;
  const tag = positionals[0];
  const repo = optionValue(tokens, '--repo', '-R');
  if (!isExplicitGithubRepo(repo) || targetFingerprint([cwd, repo.toLowerCase(), tag]) !== record.targetFingerprint) return false;
  const jsonFields = new Set(String(optionValue(tokens, '--json') ?? '').split(','));
  if (!['tagName', 'url', 'isDraft', 'isPrerelease'].every((field) => jsonFields.has(field))) return false;
  if (record.expectation.targetCommitish && !jsonFields.has('targetCommitish')) return false;
  const release = parseJsonObject(resultText);
  return resultContainsGithubRelease(resultText, repo, tag)
    && release?.tagName === tag
    && release?.isDraft === false
    && release?.isPrerelease === record.expectation.prerelease
    && (!record.expectation.targetCommitish || release?.targetCommitish?.toLowerCase() === record.expectation.targetCommitish);
}

function parseKubectlRollout({ tokens, cwd, resultText }) {
  const target = parseKubectlRolloutTarget(tokens);
  if (!target) return null;
  const success = new RegExp(
    `(?:^|\\n)deployment(?:\\.apps)?/${escapeRegex(target.deployment)}\\s+image\\s+updated(?:\\s|$)`,
    'i',
  );
  if (!success.test(resultText)) return null;
  const containerImageFingerprints = target.containerImages
    .map(({ container, image }) => containerImageFingerprint(container, image))
    .sort();
  return releaseRecord('kubectl-rollout', [cwd, target.context, target.namespace, 'deployment', target.deployment], {
    status: 'deployment-current',
    containerImageFingerprints,
  });
}

function verifyKubectlRollout(record, { tokens, cwd, resultText }) {
  if (!commandIs(tokens, 'kubectl', 'get') || !tokens[2]) return false;
  const resource = tokens[2].match(/^deployment(?:\.apps)?\/([a-z0-9](?:[-a-z0-9.]*[a-z0-9])?)$/i);
  const namespace = optionValue(tokens, '--namespace', '-n');
  const context = optionValue(tokens, '--context');
  const positionals = positionalArgs(tokens.slice(2), new Set(['--namespace', '-n', '--context', '--output', '-o']));
  if (!resource || !namespace || !context || positionals.length !== 1 || !requestsJsonOutput(tokens)) return false;
  if (targetFingerprint([cwd, context, namespace, 'deployment', resource[1]]) !== record.targetFingerprint) return false;

  const deployment = parseJsonObject(resultText);
  if (deployment?.apiVersion !== 'apps/v1' || deployment?.kind !== 'Deployment') return false;
  if (deployment?.metadata?.name !== resource[1] || deployment?.metadata?.namespace !== namespace) return false;
  const generation = deployment?.metadata?.generation;
  const replicas = deployment?.spec?.replicas;
  const observedGeneration = deployment?.status?.observedGeneration;
  const updatedReplicas = deployment?.status?.updatedReplicas;
  const availableReplicas = deployment?.status?.availableReplicas;
  if (!isNonNegativeInteger(generation) || generation < 1 || !isNonNegativeInteger(replicas)) return false;
  if (!isNonNegativeInteger(observedGeneration) || observedGeneration < generation) return false;
  if (!isNonNegativeInteger(updatedReplicas) || updatedReplicas < replicas) return false;
  if (!isNonNegativeInteger(availableReplicas) || availableReplicas < replicas) return false;

  const containers = deployment?.spec?.template?.spec?.containers;
  if (!Array.isArray(containers) || containers.length === 0) return false;
  const seenNames = new Set();
  const observedFingerprints = new Set();
  for (const container of containers) {
    if (typeof container?.name !== 'string' || typeof container?.image !== 'string' || seenNames.has(container.name)) return false;
    seenNames.add(container.name);
    observedFingerprints.add(containerImageFingerprint(container.name, container.image));
  }
  const expectedFingerprints = record.expectation.containerImageFingerprints;
  return Array.isArray(expectedFingerprints)
    && expectedFingerprints.length > 0
    && expectedFingerprints.every((fingerprint) => observedFingerprints.has(fingerprint));
}

function parseHelmUpgrade({ tokens, cwd, resultText }) {
  const target = parseHelmUpgradeTarget(tokens);
  if (!target) return null;
  const fields = parseColonFields(resultText);
  if (fields.name !== target.release || fields.namespace !== target.namespace || fields.status?.toLowerCase() !== 'deployed' || !/^\d+$/.test(fields.revision ?? '')) return null;
  return releaseRecord('helm-upgrade', [cwd, target.context, target.namespace, target.release], {
    revision: fields.revision,
    status: 'deployed',
    ...(target.chartVersion ? { chartVersion: target.chartVersion } : {}),
  });
}

function verifyHelmUpgrade(record, { tokens, cwd, resultText }) {
  if (!commandIs(tokens, 'helm', 'status') || !tokens[2]) return false;
  const release = tokens[2];
  const namespace = optionValue(tokens, '--namespace', '-n');
  const context = optionValue(tokens, '--kube-context');
  if (!namespace || !context || targetFingerprint([cwd, context, namespace, release]) !== record.targetFingerprint) return false;
  if (record.expectation.chartVersion) {
    if (!requestsJsonOutput(tokens)) return false;
    const status = parseJsonObject(resultText);
    return status?.name === release
      && status?.namespace === namespace
      && status?.info?.status === record.expectation.status
      && String(status?.version) === record.expectation.revision
      && status?.chart?.metadata?.version === record.expectation.chartVersion;
  }
  const fields = parseColonFields(resultText);
  return fields.name === release
    && fields.namespace === namespace
    && fields.status?.toLowerCase() === record.expectation.status
    && fields.revision === record.expectation.revision;
}

function releaseRecord(kind, targetParts, expectation) {
  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    kind,
    targetFingerprint: targetFingerprint(targetParts),
    expectation: deepFreeze({ ...expectation }),
  });
}

function isReleaseRecord(record) {
  return record?.schemaVersion === SCHEMA_VERSION
    && typeof record?.kind === 'string'
    && /^[0-9a-f]{64}$/.test(record?.targetFingerprint ?? '')
    && record?.expectation && typeof record.expectation === 'object';
}

function targetFingerprint(parts) {
  return createHash('sha256').update(JSON.stringify(parts.map((part) => String(part)))).digest('hex');
}

function containerImageFingerprint(container, image) {
  return targetFingerprint(['kubectl-container-image', container, image]);
}

function normalizeCwd(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.includes('\0')) return null;
  const normalized = path.normalize(value.trim());
  return normalized.startsWith('/') ? normalized : null;
}

function canonicalReleaseToolName(value = '') {
  return String(value)
    .trim()
    .replace(/[./:\\]+/g, '_')
    .replace(/_+/g, '_');
}

function normalizeTrustedNpmManifest(value, cwd) {
  if (!value || value.source !== 'host-package-json') return null;
  const manifestCwd = normalizeCwd(value.cwd);
  const packageName = parsePackageName(value.name);
  const version = String(value.version ?? '');
  const digest = String(value.digest ?? '').toLowerCase();
  if (!manifestCwd || manifestCwd !== cwd || !packageName) return null;
  if (!new RegExp(`^${SEMVER}$`).test(version) || !/^[0-9a-f]{64}$/.test(digest)) return null;
  return Object.freeze({
    source: 'host-package-json',
    cwd: manifestCwd,
    name: packageName,
    version,
    digest,
  });
}

function tokenizeSimpleCommand(command) {
  const tokens = [];
  let current = '';
  let quote = '';
  let escaped = false;
  const source = String(command);

  const flush = () => {
    if (current) tokens.push(current);
    current = '';
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1] ?? '';
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (quote !== "'" && (char === '`' || char === '$' && next === '(')) return null;
    if (char === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = '';
      else current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      flush();
      continue;
    }
    if (';&|<>'.includes(char)) return null;
    current += char;
  }
  if (quote || escaped) return null;
  flush();
  if (!tokens.length) return null;
  tokens[0] = tokens[0].split('/').pop();
  return tokens;
}

function commandIs(tokens, first, second) {
  return tokens[0]?.toLowerCase() === first && tokens[1]?.toLowerCase() === second;
}

function positionalArgs(tokens, valueFlags) {
  const values = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.startsWith('--') && token.includes('=')) continue;
    if (valueFlags.has(token)) {
      index += 1;
      continue;
    }
    if (token.startsWith('-')) continue;
    values.push(token);
  }
  return values;
}

function optionValue(tokens, longName, shortName) {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === longName || token === shortName) return tokens[index + 1] ?? null;
    if (token.startsWith(`${longName}=`)) return token.slice(longName.length + 1) || null;
    if (shortName && token.startsWith(`${shortName}=`)) return token.slice(shortName.length + 1) || null;
  }
  return null;
}

function booleanFlagValue(tokens, longName, shortName) {
  const observed = [];
  for (const token of tokens) {
    if (token === longName || token === shortName) {
      observed.push(true);
      continue;
    }
    const prefix = token.startsWith(`${longName}=`)
      ? `${longName}=`
      : shortName && token.startsWith(`${shortName}=`) ? `${shortName}=` : null;
    if (!prefix) continue;
    const value = token.slice(prefix.length).toLowerCase();
    if (value !== 'true' && value !== 'false') return { valid: false, value: false };
    observed.push(value === 'true');
  }
  if (new Set(observed).size > 1) return { valid: false, value: false };
  return { valid: true, value: observed[0] ?? false };
}

function normalizeGitTargetRef(value) {
  const target = String(value);
  if (/^refs\/heads\/[A-Za-z0-9._/-]+$/.test(target)) return { targetRef: target, refType: 'branch' };
  if (/^refs\/tags\/[A-Za-z0-9._/-]+$/.test(target)) return { targetRef: target, refType: 'tag' };
  return /^[A-Za-z0-9._/-]+$/.test(target)
    ? { targetRef: `refs/heads/${target}`, refType: 'branch' }
    : null;
}

function parsePackageVersion(spec) {
  const match = String(spec ?? '').match(new RegExp(`^((?:@[a-z0-9_.~-]+/)?[a-z0-9_.~-]+)@(${SEMVER})$`, 'i'));
  return match ? { packageName: match[1], version: match[2] } : null;
}

function parsePackageName(value) {
  const match = String(value ?? '').match(/^((?:@[a-z0-9_.~-]+\/)?[a-z0-9_.~-]+)$/i);
  return match?.[1] ?? null;
}

function isNpmDistTag(value) {
  return /^[A-Za-z][A-Za-z0-9._-]{0,127}$/.test(String(value ?? ''));
}

function parseObservedVersion(resultText) {
  const trimmed = String(resultText).trim();
  if (new RegExp(`^v?(${SEMVER})$`, 'i').test(trimmed)) return trimmed.replace(/^v/, '');
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === 'string') return parsed.replace(/^v/, '');
    if (typeof parsed?.version === 'string') return parsed.version.replace(/^v/, '');
  } catch {
    // A non-JSON npm view response is handled by the exact plain-text case.
  }
  return null;
}

function hasExplicitImageTag(image) {
  const value = String(image);
  return value.lastIndexOf(':') > value.lastIndexOf('/') && /^[A-Za-z0-9._/:@-]+$/.test(value) && !value.includes('@');
}

function hasExplicitRegistry(image) {
  const value = String(image);
  if (!value.includes('/')) return false;
  const registry = value.slice(0, value.indexOf('/'));
  return registry === 'localhost' || registry.includes('.') || registry.includes(':');
}

function isExplicitGitRemote(remote) {
  const value = String(remote ?? '');
  if (/^git@[A-Za-z0-9.-]+:[A-Za-z0-9._/-]+(?:\.git)?$/.test(value)) return true;
  try {
    const parsed = new URL(value);
    return ['https:', 'ssh:', 'git:'].includes(parsed.protocol)
      && Boolean(parsed.hostname)
      && !parsed.username
      && !parsed.password
      && !parsed.search
      && !parsed.hash;
  } catch {
    return false;
  }
}

function isExplicitHttpsEndpoint(endpoint) {
  try {
    const parsed = new URL(String(endpoint ?? ''));
    return parsed.protocol === 'https:'
      && Boolean(parsed.hostname)
      && !parsed.username
      && !parsed.password
      && !parsed.search
      && !parsed.hash;
  } catch {
    return false;
  }
}

function normalizeHttpsEndpoint(endpoint) {
  if (!isExplicitHttpsEndpoint(endpoint)) return null;
  const parsed = new URL(String(endpoint));
  const pathname = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.protocol}//${parsed.host}${pathname}`;
}

function isExplicitGithubRepo(repo) {
  return /^github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(repo));
}

function resultContainsGithubRelease(resultText, repo, tag) {
  if (!isExplicitGithubRepo(repo)) return false;
  const repositoryPath = String(repo).split('/').slice(1).join('/');
  const pattern = new RegExp(`https://github\\.com/${escapeRegex(repositoryPath)}/releases/tag/${escapeRegex(encodeURIComponent(tag))}(?:\\s|$|["'])`, 'i');
  return pattern.test(String(resultText));
}

function parseJsonObject(resultText) {
  try {
    const parsed = JSON.parse(String(resultText).trim());
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseColonFields(resultText) {
  const fields = {};
  for (const line of String(resultText).split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z ]*):\s*(.*?)\s*$/);
    if (match) fields[match[1].trim().toLowerCase().replace(/\s+/g, '_')] = match[2];
  }
  return fields;
}

function requestsJsonOutput(tokens) {
  return optionValue(tokens, '--output', '-o') === 'json';
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function hasExplicitFailureLine(resultText) {
  return String(resultText).split(/\r?\n/).some((line) => (
    /^\s*(?:fatal|error|failure|denied|unauthorized|forbidden)\s*:/i.test(line)
    || /^\s*remote:\s*(?:fatal|error)\s*:/i.test(line)
    || /^\s*error\s+response\s+from\b/i.test(line)
    || /^\s*failed(?:\s+to\b|\s*:)/i.test(line)
    || /^\s*npm\s+(?:ERR!|error\b)/i.test(line)
    || /^\s*!\s+\[(?:remote\s+)?rejected\]/i.test(line)
    || /^\s*HTTP\s+[45]\d\d\b/i.test(line)
  ));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
