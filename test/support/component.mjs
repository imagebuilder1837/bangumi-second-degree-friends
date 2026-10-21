import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { initialize } from "../../src/entry.mjs";
import { sharedStorage } from "./storage.mjs";

const home = await readFile(
  new URL("../fixtures/home.html", import.meta.url),
  "utf8",
);

export function component(
  t,
  { url = "https://bgm.tv/user/alice", html = home, respond, configure } = {},
) {
  const dom = new JSDOM(html, { url });
  dom.window.CHOBITS_UID = 999;
  dom.window.CHOBITS_USERNAME = "visitor";
  t.after(() => dom.window.close());
  const requests = [];
  dom.window.fetch = async (url, options) => {
    requests.push(String(url));
    if (!respond) throw new Error("Unexpected network request");
    return respond(String(url), options);
  };
  sharedStorage().install(dom.window);
  configure?.(dom.window);
  initialize(dom.window);
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
  return { window: dom.window, document: dom.window.document, requests };
}

export function link(document, text) {
  return [...document.querySelectorAll("a")].find(
    (node) => node.textContent === text,
  );
}

export function button(document, text) {
  return [...document.querySelectorAll("button")].find(
    (node) => node.textContent === text,
  );
}

export async function waitFor(predicate) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error("Component did not reach expected state");
}

const friends = await readFile(
  new URL("../fixtures/friends.html", import.meta.url),
  "utf8",
);

export function relationship(owner, members = []) {
  const dom = new JSDOM(friends);
  const { document } = dom.window;
  const identity = document.querySelector("#headerProfile .name > a");
  identity.href = `/user/${owner}`;
  identity.nextElementSibling.textContent = `@${owner}`;
  const list = document.querySelector("#memberUserList");
  const template = list.firstElementChild.cloneNode(true);
  list.replaceChildren();
  for (const member of members) {
    const item = template.cloneNode(true);
    const anchor = item.querySelector("a");
    anchor.href = `/user/${member}`;
    anchor.lastChild.textContent = member === "zed" ? "候选显示名" : member;
    list.append(item);
  }
  const html = dom.serialize();
  dom.window.close();
  return html;
}

export function response(html, overrides = {}) {
  return { ok: true, url: "", text: async () => html, ...overrides };
}
