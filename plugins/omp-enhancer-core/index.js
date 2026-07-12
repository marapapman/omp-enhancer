import { closeSync, constants, fstatSync, openSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

import { buildClassifierPrompt, resolveClassificationRoute } from './src/classifier.js';
import { appendDebugLog, buildDebugRecord } from './src/debug-logger.js';
import {
  buildGovernancePromptFragment,
  buildImmediateWorkflowMessage,
  buildSubagentPromptFragment,
  formatWorkflowBriefingForAssignment,
} from './src/governance.js';
import { installPluginSkills } from './src/install-skills.js';
import { classifyHostTurn } from './src/host-turn-context.js';
import { routeNaturalLanguageTask } from './src/router.js';
import { detectWritingSourceLanguage } from './src/task-descriptor.js';
import {
  normalizeSkillName,
  parseLoadedSkillEvidence,
  skillReadNameCandidates,
  skillNamesEquivalent,
  validateSkillUsage,
} from './src/skill-usage.js';
import { validateSubagentUsage } from './src/subagent-usage.js';

const CORE_STATE_ENTRY = 'omp-enhancer-core.state';
const STATE_SCHEMA_VERSION = 3;
const MAX_WRITING_SOURCE_BYTES = 512 * 1024;
const MAX_WRITING_SOURCE_CHARS = 120000;
const MAX_WRITING_SOURCE_FILES = 4;

export default function registerCoreEnhancer(pi) {
  const state = createState();
  let activeHostTurnKind = 'user';
  const z = pi.zod?.z ?? pi.z;

  pi.setLabel?.('OMP Enhancer Core');

  pi.registerTool({
    name: 'omp_core_route_task',
    label: 'Route OMP task',
    description: 'Return advisory workflow steps, skills, tools, roles, and quality checks. Writing language follows the source text being revised. This tool does not authorize actions or block execution.',
    parameters: z?.object ? z.object({
      prompt: z.string(),
      sourceText: z.string().optional(),
    }) : undefined,
    execute: async (_callId, params = {}, _signal, _onUpdate, ctx = {}) => {
      restoreStateFromContext(state, ctx);
      const route = resolveAdvisoryRoute({
        prompt: params.prompt,
        sourceText: params.sourceText,
        ctx,
      });
      state.lastRouteProbe = {
        route,
        prompt: String(params.prompt ?? ''),
        changedActiveRoute: false,
        probedAt: Date.now(),
      };
      await persistState(pi, state);
      return okResult(
        formatRoute(route) + '\nRoute probe only: the active user-turn route was not changed.'
          + formatRouteProbeGuidance(route),
        {
          activated: false,
          probe_only: true,
          route,
          state_changed: false,
        },
      );
    },
  });

  pi.registerTool({
    name: 'omp_core_classifier_prompt',
    label: 'Build OMP classifier prompt',
    description: 'Build the strict JSON prompt for an optional advisory route classifier.',
    parameters: z?.object ? z.object({ prompt: z.string() }) : undefined,
    execute: async (_callId, params = {}, _signal, _onUpdate, ctx = {}) => {
      restoreStateFromContext(state, ctx);
      const classifier = buildClassifierPrompt({
        prompt: params.prompt,
        context: classifierPromptContext(state, params.prompt),
      });
      return okResult(classifier.prompt, { classifier });
    },
  });

  pi.registerTool({
    name: 'omp_core_resolve_classification',
    label: 'Resolve OMP classifier output',
    description: 'Validate classifier JSON and merge monotonic workflow hints into the active advisory route.',
    parameters: z?.object ? z.object({
      prompt: z.string(),
      output: z.string(),
    }) : undefined,
    execute: async (_callId, params = {}, _signal, _onUpdate, ctx = {}) => {
      restoreStateFromContext(state, ctx);
      const active = Boolean(state.lastRoute && state.routeStartedAt);
      const prompt = active ? state.lastPrompt : String(params.prompt ?? '');
      const result = resolveClassificationRoute({
        prompt,
        output: params.output,
        baseRoute: active ? state.lastRoute : undefined,
      });

      if (!active) {
        state.lastRouteProbe = {
          route: result.route,
          prompt,
          changedActiveRoute: false,
          probedAt: Date.now(),
        };
        await persistState(pi, state);
        return okResult(
          formatRoute(result.route) + '\nClassifier probe only: no active user-turn route was changed.',
          {
            ...result,
            activated: false,
            probe_only: true,
          },
        );
      }

      if (state.classifierAttempted) {
        const repeated = {
          ok: true,
          route: state.lastRoute,
          fallbackRoute: state.lastRoute,
          classification: null,
          validation: { ok: true, errors: [] },
          activated: false,
          repeated: true,
        };
        return okResult(
          formatRoute(state.lastRoute) + '\nClassifier refinement was already considered for this user turn.',
          repeated,
        );
      }

      state.classifierAttempted = true;
      if (result.ok) state.lastRoute = result.route;
      await persistState(pi, state);
      return okResult(formatRoute(result.route), {
        ...result,
        activated: result.ok,
      });
    },
  });

  pi.registerTool({
    name: 'omp_core_validate_skill_usage',
    label: 'Review routed skill usage',
    description: 'Compare observed skill usage with the route suggestions and return advisory coverage findings.',
    parameters: z?.object ? z.object({
      output: z.string(),
      requiredSkills: z.array(z.string()).optional(),
    }) : undefined,
    execute: async (_callId, params = {}, _signal, _onUpdate, ctx = {}) => {
      restoreStateFromContext(state, ctx);
      const suggestedSkills = state.lastRoute
        ? routeSkills(state.lastRoute)
        : params.requiredSkills ?? [];
      const validation = validateSkillUsage({
        requiredSkills: suggestedSkills,
        output: '',
        loadedSkills: state.observedSkills,
      });
      for (const skill of parseLoadedSkillEvidence(params.output ?? '')) {
        state.claimedSkills.add(normalizeSkillName(skill));
      }
      state.lastSkillUsage = skillCoverageReview(validation, suggestedSkills, {
        claimedSkills: state.claimedSkills,
      });
      await persistState(pi, state);
      return okResult(state.lastSkillUsage.summary, {
        validation: state.lastSkillUsage,
      });
    },
  });

  pi.registerTool({
    name: 'omp_core_validate_subagent_usage',
    label: 'Review routed role usage',
    description: 'Compare observed collaboration with the route role suggestions and return advisory coverage findings.',
    parameters: z?.object ? z.object({
      output: z.string(),
      requiredSubagents: z.array(z.string()).optional(),
    }) : undefined,
    execute: async (_callId, params = {}, _signal, _onUpdate, ctx = {}) => {
      restoreStateFromContext(state, ctx);
      const suggestedRoles = state.lastRoute
        ? routeRoles(state.lastRoute)
        : params.requiredSubagents ?? [];
      const validation = validateSubagentUsage({
        requiredSubagents: suggestedRoles,
        output: params.output ?? '',
      });
      state.lastSubagentUsage = roleCoverageReview(validation, suggestedRoles);
      await persistState(pi, state);
      return okResult(state.lastSubagentUsage.summary, {
        validation: state.lastSubagentUsage,
      });
    },
  });

  pi.registerTool({
    name: 'omp_core_subagent_status',
    label: 'Show advisory workflow status',
    description: 'Show the current advisory route, suggested resources, and observed task progress.',
    parameters: z?.object ? z.object({}) : undefined,
    execute: async (_callId, _params = {}, _signal, _onUpdate, ctx = {}) => {
      restoreStateFromContext(state, ctx);
      const status = buildWorkflowStatus(state);
      await persistState(pi, state);
      return okResult(formatWorkflowStatus(status), { status });
    },
  });

  pi.registerTool({
    name: 'omp_core_governance_prompt',
    label: 'Build workflow guidance',
    description: 'Build an advisory workflow prompt for the active route or a supplied natural-language task.',
    parameters: z?.object ? z.object({
      prompt: z.string().optional(),
    }) : undefined,
    execute: async (_callId, params = {}, _signal, _onUpdate, ctx = {}) => {
      restoreStateFromContext(state, ctx);
      const requestedRoute = params.prompt
        ? resolveAdvisoryRoute({ prompt: params.prompt, ctx })
        : null;
      const route = state.lastRoute ?? requestedRoute;
      const fragment = route
        ? buildGovernancePromptFragment({
          route,
          parentTask: params.prompt ?? state.lastPrompt,
          includeModelWorkflowHints: true,
          workspaceRoot: ctx.cwd || process.cwd(),
        })
        : 'No active route. Follow the user request directly and use available skills when useful.';
      return okResult(fragment, { fragment, route });
    },
  });

  pi.registerTool({
    name: 'omp_core_install_skills',
    label: 'Install plugin skills',
    description: 'Install marketplace plugin skills without overwriting real directories, and report exact legacy gate skills that can be ignored without disabling autolearn.',
    parameters: z?.object ? z.object({
      dryRun: z.boolean().optional(),
    }) : undefined,
    execute: async (_callId, params = {}) => {
      const result = await installPluginSkills({ dryRun: params.dryRun ?? false });
      const summary = [
        'Installed: ' + result.installed.length,
        'Skipped: ' + result.skipped.length,
        'Errors: ' + result.errors.length,
        ...(result.warnings.length ? ['Warnings: ' + result.warnings.length] : []),
        ...(result.legacyFindings.length ? ['Legacy gate skill findings: ' + result.legacyFindings.length] : []),
      ].join(', ');
      return okResult(summary, result);
    },
  });

  pi.on?.('session_start', async (_event = {}, ctx = {}) => {
    activeHostTurnKind = 'user';
    if (!restoreStateFromContext(state, ctx)) resetState(state);
    await persistState(pi, state);
    return undefined;
  });

  pi.on?.('before_agent_start', async (event = {}, ctx = {}) => {
    restoreStateFromContext(state, ctx);
    const hostTurn = classifyHostTurn(event, ctx);
    activeHostTurnKind = hostTurn.kind;
    if (hostTurn.kind === 'autolearn-capture') return undefined;
    const prompt = extractPrompt(event);
    if (isSlashCommandPrompt(prompt)) return undefined;

    if (isSubagentLaunchPrompt(prompt)) {
      const fragment = buildSubagentPromptFragment({ prompt });
      return {
        ...injectBeforeAgentSystemPrompt(event, fragment),
        route: emptySubagentRoute(),
      };
    }

    const implementationTransition = isPlanningImplementationTransition(state, prompt);
    const inherited = !implementationTransition && shouldInheritContinuation(state, prompt);
    const previousPrompt = state.lastPrompt;
    const route = inherited
      ? state.lastRoute
      : resolveAdvisoryRoute({ prompt, ctx });

    if (!inherited) {
      state.lastRoute = route;
      state.lastPrompt = implementationTransition
        ? [previousPrompt, prompt].filter(Boolean).join('\n')
        : prompt;
      state.routeStartedAt = Math.max(Date.now(), state.routeStartedAt + 1);
      state.lastSkillUsage = null;
      state.lastSubagentUsage = null;
      state.classifierAttempted = false;
      state.observedSkills.clear();
      state.claimedSkills.clear();
      state.tasks.clear();
      state.completedRoles.clear();
    } else {
      state.lastPrompt = [state.lastPrompt, prompt].filter(Boolean).join('\n');
    }
    state.lastRouteProbe = null;

    await writeDebugLog(ctx, 'routes', buildDebugRecord({
      kind: 'routes',
      prompt: state.lastPrompt,
      route,
      payload: {
        mode: 'advisory',
        autoContinue: false,
        writingLanguageSource: route.taskDescriptor?.writingLanguageSource ?? null,
      },
    }));
    await persistState(pi, state);

    const fragment = buildGovernancePromptFragment({
      route,
      parentTask: state.lastPrompt,
      includeModelWorkflowHints: false,
      workspaceRoot: ctx.cwd || process.cwd(),
    });
    const workflowMessage = buildImmediateWorkflowMessage({
      route,
      workspaceRoot: ctx.cwd || process.cwd(),
    });
    return {
      ...injectBeforeAgentSystemPrompt(event, fragment),
      ...(workflowMessage ? {
        message: {
          customType: 'omp-enhancer-core.workflow-guidance',
          content: workflowMessage,
          display: false,
          attribution: 'agent',
        },
      } : {}),
      route,
    };
  });

  pi.on?.('tool_call', async (event = {}, ctx = {}) => {
    if (activeHostTurnKind === 'autolearn-capture') return undefined;
    restoreStateFromContext(state, ctx);
    if (toolEventName(event) === 'task') {
      decorateTaskAssignments(event, state);
      recordTaskDispatch(state, event);
      await persistState(pi, state);
    }
    return undefined;
  });

  pi.on?.('tool_result', async (event = {}, ctx = {}) => {
    if (activeHostTurnKind === 'autolearn-capture') return undefined;
    restoreStateFromContext(state, ctx);
    const name = toolEventName(event);
    if (name === 'read' && !toolEventFailed(event)) recordSkillReads(state, event);
    if (name === 'task') recordTaskResult(state, event);
    await persistState(pi, state);
    return undefined;
  });

  pi.on?.('session_stop', async (event = {}, ctx = {}) => {
    if (activeHostTurnKind === 'autolearn-capture') {
      activeHostTurnKind = 'user';
      return undefined;
    }
    restoreStateFromContext(state, ctx);
    for (const skill of parseLoadedSkillEvidence(extractText(event))) {
      state.claimedSkills.add(normalizeSkillName(skill));
    }
    await persistState(pi, state);
    return undefined;
  });
}

export function createState() {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    lastRoute: null,
    lastPrompt: '',
    routeStartedAt: 0,
    lastRouteProbe: null,
    lastSkillUsage: null,
    lastSubagentUsage: null,
    classifierAttempted: false,
    observedSkills: new Set(),
    claimedSkills: new Set(),
    tasks: new Map(),
    completedRoles: new Set(),
    taskSequence: 0,
  };
}

function resolveAdvisoryRoute({ prompt = '', sourceText, ctx = {} } = {}) {
  let route = routeNaturalLanguageTask({
    prompt: String(prompt ?? ''),
    ...(hasWritingSource(sourceText) ? { sourceText } : {}),
  });
  if (hasWritingSource(sourceText)) return route;
  const descriptor = route.taskDescriptor ?? {};
  if (!descriptor.domains?.includes('writing')) return route;
  if (descriptor.writingLanguageSource === 'inline-source') return route;
  if (!(descriptor.writingSourceTargets ?? descriptor.workspaceWriteTargets ?? []).length) return route;

  const observed = readWritingTargets(route, ctx);
  if (!observed.text) return route;

  route = routeNaturalLanguageTask({
    prompt: String(prompt ?? ''),
    sourceText: observed.texts.length > 1 ? observed.texts : observed.text,
  });
  return {
    ...route,
    writingSourceObservation: {
      kind: 'workspace-target',
      paths: observed.paths,
      languages: observed.languages,
      truncated: observed.truncated,
    },
  };
}

function readWritingTargets(route, ctx = {}) {
  const targets = route.taskDescriptor?.writingSourceTargets
    ?? route.taskDescriptor?.workspaceWriteTargets
    ?? [];
  if (!targets.length) return { text: '', texts: [], paths: [], languages: [], truncated: false };

  let root;
  try {
    root = realpathSync(ctx.cwd || process.cwd());
  } catch {
    return { text: '', texts: [], paths: [], languages: [], truncated: false };
  }

  const texts = [];
  const paths = [];
  let truncated = false;
  for (const target of targets.slice(0, MAX_WRITING_SOURCE_FILES)) {
    const candidate = safeWorkspaceFile(root, target);
    if (!candidate) continue;
    let fd;
    try {
      fd = openSync(candidate, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      const openedPath = openedFileRealpath(fd);
      if (!openedPath || !isWithinWorkspace(root, openedPath)) continue;
      const stats = fstatSync(fd);
      if (!stats.isFile() || stats.size > MAX_WRITING_SOURCE_BYTES) continue;
      const content = readFileSync(fd, 'utf8');
      if (!content || content.includes('\u0000')) continue;
      texts.push(content.slice(0, MAX_WRITING_SOURCE_CHARS));
      paths.push(relative(root, openedPath) || String(target));
      if (content.length > MAX_WRITING_SOURCE_CHARS) truncated = true;
    } catch {
      // Missing, binary, unreadable, and transient targets simply leave the
      // writing language pending. Routing must never turn a read failure into
      // a host execution failure.
    } finally {
      if (Number.isInteger(fd)) {
        try {
          closeSync(fd);
        } catch {
          // The optional language observation is already complete or failed.
        }
      }
    }
  }
  return {
    text: texts.join('\n\n'),
    texts,
    paths,
    languages: texts.map((text) => detectWritingSourceLanguage(text)),
    truncated,
  };
}

function hasWritingSource(value) {
  return typeof value === 'string' ? Boolean(value.trim()) : Array.isArray(value) && value.some((item) => typeof item === 'string' && item.trim());
}

function safeWorkspaceFile(root, target) {
  const value = String(target ?? '').trim();
  if (!value || /[*?{}[\]\u0000]/u.test(value) || /^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return null;
  try {
    const candidate = realpathSync(isAbsolute(value) ? value : resolve(root, value));
    if (!isWithinWorkspace(root, candidate)) return null;
    return candidate;
  } catch {
    return null;
  }
}

function openedFileRealpath(fd) {
  for (const prefix of ['/proc/self/fd', '/dev/fd']) {
    try {
      return realpathSync(`${prefix}/${fd}`);
    } catch {
      // Try the next host-specific descriptor path. If neither is available,
      // fail closed and keep the writing language pending.
    }
  }
  return null;
}

function isWithinWorkspace(root, candidate) {
  const fromRoot = relative(root, candidate);
  return fromRoot !== '..' && !fromRoot.startsWith('../') && !isAbsolute(fromRoot);
}

function decorateTaskAssignments(event, state) {
  const roles = routeRoles(state.lastRoute);
  const byName = new Map(roles.map((role) => [roleName(role), role]));
  for (const item of taskInputItems(event)) {
    const name = roleName(item);
    const suggestion = byName.get(name);
    if (!name || !suggestion) continue;
    const key = assignmentKey(item);
    const current = String(item[key] ?? '');
    if (/OMP_WORKFLOW_ROLE:/i.test(current)) continue;
    item[key] = [
      current,
      '',
      'OMP_WORKFLOW_ROLE: ' + name,
      state.lastPrompt ? 'Parent task context: ' + state.lastPrompt.slice(0, 800) : null,
      suggestion.duty ? 'Suggested checkpoint: ' + suggestion.duty : null,
      'Suggested skills for this role:',
      ...roleSkills(suggestion).map((skill) => '- skill://' + skill),
      'This is advisory workflow context. Adapt it to the observed task and available runtime.',
      formatWorkflowBriefingForAssignment(state.lastRoute),
    ].filter(Boolean).join('\n');
  }
}

function recordTaskDispatch(state, event) {
  const items = taskInputItems(event);
  if (!items.length) return;
  state.taskSequence += 1;
  const id = toolEventCallId(event) || 'task-' + state.taskSequence;
  state.tasks.set(id, {
    id,
    status: 'running',
    roles: items.map(roleName).filter(Boolean),
    summary: items.map((item) => String(item[assignmentKey(item)] ?? '').split(/\r?\n/)[0]).filter(Boolean).join('; '),
    startedAt: Date.now(),
    updatedAt: Date.now(),
  });
}

function recordTaskResult(state, event) {
  const id = toolEventCallId(event);
  const record = id
    ? state.tasks.get(id)
    : [...state.tasks.values()].findLast((item) => item.status === 'running');
  const details = event.result?.details ?? event.details ?? {};
  const results = Array.isArray(details.results) ? details.results : [];
  const failed = toolEventFailed(event);
  const pending = toolEventPending(event);
  const status = failed ? 'failed' : pending ? 'running' : 'completed';
  const roles = results.map((item) => roleName(item)).filter(Boolean);
  const effectiveRoles = roles.length ? roles : record?.roles ?? [];
  const task = {
    ...(record ?? {
      id: id || 'task-result-' + (state.taskSequence + 1),
      roles: effectiveRoles,
      startedAt: Date.now(),
    }),
    status,
    roles: effectiveRoles,
    summary: firstText([
      details.summary,
      event.result?.summary,
      extractText(event.result?.content),
      record?.summary,
    ]),
    updatedAt: Date.now(),
  };
  state.tasks.set(task.id, task);
  if (status === 'completed') {
    for (const role of effectiveRoles) state.completedRoles.add(role);
  }
}

function recordSkillReads(state, event) {
  const skill = verifiedSkillReadName(event);
  if (skill) state.observedSkills.add(normalizeSkillName(skill));
}

function verifiedSkillReadName(event = {}) {
  const declaredName = skillFrontmatterName(readResultText(event));
  if (!declaredName) return '';

  const requestedNames = collectSkillReadNames(event);
  if (!requestedNames.length) return '';
  const requestedTokens = new Set(requestedNames.map(skillEvidenceToken).filter(Boolean));
  const declaredToken = skillEvidenceToken(declaredName);
  if (requestedTokens.has(declaredToken)) return declaredName;

  const inventoryNames = skillReadNameCandidates(declaredName, { limit: 64 });
  return inventoryNames.some((name) => requestedTokens.has(skillEvidenceToken(name)))
    ? declaredName
    : '';
}

function readResultText(event = {}) {
  const result = event.result;
  if (typeof result === 'string') return result;
  if (result?.content !== undefined) return readContentText(result.content);
  if (result?.output !== undefined) return readContentText(result.output);
  if (event.content !== undefined) return readContentText(event.content);
  if (event.output !== undefined) return readContentText(event.output);
  return '';
}

function readContentText(value) {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n');
}

function skillFrontmatterName(text = '') {
  const frontmatter = String(text)
    .replace(/^\uFEFF/, '')
    .match(/^\s*---[ \t]*\r?\n([\s\S]*?)\r?\n---(?:[ \t]*\r?\n|\s*$)/);
  if (!frontmatter) return '';
  const match = frontmatter[1].match(/^name\s*:\s*(.*?)\s*$/mi);
  if (!match) return '';
  const value = match[1].trim();
  const unquoted = (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) ? value.slice(1, -1).trim() : value.replace(/\s+#.*$/, '').trim();
  return /^[A-Za-z0-9_.\/-]+$/.test(unquoted) ? unquoted : '';
}

function skillEvidenceToken(value = '') {
  return String(value)
    .trim()
    .replace(/^skill:\/\//i, '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase();
}

function collectSkillReadNames(event = {}) {
  const input = event.input ?? event.params ?? event.arguments ?? {};
  return unique([
    ...collectSkillUris(input),
    ...collectSkillFilePaths(input),
  ]);
}

function collectSkillUris(value, seen = new Set()) {
  if (typeof value === 'string') {
    return [...value.matchAll(/skill:\/\/([A-Za-z0-9_.\/-]+)/g)].map((match) => match[1]);
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return [];
  seen.add(value);
  if (Array.isArray(value)) return value.flatMap((item) => collectSkillUris(item, seen));
  return Object.entries(value).flatMap(([key, child]) => (
    ['content', 'output', 'result', 'response', 'message', 'text', 'stdout', 'stderr'].includes(key)
      ? []
      : collectSkillUris(child, seen)
  ));
}

function collectSkillFilePaths(value, seen = new Set()) {
  if (typeof value === 'string') {
    const normalized = value.replace(/\\/g, '/').replace(/[?#].*$/, '');
    const match = normalized.match(/(?:^|\/)\s*([^/]+)\/SKILL\.md$/i);
    return match?.[1] ? [match[1]] : [];
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return [];
  seen.add(value);
  if (Array.isArray(value)) return value.flatMap((item) => collectSkillFilePaths(item, seen));
  return Object.values(value).flatMap((child) => collectSkillFilePaths(child, seen));
}

function buildWorkflowStatus(state) {
  const route = state.lastRoute;
  return {
    mode: 'advisory',
    auto_continue: false,
    route: route?.intent ?? 'none',
    active_route: route?.intent ?? 'none',
    last_probe_route: state.lastRouteProbe?.route?.intent ?? 'none',
    last_probe_changed_active_route: false,
    suggested_skills: routeSkills(route),
    suggested_tools: routeTools(route),
    suggested_roles: routeRoles(route).map((role) => ({
      agent: roleName(role),
      duty: typeof role === 'object' ? String(role.duty ?? '') : '',
      skills: roleSkills(role),
    })),
    quality_checks: route?.routePlan?.qualityChecks ?? [],
    observed_skills: [...state.observedSkills],
    claimed_skills: [...state.claimedSkills],
    loaded_skills: [...state.observedSkills],
    completed_roles: [...state.completedRoles],
    tasks: [...state.tasks.values()],
    skill_review: state.lastSkillUsage,
    role_review: state.lastSubagentUsage,
  };
}

function formatWorkflowStatus(status) {
  return [
    'Mode: ' + status.mode,
    'Auto-continue: ' + status.auto_continue,
    'Route: ' + status.route,
    'Active route: ' + status.active_route,
    'Last probe route: ' + status.last_probe_route,
    'Suggested skills: ' + (status.suggested_skills.join(', ') || 'none'),
    'Suggested tools: ' + (status.suggested_tools.join(', ') || 'none'),
    'Observed skills: ' + (status.observed_skills.join(', ') || 'none'),
    'Claimed skills: ' + (status.claimed_skills.join(', ') || 'none'),
    'Suggested quality checks: ' + (status.quality_checks.join(', ') || 'none'),
    'Suggested roles:',
    ...(status.suggested_roles.length
      ? status.suggested_roles.map((role) => '- ' + role.agent + (role.duty ? ': ' + role.duty : ''))
      : ['- none']),
    'Observed completed roles:',
    ...(status.completed_roles.length ? status.completed_roles.map((role) => '- ' + role) : ['- none']),
    'Observed tasks:',
    ...(status.tasks.length
      ? status.tasks.map((task) => '- ' + task.id + ': ' + task.status + (task.roles.length ? ' (' + task.roles.join(', ') + ')' : ''))
      : ['- none']),
  ].join('\n');
}

function formatRoute(route) {
  const descriptor = route?.taskDescriptor ?? {};
  const constraints = descriptor.constraints ?? {};
  const phases = Array.isArray(descriptor.phases) ? descriptor.phases : [];
  return [
    'Intent: ' + (route?.intent ?? 'unknown'),
    'Workflow: ' + (route?.workflowRoute ?? 'agentic.simple'),
    'Mode: advisory',
    'Auto-continue: false',
    'Writing language: ' + (descriptor.language ?? 'unknown'),
    'Writing language source: ' + (descriptor.writingLanguageSource ?? 'none'),
    'constraints.workspaceWrite: ' + (constraints.workspaceWrite ?? 'unspecified'),
    'constraints.testExecution: ' + (constraints.testExecution ?? 'unspecified'),
    'constraints.networkAccess: ' + (constraints.networkAccess ?? 'unspecified'),
    'constraints.externalWrite: ' + (constraints.externalWrite ?? 'unspecified'),
    'constraints.subagents: ' + (constraints.subagents ?? 'unspecified'),
    'complexity: ' + (descriptor.complexity ?? 'unknown'),
    'phases: ' + (phases.length ? phases.map((phase) => phase.kind + ':' + phase.domain).join(' -> ') : 'none'),
    'Workflow skills: ' + (routeSkills(route).join(', ') || 'none'),
    'Workflow tools: ' + (routeTools(route).join(', ') || 'none'),
    'Workflow roles: ' + (routeRoles(route).map(roleName).filter(Boolean).join(', ') || 'none'),
    'Quality checks: ' + ((route?.routePlan?.qualityChecks ?? []).join(', ') || 'none'),
  ].join('\n');
}

function formatRouteProbeGuidance(route) {
  if (route?.intent !== 'writing.pending') return '';
  if (route?.taskDescriptor?.language === 'mixed') {
    return [
      '',
      'Writing source language: mixed.',
      'Select Chinese or English guidance per target or section instead of forcing one global language skill.',
    ].join('\n');
  }
  return [
    '',
    'Writing language is pending because no target prose was available.',
    'Read the target text and probe again with sourceText before selecting Chinese or English writing skills.',
  ].join('\n');
}

function routeSkills(route) {
  return unique(route?.routePlan?.skills ?? route?.skills ?? route?.requiredSkills ?? []);
}

function routeTools(route) {
  return unique(route?.routePlan?.tools ?? route?.tools ?? route?.requiredTools ?? []);
}

function routeRoles(route) {
  const values = route?.routePlan?.roles ?? route?.roles ?? route?.requiredSubagents ?? [];
  return values.map((value) => {
    if (typeof value === 'string') return { agent: value, duty: '', skills: [] };
    return {
      ...value,
      agent: roleName(value),
      skills: roleSkills(value),
    };
  }).filter((value) => value.agent);
}

function roleName(value) {
  if (typeof value === 'string') return value;
  return value?.agent ?? value?.role ?? value?.name ?? '';
}

function roleSkills(value) {
  if (!value || typeof value === 'string') return [];
  return unique(value.skills ?? value.requiredSkills ?? []);
}

function emptySubagentRoute() {
  return {
    intent: 'subagent',
    agent: null,
    advisoryOnly: true,
    autoContinue: false,
    routePlan: {
      version: 2,
      mode: 'advisory',
      autoContinue: false,
      steps: [],
      skills: [],
      tools: [],
      roles: [],
      qualityChecks: [],
      riskNotes: [],
    },
  };
}

function resetState(state) {
  Object.assign(state, createState());
}

function restoreStateFromContext(state, ctx = {}) {
  const entries = ctx.sessionManager?.getBranch?.();
  if (!Array.isArray(entries)) return false;
  const entry = entries.findLast((candidate) => (
    candidate?.customType === CORE_STATE_ENTRY
      && (candidate.type === undefined || candidate.type === 'custom')
  ));
  if (!entry?.data || typeof entry.data !== 'object') return false;
  const restored = readStateSnapshot(entry.data);
  Object.assign(state, restored);
  return true;
}

function readStateSnapshot(value = {}) {
  const state = createState();
  state.lastPrompt = typeof value.lastPrompt === 'string' ? value.lastPrompt : '';
  state.routeStartedAt = Number.isFinite(value.routeStartedAt) ? value.routeStartedAt : 0;
  state.lastRoute = sanitizeRestoredRoute(value.lastRoute, state.lastPrompt);
  state.lastRouteProbe = sanitizeRouteProbe(value.lastRouteProbe);
  state.lastSkillUsage = isRecord(value.lastSkillUsage) ? value.lastSkillUsage : null;
  state.lastSubagentUsage = isRecord(value.lastSubagentUsage) ? value.lastSubagentUsage : null;
  state.classifierAttempted = value.classifierAttempted === true;

  const legacyEvidence = isRecord(value.evidence) ? value.evidence : {};
  for (const skill of arrayValue(value.observedSkills)) {
    if (typeof skill === 'string') state.observedSkills.add(normalizeSkillName(skill));
  }
  const priorClaims = Number(value.schemaVersion) >= STATE_SCHEMA_VERSION
    ? arrayValue(value.claimedSkills)
    : unique([
      ...arrayValue(value.claimedSkills),
      ...arrayValue(value.loadedSkills),
      ...arrayValue(legacyEvidence.loadedSkills),
    ]);
  for (const skill of priorClaims) {
    if (typeof skill === 'string') state.claimedSkills.add(normalizeSkillName(skill));
  }
  const taskValues = arrayValue(value.tasks, legacyEvidence.taskProgress);
  for (const raw of taskValues) {
    const task = sanitizeTaskRecord(raw);
    if (task) state.tasks.set(task.id, task);
  }
  for (const role of arrayValue(
    value.completedRoles,
    legacyEvidence.taskSubagents,
    legacyEvidence.forkedSubagents,
  )) {
    if (typeof role === 'string' && role) state.completedRoles.add(role);
  }
  state.taskSequence = Number.isInteger(value.taskSequence) && value.taskSequence >= 0
    ? value.taskSequence
    : state.tasks.size;
  return state;
}

function sanitizeRestoredRoute(route, prompt = '') {
  if (!isRecord(route)) return null;
  if (route.taskDescriptor && route.routePlan?.version === 2) {
    const {
      hardBlock: _hardBlock,
      hardBlockReasons: _hardBlockReasons,
      shouldForkSubagents: _shouldForkSubagents,
      gateMode: _gateMode,
      skillGateMode: _skillGateMode,
      gateRecoveryMode: _gateRecoveryMode,
      approvalState: _approvalState,
      actionBoundary: _actionBoundary,
      gateController: _gateController,
      ...advisoryRoute
    } = route;
    return {
      ...advisoryRoute,
      advisoryOnly: true,
      autoContinue: false,
      routePlan: sanitizeRoutePlan(route.routePlan),
    };
  }
  if (prompt) {
    const rerouted = routeNaturalLanguageTask({ prompt });
    if (rerouted.intent === route.intent || route.intent === 'unknown') return rerouted;
  }
  const skills = unique(route.skills ?? route.requiredSkills ?? []);
  const tools = unique(route.tools ?? route.requiredTools ?? []);
  const roles = (route.roles ?? route.requiredSubagents ?? []).map((role) => ({
    agent: roleName(role),
    duty: typeof role === 'object' ? String(role.duty ?? '') : '',
    skills: roleSkills(role),
  })).filter((role) => role.agent);
  return {
    intent: route.intent ?? 'unknown',
    agent: route.agent ?? null,
    workflowRoute: route.workflowRoute ?? 'agentic.simple',
    source: route.source ?? 'legacy-state',
    advisoryOnly: true,
    autoContinue: false,
    routePlan: {
      version: 2,
      mode: 'advisory',
      autoContinue: false,
      steps: [],
      skills,
      tools,
      roles,
      qualityChecks: [],
      riskNotes: ['This route was migrated from legacy advisory metadata.'],
    },
    skills,
    tools,
    roles,
    requiredSkills: skills,
    requiredTools: tools,
    requiredSubagents: roles.map((role) => ({
      agent: role.agent,
      duty: role.duty,
      requiredSkills: role.skills,
    })),
  };
}

function sanitizeRoutePlan(plan = {}) {
  return {
    version: 2,
    mode: 'advisory',
    autoContinue: false,
    steps: Array.isArray(plan.steps) ? plan.steps : [],
    skills: unique(plan.skills),
    tools: unique(plan.tools),
    roles: (Array.isArray(plan.roles) ? plan.roles : []).map((role) => ({
      agent: roleName(role),
      duty: typeof role === 'object' ? String(role.duty ?? '') : '',
      skills: roleSkills(role),
      ...(typeof role === 'object' && Array.isArray(role.modelRoles)
        ? { modelRoles: unique(role.modelRoles) }
        : {}),
    })).filter((role) => role.agent),
    qualityChecks: unique(plan.qualityChecks),
    riskNotes: unique(plan.riskNotes),
    ...(plan.legacyIntent ? { legacyIntent: plan.legacyIntent } : {}),
    ...(plan.workflowRoute ? { workflowRoute: plan.workflowRoute } : {}),
  };
}

function sanitizeRouteProbe(value) {
  if (!isRecord(value) || !isRecord(value.route)) return null;
  return {
    route: sanitizeRestoredRoute(value.route, value.prompt),
    prompt: typeof value.prompt === 'string' ? value.prompt : '',
    changedActiveRoute: false,
    probedAt: Number.isFinite(value.probedAt) ? value.probedAt : 0,
  };
}

function sanitizeTaskRecord(value) {
  if (!isRecord(value)) return null;
  const id = String(value.id ?? value.key ?? '').trim();
  if (!id) return null;
  const status = ['running', 'completed', 'failed'].includes(value.status)
    ? value.status
    : 'completed';
  return {
    id,
    status,
    roles: Array.isArray(value.roles) ? value.roles.filter((role) => typeof role === 'string') : [],
    summary: String(value.summary ?? value.text ?? '').slice(0, 1000),
    startedAt: Number.isFinite(value.startedAt) ? value.startedAt : 0,
    updatedAt: Number.isFinite(value.updatedAt) ? value.updatedAt : 0,
  };
}

async function persistState(pi, state) {
  if (typeof pi.appendEntry !== 'function') return;
  try {
    await pi.appendEntry(CORE_STATE_ENTRY, serializeState(state));
  } catch {
    // Advisory state is optional. Persistence failure must not affect the host
    // task or any tool result.
  }
}

function serializeState(state) {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    lastRoute: state.lastRoute,
    lastPrompt: state.lastPrompt,
    routeStartedAt: state.routeStartedAt,
    lastRouteProbe: state.lastRouteProbe,
    lastSkillUsage: state.lastSkillUsage,
    lastSubagentUsage: state.lastSubagentUsage,
    classifierAttempted: state.classifierAttempted,
    observedSkills: [...state.observedSkills],
    claimedSkills: [...state.claimedSkills],
    tasks: [...state.tasks.values()],
    completedRoles: [...state.completedRoles],
    taskSequence: state.taskSequence,
  };
}

function injectBeforeAgentSystemPrompt(event = {}, fragment = '') {
  const existing = Array.isArray(event.systemPrompt)
    ? event.systemPrompt.filter((block) => typeof block === 'string' && block)
    : typeof event.systemPrompt === 'string' && event.systemPrompt
      ? [event.systemPrompt]
      : [];
  const systemPrompt = [...existing, String(fragment)];
  event.systemPrompt = systemPrompt;
  event.additionalContext = [event.additionalContext, fragment].filter(Boolean).join('\n\n');
  return {
    systemPrompt,
    additionalContext: fragment,
  };
}

function classifierPromptContext(state, prompt = '') {
  return unique([state.lastPrompt, String(prompt ?? '')]).filter(Boolean).slice(-4);
}

function shouldInheritContinuation(state, prompt = '') {
  if (!state.lastRoute || !state.lastPrompt) return false;
  const text = String(prompt ?? '')
    .trim()
    .toLowerCase()
    .replace(/[。！？.!?]+$/u, '')
    .replace(/^(?:please\s+|请\s*|麻烦\s*)/u, '');
  return /^(?:继续(?:吧|执行|实现|修复|开发)?|开始吧|开始(?:执行|实现|修复|开发)(?:吧)?|按(?:照)?(?:这个|该|上述)?计划执行|照(?:这个|该|上述)?方案做|就(?:按)?这么做|执行吧|go ahead|continue|proceed(?: with (?:the|this) plan)?|start now|do it)$/i.test(text);
}

function isPlanningImplementationTransition(state, prompt = '') {
  if (!state.lastRoute || !state.lastPrompt) return false;
  if (!shouldInheritContinuation(state, prompt)) return false;
  const route = state.lastRoute;
  const planning = route.intent === 'planning'
    || route.workflowRoute === 'code.plan'
    || route.taskDescriptor?.provenance?.reasons?.includes('implementation or test planning requested');
  if (!planning) return false;
  const next = routeNaturalLanguageTask({ prompt: String(prompt ?? '') });
  return ['modify', 'create'].includes(next.taskDescriptor?.operation)
    && next.taskDescriptor?.constraints?.workspaceWrite === 'required';
}

function isSlashCommandPrompt(prompt) {
  return /^\/[A-Za-z][A-Za-z0-9:_-]*(?:\s|$)/.test(String(prompt ?? '').trim());
}

function isSubagentLaunchPrompt(prompt) {
  return /OMP_WORKFLOW_ROLE:|OMP_REQUIRED_SUBAGENT:|Suggested skills for this role:|Required skills for this subagent:/i.test(String(prompt));
}

function taskInputItems(event = {}) {
  const input = event.input ?? event.params ?? event.arguments ?? {};
  if (Array.isArray(input.tasks)) return input.tasks.filter(isRecord);
  return isRecord(input) && roleName(input) ? [input] : [];
}

function assignmentKey(item) {
  for (const key of ['assignment', 'prompt', 'task', 'message']) {
    if (typeof item?.[key] === 'string') return key;
  }
  return 'assignment';
}

function toolEventName(event = {}) {
  return event.name ?? event.toolName ?? event.details?.toolName ?? event.tool?.name ?? '';
}

function toolEventCallId(event = {}) {
  const value = event.callId
    ?? event.call_id
    ?? event.toolCallId
    ?? event.tool_call_id
    ?? event.id
    ?? event.details?.callId
    ?? event.details?.toolCallId;
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function toolEventFailed(event = {}) {
  const status = String(
    event.status
      ?? event.result?.status
      ?? event.details?.status
      ?? '',
  ).toLowerCase();
  return event.isError === true
    || event.result?.isError === true
    || event.error != null
    || ['failed', 'failure', 'error', 'aborted', 'cancelled', 'canceled'].includes(status);
}

function toolEventPending(event = {}) {
  const status = String(
    event.status
      ?? event.result?.status
      ?? event.details?.status
      ?? event.details?.async?.state
      ?? '',
  ).toLowerCase();
  return ['pending', 'running', 'started', 'in_progress', 'in-progress'].includes(status);
}

function extractPrompt(event = {}) {
  return String(event.prompt ?? event.userPrompt ?? event.message ?? event.task ?? '');
}

function extractText(value, seen = new Set()) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || seen.has(value)) return '';
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => extractText(item, seen)).filter(Boolean).join('\n');
  return Object.values(value).map((item) => extractText(item, seen)).filter(Boolean).join('\n');
}

function firstText(values = []) {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim().slice(0, 1000) ?? '';
}

function skillCoverageReview(validation, suggestedSkills = [], { claimedSkills = [] } = {}) {
  const gaps = unique([
    ...(validation.missing ?? []),
    ...(validation.invalid ?? []),
    ...(validation.denied ?? []),
  ]);
  const observed = unique(validation.loaded ?? []);
  const claimed = unique([...claimedSkills]);
  const unobservedClaims = claimed.filter((claim) => (
    !observed.some((skill) => skillNamesEquivalent(claim, skill))
  ));
  return {
    advisory: true,
    complete: gaps.length === 0,
    suggested: unique(suggestedSkills),
    observed,
    claimed,
    unobservedClaims,
    gaps,
    summary: gaps.length
      ? 'Advisory skill coverage gaps: ' + gaps.join(', ') + '. Continue with the best available method and report material limitations.'
      : 'Advisory skill coverage: the suggested skills were observed or none were suggested.',
  };
}

function roleCoverageReview(validation, suggestedRoles = []) {
  const missingSkillObservations = (validation.missingSkills ?? []).map(({ agent, skills }) => ({
    agent,
    skills: unique(skills),
  }));
  const missingRoles = unique(validation.missing ?? []);
  return {
    advisory: true,
    complete: missingRoles.length === 0 && missingSkillObservations.length === 0,
    suggested: suggestedRoles.map(roleName).filter(Boolean),
    observed: unique(validation.forked ?? []),
    gaps: {
      roles: missingRoles,
      skills: missingSkillObservations,
    },
    summary: missingRoles.length || missingSkillObservations.length
      ? 'Advisory role coverage has unobserved suggestions. Continue directly or delegate where useful; these observations do not control completion.'
      : 'Advisory role coverage: the suggested roles were observed or none were suggested.',
  };
}

function okResult(text, details = {}) {
  return {
    content: [{ type: 'text', text: String(text) }],
    details,
    isError: false,
  };
}

async function writeDebugLog(ctx = {}, kind = 'routes', record = {}) {
  try {
    await appendDebugLog({
      cwd: ctx.cwd || process.cwd(),
      kind,
      record,
      env: process.env,
    });
  } catch {
    // Debug logging is optional advisory telemetry.
  }
}

function arrayValue(...values) {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unique(values = []) {
  return [...new Set((values ?? []).filter(Boolean))];
}
