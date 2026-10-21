import { IDBFactory } from "fake-indexeddb";

export function sharedStorage() {
  const indexedDB = new IDBFactory();
  return {
    indexedDB,
    install(window) {
      Object.defineProperty(window, "indexedDB", {
        configurable: true,
        writable: true,
        value: indexedDB,
      });
    },
  };
}

export function interceptWrites(indexedDB, write) {
  return interceptTransactions(indexedDB, (transaction, mode) => {
    if (mode !== "readwrite") return;
    const objectStore = transaction.objectStore.bind(transaction);
    transaction.objectStore = (...args) => {
      const store = objectStore(...args);
      const put = store.put.bind(store);
      store.put = (...args) => write(put, ...args);
      return store;
    };
  });
}

// Fault injection stays at the browser database boundary, using real transactions.
export function interceptTransactions(indexedDB, intercept) {
  return {
    open(...args) {
      const opening = indexedDB.open(...args);
      opening.addEventListener("success", () => {
        const database = opening.result;
        const transaction = database.transaction.bind(database);
        database.transaction = (...args) => {
          const result = transaction(...args);
          intercept(result, args[1]);
          return result;
        };
      });
      return opening;
    },
  };
}
