// Centralized scale data loader. Adds simple in-memory caching so that
// navigation between test/result pages doesn't repeatedly fetch the same JSON.

const cache = new Map();

export async function loadScaleIndex() {
  if (cache.has("__index__")) return cache.get("__index__");
  const res = await fetch("scales/index.json");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  cache.set("__index__", data);
  return data;
}

export async function loadScale(id) {
  if (cache.has(id)) return cache.get(id);
  // Allow relative paths from either root or test.html (same dir)
  const url = `scales/${id}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`量表 ${id} 加载失败 (HTTP ${res.status})`);
  const data = await res.json();
  cache.set(id, data);
  return data;
}
