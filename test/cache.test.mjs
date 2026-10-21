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

const status = (app) =>
  app.document.querySelector('[role="status"]').textContent;
const rows = (app) => [...app.document.querySelectorAll("ol > li")];
const open = (app) => link(app.document, "二度好友发现").click();
function mode(app, value) {
  const select = app.document.querySelector("select");
  select.value = value;
  select.dispatchEvent(new app.window.Event("change"));
}
async function start(app) {
  button(app.document, "开始寻找").click();
  await waitFor(() => button(app.document, "开始寻找"));
}
function graphResponse(graph) {
  return (url) => {
    const path = new URL(url).pathname.slice(6);
    assert.ok(path in graph, `unexpected request: ${path}`);
    return response(relationship(path.split("/")[0], graph[path]));
  };
}
function cachedComponent(t, storage, graph, extra = {}) {
  return component(t, {
    ...extra,
    respond: extra.respond ?? graphResponse(graph),
    configure(window) {
      storage.install(window);
      extra.configure?.(window);
    },
  });
}

test("a successful scan persists raw relationships and refresh reuses complete cached rankings without requests", async (t) => {
  const storage = sharedStorage();
  const graph = {
    "alice/friends": ["bob", "carol", "bob"],
    "bob/friends": ["zed", "zed", "alpha", "beta"],
    "carol/friends": ["zed"],
  };
  const app = cachedComponent(t, storage, graph);
  open(app);
  assert.equal(app.requests.length, 0);
  await start(app);
  assert.equal(storage.writes.length, 1);
  const refreshed = cachedComponent(t, storage, graph);
  open(refreshed);
  assert.deepEqual(
    rows(refreshed).map((row) => [
      row.querySelector("a").textContent,
      row.querySelector(".count").textContent,
      row.dataset.medal,
    ]),
    [
      ["候选显示名", "2", "gold"],
      ["alpha", "1", "silver"],
      ["beta", "1", "bronze"],
    ],
  );
  assert.equal(refreshed.requests.length, 0);
  assert.match(status(refreshed), /缓存/);
  const raw = JSON.parse(storage.writes[0]);
  assert.deepEqual(raw.relationships.alice.friends.members, ["bob", "carol"]);
  assert.deepEqual(raw.relationships.bob.friends.members, [
    "zed",
    "alpha",
    "beta",
  ]);
  assert.equal(raw.users.zed.name, "候选显示名");
  assert.equal(
    raw.users.zed.avatar,
    "https://lain.bgm.tv/pic/user/l/custom_bob.jpg?r=7&hd=1",
  );
  assert.doesNotMatch(
    storage.writes[0],
    /"(?:count|contributors|results|mode|rankings)"/,
  );
  await start(refreshed);
  assert.equal(
    refreshed.requests.length,
    3,
    "active refresh refetches every list",
  );
});

test("live and cached rankings preserve exclusions, distinct contributors and identifier tie order in all four directions", async (t) => {
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
  const ranking = (app) =>
    rows(app).map((_, index) => {
      rows(app)[index].querySelector("button").click();
      const expanded = rows(app)[index];
      return [
        expanded.querySelector("a").getAttribute("href").slice(6),
        expanded.querySelector(".count").textContent,
        [...expanded.querySelectorAll(".sdf-contributors a")]
          .map((link) => link.getAttribute("href").slice(6))
          .sort(),
      ];
    });
  for (const [value, expected] of cases) {
    const storage = sharedStorage();
    const live = cachedComponent(t, storage, graph);
    open(live);
    mode(live, value);
    await start(live);
    assert.deepEqual(ranking(live), expected, `${value}: live`);
    const cached = cachedComponent(t, storage, {});
    open(cached);
    mode(cached, value);
    assert.deepEqual(ranking(cached), expected, `${value}: cached`);
    assert.equal(cached.requests.length, 0);
  }
});

test("all four cached directions require every root and intermediate snapshot, while explicit empty sets are complete", async (t) => {
  const storage = sharedStorage();
  const graph = {
    "alice/friends": ["bob"],
    "alice/rev_friends": ["carol"],
    "bob/friends": ["x"],
    "bob/rev_friends": ["y"],
    "carol/friends": ["z"],
    "carol/rev_friends": ["w"],
  };
  const app = cachedComponent(t, storage, graph);
  open(app);
  const cases = [
    [
      "friends/friends",
      "x",
      [
        ["alice", "friends"],
        ["bob", "friends"],
      ],
    ],
    [
      "friends/rev_friends",
      "y",
      [
        ["alice", "friends"],
        ["alice", "rev_friends"],
        ["bob", "rev_friends"],
      ],
    ],
    [
      "rev_friends/friends",
      "z",
      [
        ["alice", "rev_friends"],
        ["alice", "friends"],
        ["carol", "friends"],
      ],
    ],
    [
      "rev_friends/rev_friends",
      "w",
      [
        ["alice", "rev_friends"],
        ["carol", "rev_friends"],
      ],
    ],
  ];
  for (const [value] of cases) {
    mode(app, value);
    await start(app);
  }
  const key = [...storage.values.keys()][0];
  const original = storage.values.get(key);
  for (const [value, expected, required] of cases) {
    // Each dependency is independently necessary, including the exclusion set.
    for (const [owner, direction] of required) {
      for (const invalid of [
        undefined,
        { members: [], fetchedAt: "yesterday" },
        { fetchedAt: 0 },
        { members: [42], fetchedAt: 0 },
      ]) {
        const raw = JSON.parse(original);
        raw.relationships[owner][direction] = invalid;
        storage.values.set(key, JSON.stringify(raw));
        const missing = cachedComponent(t, storage, graph);
        open(missing);
        mode(missing, value);
        assert.match(
          status(missing),
          /缓存不足/,
          `${value}: ${owner}/${direction}`,
        );
        assert.equal(rows(missing).length, 0);
        assert.equal(missing.requests.length, 0);
      }
    }
    const onlyRequired = JSON.parse(original);
    onlyRequired.relationships = {};
    for (const [owner, direction] of required) {
      onlyRequired.relationships[owner] ??= {};
      onlyRequired.relationships[owner][direction] =
        JSON.parse(original).relationships[owner][direction];
    }
    storage.values.set(key, JSON.stringify(onlyRequired));
    const complete = cachedComponent(t, storage, graph);
    open(complete);
    mode(complete, value);
    assert.equal(rows(complete)[0].querySelector("a").textContent, expected);
    assert.equal(rows(complete)[0].dataset.medal, "gold");
    assert.equal(complete.requests.length, 0);
    const empty = JSON.parse(original);
    for (const [owner, direction] of required)
      empty.relationships[owner][direction].members = [];
    storage.values.set(key, JSON.stringify(empty));
    const knownEmpty = cachedComponent(t, storage, graph);
    open(knownEmpty);
    mode(knownEmpty, value);
    assert.match(status(knownEmpty), /缓存：0 位候选用户/);
    assert.equal(knownEmpty.requests.length, 0);
  }
});

test("interleaved tabs preserve unrelated updates and keep the newer snapshot when an older scan commits last", async (t) => {
  const storage = sharedStorage();
  const olderTime = clock();
  const newerTime = clock();
  await newerTime.tick(1000);
  let releaseOld;
  const older = cachedComponent(
    t,
    storage,
    {},
    {
      configure: olderTime.install,
      respond: (url) =>
        url.includes("/alice/")
          ? response(relationship("alice", ["bob"]))
          : new Promise((resolve) => {
              releaseOld = resolve;
            }),
    },
  );
  const newer = cachedComponent(
    t,
    storage,
    { "alice/friends": ["carol"], "carol/friends": ["zed"] },
    { configure: newerTime.install },
  );
  open(older);
  open(newer);
  button(older.document, "开始寻找").click();
  await waitFor(() => releaseOld);
  await start(newer);
  releaseOld(response(relationship("bob", ["old"])));
  await waitFor(() => button(older.document, "开始寻找"));
  const refreshed = cachedComponent(t, storage, {});
  open(refreshed);
  assert.equal(rows(refreshed)[0].querySelector("a").textContent, "候选显示名");
  const raw = JSON.parse(storage.writes.at(-1));
  assert.deepEqual(raw.relationships.alice.friends.members, ["carol"]);
  assert.deepEqual(raw.relationships.bob.friends.members, ["old"]);
  assert.deepEqual(raw.relationships.carol.friends.members, ["zed"]);
});

test("unreadable storage cannot be overwritten even if setItem would succeed; complete live results retain medals and warn", async (t) => {
  let writes = 0;
  const storage = sharedStorage();
  const app = cachedComponent(
    t,
    storage,
    { "alice/friends": ["bob"], "bob/friends": ["zed"] },
    {
      configure(window) {
        window.localStorage.getItem = () => {
          throw new Error("SecurityError");
        };
        window.localStorage.setItem = () => {
          writes++;
        };
      },
    },
  );
  open(app);
  assert.match(status(app), /缓存不足/);
  await start(app);
  assert.equal(writes, 0);
  assert.match(status(app), /完成.*缓存保存失败.*旧缓存保留/);
  assert.equal(rows(app)[0].dataset.medal, "gold");
});

test("a later complete scan replaces deleted relationships even within one clock tick and preserves unrelated directions", async (t) => {
  const storage = sharedStorage();
  const time = clock();
  let fresh = false;
  const app = cachedComponent(
    t,
    storage,
    {},
    {
      configure: time.install,
      respond: (url) => {
        const path = new URL(url).pathname;
        if (path.endsWith("/rev_friends"))
          return response(relationship("alice", []));
        if (path.includes("/alice/"))
          return response(relationship("alice", ["bob"]));
        return response(
          relationship("bob", fresh ? ["new"] : ["deleted", "new"]),
        );
      },
    },
  );
  open(app);
  mode(app, "rev_friends/rev_friends");
  await start(app);
  mode(app, "friends/friends");
  await start(app);
  fresh = true;
  await start(app);
  const refreshed = cachedComponent(t, storage, {});
  open(refreshed);
  assert.deepEqual(
    rows(refreshed).map((row) => row.querySelector("a").textContent),
    ["new"],
  );
  mode(refreshed, "rev_friends/rev_friends");
  assert.match(status(refreshed), /缓存：0 位候选用户/);
  const raw = JSON.parse(storage.writes.at(-1));
  assert.deepEqual(raw.relationships.bob.friends.members, ["new"]);
  assert.equal(
    raw.relationships.new,
    undefined,
    "observed edges do not fabricate reverse snapshots",
  );
});

test("cross-mode root replacement hides old rankings with missing dependencies and combines stale snapshots with an honest time range", async (t) => {
  const storage = sharedStorage();
  const time = clock();
  let expanded = false;
  const app = cachedComponent(
    t,
    storage,
    {},
    {
      configure: time.install,
      respond: (url) => {
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
  open(app);
  await start(app);
  await time.tick(1000);
  expanded = true;
  mode(app, "friends/rev_friends");
  await start(app);
  mode(app, "friends/friends");
  assert.match(status(app), /缓存不足/);
  assert.equal(rows(app).length, 0);
  assert.equal(app.requests.length, 6);
  // A complete older combination remains reusable indefinitely; no scan history is restored.
  const key = [...storage.values.keys()][0];
  const raw = JSON.parse(storage.values.get(key));
  raw.relationships.alice.friends.members = ["bob"];
  storage.values.set(key, JSON.stringify(raw));
  const staleTime = clock();
  await staleTime.tick(10 * 365 * 24 * 60 * 60 * 1000);
  const refreshed = cachedComponent(
    t,
    storage,
    {},
    { configure: staleTime.install },
  );
  open(refreshed);
  assert.equal(rows(refreshed)[0].dataset.medal, "gold");
  assert.match(
    status(refreshed),
    /2026-01-01T00:00:00\.000Z — 2026-01-01T00:00:01\.000Z/,
  );
  assert.equal(refreshed.requests.length, 0);
});

test("staging never commits root failure, intermediate failure, stop, rate limiting, or late cancelled responses", async (t) => {
  const storage = sharedStorage();
  const seed = cachedComponent(t, storage, {
    "alice/friends": ["bob"],
    "bob/friends": ["old"],
  });
  open(seed);
  await start(seed);
  const original = storage.writes[0];
  for (const failure of ["root", "intermediate", "stop", "429"]) {
    let release;
    const app = cachedComponent(
      t,
      storage,
      {},
      {
        respond: (url) => {
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
    open(app);
    assert.equal(rows(app)[0].querySelector("a").textContent, "old");
    button(app.document, "开始寻找").click();
    assert.equal(rows(app).length, 0);
    if (failure === "stop") {
      await waitFor(() => release && rows(app).length === 1);
      assert.equal(
        storage.writes.length,
        1,
        "all results remain staged while work is pending",
      );
      button(app.document, "停止寻找").click();
    }
    await waitFor(() => button(app.document, "开始寻找"));
    if (release) {
      release(response(relationship("carol", ["late"])));
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(storage.writes.length, 1, failure);
    assert.equal([...storage.values.values()][0], original);
    assert.equal(app.document.querySelectorAll("[data-medal]").length, 0);
    assert.match(status(app), /未完成/);
  }
});

test("display information is shared across directions without modifying the opposite relationship snapshot", async (t) => {
  const storage = sharedStorage();
  const time = clock();
  const app = cachedComponent(
    t,
    storage,
    { "alice/friends": ["bob"], "bob/friends": ["zed"] },
    { configure: time.install },
  );
  open(app);
  await start(app);
  await time.tick(1000);
  const other = cachedComponent(
    t,
    storage,
    {},
    {
      configure: time.install,
      respond: (url) => {
        const path = new URL(url).pathname.slice(6);
        return response(
          relationship(
            path.split("/")[0],
            path === "alice/friends"
              ? ["bob"]
              : path === "bob/rev_friends"
                ? ["zed"]
                : [],
          )
            .replaceAll("候选显示名", "更新昵称")
            .replaceAll("custom_bob.jpg?r=7", "actual_new.jpg?r=99"),
        );
      },
    },
  );
  open(other);
  mode(other, "friends/rev_friends");
  await start(other);
  const refreshed = cachedComponent(t, storage, {});
  open(refreshed);
  assert.equal(rows(refreshed)[0].querySelector("a").textContent, "更新昵称");
  assert.equal(
    rows(refreshed)[0].querySelector("img").src,
    "https://lain.bgm.tv/pic/user/l/actual_new.jpg?r=99&hd=1",
  );
  const raw = JSON.parse(storage.writes.at(-1));
  assert.deepEqual(raw.relationships.bob.friends, {
    members: ["zed"],
    fetchedAt: Date.parse("2026-01-01T00:00:00Z"),
  });
  assert.deepEqual(raw.relationships.bob.rev_friends.members, ["zed"]);
  assert.equal(raw.relationships.zed, undefined);
});

test("write failures or missing storage and lock capabilities preserve old bytes and do not downgrade complete live results", async (t) => {
  const seedStorage = sharedStorage();
  const seed = cachedComponent(t, seedStorage, {
    "alice/friends": ["bob"],
    "bob/friends": ["old"],
  });
  open(seed);
  await start(seed);
  const failures = [
    (window, storage) => storage.failWrites(),
    (window) => {
      window.localStorage.getItem = undefined;
    },
    (window) => {
      window.localStorage.setItem = undefined;
    },
    (window) => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new Error("SecurityError");
        },
      });
    },
    (window) => {
      window.navigator.locks.request = undefined;
    },
    (window) => {
      Object.defineProperty(window.navigator, "locks", { value: undefined });
    },
    (window) => {
      window.navigator.locks.request = async () => {
        throw new Error("lock denied");
      };
    },
  ];
  for (const fail of failures) {
    const storage = sharedStorage();
    for (const [key, value] of seedStorage.values)
      storage.values.set(key, value);
    const app = cachedComponent(
      t,
      storage,
      { "alice/friends": ["bob"], "bob/friends": ["fresh"] },
      { configure: (window) => fail(window, storage) },
    );
    open(app);
    await start(app);
    assert.match(status(app), /^完成.*缓存保存失败.*旧缓存保留/);
    assert.equal(rows(app)[0].dataset.medal, "gold");
    assert.equal(rows(app)[0].querySelector("a").textContent, "fresh");
    assert.deepEqual([...storage.values], [...seedStorage.values]);
    assert.equal(storage.writes.length, 0);
  }
});

test("overlapping tab commits wait for the shared lock, then each merges the latest value rather than its initial read", async (t) => {
  const storage = sharedStorage();
  let unlock;
  const blocked = new Promise((resolve) => {
    unlock = resolve;
  });
  let waiting = false;
  storage.beforeLock(() => {
    waiting = true;
    return blocked;
  });
  const first = cachedComponent(t, storage, {
    "alice/friends": ["bob"],
    "bob/friends": ["x"],
  });
  const second = cachedComponent(t, storage, {
    "alice/rev_friends": ["carol"],
    "carol/rev_friends": ["y"],
  });
  open(first);
  open(second);
  mode(second, "rev_friends/rev_friends");
  button(first.document, "开始寻找").click();
  await waitFor(() => waiting);
  button(second.document, "开始寻找").click();
  await waitFor(
    () => second.requests.length === 2 && rows(second).length === 1,
  );
  assert.equal(storage.writes.length, 0);
  unlock();
  await waitFor(
    () =>
      button(first.document, "开始寻找") && button(second.document, "开始寻找"),
  );
  assert.equal(storage.writes.length, 2);
  const refreshed = cachedComponent(t, storage, {});
  open(refreshed);
  assert.equal(rows(refreshed)[0].querySelector("a").textContent, "x");
  mode(refreshed, "rev_friends/rev_friends");
  assert.equal(rows(refreshed)[0].querySelector("a").textContent, "y");
  assert.equal(refreshed.requests.length, 0);
});

test("unknown schemas, corrupt data and unusable timestamps are unknown rather than empty cache", async (t) => {
  const storage = sharedStorage();
  const seed = cachedComponent(t, storage, { "alice/friends": [] });
  open(seed);
  await start(seed);
  const key = [...storage.values.keys()][0];
  const valid = storage.values.get(key);
  const unusableTime = JSON.parse(valid);
  unusableTime.relationships.alice.friends.fetchedAt = 8640000000000001;
  const unknownVersion = JSON.parse(valid);
  unknownVersion.version = 99;
  for (const raw of [
    JSON.stringify(unusableTime),
    JSON.stringify(unknownVersion),
    "broken JSON",
    "null",
    '{"version":1,"relationships":null,"users":{}}',
  ]) {
    storage.values.set(key, raw);
    const app = cachedComponent(
      t,
      storage,
      {},
      {
        configure: (window) =>
          window.addEventListener("error", (event) => event.preventDefault()),
      },
    );
    open(app);
    assert.match(status(app), /缓存不足/);
    assert.equal(rows(app).length, 0);
    assert.equal(app.requests.length, 0);
  }
});

test("ordinary user identifiers that coincide with object property names retain complete snapshots", async (t) => {
  const storage = sharedStorage();
  const app = cachedComponent(t, storage, {
    "alice/friends": ["constructor"],
    "constructor/friends": ["zed"],
  });
  open(app);
  await start(app);
  const refreshed = cachedComponent(t, storage, {});
  open(refreshed);
  assert.equal(
    rows(refreshed)[0]?.querySelector("a").textContent,
    "候选显示名",
  );
  assert.equal(refreshed.requests.length, 0);
});

test("stopping while a completed scan waits for the write lock cancels its pending commit", async (t) => {
  const storage = sharedStorage();
  let unlock;
  let waiting = false;
  const held = new Promise((resolve) => {
    unlock = resolve;
  });
  storage.beforeLock(() => {
    waiting = true;
    return held;
  });
  const app = cachedComponent(t, storage, {
    "alice/friends": ["bob"],
    "bob/friends": ["zed"],
  });
  open(app);
  button(app.document, "开始寻找").click();
  await waitFor(() => waiting);
  button(app.document, "停止寻找").click();
  unlock();
  await waitFor(() => button(app.document, "开始寻找"));
  assert.equal(storage.writes.length, 0);
  assert.equal(storage.values.size, 0);
  assert.match(status(app), /已停止.*未完成/);
  assert.equal(app.document.querySelectorAll("[data-medal]").length, 0);
});
