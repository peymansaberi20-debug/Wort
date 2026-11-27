/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * ComprehensiveExam.tsx — آزمون جامع چندبخشی (درخواست کاربر ۱۳)
 *
 * یک آزمون جامع که از تمرین‌های موجود برنامه ساخته می‌شود:
 *   ۱) جای‌خالی واژه (cloze) — از مثال‌های واژگان کاربر
 *   ۲) حالت و حرف اضافه (case) — از CASEQ/EXTRA_CASEQ
 *   ۳) فعل + حرف اضافه (vprep) — از دیتاست allVerbPreps
 *   ۴) صرف صفت (adjdecl) — از صفت‌های واژگان کاربر + randomSpec/buildAdjItem
 *   ۵) آرتیکل (art) — از اسم‌های واژگان کاربر
 *
 * - تب «آزمون جامع» بعد از تب Lesen در MAIN_TABS اضافه می‌شود.
 * - انتخاب فقط نوع آزمون + سطح + دکمهٔ «بدون کمک».
 * - ذخیره در localStorage + آرشیو + امکان «آزمون دوباره».
 * - چاپ با پاسخنامه (PrintPreview مشترک همهٔ تمرین‌ها).
 * - حالت strict (بدون کمک): هیچ ترجمهٔ فارسی، تایمر واقعی، پاپ‌آپ واژه غیرفعال.
 *
 * قرمز: هیچ قابلیت دیگری حذف نشده — فقط یک تمرین جدید اضافه شده.
 */
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Word, CaseQuestion } from '../types';
import { CASEQ } from '../data/seed';
import { EXTRA_CASEQ, buildAdjItem, randomSpec, adjSources, parseSpec, specToString, type AdjItem } from '../utils/grammar';
import { allVerbPreps, levelOf, splitEx, baseVerb, VP } from '../data/verbPrep';
import { isVerbPos, isNounPos, isAdjPos } from '../utils/storage';
import { PrintPreview, prG, prFa, toFa, LevelChips, useConfirm } from './trainerUI';
import { IconBtn } from './IconBtn';
import { X, Printer, Eye, EyeOff, Timer as TimerIcon, RotateCcw, Flag } from 'lucide-react';

type Org = 'Goethe' | 'ÖSD' | 'telc' | 'EPD';

/** هر بخش آزمون: نوع + عنوان + تعداد + ثانیه‌تایمر */
interface SectionSpec { id: string; label: string; icon: string; count: number; minutes: number }
interface SectionResult { id: string; label: string; icon: string; score: number; max: number; minutes: number; items: ExamItem[] }
interface ExamItem {
  /** prompt: سؤال آلمانی (با جای خالی) */
  q: string;
  /** پاسخ درست */
  a: string;
  /** توضیح فارسی یا پاسخ‌نامهٔ扩展 */
  ex?: string;
  /** پاسخ کاربر (پس از ثبت) */
  user?: string;
  /** درست/غلط */
  ok?: boolean;
}
interface ExamRec {
  id: string;
  ts: number;
  date: string;
  org: Org;
  level: string;
  strict: boolean;
  sections: SectionResult[];
  avg: number;
  passed: boolean;
}

const ARCH_KEY = 'wb_comprehensive_exam_v1';

const ORGS: { id: Org; label: string }[] = [
  { id: 'Goethe', label: 'Goethe-Zertifikat' },
  { id: 'ÖSD', label: 'ÖSD' },
  { id: 'telc', label: 'telc Deutsch' },
  { id: 'EPD', label: 'EPD (دانشگاهی وین)' }
];

const shuffle = <T,>(a: T[]): T[] => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

const card = 'bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4';

const faDate = (ts: number): string => {
  try { return new Date(ts).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }); }
  catch { return new Date(ts).toLocaleDateString(); }
};

const loadArch = (): ExamRec[] => {
  try { const a = JSON.parse(localStorage.getItem(ARCH_KEY) || '[]'); return Array.isArray(a) ? a.filter((x: ExamRec) => x?.id) : []; }
  catch { return []; }
};
const saveArch = (a: ExamRec[]): void => { try { localStorage.setItem(ARCH_KEY, JSON.stringify(a.slice(0, 30))); } catch { /* ignore */ } };

interface Props {
  words: Word[];
  onShowToast: (m: string, isErr?: boolean) => void;
  onExit: () => void;
}

/* ───────────────────── ساخت سؤال‌های هر بخش ─────────────────────
 * هر generator یک تابع pure است که دادهٔ خام را به ExamItem تبدیل می‌کند. */

/** بخش ۱ — جای‌خالی واژه: از مثال‌های واژگان کاربر (با cloze/ans موجود) */
function genCloze(words: Word[], n: number, strict: boolean): ExamItem[] {
  const pool = words.filter(w => w.cloze && w.ans && (w.ex || w.ex2));
  if (!pool.length) return [];
  return shuffle(pool).slice(0, n).map(w => ({
    q: w.cloze,
    a: w.ans,
    ex: strict ? undefined : `ترجمهٔ فارسی: ${w.fa || '—'}`
  }));
}

/** بخش ۲ — حالت و حرف اضافه: از CASEQ + EXTRA_CASEQ */
function genCase(n: number, strict: boolean): ExamItem[] {
  const pool = [...CASEQ, ...EXTRA_CASEQ];
  if (!pool.length) return [];
  return shuffle(pool).slice(0, n).map((c: CaseQuestion) => ({
    q: c.s,
    a: c.ans,
    ex: strict ? undefined : `${c.c} — ${c.r}\nترجمه: ${c.fa}`
  }));
}

/** بخش ۳ — فعل + حرف اضافه: از allVerbPreps */
function genVPrep(n: number, level: string, strict: boolean): ExamItem[] {
  const all = allVerbPreps();
  // فیلتر سطح: فقط فعل‌های هم‌سطح یا پایین‌تر (سطح A1/A2 → A1–A2؛ B1 → همه تا B1؛ …)
  const lvlOrder = ['A1–A2', 'B1', 'B2', 'C1', 'C2'];
  const target = level === 'A1' || level === 'A2' ? 'A1–A2' : level;
  const tIdx = lvlOrder.indexOf(target);
  const pool = all.filter(v => {
    const vLvl = levelOf(v);
    const vIdx = lvlOrder.indexOf(vLvl);
    return vIdx >= 0 && vIdx <= tIdx;
  });
  if (!pool.length) return [];
  return shuffle(pool).slice(0, n).map((v: VP) => {
    const sp = splitEx(v.ex, v.prep);
    if (!sp) return {
      q: `${v.verb} _____ (${strict ? '' : (v.fa || '')})`,
      a: v.prep,
      ex: strict ? undefined : `ترجمه: ${v.fa}\nمثال: ${v.ex}`
    };
    return {
      q: sp[0] + '_____' + sp[2],
      a: v.prep,
      ex: strict ? undefined : `ترجمه: ${v.fa}\nحالت: ${v.kase}`
    };
  });
}

/** بخش ۴ — صرف صفت: از صفت‌های واژگان کاربر */
function genAdjDecl(words: Word[], n: number, level: string): ExamItem[] {
  const adjWords = words.filter(w => isAdjPos(w.pos) || (!w.pos && /^[a-zäöüß]+(?:er|en|el)$/i.test(w.de)));
  if (!adjWords.length) return [];
  const lvlNum = level === 'A1' || level === 'A2' ? 1 : level === 'B1' ? 1 : level === 'B2' ? 2 : 3;
  const items: ExamItem[] = [];
  const used = new Set<string>();
  for (let i = 0; i < n * 4 && items.length < n; i++) {
    const w = pick(adjWords);
    const srcs = adjSources(w, true);
    if (!srcs.length) continue;
    const src = pick(srcs);
    const spec = randomSpec(lvlNum);
    const item: AdjItem | null = buildAdjItem(src.base, spec);
    if (!item) continue;
    const key = specToString(spec) + '|' + src.base;
    if (used.has(key)) continue;
    used.add(key);
    items.push({
      q: item.sentence,
      a: item.answer,
      ex: `${item.caseLabel} — ${item.explanation}`
    });
  }
  return items;
}

/** بخش ۵ — آرتیکل: از اسم‌های واژگان کاربر */
function genArticle(words: Word[], n: number, strict: boolean): ExamItem[] {
  const nouns = words.filter(w => isNounPos(w.pos) || w.art);
  if (!nouns.length) return [];
  return shuffle(nouns).slice(0, n).map(w => ({
    q: `_____ ${w.de}`,
    a: w.art || '',
    ex: strict ? undefined : `ترجمه: ${w.fa || '—'}`
  }));
}

/* ───────────────────── Component ───────────────────── */

export const ComprehensiveExam: React.FC<Props> = ({ words, onShowToast, onExit }) => {
  const [phase, setPhase] = useState<'setup' | 'running' | 'between' | 'done'>('setup');
  const [org, setOrg] = useState<Org>('Goethe');
  const [level, setLevel] = useState('B1');
  const [strict, setStrict] = useState(false);
  const [sections, setSections] = useState<SectionResult[]>([]);
  const [secIdx, setSecIdx] = useState(0);
  const [itemIdx, setItemIdx] = useState(0);
  const [typed, setTyped] = useState('');
  const [revealedAns, setRevealedAns] = useState<Record<number, boolean>>({});
  const [timer, setTimer] = useState(0);
  const [paused, setPaused] = useState(false);
  const [arch, setArch] = useState<ExamRec[]>(loadArch);
  const [printOpen, setPrintOpen] = useState<ExamRec | null>(null);
  const { ask: askDel, dialog: delDialog } = useConfirm();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const levels = org === 'EPD' ? ['B2', 'C1', 'C2'] : ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

  // تولید سؤال‌ها در شروع آزمون
  const buildSections = (): SectionResult[] => {
    const isEPD = org === 'EPD';
    const isHigh = level === 'B2' || level === 'C1' || level === 'C2';
    const specs: SectionSpec[] = isEPD
      ? [
          { id: 'cloze', label: 'جای‌خالی واژه', icon: '✍️', count: 6, minutes: 12 },
          { id: 'case', label: 'حالت و حرف اضافه', icon: '🧩', count: 6, minutes: 12 },
          { id: 'vprep', label: 'فعل + حرف اضافه', icon: '🔗', count: 6, minutes: 10 },
          { id: 'adjdecl', label: 'صرف صفت', icon: '🧱', count: 6, minutes: 12 },
          { id: 'art', label: 'آرتیکل', icon: '🎨', count: 6, minutes: 8 }
        ]
      : isHigh
        ? [
            { id: 'cloze', label: 'جای‌خالی واژه', icon: '✍️', count: 6, minutes: 10 },
            { id: 'case', label: 'حالت و حرف اضافه', icon: '🧩', count: 5, minutes: 10 },
            { id: 'vprep', label: 'فعل + حرف اضافه', icon: '🔗', count: 6, minutes: 10 },
            { id: 'adjdecl', label: 'صرف صفت', icon: '🧱', count: 6, minutes: 10 },
            { id: 'art', label: 'آرتیکل', icon: '🎨', count: 4, minutes: 6 }
          ]
        : [
            { id: 'cloze', label: 'جای‌خالی واژه', icon: '✍️', count: 5, minutes: 8 },
            { id: 'case', label: 'حالت و حرف اضافه', icon: '🧩', count: 4, minutes: 8 },
            { id: 'vprep', label: 'فعل + حرف اضافه', icon: '🔗', count: 5, minutes: 8 },
            { id: 'adjdecl', label: 'صرف صفت', icon: '🧱', count: 4, minutes: 8 },
            { id: 'art', label: 'آرتیکل', icon: '🎨', count: 4, minutes: 5 }
          ];
    return specs.map(s => {
      let items: ExamItem[] = [];
      if (s.id === 'cloze') items = genCloze(words, s.count, strict);
      else if (s.id === 'case') items = genCase(s.count, strict);
      else if (s.id === 'vprep') items = genVPrep(s.count, level, strict);
      else if (s.id === 'adjdecl') items = genAdjDecl(words, s.count, level);
      else if (s.id === 'art') items = genArticle(words, s.count, strict);
      return { id: s.id, label: s.label, icon: s.icon, score: 0, max: items.length || 0, minutes: s.minutes, items };
    }).filter(s => s.items.length > 0);
  };

  const start = () => {
    const built = buildSections();
    if (!built.length) { onShowToast('برای این سطح/واژگان سؤالی ساخته نشد — واژگان بیشتری اضافه کن.', true); return; }
    setSections(built); setSecIdx(0); setItemIdx(0); setTyped(''); setRevealedAns({});
    setTimer(built[0].minutes * 60);
    setPhase('running');
  };

  // تایمر هر بخش
  useEffect(() => {
    if (phase !== 'running' || paused) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    timerRef.current = setInterval(() => {
      setTimer(t => {
        if (t <= 1) {
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
          // زمان تمام → بخش تمام شده
          finishSection();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, paused, secIdx]);

  // فوکوس روی input هنگام شروع هر سؤال
  useEffect(() => { if (phase === 'running' && inputRef.current) inputRef.current.focus(); }, [phase, itemIdx, secIdx]);

  const cur = sections[secIdx];
  const curItem = cur?.items[itemIdx];

  const checkAnswer = () => {
    if (!cur || !curItem) return;
    const userAns = typed.trim().toLowerCase();
    const correctAns = String(curItem.a || '').trim().toLowerCase();
    const ok = userAns === correctAns;
    cur.items[itemIdx] = { ...curItem, user: typed.trim(), ok };
    cur.score = cur.items.filter(i => i.ok).length;
    setSections([...sections]);
    if (itemIdx + 1 >= cur.items.length) {
      finishSection();
    } else {
      setItemIdx(itemIdx + 1); setTyped(''); setRevealedAns({});
    }
  };

  const finishSection = () => {
    if (secIdx + 1 >= sections.length) {
      // آزمون تمام شد
      const avg = Math.round(sections.reduce((a, s) => a + (s.max > 0 ? (s.score / s.max) * 100 : 0), 0) / sections.length);
      const rec: ExamRec = {
        id: 'ce_' + Date.now(),
        ts: Date.now(),
        date: new Date().toLocaleDateString('de-AT'),
        org, level, strict,
        sections: sections.map(s => ({ ...s })),
        avg,
        passed: avg >= 60
      };
      const list = [rec, ...arch].slice(0, 30);
      setArch(list); saveArch(list);
      setPhase('done');
    } else {
      setPhase('between');
    }
  };

  const nextSection = () => {
    const next = secIdx + 1;
    setSecIdx(next); setItemIdx(0); setTyped(''); setRevealedAns({});
    setTimer(sections[next].minutes * 60);
    setPhase('running');
  };

  const abort = () => {
    if (window.confirm('آزمون نیمه‌کاره رها شود؟ نتیجه‌ای ذخیره نمی‌شود.')) {
      if (timerRef.current) clearInterval(timerRef.current);
      setPhase('setup');
    }
  };

  const redo = (rec: ExamRec) => {
    // ساخت مجدد آزمون با همان تنظیمات
    setOrg(rec.org); setLevel(rec.level); setStrict(rec.strict);
    setPhase('setup');
    onShowToast('تنظیمات آزمون بارگذاری شد — دوباره شروع کن.');
  };

  const removeArch = async (rec: ExamRec) => {
    if (!await askDel('حذف آزمون', 'این آزمون از آرشیو حذف شود؟')) return;
    const next = arch.filter(x => x.id !== rec.id);
    setArch(next); saveArch(next);
  };

  const fmtTime = (s: number): string => {
    const m = Math.floor(s / 60); const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  };

  /* ───────────────────── SETUP ───────────────────── */
  if (phase === 'setup') {
    return (
      <div className="space-y-4 text-right max-w-2xl mx-auto" dir="rtl">
        <div className={card + ' space-y-4'}>
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-base">🏁 آزمون جامع چندبخشی</h3>
            <button onClick={onExit} className="px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">↩ بازگشت</button>
          </div>
          <p className="text-xs text-[#5d6676] dark:text-[#a3adbd] leading-7">
            آزمون جامع از ۵ بخش ساخته می‌شود: جای‌خالی واژه • حالت و حرف اضافه • فعل+حرف اضافه • صرف صفت • آرتیکل.
            هر بخش تایمر جدا دارد و در پایان نمرهٔ کل محاسبه می‌شود.
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-[13px] font-bold mb-1">نوع آزمون</label>
              <select value={org} onChange={e => { const o = e.target.value as Org; setOrg(o); if (o === 'EPD' && !['B2', 'C1', 'C2'].includes(level)) setLevel('B2'); }} className="w-full bg-slate-50 dark:bg-[#141923] border rounded-xl px-3 py-2.5 text-sm font-bold">
                {ORGS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-bold mb-1">سطح</label>
              <LevelChips value={level} onChange={l => setLevel(l)} levels={levels} />
            </div>
            {/* بدون کمک */}
            <label className="flex items-center gap-2 cursor-pointer select-none p-3 rounded-xl border border-[#dde1ea] dark:border-[#333b4a] bg-slate-50 dark:bg-[#141923]">
              <input type="checkbox" checked={strict} onChange={e => setStrict(e.target.checked)} className="w-4 h-4 accent-[#1f5fbf]" />
              <span className="text-sm font-bold">🚫 بدون کمک (حالت آزمون واقعی)</span>
              <span className="text-[11px] text-[#5d6676] mr-auto">بدون ترجمهٔ فارسی، بدون پاپ‌آپ واژه، تایمر متوقف‌نشدنی</span>
            </label>
          </div>
          <button onClick={start} className="w-full bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white py-3.5 rounded-xl font-bold text-sm shadow-md">شروع آزمون 🚀</button>
        </div>

        {arch.length > 0 && (
          <div className={card + ' space-y-2'}>
            <div className="font-bold text-sm">📈 آزمون‌های قبلی ({toFa(arch.length)})</div>
            {arch.slice(0, 6).map(h => (
              <div key={h.id} className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                <span dir="ltr" className="font-sans text-xs">{h.date} · {h.org} {h.level}{h.strict ? ' · بدون کمک' : ''}</span>
                <div className="flex items-center gap-2">
                  <span className={`font-extrabold ${h.passed ? 'text-emerald-600' : 'text-rose-600'}`} dir="ltr">{toFa(h.avg)}%</span>
                  <button onClick={() => setPrintOpen(h)} title="چاپ با پاسخنامه" className="w-8 h-8 rounded-lg bg-[#1f5fbf] text-white flex items-center justify-center"><Printer size={14} /></button>
                  <button onClick={() => redo(h)} title="آزمون دوباره" className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center"><RotateCcw size={14} /></button>
                  <button onClick={() => void removeArch(h)} title="حذف" className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 flex items-center justify-center">🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {delDialog}
      </div>
    );
  }

  /* ───────────────────── BETWEEN (section summary) ───────────────────── */
  if (phase === 'between') {
    return (
      <div className="space-y-3 text-right max-w-2xl mx-auto" dir="rtl">
        <div className={card + ' text-center'}>
          <div className="text-4xl mb-2">✅</div>
          <div className="font-extrabold text-base">بخش «{cur.label}» تمام شد</div>
          <div className="mt-2 text-sm">امتیاز این بخش: <b dir="ltr" className="text-[#1f5fbf]">{toFa(cur.score)} / {toFa(cur.max)}</b></div>
          <button onClick={nextSection} className="mt-4 w-full h-12 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white font-bold text-sm">
            بخش بعد: {sections[secIdx + 1]?.icon} {sections[secIdx + 1]?.label} →
          </button>
        </div>
      </div>
    );
  }

  /* ───────────────────── DONE ───────────────────── */
  if (phase === 'done') {
    const last = arch[0];
    if (!last) return null;
    return (
      <div className="space-y-3 text-right max-w-2xl mx-auto" dir="rtl">
        <div className={card + ' text-center'}>
          <div className="text-5xl">{last.passed ? '🏆' : '💪'}</div>
          <div className="font-extrabold text-lg mt-2">آزمون به پایان رسید</div>
          <div className="mt-2 text-sm">نمرهٔ کل: <b dir="ltr" className={last.passed ? 'text-emerald-600' : 'text-rose-600'}>{toFa(last.avg)}%</b></div>
          <div className="mt-3 grid grid-cols-5 gap-1 text-center">
            {last.sections.map(s => (
              <div key={s.id} className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-2">
                <div className="text-base">{s.icon}</div>
                <div className="text-[10px] font-bold mt-0.5" dir="ltr">{toFa(s.score)}/{toFa(s.max)}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setPrintOpen(last)} className="flex-1 h-12 rounded-xl bg-[#1f5fbf] text-white font-bold text-sm flex items-center justify-center gap-2"><Printer size={16} /> چاپ با پاسخنامه</button>
            <button onClick={() => setPhase('setup')} className="flex-1 h-12 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white font-bold text-sm">آزمون دوباره</button>
          </div>
        </div>
      </div>
    );
  }

  /* ───────────────────── RUNNING ───────────────────── */
  if (!cur || !curItem) return null;
  return (
    <div className="space-y-3 text-right max-w-2xl mx-auto" dir="rtl">
      {/* نوار بالا: بخش + تایمر + خروج */}
      <div className="flex items-center justify-between gap-2 text-xs font-bold">
        <span className="px-3 py-1.5 rounded-xl bg-[#1f5fbf] text-white flex items-center gap-1.5">
          <span className="text-base">{cur.icon}</span> {cur.label}
        </span>
        <span className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 ${timer <= 30 ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300' : 'bg-slate-100 dark:bg-slate-800 text-[#5d6676]'}`} dir="ltr">
          <TimerIcon size={14} /> {fmtTime(timer)}
        </span>
        <button onClick={abort} className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">خروج</button>
      </div>
      {/* پیشرفت */}
      <div className="flex justify-between text-xs font-bold text-[#5d6676] dark:text-[#a3adbd]">
        <span>سؤال {toFa(itemIdx + 1)} از {toFa(cur.items.length)}</span>
        <span>امتیاز: {toFa(cur.score)}</span>
      </div>
      <div className={card + ' space-y-3'}>
        <div className="text-xs font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">{cur.label} — بخش {toFa(secIdx + 1)} از {toFa(sections.length)}</div>
        {/* سؤال */}
        <div dir="ltr" className="font-sans text-base md:text-lg font-bold leading-8 bg-slate-50 dark:bg-[#141923] p-3 rounded-xl border border-[#dde1ea] dark:border-[#333b4a]">
          {curItem.q}
        </div>
        {/* پاسخ کاربر */}
        <div>
          <label className="block text-xs font-bold mb-1">پاسخت را اینجا بنویس:</label>
          <input
            ref={inputRef}
            dir="ltr"
            value={typed}
            onChange={e => setTyped(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') checkAnswer(); }}
            placeholder="…"
            className="w-full bg-white dark:bg-[#141923] border-2 border-[#1f5fbf] dark:border-[#7fb0ff] rounded-xl px-3 py-2.5 font-sans text-base outline-none"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={checkAnswer} disabled={!typed.trim()} className="flex-1 h-12 rounded-xl bg-emerald-600 text-white font-bold text-sm disabled:opacity-40">
            {itemIdx + 1 >= cur.items.length ? '✅ ثبت و پایان بخش' : '✅ ثبت و بعدی'}
          </button>
          {/* در حالت non-strict: دکمهٔ چشم برای دیدن پاسخ (در strict مخفی) */}
          {!strict && (
            <button
              onClick={() => setRevealedAns(s => ({ ...s, [itemIdx]: !s[itemIdx] }))}
              title="نمایش پاسخ (تنها در حالت عادی)"
              className="w-12 h-12 rounded-xl border border-[#dde1ea] dark:border-[#333b4a] bg-slate-50 dark:bg-slate-800 flex items-center justify-center"
            >
              {revealedAns[itemIdx] ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          )}
          {/* skip بدون امتیاز */}
          <button
            onClick={() => {
              cur.items[itemIdx] = { ...curItem, user: '(نپاسخ)', ok: false };
              cur.score = cur.items.filter(i => i.ok).length;
              setSections([...sections]);
              if (itemIdx + 1 >= cur.items.length) finishSection();
              else { setItemIdx(itemIdx + 1); setTyped(''); setRevealedAns({}); }
            }}
            className="w-12 h-12 rounded-xl border border-[#dde1ea] dark:border-[#333b4a] bg-slate-50 dark:bg-slate-800 text-xs font-bold"
            title="رد شدن"
          >
            ⏭
          </button>
        </div>
        {/* نمایش پاسخ در حالت non-strict وقتی چشم باز شد */}
        {!strict && revealedAns[itemIdx] && (
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-sm">
            <b>پاسخ درست: </b><span dir="ltr" className="font-sans font-bold">{curItem.a}</span>
            {curItem.ex && <div className="mt-1 text-xs text-[#5d6676] dark:text-[#a3adbd] whitespace-pre-wrap">{curItem.ex}</div>}
          </div>
        )}
        {/* نوار پیشرفت سؤال‌ها */}
        <div className="flex flex-wrap gap-1 pt-1">
          {cur.items.map((it, i) => (
            <span key={i} className={`w-6 h-1.5 rounded-full ${i === itemIdx ? 'bg-[#1f5fbf]' : it.ok === true ? 'bg-emerald-500' : it.ok === false ? 'bg-red-400' : 'bg-slate-200 dark:bg-slate-700'}`} />
          ))}
        </div>
      </div>

      {/* چاپ آزمون ذخیره‌شده — فقط در حالت done/between/setup باز می‌شود */}
      {printOpen && (
        <PrintPreview
          open
          onClose={() => setPrintOpen(null)}
          title={<span>Comprehensive Exam — {printOpen.org} {printOpen.level}{printOpen.strict ? ' (بدون کمک)' : ''}</span>}
          docTitle={`Comprehensive Exam — ${printOpen.org} ${printOpen.level}`}
          meta={<>{faDate(printOpen.ts)} • نمره: {toFa(printOpen.avg)}%</>}
          hint="برگهٔ A4 — سؤال‌ها در صفحهٔ پرسش، پاسخ‌نامهٔ کامل در صفحهٔ مستقل"
          questions={
            <div className="space-y-4">
              {printOpen.sections.map((s, si) => (
                <div key={s.id}>
                  <div className="font-bold text-sm mb-1.5">{si + 1}. {s.icon} {s.label}</div>
                  <ol className="space-y-2 list-decimal pr-5">
                    {s.items.map((it, ii) => (
                      <li key={ii} className="leading-7">
                        <div style={prG()} className="font-sans font-bold">{it.q}</div>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          }
          solutions={
            <div className="space-y-4">
              {printOpen.sections.map((s, si) => (
                <div key={s.id}>
                  <div className="font-bold text-sm mb-1.5">{si + 1}. {s.icon} {s.label} — پاسخ‌ها ({toFa(s.score)}/{toFa(s.max)})</div>
                  <ol className="space-y-2 list-decimal pr-5">
                    {s.items.map((it, ii) => (
                      <li key={ii} className="leading-7">
                        <div style={prG()} className="font-sans">
                          <b>پاسخ: </b><span className="font-bold text-[#1f5fbf]">{it.a}</span>
                          {it.user && <span className="ml-2 text-[11px] text-slate-500">— پاسخ شما: {it.user} {it.ok ? '✓' : '✗'}</span>}
                        </div>
                        {it.ex && <div style={prFa()} className="text-[11px] text-slate-600 whitespace-pre-wrap mt-0.5">{it.ex}</div>}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          }
        />
      )}
    </div>
  );
};
