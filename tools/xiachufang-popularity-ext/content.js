/**
 * 下厨房食材热门度 — 页面状态机
 * 点「最受欢迎」/菜谱会整页跳转，必须靠 phase 跨加载续跑。
 */

(() => {
  const HOME = "https://mbdbj.xiachufang.com/";
  const STEP_TIMEOUT_MS = 20000;
  /** 食材与食材之间（有结果时） */
  const BETWEEN_MS = () => 3000 + Math.random() * 5000; // 3–8s
  /** 每完成 BATCH_EVERY 个再多歇一会 */
  const BATCH_EVERY = 5;
  const BATCH_REST_MS = () => 12000 + Math.random() * 10000; // 12–22s
  /** 单步操作之间（搜、点排序、读、点菜谱、回首页） */
  const STEP_PAUSE_MS = () => 1500 + Math.random() * 2000; // 1.5–3.5s
  /** 页面加载后续跑前先停一下 */
  const RESUME_PAUSE_MS = () => 1500 + Math.random() * 1500; // 1.5–3s

  const XP = {
    searchInput: '//*[@id="search-bar-form"]/input[1]',
    popular: '//*[@id="site-body"]/section[1]/ul/li[2]/a',
    goback: '//*[@id="goback"]',
    doneSpan: (i) =>
      `//*[@id="add-more-container"]/a[${i}]/div/div[2]/div/span[2]`,
  };

  /** @type {boolean} */
  let loopActive = false;
  let pauseRequested = false;

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function humanPause(msFn = STEP_PAUSE_MS) {
    const ms = typeof msFn === "function" ? msFn() : msFn;
    await sleep(ms);
  }

  function xpath(expr, root = document) {
    const r = document.evaluate(
      expr,
      root,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    return r.singleNodeValue;
  }

  function textOf(el) {
    return (el && (el.textContent || "").trim()) || "";
  }

  function isCaptchaPage() {
    const t = (document.body && document.body.innerText) || "";
    return /验证码|安全验证|请完成验证|滑动验证|人机验证/.test(t);
  }

  /** 反爬点菜谱后被拦到的滑动验证（www 域），不等于整表要停 */
  function isHumanCheckPage() {
    const href = location.href || "";
    return (
      /\/auth\/humancheck/i.test(href) ||
      /humancheck_captcha/i.test(href)
    );
  }

  /** 仅真正首页（pathname 为 /）。搜索结果页也有搜索框，不能靠 input 判断。 */
  function isHome() {
    const path = location.pathname || "";
    if (path !== "/" && path !== "") return false;
    if (isSearchMissPage() || isCategoryPage() || isRecipePage()) return false;
    return !!(
      xpath(XP.searchInput) ||
      document.querySelector("#search-bar-form input")
    );
  }

  function hasSearchInput() {
    return !!(
      xpath(XP.searchInput) ||
      document.querySelector("#search-bar-form input")
    );
  }

  function isCategoryPage() {
    return /\/category\//.test(location.pathname);
  }

  function isPopSorted() {
    return /\/category\/[^/]+\/pop\/?$/.test(location.pathname);
  }

  function isSearchMissPage() {
    return (
      /^\/search\/?$/.test(location.pathname) ||
      location.pathname.indexOf("/search") === 0
    );
  }

  function isRecipePage() {
    return /\/recipe\//.test(location.pathname);
  }

  async function waitUntil(pred, timeoutMs = STEP_TIMEOUT_MS, label = "等待") {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (pauseRequested) throw new Error("已暂停");
      if (isHumanCheckPage()) {
        throw Object.assign(new Error("humancheck_antibot"), {
          humancheckAntibot: true,
        });
      }
      if (isCaptchaPage()) {
        throw Object.assign(new Error("验证码"), { captcha: true });
      }
      if (await pred()) return;
      await sleep(300);
    }
    throw new Error(`${label}超时(${timeoutMs}ms)`);
  }

  /**
   * 若仍落到 humancheck / 菜谱详情：直接跳首页，不 history.back、不点菜。
   */
  async function recoverAntibotHumanCheck(why) {
    console.warn("[xcf] 遇 humancheck/异常页，直接回首页", why || "");
    await setRun({
      phase: "going_home",
      antibotSkippedHumanCheck: true,
    });
    location.href = HOME;
    throw Object.assign(new Error("navigate_humancheck_home"), {
      navigated: true,
    });
  }

  /** 回首页：一律强跳 HOME，不用 #goback / history.back */
  async function goHomeDirect() {
    if (isHome()) {
      await setRun({ phase: "idle" });
      return;
    }
    await setRun({ phase: "going_home" });
    location.href = HOME;
    throw Object.assign(new Error("navigate_home"), { navigated: true });
  }

  /** 单条结果键前缀，避免整包 xcfDone 越写越慢 */
  const REC_PREFIX = "xcfR:";

  /** @type {Record<string, object>|null} */
  let doneCache = null;
  /** @type {object|null} */
  let runCache = null;

  async function storageGet(keys) {
    return chrome.storage.local.get(keys);
  }

  async function storageSet(obj) {
    return chrome.storage.local.set(obj);
  }

  async function getRun() {
    if (runCache) return runCache;
    const { xcfRun } = await storageGet("xcfRun");
    runCache = xcfRun || { status: "idle" };
    return runCache;
  }

  async function setRun(patch) {
    const cur = await getRun();
    runCache = { ...cur, ...patch };
    await storageSet({ xcfRun: runCache });
    return runCache;
  }

  function recKey(name) {
    return REC_PREFIX + name;
  }

  /** 从 storage 组装 done（仅冷启动 / 新文档一次） */
  async function loadDoneCache() {
    if (doneCache) return doneCache;
    const all = await chrome.storage.local.get(null);
    const done = {};
    let migrated = false;
    if (all.xcfDone && typeof all.xcfDone === "object") {
      for (const [name, rec] of Object.entries(all.xcfDone)) {
        if (name && rec) done[name] = rec;
      }
      if (Object.keys(done).length) migrated = true;
    }
    for (const [k, v] of Object.entries(all)) {
      if (k.startsWith(REC_PREFIX) && v) {
        done[k.slice(REC_PREFIX.length)] = v;
      }
    }
    if (
      !Object.keys(done).length &&
      Array.isArray(all.xcfProgress?.searched) &&
      all.xcfProgress.searched.length
    ) {
      for (const name of all.xcfProgress.searched) {
        done[name] = { resultKind: "searched" };
      }
    }
    doneCache = done;
    if (migrated) {
      const patch = {};
      for (const [name, rec] of Object.entries(done)) {
        patch[recKey(name)] = rec;
      }
      await storageSet(patch);
      try {
        await chrome.storage.local.remove("xcfDone");
      } catch (_) {
        /* ignore */
      }
    }
    return doneCache;
  }

  async function getDone() {
    return loadDoneCache();
  }

  async function clearAllDoneRecords() {
    doneCache = {};
    const all = await chrome.storage.local.get(null);
    const remove = Object.keys(all).filter(
      (k) => k.startsWith(REC_PREFIX) || k === "xcfDone"
    );
    if (remove.length) await chrome.storage.local.remove(remove);
  }

  async function removeDoneRecord(name) {
    const done = await getDone();
    delete done[name];
    doneCache = done;
    await chrome.storage.local.remove(recKey(name));
  }

  /**
   * 只写进度元数据；落盘由 background 自己读 storage，不传整包 done。
   * 采集中 download 不 await，避免越跑越卡。
   */
  async function persist(status, pauseReason = null, { download = true } = {}) {
    const done = await getDone();
    const searched = Object.keys(done).sort();
    await storageSet({
      xcfProgress: {
        version: 3,
        updatedAt: new Date().toISOString(),
        status,
        pauseReason,
        searched,
      },
      xcfSchema: 2,
    });
    if (!download) return;
    const wait = status === "paused" || status === "done";
    const p = chrome.runtime.sendMessage({ type: "EXPORT_FROM_STORAGE" });
    if (wait) {
      try {
        await p;
      } catch (_) {
        /* ignore */
      }
    }
  }

  let catalogCache = null;

  async function loadCatalog() {
    if (catalogCache) return catalogCache;
    const url = chrome.runtime.getURL("data/ingredients.json");
    const res = await fetch(url);
    catalogCache = await res.json();
    return catalogCache;
  }

  async function loadIngredients() {
    const data = await loadCatalog();
    return data.items || [];
  }

  /** 去掉成对括号及其中内容（菜名粗清洗） */
  function cleanRecipeTitle(raw) {
    let t = String(raw || "");
    const pair =
      /[（(【\[［「『<＜][^）)】\]］」』>＞]*[）)】\]］」』>＞]/g;
    let prev = "";
    while (prev !== t) {
      prev = t;
      t = t.replace(pair, "");
    }
    return t.replace(/\s+/g, "").trim();
  }

  function readCardTitle(card) {
    const nameEl = card.querySelector(
      ".name, .title, h3, p.name, .recipe-name"
    );
    if (nameEl) return textOf(nameEl);
    const clone = card.cloneNode(true);
    clone.querySelectorAll(".stat, .ml10, .ing, .ings").forEach((el) => el.remove());
    const line = textOf(clone)
      .split(/\n/)
      .map((s) => s.trim())
      .find((s) => s && !/^\d+$/.test(s) && !/人做过/.test(s));
    return line || "";
  }

  function readCardCount(card) {
    const ml = card.querySelector("span.ml10");
    if (ml && /^\d+$/.test(textOf(ml))) return parseInt(textOf(ml), 10);
    const stat = card.querySelector(".stat");
    const raw = textOf(stat || card).replace(/\s+/g, " ");
    const m = raw.match(/(\d+)\s*人做过/);
    if (!m) return null;
    const before = raw.slice(0, m.index).trim();
    const parts = before.split(/\s+/);
    const last = parts[parts.length - 1];
    if (/^\d+$/.test(last)) return parseInt(last, 10);
    return parseInt(m[1], 10);
  }

  /** 全量词表最长匹配；调味（仅「未映射」）不在 lexicon 里 */
  function extractIngredients(title, lexicon) {
    const parts = [];
    let i = 0;
    while (i < title.length) {
      let matched = null;
      const rest = title.length - i;
      for (const w of lexicon) {
        if (!w || w.length > rest) continue;
        if (title.startsWith(w, i)) {
          matched = w;
          break;
        }
      }
      if (matched) {
        if (!parts.length || parts[parts.length - 1] !== matched) {
          parts.push(matched);
        }
        i += matched.length;
      } else {
        i += 1;
      }
    }
    return parts;
  }

  async function readCurrentPage() {
    const data = await loadCatalog();
    const lexicon = data.extractLexicon || [];
    const recipes = [];
    const counts = [];
    for (const card of recipeCards()) {
      const title = cleanRecipeTitle(readCardTitle(card));
      if (!title) continue;
      const n = readCardCount(card);
      if (n != null) counts.push(n);
      recipes.push({
        title,
        count: n == null ? 0 : n,
        ingredients: extractIngredients(title, lexicon),
      });
    }
    const count = counts.reduce((a, b) => a + b, 0);
    return { count, recipes };
  }

  function setNativeValue(input, value) {
    const proto = Object.getPrototypeOf(input);
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function ensureHome() {
    // 不用 #goback（≈后退）；一律强跳首页
    // const back = xpath(XP.goback) || document.querySelector("#goback");
    // if (back) { back.click(); ... }
    if (isHome()) return;
    location.href = HOME;
    throw Object.assign(new Error("navigate_home"), { navigated: true });
  }

  async function doSearch(name) {
    await ensureHome();
    await humanPause(); // 到首页后先停一下再搜
    const input =
      xpath(XP.searchInput) ||
      document.querySelector("#search-bar-form input");
    if (!input) throw new Error("找不到搜索框");
    setNativeValue(input, name);
    input.focus();
    await humanPause(() => 600 + Math.random() * 900); // 输入后稍等再回车
    const enterOpts = {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    };
    input.dispatchEvent(new KeyboardEvent("keydown", enterOpts));
    input.dispatchEvent(new KeyboardEvent("keypress", enterOpts));
    input.dispatchEvent(new KeyboardEvent("keyup", enterOpts));
    const form = document.querySelector("#search-bar-form");
    if (form && typeof form.requestSubmit === "function") {
      try {
        form.requestSubmit();
      } catch (_) {
        /* ignore */
      }
    }
    await waitUntil(
      () => isCategoryPage() || isSearchMissPage(),
      STEP_TIMEOUT_MS,
      "搜索跳转"
    );
    // 结果页 →「最受欢迎」不停留，立刻点
  }

  function findPopularLink() {
    let link = xpath(XP.popular);
    if (link) return link;
    const as = document.querySelectorAll("#site-body a");
    return [...as].find((a) => /最受欢迎/.test(a.textContent || "")) || null;
  }

  function recipeCards() {
    let cards = [
      ...document.querySelectorAll("#add-more-container > a.recipe-96-horizon"),
    ];
    if (!cards.length) {
      cards = [...document.querySelectorAll("#add-more-container > a")];
    }
    if (!cards.length) {
      cards = [...document.querySelectorAll("a.recipe-96-horizon")];
    }
    return cards;
  }

  function hasRecipeCards() {
    return recipeCards().length > 0;
  }

  /** 「下厨房没有这个菜谱……」空结果（常见于 category 无菜谱） */
  function isEmptyRecipeResult() {
    const t = (document.body && document.body.innerText) || "";
    if (/下厨房没有这个菜谱/.test(t)) return true;
    return false;
  }

  /** 可统计：结果页上已有菜谱卡片，且不是空结果文案 */
  function isStatsPage() {
    if (isEmptyRecipeResult()) return false;
    if (!hasRecipeCards()) return false;
    return isCategoryPage() || isPopSorted() || isSearchMissPage();
  }

  function pageResultKind() {
    if (isSearchMissPage()) return "search";
    return "category";
  }

  async function markNonIngredientAndHome(name, category) {
    await markDone(name, category, {
      resultKind: "none",
      isIngredient: false,
      count: null,
      recipes: [],
      keywordInTitles: false,
    });
    // 尽快回首页，少停顿
    await setRun({ phase: "going_home" });
    location.href = HOME;
    throw Object.assign(new Error("navigate_home"), { navigated: true });
  }

  async function confirmEmptyOrCards(timeoutMs = 2500) {
    if (isEmptyRecipeResult() || hasRecipeCards()) return;
    try {
      await waitUntil(
        () => isEmptyRecipeResult() || hasRecipeCards(),
        timeoutMs,
        "空结果确认"
      );
    } catch (_) {
      /* ignore */
    }
  }

  /**
   * 切到最受欢迎（有则跳 /pop/）；没有则直接 skip，用当前列表统计。
   * @returns {Promise<'navigated'|'already'|'skip'>}
   */
  async function goPopularSorted() {
    if (isPopSorted()) return "already";
    // 短等一下 DOM，没有就跳过，绝不卡满超时
    const t0 = Date.now();
    while (Date.now() - t0 < 2500) {
      if (findPopularLink() || isPopSorted()) break;
      await sleep(200);
    }
    if (isPopSorted()) return "already";
    const link = findPopularLink();
    if (!link) return "skip";
    const href = link.href || link.getAttribute("href");
    await setRun({ phase: "read_counts" });
    if (href) {
      location.href = href.startsWith("http")
        ? href
        : new URL(href, location.origin).href;
    } else {
      link.click();
    }
    throw Object.assign(new Error("navigate_popular"), { navigated: true });
  }

  async function scrollJitter() {
    window.scrollBy(0, 300 + Math.random() * 500);
    await sleep(300 + Math.random() * 400); // 0.3–0.7s
    window.scrollBy(0, -(150 + Math.random() * 250));
    await sleep(200 + Math.random() * 300); // 0.2–0.5s
  }

  /**
   * 反爬：列表页滚动两次，然后由调用方 goHomeDirect() 跳首页。
   * 不再随机点进菜谱详情。
   */
  async function antiBotListScroll() {
    await humanPause(() => 400 + Math.random() * 600);
    await scrollJitter();
    await humanPause(() => 300 + Math.random() * 500);
    await scrollJitter();
    // —— 随机访问菜品详情（已停用，易 humancheck）——
    // const cards = recipeCards();
    // if (!cards.length) return "no_cards";
    // await humanPause(() => 300 + Math.random() * 500);
    // const pick = cards[Math.floor(Math.random() * Math.min(cards.length, 9))];
    // const href = pick.href || pick.getAttribute("href");
    // await setRun({ phase: "antibot_back" });
    // if (href) {
    //   location.href = href.startsWith("http")
    //     ? href
    //     : new URL(href, location.origin).href;
    // } else {
    //   pick.click();
    // }
    // throw Object.assign(new Error("navigate_recipe"), { navigated: true });
  }

  async function goHomeFromAnywhere() {
    // 旧：可能点 #goback（≈ history.back），易在菜谱↔列表打转
    // const back = xpath(XP.goback) || document.querySelector("#goback");
    // if (back && !isCategoryPage() && !isSearchMissPage()) {
    //   back.click();
    //   ...
    // }
    return goHomeDirect();
  }

  async function markDone(name, category, record) {
    const done = await getDone();
    const rec = { category, ...record };
    done[name] = rec;
    doneCache = done;
    // 单条写入，不再整包 set xcfDone
    await storageSet({ [recKey(name)]: rec });
  }

  /**
   * 按 phase 推进；遇整页跳转抛 navigated，外层不重试、等新文档续跑。
   */
  async function finishItemIdle() {
    await setRun({ phase: "idle", retryCount: 0, currentName: null });
  }

  /** 结果已写入后，反爬收尾失败也不要再搜同一词，直接进入下一项 */
  async function abandonAntibotTail(name, why) {
    console.warn("[xcf] 反爬收尾放弃", name, why);
    try {
      location.href = HOME;
    } catch (_) {
      /* ignore */
    }
    await finishItemIdle();
  }

  async function processOne(item) {
    const name = item.name;
    const category = (item.categories || [item.category || ""])
      .filter(Boolean)
      .join(",");
    let run = await getRun();
    let phase =
      run.currentName === name && run.phase && run.phase !== "idle"
        ? run.phase
        : "search";
    let retries = run.currentName === name ? run.retryCount || 0 : 0;
    const alreadyDone = !!(await getDone())[name];
    await setRun({ currentName: name, phase, retryCount: retries });

    // 已完成却仍卡在反爬收尾：最多再试 1 次回首页，否则放行下一项
    if (alreadyDone && needsAntibotTail(phase) && retries >= 1) {
      await abandonAntibotTail(name, "already_done_tail");
      return;
    }

    const bumpRetry = async (err) => {
      if (err.humancheckAntibot) {
        await recoverAntibotHumanCheck(err.message || "bumpRetry");
        return;
      }
      if (err.captcha) {
        await pauseRun("遇到验证码/安全验证，处理后点「继续」");
        throw err;
      }
      if (String(err.message) === "已暂停") throw err;
      if (err.navigated) throw err;
      // 结果已落盘：反爬/回首页失败不再重搜，避免死磕同一词
      if ((await getDone())[name]) {
        await abandonAntibotTail(name, err.message || err);
        return;
      }
      retries += 1;
      await setRun({ retryCount: retries, phase: "search", currentName: name });
      if (retries >= 3) {
        await pauseRun(`卡住重试 3 次仍失败（${name}）：${err.message || err}`);
        throw err;
      }
      location.href = HOME;
      throw Object.assign(new Error("navigate_retry"), { navigated: true });
    };

    try {
      // 反爬跳转后落到 humancheck：后退回列表，本食材不再点菜
      if (isHumanCheckPage() && needsAntibotTail(phase)) {
        await recoverAntibotHumanCheck(phase);
        return;
      }

      // —— 旧：反爬进菜谱详情后的 antibot_back（已停用点菜，若残留 phase 则直接回首页）——
      if (phase === "antibot_back") {
        // await humanPause(RESUME_PAUSE_MS);
        // if (isRecipePage()) { history.back(); ... }
        await goHomeDirect();
        return;
      }

      // 强跳首页后的落地
      if (phase === "going_home") {
        await humanPause(RESUME_PAUSE_MS);
        const path = location.pathname || "";
        const atRoot = path === "/" || path === "";
        if (!isHome() && !atRoot) {
          retries += 1;
          await setRun({ retryCount: retries });
          if (retries >= 2 || (await getDone())[name]) {
            await finishItemIdle();
            return;
          }
          location.href = HOME;
          throw Object.assign(new Error("navigate_home"), { navigated: true });
        }
        // 已在 / ：即使搜索框稍慢也结束本词，避免反复刷首页
        await finishItemIdle();
        return;
      }

      if (phase === "antibot_home") {
        await humanPause();
        await goHomeDirect();
        return;
      }

      // —— 已在结果页：可能先点最受欢迎，或已是 /pop/ / 列表 ——
      if (
        phase === "read_counts" ||
        phase === "sort_popular" ||
        phase === "antibot"
      ) {
        if (isCategoryPage() || isPopSorted() || isSearchMissPage()) {
          // 进结果页后若要切「最受欢迎」：不等待，直接点
          if (
            (phase === "sort_popular" || phase === "read_counts") &&
            isCategoryPage() &&
            !isPopSorted() &&
            findPopularLink() &&
            !isEmptyRecipeResult()
          ) {
            await goPopularSorted(); // navigated | already | skip
          } else if (!isEmptyRecipeResult()) {
            await humanPause(RESUME_PAUSE_MS);
          }
          await confirmEmptyOrCards(3000);
          if (isEmptyRecipeResult() || !hasRecipeCards()) {
            await markNonIngredientAndHome(name, category);
          }
          if (!isStatsPage()) {
            throw new Error("结果页无菜谱: " + location.href);
          }
          phase = "read_counts";
          await setRun({ phase });
          await humanPause(); // 读数前停一下
          const page = await readCurrentPage();
          const kind = pageResultKind();
          const keywordInTitles = page.recipes.some((r) =>
            r.title.includes(name)
          );
          await markDone(name, category, {
            resultKind: kind,
            isIngredient: kind === "category",
            count: page.count,
            recipes: page.recipes,
            keywordInTitles,
          });
          phase = "antibot";
          await setRun({ phase, antibotSkippedHumanCheck: false });
          try {
            await antiBotListScroll();
            // 滚动后强跳首页，不用后退 / #goback
            await goHomeDirect();
          } catch (e) {
            if (e.humancheckAntibot) {
              await recoverAntibotHumanCheck(e.message || e);
              return;
            }
            if (e.navigated) throw e;
            // 已记结果：回不去首页也不重搜
            await abandonAntibotTail(name, e.message || e);
            return;
          }
          await finishItemIdle();
          return;
        }
      }

      // —— 搜索 ——
      if (phase === "search" || phase === "wait_result") {
        if (isCategoryPage() || isPopSorted() || isSearchMissPage()) {
          await confirmEmptyOrCards(2500);
          if (isEmptyRecipeResult() || !hasRecipeCards()) {
            await markNonIngredientAndHome(name, category);
          }
          if (isStatsPage()) {
            phase =
              isCategoryPage() && !isPopSorted() && findPopularLink()
                ? "sort_popular"
                : "read_counts";
            await setRun({ phase });
            return processOne(item);
          }
        }
        await setRun({ phase: "wait_result" });
        await doSearch(name);
        await confirmEmptyOrCards(3000);
        if (isEmptyRecipeResult() || !hasRecipeCards()) {
          await markNonIngredientAndHome(name, category);
        }
        if (isStatsPage()) {
          phase =
            isCategoryPage() && !isPopSorted() && findPopularLink()
              ? "sort_popular"
              : "read_counts";
          await setRun({ phase });
          return processOne(item);
        }
        throw new Error("未知结果页: " + location.href);
      }

      // 其它残余 phase：从头搜
      await setRun({ phase: "search" });
      return processOne(item);
    } catch (e) {
      if (e.navigated) return; // 等新页面自动续跑
      await bumpRetry(e);
    }
  }

  async function pauseRun(reason) {
    pauseRequested = true;
    await setRun({
      status: "paused",
      pauseReason: reason || "已暂停",
    });
    await persist("paused", reason || "已暂停");
  }

  function needsAntibotTail(phase) {
    return (
      phase === "antibot" ||
      phase === "antibot_back" ||
      phase === "antibot_home" ||
      phase === "going_home"
    );
  }

  async function runLoop() {
    if (loopActive) return;
    loopActive = true;
    pauseRequested = false;
    try {
      const itemsAll = await loadIngredients();
      const runInit = await getRun();
      const only = runInit.refetchOnly || null;
      const items = only
        ? itemsAll.filter((it) => it.name === only)
        : itemsAll;
      if (only && !items.length) {
        await setRun({ refetchOnly: null });
        await pauseRun(`词表中无「${only}」`);
        return;
      }
      await setRun({
        status: "running",
        pauseReason: null,
        total: itemsAll.length,
        batchCount: runInit.batchCount || 0,
      });

      for (let i = 0; i < items.length; i++) {
        let run = await getRun();
        if (run.status !== "running" || pauseRequested) break;

        const item = items[i];
        const done = await getDone();
        const midTail =
          run.currentName === item.name && needsAntibotTail(run.phase);

        // 已完成且不在反爬收尾 → 跳过
        if (done[item.name] && !midTail) {
          continue;
        }

        await setRun({
          index: i,
          currentName: item.name,
          // 保留跨页 phase；新食材才从 search 开始
          phase:
            run.currentName === item.name && run.phase && run.phase !== "idle"
              ? run.phase
              : done[item.name] && midTail
                ? run.phase
                : "search",
        });
        await processOne(item);

        run = await getRun();
        // 整页跳转中：结束本轮循环，等新文档自动 runLoop 续跑（不要暂停）
        if (
          run.status === "running" &&
          run.phase &&
          run.phase !== "idle"
        ) {
          return;
        }

        const doneAfter = await getDone();
        if (!doneAfter[item.name]) {
          // 未写入结果且已回 idle：交由重试/暂停逻辑，勿误点「已暂停」
          if (run.status !== "running" || pauseRequested) break;
          continue;
        }

        const rec = doneAfter[item.name];
        const isNon = rec && rec.resultKind === "none";
        // 非食材（无结果）不计入 batch 休息节奏，立刻下一项
        const batchCount = isNon
          ? run.batchCount || 0
          : (run.batchCount || 0) + 1;
        const hitBatch = !isNon && batchCount >= BATCH_EVERY;
        await setRun({
          index: i + 1,
          batchCount: hitBatch ? 0 : batchCount,
          currentName: null,
          phase: "idle",
          retryCount: 0,
        });

        // 单条重抓：立即导出并暂停，不继续扫其它项
        if (only && item.name === only) {
          await setRun({ refetchOnly: null });
          await pauseRun(`已重抓并导出「${item.name}」`);
          break;
        }

        // 进度始终写入 storage；文件每 5 个有效食材才下载一次
        await persist("running", null, { download: hitBatch });

        if (pauseRequested || (await getRun()).status !== "running") break;

        if (isNon) {
          // 无结果：不休息，直接下一个
          continue;
        }
        if (hitBatch) await sleep(BATCH_REST_MS());
        else await sleep(BETWEEN_MS());
      }

      const done = await getDone();
      const unfinished = itemsAll.some((it) => !done[it.name]);
      const run = await getRun();
      if (run.refetchOnly) {
        // 重抓未正常结束（中途暂停等）：清标记，避免下次「继续」只跑一条
        if (run.status !== "running") {
          await setRun({ refetchOnly: null });
        }
      } else if (!unfinished) {
        await setRun({
          status: "done",
          pauseReason: null,
          currentName: null,
          phase: "idle",
        });
        await persist("done", null);
      }
      // 还有未完成项：若 status 仍是 running 且 phase 非 idle，说明在等跳转后续跑；
      // 若被用户暂停则 pauseRun 已写过。此处不再自动 pauseRun「已暂停」。
      else if (
        run.status === "running" &&
        (!run.phase || run.phase === "idle") &&
        !pauseRequested
      ) {
        // 循环意外结束但仍有任务：自动再开一轮，无需手动点「继续」
        loopActive = false;
        await sleep(400);
        runLoop();
        return;
      }
    } catch (e) {
      if (String(e.message) !== "已暂停" && !e.captcha && !e.navigated) {
        const run = await getRun();
        if (run.status === "running") {
          await pauseRun(String(e.message || e));
        }
      }
    } finally {
      loopActive = false;
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
      if (msg?.type === "XCF_START") {
        pauseRequested = false;
        doneCache = null;
        runCache = null;
        let done = await getDone();
        const stale = Object.values(done).some((rec) => !rec || !rec.resultKind);
        if (stale) {
          await clearAllDoneRecords();
          done = {};
          await storageSet({ xcfSchema: 2 });
        }
        await setRun({
          status: "running",
          pauseReason: null,
          batchCount: 0,
          phase: "idle",
          refetchOnly: null,
        });
        runLoop();
        sendResponse({ ok: true, doneCount: Object.keys(done).length });
        return;
      }
      if (msg?.type === "XCF_PAUSE") {
        await pauseRun("用户暂停");
        await setRun({ refetchOnly: null });
        sendResponse({ ok: true });
        return;
      }
      if (msg?.type === "XCF_RESUME") {
        pauseRequested = false;
        doneCache = null;
        runCache = null;
        await setRun({
          status: "running",
          pauseReason: null,
          refetchOnly: null,
        });
        runLoop();
        sendResponse({ ok: true });
        return;
      }
      if (msg?.type === "XCF_REFETCH") {
        const name = String(msg.name || "").trim();
        if (!name) {
          sendResponse({ ok: false, error: "请输入食材名" });
          return;
        }
        const run = await getRun();
        if (run.status === "running") {
          sendResponse({
            ok: false,
            error: "当前正在采集，请先点「暂停」再重抓",
          });
          return;
        }
        if (loopActive) {
          sendResponse({
            ok: false,
            error: "页面循环尚未结束，请稍候再试或先暂停",
          });
          return;
        }
        const items = await loadIngredients();
        const item = items.find((it) => it.name === name);
        if (!item) {
          sendResponse({ ok: false, error: `词表中无「${name}」` });
          return;
        }
        doneCache = null;
        runCache = null;
        await removeDoneRecord(name);
        const done = await getDone();
        const searched = Object.keys(done).sort();
        await storageSet({
          xcfProgress: {
            version: 3,
            updatedAt: new Date().toISOString(),
            status: "running",
            pauseReason: null,
            searched,
          },
          xcfSchema: 2,
        });
        pauseRequested = false;
        await setRun({
          status: "running",
          pauseReason: null,
          batchCount: 0,
          phase: "idle",
          currentName: null,
          retryCount: 0,
          refetchOnly: name,
        });
        runLoop();
        sendResponse({ ok: true, name });
        return;
      }
      if (msg?.type === "XCF_PING") {
        sendResponse({ ok: true, href: location.href });
        return;
      }
      sendResponse({ ok: false });
    })().catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  });

  async function tryResume() {
    // www 验证页：立刻后退，勿当整表验证码暂停
    if (isHumanCheckPage()) {
      const run = await getRun();
      if (run.status === "running" && needsAntibotTail(run.phase || "")) {
        try {
          await recoverAntibotHumanCheck("tryResume");
        } catch (e) {
          if (!e.navigated) console.warn("[xcf] humancheck resume", e);
        }
        return;
      }
    }
    await humanPause(RESUME_PAUSE_MS);
    const run = await getRun();
    if (run.status === "running" && !loopActive) {
      runLoop();
    }
  }

  tryResume();
  // bfcache 返回结果页时也要续跑回首页
  window.addEventListener("pageshow", () => {
    tryResume();
  });
})();
