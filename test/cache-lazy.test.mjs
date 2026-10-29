import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { component, link, button, waitFor } from "./support/component.mjs";
import { sharedStorage, interceptTransactions } from "./support/storage.mjs";
import { relationshipCache } from "../src/cache.mjs";
import { createRelationshipStore } from "../vendor/bangumi-relationship-store/src/index.mjs";

test("failed profile pagination retains rows and medals and retries without network", async (t) => {
  const storage = sharedStorage();
  const ids = Array.from(
    { length: 60 },
    (_, i) => `user${String(i).padStart(2, "0")}`,
  );
  await createRelationshipStore({ indexedDB: storage.indexedDB }).commit({
    relationships: {
      alice: {
        friends: { status: "available", members: ["bob"], fetchedAt: 1 },
      },
      bob: { friends: { status: "available", members: ids, fetchedAt: 1 } },
    },
    users: Object.fromEntries(
      ids.map((id) => [id, { name: `Name ${id}`, avatar: "", fetchedAt: 1 }]),
    ),
  });
  let fail = false;
  const app = component(t, {
    configure(window) {
      window.indexedDB = interceptTransactions(
        storage.indexedDB,
        (tx, mode) => {
          if (fail && mode === "readonly") queueMicrotask(() => tx.abort());
        },
      );
    },
  });
  link(app.document, "二度好友发现").click();
  await waitFor(() => app.document.querySelector("[data-medal]"));
  const row = app.document.querySelector("ol > li");
  fail = true;
  button(app.document, "显示更多候选用户").click();
  await waitFor(() =>
    /资料读取失败/.test(
      app.document.querySelector('[role="status"]').textContent,
    ),
  );
  assert.equal(app.document.querySelectorAll("ol > li").length, 50);
  assert.equal(app.document.querySelector("ol > li"), row);
  assert.equal(app.document.querySelectorAll("[data-medal]").length, 3);
  fail = false;
  button(app.document, "显示更多候选用户").click();
  await waitFor(() => app.document.querySelectorAll("ol > li").length === 60);
  assert.equal(
    app.document.querySelector('[data-user-id="user50"] a').textContent,
    "Name user50",
  );
  assert.deepEqual(app.requests, []);
  assert.match(
    app.document.querySelector('[role="status"]').textContent,
    /^已载入缓存/,
  );
});

test("a late profile page cannot append rows or errors after changing mode", async (t) => {
  const storage = sharedStorage();
  const ids = Array.from(
    { length: 60 },
    (_, i) => `user${String(i).padStart(2, "0")}`,
  );
  await createRelationshipStore({ indexedDB: storage.indexedDB }).commit({
    relationships: {
      alice: {
        friends: { status: "available", members: ["bob"], fetchedAt: 1 },
      },
      bob: { friends: { status: "available", members: ids, fetchedAt: 1 } },
    },
  });
  let gate = false;
  let waiting = false;
  let release = false;
  const app = component(t, {
    configure(window) {
      window.indexedDB = interceptTransactions(
        storage.indexedDB,
        (tx, mode) => {
          if (!gate || mode !== "readonly") return;
          gate = false;
          waiting = true;
          const s = tx.objectStore("users");
          const hold = () => {
            const q = s.get("hold");
            q.onsuccess = () => {
              if (!release) hold();
            };
          };
          hold();
        },
      );
    },
  });
  link(app.document, "二度好友发现").click();
  await waitFor(() => app.document.querySelectorAll("ol > li").length === 50);
  gate = true;
  button(app.document, "显示更多候选用户").click();
  await waitFor(() => waiting);
  const mode = app.document.querySelector(".sdf-panel select");
  mode.value = "rev_friends/rev_friends";
  mode.dispatchEvent(new app.window.Event("change"));
  release = true;
  await waitFor(() =>
    /缓存不足/.test(app.document.querySelector('[role="status"]').textContent),
  );
  assert.equal(app.document.querySelectorAll("ol > li").length, 0);
  assert.deepEqual(app.requests, []);
});

test("complete rankings read only first-page profiles and hydrate later pages explicitly", async () => {
  const indexedDB = new IDBFactory();
  const store = createRelationshipStore({ indexedDB });
  const ids = Array.from(
    { length: 60 },
    (_, i) => `user${String(i).padStart(2, "0")}`,
  );
  await store.commit({
    relationships: {
      alice: {
        friends: { status: "available", members: ["bob"], fetchedAt: 1 },
      },
      bob: { friends: { status: "available", members: ids, fetchedAt: 1 } },
    },
    users: Object.fromEntries(
      ["bob", ...ids].map((id) => [
        id,
        { name: `Name ${id}`, avatar: "", fetchedAt: 1 },
      ]),
    ),
  });
  const cache = relationshipCache({ indexedDB }, { id: "alice" });
  const result = await cache.lookup("friends/friends");
  assert.equal(result.results.length, 60);
  assert.equal(result.results[0].name, "Name user00");
  assert.equal(result.results[0].contributors[0].name, "Name bob");
  assert.equal(result.results[50].name, "user50");
  await result.hydrate(result.results.slice(50));
  assert.equal(result.results[50].name, "Name user50");
});
