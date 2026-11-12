import React, { useMemo, useState } from 'react';
import { Word } from '../types';
import { speak } from '../utils/audio';

interface Item { de: string; fa: string }
interface DrillProps { words: Word[]; onShowToast: (m: string, e?: boolean) => void }

const card = 'bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 space-y-3';
const shuffle = <T,>(a: T[]): T[] => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const clean = (t: string) => t.replace(/^[„"“'(]+|[.,!?;:"“”')]+$/g, '');

/** Example sentences of the user's own vocabulary (4–14 words). */
const collect = (words: Word[], min = 4, max = 14): Item[] => {
  const out: Item[] = []; const seen = new Set<string>();
  for (const w of words) {
    for (const [de, fa] of [[w.ex, w.exFa], [w.ex2, w.ex2Fa]] as [string, string][]) {
      const s = (de || '').trim(); const n = s.split(/\s+/).length;
      if (n >= min && n <= max && !seen.has(s)) { seen.add(s); out.push({ de: s, fa: (fa || '').trim() }); }
    }
  }
  return out;
};

const Done: React.FC<{ score: number; total: number; onAgain: () => void }> = ({ score, total, onAgain }) => (
  <div className={card + ' text-center'}>
    <div className="text-5xl">{score / total >= 0.8 ? '🏆' : score / total >= 0.5 ? '👍' : '💪'}</div>
    <div className="font-extrabold text-lg" dir="ltr">{score} / {total}</div>
    <button onClick={onAgain} className="w-full h-12 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white font-bold text-sm">🔄 یک دور دیگر</button>
  </div>
);

const Empty: React.FC = () => (
  <div className={card + ' text-sm leading-7 text-center'}>برای این تمرین به جمله‌های مثال نیاز است. در واژگانت چند واژه با «مثال» (ex) داشته باش، یا واژه‌ها را با پرامپت کامل اضافه کن.</div>
);

// ---------------------------------------------------------------- Satzbau puzzle
export const SatzPuzzle: React.FC<DrillProps> = ({ words, onShowToast }) => {
  const pool = useMemo(() => collect(words), [words]);
  const make = () => shuffle(pool).slice(0, 10);
  const [queue, setQueue] = useState<Item[]>(make);
  const [idx, setIdx] = useState(0);
  const split = (s: string) => s.split(/\s+/);
  const scramble = (s: string) => { const t = split(s); let b = shuffle(t); for (let k = 0; k < 6 && b.join(' ') === t.join(' '); k++) b = shuffle(t); return b.map((text, id) => ({ id, text })); };
  const [bank, setBank] = useState(() => (queue[0] ? scramble(queue[0].de) : []));
  const [ans, setAns] = useState<{ id: number; text: string }[]>([]);
  const [res, setRes] = useState<null | boolean>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  if (pool.length < 3) return <Empty />;
  const cur = queue[idx];
  const goto = (q: Item[], i: number) => { setIdx(i); setBank(scramble(q[i].de)); setAns([]); setRes(null); };
  const restart = () => { const q = make(); setQueue(q); setScore(0); setDone(false); goto(q, 0); };
  const next = () => { if (idx + 1 >= queue.length) setDone(true); else goto(queue, idx + 1); };
  const pick = (t: { id: number; text: string }) => { if (res !== null) return; setBank(b => b.filter(x => x.id !== t.id)); setAns(a => [...a, t]); };
  const back = (t: { id: number; text: string }) => { if (res !== null) return; setAns(a => a.filter(x => x.id !== t.id)); setBank(b => [...b, t]); };
  const check = () => { const ok = ans.map(t => t.text).join(' ') === split(cur.de).join(' '); setRes(ok); if (ok) setScore(s => s + 1); };
  const say = () => speak(cur.de, { onErr: m => onShowToast(m, true) });

  if (done) return <Done score={score} total={queue.length} onAgain={restart} />;
  return (
    <div className="space-y-3 text-right max-w-xl mx-auto">
      <div className="flex justify-between text-xs font-bold text-[#5d6676] dark:text-[#a3adbd]"><span>جمله {idx + 1} از {queue.length}</span><span>امتیاز: {score}</span></div>
      <div className={card}>
        <div className="text-xs font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">🧩 کلمه‌ها را به ترتیب درست آلمانی بچین</div>
        {cur.fa && <div className="text-base font-bold leading-8">{cur.fa}</div>}
        <div dir="ltr" className="min-h-[64px] p-2 rounded-xl border-2 border-dashed border-[#1f5fbf]/50 flex flex-wrap gap-2 items-start">
          {ans.length === 0 && <span className="text-xs text-slate-400 p-1">کلمه‌ها را اینجا بگذار…</span>}
          {ans.map(t => <button key={t.id} onClick={() => back(t)} className="px-3 py-2 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-900 dark:text-blue-200 font-bold text-base font-sans">{t.text}</button>)}
        </div>
        <div dir="ltr" className="flex flex-wrap gap-2">
          {bank.map(t => <button key={t.id} onClick={() => pick(t)} className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 font-bold text-base font-sans active:scale-95">{t.text}</button>)}
        </div>
        {res === null ? (
          <button onClick={check} disabled={bank.length > 0} className="w-full h-12 rounded-xl bg-emerald-600 text-white font-bold text-sm disabled:opacity-40">✅ بررسی</button>
        ) : (
          <div className="space-y-2">
            <div className={`p-3 rounded-xl text-sm font-bold ${res ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200' : 'bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200'}`}>{res ? '✅ درست!' : '❌ ترتیب درست:'}</div>
            <div dir="ltr" className="font-sans font-bold text-base leading-8">{cur.de}</div>
            <div className="flex gap-2">
              <button onClick={say} className="px-4 h-11 rounded-xl bg-rose-600 text-white text-sm font-bold">🔊</button>
              {!res && <button onClick={() => { setScore(s => s + 1); setRes(true); }} className="px-3 h-11 rounded-xl border border-slate-300 dark:border-slate-600 text-xs font-bold">ترتیب من هم درست است</button>}
              <button onClick={next} className="flex-1 h-11 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white font-bold text-sm">{idx + 1 >= queue.length ? 'پایان' : 'بعدی ←'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- Diktat
type Cell = { t: string; ok: boolean };
const diff = (orig: string, typed: string): { cells: Cell[]; extra: string[]; pct: number } => {
  const a = orig.split(/\s+/).filter(Boolean); const b = typed.split(/\s+/).filter(Boolean);
  const A = a.map(clean); const B = b.map(clean);
  const L: number[][] = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const cells: Cell[] = []; const usedB = new Set<number>(); let i = 0, j = 0;
  while (i < A.length) {
    if (j < B.length && A[i] === B[j]) { cells.push({ t: a[i], ok: true }); usedB.add(j); i++; j++; }
    else if (j < B.length && L[i][j + 1] >= L[i + 1][j]) j++;
    else { cells.push({ t: a[i], ok: false }); i++; }
  }
  const extra = b.filter((_, k) => !usedB.has(k));
  return { cells, extra, pct: A.length ? Math.round((cells.filter(c => c.ok).length / A.length) * 100) : 0 };
};

export const Diktat: React.FC<DrillProps> = ({ words, onShowToast }) => {
  const pool = useMemo(() => collect(words, 3, 12), [words]);
  const make = () => shuffle(pool).slice(0, 8);
  const [queue, setQueue] = useState<Item[]>(make);
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState('');
  const [slow, setSlow] = useState(false);
  const [res, setRes] = useState<null | ReturnType<typeof diff>>(null);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(false);

  if (pool.length < 3) return <Empty />;
  const cur = queue[idx];
  const play = (forceSlow?: boolean) => speak(cur.de, { rate: (forceSlow ?? slow) ? 0.7 : 1, onErr: m => onShowToast(m, true) });
  const check = () => { const r = diff(cur.de, text); setRes(r); setTotal(t => t + r.pct); };
  const next = () => { if (idx + 1 >= queue.length) setDone(true); else { setIdx(idx + 1); setText(''); setRes(null); } };
  const restart = () => { setQueue(make()); setIdx(0); setText(''); setRes(null); setTotal(0); setDone(false); };

  if (done) return <Done score={Math.round(total / queue.length)} total={100} onAgain={restart} />;
  return (
    <div className="space-y-3 text-right max-w-xl mx-auto">
      <div className="flex justify-between text-xs font-bold text-[#5d6676] dark:text-[#a3adbd]"><span>جمله {idx + 1} از {queue.length}</span><span>میانگین دقت: {idx + (res ? 1 : 0) ? Math.round(total / (idx + (res ? 1 : 0))) : 0}٪</span></div>
      <div className={card}>
        <div className="text-xs font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">🎧 جمله را بشنو و دقیقاً بنویس (با حروف بزرگ اسم‌ها و نشانه‌گذاری)</div>
        <div className="flex gap-2">
          <button onClick={() => play()} className="flex-1 h-14 rounded-xl bg-rose-600 text-white font-bold text-base">🔊 پخش</button>
          <button onClick={() => { setSlow(true); play(true); }} className="px-4 h-14 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-bold">🐢 آهسته</button>
        </div>
        <textarea dir="ltr" value={text} onChange={e => setText(e.target.value)} disabled={res !== null} rows={3} placeholder="Schreibe, was du hörst …"
          className="w-full bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl p-3 text-base font-sans leading-8 outline-none focus:border-[#1f5fbf]" />
        {res === null ? (
          <button onClick={check} disabled={!text.trim()} className="w-full h-12 rounded-xl bg-emerald-600 text-white font-bold text-sm disabled:opacity-40">✅ بررسی</button>
        ) : (
          <div className="space-y-2">
            <div className="font-extrabold text-sm">دقت: <span className={res.pct >= 80 ? 'text-emerald-600' : res.pct >= 50 ? 'text-amber-600' : 'text-rose-600'} dir="ltr">{res.pct}%</span></div>
            <div dir="ltr" className="font-sans text-base leading-9 flex flex-wrap gap-x-1.5">
              {res.cells.map((c, i) => <span key={i} className={c.ok ? 'text-emerald-700 dark:text-emerald-300 font-bold' : 'text-rose-600 dark:text-rose-400 font-bold underline decoration-wavy'}>{c.t}</span>)}
            </div>
            {res.extra.length > 0 && <div className="text-xs text-rose-600 dark:text-rose-400" dir="ltr">✗ {res.extra.join(' · ')}</div>}
            {cur.fa && <div className="text-sm leading-7 text-[#5d6676] dark:text-[#a3adbd]">{cur.fa}</div>}
            <button onClick={next} className="w-full h-11 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white font-bold text-sm">{idx + 1 >= queue.length ? 'پایان' : 'بعدی ←'}</button>
          </div>
        )}
      </div>
    </div>
  );
};
