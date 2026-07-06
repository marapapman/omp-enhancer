import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { classifierDefaults } from './classifier.js';

const roleName = 'classifier';
export const classifierModelTag = {
  name: 'Classifier',
  color: 'accent',
  hidden: false,
};

export function parseClassifierCommand(args = '') {
  const tokens = tokenizeArgs(args);
  const action = tokens[0]?.toLowerCase() ?? 'status';
  if (action === 'help' || action === '--help' || action === '-h') return { action: 'help' };
  if (action === 'set') return { action: 'set', model: tokens.slice(1).join(' ').trim() };
  if (action === 'status' || action === 'show' || !tokens.length) return { action: 'status' };
  return { action: 'set', model: tokens.join(' ').trim() };
}

export async function runClassifierCommand({ args = '', ctx = {}, configPath } = {}) {
  const parsed = parseClassifierCommand(args);
  const targetPath = configPath ?? resolveConfigPath(ctx);

  if (parsed.action === 'help') {
    const current = await readClassifierModel({ ctx, configPath: targetPath });
    return classifierCommandResult({
      ok: true,
      action: 'help',
      model: current.model,
      source: current.source,
      configPath: targetPath,
    });
  }

  if (parsed.action === 'status') {
    const current = await readClassifierModel({ ctx, configPath: targetPath });
    return classifierCommandResult({
      ok: true,
      action: 'status',
      model: current.model,
      source: current.source,
      configPath: targetPath,
    });
  }

  if (!parsed.model) {
    return classifierCommandResult({
      ok: false,
      action: 'set',
      model: null,
      source: 'invalid',
      configPath: targetPath,
      message: 'Missing classifier model. Usage: /classifier set <provider/model:effort>',
    });
  }

  const writeResult = await writeClassifierModel({ ctx, configPath: targetPath, model: parsed.model });
  return classifierCommandResult({
    ok: true,
    action: 'set',
    model: parsed.model,
    source: writeResult.source,
    configPath: writeResult.configPath ?? targetPath,
  });
}

export async function readClassifierModel({ ctx = {}, configPath } = {}) {
  const settings = findSettingsFacade(ctx);
  const fromSettings = settings?.getModelRole?.(roleName) ?? settings?.getModelRoles?.()?.[roleName];
  if (typeof fromSettings === 'string' && fromSettings.trim()) {
    return { model: fromSettings.trim(), source: 'settings' };
  }

  const targetPath = configPath ?? resolveConfigPath(ctx);
  try {
    const text = await fs.readFile(targetPath, 'utf8');
    const roles = parseModelRolesFromYaml(text);
    return {
      model: roles[roleName] ?? classifierDefaults.model,
      source: roles[roleName] ? 'config' : 'default',
    };
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return { model: classifierDefaults.model, source: 'default' };
  }
}

export async function writeClassifierModel({ ctx = {}, configPath, model } = {}) {
  const cleaned = cleanModelValue(model);
  if (!cleaned) throw new Error('classifier model is required');

  const settings = findSettingsFacade(ctx);
  if (settings?.setModelRole) {
    settings.setModelRole(roleName, cleaned);
    ensureSettingsModelTag(settings);
    await settings.flush?.();
    return { source: 'settings', configPath: configPath ?? resolveConfigPath(ctx) };
  }

  const targetPath = configPath ?? resolveConfigPath(ctx);
  let text = '';
  try {
    text = await fs.readFile(targetPath, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const next = upsertYamlClassifierConfig(text, cleaned);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, next);
  return { source: 'config', configPath: targetPath };
}

export async function ensureClassifierModelConfig({ ctx = {}, configPath, model = classifierDefaults.model } = {}) {
  const cleaned = cleanModelValue(model) || classifierDefaults.model;
  const settings = findSettingsFacade(ctx);
  if (settings) {
    let changed = false;
    const currentRole = settings.getModelRole?.(roleName) ?? settings.getModelRoles?.()?.[roleName];
    if (!(typeof currentRole === 'string' && currentRole.trim())) {
      if (settings.setModelRole) {
        settings.setModelRole(roleName, cleaned);
        changed = true;
      } else if (typeof settings.get === 'function' && typeof settings.set === 'function') {
        const roles = plainRecord(settings.get('modelRoles'));
        settings.set('modelRoles', { ...roles, [roleName]: cleaned });
        changed = true;
      }
    }
    changed = ensureSettingsModelTag(settings) || changed;
    if (changed) await settings.flush?.();
    return { ok: true, source: 'settings', changed };
  }

  if (!configPath) return { ok: false, source: 'unavailable', changed: false };

  const targetPath = resolveConfigPath({ ...ctx, configPath });
  let text = '';
  try {
    text = await fs.readFile(targetPath, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const next = upsertYamlClassifierConfig(text, cleaned);
  if (next === text) return { ok: true, source: 'config', configPath: targetPath, changed: false };
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, next);
  return { ok: true, source: 'config', configPath: targetPath, changed: true };
}

export function resolveConfigPath(ctx = {}) {
  const direct = [
    ctx.configPath,
    ctx.agentConfigPath,
    ctx.settingsPath,
    ctx.paths?.config,
    ctx.paths?.configPath,
    ctx.settings?.configPath,
    ctx.config?.configPath,
  ].find((value) => typeof value === 'string' && value.trim());
  if (direct) return expandHome(direct.trim());

  const agentDir = [
    ctx.agentDir,
    ctx.paths?.agentDir,
    process.env.PI_CODING_AGENT_DIR,
  ].find((value) => typeof value === 'string' && value.trim());

  return path.join(expandHome(agentDir?.trim() || '~/.omp/agent'), 'config.yml');
}

export function parseModelRolesFromYaml(text = '') {
  const lines = String(text).split(/\r?\n/);
  const start = lines.findIndex((line) => /^modelRoles\s*:\s*(?:#.*)?$/.test(line.trimEnd()));
  if (start === -1) return {};

  const roles = {};
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line) && line.trim()) break;
    const match = line.match(/^\s{2}([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*(?:#.*)?$/);
    if (!match) continue;
    roles[match[1]] = unquoteYamlScalar(match[2].trim());
  }
  return roles;
}

export function upsertYamlModelRole(text = '', role = roleName, model = classifierDefaults.model) {
  const source = String(text);
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const hasTerminalNewline = source === '' || /\r?\n$/.test(source);
  const lines = source ? source.split(/\r?\n/) : [];
  if (lines.length && lines.at(-1) === '') lines.pop();

  const modelLine = `  ${role}: ${formatYamlScalar(model)}`;
  const start = lines.findIndex((line) => /^modelRoles\s*:\s*(?:#.*)?$/.test(line.trimEnd()));

  if (start === -1) {
    if (lines.length && lines.at(-1).trim()) lines.push('');
    lines.push('modelRoles:', modelLine);
    return `${lines.join(newline)}${newline}`;
  }

  let end = start + 1;
  while (end < lines.length && !(/^\S/.test(lines[end]) && lines[end].trim())) end += 1;

  for (let index = start + 1; index < end; index += 1) {
    if (new RegExp(`^\\s{2}${escapeRegExp(role)}\\s*:`).test(lines[index])) {
      lines[index] = modelLine;
      return `${lines.join(newline)}${hasTerminalNewline ? newline : ''}`;
    }
  }

  const insertAt = preferredInsertIndex(lines, start, end);
  lines.splice(insertAt, 0, modelLine);
  return `${lines.join(newline)}${hasTerminalNewline ? newline : ''}`;
}

export function upsertYamlClassifierConfig(text = '', model = classifierDefaults.model) {
  return upsertYamlModelTag(upsertYamlModelRole(text, roleName, model), roleName, classifierModelTag);
}

export function upsertYamlModelTag(text = '', role = roleName, tag = classifierModelTag) {
  const source = String(text);
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const hasTerminalNewline = source === '' || /\r?\n$/.test(source);
  const lines = source ? source.split(/\r?\n/) : [];
  if (lines.length && lines.at(-1) === '') lines.pop();

  const start = lines.findIndex((line) => /^modelTags\s*:\s*(?:#.*)?$/.test(line.trimEnd()));
  if (start === -1) {
    if (lines.length && lines.at(-1).trim()) lines.push('');
    lines.push('modelTags:', ...modelTagLines(role, tag));
    return `${lines.join(newline)}${newline}`;
  }

  let end = start + 1;
  while (end < lines.length && !(/^\S/.test(lines[end]) && lines[end].trim())) end += 1;

  let roleStart = -1;
  for (let index = start + 1; index < end; index += 1) {
    if (new RegExp(`^\\s{2}${escapeRegExp(role)}\\s*:`).test(lines[index])) {
      roleStart = index;
      break;
    }
  }

  if (roleStart === -1) {
    lines.splice(end, 0, ...modelTagLines(role, tag));
    return `${lines.join(newline)}${hasTerminalNewline ? newline : ''}`;
  }

  const roleEnd = findIndentedBlockEnd(lines, roleStart + 1, end, 4);
  if (!/^\s{2}[A-Za-z0-9_-]+\s*:\s*(?:#.*)?$/.test(lines[roleStart].trimEnd())) {
    lines.splice(roleStart, roleEnd - roleStart, ...modelTagLines(role, tag));
    return `${lines.join(newline)}${hasTerminalNewline ? newline : ''}`;
  }

  const existingFields = new Set();
  for (let index = roleStart + 1; index < roleEnd; index += 1) {
    const match = lines[index].match(/^\s{4}([A-Za-z0-9_-]+)\s*:/);
    if (match) existingFields.add(match[1]);
  }

  const additions = modelTagFieldLines(tag).filter((line) => {
    const match = line.match(/^\s{4}([A-Za-z0-9_-]+)\s*:/);
    return match && !existingFields.has(match[1]);
  });
  if (additions.length > 0) lines.splice(roleEnd, 0, ...additions);
  return `${lines.join(newline)}${hasTerminalNewline ? newline : ''}`;
}

function classifierCommandResult({ ok, action, model, source, configPath, message }) {
  const current = model || classifierDefaults.model;
  const text = [
    message,
    'OMP classifier model configuration',
    '',
    `Current role: modelRoles.${roleName}`,
    `Current model: ${current}`,
    `Source: ${source}`,
    `Config path: ${configPath}`,
    '',
    'Slash command:',
    `/classifier set ${current}`,
    '',
    'Equivalent config:',
    'modelRoles:',
    `  ${roleName}: ${current}`,
    'modelTags:',
    `  ${roleName}:`,
    '    name: Classifier',
    '    color: accent',
    '',
    'Notes:',
    '- /model changes the active session model. modelRoles.classifier controls the classifier role used by OMP Enhancer routing.',
    '- If /model lists custom roles in your OMP build, modelTags.classifier gives this role a visible name.',
  ].filter(Boolean).join('\n');

  return { ok, action, model: current, source, configPath, text };
}

function preferredInsertIndex(lines, start, end) {
  for (let index = start + 1; index < end; index += 1) {
    if (/^\s{2}advisor\s*:/.test(lines[index])) return index + 1;
  }
  return start + 1;
}

function findSettingsFacade(ctx = {}) {
  return [ctx.settings, ctx.config, ctx.settingsManager]
    .find((value) => value && typeof value === 'object' && (
      value.setModelRole
      || value.getModelRole
      || value.getModelRoles
      || (typeof value.get === 'function' && typeof value.set === 'function')
    ));
}

function ensureSettingsModelTag(settings) {
  if (typeof settings.get !== 'function' || typeof settings.set !== 'function') return false;
  const tags = plainRecord(settings.get('modelTags'));
  const current = plainRecord(tags[roleName]);
  const next = {
    ...classifierModelTag,
    ...current,
    name: typeof current.name === 'string' && current.name.trim() ? current.name : classifierModelTag.name,
    color: typeof current.color === 'string' && current.color.trim() ? current.color : classifierModelTag.color,
  };
  if (recordsEqual(current, next) && tags[roleName] && typeof tags[roleName] === 'object') return false;
  settings.set('modelTags', { ...tags, [roleName]: next });
  return true;
}

function plainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...value };
}

function recordsEqual(left, right) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && rightKeys.every((key) => left[key] === right[key]);
}

function modelTagLines(role, tag) {
  return [`  ${role}:`, ...modelTagFieldLines(tag)];
}

function modelTagFieldLines(tag) {
  const lines = [
    `    name: ${formatYamlScalar(tag.name ?? classifierModelTag.name)}`,
    `    color: ${formatYamlScalar(tag.color ?? classifierModelTag.color)}`,
  ];
  if (typeof tag.hidden === 'boolean') lines.push(`    hidden: ${tag.hidden ? 'true' : 'false'}`);
  return lines;
}

function findIndentedBlockEnd(lines, start, maxEnd, indent) {
  let end = start;
  const pattern = new RegExp(`^\\s{${indent},}\\S`);
  while (end < maxEnd && (!lines[end].trim() || pattern.test(lines[end]))) end += 1;
  return end;
}

function cleanModelValue(value) {
  return String(value ?? '').trim();
}

function tokenizeArgs(args = '') {
  return String(args).trim().match(/"[^"]+"|'[^']+'|\S+/g)?.map((token) => token.replace(/^(['"])(.*)\1$/, '$2')) ?? [];
}

function formatYamlScalar(value) {
  const text = cleanModelValue(value);
  if (/^[A-Za-z0-9_./:@+-]+$/.test(text)) return text;
  return JSON.stringify(text);
}

function unquoteYamlScalar(value) {
  if (!value) return '';
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function expandHome(value) {
  if (value === '~') return os.homedir();
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
  return value;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
