// ==UserScript==
// @name         Bangumi 二度好友发现
// @namespace    https://github.com/imagebuilder1837/bangumi-second-degree-friends
// @version      0.1.0
// @description  发现那些 TA 的好友加了但 TA 没加的用户。
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
    const reverse = document.querySelector('#friend a[href$="/rev_friends"]');
    let reverseUrl;
    if (reverse) {
      reverseUrl = new URL(reverse.getAttribute("href"), base);
      if (
        reverseUrl.origin !== friendsUrl.origin ||
        reverseUrl.pathname !== `/user/${encodeURIComponent(id)}/rev_friends`
      )
        throw new Error("反向好友链接身份不匹配");
    }
    return { id, friendsUrl: friendsUrl.href, reverseUrl: reverseUrl?.href };
  }

  function readRelationships(window, html, owner, base) {
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
      if (!anchor) throw new Error("无效的好友条目");
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

  class TransientError extends Error {
    constructor(message, retryAt = 0) {
      super(message);
      this.retryAt = retryAt;
    }
  }

  function retryAfter(window, value) {
    if (typeof value !== "string" || !value.trim()) return undefined;
    const text = value.trim();
    if (/^\d+$/.test(text)) {
      const at = window.Date.now() + Number(text) * 1000;
      return Number.isFinite(at) ? at : undefined;
    }
    const date = new Date(Date.parse(text));
    if (!Number.isFinite(date.getTime())) return undefined;
    const canonical = text
      .replace(
        /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\d{2})-([A-Z][a-z]{2})-\d{2} (\d{2}:\d{2}:\d{2}) GMT$/,
        (_, day, number, month, time) =>
          `${day.slice(0, 3)}, ${number} ${month} ${date.getUTCFullYear()} ${time} GMT`,
      )
      .replace(
        /^([A-Z][a-z]{2}) ([A-Z][a-z]{2}) ([ \d]\d) (\d{2}:\d{2}:\d{2}) (\d{4})$/,
        (_, day, month, number, time, year) =>
          `${day}, ${number.trim().padStart(2, "0")} ${month} ${year} ${time} GMT`,
      );
    return canonical === date.toUTCString()
      ? Math.max(window.Date.now(), date.getTime())
      : undefined;
  }

  function wait(window, delay, signal) {
    return new Promise((resolve, reject) => {
      signal.throwIfAborted();
      const abort = () => {
        window.clearTimeout(timer);
        reject(signal.reason);
      };
      const until = window.Date.now() + delay;
      let timer;
      const wake = () => {
        const remaining = until - window.Date.now();
        // Browsers clamp overflowing delays to almost immediate timers.
        if (remaining > 0)
          timer = window.setTimeout(wake, Math.min(remaining, 2147483647));
        else {
          signal.removeEventListener("abort", abort);
          resolve();
        }
      };
      signal.addEventListener("abort", abort, { once: true });
      wake();
    });
  }

  // Fetch and body reading must settle on cancellation even if a transport ignores abort.
  async function attempt(window, url, signal, rateLimited) {
    signal.throwIfAborted();
    const controller = new window.AbortController();
    const cancel = () => controller.abort(signal.reason);
    signal.addEventListener("abort", cancel, { once: true });
    const timer = window.setTimeout(
      () => controller.abort(new TransientError("关系请求超时")),
      30000,
    );
    let abort;
    const cancelled = new Promise((_, reject) => {
      abort = () => reject(controller.signal.reason);
      controller.signal.addEventListener("abort", abort, { once: true });
    });
    try {
      return await Promise.race([
        (async () => {
          let response;
          try {
            response = await window.fetch(url, {
              credentials: "same-origin",
              signal: controller.signal,
            });
          } catch (error) {
            throw new TransientError(error.message);
          }
          controller.signal.throwIfAborted();
          if (!response.ok) {
            if (response.status === 429) {
              const until =
                retryAfter(window, response.headers?.get("Retry-After")) ??
                window.Date.now() + 60000;
              rateLimited(until);
              signal.throwIfAborted();
              throw new Error("HTTP 429");
            }
            if (
              response.status === 408 ||
              (response.status >= 500 && response.status <= 599)
            ) {
              const retryAt =
                response.status === 503
                  ? retryAfter(window, response.headers?.get("Retry-After"))
                  : undefined;
              throw new TransientError(
                `关系读取失败：HTTP ${response.status}`,
                retryAt,
              );
            }
            throw new Error("关系读取失败");
          }
          if (response.url && response.url !== url)
            throw new Error("关系请求跳转到其他页面");
          try {
            return await response.text();
          } catch (error) {
            throw new TransientError(error.message);
          }
        })(),
        cancelled,
      ]);
    } finally {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      controller.signal.removeEventListener("abort", abort);
    }
  }

  async function requestText(window, url, signal, rateLimited) {
    for (let retry = 0; ; retry++) {
      try {
        return await attempt(window, url, signal, rateLimited);
      } catch (error) {
        signal.throwIfAborted();
        if (!(error instanceof TransientError) || retry === 2) throw error;
        const delay = Math.max(
          1000 * 2 ** retry + window.Math.random() * 250,
          error.retryAt - window.Date.now(),
        );
        await wait(window, delay, signal);
      }
    }
  }

  function addContributions(candidates, members, intermediary, excluded) {
    const next = new Map(candidates);
    for (const user of members) {
      if (excluded.has(user.id)) continue;
      const previous = next.get(user.id) ?? {
        ...user,
        count: 0,
        contributors: [],
      };
      next.set(user.id, {
        ...previous,
        count: previous.count + 1,
        contributors: [...previous.contributors, intermediary],
      });
    }
    return next;
  }

  function rankCandidates(candidates) {
    return [...candidates.values()].sort(
      (a, b) => b.count - a.count || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  }

  async function scanRelationships(
    window,
    home,
    mode,
    { update, signal, rateLimited },
  ) {
    const [first, second] = mode.split("/");
    const homeUrl = (direction) => {
      const url = direction === "friends" ? home.friendsUrl : home.reverseUrl;
      if (!url) throw new Error("缺少主页关系列表链接");
      return url;
    };
    const staged = {
      relationships: Object.create(null),
      users: Object.create(null),
    };
    const read = async (id, url) => {
      const text = await requestText(window, url, signal, rateLimited);
      signal.throwIfAborted();
      const members = readRelationships(window, text, id, url);
      const direction = new URL(url).pathname.split("/").at(-1);
      staged.relationships[id] ??= Object.create(null);
      staged.relationships[id][direction] = {
        members: [...members.keys()],
        fetchedAt: window.Date.now(),
      };
      for (const user of members.values())
        staged.users[user.id] = {
          name: user.name,
          avatar: user.avatar,
          fetchedAt: window.Date.now(),
        };
      return members;
    };
    const firstMembers = await read(home.id, homeUrl(first));
    const excluded =
      first === second ? firstMembers : await read(home.id, homeUrl(second));
    const excludedIds = new Set([home.id, ...excluded.keys()]);
    let candidates = new Map();
    const intermediates = [...firstMembers.values()];
    let next = 0;
    let succeeded = 0;
    let failed = 0;
    const publish = () => {
      signal.throwIfAborted();
      const results = rankCandidates(candidates);
      const counts = {
        processed: succeeded + failed,
        total: intermediates.length,
        succeeded,
        failed,
      };
      const progress = `${counts.processed}/${counts.total}，成功 ${succeeded}，失败 ${failed}`;
      update(results, progress, counts);
      return { results, progress, counts, complete: failed === 0 };
    };
    publish();
    const worker = async () => {
      while (next < intermediates.length) {
        signal.throwIfAborted();
        const intermediary = intermediates[next++];
        const url = new URL(
          `/user/${encodeURIComponent(intermediary.id)}/${second}`,
          home.friendsUrl,
        ).href;
        try {
          const members = await read(intermediary.id, url);
          candidates = addContributions(
            candidates,
            members.values(),
            intermediary,
            excludedIds,
          );
          succeeded++;
        } catch {
          signal.throwIfAborted();
          failed++;
        }
        publish();
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(4, intermediates.length) }, worker),
    );
    return { ...publish(), staged };
  }

  function mountView(window, entry, scan, cached = async () => undefined) {
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
        `已处理 ${counts.processed} / ${counts.total} 位中间用户，成功 ${counts.succeeded}，失败 ${counts.failed}`,
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
          ? `已载入缓存 · ${outcome.results.length} 位候选用户`
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
          update: (results, progress, counts) => {
            if (task !== current || current.controller.signal.aborted) return;
            current.progress = progress;
            render(results);
            setProgress(counts);
            setStatus(`扫描进度：${progress}`, counts.failed > 0);
          },
        });
        render(outcome.results, outcome.complete);
        setProgress(outcome.counts);
        empty.textContent = outcome.complete
          ? "此模式下暂无候选用户"
          : "未发现候选用户，部分关系读取失败";
        setStatus(
          `${outcome.complete ? "完成" : "读取失败，未完成"}：${outcome.results.length} 位候选用户；${outcome.progress}${outcome.saveWarning ? `；${outcome.saveWarning}` : ""}`,
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

  const databaseName = "second-degree-friends";
  const storeName = "relationships";
  const unavailableMessage =
    "IndexedDB 不可用或访问被拒绝，请检查浏览器支持和站点存储权限后重试";
  const dictionary = () => Object.create(null);
  const empty = () => ({
    version: 1,
    relationships: dictionary(),
    users: dictionary(),
  });
  const record = (value) =>
    value && typeof value === "object" && !Array.isArray(value);
  const timestamp = (value) =>
    Number.isFinite(value) && value >= 0 && value <= 8640000000000000;
  const identifier = (value) => typeof value === "string" && value.length > 0;

  function validated(value) {
    const data = empty();
    if (
      value?.version !== 1 ||
      !record(value.relationships) ||
      !record(value.users)
    )
      return data;
    for (const [id, directions] of Object.entries(value.relationships)) {
      if (!identifier(id) || !record(directions)) continue;
      for (const direction of ["friends", "rev_friends"]) {
        const snapshot = directions[direction];
        if (
          !record(snapshot) ||
          !timestamp(snapshot.fetchedAt) ||
          !Array.isArray(snapshot.members) ||
          !snapshot.members.every(identifier)
        )
          continue;
        data.relationships[id] ??= dictionary();
        data.relationships[id][direction] = {
          members: [...new Set(snapshot.members)],
          fetchedAt: snapshot.fetchedAt,
        };
      }
    }
    for (const [id, user] of Object.entries(value.users)) {
      if (
        !record(user) ||
        typeof user.name !== "string" ||
        typeof user.avatar !== "string" ||
        !/^https?:\/\//.test(user.avatar) ||
        !timestamp(user.fetchedAt)
      )
        continue;
      data.users[id] = {
        name: user.name,
        avatar: user.avatar,
        fetchedAt: user.fetchedAt,
      };
    }
    return data;
  }

  async function transact(window, mode, operation, signal) {
    signal?.throwIfAborted();
    if (typeof window.indexedDB?.open !== "function")
      throw new Error(unavailableMessage);
    return new Promise((resolve, reject) => {
      const opening = window.indexedDB.open(databaseName, 1);
      let blocked = false;
      opening.onupgradeneeded = () => {
        opening.result.createObjectStore(storeName);
      };
      opening.onerror = () => reject(opening.error);
      opening.onblocked = () => {
        blocked = true;
        reject(
          new Error("IndexedDB 升级被其他标签页阻塞，请关闭其他标签页后重试"),
        );
      };
      opening.onsuccess = () => {
        const database = opening.result;
        database.onversionchange = () => database.close();
        if (blocked || signal?.aborted) {
          database.close();
          reject(signal?.reason);
          return;
        }
        let transaction;
        try {
          transaction = database.transaction(storeName, mode);
        } catch (error) {
          database.close();
          reject(error);
          return;
        }
        let result;
        let failure;
        const abort = () => transaction.abort();
        const close = () => {
          signal?.removeEventListener("abort", abort);
          database.close();
        };
        signal?.addEventListener("abort", abort, { once: true });
        transaction.onabort = () => {
          close();
          reject(
            signal?.aborted ? signal.reason : (failure ?? transaction.error),
          );
        };
        transaction.oncomplete = () => {
          close();
          resolve(result);
        };
        const store = transaction.objectStore(storeName);
        const reading = store.get("snapshots");
        reading.onsuccess = () => {
          try {
            signal?.throwIfAborted();
            result = operation(store, validated(reading.result));
          } catch (error) {
            failure = error;
            transaction.abort();
          }
        };
      };
    });
  }

  function cacheFailure(error) {
    if (error?.name === "QuotaExceededError")
      return "存储容量不足，请检查浏览器存储容量后重试";
    if (
      ["SecurityError", "InvalidStateError", "NotAllowedError"].includes(
        error?.name,
      )
    )
      return unavailableMessage;
    return error?.message || unavailableMessage;
  }

  function relationshipCache(window, home) {
    return {
      async lookup(mode) {
        const data = await transact(window, "readonly", (_, data) => data);
        const [first, second] = mode.split("/");
        const initial = data.relationships[home.id]?.[first];
        const excluded = data.relationships[home.id]?.[second];
        if (!initial || !excluded) return;
        const snapshots = [initial, excluded];
        const excludedIds = new Set([home.id, ...excluded.members]);
        const user = (id) => ({ id, name: id, avatar: "", ...data.users[id] });
        let candidates = new Map();
        for (const id of initial.members) {
          const snapshot = data.relationships[id]?.[second];
          if (!snapshot) return;
          snapshots.push(snapshot);
          candidates = addContributions(
            candidates,
            snapshot.members.map(user),
            user(id),
            excludedIds,
          );
        }
        return {
          results: rankCandidates(candidates),
          complete: true,
          earliest: Math.min(
            ...snapshots.map((snapshot) => snapshot.fetchedAt),
          ),
          latest: Math.max(...snapshots.map((snapshot) => snapshot.fetchedAt)),
        };
      },
      async commit(staged, signal) {
        await transact(
          window,
          "readwrite",
          (store, merged) => {
            for (const [id, directions] of Object.entries(
              staged.relationships,
            )) {
              merged.relationships[id] ??= dictionary();
              for (const [direction, snapshot] of Object.entries(directions)) {
                const previous = merged.relationships[id][direction];
                if (!previous || snapshot.fetchedAt >= previous.fetchedAt)
                  merged.relationships[id][direction] = snapshot;
              }
            }
            for (const [id, user] of Object.entries(staged.users)) {
              if (
                !merged.users[id] ||
                user.fetchedAt >= merged.users[id].fetchedAt
              )
                merged.users[id] = user;
            }
            store.put(merged, "snapshots");
          },
          signal,
        );
      },
    };
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
      const cache = relationshipCache(window, home);
      mountView(
        window,
        item.querySelector("a"),
        async (mode, options) => {
          const outcome = await scanRelationships(window, home, mode, options);
          if (outcome.complete) {
            try {
              await cache.commit(outcome.staged, options.signal);
            } catch (error) {
              options.signal.throwIfAborted();
              outcome.saveWarning = `缓存保存失败：${cacheFailure(error)}；旧缓存保留`;
            }
          }
          return outcome;
        },
        (mode) =>
          cache.lookup(mode).catch((error) => {
            throw new Error(cacheFailure(error));
          }),
      );
    };
    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", attach, { once: true });
    else attach();
  }

  initialize(window);
})();
