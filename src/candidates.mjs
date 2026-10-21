export function addContributions(candidates, members, intermediary, excluded) {
  const next = new Map(candidates);
  for (const user of members) {
    if (excluded.has(user.id)) continue;
    const previous = next.get(user.id) ?? {
      ...user,
      count: 0,
      contributors: [],
    };
    next.set(user.id, {
      ...previous,
      count: previous.count + 1,
      contributors: [...previous.contributors, intermediary],
    });
  }
  return next;
}

export function rankCandidates(candidates) {
  return [...candidates.values()].sort(
    (a, b) => b.count - a.count || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}
