export function sharedStorage() {
  const values = new Map();
  const writes = [];
  let tail = Promise.resolve();
  let failWrite = false;
  let beforeLock;
  return {
    values,
    writes,
    failWrites() {
      failWrite = true;
    },
    beforeLock(callback) {
      beforeLock = callback;
    },
    install(window) {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: {
          getItem: (key) => values.get(key) ?? null,
          setItem: (key, value) => {
            if (failWrite) throw new Error("QuotaExceededError");
            values.set(key, value);
            writes.push(value);
          },
        },
      });
      Object.defineProperty(window.navigator, "locks", {
        configurable: true,
        value: {
          request: (name, options, callback) => {
            const pending = tail.then(async () => {
              await beforeLock?.();
              options.signal?.throwIfAborted();
              return callback();
            });
            tail = pending.catch(() => {});
            return pending;
          },
        },
      });
    },
  };
}
