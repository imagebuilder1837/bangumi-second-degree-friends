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

test("start reads the provided current username relationship link, not visitor or numeric UID", async (t) => {
  const { document, requests } = component(t, {
    url: "https://bgm.tv/user/1",
    respond: () => response(relationship("alice")),
  });
  link(document, "二度好友发现").click();
  button(document, "开始寻找").click();
  await waitFor(() =>
    document.querySelector('[role="status"]').textContent.includes("完成"),
  );
  assert.deepEqual(requests, ["https://bgm.tv/user/alice/friends"]);
  assert.match(
    document.querySelector('[role="status"]').textContent,
    /完成.*0/,
  );
});

test("friends of friends exclude home and direct friends and count distinct intermediates in stable order", async (t) => {
  const graph = {
    alice: ["bob", "carol", "bob"],
    bob: ["alice", "carol", "zed", "zed", "alpha", "beta", "gamma"],
    carol: ["bob", "zed", "beta"],
  };
  const { document, requests } = component(t, {
    respond: (url) => {
      const owner = new URL(url).pathname.split("/")[2];
      return response(relationship(owner, graph[owner]));
    },
  });
  link(document, "二度好友发现").click();
  button(document, "开始寻找").click();
  await waitFor(() =>
    document.querySelector('[role="status"]').textContent.startsWith("完成"),
  );
  const rows = [...document.querySelectorAll('[role="dialog"] ol > li')];
  assert.deepEqual(
    rows.map((row) => [
      row.querySelector("a").getAttribute("href"),
      row.querySelector(".count").textContent,
    ]),
    [
      ["/user/beta", "2"],
      ["/user/zed", "2"],
      ["/user/alpha", "1"],
      ["/user/gamma", "1"],
    ],
  );
  assert.deepEqual(
    rows.map((row) => row.dataset.medal ?? null),
    ["gold", "silver", "bronze", null],
  );
  assert.equal(rows[1].querySelector("a").textContent, "候选显示名");
  assert.equal(
    rows[1].querySelector("img").src,
    "https://lain.bgm.tv/pic/user/l/custom_bob.jpg?r=7&hd=1",
  );
  assert.deepEqual(requests.sort(), [
    "https://bgm.tv/user/alice/friends",
    "https://bgm.tv/user/bob/friends",
    "https://bgm.tv/user/carol/friends",
  ]);
});

test("invalid relationship pages and redirected identities never complete or award medals", async (t) => {
  const { readFile } = await import("node:fs/promises");
  const challenge = await readFile(
    new URL("./fixtures/challenge.html", import.meta.url),
    "utf8",
  );
  const error = await readFile(
    new URL("./fixtures/error.html", import.meta.url),
    "utf8",
  );
  const valid = relationship("alice", ["bob"]);
  const cases = [
    response(challenge),
    response(error),
    response(relationship("someone-else")),
    response(valid.replace('id="memberUserList"', 'id="missing"')),
    response(relationship("alice"), {
      url: "https://bangumi.tv/user/alice/friends",
    }),
    response(
      valid.replace('href="/user/bob"', 'href="https://evil.example/user/bob"'),
    ),
    response(valid.replace('class="avatar"', 'class="missing"')),
  ];
  for (const reply of cases) {
    const { document } = component(t, {
      respond: (url) =>
        new URL(url).pathname === "/user/alice/friends"
          ? reply
          : response(relationship("bob")),
    });
    link(document, "二度好友发现").click();
    button(document, "开始寻找").click();
    await waitFor(() => !button(document, "开始寻找").disabled);
    assert.match(
      document.querySelector('[role="status"]').textContent,
      /^读取失败，未完成/,
    );
    assert.equal(document.querySelectorAll("[data-medal]").length, 0);
  }
});

test("an unrecognized list body is not an explicit empty friend set", async (t) => {
  const html = relationship("alice").replace("</ul>", "页面暂不可用</ul>");
  const { document } = component(t, { respond: () => response(html) });
  link(document, "二度好友发现").click();
  button(document, "开始寻找").click();
  await waitFor(() => !button(document, "开始寻找").disabled);
  assert.match(
    document.querySelector('[role="status"]').textContent,
    /^读取失败，未完成/,
  );
});

test("network, HTTP and intermediate failures remain incomplete without podium colors", async (t) => {
  for (const failure of [
    new Error("offline"),
    response("", { ok: false }),
    response(relationship("wrong")),
  ]) {
    const { document } = component(t, {
      respond: (url) => {
        if (url.endsWith("/alice/friends"))
          return response(relationship("alice", ["bob"]));
        if (failure instanceof Error) throw failure;
        return failure;
      },
    });
    link(document, "二度好友发现").click();
    button(document, "开始寻找").click();
    await waitFor(() => !button(document, "开始寻找").disabled);
    assert.match(
      document.querySelector('[role="status"]').textContent,
      /^读取失败，未完成/,
    );
    assert.equal(document.querySelectorAll("[data-medal]").length, 0);
  }
});

test("a numeric homepage and an explicitly empty intermediate list complete without pagination", async (t) => {
  const { readFile } = await import("node:fs/promises");
  const html = (
    await readFile(new URL("./fixtures/home.html", import.meta.url), "utf8")
  ).replaceAll("alice", "237");
  const { document, requests } = component(t, {
    html,
    url: "https://chii.in/user/237",
    respond: (url) =>
      response(
        relationship(
          url.includes("/237/") ? "237" : "8",
          url.includes("/237/") ? ["8"] : [],
        ),
      ),
  });
  link(document, "二度好友发现").click();
  button(document, "开始寻找").click();
  await waitFor(() =>
    document.querySelector('[role="status"]').textContent.startsWith("完成"),
  );
  assert.deepEqual(requests, [
    "https://chii.in/user/237/friends",
    "https://chii.in/user/8/friends",
  ]);
  assert.match(
    document.querySelector('[role="status"]').textContent,
    /0 位候选用户/,
  );
});

test("repeated start cannot overlap requests and no completion is shown while a read is pending", async (t) => {
  let release;
  const { document, requests } = component(t, {
    respond: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  link(document, "二度好友发现").click();
  button(document, "开始寻找").click();
  button(document, "开始寻找").click();
  assert.equal(requests.length, 1);
  assert.equal(document.querySelectorAll("[data-medal]").length, 0);
  assert.equal(
    document.querySelector('[role="status"]').textContent,
    "正在读取好友",
  );
  release(response(relationship("alice")));
  await waitFor(() => !button(document, "开始寻找").disabled);
});
