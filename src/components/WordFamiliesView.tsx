/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * WordFamiliesView.tsx — تب خانواده واژگان (پنجره ثابت و درون‌صفحه‌ای بدون حذف قابلیت‌ها)
 */
import React, { useState, useMemo } from 'react';
import { Word } from '../types';
import { buildWordFamilies, WordFamily, FamilyMember } from '../utils/wordFamily';

interface Props {
  words: Word[];
  onSelectWord: (w: Word) => void;
  onAddWord?: (de: string, art?: string, fa?: string, pos?: string) => void;
  openFamilyId?: string | null;
  onOpenFamilyChange?: (id: string | null) => void;
}

export const WordFamiliesView: React.FC<Props> = ({ words, onSelectWord, onAddWord, openFamilyId, onOpenFamilyChange }) => {
  const [query, setQuery] = useState('');
  const [internalFamilyId, setInternalFamilyId] = useState<string | null>(null);
  const families = useMemo(() => buildWordFamilies(words), [words]);

  const isControlled = typeof onOpenFamilyChange === 'function';
  const selectedFamilyId = isControlled ? (openFamilyId ?? null) : internalFamilyId;
  const setSelectedFamilyId = (id: string | null) => {
    if (isControlled) onOpenFamilyChange?.(id);
    else setInternalFamilyId(id);
  };
  const selectedFamily = useMemo(
    () => (selectedFamilyId ? families.find(f => f.id === selectedFamilyId) || null : null),
    [families, selectedFamilyId]
  );

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
    <div className="space-y-4 text-right">
      {/* جست‌وجو */}
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="جست‌وجو در خانواده‌ها (سر یا اعضا)…"
        className="w-full px-3.5 py-2.5 rounded-xl border border-[#dde1ea] dark:border-[#333b4a] bg-white dark:bg-[#141923] text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#4385e8]"
      />

      {/* شمارش */}
      <div className="text-sm text-[#5d6676] dark:text-[#a3adbd] flex items-center gap-1.5">
        <span>🌐</span>
        <span>{filtered.length} خانواده واژگانی (از مجموع {families.length}) — روی هر سرشاخه بزن تا درختش را ببینی</span>
      </div>

      {/* اگر خانواده‌ای انتخاب شده باشد، پنجره ثابت درخت خانواده بالاتر از لیست یا جایگزین لیست نمایش داده می‌شود */}
      {selectedFamily ? (
        <FamilyTreeFixedPanel
          family={selectedFamily}
          onClose={() => setSelectedFamilyId(null)}
          onSelectWord={onSelectWord}
          onAddWord={onAddWord}
          selectedFamilyId={selectedFamilyId}
        />
      ) : (
        /* لیست سرشاخه‌ها */
        filtered.length === 0 ? (
          <div className="p-6 rounded-xl bg-slate-50 dark:bg-[#141923] text-center text-base text-[#5d6676] dark:text-[#a3adbd]">
            {families.length === 0
              ? 'هنوز خانواده‌ای ثبت نشده. در پروفایل هر واژه، در فیلد «یادداشت» خطی به شکل «خانواده واژگانی: اسم: ... | فعل مرتبط: ... | صفت: ...» اضافه کن تا اینجا نمایش داده شود.'
              : 'خانواده‌ای با این جست‌وجو پیدا نشد.'}
          </div>
        ) : (
          <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map(f => (
              <button
                key={f.id}
                onClick={() => setSelectedFamilyId(f.id)}
                className="w-full px-3 py-3 flex items-center justify-between gap-2 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition text-right"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="min-w-0">
                    <b className="text-base text-slate-900 dark:text-slate-100 block truncate" dir="ltr">{f.head}</b>
                    {f.headFa && <span className="text-sm text-[#5d6676] dark:text-[#a3adbd] truncate block">{f.headFa}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {!f.headExists && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" title="سرشاخه در واژگان نیست">⚠️</span>
                  )}
                  {f.level && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{f.level}</span>}
                  <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-[#1f5fbf]/10 text-[#1f5fbf] dark:bg-[#7fb0ff]/10 dark:text-[#7fb0ff]">{f.count} عضو</span>
                  <span className="text-slate-400 text-sm">‹</span>
                </div>
              </button>
            ))}
          </div>
        )
      )}
    </div>
  );
};

/* ───────────── پنل ثابت (غیر پاپ‌آپ) درخت خانواده ───────────── */
const FamilyTreeFixedPanel: React.FC<{
  family: WordFamily;
  onClose: () => void;
  onSelectWord: (w: Word) => void;
  onAddWord?: (de: string, art?: string, fa?: string, pos?: string) => void;
  selectedFamilyId: string | null;
}> = ({ family, onClose, onSelectWord, onAddWord, selectedFamilyId }) => {
  const [addPrompt, setAddPrompt] = useState<{ de: string; art: string; fa: string; pos: string } | null>(null);

  const head = family.members.find(m => m.role === 'head');
  const nouns = family.members.filter(m => m.role === 'noun');
  const verbs = family.members.filter(m => m.role === 'verb');
  const adjs = family.members.filter(m => m.role === 'adj');

  const branches = [
    { members: nouns, label: 'اسم (Nomen)', color: 'from-blue-500 to-indigo-500', dotColor: 'bg-blue-500' },
    { members: verbs, label: 'فعل (Verben)', color: 'from-emerald-500 to-teal-500', dotColor: 'bg-emerald-500' },
    { members: adjs, label: 'صفت (Adjektive)', color: 'from-amber-500 to-orange-500', dotColor: 'bg-amber-500' }
  ].filter(b => b.members.length > 0);

  const mainFa = (m: FamilyMember): string => {
    const fa = (m.fa || '').trim();
    if (!fa) return '';
    const parts = fa.split(/[،,؛;\/|،]\s*|\s+یا\s+/).map(s => s.trim()).filter(s => s.length > 1);
    return parts.length > 0 ? parts[0] : fa;
  };

  const formatWord = (m: FamilyMember): string => {
    const de = m.word.de || '';
    const art = m.word.art || '';
    if (art && de.toLowerCase().startsWith(art.toLowerCase() + ' ')) {
      return de;
    }
    return art ? `${art} ${de}` : de;
  };

  const wordFontSize = (m: FamilyMember): string => {
    const display = formatWord(m);
    if (display.length > 22) return 'text-sm';
    if (display.length > 14) return 'text-base';
    return 'text-base md:text-lg';
  };

  const handleMemberClick = (m: FamilyMember) => {
    if (m.isGhost) {
      setAddPrompt({ de: m.word.de, art: m.word.art || '', fa: m.fa, pos: m.word.pos || '' });
    } else {
      if (selectedFamilyId) {
        localStorage.setItem('active_family_card', selectedFamilyId);
      }
      onSelectWord(m.word);
    }
  };

  const confirmAddWord = () => {
    if (!addPrompt) return;
    if (selectedFamilyId) {
      localStorage.setItem('active_family_card', selectedFamilyId);
    }
    onAddWord?.(addPrompt.de, addPrompt.art, addPrompt.fa, addPrompt.pos);
    setAddPrompt(null);
    onClose();
  };

  const totalMembers = branches.reduce((s, b) => s + b.members.length, 0);
  if (totalMembers === 0 || !head) {
    return (
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-6 text-center relative shadow-sm" dir="rtl">
        <button onClick={onClose} className="text-red-500 text-sm font-bold px-3 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 mb-4 inline-block">← بازگشت به لیست خانواده‌ها</button>
        <b className="text-lg block" dir="ltr">{family.head}</b>
        <p className="text-sm text-[#5d6676] mt-2">این خانواده فقط شامل سر است.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl w-full shadow-sm overflow-hidden" dir="rtl">
      {/* هدر پنل ثابت */}
      <div dir="ltr" className="bg-slate-50 dark:bg-[#141923] px-4 py-3 border-b border-[#dde1ea] dark:border-[#333b4a] flex items-center justify-between gap-2">
        <button onClick={onClose} className="text-red-500 text-sm font-bold px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition">
          ← بازگشت به لیست
        </button>
        <h3 className="flex-1 text-right font-bold text-base md:text-lg text-slate-900 dark:text-slate-100">
          🌳 درخت خانوادهٔ واژگانی
        </h3>
      </div>

      {/* بدنهٔ درخت */}
      <div className="p-4 md:p-6">
        <div className="flex flex-col items-center mb-3">
          <b className="text-xs text-[#5d6676] dark:text-[#a3adbd] block mb-1">سرِ خانواده (Stamm) — فعل مصدر ساده</b>
          <button
            onClick={() => handleMemberClick(head)}
            className="font-bold text-lg md:text-xl text-slate-900 dark:text-slate-100 hover:text-[#1f5fbf] dark:hover:text-[#7fb0ff] transition text-center"
            dir="ltr"
            title={head.isGhost ? 'در واژگان نیست — کلیک کن تا اضافه شود' : (head.word.fa || '')}
          >
            {family.head}
          </button>
          {mainFa(head) && <span className="text-sm text-[#5d6676] dark:text-[#a3adbd]">{mainFa(head)}</span>}
        </div>

        <div className="flex justify-center mb-0">
          <div className="w-px h-6 bg-[#1f5fbf]/40 dark:bg-[#7fb0ff]/40" />
        </div>

        <div className="space-y-4">
          {branches.map((branch, bi) => (
            <div key={`branch-${bi}`} className="flex flex-col items-center">
              <div className={`text-xs font-bold px-2.5 py-1 rounded-full bg-gradient-to-r ${branch.color} text-white shadow-xs mb-2 z-10`}>
                {branch.label} ({branch.members.length})
              </div>

              {branch.members.length > 1 && (
                <div className="relative w-full h-4 mb-1">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] max-w-[600px] h-px bg-[#1f5fbf]/30 dark:bg-[#7fb0ff]/30" />
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

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 w-full">
                {branch.members.map((member, mi) => {
                  const fa = mainFa(member);
                  const fontSize = wordFontSize(member);
                  return (
                    <button
                      key={`${member.word.id}-${mi}`}
                      onClick={() => handleMemberClick(member)}
                      className={`relative z-10 flex flex-col items-center justify-center gap-0.5 px-2 py-2.5 rounded-xl bg-white dark:bg-[#1b2029] border-2 transition shadow-xs min-w-0 overflow-hidden ${
                        member.isGhost
                          ? 'border-amber-200 dark:border-amber-800 hover:border-amber-400 dark:hover:border-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                          : 'border-[#dde1ea] dark:border-[#333b4a] hover:border-[#1f5fbf] dark:hover:border-[#7fb0ff] hover:shadow-md'
                      }`}
                      title={member.isGhost ? 'در واژگان نیست — کلیک کن تا اضافه‌اش کنی' : (member.word.fa || '')}
                    >
                      <span className={`absolute -top-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full ${branch.dotColor} ring-2 ring-white dark:ring-[#1b2029]`} />
                      <span
                        className={`${fontSize} font-bold text-slate-900 dark:text-slate-100 text-center break-words leading-tight w-full`}
                        dir="ltr"
                        style={{ hyphens: 'auto', WebkitHyphens: 'auto', wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                      >
                        {formatWord(member)}
                      </span>
                      {fa && <span className="text-xs text-[#5d6676] dark:text-[#a3adbd] text-center leading-tight break-words w-full">{fa}</span>}
                      {member.isGhost && (
                        <span className="mt-0.5 text-[9px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                          + افزودن به واژگان
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="text-center text-xs text-[#5d6676] dark:text-[#a3adbd] mt-6 pt-3 border-t border-slate-100 dark:border-slate-800">
          💡 روی هر واژهٔ موجود بزن تا پروفایلش باز شود. کلمه‌های نارنجی «+ افزودن» در واژگان نیستند.
        </div>
      </div>

      {/* پنجرهٔ تأیید افزودن واژه (Ghost) */}
      {addPrompt && (
        <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setAddPrompt(null); }}>
          <div className="bg-white dark:bg-[#1b2029] rounded-3xl p-5 max-w-md w-full shadow-2xl space-y-4" dir="rtl">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100">⚠️ واژه در واژگان نیست</h3>
              <button onClick={() => setAddPrompt(null)} className="text-red-500 text-sm font-bold px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30">✕</button>
            </div>
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-center">
              <b className="text-lg font-bold text-slate-900 dark:text-slate-100" dir="ltr">
                {addPrompt.art ? `${addPrompt.art} ` : ''}{addPrompt.de}
              </b>
              {addPrompt.fa && <p className="text-sm text-[#5d6676] dark:text-[#a3adbd] mt-1">{addPrompt.fa}</p>}
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-200 leading-7">
              این واژه در واژگان شما وجود ندارد. می‌خواهی اضافه‌اش کنی؟
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setAddPrompt(null)} className="h-11 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-bold">بعداً</button>
              <button onClick={confirmAddWord} className="h-11 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white text-sm font-bold shadow-xs">
                ✚ افزودن به واژگان
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
