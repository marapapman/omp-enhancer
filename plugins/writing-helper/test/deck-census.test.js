import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

import { runWritingQualityCheck } from '../index.js';
import {
  DECK_LINE_KINDS,
  censusDeck,
  collectDeckSources,
  formatDeckCensusReport,
  parseDeck,
} from '../src/deck-census.js';
import { ZH_RULES, styleIssues } from '../src/style.js';

const MAIN_TEXT = [
  '% 主文件：封面 + 三个 input',
  '\\documentclass{beamer}',
  '\\title{计算概论：第四周讲义}',
  '\\subtitle{Advanced Programming}',
  '\\begin{document}',
  '\\begin{frame}[plain]{课程封面：递归}',
  '  \\titlepage',
  '\\end{frame}',
  '这一段写在帧外面，只用来覆盖分支。',
  '\\input{slides/a-frame}',
  '\\input{./slides/b-frame}',
  '\\input{nested/c-frame}',
  '\\input{}',
  '% \\input{slides/missing-frame}',
  '\\end{document}',
  '',
].join('\n');

const A_FRAME = [
  '% 用途说明：正例：冒号标题、冒号要点、图注、表格、代码块',
  '\\begin{frame}[shrink]{递归三要素：写递归前先问三个问题}',
  '\\begin{itemize}',
  '  \\item 三要素缺一不可：少了基线条件会无限递归。% 冒号要点 + 用数字打包',
  '  \\item 三项列举：甲、乙、丙三类都要写清楚。',
  '  \\item 定义句：递归是指函数调用自己。',
  '  \\item 栈记住当前节点，写死这个常量，锁死上限。',
  '  \\item 每个子问题只算一次，重复计算就白费了。',
  '\\end{itemize}',
  '同样一次查找，用不同的结构写出来代价并不一样。',
  '',
  '\\begin{tabularx}{\\textwidth}{XX}',
  '\\toprule',
  '键：值 & 说明 \\\\',
  '\\midrule',
  '列表 & 逐个比较 \\\\',
  '\\bottomrule',
  '\\end{tabularx}',
  '按什么去查决定了该用列表还是字典。',
  '',
  '\\begin{SlideCode}',
  'x = "引号里的：冒号不该被扫描"',
  '\\end{SlideCode}',
  '\\noteside 侧栏文字',
  '\\noteside',
  '\\figfull[0.9]{assets/x.pdf}{递归的三要素：先问三个问题，再动手写代码。}',
  '\\end{frame}',
  '',
].join('\n');

const B_FRAME = [
  '% 用途说明：跨页重复与图注复述',
  '\\begin{frame}[shrink]{Recursion basics}',
  '\\begin{itemize}',
  '  \\item 先一层层下去，再一层层上来，最后算出结果。',
  '  \\item 先一层层下去，再一层层上来。',
  '  \\item 每个子问题只算一次，重复的部分不必重算。',
  '\\end{itemize}',
  '\\figfull[0.9]{assets/x.pdf}{递归的调用过程：先一层层下去再一层层上来，最后算出结果。}',
  '\\end{frame}',
  '',
].join('\n');

const C_FRAME = [
  '% 用途说明：嵌套 input 目标、无标题帧、表格前后句',
  '\\begin{frame}[shrink]{缓存什么时候值得加}',
  '\\begin{itemize}',
  '  \\item 每个子问题只算一次，缓存才有意义。',
  '\\end{itemize}',
  '缓存命中就直接返回。',
  '\\begin{tabular}{cc}',
  '甲 & 乙 \\\\',
  '\\end{tabular}',
  '\\end{frame}',
  '',
  '\\begin{frame}[shrink]{表格前后没有句子}',
  '\\begin{itemize}',
  '  \\item 表里放的是结果。',
  '  \\item 表外不再补一句解释。',
  '  \\item 缓存命中就直接返回，不必再算。',
  '\\end{itemize}',
  '\\begin{tabular}{cc}',
  '丙 & 丁 \\\\',
  '\\end{tabular}',
  '\\end{frame}',
  '',
  '\\begin{frame}[shrink]{表后才有句子}',
  '\\begin{itemize}',
  '  \\item 表里先放两列结果。',
  '  \\item 缓存命中就直接返回，命中率才重要。',
  '\\end{itemize}',
  '\\begin{tabular}{cc}',
  '戊 & 己 \\\\',
  '\\end{tabular}',
  '表格后面才补一句说明。',
  '缓存命中就直接返回，缓存命中就直接返回。',
  '\\end{frame}',
  '',
  '\\begin{frame}',
  '没有标题的帧不进入统计。',
  '\\end{frame}',
  '',
].join('\n');

const root = mkdtempSync(join(tmpdir(), 'deck-census-'));
const deckPath = join(root, 'main.tex');
mkdirSync(join(root, 'slides'));
mkdirSync(join(root, 'nested'));
writeFileSync(deckPath, MAIN_TEXT);
writeFileSync(join(root, 'slides/a-frame.tex'), A_FRAME);
writeFileSync(join(root, 'slides/b-frame.tex'), B_FRAME);
writeFileSync(join(root, 'nested/c-frame.tex'), C_FRAME);

function shortPath(path) {
  return path.slice(root.length + 1);
}

function censusFixture() {
  return censusDeck({
    mainPath: deckPath,
    mainText: MAIN_TEXT,
    readFile: (path) => readFileSync(path, 'utf8'),
  });
}

function parseFixture(mainText, mainName = 'main.tex') {
  return parseDeck({ mainPath: join(root, mainName), mainText, readFile: () => '' });
}

after(() => rmSync(root, { recursive: true, force: true }));

test('collectDeckSources inlines inputs in order and keeps repeated inputs', () => {
  const files = {
    '/deck/slides/one.tex': 'one\n\\input{two}\n',
    '/deck/slides/two.tex': 'two\n',
  };
  const collected = collectDeckSources({
    mainPath: '/deck/main.tex',
    mainText: '\\input{slides/one}\n\\input{slides/two}\n\\input{slides/one}\n',
    readFile: (path) => files[path],
  });
  assert.equal(collected.ok, true);
  assert.deepEqual(
    collected.sources.map((source) => source.path),
    [
      '/deck/main.tex',
      '/deck/slides/one.tex',
      '/deck/slides/two.tex',
      '/deck/slides/two.tex',
      '/deck/slides/one.tex',
      '/deck/slides/two.tex',
    ],
  );
});

test('collectDeckSources resolves absolute names, relative names, and extensions', () => {
  const files = {
    '/abs/other.tex': 'absolute\n',
    '/deck/deep/leaf.tex': 'leaf\n',
  };
  const collected = collectDeckSources({
    mainPath: '/deck/main.tex',
    mainText: '\\include{/abs/other}\n\\input{deep/./leaf.tex}\n',
    readFile: (path) => files[path],
  });
  assert.equal(collected.ok, true);
  assert.deepEqual(
    collected.sources.map((source) => source.path),
    ['/deck/main.tex', '/abs/other.tex', '/deck/deep/leaf.tex'],
  );
});

test('collectDeckSources resolves inputs for a relative main path', () => {
  const collected = collectDeckSources({
    mainPath: 'main.tex',
    mainText: '\\input{child}\n',
    readFile: (path) => {
      assert.equal(path, 'child.tex');
      return '';
    },
  });
  assert.equal(collected.ok, true);
  assert.deepEqual(collected.sources.map((source) => source.path), ['main.tex', 'child.tex']);
});

test('collectDeckSources reports cycles, unreadable inputs, and non-text content', () => {
  const cycle = collectDeckSources({
    mainPath: '/deck/main.tex',
    mainText: '\\input{child}\n',
    readFile: (path) => (path === '/deck/child.tex' ? '\\input{../deck/main}\n' : ''),
  });
  assert.equal(cycle.ok, false);
  assert.match(cycle.error, /Circular \\input detected: \/deck\/main\.tex/u);

  const missing = collectDeckSources({
    mainPath: '/deck/main.tex',
    mainText: '\\input{child}\n',
    readFile: () => {
      throw new Error('ENOENT');
    },
  });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /Unable to read \/deck\/child\.tex: ENOENT/u);

  const nonText = collectDeckSources({
    mainPath: '/deck/main.tex',
    mainText: '\\input{child}\n',
    readFile: () => Buffer.from('bytes'),
  });
  assert.equal(nonText.ok, false);
  assert.match(nonText.error, /expected text content/u);

  const thrownString = collectDeckSources({
    mainPath: '/deck/main.tex',
    mainText: '\\input{child}\n',
    readFile: () => {
      throw 'boom';
    },
  });
  assert.equal(thrownString.ok, false);
  assert.match(thrownString.error, /Unable to read \/deck\/child\.tex: boom/u);
});

test('censusDeck classifies lines, frames, and deck-level metrics', () => {
  const census = censusFixture();
  assert.equal(census.ok, true);
  assert.deepEqual(census.sources.map((source) => shortPath(source.path)), [
    'main.tex',
    'slides/a-frame.tex',
    'slides/b-frame.tex',
    'nested/c-frame.tex',
  ]);

  const { metrics } = census;
  assert.equal(metrics.frameCount, 6);
  assert.equal(metrics.bulletFrameCount, 5);
  assert.equal(metrics.bulletCount, 14);
  assert.deepEqual(metrics.bulletCounts, { 0: 1, 1: 1, 2: 1, 3: 2, 5: 1 });
  assert.equal(metrics.dominantBulletCount, 3);
  assert.equal(metrics.dominantBulletFrames, 2);
  assert.ok(Math.abs(metrics.dominantShare - 1 / 3) < 1e-9);
  assert.equal(metrics.titleCount, 6);
  assert.equal(metrics.colonTitleCount, 2);
  assert.equal(metrics.captionCount, 2);
  assert.equal(metrics.colonCaptionCount, 2);
  assert.equal(metrics.colonCaptionShare, 1);
  assert.deepEqual(metrics.colonBullets, { total: 3, shortPrefixCount: 3, shortPrefixLimit: 12 });

  const kinds = new Map(census.lines.map((line) => [`${shortPath(line.path)}:${line.line}`, line.kind]));
  assert.equal(kinds.get('main.tex:3'), DECK_LINE_KINDS.title);
  assert.equal(kinds.get('main.tex:6'), DECK_LINE_KINDS.title);
  assert.equal(kinds.get('main.tex:13'), DECK_LINE_KINDS.other);
  assert.equal(kinds.get('slides/a-frame.tex:1'), DECK_LINE_KINDS.comment);
  assert.equal(kinds.get('slides/a-frame.tex:4'), DECK_LINE_KINDS.bullet);
  assert.equal(kinds.get('slides/a-frame.tex:14'), DECK_LINE_KINDS.tableCell);
  assert.equal(kinds.get('slides/a-frame.tex:22'), DECK_LINE_KINDS.code);
  assert.equal(kinds.get('slides/a-frame.tex:24'), DECK_LINE_KINDS.noteside);
  assert.equal(kinds.get('slides/a-frame.tex:25'), DECK_LINE_KINDS.other);
  assert.equal(kinds.get('slides/a-frame.tex:27'), DECK_LINE_KINDS.other);

  const bullet = census.lines.find((line) => line.kind === DECK_LINE_KINDS.bullet);
  assert.deepEqual(bullet, {
    path: join(root, 'slides/a-frame.tex'),
    line: 4,
    kind: 'bullet',
    raw: '  \\item 三要素缺一不可：少了基线条件会无限递归。% 冒号要点 + 用数字打包',
    text: '三要素缺一不可：少了基线条件会无限递归。',
  });
  const noteside = census.lines.find((line) => line.kind === DECK_LINE_KINDS.noteside);
  assert.equal(noteside.text, '侧栏文字');
  const codeLine = census.lines.find((line) => line.kind === DECK_LINE_KINDS.code);
  assert.equal(codeLine.text, 'x = "引号里的：冒号不该被扫描"');

  const cover = census.frames[0];
  assert.equal(cover.isTitlePage, true);
  assert.equal(cover.title, '课程封面：递归');
  assert.equal(cover.bullets.length, 0);
  const aFrame = census.frames[1];
  assert.equal(aFrame.hasTable, true);
  assert.deepEqual(aFrame.tableCells.map((cell) => cell.text), ['键：值 说明', '列表 逐个比较']);
  assert.deepEqual(aFrame.paragraphLines.map((line) => line.text), [
    '同样一次查找，用不同的结构写出来代价并不一样。',
    '按什么去查决定了该用列表还是字典。',
  ]);
  assert.deepEqual(metrics.tableScaffolding, [
    {
      frameIndex: 2,
      path: join(root, 'slides/a-frame.tex'),
      before: { path: join(root, 'slides/a-frame.tex'), line: 10, text: '同样一次查找，用不同的结构写出来代价并不一样。' },
      after: { path: join(root, 'slides/a-frame.tex'), line: 19, text: '按什么去查决定了该用列表还是字典。' },
    },
    {
      frameIndex: 4,
      path: join(root, 'nested/c-frame.tex'),
      before: { path: join(root, 'nested/c-frame.tex'), line: 6, text: '缓存命中就直接返回。' },
      after: null,
    },
    { frameIndex: 5, path: join(root, 'nested/c-frame.tex'), before: null, after: null },
    {
      frameIndex: 6,
      path: join(root, 'nested/c-frame.tex'),
      before: null,
      after: { path: join(root, 'nested/c-frame.tex'), line: 31, text: '表格后面才补一句说明。' },
    },
  ]);
});

test('censusDeck reports repeated phrases and caption echoes', () => {
  const census = censusFixture();
  const { metrics } = census;

  const repeated = metrics.repeatedPhrases.find((group) => group.phrase === '每个子问题只算一次');
  assert.ok(repeated, 'expected the repeated phrase to be reported');
  assert.equal(repeated.frameCount, 3);
  assert.deepEqual(repeated.occurrences, [
    { path: join(root, 'slides/a-frame.tex'), line: 8 },
    { path: join(root, 'slides/b-frame.tex'), line: 6 },
    { path: join(root, 'nested/c-frame.tex'), line: 4 },
  ]);

  assert.equal(metrics.captionEchoes.length, 2);
  const [titleEcho, bulletEcho] = metrics.captionEchoes;
  assert.deepEqual(titleEcho.caption, {
    path: join(root, 'slides/a-frame.tex'),
    line: 26,
    text: '递归的三要素：先问三个问题，再动手写代码。',
  });
  assert.equal(titleEcho.target.kind, 'title');
  assert.equal(titleEcho.target.line, 2);
  assert.equal(titleEcho.target.text, '递归三要素：写递归前先问三个问题');
  assert.ok(Math.abs(titleEcho.overlap - 8 / 13) < 1e-9);

  assert.equal(bulletEcho.caption.text, '递归的调用过程：先一层层下去再一层层上来，最后算出结果。');
  assert.equal(bulletEcho.target.kind, 'bullet');
  assert.equal(bulletEcho.target.line, 4);
  assert.equal(bulletEcho.overlap, 1);
});

test('censusDeck reports per-line rule hits with quotes and suggestions', () => {
  const census = censusFixture();
  const hits = census.metrics.ruleHits;
  const patterns = new Set(hits.map((hit) => hit.pattern));
  assert.ok(patterns.has('zh-colon-claim'));
  assert.ok(patterns.has('zh-number-bundling'));
  assert.ok(patterns.has('zh-x-decides-y'));

  const colonHits = hits.filter((hit) => hit.pattern === 'zh-colon-claim');
  assert.deepEqual(colonHits.map((hit) => `${shortPath(hit.path)}:${hit.line}`), [
    'main.tex:3',
    'main.tex:6',
    'slides/a-frame.tex:2',
    'slides/a-frame.tex:4',
    'slides/a-frame.tex:26',
    'slides/b-frame.tex:8',
  ]);
  for (const hit of colonHits) {
    assert.equal(hit.quote, '：');
    assert.match(hit.problem, /冒号/u);
    assert.match(hit.suggestion, /列举/u);
  }

  const keys = hits.map((hit) => `${shortPath(hit.path)}:${hit.line}:${hit.pattern}`);
  assert.ok(!keys.some((key) => key.startsWith('slides/a-frame.tex:22')), 'SlideCode bodies are never scanned');
  assert.ok(!keys.some((key) => key.startsWith('slides/a-frame.tex:1:')), 'comment lines are never scanned');
  assert.ok(!keys.includes('slides/a-frame.tex:14:zh-colon-claim'), 'table cells are exempt from colon claims');
  assert.ok(!keys.includes('slides/a-frame.tex:7:zh-didactic-cognition'), 'literal 栈记住 is not an imperative');
  assert.ok(!keys.includes('slides/a-frame.tex:5:zh-colon-claim'), '3+ item enumerations keep their colon');
  assert.ok(!keys.includes('slides/a-frame.tex:6:zh-colon-claim'), 'definition shapes keep their colon');
  assert.equal(hits.filter((hit) => hit.pattern === 'zh-colloquial-judgement').length, 0);
});

test('formatDeckCensusReport renders every section and the error case', () => {
  const report = formatDeckCensusReport(censusFixture());
  assert.match(report, /^全稿 AI 味统计（deck census）/u);
  assert.match(report, /来源：4 个文件/u);
  assert.match(report, /帧：6，其中带要点 5 帧（83\.3%）/u);
  assert.match(report, /每帧要点条数：3 条 2 帧、5 条 1 帧、2 条 1 帧、1 条 1 帧、0 条 1 帧；最常见 3 条 2 帧（33\.3%）/u);
  assert.match(report, /标题：6 个，含冒号 2 个/u);
  assert.match(report, /图注：2 条，含冒号 2 条（100\.0%）/u);
  assert.match(report, /要点：14 条，含冒号 3 条，其中冒号前不超过 12 字 3 条/u);
  assert.match(report, /逐行规则命中：\d+ 条/u);
  assert.match(report, /跨页重复短语（≥6 汉字，≥3 帧）：2 组/u);
  assert.match(report, /3 帧 ×「每个子问题只算一次」/u);
  assert.match(report, /3 帧 ×「缓存命中就直接返回」/u);
  assert.match(report, /图注复述（二字片段重合率 ≥0\.5）：2 条/u);
  assert.match(report, /表格前后套话：2 帧有表前句，其中 1 帧表前表后都有/u);
  assert.match(report, /表前「缓存命中就直接返回。」\(.*nested\/c-frame\.tex:6\)；表后无/u);
  assert.match(report, /表前无；表后「表格后面才补一句说明。」\(.*nested\/c-frame\.tex:31\)/u);

  assert.match(formatDeckCensusReport({ ok: false, error: 'boom' }), /全稿 AI 味统计失败：boom/u);
  assert.match(formatDeckCensusReport(undefined), /未知错误/u);
});

test('censusDeck handles decks without frames, captions, or tables', () => {
  const census = censusDeck({
    mainPath: join(root, 'empty.tex'),
    mainText: '\\documentclass{beamer}\n% 空文档\n',
    readFile: () => '',
  });
  assert.equal(census.ok, true);
  assert.equal(census.metrics.frameCount, 0);
  assert.equal(census.metrics.bulletFrameCount, 0);
  assert.equal(census.metrics.bulletCount, 0);
  assert.deepEqual(census.metrics.bulletCounts, {});
  assert.equal(census.metrics.dominantBulletCount, 0);
  assert.equal(census.metrics.dominantShare, 0);
  assert.equal(census.metrics.colonCaptionShare, 0);
  assert.deepEqual(census.metrics.repeatedPhrases, []);
  assert.deepEqual(census.metrics.captionEchoes, []);
  assert.deepEqual(census.metrics.tableScaffolding, []);
  assert.deepEqual(census.metrics.ruleHits, []);
  const report = formatDeckCensusReport(census);
  assert.match(report, /帧：0，其中带要点 0 帧（0\.0%）/u);
  assert.match(report, /逐行规则命中：0 条/u);
  assert.match(report, /跨页重复短语：0 组/u);
  assert.match(report, /图注复述：0 条/u);
  assert.match(report, /表格前后套话：0 帧/u);
});

test('parseDeck tolerates malformed frames, captions, and environments', () => {
  const mainText = [
    '\\title{未闭合的标题',
    '\\subtitle',
    '\\begin{frame}',
    '标题缺失的帧不进入统计。',
    '\\end{frame}',
    '\\begin{frame}[未闭合的可选项',
    '\\end{frame}',
    '\\begin{frame}{未闭合的标题',
    '\\end{frame}',
    '\\begin{frame}{有标题的帧}',
    '\\figfull',
    '\\figfull{a',
    '\\figfull{a}',
    '\\figfull{a}{b',
    '\\figfull[0.9{a}{b}',
    '\\figfull[0.9]{a}{标题：完整图注}',
    '\\begin{tximg}{a}{图片在左：图注}',
    '\\end{tximg}',
    '\\begin{imgtx}{a}{图片在右：图注}',
    '\\end{imgtx}',
    '\\begin{SlideCode}',
    '代码：不该被扫描',
    '\\end{SlideCode}',
    '\\end{SlideCode}',
    '\\end{frame}',
    '',
  ].join('\n');
  const parsed = parseFixture(mainText);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.frames.length, 1);
  const frame = parsed.frames[0];
  assert.equal(frame.title, '有标题的帧');
  assert.deepEqual(frame.captions.map((caption) => caption.text), ['标题：完整图注', '图片在左：图注', '图片在右：图注']);
  assert.equal(parsed.lines.filter((line) => line.kind === DECK_LINE_KINDS.code).length, 1);
  assert.equal(parsed.lines.filter((line) => line.kind === DECK_LINE_KINDS.other).length, 21);
  assert.equal(parsed.lines.filter((line) => line.kind === DECK_LINE_KINDS.comment).length, 0);
  assert.equal(frame.isTitlePage, false);
});

test('parseDeck classifies paragraphs, table cells, and nested tables', () => {
  const mainText = [
    '\\begin{frame}{段落与表格}',
    '{花括号开头的行不算段落}',
    '',
    '\\vspace{2pt}',
    '这是段落。',
    '\\begin{tabular}{cc}',
    '甲 & 乙 \\\\',
    '\\begin{array}{c}',
    '丙 \\\\',
    '\\end{array}',
    '\\end{tabular}',
    '\\end{frame}',
    '',
  ].join('\n');
  const frame = parseFixture(mainText).frames[0];
  assert.equal(frame.hasTable, true);
  assert.deepEqual(frame.paragraphLines.map((line) => line.text), ['这是段落。']);
  assert.deepEqual(frame.tableCells.map((cell) => cell.text), ['甲 乙', '丙']);
});

test('parseDeck keeps repeated windows sharing a frame set maximal', () => {
  const mainText = ['甲', '乙', '丙'].map((label, index) => [
    `\\begin{frame}{第${index}帧}`,
    '\\begin{itemize}',
    `  \\item ${label}每一个子问题只算一次就够了。`,
    '\\end{itemize}',
    '\\end{frame}',
    '',
  ].join('\n')).join('\n');
  const census = censusDeck({ mainPath: join(root, 'repeat.tex'), mainText, readFile: () => '' });
  assert.equal(census.ok, true);
  assert.equal(census.metrics.repeatedPhrases.length, 1);
  assert.equal(census.metrics.repeatedPhrases[0].phrase, '每一个子问题只算一次就够了');
  assert.equal(census.metrics.repeatedPhrases[0].frameCount, 3);
});

test('parseDeck and censusDeck surface collection errors', () => {
  const args = {
    mainPath: join(root, 'broken.tex'),
    mainText: '\\input{missing}\n',
    readFile: () => {
      throw new Error('ENOENT');
    },
  };
  assert.equal(parseDeck(args).ok, false);
  const census = censusDeck(args);
  assert.equal(census.ok, false);
  assert.match(formatDeckCensusReport(census), /Unable to read/u);
});

test('runWritingQualityCheck switches to deck mode for decks with inputs', async () => {
  const output = await runWritingQualityCheck({ path: deckPath }, root);
  assert.equal(output.ok, true);
  assert.match(output.report, /全稿 AI 味统计（deck census）/u);
  assert.equal(output.details.deck.metrics.frameCount, 6);

  const broken = join(root, 'broken.tex');
  writeFileSync(broken, '\\input{missing-frame}\n');
  const failed = await runWritingQualityCheck({ path: broken }, root);
  assert.equal(failed.ok, false);
  assert.match(failed.report, /Unable to read/u);
  assert.equal(failed.details.error, failed.report);
});

test('runWritingQualityCheck switches to deck mode for \\include-only decks', async () => {
  const includePath = join(root, 'include.tex');
  writeFileSync(includePath, '\\include{slides/a-frame}\n');
  const output = await runWritingQualityCheck({ path: includePath }, root);
  assert.equal(output.ok, true);
  assert.equal(output.details.deck.metrics.frameCount, 1);
});

test('styleIssues reports the new Chinese AI-tell rules per line', () => {
  const patterns = new Set(ZH_RULES.map((rule) => rule.pattern));
  for (const pattern of [
    'zh-colon-claim',
    'zh-negation-couplet-variant',
    'zh-pseudo-profound',
    'zh-number-bundling',
    'zh-x-decides-y',
    'zh-colloquial-judgement',
    'zh-didactic-cognition',
  ]) {
    assert.ok(patterns.has(pattern), `${pattern} should be exported`);
  }

  const colon = styleIssues('三要素缺一不可：少了基线条件会无限递归。', 'zh');
  assert.deepEqual(colon.map((issue) => issue.pattern), ['zh-colon-claim', 'zh-number-bundling']);
  assert.equal(colon[0].severity, 'IMPORTANT');
  assert.equal(colon[0].quote, '：');

  const colonOnly = (text) => styleIssues(text, 'zh').filter((issue) => issue.pattern === 'zh-colon-claim');
  assert.equal(colonOnly('三项列举：甲、乙、丙三类都要写清楚。').length, 0);
  assert.equal(colonOnly('定义句：递归是指函数调用自己。').length, 0);
  assert.equal(colonOnly('公式：$a = b + c$ 就是全部。').length, 0);
  assert.equal(colonOnly('代码：\\texttt{n <= 1} 是基线。').length, 0);
  assert.equal(colonOnly('输出：\\begin{SlideCode} 里的内容。').length, 0);
  assert.equal(colonOnly('判定：定义为空则跳过。').length, 0);
  assert.equal(colonOnly('结论：先压栈再返回。').length, 1);

  const matches = (text, pattern) => styleIssues(text, 'zh').filter((issue) => issue.pattern === pattern).length;
  assert.equal(matches('结果并不在快而在稳。', 'zh-negation-couplet-variant'), 1);
  assert.equal(matches('差别不在于写法而在于数据结构。', 'zh-negation-couplet-variant'), 1);
  assert.equal(matches('核心思想是先把问题变小。', 'zh-pseudo-profound'), 1);
  assert.equal(matches('这其实是同一件事。', 'zh-pseudo-profound'), 1);
  assert.equal(matches('本质上是规模问题。', 'zh-pseudo-profound'), 1);
  assert.equal(matches('这三件事缺一不可。', 'zh-number-bundling'), 1);
  assert.equal(matches('这三处都要检查。', 'zh-number-bundling'), 1);
  assert.equal(matches('两大类别各有取舍。', 'zh-number-bundling'), 1);
  assert.equal(matches('循环层数决定量级。', 'zh-x-decides-y'), 1);
  assert.equal(matches('规模决定了常数的大小。', 'zh-x-decides-y'), 1);
  assert.equal(matches('一眼看出谁更快。', 'zh-colloquial-judgement'), 1);
  assert.equal(matches('这两种写法又快又稳。', 'zh-colloquial-judgement'), 1);
  assert.equal(matches('请注意这里的顺序。', 'zh-didactic-cognition'), 1);
  assert.equal(matches('请记住这个结论。', 'zh-didactic-cognition'), 1);
  assert.equal(matches('定死这个顺序。', 'zh-didactic-cognition'), 1);
  assert.equal(matches('栈记住当前节点。', 'zh-didactic-cognition'), 0);
  assert.equal(matches('这个常量写死，上限锁死，范围框死。', 'zh-didactic-cognition'), 0);
  assert.equal(matches('三要素与三部分的关系。', 'zh-number-bundling'), 0);
  assert.equal(matches('两个条件都要满足。', 'zh-number-bundling'), 0);
  assert.equal(styleIssues('English text only.', 'zh').length, 0);
});
