import test from "node:test";
import assert from "node:assert/strict";
import {
  component,
  link,
  button,
  waitFor,
  relationship,
  response,
} from "./support/component.mjs";
import { clock } from "./support/clock.mjs";

function open(document) {
  link(document, "二度好友发现").click();
  button(document, "开始寻找").click();
}
const status = (document) =>
  document.querySelector('[role="status"]').textContent;

test("transient network errors retry twice with increasing jittered delays then terminate the home stage", async (t) => {
  const time = clock();
  const attempts = [];
  const { document } = component(t, {
    configure: time.install,
    respond: () => {
      attempts.push(time.now());
      throw new TypeError("offline");
    },
  });
  open(document);
  await time.tick(999);
  assert.equal(attempts.length, 1);
  await time.tick(251);
  assert.equal(attempts.length, 2);
  assert.ok(
    attempts[1] - attempts[0] >= 1000 && attempts[1] - attempts[0] <= 1250,
  );
  await time.tick(1874);
  assert.equal(attempts.length, 2);
  await time.tick(376);
  assert.equal(attempts.length, 3);
  assert.ok(
    attempts[2] - attempts[1] >= 2000 && attempts[2] - attempts[1] <= 2250,
  );
  assert.match(status(document), /^读取失败，未完成/);
  await time.tick(100000);
  assert.equal(attempts.length, 3);
  assert.equal(document.querySelectorAll("[data-medal]").length, 0);
});

test("408 and 5xx recover, while 503 Retry-After is a minimum in seconds or HTTP-date", async (t) => {
  for (const [code, header, delay] of [
    [408, null, 1125],
    [500, null, 1125],
    [502, null, 1125],
    [503, "5", 5000],
    [503, "Thu, 01 Jan 2026 00:00:06 GMT", 6000],
    [503, "invalid", 1125],
    [503, "0", 1125],
  ]) {
    const time = clock();
    let tries = 0;
    const { document } = component(t, {
      configure: time.install,
      respond: () =>
        ++tries === 1
          ? response("", {
              ok: false,
              status: code,
              headers: { get: () => header },
            })
          : response(relationship("alice")),
    });
    open(document);
    await time.tick(delay - 1);
    assert.equal(tries, 1, `${code} ${header} must wait`);
    assert.match(status(document), /获取主页关系/);
    await time.tick(1);
    await waitFor(() => status(document).startsWith("完成"));
    assert.equal(tries, 2);
    assert.match(status(document), /0\/0.*成功 0.*失败 0/);
  }
});

test("each attempt times out at thirty seconds and retries never exceed four concurrent reads", async (t) => {
  const time = clock();
  const reads = [];
  let active = 0;
  let peak = 0;
  const { document } = component(t, {
    configure: time.install,
    respond: (url, { signal }) => {
      if (url.endsWith("/alice/friends"))
        return response(relationship("alice", ["a", "b", "c", "d", "e", "f"]));
      active++;
      peak = Math.max(peak, active);
      reads.push({ url, signal, at: time.now() });
      signal.addEventListener("abort", () => active--, { once: true });
      return new Promise(() => {});
    },
  });
  open(document);
  await waitFor(() => reads.length === 4);
  await time.tick(29999);
  assert.equal(active, 4);
  assert.equal(reads.length, 4);
  await time.tick(1);
  assert.equal(active, 0);
  assert.ok(reads.every((read) => read.signal.aborted));
  assert.match(status(document), /0\/6.*成功 0.*失败 0/);
  await time.tick(1124);
  assert.equal(reads.length, 4);
  await time.tick(1);
  assert.equal(reads.length, 8);
  assert.equal(active, 4);
  await time.tick(300000);
  assert.match(status(document), /^读取失败，未完成.*6\/6.*成功 0.*失败 6/);
  assert.equal(reads.length, 18);
  assert.equal(peak, 4);
  assert.equal(active, 0);
  assert.ok(reads.every((read) => read.signal.aborted));
});

test("429 stops all page requests immediately, preserves partial results, and requires manual recovery after local cooldown", async (t) => {
  for (const [header, delay] of [
    ["5", 5000],
    ["Thu, 01 Jan 2026 00:00:07 GMT", 7000],
    [null, 60000],
    ["nonsense", 60000],
    ["-1", 60000],
    ["Mon, 1", 60000],
    ["Wed, 31 Feb 2027 00:00:00 GMT", 60000],
  ]) {
    const time = clock();
    const pending = [];
    let round = 0;
    const { document, requests } = component(t, {
      configure: time.install,
      respond: (url, { signal }) => {
        const owner = new URL(url).pathname.split("/")[2];
        if (owner === "alice")
          return response(
            relationship(
              "alice",
              ++round === 1 ? ["a", "b", "c", "d", "e", "f"] : [],
            ),
          );
        return new Promise((resolve) =>
          pending.push({ owner, signal, resolve }),
        );
      },
    });
    open(document);
    await waitFor(() => pending.length === 4);
    pending[0].resolve(response(relationship("a", ["partial"])));
    await waitFor(() => pending.length === 5);
    pending[4].resolve(
      response("", { ok: false, status: 429, headers: { get: () => header } }),
    );
    await time.tick(0);
    assert.match(status(document), /429.*冷却/);
    assert.ok(pending.slice(1, 4).every((read) => read.signal.aborted));
    assert.equal(requests.length, 6);
    assert.equal(document.querySelector("ol a").textContent, "partial");
    assert.equal(document.querySelectorAll("[data-medal]").length, 0);
    assert.equal(button(document, "开始寻找").disabled, true);
    for (const read of pending.slice(1, 4))
      read.resolve(response(relationship(read.owner, ["late"])));
    await time.tick(delay - 1);
    button(document, "开始寻找").click();
    assert.equal(requests.length, 6);
    await time.tick(1);
    assert.equal(button(document, "开始寻找").disabled, false);
    assert.equal(requests.length, 6, "cooldown never resumes automatically");
    button(document, "开始寻找").click();
    await waitFor(() => status(document).startsWith("完成"));
    assert.equal(requests.length, 7);
    assert.equal(document.querySelectorAll("ol > li").length, 0);
  }
});

test("ordinary client errors and invalid HTML are final failures, never empty sets or retry targets", async (t) => {
  const { readFile } = await import("node:fs/promises");
  const challenge = await readFile(
    new URL("./fixtures/challenge.html", import.meta.url),
    "utf8",
  );
  const siteError = await readFile(
    new URL("./fixtures/error.html", import.meta.url),
    "utf8",
  );
  for (const reply of [
    ...[400, 401, 403, 404, 410].map((code) =>
      response("", { ok: false, status: code }),
    ),
    response(challenge),
    response(siteError),
    response("<html>unknown</html>"),
  ]) {
    const time = clock();
    const { document, requests } = component(t, {
      configure: time.install,
      respond: () => reply,
    });
    open(document);
    await time.tick(120000);
    assert.match(status(document), /^读取失败，未完成/);
    assert.equal(requests.length, 1);
    assert.equal(document.querySelectorAll("[data-medal]").length, 0);
  }
});

test("an intermediate retry contributes only once and advances processed progress only after its final outcome", async (t) => {
  const time = clock();
  let bobAttempts = 0;
  const { document } = component(t, {
    configure: time.install,
    respond: (url) => {
      if (url.endsWith("/alice/friends"))
        return response(relationship("alice", ["bob", "carol"]));
      if (url.endsWith("/carol/friends"))
        return response("", { ok: false, status: 403 });
      if (++bobAttempts === 1) throw new TypeError("offline");
      return response(relationship("bob", ["zed", "zed"]));
    },
  });
  open(document);
  await time.tick(1000);
  assert.match(status(document), /1\/2.*成功 0.*失败 1/);
  assert.equal(document.querySelectorAll("ol > li").length, 0);
  await time.tick(125);
  assert.match(status(document), /^读取失败，未完成.*2\/2.*成功 1.*失败 1/);
  assert.equal(document.querySelector("ol .count").textContent, "1");
  assert.equal(bobAttempts, 2);
});

test("stop during backoff cancels retries and a late timed-out response cannot rate-limit a later attempt", async (t) => {
  const time = clock();
  let attempts = 0;
  let late;
  const { document } = component(t, {
    configure: time.install,
    respond: () => {
      attempts++;
      if (attempts === 1) throw new TypeError("offline");
      if (attempts === 2)
        return new Promise((resolve) => {
          late = resolve;
        });
      return response(relationship("alice"));
    },
  });
  open(document);
  await time.tick(500);
  button(document, "停止寻找").click();
  await time.tick(100000);
  assert.equal(attempts, 1);
  assert.match(status(document), /已停止/);
  button(document, "开始寻找").click();
  await time.tick(30000);
  await time.tick(1125);
  await waitFor(() => button(document, "开始寻找"));
  assert.match(status(document), /^完成/);
  late(response("", { ok: false, status: 429, headers: { get: () => "60" } }));
  await time.tick(0);
  assert.match(status(document), /^完成/);
  assert.equal(button(document, "开始寻找").disabled, false);
  assert.equal(attempts, 3);
});

test("429 at the home stage does not constrain a different page", async (t) => {
  const time = clock();
  const first = component(t, {
    configure: time.install,
    respond: () => response("", { ok: false, status: 429 }),
  });
  open(first.document);
  await time.tick(0);
  assert.equal(button(first.document, "开始寻找").disabled, true);
  const second = component(t, {
    respond: () => response(relationship("alice")),
  });
  open(second.document);
  await waitFor(() => status(second.document).startsWith("完成"));
  assert.equal(second.requests.length, 1);
});

test("changing mode during page cooldown cannot hide the rate-limit state or permit requests", async (t) => {
  const time = clock();
  const { document, window, requests } = component(t, {
    configure: time.install,
    respond: () => response("", { ok: false, status: 429 }),
  });
  open(document);
  await time.tick(0);
  document.querySelector("select").value = "friends/rev_friends";
  document.querySelector("select").dispatchEvent(new window.Event("change"));
  assert.match(status(document), /429.*冷却/);
  button(document, "开始寻找").click();
  assert.equal(requests.length, 1);
});

test("valid long Retry-After deadlines survive the browser timer range", async (t) => {
  for (const code of [503, 429]) {
    const time = clock();
    let attempts = 0;
    const { document } = component(t, {
      configure: time.install,
      respond: () =>
        ++attempts === 1
          ? response("", {
              ok: false,
              status: code,
              headers: { get: () => "5000000" },
            })
          : response(relationship("alice")),
    });
    open(document);
    await time.tick(2147483647);
    assert.equal(attempts, 1);
    if (code === 429) assert.equal(button(document, "开始寻找").disabled, true);
    await time.tick(5000000000 - 2147483647 - 1);
    assert.equal(attempts, 1);
    if (code === 429) assert.equal(button(document, "开始寻找").disabled, true);
    await time.tick(1);
    if (code === 429) {
      assert.equal(attempts, 1);
      button(document, "开始寻找").click();
    }
    await waitFor(() => status(document).startsWith("完成"));
    assert.equal(attempts, 2);
  }
});
