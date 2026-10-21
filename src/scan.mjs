import { readFriends } from "./site.mjs";

export async function scanFriends(window, home) {
  const read = async (id, url) => {
    const response = await window.fetch(url, { credentials: "same-origin" });
    if (!response.ok) throw new Error("好友读取失败");
    if (response.url && response.url !== url)
      throw new Error("关系请求跳转到其他页面");
    return readFriends(window, await response.text(), id, url);
  };
  const friends = await read(home.id, home.friendsUrl);
  const candidates = new Map();
  for (const friend of friends.values()) {
    const url = new URL(
      `/user/${encodeURIComponent(friend.id)}/friends`,
      home.friendsUrl,
    ).href;
    const members = await read(friend.id, url);
    for (const user of members.values()) {
      if (user.id === home.id || friends.has(user.id)) continue;
      const candidate = candidates.get(user.id) ?? { ...user, count: 0 };
      candidate.count++;
      candidates.set(user.id, candidate);
    }
  }
  return [...candidates.values()].sort(
    (a, b) => b.count - a.count || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}
