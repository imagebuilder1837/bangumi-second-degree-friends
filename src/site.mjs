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
  const match = /^\/user\/([^/]+)\/?$/.exec(new URL(base).pathname);
  if (!match) throw new Error("无法识别主页用户");
  const id = decodeURIComponent(match[1]);
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
  const title = document.querySelector(
    "#headerProfile h1.nameSingle .inner > .name",
  );
  const name =
    [...(title?.childNodes ?? [])]
      .filter(
        (node) =>
          node.nodeType === 3 ||
          (node.nodeName === "A" &&
            node.hasAttribute("href") &&
            /^\/user\/[^/]+\/?$/.test(
              new URL(node.getAttribute("href"), base).pathname,
            )),
      )
      .map((node) => node.textContent)
      .join("")
      .trim() || id;
  const background = document.querySelector("#headerProfile .avatarNeue")?.style
    .backgroundImage;
  const image = background && /^url\(["']?(.*?)["']?\)$/.exec(background)?.[1];
  const avatar = image ? new URL(image, base).href : "";
  return {
    id,
    name,
    avatar,
    friendsUrl: friendsUrl.href,
    reverseUrl: reverseUrl?.href,
  };
}

export class UnavailableRelationshipError extends Error {}

export function readRelationships(window, html, owner, base) {
  const document = new window.DOMParser().parseFromString(html, "text/html");
  const notice = document.querySelector("#colunmNotice");
  if (
    !document.querySelector("#headerProfile, #memberUserList") &&
    notice?.querySelector("h2")?.textContent.trim() === "呜咕，出错了" &&
    notice.querySelector("p.text")?.textContent.trim() ===
      "啊噢，你访问的页面似乎被 Bangumi 娘吃掉了。" &&
    notice.querySelector('img[src="/img/bangumi/404.png"]')
  )
    throw new UnavailableRelationshipError("原站关系列表不可访问");
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
  let missingIdentifiers = 0;
  for (const item of list.children) {
    if (!item.matches("li.user")) throw new Error("无效的好友条目");
    // Query links locally to avoid the costly compound selector on large lists.
    const anchor = [...item.querySelectorAll("a.avatar[href]")].find(
      (link) =>
        link.parentElement.matches("strong") &&
        link.parentElement.parentElement?.matches(".userContainer"),
    );
    if (!anchor) throw new Error("无效的好友条目");
    const background = anchor.querySelector(".userImage > .avatarNeue")?.style
      .backgroundImage;
    const image =
      background && /^url\(["']?(.*?)["']?\)$/.exec(background)?.[1];
    if (!image) throw new Error("无效的好友条目");
    const avatar = new URL(image, base).href;
    const url = new URL(anchor.getAttribute("href"), base);
    if (
      url.origin === new URL(base).origin &&
      url.pathname === "/user/" &&
      !url.search &&
      !url.hash
    ) {
      missingIdentifiers++;
      continue;
    }
    const match = /^\/user\/([^/]+)$/.exec(url.pathname);
    if (url.origin !== new URL(base).origin || !match)
      throw new Error("无效的好友条目");
    const id = decodeURIComponent(match[1]);
    members.set(id, { id, name: anchor.textContent.trim(), avatar });
  }
  return { members, missingIdentifiers };
}
