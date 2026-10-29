import { createRelationshipStore } from "../vendor/bangumi-relationship-store/src/index.mjs";
import { addContributions, rankCandidates } from "./candidates.mjs";
import { skippedRelationship } from "./issues.mjs";

const unavailableMessage =
  "IndexedDB 不可用或访问被拒绝，请检查浏览器支持和站点存储权限后重试";

export function cacheFailure(error) {
  if (error?.code === "quota-exceeded" || error?.name === "QuotaExceededError")
    return "存储容量不足，请检查浏览器存储容量后重试";
  if (error?.code === "blocked")
    return "IndexedDB 升级被其他标签页阻塞，请关闭其他标签页后重试";
  if (error?.code === "incompatible-version")
    return "关系缓存版本不兼容，请更新组件后重试";
  if (error?.code === "corrupt-data") return "关系缓存数据损坏，原数据已保留";
  if (
    error?.code === "unavailable" ||
    ["SecurityError", "InvalidStateError", "NotAllowedError"].includes(
      error?.name,
    )
  )
    return unavailableMessage;
  return error?.message || unavailableMessage;
}

// Translate the component's accepted skips at the storage seam; the public
// protocol records observations, not whether a two-hop scan may continue.
function observation(snapshot) {
  if (snapshot.skipped)
    return {
      status: "unavailable",
      fetchedAt: snapshot.fetchedAt,
      issue: { code: "deleted-display-name-page-unavailable" },
    };
  return {
    status: "available",
    members: snapshot.members,
    fetchedAt: snapshot.fetchedAt,
    ...(snapshot.missingIdentifiers
      ? {
          issue: {
            code: "missing-identifiers",
            count: snapshot.missingIdentifiers,
          },
        }
      : {}),
  };
}

function componentSnapshot(snapshot) {
  return {
    ...(snapshot.status === "unavailable"
      ? { skipped: true }
      : { members: snapshot.members }),
    fetchedAt: snapshot.fetchedAt,
    ...(snapshot.issue?.code === "missing-identifiers"
      ? { missingIdentifiers: snapshot.issue.count }
      : {}),
  };
}

export function relationshipCache(window, home) {
  // Resolve the browser dependency inside async operations: denied storage
  // must not prevent mounting the component or running a live scan.
  const store = () => createRelationshipStore({ indexedDB: window.indexedDB });
  return {
    async lookup(mode) {
      const database = store();
      const [first, second] = mode.split("/");
      const root = await database.read({
        relationships: [...new Set([first, second])].map((direction) => [
          home.id,
          direction,
        ]),
      });
      const initial = root.relationships[home.id]?.[first];
      const excluded = root.relationships[home.id]?.[second];
      if (
        !initial ||
        !excluded ||
        initial.status === "unavailable" ||
        excluded.status === "unavailable"
      )
        return;
      const related = await database.read({
        relationships: initial.members.map((id) => [id, second]),
      });
      // Keep observations from each read separate: home may itself appear in
      // its first-hop list, and a concurrent writer may update it in between.
      const snapshots = [initial, excluded];
      for (const id of initial.members) {
        const snapshot = related.relationships[id]?.[second];
        if (!snapshot) return;
        snapshots.push(snapshot);
      }
      const profiles = await database.read({
        users: [...new Set([home.id, ...initial.members])],
      });
      const excludedIds = new Set([home.id, ...excluded.members]);
      const users = new Map();
      const user = (id) => {
        if (!users.has(id))
          users.set(id, { id, name: id, avatar: "", ...profiles.users[id] });
        return users.get(id);
      };
      function* members(snapshot) {
        for (const id of snapshot.members)
          if (!excludedIds.has(id)) yield user(id);
      }
      let candidates = new Map();
      const skipped = [];
      for (const direction of new Set([first, second])) {
        const snapshot = componentSnapshot(
          root.relationships[home.id][direction],
        );
        if (snapshot.missingIdentifiers)
          skipped.push(
            skippedRelationship(
              user(home.id),
              direction,
              snapshot.missingIdentifiers,
            ),
          );
      }
      for (const id of initial.members) {
        const snapshot = componentSnapshot(related.relationships[id][second]);
        if (snapshot.skipped) {
          skipped.push(skippedRelationship(user(id), second));
          continue;
        }
        if (snapshot.missingIdentifiers)
          skipped.push(
            skippedRelationship(user(id), second, snapshot.missingIdentifiers),
          );
        candidates = addContributions(
          candidates,
          members(snapshot),
          user(id),
          excludedIds,
        );
      }
      const results = rankCandidates(candidates);
      const loaded = new Set([home.id, ...initial.members]);
      const hydrate = async (page) => {
        const ids = [...new Set(page.map(({ id }) => id))].filter(
          (id) => !loaded.has(id),
        );
        if (!ids.length) return;
        const profiles = await database.read({ users: ids });
        // Apply only after the entire read succeeds; a failed page is retryable.
        for (const id of ids) {
          const profile = profiles.users[id];
          if (profile) Object.assign(user(id), profile);
          loaded.add(id);
        }
        for (const candidate of page) {
          const profile = users.get(candidate.id);
          if (profile)
            Object.assign(candidate, {
              name: profile.name,
              avatar: profile.avatar,
            });
        }
      };
      await hydrate(results.slice(0, 50));
      return {
        results,
        hydrate,
        complete: true,
        skipped,
        earliest: snapshots.reduce(
          (time, snapshot) => Math.min(time, snapshot.fetchedAt),
          Infinity,
        ),
        latest: snapshots.reduce(
          (time, snapshot) => Math.max(time, snapshot.fetchedAt),
          -Infinity,
        ),
      };
    },
    async commit(staged, signal) {
      const relationships = Object.create(null);
      for (const [id, directions] of Object.entries(staged.relationships)) {
        relationships[id] = Object.create(null);
        for (const [direction, snapshot] of Object.entries(directions))
          relationships[id][direction] = observation(snapshot);
      }
      await store().commit({ relationships, users: staged.users }, { signal });
    },
  };
}
