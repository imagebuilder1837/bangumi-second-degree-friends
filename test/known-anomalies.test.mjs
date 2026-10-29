import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { scanRelationships } from "../src/scan.mjs";
import { relationshipCache } from "../src/cache.mjs";
import { sharedStorage } from "./support/storage.mjs";
import { relationship, response } from "./support/component.mjs";

const home = {
  id: "alice",
  name: "主页昵称",
  avatar: "https://lain.bgm.tv/home.jpg",
  friendsUrl: "https://bgm.tv/user/alice/friends",
  reverseUrl: "https://bgm.tv/user/alice/rev_friends",
};

test("known missing identifiers in home and intermediate relationships retain useful results in every mode and cache", async (t) => {
  for (const mode of [
    "friends/friends",
    "friends/rev_friends",
    "rev_friends/friends",
    "rev_friends/rev_friends",
  ]) {
    await t.test(mode, async (t) => {
      const { window } = new JSDOM("");
      t.after(() => window.close());
      sharedStorage().install(window);
      window.fetch = async (url) => {
        const owner = new URL(url).pathname.split("/")[2];
        return response(
          relationship(
            owner,
            owner === "alice" ? ["bob", ""] : ["zed", "zed", ""],
          ),
        );
      };
      const observations = [];
      const outcome = await scanRelationships(window, home, mode, {
        observe: (batch) => observations.push(batch),
        signal: new window.AbortController().signal,
        update() {},
        rateLimited() {},
      });
      assert.equal(outcome.complete, true);
      assert.deepEqual(outcome.counts, {
        processed: 1,
        total: 1,
        succeeded: 0,
        failed: 0,
        skipped: 1,
      });
      assert.deepEqual(
        outcome.results.map((u) => [u.id, u.count]),
        [["zed", 1]],
      );
      assert.equal(outcome.skipped.filter((u) => u.id === "bob").length, 1);
      assert.equal(
        outcome.skipped.filter((u) => u.id === "alice").length,
        mode.split("/")[0] === mode.split("/")[1] ? 1 : 2,
      );
      const cache = relationshipCache(window, home);
      for (const observation of observations)
        await cache.commit(observation, new window.AbortController().signal);
      const cached = await cache.lookup(mode);
      assert.deepEqual(
        cached.results.map((u) => [
          u.id,
          u.count,
          u.contributors.map((c) => c.id),
        ]),
        [["zed", 1, ["bob"]]],
      );
      assert.deepEqual(cached.skipped, outcome.skipped);
      assert.equal(cached.complete, true);
    });
  }
});
