export async function buildStatusReport({ keyPool, keyVault, usageLedger, primaryApiKey } = {}) {
  const [extraKeys, keyStates, usage] = await Promise.all([
    keyVault.listKeys(),
    keyPool.listKeyStates(primaryApiKey),
    usageLedger.aggregate(),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    vault: {
      extraKeyCount: extraKeys.length,
      storage: extraKeys[0]?.storage ?? 'local-protected-file',
    },
    keys: keyStates,
    usage,
  };
}

const BAR_WIDTH = 24;
const OPENCODE_GO_LIMITS = {
  '5h': { label: '5 Hour limit', limitUsd: 12 },
  weekly: { label: 'Weekly limit', limitUsd: 30 },
  monthly: { label: 'Monthly limit', limitUsd: 60 },
};

export function formatStatusReport(report) {
  const lines = [];
  lines.push('OpenCode Go key pool status');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Vault: ${report.vault.extraKeyCount} extra key(s), storage=${report.vault.storage}`);
  lines.push('');
  lines.push('Keys');

  if (report.keys.length === 0) {
    lines.push('- No primary or extra keys are visible to the plugin yet.');
  } else {
    for (const key of report.keys) {
      const cooldown = key.cooldownUntil ? `, cooldownUntil=${key.cooldownUntil}` : '';
      const error = key.lastErrorKind ? `, lastError=${key.lastErrorKind}` : '';
      lines.push(`- ${key.label} [${key.source}] ${key.status}, inFlight=${key.inFlight}, failures=${key.failureCount}, hash=${key.hash}${cooldown}${error}`);
    }
  }

  lines.push('');
  lines.push('Plugin-observed usage');
  lines.push('OpenCode usage outside this plugin is not included.');
  for (const [name, window] of Object.entries(report.usage.windows)) {
    lines.push(...formatUsageWindow(name, window));
  }
  if (report.usage.corruptLines > 0) {
    lines.push(`Warnings: skipped ${report.usage.corruptLines} corrupt usage ledger line(s).`);
  }
  return lines.join('\n');
}

function formatUsageWindow(name, window) {
  const limit = OPENCODE_GO_LIMITS[name] ?? { label: name, limitUsd: undefined };
  const total = window.total;
  const keys = Object.values(window.byKey).sort((a, b) => {
    if (b.knownCost !== a.knownCost) return b.knownCost - a.knownCost;
    if (b.requests !== a.requests) return b.requests - a.requests;
    return a.label.localeCompare(b.label);
  });
  const labelWidth = Math.max(5, ...keys.map(key => displayLabel(key).length));
  const rows = [''];
  const title = limit.limitUsd === undefined ? limit.label : `${limit.label} · ${formatMoney(limit.limitUsd, 2)}`;
  rows.push(title);
  rows.push(formatUsageRow('total', total, limit.limitUsd, labelWidth));
  for (const key of keys) {
    rows.push(formatUsageRow(displayLabel(key), key, limit.limitUsd, labelWidth));
  }
  if (keys.length === 0) {
    rows.push(`  ${'keys'.padEnd(labelWidth)} ${renderUsageBar(0)}  no plugin-observed requests`);
  }
  return rows;
}

function formatUsageRow(label, usage, limitUsd, labelWidth) {
  const knownCost = Number(usage.knownCost ?? 0);
  const fraction = limitUsd ? knownCost / limitUsd : undefined;
  return `  ${truncateLabel(label, labelWidth).padEnd(labelWidth)} ${renderUsageBar(fraction)}  ${formatUsageDetails(usage, limitUsd, fraction)}`;
}

function formatUsageDetails(usage, limitUsd, fraction) {
  const requests = Number(usage.requests ?? 0);
  const parts = [];
  if (limitUsd === undefined) {
    parts.push(`${formatMoney(usage.knownCost)} known`);
  } else {
    parts.push(`${formatMoney(usage.knownCost)} / ${formatMoney(limitUsd, 2)} known`);
  }
  if (fraction !== undefined) parts.push(`${formatPercent(fraction)} used`);
  if (requests === 0) {
    parts.push('no requests');
  } else {
    parts.push(`${requests} req`);
    parts.push(`${Number(usage.successes ?? 0)} ok`);
    const failures = Number(usage.failures ?? 0);
    if (failures > 0) parts.push(`${failures} failed`);
    const tokens = Number(usage.tokens ?? 0);
    if (tokens > 0) parts.push(`${formatCount(tokens)} tok`);
  }
  const unknown = Number(usage.unknownCostRequests ?? 0);
  if (unknown > 0) parts.push(`${unknown} unknown-cost req`);
  return parts.join(' · ');
}

function renderUsageBar(fraction) {
  if (fraction === undefined) return '·'.repeat(BAR_WIDTH);
  const clamped = Math.min(Math.max(Number(fraction) || 0, 0), 1);
  const exact = clamped * BAR_WIDTH;
  const fullCells = Math.floor(exact);
  const remainder = exact - fullCells;
  let partial = '';
  if (remainder >= 2 / 3) partial = '▓';
  else if (remainder >= 1 / 3) partial = '▒';
  const filled = '█'.repeat(fullCells) + partial;
  const empty = '░'.repeat(Math.max(0, BAR_WIDTH - fullCells - (partial ? 1 : 0)));
  return `${filled}${empty}`;
}

function displayLabel(key) {
  const label = String(key.label ?? 'unknown');
  if (!key.source) return label;
  return `${label} [${key.source}]`;
}

function truncateLabel(label, width) {
  const text = String(label);
  if (text.length <= width) return text;
  if (width <= 3) return text.slice(0, width);
  return `${text.slice(0, width - 3)}...`;
}

function formatMoney(value, digits = 6) {
  return `$${Number(value ?? 0).toFixed(digits)}`;
}

function formatPercent(fraction) {
  return `${(Math.min(Math.max(Number(fraction) || 0, 0), 1) * 100).toFixed(1)}%`;
}

function formatCount(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}
