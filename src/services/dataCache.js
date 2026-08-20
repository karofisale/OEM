// Persistent cache for the getBootstrap payload, so opening the app shows real
// data immediately instead of an empty loading screen while the backend answers.
//
// IndexedDB rather than localStorage on purpose. The payload measures ~590KB
// today and grows with the transaction history; localStorage would (a) block the
// main thread on every read AND write at that size, and (b) hit its ~5MB quota
// and start throwing once the Data tab grows a few times over. IndexedDB is
// async and has a far larger budget.
//
// Every function here degrades to a no-op instead of throwing: a browser with
// IndexedDB disabled (private mode, locked-down policy) must still run the app,
// just without the instant-open benefit.

const DB_NAME = 'oem_app_cache';
const DB_VERSION = 1;
const STORE = 'bootstrap';

// Bumped when the payload SHAPE changes, so an old cached entry from a previous
// deploy can never be handed to code that expects new fields.
const SCHEMA_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB không khả dụng'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB bị chặn'));
  });
}

function runTx(mode, fn) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(req ? req.result : undefined); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  }));
}

// Keyed per user: the payload is the same for everyone today, but role-based
// filtering is a known pending change, and a stale cache served across a user
// switch would show one salesperson another's figures.
function cacheKey(userName) {
  return `bootstrap:v${SCHEMA_VERSION}:${userName || 'anon'}`;
}

export async function readBootstrapCache(userName) {
  try {
    const entry = await runTx('readonly', store => store.get(cacheKey(userName)));
    if (!entry || !entry.data) return null;
    return entry;
  } catch {
    return null;
  }
}

export async function writeBootstrapCache(userName, data) {
  try {
    await runTx('readwrite', store =>
      store.put({ data, savedAt: Date.now() }, cacheKey(userName))
    );
  } catch {
    // Cache being unwritable must never break a successful data load.
  }
}

// Called on logout — business data shouldn't linger on a shared machine.
export async function clearBootstrapCache() {
  try {
    await runTx('readwrite', store => store.clear());
  } catch {
    /* nothing to do */
  }
}
