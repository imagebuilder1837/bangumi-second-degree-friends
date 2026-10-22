import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { relationshipCache } from "../src/cache.mjs";
import { interceptWrites } from "./support/storage.mjs";

const home = { id: "alice" };
const signal = () => new AbortController().signal;
function environment(indexedDB = new IDBFactory()) {
  return {
    indexedDB,
    get localStorage() {
      throw new Error("legacy storage must not be accessed");
    },
  };
}
function staged(members, fetchedAt = 1) {
  return {
    relationships: {
      alice: { friends: { members: ["bob"], fetchedAt } },
      bob: { friends: { members, fetchedAt } },
    },
    users: Object.fromEntries(
      members.map((id) => [
        id,
        {
          name: `Name ${id}`,
          avatar: "https://lain.bgm.tv/avatar.jpg",
          fetchedAt,
        },
      ]),
    ),
  };
}

test("overlapping cached relationships rebuild independent complete rankings and counted intermediates", async () => {
  const cache = relationshipCache(environment(), home);
  await cache.commit(
    {
      relationships: {
        alice: { friends: { members: ["bob", "carol", "dana"], fetchedAt: 1 } },
        bob: {
          friends: {
            members: ["alice", "carol", "zed", "alpha"],
            fetchedAt: 2,
          },
        },
        carol: {
          friends: {
            members: ["zed", "beta"],
            fetchedAt: 3,
            missingIdentifiers: 1,
          },
        },
        dana: { friends: { skipped: true, fetchedAt: 4 } },
      },
      users: { zed: { name: "Zed", avatar: "", fetchedAt: 2 } },
    },
    signal(),
  );
  const first = await cache.lookup("friends/friends");
  assert.equal(first.complete, true);
  assert.deepEqual(
    first.results.map((user) => [
      user.id,
      user.count,
      user.contributors.map((middle) => middle.id),
    ]),
    [
      ["zed", 2, ["bob", "carol"]],
      ["alpha", 1, ["bob"]],
      ["beta", 1, ["carol"]],
    ],
  );
  assert.equal(first.results[0].name, "Zed");
  assert.deepEqual(
    first.skipped.map((item) => item.id),
    ["carol", "dana"],
  );
  assert.equal(first.skipped[0].missingIdentifiers, 1);
  first.results[0].count = 99;
  first.results[0].contributors[0].name = "changed";
  const second = await cache.lookup("friends/friends");
  assert.equal(second.results[0].count, 2);
  assert.equal(second.results[0].contributors[0].name, "bob");
});

test("a relationship snapshot larger than localStorage survives a fresh cache instance without truncation", async () => {
  const window = environment();
  const members = Array.from({ length: 66534 }, (_, i) => `user${i}`);
  const data = staged(members);
  for (const user of Object.values(data.users)) {
    user.avatar =
      "https://lain.bgm.tv/pic/user/l/000/00/00/avatar.jpg?r=7&hd=1";
    user.name += " 用户展示名称测试";
  }
  assert.ok(JSON.stringify(data).length > 9_144_809);
  await relationshipCache(window, home).commit(data, signal());
  const cached = await relationshipCache(window, home).lookup(
    "friends/friends",
  );
  assert.equal(cached.results.length, 66534);
  assert.equal(
    cached.results.find((user) => user.id === "user66533").name,
    "Name user66533 用户展示名称测试",
  );
  assert.equal(
    cached.results.find((user) => user.id === "user0").avatar,
    "https://lain.bgm.tv/pic/user/l/000/00/00/avatar.jpg?r=7&hd=1",
  );
});

test("a write error after requests were queued rolls back all snapshots and display information", async () => {
  const window = environment();
  await relationshipCache(window, home).commit(staged(["old"]), signal());
  const faulty = environment(
    interceptWrites(window.indexedDB, (put, ...args) => {
      put(...args);
      throw new DOMException("capacity", "QuotaExceededError");
    }),
  );
  await assert.rejects(
    relationshipCache(faulty, home).commit(staged(["new"], 2), signal()),
    { name: "QuotaExceededError" },
  );
  const cached = await relationshipCache(window, home).lookup(
    "friends/friends",
  );
  assert.deepEqual(
    cached.results.map((user) => [user.id, user.name]),
    [["old", "Name old"]],
  );
  assert.equal(cached.latest, 1);
});

test("concurrent cache instances merge the latest committed snapshots and preserve unrelated directions", async () => {
  const window = environment();
  const first = relationshipCache(window, home);
  const second = relationshipCache(window, home);
  const reverse = {
    relationships: { alice: { rev_friends: { members: [], fetchedAt: 2 } } },
    users: {},
  };
  await Promise.all([
    first.commit(staged(["fresh"], 3), signal()),
    second.commit(reverse, signal()),
  ]);
  const older = staged(["old"], 1);
  older.relationships.unrelated = { friends: { members: [], fetchedAt: 1 } };
  await first.commit(older, signal());
  const refreshed = relationshipCache(window, home);
  assert.deepEqual(
    (await refreshed.lookup("friends/friends")).results.map((user) => user.id),
    ["fresh"],
  );
  assert.deepEqual(
    (await refreshed.lookup("rev_friends/rev_friends")).results,
    [],
  );
  assert.deepEqual(
    (
      await relationshipCache(window, { id: "unrelated" }).lookup(
        "friends/friends",
      )
    ).results,
    [],
  );
});

test("a later snapshot replaces removed members in the same clock tick and refreshes shared display information", async () => {
  const window = environment();
  const cache = relationshipCache(window, home);
  await cache.commit(staged(["removed", "kept"]), signal());
  const updated = staged(["kept"]);
  updated.users.kept.name = "Updated name";
  await cache.commit(updated, signal());
  const result = await relationshipCache(window, home).lookup(
    "friends/friends",
  );
  assert.deepEqual(
    result.results.map((user) => [user.id, user.name]),
    [["kept", "Updated name"]],
  );
});

test("cancellation after a write was queued aborts the transaction instead of saving partial work", async () => {
  const window = environment();
  await relationshipCache(window, home).commit(staged(["old"]), signal());
  const controller = new AbortController();
  const cancelling = environment(
    interceptWrites(window.indexedDB, (put, ...args) => {
      const request = put(...args);
      controller.abort();
      return request;
    }),
  );
  await assert.rejects(
    relationshipCache(cancelling, home).commit(
      staged(["new"], 2),
      controller.signal,
    ),
    { name: "AbortError" },
  );
  const cached = await relationshipCache(window, home).lookup(
    "friends/friends",
  );
  assert.deepEqual(
    cached.results.map((user) => user.id),
    ["old"],
  );
  const alreadyCancelled = new AbortController();
  alreadyCancelled.abort();
  await assert.rejects(
    relationshipCache(window, home).commit(
      staged(["new"], 2),
      alreadyCancelled.signal,
    ),
    { name: "AbortError" },
  );
});

test("missing dependencies are unknown while explicit empty sets and property-like identifiers remain valid", async () => {
  for (const [direction, excluded] of [
    ["friends", "friends"],
    ["friends", "rev_friends"],
    ["rev_friends", "friends"],
    ["rev_friends", "rev_friends"],
  ]) {
    const window = environment();
    const cache = relationshipCache(window, home);
    assert.equal(await cache.lookup(`${direction}/${excluded}`), undefined);
    await cache.commit(
      {
        relationships: {
          alice: { [direction]: { members: ["constructor"], fetchedAt: 1 } },
        },
        users: {},
      },
      signal(),
    );
    assert.equal(await cache.lookup(`${direction}/${excluded}`), undefined);
    const root = { [direction]: { members: ["constructor"], fetchedAt: 2 } };
    if (excluded !== direction) root[excluded] = { members: [], fetchedAt: 1 };
    await cache.commit(
      {
        relationships: {
          alice: root,
          constructor: { [excluded]: { members: ["zed"], fetchedAt: 1 } },
        },
        users: {},
      },
      signal(),
    );
    const result = await cache.lookup(`${direction}/${excluded}`);
    assert.deepEqual(
      result.results.map((user) => user.id),
      ["zed"],
    );
    assert.equal(result.earliest, 1);
    assert.equal(result.latest, 2);
    await cache.commit(
      {
        relationships: {
          constructor: { [excluded]: { members: [], fetchedAt: 3 } },
        },
        users: {},
      },
      signal(),
    );
    assert.deepEqual(
      (await cache.lookup(`${direction}/${excluded}`)).results,
      [],
    );
  }
});

test("skip observations persist independently by direction and replace rather than reuse older relationships", async () => {
  const window = environment();
  const cache = relationshipCache(window, home);
  await cache.commit(staged(["old"]), signal());
  await cache.commit(
    {
      relationships: {
        alice: { rev_friends: { members: [], fetchedAt: 2 } },
        bob: {
          friends: { skipped: true, fetchedAt: 2 },
          rev_friends: { members: ["reverse"], fetchedAt: 2 },
        },
      },
      users: {},
    },
    signal(),
  );
  const fresh = relationshipCache(window, home);
  const skipped = await fresh.lookup("friends/friends");
  assert.deepEqual(skipped.results, []);
  const expectedSkip = {
    id: "bob",
    name: "bob",
    avatar: "",
    direction: "friends",
    reason: "已注销用户的关系列表不可访问",
  };
  assert.deepEqual(skipped.skipped, [expectedSkip]);
  assert.equal(skipped.latest, 2);
  const reverse = await fresh.lookup("friends/rev_friends");
  assert.deepEqual(
    reverse.results.map((u) => u.id),
    ["reverse"],
  );
  assert.deepEqual(reverse.skipped, []);
  await fresh.commit(staged(["stale"], 1), signal());
  assert.deepEqual((await fresh.lookup("friends/friends")).skipped, [
    expectedSkip,
  ]);
  await fresh.commit(staged(["restored"], 3), signal());
  const restored = await fresh.lookup("friends/friends");
  assert.deepEqual(
    restored.results.map((u) => u.id),
    ["restored"],
  );
  assert.deepEqual(restored.skipped, []);
  // A skipped observation is insufficient for the home or exclusion relationship.
  assert.equal(
    await relationshipCache(window, { id: "bob" }).lookup("friends/friends"),
    undefined,
  );
});
