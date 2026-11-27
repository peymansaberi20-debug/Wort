/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * DailyChallengeCard.tsx — چالش روزانه (درخواست کاربر ۸)
 *
 * یک کارت کوچک در سربرگ داشبورد:
 *   - نمایش چالش امروز + پیشرفت + دکمهٔ شروع
 *   - در صورت تکمیل: نمایش ✓ با انیمیشن
 *   - روی دکمهٔ شروع → navigate به تمرین مناسب
 */
import React, { useState, useEffect } from 'react';
import { AppState } from '../types';
import { getOrCreateDailyQuest, advanceDailyQuest, markDailyQuestDone, DailyQuest } from '../utils/dailyQuest';

interface Props {
  state: AppState;
  /** شروع تمرین مناسب بر اساس kind چالش */
  onStart?: (q: DailyQuest) => void;
}

export const DailyChallengeCard: React.FC<Props> = ({ state, onStart }) => {
  const [quest, setQuest] = useState<DailyQuest | null>(null);

  useEffect(() => {
    setQuest(getOrCreateDailyQuest(state));
  }, [state]);

  if (!quest) return null;

  const progress = Math.round((quest.progress / Math.max(1, quest.target)) * 100);
  const completed = quest.completed;

  return (
    <div className={`relative rounded-xl p-2 border-2 transition-all overflow-hidden h-9 flex items-center gap-1.5 ${completed ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700' : 'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-amber-200 dark:border-amber-800'}`}>
      {/* درخواست کاربر ۱: ارتفاع نصف، حذف نوشته‌های غیرضروری — فقط آیکن + عنوان + پیشرفت */}
      {completed ? (
        <>
          <span className="text-base">🎉</span>
          <b className="text-xs font-extrabold text-emerald-900 dark:text-emerald-100 truncate flex-1">چالش کامل شد!</b>
        </>
      ) : (
        <>
          <span className="text-base flex-shrink-0">{quest.icon}</span>
          <b className="text-[11px] font-bold text-slate-900 dark:text-slate-100 truncate flex-1">{quest.title}</b>
          <span className="text-[10px] text-[#5d6676] dark:text-[#a3adbd] flex-shrink-0">{quest.progress}/{quest.target}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onStart?.(quest); }}
            className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-600 text-white hover:bg-amber-700 flex-shrink-0"
          >▶</button>
        </>
      )}
    </div>
  );
};
