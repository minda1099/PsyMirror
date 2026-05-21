# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A pure-static psychology assessment site ("心镜 / PsyMirror") that hosts 10 classic Chinese-language scales (MBTI 简/详尽, BFI-44, PHQ-9, GAD-7, SDS, SAS, Holland RIASEC, Gallup 34 talents, 4D Leadership). Each scale is a single JSON file describing questions, scoring rules, and authoritative interpretations; the front-end loads the JSON, renders the test, runs the scorer, and shows a result with an **optional** AI deep-analysis pass via the Anthropic API. No backend, no build step, no dependencies.

## Running it locally

ES modules (`<script type="module">`) cannot be loaded via `file://`. Use a static server:

```bash
python3 -m http.server 8000      # then open http://localhost:8000
# or any other static server (npx serve, etc.)
```

To validate scale JSONs (after edits):

```bash
python3 -c "
import json, sys
for sid in ['mbti','bfi','phq9','gad7','sds','sas','holland']:
    d = json.load(open(f'scales/{sid}.json'))
    print(f'{sid}: {len(d[\"questions\"])} questions, {d[\"scoring\"][\"method\"]}')
"
```

## Architecture

Three HTML pages share one ES-module front-end:

- `index.html` → `js/app.js` — loads `scales/index.json`, renders cards grouped by category
- `test.html?scale=<id>` → `js/test-runner.js` — renders intro screen then one question at a time, stashes answers into `sessionStorage` under key `psycho:lastResult`
- `result.html?scale=<id>` → `js/result-renderer.js` — reads `sessionStorage`, calls `score()`, renders one of four interpretation layouts, offers optional AI analysis

The scoring engine `js/scorer.js` is **data-driven**: each scale declares `scoring.method` and `interpretation.type`, and the scorer dispatches on those values. To add a new scale category, you typically extend both — the dispatch tables are at the top of `score()` and `interpret()`.

### The 4 scoring × 4 interpretation combinations actually used

| `scoring.method`        | `interpretation.type`   | Used by                  | Stored answer value                |
| ----------------------- | ----------------------- | ------------------------ | ---------------------------------- |
| `sum`                   | `single-score-ranges`   | PHQ-9, GAD-7             | option's `value` (numeric)         |
| `sum-multiply`          | `single-score-ranges`   | SDS, SAS                 | option's `value`                   |
| `dimension-mean`        | `per-dimension-ranges`  | BFI-44, 4D Leadership    | option's `value`                   |
| `dimension-sum`         | `top-n-codes`           | Holland, Gallup 34       | option's `value`                   |
| `forced-choice-tally`   | `type-code`             | MBTI 简版 / 详尽版        | **option index** (not value)       |

The last row is the wrinkle worth flagging: for forced-choice scales, `test-runner.js` stores the **chosen option's index** (so the scorer can look up `question.options[index].dimension`); for Likert scales it stores the option's numeric `value`. See `valueFor()` in `test-runner.js:111`.

### Optional fields on `type-code` interpretations

MBTI 简版 uses only the base fields; MBTI 详尽版 opts into these extras (all per-type unless noted):

- `cognitiveFunctions` (interpretation-level) — `{ "Ni": { name, summary }, ... }` for all 8 functions.
- `stackLabels` (interpretation-level) — optional override of the 4 slot labels ("主导功能 Dominant", etc.).
- `functionStack` — array of 4 function codes (e.g. `["Ni","Te","Fi","Se"]` for INTJ); the renderer maps each into a card using `cognitiveFunctions[code]`.
- `workEnvironment` / `relationships` / `growthPath` — narrative strings rendered as dedicated sections.
- `motto` — single sentence rendered as an accent-bg blockquote near the bottom.

All extras are optional — the renderer omits each section if its field is absent.

### Optional fields on `top-n-codes` interpretations

Holland uses the base fields (`letters[id].{summary, careers}` + `codes[XYZ]`); Gallup 34 opts into these extras when the "code" combinatorics aren't meaningful (C(34,5) is too many to enumerate):

- `hideCodeSection: true` — skip the entire "你的兴趣代码: XYZ" section. Use when the concatenated top-N id string isn't a meaningful identifier.
- `dimensionsSectionLabel` / `perLetterSectionLabel` — override the section headings (defaults: "六维兴趣分数" / "主要维度解读").
- `domains: { <domain_id>: { name, themes: [<dim_id>...] } }` — when present, the bar chart is grouped under domain sub-headings, with each domain's themes sorted by score independently. Themes not listed in any domain are silently dropped from the chart, so cover all dims.
- `letters[id].detail` (paragraph string) and `letters[id].watchout` (single line) — extend the per-theme card beyond `summary` + `careers`. Useful for richer profiles like Gallup talents that need both an upside narrative and a watch-out hint.

### Optional fields on `per-dimension-ranges` interpretations

BFI uses defaults; 4D Leadership opts into these:

- `headerTitle` / `headerSubtitle` — override the result-page hero ("你的人格画像" by default).
- `dimensionsSectionLabel` / `perDimensionSectionLabel` — override the section headings ("各维度分数" / "各维度解读").
- `highlightDominant: true` + `dominantDescriptions: { <dim_id>: { title, summary, detail } }` — renders an accent-colored "dominant style" section above the bar chart, picking the highest-scoring dimension.

### Reverse-scoring

Likert questions can carry `"reverse": true`. The scorer normalizes via `max - v + min` (so for a 0-3 scale, 3↔0 and 2↔1; for a 1-5 scale, 5↔1 and 4↔2). SDS/SAS use this; BFI-44 has reverse items distributed across all 5 dimensions; PHQ-9/GAD-7/Holland have none.

### Result severity → theming

Range entries can carry `"severity": "minimal" | "mild" | "moderate" | "severe"`. `result-renderer.js` adds a `severity-*` class to `#result-root`, which retunes the `--accent` color (e.g. green for `minimal`, red for `severe`) used by the result header gradient. See the `.severity-*` rules in `css/style.css`.

### Optional AI analysis

`js/ai-analyzer.js` POSTs to Anthropic's `/v1/messages` with `stream: true` and the `anthropic-dangerous-direct-browser-access: true` header — that header is required for any browser-origin call. The user's API key is stored in `localStorage` under `psycho:apiKey`. The system prompt frames Claude as a clinical psychologist and the user prompt includes both the summary scores and the per-question answers so the model can comment on response patterns, not just totals.

If Anthropic ever revokes direct-browser access, the workaround is a tiny proxy — there is no other server-side code to retrofit.

## Adding a new scale

1. Create `scales/<id>.json` matching one of the (method, interpretation) pairs above. Cross-check field names against an existing scale of the same shape — there's no JSON schema enforcing this.
2. Append an entry to `scales/index.json` `scales[]` (with matching `id` and a `category` that's in `categories[]`).
3. **Avoid bare `"` inside string values.** Use Chinese 「」 corner brackets or typographic "" for quoted content. JSON only permits straight `"` as string boundaries; any inner quote must be `\"` or replaced.
4. If the scale needs a new scoring shape (e.g. weighted-sum, multi-stage branching), extend `score()` in `js/scorer.js` and add the matching interpretation branch in `interpret()`. The result-renderer dispatches on `interpretation.kind`, so add a `*Body()` function there too.

When writing the interpretation copy, lead with a one-sentence `summary`, follow with a `detail` paragraph that explains *why* this range/type means what it means (not just what it means), and end with concrete `suggestions[]`. The AI analyzer is a complement, not a replacement, so the static copy needs to stand on its own.

## Source attribution & licensing notes

`docs/references.md` is the authoritative source for each scale's origin, license, and Chinese-validation citations. Two scales (MBTI, Holland) deliberately use **self-authored** items rather than the copyrighted official questionnaires (MBTI® is a registered trademark; Holland's SDS/VPI are PAR-published). If you swap in alternate items, update both `scales/<id>.json` `source.note` and `docs/references.md` to keep the licensing claims accurate.

## Tone of the interpretation copy

The clinical-screener scales (PHQ-9, GAD-7, SDS, SAS) must always:

1. State that they are screening tools, not diagnoses.
2. Recommend professional help at moderate severity and above, with concrete next steps (timeframe, who to see).
3. Include crisis-hotline numbers at the severe level.

The personality/career scales (MBTI, BFI, Holland) must explicitly avoid framing any trait/type as "good" or "bad" — they describe trade-offs, not rankings. This is the project's editorial stance and should hold across any added scales.
