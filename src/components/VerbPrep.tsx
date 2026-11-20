import React, { useMemo, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Word } from '../types';
import { LEVELS, PREPS, VERB_PREPS, VP, blankEx, daForm, levelOf, makeId, parseVP, splitEx, woForm } from '../data/verbPrep';
import { speak } from '../utils/audio';
import { addErrors } from '../utils/errorBook';
import { generateWithGemini, parseAI } from '../utils/ai';
import { generateText, hasApiKey, describeAiError, getActiveProvider, getModel } from '../utils/aiProvider';

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

/* ───────── پل هوش مصنوعی برنامه: کلید و مدل از تنظیمات (aiProvider) ─────────
 * هیچ کارت کلیدی داخل تمرین نیست؛ اگر کلید در تنظیمات نباشد فقط پیام راهنما می‌بینی
 * و تمرین/یادگیری/افزودن دستی مثل قبل کار می‌کنند. */
const aiReadyFn = (): boolean => { try { return !!hasApiKey(); } catch { return false; } };
const aiLabel = (): string => {
  try {
    const p = String(getActiveProvider() || 'AI');
    const m = String(getModel() || '').trim();
    return m ? `${p} · ${m}` : p;
  } catch { return 'AI'; }
};
const WORD_RE = /[A-Za-zÄÖÜäöüß]+(?:-[A-Za-zÄÖÜäöüß]+)*/g;

/** تبدیل پاسخ AI به JSON حتی وقتی ```json یا متن اضافه دارد */
function parseJSONLoose<T>(raw: string): T {
  let s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const tryParse = (x: string): T | null => { try { return JSON.parse(x) as T; } catch { return null; } };
  let out = tryParse(s);
  if (out) return out;
  const a = s.indexOf('['), b = s.lastIndexOf(']');
  if (a >= 0 && b > a) { out = tryParse(s.slice(a, b + 1)); if (out) return out; }
  const ao = s.indexOf('{'), bo = s.lastIndexOf('}');
  if (ao >= 0 && bo > ao) { out = tryParse(s.slice(ao, bo + 1)); if (out) return out; }
  throw new Error('AI_PARSE');
}

interface ChatMsg { role: 'user' | 'ai'; text: string; }
interface WInfo { fa: string; pos?: string; art?: string; ex?: string; exFa?: string; }
const QUICK_QS = ['چرا این حرف اضافه؟', 'فرق Akkusativ و Dativ این‌جا؟', 'یک مثال دیگر بده', 'چطور یادش بگیرم؟'];

/** متن با کلمه‌های قابل لمس (برای ترجمهٔ واژه با هوش مصنوعی) */
const TapText: React.FC<{ text: string; onTap?: (w: string) => void }> = ({ text, onTap }) => {
  if (!onTap || !text) return <>{text}</>;
  const toks: { w: string; isWord: boolean }[] = [];
  let last = 0; let m: RegExpExecArray | null;
  const re = new RegExp(WORD_RE.source, 'g');
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) toks.push({ w: text.slice(last, m.index), isWord: false });
    toks.push({ w: m[0], isWord: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) toks.push({ w: text.slice(last), isWord: false });
  return <>{toks.map((t, i) => t.isWord
    ? <button key={i} onClick={() => onTap(t.w)} className="underline decoration-dotted decoration-[#b6c3d9] underline-offset-4 hover:bg-[#1f5fbf]/10 transition-colors">{t.w}</button>
    : <span key={i}>{t.w}</span>)}</>;
};

/** The example sentence with the preposition highlighted — کلمه‌ها لمس‌پذیرند. */
const Ex: React.FC<{ v: VP; onTap?: (w: string) => void }> = ({ v, onTap }) => {
  const p = splitEx(v.ex, v.prep);
  return <span dir="ltr" className="font-sans">{p ? <><TapText text={p[0]} onTap={onTap} />{p[0] && !p[0].endsWith(' ') ? ' ' : ''}<b className="text-[#1f5fbf] dark:text-[#7fb0ff] underline decoration-2"><TapText text={p[1]} onTap={onTap} /></b><TapText text={p[2]} onTap={onTap} /></> : <TapText text={v.ex} onTap={onTap} />}</span>;
};

export const VerbPrep: React.FC<{ onShowToast: (m: string, e?: boolean) => void; onQuickAddWord?: (w: Partial<Word>) => boolean; initialTab?: 'learn' | 'practice' | 'add'; showTabBar?: boolean }> = ({ onShowToast, onQuickAddWord, initialTab, showTabBar }) => {
  const [tab, setTab] = useState<'learn' | 'practice' | 'add'>(initialTab || 'practice');
  // اگر از بیرون (نوار تب‌های دستهٔ گرامر) تب عوض شد، هم‌گام بمان
  useEffect(() => { if (initialTab) setTab(initialTab); }, [initialTab]);
  const [custom, setCustom] = useState<VP[]>(() => load<VP[]>(CUSTOM_KEY, []));
  const [stats, setStats] = useState<Record<string, St>>(() => load(STATS_KEY, {}));
  const all = useMemo(() => [...VERB_PREPS, ...custom], [custom]);
  const [fPrep, setFPrep] = useState('');
  const [fLvl, setFLvl] = useState<string>(() => load<string>('wb_vprep_lvl', ''));
  const setLvl = (x: string) => { setFLvl(x); save('wb_vprep_lvl', x); };
  const [addLvl, setAddLvl] = useState('B1');
  // practice session
  const [count, setCount] = useState(10);
  const [sess, setSess] = useState<null | { q: string[]; i: number; ok: number; bad: number; again: Set<string>; goodIds: string[]; badIds: string[] }>(null);
  const [phase, setPhase] = useState<'prep' | 'case' | 'res'>('prep');
  const [pick, setPick] = useState(''); const [typed, setTyped] = useState('');
  const [kase, setKase] = useState<'' | 'A' | 'D'>(''); const [good, setGood] = useState<boolean | null>(null);
  // add
  const [f, setF] = useState({ verb: '', prep: 'an', kase: 'A', fa: '', ex: '' });
  const [bulk, setBulk] = useState(''); const [aiPrep, setAiPrep] = useState('an'); const [aiBusy, setAiBusy] = useState(false);
  // هوش مصنوعی Pro: توضیح معلم، لمس واژه، چت
  const [aiExpl, setAiExpl] = useState<Record<string, string>>({});
  const [whyBusy, setWhyBusy] = useState<string | null>(null);
  const [wordCard, setWordCard] = useState<{ word: string; sent: string; info: WInfo | null; loading: boolean } | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [chats, setChats] = useState<Record<string, ChatMsg[]>>({});
  const [chatDraft, setChatDraft] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const chatEndRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => new Map(all.map(v => [v.id, v])), [all]);
  const learned = all.filter(v => (stats[v.id]?.box || 0) >= 3).length;
  const pool = all.filter(v => (!fPrep || v.prep === fPrep) && (!fLvl || levelOf(v) === fLvl));
  const aiOn = useMemo(() => aiReadyFn(), [tab, sess, wordCard, chatId, aiBusy, whyBusy]);

  useEffect(() => { if (chatId !== null) setTimeout(() => chatEndRef.current?.scrollIntoView({ block: 'end' }), 120); }, [chatId, chats]);

  const start = () => {
    const now = Date.now();
    const dueList = pool.filter(v => stats[v.id] && stats[v.id].due <= now).sort((a, b) => stats[a.id].box - stats[b.id].box);
    const fresh = shuffle(pool.filter(v => !stats[v.id]));
    const later = pool.filter(v => stats[v.id] && stats[v.id].due > now).sort((a, b) => stats[a.id].due - stats[b.id].due);
    const q = [...dueList, ...fresh, ...later].slice(0, count).map(v => v.id);
    if (!q.length) { onShowToast('فعلی برای تمرین نیست.', true); return; }
    setSess({ q: shuffle(q), i: 0, ok: 0, bad: 0, again: new Set(), goodIds: [], badIds: [] }); resetQ();
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
    setSess({ ...sess, ok: sess.ok + (ok ? 1 : 0), bad: sess.bad + (ok ? 0 : 1), goodIds: ok ? [...sess.goodIds, cur.id] : sess.goodIds, badIds: ok ? sess.badIds : [...sess.badIds, cur.id] });
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
    } catch (e) { onShowToast(describeAiError(e), true); }
    finally { setAiBusy(false); }
  };

  /* ── چرا؟ توضیح معلم برای پاسخ نادرست (سه‌لایه در یک پاسخ کوتاه) ── */
  const askWhy = async (v: VP, pickP: string, kaseK: '' | 'A' | 'D') => {
    if (aiExpl[v.id] || whyBusy) return;
    if (!aiReadyFn()) { onShowToast('هوش مصنوعی در تنظیمات برنامه فعال نیست — از صفحهٔ تنظیمات فعالش کن.', true); return; }
    setWhyBusy(v.id);
    const prompt = `تو معلم آلمانی برای فارسی‌زبانان هستی. در تمرین «فعل + حرف اضافه» دانش‌آموز برای فعل «${v.verb} ___» حرف اضافهٔ «${pickP || '___'}» و حالت «${kaseK ? kName(kaseK) : '—'}» را انتخاب کرده؛ پاسخ درست: «${v.verb} ${v.prep} + ${kName(v.kase)}». جملهٔ مثال: «${v.ex}» (معنی: ${v.fa}).
در حداکثر ۴ جملهٔ فارسی توضیح بده:
۱) چرا حرف اضافهٔ «${v.prep}» با این فعل می‌آید؛
۲) چرا حالت «${kName(v.kase)}» است — با منطق پرسش ${woForm(v.prep)}? / پاسخ ${daForm(v.prep)}?;
۳) اگر مفید است یک مثال کوتاه آلمانی دیگر با ترجمه.
بدون Markdown و بدون سرصفحه؛ فقط متن پاسخ.`;
    try {
      const out = await generateText(prompt, { timeoutMs: 45000, retries: 1 });
      setAiExpl(m => ({ ...m, [v.id]: out.trim() }));
    } catch (e) { onShowToast(describeAiError(e), true); }
    finally { setWhyBusy(null); }
  };

  /* ── لمس واژه: ترجمه با هوش مصنوعی برنامه ── */
  const tapWord = async (w: string, sent: string) => {
    setWordCard({ word: w, sent, info: null, loading: true });
    if (!aiReadyFn()) { setWordCard(c => (c && c.word === w ? { ...c, loading: false } : c)); return; }
    const prompt = `تو واژه‌نامهٔ آلمانی↔فارسی هستی. برای کلمهٔ «${w}» در جملهٔ «${sent || '—'}» (سطح ${fLvl || 'B1'}) خروجی بده:
"fa": ترجمهٔ فارسی دقیق در همین بافت؛ "pos": اسم/فعل/صفت/قید/حرف اضافه؛ "art": der/die/das اگر اسم وگرنه رشتهٔ خالی؛ "ex": یک مثال کوتاه آلمانی دیگر با همین کلمه؛ "exFa": ترجمهٔ فارسی مثال.
فقط JSON معتبر، بدون Markdown: {"fa":"...","pos":"...","art":"","ex":"...","exFa":"..."}`;
    try {
      const j = parseJSONLoose<WInfo>(await generateText(prompt, { json: true, timeoutMs: 25000, retries: 1 }));
      setWordCard(c => (c && c.word === w ? { ...c, info: j, loading: false } : c));
    } catch (e) {
      setWordCard(c => (c && c.word === w ? { ...c, info: { fa: '⚠ ' + describeAiError(e) }, loading: false } : c));
    }
  };

  /* ── چت با معلم دربارهٔ یک فعل + حرف اضافه ── */
  const sendChat = async (override?: string) => {
    if (!chatId || chatBusy) return;
    const q0 = (override || chatDraft).trim();
    if (!q0) return;
    if (!aiReadyFn()) { onShowToast('هوش مصنوعی در تنظیمات برنامه فعال نیست.', true); return; }
    const v = byId.get(chatId);
    if (!v) return;
    const hist = chats[chatId] || [];
    setChats(c => ({ ...c, [chatId]: [...(c[chatId] || []), { role: 'user', text: q0 }] }));
    setChatDraft('');
    setChatBusy(true);
    try {
      const sys = `تو معلم صبور آلمانی برای فارسی‌زبانان هستی؛ در تمرین «فعل + حرف اضافه (Verben mit Präpositionen)».
فعل مورد بحث: «${v.verb} ${v.prep} + ${kName(v.kase)}» (${v.fa}) — مثال: «${v.ex}» — سطح: ${levelOf(v)}.
منطق پرسش/پاسخ: ${woForm(v.prep)}? → ${daForm(v.prep)}?
پاسخ‌ها: فارسی، کوتاه (۲–۵ جمله)، با مثال آلمانی وقتی کمک می‌کند.`;
      const convo = hist.map(m => (m.role === 'user' ? 'دانش‌آموز: ' : 'معلم: ') + m.text).join('\n');
      const out = await generateText(`${sys}\n\n${convo ? 'گفتگوی تاکنون:\n' + convo + '\n\n' : ''}پرسش تازهٔ دانش‌آموز: ${q0}`, { timeoutMs: 60000, retries: 1 });
      setChats(c => ({ ...c, [chatId]: [...(c[chatId] || []), { role: 'ai', text: out.trim() }] }));
    } catch (e) {
      setChats(c => ({ ...c, [chatId]: [...(c[chatId] || []), { role: 'ai', text: '⚠️ ' + describeAiError(e) }] }));
    } finally { setChatBusy(false); setTimeout(() => chatEndRef.current?.scrollIntoView({ block: 'end' }), 100); }
  };

  const addWord = (w: string, info: WInfo) => {
    if (!onQuickAddWord) return;
    const de = info.art ? `${info.art} ${w}` : w;
    const okAdd = onQuickAddWord({ de, fa: info.fa, pos: info.pos || '', ex: info.ex || '', exFa: info.exFa || '' });
    if (okAdd) { setAdded(a => new Set(a).add(de)); onShowToast(`«${de}» به واژگان اضافه شد`); }
    else onShowToast('افزودن به واژگان ناموفق بود.', true);
  };

  const Tab = (id: typeof tab, label: string) => (
    <button key={id} onClick={() => setTab(id)} className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition ${tab === id ? 'bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white shadow' : 'bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a]'}`}>{label}</button>
  );
  const PrepSel = (v: string, set: (x: string) => void, all0?: string) => (
    <select value={v} onChange={e => set(e.target.value)} className={inp}>{all0 !== undefined && <option value="">{all0}</option>}{PREPS.map(p => <option key={p} value={p}>{p}</option>)}</select>
  );

  return (
    <div className="space-y-4 text-right max-w-3xl mx-auto">
      {showTabBar !== false && <div className="flex gap-2">{Tab('practice', '🎯 تمرین')}{Tab('learn', '📚 یادگیری')}{Tab('add', '➕ افزودن')}</div>}

      {/* وضعیت هوش مصنوعی — فقط نمایش؛ تنظیم در صفحهٔ تنظیمات برنامه */}
      <div className={`rounded-xl px-3 py-2 text-[11px] leading-5 border ${
        aiOn
          ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300'
          : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300'
      }`}>
        {aiOn
          ? <>🤖 متصل به هوش مصنوعی برنامه: <b dir="ltr">{aiLabel()}</b> — توضیح معلم، لمس واژه و چت فعال‌اند؛ کلید و مدل از تنظیمات برنامه.</>
          : <>🔌 هوش مصنوعی در تنظیمات برنامه فعال نشده — تمرین، یادگیری و افزودن دستی مثل قبل کار می‌کنند؛ فقط توضیح معلم، لمس واژه و چت غیرفعال‌اند.</>}
      </div>

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
                      <button onClick={() => setChatId(v.id)} className="text-base" aria-label="گفتگو با معلم">💬</button>
                      {stats[v.id] && stats[v.id].box >= 3 && <span className="text-[10px] text-emerald-600">✓ یاد گرفته</span>}
                    </div>
                    <div className="text-sm">{v.fa}</div>
                    <div className="text-sm leading-7"><Ex v={v} onTap={w => tapWord(w, v.ex)} /></div>
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
          <p className="text-[12px] leading-6 text-[#5d6676] dark:text-[#a3adbd]">هر سؤال دو قدم دارد: ۱) حرف اضافهٔ درست، ۲) حالت دستوری (Akk یا Dat). اول چهارگزینه‌ای است؛ وقتی فعل را بهتر بلد شدی باید خودت تایپ کنی. فعل‌های غلط دوباره در همین جلسه می‌آیند و به «دفتر خطاها» هم می‌روند. 💡 در جملهٔ نتیجه هر کلمه را لمس کن یا دکمهٔ «چرا؟» را بزن تا معلم توضیح بدهد.</p>
          <div className="grid grid-cols-3 gap-2">
            <select value={fLvl} onChange={e => setLvl(e.target.value)} className={inp}><option value="">همهٔ سطوح</option>{LEVELS.map(l => <option key={l} value={l}>{l}</option>)}</select>
            {PrepSel(fPrep, setFPrep, 'همهٔ حرف‌ها')}
            <select value={count} onChange={e => setCount(Number(e.target.value))} className={inp}>{[10, 20, 30].map(n => <option key={n} value={n}>{n} سؤال</option>)}</select>
          </div>
          <button onClick={start} className="w-full h-12 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white font-bold text-sm">▶️ شروع تمرین</button>
        </div>
      )}

      {tab === 'practice' && sess && sess.i >= sess.q.length && (() => {
        const wrong = [...new Set(sess.badIds)];
        const right = [...new Set(sess.goodIds)].filter(id => !wrong.includes(id));
        const Col = (title: string, ids: string[], cls: string) => (
          <div className="space-y-1.5">
            <div className={`text-xs font-extrabold text-center py-1.5 rounded-lg ${cls}`}>{title} ({ids.length})</div>
            {ids.length === 0 && <div className="text-center text-xs text-[#5d6676]">—</div>}
            {ids.map(id => { const v = byId.get(id); if (!v) return null; return (
              <div key={id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-2 text-sm">
                <div dir="ltr" className="font-sans"><b>{v.verb}</b> <u className="text-[#1f5fbf] dark:text-[#7fb0ff] font-bold">{v.prep}</u></div>
                <div className="flex items-center gap-1.5 mt-0.5"><span className={`text-[10px] font-bold px-1.5 rounded-full ${kCol(v.kase)}`}>{kName(v.kase)}</span><span className="text-xs text-[#5d6676] dark:text-[#a3adbd] truncate">{v.fa}</span></div>
              </div>
            ); })}
          </div>
        );
        return (
          <div className={card}>
            <div className="text-center"><div className="text-4xl">🎉</div><div className="font-extrabold">جلسه تمام شد</div>
              <div className="text-sm mt-1">درست: <b className="text-emerald-600">{sess.ok}</b> — غلط: <b className="text-rose-600">{sess.bad}</b></div></div>
            <div className="grid grid-cols-2 gap-2.5 items-start">
              {Col('✅ درست‌ها', right, 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300')}
              {Col('❌ غلط‌ها', wrong, 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300')}
            </div>
            <div className="grid grid-cols-2 gap-2"><button onClick={start} className="h-11 rounded-xl bg-[#1f5fbf] text-white font-bold text-sm">جلسهٔ بعد</button><button onClick={() => setSess(null)} className="h-11 rounded-xl border border-slate-300 dark:border-slate-600 font-bold text-sm">بازگشت</button></div>
          </div>
        );
      })()}

      {tab === 'practice' && sess && cur && sess.i < sess.q.length && (
        <div className="space-y-3">
          <div className="flex justify-between text-xs font-bold text-[#5d6676] dark:text-[#a3adbd]"><span>{sess.i + 1} / {sess.q.length}</span><button onClick={() => setSess(null)} className="text-red-600">✕ پایان</button></div>
          <div className={card}>
            <div className="text-center space-y-1">
              <div dir="ltr" className="text-2xl font-extrabold font-sans">{cur.verb} <span className="text-slate-400">___</span></div>
              <div className="text-sm text-[#5d6676] dark:text-[#a3adbd]">{cur.fa}</div>
            </div>
            <div dir="ltr" className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-base font-sans leading-8 text-center">{phase === 'res' ? <Ex v={cur} onTap={w => tapWord(w, cur.ex)} /> : blankEx(cur.ex, cur.prep)}</div>

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

                {/* توضیح معلم برای پاسخ نادرست */}
                {!good && (
                  <div className="space-y-1.5">
                    {(aiExpl[cur.id] || whyBusy === cur.id) ? (
                      <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-[#dde1ea] dark:border-[#333b4a] px-3 py-2 text-[12px] leading-6 text-[#1f2a3d] dark:text-[#e7ecf5] whitespace-pre-wrap">
                        {whyBusy === cur.id ? '🤖 معلم در حال توضیح…' : aiExpl[cur.id]}
                      </div>
                    ) : (
                      <button onClick={() => askWhy(cur, pick, kase)} disabled={whyBusy !== null} className="w-full h-10 rounded-xl border border-[#1f5fbf]/40 text-[#1f5fbf] dark:text-[#7fb0ff] text-xs font-bold disabled:opacity-50">
                        🤖 چرا؟ توضیح معلم
                      </button>
                    )}
                  </div>
                )}

                <div dir="ltr" className="text-xs text-[#5d6676] dark:text-[#a3adbd] text-center">Frage: <b>{woForm(cur.prep)}</b> …? — Antwort: <b>{daForm(cur.prep)}</b> …</div>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => speak(cur.ex)} className="h-11 rounded-xl border border-slate-300 dark:border-slate-600 font-bold text-sm">🔊 بشنو</button>
                  <button onClick={() => setChatId(cur.id)} className="h-11 rounded-xl border border-[#1f5fbf]/40 text-[#1f5fbf] dark:text-[#7fb0ff] font-bold text-sm">💬 معلم{(chats[cur.id] || []).length ? ` (${(chats[cur.id] || []).length})` : ''}</button>
                  <button onClick={next} className="h-11 rounded-xl bg-[#1f5fbf] text-white font-bold text-sm">بعدی ←</button>
                </div>
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

      {/* کارت واژه (لمس کلمه) */}
      {wordCard && createPortal(
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/40 px-4" onClick={() => setWordCard(null)}>
          <div dir="rtl" className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#1b2029] shadow-2xl border border-[#dde1ea] dark:border-[#333b4a] p-4" onClick={e => e.stopPropagation()}>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div dir="ltr" className="text-lg font-extrabold text-[#1f2a3d] dark:text-[#e7ecf5]">{wordCard.word}</div>
                <div className="flex gap-1.5">
                  <button onClick={() => speak(wordCard.word)} className="px-2 py-1 rounded-lg border border-[#dde1ea] dark:border-[#333b4a] text-xs">🔊</button>
                  <button onClick={() => setWordCard(null)} className="px-2 py-1 rounded-lg text-xs font-bold text-[#5d6676] dark:text-[#a3adbd]">✕</button>
                </div>
              </div>
              {wordCard.loading && <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">🤖 در حال ترجمه…</p>}
              {!wordCard.loading && !wordCard.info && <p className="text-[11px] text-[#5d6676] dark:text-[#a3adbd]">برای ترجمهٔ خودکار، هوش مصنوعی را در تنظیمات برنامه فعال کن.</p>}
              {wordCard.info && (
                <>
                  {wordCard.info.art && <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#6b4fd8]/10 text-[#6b4fd8]" dir="ltr">{wordCard.info.art}</span>}
                  {wordCard.info.pos && <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-[#5d6676] dark:text-[#a3adbd] ml-1">{wordCard.info.pos}</span>}
                  <p className="text-sm font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">{wordCard.info.fa}</p>
                  {wordCard.info.ex && (
                    <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-2.5 py-2">
                      <p dir="ltr" className="text-left text-xs font-bold text-[#1f2a3d] dark:text-[#e7ecf5]">{wordCard.info.ex}</p>
                      {wordCard.info.exFa && <p className="text-[11px] text-[#5d6676] dark:text-[#a3adbd] mt-0.5">{wordCard.info.exFa}</p>}
                    </div>
                  )}
                  {onQuickAddWord && (
                    <button
                      onClick={() => addWord(wordCard.word, wordCard.info!)}
                      disabled={added.has(wordCard.info.art ? `${wordCard.info.art} ${wordCard.word}` : wordCard.word)}
                      className="w-full py-2 rounded-lg text-xs font-bold bg-emerald-600 text-white disabled:opacity-50"
                    >
                      {added.has(wordCard.info.art ? `${wordCard.info.art} ${wordCard.word}` : wordCard.word) ? '✓ به واژگان اضافه شد' : '＋ افزودن به واژگان'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* چت با معلم */}
      {chatId !== null && createPortal(
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40" onClick={() => setChatId(null)}>
          <div dir="rtl" className="w-full sm:max-w-md bg-white dark:bg-[#1b2029] rounded-t-2xl sm:rounded-2xl shadow-2xl border border-[#dde1ea] dark:border-[#333b4a] max-h-[78vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {(() => {
              const v = byId.get(chatId);
              if (!v) return null;
              const msgs = chats[chatId] || [];
              return (
                <>
                  <div className="px-4 py-2.5 border-b border-[#dde1ea] dark:border-[#333b4a] flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold text-[#1f2a3d] dark:text-[#e7ecf5]">💬 معلم — <span dir="ltr">{v.verb} {v.prep}</span> + {kName(v.kase)}</p>
                      <p className="text-[10px] text-[#5d6676] dark:text-[#a3adbd] truncate">{v.fa}</p>
                    </div>
                    <button onClick={() => setChatId(null)} className="px-2 py-1 rounded-lg text-xs font-bold text-[#5d6676] dark:text-[#a3adbd] shrink-0">✕</button>
                  </div>
                  <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-[180px]">
                    {msgs.length === 0 && <p className="text-[11px] text-[#5d6676] dark:text-[#a3adbd] py-3 text-center">دربارهٔ همین فعل بپرس: «چرا این حرف اضافه؟»، «فرق Akk و Dat؟»، …</p>}
                    {msgs.map((m, i) => (
                      <div key={i} className={`max-w-[88%] rounded-2xl px-3 py-2 text-xs leading-6 whitespace-pre-wrap ${m.role === 'user' ? 'bg-[#1f5fbf] text-white ml-auto' : 'bg-slate-50 dark:bg-slate-800/60 text-[#1f2a3d] dark:text-[#e7ecf5] border border-[#dde1ea] dark:border-[#333b4a]'}`}>
                        {m.text}
                      </div>
                    ))}
                    {chatBusy && <p className="text-[11px] text-[#5d6676] dark:text-[#a3adbd]">معلم در حال نوشتن…</p>}
                    <div ref={chatEndRef} />
                  </div>
                  <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                    {QUICK_QS.map(q => (
                      <button key={q} onClick={() => sendChat(q)} disabled={chatBusy} className="px-2.5 py-1 rounded-full text-[10px] font-bold border border-[#dde1ea] dark:border-[#333b4a] text-[#5d6676] dark:text-[#a3adbd] disabled:opacity-50">
                        {q}
                      </button>
                    ))}
                  </div>
                  <div className="px-3 pb-3 flex gap-1.5">
                    <input
                      value={chatDraft}
                      onChange={e => setChatDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') sendChat(); }}
                      placeholder="پرسشت را بنویس…"
                      className="flex-1 border-2 border-[#dde1ea] dark:border-[#333b4a] rounded-lg px-3 py-2 text-xs bg-white dark:bg-[#141923] outline-none"
                    />
                    <button onClick={() => sendChat()} disabled={chatBusy || !chatDraft.trim()} className="px-4 rounded-lg text-xs font-extrabold text-white bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] disabled:opacity-50">فرستادن</button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
