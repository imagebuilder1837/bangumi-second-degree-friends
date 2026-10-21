export function clock() {
  let now = Date.parse("2026-01-01T00:00:00Z");
  let next = 0;
  const timers = new Map();
  return {
    install(window) {
      window.Date = class extends Date {
        static now() {
          return now;
        }
      };
      window.Math = Object.create(Math);
      window.Math.random = () => 0.5;
      window.setTimeout = (callback, delay) => {
        const id = ++next;
        timers.set(id, {
          callback,
          at: now + (delay > 2147483647 ? 1 : delay),
        });
        return id;
      };
      window.clearTimeout = (id) => timers.delete(id);
    },
    async tick(milliseconds) {
      const end = now + milliseconds;
      await new Promise((resolve) => setImmediate(resolve));
      while (true) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at;
        timers.delete(due[0]);
        due[1].callback();
        await new Promise((resolve) => setImmediate(resolve));
      }
      now = end;
      await new Promise((resolve) => setImmediate(resolve));
    },
    now: () => now,
  };
}
