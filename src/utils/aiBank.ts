/**
 * aiBank.ts — بانک مشترکِ تمرین‌های ساخته‌شده با هوش مصنوعی (Firestore عمومی)
 *
 * درخواست کاربر: «تمرین‌های ایجادشده توسط هوش مصنوعی برای همهٔ تمرین‌ها در کلیهٔ تب‌ها و
 * مهارت‌ها در برنامه ذخیره شود و با همان ایمیل از دستگاه دیگر، با هر ایمیل دیگری، یا حتی
 * بدون ورود — همهٔ کاربران به آن‌ها دسترسی داشته باشند.»
 *
 * طراحی:
 *  - یک کالکشن عمومی Firestore به نام `ai_bank` — قوانین امنیتی آن open است (خواندن/نوشتن
 *    برای همه، حتی بدون ورود). بقیهٔ کالکشن‌ها (users/…) دست‌نخورده و محافظت‌شده می‌مانند.
 *  - هر تمرین یک سند با شناسهٔ ثابت `skill__id` → ذخیرهٔ تکراری همان تمرین idempotent است.
 *  - «push» هرگز مسیر برنامه را بلاک نمی‌کند؛ در نبود اینترنت به «صندوق ارسال»
 *    (outbox در localStorage) می‌رود و در اولین فرصت بعدی خودکار ارسال می‌شود.
 *  - «merge» فقط افزوده است: موارد ابری که روی این دستگاه نیستند به آرشیو محلی اضافه
 *    می‌شوند؛ هیچ‌چیز محلی حذف یا بازنویسی نمی‌شود (خط قرمز: هیچ قابلیتی کم نشود).
 *  - seen-set: شناسه‌هایی که یک‌بار از بانک دیده‌اند ثبت می‌شوند تا اگر کاربر یک تمرینِ
 *    ابری را محلی حذف کرد، در اجرای بعدی دوباره برنگردد (حذفِ محلی می‌چسبد).
 *  - داده‌های پیشرفت کاربر (پاسخ‌ها، نمره، تصحیح‌ها، گفتگوها) قبل از ارسال به بانک حذف
 *    می‌شوند (omitTop) — بانک فقط «تمرینِ ساخته‌شده» را نگه می‌دارد؛ پیشرفت هر دستگاه
 *    همان‌جا محلی می‌ماند مثل قبل.
 */
import { getFirestore, collection, getDocs, setDoc, doc, query, where, limit } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { ensureFirebase } from './cloud';

export const AI_BANK_COL = 'ai_bank';
export const AI_BANK_SCHEMA = 1;

const OUTBOX_KEY = 'wb_aibank_outbox_v1';
const SEEN_KEY = 'wb_aibank_seen_v1';
const OUTBOX_MAX = 120;
const FETCH_MAX = 200;
/** سند Firestore سقف ۱MiB دارد — با حاشیهٔ امن چک می‌شود */
const MAX_DOC_CHARS = 900000;

export interface AiBankMeta {
  title?: string;
  level?: string;
  topic?: string;
  kind?: string;
  count?: number;
}

export interface AiBankItem<T = any> {
  id: string;
  ts: number;
  data: T;
  author?: string;
}

/* ───────────────────────── Firestore (lazy) ───────────────────────── */

function db() {
  ensureFirebase();
  return getFirestore();
}

/** Firestore مقدار undefined را نمی‌پذیرد — پاک‌سازی بازگشتی (null → '' مثل cloud.ts) */
function sanitize<T>(value: T): T {
  if (value === undefined) return undefined as unknown as T;
  if (value === null) return value;
  if (Array.isArray(value)) return value.map(v => sanitize(v)) as unknown as T;
  if (typeof value === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(value as any)) {
      const clean = sanitize(v);
      if (clean !== undefined) out[k] = clean === null ? '' : clean;
    }
    return out;
  }
  return value;
}

/** نسخهٔ سطح اول از آبژه بدون کلیدهای داده‌شده (برای حذف پیشرفت کاربر قبل از ارسال) */
export function omitTop<T extends Record<string, any>>(obj: T, keys: string[]): T {
  const out: any = { ...(obj || {}) };
  keys.forEach(k => { delete out[k]; });
  return out as T;
}

/** ایمیل نویسنده (فقط برای نمایش) — بدون ورود: مهمان */
export function aiBankAuthor(): string {
  try { return getAuth().currentUser?.email || 'مهمان'; } catch { return 'مهمان'; }
}

export const aiBankDocId = (skill: string, id: string): string => `${skill}__${id}`;

/* ───────────────────────── صندوق ارسال (آفلاین) ───────────────────────── */

interface OutboxRec { skill: string; id: string; data: any; meta: AiBankMeta; at: number }

const loadOutbox = (): OutboxRec[] => {
  try { const a = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
};
const saveOutbox = (o: OutboxRec[]): void => {
  try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(o.slice(-OUTBOX_MAX))); } catch { /* ignore */ }
};

async function writeDoc(skill: string, id: string, data: any, meta: AiBankMeta): Promise<void> {
  const payload = sanitize(data);
  const chars = JSON.stringify(payload || '').length;
  if (chars > MAX_DOC_CHARS) throw new Error('ai_bank_too_big');
  await setDoc(doc(db(), AI_BANK_COL, aiBankDocId(skill, id)), {
    skill, id, ts: (payload as any)?.ts || Date.now(),
    meta: sanitize(meta), data: payload, author: aiBankAuthor(), v: AI_BANK_SCHEMA
  });
}

/**
 * ارسال یک تمرین به بانک مشترک — آتش‌وفراموش: هیچ‌وقت throw نمی‌کند و مسیر تمرین را
 * بلاک نمی‌کند. اگر شبکه در دسترس نبود، در outbox صف می‌شود تا بعداً خودکار ارسال شود.
 */
export function pushAiBank(skill: string, id: string, data: any, meta: AiBankMeta = {}): void {
  if (!skill || !id || !data) return;
  // صف‌شدنِ همیشگی + ارسال پس‌زمینه: حتی در حالت آنلاین اول در صف می‌رود و بعد از
  // موفقیت از صف حذف می‌شود — این‌طوری در قطعِ وسطِ ارسال هم چیزی گم نمی‌شود.
  const rec: OutboxRec = { skill, id, data, meta, at: Date.now() };
  const box = loadOutbox().filter(x => !(x.skill === skill && x.id === id));
  box.push(rec);
  saveOutbox(box);
  void flushAiBankOutbox();
}

/** خالی‌کردن صندوق ارسال — قبل از هر fetch صدا زده می‌شود */
export async function flushAiBankOutbox(): Promise<void> {
  const box = loadOutbox();
  if (!box.length) return;
  const done = new Set(box.map(r => `${r.skill}__${r.id}`));
  const failed: OutboxRec[] = [];
  for (const rec of box) {
    try { await writeDoc(rec.skill, rec.id, rec.data, rec.meta); }
    catch { failed.push(rec); }
  }
  // رکوردهایی که حین ارسال به صف اضافه شدند نباید پاک شوند — با شکست‌ها ادغام می‌شوند
  const fresh = loadOutbox().filter(r => !done.has(`${r.skill}__${r.id}`));
  if (failed.length || fresh.length) {
    const byKey = new Map<string, OutboxRec>();
    failed.forEach(r => byKey.set(`${r.skill}__${r.id}`, r));
    fresh.forEach(r => byKey.set(`${r.skill}__${r.id}`, r));
    saveOutbox(Array.from(byKey.values()));
  } else {
    saveOutbox([]);
  }
}

/* ───────────────────────── خواندن از بانک ───────────────────────── */

/** آخرین تمرین‌های یک مهارت از بانک مشترک (مرتب از نو به کهنه) */
export async function fetchAiBank<T = any>(skill: string, max = 60): Promise<AiBankItem<T>[]> {
  try {
    await flushAiBankOutbox();
    const q = query(collection(db(), AI_BANK_COL), where('skill', '==', skill), limit(FETCH_MAX));
    const snap = await getDocs(q);
    const items: AiBankItem<T>[] = [];
    snap.forEach(d => {
      const v = d.data() as any;
      if (v && v.id && v.data) items.push({ id: String(v.id), ts: +v.ts || 0, data: v.data, author: v.author });
    });
    items.sort((a, b) => b.ts - a.ts);
    return items.slice(0, max);
  } catch {
    return []; // آفلاین / قوانین / خطا → همان رفتار محلی قبلی، بدون مزاحمت
  }
}

/* ───────────────────────── seen-set (حذفِ محلی بچسبد) ───────────────────────── */

const loadSeen = (): Record<string, string[]> => {
  try { const m = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); return m && typeof m === 'object' ? m : {}; } catch { return {}; }
};

/** شناسه‌هایی که از بانک قبلاً دیده شده‌اند (این اجرا را شامل نمی‌شود — اول seenIds را بگیر) */
export const aiBankSeenIds = (skill: string): Set<string> => {
  try { return new Set(loadSeen()[skill] || []); } catch { return new Set(); }
};

export function aiBankMarkSeen(skill: string, ids: string[]): void {
  if (!ids.length) return;
  try {
    const m = loadSeen();
    const set = new Set(m[skill] || []);
    ids.forEach(i => set.add(i));
    const arr = Array.from(set);
    m[skill] = arr.length > 3000 ? arr.slice(-3000) : arr;
    localStorage.setItem(SEEN_KEY, JSON.stringify(m));
  } catch { /* ignore */ }
}

/**
 * ادغامِ افزودهٔ فهرست ابری در فهرست محلی — هیچ‌چیز محلی بازنویسی/حذف نمی‌شود.
 * items ابری که شناسهٔشان محلی موجود است یا قبلاً دیده شده‌اند (و بعداً حذف شده‌اند) نادیده گرفته می‌شوند.
 * ترتیب: موارد تازه‌تر بالاتر؛ بدون ts، بعد از موارد محلی.
 */
export function mergeAiBank<T extends { id?: string; ts?: number }>(local: T[], cloud: AiBankItem<T>[], seen: Set<string>): T[] {
  const localIds = new Set(local.map(x => x?.id));
  const incoming = cloud
    .filter(c => c?.data && c?.id && !seen.has(c.id) && !localIds.has(c.id))
    .map(c => c.data);
  if (!incoming.length) return local;
  return [...local, ...incoming].sort((a, b) => (b?.ts || 0) - (a?.ts || 0));
}
