import test from "node:test";
import assert from "node:assert/strict";
import {
  component,
  link,
  button,
  waitFor,
  relationship,
  response,
} from "./support/component.mjs";
import { sharedStorage } from "./support/storage.mjs";

const status = (document) => document.querySelector('[role="status"]');
const open = (document) => link(document, "二度好友发现").click();
const finished = (document) =>
  waitFor(() => status(document).textContent.startsWith("完成"));

function selectMode(app, value) {
  const select = app.document.querySelector("select");
  select.value = value;
  select.dispatchEvent(new app.window.Event("change"));
}

test("dialog presents start, mode and accessible close in sketch order without a redundant title", (t) => {
  const { document } = component(t);
  open(document);
  const dialog = document.querySelector('[role="dialog"]');
  assert.equal(dialog.getAttribute("aria-label"), "二度好友发现");
  assert.equal(dialog.querySelector("h2"), null);
  const controls = dialog.querySelector(".sdf-controls");
  assert.deepEqual(
    [...controls.children],
    [
      button(dialog, "开始寻找"),
      dialog.querySelector("select"),
      button(dialog, "关闭"),
    ],
  );
  assert.equal(button(dialog, "关闭").textContent, "×");
  button(dialog, "关闭").click();
  assert.equal(dialog.hidden, true);
});

test("all four modes explain actual directions and distinct counts identically in live and cached rows", async (t) => {
  const homeName = "主页 <A> & 🖖";
  const cases = [
    ["friends/friends", `${homeName} 的 2 位好友加了 TA`],
    ["friends/rev_friends", `TA 加了 ${homeName} 的 2 位好友`],
    ["rev_friends/friends", `${homeName} 的 2 位反向好友加了 TA`],
    ["rev_friends/rev_friends", `TA 加了 ${homeName} 的 2 位反向好友`],
  ];
  for (const [mode, explanation] of cases) {
    const storage = sharedStorage();
    const configure = (window) => {
      storage.install(window);
      window.document.querySelector("#headerProfile .name > a").textContent =
        homeName;
    };
    const live = component(t, {
      configure,
      respond(url) {
        const owner = new URL(url).pathname.split("/")[2];
        return response(
          relationship(
            owner,
            owner === "alice" ? ["bob", "carol"] : ["zed", "zed"],
          ),
        );
      },
    });
    open(live.document);
    selectMode(live, mode);
    button(live.document, "开始寻找").click();
    await finished(live.document);
    const cached = component(t, { configure });
    open(cached.document);
    selectMode(cached, mode);
    await waitFor(() =>
      status(cached.document).textContent.startsWith("已载入缓存"),
    );
    for (const app of [live, cached]) {
      const row = app.document.querySelector("ol > li");
      assert.equal(row.querySelector(".sdf-score").textContent, explanation);
      assert.equal(row.querySelector(".sdf-score a"), null);
      assert.equal(row.querySelector(".sdf-contributors"), null);
      const summary = row.querySelector(".sdf-candidate");
      assert.equal(summary.firstElementChild.textContent, "1");
      assert.equal(
        summary.firstElementChild.getAttribute("aria-label"),
        "第 1 名",
      );
      button(row, "展开").click();
      const expanded = app.document.querySelector("ol > li");
      assert.equal(
        expanded.querySelector(".sdf-score").textContent,
        explanation,
      );
      assert.equal(expanded.querySelectorAll(".sdf-contributors a").length, 2);
      assert.equal(expanded.querySelector(".sdf-contributors").textContent, "");
      assert.deepEqual(
        [...expanded.querySelectorAll(".sdf-contributors a")]
          .map((a) => a.title)
          .sort(),
        ["bob", "carol"],
      );
      assert.equal(expanded.dataset.medal, "gold");
    }
    assert.deepEqual(cached.requests, []);
  }
});

test("multiple candidates can stay expanded and rank numbers stay in their summary when reordered", async (t) => {
  const pending = new Map();
  const { document, requests } = component(t, {
    respond(url) {
      const owner = new URL(url).pathname.split("/")[2];
      if (owner === "alice")
        return response(relationship(owner, ["bob", "carol"]));
      return new Promise((resolve) => pending.set(owner, resolve));
    },
  });
  open(document);
  button(document, "开始寻找").click();
  await waitFor(() => pending.size === 2);
  pending.get("bob")(response(relationship("bob", ["alpha", "zed"])));
  await waitFor(() => document.querySelectorAll("ol > li").length === 2);
  for (let i = 0; i < 2; i++)
    button(document.querySelectorAll("ol > li")[i], "展开").click();
  pending.get("carol")(response(relationship("carol", ["zed"])));
  await finished(document);
  const rows = [...document.querySelectorAll("ol > li")];
  assert.deepEqual(
    rows.map((row) => row.dataset.userId),
    ["zed", "alpha"],
  );
  assert.deepEqual(
    rows.map(
      (row) => row.querySelector(".sdf-candidate .sdf-rank").textContent,
    ),
    ["1", "2"],
  );
  assert.ok(
    rows.every(
      (row) => button(row, "收起").getAttribute("aria-expanded") === "true",
    ),
  );
  button(rows[0], "收起").click();
  assert.ok(button(document.querySelectorAll("ol > li")[1], "收起"));
  assert.equal(requests.length, 3);
});

test("progress becomes determinate only after totals are known and counts failed intermediates as processed", async (t) => {
  const pending = new Map();
  const { document } = component(t, {
    respond(url) {
      return new Promise((resolve) =>
        pending.set(new URL(url).pathname.split("/")[2], resolve),
      );
    },
  });
  open(document);
  button(document, "开始寻找").click();
  const progress = document.querySelector("progress");
  assert.equal(progress.hidden, false);
  assert.equal(progress.hasAttribute("value"), false);
  assert.equal(status(document).textContent, "正在获取主页关系");
  await waitFor(() => pending.has("alice"));
  pending.get("alice")(response(relationship("alice", ["bob", "carol"])));
  await waitFor(() => pending.size === 3);
  assert.equal(progress.max, 2);
  assert.equal(progress.value, 0);
  pending.get("bob")(response(relationship("bob", ["zed"])));
  await waitFor(() => progress.value === 1);
  assert.match(status(document).textContent, /扫描进度：1\/2/);
  assert.equal(document.querySelectorAll("[data-medal]").length, 0);
  pending.get("carol")(response("denied", { ok: false, status: 403 }));
  await waitFor(() => status(document).textContent.startsWith("读取失败"));
  assert.equal(progress.value, 2);
  assert.match(
    progress.getAttribute("aria-valuetext"),
    /已处理 2 \/ 2.*成功 1.*失败 1/,
  );
  assert.match(status(document).textContent, /未完成.*失败 1/);
  assert.equal(document.querySelectorAll("[data-medal]").length, 0);
  assert.equal(document.querySelector("details").hidden, true);
});

test("stopping before totals arrive hides the indeterminate bar without pretending completion", async (t) => {
  const { document } = component(t, { respond: () => new Promise(() => {}) });
  open(document);
  button(document, "开始寻找").click();
  button(document, "停止寻找").click();
  await waitFor(() => button(document, "开始寻找"));
  assert.equal(document.querySelector("progress").hidden, true);
  assert.match(status(document).textContent, /已停止，结果未完成/);
});

test("cache time range is readable and initially collapsed while the main status stays compact", async (t) => {
  const storage = sharedStorage();
  const time = Date.UTC(2026, 9, 21, 12, 0);
  const live = component(t, {
    configure(window) {
      storage.install(window);
      window.Date.now = () => time;
    },
    respond(url) {
      const owner = new URL(url).pathname.split("/")[2];
      return response(
        relationship(owner, owner === "alice" ? ["bob"] : ["zed"]),
      );
    },
  });
  open(live.document);
  button(live.document, "开始寻找").click();
  await finished(live.document);
  const { document, window, requests } = component(t, {
    configure: storage.install,
  });
  open(document);
  await waitFor(() => status(document).textContent.startsWith("已载入缓存"));
  assert.equal(status(document).textContent, "已载入缓存 · 1 位候选用户");
  assert.equal(document.querySelector("progress").hidden, true);
  const details = document.querySelector("details");
  assert.equal(details.hidden, false);
  assert.equal(details.open, false);
  const readable = new window.Date(time).toLocaleString("zh-CN", {
    hour12: false,
  });
  assert.equal(
    details.querySelector("p").textContent,
    `关系获取时间：${readable} — ${readable}`,
  );
  details.querySelector("summary").click();
  assert.equal(details.open, true);
  button(document, "开始寻找").click();
  assert.equal(details.hidden, true);
  assert.equal(details.open, false);
  assert.equal(document.querySelector("progress").hasAttribute("value"), false);
  assert.equal(requests.length, 1);
});

test("a complete empty graph shows an empty result, not an invitation to start again", async (t) => {
  const { document } = component(t, {
    respond: () => response(relationship("alice", [])),
  });
  open(document);
  button(document, "开始寻找").click();
  await finished(document);
  assert.match(status(document).textContent, /0 位候选用户.*0\/0/);
  assert.equal(
    document.querySelector(".sdf-empty").textContent,
    "此模式下暂无候选用户",
  );
  assert.equal(document.querySelector(".sdf-empty").hidden, false);
  assert.match(
    document.querySelector("progress").getAttribute("aria-valuetext"),
    /已处理 0 \/ 0/,
  );
});
