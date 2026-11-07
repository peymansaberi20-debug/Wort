import React, { useState } from 'react';
import { Word } from '../types';
import { AIP, generateWithGemini, parseAI, aiToIMP } from '../utils/ai';
import { findDuplicateWord } from '../utils/duplicates';
import { IconBtn } from './IconBtn';

interface WordCompareModalProps {
  open: boolean;
  onClose: () => void;
  words: Word[];
  onSaveWord: (wordData: Partial<Word>, isEdit: boolean) => void;
  onSelectWord: (word: Word) => void;
  onShowToast: (msg: string, isErr?: boolean) => void;
}

interface CompareRow {
  word: string;
  fa: string;
  usage_fa: string;
  register_fa: string;
  grammar_fa: string;
  example_de: string;
  example_fa: string;
  diff_fa: string;
}

const FENCE = '```';

export const WordCompareModal: React.FC<WordCompareModalProps> = ({
  open, onClose, words, onSaveWord, onSelectWord, onShowToast
}) => {
  const [fields, setFields] = useState<string[]>(['', '', '', '']);
  const [rows, setRows] = useState<CompareRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [addingIdx, setAddingIdx] = useState<number | null>(null);

  // kept mounted (hidden) so results survive closing/reopening and profile visits
  const shown = open
    ? 'fixed inset-0 z-40 bg-black/60 backdrop-blur-xs flex items-start sm:items-center justify-center p-3 md:p-6 overflow-y-auto'
    : 'hidden';

  const setField = (i: number, v: string) => setFields(prev => prev.map((x, j) => (j === i ? v : x)));
  const targets = fields.map(f => f.trim()).filter(Boolean);

  const inLibrary = (w: string): Word | null => findDuplicateWord(w, '', words);

  const runCompare = async () => {
    const list = targets;
    if (list.length < 2 || loading) return;
    setLoading(true); setErrMsg(''); setRows(null);
    const targetBlock = list.map((w, i) => `${i + 1}. "${w}"`).join('\n');
    const prompt = `You are an expert German lexicographer helping a Persian-speaking learner compare similar German words or expressions.

TARGETS (compare ALL of them with each other):
 ${targetBlock}

For EACH target produce exactly one object with exactly these fields, in this order:
- "word": the target exactly as given above
- "fa": precise, natural Persian meaning(s) — most common everyday meaning first
- "usage_fa": typical usage contexts and real-life situations, in Persian (when Germans actually use it)
- "register_fa": tone/register in Persian (رسمی، دوستانه، محترمانه، بی‌ادبانه، عامیانه، کتابی ...) plus regional notes if relevant
- "grammar_fa": key grammar facts in Persian — reflexive or not, separable prefix, required preposition + case (Akkusativ/Dativ/Genitiv), fixed patterns; for structures like "enttäuscht sein" explain the whole pattern
- "example_de": ONE natural everyday German example sentence (A1–B1)
- "example_fa": Persian translation of that example
- "diff_fa": in Persian, the KEY differences between this word and the OTHER target words of this set — meaning nuances, register, which is more common, when to prefer which. Concrete and brief.

RULES
- Exactly one object per target, in the same order as TARGETS. No extra objects.
- All explanations in natural Persian; German words and examples stay German.
- Only standard verified usage; do not invent meanings.
- Return exactly one JSON array wrapped in a single json Markdown code block (${FENCE}json ... ${FENCE}), nothing else.`;
    try {
      const out = await generateWithGemini(prompt, { timeoutMs: 60000, retries: 1 });
      const parsed = parseAI(out) as CompareRow[];
      if (!Array.isArray(parsed) || parsed.length < list.length) {
        throw new Error('پاسخ ناقص بود؛ دوباره «مقایسه» را بزن.');
      }
      setRows(list.map((w, i) => ({ ...(parsed[i] || {}), word: w } as CompareRow)));
    } catch (e: any) {
      setErrMsg(e?.message || 'مقایسه ممکن نشد؛ اتصال و کلید را بررسی کن.');
    } finally {
      setLoading(false);
    }
  };

  const addWithAi = async (idx: number) => {
    const w = rows?.[idx]?.word || targets[idx];
    if (!w || addingIdx !== null) return;
    setAddingIdx(idx); setErrMsg('');
    try {
      const out = await generateWithGemini(AIP(w, words), { timeoutMs: 45000, retries: 1 });
      const { ws, errs } = aiToIMP(parseAI(out), words);
      if (ws.length === 0) throw new Error(errs[0] || 'تکمیل ناموفق بود.');
      // App saves the word and automatically opens its profile; closing the profile returns here
      onSaveWord(ws[0], false);
    } catch (e: any) {
      setErrMsg(e?.message || 'افزودن با هوش مصنوعی ناموفق بود.');
    } finally {
      setAddingIdx(null);
    }
  };

  const n = rows ? rows.length : 0;
  const gridCls = n === 3 ? 'sm:grid-cols-3' : n === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2';

  const section = (title: string, render: (r: CompareRow, i: number) => React.ReactNode) => (
    <div className="space-y-1.5">
      <div className="text-sm font-extrabold text-[#1f5fbf] dark:text-[#7fb0ff]">{title}</div>
      <div className={`grid grid-cols-1 gap-2 ${gridCls}`}>
        {(rows || []).map((r, i) => (
          <div key={i} className="p-2.5 rounded-xl bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] space-y-1">
            <div dir="ltr" className="text-[11px] font-bold text-slate-500 dark:text-slate-400 font-sans truncate">{r.word}</div>
            <div className="text-sm leading-7 text-slate-800 dark:text-slate-100">{render(r, i)}</div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div
      className={shown}
      onClick={e => { if (open && e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col" dir="rtl">
        {/* Header — standardized icon strip, close leftmost */}
        <div dir="ltr" className="sticky top-0 z-10 bg-white/95 dark:bg-[#1b2029]/95 backdrop-blur-md px-4 py-3 border-b border-[#dde1ea] dark:border-[#333b4a] flex items-center gap-2">
          <IconBtn onClick={onClose} title="بستن مقایسه">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="w-4 h-4" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </IconBtn>
          <h3 className="flex-1 text-right font-bold text-base md:text-lg text-slate-900 dark:text-slate-100">⚖️ مقایسه واژه‌ها (۲ تا ۴ واژه)</h3>
        </div>

        <div className="p-4 md:p-5 space-y-4">
          {/* Input area */}
          <div className="bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 space-y-3">
            <label className="block text-sm font-extrabold text-[#1f5fbf] dark:text-[#7fb0ff]">
              واژه‌های آلمانی برای مقایسه (دست‌کم ۲، حداکثر ۴):
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {fields.map((f, i) => (
                <input
                  key={i}
                  type="text"
                  dir="ltr"
                  value={f}
                  onChange={e => setField(i, e.target.value)}
                  placeholder={`واژه ${i + 1}`}
                  className="min-w-0 bg-white dark:bg-[#141923] border-2 border-[#1f5fbf] dark:border-[#7fb0ff] rounded-xl px-3 py-2.5 font-sans font-bold text-sm md:text-base outline-none"
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => void runCompare()}
              disabled={loading || targets.length < 2}
              className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-xs hover:opacity-95 disabled:opacity-40 transition flex items-center gap-2"
            >
              {loading ? (
                <><span className="inline-block animate-spin">⏳</span><span>در حال مقایسه با هوش مصنوعی…</span></>
              ) : (
                <span>⚖️ مقایسه کن</span>
              )}
            </button>
            <p className="text-[11px] text-[#5d6676] dark:text-[#a3adbd]">
              مثال: sich entschließen / sich entscheiden / beschließen — یا: enttäuscht sein / verzweifelt sein
            </p>
          </div>

          {errMsg && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
              {errMsg}
            </div>
          )}

          {rows && (
            <div className="space-y-4">
              {section('🇮🇷 ترجمه', r => (r.fa || '—'))}
              {section('📍 کاربرد و موقعیت استفاده', r => (r.usage_fa || '—'))}
              {section('🎭 لحن و نوع واژه', r => (r.register_fa || '—'))}
              {section('🧩 نکات گرامری', r => (r.grammar_fa || '—'))}
              {section('⚔️ تفاوت‌های کلیدی با واژه‌های دیگر', r => (r.diff_fa || '—'))}
              {section('💬 مثال', r => (
                <div className="space-y-1">
                  <div dir="ltr" className="font-sans font-bold text-slate-900 dark:text-slate-100">{r.example_de || '—'}</div>
                  {r.example_fa && <div className="text-xs text-[#5d6676] dark:text-[#a3adbd]">{r.example_fa}</div>}
                </div>
              ))}

              {/* Library status + actions */}
              <div className="space-y-1.5">
                <div className="text-sm font-extrabold text-[#1f5fbf] dark:text-[#7fb0ff]">📚 وضعیت در کتابخانه</div>
                <div className={`grid grid-cols-1 gap-2 ${gridCls}`}>
                  {rows.map((r, i) => {
                    const found = inLibrary(r.word);
                    return (
                      <div key={i} className="p-2.5 rounded-xl bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] space-y-2">
                        <div dir="ltr" className="text-[11px] font-bold text-slate-500 dark:text-slate-400 font-sans truncate">{r.word}</div>
                        {found ? (
                          <button
                            type="button"
                            onClick={() => onSelectWord(found)}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl text-xs font-bold transition"
                          >
                            ✅ موجود در کتابخانه — مشاهده پروفایل
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void addWithAi(i)}
                            disabled={addingIdx !== null}
                            className="w-full bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-xl text-xs font-bold transition disabled:opacity-40 flex items-center justify-center gap-1.5"
                          >
                            {addingIdx === i ? (
                              <><span className="inline-block animate-spin">⏳</span><span>در حال تکمیل و افزودن…</span></>
                            ) : (
                              <span>➕ افزودن با تکمیل هوش مصنوعی</span>
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-[#5d6676] dark:text-[#a3adbd]">
                  پس از بستن پروفایل واژه، به همین جدول با همین نتایج برمی‌گردی.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WordCompareModal;
