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
import { sharedStorage, interceptTransactions } from "./support/storage.mjs";
import { clock } from "./support/clock.mjs";

const status = (app) =>
  app.document.querySelector('[role="status"]').textContent;
const open = (app) => link(app.document, "二度好友发现").click();
async function start(app) {
  button(app.document, "开始寻找").click();
  await waitFor(() => button(app.document, "开始寻找"));
}
function discovery(t, storage, configure, candidate = "old") {
  return component(t, {
    configure(window) {
      storage.install(window);
      configure?.(window);
    },
    respond(url) {
      const owner = new URL(url).pathname.split("/")[2];
      return response(
        relationship(owner, owner === "alice" ? ["bob"] : [candidate]),
      );
    },
  });
}
function delayFirstOpen(indexedDB) {
  let release;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  let first = true;
  const gate = {
    release,
    waiting: false,
    indexedDB: {
      open(...args) {
        const request = indexedDB.open(...args);
        if (!first) return request;
        first = false;
        return new Proxy(request, {
          get(target, key) {
            return Reflect.get(target, key, target);
          },
          set(target, key, callback) {
            target[key] =
              key === "onsuccess"
                ? (event) => {
                    gate.waiting = true;
                    blocked.then(() => callback.call(target, event));
                  }
                : callback;
            return true;
          },
        });
      },
    },
  };
  return gate;
}

test("a delayed cache lookup cannot overwrite a newer mode or completed live scan", async (t) => {
  for (const action of ["mode", "scan"]) {
    const storage = sharedStorage();
    const seed = discovery(t, storage);
    open(seed);
    await start(seed);
    const gate = delayFirstOpen(storage.indexedDB);
    const app = discovery(
      t,
      storage,
      (window) => {
        window.indexedDB = gate.indexedDB;
      },
      "fresh",
    );
    open(app);
    await waitFor(() => gate.waiting);
    if (action === "mode") {
      const select = app.document.querySelector("select");
      select.value = "rev_friends/rev_friends";
      select.dispatchEvent(new app.window.Event("change"));
      await waitFor(() => /缓存不足/.test(status(app)));
    } else await start(app);
    const expected = status(app);
    gate.release();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(status(app), expected);
    assert.deepEqual(
      [...app.document.querySelectorAll("ol > li")].map(
        (row) => row.dataset.userId,
      ),
      action === "mode" ? [] : ["fresh"],
    );
  }
});

test("stopping while a completed scan waits for transaction completion preserves the previous cache", async (t) => {
  const storage = sharedStorage();
  const seed = discovery(t, storage);
  open(seed);
  await start(seed);
  let waiting = false;
  let release = false;
  const app = discovery(
    t,
    storage,
    (window) => {
      window.indexedDB = interceptTransactions(
        storage.indexedDB,
        (transaction, mode) => {
          if (mode !== "readwrite") return;
          waiting = true;
          const store = transaction.objectStore(
            transaction.objectStoreNames[0],
          );
          const keepAlive = () => {
            const request = store.get("keep-alive");
            request.onsuccess = () => {
              if (!release) keepAlive();
            };
          };
          keepAlive();
        },
      );
    },
    "fresh",
  );
  open(app);
  button(app.document, "开始寻找").click();
  await waitFor(() => waiting);
  button(app.document, "停止寻找").click();
  release = true;
  await waitFor(() => button(app.document, "开始寻找"));
  assert.match(status(app), /已停止.*未完成/);
  assert.equal(app.document.querySelectorAll("[data-medal]").length, 0);
  const refreshed = discovery(t, storage);
  open(refreshed);
  await waitFor(() => /^已载入缓存 · /.test(status(refreshed)));
  assert.equal(
    refreshed.document.querySelector("ol > li").dataset.userId,
    "old",
  );
  assert.equal(refreshed.requests.length, 0);
});

test("a failed asynchronous cache read cannot hide rate-limit cooldown after a mode change", async (t) => {
  const time = clock();
  const app = component(t, {
    configure(window) {
      time.install(window);
      window.indexedDB = undefined;
    },
    respond: () => response("", { ok: false, status: 429 }),
  });
  open(app);
  await start(app);
  const select = app.document.querySelector("select");
  select.value = "friends/rev_friends";
  select.dispatchEvent(new app.window.Event("change"));
  await time.tick(0);
  assert.match(status(app), /429.*冷却/);
  assert.match(
    app.document.querySelector(".sdf-empty").textContent,
    /缓存读取失败/,
  );
  assert.equal(button(app.document, "开始寻找").disabled, true);
  assert.equal(app.requests.length, 1);
});
