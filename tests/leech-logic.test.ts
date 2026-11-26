/**
 * فاز ۵ — تست منطق واژهٔ سخت (لِیچ): ورود، خروج (بازیابی)، بازگشت و مهاجرت داده.
 * Run:  npx tsx --test src/tests/leech-logic.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Word } from '../types';
import {
  isLeech, isWeak, recordRecent, leechRecoveryProgress, leechRecoveryReady,
  norm, clearReviewHistory, LEECH_WINDOW, LEECH_EXIT_STREAK
} from '../utils/storage';

let seq = 0;
const mk = (p: Partial<Word> = {}): Word =>
  norm({ id: 't' + (++seq), de: 'Testwort', fa: 'آزمون', cat: 'تست', ...p }) as Word;

/* ---------- ورود با قاعدهٔ قدیمی (رفتار قبلی حفظ شده) ---------- */
test('legacy entry: bad >= threshold with lifetime error rate >= 40%', () => {
  assert.equal(isLeech(mk({ ok: 2, bad: 4 })), true);   // ۶۷٪
  assert.equal(isLeech(mk({ ok: 6, bad: 4 })), true);   // مرز ۴۰٪
  assert.equal(isLeech(mk({ ok: 7, bad: 4 })), false);  // ۳۶٪ — خروجِ ضمنی قدیمی
  assert.equal(isLeech(mk({ ok: 20, bad: 4 })), false); // ۱۷٪
  assert.equal(isLeech(mk({ ok: 0, bad: 4 })), true);   // ۱۰۰٪
  // زیر آستانه
  assert.equal(isLeech(mk({ ok: 0, bad: 3 })), false);
});

/* ---------- واژهٔ بدون پنجرهٔ اخیر: دقیقاً مثل قبل ---------- */
test('windowless legacy word behaves exactly as before (no regression)', () => {
  const w = mk({ ok: 1, bad: 4 }); // ۸۰٪ — لِیچ
  // بدون هیچ پاسخِ ثبت‌شدهٔ جدید، هنوز لِیچ است
  assert.equal(isLeech(w), true);
  assert.equal(leechRecoveryProgress(w).ready, false);
});

/* ---------- خروج با قاعدهٔ جدید: زنجیرهٔ درستِ پیاپی + دقت اخیر ---------- */
test('streak exit: 3 consecutive correct + enough evidence frees the word', () => {
  const w = mk({ ok: 2, bad: 4 }); // لِیچ ۶۷٪
  assert.equal(isLeech(w), true);

  // ۳ درستِ پیاپی — ولی فقط ۳ پاسخِ دیده‌شده (کمتر از حداقل ۵): هنوز خروج نمی‌گیرد
  for (let i = 0; i < 3; i++) recordRecent(w, true);
  assert.equal(w.stOk, 3);
  assert.equal(leechRecoveryReady(w), false, '3 answers observed < minimum evidence of 5');
  assert.equal(isLeech(w), true);

  // ۲ درستِ دیگر (مجموع ۵ پاسخِ اخیر، همه درست) → خروج با مسیر زنجیره
  recordRecent(w, true);
  recordRecent(w, true);
  assert.equal(w.stOk, 5);
  assert.equal(leechRecoveryReady(w), true);
  assert.equal(isLeech(w), false, 'chronic leech graduates via recovery streak');
});

/* ---------- لِیچ مزمن: خروج بدون نیاز به ۱۹ درستِ پیاپیِ قاعدهٔ قدیمی ---------- */
test('chronic leech graduates with 5 straight correct, not 19', () => {
  const w = mk({ ok: 3, bad: 12 }); // ۸۰٪ — با قاعدهٔ قدیمی تا ok=19 لِیچ می‌ماند
  assert.equal(isLeech(w), true);
  for (let i = 0; i < LEECH_EXIT_STREAK; i++) recordRecent(w, true);
  assert.equal(isLeech(w), true, 'streak alone without enough evidence is not enough');
  recordRecent(w, true);
  recordRecent(w, true);
  assert.equal(isLeech(w), false);
});

/* ---------- مسیر قدیمی خروج همچنان کار می‌کند ---------- */
test('legacy exit path (lifetime ratio < 40%) still works', () => {
  const w = mk({ ok: 7, bad: 4 }); // ۳۶٪
  assert.equal(isLeech(w), false);
  // حتی بدون هیچ زنجیره‌ای (win/stOk ندارند) — همان رفتار قدیمی
  assert.equal(w.win, undefined);
});

/* ---------- بازگشت به لیست: واژهٔ خروج‌گرفتهٔ شکننده با غلطِ جدید دوباره 🩸 می‌شود ---------- */
test('fragile graduate re-enters on a new mistake and re-heals with 3 correct', () => {
  const w = mk({ ok: 3, bad: 12 });
  for (let i = 0; i < 5; i++) recordRecent(w, true);
  assert.equal(isLeech(w), false); // فارغ‌التحصیل شد

  // یک غلطِ جدید: زنجیره صفر می‌شود و چون نرخ خطای کل هنوز بالاست → دوباره 🩸
  recordRecent(w, false);
  assert.equal(w.stOk, 0);
  assert.equal(isLeech(w), true, 'still fragile — one lapse re-flags it');

  // ۳ درستِ پیاپی: پنجرهٔ اخیر خطا ≈ ۱۷٪ ≤ ۳۰٪ → دوباره آزاد
  for (let i = 0; i < 3; i++) recordRecent(w, true);
  assert.equal(isLeech(w), false);
});

/* ---------- ورودِ اخیر: واژهٔ فرسوده که قبلاً مسلط بود ---------- */
test('decayed word (high lifetime ok) gets flagged by the recent-window rule', () => {
  const w = mk({ ok: 30, bad: 2 }); // نرخ کل ۶٪ — با منطق قدیمی هرگز لِیچ نمی‌شد
  assert.equal(isLeech(w), false);
  // ۴ غلطِ پیاپیِ جدید روی ۶ درستِ قبلیِ اخیر
  for (let i = 0; i < 6; i++) recordRecent(w, true);
  for (let i = 0; i < 4; i++) recordRecent(w, false);
  // پنجرهٔ اخیر: ۴ خطا در ۱۰ پاسخ (۴۰٪) → لِیچ — مسیر خروجِ «نرخ کل» اینجا معنا ندارد
  assert.equal(isLeech(w), true, 'recent window: 4 errors in last 10 (40%)');
  assert.equal(leechRecoveryProgress(w).byRecent, true);
  assert.equal(leechRecoveryProgress(w).byLifetime, false);
  // بازیابی: خطاهای اخیر باید از پنجرهٔ ۱۰تایی بیرون بروند — ۵ درست کافی نیست، ۷ درست لازم است
  for (let i = 0; i < 5; i++) recordRecent(w, true);
  assert.equal(isLeech(w), true, '4 recent errors still inside the window');
  recordRecent(w, true);
  recordRecent(w, true);
  assert.equal(isLeech(w), false, 'recent error rate diluted below 30%');
});

/* ---------- recordRecent: پنجرهٔ لغزان و ریست زنجیره ---------- */
test('recordRecent keeps a sliding window of 10 and resets streak on failure', () => {
  const w = mk({});
  for (let i = 0; i < 14; i++) recordRecent(w, true);
  assert.equal(w.win!.length, LEECH_WINDOW);
  recordRecent(w, false);
  assert.equal(w.win!.length, LEECH_WINDOW);
  assert.equal(w.win![LEECH_WINDOW - 1], 0, 'newest answer sits at the end');
  assert.equal(w.stOk, 0);
  recordRecent(w, true);
  assert.equal(w.stOk, 1);
  assert.equal(w.win![LEECH_WINDOW - 1], 1);
});

/* ---------- isWeak: بندِ اخیر ---------- */
test('isWeak catches recently failing words too', () => {
  // قاعدهٔ قدیمی: bad=2، ok=30 → ضعیف نیست
  const w = mk({ ok: 30, bad: 2 });
  assert.equal(isWeak(w), false);
  recordRecent(w, true);
  recordRecent(w, false);
  recordRecent(w, false); // پنجرهٔ [۱,۰,۰] — ۶۷٪ خطا
  assert.equal(isWeak(w), true, '2 of last 3 answers wrong → weak, short intervals');
});

/* ---------- مهاجرت norm: حفظ win/stOk در واردات و پشتیبان ---------- */
test('norm preserves win/stOk and sanitizes them', () => {
  const a = norm({ de: 'x', win: [1, 0, 1, 2], stOk: 2 }) as Word;
  assert.deepEqual(a.win, [1, 0, 1, 1]);
  assert.equal(a.stOk, 2);
  const b = norm({ de: 'x', win: 'not-an-array', stOk: -3 }) as Word;
  assert.equal(b.win, undefined);
  assert.equal(b.stOk, undefined);
  const c = norm({ de: 'x', win: Array(12).fill(1) }) as Word;
  assert.equal(c.win!.length, 10, 'window is capped at 10');
});

/* ---------- پاک‌کردن تاریخچه: پنجره و زنجیره هم صفر شوند ---------- */
test('clearReviewHistory resets window and streak too', () => {
  const w = mk({ ok: 6, bad: 4 });
  recordRecent(w, false);
  const st = { words: [w], hist: [], daily: { d: '', n: 0, r: 0 }, set: {} as any, v: 1, sv: 1 } as any;
  const cleared = clearReviewHistory(st);
  const cw = cleared.words[0];
  assert.equal(cw.ok, 0);
  assert.equal(cw.bad, 0);
  assert.equal(cw.win, undefined);
  assert.equal(cw.stOk, undefined);
  assert.equal(isLeech(cw), false);
});

/* ---------- مرز دقت اخیر: ۳۰٪ مجاز، ۴۰٪ نه ---------- */
test('recovery requires recent error rate <= 30%', () => {
  const w = mk({ ok: 2, bad: 4 });
  // ۱،۱،۱،۱،۰ — دقت اخیر ۸۰٪ (خطا ۲۰٪) و زنجیرهٔ ۴ → خروج
  recordRecent(w, true); recordRecent(w, true); recordRecent(w, true); recordRecent(w, true); recordRecent(w, false);
  recordRecent(w, true); recordRecent(w, true); recordRecent(w, true); recordRecent(w, true);
  // پنجره: [۱,۱,۱,۱,۰,۱,۱,۱,۱] — فقط ۹ پاسخ؛ یک پاسخ دیگر برای حداقل شواهد
  recordRecent(w, true);
  const rec = leechRecoveryProgress(w);
  assert.equal(rec.winErrPct, 10);
  assert.equal(rec.ready, true);
  assert.equal(isLeech(w), false);
});
