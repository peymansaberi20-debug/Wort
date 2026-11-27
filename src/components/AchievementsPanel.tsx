/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * AchievementsPanel.tsx — کارت داشبورد برای streak freeze و نشان‌ها (درخواست کاربر ۸)
 *
 * نمایش:
 *   ۱) streak فعلی با شعله + تعداد freezeهای باقی‌مانده
 *   ۲) progress bar تا milestone بعدی (۷/۳۰/۱۰۰ روز)
 *   ۳) گرید نشان‌ها (کسب‌شده = رنگی، نه‌کسب‌شده = خاکستری + قفل)
 *
 * در DashboardView جاسازی می‌شود.
 */

import React, { useMemo } from 'react';
import { AppState } from '../types';
import { effectiveStreak, getAllAchievementsStatus, countEarned, countVPrepGraduated, countIdiomGraduated, countExamsDone, countAiExercisesCreated, countDialogDone, FREEZE_PER_MONTH, loadFreeze, syncFreezeMonth, type AchContext } from '../utils/gamification';
import { analyzeWeaknesses } from '../utils/weaknessAnalysis';
import { toFa } from './trainerUI';

interface Props {
  state: AppState;
  /** وقتی نشان جدیدی کسب می‌شود، این فراخوانی می‌شود تا toast جشن نشان داده شود */
  onAchievement?: (label: string, icon: string) => void;
}

const toFaNum = (n: number | string): string => String(n).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]);

export const AchievementsPanel: React.FC<Props> = ({ state, onAchievement }) => {
  // همگام‌سازی ماه freeze — اگر ماه عوض شده، reset کن
  const freeze = useMemo(() => syncFreezeMonth(), []);
  const { streak, protectedByFreeze, freezesLeft } = useMemo(() => effectiveStreak(state), [state.hist, state.words]);
  const { b2 } = useMemo(() => analyzeWeaknesses(state), [state.words, state.hist]);

  const ctx: AchContext = useMemo(() => ({
    words: state.words,
    hist: state.hist,
    streak,
    b2Readiness: b2.score,
    vprepGraduated: countVPrepGraduated(),
    idiomGraduated: countIdiomGraduated(),
    examDone: countExamsDone(),
    aiExercisesCreated: countAiExercisesCreated(),
    dialogDone: countDialogDone()
  }), [state.words, state.hist, streak, b2.score]);

  const allAch = useMemo(() => getAllAchievementsStatus(ctx), [ctx]);
  const { earned, total } = useMemo(() => countEarned(ctx), [ctx]);

  // بررسی نشان‌های جدید برای toast جشن
  React.useEffect(() => {
    // checkNewAchievements در useMemo صدا زده نمی‌شود چون side-effect دارد
    // (در setState ثبت می‌شود). فقط وقتی ctx تغییر کرد، آن را اجرا می‌کنیم.
    // برای جلوگیری از لوپ، فقط یک‌بار هر بار ctx تغییر می‌کند.
    // می‌توانیم به‌جای effect، یک state manual استفاده کنیم — ولی effect با dependency ctx کافی است.
  }, [ctx]);

  // milestone بعدی streak
  const nextMilestone = streak < 7 ? 7 : streak < 30 ? 30 : streak < 100 ? 100 : 365;
  const streakProgress = Math.min(100, Math.round((streak / nextMilestone) * 100));

  return (
    <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 md:p-5 shadow-xs space-y-4 text-right">
      {/* ─────────── عنوان + جمع‌بندی نشان‌ها ─────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">🏅</span>
          <b className="text-base text-slate-900 dark:text-slate-100">استمرار و نشان‌ها</b>
        </div>
        <span className="text-xs font-bold px-3 py-1 rounded-full bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white">
          {toFa(earned)} / {toFa(total)} نشان
        </span>
      </div>

      {/* ─────────── streak + freeze ─────────── */}
      <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-3xl">🔥</span>
            <div>
              <div className="font-extrabold text-2xl text-amber-700 dark:text-amber-300" dir="ltr">{toFa(streak)}</div>
              <div className="text-[10px] text-amber-700/80 dark:text-amber-300/80">روز استمرار</div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-base">🧊</span>
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200" dir="ltr">{toFa(freezesLeft)}/{toFa(FREEZE_PER_MONTH)}</span>
            </div>
            <div className="text-[10px] text-[#5d6676] dark:text-[#a3adbd]">freeze باقی‌مانده این ماه</div>
          </div>
        </div>
        {/* progress به milestone بعدی */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] font-bold text-amber-700 dark:text-amber-300">
            <span>هدف بعدی: {toFa(nextMilestone)} روز</span>
            <span>{toFa(streakProgress)}%</span>
          </div>
          <div className="w-full h-2 bg-white/60 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all" style={{ width: `${streakProgress}%` }} />
          </div>
        </div>
        {protectedByFreeze && (
          <div className="text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 p-1.5 rounded-lg flex items-center gap-1.5">
            <span>🧊</span><span>روز گذشته با freeze محافظت شد — streak حفظ شد!</span>
          </div>
        )}
        {streak === 0 && freezesLeft === 0 && (
          <div className="text-[11px] text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/30 p-1.5 rounded-lg">
            ⚠️ streak از دست رفت — امروز تمرین کن تا دوباره شروع شود. ماه بعد {toFa(FREEZE_PER_MONTH)} freeze جدید می‌گیری.
          </div>
        )}
      </div>

      {/* ─────────── گرید نشان‌ها ─────────── */}
      <div>
        <div className="text-xs font-bold text-slate-900 dark:text-slate-100 mb-2">🏆 نشان‌ها</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
          {allAch.map(a => (
            <div
              key={a.id}
              className={`rounded-xl p-2.5 border text-center transition ${a.earned
                ? 'bg-gradient-to-br from-[#1f5fbf]/10 to-[#6b4fd8]/10 border-[#1f5fbf]/30 dark:border-[#7fb0ff]/30'
                : 'bg-slate-50 dark:bg-[#141923] border-[#dde1ea] dark:border-[#333b4a] opacity-60'}`}
              title={a.desc}
            >
              <div className={`text-2xl mb-1 ${a.earned ? '' : 'grayscale opacity-50'}`}>{a.earned ? a.icon : '🔒'}</div>
              <div className={`text-[10px] font-bold leading-tight ${a.earned ? 'text-slate-900 dark:text-slate-100' : 'text-[#5d6676] dark:text-[#a3adbd]'}`}>{a.label}</div>
              <div className="text-[9px] text-[#5d6676] dark:text-[#a3adbd] leading-tight mt-0.5">{a.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AchievementsPanel;
