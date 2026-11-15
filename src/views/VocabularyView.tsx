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
import { Plus, Search, BookOpen, Trash2, Edit2, UploadCloud, FolderPlus, Download, CheckCircle, RefreshCw } from 'lucide-react';

interface VocabularyViewProps {
  words: Word[];
  settings?: AppSettings;
  onShowToast: (msg: string, isErr?: boolean) => void;
  onEditWord: (word: Word) => void;
  onDeleteWord: (word: Word) => void;
  onAddNewWord: () => void;
  onImageChange: (word: Word, newImg: string) => void;
  onOpenGroupImport: () => void;
}

export const VocabularyView: React.FC<VocabularyViewProps> = ({
  words,
  settings,
  onShowToast,
  onEditWord,
  onDeleteWord,
  onAddNewWord,
  onImageChange,
  onOpenGroupImport
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCat, setSelectedCat] = useState<string>('all');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);

  const categories = useMemo(() => getCategories(words), [words]);

  const filteredWords = useMemo(() => {
    return words.filter(w => {
      if (selectedCat !== 'all' && w.cat !== selectedCat) return false;
      if (selectedLevel !== 'all' && w.lvl !== selectedLevel) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        w.de.toLowerCase().includes(q) ||
        w.fa.toLowerCase().includes(q) ||
        (w.en && w.en.toLowerCase().includes(q)) ||
        (w.syn && w.syn.toLowerCase().includes(q)) ||
        (w.ant && w.ant.toLowerCase().includes(q))
      );
    });
  }, [words, selectedCat, selectedLevel, searchQuery]);

  return (
    <div className="space-y-4 text-right max-w-2xl mx-auto pb-10">
      {/* هدر بخش واژگان و دکمه‌های عملیاتی */}
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-5 md:p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg md:text-xl font-extrabold text-slate-900 dark:text-slate-100">📚 کتابخانه واژگان</h2>
            <p className="text-sm text-[#5d6676] dark:text-[#a3adbd] mt-0.5">مدیریت، جستجو و ویرایش کل واژه‌های ذخیره‌شده ({words.length} واژه)</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={onOpenGroupImport}
              className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-1.5 transition shadow-xs"
            >
              <UploadCloud size={16} />
              <span>افزودن گروهی</span>
            </button>
            <button
              onClick={onAddNewWord}
              className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-1.5 transition shadow-md"
            >
              <Plus size={16} />
              <span>واژه جدید</span>
            </button>
          </div>
        </div>

        {/* فیلترها و جستجو */}
        <div className="space-y-3 pt-2">
          <div className="relative">
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400">
              <Search size={18} />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="جستجو در واژگان آلمانی، فارسی یا معادل‌ها..."
              className="w-full bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl pr-10 pl-4 py-3 text-sm md:text-base outline-none font-sans transition"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <select
              value={selectedCat}
              onChange={e => setSelectedCat(e.target.value)}
              className="bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none"
            >
              <option value="all">📁 همهٔ دسته‌ها ({words.length})</option>
              {categories.map(([c, cnt]) => (
                <option key={c} value={c}>{c} ({cnt})</option>
              ))}
            </select>

            <select
              value={selectedLevel}
              onChange={e => setSelectedLevel(e.target.value)}
              className="bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none"
            >
              <option value="all">🎯 همهٔ سطوح (A1 - C2)</option>
              <option value="A1">سطح A1</option>
              <option value="A2">سطح A2</option>
              <option value="B1">سطح B1</option>
              <option value="B2">سطح B2</option>
              <option value="C1">سطح C1</option>
            </select>
          </div>
        </div>
      </div>

      {/* لیست واژگان */}
      <div className="space-y-3">
        {filteredWords.length === 0 ? (
          <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-8 text-center space-y-2 shadow-sm">
            <span className="text-3xl block">📭</span>
            <div className="font-bold text-base text-slate-800 dark:text-slate-200">واژه‌ای با این مشخصات یافت نشد</div>
            <p className="text-sm text-[#5d6676]">می‌توانید کلمهٔ جستجو را تغییر دهید یا واژهٔ جدیدی اضافه کنید.</p>
          </div>
        ) : (
          filteredWords.map(w => {
            const artCls = w.art === 'der' ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40' : w.art === 'die' ? 'text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/40' : 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40';
            return (
              <div
                key={w.id}
                onClick={() => setSelectedWord(w)}
                className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 hover:border-[#1f5fbf] transition flex items-center justify-between gap-3 cursor-pointer shadow-xs"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap" dir="ltr">
                      {w.art && <span className={`px-2 py-0.5 rounded-lg font-bold text-xs ${artCls}`}>{w.art}</span>}
                      <span className="text-lg md:text-xl font-extrabold font-sans text-slate-900 dark:text-slate-100">{w.de}</span>
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
};