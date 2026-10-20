# AI scan calibration

`ai-scan-profile.json` records the corpus, the production feature values, the
human reference means and standard deviations, the directional weights, and the
per-document scores used by `writing_ai_scan`.

The reference was built from pre-2020 human articles and 2026 AI-written or
AI-assisted web articles. Raw source text is not vendored; the manifest lists
the source URLs, labels, extraction notes, and per-document results. Human labels
come from publication dates. AI labels come from self-disclosure or from
mass-produced AI-content-farm patterns, so they are weaker evidence than the
human labels.

The production scan uses `EN_WORD_RE` for English, `Intl.Segmenter` words for
Chinese lexical density, CJK characters for Chinese profile rates, and the
runtime `splitSentences` for sentence statistics. Recompute on a cleaned corpus
with:

```bash
node scripts/ai-scan-calibrate.mjs --corpus /path/to/corpus --out /tmp/ai-profile.json
```

The corpus directory uses four groups: `en-human`, `en-ai`, `zh-human`, and
`zh-ai`. Each group contains UTF-8 `.txt` files. Strip navigation, illustration
credits, share widgets, and site metadata before running the script; the shipped
run removed `[googlesitekit-end-of-content]`, `Share buttons by mashshare.net`,
`Illustration:`/`Photograph:` leads, Paul Graham date lines, and `数据来源` /
`生成时间` metadata.

The profile is calibrated on 10 human and 6–12 AI documents per language. It is
sensitive to genre, so the score is advisory distribution evidence, not an
authorship verdict.
