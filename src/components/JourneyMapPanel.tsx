/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * JourneyMapPanel.tsx — مسیر سفر A1 → C2 (درخواست کاربر ۹)
 *
 * یک پنل آکاردئونی در داشبورد که مسیر یادگیری را به‌صورت گرافیکی زیبا نشان می‌دهد:
 *   - ایستگاه‌های A1 → A2 → B1 → B2 → C1 → C2 به‌هم متصل
 *   - ایستگاه فعلی برجسته‌تر است
 *   - درصد پیشرفت هر ایستگاه و فاصله تا بعدی
 *   - تخمین روزهای باقی‌مانده
 */
import React from 'react';
import { AppState } from '../types';
import { computeJourneyMap, Station } from '../utils/journeyMap';

interface Props {
  state: AppState;
}

export const JourneyMapPanel: React.FC<Props> = ({ state }) => {
  const map = React.useMemo(() => computeJourneyMap(state), [state.words, state.hist]);
  const currentIdx = map.stations.findIndex(s => s.level === map.current);

  return (
    <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 md:p-5 shadow-xs space-y-4 text-right">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🗺️</span>
          <div>
            <b className="text-base text-slate-900 dark:text-slate-100">مسیر سفر از A1 تا C2</b>
            <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">
              پیشرفت کلی: {map.overall}٪ • ایستگاه فعلی: {map.stations[currentIdx]?.icon} {map.current}
            </p>
          </div>
        </div>
        {map.remaining > 0 && (
          <div className="text-[11px] font-bold px-3 py-1 rounded-full bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white">
            تا ایستگاه بعدی: {map.remaining} واژه • ~{map.estimatedDays} روز
          </div>
        )}
      </div>

      {/* مسیر گرافیکی */}
      <div className="relative overflow-x-auto pb-2">
        <div className="min-w-[560px] flex items-start justify-between gap-1">
          {map.stations.map((s, i) => {
            const isLast = i === map.stations.length - 1;
            return (
              <div key={s.level} className="relative flex-1 flex flex-col items-center">
                {/* خط اتصال */}
                {!isLast && (
                  <div
                    className={`absolute top-6 left-1/2 h-1 rounded-full ${s.completed ? 'bg-emerald-400' : 'bg-slate-200 dark:bg-slate-700'}`}
                    style={{ width: '100%', transform: 'translateX(50%)' }}
                  />
                )}
                {/* دایره ایستگاه */}
                <div className="relative z-10">
                  <div
                    className={`w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center text-2xl shadow-md transition-all ${
                      s.current
                        ? 'bg-gradient-to-br ' + s.color + ' text-white scale-110 ring-4 ring-amber-300 dark:ring-amber-500 animate-pulse'
                        : s.completed
                          ? 'bg-gradient-to-br ' + s.color + ' text-white'
                          : 'bg-slate-100 dark:bg-[#141923] text-slate-400 dark:text-slate-500 border-2 border-slate-200 dark:border-slate-700'
                    }`}
                    title={`${s.level}: ${s.title}`}
                  >
                    {s.completed && !s.current ? '✓' : s.icon}
                  </div>
                  {s.current && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-400 border-2 border-white dark:border-[#1b2029] flex items-center justify-center text-[8px] font-extrabold text-amber-900">
                      ★
                    </div>
                  )}
                </div>
                {/* برچسب ایستگاه */}
                <div className="mt-2 text-center">
                  <div className={`text-xs font-extrabold ${s.current ? 'text-[#1f5fbf] dark:text-[#7fb0ff]' : s.completed ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                    {s.level}
                  </div>
                  <div className="text-[10px] text-[#5d6676] dark:text-[#a3adbd]">{s.title}</div>
                </div>
                {/* نوار پیشرفت زیر ایستگاه */}
                <div className="mt-1 w-14 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      s.current
                        ? 'bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8]'
                        : s.completed
                          ? 'bg-emerald-500'
                          : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                    style={{ width: `${Math.max(s.completed ? 100 : 4, s.progress)}%` }}
                  />
                </div>
                <div className="mt-0.5 text-[10px] text-[#5d6676] dark:text-[#a3adbd]">
                  {s.progress}٪ • {s.mastered}/{s.total}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* اطلاعات ایستگاه فعلی */}
      <div className="rounded-xl border border-[#1f5fbf]/30 dark:border-[#7fb0ff]/30 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 p-3 space-y-1">
        <div className="flex items-center justify-between">
          <b className="text-sm">{map.stations[currentIdx]?.icon} {map.current}: {map.stations[currentIdx]?.title}</b>
          {map.stations[currentIdx]?.accuracy > 0 && (
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
              دقت ۳۰ روز: {map.stations[currentIdx]?.accuracy}٪
            </span>
          )}
        </div>
        <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">
          {map.remaining > 0
            ? `برای رسیدن به سطح بعد، ${map.remaining} واژهٔ دیگر در این سطح را به تسلط برسان. تخمیناً ${map.estimatedDays} روز با سرعت فعلی.`
            : '🎉 ایستگاه فعلی کامل شده — به ایستگاه بعدی نگاه کن!'}
        </p>
      </div>

      {/* نکتهٔ انگیزشی */}
      <div className="text-xs text-[#5d6676] dark:text-[#a3adbd] flex items-center gap-1.5">
        <span>💡</span>
        <span>مسیر بر اساس تعداد واژگان مسلط در هر سطح محاسبه می‌شود — واژه را «مسلط» می‌کنیم وقتی فاصلهٔ مرور به ۲۱ روز یا بیشتر برسد.</span>
      </div>
    </div>
  );
};
