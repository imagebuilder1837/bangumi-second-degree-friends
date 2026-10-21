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
import { sharedStorage, interceptWrites } from "./support/storage.mjs";
import { clock } from "./support/clock.mjs";

const status = (app) =>
  app.document.querySelector('[role="status"]').textContent;
const rows = (app) => [...app.document.querySelectorAll("ol > li")];
async function open(app) {
  link(app.document, "二度好友发现").click();
  await waitFor(() => !/正在读取缓存/.test(status(app)));
}
async function mode(app, value) {
  const select = app.document.querySelector("select");
  select.value = value;
  select.dispatchEvent(new app.window.Event("change"));
  await waitFor(() => !/正在读取缓存/.test(status(app)));
}
async function start(app) {
  button(app.document, "开始寻找").click();
  await waitFor(() => button(app.document, "开始寻找"));
}
function cachedComponent(t, storage, graph, extra = {}) {
  return component(t, {
    ...extra,
    respond:
      extra.respond ??
      ((url) => {
        const path = new URL(url).pathname.slice(6);
        assert.ok(path in graph, `unexpected request: ${path}`);
        return response(relationship(path.split("/")[0], graph[path]));
      }),
    configure(window) {
      storage.install(window);
      extra.configure?.(window);
    },
  });
}

test("all four directions reuse complete cached rankings, exclusions and distinct contributors after refresh", async (t) => {
  const graph = {
    "alice/friends": ["bob", "carol", "bob"],
    "alice/rev_friends": ["dana", "erin", "dana"],
    "bob/friends": ["alice", "carol", "x", "x", "y", "zed"],
    "carol/friends": ["bob", "x"],
    "bob/rev_friends": ["alice", "dana", "z", "z"],
    "carol/rev_friends": ["z", "bob", "alpha"],
    "dana/friends": ["alice", "bob", "w", "w"],
    "erin/friends": ["w", "dana"],
    "dana/rev_friends": ["alice", "erin", "v", "v"],
    "erin/rev_friends": ["v", "bob"],
  };
  const cases = [
    [
      "friends/friends",
      [
        ["x", "2", ["bob", "carol"]],
        ["y", "1", ["bob"]],
        ["zed", "1", ["bob"]],
      ],
    ],
    [
      "friends/rev_friends",
      [
        ["z", "2", ["bob", "carol"]],
        ["alpha", "1", ["carol"]],
        ["bob", "1", ["carol"]],
      ],
    ],
    [
      "rev_friends/friends",
      [
        ["w", "2", ["dana", "erin"]],
        ["dana", "1", ["erin"]],
      ],
    ],
    [
      "rev_friends/rev_friends",
      [
        ["v", "2", ["dana", "erin"]],
        ["bob", "1", ["erin"]],
      ],
    ],
  ];
  function ranking(app) {
    return rows(app).map((_, index) => {
      rows(app)[index].querySelector("button").click();
      const row = rows(app)[index];
      return [
        row.dataset.userId,
        row.querySelector(".count").textContent,
        [...row.querySelectorAll(".sdf-contributors a")]
          .map((a) => a.getAttribute("href").slice(6))
          .sort(),
      ];
    });
  }
  for (const [value, expected] of cases) {
    const storage = sharedStorage();
    const live = cachedComponent(t, storage, graph);
    await open(live);
    await mode(live, value);
    await start(live);
    assert.doesNotMatch(status(live), /保存失败/);
    assert.deepEqual(ranking(live), expected);
    const refreshed = cachedComponent(t, storage, {});
    await open(refreshed);
    await mode(refreshed, value);
    assert.deepEqual(ranking(refreshed), expected);
    assert.equal(rows(refreshed)[0].dataset.medal, "gold");
    assert.match(status(refreshed), /^已载入缓存 · /);
    assert.equal(refreshed.requests.length, 0);
    if (value === "friends/friends") {
      assert.equal(
        rows(refreshed)[2].querySelector("a").textContent,
        "候选显示名",
      );
      assert.match(rows(refreshed)[2].querySelector("img").src, /custom_bob/);
      await start(live);
      assert.equal(
        live.requests.length,
        6,
        "active refresh refetches every list",
      );
    }
  }
});

test("cache failures identify capacity or unavailability while retaining complete live results and legacy bytes", async (t) => {
  for (const kind of ["quota", "missing", "security", "blocked"]) {
    const storage = sharedStorage();
    const app = cachedComponent(
      t,
      storage,
      {
        "alice/friends": ["bob"],
        "bob/friends": ["zed"],
      },
      {
        configure(window) {
          window.localStorage.setItem(
            "second-degree-friends:relationships",
            "legacy bytes",
          );
          if (kind === "quota") {
            window.indexedDB = interceptWrites(storage.indexedDB, () => {
              throw new DOMException("quota", "QuotaExceededError");
            });
          } else if (kind === "missing") window.indexedDB = undefined;
          else if (kind === "security") {
            Object.defineProperty(window, "indexedDB", {
              get() {
                throw new DOMException("denied", "SecurityError");
              },
            });
          } else {
            window.indexedDB = {
              open() {
                const request = {};
                queueMicrotask(() => request.onblocked());
                return request;
              },
            };
          }
        },
      },
    );
    await open(app);
    await start(app);
    assert.match(status(app), /^完成.*缓存保存失败.*旧缓存保留/);
    assert.match(
      status(app),
      kind === "quota" ? /容量不足/ : kind === "blocked" ? /阻塞/ : /不可用/,
    );
    assert.match(
      status(app),
      kind === "quota"
        ? /检查浏览器.*容量.*重试/
        : kind === "blocked"
          ? /关闭其他标签页后重试/
          : /检查浏览器.*权限.*重试/,
    );
    assert.equal(rows(app)[0].querySelector("a").textContent, "候选显示名");
    assert.equal(rows(app)[0].dataset.medal, "gold");
    assert.equal(
      app.window.localStorage.getItem("second-degree-friends:relationships"),
      "legacy bytes",
    );
  }
});

test("staging never replaces cached results after root failure, intermediate failure, stop, rate limiting or late responses", async (t) => {
  for (const failure of ["root", "intermediate", "stop", "429"]) {
    const storage = sharedStorage();
    const seed = cachedComponent(t, storage, {
      "alice/friends": ["bob"],
      "bob/friends": ["old"],
    });
    await open(seed);
    await start(seed);
    let release;
    const app = cachedComponent(
      t,
      storage,
      {},
      {
        respond(url) {
          if (url.includes("/alice/"))
            return failure === "root"
              ? response("", { ok: false, status: 403 })
              : response(relationship("alice", ["bob", "carol"]));
          if (url.includes("/bob/"))
            return response(relationship("bob", ["fresh"]));
          if (failure === "stop")
            return new Promise((resolve) => {
              release = resolve;
            });
          return response("", {
            ok: false,
            status: failure === "429" ? 429 : 403,
          });
        },
      },
    );
    await open(app);
    button(app.document, "开始寻找").click();
    if (failure === "stop") {
      await waitFor(() => release && rows(app).length === 1);
      button(app.document, "停止寻找").click();
    }
    await waitFor(() => button(app.document, "开始寻找"));
    if (release) release(response(relationship("carol", ["late"])));
    assert.match(status(app), /未完成/);
    assert.equal(app.document.querySelectorAll("[data-medal]").length, 0);
    const refreshed = cachedComponent(t, storage, {});
    await open(refreshed);
    assert.equal(rows(refreshed)[0].dataset.userId, "old");
    assert.equal(refreshed.requests.length, 0);
  }
});

test("cross-mode root replacement requires new intermediate snapshots and cached snapshots do not expire", async (t) => {
  const storage = sharedStorage();
  const time = clock();
  let expanded = false;
  const app = cachedComponent(
    t,
    storage,
    {},
    {
      configure: time.install,
      respond(url) {
        const path = new URL(url).pathname.slice(6);
        const graph = {
          "alice/friends": expanded ? ["bob", "carol"] : ["bob"],
          "alice/rev_friends": [],
          "bob/friends": ["zed"],
          "carol/friends": ["alpha"],
          "bob/rev_friends": [],
          "carol/rev_friends": [],
        };
        return response(relationship(path.split("/")[0], graph[path]));
      },
    },
  );
  await open(app);
  await start(app);
  await time.tick(1000);
  expanded = true;
  await mode(app, "friends/rev_friends");
  await start(app);
  await mode(app, "friends/friends");
  assert.match(status(app), /缓存不足/);
  assert.equal(rows(app).length, 0);
  const staleTime = clock();
  await staleTime.tick(10 * 365 * 24 * 60 * 60 * 1000);
  const refreshed = cachedComponent(
    t,
    storage,
    {},
    { configure: staleTime.install },
  );
  await open(refreshed);
  await mode(refreshed, "friends/rev_friends");
  assert.match(status(refreshed), /已载入缓存 · 0 位候选用户/);
  assert.equal(refreshed.requests.length, 0);
});
