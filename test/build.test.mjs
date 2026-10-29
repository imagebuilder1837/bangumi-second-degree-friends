import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
import { project } from "./support/commands.mjs";

test("build produces a repeatable executable script that initializes idempotently without requests", async (t) => {
  const app = await project(t);
  const build = app.run("build");
  assert.equal(build.status, 0, build.output);
  const artifact = await app.read("src/index.user.js");
  const html = await readFile(
    new URL("./fixtures/home.html", import.meta.url),
    "utf8",
  );
  const dom = new JSDOM(html, {
    url: "https://bgm.tv/user/alice",
    runScripts: "outside-only",
  });
  t.after(() => dom.window.close());
  let requests = 0;
  dom.window.fetch = () => {
    requests++;
    throw new Error("unexpected network");
  };
  dom.window.eval(artifact);
  dom.window.eval(artifact);
  dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
  assert.equal(
    dom.window.document.querySelector(".network_service").children.length,
    2,
  );
  assert.equal(requests, 0);
  assert.equal(app.run("build").status, 0);
  assert.equal(await app.read("src/index.user.js"), artifact);
});
