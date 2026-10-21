import test from "node:test";
import assert from "node:assert/strict";
import { component, link, button } from "./support/component.mjs";

test("opening discovery shows friends of friends without fetching relationships", (t) => {
  const { document, requests } = component(t);
  link(document, "二度好友发现").click();
  const dialog = document.querySelector('[role="dialog"]');
  assert.ok(dialog && !dialog.hidden);
  assert.match(dialog.textContent, /好友的好友/);
  assert.ok(button(document, "开始寻找"));
  assert.deepEqual(requests, []);
});

test("basic dialog can be closed and reopened without relationship requests", (t) => {
  const { document, requests } = component(t);
  link(document, "二度好友发现").click();
  button(document, "关闭").click();
  assert.ok(document.querySelector('[role="dialog"]').hidden);
  link(document, "二度好友发现").click();
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 1);
  assert.equal(document.querySelector('[role="dialog"]').hidden, false);
  assert.deepEqual(requests, []);
});
