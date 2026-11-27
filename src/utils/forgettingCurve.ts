/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * forgettingCurve.ts — نمودار منحنی فراموشی (درخواست کاربر ۱۳)
 *
 * بر اساس دادهٔ واقعی واژه‌ها (آخرین مرور، فاصله، نرخ درست)، تخمین می‌زند
 * چه کسری از واژگان در هر روز فراموش می‌شود. یک نمودار ۳۰ روزه ارائه می‌دهد:
 *   - محور y: درصد مورد انتظارِ باقی‌مانده در حافظه
 *   - محور x: روزهای گذشته از آخرین مرور
 *
 * مدل ترکیبی Ebbinghaus + ضریب شخصی کاربر:
 *   retention(t) = exp(-t / S)   که S = میانگین فاصله موفق به‌علاوهٔ ease ضریبی
 */
import { AppState } from '../types';
import { DAY } from './dates';

export interface ForgettingPoint {
  day: number;        // ۰ تا ۳۰ روز بعد از آخرین مرور
  retention: number;  // درصد ۰ تا ۱۰۰ — سهم مورد انتظارِ باقی‌مانده
}

export interface ForgettingCurve {
  points: ForgettingPoint[];
  /** نقطهٔ فعلی کاربر: روزهای گذشته از آخرین مرورِ میانگین */
  currentDay: number;
  /** درصد فعلی مورد انتظار */
  currentRetention: number;
  /** پایداری میانگین بر اساس دادهٔ کاربر (روز) */
  stability: number;
  /** تخمین: چند روز دیگر تا ۵۰٪ فراموشی */
  halfLife: number;
  /** میانگین فاصله موفق */
  avgInterval: number;
  /** تعداد واژگان نمونه‌ای که این محاسبه بر اساس آن‌ها انجام شده */
  sampleSize: number;
}

/**
 * محاسبهٔ پایداری میانگین بر اساس دادهٔ واژگان.
 * فقط واژه‌هایی که حداقل یک بار مرور شده‌اند (w.last > 0) را در نظر می‌گیریم.
 * پایداری هر واژه = فاصلهٔ فعلی × ضریب (ease / 2 + 0.5)
 *     - ease پایین (۱.۳) → پایداری کوتاه
 *     - ease بالا (۲.۵) → پایداری بلند
 */
const computeStability = (state: AppState): { stability: number; avgInterval: number; sampleSize: number } => {
  const reviewed = state.words.filter(w => w.last && (w.ok || 0) > 0);
  if (reviewed.length === 0) return { stability: 2, avgInterval: 1, sampleSize: 0 };
  let totalStability = 0;
  let totalInterval = 0;
  let count = 0;
  for (const w of reviewed) {
    const ivl = Math.max(1, w.ivl || 1);
    const ease = Math.max(1.3, Math.min(3.0, w.ease || 2.3));
    const stability = ivl * (ease / 2 + 0.5);
    totalStability += stability;
    totalInterval += ivl;
    count++;
  }
  return {
    stability: totalStability / count,
    avgInterval: totalInterval / count,
    sampleSize: count
  };
};

export const computeForgettingCurve = (state: AppState): ForgettingCurve => {
  const { stability, avgInterval, sampleSize } = computeStability(state);
  // اگر داده‌ای نبود، از پیش‌فرض ۲ روز استفاده کن
  const S = Math.max(0.5, stability);
  const points: ForgettingPoint[] = [];
  for (let day = 0; day <= 30; day++) {
    const retention = Math.round(100 * Math.exp(-day / S));
    points.push({ day, retention });
  }
  // نقطهٔ فعلی کاربر: میانگین روزهای گذشته از آخرین مرور
  const now = Date.now();
  const reviewed = state.words.filter(w => w.last);
  let currentDay: number;
  let currentRetention: number;
  if (reviewed.length === 0) {
    currentDay = 0;
    currentRetention = 100;
  } else {
    const avgLast = reviewed.reduce((s, w) => s + (now - (w.last || 0)), 0) / reviewed.length;
    currentDay = Math.round(avgLast / DAY);
    currentRetention = Math.round(100 * Math.exp(-currentDay / S));
  }
  const halfLife = Math.round(S * Math.LN2); // t = S * ln(2)
  return { points, currentDay, currentRetention, stability: S, halfLife, avgInterval, sampleSize };
};

/**
 * لیست واژه‌هایی که در «نقطهٔ بحرانی» هستند:
 * پیش‌بینی می‌شود اکنون > ۵۰٪ فراموش شده باشند ولی هنوز سررسید نشده‌اند.
 */
export const criticalWords = (state: AppState, threshold = 50): { word: typeof state.words[0]; retention: number }[] => {
  const { stability } = computeStability(state);
  const S = Math.max(0.5, stability);
  const now = Date.now();
  return state.words
    .filter(w => w.last)
    .map(w => {
      const days = (now - (w.last || 0)) / DAY;
      const retention = Math.round(100 * Math.exp(-days / S));
      return { word: w, retention };
    })
    .filter(x => x.retention < threshold && (x.word.due || 0) > now)
    .sort((a, b) => a.retention - b.retention)
    .slice(0, 30);
};
