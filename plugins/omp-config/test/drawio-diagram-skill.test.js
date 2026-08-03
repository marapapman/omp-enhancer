import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const skillUrl = new URL('../skills/drawio-diagram/SKILL.md', import.meta.url);
const checkerScript = fileURLToPath(new URL('../skills/drawio-diagram/scripts/check-drawio-layout.mjs', import.meta.url));

const boxStyle = 'rounded=0;whiteSpace=wrap;html=1;align=center;verticalAlign=middle;fontSize=14;fontFamily=Helvetica;';
const edgeStyle = 'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;exitX=1;exitY=0.5;entryX=0;entryY=0.5;endArrow=classic;endFill=1;endSize=10;strokeWidth=1.5;';

function drawioXml(contentCells) {
  return `<mxfile><diagram><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${contentCells.join('')}</root></mxGraphModel></diagram></mxfile>`;
}

function box(id, value, x, y, w, h, style = boxStyle) {
  return `<mxCell id="${id}" value="${value}" style="${style}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`;
}

function edge(id, source, target, style = edgeStyle) {
  return `<mxCell id="${id}" style="${style}" edge="1" parent="1" source="${source}" target="${target}"><mxGeometry relative="1" as="geometry"/></mxCell>`;
}

// The checker module runs its CLI at import time, so drive it as a subprocess
// on temp files (exit 0 + empty stderr = clean; exit 1 = findings on stderr).
async function runChecker(source) {
  const root = await mkdtemp(path.join(tmpdir(), 'drawio-diagram-check-'));
  const filePath = path.join(root, 'figure.drawio');
  await writeFile(filePath, source);
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [checkerScript, filePath]);
    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    return { exitCode: error.code ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

test('drawio-diagram skill defines draw.io XML authoring with the checker and the drawio MCP as the single pipeline', async () => {
  const skill = await readFile(skillUrl, 'utf8');

  assert.match(skill, /^name: drawio-diagram$/mu);
  const description = skill.match(/^description:\s*(.+)$/mu)?.[1] ?? '';
  assert.match(description, /draw\.io XML/);
  assert.match(description, /drawio MCP/);
  assert.match(description, /no overlapping boxes/);
  assert.match(description, /perpendicular arrows/);
  assert.match(description, /fonts?\s+sized\s+for\s+(?:PPT|print)/i);

  assert.match(skill, /check-drawio-layout\.mjs/);
  assert.match(skill, /fontSize=14/);
  assert.match(skill, /orthogonalEdgeStyle/);
  assert.match(skill, /exitX=1;exitY=0\.5/);
  assert.match(skill, /endArrow=classic;endFill=1/);
  assert.match(skill, /Emit one complete `<mxfile>` document/);
  assert.match(skill, /draw\.io XML is the single source of node positions, edge geometry, and labels/);
  assert.match(skill, /Run the bundled static checker before opening the diagram/);
  assert.match(skill, /Main accepts final delivery/);
  assert.match(skill, /skill:\/\/drawio-diagram\/references\/drawio-authoring\.md/);
  assert.match(skill, /skill:\/\/drawio-diagram\/references\/geometry-review\.md/);

  assert.doesNotMatch(skill, /RESOURCE EXTENSION/i);
  assert.doesNotMatch(skill, /(?:Hosted app server|create_diagram)[^.]*libavoid/is);
  assert.match(skill, /Local tool server.+accepts `routing:\s*"libavoid"`/is);
});

test('drawio-diagram skill references resolve as real files', async () => {
  const authoringUrl = new URL('../skills/drawio-diagram/references/drawio-authoring.md', import.meta.url);
  const geometryUrl = new URL('../skills/drawio-diagram/references/geometry-review.md', import.meta.url);
  assert.ok((await readFile(authoringUrl, 'utf8')).length > 0);
  assert.ok((await readFile(geometryUrl, 'utf8')).length > 0);
});

test('drawio checker accepts a clean orthogonal diagram with 14px fonts', async () => {
  const result = await runChecker(drawioXml([
    box('a', 'Start', 0, 0, 120, 60),
    box('b', 'Review', 240, 0, 120, 60),
    box('c', 'Finish', 480, 0, 120, 60),
    edge('e1', 'a', 'b'),
    edge('e2', 'b', 'c'),
  ]));
  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /draw\.io layout check passed/);
});

test('drawio checker rejects overlapping boxes', async () => {
  const result = await runChecker(drawioXml([
    box('a', 'A', 0, 0, 120, 60),
    box('b', 'B', 60, 20, 120, 60),
  ]));
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /ERROR: box overlap between "a" and "b"/);
});

test('drawio checker rejects fonts below 14px', async () => {
  const result = await runChecker(drawioXml([
    box('a', 'Small', 0, 0, 120, 60, boxStyle.replace('fontSize=14', 'fontSize=12')),
  ]));
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /ERROR: box "a" uses fontSize=12 \(minimum 14 for PPT\/print\)/);
});

test('drawio checker rejects non-perpendicular edge attachment points', async () => {
  const result = await runChecker(drawioXml([
    box('a', 'A', 0, 0, 120, 60),
    box('b', 'B', 240, 0, 120, 60),
    edge('e1', 'a', 'b', 'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;exitX=0.3;exitY=0.5;entryX=0;entryY=0.5;endArrow=classic;endFill=1;'),
  ]));
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /ERROR: edge "e1" exits at a non-perpendicular point \(exitX=0\.3, exitY=0\.5\)/);
});

test('drawio checker rejects an edge whose every monotone route crosses a middle box', async () => {
  const result = await runChecker(drawioXml([
    box('a', 'A', 0, 100, 120, 60),
    box('m', 'M', 144, 100, 100, 60),
    box('b', 'B', 324, 100, 120, 60),
    edge('e1', 'a', 'b'),
  ]));
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /ERROR: edge "e1" path crosses box\(es\): m/);
});

test('drawio checker rejects text that likely overflows its box', async () => {
  const result = await runChecker(drawioXml([
    box('a', 'This label is far too long for this tiny box', 0, 0, 100, 40),
  ]));
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /ERROR: text in box "a" likely overflows/);
});

test('drawio checker rejects edges without orthogonalEdgeStyle', async () => {
  const result = await runChecker(drawioXml([
    box('a', 'A', 0, 0, 120, 60),
    box('b', 'B', 240, 0, 120, 60),
    edge('e1', 'a', 'b', 'rounded=0;html=1;exitX=1;exitY=0.5;entryX=0;entryY=0.5;endArrow=classic;endFill=1;'),
  ]));
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /ERROR: edge "e1" must use edgeStyle=orthogonalEdgeStyle/);
});
