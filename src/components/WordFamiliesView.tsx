/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * WordFamiliesView.tsx — تب خانواده واژگان (درخواست کاربر ۳، اصلاح‌شده)
 *
 * نمایش سرشاخه‌ها به‌صورت لیست ساده — روی هر کدام کلیک کنی → پنجرهٔ جدید باز می‌شود
 * و اعضای خانواده به‌صورت درختی واقعی با خطوط اتصال به واژهٔ اصلی نمایش داده می‌شوند.
 */
import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Word } from '../types';
import { buildWordFamilies, WordFamily, FamilyMember } from '../utils/wordFamily';

interface Props {
  words: Word[];
  onSelectWord: (w: Word) => void;
}

export const WordFamiliesView: React.FC<Props> = ({ words, onSelectWord }) => {
  const [query, setQuery] = useState('');
  const [selectedFamily, setSelectedFamily] = useState<WordFamily | null>(null);
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
        <span>{filtered.length} خانواده واژگانی (از مجموع {families.length}) — روی هر سرشاخه بزن تا درختش را ببینی</span>
      </div>

      {filtered.length === 0 ? (
        <div className="p-6 rounded-xl bg-slate-50 dark:bg-[#141923] text-center text-sm text-[#5d6676] dark:text-[#a3adbd]">
          {families.length === 0
            ? 'هنوز خانواده‌ای ثبت نشده. در پروفایل هر واژه، در فیلد «یادداشت» خطی به شکل «خانواده واژگانی: اسم: ... | فعل مرتبط: ... | صفت: ...» اضافه کن تا اینجا نمایش داده شود.'
            : 'خانواده‌ای با این جست‌وجو پیدا نشد.'}
        </div>
      ) : (
        /* لیست سرشاخه‌ها — هر کدام یک ردیف با آیکن و نام + badge تعداد اعضا */
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
          {filtered.map(f => (
            <button
              key={f.id}
              onClick={() => setSelectedFamily(f)}
              className="w-full px-3 py-2.5 flex items-center justify-between gap-2 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition text-right"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1f5fbf] to-[#6b4fd8] flex items-center justify-center text-lg flex-shrink-0">
                  {f.icon}
                </span>
                <div className="min-w-0">
                  <b className="text-base text-slate-900 dark:text-slate-100 block truncate" dir="ltr">{f.head}</b>
                  {f.headFa && <span className="text-xs text-[#5d6676] dark:text-[#a3adbd] truncate block">{f.headFa}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {f.level && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{f.level}</span>}
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#1f5fbf]/10 text-[#1f5fbf] dark:bg-[#7fb0ff]/10 dark:text-[#7fb0ff]">{f.count} عضو</span>
                <span className="text-slate-400 text-xs">‹</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* پنجرهٔ درخت خانواده — به body منتقل می‌شود */}
      {selectedFamily && (
        <FamilyTreeModal
          family={selectedFamily}
          onClose={() => setSelectedFamily(null)}
          onSelectWord={onSelectWord}
        />
      )}
    </div>
  );
};

/* ───────────── پنجرهٔ درخت خانواده با خطوط اتصال (پویا، اصلاح ۴ این دور) ─────────────
 * نمایش واقعی به‌صورت درخت:
 *   - سر در وسط بالا
 *   - اعضا در سه گروه (اسم/فعل/صفت) زیر سر
 *   - خطوط عمودی (CSS) از سر به هر دسته، سپس خطوط افقی به هر عضو
 *   - چیدمان flex-wrap برای پویا بودن: هر تعداد عضو باشند، به‌جای هم‌پوشانی در خطوط جدید می‌چینند.
 *   - درخواست کاربر ۴: ترجمهٔ مهم‌ترین معنی هر واژه زیر آن نمایش داده شود.
 */
const FamilyTreeModal: React.FC<{ family: WordFamily; onClose: () => void; onSelectWord: (w: Word) => void }> = ({ family, onClose, onSelectWord }) => {
  // دسته‌بندی اعضا بر اساس نقش
  const head = family.members.find(m => m.role === 'head');
  const nouns = family.members.filter(m => m.role === 'noun');
  const verbs = family.members.filter(m => m.role === 'verb');
  const adjs = family.members.filter(m => m.role === 'adj');
  // نمایش به‌صورت یک ستون از اعضا (به ترتیب: اسم/فعل/صفت)
  const branches: { members: FamilyMember[]; label: string; color: string; dotColor: string }[] = [
    { members: nouns, label: 'اسم (Nomen)', color: 'from-blue-500 to-indigo-500', dotColor: 'bg-blue-500' },
    { members: verbs, label: 'فعل (Verben)', color: 'from-emerald-500 to-teal-500', dotColor: 'bg-emerald-500' },
    { members: adjs, label: 'صفت (Adjektive)', color: 'from-amber-500 to-orange-500', dotColor: 'bg-amber-500' }
  ].filter(b => b.members.length > 0);

  // تابع انتخاب مهم‌ترین ترجمهٔ هر واژه (درخواست کاربر ۴):
  // اولین معنی قبل از «،» / «؛» / «/» / «|» که معنادار است (طول > ۱)
  const mainFa = (w: Word): string => {
    const fa = (w.fa || '').trim();
    if (!fa) return '';
    // جداکننده‌های رایج فارسی برای تقسیم چندمعنی
    const parts = fa.split(/[،,؛;\/|،]\s*|\s+یا\s+/).map(s => s.trim()).filter(s => s.length > 1);
    return parts.length > 0 ? parts[0] : fa;
  };

  const totalMembers = branches.reduce((s, b) => s + b.members.length, 0);
  // اگر هیچ شاخه‌ای نبود (تنها سر)، کل درخت فقط سر است
  if (totalMembers === 0 || !head) {
    return createPortal(
      <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white dark:bg-[#1b2029] rounded-3xl p-6 max-w-md w-full text-center relative" dir="rtl">
          <button onClick={onClose} className="absolute top-3 left-3 text-red-500 text-sm font-bold">✕</button>
          <div className="text-3xl mb-2">{family.icon}</div>
          <b className="text-lg" dir="ltr">{family.head}</b>
          <p className="text-xs text-[#5d6676] mt-2">این خانواده فقط شامل سر است.</p>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-xs flex items-start sm:items-center justify-center p-3 md:p-6 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl" dir="rtl">
        {/* هدر */}
        <div dir="ltr" className="sticky top-0 z-10 bg-white/95 dark:bg-[#1b2029]/95 backdrop-blur-md px-4 py-3 border-b border-[#dde1ea] dark:border-[#333b4a] flex items-center justify-between gap-2">
          <button onClick={onClose} className="text-red-500 text-sm font-bold px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30">✕ بستن</button>
          <h3 className="flex-1 text-right font-bold text-base md:text-lg text-slate-900 dark:text-slate-100">
            🌳 درخت خانوادهٔ واژگانی
          </h3>
        </div>

        {/* بدنهٔ درخت — چیدمان پویا با خطوط CSS */}
        <div className="p-3 md:p-5">
          {/* سرِ خانواده */}
          <div className="flex flex-col items-center mb-2">
            <b className="text-xs text-[#5d6676] dark:text-[#a3adbd] block mb-1">سرِ خانواده (Stamm)</b>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#1f5fbf] to-[#6b4fd8] flex items-center justify-center text-2xl shadow-lg">
              {family.icon}
            </div>
            <button
              onClick={() => head && onSelectWord(head.word)}
              className="mt-1.5 font-bold text-base text-slate-900 dark:text-slate-100 hover:text-[#1f5fbf] dark:hover:text-[#7fb0ff] transition"
              dir="ltr"
            >
              {family.head}
            </button>
            {mainFa(head.word) && <span className="text-xs text-[#5d6676] dark:text-[#a3adbd]">{mainFa(head.word)}</span>}
          </div>

          {/* خط عمودی از سر به پایین (به دسته‌ها) */}
          <div className="flex justify-center mb-0">
            <div className="w-px h-6 bg-[#1f5fbf]/40 dark:bg-[#7fb0ff]/40" />
          </div>

          {/* هر دسته (اسم/فعل/صفت) به‌صورت یک ردیف کامل */}
          <div className="space-y-4">
            {branches.map((branch, bi) => (
              <div key={`branch-${bi}`} className="flex flex-col items-center">
                {/* برچسب دسته */}
                <div className={`text-[11px] font-bold px-2.5 py-1 rounded-full bg-gradient-to-r ${branch.color} text-white shadow-xs mb-2 z-10`}>
                  {branch.label} ({branch.members.length})
                </div>

                {/* خط افقی اتصال — فقط اگر بیش از ۱ عضو باشد */}
                {branch.members.length > 1 && (
                  <div className="relative w-full h-4 mb-1">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] max-w-[600px] h-px bg-[#1f5fbf]/30 dark:bg-[#7fb0ff]/30" />
                    {/* خط عمودی کوتاه به هر کارت */}
                    {branch.members.map((_, mi) => (
                      <div
                        key={`vline-${mi}`}
                        className="absolute top-0 w-px h-3 bg-[#1f5fbf]/30 dark:bg-[#7fb0ff]/30"
                        style={{
                          left: `${(mi + 0.5) * (100 / branch.members.length)}%`
                        }}
                      />
                    ))}
                  </div>
                )}
                {branch.members.length === 1 && (
                  <div className="w-px h-3 bg-[#1f5fbf]/30 dark:bg-[#7fb0ff]/30 mb-1" />
                )}

                {/* اعضای این دسته — flex-wrap برای پویایی */}
                <div className="flex flex-wrap items-stretch justify-center gap-2 w-full">
                  {branch.members.map((member, mi) => {
                    const fa = mainFa(member.word);
                    return (
                      <button
                        key={`${member.word.id}-${mi}`}
                        onClick={() => onSelectWord(member.word)}
                        className="relative z-10 flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-xl bg-white dark:bg-[#1b2029] border-2 border-[#dde1ea] dark:border-[#333b4a] hover:border-[#1f5fbf] dark:hover:border-[#7fb0ff] hover:shadow-md transition shadow-xs min-w-[90px] max-w-[180px] flex-1"
                        title={member.word.fa || ''}
                      >
                        {/* دایرهٔ اتصال در بالای کارت */}
                        <span className={`absolute -top-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full ${branch.dotColor} ring-2 ring-white dark:ring-[#1b2029]`} />
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-100 text-center break-words leading-tight" dir="ltr">
                          {member.word.art ? `${member.word.art} ` : ''}{member.word.de}
                        </span>
                        {/* درخواست کاربر ۴: مهم‌ترین معنی زیر هر واژه */}
                        {fa && <span className="text-[10px] text-[#5d6676] dark:text-[#a3adbd] text-center leading-tight break-words">{fa}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* توضیح */}
          <div className="text-center text-xs text-[#5d6676] dark:text-[#a3adbd] mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
            💡 روی هر واژه بزن تا پروفایلش باز شود. خطوط، ارتباط اعضا با سرِ خانواده را نشان می‌دهند.
            <br />معنی زیر هر واژه، مهم‌ترین معناست؛ برای جزئیات بیشتر روی واژه بزن.
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
