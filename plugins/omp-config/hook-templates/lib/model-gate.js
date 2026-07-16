// Keep compatibility rewrites scoped to model contracts they were tested with.
const SUPPORTED_MODEL_IDS = new Set([
  'deepseek-v4-flash',
  'deepseek-v4-pro',
]);

export function isOpenCodeDeepSeekV4Model(model) {
  return model?.provider === 'opencode-go' && SUPPORTED_MODEL_IDS.has(model?.id);
}
