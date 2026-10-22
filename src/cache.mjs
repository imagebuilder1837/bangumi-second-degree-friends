import { addContributions, rankCandidates } from "./candidates.mjs";

const databaseName = "second-degree-friends";
const storeName = "relationships";
const unavailableMessage =
  "IndexedDB 不可用或访问被拒绝，请检查浏览器支持和站点存储权限后重试";
const dictionary = () => Object.create(null);
const empty = () => ({
  version: 1,
  relationships: dictionary(),
  users: dictionary(),
});
const record = (value) =>
  value && typeof value === "object" && !Array.isArray(value);
const timestamp = (value) =>
  Number.isFinite(value) && value >= 0 && value <= 8640000000000000;
const identifier = (value) => typeof value === "string" && value.length > 0;

function validated(value) {
  const data = empty();
  if (
    value?.version !== 1 ||
    !record(value.relationships) ||
    !record(value.users)
  )
    return data;
  for (const [id, directions] of Object.entries(value.relationships)) {
    if (!identifier(id) || !record(directions)) continue;
    for (const direction of ["friends", "rev_friends"]) {
      const snapshot = directions[direction];
      if (
        !record(snapshot) ||
        !timestamp(snapshot.fetchedAt) ||
        !(snapshot.skipped === true
          ? snapshot.members === undefined
          : Array.isArray(snapshot.members) &&
            snapshot.members.every(identifier))
      )
        continue;
      data.relationships[id] ??= dictionary();
      data.relationships[id][direction] = {
        ...(snapshot.skipped === true
          ? { skipped: true }
          : { members: [...new Set(snapshot.members)] }),
        fetchedAt: snapshot.fetchedAt,
      };
    }
  }
  for (const [id, user] of Object.entries(value.users)) {
    if (
      !record(user) ||
      typeof user.name !== "string" ||
      typeof user.avatar !== "string" ||
      !/^https?:\/\//.test(user.avatar) ||
      !timestamp(user.fetchedAt)
    )
      continue;
    data.users[id] = {
      name: user.name,
      avatar: user.avatar,
      fetchedAt: user.fetchedAt,
    };
  }
  return data;
}

async function transact(window, mode, operation, signal) {
  signal?.throwIfAborted();
  if (typeof window.indexedDB?.open !== "function")
    throw new Error(unavailableMessage);
  return new Promise((resolve, reject) => {
    const opening = window.indexedDB.open(databaseName, 1);
    let blocked = false;
    opening.onupgradeneeded = () => {
      opening.result.createObjectStore(storeName);
    };
    opening.onerror = () => reject(opening.error);
    opening.onblocked = () => {
      blocked = true;
      reject(
        new Error("IndexedDB 升级被其他标签页阻塞，请关闭其他标签页后重试"),
      );
    };
    opening.onsuccess = () => {
      const database = opening.result;
      database.onversionchange = () => database.close();
      if (blocked || signal?.aborted) {
        database.close();
        reject(signal?.reason);
        return;
      }
      let transaction;
      try {
        transaction = database.transaction(storeName, mode);
      } catch (error) {
        database.close();
        reject(error);
        return;
      }
      let result;
      let failure;
      const abort = () => transaction.abort();
      const close = () => {
        signal?.removeEventListener("abort", abort);
        database.close();
      };
      signal?.addEventListener("abort", abort, { once: true });
      transaction.onabort = () => {
        close();
        reject(
          signal?.aborted ? signal.reason : (failure ?? transaction.error),
        );
      };
      transaction.oncomplete = () => {
        close();
        resolve(result);
      };
      const store = transaction.objectStore(storeName);
      const reading = store.get("snapshots");
      reading.onsuccess = () => {
        try {
          signal?.throwIfAborted();
          result = operation(store, validated(reading.result));
        } catch (error) {
          failure = error;
          transaction.abort();
        }
      };
    };
  });
}

export function cacheFailure(error) {
  if (error?.name === "QuotaExceededError")
    return "存储容量不足，请检查浏览器存储容量后重试";
  if (
    ["SecurityError", "InvalidStateError", "NotAllowedError"].includes(
      error?.name,
    )
  )
    return unavailableMessage;
  return error?.message || unavailableMessage;
}

export function relationshipCache(window, home) {
  return {
    async lookup(mode) {
      const data = await transact(window, "readonly", (_, data) => data);
      const [first, second] = mode.split("/");
      const initial = data.relationships[home.id]?.[first];
      const excluded = data.relationships[home.id]?.[second];
      if (!initial || !excluded || initial.skipped || excluded.skipped) return;
      const snapshots = [initial, excluded];
      const excludedIds = new Set([home.id, ...excluded.members]);
      const user = (id) => ({ id, name: id, avatar: "", ...data.users[id] });
      let candidates = new Map();
      const skipped = [];
      for (const id of initial.members) {
        const snapshot = data.relationships[id]?.[second];
        if (!snapshot) return;
        snapshots.push(snapshot);
        if (snapshot.skipped) {
          skipped.push({ id, direction: second });
          continue;
        }
        candidates = addContributions(
          candidates,
          snapshot.members.map(user),
          user(id),
          excludedIds,
        );
      }
      return {
        results: rankCandidates(candidates),
        complete: true,
        skipped,
        earliest: Math.min(...snapshots.map((snapshot) => snapshot.fetchedAt)),
        latest: Math.max(...snapshots.map((snapshot) => snapshot.fetchedAt)),
      };
    },
    async commit(staged, signal) {
      await transact(
        window,
        "readwrite",
        (store, merged) => {
          for (const [id, directions] of Object.entries(staged.relationships)) {
            merged.relationships[id] ??= dictionary();
            for (const [direction, snapshot] of Object.entries(directions)) {
              const previous = merged.relationships[id][direction];
              if (!previous || snapshot.fetchedAt >= previous.fetchedAt)
                merged.relationships[id][direction] = snapshot;
            }
          }
          for (const [id, user] of Object.entries(staged.users)) {
            if (
              !merged.users[id] ||
              user.fetchedAt >= merged.users[id].fetchedAt
            )
              merged.users[id] = user;
          }
          store.put(merged, "snapshots");
        },
        signal,
      );
    },
  };
}
