import test from "node:test";
import assert from "node:assert/strict";
import { initialize } from "../src/entry.mjs";
import { component, link } from "./support/component.mjs";

test("HTTPS homepages append one discovery entry after existing network services", (t) => {
  for (const host of ["bgm.tv", "bangumi.tv", "chii.in"]) {
    const { window, document, requests } = component(t, {
      url: `https://${host}/user/alice`,
    });
    initialize(window);
    const list = document.querySelector(".network_service");
    assert.equal(list.children.length, 2);
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

test("the final homepage path identifies the user even without a title link, including numeric identifiers", async (t) => {
  const { readFile } = await import("node:fs/promises");
  const html = await readFile(
    new URL("./fixtures/home.html", import.meta.url),
    "utf8",
  );
  for (const title of [
    'href="/user/1"',
    'href="https://example.com/user/other"',
  ]) {
    const renamed = component(t, {
      html: html
        .replace('href="/user/alice"', title)
        .replace("@alice", "@other"),
    });
    assert.ok(link(renamed.document, "二度好友发现"));
  }
  const stripped = component(t, {
    configure(window) {
      const anchor = window.document.querySelector("#headerProfile .name > a");
      anchor.replaceWith(window.document.createTextNode(anchor.textContent));
    },
  });
  assert.ok(link(stripped.document, "二度好友发现"));
  const numeric = component(t, {
    url: "https://bgm.tv/user/237",
    html: html.replaceAll("alice", "237"),
  });
  assert.ok(link(numeric.document, "二度好友发现"));
});

test("homepage paths must match same-origin relationship links without identity fallback", (t) => {
  for (const url of ["https://bgm.tv/user/1", "https://bgm.tv/user/other"]) {
    const { document } = component(t, { url });
    assert.equal(link(document, "二度好友发现"), undefined);
  }
  for (const selector of [".navTabs a", "#friend a"]) {
    const { document } = component(t, {
      configure(window) {
        const anchor = window.document.querySelector(selector);
        anchor.href = anchor.href.replace(
          "https://bgm.tv",
          "https://example.com",
        );
      },
    });
    assert.equal(link(document, "二度好友发现"), undefined);
  }
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
