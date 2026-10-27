import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import { describe, it } from 'node:test';

import {
  computeAiScore,
  computeSentenceStats,
  computeStyleProfile,
  connectiveStats,
  detectNeatMetaphors,
  detectParallelRuns,
  formatAiScanReport,
  movingAverageTypeTokenRatio,
  normalizedEntropy,
  parseBaseline,
  repeatedNgrams,
  scanAiStyle,
  scoreBand,
  scoreWordHabits,
  segmentWords,
  shannonEntropy,
  splitSentences,
} from '../src/ai-scan.js';

function metrics(overrides = {}) {
  return {
    sentence: { count: 10, coefficientOfVariation: 0.5 },
    openings: { entropy: 0.9 },
    connectives: { density: 2, entropy: 0.9 },
    ngrams: { ratio: 0 },
    parallelism: { rate: 0, score: 0 },
    metaphor: { rate: 0, score: 0 },
    wordHabits: { maxZ: 0 },
    ...overrides,
  };
}

describe('AI scan tokenization and sentence splitting', () => {
  it('segments English words and Chinese characters with or without a segmenter', () => {
    assert.deepEqual(segmentWords('Hello, world!', 'en'), ['Hello', 'world']);
    assert.deepEqual(segmentWords('', 'en'), []);
    assert.deepEqual(segmentWords(undefined, 'en'), []);
    assert.deepEqual(segmentWords('你好，world！', 'zh', null), ['你', '好', 'world']);
    assert.equal(segmentWords('中文写作', 'zh').length > 0, true);
    assert.equal(segmentWords('你好，世界！', 'zh').length > 0, true);
  });

  it('splits English and Chinese sentences and protects common abbreviations', () => {
    assert.deepEqual(splitSentences('A e.g. this. B et al. that.', 'en'), [
      'A e.g. this.',
      'B et al. that.',
    ]);
    assert.deepEqual(splitSentences('First line\nSecond line', 'en'), ['First line', 'Second line']);
    assert.deepEqual(splitSentences('中文。第二句！', 'zh'), ['中文。', '第二句！']);
    assert.deepEqual(splitSentences('第一行\n第二行', 'zh'), ['第一行', '第二行']);
    assert.deepEqual(splitSentences('', 'zh'), []);
    assert.deepEqual(splitSentences(undefined, 'en'), []);
    assert.deepEqual(splitSentences('No punctuation', 'en'), ['No punctuation']);
  });
});

describe('AI scan statistics', () => {
  it('computes Shannon entropy with empty and single-type inputs', () => {
    assert.equal(shannonEntropy([]), 0);
    assert.equal(shannonEntropy([2, 0]), 0);
    assert.equal(shannonEntropy([1, 1]), 1);
    assert.equal(shannonEntropy([2, Number.NaN]), 0);
    assert.equal(shannonEntropy([2, Number.POSITIVE_INFINITY]), 0);
    assert.equal(normalizedEntropy([]), 0);
    assert.equal(normalizedEntropy([1]), 0);
    assert.equal(normalizedEntropy([1, 1]), 1);
    assert.equal(normalizedEntropy([1, Number.NaN]), 0);
  });

  it('computes moving-average type-token ratio for empty, short, and long token lists', () => {
    assert.equal(movingAverageTypeTokenRatio([]), 0);
    assert.equal(movingAverageTypeTokenRatio(['a', 'a', 'b']), 2 / 3);
    const long = Array.from({ length: 60 }, (_, index) => `w${index % 5}`);
    assert.equal(movingAverageTypeTokenRatio(long) > 0, true);
  });

  it('computes sentence length distribution and filters empty sentences', () => {
    assert.deepEqual(computeSentenceStats([], 'en'), {
      count: 0, mean: 0, stdDev: 0, coefficientOfVariation: 0, burstiness: 0, min: 0, max: 0,
    });
    const one = computeSentenceStats(['one two'], 'en');
    assert.equal(one.count, 1);
    assert.equal(one.mean, 2);
    const varied = computeSentenceStats(['one two', 'one two three'], 'en');
    assert.equal(varied.count, 2);
    assert.equal(varied.mean, 2.5);
    assert.equal(varied.coefficientOfVariation > 0, true);
    assert.equal(computeSentenceStats(['', 'word'], 'en').count, 1);
  });

  it('counts repeated n-grams with bounds and ties', () => {
    assert.deepEqual(repeatedNgrams(['a', 'b']), { total: 0, ratio: 0, repeatedCount: 0, top: [] });
    const repeated = repeatedNgrams(['a', 'b', 'c', 'a', 'b', 'c']);
    assert.equal(repeated.total, 4);
    assert.equal(repeated.ratio, 0.5);
    assert.equal(repeated.top[0].phrase, 'a b c');
    assert.equal(repeatedNgrams(['a', 'b', 'c']).repeatedCount, 0);
    assert.equal(repeatedNgrams(['a', 'b', 'c', 'd', 'b', 'c', 'd']).top.length, 1);
    assert.equal(repeatedNgrams(['a', 'b', 'c', 'a', 'b', 'c'], 3, 1).top.length, 1);
  });

  it('counts connectives and reports density and type entropy', () => {
    const english = connectiveStats('Because it is fast, we use it. Moreover, it is robust.', ['because', 'it', 'is', 'fast', 'we', 'use', 'it', 'moreover', 'it', 'is', 'robust'], 'en');
    assert.equal(english.total, 2);
    assert.equal(english.density > 0, true);
    assert.equal(english.top.length, 2);
    assert.equal(connectiveStats('Plain text.', ['plain', 'text'], 'en').total, 0);
    assert.equal(connectiveStats('因此我们采用。', [], 'zh').density, 0);
    assert.equal(connectiveStats('因此我们采用。首先检查。', ['因', '此', '我', '们', '采', '用', '首', '先', '检', '查'], 'zh').total, 2);
  });
});

describe('AI scan structural detections', () => {
  it('detects strong, weak, repeated-run, and triplet parallelism in English', () => {
    const strong = detectParallelRuns(['Not only fast but also reliable.'], 'en');
    assert.equal(strong.score, 1.5);
    assert.equal(strong.runs[0].weak, false);

    const weak = detectParallelRuns(['Both fast and reliable.'], 'en');
    assert.equal(weak.score, 0.5);
    assert.equal(weak.runs[0].weak, true);

    const run = detectParallelRuns(['The server starts.', 'The server stops.', 'The server restarts.'], 'en');
    assert.equal(run.runs.some((item) => item.kind === 'run'), true);

    const triplet = detectParallelRuns(['We build fast tools, test them, and ship them.'], 'en');
    assert.equal(triplet.runs.some((item) => item.kind === 'triplet'), true);

    assert.equal(detectParallelRuns(['Plain sentence.'], 'en').runs.length, 0);
    assert.equal(detectParallelRuns(['The and of.'], 'en').runs.length, 0);
    assert.equal(detectParallelRuns(['alpha beta, gamma delta, epsilon zeta.'], 'en').runs.length, 0);
  });

  it('detects Chinese set-ups, repeated prefixes, and suffixes without over-flagging lists', () => {
    const strong = detectParallelRuns(['不仅快而且稳。'], 'zh', null);
    assert.equal(strong.runs[0].weak, false);

    const weak = detectParallelRuns(['既快又稳。'], 'zh', null);
    assert.equal(weak.runs[0].weak, true);

    const prefix = detectParallelRuns(['那是春天；那是夏天；那是秋天。'], 'zh', null);
    assert.equal(prefix.runs.some((item) => item.kind === 'triplet'), true);

    const suffix = detectParallelRuns(['我们重视效率；他们重视效率；大家重视效率。'], 'zh', null);
    assert.equal(suffix.runs.some((item) => item.kind === 'triplet'), true);

    assert.equal(detectParallelRuns(['苹果，香蕉，梨。'], 'zh', null).runs.length, 0);
    assert.equal(detectParallelRuns(['', '。'], 'zh', null).runs.length, 0);
    assert.equal(detectParallelRuns(['开始工作。', '开始检查。'], 'zh', null).runs.length, 0);
    assert.equal(detectParallelRuns(['开始工作。', '这是一个很长很长的句子。'], 'zh', null).runs.length, 0);
    assert.equal(detectParallelRuns(['开始工作。', '检查完成。'], 'zh', null).runs.length, 0);
    assert.equal(detectParallelRuns(['开始工作。', '开始检查。', '开始结束。'], 'zh', null).runs.length > 0, true);
    assert.equal(detectParallelRuns(['的 了 和 与。'], 'zh', null).runs.length, 0);
    assert.equal(detectParallelRuns(['苹果很甜，香蕉很香，梨很脆。'], 'zh', null).runs.length, 0);
  });

  it('detects neat metaphors and exempts hedged or long sentences', () => {
    const english = detectNeatMetaphors(['The platform is the engine of innovation.'], 'en');
    assert.equal(english.findings.length, 1);

    const simile = detectNeatMetaphors(['The method is like a compass.'], 'en');
    assert.equal(simile.findings.length, 1);
    assert.equal(detectNeatMetaphors(['The method is like a compass and the engine of innovation.'], 'en').findings.length, 1);

    assert.equal(detectNeatMetaphors(['The method is roughly like a compass.'], 'en').findings.length, 0);
    assert.equal(detectNeatMetaphors(['The platform is the engine of innovation in a very large and complex system that spans many teams and regions.'], 'en').findings.length, 0);
    assert.equal(detectNeatMetaphors(['The server starts.'], 'en').findings.length, 0);
    assert.equal(detectNeatMetaphors(['MTL is a class of temporal logic.'], 'en').findings.length, 0);
    assert.equal(detectNeatMetaphors(['The buffer is the union of the shards.'], 'en').findings.length, 0);
    assert.equal(detectNeatMetaphors(['A queue is a kind of buffer.'], 'en').findings.length, 0);
    assert.equal(detectNeatMetaphors(['The bridge is a data structure.'], 'en').findings.length, 0);

    assert.equal(detectNeatMetaphors(['系统是桥梁。'], 'zh', null).findings.length, 1);
    assert.equal(detectNeatMetaphors(['系统如同桥梁。'], 'zh', null).findings.length, 1);
    assert.equal(detectNeatMetaphors(['可以说，系统是桥梁。'], 'zh', null).findings.length, 0);
    assert.equal(detectNeatMetaphors(['系统运行。'], 'zh', null).findings.length, 0);
    assert.equal(detectNeatMetaphors([`${'很长的铺垫'.repeat(10)}系统是桥梁。`], 'zh', null).findings.length, 0);
  });

  it('parses baseline distributions and rejects malformed values', () => {
    assert.deepEqual(parseBaseline(undefined), { ok: true, rates: null });
    assert.deepEqual(parseBaseline(''), { ok: true, rates: null });
    assert.deepEqual(parseBaseline('{"delve":0.1}'), { ok: true, rates: { delve: 0.1 } });
    assert.equal(parseBaseline('[]').ok, false);
    assert.equal(parseBaseline('null').ok, false);
    assert.equal(parseBaseline('1').ok, false);
    assert.equal(parseBaseline('true').ok, false);
    assert.equal(parseBaseline('{').ok, false);
    assert.equal(parseBaseline('{"":0.1}').ok, false);
    assert.equal(parseBaseline('{"delve":-1}').ok, false);
    assert.equal(parseBaseline('{"delve":"x"}').ok, false);
    assert.equal(parseBaseline('{"delve":1e999}').ok, false);
  });

  it('scores over-represented word habits against expected rates', () => {
    assert.equal(scoreWordHabits('delve delve', 'en', ['delve', 'delve'], {}).findings.length, 0);
    assert.equal(scoreWordHabits('delve', 'en', ['delve'], { delve: 0 }).findings.length, 0);
    const flagged = scoreWordHabits('delve delve', 'en', ['delve', 'delve'], { delve: 0 });
    assert.equal(flagged.findings.length, 1);
    assert.equal(flagged.findings[0].density, 1000);
    assert.equal(scoreWordHabits('delve delve', 'en', ['delve', 'delve'], { delve: 1000 }).findings.length, 0);
    assert.equal(scoreWordHabits('delve delve', 'en', [], { delve: 0 }).findings[0].density, 0);
    const sorted = scoreWordHabits('a a b b b b', 'en', ['a', 'a', 'b', 'b', 'b', 'b'], { a: 0, b: 0 });
    assert.equal(sorted.findings[0].term, 'b');
    const tied = scoreWordHabits('a a b b', 'en', ['a', 'a', 'b', 'b'], { a: 0, b: 0 });
    assert.deepEqual(tied.findings.map((finding) => finding.term), ['a', 'b']);
    assert.equal(scoreWordHabits('a a', 'en', ['a', 'a'], { missing: 0 }).findings.length, 0);
    assert.equal(scoreWordHabits('a a', 'en', ['a', 'a'], { a: 0 }).findings.length, 1);
  });
});

describe('AI scan scoring and reports', () => {
  it('maps composite scores to high, moderate, and low bands', () => {
    assert.equal(scoreBand(60), 'high');
    assert.equal(scoreBand(30), 'moderate');
    assert.equal(scoreBand(20), 'moderate');
    assert.equal(scoreBand(19), 'low');
    assert.equal(scoreBand(0), 'low');
  });

  it('aggregates lexical distribution and handles empty inputs', () => {
    const empty = scoreWordHabits('', 'en', [], {});
    assert.equal(empty.lexical.total, 0);
    assert.equal(empty.lexical.density, 0);
    assert.equal(empty.lexical.z, 0);

    const habits = scoreWordHabits('delve delve delve', 'en', ['delve', 'delve', 'delve'], { delve: 0.1 });
    assert.equal(habits.lexical.total, 3);
    assert.equal(habits.lexical.distinct, 1);
    assert.equal(habits.lexical.density, 1000);
    assert.ok(habits.lexical.z > 0);
  });

  it('ships calibration provenance for every document', () => {
    const manifest = JSON.parse(fs.readFileSync(new URL('../calibration/ai-scan-profile.json', import.meta.url), 'utf8'));
    assert.equal(manifest.documents.length >= 30, true);
    for (const document of manifest.documents) {
      assert.match(document.url, /^https?:\/\//u);
      assert.equal(typeof document.score, 'number');
      assert.equal(typeof document.directional, 'number');
      assert.equal(typeof document.tokens, 'number');
    }
    assert.equal(manifest.summary['en-human'].moderatePlus, 0);
    assert.equal(manifest.summary['zh-human'].moderatePlus, 0);
  });

  it('computes a directional style profile and tolerates empty text', () => {
    const empty = computeStyleProfile({
      text: '',
      tokens: [],
      sentences: [],
      language: 'en',
      segmenter: null,
      sentenceStats: { coefficientOfVariation: 0 },
    });
    assert.equal(empty.deviations.length > 0, true);
    assert.equal(Number.isFinite(empty.directional), true);

    const human = scanAiStyle({
      text: 'Yesterday I walked to the market. The rain had stopped, so the street was full of people. I bought bread, cheese, and a small bag of apples. On the way home I stopped to talk with an old friend. We stood under the awning for a while, watching the traffic. He told me his daughter had started school. I said that I remembered the first day of my own school. We laughed about how quickly the years pass. Then I went home and made soup.',
      language: 'en',
      includeKeywordRules: false,
      mode: 'standard',
    });
    const ai = scanAiStyle({
      text: 'In today\'s rapidly evolving landscape, organizations must leverage comprehensive frameworks to optimize operational efficiency. The integration of robust data pipelines facilitates seamless collaboration across teams, and the strategic alignment of workflows enhances measurable outcomes. Moreover, a holistic approach to governance ensures that stakeholders can navigate complex challenges with confidence. By prioritizing transparency, accountability, and continuous improvement, leaders can unlock transformative value. Ultimately, these interconnected initiatives create a sustainable foundation for long-term growth.',
      language: 'en',
      includeKeywordRules: false,
      mode: 'standard',
    });
    assert.equal(human.band, 'low');
    assert.notEqual(ai.band, 'low');
    assert.ok(ai.score - human.score >= 20);
  });

  it('combines normalized metric contributions and gates rhythm on enough sentences', () => {
    assert.equal(computeAiScore(metrics(), 'en').score, 0);
    assert.equal(computeAiScore(metrics({
      sentence: { count: 10, coefficientOfVariation: 0 },
      openings: { entropy: 0 },
      connectives: { density: 20, entropy: 0 },
      ngrams: { ratio: 1 },
      parallelism: { rate: 10, score: 10 },
      metaphor: { rate: 20, score: 20 },
      wordHabits: { maxZ: 10, lexical: { z: 6.5 } },
      styleProfile: { directional: 1.8 },
    }), 'en').score, 100);
    assert.equal(computeAiScore(metrics({
      sentence: { count: 10, coefficientOfVariation: 0 },
      openings: { entropy: 0 },
      connectives: { density: 20, entropy: 0 },
      ngrams: { ratio: 1 },
      parallelism: { rate: 10, score: 10 },
      metaphor: { rate: 20, score: 20 },
      wordHabits: { maxZ: 10, lexical: { z: 7.5 } },
      styleProfile: { directional: 1.7 },
    }), 'zh').score, 100);
    assert.equal(computeAiScore(metrics({
      sentence: { count: 1, coefficientOfVariation: 0 },
      openings: { entropy: 0 },
    }), 'en').score, 0);
    assert.equal(computeAiScore(metrics({
      connectives: { density: -1, entropy: 2 },
      ngrams: { ratio: -1 },
      parallelism: { rate: -1, score: 0 },
      metaphor: { rate: -1, score: 0 },
      wordHabits: { maxZ: -1 },
    }), 'en').score, 0);
  });

  it('emits opening, n-gram, and parallel findings from statistical thresholds', () => {
    const openings = scanAiStyle({
      text: 'System starts. System stops. System restarts. System runs. System waits.',
      language: 'en',
      mode: 'standard',
      includeKeywordRules: false,
    });
    assert.equal(openings.issues.some((issue) => issue.id === 'ai-opening-repetition'), true);

    const emptyOpenings = scanAiStyle({
      text: 'The and of. The and of. The and of. The and of. The and of.',
      language: 'en',
      mode: 'standard',
      includeKeywordRules: false,
    });
    assert.equal(emptyOpenings.metrics.openings.top.length, 0);

    const connectives = scanAiStyle({
      text: 'Moreover, alpha beta gamma delta. Moreover, alpha beta gamma delta. Moreover, alpha beta gamma delta.',
      language: 'en',
      mode: 'standard',
      includeKeywordRules: false,
    });
    assert.equal(connectives.issues.some((issue) => issue.id === 'ai-connective-density'), true);

    const ngrams = scanAiStyle({
      text: 'alpha beta gamma alpha beta gamma alpha beta gamma alpha beta gamma',
      language: 'en',
      mode: 'standard',
      includeKeywordRules: false,
    });
    assert.equal(ngrams.issues.some((issue) => issue.id === 'ai-ngram-repetition'), true);

    const parallel = scanAiStyle({
      text: 'We build fast tools, test them, and ship them.',
      language: 'en',
      mode: 'standard',
      includeKeywordRules: false,
    });
    assert.equal(parallel.issues.some((issue) => issue.id.startsWith('ai-parallel-')), true);

    const weak = scanAiStyle({
      text: 'Both fast and reliable. Both small and light.',
      language: 'en',
      mode: 'standard',
      includeKeywordRules: false,
    });
    assert.equal(weak.issues.filter((issue) => issue.id.startsWith('ai-parallel-')).length, 2);
  });

  it('emits every Chinese statistical finding family', () => {
    const emptyInput = scanAiStyle({});
    assert.equal(emptyInput.issues.length, 0);

    const chineseOpenings = scanAiStyle({
      text: '系统开始。系统继续。系统结束。系统运行。系统停止。',
      language: 'zh',
      segmenter: null,
      mode: 'standard',
      includeKeywordRules: false,
    });
    assert.equal(chineseOpenings.issues.some((issue) => issue.id === 'ai-opening-repetition'), true);

    const chineseAll = scanAiStyle({
      text: '系统开始。系统继续。系统结束。系统运行。系统停止。因此系统赋能。因此系统赋能。因此系统赋能。因此系统赋能。因此系统赋能。因此系统赋能。因此系统赋能。因此系统赋能。因此系统赋能。因此系统赋能。系统是桥梁。不仅快而且稳。',
      language: 'zh',
      segmenter: null,
      mode: 'standard',
      includeKeywordRules: false,
      maxIssues: 50,
    });
    for (const id of [
      'ai-sentence-rhythm',
      'ai-connective-density',
      'ai-ngram-repetition',
      'ai-metaphor-',
      'ai-word-habit-',
    ]) {
      assert.equal(chineseAll.issues.some((issue) => issue.id.startsWith(id)), true, id);
    }
    assert.equal(chineseAll.issues.some((issue) => issue.id.startsWith('ai-parallel-')), true);
    assert.match(formatAiScanReport(chineseAll), /AI 味扫描结果/);
  });
  it('flags concession clauses closed by an abstract restatement', () => {
    const result = scanAiStyle({
      text: '一个 CPU 核同时只能执行一条指令，物理内存只有一份，程序再多，这一点不变。',
      language: 'zh',
      detector: 'local',
      mode: 'standard',
    });
    const finding = result.issues.find((issue) => issue.pattern === 'zh-concession-restatement-close');
    assert.ok(finding);
    assert.equal(finding.severity, 'IMPORTANT');
    assert.equal(finding.quote, '程序再多，这一点不变');
    assert.equal(result.summary.verdict, 'needs_revision');
    const bare = scanAiStyle({ text: '物理内存只有一份，程序开得再多也不变。', language: 'zh', mode: 'standard' });
    assert.equal(bare.issues.some((issue) => issue.pattern === 'zh-concession-restatement-close'), true);
    for (const text of [
      '开着的程序再多，一个核在同一时刻也只能执行一条指令，物理内存也仍然只有这一份。',
      '物理内存是程序运行的时候存放数据的地方,一台机器只有一份,程序开得再多,机器里的物理内存还是这一份。',
      '程序开得再多,这两点都不变。',
      '程序开得再多,这两点都不变,所以需要调度。',
      '程序开得再多，这两样也不会变多。',
    ]) {
      assert.equal(scanAiStyle({ text, language: 'zh', mode: 'standard' }).issues.some(
        (issue) => issue.pattern === 'zh-concession-restatement-close',
      ), true, text);
    }



    for (const text of [
      '在单核顺序执行模型中，一个 CPU 核同一时刻只执行一条指令。',
      '程序数量增加不会改变 CPU 核和物理内存的总量。',
      '在已测的批大小 1 到 64 范围内，结果保持不变。',
      '缓存只保存已经计算过的结果，再次调用时直接读取。',
      '程序再次启动. 这一点不变。',
      '并发任务增加时，队列容量也会相应增加，写入阻塞因此减少。',
    ]) {
      assert.equal(scanAiStyle({ text, language: 'zh', mode: 'standard' }).issues.some(
        (issue) => issue.pattern === 'zh-concession-restatement-close',
      ), false, text);
    }
  });


  it('flags anaphoric passive riders', () => {
    const result = scanAiStyle({
      text: 'Documents 和 report.txt 拼成一条路径，斜杠由它补上。',
      language: 'zh',
      detector: 'local',
      mode: 'standard',
    });
    const finding = result.issues.find((issue) => issue.pattern === 'zh-anaphoric-passive-rider');
    assert.ok(finding);
    assert.equal(finding.severity, 'IMPORTANT');
    assert.equal(result.summary.verdict, 'needs_revision');
    for (const text of [
      '结果写入缓存，异常由它统一处理。',
      '配置从文件读取，默认值由该模块补齐。',
      '配置从文件读取，默认值由此过程补齐。',
    ]) {
      assert.equal(scanAiStyle({ text, language: 'zh', mode: 'standard' }).issues.some(
        (issue) => issue.pattern === 'zh-anaphoric-passive-rider',
      ), true, text);
    }
    for (const text of [
      'path.join 把 Documents 和 report.txt 拼成一条路径，并补上斜杠。',
      '它拼接路径。斜杠由它补上。',
      '它拼接路径，斜杠由 path.join 补上。',
      '报告已经返回，报告由其他作者补写。',
      '问题已经定位，问题由其中一项引起。',
      '它只在路径缺失时调用 join，因为斜杠由它补上时会失败。',
      '路径为空时直接返回，如果斜杠由它补上则继续。',
      '在旧版实现里，分隔符由它补上。',
      '路径为空时，分隔符由它补上。',
    ]) {
      assert.equal(scanAiStyle({ text, language: 'zh', mode: 'standard' }).issues.some(
        (issue) => issue.pattern === 'zh-anaphoric-passive-rider',
      ), false, text);
    }
  });

  it('flags anaphoric callback clauses', () => {
    const result = scanAiStyle({
      text: '浏览器把这三样凑齐，这就是万维网。',
      language: 'zh',
      detector: 'local',
      mode: 'standard',
    });
    const finding = result.issues.find((issue) => issue.pattern === 'zh-anaphoric-callback-clause');
    assert.ok(finding);
    assert.equal(finding.severity, 'IMPORTANT');
    assert.equal(result.summary.verdict, 'needs_revision');
    for (const text of [
      '网站会在 robots.txt 里声明规则，这是基本的网络礼仪。',
      '第一台 IMP 上线，这一天被很多人视为互联网真正的生日。',
      '报文拆成小块独立转发，这让任何一段链路中断都不影响其余部分。',
      '万维网的诞生，正是这场长期争论的产物。',
    ]) {
      assert.equal(scanAiStyle({ text, language: 'zh', mode: 'standard' }).issues.some(
        (issue) => issue.pattern === 'zh-anaphoric-callback-clause',
      ), true, text);
    }
    for (const text of [
      '这台机器负责读卡，打印机负责输出。',
      '这一步把延迟从 4.2 秒降到 1.8 秒。',
      '它拼接路径。斜杠由它补上。',
      '因为斜杠由它补上时会失败，代码先判断路径是否为空。',
      '在旧版实现里，这就是默认行为。',
      '路径为空时，这正是我们要的结果。',
      '浏览器把这三样凑齐，并补上斜杠。',
    ]) {
      assert.equal(scanAiStyle({ text, language: 'zh', mode: 'standard' }).issues.some(
        (issue) => issue.pattern === 'zh-anaphoric-callback-clause',
      ), false, text);
    }
  });

  it('formats a reliable English report without the short-text warning', () => {
    const report = formatAiScanReport(scanAiStyle({
      text: 'The server starts the request and waits for the client. The client connects to the queue and sends a message. The queue fills with work and blocks new arrivals. The worker drains the queue and updates the cache. The cache clears the old entries and logs the change. The log rotates the file and archives the record. The monitor alerts the operator and opens a ticket. The operator responds to the alert and checks the trace. The system recovers the service and reports the state. The service resumes the work and clears the backlog.',
      language: 'en',
      mode: 'standard',
      includeKeywordRules: false,
    }));
    assert.match(report, /Score:/);
    assert.match(report, /lexicon density/);
    assert.match(report, /Style profile: deviation/);
    assert.doesNotMatch(report, /short text/);

    const chineseReport = formatAiScanReport(scanAiStyle({
      text: '系统开始运行。系统继续运行。系统结束运行。系统保持运行。系统停止运行。系统恢复运行。系统检查运行。系统记录运行。系统监控运行。系统报告运行。系统清理运行。系统验证运行。系统归档运行。系统重启运行。系统关闭运行。',
      language: 'zh',
      segmenter: null,
      mode: 'standard',
      includeKeywordRules: false,
    }));
    assert.match(chineseReport, /评分：/);
    assert.doesNotMatch(chineseReport, /文本过短/);
  });

  it('scans English and Chinese texts and applies standard or redline filtering', () => {
    const aiText = 'We delve into intricate challenges. We foster robust frameworks. We showcase vibrant ecosystems. The platform is the engine of innovation. The method is like a compass.';
    const scanned = scanAiStyle({ text: aiText, language: 'en', mode: 'standard', maxIssues: 50 });
    assert.equal(scanned.language, 'en');
    assert.equal(scanned.score > 0, true);
    assert.equal(scanned.issues.some((issue) => issue.id.startsWith('ai-metaphor-')), true);
    assert.equal(scanned.issues.some((issue) => issue.metric === 'parallelism.score' || issue.metric === 'metaphor.score'), true);
    assert.equal(scanned.reliable, false);
    assert.match(formatAiScanReport(scanned), /AI Style Scan Results/);

    const keywordOnly = 'In today\'s rapidly evolving landscape, we build tools.';
    const redline = scanAiStyle({ text: keywordOnly, language: 'en' });
    const standard = scanAiStyle({ text: keywordOnly, language: 'en', mode: 'standard' });
    assert.equal(redline.issues.length, 0);
    assert.equal(standard.issues.some((issue) => issue.source === 'keyword'), true);

    const chinese = scanAiStyle({ text: '我们的平台是创新的引擎。这不仅是一个工具，而是通往未来的桥梁。', language: 'zh', segmenter: null, mode: 'standard' });
    assert.equal(chinese.language, 'zh');
    assert.equal(chinese.issues.length > 0, true);
    assert.match(formatAiScanReport(chinese), /AI 味扫描结果/);
  });

  it('handles short, empty, keyword-suppressed, capped, and baseline scans', () => {
    const empty = scanAiStyle({ text: '', language: 'auto' });
    assert.equal(empty.score, 0);
    assert.equal(empty.reliable, false);
    assert.equal(empty.issues.length, 0);
    assert.match(formatAiScanReport(empty), /No strong AI-style tells found/);

    const short = scanAiStyle({ text: 'One sentence only.', language: 'en' });
    assert.equal(short.reliable, false);
    assert.match(formatAiScanReport(short), /short text/);

    const aiText = 'We delve into intricate challenges. We foster robust frameworks. We showcase vibrant ecosystems. The platform is the engine of innovation. The method is like a compass.';
    const withoutKeywords = scanAiStyle({ text: aiText, language: 'en', includeKeywordRules: false, mode: 'standard', maxIssues: 1 });
    assert.equal(withoutKeywords.issues.length, 1);
    assert.equal(withoutKeywords.issues.every((issue) => issue.source !== 'keyword'), true);
    assert.match(formatAiScanReport(withoutKeywords), /additional issue\(s\) omitted/);

    const baseline = scanAiStyle({ text: 'delve delve', language: 'en', baseline: '{"delve":0}', maxIssues: 50 });
    assert.equal(baseline.baselineError, null);
    assert.equal(baseline.metrics.wordHabits.findings.length, 1);

    const badBaseline = scanAiStyle({ text: 'text', language: 'en', baseline: '{' });
    assert.match(badBaseline.baselineError, /not valid JSON/);
    assert.match(formatAiScanReport(badBaseline), /Baseline error/);

    const zhBadBaseline = scanAiStyle({ text: '文本。', language: 'zh', baseline: '{' });
    assert.match(formatAiScanReport(zhBadBaseline), /基线解析失败/);
  });

  it('formats ensemble decisions, unavailable configuration, slow fallback, and malformed values', () => {
    const base = scanAiStyle({ text: 'The server starts. The worker drains the queue.', language: 'en', includeKeywordRules: false, mode: 'standard' });
    const decided = formatAiScanReport({
      ...base,
      ensemble: {
        status: 'decided',
        label: 'ai',
        score: 0.8325,
        threshold: 0.38,
        source: 'weighted',
        uncertain: false,
        components: { aigc: 0.9, jev: 0.8, slow: null },
        jevModel: 'jev-test',
        slowError: null,
      },
    });
    assert.match(decided, /AIGC \+ Jev Ensemble Decision/u);
    assert.match(decided, /AIGC P\(AI\) = 0\.900/u);
    assert.match(decided, /Slow fallback = not used/u);
    assert.match(decided, /Jev model = jev-test/u);

    const slow = formatAiScanReport({
      ...base,
      ensemble: {
        status: 'decided',
        label: 'human',
        score: 0.38,
        threshold: 0.38,
        source: 'slow',
        uncertain: true,
        components: { aigc: 0.38, jev: 0.38, slow: 'human' },
        jevModel: null,
        slowError: 'slow timeout',
      },
    });
    assert.match(slow, /Decision = human \(slow\)/u);
    assert.match(slow, /Slow fallback = human/u);
    assert.match(slow, /Slow fallback error = slow timeout/u);

    const unavailable = formatAiScanReport({ ...base, ensemble: { status: 'unavailable', missing: ['AIGC_DETECTOR_URL'] } });
    assert.match(unavailable, /ensemble not configured/u);
    const noMissing = formatAiScanReport({ ...base, ensemble: { status: 'unavailable' } });
    assert.match(noMissing, /Missing ;/u);
    const network = formatAiScanReport({ ...base, ensemble: { status: 'unavailable', reason: 'network_not_allowed' } });
    assert.match(network, /Network access was not allowed/u);
    const networkZh = formatAiScanReport({ ...base, language: 'zh', ensemble: { status: 'unavailable', reason: 'network_not_allowed' } });
    assert.match(networkZh, /未授权网络访问/u);

    const chineseBase = scanAiStyle({ text: '系统开始运行。系统继续运行。', language: 'zh', segmenter: null, includeKeywordRules: false, mode: 'standard' });
    const chineseDecided = formatAiScanReport({
      ...chineseBase,
      ensemble: {
        status: 'decided',
        label: 'human',
        score: 0.2,
        threshold: 0.38,
        source: 'weighted',
        uncertain: true,
        components: { aigc: 0.2, jev: 0.2, slow: null },
      },
    });
    assert.match(chineseDecided, /AIGC \+ Jev 组合判定/u);
    assert.match(chineseDecided, /加权分 = 0\.200/u);
    assert.match(chineseDecided, /慢模型回退 = 未使用/u);
    const chineseUnavailable = formatAiScanReport({ ...chineseBase, ensemble: { status: 'unavailable', missing: ['AIGC_DETECTOR_URL'] } });
    assert.match(chineseUnavailable, /组合未配置/u);
    const chineseSlowError = formatAiScanReport({
      ...chineseBase,
      ensemble: {
        status: 'decided',
        label: 'human',
        score: 0.38,
        threshold: 0.38,
        source: 'slow',
        components: { aigc: 0.38, jev: 0.38, slow: 'human' },
        slowError: '超时',
      },
    });
    assert.match(chineseSlowError, /慢模型错误 = 超时/u);

    const noComponents = formatAiScanReport({
      ...base,
      ensemble: { status: 'decided', label: 'human', score: 0.1, threshold: 0.38, source: 'weighted' },
    });
    assert.match(noComponents, /AIGC P\(AI\) = n\/a/u);

    const errorStatus = formatAiScanReport({ ...base, ensemble: { status: 'error' } });
    assert.doesNotMatch(errorStatus, /Ensemble Decision/u);

    const malformed = formatAiScanReport({
      ...base,
      ensemble: {
        status: 'decided',
        label: 'human',
        score: 0.1,
        threshold: 0.38,
        source: 'weighted',
        uncertain: false,
        components: { aigc: null, jev: undefined, slow: null },
      },
    });
    assert.match(malformed, /AIGC P\(AI\) = n\/a/u);
  });

  it('formats reliable and short-text reports in both languages', () => {
    const enBase = scanAiStyle({ text: 'One sentence only.', language: 'en' });
    assert.doesNotMatch(formatAiScanReport({ ...enBase, reliable: true }), /short text/);
    assert.match(formatAiScanReport({ ...enBase, reliable: false }), /short text/);

    const zhBase = scanAiStyle({ text: '系统运行。', language: 'zh', segmenter: null });
    assert.doesNotMatch(formatAiScanReport({ ...zhBase, reliable: true }), /文本过短/);
    assert.match(formatAiScanReport({ ...zhBase, reliable: false }), /文本过短/);
  });

  it('formats Chinese pass and omitted findings', () => {
    const pass = scanAiStyle({ text: '系统运行。', language: 'zh', segmenter: null });
    assert.match(formatAiScanReport(pass), /未发现明显的 AI 味特征/);

    const omitted = scanAiStyle({
      text: '我们的平台是创新的引擎。这不仅是一个工具，而是通往未来的桥梁。我们深入复杂挑战，促进无缝协作，并解锁充满活力的生态。',
      language: 'zh',
      segmenter: null,
      mode: 'standard',
      maxIssues: 1,
    });
    assert.match(formatAiScanReport(omitted), /另有 \d+ 个问题未显示。/);
  });
});
