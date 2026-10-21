const key = "second-degree-friends:relationships";
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
        !Array.isArray(snapshot.members) ||
        !snapshot.members.every(identifier)
      )
        continue;
      data.relationships[id] ??= dictionary();
      data.relationships[id][direction] = {
        members: [...new Set(snapshot.members)],
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

function read(window, required = false) {
  let text;
  try {
    text = window.localStorage.getItem(key);
  } catch (error) {
    if (required) throw error;
    return empty();
  }
  try {
    return validated(JSON.parse(text));
  } catch {
    return empty();
  }
}

export function relationshipCache(window, home) {
  let data = read(window);
  return {
    lookup(mode) {
      const [first, second] = mode.split("/");
      const initial = data.relationships[home.id]?.[first];
      const excluded = data.relationships[home.id]?.[second];
      if (!initial || !excluded) return;
      const snapshots = [initial, excluded];
      const candidates = new Map();
      for (const id of initial.members) {
        const snapshot = data.relationships[id]?.[second];
        if (!snapshot) return;
        snapshots.push(snapshot);
        for (const member of snapshot.members) {
          if (member === home.id || excluded.members.includes(member)) continue;
          const candidate = candidates.get(member) ?? {
            id: member,
            name: member,
            avatar: "",
            ...data.users[member],
            count: 0,
          };
          candidate.count++;
          candidates.set(member, candidate);
        }
      }
      return {
        results: [...candidates.values()].sort(
          (a, b) =>
            b.count - a.count || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
        ),
        complete: true,
        earliest: Math.min(...snapshots.map((snapshot) => snapshot.fetchedAt)),
        latest: Math.max(...snapshots.map((snapshot) => snapshot.fetchedAt)),
      };
    },
    async commit(staged, signal) {
      if (
        typeof window.localStorage?.getItem !== "function" ||
        typeof window.localStorage?.setItem !== "function" ||
        typeof window.navigator.locks?.request !== "function"
      )
        throw new Error("无法安全保存缓存");
      await window.navigator.locks.request(
        key,
        { mode: "exclusive", signal },
        () => {
          signal.throwIfAborted();
          const merged = read(window, true);
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
          window.localStorage.setItem(key, JSON.stringify(merged));
          data = merged;
        },
      );
    },
  };
}
