import { hasKeyLikeText } from './key-vault.js';

export async function runKeyCommand({ args = '', ctx = {}, keyVault }) {
  const parsed = parseKeyCommandArgs(args);
  if (!parsed.ok) return commandResult(false, parsed.message);

  if (parsed.action === 'add') {
    return addKeyInteractively({ ctx, keyVault });
  }
  if (parsed.action === 'remove') {
    const result = await keyVault.removeKey(parsed.selector);
    if (!result.removed) return commandResult(false, `No extra OpenCode Go key matched "${parsed.selector}".`);
    return commandResult(true, `Removed extra OpenCode Go key "${result.key.label}" (${result.key.hash}).`, result);
  }
  if (parsed.action === 'rename') {
    const result = await keyVault.renameKey(parsed.selector, parsed.label);
    if (!result.renamed) return commandResult(false, `No extra OpenCode Go key matched "${parsed.selector}".`);
    return commandResult(true, `Renamed extra OpenCode Go key to "${result.key.label}" (${result.key.hash}).`, result);
  }

  return commandResult(false, helpText());
}

export function parseKeyCommandArgs(args = '') {
  const text = String(args ?? '').trim();
  if (hasKeyLikeText(text)) {
    return {
      ok: false,
      message: 'Do not paste API keys into slash-command arguments. Run /opencode_go_pool_key with no key text and enter the key in the prompt.',
    };
  }
  if (!text) return { ok: true, action: 'add' };

  const parts = splitArgs(text);
  const action = parts[0]?.toLowerCase();
  if (action === 'add') {
    if (parts.length > 1) {
      return {
        ok: false,
        message: 'Run /opencode_go_pool_key add without key text. The command will prompt for label and key.',
      };
    }
    return { ok: true, action: 'add' };
  }
  if (action === 'remove' || action === 'rm' || action === 'delete') {
    if (parts.length !== 2) return { ok: false, message: 'Usage: /opencode_go_pool_key remove <label|id|hash>' };
    return { ok: true, action: 'remove', selector: parts[1] };
  }
  if (action === 'rename') {
    if (parts.length !== 3) return { ok: false, message: 'Usage: /opencode_go_pool_key rename <label|id|hash> <new-label>' };
    return { ok: true, action: 'rename', selector: parts[1], label: parts[2] };
  }
  if (action === 'help') return { ok: false, message: helpText() };

  return { ok: false, message: helpText() };
}

async function addKeyInteractively({ ctx, keyVault }) {
  if (typeof ctx?.ui?.input !== 'function') {
    return commandResult(
      false,
      'Interactive UI input is not available. Start OMP in interactive mode and run /opencode_go_pool_key again.',
    );
  }

  const label = await ctx.ui.input('OpenCode Go extra key label', 'work, personal, backup');
  if (!label) return commandResult(false, 'Cancelled: no label entered.');

  const key = await ctx.ui.input(
    'OpenCode Go API key (input may be visible in this OMP UI; do not paste it into chat)',
    'Paste key here',
  );
  if (!key) return commandResult(false, 'Cancelled: no API key entered.');

  const result = await keyVault.addKey({ label, key });
  return commandResult(
    true,
    `${capitalize(result.action)} extra OpenCode Go key "${result.key.label}" (${result.key.hash}).`,
    result,
  );
}

function commandResult(ok, text, details = {}) {
  return { ok, text, details };
}

function splitArgs(text) {
  return text.match(/"[^"]+"|'[^']+'|\S+/g)?.map(part => part.replace(/^["']|["']$/g, '')) ?? [];
}

function capitalize(text) {
  return `${text.slice(0, 1).toUpperCase()}${text.slice(1)}`;
}

function helpText() {
  return [
    'OpenCode Go pool key commands:',
    '/opencode_go_pool_key',
    '/opencode_go_pool_key add',
    '/opencode_go_pool_key remove <label|id|hash>',
    '/opencode_go_pool_key rename <label|id|hash> <new-label>',
    '',
    'Never include raw API keys in command arguments.',
  ].join('\n');
}
