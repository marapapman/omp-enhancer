---
name: slides-storyline
description: Develop the narrative and a numbered working outline for a new presentation. Use when a user wants a new deck, talk, lecture, pitch, or report presentation and the agent needs to establish audience, purpose, duration, language, key takeaway, evidence, and narrative arc. Do not use for ordinary edits to an existing deck.
---

# Slides Storyline

When this Skill is part of a `writer` or `zh-writer` assignment, that child
remains proposal-only: it runs no command and writes no file, and returns the
complete proposed artifact or diff. Main or a separate explicitly capable
Main-selected Agent owns authorized effects.

Turn the user's material into an explicit presentation story before authoring slides.

## Establish the brief

1. Reuse information already provided. Ask only when a missing choice materially changes the deck.
2. Establish the audience, purpose, setting, duration or target slide count, output language, single key takeaway, required topics, source material, and call to action or teaching outcome.
3. Separate supported facts from ideas that still need evidence. Do not invent examples, citations, numbers, results, or quotations to fill a narrative gap.

## Provisional technical story scaffold

When the deck explains a technical system or research contribution, start with this provisional default narrative scaffold:

1. **Background.** Establish the setting, problem, and reason the topic matters.
2. **Existing limitations.** Describe what current approaches cannot explain, support, or deploy, using evidence rather than generic criticism.
3. **Core idea.** State the central idea and explicitly connect it to the existing limitations it is meant to address.
4. **Concrete technical method.** Explain the system design, key components, data or control flow, and implementation choices needed to realize the core idea.
5. **Technical experimental effects.** Present the technical evaluation, comparison, ablation, or other evidence that shows what the method changes.
6. **System deployment effects.** Explain what happens when the method is integrated into a real system, including operational impact, application value, or remaining deployment limits.

This is a provisional starting scaffold, not a fixed order or final outline. Discuss it with the user and turn it into the specific framework and content outline for this deck. Adapt or replace it with the user's material, audience, and purpose; split, merge, or reorder sections when the evidence requires that change.
Use the scaffold as provisional per-slide slots: Background provides context, Existing limitations provides the tension or question, Core idea provides the explanation or evidence, Concrete technical method provides the mechanism, Technical experimental effects provides evidence or demonstration, and System deployment effects provides synthesis or action. Discuss this mapping with the user before committing the specific framework and content outline.

## Shape the story

1. Choose a narrative arc suited to the talk rather than imposing a fixed paper structure. Common moves include context, tension or question, explanation, evidence or demonstration, synthesis, and action.
2. Give every slide one job. Use concise working titles that state the point rather than generic labels such as “Background” when a more informative title is possible.
3. Budget time and density. Reserve space for title, transitions, examples, demonstrations, recap, discussion, and references when they serve the talk.
4. Keep claims, terminology, examples, and visual ideas traceable to the user's sources or mark them as decisions still needed.

## Text-only page draft

Before selecting images, authoring visuals, or writing layout code, produce a text-only page draft in section-sized batches. The batch size is a communication convenience; discuss every page.

1. For each page, provide its working title, narrative job, detailed body text, evidence or source basis, and a prose description of the intended visual role. Do not create or select the actual visual asset at this stage.
2. Write the body, captions, and explanations as complete natural-language sentences or paragraphs. Do not replace them with isolated phrases, keyword strings, or phrase-only bullet lists. A title may be concise, but it should state a complete thought when it carries the page's claim.
3. For Chinese slide text, when Main has declared and supplied the methods, apply `plain-chinese-writing` for direct and natural prose, `zh-format-humanizer` for evidence-based AI-like phrasing removal, and `zh-writing-review` for page-level clarity. Preserve facts, qualifiers, numbers, citations, and causal direction.
4. Discuss the draft page by page with the user. Revise the current batch from the user's feedback and keep unresolved content decisions visible instead of silently choosing them.

## Confirm the text plan

Present a numbered outline as the complete numbered page draft after the page-level discussion. State explicit assumptions and decisions that remain reversible. Wait for user confirmation before visual authoring begins. The user may confirm a batch after its pages are clear, but no page may enter the visual stage with unresolved content approval.

This confirmation is a REQUIRED conversational checkpoint requested by the user. "Not a plugin-owned gate or permission system" means the runtime never blocks you — it does not mean the confirmation is optional. Do not begin visual authoring without it. Once the text plan is confirmed, continue to visual authoring without asking for a second approval of the same text. Do not write a storyline file unless the user requests one or the project already uses one.
