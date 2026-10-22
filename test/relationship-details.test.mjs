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
import { JSDOM } from "jsdom";

const unavailable =
  '<div id="colunmNotice"><img src="/img/bangumi/404.png"><h2>呜咕，出错了</h2><p class="text">啊噢，你访问的页面似乎被 Bangumi 娘吃掉了。</p></div>';
const status = (document) =>
  document.querySelector('[role="status"]').textContent;
function start(app) {
  link(app.document, "二度好友发现").click();
  button(app.document, "开始寻找").click();
}

test("details show failures before both kinds of skips with linked names, small avatars and reasons but no HTTP codes", async (t) => {
  const app = component(t, {
    respond(url) {
      const owner = new URL(url).pathname.split("/")[2];
      if (owner === "alice")
        return response(
          relationship(owner, ["bob", "carol", "dave"]).replace(
            ">bob</a>",
            ">[已注销]</a>",
          ),
        );
      if (owner === "bob") return response(unavailable);
      if (owner === "carol") return response(relationship(owner, ["zed", ""]));
      return response("denied", { ok: false, status: 403 });
    },
  });
  start(app);
  await waitFor(() => button(app.document, "开始寻找"));
  const details = app.document.querySelector("details");
  assert.equal(details.hidden, false);
  assert.equal(details.open, false);
  assert.equal(details.querySelector("summary").textContent, "详情");
  const groups = [...details.querySelectorAll(".sdf-detail-group")];
  assert.deepEqual(
    groups.map((g) => g.querySelector("h3").textContent),
    ["读取失败 · 1", "已跳过 · 2"],
  );
  const rows = [...details.querySelectorAll(".sdf-detail-row")];
  assert.equal(rows[0].querySelector("a").getAttribute("href"), "/user/dave");
  assert.deepEqual(
    rows
      .slice(1)
      .map((r) => r.querySelector("a").getAttribute("href"))
      .sort(),
    ["/user/bob", "/user/carol"],
  );
  for (const row of rows) {
    assert.equal(row.querySelector("img").width, 24);
    assert.equal(row.querySelectorAll("a").length, 2);
    assert.equal(row.querySelectorAll('a[target="_blank"]').length, 2);
    assert.match(row.querySelector(".sdf-detail-user").textContent, / · 好友$/);
    assert.ok(row.querySelector(".sdf-detail-reason").textContent);
  }
  assert.match(details.textContent, /已注销用户的关系列表不可访问/);
  assert.match(details.textContent, /跳过 1 条缺失用户标识的关系/);
  assert.doesNotMatch(details.textContent, /HTTP|403/);
  assert.match(status(app.document), /未完成.*成功 0，失败 1，跳过 2/);
  assert.equal(
    app.document.querySelector('[data-user-id="zed"] .count').textContent,
    "1",
  );
  assert.equal(app.document.querySelectorAll("[data-medal]").length, 0);
});

test("accepted missing identifiers award medals, commit cache and restore the same details without requests", async (t) => {
  const storage = sharedStorage();
  const live = component(t, {
    configure: storage.install,
    respond(url) {
      const owner = new URL(url).pathname.split("/")[2];
      return response(
        relationship(owner, owner === "alice" ? ["bob", ""] : ["zed", ""]),
      );
    },
  });
  start(live);
  await waitFor(() => button(live.document, "开始寻找"));
  assert.match(status(live.document), /^完成/);
  const cached = component(t, { configure: storage.install });
  link(cached.document, "二度好友发现").click();
  await waitFor(() => status(cached.document).startsWith("已载入缓存"));
  for (const app of [live, cached]) {
    assert.equal(
      app.document.querySelector('[data-user-id="zed"]').dataset.medal,
      "gold",
    );
    assert.equal(app.document.querySelectorAll(".sdf-detail-row").length, 2);
    assert.match(
      app.document.querySelector("details").textContent,
      /缺失用户标识/,
    );
  }
  assert.deepEqual(
    [
      ...cached.document.querySelectorAll(".sdf-detail-user a:last-of-type"),
    ].map((a) => a.textContent),
    [...live.document.querySelectorAll(".sdf-detail-user a:last-of-type")].map(
      (a) => a.textContent,
    ),
  );
  assert.equal(cached.requests.length, 0);
});

test("live details preserve disclosure and focused links, survive stop, and reset on a new scan", async (t) => {
  let release;
  let homePending = false;
  const app = component(t, {
    respond(url) {
      const owner = new URL(url).pathname.split("/")[2];
      if (owner === "alice")
        return homePending
          ? new Promise(() => {})
          : response(relationship(owner, ["bob", "carol", "dave"]));
      if (owner === "bob") return response(relationship(owner, ["zed", ""]));
      if (owner === "carol")
        return new Promise((resolve) => {
          release = resolve;
        });
      return new Promise(() => {});
    },
  });
  start(app);
  await waitFor(() => app.document.querySelector(".sdf-detail-row"));
  const details = app.document.querySelector("details");
  details.open = true;
  const focused = details.querySelector(".sdf-detail-user a:last-of-type");
  focused.focus();
  release(response("denied", { ok: false, status: 403 }));
  await waitFor(() =>
    details.querySelector('[data-kind="failures"] .sdf-detail-row'),
  );
  assert.equal(details.open, true);
  assert.equal(app.document.activeElement, focused);
  button(app.document, "停止寻找").click();
  await waitFor(() => button(app.document, "开始寻找"));
  assert.match(status(app.document), /已停止，结果未完成/);
  assert.equal(details.querySelectorAll(".sdf-detail-row").length, 2);
  homePending = true;
  button(app.document, "开始寻找").click();
  assert.equal(details.hidden, true);
  assert.equal(details.open, false);
  button(app.document, "停止寻找").click();
  await waitFor(() => button(app.document, "开始寻找"));
});

test("home skips are visible while exclusion relationships are pending and survive cancellation", async (t) => {
  const app = component(t, {
    respond(url) {
      return new URL(url).pathname.endsWith("/friends")
        ? response(relationship("alice", ["bob", ""]))
        : new Promise(() => {});
    },
  });
  link(app.document, "二度好友发现").click();
  const select = app.document.querySelector("select");
  select.value = "friends/rev_friends";
  select.dispatchEvent(new app.window.Event("change"));
  button(app.document, "开始寻找").click();
  await waitFor(() => app.requests.length === 2);
  assert.equal(app.document.querySelector("details").hidden, false);
  button(app.document, "停止寻找").click();
  await waitFor(() => button(app.document, "开始寻找"));
  assert.equal(app.document.querySelectorAll(".sdf-detail-row").length, 1);
  assert.equal(app.document.querySelector("progress").hidden, true);
});

test("missing identifiers with damaged structure fail without medals or a new cache", async (t) => {
  const storage = sharedStorage();
  const damaged = new JSDOM(relationship("bob", ["zed", ""]));
  const list = damaged.window.document.querySelector("#memberUserList");
  list.lastElementChild.querySelector(".userImage").remove();
  const html = damaged.serialize();
  damaged.window.close();
  const app = component(t, {
    configure: storage.install,
    respond(url) {
      return response(
        new URL(url).pathname.includes("/alice/")
          ? relationship("alice", ["bob"])
          : html,
      );
    },
  });
  start(app);
  await waitFor(() => button(app.document, "开始寻找"));
  assert.match(status(app.document), /^读取失败，未完成.*成功 0，失败 1/);
  assert.doesNotMatch(status(app.document), /跳过/);
  assert.match(
    app.document.querySelector("details").textContent,
    /无效的好友条目/,
  );
  assert.equal(app.document.querySelectorAll("[data-medal]").length, 0);
  const cached = component(t, { configure: storage.install });
  link(cached.document, "二度好友发现").click();
  await waitFor(() => status(cached.document).startsWith("缓存不足"));
});

test("home relationship failures appear in details without a fictitious intermediate total", async (t) => {
  const app = component(t, {
    respond: () => response("denied", { ok: false, status: 403 }),
  });
  start(app);
  await waitFor(() => button(app.document, "开始寻找"));
  assert.match(status(app.document), /^读取失败，未完成/);
  assert.equal(app.document.querySelector("progress").hidden, true);
  assert.equal(app.document.querySelector("details").hidden, false);
  assert.equal(
    app.document.querySelector(".sdf-detail-user a:last-of-type").textContent,
    "不是用户标识",
  );
});
