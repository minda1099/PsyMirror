// Optional AI deep-analysis via Anthropic Messages API (streaming).
// The user supplies their own API key, stored in localStorage; the request
// goes browser → api.anthropic.com directly.
//
// Note on CORS: as of late 2025, Anthropic added a `anthropic-dangerous-direct-browser-access: true`
// request header that opts a browser request in to the public API. We set it here.
// If Anthropic disables direct-browser access in the future, the user will see a CORS error.

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

export async function generateAIAnalysis({ scale, result, answers, apiKey }, onChunk) {
  const prompt = buildPrompt(scale, result, answers);
  const body = {
    model: MODEL,
    max_tokens: 1500,
    stream: true,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  };

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`API 返回 ${res.status}: ${errText.slice(0, 200)}`);
  }

  // Parse SSE stream
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";
    for (const evt of events) {
      const lines = evt.split("\n");
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const obj = JSON.parse(payload);
          if (obj.type === "content_block_delta" && obj.delta?.type === "text_delta") {
            full += obj.delta.text;
            onChunk?.(obj.delta.text);
          }
        } catch { /* ignore non-JSON */ }
      }
    }
  }
  return full;
}

const SYSTEM_PROMPT = `你是一位资深的心理咨询师和心理测量学家, 熟悉 DSM-5、ICD-11 以及人格心理学的主流理论 (大五人格、MBTI/Jungian 类型、Holland 职业兴趣等)。

你的任务是: 基于用户在某个心理量表上的得分, 给出一段专业、温暖、有深度的个性化解读。

要求:
1. 不要只是复述分数。结合具体得分模式 (例如某些维度异常高/低、某些题项组合) 给出洞察。
2. 语言专业但温暖, 避免说教, 避免病理化标签。
3. 若涉及心理健康量表 (PHQ-9/GAD-7/SDS/SAS), 必须强调本结果非临床诊断, 严重时应寻求专业帮助。
4. 长度控制在 400-700 字之间。
5. 用纯文本输出, 适当使用空行分段, 不要 Markdown 标题。
6. 用中文。`;

function buildPrompt(scale, result, answers) {
  const lines = [];
  lines.push(`量表: ${scale.name} (${scale.shortName})`);
  if (scale.source?.author) lines.push(`来源: ${scale.source.author}${scale.source.year ? `, ${scale.source.year}` : ""}`);
  lines.push("");
  lines.push("【用户结果】");

  const interp = result.interpretation;
  if (interp.kind === "single") {
    lines.push(`总分: ${result.total} (满分 ${result.maxTotal})`);
    lines.push(`分级: ${interp.match?.level}`);
    lines.push(`官方解读: ${interp.match?.summary || ""}`);
  } else if (interp.kind === "type") {
    lines.push(`类型代码: ${interp.code}`);
    lines.push(`类型名称: ${interp.type?.name || ""}`);
    lines.push("四维倾向:");
    for (const a of result.axes || []) {
      const [p1, p2] = a.poles;
      lines.push(`  ${p1}:${a.counts[p1]}  vs  ${p2}:${a.counts[p2]}  → ${a.winner} (强度 ${a.strength}%)`);
    }
  } else if (interp.kind === "per-dimension") {
    lines.push("各维度得分:");
    for (const d of Object.values(interp.dimensions)) {
      lines.push(`  ${d.dimension.name}: ${d.dimension.score} / ${d.dimension.max} (${d.match?.level})`);
    }
  } else if (interp.kind === "top-n") {
    lines.push(`兴趣代码: ${interp.code}`);
    lines.push("六维得分:");
    for (const d of interp.sorted) {
      lines.push(`  ${d.id} ${d.name}: ${d.score} / ${d.max}`);
    }
  }

  lines.push("");
  lines.push("【题目-作答详情 (用于发现模式)】");
  const isFC = scale.scale?.type === "forced-choice";
  const N = Math.min(scale.questions.length, 60);
  for (let i = 0; i < N; i++) {
    const q = scale.questions[i];
    const a = answers[i];
    if (a == null) continue;
    if (isFC) {
      const opt = q.options[a];
      lines.push(`${i + 1}. ${q.text}  →  ${opt?.label} [${opt?.dimension}]`);
    } else {
      const opt = scale.scale.options.find((o) => o.value === a);
      lines.push(`${i + 1}. ${q.text}  →  ${opt?.label} (${a})${q.reverse ? " [反向题]" : ""}`);
    }
  }

  lines.push("");
  lines.push("请给出 400-700 字的个性化专业解读, 不要用 Markdown 标题, 空行分段, 中文。");
  return lines.join("\n");
}
