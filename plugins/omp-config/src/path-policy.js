export function findPathRisks(text, filePath) {
  const findings = [];
  if (text.includes('/root/.omp') || text.includes('/root/.claude')) {
    findings.push({
      id: 'hardcoded-root-home',
      severity: 'warning',
      area: 'paths',
      path: filePath,
      problem: 'Config contains hardcoded /root home paths.',
      evidence: redactEvidence(text),
      suggestion: 'Replace /root paths with user home relative paths or documented local paths.',
      safeToAutoFix: false,
    });
  }
  return findings;
}

function redactEvidence(text) {
  return text
    .split('\n')
    .filter((line) => line.includes('/root/.omp') || line.includes('/root/.claude'))
    .map((line) => line.trim())
    .join('\n');
}
