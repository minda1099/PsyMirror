// Result page: load saved answers, run the scorer, render interpretation,
// and offer optional AI deep analysis.

import { loadScale } from "./scale-loader.js";
import { score } from "./scorer.js";
import { generateAIAnalysis } from "./ai-analyzer.js";

const root = document.getElementById("result-root");
const params = new URLSearchParams(location.search);
const scaleId = params.get("scale");

async function init() {
  const saved = sessionStorage.getItem("psycho:lastResult");
  if (!scaleId || !saved) {
    root.innerHTML = `<div class="error">没有可显示的结果。请先<a href="index.html">选择量表</a>开始测试。</div>`;
    return;
  }

  let payload;
  try { payload = JSON.parse(saved); } catch { payload = null; }
  if (!payload || payload.scaleId !== scaleId) {
    root.innerHTML = `<div class="error">结果数据无效, 请重新测试。</div>`;
    return;
  }

  try {
    const scale = await loadScale(scaleId);
    document.title = `${scale.shortName || scale.name} 测评结果 · 心镜`;
    const result = score(scale, payload.answers);
    render(scale, result, payload);
  } catch (e) {
    root.innerHTML = `<div class="error">渲染结果失败: ${e.message}</div>`;
    console.error(e);
  }
}

function render(scale, result, payload) {
  const interp = result.interpretation;
  const severity = severityClassFor(interp);

  root.className = severity ? `severity-${severity}` : "";

  const header = headerHtml(scale, result, interp);
  const body = bodyHtml(scale, result, interp);

  root.innerHTML = `
    ${header}
    ${body}
    ${aiSectionHtml(scale, result)}
    <div class="result-actions">
      <a class="btn" href="index.html">返回量表列表</a>
      <a class="btn" href="test.html?scale=${encodeURIComponent(scale.id)}">重新测试</a>
      <button class="btn" id="copy-btn">复制结果</button>
    </div>
  `;

  wireAiSection(scale, result, payload);
  root.querySelector("#copy-btn")?.addEventListener("click", () => copyResult(scale, result));
}

/* -------------------------------------------------------------------- */
/* Header — big level/score summary                                      */
/* -------------------------------------------------------------------- */
function headerHtml(scale, result, interp) {
  if (interp.kind === "single") {
    const m = interp.match;
    return `
      <div class="result-header">
        <div class="scale-tag">${scale.shortName || scale.id.toUpperCase()} 测评结果</div>
        <h1>${escapeHtml(m?.level ?? "未知")}</h1>
        <div class="muted">总分 <strong>${result.total}</strong> / ${result.maxTotal}</div>
        <p class="level-summary">${escapeHtml(m?.summary ?? "")}</p>
      </div>
    `;
  }
  if (interp.kind === "type") {
    const t = interp.type || {};
    return `
      <div class="result-header">
        <div class="scale-tag">${scale.shortName || scale.id.toUpperCase()} 测评结果</div>
        <h1>${escapeHtml(interp.code)} · ${escapeHtml(t.name || "")}</h1>
        ${t.nickname ? `<div class="muted">${escapeHtml(t.nickname)}</div>` : ""}
        <p class="level-summary">${escapeHtml(t.summary || "")}</p>
      </div>
    `;
  }
  if (interp.kind === "top-n") {
    const c = interp.combined;
    return `
      <div class="result-header">
        <div class="scale-tag">${scale.shortName || scale.id.toUpperCase()} 测评结果</div>
        <h1>${escapeHtml(interp.code)}</h1>
        ${c?.name ? `<div class="muted">${escapeHtml(c.name)}</div>` : ""}
        <p class="level-summary">${escapeHtml(c?.summary || "你的兴趣组合反映了独特的职业倾向, 详见下方分析。")}</p>
      </div>
    `;
  }
  if (interp.kind === "per-dimension") {
    const i = scale.interpretation;
    const title = i.headerTitle || "你的人格画像";
    const subtitle = i.headerSubtitle || "下面是各维度上的得分情况, 每个维度都没有好与坏之分。";
    return `
      <div class="result-header">
        <div class="scale-tag">${scale.shortName || scale.id.toUpperCase()} 测评结果</div>
        <h1>${escapeHtml(title)}</h1>
        <p class="level-summary">${escapeHtml(subtitle)}</p>
      </div>
    `;
  }
  return "";
}

/* -------------------------------------------------------------------- */
/* Body — detailed interpretation                                        */
/* -------------------------------------------------------------------- */
function bodyHtml(scale, result, interp) {
  if (interp.kind === "single") return singleRangesBody(scale, result, interp);
  if (interp.kind === "per-dimension") return perDimensionBody(scale, result, interp);
  if (interp.kind === "type") return typeBody(scale, result, interp);
  if (interp.kind === "top-n") return topNBody(scale, result, interp);
  return "";
}

function singleRangesBody(scale, result, interp) {
  const m = interp.match;
  if (!m) return "";
  return `
    <section class="result-section">
      <h2>分数概览</h2>
      <div class="score-grid">
        <div class="score-card">
          <div class="label">原始分</div>
          <div class="value">${result.raw}<small> / ${(result.maxTotal / (result.multiplier || 1)).toFixed(0)}</small></div>
        </div>
        ${result.multiplier && result.multiplier !== 1 ? `
        <div class="score-card">
          <div class="label">标准分 (×${result.multiplier})</div>
          <div class="value">${result.total}</div>
        </div>` : ""}
        <div class="score-card">
          <div class="label">分级</div>
          <div class="value" style="font-size: 1.2rem">${escapeHtml(m.level)}</div>
        </div>
      </div>
    </section>

    <section class="result-section">
      <h2>专业解读</h2>
      ${paragraphs(m.detail || "")}
    </section>

    ${m.suggestions?.length ? `
    <section class="result-section">
      <h2>建议</h2>
      <ul class="suggestions-list">
        ${m.suggestions.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}
      </ul>
    </section>` : ""}

    ${scale.interpretation.allRangesNote ? `
    <section class="result-section">
      <h2>评分参考表</h2>
      <p class="muted">${escapeHtml(scale.interpretation.allRangesNote)}</p>
      <table style="width:100%; border-collapse: collapse;">
        <thead><tr style="text-align:left; border-bottom: 1px solid var(--border);">
          <th style="padding:0.5rem 0.4rem">分数</th><th style="padding:0.5rem 0.4rem">分级</th>
        </tr></thead>
        <tbody>
          ${scale.interpretation.ranges.map((r) => `
            <tr style="border-bottom: 1px solid var(--border);">
              <td style="padding:0.5rem 0.4rem">${r.min} – ${r.max}</td>
              <td style="padding:0.5rem 0.4rem">${escapeHtml(r.level)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </section>` : ""}
  `;
}

function perDimensionBody(scale, result, interp) {
  const dims = Object.values(interp.dimensions);
  const i = scale.interpretation;
  const dimsLabel = i.dimensionsSectionLabel || "各维度分数";
  const detailLabel = i.perDimensionSectionLabel || "各维度解读";

  // Optional: highlight the highest-scoring dimension as the "dominant" style.
  let dominantSection = "";
  if (i.highlightDominant && i.dominantDescriptions) {
    const top = [...dims].sort((a, b) => b.dimension.score - a.dimension.score)[0];
    const dom = i.dominantDescriptions[top.dimension.id];
    if (dom) {
      dominantSection = `
        <section class="result-section" style="background: linear-gradient(135deg, var(--accent-soft), var(--bg-card));">
          <h2 style="border-bottom: none; padding-bottom: 0;">${escapeHtml(dom.title)}</h2>
          <p style="font-size: 1.05rem; margin: 0.3rem 0 1rem; color: var(--fg);">${escapeHtml(dom.summary)}</p>
          ${paragraphs(dom.detail || "")}
        </section>
      `;
    }
  }

  return `
    ${dominantSection}
    <section class="result-section">
      <h2>${escapeHtml(dimsLabel)}</h2>
      ${dims.map((d) => {
        const dim = d.dimension;
        const pct = ((dim.score - dim.min) / (dim.max - dim.min)) * 100;
        return `
          <div class="dimension-bar">
            <div class="label-row">
              <strong>${escapeHtml(dim.name)}</strong>
              <span class="pct">${dim.score} / ${dim.max} <span class="level-tag">${escapeHtml(d.match?.level ?? "")}</span></span>
            </div>
            <div class="bar"><div class="fill" style="width: ${Math.max(2, Math.min(100, pct))}%"></div></div>
          </div>
        `;
      }).join("")}
    </section>

    <section class="result-section">
      <h2>${escapeHtml(detailLabel)}</h2>
      ${dims.map((d) => `
        <div style="margin-bottom: 1.5rem;">
          <h3 style="margin-bottom: 0.3rem;">${escapeHtml(d.dimension.name)} — ${escapeHtml(d.match?.level ?? "")}</h3>
          ${paragraphs(d.match?.detail || "")}
        </div>
      `).join("")}
    </section>
  `;
}

function typeBody(scale, result, interp) {
  const t = interp.type || {};
  const axes = result.axes || [];
  const cogFns = scale.interpretation.cognitiveFunctions;
  const stackLabels = scale.interpretation.stackLabels || {
    0: "主导功能 Dominant",
    1: "辅助功能 Auxiliary",
    2: "第三功能 Tertiary",
    3: "劣势功能 Inferior",
  };

  const stackSection = (t.functionStack?.length === 4 && cogFns)
    ? `<section class="result-section">
        <h2>认知功能堆栈</h2>
        <p class="muted" style="margin-bottom:1rem;">Jung 理论认为每个类型由 4 个有序的认知功能组成。主导功能是你最得心应手的, 劣势功能是你最容易忽视、也是中年后成长方向的所在。</p>
        ${t.functionStack.map((fnCode, idx) => {
          const fn = cogFns[fnCode];
          if (!fn) return "";
          return `
            <div class="function-card">
              <div class="function-card-head">
                <span class="function-pos">${escapeHtml(stackLabels[idx] || `第 ${idx+1} 功能`)}</span>
                <strong>${escapeHtml(fn.name)}</strong>
              </div>
              <p>${escapeHtml(fn.summary)}</p>
            </div>
          `;
        }).join("")}
      </section>`
    : "";

  return `
    <section class="result-section">
      <h2>四个维度倾向</h2>
      ${axes.map((a) => {
        const [p1, p2] = a.poles;
        const total = a.counts[p1] + a.counts[p2] || 1;
        const p1pct = Math.round((a.counts[p1] / total) * 100);
        return `
          <div class="dimension-bar">
            <div class="label-row">
              <strong>${p1} ${escapeHtml(scale.interpretation.axisLabels?.[p1] || "")}</strong>
              <span class="pct">${p1pct}% / ${100 - p1pct}%</span>
              <strong>${escapeHtml(scale.interpretation.axisLabels?.[p2] || "")} ${p2}</strong>
            </div>
            <div class="bar" style="background: linear-gradient(90deg, var(--accent) ${p1pct}%, var(--bg-soft) ${p1pct}%);"></div>
          </div>
        `;
      }).join("")}
    </section>

    ${t.detail ? `<section class="result-section"><h2>类型描述</h2>${paragraphs(t.detail)}</section>` : ""}
    ${stackSection}
    ${t.strengths?.length ? `<section class="result-section"><h2>优势</h2><ul class="suggestions-list">${t.strengths.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul></section>` : ""}
    ${t.weaknesses?.length ? `<section class="result-section"><h2>潜在挑战</h2><ul class="suggestions-list">${t.weaknesses.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul></section>` : ""}
    ${t.workEnvironment ? `<section class="result-section"><h2>工作环境偏好</h2>${paragraphs(t.workEnvironment)}</section>` : ""}
    ${t.relationships ? `<section class="result-section"><h2>人际关系模式</h2>${paragraphs(t.relationships)}</section>` : ""}
    ${t.growthPath ? `<section class="result-section"><h2>成长方向</h2>${paragraphs(t.growthPath)}</section>` : ""}
    ${t.careers?.length ? `<section class="result-section"><h2>适合的职业方向</h2><p>${t.careers.map(escapeHtml).join("、")}</p></section>` : ""}
    ${t.famous?.length ? `<section class="result-section"><h2>同类型的代表人物</h2><p class="muted">${t.famous.map(escapeHtml).join("、")}</p></section>` : ""}
    ${t.motto ? `<section class="result-section" style="background: var(--accent-soft); text-align:center;"><blockquote style="margin:0; font-family:var(--font-serif); font-size:1.2rem; font-style:italic;">「${escapeHtml(t.motto)}」</blockquote></section>` : ""}
  `;
}

function topNBody(scale, result, interp) {
  const sorted = interp.sorted;
  const allDims = sorted;
  return `
    <section class="result-section">
      <h2>六维兴趣分数</h2>
      ${allDims.map((d) => {
        const pct = ((d.score - d.min) / (d.max - d.min)) * 100;
        return `
          <div class="dimension-bar">
            <div class="label-row">
              <strong>${escapeHtml(d.id)} · ${escapeHtml(d.name)}</strong>
              <span class="pct">${d.score} / ${d.max}</span>
            </div>
            <div class="bar"><div class="fill" style="width: ${Math.max(2, Math.min(100, pct))}%"></div></div>
          </div>
        `;
      }).join("")}
    </section>

    <section class="result-section">
      <h2>你的兴趣代码: ${escapeHtml(interp.code)}</h2>
      ${interp.combined?.detail ? paragraphs(interp.combined.detail) : ""}
      ${interp.combined?.careers?.length ? `<p><strong>代表性职业: </strong>${interp.combined.careers.map(escapeHtml).join("、")}</p>` : ""}
    </section>

    <section class="result-section">
      <h2>主要维度解读</h2>
      ${interp.perLetter.map((p) => `
        <div style="margin-bottom: 1.2rem;">
          <h3>${escapeHtml(p.dimension.id)} · ${escapeHtml(p.dimension.name)}</h3>
          ${p.info?.summary ? `<p>${escapeHtml(p.info.summary)}</p>` : ""}
          ${p.info?.careers?.length ? `<p class="muted">典型职业: ${p.info.careers.map(escapeHtml).join("、")}</p>` : ""}
        </div>
      `).join("")}
    </section>
  `;
}

/* -------------------------------------------------------------------- */
/* AI deep analysis (optional)                                           */
/* -------------------------------------------------------------------- */
function aiSectionHtml(scale, result) {
  const apiKey = localStorage.getItem("psycho:apiKey") || "";
  return `
    <section class="result-section ai-section">
      <h2><span class="sparkle">✦</span> AI 深度分析 (可选)</h2>
      <p class="muted">使用大模型, 基于你的回答模式给出更个性化、更深入的解读。仅当你提供 API Key 时启用; Key 仅保存在你的浏览器本地。</p>
      <div class="ai-config">
        <label for="api-key">Anthropic API Key (sk-ant-...) </label>
        <input id="api-key" type="password" placeholder="sk-ant-..." value="${escapeHtml(apiKey)}" autocomplete="off" />
      </div>
      <button class="btn btn-primary" id="ai-btn">${apiKey ? "生成深度分析" : "保存 Key 并生成"}</button>
      <div class="ai-output" id="ai-output"></div>
    </section>
  `;
}

function wireAiSection(scale, result, payload) {
  const btn = root.querySelector("#ai-btn");
  const keyInput = root.querySelector("#api-key");
  const out = root.querySelector("#ai-output");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const key = keyInput.value.trim();
    if (!key) { out.textContent = "请先填入 API Key。"; return; }
    localStorage.setItem("psycho:apiKey", key);
    btn.disabled = true;
    btn.textContent = "生成中, 请稍候…";
    out.textContent = "";
    try {
      const text = await generateAIAnalysis({ scale, result, answers: payload.answers, apiKey: key }, (chunk) => {
        out.textContent += chunk;
      });
      if (!out.textContent && text) out.textContent = text;
    } catch (e) {
      out.textContent = `生成失败: ${e.message}\n\n常见原因: API Key 无效、网络问题, 或浏览器 CORS 限制。`;
    } finally {
      btn.disabled = false;
      btn.textContent = "重新生成";
    }
  });
}

/* -------------------------------------------------------------------- */
/* utils                                                                 */
/* -------------------------------------------------------------------- */
function severityClassFor(interp) {
  if (interp.kind !== "single") return null;
  return interp.match?.severity || null;
}

function copyResult(scale, result) {
  const interp = result.interpretation;
  let text = `${scale.name}\n`;
  if (interp.kind === "single") {
    text += `分数: ${result.total} / ${result.maxTotal}\n分级: ${interp.match?.level}\n\n${interp.match?.summary}\n`;
  } else if (interp.kind === "type") {
    text += `类型: ${interp.code} ${interp.type?.name || ""}\n\n${interp.type?.summary || ""}\n`;
  } else if (interp.kind === "top-n") {
    text += `代码: ${interp.code}\n\n${interp.combined?.summary || ""}\n`;
  } else if (interp.kind === "per-dimension") {
    text += "各维度: \n";
    for (const d of Object.values(interp.dimensions)) {
      text += `· ${d.dimension.name}: ${d.dimension.score} (${d.match?.level})\n`;
    }
  }
  text += `\n— 心镜 · ${location.origin}`;
  navigator.clipboard?.writeText(text).then(
    () => { const b = root.querySelector("#copy-btn"); if (b) { b.textContent = "已复制 ✓"; setTimeout(() => b.textContent = "复制结果", 1500); } },
    () => alert("复制失败, 请手动选择文字复制。"),
  );
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function paragraphs(text) {
  return String(text).split(/\n\s*\n/).filter(Boolean).map((p) => `<p>${escapeHtml(p.trim())}</p>`).join("");
}

init();
