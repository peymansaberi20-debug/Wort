/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * WeaknessHeatmap.tsx — نقشهٔ حرارتی نقاط ضعف + مسیر یادگیری تطبیقی
 *
 * یک کارت در داشبورد که:
 *   ۱) نمرهٔ آمادگی B2 را به‌صورت حلقهٔ دایره‌ای نشان می‌دهد
 *   ۲) فهرست نقاط ضعف اصلی (mastery < 70٪) را با رنگ قرمز/زرد/سبز نمایش می‌دهد
 *   ۳) نقشهٔ حرارتی همهٔ دسته‌ها (Cell grid)
 *   ۴) برنامهٔ روزانهٔ تطبیقی: «امروز روی X تمرکز کن» با دکمهٔ شروع
 *
 * به state.words و state.hist وابسته است. هیچ state جدیدی اضافه نمی‌کند.
 */

import React, { useMemo } from 'react';
import { AppState } from '../types';
import { analyzeWeaknesses, WeakCategory } from '../utils/weaknessAnalysis';

interface Props {
  state: AppState;
  /** هنگام کلیک روی یک دستهٔ ضعف، این فراخوانی می‌شود تا تمرین مربوطه باز شود */
  onStartExercise?: (mode: string, count: number) => void;
  onNavigate?: (view: string) => void;
}

/** رنگ mastery: ۰٪ قرمز → ۵۰٪ نارنجی → ۷۰٪ زرد → ۸۵٪ سبز → ۱۰۰٪ سبز پررنگ */
function masteryColor(m: number): { bg: string; text: string; border: string } {
  if (m >= 85) return { bg: 'bg-emerald-100 dark:bg-emerald-950/40', text: 'text-emerald-800 dark:text-emerald-200', border: 'border-emerald-300 dark:border-emerald-800' };
  if (m >= 70) return { bg: 'bg-lime-100 dark:bg-lime-950/40', text: 'text-lime-800 dark:text-lime-200', border: 'border-lime-300 dark:border-lime-800' };
  if (m >= 50) return { bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-800 dark:text-amber-200', border: 'border-amber-300 dark:border-amber-800' };
  return { bg: 'bg-rose-100 dark:bg-rose-950/40', text: 'text-rose-800 dark:text-rose-200', border: 'border-rose-300 dark:border-rose-800' };
}

const toFa = (n: number | string): string => String(n).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]);

export const WeaknessHeatmap: React.FC<Props> = ({ state, onStartExercise, onNavigate }) => {
  const report = useMemo(() => analyzeWeaknesses(state), [state.words, state.hist]);

  // حلقهٔ آمادگی B2
  const R = 36;
  const C = 2 * Math.PI * R;
  const b2Offset = C * (1 - report.b2.score / 100);

  return (
    <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 md:p-5 shadow-xs space-y-4 text-right">
      {/* ─────────── عنوان + آمادگی B2 ─────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🎯</span>
          <b className="text-base text-slate-900 dark:text-slate-100">تحلیل نقاط ضعف و مسیر یادگیری</b>
        </div>
        {/* حلقهٔ آمادگی B2 */}
        <div className="flex items-center gap-3">
          <div className="relative w-[84px] h-[84px] flex-shrink-0" role="img" aria-label={`آمادگی B2: ${toFa(report.b2.score)}٪`}>
            <svg viewBox="0 0 84 84" className="w-full h-full -rotate-90">
              <circle cx="42" cy="42" r={R} fill="none" strokeWidth="9" className="stroke-slate-200 dark:stroke-slate-700" />
              <circle
                cx="42" cy="42" r={R} fill="none" strokeWidth="9" strokeLinecap="round"
                className={report.b2.score >= 70 ? 'stroke-emerald-500' : report.b2.score >= 50 ? 'stroke-amber-500' : 'stroke-rose-500'}
                strokeDasharray={C}
                strokeDashoffset={b2Offset}
                style={{ transition: 'stroke-dashoffset 0.7s ease' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-base font-extrabold text-slate-900 dark:text-slate-100">{toFa(report.b2.score)}٪</span>
              <span className="text-[9px] text-[#5d6676] dark:text-[#a3adbd]">آمادگی B2</span>
            </div>
          </div>
          <div className="text-xs space-y-0.5 min-w-[140px]">
            <div className="flex justify-between gap-2"><span className="text-[#5d6676] dark:text-[#a3adbd]">واژگان B2:</span><b className="text-slate-900 dark:text-slate-100" dir="ltr">{toFa(report.b2.vocabB2Mastered)}/{toFa(report.b2.vocabB2)}</b></div>
            <div className="flex justify-between gap-2"><span className="text-[#5d6676] dark:text-[#a3adbd]">فعل+حرف اضافهٔ دانش‌آموخته:</span><b className="text-slate-900 dark:text-slate-100" dir="ltr">{toFa(report.b2.verbPrepGraduated)}</b></div>
            <div className="flex justify-between gap-2"><span className="text-[#5d6676] dark:text-[#a3adbd]">دقت ۷ روز اخیر:</span><b className="text-slate-900 dark:text-slate-100" dir="ltr">{toFa(report.b2.recentAccuracy)}٪</b></div>
          </div>
        </div>
      </div>

      {/* ─────────── نقاط ضعف اصلی (پنل برجسته) ─────────── */}
      {report.topWeaknesses.length > 0 ? (
        <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-rose-700 dark:text-rose-300">
            <span>⚠️</span><span>نقاط ضعف اصلی (دقت زیر ۷۰٪)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {report.topWeaknesses.map(w => {
              const col = masteryColor(w.mastery);
              return (
                <div key={w.id} className={`rounded-xl border ${col.bg} ${col.border} p-2.5 flex flex-col gap-1`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold ${col.text}`}>{w.icon} {w.label}</span>
                    <span className={`text-sm font-extrabold ${col.text}`} dir="ltr">{toFa(w.mastery)}٪</span>
                  </div>
                  <div className="text-[10px] text-[#5d6676] dark:text-[#a3adbd] leading-5">{w.recommendation}</div>
                  <div className="text-[10px] text-[#5d6676] dark:text-[#a3adbd]" dir="ltr">{toFa(w.correct)}/{toFa(w.total)} پاسخ درست</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-1.5">
          <span>✅</span><span>نقطهٔ ضعف برجسته‌ای نیست — همهٔ دسته‌ها بالای ۷۰٪ دقت دارند. به این روند ادامه بده!</span>
        </div>
      )}

      {/* ─────────── برنامهٔ روزانهٔ تطبیقی ─────────── */}
      <div className="rounded-xl border border-[#1f5fbf]/30 dark:border-[#7fb0ff]/30 bg-[#1f5fbf]/5 dark:bg-[#7fb0ff]/5 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">
            <span>🧭</span><span>برنامهٔ پیشنهادی امروز — تمرکز: {report.plan.focus}</span>
          </div>
          <span className="text-[10px] text-[#5d6676] dark:text-[#a3adbd]">~{toFa(report.plan.totalMinutes)} دقیقه</span>
        </div>
        <div className="space-y-1.5">
          {report.plan.items.map((it, i) => (
            <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-white dark:bg-[#141923] px-2.5 py-2 border border-[#dde1ea] dark:border-[#333b4a]">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-base flex-shrink-0">{it.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{it.label}</div>
                  <div className="text-[10px] text-[#5d6676] dark:text-[#a3adbd] truncate">{it.reason}</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-[11px] font-bold text-[#1f5fbf] dark:text-[#7fb0ff]" dir="ltr">{toFa(it.count)} تمرین</span>
                {onStartExercise && it.mode && (
                  <button
                    onClick={() => onStartExercise(it.mode, it.count)}
                    className="px-2.5 py-1 rounded-lg bg-[#1f5fbf] text-white text-[11px] font-bold active:scale-95 transition"
                  >
                    ▶ شروع
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─────────── نقشهٔ حرارتی همهٔ دسته‌ها ─────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-slate-100">
            <span>🔥</span><span>نقشهٔ حرارتی تسلط (همهٔ دسته‌ها)</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-[#5d6676] dark:text-[#a3adbd]">
            <span>ضعیف</span>
            <span className="w-3 h-3 rounded bg-rose-300" />
            <span className="w-3 h-3 rounded bg-amber-300" />
            <span className="w-3 h-3 rounded bg-lime-300" />
            <span className="w-3 h-3 rounded bg-emerald-400" />
            <span>قوی</span>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
          {report.categories.map(c => {
            const col = masteryColor(c.mastery);
            return (
              <div
                key={c.id}
                className={`rounded-lg border ${col.bg} ${col.border} p-2 flex flex-col gap-0.5`}
                title={`${c.label}: ${c.mastery}٪ دقت (${c.correct}/${c.total} پاسخ درست)`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200 truncate">{c.icon} {c.label}</span>
                  <span className={`text-[11px] font-extrabold ${col.text}`} dir="ltr">{toFa(c.mastery)}٪</span>
                </div>
                <div className="text-[9px] text-[#5d6676] dark:text-[#a3adbd]" dir="ltr">{toFa(c.correct)}/{toFa(c.total)}</div>
              </div>
            );
          })}
        </div>
        {report.categories.length === 0 && (
          <div className="text-center text-xs text-[#5d6676] dark:text-[#a3adbd] py-4">
            هنوز دادهٔ کافی برای تحلیل نیست — چند تمرین انجام بده تا نقشهٔ حرارتی پر شود.
          </div>
        )}
      </div>

      {/* هشدارهای B2 */}
      {report.b2.weakAreas.length > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/30 p-3 space-y-1">
          <div className="text-xs font-bold text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
            <span>📋</span><span>برای رسیدن به B2:</span>
          </div>
          <ul className="text-[11px] text-amber-700 dark:text-amber-300 space-y-0.5 list-disc pr-5">
            {report.b2.weakAreas.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
};

export default WeaknessHeatmap;
