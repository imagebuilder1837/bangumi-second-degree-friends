export function mountView(window, entry, scan, cached = async () => undefined) {
  const { document } = window;
  const dialog = document.createElement("section");
  dialog.id = "second-degree-friends-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-label", "二度好友发现");
  dialog.setAttribute("aria-modal", "true");
  dialog.hidden = true;
  dialog.innerHTML =
    '<div class="sdf-panel"><header class="sdf-header"><div class="sdf-controls"><button type="button" class="sdf-start">开始寻找</button><select aria-label="发现模式"><option value="friends/friends">好友的好友</option><option value="friends/rev_friends">好友的反向好友</option><option value="rev_friends/friends">反向好友的好友</option><option value="rev_friends/rev_friends">反向好友的反向好友</option></select><button type="button" class="sdf-close" aria-label="关闭" title="关闭">×</button></div><div class="sdf-status"><p role="status">尚未开始</p><progress aria-label="扫描进度" hidden></progress><details hidden><summary>缓存详情</summary><p></p></details></div></header><div class="sdf-results" tabindex="0" role="region" aria-label="候选用户列表"><ol></ol><p class="sdf-empty">点击“开始寻找”，发现二度好友</p></div></div>';
  let scroll;
  const hide = () => {
    if (dialog.hidden) return;
    dialog.hidden = true;
    document.body.style.overflow = scroll.body;
    document.documentElement.style.overflow = scroll.root;
    entry.focus();
  };
  const focusable = () =>
    [
      ...dialog.querySelectorAll(
        "button, select, a[href], summary, [tabindex]",
      ),
    ].filter((node) => !node.disabled && !node.closest("[hidden]"));
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
    #second-degree-friends-dialog { --sdf-bg: #fff; --sdf-text: #333; --sdf-muted: #777; --sdf-border: #e4e4e4; --sdf-soft: #fafafa; --sdf-accent: #f09199; --sdf-accent-text: #8d3544; position: fixed; inset: 0; z-index: 10000; box-sizing: border-box; background: #0006; padding: 20px; color: var(--sdf-text); font: 13px/1.6 "SF Pro SC", "SF Pro Display", "PingFang SC", "Lucida Grande", "Helvetica Neue", Helvetica, Arial, sans-serif; }
    #second-degree-friends-dialog [hidden] { display: none !important; }
    #second-degree-friends-dialog:not([hidden]) { display: grid; place-items: center; }
    #second-degree-friends-dialog .sdf-panel { box-sizing: border-box; display: flex; flex-direction: column; width: min(780px, 100%); height: min(820px, 85dvh); min-height: 0; overflow: hidden; background: var(--sdf-bg); border: 1px solid var(--sdf-border); border-radius: 10px; box-shadow: 0 8px 40px #0003; }
    #second-degree-friends-dialog .sdf-header { flex: none; padding: 20px 22px 16px; border-bottom: 1px solid var(--sdf-border); }
    #second-degree-friends-dialog .sdf-controls { display: flex; align-items: center; gap: 10px; }
    #second-degree-friends-dialog button, #second-degree-friends-dialog select { box-sizing: border-box; max-width: 100%; border: 1px solid var(--sdf-border); border-radius: 16px; padding: 4px 12px; background: var(--sdf-soft); color: inherit; font: inherit; line-height: 20px; }
    #second-degree-friends-dialog button { cursor: pointer; }
    #second-degree-friends-dialog .sdf-start { flex-shrink: 0; border-color: var(--sdf-accent); background: var(--sdf-accent); color: #fff; font-weight: 600; }
    #second-degree-friends-dialog select { min-width: 0; max-width: calc(100% - 140px); cursor: pointer; }
    #second-degree-friends-dialog button:disabled, #second-degree-friends-dialog select:disabled { opacity: .55; cursor: default; }
    #second-degree-friends-dialog :focus-visible { outline: 2px solid var(--sdf-accent); outline-offset: 2px; }
    #second-degree-friends-dialog .sdf-close { flex-shrink: 0; margin-left: auto; width: 30px; height: 30px; padding: 0; border-color: transparent; background: transparent; color: var(--sdf-muted); font-size: 24px; font-weight: 300; }
    #second-degree-friends-dialog .sdf-status { margin-top: 16px; color: var(--sdf-muted); font-size: 12px; }
    #second-degree-friends-dialog [role="status"] { margin: 0; text-align: center; overflow-wrap: anywhere; }
    #second-degree-friends-dialog [data-warning="true"] { color: var(--sdf-accent-text); }
    #second-degree-friends-dialog progress { display: block; appearance: none; width: 100%; height: 5px; margin-top: 10px; border: 0; border-radius: 5px; overflow: hidden; background: var(--sdf-border); accent-color: var(--sdf-accent); }
    #second-degree-friends-dialog progress::-webkit-progress-bar { background: var(--sdf-border); }
    #second-degree-friends-dialog progress::-webkit-progress-value { background: var(--sdf-accent); border-radius: 5px; }
    #second-degree-friends-dialog progress::-moz-progress-bar { background: var(--sdf-accent); }
    #second-degree-friends-dialog progress:not([value]) { background: linear-gradient(90deg, var(--sdf-border), var(--sdf-accent), var(--sdf-border)); }
    #second-degree-friends-dialog details { margin-top: 8px; text-align: center; }
    #second-degree-friends-dialog summary { display: inline list-item; cursor: pointer; }
    #second-degree-friends-dialog details p { margin: 4px 0 0; overflow-wrap: anywhere; }
    #second-degree-friends-dialog .sdf-results { min-height: 0; overflow: auto; overscroll-behavior: contain; scrollbar-gutter: stable; padding: 16px 16px 20px 22px; }
    #second-degree-friends-dialog ol { list-style: none; margin: 0; padding: 0; }
    #second-degree-friends-dialog li { padding: 0; border-radius: 6px; margin: 0 0 8px; border: 1px solid var(--sdf-border); background: var(--sdf-bg); }
    #second-degree-friends-dialog .sdf-candidate { display: grid; grid-template-columns: minmax(32px, max-content) minmax(120px, 1fr) minmax(0, 1.5fr) auto; align-items: center; gap: 10px; padding: 12px; }
    #second-degree-friends-dialog .sdf-rank { text-align: center; font-size: 24px; font-weight: 600; line-height: 1; color: var(--sdf-muted); font-variant-numeric: tabular-nums; letter-spacing: -1px; }
    #second-degree-friends-dialog .sdf-candidate > a { display: flex; align-items: center; min-width: 0; gap: 10px; font-weight: 600; overflow-wrap: anywhere; }
    #second-degree-friends-dialog .sdf-score { min-width: 0; color: var(--sdf-muted); font-size: 12px; overflow-wrap: anywhere; }
    #second-degree-friends-dialog .count { color: var(--sdf-text); font-weight: 600; }
    #second-degree-friends-dialog img { display: block; flex-shrink: 0; border-radius: 5px; object-fit: cover; }
    #second-degree-friends-dialog .sdf-toggle { white-space: nowrap; padding: 4px 2px; border-color: transparent; border-radius: 4px; background: transparent; color: var(--sdf-muted); font-size: 12px; }
    #second-degree-friends-dialog .sdf-toggle::after { content: ""; display: inline-block; width: 6px; height: 6px; margin: 0 3px 3px 7px; border: solid currentColor; border-width: 0 1.5px 1.5px 0; transform: rotate(45deg); }
    #second-degree-friends-dialog .sdf-toggle[aria-expanded="true"]::after { margin-bottom: 0; transform: rotate(225deg); }
    #second-degree-friends-dialog .sdf-contributors { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0 12px 12px 54px; padding-top: 12px; border-top: 1px solid var(--sdf-border); }
    #second-degree-friends-dialog .sdf-contributors a { display: inline-flex; }
    #second-degree-friends-dialog .sdf-contributors button { font-size: 12px; }
    #second-degree-friends-dialog .sdf-empty { margin: 48px 12px; text-align: center; color: var(--sdf-muted); }
    #second-degree-friends-dialog [data-medal="gold"] { background: #fff7df; border-color: #ecdbab; }
    #second-degree-friends-dialog [data-medal="silver"] { background: #f1f3f6; border-color: #d9dfe7; }
    #second-degree-friends-dialog [data-medal="bronze"] { background: #f9eee5; border-color: #e7d3c1; }
    #second-degree-friends-dialog [data-medal="gold"] .sdf-rank { color: #a17c28; }
    #second-degree-friends-dialog [data-medal="silver"] .sdf-rank { color: #738198; }
    #second-degree-friends-dialog [data-medal="bronze"] .sdf-rank { color: #a17551; }
    html[data-theme="dark"] #second-degree-friends-dialog { --sdf-bg: #252525; --sdf-text: #d8d8d8; --sdf-muted: #aaa; --sdf-border: #444; --sdf-soft: #303030; --sdf-accent: #cf7885; --sdf-accent-text: #f0a5af; color-scheme: dark; }
    html[data-theme="dark"] #second-degree-friends-dialog [data-medal="gold"] { background: #3b3424; border-color: #655536; }
    html[data-theme="dark"] #second-degree-friends-dialog [data-medal="silver"] { background: #30343b; border-color: #4b5360; }
    html[data-theme="dark"] #second-degree-friends-dialog [data-medal="bronze"] { background: #3c3028; border-color: #68503d; }
    html[data-theme="dark"] #second-degree-friends-dialog [data-medal="gold"] .sdf-rank { color: #d6b668; }
    html[data-theme="dark"] #second-degree-friends-dialog [data-medal="silver"] .sdf-rank { color: #a5b3c9; }
    html[data-theme="dark"] #second-degree-friends-dialog [data-medal="bronze"] .sdf-rank { color: #d0a07a; }
    @media (max-width: 640px) {
      #second-degree-friends-dialog { padding: 8px; }
      #second-degree-friends-dialog .sdf-panel { height: calc(100dvh - 16px); }
      #second-degree-friends-dialog .sdf-header { padding: 16px 14px 12px; }
      #second-degree-friends-dialog .sdf-controls { gap: 6px; }
      #second-degree-friends-dialog .sdf-results { padding: 12px 8px 12px 14px; }
      #second-degree-friends-dialog .sdf-candidate { grid-template-columns: minmax(28px, max-content) minmax(0, 1fr) auto; gap: 4px 8px; padding: 10px; }
      #second-degree-friends-dialog .sdf-rank { grid-column: 1; grid-row: 1 / 3; font-size: 22px; }
      #second-degree-friends-dialog .sdf-candidate > a { grid-column: 2; grid-row: 1; }
      #second-degree-friends-dialog .sdf-score { grid-column: 2; grid-row: 2; }
      #second-degree-friends-dialog .sdf-toggle { grid-column: 3; grid-row: 1 / 3; }
      #second-degree-friends-dialog .sdf-contributors { margin-left: 46px; }
    }
    @media (max-width: 360px) {
      #second-degree-friends-dialog .sdf-controls { display: grid; grid-template-columns: 1fr 30px; gap: 8px; }
      #second-degree-friends-dialog .sdf-start { grid-column: 1; grid-row: 1; justify-self: start; }
      #second-degree-friends-dialog .sdf-close { grid-column: 2; grid-row: 1; margin-left: 0; }
      #second-degree-friends-dialog select { grid-column: 1 / -1; grid-row: 2; width: 100%; max-width: 100%; }
    }
  `;
  document.head.append(style);
  const start = dialog.querySelector("button");
  const status = dialog.querySelector('[role="status"]');
  const progressBar = dialog.querySelector("progress");
  const cacheDetails = dialog.querySelector("details");
  const skipDetails = document.createElement("details");
  skipDetails.hidden = true;
  skipDetails.innerHTML = "<summary>跳过详情</summary><div></div>";
  // Keep a potentially long details list in the scrollable results region.
  dialog.querySelector(".sdf-results").prepend(skipDetails);
  const skipSummary = (skipped = []) =>
    skipped.length ? `，跳过 ${skipped.length} 位 [已注销] 用户` : "";
  const showSkipped = (skipped = []) => {
    skipDetails.hidden = skipped.length === 0;
    const content = skipDetails.querySelector("div");
    content.replaceChildren();
    for (const { id, direction } of skipped) {
      const item = document.createElement("p");
      const link = document.createElement("a");
      link.href = `/user/${encodeURIComponent(id)}`;
      link.className = "l";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = id;
      item.append(
        link,
        ` · ${direction === "friends" ? "好友" : "反向好友"} · 原站错误页`,
      );
      content.append(item);
    }
  };
  const empty = dialog.querySelector(".sdf-empty");
  const homeName =
    document
      .querySelector("#headerProfile h1.nameSingle .inner > .name > a[href]")
      ?.textContent.trim() || "主页用户";
  const setStatus = (text, warning = false) => {
    status.textContent = text;
    status.dataset.warning = String(warning);
  };
  const setProgress = (counts) => {
    progressBar.hidden = false;
    if (!counts) {
      progressBar.removeAttribute("value");
      progressBar.removeAttribute("aria-valuetext");
      return;
    }
    progressBar.max = counts.total || 1;
    progressBar.value = counts.total ? counts.processed : 1;
    progressBar.setAttribute(
      "aria-valuetext",
      `已处理 ${counts.processed} / ${counts.total} 位中间用户，成功 ${counts.succeeded}，失败 ${counts.failed}${counts.skipped ? `，跳过 ${counts.skipped}` : ""}`,
    );
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
    avatar.width = avatar.height = showName ? 44 : 32;
    avatar.setAttribute("loading", "lazy");
    link.append(avatar);
    if (showName) link.append(user.name);
    return link;
  };
  const render = (results, complete = false) => {
    const focusedKey = document.activeElement?.dataset.focusKey;
    const focusedUser = document.activeElement?.closest("li")?.dataset.userId;
    dialog.querySelector("ol").replaceChildren();
    empty.hidden = results.length > 0;
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
      toggle.className = "sdf-toggle";
      toggle.dataset.focusKey = `toggle:${user.id}`;
      const open = expanded.has(user.id);
      toggle.textContent = open ? "收起" : "展开";
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
      const [first, second] = mode.value.split("/");
      const relation = first === "friends" ? "好友" : "反向好友";
      if (second === "friends")
        score.append(`${homeName} 的 `, count, ` 位${relation}加了 TA`);
      else score.append(`TA 加了 ${homeName} 的 `, count, ` 位${relation}`);
      const rank = document.createElement("span");
      rank.className = "sdf-rank";
      rank.textContent = String(index + 1);
      rank.setAttribute("aria-label", `第 ${index + 1} 名`);
      summary.append(rank, link, score, toggle);
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
    showSkipped();
    skipDetails.open = false;
    expanded.clear();
    visibleContributors.clear();
    visibleRanks = 50;
    render([]);
  };
  const mode = dialog.querySelector("select");
  let task;
  window.addEventListener("pagehide", () => task?.controller.abort());
  let cooldownUntil = 0;
  let viewed = false;
  let cacheRequest = 0;
  const showCached = async () => {
    const request = ++cacheRequest;
    viewed = true;
    resetResults();
    progressBar.hidden = true;
    cacheDetails.hidden = true;
    cacheDetails.open = false;
    empty.textContent = "正在读取缓存…";
    setStatus("正在读取缓存");
    let outcome;
    try {
      outcome = await cached(mode.value);
    } catch (error) {
      if (request === cacheRequest) {
        empty.textContent = `缓存读取失败：${error.message}`;
        if (window.Date.now() >= cooldownUntil)
          setStatus(`缓存读取失败：${error.message}；可主动开始寻找`, true);
      }
      return;
    }
    if (request !== cacheRequest) return;
    render(outcome?.results ?? [], Boolean(outcome));
    showSkipped(outcome?.skipped);
    empty.textContent = outcome
      ? "此模式下暂无候选用户"
      : "点击“开始寻找”，发现二度好友";
    if (outcome) {
      const formatTime = (value) =>
        new window.Date(value).toLocaleString("zh-CN", { hour12: false });
      cacheDetails.querySelector("p").textContent =
        `关系获取时间：${formatTime(outcome.earliest)} — ${formatTime(outcome.latest)}`;
      cacheDetails.hidden = false;
    }
    if (window.Date.now() < cooldownUntil) return;
    setStatus(
      outcome
        ? `已载入缓存 · ${outcome.results.length} 位候选用户${skipSummary(outcome.skipped)}`
        : "缓存不足，请主动开始寻找",
    );
  };
  mode.addEventListener("change", () => {
    if (task) {
      mode.value = task.mode;
      return;
    }
    showCached();
    if (window.Date.now() < cooldownUntil)
      setStatus("HTTP 429，冷却中；冷却结束后请手动开始", true);
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
    cacheRequest++;
    start.textContent = "停止寻找";
    mode.disabled = true;
    if (!dialog.hidden) start.focus();
    setStatus("正在获取主页关系");
    cacheDetails.hidden = true;
    cacheDetails.open = false;
    setProgress();
    empty.textContent = "正在寻找候选用户…";
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
              setStatus("冷却结束，请手动重新开始（结果未完成）", true);
            }
          };
          window.setTimeout(
            release,
            Math.min(Math.max(0, until - window.Date.now()), 2147483647),
          );
        },
        update: (results, progress, counts, skipped) => {
          if (task !== current || current.controller.signal.aborted) return;
          current.progress = progress;
          render(results);
          showSkipped(skipped);
          setProgress(counts);
          setStatus(`扫描进度：${progress}`, counts.failed > 0);
        },
      });
      render(outcome.results, outcome.complete);
      showSkipped(outcome.skipped);
      setProgress(outcome.counts);
      empty.textContent = outcome.complete
        ? "此模式下暂无候选用户"
        : "未发现候选用户，部分关系读取失败";
      setStatus(
        `${outcome.complete ? "完成" : "读取失败，未完成"}${skipSummary(outcome.skipped)}：${outcome.results.length} 位候选用户；${outcome.progress}${outcome.saveWarning ? `；${outcome.saveWarning}` : ""}`,
        !outcome.complete || Boolean(outcome.saveWarning),
      );
    } catch (error) {
      let message = current.rateLimited
        ? "HTTP 429，冷却中，结果未完成；冷却结束后请手动开始"
        : current.controller.signal.aborted
          ? "已停止，结果未完成"
          : `读取失败，未完成：${error.message}`;
      if (current.progress) message += `；${current.progress}`;
      empty.textContent = "结果未完成，可手动重新开始";
      // Unknown totals must not keep looking like an active scan after stopping.
      if (!progressBar.hasAttribute("value")) progressBar.hidden = true;
      setStatus(message, true);
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
    if (!viewed) showCached();
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
