import { readRelationships, UnavailableRelationshipError } from "./site.mjs";
import { requestText } from "./requests.mjs";
import { addContributions, rankCandidates } from "./candidates.mjs";

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
  const excludedIds = new Set([home.id, ...excluded.keys()]);
  let candidates = new Map();
  const intermediates = [...firstMembers.values()];
  let next = 0;
  let succeeded = 0;
  let failed = 0;
  const skipped = [];
  const publish = () => {
    signal.throwIfAborted();
    const results = rankCandidates(candidates);
    const counts = {
      processed: succeeded + failed + skipped.length,
      total: intermediates.length,
      succeeded,
      failed,
      skipped: skipped.length,
    };
    const progress = `${counts.processed}/${counts.total}，成功 ${succeeded}，失败 ${failed}${skipped.length ? `，跳过 ${skipped.length}` : ""}`;
    update(results, progress, counts, skipped);
    return { results, progress, counts, skipped, complete: failed === 0 };
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
        candidates = addContributions(
          candidates,
          members.values(),
          intermediary,
          excludedIds,
        );
        succeeded++;
      } catch (error) {
        signal.throwIfAborted();
        if (
          intermediary.name === "[已注销]" &&
          error instanceof UnavailableRelationshipError
        ) {
          skipped.push({ id: intermediary.id, direction: second });
          staged.relationships[intermediary.id] ??= Object.create(null);
          staged.relationships[intermediary.id][second] = {
            skipped: true,
            fetchedAt: window.Date.now(),
          };
        } else failed++;
      }
      publish();
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(4, intermediates.length) }, worker),
  );
  return { ...publish(), staged };
}
