import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { readRelationships } from "../src/site.mjs";

const friends = await readFile(
  new URL("./fixtures/friends.html", import.meta.url),
  "utf8",
);
const base = "https://bgm.tv/user/alice/friends";

test("relationship entries retain the first structurally valid user link", async (t) => {
  const cases = [
    ["ordinary entry", friends],
    [
      "unrelated avatar before the user container",
      friends.replace(
        '<div class="userContainer">',
        '<a class="avatar" href="/user/decoy">无关链接</a><div class="userContainer">',
      ),
    ],
    [
      "strong avatar outside a user container",
      friends.replace(
        '<div class="userContainer">',
        '<strong><a class="avatar" href="/user/decoy">无关链接</a></strong><div class="userContainer">',
      ),
    ],
    [
      "avatar without a direct strong parent",
      friends.replace(
        "<strong>",
        '<strong><span><a class="avatar" href="/user/decoy">无关链接</a></span>',
      ),
    ],
    [
      "empty container before the valid container",
      friends.replace(
        '<div class="userContainer">',
        '<div class="userContainer"></div><div class="userContainer">',
      ),
    ],
    [
      "another matching link after the first valid link",
      friends.replace(
        "</a></strong>",
        '</a><a class="avatar" href="https://example.com/user/later">后续链接</a></strong>',
      ),
    ],
    [
      "the relationship entry is itself the user container",
      friends
        .replace(
          '<li class="user"><div class="userContainer">',
          '<li class="user userContainer">',
        )
        .replace("</strong></div></li>", "</strong></li>"),
    ],
  ];
  for (const [name, html] of cases) {
    await t.test(name, (t) => {
      const { window } = new JSDOM("");
      t.after(() => window.close());
      assert.deepEqual(
        [...readRelationships(window, html, "alice", base).values()],
        [
          {
            id: "bob",
            name: "鲍勃",
            avatar: "https://lain.bgm.tv/pic/user/l/custom_bob.jpg?r=7&hd=1",
          },
        ],
      );
    });
  }
});

test("relationship entries reject missing or invalid first user links", async (t) => {
  const cases = [
    [
      "avatar without a strong parent",
      friends.replace("<strong>", "<span>").replace("</strong>", "</span>"),
    ],
    [
      "strong parent without a direct user container parent",
      friends
        .replace("<strong>", "<section><strong>")
        .replace("</strong>", "</strong></section>"),
    ],
    [
      "foreign first user link before a valid later link",
      friends.replace(
        "<strong>",
        '<strong><a class="avatar" href="https://example.com/user/decoy">无关链接</a>',
      ),
    ],
  ];
  for (const [name, html] of cases) {
    await t.test(name, (t) => {
      const { window } = new JSDOM("");
      t.after(() => window.close());
      assert.throws(
        () => readRelationships(window, html, "alice", base),
        /无效的好友条目/,
      );
    });
  }
});
