import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AppSettings, CaseQuestion, ExerciseTimerCfg, Word } from '../types';
import { CASEQ, P6 } from '../data/seed';
import { checkSynAnt, checkWord, familyCands, fullWord, getCategories, intervalPreview, isAdjPos, isLeech, isNounPos, isVerbPos, nz, nz2, getTimerCfg } from '../utils/storage';
import { EXTRA_CASEQ, adjSourceByCode, adjSources, analyzeMistake, buildAdjItem, closestAnswer, parseSpec, randomSpec, specToString } from '../utils/grammar';
import { speak, stopSpeaking } from '../utils/audio';
import { checkConjAnswer, splitConj } from '../utils/conjugation';

/** Splits the six forms into two rows of three: [1..3] left column, [4..6] right column. */
const splitConjColumns = (forms: string[]): [string[], string[]] =>
  [forms.slice(0, 3), forms.slice(3, 6)];
import { WordDetailModal } from '../components/WordDetailModal';
import { SentenceBuilderModal } from '../components/SentenceBuilderModal';
import { IconBtn } from '../components/IconBtn';
import { X, BookOpen, PencilLine, HelpCircle, Timer as TimerIcon } from 'lucide-react';
import { ConjugatedForm } from '../components/ConjugatedForm';
import { generateWithGemini, parseAI } from '../utils/ai';

export type ExerciseMode =
  | 'flash'
  | 'free'
  | 'daily'
  | 'review'
  | 'cloze'
  | 'art'
  | 'dict'
  | 'plural'
  | 'conj'
  | 'tense'
  | 'case'
  | 'adjdecl'
  | 'prod'
  | 'synant'
  | 'n2v'
  | 'v2n'
  | 'hard'
  | 'sent'
  | 'freesent';

export const EXERCISE_NAMES: Record<ExerciseMode, { title: string; icon: string; desc: string }> = {
  flash: { title: 'فلش‌کارت', icon: '🃏', desc: 'کارت واژه با الگوریتم تکرار فاصله‌دار لایتنر' },
  free: { title: 'مرور آزاد دسته', icon: '📚', desc: 'مرور همهٔ واژگان یک دسته، بدون محدودیت و بدون اثر بر لایتنر' },
  daily: { title: 'جلسهٔ روزانه', icon: '🌟', desc: 'سررسیدها + واژه‌های جدید متناسب با سهمیه روزانه' },
  review: { title: 'مرور سررسیدها', icon: '🔁', desc: 'فقط واژه‌هایی که تاریخ مرور آن‌ها فرا رسیده' },
  cloze: { title: 'جای‌خالی', icon: '✍️', desc: 'تکمیل جمله با واژه یا عبارت درست' },
  art: { title: 'آرتیکل', icon: '🎨', desc: 'تشخیص der / die / das برای اسامی' },
  dict: { title: 'دیکته و شنیدار', icon: '🎧', desc: 'شنیدن تلفظ و نوشتن املای آلمانی' },
  plural: { title: 'جمع اسم‌ها', icon: '🔢', desc: 'نوشتن شکل جمع اسامی آلمانی' },
  conj: { title: 'صرف فعل', icon: '🔤', desc: 'صرف فعل برای ضمایر مختلف با هایلایت پایانه و تغییر ریشه' },
  tense: { title: 'زمان فعل', icon: '⏳', desc: 'تمرین زمان‌های Präteritum و Perfekt' },
  case: { title: 'حالت و حرف اضافه', icon: '🧩', desc: 'دو جای خالی مجزا برای حرف اضافه و آرتیکل' },
  adjdecl: { title: 'صرف صفت', icon: '🧱', desc: 'نوشتن شکل درست صفت (پایانه) با آرتیکل، حالت و جنس مختلف' },
  prod: { title: 'فارسی ← آلمانی (تایپی)', icon: '🔁', desc: 'دیدن ترجمه و نوشتن کامل واژه آلمانی' },
  synant: { title: 'مترادف و متضاد', icon: '↔️', desc: 'نوشتن مترادف یا متضاد واژهٔ داده‌شده' },
  n2v: { title: 'اسم ← فعل', icon: '🔁', desc: 'از روی اسم، فعل هم‌خانواده را بنویسید' },
  v2n: { title: 'فعل ← اسم', icon: '🔂', desc: 'از روی فعل، اسم هم‌خانواده را (با آرتیکل) بنویسید' },
  hard: { title: 'تمرین ترکیبی واژه‌های سخت', icon: '🩸', desc: 'هر واژهٔ سخت در قالب‌های مختلف و با چیدمان تصادفی' },
  sent: { title: 'تولید جمله', icon: '🗣', desc: 'جمله‌سازی با واژه و بررسی ساختار' },
  freesent: { title: 'تولید جملهٔ آزاد', icon: '✒️', desc: 'هر جمله‌ای بساز؛ تصحیح کامل گرامر، حروف ربط، حرف اضافه و حالت، آرتیکل و صرف صفت با نمره' }
};

/**
 * Colour-coded conjugated form (regular endings blue, irregular stem changes red).
 * The logic now lives in src/utils/conjugation.ts and is shared with the vocabulary profile.
 * Kept as an export for backward compatibility.
 */
/** Two exercise-menu tabs: every exercise belongs to exactly one tab — nothing lost, nothing duplicated. */ 
const WORTSCHATZ_MODES: ExerciseMode[] = ['flash', 'free', 'daily', 'review', 'cloze', 'dict', 'plural', 'prod', 'synant', 'n2v', 'v2n', 'sent']; 
const GRAMMATIK_MODES: ExerciseMode[] = ['art', 'conj', 'tense', 'case', 'adjdecl', 'freesent'];  

export const HighlightedVerbForm: React.FC<{
  verb: string;
  form: string;
  pronounIndex: number;
  sep?: string;
}> = ({ verb, form, pronounIndex, sep }) => (
  <ConjugatedForm verb={verb} form={form} pronounIndex={pronounIndex} sep={sep} />
);

interface MistakeComparisonProps {
  /** What the learner typed */
  user: string;
  /** The correct answer, or all accepted answers (the closest one is used for the comparison) */
  expected: string | string[];
  /** Optional small title, e.g. "حرف اضافه" when an exercise has several blanks */
  label?: string;
}

/**
 * Shows the learner's wrong answer next to the correct one, highlights the differing
 * characters and explains in Persian what exactly went wrong.
 */
export const MistakeComparison: React.FC<MistakeComparisonProps> = ({ user, expected, label }) => {
  const report = useMemo(() => {
    const list = Array.isArray(expected) ? expected : [expected];
    const target = closestAnswer(user, list) || (list[0] || '');
    return analyzeMistake(user, target);
  }, [user, expected]);

  if (!report.expected) return null;

  return (
    <div className="p-3 rounded-xl bg-white dark:bg-[#141923] border border-red-200 dark:border-red-900/60 text-right space-y-2 text-sm md:text-base">
      <div className="font-bold text-slate-700 dark:text-slate-200">
        🔍 مقایسهٔ پاسخ شما با شکل درست{label ? ` — ${label}` : ''}
      </div>

      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-[#5d6676] dark:text-[#a3adbd] font-semibold flex-shrink-0">نوشتهٔ شما:</span>
        <span dir="ltr" className="font-sans font-bold text-base tracking-wide break-all">
          {report.user === '' ? (
            <span className="text-red-600 dark:text-red-400">—</span>
          ) : (
            report.segments.map((seg, i) =>
              seg.kind === 'eq' ? (
                <span key={i} className="text-slate-900 dark:text-slate-100">{seg.usr}</span>
              ) : seg.usr ? (
                <span
                  key={i}
                  className="text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-950/60 rounded-sm underline decoration-wavy"
                >
                  {seg.usr.replace(/ /g, '\u00a0')}
                </span>
              ) : (
                <span key={i} className="text-red-600 dark:text-red-400 font-extrabold" title="حرف جا افتاده">
                  _
                </span>
              )
            )
          )}
        </span>
      </div>

      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-[#5d6676] dark:text-[#a3adbd] font-semibold flex-shrink-0">شکل درست:</span>
        <span dir="ltr" className="font-sans font-bold text-base tracking-wide break-all">
          {report.segments.map((seg, i) =>
            seg.kind === 'eq' ? (
              <span key={i} className="text-slate-900 dark:text-slate-100">{seg.exp}</span>
            ) : seg.exp ? (
              <span
                key={i}
                className="text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 rounded-sm underline"
              >
                {seg.exp.replace(/ /g, '\u00a0')}
              </span>
            ) : null
          )}
        </span>
      </div>

      <div className="pt-1 border-t border-slate-200/70 dark:border-slate-800">
        <div className="font-bold text-red-600 dark:text-red-400 mb-1">اشتباه شما:</div>
        <ul className="space-y-0.5 text-slate-800 dark:text-slate-200 leading-relaxed">
          {report.notes.map((note, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span className="text-red-500 mt-0.5">•</span>
              <span>{note}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

/** "Haus" -> "H _ _ _" (level 1) or "Ha _ s" (level 2) */
const maskText = (text: string, level: number): string =>
  text
    .split(' ')
    .map(tok => {
      const chars = [...tok];
      if (chars.length <= 1) return tok;
      if (chars.length === 2) return level >= 2 ? tok : `${chars[0]} _`;
      const head = level >= 2 ? 2 : 1;
      const tail = level >= 2 ? 1 : 0;
      return chars.map((c, i) => (i < head || i >= chars.length - tail ? c : '_')).join(' ');
    })
    .join('   ');

interface HintInfo {
  note: string;
  mask: string;
}

/**
 * Progressive hints for typed exercises.
 * Level 1: what kind of answer is expected + its length and first letter.
 * Level 2: more letters (first two and the last one) and, where useful, extra information.
 */
const buildHint = (
  mode: string,
  w: Word,
  level: number,
  ctx: { pron: number; kind: string; cands: string[] }
): HintInfo => {
  const len = (t: string) => `${[...t.replace(/ /g, '')].length} حرف`;
  let target = '';
  const notes: string[] = [];

  switch (mode) {
    case 'cloze': {
      target = w.ans || w.de;
      const imp: [string, string | undefined][] = [['du', w.imperativDu], ['ihr', w.imperativIhr], ['Sie', w.imperativSie]];
      const hit = isVerbPos(w.pos) ? imp.find(([, v]) => v && nz(v.replace(/[!.]/g, '')) === nz(target.replace(/[!.]/g, ''))) : undefined;
      if (hit) notes.push(`شکل امری برای ضمیر «${hit[0]}»`);
      else if (isVerbPos(w.pos)) notes.push('فعل باید با فاعل جمله صرف شود');
      else if (isAdjPos(w.pos)) notes.push('صفت باید با پایانهٔ مناسب جمله صرف شود');
      break;
    }
    case 'dict':
    case 'prod': {
      target = fullWord(w);
      if (w.art) notes.push('اسم است؛ آرتیکل را هم بنویسید');
      else if (isVerbPos(w.pos)) notes.push('مصدر فعل را بنویسید');
      break;
    }
    case 'plural':
      target = (w.pl || '').replace(/^die\s+/i, '');
      notes.push('شکل جمع (بدون آرتیکل هم قبول است)');
      break;
    case 'conj': {
      const forms = splitConj(w.conj || '');
      target = (forms[ctx.pron] || forms[2] || '').trim();
      notes.push(`شکل فعل برای «${P6[ctx.pron]}»`);
      break;
    }
    case 'tense':
      target = w.prat || w.perf || '';
      notes.push(w.prat ? 'Präteritum' : 'Perfekt');
      break;
    case 'adjdecl':
      target = ctx.cands[0] || '';
      notes.push('صفت قبل از اسم پایانه می‌گیرد؛ نوع آرتیکل، حالت و جنس اسم را بررسی کنید');
      break;
    case 'synant':
    case 'n2v':
    case 'v2n': {
      target = ctx.cands[0] || '';
      notes.push(`${ctx.cands.length} پاسخ ممکن است`);
      if (level >= 2 && mode === 'synant') {
        const fa = ctx.kind === 'ant' ? w.antFa : w.synFa;
        if (fa) notes.push(`ترجمهٔ فارسی: ${fa}`);
      }
      break;
    }
    default:
      target = w.de;
  }

  if (target) notes.push(len(target));
  return { note: notes.join(' • '), mask: target ? maskText(target, level) : '' };
};


// ---- Sentence practice (write a German sentence with the given word) ----
const germanTokens = (t: string): string[] => t.split(/[^\p{L}]+/u).filter(Boolean);

/** Finds the target word (or a grammatical form of it) in the learner's sentence. */
export function findWordInSentence(w: Word, sentence: string): string {
  const tokens = germanTokens(sentence);
  const low = tokens.map(t => t.toLowerCase());
  const base = (w.de || '').replace(/^sich\s+/i, '').trim().toLowerCase();
  if (!base) return '';
  const forms = new Set<string>([base]);
  const lastTok = (x: string) => germanTokens(x).pop()?.toLowerCase() || '';

  if (isVerbPos(w.pos)) {
    splitConj(w.conj || '').forEach(f => { const t = lastTok(f); if (t) forms.add(t); });
    [w.prat, w.perf].forEach(f => { const t = lastTok(f || ''); if (t) forms.add(t); });
    const sep = (w.sep || '').trim().toLowerCase();
    const core = sep && base.startsWith(sep) ? base.slice(sep.length) : base;
    const stem = core.replace(/(en|n)$/, '');
    const hit = low.findIndex(t => forms.has(t) || (stem.length >= 3 && (t.includes(stem) || (stem.length >= 4 && t.startsWith(stem.slice(0, stem.length - 1))))));
    if (hit >= 0) return tokens[hit];
  } else if (isAdjPos(w.pos)) {
    const hit = low.findIndex(t => t.startsWith(base) && t.length - base.length <= 2);
    if (hit >= 0) return tokens[hit];
  } else {
    const pl = (w.pl || '').replace(/^die\s+/i, '').trim().toLowerCase();
    if (pl && !pl.startsWith('-')) forms.add(pl);
    ['s', 'es', 'n', 'en'].forEach(e => forms.add(base + e));
    const hit = low.findIndex(t => forms.has(t));
    if (hit >= 0) return tokens[hit];
  }
  return '';
}

export interface SentenceCheck {
  used: string;
  items: { ok: boolean; text: string }[];
  grade: number;
}

export function checkSentence(w: Word, sentenceRaw: string): SentenceCheck {
  const sentence = sentenceRaw.trim();
  const used = findWordInSentence(w, sentence);
  const tokens = germanTokens(sentence);
  const isNoun = !!w.art || isNounPos(w.pos);
  const items: { ok: boolean; text: string }[] = [];
  items.push({
    ok: !!used,
    text: used ? `واژهٔ «${w.de}» در جمله استفاده شده است («${used}»).` : `واژهٔ «${w.de}» (یا شکل صرف‌شدهٔ آن) در جمله دیده نمی‌شود.`
  });
  items.push({ ok: tokens.length >= 3, text: tokens.length >= 3 ? 'جمله طول مناسب دارد.' : 'جمله خیلی کوتاه است؛ دست‌کم ۳ کلمه بنویسید.' });
  items.push({ ok: /^\p{Lu}/u.test(sentence), text: /^\p{Lu}/u.test(sentence) ? 'جمله با حرف بزرگ شروع شده است.' : 'جمله باید با حرف بزرگ شروع شود.' });
  items.push({ ok: /[.!?]$/.test(sentence), text: /[.!?]$/.test(sentence) ? 'پایان جمله علامت نگارشی دارد.' : 'در پایان جمله نقطه، علامت سؤال یا تعجب بگذارید.' });
  if (isNoun && used) {
    const capital = /^\p{Lu}/u.test(used);
    items.push({ ok: capital, text: capital ? 'اسم با حرف بزرگ نوشته شده است.' : `اسم «${w.de}» در آلمانی همیشه با حرف بزرگ نوشته می‌شود.` });
  }
  const allOk = items.every(i => i.ok);
  return { used, items, grade: used ? (allOk ? 2 : 1) : 0 };
}

const SentencePractice: React.FC<{
  w: Word;
  faVisible: boolean;
  faButton: React.ReactNode;
  timeUpSignal: number;
  onGraded: (grade: number) => void;
  onNext: () => void;
}> = ({ w, faVisible, faButton, timeUpSignal, onGraded, onNext }) => {
  const [text, setText] = useState('');
  const [result, setResult] = useState<SentenceCheck | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState('');

  const runCheck = (force: boolean) => {
    if (result) return;
    if (!text.trim() && !force) return;
    const r = checkSentence(w, text);
    setResult(r);
    onGraded(text.trim() ? r.grade : 0);
  };

  const startSignal = useRef(timeUpSignal);
  useEffect(() => {
    if (timeUpSignal !== startSignal.current) runCheck(true);
  }, [timeUpSignal]);

  const askAi = async () => {
    if (!text.trim() || aiBusy) return;
    setAiBusy(true);
    setAiMsg('');
    try {
      const prompt = `You are a German teacher. A learner wrote one German sentence using the word "${fullWord(w)}" (meaning: ${w.fa}).
Sentence: ${text.trim()}
Check grammar, word order, cases, articles, verb forms and whether the target word is used correctly.
Return ONLY valid JSON: [{"correct": true|false, "corrected": "corrected sentence (same as input if correct)", "explanation": "short explanation in Persian"}]`;
      const out = await generateWithGemini(prompt, { timeoutMs: 20000, retries: 0 });
      const r: any = parseAI(out)[0] || {};
      setAiMsg(
        `${r.correct ? '✔ از نظر هوش مصنوعی جمله درست است.' : '✘ پیشنهاد اصلاح: ' + (r.corrected || '')}${r.explanation ? '\n' + r.explanation : ''}`
      );
    } catch (e: any) {
      setAiMsg('اتصال به هوش مصنوعی ممکن نشد؛ بررسی خودکار بالا همچنان معتبر است. (' + (e?.message || 'خطا') + ')');
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="space-y-3 text-right">
      <p className="text-sm font-semibold text-[#5d6676] dark:text-[#a3adbd] text-center">با این واژه یک جملهٔ آلمانی بنویسید:</p>
      <div className="text-2xl md:text-3xl font-extrabold text-center font-sans" dir="ltr">{fullWord(w)}</div>
      <div className="text-center text-base font-semibold text-[#1f5fbf] dark:text-[#7fb0ff]">{faVisible || result ? w.fa : faButton}</div>

      {!result ? (
        <>
          <textarea
            dir="ltr"
            rows={3}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Schreiben Sie hier Ihren Satz …"
            className="w-full bg-slate-50 dark:bg-[#141923] border-2 border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 font-sans text-base outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => runCheck(false)}
              disabled={!text.trim()}
              className="flex-1 bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] disabled:opacity-40 text-white px-6 py-2.5 rounded-xl text-sm font-bold"
            >
              بررسی جمله
            </button>
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] font-sans text-base" dir="ltr">{text.trim() || '—'}</div>
          <ul className="space-y-1.5 text-sm leading-7">
            {result.items.map((it, i) => (
              <li key={i} className={it.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-400 font-semibold'}>
                {it.ok ? '✔' : '✘'} {it.text}
              </li>
            ))}
          </ul>
          <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 space-y-1.5 text-sm">
            <div className="font-bold">📚 جمله‌های نمونه برای مقایسه</div>
            {w.ex || w.ex2 ? (
              <>
                {w.ex && (<div><div dir="ltr" className="font-sans font-semibold text-left">{w.ex}</div><div className="text-[#5d6676] dark:text-[#a3adbd]">{w.exFa}</div></div>)}
                {w.ex2 && (<div><div dir="ltr" className="font-sans font-semibold text-left">{w.ex2}</div><div className="text-[#5d6676] dark:text-[#a3adbd]">{w.ex2Fa}</div></div>)}
              </>
            ) : (
              <div className="text-[#5d6676] dark:text-[#a3adbd]">برای این واژه هنوز جملهٔ نمونه ثبت نشده است.</div>
            )}
          </div>
          {aiMsg && <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-sm whitespace-pre-wrap leading-7">{aiMsg}</div>}
          <div className="flex gap-2">
            <button
              onClick={askAi}
              disabled={aiBusy || !text.trim()}
              className="px-4 py-2.5 rounded-xl text-sm font-bold bg-amber-100 text-amber-900 disabled:opacity-50"
            >
              {aiBusy ? 'در حال بررسی…' : '🤖 بررسی دستوری با هوش مصنوعی'}
            </button>
            <button onClick={onNext} className="flex-1 bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-6 py-2.5 rounded-xl text-sm font-bold">
              ادامه ◀
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ---- Free sentence practice (write ANY German sentence; AI proofreads it) ----
interface FreeReport {
  understood_fa: string;
  score: number;
  corrected_de: string;
  issues: { type: string; wrong: string; correct: string; why_fa: string }[];
  tip_fa: string;
}

const FREE_ISSUE_BADGE: Record<string, string> = {
  'گرامر': 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
  'املا': 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  'حرف اضافه و حالت دستوری': 'bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300',
  'واژه‌گزینی': 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300',
  'حروف ربط و ترتیب جمله': 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300',
  'آرتیکل و صرف صفت': 'bg-pink-100 text-pink-800 dark:bg-pink-950/60 dark:text-pink-300'
};

const FreeSentencePractice: React.FC<{ onShowToast: (m: string, e?: boolean) => void }> = ({ onShowToast }) => {
  const [text, setText] = useState('');
  const [report, setReport] = useState<FreeReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  const runCheck = async () => {
    const s = text.trim();
    if (!s || busy) return;
    setBusy(true); setErrMsg(''); setReport(null);
    const prompt = `You are an expert German proofreader for Persian-speaking learners. Evaluate the learner's German sentence.\n\nINPUT: "${s}"\n\nCHECK: grammar and verb conjugation; connectors (weil, dass, wenn, deshalb, ...) and clause order; prepositions and required cases; articles, gender and adjective endings; word order; spelling and capitalization; naturalness.\n\nRULES:\n- Correct genuine errors only; preserve meaning and wording as much as possible.\n- If correct and natural: corrected_de = the exact input, score = 100, issues = [].\n- Every "wrong" must be an exact substring of the input. Never invent or paraphrase.\n- Report each distinct error once. Issue types exactly one of: "گرامر" | "املا" | "حرف اضافه و حالت دستوری" | "واژه‌گزینی" | "حروف ربط و ترتیب جمله" | "آرتیکل و صرف صفت".\n- Score 0-100 (integer) on correctness and naturalness; ignore non-applicable criteria and redistribute weights proportionally; be consistent.\n- Explanations and the tip: concise Persian, no repetition.\n- Return ONLY a valid JSON array with exactly one object, no Markdown, no extra text:\n[{"understood_fa":"...","score":0,"corrected_de":"...","issues":[{"type":"...","wrong":"...","correct":"...","why_fa":"..."}],"tip_fa":"..."}]`;
    try {
      const out = await generateWithGemini(prompt, { json: true, timeoutMs: 45000, retries: 1 });
      const r: any = parseAI(out)[0] || {};
      if (typeof r.score !== 'number') throw new Error('پاسخ نامعتبر از هوش مصنوعی دریافت شد.');
      setReport({
        understood_fa: String(r.understood_fa || ''),
        score: Math.max(0, Math.min(100, Math.round(Number(r.score)))),
        corrected_de: String(r.corrected_de || ''),
        issues: Array.isArray(r.issues) ? r.issues : [],
        tip_fa: String(r.tip_fa || '')
      });
    } catch (e: any) {
      setErrMsg(e?.message || 'تصحیح با هوش مصنوعی ناموفق بود.');
      onShowToast(e?.message || 'تصحیح ناموفق بود.', true);
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3 text-right">
      <p className="text-sm font-semibold text-[#5d6676] dark:text-[#a3adbd] text-center">
        هر جملهٔ آلمانی که می‌خواهی بنویس — گرامر، حروف ربط، حرف اضافه و حالت، آرتیکل و صرف صفت بررسی می‌شود:
      </p>
      <textarea
        dir="ltr" rows={4} value={text} onChange={e => setText(e.target.value)}
        placeholder="Schreiben Sie einen beliebigen deutschen Satz …"
        className="w-full bg-slate-50 dark:bg-[#141923] border-2 border-[#1f5fbf] dark:border-[#7fb0ff] rounded-xl px-3.5 py-2.5 font-sans text-base outline-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => void runCheck()}
          disabled={busy || !text.trim()}
          className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] disabled:opacity-40 text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-1.5"
        >
          {busy ? <><span className="inline-block animate-spin">⏳</span><span>در حال تصحیح…</span></> : <span>🤖 تصحیح و نمره‌دهی</span>}
        </button>
        {report && (
          <button onClick={() => { setReport(null); setText(''); }} className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-4 py-2.5 rounded-xl text-sm font-bold">
            🔄 جملهٔ جدید
          </button>
        )}
      </div>

      {errMsg && (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">{errMsg}</div>
      )}

      {report && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className={`px-3 py-1 rounded-xl text-sm font-extrabold ${report.score >= 80 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' : report.score >= 50 ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' : 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'}`}>
              نمره: {report.score}/100
            </span>
            {report.issues.length === 0 && <span className="text-emerald-700 dark:text-emerald-300 text-sm font-bold">✅ جمله بدون خطا!</span>}
          </div>

          {report.understood_fa && (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] text-sm leading-7">
              <b className="text-[#1f5fbf] dark:text-[#7fb0ff]">🧠 برداشت آلمانی‌زبان: </b>{report.understood_fa}
            </div>
          )}

          {report.issues.length > 0 && (
            <div className="space-y-2">
              {report.issues.map((it, i) => (
                <div key={i} className="p-3 rounded-xl bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] space-y-1.5">
                  <span className={`inline-block px-2 py-0.5 rounded-lg text-[11px] font-bold ${FREE_ISSUE_BADGE[it.type] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>{it.type}</span>
                  {(it.wrong || it.correct) && (
                    <div className="flex flex-wrap items-baseline gap-2 text-sm" dir="ltr">
                      {it.wrong && <span className="font-sans font-bold text-red-600 dark:text-red-400 line-through">{it.wrong}</span>}
                      {it.wrong && it.correct && <span className="text-slate-400">→</span>}
                      {it.correct && <span className="font-sans font-bold text-emerald-700 dark:text-emerald-300">{it.correct}</span>}
                    </div>
                  )}
                  {it.why_fa && <div className="text-xs leading-6 text-[#5d6676] dark:text-[#a3adbd]">{it.why_fa}</div>}
                </div>
              ))}
            </div>
          )}

          {report.tip_fa && (
            <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 text-sm leading-7">
              <b className="text-indigo-700 dark:text-indigo-300">💡 نکته: </b>{report.tip_fa}
            </div>
          )}

          {report.corrected_de && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
              <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300 mb-1">✅ شکل درست و طبیعی:</div>
              <div dir="ltr" className="font-sans font-bold text-base text-slate-900 dark:text-slate-100">{report.corrected_de}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export { getTimerCfg };

const shuffleArr = <T,>(arr: T[]): T[] => {
  const r = [...arr];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
};

/** Splits "a, b; c" style lists (synonyms / antonyms) into separate entries. */
const splitList = (s: string): string[] =>
  (s || '').split(/[,;،؛/|]/).map(x => x.trim()).filter(Boolean);

/** All case / preposition questions (seed list + extra, harder questions). */
const ALL_CASEQ: CaseQuestion[] = [...CASEQ, ...EXTRA_CASEQ];

/** Synthetic target for the free-sentence exercise (no vocabulary item involved). */
const FREE_SENT_WORD: Word = {
  id: 'freesent-self', de: '', art: '', fa: '', syn: '', synFa: '', ant: '', antFa: '',
  pl: '', pos: '', lvl: 'A2', ex: '', exFa: '', ex2: '', ex2Fa: '', conj: '', prat: '',
  perf: '', sep: '', cat: 'گرامر', cloze: '', ans: '', acc: [], tags: '', img: '',
  notes: '', added: 0, last: 0, due: 0, ivl: 0, ease: 2.5, stage: 0, ok: 0, bad: 0, res: ''
};

/** Progressive session: a few questions of every difficulty level, easiest first. */
const pickCaseQueue = (): string[] => {
  const byLevel = new Map<number, CaseQuestion[]>();
  ALL_CASEQ.forEach(q => byLevel.set(q.cs || 1, [...(byLevel.get(q.cs || 1) || []), q]));
  const chosen: CaseQuestion[] = [];
  [...byLevel.keys()].sort().forEach(level => chosen.push(...shuffleArr(byLevel.get(level) || []).slice(0, 7)));
  return chosen.sort((a, b) => (a.cs || 1) - (b.cs || 1)).map(q => q.id);
};

/** Queue key of one adjective-declension question: "<wordId>::adjdecl::<source>~<spec>" */
const adjKey = (w: Word, level?: number): string | null => {
  const sources = adjSources(w, isAdjPos(w.pos));
  if (sources.length === 0) return null;
  const src = sources[Math.floor(Math.random() * sources.length)];
  const lv = level || [1, 1, 1, 2, 2, 2, 3, 3][Math.floor(Math.random() * 8)];
  for (let i = 0; i < 20; i++) {
    const spec = randomSpec(lv);
    if (buildAdjItem(src.base, spec)) return `${w.id}::adjdecl::${src.code}~${specToString(spec)}`;
  }
  return null;
};

const buildAdjQueue = (ws: Word[], n: number): string[] => {
  const adjWords = ws.filter(w => adjSources(w, isAdjPos(w.pos)).length > 0);
  if (adjWords.length === 0) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < n * 4 && out.length < n; i++) {
    const k = adjKey(adjWords[Math.floor(Math.random() * adjWords.length)]);
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
};

/** Queue key for the synonym/antonym exercise: "<wordId>::<sub>::<syn|ant>" */
const synAntKey = (w: Word, sub = 'synant'): string => {
  const kinds: string[] = [];
  if (splitList(w.syn).length) kinds.push('syn');
  if (splitList(w.ant).length) kinds.push('ant');
  const kind = kinds[Math.floor(Math.random() * kinds.length)] || 'syn';
  return `${w.id}::${sub}::${kind}`;
};

/**
 * Mixed session for hard words: every word is asked in several different formats,
 * and the whole order is reshuffled every time a session starts.
 */
const buildHardQueue = (ws: Word[]): string[] => {
  const keys: string[] = [];
  ws.forEach(w => {
    const subs = ['flashFa', 'flashDe', 'dict', 'prod'];
    if (w.cloze || w.ans) subs.push('cloze');
    const extras: string[] = [];
    if (w.art) extras.push('art');
    if (w.pl) extras.push('plural');
    if (w.conj) extras.push('conj');
    if (w.prat || w.perf) extras.push('tense');
    if (splitList(w.syn).length || splitList(w.ant).length) extras.push('synant');
    if (isAdjPos(w.pos) && adjSources(w, true).length > 0) extras.push('adjdecl');
    [...subs, ...shuffleArr(extras).slice(0, 2)].forEach(sub => {
      const key = sub === 'synant' ? synAntKey(w) : sub === 'adjdecl' ? adjKey(w) : `${w.id}::${sub}`;
      if (key) keys.push(key);
    });
  });
  const idOf = (k: string) => k.split('::')[0];
  const subOf = (k: string) => k.split('::')[1];
  const rest = shuffleArr(keys);
  const out: string[] = [];
  while (rest.length) {
    const prev = out[out.length - 1];
    let idx = rest.findIndex(k => !prev || (idOf(k) !== idOf(prev) && subOf(k) !== subOf(prev)));
    if (idx < 0) idx = rest.findIndex(k => !prev || idOf(k) !== idOf(prev));
    if (idx < 0) idx = 0;
    out.push(rest.splice(idx, 1)[0]);
  }
  return out;
};

interface ExercisesViewProps {
  words: Word[];
  settings?: AppSettings;
  activeMode: ExerciseMode | null;
  practiceWordIds?: string[] | null;
  onSelectMode: (mode: ExerciseMode | null) => void;
  onRecordResult: (word: Word | CaseQuestion, mode: string, grade: number, isRetry: boolean) => void;
  onOpenHelp: (topic: string) => void;
  onShowToast: (msg: string, isErr?: boolean) => void;
  onEditWord?: (word: Word) => void;
  onDeleteWord?: (word: Word) => void;
  onImageChange?: (word: Word, newImg: string) => void;
  /** true while the exercise is hidden behind the word edit form */
  paused?: boolean;
  onUpdateSettings?: (patch: Partial<AppSettings>) => void;
}

export const ExercisesView: React.FC<ExercisesViewProps> = ({
  words,
  settings,
  activeMode,
  practiceWordIds,
  onSelectMode,
  onRecordResult,
  onOpenHelp,
  onShowToast,
  onEditWord,
  onDeleteWord,
  onImageChange,
  paused,
  onUpdateSettings
}) => {
  const pausedRef = useRef<boolean>(!!paused);
  pausedRef.current = !!paused;
  const [faShown, setFaShown] = useState(false);
  const [conjPron, setConjPron] = useState(2);

  // Free review configuration
  const [freeCat, setFreeCat] = useState<string>(settings?.freeCat || '');
  const [freeDir, setFreeDir] = useState<'de' | 'fa'>(settings?.freeDir || 'de');
  const [freeRnd, setFreeRnd] = useState<boolean>(settings?.freeRnd ?? true);
  const [isFreeStarted, setIsFreeStarted] = useState<boolean>(false);

  // Flashcard setup config
  const [flashDir, setFlashDir] = useState<'de' | 'fa' | 'rand'>(settings?.dir || 'de');
  const [flashCat, setFlashCat] = useState<string>('');
  const [isFlashConfigured, setIsFlashConfigured] = useState<boolean>(false);

  // Active session queue
  const [queue, setQueue] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  // Fulfills Section 10: Independent answer visibility per card
  const [revealedCardId, setRevealedCardId] = useState<string | null>(null);
  const [currentCardDir, setCurrentCardDir] = useState<'de' | 'fa'>('de');

  // Input states
  const [userInput, setUserInput] = useState<string>('');
  // Fulfills Section 19: Two separate blanks for Case & Preposition
  const [casePrepInput, setCasePrepInput] = useState<string>('');
  const [caseArtInput, setCaseArtInput] = useState<string>('');
  const [caseResult, setCaseResult] = useState<{ prepOk: boolean; artOk: boolean } | null>(null);

  const [answerResult, setAnswerResult] = useState<{ ok: number; exp: string; msg?: string; cands?: string[] } | null>(null);
  const [hintLevel, setHintLevel] = useState<number>(0);

  // Fulfills Section 21: View Full Word Profile modal accessible from EVERY exercise
  const [profileModalWord, setProfileModalWord] = useState<Word | null>(null);
  const [sentenceModalWord, setSentenceModalWord] = useState<Word | null>(null);
  pausedRef.current = !!paused || !!profileModalWord || !!sentenceModalWord;
    
  // Fulfills Section 5: Flashcard timer per card
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [timerPopupOpen, setTimerPopupOpen] = useState(false);   const [timerSecDraft, setTimerSecDraft] = useState<string | null>(null);
  const [sentTimeUp, setSentTimeUp] = useState(0);
  const timeUpRef = useRef<() => void>(() => {});
  const timerRef = useRef<any>(null);

  // For free review tracking
  const [knownMap, setKnownMap] = useState<Record<string, number>>({});

  const categories = useMemo(() => getCategories(words), [words]);

  // Words already counted towards the daily goal in a mixed hard-word session
  const hardCountedRef = useRef<Set<string>>(new Set());

  // Queue keys: plain word id, or "<id>::<sub>[::<kind>]" for the mixed / synonym exercises
  const currentKey = queue[currentIndex] || '';
  const keyParts = currentKey.split('::');
  const currentSub = keyParts[1] || '';
  const currentKind = keyParts[2] || '';
  const qMode: ExerciseMode | null = !activeMode
    ? null
    : activeMode === 'hard'
      ? (currentSub === 'flashDe' || currentSub === 'flashFa' ? 'flash' : ((currentSub as ExerciseMode) || 'flash'))
      : activeMode;
  const hardFlashDir: 'de' | 'fa' | null = activeMode === 'hard'
    ? (currentSub === 'flashFa' ? 'fa' : currentSub === 'flashDe' ? 'de' : null)
    : null;

  const record = (item: Word | CaseQuestion, mode: string, grade: number) => {
    let retry = false;
    if (activeMode === 'hard') {
      retry = hardCountedRef.current.has(item.id);
      hardCountedRef.current.add(item.id);
    }
    onRecordResult(item, mode, grade, retry);
  };

  // Clean up timers and audio on unmount or question change
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopSpeaking();
    };
  }, []);

  // Build queue when activeMode starts
  useEffect(() => {
    if (!activeMode) {
      setQueue([]);
      setCurrentIndex(0);
      setRevealedCardId(null);
      setUserInput('');
      setCasePrepInput('');
      setCaseArtInput('');
      setCaseResult(null);
      setAnswerResult(null);
      setHintLevel(0);
    setFaShown(false);
    setConjPron(Math.floor(Math.random() * 6));
      setIsFreeStarted(false);
      setIsFlashConfigured(false);
      stopSpeaking();
      return;
    }

    const n = Date.now();
    let qIds: string[] = [];

    // Filter by active categories if specified (Section 3.4)
    let pool = words;
    if (settings?.activeCats && settings.activeCats.length > 0) {
      const allowed = new Set(settings.activeCats);
      pool = pool.filter(w => allowed.has(w.cat));
    }

    // Exclude suspended words if leechAct === 'suspend' (Section 4.3)
    if (settings?.leechAct === 'suspend') {
      const leechThreshold = settings.leechN || 4;
      pool = pool.filter(w => !isLeech(w, leechThreshold));
    }

    hardCountedRef.current = new Set();

    if (activeMode === 'hard') {
      const wanted = new Set(
        practiceWordIds && practiceWordIds.length > 0
          ? practiceWordIds
          : words.filter(w => (w.bad || 0) > 3).map(w => w.id)
      );
      qIds = buildHardQueue(words.filter(w => wanted.has(w.id)));
    } else if (practiceWordIds && practiceWordIds.length > 0) {
      qIds = [...practiceWordIds];
      if (activeMode === 'synant') {
        qIds = words.filter(w => practiceWordIds.includes(w.id)).map(w => synAntKey(w));
      }
      if (activeMode === 'adjdecl') {
        qIds = buildAdjQueue(words.filter(w => practiceWordIds.includes(w.id)), 15);
      }
    } else if (activeMode === 'synant') {
      const synAntPool: Word[] = pool.filter((w: Word) => splitList(w.syn).length > 0 || splitList(w.ant).length > 0);
      qIds = shuffleArr<Word>(synAntPool)
        .slice(0, 15)
        .map((w: Word) => synAntKey(w));
    } else if (activeMode === 'n2v' || activeMode === 'v2n') {
      qIds = shuffleArr<Word>(pool.filter((w: Word) => familyCands(w, activeMode).length > 0))
        .slice(0, 15)
        .map((w: Word) => w.id);
    } else if (activeMode === 'case') {
      qIds = pickCaseQueue();
    } else if (activeMode === 'adjdecl') {
      qIds = buildAdjQueue(pool, 15);
    } else if (activeMode === 'free') {
      return;
    } else if (activeMode === 'flash' || activeMode === 'review') {
      if (!isFlashConfigured && activeMode === 'flash') return;
      if (flashCat) pool = pool.filter(w => w.cat === flashCat);

      if (activeMode === 'review') {
        pool = pool.filter(w => w.last && w.due <= n).sort((a, b) => a.due - b.due);
      } else {
        const dueWords = pool.filter(w => w.last && w.due <= n);
        const newWords = pool.filter(w => !w.last);

        // Respect session order (Section 3.3)
        const order = settings?.order || 'due';
        if (order === 'new') {
          pool = [...newWords, ...dueWords];
        } else if (order === 'rand') {
          pool = [...dueWords, ...newWords].sort(() => Math.random() - 0.5);
        } else if (order === 'mix') {
          const mixed: Word[] = [];
          const maxLen = Math.max(dueWords.length, newWords.length);
          for (let i = 0; i < maxLen; i++) {
            if (i < dueWords.length) mixed.push(dueWords[i]);
            if (i < newWords.length) mixed.push(newWords[i]);
          }
          pool = mixed;
        } else {
          // 'due' default
          pool = [...dueWords, ...newWords];
        }
      }
      qIds = pool.map(w => w.id).slice(0, settings?.rv || 20);
    } else if (activeMode === 'daily') {
      const due = pool.filter(w => w.last && w.due <= n);
      const nw = pool.filter(w => !w.last);
      const dailyNewLimit = settings?.nw ?? 10;
      const dailyRevLimit = settings?.rv ?? 20;
      qIds = [...due.slice(0, dailyRevLimit), ...nw.slice(0, dailyNewLimit)].map(w => w.id);
    } else if (activeMode === 'art') {
      qIds = pool.filter(w => !!w.art).sort(() => Math.random() - 0.5).slice(0, 15).map(w => w.id);
    } else if (activeMode === 'cloze') {
      qIds = pool.filter(w => !!w.cloze || !!w.ans).sort(() => Math.random() - 0.5).slice(0, 15).map(w => w.id);
    } else if (activeMode === 'plural') {
      qIds = pool.filter(w => !!w.pl).sort(() => Math.random() - 0.5).slice(0, 15).map(w => w.id);
    } else if (activeMode === 'conj') {
      qIds = pool.filter(w => !!w.conj).sort(() => Math.random() - 0.5).slice(0, 15).map(w => w.id);
    } else if (activeMode === 'tense') {
      qIds = pool.filter(w => !!w.prat || !!w.perf).sort(() => Math.random() - 0.5).slice(0, 15).map(w => w.id);
    } else if (activeMode === 'dict' || activeMode === 'prod') {
      qIds = pool.slice().sort(() => Math.random() - 0.5).slice(0, 15).map(w => w.id);
    } else if (activeMode === 'sent') {
      qIds = shuffleArr<Word>(pool).slice(0, 10).map(w => w.id);
    } else if (activeMode === 'freesent') {
      qIds = ['freesent-self'];
    }

    setQueue(qIds);
    setCurrentIndex(0);
    setRevealedCardId(null);
    setUserInput('');
    setCasePrepInput('');
    setCaseArtInput('');
    setCaseResult(null);
    setAnswerResult(null);
    setHintLevel(0);
    setFaShown(false);
    setConjPron(Math.floor(Math.random() * 6));
  }, [activeMode, practiceWordIds, isFlashConfigured, flashCat, settings?.order, settings?.activeCats, settings?.leechAct]);

  // Current item
  const currentItem = useMemo(() => {
    if (queue.length === 0 || currentIndex >= queue.length) return null;
    const id = queue[currentIndex].split('::')[0];
    if (activeMode === 'case') {
      return ALL_CASEQ.find(q => q.id === id) || null;
    }
    if (activeMode === 'freesent') {
      return FREE_SENT_WORD;
    }
    return words.find(w => w.id === id) || null;
    }
    return words.find(w => w.id === id) || null;
  }, [queue, currentIndex, activeMode, words]);

  // Adjective-declension question of the current queue entry
  const adjInfo = useMemo(() => {
    if (qMode !== 'adjdecl' || !currentItem) return null;
    const w = currentItem as Word;
    const [code, specStr] = (currentKind || '').split('~');
    const src = adjSourceByCode(w, code);
    const spec = parseSpec(specStr);
    if (!src || !spec) return null;
    const item = buildAdjItem(src.base, spec);
    return item ? { item, src } : null;
  }, [qMode, currentItem, currentKind]);

  // Fulfills Section 2.2: Independent random direction per card
  // Fulfills Section 5: Flashcard timer per card
  // Fulfills Section 6.1: Automatic audio playback
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    stopSpeaking();

    if (!currentItem) return;

    // Free practice uses its own direction setting, independently of scheduled review settings.
    const defaultDir = settings?.dir || 'de';
    if (hardFlashDir) {
      setCurrentCardDir(hardFlashDir);
    } else if (activeMode === 'free') {
      setCurrentCardDir(freeRnd ? (Math.random() > 0.5 ? 'de' : 'fa') : freeDir);
    } else if (defaultDir === 'rand') {
      setCurrentCardDir(Math.random() > 0.5 ? 'de' : 'fa');
    } else if (activeMode === 'flash') {
      setCurrentCardDir(flashDir === 'rand' ? (Math.random() > 0.5 ? 'de' : 'fa') : flashDir);
    } else {
      setCurrentCardDir(defaultDir);
    }

    // Reset card-specific state (Section 10)
    setRevealedCardId(null);

    const isFlashType = qMode === 'flash' || qMode === 'free' || qMode === 'review';

    // Automatic TTS for question if German is SHOWN (Section 6.1).
    // Never auto-play when only the Persian side is visible: audio would reveal the hidden German word.
    if (isFlashType && settings?.auto && currentCardDir === 'de' && revealedCardId !== currentItem.id) {
      const w = currentItem as Word;
      speak(fullWord(w), {
        rate: settings.rate,
        vreg: settings.vreg,
        voiceName: settings.voice
      });
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopSpeaking();
    };
  }, [currentIndex, currentItem?.id, currentKey, qMode, activeMode, freeDir, freeRnd, flashDir, settings?.dir]);

  // Countdown timer of the current exercise type (one interval at a time, always cleaned up)
  const timerCfg: ExerciseTimerCfg = qMode ? getTimerCfg(settings, qMode) : { on: false, sec: 30 };
  const timerAnswered = !!answerResult || !!caseResult || (!!currentItem && revealedCardId === currentItem.id);
  const hasItem = !!currentItem;
  useEffect(() => {
    if (!activeMode || !hasItem || !timerCfg.on || timerCfg.sec <= 0 || timerAnswered) {
      setTimeLeft(null);
      return;
    }
    let left = timerCfg.sec;
    setTimeLeft(left);
    const id = setInterval(() => {
      if (pausedRef.current) return;
      left -= 1;
      setTimeLeft(left);
      if (left <= 0) {
        clearInterval(id);
        timeUpRef.current();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [activeMode, currentKey, currentIndex, qMode, hasItem, timerCfg.on, timerCfg.sec, timerAnswered]);

  // If a word is deleted while practising (e.g. from the word profile), drop it from the session
  useEffect(() => {
    if (profileModalWord && activeMode !== 'case' && !ALL_CASEQ.some(q => q.id === profileModalWord.id)) {
      if (!words.some(w => w.id === profileModalWord.id)) setProfileModalWord(null);
    }
    if (!activeMode || activeMode === 'case' || queue.length === 0) return;
    const exists = new Set(words.map(w => w.id));
    const keep = queue.map(k => exists.has(k.split('::')[0]));
    if (keep.every(Boolean)) return;
    const removedBefore = keep.slice(0, currentIndex).filter(x => !x).length;
    const currentRemoved = currentIndex < keep.length && !keep[currentIndex];
    setQueue(queue.filter((_, i) => keep[i]));
    setCurrentIndex(Math.max(0, currentIndex - removedBefore));
    if (currentRemoved) {
      setRevealedCardId(null);
      setUserInput('');
      setCasePrepInput('');
      setCaseArtInput('');
      setCaseResult(null);
      setAnswerResult(null);
      setHintLevel(0);
    setFaShown(false);
    setConjPron(Math.floor(Math.random() * 6));
    }
  }, [words]);

  // Advance to next question
  const advanceQuestion = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    stopSpeaking();
    setCurrentIndex(prev => prev + 1);
    setRevealedCardId(null);
    setUserInput('');
    setCasePrepInput('');
    setCaseArtInput('');
    setCaseResult(null);
    setAnswerResult(null);
    setHintLevel(0);
    setFaShown(false);
    setConjPron(Math.floor(Math.random() * 6));
  };

  const handleFlashGrade = (grade: number) => {
    if (!currentItem) return;
    record(currentItem, qMode || 'flash', grade);
    if (grade === 0) {
      setQueue(prev => [...prev, currentKey]);
    }
    advanceQuestion();
  };

  const handleFreeKnow = (know: number) => {
    if (!currentItem) return;
    setKnownMap(prev => ({ ...prev, [currentItem.id]: know }));
    advanceQuestion();
  };

  // User manual reveal
  const handleRevealCard = () => {
    if (!currentItem) return;
    setRevealedCardId(currentItem.id);
    if (timerRef.current) clearInterval(timerRef.current);

    // Audio on reveal (Section 6.1 & 6.2) — only if the German side is the newly revealed one
    const w = currentItem as Word;
    if ((settings?.auto || settings?.autoEx) && currentCardDir === 'de') {
      stopSpeaking();
      speak(fullWord(w), {
        rate: settings?.rate,
        vreg: settings?.vreg,
        voiceName: settings?.voice,
        onEnd: () => {
          if (settings?.autoEx && w.ex) {
            speak(w.ex, {
              rate: settings.rate,
              vreg: settings.vreg,
              voiceName: settings.voice
            });
          }
        }
      });
    }
  };

  // Fulfills Section 19: Check Case and Preposition Exercise with TWO separate blanks
  const runCaseCheck = (force: boolean) => {
    if (!currentItem || answerResult) return;
    const q = currentItem as CaseQuestion;

    const prep = casePrepInput.trim().toLowerCase();
    const art = caseArtInput.trim().toLowerCase();

    if (!prep && !art && !force) {
      onShowToast('لطفاً هر دو جای خالی را پر کنید.', true);
      return;
    }

    const prepExpected = q.prepAns.toLowerCase();
    const artExpected = q.artAns.toLowerCase();

    const isPrepOk = prep === prepExpected;
    const isArtOk = art === artExpected;

    setCaseResult({ prepOk: isPrepOk, artOk: isArtOk });

    let msg = '';
    const isBothOk = isPrepOk && isArtOk;

    if (isBothOk) {
      msg = `✔ آفرین! هر دو بخش درست است. (${q.prepAns} ${q.artAns})`;
    } else if (!isPrepOk && isArtOk) {
      msg = `❌ حرف اضافه نادرست است (درست: «${q.prepAns}») • آرتیکل درست بود («${q.artAns}»)`;
    } else if (isPrepOk && !isArtOk) {
      msg = `✔ حرف اضافه درست است («${q.prepAns}») • ❌ آرتیکل نادرست است (درست: «${q.artAns}»)`;
    } else {
      msg = `❌ هر دو نادرست است (حرف اضافه درست: «${q.prepAns}» • آرتیکل درست: «${q.artAns}»)`;
    }

    setAnswerResult({
      ok: isBothOk ? 1 : 0,
      exp: `${q.prepAns} ${q.artAns}`,
      msg
    });

    record(q, 'case', isBothOk ? 2 : (isPrepOk || isArtOk ? 1 : 0));
    if (!isBothOk) {
      setQueue(prev => [...prev, currentKey]);
    }
  };

  // Check standard interactive text exercises
  const runCheckAnswer = (force: boolean) => {
    if (!currentItem || answerResult) return;
    const trimmed = userInput.trim();
    if (!trimmed && !force) {
      onShowToast('لطفاً پاسخ را وارد کنید.', true);
      return;
    }

    const w = currentItem as Word;

    if (qMode === 'conj') {
      const chk = checkConjAnswer(w.conj, conjPron, trimmed, w.de);
      const res = {
        ok: chk.ok ? 1 : 0,
        exp: chk.target,
        msg: chk.ok
          ? undefined
          : chk.wrongPron
            ? `ضمیر «${chk.wrongPron}» با سؤال نمی‌خواند؛ سؤال برای «${P6[conjPron]}» است. شکل درست: ${chk.target}`
            : chk.missingPart
              ? `فعل جداشدنی کامل نیست؛ جزء «${chk.target.split(/\s+/).slice(1).join(' ')}» هم لازم است. شکل درست: ${chk.target}`
              : chk.otherIdx >= 0
                ? `این شکل مربوط به «${P6[chk.otherIdx]}» است؛ سؤال برای «${P6[conjPron]}» است. شکل درست: ${chk.target}`
                : `شکل درست برای «${P6[conjPron]}»: ${chk.target}`,
        cands: chk.cands
      };
      setAnswerResult(res);
      record(w, 'conj', chk.ok ? (faShown ? 1 : 2) : 0);
      return;
    }

    if (qMode === 'tense') {
      const expPrat = w.prat || '';
      const expPerf = w.perf || '';
      const isCorrect =
        trimmed.toLowerCase() === expPrat.toLowerCase() ||
        trimmed.toLowerCase() === expPerf.toLowerCase() ||
        trimmed.toLowerCase() === `er ${expPrat}`.toLowerCase();
      const res = {
        ok: isCorrect ? 1 : 0,
        exp: expPrat || expPerf,
        msg: isCorrect ? undefined : `شکل‌های درست: Prät: ${w.prat} • Perf: ${w.perf}`,
        cands: [expPrat, expPerf, expPrat ? `er ${expPrat}` : ''].filter(Boolean)
      };
      setAnswerResult(res);
      record(w, 'tense', isCorrect ? (faShown ? 1 : 2) : 0);
      return;
    }

    if (qMode === 'plural') {
      const base = (w.pl || '').trim().replace(/^die\s+/i, '');
      const cands = [base, `die ${base}`];
      const isCorrect = cands.some(c => nz(c) === nz(trimmed));
      setAnswerResult({
        ok: isCorrect ? 1 : 0,
        exp: base,
        msg: isCorrect ? undefined : `شکل جمع درست: ${base}`,
        cands
      });
      record(w, 'plural', isCorrect ? (hintLevel > 0 || faShown ? 1 : 2) : 0);
      if (!isCorrect) setQueue(prev => [...prev, currentKey]);
      return;
    }

    if (qMode === 'adjdecl') {
      if (!adjInfo) return;
      const { item } = adjInfo;
      const clean = nz2(trimmed);
      const isCorrect = clean === nz2(item.answer);
      let msg: string | undefined;
      if (!isCorrect) {
        if (clean === nz2(item.base)) {
          msg = `شکل پایه را نوشته‌اید؛ در این جمله صفت پایانه می‌گیرد: ${item.answer}`;
        } else if (/\s/.test(trimmed)) {
          msg = `فقط خودِ صفت را بنویسید (آرتیکل و اسم در جمله آمده‌اند): ${item.answer}`;
        } else {
          msg = `شکل درست صفت: ${item.answer}  (پایانهٔ «-${item.ending}»)`;
        }
      }
      setAnswerResult({ ok: isCorrect ? 1 : 0, exp: item.answer, msg, cands: [item.answer] });
      record(w, 'adjdecl', isCorrect ? (hintLevel > 0 || faShown ? 1 : 2) : 0);
      if (!isCorrect) setQueue(prev => [...prev, currentKey]);
      return;
    }

    if (qMode === 'synant') {
      const isAnt = currentKind === 'ant';
      const cands = splitList(isAnt ? w.ant : w.syn);
      const sa = checkSynAnt(cands, trimmed, c => words.find(x => nz(x.de) === nz(c) && !!x.art)?.art || '');
      const isCorrect = sa.ok;
      setAnswerResult({
        ok: isCorrect ? 1 : 0,
        exp: cands[0] || '',
        msg: isCorrect ? undefined : (sa.msg ? `${sa.msg} — ${isAnt ? 'متضاد' : 'مترادف'}ها: ${cands.join('، ')}` : `${isAnt ? 'متضاد' : 'مترادف'} درست: ${cands.join('، ')}`),
        cands
      });
      record(w, 'synant', isCorrect ? (hintLevel > 0 || faShown ? 1 : 2) : 0);
      if (!isCorrect) setQueue(prev => [...prev, currentKey]);
      return;
    }

    if (qMode === 'n2v' || qMode === 'v2n') {
      const cands = familyCands(w, qMode);
      const noSich = (x: string) => nz(x.replace(/^sich\s+/i, ''));
      const isCorrect = qMode === 'n2v'
        ? cands.some(c => noSich(c) === noSich(trimmed))
        : cands.some(c => nz(c) === nz(trimmed));
      let msg: string | undefined;
      if (!isCorrect) {
        const bare = cands.find(c => nz(c.replace(/^(der|die|das)\s+/i, '')) === nz(trimmed));
        msg = qMode === 'v2n' && bare
          ? `آرتیکل را ننوشتید؛ پاسخ درست: ${bare}`
          : `${qMode === 'n2v' ? 'فعل' : 'اسم'} هم‌خانوادهٔ درست: ${cands.join('، ')}`;
      }
      setAnswerResult({ ok: isCorrect ? 1 : 0, exp: cands[0] || '', msg, cands });
      record(w, qMode, isCorrect ? (hintLevel > 0 || faShown ? 1 : 2) : 0);
      if (!isCorrect) setQueue(prev => [...prev, currentKey]);
      return;
    }

    const r = checkWord(w, trimmed, qMode || 'cloze');
    setAnswerResult({ ok: r.ok, exp: r.exp, msg: r.msg, cands: r.cands && r.cands.length ? r.cands : [r.exp, ...(w.acc || [])] });
    record(w, qMode || 'cloze', r.ok ? (hintLevel > 0 || faShown ? 1 : 2) : 0);
    if (!r.ok) {
      setQueue(prev => [...prev, currentKey]);
    }
  };

  const handleCheckCaseAnswer = () => runCaseCheck(false);
  const handleCheckAnswer = () => runCheckAnswer(false);

  // Article choice (der / die / das); an empty choice means "time is up" and counts as wrong
  const answerArt = (art: string) => {
    if (!currentItem || answerResult) return;
    const w = currentItem as Word;
    const ok = !!art && w.art.toLowerCase() === art;
    setAnswerResult({
      ok: ok ? 1 : 0,
      exp: `${w.art} ${w.de}`,
      msg: ok ? undefined : `آرتیکل درست: ${w.art}`
    });
    record(w, 'art', ok ? (faShown ? 1 : 2) : 0);
  };

  // What happens when the countdown reaches zero
  timeUpRef.current = () => {
    if (!currentItem) return;
    if (qMode === 'flash' || qMode === 'free' || qMode === 'review' || qMode === 'daily') {
      setRevealedCardId(currentItem.id);
    } else if (qMode === 'sent') {
      setSentTimeUp(n => n + 1);
    } else if (qMode === 'freesent') {
      // free writing: timer expiry has no automatic action
    } else if (qMode === 'art') {
      answerArt('');
    } else if (qMode === 'case') {
      runCaseCheck(true);
    } else {
      runCheckAnswer(true);
    }
  };

  // Open Full Word Profile Modal from ANY exercise (Section 21)
  const handleOpenWordProfile = () => {
    if (!currentItem) return;
    // adjdecl: show the adjective actually used in the blank, not the training word
    if (qMode === 'adjdecl' && adjInfo) {
      const base = String(adjInfo.item.base || adjInfo.src.base || '').trim().toLowerCase();
      if (base) {
        const matched = words.find(w => nz(w.de) === nz(base));
        if (matched) { setProfileModalWord(matched); return; }
        setProfileModalWord({
          id: `adj-${base}`,
          de: base,
          art: '',
          fa: adjInfo.src.fa || '',
          pos: 'صفت',
          lvl: (currentItem as Word).lvl || 'A2',
          cat: (currentItem as Word).cat || 'گرامر',
          ex: '', exFa: '', ex2: '', ex2Fa: '',
          notes: '',
          syn: '', synFa: '', ant: '', antFa: '', pl: '', conj: '', prat: '', perf: '', sep: '',
          cloze: '', ans: '', acc: [], tags: '', img: '',
          added: Date.now(), last: 0, due: 0, ivl: 0, ease: 2.5, stage: 0, ok: 0, bad: 0, res: ''
        } as Word);
        return;
      }
    }
    if (qMode === 'case') {
      const q = currentItem as CaseQuestion;
      const cleanNoun = q.n.replace(/^(der|die|das)\s+/i, '').trim();
      const matched = words.find(w => w.de.toLowerCase() === cleanNoun.toLowerCase());
      if (matched) {
        setProfileModalWord(matched);
      } else {
        setProfileModalWord({
          id: q.id,
          de: cleanNoun,
          art: (q.n.match(/^(der|die|das)/i) || [''])[0].toLowerCase(),
          fa: q.fa,
          ex: q.ex,
          exFa: q.exFa,
          ex2: '',
          ex2Fa: '',
          notes: `${q.r}\nحالت دستوری: ${q.c}`,
          pos: 'اسم',
          lvl: 'A1',
          cat: 'گرامر و حالت‌ها',
          added: Date.now(),
          last: 0,
          due: 0,
          ivl: 0,
          ease: 2.5,
          stage: 0,
          ok: 0,
          bad: 0,
          res: '',
          syn: '',
          synFa: '',
          ant: '',
          antFa: '',
          pl: '',
          conj: '',
          prat: '',
          perf: '',
          sep: '',
          cloze: '',
          ans: '',
          acc: [],
          tags: '',
          img: ''
        });
      }
    } else {
      setProfileModalWord(currentItem as Word);
    }
  };

  // Unified clean card display (revealed face)
  const renderUnifiedWordCard = (w: Word, opts?: { hideConj?: boolean }) => {
    return (
      <div className="bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 space-y-3 text-right">
        {/* Top: Word, Article, Translation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 dark:border-slate-800 pb-2">
          <div className="flex items-center gap-2" dir="ltr">
            {w.art && (
              <span className={`px-2 py-0.5 rounded-lg font-bold text-sm ${
                w.art === 'der' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' :
                w.art === 'die' ? 'bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300' :
                'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
              }`}>
                {w.art}
              </span>
            )}
            <span className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-slate-100 font-sans">
              {w.de}
            </span>
            <button
              onClick={() => speak(fullWord(w), { rate: settings?.rate, vreg: settings?.vreg, voiceName: settings?.voice })}
              className="w-7 h-7 rounded-full bg-white dark:bg-slate-800 text-sm flex items-center justify-center shadow-xs"
              title="تلفظ"
            >
              🔊
            </button>
          </div>

          <div className="text-base md:text-lg font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">
            {w.fa}
          </div>
        </div>

        {/* Synonyms & Antonyms */}
        {(w.syn || w.ant) && (
          <div className="flex flex-wrap items-center gap-4 text-sm md:text-base">
            {w.syn && (
              <div>
                <span className="font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">مترادف: </span>
                <span className="font-semibold" dir="ltr">{w.syn}</span>
                {w.synFa && <span className="text-[#5d6676]"> ({w.synFa})</span>}
              </div>
            )}
            {w.ant && (
              <div>
                <span className="font-bold text-amber-600 dark:text-amber-400">متضاد: </span>
                <span className="font-semibold" dir="ltr">{w.ant}</span>
                {w.antFa && <span className="text-[#5d6676]"> ({w.antFa})</span>}
              </div>
            )}
          </div>
        )}

        {/* Phase 3: German definition above the example */}
        {w.def && (
          <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200/70 dark:border-indigo-900 p-2.5 rounded-xl text-sm" dir="ltr">
            <span className="text-[10px] font-bold text-[#4338ca] dark:text-[#a5b4fc] uppercase">Bedeutung: </span>
            <span className="font-sans font-semibold text-slate-800 dark:text-slate-100">{w.def}</span>
          </div>
        )}
        {/* Example sentences - revealed ONLY when card is revealed (Section 11) */}
        {(w.ex || w.ex2) && (
          <div className="space-y-2 pt-1">
            {w.ex && (
              <div className="bg-white dark:bg-[#1b2029] p-3 rounded-xl border border-slate-200/60 dark:border-slate-800 space-y-1">
                <div className="flex items-center justify-between gap-2" dir="ltr">
                  <p className="text-sm md:text-base md:text-base font-semibold text-slate-800 dark:text-slate-200 text-left">
                    {w.ex}
                  </p>
                  <button onClick={() => speak(w.ex, { rate: settings?.rate, vreg: settings?.vreg, voiceName: settings?.voice })} className="text-sm">🔊</button>
                </div>
                {w.exFa && (
                  <p className="text-sm md:text-base text-[#5d6676] dark:text-[#a3adbd] text-right" dir="rtl">
                    {w.exFa}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Verb table: two columns LTR — ich/du/er left, wir/ihr/sie right */}
        {w.conj && !opts?.hideConj && (
          (() => {
            const forms = splitConj(w.conj);
            const [colL, colR] = splitConjColumns(forms);
            const renderCol = (col: string[], offset: number) => (
              <div className="flex-1 min-w-[140px] space-y-1.5">
                {col.map((f, i) => (
                  <div key={offset + i} className="flex items-baseline justify-between gap-2" dir="ltr">
                    <span className="text-xs font-bold text-slate-400 flex-shrink-0">{P6[offset + i]}</span>
                    <span className="min-w-0 text-right">
                      <HighlightedVerbForm verb={w.de} form={f} pronounIndex={offset + i} sep={w.sep} />
                    </span>
                  </div>
                ))}
              </div>
            );
            return (
              <div className="text-sm md:text-base bg-white dark:bg-[#1b2029] p-3 rounded-xl border border-slate-200/60 dark:border-slate-800">
                <div className="flex gap-4" dir="ltr">
                  {renderCol(colL, 0)}
                  <div className="w-px bg-slate-200 dark:border-slate-800 self-stretch" />
                  {renderCol(colR, 3)}
                </div>
              </div>
            );
          })()
        )}
        
        {/* Image if available */}
        {w.img && (
          <div className="text-center pt-1">
            <img src={w.img} alt={w.de} className="max-h-40 mx-auto rounded-xl object-contain shadow-xs" />
          </div>
        )}
      </div>
    );
  };

  // ==========================================
        
  const [exTab, setExTab] = useState<'wortschatz' | 'grammatik'>('wortschatz');   
  // If NO active mode is selected: Show Menu
  // ==========================================
  if (!activeMode) {
    return (
      <div className="space-y-4 text-right max-w-2xl mx-auto">
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 shadow-xs">
          <h2 className="text-base md:text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">
            🎯 مرکز تمرین‌های زبان آلمانی
          </h2>
          <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">
            مهارت‌های واژگان، گرامر، زمان‌ها و آرتیکل‌ها را با سیستم‌های فاصله‌دار و تمرین‌های تعاملی تقویت کنید.
          </p>
        </div>

        <div className="space-y-2.5">
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setExTab('wortschatz')}
              className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition ${exTab === 'wortschatz' ? 'bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white shadow-xs' : 'bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] text-slate-600 dark:text-slate-300'}`}
              >
              📚 Wortschatz üben
            </button>
            <button
              onClick={() => setExTab('grammatik')}
              className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition ${exTab === 'grammatik' ? 'bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white shadow-xs' : 'bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] text-slate-600 dark:text-slate-300'}`}
              >
              🧩 Grammatik üben             
            </button>
          </div>
          {(exTab === 'wortschatz' ? WORTSCHATZ_MODES : GRAMMATIK_MODES).map(mode => {
            const info = EXERCISE_NAMES[mode];
            return (
              <div
                key={mode}
                className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-3.5 hover:border-[#1f5fbf] transition flex items-center justify-between gap-3 shadow-xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-2xl flex-shrink-0">{info.icon}</span>
                  <div className="min-w-0">
                    <b className="text-sm md:text-base text-slate-900 dark:text-slate-100 block">
                      {info.title}
                    </b>
                    <span className="text-xs text-[#5d6676] dark:text-[#a3adbd] truncate block">
                      {info.desc}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => onSelectMode(mode)}
                  className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-4 py-2 rounded-xl text-xs md:text-sm font-bold shadow-xs hover:opacity-95 transition flex-shrink-0"
                >
                  شروع ▶
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Flashcard setup modal if needed
  if (activeMode === 'flash' && !isFlashConfigured) {
    return (
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-5 md:p-6 shadow-sm space-y-4 text-right max-w-xl mx-auto">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h2 className="text-base md:text-lg font-bold flex items-center gap-2">
            <span>🃏</span>
            <span>تنظیمات شروع جلسهٔ فلش‌کارت</span>
          </h2>
          <button
            onClick={() => onSelectMode(null)}
            className="text-xs bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 px-3 py-1 rounded-xl font-semibold"
          >
            ↩ بازگشت
          </button>
        </div>

        <div>
          <label className="block text-xs font-bold mb-1.5">تمرین مخصوص یک دستهٔ خاص (اختیاری):</label>
          <select
            value={flashCat}
            onChange={e => setFlashCat(e.target.value)}
            className="w-full bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3.5 py-2 text-xs md:text-sm outline-none"
          >
            <option value="">همهٔ دسته‌ها (کلیت واژگان)</option>
            {categories.map(([c, n]) => (
              <option key={c} value={c}>
                {c} ({n} واژه)
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold mb-1.5">کدام جهت را می‌خواهید تمرین کنید؟</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              onClick={() => {
                setFlashDir('de');
                setIsFlashConfigured(true);
              }}
              className="py-3 px-3 bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white rounded-xl font-bold text-xs md:text-sm shadow-xs transition"
            >
              🇩🇪 آلمانی ← فارسی
            </button>
            <button
              onClick={() => {
                setFlashDir('fa');
                setIsFlashConfigured(true);
              }}
              className="py-3 px-3 bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white rounded-xl font-bold text-xs md:text-sm shadow-xs transition"
            >
              🇮🇷 فارسی ← آلمانی
            </button>
            <button
              onClick={() => {
                setFlashDir('rand');
                setIsFlashConfigured(true);
              }}
              className="py-3 px-3 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold text-xs md:text-sm shadow-xs transition"
            >
              🔀 تصادفی مستقل هر کارت
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // Independent Free Category Review setup
  // ==========================================
  if (activeMode === 'free' && !isFreeStarted) {
    const selectedCount = words.filter(w => !freeCat || w.cat === freeCat).length;


    return (
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-5 md:p-6 shadow-sm space-y-5 text-right max-w-xl mx-auto">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h2 className="text-base md:text-lg font-bold flex items-center gap-2"><span>📚</span> مرور آزاد دسته</h2>
          <button onClick={() => onSelectMode(null)} className="text-xs bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 px-3 py-1 rounded-xl font-semibold">↩ بازگشت</button>
        </div>
        <div>
          <label className="block text-xs font-bold mb-1.5">دستهٔ واژگان</label>
          <select value={freeCat} onChange={e => { setFreeCat(e.target.value); }} className="w-full bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3.5 py-2 text-sm">
            <option value="">همهٔ دسته‌ها ({words.length} واژه)</option>
            {categories.map(([cat, count]) => <option key={cat} value={cat}>{cat} ({count} واژه)</option>)}
          </select>
          <p className="text-xs text-[#5d6676] dark:text-[#a3adbd] mt-1.5">{selectedCount} واژه در این انتخاب؛ مستقل از سررسید و جعبه‌های لایتنر.</p>
        </div>
        <div>
          <label className="block text-xs font-bold mb-1.5">جهت تمرین</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button onClick={() => { setFreeDir('de'); setFreeRnd(false); }} className={`py-3 px-3 rounded-xl font-bold text-xs md:text-sm transition ${!freeRnd && freeDir === 'de' ? 'bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>🇩🇪 آلمانی ← فارسی</button>
            <button onClick={() => { setFreeDir('fa'); setFreeRnd(false); }} className={`py-3 px-3 rounded-xl font-bold text-xs md:text-sm transition ${!freeRnd && freeDir === 'fa' ? 'bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>🇮🇷 فارسی ← آلمانی</button>
            <button onClick={() => { setFreeRnd(true); }} className={`py-3 px-3 rounded-xl font-bold text-xs md:text-sm transition ${freeRnd ? 'bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>🔀 تصادفی برای هر کارت</button>
          </div>
        </div>
        <button disabled={selectedCount === 0} onClick={() => {
          const freeWords = words.filter(w => !freeCat || w.cat === freeCat);
          setQueue(freeWords.map(w => w.id));
          setCurrentIndex(0);
          setKnownMap({});
          setRevealedCardId(null);
          setIsFreeStarted(true);
        }} className="w-full bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] disabled:opacity-40 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-md">
          {selectedCount ? `شروع مرور (${selectedCount} واژه) ▶` : 'این دسته واژه‌ای ندارد'}
        </button>
        {selectedCount === 0 && <p className="text-sm text-amber-700 dark:text-amber-300">این دسته واژه‌ای ندارد. دستهٔ دیگری انتخاب کنید.</p>}
      </div>
    );
  }

  // ==========================================
  // Active Exercise Runner
  // ==========================================
  const progressPercent = queue.length > 0 ? Math.round(((currentIndex + 1) / queue.length) * 100) : 0;
  const isFlashType = qMode === 'flash' || qMode === 'free' || qMode === 'review' || qMode === 'daily';
  const isCardRevealed = !!currentItem && revealedCardId === currentItem.id;

  // Persian translations stay hidden until the learner asks for them (or has answered)
  const faVisible = faShown || !!answerResult || !!caseResult;
  const faButton = (
    <button
      type="button"
      onClick={() => setFaShown(true)}
      className="px-3 py-1 rounded-full bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/40 text-sky-800 dark:text-sky-200 border border-sky-200 dark:border-sky-800 text-[11px] font-bold transition"
    >
      👁 مشاهدهٔ ترجمه
    </button>
  );

  if (queue.length === 0 || currentIndex >= queue.length || !currentItem) {
    return (
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-7 text-center space-y-4 max-w-xl mx-auto shadow-sm">
        <span className="text-4xl block">🎉</span>
        <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100">
          تبریک! تمرین به پایان رسید.
        </h3>
        <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">
          {queue.length === 0 && (activeMode === 'synant' || activeMode === 'n2v' || activeMode === 'v2n')
            ? activeMode === 'synant'
              ? 'هنوز هیچ واژه‌ای در کتابخانه، مترادف یا متضاد ثبت‌شده ندارد (یا در دسته‌های فعال فعلی نیست). این تمرین از فیلدهای «مترادف» و «متضاد» واژه‌ها استفاده می‌کند.'
              : 'هنوز واژه‌ای با «خانواده واژگانی» مناسب پیدا نشد. این تمرین از خط «خانواده واژگانی: اسم: ... | فعل مرتبط: ...» در یادداشت واژه‌ها استفاده می‌کند.'
            : 'تمامی پرسش‌های این بخش با موفقیت مرور و بررسی شدند.'}
        </p>
        <button
          onClick={() => onSelectMode(null)}
          className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-6 py-2.5 rounded-xl font-bold text-xs md:text-sm shadow-md"
        >
          بازگشت به مرکز تمرین‌ها
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-right max-w-2xl mx-auto pb-10">
      {/* Exercise Top Bar */}
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl px-4 py-2.5 flex items-center justify-between gap-2 shadow-xs">
        {/* Title (help icon moved into the standardized toolbar) */}
        <div className="flex items-center gap-2">
          <span className="font-extrabold text-sm md:text-base text-slate-900 dark:text-slate-100">
            {EXERCISE_NAMES[activeMode]?.title}
          </span>
        </div>

        {/* Phase 2 Sec.1: standardized toolbar — exit leftmost, then profile, then timer (LTR row) */}
        <div className="flex items-center gap-2" dir="ltr">
          <IconBtn onClick={() => onSelectMode(null)} title="خروج از تمرین"><X size={18} className="text-red-500" /></IconBtn>
          {qMode !== 'freesent' && (
           <IconBtn onClick={handleOpenWordProfile} title="شناسنامه واژه"><BookOpen size={18} className="text-violet-500" /></IconBtn>
          )}
         {activeMode !== 'case' && qMode !== 'sent' && qMode !== 'freesent' && currentItem && (
            <IconBtn onClick={() => setSentenceModalWord(currentItem as Word)} title="ساخت جمله با این واژه"><PencilLine size={18} className="text-emerald-600" /></IconBtn>
          )}
          <IconBtn onClick={() => onOpenHelp(activeMode)} title="راهنمای این تمرین"><HelpCircle size={18} className="text-[#1f5fbf]" /></IconBtn>
          {activeMode !== 'hard' && qMode && (
            <span className="relative">
              <IconBtn onClick={() => { setTimerSecDraft(null); setTimerPopupOpen(true); }} title="تایمر این تمرین" active={timerCfg.on}><TimerIcon size={18} className={timerCfg.on ? 'text-orange-500' : 'text-slate-500'} /></IconBtn>
              {timerCfg.on && <span className="absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full bg-red-500" />}
            </span>
          )}
        </div>
      </div>

      {sentenceModalWord && (
        <SentenceBuilderModal
          word={sentenceModalWord}
          onClose={() => setSentenceModalWord(null)}
          onShowToast={onShowToast}
        />
      )}

      {/* Progress & Subtitle */}
      <div className="space-y-1.5">
        <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
          <div
            className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] h-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-[#5d6676] dark:text-[#a3adbd]">
          <span className="font-medium">
            سؤال {currentIndex + 1} از {queue.length}
            {timerCfg.on && timeLeft !== null && !timerAnswered && (
              <span className="mr-2 px-2 py-0.5 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 font-bold font-mono">
                ⏱ {Math.max(0, timeLeft)}s
              </span>
            )}
          </span>
          <span>{progressPercent}٪ تکمیل</span>
        </div>
      </div>

      {/* Active Card Body */}
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-5 md:p-7 shadow-sm space-y-4">
        {activeMode === 'hard' && qMode && (
          <div className="flex justify-center">
            <span className="px-3 py-1 rounded-full bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 text-[11px] font-bold">
              {currentSub === 'flashFa'
                ? '🎴 فلش‌کارت فارسی ← آلمانی'
                : currentSub === 'flashDe'
                  ? '🎴 فلش‌کارت آلمانی ← فارسی'
                  : `${EXERCISE_NAMES[qMode].icon} ${EXERCISE_NAMES[qMode].title}`}
            </span>
          </div>
        )}
        {/* ========================================================= */}
        {/* FLASHCARD / REVIEW CARD (Sections 10 & 11) */}
        {/* ========================================================= */}
        {isFlashType && (() => {
          const w = currentItem as Word;
          const isFaDir = currentCardDir === 'fa';

          return (
            <div className="space-y-4 text-center">
              {/* Question Face */}
              {!isFaDir ? (
                <div className="py-4 space-y-2">
                  <div className="flex items-center justify-center gap-2" dir="ltr">
                    {w.art && (
                      <span className={`px-2.5 py-0.5 rounded-lg font-bold text-sm ${
                        w.art === 'der' ? 'text-blue-600 dark:text-blue-400' :
                        w.art === 'die' ? 'text-pink-600 dark:text-pink-400' :
                        'text-emerald-600 dark:text-emerald-400'
                      }`}>
                        {w.art}
                      </span>
                    )}
                    <span className="text-3xl md:text-4xl font-extrabold font-sans text-slate-900 dark:text-slate-100">
                      {w.de}
                    </span>
                    <button
                      onClick={() => speak(fullWord(w), { rate: settings?.rate, vreg: settings?.vreg, voiceName: settings?.voice })}
                      className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-sm flex items-center justify-center"
                    >
                      🔊
                    </button>
                  </div>
                  {w.pos && <span className="text-xs text-[#5d6676]">{w.pos}</span>}
                </div>
              ) : (
                <div className="py-4 space-y-2">
                  <div className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-slate-100" dir="rtl">
                    {w.fa}
                  </div>
                  {w.pos && <span className="text-xs text-[#5d6676]">{w.pos}</span>}
                </div>
              )}

              {/* Reveal Action Button (Section 10 & 11: Examples & answers strictly hidden until revealed) */}
              {!isCardRevealed ? (
                <div className="pt-2">
                  <button
                    onClick={handleRevealCard}
                    className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-md hover:opacity-95 transition"
                  >
                    👁 {isFaDir ? 'نمایش لغت آلمانی و جزئیات' : 'نمایش ترجمه و جزئیات'}
                  </button>
                </div>
              ) : (
                <>
                  {renderUnifiedWordCard(w)}

                  {/* Rating / Decision Buttons */}
                  {qMode === 'free' ? (
                    <div className="flex items-center justify-center gap-3 pt-3">
                      <button
                        onClick={() => handleFreeKnow(0)}
                        className="bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-300 border border-red-200 dark:border-red-800 px-5 py-2.5 rounded-xl font-bold text-xs md:text-sm transition flex-1 max-w-xs"
                      >
                        ❌ هنوز نه
                      </button>
                      <button
                        onClick={() => handleFreeKnow(1)}
                        className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-5 py-2.5 rounded-xl font-bold text-xs md:text-sm transition flex-1 max-w-xs"
                      >
                        ✅ بلدم
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3">
                      <button
                        onClick={() => handleFlashGrade(0)}
                        className="bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-300 border border-red-200 dark:border-red-900 py-2.5 px-2 rounded-xl text-xs font-bold"
                      >
                        دوباره · {intervalPreview(w, 0, settings?.ivlMod || 1.0)}
                      </button>
                      <button
                        onClick={() => handleFlashGrade(1)}
                        className="bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-900 py-2.5 px-2 rounded-xl text-xs font-bold"
                      >
                        سخت · {intervalPreview(w, 1, settings?.ivlMod || 1.0)}
                      </button>
                      <button
                        onClick={() => handleFlashGrade(2)}
                        className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 py-2.5 px-2 rounded-xl text-xs font-bold"
                      >
                        خوب · {intervalPreview(w, 2, settings?.ivlMod || 1.0)}
                      </button>
                      <button
                        onClick={() => handleFlashGrade(3)}
                        className="bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-900 py-2.5 px-2 rounded-xl text-xs font-bold"
                      >
                        آسان · {intervalPreview(w, 3, settings?.ivlMod || 1.0)}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })()}

        {/* ========================================================= */}
        {/* ARTICLE PRACTICE (der / die / das) */}
        {/* ========================================================= */}
        {qMode === 'art' && (() => {
          const w = currentItem as Word;
          return (
            <div className="space-y-4 text-center">
              <p className="text-xs text-[#5d6676]">آرتیکل درست برای این اسم کدام است؟</p>
              <div className="text-3xl font-extrabold font-sans py-2" dir="ltr">
                {w.de}
              </div>
              <div className="text-sm font-semibold text-[#1f5fbf]">{faVisible ? w.fa : faButton}</div>

              {!answerResult ? (
                <div className="grid grid-cols-3 gap-3 pt-2 max-w-sm mx-auto">
                  {['der', 'die', 'das'].map(art => (
                    <button
                      key={art}
                      onClick={() => answerArt(art)}
                      className={`py-3 rounded-2xl font-bold text-lg font-sans transition ${
                        art === 'der' ? 'bg-blue-100 hover:bg-blue-200 text-blue-900' :
                        art === 'die' ? 'bg-pink-100 hover:bg-pink-200 text-pink-900' :
                        'bg-emerald-100 hover:bg-emerald-200 text-emerald-900'
                      }`}
                    >
                      {art}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  <div className={`p-3 rounded-xl text-base font-bold leading-relaxed ${
                    answerResult.ok ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {answerResult.ok ? '✔ آفرین! درست بود.' : `✘ ${answerResult.msg}`}
                  </div>
                  {renderUnifiedWordCard(w)}
                  <button
                    onClick={advanceQuestion}
                    className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-6 py-2 rounded-xl text-xs md:text-sm font-bold shadow-xs"
                  >
                    سؤال بعدی ⬅
                  </button>
                </div>
              )}
            </div>
          );
        })()}

        {/* ========================================================= */}
        {/* Fulfills Section 19: REDESIGNED CASE AND PREPOSITION WITH 2 BLANKS */}
        {/* ========================================================= */}
        {qMode === 'case' && (() => {
          const q = currentItem as CaseQuestion;
          const bareNoun = q.n.replace(/^(der|die|das|den|dem|des)\s+/i, '').trim();
          const remainingHints = Math.max(0, 2 - hintLevel);

          return (
            <div className="space-y-4 text-center">
              <p className="text-sm font-semibold text-[#5d6676]">
                دو جای خالی زیر را کامل کنید (حرف اضافه و آرتیکل):
                <span className="mr-2 px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 text-[11px] font-bold">
                  سطح {(currentItem as CaseQuestion).cs || 1}
                </span>
              </p>

              {/* Sentence with 2 blanks */}
              <div className="text-xl md:text-2xl font-bold font-sans py-2 text-slate-900 dark:text-slate-100" dir="ltr">
                {q.s}
              </div>

              <div className="text-xs text-[#5d6676]">
                کلمه مرجع: <span className="font-bold font-sans" dir="ltr">({bareNoun})</span>
                {' — '}
                {faVisible ? q.fa : faButton}
              </div>

              {!answerResult ? (
                <div className="space-y-3 pt-2 max-w-md mx-auto">
                  {/* Two Separate Inputs (Section 19) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-right">
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 dark:text-slate-300">
                        ۱. حرف اضافه (Preposition):
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        placeholder="مثلاً auf / in / mit..."
                        value={casePrepInput}
                        onChange={e => setCasePrepInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleCheckCaseAnswer();
                        }}
                        className="w-full bg-slate-50 dark:bg-[#141923] border-2 border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-center font-bold text-base outline-none font-sans focus:border-[#1f5fbf]"
                      />
                    </div>

                    <div>
                      <label className="block font-bold mb-1 text-slate-700 dark:text-slate-300">
                        ۲. آرتیکل (Article):
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        placeholder="مثلاً dem / den / die..."
                        value={caseArtInput}
                        onChange={e => setCaseArtInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleCheckCaseAnswer();
                        }}
                        className="w-full bg-slate-50 dark:bg-[#141923] border-2 border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-center font-bold text-base outline-none font-sans focus:border-[#1f5fbf]"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-2 pt-1">
                    <button
                      onClick={handleCheckCaseAnswer}
                      className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-6 py-2 rounded-xl text-xs md:text-sm font-bold shadow-xs flex-1"
                    >
                      بررسی دو پاسخ
                    </button>

                    <button
                      onClick={() => setHintLevel(prev => Math.min(2, prev + 1))}
                      disabled={remainingHints === 0}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition ${
                        remainingHints > 0
                          ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300'
                          : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                      }`}
                    >
                      💡 راهنمایی ({remainingHints})
                    </button>
                  </div>

                  {hintLevel >= 1 && (
                    <div className="p-2.5 bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-900 dark:text-amber-200 text-right space-y-1">
                      <p>
                        <b>راهنمایی ۱ (حالت دستوری): </b>
                        <span dir="ltr">{q.c.replace(/\s*\(.*\)\s*/, '').trim()}</span>
                        <span> — جنسیت اسم: </span>
                        <span dir="ltr">{(q.n.match(/^(der|die|das)/i) || ['—'])[0].toLowerCase()}</span>
                      </p>
                      {hintLevel >= 2 && (
                        <p className="border-t border-amber-200/60 pt-1 space-y-0.5">
                          <b>راهنمایی ۲: </b>
                          <span dir="ltr" className="font-mono font-bold tracking-widest">
                            {maskText(q.prepAns, 1)} + {maskText(q.artAns, 1)}
                          </span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  <div className={`p-3 rounded-xl text-base font-bold leading-relaxed ${
                    answerResult.ok ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {answerResult.msg}
                  </div>
                  {caseResult && !caseResult.prepOk && (
                    <MistakeComparison label="حرف اضافه" user={casePrepInput} expected={q.prepAns} />
                  )}
                  {caseResult && !caseResult.artOk && (
                    <MistakeComparison label="آرتیکل" user={caseArtInput} expected={q.artAns} />
                  )}
                  <div className="p-3 bg-slate-50 dark:bg-[#141923] rounded-xl text-xs text-right space-y-1">
                    <p><b>قاعده:</b> {q.r}</p>
                    <p dir="ltr" className="font-semibold text-slate-800 dark:text-slate-200">{q.ex}</p>
                    <p className="text-[#5d6676]">{q.exFa}</p>
                  </div>
                  <button
                    onClick={advanceQuestion}
                    className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-6 py-2 rounded-xl text-xs md:text-sm font-bold shadow-xs"
                  >
                    سؤال بعدی ⬅
                  </button>
                </div>
              )}
            </div>
          );
        })()}

        {/* ========================================================= */}
        {/* OTHER INTERACTIVE EXERCISES */}
        {/* ========================================================= */}
        {(qMode === 'conj' || qMode === 'tense' || qMode === 'cloze' || qMode === 'plural' || qMode === 'dict' || qMode === 'prod' || qMode === 'synant' || qMode === 'n2v' || qMode === 'v2n' || qMode === 'adjdecl' || qMode === 'sent') && (() => {
          const w = currentItem as Word;
          const remainingHints = Math.max(0, 2 - hintLevel);

          return (
            <div className="space-y-4 text-center">
              {qMode === 'conj' && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-[#5d6676]">صرف فعل برای ضمیر داده‌شده:</p>
                  <div className="text-2xl font-bold font-sans py-1 text-slate-900 dark:text-slate-100" dir="ltr">
                    {P6[conjPron]} _____
                  </div>
                  <div className="text-xs text-[#5d6676] flex flex-wrap items-center justify-center gap-2">
                    <span>
                      مصدر: <span className="font-bold font-sans" dir="ltr">{w.de}</span>
                    </span>
                    {faVisible ? <span>({w.fa})</span> : faButton}
                  </div>
                </div>
              )}

              {qMode === 'tense' && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-[#5d6676]">فعل را به Präteritum یا Perfekt ببرید:</p>
                  <div className="text-2xl font-bold font-sans py-1 text-slate-900 dark:text-slate-100" dir="ltr">
                    {w.de}
                  </div>
                  <div className="text-xs text-[#5d6676]">
                    {faVisible ? <>ترجمه: <span className="font-bold">{w.fa}</span></> : faButton}
                  </div>
                </div>
              )}

              {qMode === 'cloze' && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-[#5d6676]">جای خالی را با کلمه مناسب تکمیل کنید:</p>
                  <div className="text-xl md:text-2xl font-bold font-sans py-2 text-slate-900 dark:text-slate-100 leading-relaxed" dir="ltr">
                    {w.cloze || `${w.de} _____`}
                  </div>
                  <div className="text-xs text-[#5d6676]">{faVisible ? `(${w.fa})` : faButton}</div>
                </div>
              )}

              {qMode === 'plural' && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-[#5d6676]">شکل جمع این اسم را بنویسید:</p>
                  <div className="text-2xl font-bold font-sans py-1" dir="ltr">
                    {fullWord(w)}
                  </div>
                  <div className="text-xs text-[#5d6676]">{faVisible ? `(${w.fa})` : faButton}</div>
                </div>
              )}

              {qMode === 'dict' && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-[#5d6676]">واژه را بشنوید و بنویسید:</p>
                  <button
                    onClick={() => speak(fullWord(w), { rate: settings?.rate, vreg: settings?.vreg, voiceName: settings?.voice })}
                    className="w-12 h-12 mx-auto rounded-full bg-[#1f5fbf] text-white text-xl flex items-center justify-center shadow-md hover:opacity-95"
                  >
                    🔊
                  </button>
                  <div className="text-xs text-[#5d6676]">{faVisible ? `معنی: ${w.fa}` : faButton}</div>
                </div>
              )}

              {qMode === 'synant' && (() => {
                const isAnt = currentKind === 'ant';
                return (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-[#5d6676]">
                      {isAnt ? 'متضاد (واژهٔ مخالف)' : 'مترادف (واژهٔ هم‌معنی)'} این واژه را بنویسید:
                    </p>
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-2xl md:text-3xl font-extrabold font-sans" dir="ltr">{fullWord(w)}</span>
                      <button
                        onClick={() => speak(fullWord(w), { rate: settings?.rate, vreg: settings?.vreg, voiceName: settings?.voice })}
                        className="w-8 h-8 rounded-full bg-[#1f5fbf] text-white text-sm flex items-center justify-center"
                      >
                        🔊
                      </button>
                    </div>
                    <div className="text-sm font-semibold text-[#1f5fbf] dark:text-[#7fb0ff]">{faVisible ? w.fa : faButton}</div>
                    <span className={`inline-block px-3 py-0.5 rounded-full text-[11px] font-bold ${
                      isAnt ? 'bg-rose-100 text-rose-800' : 'bg-sky-100 text-sky-800'
                    }`}>
                      {isAnt ? '↔️ متضاد' : '🟰 مترادف'}
                    </span>
                  </div>
                );
              })()}

              {qMode === 'adjdecl' && (
                <div className="space-y-3">
                  {!adjInfo ? (
                    <div className="space-y-2">
                      <p className="text-sm text-red-700">این سؤال دیگر معتبر نیست (واژه تغییر کرده است).</p>
                      <button onClick={advanceQuestion} className="px-4 py-2 rounded-xl bg-[#1f5fbf] text-white text-sm font-bold">بعدی ←</button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-[#5d6676]">
                        شکل درست صفتِ داخل پرانتز را در جای خالی بنویسید (فقط صفت، با پایانهٔ مناسب):
                        <span className="mr-2 px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 text-[11px] font-bold">
                          سطح {adjInfo.item.level}
                        </span>
                      </p>
                      <div dir="ltr" className="text-xl md:text-2xl font-bold font-sans leading-relaxed text-center">
                        {answerResult ? adjInfo.item.full : adjInfo.item.sentence.replace('_____', `_____ (${adjInfo.item.base})`)}
                      </div>
                      <div className="text-sm font-semibold text-[#1f5fbf] dark:text-[#7fb0ff]">
                        {faVisible ? (adjInfo.src.fa || w.fa) : faButton}
                      </div>
                    </>
                  )}
                </div>
              )}

              {(qMode === 'n2v' || qMode === 'v2n') && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-[#5d6676]">
                    {qMode === 'n2v'
                      ? 'فعلِ هم‌خانوادهٔ این اسم را بنویسید (مصدر):'
                      : 'اسمِ هم‌خانوادهٔ این فعل را با آرتیکل بنویسید:'}
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-2xl md:text-3xl font-extrabold font-sans" dir="ltr">
                      {qMode === 'n2v' ? fullWord(w) : w.de}
                    </span>
                    <button
                      onClick={() => speak(qMode === 'n2v' ? fullWord(w) : w.de, { rate: settings?.rate, vreg: settings?.vreg, voiceName: settings?.voice })}
                      className="w-8 h-8 rounded-full bg-[#1f5fbf] text-white text-sm flex items-center justify-center"
                    >
                      🔊
                    </button>
                  </div>
                  <div className="text-sm font-semibold text-[#1f5fbf] dark:text-[#7fb0ff]">{faVisible ? w.fa : faButton}</div>
                  <span className="inline-block px-3 py-0.5 rounded-full text-[11px] font-bold bg-violet-100 text-violet-800">
                    {qMode === 'n2v' ? '🔁 اسم ← فعل' : '🔂 فعل ← اسم'}
                  </span>
                </div>
              )}

                            {qMode === 'sent' && (
                <SentencePractice
                  key={currentKey}
                  w={w}
                  faVisible={faShown}
                  faButton={faButton}
                  timeUpSignal={sentTimeUp}
                  onGraded={grade => {
                    setAnswerResult({ ok: grade >= 2 ? 1 : 0, exp: '' });
                    record(w, 'sent', grade);
                  }}
                  onNext={advanceQuestion}
                />
              )}

              {qMode === 'freesent' && (
                <FreeSentencePractice
                  key={currentKey}
                  onShowToast={onShowToast}
                />
              )}

              {qMode === 'prod' && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-[#5d6676]">معادل آلمانی را تایپ کنید (با آرتیکل در صورت اسم بودن):</p>
                  <div className="text-2xl md:text-3xl font-extrabold text-[#1f5fbf] dark:text-[#7fb0ff] py-1">
                    {w.fa}
                  </div>
                  <p className="text-xs text-[#5d6676]">نوع کلمه: {w.pos}</p>
                </div>
              )}

              {/* Input Box and Action Bar */}
              {qMode === 'sent' ? null : !answerResult ? (
                <div className="space-y-3 pt-2 max-w-sm mx-auto">
                  <input
                    type="text"
                    dir="ltr"
                    placeholder="پاسخ را اینجا تایپ کنید..."
                    value={userInput}
                    onChange={e => setUserInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleCheckAnswer();
                    }}
                    className="w-full bg-slate-50 dark:bg-[#141923] border-2 border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-center font-bold text-base md:text-lg outline-none font-sans"
                  />

                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={handleCheckAnswer}
                      className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-6 py-2 rounded-xl text-xs md:text-sm font-bold shadow-xs flex-1"
                    >
                      بررسی پاسخ
                    </button>

                    <button
                      onClick={() => setHintLevel(prev => Math.min(2, prev + 1))}
                      disabled={remainingHints === 0}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition ${
                        remainingHints > 0
                          ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300'
                          : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                      }`}
                    >
                      💡 راهنمایی ({remainingHints})
                    </button>
                  </div>

                  {hintLevel > 0 && (() => {
                    const cands =
                      qMode === 'synant'
                        ? splitList(currentKind === 'ant' ? w.ant : w.syn)
                        : qMode === 'n2v' || qMode === 'v2n'
                          ? familyCands(w, qMode)
                          : qMode === 'adjdecl' && adjInfo
                            ? [adjInfo.item.answer]
                            : [];
                    const hint = buildHint(qMode || 'cloze', w, hintLevel, { pron: conjPron, kind: currentKind, cands });
                    return (
                      <div className="p-2.5 bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-900 dark:text-amber-200 space-y-1">
                        {hint.note && <div>{hint.note}</div>}
                        {hint.mask && (
                          <div dir="ltr" className="font-mono font-bold text-base tracking-widest">
                            {hint.mask}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  <div className={`p-3 rounded-xl text-base font-bold leading-relaxed ${
                    answerResult.ok ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {answerResult.ok ? '✔ درست است! آفرین.' : `✘ ${answerResult.msg || 'پاسخ نادرست است.'}`}
                  </div>

                  {qMode === 'adjdecl' && adjInfo && (
                    <div className="p-3 rounded-xl bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-900 text-sm md:text-base text-violet-900 dark:text-violet-200 text-right leading-relaxed">
                      <div dir="ltr" className="font-bold font-sans mb-1">{adjInfo.item.full}</div>
                      {adjInfo.item.explanation}
                    </div>
                  )}

                  {!answerResult.ok && (
                    <MistakeComparison
                      user={userInput}
                      expected={answerResult.cands && answerResult.cands.length > 0 ? answerResult.cands : answerResult.exp}
                    />
                  )}

                  {renderUnifiedWordCard(w, { hideConj: qMode === 'conj' })}

                  <button
                    onClick={advanceQuestion}
                    className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-6 py-2 rounded-xl text-xs md:text-sm font-bold shadow-xs"
                  >
                    سؤال بعدی ⬅
                  </button>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Fulfills Section 21: Full Word Profile Modal from Exercise */}
      {timerPopupOpen && qMode && activeMode !== 'hard' && (
        <div
          className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4"
          onClick={() => setTimerPopupOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-[#1b2029] rounded-2xl border border-[#dde1ea] dark:border-[#333b4a] p-5 space-y-4 text-right shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-base">⏱ تایمر «{EXERCISE_NAMES[qMode]?.title}»</h3>
              <button onClick={() => setTimerPopupOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 font-bold" aria-label="بستن">✕</button>
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer text-sm font-semibold select-none">
              <input
                type="checkbox"
                checked={timerCfg.on}
                onChange={e => { const d = parseInt(timerSecDraft ?? '', 10); const sec = Number.isNaN(d) ? timerCfg.sec : Math.max(3, Math.min(600, d)); setTimerSecDraft(null); onUpdateSettings?.({ timers: { ...(settings?.timers || {}), [qMode]: { on: e.target.checked, sec } } }); }}
                className="w-4 h-4 accent-[#1f5fbf]"
              />
              <span>تایمر شمارش معکوس فعال باشد</span>
            </label>
            <div>
              <label className="block text-sm font-bold mb-1.5">مدت زمان هر سؤال (ثانیه)</label>
              <input
                type="number"
                min={3}
                max={600}
                value={timerSecDraft ?? String(timerCfg.sec)}
                onChange={e => setTimerSecDraft(e.target.value.replace(/\D/g, ''))}               
                onBlur={() => { const n = parseInt(timerSecDraft ?? '', 10); if (Number.isNaN(n)) setTimerSecDraft(null); else onUpdateSettings?.({ timers: { ...(settings?.timers || {}), [qMode]: { on: timerCfg.on, sec: Math.max(3, Math.min(600, n)) } } }); }}
                className="w-full bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 text-center font-bold text-base outline-none"
              />
              <div className="flex gap-2 mt-2">
                {[10, 20, 30, 60].map(v => (
                  <button
                    key={v}
                    onClick={() => { setTimerSecDraft(null); onUpdateSettings?.({ timers: { ...(settings?.timers || {}), [qMode]: { on: true, sec: v } } }); }}
                    className="flex-1 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold"
                  >
                    {v}s
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs leading-6 text-[#5d6676] dark:text-[#a3adbd]">
              وقتی زمان تمام شود: در فلش‌کارت پاسخ نشان داده می‌شود و در تمرین‌های نوشتاری یا انتخابی، پاسخ فعلی شما بررسی می‌شود (اگر خالی باشد، اشتباه حساب می‌شود). این تنظیم فقط برای همین تمرین است و ذخیره می‌ماند.
            </p>
          </div>
        </div>
      )}

      {profileModalWord && (() => {
        const inLibrary = words.some(x => x.id === profileModalWord.id);
        const liveWord = words.find(x => x.id === profileModalWord.id) || profileModalWord;
        const notSaved = () => onShowToast('این مورد نمونهٔ آموزشی است و در کتابخانهٔ شما ذخیره نشده است.', true);
        return (
          <WordDetailModal
            word={liveWord}
            onClose={() => setProfileModalWord(null)}
            onEdit={w => {
              if (!inLibrary) return notSaved();
              setProfileModalWord(null);
              onEditWord?.(w);
            }}
            onDelete={w => (inLibrary ? onDeleteWord?.(w) : notSaved())}
            onImageChange={(w, img) => (inLibrary ? onImageChange?.(w, img) : notSaved())}
          />
        );
      })()}
    </div>
  );
};
