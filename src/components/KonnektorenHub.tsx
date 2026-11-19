/**
 * KonnektorenHub.tsx — یک درگاه واحد برای همهٔ تمرین‌های حروف ربط (Konnektoren):
 *   تب «جمله‌سازی با AI»: ساختن جمله با حرف ربط داده‌شده طبق سطح A1–C2 + تصحیح سه‌لایه، گفتگو، چاپ
 *     → کامپوننت KonnektorProTrainer
 *   تب «متن جای‌خالی»: تکمیل متن با حرف ربط درست از بین گزینه‌های گمراه‌کننده
 *     → کامپوننت KonnektorTrainer
 * ادغام دو تمرین هم‌موضوع در یک ورودی، بدون از دست رفتن هیچ قابلیتی.
 */

import React, { useState } from 'react';
import { AppSettings, Word } from '../types';
import { KonnektorProTrainer } from './KonnektorProTrainer';
import { KonnektorTrainer } from './KonnektorTrainer';

export type KonnektorenTab = 'ai' | 'cloze';

interface KonnektorenHubProps {
  settings?: AppSettings;
  onShowToast: (msg: string, isErr?: boolean) => void;
  onQuickAddWord?: (w: Partial<Word>) => boolean;
  onClose?: () => void;
  /** اگر از حالت قدیمی «konnektoren» باز شود، مستقیم روی تب متن جای‌خالی می‌رود */
  initialTab?: KonnektorenTab;
}

const TAB_KEY = 'wb_konnektoren_tab';

const loadTab = (initialTab?: KonnektorenTab): KonnektorenTab => {
  if (initialTab === 'cloze' || initialTab === 'ai') return initialTab;
  try {
    const saved = localStorage.getItem(TAB_KEY);
    if (saved === 'ai' || saved === 'cloze') return saved;
  } catch { /* ignore */ }
  return 'ai';
};

export const KonnektorenHub: React.FC<KonnektorenHubProps> = ({ settings, onShowToast, onQuickAddWord, onClose, initialTab }) => {
  const [tab, setTab] = useState<KonnektorenTab>(() => loadTab(initialTab));

  const pick = (t: KonnektorenTab): void => {
    setTab(t);
    try { localStorage.setItem(TAB_KEY, t); } catch { /* ignore */ }
  };

  return (
    <div dir="rtl" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => pick('ai')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition ${tab === 'ai' ? 'bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white shadow' : 'bg-slate-100 dark:bg-slate-800 text-[#5d6676] dark:text-[#a3adbd]'}`}
        >
          🤖 جمله‌سازی با AI
        </button>
        <button
          onClick={() => pick('cloze')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition ${tab === 'cloze' ? 'bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white shadow' : 'bg-slate-100 dark:bg-slate-800 text-[#5d6676] dark:text-[#a3adbd]'}`}
        >
          📝 متن جای‌خالی
        </button>
        <span className="text-[11px] text-[#5d6676] dark:text-[#a3adbd] mr-auto">هر دو تب روی همهٔ حروف ربط A1–C2 کار می‌کنند؛ تاریخچهٔ هرکدام جدا ذخیره می‌شود.</span>
      </div>

      {tab === 'ai' ? (
        <KonnektorProTrainer
          settings={settings}
          onShowToast={onShowToast}
          onQuickAddWord={onQuickAddWord}
          onClose={onClose}
        />
      ) : (
        <KonnektorTrainer
          onClose={onClose}
          onShowToast={onShowToast}
        />
      )}
    </div>
  );
};
