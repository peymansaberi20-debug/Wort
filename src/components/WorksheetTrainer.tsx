/**
 * WorksheetTrainer.tsx — تمرین برگه‌ای با هوش مصنوعی (Arbeitsblatt AI)
 *
 *   kind='prep'   → «جای‌خالی فعل + حرف اضافه (AI)»: جمله با ۱–۲ جای خالی برای حرف اضافهٔ ثابتِ فعل/صفت؛
 *                   پاسخ‌ها را AI همراه برگه می‌سازد → بررسی محلیِ فوری + «چرا این جواب؟» + چت با معلم.
 *                   ترجمهٔ فارسی هر جمله با همان دستور اول ساخته می‌شود ولی تا زمان «بررسی» پنهان می‌ماند.
 *
 *   ⚠️ kind='klasse' («تکمیل جمله») حذف شد — با تمرین «حرف ربط انتخابی» (KonnektorProTrainer، دستهٔ
 *      حروف ربط) ادغام شد و همهٔ امکاناتش به همان منتقل شد: بازخورد کامل (ترجمهٔ جملهٔ کاربر، برداشت
 *      یک آلمانی، باکس سبز نقاط قوت، باکس قرمز ایرادهای آیتم‌به‌آیتم)، پاسخ نمونهٔ قبل از بررسی،
 *      خودارزیابی هنگام قطع معلم و تمرکز جایگاه فعل در تولید جمله (درخواست کاربر: حذف تکراری).
 *
 * پوستهٔ یکدست (trainerUI): پیکربندی سطح/تعداد/موضوع → دکمهٔ «ساخت تمرین»؛ آرشیو یکدست؛
 * هر حذفی با تأییدیه؛ دکمهٔ 🖨 چاپِ کل برگه در یک صفحه (سازگار با Safari و webapp).
 */

import React, { useState, useEffect, useRef } from 'react';
import { describeAiError, generateText, hasApiKey } from '../utils/aiProvider';
import { Lvl, LVL_ORDER } from '../data/konnektorenData';
import { ArchivePanel, ArchiveRow, CountChips, LevelChips, MiniChip, PrimaryBtn, PrintPreview, Section, SqBtn, TopicInput, faDate, prFa, prG, toFa, useConfirm } from './trainerUI';
import { ClickableWords, WordLookupModal } from './WordLookup';
import { useVocabGate } from './VocabDecisionDialog';
import { pushAiBank, fetchAiBank, aiBankMarkSeen, aiBankSeenIds, mergeAiBank, omitTop } from '../utils/aiBank';
import { Printer } from 'lucide-react';
import type { Word } from '../types';

/* ───────────── مدل برگه ───────────── */

export interface WshItem {
  kind?: 'gap';
  /** قطعه‌های جمله؛ اندیس‌های فرد جای خالی هستند */
  seg: string[];
  /** پاسخ درست هر جای خالی (به ترتیب) */
  answers: string[];
  /** توضیح کوتاه فارسی: فعل/ساختار + حرف اضافه + حالت */
  note: string;
  /** پاسخ‌های جایگزین پذیرفته برای هر جای خالی */
  alt?: string[][];
  /** ترجمهٔ فارسی کامل جمله — با همان دستور اول AI گرفته می‌شود ولی تا «بررسی» پنهان است */
  fa?: string;
}

export type WshEntry = WshItem;

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

type Kind = 'prep';
type Phase = 'config' | 'run' | 'done';

/* ───────────── پل هوش مصنوعی برنامه (کلید از تنظیمات) ───────────── */

const askJson = async (prompt: string): Promise<string> => generateText(prompt, { json: true, timeoutMs: 90000, retries: 1 });
const askChat = async (prompt: string): Promise<string> => generateText(prompt, { timeoutMs: 60000, retries: 1 });
const aiErr = (e: unknown): string => { try { return describeAiError(e); } catch { return 'خطای نامشخص در اتصال به هوش مصنوعی.'; } };
const hasAIKey = (): boolean => { try { return !!hasApiKey(); } catch { return false; } };

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

/* ───────────── پرامپت‌ها ───────────── */

const TOPIC_CHIPS = ['Alltag', 'Reise', 'Arbeit', 'Umwelt', 'Technik', 'Gesundheit', 'Freizeit'];

/* ── استخر ساختارهای فعل/صفت + حرف اضافه به تفکیک سطح ──
   برنامه خودش تصادفی از این استخر انتخاب می‌کند (ساختارهای برگه‌های اخیر کنار گذاشته
   می‌شوند) و مدل فقط برای همین ساختارها جمله می‌سازد — تنوع تضمینی است. */
const PREP_POOL: Record<string, string[]> = {
  A1: [
    'denken an + Akk', 'fragen nach + Dat', 'warten auf + Akk', 'sprechen mit + Dat', 'sprechen über + Akk',
    'kommen aus + Dat', 'wohnen bei + Dat', 'fahren mit + Dat (Bus, Zug …)', 'Angst haben vor + Dat',
    'einladen zu + Dat', 'gehen zu + Dat (Arzt, Schule …)', 'spielen mit + Dat', 'kaufen für + Akk',
    'sein für/gegen + Akk (Meinung)', 'helfen bei + Dat', 'anfangen mit + Dat', 'telefonieren mit + Dat',
    'sich freuen über + Akk', 'Lust haben auf + Akk', 'Hunger haben auf + Akk', 'Interesse haben an + Dat',
    'bestellen für + Akk'
  ],
  A2: [
    'sich freuen auf + Akk', 'sich freuen über + Akk', 'sich erinnern an + Akk', 'glauben an + Akk',
    'sich gewöhnen an + Akk', 'sich ärgern über + Akk', 'nachdenken über + Akk', 'sich interessieren für + Akk',
    'sich bewerben um + Akk', 'bitten um + Akk', 'danken für + Akk', 'sich entschuldigen bei + Dat',
    'teilnehmen an + Dat', 'aufhören mit + Dat', 'Zeit haben für + Akk', 'Probleme haben mit + Dat',
    'sich verabreden mit + Dat', 'arbeiten bei + Dat (Firma)', 'stammen aus + Dat (Stadt/Land)',
    'übersetzen aus + Dat (Sprache)', 'sich verlieben in + Akk', 'sich kümmern um + Akk',
    'einverstanden sein mit + Dat', 'sich treffen mit + Dat', 'lachen über + Akk', 'träumen von + Dat',
    'erzählen von + Dat', 'aufpassen auf + Akk', 'suchen nach + Dat', 'riechen nach + Dat',
    'schmecken nach + Dat', 'Glück haben mit + Dat', 'Pech haben mit + Dat', 'schreiben an + Akk'
  ],
  B1: [
    'sich verlassen auf + Akk', 'sich konzentrieren auf + Akk', 'sich beziehen auf + Akk',
    'Rücksicht nehmen auf + Akk', 'sich aufregen über + Akk', 'sich informieren über + Akk',
    'diskutieren über + Akk', 'sich beschweren über + Akk', 'sich beschweren bei + Dat',
    'sich unterhalten mit + Dat', 'sich streiten mit + Dat', 'sich verständigen mit + Dat',
    'zusammenhängen mit + Dat', 'sich befassen mit + Dat', 'rechnen mit + Dat', 'sich anmelden zu + Dat',
    'einladen zu + Dat', 'beitragen zu + Dat', 'gehören zu + Dat', 'abhängen von + Dat',
    'halten von + Dat (Meinung)', 'wissen von + Dat', 'profitieren von + Dat', 'sich unterscheiden von + Dat',
    'sich richten nach + Dat', 'bestehen aus + Dat', 'bestehen auf + Dat (auf etwas bestehen)',
    'schützen vor + Dat', 'warnen vor + Dat', 'sich fürchten vor + Dat', 'sich einsetzen für + Akk',
    'Verantwortung tragen für + Akk', 'sich eignen für + Akk', 'halten für + Akk (für … halten)',
    'tauschen gegen + Akk', 'kämpfen gegen + Akk', 'sich wehren gegen + Akk',
    'ankommen auf + Akk (es kommt darauf an)', 'zweifeln an + Dat', 'leiden an + Dat (Krankheit)',
    'sich beteiligen an + Dat', 'sich erinnern an + Akk', 'sich gewöhnen an + Akk', 'träumen von + Dat',
    'sich kümmern um + Akk', 'sich sorgen um + Akk', 'sorgen für + Akk', 'berichten über + Akk'
  ],
  B2: [
    'sich auseinandersetzen mit + Dat', 'in Verbindung stehen mit + Dat', 'in Zusammenhang bringen mit + Dat',
    'sich identifizieren mit + Dat', 'sich abfinden mit + Dat', 'Stellung nehmen zu + Dat',
    'sich äußern zu + Dat', 'sich bekennen zu + Dat', 'neigen zu + Dat', 'verhelfen zu + Dat',
    'zwingen zu + Dat', 'ermutigen zu + Dat', 'berechtigen zu + Dat', 'sich entscheiden für + Akk',
    'sich rechtfertigen vor + Dat', 'sich hüten vor + Dat', 'fliehen vor + Dat', 'zurückweichen vor + Dat',
    'überzeugen von + Dat', 'sich überzeugen von + Dat', 'abhalten von + Dat', 'ablenken von + Dat',
    'entbinden von + Dat (von einer Pflicht)', 'sich trennen von + Dat', 'sich verabschieden von + Dat',
    'zeugen von + Dat', 'berichten von + Dat', 'hinweisen auf + Akk', 'verweisen auf + Akk',
    'sich auswirken auf + Akk', 'Einfluss haben auf + Akk', 'Einfluss ausüben auf + Akk',
    'verzichten auf + Akk', 'eingehen auf + Akk (auf ein Thema eingehen)', 'sich vorbereiten auf + Akk',
    'Kritik üben an + Dat', 'mitwirken an + Dat', 'hindern an + Dat', 'verzweifeln an + Dat',
    'sich erfreuen + Gen (gehoben)', 'sich bedienen + Gen (gehoben)', 'unterscheiden zwischen + Dat',
    'vermitteln zwischen + Dat', 'resultieren aus + Dat', 'hervorgehen aus + Dat',
    'sich zusammensetzen aus + Dat', 'in Kauf nehmen (Akk)', 'anpassen an + Akk (sich anpassen an)'
  ]
};
const C1_COMBOS: string[] = [
  'absehen von + Dat (auf etwas verzichten)', 'abweichen von + Dat', 'abraten von + Dat',
  'abrücken von + Dat', 'abstammen von + Dat', 'abhängig sein von + Dat', 'unterscheiden zwischen + Dat',
  'schwanken zwischen + Dat', 'eingreifen in + Akk', 'einwilligen in + Akk', 'sich einfühlen in + Akk',
  'verwickeln in + Akk', 'einmünden in + Akk', 'sich ergeben aus + Dat', 'folgern aus + Dat',
  'schließen auf + Akk (folgern)', 'schließen aus + Dat (Grundlage)', 'Rückschlüsse ziehen aus + Dat',
  'zuführen zu + Dat', 'beitragen zu + Dat', 'anpassen an + Akk (sich anpassen an)',
  'sich halten an + Akk (eine Regel)', 'sich klammern an + Akk', 'appellieren an + Akk',
  'partizipieren an + Dat', 'sich dessen bewusst sein (Gen)', 'bezichtigen + Gen (Vorwurf)',
  'gedenken + Gen (gehoben)', 'sich erfreuen + Gen (gehoben)', 'sich bedienen + Gen (gehoben)',
  'angesichts + Gen (vor dem Hintergrund)', 'aufgrund + Gen (wegen)', 'infolge + Gen (als Folge von)',
  'anlässlich + Gen (aus Anlass von)', 'im Zuge + Gen (im Rahmen von)', 'hinsichtlich + Gen (bezüglich)'
];
PREP_POOL['C1'] = C1_COMBOS;
PREP_POOL['C2'] = [
  ...C1_COMBOS,
  'sich enthalten + Gen (gehoben)', 'verdächtigen + Gen', 'zeihen + Gen (gehoben)',
  'sich schämen + Gen (gehoben)', 'harren + Gen (gehoben)', 'berauben + Gen (um etwas bringen)'
];

const WSH_PREP_RECENT_KEY = 'wb_wsh_prep_recent_v1';

const loadPrepRecent = (lvl: string): string[] => {
  try {
    const o = JSON.parse(localStorage.getItem(WSH_PREP_RECENT_KEY) || '{}') as Record<string, unknown>;
    return Array.isArray(o[lvl]) ? (o[lvl] as string[]) : [];
  } catch { return []; }
};

const savePrepRecent = (lvl: string, used: string[]): void => {
  try {
    const o = JSON.parse(localStorage.getItem(WSH_PREP_RECENT_KEY) || '{}') as Record<string, unknown>;
    const prev = Array.isArray(o[lvl]) ? (o[lvl] as string[]) : [];
    o[lvl] = Array.from(new Set([...used, ...prev])).slice(0, 30);
    localStorage.setItem(WSH_PREP_RECENT_KEY, JSON.stringify(o));
  } catch { /* ignore */ }
};

/** انتخاب n ساختار از استخر سطح — ساختارهای برگه‌های اخیر حذف و در صورت نیاز بازیافت می‌شوند */
const pickPrepCombos = (lvl: string, n: number): string[] => {
  const src = PREP_POOL[lvl] || PREP_POOL['B1'];
  const recent = new Set(loadPrepRecent(lvl).map(c => c.toLowerCase()));
  const fresh = src.filter(c => !recent.has(c.toLowerCase()));
  const rest = src.filter(c => recent.has(c.toLowerCase()));
  return [...fresh.sort(() => Math.random() - 0.5), ...rest.sort(() => Math.random() - 0.5)]
    .slice(0, Math.max(1, n));
};

const SAMPLE_PREP = '{"seg":["Erika freut sich schon "," ihren Geburtstag."],"answers":["auf"],"note":"sich freuen auf + Akk — شادی برای رویداد آینده","fa":"اریکا برای تولدش حسابی لحظه‌شماری می‌کند."}';

const buildPrepPrompt = (level: string, count: number, topic: string, combos: string[]): string =>
  `Du bist ein erfahrener Deutschlehrer und erstellst ein Arbeitsblatt «Verben mit Präpositionen».
Niveau: ${level}. Thema: ${topic.trim() || 'Alltag und Studium'}.
Erstelle GENAU ${count} Lückensätze nach genau diesem Muster:
  ${SAMPLE_PREP}
Nutze GENAU die folgenden Wendungen — jede genau einmal, in dieser Reihenfolge. Erfinde keine anderen Verben oder Wendungen:
${combos.map((c, i) => `${i + 1}. ${c}`).join('\n')}
Regeln:
- Jede Wendung oben kommt in genau einem Satz vor. Der Kasus in Klammern hilft dir bei der richtigen Präposition/Kasus-Kombination.
- 1 oder 2 Lücken pro Satz. "seg" ist ein Array mit 2 (bei einer Lücke) oder 3 (bei zwei Lücken) Textteilen; die Lücken stehen genau zwischen den Teilen.
- Steht die Lücke am Satzanfang, großgeschrieben (z. B. "Mit wem hast du dich unterhalten?").
- DAS VERB der Wendung MUSS konjugiert und sichtbar im Satztext stehen — niemals in der Lücke und niemals weggelassen. Die Lücke enthält NUR die Präposition. Beispiel für "gehören zu + Dat": "Dieses Buch gehört ___ unserer Pflichtlektüre im Seminar."
- FALSCH wäre z. B.: "Viele Studierende ___ ihre finanzielle Zukunft." — hier fehlt das Verb "sorgen sich" im Satztext! Ein Satz ohne sichtbares konjugiertes Verb ist UNGÜLTIG.
- Bei reflexiven Wendungen (sich …) MUSS das passende Reflexivpronomen (mich/dir/sich/uns/euch …) mit dem konjugierten Verb im Satztext stehen.
- "answers": NUR die Präposition(en) in der Reihenfolge der Lücken (z. B. "auf" — ohne Kasus-Angabe).
- "note": ۱–۲ جملهٔ فارسی — فعل/ساختار + حرف اضافه + حالت (+ معنی فعل در صورت لزوم)، مثل نمونه.
- "fa": ترجمهٔ فارسی روانِ جملهٔ کامل (با پاسخ‌های درست). این ترجمه تا زمان بررسیِ پاسخ دانش‌آموز پنهان می‌ماند.
- "alt" (اختیاری): پاسخ‌های جایگزینِ درستِ هر Lücke.
Gib NUR ein JSON-Array zurück.`;

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
      return { seg, answers, alt, note: String(o.note ?? '').trim(), fa: String(o.fa ?? '').trim() };
    })
    .filter((it) => it.seg.length >= 2 && it.answers.length === it.seg.length - 1
      && it.answers.every((a) => a.length > 0 && a.length < 30) && it.note.length > 0)
    .map((it) => ({ seg: it.seg, answers: it.answers, note: it.note, alt: it.alt, fa: it.fa || undefined }))
    .filter((it) => itemFull(it).length >= 15)
    .slice(0, 20);
};

/* ── اعتبارسنجی ضدباگ «جملهٔ بی‌فعل» (تصویر ۸): باگ گزارش‌شده — AI فعل را حذف کرده بود
   («Viele Studierende ___ ihre finanzielle Zukunft.») و کاربر فقط حرف اضافهٔ «um» را
   می‌نوشت ولی پاسخِ نمایش‌داده‌شده «فعل + حرف اضافه» بود. این بررسی باید همیشه اجرا شود
   (قبلاً فقط وقتی تعداد جمله‌ها = تعداد ساختارها بود اجرا می‌شد و با هر اختلاف تعداد
   کلاً رد می‌شد) و فعل باید در متنِ دیده‌شدهٔ جمله باشد، نه داخل پاسخ‌های جای خالی. ── */

/** استخراج واژه‌های آلمانی یک تکه متن — بدون sich و پرانتزها، فقط ساقه‌های با معنا (≥۴ حرف) */
const germanHeads = (chunk: string): string[] =>
  chunk.toLowerCase().replace(/\([^)]*\)/g, ' ')
    .split(/[\s+/\\]+/)
    .map(w => w.replace(/[^a-zäöüß]/g, ''))
    .filter(w => w && w !== 'sich' && w.length >= 4);

const comboHeads = (combo: string): string[] => [
  ...germanHeads(combo.split('+')[0] || ''),
  ...germanHeads((combo.match(/\(([^)]*)\)/g) || []).join(' ').replace(/[()]/g, ' '))   // مثلاً «(es kommt darauf an)»
];

/** ساختار آلمانی اول نوت فارسی: «sich sorgen um + Akk — نگران … بودن» → sich sorgen um */
const noteHeads = (note: string): string[] => germanHeads(note.split(/[+—–]/)[0] || '');

/** متن دیده‌شدهٔ جمله — بدون پاسخ‌های جای خالی؛ فعل باید همین‌جا دیده شود */
const visibleText = (it: WshItem): string => it.seg.join(' ').toLowerCase();

const itemHasVerb = (it: WshItem, combo?: string): boolean => {
  const vis = visibleText(it);
  const heads = [...(combo ? comboHeads(combo) : []), ...noteHeads(it.note)];
  if (!heads.length) return true;   // سراغانه‌ای نداریم — پاس را بده (پرامت خودش قید کرده)
  // پسوند ۳حرفی هم چک می‌شود تا فعل‌های مرتبِ تغییرواژلی (bewerben → bewirbt، befehlen → befiehlt) حذف نشوند
  return heads.some(w => vis.includes(w.slice(0, 4)) || vis.includes(w.slice(0, 3)));
};

/* ───────────── منطق مشترک ───────────── */

const norm = (s: string): string => s.toLowerCase().trim().replace(/\s+/g, ' ');

/** جملهٔ کامل با پاسخ‌های درست (برای AI و توضیح) */
const itemFull = (it: WshItem): string => {
  let s = it.seg[0] || '';
  for (let g = 0; g < it.answers.length; g++) s += it.answers[g] + (it.seg[g + 1] || '');
  return s;
};

const gapGood = (it: WshItem, g: number, v: string): boolean => {
  const got = norm(v || '');
  if (!got) return false;
  if (got === norm(it.answers[g])) return true;
  return (it.alt?.[g] || []).some((a) => norm(a) === got);
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

/* ───────────── بانک مشترک ابری (درخواست: تمرین‌های AI همه‌جا در دسترس باشند) ─────────────
 * برگه‌های ساخته‌شدهٔ AI به کالکشن عمومی Firestore («بانک مشترک») فرستاده می‌شوند و هنگام
 * باز شدن تمرین، برگه‌های موجود در بانک که روی این دستگاه نیستند به آرشیو محلی افزوده
 * می‌شوند — با همان ایمیل از دستگاه دیگر، با هر ایمیل دیگری یا حتی بدون ورود.
 * داده‌های پیشرفت (نمره/گفتگوها) فقط محلی می‌مانند و به بانک فرستاده نمی‌شوند. */
const BANK_SKILL = 'wsh';
/** نسخهٔ تمیزِ برگه برای بانک مشترک — بدون نمره و گفتگوها (محتوای تمرین کامل می‌ماند) */
const toBank = (a: WshArch): WshArch => ({ ...omitTop(a as any, ['score', 'chats']), items: a.items || [] } as WshArch);

/* ───────────── چت معلم ───────────── */

const buildChatPrompt = (level: string, it: WshEntry, q: string, convo: ChatMsg[]): string => {
  const ctx = `Lückensatz: "${itemFull(it)}" (Lösung: ${it.answers.join(' + ')})`;
  return `Du bist ein geduldiger Deutschlehrer. Niveau: ${level}. Kontext vom Arbeitsblatt: ${ctx}
${convo.length ? 'Bisheriges Gespräch:\n' + convo.map((m) => (m.role === 'user' ? 'Lerner: ' : 'Lehrer: ') + m.text).join('\n') + '\n' : ''}Frage des Lerners: ${q}
Antworte kurz und klar auf Persisch (Farsi); Fachbegriffe und Beispiele auf Deutsch.`;
};

const QUICK_QS = ['چرا این‌طور درست است؟', 'یک مثال مشابه بده', 'ساده‌تر چطور بگویم؟', 'قاعدهٔ جایگاه فعل را بگو'];

const KIND_INFO: Record<Kind, { title: string; icon: string }> = {
  prep: { title: 'جای‌خالی فعل + حرف اضافه (AI)', icon: '📄' },
};

/* ───────────── چاپ — از PrintPreview مشترک trainerUI استفاده می‌شود ───────────── */

/* ───────────── کامپوننت ───────────── */

export const WorksheetTrainer: React.FC<{
  kind: Kind;
  onShowToast?: (m: string, e?: boolean) => void;
  onClose?: () => void;
  /** کل کتابخانه — گیتِ تکراری/Partizip II/مترادف */
  words?: Word[];
  onQuickAddWord?: (w: Partial<Word>) => boolean;
  onViewWord?: (w: Word) => void;
}> = ({ kind, onShowToast, words, onQuickAddWord, onViewWord }) => {
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
  const [chatIdx, setChatIdx] = useState<number | null>(null);
  const [chatDraft, setChatDraft] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [lookup, setLookup] = useState<string | null>(null);
  const [arch, setArch] = useState<WshArch[]>(() => loadArch().filter((a) => a.kind === kind));
  const { ask, dialog } = useConfirm();
  // گیت مرکزی افزودن به واژگان: تکراری / Partizip II فعل موجود / مترادف → دیالوگ تصمیم
  const gate = useVocabGate({
    words: words || [],
    onAdd: data => (onQuickAddWord ? onQuickAddWord(data) : false),
    onView: onViewWord
  });
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (chatIdx !== null) setTimeout(() => chatEndRef.current?.scrollIntoView({ block: 'end' }), 120); }, [chatIdx, sess?.chats]);

  // همگام‌سازی با بانک مشترک ابری — فقط یک‌بار هنگام باز شدن تمرین؛ خطا بی‌صدا نادیده
  // گرفته می‌شود (بدون اینترنت/بدون قوانین → همان رفتار محلی قبلی)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const seen = aiBankSeenIds(BANK_SKILL);
        const cloud = await fetchAiBank<WshArch>(BANK_SKILL);
        if (!alive) return;
        aiBankMarkSeen(BANK_SKILL, cloud.map((c) => c.id));
        const local = loadArch();
        const merged = mergeAiBank(local, cloud, seen);
        if (merged !== local && merged.length > local.length) {
          saveAllArch(merged);
          setArch(merged.filter((x) => x.kind === kind));
        }
        // برگه‌های محلیِ که هنوز در بانک نیستند (از قبلِ این قابلیت) — یک‌بار برای همه ارسال می‌شود
        const have = new Set(cloud.map((c) => c.id));
        local.filter((x) => x.id && !have.has(x.id)).slice(0, 25)
          .forEach((x) => pushAiBank(BANK_SKILL, x.id, toBank(x), { kind: x.kind, level: x.level, topic: x.topic, count: x.items?.length }));
      } catch { /* بی‌صدا — رفتار محلی حفظ می‌شود */ }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setWhy({ busy: false, text: '', err: '', idx: -1 });
  };

  const runSheet = (items: WshEntry[], meta: { id: string; ts: number; level: string; topic: string; chats?: Record<number, ChatMsg[]>; score?: { ok: number; total: number } }): void => {
    setSess({
      id: meta.id, ts: meta.ts, level: meta.level, topic: meta.topic, items,
      order: items.map((_, i) => i), idx: 0, ok: 0, wrong: [],
      chats: meta.chats || {}, score: meta.score,
    });
    setInputs(new Array(items[0]?.answers.length || 0).fill(''));
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
      // انتخاب ساختارها از استخر سطح (با حافظهٔ برگه‌های اخیر) → تنوع تضمینی
      const combos = pickPrepCombos(theLvl, theCnt);
      const prompt = buildPrepPrompt(theLvl, theCnt, topic, combos);
      const raw = await askJson(prompt);
      let items: WshEntry[] = cleanPrep(raw);
      // ضدباگ «جملهٔ بی‌فعل»: همیشه اجرا می‌شود (قبلاً فقط وقتی تعداد جمله‌ها = ساختارها بود
      // اجرا می‌شد و با هر اختلاف تعداد کلاً رد می‌شد). اگر تعداد ۱:۱ آمد، هر جمله با
      // ساختار خودش سنجیده می‌شود؛ وگرنه با ساختارِ داخل نوتِ همان جمله.
      if (items.length) {
        const before = items.length;
        const oneToOne = items.length === combos.length;
        items = items.filter((entry, i) => itemHasVerb(entry, oneToOne ? combos[i] : undefined));
        if (items.length < before) onShowToast?.(`${toFa(before - items.length)} جملهٔ نامعتبر (بدون فعل) حذف شد.`);
      }
      if (!items.length) throw new Error('پاسخ هوش مصنوعی ساختار معتبر نداشت — دوباره تلاش کن.');
      if (combos.length) savePrepRecent(theLvl, combos);
      const meta = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ts: Date.now(), level: theLvl, topic: topic.trim() };
      runSheet(items, meta);
      // ☁️ ذخیرهٔ برگهٔ تازه در بانک مشترک — با هر دستگاه/ایمیل/بدون ورود در دسترس همه
      pushAiBank(BANK_SKILL, meta.id, toBank({ id: meta.id, ts: meta.ts, kind, level: meta.level, topic: meta.topic, items, chats: {} }),
        { kind, level: theLvl, topic: meta.topic, count: items.length });
      onShowToast?.(`برگهٔ جدید با ${items.length} مورد ساخته شد ✓ ☁️`);
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
    const res = cur.answers.map((_, g) => gapGood(cur, g, inputs[g] || ''));
    setChecked(res);
    setItemOk(res.every(Boolean));
  };

  const next = (): void => {
    if (!sess) return;
    if (!checked) return;
    const good = itemOk === true;
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
    setInputs(new Array(nItem.answers.length).fill(''));
    resetItem();
  };

  /** رد کردن بدون پاسخ — مورد نادرست حساب می‌شود و جلو می‌رویم (درخواست کاربر، تصویر ۲) */
  const skipItem = (): void => {
    if (!sess) return;
    if (checked) return;
    const itemIdx = sess.order[sess.idx];
    const ok = sess.ok;
    const wrong = [...sess.wrong, itemIdx];
    if (sess.idx + 1 >= sess.order.length) {
      setSess({ ...sess, idx: sess.idx + 1, ok, wrong, score: { ok, total: sess.order.length } });
      setPhase('done');
      onShowToast?.('این مورد بدون پاسخ رد شد و نادرست حساب شد.');
      return;
    }
    const nItem = sess.items[sess.order[sess.idx + 1]];
    setSess({ ...sess, idx: sess.idx + 1, ok, wrong });
    setInputs(new Array(nItem.answers.length).fill(''));
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

  /* ⚠️ رندر مستقیم (نه به شکل کامپوننت داخل رندر) — وگرنه با هر حرف تایپی کل چت
     دوباره mount می‌شود و کیبورد موبایل بسته می‌شود (باگ شناخته‌شدهٔ درخواست کاربر). */
  const renderChatBox = (itemIdx: number): React.ReactElement => {
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
              <ClickableWords text={m.text} onWord={setLookup} />
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

  /* ── برگهٔ چاپ مشترک: صفحهٔ ۱ سؤال‌ها با جای نوشتن، صفحهٔ ۲ پاسخنامهٔ مستقل ──
     printArch: برگهٔ هدف چاپ — از آرشیو یا null (= برگهٔ جاری) */
  const [printArch, setPrintArch] = useState<WshArch | null>(null);
  const pSess = printArch
    ? { level: printArch.level, topic: printArch.topic, items: printArch.items, ts: printArch.ts }
    : sess;
  const printTitle = 'Verben mit Präpositionen — جای‌خالی فعل + حرف اضافه';
  const printMeta = pSess
    ? `Niveau ${pSess.level}${pSess.topic ? ` • ${pSess.topic}` : ''} • ${toFa(pSess.items.length)} مورد • ${faDate(pSess.ts)} • نام و تاریخ: ...........................`
    : '';

  const printQuestions = pSess ? (
    <ol dir="ltr" style={{ margin: 0, paddingInlineStart: 20, listStyle: 'decimal', textAlign: 'left' }}>
      {pSess.items.map((entry, i) => (
        <li key={i} style={{ fontSize: 12, marginBottom: 16, lineHeight: 1.9, breakInside: 'avoid' }}>
          <span style={prG({ fontSize: 12.5 })}>
            {entry.seg.map((s, j) => (
              <React.Fragment key={j}>
                <span>{s}</span>
                {j < entry.answers.length && (
                  <span style={{ display: 'inline-block', minWidth: 88, borderBottom: '1.2px solid #000', margin: '0 4px' }}>&nbsp;</span>
                )}
              </React.Fragment>
            ))}
          </span>
        </li>
      ))}
    </ol>
  ) : null;

  const printSolutions = pSess ? (
    <ol dir="ltr" style={{ margin: 0, paddingInlineStart: 20, listStyle: 'decimal', textAlign: 'left' }}>
      {pSess.items.map((entry, i) => (
        <li key={i} style={{ fontSize: 11.5, marginBottom: 11, lineHeight: 1.8, breakInside: 'avoid' }}>
          <div style={prG({ fontSize: 12 })}>
            {entry.seg.map((s, j) => (
              <React.Fragment key={j}>
                <span>{s}</span>
                {j < entry.answers.length && <b style={{ margin: '0 2px' }}>{entry.answers[j]}</b>}
              </React.Fragment>
            ))}
          </div>
          <div style={prFa({ fontSize: 9.5, color: '#555', marginTop: 2 })}>💡 {entry.note}{entry.fa ? ` — ${entry.fa}` : ''}</div>
        </li>
      ))}
    </ol>
  ) : null;

  const printPreview = pSess ? (
    <PrintPreview
      open={printOpen}
      onClose={() => { setPrintOpen(false); setPrintArch(null); }}
      title={printTitle}
      docTitle={`Verben mit Präpositionen — ${pSess.level}`}
      meta={printMeta}
      questions={printQuestions}
      solutions={printSolutions}
    />
  ) : null;

  /* ── پیکربندی + آرشیو (پوستهٔ یکدست) ── */
  if (phase === 'config' || !sess) {
    return (
      <div dir="rtl" className="space-y-3">
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 space-y-4 shadow-xs">
          <Section n="۱" label="سطح">
            <LevelChips value={level} onChange={l => setLevel(l as Lvl)} levels={LVL_ORDER as unknown as string[]} />
          </Section>

          <Section n="۲" label="تعداد جمله‌های برگه">
            <CountChips value={count} onChange={setCount} counts={[5, 8, 10, 12]} />
          </Section>

          <Section n="۳" label="موضوع (اختیاری)">
            <TopicInput value={topic} onChange={setTopic} chips={TOPIC_CHIPS} />
          </Section>

          <PrimaryBtn onClick={() => generate()} busy={busy} label="🚀 ساخت تمرین" />
        </div>

        {/* آرشیو یکدست */}
        <ArchivePanel
          title="آرشیو برگه‌های ساخته‌شده"
          count={arch.length}
          emptyText="هنوز برگه‌ای ساخته نشده است."
          footer={arch.length > 0 ? (
            <button
              onClick={async () => {
                if (await ask('پاک کردن کل آرشیو', `همهٔ ${arch.length} برگهٔ ذخیره‌شدهٔ این تمرین برای همیشه حذف می‌شوند. مطمئن هستی؟`)) {
                  const next = loadArch().filter((x) => x.kind !== kind);
                  saveAllArch(next);
                  setArch([]);
                }
              }}
              className="text-[11px] text-red-500 px-2 py-1"
            >
              پاک کردن کل آرشیو این تمرین
            </button>
          ) : undefined}
        >
          {arch.map((a) => (
            <ArchiveRow
              key={a.id}
              title={<>سطح {a.level} • {toFa(a.items.length)} مورد{a.topic ? ` • ${a.topic}` : ''}{a.score ? <span className="text-emerald-600"> • نتیجه: {toFa(a.score.ok)}/{toFa(a.score.total)}</span> : ''}</>}
              chips={<>
                <MiniChip>{faDate(a.ts)}</MiniChip>
                {a.chats && Object.keys(a.chats).length > 0 && <MiniChip tone="blue">💬 {toFa(Object.keys(a.chats).length)}</MiniChip>}
              </>}
            >
              <SqBtn onClick={() => openArch(a)} title="اجرای دوبارهٔ این برگه">▶</SqBtn>
              <SqBtn onClick={() => { setPrintArch(a); setPrintOpen(true); }} title="برگهٔ A4 این برگهٔ ذخیره‌شده — سؤال‌ها و پاسخنامه">
                <Printer size={15} />
              </SqBtn>
              <SqBtn
                tone="red"
                onClick={async () => {
                  if (await ask('حذف برگه', 'این برگه از آرشیو برای همیشه حذف می‌شود. مطمئن هستی؟')) {
                    const next = loadArch().filter((x) => x.id !== a.id);
                    saveAllArch(next);
                    setArch(next.filter((x) => x.kind === kind));
                  }
                }}
                title="حذف"
              >🗑</SqBtn>
            </ArchiveRow>
          ))}
        </ArchivePanel>

        {dialog}
        {/* پیش‌نمایش چاپ باید در همهٔ فازها در دسترس باشد — چاپ برگهٔ ذخیره‌شده از همین صفحهٔ پیکربندی هم کار می‌کند */}
        {printPreview}
      </div>
    );
  }

  /* ── صفحهٔ نتیجه ── */
  if (phase === 'done') {
    const total = sess.order.length;
    const good = sess.ok === total;
    return (
      <div dir="rtl" className="space-y-3">
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-5 space-y-4 text-center">
          <div>
            <div className="text-4xl">{good ? '🏆' : sess.ok >= total * 0.7 ? '👍' : '💪'}</div>
            <div className="text-2xl font-extrabold">{toFa(sess.ok)} / {toFa(total)}</div>
            <div className="text-sm text-[#5d6676] dark:text-[#a3adbd]">
              {good ? 'همه درست! فوق‌العاده بود.' : sess.ok >= total * 0.7 ? 'خیلی خوب بود — چند مورد را دوباره مرور کن.' : 'اشکالی ندارد؛ تمرین یعنی همین — غلط‌ها را تکرار کن.'}
              <span className="block text-xs mt-1">برگه در آرشیو ذخیره شد (سطح {sess.level}{sess.topic ? ` • ${sess.topic}` : ''}).</span>
            </div>
          </div>
          {sess.wrong.length > 0 && (
            <div className="space-y-2 text-right">
              <div className="text-sm font-bold">مورد نادرست ({toFa(sess.wrong.length)}):</div>
              {sess.wrong.map((wi) => {
                const w = sess.items[wi];
                return (
                  <div key={wi} className="rounded-xl border border-[#dde1ea] dark:border-[#333b4a] p-3 space-y-1">
                    <div className="text-xs text-[#5d6676] dark:text-[#a3adbd]">جملهٔ {toFa(wi + 1)}</div>
                    <div dir="ltr" className="font-sans text-sm leading-7">
                      {w.seg.map((s, i) => (
                        <React.Fragment key={i}>
                          <span className="whitespace-pre-wrap"><ClickableWords text={s} onWord={setLookup} /></span>
                          {i < w.answers.length && <b className="text-emerald-600 dark:text-emerald-400 mx-0.5"><ClickableWords text={w.answers[i]} onWord={setLookup} /></b>}
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
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => generate(sess.level, sess.items.length)} disabled={busy} className="py-2.5 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white text-sm font-bold disabled:opacity-60">
            {busy ? '⏳ …' : '✨ برگهٔ جدید (همین تنظیمات)'}
          </button>
          <button onClick={() => { setPrintArch(null); setPrintOpen(true); }} disabled={!sess}
            title="برگهٔ A4 — سؤال‌ها + پاسخنامه" aria-label="برگهٔ A4"
            className="w-11 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold flex items-center justify-center disabled:opacity-40"><Printer size={16} /></button>
        </div>
        <button onClick={() => { setPhase('config'); setSess(null); }} className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">پیکربندی و آرشیو</button>
        {printPreview}

        {/* دیالوگ تصمیم افزودن به واژگان + پاپ‌آپ واژهٔ لمس‌شده */}
        {gate.node}
        {lookup && (
          <WordLookupModal
            word={lookup}
            level={sess.level}
            cat="Präpositionen"
            onQuickAddWord={onQuickAddWord}
            words={words}
            onViewWord={onViewWord}
            onClose={() => setLookup(null)}
          />
        )}
        {dialog}
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
    <div dir="rtl" className="space-y-3">
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-bold text-[#5d6676] dark:text-[#a3adbd] flex items-center gap-1.5 flex-wrap">
            <span>{info.icon} {info.title}</span>
            <span className="bg-blue-50 dark:bg-blue-950/40 text-[#1f5fbf] dark:text-[#7fb0ff] rounded-full px-2 py-0.5 text-[11px] font-bold">سطح {sess.level}</span>
            {sess.topic && <span className="bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 rounded-full px-2 py-0.5 text-[11px] font-bold">{sess.topic}</span>}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button onClick={() => { setPhase('config'); setChatIdx(null); }} className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-base font-bold flex items-center justify-center flex-shrink-0" title="پایان و بازگشت" aria-label="پایان و بازگشت">✕</button>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs text-[#5d6676] dark:text-[#a3adbd] mb-1">
            <span>جملهٔ {toFa(sess.idx + 1)} از {toFa(total)}</span>
            <span>درست: {toFa(sess.ok)} · نادرست: {toFa(sess.wrong.length)}</span>
          </div>
          <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {(
          <>
            <div dir="ltr" className="text-lg md:text-xl leading-10 font-sans text-slate-800 dark:text-slate-100">
              {it.seg.map((s, i) => (
                <React.Fragment key={i}>
                  <span className="whitespace-pre-wrap"><ClickableWords text={s} onWord={setLookup} /></span>
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
                <div>{itemOk ? '✅ درست بود!' : <>❌ نادرست — پاسخ درست: <b dir="ltr"><ClickableWords text={it.answers.join(' + ')} onWord={setLookup} /></b></>}</div>
                <div>💡 {it.note}</div>
              </div>
            )}

            {/* ترجمهٔ فارسی — فقط بعد از بررسی */}
            {checked && it.fa && (
              <div className="rounded-xl px-3 py-2 text-sm bg-sky-50 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200 leading-7">
                🇮🇷 ترجمهٔ فارسی: {it.fa}
              </div>
            )}

            {why.err && <div className="rounded-xl px-3 py-2 text-sm bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">{why.err}</div>}
            {why.text && why.idx === sess.idx && (
              <div className="rounded-xl px-3 py-2 text-sm bg-[#f6f7fb] dark:bg-[#12151c] leading-7 whitespace-pre-wrap">{why.text}</div>
            )}

            {chatIdx === curIdx && renderChatBox(curIdx)}
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
            {/* رد کردن بدون جواب (درخواست کاربر) */}
            {!checked && (
              <button onClick={skipItem} className="w-full py-1.5 rounded-xl text-[11px] font-bold text-[#5d6676] dark:text-[#a3adbd] bg-slate-50 dark:bg-[#141923]">
                بدون جواب، برو جملهٔ بعدی ← (نادرست حساب می‌شود)
              </button>
            )}
          </>
        )}
      </div>

      {/* دیالوگ تصمیم افزودن به واژگان + پاپ‌آپ واژهٔ لمس‌شده */}
      {gate.node}
      {lookup && (
        <WordLookupModal
          word={lookup}
          level={sess.level}
          cat="Präpositionen"
          onQuickAddWord={onQuickAddWord}
          words={words}
          onViewWord={onViewWord}
          onClose={() => setLookup(null)}
        />
      )}
      {dialog}
      {printPreview}
    </div>
  );
};
