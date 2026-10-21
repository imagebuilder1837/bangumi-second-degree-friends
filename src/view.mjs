export function mountView(window, entry, scan) {
  const { document } = window;
  const dialog = document.createElement("section");
  dialog.id = "second-degree-friends-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-label", "二度好友发现");
  dialog.hidden = true;
  dialog.innerHTML =
    '<div class="sdf-panel"><h2>二度好友发现</h2><p>好友的好友</p><button type="button">开始寻找</button> <button type="button" class="sdf-close">关闭</button><p role="status">尚未开始</p><ol></ol></div>';
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
  start.addEventListener("click", async () => {
    if (start.disabled) return;
    start.disabled = true;
    status.textContent = "正在读取好友";
    dialog.querySelector("ol").replaceChildren();
    try {
      const results = await scan();
      for (const [index, user] of results.entries()) {
        const row = document.createElement("li");
        if (index < 3) row.dataset.medal = ["gold", "silver", "bronze"][index];
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
      status.textContent = `完成：${results.length} 位候选用户`;
    } catch (error) {
      status.textContent = `读取失败，未完成：${error.message}`;
    } finally {
      start.disabled = false;
    }
  });
  document.body.append(dialog);
  entry.addEventListener("click", (event) => {
    event.preventDefault();
    dialog.hidden = false;
  });
}
