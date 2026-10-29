// ==UserScript==
// @name         Bangumi 二度好友发现
// @namespace    https://github.com/imagebuilder1837/bangumi-second-degree-friends
// @version      0.1.1
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

// Generated from src/main.mjs and its imports, including vendor modules. Do not edit; run npm run build.
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
    const match = /^\/user\/([^/]+)\/?$/.exec(new URL(base).pathname);
    if (!match) throw new Error("无法识别主页用户");
    const id = decodeURIComponent(match[1]);
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
    const title = document.querySelector(
      "#headerProfile h1.nameSingle .inner > .name",
    );
    const name =
      [...(title?.childNodes ?? [])]
        .filter(
          (node) =>
            node.nodeType === 3 ||
            (node.nodeName === "A" &&
              node.hasAttribute("href") &&
              /^\/user\/[^/]+\/?$/.test(
                new URL(node.getAttribute("href"), base).pathname,
              )),
        )
        .map((node) => node.textContent)
        .join("")
        .trim() || id;
    const background = document.querySelector("#headerProfile .avatarNeue")
      ?.style.backgroundImage;
    const image =
      background && /^url\(["']?(.*?)["']?\)$/.exec(background)?.[1];
    const avatar = image ? new URL(image, base).href : "";
    return {
      id,
      name,
      avatar,
      friendsUrl: friendsUrl.href,
      reverseUrl: reverseUrl?.href,
    };
  }

  class UnavailableRelationshipError extends Error {}

  function readRelationships(window, html, owner, base) {
    const document = new window.DOMParser().parseFromString(html, "text/html");
    const notice = document.querySelector("#colunmNotice");
    if (
      !document.querySelector("#headerProfile, #memberUserList") &&
      notice?.querySelector("h2")?.textContent.trim() === "呜咕，出错了" &&
      notice.querySelector("p.text")?.textContent.trim() ===
        "啊噢，你访问的页面似乎被 Bangumi 娘吃掉了。" &&
      notice.querySelector('img[src="/img/bangumi/404.png"]')
    )
      throw new UnavailableRelationshipError("原站关系列表不可访问");
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
    let missingIdentifiers = 0;
    for (const item of list.children) {
      if (!item.matches("li.user")) throw new Error("无效的好友条目");
      // Query links locally to avoid the costly compound selector on large lists.
      const anchor = [...item.querySelectorAll("a.avatar[href]")].find(
        (link) =>
          link.parentElement.matches("strong") &&
          link.parentElement.parentElement?.matches(".userContainer"),
      );
      if (!anchor) throw new Error("无效的好友条目");
      const background = anchor.querySelector(".userImage > .avatarNeue")?.style
        .backgroundImage;
      const image =
        background && /^url\(["']?(.*?)["']?\)$/.exec(background)?.[1];
      if (!image) throw new Error("无效的好友条目");
      const avatar = new URL(image, base).href;
      const url = new URL(anchor.getAttribute("href"), base);
      if (
        url.origin === new URL(base).origin &&
        url.pathname === "/user/" &&
        !url.search &&
        !url.hash
      ) {
        missingIdentifiers++;
        continue;
      }
      const match = /^\/user\/([^/]+)$/.exec(url.pathname);
      if (url.origin !== new URL(base).origin || !match)
        throw new Error("无效的好友条目");
      const id = decodeURIComponent(match[1]);
      members.set(id, { id, name: anchor.textContent.trim(), avatar });
    }
    return { members, missingIdentifiers };
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
                response.status === 408 ? "关系请求超时" : "服务器暂时不可用",
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

  // Both live scans and cached observations expose the same user-facing notices.
  function skippedRelationship(user, direction, missingIdentifiers = 0) {
    return {
      id: user.id,
      name: user.name,
      avatar: user.avatar,
      direction,
      reason: missingIdentifiers
        ? `跳过 ${missingIdentifiers} 条缺失用户标识的关系`
        : "已注销用户的关系列表不可访问",
      ...(missingIdentifiers ? { missingIdentifiers } : {}),
    };
  }

  function addContributions(candidates, members, intermediary, excluded) {
    for (const user of members) {
      if (excluded.has(user.id)) continue;
      const previous = candidates.get(user.id) ?? {
        ...user,
        count: 0,
        contributors: [],
      };
      candidates.set(user.id, {
        ...previous,
        count: previous.count + 1,
        contributors: [...previous.contributors, intermediary],
      });
    }
    return candidates;
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
    { update, signal, rateLimited, observe = () => {} },
  ) {
    const [first, second] = mode.split("/");
    const homeUrl = (direction) => {
      const url = direction === "friends" ? home.friendsUrl : home.reverseUrl;
      if (!url) throw new Error("缺少主页关系列表链接");
      return url;
    };
    const skipped = [];
    const failures = [];
    const read = async (user, url) => {
      const { id } = user;
      const text = await requestText(window, url, signal, rateLimited);
      signal.throwIfAborted();
      const { members, missingIdentifiers } = readRelationships(
        window,
        text,
        id,
        url,
      );
      const direction = new URL(url).pathname.split("/").at(-1);
      const snapshot = {
        members: [...members.keys()],
        fetchedAt: window.Date.now(),
        ...(missingIdentifiers ? { missingIdentifiers } : {}),
      };
      if (missingIdentifiers)
        skipped.push(skippedRelationship(user, direction, missingIdentifiers));
      const users = Object.create(null);
      users[id] = {
        name: user.name,
        avatar: user.avatar,
        fetchedAt: window.Date.now(),
      };
      for (const user of members.values()) {
        users[user.id] = {
          name: user.name,
          avatar: user.avatar,
          fetchedAt: window.Date.now(),
        };
      }
      observe({
        relationships: {
          [id]: { [direction]: snapshot },
        },
        users,
      });
      return { members, missingIdentifiers };
    };
    const readHome = async (direction) => {
      try {
        const { members } = await read(home, homeUrl(direction));
        update([], "", undefined, skipped, failures);
        return members;
      } catch (error) {
        signal.throwIfAborted();
        failures.push({ ...home, direction, reason: error.message });
        update([], "", undefined, skipped, failures);
        throw error;
      }
    };
    const firstMembers = await readHome(first);
    const excluded = first === second ? firstMembers : await readHome(second);
    const excludedIds = new Set([home.id, ...excluded.keys()]);
    let candidates = new Map();
    const intermediates = [...firstMembers.values()];
    let next = 0;
    let succeeded = 0;
    let failed = 0;
    let skippedIntermediates = 0;
    const publish = () => {
      signal.throwIfAborted();
      const results = rankCandidates(candidates);
      const counts = {
        processed: succeeded + failed + skippedIntermediates,
        total: intermediates.length,
        succeeded,
        failed,
        skipped: skippedIntermediates,
      };
      const progress = `${counts.processed}/${counts.total}，成功 ${succeeded}，失败 ${failed}${skippedIntermediates ? `，跳过 ${skippedIntermediates}` : ""}`;
      update(results, progress, counts, skipped, failures);
      return {
        results,
        progress,
        counts,
        skipped,
        failures,
        complete: failed === 0,
      };
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
          const { members, missingIdentifiers } = await read(intermediary, url);
          candidates = addContributions(
            candidates,
            members.values(),
            intermediary,
            excludedIds,
          );
          if (missingIdentifiers) skippedIntermediates++;
          else succeeded++;
        } catch (error) {
          signal.throwIfAborted();
          if (
            intermediary.name === "[已注销]" &&
            error instanceof UnavailableRelationshipError
          ) {
            skipped.push(skippedRelationship(intermediary, second));
            skippedIntermediates++;
            observe({
              relationships: {
                [intermediary.id]: {
                  [second]: { skipped: true, fetchedAt: window.Date.now() },
                },
              },
              users: {},
            });
          } else {
            failed++;
            failures.push({
              ...intermediary,
              direction: second,
              reason: error.message,
            });
          }
        }
        publish();
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(4, intermediates.length) }, worker),
    );
    return publish();
  }

  function mountView(
    window,
    entry,
    scan,
    cached = async () => undefined,
    homeName = "主页用户",
  ) {
    const { document } = window;
    const dialog = document.createElement("section");
    dialog.id = "second-degree-friends-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-label", "二度好友发现");
    dialog.setAttribute("aria-modal", "true");
    dialog.hidden = true;
    dialog.innerHTML =
      '<div class="sdf-panel"><header class="sdf-header"><div class="sdf-controls"><button type="button" class="sdf-start">开始寻找</button><select aria-label="发现模式"><option value="friends/friends">好友的好友</option><option value="friends/rev_friends">好友的反向好友</option><option value="rev_friends/friends">反向好友的好友</option><option value="rev_friends/rev_friends">反向好友的反向好友</option></select><button type="button" class="sdf-close" aria-label="关闭" title="关闭">×</button></div><div class="sdf-status"><p role="status">尚未开始</p><progress aria-label="扫描进度" hidden></progress></div></header><div class="sdf-results" tabindex="0" role="region" aria-label="候选用户列表"><ol></ol></div></div>';
    let keyboardFocus = false;
    const setKeyboardFocus = (value) => {
      keyboardFocus = value;
      dialog.classList.toggle("sdf-keyboard-focus", value);
      entry.classList.toggle("sdf-keyboard-focus", value);
    };
    document.addEventListener(
      "keydown",
      (event) => {
        if (
          !event.ctrlKey &&
          !event.metaKey &&
          !["Shift", "Control", "Alt", "Meta"].includes(event.key)
        )
          setKeyboardFocus(true);
      },
      true,
    );
    for (const type of ["pointerdown", "pointermove"])
      document.addEventListener(
        type,
        () => {
          if (keyboardFocus) setKeyboardFocus(false);
        },
        true,
      );
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
      ].filter(
        (node) =>
          !node.disabled &&
          !node.closest("[hidden]") &&
          (!node.closest("details:not([open])") || node.matches("summary")),
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
    #second-degree-friends-dialog { --sdf-bg: #fff; --sdf-text: #333; --sdf-muted: #777; --sdf-border: #e4e4e4; --sdf-soft: #fafafa; --sdf-hover: #00000008; --sdf-accent: #f09199; --sdf-accent-text: #8d3544; position: fixed; inset: 0; z-index: 10000; box-sizing: border-box; background: #0006; padding: 20px; color: var(--sdf-text); font: 13px/1.6 "SF Pro SC", "SF Pro Display", "PingFang SC", "Lucida Grande", "Helvetica Neue", Helvetica, Arial, sans-serif; }
    #second-degree-friends-dialog [hidden] { display: none !important; }
    #second-degree-friends-dialog:not([hidden]) { display: grid; place-items: center; }
    #second-degree-friends-dialog .sdf-panel { box-sizing: border-box; display: flex; flex-direction: column; width: min(780px, 100%); height: min(820px, 85dvh); min-height: 0; overflow: hidden; background: var(--sdf-bg); border: 1px solid var(--sdf-border); border-radius: 10px; box-shadow: 0 8px 40px #0003; }
    #second-degree-friends-dialog .sdf-header { box-sizing: border-box; flex: none; display: flex; flex-direction: column; min-height: 0; max-height: calc(100% - 120px); padding: 20px 22px 16px; border-bottom: 1px solid var(--sdf-border); }
    #second-degree-friends-dialog .sdf-controls { flex: none; display: flex; align-items: center; gap: 10px; }
    #second-degree-friends-dialog button, #second-degree-friends-dialog select { box-sizing: border-box; max-width: 100%; border: 1px solid var(--sdf-border); border-radius: 16px; padding: 4px 12px; background: var(--sdf-soft); color: inherit; font: inherit; line-height: 20px; }
    #second-degree-friends-dialog button { cursor: pointer; }
    #second-degree-friends-dialog .sdf-start { flex-shrink: 0; border-color: var(--sdf-accent); background: var(--sdf-accent); color: #fff; font-weight: 600; }
    #second-degree-friends-dialog select { min-width: 0; max-width: calc(100% - 140px); cursor: pointer; }
    #second-degree-friends-dialog button:disabled, #second-degree-friends-dialog select:disabled { opacity: .55; cursor: default; }
    #second-degree-friends-entry a:focus, #second-degree-friends-dialog :focus { outline: none; }
    #second-degree-friends-entry a.sdf-keyboard-focus:focus, #second-degree-friends-dialog.sdf-keyboard-focus :focus { outline: 2px solid var(--sdf-accent, #f09199); outline-offset: 2px; }
    html[data-theme="dark"] #second-degree-friends-entry { --sdf-accent: #cf7885; }
    #second-degree-friends-dialog .sdf-close { flex-shrink: 0; margin-left: auto; width: 30px; height: 30px; padding: 0; border-color: transparent; background: transparent; color: var(--sdf-muted); font-size: 24px; font-weight: 300; }
    #second-degree-friends-dialog .sdf-status { display: flex; flex-direction: column; min-height: 0; margin-top: 16px; color: var(--sdf-muted); font-size: 12px; }
    #second-degree-friends-dialog .sdf-status > p, #second-degree-friends-dialog progress { flex: none; }
    #second-degree-friends-dialog .sdf-disclosures { min-height: 0; overflow: auto; overscroll-behavior: contain; }
    #second-degree-friends-dialog [role="status"] { margin: 0; text-align: center; overflow-wrap: anywhere; }
    #second-degree-friends-dialog [data-warning="true"] { color: var(--sdf-accent-text); }
    #second-degree-friends-dialog progress { display: block; appearance: none; width: 100%; height: 5px; margin-top: 10px; border: 0; border-radius: 5px; overflow: hidden; background: var(--sdf-border); accent-color: var(--sdf-accent); }
    #second-degree-friends-dialog progress::-webkit-progress-bar { background: var(--sdf-border); }
    #second-degree-friends-dialog progress::-webkit-progress-value { background: var(--sdf-accent); border-radius: 5px; }
    #second-degree-friends-dialog progress::-moz-progress-bar { background: var(--sdf-accent); }
    #second-degree-friends-dialog progress:not([value]) { background: linear-gradient(90deg, var(--sdf-border), var(--sdf-accent), var(--sdf-border)); }
    #second-degree-friends-dialog details { margin-top: 8px; text-align: center; }
    #second-degree-friends-dialog summary { display: inline-flex; align-items: center; gap: 6px; padding: 2px 4px; border-radius: 3px; list-style: none; cursor: pointer; }
    #second-degree-friends-dialog summary::-webkit-details-marker { display: none; }
    #second-degree-friends-dialog summary::before { content: ""; width: 5px; height: 5px; border: solid currentColor; border-width: 0 1px 1px 0; transform: rotate(-45deg); transition: transform .15s ease; }
    #second-degree-friends-dialog details[open] > summary::before { transform: rotate(45deg); }
    #second-degree-friends-dialog summary:hover, #second-degree-friends-dialog .sdf-more:hover, #second-degree-friends-dialog .sdf-toggle:hover { color: var(--sdf-text); background: var(--sdf-hover); }
    #second-degree-friends-dialog details p { margin: 4px 0 0; overflow-wrap: anywhere; }
    #second-degree-friends-dialog .sdf-detail-body { box-sizing: border-box; max-height: min(140px, 22dvh); margin-top: 6px; padding: 8px 12px; overflow: auto; overscroll-behavior: contain; text-align: left; background: var(--sdf-soft); border: 1px solid var(--sdf-border); border-radius: 5px; }
    #second-degree-friends-dialog .sdf-detail-body > p { margin: 0 0 6px; }
    #second-degree-friends-dialog .sdf-detail-group + .sdf-detail-group { margin-top: 10px; }
    #second-degree-friends-dialog .sdf-detail-group h3 { margin: 0 0 4px; color: var(--sdf-text); font-size: 12px; font-weight: 600; }
    #second-degree-friends-dialog .sdf-detail-group[data-kind="failures"] h3 { color: var(--sdf-accent-text); }
    #second-degree-friends-dialog .sdf-detail-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: center; gap: 6px 20px; padding: 5px 0; }
    #second-degree-friends-dialog .sdf-detail-row + .sdf-detail-row { border-top: 1px dotted var(--sdf-border); }
    #second-degree-friends-dialog .sdf-detail-user { display: flex; align-items: center; gap: 6px; min-width: 0; overflow-wrap: anywhere; }
    #second-degree-friends-dialog .sdf-detail-user a { min-width: 0; }
    #second-degree-friends-dialog .sdf-detail-user a:first-child { flex: none; }
    #second-degree-friends-dialog .sdf-detail-user img { width: 24px; height: 24px; background: var(--sdf-border); border-radius: 3px; }
    #second-degree-friends-dialog .sdf-detail-direction { flex: none; font-size: 11px; }
    #second-degree-friends-dialog .sdf-detail-reason { min-width: 0; text-align: right; overflow-wrap: anywhere; font-size: 11px; }
    @media (max-width: 640px) {
      #second-degree-friends-dialog .sdf-detail-row { grid-template-columns: minmax(0, 1fr); }
    }
    #second-degree-friends-dialog .sdf-results { min-height: 0; overflow: auto; overscroll-behavior: contain; overflow-anchor: none; scrollbar-gutter: stable; padding: 16px 16px 28px 22px; }
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
    #second-degree-friends-dialog .sdf-contributors { margin: 0 12px 12px 54px; padding-top: 12px; border-top: 1px solid var(--sdf-border); }
    #second-degree-friends-dialog .sdf-avatars { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    #second-degree-friends-dialog .sdf-contributors a { display: inline-flex; }
    #second-degree-friends-dialog .sdf-more { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 36px; padding: 6px 10px; border: 0; border-radius: 4px; background: transparent; color: var(--sdf-muted); font-size: 12px; }
    #second-degree-friends-dialog .sdf-more::after { content: ""; width: 5px; height: 5px; margin-top: -3px; border: solid currentColor; border-width: 0 1px 1px 0; transform: rotate(45deg); }
    #second-degree-friends-dialog .sdf-more-ranks { width: 100%; }
    #second-degree-friends-dialog .sdf-more-contributors { display: flex; justify-content: flex-end; margin-top: 4px; }
    #second-degree-friends-dialog [data-medal="gold"] { background: #fff7df; border-color: #ecdbab; }
    #second-degree-friends-dialog [data-medal="silver"] { background: #f1f3f6; border-color: #d9dfe7; }
    #second-degree-friends-dialog [data-medal="bronze"] { background: #f9eee5; border-color: #e7d3c1; }
    #second-degree-friends-dialog [data-medal="gold"] .sdf-rank { color: #a17c28; }
    #second-degree-friends-dialog [data-medal="silver"] .sdf-rank { color: #738198; }
    #second-degree-friends-dialog [data-medal="bronze"] .sdf-rank { color: #a17551; }
    html[data-theme="dark"] #second-degree-friends-dialog { --sdf-bg: #252525; --sdf-text: #d8d8d8; --sdf-muted: #aaa; --sdf-border: #444; --sdf-soft: #303030; --sdf-hover: #ffffff0d; --sdf-accent: #cf7885; --sdf-accent-text: #f0a5af; color-scheme: dark; }
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
      #second-degree-friends-dialog .sdf-results { padding: 12px 8px 28px 14px; }
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
    const details = document.createElement("details");
    details.hidden = true;
    details.innerHTML =
      '<summary>详情</summary><div class="sdf-detail-body"></div>';
    const disclosures = document.createElement("div");
    disclosures.className = "sdf-disclosures";
    disclosures.append(details);
    dialog.querySelector(".sdf-status").append(disclosures);
    const detailGroups = ["failures", "skipped"].map((kind) => {
      const section = document.createElement("section");
      section.className = "sdf-detail-group";
      section.dataset.kind = kind;
      section.hidden = true;
      section.append(document.createElement("h3"));
      details.querySelector(".sdf-detail-body").append(section);
      return { section, rows: new Map() };
    });
    const skipSummary = (skipped = []) =>
      skipped.length ? `，跳过 ${skipped.length} 项关系读取异常` : "";
    const showDetails = (skipped = [], failures = []) => {
      details.hidden = skipped.length + failures.length === 0;
      for (const [index, records] of [failures, skipped].entries()) {
        const { section, rows } = detailGroups[index];
        section.hidden = records.length === 0;
        section.querySelector("h3").textContent =
          `${index === 0 ? "读取失败" : "已跳过"} · ${records.length}`;
        const active = new Set();
        for (const record of records) {
          const key = `${record.id}/${record.direction}`;
          active.add(key);
          if (rows.has(key)) continue;
          const item = document.createElement("div");
          item.className = "sdf-detail-row";
          const user = document.createElement("div");
          user.className = "sdf-detail-user";
          const avatarLink = userLink(record);
          const avatar = avatarLink.querySelector("img");
          avatar.width = avatar.height = 24;
          if (!record.avatar) avatar.removeAttribute("src");
          const name = document.createElement("a");
          name.href = avatarLink.href;
          name.className = "l";
          name.target = "_blank";
          name.rel = "noopener noreferrer";
          name.textContent = record.name ?? record.id;
          name.title = record.id;
          const relation = document.createElement("span");
          relation.className = "sdf-detail-direction";
          relation.textContent = ` · ${record.direction === "friends" ? "好友" : "反向好友"}`;
          user.append(avatarLink, name, relation);
          const reason = document.createElement("span");
          reason.className = "sdf-detail-reason";
          reason.textContent = record.reason;
          item.append(user, reason);
          rows.set(key, item);
          section.append(item);
        }
        for (const [key, row] of rows) {
          if (active.has(key)) continue;
          row.remove();
          rows.delete(key);
        }
      }
    };
    const resultsRegion = dialog.querySelector(".sdf-results");
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
    let hydrate;
    let presentation = 0;
    let paginationStatus;
    let latestPresentation;
    const visibleContributors = new Map();
    const moreRanks = document.createElement("button");
    moreRanks.type = "button";
    moreRanks.textContent = "显示更多";
    moreRanks.className = "sdf-more sdf-more-ranks";
    moreRanks.setAttribute("aria-label", "显示更多候选用户");
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
    const render = (results, complete = false, { from = 0, focusKey } = {}) => {
      const scrollTop = resultsRegion.scrollTop;
      const focusedKey = focusKey ?? document.activeElement?.dataset.focusKey;
      const focusedUser = document.activeElement?.closest("li")?.dataset.userId;
      const list = dialog.querySelector("ol");
      if (from === 0) list.replaceChildren();
      moreRanks.remove();
      for (const [offset, user] of results
        .slice(from, visibleRanks)
        .entries()) {
        const index = from + offset;
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
          const avatars = document.createElement("div");
          avatars.className = "sdf-avatars";
          contributors.append(avatars);
          let visible = visibleContributors.get(user.id) ?? 40;
          const appendAvatars = (from) => {
            for (const contributor of user.contributors.slice(from, visible)) {
              const link = userLink(contributor);
              link.dataset.focusKey = `contributor:${user.id}:${contributor.id}`;
              avatars.append(link);
            }
          };
          appendAvatars(0);
          if (user.contributors.length > visible) {
            const footer = document.createElement("div");
            footer.className = "sdf-more-contributors";
            const more = document.createElement("button");
            more.type = "button";
            more.className = "sdf-more";
            more.textContent = "显示更多";
            more.setAttribute("aria-label", "显示更多头像");
            more.dataset.focusKey = `more-contributors:${user.id}`;
            more.addEventListener("click", () => {
              const scrollTop = resultsRegion.scrollTop;
              const focused = document.activeElement === more;
              const from = visible;
              visible += 40;
              visibleContributors.set(user.id, visible);
              appendAvatars(from);
              if (focused)
                avatars.children[from]?.focus({ preventScroll: true });
              if (visible >= user.contributors.length) footer.remove();
              resultsRegion.scrollTop = scrollTop;
            });
            footer.append(more);
            contributors.append(footer);
          }
          row.append(contributors);
        }
        list.append(row);
      }
      if (results.length > visibleRanks) {
        list.after(moreRanks);
        moreRanks.onclick = () => {
          const from = visibleRanks;
          const focused = document.activeElement === moreRanks;
          const request = presentation;
          const append = () => {
            visibleRanks += 50;
            if (dialog.hidden) {
              pendingPresentation = latestPresentation;
              return;
            }
            render(results, complete, {
              from,
              focusKey:
                focused && document.activeElement === moreRanks
                  ? `candidate:${results[from].id}`
                  : undefined,
            });
          };
          if (!hydrate) {
            append();
            return;
          }
          paginationStatus ??= [
            status.textContent,
            status.dataset.warning === "true",
          ];
          const [previousStatus, previousWarning] = paginationStatus;
          moreRanks.disabled = true;
          hydrate(results.slice(from, from + 50))
            .then(
              () => {
                if (request !== presentation) return;
                append();
                setStatus(previousStatus, previousWarning);
                paginationStatus = undefined;
              },
              (error) => {
                if (request !== presentation) return;
                setStatus(
                  `资料读取失败：${error.message}；点击显示更多重试`,
                  true,
                );
              },
            )
            .finally(() => {
              if (request === presentation) moreRanks.disabled = false;
            });
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
        )?.focus({ preventScroll: true });
      }
      // A full live-result rebuild can reset the scroller even with preventScroll.
      resultsRegion.scrollTop = scrollTop;
    };
    let pendingPresentation;
    const paintResults = () => {
      if (dialog.hidden || !pendingPresentation) return;
      const { results, complete, skipped, failures } = pendingPresentation;
      pendingPresentation = undefined;
      render(results, complete);
      showDetails(skipped, failures);
    };
    const presentResults = (results, complete = false, skipped, failures) => {
      latestPresentation = { results, complete, skipped, failures };
      pendingPresentation = latestPresentation;
      paintResults();
    };
    const resetResults = () => {
      presentation++;
      hydrate = undefined;
      paginationStatus = undefined;
      moreRanks.disabled = false;
      details.open = false;
      expanded.clear();
      visibleContributors.clear();
      visibleRanks = 50;
      presentResults([]);
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
      setStatus("正在读取缓存");
      let outcome;
      try {
        outcome = await cached(mode.value);
      } catch (error) {
        if (request === cacheRequest) {
          if (window.Date.now() >= cooldownUntil)
            setStatus(`缓存读取失败：${error.message}；可主动开始寻找`, true);
        }
        return;
      }
      if (request !== cacheRequest) return;
      hydrate = outcome?.hydrate;
      presentResults(
        outcome?.results ?? [],
        Boolean(outcome),
        outcome?.skipped,
      );
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
      setProgress();
      resetResults();
      try {
        const outcome = await scan(current.mode, {
          signal: current.controller.signal,
          saveFailed: (warning) => {
            current.saveWarning = warning;
            if (task === current && !current.controller.signal.aborted)
              setStatus(
                `${current.progress ? `扫描进度：${current.progress}；` : ""}${warning}`,
                true,
              );
          },
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
          update: (results, progress, counts, skipped, failures) => {
            if (task !== current || current.controller.signal.aborted) return;
            current.progress = progress;
            presentResults(results, false, skipped, failures);
            setProgress(counts);
            if (counts)
              setStatus(
                `扫描进度：${progress}${current.saveWarning ? `；${current.saveWarning}` : ""}`,
                counts.failed > 0 || Boolean(current.saveWarning),
              );
          },
        });
        presentResults(
          outcome.results,
          outcome.complete,
          outcome.skipped,
          outcome.failures,
        );
        setProgress(outcome.counts);
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
        if (current.saveWarning) message += `；${current.saveWarning}`;
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
      paintResults();
      focusable()[0]?.focus();
    });
  }

  class RelationshipStoreError extends Error {
    constructor(code, message, cause) {
      super(message, { cause });
      this.name = cause?.name || "RelationshipStoreError";
      this.code = code;
    }
  }

  const record = (value) =>
    Object.prototype.toString.call(value) === "[object Object]";
  const identifier = (value) => typeof value === "string" && value.length > 0;
  const direction = (value) => ["friends", "rev_friends"].includes(value);
  const timestamp = (value) =>
    Number.isFinite(value) && value >= 0 && value <= 8640000000000000;
  const fields = (value, allowed) =>
    record(value) && Object.keys(value).every((key) => allowed.includes(key));
  const missingIssue = (issue) =>
    fields(issue, ["code", "count"]) &&
    issue.code === "missing-identifiers" &&
    Number.isSafeInteger(issue.count) &&
    issue.count > 0;
  const unavailableIssue = (issue) =>
    fields(issue, ["code"]) &&
    issue.code === "deleted-display-name-page-unavailable";

  function arrayOf(value, accepts) {
    if (!Array.isArray(value)) return false;
    // Iteration visits empty slots as undefined; Array#every skips them.
    for (const item of value) if (!accepts(item)) return false;
    return true;
  }

  function snapshot(value) {
    if (
      !fields(value, ["status", "members", "fetchedAt", "issue"]) ||
      !timestamp(value.fetchedAt)
    )
      return false;
    if (value.status === "available")
      return (
        arrayOf(value.members, identifier) &&
        (value.issue === undefined || missingIssue(value.issue))
      );
    return (
      value.status === "unavailable" &&
      value.members === undefined &&
      unavailableIssue(value.issue)
    );
  }

  function avatar(value) {
    if (value === "") return true;
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol);
    } catch {
      return false;
    }
  }

  function user(value) {
    return (
      fields(value, ["name", "avatar", "fetchedAt"]) &&
      typeof value.name === "string" &&
      typeof value.avatar === "string" &&
      avatar(value.avatar) &&
      timestamp(value.fetchedAt)
    );
  }

  function storedValue(entry, name) {
    if (!record(entry) || !Number.isSafeInteger(entry.version))
      throw new RelationshipStoreError(
        "corrupt-data",
        "Damaged relationship store record",
      );
    if (entry.version !== 1)
      throw new RelationshipStoreError(
        "incompatible-version",
        "Unsupported relationship record version",
      );
    if (
      !fields(entry, ["version", "value"]) ||
      !(name === "relationships" ? snapshot(entry.value) : user(entry.value))
    )
      throw new RelationshipStoreError(
        "corrupt-data",
        "Damaged relationship store record",
      );
    return entry.value;
  }

  function requireInput(condition) {
    if (!condition)
      throw new RelationshipStoreError(
        "invalid-input",
        "Invalid relationship store input",
      );
  }

  function queryEntries(query) {
    requireInput(fields(query, ["relationships", "users"]));
    const { relationships = [], users = [] } = query;
    requireInput(
      arrayOf(
        relationships,
        (key) =>
          Array.isArray(key) &&
          key.length === 2 &&
          identifier(key[0]) &&
          direction(key[1]),
      ) && arrayOf(users, identifier),
    );
    return [
      ...relationships.map(([id, kind]) => ({
        name: "relationships",
        key: [id, kind],
      })),
      ...users.map((id) => ({ name: "users", key: id })),
    ];
  }

  function batchEntries(batch) {
    requireInput(fields(batch, ["relationships", "users"]));
    const { relationships = {}, users = {} } = batch;
    requireInput(record(relationships) && record(users));
    const entries = [];
    for (const [id, directions] of Object.entries(relationships)) {
      requireInput(identifier(id) && record(directions));
      for (const [kind, value] of Object.entries(directions)) {
        requireInput(direction(kind) && snapshot(value));
        entries.push({
          name: "relationships",
          key: [id, kind],
          value: {
            ...value,
            ...(value.members ? { members: [...new Set(value.members)] } : {}),
            ...(value.issue ? { issue: { ...value.issue } } : {}),
          },
        });
      }
    }
    for (const [id, value] of Object.entries(users)) {
      requireInput(identifier(id) && user(value));
      entries.push({ name: "users", key: id, value: { ...value } });
    }
    return entries;
  }

  const databaseName = "bangumi-relationship-store";
  const stores = ["relationships", "users"];
  const dictionary = () => Object.create(null);

  function storageError(error) {
    if (error instanceof RelationshipStoreError) return error;
    const code =
      error?.name === "VersionError"
        ? "incompatible-version"
        : error?.name === "QuotaExceededError"
          ? "quota-exceeded"
          : ["SecurityError", "InvalidStateError", "NotAllowedError"].includes(
                error?.name,
              )
            ? "unavailable"
            : "storage-error";
    return new RelationshipStoreError(
      code,
      error?.message || "Relationship storage failed",
      error,
    );
  }

  // A get() result of undefined can mean either no key or an invalid stored
  // value. Resolve that ambiguity in the same transaction before validating.
  function readRecord(store, key, accept, fail) {
    const request = store.get(key);
    request.onsuccess = () => {
      const finish = (exists) => {
        try {
          accept(exists ? storedValue(request.result, store.name) : undefined);
        } catch (error) {
          fail(error);
        }
      };
      if (request.result !== undefined) finish(true);
      else {
        const existence = store.getKey(key);
        existence.onsuccess = () => finish(existence.result !== undefined);
      }
    };
  }

  function transact(indexedDB, mode, operation, signal) {
    signal?.throwIfAborted();
    return new Promise((resolve, reject) => {
      let opening;
      let abandoned = false;
      const openingAbort = () => {
        abandoned = true;
        signal?.removeEventListener("abort", openingAbort);
        reject(signal.reason);
      };
      const rejectOpening = (error) => {
        abandoned = true;
        signal?.removeEventListener("abort", openingAbort);
        reject(storageError(error));
      };
      try {
        if (typeof indexedDB?.open !== "function")
          throw new RelationshipStoreError(
            "unavailable",
            "IndexedDB is unavailable",
          );
        opening = indexedDB.open(databaseName, 1);
      } catch (error) {
        rejectOpening(error);
        return;
      }
      signal?.addEventListener("abort", openingAbort, { once: true });
      opening.onupgradeneeded = (event) => {
        if (abandoned || signal?.aborted || event.oldVersion !== 0) {
          opening.transaction.abort();
          return;
        }
        for (const name of stores) opening.result.createObjectStore(name);
      };
      opening.onblocked = () =>
        rejectOpening(
          new RelationshipStoreError(
            "blocked",
            "Database upgrade is blocked by another connection",
          ),
        );
      opening.onerror = () => rejectOpening(opening.error);
      opening.onsuccess = () => {
        signal?.removeEventListener("abort", openingAbort);
        const database = opening.result;
        database.onversionchange = () => database.close();
        if (abandoned || signal?.aborted) {
          database.close();
          if (signal?.aborted) reject(signal.reason);
          return;
        }
        let transaction;
        try {
          if (stores.some((name) => !database.objectStoreNames.contains(name)))
            throw new RelationshipStoreError(
              "corrupt-data",
              "Missing relationship object store",
            );
          transaction = database.transaction(stores, mode);
        } catch (error) {
          database.close();
          reject(storageError(error));
          return;
        }
        let result;
        let failure;
        let aborting = false;
        const fail = (error) => {
          if (aborting) return;
          aborting = true;
          failure = error;
          transaction.abort();
        };
        const abort = () => fail(signal.reason);
        const close = () => {
          signal?.removeEventListener("abort", abort);
          database.close();
        };
        transaction.oncomplete = () => {
          close();
          resolve(result);
        };
        transaction.onabort = () => {
          close();
          reject(
            signal?.aborted
              ? signal.reason
              : storageError(failure ?? transaction.error),
          );
        };
        signal?.addEventListener("abort", abort, { once: true });
        try {
          signal?.throwIfAborted();
          for (const name of stores) {
            const store = transaction.objectStore(name);
            if (
              store.keyPath !== null ||
              store.autoIncrement ||
              store.indexNames.length
            )
              throw new RelationshipStoreError(
                "corrupt-data",
                "Unexpected relationship object store layout",
              );
          }
          result = operation(transaction, fail);
        } catch (error) {
          fail(error);
        }
      };
    });
  }

  /**
   * @typedef {"friends" | "rev_friends"} Direction
   * @typedef {{code: "missing-identifiers", count: number}} MissingIdentifiers
   * @typedef {{status: "available", members: string[], fetchedAt: number, issue?: MissingIdentifiers} |
   *   {status: "unavailable", fetchedAt: number, issue: {code: "deleted-display-name-page-unavailable"}}} Snapshot
   * @typedef {{name: string, avatar: string, fetchedAt: number}} User
   * @typedef {{relationships?: [string, Direction][], users?: string[]}} Query
   * @typedef {{relationships?: Record<string, Partial<Record<Direction, Snapshot>>>, users?: Record<string, User>}} Batch
   * @typedef {{relationships: Record<string, Partial<Record<Direction, Snapshot>>>, users: Record<string, User>}} ReadResult
   * @typedef {{signal?: AbortSignal}} Options
   */

  /**
   * Create a same-origin store. Each call opens and closes its own connection.
   * @param {{indexedDB?: IDBFactory}} dependencies
   */
  function createRelationshipStore({ indexedDB }) {
    return {
      /**
       * Read only requested keys in one transaction; absent keys are omitted.
       * @param {Query} query
       * @param {Options} [options]
       * @returns {Promise<ReadResult>}
       */
      async read(query, { signal } = {}) {
        const entries = queryEntries(query);
        return transact(
          indexedDB,
          "readonly",
          (transaction, fail) => {
            const result = { relationships: dictionary(), users: dictionary() };
            for (const { name, key } of entries) {
              readRecord(
                transaction.objectStore(name),
                key,
                (value) => {
                  if (value === undefined) return;
                  if (name === "relationships") {
                    const [id, direction] = key;
                    result.relationships[id] ??= dictionary();
                    result.relationships[id][direction] = value;
                  } else result.users[key] = value;
                },
                fail,
              );
            }
            return result;
          },
          signal,
        );
      },
      /**
       * Validate and detach input, then atomically replace the requested records.
       * Resolve only on transaction completion; reject with the signal reason
       * on cancellation, otherwise a RelationshipStoreError with a stable code.
       * @param {Batch} batch
       * @param {Options} [options]
       * @returns {Promise<void>}
       */
      async commit(batch, { signal } = {}) {
        const entries = batchEntries(batch);
        return transact(
          indexedDB,
          "readwrite",
          (transaction) => {
            for (const { name, key, value } of entries) {
              signal?.throwIfAborted();
              transaction.objectStore(name).put({ version: 1, value }, key);
            }
          },
          signal,
        );
      },
    };
  }

  const unavailableMessage =
    "IndexedDB 不可用或访问被拒绝，请检查浏览器支持和站点存储权限后重试";

  function cacheFailure(error) {
    if (
      error?.code === "quota-exceeded" ||
      error?.name === "QuotaExceededError"
    )
      return "存储容量不足，请检查浏览器存储容量后重试";
    if (error?.code === "blocked")
      return "IndexedDB 升级被其他标签页阻塞，请关闭其他标签页后重试";
    if (error?.code === "incompatible-version")
      return "关系缓存版本不兼容，请更新组件后重试";
    if (error?.code === "corrupt-data") return "关系缓存数据损坏，原数据已保留";
    if (
      error?.code === "unavailable" ||
      ["SecurityError", "InvalidStateError", "NotAllowedError"].includes(
        error?.name,
      )
    )
      return unavailableMessage;
    return error?.message || unavailableMessage;
  }

  // Translate the component's accepted skips at the storage seam; the public
  // protocol records observations, not whether a two-hop scan may continue.
  function observation(snapshot) {
    if (snapshot.skipped)
      return {
        status: "unavailable",
        fetchedAt: snapshot.fetchedAt,
        issue: { code: "deleted-display-name-page-unavailable" },
      };
    return {
      status: "available",
      members: snapshot.members,
      fetchedAt: snapshot.fetchedAt,
      ...(snapshot.missingIdentifiers
        ? {
            issue: {
              code: "missing-identifiers",
              count: snapshot.missingIdentifiers,
            },
          }
        : {}),
    };
  }

  function componentSnapshot(snapshot) {
    return {
      ...(snapshot.status === "unavailable"
        ? { skipped: true }
        : { members: snapshot.members }),
      fetchedAt: snapshot.fetchedAt,
      ...(snapshot.issue?.code === "missing-identifiers"
        ? { missingIdentifiers: snapshot.issue.count }
        : {}),
    };
  }

  function relationshipCache(window, home) {
    // Resolve the browser dependency inside async operations: denied storage
    // must not prevent mounting the component or running a live scan.
    const store = () =>
      createRelationshipStore({ indexedDB: window.indexedDB });
    return {
      async lookup(mode) {
        const database = store();
        const [first, second] = mode.split("/");
        const root = await database.read({
          relationships: [...new Set([first, second])].map((direction) => [
            home.id,
            direction,
          ]),
        });
        const initial = root.relationships[home.id]?.[first];
        const excluded = root.relationships[home.id]?.[second];
        if (
          !initial ||
          !excluded ||
          initial.status === "unavailable" ||
          excluded.status === "unavailable"
        )
          return;
        const related = await database.read({
          relationships: initial.members.map((id) => [id, second]),
        });
        // Keep observations from each read separate: home may itself appear in
        // its first-hop list, and a concurrent writer may update it in between.
        const snapshots = [initial, excluded];
        for (const id of initial.members) {
          const snapshot = related.relationships[id]?.[second];
          if (!snapshot) return;
          snapshots.push(snapshot);
        }
        const profiles = await database.read({
          users: [...new Set([home.id, ...initial.members])],
        });
        const excludedIds = new Set([home.id, ...excluded.members]);
        const users = new Map();
        const user = (id) => {
          if (!users.has(id))
            users.set(id, { id, name: id, avatar: "", ...profiles.users[id] });
          return users.get(id);
        };
        function* members(snapshot) {
          for (const id of snapshot.members)
            if (!excludedIds.has(id)) yield user(id);
        }
        let candidates = new Map();
        const skipped = [];
        for (const direction of new Set([first, second])) {
          const snapshot = componentSnapshot(
            root.relationships[home.id][direction],
          );
          if (snapshot.missingIdentifiers)
            skipped.push(
              skippedRelationship(
                user(home.id),
                direction,
                snapshot.missingIdentifiers,
              ),
            );
        }
        for (const id of initial.members) {
          const snapshot = componentSnapshot(related.relationships[id][second]);
          if (snapshot.skipped) {
            skipped.push(skippedRelationship(user(id), second));
            continue;
          }
          if (snapshot.missingIdentifiers)
            skipped.push(
              skippedRelationship(
                user(id),
                second,
                snapshot.missingIdentifiers,
              ),
            );
          candidates = addContributions(
            candidates,
            members(snapshot),
            user(id),
            excludedIds,
          );
        }
        const results = rankCandidates(candidates);
        const loaded = new Set([home.id, ...initial.members]);
        const hydrate = async (page) => {
          const ids = [...new Set(page.map(({ id }) => id))].filter(
            (id) => !loaded.has(id),
          );
          if (!ids.length) return;
          const profiles = await database.read({ users: ids });
          // Apply only after the entire read succeeds; a failed page is retryable.
          for (const id of ids) {
            const profile = profiles.users[id];
            if (profile) Object.assign(user(id), profile);
            loaded.add(id);
          }
          for (const candidate of page) {
            const profile = users.get(candidate.id);
            if (profile)
              Object.assign(candidate, {
                name: profile.name,
                avatar: profile.avatar,
              });
          }
        };
        await hydrate(results.slice(0, 50));
        return {
          results,
          hydrate,
          complete: true,
          skipped,
          earliest: snapshots.reduce(
            (time, snapshot) => Math.min(time, snapshot.fetchedAt),
            Infinity,
          ),
          latest: snapshots.reduce(
            (time, snapshot) => Math.max(time, snapshot.fetchedAt),
            -Infinity,
          ),
        };
      },
      async commit(staged, signal) {
        const relationships = Object.create(null);
        for (const [id, directions] of Object.entries(staged.relationships)) {
          relationships[id] = Object.create(null);
          for (const [direction, snapshot] of Object.entries(directions))
            relationships[id][direction] = observation(snapshot);
        }
        await store().commit(
          { relationships, users: staged.users },
          { signal },
        );
      },
    };
  }

  // One queue belongs to one scan. Only successful commits advance deduplication;
  // comparing at dequeue time also preserves changes such as A -> B -> A.
  function observationSaver(cache, signal, report) {
    const savedUsers = new Map();
    const savedRelationships = new Map();
    let pending = Promise.resolve();
    let warning;
    let committed = 0;
    const content = ({ fetchedAt, ...value }) => JSON.stringify(value);
    return {
      enqueue(batch) {
        if (warning || signal.aborted) return;
        pending = pending.then(async () => {
          if (warning || signal.aborted) return;
          const users = Object.create(null);
          const relationships = Object.create(null);
          const userChanges = [];
          const relationshipChanges = [];
          for (const [id, value] of Object.entries(batch.users)) {
            const signature = content(value);
            if (savedUsers.get(id) === signature) continue;
            users[id] = value;
            userChanges.push([id, signature]);
          }
          for (const [id, directions] of Object.entries(batch.relationships)) {
            for (const [direction, value] of Object.entries(directions)) {
              const key = JSON.stringify([id, direction]);
              const signature = content(value);
              if (savedRelationships.get(key) === signature) continue;
              relationships[id] ??= Object.create(null);
              relationships[id][direction] = value;
              relationshipChanges.push([key, signature]);
            }
          }
          if (!userChanges.length && !relationshipChanges.length) return;
          try {
            await cache.commit({ relationships, users }, signal);
            for (const [key, value] of userChanges) savedUsers.set(key, value);
            for (const [key, value] of relationshipChanges)
              savedRelationships.set(key, value);
            committed++;
          } catch (error) {
            if (signal.aborted) return;
            warning = `缓存保存失败：${cacheFailure(error)}；${committed ? "部分观察已保存" : "尚无观察保存成功"}，已停止后续保存`;
            report(warning);
          }
        });
      },
      async finish() {
        await pending;
        return warning;
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
        '<span class="service" style="background-color:#d9a300;color:#fff">SecondDegreeFriends</span> <span class="tip"><a class="l" href="#">二度好友发现</a></span>';
      services.append(item);
      const cache = relationshipCache(window, home);
      mountView(
        window,
        item.querySelector("a"),
        async (mode, options) => {
          const saver = observationSaver(
            cache,
            options.signal,
            options.saveFailed,
          );
          try {
            const outcome = await scanRelationships(window, home, mode, {
              ...options,
              observe: (batch) => saver.enqueue(batch),
            });
            outcome.saveWarning = await saver.finish();
            options.signal.throwIfAborted();
            return outcome;
          } finally {
            await saver.finish();
          }
        },
        (mode) =>
          cache.lookup(mode).catch((error) => {
            throw new Error(cacheFailure(error));
          }),
        home.name,
      );
    };
    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", attach, { once: true });
    else attach();
  }

  initialize(window);
})();
