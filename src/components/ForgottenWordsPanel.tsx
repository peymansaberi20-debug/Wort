/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * ForgottenWordsPanel.tsx — بخش «واژگان فراموش‌شده» (درخواست کاربر ۶)
 *
 * زیر تب Lernkarten (Flashcards): نمایش واژه‌هایی که ۶۰ روز یا بیشتر از آخرین
 * مرور آن‌ها گذشته — در حال «فراموش شدن» هستند.
 * - یک فهرست کارت‌های آکاردئونی از واژه‌های فراموش‌شده (مرتب بر اساس قدمت مرور)
 * - دکمهٔ «جلسهٔ بازیابی»: شروع تمرین اختصاصی فقط با همین واژه‌ها
 * - نمایش badge «فراموش‌شده» در پروفایل واژه (مستقل از این پنل)
 */
import React, { useMemo, useState } from 'react';
import { Word } from '../types';
import { fullWord } from '../utils/storage';
import { DAY } from '../utils/dates';

interface Props {
  words: Word[];
  onSelectWord?: (w: Word) => void;
  onRecover?: (ids: string[]) => void;
}

const FORGOTTEN_DAYS = 60;

export const ForgottenWordsPanel: React.FC<Props> = ({ words, onSelectWord, onRecover }) => {
  const [expanded, setExpanded] = useState<string | null>(null);

  const forgotten = useMemo(() => {
    const now = Date.now();
    return words
      .filter(w => w.last && (now - w.last) > FORGOTTEN_DAYS * DAY)
      .map(w => {
        const days = Math.floor((now - (w.last || 0)) / DAY);
        return { word: w, days };
      })
      .sort((a, b) => b.days - a.days);
  }, [words]);

  if (forgotten.length === 0) {
    return (
      <div className="bg-white dark:bg-[#1b2029] border border-emerald-200 dark:border-emerald-800 rounded-2xl p-4 text-center shadow-xs">
        <div className="text-3xl mb-1">✨</div>
        <b className="text-sm text-slate-900 dark:text-slate-100 block mb-1">هیچ واژه‌ای فراموش نشده</b>
        <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">همهٔ واژه‌های تو در ۶۰ روز اخیر مرور شده‌اند. عالی!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🧊</span>
            <div>
              <b className="text-base text-slate-900 dark:text-slate-100">واژگان فراموش‌شده</b>
              <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">۶۰+ روز از آخرین مرور گذشته‌اند</p>
            </div>
          </div>
          <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            {forgotten.length} واژه
          </span>
        </div>

        {forgotten.length > 0 && (
          <button
            onClick={() => onRecover?.(forgotten.map(x => x.word.id))}
            className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white px-3.5 py-2.5 rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-2"
          >
            🔁 جلسهٔ بازیابی ({forgotten.length} واژه)
          </button>
        )}

        <p className="text-[10px] text-[#5d6676] dark:text-[#a3adbd] flex items-center gap-1.5">
          <span>💡</span>
          <span>یک جلسهٔ کوتاه با این واژه‌ها آن‌ها را به چرخهٔ مرور برمی‌گرداند.</span>
        </p>
      </div>

      {/* فهرست واژه‌ها */}
      <div className="space-y-1">
        {forgotten.slice(0, 30).map(({ word, days }) => (
          <button
            key={word.id}
            onClick={() => onSelectWord?.(word)}
            className="w-full bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2.5 flex items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition text-right"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${days > 120 ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'}`}>
                {days} روز
              </span>
              <span className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate" dir="ltr">
                {fullWord(word)}
              </span>
              {word.cat && <span className="text-[10px] text-[#5d6676] dark:text-[#a3adbd]">({word.cat})</span>}
            </div>
            <span className="text-xs text-[#5d6676] dark:text-[#a3adbd] truncate max-w-[120px] flex-shrink-0">{word.fa}</span>
          </button>
        ))}
        {forgotten.length > 30 && (
          <p className="text-[10px] text-[#5d6676] dark:text-[#a3adbd] text-center pt-1">
            نمایش ۳۰ مورد از مجموع {forgotten.length} — همه در «جلسهٔ بازیابی» گنجانده می‌شوند.
          </p>
        )}
      </div>
    </div>
  );
};
