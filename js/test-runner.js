// Test-taking page logic. Renders one question at a time, collects answers,
// and on submit stashes them into sessionStorage before navigating to results.

import { loadScale } from "./scale-loader.js";

const root = document.getElementById("test-root");
const params = new URLSearchParams(location.search);
const scaleId = params.get("scale");

let scale = null;
let answers = [];
let currentIndex = 0;

async function init() {
  if (!scaleId) {
    root.innerHTML = `<div class="error">缺少参数: 请从首页选择一个量表</div>`;
    return;
  }
  try {
    scale = await loadScale(scaleId);
    answers = new Array(scale.questions.length).fill(null);
    document.title = `${scale.shortName || scale.name} · 心镜`;
    renderIntro();
  } catch (e) {
    root.innerHTML = `<div class="error">无法加载量表: ${e.message}</div>`;
  }
}

function renderIntro() {
  const minutes = scale.estimatedMinutes ?? Math.ceil(scale.questions.length / 5);
  root.innerHTML = `
    <section class="test-intro">
      <div class="cat">${scale.shortName || scale.id.toUpperCase()}</div>
      <h1>${scale.name}</h1>
      <p class="muted">${scale.tagline || ""}</p>

      <div class="meta-row">
        <span><strong>${scale.questions.length}</strong> 道题</span>
        <span>约 <strong>${minutes}</strong> 分钟</span>
        ${scale.source?.author ? `<span>来源: <strong>${escapeHtml(scale.source.author)}${scale.source.year ? ` (${scale.source.year})` : ""}</strong></span>` : ""}
      </div>

      ${scale.intro ? `<div>${paragraphs(scale.intro)}</div>` : ""}
      ${scale.instructions ? `<div class="instructions"><strong>作答说明: </strong>${escapeHtml(scale.instructions)}</div>` : ""}
      ${scale.disclaimer ? `<div class="disclaimer">${escapeHtml(scale.disclaimer)}</div>` : ""}

      <button class="btn btn-primary btn-large" id="start-btn">开始测试</button>
    </section>
  `;
  document.getElementById("start-btn").addEventListener("click", () => {
    currentIndex = 0;
    renderQuestion();
  });
}

function renderQuestion() {
  const q = scale.questions[currentIndex];
  const total = scale.questions.length;
  const progress = Math.round(((currentIndex) / total) * 100);

  const isForcedChoice = scale.scale?.type === "forced-choice";
  const options = isForcedChoice ? q.options : scale.scale.options;
  const selected = answers[currentIndex];

  root.innerHTML = `
    <div class="progress-text">
      <span>第 ${currentIndex + 1} 题, 共 ${total} 题</span>
      <span>${progress}%</span>
    </div>
    <div class="progress-bar"><div style="width: ${progress}%"></div></div>

    <div class="question-card">
      <div class="question-text">
        <span class="qnum">${currentIndex + 1}</span>${escapeHtml(q.text)}
      </div>
      <div class="options-list">
        ${options.map((opt, idx) => `
          <button class="option-btn ${selected === valueFor(opt, idx, isForcedChoice) ? "selected" : ""}"
                  data-idx="${idx}">
            <span class="option-marker"></span>
            <span>${escapeHtml(opt.label)}</span>
          </button>
        `).join("")}
      </div>
    </div>

    <div class="test-controls">
      <button class="btn" id="prev-btn" ${currentIndex === 0 ? "disabled" : ""}>← 上一题</button>
      <button class="btn btn-primary" id="next-btn" disabled>
        ${currentIndex === total - 1 ? "提交并查看结果 →" : "下一题 →"}
      </button>
    </div>
  `;

  // Wire option buttons
  root.querySelectorAll(".option-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.idx);
      const v = valueFor(options[idx], idx, isForcedChoice);
      answers[currentIndex] = v;
      // Re-render the options-list to update selection styles
      root.querySelectorAll(".option-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      root.querySelector("#next-btn").disabled = false;
    });
  });

  root.querySelector("#prev-btn").addEventListener("click", () => {
    if (currentIndex > 0) {
      currentIndex--;
      renderQuestion();
    }
  });

  const nextBtn = root.querySelector("#next-btn");
  if (answers[currentIndex] != null) nextBtn.disabled = false;
  nextBtn.addEventListener("click", () => {
    if (answers[currentIndex] == null) return;
    if (currentIndex === scale.questions.length - 1) {
      submit();
    } else {
      currentIndex++;
      renderQuestion();
    }
  });
}

function valueFor(opt, idx, isForcedChoice) {
  // For forced-choice scales, we store the chosen option index (so the scorer
  // can look up `q.options[index].dimension`).
  // For Likert, we store the numeric value of the option.
  return isForcedChoice ? idx : opt.value;
}

function submit() {
  const payload = {
    scaleId: scale.id,
    answers,
    finishedAt: new Date().toISOString(),
  };
  sessionStorage.setItem("psycho:lastResult", JSON.stringify(payload));
  location.href = `result.html?scale=${encodeURIComponent(scale.id)}`;
}

/* utils */
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function paragraphs(text) {
  return String(text).split(/\n\s*\n/).map((p) => `<p>${escapeHtml(p.trim())}</p>`).join("");
}

init();
