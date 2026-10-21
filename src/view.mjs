export function mountView(window, entry, scan, cached = () => undefined) {
  const { document } = window;
  const dialog = document.createElement("section");
  dialog.id = "second-degree-friends-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-label", "二度好友发现");
  dialog.hidden = true;
  dialog.innerHTML =
    '<div class="sdf-panel"><h2>二度好友发现</h2><label>模式 <select aria-label="发现模式"><option value="friends/friends">好友的好友</option><option value="friends/rev_friends">好友的反向好友</option><option value="rev_friends/friends">反向好友的好友</option><option value="rev_friends/rev_friends">反向好友的反向好友</option></select></label><button type="button">开始寻找</button> <button type="button" class="sdf-close">关闭</button><p role="status">尚未开始</p><ol></ol></div>';
  dialog.querySelector(".sdf-close").addEventListener("click", () => {
    dialog.hidden = true;
  });
  const style = document.createElement("style");
  style.textContent = `
    #second-degree-friends-dialog:not([hidden]) { display: grid; place-items: center; }
    #second-degree-friends-dialog { position: fixed; inset: 0; z-index: 10000; background: #0006; padding: 16px; color: #333; }
    #second-degree-friends-dialog .sdf-panel { box-sizing: border-box; width: min(640px, 100%); max-height: 85vh; overflow: auto; padding: 20px; background: #fff; border-radius: 12px; box-shadow: 0 4px 24px #0004; }
    #second-degree-friends-dialog li { padding: 8px; border-radius: 6px; margin: 4px 0; }
    #second-degree-friends-dialog img { vertical-align: middle; margin-right: 8px; border-radius: 6px; }
    #second-degree-friends-dialog [data-medal="gold"] { background: #f4dfa0; }
    #second-degree-friends-dialog [data-medal="silver"] { background: #e0e4e9; }
    #second-degree-friends-dialog [data-medal="bronze"] { background: #e7c7ad; }
    html[data-theme="dark"] #second-degree-friends-dialog { color: #d8d8d8; }
    html[data-theme="dark"] #second-degree-friends-dialog .sdf-panel { background: #252525; }
    html[data-theme="dark"] #second-degree-friends-dialog [data-medal] { color: #333; }
  `;
  document.head.append(style);
  const start = dialog.querySelector("button");
  const status = dialog.querySelector('[role="status"]');
  const render = (results, complete = false) => {
    dialog.querySelector("ol").replaceChildren();
    for (const [index, user] of results.entries()) {
      const row = document.createElement("li");
      if (complete && index < 3)
        row.dataset.medal = ["gold", "silver", "bronze"][index];
      const avatar = document.createElement("img");
      avatar.src = user.avatar;
      avatar.alt = "";
      avatar.width = avatar.height = 48;
      const link = document.createElement("a");
      link.href = `/user/${encodeURIComponent(user.id)}`;
      link.className = "l";
      link.textContent = user.name;
      const count = document.createElement("span");
      count.className = "count";
      count.textContent = String(user.count);
      row.append(avatar, link, " · ", count);
      dialog.querySelector("ol").append(row);
    }
  };
  const mode = dialog.querySelector("select");
  let task;
  let cooldownUntil = 0;
  let viewed = false;
  const showCached = () => {
    const outcome = cached(mode.value);
    render(outcome?.results ?? [], Boolean(outcome));
    status.textContent = outcome
      ? `缓存：${outcome.results.length} 位候选用户；关系获取时间 ${new window.Date(outcome.earliest).toISOString()} — ${new window.Date(outcome.latest).toISOString()}`
      : "缓存不足，请主动开始寻找";
    viewed = true;
  };
  mode.addEventListener("change", () => {
    if (task) {
      mode.value = task.mode;
      return;
    }
    showCached();
    if (window.Date.now() < cooldownUntil)
      status.textContent = "HTTP 429，冷却中；冷却结束后请手动开始";
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
    status.textContent = "正在获取主页关系";
    dialog.querySelector("ol").replaceChildren();
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
              status.textContent = "冷却结束，请手动重新开始（结果未完成）";
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
          status.textContent = `正在寻找：${progress}`;
        },
      });
      render(outcome.results, outcome.complete);
      status.textContent = `${outcome.complete ? "完成" : "读取失败，未完成"}：${outcome.results.length} 位候选用户；${outcome.progress}${outcome.saveWarning ? `；${outcome.saveWarning}` : ""}`;
    } catch (error) {
      status.textContent = current.rateLimited
        ? "HTTP 429，冷却中，结果未完成；冷却结束后请手动开始"
        : current.controller.signal.aborted
          ? "已停止，结果未完成"
          : `读取失败，未完成：${error.message}`;
      if (current.progress) status.textContent += `；${current.progress}`;
    } finally {
      task = undefined;
      start.textContent = "开始寻找";
      mode.disabled = false;
    }
  });
  document.body.append(dialog);
  entry.addEventListener("click", (event) => {
    event.preventDefault();
    if (!viewed) showCached();
    dialog.hidden = false;
  });
}
