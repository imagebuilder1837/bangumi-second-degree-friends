import { readHome } from "./site.mjs";
import { scanRelationships } from "./scan.mjs";
import { mountView } from "./view.mjs";
import { relationshipCache, cacheFailure } from "./cache.mjs";

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
      '<span class="service" style="background-color:#d9a300;color:#fff">SecondDegreeFriends</span> <span class="tip"><a class="l" href="#">二度好友发现</a></span>';
    services.append(item);
    const cache = relationshipCache(window, home);
    mountView(
      window,
      item.querySelector("a"),
      async (mode, options) => {
        const outcome = await scanRelationships(window, home, mode, options);
        if (outcome.complete) {
          try {
            await cache.commit(outcome.staged, options.signal);
          } catch (error) {
            options.signal.throwIfAborted();
            outcome.saveWarning = `缓存保存失败：${cacheFailure(error)}；旧缓存保留`;
          }
        }
        return outcome;
      },
      (mode) =>
        cache.lookup(mode).catch((error) => {
          throw new Error(cacheFailure(error));
        }),
    );
  };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", attach, { once: true });
  else attach();
}
