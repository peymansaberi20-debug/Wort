/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * practiceTracker.ts — ثبت پیشرفت تمرین‌های انجام‌شده برای نمایش «۴ روز اخیر» (درخواست کاربر ۲)
 *
 * نگه‌داری تاریخچهٔ ۳۰ روزه از تمرین‌های انجام‌شده:
 *   - کلید: تاریخ YYYY-MM-DD
 *   - مقدار: تعداد تمرین‌های انجام‌شده در آن روز
 *
 * بر اساس این داده می‌توان فهمید کدام روزها اصلاً تمرین انجام نداده‌ایم.
 */
import { dstr, DAY } from './dates';

const KEY = 'wb_practice_tracker_v1';

interface TrackerShape { [date: string]: number }

const load = (): TrackerShape => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as TrackerShape;
  } catch { return {}; }
};

const save = (t: TrackerShape): void => {
  try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* ignore */ }
};

/** افزودن n تمرین به امروز (پس از هر تمرین موفق). */
export const recordPractice = (n = 1): void => {
  const t = load();
  const d = dstr(Date.now());
  t[d] = (t[d] || 0) + n;
  // پاک‌سازی قدیمی‌تر از ۶۰ روز
  const cutoff = dstr(Date.now() - 60 * DAY);
  for (const k of Object.keys(t)) if (k < cutoff) delete t[k];
  save(t);
};

/** آیا امروز تمرین انجام شده؟ */
export const hasPracticedToday = (): boolean => {
  const t = load();
  return (t[dstr(Date.now())] || 0) > 0;
};

/** لیست تاریخ‌های بدون تمرین در N روز گذشته. */
export const idleDays = (days: number): string[] => {
  const t = load();
  const out: string[] = [];
  for (let i = 1; i <= days; i++) {
    const d = dstr(Date.now() - i * DAY);
    if (!t[d] || t[d] === 0) out.push(d);
  }
  return out;
};

/** تعداد روزهای پیاپیِ اخیر که اصلاً تمرین نشده. */
export const idleStreak = (): number => {
  const t = load();
  let count = 0;
  for (let i = 1; i <= 30; i++) {
    const d = dstr(Date.now() - i * DAY);
    if (!t[d] || t[d] === 0) count++;
    else break;
  }
  return count;
};

/** تعداد کل تمرین‌های N روز گذشته. */
export const totalPracticesLastNDays = (days: number): number => {
  const t = load();
  let sum = 0;
  for (let i = 0; i < days; i++) {
    const d = dstr(Date.now() - i * DAY);
    sum += t[d] || 0;
  }
  return sum;
};

/**
 * تعیین اینکه کدام تمرین‌ها (نوع‌ها) در ۴ روز اخیر «اصلاً» انجام نشده‌اند.
 * این داده‌ها از state.hist هم استخراج می‌شوند چون هر تمرین یک HistItem ثبت می‌کند.
 * تمرین‌هایی که در ۴ روز اخیر اصلاً انجام نشده‌اند:
 *   - اگر قبلاً انجام شده‌اند و از ۴ روز گذشته برمی‌گردیم → «معوق»
 *   - اگر در کل انجام نشده‌اند → «پیشنهادی برای امروز»
 */
export const recentPracticeTypes = (hist: { t: number; type: string }[], days = 4): Set<string> => {
  const cutoff = Date.now() - days * DAY;
  const out = new Set<string>();
  for (const x of hist) {
    if (x.t > cutoff && x.type) out.add(x.type);
  }
  return out;
};

/** لیست «تمرین‌های دیرهنگام» — نوع‌هایی که در ۴ روز اخیر انجام نشده‌اند. */
export const LATE_PRACTICE_TYPES: { type: string; icon: string; title: string; nav: string }[] = [
  { type: 'cloze', icon: '📖', title: 'تکمیل جا خالی', nav: 'cloze' },
  { type: 'art', icon: '🔤', title: 'حرف معرف', nav: 'art' },
  { type: 'conj', icon: '🔄', title: 'صرف فعل', nav: 'conj' },
  { type: 'tense', icon: '⏰', title: 'زمان فعل', nav: 'tense' },
  { type: 'plural', icon: '➕', title: 'جمع اسم', nav: 'plural' },
  { type: 'synant', icon: '🔗', title: 'مترادم و متضاد', nav: 'synant' },
  { type: 'prod', icon: '✏️', title: 'تولید واژه', nav: 'prod' },
  { type: 'flash', icon: '🃏', title: 'فلش‌کارت', nav: 'flash' },
  { type: 'case', icon: '🎯', title: 'حالت دستوری', nav: 'case' },
  { type: 'adjdecl', icon: '🎨', title: 'صرف صفت', nav: 'adjdecl' },
  { type: 'vprep', icon: '🪢', title: 'فعل+حرف اضافه', nav: 'vprep' },
  { type: 'konnektoren', icon: '🔗', title: 'حروف ربط', nav: 'konnektoren' },
  { type: 'hoeren', icon: '🎧', title: 'شنیداری', nav: 'hoeren_new' },
  { type: 'schreiben', icon: '✍️', title: 'نوشتاری', nav: 'schreiben' }
];

export const latePractices = (hist: { t: number; type: string }[], days = 4): { type: string; icon: string; title: string; nav: string }[] => {
  const recent = recentPracticeTypes(hist, days);
  return LATE_PRACTICE_TYPES.filter(p => !recent.has(p.type));
};
