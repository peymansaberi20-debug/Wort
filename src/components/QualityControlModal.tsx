import React, { useState } from 'react';
import { Word } from '../types';
import { auditWord } from '../utils/storage';

interface QualityControlModalProps {
  words: Word[];
  ignoredIds: Record<string, number>;
  onClose: () => void;
  onEditWord: (word: Word) => void;
  onIgnoreWord: (wordId: string) => void;
  onDeleteWord: (word: Word) => void;
}

export const QualityControlModal: React.FC<QualityControlModalProps> = ({
  words,
  ignoredIds,
  onClose,
  onEditWord,
  onIgnoreWord,
  onDeleteWord
}) => {
  // Collect all problematic words and their audit issues
  const problematicWords = words
    .filter(w => !ignoredIds[w.id])
    .map(w => ({ word: w, issues: auditWord(w) }))
    .filter(item => item.issues.length > 0);

  // Group by category (Request #5)
  const categoryGroups = new Map<string, { word: Word; issues: string[] }[]>();
  problematicWords.forEach(item => {
    const cat = item.word.cat || 'بدون دسته';
    if (!categoryGroups.has(cat)) categoryGroups.set(cat, []);
    categoryGroups.get(cat)!.push(item);
  });

  const categories = Array.from(categoryGroups.keys()).sort((a, b) => a.localeCompare(b, 'fa'));

  // Track expanded category accordions
  const [openCats, setOpenCats] = useState<Record<string, boolean>>(() => {
    // Open first category by default if available
    const init: Record<string, boolean> = {};
    if (categories.length > 0) init[categories[0]] = true;
    return init;
  });

  const toggleCat = (cat: string) => {
    setOpenCats(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 overflow-y-auto"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-hidden shadow-2xl flex flex-col text-right">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#dde1ea] dark:border-[#333b4a] flex items-center justify-between gap-2 bg-slate-50 dark:bg-[#141923]">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔍</span>
            <h3 className="font-bold text-base md:text-lg text-slate-900 dark:text-slate-100">
              کنترل کیفیت واژگان ({problematicWords.length} مورد نیازمند بررسی)
            </h3>
          </div>
          <button
            onClick={onClose}
            className="bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 px-3 py-1 rounded-xl text-xs md:text-sm font-semibold transition"
          >
            ×
          </button>
        </div>

        {/* Description */}
        <div className="p-4 bg-blue-50/50 dark:bg-blue-950/20 border-b border-[#dde1ea] dark:border-[#333b4a] text-xs text-[#5d6676] dark:text-[#a3adbd]">
          واژه‌هایی که آرتیکل، صرف، مثال یا ترجمهٔ آن‌ها ناقص یا نامعمول است در دسته‌های زیر مرتب شده‌اند.
          می‌توانید هر واژه را ویرایش کنید، در صورت اطمینان نادیده بگیرید یا کاملاً حذف کنید.
        </div>

        {/* Content List grouped by Category */}
        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          {problematicWords.length === 0 ? (
            <div className="text-center py-12 text-emerald-600 dark:text-emerald-400">
              <span className="text-4xl block mb-2">🎉</span>
              <p className="font-bold">همهٔ واژگان کیفیت بالایی دارند و هیچ خطایی یافت نشد!</p>
            </div>
          ) : (
            categories.map(cat => {
              const items = categoryGroups.get(cat) || [];
              const isOpen = !!openCats[cat];
              return (
                <div
                  key={cat}
                  className="border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl overflow-hidden bg-white dark:bg-[#1b2029]"
                >
                  {/* Category Accordion Header */}
                  <button
                    onClick={() => toggleCat(cat)}
                    className="w-full px-4 py-2.5 flex items-center justify-between text-right font-bold text-sm bg-slate-100/70 dark:bg-slate-800/60 hover:bg-slate-200/70 transition"
                  >
                    <div className="flex items-center gap-2">
                      <span>📁 {cat}</span>
                      <span className="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 text-xs px-2 py-0.5 rounded-full font-normal">
                        {items.length} واژه
                      </span>
                    </div>
                    <span className="text-xs text-[#5d6676]">{isOpen ? '▲ بستن' : '▼ باز کردن'}</span>
                  </button>

                  {/* Words List under Category */}
                  {isOpen && (
                    <div className="divide-y divide-[#dde1ea] dark:divide-[#333b4a] p-2 space-y-2">
                      {items.map(({ word, issues }) => (
                        <div
                          key={word.id}
                          className="p-2.5 rounded-xl bg-slate-50/50 dark:bg-slate-900/30 text-xs space-y-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2" dir="ltr">
                              {word.art && (
                                <span className="font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">
                                  {word.art}
                                </span>
                              )}
                              <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                                {word.de}
                              </span>
                              {word.fa && (
                                <span className="text-slate-500 text-xs font-normal" dir="rtl">
                                  ({word.fa})
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md font-medium">
                              {word.pos || 'بدون نوع'} • {word.lvl || 'بدون سطح'}
                            </span>
                          </div>

                          {/* Audit issues */}
                          <div className="text-red-600 dark:text-red-400 text-[11px] space-y-0.5">
                            {issues.map((iss, idx) => (
                              <div key={idx} className="flex items-center gap-1">
                                <span>⚠️</span>
                                <span>{iss}</span>
                              </div>
                            ))}
                          </div>

                          {/* Action Buttons: ویرایش, نادیده بگیر, حذف کامل */}
                          <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-slate-200/60 dark:border-slate-800/60">
                            <button
                              onClick={() => onEditWord(word)}
                              className="bg-blue-50 text-[#1f5fbf] hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-300 px-2.5 py-1 rounded-lg text-xs font-medium transition flex items-center gap-1"
                            >
                              ✏️ ویرایش
                            </button>
                            <button
                              onClick={() => onIgnoreWord(word.id)}
                              className="bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 px-2.5 py-1 rounded-lg text-xs font-medium transition flex items-center gap-1"
                            >
                              🙈 نادیده بگیر
                            </button>
                            <button
                              onClick={() => onDeleteWord(word)}
                              className="bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/50 dark:text-red-300 px-2.5 py-1 rounded-lg text-xs font-medium transition flex items-center gap-1"
                            >
                              🗑 حذف کامل
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
