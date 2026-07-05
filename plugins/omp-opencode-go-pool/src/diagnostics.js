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
  lines.push('Plugin-observed usage (not an OpenCode Go dashboard bill)');
  for (const [name, window] of Object.entries(report.usage.windows)) {
    lines.push(formatUsageWindow(name, window));
  }
  if (report.usage.corruptLines > 0) {
    lines.push(`Warnings: skipped ${report.usage.corruptLines} corrupt usage ledger line(s).`);
  }
  return lines.join('\n');
}

function formatUsageWindow(name, window) {
  const total = window.total;
  const keyBits = Object.values(window.byKey)
    .sort((a, b) => a.label.localeCompare(b.label))
    .map(key => `${key.label}:${key.requests} req/${key.tokens} tok/${formatCost(key.knownCost, key.unknownCostRequests)}`);
  const suffix = keyBits.length ? `; keys ${keyBits.join(', ')}` : '';
  return `- ${name}: ${total.requests} req, ${total.successes} ok, ${total.failures} failed, ${total.tokens} tok, ${formatCost(total.knownCost, total.unknownCostRequests)}${suffix}`;
}

function formatCost(knownCost, unknownCount) {
  const known = `$${Number(knownCost ?? 0).toFixed(6)} known`;
  return unknownCount > 0 ? `${known}, ${unknownCount} unknown-cost req` : known;
}
