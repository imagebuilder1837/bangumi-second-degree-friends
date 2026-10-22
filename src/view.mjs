export function mountView(window, entry, scan, cached = async () => undefined) {
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
    for (const [offset, user] of results.slice(from, visibleRanks).entries()) {
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
            if (focused) avatars.children[from]?.focus({ preventScroll: true });
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
        visibleRanks += 50;
        render(results, complete, {
          from,
          focusKey:
            document.activeElement === moreRanks
              ? `candidate:${results[from].id}`
              : undefined,
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
  const resetResults = () => {
    showDetails();
    details.open = false;
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
    render(outcome?.results ?? [], Boolean(outcome));
    showDetails(outcome?.skipped);
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
          render(results);
          showDetails(skipped, failures);
          setProgress(counts);
          if (counts) setStatus(`扫描进度：${progress}`, counts.failed > 0);
        },
      });
      render(outcome.results, outcome.complete);
      showDetails(outcome.skipped, outcome.failures);
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
