// Scoring engine. Given a scale definition + an array of answer values
// (or, for forced-choice scales, an array of option indices), returns
// a structured `ScoreResult` consumed by result-renderer.js.
//
// Supported `scoring.method` values:
//   - "sum"                : sum of all answer numeric values (with reverse coding via `reverse:true` on a question)
//   - "sum-multiply"       : same as sum, then multiplied by `multiplier` (e.g. SDS/SAS ×1.25)
//   - "dimension-sum"      : per-dimension sums, identified by question.dimension
//   - "dimension-mean"     : per-dimension arithmetic mean
//   - "forced-choice-tally": for binary forced-choice scales (MBTI), each option carries a `dimension` letter; the pole with more votes wins
//
// Supported `interpretation.type` values:
//   - "single-score-ranges"  : one numeric score → matched against `ranges[]`
//   - "per-dimension-ranges" : each dimension → matched against `ranges[dimId][]`
//   - "type-code"            : concatenate winning poles per axis → look up `types[code]`
//   - "top-n-codes"          : sort dimensions by score, take top N → look up `codes[combinedKey]` (fallback per-letter)

const REVERSE_MAX_BY_OPTIONS = new Map(); // memoize per scale

/** @returns {ScoreResult} */
export function score(scale, answers) {
  const method = scale.scoring.method;
  let raw;
  switch (method) {
    case "sum":
    case "sum-multiply":
      raw = scoreSum(scale, answers, method === "sum-multiply" ? scale.scoring.multiplier ?? 1.25 : 1);
      break;
    case "dimension-sum":
      raw = scoreDimension(scale, answers, "sum");
      break;
    case "dimension-mean":
      raw = scoreDimension(scale, answers, "mean");
      break;
    case "forced-choice-tally":
      raw = scoreForcedChoice(scale, answers);
      break;
    default:
      throw new Error(`未知计分方式: ${method}`);
  }

  const interpretation = interpret(scale, raw);
  return { method, ...raw, interpretation };
}

/* -------------------------------------------------------------------- */
/* sum / sum-multiply                                                    */
/* -------------------------------------------------------------------- */
function scoreSum(scale, answers, multiplier) {
  let raw = 0;
  const maxPerItem = optionMax(scale);
  scale.questions.forEach((q, i) => {
    const v = answers[i];
    if (v == null) return;
    raw += q.reverse ? maxPerItem - v + optionMin(scale) : v;
  });
  const total = raw * multiplier;
  return {
    raw,
    multiplier,
    total: round1(total),
    maxTotal: round1(scale.questions.length * maxPerItem * multiplier),
    minTotal: round1(scale.questions.length * optionMin(scale) * multiplier),
  };
}

/* -------------------------------------------------------------------- */
/* dimension-sum / dimension-mean                                        */
/* -------------------------------------------------------------------- */
function scoreDimension(scale, answers, agg) {
  const maxPerItem = optionMax(scale);
  const minPerItem = optionMin(scale);
  const dims = {};
  for (const d of scale.scoring.dimensions) {
    dims[d.id] = { id: d.id, name: d.name, sum: 0, count: 0, items: [] };
  }
  scale.questions.forEach((q, i) => {
    const d = dims[q.dimension];
    if (!d) return;
    const v = answers[i];
    if (v == null) return;
    const eff = q.reverse ? maxPerItem - v + minPerItem : v;
    d.sum += eff;
    d.count += 1;
    d.items.push(eff);
  });
  for (const d of Object.values(dims)) {
    d.score = agg === "mean" ? (d.count ? round2(d.sum / d.count) : 0) : d.sum;
    d.max = agg === "mean" ? maxPerItem : d.count * maxPerItem;
    d.min = agg === "mean" ? minPerItem : d.count * minPerItem;
  }
  return { dimensions: dims };
}

/* -------------------------------------------------------------------- */
/* forced-choice-tally (MBTI)                                            */
/* -------------------------------------------------------------------- */
function scoreForcedChoice(scale, answers) {
  const axes = scale.scoring.axes; // [{id, poles:[A,B]}, ...]
  const tally = {};
  for (const ax of axes) for (const pole of ax.poles) tally[pole] = 0;

  scale.questions.forEach((q, i) => {
    const choice = answers[i];
    if (choice == null) return;
    const opt = q.options[choice];
    if (opt && opt.dimension) tally[opt.dimension] = (tally[opt.dimension] || 0) + 1;
  });

  const axesResult = axes.map((ax) => {
    const [a, b] = ax.poles;
    const aCount = tally[a] || 0;
    const bCount = tally[b] || 0;
    const total = aCount + bCount || 1;
    const winner = aCount >= bCount ? a : b;
    return {
      id: ax.id,
      poles: ax.poles,
      counts: { [a]: aCount, [b]: bCount },
      winner,
      strength: Math.round((Math.max(aCount, bCount) / total) * 100),
    };
  });

  const code = axesResult.map((a) => a.winner).join("");
  return { axes: axesResult, code };
}

/* -------------------------------------------------------------------- */
/* Interpretation                                                        */
/* -------------------------------------------------------------------- */
function interpret(scale, raw) {
  const t = scale.interpretation.type;
  if (t === "single-score-ranges") {
    const target = raw.total;
    const match = scale.interpretation.ranges.find((r) => target >= r.min && target <= r.max);
    return { kind: "single", match };
  }
  if (t === "per-dimension-ranges") {
    const out = {};
    for (const d of Object.values(raw.dimensions)) {
      const ranges = scale.interpretation.ranges[d.id] || [];
      const match = ranges.find((r) => d.score >= (r.min ?? -Infinity) && d.score <= (r.max ?? Infinity));
      out[d.id] = { dimension: d, match };
    }
    return { kind: "per-dimension", dimensions: out };
  }
  if (t === "type-code") {
    const type = scale.interpretation.types[raw.code];
    return { kind: "type", code: raw.code, type };
  }
  if (t === "top-n-codes") {
    // raw.dimensions for dimension-sum/mean. Order by score desc.
    const sorted = Object.values(raw.dimensions).sort((a, b) => b.score - a.score);
    const n = scale.interpretation.topN || 3;
    const top = sorted.slice(0, n);
    const code = top.map((d) => d.id).join("");
    const combined = scale.interpretation.codes?.[code] || null;
    const perLetter = top.map((d) => ({
      dimension: d,
      info: scale.interpretation.letters?.[d.id] || null,
    }));
    return { kind: "top-n", code, combined, perLetter, sorted };
  }
  return { kind: "unknown" };
}

/* -------------------------------------------------------------------- */
/* Helpers                                                              */
/* -------------------------------------------------------------------- */
function optionMax(scale) {
  if (REVERSE_MAX_BY_OPTIONS.has(scale.id + "_max")) return REVERSE_MAX_BY_OPTIONS.get(scale.id + "_max");
  const m = Math.max(...scale.scale.options.map((o) => o.value ?? 0));
  REVERSE_MAX_BY_OPTIONS.set(scale.id + "_max", m);
  return m;
}
function optionMin(scale) {
  if (REVERSE_MAX_BY_OPTIONS.has(scale.id + "_min")) return REVERSE_MAX_BY_OPTIONS.get(scale.id + "_min");
  const m = Math.min(...scale.scale.options.map((o) => o.value ?? 0));
  REVERSE_MAX_BY_OPTIONS.set(scale.id + "_min", m);
  return m;
}
function round1(n) { return Math.round(n * 10) / 10; }
function round2(n) { return Math.round(n * 100) / 100; }
