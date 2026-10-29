import test from "node:test";
import assert from "node:assert/strict";
import { sharedStorage } from "./support/storage.mjs";
import {
  component,
  link,
  button,
  waitFor,
  relationship,
  response,
} from "./support/component.mjs";

test("opening discovery shows friends of friends without fetching relationships", (t) => {
  const { document, requests } = component(t);
  link(document, "二度好友发现").click();
  const dialog = document.querySelector('[role="dialog"]');
  assert.ok(dialog && !dialog.hidden);
  assert.match(dialog.textContent, /好友的好友/);
  assert.ok(button(document, "开始寻找"));
  assert.deepEqual(requests, []);
});

test("cache loading and missing cache show status only in the header", async (t) => {
  const { document } = component(t);
  link(document, "二度好友发现").click();
  assert.equal(
    document.querySelector('[role="status"]').textContent,
    "正在读取缓存",
  );
  const results = document.querySelector(".sdf-results");
  assert.equal(results.textContent, "");
  await waitFor(() =>
    document
      .querySelector('[role="status"]')
      .textContent.startsWith("缓存不足"),
  );
  assert.equal(results.textContent, "");
});

test("basic dialog can be closed and reopened without relationship requests", (t) => {
  const { document, requests } = component(t);
  link(document, "二度好友发现").click();
  button(document, "关闭").click();
  assert.ok(document.querySelector('[role="dialog"]').hidden);
  link(document, "二度好友发现").click();
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 1);
  assert.equal(document.querySelector('[role="dialog"]').hidden, false);
  assert.deepEqual(requests, []);
});

test("hidden scans keep progress and completion only in the dialog, and reopen the same mode and results", async (t) => {
  const pending = new Map();
  const { document, window, requests } = component(t, {
    respond: (url) => {
      const owner = new URL(url).pathname.split("/")[2];
      if (owner === "alice")
        return response(relationship(owner, ["bob", "carol"]));
      return new Promise((resolve) => pending.set(owner, resolve));
    },
  });
  const entry = link(document, "二度好友发现");
  const entryText = entry.closest("li").textContent;
  entry.click();
  const mode = document.querySelector("select");
  mode.value = "rev_friends/rev_friends";
  mode.dispatchEvent(new window.Event("change"));
  button(document, "开始寻找").click();
  await waitFor(() => pending.size === 2);
  button(document, "关闭").click();
  const dialog = document.querySelector('[role="dialog"]');
  pending.get("bob")(response(relationship("bob", ["zed"])));
  await waitFor(() =>
    /1\/2/.test(dialog.querySelector('[role="status"]').textContent),
  );
  assert.equal(
    document.querySelector("ol .count"),
    null,
    "hidden updates defer result painting",
  );
  assert.ok(dialog.hidden);
  assert.equal(entry.closest("li").textContent, entryText);
  assert.match(dialog.querySelector('[role="status"]').textContent, /1\/2/);
  entry.click();
  assert.equal(mode.value, "rev_friends/rev_friends");
  assert.equal(document.querySelector("ol .count").textContent, "1");
  assert.ok(button(document, "停止寻找"));
  assert.equal(requests.length, 3);
  button(document, "关闭").click();
  pending.get("carol")(response(relationship("carol", ["zed"])));
  await waitFor(() => button(document, "开始寻找"));
  assert.ok(dialog.hidden, "completion never opens the dialog");
  assert.equal(entry.closest("li").textContent, entryText);
  assert.match(dialog.querySelector('[role="status"]').textContent, /完成/);
  entry.click();
  assert.equal(document.querySelector("ol .count").textContent, "2");
  assert.equal(requests.length, 3);
});

test("modal keyboard focus and scroll stay contained until Esc hides without stopping", async (t) => {
  let signal;
  const { document, window, requests } = component(t, {
    respond: (_url, options) => {
      signal = options.signal;
      return new Promise(() => {});
    },
  });
  document.body.style.overflow = "scroll";
  document.documentElement.style.overflow = "auto";
  const entry = link(document, "二度好友发现");
  const entryText = entry.closest("li").textContent;
  entry.click();
  const dialog = document.querySelector('[role="dialog"]');
  assert.ok(dialog.contains(document.activeElement));
  assert.equal(document.body.style.overflow, "hidden");
  assert.equal(document.documentElement.style.overflow, "hidden");
  button(document, "开始寻找").click();
  dialog.click();
  assert.equal(dialog.hidden, false, "backdrop clicks do not hide");
  const first = button(document, "停止寻找");
  const last = dialog.querySelector('[aria-label="候选用户列表"]');
  last.focus();
  last.dispatchEvent(
    new window.KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    }),
  );
  assert.equal(document.activeElement, first);
  first.dispatchEvent(
    new window.KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );
  assert.equal(document.activeElement, last);
  entry.focus();
  assert.ok(
    dialog.contains(document.activeElement),
    "programmatic focus cannot escape",
  );
  dialog.dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  assert.ok(dialog.hidden);
  assert.equal(signal.aborted, false, "Esc is not stop");
  assert.equal(document.activeElement, entry);
  assert.equal(document.body.style.overflow, "scroll");
  assert.equal(document.documentElement.style.overflow, "auto");
  entry.click();
  assert.equal(requests.length, 1);
  button(document, "停止寻找").click();
  await waitFor(() => button(document, "开始寻找"));
  assert.ok(signal.aborted, "explicit stop cancels the request");
  assert.equal(entry.closest("li").textContent, entryText);
  assert.match(dialog.querySelector('[role="status"]').textContent, /未完成/);
  button(document, "关闭").click();
  assert.equal(document.activeElement, entry);
});

test("leaving the page ends hidden requests and a new page never resumes unfinished progress", async (t) => {
  let signal;
  let release;
  const writes = [];
  const { document, window, requests } = component(t, {
    configure: (window) =>
      Object.defineProperty(window, "localStorage", {
        value: {
          getItem: () => null,
          setItem: (...args) => writes.push(args),
        },
      }),
    respond: (_url, options) => {
      signal = options.signal;
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  });
  link(document, "二度好友发现").click();
  button(document, "开始寻找").click();
  button(document, "关闭").click();
  window.dispatchEvent(new window.PageTransitionEvent("pagehide"));
  assert.ok(signal.aborted);
  release(response(relationship("alice", ["late"])));
  await waitFor(() => button(document, "开始寻找"));
  assert.equal(requests.length, 1);
  assert.equal(document.querySelectorAll("ol > li").length, 0);
  assert.deepEqual(writes, []);
  const fresh = component(t);
  link(fresh.document, "二度好友发现").click();
  assert.equal(fresh.document.querySelectorAll("ol > li").length, 0);
  assert.ok(button(fresh.document, "开始寻找"));
  assert.deepEqual(fresh.requests, []);
});

test("candidate expansion explains distinct counted intermediates with safe current-identifier links and lazy avatars", async (t) => {
  const graph = {
    alice: ["bob", "carol", "bob"],
    bob: ["alice", "carol", "zed", "zed", "alpha"],
    carol: ["zed"],
  };
  const { document, requests } = component(t, {
    respond: (url) => {
      const owner = new URL(url).pathname.split("/")[2];
      return response(relationship(owner, graph[owner]));
    },
  });
  link(document, "二度好友发现").click();
  button(document, "开始寻找").click();
  await waitFor(() =>
    document.querySelector('[role="status"]').textContent.startsWith("完成"),
  );
  const row = link(document, "候选显示名").closest("li");
  const toggle = button(row, "展开");
  assert.ok(toggle, "separate disclosure button");
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(row.querySelectorAll("img").length, 1);
  const candidate = row.querySelector("a");
  candidate.addEventListener("click", (event) => event.preventDefault());
  candidate.click();
  assert.equal(
    toggle.getAttribute("aria-expanded"),
    "false",
    "user links never toggle",
  );
  toggle.click();
  const expanded = link(document, "候选显示名").closest("li");
  assert.equal(button(expanded, "收起").getAttribute("aria-expanded"), "true");
  assert.equal(expanded.querySelector(".count").textContent, "2");
  assert.deepEqual(
    [...expanded.querySelectorAll("a")].map((a) => a.getAttribute("href")),
    ["/user/zed", "/user/bob", "/user/carol"],
  );
  for (const anchor of expanded.querySelectorAll("a")) {
    assert.equal(anchor.target, "_blank");
    assert.ok(anchor.relList.contains("noopener"));
    assert.ok(anchor.relList.contains("noreferrer"));
    assert.ok(anchor.querySelector("img"));
  }
  for (const image of expanded.querySelectorAll("img")) {
    assert.equal(image.getAttribute("loading"), "lazy");
    assert.equal(
      image.src,
      "https://lain.bgm.tv/pic/user/l/custom_bob.jpg?r=7&hd=1",
    );
  }
  button(expanded, "收起").click();
  assert.equal(
    link(document, "候选显示名").closest("li").querySelectorAll("img").length,
    1,
  );
  assert.equal(
    requests.length,
    3,
    "browsing contributors never fetches relationships",
  );
});

test("rankings load fifty at a time until every candidate is reachable without relationship requests", async (t) => {
  const candidates = Array.from(
    { length: 103 },
    (_, i) => `candidate-${String(i).padStart(3, "0")}`,
  );
  const { document, requests } = component(t, {
    respond: (url) => {
      const owner = new URL(url).pathname.split("/")[2];
      return response(
        relationship(owner, owner === "alice" ? ["bob"] : candidates),
      );
    },
  });
  link(document, "二度好友发现").click();
  button(document, "开始寻找").click();
  await waitFor(() =>
    document.querySelector('[role="status"]').textContent.startsWith("完成"),
  );
  assert.equal(document.querySelectorAll("ol > li").length, 50);
  const previousLast = document.querySelectorAll("ol > li")[49];
  button(document, "显示更多候选用户").focus();
  button(document, "显示更多候选用户").click();
  assert.equal(document.querySelectorAll("ol > li").length, 100);
  assert.equal(document.querySelectorAll("ol > li")[49], previousLast);
  assert.equal(
    document.activeElement.getAttribute("href"),
    "/user/candidate-050",
  );
  button(document, "显示更多候选用户").focus();
  button(document, "显示更多候选用户").click();
  assert.equal(document.querySelectorAll("ol > li").length, 103);
  assert.equal(
    document.activeElement.getAttribute("href"),
    "/user/candidate-100",
  );
  assert.equal(
    document.querySelector("ol > li:last-child a").getAttribute("href"),
    "/user/candidate-102",
  );
  assert.equal(button(document, "显示更多候选用户"), undefined);
  assert.equal(document.querySelectorAll("[data-medal]").length, 3);
  assert.equal(requests.length, 2);
});

test("contributor avatars load forty at a time and eventually expose every counted intermediate", async (t) => {
  const intermediates = Array.from(
    { length: 83 },
    (_, i) => `middle-${String(i).padStart(3, "0")}`,
  );
  const { document, requests } = component(t, {
    respond: (url) => {
      const owner = new URL(url).pathname.split("/")[2];
      return response(
        relationship(owner, owner === "alice" ? intermediates : ["zed", "zed"]),
      );
    },
  });
  link(document, "二度好友发现").click();
  button(document, "开始寻找").click();
  await waitFor(() =>
    document.querySelector('[role="status"]').textContent.startsWith("完成"),
  );
  button(document, "展开").click();
  const row = () => document.querySelector("ol > li");
  assert.equal(row().querySelector(".count").textContent, "83");
  assert.equal(row().querySelectorAll(".sdf-contributors a").length, 40);
  const firstAvatar = row().querySelector(".sdf-contributors a");
  assert.equal(button(row(), "显示更多头像").textContent, "显示更多");
  button(row(), "显示更多头像").focus();
  button(row(), "显示更多头像").click();
  assert.equal(row().querySelectorAll(".sdf-contributors a").length, 80);
  assert.equal(row().querySelector(".sdf-contributors a"), firstAvatar);
  assert.equal(document.activeElement.getAttribute("href"), "/user/middle-040");
  button(row(), "显示更多头像").focus();
  button(row(), "显示更多头像").click();
  assert.equal(row().querySelectorAll(".sdf-contributors a").length, 83);
  assert.equal(document.activeElement.getAttribute("href"), "/user/middle-080");
  assert.equal(
    row()
      .querySelector(".sdf-contributors a:last-of-type")
      .getAttribute("href"),
    "/user/middle-082",
  );
  assert.equal(button(row(), "显示更多头像"), undefined);
  button(row(), "收起").click();
  button(row(), "展开").click();
  assert.equal(
    row().querySelectorAll(".sdf-contributors a").length,
    83,
    "loaded count survives collapse",
  );
  assert.equal(requests.length, 84);
});

test("live reordering keeps expansion with the candidate and retains loaded ranking and avatar batches", async (t) => {
  const middles = Array.from(
    { length: 83 },
    (_, i) => `m${String(i).padStart(3, "0")}`,
  );
  const fillers = Array.from(
    { length: 51 },
    (_, i) => `f${String(i).padStart(3, "0")}`,
  );
  const pending = new Map();
  const { document, requests } = component(t, {
    respond: (url) => {
      const owner = new URL(url).pathname.split("/")[2];
      if (owner === "alice") return response(relationship(owner, middles));
      return new Promise((resolve) => pending.set(owner, resolve));
    },
  });
  link(document, "二度好友发现").click();
  button(document, "开始寻找").click();
  for (let i = 0; i < 41; i++) {
    await waitFor(() => pending.has(middles[i]));
    pending.get(middles[i])(
      response(
        relationship(
          middles[i],
          i === 0 ? ["alpha", "zed", ...fillers] : ["alpha", "zed"],
        ),
      ),
    );
  }
  await waitFor(
    () => document.querySelector("ol .count")?.textContent === "41",
  );
  button(document, "显示更多候选用户").click();
  let alpha = link(document, "alpha").closest("li");
  button(alpha, "展开").click();
  alpha = link(document, "alpha").closest("li");
  button(alpha, "显示更多头像").click();
  for (let i = 41; i < 83; i++) {
    await waitFor(() => pending.has(middles[i]));
    pending.get(middles[i])(
      response(relationship(middles[i], i === 82 ? ["alpha", "zed"] : ["zed"])),
    );
  }
  await waitFor(() =>
    document.querySelector('[role="status"]').textContent.startsWith("完成"),
  );
  alpha = link(document, "alpha").closest("li");
  assert.equal(
    document.querySelector("ol > li a").getAttribute("href"),
    "/user/zed",
  );
  assert.equal(alpha.querySelector(".count").textContent, "42");
  assert.equal(button(alpha, "收起").getAttribute("aria-expanded"), "true");
  assert.equal(alpha.querySelectorAll(".sdf-contributors a").length, 42);
  assert.equal(document.querySelectorAll("ol > li").length, 53);
  assert.equal(
    button(link(document, "候选显示名").closest("li"), "展开").getAttribute(
      "aria-expanded",
    ),
    "false",
  );
  assert.equal(requests.length, 84);
});

test("new scans and mode changes reset collapsed candidates and both batch sizes", async (t) => {
  const middles = Array.from({ length: 42 }, (_, i) => `middle${i}`);
  const candidates = Array.from({ length: 102 }, (_, i) => `candidate${i}`);
  const { document, window } = component(t, {
    respond: (url) => {
      const owner = new URL(url).pathname.split("/")[2];
      return response(
        relationship(
          owner,
          owner === "alice"
            ? middles
            : owner === "middle0"
              ? ["zed", ...candidates]
              : ["zed"],
        ),
      );
    },
  });
  link(document, "二度好友发现").click();
  for (let round = 0; round < 3; round++) {
    button(document, "开始寻找").click();
    assert.equal(document.querySelectorAll("ol > li").length, 0);
    await waitFor(() =>
      document.querySelector('[role="status"]').textContent.startsWith("完成"),
    );
    assert.equal(document.querySelectorAll("ol > li").length, 50);
    const row = () => link(document, "候选显示名").closest("li");
    assert.ok(button(row(), "展开"));
    button(row(), "展开").click();
    assert.equal(row().querySelectorAll(".sdf-contributors a").length, 40);
    button(row(), "显示更多头像").click();
    button(document, "显示更多候选用户").click();
    assert.equal(document.querySelectorAll("ol > li").length, 100);
    assert.equal(row().querySelectorAll(".sdf-contributors a").length, 42);
    if (round === 1) {
      const mode = document.querySelector("select");
      mode.value = "rev_friends/rev_friends";
      mode.dispatchEvent(new window.Event("change"));
      assert.equal(document.querySelectorAll("ol > li").length, 0);
      assert.equal(button(document, "显示更多候选用户"), undefined);
    }
  }
});

test("keyboard disclosure keeps focus through expansion and live result rebuilding", async (t) => {
  const pending = new Map();
  const { document } = component(t, {
    respond: (url) => {
      const owner = new URL(url).pathname.split("/")[2];
      if (owner === "alice")
        return response(relationship(owner, ["bob", "carol"]));
      return new Promise((resolve) => pending.set(owner, resolve));
    },
  });
  link(document, "二度好友发现").click();
  button(document, "开始寻找").click();
  await waitFor(() => pending.size === 2);
  pending.get("bob")(response(relationship("bob", ["zed"])));
  await waitFor(() => button(document, "展开"));
  const toggle = button(document, "展开");
  toggle.focus();
  toggle.click();
  assert.equal(document.activeElement, button(document, "收起"));
  assert.equal(document.querySelectorAll("[data-medal]").length, 0);
  pending.get("carol")(response(relationship("carol", ["zed"])));
  await waitFor(() => button(document, "开始寻找"));
  assert.equal(document.activeElement, button(document, "收起"));
  assert.equal(document.querySelectorAll(".sdf-contributors a").length, 2);
  assert.equal(document.querySelectorAll("[data-medal]").length, 1);
});

test("starting a scan transfers focus from the disabled mode to the stop control", async (t) => {
  const { document } = component(t, { respond: () => new Promise(() => {}) });
  link(document, "二度好友发现").click();
  document.querySelector("select").focus();
  button(document, "开始寻找").click();
  assert.equal(document.activeElement, button(document, "停止寻找"));
  button(document, "停止寻找").click();
  await waitFor(() => button(document, "开始寻找"));
});

test("expanding incomplete mixed-direction results never awards medals or includes non-contributors", async (t) => {
  const graph = {
    "alice/friends": ["bob", "carol", "dana"],
    "alice/rev_friends": ["excluded"],
    "bob/rev_friends": ["alice", "excluded", "zed", "zed"],
    "carol/rev_friends": ["zed"],
  };
  const { document, window, requests } = component(t, {
    respond: (url) => {
      const path = new URL(url).pathname.slice(6);
      return path === "dana/rev_friends"
        ? response("", { ok: false, status: 403 })
        : response(relationship(path.split("/")[0], graph[path]));
    },
  });
  const entry = link(document, "二度好友发现");
  const entryText = entry.closest("li").textContent;
  entry.click();
  const mode = document.querySelector("select");
  mode.value = "friends/rev_friends";
  mode.dispatchEvent(new window.Event("change"));
  button(document, "开始寻找").click();
  await waitFor(() =>
    document
      .querySelector('[role="status"]')
      .textContent.startsWith("读取失败"),
  );
  button(document, "展开").click();
  assert.equal(document.querySelector(".count").textContent, "2");
  assert.deepEqual(
    [...document.querySelectorAll(".sdf-contributors a")].map((a) =>
      a.getAttribute("href"),
    ),
    ["/user/bob", "/user/carol"],
  );
  assert.equal(document.querySelectorAll("[data-medal]").length, 0);
  assert.equal(entry.closest("li").textContent, entryText);
  assert.match(document.querySelector('[role="status"]').textContent, /未完成/);
  button(document, "收起").click();
  assert.equal(document.querySelectorAll("[data-medal]").length, 0);
  assert.equal(requests.length, 5);
});

test("cached rankings disclose exact contributors and mode changes reset both cached batch sizes", async (t) => {
  const storage = sharedStorage();
  const middles = Array.from({ length: 42 }, (_, i) => `middle${i}`);
  const candidates = Array.from({ length: 102 }, (_, i) => `candidate${i}`);
  const app = component(t, {
    configure: storage.install,
    respond: (url) => {
      const owner = new URL(url).pathname.split("/")[2];
      return response(
        relationship(
          owner,
          owner === "alice"
            ? middles
            : owner === "middle0"
              ? ["zed", ...candidates]
              : ["zed", "zed"],
        ),
      );
    },
  });
  link(app.document, "二度好友发现").click();
  button(app.document, "开始寻找").click();
  await waitFor(() =>
    app.document
      .querySelector('[role="status"]')
      .textContent.startsWith("完成"),
  );
  const { document, window, requests } = component(t, {
    configure: storage.install,
  });
  link(document, "二度好友发现").click();
  await waitFor(() =>
    document
      .querySelector('[role="status"]')
      .textContent.startsWith("已载入缓存 · "),
  );
  assert.match(
    document.querySelector('[role="status"]').textContent,
    /^已载入缓存 · /,
  );
  const row = () => link(document, "候选显示名").closest("li");
  button(row(), "展开").click();
  assert.equal(row().querySelector(".count").textContent, "42");
  assert.equal(row().querySelectorAll(".sdf-contributors a").length, 40);
  button(row(), "显示更多头像").click();
  button(document, "显示更多候选用户").click();
  await waitFor(() => document.querySelectorAll("ol > li").length === 100);
  assert.equal(row().querySelectorAll(".sdf-contributors a").length, 42);
  assert.deepEqual(
    [...row().querySelectorAll(".sdf-contributors a")]
      .slice(0, 2)
      .map((a) => a.getAttribute("href")),
    ["/user/middle0", "/user/middle1"],
  );
  assert.equal(
    row()
      .querySelector(".sdf-contributors a:last-of-type")
      .getAttribute("href"),
    "/user/middle41",
  );
  assert.equal(document.querySelectorAll("ol > li").length, 100);
  const mode = document.querySelector("select");
  mode.value = "rev_friends/rev_friends";
  mode.dispatchEvent(new window.Event("change"));
  assert.equal(document.querySelectorAll("ol > li").length, 0);
  mode.value = "friends/friends";
  mode.dispatchEvent(new window.Event("change"));
  await waitFor(() => document.querySelectorAll("ol > li").length === 50);
  assert.equal(document.querySelectorAll("ol > li").length, 50);
  assert.ok(button(row(), "展开"));
  button(row(), "展开").click();
  assert.equal(row().querySelectorAll(".sdf-contributors a").length, 40);
  assert.equal(document.querySelectorAll("[data-medal]").length, 3);
  assert.deepEqual(requests, []);
});
