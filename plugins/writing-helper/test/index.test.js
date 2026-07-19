import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, it, mock } from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import extension, { runWritingLogicCheck, runWritingQualityCheck } from '../index.js';

function schema(kind, data = {}) {
  return { __ompZodSchema: true, kind, ...data };
}

function optional(schemaValue) {
  return { ...schemaValue, optional: true };
}

function makeZodApi() {
  const z = {
    object: (shape) => schema('object', { shape }),
    string: () => schema('string'),
    number: () => schema('number'),
    boolean: () => schema('boolean'),
    enum: (values) => schema('enum', { values }),
    array: (item) => schema('array', { item }),
  };
  for (const fn of ['string', 'number', 'boolean']) {
    const original = z[fn];
    z[fn] = () => {
      const value = original();
      value.optional = () => optional(value);
      return value;
    };
  }
  z.enum = (values) => {
    const value = schema('enum', { values });
    value.optional = () => optional(value);
    return value;
  };
  z.array = (item) => {
    const value = schema('array', { item });
    value.optional = () => optional(value);
    return value;
  };
  return { z };
}

function makeExtensionApi() {
  return {
    registerTool: mock.fn((tool) => {
      assert.equal(tool.parameters?.__ompZodSchema, true);
    }),
    registerCommand: mock.fn(),
    zod: makeZodApi(),
  };
}

describe('writing-logic extension', () => {
  it('registers logic and quality tools with matching commands', () => {
    const api = makeExtensionApi();

    extension(api);
    assert.deepEqual(
      api.registerTool.mock.calls.map((call) => call.arguments[0].name),
      ['writing_logic_check', 'writing_quality_check'],
    );
    assert.deepEqual(
      api.registerCommand.mock.calls.map((call) => call.arguments[0]),
      ['writing-logic', 'writing-quality'],
    );
  });

  it('registers tool metadata for prompt routing', () => {
    const api = makeExtensionApi();

    extension(api);

    const tool = api.registerTool.mock.calls[0].arguments[0];
    assert.equal(typeof tool.promptSnippet, 'string');
    assert.equal(Array.isArray(tool.promptGuidelines), true);
    assert.equal(typeof tool.description, 'string');
    assert.equal(tool.defaultInactive, true);
    assert.equal(tool.approval, 'read');

    const qualityTool = api.registerTool.mock.calls[1].arguments[0];
    assert.equal(qualityTool.defaultInactive, true);
    assert.equal(qualityTool.approval, 'read');
  });

  it('quality tool exposes network citation controls and explicit disable support', () => {
    const api = makeExtensionApi();
    extension(api);

    const qualityTool = api.registerTool.mock.calls[1].arguments[0];
    assert.equal(qualityTool.parameters.shape.allowNetwork.kind, 'boolean');
    assert.deepEqual(qualityTool.parameters.shape.citationProviders.item.values, ['local', 'doi', 'arxiv', 'crossref']);
    assert.match(qualityTool.description, /UNVERIFIED/);
  });

  it('quality tool exposes an optional advisory preservation comparison', async () => {
    const api = makeExtensionApi();
    extension(api);

    const qualityTool = api.registerTool.mock.calls[1].arguments[0];
    assert.equal(qualityTool.parameters.shape.originalText.kind, 'string');
    assert.equal(qualityTool.parameters.shape.preservation.kind, 'boolean');
    assert.equal(qualityTool.parameters.shape.checks.item.values.includes('preservation'), true);

    const response = await qualityTool.execute(
      'preservation-call',
      {
        originalText: 'The method typically improves accuracy by 12%.',
        text: 'The method improves accuracy by 14%.',
        checks: ['preservation'],
      },
      undefined,
      undefined,
      { cwd: process.cwd() },
    );

    assert.equal(response.isError, false);
    assert.equal(response.details.preservation.driftDetected, true);
    assert.match(response.content[0].text, /preservation/i);
  });

  it('tool execution returns report content and structured details', async () => {
    const api = makeExtensionApi();
    extension(api);

    const tool = api.registerTool.mock.calls[0].arguments[0];
    const response = await tool.execute(
      'call-1',
      {
        text: '准确率为 91%。随后我们报告准确率为 87%。',
        language: 'zh',
      },
      undefined,
      undefined,
      { cwd: process.cwd() },
    );

    assert.equal(response.isError, false);
    assert.match(response.content[0].text, /逻辑检查结果/);
    assert.equal(response.details.summary.verdict, 'critical_findings');
  });

  it('quality tool execution returns combined report content and structured details', async () => {
    const api = makeExtensionApi();
    extension(api);

    const qualityTool = api.registerTool.mock.calls[1].arguments[0];
    const response = await qualityTool.execute(
      'call-2',
      {
        text: '准确率为 91%。随后准确率为 87%。近年来，随着人工智能技术的快速发展。参考文献 [@ghost2024].',
        language: 'zh',
        checks: ['logic', 'style', 'citation'],
      },
      undefined,
      undefined,
      { cwd: process.cwd() },
    );

    assert.equal(response.isError, false);
    assert.match(response.content[0].text, /写作质量检查结果/);
    assert.equal(response.details.summary.byCategory.logic > 0, true);
    assert.equal(response.details.summary.byCategory.style > 0, true);
    assert.equal(response.details.summary.byCategory.citation > 0, true);
  });

  it('quality check falls back to network evidence when local evidence is missing', async () => {
    const oldFetch = globalThis.fetch;
    const requestedUrls = [];
    globalThis.fetch = async (url) => {
      requestedUrls.push(String(url));
      return {
        ok: true,
        async json() {
          return {
            message: {
              title: ['Learning Transferable Visual Models From Natural Language Supervision'],
              author: [{ given: 'Alec', family: 'Radford' }],
              issued: { 'date-parts': [[2021]] },
            },
          };
        },
      };
    };

    try {
      const output = await runWritingQualityCheck(
        {
          text: 'CLIP is a common baseline [@radford2021clip].',
          language: 'en',
          checks: ['citation'],
          bibliography: '@inproceedings{radford2021clip, title={Learning Transferable Visual Models From Natural Language Supervision}, author={Radford, Alec}, year={2021}, doi={10.48550/arXiv.2103.00020}}',
          citationProviders: ['doi'],
        },
        process.cwd(),
      );

      assert.equal(requestedUrls.some((url) => /10\.48550%2FarXiv\.2103\.00020/i.test(url)), true);
      assert.equal(output.details.citations[0].status, 'VERIFIED');
      assert.equal(output.details.summary.byCategory.citation, 0);
    } finally {
      globalThis.fetch = oldFetch;
    }
  });

  it('quality check honors explicit network disable when local evidence is missing', async () => {
    const oldFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return {
        ok: true,
        async json() {
          return { message: {} };
        },
      };
    };

    try {
      const output = await runWritingQualityCheck(
        {
          text: 'CLIP is a common baseline [@radford2021clip].',
          language: 'en',
          checks: ['citation'],
          bibliography: '@inproceedings{radford2021clip, title={Learning Transferable Visual Models From Natural Language Supervision}, author={Radford, Alec}, year={2021}, doi={10.48550/arXiv.2103.00020}}',
          allowNetwork: false,
          citationProviders: ['doi'],
        },
        process.cwd(),
      );

      assert.equal(calls, 0);
      assert.equal(output.details.citations[0].status, 'UNVERIFIED');
      assert.equal(output.details.summary.byCategory.citation, 1);
    } finally {
      globalThis.fetch = oldFetch;
    }
  });

  it('quality slash command honors --no-network when local evidence is missing', async () => {
    const api = makeExtensionApi();
    extension(api);
    const tempDir = mkdtempSync(join(tmpdir(), 'omp-writing-no-network-'));
    writeFileSync(
      join(tempDir, 'draft.md'),
      'CLIP is a common baseline [@radford2021clip].',
      'utf8',
    );
    writeFileSync(
      join(tempDir, 'draft.bib'),
      '@inproceedings{radford2021clip, title={Learning Transferable Visual Models From Natural Language Supervision}, author={Radford, Alec}, year={2021}, doi={10.48550/arXiv.2103.00020}}',
      'utf8',
    );
    const oldFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return {
        ok: true,
        async json() {
          return { message: {} };
        },
      };
    };

    try {
      const command = api.registerCommand.mock.calls[1].arguments[1];
      const result = await command.handler('draft.md --no-network', { cwd: tempDir });

      assert.equal(calls, 0);
      assert.equal(result.details.citations[0].status, 'UNVERIFIED');
      assert.equal(result.details.summary.byCategory.citation, 1);
    } finally {
      globalThis.fetch = oldFetch;
    }
  });

  it('quality check skips network lookup when local evidence already verifies a citation', async () => {
    const oldFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return {
        ok: true,
        async json() {
          return { message: {} };
        },
      };
    };

    try {
      const output = await runWritingQualityCheck(
        {
          text: 'CLIP is a common baseline [@radford2021clip].',
          language: 'en',
          checks: ['citation'],
          bibliography: '@inproceedings{radford2021clip, title={Learning Transferable Visual Models From Natural Language Supervision}, author={Radford, Alec}, year={2021}, doi={10.48550/arXiv.2103.00020}}',
          evidenceRecords: [
            {
              title: 'Learning Transferable Visual Models From Natural Language Supervision',
              authors: ['Alec Radford'],
              year: 2021,
              doi: '10.48550/arXiv.2103.00020',
              provider: 'local-literature',
            },
          ],
          allowNetwork: true,
          citationProviders: ['doi'],
        },
        process.cwd(),
      );

      assert.equal(calls, 0);
      assert.equal(output.details.citations[0].status, 'VERIFIED');
      assert.equal(output.details.citations[0].evidence.provider, 'local-literature');
    } finally {
      globalThis.fetch = oldFetch;
    }
  });

  it('quality slash command honors --disable-network alias when local evidence is missing', async () => {
    const api = makeExtensionApi();
    extension(api);
    const tempDir = mkdtempSync(join(tmpdir(), 'omp-writing-disable-network-'));
    writeFileSync(join(tempDir, 'draft.md'), 'CLIP is a common baseline [@radford2021clip].', 'utf8');
    const oldFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return {
        ok: true,
        async json() {
          return { message: {} };
        },
      };
    };

    try {
      const command = api.registerCommand.mock.calls[1].arguments[1];
      const result = await command.handler('draft.md --checks citation --disable-network', { cwd: tempDir });

      assert.equal(result.ok, true);
      assert.equal(calls, 0);
      assert.equal(result.details.citations[0].status, 'UNVERIFIED');
    } finally {
      globalThis.fetch = oldFetch;
    }
  });

  it('quality slash command uses only a path and discovers colocated evidence files', async () => {
    const api = makeExtensionApi();
    extension(api);
    const tempDir = mkdtempSync(join(tmpdir(), 'omp-writing-quality-'));
    writeFileSync(
      join(tempDir, 'draft.md'),
      'CLIP is a common baseline [@radford2021clip].',
      'utf8',
    );
    writeFileSync(
      join(tempDir, 'draft.bib'),
      '@inproceedings{radford2021clip, title={Learning Transferable Visual Models From Natural Language Supervision}, author={Radford, Alec and Kim, Jong Wook}, year={2021}, doi={10.48550/arXiv.2103.00020}}',
      'utf8',
    );
    writeFileSync(
      join(tempDir, 'literature.md'),
      [
        '## Learning Transferable Visual Models From Natural Language Supervision',
        '',
        '**Authors:** Alec Radford, Jong Wook Kim',
        '**Year:** 2021',
        'doi: 10.48550/arXiv.2103.00020',
      ].join('\n'),
      'utf8',
    );

    const command = api.registerCommand.mock.calls[1].arguments[1];
    const result = await command.handler('draft.md', { cwd: tempDir });

    assert.equal(result.ok, true);
    assert.equal(result.details.citations[0].status, 'VERIFIED');
    assert.equal(result.details.citations[0].evidence.provider, 'local-literature');
    assert.equal(result.details.summary.byCategory.citation, 0);
  });

  it('missing slash command input reports the simple path-only usage', async () => {
    const api = makeExtensionApi();
    extension(api);

    const command = api.registerCommand.mock.calls[1].arguments[1];
    const notifications = [];
    const result = await command.handler('', {
      cwd: process.cwd(),
      ui: { notify: (message, level) => notifications.push({ message, level }) },
    });

    assert.equal(result.ok, false);
    assert.match(result.report, /Usage: \/writing-quality paper\.md/);
    assert.doesNotMatch(result.report, /--checks/);
    assert.equal(notifications[0].level, 'error');
  });

  it('logic slash command reports simple path-only usage for missing input', async () => {
    const api = makeExtensionApi();
    extension(api);

    const command = api.registerCommand.mock.calls[0].arguments[1];
    const notifications = [];
    const result = await command.handler('', {
      cwd: process.cwd(),
      ui: { notify: (message, level) => notifications.push({ message, level }) },
    });

    assert.equal(result.ok, false);
    assert.match(result.report, /Usage: \/writing-logic paper\.md/);
    assert.equal(notifications[0].level, 'error');
  });

  it('logic check returns a structured load error for missing input', () => {
    const output = runWritingLogicCheck({}, process.cwd());

    assert.equal(output.ok, false);
    assert.match(output.report, /Either text or path is required/);
  });

  it('quality check returns a structured load error for missing input', async () => {
    const output = await runWritingQualityCheck({}, process.cwd());

    assert.equal(output.ok, false);
    assert.match(output.report, /Either text or path is required/);
  });

  it('quality check reports unreadable bibliography paths before analysis', async () => {
    const output = await runWritingQualityCheck(
      {
        text: 'CLIP is a common baseline [@radford2021clip].',
        bibliographyPath: 'missing.bib',
      },
      process.cwd(),
    );

    assert.equal(output.ok, false);
    assert.match(output.report, /Unable to read missing\.bib/);
  });

  it('quality check reports unreadable literature paths before analysis', async () => {
    const output = await runWritingQualityCheck(
      {
        text: 'CLIP is a common baseline [@radford2021clip].',
        literaturePath: 'missing-literature.md',
      },
      process.cwd(),
    );

    assert.equal(output.ok, false);
    assert.match(output.report, /Unable to read missing-literature\.md/);
  });

  it('logic slash command parses supported options and notifies success', async () => {
    const api = makeExtensionApi();
    extension(api);
    const tempDir = mkdtempSync(join(tmpdir(), 'omp-writing-logic-options-'));
    writeFileSync(
      join(tempDir, 'draft.md'),
      'Therefore, this method always solves every case.',
      'utf8',
    );

    const command = api.registerCommand.mock.calls[0].arguments[1];
    const notifications = [];
    const result = await command.handler('draft.md --redline --standard --lang en --max 1', {
      cwd: tempDir,
      ui: { notify: (message, level) => notifications.push({ message, level }) },
    });

    assert.equal(result.ok, true);
    assert.equal(result.details.language, 'en');
    assert.equal(result.details.mode, 'standard');
    assert.equal(result.details.issues.length, 1);
    assert.equal(notifications[0].level, 'info');
  });

  it('quality slash command parses checks, evidence paths, network, and providers', async () => {
    const api = makeExtensionApi();
    extension(api);
    const tempDir = mkdtempSync(join(tmpdir(), 'omp-writing-quality-options-'));
    writeFileSync(join(tempDir, 'draft.md'), 'Therefore, this method always solves every case.', 'utf8');
    writeFileSync(join(tempDir, 'refs.bib'), '', 'utf8');
    writeFileSync(join(tempDir, 'literature.md'), '', 'utf8');

    const command = api.registerCommand.mock.calls[1].arguments[1];
    const result = await command.handler(
      'draft.md --checks logic,style --bib refs.bib --literature literature.md --allow-network --citation-providers doi,arxiv',
      { cwd: tempDir },
    );

    assert.equal(result.ok, true);
    assert.deepEqual(result.details.checks, ['logic', 'style']);
    assert.equal(result.details.summary.byCategory.citation, 0);
  });

  it('quality slash command rejects unsupported checks', async () => {
    const api = makeExtensionApi();
    extension(api);
    const tempDir = mkdtempSync(join(tmpdir(), 'omp-writing-quality-invalid-check-'));
    writeFileSync(join(tempDir, 'draft.md'), 'Plain text.', 'utf8');

    const command = api.registerCommand.mock.calls[1].arguments[1];
    const result = await command.handler('draft.md --checks logic,bogus', { cwd: tempDir });

    assert.equal(result.ok, false);
    assert.match(result.report, /Unsupported writing checks: bogus/);
  });

  it('declares OMP extension metadata and Pi skill roots', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    );

    assert.equal(packageJson.name, 'writing-helper');
    assert.deepEqual(packageJson.omp?.extensions, ['./index.js']);
    assert.deepEqual(packageJson.pi?.skills, ['./skills']);
    assert.equal(packageJson.keywords.includes('omp-extension'), true);
    assert.equal(packageJson.keywords.includes('pi-package'), true);
    assert.equal(packageJson.keywords.includes('pi-extension'), false);
  });
});
