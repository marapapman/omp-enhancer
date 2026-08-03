// One-line descriptions for every Agent referenced as a candidate by a
// workflow definition. Main sees these in the compact workflow index so it
// can select Agents on its own, without a preset delegation plan.
export const AGENT_DESCRIPTIONS = Object.freeze({
  analyzer: 'Read-only analysis and planning specialist; drafts detailed dependency-ordered implementation and evidence plans from Main\'s frozen brief.',
  checker: 'Read-only English checker for a narrow semantic-drift, logic, and clarity check or a broad seven-dimension advisory audit.',
  designer: 'UI/UX specialist for design implementation, review, and visual refinement.',
  'ecc-network-architect': 'Designs enterprise or multi-site network architecture from requirements.',
  'ecc-network-config-reviewer': 'Reviews router and switch configurations for security, correctness, stale references, and risky change-window commands.',
  'ecc-network-troubleshooter': 'Diagnoses network connectivity, routing, DNS, interface, and policy symptoms with an evidence-backed root cause summary.',
  'ecc-opensource-forker': 'Creates a sanitized public-release staging copy while keeping the private source tree read-only.',
  'ecc-opensource-packager': 'Adds approved public documentation and setup assets to an independently sanitized staging copy.',
  'ecc-opensource-sanitizer': 'Verifies an open-source fork is fully sanitized before release; scans for leaked secrets, PII, and internal references.',
  'ecc-security-reviewer': 'Read-only security vulnerability detection specialist for code, configurations, and dependencies.',
  'fact-cross-checker': 'Compares independent fact-check evidence lanes and identifies agreement, conflicts, stale evidence, and unresolved claims.',
  'fact-planner': 'Decomposes a fact-checking task into checkable claims, evidence plans, risk levels, and scope boundaries.',
  'fact-researcher-a': 'First independent evidence lane for fact checking; collects primary-source evidence for planned claims.',
  'fact-researcher-b': 'Second independent evidence lane; looks for corroboration, counter-evidence, and source conflicts.',
  'fact-reviewer': 'Final fact-check reviewer; reviews plan, evidence, cross-check status, and final verdicts for overclaiming.',
  librarian: 'Researches external libraries and APIs by reading source code; returns definitive, source-verified answers.',
  reviewer: 'Code review specialist for quality and security analysis.',
  scout: 'Fast read-only scout returning compressed context for handoff; use for exploratory codebase research and broad pattern searches.',
  task: 'General-purpose subagent with full capabilities for delegated multi-step work.',
  visioner: 'Read-only visual QA specialist for slide decks, UI/web screenshots and interaction states, and static canvas/export artifacts.',
  writer: 'Bounded English writer for drafting or revision, including LaTeX passages and read-only proposed replacements.',
  'zh-checker': '中文只读 checker，可执行窄范围的语义漂移、逻辑与清晰度核查，或完整七维审查。',
  'zh-writer': '有界中文写作与修改 agent，支持 LaTeX 段落和只读修改稿，输出自然中文。',
});

export function describeAgent(role) {
  const description = AGENT_DESCRIPTIONS[role];
  if (!description) throw new Error(`No agent description for workflow role ${role}.`);
  return description;
}
