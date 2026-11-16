const $ = (id) => document.getElementById(id);

function setLog(text, cls) {
  const el = $("log");
  el.className = cls || "";
  el.textContent = text || "";
}

async function checkSaveServer() {
  const el = $("saveServer");
  const countEl = $("searchedCount");
  try {
    const res = await chrome.runtime.sendMessage({ type: "CHECK_SAVE_SERVER" });
    if (res && res.ok) {
      el.textContent = "已连接 → search-tabs/";
      el.className = "ok";
      countEl.textContent = String(res.searchedCount ?? 0);
      return true;
    }
    el.textContent = res?.error || "未开 save-server";
    el.className = "err";
    countEl.textContent = "—";
    return false;
  } catch (e) {
    el.textContent = String(e.message || e);
    el.className = "err";
    countEl.textContent = "—";
    return false;
  }
}

$("btnScrape").addEventListener("click", async () => {
  const btn = $("btnScrape");
  btn.disabled = true;
  setLog("采集中…");
  try {
    const res = await chrome.runtime.sendMessage({
      type: "SCRAPE_WINDOW_SEARCH_TABS",
    });
    if (!res?.ok) {
      setLog(res?.error || "失败", "err");
      return;
    }
    const lines = [
      `完成：${res.okCount}/${res.tabCount} 个关键词`,
      `结果累计：${res.totalKeys ?? "?"} · 已查：${res.searchedCount ?? "?"}`,
      `写入：${res.resultsFile || ""} + ${res.progressFile || ""}`,
    ];
    if (res.newKeywords?.length) {
      lines.push("新关键字：" + res.newKeywords.join("、"));
    }
    if (res.keywords?.length) {
      lines.push("本批：" + res.keywords.join("、"));
    }
    if (res.errorCount) {
      lines.push(`失败 ${res.errorCount} 个：`);
      for (const e of res.errors || []) {
        lines.push(`  - ${e.keyword || e.url}: ${e.error}`);
      }
    }
    setLog(lines.join("\n"), res.errorCount ? "err" : "ok");
  } catch (e) {
    setLog(String(e.message || e), "err");
  } finally {
    btn.disabled = false;
    checkSaveServer();
  }
});

checkSaveServer();
setInterval(checkSaveServer, 4000);
