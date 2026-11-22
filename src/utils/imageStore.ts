/**
 * ذخیرهٔ دائمی عکس واژه‌ها در IndexedDB — ریشهٔ باگ «عکس بعد از بستن برنامه پاک می‌شود»:
 * عکس‌ها به‌صورت dataURL داخل JSON اصلی واژه‌ها در localStorage ذخیره می‌شدند؛
 * روی آیفون سهمیهٔ localStorage (~۵MB) با چند عکس پر می‌شود، کل ذخیرهٔ خودکار شکست می‌خورد
 * و در نتیجه عکس (و آخرین تغییرات) بعد از بازکردن دوبارهٔ برنامه پنهان می‌شد.
 * حالا عکس‌ها در IndexedDB (سهمیهٔ چند صد مگابایت) نگه‌داری می‌شوند و JSON اصلی سبک می‌ماند.
 * اگر IndexedDB در دسترس نباشد، ذخیره به روش قدیمی (داخل همان JSON) برمی‌گردد.
 */

const DB_NAME = 'wort_imgs';
const STORE = 'imgs';
let dbp: Promise<IDBDatabase | null> | null = null;
let broken = false;

function open(): Promise<IDBDatabase | null> {
  if (broken) return Promise.resolve(null);
  if (!dbp) {
    dbp = new Promise(resolve => {
      try {
        if (typeof indexedDB === 'undefined') { broken = true; resolve(null); return; }
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => { broken = true; resolve(null); };
        req.onblocked = () => { broken = true; resolve(null); };
      } catch {
        broken = true;
        resolve(null);
      }
    });
  }
  return dbp;
}

/** اگر true باشد عکس‌ها باید مثل قبل داخل JSON اصلی localStorage بمانند */
export function imgDbBroken(): boolean {
  return broken;
}

export function imgGetAll(): Promise<Record<string, string>> {
  return new Promise(resolve => {
    open().then(db => {
      if (!db) { resolve({}); return; }
      try {
        const store = db.transaction(STORE, 'readonly').objectStore(STORE);
        const valsReq = store.getAll();
        const keysReq = store.getAllKeys();
        const fail = () => resolve({});
        valsReq.onerror = fail;
        keysReq.onerror = fail;
        valsReq.onsuccess = () => {
          keysReq.onsuccess = () => {
            const out: Record<string, string> = {};
            const vals = (valsReq.result || []) as string[];
            const keys = (keysReq.result || []) as string[];
            keys.forEach((k, i) => { out[String(k)] = vals[i] || ''; });
            resolve(out);
          };
        };
      } catch {
        resolve({});
      }
    });
  });
}

export function imgPut(id: string, dataUrl: string): Promise<void> {
  return new Promise(resolve => {
    open().then(db => {
      if (!db) { resolve(); return; }
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(dataUrl, id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  });
}

export function imgPutMany(map: Record<string, string>): Promise<void> {
  return new Promise(resolve => {
    open().then(db => {
      if (!db) { resolve(); return; }
      try {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        Object.entries(map).forEach(([id, dataUrl]) => store.put(dataUrl, id));
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  });
}

export function imgDel(id: string): Promise<void> {
  return new Promise(resolve => {
    open().then(db => {
      if (!db) { resolve(); return; }
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  });
}

/** کلیدهای عکسِ واژه‌های حذف‌شده (یتیم) را پاک می‌کند — در شروع برنامه فراخوانی می‌شود */
export function imgDelNotIn(knownIds: Set<string>): Promise<void> {
  return new Promise(resolve => {
    open().then(db => {
      if (!db) { resolve(); return; }
      try {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        const keysReq = store.getAllKeys();
        keysReq.onsuccess = () => {
          (keysReq.result || []).forEach(k => {
            if (!knownIds.has(String(k))) store.delete(String(k));
          });
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  });
}
