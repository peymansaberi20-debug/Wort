import React, { useEffect, useState } from 'react';
import { PauseCircle, PlusCircle } from 'lucide-react';
import { speak } from '../utils/audio';
import { askJson, S } from '../utils/trainerKit';
import { describeAiError } from '../utils/aiProvider';
import type { Word } from '../types';

export const cleanToken = (t: string) => t.replace(/[.,!?;:"„“”()[\]—–\-«»]/g, '').trim();

/** Renders text as clickable words (one tap = lookup). */
export const ClickableText: React.FC<{ text: string; onWord: (w: string) => void; disabled?: boolean }> = ({ text, onWord, disabled }) => (
  <>
    {text.split('\n').map((para, pi) => (
      <p key={pi} className="mb-3 last:mb-0 leading-8">
        {para.split(/(\s+)/).map((tok, ti) => {
          if (/^\s+$/.test(tok) || disabled) return <span key={ti}>{tok}</span>;
          return (
            <span key={ti} onClick={() => { const w = cleanToken(tok); if (w.length >= 2) onWord(w); }}
              className="cursor-pointer rounded px-0.5 hover:bg-amber-200/80 dark:hover:bg-amber-700/50 transition">{tok}</span>
          );
        })}
      </p>
    ))}
  </>
);

const infoCheck = S.obj({ lemma: S.req, art: S.str(), fa: S.req, ex: S.str() });

interface Props {
  word: string;
  level: string;
  cat: string;
  /** shows the "timer paused" notice (the parent pauses/resumes its own timer) */
  paused?: boolean;
  onQuickAddWord?: (w: Partial<Word>) => boolean;
  onClose: () => void;
}

export const WordLookupModal: React.FC<Props> = ({ word, level, cat, paused, onQuickAddWord, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ de: word, art: '', fa: '', ex: '' });

  useEffect(() => {
    let live = true;
    setLoading(true); setErr('');
    askJson<{ lemma: string; art: string; fa: string; ex: string }>(
      `German word "${word}" as it appears in a text (CEFR ${level}). Return ONLY JSON: {"lemma":"dictionary form (nouns without article, verbs infinitive, lowercase unless noun)","art":"der|die|das or empty","fa":"short natural Persian meaning","ex":"one short German example sentence"}`,
      infoCheck, { timeoutMs: 15000, retries: 0, cacheKey: 'wl:' + word.toLowerCase() }
    ).then(r => {
      if (!live) return;
      setF({ de: r.lemma, art: ['der', 'die', 'das'].includes(r.art) ? r.art : '', fa: r.fa, ex: r.ex });
    }).catch(e => { if (live) setErr(describeAiError(e)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [word]);

  const save = () => {
    if (onQuickAddWord?.({ de: f.de.trim(), art: f.art, fa: f.fa.trim(), ex: f.ex.trim(), cat, lvl: level })) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-5 space-y-4 shadow-xl text-right" dir="rtl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <span className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
            {paused && <><PauseCircle size={14} /> زمان آزمون متوقف شد</>}
          </span>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-bold">✕</button>
        </div>

        {!adding ? (
          <div className="text-center space-y-2 py-2">
            <div className="flex items-center justify-center gap-2" dir="ltr">
              <span className="text-2xl font-extrabold font-sans">{word}</span>
              <button onClick={() => speak(word)} className="w-8 h-8 rounded-full bg-blue-50 dark:bg-slate-800 text-sm">🔊</button>
            </div>
            <div className="text-sm font-semibold text-[#1f5fbf] dark:text-[#7fb0ff]">
              {loading ? 'در حال دریافت معنی...' : err ? err : `${f.art ? f.art + ' ' : ''}${f.de} — ${f.fa}`}
            </div>
            {!loading && !err && f.ex && <div dir="ltr" className="text-xs text-slate-500 font-sans">{f.ex}</div>}
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="flex gap-2" dir="ltr">
              <select value={f.art} onChange={e => setF({ ...f, art: e.target.value })} className="border rounded-xl px-2 bg-slate-50 dark:bg-[#141923]">
                <option value="">—</option><option>der</option><option>die</option><option>das</option>
              </select>
              <input value={f.de} onChange={e => setF({ ...f, de: e.target.value })} className="flex-1 border rounded-xl px-3 py-2 font-sans bg-slate-50 dark:bg-[#141923]" />
            </div>
            <input value={f.fa} onChange={e => setF({ ...f, fa: e.target.value })} placeholder="معنی فارسی" className="w-full border rounded-xl px-3 py-2 text-sm bg-slate-50 dark:bg-[#141923]" />
            <input dir="ltr" value={f.ex} onChange={e => setF({ ...f, ex: e.target.value })} placeholder="Beispielsatz (optional)" className="w-full border rounded-xl px-3 py-2 text-sm font-sans bg-slate-50 dark:bg-[#141923]" />
          </div>
        )}

        <div className="flex gap-2">
          {onQuickAddWord && (adding ? (
            <button onClick={save} disabled={!f.de.trim() || !f.fa.trim()} className="flex-1 bg-[#1f5fbf] disabled:opacity-40 text-white py-2.5 rounded-xl text-xs font-bold">ذخیره در کتابخانه</button>
          ) : (
            <button onClick={() => setAdding(true)} disabled={loading} className="flex-1 bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] disabled:opacity-50 text-white py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5">
              <PlusCircle size={15} /> افزودن به واژه‌نامه
            </button>
          ))}
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">{paused ? 'ادامه آزمون' : 'بستن'}</button>
        </div>
      </div>
    </div>
  );
};
