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
    <div className={`relative rounded-2xl p-3 border-2 transition-all overflow-hidden ${completed ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700' : 'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-amber-200 dark:border-amber-800'}`}>
      {completed && (
        <div className="absolute top-1 right-1 text-2xl animate-bounce" aria-hidden="true">✓</div>
      )}
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-2xl">{completed ? '🎉' : quest.icon}</span>
        <div className="min-w-0">
          <b className="text-sm font-extrabold text-slate-900 dark:text-slate-100 block truncate">{completed ? 'چالش امروز کامل شد!' : quest.title}</b>
          <p className="text-[11px] text-[#5d6676] dark:text-[#a3adbd] truncate">{quest.desc}</p>
        </div>
      </div>
      {!completed && (
        <div className="mb-1.5">
          <div className="flex items-center justify-between text-[10px] text-[#5d6676] dark:text-[#a3adbd] mb-0.5">
            <span>پیشرفت: {quest.progress}/{quest.target}</span>
            <span>{progress}٪</span>
          </div>
          <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      {!completed && (
        <button
          onClick={() => onStart?.(quest)}
          className="w-full text-xs font-bold py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white transition flex items-center justify-center gap-1"
        >
          {quest.startedAt ? 'ادامه بده' : 'شروع چالش'} →
        </button>
      )}
    </div>
  );
};
