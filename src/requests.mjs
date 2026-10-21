class TransientError extends Error {
  constructor(message, retryAt = 0) {
    super(message);
    this.retryAt = retryAt;
  }
}

function retryAfter(window, value) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const text = value.trim();
  if (/^\d+$/.test(text)) {
    const at = window.Date.now() + Number(text) * 1000;
    return Number.isFinite(at) ? at : undefined;
  }
  const date = new Date(Date.parse(text));
  if (!Number.isFinite(date.getTime())) return undefined;
  const canonical = text
    .replace(
      /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\d{2})-([A-Z][a-z]{2})-\d{2} (\d{2}:\d{2}:\d{2}) GMT$/,
      (_, day, number, month, time) =>
        `${day.slice(0, 3)}, ${number} ${month} ${date.getUTCFullYear()} ${time} GMT`,
    )
    .replace(
      /^([A-Z][a-z]{2}) ([A-Z][a-z]{2}) ([ \d]\d) (\d{2}:\d{2}:\d{2}) (\d{4})$/,
      (_, day, month, number, time, year) =>
        `${day}, ${number.trim().padStart(2, "0")} ${month} ${year} ${time} GMT`,
    );
  return canonical === date.toUTCString()
    ? Math.max(window.Date.now(), date.getTime())
    : undefined;
}

function wait(window, delay, signal) {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      window.clearTimeout(timer);
      reject(signal.reason);
    };
    const until = window.Date.now() + delay;
    let timer;
    const wake = () => {
      const remaining = until - window.Date.now();
      // Browsers clamp overflowing delays to almost immediate timers.
      if (remaining > 0)
        timer = window.setTimeout(wake, Math.min(remaining, 2147483647));
      else {
        signal.removeEventListener("abort", abort);
        resolve();
      }
    };
    signal.addEventListener("abort", abort, { once: true });
    wake();
  });
}

// Fetch and body reading must settle on cancellation even if a transport ignores abort.
async function attempt(window, url, signal, rateLimited) {
  signal.throwIfAborted();
  const controller = new window.AbortController();
  const cancel = () => controller.abort(signal.reason);
  signal.addEventListener("abort", cancel, { once: true });
  const timer = window.setTimeout(
    () => controller.abort(new TransientError("关系请求超时")),
    30000,
  );
  let abort;
  const cancelled = new Promise((_, reject) => {
    abort = () => reject(controller.signal.reason);
    controller.signal.addEventListener("abort", abort, { once: true });
  });
  try {
    return await Promise.race([
      (async () => {
        let response;
        try {
          response = await window.fetch(url, {
            credentials: "same-origin",
            signal: controller.signal,
          });
        } catch (error) {
          throw new TransientError(error.message);
        }
        controller.signal.throwIfAborted();
        if (!response.ok) {
          if (response.status === 429) {
            const until =
              retryAfter(window, response.headers?.get("Retry-After")) ??
              window.Date.now() + 60000;
            rateLimited(until);
            signal.throwIfAborted();
            throw new Error("HTTP 429");
          }
          if (
            response.status === 408 ||
            (response.status >= 500 && response.status <= 599)
          ) {
            const retryAt =
              response.status === 503
                ? retryAfter(window, response.headers?.get("Retry-After"))
                : undefined;
            throw new TransientError(
              `关系读取失败：HTTP ${response.status}`,
              retryAt,
            );
          }
          throw new Error("关系读取失败");
        }
        if (response.url && response.url !== url)
          throw new Error("关系请求跳转到其他页面");
        try {
          return await response.text();
        } catch (error) {
          throw new TransientError(error.message);
        }
      })(),
      cancelled,
    ]);
  } finally {
    window.clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
    controller.signal.removeEventListener("abort", abort);
  }
}

export async function requestText(window, url, signal, rateLimited) {
  for (let retry = 0; ; retry++) {
    try {
      return await attempt(window, url, signal, rateLimited);
    } catch (error) {
      signal.throwIfAborted();
      if (!(error instanceof TransientError) || retry === 2) throw error;
      const delay = Math.max(
        1000 * 2 ** retry + window.Math.random() * 250,
        error.retryAt - window.Date.now(),
      );
      await wait(window, delay, signal);
    }
  }
}
