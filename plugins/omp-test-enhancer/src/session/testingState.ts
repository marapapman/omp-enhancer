import { createHash } from 'node:crypto'
import type { ChangedTarget, GateResult } from '../types.js'
import { isRecord } from '../utils.js'

export const TESTING_STATE_ENTRY = 'omp-testing-enhancer.state'
export const TESTING_EVIDENCE_ENTRY = 'omp-testing-enhancer.evidence'
export const TESTING_STATE_SCHEMA_VERSION = 2
export const TESTING_EVIDENCE_SCHEMA_VERSION = 1
const STANDALONE_REPAIR_MAX = 2
const STANDALONE_TERMINAL_MAX = 1

export interface StandaloneRecoveryState {
  repairUsed: number
  repairMax: number
  terminalUsed: number
  terminalMax: number
  lastRepairFingerprint: string | null
  terminalFingerprint: string | null
}

export interface TestingEnhancerState {
  schemaVersion: typeof TESTING_STATE_SCHEMA_VERSION
  pendingGate: boolean
  routeId?: string
  lastAnalyzeRunId?: string
  lastTargets: ChangedTarget[]
  lastGateResults: GateResult[]
  lastReportMarkdown?: string
  evidenceRevision: number
  lastObservedTestCommand?: ObservedTestCommandEvidence
  standaloneRecovery: StandaloneRecoveryState
}

export interface ObservedTestCommandEvidence {
  schemaVersion: 1
  routeId: string
  commandDigest: string
  exitCode: number
  observedAt: number
}

export interface TestingGateEvidence {
  schemaVersion: typeof TESTING_EVIDENCE_SCHEMA_VERSION
  routeId: string
  runId: string
  status: 'pending' | 'passed' | 'failed'
  pending: boolean
  passed: boolean
  failed: boolean
  blockers: GateResult['gate'][]
  evidenceDigest: string
  evidenceRevision: number
  updatedAt: number
}

export type StandaloneGateDecision =
  | { kind: 'release'; state: TestingEnhancerState; fingerprint: null }
  | { kind: 'repair'; state: TestingEnhancerState; fingerprint: string }
  | { kind: 'terminal'; state: TestingEnhancerState; fingerprint: string }
  | { kind: 'stop'; state: TestingEnhancerState; fingerprint: string }

export interface RestoreTestingStateOptions {
  routeId?: string
  requireCurrentRouteEvidence?: boolean
}

interface TestingScope {
  routeId?: string
  runId?: string
}

export function createInitialTestingState(): TestingEnhancerState {
  return {
    schemaVersion: TESTING_STATE_SCHEMA_VERSION,
    pendingGate: false,
    lastTargets: [],
    lastGateResults: [],
    evidenceRevision: 0,
    standaloneRecovery: createStandaloneRecoveryState()
  }
}

export function restoreTestingStateFromEntries(
  entries: Array<{ type: string; customType?: string; data?: unknown }>,
  options: RestoreTestingStateOptions = {}
): TestingEnhancerState {
  let restored = createInitialTestingState()

  for (const entry of entries) {
    if (entry.type !== 'custom') continue
    if (entry.customType !== TESTING_STATE_ENTRY) continue

    const state = readTestingState(entry.data)
    if (!state) continue
    if (options.requireCurrentRouteEvidence) {
      const hasObservedToolEvent = state.lastAnalyzeRunId !== undefined || state.lastGateResults.length > 0
      if (!options.routeId || state.routeId !== options.routeId || !hasObservedToolEvent) continue
    }
    restored = state
  }

  return restored
}

export function markGatePending(state: TestingEnhancerState, targets: ChangedTarget[], scope: TestingScope = {}): TestingEnhancerState {
  const routeChanged = scope.routeId !== undefined && scope.routeId !== state.routeId
  const standaloneRecovery = routeChanged
    ? createStandaloneRecoveryState()
    : state.standaloneRecovery

  return {
    ...state,
    pendingGate: true,
    lastTargets: targets,
    lastGateResults: [],
    evidenceRevision: state.evidenceRevision + 1,
    standaloneRecovery,
    ...(scope.routeId !== undefined ? { routeId: scope.routeId } : {}),
    ...(scope.runId !== undefined ? { lastAnalyzeRunId: scope.runId } : {})
  }
}

export function markGateFinished(state: TestingEnhancerState, gateResults: GateResult[]): TestingEnhancerState {
  const hasFailedBlocker = gateResults.some(result => !result.passed && result.severity === 'blocker')
  return {
    ...state,
    pendingGate: hasFailedBlocker,
    lastGateResults: gateResults,
    evidenceRevision: state.evidenceRevision + 1
  }
}

export function markReportGenerated(state: TestingEnhancerState, markdown: string): TestingEnhancerState {
  return {
    ...state,
    lastReportMarkdown: markdown
  }
}

export function markObservedTestCommand(state: TestingEnhancerState, evidence: ObservedTestCommandEvidence): TestingEnhancerState {
  if (state.routeId && evidence.routeId !== state.routeId) return state
  return {
    ...state,
    lastObservedTestCommand: evidence,
    evidenceRevision: state.evidenceRevision + 1,
    ...(state.routeId ? {} : { routeId: evidence.routeId })
  }
}

export function invalidateObservedTestCommand(state: TestingEnhancerState): TestingEnhancerState {
  if (!state.lastObservedTestCommand) return state
  const { lastObservedTestCommand: _discarded, ...rest } = state
  const hasActiveTestingRun = state.lastAnalyzeRunId !== undefined
    || state.lastTargets.length > 0
    || state.lastGateResults.length > 0
  return {
    ...rest,
    pendingGate: hasActiveTestingRun ? true : state.pendingGate,
    evidenceRevision: state.evidenceRevision + 1
  }
}

export function bindTestingStateToRoute(state: TestingEnhancerState, routeId: string): TestingEnhancerState {
  if (state.routeId === routeId) return state
  return { ...createInitialTestingState(), routeId }
}

export function hasTestingGateEvidence(state: TestingEnhancerState): boolean {
  return state.pendingGate || state.lastTargets.length > 0 || state.lastGateResults.length > 0 || state.lastAnalyzeRunId !== undefined
}

export function buildTestingGateEvidence(state: TestingEnhancerState, updatedAt = Date.now()): TestingGateEvidence {
  const runId = state.lastAnalyzeRunId ?? 'testing-unscoped'
  const routeId = state.routeId ?? `testing:${runId}`
  const blockers = [...new Set(state.lastGateResults
    .filter(result => !result.passed && result.severity === 'blocker')
    .map(result => result.gate))].sort()
  const status: TestingGateEvidence['status'] = state.pendingGate
    ? blockers.length > 0 ? 'failed' : 'pending'
    : state.lastGateResults.length > 0 ? 'passed' : 'pending'
  const normalizedResults = state.lastGateResults
    .map(result => ({ gate: result.gate, passed: result.passed, severity: result.severity }))
    .sort((left, right) => left.gate.localeCompare(right.gate))
  const evidenceDigest = digest({
    schemaVersion: TESTING_EVIDENCE_SCHEMA_VERSION,
    routeId,
    runId,
    status,
    blockers,
    normalizedResults
  })

  return {
    schemaVersion: TESTING_EVIDENCE_SCHEMA_VERSION,
    routeId,
    runId,
    status,
    pending: state.pendingGate,
    passed: status === 'passed',
    failed: status === 'failed',
    blockers,
    evidenceDigest,
    evidenceRevision: state.evidenceRevision,
    updatedAt
  }
}

export function evaluateStandaloneTestingGate(state: TestingEnhancerState): StandaloneGateDecision {
  if (!state.pendingGate) return { kind: 'release', state, fingerprint: null }

  const evidence = buildTestingGateEvidence(state, 0)
  const fingerprint = digest({
    routeId: evidence.routeId,
    runId: evidence.runId,
    status: evidence.status,
    blockers: evidence.blockers,
    evidenceDigest: evidence.evidenceDigest
  })
  const recovery = state.standaloneRecovery

  if (recovery.terminalFingerprint === fingerprint || recovery.terminalUsed >= recovery.terminalMax) {
    return { kind: 'stop', state, fingerprint }
  }

  if (recovery.lastRepairFingerprint !== fingerprint && recovery.repairUsed < recovery.repairMax) {
    return {
      kind: 'repair',
      fingerprint,
      state: {
        ...state,
        standaloneRecovery: {
          ...recovery,
          repairUsed: recovery.repairUsed + 1,
          lastRepairFingerprint: fingerprint
        }
      }
    }
  }

  return {
    kind: 'terminal',
    fingerprint,
    state: {
      ...state,
      standaloneRecovery: {
        ...recovery,
        terminalUsed: recovery.terminalUsed + 1,
        terminalFingerprint: fingerprint
      }
    }
  }
}

export function isStandaloneTerminalOnlyState(state: TestingEnhancerState): boolean {
  if (!state.pendingGate) return false
  const recovery = state.standaloneRecovery
  return recovery.terminalFingerprint !== null || recovery.terminalUsed >= recovery.terminalMax
}

function readTestingState(value: unknown): TestingEnhancerState | undefined {
  if (!isRecord(value)) return undefined
  if (value.schemaVersion !== undefined && value.schemaVersion !== TESTING_STATE_SCHEMA_VERSION) {
    if (isUnsupportedFutureSchema(value.schemaVersion) && hasPendingSignal(value)) {
      return readUnsupportedFuturePendingState(value)
    }
    return undefined
  }
  if (typeof value.pendingGate !== 'boolean') return undefined
  if (!Array.isArray(value.lastTargets)) return undefined
  if (!Array.isArray(value.lastGateResults)) return undefined

  const state: TestingEnhancerState = {
    schemaVersion: TESTING_STATE_SCHEMA_VERSION,
    pendingGate: value.pendingGate,
    lastTargets: value.lastTargets.flatMap(readChangedTarget),
    lastGateResults: value.lastGateResults.flatMap(readGateResult),
    evidenceRevision: Number.isInteger(value.evidenceRevision) && Number(value.evidenceRevision) >= 0
      ? Number(value.evidenceRevision)
      : 0,
    standaloneRecovery: readStandaloneRecoveryState(value.standaloneRecovery) ?? createStandaloneRecoveryState()
  }

  if (typeof value.routeId === 'string' && value.routeId.trim() !== '') state.routeId = value.routeId
  if (typeof value.lastAnalyzeRunId === 'string') state.lastAnalyzeRunId = value.lastAnalyzeRunId
  if (typeof value.lastReportMarkdown === 'string') state.lastReportMarkdown = value.lastReportMarkdown
  const observedTestCommand = readObservedTestCommandEvidence(value.lastObservedTestCommand)
  if (observedTestCommand && (!state.routeId || observedTestCommand.routeId === state.routeId)) {
    state.lastObservedTestCommand = observedTestCommand
  }

  if (state.lastTargets.length !== value.lastTargets.length) return undefined
  if (state.lastGateResults.length !== value.lastGateResults.length) return undefined

  return state
}

function readObservedTestCommandEvidence(value: unknown): ObservedTestCommandEvidence | undefined {
  if (!isRecord(value) || value.schemaVersion !== 1) return undefined
  if (typeof value.routeId !== 'string' || !value.routeId.trim()) return undefined
  if (typeof value.commandDigest !== 'string' || !/^[0-9a-f]{64}$/.test(value.commandDigest)) return undefined
  if (!Number.isInteger(value.exitCode)) return undefined
  if (!Number.isFinite(value.observedAt) || Number(value.observedAt) <= 0) return undefined
  return {
    schemaVersion: 1,
    routeId: value.routeId,
    commandDigest: value.commandDigest,
    exitCode: Number(value.exitCode),
    observedAt: Number(value.observedAt)
  }
}

function createStandaloneRecoveryState(): StandaloneRecoveryState {
  return {
    repairUsed: 0,
    repairMax: STANDALONE_REPAIR_MAX,
    terminalUsed: 0,
    terminalMax: STANDALONE_TERMINAL_MAX,
    lastRepairFingerprint: null,
    terminalFingerprint: null
  }
}

function readStandaloneRecoveryState(value: unknown): StandaloneRecoveryState | undefined {
  if (!isRecord(value)) return undefined

  return {
    repairUsed: clampRecoveryCount(value.repairUsed, STANDALONE_REPAIR_MAX),
    repairMax: STANDALONE_REPAIR_MAX,
    terminalUsed: clampRecoveryCount(value.terminalUsed, STANDALONE_TERMINAL_MAX),
    terminalMax: STANDALONE_TERMINAL_MAX,
    lastRepairFingerprint: typeof value.lastRepairFingerprint === 'string' ? value.lastRepairFingerprint : null,
    terminalFingerprint: typeof value.terminalFingerprint === 'string' ? value.terminalFingerprint : null
  }
}

function readUnsupportedFuturePendingState(value: Record<string, unknown>): TestingEnhancerState {
  const state: TestingEnhancerState = {
    ...createInitialTestingState(),
    pendingGate: true,
    lastTargets: Array.isArray(value.lastTargets) ? value.lastTargets.flatMap(readChangedTarget) : [],
    lastGateResults: Array.isArray(value.lastGateResults) ? value.lastGateResults.flatMap(readGateResult) : [],
    evidenceRevision: isNonNegativeInteger(value.evidenceRevision) ? Number(value.evidenceRevision) : 0,
    standaloneRecovery: {
      ...createStandaloneRecoveryState(),
      repairUsed: STANDALONE_REPAIR_MAX
    }
  }

  if (typeof value.routeId === 'string' && value.routeId.trim() !== '') state.routeId = value.routeId
  state.lastAnalyzeRunId = typeof value.lastAnalyzeRunId === 'string' && value.lastAnalyzeRunId.trim() !== ''
    ? value.lastAnalyzeRunId
    : `unsupported-schema-${String(value.schemaVersion)}`

  return state
}

function isUnsupportedFutureSchema(value: unknown): boolean {
  return Number.isInteger(value) && Number(value) > TESTING_STATE_SCHEMA_VERSION
}

function hasPendingSignal(value: Record<string, unknown>): boolean {
  if (value.pendingGate === true || value.pending === true) return true
  if (value.status === 'pending' || value.status === 'failed') return true
  if (!Array.isArray(value.lastGateResults)) return false
  return value.lastGateResults.some(result => (
    isRecord(result) && result.passed === false && result.severity === 'blocker'
  ))
}

function clampRecoveryCount(value: unknown, max: number): number {
  if (!isNonNegativeInteger(value)) return 0
  return Math.min(Number(value), max)
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function isNonNegativeInteger(value: unknown): boolean {
  return Number.isInteger(value) && Number(value) >= 0
}

function readChangedTarget(value: unknown): ChangedTarget[] {
  if (!isRecord(value)) return []
  if (typeof value.id !== 'string') return []
  if (typeof value.sourceFile !== 'string') return []
  if (typeof value.symbolName !== 'string') return []
  if (!isTargetKind(value.kind)) return []
  if (!isRiskLevel(value.risk)) return []

  const target: ChangedTarget = {
    id: value.id,
    sourceFile: value.sourceFile,
    symbolName: value.symbolName,
    kind: value.kind,
    risk: value.risk
  }

  if (Array.isArray(value.relatedTests)) target.relatedTests = value.relatedTests.filter((item): item is string => typeof item === 'string')
  if (Array.isArray(value.publicEntryHints)) target.publicEntryHints = value.publicEntryHints.filter((item): item is string => typeof item === 'string')

  return [target]
}

function readGateResult(value: unknown): GateResult[] {
  if (!isRecord(value)) return []
  if (!isGateName(value.gate)) return []
  if (typeof value.passed !== 'boolean') return []
  if (value.severity !== 'blocker' && value.severity !== 'warning') return []
  if (typeof value.summary !== 'string') return []

  const result: GateResult = {
    gate: value.gate,
    passed: value.passed,
    severity: value.severity,
    summary: value.summary,
    evidence: value.evidence
  }

  if (typeof value.repairHint === 'string') result.repairHint = value.repairHint

  return [result]
}

function isTargetKind(value: unknown): value is ChangedTarget['kind'] {
  return value === 'pure-function' ||
    value === 'validator' ||
    value === 'parser' ||
    value === 'formatter' ||
    value === 'api-client' ||
    value === 'api-provider' ||
    value === 'service' ||
    value === 'repository' ||
    value === 'react-component' ||
    value === 'cli' ||
    value === 'unknown'
}

function isRiskLevel(value: unknown): value is ChangedTarget['risk'] {
  return value === 'low' || value === 'medium' || value === 'high'
}

function isGateName(value: unknown): value is GateResult['gate'] {
  return value === 'indirect-test' ||
    value === 'test-file-scope' ||
    value === 'test-command' ||
    value === 'browser-interaction' ||
    value === 'browser-visual'
}
