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
