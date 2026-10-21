export function mountView(window, entry, scan) {
  const { document } = window;
  const dialog = document.createElement("section");
  dialog.id = "second-degree-friends-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-label", "二度好友发现");
  dialog.setAttribute("aria-modal", "true");
  dialog.hidden = true;
  dialog.innerHTML =
    '<div class="sdf-panel"><h2>二度好友发现</h2><div class="sdf-controls"><label>模式 <select aria-label="发现模式"><option value="friends/friends">好友的好友</option><option value="friends/rev_friends">好友的反向好友</option><option value="rev_friends/friends">反向好友的好友</option><option value="rev_friends/rev_friends">反向好友的反向好友</option></select></label><button type="button">开始寻找</button> <button type="button" class="sdf-close">关闭</button></div><p role="status">尚未开始</p><ol></ol></div>';
  let scroll;
  const hide = () => {
    if (dialog.hidden) return;
    dialog.hidden = true;
    document.body.style.overflow = scroll.body;
    document.documentElement.style.overflow = scroll.root;
    entry.focus();
  };
  const focusable = () =>
    [...dialog.querySelectorAll("button, select, a[href]")].filter(
      (node) => !node.disabled && !node.closest("[hidden]"),
    );
  dialog.querySelector(".sdf-close").addEventListener("click", hide);
  document.addEventListener("focusin", (event) => {
    if (!dialog.hidden && !dialog.contains(event.target))
      focusable()[0]?.focus();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      hide();
    } else if (event.key === "Tab") {
      const items = focusable();
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
  const style = document.createElement("style");
  style.textContent = `
    #second-degree-friends-entry .sdf-entry-status { margin-left: 4px; }
    #second-degree-friends-dialog { --sdf-bg: #fff; --sdf-text: #333; --sdf-border: #ddd; --sdf-soft: #f6f6f6; position: fixed; inset: 0; z-index: 10000; background: #0007; padding: 16px; color: var(--sdf-text); font: 13px/1.6 system-ui, sans-serif; }
    #second-degree-friends-dialog:not([hidden]) { display: grid; place-items: center; }
    #second-degree-friends-dialog .sdf-panel { box-sizing: border-box; width: min(720px, 100%); max-height: min(85vh, 900px); overflow: auto; overscroll-behavior: contain; padding: 20px; background: var(--sdf-bg); border: 1px solid var(--sdf-border); border-radius: 12px; box-shadow: 0 4px 24px #0004; }
    #second-degree-friends-dialog h2 { margin: 0 0 16px; font-size: 18px; color: inherit; }
    #second-degree-friends-dialog .sdf-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    #second-degree-friends-dialog label { display: flex; align-items: center; gap: 6px; }
    #second-degree-friends-dialog button, #second-degree-friends-dialog select { box-sizing: border-box; max-width: 100%; border: 1px solid var(--sdf-border); border-radius: 16px; padding: 5px 10px; background: var(--sdf-soft); color: inherit; font: inherit; }
    #second-degree-friends-dialog button { cursor: pointer; }
    #second-degree-friends-dialog button:disabled, #second-degree-friends-dialog select:disabled { opacity: .6; cursor: default; }
    #second-degree-friends-dialog :focus-visible { outline: 2px solid #0084b4; outline-offset: 2px; }
    #second-degree-friends-dialog .sdf-close { margin-left: auto; }
    #second-degree-friends-dialog [role="status"] { margin: 14px 0; padding: 8px 10px; border-radius: 6px; background: var(--sdf-soft); overflow-wrap: anywhere; }
    #second-degree-friends-dialog ol { margin: 0 0 12px; padding-left: 28px; }
    #second-degree-friends-dialog li { padding: 10px; border-radius: 8px; margin: 6px 0; border: 1px solid var(--sdf-border); }
    #second-degree-friends-dialog .sdf-candidate { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    #second-degree-friends-dialog .sdf-candidate > a { display: inline-flex; align-items: center; flex: 1; min-width: 0; overflow-wrap: anywhere; }
    #second-degree-friends-dialog .sdf-score { white-space: nowrap; }
    #second-degree-friends-dialog .count { font-weight: bold; }
    #second-degree-friends-dialog img { display: inline-block; flex-shrink: 0; vertical-align: middle; border-radius: 6px; object-fit: cover; }
    #second-degree-friends-dialog .sdf-candidate img { margin-right: 8px; }
    #second-degree-friends-dialog .sdf-contributors { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--sdf-border); }
    #second-degree-friends-dialog .sdf-contributors a { display: inline-flex; }
    #second-degree-friends-dialog [data-medal="gold"] { background: #f4dfa0; }
    #second-degree-friends-dialog [data-medal="silver"] { background: #e0e4e9; }
    #second-degree-friends-dialog [data-medal="bronze"] { background: #e7c7ad; }
    html[data-theme="dark"] #second-degree-friends-dialog { --sdf-bg: #252525; --sdf-text: #d8d8d8; --sdf-border: #555; --sdf-soft: #303030; color-scheme: dark; }
    html[data-theme="dark"] #second-degree-friends-dialog [data-medal="gold"] { background: #514526; }
    html[data-theme="dark"] #second-degree-friends-dialog [data-medal="silver"] { background: #3e444c; }
    html[data-theme="dark"] #second-degree-friends-dialog [data-medal="bronze"] { background: #503d2f; }
    @media (max-width: 480px) {
      #second-degree-friends-dialog { padding: 8px; }
      #second-degree-friends-dialog .sdf-panel { padding: 12px; max-height: calc(100dvh - 16px); }
      #second-degree-friends-dialog .sdf-controls label { flex-basis: 100%; }
      #second-degree-friends-dialog .sdf-candidate > a { flex-basis: calc(100% - 8px); }
    }
  `;
  document.head.append(style);
  const start = dialog.querySelector("button");
  const status = dialog.querySelector('[role="status"]');
  const entryStatus = document.createElement("span");
  entryStatus.className = "tip sdf-entry-status";
  entry.after(entryStatus);
  const setStatus = (text, brief = text) => {
    status.textContent = text;
    entryStatus.textContent = ` · ${brief}`;
  };
  const expanded = new Set();
  let visibleRanks = 50;
  const visibleContributors = new Map();
  const moreRanks = document.createElement("button");
  moreRanks.type = "button";
  moreRanks.textContent = "显示更多";
  moreRanks.dataset.focusKey = "more-ranks";
  const userLink = (user, showName = false) => {
    const link = document.createElement("a");
    link.href = `/user/${encodeURIComponent(user.id)}`;
    link.className = "l";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = user.name;
    const avatar = document.createElement("img");
    avatar.src = user.avatar;
    avatar.alt = showName ? "" : user.name;
    avatar.width = avatar.height = 48;
    avatar.setAttribute("loading", "lazy");
    link.append(avatar);
    if (showName) link.append(user.name);
    return link;
  };
  const render = (results, complete = false) => {
    const focusedKey = document.activeElement?.dataset.focusKey;
    const focusedUser = document.activeElement?.closest("li")?.dataset.userId;
    dialog.querySelector("ol").replaceChildren();
    moreRanks.remove();
    for (const [index, user] of results.slice(0, visibleRanks).entries()) {
      const row = document.createElement("li");
      row.dataset.userId = user.id;
      if (complete && index < 3)
        row.dataset.medal = ["gold", "silver", "bronze"][index];
      const link = userLink(user, true);
      link.dataset.focusKey = `candidate:${user.id}`;
      const count = document.createElement("span");
      count.className = "count";
      count.textContent = String(user.count);
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.dataset.focusKey = `toggle:${user.id}`;
      const open = expanded.has(user.id);
      toggle.textContent = open ? "收起贡献者" : "展开贡献者";
      toggle.setAttribute("aria-expanded", String(open));
      toggle.addEventListener("click", () => {
        if (open) expanded.delete(user.id);
        else expanded.add(user.id);
        render(results, complete);
      });
      const summary = document.createElement("div");
      summary.className = "sdf-candidate";
      const score = document.createElement("span");
      score.className = "sdf-score";
      score.append(count, " 位贡献者");
      summary.append(link, score, toggle);
      row.append(summary);
      if (open) {
        const contributors = document.createElement("div");
        contributors.className = "sdf-contributors";
        const visible = visibleContributors.get(user.id) ?? 40;
        for (const contributor of user.contributors.slice(0, visible)) {
          const link = userLink(contributor);
          link.dataset.focusKey = `contributor:${user.id}:${contributor.id}`;
          contributors.append(link);
        }
        if (user.contributors.length > visible) {
          const more = document.createElement("button");
          more.type = "button";
          more.textContent = "显示更多头像";
          more.dataset.focusKey = `more-contributors:${user.id}`;
          more.addEventListener("click", () => {
            visibleContributors.set(user.id, visible + 40);
            render(results, complete);
          });
          contributors.append(more);
        }
        row.append(contributors);
      }
      dialog.querySelector("ol").append(row);
    }
    if (results.length > visibleRanks) {
      dialog.querySelector("ol").after(moreRanks);
      moreRanks.onclick = () => {
        visibleRanks += 50;
        render(results, complete);
      };
    }
    if (!dialog.hidden && focusedKey) {
      const target = [...dialog.querySelectorAll("[data-focus-key]")].find(
        (node) => node.dataset.focusKey === focusedKey,
      );
      const row = [...dialog.querySelectorAll("ol > li")].find(
        (node) => node.dataset.userId === focusedUser,
      );
      (
        target ??
        row?.querySelector("button") ??
        dialog.querySelector("ol > li:last-child a")
      )?.focus();
    }
  };
  const resetResults = () => {
    expanded.clear();
    visibleContributors.clear();
    visibleRanks = 50;
    render([]);
  };
  const mode = dialog.querySelector("select");
  let task;
  window.addEventListener("pagehide", () => task?.controller.abort());
  let cooldownUntil = 0;
  mode.addEventListener("change", () => {
    if (task) {
      mode.value = task.mode;
      return;
    }
    resetResults();
    setStatus(
      window.Date.now() < cooldownUntil
        ? "HTTP 429，冷却中；冷却结束后请手动开始"
        : "尚未开始",
    );
  });
  start.addEventListener("click", async () => {
    if (start.disabled || window.Date.now() < cooldownUntil) return;
    if (task) {
      task.controller.abort();
      return;
    }
    const current = {
      controller: new window.AbortController(),
      mode: mode.value,
    };
    task = current;
    start.textContent = "停止寻找";
    mode.disabled = true;
    if (!dialog.hidden) start.focus();
    setStatus("正在获取主页关系");
    resetResults();
    try {
      const outcome = await scan(current.mode, {
        signal: current.controller.signal,
        rateLimited: (until) => {
          cooldownUntil = until;
          current.rateLimited = true;
          start.disabled = true;
          current.controller.abort();
          const release = () => {
            const remaining = until - window.Date.now();
            if (remaining > 0)
              window.setTimeout(release, Math.min(remaining, 2147483647));
            else {
              start.disabled = false;
              setStatus("冷却结束，请手动重新开始（结果未完成）");
            }
          };
          window.setTimeout(
            release,
            Math.min(Math.max(0, until - window.Date.now()), 2147483647),
          );
        },
        update: (results, progress) => {
          if (task !== current || current.controller.signal.aborted) return;
          current.progress = progress;
          render(results);
          setStatus(`正在寻找：${progress}`, `寻找 ${progress.split("，")[0]}`);
        },
      });
      render(outcome.results, outcome.complete);
      setStatus(
        `${outcome.complete ? "完成" : "读取失败，未完成"}：${outcome.results.length} 位候选用户；${outcome.progress}`,
        `${outcome.complete ? "完成" : "未完成"} · ${outcome.results.length} 人`,
      );
    } catch (error) {
      let message = current.rateLimited
        ? "HTTP 429，冷却中，结果未完成；冷却结束后请手动开始"
        : current.controller.signal.aborted
          ? "已停止，结果未完成"
          : `读取失败，未完成：${error.message}`;
      if (current.progress) message += `；${current.progress}`;
      setStatus(message, current.rateLimited ? "冷却中 · 未完成" : "未完成");
    } finally {
      task = undefined;
      start.textContent = "开始寻找";
      mode.disabled = false;
    }
  });
  document.body.append(dialog);
  entry.addEventListener("click", (event) => {
    event.preventDefault();
    if (!dialog.hidden) return;
    scroll = {
      body: document.body.style.overflow,
      root: document.documentElement.style.overflow,
    };
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    dialog.hidden = false;
    focusable()[0]?.focus();
  });
}
