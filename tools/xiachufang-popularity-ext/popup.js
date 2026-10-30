const $ = (id) => document.getElementById(id);

async function getActiveXcfTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  const tab = tabs[0];
  if (!tab?.id || !tab.url?.includes("mbdbj.xiachufang.com")) {
    return null;
  }
  return tab;
}

async function sendToContent(type, extra = {}) {
  const tab = await getActiveXcfTab();
  if (!tab) {
    throw new Error("请先打开 https://mbdbj.xiachufang.com/ 并停留在该标签页");
  }
  try {
    return await chrome.tabs.sendMessage(tab.id, { type, ...extra });
  } catch (e) {
    throw new Error("页面未注入脚本，请刷新下厨房页面后再试");
  }
}

async function refreshUi() {
  const res = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  const run = res.xcfRun || {};
  const progress = res.xcfProgress || {};
  const done =
    res.xcfDone && Object.keys(res.xcfDone).length
      ? res.xcfDone
      : Array.isArray(progress.searched)
        ? Object.fromEntries(progress.searched.map((name) => [name, {}]))
        : progress.done || {};
  const total = run.total || 0;
  const doneN = Object.keys(done).length;

  $("status").textContent = run.status || progress.status || "idle";
  $("progress").textContent = total
    ? `${doneN} / ${total}`
    : `${doneN} / ?`;
  $("current").textContent = run.currentName || "—";
  const hint = res.xcfSaveHint || "";
  const saveEl = $("saveServer");
  if (res.xcfSaveOk === true) {
    saveEl.textContent = hint || "result/ 正常";
    saveEl.style.color = "#0a7";
  } else if (res.xcfSaveOk === false) {
    saveEl.textContent = hint || "保存服务未开";
    saveEl.style.color = "#b00020";
  } else {
    saveEl.textContent = "检测中…";
    saveEl.style.color = "#666";
  }
  $("reason").textContent = run.pauseReason || progress.pauseReason || "";
}

async function checkSaveServer() {
  try {
    const res = await chrome.runtime.sendMessage({ type: "CHECK_SAVE_SERVER" });
    const el = $("saveServer");
    if (res && res.ok) {
      el.textContent = "已连接 → tools/.../result/";
      el.style.color = "#0a7";
    } else {
      el.textContent = "未开 save-server（导出可能进下载目录）";
      el.style.color = "#b00020";
    }
  } catch (_) {
    const el = $("saveServer");
    el.textContent = "未开 save-server";
    el.style.color = "#b00020";
  }
}

async function withErr(fn) {
  try {
    $("reason").textContent = "";
    await fn();
  } catch (e) {
    $("reason").textContent = String(e.message || e);
  }
  await refreshUi();
}

$("btnStart").addEventListener("click", () =>
  withErr(async () => {
    await sendToContent("XCF_START");
  })
);

$("btnPause").addEventListener("click", () =>
  withErr(async () => {
    await sendToContent("XCF_PAUSE");
  })
);

$("btnResume").addEventListener("click", () =>
  withErr(async () => {
    await sendToContent("XCF_RESUME");
  })
);

$("btnRefetch").addEventListener("click", () =>
  withErr(async () => {
    const name = ($("refetchName").value || "").trim();
    if (!name) throw new Error("请先输入要重抓的食材名");
    const res = await sendToContent("XCF_REFETCH", { name });
    if (res && res.ok === false) {
      throw new Error(res.error || "重抓失败");
    }
  })
);

$("refetchName").addEventListener("keydown", (ev) => {
  if (ev.key === "Enter") $("btnRefetch").click();
});

$("btnExport").addEventListener("click", () =>
  withErr(async () => {
    await chrome.runtime.sendMessage({ type: "EXPORT_TXT_ONLY" });
  })
);

$("btnImport").addEventListener("click", () => $("importFile").click());

$("importFile").addEventListener("change", async (ev) => {
  const file = ev.target.files?.[0];
  if (!file) return;
  await withErr(async () => {
    const text = await file.text();
    const data = JSON.parse(text);
    const searched = Array.isArray(data?.searched)
      ? data.searched.filter((name) => typeof name === "string" && name)
      : data?.done && typeof data.done === "object"
        ? Object.keys(data.done)
        : null;
    if (!searched) {
      throw new Error("无效进度文件：需要 searched 数组");
    }
    const REC_PREFIX = "xcfR:";
    const all = await chrome.storage.local.get(null);
    const remove = Object.keys(all).filter(
      (k) => k.startsWith(REC_PREFIX) || k === "xcfDone"
    );
    if (remove.length) await chrome.storage.local.remove(remove);
    const patch = {
      xcfProgress: {
        version: 3,
        updatedAt: new Date().toISOString(),
        status: "paused",
        pauseReason: "已导入进度，点「继续」或「开始」",
        searched,
      },
      xcfSchema: 2,
    };
    for (const name of searched) {
      patch[REC_PREFIX + name] = { resultKind: "searched" };
    }
    await chrome.storage.local.set(patch);
  });
  ev.target.value = "";
});

refreshUi();
checkSaveServer();
setInterval(refreshUi, 1500);
setInterval(checkSaveServer, 5000);
