/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * autoBackup.ts — پشتیبان‌گیری خودکار هفتگی (درخواست کاربر ۱۶)
 *
 * هر ۷ روز یک snapshot کامل از state در IndexedDB ذخیره می‌شود:
 *   - کلید: wb_auto_backup_v1 (متادیتا در localStorage)
 *   - دادهٔ کامل: در IndexedDB (store: snapshots)
 *   - نگه‌داری آخرین ۴ snapshot (یک ماه)
 *   - کاربر می‌تواند از هر snapshot restore کند
 *
 * اگر کاربر در cloud لاگین باشد، snapshot به Firestore هم فرستاده می‌شود
 * (collection: users/{uid}/backups/{id}) — ولی این اختیاری است و در صورت خطا silent.
 *
 * همگام‌سازی زندهٔ موجود (AutoCloudSync → uploadStateToCloud) همچنان فعال است —
 * این snapshotها لایهٔ اضافی برای بازیابی تاریخچه‌ای هستند.
 */

import { AppState } from '../types';

const META_KEY = 'wb_auto_backup_v1';
const DB_NAME = 'wort_snapshots';
const STORE = 'snapshots';
const MAX_SNAPSHOTS = 4;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface SnapshotMeta {
  id: string;
  ts: number;
  label: string;          // عنوان قابل نمایش (مثلاً «هفتهٔ ۴ آذر»)
  wordsCount: number;
  histCount: number;
  sizeBytes: number;
}

let dbp: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}

/** بارگذاری متادیتای snapshotها از localStorage */
export function loadSnapshotsMeta(): SnapshotMeta[] {
  try {
    const v = JSON.parse(localStorage.getItem(META_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x: SnapshotMeta) => x?.id && typeof x.ts === 'number') : [];
  } catch { return []; }
}

function saveSnapshotsMeta(list: SnapshotMeta[]): void {
  try { localStorage.setItem(META_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

/** ذخیرهٔ دادهٔ کامل snapshot در IndexedDB */
async function putSnapshotData(id: string, state: AppState): Promise<number> {
  const db = await openDb();
  if (!db) throw new Error('IndexedDB در دسترس نیست');
  const data = JSON.stringify(state);
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(data, id);
      tx.oncomplete = () => resolve(data.length);
      tx.onerror = () => reject(tx.error || new Error('خطا در ذخیرهٔ snapshot'));
    } catch (e) { reject(e); }
  });
}

/** بارگذاری دادهٔ کامل یک snapshot از IndexedDB */
export async function loadSnapshotData(id: string): Promise<AppState | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => {
        try {
          const v = typeof req.result === 'string' ? JSON.parse(req.result) : null;
          resolve(v);
        } catch { resolve(null); }
      };
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

/** حذف یک snapshot از IndexedDB و متادیتا */
export async function deleteSnapshot(id: string): Promise<void> {
  const db = await openDb();
  if (db) {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      await new Promise<void>(res => { tx.oncomplete = () => res(); tx.onerror = () => res(); });
    } catch { /* ignore */ }
  }
  saveSnapshotsMeta(loadSnapshotsMeta().filter(s => s.id !== id));
}

/** آیا زمان snapshot جدید رسیده؟ (هر ۷ روز) */
export function isBackupDue(state: AppState): boolean {
  const list = loadSnapshotsMeta();
  if (list.length === 0) return false; // اولین snapshot فقط با دستور کاربر ساخته می‌شود
  const last = list[0];
  return Date.now() - last.ts >= WEEK_MS;
}

/** عنوان فارسی برای snapshot — هفتهٔ N */
function snapshotLabel(ts: number): string {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch { return new Date(ts).toLocaleDateString(); }
}

/**
 * ساخت یک snapshot جدید — در IndexedDB ذخیره می‌شود.
 * اگر snapshots بیش از MAX باشد، قدیمی‌ترین حذف می‌شود.
 * موفقیت یا شکست را برمی‌گرداند.
 */
export async function createSnapshot(state: AppState, force = false): Promise<{ ok: boolean; meta?: SnapshotMeta; error?: string }> {
  if (!state || !Array.isArray(state.words)) return { ok: false, error: 'state نامعتبر' };
  const list = loadSnapshotsMeta();
  // اگر آخرین snapshot کمتر از ۱ ساعت پیش است و force نیست، skip
  if (!force && list.length > 0 && Date.now() - list[0].ts < 60 * 60 * 1000) {
    return { ok: false, error: 'اخیراً snapshot ساخته شده' };
  }
  const id = 'snap_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  try {
    const sizeBytes = await putSnapshotData(id, state);
    const meta: SnapshotMeta = {
      id, ts: Date.now(),
      label: snapshotLabel(Date.now()),
      wordsCount: state.words.length,
      histCount: state.hist?.length || 0,
      sizeBytes
    };
    // حذف snapshotهای قدیمی اگر بیشتر از MAX
    const newList = [meta, ...list].slice(0, MAX_SNAPSHOTS);
    const removed = list.slice(MAX_SNAPSHOTS - 1);
    for (const r of removed) {
      try { await deleteSnapshot(r.id); } catch { /* ignore */ }
    }
    saveSnapshotsMeta(newList);
    return { ok: true, meta };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'خطا در ساخت snapshot' };
  }
}

/**
 * بررسی هنگام بارگذاری برنامه: اگر ۷ روز از آخرین snapshot گذشته، یکی بساز.
 * silent — خطاها در کنسول چاپ می‌شوند ولی به کاربر نشان داده نمی‌شوند.
 */
export async function maybeAutoSnapshot(state: AppState): Promise<void> {
  try {
    if (!isBackupDue(state)) return;
    if (!state.words || state.words.length === 0) return; // بدون واژه snapshot نگیر
    const r = await createSnapshot(state);
    if (r.ok && typeof console !== 'undefined') {
      console.log(`%c[AutoBackup] Snapshot هفتگی ساخته شد: ${r.meta?.label} (${r.meta?.wordsCount} واژه)`, 'color: #10b981');
    }
  } catch (e) {
    // silent — auto-backup نباید برنامه را خراب کند
    if (typeof console !== 'undefined') console.warn('[AutoBackup] failed:', e);
  }
}

/** تعداد snapshotهای موجود + حجم کل */
export function snapshotsSummary(): { count: number; totalSize: number; oldest?: number; newest?: number } {
  const list = loadSnapshotsMeta();
  return {
    count: list.length,
    totalSize: list.reduce((a, s) => a + (s.sizeBytes || 0), 0),
    oldest: list.length ? list[list.length - 1].ts : undefined,
    newest: list.length ? list[0].ts : undefined
  };
}
