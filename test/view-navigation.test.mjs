import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { mountView } from "../src/view.mjs";
import { component, link, button, waitFor } from "./support/component.mjs";

const outline = (window, element) => window.getComputedStyle(element).outline;
const key = (window, element, value, options = {}) =>
  element.dispatchEvent(
    new window.KeyboardEvent("keydown", {
      key: value,
      bubbles: true,
      ...options,
    }),
  );
const pointer = (window, element, type, pointerType = "mouse") => {
  const event = new window.Event(type, { bubbles: true });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  element.dispatchEvent(event);
};

test("pointer opening, selecting, hovering and closing never show focus rings", (t) => {
  const { window, document } = component(t);
  const entry = link(document, "二度好友发现");
  pointer(window, entry, "pointerdown");
  entry.click();
  const start = button(document, "开始寻找");
  assert.equal(document.activeElement, start);
  assert.equal(outline(window, start), "none");
  const mode = document.querySelector("select");
  pointer(window, mode, "pointerdown");
  mode.focus();
  mode.click();
  assert.equal(outline(window, mode), "none");
  pointer(window, start, "pointermove");
  assert.equal(outline(window, mode), "none");
  button(document, "关闭").click();
  assert.equal(document.activeElement, entry);
  assert.equal(outline(window, entry), "none");
});

test("keyboard rings follow focus, hide on mouse or touch, and return with keyboard navigation", (t) => {
  const { window, document } = component(t);
  const entry = link(document, "二度好友发现");
  entry.focus();
  key(window, entry, "Tab");
  assert.match(outline(window, entry), /solid/);
  key(window, entry, "Enter");
  entry.click();
  const start = button(document, "开始寻找");
  assert.equal(document.activeElement, start);
  assert.match(outline(window, start), /solid/);
  const mode = document.querySelector("select");
  key(window, start, "Tab");
  mode.focus();
  assert.match(outline(window, mode), /solid/);
  pointer(window, start, "pointermove");
  assert.equal(outline(window, mode), "none");
  key(window, mode, "ArrowDown", { altKey: true });
  assert.match(outline(window, mode), /solid/);
  pointer(window, mode, "pointerdown", "touch");
  assert.equal(
    document.activeElement,
    mode,
    "pointer use must not blur controls",
  );
  assert.equal(outline(window, mode), "none");
  key(window, mode, "Shift");
  assert.equal(outline(window, mode), "none");
  key(window, mode, "Escape");
  assert.equal(document.activeElement, entry);
  assert.match(outline(window, entry), /solid/);
});

async function cachedView(t, total, intermediateCount = 80) {
  const { window } = new JSDOM('<a href="#">二度好友发现</a>', {
    url: "https://bgm.tv/user/alice",
  });
  t.after(() => window.close());
  const { document } = window;
  const contributors = Array.from({ length: intermediateCount }, (_, i) => ({
    id: `middle-${i}`,
    name: `好友 ${i}`,
    avatar: "avatar.png",
  }));
  const results = Array.from({ length: total }, (_, i) => ({
    id: `candidate-${i}`,
    name: `候选 ${i}`,
    avatar: "avatar.png",
    count: contributors.length,
    contributors,
  }));
  mountView(
    window,
    document.querySelector("a"),
    () => assert.fail("browsing must not start a scan"),
    async () => ({ results }),
  );
  link(document, "二度好友发现").click();
  await waitFor(() => document.querySelectorAll("ol > li").length > 0);
  return { document, window };
}

test("loading the final candidate batch preserves old rows and focuses its first new candidate", async (t) => {
  const { document } = await cachedView(t, 100);
  const oldRows = [...document.querySelectorAll("ol > li")];
  const more = button(document, "显示更多候选用户");
  more.focus();
  more.click();
  assert.equal(document.querySelectorAll("ol > li").length, 100);
  const rows = [...document.querySelectorAll("ol > li")];
  oldRows.forEach((row, index) => assert.equal(rows[index], row));
  assert.equal(
    document.activeElement.getAttribute("href"),
    "/user/candidate-50",
  );
  assert.equal(button(document, "显示更多候选用户"), undefined);
});

test("loading the final avatar batch preserves old avatars and does not steal unrelated focus", async (t) => {
  const { document } = await cachedView(t, 1);
  button(document, "展开").click();
  const oldAvatars = [...document.querySelectorAll(".sdf-contributors a")];
  const more = button(document, "显示更多头像");
  const toggle = button(document, "收起");
  toggle.focus();
  more.click();
  const avatars = [...document.querySelectorAll(".sdf-contributors a")];
  assert.equal(avatars.length, 80);
  oldAvatars.forEach((avatar, index) => assert.equal(avatars[index], avatar));
  assert.equal(document.activeElement, toggle);
  assert.equal(button(document, "显示更多头像"), undefined);
});
