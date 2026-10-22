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
import { clock } from "./support/clock.mjs";

const unavailable =
  '<div id="colunmNotice"><img src="/img/bangumi/404.png"><div class="message"><h2>呜咕，出错了</h2><p class="text">啊噢，你访问的页面似乎被 Bangumi 娘吃掉了。</p></div></div>';
const status = (document) =>
  document.querySelector('[role="status"]').textContent;
function open(app, mode) {
  link(app.document, "二度好友发现").click();
  const select = app.document.querySelector("select");
  select.value = mode;
  select.dispatchEvent(new app.window.Event("change"));
}
function home() {
  return relationship("alice", ["bob", "carol"]).replace(
    ">bob</a>",
    ">[已注销]</a>",
  );
}

test("unavailable deleted intermediates complete with explicit skips, details and medals in every mode and cache", async (t) => {
  for (const mode of [
    "friends/friends",
    "friends/rev_friends",
    "rev_friends/friends",
    "rev_friends/rev_friends",
  ]) {
    const storage = sharedStorage();
    const live = component(t, {
      configure: storage.install,
      respond(url) {
        const owner = new URL(url).pathname.split("/")[2];
        return response(
          owner === "alice"
            ? home()
            : owner === "bob"
              ? unavailable
              : relationship(owner, ["zed"]),
        );
      },
    });
    open(live, mode);
    button(live.document, "开始寻找").click();
    await waitFor(() => button(live.document, "开始寻找"));
    assert.match(status(live.document), /^完成.*跳过 1 项关系读取异常/);
    assert.match(status(live.document), /2\/2，成功 1，失败 0，跳过 1/);
    const cached = component(t, { configure: storage.install });
    open(cached, mode);
    await waitFor(() => status(cached.document).startsWith("已载入缓存"));
    for (const app of [live, cached]) {
      assert.match(status(app.document), /跳过 1 项关系读取异常/);
      const row = app.document.querySelector('li[data-user-id="zed"]');
      assert.equal(row.dataset.medal, "gold");
      assert.equal(row.querySelector(".count").textContent, "1");
      const details = [...app.document.querySelectorAll("details")].find(
        (d) => d.querySelector("summary").textContent === "详情",
      );
      assert.equal(details.hidden, false);
      assert.equal(details.open, false);
      assert.ok(details.closest(".sdf-status"));
      assert.equal(app.document.querySelectorAll("details").length, 1);
      assert.doesNotMatch(
        app.document.querySelector(".sdf-status").textContent,
        /缓存详情|关系获取时间/,
      );
      details.querySelector("summary").click();
      assert.equal(details.open, true);
      assert.match(details.textContent, /已注销用户的关系列表不可访问/);
      assert.equal(details.querySelector("a[title]").title, "[已注销]");
      assert.match(
        details.textContent,
        new RegExp(mode.endsWith("rev_friends") ? "反向好友" : "好友"),
      );
      assert.equal(
        details.querySelector("a").getAttribute("href"),
        "/user/bob",
      );
      assert.equal(details.querySelector("a").target, "_blank");
    }
    assert.equal(cached.requests.length, 0);
  }
});

test("only exact deleted intermediate names and the recognized error page qualify for skipping", async (t) => {
  for (const [name, reply] of [
    ["ordinary", response(unavailable)],
    ["[已注销]x", response(unavailable)],
    ["[已注销]", response("<html>unknown</html>")],
    [
      "[已注销]",
      response(
        unavailable.replace(
          "啊噢，你访问的页面似乎被 Bangumi 娘吃掉了。",
          "数据库中没有查询到该用户的信息",
        ),
      ),
    ],
    ["[已注销]", response(unavailable, { ok: false, status: 403 })],
    [
      "[已注销]",
      response(unavailable, { url: "https://bgm.tv/user/other/friends" }),
    ],
    ["[已注销]", response(relationship("other", []))],
  ]) {
    const app = component(t, {
      respond(url) {
        const owner = new URL(url).pathname.split("/")[2];
        return owner === "alice"
          ? response(
              relationship("alice", ["bob"]).replace(
                ">bob</a>",
                `>${name}</a>`,
              ),
            )
          : reply;
      },
    });
    open(app, "friends/friends");
    button(app.document, "开始寻找").click();
    await waitFor(() => button(app.document, "开始寻找"));
    assert.match(status(app.document), /^读取失败，未完成.*成功 0，失败 1/);
    assert.doesNotMatch(status(app.document), /跳过/);
  }
});

test("deleted intermediates with readable relationships still contribute and active scans replace skip records", async (t) => {
  const storage = sharedStorage();
  let missing = false;
  const app = component(t, {
    configure: storage.install,
    respond(url) {
      const owner = new URL(url).pathname.split("/")[2];
      return response(
        owner === "alice"
          ? home()
          : owner === "bob" && missing
            ? unavailable
            : relationship(owner, [owner === "bob" ? "old" : "zed"]),
      );
    },
  });
  open(app, "friends/friends");
  for (const skip of [false, true, false]) {
    missing = skip;
    button(app.document, "开始寻找").click();
    await waitFor(() => button(app.document, "开始寻找"));
    assert.match(status(app.document), /^完成/);
    assert.equal(!!app.document.querySelector('li[data-user-id="old"]'), !skip);
    const cached = component(t, { configure: storage.install });
    open(cached, "friends/friends");
    await waitFor(() => status(cached.document).startsWith("已载入缓存"));
    assert.equal(
      !!cached.document.querySelector('li[data-user-id="old"]'),
      !skip,
    );
    assert.equal(status(cached.document).includes("跳过 1"), skip);
  }
});

test("skips do not conceal other failures or save an incomplete result", async (t) => {
  const storage = sharedStorage();
  const app = component(t, {
    configure: storage.install,
    respond(url) {
      const owner = new URL(url).pathname.split("/")[2];
      return owner === "alice"
        ? response(home())
        : owner === "bob"
          ? response(unavailable)
          : response("denied", { ok: false, status: 403 });
    },
  });
  open(app, "friends/friends");
  button(app.document, "开始寻找").click();
  await waitFor(() => button(app.document, "开始寻找"));
  assert.match(
    status(app.document),
    /^读取失败，未完成.*跳过 1.*2\/2，成功 0，失败 1，跳过 1/,
  );
  assert.equal(app.document.querySelectorAll("[data-medal]").length, 0);
  const cached = component(t, { configure: storage.install });
  open(cached, "friends/friends");
  await waitFor(() => status(cached.document).startsWith("缓存不足"));
});

test("deleted names do not bypass network retries, timeouts or rate limiting", async (t) => {
  for (const failure of ["network", "timeout", "rate-limit"]) {
    const time = clock();
    const app = component(t, {
      configure: time.install,
      respond(url) {
        const owner = new URL(url).pathname.split("/")[2];
        if (owner === "alice")
          return response(
            relationship("alice", ["bob"]).replace(">bob</a>", ">[已注销]</a>"),
          );
        if (failure === "network") throw new TypeError("offline");
        if (failure === "timeout") return new Promise(() => {});
        return response(unavailable, { ok: false, status: 429 });
      },
    });
    open(app, "friends/friends");
    button(app.document, "开始寻找").click();
    await time.tick(100000);
    assert.match(
      status(app.document),
      failure === "rate-limit" ? /未完成/ : /^读取失败，未完成.*失败 1/,
    );
    assert.doesNotMatch(status(app.document), /跳过/);
  }
});

test("unavailable home relationships are never skipped even when the home name is deleted", async (t) => {
  const app = component(t, {
    configure(window) {
      window.document.querySelector("#headerProfile .name > a").textContent =
        "[已注销]";
    },
    respond: () => response(unavailable),
  });
  open(app, "friends/friends");
  button(app.document, "开始寻找").click();
  await waitFor(() => button(app.document, "开始寻找"));
  assert.match(status(app.document), /^读取失败，未完成/);
  assert.doesNotMatch(status(app.document), /跳过/);
});
