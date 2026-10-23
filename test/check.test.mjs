import test from "node:test";
import assert from "node:assert/strict";
import { project } from "./support/commands.mjs";

const passingTest =
  'import test from "node:test";\n\ntest("public command test", () => {});\n';

async function ready(t) {
  const app = await project(t);
  await app.write("test/command.test.mjs", passingTest);
  const build = app.run("build");
  assert.equal(build.status, 0, build.output);
  return app;
}

test("check accepts a formatted reproducible release and executes the tests", async (t) => {
  const app = await ready(t);
  const check = app.run("check");
  assert.equal(check.status, 0, check.output);
  assert.match(check.output, /public command test/);
});

test("check includes vendored module tests in the delivery gate", async (t) => {
  const app = await ready(t);
  await app.write(
    "vendor/bangumi-relationship-store/test/gate.test.mjs",
    'import test from "node:test";\n\ntest("vendored failure", () => {\n  throw new Error("module gate propagated");\n});\n',
  );
  const result = app.run("check");
  assert.notEqual(result.status, 0, result.output);
  assert.match(result.output, /module gate propagated/);
});

test("check rejects a stale artifact without rewriting it", async (t) => {
  const app = await ready(t);
  const artifact = await app.read("src/index.user.js");
  await app.write(
    "src/main.mjs",
    (await app.read("src/main.mjs")) + '\nconsole.log("changed source");\n',
  );
  const check = app.run("check");
  assert.notEqual(check.status, 0, check.output);
  assert.match(check.output, /artifact.*stale/i);
  assert.equal(await app.read("src/index.user.js"), artifact);
});

test("check rejects package and lockfile version drift even after rebuilding", async (t) => {
  const app = await ready(t);
  const manifest = JSON.parse(await app.read("package.json"));
  manifest.version = "0.1.1";
  await app.write("package.json", JSON.stringify(manifest));
  assert.equal(app.run("build").status, 0);
  const check = app.run("check");
  assert.notEqual(check.status, 0, check.output);
  assert.match(check.output, /lockfile.*version/i);
});

test("build and check reject versions other than stable three-part numeric releases", async (t) => {
  const app = await ready(t);
  const manifest = JSON.parse(await app.read("package.json"));
  const lock = JSON.parse(await app.read("package-lock.json"));
  for (const version of [
    "v0.1.0",
    "0.1",
    "0.1.0-beta.1",
    "0.1.0+build",
    "01.1.0",
  ]) {
    manifest.version = lock.version = lock.packages[""].version = version;
    await app.write("package.json", JSON.stringify(manifest));
    await app.write("package-lock.json", JSON.stringify(lock));
    const build = app.run("build");
    assert.notEqual(build.status, 0, build.output);
    assert.match(build.output, /stable three-part version/i);
    const check = app.run("check");
    assert.notEqual(check.status, 0, check.output);
    assert.match(check.output, /stable three-part version/i);
  }
});

test("build and check reject missing, duplicated or literal metadata versions", async (t) => {
  const app = await ready(t);
  const template = await app.read("src/metadata.txt");
  for (const invalid of [
    template.replace("{{VERSION}}", "0.1.0"),
    template.replace("{{VERSION}}", "{{VERSION}} {{VERSION}}"),
    template.replace("// ==UserScript==", "// missing header"),
  ]) {
    await app.write("src/metadata.txt", invalid);
    for (const command of ["build", "check"]) {
      const result = app.run(command);
      assert.notEqual(result.status, 0, result.output);
      assert.match(result.output, /metadata template/i);
    }
  }
});

test("check rejects dependency declaration drift in the lockfile", async (t) => {
  const app = await ready(t);
  const lock = JSON.parse(await app.read("package-lock.json"));
  delete lock.packages[""].devDependencies.rollup;
  await app.write("package-lock.json", JSON.stringify(lock));
  const check = app.run("check");
  assert.notEqual(check.status, 0, check.output);
  assert.match(check.output, /lockfile.*dependencies/i);
});

test("check propagates formatting, syntax, and test failures as failed commands", async (t) => {
  const app = await ready(t);
  await app.write(
    "test/command.test.mjs",
    'import test from "node:test";test("bad format",()=>{});\n',
  );
  const formatting = app.run("check");
  assert.notEqual(formatting.status, 0, formatting.output);
  assert.match(formatting.output, /Prettier failed: test\/command.test.mjs/);
  // Prettier can parse duplicate lexical bindings, but Node rejects them.
  await app.write(
    "test/command.test.mjs",
    "const duplicate = 1;\nconst duplicate = 2;\n",
  );
  const syntax = app.run("check");
  assert.notEqual(syntax.status, 0, syntax.output);
  assert.match(syntax.output, /already been declared/);
  await app.write(
    "test/command.test.mjs",
    'import test from "node:test";\n\ntest("intentional failure", () => {\n  throw new Error("failure propagated");\n});\n',
  );
  const tests = app.run("check");
  assert.notEqual(tests.status, 0, tests.output);
  assert.match(tests.output, /failure propagated/);
});

test("build rejects incomplete install metadata and multiple version directives", async (t) => {
  const app = await ready(t);
  const template = await app.read("src/metadata.txt");
  for (const invalid of [
    template.replace(/^\/\/ @name.*\n/m, ""),
    template.replace(
      "// ==/UserScript==",
      "// @version 0.1.0\n// ==/UserScript==",
    ),
  ]) {
    await app.write("src/metadata.txt", invalid);
    const build = app.run("build");
    assert.notEqual(build.status, 0, build.output);
    assert.match(build.output, /metadata template/i);
  }
});
