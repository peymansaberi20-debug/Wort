/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef } from 'react';
import { AppSettings, Word } from '../types';
import { getCategories, fullWord, checkWord, isNounPos, isVerbPos, isAdjPos } from '../utils/storage';
import { speak } from '../utils/audio';
import { WordDetailModal } from '../components/WordDetailModal';
import { IconBtn } from '../components/IconBtn';
import { Plus, Search, BookOpen, Trash2, Edit2, UploadCloud, FolderPlus, Download, CheckCircle, RefreshCw, Layers, CheckSquare, BarChart2, ShieldCheck } from 'lucide-react';

interface VocabularyViewProps {
  words: Word[];
  settings?: AppSettings;
  onShowToast: (msg: string, isErr?: boolean) => void;
  onEditWord: (word: Word) => void;
  onDeleteWord: (word: Word) => void;
  onAddNewWord: () => void;
  onImageChange: (word: Word, newImg: string) => void;
  onOpenGroupImport: () => void;
  onOpenGroupManage?: () => void;
  onOpenCompare?: () => void;
  onOpenQualityCheck?: () => void;
}

export const VocabularyView: React.FC<VocabularyViewProps> = ({
  words,
  settings,
  onShowToast,
  onEditWord,
  onDeleteWord,
  onAddNewWord,
  onImageChange,
  onOpenGroupImport,
  onOpenGroupManage,
  onOpenCompare,
  onOpenQualityCheck
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCat, setSelectedCat] = useState<string>('all');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [selectedArt, setSelectedArt] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('az');
  const [showFlatList, setShowFlatList] = useState<boolean>(false);
  const [collapsedCats, setCollapsedCats] = useState<Record<string, boolean>>({});
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);

  const categories = useMemo(() => getCategories(words), [words]);

  const filteredWords = useMemo(() => {
    return words.filter(w => {
      if (selectedCat !== 'all' && w.cat !== selectedCat) return false;
      if (selectedLevel !== 'all' && w.lvl !== selectedLevel) return false;
      if (selectedArt !== 'all' && (w.art || '').toLowerCase() !== selectedArt.toLowerCase()) return false;
      if (selectedStatus === 'learned' && (w.stage || 0) < 3) return false;
      if (selectedStatus === 'learning' && ((w.stage || 0) >= 3 || !(w.last))) return false;
      if (selectedStatus === 'new' && (w.last)) return false;
      if (selectedStatus === 'hard' && (w.bad || 0) <= 3) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        w.de.toLowerCase().includes(q) ||
        w.fa.toLowerCase().includes(q) ||
        (w.en && w.en.toLowerCase().includes(q)) ||
        (w.syn && w.syn.toLowerCase().includes(q)) ||
        (w.ant && w.ant.toLowerCase().includes(q))
      );
    }).sort((a, b) => {
      if (sortBy === 'za') return b.de.localeCompare(a.de);
      if (sortBy === 'bad') return (b.bad || 0) - (a.bad || 0);
      if (sortBy === 'newest') return (b.added || 0) - (a.added || 0);
      return a.de.localeCompare(b.de);
    });
  }, [words, selectedCat, selectedLevel, selectedArt, selectedStatus, searchQuery, sortBy]);

  const toggleCatCollapse = (cat: string) => {
    setCollapsedCats(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  return (
    <div className="space-y-4 text-right max-w-2xl mx-auto pb-10">
      {/* هدر بالایی با تب‌های عملیاتی و فیلترها (کاملاً هماهنگ با سبک تمرینات) */}
      <div className="sticky top-16 md:top-[4.5rem] z-20 bg-[#f6f7fb]/95 dark:bg-[#12151c]/95 backdrop-blur -mx-2 px-2 py-2">
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-4 md:p-5 shadow-sm space-y-3">
          
          {/* دکمه‌های ابزار بالای صفحه */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <button
              onClick={onAddNewWord}
              className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-xs"
            >
              <Plus size={15} />
              <span>افزودن تکی</span>
            </button>
            <button
              onClick={onOpenGroupImport}
              className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-xs"
            >
              <UploadCloud size={15} />
              <span>افزودن گروهی</span>
            </button>
            <button
              onClick={onOpenGroupManage}
              className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-xs"
            >
              <Layers size={15} />
              <span>مدیریت گروهی</span>
            </button>
            <button
              onClick={onOpenCompare}
              className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-xs"
            >
              <BarChart2 size={15} />
              <span>مقایسه لغت‌ها</span>
            </button>
            <button
              onClick={onOpenQualityCheck}
              className="col-span-2 sm:col-span-1 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-xs"
            >
              <ShieldCheck size={15} />
              <span>کنترل کیفیت</span>
            </button>
          </div>

          {/* نوار جستجو */}
          <div className="relative">
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400">
              <Search size={18} />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="جستجو در واژگان (کلمه آلمانی یا معنی فارسی)..."
              className="w-full bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl pr-10 pl-4 py-2.5 text-sm md:text-base outline-none font-sans transition"
            />
          </div>

          {/* فیلترهای کشویی */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select
              value={selectedArt}
              onChange={e => setSelectedArt(e.target.value)}
              className="bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 text-xs md:text-sm font-semibold outline-none"
            >
              <option value="all">آرتیکل: همه</option>
              <option value="der">der</option>
              <option value="die">die</option>
              <option value="das">das</option>
            </select>

            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 text-xs md:text-sm font-semibold outline-none"
            >
              <option value="all">وضعیت: همه</option>
              <option value="new">جدید (مرور نشده)</option>
              <option value="learning">در حال یادگیری</option>
              <option value="learned">یادگرفته‌شده</option>
              <option value="hard">پر‌اشتباه / سخت</option>
            </select>

            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 text-xs md:text-sm font-semibold outline-none"
            >
              <option value="az">مرتب‌سازی: الفبایی (A-Z)</option>
              <option value="za">مرتب‌سازی: معکوس (Z-A)</option>
              <option value="bad">بیشترین اشتباه</option>
              <option value="newest">جدیدترین افزودن</option>
            </select>
          </div>
        </div>
      </div>

      {/* کنترل‌های نمایش دسته‌بندی شده یا تخت */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-bold text-[#5d6676] dark:text-[#a3adbd]">
          دسته‌بندی واژگان ({filteredWords.length} واژه در {categories.length} دسته)
        </span>
        <button
          onClick={() => setShowFlatList(prev => !prev)}
          className="text-xs font-bold text-[#1f5fbf] dark:text-[#7fb0ff] bg-blue-50 dark:bg-blue-950/40 px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-900 transition"
        >
          {showFlatList ? '📁 نمایش دسته‌بندی‌شده' : '📄 مشاهده کل واژگان بدون دسته‌بندی'}
        </button>
      </div>

      {/* لیست واژگان (یا بر اساس دسته‌بندی یا لیست یکپارچه) */}
      <div className="space-y-3">
        {filteredWords.length === 0 ? (
          <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-8 text-center space-y-2 shadow-sm">
            <span className="text-3xl block">📭</span>
            <div className="font-bold text-base text-slate-800 dark:text-slate-200">واژه‌ای با این مشخصات یافت نشد</div>
            <p className="text-sm text-[#5d6676]">می‌توانید کلمهٔ جستجو را تغییر دهید یا واژهٔ جدیدی اضافه کنید.</p>
          </div>
        ) : showFlatList ? (
          <div className="space-y-2">
            {filteredWords.map(w => renderWordCard(w))}
          </div>
        ) : (
          categories.map(([catName, catCount]) => {
            const catWords = filteredWords.filter(w => w.cat === catName);
            if (catWords.length === 0 && searchQuery) return null;
            const isCollapsed = !!collapsedCats[catName];

            return (
              <div key={catName} className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl overflow-hidden shadow-xs">
                <div
                  onClick={() => toggleCatCollapse(catName)}
                  className="px-4 py-3 bg-slate-50 dark:bg-[#141923] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between cursor-pointer select-none"
                >
                  <div className="flex items-center gap-2 font-bold text-sm text-slate-800 dark:text-slate-200">
                    <span>📁</span>
                    <span>{catName}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono">
                      ({catWords.length} واژه)
                    </span>
                  </div>
                  <span className="text-sm text-slate-500">{isCollapsed ? '▼' : '▲'}</span>
                </div>

                {!isCollapsed && (
                  <div className="p-3 space-y-2">
                    {catWords.length === 0 ? (
                      <div className="text-center py-2 text-xs text-slate-400">واژه‌ای در این دسته با فیلتر فعلی وجود ندارد.</div>
                    ) : (
                      catWords.map(w => renderWordCard(w))
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* مدال جزئیات و شناسنامه واژه */}
      {selectedWord && (
        <WordDetailModal
          word={words.find(x => x.id === selectedWord.id) || selectedWord}
          onClose={() => setSelectedWord(null)}
          onEdit={w => {
            setSelectedWord(null);
            onEditWord(w);
          }}
          onDelete={w => {
            setSelectedWord(null);
            onDeleteWord(w);
          }}
          onImageChange={onImageChange}
        />
      )}
    </div>
  );

  function renderWordCard(w: Word) {
    const artCls = w.art === 'der' ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40' : w.art === 'die' ? 'text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/40' : 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40';
    return (
      <div
        key={w.id}
        onClick={() => setSelectedWord(w)}
        className="bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-3.5 hover:border-[#1f5fbf] transition flex items-center justify-between gap-3 cursor-pointer shadow-xs"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap" dir="ltr">
              {w.art && <span className={`px-2 py-0.5 rounded-lg font-bold text-xs ${artCls}`}>{w.art}</span>}
              <span className="text-base md:text-lg font-extrabold font-sans text-slate-900 dark:text-slate-100">{w.de}</span>
              {w.lvl && <span className="px-2 py-0.5 rounded-md font-bold text-[11px] bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300">{w.lvl}</span>}
            </div>
            <div className="text-sm font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">{w.fa}</div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => speak(fullWord(w), { rate: settings?.rate, vreg: settings?.vreg, voiceName: settings?.voice })}
            className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center hover:bg-slate-200 transition"
            title="تلفظ"
          >
            🔊
          </button>
          <button
            onClick={() => onEditWord(w)}
            className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-[#1f5fbf] dark:text-[#7fb0ff] flex items-center justify-center hover:bg-blue-100 transition"
            title="ویرایش"
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={() => onDeleteWord(w)}
            className="w-9 h-9 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center hover:bg-red-100 transition"
            title="حذف"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    );
  }
};
