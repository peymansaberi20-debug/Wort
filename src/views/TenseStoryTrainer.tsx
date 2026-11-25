/**
 * TenseStoryTrainer.tsx — تمرین «داستان همهٔ زمان‌ها» (نسخهٔ Pro)
 * دقیقاً مثل تمرین کتاب: «Ergänzen Sie die Verben im Präteritum!»
 * متن داستانی یکپارچه با جای خالیِ فعل؛ فعل مصدر داخل پرانتز؛ شما شکل درست را می‌نویسید.
 *
 * ▌منطق تمرین:
 *   - سطح A1–C2: هر سطح فقط با فعل‌ها و حروف اضافهٔ ردهٔ خودش (src/data/tenseStoryVerbs.ts)
 *   - زمان: Präsens / Präteritum / Perfekt / Plusquamperfekt / Futur I / Futur II / ترکیبی
 *   - Präteritum (مثل کتاب): جای خالی = کل فعل صرف‌شده؛ جداشدنی‌ها: فقط بخش صرف‌شده
 *   - Perfekt/PQ: به‌تناوب جای خالیِ فعل کمکی (haben/sein) یا Partizip II؛ جزء دیگر در متن
 *
 * ▌امکانات (هم‌تراز با KonnektorProTrainer):
 *   - ساخت داستان با هوش مصنوعی از تنظیمات برنامه (aiProvider) — بدون هیچ کلیدی داخل تمرین
 *   - جایگزین آفلاین: «داستان آماده» از بانک داستان‌ها وقتی هوش مصنوعی فعال نیست
 *   - تصحیح سه‌لایه: گرامر + معنا و منطق + «تفکر آلمانی» برای هر جای خالی
 *   - گفتگوی درون‌خطی با معلمِ هوش مصنوعی برای همان جای خالی
 *   - لمس هر کلمهٔ متن → ترجمهٔ آفلاین از واژه‌نامهٔ تمرین + پرسش از هوش مصنوعی + افزودن به واژگان
 *   - ذخیرهٔ خودکار تمرین‌ها و بازگشایی، چاپ/PDF (صفحهٔ ۱ سؤال، صفحهٔ ۲ پاسخنامه)
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AppSettings, Word } from '../types';
import { speak } from '../utils/audio';
import { Band, Tense, TENSE_INFO, BAND_INFO, VERBS } from './tenseStoryData';
import { STORIES, Story } from './tenseStoryBank';
import { parseBlanks, parseSegments, lookupWord, explainBlank, isCorrect, normalizeAnswer, Blank, Lookup } from './tenseStoryHelpers';
import { TLvl, TLVL_ORDER, TLVL_INFO, LEVEL_VERBS, LEVEL_PREPS, bandOf } from '../data/tenseStoryVerbs';
import { generateText, hasApiKey, describeAiError, getActiveProvider, getModel } from '../utils/aiProvider';
import { ArchivePanel, ArchiveRow, CountChips, LevelChips, MiniChip, PrintPreview, Section, SqBtn, TopicInput, prFa, prG, toFa, useConfirm } from '../components/trainerUI';
import { ClickableWords } from '../components/WordLookup';
import { useVocabGate } from '../components/VocabDecisionDialog';

/* ─────────────────────────── پل هوش مصنوعی برنامه ───────────────────────────
 * کلید و مدل از تنظیمات برنامه (aiProvider — Gemini/Groq/OpenRouter) می‌آید.
 * هیچ کارت کلیدی داخل تمرین نیست؛ اگر کلید تنظیم نشده باشد فقط پیام راهنما می‌بینی
 * و «داستان آمادهٔ آفلاین» همیشه کار می‌کند. */
const askAIJson = async (prompt: string, timeoutMs = 90000): Promise<string> =>
  generateText(prompt, { json: true, timeoutMs, retries: 1 });

const askAIText = async (prompt: string, timeoutMs = 60000): Promise<string> =>
  generateText(prompt, { timeoutMs, retries: 1 });

const aiReady = (): boolean => { try { return !!hasApiKey(); } catch { return false; } };

const aiLabel = (): string => {
  try {
    const p = String(getActiveProvider() || 'AI');
    const m = String(getModel() || '').trim();
    return m ? `${p} · ${m}` : p;
  } catch { return 'معلم'; }
};

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

/* ─────────────────────────── انواع داده ─────────────────────────── */

type Seg =
  | { t: 'txt'; x: string }
  | { t: 'gap'; no: number; inf: string; ans: string; kind: 'fin' | 'aux' | 'pp'; tense: Tense };

interface Exercise {
  id: string;
  ts: number;
  lvl: TLvl;
  tense: Tense;
  topic: string;
  title: string;
  titleFa: string;
  src: 'ai' | 'bank';
  segs: Seg[];
}

interface GapResult {
  ok: boolean;
  given: string;
  revealed: boolean;
  correct?: string;
  grammar?: string;
  meaning?: string;
  thinking?: string;
  tip?: string;
  offline?: boolean;
}

interface SavedEx extends Exercise {
  answers: Record<number, string>;
  results?: Record<number, GapResult>;
  done: boolean;
}

interface Attempt {
  id: string;
  ts: number;
  lvl: TLvl;
  tense: Tense;
  topic: string;
  title: string;
  titleFa: string;
  src: 'ai' | 'bank';
  segs: Seg[];
  answers: Record<number, string>;
  results?: Record<number, GapResult>;
  done: boolean;
}

interface ChatMsg { role: 'user' | 'ai'; text: string; }

const HKEY = 'wb_tstory_pro_history_v1';
const TENSE_ORDER: Tense[] = ['prs', 'prt', 'perf', 'pq', 'f1', 'f2', 'mix'];
const TOPIC_CHIPS = ['Alltag', 'Reise', 'Arbeit', 'Umwelt', 'Technik', 'Medien', 'Gesundheit'];
const QUICK_QS = ['چرا این شکل درست است؟', 'زمان را ساده توضیح بده', 'یک مثال مشابه بده', 'با فعل دیگری هم می‌شود؟'];
const WORD_RE = /[A-Za-zÄÖÜäöüß]+(?:-[A-Za-zÄÖÜäöüß]+)*/g;

const loadHist = (): Attempt[] => {
  try {
    const h = JSON.parse(localStorage.getItem(HKEY) || '[]');
    return Array.isArray(h) ? h : [];
  } catch { return []; }
};
const saveHist = (h: Attempt[]) => { try { localStorage.setItem(HKEY, JSON.stringify(h.slice(0, 15))); } catch { /* ignore */ } };

const uid = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const faDate = (ts: number): string => {
  try { return new Date(ts).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }); }
  catch { return new Date(ts).toLocaleDateString(); }
};

/** قانون kind هر جای خالی بر اساس زمان داستان (در پرامپت هم می‌رود) */
const kindRule = (tense: Tense): string => {
  switch (tense) {
    case 'prs': return 'همهٔ جاهای خالی kind="fin" با صرف Präsens';
    case 'prt': return 'همهٔ جاهای خالی kind="fin" با صرف Präteritum';
    case 'perf': return 'به‌تناوب kind="aux" (فقط haben/sein صرف‌شده) و kind="pp" (فقط Partizip II)؛ جزء دیگرِ فعل داخل متن چاپی می‌آید';
    case 'pq': return 'مثل Perfekt ولی Plusquamperfekt: به‌تناوب kind="aux" (war/hatte صرف‌شده) و kind="pp"';
    case 'f1': return 'همهٔ جاهای خالی kind="aux" (شکل werden صرف‌شده) و مصدرِ فعل داخل متن چاپی می‌آید';
    case 'f2': return 'به‌تناوب kind="aux" (شکل werden صرف‌شده) و kind="pp" (Partizip II)؛ جزء دیگر داخل متن چاپی می‌آید';
    case 'mix': return 'زمانِ هر جای خالی در فیلد tense خودش می‌آید (فقط prs/prt/perf/pq) و kind مطابق قانون همان زمان است';
    default: return 'همهٔ جاهای خالی kind="fin"';
  }
};

/* ─────────────────────────── پرامپت‌ها ─────────────────────────── */

const buildGenPrompt = (lvl: TLvl, tense: Tense, topic: string, count: number): string => {
  const verbs = LEVEL_VERBS[lvl].join(', ');
  const preps = LEVEL_PREPS[lvl].join(', ');
  const len = lvl === 'A1' || lvl === 'A2' ? count * 12 + 20 : count * 14 + 30;
  return `تو معلم آلمانی برای فارسی‌زبانان هستی. یک متن داستانی کوتاهِ یکپارچه با جای خالیِ فعل بساز — دقیقاً مثل تمرین کتاب: «Ergänzen Sie die Verben!»
سطح: ${lvl} — ${TLVL_INFO[lvl].label}
زمان دستوری: ${TENSE_INFO[tense].de} (${TENSE_INFO[tense].fa}) — ${TENSE_INFO[tense].expl}
موضوع: ${topic && topic.trim() ? topic.trim() : 'آزاد (زندگی روزمره)'}
تعداد جای خالی: دقیقاً ${count}
فعل‌های مجاز این سطح (اولویت اصلی؛ بیش از ۸۰٪ از این‌ها؛ در صورت لزوم چند فعل هم‌سطح دیگر هم مجاز است): ${verbs}
حروف اضافهٔ مرسوم این سطح که در متن بیایند: ${preps}

قوانین سختگیرانه:
1) داستان یکپارچه با آغاز و پایان منطقی؛ طول کل حدود ${len} کلمه؛ واژگان فقط در سطح ${lvl}؛ جمله‌ها کوتاه و روشن.
2) هر جای خالی فقط یک فعل: «inf» = مصدر، «ans» = شکل درست کامل. فعل هیچ جای خالی را بیش از یک بار استفاده نکن.
3) kind جاهای خالی: ${kindRule(tense)}
4) فعل جداشدنی در Präsens/Präteritum: فقط بخش صرف‌شده در «ans» (مثلاً einsteigen در Präteritum → ans="stiegen") و پیشوند (ein) در متنِ بعد از جای خالی چاپ می‌شود.
5) در Perfekt/Plusquamperfekt/Futur: جزئی که جای خالی نیست، باید در متن چاپی بیاید (مثلاً Partizip II انتهای جمله یا مصدر).
6) «ans» فقط شکل فعل است؛ نه عبارت و نه علامت اضافه. بزرگی حرف اول فقط اگر در ابتدای جمله لازم است.
7) title کوتاه آلمانی (بدون جای خالی) و titleFa ترجمهٔ فارسی آن.
8) segs دقیقاً متن پیوستهٔ داستان است به ترتیب: بخش‌های متنی x و جاهای خالی؛ مجموع آن‌ها = داستان کامل؛ هیچ متن بیرون از segs نگذار.

خروجی: فقط JSON معتبر، بدون Markdown و بدون متن اضافه:
{"title":"Mein erster Ausflug nach Salzburg","titleFa":"نخستین گردش من به زالتسبورگ","segs":[{"t":"txt","x":"Mit 16 Jahren "},{"t":"gap","inf":"wollen","ans":"wollte","kind":"fin","tense":"${tense === 'mix' ? 'prt' : tense}"},{"t":"txt","x":" Tim mit seiner Freundin Mia einen Ausflug machen."}]}`;
};

const buildCorrectPrompt = (ex: Exercise, answers: Record<number, string>): string => {
  const gaps = ex.segs.filter(s => s.t === 'gap') as Extract<Seg, { t: 'gap' }>[];
  const sentOf = (no: number): string => {
    let s = '';
    for (const g of ex.segs) {
      if (g.t === 'txt') s += g.x;
      else s += g.no === no ? ' ___ ' : ` [${g.ans}] `;
    }
    return s.replace(/\s+/g, ' ').trim();
  };
  const items = gaps.map(g => ({ no: g.no, inf: g.inf, kind: g.kind, tense: g.tense, sentence: sentOf(g.no), answer: (answers[g.no] || '').trim() || '(خالی)' }));
  return `تو معلم آلمانی برای فارسی‌زبانان هستی. پاسخ‌های دانش‌آموز را در تمرین «متن داستانی با جای خالیِ فعل» تصحیح کن.
سطح: ${ex.lvl} | زمان داستان: ${TENSE_INFO[ex.tense].de} | موضوع: ${ex.topic || 'آزاد'}

بررسی سه‌لایه برای هر مورد:
1) گرامر: صرف درست فعل برای فاعل و زمان؛ جداشدنی‌ها؛ جزئیات کمکی/Partizip.
2) معنا و منطق: آیا جمله با این فعل معنا می‌دهد؟
3) تفکر آلمانی: چرا این زمان و این شکل در این‌جا درست است (منطق انتخاب زمان/کمکی) — یک جملهٔ آموزنده.

قوانین:
- ok فقط وقتی شکل دقیقاً درست است؛ تفاوت ß/ss و بزرگی حرف مهم نیست؛ فاصلهٔ اضافه مهم نیست.
- correct = شکل درست کاملِ همان جای خالی (برای جداشدنی فقط بخش صرف‌شده چون پیشوند در متن است).
- اگر پاسخ خالی یا کاملاً بی‌ربط: ok=false و توضیح از پایه.
- اگر درست: correct = همان پاسخ؛ grammar کوتاه تأییدکننده؛ thinking یک نکتهٔ آموزنده؛ tip خالی.
- هر خطا یک بار توضیح داده شود؛ فارسی فشرده، بدون تکرار؛ tip فقط برای اشتباه‌ها.

ورودی موارد:
${JSON.stringify(items, null, 0)}

خروجی: فقط JSON معتبر (آرایه، به همان ترتیب، بدون Markdown):
[{"no":1,"ok":true,"correct":"wollte","grammar":"...","meaning":"...","thinking":"...","tip":""}]`;
};

const buildWordPrompt = (word: string, sentence: string, lvl: TLvl): string =>
  `تو واژه‌نامهٔ آلمانی↔فارسی هستی. برای کلمهٔ «${word}» در جملهٔ «${sentence}» (سطح ${lvl}) خروجی بده:
"fa": ترجمهٔ فارسی دقیق در همین بافت؛ "pos": اسم/فعل/صفت/قید/حرف اضافه؛ "art": der/die/das اگر اسم وگرنه رشتهٔ خالی؛ "ex": یک مثال کوتاه آلمانی دیگر با همین کلمه در سطح ${lvl}؛ "exFa": ترجمهٔ فارسی مثال.
فقط JSON معتبر، بدون Markdown: {"fa":"...","pos":"...","art":"","ex":"...","exFa":"..."}`;

const buildChatSystem = (ex: Exercise, g: Extract<Seg, { t: 'gap' }>, sent: string, given: string, res?: GapResult): string =>
  `تو معلم صبور آلمانی برای فارسی‌زبانان هستی؛ در تمرین «متن داستانی با جای خالیِ فعل».
داستان: «${ex.title}» | سطح ${ex.lvl} | زمان: ${TENSE_INFO[ex.tense].de} | موضوع: ${ex.topic || 'آزاد'}
جای خالی شمارهٔ ${g.no}: فعل ${g.inf} (${g.kind}) — جمله: «${sent}»
پاسخ دانش‌آموز: «${given || '(خالی)'}»
${res ? `نتیجهٔ تصحیح: ${res.ok ? 'درست' : 'نادرست — شکل درست: ' + res.correct || g.ans}${res.grammar ? ' | ' + res.grammar : ''}` : 'هنوز تصحیح نشده.'}
پاسخ‌ها: فارسی، کوتاه (۲–۵ جمله)، با مثال آلمانی وقتی کمک می‌کند؛ اگر پرسش معنایی بود، تفاوت ظریف را با مثال نشان بده.`;

/* ─────────────────────────── کمکی‌های رندر ─────────────────────────── */

interface Tok { w: string; isWord: boolean; }

const tokenize = (x: string): Tok[] => {
  const out: Tok[] = [];
  let last = 0;
  const re = new RegExp(WORD_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(x)) !== null) {
    if (m.index > last) out.push({ w: x.slice(last, m.index), isWord: false });
    out.push({ w: m[0], isWord: true });
    last = m.index + m[0].length;
  }
  if (last < x.length) out.push({ w: x.slice(last), isWord: false });
  return out;
};

const storyPlain = (segs: Seg[], reveal: boolean): string =>
  segs.map(s => (s.t === 'txt' ? s.x : reveal ? s.ans : '____')).join('').replace(/[ \t]+/g, ' ').trim();

const sentOf = (segs: Seg[], no: number): string =>
  segs.map(s => (s.t === 'txt' ? s.x : s.no === no ? ' ___ ' : s.ans)).join('').replace(/\s+/g, ' ').trim();

const gapList = (segs: Seg[]): Extract<Seg, { t: 'gap' }>[] =>
  segs.filter(s => s.t === 'gap') as Extract<Seg, { t: 'gap' }>[];

/* ─────────────────────────── کامپوننت ─────────────────────────── */

interface TenseStoryTrainerProps {
  settings?: AppSettings;
  onShowToast: (msg: string, isErr?: boolean) => void;
  onQuickAddWord?: (w: Partial<Word>) => boolean;
  /** کل کتابخانه — گیتِ تکراری/Partizip II/مترادف */
  words?: Word[];
  onViewWord?: (w: Word) => void;
  onClose?: () => void;
}

export const TenseStoryTrainer: React.FC<TenseStoryTrainerProps> = ({ settings, onShowToast, onQuickAddWord, words, onViewWord, onClose }) => {
  const [screen, setScreen] = useState<'config' | 'play' | 'review'>('config');
  const [lvl, setLvl] = useState<TLvl>('A1');
  const [tense, setTense] = useState<Tense>('prt');
  const [count, setCount] = useState(8);
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState<'gen' | 'check' | 'word' | null>(null);
  const [ex, setEx] = useState<Exercise | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [results, setResults] = useState<Record<number, GapResult>>({});
  const [openGap, setOpenGap] = useState<number | null>(null);
  const [gapDraft, setGapDraft] = useState('');
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState<{ ok: number; total: number } | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [verbCard, setVerbCard] = useState<string | null>(null);
  const [history, setHistory] = useState<Attempt[]>(loadHist);
  const { ask, dialog } = useConfirm();
  const [dictCard, setDictCard] = useState<{ word: string; lk: Lookup | null; ai?: Lookup | null } | null>(null);
  const [chatGap, setChatGap] = useState<number | null>(null);
  const [chats, setChats] = useState<Record<number, ChatMsg[]>>({});
  const [chatDraft, setChatDraft] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());
  // گیت مرکزی افزودن به واژگان: تکراری / Partizip II فعل موجود / مترادف → دیالوگ تصمیم
  const gate = useVocabGate({
    words: words || [],
    onAdd: data => (onQuickAddWord ? onQuickAddWord(data) : false),
    onView: onViewWord,
    onDone: (data, ok) => { if (ok) { const de = String(data.de || '').replace(/^(der|die|das)\s+/i, ''); if (de) setAdded(a => new Set(a).add(de)); } }
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const gaps = useMemo(() => (ex ? gapList(ex.segs) : []), [ex]);
  const aiOn = useMemo(() => aiReady(), [screen, busy]);

  useEffect(() => { if (openGap !== null) setTimeout(() => inputRef.current?.focus(), 90); }, [openGap]);
  useEffect(() => { if (chatGap !== null) setTimeout(() => chatEndRef.current?.scrollIntoView({ block: 'end' }), 120); }, [chatGap, chats]);

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

  /* ── ذخیرهٔ تمرین در تاریخچه ── */
  const persist = (e: Exercise, a: Record<number, string>, r?: Record<number, GapResult>, done = false) => {
    const item: Attempt = {
      id: e.id, ts: e.ts, lvl: e.lvl, tense: e.tense, topic: e.topic,
      title: e.title, titleFa: e.titleFa, src: e.src, segs: e.segs,
      answers: a, results: r, done
    };
    const next = [item, ...loadHist().filter(x => x.id !== e.id)];
    saveHist(next);
    setHistory(next);
  };

  const removeFromHist = (id: string) => {
    const next = loadHist().filter(x => x.id !== id);
    saveHist(next);
    setHistory(next);
  };

  /* ── ساخت تمرین با هوش مصنوعی ── */
  const generateAI = async () => {
    if (!aiReady()) {
      onShowToast('معلم در تنظیمات برنامه فعال نیست — یا «داستان آماده» را بزن.', true);
      return;
    }
    setBusy('gen');
    try {
      const raw = await askAIJson(buildGenPrompt(lvl, tense, topic, count));
      const j = parseJSONLoose<{ title?: string; titleFa?: string; segs?: unknown[] }>(raw);
      const segsIn = Array.isArray(j.segs) ? j.segs : [];
      const segs: Seg[] = [];
      let no = 0;
      const validKinds = ['fin', 'aux', 'pp'];
      for (const s of segsIn) {
        const o = s as { t?: string; x?: string; inf?: string; ans?: string; kind?: string; tense?: string };
        if (o.t === 'txt' && typeof o.x === 'string' && o.x) segs.push({ t: 'txt', x: o.x });
        else if (o.t === 'gap' && o.inf && o.ans) {
          const k = String(o.kind || 'fin');
          const tn = (TENSE_ORDER.includes(o.tense as Tense) && o.tense !== 'mix' && o.tense !== 'f1' && o.tense !== 'f2' ? o.tense : tense) as Tense;
          if (!validKinds.includes(k as 'fin' | 'aux' | 'pp')) continue;
          segs.push({ t: 'gap', no: ++no, inf: String(o.inf).trim(), ans: String(o.ans).trim(), kind: k as 'fin' | 'aux' | 'pp', tense: tn });
        }
      }
      if (segs.length < 4 || no < Math.max(3, count - 2)) throw new Error('ساختار داستان ناقص بود — دوباره تلاش کن.');
      const e: Exercise = {
        id: uid(), ts: Date.now(), lvl, tense, topic: topic.trim(),
        title: String(j.title || 'Eine kleine Geschichte').trim(),
        titleFa: String(j.titleFa || '').trim(),
        src: 'ai', segs
      };
      startEx(e);
      onShowToast(`داستان ساخته شد — ${no} جای خالی`);
    } catch (err) {
      onShowToast('ساخت داستان ناموفق: ' + describeAiError(err), true);
    } finally {
      setBusy(null);
    }
  };

  /* ── داستان آمادهٔ آفلاین از بانک ── */
  const generateBank = () => {
    const band: Band = bandOf(lvl);
    const pool = STORIES.filter(s => s.band === band && (tense === 'mix' ? true : s.ts === tense));
    const pick = pool.length ? pool[Math.floor(Math.random() * pool.length)] : STORIES.filter(s => s.band === band)[0] || STORIES[0];
    const segs: Seg[] = [];
    let no = 0;
    for (const s of parseSegments(pick)) {
      if (s.t === 'txt') segs.push({ t: 'txt', x: s.text });
      else segs.push({ t: 'gap', no: ++no, inf: s.blank.inf, ans: s.blank.ans, kind: s.blank.kind, tense: s.blank.tense });
    }
    const e: Exercise = {
      id: uid(), ts: Date.now(), lvl, tense, topic: '',
      title: pick.title, titleFa: pick.titleFa, src: 'bank', segs
    };
    startEx(e);
    onShowToast(`داستان آماده: «${pick.titleFa || pick.title}» — ${no} جای خالی`);
  };

  const startEx = (e: Exercise) => {
    setEx(e);
    setAnswers({});
    setResults({});
    setChecked(false);
    setScore(null);
    setChats({});
    setOpenGap(null);
    setScreen('play');
    persist(e, {});
  };

  const reopen = (a: Attempt) => {
    const e: Exercise = { id: a.id, ts: a.ts, lvl: a.lvl, tense: a.tense, topic: a.topic, title: a.title, titleFa: a.titleFa, src: a.src, segs: a.segs };
    setEx(e);
    setAnswers(a.answers || {});
    setResults(a.results || {});
    setChecked(!!a.results && Object.keys(a.results).length > 0);
    setScore(a.results ? { ok: Object.values(a.results).filter(r => r.ok).length, total: gapList(e.segs).length } : null);
    setScreen(a.results && Object.keys(a.results).length ? 'review' : 'play');
  };

  /** آزمون دوباره: همان داستان، بدون پاسخ و سفید از اول — به‌عنوان تلاشِ جدید ذخیره می‌شود (مثل «حرف ربط انتخابی») */
  const retake = (a: Attempt) => {
    const e: Exercise = { id: uid(), ts: Date.now(), lvl: a.lvl, tense: a.tense, topic: a.topic, title: a.title, titleFa: a.titleFa, src: a.src, segs: a.segs };
    startEx(e);
  };

  /* ── ورود پاسخ جای خالی ── */
  const submitGap = (no: number, val: string) => {
    const next = { ...answers, [no]: val.trim() };
    setAnswers(next);
    persist(ex!, next, checked ? results : undefined, checked);
    const order = gaps.map(g => g.no);
    const idx = order.indexOf(no);
    const nx = order[idx + 1];
    if (nx !== undefined && val.trim()) { setOpenGap(nx); setGapDraft(answers[nx] || ''); }
    else { setOpenGap(null); setGapDraft(''); }
  };

  /* ── تصحیح ── */
  const checkAll = async () => {
    if (!ex) return;
    const answered = Object.values(answers).filter(v => v.trim()).length;
    if (answered === 0) { onShowToast('اول حداقل یک جای خالی را پر کن.', true); return; }
    if (!aiReady()) {
      if (ex.src !== 'bank') { onShowToast('برای تصحیح هوشمند، معلم را در تنظیمات برنامه فعال کن.', true); return; }
      // داستان بانک: تصحیح آفلاین با پاسخ‌های شناخته‌شده
      const res: Record<number, GapResult> = {};
      for (const g of gaps) {
        const given = (answers[g.no] || '').trim();
        res[g.no] = {
          ok: isCorrect(given, g.ans),
          given, revealed: false, offline: true,
          grammar: given ? '' : 'پاسخی نوشته نشده بود.',
          meaning: '', thinking: '', tip: ''
        };
      }
      const okN = Object.values(res).filter(r => r.ok).length;
      setResults(res);
      setChecked(true);
      setScore({ ok: okN, total: gaps.length });
      persist(ex, answers, res, true);
      onShowToast(`تصحیح آفلاین: ${okN} از ${gaps.length} درست`);
      return;
    }
    setBusy('check');
    try {
      const raw = await askAIJson(buildCorrectPrompt(ex, answers));
      const arr = parseJSONLoose<Array<{ no?: number; ok?: boolean; correct?: string; grammar?: string; meaning?: string; thinking?: string; tip?: string }>>(raw);
      const res: Record<number, GapResult> = {};
      for (const g of gaps) {
        const given = (answers[g.no] || '').trim();
        const r = arr.find(x => Number(x.no) === g.no);
        const localOk = given ? isCorrect(given, g.ans) : false;
        const aiOk = !!r && r.ok === true;
        res[g.no] = {
          ok: localOk || aiOk,
          given,
          revealed: false,
          correct: r?.correct || g.ans,
          grammar: r?.grammar || '',
          meaning: r?.meaning || '',
          thinking: r?.thinking || '',
          tip: r?.tip || ''
        };
      }
      const okN = Object.values(res).filter(r => r.ok).length;
      setResults(res);
      setChecked(true);
      setScore({ ok: okN, total: gaps.length });
      persist(ex, answers, res, true);
      onShowToast(`نتیجه: ${okN} از ${gaps.length} درست`);
    } catch (err) {
      onShowToast('تصحیح ناموفق: ' + describeAiError(err), true);
    } finally {
      setBusy(null);
    }
  };

  const revealAll = () => {
    if (!ex) return;
    const res: Record<number, GapResult> = { ...results };
    for (const g of gaps) {
      const given = (answers[g.no] || '').trim();
      res[g.no] = {
        ...(res[g.no] || { given, ok: false, offline: false }),
        given,
        revealed: true,
        ok: given ? isCorrect(given, g.ans) : false,
        correct: g.ans
      };
    }
    setResults(res);
    setChecked(true);
    setScore({ ok: Object.values(res).filter(r => r.ok).length, total: gaps.length });
    persist(ex, answers, res, true);
  };

  /* ── لمس کلمه: اول واژه‌نامهٔ آفلاین، اگر نبود هوش مصنوعی ── */
  const tapWord = useCallback(async (w: string) => {
    const lk = lookupWord(w);
    setDictCard({ word: w, lk });
    const known = lk && lk.fa && lk.fa !== 'این کلمه در واژه‌نامهٔ این تمرین نیست.';
    if (known || !aiReady() || !ex) return;
    setBusy('word');
    try {
      const firstGap = gapList(ex.segs)[0];
      const raw = await askAIJson(buildWordPrompt(w, sentOf(ex.segs, firstGap?.no ?? 0), ex.lvl));
      const j = parseJSONLoose<Lookup>(raw);
      setDictCard(d => (d && d.word === w ? { ...d, ai: { ...lk, ...j } } : d));
    } catch { /* کارت آفلاین می‌ماند */ }
    finally { setBusy(null); }
  }, [ex]);

  /* ── چت با معلم برای یک جای خالی ── */
  const sendChat = async (override?: string) => {
    if (!ex || chatGap === null || chatBusy) return;
    const q0 = (override || chatDraft).trim();
    if (!q0) return;
    if (!aiReady()) { onShowToast('معلم در تنظیمات برنامه فعال نیست.', true); return; }
    const g = gaps.find(x => x.no === chatGap)!;
    const given = (answers[g.no] || '').trim();
    const q = q0;
    const hist = chats[g.no] || [];
    setChats(c => ({ ...c, [g.no]: [...(c[g.no] || []), { role: 'user', text: q }] }));
    setChatDraft('');
    setChatBusy(true);
    try {
      const convo = hist.map(m => (m.role === 'user' ? 'دانش‌آموز: ' : 'معلم: ') + m.text).join('\n');
      const sys = buildChatSystem(ex, g, sentOf(ex.segs, g.no), given, checked ? results[g.no] : undefined);
      const out = await askAIText(`${sys}\n\n${convo ? 'گفتگوی تاکنون:\n' + convo + '\n\n' : ''}پرسش تازهٔ دانش‌آموز: ${q}`);
      setChats(c => ({ ...c, [g.no]: [...(c[g.no] || []), { role: 'ai', text: out.trim() }] }));
    } catch (err) {
      setChats(c => ({ ...c, [g.no]: [...(c[g.no] || []), { role: 'ai', text: '⚠️ ' + describeAiError(err) }] }));
    } finally {
      setChatBusy(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ block: 'end' }), 100);
    }
  };

  const addWord = (w: string, lk: Lookup) => {
    if (!onQuickAddWord) return;
    const de = lk.de || w;
    // مسیر گیت: تکراری/P2/مترادف → دیالوگ تصمیم؛ تازه → افزودن مستقیم (toast در App)
    gate.attempt({ de: lk.art ? `${lk.art} ${de}` : de, fa: lk.fa, pos: lk.pos || '', ex: lk.ex || '', exFa: lk.exFa || '', lvl: ex?.lvl });
  };

    /* ───────── پورتال‌های مشترک: چاپ، کارت واژه، چت ───────── */

  /* برگهٔ چاپ مشترک: صفحهٔ ۱ سؤال‌ها با جای نوشتن، صفحهٔ ۲ پاسخنامه (PrintPreview مشترک) */
  const printMeta = ex
    ? `${ex.lvl} · ${TENSE_INFO[ex.tense].de}${ex.topic ? ` · ${ex.topic}` : ''} · ${faDate(ex.ts)} · نام و تاریخ: ...........................`
    : '';

  const printQuestions = ex ? (
    <>
      <p style={prFa({ fontSize: 11, color: '#333', marginBottom: 8 })}>
        فعل داخل پرانتز به شکل مصدر است — شکل درستِ زمان را در جای خالی بنویس: <b>Ergänzen Sie die Verben!</b>
      </p>
      <p dir="ltr" style={prG({ fontSize: 12.5, lineHeight: 2.1, whiteSpace: 'pre-wrap' })}>
        {ex.segs.map(s => (s.t === 'txt' ? s.x : ` ______( ${s.no} ) (${s.inf}) `)).join('')}
      </p>
      <p style={prFa({ fontSize: 11, fontWeight: 700, margin: '16px 0 6px' })}>پاسخ‌های تو (با شمارهٔ جای خالی):</p>
      <ol style={{ margin: 0, paddingInlineStart: 22, listStyle: 'decimal' }}>
        {gaps.map(g => (
          <li key={g.no} style={{ fontSize: 12, borderBottom: '1.1px solid #999', height: 30, listStylePosition: 'inside', marginBottom: 6 }} />
        ))}
      </ol>
    </>
  ) : null;

  const printSolutions = ex ? (
    <>
      <ol style={{ margin: 0, paddingInlineStart: 22, listStyle: 'decimal' }}>
        {gaps.map(g => {
          const chain = VERBS[g.inf];
          return (
            <li key={g.no} style={{ fontSize: 11.5, marginBottom: 7, lineHeight: 1.8, breakInside: 'avoid' }}>
              <span style={prG({ fontWeight: 700 })}>
                ({g.no}) <b>{g.inf} → {g.ans}</b>
                {chain ? <span style={{ color: '#666', fontSize: 10.5 }}> ({chain.prt3} → {chain.pp}, Perfekt mit {chain.aux})</span> : null}
              </span>
              <div style={prFa({ color: '#444', fontSize: 10, marginTop: 1 })}>💡 {explainBlank({ inf: g.inf, ans: g.ans, kind: g.kind, tense: g.tense }, !!chain)}</div>
            </li>
          );
        })}
      </ol>
      <p style={prFa({ fontWeight: 700, marginTop: 14, fontSize: 11 })}>متن کامل و درست:</p>
      <p dir="ltr" style={prG({ fontSize: 11.5, lineHeight: 2, color: '#333', whiteSpace: 'pre-wrap' })}>{storyPlain(ex.segs, true)}</p>
    </>
  ) : null;

  const printPreview = ex ? (
    <PrintPreview
      open={printOpen}
      onClose={() => setPrintOpen(false)}
      title={<span dir="ltr" style={{ fontFamily: 'Georgia, serif' }}>{ex.title}</span>}
      meta={<>{ex.titleFa ? `${ex.titleFa} · ` : ''}{printMeta}</>}
      questions={printQuestions}
      solutions={printSolutions}
    />
  ) : null;

  const PORTALS = ex ? (
    <>
      {printPreview}

      {/* دیالوگ تصمیم افزودن به واژگان (تکراری / Partizip II / مترادف) */}
      {gate.node}

      {/* کارت واژه (لمس کلمه) */}
      {dictCard && createPortal(
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/40 px-4" onClick={() => setDictCard(null)}>
          <div dir="rtl" className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#141923] shadow-2xl border border-[#dde1ea] dark:border-[#333b4a] p-4" onClick={e => e.stopPropagation()}>
          {(() => {
            const LK = dictCard.ai || dictCard.lk || { fa: 'ترجمه‌ای برای این واژه پیدا نشد.', pos: 'other' } as Lookup;
              const chain = LK.inf && VERBS[LK.inf];
              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div dir="ltr" className="text-lg font-extrabold text-[#1f2a3d] dark:text-[#e7ecf5]">{dictCard.word}</div>
                    <div className="flex gap-1.5">
                      <button onClick={() => doSpeak(dictCard.word)} className="px-2 py-1 rounded-lg border border-[#dde1ea] dark:border-[#333b4a] text-xs">🔊</button>
                      <button onClick={() => setDictCard(null)} className="px-2 py-1 rounded-lg text-xs font-bold text-[#5d6676] dark:text-[#8b95a7]">✕</button>
                    </div>
                  </div>
                  {LK.art && <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#6b4fd8]/10 text-[#6b4fd8]" dir="ltr">{LK.art}</span>}
                  {LK.pos && <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-[#0f141d] text-[#5d6676] dark:text-[#8b95a7] ml-1">{LK.pos}</span>}
                  <p className="text-sm font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">{LK.fa}</p>
                  {chain && (
                    <div dir="ltr" className="text-left text-xs font-bold text-[#1f2a3d] dark:text-[#e7ecf5] bg-slate-50 dark:bg-[#0f141d] rounded-lg px-2.5 py-1.5">
                      {LK.inf} → {chain.prt3} → {chain.pp}
                      <span className="text-[#5d6676] dark:text-[#8b95a7]"> (Perfekt mit {chain.aux})</span>
                    </div>
                  )}
                  {LK.ex && (
                    <div className="rounded-lg bg-slate-50 dark:bg-[#0f141d] px-2.5 py-2">
                      <p dir="ltr" className="text-left text-[13px] font-bold text-[#1f2a3d] dark:text-[#e7ecf5]">{LK.ex}</p>
                      {LK.exFa && <p className="text-xs text-[#5d6676] dark:text-[#8b95a7] mt-0.5">{LK.exFa}</p>}
                    </div>
                  )}
                  {onQuickAddWord && LK.fa && LK.fa !== 'این کلمه در واژه‌نامهٔ این تمرین نیست.' && (
                    <button
                      onClick={() => addWord(dictCard.word, LK)}
                      disabled={added.has(LK.de || dictCard.word)}
                      className="w-full py-2.5 rounded-lg text-sm font-bold bg-emerald-600 text-white disabled:opacity-50"
                    >
                      {added.has(LK.de || dictCard.word) ? '✓ به واژگان اضافه شد' : '＋ افزودن به واژگان'}
                    </button>
                  )}
                  {!dictCard.ai && (!LK.fa || LK.fa === 'این کلمه در واژه‌نامهٔ این تمرین نیست.') && (
                    <p className="text-xs text-[#5d6676] dark:text-[#8b95a7]">{aiReady() ? 'واژه‌نامهٔ آفلاین پاسخی نداشت و پرسش از معلم هم ناموفق بود.' : 'در واژه‌نامهٔ آفلاین نیست؛ برای ترجمه، معلم را در تنظیمات برنامه فعال کن.'}</p>
                  )}
                </div>
              );
            })()}
          </div>
        </div>,
        document.body
      )}

      {/* چت با معلم */}
      {chatGap !== null && createPortal(
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40" onClick={() => setChatGap(null)}>
          <div dir="rtl" className="w-full sm:max-w-md bg-white dark:bg-[#141923] rounded-t-2xl sm:rounded-2xl shadow-2xl border border-[#dde1ea] dark:border-[#333b4a] max-h-[78vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {(() => {
              const g = gaps.find(x => x.no === chatGap);
              if (!g) return null;
              const msgs = chats[g.no] || [];
              return (
                <>
                  <div className="px-4 py-2.5 border-b border-[#dde1ea] dark:border-[#333b4a] flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13px] font-extrabold text-[#1f2a3d] dark:text-[#e7ecf5]">
                        💬 معلم — جای خالی {g.no}: <span dir="ltr">{g.inf}</span>
                      </p>
                      <p dir="ltr" className="text-left text-[11px] text-[#5d6676] dark:text-[#8b95a7] truncate">{sentOf(ex.segs, g.no)}</p>
                    </div>
                    <button onClick={() => setChatGap(null)} className="px-2 py-1 rounded-lg text-xs font-bold text-[#5d6676] dark:text-[#8b95a7] shrink-0">✕</button>
                  </div>
                  <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-[180px]">
                    {msgs.length === 0 && <p className="text-xs text-[#5d6676] dark:text-[#8b95a7] py-3 text-center">دربارهٔ همین جای خالی بپرس: «چرا این‌طور؟»، «مثال بده»، …</p>}
                    {msgs.map((m, i) => (
                      <div key={i} className={`max-w-[88%] rounded-2xl px-3 py-2 text-[13px] leading-6 whitespace-pre-wrap ${m.role === 'user' ? 'bg-[#1f5fbf] text-white ml-auto' : 'bg-slate-50 dark:bg-[#0f141d] text-[#1f2a3d] dark:text-[#e7ecf5] border border-[#dde1ea] dark:border-[#333b4a]'}`}>
                        {m.text}
                      </div>
                    ))}
                    {chatBusy && <p className="text-xs text-[#5d6676] dark:text-[#8b95a7]">معلم در حال نوشتن…</p>}
                    <div ref={chatEndRef} />
                  </div>
                  <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                    {QUICK_QS.map(q => (
                      <button key={q} onClick={() => sendChat(q)} disabled={chatBusy} className="px-3 py-1.5 rounded-full text-xs font-bold border border-[#dde1ea] dark:border-[#333b4a] text-[#5d6676] dark:text-[#8b95a7] disabled:opacity-50">
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
                      className="flex-1 border-2 border-[#dde1ea] dark:border-[#333b4a] rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#141923] outline-none"
                    />
                    <button onClick={() => sendChat()} disabled={chatBusy || !chatDraft.trim()} className="px-4 rounded-lg text-sm font-extrabold text-white bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] disabled:opacity-50">فرستادن</button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>,
        document.body
      )}
    </>
  ) : null;

  /* ═══════════════════ صفحهٔ تنظیم تمرین (پوستهٔ یکدست مثل بقیهٔ تمرین‌ها) ═══════════════════ */
  if (screen === 'config') {
    return (
      <div dir="rtl" className="space-y-3">
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 space-y-4 shadow-xs">
          {/* ۱. سطح — چیپ‌های قابل کلیک در یک خط */}
          <Section n="۱" label="سطح">
            <LevelChips value={lvl} onChange={l => { setLvl(l as TLvl); setVerbCard(null); }} levels={TLVL_ORDER as unknown as string[]} />
            <p className="text-xs text-[#5d6676] dark:text-[#8b95a7] mt-2 leading-5">{TLVL_INFO[lvl].label}</p>
          </Section>

          {/* ۲. زمان دستوری — چیپ‌ها در یک خط (کشیدنی افقی) */}
          <Section n="۲" label="زمان دستوری">
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {TENSE_ORDER.map(t => (
                <button
                  key={t}
                  onClick={() => setTense(t)}
                  title={TENSE_INFO[t].expl}
                  className={`flex-shrink-0 min-w-[80px] py-2.5 rounded-xl text-xs font-bold border transition leading-4 ${
                    tense === t
                      ? 'bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white border-transparent shadow'
                      : 'bg-slate-50 dark:bg-[#141923] border-[#dde1ea] dark:border-[#333b4a] text-[#1f2a3d] dark:text-[#e7ecf5]'
                  }`}
                >
                  {TENSE_INFO[t].de}
                  <span className="block text-[10px] font-medium opacity-80">{TENSE_INFO[t].fa}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-[#5d6676] dark:text-[#8b95a7] mt-2 leading-5">{TENSE_INFO[tense].expl}</p>
          </Section>

          {/* ۳. تعداد جاهای خالی — فقط عدد، در یک خط */}
          <Section n="۳" label="تعداد جاهای خالی">
            <CountChips value={count} onChange={setCount} counts={[5, 8, 10, 12]} />
          </Section>

          {/* ۴. موضوع (اختیاری) */}
          <Section n="۴" label="موضوع (اختیاری)">
            <TopicInput value={topic} onChange={setTopic} chips={TOPIC_CHIPS} placeholder="مثلاً: اولین سفر با قطار" />
          </Section>

          {/* دکمه‌های ساخت */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <button
              onClick={generateAI}
              disabled={busy !== null}
              className="w-full py-3 rounded-xl text-sm font-extrabold text-white bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] shadow disabled:opacity-50"
            >
              {busy === 'gen' ? 'در حال ساختن داستان…' : '✨ ساخت داستان با معلم'}
            </button>
            <button
              onClick={generateBank}
              disabled={busy !== null}
              className="w-full py-3 rounded-xl text-sm font-extrabold border-2 border-[#1f5fbf] text-[#1f5fbf] dark:text-[#7fb0ff] bg-white dark:bg-[#141923] disabled:opacity-50"
            >
              📖 داستان آمادهٔ آفلاین ({BAND_INFO[bandOf(lvl)].label})
            </button>
          </div>
        </div>

        {/* راهنمای فعل‌ها و حروف اضافهٔ سطح */}
        <div className="border border-[#dde1ea] dark:border-[#333b4a] rounded-xl overflow-hidden">
          <button
            onClick={() => setGuideOpen(o => !o)}
            className="w-full px-3 py-3 flex items-center justify-between text-[13px] font-bold text-[#1f2a3d] dark:text-[#e7ecf5] bg-slate-50 dark:bg-[#0f141d]"
          >
            <span>📚 راهنمای فعل‌ها و حروف اضافهٔ سطح {lvl}</span>
            <span className={`transition-transform text-xs ${guideOpen ? 'rotate-180' : ''}`}>▼</span>
          </button>
          {guideOpen && (
            <div className="px-3 pb-3 pt-2 space-y-2">
              <div className="text-xs text-[#5d6676] dark:text-[#8b95a7] leading-5">
                داستانِ این سطح عمدتاً با این فعل‌ها ساخته می‌شود. روی هر فعل بزن تا صرفش را ببینی.
              </div>
              <div className="flex flex-wrap gap-1.5">
                {LEVEL_VERBS[lvl].map(v => (
                  <button
                    key={v}
                    onClick={() => setVerbCard(v === verbCard ? null : v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                      verbCard === v
                        ? 'bg-[#1f5fbf] text-white border-transparent'
                        : 'bg-white dark:bg-[#141923] border-[#dde1ea] dark:border-[#333b4a] text-[#1f2a3d] dark:text-[#e7ecf5]'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              {verbCard && VERBS[verbCard] && (
                <div className="rounded-lg bg-slate-50 dark:bg-[#0f141d] border border-[#dde1ea] dark:border-[#333b4a] px-3 py-2 text-[13px] leading-6">
                  <b className="text-[#1f5fbf] dark:text-[#7fb0ff]">{verbCard}</b>
                  <span className="text-[#5d6676] dark:text-[#8b95a7]"> — {VERBS[verbCard].fa}</span>
                  <div dir="ltr" className="text-left font-bold text-[#1f2a3d] dark:text-[#e7ecf5] mt-1">
                    {verbCard} → {VERBS[verbCard].prt3} → {VERBS[verbCard].pp}
                    <span className="text-[#5d6676] dark:text-[#8b95a7] font-medium"> (Perfekt mit {VERBS[verbCard].aux})</span>
                  </div>
                </div>
              )}
              <div className="text-xs text-[#5d6676] dark:text-[#8b95a7] pt-1">حروف اضافهٔ این سطح:</div>
              <div className="flex flex-wrap gap-1.5">
                {LEVEL_PREPS[lvl].map(p => (
                  <span key={p} dir="ltr" className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-50 dark:bg-[#0f141d] border border-[#dde1ea] dark:border-[#333b4a] text-[#5d6676] dark:text-[#8b95a7]">{p}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* تاریخچه — آرشیو یکدست «تمرین‌های ذخیره‌شده» + آزمون دوباره + حذف با تأییدیه */}
        <ArchivePanel
          title="تمرین‌های ذخیره‌شده"
          count={history.length}
          emptyText="هنوز تمرینی ذخیره نشده."
        >
          {history.map(a => {
            const tot = gapList(a.segs).length;
            const okN = a.results ? Object.values(a.results).filter(r => r.ok).length : 0;
            return (
              <ArchiveRow
                key={a.id}
                title={<button onClick={() => reopen(a)} className="text-right w-full text-[13px] font-bold text-[#1f2a3d] dark:text-[#e7ecf5] truncate">{a.title}</button>}
                chips={<>
                  <MiniChip tone="blue">{a.lvl}</MiniChip>
                  <MiniChip>{TENSE_INFO[a.tense].fa}</MiniChip>
                  <MiniChip>{faDate(a.ts)}</MiniChip>
                  {a.done && a.results ? <MiniChip tone="green">{toFa(okN)}/{toFa(tot)} درست ✓</MiniChip> : <MiniChip>ناتمام</MiniChip>}
                </>}
              >
                <SqBtn onClick={() => reopen(a)} title="بازگشایی این داستان">▶</SqBtn>
                <SqBtn tone="green" onClick={() => retake(a)} title="آزمون دوباره (همان داستان، بدون پاسخ)">🔁</SqBtn>
                <SqBtn
                  tone="red"
                  onClick={async () => {
                    if (await ask('حذف داستان', `«${a.title}» از تاریخچه برای همیشه حذف می‌شود. مطمئن هستی؟`)) removeFromHist(a.id);
                  }}
                  title="حذف"
                >🗑</SqBtn>
              </ArchiveRow>
            );
          })}
        </ArchivePanel>
        {dialog}
      </div>
    );
  }

    /* ═══════════════════ صفحهٔ بازی ═══════════════════ */
  if (screen === 'play' && ex) {
    const answered = gaps.filter(g => (answers[g.no] || '').trim()).length;
    return (
      <div dir="rtl" className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-base font-extrabold text-[#1f2a3d] dark:text-[#e7ecf5] truncate">{ex.title}</h2>
            {ex.titleFa && <p className="text-xs text-[#5d6676] dark:text-[#8b95a7] mt-0.5">{ex.titleFa}</p>}
            <div className="flex gap-1.5 mt-1 flex-wrap">
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#1f5fbf]/10 text-[#1f5fbf] dark:text-[#7fb0ff]">{ex.lvl}</span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#6b4fd8]/10 text-[#6b4fd8]">{TENSE_INFO[ex.tense].de}</span>
              {ex.topic && <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-[#0f141d] text-[#5d6676] dark:text-[#8b95a7]">{ex.topic}</span>}
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-[#0f141d] text-[#5d6676] dark:text-[#8b95a7]">{ex.src === 'ai' ? '🎓 معلم' : '📖 بانک داستان'}</span>
            </div>
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => doSpeak(storyPlain(ex.segs, false))} title="خواندن داستان" className="px-2.5 py-1.5 rounded-lg text-xs font-bold border border-[#dde1ea] dark:border-[#333b4a] text-[#5d6676] dark:text-[#8b95a7]">🔊</button>
            <button onClick={() => setScreen('config')} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-[#dde1ea] dark:border-[#333b4a] text-[#5d6676] dark:text-[#8b95a7]">تمرین جدید</button>
          </div>
        </div>

        {/* نوار پیشرفت */}
        <div className="rounded-xl border border-[#dde1ea] dark:border-[#333b4a] bg-white dark:bg-[#141923] px-3 py-2 flex items-center justify-between text-[13px]">
          <span className="text-[#5d6676] dark:text-[#8b95a7] font-bold">
            {checked && score ? `نتیجه: ${score.ok} از ${score.total} درست ${score.ok === score.total ? '🎉' : ''}` : `پاسخ داده‌شده: ${answered} از ${gaps.length}`}
          </span>
          {!checked && (
            <span className="text-xs text-[#5d6676] dark:text-[#8b95a7]">فعل مصدر داخل پرانتز است؛ شکل درست زمان را بنویس</span>
          )}
          {checked && score && (
            <div className="h-2 w-28 rounded-full bg-slate-100 dark:bg-[#0f141d] overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: `${Math.round((score.ok / Math.max(1, score.total)) * 100)}%` }} />
            </div>
          )}
        </div>

        {/* متن داستان — آلمانی: چپ‌به‌راست (درخواست کاربر، تصویر ۵) */}
        <div className="rounded-2xl border border-[#dde1ea] dark:border-[#333b4a] bg-white dark:bg-[#141923] px-4 py-4 shadow-sm" dir="ltr" style={{ textAlign: 'left' }}>
          <p className="text-[17px] leading-[2.4] text-[#1f2a3d] dark:text-[#e7ecf5]" style={{ textAlign: 'left' }}>
            {ex.segs.map((s, i) => {
              if (s.t === 'txt') {
                return tokenize(s.x).map((tk, j) =>
                  tk.isWord ? (
                    <button
                      key={`${i}-${j}`}
                      onClick={() => tapWord(tk.w)}
                      className="cursor-pointer rounded px-0.5 hover:bg-amber-200/80 dark:hover:bg-amber-700/50 transition-colors"
                    >
                      {tk.w}
                    </button>
                  ) : (
                    <span key={`${i}-${j}`}>{tk.w}</span>
                  )
                );
              }
              const g = s;
              const r = results[g.no];
              const val = (answers[g.no] || '').trim();
              const stateCls = !checked
                ? 'border-[#1f5fbf]/40 bg-[#1f5fbf]/5 text-[#1f5fbf] dark:text-[#7fb0ff]'
                : r && r.ok
                  ? 'border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                  : r && r.revealed
                    ? 'border-amber-500/50 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                    : 'border-red-500/50 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 line-through decoration-red-400';
              return (
                <span key={`gap-${i}-${g.no}`} className="inline-flex items-baseline gap-1 mx-0.5 align-baseline">
                  {openGap === g.no ? (
                    <input
                      ref={inputRef}
                      dir="ltr"
                      value={gapDraft}
                      onChange={e => setGapDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { submitGap(g.no, gapDraft); } if (e.key === 'Escape') { setOpenGap(null); setGapDraft(''); } }}
                      onBlur={() => { if (gapDraft.trim()) submitGap(g.no, gapDraft); else { setOpenGap(null); setGapDraft(''); } }}
                      placeholder="…"
                      className="w-32 border-2 border-[#1f5fbf] rounded-md px-1.5 py-1 text-base bg-white dark:bg-[#0f141d] text-left outline-none mx-1"
                    />
                  ) : (
                    <button
                      onClick={() => { setOpenGap(g.no); setGapDraft(val); }}
                      className={`inline-block min-w-[86px] px-2 rounded-md border-b-2 text-base font-bold text-center transition ${stateCls}`}
                      dir="ltr"
                    >
                      {val || '…'}
                    </button>
                  )}
                  <span className="text-xs text-[#5d6676] dark:text-[#8b95a7]" dir="ltr">(<button onClick={() => tapWord(g.inf)} className="cursor-pointer rounded px-0.5 hover:bg-amber-200/80 dark:hover:bg-amber-700/50 transition-colors">{g.inf}</button>)</span>
                </span>
              );
            })}
          </p>
          <div className="flex justify-between items-center mt-3 pt-2 border-t border-[#dde1ea] dark:border-[#333b4a]" dir="rtl" style={{ direction: 'rtl' }}>
            <span className="text-xs text-[#5d6676] dark:text-[#8b95a7]">💡 هر کلمهٔ متن را لمس کن: ترجمه + مثال + افزودن به واژگان</span>
            <button onClick={() => doSpeak(storyPlain(ex.segs, false))} className="text-xs font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">🔊 خواندن داستان</button>
          </div>
        </div>

        {/* دکمه‌های کنترل */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            onClick={checkAll}
            disabled={busy !== null}
            className="py-3 rounded-xl text-[13px] font-extrabold text-white bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] shadow disabled:opacity-50"
          >
            {busy === 'check' ? 'در حال تصحیح…' : '✅ تصحیح'}
          </button>
          <button onClick={revealAll} className="py-3 rounded-xl text-[13px] font-extrabold border-2 border-amber-400 text-amber-600 dark:text-amber-400 bg-white dark:bg-[#141923]">
            👀 نمایش پاسخ‌ها
          </button>
          <button
            onClick={() => setScreen('review')}
            disabled={!checked}
            className="py-3 rounded-xl text-[13px] font-extrabold border-2 border-[#dde1ea] dark:border-[#333b4a] text-[#5d6676] dark:text-[#8b95a7] bg-white dark:bg-[#141923] disabled:opacity-40"
          >
            📋 پاسخنامهٔ کامل
          </button>
          <button onClick={() => setPrintOpen(true)} className="py-3 rounded-xl text-[13px] font-extrabold border-2 border-[#dde1ea] dark:border-[#333b4a] text-[#5d6676] dark:text-[#8b95a7] bg-white dark:bg-[#141923]">
            🖨 چاپ / PDF
          </button>
        </div>

        {/* کارت‌های تصحیح */}
        {checked && (
          <div className="space-y-2">
            {gaps.map(g => {
              const r = results[g.no];
              if (!r) return null;
              const shown = r.correct || g.ans;
              const chatCount = (chats[g.no] || []).length;
              return (
                <div
                  key={g.no}
                  className={`rounded-xl border px-3 py-2.5 ${r.ok ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/30' : 'border-red-200 dark:border-red-900 bg-red-50/60 dark:bg-red-950/30'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[13px] font-bold flex items-center gap-1.5 flex-wrap">
                      <span className={r.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}>{r.ok ? '✓' : '✗'} جای خالی {g.no}</span>
                      <span dir="ltr" className="font-extrabold text-[#1f2a3d] dark:text-[#e7ecf5]">{g.inf}</span>
                      <span className="text-[#5d6676] dark:text-[#8b95a7] font-medium">→</span>
                      <span dir="ltr" className="font-extrabold text-[#1f5fbf] dark:text-[#7fb0ff]">{shown}</span>
                      {!r.ok && r.given && <span className="text-[11px] text-[#b91c1c] dark:text-red-400">(پاسخ تو: {r.given})</span>}
                    </div>
                    <button
                      onClick={() => { setChatGap(g.no); }}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold border border-[#1f5fbf]/30 text-[#1f5fbf] dark:text-[#7fb0ff] bg-white dark:bg-[#141923] shrink-0"
                    >
                      💬 معلم{chatCount ? ` (${chatCount})` : ''}
                    </button>
                  </div>
                  {!r.ok && (r.grammar || r.meaning || r.thinking || r.tip) && (
                    <div className="mt-1.5 space-y-1 text-xs leading-6">
                      {r.grammar && <p className="text-[#1f2a3d] dark:text-[#e7ecf5]"><b className="text-[#1f5fbf] dark:text-[#7fb0ff]">گرامر:</b> {r.grammar}</p>}
                      {r.meaning && <p className="text-[#1f2a3d] dark:text-[#e7ecf5]"><b className="text-[#1f5fbf] dark:text-[#7fb0ff]">معنا:</b> {r.meaning}</p>}
                      {r.thinking && <p className="text-[#1f2a3d] dark:text-[#e7ecf5]"><b className="text-[#6b4fd8]">تفکر آلمانی:</b> {r.thinking}</p>}
                      {r.tip && <p className="text-[#5d6676] dark:text-[#8b95a7]"><b>💡</b> {r.tip}</p>}
                      {r.offline && <p className="text-xs text-[#5d6676] dark:text-[#8b95a7]">تصحیح آفلاین (بانک داستان) — برای توضیح کامل، با معلم گفتگو کن یا تصحیح هوشمند را فعال کن.</p>}
                    </div>
                  )}
                  {r.ok && r.thinking && (
                    <p className="mt-1 text-xs leading-6 text-[#1f2a3d] dark:text-[#e7ecf5]"><b className="text-[#6b4fd8]">تفکر آلمانی:</b> {r.thinking}</p>
                  )}
                  {!r.ok && !r.offline && !r.grammar && !r.tip && (
                    <button onClick={() => setChatGap(g.no)} className="mt-1 text-xs font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">چرا نادرست بود؟ از معلم بپرس 💬</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {PORTALS}
        {dialog}
      </div>
    );
  }

  /* ═══════════════════ صفحهٔ پاسخنامهٔ کامل ═══════════════════ */
  if (screen === 'review' && ex) {
    const okN = score ? score.ok : Object.values(results).filter(r => r.ok).length;
    const tot = gaps.length;
    return (
      <div dir="rtl" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-extrabold text-[#1f2a3d] dark:text-[#e7ecf5]">📋 پاسخنامه — {ex.title}</h2>
          <div className="flex gap-1.5">
            <button onClick={() => setScreen('play')} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-[#dde1ea] dark:border-[#333b4a] text-[#5d6676] dark:text-[#8b95a7]">بازگشت به متن</button>
            <button onClick={() => setScreen('config')} className="px-3 py-1.5 rounded-lg text-xs font-extrabold text-white bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8]">تمرین جدید ✨</button>
          </div>
        </div>

        <div className="rounded-2xl border border-[#dde1ea] dark:border-[#333b4a] bg-white dark:bg-[#141923] px-4 py-4 flex items-center gap-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-lg font-extrabold text-white bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] shrink-0">
            {Math.round((okN / Math.max(1, tot)) * 100)}٪
          </div>
          <div className="text-xs leading-6">
            <p className="font-extrabold text-[#1f2a3d] dark:text-[#e7ecf5]">{okN} از {tot} جای خالی درست</p>
            <p className="text-[#5d6676] dark:text-[#8b95a7]">{ex.lvl} · {TENSE_INFO[ex.tense].de} ({TENSE_INFO[ex.tense].fa}){ex.topic ? ` · ${ex.topic}` : ''}</p>
            <p className="text-[#5d6676] dark:text-[#8b95a7]">{okN === tot ? 'بی‌نقص! 🎉' : okN >= tot * 0.7 ? 'خوب بود — موارد قرمز را با معلم مرور کن.' : 'با حوصله موارد قرمز را بخوان و دوباره تمرین کن.'}</p>
          </div>
          <button onClick={() => setPrintOpen(true)} className="mr-auto px-3 py-1.5 rounded-lg text-xs font-bold border border-[#dde1ea] dark:border-[#333b4a] text-[#5d6676] dark:text-[#8b95a7] shrink-0">🖨 چاپ / PDF</button>
        </div>

        <div className="space-y-2">
          {gaps.map(g => {
            const r = results[g.no];
            const shown = (r && r.correct) || g.ans;
            const chain = VERBS[g.inf];
            const offlineNote = explainBlank({ inf: g.inf, ans: g.ans, kind: g.kind, tense: g.tense }, !!chain);
            return (
              <div key={g.no} className={`rounded-xl border px-3 py-2.5 ${r && r.ok ? 'border-emerald-200 dark:border-emerald-900' : 'border-red-200 dark:border-red-900'} bg-white dark:bg-[#141923]`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-[13px] font-bold text-[#1f2a3d] dark:text-[#e7ecf5]">
                    <span className={r && r.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}>{r && r.ok ? '✓' : '✗'}</span>
                    {' '}جای خالی {g.no}: <span dir="ltr" className="font-extrabold text-[#1f5fbf] dark:text-[#7fb0ff]">{g.inf} → {shown}</span>
                    {r && !r.ok && r.given && <span className="text-[11px] text-[#b91c1c] dark:text-red-400"> (پاسخ تو: {r.given})</span>}
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => doSpeak(sentOf(ex.segs, g.no))} className="px-2.5 py-1.5 rounded-md text-xs border border-[#dde1ea] dark:border-[#333b4a]">🔊 جمله</button>
                    <button onClick={() => { setChatGap(g.no); }} className="px-2.5 py-1.5 rounded-md text-xs font-bold border border-[#1f5fbf]/30 text-[#1f5fbf] dark:text-[#7fb0ff]">💬 معلم</button>
                  </div>
                </div>
                <p dir="ltr" className="text-left text-xs text-[#5d6676] dark:text-[#8b95a7] mt-1 leading-6"><ClickableWords text={sentOf(ex.segs, g.no)} onWord={tapWord} /></p>
                {(r && (r.grammar || r.meaning || r.thinking || r.tip)) ? (
                  <div className="mt-1.5 space-y-1 text-xs leading-6">
                    {r.grammar && <p><b className="text-[#1f5fbf] dark:text-[#7fb0ff]">گرامر:</b> <span className="text-[#1f2a3d] dark:text-[#e7ecf5]">{r.grammar}</span></p>}
                    {r.meaning && <p><b className="text-[#1f5fbf] dark:text-[#7fb0ff]">معنا:</b> <span className="text-[#1f2a3d] dark:text-[#e7ecf5]">{r.meaning}</span></p>}
                    {r.thinking && <p><b className="text-[#6b4fd8]">تفکر آلمانی:</b> <span className="text-[#1f2a3d] dark:text-[#e7ecf5]">{r.thinking}</span></p>}
                    {r.tip && <p className="text-[#5d6676] dark:text-[#8b95a7]"><b>💡</b> {r.tip}</p>}
                  </div>
                ) : (
                  <p className="mt-1.5 text-xs leading-6 text-[#5d6676] dark:text-[#8b95a7]">{offlineNote}{r && r.offline ? ' (تصحیح آفلاین)' : ''}</p>
                )}
              </div>
            );
          })}
        </div>

        <div className="rounded-2xl border border-[#dde1ea] dark:border-[#333b4a] bg-white dark:bg-[#141923] px-4 py-4">
          <p className="text-[13px] font-bold text-[#1f2a3d] dark:text-[#e7ecf5] mb-2">متن کامل و درست:</p>
          <p dir="ltr" className="text-left text-[15px] leading-7 text-[#1f2a3d] dark:text-[#e7ecf5]"><ClickableWords text={storyPlain(ex.segs, true)} onWord={tapWord} /></p>
          <div className="flex justify-end mt-2">
            <button onClick={() => doSpeak(storyPlain(ex.segs, true))} className="text-xs font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">🔊 خواندن متن کامل</button>
          </div>
        </div>
        {PORTALS}
        {dialog}
      </div>
    );
  }

  return null;
};

// هر دو سبک import را پشتیبانی می‌کند: named و default
export default TenseStoryTrainer;
