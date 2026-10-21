import test from "node:test";
import assert from "node:assert/strict";
import { initialize } from "../src/entry.mjs";
import { component, link } from "./support/component.mjs";

test("HTTPS homepages append one discovery entry after existing network services", (t) => {
  for (const host of ["bgm.tv", "bangumi.tv", "chii.in"]) {
    const { window, document, requests } = component(t, {
      url: `https://${host}/user/1`,
    });
    initialize(window);
    const list = document.querySelector(".network_service");
    assert.equal(list.children.length, 2);
    assert.equal(
      list.lastElementChild.querySelector(".service").textContent,
      "SecondDegreeFriends",
    );
    assert.equal(
      link(document, "二度好友发现").closest("li"),
      list.lastElementChild,
    );
    assert.deepEqual(requests, []);
  }
});

test("relationship subpages and unrelated origins never inject discovery", (t) => {
  for (const url of [
    "https://bgm.tv/user/alice/friends",
    "https://bgm.tv/user/alice/rev_friends",
    "https://bgm.tv/user/alice/blog",
    "https://bgm.tv/user/",
    "https://example.com/user/alice",
    "http://bgm.tv/user/alice",
  ]) {
    const { document } = component(t, { url });
    assert.equal(link(document, "二度好友发现"), undefined, url);
  }
});

test("explicit current username takes priority over a numeric profile link, while numeric usernames remain valid", async (t) => {
  const { readFile } = await import("node:fs/promises");
  const html = await readFile(
    new URL("./fixtures/home.html", import.meta.url),
    "utf8",
  );
  const renamed = component(t, {
    html: html.replace('href="/user/alice"', 'href="/user/1"'),
  });
  assert.ok(link(renamed.document, "二度好友发现"));
  const numeric = component(t, {
    url: "https://bgm.tv/user/237",
    html: html.replaceAll("alice", "237"),
  });
  assert.ok(link(numeric.document, "二度好友发现"));
});

test("initialization after the DOM is ready remains idempotent", async (t) => {
  const { window, document } = component(t);
  await new Promise((resolve) =>
    window.addEventListener("load", resolve, { once: true }),
  );
  initialize(window);
  initialize(window);
  assert.equal(document.querySelector(".network_service").children.length, 2);
});
