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
import {
  sharedStorage,
  interceptWrites,
  interceptTransactions,
} from "./support/storage.mjs";
import { createRelationshipStore } from "../vendor/bangumi-relationship-store/src/index.mjs";

test("unchanged shared profiles are saved once, but A -> B -> A is preserved", async (t) => {
  const storage = sharedStorage();
  const names = [];
  const gates = new Map();
  const app = component(t, {
    configure(window) {
      window.indexedDB = interceptWrites(
        storage.indexedDB,
        (put, value, key) => {
          if (key === "shared") names.push(value.value.name);
          return put(value, key);
        },
      );
    },
    respond(url) {
      const owner = new URL(url).pathname.split("/")[2];
      if (owner === "alice")
        return response(relationship(owner, ["bob", "carol", "dana", "erin"]));
      return new Promise((resolve) => gates.set(owner, resolve));
    },
  });
  link(app.document, "二度好友发现").click();
  button(app.document, "开始寻找").click();
  await waitFor(() => gates.size === 4);
  const store = createRelationshipStore({ indexedDB: storage.indexedDB });
  for (const [owner, name] of [
    ["bob", "A"],
    ["carol", "A"],
    ["dana", "B"],
    ["erin", "A"],
  ]) {
    gates.get(owner)(
      response(
        relationship(owner, ["shared"]).replaceAll(">shared<", `>${name}<`),
      ),
    );
    let data;
    do {
      data = await store.read({ relationships: [[owner, "friends"]] });
    } while (!data.relationships[owner]);
  }
  await waitFor(() => button(app.document, "开始寻找"));
  assert.deepEqual(names, ["A", "B", "A"]);
  assert.equal(
    (await store.read({ users: ["shared"] })).users.shared.name,
    "A",
  );
  assert.equal(app.document.querySelector(".count").textContent, "4");
});

test("saving failure preserves earlier observations and does not fail the relationship scan", async (t) => {
  const storage = sharedStorage();
  let writes = 0;
  const app = component(t, {
    configure(window) {
      window.indexedDB = interceptTransactions(
        storage.indexedDB,
        (tx, mode) => {
          if (mode === "readwrite" && ++writes === 2)
            queueMicrotask(() => tx.abort());
        },
      );
    },
    respond(url) {
      const owner = new URL(url).pathname.split("/")[2];
      return response(
        relationship(owner, owner === "alice" ? ["bob", "carol"] : ["zed"]),
      );
    },
  });
  link(app.document, "二度好友发现").click();
  button(app.document, "开始寻找").click();
  await waitFor(() => button(app.document, "开始寻找"));
  assert.match(
    app.document.querySelector('[role="status"]').textContent,
    /^完成.*失败 0.*缓存保存失败.*部分观察已保存/,
  );
  assert.equal(app.document.querySelectorAll("[data-medal]").length, 1);
  assert.equal(writes, 2);
  const data = await createRelationshipStore({
    indexedDB: storage.indexedDB,
  }).read({
    relationships: [
      ["alice", "friends"],
      ["bob", "friends"],
      ["carol", "friends"],
    ],
  });
  assert.deepEqual(data.relationships.alice.friends.members, ["bob", "carol"]);
  assert.equal(data.relationships.bob, undefined);
  assert.equal(data.relationships.carol, undefined);
});

test("medals wait for the last observation transaction even after all relationships arrive", async (t) => {
  const storage = sharedStorage();
  let release = false;
  let writes = 0;
  const app = component(t, {
    configure(window) {
      window.indexedDB = interceptTransactions(
        storage.indexedDB,
        (tx, mode) => {
          if (mode !== "readwrite" || ++writes !== 2) return;
          const store = tx.objectStore("users");
          const hold = () => {
            const request = store.get("hold");
            request.onsuccess = () => {
              if (!release) hold();
            };
          };
          hold();
        },
      );
    },
    respond(url) {
      const owner = new URL(url).pathname.split("/")[2];
      return response(
        relationship(owner, owner === "alice" ? ["bob"] : ["zed"]),
      );
    },
  });
  link(app.document, "二度好友发现").click();
  button(app.document, "开始寻找").click();
  await waitFor(
    () => writes === 2 && app.document.querySelector("progress").value === 1,
  );
  assert.equal(app.document.querySelectorAll("[data-medal]").length, 0);
  assert.ok(button(app.document, "停止寻找"));
  release = true;
  await waitFor(() => button(app.document, "开始寻找"));
  assert.equal(app.document.querySelectorAll("[data-medal]").length, 1);
});

test("a successful observation is shared before another request finishes and survives stopping", async (t) => {
  const storage = sharedStorage();
  let release;
  const app = component(t, {
    configure: storage.install,
    respond(url) {
      const owner = new URL(url).pathname.split("/")[2];
      if (owner === "alice")
        return response(relationship(owner, ["bob", "carol"]));
      if (owner === "bob") return response(relationship(owner, ["zed"]));
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  });
  link(app.document, "二度好友发现").click();
  button(app.document, "开始寻找").click();
  await waitFor(() => release && app.document.querySelector("ol > li"));
  const store = createRelationshipStore({ indexedDB: storage.indexedDB });
  let observed;
  const deadline = performance.now() + 1000;
  do {
    observed = await store.read({ relationships: [["bob", "friends"]] });
    if (observed.relationships.bob) break;
  } while (performance.now() < deadline);
  assert.deepEqual(observed.relationships.bob?.friends.members, ["zed"]);
  button(app.document, "停止寻找").click();
  release(response(relationship("carol", ["late"])));
  await waitFor(() => button(app.document, "开始寻找"));
  assert.deepEqual(
    (await store.read({ relationships: [["bob", "friends"]] })).relationships
      .bob.friends.members,
    ["zed"],
  );
  assert.equal(app.document.querySelectorAll("[data-medal]").length, 0);
});
