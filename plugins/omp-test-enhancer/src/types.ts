export type TargetKind =
  | 'pure-function'
  | 'validator'
  | 'parser'
  | 'formatter'
  | 'api-client'
  | 'api-provider'
  | 'service'
  | 'repository'
  | 'react-component'
  | 'cli'
  | 'unknown'

export type RiskLevel = 'low' | 'medium' | 'high'

export interface ChangedTarget {
  id: string
  sourceFile: string
  symbolName: string
  kind: TargetKind
  risk: RiskLevel
  relatedTests?: string[]
  publicEntryHints?: string[]
}

export interface CandidateFileChange {
  path: string
  action: 'create' | 'modify'
  content: string
}

export interface CandidateTest {
  id: string
  targetId: string
  files: CandidateFileChange[]
}

export type BrowserGateName = 'browser-interaction' | 'browser-visual'

export type GateName = 'indirect-test' | 'test-file-scope' | 'test-command' | BrowserGateName

export interface GateResult {
  gate: GateName
  passed: boolean
  severity: 'blocker' | 'warning'
  summary: string
  evidence: unknown
  repairHint?: string
}

export type BrowserLocatorKind = 'role' | 'text' | 'label' | 'placeholder' | 'altText' | 'title' | 'testId' | 'css'

export interface BrowserLocatorSpec {
  kind: BrowserLocatorKind
  value?: string
  role?: string
  name?: string
  exact?: boolean
}

export type BrowserActionKind = 'goto' | 'click' | 'fill' | 'press' | 'hover' | 'check' | 'select' | 'assertVisible' | 'screenshot'

export interface BrowserPlanStep {
  action: BrowserActionKind
  locator?: BrowserLocatorSpec
  url?: string
  value?: string
  description: string
}

export interface BrowserVisualCheck {
  kind: 'page' | 'locator'
  name: string
  locator?: BrowserLocatorSpec
  expectedPath?: string
  maxDiffPixels?: number
  maxDiffPixelRatio?: number
  threshold?: number
}

export interface BrowserPlan {
  framework: 'playwright'
  setup: {
    viewport: { width: number; height: number }
    trace: 'off' | 'retain-on-failure'
    screenshot: 'off' | 'only-on-failure'
    serviceWorkers: 'allow' | 'block'
  }
  locatorPriority: BrowserLocatorKind[]
  scenarios: Array<{
    name: string
    goal: string
    steps: BrowserPlanStep[]
    visualChecks: BrowserVisualCheck[]
  }>
  evidenceToCollect: Array<'actionability' | 'console-error' | 'page-error' | 'network-failure' | 'accessibility' | 'visual-diff'>
}

export interface BrowserArtifactRefs {
  actualImagePath?: string
  expectedImagePath?: string
  diffImagePath?: string
  tracePath?: string
  videoPath?: string
  harPath?: string
}

export interface BrowserFinding {
  gate: BrowserGateName
  passed: boolean
  severity: 'blocker' | 'warning'
  category: 'actionability' | 'console-error' | 'page-error' | 'network-failure' | 'accessibility' | 'visual-diff' | 'timeout' | 'setup'
  summary: string
  evidence: unknown
  repairHint?: string
  artifacts?: BrowserArtifactRefs
}

export interface BrowserEvidence {
  framework: 'playwright'
  status: 'passed' | 'failed' | 'skipped'
  runId?: string
  baseUrl?: string
  browser?: 'chromium'
  headless?: boolean
  viewport?: { width: number; height: number }
  findings: BrowserFinding[]
  artifacts?: BrowserArtifactRefs
}

export interface PropertyPlan {
  frameworkSuggestion: 'fast-check'
  properties: Array<{
    name: string
    assertion: string
    repairHint: string
  }>
}

export interface ApiPlan {
  contractSources: string[]
  cases: Array<{
    status: string
    assertion: string
    repairHint: string
  }>
}

export interface CoverageGap {
  file: string
  line: number
  kind: 'statement' | 'branch' | 'function'
  symbolName?: string
  summary: string
  repairHint: string
}

export interface CoverageAnalysis {
  status: 'available' | 'missing-report'
  gaps: CoverageGap[]
  reportPath?: string
}

export interface MutationSurvivor {
  file: string
  line: number
  mutatorName?: string
  replacement?: string
  summary: string
  repairHint: string
}

export interface MutationAnalysis {
  status: 'available' | 'missing-report'
  survivedMutants: MutationSurvivor[]
  reportPath?: string
}
