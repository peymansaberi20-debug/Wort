/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * SuggestionCard.tsx — توصیه‌گر روزانه (درخواست کاربر ۷)
 *
 * جایگزین گزینهٔ «کتابخانهٔ واژگان» در خوش‌آمدگویی صفحهٔ اول.
 * - یک پیشنهاد اولویت‌بندی‌شده نشان می‌دهد
 * - در حالت اضطراری (۸ شب گذشته و هدف شروع نشده): دکمه با انیمیشن بزرگ‌نمایی + ویبره
 *   به‌محض کلیک → انیمیشن، ویبره، و سپس اجرا
 * - روی دکمه کلیک کنی → onAction(action)
 */
import React, { useState, useRef, useEffect } from 'react';
import { AppState } from '../types';
import { getSuggestion, isUrgent, Suggestion } from '../utils/suggestedPractices';

interface Props {
  state: AppState;
  onAction: (action: Suggestion['action']) => void;
}

export const SuggestionCard: React.FC<Props> = ({ state, onAction }) => {
  const suggestion = React.useMemo(() => getSuggestion(state), [state]);
  const urgent = React.useMemo(() => isUrgent(state), [state]);
  const [clicked, setClicked] = useState(false);
  const [animClass, setAnimClass] = useState('');
  const cardRef = useRef<HTMLButtonElement>(null);

  // اگر حالت اضطراری است، یک انیمیشن پیوسته «بزرگ‌نمایی-کوچک‌نمایی-چرخش» + ویبره
  useEffect(() => {
    if (urgent) {
      setAnimClass('animate-pulse ring-4 ring-rose-400 dark:ring-rose-500 scale-105');
      // ویبره (در صورت پشتیبانی)
      if (typeof navigator !== 'undefined' && (navigator as any).vibrate) {
        try { (navigator as any).vibrate([400, 200, 400, 200, 400]); } catch { /* ignore */ }
      }
    } else {
      setAnimClass('');
    }
  }, [urgent]);

  const handleClick = () => {
    // وقتی کلیک شد: یک انیمیشن بزرگ‌نمایی سریع + ویبره کوتاه → سپس اجرا
    setClicked(true);
    setAnimClass('scale-150 ring-8 ring-rose-400');
    if (typeof navigator !== 'undefined' && (navigator as any).vibrate) {
      try { (navigator as any).vibrate(200); } catch { /* ignore */ }
    }
    setTimeout(() => {
      onAction(suggestion.action);
      setAnimClass('');
      setClicked(false);
    }, 350);
  };

  const colorClass = urgent
    ? 'bg-gradient-to-br from-rose-500 to-orange-500 text-white border-rose-700'
    : suggestion.kind === 'all-done'
      ? 'bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-950/40 dark:to-teal-950/40 border-emerald-300 dark:border-emerald-700'
      : 'bg-white dark:bg-[#1b2029] border-[#dde1ea] dark:border-[#333b4a]';

  return (
    <button
      onClick={handleClick}
      disabled={suggestion.action === 'none'}
      ref={cardRef}
      className={`relative w-full text-right px-2 h-9 rounded-xl border-2 transition-all duration-300 ${colorClass} ${animClass} ${suggestion.action === 'none' ? 'opacity-95 cursor-default' : 'hover:shadow-lg active:scale-95'} flex items-center gap-1.5 overflow-hidden`}
      aria-label={suggestion.title}
    >
      {/* درخواست کاربر ۱: ارتفاع نصف، حذف توضیحات غیرضروری — فقط آیکن + عنوان */}
      <span className={`text-base flex-shrink-0 ${urgent ? 'animate-bounce' : ''}`}>{suggestion.icon}</span>
      <b className={`text-[11px] font-bold truncate flex-1 ${urgent ? 'text-white' : 'text-slate-900 dark:text-slate-100'}`}>{suggestion.title}</b>
      {suggestion.action !== 'none' && (
        <span className={`text-[10px] font-bold flex-shrink-0 ${urgent ? 'text-white' : 'text-[#1f5fbf] dark:text-[#7fb0ff]'}`}>→</span>
      )}
      {urgent && (
        <span className="px-1 py-0.5 rounded bg-rose-700 text-white text-[9px] font-extrabold animate-pulse flex-shrink-0">
          🚨 فوری
        </span>
      )}
    </button>
  );
};
