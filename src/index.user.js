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
    const candidates = new Map();
    const intermediates = [...firstMembers.values()];
    let next = 0;
    let succeeded = 0;
    let failed = 0;
    const publish = () => {
      signal.throwIfAborted();
      const results = [...candidates.values()].sort(
        (a, b) => b.count - a.count || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
      const progress = `${succeeded + failed}/${intermediates.length}，成功 ${succeeded}，失败 ${failed}`;
      update(results, progress);
      return { results, progress, complete: failed === 0 };
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
          for (const user of members.values()) {
            if (user.id === home.id || excluded.has(user.id)) continue;
            const candidate = candidates.get(user.id) ?? { ...user, count: 0 };
            candidate.count++;
            candidates.set(user.id, candidate);
          }
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

  function mountView(window, entry, scan, cached = () => undefined) {
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

  const key = "second-degree-friends:relationships";
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

  function read(window, required = false) {
    let text;
    try {
      text = window.localStorage.getItem(key);
    } catch (error) {
      if (required) throw error;
      return empty();
    }
    try {
      return validated(JSON.parse(text));
    } catch {
      return empty();
    }
  }

  function relationshipCache(window, home) {
    let data = read(window);
    return {
      lookup(mode) {
        const [first, second] = mode.split("/");
        const initial = data.relationships[home.id]?.[first];
        const excluded = data.relationships[home.id]?.[second];
        if (!initial || !excluded) return;
        const snapshots = [initial, excluded];
        const candidates = new Map();
        for (const id of initial.members) {
          const snapshot = data.relationships[id]?.[second];
          if (!snapshot) return;
          snapshots.push(snapshot);
          for (const member of snapshot.members) {
            if (member === home.id || excluded.members.includes(member))
              continue;
            const candidate = candidates.get(member) ?? {
              id: member,
              name: member,
              avatar: "",
              ...data.users[member],
              count: 0,
            };
            candidate.count++;
            candidates.set(member, candidate);
          }
        }
        return {
          results: [...candidates.values()].sort(
            (a, b) =>
              b.count - a.count || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
          ),
          complete: true,
          earliest: Math.min(
            ...snapshots.map((snapshot) => snapshot.fetchedAt),
          ),
          latest: Math.max(...snapshots.map((snapshot) => snapshot.fetchedAt)),
        };
      },
      async commit(staged, signal) {
        if (
          typeof window.localStorage?.getItem !== "function" ||
          typeof window.localStorage?.setItem !== "function" ||
          typeof window.navigator.locks?.request !== "function"
        )
          throw new Error("无法安全保存缓存");
        await window.navigator.locks.request(
          key,
          { mode: "exclusive", signal },
          () => {
            signal.throwIfAborted();
            const merged = read(window, true);
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
            window.localStorage.setItem(key, JSON.stringify(merged));
            data = merged;
          },
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
            } catch {
              options.signal.throwIfAborted();
              outcome.saveWarning = "缓存保存失败，旧缓存保留";
            }
          }
          return outcome;
        },
        (mode) => cache.lookup(mode),
      );
    };
    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", attach, { once: true });
    else attach();
  }

  initialize(window);
})();
