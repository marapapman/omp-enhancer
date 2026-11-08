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
  it('binds Main to one chunk at a time with a polisher call per chunk', () => {
    const writer = read('skills/writing-mad-writer/SKILL.md');
    assert.match(writer, /chunk-001, chunk-002/u);
    assert.match(writer, /English at most 1,200 words/u);
    assert.match(writer, /chunks are handled one at a time|contains exactly one chunk|one chunk at a time/iu);
    assert.match(writer, /frozen style pack/iu);
    assert.match(writer, /no final whole-document polish pass/iu);
    assert.match(writer, /The unit of work is the authorized chunk/u);
    assert.match(writer, /`polisher`/u);
    assert.match(writer, /call `polisher` once per prose segment/u);
    assert.match(writer, /inserts? (?:that returned|the returned) text verbatim/iu);
    assert.match(writer, /`polisher` call returns `ok:false`/u);
    assert.doesNotMatch(writer, /Section-level batch output/u);

    const state = read('skills/writing-state-machine/SKILL.md');
    assert.match(state, /The full chunk protocol is the shared chunking contract/u);
    assert.match(state, /quoted verbatim once[\s\S]{0,120}writing-mad-writer/u);
    assert.match(state, /`polisher`/u);
    assert.match(state, /call `polisher` once per prose segment/u);
    assert.match(state, /returned text verbatim|text `polisher` returned/iu);
    assert.doesNotMatch(state, /(?:`writer`|`zh-writer`) (?:text tool|sub-task)/iu);
  });

  it('keeps the Chinese chunk limits and per-chunk polishing in Main', () => {
    for (const name of ['zh-writing-mad-writer', 'zh-writing-state-machine']) {
      const source = read(`skills/${name}/SKILL.md`);

      assert.match(source, /分块协议/u);
      assert.match(source, /中文单块最多 2,000 个非空白字符/u);
      assert.match(source, /Main 一次只推进一块/u);
      assert.match(source, /冻结风格包/u);
      assert.match(source, /`polisher`/u);
      assert.match(source, /(?:交付|工作)单元是 Main 授权的一块/u);
      assert.match(source, /原样使用/u);
      assert.doesNotMatch(source, /分派新的 `zh-writer` 子任务/u);
    }

    const zhMad = read('skills/zh-writing-mad-writer/SKILL.md');
    assert.match(zhMad, /不把整份文档塞进一次 `polisher` 调用/u);
    assert.match(zhMad, /不把前块的完整往返历史带进下一块/u);
  });

  it('scopes fast and strict modes to one pass per chunk in both languages', () => {
    const mad = read('skills/writing-mad-writer/SKILL.md');
    assert.match(mad, /One pass means one write → check → fix pass over the authorized chunk, never a whole-document round trip/u);
    assert.match(mad, /The unit of work is the authorized chunk rather than the whole document/u);
    assert.match(mad, /shared chunking contract, quoted verbatim once here/u);

    const state = read('skills/writing-state-machine/SKILL.md');
    assert.match(state, /strict paragraph isolation/iu);
    assert.match(state, /explicitly requests? strict paragraph isolation/iu);
    assert.match(state, /## Scope Guidance/u);

    const zhMad = read('skills/zh-writing-mad-writer/SKILL.md');
    assert.match(zhMad, /一轮指这一块，不是整份文档的一次往返/u);
    assert.match(zhMad, /### 分块协议（本文件只在此处展开）/u);
    assert.match(zhMad, /(?:交付|工作)单元是 Main 授权的一块/u);

    const zhState = read('skills/zh-writing-state-machine/SKILL.md');
    assert.match(zhState, /(?:交付|工作)单元是 Main 授权的一块/u);
    assert.match(zhState, /严格段落隔离/u);
    assert.doesNotMatch(zhState, /写完一段等用户确认/u);
    assert.match(zhState, /## 范围建议/u);
  });

  it('keeps whole-document inventory with the scan while polishing stays chunked', () => {
    const en = read('skills/format-humanizer/SKILL.md');
    assert.match(en, /Read the whole document once and produce a family/iu);
    assert.match(en, /The scan (?:task )?inventories §32–§35 over the whole document/u);
    assert.match(en, /no final whole-document polish pass/iu);
    assert.match(en, /The inventory covers the sentence-level families too: §36's/u);
    assert.match(en, /§37's unscoped\s+quantifiers \(all, any, only, always, never, every, must, exactly\)/u);
    assert.match(en, /§39's\s+anaphoric callback clauses/u);
    assert.match(en, /that (?:chunk|passage)'s original text/u);
    assert.doesNotMatch(en, /no\s+writer or checker has to ingest the whole document/iu);

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
    assert.match(storyline, /an anaphoric passive rider \(a complete main clause plus a comma and a with \+ object \+ past participle \+ by \+ anaphoric actor adjunct\)[\s\S]{0,240}(?:returns? to|goes? back to|go back to) Main/iu);
    assert.match(storyline, /Necessary preconditions and qualifiers are never reported as violations/u);

    const quality = readConfig('skills/latex-beamer-slides/references/beamer-quality.md');
    assert.match(quality, /Sentence-level bans also apply on every page, fixed on first sighting/u);
    assert.match(quality, /Sentence-level tells are fixed on the same one-sighting basis/u);
    assert.match(quality, /都, 只能, 任何, 一定, 必然, 始终, 绝不, 全部, 唯一/u);

    const docx = readConfig('skills/docx/SKILL.md');
    assert.match(docx, /### Long-document chunk handoff/u);
    assert.match(docx, /never a\s+resumed session or a whole-document\s+round trip/u);
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
    assert.match(deAiStep, /one polisher pass per found family/iu);
  });
});
