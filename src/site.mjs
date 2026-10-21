function identity(document, base) {
  const anchor = document.querySelector(
    "#headerProfile h1.nameSingle .inner > .name > a[href]",
  );
  if (!anchor) throw new Error("无法识别主页用户");
  const url = new URL(anchor.getAttribute("href"), base);
  const match = /^\/user\/([^/]+)\/?$/.exec(url.pathname);
  if (url.origin !== new URL(base).origin || !match)
    throw new Error("无法识别主页用户");
  const current = anchor.parentElement
    .querySelector("small.grey")
    ?.textContent.trim();
  return current?.startsWith("@") && current.length > 1
    ? current.slice(1)
    : decodeURIComponent(match[1]);
}

export function readHome(document, base) {
  const id = identity(document, base);
  const anchor = document.querySelector(
    '#headerProfile .navTabs a[href$="/friends"]',
  );
  if (!anchor) throw new Error("缺少好友链接");
  const friendsUrl = new URL(anchor.getAttribute("href"), base);
  if (
    friendsUrl.origin !== new URL(base).origin ||
    friendsUrl.pathname !== `/user/${encodeURIComponent(id)}/friends`
  )
    throw new Error("好友链接身份不匹配");
  const reverse = document.querySelector('#friend a[href$="/rev_friends"]');
  let reverseUrl;
  if (reverse) {
    reverseUrl = new URL(reverse.getAttribute("href"), base);
    if (
      reverseUrl.origin !== friendsUrl.origin ||
      reverseUrl.pathname !== `/user/${encodeURIComponent(id)}/rev_friends`
    )
      throw new Error("反向好友链接身份不匹配");
  }
  return { id, friendsUrl: friendsUrl.href, reverseUrl: reverseUrl?.href };
}

export function readRelationships(window, html, owner, base) {
  const document = new window.DOMParser().parseFromString(html, "text/html");
  if (identity(document, base) !== owner) throw new Error("关系页面身份不匹配");
  const list = document.querySelector("#memberUserList.usersMedium");
  if (!list) throw new Error("缺少好友列表");
  if (
    [...list.childNodes].some(
      (node) => node.nodeType === 3 && node.textContent.trim(),
    )
  )
    throw new Error("无法识别的好友列表");
  const members = new Map();
  for (const item of list.children) {
    if (!item.matches("li.user")) throw new Error("无效的好友条目");
    const anchor = item.querySelector(
      ".userContainer > strong > a.avatar[href]",
    );
    if (!anchor) throw new Error("无效的好友条目");
    const url = new URL(anchor.getAttribute("href"), base);
    const match = /^\/user\/([^/]+)$/.exec(url.pathname);
    if (url.origin !== new URL(base).origin || !match)
      throw new Error("无效的好友条目");
    const id = decodeURIComponent(match[1]);
    const background = anchor.querySelector(".userImage > .avatarNeue").style
      .backgroundImage;
    const avatar = new URL(/^url\(["']?(.*?)["']?\)$/.exec(background)[1], base)
      .href;
    members.set(id, { id, name: anchor.textContent.trim(), avatar });
  }
  return members;
}
