import test from "node:test";
import assert from "node:assert/strict";
import { clock } from "./support/clock.mjs";
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

test("blank display names preserve intermediates and candidates without identifier fallback", async (t) => {
  for (const blank of ["", " ", "&nbsp;", "　"]) {
    await t.test(JSON.stringify(blank), async (t) => {
      const graph = { alice: ["bob"], bob: ["zed", "other"] };
      const { document } = component(t, {
        respond: (url) => {
          const owner = new URL(url).pathname.split("/")[2];
          const html = relationship(owner, graph[owner])
            .replace(">bob</a>", `>${blank}</a>`)
            .replace(">候选显示名</a>", `>${blank}</a>`);
          return response(html);
        },
      });
      link(document, "二度好友发现").click();
      button(document, "开始寻找").click();
      await waitFor(() =>
        document.querySelector('[role="status"]').textContent.includes("完成"),
      );
      assert.match(
        document.querySelector('[role="status"]').textContent,
        /^完成.*成功 1，失败 0/,
      );
      const rows = document.querySelectorAll('[role="dialog"] ol > li');
      assert.equal(rows.length, 2);
      const row = document.querySelector('li[data-user-id="zed"]');
      const candidate = row.querySelector('a[href="/user/zed"]');
      assert.equal(candidate.textContent, "");
      assert.equal(candidate.title, "");
      assert.equal(row.querySelector(".count").textContent, "1");
      button(row, "展开贡献者").click();
      const contributor = document.querySelector(
        'li[data-user-id="zed"] a[href="/user/bob"]',
      );
      assert.ok(contributor);
      assert.equal(contributor.title, "");
    });
  }
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
    await waitFor(
      () =>
        button(document, "开始寻找") && !button(document, "开始寻找").disabled,
    );
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
  await waitFor(
    () =>
      button(document, "开始寻找") && !button(document, "开始寻找").disabled,
  );
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
    const time = clock();
    const { document } = component(t, {
      configure: time.install,
      respond: (url) => {
        if (url.endsWith("/alice/friends"))
          return response(relationship("alice", ["bob"]));
        if (failure instanceof Error) throw failure;
        return failure;
      },
    });
    link(document, "二度好友发现").click();
    button(document, "开始寻找").click();
    await time.tick(3500);
    await waitFor(
      () =>
        button(document, "开始寻找") && !button(document, "开始寻找").disabled,
    );
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

test("a running scan locks its mode and reopening cannot start an overlapping task", async (t) => {
  let release;
  const { document, window, requests } = component(t, {
    respond: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  link(document, "二度好友发现").click();
  button(document, "开始寻找").click();
  const select = document.querySelector("select");
  assert.equal(select.disabled, true);
  select.value = "rev_friends/rev_friends";
  select.dispatchEvent(new window.Event("change"));
  assert.equal(select.value, "friends/friends");
  link(document, "二度好友发现").click();
  assert.equal(requests.length, 1);
  assert.equal(document.querySelectorAll("[data-medal]").length, 0);
  assert.equal(
    document.querySelector('[role="status"]').textContent,
    "正在获取主页关系",
  );
  assert.ok(button(document, "停止寻找"));
  release(response(relationship("alice")));
  await waitFor(() => button(document, "开始寻找"));
  assert.equal(select.disabled, false);
});

test("four asymmetric directions use only required home sets and distinct intermediates", async (t) => {
  const graph = {
    "alice/friends": ["bob", "carol", "bob"],
    "alice/rev_friends": ["dana", "erin", "dana"],
    "bob/friends": ["alice", "carol", "x", "x", "y"],
    "carol/friends": ["x"],
    "bob/rev_friends": ["alice", "dana", "z", "z"],
    "carol/rev_friends": ["z", "bob"],
    "dana/friends": ["alice", "bob", "w", "w"],
    "erin/friends": ["w", "dana"],
    "dana/rev_friends": ["alice", "erin", "v", "v"],
    "erin/rev_friends": ["v", "bob"],
  };
  const cases = [
    [
      "好友的好友",
      [
        ["x", "2"],
        ["y", "1"],
      ],
      ["alice/friends", "bob/friends", "carol/friends"],
    ],
    [
      "好友的反向好友",
      [
        ["z", "2"],
        ["bob", "1"],
      ],
      [
        "alice/friends",
        "alice/rev_friends",
        "bob/rev_friends",
        "carol/rev_friends",
      ],
    ],
    [
      "反向好友的好友",
      [
        ["w", "2"],
        ["dana", "1"],
      ],
      ["alice/friends", "alice/rev_friends", "dana/friends", "erin/friends"],
    ],
    [
      "反向好友的反向好友",
      [
        ["v", "2"],
        ["bob", "1"],
      ],
      ["alice/rev_friends", "dana/rev_friends", "erin/rev_friends"],
    ],
  ];
  for (const [mode, expected, paths] of cases) {
    const { document, window, requests } = component(t, {
      respond: (url) => {
        const path = new URL(url).pathname.slice(6);
        assert.ok(path in graph, path);
        return response(relationship(path.split("/")[0], graph[path]));
      },
    });
    link(document, "二度好友发现").click();
    const select = document.querySelector("select");
    assert.ok(select, "mode selector is available");
    assert.equal(select.selectedOptions[0].textContent, "好友的好友");
    select.value = [...select.options].find(
      (option) => option.textContent === mode,
    ).value;
    select.dispatchEvent(new window.Event("change"));
    button(document, "开始寻找").click();
    await waitFor(() =>
      document.querySelector('[role="status"]').textContent.startsWith("完成"),
    );
    assert.deepEqual(
      [...document.querySelectorAll("ol > li")].map((row) => [
        row.querySelector("a").getAttribute("href").slice(6),
        row.querySelector(".count").textContent,
      ]),
      expected,
    );
    assert.deepEqual(
      requests.map((url) => new URL(url).pathname.slice(6)).sort(),
      paths.sort(),
    );
  }
});

test("live results and final progress distinguish successful and failed intermediates", async (t) => {
  const pending = new Map();
  const { document } = component(t, {
    respond: (url) => {
      const owner = new URL(url).pathname.split("/")[2];
      if (owner === "alice")
        return response(relationship("alice", ["bob", "carol", "dana"]));
      return new Promise((resolve) => pending.set(owner, resolve));
    },
  });
  link(document, "二度好友发现").click();
  button(document, "开始寻找").click();
  await waitFor(() => pending.size === 3);
  pending.get("bob")(response(relationship("bob", ["zed"])));
  await waitFor(() => document.querySelector("ol .count"));
  assert.equal(document.querySelector("ol .count").textContent, "1");
  assert.match(
    document.querySelector('[role="status"]').textContent,
    /1\/3.*成功 1.*失败 0/,
  );
  assert.equal(document.querySelectorAll("[data-medal]").length, 0);
  pending.get("carol")(response("denied", { ok: false, status: 403 }));
  await waitFor(() =>
    document.querySelector('[role="status"]').textContent.includes("失败 1"),
  );
  pending.get("dana")(response(relationship("dana", ["zed"])));
  await waitFor(() =>
    document
      .querySelector('[role="status"]')
      .textContent.startsWith("读取失败"),
  );
  assert.match(
    document.querySelector('[role="status"]').textContent,
    /3\/3.*成功 2.*失败 1/,
  );
  assert.equal(document.querySelector("ol .count").textContent, "2");
  assert.equal(document.querySelectorAll("[data-medal]").length, 0);
});

test("stop cancels the four in-flight reads and pending work, preserves partial results, and isolates a fresh scan", async (t) => {
  const pending = [];
  let round = 0;
  let peak = 0;
  let active = 0;
  const { document, requests } = component(t, {
    respond: (url, { signal }) => {
      const owner = new URL(url).pathname.split("/")[2];
      if (owner === "alice") {
        round++;
        return response(
          relationship(
            "alice",
            round === 1 ? ["a", "b", "c", "d", "e", "f"] : ["new"],
          ),
        );
      }
      active++;
      peak = Math.max(peak, active);
      signal?.addEventListener("abort", () => active--, { once: true });
      return new Promise((resolve) =>
        pending.push({
          owner,
          signal,
          resolve: (value) => {
            active--;
            resolve(value);
          },
        }),
      );
    },
  });
  link(document, "二度好友发现").click();
  const start = button(document, "开始寻找");
  start.click();
  assert.equal(start.textContent, "停止寻找");
  assert.equal(document.querySelector("select").disabled, true);
  assert.match(
    document.querySelector('[role="status"]').textContent,
    /获取主页关系/,
  );
  await waitFor(() => pending.length === 4);
  pending[0].resolve(response(relationship("a", ["old"])));
  await waitFor(() => pending.length === 5);
  assert.equal(document.querySelector("ol .count").textContent, "1");
  button(document, "停止寻找").click();
  await waitFor(() => button(document, "开始寻找"));
  assert.ok(pending.slice(1).every((read) => read.signal.aborted));
  assert.equal(
    requests.some((url) => url.includes("/f/")),
    false,
  );
  assert.match(
    document.querySelector('[role="status"]').textContent,
    /已停止.*1\/6.*成功 1.*失败 0/,
  );
  assert.equal(document.querySelector("ol a").textContent, "old");
  assert.equal(document.querySelectorAll("[data-medal]").length, 0);
  button(document, "开始寻找").click();
  assert.equal(document.querySelectorAll("ol > li").length, 0);
  await waitFor(() => pending.length === 6);
  for (const read of pending.slice(1, 5))
    read.resolve(response(relationship(read.owner, ["late"])));
  pending[5].resolve(response(relationship("new", ["fresh"])));
  await waitFor(() =>
    document.querySelector('[role="status"]').textContent.startsWith("完成"),
  );
  assert.equal(document.querySelector("ol a").textContent, "fresh");
  assert.equal(document.querySelectorAll("ol > li").length, 1);
  assert.equal(peak, 4);
  assert.equal(round, 2);
});

test("each start refetches every required list and never fills a failed refresh with old results or storage", async (t) => {
  let round = 0;
  const writes = [];
  const { document, requests } = component(t, {
    configure: (window) => {
      Object.defineProperty(window, "localStorage", {
        value: {
          getItem: () => "existing data",
          setItem: (...args) => writes.push(args),
          removeItem: (...args) => writes.push(args),
        },
      });
    },
    respond: (url) => {
      if (url.endsWith("/alice/friends"))
        return response(
          relationship(
            "alice",
            ++round === 1 ? ["bob", "carol"] : ["bob", "carol", "dana"],
          ),
        );
      const owner = new URL(url).pathname.split("/")[2];
      if (owner === "carol" && round === 2)
        return response("", { ok: false, status: 403 });
      return response(relationship(owner, round === 1 ? ["old"] : ["fresh"]));
    },
  });
  link(document, "二度好友发现").click();
  button(document, "开始寻找").click();
  await waitFor(() =>
    document.querySelector('[role="status"]').textContent.startsWith("完成"),
  );
  assert.equal(document.querySelector("ol a").textContent, "old");
  button(document, "开始寻找").click();
  assert.equal(document.querySelectorAll("ol > li").length, 0);
  await waitFor(() =>
    document
      .querySelector('[role="status"]')
      .textContent.startsWith("读取失败"),
  );
  assert.equal(document.querySelector("ol a").textContent, "fresh");
  assert.equal(document.querySelector("ol .count").textContent, "2");
  assert.equal(document.querySelectorAll("[data-medal]").length, 0);
  assert.deepEqual(requests.map((url) => new URL(url).pathname).sort(), [
    "/user/alice/friends",
    "/user/alice/friends",
    "/user/bob/friends",
    "/user/bob/friends",
    "/user/carol/friends",
    "/user/carol/friends",
    "/user/dana/friends",
  ]);
  assert.deepEqual(writes, []);
});

test("a required mixed-direction exclusion list failure prevents every intermediate request", async (t) => {
  const { document, window, requests } = component(t, {
    respond: (url) =>
      url.endsWith("/alice/friends")
        ? response(relationship("alice", ["bob"]))
        : response("", { ok: false, status: 403 }),
  });
  link(document, "二度好友发现").click();
  const mode = document.querySelector("select");
  mode.value = "friends/rev_friends";
  mode.dispatchEvent(new window.Event("change"));
  button(document, "开始寻找").click();
  await waitFor(() =>
    document
      .querySelector('[role="status"]')
      .textContent.startsWith("读取失败"),
  );
  assert.deepEqual(requests, [
    "https://bgm.tv/user/alice/friends",
    "https://bgm.tv/user/alice/rev_friends",
  ]);
  assert.equal(document.querySelectorAll("ol > li").length, 0);
  assert.equal(document.querySelectorAll("[data-medal]").length, 0);
});
