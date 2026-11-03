import React, { useState, useMemo, useEffect } from 'react';
import { Word } from '../types';
import { getCategories, resolveCat } from '../utils/storage';

interface WordManagerModalProps {
  words: Word[];
  onClose: () => void;
  onMoveWords: (wordIds: string[], targetCategory: string) => void;
  onBatchDelete: (wordIds: string[]) => void;
  onOpenDuplicateDetector?: () => void;
  onOpenQualityControl?: () => void;
  qualityIssueCount?: number;
}

export const WordManagerModal: React.FC<WordManagerModalProps> = ({
  words,
  onClose,
  onMoveWords,
  onBatchDelete,
  onOpenDuplicateDetector,
  onOpenQualityControl,
  qualityIssueCount = 0
}) => {
  const [srcCat, setSrcCat] = useState<string>('*'); // default: all words!
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [targetCat, setTargetCat] = useState<string>('');
  const [newCatName, setNewCatName] = useState<string>('');
  const [showHelp, setShowHelp] = useState<boolean>(false);

  const categories = useMemo(() => getCategories(words), [words]);

  // Drop IDs only after the corresponding records are actually gone; canceling confirmation preserves selection.
  useEffect(() => {
    const existingIds = new Set(words.map(word => word.id));
    setSelectedIds(prev => {
      const next = new Set(Array.from(prev).filter(id => existingIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [words]);

  // Filtered words
  const filteredWords = useMemo(() => {
    return words
      .filter(w => {
        const matchesCategory =
          srcCat === '*' ||
          (srcCat === '__none' ? !w.cat : w.cat === srcCat);
        const matchesQuery =
          !searchQuery.trim() ||
          (w.de + ' ' + w.fa).toLowerCase().includes(searchQuery.trim().toLowerCase());
        return matchesCategory && matchesQuery;
      })
      .sort((a, b) => (a.cat || '').localeCompare(b.cat || '', 'fa') || a.de.localeCompare(b.de, 'de'));
  }, [words, srcCat, searchQuery]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      filteredWords.forEach(w => next.add(w.id));
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleMove = () => {
    if (selectedIds.size === 0) return;
    let finalCat = targetCat;
    if (targetCat === '__new') {
      const resolved = resolveCat(newCatName, words);
      if (!resolved) {
        alert('لطفاً نام دسته جدید را وارد کنید.');
        return;
      }
      finalCat = resolved;
    } else if (targetCat === '__none') {
      finalCat = '';
    } else if (!targetCat) {
      alert('لطفاً دسته مقصد را انتخاب کنید.');
      return;
    }

    onMoveWords(Array.from(selectedIds), finalCat);
    setSelectedIds(new Set());
    setTargetCat('');
    setNewCatName('');
  };

  const handleDelete = () => {
    if (selectedIds.size === 0) return;
    onBatchDelete(Array.from(selectedIds));
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 overflow-y-auto"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl w-full max-w-3xl max-h-[92vh] overflow-hidden shadow-2xl flex flex-col text-right">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#dde1ea] dark:border-[#333b4a] flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-[#141923]">
          <div className="flex items-center gap-2">
            <span className="text-xl">🗂</span>
            <h3 className="font-bold text-base md:text-lg text-slate-900 dark:text-slate-100">
              مدیریت و انتقال گروهی واژه‌ها
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onOpenDuplicateDetector && (
              <button
                onClick={onOpenDuplicateDetector}
                className="bg-amber-50 text-amber-900 hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-200 border border-amber-200 dark:border-amber-800 px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1"
                title="بررسی واژگان تکراری و مشابه"
              >
                🔍 بررسی تکراری‌ها
              </button>
            )}
            {onOpenQualityControl && (
              <button
                onClick={onOpenQualityControl}
                className="bg-emerald-50 text-emerald-900 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1"
                title="کنترل کیفیت واژگان"
              >
                ✅ کنترل کیفیت
                {qualityIssueCount > 0 && (
                  <span className="bg-amber-500 text-white rounded-full px-1.5 text-[10px] leading-4">{qualityIssueCount}</span>
                )}
              </button>
            )}
            <button
              onClick={() => setShowHelp(prev => !prev)}
              aria-label="راهنما"
              title="راهنما"
              className="w-8 h-8 rounded-full bg-blue-50 text-[#1f5fbf] hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 text-base font-extrabold transition flex items-center justify-center"
            >
              !
            </button>
            <button
              onClick={onClose}
              aria-label="خروج"
              title="خروج"
              className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 text-base font-semibold transition flex items-center justify-center"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Collapsible Help Section */}
        {showHelp && (
          <div className="p-4 bg-blue-50/70 dark:bg-blue-950/40 border-b border-[#dde1ea] dark:border-[#333b4a] text-xs text-slate-700 dark:text-slate-300 space-y-1.5 leading-relaxed">
            <p className="font-bold text-sm text-[#1f5fbf] dark:text-[#7fb0ff]">راهنمای استفاده از مدیریت واژه‌ها:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>پیش‌فرض این بخش، نمایش <b>همهٔ واژگان</b> در جدول منظم است.</li>
              <li>می‌توانید دستهٔ مبدأ را فیلتر کنید یا واژه‌ای را جستجو نمایید.</li>
              <li>واژه‌های دلخواه را تیک بزنید (یا از دکمهٔ «انتخاب همه» استفاده کنید).</li>
              <li>برای <b>انتقال</b>: دستهٔ مقصد را از پایین انتخاب کرده و «انتقال واژه‌ها» را بزنید.</li>
              <li>برای <b>حذف گروهی</b>: پس از تیک زدن واژه‌ها، دکمهٔ «حذف واژه‌های انتخاب‌شده» را بزنید.</li>
            </ul>
          </div>
        )}

        {/* Filters and Search Bar */}
        <div className="p-4 border-b border-[#dde1ea] dark:border-[#333b4a] space-y-3 bg-slate-50/40 dark:bg-slate-900/20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#5d6676] dark:text-[#a3adbd] mb-1">
                فیلتر بر اساس دسته:
              </label>
              <select
                value={srcCat}
                onChange={e => setSrcCat(e.target.value)}
                className="w-full bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 text-xs md:text-sm outline-none"
              >
                <option value="*">همهٔ واژه‌ها ({words.length} واژه)</option>
                {categories.map(([c, n]) => (
                  <option key={c} value={c}>
                    {c} ({n} واژه)
                  </option>
                ))}
                <option value="__none">
                  بدون دسته ({words.filter(w => !w.cat).length} واژه)
                </option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#5d6676] dark:text-[#a3adbd] mb-1">
                جستجوی واژه:
              </label>
              <input
                type="text"
                placeholder="جستجو به آلمانی یا فارسی..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 text-xs md:text-sm outline-none"
              />
            </div>
          </div>

          {/* Quick Selection Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
            <div className="flex items-center gap-2">
              <button
                onClick={selectAllVisible}
                className="bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-300 px-3 py-1 rounded-lg font-medium transition"
              >
                ☑️ انتخاب همه ({filteredWords.length})
              </button>
              <button
                onClick={clearSelection}
                className="bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-300 px-3 py-1 rounded-lg font-medium transition"
              >
                ⬜ لغو انتخاب
              </button>
            </div>
            <span className="font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">
              {selectedIds.size} واژه انتخاب شده
            </span>
          </div>
        </div>

        {/* Word Table / List */}
        <div className="p-4 overflow-y-auto flex-1 max-h-[46vh] space-y-1.5 divide-y divide-slate-100 dark:divide-slate-800">
          {filteredWords.length === 0 ? (
            <p className="text-center py-10 text-slate-400 text-sm">هیچ واژه‌ای با این مشخصات یافت نشد.</p>
          ) : (
            filteredWords.map(w => {
              const isChecked = selectedIds.has(w.id);
              return (
                <label
                  key={w.id}
                  className={`flex items-center justify-between gap-3 p-2.5 rounded-xl cursor-pointer transition select-none ${
                    isChecked
                      ? 'bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleSelect(w.id)}
                      className="w-4 h-4 rounded text-[#1f5fbf] flex-shrink-0"
                    />
                    <div className="flex items-baseline gap-2" dir="ltr">
                      {w.art && (
                        <span className={`text-xs font-bold ${
                          w.art === 'der' ? 'text-blue-600 dark:text-blue-400' :
                          w.art === 'die' ? 'text-pink-600 dark:text-pink-400' :
                          'text-emerald-600 dark:text-emerald-400'
                        }`}>
                          {w.art}
                        </span>
                      )}
                      <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                        {w.de}
                      </span>
                    </div>
                    {w.fa && (
                      <span className="text-xs text-[#5d6676] dark:text-[#a3adbd] truncate max-w-xs">
                        — {w.fa}
                      </span>
                    )}
                  </div>
                  <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[11px] px-2 py-0.5 rounded-full flex-shrink-0">
                    {w.cat || 'بدون دسته'}
                  </span>
                </label>
              );
            })
          )}
        </div>

        {/* Action Bar at Bottom */}
        <div className="p-4 border-t border-[#dde1ea] dark:border-[#333b4a] bg-slate-50 dark:bg-[#141923] space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <label className="text-xs font-bold text-[#5d6676] flex-shrink-0">
                انتقال به دستهٔ:
              </label>
              <select
                value={targetCat}
                onChange={e => setTargetCat(e.target.value)}
                className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-1.5 text-xs md:text-sm flex-1 outline-none"
              >
                <option value="">— انتخاب دسته مقصد —</option>
                {categories.map(([c, n]) => (
                  <option key={c} value={c}>
                    {c} ({n} واژه)
                  </option>
                ))}
                <option value="__none">بدون دسته</option>
                <option value="__new">➕ دستهٔ جدید…</option>
              </select>

              {targetCat === '__new' && (
                <input
                  type="text"
                  placeholder="نام دسته جدید..."
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-1.5 text-xs md:text-sm flex-1 outline-none"
                />
              )}

              <button
                onClick={handleMove}
                disabled={selectedIds.size === 0 || !targetCat}
                className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-4 py-1.5 rounded-xl font-bold text-xs md:text-sm disabled:opacity-40 transition"
              >
                انتقال ({selectedIds.size})
              </button>
            </div>

            <button
              onClick={handleDelete}
              disabled={selectedIds.size === 0}
              className="bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/60 dark:text-red-300 px-3.5 py-1.5 rounded-xl text-xs md:text-sm font-bold disabled:opacity-40 transition flex items-center justify-center gap-1.5"
            >
              <span>🗑 حذف انتخاب‌شده‌ها</span>
              <span>({selectedIds.size})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
