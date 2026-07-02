import type { ChangedTarget, GateResult } from '../types.js'

export const TESTING_STATE_ENTRY = 'omp-testing-enhancer.state'

export interface TestingEnhancerState {
  pendingGate: boolean
  lastAnalyzeRunId?: string
  lastTargets: ChangedTarget[]
  lastGateResults: GateResult[]
  lastReportMarkdown?: string
}

export function createInitialTestingState(): TestingEnhancerState {
  return {
    pendingGate: false,
    lastTargets: [],
    lastGateResults: []
  }
}

export function restoreTestingStateFromEntries(entries: Array<{ type: string; customType?: string; data?: unknown }>): TestingEnhancerState {
  let restored = createInitialTestingState()

  for (const entry of entries) {
    if (entry.type !== 'custom') continue
    if (entry.customType !== TESTING_STATE_ENTRY) continue

    const state = readTestingState(entry.data)
    if (state) restored = state
  }

  return restored
}

export function markGatePending(state: TestingEnhancerState, targets: ChangedTarget[]): TestingEnhancerState {
  return {
    ...state,
    pendingGate: true,
    lastTargets: targets,
    lastGateResults: []
  }
}

export function markGateFinished(state: TestingEnhancerState, gateResults: GateResult[]): TestingEnhancerState {
  return {
    ...state,
    pendingGate: false,
    lastGateResults: gateResults
  }
}

export function markReportGenerated(state: TestingEnhancerState, markdown: string): TestingEnhancerState {
  return {
    ...state,
    lastReportMarkdown: markdown
  }
}

function readTestingState(value: unknown): TestingEnhancerState | undefined {
  if (!isRecord(value)) return undefined
  if (typeof value.pendingGate !== 'boolean') return undefined
  if (!Array.isArray(value.lastTargets)) return undefined
  if (!Array.isArray(value.lastGateResults)) return undefined

  const state: TestingEnhancerState = {
    pendingGate: value.pendingGate,
    lastTargets: value.lastTargets.flatMap(readChangedTarget),
    lastGateResults: value.lastGateResults.flatMap(readGateResult)
  }

  if (typeof value.lastAnalyzeRunId === 'string') state.lastAnalyzeRunId = value.lastAnalyzeRunId
  if (typeof value.lastReportMarkdown === 'string') state.lastReportMarkdown = value.lastReportMarkdown

  if (state.lastTargets.length !== value.lastTargets.length) return undefined
  if (state.lastGateResults.length !== value.lastGateResults.length) return undefined

  return state
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
