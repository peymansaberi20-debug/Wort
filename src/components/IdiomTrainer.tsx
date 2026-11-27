/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * IdiomTrainer.tsx — تمرین اصطلاحات آلمانی (Redewendungen) — برای آزمون B2
 *
 * دو مود:
 *   ۱) learn (یادگیری): فهرست اصطلاحات با چشم نمایش/پنهان معنی و مثال
 *   ۲) practice (تمرین): اصطلاح نشان داده می‌شود، کاربر معنای فارسی را تایپ می‌کند یا از ۴ گزینه انتخاب می‌کند
 *
 * الگو از VerbPrep.tsx گرفته شده — همان SRS، همان چت با معلم، همان PrintPreview.
 */

import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { IDIOMS, IDIOM_CATS, IDIOM_LEVELS, Idiom } from '../data/idioms';
import { speak } from '../utils/audio';
import { generateWithGemini } from '../utils/ai';
import { generateText, hasApiKey, describeAiError } from '../utils/aiProvider';
import { CountChips, LevelChips, PrimaryBtn, PrintPreview, Section, toFa, useConfirm, prG, prFa } from './trainerUI';
import { PageOverlay } from './PageOverlay';
import { Printer, Eye, EyeOff, X } from 'lucide-react';

const DAY = 86400000;
const SRS_KEY = 'wb_idioms_srs_v1';
const STATS_KEY = 'wb_idioms_stats';
interface Srs { streak: number; lastReviewed: number; due: number; graduated: boolean }
const SRS_IVLS = [DAY, 3 * DAY, 7 * DAY, 14 * DAY];
const load = <T,>(k: string, d: T): T => { try { const v = JSON.parse(localStorage.getItem(k) || ''); return v ?? d; } catch { return d; } };
const save = (k: string, v: any) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };
const loadSrs = (): Record<string, Srs> => load(SRS_KEY, {});
const saveSrs = (m: Record<string, Srs>) => save(SRS_KEY, m);
const recordSrs = (id: string, ok: boolean): { srs: Record<string, Srs>; graduated: boolean } => {
  const m = loadSrs();
  const cur = m[id] || { streak: 0, lastReviewed: 0, due: 0, graduated: false };
  let streak: number; let due: number; let graduated = cur.graduated;
  if (ok) {
    streak = cur.streak + 1;
    due = Date.now() + SRS_IVLS[Math.min(streak - 1, SRS_IVLS.length - 1)];
    if (streak >= 3 && !cur.graduated) graduated = true;
  } else {
    streak = 0;
    due = Date.now() + 10 * 60 * 1000;
    graduated = false;
  }
  m[id] = { streak, lastReviewed: Date.now(), due, graduated };
  saveSrs(m);
  return { srs: m, graduated };
};
const resetSrs = (id: string) => {
  const m = loadSrs();
  m[id] = { streak: 0, lastReviewed: 0, due: 0, graduated: false };
  saveSrs(m);
  return m;
};

interface St { box: number; due: number; ok: number; bad: number }
interface ChatMsg { role: 'user' | 'ai'; text: string }

const card = 'bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 space-y-3';
const inp = 'w-full bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 text-sm outline-none focus:border-[#1f5fbf]';
const shuffle = <T,>(a: T[]): T[] => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const aiReady = () => hasApiKey();

interface Props {
  vTab: 'learn' | 'practice';
  onShowToast: (m: string, isErr?: boolean) => void;
}

export const IdiomTrainer: React.FC<Props> = ({ vTab, onShowToast }) => {
  const [stats, setStats] = useState<Record<string, St>>(() => load(STATS_KEY, {}));
  const [srsMap, setSrsMap] = useState<Record<string, Srs>>(() => loadSrs());
  const [fCat, setFCat] = useState('');
  const [fLvl, setFLvl] = useState('');
  const [search, setSearch] = useState('');
  const [learnView, setLearnView] = useState<'all' | 'learned' | 'due'>('all');
  const [revealedRows, setRevealedRows] = useState<Set<string>>(new Set());
  const [printOpen, setPrintOpen] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatBusy, setChatBusy] = useState(false);

  // practice session
  const [count, setCount] = useState(8);
  const [pMode, setPMode] = useState<'mc' | 'type'>('mc');
  const [queue, setQueue] = useState<Idiom[]>([]);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<'q' | 'res'>('q');
  const [typed, setTyped] = useState('');
  const [mcOptions, setMcOptions] = useState<string[]>([]);
  const [mcPick, setMcPick] = useState('');
  const [good, setGood] = useState<boolean | null>(null);
  const [sess, setSess] = useState<{ i: number; ok: number; bad: number } | null>(null);

  const toggleRowReveal = (id: string) => setRevealedRows(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return IDIOMS.filter(i => {
      if (fCat && i.cat !== fCat) return false;
      if (fLvl && i.level !== fLvl) return false;
      if (!q) return true;
      return i.idiom.toLowerCase().includes(q) || (i.meaningFa || '').includes(search.trim());
    });
  }, [fCat, fLvl, search]);

  const learned = useMemo(() => filtered.filter(i => !!(srsMap[i.id]?.graduated)), [filtered, srsMap]);
  const dueList = useMemo(() => {
    const now = Date.now();
    return filtered.filter(i => {
      const s = srsMap[i.id];
      if (!s) return true;
      if (s.graduated) return false;
      return s.due <= now || s.streak < 3;
    });
  }, [filtered, srsMap]);

  const displayList = useMemo(() => {
    const baseSet = learnView === 'learned' ? new Set(learned.map(i => i.id)) : learnView === 'due' ? new Set(dueList.map(i => i.id)) : null;
    return filtered.filter(i => !baseSet || baseSet.has(i.id));
  }, [filtered, learnView, learned, dueList]);

  /* ─────────── practice: ساخت جلسه ─────────── */
  const startSession = () => {
    const now = Date.now();
    const pool = filtered.filter(i => {
      const s = srsMap[i.id];
      if (s?.graduated) return false; // دانش‌آموخته‌ها حذف
      if (!s) return true; // هرگز تمرین نشده
      return s.due <= now || s.streak < 3;
    });
    if (!pool.length) {
      onShowToast('اصطلاحی برای تمرین نیست — همهٔ اصطلاحات دانش‌آموخته‌اند.', true);
      return;
    }
    const chosen = shuffle(pool).slice(0, count);
    setQueue(chosen); setIdx(0); setSess({ i: 0, ok: 0, bad: 0 }); setPhase('q'); setTyped(''); setMcPick(''); setGood(null);
    if (pMode === 'mc') buildMc(chosen[0]);
  };

  const buildMc = (cur: Idiom) => {
    const distractors = shuffle(IDIOMS.filter(i => i.id !== cur.id).map(i => i.meaningFa).filter(Boolean)).slice(0, 3);
    setMcOptions(shuffle([cur.meaningFa, ...distractors]));
  };

  const cur = queue[idx];

  const checkMc = (choice: string) => {
    if (!cur || phase === 'res') return;
    setMcPick(choice);
    const ok = choice === cur.meaningFa;
    setGood(ok); setPhase('res');
    gradeAnswer(cur, ok);
  };

  const checkTyped = () => {
    if (!cur || phase === 'res' || !typed.trim()) return;
    const ok = typed.trim().toLowerCase() === cur.meaningFa.trim().toLowerCase();
    setGood(ok); setPhase('res');
    gradeAnswer(cur, ok);
  };

  const gradeAnswer = (i: Idiom, ok: boolean) => {
    const s = { ...(stats[i.id] || { box: 0, due: 0, ok: 0, bad: 0 }) };
    if (ok) { s.ok++; s.box = Math.min(6, s.box + 1); s.due = Date.now() + [0, 1, 2, 4, 8, 16, 32][s.box] * DAY; }
    else { s.bad++; s.box = 0; s.due = Date.now(); }
    setStats({ ...stats, [i.id]: s }); save(STATS_KEY, { ...stats, [i.id]: s });
    const r = recordSrs(i.id, ok); setSrsMap(r.srs);
    if (r.graduated) onShowToast(`🎓 اصطلاح «${i.idiom}» با ۳ پاسخ درست پیاپی دانش‌آموخته شد!`);
    if (sess) setSess({ ...sess, i: sess.i + 1, ok: sess.ok + (ok ? 1 : 0), bad: sess.bad + (ok ? 0 : 1) });
  };

  const nextQ = () => {
    if (idx + 1 >= queue.length) {
      onShowToast(`تمرین به پایان رسید — ${toFa(sess?.ok || 0)}/${toFa(queue.length)} درست`);
      setQueue([]); setSess(null);
      return;
    }
    const ni = idx + 1;
    setIdx(ni); setPhase('q'); setTyped(''); setMcPick(''); setGood(null);
    if (pMode === 'mc') buildMc(queue[ni]);
  };

  /* ─────────── چت با معلم ─────────── */
  const sendChat = async () => {
    if (!chatId || chatBusy) return;
    const cur = IDIOMS.find(i => i.id === chatId);
    if (!cur) return;
    const q = chatDraft.trim();
    if (!q) return;
    if (!aiReady()) { onShowToast('هوش مصنوعی در تنظیمات فعال نیست.', true); return; }
    setChatMsgs(m => [...m, { role: 'user', text: q }]);
    setChatDraft(''); setChatBusy(true);
    try {
      const sys = `تو معلم آلمانی هستی. دربارهٔ اصطلاح «${cur.idiom}» (به‌معنی: ${cur.meaningFa}) که در آزمون B2 مهم است، توضیح بده. پاسخ فارسی، کوتاه (۲–۵ جمله)، با مثال آلمانی.`;
      const out = await generateWithGemini(`${sys}\n\nپرسش: ${q}`, { timeoutMs: 60000, retries: 1 });
      setChatMsgs(m => [...m, { role: 'ai', text: String(out || '').trim() }]);
    } catch (e: any) {
      setChatMsgs(m => [...m, { role: 'ai', text: 'خطا: ' + (e?.message || 'پاسخ دریافت نشد.') }]);
    } finally { setChatBusy(false); }
  };

  return (
    <div className="space-y-3 text-right">
      {/* ─────────── LEARN ─────────── */}
      {vTab === 'learn' && (
        <>
          {/* ۳ کارت بالا (درخواست کاربر) */}
          <div className="grid grid-cols-3 gap-2">
            {([
              { id: 'all' as const, label: 'همه اصطلاحات', icon: '📚', count: filtered.length },
              { id: 'learned' as const, label: 'یادگرفته‌ها', icon: '🎓', count: learned.length },
              { id: 'due' as const, label: 'نوبت مرور', icon: '🔁', count: dueList.length }
            ]).map(opt => (
              <button key={opt.id} onClick={() => setLearnView(opt.id)}
                className={`py-2.5 px-2 rounded-xl text-xs font-bold border transition flex flex-col items-center gap-0.5 ${learnView === opt.id ? 'bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white border-transparent shadow' : 'bg-white dark:bg-[#1b2029] border-[#dde1ea] dark:border-[#333b4a] text-[#5d6676] dark:text-[#a3adbd]'}`}>
                <span className="text-base leading-none">{opt.icon}</span>
                <span>{opt.label}</span>
                <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ${learnView === opt.id ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-[#5d6676]'}`}>{toFa(opt.count)}</span>
              </button>
            ))}
          </div>

          {/* جستجو + فیلتر */}
          <div className={card + ' !p-3 space-y-2'}>
            <input dir="rtl" className={inp} placeholder="جستجوی اصطلاح آلمانی یا معنی فارسی…" value={search} onChange={e => setSearch(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <select className={inp} value={fCat} onChange={e => setFCat(e.target.value)}>
                <option value="">همهٔ دسته‌ها</option>
                {IDIOM_CATS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className={inp} value={fLvl} onChange={e => setFLvl(e.target.value)}>
                <option value="">همهٔ سطوح</option>
                {IDIOM_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>

          {/* فهرست اصطلاحات */}
          <div className={card + ' !p-3'}>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
              <b className="text-sm">{toFa(displayList.length)} اصطلاح</b>
              <button onClick={() => setPrintOpen(true)} disabled={!displayList.length}
                title="برگهٔ A4 اصطلاحات" className="w-9 h-9 rounded-lg bg-[#1f5fbf] text-white flex items-center justify-center disabled:opacity-40">
                <Printer size={15} />
              </button>
            </div>
            {displayList.length === 0 ? (
              <p className="text-xs text-[#5d6676] py-3 text-center">اصطلاحی با این فیلتر پیدا نشد.</p>
            ) : displayList.map(i => {
              const revealed = revealedRows.has(i.id) || learnView === 'all';
              const isGraduated = !!(srsMap[i.id]?.graduated);
              return (
                <div key={i.id} className="border-t border-slate-100 dark:border-slate-800 pt-2 pb-2 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <b dir="ltr" className="font-sans text-base text-left">{i.idiom}</b>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end flex-shrink-0">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${i.level === 'C1' ? 'bg-purple-100 text-purple-800' : i.level === 'B2' ? 'bg-violet-100 text-violet-800' : 'bg-blue-100 text-blue-800'}`}>{i.level}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[#5d6676]">{i.cat}</span>
                      {isGraduated && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">🎓</span>}
                      {learnView !== 'all' && (
                        <button onClick={() => toggleRowReveal(i.id)} className="w-7 h-7 rounded-lg border border-[#dde1ea] dark:border-[#333b4a] bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                          {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      )}
                      <button onClick={() => speak(i.example)} className="text-base">🔊</button>
                      <button onClick={() => { setChatId(i.id); setChatMsgs([]); setChatDraft(''); }} className="text-base">💬</button>
                      {isGraduated && <button onClick={() => { setSrsMap(resetSrs(i.id)); onShowToast(`«${i.idiom}» به صف تمرین بازگشت.`); }} className="text-[10px] font-bold px-2 py-1 rounded-lg border border-[#1f5fbf]/40 text-[#1f5fbf]">↺</button>}
                    </div>
                  </div>
                  {(learnView === 'all' || revealed) && (
                    <>
                      <div className="text-sm text-right font-semibold text-[#1f5fbf] dark:text-[#7fb0ff]">{i.meaningFa}</div>
                      {i.literalFa && i.literalFa !== i.meaningFa && <div className="text-[11px] text-[#5d6676] dark:text-[#a3adbd]">ترجمهٔ تحت‌اللفظی: {i.literalFa}</div>}
                      <div dir="ltr" className="text-sm leading-7 text-left font-sans">{i.example}</div>
                      {i.exampleFa && <div className="text-xs text-[#5d6676] dark:text-[#a3adbd]">{i.exampleFa}</div>}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ─────────── PRACTICE ─────────── */}
      {vTab === 'practice' && (
        <>
          <div className={card}>
            <div className="grid grid-cols-3 gap-2 text-center mb-3">
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 py-2"><div className="font-extrabold text-lg" dir="ltr">{toFa(filtered.length)}</div><div className="text-[11px]">اصطلاح در فیلتر</div></div>
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 py-2"><div className="font-extrabold text-lg text-emerald-700" dir="ltr">{toFa(learned.length)}</div><div className="text-[11px]">یاد گرفته</div></div>
              <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 py-2"><div className="font-extrabold text-lg text-amber-700" dir="ltr">{toFa(dueList.length)}</div><div className="text-[11px]">نوبت مرور</div></div>
            </div>
            <Section n="۱" label="سطح"><LevelChips value={fLvl} onChange={setFLvl} levels={IDIOM_LEVELS} /></Section>
            <Section n="۲" label="دسته">
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => setFCat('')} className={`text-[11px] rounded-full px-2.5 py-1 border ${!fCat ? 'bg-[#1f5fbf] text-white border-transparent' : 'bg-slate-50 dark:bg-[#141923] border-[#dde1ea]'}`}>همه</button>
                {IDIOM_CATS.map(c => <button key={c} onClick={() => setFCat(c)} className={`text-[11px] rounded-full px-2.5 py-1 border ${fCat === c ? 'bg-[#1f5fbf] text-white border-transparent' : 'bg-slate-50 dark:bg-[#141923] border-[#dde1ea]'}`}>{c}</button>)}
              </div>
            </Section>
            <Section n="۳" label="نوع تمرین">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setPMode('mc')} className={`py-2 rounded-xl text-xs font-bold border ${pMode === 'mc' ? 'bg-[#1f5fbf] text-white border-transparent' : 'bg-slate-50 dark:bg-[#141923] border-[#dde1ea]'}`}>انتخاب از ۴ گزینه</button>
                <button onClick={() => setPMode('type')} className={`py-2 rounded-xl text-xs font-bold border ${pMode === 'type' ? 'bg-[#1f5fbf] text-white border-transparent' : 'bg-slate-50 dark:bg-[#141923] border-[#dde1ea]'}`}>تایپ معنی فارسی</button>
              </div>
            </Section>
            <Section n="۴" label="تعداد"><CountChips value={count} onChange={setCount} counts={[5, 8, 10, 12]} /></Section>
            <PrimaryBtn onClick={startSession} label="🚀 شروع تمرین" />
          </div>

          {cur && sess && (
            <div className={card}>
              <div className="flex justify-between text-xs font-bold text-[#5d6676]"><span>سؤال {toFa(idx + 1)} از {toFa(queue.length)}</span><span>درست: {toFa(sess.ok)} • غلط: {toFa(sess.bad)}</span></div>
              <div dir="ltr" className="text-xl md:text-2xl font-extrabold font-sans text-center py-4">{cur.idiom}</div>
              <button onClick={() => speak(cur.example)} className="mx-auto block text-base mb-3">🔊 پخش مثال</button>
              {pMode === 'mc' ? (
                <div className="grid grid-cols-1 gap-2">
                  {mcOptions.map(opt => (
                    <button key={opt} onClick={() => checkMc(opt)} disabled={phase === 'res'}
                      className={`py-3 px-3 rounded-xl text-sm font-bold border text-right ${phase === 'res' && opt === cur.meaningFa ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : phase === 'res' && opt === mcPick ? 'bg-rose-100 border-rose-300 text-rose-800' : 'bg-slate-50 dark:bg-[#141923] border-[#dde1ea] hover:border-[#1f5fbf]'}`}>
                      {opt}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <input dir="rtl" value={typed} onChange={e => setTyped(e.target.value)} disabled={phase === 'res'} onKeyDown={e => { if (e.key === 'Enter') checkTyped(); }} placeholder="معنی فارسی را بنویس…" className={inp + ' text-base'} />
                  {phase !== 'res' && <button onClick={checkTyped} disabled={!typed.trim()} className="w-full h-11 rounded-xl bg-emerald-600 text-white font-bold text-sm disabled:opacity-40">✅ بررسی</button>}
                </div>
              )}
              {phase === 'res' && (
                <div className="space-y-2 mt-3">
                  <div className={`p-3 md:p-4 rounded-xl text-sm md:text-base font-bold leading-7 ${good ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
                    {good ? '✅ درست!' : `❌ پاسخ درست: ${cur.meaningFa}`}
                  </div>
                  <div dir="ltr" className="text-sm leading-7 font-sans bg-slate-50 dark:bg-[#141923] p-2 rounded-xl">{cur.example}</div>
                  <div className="text-xs text-[#5d6676] dark:text-[#a3adbd]">{cur.exampleFa}</div>
                  <button onClick={nextQ} className="w-full h-11 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white font-bold text-sm">{idx + 1 >= queue.length ? 'پایان' : 'بعدی ←'}</button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* چت با معلم */}
      {chatId && createPortal(
        <div className="fixed inset-0 z-[1000] bg-black/50 flex items-center justify-center p-3" onClick={e => { if (e.target === e.currentTarget) setChatId(null); }}>
          <div className="bg-white dark:bg-[#1b2029] rounded-2xl border border-[#dde1ea] dark:border-[#333b4a] w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-3 border-b border-[#dde1ea] dark:border-[#333b4a]">
              <b className="text-sm">💬 گفتگو با معلم دربارهٔ «{IDIOMS.find(i => i.id === chatId)?.idiom}»</b>
              <button onClick={() => setChatId(null)} className="text-red-500"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
              {chatMsgs.length === 0 && <p className="text-xs text-[#5d6676]">پرسشت را دربارهٔ این اصطلاح بنویس — معلم تو پاسخ می‌دهد.</p>}
              {chatMsgs.map((m, i) => <div key={i} className={`p-2 rounded-xl text-xs leading-6 ${m.role === 'user' ? 'bg-[#1f5fbf] text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>{m.text}</div>)}
              {chatBusy && <div className="text-xs text-[#5d6676]">🤖 در حال پاسخ…</div>}
            </div>
            <div className="p-3 border-t border-[#dde1ea] dark:border-[#333b4a] flex gap-2">
              <input dir="rtl" value={chatDraft} onChange={e => setChatDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sendChat(); }} placeholder="پرسش…" className={inp + ' flex-1'} />
              <button onClick={sendChat} disabled={chatBusy || !chatDraft.trim()} className="px-4 rounded-xl bg-[#1f5fbf] text-white text-sm font-bold disabled:opacity-40">ارسال</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* پرینت */}
      {printOpen && createPortal(
        <PrintPreview
          open
          onClose={() => setPrintOpen(false)}
          title={<span>Redewendungen — اصطلاحات آلمانی ({fLvl || 'همهٔ سطوح'})</span>}
          docTitle="Redewendungen"
          meta={<>{toFa(displayList.length)} اصطلاح</>}
          questions={
            <ol className="space-y-3">
              {displayList.map((i, n) => (
                <li key={i.id}>
                  <div style={prG()} className="font-bold font-sans">{n + 1}. {i.idiom}</div>
                  <div style={prFa()} className="text-sm text-slate-600">{i.literalFa}</div>
                </li>
              ))}
            </ol>
          }
          solutions={
            <ol className="space-y-3">
              {displayList.map((i, n) => (
                <li key={i.id}>
                  <div style={prG()} className="font-bold font-sans">{n + 1}. {i.idiom}</div>
                  <div style={prFa()} className="text-sm">معنی: <b>{i.meaningFa}</b></div>
                  <div style={prG()} className="text-xs italic">{i.example}</div>
                  <div style={prFa()} className="text-xs text-slate-500">{i.exampleFa}</div>
                </li>
              ))}
            </ol>
          }
        />,
        document.body
      )}
    </div>
  );
};
