const SHELL_TOOL = /^(?:bash|shell|terminal|exec|exec_command|run|run_command|command|python|node|functions_(?:bash|shell|terminal|exec|exec_command|run|run_command|command|python|node))$/i;
const DIRECT_WRITE_TOOL = /^(?:edit|write|patch|apply_patch|edit_file|write_file|patch_file|create_file|functions_(?:edit|write|patch|apply_patch|edit_file|write_file|patch_file|create_file))$/i;
const SUBAGENT_TOOL = /^(?:task|spawn_agent|delegate|collaboration_(?:spawn_agent|delegate|followup_task|send_message|wait_agent|interrupt_agent|list_agents))$/i;
const NETWORK_TOOL = /(?:^|[_-])(?:web|web_search|fetch|http|browser)(?:$|[_-])/i;
const MUTATION_TOOL_TOKEN = /(?:^|[_-])(?:write|append|replace|edit|patch|apply|create|add|set|touch|mkdir|chmod|chown|truncate|archive|share|rsvp|assign|label|comment|react|like|approve|rerequest|join|mark|update|delete|remove|rename|move|copy|upload|publish|deploy|push|merge|close|reopen|destroy|purge|submit|send|post|install|upgrade)(?:$|[_-])/i;
const DESTRUCTIVE_TOOL_TOKEN = /(?:^|[_-])(?:delete|remove|destroy|purge|wipe|clear)(?:$|[_-])/i;
const REMOTE_TOOL_NAMESPACE = /(?:^|[_-])(?:github|gitlab|bitbucket|linear|jira|slack|email|notion|database|aws|gcloud|azure|docker|kubernetes|kubectl|helm|terraform|browser|web)(?:$|[_-])/i;
const LOCAL_FILESYSTEM_NAMESPACE = /(?:^|[_-])(?:filesystem|file_system|local_file)(?:$|[_-])/i;
const LOCAL_FILESYSTEM_READ_TOOL = /(?:^|[_-])(?:read(?:_multiple)?_files?|list(?:_allowed)?_(?:files?|directories)|list_directory|search_files?|directory_tree|get_file_info|stat|exists|glob|grep)(?:$|[_-])/i;
const REMOTE_READ_TOOL_VERB = /^(?:get|list|search|read|view|describe|fetch|lookup|status|history|inspect|download|check|find|query)$/i;
const REMOTE_NON_READ_TOOL_TOKEN = /^(?:write|append|replace|edit|patch|apply|create|add|set|touch|archive|share|rsvp|assign|label|labels|comment|comments|react|reaction|reactions|like|approve|approval|rerequest|retry|rerun|join|invite|mark|update|delete|remove|rename|move|copy|upload|publish|deploy|push|merge|close|reopen|destroy|purge|submit|send|post|install|upgrade)$/i;
const REMOTE_READ_OBJECT_TOKEN = /^(?:archive|label|labels|comment|comments|reaction|reactions|approval|approvals)$/i;
const LOCAL_PLATFORM_TOOL = /^(?:read|grep|glob|view_image|write_stdin|update_plan|todo|request_user_input|get_goal|create_goal|update_goal|request_plugin_install|functions_(?:read|grep|glob|view_image|write_stdin|update_plan|todo|request_user_input|get_goal|create_goal|update_goal|request_plugin_install)|collaboration_(?:spawn_agent|delegate|send_message|followup_task|interrupt_agent|list_agents|wait_agent)|omp_core_[a-z0-9_]+|omp_test_[a-z0-9_]+|omp_config_[a-z0-9_]+|writing_(?:quality|logic)_check|fact_check_(?:gate|evidence|analyze|report))$/i;
const COMMAND_EXPANSION_EXHAUSTED = '__omp_command_expansion_exhausted__';

export function classifyToolAction({ toolName = '', text = '' } = {}) {
  const name = canonicalToolName(toolName);
  const rawSource = String(text);
  const source = rawSource.toLowerCase();
  const shell = SHELL_TOOL.test(name);
  const tokenNamedMutation = MUTATION_TOOL_TOKEN.test(name);
  const remoteTool = REMOTE_TOOL_NAMESPACE.test(name);
  const mcpTool = /(?:^|_)mcp(?:_|$)/i.test(name);
  const localFilesystemTool = LOCAL_FILESYSTEM_NAMESPACE.test(name);
  const localPlatformTool = LOCAL_PLATFORM_TOOL.test(name);
  const remoteProvider = (remoteTool || mcpTool) && !localFilesystemTool && !localPlatformTool;
  const namedRemoteOperation = remoteProvider ? classifyNamedRemoteOperation(name) : 'not-remote';
  const namedMutation = remoteProvider ? namedRemoteOperation === 'write' : tokenNamedMutation;
  const knownLocalTool = shell
    || DIRECT_WRITE_TOOL.test(name)
    || LOCAL_FILESYSTEM_NAMESPACE.test(name)
    || SUBAGENT_TOOL.test(name)
    || localPlatformTool;
  const knownNetworkTool = NETWORK_TOOL.test(name) || /^(?:curl|wget)$/i.test(name);
  const unknownTool = Boolean(name) && !knownLocalTool && !remoteProvider && !knownNetworkTool;
  const unknownNamedMutation = unknownTool && namedMutation;
  const commandExpansionExhausted = shell
    && commandSegments(rawSource).some(isCommandExpansionExhausted);
  const remoteOperation = remoteProvider ? classifyGenericRemoteOperation(name, rawSource) : 'not-generic';
  const benignBrowserInteraction = /(?:^|[_-])(?:browser|web)(?:$|[_-])/i.test(name)
    && /(?:^|[_-])(?:open|navigate|screenshot)(?:$|[_-])/i.test(name)
    && !isInteractiveExternalMutation(name, rawSource);
  const remoteReadOnly = remoteProvider
    && (remoteOperation === 'read'
      || remoteOperation === 'not-generic' && namedRemoteOperation === 'read'
      || benignBrowserInteraction);
  const remoteFailClosedMutation = remoteProvider && !remoteReadOnly && remoteOperation !== 'read';
  const localFilesystemMutation = localFilesystemTool
    && (namedMutation || !LOCAL_FILESYSTEM_READ_TOOL.test(name));
  const embeddedActions = embeddedShellActions(name, rawSource);
  const browserCheck = name === 'omp_test_browser_check';
  const remoteBrowserTarget = browserCheck && hasNonLoopbackBrowserTarget(rawSource);
  const testExecution = isTestExecution(name, source);
  const migrationExecution = shell && isMigrationAutomationInvocation(source);
  const devServerExecution = shell && isDevServerAutomationInvocation(source);
  const agentCliExecution = shell && isAgentCliExecution(source);
  const observationalSubagentStatus = name.toLowerCase() === 'omp_core_subagent_status';
  const externalWrite = (remoteTool || mcpTool && !localFilesystemTool) && namedMutation
    || remoteFailClosedMutation
    || unknownNamedMutation
    || remoteBrowserTarget
    || embeddedActions.some((action) => action.externalWrite)
    || remoteOperation === 'write'
    || isInteractiveExternalMutation(name, rawSource)
    || isExternalWrite(name, source, rawSource);
  const networkAccess = externalWrite
    || migrationExecution
    || devServerExecution
    || agentCliExecution
    || remoteBrowserTarget
    || embeddedActions.some((action) => action.networkAccess)
    || remoteProvider
    || isNetworkAccess(name, source);
  const irreversible = migrationExecution
    || DESTRUCTIVE_TOOL_TOKEN.test(name)
    || embeddedActions.some((action) => action.irreversible)
    || isIrreversibleAction(name, source, rawSource);
  const knownWorkspaceWrite = DIRECT_WRITE_TOOL.test(name)
    || localFilesystemMutation
    || embeddedActions.some((action) => action.definiteWorkspaceMutation)
    || shell && isKnownWorkspaceWrite(source);
  const testSnapshotWrite = shell && testExecution
    && /(?:--updateSnapshot\b|--update-snapshots?\b|(?:^|\s)-u(?:\s|$))/i.test(rawSource);
  const definiteWorkspaceMutation = knownWorkspaceWrite || testSnapshotWrite;
  const repositoryAutomation = shell && isRepositoryControlledAutomation(source);
  const opaqueEffects = commandExpansionExhausted
    || agentCliExecution
    || remoteOperation === 'unknown' && !namedMutation
    || embeddedActions.some((action) => action.opaqueEffects)
    || shell && !knownWorkspaceWrite && !testExecution && hasOpaqueShellEffects(source);
  const unverifiableTestEffects = shell
    && !testExecution
    && !isProvablyTestFreeShell(source);
  const unverifiableNetworkEffects = !networkAccess && (
    shell && (repositoryAutomation || hasUnverifiableNetworkEffects(source))
    || embeddedActions.some((action) => action.unverifiableNetworkEffects)
    || unknownTool
  );
  const unverifiableWorkspaceEffects = browserCheck
    || shell && repositoryAutomation
    || embeddedActions.some((action) => action.unverifiableWorkspaceEffects);
  const workspaceWrite = definiteWorkspaceMutation
    || shell && !testExecution && !externalWrite && !isProvablyReadOnlyShell(source);

  return {
    workspaceWrite,
    definiteWorkspaceMutation,
    testExecution,
    networkAccess,
    externalWrite,
    opaqueEffects,
    unverifiableTestEffects,
    unverifiableNetworkEffects,
    unverifiableWorkspaceEffects,
    irreversible,
    subagent: !observationalSubagentStatus && (agentCliExecution
      || embeddedActions.some((action) => action.subagent)
      || SUBAGENT_TOOL.test(name)
      || /(?:^|[_-])(?:spawn(?:_agent)?|delegate|subagent)(?:$|[_-])/i.test(name)),
  };
}

export function classifyTestExecutionScope({ toolName = '', text = '' } = {}) {
  const name = canonicalToolName(toolName);
  if (name === 'omp_test_browser_check') return 'focused';
  const raw = String(text).trim();
  const parsed = shellSegments(text);
  const testSegments = commandSegments(text)
    .filter((segment) => isTestExecution('', segment.toLowerCase()))
    .filter((segment) => !isNonExecutingTestPlan(segment))
    .map((segment) => segment.toLowerCase());
  if (!testSegments.length) return 'none';
  if (hasIndirectTestWrapper(raw)
    || hasAggregatePackageManagerTestOptions(raw)
    || parsed.untrusted
    || parsed.redirection
    || parsed.operators.length > 0) return 'aggregate-or-unknown';
  return testSegments.every(isProvablyFocusedTestSegment) ? 'focused' : 'aggregate-or-unknown';
}

function isProvablyFocusedTestSegment(value = '') {
  const segment = String(value).trim().toLowerCase();
  if (/^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test:)?(?:unit|integration|e2e|smoke)(?:\s|$)/.test(segment)) return true;
  if (/^node\s+(?:(?:--no-warnings|--disable-warning=[^\s]+|--experimental-test-coverage)\s+)*--test\b/.test(segment)) {
    const targets = [...segment.matchAll(/(?:^|\s)((?:\.\/)?(?:[a-z0-9_.-]+\/)*[a-z0-9_.-]+(?:\.test|\.spec)\.[cm]?[jt]sx?)(?=\s|$)/g)];
    return targets.length === 1;
  }
  if (/^(?:pytest|vitest|jest|mocha)\b/.test(segment)) {
    const targets = [...segment.matchAll(/(?:^|\s)((?:\.\/)?(?:[a-z0-9_.-]+\/)*(?:test_[a-z0-9_.-]+|[a-z0-9_.-]+_test|[a-z0-9_.-]+(?:\.test|\.spec))\.(?:py|[cm]?[jt]sx?)(?:::[^\s]+)?)(?=\s|$)/g)];
    return targets.length === 1;
  }
  if (/^playwright\s+test\b/.test(segment)) {
    const targets = [...segment.matchAll(/(?:^|\s)((?:\.\/)?(?:[a-z0-9_.-]+\/)*[a-z0-9_.-]+(?:\.test|\.spec)\.[cm]?[jt]sx?)(?=\s|$)/g)];
    return targets.length === 1;
  }
  if (/^go\s+test\b/.test(segment)) {
    return /^go\s+test\s+(?!\.\/\.\.\.(?:\s|$))(?:\.\/)?[a-z0-9_./-]+(?:\s|$)/.test(segment);
  }
  return false;
}

function hasIndirectTestWrapper(value = '') {
  const text = normalizeExecutablePath(String(value).trim()).toLowerCase();
  return /^(?:strace|perf|valgrind|gdb|nsenter|bwrap|su|flock|parallel)\s+/.test(text)
    || unwrapScriptCommand(text) !== text
    || /^find\b[^\n]{0,240}\s-(?:exec|execdir)\s+/.test(text)
    || /^(?:docker|podman)\b[^\n]{0,160}\b(?:run|exec|compose)\b\s+/.test(text)
    || /^(?:docker-compose|podman-compose)\b[^\n]{0,120}\b(?:run|exec)\b\s+/.test(text)
    || /^kubectl\b[^\n]{0,160}\b(?:run|exec)\b\s+/.test(text)
    || /^(?:bash|sh|zsh|dash|fish)\b[^\n]{0,120}(?:^|\s)-[a-z]*c[a-z]*(?:\s|$)/.test(text)
    || /^(?:eval|source|xargs)\s+|^\.\s+|^(?:if|for|while|until|case|function)\b|^\{\s*/.test(text)
    || hasUnknownExecutableWrapper(text);
}

function hasAggregatePackageManagerTestOptions(value = '') {
  const text = String(value).trim().toLowerCase();
  return /(?:^|\s)npm\b[^;|&\n]*(?:--workspaces\b|--include-workspace-root\b|--if-present\b)/.test(text)
    || /(?:^|\s)pnpm\b[^;|&\n]*(?:--recursive\b|(?:^|\s)-r(?:\s|$))/.test(text)
    || /(?:^|\s)yarn\s+workspaces\s+(?:run|foreach)\b/.test(text);
}

function canonicalToolName(value = '') {
  return String(value)
    .trim()
    .replace(/[./:\\]+/g, '_')
    .replace(/_+/g, '_');
}

function classifyNamedRemoteOperation(value = '') {
  const tokens = canonicalToolName(value).split('_').filter(Boolean);
  const readIndex = tokens.findIndex((token) => REMOTE_READ_TOOL_VERB.test(token));
  const mutationIndexes = tokens
    .map((token, index) => REMOTE_NON_READ_TOOL_TOKEN.test(token) ? index : -1)
    .filter((index) => index >= 0);
  if (readIndex < 0) return mutationIndexes.length ? 'write' : 'unknown';
  if (mutationIndexes.some((index) => index < readIndex)) return 'write';
  for (const index of mutationIndexes.filter((candidate) => candidate > readIndex)) {
    const previous = tokens[index - 1] ?? '';
    if (['and', 'then', 'or'].includes(previous) || !REMOTE_READ_OBJECT_TOKEN.test(tokens[index])) return 'write';
  }
  return 'read';
}

function embeddedShellActions(name = '', rawSource = '') {
  if (name !== 'omp_test_browser_check') return [];
  return collectPayloadValues(rawSource, 'serverCommand')
    .filter((command) => typeof command === 'string' && command.trim())
    .map((command) => classifyToolAction({ toolName: 'bash', text: command }));
}

function hasNonLoopbackBrowserTarget(rawSource = '') {
  return collectPayloadValues(rawSource, 'baseUrl').some((value) => {
    if (typeof value !== 'string') return false;
    try {
      const url = new URL(value);
      const hostname = url.hostname.toLowerCase();
      if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) return false;
      return hostname !== 'localhost'
        && hostname !== '0.0.0.0'
        && hostname !== '::1'
        && !hostname.endsWith('.localhost')
        && !/^127(?:\.\d{1,3}){3}$/.test(hostname);
    } catch {
      return false;
    }
  });
}

function collectPayloadValues(rawSource = '', key = '') {
  let payload;
  try {
    payload = JSON.parse(String(rawSource));
  } catch {
    return [];
  }
  const values = [];
  const visit = (value, seen = new Set()) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, seen);
      return;
    }
    for (const [entryKey, entryValue] of Object.entries(value)) {
      if (entryKey === key) values.push(entryValue);
      visit(entryValue, seen);
    }
  };
  visit(payload);
  return values;
}

function hasOpaqueShellEffects(text = '') {
  if (hasCommandBearingShellEffects(String(text).trim())) return true;
  const parsed = shellSegments(text);
  if (parsed.untrusted) return true;
  return commandSegments(text).some((segment) => {
    const value = String(segment).trim();
    if (isCommandExpansionExhausted(value)) return true;
    if (isExactReleaseVerifier(value)) return false;
    if (hasCommandBearingShellEffects(value)) return true;
    if (/^(?:node|python\d*(?:\.\d+)?|ruby|perl)\s+(?:-[ec]\b|--eval\b)/.test(value)) return true;
    if (/^(?:node\s+\S+\.(?:mjs|cjs|js)|python\d*(?:\.\d+)?\s+\S+\.py|(?:bash|sh|zsh)\s+\S+\.(?:sh|bash|zsh))\b/.test(value)) {
      return !isConventionalLocalAutomation(value);
    }
    if (/^(?:bash|sh|zsh)$/.test(value)) return true;
    if (/^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?\S+/.test(value)
      || /^(?:make|just)\s+\S+/.test(value)) return !isConventionalLocalAutomation(value);
    if (/^(?:\.\.?\/|\/)\S+/.test(value)) return !isConventionalLocalAutomation(value);
    return false;
  });
}

function isConventionalLocalAutomation(value = '') {
  const text = String(value).toLowerCase();
  const basename = automationBasename(text.split(/\s+/).findLast((token) => !token.startsWith('-')) ?? '');
  if (isVerificationAutomationName(basename)) return true;
  if (isDryRunAction(text) && hasExternalAutomationToken(basename)) return true;
  return /^(?:test|tests|test-runner|run-tests?|build|compile|lint|typecheck|check|verify|format|fmt|setup|start|dev|serve|migrate|migration)(?:$|[-_.:])/.test(basename);
}

function isAgentCliExecution(text = '') {
  return commandSegments(text).some((segment) => {
    const tokens = shellWords(segment);
    const executable = tokens[0] ?? '';
    if (!/^(?:codex|omp|pi|claude|opencode|gemini|aider|goose|amp|cursor-agent|q)$/.test(executable)) return false;
    if (isAgentCliProbe(segment)) return false;
    if (isAgentCliAdmin(segment)) return false;
    if (executable === 'q') return tokens[1] === 'chat';
    if (executable === 'goose') return tokens[1] === 'run' || tokens[1] === 'session';
    return true;
  });
}

function isAgentCliProbe(segment = '') {
  const tokens = shellWords(segment);
  if (!/^(?:codex|omp|pi|claude|opencode|gemini|aider|goose|amp|cursor-agent|q)$/.test(tokens[0] ?? '')) return false;
  return tokens.slice(1).some((token) => /^(?:--help|-h|--version|-v|version|help)$/.test(token))
    || /^(?:models?|model-list|list-models)$/.test(tokens[1] ?? '')
    || tokens[1] === 'list' && tokens[2] === 'models';
}

function isAgentCliAdmin(segment = '') {
  const tokens = shellWords(segment);
  const executable = tokens[0] ?? '';
  const subcommand = tokens[1] ?? '';
  if (executable === 'omp') return /^(?:plugin|config|models?|read|skills?|marketplace|doctor)$/.test(subcommand);
  if (executable === 'codex') return /^(?:login|logout|mcp|completion)$/.test(subcommand);
  if (executable === 'claude') return /^(?:auth|config|doctor|mcp|plugin|update)$/.test(subcommand);
  if (executable === 'opencode') return /^(?:auth|mcp|upgrade|uninstall)$/.test(subcommand);
  if (executable === 'gemini') return /^(?:extensions?|mcp)$/.test(subcommand);
  if (executable === 'goose') return /^(?:configure|info)$/.test(subcommand);
  return executable === 'q' && /^(?:doctor|settings|update)$/.test(subcommand);
}

function hasUnverifiableNetworkEffects(text = '') {
  const parsed = shellSegments(text);
  if (parsed.untrusted) return true;
  return commandSegments(text).some((segment) => !isKnownLocalNoNetworkSegment(segment));
}

function isRepositoryControlledAutomation(text = '') {
  return commandSegments(text).some((segment) => (
    isTestExecution('', segment)
    || /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+\S+|test(?:\s|$))/.test(segment)
    || /^(?:make|just)\s+\S+/.test(segment)
    || /^(?:node\s+\S+\.(?:mjs|cjs|js)|python\d*(?:\.\d+)?\s+\S+\.py|(?:bash|sh|zsh)\s+\S+\.(?:sh|bash|zsh))\b/.test(segment)
    || /^(?:\.\.?\/|\/)\S+\.(?:sh|bash|zsh|mjs|cjs|js|py)\b/.test(segment)
    || /^(?:cargo\s+(?:build|check|test|nextest)|go\s+(?:build|test|generate)|(?:mvn|mvnw|\.\/mvnw)\b[^\n]*\b(?:compile|package|verify|test)|(?:gradle|gradlew|\.\/gradlew)\b[^\n]*\b(?:build|assemble|check|test)|dotnet\s+(?:build|test|vstest)|mix\s+(?:compile|test)|swift\s+(?:build|test)|(?:bazel|bazelisk)\s+(?:build|test)|flutter\s+(?:build|test)|zig\s+build)\b/.test(segment)
  ));
}

function isKnownLocalNoNetworkSegment(segment = '') {
  const text = String(segment).trim();
  if (!text) return true;
  if (isTestExecution('', text) || isKnownWorkspaceWrite(text) || isProvablyReadOnlySimple(text)) return true;
  if (isConventionalLocalAutomation(text)) return true;
  return /^(?:echo|printf|true|false|test|cd|pwd|date|uname|id|whoami|groups|sleep|env|printenv|basename|dirname|realpath|readlink|sort|uniq|cut|tr|awk)(?:\s|$)/.test(text)
    || /^(?:cargo\s+(?:build|check|clippy|fmt)|go\s+(?:build|vet|fmt)|(?:mvn|mvnw|\.\/mvnw)\s+(?:compile|package)|(?:gradle|gradlew|\.\/gradlew)\b[^\n]*\b(?:build|assemble)|dotnet\s+(?:build|format)|mix\s+(?:compile|format)|swift\s+build|(?:bazel|bazelisk)\s+build|flutter\s+build|zig\s+build|tsc|eslint|prettier|ruff\s+(?:check|format))(?:\s|$)/.test(text)
    || /^python\d*(?:\.\d+)?\s+-m\s+(?:compileall|py_compile)\b/.test(text);
}

function isInteractiveExternalMutation(name = '', text = '') {
  if (/(?:^|[_-])(?:browser|web)(?:$|[_-])/i.test(name)) {
    if (/(?:^|[_-])submit(?:$|[_-])/i.test(name)) return true;
    return /\b(?:submit|save|delete|remove|purchase|pay|confirm|send|publish|deploy|merge|approve)\b|提交|保存|删除|购买|支付|确认|发送|发布|部署|合并|批准/i.test(String(text));
  }
  if (/(?:^|[_-])database(?:$|[_-])/i.test(name) && /(?:^|[_-])execute(?:$|[_-])/i.test(name)) {
    return /\b(?:insert|update|delete|drop|alter|create|truncate|grant|revoke|merge|replace|call)\b/i.test(String(text));
  }
  return false;
}

function classifyGenericRemoteOperation(name = '', text = '') {
  const nameTokens = canonicalToolName(name).toLowerCase().split('_').filter(Boolean);
  const genericIndex = nameTokens.findIndex((token) => /^(?:api|graphql|request|query|execute|call)$/.test(token));
  const namedReadIndex = nameTokens.findIndex((token) => REMOTE_READ_TOOL_VERB.test(token));
  if (genericIndex < 0 || namedReadIndex >= 0 && namedReadIndex < genericIndex) {
    return 'not-generic';
  }
  const source = String(text).toLowerCase();
  const httpWrite = /["'](?:method|httpmethod|verb)["']\s*:\s*["'](?:post|put|patch|delete)["']/.test(source)
    || /^(?:post|put|patch|delete)\b/.test(source.trim());
  const graphQlWrite = /\bmutation(?:\s+[a-z_][a-z0-9_]*)?\s*[({]/.test(source);
  const providerWrite = /\b(?:chat\.postmessage|chat\.update|chat\.delete|files\.upload|pages?\.(?:create|update|delete)|databases?\.(?:create|update|delete))\b/.test(source)
    || /["'](?:operation|action|command)["']\s*:\s*["'][^"']*(?:create|update|delete|remove|publish|send|post|patch|write|upload|merge)[^"']*["']/.test(source);
  const sqlWrite = /\b(?:insert\s+into|update\s+\S+\s+set|delete\s+from|merge\s+into|replace\s+into|create\s+(?:table|database|schema|index|view)|alter\s+(?:table|database|schema)|drop\s+(?:table|database|schema|index|view)|truncate\s+(?:table\s+)?|grant\s+|revoke\s+)\b/.test(source);
  if (httpWrite || graphQlWrite || providerWrite || sqlWrite) return 'write';

  const httpRead = /["'](?:method|httpmethod|verb)["']\s*:\s*["'](?:get|head|options)["']/.test(source)
    || /^(?:get|head|options)\b/.test(source.trim());
  const graphQlRead = /(?:["']query["']\s*:\s*["']\s*)?\bquery(?:\s+[a-z_][a-z0-9_]*)?\s*[({]/.test(source);
  const providerRead = /\b(?:conversations\.(?:history|info|members|replies)|users\.(?:info|list)|files\.(?:info|list))\b/.test(source);
  const sqlRead = /["'](?:query|sql)["']\s*:\s*["']\s*(?:select|show|describe|desc|explain|values|with\b[^"']*\bselect)\b/.test(source)
    || /^(?:select|show|describe|desc|explain|values|with\b[^\n]*\bselect)\b/.test(source.trim());
  if (httpRead || graphQlRead || providerRead || sqlRead) return 'read';
  return 'unknown';
}

export function hasUnsafeResultMasking(text = '') {
  const source = String(text);
  const parsed = shellSegments(source);
  return parsed.untrusted
    || parsed.redirection
    || parsed.operators.length > 0
    || /(?:^|\s)set\s+\+e(?:\s|;|$)/i.test(source)
    || /\|\|\s*(?:true|:|exit\s+0)(?:\s|$)/i.test(source)
    || /(?:^|;)\s*(?:true|exit\s+0)\s*$/i.test(source)
    || /--passwithnotests\b/i.test(source);
}

export function isDryRunAction(text = '') {
  const value = String(text).trim();
  return /(?:^|\s)(?:--dry-run|--dryrun)(?:\s|$)/i.test(value)
    || /^git\s+push\b[^\n]*(?:^|\s)-n(?:\s|$)/i.test(value)
    || /(?:^|\s)make\b[^;&|\n]*(?:^|\s)(?:-n|--just-print|--recon|--question|-q)(?:\s|$)/i.test(value)
    || /(?:^|\s)task\b[^;&|\n]*(?:^|\s)(?:--dry|--summary)(?:\s|$)/i.test(value)
    || /(?:^|\s)turbo\b[^;&|\n]*(?:^|\s)--dry(?:=\S+)?(?:\s|$)/i.test(value)
    || /(?:^|\s)ctest\b[^;&|\n]*(?:^|\s)(?:-N|--show-only)(?:=\S+)?(?:\s|$)/.test(value)
    || /(?:^|\s)ninja\b[^;&|\n]*(?:^|\s)(?:-n|--dry-run)(?:\s|$)/i.test(value)
    || /(?:^|\s)cargo\b[^;&|\n]*\btest\b[^;&|\n]*(?:^|\s)--no-run(?:\s|$)/i.test(value);
}

function isTestExecution(name, text) {
  if (name === 'omp_test_browser_check') return true;
  return commandSegments(text).some((segment) => (
    isCommandExpansionExhausted(segment)
    || /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test(?::[\w.-]+)?|unit|integration|e2e|check:test)\b/.test(segment)
    || /^(?:pnpm|yarn|bun)\s+(?:vitest|jest|mocha)(?:\s|$)/.test(segment)
    || /^(?:pnpm|yarn|bun)\s+playwright\s+test\b/.test(segment)
    || /^node\b[^\n]*\s--test(?:\s|$)/.test(segment)
    || /^(?:pytest|vitest|jest|ctest|cargo\s+(?:\+\S+\s+)?(?:test|nextest)|go\s+test|(?:\.\/)?mvn(?:w)?\b[^\n]*\btest\b|(?:\.\/)?gradle(?:w)?\b[^\n]*\btest\b|dotnet\s+test|deno\s+test)\b/.test(segment)
    || isCargoTestInvocation(segment)
    || isDenoTestInvocation(segment)
    || isMakeOrJustTestInvocation(segment)
    || isBazelTestInvocation(segment)
    || /^(?:task\s+(?:--?[^\s]+\s+)*test(?:\s|$)|nx\s+test\b|turbo\s+(?:run\s+)?test\b|mise\s+run\s+test\b|lerna\s+run\s+test\b|rush\s+test\b)/.test(segment)
    || /^(?:\.\/)?(?:test|tests|run-tests?)\.sh\b/.test(segment)
    || /^(?:\.\.?\/)?(?:\S+\/)*(?:tox|nox)(?:\s|$)/.test(segment)
    || /^(?:bundle\s+exec\s+)?(?:\.\.?\/)?(?:\S+\/)*rspec(?:\s|$)/.test(segment)
    || /^(?:bundle\s+exec\s+)?rake\s+(?:test|spec)(?:\s|$)/.test(segment)
    || /^(?:\.\/)?(?:\S+\/)*phpunit(?:\s|$)/.test(segment)
    || /^(?:composer\s+(?:run-script\s+)?test|php\s+(?:artisan\s+test|(?:\.\/)?vendor\/bin\/phpunit))\b/.test(segment)
    || /^ant\b[^\n]*\btest\b/.test(segment)
    || /^coverage\s+run\s+-m\s+pytest\b/.test(segment)
    || /^(?:go\s+tool\s+)?gotestsum(?:\s|$)/.test(segment)
    || /^mix\s+test\b/.test(segment)
    || /^swift\s+test\b/.test(segment)
    || /^(?:\.\.?\/)?(?:\S+\/)*playwright\s+test\b/.test(segment)
    || /^(?:\.\.?\/)?(?:\S+\/)*cypress\s+run\b/.test(segment)
    || /^(?:\.\.?\/)?(?:\S+\/)*mocha(?:\s|$)/.test(segment)
    || /^flutter\s+test\b/.test(segment)
    || /^zig\s+build\s+test\b/.test(segment)
    || /^(?:unittest|nose2|behave|robot)(?:\s|$)/.test(segment)
    || /^dotnet\s+vstest\b/.test(segment)
    || /^xcodebuild\b[^\n]*(?:^|\s)test(?:\s|$)/.test(segment)
    || isSbtOrLeinTestInvocation(segment)
    || /^(?:meson\s+test|ninja\b[^\n]*\btest(?:s)?(?:\s|$))/.test(segment)
    || /^(?:\.\/)?mvn(?:w)?\b[^\n]*\bverify\b/.test(segment)
    || /^(?:\.\/)?gradle(?:w)?\b[^\n]*\bcheck\b/.test(segment)
  ));
}

function isBazelTestInvocation(value = '') {
  const tokens = shellWords(value);
  if (!/^(?:bazel|bazelisk)$/.test(tokens[0] ?? '')) return false;
  let index = 1;
  const withValue = new Set([
    '--bazelrc', '--output_base', '--output_user_root', '--install_base', '--host_jvm_args',
    '--max_idle_secs', '--io_nice_level', '--macos_qos_class', '--server_javabase',
  ]);
  while (index < tokens.length && tokens[index].startsWith('-')) {
    index += withValue.has(tokens[index]) ? 2 : 1;
  }
  return tokens[index] === 'test';
}

function isCargoTestInvocation(value = '') {
  const tokens = shellWords(value);
  if (tokens[0] !== 'cargo') return false;
  let index = 1;
  if (/^\+\S+$/.test(tokens[index] ?? '')) index += 1;
  const withValue = new Set(['--manifest-path', '--color', '--config', '-Z']);
  while (index < tokens.length && tokens[index].startsWith('-')) {
    index += withValue.has(tokens[index]) ? 2 : 1;
  }
  return tokens[index] === 'test' || tokens[index] === 'nextest';
}

function isDenoTestInvocation(value = '') {
  const tokens = shellWords(value);
  if (tokens[0] !== 'deno') return false;
  const withValue = new Set([
    '--config', '-c', '--import-map', '--lock', '--cert', '--location', '--v8-flags',
    '--seed', '--inspect', '--inspect-brk', '--inspect-wait',
  ]);
  let index = 1;
  while (index < tokens.length && tokens[index].startsWith('-')) {
    index += withValue.has(tokens[index]) ? 2 : 1;
  }
  return tokens[index] === 'test';
}

function isSbtOrLeinTestInvocation(value = '') {
  const tokens = shellWords(value);
  if (!/^(?:sbt|lein)$/.test(tokens[0] ?? '')) return false;
  if (tokens[0] === 'lein' && tokens[1] === 'with-profile') {
    return tokens.slice(3).some((token) => token === 'test');
  }
  const withValue = new Set(['-ivy', '-sbt-dir', '-sbt-boot', '-sbt-launch-dir', '-java-home', '-mem']);
  let index = 1;
  while (index < tokens.length && tokens[index].startsWith('-')) {
    index += withValue.has(tokens[index]) ? 2 : 1;
  }
  return /^(?:test|testonly|testquick)(?:\s|$)/.test(tokens[index] ?? '');
}

function isNonExecutingTestPlan(value = '') {
  const text = String(value).trim();
  return /^make\b[^;&|\n]*(?:^|\s)(?:-n|--dry-run|--just-print|--recon|--question|-q)(?:\s|$)/i.test(text)
    || /^just\b[^;&|\n]*(?:^|\s)--dry-run(?:\s|$)/i.test(text)
    || /^task\b[^;&|\n]*(?:^|\s)(?:--dry|--summary)(?:\s|$)/i.test(text)
    || /^turbo\b[^;&|\n]*(?:^|\s)(?:--dry-run|--dry(?:=\S+)?)(?:\s|$)/i.test(text)
    || /^ctest\b[^;&|\n]*(?:^|\s)(?:-N|--show-only)(?:=\S+)?(?:\s|$)/.test(text)
    || /^ninja\b[^;&|\n]*(?:^|\s)(?:-n|--dry-run)(?:\s|$)/i.test(text)
    || /^(?:\.\/)?gradle(?:w)?\b[^;&|\n]*\btest\b[^;&|\n]*(?:^|\s)--dry-run(?:\s|$)/i.test(text)
    || /^cargo\b[^;&|\n]*\btest\b[^;&|\n]*(?:^|\s)--no-run(?:\s|$)/i.test(text);
}

function isMakeOrJustTestInvocation(value = '') {
  const tokens = shellWords(value);
  const executable = tokens[0] ?? '';
  if (!/^(?:make|just)$/.test(executable)) return false;
  const withValue = executable === 'make'
    ? new Set(['-C', '--directory', '-f', '--file', '--makefile', '-I', '--include-dir', '-j', '--jobs', '-l', '--load-average', '-o', '--old-file', '-W', '--what-if'])
    : new Set(['-f', '--justfile', '-d', '--working-directory', '--shell', '--shell-arg', '--set']);
  let index = 1;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === '--') {
      index += 1;
      break;
    }
    if (withValue.has(token)) {
      index += 2;
      continue;
    }
    if (/^--[a-z][a-z0-9-]*=\S+$/i.test(token) || /^-[a-z]+$/i.test(token)) {
      index += 1;
      continue;
    }
    if (/^[a-z_][a-z0-9_]*=/i.test(token)) {
      index += 1;
      continue;
    }
    break;
  }
  return tokens.slice(index).some((target) => (
    /^(?:test|tests)(?:$|[-_.:])/i.test(target)
    || /^check(?:$|[-_.:](?:test|tests)(?:$|[-_.:]))/i.test(target)
  ));
}

function isNetworkAccess(name, text) {
  if (NETWORK_TOOL.test(name) || /^(?:curl|wget)$/i.test(name)) return true;
  if (shellSegments(text).segments.some((segment) => /^(?:npx|npm\s+exec)\b/.test(normalizeExecutablePath(segment)))) return true;
  return commandSegments(text).some((segment) => (
    isCommandExpansionExhausted(segment)
    || /^(?:curl|wget|http|httpie|ssh|scp|rsync|ftp|sftp|ping|nc|netcat|telnet|dig|nslookup|psql|mysql|redis-cli|mongosh)\b/.test(segment)
    || /^openssl\s+s_client\b/.test(segment)
    || /^git\s+(?:fetch|pull|clone|ls-remote)\b/.test(segment)
    || /^git\s+submodule\s+update\b/.test(segment)
    || /^(?:npm|pnpm|yarn)\s+(?:view|info|search|ping|whoami)\b/.test(segment)
    || /^(?:npm\s+(?:install|i|ci)|pnpm\s+(?:add|install|i)|yarn\s+(?:add|install)|bun\s+(?:add|install)|pip3?\s+install|cargo\s+fetch|go\s+(?:get|mod\s+download)|apt(?:-get)?\s+(?:update|install))\b/.test(segment)
    || /^npm\s+unpublish\b/.test(segment)
    || /^(?:gh|aws|gcloud|az|kubectl|helm|terraform)\b/.test(segment)
    || /^docker\s+(?:pull|push|login|logout)\b/.test(segment)
    || isRemoteDeploymentCliNetwork(segment)
    || isExactReleaseVerifier(segment)
    || /\brequests\.(?:get|post|put|patch|delete)\s*\(|\burllib(?:\.request)?\.|\bfetch\s*\(|\bhttps?\.(?:request|get)\s*\(|require\(['"]https?['"]\)\.(?:request|get)\s*\(/.test(segment)
    || hasProgrammaticNetworkAccess(segment)
  ));
}

function isExternalWrite(name, text, rawText = text) {
  if (/^(?:publish|deploy|push|merge|release|external_write)(?:$|[_-])/i.test(name)) return true;
  if (hasCurlMutation(rawText)) return true;
  if (isKubectlExternalWrite(String(rawText).trim())) return true;
  return commandSegments(text).some((segment) => (
    isCommandExpansionExhausted(segment)
    || /^git\s+push\b/.test(segment)
    || /^npm\s+(?:publish|unpublish|dist-tag\s+(?:add|rm))\b/.test(segment)
    || isPackageManagerExternalWrite(segment)
    || /^omp\s+plugin\s+(?:install|upgrade|uninstall|publish)\b/.test(segment)
    || /^docker\s+push\b/.test(segment)
    || isKubectlExternalWrite(segment)
    || isHelmExternalWrite(segment)
    || /^terraform\s+(?:apply|destroy|import)\b/.test(segment)
    || isAwsS3ExternalWrite(segment)
    || /^(?:gcloud|az)\b[^\n]*(?:deploy|create|delete|update|set|upload)\b/.test(segment)
    || /^aws\s+\S+\s+(?:create|delete|update|put|publish|invoke|deploy|set)-?[a-z-]*\b/.test(segment)
    || /^gh\s+(?:issue|pr|release)\s+(?:create|edit|close|reopen|merge|delete|upload)\b/.test(segment)
    || /^gh\s+repo\s+(?:create|delete|archive|rename|edit|fork|sync)\b/.test(segment)
    || /^gh\s+api\b[^\n]*(?:--method(?:\s+|=)(?:post|put|patch|delete)|-x\s*(?:post|put|patch|delete)|(?:-f|-F|--field|--raw-field)\s)/.test(segment)
    || /^http\s+(?:post|put|patch|delete)\b/.test(segment)
    || /^wget\b[^\n]*(?:--post-data|--post-file|--method\s*=?(?:post|put|patch|delete))/.test(segment)
    || /^ssh\b[^\n]+\s+(?:['"])?(?:rm|rmdir|unlink|truncate|shred|git\s+push|deploy|publish)\b/.test(segment)
    || /^curl\b[^\n]*(?:--request(?:\s+|=)(?:post|put|patch|delete)|(?:--data(?:-raw|-binary)?|--form|--upload-file)\s)/.test(segment)
    || /\brequests\.(?:post|put|patch|delete)\s*\(|\bfetch\s*\([^\n]*method\s*:\s*['"](?:post|put|patch|delete)/.test(segment)
    || hasProgrammaticExternalWrite(segment)
    || isDatabaseCliExternalWrite(segment)
    || isRemoteTransferExternalWrite(segment)
    || isRemoteDeploymentCliExternalWrite(segment)
    || isExternalAutomationInvocation(segment)
    || isCloudProviderExternalWrite(segment)
    || isArtifactRegistryExternalWrite(segment)
    || /^(?:deploy|publish)\b/.test(segment)
  ));
}

function isArtifactRegistryExternalWrite(segment = '') {
  const text = String(segment).trim();
  return /^cargo\s+publish\b/.test(text)
    || /^twine\s+upload\b/.test(text)
    || /^gem\s+push\b/.test(text)
    || /^(?:poetry|flutter\s+pub|dart\s+pub)\s+publish\b/.test(text)
    || /^(?:dotnet\s+nuget|nuget)\s+push\b/.test(text)
    || /^(?:mvn|gradle)\s+(?:deploy|publish)\b/.test(text)
    || /^oras\s+push\b/.test(text)
    || /^skopeo\s+(?:copy|delete|sync)\b/.test(text)
    || /^crane\s+(?:push|append|mutate|copy|delete)\b/.test(text)
    || /^rclone\s+(?:copy|copyto|sync|move|moveto|delete|purge)\b/.test(text)
    || /^gsutil\s+(?:cp|mv|rsync|rm)\b/.test(text)
    || /^azcopy\s+(?:copy|sync|remove)\b/.test(text);
}

const REMOTE_DEPLOYMENT_CLI = /^(?:vercel|netlify|firebase|flyctl|pulumi|ansible-playbook|nomad|glab|heroku)$/;

function isRemoteDeploymentCliProbe(segment = '') {
  const tokens = shellWords(segment);
  const executable = tokens[0] ?? '';
  if (!REMOTE_DEPLOYMENT_CLI.test(executable)) return false;
  if (tokens.slice(1).some((token) => /^(?:--help|-h|--version|version|help)$/.test(token))) return true;
  return executable === 'ansible-playbook' && tokens.includes('--syntax-check');
}

function isRemoteDeploymentCliNetwork(segment = '') {
  const executable = shellWords(segment)[0] ?? '';
  return REMOTE_DEPLOYMENT_CLI.test(executable) && !isRemoteDeploymentCliProbe(segment);
}

function isRemoteDeploymentCliExternalWrite(segment = '') {
  const text = String(segment).trim();
  if (isRemoteDeploymentCliProbe(text)) return false;
  return /^vercel\s+(?:deploy|remove|rm)\b/.test(text)
    || /^netlify\s+(?:deploy|sites:delete)\b/.test(text)
    || /^firebase\s+(?:deploy|projects:delete)\b/.test(text)
    || /^flyctl\s+(?:deploy|apps\s+destroy)\b/.test(text)
    || /^pulumi\s+(?:up|destroy)\b/.test(text)
    || /^ansible-playbook\b/.test(text)
    || /^nomad\s+job\s+(?:run|stop)\b/.test(text)
    || /^glab\s+release\s+(?:create|delete)\b/.test(text)
    || /^heroku\s+(?:releases:rollback|apps:destroy)\b/.test(text);
}

function isRemoteDeploymentCliIrreversible(segment = '') {
  const text = String(segment).trim();
  return /^vercel\s+(?:remove|rm)\b/.test(text)
    || /^netlify\s+sites:delete\b/.test(text)
    || /^firebase\s+projects:delete\b/.test(text)
    || /^flyctl\s+apps\s+destroy\b/.test(text)
    || /^pulumi\s+destroy\b/.test(text)
    || /^nomad\s+job\s+stop\b[^\n]*(?:^|\s)-purge(?:\s|$)/.test(text)
    || /^glab\s+release\s+delete\b/.test(text)
    || /^heroku\s+(?:releases:rollback|apps:destroy)\b/.test(text);
}

function isReadOnlyRemoteDeploymentCli(segment = '') {
  const text = String(segment).trim();
  return /^vercel\s+(?:inspect|list|ls|whoami)\b/.test(text)
    || /^netlify\s+status\b/.test(text)
    || /^firebase\s+projects:list\b/.test(text)
    || /^flyctl\s+status\b/.test(text)
    || /^pulumi\s+preview\b/.test(text)
    || /^nomad\s+job\s+status\b/.test(text)
    || /^glab\s+release\s+view\b/.test(text)
    || /^heroku\s+releases(?:\s|$)/.test(text);
}

function hasProgrammaticNetworkAccess(segment = '') {
  const text = String(segment);
  return /(?:\baxios|require\(['"]axios['"]\))\.(?:get|head|options|request|post|put|patch|delete)\s*\(/.test(text)
    || /(?:\baxios|require\(['"]axios['"]\))\s*\(/.test(text)
    || /\bhttps?\.(?:request|get)\s*\(/.test(text)
    || /require\(['"]https?['"]\)\.(?:request|get)\s*\(/.test(text);
}

function hasProgrammaticExternalWrite(segment = '') {
  const text = String(segment);
  const mutationMethod = /method\s*:\s*['"](?:post|put|patch|delete)['"]/i.test(text);
  if (/(?:\baxios|require\(['"]axios['"]\))\.(?:post|put|patch|delete)\s*\(/.test(text)) return true;
  if (/(?:\baxios|require\(['"]axios['"]\))\.(?:request)\s*\(/.test(text) && mutationMethod) return true;
  if (/(?:\baxios|require\(['"]axios['"]\))\s*\(/.test(text) && mutationMethod) return true;
  if (/\bfetch\s*\(/.test(text) && mutationMethod) return true;
  return (/(?:\bhttps?\.request|require\(['"]https?['"]\)\.request)\s*\(/.test(text) && mutationMethod);
}

function isDatabaseCliExternalWrite(segment = '') {
  const text = String(segment).trim();
  const tokens = shellWords(text);
  const executable = tokens[0] ?? '';
  if (executable === 'psql') return isSqlMutation(optionValue(tokens, ['-c', '--command']));
  if (executable === 'mysql') return isSqlMutation(optionValue(tokens, ['-e', '--execute']));
  if (executable === 'redis-cli') {
    const command = redisCommand(tokens);
    return /^(?:set|setnx|setex|psetex|mset|msetnx|getset|del|unlink|append|incr|incrby|decr|decrby|expire|expireat|pexpire|pexpireat|persist|rename|renamenx|hset|hsetnx|hmset|hdel|hincrby|lpush|rpush|lpop|rpop|lset|ltrim|sadd|srem|smove|zadd|zrem|zincrby|xadd|xdel|publish|flushall|flushdb|restore|migrate|eval|evalsha|script)\b/.test(command);
  }
  if (executable === 'mongosh') {
    const expression = optionValue(tokens, ['--eval']);
    return /\.(?:insertone|insertmany|updateone|updatemany|replaceone|deleteone|deletemany|bulkwrite|createindex|dropindex|drop|renamecollection)\s*\(|\bdb\.(?:dropdatabase|createcollection)\s*\(/.test(expression);
  }
  return false;
}

function isDatabaseCliIrreversible(segment = '') {
  const text = String(segment).trim();
  const tokens = shellWords(text);
  const executable = tokens[0] ?? '';
  if (executable === 'psql') return isDestructiveSql(optionValue(tokens, ['-c', '--command']));
  if (executable === 'mysql') return isDestructiveSql(optionValue(tokens, ['-e', '--execute']));
  if (executable === 'redis-cli') return /^(?:del|unlink|flushall|flushdb)\b/.test(redisCommand(tokens));
  if (executable === 'mongosh') {
    const expression = optionValue(tokens, ['--eval']);
    return /\.(?:deleteone|deletemany|drop)\s*\(|\bdb\.dropdatabase\s*\(/.test(expression);
  }
  return false;
}

function isReadOnlyDatabaseCli(segment = '') {
  const tokens = shellWords(segment);
  const executable = tokens[0] ?? '';
  if (executable === 'psql') return isReadOnlySql(optionValue(tokens, ['-c', '--command']));
  if (executable === 'mysql') return isReadOnlySql(optionValue(tokens, ['-e', '--execute']));
  if (executable === 'redis-cli') return /^(?:get|mget|hget|hmget|hgetall|hexists|hlen|lindex|llen|lrange|scard|sismember|smembers|zcard|zcount|zrange|zrank|xinfo|xlen|xrange|exists|ttl|pttl|scan|sscan|hscan|zscan|keys|type|dbsize|info|ping|time|role)\b/.test(redisCommand(tokens));
  if (executable === 'mongosh') {
    const expression = optionValue(tokens, ['--eval']);
    return /\.(?:find|findone|aggregate|count|countdocuments|estimateddocumentcount|distinct|explain)\s*\(/.test(expression)
      && !isDatabaseCliExternalWrite(segment);
  }
  return false;
}

function isSqlMutation(value = '') {
  return /\b(?:insert\s+into|update\s+\S+\s+set|delete\s+from|merge\s+into|replace\s+into|create\s+(?:table|database|schema|index|view)|alter\s+(?:table|database|schema)|drop\s+(?:table|database|schema|index|view)|truncate\s+(?:table\s+)?|grant\s+|revoke\s+|call\s+)\b/.test(String(value));
}

function isDestructiveSql(value = '') {
  return /\b(?:delete\s+from|drop\s+(?:table|database|schema|index|view)|truncate\s+(?:table\s+)?)\b/.test(String(value));
}

function isReadOnlySql(value = '') {
  const text = String(value).trim();
  return /^(?:select|show|describe|desc|explain|values|table|with\b[^;]*(?:select|values)\b)/.test(text)
    && !isSqlMutation(text);
}

function redisCommand(tokens = []) {
  const valueOptions = new Set(['-h', '--host', '-p', '--port', '-s', '--socket', '-a', '--pass', '--user', '-n', '--dbnum', '--tls-ciphers', '--cacert', '--cacertdir', '--cert', '--key']);
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.startsWith('--') && token.includes('=')) continue;
    if (valueOptions.has(token)) {
      index += 1;
      continue;
    }
    if (token.startsWith('-')) continue;
    return tokens.slice(index).join(' ');
  }
  return '';
}

function optionValue(tokens = [], names = []) {
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    for (const name of names) {
      if (token === name) return tokens[index + 1] ?? '';
      if (token.startsWith(`${name}=`)) return token.slice(name.length + 1);
      if (name.length === 2 && token.startsWith(name) && token.length > 2) return token.slice(2);
    }
  }
  return '';
}

function isRemoteTransferExternalWrite(segment = '') {
  const text = String(segment).trim();
  const tokens = shellWords(text);
  const executable = tokens[0] ?? '';
  if (executable === 'sftp') return true;
  if (executable === 'scp' || executable === 'rsync') {
    const destination = tokens.findLast((token) => !token.startsWith('-')) ?? '';
    return isRemoteLocation(destination);
  }
  if (executable !== 'ssh') return false;
  const remoteCommand = sshCommand(tokens);
  return !isReadOnlySshCommand(remoteCommand);
}

function isRemoteTransferIrreversible(segment = '') {
  const text = String(segment).trim();
  const tokens = shellWords(text);
  if (tokens[0] === 'rsync' && tokens.slice(1).some((token) => token === '--delete' || token.startsWith('--delete-'))) return true;
  if (tokens[0] !== 'ssh') return false;
  const command = sshCommand(tokens);
  return /^(?:rm|rmdir|unlink|truncate|shred)\b|^find\b[^\n]*(?:-delete|-exec\s+(?:rm|rmdir|unlink)\b)|^git\s+(?:clean\b|reset\b[^\n]*--hard\b|push\b[^\n]*--delete\b)/.test(command);
}

function sshCommand(tokens = []) {
  const valueOptions = new Set(['-b', '-c', '-d', '-e', '-f', '-i', '-j', '-l', '-m', '-o', '-p', '-q', '-r', '-s', '-w', '-B', '-D', '-E', '-F', '-I', '-J', '-L', '-O', '-Q', '-R', '-S', '-W']);
  let index = 1;
  while (index < tokens.length && tokens[index].startsWith('-')) {
    const token = tokens[index];
    if (token.length === 2 && valueOptions.has(token)) index += 2;
    else index += 1;
  }
  if (index >= tokens.length) return '';
  return tokens.slice(index + 1).join(' ').trim();
}

function isReadOnlySshCommand(value = '') {
  const text = String(value).trim();
  if (!text) return false;
  return /^(?:cat|head|tail|ls|pwd|stat|file|wc|grep|rg|sha(?:1|224|256|384|512)sum)\b/.test(text)
    || /^sed\s+-n\b/.test(text)
    || /^git\s+(?:show|status|diff|log|rev-parse)\b/.test(text);
}

function isRemoteLocation(value = '') {
  return /^(?:[^@\s/:]+@)?(?:\[[^\]]+\]|[^\s/:]+):(?::)?\S*/.test(String(value));
}

function isExternalAutomationInvocation(segment = '') {
  const text = String(segment).trim();
  if (isDryRunAction(text)) return false;
  const tokens = text.split(/\s+/).map((token) => token.replace(/^['"]|['",;]$/g, ''));
  const executable = tokens[0] ?? '';

  if (/^(?:make|just)$/.test(executable)) {
    return tokens.slice(1).some((token) => !token.startsWith('-') && isExternalAutomationName(token));
  }

  if (/^(?:node|python\d*(?:\.\d+)?)$/.test(executable)) {
    if (tokens.slice(1).some((token) => /^(?:-e|--eval|-c)$/.test(token))) return false;
    const extension = executable === 'node' ? /\.(?:mjs|cjs|js)$/ : /\.py$/;
    const script = tokens.slice(1).find((token) => !token.startsWith('-') && extension.test(token));
    return isExternalAutomationName(script);
  }

  if (/^(?:bash|sh|zsh)$/.test(executable)) {
    if (tokens.slice(1).some((token) => /^-[a-z]*c[a-z]*$/.test(token))) return false;
    const script = tokens.slice(1).find((token) => !token.startsWith('-') && /\.sh$/.test(token));
    return isExternalAutomationName(script);
  }

  return /^(?:\.\.\/|\.\/|\/)/.test(executable) && isExternalAutomationName(executable);
}

function isPackageManagerExternalWrite(segment = '') {
  const text = String(segment).trim();
  const tokens = shellWords(text);
  if (!/^(?:npm|pnpm|yarn|bun)$/.test(tokens[0] ?? '')) return false;
  if (isDryRunAction(text)) return false;
  const script = tokens[1] === 'run' ? tokens[2] : tokens[1];
  if (!script) return false;
  if (/^upgrade(?:$|[-_.:])/.test(script)) return !isVerificationAutomationName(script);
  return isExternalAutomationName(script);
}

function isMigrationAutomationInvocation(text = '') {
  return commandSegments(text).some((segment) => (
    /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:migrate|migration)(?:$|[:\s])/.test(segment)
    || /^(?:make|just)\s+(?:migrate|migration)(?:$|[:\s])/.test(segment)
    || /^(?:node|python\d*(?:\.\d+)?|bash|sh|zsh)\s+\S*(?:migrate|migration)\S*\.(?:mjs|cjs|js|py|sh)\b/.test(segment)
    || /^(?:\.\.?\/|\/)\S*(?:migrate|migration)\S*\.(?:mjs|cjs|js|py|sh)\b/.test(segment)
    || /^alembic\s+(?:upgrade|downgrade)\b/.test(segment)
    || /^prisma\s+migrate\s+(?:deploy|dev|reset|resolve)\b/.test(segment)
    || /^(?:bundle\s+exec\s+|\.\/bin\/)?rails\s+db:(?:migrate|rollback|reset|drop|setup)(?:\s|$)/.test(segment)
    || /^php\s+artisan\s+migrate(?::(?:fresh|refresh|reset|rollback))?(?:\s|$)/.test(segment)
    || /^dotnet\s+ef\s+database\s+(?:update|drop)\b/.test(segment)
    || /^(?:flyway\s+migrate|liquibase\s+update|diesel\s+migration\s+(?:run|redo|revert))\b/.test(segment)
    || /^(?:typeorm\s+migration:run|knex\s+migrate:(?:latest|rollback|up|down)|sequelize\s+db:migrate|dbmate\s+(?:up|down|rollback)|goose\s+(?:up|down|redo|reset)|atlas\s+migrate\s+apply)\b/.test(segment)
    || /^(?:python\d*(?:\.\d+)?\s+)?(?:\.\/)?\S*manage\.py\s+migrate\b/.test(segment)
  ));
}

function isDevServerAutomationInvocation(text = '') {
  return commandSegments(text).some((segment) => (
    /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:start|dev|serve)(?:$|[:\s])/.test(segment)
    || /^(?:make|just)\s+(?:start|dev|serve)(?:$|[:\s])/.test(segment)
    || /^(?:node|python\d*(?:\.\d+)?|bash|sh|zsh)\s+\S*(?:server|serve|dev-server)\S*\.(?:mjs|cjs|js|py|sh)\b/.test(segment)
    || /^(?:\.\.?\/|\/)\S*(?:server|serve|dev-server)\S*\.(?:mjs|cjs|js|py|sh)\b/.test(segment)
  ));
}

function isKubectlExternalWrite(segment = '') {
  const command = providerCommand(String(segment), 'kubectl');
  if (!command) return false;
  if (/^(?:get|describe|logs|explain|diff|top|version|api-resources|api-versions|cluster-info)\b/.test(command)) return false;
  if (/^auth\s+can-i\b/.test(command)) return false;
  if (/^config\s+(?:view|current-context|get-contexts)\b/.test(command)) return false;
  if (/^rollout\s+(?:status|history)\b/.test(command)) return false;
  return true;
}

function isHelmExternalWrite(segment = '') {
  const command = providerCommand(String(segment), 'helm');
  if (!command) return false;
  if (/^(?:list|status|history|get|show|search|template|lint|version|env)\b/.test(command)) return false;
  if (/^repo\s+list\b/.test(command)) return false;
  return true;
}

function isCloudProviderExternalWrite(segment = '') {
  const text = String(segment).trim();
  if (/^aws\b/.test(text)) {
    const command = providerCommand(text, 'aws');
    if (!command || /^s3\s+(?:ls|presign)\b/.test(command)) return false;
    if (/^s3\s+(?:cp|sync)\b/.test(command)) return isAwsS3ExternalWrite(`aws ${command}`);
    const operation = command.split(/\s+/)[1] ?? '';
    return !/^(?:get|list|describe|head|lookup|check|query|select|scan|wait|help)(?:-|$)/.test(operation);
  }
  if (/^(?:gcloud|az)\b/.test(text)) {
    const provider = text.startsWith('gcloud') ? 'gcloud' : 'az';
    const command = providerCommand(text, provider);
    if (!command) return false;
    const words = command.split(/\s+/).filter((word) => !word.startsWith('-'));
    const verb = words.findLast((word) => /^(?:get|list|show|describe|view|status|help|version|delete|remove|destroy|purge|create|update|set|deploy|apply|add|upload|import|restore|restart|stop|start)$/.test(word));
    return !verb || !/^(?:get|list|show|describe|view|status|help|version)$/.test(verb);
  }
  return false;
}

function providerCommand(value = '', provider = '') {
  const tokens = shellWords(value);
  if (tokens[0] !== provider) return '';
  const booleanFlags = new Set([
    '--debug', '--help', '-h', '--warnings-as-errors', '--match-server-version',
    '--disable-compression', '--insecure-skip-tls-verify', '--quiet', '-q', '--verbose',
  ]);
  let index = 1;
  while (index < tokens.length && tokens[index].startsWith('-')) {
    const flag = tokens[index];
    if (flag.includes('=') || booleanFlags.has(flag)) index += 1;
    else index += 2;
  }
  return tokens.slice(index).join(' ');
}

function shellWords(value = '') {
  return parseShellArgv(value).tokens;
}

function parseShellArgv(value = '') {
  const source = String(value).trim();
  const tokens = [];
  let token = '';
  let tokenStarted = false;
  let reliable = true;

  const flush = () => {
    if (tokenStarted) tokens.push(token);
    token = '';
    tokenStarted = false;
  };

  for (let index = 0; index < source.length;) {
    const character = source[index];
    if (/\s/.test(character)) {
      flush();
      index += 1;
      continue;
    }
    tokenStarted = true;
    if (character === '\\') {
      if (index + 1 >= source.length) {
        token += character;
        reliable = false;
        index += 1;
      } else if (source[index + 1] === '\n') {
        index += 2;
      } else {
        token += source[index + 1];
        index += 2;
      }
      continue;
    }
    if (character === "'") {
      const quoted = readSimpleShellQuote(source, index + 1, "'");
      token += quoted.value;
      reliable &&= quoted.reliable;
      index = quoted.next;
      continue;
    }
    if (character === '$' && source[index + 1] === "'") {
      const quoted = readAnsiCShellQuote(source, index + 2);
      token += quoted.value;
      reliable &&= quoted.reliable;
      index = quoted.next;
      continue;
    }
    if (character === '"') {
      const quoted = readDoubleShellQuote(source, index + 1);
      token += quoted.value;
      reliable &&= quoted.reliable;
      index = quoted.next;
      continue;
    }
    if (character === '*' || character === '?' || character === '[' || character === '{'
      || (character === '@' || character === '+' || character === '!' || character === '<' || character === '>')
        && source[index + 1] === '(') {
      reliable = false;
    }
    if (character === '`' || character === '$' && /[({a-zA-Z_0-9*@#?$!\-]/.test(source[index + 1] ?? '')) {
      reliable = false;
    }
    token += character;
    index += 1;
  }
  flush();
  return { tokens, reliable };
}

function readSimpleShellQuote(source, start, quote) {
  let value = '';
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === quote) return { value, reliable: true, next: index + 1 };
    value += source[index];
  }
  return { value, reliable: false, next: source.length };
}

function readDoubleShellQuote(source, start) {
  let value = '';
  let reliable = true;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') return { value, reliable, next: index + 1 };
    if (character === '\\') {
      const next = source[index + 1];
      if (next === undefined) return { value: `${value}\\`, reliable: false, next: source.length };
      if (next === '\n') {
        index += 1;
        continue;
      }
      if (/^[\\"$`]$/.test(next)) {
        value += next;
        index += 1;
        continue;
      }
      value += `\\${next}`;
      index += 1;
      continue;
    }
    if (character === '`' || character === '$' && /[({a-zA-Z_0-9*@#?$!\-]/.test(source[index + 1] ?? '')) {
      reliable = false;
    }
    value += character;
  }
  return { value, reliable: false, next: source.length };
}

function readAnsiCShellQuote(source, start) {
  let value = '';
  let reliable = true;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (character === "'") return { value, reliable, next: index + 1 };
    if (character !== '\\') {
      value += character;
      continue;
    }
    const decoded = decodeAnsiCEscape(source, index + 1);
    value += decoded.value;
    reliable &&= decoded.reliable;
    index = decoded.next - 1;
  }
  return { value, reliable: false, next: source.length };
}

function decodeAnsiCEscape(source, index) {
  const character = source[index];
  if (character === undefined) return { value: '\\', reliable: false, next: source.length };
  const simple = {
    a: '\x07', b: '\b', e: '\x1b', E: '\x1b', f: '\f', n: '\n', r: '\r',
    t: '\t', v: '\v', '\\': '\\', "'": "'", '"': '"',
  };
  if (Object.hasOwn(simple, character)) return { value: simple[character], reliable: true, next: index + 1 };
  const hexWidth = character === 'x' ? 2 : character === 'u' ? 4 : character === 'U' ? 8 : 0;
  if (hexWidth) {
    const digits = source.slice(index + 1).match(new RegExp(`^[0-9a-fA-F]{1,${hexWidth}}`))?.[0] ?? '';
    if (!digits) return { value: character, reliable: false, next: index + 1 };
    const codePoint = Number.parseInt(digits, 16);
    try {
      return { value: String.fromCodePoint(codePoint), reliable: true, next: index + 1 + digits.length };
    } catch {
      return { value: '', reliable: false, next: index + 1 + digits.length };
    }
  }
  if (/[0-7]/.test(character)) {
    const digits = source.slice(index).match(/^[0-7]{1,3}/)?.[0] ?? character;
    return { value: String.fromCodePoint(Number.parseInt(digits, 8)), reliable: true, next: index + digits.length };
  }
  return { value: character, reliable: false, next: index + 1 };
}

function joinShellWords(values = []) {
  return values.map((value) => (
    /[\s'"\\]/.test(String(value)) ? JSON.stringify(String(value)) : String(value)
  )).join(' ');
}

function isExternalAutomationName(value = '') {
  const basename = automationBasename(value);
  if (isVerificationAutomationName(basename)) return false;
  return /^(?:deploy|publish|release|push|upload|promote|ship)(?:$|[-_.:])/i.test(basename)
    || /^(?:prod|production)[-_.:](?:deploy|publish|release|push|upload|promote|ship)(?:$|[-_.:])/i.test(basename);
}

function automationBasename(value = '') {
  return String(value).split('/').at(-1)?.replace(/\.(?:sh|bash|zsh|mjs|cjs|js|py)$/i, '').toLowerCase() ?? '';
}

function hasExternalAutomationToken(value = '') {
  return /(?:^|[-_.:])(?:deploy|publish|release|push|upload|promote|ship)(?:$|[-_.:])/i.test(automationBasename(value));
}

function isVerificationAutomationName(value = '') {
  const basename = automationBasename(value);
  const tokens = basename.split(/[-_.:]+/).filter(Boolean);
  if (!tokens.some((token) => /^(?:deploy|publish|release|push|upload|promote|ship)$/.test(token))) return false;
  const qualifiers = tokens.filter((token) => !/^(?:deploy|publish|release|push|upload|promote|ship)$/.test(token));
  if (!qualifiers.length) return false;
  return qualifiers.every((token) => /^(?:test|tests|unit|integration|e2e|check|checks|verify|verification|build|compile|lint|typecheck|preflight|preview|dry|run|ci)$/.test(token))
    && qualifiers.some((token) => /^(?:test|tests|check|checks|verify|verification|build|compile|lint|typecheck|preflight|preview|dry)$/.test(token));
}

function isIrreversibleAction(name = '', text = '', rawText = text) {
  if (isIrreversible(text)) return true;
  if (/(?:^|[_-])database(?:$|[_-])/i.test(name)
    && /\b(?:delete\s+from|drop\s+(?:table|database|schema)|truncate\s+(?:table\s+)?|revoke\s+)\b/i.test(rawText)) return true;
  if (/(?:^|[_-])(?:browser|web)(?:$|[_-])/i.test(name)
    && /\b(?:delete|remove|close)\b.{0,40}\b(?:account|repository|project|workspace|record|subscription)\b|删除.{0,24}(?:账户|账号|仓库|项目|工作区|记录|订阅)/i.test(rawText)) return true;
  return commandSegments(text).some((segment) => (
    /^curl\b[^\n]*(?:--request(?:\s+|=)delete|(?:^|\s)-x\s*delete)\b/i.test(segment)
    || /^http\s+delete\b/i.test(segment)
    || /^wget\b[^\n]*--method\s*=?delete\b/i.test(segment)
    || /\b(?:requests|axios)\.delete\s*\(/i.test(segment)
    || /\bfetch\s*\([^\n]*method\s*:\s*['"]delete['"]/i.test(segment)
    || /(?:\bhttps?\.request|require\(['"]https?['"]\)\.request)\s*\([^\n]*method\s*:\s*['"]delete['"]/i.test(segment)
    || isDatabaseCliIrreversible(segment)
    || isRemoteTransferIrreversible(segment)
    || isRemoteDeploymentCliIrreversible(segment)
  ));
}

function isIrreversible(text) {
  return commandSegments(text).some((segment) => (
    isCommandExpansionExhausted(segment)
    || /^(?:rm|rmdir|unlink)\b/.test(segment)
    || /^find\b[^\n]*(?:\s-delete\b|-exec\s+(?:rm|rmdir|unlink)\b)/.test(segment)
    || /^git\s+(?:clean\b|reset\b[^\n]*--hard\b|checkout\b[^\n]*\s--(?:\s|$)|restore\b|branch\b[^\n]*(?:-d|--delete(?:-force)?)\b|stash\s+(?:drop|clear)\b)/.test(segment)
    || /^git\s+tag\b[^\n]*(?:^|\s)(?:-d|--delete|-f|--force)(?:\s|$)/.test(segment)
    || /^git\s+update-ref\b[^\n]*(?:^|\s)(?:-d|--delete)(?:\s|$)/.test(segment)
    || /^git\s+reflog\s+expire\b/.test(segment)
    || /^git\s+gc\b[^\n]*(?:^|\s)--prune(?:=|\s+)now(?:\s|$)/.test(segment)
    || /^git\s+worktree\s+remove\b[^\n]*(?:^|\s)(?:-f|--force)(?:\s|$)/.test(segment)
    || /^git\s+push\b[^\n]*(?:--force(?:-with-lease|-if-includes)?\b|(?:^|\s)-f(?:\s|$)|--delete\b|\s:\S+)/.test(segment)
    || /^npm\s+unpublish\b/.test(segment)
    || /^kubectl\b/.test(segment) && /^delete\b/.test(providerCommand(segment, 'kubectl'))
    || /^helm\b/.test(segment) && /^uninstall\b/.test(providerCommand(segment, 'helm'))
    || /^terraform\s+destroy\b/.test(segment)
    || /^gh\s+(?:issue|pr|release)\s+delete\b/.test(segment)
    || /^gh\s+repo\s+delete\b/.test(segment)
    || /^gh\s+api\b[^\n]*(?:--method(?:\s+|=)delete|-x\s*delete)\b/.test(segment)
    || /^aws\b/.test(segment) && /(?:^|\s)(?:delete|remove|rm|terminate|destroy|purge)(?:-|\s|$)/.test(providerCommand(segment, 'aws'))
    || /^(?:gcloud|az)\b/.test(segment) && /(?:^|\s)(?:delete|remove|destroy|purge)(?:\s|$)/.test(providerCommand(segment, segment.startsWith('gcloud') ? 'gcloud' : 'az'))
    || /^docker\s+(?:system|image|container|volume|network|builder)?\s*(?:prune|rm|remove)\b/.test(segment)
    || /^(?:docker\s+compose|docker-compose)\s+down\b[^\n]*(?:^|\s)(?:-v|--volumes)(?:\s|$)/.test(segment)
    || /^podman\s+volume\s+(?:rm|remove|prune)\b/.test(segment)
    || /^(?:crane|skopeo)\s+delete\b/.test(segment)
    || /^rclone\s+(?:delete|purge)\b/.test(segment)
    || /^gsutil\s+rm\b/.test(segment)
    || /^azcopy\s+remove\b/.test(segment)
    || /^(?:truncate\b|shred\b)/.test(segment)
    || /\bshutil\.rmtree\s*\(/.test(segment)
    || /\bos\.(?:remove|unlink|rmdir)\s*\(/.test(segment)
    || /\bpath\s*\([^)]*\)\.(?:unlink|rmdir)\s*\(/.test(segment)
    || /\bfile\.(?:delete|unlink)\s*\(/.test(segment)
    || /\b(?:perl\s+-e\s+[^\n]*\bunlink\b|ruby\s+-e\s+[^\n]*\bfile\.delete\b)/.test(segment)
    || /^(?:\.\/)?(?:cleanup|clean|delete|remove|purge|wipe)(?:[-_][\w.-]+)?\.sh\b/.test(segment)
    || /^ssh\b[^\n]+\s+(?:['"])?(?:rm|rmdir|unlink|truncate|shred)\b/.test(segment)
    || /^xargs\b[^\n]*(?:^|\s)(?:rm|rmdir|unlink|shred)\b/.test(segment)
    || /^parallel\b[^\n]*(?:^|\s)(?:rm|rmdir|unlink|shred)\b/.test(segment)
    || /^dd\b[^\n]*(?:^|\s)of=\S+/.test(segment)
    || /^wipefs\b(?![^\n]*--no-act)[^\n]*(?:\s-a\b|\s--all\b)/.test(segment)
    || /^mkfs(?:\.[a-z0-9_-]+)?\b(?![^\n]*(?:--help|--version))/.test(segment)
    || /(?:require\(['"]fs['"]\)|\bfs)\.(?:unlinksync|rmsync|rmdirsync)\s*\(/.test(segment)
    || /\b(?:delete|wipe|clear)\b[^\n]*(?:entire|all|cache|directory|folder|files?)/.test(segment)
    || /(?:删除|清空|移除)[^\n]{0,32}(?:整个|全部|所有|缓存|目录|文件)/.test(segment)
  ));
}

function isKnownWorkspaceWrite(text) {
  const parsed = shellSegments(text);
  return parsed.redirection || commandSegments(text).some((segment) => (
    isCommandExpansionExhausted(segment)
    || hasOutputFileMutation(segment)
    ||
    /^(?:touch|cp|mv|install|mkdir|rmdir|truncate|shred|chmod|chown|ln)\b/.test(segment)
    || /^rm\b/.test(segment)
    || /^sed\b[^\n]*\s-i(?:\s|["'])/.test(segment)
    || /^tee\b/.test(segment)
    || /^git\s+(?:add|commit|apply|am|reset|checkout|switch|restore|clean|merge|rebase|cherry-pick|tag)\b/.test(segment)
    || /^(?:npm|pnpm|yarn|bun)\s+(?:install|i|ci|add|remove|uninstall|update|upgrade|link)\b/.test(segment)
    || /^aws\s+s3\s+(?:cp|mv|sync)\s+s3:\/\/\S+\s+(?!s3:\/\/)/.test(segment)
    || /\b(?:writefile|writefilesync|appendfile|appendfilesync|createwritestream|mkdirsync|renamesync|copyfilesync|unlinksync|rmsync|rmdirsync)\s*\(/.test(segment)
    || /\b(?:file\.(?:write|delete)|path\s*\([^)]*\)\.(?:write_text|write_bytes|unlink)|os\.(?:remove|unlink|rename)|unlink)\s*\(/.test(segment)
    || /\bopen\s*\([^\n]*(?:['"](?:w|a|x)\+?['"])/.test(segment)
  )) || isIrreversible(text);
}

function isProvablyReadOnlyShell(text) {
  if (isKnownWorkspaceWrite(text)) return false;
  const parsed = shellSegments(text);
  return !parsed.untrusted
    && commandSegments(text).length > 0
    && commandSegments(text).every((segment) => isProvablyReadOnlySimple(segment));
}

function isProvablyReadOnlySimple(text) {
  if (hasCommandBearingShellEffects(text)) return false;
  if (/^cd(?:\s|$)/.test(text)) return true;
  if (/^curl\b/.test(text) && !hasOutputFileMutation(text) && !isExternalWrite('', text)) return true;
  if (isExactReleaseVerifier(text)) return true;
  if (isReadOnlyDatabaseCli(text)) return true;
  if (/^ssh\b/.test(text) && isReadOnlySshCommand(sshCommand(shellWords(text)))) return true;
  if (isReadOnlyRemoteDeploymentCli(text) || isRemoteDeploymentCliProbe(text)) return true;
  if (isAgentCliProbe(text)) return true;
  return /^git\s+(?:status|diff|log|show|rev-parse|ls-files|ls-remote|branch\s+--show-current)\b/.test(text)
    || /^(?:rg|grep|ls|pwd|cat|head|tail|wc|stat|file|which|type|jq|sha(?:1|224|256|384|512)sum|tree|du)\b/.test(text)
    || /^sed\s+-n\b/.test(text)
    || /^find\b(?![^\n]*(?:-delete|-exec|-ok))/.test(text)
    || /^node\s+--check\b/.test(text)
    || /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:lint|typecheck|check(?::(?!test)[\w.-]+)?)\b(?![^\n]*--fix)/.test(text);
}

function isProvablyTestFreeShell(text = '') {
  if (hasUnverifiableShellArgv(String(text))) return false;
  if (hasCommandBearingShellEffects(String(text).trim())) return false;
  const parsed = shellSegments(text);
  if (parsed.untrusted) return false;
  const segments = commandSegments(text);
  return segments.length > 0 && segments.every(isProvablyTestFreeSegment);
}

function isProvablyTestFreeSegment(segment = '') {
  const text = String(segment).trim();
  if (!text || isCommandExpansionExhausted(text) || hasUnverifiableShellArgv(text) || hasCommandBearingShellEffects(text)) return false;
  if (/^(?:npm|pnpm|yarn|bun)\b/.test(text) && !isExactReleaseVerifier(text)) return false;
  if (isRepositoryControlledAutomation(text)) return false;
  if (/^(?:sed|awk)\b/.test(text)) return false;
  if (isProvablyReadOnlySimple(text)) return true;
  if (/^(?:rm|rmdir|unlink|touch|cp|mv|mkdir|truncate|shred|chmod|chown|ln|tee)\b/.test(text)) return true;
  if (/^install\s+(?!-?\w*\s*(?:package|dependenc))/i.test(text)) return true;
  if (/^git\s+push\b[^\n]*\s--no-verify(?:\s|$)/.test(text)) return true;
  return false;
}

function hasCommandBearingShellEffects(segment = '') {
  const text = String(segment).trim();
  if (!text) return false;
  if (/^(?:node|python\d*(?:\.\d+)?|ruby|perl|php|lua|luajit|rscript|julia|groovy|clojure|bb)\b[^\n]{0,240}(?:^|\s)(?:-[a-z]*[cepr]|--eval|--execute)(?:=|\s|$)/i.test(text)) return true;
  if (/^awk\b[^\n]*(?:\bsystem\s*\(|["'][^"'\n]*["']\s*\|\s*getline\b)/i.test(text)) return true;
  if (/^(?:rg|ripgrep)\b[^\n]*(?:^|\s)--pre(?:=|\s)/i.test(text)) return true;
  if (/^sed\b[^\n]*(?:^|\s)(?:-e|--expression)(?:=|\s+)["']?e(?:\s|$)/i.test(text)) return true;
  if (/^tar\b[^\n]*(?:^|\s)--checkpoint-action(?:=|\s+)exec(?:=|\s)/i.test(text)) return true;
  if (/^git\b[^\n]*(?:^|\s)-c\s+alias\.[^=\s]+\s*=\s*["']?!/i.test(text)) return true;
  if (/^git\b[^\n]*(?:^|\s)-c(?:\s|$)/i.test(text)) return true;
  return false;
}

function hasUnverifiableShellArgv(value = '') {
  const parsed = parseShellArgv(value);
  if (!parsed.reliable) return true;
  return parsed.tokens.some((token) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(token));
}

function hasOutputFileMutation(segment = '') {
  const text = String(segment).trim();
  if (/^git\s+(?:diff|show|log)\b[^\n]*\s--output(?:=|\s+)\S+/.test(text)) return true;
  if (/^find\b[^\n]*\s-(?:fprint|fprint0|fprintf|fls)\s+\S+/.test(text)) return true;
  if (!/^curl\b/.test(text)) return false;
  if (/(?:^|\s)(?:-[A-Za-z]*O[A-Za-z]*|--remote-name|--remote-name-all|--remote-header-name)(?:\s|$)/.test(text)) return true;
  const output = text.match(/(?:^|\s)(?:-o|--output)(?:=|\s+)(\S+)/);
  if (output) return output[1] !== '-';
  const combinedOutput = text.match(/(?:^|\s)-[A-Za-z]*o\s+(\S+)/);
  if (combinedOutput) return combinedOutput[1] !== '-';
  const attachedOutput = text.match(/(?:^|\s)-o([^\s-]\S*)/);
  return Boolean(attachedOutput);
}

function isExactReleaseVerifier(segment = '') {
  const text = String(segment).trim();
  return isExactNpmReleaseVerifier(text)
    || /^omp\s+plugin\s+list(?:\s+--json)?$/.test(text)
    || /^docker\s+manifest\s+inspect\s+\S+(?:\s+--verbose)?$/.test(text)
    || /^docker\s+buildx\s+imagetools\s+inspect\s+\S+(?:\s+--raw)?$/.test(text)
    || /^gh\s+release\s+view\s+\S+\b/.test(text)
    || /^kubectl\b/.test(text) && /^get\b/.test(providerCommand(text, 'kubectl'))
    || /^helm\b/.test(text) && /^status\b/.test(providerCommand(text, 'helm'))
    || /^git\s+ls-remote\s+\S+\s+\S+$/.test(text);
}

function isExactNpmReleaseVerifier(value = '') {
  const tokens = shellWords(value);
  if (tokens[0] !== 'npm' || !['view', 'info'].includes(tokens[1]) || !tokens[2]) return false;
  const field = tokens[3];
  if (!['version', 'dist-tags'].includes(field)) return false;
  if (field === 'dist-tags' && tokens[1] !== 'view') return false;
  let json = false;
  let registry = '';
  let index = 4;
  while (index < tokens.length) {
    if (tokens[index] === '--json') {
      json = true;
      index += 1;
      continue;
    }
    if (tokens[index] === '--registry' && /^https:\/\//i.test(tokens[index + 1] ?? '')) {
      registry = tokens[index + 1];
      index += 2;
      continue;
    }
    if (/^--registry=https:\/\//i.test(tokens[index])) {
      registry = tokens[index].slice('--registry='.length);
      index += 1;
      continue;
    }
    return false;
  }
  return field === 'version' || json && Boolean(registry);
}

function commandSegments(text, depth = 0) {
  if (depth > 6) return [COMMAND_EXPANSION_EXHAUSTED];
  return shellSegments(text).segments.flatMap((segment) => expandCommandSegment(segment, depth));
}

function isCommandExpansionExhausted(value = '') {
  return String(value).trim() === COMMAND_EXPANSION_EXHAUSTED;
}

function expandCommandSegment(value, depth) {
  let segment = normalizeExecutablePath(String(value).trim());
  const groupedCommand = unwrapShellGrouping(segment);
  if (groupedCommand !== segment) return commandSegments(groupedCommand, depth + 1);
  for (let launcherDepth = 0; launcherDepth < 8; launcherDepth += 1) {
    const previous = segment;
    segment = stripLeadingEnvironmentAssignments(segment);
    segment = stripPrivilegeAndEnvironmentLaunchers(segment);
    segment = stripTimeoutAndNiceLaunchers(segment);
    segment = segment.replace(/^(?:exec|nohup|time)\s+(?:(?:-[^\s]+)\s+)*/, '');
    segment = stripTransparentProcessLaunchers(segment);
    if (segment === previous) break;
  }
  const quotedCommand = stripOuterQuote(segment);
  if (quotedCommand !== segment) return commandSegments(quotedCommand, depth + 1);
  segment = segment.replace(/^busybox\s+/, '');
  segment = normalizeExecutablePath(segment);

  const opaqueProcessCommand = unwrapOpaqueProcessLauncher(segment);
  if (opaqueProcessCommand !== segment) return commandSegments(opaqueProcessCommand, depth + 1);

  const scriptCommand = unwrapScriptCommand(segment);
  if (scriptCommand !== segment) return commandSegments(scriptCommand, depth + 1);

  const containerCommand = unwrapContainerCommand(segment);
  if (containerCommand !== segment) return commandSegments(containerCommand, depth + 1);

  const flockCommand = unwrapFlockCommand(segment);
  if (flockCommand !== segment) return commandSegments(flockCommand, depth + 1);

  const parallelCommand = unwrapParallelCommand(segment);
  if (parallelCommand !== segment) return commandSegments(parallelCommand, depth + 1);

  const findExecCommand = unwrapFindExecCommand(segment);
  if (findExecCommand !== segment) return commandSegments(findExecCommand, depth + 1);

  const kubernetesCommand = unwrapKubectlCommand(segment);
  if (kubernetesCommand !== segment) return commandSegments(kubernetesCommand, depth + 1);

  const environmentRunnerCommand = unwrapEnvironmentRunnerCommand(segment);
  if (environmentRunnerCommand !== segment) return commandSegments(environmentRunnerCommand, depth + 1);

  const packageExecCommand = unwrapPackageExecCommand(segment);
  if (packageExecCommand !== segment) return commandSegments(packageExecCommand, depth + 1);

  const corepackCommand = segment.match(/^corepack\s+(?:(?:--[^\s]+)\s+)*((?:npm|pnpm|yarn)\b[\s\S]*)$/);
  if (corepackCommand) return commandSegments(corepackCommand[1], depth + 1);

  const miseCommand = segment.match(/^mise\s+(?:exec|x)\s+(?:--\s+)?([\s\S]+)$/);
  if (miseCommand) return commandSegments(miseCommand[1], depth + 1);

  const shellCommand = shellNestedCommand(segment);
  if (shellCommand) return commandSegments(shellCommand, depth + 1);

  const evaluatedCommand = segment.match(/^(?:eval|source|\.)\s+([\s\S]+)$/);
  if (evaluatedCommand) return commandSegments(stripOuterQuote(evaluatedCommand[1]), depth + 1);

  const xargsCommand = xargsNestedCommand(segment);
  if (xargsCommand) return commandSegments(xargsCommand, depth + 1);

  const controlledSegment = stripShellControlPrefix(segment);
  if (controlledSegment !== segment) return commandSegments(controlledSegment, depth + 1);

  segment = segment.replace(/^git\s+(?:(?:-c|--git-dir|--work-tree)\s+\S+\s+|(?:--git-dir|--work-tree)=\S+\s+)*/, 'git ');
  segment = stripPackageManagerGlobalOptions(segment);
  segment = segment.replace(/^(npm|pnpm|yarn)\s+run-script\s+/, '$1 run ');
  segment = segment.replace(/^npm\s+(?:t|tst)(?:\s|$)/, 'npm test ');
  segment = segment.replace(/^npx\s+(?:(?:--yes|-y|--no-install)\s+)*/, '');
  segment = segment.replace(/^npm\s+exec\s+(?:--\s+)?/, '');
  segment = segment.replace(/^(?:pnpm|yarn|bun)\s+(?:exec|dlx|x)\s+/, '');
  segment = segment.replace(/^bunx\s+(?:(?:--bun)\s+)*/, '');
  segment = segment.replace(/^(?:pnpm|yarn|bun)\s+((?:vitest|jest|mocha)\b[\s\S]*)$/, '$1');
  segment = segment.replace(/^(?:pnpm|yarn|bun)\s+(playwright\s+test\b[\s\S]*)$/, '$1');
  segment = segment.replace(/^python\d*(?:\.\d+)?\s+-m\s+/, '');
  segment = normalizeExecutablePath(segment.trim());
  const unknownNestedCommand = unwrapUnknownExecutableSuffix(segment);
  if (unknownNestedCommand !== segment) {
    return [segment, ...commandSegments(unknownNestedCommand, depth + 1)].filter(Boolean);
  }
  return [segment].filter(Boolean);
}

function unwrapShellGrouping(value = '') {
  const text = String(value).trim();
  if (!text.startsWith('(') || !text.endsWith(')')) return text;
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (depth === 0 && index < text.length - 1) return text;
    if (depth < 0) return text;
  }
  return depth === 0 ? text.slice(1, -1).trim() : text;
}

function stripPrivilegeAndEnvironmentLaunchers(value = '') {
  let segment = String(value).trim();
  for (let depth = 0; depth < 6; depth += 1) {
    const tokens = shellWords(segment);
    const executable = tokens[0] ?? '';
    if (!['sudo', 'doas', 'runuser', 'chroot', 'unshare', 'prlimit', 'command', 'env', 'cross-env', 'cross-env-shell'].includes(executable)) break;
    let index = 1;
    if (executable === 'sudo') {
      const withValue = new Set(['-u', '--user', '-g', '--group', '-h', '--host', '-p', '--prompt', '-C', '--close-from', '-D', '--chdir', '-R', '--chroot', '-T', '--command-timeout']);
      const noValue = new Set(['-n', '--non-interactive', '-E', '--preserve-env', '-H', '--set-home', '-k', '--reset-timestamp', '-K', '--remove-timestamp', '-b', '--background']);
      while (index < tokens.length) {
        const token = tokens[index];
        if (token === '--') {
          index += 1;
          break;
        }
        if (withValue.has(token)) index += 2;
        else if (noValue.has(token) || /^--[a-z][a-z0-9-]*=\S+$/i.test(token) || /^-[a-z]+$/i.test(token)) index += 1;
        else break;
      }
    } else if (executable === 'doas') {
      const withValue = new Set(['-u', '-C']);
      while (index < tokens.length) {
        const token = tokens[index];
        if (token === '--') {
          index += 1;
          break;
        }
        if (withValue.has(token)) index += 2;
        else if (/^(?:-n|-s|-L)$/.test(token)) index += 1;
        else break;
      }
    } else if (executable === 'runuser') {
      const withValue = new Set(['-u', '--user', '-g', '--group', '-G', '--supp-group', '-s', '--shell']);
      while (index < tokens.length) {
        const token = tokens[index];
        if (token === '--') {
          index += 1;
          break;
        }
        if (['-c', '--command'].includes(token)) return tokens[index + 1] ?? segment;
        if (withValue.has(token)) index += 2;
        else if (/^--(?:user|group|supp-group|shell)=\S+$/i.test(token)
          || /^(?:-l|--login|-f|--fast|-m|-p|--preserve-environment)$/.test(token)) index += 1;
        else break;
      }
    } else if (executable === 'chroot') {
      const withValue = new Set(['--userspec', '--groups']);
      while (index < tokens.length && tokens[index].startsWith('-')) {
        if (tokens[index] === '--') {
          index += 1;
          break;
        }
        if (withValue.has(tokens[index])) index += 2;
        else index += 1;
      }
      index += 1;
    } else if (executable === 'unshare') {
      const withValue = new Set(['--mount-proc', '--map-user', '--map-group', '--root', '--wd', '--setgroups', '--propagation', '--kill-child', '--map-users', '--map-groups']);
      while (index < tokens.length && tokens[index].startsWith('-')) {
        if (tokens[index] === '--') {
          index += 1;
          break;
        }
        if (withValue.has(tokens[index]) && !tokens[index].includes('=')) index += 2;
        else index += 1;
      }
    } else if (executable === 'prlimit') {
      const withValue = new Set(['--pid', '-p', '--cpu', '--fsize', '--data', '--stack', '--core', '--rss', '--nproc', '--nofile', '--memlock', '--as', '--locks', '--sigpending', '--msgqueue', '--nice', '--rtprio', '--rttime']);
      while (index < tokens.length && tokens[index].startsWith('-')) {
        if (tokens[index] === '--') {
          index += 1;
          break;
        }
        if (withValue.has(tokens[index]) && !tokens[index].includes('=')) index += 2;
        else index += 1;
      }
    } else if (executable === 'command') {
      while (index < tokens.length && (tokens[index] === '--' || /^-[pvV]+$/.test(tokens[index]))) index += 1;
    } else {
      const withValue = new Set(['-u', '--unset', '-C', '--chdir', '-S', '--split-string']);
      const noValue = new Set(['-i', '--ignore-environment', '-0', '--null', '--debug']);
      while (index < tokens.length) {
        const token = tokens[index];
        if (token === '--') {
          index += 1;
          break;
        }
        if (['-S', '--split-string'].includes(token)) {
          return [tokens[index + 1] ?? '', ...tokens.slice(index + 2)].filter(Boolean).join(' ');
        }
        if (/^--split-string=/i.test(token)) {
          const splitCommand = stripOuterQuote(token.slice(token.indexOf('=') + 1));
          return [splitCommand, ...tokens.slice(index + 1)].filter(Boolean).join(' ');
        }
        if (withValue.has(token) || ['-f', '--env-file'].includes(token)) index += 2;
        else if (noValue.has(token)
          || /^--(?:unset|chdir|split-string)=\S+$/i.test(token)
          || /^-[i0]+$/.test(token)
          || /^[a-z_][a-z0-9_]*=/i.test(token)) index += 1;
        else break;
      }
    }
    if (index >= tokens.length) return segment;
    segment = joinShellWords(tokens.slice(index));
  }
  return segment;
}

function stripLeadingEnvironmentAssignments(value = '') {
  const tokens = shellWords(value);
  let index = 0;
  while (index < tokens.length && /^[a-z_][a-z0-9_]*=/i.test(tokens[index])) index += 1;
  return index > 0 ? joinShellWords(tokens.slice(index)) : value;
}

function stripTimeoutAndNiceLaunchers(value = '') {
  const tokens = shellWords(value);
  const executable = tokens[0] ?? '';
  if (executable === 'timeout') {
    const withValue = new Set(['-s', '--signal', '-k', '--kill-after']);
    let index = 1;
    while (index < tokens.length) {
      const token = tokens[index];
      if (token === '--') {
        index += 1;
        break;
      }
      if (withValue.has(token)) index += 2;
      else if (/^--(?:signal|kill-after)=\S+$/i.test(token)
        || /^(?:--preserve-status|--foreground|-v|--verbose)$/.test(token)) index += 1;
      else break;
    }
    if (index >= tokens.length) return value;
    index += 1;
    return index < tokens.length ? joinShellWords(tokens.slice(index)) : value;
  }
  if (executable === 'nice') {
    let index = 1;
    while (index < tokens.length) {
      const token = tokens[index];
      if (token === '--') {
        index += 1;
        break;
      }
      if (['-n', '--adjustment'].includes(token)) index += 2;
      else if (/^(?:-n\S+|--adjustment=\S+|-\d+)$/.test(token)) index += 1;
      else break;
    }
    return index < tokens.length ? joinShellWords(tokens.slice(index)) : value;
  }
  return value;
}

function shellNestedCommand(value = '') {
  const tokens = shellWords(value);
  if (!/^(?:bash|sh|zsh|dash|fish)$/.test(tokens[0] ?? '')) return '';
  const optionsWithValue = new Set(['-o', '--option', '-O']);
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '-c' || /^-[a-z]*c[a-z]*$/i.test(token)) return tokens[index + 1] ?? '';
    if (optionsWithValue.has(token)) index += 1;
  }
  return '';
}

function unwrapEnvironmentRunnerCommand(value = '') {
  const tokens = shellWords(value);
  const executable = tokens[0] ?? '';
  let index = 1;
  if (executable === 'uv') {
    const runIndex = tokens.indexOf('run', 1);
    if (runIndex < 0) return value;
    index = runIndex + 1;
    const withValue = new Set(['--python', '-p', '--directory', '--project', '--with', '--with-editable', '--with-requirements', '--index', '--default-index', '--index-strategy', '--resolution', '--prerelease']);
    while (index < tokens.length) {
      const token = tokens[index];
      if (token === '--') {
        index += 1;
        break;
      }
      if (withValue.has(token)) index += 2;
      else if (/^--[a-z][a-z0-9-]*=\S+$/i.test(token) || /^-[a-z]+$/i.test(token)) index += 1;
      else break;
    }
  } else if (['poetry', 'pipenv', 'hatch', 'pdm'].includes(executable) && tokens[1] === 'run') {
    index = 2;
  } else if (['conda', 'mamba', 'micromamba'].includes(executable) && tokens[1] === 'run') {
    index = 2;
    const withValue = new Set(['-n', '--name', '-p', '--prefix', '--cwd']);
    while (index < tokens.length) {
      const token = tokens[index];
      if (token === '--') {
        index += 1;
        break;
      }
      if (withValue.has(token)) index += 2;
      else if (/^--(?:name|prefix|cwd)=\S+$/i.test(token) || /^(?:--no-capture-output|--live-stream|--dev)$/.test(token)) index += 1;
      else break;
    }
  } else if (executable === 'uvx') {
    index = 1;
  } else {
    return value;
  }
  return index < tokens.length ? joinShellWords(tokens.slice(index)) : value;
}

function unwrapPackageExecCommand(value = '') {
  const tokens = shellWords(value);
  const executable = tokens[0] ?? '';
  const isNpx = executable === 'npx';
  const isExec = /^(?:npm|pnpm|yarn|bun)$/.test(executable) && ['exec', 'x', 'dlx'].includes(tokens[1]);
  if (!isNpx && !isExec) return value;
  let index = isNpx ? 1 : 2;
  const withValue = new Set(['--package', '-p', '--call', '-c', '--cache', '--workspace', '-w', '--prefix', '--userconfig']);
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === '--') {
      index += 1;
      break;
    }
    if (['--call', '-c'].includes(token)) {
      const command = tokens[index + 1] ?? '';
      return command ? joinShellWords([command, ...tokens.slice(index + 2)]) : value;
    }
    if (/^--call=/.test(token)) {
      const command = token.slice('--call='.length);
      return command ? joinShellWords([command, ...tokens.slice(index + 1)]) : value;
    }
    if (withValue.has(token)) index += 2;
    else if (/^--[a-z][a-z0-9-]*=\S+$/i.test(token) || /^(?:-y|--yes|--no-install|--ignore-existing|--quiet)$/.test(token)) index += 1;
    else break;
  }
  return index < tokens.length ? joinShellWords(tokens.slice(index)) : value;
}

function stripTransparentProcessLaunchers(value = '') {
  let segment = String(value).trim();
  const specs = {
    setsid: { withValue: new Set(), noValue: new Set(['-c', '--ctty', '-f', '--fork', '-w', '--wait']) },
    stdbuf: { withValue: new Set(['-i', '--input', '-o', '--output', '-e', '--error']), noValue: new Set() },
    ionice: { withValue: new Set(['-c', '--class', '-n', '--classdata', '-p', '--pid']), noValue: new Set(['-t', '--ignore']) },
    taskset: { withValue: new Set(['-c', '--cpu-list']), noValue: new Set(['-a', '--all-tasks', '-p', '--pid']) },
    'systemd-run': {
      withValue: new Set(['--unit', '--description', '--property', '-p', '--setenv', '-E', '--working-directory', '-d', '--uid', '--gid', '--slice', '--nice', '--service-type', '--on-active', '--on-boot', '--on-startup', '--on-unit-active', '--on-unit-inactive', '--timer-property']),
      noValue: new Set(['--user', '--system', '--scope', '--remain-after-exit', '--collect', '--wait', '--pipe', '--pty', '--quiet', '-q', '--no-block', '--no-ask-password', '--expand-environment', '--send-sighup']),
    },
    chronic: { withValue: new Set(), noValue: new Set(['-e', '--stderr', '-v', '--verbose']) },
    watch: {
      withValue: new Set(['-n', '--interval', '-q', '--equexit', '-s', '--shotsdir']),
      noValue: new Set(['-b', '--beep', '-c', '--color', '-C', '--no-color', '-d', '--differences', '-e', '--errexit', '-g', '--chgexit', '-p', '--precise', '-r', '--no-rerun', '-t', '--no-title', '-w', '--no-wrap', '-x', '--exec']),
    },
    'xvfb-run': {
      withValue: new Set(['-e', '--error-file', '-f', '--auth-file', '-n', '--server-num', '-s', '--server-args', '-p', '--xauth-protocol']),
      noValue: new Set(['-a', '--auto-servernum', '-l', '--listen-tcp']),
    },
  };
  for (let depth = 0; depth < 4; depth += 1) {
    const tokens = shellWords(segment);
    const spec = specs[tokens[0]];
    if (!spec) break;
    let index = 1;
    while (index < tokens.length) {
      const token = tokens[index];
      if (token === '--') {
        index += 1;
        break;
      }
      if (spec.withValue.has(token)) {
        index += 2;
        continue;
      }
      if (spec.noValue.has(token)
        || /^-[a-z]+$/i.test(token)
        || /^--[a-z][a-z0-9-]*=\S+$/i.test(token)
        || /^(?:-[ioe].+|-c\d+|-n\d+)$/i.test(token)) {
        index += 1;
        continue;
      }
      break;
    }
    if (index >= tokens.length) return segment;
    segment = joinShellWords(tokens.slice(index));
  }
  return segment;
}

function unwrapOpaqueProcessLauncher(value = '') {
  const tokens = shellWords(value);
  const executable = tokens[0] ?? '';
  const commandAt = (index) => index < tokens.length ? joinShellWords(tokens.slice(index)) : value;

  if (executable === 'gdb') {
    const argsIndex = tokens.indexOf('--args');
    return argsIndex >= 0 ? commandAt(argsIndex + 1) : value;
  }
  if (executable === 'su') {
    const commandIndex = tokens.findIndex((token) => token === '-c' || token === '--command');
    if (commandIndex >= 0) return tokens[commandIndex + 1] ?? value;
    const attached = tokens.find((token) => /^--command=/.test(token));
    return attached ? attached.slice('--command='.length) : value;
  }

  let index = 1;
  if (executable === 'strace') {
    const withValue = new Set(['-o', '--output', '-e', '--trace', '-p', '--attach', '-u', '--user', '-I', '--interruptible', '--decode-fds', '--inject', '--fault', '--status']);
    while (index < tokens.length) {
      const token = tokens[index];
      if (token === '--') return commandAt(index + 1);
      if (withValue.has(token)) index += 2;
      else if (/^(?:--[a-z][a-z0-9-]*=\S+|-[a-zA-Z]+)$/.test(token)) index += 1;
      else break;
    }
    return commandAt(index);
  }

  if (executable === 'perf') {
    const subcommandIndex = tokens.findIndex((token, tokenIndex) => tokenIndex > 0 && /^(?:stat|record|trace)$/.test(token));
    if (subcommandIndex < 0) return value;
    index = subcommandIndex + 1;
    const withValue = new Set(['-e', '--event', '-o', '--output', '-p', '--pid', '-t', '--tid', '-C', '--cpu', '-c', '--count', '-F', '--freq', '--filter', '--delay', '--timeout', '--control']);
    while (index < tokens.length) {
      const token = tokens[index];
      if (token === '--') return commandAt(index + 1);
      if (withValue.has(token)) index += 2;
      else if (/^(?:--[a-z][a-z0-9-]*=\S+|-[a-zA-Z]+)$/.test(token)) index += 1;
      else break;
    }
    return commandAt(index);
  }

  if (executable === 'valgrind') {
    const withValue = new Set(['--tool', '--log-file', '--xml-file', '--suppressions', '--trace-children-skip', '--trace-children-skip-by-arg']);
    while (index < tokens.length) {
      const token = tokens[index];
      if (token === '--') return commandAt(index + 1);
      if (withValue.has(token)) index += 2;
      else if (/^(?:--[a-z][a-z0-9-]*(?:=\S+)?|-[a-zA-Z]+)$/.test(token)) index += 1;
      else break;
    }
    return commandAt(index);
  }

  if (executable === 'nsenter') {
    const withValue = new Set(['-t', '--target', '-S', '--setuid', '-G', '--setgid', '--root', '--wd', '--wdns', '--join-cgroup']);
    while (index < tokens.length) {
      const token = tokens[index];
      if (token === '--') return commandAt(index + 1);
      if (withValue.has(token)) index += 2;
      else if (/^(?:--[a-z][a-z0-9-]*=\S+|--?[a-zA-Z]+)$/.test(token)) index += 1;
      else break;
    }
    return commandAt(index);
  }

  if (executable === 'bwrap') {
    const arity = new Map([
      ['--bind', 2], ['--bind-try', 2], ['--ro-bind', 2], ['--ro-bind-try', 2],
      ['--dev-bind', 2], ['--dev-bind-try', 2], ['--symlink', 2], ['--setenv', 2],
      ['--file', 1], ['--bind-data', 1], ['--ro-bind-data', 1], ['--tmpfs', 1],
      ['--dev', 1], ['--proc', 1], ['--dir', 1], ['--chdir', 1], ['--remount-ro', 1],
      ['--hostname', 1], ['--uid', 1], ['--gid', 1], ['--seccomp', 1], ['--add-seccomp-fd', 1],
    ]);
    while (index < tokens.length) {
      const token = tokens[index];
      if (token === '--') return commandAt(index + 1);
      if (arity.has(token)) index += 1 + arity.get(token);
      else if (/^--[a-z][a-z0-9-]*(?:=\S+)?$/.test(token)) index += 1;
      else break;
    }
    return commandAt(index);
  }

  return value;
}

function unwrapScriptCommand(value = '') {
  const parsed = parseShellArgv(value);
  const { tokens } = parsed;
  if (executableBasename(tokens[0] ?? '') !== 'script') return value;
  const optionsWithValue = new Set([
    '-E', '--echo', '-I', '--log-in', '-B', '--log-io', '-O', '--log-out',
    '-T', '--log-timing', '-m', '--logging-format', '--output-limit',
  ]);
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--command') {
      const command = tokens[index + 1] ?? '';
      return parsed.reliable && command ? command : COMMAND_EXPANSION_EXHAUSTED;
    }
    const attached = token.match(/^(?:-c|--command)=([\s\S]*)$/i);
    if (attached) {
      return parsed.reliable && attached[1] ? attached[1] : COMMAND_EXPANSION_EXHAUSTED;
    }
    const compact = token.match(/^-[aefq]*c([\s\S]*)$/i);
    if (compact) {
      const command = compact[1] || tokens[index + 1] || '';
      return parsed.reliable && command ? command : COMMAND_EXPANSION_EXHAUSTED;
    }
    if (optionsWithValue.has(token)) index += 1;
  }
  return value;
}

function hasUnknownExecutableWrapper(value = '') {
  let segment = normalizeExecutablePath(String(value).trim());
  for (let depth = 0; depth < 8; depth += 1) {
    const previous = segment;
    segment = stripLeadingEnvironmentAssignments(segment);
    segment = stripPrivilegeAndEnvironmentLaunchers(segment);
    segment = stripTimeoutAndNiceLaunchers(segment);
    segment = segment.replace(/^(?:exec|nohup|time)\s+(?:(?:-[^\s]+)\s+)*/, '');
    segment = stripTransparentProcessLaunchers(segment);
    if (segment === previous) break;
  }
  return Boolean(unknownExecutableNestedCommand(segment));
}

function unwrapUnknownExecutableSuffix(value = '') {
  return unknownExecutableNestedCommand(value) || value;
}

function unknownExecutableNestedCommand(value = '') {
  const parsed = parseShellArgv(value);
  const { tokens } = parsed;
  if (tokens.length < 2 || isKnownTopLevelExecutable(tokens[0])) return '';
  const explicitCommand = unknownCommandBearingArgument(tokens);
  if (explicitCommand.found) {
    if (!parsed.reliable || !explicitCommand.command) return COMMAND_EXPANSION_EXHAUSTED;
    return isEffectfulNestedCommand(explicitCommand.command) ? explicitCommand.command : '';
  }

  const nestedIndex = tokens.findIndex((token, index) => index > 0 && isEffectfulNestedExecutable(token));
  if (nestedIndex > 0) return joinShellWords(tokens.slice(nestedIndex));

  const quotedIndex = tokens.findIndex((token, index) => (
    index > 0
    && /\s/.test(token)
    && isEffectfulNestedCommand(token)
  ));
  const positionalCommandWrapper = unknownExecutableAcceptsPositionalCommand(tokens[0]);
  if (!parsed.reliable && positionalCommandWrapper) return COMMAND_EXPANSION_EXHAUSTED;
  if (quotedIndex < 0 || !positionalCommandWrapper) return '';
  return tokens[quotedIndex];
}

function unknownCommandBearingArgument(tokens = []) {
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (['--command', '--cmd', '--exec', '--run', '-c'].includes(token)) {
      return { found: true, command: tokens[index + 1] ?? '' };
    }
    const longAttached = token.match(/^--(?:command|cmd|exec|run)=([\s\S]*)$/i);
    if (longAttached) return { found: true, command: longAttached[1] };
    const shortAttached = token.match(/^-c=?([\s\S]+)$/i);
    if (shortAttached) return { found: true, command: shortAttached[1] };
  }
  return { found: false, command: '' };
}

function unknownExecutableAcceptsPositionalCommand(executable = '') {
  const basename = executableBasename(executable).toLowerCase();
  return /(?:^|[-_.])(?:wrapper|runner|launcher|executor)$/.test(basename);
}

function isEffectfulNestedCommand(value = '') {
  const [executable] = shellWords(value);
  return Boolean(executable && isEffectfulNestedExecutable(executable));
}

function executableBasename(value = '') {
  return String(value).replace(/^['"]|['"]$/g, '').split('/').filter(Boolean).at(-1) ?? '';
}

function isKnownTopLevelExecutable(value = '') {
  return /^(?:bash|sh|zsh|dash|fish|env|command|sudo|doas|runuser|chroot|unshare|prlimit|timeout|nice|exec|nohup|time|setsid|stdbuf|ionice|taskset|systemd-run|chronic|watch|xvfb-run|flock|parallel|find|xargs|docker|podman|docker-compose|podman-compose|kubectl|strace|perf|valgrind|gdb|nsenter|bwrap|su|corepack|mise|npm|pnpm|yarn|bun|bunx|npx|node|python|python2|python3|ruby|perl|php|java|go|cargo|rustc|pytest|vitest|jest|mocha|ctest|make|just|task|bazel|bazelisk|mvn|mvnw|gradle|gradlew|dotnet|deno|tox|nox|rspec|playwright|cypress|git|gh|curl|wget|http|httpie|ssh|scp|rsync|aws|gcloud|az|helm|terraform|rm|rmdir|unlink|touch|cp|mv|install|mkdir|truncate|shred|chmod|chown|ln|sed|tee|echo|printf|logger|true|false|test|cd|pwd|date|uname|id|whoami|groups|sleep|printenv|basename|dirname|realpath|readlink|sort|uniq|cut|tr|awk|rg|grep|ls|cat|head|tail|wc|stat|file|which|type|jq|tree|du)$/i.test(executableBasename(value));
}

function isEffectfulNestedExecutable(value = '') {
  return /^(?:bash|sh|zsh|dash|fish|env|command|sudo|doas|runuser|chroot|unshare|prlimit|timeout|nice|exec|nohup|time|setsid|stdbuf|ionice|taskset|systemd-run|chronic|watch|xvfb-run|flock|parallel|find|xargs|docker|podman|docker-compose|podman-compose|kubectl|npm|pnpm|yarn|bun|bunx|npx|node|python|python2|python3|ruby|perl|php|java|go|cargo|pytest|vitest|jest|mocha|ctest|make|just|task|bazel|bazelisk|mvn|mvnw|gradle|gradlew|dotnet|deno|tox|nox|rspec|playwright|cypress|git|gh|curl|wget|http|httpie|ssh|scp|rsync|aws|gcloud|az|helm|terraform|rm|rmdir|unlink|touch|cp|mv|install|mkdir|truncate|shred|chmod|chown|ln|sed|tee)$/i.test(executableBasename(value));
}

function unwrapContainerCommand(value = '') {
  const tokens = shellWords(value);
  const executable = tokens[0] ?? '';
  if (!/^(?:docker|podman|docker-compose|podman-compose)$/.test(executable)) return value;
  let index = 1;
  if (/^(?:docker|podman)$/.test(executable)) {
    const globalWithValue = new Set(['--config', '--context', '-c', '--host', '-H', '--log-level', '-l', '--connection', '--url', '--identity', '--root', '--runroot', '--runtime']);
    const globalNoValue = new Set(['--debug', '-D', '--tls', '--tlsverify', '--help', '--version', '--remote']);
    while (index < tokens.length) {
      const token = tokens[index];
      if (globalWithValue.has(token)) index += 2;
      else if (globalNoValue.has(token) || /^--[a-z][a-z0-9-]*=\S+$/i.test(token)) index += 1;
      else break;
    }
    if (tokens[index] === 'container') index += 1;
  }
  let subcommand = tokens[index];
  if (/^(?:docker|podman)$/.test(executable) && subcommand === 'compose') {
    index += 1;
    const globalWithValue = new Set(['-f', '--file', '-p', '--project-name', '--project-directory', '--env-file', '--profile', '--parallel', '--ansi', '--progress']);
    while (index < tokens.length) {
      const token = tokens[index];
      if (globalWithValue.has(token)) index += 2;
      else if (/^--[a-z][a-z0-9-]*=\S+$/i.test(token) || /^-[a-z]+$/i.test(token)) index += 1;
      else break;
    }
    subcommand = tokens[index];
  }
  if (/^(?:docker-compose|podman-compose)$/.test(executable)) {
    const globalWithValue = new Set(['-f', '--file', '-p', '--project-name', '--project-directory', '--env-file', '--profile', '--parallel', '--ansi', '--progress']);
    while (index < tokens.length) {
      const token = tokens[index];
      if (globalWithValue.has(token)) index += 2;
      else if (/^--[a-z][a-z0-9-]*=\S+$/i.test(token) || /^-[a-z]+$/i.test(token)) index += 1;
      else break;
    }
    subcommand = tokens[index];
  }
  if (!['run', 'exec'].includes(subcommand)) return value;
  index += 1;
  const noValue = new Set([
    '--rm', '--init', '--privileged', '--read-only', '--tty', '-t', '--interactive', '-i',
    '--detach', '-d', '--publish-all', '-P', '--sig-proxy', '--disable-content-trust',
    '-T', '--no-TTY', '--service-ports', '--use-aliases', '--no-deps', '--build', '--quiet-pull',
  ]);
  const withValue = new Set([
    '--add-host', '--annotation', '--attach', '-a', '--cap-add', '--cap-drop', '--cgroup-parent',
    '--cidfile', '--cpus', '--cpuset-cpus', '--cpuset-mems', '--cpu-period', '--cpu-quota',
    '--cpu-shares', '-c', '--device', '--dns', '--dns-option', '--dns-search', '--domainname',
    '--entrypoint', '--env', '-e', '--env-file', '--expose', '--gpus', '--group-add', '--hostname',
    '-h', '--ipc', '--ip', '--ip6', '--isolation', '--label', '-l', '--label-file', '--link',
    '--log-driver', '--log-opt', '--mac-address', '--memory', '-m', '--memory-reservation',
    '--memory-swap', '--mount', '--name', '--network', '--network-alias', '--pid', '--platform',
    '--pull', '--restart', '--runtime', '--security-opt', '--shm-size', '--stop-signal',
    '--stop-timeout', '--storage-opt', '--sysctl', '--tmpfs', '--ulimit', '--user', '-u',
    '--userns', '--uts', '--volume', '-v', '--volume-driver', '--volumes-from', '--workdir', '-w',
    '--publish', '-p',
  ]);
  let entrypoint = '';
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === '--') {
      index += 1;
      break;
    }
    if (noValue.has(token) || /^-[dit]+$/.test(token)) {
      index += 1;
      continue;
    }
    if (withValue.has(token)) {
      if (token === '--entrypoint') entrypoint = tokens[index + 1] ?? '';
      index += 2;
      continue;
    }
    if (/^--[a-z][a-z0-9-]*=\S+$/i.test(token)) {
      if (token.startsWith('--entrypoint=')) entrypoint = token.slice('--entrypoint='.length);
      index += 1;
      continue;
    }
    if (/^(?:-[euvwp])\S+$/.test(token)) {
      index += 1;
      continue;
    }
    break;
  }
  if (index >= tokens.length) return value;
  const commandIndex = index + 1;
  const command = commandIndex < tokens.length ? joinShellWords(tokens.slice(commandIndex)) : '';
  if (entrypoint) return [entrypoint, command].filter(Boolean).join(' ');
  return command || value;
}

function unwrapFlockCommand(value = '') {
  const tokens = shellWords(value);
  if (tokens[0] !== 'flock') return value;
  const withValue = new Set(['-E', '--conflict-exit-code', '-w', '--timeout']);
  const noValue = new Set(['-s', '--shared', '-x', '--exclusive', '-u', '--unlock', '-n', '--nonblock', '-o', '--close', '-F', '--no-fork', '--verbose']);
  let index = 1;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === '--') {
      index += 1;
      break;
    }
    if (withValue.has(token)) index += 2;
    else if (noValue.has(token) || /^--[a-z][a-z0-9-]*=\S+$/i.test(token)) index += 1;
    else break;
  }
  if (index >= tokens.length) return value;
  index += 1;
  return index < tokens.length ? joinShellWords(tokens.slice(index)) : value;
}

function unwrapParallelCommand(value = '') {
  const tokens = shellWords(value);
  if (tokens[0] !== 'parallel') return value;
  const withValue = new Set([
    '-j', '--jobs', '-S', '--sshlogin', '--sshloginfile', '--joblog', '--results',
    '--timeout', '--delay', '--retries', '--workdir', '--env', '--header', '--colsep',
  ]);
  const noValue = new Set([
    '--will-cite', '--keep-order', '-k', '--line-buffer', '--tag', '--dry-run', '--verbose',
    '-0', '--null',
  ]);
  let index = 1;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === '--') {
      index += 1;
      break;
    }
    if (withValue.has(token)) index += 2;
    else if (noValue.has(token) || /^--[a-z][a-z0-9-]*=\S+$/i.test(token)) index += 1;
    else break;
  }
  const inputMarker = tokens.findIndex((token, tokenIndex) => tokenIndex >= index && /^:::{1,2}$/.test(token));
  const commandTokens = tokens.slice(index, inputMarker >= 0 ? inputMarker : tokens.length);
  return commandTokens.length ? joinShellWords(commandTokens) : value;
}

function unwrapFindExecCommand(value = '') {
  const tokens = shellWords(value);
  if (tokens[0] !== 'find') return value;
  const execIndex = tokens.findIndex((token) => ['-exec', '-execdir', '-ok', '-okdir'].includes(token));
  if (execIndex < 0 || execIndex + 1 >= tokens.length) return value;
  const endIndex = tokens.findIndex((token, tokenIndex) => tokenIndex > execIndex && [';', '+'].includes(token));
  const commandTokens = tokens.slice(execIndex + 1, endIndex >= 0 ? endIndex : tokens.length);
  return commandTokens.length ? joinShellWords(commandTokens) : value;
}

function unwrapKubectlCommand(value = '') {
  const tokens = shellWords(value);
  if (tokens[0] !== 'kubectl') return value;
  const globalWithValue = new Set(['--context', '--cluster', '--user', '--namespace', '-n', '--kubeconfig', '--server', '-s', '--token', '--as', '--as-group', '--request-timeout', '--cache-dir']);
  let index = 1;
  while (index < tokens.length) {
    const token = tokens[index];
    if (globalWithValue.has(token)) index += 2;
    else if (/^--[a-z][a-z0-9-]*=\S+$/i.test(token)) index += 1;
    else break;
  }
  const subcommand = tokens[index];
  if (!['exec', 'run'].includes(subcommand)) return value;
  index += 1;
  const withValue = subcommand === 'exec'
    ? new Set(['-c', '--container', '-f', '--filename', '--pod-running-timeout'])
    : new Set(['--image', '--image-pull-policy', '--restart', '--command', '--env', '--port', '--labels', '-l', '--overrides', '--serviceaccount', '--field-manager']);
  const noValue = new Set(['-i', '--stdin', '-t', '--tty', '--quiet', '-q', '--attach', '--leave-stdin-open', '--rm', '--expose', '--privileged']);
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === '--') {
      index += 1;
      return index < tokens.length ? joinShellWords(tokens.slice(index)) : value;
    }
    if (withValue.has(token)) index += 2;
    else if (noValue.has(token) || /^--[a-z][a-z0-9-]*=\S+$/i.test(token)) index += 1;
    else break;
  }
  if (index >= tokens.length) return value;
  index += 1;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === '--') {
      index += 1;
      break;
    }
    if (withValue.has(token)) index += 2;
    else if (noValue.has(token) || /^--[a-z][a-z0-9-]*=\S+$/i.test(token)) index += 1;
    else break;
  }
  return index < tokens.length ? joinShellWords(tokens.slice(index)) : value;
}

function stripPackageManagerGlobalOptions(value = '') {
  const tokens = shellWords(value);
  const manager = tokens[0] ?? '';
  if (!/^(?:npm|pnpm|yarn|bun)$/.test(manager)) return value;
  const noValue = new Set([
    '--silent', '-s', '--no-color', '--workspace-root',
    '--workspaces', '--include-workspace-root', '--if-present',
    '--recursive', '-r',
  ]);
  const withValue = new Set(['--prefix', '--workspace', '-w', '--dir', '-C', '--cwd', '--filter', '--color']);
  const skipOptions = (values, start = 0) => {
    let optionIndex = start;
    while (optionIndex < values.length) {
      const token = values[optionIndex];
      if (noValue.has(token)
        || /^--(?:workspaces|include-workspace-root|if-present|recursive)=(?:true|false)$/.test(token)) {
        optionIndex += 1;
        continue;
      }
      if (withValue.has(token)) {
        if (!values[optionIndex + 1]) return start;
        optionIndex += 2;
        continue;
      }
      if (/^--(?:prefix|workspace|dir|cwd|filter|color)=\S+$/.test(token)) {
        optionIndex += 1;
        continue;
      }
      break;
    }
    return optionIndex;
  };
  let index = 1;
  while (index < tokens.length) {
    const token = tokens[index];
    if (noValue.has(token)) {
      index += 1;
      continue;
    }
    if (/^--(?:workspaces|include-workspace-root|if-present|recursive)=(?:true|false)$/.test(token)) {
      index += 1;
      continue;
    }
    if (withValue.has(token)) {
      if (!tokens[index + 1]) return value;
      index += 2;
      continue;
    }
    if (/^--(?:prefix|workspace|dir|cwd|filter|color)=\S+$/.test(token)) {
      index += 1;
      continue;
    }
    break;
  }
  let rest = tokens.slice(index);
  if (manager === 'yarn' && rest[0] === 'workspaces' && ['run', 'foreach'].includes(rest[1])) {
    const mode = rest[1];
    rest = rest.slice(2);
    if (mode === 'foreach') {
      const optionWithValue = new Set(['--from', '--include', '--exclude', '--jobs', '-j']);
      let optionIndex = 0;
      while (optionIndex < rest.length && rest[optionIndex].startsWith('-')) {
        optionIndex += optionWithValue.has(rest[optionIndex]) ? 2 : 1;
      }
      rest = rest.slice(optionIndex);
      if (rest[0] === 'run') rest = rest.slice(1);
    }
    return [manager, 'run', ...rest].join(' ');
  }
  if (rest[0] === 'run') {
    const scriptTokens = rest.slice(1);
    rest = ['run', ...scriptTokens.slice(skipOptions(scriptTokens))];
  }
  return [manager, ...rest].join(' ');
}

function stripShellControlPrefix(value = '') {
  let segment = String(value).trim();
  if (/^case\b/.test(segment)) {
    const branch = segment.lastIndexOf(')');
    return branch >= 0 ? segment.slice(branch + 1).trim() : segment;
  }
  segment = segment.replace(/^(?:then|do|else|elif)\s+/, '');
  segment = segment.replace(/^(?:if|while|until)\s+/, '');
  segment = segment.replace(/^!\s+/, '');
  segment = segment.replace(/^\{\s*/, '');
  segment = segment.replace(/^(?:function\s+)?[a-z_][a-z0-9_]*\s*\(\s*\)\s*\{?\s*/i, '');
  return segment.trim();
}

function xargsNestedCommand(value = '') {
  const tokens = shellWords(value);
  if (tokens[0] !== 'xargs') return '';
  const optionsWithValue = new Set([
    '-a', '--arg-file', '-E', '--eof', '-I', '--replace', '-L', '--max-lines',
    '-n', '--max-args', '-P', '--max-procs', '-s', '--max-chars', '--process-slot-var',
  ]);
  let index = 1;
  while (index < tokens.length && tokens[index].startsWith('-')) {
    if (tokens[index] === '--') {
      index += 1;
      break;
    }
    index += optionsWithValue.has(tokens[index]) ? 2 : 1;
  }
  return joinShellWords(tokens.slice(index));
}

function normalizeExecutablePath(value) {
  return String(value).replace(/^(?:['"])?(?:\/[A-Za-z0-9_.+-]+)+\/([A-Za-z0-9_.+-]+)(?:['"])?(?=\s|$)/, '$1');
}

function stripOuterQuote(value) {
  const text = String(value).trim();
  if (text.length >= 2 && ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"')))) {
    return text.slice(1, -1);
  }
  return text;
}

function hasCurlMutation(text = '') {
  return commandSegments(String(text)).some((segment) => /^curl\b/i.test(segment)
    && (/(?:\s-X\s*(?:POST|PUT|PATCH|DELETE)|\s-d|\s-F|\s-T)/.test(segment)
      || /\s--(?:request(?:\s+|=)(?:post|put|patch|delete)|data(?:-raw|-binary)?\b|form\b|upload-file\b|json\b)/i.test(segment)));
}

function isAwsS3ExternalWrite(segment = '') {
  const text = String(segment).trim();
  if (/^aws\s+s3\s+rm\b[^\n]*\bs3:\/\//.test(text)) return true;
  if (!/^aws\s+s3\s+(?:cp|mv|sync)\b/.test(text)) return false;
  const locations = text.match(/(?:s3:\/\/\S+|(?<!\S)(?!-\S)\S+)/g) ?? [];
  const remoteLocations = locations.filter((value) => value.startsWith('s3://'));
  if (!remoteLocations.length) return false;
  return /^aws\s+s3\s+mv\b/.test(text)
    || /^aws\s+s3\s+(?:cp|sync)\b[^\n]*?(?<!s3:\/\/)\b\S+\s+s3:\/\/\S+/.test(text);
}

function shellSegments(text) {
  const segments = [];
  const operators = [];
  let current = '';
  let quote = '';
  let escaped = false;
  let untrusted = false;
  let redirection = false;
  const source = String(text).trim();

  const flush = () => {
    const normalized = normalizeSegment(current);
    if (normalized) segments.push(normalized);
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
    if (char === '\\') {
      current += char;
      escaped = true;
      continue;
    }
    if (quote) {
      current += char;
      if (char === quote) quote = '';
      else if (quote === '"' && (char === '`' || char === '$' && next === '(')) untrusted = true;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === '`' || char === '$' && next === '(' || (char === '<' || char === '>') && next === '(') untrusted = true;
    if (char === '>' && next !== '&' || char === '<' && next === '<') redirection = true;
    if (char === '\n' || char === ';' || char === '|' || char === '&') {
      flush();
      if ((char === '|' || char === '&') && next === char) {
        operators.push(`${char}${char}`);
        index += 1;
      } else {
        operators.push(char === '\n' ? 'newline' : char);
      }
      continue;
    }
    current += char;
  }
  flush();
  if (quote) untrusted = true;
  return { segments, operators, untrusted, redirection };
}

function normalizeSegment(value) {
  return stripLeadingEnvironmentAssignments(String(value).trim()).trim();
}
