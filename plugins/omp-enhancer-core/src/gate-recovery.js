export function createGateRecoveryState() {
  return { attempts: [] };
}

export function serializeGateRecoveryState(state = createGateRecoveryState()) {
  return {
    attempts: Array.isArray(state.attempts)
      ? state.attempts.map(readAttempt).filter(Boolean)
      : [],
  };
}

export function readGateRecoveryState(value) {
  if (!value || typeof value !== 'object') return createGateRecoveryState();
  return {
    attempts: Array.isArray(value.attempts) ? value.attempts.map(readAttempt).filter(Boolean) : [],
  };
}

export function recordGateRecovery(state = createGateRecoveryState(), { gateKey = '', reasonCode = '', doNext = '', doNot = '', after = '' } = {}) {
  const key = recoveryKey(gateKey, reasonCode);
  const existing = state.attempts.find((item) => item.key === key);
  const count = (existing?.count ?? 0) + 1;
  const attempt = {
    key,
    gateKey: String(gateKey || 'unknown'),
    reasonCode: String(reasonCode || 'unknown'),
    count,
    updatedAt: Date.now(),
  };
  if (existing) Object.assign(existing, attempt);
  else state.attempts.push(attempt);
  state.attempts = state.attempts.slice(-32);

  const level = count >= 3 ? 'loop-breaker' : count === 2 ? 'recover' : 'coach';
  return {
    ...attempt,
    level,
    context: buildRecoveryContext({
      level,
      reasonCode: attempt.reasonCode,
      doNext,
      doNot,
      after,
    }),
  };
}

export function buildRecoveryContext({ level = 'coach', reasonCode = '', doNext = '', doNot = '', after = '' } = {}) {
  if (level === 'loop-breaker') {
    return [
      'LOOP_BREAKER',
      `Reason: ${reasonCode || 'repeated_gate_reason'}`,
      `Stop: ${doNot || 'do not repeat the blocked action'}`,
      `Do next: ${doNext || 'summarize current state and choose a different next action'}`,
      'Limit: 5 lines',
    ].join('\n');
  }

  return [
    'RECOVERY',
    `Reason: ${reasonCode || 'missing_required_evidence'}`,
    `Do next: ${doNext || 'take the smallest action that supplies the missing evidence'}`,
    `Do not: ${doNot || 'repeat the blocked tool call'}`,
    `After: ${after || 'continue the original task'}`,
  ].join('\n');
}

function recoveryKey(gateKey, reasonCode) {
  return `${String(gateKey || 'unknown')}\u0000${String(reasonCode || 'unknown')}`;
}

function readAttempt(value) {
  if (!value || typeof value !== 'object') return null;
  if (typeof value.key !== 'string') return null;
  return {
    key: value.key,
    gateKey: typeof value.gateKey === 'string' ? value.gateKey : 'unknown',
    reasonCode: typeof value.reasonCode === 'string' ? value.reasonCode : 'unknown',
    count: Number.isInteger(value.count) ? value.count : 0,
    updatedAt: Number.isFinite(value.updatedAt) ? value.updatedAt : 0,
  };
}
