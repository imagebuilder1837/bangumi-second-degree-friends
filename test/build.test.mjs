import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
import { project } from "./support/commands.mjs";

test("build produces a repeatable installable script with leading metadata and the fixed generation notice", async (t) => {
  const app = await project(t);
  const build = app.run("build");
  assert.equal(build.status, 0, build.output);
  const artifact = await app.read("src/index.user.js");
  assert.ok(artifact.startsWith("// ==UserScript==\n"));
  assert.match(artifact, /\/\/ @version\s+0\.1\.0\n/);
  assert.match(artifact, /\/\/ @author\s+imagebuilder1837\n/);
  assert.match(
    artifact,
    /\/\/ @namespace\s+https:\/\/github.com\/imagebuilder1837\/bangumi-second-degree-friends\n/,
  );
  assert.match(artifact, /\/\/ @license\s+MIT\n/);
  for (const host of ["bgm.tv", "bangumi.tv", "chii.in"])
    assert.ok(artifact.includes(`// @match        https://${host}/user/*`));
  assert.match(
    artifact,
    /\/\/ @downloadURL\s+https:\/\/raw\.githubusercontent\.com\/imagebuilder1837\/bangumi-second-degree-friends\/refs\/heads\/main\/src\/index\.user\.js/,
  );
  assert.match(
    artifact,
    /\/\/ @updateURL\s+https:\/\/raw\.githubusercontent\.com\/imagebuilder1837\/bangumi-second-degree-friends\/refs\/heads\/main\/src\/index\.user\.js/,
  );
  assert.ok(
    artifact.includes(
      "// ==/UserScript==\n\n// Generated from src/main.mjs and its imports, including vendor modules. Do not edit; run npm run build.\n",
    ),
  );
  assert.ok(!artifact.includes("{{VERSION}}"));
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
