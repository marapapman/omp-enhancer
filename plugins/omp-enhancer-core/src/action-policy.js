const SHELL_TOOL = /^(?:bash|shell|terminal|exec|exec_command|run|run_command|command|python|node|functions_(?:bash|shell|terminal|exec|exec_command|run|run_command|command|python|node))$/i;
const DIRECT_WRITE_TOOL = /^(?:edit|write|patch|apply_patch|edit_file|write_file|patch_file|create_file|functions_(?:edit|write|patch|apply_patch|edit_file|write_file|patch_file|create_file))$/i;
const SUBAGENT_TOOL = /^(?:task|spawn_agent|delegate|collaboration_(?:spawn_agent|delegate|followup_task|send_message|wait_agent|interrupt_agent|list_agents))$/i;
const NETWORK_TOOL = /(?:^|[_-])(?:web|web_search|fetch|http|browser)(?:$|[_-])/i;
const MUTATION_TOOL_TOKEN = /(?:^|[_-])(?:write|edit|patch|apply|create|update|delete|remove|rename|move|copy|upload|publish|deploy|push|merge|close|reopen|destroy|purge|submit|send|post|install|upgrade)(?:$|[_-])/i;
const DESTRUCTIVE_TOOL_TOKEN = /(?:^|[_-])(?:delete|remove|destroy|purge|wipe|clear)(?:$|[_-])/i;
const REMOTE_TOOL_NAMESPACE = /(?:^|[_-])(?:github|gitlab|bitbucket|linear|jira|slack|email|notion|database|aws|gcloud|azure|docker|kubernetes|kubectl|helm|terraform|browser|web)(?:$|[_-])/i;
const LOCAL_FILESYSTEM_NAMESPACE = /(?:^|[_-])(?:filesystem|file_system|local_file)(?:$|[_-])/i;
const LOCAL_PLATFORM_TOOL = /^(?:read|grep|glob|view_image|write_stdin|update_plan|request_user_input|get_goal|create_goal|update_goal|request_plugin_install|functions_(?:read|grep|glob|view_image|write_stdin|update_plan|request_user_input|get_goal|create_goal|update_goal|request_plugin_install)|collaboration_(?:spawn_agent|delegate|send_message|followup_task|interrupt_agent|list_agents|wait_agent)|omp_core_[a-z0-9_]+|omp_test_[a-z0-9_]+|omp_config_[a-z0-9_]+|writing_(?:quality|logic)_check|fact_check_(?:gate|evidence|analyze|report))$/i;

export function classifyToolAction({ toolName = '', text = '' } = {}) {
  const name = canonicalToolName(toolName);
  const rawSource = String(text);
  const source = rawSource.toLowerCase();
  const shell = SHELL_TOOL.test(name);
  const namedMutation = MUTATION_TOOL_TOKEN.test(name);
  const remoteTool = REMOTE_TOOL_NAMESPACE.test(name);
  const mcpTool = /(?:^|_)mcp(?:_|$)/i.test(name);
  const remoteProvider = (remoteTool || mcpTool) && !LOCAL_FILESYSTEM_NAMESPACE.test(name);
  const knownLocalTool = shell
    || DIRECT_WRITE_TOOL.test(name)
    || LOCAL_FILESYSTEM_NAMESPACE.test(name)
    || SUBAGENT_TOOL.test(name)
    || LOCAL_PLATFORM_TOOL.test(name);
  const knownNetworkTool = NETWORK_TOOL.test(name) || /^(?:curl|wget)$/i.test(name);
  const unknownTool = Boolean(name) && !knownLocalTool && !remoteProvider && !knownNetworkTool;
  const unknownNamedMutation = unknownTool && namedMutation;
  const remoteOperation = remoteProvider ? classifyGenericRemoteOperation(name, rawSource) : 'not-generic';
  const embeddedActions = embeddedShellActions(name, rawSource);
  const browserCheck = name === 'omp_test_browser_check';
  const remoteBrowserTarget = browserCheck && hasNonLoopbackBrowserTarget(rawSource);
  const testExecution = isTestExecution(name, source);
  const migrationExecution = shell && isMigrationAutomationInvocation(source);
  const devServerExecution = shell && isDevServerAutomationInvocation(source);
  const agentCliExecution = shell && isAgentCliExecution(source);
  const externalWrite = (remoteTool || mcpTool && !LOCAL_FILESYSTEM_NAMESPACE.test(name)) && namedMutation
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
    || namedMutation && LOCAL_FILESYSTEM_NAMESPACE.test(name)
    || embeddedActions.some((action) => action.definiteWorkspaceMutation)
    || shell && isKnownWorkspaceWrite(source);
  const testSnapshotWrite = shell && testExecution
    && /(?:--updateSnapshot\b|--update-snapshots?\b|(?:^|\s)-u(?:\s|$))/i.test(rawSource);
  const definiteWorkspaceMutation = knownWorkspaceWrite || testSnapshotWrite;
  const repositoryAutomation = shell && isRepositoryControlledAutomation(source);
  const opaqueEffects = agentCliExecution
    || remoteOperation === 'unknown' && !namedMutation
    || embeddedActions.some((action) => action.opaqueEffects)
    || shell && !knownWorkspaceWrite && !testExecution && hasOpaqueShellEffects(source);
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
    unverifiableNetworkEffects,
    unverifiableWorkspaceEffects,
    irreversible,
    subagent: agentCliExecution
      || embeddedActions.some((action) => action.subagent)
      || SUBAGENT_TOOL.test(name)
      || /(?:^|[_-])(?:spawn(?:_agent)?|delegate|subagent)(?:$|[_-])/i.test(name),
  };
}

function canonicalToolName(value = '') {
  return String(value)
    .trim()
    .replace(/[./:\\]+/g, '_')
    .replace(/_+/g, '_');
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
  const parsed = shellSegments(text);
  if (parsed.untrusted) return true;
  return commandSegments(text).some((segment) => {
    const value = String(segment).trim();
    if (isExactReleaseVerifier(value)) return false;
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
  if (!/(?:^|[_-])(?:api|api_call|graphql|request|query|execute|call)(?:$|[_-])/i.test(String(name))) {
    return 'not-generic';
  }
  const source = String(text).toLowerCase();
  const toolName = String(name).toLowerCase();
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
  const sqlRead = /["'](?:query|sql)["']\s*:\s*["']\s*(?:select|show|describe|desc|explain|values|with\b[^"']*\bselect)\b/.test(source);
  const namedRead = /(?:^|[_-])(?:get|list|search|read|view|describe|fetch|lookup|status|history|inspect)(?:$|[_-])/.test(toolName);
  if (httpRead || graphQlRead || providerRead || sqlRead || namedRead) return 'read';
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
  return /(?:^|\s)(?:--dry-run|--dryrun)(?:\s|$)/i.test(String(text))
    || /^git\s+push\b[^\n]*(?:^|\s)-n(?:\s|$)/i.test(String(text).trim());
}

function isTestExecution(name, text) {
  if (name === 'omp_test_browser_check') return true;
  return commandSegments(text).some((segment) => (
    /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test(?::[\w.-]+)?|unit|integration|e2e|check:test)\b/.test(segment)
    || /^node\s+--test\b/.test(segment)
    || /^(?:pytest|vitest|jest|ctest|cargo\s+(?:test|nextest)|go\s+test|make\s+test|(?:\.\/)?mvn(?:w)?\b[^\n]*\btest\b|(?:\.\/)?gradle(?:w)?\b[^\n]*\btest\b|dotnet\s+test|deno\s+test)\b/.test(segment)
    || /^(?:\.\/)?(?:test|tests|run-tests?)\.sh\b/.test(segment)
    || /^(?:\.\.?\/)?(?:\S+\/)*(?:tox|nox)(?:\s|$)/.test(segment)
    || /^(?:bundle\s+exec\s+)?(?:\.\.?\/)?(?:\S+\/)*rspec(?:\s|$)/.test(segment)
    || /^(?:\.\/)?(?:\S+\/)*phpunit(?:\s|$)/.test(segment)
    || /^mix\s+test\b/.test(segment)
    || /^swift\s+test\b/.test(segment)
    || /^(?:bazel|bazelisk)\s+test\b/.test(segment)
    || /^(?:\.\.?\/)?(?:\S+\/)*playwright\s+test\b/.test(segment)
    || /^(?:\.\.?\/)?(?:\S+\/)*cypress\s+run\b/.test(segment)
    || /^(?:\.\.?\/)?(?:\S+\/)*mocha(?:\s|$)/.test(segment)
    || /^flutter\s+test\b/.test(segment)
    || /^zig\s+build\s+test\b/.test(segment)
    || /^(?:unittest|nose2|behave|robot)(?:\s|$)/.test(segment)
    || /^dotnet\s+vstest\b/.test(segment)
    || /^xcodebuild\b[^\n]*(?:^|\s)test(?:\s|$)/.test(segment)
    || /^(?:sbt|lein)\s+test\b/.test(segment)
    || /^(?:\.\/)?mvn(?:w)?\b[^\n]*\bverify\b/.test(segment)
    || /^(?:\.\/)?gradle(?:w)?\b[^\n]*\bcheck\b/.test(segment)
    || /^make\s+check\b/.test(segment)
  ));
}

function isNetworkAccess(name, text) {
  if (NETWORK_TOOL.test(name) || /^(?:curl|wget)$/i.test(name)) return true;
  if (shellSegments(text).segments.some((segment) => /^(?:npx|npm\s+exec)\b/.test(normalizeExecutablePath(segment)))) return true;
  return commandSegments(text).some((segment) => (
    /^(?:curl|wget|http|httpie|ssh|scp|rsync|ftp|sftp|ping|nc|netcat|telnet|dig|nslookup|psql|mysql|redis-cli|mongosh)\b/.test(segment)
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
  return commandSegments(text).some((segment) => (
    /^git\s+push\b/.test(segment)
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
  return String(value).trim().match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)
    ?.map((token) => token.replace(/^(['"])(.*)\1$/, '$2')) ?? [];
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
    /^(?:rm|rmdir|unlink)\b/.test(segment)
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
    hasOutputFileMutation(segment)
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
  if (depth > 3) return [];
  return shellSegments(text).segments.flatMap((segment) => expandCommandSegment(segment, depth));
}

function expandCommandSegment(value, depth) {
  let segment = normalizeExecutablePath(String(value).trim());
  segment = segment.replace(/^env\s+(?:(?:-[^\s]+|[a-z_][a-z0-9_]*=[^\s]+)\s+)*/i, '');
  segment = segment.replace(/^(?:timeout\s+(?:-[^\s]+\s+)*\S+\s+|nice\s+(?:-n\s+\S+\s+)?)/, '');
  segment = segment.replace(/^busybox\s+/, '');
  segment = normalizeExecutablePath(segment);

  const shellCommand = segment.match(/^(?:bash|sh|zsh)\s+-[a-z]*c[a-z]*\s+([\s\S]+)$/);
  if (shellCommand) {
    const inner = stripOuterQuote(shellCommand[1].trim());
    return commandSegments(inner, depth + 1);
  }

  segment = segment.replace(/^git\s+(?:(?:-c|--git-dir|--work-tree)\s+\S+\s+|(?:--git-dir|--work-tree)=\S+\s+)*/, 'git ');
  segment = segment.replace(/^npx\s+(?:(?:--yes|-y|--no-install)\s+)*/, '');
  segment = segment.replace(/^npm\s+exec\s+(?:--\s+)?/, '');
  segment = segment.replace(/^(?:pnpm|yarn|bun)\s+(?:exec|dlx|x)\s+/, '');
  segment = segment.replace(/^bunx\s+/, '');
  segment = segment.replace(/^python\d*(?:\.\d+)?\s+-m\s+/, '');
  return [normalizeExecutablePath(segment.trim())].filter(Boolean);
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
    if (char === '`' || char === '$' && next === '(') untrusted = true;
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
  let segment = String(value).trim();
  segment = segment.replace(/^(?:(?:[a-z_][a-z0-9_]*)=[^\s]+\s+)*/i, '');
  segment = segment.replace(/^(?:(?:sudo|command|env)\s+)+/, '');
  return segment.trim();
}
