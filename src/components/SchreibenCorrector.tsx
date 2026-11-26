/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { ShadowingModal } from './ShadowingModal';
import { ErrorBoundary } from './ErrorBoundary';
import { ImageCropper } from './ImageCropper';
import { Camera, ImagePlus, Trash2 } from 'lucide-react';
import { generateWithImages, describeAiError } from '../utils/aiProvider';
import { addErrors } from '../utils/errorBook';
import { ExamRun, S, askJson, pick, sentenceFix, useNoHelp } from '../utils/trainerKit';
import { faDate, LevelChips, PrintPreview, WriteLines, prFa, prG, toFa } from './trainerUI';
import { Printer } from 'lucide-react';
import { ClickableWords, WordLookupModal } from './WordLookup';
import { pushAiBank, fetchAiBank, aiBankMarkSeen, aiBankSeenIds, mergeAiBank } from '../utils/aiBank';
import type { Word } from '../types';

/** Shrinks a photo to max 1800px JPEG so the upload stays small and reliable. */
const shrinkImage = (file: File): Promise<{ dataUrl: string; mimeType: string; base64: string }> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1800 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      const ctx = c.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('canvas')); return; }
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const d = c.toDataURL('image/jpeg', 0.82);
      URL.revokeObjectURL(url);
      resolve({ dataUrl: d, mimeType: 'image/jpeg', base64: d.split(',')[1] });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img')); };
    img.src = url;
  });

interface Criteria { content: number; structure: number; vocab: number; grammar: number }
interface SchreibenReport {
  transcribed_de?: string;
  understood_fa: string;
  score: number;
  criteria: Criteria;
  corrected_de: string;
  issues: { type: string; wrong: string; correct: string; why_fa: string }[];
  tip_fa: string;
}

const SCHREIBEN_TOPICS = [
  { id: 'zus', title: 'خلاصه‌نویسی از متن علمی (Zusammenfassung)', level: 'B2/C1', desc: 'خواندن یک متن علمی کوتاه و نوشتن خلاصهٔ آن با کلمات خودت (مناسب آزمون‌های دانشگاهی / EPD)' },
  { id: 'work', title: 'ایمیل کاری (حسابداری / اداری)', level: 'B1/B2', desc: 'نگارش مکاتبات مالی، گزارش کار، هماهنگی با همکاران یا مدیریت' },
  { id: 'bewerbung', title: 'درخواست کار (Bewerbung)', level: 'B1/B2', desc: 'ارسال رزومه، درخواست مصاحبه شغلی یا کارآموزی' },
  { id: 'haus', title: 'ایمیل به صاحب‌خانه یا Hausverwaltung', level: 'A2/B1', desc: 'گزارش خرابی، اعتراض به شارژ ساختمان یا هماهنگی تخلیه' },
  { id: 'insurance', title: 'نامه به بیمه یا اداره', level: 'B1', desc: 'پیگیری خسارت، درخواست خدمات یا ارسال مدارک رسمی' },
  { id: 'doctor', title: 'ایمیل به پزشک / وقت گرفتن', level: 'A2/B1', desc: 'دریافت نوبت معاینه، پرسش درباره نسخه یا گواهی استعلاجی' },
  { id: 'opinion', title: 'نظر و استدلال (Meinung)', level: 'B1/B2', desc: 'نوشتن دیدگاه درباره یک موضوع اجتماعی یا کاری با استدلال' },
  { id: 'friend', title: 'پیام غیررسمی به دوست', level: 'A2', desc: 'دعوت به مهمانی، برنامه‌ریزی آخر هفته یا احوالپرسی' },
  { id: 'report', title: 'گزارش از یک تجربه', level: 'B1', desc: 'تعریف یک اتفاق، سفر، دوره آموزشی یا خرید' }
];
const EXAM_TOPICS: Record<string, string[]> = {
  A1: ['friend', 'doctor'], A2: ['friend', 'haus', 'doctor'], B1: ['work', 'bewerbung', 'insurance', 'opinion'],
  B2: ['opinion', 'work', 'zus'], C1: ['opinion', 'zus']
};

/** زاویه‌های موضوعی برای تنوع — هر بار ۲تای تصادفی به پرامت می‌رود تا سناریو تکراری نشود (باگ «همش تکراری») */
const TASK_ANGLES = [
  'Mobilität und Verkehr', 'digitale Medien und Social Media', 'Umwelt und Müll im Alltag', 'Arbeitswelt und Karriere',
  'Wohnen und Nachbarschaft', 'Gesundheit und Stress', 'Geld, Sparen und Konsum', 'Bildung und Sprachenlernen',
  'Freundschaft und Familie', 'Reisen und Urlaub', 'Essen und Ernährung', 'Sport und Bewegung',
  'Klima und Energie', 'Künstliche Intelligenz im Alltag', 'Einkaufen und Online-Handel', 'Tiere und Haustiere',
  'Feste und Traditionen', 'Nachrichten und Presse', 'Ehrensache und Freiwilligenarbeit', 'Kultur und Vereine'
];

/* ── پروفایل آزمون‌های واقعی Schreiben (درخواست کاربر) ──
 * فرمت‌ها از نمونه‌سازهای رسمی: گوته (3 Aufgabe در B1، 2 Teil در B2/C1، SMS+E-Mail در A2)،
 * ÖSD B1 (همان ساختار ۳تایی گوته) و ÖSD B2 (توصیف‌نامه + 30/20 امتیاز)، telc (Brief با Leitpunkte)
 * و EPD (خلاصه‌نویسی متن علمی — مطابق توصیف درون‌برنامه‌ای). تمرین آزاد = رفتار قبلی. */
type ExamKind = 'mail' | 'forum' | 'summary';
interface ExamTeil {
  id: string;
  titleDe: string;   // عنوان رسمی Teil
  fa: string;        // توضیح فارسی کوتاه
  kind: ExamKind;    // forum → رندر ساخت‌یافته با Zitat کوتاه؛ summary → متن مبدأ؛ mail → قالب عمومی
  wr: string;        // بازهٔ واژهٔ رسمی، مثل 'ca. 80'
  wrFa: string;      // معادل فارسی برای توضیح
  minutes: number;   // زمان پیشنهادی همان Teil
  quoteStyle?: 'opinion' | 'survey';   // فقط برای forum: نظره یا نتیجهٔ نظرسنجی (گوته C1)
}
interface ExamProfile {
  id: string;
  nameDe: string; nameFa: string;
  teils: Partial<Record<'A2' | 'B1' | 'B2' | 'C1', ExamTeil[]>>;
}
const EXAM_PROFILES: ExamProfile[] = [
  {
    id: 'goethe', nameDe: 'Goethe-Zertifikat', nameFa: 'گوته (Goethe)',
    teils: {
      A2: [
        { id: 't1', titleDe: 'Teil 1: Nachricht schreiben (SMS)', fa: 'پیام کوتاه غیررسمی', kind: 'mail', wr: '20–30', wrFa: '۲۰ تا ۳۰', minutes: 15 },
        { id: 't2', titleDe: 'Teil 2: E-Mail schreiben', fa: 'ایمیل ساده به سه نکته', kind: 'mail', wr: 'ca. 60', wrFa: 'حدود ۶۰', minutes: 25 },
      ],
      B1: [
        { id: 't1', titleDe: 'Aufgabe 1: E-Mail schreiben (halboffiziell)', fa: 'ایمیل نیمه‌رسمی', kind: 'mail', wr: 'ca. 80', wrFa: 'حدود ۸۰', minutes: 20 },
        { id: 't2', titleDe: 'Aufgabe 2: Diskussionsbeitrag schreiben', fa: 'نظر و استدلال در فروم', kind: 'forum', wr: 'ca. 80', wrFa: 'حدود ۸۰', minutes: 20, quoteStyle: 'opinion' },
        { id: 't3', titleDe: 'Aufgabe 3: E-Mail schreiben (formell)', fa: 'ایمیل رسمی کوتاه', kind: 'mail', wr: 'ca. 40', wrFa: 'حدود ۴۰', minutes: 15 },
      ],
      B2: [
        { id: 't1', titleDe: 'Teil 1: Forumsbeitrag verfassen', fa: 'متن نظری کامل برای فروم', kind: 'forum', wr: 'ca. 150', wrFa: 'حدود ۱۵۰', minutes: 50, quoteStyle: 'opinion' },
        { id: 't2', titleDe: 'Teil 2: Formelle Nachricht schreiben', fa: 'نامهٔ رسمی (Sie-Form)', kind: 'mail', wr: 'ca. 100', wrFa: 'حدود ۱۰۰', minutes: 25 },
      ],
      C1: [
        { id: 't1', titleDe: 'Teil 1: Erörterung zu einer Umfrage', fa: 'مقاله بر پایهٔ نتایج نظرسنجی', kind: 'forum', wr: 'ca. 230', wrFa: 'حدود ۲۳۰', minutes: 50, quoteStyle: 'survey' },
        { id: 't2', titleDe: 'Teil 2: Formelle Nachricht schreiben', fa: 'نامهٔ رسمی کوتاه', kind: 'mail', wr: 'ca. 100', wrFa: 'حدود ۱۰۰', minutes: 25 },
      ],
    },
  },
  {
    id: 'osd', nameDe: 'ÖSD-Zertifikat', nameFa: 'ÖSD (اتریش)',
    teils: {
      B1: [
        { id: 't1', titleDe: 'Aufgabe 1: E-Mail schreiben (halboffiziell)', fa: 'ایمیل نیمه‌رسمی', kind: 'mail', wr: 'ca. 80', wrFa: 'حدود ۸۰', minutes: 20 },
        { id: 't2', titleDe: 'Aufgabe 2: Diskussionsbeitrag schreiben', fa: 'نظر و استدلال در فروم', kind: 'forum', wr: 'ca. 80', wrFa: 'حدود ۸۰', minutes: 20, quoteStyle: 'opinion' },
        { id: 't3', titleDe: 'Aufgabe 3: E-Mail schreiben (formell)', fa: 'ایمیل رسمی کوتاه', kind: 'mail', wr: 'ca. 40', wrFa: 'حدود ۴۰', minutes: 15 },
      ],
      B2: [
        { id: 't1', titleDe: 'Aufgabe 1: Formelle E-Mail / Beschwerde', fa: 'ایمیل رسمی یا شکایت', kind: 'mail', wr: 'ca. 250', wrFa: 'حدود ۲۵۰', minutes: 55 },
        { id: 't2', titleDe: 'Aufgabe 2: Meinungsbeitrag verfassen', fa: 'متن نظر و استدلال', kind: 'forum', wr: 'ca. 100–120', wrFa: 'حدود ۱۰۰ تا ۱۲۰', minutes: 35, quoteStyle: 'opinion' },
      ],
    },
  },
  {
    id: 'telc', nameDe: 'telc Deutsch', nameFa: 'telc',
    teils: {
      B1: [
        { id: 't1', titleDe: 'Schreiben: Brief schreiben (halboffiziell)', fa: 'نامهٔ نیمه‌رسمی با ۳ نکته + ۱ سؤال', kind: 'mail', wr: 'ca. 80–100', wrFa: 'حدود ۸۰ تا ۱۰۰', minutes: 30 },
      ],
      B2: [
        { id: 't1', titleDe: 'Schreiben: Brief / Text schreiben (formell)', fa: 'نامهٔ رسمی با نکات مشخص', kind: 'mail', wr: 'mindestens 150', wrFa: 'حداقل ۱۵۰', minutes: 30 },
      ],
    },
  },
  {
    id: 'epd', nameDe: 'EPD — Zusammenfassung', nameFa: 'EPD (آزمون دانشگاه)',
    teils: {
      B2: [
        { id: 't1', titleDe: 'Schreiben: Zusammenfassung eines Fachtextes', fa: 'خلاصه‌نویسی متن علمی', kind: 'summary', wr: 'ca. 100', wrFa: 'حدود ۱۰۰', minutes: 60 },
      ],
      C1: [
        { id: 't1', titleDe: 'Schreiben: Zusammenfassung eines Fachtextes', fa: 'خلاصه‌نویسی متن علمی', kind: 'summary', wr: 'ca. 120', wrFa: 'حدود ۱۲۰', minutes: 60 },
      ],
    },
  },
];

/** همهٔ Teilهای یک آزمون (برای جست‌وجوی عنوان) */
const allTeils = (p?: ExamProfile): ExamTeil[] => (p ? Object.values(p.teils).flatMap(v => v || []) : []);
const teilOf = (examId: string, tid: string): ExamTeil | undefined => allTeils(EXAM_PROFILES.find(p => p.id === examId)).find(t => t.id === tid);

/** چارچوب ثابتِ تمرین‌های فروم هر آزمون — مثل کارت رسمی: دستور → مقدمه → Zitat → خطوط دستور */
const forumFrame = (examId: string, t: ExamTeil, theme: string): { aufgabe: string; intro: string; instrBold: string; instrRest: string[] } => {
  const intro = `In einem Internetforum zum Thema „${theme}" finden Sie folgende Meinung:`;
  if (examId === 'goethe') {
    if (t.quoteStyle === 'survey') {
      return {
        aufgabe: `${t.titleDe}.`,
        intro: `In einer Umfrage zu „${theme}" wurden unter anderem folgende Ergebnisse veröffentlicht:`,
        instrBold: `Beschreiben und interpretieren Sie die Ergebnisse (${t.wr} Wörter).`,
        instrRest: ['Gehen Sie auf die Umfrage ein, vergleichen Sie die Ergebnisse mit Ihren eigenen Erfahrungen und begründen Sie Ihre Meinung.'],
      };
    }
    return {
      aufgabe: `${t.titleDe}.`,
      intro,
      instrBold: `Verfassen Sie Ihren eigenen Diskussionsbeitrag (${t.wr} Wörter).`,
      instrRest: ['Äußern Sie Ihre Meinung dazu, begründen Sie sie und nennen Sie Beispiele.'],
    };
  }
  if (examId === 'osd') {
    return {
      aufgabe: `${t.titleDe}.`,
      intro,
      instrBold: `Schreiben Sie Ihren Diskussionsbeitrag (${t.wr} Wörter).`,
      instrRest: ['Gehen Sie auf die Meinung ein und begründen Sie Ihre eigene Position.'],
    };
  }
  return {
    aufgabe: `${t.titleDe}.`,
    intro,
    instrBold: `Schreiben Sie einen Forumsbeitrag (${t.wr} Wörter).`,
    instrRest: ['Äußern Sie Ihre Meinung, begründen Sie sie und nennen Sie Beispiele.'],
  };
};

/** حافظهٔ آخرین صورتِسوال‌های هر موضوع — به پرامت می‌رود تا مدل همان سناریو را تکرار نکند */
const TASK_HIST_KEY = 'wb_schreiben_task_hist_v1';const loadTaskHist = (topicId: string): string[] => {
  try {
    const o = JSON.parse(localStorage.getItem(TASK_HIST_KEY) || '{}') as Record<string, unknown>;
    return Array.isArray(o[topicId]) ? (o[topicId] as string[]) : [];
  } catch { return []; }
};
const saveTaskHist = (topicId: string, taskDe: string): void => {
  try {
    const o = JSON.parse(localStorage.getItem(TASK_HIST_KEY) || '{}') as Record<string, unknown>;
    const arr = Array.isArray(o[topicId]) ? (o[topicId] as string[]) : [];
    o[topicId] = [...arr, taskDe].slice(-8);
    localStorage.setItem(TASK_HIST_KEY, JSON.stringify(o));
  } catch { /* ignore */ }
};

/** بایگانی تمرین‌های ساخته‌شده بر حسب سطح، نوع آزمون و موضوع — لیست «تمرین‌های قبلی» (درخواست کاربر) */
interface SavedExercise {
  id: string; ts: number; topicId: string; level: string;
  examId?: string;   // 'goethe' | 'osd' | 'telc' | 'epd' | 'free' — ورودی‌های قدیمی = آزاد
  taskDe: string; taskFa: string; sourceText: string; points: string[]; structured?: StructuredTask;
}
const SAVED_KEY = 'wb_schreiben_saved_v2';
const loadSaved = (): SavedExercise[] => {
  try {
    let a: unknown = JSON.parse(localStorage.getItem(SAVED_KEY) || 'null');
    if (!Array.isArray(a)) {
      // مهاجرت از v1: همهٔ تمرین‌های قدیمی «تمرین آزاد» بودند
      const old = JSON.parse(localStorage.getItem('wb_schreiben_saved_v1') || '[]') as unknown;
      a = Array.isArray(old) ? (old as Record<string, unknown>[]).map(x => ({ ...x, examId: 'free' })) : [];
    }
    return (a as SavedExercise[]).filter(x => x && x.taskDe);
  } catch { return []; }
};
const saveSavedExercise = (e: SavedExercise): void => {
  try {
    const a = loadSaved().filter(x => x.id !== e.id);
    localStorage.setItem(SAVED_KEY, JSON.stringify([e, ...a].slice(0, 60)));
  } catch { /* ignore */ }
};

/* ── بانک مشترک ابری تمرین‌های نوشتن (درخواست: دسترس‌پذیری همه‌جا) ──
 * تمرین‌های ساخته‌شده با AI (task + نکات + ساختار) به کالکشن عمومی Firestore فرستاده
 * می‌شوند و تمرین‌های بانک که روی این دستگاه نیستند به بایگانی افزوده می‌شوند — با هر
 * ایمیل یا حتی بدون ورود. */
const BANK_SKILL = 'schreiben';

const ISSUE_BADGE: Record<string, string> = {
  'گرامر': 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
  'املا': 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  'حرف اضافه و حالت دستوری': 'bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300',
  'واژه‌گزینی': 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300',
  'حروف ربط و ترتیب جمله': 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300',
  'آرتیکل و صرف صفت': 'bg-pink-100 text-pink-800 dark:bg-pink-950/60 dark:text-pink-300',
  'معنا و منطق جمله': 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
};

/** Rubrics like the real exams: four criteria, 0-25 each; the total is summed in code. */
const RUBRIC: Record<'task' | 'zus' | 'free', { labels: [string, string, string, string]; text: string }> = {
  task: {
    labels: ['محتوا و انجام تکلیف', 'ساختار و انسجام', 'واژگان', 'گرامر و درستی'],
    text: `- content: Erfüllung der Aufgabe (all required points covered, suitable register, length)
- structure: Kohärenz und Struktur (greeting/closing, logical order, connectors)
- vocab: Wortschatz (range, precision, spelling of words)
- grammar: Grammatik (correctness and complexity of structures)`
  },
  zus: {
    labels: ['محتوا و نکات کلیدی', 'ساختار و انسجام', 'واژگان و بازنویسی', 'گرامر و درستی'],
    text: `- content: Inhalt (topic named, all key statements and the result of the source text reproduced, nothing invented, NO personal opinion)
- structure: Struktur und Kohärenz (introduction naming topic/source, logical order, connectors, appropriate length ~100 words)
- vocab: Wortschatz und Paraphrase (own words instead of copying sentences, academic register, variety)
- grammar: Grammatik (correctness and complexity: Nebensätze, Passiv, Konjunktiv; spelling)`
  },
  free: {
    labels: ['محتوا و منطق', 'ساختار و انسجام', 'واژگان', 'گرامر و درستی'],
    text: `- content: Inhalt und Logik (the text makes sense, connectors are used logically)
- structure: Struktur und Kohärenz
- vocab: Wortschatz (range, precision, register)
- grammar: Grammatik, Satzbau, Rechtschreibung`
  }
};

const taskCheck = S.obj({ taskDe: S.req, taskFa: S.str(), sourceText: S.str(), point1: S.str(), point2: S.str(), point3: S.str() });
const quoteCheck = S.obj({ theme: S.req, quote: S.req, themeFa: S.str() });
const ideasCheck = S.obj({ ideas: S.arr(S.obj({ de: S.req, fa: S.str() })) });

/** صورت‌سوال ساخت‌یافتهٔ «نظر و استدلال» برای رندر مرتب: عنوان، دستور، مقدمه، نقل‌قول و خطوط ثابت دستورِ کار */
interface StructuredTask {
  title: string;       // Thema: „..."
  aufgabe: string;     // Aufgabe 1: Stellungnahme zu einem Blog-Eintrag schreiben.
  intro: string;       // In einem Blog ... finden Sie folgende Meinung:
  quote: string;       // نقل‌قول اصلی (ایتالیک در کادر جدا)
  instrBold: string;   // خط پررنگ دستور (تعداد واژه)
  instrRest: string[]; // خطوط معمولی بعد از آن
}
const reportCheck = S.obj({
  transcribed_de: S.str(), understood_fa: S.str(),
  criteria: S.obj({ content: S.num(0, 25), structure: S.num(0, 25), vocab: S.num(0, 25), grammar: S.num(0, 25) }),
  corrected_de: S.str(), issues: S.arr(S.obj({ type: S.str(), wrong: S.str(), correct: S.str(), why_fa: S.str() })), tip_fa: S.str()
});
const chatCheck = S.obj({ answer: S.req });
const wc = (t: string) => t.split(/\s+/).filter(w => /\p{L}/u.test(w)).length;

interface SchreibenCorrectorProps {
  onShowToast: (m: string, e?: boolean) => void;
  onQuickAddWord?: (w: Partial<Word>) => boolean;
  /** کل کتابخانه — گیتِ تکراری/Partizip II/مترادف */
  words?: Word[];
  onViewWord?: (w: Word) => void;
  variant?: 'pruefung' | 'pruefen';
  exam?: ExamRun;
}

export const SchreibenCorrector: React.FC<SchreibenCorrectorProps> = ({ onShowToast, onQuickAddWord, words, onViewWord, variant = 'pruefen', exam }) => {
  const isExamMode = variant === 'pruefung' || !!exam;
  const [noHelp, setNoHelp] = useNoHelp();
  const limited = !!exam || noHelp;           // hides the Persian task text and key points

  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [targetLevel, setTargetLevel] = useState<string>(exam ? exam.level : 'B1');
  // نوع آزمون Schreiben: گوته/ÖSD/telc/EPD یا «تمرین آزاد» با رفتار قبلی (درخواست کاربر)
  const [examType, setExamType] = useState<string>('free');
  const [selectedTeil, setSelectedTeil] = useState<string>('');
  const [promptData, setPromptData] = useState<{ taskDe: string; taskFa: string; sourceText: string; points: string[]; structured?: StructuredTask } | null>(null);
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [showFa, setShowFa] = useState(false);
  // ایده‌های نوشتن: اگر کاربر ایده‌ای برای متن نداشت (درخواست جدید کاربر)
  const [ideas, setIdeas] = useState<{ de: string; fa: string }[] | null>(null);
  const [ideasBusy, setIdeasBusy] = useState(false);
  // بایگانی تمرین‌ها + پیش‌نمایش برگهٔ A4
  const [printOpen, setPrintOpen] = useState(false);
  const [savedList, setSavedList] = useState<SavedExercise[]>(() => loadSaved());

  // همگام‌سازی بایگانی با بانک مشترک ابری — یک‌بار هنگام مونت؛ بی‌صدا در خطا
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const seen = aiBankSeenIds(BANK_SKILL);
        const cloud = await fetchAiBank<SavedExercise>(BANK_SKILL);
        if (!alive) return;
        aiBankMarkSeen(BANK_SKILL, cloud.map((c) => c.id));
        setSavedList((prev) => {
          const merged = mergeAiBank(prev, cloud, seen);
          if (merged !== prev && merged.length > prev.length) {
            try { localStorage.setItem(SAVED_KEY, JSON.stringify(merged.slice(0, 60))); } catch { /* ignore */ }
            return merged;
          }
          return prev;
        });
        const have = new Set(cloud.map((c) => c.id));
        loadSaved().filter((x) => x?.id && !have.has(x.id)).slice(0, 25)
          .forEach((x) => pushAiBank(BANK_SKILL, x.id, x, { level: x.level, topic: x.topicId, kind: x.examId, count: (x.points || []).length }));
      } catch { /* بی‌صدا */ }
    })();
    return () => { alive = false; };
  }, []);

  const [images, setImages] = useState<{ dataUrl: string; mimeType: string; base64: string }[]>([]);
  // پاپ‌آپ واژهٔ لمس‌شده (صورت سوال، متن مبدأ، ایده‌ها و تصحیح‌ها)
  const [lookup, setLookup] = useState<string | null>(null);
  // صف کراپ: هر عکس تازه قبل از ورود به فهرست از کراپ می‌گذرد (درخواست #۶)
  const [pendingCrop, setPendingCrop] = useState<{ dataUrl: string; rest: { dataUrl: string; mimeType: string; base64: string }[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState('');
  const [report, setReport] = useState<SchreibenReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [shadowOpen, setShadowOpen] = useState(false);
  const [chat, setChat] = useState<{ q: string; a: string; err?: boolean }[]>([]);
  const [chatQ, setChatQ] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(-1);
  const runCheckRef = useRef<() => void>(() => {});

  const rubricKey: 'task' | 'zus' | 'free' = selectedTopic === 'zus' ? 'zus' : isExamMode ? 'task' : 'free';

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
    e.target.value = '';
    if (files.length === 0) { onShowToast('لطفاً فقط فایل تصویری انتخاب کنید.', true); return; }
    try {
      const shrunk = await Promise.all(files.map(shrinkImage));
      // اولین عکس به کراپ می‌رود؛ بقیه در صف می‌مانند و یکی‌یکی کراپ می‌شوند
      setPendingCrop({ dataUrl: shrunk[0].dataUrl, rest: shrunk.slice(1) });
    }
    catch { onShowToast('خواندن تصویر ممکن نشد.', true); }
  };

  const pushImage = (dataUrl: string) => setImages(prev => [...prev, { dataUrl, mimeType: 'image/jpeg', base64: (dataUrl.split(',')[1] || '') }].slice(0, 8));
  const advanceCrop = (c: { dataUrl: string; rest: { dataUrl: string; mimeType: string; base64: string }[] } | null) => {
    if (!c) return null;
    if (c.rest.length) return { dataUrl: c.rest[0].dataUrl, rest: c.rest.slice(1) };
    return null;
  };

/** موضوعات روزمرهٔ ملموس برای «نظر و استدلال» — هر بار چندتای تصادفی به AI پیشنهاد می‌شود تا Zitat تازه بسازد */
const OPINION_THEMES = [
  'Geschenke weiterverschenken', 'Dinge aufbewahren oder wegwerfen', 'Handynutzung beim Essen', 'Haustiere in der Wohnung',
  'Homeoffice oder Büro', 'Lieferservice statt selbst kochen', 'Öffentlicher Verkehr statt eigenem Auto', 'Social Media in der Freizeit',
  'Online-Shopping oder Geschäft', 'Frühaufsteher oder Nachtschwärmer', 'Sprachen mit App oder Kurs lernen', 'Urlaub in den Bergen oder am Meer',
  'Alte Möbel restaurieren oder ersetzen', 'Mülltrennung im Alltag', 'Secondhand-Kleidung kaufen', 'Streaming statt Kino',
  'Geld sparen oder genießen', 'Wohnen in der WG oder allein', 'Sport im Fitnessstudio oder draußen', 'Fotos von allem machen',
  'Bücher auf Papier oder E-Reader', 'Videospiele als Hobby', 'Kaffee zu Hause oder im Café', 'Fahrrad statt Bus in der Stadt',
  'Urlaub ganz ohne Handy', 'Nachbarschaftshilfe in der Stadt', 'Zoo oder Tierpark besuchen', 'Mit Freunden gemeinsam kochen',
  'Fastfood am Arbeitsplatz', 'Wocheneinkauf online oder im Markt'
];

/** متن استاندارد فارسی برای توضیح فارسی کارِ opinion */
const opinionFa = (themeFa: string, wr: string) =>
  `نظر یک نفر دربارهٔ «${themeFa || 'یک موضوع روزمره'}» آمده است؛ شما باید نظر خودتان را در ${wr} واژه بنویسید، با دلیل و مثال، و از جملات وابستهٔ متنوع (dass، weil، wenn، obwohl، als، ob و…) استفاده کنید.`;

const normDe = (t: string): string => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** آیا این صورت‌سوال با قبلی‌ها یکی است؟ هرکدام: نقل‌قول تکراری، همان موضوع دقیق،
 *  ≥۲ واژهٔ معنادار مشترک، یا یک واژهٔ کم‌یابِ (≥۷ حرف) مشترک → تکراری.
 *  برای مسیر غیر-opinion، theme خالی بده تا فقط متنِ کل چک شود. */
const isRepeat = (theme: string, quote: string, hist: string[]): boolean => {
  const nq = normDe(quote).slice(0, 90);
  const nt = normDe(theme);
  const words = nt.split(' ').filter(w => w.length >= 5);
  if (nq.length < 20 && words.length < 2) return false;
  return hist.some(h => {
    const nh = normDe(h);
    if (nq.length >= 20 && nh.includes(nq)) return true;
    if (nt.length >= 5 && nh.includes(nt)) return true;
    const hits = words.filter(w => nh.includes(w));
    if (hits.length >= 2) return true;
    return hits.some(w => w.length >= 7);
  });
};

  const fetchTaskPrompt = async (topicId: string, lvl = targetLevel) => {
    const topObj = SCHREIBEN_TOPICS.find(t => t.id === topicId);
    if (!topObj) return;
    setGeneratingPrompt(true); setPromptData(null); setShowFa(false); setErrMsg(''); setIdeas(null);
    setText(''); setReport(null); setImages([]); setPrintOpen(false);   // تمرین تازه = پاسخ خالی
    const zus = topicId === 'zus';
    // تنوع تضمینی: زاویهٔ تصادفی + فهرست صورتِسوال‌های قبلی که مدل نباید تکرار کند
    const banned = loadTaskHist(topicId).slice(-5);
    const angles = [...TASK_ANGLES].sort(() => Math.random() - 0.5).slice(0, 2);
    const bannedBlock = banned.length ? `Do NOT repeat or merely paraphrase these Aufgaben the learner already had:\n${banned.map((b, i) => `${i + 1}. ${b}`).join('\n')}\n` : '';
    try {
      // ── مسیر «نظر و استدلال»: قالب ثابت آزمون + Zitat تازه از AI در هر بار (خواستهٔ کاربر) ──
      // متن ثابتِ دستورِ کار را کد می‌سازد؛ AI فقط موضوع و نقل‌قولِ نو تولید می‌کند، با تلاش مجدد روی تکراری‌بودن.
      if (topicId === 'opinion') {
        const wr = lvl === 'C1' ? '150–180' : '100–120';
        const wrFa = lvl === 'C1' ? '۱۵۰ تا ۱۸۰' : '۱۰۰ تا ۱۲۰';
        let r: { theme: string; quote: string; themeFa?: string } | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          const sug = [...OPINION_THEMES].sort(() => Math.random() - 0.5).slice(0, 3);
          const p = `You design German ${lvl} writing-exam tasks (ÖSD/Goethe style). Invent ONE completely new, concrete everyday-life opinion situation for a Stellungnahme task.
Theme ideas to build around (you may adapt them): "${sug[0]}", "${sug[1]}", "${sug[2]}".
${bannedBlock}
Write the opinion ("quote") as a natural first-person German text of 4–6 short sentences with ONLY about 50–60 words in total (${lvl} vocabulary): a clear personal stance (mostly for, mostly against, or torn with a leaning) plus one concrete personal example and one short counter-argument. Keep it compact — it must fit about 6 lines on an A4 sheet. Vary situations: one time a personal experience, one time a complaint, one time a suggestion.
Return ONLY valid JSON: {"theme":"kurzes Blog-/Artikelthema in 2–5 Wörtern","quote":"das Zitat, 4–6 kurze Sätze, ca. 50–60 Wörter, Ich-Form","themeFa":"ترجمهٔ فارسی کوتاه موضوع"}`;
          const cur = await askJson<any>(p, quoteCheck, { timeoutMs: 35000 });
          const tooLong = wc(cur.quote || '') > 70;   // درخواست کاربر: Zitat حداکثر ~۶۰ واژه
          if (!isRepeat(cur.theme || '', cur.quote || '', banned) && !tooLong) { r = cur; break; }
          if (!r) r = cur;   // همه تکراری/بلند بودند — آخرین نسخه را نگه دار
        }
        if (r) {
          const blog = Math.random() < 0.5;
          const neb = 'Für eine gute Bewertung begründen Sie Ihre Meinung und verwenden Sie verschiedene Nebensätze (dass, weil, wenn, obwohl, als, ob etc.).';
          // اجزای ساخت‌یافته برای رندر مرتب (مثل نمونهٔ رسمی آزمون): عنوان → دستور → مقدمه → Zitat → خطوط دستور
          const aufgabe = blog ? 'Aufgabe 1: Stellungnahme zu einem Blog-Eintrag schreiben.' : 'Aufgabe: Stellungnahme schreiben.';
          const intro = blog ? `In einem Blog zum Thema „${r.theme}" finden Sie folgende Meinung:` : 'Lesen Sie die folgende Meinung:';
          const instrBold = blog
            ? `Erläutern Sie Ihre Position (${wr} Wörter) zu diesem Zitat und nennen Sie Beispiele.`
            : `Schreiben Sie Ihre Stellungnahme (${wr} Wörter).`;
          const instrRest = blog ? [neb] : [`Erläutern Sie Ihre Position zu diesem Zitat und nennen Sie Beispiele.`, neb];
          const taskDe = `${aufgabe}\n\n${intro}\n\n„${r.quote}"\n\n${instrBold}\n${instrRest.join('\n')}`;
          const structured: StructuredTask = { title: `Thema: „${r.theme}"`, aufgabe, intro, quote: r.quote, instrBold, instrRest };
          const pd = { taskDe, taskFa: opinionFa(r.themeFa || '', wrFa), sourceText: '', points: [], structured };
          setPromptData(pd);
          rememberExercise(topicId, lvl, pd);   // در بایگانی سطح/موضوع ذخیره شود
          saveTaskHist(topicId, taskDe);
        }
        return;
      }
      const p = `You are a strict German exam designer (like ÖSD/Goethe/EPD for level ${lvl}). Create a NEW, original exam Aufgabe card for: "${topObj.title} (${topObj.desc})".
Build this task around the fresh, concrete scenario themes "${angles[0]}" and "${angles[1]}" — a situation the learner has not seen before.
${bannedBlock}
${zus
  ? `The task is a ZUSAMMENFASSUNG: put an authentic short scientific/academic source text (about ${lvl === 'C1' ? 280 : 220} words, a real-sounding topic from social science, technology, environment or economics — related to the scenario themes above) into "sourceText". "taskDe" is the German instruction: summarise the text in about 100 words, name topic and source, reproduce the key statements and the result in your own words, no personal opinion.`
  : `The output must mirror official exam formats (Blog-Eintrag Stellungnahme or formelle E-Mail with a realistic scenario tied to the scenario themes above, required word count, points to cover). "sourceText" must be an empty string.`}
Return ONLY valid JSON: {"taskDe":"...","taskFa":"ترجمه و راهنمای فارسی خواسته آزمون","sourceText":"...","point1":"نکته اول","point2":"نکته دوم","point3":"نکته سوم"}`;
      // تلاش مجدد اگر متن خیلی شبیه صورت‌سوال قبلی بود
      let r: any = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        const cur = await askJson<any>(p + (attempt ? '\n\nIMPORTANT: Your previous idea was too similar to an earlier task. Choose a clearly different concrete scenario now.' : ''), taskCheck, { timeoutMs: 40000 });
        r = cur;
        if (attempt === 1 || !isRepeat('', cur.taskDe || '', banned)) break;
      }
      const pd = { taskDe: r.taskDe, taskFa: r.taskFa || topObj.desc, sourceText: r.sourceText, points: [r.point1, r.point2, r.point3].filter(Boolean) };
      setPromptData(pd);
      if (r.taskDe) {
        rememberExercise(topicId, lvl, pd);   // در بایگانی سطح/موضوع ذخیره شود
        saveTaskHist(topicId, r.taskDe);   // برای تکرارنشدن دفعات بعد
      }
    } catch (e: any) {
      onShowToast(describeAiError(e), true);
    } finally { setGeneratingPrompt(false); }
  };

  // ساخت تمرین برای یک Teil واقعی از آزمون‌های گوته/ÖSD/telc/EPD — دقیقاً با قالب همان آزمون (درخواست کاربر)
  const fetchExamPrompt = async (examId: string, lvl: string, t: ExamTeil) => {
    const prof = EXAM_PROFILES.find(p => p.id === examId);
    if (!prof) return;
    setGeneratingPrompt(true); setPromptData(null); setShowFa(false); setErrMsg(''); setIdeas(null);
    setText(''); setReport(null); setImages([]); setPrintOpen(false);   // تمرین تازه = پاسخ خالی
    const histKey = `${examId}:${lvl}:${t.id}`;
    const banned = loadTaskHist(histKey).slice(-5);
    const angles = [...TASK_ANGLES].sort(() => Math.random() - 0.5).slice(0, 2);
    const bannedBlock = banned.length ? `Do NOT repeat or merely paraphrase these Aufgaben the learner already had:\n${banned.map((b, i) => `${i + 1}. ${b}`).join('\n')}\n` : '';
    try {
      // ── Teilهای فروم/مقاله: همان رندر ساخت‌یافته با Zitat کوتاه (~۵۰-۶۰ واژه، خواستهٔ کاربر) ──
      if (t.kind === 'forum') {
        let r: { theme: string; quote: string; themeFa?: string } | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          const sug = [...OPINION_THEMES].sort(() => Math.random() - 0.5).slice(0, 3);
          const quoteSpec = t.quoteStyle === 'survey'
            ? `Write the "quote" as a short, neutral German survey report of 3–4 sentences with ONLY about 50–60 words in total: the survey question, key percentages/numbers and one surprising result.`
            : `Write the opinion ("quote") as a natural first-person German text of 4–6 short sentences with ONLY about 50–60 words in total: a clear personal stance plus one concrete example and one short counter-argument. Keep it compact — it must fit about 6 lines on an A4 sheet.`;
          const p = `You design the official German ${lvl} exam "${prof.nameDe}" module Schreiben — ${t.titleDe} (${t.wr} Wörter, ca. ${t.minutes} Minuten).
Invent ONE completely new, concrete everyday-life situation for this ${t.quoteStyle === 'survey' ? 'survey-discussion' : 'discussion'} task.
Theme ideas to build around (you may adapt them): "${sug[0]}", "${sug[1]}", "${sug[2]}".
${bannedBlock}
${quoteSpec}
Vary situations: one time a personal experience, one time a complaint, one time a suggestion.
Return ONLY valid JSON: {"theme":"kurzes Thema in 2–5 Wörtern","quote":"...","themeFa":"ترجمهٔ فارسی کوتاه موضوع"}`;
          const cur = await askJson<any>(p, quoteCheck, { timeoutMs: 35000 });
          const tooLong = wc(cur.quote || '') > 70;   // درخواست کاربر: متن وسط تمرین کوتاه بماند
          if (!isRepeat(cur.theme || '', cur.quote || '', banned) && !tooLong) { r = cur; break; }
          if (!r) r = cur;
        }
        if (r) {
          const f = forumFrame(examId, t, r.theme);
          const taskDe = `${f.aufgabe}\n\n${f.intro}\n\n„${r.quote}"\n\n${f.instrBold}\n${f.instrRest.join('\n')}`;
          const structured: StructuredTask = { title: `Thema: „${r.theme}"`, ...f, quote: r.quote };
          const pd = { taskDe, taskFa: opinionFa(r.themeFa || '', t.wrFa), sourceText: '', points: [], structured };
          setPromptData(pd);
          rememberExercise(t.id, lvl, pd, examId);
          saveTaskHist(histKey, taskDe);
        }
        return;
      }
      // ── Zusammenfassung (EPD): متن مبدأ + دستور خلاصه‌نویسی ──
      if (t.kind === 'summary') {
        const p = `You design the German ${lvl} exam "${prof.nameDe}" module Schreiben — ${t.titleDe}.
Put an authentic short scientific/academic German source text (about ${lvl === 'C1' ? 280 : 220} words, a real-sounding topic from social science, technology, environment or economics, related to the scenario themes "${angles[0]}" and "${angles[1]}") into "sourceText".
"taskDe" = the German instruction: "Lesen Sie den folgenden Text. Fassen Sie den Inhalt in eigenen Worten zusammen (${t.wr} Wörter). Nennen Sie Thema und Ergebnis des Textes. Verwenden Sie keine eigene Meinung." plus 2–3 short German content hints.
${bannedBlock}
Return ONLY valid JSON: {"taskDe":"...","taskFa":"ترجمه و راهنمای فارسی خواسته آزمون","sourceText":"...","point1":"نکته اول","point2":"نکته دوم","point3":"نکته سوم"}`;
        const r = await askJson<any>(p, taskCheck, { timeoutMs: 45000 });
        const pd = { taskDe: r.taskDe, taskFa: r.taskFa || t.fa, sourceText: r.sourceText, points: [r.point1, r.point2, r.point3].filter(Boolean) };
        setPromptData(pd);
        if (r.taskDe) { rememberExercise(t.id, lvl, pd, examId); saveTaskHist(histKey, r.taskDe); }
        return;
      }
      // ── E-Mail/Brief: قالب رسمی همان Teil با Leitpunkte و register درست ──
      const p = `You are the official task designer of the German ${lvl} exam "${prof.nameDe}", module Schreiben — ${t.titleDe} (ca. ${t.minutes} Minuten, ${t.wr} Wörter).
Create ONE new, original exam task in the exact official format for this Teil: a realistic, concrete everyday/work situation built around the scenario themes "${angles[0]}" and "${angles[1]}".
The German "taskDe" must state: the situation, the recipient and register (informal "du" OR formal "Sie" — whichever fits this official Teil), 3–4 clear Leitpunkte written as a) b) c) (optional d) question) that the answer must cover, and the required length "${t.wr} Wörter". Keep the official concise exam wording.
${bannedBlock}
Return ONLY valid JSON: {"taskDe":"...","taskFa":"ترجمه و راهنمای فارسی خواسته آزمون","sourceText":"","point1":"نکته اول","point2":"نکته دوم","point3":"نکته سوم"}`;
      let r: any = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        const cur = await askJson<any>(p + (attempt ? '\n\nIMPORTANT: Your previous idea was too similar to an earlier task. Choose a clearly different concrete scenario now.' : ''), taskCheck, { timeoutMs: 40000 });
        r = cur;
        if (attempt === 1 || !isRepeat('', cur.taskDe || '', banned)) break;
      }
      const pd = { taskDe: r.taskDe, taskFa: r.taskFa || t.fa, sourceText: r.sourceText, points: [r.point1, r.point2, r.point3].filter(Boolean) };
      setPromptData(pd);
      if (r.taskDe) { rememberExercise(t.id, lvl, pd, examId); saveTaskHist(histKey, r.taskDe); }
    } catch (e: any) {
      onShowToast(describeAiError(e), true);
    } finally { setGeneratingPrompt(false); }
  };

  // درخواست کاربر: اگر ایده‌ای برای نوشتن ندارد، با یک دکمه چند ایدهٔ قابل‌استفاده بگیرد
  const fetchIdeas = async () => {
    if (!promptData || ideasBusy) return;
    setIdeasBusy(true);
    try {
      const p = `The learner must write a German exam text (level ${targetLevel}) for this Aufgabe and has no idea what to say.
AUFGABE:
${promptData.taskDe}
${promptData.sourceText ? `SOURCE TEXT (first part):\n${promptData.sourceText.slice(0, 900)}\n` : ''}
Give exactly 4 concrete, usable ideas for what the LEARNER could write — real content, not meta-advice: a position sentence, arguments, a concrete personal-style example, and a closing sentence. Each idea = one short, natural German sentence at ${targetLevel} level (a fitting Nebensatz like weil/dass/wenn/obwohl where natural), easy to adapt directly into their text.
Return ONLY valid JSON: {"ideas":[{"de":"...","fa":"ترجمهٔ فارسی کوتاه"}]}`;
      const r = await askJson<any>(p, ideasCheck, { timeoutMs: 35000 });
      setIdeas((r.ideas || []).filter((it: any) => it && it.de));
    } catch (e: any) {
      onShowToast(describeAiError(e), true);
    } finally { setIdeasBusy(false); }
  };

  // ذخیرهٔ تمرین تازه در بایگانی «نوع آزمون + سطح + موضوع/Teil» (درخواست کاربر)
  const rememberExercise = (topicId: string, lvl: string, pd: NonNullable<typeof promptData>, examId = 'free') => {
    const e: SavedExercise = { id: `${Date.now()}`, ts: Date.now(), topicId, level: lvl, examId, taskDe: pd.taskDe, taskFa: pd.taskFa, sourceText: pd.sourceText, points: pd.points, structured: pd.structured };
    saveSavedExercise(e);
    // ☁️ ذخیره در بانک مشترک — با هر دستگاه/ایمیل/بدون ورود در دسترس همه
    pushAiBank(BANK_SKILL, e.id, e, { level: lvl, topic: topicId, kind: examId, count: (e.points || []).length });
    setSavedList(loadSaved());
  };
  // باز کردن یک تمرین قبلی از لیست — همان صفحهٔ تمرین، با پاسخ خالی
  const openSaved = (e: SavedExercise) => {
    const ex = e.examId || 'free';
    setExamType(ex); setTargetLevel(e.level);
    if (ex === 'free') { setSelectedTopic(e.topicId); setSelectedTeil(''); }
    else { setSelectedTeil(e.topicId); setSelectedTopic(''); }
    setText(''); setReport(null); setImages([]); setErrMsg(''); setShowFa(false); setIdeas(null); setPrintOpen(false);
    setPromptData({ taskDe: e.taskDe, taskFa: e.taskFa, sourceText: e.sourceText, points: e.points, structured: e.structured });
  };
  // خروج از صفحهٔ تمرین → برگشت به صفحهٔ انتخاب سطح/موضوع
  const exitExercise = () => {
    setPromptData(null); setText(''); setReport(null); setImages([]); setErrMsg('');
    setShowFa(false); setIdeas(null); setPrintOpen(false);
  };

  // full-exam mode: pick a task for the level and start the real timer
  useEffect(() => {
    if (!exam) return;
    const id = pick(EXAM_TOPICS[exam.level] || EXAM_TOPICS.B1);
    setSelectedTopic(id);
    void fetchTaskPrompt(id, exam.level).then(() => setSecondsLeft(exam.minutes * 60));
  }, []);
  useEffect(() => {
    if (!exam || secondsLeft <= 0 || report) return;
    const t = setInterval(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearInterval(t);
  }, [exam, report, secondsLeft > 0]);
  useEffect(() => { if (exam && secondsLeft === 0 && !report) runCheckRef.current(); }, [secondsLeft]);

  const runCheck = async () => {
    const s = text.trim();
    if (busy) return;
    if (!s && images.length === 0) { if (exam) exam.onFinish({ score: 0, max: 100, note: 'متنی نوشته نشد' }); return; }
    setBusy(true); setErrMsg(''); setReport(null);

    const topicTitle = activeExamLabel;
    const hasImages = images.length > 0;
    const rubric = RUBRIC[rubricKey];

    const prompt = `You are an expert German exam corrector and teacher for Persian-speaking learners.
${hasImages ? 'First, carefully transcribe ALL handwritten or printed German text from the attached image(s) accurately into "transcribed_de". If the user also typed text, combine them.' : ''}
Evaluate this German writing ${isExamMode ? `for level ${targetLevel} (Context: ${topicTitle})` : 'thoroughly in terms of German thinking (deutsches Denken), style, logic, and grammar'}.

${s ? `TYPED INPUT TEXT:\n"${s}"\n` : ''}
${isExamMode && promptData ? `EXAM TASK:\n${promptData.taskDe}\n${promptData.sourceText ? `SOURCE TEXT TO SUMMARISE:\n${promptData.sourceText}\n` : ''}` : ''}

RUBRIC — give each criterion an INTEGER 0-25 (do NOT output a total score):
${rubric.text}
Be strict and honest; a text that ignores the task or is far too short scores low.

Also list the genuine errors:
- Every "wrong" must be an exact substring of the original/transcribed text.
- Issue types must be exactly one of: "گرامر" | "املا" | "حرف اضافه و حالت دستوری" | "واژه‌گزینی" | "حروف ربط و ترتیب جمله" | "آرتیکل و صرف صفت" | "معنا و منطق جمله".
- corrected_de = the corrected full text (preserve the learner's voice). Persian explanations, concise.
Return ONLY a valid JSON array with one object:
[{"transcribed_de":"${hasImages ? 'exact transcribed German text from images' : ''}","understood_fa":"...","criteria":{"content":0,"structure":0,"vocab":0,"grammar":0},"corrected_de":"...","issues":[{"type":"...","wrong":"...","correct":"...","why_fa":"..."}],"tip_fa":"..."}]`;

    try {
      const r = await askJson<any>(prompt, reportCheck, hasImages
        ? { call: p => generateWithImages(p, images.map(i => ({ mimeType: i.mimeType, data: i.base64 })), { json: true, timeoutMs: 120000, retries: 1 }) }
        : { timeoutMs: 55000 });
      const source = r.transcribed_de || s;
      const k = wc(source) < 15 ? 0.3 : 1;   // a couple of words cannot score high
      const c = r.criteria;
      const crit: Criteria = { content: Math.round(c.content * k), structure: Math.round(c.structure * k), vocab: Math.round(c.vocab * k), grammar: Math.round(c.grammar * k) };
      const score = crit.content + crit.structure + crit.vocab + crit.grammar;   // total is summed by code
      const issues = r.issues.filter((i: any) => i.wrong || i.correct);
      if (issues.length) addErrors(issues.map((i: any) => ({ ...sentenceFix(source, i.wrong, i.correct), type: i.type, why: i.why_fa, src: 'Schreiben' })));
      setReport({ transcribed_de: r.transcribed_de || undefined, understood_fa: r.understood_fa, score, criteria: crit, corrected_de: r.corrected_de, issues, tip_fa: r.tip_fa });
      exam?.onFinish({ score, max: 100, note: r.tip_fa });
    } catch (e: any) {
      setErrMsg(describeAiError(e));
      onShowToast(describeAiError(e), true);
    } finally { setBusy(false); }
  };
  runCheckRef.current = () => { void runCheck(); };

  const askChat = async () => {
    const q = chatQ.trim();
    if (!q || chatBusy || !report) return;
    setChatBusy(true);
    setChat(prev => [...prev, { q, a: '…' }]);
    setChatQ('');
    const sourceText = report.transcribed_de || text.trim();
    try {
      const r = await askJson<any>(`You are an expert German teacher. A learner's text was corrected.\nOriginal text: "${sourceText}"\nCorrected: "${report.corrected_de}"\nQuestion (in Persian): "${q}"\nAnswer ONLY a JSON array with one object:\n[{"answer":"پاسخ کوتاه و کاربردی فارسی (۳ تا ۵ خط)."}]`, chatCheck, { timeoutMs: 30000 });
      setChat(prev => { const next = [...prev]; next[next.length - 1] = { q, a: r.answer }; return next; });
    } catch (e: any) {
      setChat(prev => { const next = [...prev]; next[next.length - 1] = { q, a: describeAiError(e), err: true }; return next; });
    } finally { setChatBusy(false); }
  };

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  // انتخاب سطح: دکمه‌های هم‌اندازه در یک خط، سبک تب گرامر (درخواست کاربر — بدون لیست کشویی)
  const levelButtons = (
    <LevelChips value={targetLevel} onChange={l => setTargetLevel(l)} levels={['A2', 'B1', 'B2', 'C1']} />
  );

  // برچسب آزمون فعال: نام موضوع (آزاد) یا نام آزمون + Teil
  const activeExamLabel = examType === 'free'
    ? SCHREIBEN_TOPICS.find(t => t.id === selectedTopic)?.title || 'تمرین آزاد'
    : (() => {
      const p = EXAM_PROFILES.find(x => x.id === examType);
      const t = p ? teilOf(examType, selectedTeil) : undefined;
      return `${p?.nameFa || ''}${t ? ` — ${t.titleDe}` : ''}` || 'تمرین';
    })();

  // Teilهای تعریف‌شدهٔ آزمون انتخاب‌شده برای سطح فعلی
  const teilList = EXAM_PROFILES.find(p => p.id === examType)?.teils[targetLevel as 'A2' | 'B1' | 'B2' | 'C1'] || [];

  // تمرین‌های قبلیِ بایگانی، تازه‌ترین اول — آزاد: همین موضوع؛ آزمون: همین آزمون (همهٔ Teilها)
  const savedForPick = savedList.filter(s => (s.examId || 'free') === 'free' && s.topicId === selectedTopic && s.level === targetLevel);
  const savedForExam = savedList.filter(s => (s.examId || 'free') === examType && examType !== 'free' && s.level === targetLevel);

  // بلوک لیست تمرین‌های قبلی — برای هر دو حالت آزاد/آزمون
  const savedListBlock = (arr: SavedExercise[], heading: string, hint: string, labelOf: (s: SavedExercise) => string) => (
    <div className="space-y-2 pt-1">
      <div className="text-sm font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">{heading}</div>
      {arr.length === 0 ? (
        <div className="text-xs text-slate-500 dark:text-slate-400 p-3 rounded-xl bg-slate-50 dark:bg-[#141923] border border-dashed border-slate-300 dark:border-slate-700">{hint}</div>
      ) : (
        <div className="space-y-2">
          {arr.slice(0, 12).map(s => (
            <div key={s.id} className="flex items-stretch gap-2">
              <button onClick={() => openSaved(s)}
                className="flex-1 min-w-0 block text-right p-3 rounded-xl bg-slate-50 dark:bg-[#141923] border border-slate-200 dark:border-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:border-indigo-300 dark:hover:border-indigo-800 transition">
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2 py-0.5 rounded-full bg-white dark:bg-[#1b2029] border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-600 dark:text-slate-300">{s.level}</span>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{faDate(s.ts)}</span>
                </div>
                <div dir="ltr" className="text-left text-xs font-semibold text-slate-700 dark:text-slate-200 mt-1.5 truncate">{labelOf(s)}</div>
              </button>
              {/* برگهٔ A4 از همین تمرین ذخیره‌شده — بدون باز کردن تمرین */}
              <button
                onClick={() => printSaved(s)}
                title="برگهٔ A4 این تمرین ذخیره‌شده — صورت سوال + خط‌کشی نوشتن"
                aria-label="برگهٔ A4"
                className="w-11 rounded-xl bg-[#1f5fbf] text-white flex items-center justify-center flex-shrink-0 hover:bg-[#194ea0] transition"
              >
                <Printer size={16} />
              </button>
            </div>
          ))}
          {arr.length > 12 && <div className="text-[11px] text-slate-400">{toFa(arr.length - 12)} تمرین قدیمی‌تر هم در بایگانی هست.</div>}
        </div>
      )}
    </div>
  );
  /** بارگذاری تمرین ذخیره‌شده فقط برای گرفتن برگهٔ A4 — مثل openSaved ولی بدون بستن پیش‌نمایش */
  const printSaved = (e: SavedExercise) => {
    const ex = e.examId || 'free';
    setExamType(ex); setTargetLevel(e.level);
    if (ex === 'free') { setSelectedTopic(e.topicId); setSelectedTeil(''); }
    else { setSelectedTeil(e.topicId); setSelectedTopic(''); }
    setText(''); setReport(null); setImages([]); setErrMsg(''); setShowFa(false); setIdeas(null);
    setPromptData({ taskDe: e.taskDe, taskFa: e.taskFa, sourceText: e.sourceText, points: e.points, structured: e.structured });
    setPrintOpen(true);
  };
  const savedLabelFree = (s: SavedExercise) => s.structured ? `${s.structured.title} — ${s.structured.intro}` : s.taskDe.slice(0, 90);
  const savedLabelExam = (s: SavedExercise) => {
    const t = teilOf(s.examId || '', s.topicId);
    return `${t ? t.titleDe : s.topicId} — ${s.structured ? s.structured.title : s.taskDe.slice(0, 60)}`;
  };

  // برگهٔ چاپ A4: سؤال (ساخت‌یافته یا متنی) + خط‌کشی برای نوشتن با خودکار (درخواست کاربر)
  const printQuestions = promptData ? (
    <div>
      {promptData.structured ? (
        <>
          <div style={prG({ fontSize: 15, fontWeight: 800, marginBottom: 10 })}>{promptData.structured.title}</div>
          <div style={prG({ fontSize: 12.5, fontWeight: 700, marginBottom: 8 })}>{promptData.structured.aufgabe}</div>
          <div style={prG({ fontSize: 12.5, marginBottom: 8 })}>{promptData.structured.intro}</div>
          <div style={prG({ fontSize: 12.5, fontStyle: 'italic', lineHeight: 1.9, border: '1px solid #bbb', borderRadius: 8, padding: '10px 12px', background: '#f6f6f6', marginBottom: 12 })}>{promptData.structured.quote}</div>
          <div style={prG({ fontSize: 12.5, fontWeight: 700, marginBottom: 6 })}>{promptData.structured.instrBold}</div>
          {promptData.structured.instrRest.map((l, i) => <div key={i} style={prG({ fontSize: 12.5, marginBottom: 4 })}>{l}</div>)}
        </>
      ) : (
        <div style={prG({ fontSize: 12.5, whiteSpace: 'pre-wrap', lineHeight: 1.8 })}>{promptData.taskDe}</div>
      )}
      {promptData.sourceText && (
        <div style={prG({ fontSize: 11.5, whiteSpace: 'pre-wrap', lineHeight: 1.8, border: '1px solid #bbb', borderRadius: 8, padding: '8px 10px', background: '#fafafa', marginTop: 10 })}>{promptData.sourceText}</div>
      )}
      <div style={prFa({ fontSize: 10.5, color: '#555', margin: '18px 0 8px' })}>✍️ پاسخ خودت را خط‌به‌خط بنویس:</div>
      {/* خط‌کشی ۹ میلی‌متری — در چاپ تا انتهای صفحهٔ A4 پر می‌شود (<WriteLines/> در trainerUI) */}
      <WriteLines gapMm={9} screenHeight={560} />
    </div>
  ) : null;

  return (
    <div className="space-y-4 text-right">
      {exam && (
        <div className="flex items-center justify-between p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200">
          <b className="text-sm">✍️ Schreiben — {exam.org} {exam.level}</b>
          {secondsLeft >= 0 && !report && <span className="px-3 py-1 rounded-xl bg-white border border-amber-200 text-amber-800 text-xs font-mono font-bold">⏱ {fmt(secondsLeft)}</span>}
        </div>
      )}

      {isExamMode && (
        <div className="p-4 rounded-2xl bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] space-y-3">
          {/* صفحهٔ انتخاب سطح/نوع آزمون — تا وقتی تمرینی باز نشده (خروج از تمرین به همین‌جا برمی‌گردد) */}
          {!exam && !promptData && (
            <>
              <div className="text-sm font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">🎯 انتخاب سطح و نوع آزمون Schreiben</div>
              {levelButtons}
              {/* نوع آزمون: کشویی بازشونده — گزینهٔ آخر «تمرین آزاد» با رفتار قبلی (درخواست کاربر) */}
              <div className="text-xs font-bold text-slate-600 dark:text-slate-300">🏫 نوع آزمون Schreiben:</div>
              <select value={examType} onChange={e => { setExamType(e.target.value); setSelectedTeil(''); }}
                className="w-full bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none">
                {EXAM_PROFILES.map(p => <option key={p.id} value={p.id}>{p.nameFa} — {p.nameDe}</option>)}
                <option value="free">تمرین آزاد — انتخاب موضوع دلخواه</option>
              </select>
              {examType === 'free' ? (
                <>
                  {/* تمرین آزاد: انتخاب موضوع — بدون ساخت خودکار (رفع ایراد ۲) */}
                  <select value={selectedTopic} onChange={e => setSelectedTopic(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none">
                    <option value="">-- موضوع آزمون را انتخاب کنید --</option>
                    {SCHREIBEN_TOPICS.map(t => <option key={t.id} value={t.id}>{t.title} ({t.level})</option>)}
                  </select>
                  {savedListBlock(savedForPick, '📚 تمرین‌های قبلی — همین سطح و موضوع',
                    !selectedTopic ? 'اول سطح و موضوع را انتخاب کن تا تمرین‌های قبلی‌اش اینجا لیست شود.' : 'هنوز برای این سطح و موضوع تمرینی ذخیره نشده — با «🔄 ساخت سناریوی تازه» اولین را بساز.',
                    savedLabelFree)}
                </>
              ) : teilList.length ? (
                <>
                  {/* تمرین‌های همان آزمون مثل برگهٔ واقعی — یکی را انتخاب کن و بساز */}
                  <div className="text-xs font-bold text-slate-600 dark:text-slate-300">📝 تمرین‌های Schreiben در سطح {targetLevel} — مثل آزمون واقعی، یکی را انتخاب کن:</div>
                  <div className="space-y-2">
                    {teilList.map(t => (
                      <button key={t.id} onClick={() => setSelectedTeil(t.id)}
                        className={`w-full text-right p-3 rounded-xl border transition ${selectedTeil === t.id ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700' : 'bg-slate-50 dark:bg-[#141923] border-slate-200 dark:border-slate-700 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30'}`}>
                        <div dir="ltr" className="text-left text-sm font-bold text-slate-800 dark:text-slate-100">{t.titleDe}</div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                          <span>{t.fa}</span>
                          <span>⏱ {toFa(t.minutes)} دقیقه</span>
                          <span dir="ltr">✍️ {t.wr} Wörter</span>
                        </div>
                      </button>
                    ))}
                  </div>
                  {savedListBlock(savedForExam, '📚 تمرین‌های قبلی — همین آزمون و همین سطح',
                    'هنوز برای این آزمون و سطح تمرینی ذخیره نشده — یک Teil را انتخاب کن و با «🔄 ساخت سناریوی تازه» بساز.',
                    savedLabelExam)}
                </>
              ) : (
                <div className="text-xs text-slate-600 dark:text-slate-300 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  برای این آزمون در سطح {targetLevel} تمرین Schreiben تعریف نشده — سطح دیگری انتخاب کن (پوشش فعلی: گوته A2 تا C1، ÖSD و telc در B1/B2، EPD در B2/C1).
                </div>
              )}
              {/* دکمه‌های هم‌اندازه و مرتب در یک ردیف — فقط با انتخاب، دستی می‌سازد (رفع ایراد ۲) */}
              <div className="grid grid-cols-2 gap-2.5">
                <button onClick={() => {
                  if (examType === 'free') { if (selectedTopic) void fetchTaskPrompt(selectedTopic); return; }
                  const t = teilList.find(x => x.id === selectedTeil);
                  if (t) void fetchExamPrompt(examType, targetLevel, t);
                }}
                  disabled={generatingPrompt || (examType === 'free' ? !selectedTopic : !selectedTeil)}
                  className="py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-200 font-bold text-sm transition disabled:opacity-40">
                  🔄 ساخت سناریوی تازه
                </button>
                <button onClick={() => setNoHelp(!noHelp)}
                  className={`py-2.5 rounded-xl border font-bold text-sm transition ${noHelp ? 'bg-rose-600 text-white border-rose-600' : 'bg-slate-50 hover:bg-slate-100 dark:bg-[#141923] dark:hover:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200'}`}>
                  🚫 حالت بدون کمک {noHelp ? '(روشن)' : ''}
                </button>
              </div>
            </>
          )}

          {generatingPrompt && <div className="text-sm text-indigo-600 dark:text-indigo-400 font-bold animate-pulse text-center py-2">⏳ در حال بارگذاری سناریو و نکات آزمون...</div>}

          {promptData && (
            <div className="p-4 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900 space-y-3 text-sm leading-7">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-bold text-indigo-900 dark:text-indigo-200">📋 صورت سوال (Aufgabenstellung)</div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="px-2.5 py-0.5 rounded-full bg-white dark:bg-[#141923] border border-indigo-200 dark:border-indigo-800 text-xs font-bold text-indigo-700 dark:text-indigo-300">{targetLevel}</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-white dark:bg-[#141923] border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-600 dark:text-slate-300 max-w-[180px] truncate">{activeExamLabel}</span>
                  {/* برگهٔ A4 قبل از پاسخ‌دادن هم ممکن است + خروج به صفحهٔ انتخاب */}
                  {!exam && (
                    <>
                      <button onClick={() => setPrintOpen(true)}
                        title="برگهٔ A4 — صورت سوال + خط‌کشی نوشتن"
                        aria-label="برگهٔ A4"
                        className="w-9 h-9 rounded-xl bg-[#1f5fbf] text-white flex items-center justify-center hover:bg-[#194ea0] transition"><Printer size={15} /></button>
                      <button onClick={exitExercise}
                        className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition">← خروج</button>
                    </>
                  )}
                </div>
              </div>
              {/* رندر مرتب مثل نمونهٔ رسمی: عنوان درشت → دستور پررنگ → مقدمه → Zitat ایتالیک در کادر جدا → خطوط دستور */}
              {promptData.structured ? (
                <div className="space-y-2.5">
                  <div dir="ltr" className="text-left font-sans text-lg font-extrabold text-slate-900 dark:text-white leading-8"><ClickableWords text={promptData.structured.title} onWord={setLookup} /></div>
                  <div dir="ltr" className="text-left font-sans font-bold text-slate-800 dark:text-slate-100"><ClickableWords text={promptData.structured.aufgabe} onWord={setLookup} /></div>
                  <div dir="ltr" className="text-left font-sans text-slate-700 dark:text-slate-300"><ClickableWords text={promptData.structured.intro} onWord={setLookup} /></div>
                  <div dir="ltr" className="text-left font-serif italic text-[15px] leading-8 text-slate-800 dark:text-slate-100 bg-white dark:bg-[#141923] p-3.5 rounded-xl border border-indigo-100 dark:border-indigo-900/50"><ClickableWords text={promptData.structured.quote} onWord={setLookup} /></div>
                  <div dir="ltr" className="text-left font-sans font-bold text-slate-800 dark:text-slate-100"><ClickableWords text={promptData.structured.instrBold} onWord={setLookup} /></div>
                  {promptData.structured.instrRest.map((line, i) => <div key={i} dir="ltr" className="text-left font-sans text-slate-700 dark:text-slate-300"><ClickableWords text={line} onWord={setLookup} /></div>)}
                </div>
              ) : (
                <div dir="ltr" className="font-sans font-bold text-base text-slate-800 dark:text-slate-100 text-left bg-white dark:bg-[#141923] p-3 rounded-lg border border-indigo-100 dark:border-indigo-900/50 whitespace-pre-wrap"><ClickableWords text={promptData.taskDe} onWord={setLookup} /></div>
              )}
              {promptData.sourceText && (
                <div className="space-y-1">
                  <div className="font-bold text-indigo-900 dark:text-indigo-200">📄 متن مبدأ (Ausgangstext):</div>
                  <div dir="ltr" className="font-sans text-sm text-slate-800 dark:text-slate-100 text-left bg-white dark:bg-[#141923] p-3 rounded-lg border border-indigo-100 dark:border-indigo-900/50 whitespace-pre-wrap"><ClickableWords text={promptData.sourceText} onWord={setLookup} /></div>
                </div>
              )}
              {!limited && (showFa ? (
                <>
                  <div className="text-slate-700 dark:text-slate-300">{promptData.taskFa}</div>
                  {promptData.points.length > 0 && (
                    <div className="pt-1"><span className="font-bold">نکات کلیدی برای نوشتن:</span>
                      <ul className="list-disc list-inside space-y-1 mt-1 text-slate-600 dark:text-slate-400">{promptData.points.map((pt, i) => <li key={i}>{pt}</li>)}</ul>
                    </div>
                  )}
                </>
              ) : <button onClick={() => setShowFa(true)} className="text-xs font-bold text-[#1f5fbf]">👁 نمایش توضیح فارسی</button>)}
              {/* درخواست کاربر: ته کارت، دکمهٔ ایده برای وقتی چیزی برای گفتن ندارد */}
              {!exam && (
                <div className="pt-1 space-y-3">
                  <button onClick={() => void fetchIdeas()} disabled={ideasBusy}
                    className="w-full py-2.5 rounded-xl bg-white dark:bg-[#141923] hover:bg-amber-50 dark:hover:bg-amber-950/30 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 font-bold text-sm transition disabled:opacity-40">
                    {ideasBusy ? '⏳ در حال گرفتن ایده‌ها...' : '💡 ایده نداری؟ چند ایده بده'}
                  </button>
                  {ideas && ideas.length > 0 && (
                    <div className="p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-2">
                      <div className="font-bold text-amber-900 dark:text-amber-200">💡 این ایده‌ها را می‌توانی بنویسی:</div>
                      <ol className="list-decimal list-inside space-y-2.5">
                        {ideas.map((it, i) => (
                          <li key={i}>
                            <div dir="ltr" className="text-left font-serif italic text-slate-800 dark:text-slate-100 leading-7"><ClickableWords text={it.de} onWord={setLookup} /></div>
                            {!limited && it.fa && <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{it.fa}</div>}
                          </li>
                        ))}
                      </ol>
                      <button onClick={() => void fetchIdeas()} disabled={ideasBusy} className="text-xs font-bold text-amber-800 dark:text-amber-300 disabled:opacity-40">🔄 ایده‌های تازه</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!exam && (!isExamMode || promptData) && (
        <div className="p-4 rounded-2xl bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] space-y-3">
          <div className="text-sm font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">📸 ارسال عکس دست‌نویس یا فایل (چند صفحه)</div>
          {!isExamMode && levelButtons}
          <p className="text-sm text-[#5d6676] dark:text-[#a3adbd]">می‌توانی از متن دست‌نویس خودت عکس بگیری، تصویر از گالری/سیستم انتخاب کنی یا متن را پایین تایپ کنی.</p>
          <div className="grid grid-cols-2 gap-2.5">
            <button type="button" onClick={() => cameraInputRef.current?.click()} className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800 font-bold text-sm transition"><Camera size={18} /><span>عکس با دوربین</span></button>
            <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800 font-bold text-sm transition"><ImagePlus size={18} /><span>انتخاب عکس / فایل</span></button>
          </div>
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFilesSelected} className="hidden" />
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFilesSelected} className="hidden" />
          {pendingCrop && (
            <ImageCropper
              src={pendingCrop.dataUrl}
              title={`برش تصویر (${images.length + 1}/${images.length + 1 + pendingCrop.rest.length})`}
              onCancel={() => { pushImage(pendingCrop.dataUrl); setPendingCrop(c => advanceCrop(c)); }}
              onConfirm={cropped => { pushImage(cropped); setPendingCrop(c => advanceCrop(c)); }}
            />
          )}
          {images.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2">
              {images.map((img, idx) => (
                <div key={idx} className="relative rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800">
                  <img src={img.dataUrl} alt={`صفحه ${idx + 1}`} className="w-full h-32 object-cover" />
                  <button type="button" onClick={() => setImages(prev => prev.filter((_, i) => i !== idx))} className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-red-600 text-white flex items-center justify-center shadow-md" title="حذف تصویر"><Trash2 size={14} /></button>
                  <span className="absolute bottom-1 left-1.5 bg-black/65 text-white text-xs px-2 py-0.5 rounded-md font-bold">صفحه {idx + 1}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* باکس پاسخ + دکمهٔ تصحیح فقط در صفحهٔ تمرین (رفع ایراد ۱ — در صفحهٔ انتخاب نیست) */}
      {(!isExamMode || promptData) && (
        <textarea dir="ltr" rows={exam ? 12 : 6} value={text} onChange={e => setText(e.target.value)}
          placeholder={isExamMode ? 'Hier steht dein deutscher Text … (پاسخ آزمون را اینجا بنویسید)' : 'Hier steht dein deutscher Text … (در صورت تمایل متن را اینجا بنویسید یا فقط عکس بالا را بفرستید)'}
          className="w-full bg-slate-50 dark:bg-[#141923] border-2 border-[#1f5fbf] dark:border-[#7fb0ff] rounded-2xl px-4 py-3 font-sans text-base outline-none leading-relaxed shadow-xs" />
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(!isExamMode || promptData) && (
          <button onClick={() => void runCheck()} disabled={busy || (!text.trim() && images.length === 0)}
            className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] disabled:opacity-40 text-white px-6 py-3 rounded-xl text-sm font-bold flex items-center gap-2 shadow-md transition">
            {busy ? <><span className="inline-block animate-spin">⏳</span><span>در حال بررسی و تصحیح…</span></> : <span>{exam ? 'ثبت متن و ادامه ✓' : '🎓 تصحیح با معلم'}</span>}
          </button>
        )}
        {!exam && (report || images.length > 0 || text.trim()) && (
          <button onClick={() => { setReport(null); setText(''); setImages([]); setChat([]); setChatQ(''); }} className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-4 py-3 rounded-xl text-sm font-bold transition">🔄 شروع مجدد</button>
        )}
        {exam && wc(text) > 0 && <span className="text-xs text-[#5d6676]">{wc(text)} کلمه</span>}
      </div>

      {errMsg && <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">{errMsg}</div>}

      {report && !exam && (
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <span className={`px-4 py-1.5 rounded-xl text-sm font-extrabold shadow-xs ${report.score >= 80 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' : report.score >= 50 ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' : 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'}`}>
              نمره ارزیابی: {report.score}/100
            </span>
            {report.issues.length === 0 && report.score >= 80 && <span className="text-emerald-700 dark:text-emerald-300 text-sm font-bold">✅ متن کاملاً درست و استاندارد!</span>}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-bold">
            {(['content', 'structure', 'vocab', 'grammar'] as const).map((k, i) => (
              <div key={k} className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 flex justify-between"><span>{RUBRIC[rubricKey].labels[i]}</span><span dir="ltr">{report.criteria[k]}/25</span></div>
            ))}
          </div>

          {report.transcribed_de && (
            <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800/70 border border-slate-300 dark:border-slate-700 space-y-1.5">
              <div className="text-sm font-bold text-slate-700 dark:text-slate-200">📄 متن استخراج‌شده از تصویر شما:</div>
              <div dir="ltr" className="font-sans text-base text-slate-900 dark:text-slate-100 whitespace-pre-wrap leading-relaxed"><ClickableWords text={report.transcribed_de} onWord={setLookup} /></div>
            </div>
          )}

          {report.understood_fa && (
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] text-sm leading-7">
              <b className="text-[#1f5fbf] dark:text-[#7fb0ff]">🧠 برداشت آلمانی‌زبان از متن شما: </b>{report.understood_fa}
            </div>
          )}

          {report.issues.length > 0 && (
            <div className="space-y-2.5">
              <div className="text-sm font-extrabold text-[#1f5fbf] dark:text-[#7fb0ff]">📝 اشکالات یافت‌شده و اصلاحات (به دفتر خطاها اضافه شد):</div>
              {report.issues.map((it, i) => (
                <div key={i} className="p-3.5 rounded-2xl bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] space-y-2 shadow-xs">
                  <span className={`inline-block px-2.5 py-0.5 rounded-lg text-xs font-bold ${ISSUE_BADGE[it.type] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>{it.type}</span>
                  {(it.wrong || it.correct) && (
                    <div className="flex flex-wrap items-baseline gap-2 text-base" dir="ltr">
                      {it.wrong && <span className="font-sans font-bold text-red-600 dark:text-red-400 line-through"><ClickableWords text={it.wrong} onWord={setLookup} /></span>}
                      {it.wrong && it.correct && <span className="text-slate-400">→</span>}
                      {it.correct && <span className="font-sans font-bold text-emerald-700 dark:text-emerald-300"><ClickableWords text={it.correct} onWord={setLookup} /></span>}
                    </div>
                  )}
                  {it.why_fa && <div className="text-sm leading-7 text-[#5d6676] dark:text-[#a3adbd]">{it.why_fa}</div>}
                </div>
              ))}
            </div>
          )}

          {report.tip_fa && (
            <div className="p-3.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 text-sm leading-7">
              <b className="text-indigo-700 dark:text-indigo-300">💡 پیشنهاد برای بهبود سبک و نمره: </b>{report.tip_fa}
            </div>
          )}

          {report.corrected_de && (
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 space-y-2">
              <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300">✅ نسخه اصلاح‌شده و طبیعی:</div>
              <div dir="ltr" className="font-sans font-bold text-base text-slate-900 dark:text-slate-100 leading-relaxed whitespace-pre-wrap"><ClickableWords text={report.corrected_de} onWord={setLookup} /></div>
              <button onClick={() => setShadowOpen(true)} className="mt-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition flex items-center gap-1.5 shadow-xs">🎙 تمرین تلفظ این متن</button>
            </div>
          )}

          {shadowOpen && (
            <ErrorBoundary label="تمرین تلفظ">
              <ShadowingModal freeText={report.corrected_de} onClose={() => setShadowOpen(false)} />
            </ErrorBoundary>
          )}

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="text-sm font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">💬 سوالی درباره ساختار این متن یا اصطلاحاتش داری؟ بپرس:</div>
            {chat.map((m, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex justify-start"><div className="max-w-[85%] bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-2xl rounded-se-sm px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100">{m.q}</div></div>
                <div className="flex justify-end"><div className={`max-w-[92%] rounded-2xl rounded-ss-sm px-3.5 py-2.5 text-sm leading-7 whitespace-pre-wrap border ${m.err ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300' : 'bg-white dark:bg-[#141923] border-[#dde1ea] dark:border-[#333b4a] text-slate-800 dark:text-slate-100'}`}>{m.a}</div></div>
              </div>
            ))}
            <div className="flex items-end gap-2">
              <textarea dir="rtl" rows={2} value={chatQ} onChange={e => setChatQ(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && window.innerWidth >= 768) { e.preventDefault(); void askChat(); } }}
                placeholder="سوالت را درباره گرامر یا واژگان بنویس…"
                className="flex-1 bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-sm outline-none resize-none" />
              <button onClick={() => void askChat()} disabled={chatBusy || !chatQ.trim()} className="bg-[#1f5fbf] hover:bg-[#194ea0] disabled:opacity-40 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition">{chatBusy ? '⏳' : '➤ ارسال'}</button>
            </div>
          </div>
        </div>
      )}

      {/* پیش‌نمایش A4 — سؤال با خط‌کشی برای نوشتن، همان سبک تب گرامر */}
      {promptData && (
        <PrintPreview
          open={printOpen}
          onClose={() => setPrintOpen(false)}
          title="Schreiben — Übungsblatt"
          meta={`${targetLevel} • ${activeExamLabel} • ${faDate(Date.now())} • نام: ...........................`}
          questions={printQuestions}
          hint="پیش‌نمایش برگهٔ A4 — سؤال بالای برگه و خط‌کشی برای نوشتن"
        />
      )}

      {/* پاپ‌آپ واژهٔ لمس‌شده — مشترک در صورت سوال، متن مبدأ، ایده‌ها و تصحیح‌ها */}
      {lookup && (
        <WordLookupModal
          word={lookup}
          level={targetLevel}
          cat="Schreiben"
          onQuickAddWord={onQuickAddWord}
          words={words}
          onViewWord={onViewWord}
          onClose={() => setLookup(null)}
        />
      )}
    </div>
  );
};
