/**
 * 下厨房桌面站搜索页：读当前可见列表的菜名、做过人数、食材摘要。
 * 不点「加载更多」、不进详情。
 * 食材行若带省略号，丢掉紧挨省略号的残缺项，只保留前面完整部分。
 */
(() => {
  function textOf(el) {
    return (el && (el.textContent || "").trim()) || "";
  }

  function cleanTitle(raw) {
    let t = String(raw || "");
    const pair =
      /[（(【\[［「『<＜][^）)】\]］」』>＞]*[）)】\]］」』>＞]/g;
    let prev = "";
    while (prev !== t) {
      prev = t;
      t = t.replace(pair, "");
    }
    return t.replace(/\s+/g, " ").trim();
  }

  function parseCount(text) {
    const raw = String(text || "").replace(/\s+/g, " ");
    let m = raw.match(/(\d[\d,]*)\s*人做过/);
    if (!m) m = raw.match(/(\d[\d,]*)\s*做过/);
    if (!m) return null;
    return parseInt(m[1].replace(/,/g, ""), 10);
  }

  /**
   * "巴沙鱼、姜、盐、黑胡椒、料酒、淀..." → ["巴沙鱼","姜","盐","黑胡椒","料酒"]
   * 有省略号时去掉最后一段（残缺），无论最后一段是否已写全。
   */
  function parseIngredients(raw) {
    let t = String(raw || "").replace(/\s+/g, "");
    if (!t) return [];
    const truncated = /…|\.{2,}|⋯/.test(t);
    t = t.replace(/[…⋯]+/g, "").replace(/\.{2,}/g, "");
    const parts = t
      .split(/[、，,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (truncated && parts.length) parts.pop();
    return parts;
  }

  function keywordFromUrl() {
    try {
      const u = new URL(location.href);
      return (u.searchParams.get("keyword") || "").trim();
    } catch (_) {
      return "";
    }
  }

  function recipeBlocks() {
    const list =
      document.querySelector(".normal-recipe-list") ||
      document.querySelector(".search-result-list") ||
      document.querySelector("#search_result") ||
      document.body;
    let blocks = [
      ...list.querySelectorAll(
        ".recipe, .normal-recipe, li.recipe, .pure-list li, .list li"
      ),
    ];
    if (!blocks.length) {
      // 退路：每个指向 /recipe/ 的主链当作一张卡
      const links = [...document.querySelectorAll('a[href*="/recipe/"]')];
      const seen = new Set();
      blocks = [];
      for (const a of links) {
        const card =
          a.closest(".recipe, li, .info, .block") || a.parentElement;
        if (!card || seen.has(card)) continue;
        seen.add(card);
        blocks.push(card);
      }
    }
    return blocks;
  }

  function readIngredients(card) {
    const ingEl =
      card.querySelector(
        "p.ing, .ing, .ings, .ingredients, p.ellipsis.ing, .info .ing"
      ) || null;
    if (ingEl) return parseIngredients(textOf(ingEl));

    // 退路：卡片文本里找「顿号分隔 + 可选省略号」且不像评分行的一行
    const lines = textOf(card)
      .split(/\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const line of lines) {
      if (/做过|综合评分|步骤图|作者/.test(line)) continue;
      if (!/[、，,]/.test(line) && !/…|\.{2,}/.test(line)) continue;
      // 菜名行通常没有一长串顿号食材
      if (line.length < 2) continue;
      const parsed = parseIngredients(line);
      if (parsed.length >= 1) return parsed;
    }
    return [];
  }

  function readCard(card) {
    const nameEl =
      card.querySelector("p.name a, .name a, a.name, h2 a, h3 a") ||
      card.querySelector('a[href*="/recipe/"]');
    if (!nameEl) return null;
    const title = cleanTitle(textOf(nameEl));
    if (!title) return null;

    const doneEl =
      card.querySelector(".done, span.done, .stats .done, .stat") || null;
    let count = doneEl ? parseCount(textOf(doneEl)) : null;
    if (count == null) count = parseCount(textOf(card));
    if (count == null) count = 0;

    const href = nameEl.getAttribute("href") || "";
    const ingredients = readIngredients(card);
    return { title, count, href, ingredients };
  }

  function scrape() {
    if (/验证码|安全验证|请完成验证|滑动验证|人机验证/.test(
      (document.body && document.body.innerText) || ""
    )) {
      return {
        ok: false,
        error: "当前页是验证码/安全验证，请先通过后再采集",
        url: location.href,
        keyword: keywordFromUrl(),
        recipes: [],
      };
    }

    const keyword = keywordFromUrl();
    const recipes = [];
    const seenTitle = new Set();
    for (const card of recipeBlocks()) {
      const row = readCard(card);
      if (!row || !row.title) continue;
      if (seenTitle.has(row.title)) continue;
      seenTitle.add(row.title);
      recipes.push({
        title: row.title,
        count: row.count,
        ingredients: row.ingredients || [],
      });
    }

    return {
      ok: true,
      url: location.href,
      keyword,
      recipes,
      scrapedAt: new Date().toISOString(),
    };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "XCF_TABS_SCRAPE") {
      try {
        sendResponse(scrape());
      } catch (e) {
        sendResponse({
          ok: false,
          error: String(e && e.message ? e.message : e),
          url: location.href,
          keyword: keywordFromUrl(),
          recipes: [],
        });
      }
      return true;
    }
    return false;
  });
})();
