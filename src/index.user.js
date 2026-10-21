// ==UserScript==
// @name         Bangumi 二度好友发现
// @namespace    https://github.com/imagebuilder1837/bangumi-second-degree-friends
// @version      0.1.0
// @description  通过好友的好友、好友的反向好友、反向好友的好友及反向好友的反向好友，发现二度关系用户。
// @author       imagebuilder1837
// @match        https://bgm.tv/user/*
// @match        https://bangumi.tv/user/*
// @match        https://chii.in/user/*
// @run-at       document-end
// @grant        none
// @license      MIT
// @downloadURL  https://raw.githubusercontent.com/imagebuilder1837/bangumi-second-degree-friends/refs/heads/main/src/index.user.js
// @updateURL    https://raw.githubusercontent.com/imagebuilder1837/bangumi-second-degree-friends/refs/heads/main/src/index.user.js
// ==/UserScript==

// Generated from src/main.mjs and its src/*.mjs imports. Do not edit; run npm run build.
(function () {
  "use strict";

  function identity(document, base) {
    const anchor = document.querySelector(
      "#headerProfile h1.nameSingle .inner > .name > a[href]",
    );
    if (!anchor) throw new Error("无法识别主页用户");
    const url = new URL(anchor.getAttribute("href"), base);
    const match = /^\/user\/([^/]+)\/?$/.exec(url.pathname);
    if (url.origin !== new URL(base).origin || !match)
      throw new Error("无法识别主页用户");
    const current = anchor.parentElement
      .querySelector("small.grey")
      ?.textContent.trim();
    return current?.startsWith("@") && current.length > 1
      ? current.slice(1)
      : decodeURIComponent(match[1]);
  }

  function readHome(document, base) {
    const id = identity(document, base);
    const anchor = document.querySelector(
      '#headerProfile .navTabs a[href$="/friends"]',
    );
    if (!anchor) throw new Error("缺少好友链接");
    const friendsUrl = new URL(anchor.getAttribute("href"), base);
    if (
      friendsUrl.origin !== new URL(base).origin ||
      friendsUrl.pathname !== `/user/${encodeURIComponent(id)}/friends`
    )
      throw new Error("好友链接身份不匹配");
    return { id, friendsUrl: friendsUrl.href };
  }

  function readFriends(window, html, owner, base) {
    const document = new window.DOMParser().parseFromString(html, "text/html");
    if (identity(document, base) !== owner)
      throw new Error("关系页面身份不匹配");
    const list = document.querySelector("#memberUserList.usersMedium");
    if (!list) throw new Error("缺少好友列表");
    if (
      [...list.childNodes].some(
        (node) => node.nodeType === 3 && node.textContent.trim(),
      )
    )
      throw new Error("无法识别的好友列表");
    const members = new Map();
    for (const item of list.children) {
      if (!item.matches("li.user")) throw new Error("无效的好友条目");
      const anchor = item.querySelector(
        ".userContainer > strong > a.avatar[href]",
      );
      if (!anchor || !anchor.textContent.trim())
        throw new Error("无效的好友条目");
      const url = new URL(anchor.getAttribute("href"), base);
      const match = /^\/user\/([^/]+)$/.exec(url.pathname);
      if (url.origin !== new URL(base).origin || !match)
        throw new Error("无效的好友条目");
      const id = decodeURIComponent(match[1]);
      const background = anchor.querySelector(".userImage > .avatarNeue").style
        .backgroundImage;
      const avatar = new URL(
        /^url\(["']?(.*?)["']?\)$/.exec(background)[1],
        base,
      ).href;
      members.set(id, { id, name: anchor.textContent.trim(), avatar });
    }
    return members;
  }

  async function scanFriends(window, home) {
    const read = async (id, url) => {
      const response = await window.fetch(url, { credentials: "same-origin" });
      if (!response.ok) throw new Error("好友读取失败");
      if (response.url && response.url !== url)
        throw new Error("关系请求跳转到其他页面");
      return readFriends(window, await response.text(), id, url);
    };
    const friends = await read(home.id, home.friendsUrl);
    const candidates = new Map();
    for (const friend of friends.values()) {
      const url = new URL(
        `/user/${encodeURIComponent(friend.id)}/friends`,
        home.friendsUrl,
      ).href;
      const members = await read(friend.id, url);
      for (const user of members.values()) {
        if (user.id === home.id || friends.has(user.id)) continue;
        const candidate = candidates.get(user.id) ?? { ...user, count: 0 };
        candidate.count++;
        candidates.set(user.id, candidate);
      }
    }
    return [...candidates.values()].sort(
      (a, b) => b.count - a.count || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  }

  function mountView(window, entry, scan) {
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
          if (index < 3)
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

  function initialize(window) {
    const { document, location } = window;
    if (
      location.protocol !== "https:" ||
      !["bgm.tv", "bangumi.tv", "chii.in"].includes(location.host) ||
      !/^\/user\/[^/]+\/?$/.test(location.pathname)
    )
      return;
    const attach = () => {
      const services = document.querySelector(
        "#user_home .user_box ul.network_service",
      );
      if (!services || document.getElementById("second-degree-friends-entry"))
        return;
      let home;
      try {
        home = readHome(document, location.href);
      } catch {
        return;
      }
      const item = document.createElement("li");
      item.id = "second-degree-friends-entry";
      item.innerHTML =
        '<span class="service" style="background-color:#b58a00;color:#fff">SecondDegreeFriends</span> <span class="tip"><a class="l" href="#">二度好友发现</a></span>';
      services.append(item);
      mountView(window, item.querySelector("a"), () =>
        scanFriends(window, home),
      );
    };
    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", attach, { once: true });
    else attach();
  }

  initialize(window);
})();
