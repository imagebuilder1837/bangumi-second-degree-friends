import { readRelationships } from "./site.mjs";
import { requestText } from "./requests.mjs";

export async function scanRelationships(
  window,
  home,
  mode,
  { update, signal, rateLimited },
) {
  const [first, second] = mode.split("/");
  const homeUrl = (direction) => {
    const url = direction === "friends" ? home.friendsUrl : home.reverseUrl;
    if (!url) throw new Error("缺少主页关系列表链接");
    return url;
  };
  const staged = {
    relationships: Object.create(null),
    users: Object.create(null),
  };
  const read = async (id, url) => {
    const text = await requestText(window, url, signal, rateLimited);
    signal.throwIfAborted();
    const members = readRelationships(window, text, id, url);
    const direction = new URL(url).pathname.split("/").at(-1);
    staged.relationships[id] ??= Object.create(null);
    staged.relationships[id][direction] = {
      members: [...members.keys()],
      fetchedAt: window.Date.now(),
    };
    for (const user of members.values())
      staged.users[user.id] = {
        name: user.name,
        avatar: user.avatar,
        fetchedAt: window.Date.now(),
      };
    return members;
  };
  const firstMembers = await read(home.id, homeUrl(first));
  const excluded =
    first === second ? firstMembers : await read(home.id, homeUrl(second));
  const candidates = new Map();
  const intermediates = [...firstMembers.values()];
  let next = 0;
  let succeeded = 0;
  let failed = 0;
  const publish = () => {
    signal.throwIfAborted();
    const results = [...candidates.values()].sort(
      (a, b) => b.count - a.count || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    const progress = `${succeeded + failed}/${intermediates.length}，成功 ${succeeded}，失败 ${failed}`;
    update(results, progress);
    return { results, progress, complete: failed === 0 };
  };
  publish();
  const worker = async () => {
    while (next < intermediates.length) {
      signal.throwIfAborted();
      const intermediary = intermediates[next++];
      const url = new URL(
        `/user/${encodeURIComponent(intermediary.id)}/${second}`,
        home.friendsUrl,
      ).href;
      try {
        const members = await read(intermediary.id, url);
        for (const user of members.values()) {
          if (user.id === home.id || excluded.has(user.id)) continue;
          const candidate = candidates.get(user.id) ?? {
            ...user,
            count: 0,
            contributors: [],
          };
          candidate.contributors.push(intermediary);
          candidate.count++;
          candidates.set(user.id, candidate);
        }
        succeeded++;
      } catch {
        signal.throwIfAborted();
        failed++;
      }
      publish();
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(4, intermediates.length) }, worker),
  );
  return { ...publish(), staged };
}
