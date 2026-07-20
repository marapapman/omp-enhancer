#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export const eccSkillRoot = path.join(
  repoRoot,
  'plugins',
  'omp-config',
  'skills',
  'ecc',
);

export async function checkEccSkillArtifacts({ skillRoot = eccSkillRoot } = {}) {
  const expected = await buildArtifacts(skillRoot);
  const results = await Promise.all(expected.map(async (artifact) => {
    const actual = await readFile(artifact.target, 'utf8').catch((error) => {
      if (error?.code === 'ENOENT') return null;
      throw error;
    });
    return { ...artifact, actual, ok: actual === artifact.expected };
  }));
  return { ok: results.every(({ ok }) => ok), results };
}

export async function writeEccSkillArtifacts({ skillRoot = eccSkillRoot } = {}) {
  const artifacts = await buildArtifacts(skillRoot);
  await mkdir(skillRoot, { recursive: true });
  for (const artifact of artifacts) {
    await writeFile(artifact.target, artifact.expected, 'utf8');
  }
  return {
    ok: true,
    results: artifacts.map(({ name, target, expected }) => ({
      name,
      target,
      bytes: Buffer.byteLength(expected),
    })),
  };
}

async function buildArtifacts(skillRoot) {
  const skills = await readNestedSkills(skillRoot);
  return [
    {
      name: 'index',
      target: path.join(skillRoot, 'SKILL.md'),
      expected: buildIndexMarkdown(skills.length),
    },
    {
      name: 'catalog',
      target: path.join(skillRoot, 'catalog.md'),
      expected: buildCatalogMarkdown(skills),
    },
  ];
}

async function readNestedSkills(skillRoot) {
  const entries = await readdir(skillRoot, { withFileTypes: true }).catch((error) => {
    if (error?.code === 'ENOENT') return [];
    throw error;
  });
  const skills = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const filePath = path.join(skillRoot, entry.name, 'SKILL.md');
    const source = await readFile(filePath, 'utf8').catch((error) => {
      if (error?.code === 'ENOENT') return null;
      throw error;
    });
    if (source === null) continue;
    const frontmatter = parseFrontmatter(source, filePath);
    skills.push({
      directory: entry.name,
      name: frontmatter.name || entry.name,
      description: frontmatter.description,
    });
  }
  skills.sort((left, right) => left.name.localeCompare(right.name, 'en'));
  assertUniqueNames(skills);
  return skills;
}

function parseFrontmatter(source, filePath) {
  const lines = source.split(/\r?\n/u);
  if (lines[0] !== '---') throw new Error(`Missing frontmatter in ${filePath}.`);
  const end = lines.indexOf('---', 1);
  if (end < 0) throw new Error(`Unclosed frontmatter in ${filePath}.`);
  let name = '';
  let description = '';
  for (let index = 1; index < end; index += 1) {
    const line = lines[index];
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/u);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (key === 'name') name = parseScalar(rawValue);
    if (key !== 'description') continue;
    const blockScalar = rawValue.match(/^([>|])[+-]?$/u);
    if (blockScalar) {
      const body = [];
      while (index + 1 < end && /^(?:\s+|$)/u.test(lines[index + 1])) {
        index += 1;
        body.push(lines[index].trim());
      }
      description = body.filter(Boolean).join(blockScalar[1] === '>' ? ' ' : '\n');
    } else {
      description = parseScalar(rawValue);
    }
  }
  description = description.replace(/\s+/gu, ' ').trim();
  if (!description) throw new Error(`Missing description in ${filePath}.`);
  return { name, description };
}

function parseScalar(rawValue) {
  const value = rawValue.trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/gu, "'");
  }
  return value;
}

function assertUniqueNames(skills) {
  const seen = new Set();
  for (const skill of skills) {
    if (seen.has(skill.name)) throw new Error(`Duplicate nested ECC Skill name: ${skill.name}.`);
    seen.add(skill.name);
  }
}

function buildIndexMarkdown(skillCount) {
  return [
    '---',
    'name: ecc-skill-catalog',
    'description: On-demand index for niche ECC guides, including framework-specific engineering, homelab and network operations, domain compliance, research, and specialized security. Use when a task names a niche technology such as Pi-hole, BGP, Ktor, Laravel, or ClickHouse and no directly visible subject-domain Skill applies. A workflow or Agent does not replace the subject guide, and a writing or output-format Skill does not replace the subject guide. Once selected and read, read catalog.md and then the smallest exact nested guide. Do not load it for routine work.',
    '---',
    '',
    '# ECC Skill catalog',
    '',
    `This Skill exposes ${skillCount} specialized packaged guides without placing every description in OMP's permanent system prompt.`,
    '',
    '1. First scan the directly visible OMP Skill descriptions.',
    '2. A workflow reference or Agent is not a subject-domain Skill. A writing or output-format Skill is not a direct subject-domain match.',
    '3. Once this adapter is declared and successfully read, the next exact resource read is `skill://ecc-skill-catalog/catalog.md`; wait for that read before claiming the catalog checked or loaded.',
    '4. Choose the smallest matching nested guide and read its exact URI from the catalog; mark it unavailable only after that read fails.',
    '5. Do not bulk-load guides, guess a guide name, or treat a workflow or Agent as a substitute for the catalog or nested subject guide.',
    '6. Do not treat this catalog as permission to widen the task.',
    '',
    'OMP native tools, Agents, approvals, permissions, and completion behavior remain authoritative.',
    '',
    'ADAPTER HANDOFF (soft): at visible byte 0 declare `RESOURCE EXTENSION | source=skill://ecc-skill-catalog | reads=skill://ecc-skill-catalog/catalog.md`; in that response read only that exact URI, then stop and wait. This is catalog hop 1 of at most 2 and resource extension 1 of at most 3. NOT YET: nested guide, workflow reference, project tool, TODO, task, or answer.',
    '',
  ].join('\n');
}

function buildCatalogMarkdown(skills) {
  return [
    '# Specialized ECC guides',
    '',
    'Read only the smallest guide that directly matches the current task. These are optional instructions, not new tools, permissions, Agents, or completion gates.',
    '',
    ...skills.map(({ directory, name, description }) => (
      `- \`${name}\` — ${description} Read: \`skill://ecc-skill-catalog/${directory}/SKILL.md\`.`
    )),
    '',
    'CATALOG HANDOFF (soft): at visible byte 0 declare `RESOURCE EXTENSION | source=skill://ecc-skill-catalog/catalog.md | reads=<smallest-matching-exact-nested-skill-uri>`; in that response read only that one catalog-listed exact URI, then stop and wait. This is catalog hop 2 of at most 2 and resource extension 2 of at most 3; one final linked-method resource batch remains only when that loaded guide explicitly reveals a required exact skill:// URI. Continue declared workflow references only after the guide and any such final resource return; do not start project work yet.',
    '',
  ].join('\n');
}

async function main(argv = process.argv.slice(2)) {
  const check = argv.includes('--check');
  const write = argv.includes('--write');
  if (check === write || argv.some((arg) => !['--check', '--write'].includes(arg))) {
    throw new Error('Choose exactly one mode: --check or --write.');
  }
  if (write) {
    const result = await writeEccSkillArtifacts();
    for (const artifact of result.results) {
      process.stdout.write(`Generated ${path.relative(repoRoot, artifact.target)} (${artifact.bytes} bytes).\n`);
    }
    return;
  }
  const result = await checkEccSkillArtifacts();
  if (!result.ok) {
    for (const artifact of result.results.filter(({ ok }) => !ok)) {
      process.stderr.write(`ECC Skill artifact is stale: ${path.relative(repoRoot, artifact.target)}.\n`);
    }
    process.stderr.write('Run npm run generate:ecc-skills.\n');
    process.exitCode = 1;
    return;
  }
  process.stdout.write('ECC Skill artifacts are current.\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
