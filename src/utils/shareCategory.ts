/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * shareCategory.ts — اشتراک‌گذاری دستهٔ واژگان با دوست (درخواست کاربر ۱۷)
 *
 * روند:
 *   ۱) کاربر یک دسته را انتخاب می‌کند.
 *   ۲) یک «کد اشتراک» ساخته می‌شود: base64(JSON({cat, words, ts, from}))
 *      - چون واژگان می‌توانند زیاد باشند (۵۰۰+ کلمه)، کد طولانی می‌شود
 *      - ولی همچنان قابل کپی/ارسال با پیام‌رسان است
 *   ۳) کاربر کد را با دوستش به اشتراک می‌گذارد (پیام، ایمیل، QR)
 *   ۴) دوست کد را در برنامه‌اش paste می‌کند و دسته وارد می‌شود
 *
 * جایگزین ابری: اگر بخواهیم کوتاه‌تر باشد، می‌توان به Firestore فرستاد و یک کد
 * ۶-کاراکتری گرفت — ولی برای حفظ حریم خصوصی و کار آفلاین، روش base64 محلی انتخاب شد.
 *
 * امنیت: فقط فیلدهای ضروری (de، art، fa، pos، lvl، ex، exFa، ex2، ex2Fa، conj، prat، perf، syn، synFa، tags، notes)
 * ارسال می‌شوند. آمار یادگیری شخصی (ok، bad، due، ivl، stage، win، stOk) هرگز ارسال نمی‌شود.
 */

import { Word } from '../types';

/** فیلدهایی که در اشتراک‌گذاری ارسال می‌شوند — فقط محتوای واژه، نه پیشرفت شخصی */
const SHAREABLE_FIELDS: (keyof Word)[] = [
  'de', 'art', 'fa', 'pos', 'lvl', 'cat',
  'ex', 'exFa', 'ex2', 'ex2Fa',
  'conj', 'prat', 'perf', 'sep',
  'syn', 'synFa', 'ant', 'antFa', 'pl',
  'tags', 'notes', 'en', 'def', 'register'
];

interface SharePayload {
  v: 1;
  cat: string;
  from?: string;        // نام/ایمیل فرستنده (اختیاری)
  ts: number;
  count: number;
  words: Partial<Word>[];
}

/**
 * ساخت کد اشتراک از یک دستهٔ واژگان.
 * @param cat نام دسته
 * @param words همهٔ واژگان (فیلتر می‌شوند)
 * @param from نام فرستنده (اختیاری)
 * @returns کد base64 قابل کپی
 */
export function createShareCode(cat: string, words: Word[], from?: string): string {
  const catWords = words.filter(w => w.cat === cat);
  const cleanWords = catWords.map(w => {
    const out: Partial<Word> = {};
    for (const k of SHAREABLE_FIELDS) {
      const v = (w as any)[k];
      if (typeof v === 'string' && v.trim()) (out as any)[k] = v;
    }
    return out;
  });
  const payload: SharePayload = {
    v: 1,
    cat,
    from: from || '',
    ts: Date.now(),
    count: cleanWords.length,
    words: cleanWords
  };
  // base64 با پشتیبانی از Unicode (UTF-8)
  const json = JSON.stringify(payload);
  const b64 = typeof window !== 'undefined' && typeof window.btoa === 'function'
    ? window.btoa(unescape(encodeURIComponent(json)))
    : Buffer.from(json, 'utf-8').toString('base64');
  return `WORT:${b64}`;
}

/**
 * تجزیهٔ کد اشتراک و بازگرداندن payload.
 * @throws Error اگر کد نامعتبر باشد
 */
export function parseShareCode(code: string): SharePayload {
  const trimmed = (code || '').trim();
  if (!trimmed.startsWith('WORT:')) throw new Error('کد اشتراک معتبر نیست — باید با «WORT:» شروع شود.');
  const b64 = trimmed.slice(5).trim();
  if (!b64) throw new Error('کد اشتراک خالی است.');
  let json: string;
  try {
    json = typeof window !== 'undefined' && typeof window.atob === 'function'
      ? decodeURIComponent(escape(window.atob(b64)))
      : Buffer.from(b64, 'base64').toString('utf-8');
  } catch { throw new Error('کد اشتراک خراب است — base64 نامعتبر.'); }
  let payload: SharePayload;
  try { payload = JSON.parse(json); }
  catch { throw new Error('کد اشتراک خراب است — JSON نامعتبر.'); }
  if (!payload || typeof payload !== 'object') throw new Error('کد اشتراک نامعتبر است.');
  if (payload.v !== 1) throw new Error(`نسخهٔ کد اشتراک پشتیبانی نمی‌شود (v=${payload.v}).`);
  if (!Array.isArray(payload.words)) throw new Error('کد اشتراک فهرست واژگان ندارد.');
  if (!payload.cat || typeof payload.cat !== 'string') throw new Error('کد اشتراک نام دسته ندارد.');
  return payload;
}

/**
 * پیش‌نمایش کد اشتراک بدون وارد کردن — فقط متادیتا.
 * برای نمایش «۵۰ واژه از Peyman» قبل از تأیید.
 */
export function previewShareCode(code: string): { cat: string; count: number; from: string; ts: number; valid: boolean; error?: string } {
  try {
    const p = parseShareCode(code);
    return { cat: p.cat, count: p.count, from: p.from || '', ts: p.ts, valid: true };
  } catch (e: any) {
    return { cat: '', count: 0, from: '', ts: 0, valid: false, error: e?.message || 'کد نامعتبر' };
  }
}

/**
 * ساخت URL اشتراک با query string — برای ارسال با لینک.
 * مثال: https://app.example.com/?import=WORT:eyJ2Ijox...
 */
export function createShareUrl(cat: string, words: Word[], from?: string): string {
  const code = createShareCode(cat, words, from);
  // encodeURIComponent برای ایمن‌سازی در URL
  return `?import=${encodeURIComponent(code)}`;
}

/**
 * بررسی URL فعلی برای پارامتر import — اگر هست، کد را برمی‌گرداند.
 */
export function detectShareCodeInUrl(): string | null {
  if (typeof window === 'undefined' || !window.location) return null;
  try {
    const u = new URL(window.location.href);
    const code = u.searchParams.get('import');
    return code || null;
  } catch { return null; }
}

/**
 * حذف پارامتر import از URL بدون reload.
 */
export function clearShareCodeFromUrl(): void {
  if (typeof window === 'undefined' || !window.history) return;
  try {
    const u = new URL(window.location.href);
    u.searchParams.delete('import');
    window.history.replaceState({}, '', u.toString());
  } catch { /* ignore */ }
}

/** تخمین حجم کد اشتراک (کیلو بایت) — برای نمایش به کاربر قبل از ساخت */
export function estimateShareSize(cat: string, words: Word[]): number {
  // هر واژه ~۲۰۰ بایت در JSON؛ base64 ~۱.۳۳ برابر بزرگ‌تر
  const catCount = words.filter(w => w.cat === cat).length;
  return Math.round((catCount * 200 * 1.33) / 1024);
}
