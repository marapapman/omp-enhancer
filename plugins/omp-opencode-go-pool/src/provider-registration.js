import { BALANCED_API, DEFAULT_OPENAI_COMPAT_API, OPENCODE_GO_PROVIDER } from './config.js';

const upstreamApiByModelId = new Map();

export function registerOpenCodeGoPoolProvider(pi, deps = {}) {
  if (typeof pi?.registerProvider !== 'function') {
    throw new Error('OMP runtime does not expose pi.registerProvider');
  }

  const config = {
    api: BALANCED_API,
    baseUrl: OPENAI_GO_URL,
    oauth: {
      name: 'OpenCode Go',
      async login() {
        throw new Error('Use OMP built-in OpenCode Go authentication, then rerun the OpenCode Go key pool plugin.');
      },
    },
    streamSimple: deps.streamSimple,
  };
  pi.registerProvider(OPENCODE_GO_PROVIDER, config);
  return {
    provider: OPENCODE_GO_PROVIDER,
    api: BALANCED_API,
    modelStrategy: 'runtime-overlay',
  };
}

export function buildBalancedModelOverlay(model) {
  const upstreamApi = model.upstreamApi ?? model.api ?? DEFAULT_OPENAI_COMPAT_API;
  upstreamApiByModelId.set(model.id, upstreamApi);
  return {
    ...model,
    provider: OPENCODE_GO_PROVIDER,
    api: BALANCED_API,
  };
}

export function getOpenCodeGoUpstreamApi(model) {
  return upstreamApiByModelId.get(model?.id) ?? model?.upstreamApi ?? DEFAULT_OPENAI_COMPAT_API;
}

const OPENAI_GO_URL = 'https://opencode.ai/zen/go/v1';
