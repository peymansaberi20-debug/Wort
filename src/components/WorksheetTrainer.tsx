/**
 * WorksheetTrainer.tsx — برگه‌های تمرین با هوش مصنوعی (Arbeitsblatt AI) — دو تمرین جداگانه
 *
 * منطق دو برگهٔ نمونهٔ کاربر تحلیل شد و حالا هوش مصنوعی هر بار با همان منطق یک برگهٔ تازه می‌سازد:
 *   kind='prep'   → «برگهٔ فعل + حرف اضافه»: جمله با ۱–۲ جای خالی برای حرف اضافهٔ ثابتِ فعل/صفت؛
 *                   پاسخ‌ها را AI همراه برگه می‌سازد → بررسی محلیِ فوری + «چرا این جواب؟» + چت با معلم.
 *   kind='klasse' → «برگهٔ کلاس»: نیمی توضیح واژهٔ سطح‌دار، نیمی کامل‌کردن جمله با حرف ربط
 *                   (تمرین جایگاه فعل: قید → فعل در جایگاه ۲، وابسته‌ساز → فعل در انتها)؛ تصحیح سه‌لایهٔ AI.
 * پیکربندی هر بار: سطح (A1–C2) + تعداد مورد (۵/۸/۱۰/۱۲) + موضوع اختیاری — سپس «ساخت برگه» با AI.
 * هر برگهٔ ساخته‌شده با نمره و گفتگوهایش در آرشیو (localStorage) ذخیره می‌شود و دوباره باز می‌شود.
 * اجرا مثل قبل جمله‌به‌جمله است: هر مورد یک کارت مستقل → پاسخ → بررسی → توضیح → مورد بعدی.
 */

import React, { useState, useEffect, useRef } from 'react';
import { describeAiError, generateText, hasApiKey, getActiveProvider, getModel, getAiDebugInfo } from '../utils/aiProvider';
import { Lvl, LVL_ORDER, LVL_INFO } from '../data/konnektorenData';

/* ───────────── مدل برگه (همان منطق نمونه‌ها) ───────────── */

export interface WshItem {
  /** 'gap' پیش‌فرض — جای‌خالی با پاسخ مشخص؛ چند جای‌خالی پشتیبانی می‌شود */
  kind?: 'gap';
  /** قطعه‌های جمله؛ اندیس‌های فرد جای خالی هستند */
  seg: string[];
  /** پاسخ درست هر جای خالی (به ترتیب) */
  answers: string[];
  /** توضیح کوتاه فارسی: فعل/ساختار + حرف اضافه + حالت */
  note: string;
  /** پاسخ‌های جایگزین پذیرفته برای هر جای خالی */
  alt?: string[][];
}

/** تمرین آزاد: توضیح واژه یا کامل‌کردن جمله با حرف ربط — تصحیح با هوش مصنوعی */
export interface WshOpenItem {
  kind: 'open';
  /** بخش ثابت سؤال یا شروع جمله */
  prompt: string;
  /** حرف ربط داده‌شده (پررنگ نمایش داده می‌شود) */
  connector?: string;
  /** پاسخ نمونهٔ خوب */
  model: string;
  /** نکتهٔ کوتاه فارسی (معنای واژه یا قاعدهٔ جایگاه فعل) */
  note: string;
}

export type WshEntry = WshItem | WshOpenItem;

interface ChatMsg { role: 'user' | 'ai'; text: string; }

/** یک برگهٔ ساخته‌شدهٔ AI در آرشیو */
interface WshArch {
  id: string; ts: number; kind: Kind; level: string; topic: string;
  items: WshEntry[];
  score?: { ok: number; total: number };
  chats: Record<number, ChatMsg[]>;
}

/** جلسهٔ در حال اجرا = برگه + پیشرفت + گفتگوها */
interface Session {
  id: string; ts: number; level: string; topic: string; items: WshEntry[];
  order: number[]; idx: number; ok: number; wrong: number[];
  chats: Record<number, ChatMsg[]>;
  score?: { ok: number; total: number };
}

type Kind = 'prep' | 'klasse';
type Phase = 'config' | 'run' | 'done';

const isOpen = (it: WshEntry): it is WshOpenItem => (it as WshOpenItem).kind === 'open';

/* ───────────── پل هوش مصنوعی برنامه (کلید از تنظیمات) ───────────── */

const askJson = async (prompt: string): Promise<string> => generateText(prompt, { json: true, timeoutMs: 90000, retries: 1 });
const askChat = async (prompt: string): Promise<string> => generateText(prompt, { timeoutMs: 60000, retries: 1 });
const aiErr = (e: unknown): string => { try { return describeAiError(e); } catch { return 'خطای نامشخص در اتصال به هوش مصنوعی.'; } };
const hasAIKey = (): boolean => { try { return !!hasApiKey(); } catch { return false; } };
const aiLabel = (): string => {
  try {
    const p = String(getActiveProvider() || 'AI');
    const m = String(getModel() || '').trim();
    return m ? `${p} · ${m}` : p;
  } catch { return 'AI'; }
};

/** پاسخ AI → JSON حتی وقتی ```json یا متن اضافه دارد */
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

/* ───────────── پرامپت‌ها — منطقِ برگه‌های نمونه ───────────── */

const COUNTS = [5, 8, 10, 12];
const TOPIC_CHIPS = ['Alltag', 'Reise', 'Arbeit', 'Umwelt', 'Technik', 'Gesundheit', 'Freizeit'];

const SAMPLE_PREP = '{"seg":["Erika freut sich schon "," ihren Geburtstag."],"answers":["auf"],"note":"sich freuen auf + Akk — شادی برای رویداد آینده"}';

const buildPrepPrompt = (level: string, count: number, topic: string): string =>
  `Du bist ein erfahrener Deutschlehrer und erstellst ein Arbeitsblatt «Verben mit Präpositionen».
Niveau: ${level}. Thema: ${topic.trim() || 'Alltag und Studium'}.
Erstelle GENAU ${count} Lückensätze nach genau diesem Muster:
  ${SAMPLE_PREP}
Regeln:
- Jeder Satz testet ein Verb oder Adjektiv mit fester Präposition (sich freuen auf, warten auf, Angst haben vor, sich bewerben um, sich interessieren für, einverstanden sein mit, teilnehmen an …). Niveau ${level}: Wortschatz und Strukturen passend, keine Wiederholung, unterschiedliche Verben.
- 1 oder 2 Lücken pro Satz. "seg" ist ein Array mit 2 (bei einer Lücke) oder 3 (bei zwei Lücken) Textteilen; die Lücken stehen genau zwischen den Teilen.
- Steht die Lücke am Satzanfang, großgeschrieben (z. B. "Mit wem hast du dich unterhalten?").
- "answers": die richtigen Präpositionen in der Reihenfolge der Lücken.
- "note": ۱–۲ جملهٔ فارسی — فعل/ساختار + حرف اضافه + حالت (+ معنی فعل در صورت لزوم)، مثل نمونه.
- "alt" (اختیاری): پاسخ‌های جایگزینِ درستِ هر Lücke.
Gib NUR ein JSON-Array zurück.`;

const SAMPLE_KL1 = '{"prompt":"(im Boden / in der Erde) versickern","model":"Wenn Wasser langsam in den Boden fließt und dort verschwindet, versickert es.","note":"versickern = فرو رفتن/نفوذ کردن آب در خاک"}';
const SAMPLE_KL2 = '{"prompt":"Die Parkgebühren wurden stark erhöht,","connector":"trotzdem","model":"…, trotzdem fahren viele Menschen immer noch mit dem Auto in die Stadt.","note":"trotzdem = قید؛ فعل بلافاصله بعد از آن (جایگاه ۲)"}';

const KONNS_FOR = (level: string): string =>
  level === 'A1' || level === 'A2'
    ? 'und, aber, oder, denn, weil, dass, wenn'
    : level === 'B1'
      ? 'weil, obwohl, damit, deshalb, darum, trotzdem, dennoch, während, bevor, nachdem, denn'
      : 'obwohl, damit, sodass, allerdings, dennoch, infolgedessen, einerseits … andererseits, je … desto, zum einen … zum anderen';

const buildKlassePrompt = (level: string, count: number, topic: string): string =>
  `Du bist ein erfahrener Deutschlehrer und erstellst ein Arbeitsblatt wie in einem Deutschkurs.
Niveau: ${level}. Thema: ${topic.trim() || 'Stadt, Alltag, Umwelt und Arbeit'}.
Erstelle GENAU ${count} Aufgaben in diesem gemischten Format (Logik des Original-Arbeitsblattes):
A) Etwa die Hälfte — «Wort erklären»: ein Niveau-${level}-Wort (Nomen mit Artikel, Verb oder Wendung) in Klammern; der Lerner schreibt einen definierenden Beispielsatz.
   ${SAMPLE_KL1}
B) Die andere Hälfte — «Sätze komplettieren mit Konnektor»: erster Teilsatz + vorgegebener Konnektor; der Lerner schreibt den zweiten Teilsatz.
   ${SAMPLE_KL2}
Konnektoren für Niveau ${level} (abwechselnd): ${KONNS_FOR(level)}.
Regeln:
- Wortstellungs-Fokus: Adverb-Konnektoren (darum/daher/trotzdem/dennoch/allerdings) → Verb direkt danach (Position 2). Nebensatz-Konnektoren (obwohl/damit/weil/sodass) → Verb am Ende des Nebensatzes. Die Modellantwort muss das genau zeigen (beginnt mit „…, ").
- "note": قاعدهٔ کوتاه فارسی — برای نوع A: معنی واژه؛ برای نوع B: قاعدهٔ جایگاه فعل آن Konnektor.
- "model": یک پاسخ نمونهٔ کامل، طبیعی و درست.
- Wortschatz und Themen passend zu Niveau ${level}, keine Wiederholung.
Gib NUR ein JSON-Array zurück (Typ A ohne "connector", Typ B mit "connector").`;

/* ───────────── پاک‌سازی پاسخ AI ───────────── */

const cleanPrep = (raw: string): WshItem[] => {
  const arr = parseJSONLoose<unknown[]>(raw);
  return (Array.isArray(arr) ? arr : [])
    .map((x) => {
      const o = (x || {}) as Record<string, unknown>;
      const seg = Array.isArray(o.seg) ? o.seg.map((s) => String(s ?? '')) : [];
      const answers = Array.isArray(o.answers) ? o.answers.map((s) => String(s ?? '').trim()) : [];
      const alt = Array.isArray(o.alt)
        ? o.alt.map((a) => (Array.isArray(a) ? a.map((v) => String(v ?? '')) : []))
        : undefined;
      return { seg, answers, alt, note: String(o.note ?? '').trim() };
    })
    .filter((it) => it.seg.length >= 2 && it.answers.length === it.seg.length - 1
      && it.answers.every((a) => a.length > 0 && a.length < 30) && it.note.length > 0)
    .map((it) => ({ seg: it.seg, answers: it.answers, note: it.note, alt: it.alt }))
    .slice(0, 20);
};

const cleanKlasse = (raw: string): WshOpenItem[] => {
  const arr = parseJSONLoose<unknown[]>(raw);
  return (Array.isArray(arr) ? arr : [])
    .map((x) => {
      const o = (x || {}) as Record<string, unknown>;
      return {
        kind: 'open' as const,
        prompt: String(o.prompt ?? '').trim(),
        connector: o.connector ? String(o.connector).trim() : undefined,
        model: String(o.model ?? '').trim(),
        note: String(o.note ?? '').trim(),
      };
    })
    .filter((it) => it.prompt.length > 3 && it.model.length > 3 && it.note.length > 0)
    .slice(0, 20);
};

/* ───────────── منطق مشترک ───────────── */

const norm = (s: string): string => s.toLowerCase().trim().replace(/\s+/g, ' ');

/** جملهٔ کامل با پاسخ‌های درست (برای AI و توضیح) */
const itemFull = (it: WshItem): string => {
  let s = it.seg[0] || '';
  for (let g = 0; g < it.answers.length; g++) s += it.answers[g] + (it.seg[g + 1] || '');
  return s;
};

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const toFa = (n: number | string): string => String(n).replace(/[0-9]/g, (d) => FA_DIGITS[+d]);
const faDate = (ts: number): string => {
  try { return new Date(ts).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }); }
  catch { return new Date(ts).toLocaleDateString(); }
};

const gapGood = (it: WshItem, g: number, v: string): boolean => {
  const got = norm(v || '');
  if (!got) return false;
  if (got === norm(it.answers[g])) return true;
  return (it.alt?.[g] || []).some((a) => norm(a) === got);
};

interface OpenVerdict { ok: boolean | null; feedback: string; model: string }

/** استخراج JSON از پاسخ تصحیح (با تحمل فنس کد) */
const parseVerdict = (raw: string): { ok: boolean; feedback: string; model: string } | null => {
  try {
    let s = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const m = s.match(/\{[\s\S]*\}/);
    if (m) s = m[0];
    const o = JSON.parse(s) as { ok?: unknown; feedback?: unknown; model?: unknown };
    if (o && typeof o === 'object' && 'ok' in o) {
      return { ok: !!o.ok, feedback: String(o.feedback || ''), model: String(o.model || '') };
    }
  } catch { /* ignore */ }
  return null;
};

/* ───────────── آرشیو برگه‌ها ───────────── */

const ARCH_KEY = 'wb_wsh_ai_arch_v1';
const loadArch = (): WshArch[] => {
  try {
    const a = JSON.parse(localStorage.getItem(ARCH_KEY) || '[]');
    return Array.isArray(a) ? a.filter((x: WshArch) => x && x.id && Array.isArray(x.items)) : [];
  } catch { return []; }
};
const saveAllArch = (a: WshArch[]): void => {
  try { localStorage.setItem(ARCH_KEY, JSON.stringify(a.slice(0, 40))); } catch { /* ignore */ }
};

/* ───────────── چت معلم ───────────── */

const buildChatPrompt = (level: string, it: WshEntry, q: string, convo: ChatMsg[]): string => {
  const ctx = isOpen(it)
    ? `Aufgabe: "${it.prompt}"${it.connector ? ` (vorgegebener Konnektor: ${it.connector})` : ''} | Musterantwort: "${it.model}"`
    : `Lückensatz: "${itemFull(it)}" (Lösung: ${it.answers.join(' + ')})`;
  return `Du bist ein geduldiger Deutschlehrer. Niveau: ${level}. Kontext vom Arbeitsblatt: ${ctx}
${convo.length ? 'Bisheriges Gespräch:\n' + convo.map((m) => (m.role === 'user' ? 'Lerner: ' : 'Lehrer: ') + m.text).join('\n') + '\n' : ''}Frage des Lerners: ${q}
Antworte kurz und klar auf Persisch (Farsi); Fachbegriffe und Beispiele auf Deutsch.`;
};

const QUICK_QS = ['چرا این‌طور درست است؟', 'یک مثال مشابه بده', 'ساده‌تر چطور بگویم؟', 'قاعدهٔ جایگاه فعل را بگو'];

const KIND_INFO: Record<Kind, { title: string; icon: string; logic: string[] }> = {
  prep: {
    title: 'برگهٔ فعل + حرف اضافه (AI)',
    icon: '📄',
    logic: [
      'جمله‌های آلمانی با ۱ تا ۲ جای خالی برای حرف اضافهٔ ثابتِ فعل/صفت (sich freuen auf, Angst haben vor, sich bewerben um, …).',
      'پاسخ‌ها را هوش مصنوعی همراه برگه می‌سازد → بررسی همان‌جا و فوری؛ «چرا این جواب؟» هم توضیح می‌دهد.',
    ],
  },
  klasse: {
    title: 'برگهٔ کلاس (AI)',
    icon: '🧾',
    logic: [
      'نیمی از موارد: توضیح یک واژهٔ سطح‌دار در یک جملهٔ تعریفی (مثل تمرین Vokabeln erklären برگهٔ کلاس).',
      'نیمی دیگر: کامل‌کردن جمله با حرف ربط — قیدها (darum/trotzdem/…) فعل در جایگاه ۲، وابسته‌سازها (obwohl/damit/…) فعل در انتها؛ با تصحیح هوش مصنوعی و پاسخ نمونه.',
    ],
  },
};

/* ───────────── کامپوننت ───────────── */

export const WorksheetTrainer: React.FC<{
  kind: Kind;
  onShowToast?: (m: string, e?: boolean) => void;
  onClose?: () => void;
}> = ({ kind, onShowToast, onClose }) => {
  const info = KIND_INFO[kind];
  const [phase, setPhase] = useState<Phase>('config');
  const [sess, setSess] = useState<Session | null>(null);
  const [level, setLevel] = useState<Lvl>('B1');
  const [count, setCount] = useState(8);
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [inputs, setInputs] = useState<string[]>([]);
  const [checked, setChecked] = useState<boolean[] | null>(null);
  const [itemOk, setItemOk] = useState<boolean | null>(null);
  const [hint, setHint] = useState(false);
  const [why, setWhy] = useState<{ busy: boolean; text: string; err: string; idx: number }>({ busy: false, text: '', err: '', idx: -1 });
  const [openText, setOpenText] = useState('');
  const [openVerdict, setOpenVerdict] = useState<OpenVerdict | null>(null);
  const [openBusy, setOpenBusy] = useState(false);
  const [openModel, setOpenModel] = useState(false);
  const [chatIdx, setChatIdx] = useState<number | null>(null);
  const [chatDraft, setChatDraft] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [arch, setArch] = useState<WshArch[]>(() => loadArch().filter((a) => a.kind === kind));
  const [archOpen, setArchOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (chatIdx !== null) setTimeout(() => chatEndRef.current?.scrollIntoView({ block: 'end' }), 120); }, [chatIdx, sess?.chats]);

  // ذخیرهٔ خودکار برگه در آرشیو (با تأخیر؛ نمره و گفتگوها هم به‌روز می‌شوند)
  useEffect(() => {
    if (!sess || !sess.items.length) return;
    const t = setTimeout(() => {
      const entry: WshArch = {
        id: sess.id, ts: sess.ts, kind, level: sess.level, topic: sess.topic,
        items: sess.items, score: sess.score, chats: sess.chats,
      };
      const rest = loadArch().filter((x) => x.id !== sess.id);
      const next = [entry, ...rest];
      saveAllArch(next);
      setArch(next.filter((x) => x.kind === kind));
    }, 700);
    return () => clearTimeout(t);
  }, [sess, kind]);

  const resetItem = (): void => {
    setChecked(null); setItemOk(null); setHint(false);
    setOpenText(''); setOpenVerdict(null); setOpenBusy(false); setOpenModel(false);
    setWhy({ busy: false, text: '', err: '', idx: -1 });
  };

  const runSheet = (items: WshEntry[], meta: { id: string; ts: number; level: string; topic: string; chats?: Record<number, ChatMsg[]>; score?: { ok: number; total: number } }): void => {
    setSess({
      id: meta.id, ts: meta.ts, level: meta.level, topic: meta.topic, items,
      order: items.map((_, i) => i), idx: 0, ok: 0, wrong: [],
      chats: meta.chats || {}, score: meta.score,
    });
    setInputs(!isOpen(items[0]) ? new Array(items[0].answers.length).fill('') : []);
    resetItem();
    setChatIdx(null);
    setPhase('run');
  };

  const generate = async (lvl?: string, cnt?: number): Promise<void> => {
    if (!hasAIKey()) { onShowToast?.('هوش مصنوعی در تنظیمات برنامه فعال نیست — از صفحهٔ تنظیمات کلید را وارد و ذخیره کن.', true); return; }
    const theLvl = lvl || level;
    const theCnt = Math.max(1, Math.min(20, cnt || count));
    setBusy(true);
    try {
      const prompt = kind === 'prep' ? buildPrepPrompt(theLvl, theCnt, topic) : buildKlassePrompt(theLvl, theCnt, topic);
      const raw = await askJson(prompt);
      const items: WshEntry[] = kind === 'prep' ? cleanPrep(raw) : cleanKlasse(raw);
      if (!items.length) throw new Error('پاسخ هوش مصنوعی ساختار معتبر نداشت — دوباره تلاش کن.');
      runSheet(items, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ts: Date.now(), level: theLvl, topic: topic.trim() });
      onShowToast?.(`برگهٔ جدید با ${items.length} مورد ساخته شد ✓`);
    } catch (e) {
      onShowToast?.(aiErr(e), true);
    } finally {
      setBusy(false);
    }
  };

  const openArch = (a: WshArch): void => {
    setLevel(a.level as Lvl); setTopic(a.topic);
    runSheet(a.items, { id: a.id, ts: a.ts, level: a.level, topic: a.topic, chats: a.chats, score: a.score });
  };

  const check = (): void => {
    if (!sess || checked) return;
    const cur = sess.items[sess.order[sess.idx]];
    if (isOpen(cur)) return;
    const res = cur.answers.map((_, g) => gapGood(cur, g, inputs[g] || ''));
    setChecked(res);
    setItemOk(res.every(Boolean));
  };

  const next = (): void => {
    if (!sess) return;
    const cur = sess.items[sess.order[sess.idx]];
    if (isOpen(cur)) { if (!openVerdict || openVerdict.ok === null) return; } else if (!checked) return;
    const good = isOpen(cur) ? openVerdict?.ok === true : itemOk === true;
    const itemIdx = sess.order[sess.idx];
    const ok = sess.ok + (good ? 1 : 0);
    const wrong = good ? sess.wrong : [...sess.wrong, itemIdx];
    if (sess.idx + 1 >= sess.order.length) {
      setSess({ ...sess, idx: sess.idx + 1, ok, wrong, score: { ok, total: sess.order.length } });
      setPhase('done');
      onShowToast?.(`نتیجهٔ برگه ذخیره شد: ${ok} از ${sess.order.length}`);
      return;
    }
    const nItem = sess.items[sess.order[sess.idx + 1]];
    setSess({ ...sess, idx: sess.idx + 1, ok, wrong });
    setInputs(isOpen(nItem) ? [] : new Array(nItem.answers.length).fill(''));
    resetItem();
  };

  const askWhy = async (it: WshItem): Promise<void> => {
    if (!sess) return;
    setWhy({ busy: true, text: '', err: '', idx: sess.idx });
    try {
      const prompt =
        `Du bist ein geduldiger Deutschlehrer. Erkläre KURZ auf Persisch (Farsi), warum im folgenden Satz ` +
        `die Präposition(en) "${it.answers.join(' + ')}" richtig ist/sind:\n"${itemFull(it)}"\n` +
        `Nenne: das Verb / die Wendung, die Präposition(en) und den Kasus. Maximal 3 kurze Sätze.`;
      const t = await askChat(prompt);
      setWhy({ busy: false, text: t.trim(), err: '', idx: sess.idx });
    } catch (e) {
      setWhy({ busy: false, text: '', err: aiErr(e), idx: sess.idx });
    }
  };

  const checkOpen = async (): Promise<void> => {
    if (!sess || openBusy) return;
    const cur = sess.items[sess.order[sess.idx]];
    if (!isOpen(cur) || !openText.trim()) return;
    const it = cur;
    setOpenBusy(true);
    try {
      const prompt =
        `Du bist ein geduldiger Deutschlehrer (Niveau ${sess.level}). Der Lerner löst eine Aufgabe vom Arbeitsblatt.\n` +
        `Aufgabe/Anfang: "${it.prompt}"\n` +
        (it.connector ? `Vorgegebener Konnektor: "${it.connector}"\n` : '') +
        `Antwort des Lerners: "${openText.trim()}"\n` +
        (it.connector
          ? `Prüfe Inhalt, Grammatik und die korrekte Verwendung des Konnektors (Wortstellung! Adverb-Konnektoren wie "darum/daher/trotzdem/dennoch": direkt danach das Verb (Position 2); Nebensatz-Konnektoren wie "obwohl/damit": Verb am Ende).\n`
          : `Prüfe, ob die Antwort die Aufgabe (Worterklärung) sinnvoll und grammatikalisch korrekt erfüllt.\n`) +
        `Antworte NUR mit JSON: {"ok": true|false, "feedback": "<2-3 kurze Sätze auf Persisch (Farsi): Fehler + Regel>", "model": "<eine gute Modellantwort auf Deutsch>"}`;
      const t = await askJson(prompt);
      const v = parseVerdict(t);
      if (v) setOpenVerdict({ ok: v.ok, feedback: v.feedback, model: v.model || it.model });
      else setOpenVerdict({ ok: null, feedback: '', model: it.model });
    } catch (e) {
      setOpenVerdict({ ok: null, feedback: aiErr(e), model: it.model });
    }
    setOpenBusy(false);
  };

  const selfCheck = (ok: boolean): void => {
    const cur = sess ? sess.items[sess.order[sess.idx]] : null;
    if (!cur || !isOpen(cur)) return;
    setOpenVerdict((v) => ({
      ok,
      feedback: ok ? 'خودت تأیید کردی — آفرین.' : 'خودت نادرست علامت زدی؛ پاسخ نمونه را خوب ببین.',
      model: (v && v.model) || cur.model,
    }));
  };

  const sendChat = async (itemIdx: number, text: string): Promise<void> => {
    if (!sess || chatBusy) return;
    const q = text.trim();
    if (!q) return;
    const it = sess.items[itemIdx];
    if (!it) return;
    const hist0 = sess.chats[itemIdx] || [];
    setChatBusy(true);
    setChatDraft('');
    setSess({ ...sess, chats: { ...sess.chats, [itemIdx]: [...hist0, { role: 'user', text: q }] } });
    try {
      const ans = await askChat(buildChatPrompt(sess.level, it, q, hist0));
      setSess((prev) => prev
        ? { ...prev, chats: { ...prev.chats, [itemIdx]: [...(prev.chats[itemIdx] || []), { role: 'ai', text: ans.trim() }] } }
        : prev);
    } catch (e) {
      onShowToast?.(aiErr(e), true);
      setSess((prev) => prev
        ? { ...prev, chats: { ...prev.chats, [itemIdx]: (prev.chats[itemIdx] || []).filter((m) => !(m.role === 'user' && m.text === q)) } }
        : prev);
      setChatDraft(q);
    } finally {
      setChatBusy(false);
    }
  };

  const ChatBox = ({ itemIdx }: { itemIdx: number }): React.ReactElement => {
    const msgs = sess?.chats[itemIdx] || [];
    return (
      <div className="rounded-xl border border-[#1f5fbf]/40 bg-blue-50/40 dark:bg-blue-950/20 dark:border-[#7fb0ff]/30 p-2.5 space-y-2" dir="rtl">
        <div className="flex items-center justify-between text-[11px] font-bold text-[#5d6676]">
          <span>💬 گفتگو با معلم دربارهٔ همین مورد</span>
          <button onClick={() => setChatIdx(null)} className="w-6 h-6 rounded bg-white/70 dark:bg-[#141923] flex items-center justify-center">✕</button>
        </div>
        <div ref={chatEndRef} className="max-h-56 overflow-y-auto space-y-2">
          {msgs.length === 0 && <p className="text-[11px] text-[#5d6676]">هر سؤالی دربارهٔ همین مورد داری بپرس — معلم با پاسخ درست و قاعده‌اش جواب می‌دهد.</p>}
          {msgs.map((m, i) => (
            <div
              key={i}
              className={`text-xs leading-6 rounded-lg px-2.5 py-1.5 max-w-[88%] ${m.role === 'user' ? 'bg-[#1f5fbf] text-white ml-auto' : 'bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a]'}`}
              style={{ whiteSpace: 'pre-wrap' }}
            >
              {m.text}
            </div>
          ))}
          {chatBusy && <div className="text-[11px] text-[#5d6676] animate-pulse">هوش مصنوعی دارد می‌نویسد…</div>}
        </div>
        <div className="flex flex-wrap gap-1">
          {QUICK_QS.map((q) => (
            <button
              key={q}
              onClick={() => sendChat(itemIdx, q)}
              disabled={chatBusy}
              className="text-[10px] bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-full px-2 py-0.5 transition disabled:opacity-40"
            >
              {q}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <input
            value={chatDraft}
            onChange={(e) => setChatDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') sendChat(itemIdx, chatDraft); }}
            placeholder="دربارهٔ همین مورد بپرس…"
            className="flex-1 min-w-0 border-2 border-[#1f5fbf]/50 dark:border-[#7fb0ff]/40 rounded-lg px-3 py-2 text-base bg-white dark:bg-[#141923] outline-none"
          />
          <button
            onClick={() => sendChat(itemIdx, chatDraft)}
            disabled={chatBusy || !chatDraft.trim()}
            className="w-10 h-10 rounded-lg bg-[#1f5fbf] text-white flex items-center justify-center flex-shrink-0 disabled:opacity-40"
            aria-label="ارسال"
          >
            ↑
          </button>
        </div>
      </div>
    );
  };

  /* ── پیکربندی + آرشیو ── */
  if (phase === 'config' || !sess) {
    return (
      <div dir="rtl" className="bg-white dark:bg-[#1b2030] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-bold flex items-center gap-2"><span>{info.icon}</span><span>{info.title}</span></h3>
          {onClose && <button onClick={onClose} className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">بازگشت ✕</button>}
        </div>
        <p className="text-sm text-[#5d6676] dark:text-[#a3adbd] leading-7">
          منطق برگهٔ نمونه تحلیل شده و حالا <b>هر بار</b> هوش مصنوعی با همان منطق یک برگهٔ تازه می‌سازد:
          سطح و تعداد مورد را انتخاب کن، «ساخت برگه» را بزن. برگه‌ها با نمره و گفتگوهایشان در آرشیو می‌مانند و دوباره باز می‌شوند.
        </p>
        <ul className="text-xs text-[#5d6676] dark:text-[#a3adbd] leading-6 space-y-1 pr-1">
          {info.logic.map((l, i) => <li key={i}>• {l}</li>)}
        </ul>

        {/* وضعیت هوش مصنوعی — کلید از تنظیمات برنامه */}
        <div className={`rounded-xl border px-3 py-2 text-xs font-bold leading-5 ${
          hasAIKey()
            ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
            : 'border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
        }`}>
          {hasAIKey()
            ? <>🤖 متصل: <b dir="ltr">{aiLabel()}</b> — کلید از «{getAiDebugInfo().source}» خوانده شد.</>
            : <>🔌 هوش مصنوعی در تنظیمات برنامه فعال نشده — بدون کلید نمی‌توان برگهٔ جدید ساخت؛ از صفحهٔ تنظیمات کلید را وارد و <b>ذخیره</b> کن.
                <span className="block text-[10px] font-normal mt-0.5 opacity-80">چک فنی: {getAiDebugInfo().source}</span></>}
        </div>

        {/* سطح */}
        <div>
          <div className="text-xs font-bold text-[#5d6676] mb-1.5">۱. سطح — برگه فقط با واژگان و ساختارهای همین سطح</div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {LVL_ORDER.map((l) => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={`py-2.5 rounded-xl text-xs font-bold border transition ${
                  level === l
                    ? 'bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white border-transparent'
                    : 'bg-slate-50 dark:bg-[#141923] border-[#dde1ea] dark:border-[#333b4a]'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-[#5d6676] mt-2 leading-5">{LVL_INFO[level].label}</p>
        </div>

        {/* تعداد */}
        <div>
          <div className="text-xs font-bold text-[#5d6676] mb-1.5">۲. تعداد موارد برگه</div>
          <div className="flex gap-2 flex-wrap">
            {COUNTS.map((n) => (
              <button
                key={n}
                onClick={() => setCount(n)}
                className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
                  count === n
                    ? 'bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white border-transparent'
                    : 'bg-slate-50 dark:bg-[#141923] border-[#dde1ea] dark:border-[#333b4a]'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* موضوع */}
        <div>
          <div className="text-xs font-bold text-[#5d6676] mb-1.5">۳. موضوع (اختیاری)</div>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="مثلاً: Umwelt, mein Job, Reisen … (خالی = موضوع آزاد)"
            className="w-full border-2 border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-[#141923] outline-none"
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {TOPIC_CHIPS.map((t) => (
              <button
                key={t}
                onClick={() => setTopic(t === topic ? '' : t)}
                dir="ltr"
                className={`text-[11px] rounded-full px-2.5 py-1 border transition ${topic === t
                  ? 'bg-[#1f5fbf] text-white border-transparent'
                  : 'bg-slate-50 dark:bg-[#141923] border-[#dde1ea] dark:border-[#333b4a]'}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => generate()}
          disabled={busy}
          className="w-full bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white py-3 rounded-xl font-bold text-sm shadow-xs active:scale-[.99] transition disabled:opacity-60"
        >
          {busy ? '⏳ هوش مصنوعی دارد برگه را می‌سازد…' : '✨ ساخت برگهٔ جدید با هوش مصنوعی'}
        </button>

        {/* آرشیو برگه‌های این نوع */}
        <div className="rounded-2xl border border-[#dde1ea] dark:border-[#333b4a] p-4 shadow-xs">
          <button onClick={() => setArchOpen((o) => !o)} className="w-full flex items-center justify-between text-sm font-bold">
            <span>🗂 آرشیو برگه‌های ساخته‌شده ({toFa(arch.length)})</span>
            <span className="text-[#5d6676]">{archOpen ? '▲' : '▼'}</span>
          </button>
          {archOpen && (
            <div className="mt-3 space-y-2">
              {arch.length === 0 && <p className="text-xs text-[#5d6676] py-2">هنوز برگه‌ای ساخته نشده است.</p>}
              {arch.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 rounded-xl border border-[#dde1ea] dark:border-[#333b4a] p-2.5">
                  <div className="min-w-0">
                    <div className="text-xs font-bold">
                      سطح {a.level} • {toFa(a.items.length)} مورد{a.topic ? ` • ${a.topic}` : ''}
                      {a.score ? <span className="text-emerald-600"> • نتیجه: {toFa(a.score.ok)}/{toFa(a.score.total)}</span> : ''}
                    </div>
                    <div className="text-[10px] text-[#5d6676] flex flex-wrap gap-1.5 mt-1">
                      <span className="bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-0.5">{faDate(a.ts)}</span>
                      {a.chats && Object.keys(a.chats).length > 0 && (
                        <span className="bg-blue-50 dark:bg-blue-950/40 text-[#1f5fbf] dark:text-[#7fb0ff] rounded px-1.5 py-0.5">💬 {toFa(Object.keys(a.chats).length)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => openArch(a)}
                      className="w-9 h-9 rounded-lg bg-[#1f5fbf] text-white flex items-center justify-center text-sm"
                      title="اجرای دوبارهٔ این برگه"
                      aria-label="اجرای دوبارهٔ این برگه"
                    >
                      ▶
                    </button>
                    <button
                      onClick={() => { const next = loadArch().filter((x) => x.id !== a.id); saveAllArch(next); setArch(next.filter((x) => x.kind === kind)); }}
                      className="w-9 h-9 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 text-red-600 flex items-center justify-center text-sm"
                      title="حذف"
                      aria-label="حذف"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              ))}
              {arch.length > 0 && (
                <button
                  onClick={() => { const next = loadArch().filter((x) => x.kind !== kind); saveAllArch(next); setArch([]); }}
                  className="text-[11px] text-red-500 px-2 py-1"
                >
                  پاک کردن آرشیو این برگه
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── صفحهٔ نتیجه ── */
  if (phase === 'done') {
    const total = sess.order.length;
    const good = sess.ok === total;
    return (
      <div dir="rtl" className="bg-white dark:bg-[#1b2030] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-5 space-y-4">
        <div className="text-center space-y-1">
          <div className="text-4xl">{good ? '🏆' : sess.ok >= total * 0.7 ? '👍' : '💪'}</div>
          <div className="text-2xl font-extrabold">{toFa(sess.ok)} / {toFa(total)}</div>
          <div className="text-sm text-[#5d6676] dark:text-[#a3adbd]">
            {good ? 'همه درست! فوق‌العاده بود.' : sess.ok >= total * 0.7 ? 'خیلی خوب بود — چند مورد را دوباره مرور کن.' : 'اشکالی ندارد؛ تمرین یعنی همین — غلط‌ها را تکرار کن.'}
            <span className="block text-xs mt-1">برگه در آرشیو ذخیره شد (سطح {sess.level}{sess.topic ? ` • ${sess.topic}` : ''}).</span>
          </div>
        </div>
        {sess.wrong.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-bold">مورد نادرست ({toFa(sess.wrong.length)}):</div>
            {sess.wrong.map((wi) => {
              const w = sess.items[wi];
              if (isOpen(w)) {
                return (
                  <div key={wi} className="rounded-xl border border-[#dde1ea] dark:border-[#333b4a] p-3 space-y-1">
                    <div className="text-xs text-[#5d6676] dark:text-[#a3adbd]">مورد {toFa(wi + 1)}</div>
                    <div dir="ltr" className="font-sans text-sm leading-7">
                      {w.prompt} {w.connector && <b className="text-[#6b4fd8] dark:text-[#a68bff]">{w.connector}</b>} <span className="text-[#9aa3b2]">______</span>
                    </div>
                    <div dir="ltr" className="text-sm leading-7 text-emerald-700 dark:text-emerald-300">✓ {w.model}</div>
                    <div className="text-xs text-[#5d6676] dark:text-[#a3adbd]">💡 {w.note}</div>
                  </div>
                );
              }
              return (
                <div key={wi} className="rounded-xl border border-[#dde1ea] dark:border-[#333b4a] p-3 space-y-1">
                  <div className="text-xs text-[#5d6676] dark:text-[#a3adbd]">جملهٔ {toFa(wi + 1)}</div>
                  <div dir="ltr" className="font-sans text-sm leading-7">
                    {w.seg.map((s, i) => (
                      <React.Fragment key={i}>
                        <span className="whitespace-pre-wrap">{s}</span>
                        {i < w.answers.length && <b className="text-emerald-600 dark:text-emerald-400 mx-0.5">{w.answers[i]}</b>}
                      </React.Fragment>
                    ))}
                  </div>
                  <div className="text-xs text-[#5d6676] dark:text-[#a3adbd]">💡 {w.note}</div>
                </div>
              );
            })}
            <button onClick={() => { runSheet(sess.items, { id: sess.id, ts: sess.ts, level: sess.level, topic: sess.topic, chats: sess.chats, score: sess.score }); setSess((s) => s ? { ...s, order: sess.wrong } : s); }} className="w-full py-2 rounded-xl bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 text-sm font-bold">
              تکرار همین {toFa(sess.wrong.length)} مورد غلط
            </button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => generate(sess.level, sess.items.length)} disabled={busy} className="flex-1 py-2 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white text-sm font-bold disabled:opacity-60">
            {busy ? '⏳ …' : '✨ برگهٔ جدید (همین تنظیمات)'}
          </button>
          <button onClick={() => { setPhase('config'); setSess(null); }} className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">پیکربندی و آرشیو</button>
        </div>
      </div>
    );
  }

  /* ── اجرای تمرین: یک مورد در هر صفحه ── */
  const it = sess.items[sess.order[sess.idx]];
  const total = sess.order.length;
  const pct = Math.round((sess.idx / total) * 100);
  const last = sess.idx + 1 >= total;
  const curIdx = sess.order[sess.idx];
  return (
    <div dir="rtl" className="bg-white dark:bg-[#1b2030] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-bold text-[#5d6676] dark:text-[#a3adbd] flex items-center gap-1.5 flex-wrap">
          <span>{info.icon} {info.title}</span>
          <span className="bg-blue-50 dark:bg-blue-950/40 text-[#1f5fbf] dark:text-[#7fb0ff] rounded-full px-2 py-0.5 text-[11px] font-bold">سطح {sess.level}</span>
          {sess.topic && <span className="bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 rounded-full px-2 py-0.5 text-[11px] font-bold">{sess.topic}</span>}
        </div>
        <button onClick={() => { setPhase('config'); setChatIdx(null); }} className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold flex-shrink-0">پایان ⏹</button>
      </div>

      <div>
        <div className="flex justify-between text-xs text-[#5d6676] dark:text-[#a3adbd] mb-1">
          <span>{isOpen(it) ? 'مورد' : 'جملهٔ'} {toFa(sess.idx + 1)} از {toFa(total)}</span>
          <span>درست: {toFa(sess.ok)} · نادرست: {toFa(sess.wrong.length)}</span>
        </div>
        <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {isOpen(it) ? (
        <>
          <div dir="ltr" className="text-lg md:text-xl leading-9 font-sans text-slate-800 dark:text-slate-100">
            <span className="whitespace-pre-wrap">{it.prompt} </span>
            {it.connector && <b className="text-[#6b4fd8] dark:text-[#a68bff]">{it.connector}</b>}
            <span className="text-[#9aa3b2]"> ______</span>
          </div>
          <textarea
            dir="ltr"
            rows={3}
            value={openText}
            onChange={(e) => setOpenText(e.target.value)}
            disabled={!!openVerdict && openVerdict.ok !== null}
            spellCheck={false}
            placeholder="پاسخ خود را به آلمانی بنویسید…"
            className="w-full rounded-xl border border-[#dde1ea] dark:border-[#333b4a] bg-[#f6f7fb] dark:bg-[#12151c] p-3 font-sans text-base outline-none focus:border-[#1f5fbf] disabled:opacity-70"
          />
          {openModel && (
            <div className="rounded-xl px-3 py-2 text-sm bg-[#f6f7fb] dark:bg-[#12151c] leading-7">
              پاسخ نمونه: <b dir="ltr">{it.model}</b>
            </div>
          )}
          {openVerdict && openVerdict.ok === true && (
            <div className="rounded-xl px-3 py-2 text-sm space-y-1 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
              <div>✅ {openVerdict.feedback || 'پاسخ قابل قبول بود!'}</div>
              <div dir="ltr" className="leading-7">پاسخ نمونه: <b>{openVerdict.model}</b></div>
            </div>
          )}
          {openVerdict && openVerdict.ok === false && (
            <div className="rounded-xl px-3 py-2 text-sm space-y-1 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200">
              <div>❌ {openVerdict.feedback}</div>
              <div dir="ltr" className="leading-7">پاسخ بهتر: <b>{openVerdict.model}</b></div>
              <div>💡 {it.note}</div>
            </div>
          )}
          {openVerdict && openVerdict.ok === null && (
            <div className="rounded-xl px-3 py-2 text-sm space-y-2 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <div>{openVerdict.feedback || 'بررسی هوش مصنوعی در دسترس نبود.'}</div>
              <div dir="ltr" className="leading-7">پاسخ نمونه: <b>{openVerdict.model}</b></div>
              <div>خودت با پاسخ نمونه مقایسه کن و بگو:</div>
              <div className="flex gap-2">
                <button onClick={() => selfCheck(true)} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold">درست بود ✓</button>
                <button onClick={() => selfCheck(false)} className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-bold">نادرست بود ✗</button>
              </div>
            </div>
          )}
          {chatIdx === curIdx && <ChatBox itemIdx={curIdx} />}
          <div className="flex flex-wrap gap-2">
            {!(openVerdict && openVerdict.ok !== null) ? (
              <>
                <button onClick={checkOpen} disabled={openBusy || !openText.trim()} className="px-4 py-2 rounded-xl bg-[#1f5fbf] text-white text-sm font-bold disabled:opacity-60">
                  {openBusy ? 'در حال بررسی…' : 'بررسی با AI 🤖'}
                </button>
                <button onClick={() => setOpenModel(true)} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">پاسخ نمونه 💡</button>
              </>
            ) : (
              <button onClick={next} className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white text-sm font-bold">
                {last ? 'دیدن نتیجه' : 'مورد بعدی ←'}
              </button>
            )}
            <button
              onClick={() => setChatIdx(chatIdx === curIdx ? null : curIdx)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition ${(sess.chats[curIdx] || []).length || chatIdx === curIdx ? 'bg-[#1f5fbf] text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
            >
              💬 چت با معلم{(sess.chats[curIdx] || []).length ? ` (${toFa((sess.chats[curIdx] || []).length)})` : ''}
            </button>
          </div>
        </>
      ) : (
        <>
          <div dir="ltr" className="text-lg md:text-xl leading-10 font-sans text-slate-800 dark:text-slate-100">
            {it.seg.map((s, i) => (
              <React.Fragment key={i}>
                <span className="whitespace-pre-wrap">{s}</span>
                {i < it.answers.length && (() => {
                  const good = checked ? checked[i] : null;
                  return (
                    <input
                      dir="ltr"
                      value={inputs[i] || ''}
                      onChange={(e) => { const v = e.target.value; setInputs((prev) => prev.map((x, j) => (j === i ? v : x))); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (checked) next(); else check(); } }}
                      disabled={!!checked}
                      spellCheck={false}
                      autoComplete="off"
                      className={`inline-block w-28 mx-1 px-2 py-0.5 rounded-lg border-b-2 text-center font-bold outline-none transition ${
                        good === true ? 'border-emerald-500 text-emerald-600'
                          : good === false ? 'border-red-400 text-red-500'
                            : 'border-[#1f5fbf] bg-[#f6f7fb] dark:bg-[#12151c]'}`}
                    />
                  );
                })()}
              </React.Fragment>
            ))}
          </div>

          {hint && !checked && (
            <div className="rounded-xl px-3 py-2 text-sm bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              راهنما — حرف اول پاسخ‌ها: <b dir="ltr">{it.answers.map((a) => a[0] + '…').join(' + ')}</b>
            </div>
          )}

          {checked && (
            <div className={`rounded-xl px-3 py-2 text-sm space-y-1 ${itemOk ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200' : 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200'}`}>
              <div>{itemOk ? '✅ درست بود!' : <>❌ نادرست — پاسخ درست: <b dir="ltr">{it.answers.join(' + ')}</b></>}</div>
              <div>💡 {it.note}</div>
            </div>
          )}

          {why.err && <div className="rounded-xl px-3 py-2 text-sm bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">{why.err}</div>}
          {why.text && why.idx === sess.idx && (
            <div className="rounded-xl px-3 py-2 text-sm bg-[#f6f7fb] dark:bg-[#12151c] leading-7 whitespace-pre-wrap">{why.text}</div>
          )}

          {chatIdx === curIdx && <ChatBox itemIdx={curIdx} />}
          <div className="flex flex-wrap gap-2">
            {!checked ? (
              <>
                <button onClick={check} className="px-4 py-2 rounded-xl bg-[#1f5fbf] text-white text-sm font-bold">بررسی (Enter)</button>
                <button onClick={() => setHint(true)} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">راهنما</button>
              </>
            ) : (
              <>
                <button onClick={next} className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white text-sm font-bold">
                  {last ? 'دیدن نتیجه' : 'جملهٔ بعدی ←'} (Enter)
                </button>
                <button onClick={() => askWhy(it)} disabled={why.busy} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold disabled:opacity-60">
                  {why.busy ? 'در حال توضیح…' : '🤖 چرا این جواب؟'}
                </button>
              </>
            )}
            <button
              onClick={() => setChatIdx(chatIdx === curIdx ? null : curIdx)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition ${(sess.chats[curIdx] || []).length || chatIdx === curIdx ? 'bg-[#1f5fbf] text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
            >
              💬 چت با معلم{(sess.chats[curIdx] || []).length ? ` (${toFa((sess.chats[curIdx] || []).length)})` : ''}
            </button>
          </div>
        </>
      )}
    </div>
  );
};
