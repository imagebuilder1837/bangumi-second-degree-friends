// Both live scans and cached observations expose the same user-facing notices.
export function skippedRelationship(user, direction, missingIdentifiers = 0) {
  return {
    id: user.id,
    name: user.name,
    avatar: user.avatar,
    direction,
    reason: missingIdentifiers
      ? `跳过 ${missingIdentifiers} 条缺失用户标识的关系`
      : "已注销用户的关系列表不可访问",
    ...(missingIdentifiers ? { missingIdentifiers } : {}),
  };
}
