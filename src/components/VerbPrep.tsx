import React, { useMemo, useState } from 'react';
import { LEVELS, PREPS, VERB_PREPS, VP, blankEx, daForm, levelOf, makeId, parseVP, splitEx, woForm } from '../data/verbPrep';
import { speak } from '../utils/audio';
import { addErrors } from '../utils/errorBook';
import { generateWithGemini, parseAI } from '../utils/ai';

const STATS_KEY = 'wb_vprep_stats';
const CUSTOM_KEY = 'wb_vprep_custom';
const DAY = 86400000;
const GAPS = [0, 1, 2, 4, 8, 16, 32];
interface St { box: number; due: number; ok: number; bad: number }
const card = 'bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 space-y-3';
const inp = 'w-full bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 text-sm outline-none focus:border-[#1f5fbf]';
const kName = (k: string) => (k === 'A' ? 'Akkusativ' : 'Dativ');
const kCol = (k: string) => (k === 'A' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300');
const shuffle = <T,>(a: T[]): T[] => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const load = <T,>(k: string, d: T): T => { try { const v = JSON.parse(localStorage.getItem(k) || ''); return v ?? d; } catch { return d; } };
const save = (k: string, v: any) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

/** The example sentence with the preposition highlighted. */
const Ex: React.FC<{ v: VP }> = ({ v }) => {
  const p = splitEx(v.ex, v.prep);
  return <span dir="ltr" className="font-sans">{p ? <>{p[0]}{p[0] && !p[0].endsWith(' ') ? ' ' : ''}<b className="text-[#1f5fbf] dark:text-[#7fb0ff] underline decoration-2">{p[1]}</b>{p[2]}</> : v.ex}</span>;
};

export const VerbPrep: React.FC<{ onShowToast: (m: string, e?: boolean) => void }> = ({ onShowToast }) => {
  const [tab, setTab] = useState<'learn' | 'practice' | 'add'>('practice');
  const [custom, setCustom] = useState<VP[]>(() => load<VP[]>(CUSTOM_KEY, []));
  const [stats, setStats] = useState<Record<string, St>>(() => load(STATS_KEY, {}));
  const all = useMemo(() => [...VERB_PREPS, ...custom], [custom]);
  const [fPrep, setFPrep] = useState('');
  const [fLvl, setFLvl] = useState<string>(() => load<string>('wb_vprep_lvl', ''));
  const setLvl = (x: string) => { setFLvl(x); save('wb_vprep_lvl', x); };
  const [addLvl, setAddLvl] = useState('B1');
  // practice session
  const [count, setCount] = useState(10);
  const [sess, setSess] = useState<null | { q: string[]; i: number; ok: number; bad: number; again: Set<string> }>(null);
  const [phase, setPhase] = useState<'prep' | 'case' | 'res'>('prep');
  const [pick, setPick] = useState(''); const [typed, setTyped] = useState('');
  const [kase, setKase] = useState<'' | 'A' | 'D'>(''); const [good, setGood] = useState<boolean | null>(null);
  // add
  const [f, setF] = useState({ verb: '', prep: 'an', kase: 'A', fa: '', ex: '' });
  const [bulk, setBulk] = useState(''); const [aiPrep, setAiPrep] = useState('an'); const [aiBusy, setAiBusy] = useState(false);

  const byId = useMemo(() => new Map(all.map(v => [v.id, v])), [all]);
  const learned = all.filter(v => (stats[v.id]?.box || 0) >= 3).length;
  const pool = all.filter(v => (!fPrep || v.prep === fPrep) && (!fLvl || levelOf(v) === fLvl));

  const start = () => {
    const now = Date.now();
    const dueList = pool.filter(v => stats[v.id] && stats[v.id].due <= now).sort((a, b) => stats[a.id].box - stats[b.id].box);
    const fresh = shuffle(pool.filter(v => !stats[v.id]));
    const later = pool.filter(v => stats[v.id] && stats[v.id].due > now).sort((a, b) => stats[a.id].due - stats[b.id].due);
    const q = [...dueList, ...fresh, ...later].slice(0, count).map(v => v.id);
    if (!q.length) { onShowToast('فعلی برای تمرین نیست.', true); return; }
    setSess({ q: shuffle(q), i: 0, ok: 0, bad: 0, again: new Set() }); resetQ();
  };
  const resetQ = () => { setPhase('prep'); setPick(''); setTyped(''); setKase(''); setGood(null); };
  const cur = sess ? byId.get(sess.q[sess.i]) : undefined;
  const typedMode = cur ? (stats[cur.id]?.box || 0) >= 2 : false;
  const options = useMemo(() => (cur ? shuffle([cur.prep, ...shuffle(PREPS.filter(p => p !== cur.prep)).slice(0, 3)]) : []), [cur?.id, sess?.i]);

  const choosePrep = (p: string) => { setPick(p.trim().toLowerCase()); setPhase('case'); };
  const chooseCase = (k: 'A' | 'D') => {
    if (!cur || !sess) return;
    setKase(k);
    const prepOk = pick === cur.prep; const ok = prepOk && k === cur.kase;
    setGood(ok); setPhase('res');
    const s = { ...(stats[cur.id] || { box: 0, due: 0, ok: 0, bad: 0 }) };
    if (ok) { s.ok++; s.box = Math.min(6, s.box + 1); s.due = Date.now() + GAPS[s.box] * DAY; } else { s.bad++; s.box = 0; s.due = Date.now(); }
    const ns = { ...stats, [cur.id]: s }; setStats(ns); save(STATS_KEY, ns);
    setSess({ ...sess, ok: sess.ok + (ok ? 1 : 0), bad: sess.bad + (ok ? 0 : 1) });
    if (!ok) {
      const wrongEx = prepOk ? cur.ex : cur.ex.replace(new RegExp('(^|\\s)' + cur.prep + '(?=[\\s.,!?]|$)', 'i'), `$1${pick || '___'}`);
      addErrors([{ original: wrongEx, corrected: cur.ex, type: 'حرف اضافه و حالت دستوری', why: `${cur.verb} + ${cur.prep} + ${kName(cur.kase)} — ${cur.fa}` }]);
    }
  };
  const next = () => {
    if (!sess || !cur) return;
    let q = sess.q;
    if (good === false && !sess.again.has(cur.id)) { q = [...q, cur.id]; sess.again.add(cur.id); }
    setSess({ ...sess, q, i: sess.i + 1 }); resetQ();
  };

  const addCustom = (items: VP[]) => {
    const seen = new Set(all.map(v => v.id)); const add = items.filter(v => !seen.has(v.id));
    if (!add.length) { onShowToast('همهٔ این فعل‌ها از قبل هست.', true); return 0; }
    const nc = [...custom, ...add.map(v => ({ ...v, custom: true }))]; setCustom(nc); save(CUSTOM_KEY, nc);
    onShowToast(`${add.length} فعل اضافه شد.`); return add.length;
  };
  const askAi = async () => {
    if (aiBusy) return; setAiBusy(true);
    const have = all.filter(v => v.prep === aiPrep).map(v => v.verb).join(', ');
    const prompt = `List 8 more common German verbs (CEFR level ${addLvl === 'A1–A2' ? 'A2' : addLvl}) that take the preposition "${aiPrep}" and are NOT in this list: ${have}. Return ONLY a JSON array: [{"verb":"infinitive (with sich if reflexive)","prep":"${aiPrep}","kase":"A or D = case after the preposition","fa":"short Persian meaning","ex":"a simple German example sentence in which the preposition appears as a separate word, not contracted"}]`;
    try {
      const arr = parseAI(await generateWithGemini(prompt, { timeoutMs: 60000, retries: 1 })) as any[];
      const items = parseVP(arr.map(o => `${o.verb}|${String(o.prep || aiPrep).toLowerCase()}|${o.kase}|${o.fa}|${o.ex}`).join('\n'), true).filter(v => splitEx(v.ex, v.prep)).map(v => ({ ...v, lvl: addLvl }));
      if (!items.length) throw new Error('پاسخ نامعتبر بود.');
      addCustom(items);
    } catch (e: any) { onShowToast(e?.message || 'خطا در هوش مصنوعی', true); }
    finally { setAiBusy(false); }
  };

  const Tab = (id: typeof tab, label: string) => (
    <button key={id} onClick={() => setTab(id)} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition ${tab === id ? 'bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white shadow' : 'bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a]'}`}>{label}</button>
  );
  const PrepSel = (v: string, set: (x: string) => void, all0?: string) => (
    <select value={v} onChange={e => set(e.target.value)} className={inp}>{all0 !== undefined && <option value="">{all0}</option>}{PREPS.map(p => <option key={p} value={p}>{p}</option>)}</select>
  );

  return (
    <div className="space-y-4 text-right max-w-3xl mx-auto">
      <div className="flex gap-2">{Tab('practice', '🎯 تمرین')}{Tab('learn', '📚 یادگیری')}{Tab('add', '➕ افزودن')}</div>

      {/* ---------------- LEARN ---------------- */}
      {tab === 'learn' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {['', ...PREPS].map(p => (
              <button key={p || 'all'} onClick={() => setFPrep(p)} className={`px-3 py-1.5 rounded-full text-xs font-bold border ${fPrep === p ? 'bg-[#1f5fbf] text-white border-[#1f5fbf]' : 'bg-white dark:bg-[#1b2029] border-[#dde1ea] dark:border-[#333b4a]'}`}>{p || 'همه'}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-[#5d6676] dark:text-[#a3adbd]">سطح:</span>
            {['', ...LEVELS].map(l => (
              <button key={l || 'all'} onClick={() => setLvl(l)} className={`px-3 py-1.5 rounded-full text-xs font-bold border ${fLvl === l ? 'bg-[#6b4fd8] text-white border-[#6b4fd8]' : 'bg-white dark:bg-[#1b2029] border-[#dde1ea] dark:border-[#333b4a]'}`}>{l || 'همه'}</button>
            ))}
          </div>
          {(fPrep ? [fPrep] : PREPS).map(p => {
            const list = all.filter(v => v.prep === p && (!fLvl || levelOf(v) === fLvl)); if (!list.length) return null;
            return (
              <div key={p} className={card + ' !p-3'}>
                <div className="flex items-center justify-between">
                  <b className="text-lg font-sans" dir="ltr">{p} <span className="text-xs font-normal text-[#5d6676]">({list.length})</span></b>
                  <span className="text-[11px] text-[#5d6676] dark:text-[#a3adbd]" dir="ltr">{woForm(p)}? → {daForm(p)}</span>
                </div>
                {list.map(v => (
                  <div key={v.id} className="border-t border-slate-100 dark:border-slate-800 pt-2 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <b dir="ltr" className="font-sans text-base">{v.verb} <span className="text-[#1f5fbf] dark:text-[#7fb0ff]">{v.prep}</span></b>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${kCol(v.kase)}`}>{kName(v.kase)}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300">{levelOf(v)}</span>
                      <button onClick={() => speak(v.ex)} className="text-base" aria-label="پخش">🔊</button>
                      {stats[v.id] && stats[v.id].box >= 3 && <span className="text-[10px] text-emerald-600">✓ یاد گرفته</span>}
                    </div>
                    <div className="text-sm">{v.fa}</div>
                    <div className="text-sm leading-7"><Ex v={v} /></div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* ---------------- PRACTICE ---------------- */}
      {tab === 'practice' && !sess && (
        <div className={card}>
          <div className="font-extrabold text-sm">🔗 فعل + حرف اضافه (Verben mit Präpositionen)</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 py-2"><div className="font-extrabold text-lg" dir="ltr">{pool.length}</div><div className="text-[11px]">فعل در این فیلتر</div></div>
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 py-2"><div className="font-extrabold text-lg text-emerald-700 dark:text-emerald-300" dir="ltr">{learned}</div><div className="text-[11px]">یاد گرفته</div></div>
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 py-2"><div className="font-extrabold text-lg text-amber-700 dark:text-amber-300" dir="ltr">{all.filter(v => stats[v.id] && stats[v.id].due <= Date.now()).length}</div><div className="text-[11px]">نوبت مرور</div></div>
          </div>
          <p className="text-[12px] leading-6 text-[#5d6676] dark:text-[#a3adbd]">هر سؤال دو قدم دارد: ۱) حرف اضافهٔ درست، ۲) حالت دستوری (Akk یا Dat). اول چهارگزینه‌ای است؛ وقتی فعل را بهتر بلد شدی باید خودت تایپ کنی. فعل‌های غلط دوباره در همین جلسه می‌آیند و به «دفتر خطاها» هم می‌روند.</p>
          <div className="grid grid-cols-3 gap-2">
            <select value={fLvl} onChange={e => setLvl(e.target.value)} className={inp}><option value="">همهٔ سطوح</option>{LEVELS.map(l => <option key={l} value={l}>{l}</option>)}</select>
            {PrepSel(fPrep, setFPrep, 'همهٔ حرف‌ها')}
            <select value={count} onChange={e => setCount(Number(e.target.value))} className={inp}>{[10, 20, 30].map(n => <option key={n} value={n}>{n} سؤال</option>)}</select>
          </div>
          <button onClick={start} className="w-full h-12 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white font-bold text-sm">▶️ شروع تمرین</button>
        </div>
      )}

      {tab === 'practice' && sess && sess.i >= sess.q.length && (
        <div className={card + ' text-center'}>
          <div className="text-4xl">🎉</div><div className="font-extrabold">جلسه تمام شد</div>
          <div className="text-sm">درست: <b className="text-emerald-600">{sess.ok}</b> — غلط: <b className="text-rose-600">{sess.bad}</b></div>
          <div className="grid grid-cols-2 gap-2"><button onClick={start} className="h-11 rounded-xl bg-[#1f5fbf] text-white font-bold text-sm">جلسهٔ بعد</button><button onClick={() => setSess(null)} className="h-11 rounded-xl border border-slate-300 dark:border-slate-600 font-bold text-sm">بازگشت</button></div>
        </div>
      )}

      {tab === 'practice' && sess && cur && sess.i < sess.q.length && (
        <div className="space-y-3">
          <div className="flex justify-between text-xs font-bold text-[#5d6676] dark:text-[#a3adbd]"><span>{sess.i + 1} / {sess.q.length}</span><button onClick={() => setSess(null)} className="text-red-600">✕ پایان</button></div>
          <div className={card}>
            <div className="text-center space-y-1">
              <div dir="ltr" className="text-2xl font-extrabold font-sans">{cur.verb} <span className="text-slate-400">___</span></div>
              <div className="text-sm text-[#5d6676] dark:text-[#a3adbd]">{cur.fa}</div>
            </div>
            <div dir="ltr" className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-base font-sans leading-8 text-center">{phase === 'res' ? <Ex v={cur} /> : blankEx(cur.ex, cur.prep)}</div>

            {phase === 'prep' && (typedMode ? (
              <div className="space-y-2">
                <input dir="ltr" autoFocus value={typed} onChange={e => setTyped(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && typed.trim()) choosePrep(typed); }} placeholder="حرف اضافه را تایپ کن …" className={inp + ' text-center text-base font-bold'} />
                <button disabled={!typed.trim()} onClick={() => choosePrep(typed)} className="w-full h-11 rounded-xl bg-[#1f5fbf] text-white font-bold text-sm disabled:opacity-40">ادامه</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">{options.map(o => <button key={o} onClick={() => choosePrep(o)} className="h-12 rounded-xl border-2 border-[#dde1ea] dark:border-[#333b4a] font-extrabold text-lg font-sans hover:border-[#1f5fbf] active:scale-95 transition">{o}</button>)}</div>
            ))}

            {phase === 'case' && (
              <div className="space-y-2">
                <div className="text-center text-sm font-bold">حالت دستوری بعد از «<span dir="ltr" className="font-sans">{pick}</span>» در این فعل؟</div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => chooseCase('A')} className="h-12 rounded-xl bg-blue-100 text-blue-900 dark:bg-blue-950/60 dark:text-blue-200 font-bold">Akkusativ</button>
                  <button onClick={() => chooseCase('D')} className="h-12 rounded-xl bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200 font-bold">Dativ</button>
                </div>
              </div>
            )}

            {phase === 'res' && (
              <div className="space-y-2.5">
                <div className={`p-3 rounded-xl text-sm font-bold leading-7 ${good ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200' : 'bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200'}`}>
                  {good ? '✅ درست!' : `❌ ${pick !== cur.prep ? `حرف اضافه «${pick}» نبود. ` : ''}${kase !== cur.kase ? `حالت دستوری ${kName(cur.kase)} است. ` : ''}`}
                  <div dir="ltr" className="font-sans text-base mt-1">{cur.verb} <u>{cur.prep}</u> + {kName(cur.kase)}</div>
                </div>
                <div dir="ltr" className="text-xs text-[#5d6676] dark:text-[#a3adbd] text-center">Frage: <b>{woForm(cur.prep)}</b> …? — Antwort: <b>{daForm(cur.prep)}</b> …</div>
                <div className="grid grid-cols-2 gap-2"><button onClick={() => speak(cur.ex)} className="h-11 rounded-xl border border-slate-300 dark:border-slate-600 font-bold text-sm">🔊 بشنو</button><button onClick={next} className="h-11 rounded-xl bg-[#1f5fbf] text-white font-bold text-sm">بعدی ←</button></div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------- ADD ---------------- */}
      {tab === 'add' && (
        <div className="space-y-3">
          <div className={card + ' !p-3 flex items-center gap-3'}>
            <span className="text-xs font-bold flex-shrink-0">سطح فعل‌های افزوده:</span>
            <select value={addLvl} onChange={e => setAddLvl(e.target.value)} className={inp}>{LEVELS.map(l => <option key={l} value={l}>{l}</option>)}</select>
          </div>
          <div className={card}>
            <div className="font-extrabold text-sm">🤖 ساخت فعل‌های بیشتر با هوش مصنوعی</div>
            <p className="text-[12px] text-[#5d6676] dark:text-[#a3adbd]">برای حرف اضافهٔ انتخاب‌شده ۸ فعل جدید (که در فهرست نیست) ساخته و اضافه می‌شود.</p>
            <div className="flex gap-2"><div className="flex-1">{PrepSel(aiPrep, setAiPrep)}</div><button onClick={askAi} disabled={aiBusy} className="px-4 h-10 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white font-bold text-xs disabled:opacity-40">{aiBusy ? '⏳ …' : 'بساز'}</button></div>
          </div>
          <div className={card}>
            <div className="font-extrabold text-sm">✍️ افزودن یک فعل</div>
            <input dir="ltr" className={inp} placeholder="Verb (z. B. sich freuen)" value={f.verb} onChange={e => setF({ ...f, verb: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">{PrepSel(f.prep, p => setF({ ...f, prep: p }))}<select className={inp} value={f.kase} onChange={e => setF({ ...f, kase: e.target.value })}><option value="A">Akkusativ</option><option value="D">Dativ</option></select></div>
            <input className={inp} placeholder="معنی فارسی" value={f.fa} onChange={e => setF({ ...f, fa: e.target.value })} />
            <input dir="ltr" className={inp} placeholder="Beispielsatz (mit der Präposition)" value={f.ex} onChange={e => setF({ ...f, ex: e.target.value })} />
            <button onClick={() => { const it = parseVP(`${f.verb}|${f.prep}|${f.kase}|${f.fa}|${f.ex}`, true).filter(v => splitEx(v.ex, v.prep)).map(v => ({ ...v, lvl: addLvl })); if (!it.length) { onShowToast('فعل، معنی و جملهٔ مثال (شامل همان حرف اضافه) لازم است.', true); return; } if (addCustom(it)) setF({ ...f, verb: '', fa: '', ex: '' }); }} className="w-full h-11 rounded-xl bg-emerald-600 text-white font-bold text-sm">افزودن</button>
          </div>
          <div className={card}>
            <div className="font-extrabold text-sm">📋 افزودن گروهی (هر خط یک فعل)</div>
            <p className="text-[11px] text-[#5d6676] dark:text-[#a3adbd]" dir="ltr">verb|prep|A or D|فارسی|Beispielsatz</p>
            <textarea dir="ltr" rows={4} className={inp} value={bulk} onChange={e => setBulk(e.target.value)} placeholder="warten|auf|A|منتظر بودن|Ich warte auf den Bus." />
            <button onClick={() => { const it = parseVP(bulk, true).filter(v => splitEx(v.ex, v.prep)).map(v => ({ ...v, lvl: addLvl })); if (!it.length) { onShowToast('هیچ خط معتبری پیدا نشد.', true); return; } addCustom(it); setBulk(''); }} className="w-full h-11 rounded-xl border border-[#1f5fbf] text-[#1f5fbf] dark:text-blue-300 font-bold text-sm">افزودن همه</button>
          </div>
          {custom.length > 0 && (
            <div className={card}>
              <div className="font-extrabold text-sm">فعل‌های افزودهٔ من ({custom.length})</div>
              {custom.map(v => (
                <div key={v.id} className="flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800 pt-2">
                  <div className="min-w-0 text-sm"><b dir="ltr" className="font-sans">{v.verb} {v.prep}</b> <span className={`text-[10px] px-1.5 rounded-full ${kCol(v.kase)}`}>{kName(v.kase)}</span> <span className="text-[10px] text-slate-500">{levelOf(v)}</span><div className="truncate text-xs text-[#5d6676]">{v.fa}</div></div>
                  <button onClick={() => { const nc = custom.filter(c => c.id !== v.id); setCustom(nc); save(CUSTOM_KEY, nc); }} className="text-red-500 text-xl px-1">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
