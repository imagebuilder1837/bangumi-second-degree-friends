import { readHome } from "./site.mjs";
import { scanFriends } from "./scan.mjs";
import { mountView } from "./view.mjs";

export function initialize(window) {
  const { document, location } = window;
  if (
    location.protocol !== "https:" ||
    !["bgm.tv", "bangumi.tv", "chii.in"].includes(location.host) ||
    !/^\/user\/[^/]+\/?$/.test(location.pathname)
  )
    return;
  const attach = () => {
    const services = document.querySelector(
      "#user_home .user_box ul.network_service",
    );
    if (!services || document.getElementById("second-degree-friends-entry"))
      return;
    let home;
    try {
      home = readHome(document, location.href);
    } catch {
      return;
    }
    const item = document.createElement("li");
    item.id = "second-degree-friends-entry";
    item.innerHTML =
      '<span class="service" style="background-color:#b58a00;color:#fff">SecondDegreeFriends</span> <span class="tip"><a class="l" href="#">二度好友发现</a></span>';
    services.append(item);
    mountView(window, item.querySelector("a"), () => scanFriends(window, home));
  };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", attach, { once: true });
  else attach();
}
