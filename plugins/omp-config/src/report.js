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

export function formatWorkflowContextSyncReport(result) {
  const lines = [
    '# OMP Workflow Context Sync',
    '',
    `Mode: ${result.mode}`,
    '',
    `Target: ${result.targetDir}`,
    '',
    result.mode === 'dry-run'
      ? `${result.changed} managed file(s) would change.`
      : `${result.changed} managed file(s) changed.`,
  ];
  for (const file of result.files) {
    lines.push('', `- ${file.action}: ${file.path} (${file.managed})`);
  }
  if (result.mode === 'dry-run') {
    lines.push('', 'No files were written. Run again with apply=true to apply this exact managed sync.');
  }
  return lines.join('\n');
}
