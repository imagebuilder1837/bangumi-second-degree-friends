import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { mountView } from "../src/view.mjs";
import { button, waitFor } from "./support/component.mjs";

function view(t, scan, cached) {
  const { window } = new JSDOM('<a href="#">发现</a>', {
    url: "https://bgm.tv/user/alice",
  });
  t.after(() => window.close());
  const { document } = window;
  const entry = document.querySelector("a");
  mountView(window, entry, scan, cached);
  entry.click();
  return { window, document, entry, dialog: document.querySelector("section") };
}

const candidate = (id, count = 1) => ({
  id,
  name: id,
  avatar: "",
  count,
  contributors: [],
});
const skipped = [
  { id: "bob", name: "Bob", direction: "friends", reason: "异常" },
];

test("hidden scans retain only the latest results and completion for reopening", async (t) => {
  let options;
  let finish;
  const app = view(
    t,
    (_mode, value) => {
      options = value;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
    async () => undefined,
  );
  await waitFor(() => /缓存不足/.test(app.dialog.textContent));
  button(app.document, "开始寻找").click();
  const counts = {
    processed: 1,
    total: 2,
    succeeded: 1,
    failed: 0,
    skipped: 0,
  };
  options.update([candidate("first")], "1/2", counts, [], []);
  const oldRow = app.document.querySelector("ol > li");
  button(app.document, "关闭").click();
  assert.equal(options.signal.aborted, false);
  options.update(
    [candidate("second")],
    "2/2",
    { ...counts, processed: 2 },
    skipped,
    [],
  );
  assert.equal(app.document.querySelector("ol > li"), oldRow);
  assert.equal(app.document.querySelectorAll(".sdf-detail-row").length, 0);
  finish({
    results: [candidate("final", 2)],
    complete: true,
    skipped,
    failures: [],
    counts: { ...counts, processed: 2 },
    progress: "2/2",
  });
  await waitFor(() => button(app.document, "开始寻找"));
  assert.equal(app.dialog.hidden, true);
  assert.equal(app.document.querySelector("ol > li"), oldRow);
  app.entry.click();
  assert.match(
    app.dialog.querySelector('[role="status"]').textContent,
    /^完成/,
  );
  const row = app.document.querySelector("ol > li");
  assert.equal(row.dataset.userId, "final");
  assert.equal(row.dataset.medal, "gold");
  assert.equal(row.querySelector(".count").textContent, "2");
  assert.equal(app.document.querySelectorAll(".sdf-detail-row").length, 1);
});

test("a late cache result or error cannot replace a hidden scan result on reopening", async (t) => {
  for (const fails of [false, true]) {
    let settle;
    const app = view(
      t,
      async () => ({
        results: [candidate("fresh")],
        complete: true,
        skipped: [],
        failures: [],
        counts: { processed: 1, total: 1, succeeded: 1, failed: 0, skipped: 0 },
        progress: "1/1",
      }),
      () =>
        new Promise((resolve, reject) => {
          settle = () =>
            fails
              ? reject(new Error("late error"))
              : resolve({ results: [candidate("stale")], skipped });
        }),
    );
    button(app.document, "开始寻找").click();
    button(app.document, "关闭").click();
    await waitFor(() =>
      /^完成/.test(app.dialog.querySelector('[role="status"]').textContent),
    );
    settle();
    await new Promise((resolve) => setImmediate(resolve));
    app.entry.click();
    assert.equal(app.document.querySelector("ol > li").dataset.userId, "fresh");
    assert.equal(app.document.querySelectorAll(".sdf-detail-row").length, 0);
    assert.match(
      app.dialog.querySelector('[role="status"]').textContent,
      /^完成/,
    );
  }
});

test("cache processing finishes while hidden and reopening paints once without another read", async (t) => {
  let resolve;
  let reads = 0;
  const app = view(
    t,
    () => assert.fail("must not scan"),
    () => {
      reads++;
      return new Promise((done) => {
        resolve = done;
      });
    },
  );
  button(app.document, "关闭").click();
  const mutations = [];
  const observer = new app.window.MutationObserver((records) =>
    mutations.push(...records),
  );
  t.after(() => observer.disconnect());
  for (const node of app.document.querySelectorAll("ol, .sdf-detail-body"))
    observer.observe(node, { childList: true, subtree: true });
  resolve({ results: [candidate("cached")], skipped });
  await waitFor(() => /已载入缓存/.test(app.dialog.textContent));
  assert.equal(app.dialog.hidden, true);
  assert.equal(
    mutations.length,
    0,
    "hidden results and details must not be rebuilt",
  );
  app.entry.click();
  assert.equal(reads, 1);
  assert.equal(app.document.querySelector("ol > li").dataset.userId, "cached");
  assert.equal(app.document.querySelectorAll(".sdf-detail-row").length, 1);
  const row = app.document.querySelector("ol > li");
  button(app.document, "关闭").click();
  app.entry.click();
  assert.equal(
    app.document.querySelector("ol > li"),
    row,
    "unchanged results need no repaint",
  );
});
