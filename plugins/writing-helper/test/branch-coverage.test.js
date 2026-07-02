import { strict as assert } from 'node:assert';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, mock } from 'node:test';

import extension, { runWritingQualityCheck } from '../index.js';
import { analyzeWritingLogic } from '../src/analyzer.js';
import { fetchExternalCitationEvidence, parseLocalLiteratureRecords, verifyCitations } from '../src/citations.js';
import { loadWritingLogicDocument } from '../src/document-loader.js';
import { analyzeWritingQuality } from '../src/quality.js';
import { formatWritingLogicReport, formatWritingQualityReport } from '../src/report.js';

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
    registerTool: mock.fn(),
    registerCommand: mock.fn(),
    zod: makeZodApi(),
  };
}

describe('coverage branch cases', () => {
  it('exercises command parser defaults and optional execution fallbacks', async () => {
    const api = makeExtensionApi();
    extension(api);

    const logicTool = api.registerTool.mock.calls[0].arguments[0];
    const qualityTool = api.registerTool.mock.calls[1].arguments[0];
    const logicCommand = api.registerCommand.mock.calls[0].arguments[1];
    const qualityCommand = api.registerCommand.mock.calls[1].arguments[1];

    assert.equal((await logicTool.execute()).isError, true);
    assert.equal((await qualityTool.execute()).isError, true);
    assert.equal((await logicCommand.handler()).ok, false);
    assert.equal((await qualityCommand.handler()).ok, false);

    const tempDir = mkdtempSync(join(tmpdir(), 'omp-writing-branch-'));
    writeFileSync(join(tempDir, 'draft.md'), 'CLIP is a common baseline [@missing].', 'utf8');
    const notifications = [];
    const result = await qualityCommand.handler('draft.md --lang auto --max nope --checks', {
      cwd: tempDir,
      ui: { notify: (message, level) => notifications.push({ message, level }) },
    });

    assert.equal(result.ok, true);
    assert.equal(result.details.language, 'en');
    assert.deepEqual(result.details.checks, ['logic', 'style', 'citation']);
    assert.equal(notifications[0].level, 'info');

    const toolOutput = await logicTool.execute('id', { text: 'A scoped claim.' }, undefined, undefined, { cwd: tempDir });
    assert.equal(toolOutput.isError, false);

    const logicResult = await logicCommand.handler('draft.md --standard --lang en --max 1', { cwd: tempDir });
    assert.equal(logicResult.ok, true);

    const qualityResult = await qualityCommand.handler('draft.md --checks logic,style --max 1 --allow-network', { cwd: tempDir });
    assert.deepEqual(qualityResult.details.checks, ['logic', 'style']);
  });

  it('exercises analyzer boundary branches', () => {
    assert.equal(analyzeWritingLogic({ text: undefined, maxIssues: Number.NaN }).summary.verdict, 'pass');
    assert.equal(analyzeWritingLogic({ text: 'Accuracy is 91%. Accuracy is 87%.', language: 'en' }).issues[0].severity, 'CRITICAL');
    assert.equal(analyzeWritingLogic({ text: 'On this dataset, accuracy is significant.', language: 'en' }).summary.verdict, 'pass');
    assert.equal(analyzeWritingLogic({ text: '知识图谱（KG）已经定义。', language: 'zh', mode: 'standard' }).summary.verdict, 'pass');
    assert.equal(analyzeWritingLogic({ text: '知识图谱 和 KG 同时出现。', language: 'en', mode: 'standard' }).issues[0].severity, 'IMPORTANT');
    assert.equal(analyzeWritingLogic({ text: '本文提出一种方法。', language: 'zh', mode: 'standard' }).issues[0].location, '全文');
    assert.equal(analyzeWritingLogic({ text: '因此该方法必然有效。', language: 'zh', mode: 'standard' }).issues.some((issue) => issue.dimension === 'logic'), true);
    assert.equal(analyzeWritingLogic({ text: '因此，因为实验显示，该方法必然有效。', language: 'zh', mode: 'standard' }).issues.some((issue) => issue.dimension === 'logic'), false);
    assert.equal(analyzeWritingLogic({ text: 'This method is always best.', language: 'en', mode: 'standard' }).issues.some((issue) => issue.dimension === 'evidence'), true);
    assert.equal(analyzeWritingLogic({ text: '该方法显著提升效果。', language: 'zh', mode: 'standard' }).issues[0].severity, 'WARNING');
    assert.equal(analyzeWritingLogic({ text: '知识图谱 和 KG 同时出现。', language: 'zh', mode: 'standard' }).issues[0].severity, 'WARNING');
    assert.equal(analyzeWritingLogic({ text: 'Therefore, this method always works because experiment data shows it.', language: 'en', mode: 'standard' }).issues.some((issue) => issue.dimension === 'logic'), false);
  });

  it('exercises citation parsing and evidence edge branches', async () => {
    const duplicate = verifyCitations({ text: 'See [@same] and [@same].', bibliography: '', evidenceRecords: [] });
    assert.equal(duplicate.citations.length, 1);

    const keyEvidence = verifyCitations({
      text: 'See [@paper].',
      bibliography: '@article{paper, title={A Title}, author={Li}, year={2024}}',
      evidenceRecords: [{ key: 'paper', title: 'A Title', authors: ['Li'], year: 2024, provider: 'local' }],
    });
    assert.equal(keyEvidence.citations[0].status, 'VERIFIED');

    const arxivEvidence = verifyCitations({
      text: 'See [@clip].',
      bibliography: '@article{clip, title={CLIP}, author={Radford, Alec}, year={2021}, eprint={2103.00020}}',
      evidenceRecords: [{ arxiv: '2103.00020', title: 'CLIP', authors: ['Alec Radford'], year: 2021, provider: 'local' }],
    });
    assert.equal(arxivEvidence.citations[0].status, 'VERIFIED');

    const zhMismatch = verifyCitations({
      text: '引用 [@bad]。',
      bibliography: '@article{bad, title={A}, author={Li}, year={2024}}',
      evidenceRecords: [{ id: 'bad', title: 'B', authors: ['Li'], year: 2024, provider: 'local' }],
      language: 'zh',
    });
    assert.match(zhMismatch.issues[0].problem, /引用元数据/);

    const records = parseLocalLiteratureRecords(['## Untyped Record', '', 'Year: 2024', '', '## No Metadata'].join('\n'));
    assert.deepEqual(records.map((record) => record.year), [2024, undefined]);
    assert.deepEqual(records[1].authors, []);

    assert.deepEqual(await fetchExternalCitationEvidence({ allowNetwork: true, fetchImpl: undefined }), []);
    assert.deepEqual(await fetchExternalCitationEvidence({ text: 'See DOI: 10.1145/1.', allowNetwork: true, fetchImpl: async () => ({ ok: false, async json() { return {}; } }) }), []);
    assert.deepEqual(await fetchExternalCitationEvidence({ text: 'See arXiv:2103.00020.', allowNetwork: true, citationProviders: ['arxiv'], fetchImpl: async () => ({ ok: false, async text() { return ''; } }) }), []);
    assert.deepEqual(await fetchExternalCitationEvidence({ text: 'See arXiv:2103.00020.', allowNetwork: true, citationProviders: ['arxiv'], fetchImpl: async () => ({ ok: true, async text() { return '<feed></feed>'; } }) }), []);
    const sparseArxiv = await fetchExternalCitationEvidence({ text: 'See arXiv:2103.00020.', allowNetwork: true, citationProviders: ['arxiv'], fetchImpl: async () => ({ ok: true, async text() { return '<feed><entry><author><name>Alec Radford</name></author></entry></feed>'; } }) });
    assert.equal(sparseArxiv[0].title, undefined);
    assert.equal(sparseArxiv[0].year, undefined);
    const stringTitleDoi = await fetchExternalCitationEvidence({ text: 'See DOI: 10.1145/3366423.3380124', allowNetwork: true, citationProviders: ['crossref'], fetchImpl: async () => ({ ok: true, async json() { return { message: { title: 'Plain Title', issued: { 'date-parts': [[2024]] } } }; } }) });
    assert.equal(stringTitleDoi[0].title, 'Plain Title');

    const authorsRecord = parseLocalLiteratureRecords([
      '## Authored Record',
      '',
      '**Authors:** Alice, Bob and Carol',
      '**Year:** 2024',
      'doi: 10.1145/3366423.3380124',
    ].join('\n'));
    assert.deepEqual(authorsRecord[0].authors, ['Alice', 'Bob', 'Carol']);

    const defaultProviders = await fetchExternalCitationEvidence({
      text: 'See DOI: 10.1145/3366423.3380124',
      allowNetwork: true,
      fetchImpl: async () => ({ ok: true, async json() { return { message: { title: ['Array Title'], author: [{ family: 'Radford' }], published: { 'date-parts': [[2025]] } } }; } }),
    });
    assert.equal(defaultProviders[0].year, 2025);

    assert.deepEqual(await fetchExternalCitationEvidence({
      text: 'See DOI: 10.1145/3366423.3380124',
      allowNetwork: true,
      citationProviders: ['doi'],
      fetchImpl: async () => ({ ok: true, async json() { return {}; } }),
    }), []);

    assert.deepEqual(await fetchExternalCitationEvidence({
      text: 'See [@unknown].',
      bibliography: '',
      allowNetwork: true,
      citationProviders: ['doi'],
      fetchImpl: async () => ({ ok: false, async json() { return {}; } }),
    }), []);

    assert.deepEqual(await fetchExternalCitationEvidence({
      text: 'See [@noids].',
      bibliography: '@article{noids, title={No ids}, author={Li}, year={2024}}',
      allowNetwork: true,
      citationProviders: ['doi'],
      fetchImpl: async () => ({ ok: false, async json() { return {}; } }),
    }), []);
  });

  it('exercises document loader and quality defensive branches', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'omp-writing-loader-'));
    const absolutePath = join(tempDir, 'draft.md');
    writeFileSync(absolutePath, 'plain text', 'utf8');
    assert.equal(loadWritingLogicDocument({ path: absolutePath }, process.cwd()).source, absolutePath);

    const invalidQuality = analyzeWritingQuality({ text: 'plain text', checks: ['unknown'], maxIssues: Number.NaN });
    assert.equal(invalidQuality.summary.verdict, 'pass');
    assert.equal(analyzeWritingQuality().mode, 'redline');

    const cappedQuality = analyzeWritingQuality({
      text: 'A —— B。近年来，随着技术快速发展。引用 [@missing]。',
      language: 'zh',
      checks: ['style'],
      maxIssues: 1,
    });
    assert.equal(cappedQuality.issues.length, 1);
    assert.equal(cappedQuality.summary.returned, 1);

    const output = await runWritingQualityCheck({ text: 'See [@missing].', checks: ['citation'], evidenceRecords: 'not-array', allowNetwork: false }, process.cwd());
    assert.equal(output.details.citations[0].status, 'UNVERIFIED');
  });

  it('exercises report omission and category default branches', () => {
    const zhLogic = formatWritingLogicReport({
      language: 'zh',
      summary: { total: 2 },
      issues: [{ dimension: 'logic', severity: 'WARNING', location: '第 1 段', problem: '问题', quote: '原文', suggestion: '建议' }],
    });
    assert.match(zhLogic, /另有 1 个问题未显示。/);

    const enQuality = formatWritingQualityReport({
      language: 'en',
      summary: { total: 2, byCategory: { logic: 1, style: 1, citation: 0 } },
      issues: [{ dimension: 'style', severity: 'IMPORTANT', location: 'paragraph 1', problem: 'Problem', quote: 'Quote', suggestion: 'Fix' }],
    });
    assert.match(enQuality, /1 additional issue\(s\) omitted\./);

    const zhDefaults = formatWritingQualityReport({
      language: 'zh',
      summary: { total: 1, byCategory: {} },
      issues: [{ dimension: 'style', severity: 'WARNING', location: '第 1 段', problem: '问题', quote: '原文', suggestion: '建议' }],
    });
    assert.match(zhDefaults, /摘要：逻辑 0，风格 0，引用 0。/);
  });
});
