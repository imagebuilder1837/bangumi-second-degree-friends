import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = new URL("../../", import.meta.url);

export async function project(t) {
  const directory = await mkdtemp(
    join(tmpdir(), "second-degree-friends-test-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const file of ["src", "scripts", "package.json", "package-lock.json"]) {
    await cp(new URL(file, root), join(directory, file), { recursive: true });
  }
  await cp(new URL("vendor", root), join(directory, "vendor"), {
    recursive: true,
    filter: (source) =>
      ![".git", "node_modules"].includes(source.split("/").at(-1)),
  });
  await symlink(
    new URL("node_modules", root).pathname,
    join(directory, "node_modules"),
    "dir",
  );
  await mkdir(join(directory, "test"));
  return {
    directory,
    run(command) {
      const env = { ...process.env };
      delete env.NODE_TEST_CONTEXT;
      const result = spawnSync("npm", ["run", command], {
        cwd: directory,
        env,
        encoding: "utf8",
        timeout: 60000,
      });
      return { status: result.status, output: result.stdout + result.stderr };
    },
    read: (file) => readFile(join(directory, file), "utf8"),
    write: (file, value) => writeFile(join(directory, file), value),
  };
}
