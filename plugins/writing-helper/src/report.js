function formatChineseIssue(issue, index) {
  return [
    `### 问题 ${index + 1}：${issue.dimension} ${issue.severity}`,
    `- 位置：${issue.location}`,
    `- 问题：${issue.problem}`,
    `- 原文：「${issue.quote}」`,
    `- 建议：${issue.suggestion}`,
  ].join('\n');
}

function formatEnglishIssue(issue, index) {
  return [
    `### Issue ${index + 1}: ${issue.dimension} ${issue.severity}`,
    `- Location: ${issue.location}`,
    `- Problem: ${issue.problem}`,
    `- Quote: "${issue.quote}"`,
    `- Suggestion: ${issue.suggestion}`,
  ].join('\n');
}

export function formatWritingLogicReport(result) {
  if (result.summary.total === 0) {
    return result.language === 'zh'
      ? '[检测通过，无实质性逻辑问题]'
      : '[Passed: no substantive logic issues found]';
  }

  const omitted = Math.max(0, result.summary.total - result.issues.length);
  if (result.language === 'zh') {
    const lines = [
      '## 逻辑检查结果',
      '',
      ...result.issues.flatMap((issue, index) => [formatChineseIssue(issue, index), '']),
    ];
    if (omitted > 0) lines.push(`另有 ${omitted} 个问题未显示。`);
    return lines.join('\n').trim();
  }

  const lines = [
    '## Writing Logic Check Results',
    '',
    ...result.issues.flatMap((issue, index) => [formatEnglishIssue(issue, index), '']),
  ];
  if (omitted > 0) lines.push(`${omitted} additional issue(s) omitted.`);
  return lines.join('\n').trim();
}

function formatSummaryLine(result) {
  const counts = result.summary.byCategory ?? {};
  return result.language === 'zh'
    ? `逻辑 ${counts.logic ?? 0}，风格 ${counts.style ?? 0}，引用 ${counts.citation ?? 0}`
    : `logic ${counts.logic ?? 0}, style ${counts.style ?? 0}, citation ${counts.citation ?? 0}`;
}

export function formatWritingQualityReport(result) {
  if (result.summary.total === 0) {
    return result.language === 'zh'
      ? '[检测通过，无写作质量问题]'
      : '[Passed: no writing quality issues found]';
  }

  const omitted = Math.max(0, result.summary.total - result.issues.length);
  if (result.language === 'zh') {
    const lines = [
      '## 写作质量检查结果',
      '',
      `摘要：${formatSummaryLine(result)}。`,
      '',
      ...result.issues.flatMap((issue, index) => [formatChineseIssue(issue, index), '']),
    ];
    if (omitted > 0) lines.push(`另有 ${omitted} 个问题未显示。`);
    return lines.join('\n').trim();
  }

  const lines = [
    '## Writing Quality Check Results',
    '',
    `Summary: ${formatSummaryLine(result)}.`,
    '',
    ...result.issues.flatMap((issue, index) => [formatEnglishIssue(issue, index), '']),
  ];
  if (omitted > 0) lines.push(`${omitted} additional issue(s) omitted.`);
  return lines.join('\n').trim();
}
