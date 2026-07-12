export const subagentPlans = Object.freeze({
  configAssets: Object.freeze([
    subagent('config-librarian', 'inventory packaged assets, agents, skills, hooks, and config templates'),
    subagent('reviewer', 'review the config or marketplace diff and summarize portability risks'),
  ]),
  implementation: Object.freeze([
    subagent('plan', 'decompose non-trivial or multi-file changes into an executable plan', ['brainstorming', 'subagent-driven-development']),
    subagent('implementation-task', 'implement the planned code and test changes in the smallest coherent batch', ['test-driven-development', 'verification-before-completion']),
    subagent('reviewer', 'review the resulting diff and report correctness or regression concerns', ['verification-before-completion']),
  ]),
  securityRemediation: Object.freeze([
    subagent('ecc-security-reviewer', 'audit user-input, auth, file, network, secrets, and dependency risks', ['security-review', 'security-scan']),
    subagent('implementation-task', 'implement the remediation and regression tests', ['test-driven-development', 'verification-before-completion']),
    subagent('reviewer', 'check the remediation diff for security and behavior regressions', ['security-review', 'verification-before-completion']),
  ]),
  securityReview: Object.freeze([
    subagent('ecc-security-reviewer', 'audit user-input, auth, file, network, secrets, and dependency risks', ['security-review', 'security-scan']),
    subagent('reviewer', 'independently review the findings and false-positive risk', ['security-review']),
  ]),
  bugAudit: Object.freeze([
    subagent(
      'ecc-tdd-guide',
      'generate a deduplicated multi-channel boundary, load, mode, and input test matrix for audit verification',
      ['test-driven-development', 'search-first', 'ai-regression-testing'],
    ),
    subagent('ecc-code-reviewer', 'audit code paths for concrete bugs with file and line evidence', ['verification-before-completion']),
    subagent('ecc-silent-failure-hunter', 'hunt swallowed errors, bad fallbacks, and missing error propagation', ['diagnose']),
    subagent('ecc-pr-test-analyzer', 'review generated test execution, duplicate removal, and coverage gaps that affect bug confidence', ['verification-before-completion']),
  ]),
  factCheck: Object.freeze([
    subagent(
      'fact-planner',
      'decompose source text into atomic factual claims and evidence plans',
      ['fact-checking', 'claim-extraction'],
      { modelRoles: ['pi/plan', 'pi/slow'] },
    ),
    subagent('fact-researcher-a', 'collect first-lane primary-source evidence for planned claims', ['fact-checking', 'source-evaluation', 'citation-authenticity']),
    subagent('fact-researcher-b', 'independently collect counter-evidence, stale-version checks, and corroboration', ['fact-checking', 'source-evaluation', 'citation-authenticity']),
    subagent(
      'fact-cross-checker',
      'compare independent evidence lanes and classify agreement, conflict, staleness, and insufficiency',
      ['fact-checking', 'source-evaluation'],
      { modelRoles: ['pi/slow'] },
    ),
    subagent(
      'fact-reviewer',
      'review final verdicts for overclaiming, stale evidence, and unsupported conclusions',
      ['fact-checking', 'source-evaluation', 'citation-authenticity'],
      { modelRoles: ['pi/slow'] },
    ),
  ]),
  writingZh: Object.freeze([
    subagent('zh-writer', 'draft or rewrite Chinese text using the relevant writing guidance', ['plain-chinese-writing', 'zh-writing-polish']),
    subagent('zh-checker', 'review Chinese logic, style, and plain-writing quality', ['plain-chinese-writing', 'zh-writing-checkers']),
  ]),
  writingEn: Object.freeze([
    subagent('writer', 'draft or revise English writing using the relevant writing guidance', ['writing-markdown-helper']),
    subagent('checker', 'review English logic, style, formatting, and citation quality', ['writing-checkers']),
  ]),
});

function subagent(agent, duty, requiredSkills = [], options = {}) {
  const routed = { agent, duty, skills: [...requiredSkills] };
  if (Array.isArray(options.modelRoles) && options.modelRoles.length) {
    routed.modelRoles = [...options.modelRoles];
  }
  return Object.freeze(routed);
}
