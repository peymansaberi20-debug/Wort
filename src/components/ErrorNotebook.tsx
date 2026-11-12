import React, { useMemo, useState } from 'react';
import { ErrItem, dueErrors, getErrors, gradeError, normSentence, removeError } from '../utils/errorBook';

const card = 'bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 space-y-3';
const shuffle = <T,>(a: T[]): T[] => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

export const ErrorNotebook: React.FC<{ onShowToast: (m: string, e?: boolean) => void }> = ({ onShowToast }) => {
  const [version, setVersion] = useState(0);
  const [all, setAll] = useState(false);          // practise everything, not only due items
  const [queue, setQueue] = useState<string[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [auto, setAuto] = useState<boolean | null>(null);
  const [score, setScore] = useState({ ok: 0, bad: 0 });

  const items = useMemo(() => getErrors(), [version]);
  const due = useMemo(() => dueErrors(items), [items]);
  const mastered = items.filter(e => e.box >= 4).length;

  const start = (everything: boolean) => {
    const pool = everything ? items : due;
    setAll(everything); setQueue(shuffle(pool).map(e => e.id)); setIdx(0); setAnswer(''); setRevealed(false); setAuto(null); setScore({ ok: 0, bad: 0 });
  };
  const cur: ErrItem | undefined = queue ? items.find(e => e.id === queue[idx]) : undefined;

  const check = () => {
    if (!cur || !answer.trim()) return;
    const same = normSentence(answer) === normSentence(cur.corrected);
    setAuto(same ? true : null); setRevealed(true);
  };
  const next = (correct: boolean) => {
    if (!cur) return;
    gradeError(cur.id, correct);
    setScore(s => ({ ok: s.ok + (correct ? 1 : 0), bad: s.bad + (correct ? 0 : 1) }));
    setAnswer(''); setRevealed(false); setAuto(null); setIdx(i => i + 1); setVersion(v => v + 1);
  };
  const del = () => {
    if (!cur) return;
    removeError(cur.id); setVersion(v => v + 1); setAnswer(''); setRevealed(false); setAuto(null);
    setQueue(q => (q ? q.filter(id => id !== cur.id) : q));
    onShowToast('از دفتر خطاها حذف شد.');
  };

  // ---------- overview ----------
  if (!queue || (queue && idx >= queue.length && queue.length === 0)) {
    return (
      <div className="space-y-4 text-right max-w-3xl mx-auto">
        <div className={card}>
          <div className="font-extrabold text-sm">📓 دفتر خطاهای من</div>
          <p className="text-[12px] leading-6 text-[#5d6676] dark:text-[#a3adbd]">جمله‌هایی که در «تصحیح نوشتار» غلط نوشته‌ای خودکار اینجا جمع می‌شوند و با فاصله‌گذاری هوشمند دوباره از تو پرسیده می‌شوند، تا همان خطا تکرار نشود.</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 py-2.5"><div className="font-extrabold text-lg" dir="ltr">{items.length}</div><div className="text-[11px]">کل خطاها</div></div>
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 py-2.5"><div className="font-extrabold text-lg text-amber-700 dark:text-amber-300" dir="ltr">{due.length}</div><div className="text-[11px]">برای مرور امروز</div></div>
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 py-2.5"><div className="font-extrabold text-lg text-emerald-700 dark:text-emerald-300" dir="ltr">{mastered}</div><div className="text-[11px]">یاد گرفته‌شده</div></div>
          </div>
          {items.length === 0 ? (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-sm leading-7">هنوز خطایی ذخیره نشده است. در تمرین «📝 تصحیح نوشتار» یک متن بنویس؛ جمله‌های غلط خودکار به اینجا می‌آیند.</div>
          ) : (
            <div className="space-y-2">
              <button onClick={() => start(false)} disabled={!due.length} className="w-full h-12 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white font-bold text-sm disabled:opacity-40">
                {due.length ? `▶️ شروع مرور (${due.length} جمله)` : '🎉 امروز چیزی برای مرور نیست'}
              </button>
              <button onClick={() => start(true)} className="w-full h-11 rounded-xl border border-[#1f5fbf] text-[#1f5fbf] dark:text-blue-300 font-bold text-sm">🔁 تمرین آزاد روی همهٔ خطاها</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------- finished ----------
  if (idx >= queue.length) {
    return (
      <div className={card + ' text-center max-w-3xl mx-auto'}>
        <div className="text-4xl">🎉</div>
        <div className="font-extrabold">مرور تمام شد</div>
        <div className="text-sm">درست: <b className="text-emerald-600">{score.ok}</b> — غلط: <b className="text-rose-600">{score.bad}</b></div>
        <button onClick={() => { setQueue(null); setVersion(v => v + 1); }} className="px-5 h-11 rounded-xl bg-[#1f5fbf] text-white font-bold text-sm">بازگشت به دفتر</button>
      </div>
    );
  }
  if (!cur) { setIdx(i => i + 1); return null; }

  // ---------- question ----------
  return (
    <div className="space-y-3 text-right max-w-3xl mx-auto">
      <div className="flex items-center justify-between text-xs font-bold text-[#5d6676] dark:text-[#a3adbd]">
        <span>{idx + 1} / {queue.length}{all ? ' (تمرین آزاد)' : ''}</span>
        <button onClick={del} className="text-red-600">🗑 حذف از دفتر</button>
      </div>
      <div className={card}>
        <div className="text-xs font-extrabold text-rose-700 dark:text-rose-300">این جمله خطا دارد — شکل درستش را بنویس</div>
        <div dir="ltr" className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-base font-sans leading-8 text-rose-900 dark:text-rose-200">{cur.original}</div>
        <textarea dir="ltr" rows={3} value={answer} disabled={revealed} onChange={e => setAnswer(e.target.value)} placeholder="Schreibe den korrekten Satz …"
          className="w-full bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl p-3 text-sm font-sans leading-7 outline-none focus:border-[#1f5fbf]" />
        {!revealed && (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={check} disabled={!answer.trim()} className="h-11 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-sm disabled:opacity-40">بررسی</button>
            <button onClick={() => { setRevealed(true); setAuto(null); }} className="h-11 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-bold">نمایش پاسخ</button>
          </div>
        )}
        {revealed && (
          <div className="space-y-3">
            <div dir="ltr" className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-base font-sans font-bold leading-8 text-emerald-900 dark:text-emerald-200">{cur.corrected}</div>
            {(cur.type || cur.why) && <div className="text-sm leading-7 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">{cur.type && <b>{cur.type}: </b>}{cur.why}</div>}
            {auto === true ? (
              <>
                <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300">✅ دقیقاً درست نوشتی!</div>
                <button onClick={() => next(true)} className="w-full h-11 rounded-xl bg-emerald-600 text-white font-bold text-sm">بعدی ←</button>
              </>
            ) : (
              <>
                <div className="text-xs text-[#5d6676] dark:text-[#a3adbd]">پاسخ تو با پاسخ بالا فرق دارد. اگر جملهٔ تو هم از نظر معنا و گرامر درست بود، «درست بود» را بزن.</div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => next(true)} className="h-11 rounded-xl bg-emerald-600 text-white font-bold text-sm">✅ درست بود</button>
                  <button onClick={() => next(false)} className="h-11 rounded-xl bg-rose-600 text-white font-bold text-sm">❌ غلط بود</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
