/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * ForgettingCurvePanel.tsx — نمودار منحنی فراموشی (درخواست کاربر ۱۳)
 *
 * یک پنل در داشبورد که نشان می‌دهد چه کسری از واژگان در هر روز فراموش می‌شود:
 *   - نمودار خطی ۳۰ روزه با محور x (روز) و y (٪ retention)
 *   - نقطهٔ فعلی کاربر با نشانگر
 *   - نشانگر «نیمه‌عمر» (نقطه‌ای که فراموشی به ۵۰٪ می‌رسد)
 *   - فهرست ۵ واژهٔ بحرانی (با بیشترین احتمال فراموشی)
 */
import React from 'react';
import { AppState } from '../types';
import { computeForgettingCurve, criticalWords } from '../utils/forgettingCurve';

interface Props {
  state: AppState;
  onSelectWord?: (w: any) => void;
}

export const ForgettingCurvePanel: React.FC<Props> = ({ state, onSelectWord }) => {
  const curve = React.useMemo(() => computeForgettingCurve(state), [state.words]);
  const critical = React.useMemo(() => criticalWords(state, 50), [state.words]);

  // SVG viewBox: width 320 × height 100
  const W = 320, H = 100;
  const padL = 28, padR = 8, padT = 8, padB = 18;
  const xFor = (day: number) => padL + (day / 30) * (W - padL - padR);
  const yFor = (r: number) => padT + (1 - r / 100) * (H - padT - padB);
  const pathD = curve.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(p.day).toFixed(1)} ${yFor(p.retention).toFixed(1)}`).join(' ');

  return (
    <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 md:p-5 shadow-xs space-y-3 text-right">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📉</span>
          <div>
            <b className="text-base text-slate-900 dark:text-slate-100">منحنی فراموشی</b>
            <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">پیش‌بینی میزان ماندگاری واژگان در حافظه</p>
          </div>
        </div>
        <div className="text-[11px] font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          نیمه‌عمر: {curve.halfLife} روز
        </div>
      </div>

      {/* آمار خلاصه */}
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center p-2 rounded-xl bg-slate-50 dark:bg-[#141923] border border-slate-100 dark:border-slate-800">
          <div className="text-[10px] text-[#5d6676] dark:text-[#a3adbd]">پایداری</div>
          <div className="text-sm font-extrabold text-[#1f5fbf] dark:text-[#7fb0ff]">{curve.stability.toFixed(1)} روز</div>
        </div>
        <div className="text-center p-2 rounded-xl bg-slate-50 dark:bg-[#141923] border border-slate-100 dark:border-slate-800">
          <div className="text-[10px] text-[#5d6676] dark:text-[#a3adbd]">فاصله موفق</div>
          <div className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">{curve.avgInterval.toFixed(1)} روز</div>
        </div>
        <div className="text-center p-2 rounded-xl bg-slate-50 dark:bg-[#141923] border border-slate-100 dark:border-slate-800">
          <div className="text-[10px] text-[#5d6676] dark:text-[#a3adbd]">ماندگاری فعلی</div>
          <div className="text-sm font-extrabold text-amber-600 dark:text-amber-400">{curve.currentRetention}٪</div>
        </div>
      </div>

      {/* نمودار SVG */}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {/* محور y */}
        <line x1={padL} y1={padT} x2={padL} y2={H - padB} className="stroke-slate-200 dark:stroke-slate-700" strokeWidth="0.5" />
        {/* محور x */}
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} className="stroke-slate-200 dark:stroke-slate-700" strokeWidth="0.5" />
        {/* خط ۵۰٪ */}
        <line x1={padL} y1={yFor(50)} x2={W - padR} y2={yFor(50)} className="stroke-rose-300 dark:stroke-rose-700" strokeWidth="0.5" strokeDasharray="2,2" />
        <text x={padL - 4} y={yFor(50) + 3} className="fill-rose-400 text-[7px]">50٪</text>
        {/* خط ۱۰۰٪ */}
        <text x={padL - 4} y={padT + 4} className="fill-slate-400 text-[7px]">100٪</text>
        {/* نمودار خطی */}
        <path d={pathD} fill="none" strokeWidth="1.5" className="stroke-[#1f5fbf] dark:stroke-[#7fb0ff]" />
        {/* سطح زیر منحنی */}
        <path
          d={`${pathD} L ${xFor(30).toFixed(1)} ${yFor(0).toFixed(1)} L ${xFor(0).toFixed(1)} ${yFor(0).toFixed(1)} Z`}
          className="fill-[#1f5fbf]/15 dark:fill-[#7fb0ff]/15"
        />
        {/* نشانگر نیمه‌عمر */}
        {curve.halfLife <= 30 && (
          <>
            <circle cx={xFor(curve.halfLife)} cy={yFor(50)} r="2.5" className="fill-rose-500" />
            <text x={xFor(curve.halfLife)} y={yFor(50) - 4} className="fill-rose-500 text-[7px] font-bold" textAnchor="middle">
              {curve.halfLife} روز
            </text>
          </>
        )}
        {/* نشانگر نقطهٔ فعلی کاربر */}
        {curve.currentDay > 0 && curve.currentDay <= 30 && (
          <>
            <circle cx={xFor(curve.currentDay)} cy={yFor(curve.currentRetention)} r="3" className="fill-amber-500" stroke="white" strokeWidth="1" />
            <text x={xFor(curve.currentDay)} y={yFor(curve.currentRetention) - 6} className="fill-amber-600 text-[7px] font-bold" textAnchor="middle">
              تو: {curve.currentDay} روز
            </text>
          </>
        )}
        {/* محور x برچسب‌ها */}
        <text x={xFor(0)} y={H - 4} className="fill-slate-400 text-[7px]" textAnchor="middle">۰</text>
        <text x={xFor(15)} y={H - 4} className="fill-slate-400 text-[7px]" textAnchor="middle">۱۵</text>
        <text x={xFor(30)} y={H - 4} className="fill-slate-400 text-[7px]" textAnchor="middle">۳۰ روز</text>
      </svg>

      {/* واژه‌های بحرانی */}
      {critical.length > 0 && (
        <div className="space-y-1">
          <b className="text-xs text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <span>🩸</span> واژه‌های در آستانهٔ فراموشی
          </b>
          <div className="max-h-32 overflow-y-auto bg-slate-50 dark:bg-[#141923] rounded-xl border border-slate-100 dark:border-slate-800 px-2 py-1 space-y-0.5">
            {critical.slice(0, 8).map(({ word, retention }) => (
              <button
                key={word.id}
                onClick={() => onSelectWord?.(word)}
                className="w-full flex items-center justify-between text-xs py-1 px-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800/50"
              >
                <span className="font-bold text-slate-900 dark:text-slate-100 truncate" dir="ltr">
                  {word.art ? `${word.art} ` : ''}{word.de}
                </span>
                <span className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${retention < 30 ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'}`}>
                  {retention}٪
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="text-[10px] text-[#5d6676] dark:text-[#a3adbd] flex items-center gap-1.5">
        <span>💡</span>
        <span>نمودار بر اساس دادهٔ واقعی تمرین‌های تو محاسبه می‌شود. هرچه دقت بیشتر و فاصلهٔ موفق طولانی‌تر، منحنی افتادنی‌تر (پایداری بیشتر).</span>
      </div>
    </div>
  );
};
