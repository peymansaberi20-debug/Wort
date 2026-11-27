/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * WordFamiliesView.tsx — تب خانواده واژگان (درخواست کاربر ۳)
 *
 * نمایش خانواده‌های واژگانی به‌صورت درخت زیبا در تب واژگان.
 * - هر خانواده یک سرِ مشخص + اعضا (اسم/فعل/صفت)
 * - روی هر عضو کلیک کنی → پروفایل واژه باز می‌شود
 * - جست‌وجو بر اساس سر یا اعضا
 */
import React, { useState, useMemo } from 'react';
import { Word } from '../types';
import { buildWordFamilies, WordFamily } from '../utils/wordFamily';

interface Props {
  words: Word[];
  onSelectWord: (w: Word) => void;
}

export const WordFamiliesView: React.FC<Props> = ({ words, onSelectWord }) => {
  const [query, setQuery] = useState('');
  const families = useMemo(() => buildWordFamilies(words), [words]);

  const filtered = useMemo(() => {
    if (!query.trim()) return families;
    const q = query.trim().toLowerCase();
    return families.filter(f =>
      f.head.toLowerCase().includes(q) ||
      f.members.some(m => m.word.de.toLowerCase().includes(q)) ||
      (f.headFa || '').includes(query.trim())
    );
  }, [families, query]);

  return (
    <div className="space-y-3 text-right">
      {/* جست‌وجو */}
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="جست‌وجو در خانواده‌ها (سر یا اعضا)…"
        className="w-full px-3.5 py-2.5 rounded-xl border border-[#dde1ea] dark:border-[#333b4a] bg-white dark:bg-[#141923] text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#4385e8]"
      />

      {/* شمارش */}
      <div className="text-xs text-[#5d6676] dark:text-[#a3adbd] flex items-center gap-1.5">
        <span>🌐</span>
        <span>{filtered.length} خانواده واژگانی (از مجموع {families.length})</span>
      </div>

      {filtered.length === 0 ? (
        <div className="p-6 rounded-xl bg-slate-50 dark:bg-[#141923] text-center text-sm text-[#5d6676] dark:text-[#a3adbd]">
          {families.length === 0
            ? 'هنوز خانواده‌ای ثبت نشده. در پروفایل هر واژه، در فیلد «یادداشت» خطی به شکل «خانواده واژگانی: اسم: ... | فعل مرتبط: ... | صفت: ...» اضافه کن تا اینجا نمایش داده شود.'
            : 'خانواده‌ای با این جست‌وجو پیدا نشد.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(f => (
            <FamilyCard key={f.id} family={f} onSelectWord={onSelectWord} />
          ))}
        </div>
      )}
    </div>
  );
};

const FamilyCard: React.FC<{ family: WordFamily; onSelectWord: (w: Word) => void }> = ({ family, onSelectWord }) => {
  const roleLabel: Record<string, string> = { head: 'سر', noun: 'اسم', verb: 'فعل', adj: 'صفت' };
  const roleColor: Record<string, string> = {
    head: 'bg-gradient-to-br from-[#1f5fbf] to-[#6b4fd8] text-white',
    noun: 'bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300',
    verb: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300',
    adj: 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
  };

  return (
    <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-3.5 shadow-xs">
      {/* سرِ خانواده */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1f5fbf] to-[#6b4fd8] flex items-center justify-center text-lg flex-shrink-0">
            {family.icon}
          </span>
          <div className="min-w-0">
            <b className="text-base text-slate-900 dark:text-slate-100 block truncate" dir="ltr">{family.head}</b>
            {family.headFa && <span className="text-xs text-[#5d6676] dark:text-[#a3adbd] truncate block">{family.headFa}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {family.level && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{family.level}</span>}
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#1f5fbf]/10 text-[#1f5fbf] dark:bg-[#7fb0ff]/10 dark:text-[#7fb0ff]">{family.count} عضو</span>
        </div>
      </div>

      {/* اعضا */}
      <div className="flex flex-wrap gap-1.5">
        {family.members.map((m, i) => (
          <button
            key={`${m.word.id}-${i}`}
            onClick={() => onSelectWord(m.word)}
            className="group inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#dde1ea] dark:border-[#333b4a] bg-slate-50 dark:bg-[#141923] hover:bg-blue-50 dark:hover:bg-blue-950/30 transition text-right"
            title={roleLabel[m.role]}
          >
            <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${roleColor[m.role]}`}>{roleLabel[m.role]}</span>
            <span className="text-sm font-bold text-slate-900 dark:text-slate-100" dir="ltr">
              {m.word.art ? `${m.word.art} ` : ''}{m.word.de}
            </span>
            {m.word.fa && <span className="text-[10px] text-[#5d6676] dark:text-[#a3adbd] hidden sm:inline">— {m.word.fa}</span>}
          </button>
        ))}
      </div>
    </div>
  );
};
