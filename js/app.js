// Landing page logic: load scale index and render cards grouped by category.
import { loadScaleIndex } from "./scale-loader.js";

const listEl = document.getElementById("scale-list");

async function init() {
  try {
    const index = await loadScaleIndex();
    renderScales(index);
  } catch (e) {
    listEl.innerHTML = `<div class="error">无法加载量表列表: ${e.message}</div>`;
  }
}

function renderScales(index) {
  const byCategory = new Map();
  for (const cat of index.categories) byCategory.set(cat.id, { ...cat, scales: [] });
  for (const scale of index.scales) {
    if (!byCategory.has(scale.category)) continue;
    byCategory.get(scale.category).scales.push(scale);
  }

  listEl.innerHTML = "";
  for (const cat of [...byCategory.values()].sort((a, b) => a.order - b.order)) {
    if (cat.scales.length === 0) continue;
    const section = document.createElement("section");
    section.className = "category-section";
    section.innerHTML = `
      <h3>${cat.label}</h3>
      <div class="scale-grid">
        ${cat.scales.map(cardHtml).join("")}
      </div>
    `;
    listEl.appendChild(section);
  }
}

function cardHtml(scale) {
  const featured = scale.featured ? "scale-card-featured" : "";
  return `
    <a class="scale-card ${featured}" href="test.html?scale=${encodeURIComponent(scale.id)}">
      <div class="scale-cat">${scale.shortName || scale.id.toUpperCase()}</div>
      <h4 class="scale-name">${scale.name}</h4>
      <p class="scale-tagline">${scale.tagline || ""}</p>
      <div class="scale-meta">
        <span>${scale.questionCount} 题</span>
        <span>约 ${scale.estimatedMinutes} 分钟</span>
      </div>
    </a>
  `;
}

init();
