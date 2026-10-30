/**
 * 进度文件只记搜过的食材名。
 * 四份结果是 JSON：每个食材只写一次类别和人数，菜谱名与抽出的食材放在同一个对象里。
 * 扩展内部的 xcfDone 仍保存完整记录，用来断点续跑和再导出。
 */

const PROGRESS_FILE = "xiachufang-ingredient-progress.json";
const CATEGORY_FILE = "xiachufang-category-results.json";
const SEARCH_FILE = "xiachufang-search-results.json";
const NONE_FILE = "xiachufang-no-results.json";
const ABSENT_FILE = "xiachufang-keyword-absent.json";
const REC_PREFIX = "xcfR:";

/** 本地 save-server.py：写入仓库 tools/.../result/ 并与旧文件合并 */
const SAVE_ENDPOINT = "http://127.0.0.1:18765/save";
const SAVE_HEALTH = "http://127.0.0.1:18765/health";

/** 从 storage 组装结果（单条 xcfR:* + 兼容旧 xcfDone） */
async function loadDoneFromStorage() {
  const all = await chrome.storage.local.get(null);
  const done = {};
  if (all.xcfDone && typeof all.xcfDone === "object") {
    for (const [name, rec] of Object.entries(all.xcfDone)) {
      if (name && rec) done[name] = rec;
    }
  }
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith(REC_PREFIX) && v) {
      done[k.slice(REC_PREFIX.length)] = v;
    }
  }
  return done;
}

/** 串行导出，避免连续 fire-and-forget 并发写 result/ */
let exportChain = Promise.resolve();

async function exportFromStorage() {
  const run = async () => {
    const done = await loadDoneFromStorage();
    const files = buildBundle(done);
    await saveBundle(files, progressFileText(done));
    return { ok: true, count: Object.keys(done).length };
  };
  const next = exportChain.then(run, run);
  exportChain = next.catch(() => {});
  return next;
}

function categoriesOf(rec) {
  if (Array.isArray(rec.categories)) return rec.categories.filter(Boolean);
  return String(rec.category || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function recipeEntry(r) {
  const out = {
    title: r.title || "",
    count: r.count ?? 0,
    ingredients: r.ingredients || [],
  };
  return out;
}

function resultEntry(rec) {
  return {
    categories: categoriesOf(rec),
    count: rec.count ?? 0,
    recipes: (rec.recipes || []).map(recipeEntry),
  };
}

/** 结果文件紧凑格式：每个菜谱一行 / keyword-absent 每个食材一行 */
function formatRecipeResults(updatedAt, items) {
  const names = Object.keys(items).sort((a, b) =>
    a.localeCompare(b, "zh-CN")
  );
  const lines = ["{", `  "updatedAt": ${JSON.stringify(updatedAt)},`, '  "items": {'];
  names.forEach((name, i) => {
    const rec = items[name] || {};
    const comma = i < names.length - 1 ? "," : "";
    const cats = JSON.stringify(rec.categories || []);
    const count = rec.count ?? 0;
    const recipes = Array.isArray(rec.recipes) ? rec.recipes : [];
    lines.push(`    ${JSON.stringify(name)}: {`);
    lines.push(`      "categories": ${cats},`);
    lines.push(`      "count": ${count},`);
    if (!recipes.length) {
      lines.push(`      "recipes": []`);
    } else {
      lines.push(`      "recipes": [`);
      recipes.forEach((r, j) => {
        const rc = j < recipes.length - 1 ? "," : "";
        lines.push(`        ${JSON.stringify(recipeEntry(r))}${rc}`);
      });
      lines.push(`      ]`);
    }
    lines.push(`    }${comma}`);
  });
  lines.push("  }");
  lines.push("}");
  lines.push("");
  return lines.join("\n");
}

function formatAbsentResults(updatedAt, items) {
  const names = Object.keys(items).sort((a, b) =>
    a.localeCompare(b, "zh-CN")
  );
  const lines = ["{", `  "updatedAt": ${JSON.stringify(updatedAt)},`, '  "items": {'];
  names.forEach((name, i) => {
    const rec = items[name] || {};
    const comma = i < names.length - 1 ? "," : "";
    const body = {
      categories: rec.categories || [],
      page: rec.page || "",
    };
    lines.push(`    ${JSON.stringify(name)}: ${JSON.stringify(body)}${comma}`);
  });
  lines.push("  }");
  lines.push("}");
  lines.push("");
  return lines.join("\n");
}

function formatNoneResults(updatedAt, items) {
  const names = Object.keys(items).sort((a, b) =>
    a.localeCompare(b, "zh-CN")
  );
  const lines = ["{", `  "updatedAt": ${JSON.stringify(updatedAt)},`, '  "items": {'];
  names.forEach((name, i) => {
    const rec = items[name] || {};
    const comma = i < names.length - 1 ? "," : "";
    const body = { categories: rec.categories || [] };
    lines.push(`    ${JSON.stringify(name)}: ${JSON.stringify(body)}${comma}`);
  });
  lines.push("  }");
  lines.push("}");
  lines.push("");
  return lines.join("\n");
}

function buildBundle(done) {
  const category = {};
  const search = {};
  const none = {};
  const absent = {};
  for (const [name, rec] of Object.entries(done || {})) {
    if (!rec) continue;
    const kind = rec.resultKind;
    const categories = categoriesOf(rec);
    if (kind === "none") {
      none[name] = { categories };
      continue;
    }
    if (kind === "search") search[name] = resultEntry(rec);
    else if (kind === "category") category[name] = resultEntry(rec);
    if ((kind === "search" || kind === "category") && rec.keywordInTitles === false) {
      absent[name] = { categories, page: kind };
    }
  }
  const updatedAt = new Date().toISOString();
  return {
    category: formatRecipeResults(updatedAt, category),
    search: formatRecipeResults(updatedAt, search),
    none: formatNoneResults(updatedAt, none),
    absent: formatAbsentResults(updatedAt, absent),
  };
}

function progressFileText(done) {
  const searched = Object.keys(done || {}).sort();
  return (
    JSON.stringify(
      {
        version: 3,
        updatedAt: new Date().toISOString(),
        searched,
      },
      null,
      2
    ) + "\n"
  );
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    p(d.getMonth() + 1) +
    p(d.getDate()) +
    "-" +
    p(d.getHours()) +
    p(d.getMinutes()) +
    p(d.getSeconds())
  );
}

/** 优先 POST 到本地 result/；失败则下载到浏览器下载目录（永不 overwrite） */
async function saveText(filename, text, mime) {
  try {
    const res = await fetch(SAVE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, text }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data && data.ok) {
      await chrome.storage.local.set({
        xcfSaveHint: `已写入 result/（合并旧数据）`,
        xcfSaveOk: true,
      });
      return { via: "server", ...data };
    }
    throw new Error((data && data.error) || `save HTTP ${res.status}`);
  } catch (e) {
    const stem = filename.replace(/\.json$/i, "");
    const fallbackName = `xiachufang-popularity-ext/result/${stem}-${stamp()}.json`;
    const url = "data:" + mime + ";charset=utf-8," + encodeURIComponent(text);
    await chrome.downloads.download({
      url,
      filename: fallbackName,
      conflictAction: "uniquify",
      saveAs: false,
    });
    await chrome.storage.local.set({
      xcfSaveHint:
        "保存服务未开，已下载到「下载/xiachufang-popularity-ext/result/」（带时间戳，不覆盖）。请运行: python3 tools/xiachufang-popularity-ext/save-server.py",
      xcfSaveOk: false,
    });
    return { via: "download", filename: fallbackName, error: String(e.message || e) };
  }
}

async function saveBundle(files, progressText) {
  await saveText(PROGRESS_FILE, progressText, "application/json");
  await saveText(CATEGORY_FILE, files.category, "application/json");
  await saveText(SEARCH_FILE, files.search, "application/json");
  await saveText(NONE_FILE, files.none, "application/json");
  await saveText(ABSENT_FILE, files.absent, "application/json");
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    // 兼容旧 PERSIST：不再要求 payload.done，改为读 storage 导出
    if (msg?.type === "PERSIST") {
      const download = msg.payload?.download !== false;
      if (download) await exportFromStorage();
      sendResponse({ ok: true });
      return;
    }
    if (msg?.type === "EXPORT_FROM_STORAGE" || msg?.type === "EXPORT_TXT_ONLY") {
      await exportFromStorage();
      sendResponse({ ok: true });
      return;
    }
    if (msg?.type === "CHECK_SAVE_SERVER") {
      try {
        const res = await fetch(SAVE_HEALTH);
        const data = await res.json().catch(() => ({}));
        sendResponse({ ok: res.ok && data.ok, ...data });
      } catch (e) {
        sendResponse({ ok: false, error: String(e.message || e) });
      }
      return;
    }
    if (msg?.type === "GET_STATE") {
      const data = await chrome.storage.local.get([
        "xcfRun",
        "xcfProgress",
        "xcfSaveHint",
        "xcfSaveOk",
      ]);
      const xcfDone = await loadDoneFromStorage();
      sendResponse({ ok: true, ...data, xcfDone });
      return;
    }
    sendResponse({ ok: false, error: "unknown" });
  })().catch((e) => sendResponse({ ok: false, error: String(e) }));
  return true;
});
