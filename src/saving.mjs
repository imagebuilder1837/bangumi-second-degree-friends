import { cacheFailure } from "./cache.mjs";

// One queue belongs to one scan. Only successful commits advance deduplication;
// comparing at dequeue time also preserves changes such as A -> B -> A.
export function observationSaver(cache, signal, report) {
  const savedUsers = new Map();
  const savedRelationships = new Map();
  let pending = Promise.resolve();
  let warning;
  let committed = 0;
  const content = ({ fetchedAt, ...value }) => JSON.stringify(value);
  return {
    enqueue(batch) {
      if (warning || signal.aborted) return;
      pending = pending.then(async () => {
        if (warning || signal.aborted) return;
        const users = Object.create(null);
        const relationships = Object.create(null);
        const userChanges = [];
        const relationshipChanges = [];
        for (const [id, value] of Object.entries(batch.users)) {
          const signature = content(value);
          if (savedUsers.get(id) === signature) continue;
          users[id] = value;
          userChanges.push([id, signature]);
        }
        for (const [id, directions] of Object.entries(batch.relationships)) {
          for (const [direction, value] of Object.entries(directions)) {
            const key = JSON.stringify([id, direction]);
            const signature = content(value);
            if (savedRelationships.get(key) === signature) continue;
            relationships[id] ??= Object.create(null);
            relationships[id][direction] = value;
            relationshipChanges.push([key, signature]);
          }
        }
        if (!userChanges.length && !relationshipChanges.length) return;
        try {
          await cache.commit({ relationships, users }, signal);
          for (const [key, value] of userChanges) savedUsers.set(key, value);
          for (const [key, value] of relationshipChanges)
            savedRelationships.set(key, value);
          committed++;
        } catch (error) {
          if (signal.aborted) return;
          warning = `缓存保存失败：${cacheFailure(error)}；${committed ? "部分观察已保存" : "尚无观察保存成功"}，已停止后续保存`;
          report(warning);
        }
      });
    },
    async finish() {
      await pending;
      return warning;
    },
  };
}
