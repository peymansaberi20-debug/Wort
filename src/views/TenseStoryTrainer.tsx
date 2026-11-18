/**
 * TenseStoryTrainer.tsx — تمرین «داستان همهٔ زمان‌ها»
 * مثل تمرین‌های کتاب درسی: متن داستانی با جاهای خالی و فعل داخل پرانتز؛
 * سطح A1–C2 + زمان (Präsens … Futur II یا ترکیبی) را انتخاب می‌کنید و تمرین ساخته می‌شود.
 * - هر کلمهٔ متن قابل لمس است: ترجمهٔ فارسی + تلفظ + مثال + افزودن به واژگان
 * - هر تمرین در localStorage ذخیره می‌شود تا بعداً دوباره تمرین کنید
 * - چاپ/PDF: صفحهٔ ۱ سؤالات، صفحهٔ ۲ پاسخنامه + توضیح گرامری هر مورد (سازگار با iOS)
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AppSettings, Word } from '../types';
import { speak } from '../utils/audio';
import { Band, Tense, BAND_INFO, TENSE_INFO } from './tenseStoryData';
import { STORIES, Story } from './tenseStoryBank';
import { parseBlanks, parseSegments, lookupWord, pickStory, explainBlank, isCorrect, Blank, Lookup, VERB_EX } from './tenseStoryHelpers';

const HKEY = 'wb_tstory_history_v1';

interface Attempt {
  id: string;
  ts: number;
  band: Band;
  tense: Tense;
  storyId: string;
  title: string;
  titleFa: string;
  total: number;
  correct: number;
  done: boolean;
}

const loadHist = (): Attempt[] => {
  try { const h = JSON.parse(localStorage.getItem(HKEY) || '[]'); return Array.isArray(h) ? h : []; } catch { return []; }
};
const saveHist = (h: Attempt[]) => { try { localStorage.setItem(HKEY, JSON.stringify(h.slice(0, 40))); } catch { /* ignore */ } };

const faDate = (ts: number): string => {
  try { return new Date(ts).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }); }
  catch { return new Date(ts).toLocaleDateString(); }
};

const TENSE_ORDER: Tense[] = ['prs', 'prt', 'perf', 'pq', 'f1', 'f2', 'mix'];
const WORD_RE = /[A-Za-zÄÖÜäöüß]+(?:-[A-Za-zÄÖÜäöüß]+)*/g;

interface TenseStoryTrainerProps {
  settings?: AppSettings;
  onShowToast: (msg: string, isErr?: boolean) => void;
  onQuickAddWord?: (w: Partial<Word>) => boolean;
  onClose?: () => void;
}

export const TenseStoryTrainer: React.FC<TenseStoryTrainerProps> = ({ settings, onShowToast, onQuickAddWord, onClose }) => {
  const [band, setBand] = useState<Band>('A');
  const [ts, setTs] = useState<Tense>('prs');
  const [story, setStory] = useState<Story | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [results, setResults] = useState<Record<number, { ok: boolean; given: string; revealed: boolean; tries: number }>>({});
  const [openBlank, setOpenBlank] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [history, setHistory] = useState<Attempt[]>(loadHist);
  const [histOpen, setHistOpen] = useState(false);
  const [dictWord, setDictWord] = useState<{ word: string; lk: Lookup } | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const attemptIdRef = useRef<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  const blanks = useMemo(() => (story ? parseBlanks(story) : []), [story]);
  const sentences = useMemo(() => {
    // متن را به جمله‌ها می‌شکنیم تا برگهٔ چاپ و کارت هر جای خالی جملهٔ خودش را داشته باشد
    if (!story) return [];
    const parts = story.text.split(/(?<=[.!?"“])\s+/);
    return parts.filter(Boolean);
  }, [story]);

  useEffect(() => { if (openBlank !== null) setTimeout(() => inputRef.current?.focus(), 120); }, [openBlank]);

  const doSpeak = (text: string) => {
    try {
      speak(text, { rate: settings?.rate, vreg: settings?.vreg, voiceName: settings?.voice });
    } catch {
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'de-DE';
        speechSynthesis.speak(u);
      } catch { /* ignore */ }
    }
  };

  const upsertAttempt = (patch: Partial<Attempt> & { total: number; correct: number }, b?: Band, t?: Tense) => {
    const a: Attempt = {
      id: attemptIdRef.current || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ts: Date.now(), band: b || band, tense: t || ts,
      storyId: story?.id || '', title: story?.title || '', titleFa: story?.titleFa || '',
      ...patch
    };
    attemptIdRef.current = a.id;
    const rest = loadHist().filter(x => x.id !== a.id);
    const next = [a, ...rest];
    saveHist(next);
    setHistory(next);
  };

  const updateHistCorrect = (res: Record<number, { ok: boolean }>) => {
    try {
      const h = loadHist();
      const cur = h.find(x => x.id === attemptIdRef.current);
      if (cur) {
        cur.correct = Object.values(res).filter(r => r.ok).length;
        saveHist(h);
        setHistory(h);
      }
    } catch { /* ignore */ }
  };

  const startStory = (s: Story) => {
    setStory(s);
    setAnswers({});
    setResults({});
    setOpenBlank(null);
    setDone(false);
    setAdded(new Set());
    attemptIdRef.current = '';
    upsertAttempt({ storyId: s.id, title: s.title, titleFa: s.titleFa, total: parseBlanks(s).length, correct: 0, done: false }, s.band, s.ts);
  };

  const startNew = () => {
    const s = pickStory(band, ts);
    startStory(s);
  };

  const openFromHistory = (h: Attempt) => {
    const s = STORIES.find(x => x.id === h.storyId) || STORIES.find(x => x.band === h.band && x.ts === h.tense);
    if (!s) { onShowToast('این تمرین در بانک فعلی پیدا نشد.', true); return; }
    startStory(s);
    setTs(s.ts);
    setBand(s.band);
  };

  const removeFromHistory = (id: string) => {
    const next = loadHist().filter(x => x.id !== id);
    saveHist(next);
    setHistory(next);
  };

  const correctCount = useMemo(() => Object.values(results).filter(r => r.ok).length, [results]);

  const commitResult = (idx: number, ok: boolean, given: string, revealed = false) => {
    const nextResults = { ...results, [idx]: { ok, given, revealed, tries: (results[idx]?.tries || 0) + 1 } };
    setResults(nextResults);
    updateHistCorrect(nextResults);
  };

  const checkBlank = (idx: number) => {
    const b = blanks[idx];
    if (!b) return;
    const given = answers[idx] || '';
    if (!given.trim()) { onShowToast('اول پاسخ را تایپ کنید.', true); return; }
    const ok = isCorrect(given, b.ans);
    commitResult(idx, ok, given);
    if (ok) onShowToast('درست بود! ✓', false);
  };

  const checkAll = () => {
    const nextResults = { ...results };
    let changed = 0, ok = 0;
    blanks.forEach((b, i) => {
      const given = answers[i] || '';
      if (!given.trim() || results[i]?.ok) return;
      const good = isCorrect(given, b.ans);
      nextResults[i] = { ok: good, given, revealed: false, tries: (results[i]?.tries || 0) + 1 };
      changed++;
      if (good) ok++;
    });
    if (changed) {
      setResults(nextResults);
      updateHistCorrect(nextResults);
      onShowToast(`${ok} از ${changed} پاسخ درست بود.`, false);
    } else {
      onShowToast('جاهای خالی را اول پر کنید.', true);
    }
  };

  const finish = () => {
    const nextResults = { ...results };
    blanks.forEach((b, i) => {
      if (!nextResults[i] && answers[i] && isCorrect(answers[i], b.ans)) {
        nextResults[i] = { ok: true, given: answers[i], revealed: false, tries: 1 };
      }
    });
    const correct = Object.values(nextResults).filter(r => r.ok).length;
    setResults(nextResults);
    setDone(true);
    upsertAttempt({ total: blanks.length, correct, done: true }, story?.band, story?.ts);
  };

  const tapWord = (e: React.MouseEvent, token: string) => {
    e.stopPropagation();
    const lk = lookupWord(token);
    if (lk) setDictWord({ word: token, lk });
  };

  const addWord = () => {
    if (!dictWord) return;
    const { lk } = dictWord;
    const de = lk.inf || lk.de;
    if (!de) { onShowToast('برای این کلمه واژهٔ پایه ثبت نشده است.', true); return; }
    if (added.has(de)) { onShowToast('این واژه همین حالا اضافه شده بود.', false); return; }
    if (!onQuickAddWord) { onShowToast('افزودن واژه در این بخش متصل نشده است.', true); return; }
    const w: Partial<Word> = {
      de,
      fa: lk.fa,
      pos: lk.pos || 'noun'
    };
    if (lk.art) (w as any).art = lk.art;
    (w as any).lvl = BAND_INFO[band].lvl;
    const ok = onQuickAddWord(w);
    if (ok) {
      setAdded(prev => new Set(prev).add(de));
      onShowToast(`«${de}» به واژگان اضافه شد ✓`, false);
    } else {
      onShowToast('افزودن به واژگان انجام نشد.', true);
    }
  };

  // ────────── قطعه‌های رندر مشترک ──────────
  const renderGermanWords = (text: string, keyBase: string) => {
    const pieces = text.split(new RegExp(`(${WORD_RE.source})`, 'g'));
    return pieces.map((p, i) => {
      if (!p) return null;
      if (/^[A-Za-zÄÖÜäöüß-]+$/.test(p)) {
        return (
          <button
            key={`${keyBase}-w${i}`}
            onClick={e => tapWord(e, p)}
            className="hover:bg-[#1f5fbf]/10 dark:hover:bg-[#7fb0ff]/15 rounded px-0.5 transition-colors"
            title="ترجمهٔ فارسی"
          >
            {p}
          </button>
        );
      }
      return <span key={`${keyBase}-p${i}`}>{p}</span>;
    });
  };

  const blankChip = (b: Blank, idx: number, compact: boolean, key: string) => {
    const r = results[idx];
    const chipCls =
      r?.ok
        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 text-emerald-700 dark:text-emerald-300'
        : r && !r.ok
          ? 'bg-red-50 dark:bg-red-950/40 border-red-400 text-red-700 dark:text-red-300'
          : 'bg-white dark:bg-[#141923] border-[#1f5fbf]/50 dark:border-[#7fb0ff]/50 text-[#1f5fbf] dark:text-[#7fb0ff]';
    return (
      <button
        key={key}
        onClick={e => { e.stopPropagation(); setOpenBlank(idx); }}
        className={`inline-flex items-center gap-1 align-baseline border-b-2 border-dashed rounded-md px-1.5 py-0.5 mx-0.5 text-sm md:text-base font-bold font-sans transition ${chipCls}`}
        title="پاسخ به این جای خالی"
      >
        <sup className="text-[9px] font-normal opacity-70">{idx + 1}</sup>
        {r?.ok ? <span>{b.ans}</span> : r?.revealed ? b.ans : <span className="tracking-widest">____</span>}
        <span className="opacity-70 font-normal">({b.inf})</span>
      </button>
    );
  };

  // جملهٔ حاوی جای خالی (برای کارت پاسخ)
  const sentenceFor = (idx: number): React.ReactNode => {
    if (!story) return null;
    const segs = parseSegments(story);
    let sentStart = 0;
    let blankPos = -1;
    segs.forEach((sg, i) => {
      if (sg.t === 'blank' && sg.idx === idx) blankPos = i;
    });
    for (let i = blankPos - 1; i >= 0; i--) {
      const sg = segs[i];
      if (sg.t === 'txt' && /[.!?“"]\s*$/.test(sg.text.trim())) { sentStart = i + 1; break; }
      if (i === 0) { sentStart = 0; break; }
    }
    let sentEnd = segs.length;
    for (let i = blankPos + 1; i < segs.length; i++) {
      const sg = segs[i];
      if (sg.t === 'txt' && /[.!?“"]/.test(sg.text)) { sentEnd = i + 1; break; }
    }
    return segs.slice(sentStart, sentEnd).map((sg, i) => {
      if (sg.t === 'txt') return <span key={`c${i}`} dir="ltr">{renderGermanWords(sg.text, `ctx-${idx}-${i}`)}</span>;
      if (sg.idx === idx) return <span key={`c${i}`} className="font-extrabold text-[#1f5fbf] dark:text-[#7fb0ff]" dir="ltr">____ ({sg.blank.inf})</span>;
      return <span key={`c${i}`} dir="ltr">____ ({sg.blank.inf})</span>;
    });
  };

  const openBlankObj = openBlank !== null ? blanks[openBlank] : null;
  const openResult = openBlank !== null ? results[openBlank] : null;

  // ────────── برگهٔ چاپ (Portal به body — سازگار با iOS) ──────────
  const printRoot = story ? (
    <div className="tsp-print-root" dir="rtl">
      <style>{`
        .tsp-print-root { display: none; }
        @media print {
          body > *:not(.tsp-print-root) { display: none !important; }
          .tsp-print-root { display: block !important; position: static !important; }
          .tsp-print-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .tsp-pagebreak { break-before: page; page-break-before: always; }
          @page { size: A4; margin: 14mm 13mm; }
        }
      `}</style>

      {/* صفحهٔ ۱: سؤالات */}
      <div style={{ direction: 'rtl', fontFamily: 'inherit' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '2px solid #1f5fbf', paddingBottom: 6 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800 }}>تمرین داستانِ زمان‌ها — {TENSE_INFO[story.ts].de} ({TENSE_INFO[story.ts].fa})</div>
            <div style={{ fontSize: 10, color: '#555' }}>سطح: {BAND_INFO[story.band].label} • تاریخ: {faDate(Date.now())}</div>
          </div>
          <div style={{ fontSize: 11, color: '#555' }}>امتیاز: … / {blanks.length}</div>
        </div>
        <p style={{ fontSize: 11, marginTop: 8, color: '#333' }}>
          Ergänzen Sie die Verben in der richtigen Form! — در هر جای خالی، شکل درست فعلِ داخل پرانتز را بنویسید.
        </p>
        <h2 dir="ltr" style={{ fontSize: 14, fontWeight: 800, margin: '10px 0 2px', textAlign: 'left' }}>{story.title}</h2>
        <div style={{ fontSize: 10, color: '#555', marginBottom: 6 }} dir="rtl">{story.titleFa}</div>
        <div dir="ltr" style={{ direction: 'ltr', textAlign: 'left', fontSize: 12.5, lineHeight: 2.1 }}>
          {parseSegments(story).map((sg, i) =>
            sg.t === 'txt'
              ? <span key={`p${i}`}>{sg.text}</span>
              : <span key={`p${i}`} style={{ whiteSpace: 'nowrap' }}><sup style={{ fontSize: 9 }}>({sg.idx + 1})</sup> __________ <b>({sg.blank.inf})</b> </span>
          )}
        </div>
      </div>

      {/* صفحهٔ ۲: پاسخنامه + توضیحات گرامری */}
      <div className="tsp-pagebreak" dir="rtl">
        <div style={{ borderBottom: '2px solid #1f5fbf', paddingBottom: 6, marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>پاسخنامه و توضیحات گرامری</div>
          <div style={{ fontSize: 10, color: '#555' }}>{story.title} — {story.titleFa}</div>
        </div>
        <ol style={{ margin: 0, paddingInlineStart: 18, listStyle: 'decimal' }}>
          {blanks.map((b, i) => (
            <li key={i} style={{ fontSize: 11, marginBottom: 8, breakInside: 'avoid' }}>
              <b style={{ fontSize: 12.5 }}>{b.ans}</b> <span style={{ color: '#555' }}>({b.inf})</span>
              <div dir="ltr" style={{ direction: 'ltr', textAlign: 'left', fontSize: 11, color: '#333', margin: '1px 0' }}>
                {sentenceForPlain(i)}
              </div>
              <div style={{ fontSize: 10, color: '#1f5fbf', lineHeight: 1.7 }}>{explainBlank(b, true)}</div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  ) : null;

  // نسخهٔ متنی جمله برای برگهٔ چاپ (بدون تعامل)
  function sentenceForPlain(idx: number): string {
    if (!story) return '';
    const segs = parseSegments(story);
    let blankPos = segs.findIndex(sg => sg.t === 'blank' && sg.idx === idx);
    if (blankPos < 0) return '';
    let start = 0;
    for (let i = blankPos - 1; i > 0; i--) {
      const sg = segs[i];
      if (sg.t === 'txt' && /[.!?“"]\s*$/.test(sg.text.trim())) { start = i + 1; break; }
      if (i === 1 && segs[0].t === 'txt') start = 1;
    }
    let end = segs.length;
    for (let i = blankPos + 1; i < segs.length; i++) {
      const sg = segs[i];
      if (sg.t === 'txt' && /[.!?“"]/.test(sg.text)) { end = i + 1; break; }
    }
    return segs.slice(start, end).map(sg => sg.t === 'txt' ? sg.text : `____ (${sg.blank.inf})`).join('').replace(/\s+/g, ' ').trim();
  }

  return (
    <div className="space-y-3 text-right">
      {/* ═══════════ پیکربندی ═══════════ */}
      {!story && (
        <div className="space-y-3">
          <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 space-y-3 shadow-xs">
            <p className="text-sm text-[#5d6676] dark:text-[#a3adbd] leading-6">
              مثل تمرین‌های کتاب: یک داستان کوتاه با جاهای خالی می‌گیرید؛ هر جای خالی فعلش داخل پرانتز است و شما شکل درست را می‌نویسید.
              روی هر کلمهٔ داستان هم بزنید تا معنی فارسی، تلفظ و مثال ببینید.
            </p>

            {/* سطح */}
            <div>
              <div className="text-xs font-bold text-[#5d6676] mb-1.5">۱. سطح زبانی</div>
              <div className="grid grid-cols-3 gap-2">
                {(['A', 'B', 'C'] as Band[]).map(b => (
                  <button
                    key={b}
                    onClick={() => setBand(b)}
                    className={`py-2.5 rounded-xl text-xs font-bold border transition ${
                      band === b
                        ? 'bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white border-transparent'
                        : 'bg-slate-50 dark:bg-[#141923] border-[#dde1ea] dark:border-[#333b4a]'
                    }`}
                  >
                    {BAND_INFO[b].label}
                  </button>
                ))}
              </div>
            </div>

            {/* زمان */}
            <div>
              <div className="text-xs font-bold text-[#5d6676] mb-1.5">۲. زمان گرامری</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {TENSE_ORDER.map(t => (
                  <button
                    key={t}
                    onClick={() => setTs(t)}
                    className={`py-2 rounded-xl text-xs font-bold border transition text-center ${
                      ts === t
                        ? 'bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white border-transparent'
                        : 'bg-slate-50 dark:bg-[#141923] border-[#dde1ea] dark:border-[#333b4a]'
                    }`}
                  >
                    <div>{TENSE_INFO[t].de}</div>
                    <div className="text-[10px] opacity-80 font-normal">{TENSE_INFO[t].fa}</div>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-[#5d6676] mt-2 leading-5">{TENSE_INFO[ts].expl}</p>
            </div>

            <button
              onClick={startNew}
              className="w-full bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white py-3 rounded-xl font-bold text-sm shadow-xs active:scale-[.99] transition"
            >
              ✨ ساخت تمرین جدید
            </button>
          </div>

          {/* تاریخچه */}
          <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 shadow-xs">
            <button onClick={() => setHistOpen(o => !o)} className="w-full flex items-center justify-between text-sm font-bold">
              <span>🗂 تمرین‌های ذخیره‌شده ({history.length})</span>
              <span className="text-[#5d6676]">{histOpen ? '▲' : '▼'}</span>
            </button>
            {histOpen && (
              <div className="mt-3 space-y-2">
                {history.length === 0 && <p className="text-xs text-[#5d6676] py-2">هنوز تمرینی ذخیره نشده است.</p>}
                {history.map(h => (
                  <div key={h.id} className="flex items-center justify-between gap-2 rounded-xl border border-[#dde1ea] dark:border-[#333b4a] p-2.5">
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">{h.titleFa || h.title}</div>
                      <div className="text-[10px] text-[#5d6676] flex flex-wrap gap-1.5 mt-1">
                        <span className="bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-0.5">{faDate(h.ts)}</span>
                        <span className="bg-blue-50 dark:bg-blue-950/40 text-[#1f5fbf] dark:text-[#7fb0ff] rounded px-1.5 py-0.5">{BAND_INFO[h.band].label}</span>
                        <span className="bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 rounded px-1.5 py-0.5">{TENSE_INFO[h.tense].de}</span>
                        <span className="bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-0.5">{h.correct}/{h.total} {h.done ? '✓' : '…'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => openFromHistory(h)}
                        title="تمرین دوباره"
                        aria-label="تمرین دوباره"
                        className="w-9 h-9 rounded-lg bg-[#1f5fbf] text-white flex items-center justify-center text-sm transition"
                      >
                        ▶
                      </button>
                      <button
                        onClick={() => removeFromHistory(h.id)}
                        title="حذف از تاریخچه"
                        aria-label="حذف از تاریخچه"
                        className="w-9 h-9 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 text-red-600 flex items-center justify-center text-sm transition"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                ))}
                {history.length > 0 && (
                  <button
                    onClick={() => { saveHist([]); setHistory([]); }}
                    className="text-[11px] text-red-500 px-2 py-1"
                  >
                    پاک کردن کل تاریخچه
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ در حال تمرین ═══════════ */}
      {story && !done && (
        <div className="space-y-3">
          <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between gap-2 text-xs mb-2">
              <div className="flex flex-wrap gap-1.5">
                <span className="bg-blue-50 dark:bg-blue-950/40 text-[#1f5fbf] dark:text-[#7fb0ff] rounded-full px-2 py-0.5 font-bold">{BAND_INFO[story.band].label}</span>
                <span className="bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 rounded-full px-2 py-0.5 font-bold">{TENSE_INFO[story.ts].de}</span>
              </div>
              <div className="text-[#5d6676]">✅ {correctCount}/{blanks.length}</div>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] transition-all" style={{ width: `${blanks.length ? (correctCount / blanks.length) * 100 : 0}%` }} />
            </div>

            <div className="flex items-baseline justify-between mt-3 gap-2">
              <h3 className="font-extrabold text-base md:text-lg" dir="ltr">{story.title}</h3>
              <button onClick={e => doSpeak(story.title)} className="text-lg" title="تلفظ عنوان">🔊</button>
            </div>
            <p className="text-[11px] text-[#5d6676] mb-2">{story.titleFa}</p>

            <p className="text-[11px] text-[#5d6676] mb-3 leading-5">
              روی جای خالی بزنید تا پاسخ بدهید؛ روی هر کلمهٔ داستان بزنید تا معنی، تلفظ و مثال ببینید.
            </p>

            <div dir="ltr" className="font-sans text-[15px] md:text-base leading-[2.2] text-slate-800 dark:text-slate-100" style={{ textAlign: 'left' }}>
              {parseSegments(story).map((sg, i) =>
                sg.t === 'txt'
                  ? <span key={`s${i}`}>{renderGermanWords(sg.text, `seg${i}`)}</span>
                  : blankChip(sg.blank, sg.idx, false, `s${i}`)
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button onClick={checkAll} className="bg-[#1f5fbf] text-white py-2.5 rounded-xl text-xs font-bold transition">بررسی همهٔ پاسخ‌ها</button>
            <button onClick={finish} className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white py-2.5 rounded-xl text-xs font-bold transition">پایان و دیدن نمره 🏁</button>
            <button onClick={() => window.print()} className="bg-slate-100 dark:bg-slate-800 py-2.5 rounded-xl text-xs font-bold transition">🖨 چاپ / PDF</button>
            <button onClick={() => { setStory(null); setOpenBlank(null); }} className="bg-slate-100 dark:bg-slate-800 py-2.5 rounded-xl text-xs font-bold transition">بازگشت به فهرست</button>
          </div>
        </div>
      )}

      {/* ═══════════ نتیجه ═══════════ */}
      {story && done && (
        <div className="space-y-3">
          <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-5 text-center shadow-xs">
            <div className="text-4xl">{correctCount === blanks.length ? '🏆' : correctCount >= blanks.length * 0.7 ? '🎉' : '💪'}</div>
            <div className="text-2xl font-extrabold mt-2">{correctCount} / {blanks.length}</div>
            <p className="text-xs text-[#5d6676] mt-1">
              {correctCount === blanks.length ? 'بی‌نقص! همهٔ جاهای خالی درست بود.' : 'پاسخ درست هر مورد با توضیح گرامری زیر آمده است.'}
            </p>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <button onClick={startNew} className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white py-2.5 rounded-xl text-xs font-bold">✨ تمرین جدید</button>
              <button onClick={() => startStory(story)} className="bg-[#1f5fbf] text-white py-2.5 rounded-xl text-xs font-bold">🔁 همان داستان، دوباره</button>
              <button onClick={() => window.print()} className="bg-slate-100 dark:bg-slate-800 py-2.5 rounded-xl text-xs font-bold">🖨 چاپ / PDF</button>
              <button onClick={() => { setStory(null); setDone(false); }} className="bg-slate-100 dark:bg-slate-800 py-2.5 rounded-xl text-xs font-bold">بازگشت به فهرست</button>
            </div>
          </div>

          <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 space-y-3 shadow-xs">
            {blanks.map((b, i) => {
              const r = results[i];
              return (
                <div key={i} className={`rounded-xl border p-3 ${r?.ok ? 'border-emerald-300 dark:border-emerald-800' : 'border-red-300 dark:border-red-800'}`}>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <b className="text-sm" dir="ltr">{i + 1}. {b.ans}</b>
                    <span className={r?.ok ? 'text-emerald-600' : 'text-red-500'}>{r?.ok ? '✓ درست' : r?.revealed ? '· نمایش پاسخ' : '✗ نادرست'}</span>
                  </div>
                  {!r?.ok && r?.given && <div className="text-[11px] text-red-500 mt-1" dir="ltr">پاسخ شما: {r.given}</div>}
                  <div className="text-xs text-[#5d6676] mt-1.5 leading-6" dir="rtl">{sentenceFor(i)}</div>
                  <div className="text-[11px] text-[#1f5fbf] dark:text-[#7fb0ff] mt-1.5 leading-5">{explainBlank(b, true)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════ کارت پاسخ جای خالی (Bottom-sheet موبایل) ═══════════ */}
      {openBlank !== null && openBlankObj && (
        <div
          className="fixed inset-0 z-[85] bg-black/50 backdrop-blur-sm flex items-end sm:items-center sm:justify-center"
          onClick={e => { if (e.target === e.currentTarget) setOpenBlank(null); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full sm:max-w-md bg-white dark:bg-[#1b2029] rounded-t-3xl sm:rounded-3xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl space-y-3"
            style={{ maxHeight: '86vh', overflowY: 'auto' }}
          >
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-[#5d6676]">جای خالی {openBlank + 1} از {blanks.length} • {TENSE_INFO[openBlankObj.tense].de}</div>
              <button onClick={() => setOpenBlank(null)} className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-sm">✕</button>
            </div>

            <div className="text-sm leading-7 bg-slate-50 dark:bg-[#141923] rounded-xl p-3" dir="rtl">
              {sentenceFor(openBlank)}
            </div>

            <div className="flex items-center gap-2" dir="ltr">
              <input
                ref={inputRef}
                type="text"
                value={answers[openBlank] || ''}
                onChange={e => setAnswers(prev => ({ ...prev, [openBlank]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') checkBlank(openBlank); }}
                disabled={!!openResult?.ok}
                placeholder={`${openBlankObj.kind === 'aux' ? 'فعل کمکی' : openBlankObj.kind === 'pp' ? 'Partizip II' : 'شکل فعل'}…`}
                className={`flex-1 min-w-0 border-2 rounded-xl px-3 py-2.5 font-bold text-base font-sans outline-none text-left ${
                  openResult?.ok
                    ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30'
                    : openResult && !openResult.ok
                      ? 'border-red-400 bg-red-50 dark:bg-red-950/30'
                      : 'border-[#1f5fbf] dark:border-[#7fb0ff] bg-white dark:bg-[#141923]'
                }`}
              />
              <button
                onClick={() => doSpeak(openBlankObj.ans)}
                title="تلفظ پاسخ درست"
                className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-lg flex-shrink-0"
              >
                🔊
              </button>
            </div>

            {!openResult?.ok && (
              <button
                onClick={() => checkBlank(openBlank)}
                className="w-full bg-[#1f5fbf] text-white py-2.5 rounded-xl text-sm font-bold transition"
              >
                بررسی پاسخ
              </button>
            )}

            {openResult && !openResult.ok && openResult.tries >= 2 && !openResult.revealed && (
              <button
                onClick={() => { setAnswers(prev => ({ ...prev, [openBlank]: openBlankObj.ans })); commitResult(openBlank, false, openBlankObj.ans, true); }}
                className="w-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 py-2.5 rounded-xl text-xs font-bold border border-amber-200 dark:border-amber-800"
              >
                نمایش پاسخ درست
              </button>
            )}

            {openResult && (
              <div className={`rounded-xl border p-3 text-xs leading-6 ${
                openResult.ok
                  ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/20'
                  : 'border-red-300 dark:border-red-800 bg-red-50/60 dark:bg-red-950/20'
              }`}>
                <div className="font-bold mb-1">{openResult.ok ? '✓ درست بود!' : openResult.revealed ? 'پاسخ درست نمایش داده شد.' : '✗ درست نیست، دوباره تلاش کنید.'}</div>
                <div className="text-[#1f5fbf] dark:text-[#7fb0ff]">{explainBlank(openBlankObj, true)}</div>
              </div>
            )}

            {!openResult?.ok && (
              <p className="text-[10px] text-[#5d6676] text-center">پس از پاسخ درست، توضیح گرامری همین‌جا نمایش داده می‌شود.</p>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ کارت واژه (دیکشنری تمرین) ═══════════ */}
      {dictWord && (
        <div
          className="fixed inset-0 z-[86] bg-black/50 backdrop-blur-sm flex items-end sm:items-center sm:justify-center"
          onClick={e => { if (e.target === e.currentTarget) setDictWord(null); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full sm:max-w-sm bg-white dark:bg-[#1b2029] rounded-t-3xl sm:rounded-3xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xl font-extrabold font-sans" dir="ltr">{dictWord.word}</div>
                {dictWord.lk.inf && (
                  <div className="text-[11px] text-[#5d6676] mt-0.5" dir="ltr">
                    {dictWord.lk.inf} {dictWord.lk.aux ? `• Perfekt mit ${dictWord.lk.aux}` : ''}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={() => doSpeak(dictWord.lk.inf || dictWord.word)} className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-base" title="تلفظ">🔊</button>
                <button onClick={() => setDictWord(null)} className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-sm">✕</button>
              </div>
            </div>

            <div className="text-sm font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">{dictWord.lk.fa}</div>

            {(dictWord.lk.ex || (dictWord.lk.inf && VERB_EX[dictWord.lk.inf])) && (
              <div className="bg-slate-50 dark:bg-[#141923] rounded-xl p-3 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2" dir="ltr">
                  <span className="font-sans font-bold">{dictWord.lk.ex || (dictWord.lk.inf && VERB_EX[dictWord.lk.inf]?.ex)}</span>
                  <button onClick={() => doSpeak(dictWord.lk.ex || (dictWord.lk.inf && VERB_EX[dictWord.lk.inf]?.ex) || '')} className="text-sm flex-shrink-0">🔊</button>
                </div>
                <div className="text-[#5d6676]" dir="rtl">
                  {dictWord.lk.exFa || (dictWord.lk.inf && VERB_EX[dictWord.lk.inf]?.exFa)}
                </div>
              </div>
            )}

            <button
              onClick={addWord}
              disabled={!dictWord.lk.de && !dictWord.lk.inf}
              className="w-full bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-bold transition"
            >
              ➕ افزودن به واژگان{added.has(dictWord.lk.inf || dictWord.lk.de || '') ? ' (اضافه شده ✓)' : ''}
            </button>
          </div>
        </div>
      )}

      {/* برگهٔ چاپ */}
      {printRoot && createPortal(printRoot, document.body)}
    </div>
  );
};
