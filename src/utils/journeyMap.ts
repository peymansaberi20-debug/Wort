/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * journeyMap.ts — مسیر سفر A1 → C2 (درخواست کاربر ۹)
 *
 * محاسبهٔ اینکه کاربر در مسیر یادگیری کجاست:
 *   - ایستگاه فعلی (A1/A2/B1/B2/C1/C2)
 *   - درصد پیشرفت در هر ایستگاه
 *   - فاصله تا ایستگاه بعدی
 *
 * دادهٔ مبنای محاسبه:
 *   - تعداد واژگان هر سطح (lvl)
 *   - تعداد واژگان مسلط در هر سطح (ivl >= 21)
 *   - دقت در هر سطح از state.hist
 */
import { AppState, Word } from '../types';
import { dstr, DAY } from './dates';

export type Station = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export interface JourneyStation {
  level: Station;
  icon: string;
  title: string;
  /** تعداد واژگان مسلط در این سطح */
  mastered: number;
  /** تعداد کل واژگان در این سطح */
  total: number;
  /** درصد پیشرفت در این سطح */
  progress: number;
  /** دقت در این سطح (۰ تا ۱۰۰) بر اساس state.hist */
  accuracy: number;
  /** آیا این ایستگاه فعلی است؟ */
  current: boolean;
  /** آیا این ایستگاه کامل شده است؟ (progress >= 100) */
  completed: boolean;
  /** رنگ مرحله */
  color: string;
}

export interface JourneyMap {
  stations: JourneyStation[];
  /** ایستگاه فعلی */
  current: Station;
  /** درصد کلی مسیر (۰ تا ۱۰۰) */
  overall: number;
  /** تخمین تعداد واژگان مورد نیاز برای رسیدن به ایستگاه بعدی */
  remaining: number;
  /** تخمین مدت زمان برای رسیدن به ایستگاه بعدی (روز) بر اساس سرعت فعلی */
  estimatedDays: number;
}

const LVL_META: Record<Station, { icon: string; title: string; color: string; threshold: number }> = {
  A1: { icon: '🌱', title: 'بنیاد', color: 'from-emerald-400 to-emerald-600', threshold: 200 },
  A2: { icon: '🌿', title: 'مقدماتی', color: 'from-sky-400 to-sky-600', threshold: 400 },
  B1: { icon: '🌳', title: 'متوسط', color: 'from-blue-400 to-blue-600', threshold: 800 },
  B2: { icon: '🏔️', title: 'پیشرفته', color: 'from-violet-400 to-violet-600', threshold: 1500 },
  C1: { icon: '🏔️', title: 'حرفه‌ای', color: 'from-purple-500 to-purple-700', threshold: 3000 },
  C2: { icon: '👑', title: 'تسلط', color: 'from-amber-500 to-fuchsia-600', threshold: 5000 }
};

/** آستانهٔ «مسلط» برای واژه: ivl >= 21 روز */
const MASTERY_IVL = 21;

export const computeJourneyMap = (state: AppState): JourneyMap => {
  const words = state.words;
  const stations: JourneyStation[] = (Object.keys(LVL_META) as Station[]).map(level => {
    const wordsAtLevel = words.filter(w => (w.lvl || '').toUpperCase() === level);
    const mastered = wordsAtLevel.filter(w => (w.ivl || 0) >= MASTERY_IVL).length;
    const total = wordsAtLevel.length;
    const threshold = LVL_META[level].threshold;
    const progress = Math.min(100, Math.round((mastered / threshold) * 100));

    // دقت در این سطح از state.hist (۳۰ روز اخیر)
    const recent = state.hist.filter(x => x.t > Date.now() - 30 * DAY);
    const acc = recent.filter(x => {
      // پیدا کردن واژهٔ مربوطه برای فهم سطح آن
      const w = words.find(w => w.id === x.id);
      return w && (w.lvl || '').toUpperCase() === level;
    });
    const correct = acc.filter(x => x.ok).length;
    const accuracy = acc.length ? Math.round((correct / acc.length) * 100) : 0;

    return {
      level,
      icon: LVL_META[level].icon,
      title: LVL_META[level].title,
      mastered,
      total,
      progress,
      accuracy,
      current: false,
      completed: progress >= 100,
      color: LVL_META[level].color
    };
  });

  // پیدا کردن ایستگاه فعلی: اولین ایستگاهی که هنوز کامل نشده
  let current: Station = 'A1';
  for (const s of stations) {
    if (!s.completed) { current = s.level; break; }
    if (s.level === 'C2') current = 'C2';
  }
  const currentIdx = stations.findIndex(s => s.level === current);
  stations[currentIdx].current = true;

  // درصد کلی مسیر: میانگین وزنی ایستگاه‌ها
  const weights = [1, 1.2, 1.5, 2, 2.5, 3];
  let weightedSum = 0;
  let totalWeight = 0;
  stations.forEach((s, i) => {
    weightedSum += s.progress * weights[i];
    totalWeight += weights[i];
  });
  const overall = Math.round(weightedSum / totalWeight);

  // فاصله تا ایستگاه بعدی
  const nextStation = stations[currentIdx + 1];
  const currentThreshold = LVL_META[current].threshold;
  const remaining = Math.max(0, currentThreshold - stations[currentIdx].mastered);

  // تخمین روزها: بر اساس سرعت یادگیری هفتگی
  const weekAgo = Date.now() - 7 * DAY;
  const recentNew = words.filter(w => (w.added || 0) > weekAgo).length;
  const dailyRate = Math.max(1, Math.round(recentNew / 7));
  const estimatedDays = Math.max(1, Math.ceil(remaining / dailyRate));

  return {
    stations,
    current,
    overall,
    remaining,
    estimatedDays: nextStation ? estimatedDays : 0
  };
};
