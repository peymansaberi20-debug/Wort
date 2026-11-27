/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * gamification.ts — گیمیفیکیشن سبک: streak freeze + achievements (درخواست کاربر ۸)
 *
 * Streak freeze:
 *   - اگر کاربر یک روز تمرین نکند، streak به ۰ نمی‌رسد — یک «freeze» مصرف می‌شود.
 *   - هر ماه ۲ freeze رایگان داده می‌شود (مثل Duolingo ولی سختر).
 *   - وقتی freezeها تمام شوند، streak واقعاً به ۰ می‌رسد.
 *
 * Achievements:
 *   - نشان‌های مبتنی برmilestoneها:
 *     🌱 اولین واژه — اضافه‌کردن اولین واژه
 *     📚 اولین ۱۰ واژه — رسیدن به ۱۰ واژه در کتابخانه
 *     💯 اولین ۱۰۰ واژه
 *     🎯 اولین ۵۰۰ واژه
 *     🏆 اولین ۱۰۰۰ واژه
 *     ✅ اولین واژهٔ مسلط — اولین واژه با ivl ≥ 21
 *     🎓 اولین فعل دانش‌آموخته — اولین فعل+حرف اضافه با SRS graduated
 *     🔥 هفت روز استمرار
 *     🔥🔥 ۳۰ روز استمرار
 *     🔥🔥🔥 ۱۰۰ روز استمرار
 *     🧪 اولین آزمون کامل — اجرای ComprehensiveExam یا FullExam
 *     📝 اولین تمرین AI — ساخت تمرین با AI
 *     🗣 اولین دیالوگ
 *     🌟 اولین اصطلاح دانش‌آموخته
 *     🇩🇪 آمادگی B2 ≥ ۷۰٪
 *     🇩🇪🇩🇪 آمادگی B2 ≥ ۸۵٪
 *
 * داده‌ها در localStorage ذخیره می‌شوند. هیچ دادهٔ شخصی به جایی ارسال نمی‌شود.
 */

import { AppState, Word, HistItem } from '../types';
import { streakCount } from './storage';
import { dayStart, dstr, today } from './dates';

const FREEZE_KEY = 'wb_streak_freeze_v1';
const ACH_KEY = 'wb_achievements_v1';

interface FreezeState {
  /** ماه جاری به‌صورت YYYY-MM */
  month: string;
  /** تعداد freezeهای باقی‌مانده در این ماه */
  remaining: number;
  /** تاریخ‌هایی که freeze مصرف شده (YYYY-MM-DD) */
  used: string[];
}

export const FREEZE_PER_MONTH = 2;

/** بارگذاری وضعیت freeze */
export function loadFreeze(): FreezeState {
  try {
    const v = JSON.parse(localStorage.getItem(FREEZE_KEY) || '');
    if (v && typeof v === 'object' && v.month) return v;
  } catch { /* ignore */ }
  const ym = currentMonth();
  return { month: ym, remaining: FREEZE_PER_MONTH, used: [] };
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function saveFreeze(s: FreezeState): void {
  try { localStorage.setItem(FREEZE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

/**
 * اگر ماه عوض شده، reset کن و freezeهای جدید بده.
 * اگر در ماه قبلی freeze مصرف شده ولی هنوز ماه عوض نشده، همان باقی بماند.
 */
export function syncFreezeMonth(): FreezeState {
  const s = loadFreeze();
  const cur = currentMonth();
  if (s.month !== cur) {
    const next: FreezeState = { month: cur, remaining: FREEZE_PER_MONTH, used: [] };
    saveFreeze(next);
    return next;
  }
  return s;
}

/**
 * محاسبهٔ streak واقعی با در نظر گرفتن freeze.
 * اگر دیروز تمرین نبوده ولی freeze داریم، یکی مصرف کن و streak را حفظ کن.
 * اگر freeze هم نداریم، streak همان رفتار عادی streakCount است.
 *
 * ولی چون streakCount فقط روی hist کار می‌کند و «روز بدون تمرین» را به‌عنوان شکستگی می‌شمارد،
 * ما یک لایهٔ منطقی روی آن می‌گذاریم: اگر «دیروز» تمرین نبود و freeze داریم،
 * streak فعلی را به‌جای ۰ = streak قبل از دیروز می‌گیریم.
 */
export function effectiveStreak(state: AppState): { streak: number; protectedByFreeze: boolean; freezesLeft: number } {
  const freeze = syncFreezeMonth();
  const realStreak = streakCount(state.hist);
  // آیا امروز تمرین شده؟
  const todayStr = today();
  const hasToday = state.hist.some(h => dstr(h.t) === todayStr);
  // اگر امروز تمرین شده، streak فعلی عادی است
  if (hasToday) return { streak: realStreak, protectedByFreeze: false, freezesLeft: freeze.remaining };
  // امروز تمرین نشده — آیا دیروز هم نبوده؟
  const yesterdayStr = dstr(dayStart(-1));
  const hasYesterday = state.hist.some(h => dstr(h.t) === yesterdayStr);
  // اگر دیروز تمرین بوده، streak فعلی در حال از دست رفتن است ولی هنوز حفظ شده
  if (hasYesterday) return { streak: realStreak, protectedByFreeze: false, freezesLeft: freeze.remaining };
  // دیروز هم نبوده — آیا freeze داریم؟
  if (freeze.remaining > 0 && !freeze.used.includes(yesterdayStr)) {
    // یکی مصرف کن
    const next: FreezeState = { ...freeze, remaining: freeze.remaining - 1, used: [...freeze.used, yesterdayStr] };
    saveFreeze(next);
    // streak را به‌جای شکست، به streak قبل از دیروز بگیریم — ولی streakCount همین الان ۰ برمی‌گرداند
    // پس یک مقدار تقریبی به‌صورت «streak قبل از دیروز - 1» برمی‌گردانیم تا انگیزه حفظ شود
    // پیدا کردن آخرین streak با پرش از دیروز
    const s = new Set(state.hist.map(x => dstr(x.t)));
    let o = -2; // از روز قبل از دیروز
    let n = 0;
    while (s.has(dstr(dayStart(o)))) { n++; o--; }
    return { streak: Math.max(0, n), protectedByFreeze: true, freezesLeft: next.remaining };
  }
  // freeze هم نداریم — streak واقعاً به ۰ می‌رسد
  return { streak: 0, protectedByFreeze: false, freezesLeft: freeze.remaining };
}

/* ──────────── Achievements ──────────── */

export interface Achievement {
  id: string;
  icon: string;
  label: string;
  desc: string;
  /** شرط کسب: اگر true برگرداند، نشان داده می‌شود */
  check: (ctx: AchContext) => boolean;
}

export interface AchContext {
  words: Word[];
  hist: HistItem[];
  streak: number;
  b2Readiness: number;
  vprepGraduated: number;
  idiomGraduated: number;
  examDone: number;       // تعداد آزمون کامل انجام‌شده (FullExam یا ComprehensiveExam)
  aiExercisesCreated: number; // تعداد تمرین AI ساخته‌شده
  dialogDone: number;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_word', icon: '🌱', label: 'اولین واژه', desc: 'اولین واژه را به کتابخانه اضافه کن', check: c => c.words.length >= 1 },
  { id: 'ten_words', icon: '📚', label: '۱۰ واژه', desc: 'به ۱۰ واژه در کتابخانه برس', check: c => c.words.length >= 10 },
  { id: 'hundred_words', icon: '💯', label: '۱۰۰ واژه', desc: 'به ۱۰۰ واژه برس', check: c => c.words.length >= 100 },
  { id: 'fivehundred_words', icon: '🎯', label: '۵۰۰ واژه', desc: 'به ۵۰۰ واژه برس', check: c => c.words.length >= 500 },
  { id: 'thousand_words', icon: '🏆', label: '۱۰۰۰ واژه', desc: 'به ۱۰۰۰ واژه برس', check: c => c.words.length >= 1000 },
  { id: 'first_mastered', icon: '✅', label: 'اولین واژهٔ مسلط', desc: 'اولین واژه را به تسلط برسان (ivl ≥ 21)', check: c => c.words.some(w => (w.ivl || 0) >= 21) },
  { id: 'first_vprep_grad', icon: '🎓', label: 'اولین فعل دانش‌آموخته', desc: 'اولین فعل+حرف اضافه را به تسلط برسان (SRS)', check: c => c.vprepGraduated >= 1 },
  { id: 'streak_7', icon: '🔥', label: '۷ روز استمرار', desc: '۷ روز پیاپی تمرین کن', check: c => c.streak >= 7 },
  { id: 'streak_30', icon: '🔥🔥', label: '۳۰ روز استمرار', desc: '۳۰ روز پیاپی تمرین کن', check: c => c.streak >= 30 },
  { id: 'streak_100', icon: '🔥🔥🔥', label: '۱۰۰ روز استمرار', desc: '۱۰۰ روز پیاپی تمرین کن', check: c => c.streak >= 100 },
  { id: 'first_exam', icon: '🧪', label: 'اولین آزمون کامل', desc: 'یک آزمون کامل (FullExam یا ComprehensiveExam) انجام بده', check: c => c.examDone >= 1 },
  { id: 'first_ai', icon: '📝', label: 'اولین تمرین AI', desc: 'یک تمرین با هوش مصنوعی بساز', check: c => c.aiExercisesCreated >= 1 },
  { id: 'first_dialog', icon: '🗣', label: 'اولین دیالوگ', desc: 'یک دیالوگ تمرین کن', check: c => c.dialogDone >= 1 },
  { id: 'first_idiom', icon: '🌟', label: 'اولین اصطلاح دانش‌آموخته', desc: 'اولین اصطلاح آلمانی را در SRS دانش‌آموخته کن', check: c => c.idiomGraduated >= 1 },
  { id: 'b2_ready', icon: '🇩🇪', label: 'آمادگی B2 ≥ ۷۰٪', desc: 'به ۷۰٪ آمادگی B2 برس', check: c => c.b2Readiness >= 70 },
  { id: 'b2_master', icon: '🇩🇪🇩🇪', label: 'آمادگی B2 ≥ ۸۵٪', desc: 'به ۸۵٪ آمادگی B2 برس — آمادهٔ آزمون!', check: c => c.b2Readiness >= 85 },
];

/** بارگذاری نشان‌های کسب‌شده */
export function loadEarnedAchievements(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(ACH_KEY) || '');
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
}

function saveEarnedAchievements(m: Record<string, number>): void {
  try { localStorage.setItem(ACH_KEY, JSON.stringify(m)); } catch { /* ignore */ }
}

/**
 * بررسی نشان‌های جدید — اگر شرایط فلان نشان فراهم شده ولی هنوز ثبت نشده، ثبت کن
 * و فهرست نشان‌های جدید کسب‌شده را برگردانید (برای toast جشن).
 */
export function checkNewAchievements(ctx: AchContext): Achievement[] {
  const earned = loadEarnedAchievements();
  const newlyEarned: Achievement[] = [];
  for (const ach of ACHIEVEMENTS) {
    if (earned[ach.id]) continue;
    if (ach.check(ctx)) {
      earned[ach.id] = Date.now();
      newlyEarned.push(ach);
    }
  }
  if (newlyEarned.length) saveEarnedAchievements(earned);
  return newlyEarned;
}

/** فهرست همهٔ نشان‌ها با وضعیت کسب */
export function getAllAchievementsStatus(ctx: AchContext): Array<Achievement & { earned: boolean; earnedAt?: number }> {
  const earned = loadEarnedAchievements();
  return ACHIEVEMENTS.map(a => ({
    ...a,
    earned: !!earned[a.id],
    earnedAt: earned[a.id] ? Number(earned[a.id]) : undefined
  }));
}

/** شمارش نشان‌های کسب‌شده */
export function countEarned(ctx: AchContext): { earned: number; total: number } {
  const earned = loadEarnedAchievements();
  return { earned: ACHIEVEMENTS.filter(a => earned[a.id]).length, total: ACHIEVEMENTS.length };
}

/* ──────────── شمارش کمکی برای ctx ──────────── */

/** تعداد فعل‌های +حرف اضافهٔ دانش‌آموخته از SRS اختصاصی */
export function countVPrepGraduated(): number {
  try {
    const srs = JSON.parse(localStorage.getItem('wb_vprep_srs_v1') || '{}');
    return Object.values(srs).filter((v: any) => v?.graduated).length;
  } catch { return 0; }
}

/** تعداد اصطلاحات دانش‌آموخته از SRS اصطلاحات */
export function countIdiomGraduated(): number {
  try {
    const srs = JSON.parse(localStorage.getItem('wb_idioms_srs_v1') || '{}');
    return Object.values(srs).filter((v: any) => v?.graduated).length;
  } catch { return 0; }
}

/** تعداد آزمون‌های کامل انجام‌شده — از آرشیوهای FullExam و ComprehensiveExam */
export function countExamsDone(): number {
  let n = 0;
  try {
    const fe = JSON.parse(localStorage.getItem('wb_full_exam_history_v1') || '[]');
    if (Array.isArray(fe)) n += fe.length;
  } catch { /* ignore */ }
  try {
    const ce = JSON.parse(localStorage.getItem('wb_comprehensive_exam_v1') || '[]');
    if (Array.isArray(ce)) n += ce.length;
  } catch { /* ignore */ }
  // همچنین آزمون‌های Lesen/Hören/Schreiben/Sprechen
  try {
    const le = JSON.parse(localStorage.getItem('wb_lesen_archive_v1') || '[]');
    if (Array.isArray(le)) n += le.length;
  } catch { /* ignore */ }
  return n;
}

/** تعداد تمرین‌های AI ساخته‌شده — شامل Konnektoren، SatzBau، VerbPrep worksheet، B2GrammarHub، Dialog */
export function countAiExercisesCreated(): number {
  let n = 0;
  const keys = ['wb_konnektor_archive_v1', 'wb_satzbau_ai_arch_v1', 'wb_b2grammar_arch_v1', 'wb_dialog_arch_v1', 'wb_wsh_archive_v1', 'wb_tstory_archive_v1'];
  for (const k of keys) {
    try {
      const a = JSON.parse(localStorage.getItem(k) || '[]');
      if (Array.isArray(a)) n += a.length;
    } catch { /* ignore */ }
  }
  return n;
}

/** تعداد دیالوگ‌های انجام‌شده */
export function countDialogDone(): number {
  try {
    const a = JSON.parse(localStorage.getItem('wb_dialog_arch_v1') || '[]');
    return Array.isArray(a) ? a.length : 0;
  } catch { return 0; }
}
