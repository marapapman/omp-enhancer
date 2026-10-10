/**
 * Whole-deck AI-tell census for LaTeX/Beamer decks.
 *
 * The module is pure: it never imports `node:fs` or `node:path`, and it never
 * resolves paths against the process cwd. Callers inject filesystem access as
 * `readFile(absolutePath) => string`, which may throw.
 */

import { ZH_RULES } from './style.js';

/** Line kinds emitted by the census. */
export const DECK_LINE_KINDS = Object.freeze({
  title: 'title',
  bullet: 'bullet',
  caption: 'caption',
  tableCell: 'tableCell',
  noteside: 'noteside',
  code: 'code',
  comment: 'comment',
  other: 'other',
});

const CODE_ENVIRONMENTS = ['SlideCode', 'Verbatim', 'lstlisting', 'verbatim'];
const TABLE_ENVIRONMENTS = ['tabular', 'tabularx', 'array'];
const CODE_ENVIRONMENT_PATTERN = new RegExp(`\\\\(begin|end)\\{(?:${CODE_ENVIRONMENTS.join('|')})\\}`, 'u');
const TABLE_ENVIRONMENT_PATTERN = new RegExp(`\\\\(begin|end)\\{(?:${TABLE_ENVIRONMENTS.join('|')})\\}`, 'u');
const FRAME_BEGIN_PATTERN = /\\begin\{frame\}/u;
const FRAME_END_PATTERN = /\\end\{frame\}/u;
const INPUT_PATTERN = /\\(?:input|include)\s*\{([^}]*)\}/gu;
const MAIN_TITLE_PATTERN = /^\s*\\(?:title|subtitle)\s*\{/u;
const NOTESIDE_PATTERN = /\\noteside\b/u;
const TITLE_PAGE_PATTERN = /\\titlepage\b|\\maketitle\b/u;
const HAN_PATTERN = /[\u4e00-\u9fff]/u;
const HAN_RUN_PATTERN = /[\u4e00-\u9fff]{6,}/gu;
const ITEM = '\\item';
const COLON = '：';
const SHINGLE_LENGTH = 2;
const ECHO_THRESHOLD = 0.5;
const REPEATED_MIN_HAN = 6;
const REPEATED_MIN_FRAMES = 3;
const SHORT_PREFIX_LIMIT = 12;
const COLON_TABLE_EXEMPT_PATTERN = 'zh-colon-claim';

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function normalizePath(path) {
  const absolute = path.startsWith('/');
  const parts = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return `${absolute ? '/' : ''}${parts.join('/')}`;
}

function dirnameOf(path) {
  const index = path.lastIndexOf('/');
  if (index < 0) return '';
  return path.slice(0, index);
}

function resolveInputPath(baseDir, name) {
  const withExtension = /\.[A-Za-z0-9]+$/u.test(name) ? name : `${name}.tex`;
  if (withExtension.startsWith('/') || baseDir === '') return normalizePath(withExtension);
  return normalizePath(`${baseDir}/${withExtension}`);
}

/** Removes a trailing LaTeX comment, honouring `\%`. */
function stripComment(line) {
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '%' && line[index - 1] !== '\\') {
      return { text: line.slice(0, index), comment: true };
    }
  }
  return { text: line, comment: false };
}

/** Drops LaTeX commands but keeps the text of their arguments. */
function stripCommands(text) {
  return text
    .replace(/\\[a-zA-Z@]+\*?/gu, '')
    .replace(/[{}\\\\^_&$~]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** Reads a balanced `{...}` argument starting at `start`. */
function readBraceArgument(text, start) {
  let depth = 0;
  let value = '';
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (char === '{') {
      depth += 1;
      if (depth === 1) continue;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) return { value, end: index };
    }
    value += char;
  }
  return null;
}

function skipOptionalArgument(text, start) {
  if (text[start] !== '[') return start;
  const close = text.indexOf(']', start);
  return close < 0 ? start : close + 1;
}

function readArguments(text, from) {
  const first = skipOptionalArgument(text, from);
  if (text[first] !== '{') return null;
  const firstArgument = readBraceArgument(text, first);
  if (!firstArgument) return null;
  const secondStart = firstArgument.end + 1;
  if (text[secondStart] !== '{') return null;
  const secondArgument = readBraceArgument(text, secondStart);
  if (!secondArgument) return null;
  return secondArgument.value;
}

/** Title of a `\begin{frame}{...}` line, or null when the frame has no title. */
function frameTitle(line) {
  const match = FRAME_BEGIN_PATTERN.exec(line);
  if (!match) return null;
  const argumentStart = skipOptionalArgument(line, match.index + match[0].length);
  if (line[argumentStart] !== '{') return null;
  const argument = readBraceArgument(line, argumentStart);
  return argument ? argument.value : null;
}

/** Caption argument of `\figfull[opt]{file}{caption}` or `tximg`/`imgtx`. */
function captionArgument(line) {
  const figfull = /\\figfull\b/u.exec(line);
  if (figfull) return readArguments(line, figfull.index + figfull[0].length);
  const environment = /\\(?:begin)\{(?:tximg|imgtx)\}/u.exec(line);
  if (environment) return readArguments(line, environment.index + environment[0].length);
  return null;
}

function bulletText(line) {
  return line.slice(line.indexOf(ITEM) + ITEM.length);
}

/** Text that follows a `\noteside` macro on the same line, or null. */
function notesideText(line) {
  const match = NOTESIDE_PATTERN.exec(line);
  if (!match) return null;
  const rest = line.slice(match.index + match[0].length).trim();
  return rest === '' ? null : rest;
}

function mainTitleText(line) {
  if (!MAIN_TITLE_PATTERN.test(line)) return null;
  const start = line.indexOf('{');
  const argument = readBraceArgument(line, start);
  return argument ? argument.value : null;
}

function inputNames(text) {
  const names = [];
  for (const line of text.split('\n')) {
    const { text: uncommented } = stripComment(line);
    for (const match of uncommented.matchAll(INPUT_PATTERN)) {
      const name = match[1].trim();
      if (name !== '') names.push(name);
    }
  }
  return names;
}

/**
 * Collects the main file plus every `\input`/`\include` in file order.
 * Repeated inputs are kept (LaTeX includes them each time); cycles are errors.
 */
export function collectDeckSources({ mainPath, mainText, readFile }) {
  const sources = [];
  const stack = [];

  const visit = (path, text) => {
    const resolved = normalizePath(path);
    if (stack.includes(resolved)) {
      return { ok: false, error: `Circular \\input detected: ${resolved}` };
    }
    sources.push({ path: resolved, text });
    stack.push(resolved);
    for (const name of inputNames(text)) {
      const target = resolveInputPath(dirnameOf(resolved), name);
      let loaded;
      try {
        loaded = readFile(target);
      } catch (error) {
        return { ok: false, error: `Unable to read ${target}: ${messageOf(error)}` };
      }
      if (typeof loaded !== 'string') {
        return { ok: false, error: `Unable to read ${target}: expected text content` };
      }
      const nested = visit(target, loaded);
      if (!nested.ok) return nested;
    }
    stack.pop();
    return { ok: true };
  };

  const result = visit(mainPath, mainText);
  if (!result.ok) return result;
  return { ok: true, sources };
}

function isCommandLine(uncommented) {
  const trimmed = uncommented.trim();
  return trimmed.startsWith('\\') || trimmed.startsWith('{');
}

function isParagraphLine(kind, uncommented, text) {
  if (
    kind === DECK_LINE_KINDS.bullet ||
    kind === DECK_LINE_KINDS.caption ||
    kind === DECK_LINE_KINDS.tableCell ||
    kind === DECK_LINE_KINDS.code ||
    kind === DECK_LINE_KINDS.comment ||
    kind === DECK_LINE_KINDS.title
  ) {
    return false;
  }
  if (isCommandLine(uncommented)) return false;
  return HAN_PATTERN.test(text);
}

function parseDeckInternal({ mainPath, mainText, readFile }) {
  const collected = collectDeckSources({ mainPath, mainText, readFile });
  if (!collected.ok) return collected;

  const mainResolved = normalizePath(mainPath);
  const lines = [];
  const frames = [];
  const tableRanges = [];
  let openFrame = null;
  let codeDepth = 0;
  let tableDepth = 0;
  let lastLine = 0;

  const closeFrame = (lineNumber) => {
    if (!openFrame) return;
    openFrame.endLine = lineNumber;
    frames.push(openFrame);
    openFrame = null;
  };

  for (const source of collected.sources) {
    const isMain = source.path === mainResolved;
    const rawLines = source.text.split('\n');
    for (let index = 0; index < rawLines.length; index += 1) {
      const raw = rawLines[index];
      const lineNumber = index + 1;
      lastLine = lineNumber;
      const { text: uncommented, comment } = stripComment(raw);
      const stripped = stripCommands(uncommented);
      const title = frameTitle(uncommented);
      const caption = captionArgument(uncommented);
      const mainTitle = isMain ? mainTitleText(uncommented) : null;
      const codeEnvironment = CODE_ENVIRONMENT_PATTERN.exec(uncommented);
      const tableEnvironment = TABLE_ENVIRONMENT_PATTERN.exec(uncommented);
      let kind = DECK_LINE_KINDS.other;
      let text = stripped;
      if (codeDepth > 0 && !(codeEnvironment && codeEnvironment[1] === 'end')) {
        kind = DECK_LINE_KINDS.code;
      } else if (comment && stripped === '') {
        kind = DECK_LINE_KINDS.comment;
        text = '';
      } else if (title !== null) {
        kind = DECK_LINE_KINDS.title;
        text = stripCommands(title);
      } else if (caption !== null) {
        kind = DECK_LINE_KINDS.caption;
        text = stripCommands(caption);
      } else if (uncommented.includes(ITEM)) {
        kind = DECK_LINE_KINDS.bullet;
        text = stripCommands(bulletText(uncommented));
      } else if (notesideText(uncommented) !== null) {
        kind = DECK_LINE_KINDS.noteside;
        text = stripCommands(notesideText(uncommented));
      } else if (tableDepth > 0 && !isCommandLine(uncommented)) {
        kind = DECK_LINE_KINDS.tableCell;
      } else if (mainTitle !== null) {
        kind = DECK_LINE_KINDS.title;
        text = stripCommands(mainTitle);
      }
      lines.push({ path: source.path, line: lineNumber, kind, raw, text });

      if (FRAME_BEGIN_PATTERN.test(uncommented)) {
        closeFrame(lineNumber);
        if (title !== null) {
          openFrame = {
            index: frames.length + 1,
            path: source.path,
            startLine: lineNumber,
            endLine: lineNumber,
            title: stripCommands(title),
            titleLine: lineNumber,
            bullets: [],
            captions: [],
            paragraphLines: [],
            hasTable: false,
            tableCells: [],
            isTitlePage: false,
          };
          tableRanges.push([]);
        }
      }
      if (FRAME_END_PATTERN.test(uncommented)) closeFrame(lineNumber);

      if (codeEnvironment) {
        codeDepth += codeEnvironment[1] === 'begin' ? 1 : -1;
        if (codeDepth < 0) codeDepth = 0;
      }
      if (tableEnvironment) {
        if (tableEnvironment[1] === 'begin') {
          tableDepth += 1;
          if (openFrame && tableDepth === 1) {
            openFrame.hasTable = true;
            tableRanges[tableRanges.length - 1].push({ startLine: lineNumber, endLine: lineNumber });
          }
        } else if (tableDepth > 0) {
          tableDepth -= 1;
          if (openFrame && tableDepth === 0) {
            const ranges = tableRanges[tableRanges.length - 1];
            ranges[ranges.length - 1].endLine = lineNumber;
          }
        }
      }

      if (openFrame) {
        if (TITLE_PAGE_PATTERN.test(uncommented)) openFrame.isTitlePage = true;
        const entry = { path: source.path, line: lineNumber, text };
        if (kind === DECK_LINE_KINDS.bullet) openFrame.bullets.push(entry);
        if (kind === DECK_LINE_KINDS.caption) openFrame.captions.push(entry);
        if (kind === DECK_LINE_KINDS.tableCell) openFrame.tableCells.push(entry);
        if (isParagraphLine(kind, uncommented, text)) openFrame.paragraphLines.push(entry);
      }
    }
  }

  closeFrame(lastLine);

  return { ok: true, sources: collected.sources, frames, lines, tableRanges };
}

function frameKey(frames) {
  return [...frames].sort((left, right) => left - right).join(',');
}

function hanRuns(text) {
  const runs = [];
  for (const match of text.matchAll(HAN_RUN_PATTERN)) runs.push(match[0]);
  return runs;
}

function hanShingles(text) {
  const han = [...text].filter((char) => HAN_PATTERN.test(char)).join('');
  const shingles = new Set();
  for (let index = 0; index + SHINGLE_LENGTH <= han.length; index += 1) {
    shingles.add(han.slice(index, index + SHINGLE_LENGTH));
  }
  return shingles;
}

function intersectionSize(left, right) {
  let size = 0;
  for (const item of right) {
    if (left.has(item)) size += 1;
  }
  return size;
}

function dominantBullet(bulletCounts) {
  let dominantCount = 0;
  let dominantFrames = 0;
  for (const [count, frameCount] of Object.entries(bulletCounts)) {
    const numeric = Number(count);
    if (frameCount > dominantFrames || (frameCount === dominantFrames && numeric > dominantCount)) {
      dominantCount = numeric;
      dominantFrames = frameCount;
    }
  }
  return { dominantCount, dominantFrames };
}

function lineFrameIndex(frames) {
  const index = new Map();
  frames.forEach((frame, position) => {
    for (let line = frame.startLine; line <= frame.endLine; line += 1) {
      index.set(`${frame.path}\u0000${line}`, position);
    }
  });
  return index;
}

function collectRepeatedPhrases(lines, frameIndex) {
  const phraseFrames = new Map();
  const runs = [];
  for (const line of lines) {
    if (line.kind === DECK_LINE_KINDS.code || line.kind === DECK_LINE_KINDS.comment) continue;
    const frame = frameIndex.get(`${line.path}\u0000${line.line}`);
    if (frame === undefined) continue;
    for (const value of hanRuns(line.text)) {
      runs.push({ value, path: line.path, line: line.line, frame });
      for (let start = 0; start + REPEATED_MIN_HAN <= value.length; start += 1) {
        for (let end = start + REPEATED_MIN_HAN; end <= value.length; end += 1) {
          const phrase = value.slice(start, end);
          let frames = phraseFrames.get(phrase);
          if (!frames) {
            frames = new Set();
            phraseFrames.set(phrase, frames);
          }
          frames.add(frame);
        }
      }
    }
  }

  const groups = new Map();
  for (const run of runs) {
    const byFrameSet = new Map();
    for (let start = 0; start + REPEATED_MIN_HAN <= run.value.length; start += 1) {
      for (let end = start + REPEATED_MIN_HAN; end <= run.value.length; end += 1) {
        const phrase = run.value.slice(start, end);
        const frames = phraseFrames.get(phrase);
        if (!frames || frames.size < REPEATED_MIN_FRAMES) continue;
        const key = frameKey(frames);
        let bucket = byFrameSet.get(key);
        if (!bucket) {
          bucket = [];
          byFrameSet.set(key, bucket);
        }
        bucket.push({ start, end, phrase, key });
      }
    }
    for (const [key, bucket] of byFrameSet) {
      bucket.sort((left, right) => (right.end - right.start) - (left.end - left.start));
      const accepted = [];
      for (const candidate of bucket) {
        if (accepted.some((item) => item.start <= candidate.start && item.end >= candidate.end)) continue;
        accepted.push(candidate);
      }
      for (const candidate of accepted) {
        const groupKey = `${candidate.phrase}\u0000${key}`;
        let group = groups.get(groupKey);
        if (!group) {
          group = { phrase: candidate.phrase, frameCount: key.split(',').length, occurrences: [] };
          groups.set(groupKey, group);
        }
        group.occurrences.push({ path: run.path, line: run.line });
      }
    }
  }

  return [...groups.values()]
    .map((group) => {
      const seen = new Set();
      const occurrences = [];
      for (const occurrence of group.occurrences) {
        const occurrenceKey = `${occurrence.path}\u0000${occurrence.line}`;
        if (seen.has(occurrenceKey)) continue;
        seen.add(occurrenceKey);
        occurrences.push(occurrence);
      }
      return { ...group, occurrences };
    })
    .sort((left, right) => right.frameCount - left.frameCount || right.phrase.length - left.phrase.length);
}

function collectCaptionEchoes(frames) {
  const echoes = [];
  for (const frame of frames) {
    const title = frame.title;
    for (const caption of frame.captions) {
      const captionShingles = hanShingles(caption.text);
      const targets = [
        { kind: 'title', path: frame.path, line: frame.titleLine, text: title },
        ...frame.bullets.map((bullet) => ({ kind: 'bullet', ...bullet })),
      ];
      let best = null;
      for (const target of targets) {
        const targetShingles = hanShingles(target.text);
        if (targetShingles.size === 0) continue;
        const overlap = intersectionSize(captionShingles, targetShingles) / targetShingles.size;
        if (overlap < ECHO_THRESHOLD) continue;
        if (best === null || overlap > best.overlap) best = { overlap, target };
      }
      if (best) echoes.push({ overlap: best.overlap, caption, target: best.target });
    }
  }
  return echoes;
}

function collectTableScaffolding(frames, tableRanges) {
  const scaffolding = [];
  frames.forEach((frame, position) => {
    const ranges = tableRanges[position];
    if (ranges.length === 0) return;
    const table = ranges[0];
    const before = frame.paragraphLines.filter((line) => line.line < table.startLine).pop() ?? null;
    const after = frame.paragraphLines.find((line) => line.line > table.endLine) ?? null;
    scaffolding.push({ frameIndex: frame.index, path: frame.path, before, after });
  });
  return scaffolding;
}

function collectRuleHits(lines) {
  const hits = [];
  for (const line of lines) {
    if (line.kind === DECK_LINE_KINDS.code || line.kind === DECK_LINE_KINDS.comment) continue;
    const { text } = stripComment(line.raw);
    for (const rule of ZH_RULES) {
      if (rule.pattern === COLON_TABLE_EXEMPT_PATTERN && line.kind === DECK_LINE_KINDS.tableCell) continue;
      const match = new RegExp(rule.regex.source, rule.regex.flags).exec(text);
      if (!match) continue;
      hits.push({
        path: line.path,
        line: line.line,
        pattern: rule.pattern,
        quote: match[0],
        problem: rule.problem,
        suggestion: rule.suggestion,
      });
    }
  }
  return hits;
}

function computeMetrics({ frames, lines, tableRanges }) {
  const bulletCounts = {};
  let bulletFrameCount = 0;
  for (const frame of frames) {
    const count = frame.bullets.length;
    bulletCounts[count] = (bulletCounts[count] ?? 0) + 1;
    if (count > 0) bulletFrameCount += 1;
  }
  const { dominantCount, dominantFrames } = dominantBullet(bulletCounts);
  const bullets = frames.flatMap((frame) => frame.bullets);
  const captions = frames.flatMap((frame) => frame.captions);
  const colonBullets = bullets.filter((bullet) => bullet.text.includes(COLON));
  const shortPrefixCount = colonBullets.filter((bullet) => {
    const prefix = bullet.text.slice(0, bullet.text.indexOf(COLON)).trim();
    return [...prefix].length <= SHORT_PREFIX_LIMIT;
  }).length;
  const colonCaptions = captions.filter((caption) => caption.text.includes(COLON));

  return {
    frameCount: frames.length,
    bulletFrameCount,
    bulletCount: bullets.length,
    bulletCounts,
    dominantBulletCount: dominantCount,
    dominantBulletFrames: dominantFrames,
    dominantShare: frames.length === 0 ? 0 : dominantFrames / frames.length,
    titleCount: frames.filter((frame) => frame.title !== '').length,
    colonTitleCount: frames.filter((frame) => frame.title.includes(COLON)).length,
    captionCount: captions.length,
    colonCaptionCount: colonCaptions.length,
    colonCaptionShare: captions.length === 0 ? 0 : colonCaptions.length / captions.length,
    colonBullets: {
      total: colonBullets.length,
      shortPrefixCount,
      shortPrefixLimit: SHORT_PREFIX_LIMIT,
    },
    repeatedPhrases: collectRepeatedPhrases(lines, lineFrameIndex(frames)),
    captionEchoes: collectCaptionEchoes(frames),
    tableScaffolding: collectTableScaffolding(frames, tableRanges),
    ruleHits: collectRuleHits(lines),
  };
}

/** Parses a deck into sources, frames, and classified lines. */
export function parseDeck({ mainPath, mainText, readFile }) {
  const parsed = parseDeckInternal({ mainPath, mainText, readFile });
  if (!parsed.ok) return parsed;
  return { ok: true, sources: parsed.sources, frames: parsed.frames, lines: parsed.lines };
}

/** Parses a deck and computes the whole-deck AI-tell metrics. */
export function censusDeck({ mainPath, mainText, readFile }) {
  const parsed = parseDeckInternal({ mainPath, mainText, readFile });
  if (!parsed.ok) return parsed;
  const metrics = computeMetrics({
    frames: parsed.frames,
    lines: parsed.lines,
    tableRanges: parsed.tableRanges,
  });
  return { ok: true, sources: parsed.sources, frames: parsed.frames, lines: parsed.lines, metrics };
}

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatLocation(entry) {
  return `${entry.path}:${entry.line}`;
}

function formatBulletDistribution(metrics) {
  return Object.entries(metrics.bulletCounts)
    .map(([count, frameCount]) => ({ count: Number(count), frameCount }))
    .sort((left, right) => right.frameCount - left.frameCount || right.count - left.count)
    .map((item) => `${item.count} 条 ${item.frameCount} 帧`)
    .join('、');
}

function formatRuleHits(hits) {
  if (hits.length === 0) return ['逐行规则命中：0 条'];
  const lines = [`逐行规则命中：${hits.length} 条`];
  for (const hit of hits) {
    lines.push(`- ${formatLocation(hit)} [${hit.pattern}] 「${hit.quote}」`);
    lines.push(`  ${hit.problem} ${hit.suggestion}`);
  }
  return lines;
}

function formatRepeatedPhrases(phrases) {
  if (phrases.length === 0) return ['跨页重复短语：0 组'];
  const lines = [`跨页重复短语（≥${REPEATED_MIN_HAN} 汉字，≥${REPEATED_MIN_FRAMES} 帧）：${phrases.length} 组`];
  for (const group of phrases) {
    const locations = group.occurrences.map(formatLocation).join('、');
    lines.push(`- ${group.frameCount} 帧 ×「${group.phrase}」：${locations}`);
  }
  return lines;
}

function formatCaptionEchoes(echoes) {
  if (echoes.length === 0) return ['图注复述：0 条'];
  const lines = [`图注复述（二字片段重合率 ≥${ECHO_THRESHOLD}）：${echoes.length} 条`];
  for (const echo of echoes) {
    lines.push(
      `- ${formatLocation(echo.caption)} 复述 ${echo.target.kind} ${formatLocation(echo.target)}（${percent(echo.overlap)}）`,
    );
    lines.push(`  图注：「${echo.caption.text}」`);
    lines.push(`  ${echo.target.kind}：「${echo.target.text}」`);
  }
  return lines;
}

function formatTableScaffolding(scaffolding) {
  if (scaffolding.length === 0) return ['表格前后套话：0 帧'];
  const withBefore = scaffolding.filter((entry) => entry.before !== null);
  const withBoth = scaffolding.filter((entry) => entry.before !== null && entry.after !== null);
  const lines = [
    `表格前后套话：${withBefore.length} 帧有表前句，其中 ${withBoth.length} 帧表前表后都有`,
  ];
  for (const entry of scaffolding) {
    if (entry.before === null && entry.after === null) continue;
    const before = entry.before ? `表前「${entry.before.text}」(${formatLocation(entry.before)})` : '表前无';
    const after = entry.after ? `表后「${entry.after.text}」(${formatLocation(entry.after)})` : '表后无';
    lines.push(`- 帧 ${entry.frameIndex} ${entry.path}：${before}；${after}`);
  }
  return lines;
}

/** Renders a census (or a census error) as a human-readable report. */
export function formatDeckCensusReport(census) {
  if (!census || census.ok !== true) {
    return `全稿 AI 味统计失败：${(census && census.error) || '未知错误'}`;
  }
  const { metrics, sources } = census;
  const report = [
    '全稿 AI 味统计（deck census）',
    `来源：${sources.length} 个文件`,
    `帧：${metrics.frameCount}，其中带要点 ${metrics.bulletFrameCount} 帧（${percent(metrics.frameCount === 0 ? 0 : metrics.bulletFrameCount / metrics.frameCount)}）`,
    `每帧要点条数：${formatBulletDistribution(metrics)}；最常见 ${metrics.dominantBulletCount} 条 ${metrics.dominantBulletFrames} 帧（${percent(metrics.dominantShare)}）`,
    `标题：${metrics.titleCount} 个，含冒号 ${metrics.colonTitleCount} 个`,
    `图注：${metrics.captionCount} 条，含冒号 ${metrics.colonCaptionCount} 条（${percent(metrics.colonCaptionShare)}）`,
    `要点：${metrics.bulletCount} 条，含冒号 ${metrics.colonBullets.total} 条，其中冒号前不超过 ${metrics.colonBullets.shortPrefixLimit} 字 ${metrics.colonBullets.shortPrefixCount} 条`,
    ...formatRuleHits(metrics.ruleHits),
    ...formatRepeatedPhrases(metrics.repeatedPhrases),
    ...formatCaptionEchoes(metrics.captionEchoes),
    ...formatTableScaffolding(metrics.tableScaffolding),
  ];
  return report.join('\n');
}
