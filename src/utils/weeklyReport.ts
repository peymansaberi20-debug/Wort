/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * weeklyReport.ts — گزارش هفتگی با AI (درخواست کاربر ۱۲)
 *
 * هر یکشنبه (یا هر روز اگر کاربر دلش خواست) یک گزارش هفتگی تولید می‌کند:
 *   - آمار تمرین‌های هفتهٔ گذشته
 *   - نرخ دقت
 *   - واژه‌های جدیدی که اضافه شده
 *   - نقاط ضعف برجسته
 *   - توصیه‌های هفتهٔ آینده
 *
 * ساختار دادهٔ خروجی AI (JSON):
 *   - summaryFa: چکیدهٔ فارسی
 *   - strengthsFa: نکات مثبت
 *   - improvementsFa: نقاط بهبود
 *   - recommendationFa: توصیهٔ هفتهٔ آینده
 */
import { AppState } from '../types';
import { DAY, dstr, dayStart } from './dates';
import { generateWithGemini, parseAI } from './ai';
import { analyzeWeaknesses } from './weaknessAnalysis';
import { streakCount } from './storage';

const ARCHIVE_KEY = 'wb_weekly_report_arch_v1';
// درخواست کاربر ۱۱: روز هفته برای ساخت گزارش (پیش‌فرض جمعه)
const REPORT_DAY_KEY = 'wb_weekly_report_day_v1';

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=یکشنبه، 1=دوشنبه، ...، 5=جمعه، 6=شنبه

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  0: 'یکشنبه',
  1: 'دوشنبه',
  2: 'سه‌شنبه',
  3: 'چهارشنبه',
  4: 'پنجشنبه',
  5: 'جمعه',
  6: 'شنبه'
};

/** روز هفتهٔ انتخاب‌شده برای ساخت گزارش (پیش‌فرض جمعه = 5) */
export const getReportWeekday = (): Weekday => {
  try {
    const v = parseInt(localStorage.getItem(REPORT_DAY_KEY) || '5', 10);
    return (v >= 0 && v <= 6 ? v : 5) as Weekday;
  } catch { return 5; }
};

export const setReportWeekday = (d: Weekday): void => {
  try { localStorage.setItem(REPORT_DAY_KEY, String(d)); } catch { /* ignore */ }
};

/** آیا امروز روز ساخت گزارش است؟ */
export const isReportDay = (): boolean => new Date().getDay() === getReportWeekday();

export interface WeeklyStats {
  totalExercises: number;
  correctExercises: number;
  accuracy: number;
  newWordsAdded: number;
  byType: Record<string, { total: number; correct: number }>;
  byDay: { date: string; count: number }[];
  streakDays: number;
  weakAreasCount: number;
  b2Readiness: number;
}

export interface WeeklyReport {
  id: string;
  /** شناسهٔ هفته: YYYY-MM-DD شروع هفته (یکشنبه) */
  weekStart: string;
  weekEnd: string;
  stats: WeeklyStats;
  summaryFa: string;
  strengthsFa: string[];
  improvementsFa: string[];
  recommendationFa: string;
  generatedAt: number;
}

const computeWeeklyStats = (state: AppState): WeeklyStats => {
  const now = Date.now();
  const t7ago = now - 7 * DAY;
  const hist = state.hist.filter(x => x.t > t7ago);
  const total = hist.length;
  const correct = hist.filter(x => x.ok).length;
  const accuracy = total ? Math.round((correct / total) * 100) : 0;
  const newWordsAdded = state.words.filter(w => (w.added || 0) > t7ago).length;

  const byType: Record<string, { total: number; correct: number }> = {};
  for (const x of hist) {
    const k = x.type || 'unknown';
    if (!byType[k]) byType[k] = { total: 0, correct: 0 };
    byType[k].total++;
    if (x.ok) byType[k].correct++;
  }

  const byDay: { date: string; count: number }[] = [];
  const dayMap = new Map<string, number>();
  for (let i = 6; i >= 0; i--) {
    const ts = dayStart(-i);
    const d = dstr(ts);
    dayMap.set(d, 0);
  }
  for (const x of hist) {
    const d = dstr(x.t);
    if (dayMap.has(d)) dayMap.set(d, (dayMap.get(d) || 0) + 1);
  }
  for (const [d, count] of dayMap.entries()) byDay.push({ date: d, count });

  const report = analyzeWeaknesses(state);
  const weakAreasCount = report.topWeaknesses.length;
  const b2Readiness = report.b2.score;
  const streakDays = streakCount(state.hist);

  return { totalExercises: total, correctExercises: correct, accuracy, newWordsAdded, byType, byDay, streakDays, weakAreasCount, b2Readiness };
};

const buildPrompt = (stats: WeeklyStats): string => {
  const byTypeStr = Object.entries(stats.byType)
    .map(([k, v]) => `- ${k}: ${v.correct}/${v.total} (دقت ${Math.round((v.correct / Math.max(1, v.total)) * 100)}٪)`)
    .join('\n');
  const byDayStr = stats.byDay.map(d => `- ${d.date}: ${d.count} تمرین`).join('\n');
  return `تو یک مربی آلمانی برای فارسی‌زبانان هستی. گزارش هفتگیِ پیشرفت دانش‌آموز را بر اساس آمار زیر به فارسی بنویس.

آمار هفتگی:
- کل تمرین‌ها: ${stats.totalExercises}
- پاسخ‌های درست: ${stats.correctExercises}
- نرخ دقت: ${stats.accuracy}٪
- واژه‌های جدید اضافه‌شده: ${stats.newWordsAdded}
- روزهای استمرار: ${stats.streakDays}
- آمادگی B2: ${stats.b2Readiness}٪
- تعداد نقاط ضعف: ${stats.weakAreasCount}

تفکیک بر اساس نوع تمرین:
${byTypeStr || '—'}

تفکیک بر اساس روز:
${byDayStr || '—'}

بخواه:
- "summaryFa": یک پاراگراف کوتاه (۲-۳ جمله) — چه هفته‌ای داشت و چقدر پیشرفت کرد.
- "strengthsFa": آرایه‌ای از ۱-۳ نقطهٔ قوت واقعی بر اساس آمار (کوتاه).
- "improvementsFa": آرایه‌ای از ۱-۳ نقطهٔ بهبود بر اساس نقاط ضعف یا دقت پایین (کوتاه).
- "recommendationFa": یک توصیهٔ عملی برای هفتهٔ آینده (۱-۲ جمله).

فقط یک JSON آرایه‌ای با یک آبجکت داخلش برگردان:
\`\`\`json
[{"summaryFa":"...","strengthsFa":["..."],"improvementsFa":["..."],"recommendationFa":"..."}]
\`\`\`
اعتبارسنجی داخلی JSON انجام بده. بیرون از fence متنی ننویس.`;
};

export const generateWeeklyReport = async (state: AppState): Promise<WeeklyReport> => {
  const stats = computeWeeklyStats(state);
  const now = Date.now();
  // شناسهٔ هفته: یکشنبهٔ این هفته
  const d = new Date();
  const dow = d.getDay();
  const sunday = new Date(d.getTime() - dow * DAY);
  const weekStart = dstr(sunday.getTime());
  const weekEnd = dstr(sunday.getTime() + 6 * DAY);
  let aiPart: { summaryFa: string; strengthsFa: string[]; improvementsFa: string[]; recommendationFa: string };
  try {
    const out = await generateWithGemini(buildPrompt(stats), { timeoutMs: 60000, retries: 1 });
    const parsed = parseAI(out)[0] as any;
    aiPart = {
      summaryFa: String(parsed?.summaryFa || ''),
      strengthsFa: Array.isArray(parsed?.strengthsFa) ? parsed.strengthsFa.map((s: any) => String(s || '')) : [],
      improvementsFa: Array.isArray(parsed?.improvementsFa) ? parsed.improvementsFa.map((s: any) => String(s || '')) : [],
      recommendationFa: String(parsed?.recommendationFa || '')
    };
  } catch (e) {
    // اگر AI در دسترس نبود، یک گزارش پایه تولید کن
    aiPart = {
      summaryFa: `این هفته ${stats.totalExercises} تمرین انجام دادی با دقت ${stats.accuracy}٪. ${stats.newWordsAdded} واژهٔ جدید اضافه کردی و ${stats.streakDays} روز استمرار داشتی.`,
      strengthsFa: stats.accuracy >= 70 ? ['دقت پاسخ‌ها خوب است.'] : [],
      improvementsFa: stats.weakAreasCount > 0 ? ['روی نقاط ضعف تمرکز کن.'] : [],
      recommendationFa: stats.totalExercises < 30 ? 'هفتهٔ آینده سعی کن تعداد تمرین‌ها را افزایش بده.' : 'استمرار را حفظ کن.'
    };
  }
  const report: WeeklyReport = {
    id: `wr-${weekStart}`,
    weekStart,
    weekEnd,
    stats,
    ...aiPart,
    generatedAt: now
  };
  // ذخیره در آرشیو
  try {
    const arch = loadWeeklyReports();
    const next = [report, ...arch.filter(r => r.id !== report.id)].slice(0, 12);
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
  return report;
};

export const loadWeeklyReports = (): WeeklyReport[] => {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
};

/** آیا گزارش این هفته قبلاً تولید شده؟ */
export const hasThisWeekReport = (): boolean => {
  const d = new Date();
  const dow = d.getDay();
  const sunday = new Date(d.getTime() - dow * DAY);
  const weekStart = dstr(sunday.getTime());
  return loadWeeklyReports().some(r => r.weekStart === weekStart);
};
