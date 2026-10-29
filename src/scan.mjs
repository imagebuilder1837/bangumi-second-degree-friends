import { readRelationships, UnavailableRelationshipError } from "./site.mjs";
import { requestText } from "./requests.mjs";
import { skippedRelationship } from "./issues.mjs";
import { addContributions, rankCandidates } from "./candidates.mjs";

export async function scanRelationships(
  window,
  home,
  mode,
  { update, signal, rateLimited, observe = () => {} },
) {
  const [first, second] = mode.split("/");
  const homeUrl = (direction) => {
    const url = direction === "friends" ? home.friendsUrl : home.reverseUrl;
    if (!url) throw new Error("缺少主页关系列表链接");
    return url;
  };
  const skipped = [];
  const failures = [];
  const read = async (user, url) => {
    const { id } = user;
    const text = await requestText(window, url, signal, rateLimited);
    signal.throwIfAborted();
    const { members, missingIdentifiers } = readRelationships(
      window,
      text,
      id,
      url,
    );
    const direction = new URL(url).pathname.split("/").at(-1);
    const snapshot = {
      members: [...members.keys()],
      fetchedAt: window.Date.now(),
      ...(missingIdentifiers ? { missingIdentifiers } : {}),
    };
    if (missingIdentifiers)
      skipped.push(skippedRelationship(user, direction, missingIdentifiers));
    const users = Object.create(null);
    users[id] = {
      name: user.name,
      avatar: user.avatar,
      fetchedAt: window.Date.now(),
    };
    for (const user of members.values()) {
      users[user.id] = {
        name: user.name,
        avatar: user.avatar,
        fetchedAt: window.Date.now(),
      };
    }
    observe({
      relationships: {
        [id]: { [direction]: snapshot },
      },
      users,
    });
    return { members, missingIdentifiers };
  };
  const readHome = async (direction) => {
    try {
      const { members } = await read(home, homeUrl(direction));
      update([], "", undefined, skipped, failures);
      return members;
    } catch (error) {
      signal.throwIfAborted();
      failures.push({ ...home, direction, reason: error.message });
      update([], "", undefined, skipped, failures);
      throw error;
    }
  };
  const firstMembers = await readHome(first);
  const excluded = first === second ? firstMembers : await readHome(second);
  const excludedIds = new Set([home.id, ...excluded.keys()]);
  let candidates = new Map();
  const intermediates = [...firstMembers.values()];
  let next = 0;
  let succeeded = 0;
  let failed = 0;
  let skippedIntermediates = 0;
  const publish = () => {
    signal.throwIfAborted();
    const results = rankCandidates(candidates);
    const counts = {
      processed: succeeded + failed + skippedIntermediates,
      total: intermediates.length,
      succeeded,
      failed,
      skipped: skippedIntermediates,
    };
    const progress = `${counts.processed}/${counts.total}，成功 ${succeeded}，失败 ${failed}${skippedIntermediates ? `，跳过 ${skippedIntermediates}` : ""}`;
    update(results, progress, counts, skipped, failures);
    return {
      results,
      progress,
      counts,
      skipped,
      failures,
      complete: failed === 0,
    };
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
        const { members, missingIdentifiers } = await read(intermediary, url);
        candidates = addContributions(
          candidates,
          members.values(),
          intermediary,
          excludedIds,
        );
        if (missingIdentifiers) skippedIntermediates++;
        else succeeded++;
      } catch (error) {
        signal.throwIfAborted();
        if (
          intermediary.name === "[已注销]" &&
          error instanceof UnavailableRelationshipError
        ) {
          skipped.push(skippedRelationship(intermediary, second));
          skippedIntermediates++;
          observe({
            relationships: {
              [intermediary.id]: {
                [second]: { skipped: true, fetchedAt: window.Date.now() },
              },
            },
            users: {},
          });
        } else {
          failed++;
          failures.push({
            ...intermediary,
            direction: second,
            reason: error.message,
          });
        }
      }
      publish();
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(4, intermediates.length) }, worker),
  );
  return publish();
}
