// IndexedDB persistence used by the browser port of server.mjs.
//
// The stored values deliberately keep the same shapes as the Node server's
// JSON report cache and flat SQLite trend rows. server-core.js can therefore
// preserve its route and report logic while only replacing the persistence
// edge.

const DB_NAME = 'pdac-server';
const DB_VERSION = 2;
const REPORT_CACHE_RETENTION_DAYS = 30;

let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('reportCache')) {
          const reportCache = db.createObjectStore('reportCache');
          reportCache.createIndex('byDate', 'dateKey');
        }
        if (!db.objectStoreNames.contains('trendRows')) {
          const trendRows = db.createObjectStore('trendRows', {
            keyPath: 'id',
            autoIncrement: true,
          });
          trendRows.createIndex('byTable', 'table');
        }
        if (!db.objectStoreNames.contains('weeklySolutions')) {
          const weeklySolutions = db.createObjectStore('weeklySolutions', { keyPath: 'key' });
          weeklySolutions.createIndex('byAccount', 'accountHomeId');
          weeklySolutions.createIndex('byWeek', 'weekStart');
        }
        if (!db.objectStoreNames.contains('weeklyComponents')) {
          const weeklyComponents = db.createObjectStore('weeklyComponents', { keyPath: 'key' });
          weeklyComponents.createIndex('byAccount', 'accountHomeId');
          weeklyComponents.createIndex('byEvent', 'eventKey');
        }
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error(`IndexedDB upgrade for ${DB_NAME} is blocked.`));
    });
  }
  return dbPromise;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionToPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function withStore(storeName, mode, work) {
  const db = await openDb();
  const transaction = db.transaction(storeName, mode);
  const completed = transactionToPromise(transaction);
  try {
    const result = await work(transaction.objectStore(storeName), transaction);
    await completed;
    return result;
  } catch (error) {
    try {
      transaction.abort();
    } catch {}
    await completed.catch(() => {});
    throw error;
  }
}

function reportCacheKey(dateKey, cacheKey) {
  return `${dateKey}:${cacheKey}`;
}

function reportCacheCutoffDate() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - REPORT_CACHE_RETENTION_DAYS);
  return [
    cutoff.getFullYear(),
    String(cutoff.getMonth() + 1).padStart(2, '0'),
    String(cutoff.getDate()).padStart(2, '0'),
  ].join('-');
}

export async function reportCacheGetEntry(dateKey, cacheKey) {
  const value = await withStore('reportCache', 'readonly', (store) =>
    requestToPromise(store.get(reportCacheKey(dateKey, cacheKey))));
  return value?.entry || null;
}

export function reportCachePutEntry(dateKey, cacheKey, entry) {
  return withStore('reportCache', 'readwrite', async (store) => {
    store.put({ dateKey, cacheKey, entry }, reportCacheKey(dateKey, cacheKey));

    const staleKeys = await requestToPromise(
      store.index('byDate').getAllKeys(IDBKeyRange.upperBound(reportCacheCutoffDate(), true)),
    );
    for (const key of staleKeys) {
      store.delete(key);
    }
  });
}

export async function reportCacheListByDate(dateKey) {
  const values = await withStore('reportCache', 'readonly', (store) =>
    requestToPromise(store.index('byDate').getAll(IDBKeyRange.only(dateKey))));
  return values.map((value) => value.entry).filter(Boolean);
}

export function trendSelectRows(table) {
  return withStore('trendRows', 'readonly', (store) =>
    requestToPromise(store.index('byTable').getAll(IDBKeyRange.only(table))));
}

export function trendInsertRows(table, records = []) {
  return withStore('trendRows', 'readwrite', (store) => {
    for (const source of records) {
      const record = { ...source, table };
      delete record.id;
      store.add(record);
    }
  });
}

export function trendDeleteRows(table, predicateFn) {
  return withStore('trendRows', 'readwrite', (store) => new Promise((resolve, reject) => {
    let deleted = 0;
    const request = store.index('byTable').openCursor(IDBKeyRange.only(table));
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(deleted);
        return;
      }
      let shouldDelete = false;
      try {
        shouldDelete = Boolean(predicateFn(cursor.value));
      } catch (error) {
        reject(error);
        return;
      }
      if (shouldDelete) {
        cursor.delete();
        deleted += 1;
      }
      cursor.continue();
    };
  }));
}

export function trendReplaceRows(table, predicateFn, records = []) {
  return withStore('trendRows', 'readwrite', (store) => new Promise((resolve, reject) => {
    let deleted = 0;
    const request = store.index('byTable').openCursor(IDBKeyRange.only(table));
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        let shouldDelete = false;
        try {
          shouldDelete = Boolean(predicateFn(cursor.value));
        } catch (error) {
          reject(error);
          return;
        }
        if (shouldDelete) {
          cursor.delete();
          deleted += 1;
        }
        cursor.continue();
        return;
      }
      for (const source of records) {
        const record = { ...source, table };
        delete record.id;
        store.add(record);
      }
      resolve(deleted);
    };
  }));
}

export function weeklyReplaceEvents(records = []) {
  return withStores(['weeklySolutions', 'weeklyComponents'], 'readwrite', async (stores) => {
    const solutionStore = stores.weeklySolutions;
    const componentStore = stores.weeklyComponents;
    for (const source of records) {
      const record = { ...source };
      const components = Array.isArray(record.components) ? record.components : [];
      delete record.components;
      const existing = await requestToPromise(solutionStore.get(record.key));
      for (const componentKey of existing?.componentKeys || []) {
        componentStore.delete(componentKey);
      }
      record.componentKeys = components.map((component, index) => component.key || `${record.key}:${component.kind || 'other'}:${component.objectId || index}`);
      solutionStore.put(record);
      components.forEach((component, index) => {
        componentStore.put({
          ...component,
          key: record.componentKeys[index],
          eventKey: record.key,
          accountHomeId: record.accountHomeId,
        });
      });
    }
  });
}

export async function weeklyListEvents(accountHomeId = '') {
  const [events, components] = await Promise.all([
    withStore('weeklySolutions', 'readonly', (store) => requestToPromise(
      store.index('byAccount').getAll(IDBKeyRange.only(String(accountHomeId || ''))),
    )),
    withStore('weeklyComponents', 'readonly', (store) => requestToPromise(
      store.index('byAccount').getAll(IDBKeyRange.only(String(accountHomeId || ''))),
    )),
  ]);
  const componentsByEvent = new Map();
  for (const component of components) {
    if (!componentsByEvent.has(component.eventKey)) {
      componentsByEvent.set(component.eventKey, []);
    }
    const value = { ...component };
    delete value.accountHomeId;
    delete value.eventKey;
    componentsByEvent.get(component.eventKey).push(value);
  }
  return events.map((event) => ({
    ...event,
    components: (componentsByEvent.get(event.key) || [])
      .sort((left, right) => `${left.label || left.kind} ${left.name || ''}`.localeCompare(`${right.label || right.kind} ${right.name || ''}`)),
  }));
}

export function weeklyDeleteEventsBefore(cutoffDate) {
  return withStores(['weeklySolutions', 'weeklyComponents'], 'readwrite', (stores) => new Promise((resolve, reject) => {
    let deleted = 0;
    const request = stores.weeklySolutions.openCursor();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(deleted);
        return;
      }
      const eventDate = String(cursor.value.eventDate || cursor.value.eventAt || '').slice(0, 10);
      if (eventDate && eventDate < cutoffDate) {
        for (const componentKey of cursor.value.componentKeys || []) {
          stores.weeklyComponents.delete(componentKey);
        }
        cursor.delete();
        deleted += 1;
      }
      cursor.continue();
    };
  }));
}

async function withStores(storeNames, mode, work) {
  const db = await openDb();
  const transaction = db.transaction(storeNames, mode);
  const completed = transactionToPromise(transaction);
  const stores = Object.fromEntries(storeNames.map((storeName) => [storeName, transaction.objectStore(storeName)]));
  try {
    const result = await work(stores, transaction);
    await completed;
    return result;
  } catch (error) {
    try {
      transaction.abort();
    } catch {}
    await completed.catch(() => {});
    throw error;
  }
}
