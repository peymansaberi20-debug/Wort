/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * LatePracticesAccordion.tsx — اکاردئون «تمرین‌های ۴ روز اخیر انجام‌نشده» (درخواست کاربر ۲)
 *
 * زیر نمودار هفتگی در داشبورد قرار می‌گیرد. تمرین‌هایی که در ۴ روز گذشته اصلاً انجام
 * نشده‌اند را فهرست می‌کند. با کلیک روی هر کدام، مستقیم وارد آن تمرین می‌شوی.
 */
import React, { useMemo } from 'react';
import { AppState } from '../types';
import { latePractices } from '../utils/practiceTracker';

interface Props {
  state: AppState;
  onStartExercise?: (nav: string) => void;
}

export const LatePracticesAccordion: React.FC<Props> = ({ state, onStartExercise }) => {
  const late = useMemo(() => latePractices(state.hist, 4), [state.hist]);

  if (late.length === 0) {
    // همهٔ تمرین‌ها در ۴ روز اخیر انجام شده‌اند → چیزی نمایش نده
    return null;
  }

  return (
    <div className="bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 shadow-xs">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">⏰</span>
          <div>
            <b className="text-sm text-amber-900 dark:text-amber-200">تمرین‌های ۴ روز اخیر انجام‌نشده</b>
            <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80">با کلیک مستقیم وارد هر تمرین شو</p>
          </div>
        </div>
        <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-amber-200 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
          {late.length} تمرین
        </span>
      </div>
      {/* درخواست کاربر ۹: دکمه‌ها هم‌اندازه، ۲تایی هر خط، ارتفاع کمتر */}
      <div className="grid grid-cols-2 gap-1.5">
        {late.map(p => (
          <button
            key={p.type}
            onClick={() => onStartExercise?.(p.nav)}
            className="flex items-center gap-2 px-2.5 py-1.5 h-10 rounded-xl bg-white dark:bg-[#1b2029] border border-amber-200 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition text-right text-xs font-bold text-slate-900 dark:text-slate-100 overflow-hidden"
            title={`شروع: ${p.title}`}
          >
            <span className="text-base flex-shrink-0">{p.icon}</span>
            <span className="flex-1 truncate">{p.title}</span>
            <span className="text-[10px] text-amber-700 dark:text-amber-300 flex-shrink-0">→</span>
          </button>
        ))}
      </div>
    </div>
  );
};
