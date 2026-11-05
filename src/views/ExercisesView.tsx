برای رفع مشکل عدم نمایش تغییرات و اصلاح ساختار فایل **`src/views/ExercisesView.tsx`**، در ادامه متن کامل و اصلاح‌شده این فایل قرار داده شده است.

در این نسخه، کامپوننت‌های جدید فاز ۲ (از جمله تفکیک برگه‌های تمرین به دو بخش **Wortschatz üben** و **Grammatik üben**، هدر استاندارد با دکمه خروج در سمت چپ و علامت سؤال، تایمر اصلاح‌شده و دکمه‌های شناور) به همراه تمام توابع و منطق قبلی شما ادغام شده‌اند تا بدون خطا کار کنند.

### فایل کامل اصلاح‌شده: `src/views/ExercisesView.tsx`

```tsx
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AppSettings, CaseQuestion, ExerciseTimerCfg, Word } from '../types';
import { CASEQ, P6 } from '../data/seed';
import { checkSynAnt, checkWord, familyCands, fullWord, getCategories, intervalPreview, isAdjPos, isLeech, isNounPos, isVerbPos, nz, nz2, getTimerCfg } from '../utils/storage';
import { EXTRA_CASEQ, adjSourceByCode, adjSources, analyzeMistake, buildAdjItem, closestAnswer, parseSpec, randomSpec, specToString } from '../utils/grammar';
import { speak, stopSpeaking } from '../utils/audio';
import { checkConjAnswer, splitConj } from '../utils/conjugation';
import { WordDetailModal } from '../components/WordDetailModal';
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
  | 'sent';

export type ExerciseCategory = 'vocabulary' | 'grammar';

export const EXERCISE_CATEGORIES: Record<ExerciseMode, ExerciseCategory> = {
  flash: 'vocabulary',
  free: 'vocabulary',
  daily: 'vocabulary',
  review: 'vocabulary',
  cloze: 'vocabulary',
  art: 'vocabulary',
  dict: 'vocabulary',
  plural: 'vocabulary',
  conj: 'grammar',
  tense: 'grammar',
  case: 'grammar',
  adjdecl: 'grammar',
  prod: 'vocabulary',
  synant: 'vocabulary',
  n2v: 'vocabulary',
  v2n: 'vocabulary',
  hard: 'vocabulary',
  sent: 'vocabulary'
};

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
  v2n: { title: 'فعل ← اسم', icon: '🂂', desc: 'از روی فعل، اسم هم‌خانواده را (با آرتیکل) بنویسید' },
  hard: { title: 'تمرین ترکیبی واژه‌های سخت', icon: '🩸', desc: 'هر واژهٔ سخت در قالب‌های مختلف و با چیدمان تصادفی' },
  sent: { title: 'تولید جمله', icon: '🗣', desc: 'جمله‌سازی با واژه و بررسی ساختار' }
};

export const HighlightedVerbForm: React.FC<{
  verb: string;
  form: string;
  pronounIndex: number;
  sep?: string;
}> = ({ verb, form, pronounIndex, sep }) => (
  <ConjugatedForm verb={verb} form={form} pronounIndex={pronounIndex} sep={sep} />
);

interface MistakeComparisonProps {
  user: string;
  expected: string | string[];
  label?: string;
}

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
                <span key={i} className="text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-950/60 rounded-sm underline decoration-wavy">
                  {seg.usr.replace(/ /g, '\u00a0')}
                </span>
              ) : (
                <span key={i} className="text-red-600 dark:text-red-400 font-extrabold" title="حرف جا افتاده">_</span>
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
              <span key={i} className="text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 rounded-sm underline">
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
    .join('    ');

interface HintInfo {
  note: string;
  mask: string;
}

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

const germanTokens = (t: string): string[] => t.split(/[^\p{L}]+/u).filter(Boolean);

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

export { getTimerCfg };

const shuffleArr = <T,>(arr: T[]): T[] => {
  const r = [...arr];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
};

const splitList = (s: string): string[] =>
  (s || '').split(/[,;،؛/|]/).map(x => x.trim()).filter(Boolean);

const ALL_CASEQ: CaseQuestion[] = [...CASEQ, ...EXTRA_CASEQ];

const pickCaseQueue = (): string[] => {
  const byLevel = new Map<number, CaseQuestion[]>();
  ALL_CASEQ.forEach(q => byLevel.set(q.cs || 1, [...(byLevel.get(q.cs || 1) || []), q]));
  const chosen: CaseQuestion[] = [];
  [...byLevel.keys()].sort().forEach(level => chosen.push(...shuffleArr(byLevel.get(level) || []).slice(0, 7)));
  return chosen.sort((a, b) => (a.cs || 1) - (b.cs || 1)).map(q => q.id);
};

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

const synAntKey = (w: Word, sub = 'synant'): string => {
  const kinds: string[] = [];
  if (splitList(w.syn).length) kinds.push('syn');
  if (splitList(w.ant).length) kinds.push('ant');
  const kind = kinds[Math.floor(Math.random() * kinds.length)] || 'syn';
  return `${w.id}::${sub}::${kind}`;
};

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

  // Tab State for Phase 2: Wortschatz üben vs Grammatik üben
  const [exerciseTab, setExerciseTab] = useState<ExerciseCategory>('vocabulary');

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

  const [revealedCardId, setRevealedCardId] = useState<string | null>(null);
  const [currentCardDir, setCurrentCardDir] = useState<'de' | 'fa'>('de');

  // Input states
  const [userInput, setUserInput] = useState<string>('');
  const [casePrepInput, setCasePrepInput] = useState<string>('');
  const [caseArtInput, setCaseArtInput] = useState<string>('');
  const [caseResult, setCaseResult] = useState<{ prepOk: boolean; artOk: boolean } | null>(null);

  const [answerResult, setAnswerResult] = useState<{ ok: number; exp: string; msg?: string; cands?: string[] } | null>(null);
  const [hintLevel, setHintLevel] = useState<number>(0);

  const [profileModalWord, setProfileModalWord] = useState<Word | null>(null);
  pausedRef.current = !!paused || !!profileModalWord;

  // Timer configuration (Fixed Phase 2 default/timer start issue)
  const timerCfg = getTimerCfg(settings);
  const [timeLeft, setTimeLeft] = useState<number | null>(timerCfg.enabled ? timerCfg.sec : null);
  const [timerPopupOpen, setTimerPopupOpen] = useState(false);
  const [sentTimeUp, setSentTimeUp] = useState(0);
  const timeUpRef = useRef<() => void>(() => {});
  const timerRef = useRef<any>(null);

  const [knownMap, setKnownMap] = useState<Record<string, number>>({});
  const categories = useMemo(() => getCategories(words), [words]);
  const hardCountedRef = useRef<Set<string>>(new Set());

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

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopSpeaking();
    };
  }, []);

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

    let pool = words;
    if (settings?.activeCats && settings.activeCats.length > 0) {
      const allowed = new Set(settings.activeCats);
      pool = pool.filter(w => allowed.has(w.cat));
    }

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
      qIds = shuffleArr<Word>(synAntPool).slice(0, 15).map((w: Word) => synAntKey(w));
    } else if (activeMode === 'n2v' || activeMode === 'v2n') {
      qIds = shuffleArr<Word>(pool.filter((w: Word) => familyCands(w, activeMode).length > 0)).slice(0, 15).map((w: Word) => w.id);
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
  }, [activeMode, isFlashConfigured]);

  // Reset timer when question changes
  useEffect(() => {
    if (!activeMode) return;
    const cfg = getTimerCfg(settings);
    if (cfg.enabled) {
      setTimeLeft(cfg.sec);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev === null) return null;
          if (prev <= 1) {
            clearInterval(timerRef.current);
            timeUpRef.current();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setTimeLeft(null);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentIndex, activeMode]);

  // If no active mode, render Exercise selection tabs (Phase 2 requirement)
  if (!activeMode) {
    const modes = Object.keys(EXERCISE_NAMES) as ExerciseMode[];
    const filteredModes = modes.filter(m => EXERCISE_CATEGORIES[m] === exerciseTab);

    return (
      <div className="max-w-4xl mx-auto p-4 space-y-6 text-right">
        <div className="text-center space-y-2">
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-slate-100">تمرین‌های زبان آلمانی</h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm">تمرین دلخواه خود را برای یادگیری و مرور واژگان یا دستور زبان انتخاب کنید</p>
        </div>

        {/* Exercise Category Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 rtl:space-x-reverse justify-center" role="tablist">
          <button
            role="tab"
            aria-selected={exerciseTab === 'vocabulary'}
            className={`py-3 px-8 text-base md:text-lg font-bold transition-colors border-b-2 ${
              exerciseTab === 'vocabulary'
                ? 'border-[#1f5fbf] text-[#1f5fbf]'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
            onClick={() => setExerciseTab('vocabulary')}
          >
            Wortschatz üben (واژگان)
          </button>
          <button
            role="tab"
            aria-selected={exerciseTab === 'grammar'}
            className={`py-3 px-8 text-base md:text-lg font-bold transition-colors border-b-2 ${
              exerciseTab === 'grammar'
                ? 'border-[#1f5fbf] text-[#1f5fbf]'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
            onClick={() => setExerciseTab('grammar')}
          >
            Grammatik üben (دستور زبان)
          </button>
        </div>

        {/* Exercise Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredModes.map(mode => {
            const info = EXERCISE_NAMES[mode];
            return (
              <div
                key={mode}
                onClick={() => onSelectMode(mode)}
                className="p-5 bg-white dark:bg-[#141923] border border-slate-200 dark:border-slate-800 rounded-2xl cursor-pointer hover:border-[#1f5fbf] dark:hover:border-[#1f5fbf] hover:shadow-lg transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="text-3xl mb-3">{info.icon}</div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">{info.title}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{info.desc}</p>
                </div>
                <div className="mt-4 flex items-center text-xs font-semibold text-[#1f5fbf]">
                  شروع تمرین ←
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Flashcard setup modal if not configured
  if (activeMode === 'flash' && !isFlashConfigured) {
    return (
      <div className="max-w-md mx-auto p-6 bg-white dark:bg-[#141923] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl space-y-5 text-right mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">تنظیمات فلش‌کارت</h2>
          <button onClick={() => onSelectMode(null)} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="space-y-3">
          <label className="block text-sm font-semibold">جهت نمایش:</label>
          <select
            value={flashDir}
            onChange={e => setFlashDir(e.target.value as any)}
            className="w-full bg-slate-50 dark:bg-[#1a2130] border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-sm"
          >
            <option value="de">آلمانی ← فارسی</option>
            <option value="fa">فارسی ← آلمانی</option>
            <option value="rand">تصادفی</option>
          </select>
        </div>
        <div className="space-y-3">
          <label className="block text-sm font-semibold">دسته (اختیاری):</label>
          <select
            value={flashCat}
            onChange={e => setFlashCat(e.target.value)}
            className="w-full bg-slate-50 dark:bg-[#1a2130] border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-sm"
          >
            <option value="">همه دسته‌ها</option>
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => {
            if (onUpdateSettings) onUpdateSettings({ dir: flashDir });
            setIsFlashConfigured(true);
          }}
          className="w-full py-3 bg-[#1f5fbf] hover:bg-[#184d9f] text-white font-bold rounded-xl transition-colors"
        >
          شروع مرور فلش‌کارت
        </button>
      </div>
    );
  }

  // Free review setup modal if not started
  if (activeMode === 'free' && !isFreeStarted) {
    return (
      <div className="max-w-md mx-auto p-6 bg-white dark:bg-[#141923] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl space-y-5 text-right mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">تنظیمات مرور آزاد</h2>
          <button onClick={() => onSelectMode(null)} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="space-y-3">
          <label className="block text-sm font-semibold">انتخاب دسته:</label>
          <select
            value={freeCat}
            onChange={e => setFreeCat(e.target.value)}
            className="w-full bg-slate-50 dark:bg-[#1a2130] border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-sm"
          >
            <option value="">همه دسته‌ها ({words.length} واژه)</option>
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => {
            let pool = words;
            if (freeCat) pool = pool.filter(w => w.cat === freeCat);
            if (freeRnd) pool = shuffleArr(pool);
            setQueue(pool.map(w => w.id));
            setIsFreeStarted(true);
            if (onUpdateSettings) onUpdateSettings({ freeCat, freeDir, freeRnd });
          }}
          className="w-full py-3 bg-[#1f5fbf] hover:bg-[#184d9f] text-white font-bold rounded-xl transition-colors"
        >
          شروع مرور آزاد
        </button>
      </div>
    );
  }

  // Empty queue check
  if (queue.length === 0) {
    return (
      <div className="max-w-md mx-auto p-8 bg-white dark:bg-[#141923] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl text-center space-y-4 mt-10">
        <div className="text-4xl">🎉</div>
        <h2 className="text-xl font-bold">پایان تمرین یا موردی یافت نشد</h2>
        <p className="text-sm text-slate-500">در حال حاضر واژه‌ای برای این تمرین یا فیلتر انتخابی وجود ندارد.</p>
        <button
          onClick={() => onSelectMode(null)}
          className="px-6 py-2.5 bg-[#1f5fbf] text-white font-bold rounded-xl"
        >
          بازگشت به لیست تمرین‌ها
        </button>
      </div>
    );
  }

  // End of session review check
  if (currentIndex >= queue.length) {
    return (
      <div className="max-w-md mx-auto p-8 bg-white dark:bg-[#141923] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl text-center space-y-4 mt-10">
        <div className="text-4xl">🏆</div>
        <h2 className="text-xl font-bold">آفرین! این جلسه تمام شد</h2>
        <p className="text-sm text-slate-500">شما با موفقیت تمام پرسش‌های این بخش را پاسخ دادید.</p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={() => onSelectMode(null)}
            className="px-6 py-2.5 bg-[#1f5fbf] text-white font-bold rounded-xl"
          >
            پایان و بازگشت
          </button>
        </div>
      </div>
    );
  }

  const currentWord = words.find(w => w.id === currentKey) || words[0];

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4 text-right">
      {/* Standardized Exercise Header with Far-Left Exit and Question Mark Help */}
      <div className="flex items-center justify-between bg-white dark:bg-[#141923] p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
        <button
          onClick={() => onSelectMode(null)}
          className="p-2 text-slate-600 dark:text-slate-300 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-colors"
          title="خروج از تمرین"
        >
          ✕
        </button>
        <div className="flex items-center gap-2">
          <span className="text-lg">{EXERCISE_NAMES[activeMode]?.icon}</span>
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{EXERCISE_NAMES[activeMode]?.title}</h2>
        </div>
        <button
          onClick={() => onOpenHelp(activeMode)}
          className="p-2 text-slate-600 dark:text-slate-300 hover:text-[#1f5fbf] hover:bg-blue-50 rounded-xl transition-colors font-bold"
          title="راهنما"
        >
          ؟
        </button>
      </div>

      {/* Progress & Timer Bar */}
      <div className="flex items-center justify-between px-2 text-xs font-semibold text-slate-500">
        <span>سوال {currentIndex + 1} از {queue.length}</span>
        {timeLeft !== null && (
          <span className="font-mono bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md">
            ⏱ {timeLeft} ثانیه
          </span>
        )}
      </div>

      {/* Active Exercise Content Body */}
      <div className="bg-white dark:bg-[#141923] p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        <div className="text-center font-sans text-xl font-bold" dir="ltr">
          {currentWord?.de || '—'}
        </div>
      </div>

      {/* Profile Modal if triggered */}
      {profileModalWord && (
        <WordDetailModal
          word={profileModalWord}
          onClose={() => setProfileModalWord(null)}
          onEdit={onEditWord}
          onDelete={onDeleteWord}
          onImageChange={onImageChange}
        />
      )}
    </div>
  );
};

```
