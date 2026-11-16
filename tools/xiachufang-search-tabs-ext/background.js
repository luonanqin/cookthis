const SAVE_URL = "http://127.0.0.1:18766/save-batch";
const HEALTH_URL = "http://127.0.0.1:18766/health";

function isSearchTab(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return (
      u.hostname === "www.xiachufang.com" &&
      u.pathname.indexOf("/search") === 0
    );
  } catch (_) {
    return false;
  }
}

async function scrapeTab(tab) {
  if (!tab?.id) {
    return { ok: false, error: "无 tab id", recipes: [], keyword: "" };
  }
  let res;
  try {
    res = await chrome.tabs.sendMessage(tab.id, { type: "XCF_TABS_SCRAPE" });
  } catch (_) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"],
      });
      res = await chrome.tabs.sendMessage(tab.id, { type: "XCF_TABS_SCRAPE" });
    } catch (e) {
      return {
        ok: false,
        error: "无法注入脚本，请刷新该搜索页后重试: " + (e.message || e),
        url: tab.url || "",
        keyword: "",
        recipes: [],
      };
    }
  }
  return res || { ok: false, error: "空响应", recipes: [], keyword: "" };
}

async function checkSaveServer() {
  try {
    const r = await fetch(HEALTH_URL, { method: "GET" });
    if (!r.ok) return { ok: false, error: "health " + r.status };
    const body = await r.json();
    return { ok: true, ...body };
  } catch (e) {
    return {
      ok: false,
      error: "保存服务未开（python3 tools/xiachufang-search-tabs-save/save-server.py）",
    };
  }
}

async function saveBatch(payload) {
  const r = await fetch(SAVE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || body.ok === false) {
    throw new Error(body.error || "save failed " + r.status);
  }
  return body;
}

/** 同名菜去重：保留做过人数更高的；人数相同则后写覆盖（食材更新）。 */
function dedupeRecipesByTitle(recipes) {
  const byTitle = new Map();
  for (const r of recipes || []) {
    const title = (r && r.title) || "";
    if (!title) continue;
    const prev = byTitle.get(title);
    const count = Number(r.count) || 0;
    if (!prev) {
      byTitle.set(title, {
        title,
        count,
        ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
      });
      continue;
    }
    const prevCount = Number(prev.count) || 0;
    if (count > prevCount) {
      byTitle.set(title, {
        title,
        count,
        ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
      });
    } else if (count === prevCount) {
      // 同人数：若新条目有食材则刷新
      const ings = Array.isArray(r.ingredients) ? r.ingredients : [];
      if (ings.length) prev.ingredients = ings;
    }
  }
  return [...byTitle.values()];
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === "CHECK_SAVE_SERVER") {
      sendResponse(await checkSaveServer());
      return;
    }
    if (msg?.type === "SCRAPE_WINDOW_SEARCH_TABS") {
      const health = await checkSaveServer();
      if (!health.ok) {
        sendResponse({ ok: false, error: health.error || "保存服务未开" });
        return;
      }
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const searchTabs = tabs.filter((t) => isSearchTab(t.url));
      if (!searchTabs.length) {
        sendResponse({
          ok: false,
          error: "当前窗口没有 www.xiachufang.com/search/ 标签页",
        });
        return;
      }

      const items = {};
      const errors = [];
      for (const tab of searchTabs) {
        const scraped = await scrapeTab(tab);
        const keyword =
          (scraped && scraped.keyword) ||
          (() => {
            try {
              return new URL(tab.url).searchParams.get("keyword") || "";
            } catch (_) {
              return "";
            }
          })();
        if (!scraped?.ok) {
          errors.push({
            keyword: keyword || tab.url,
            error: scraped?.error || "采集失败",
            url: tab.url,
          });
          continue;
        }
        if (!keyword) {
          errors.push({
            keyword: "",
            error: "URL 无 keyword 参数",
            url: tab.url,
          });
          continue;
        }
        const nextRecipes = scraped.recipes || [];
        if (items[keyword]) {
          // 多页同一关键字：合并后按菜名去重
          items[keyword] = {
            url: scraped.url || tab.url || items[keyword].url,
            recipes: dedupeRecipesByTitle([
              ...(items[keyword].recipes || []),
              ...nextRecipes,
            ]),
            scrapedAt: scraped.scrapedAt || new Date().toISOString(),
          };
        } else {
          items[keyword] = {
            url: scraped.url || tab.url,
            recipes: dedupeRecipesByTitle(nextRecipes),
            scrapedAt: scraped.scrapedAt || new Date().toISOString(),
          };
        }
      }

      const saved = await saveBatch({
        updatedAt: new Date().toISOString(),
        tabCount: searchTabs.length,
        okCount: Object.keys(items).length,
        errors,
        items,
      });

      sendResponse({
        ok: true,
        tabCount: searchTabs.length,
        okCount: Object.keys(items).length,
        errorCount: errors.length,
        errors,
        resultsFile: saved.resultsFile,
        progressFile: saved.progressFile,
        resultsPath: saved.resultsPath,
        progressPath: saved.progressPath,
        totalKeys: saved.totalKeys,
        searchedCount: saved.searchedCount,
        newKeywords: saved.newKeywords || [],
        keywords: Object.keys(items),
      });
      return;
    }
    sendResponse({ ok: false, error: "unknown message" });
  })().catch((e) =>
    sendResponse({ ok: false, error: String(e && e.message ? e.message : e) })
  );
  return true;
});
