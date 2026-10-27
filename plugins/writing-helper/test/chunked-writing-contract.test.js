import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const pluginDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const configDir = join(pluginDir, '..', 'omp-config');

function read(relative) {
  return readFileSync(join(pluginDir, relative), 'utf8');
}

function readConfig(relative) {
  return readFileSync(join(configDir, relative), 'utf8');
}

describe('chunked writing and sentence-level contracts', () => {
  it('binds both writer agents to independent chunks instead of a whole-document round trip', () => {
    const writer = read('agents/writer.md');
    assert.match(writer, /chunk-001, chunk-002/u);
    assert.match(writer, /English at most 1,200 words/u);
    assert.match(writer, /at most four sub-tasks run at once/iu);
    assert.match(writer, /never continues the previous chunk/iu);
    assert.match(writer, /frozen style pack/iu);
    assert.match(writer, /no final whole-document polish pass/iu);
    assert.match(writer, /never a continuation of the previous chunk's conversation/iu);
    assert.match(writer, /The unit of work is the authorized chunk/u);
    assert.match(writer, /never blocks other chunks/iu);
    assert.doesNotMatch(writer, /Section-level batch output/u);

    const zhWriter = read('agents/zh-writer.md');
    assert.match(zhWriter, /分块协议/u);
    assert.match(zhWriter, /中文单块最多 2,000 个非空白字符/u);
    assert.match(zhWriter, /同时最多 4 个子任务/u);
    assert.match(zhWriter, /不恢复前块会话/u);
    assert.match(zhWriter, /冻结风格包/u);
    assert.match(zhWriter, /不做最后整篇统一润色/u);
    assert.match(zhWriter, /独立单元就是这份授权的 chunk/u);
    assert.match(zhWriter, /不阻断其他 chunk/u);
  });

  it('keeps chunk review advisory and located for both checkers', () => {
    const checker = read('agents/checker.md');
    assert.match(checker, /## Narrow Passage Review/u);
    assert.match(checker, /A chunk review does not require the whole document/u);
    assert.match(checker, /never becomes a demand to re-run the entire document/u);
    assert.match(checker, /chunk id with its exact location/iu);
    assert.match(checker, /new independent writer sub-task/iu);
    assert.match(checker, /no single checker receives the whole document/iu);

    const zhChecker = read('agents/zh-checker.md');
    assert.match(zhChecker, /### 分块审查/u);
    assert.match(zhChecker, /不要求读完整个文档/u);
    assert.match(zhChecker, /不据此对全稿重新审查一遍/u);
    assert.match(zhChecker, /任何单个 checker 都不接收整份文档/u);
    assert.match(zhChecker, /每个 finding 写块标识、精确位置、证据和问题类型/u);
    assert.match(zhChecker, /文字修复交给新的独立 `zh-writer` 子任务/u);
    assert.match(zhChecker, /\*\*块标识\*\*：chunk-00X/u);
  });

  it('scopes fast and strict modes to one pass per chunk in both languages', () => {
    const mad = read('skills/writing-mad-writer/SKILL.md');
    assert.match(mad, /One pass means one write → check → fix pass over the authorized chunk, never a whole-document round trip/u);
    assert.match(mad, /The unit of work is the authorized chunk rather than the whole document/u);
    assert.match(mad, /shared chunking contract, quoted verbatim once here/u);

    const state = read('skills/writing-state-machine/SKILL.md');
    assert.match(state, /the delivery unit is the authorized chunk rather than the whole document/u);
    assert.match(state, /strict context isolation happens only on that explicit request/iu);
    assert.match(state, /## Scope Guidance/u);

    const zhMad = read('skills/zh-writing-mad-writer/SKILL.md');
    assert.match(zhMad, /一轮指这一块，不是整份文档的一次往返/u);
    assert.match(zhMad, /### 分块协议（本文件只在此处展开）/u);
    assert.match(zhMad, /交付单元是 Main 授权的一块，不是整份文档/u);

    const zhState = read('skills/zh-writing-state-machine/SKILL.md');
    assert.match(zhState, /交付单元是 Main 授权的一块/u);
    assert.match(zhState, /严格段落隔离只按第 5 步交回交接，不在块内等待用户/u);
    assert.doesNotMatch(zhState, /写完一段等用户确认/u);
    assert.match(zhState, /用户明确要求严格段落隔离时，块内每段处理完再重置上下文/u);
    assert.match(zhState, /## 范围建议/u);
  });

  it('keeps whole-document inventory with the scan while writers stay chunked', () => {
    const en = read('skills/format-humanizer/SKILL.md');
    assert.match(en, /Read the whole document once and produce a family/iu);
    assert.match(en, /The scan task inventories §32–§35 over the whole document/u);
    assert.match(en, /no\s+writer or checker has to ingest the whole document to revise one chunk/iu);
    assert.match(en, /no final whole-document polish pass/iu);
    assert.match(en, /The inventory covers the sentence-level families too: §36's/u);
    assert.match(en, /§37's unscoped\s+quantifiers \(all, any, only, always, never, every, must, exactly\)/u);
    assert.match(en, /§39's\s+anaphoric callback clauses/u);
    assert.match(en, /that chunk's original text/u);

    const zh = read('skills/zh-format-humanizer/SKILL.md');
    assert.match(zh, /这三项由扫描任务在全稿尺度计数并给出位置清单/u);
    assert.match(zh, /不为改一块而读整份文档/u);
    assert.match(zh, /不做最后整篇统一润色/u);
    assert.match(zh, /清单还要定位句级特征 S13 与 S14 的命中，S15 回指被动尾句同样在这一层定位，S16 回指回扣小句也在这里定位/u);
    assert.match(zh, /### S13\. 句内同义强调与铺垫、强调、复述链/u);
    assert.match(zh, /### S14\. 绝对化范围词/u);
    assert.match(zh, /### S15\. 回指被动尾句/u);
    assert.match(zh, /### S16\. 回指回扣小句/u);
  });

  it('carries sentence-level bans into slide and document handoff guidance', () => {
    const storyline = readConfig('skills/slides-storyline/SKILL.md');
    assert.match(storyline, /Also banned at the sentence level: a second half that only re-emphasizes or restates the first half/u);
    assert.match(storyline, /The Shape-the-story sentence-level bans extend to every body sentence/u);
    assert.match(storyline, /The task also checks the four sentence-level rules and reports each hit as a content finding/u);
    assert.match(storyline, /an anaphoric passive rider \(a complete main clause plus a comma and a with \+ object \+ past participle \+ by \+ anaphoric actor adjunct\), reported as a content finding so the wording returns to `writer`\/`zh-writer`/u);
    assert.match(storyline, /Necessary preconditions and qualifiers are never reported as violations/u);

    const quality = readConfig('skills/latex-beamer-slides/references/beamer-quality.md');
    assert.match(quality, /Sentence-level bans also apply on every page, fixed on first sighting/u);
    assert.match(quality, /Sentence-level tells are fixed on the same one-sighting basis/u);
    assert.match(quality, /都, 只能, 任何, 一定, 必然, 始终, 绝不, 全部, 唯一/u);

    const docx = readConfig('skills/docx/SKILL.md');
    assert.match(docx, /### Long-document chunk handoff/u);
    assert.match(docx, /never a resumed session or a whole-document\s+round trip/u);
    assert.match(docx, /`officecli validate` plus a rendered view/u);
  });

  it('keeps the writing workflow chunk-aware with sentence-level scope notes', async () => {
    const { workflowDefinitions } = await import(join(pluginDir, '..', '..', 'scripts', 'workflow-definitions.js'));
    const writing = workflowDefinitions.find(({ id }) => id === 'writing');
    const notes = writing.scopeNotes.join('\n');
    assert.match(notes, /Sentence-level information gain and emphasis, one-sighting in every language/u);
    assert.match(notes, /Absolute-quantifier scope check: all, any, only, always, never, every, must, exactly/u);
    assert.match(notes, /Long text orchestration is chunked and context-isolated/u);
    assert.match(notes, /stable ids \(chunk-001, chunk-002/u);
    assert.match(notes, /no runtime gate, no automatic retry loop, no plugin state, and no permission change/iu);
    const deAiStep = writing.suggestedFlow.find((step) => /de-AI/.test(step));
    assert.match(deAiStep, /bounded chunks/iu);
    assert.match(deAiStep, /fresh writer\/zh-writer sub-tasks/iu);
  });
});
