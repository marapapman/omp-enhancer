export function formatDoctorReport(result) {
  const lines = ['# OMP Config Doctor', '', result.summary];
  for (const finding of result.findings) {
    lines.push('', `## ${finding.id}`, '', `Severity: ${finding.severity}`, '', finding.problem, '', finding.suggestion);
  }
  return lines.join('\n');
}

export function formatPlanReport(result) {
  return ['# OMP Config Patch Plan', '', ...result.plan.map((step, index) => `${index + 1}. ${step}`)].join('\n');
}
