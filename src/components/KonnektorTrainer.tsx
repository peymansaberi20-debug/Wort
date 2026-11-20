/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * KonnektorTrainer.tsx — «متن جای‌خالی» با حروف ربط (Lückentext mit Konnektoren)
 *
 * امکانات:
 *  - ساخت تمرین با هوش مصنوعی هر بار: کاربر «سطح» (A1–C2)، «تعداد جای خالی» و موضوع (اختیاری)
 *    را انتخاب می‌کند و AI یک متن تازه با همان منطق (جای‌خالی + استخر کلمات با ۲ تله) می‌سازد.
 *  - جای‌گذاری با کشیدن‌ورها (Drag & Drop) یا کلیک روی کلمه و بعد جای خالی — مثل برگهٔ کاغذی.
 *  - تصحیح فوری: سبز/قرمز، نمایش پاسخ درست زیر پاسخ غلطِ خط‌خورده، پاک‌کردن تک‌جای خالی.
 *  - 💬 چت با معلم دربارهٔ همین متن (با حافظهٔ گفتگو) — ذخیره‌شده در آرشیو.
 *  - 🗂 آرشیو: همهٔ تمرین‌های ساخته‌شده (با سطح، موضوع و چت‌ها) در localStorage — همان کلید قبلی،
 *    پس تمرین‌های قدیمیِ ذخیره‌شده از قبل باقی می‌مانند.
 *  - 🖨 چاپ دو صفحه‌ای سازگار با iOS Safari: صفحهٔ ۱ تمرین + استخر کلمات، صفحهٔ ۲ پاسخنامه.
 *
 * پل هوش مصنوعی: کلید و مدل از تنظیمات برنامه (src/utils/aiProvider) می‌آید — بدون کلید،
 * ساخت تمرین و چت غیرفعال است ولی تمرین‌های آرشیو شده همچنان قابل اجرا هستند.
 */

import React, { useState, useEffect, useRef } from 'react';
import { describeAiError, generateText, hasApiKey, getActiveProvider, getModel, getAiDebugInfo } from '../utils/aiProvider';
import { Lvl, LVL_ORDER, LVL_INFO } from '../data/konnektorenData';

interface KonnektorTrainerProps {
  onClose: () => void;
  onShowToast: (msg: string, isErr?: boolean) => void;
}

interface KonnektorBlank { id: number; answer: string }
interface ChatMsg { role: 'user' | 'ai'; text: string }

interface KonnektorItem {
  id: string;
  title: string;
  text: string; // شامل جای‌خالی‌های (1)، (2) یا _____ یا [1]/{1}
  blanks: KonnektorBlank[];
  pool: string[]; // پاسخ‌های درست + ۲ تله
  level?: string;
  topic?: string;
  chats?: ChatMsg[];
}

const STORAGE_KEY = 'wb_konnektor_archive_v1'; // همان کلید قبلی — آرشیو قبلی حفظ می‌شود
const COUNTS = [5, 8, 10, 12];
const TOPIC_CHIPS = ['Alltag', 'Beruf', 'Reise', 'Umwelt', 'Technik', 'Gesundheit'];
const QUICK_QS = ['چرا این‌طور درست است؟', 'قاعدهٔ جایگاه فعل را بگو', 'یک مثال مشابه بده', 'فرق wenn و als چیست؟'];

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const toFa = (n: number | string): string => String(n).replace(/[0-9]/g, (d) => FA_DIGITS[+d]);

const DEFAULT_EXERCISES: KonnektorItem[] = [
  {
    id: 'konn-1',
    title: 'Übung 1: Konnektoren im Beruf',
    text: '_____ mein Freund endlich einen Ausbildungsplatz hatte, war er sehr froh. Er wusste nicht mehr genau, _____ er seine Bewerbung abgeschickt hatte. _____ er das erste Mal seinen Chef sah, war er aufgeregt. Es dauerte ein paar Wochen, _____ er alleine Aufgaben übernehmen konnte. _____ er jetzt an seine Anfangszeit zurückdenkt, ist er glücklich, dass er es geschafft hat. Es war damals sehr froh, _____ er sein erstes Gehalt bekam. _____ er seine Ausbildung in dieser Firma macht, wirkt er selbstbewusster als früher. Es dauert noch zwei Jahre, _____ er mit seiner Ausbildung fertig sein wird.',
    blanks: [
      { id: 1, answer: 'Als' },
      { id: 2, answer: 'wann' },
      { id: 3, answer: 'Als' },
      { id: 4, answer: 'bis' },
      { id: 5, answer: 'Wenn' },
      { id: 6, answer: 'seit' },
      { id: 7, answer: 'Weil' },
      { id: 8, answer: 'bevor' }
    ],
    pool: ['Als', 'wann', 'bis', 'Wenn', 'seit', 'Weil', 'bevor', 'obwohl', 'während'],
    level: 'B1',
    topic: 'Beruf',
    chats: []
  }
];

/* ───────────── پل هوش مصنوعی برنامه (کلید از تنظیمات) ───────────── */

const askJsonAI = async (prompt: string): Promise<string> => generateText(prompt, { json: true, timeoutMs: 90000, retries: 1 });
const askChatAI = async (prompt: string): Promise<string> => generateText(prompt, { timeoutMs: 60000, retries: 1 });
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
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) { out = tryParse(s.slice(a, b + 1)); if (out) return out; }
  throw new Error('AI_PARSE');
}

/* ───────────── پرامپت ساخت تمرین — سطح‌دار ───────────── */

const KONN_LIST = (level: string): string =>
  level === 'A1'
    ? 'und, aber, oder, dann, wann, wenn, als (Vergangenheit), bis'
    : level === 'A2'
      ? 'und, aber, oder, denn, weil, dass, wenn, als, wann, bis, bevor'
      : level === 'B1'
        ? 'als, wenn, wann, während, bevor, nachdem, bis, seit, weil, dass, obwohl, damit, deshalb, darum, trotzdem'
        : level === 'B2'
          ? 'obwohl, während, bevor, nachdem, seit, bis, sodass, deshalb, darum, trotzdem, dennoch, einerseits … andererseits'
          : 'obwohl, sodass, infolgedessen, infolge + Genitiv, anhand + Genitiv, je … desto, zum einen … zum anderen, einerseits … andererseits, während (Kontrast)';

const buildPrompt = (level: string, count: number, topic: string): string =>
  `Du bist ein erfahrener Deutschlehrer und erstellst ein Lückentext-Arbeitsblatt «Konnektoren».
Niveau: ${level}. Thema: ${topic.trim() || 'Alltag, Beruf und Studium'}.
Erstelle einen zusammenhängenden, interessanten Text (eine kleine Geschichte, ${count + 2}–${count + 6} Sätze) mit GENAU ${count} Lücken.
Die Lücken im Text werden als (1) (2) (3) ... markiert.
Jede Lücke testet genau einen Konnektor aus dieser Niveau-Liste (abwechselnd, jede Lösung höchstens einmal): ${KONN_LIST(level)}.
Die Lösungen müssen eindeutig sein — genau eine Option aus dem Pool passt sinnvoll in die Lücke.
Der "pool" enthält ALLE Lösungen plus GENAU 2 weitere Konnektoren aus der Liste als Fangantworten (Distraktoren).
Gib NUR JSON zurück: {"title":"Kurzer deutscher Titel","text":"Text mit (1) (2) ...","blanks":[{"id":1,"answer":"..."}],"pool":["alle Lösungen + 2 Fallen"]}`;

/* ───────────── چت معلم ───────────── */

/** متن با پاسخ‌های درست در [کروشه] — زمینهٔ چت */
const completedText = (ex: KonnektorItem): string => {
  const parts = ex.text.split(/_{3,}|\(\s*\d+\s*\)|\[\s*\d+\s*\]|\{\s*\d+\s*\}/g);
  return parts.map((p, i) => p + (i < parts.length - 1 && ex.blanks[i] ? ` [${ex.blanks[i].answer}]` : '')).join('');
};

const buildChatPrompt = (ex: KonnektorItem, q: string, convo: ChatMsg[]): string =>
  `Du bist ein geduldiger Deutschlehrer. Niveau: ${ex.level || 'B1'}.
Kontext — Lückentext-Arbeitsblatt «${ex.title}». Der Text mit den Lösungen in [Klammern]:
"${completedText(ex)}"
${convo.length ? 'Bisheriges Gespräch:\n' + convo.map((m) => (m.role === 'user' ? 'Lerner: ' : 'Lehrer: ') + m.text).join('\n') + '\n' : ''}Frage des Lerners: ${q}
Antworte kurz und klar auf Persisch (Farsi); Fachbegriffe und Beispiele auf Deutsch.`;

/**
 * استایل چاپ: در حالت screen، ناحیهٔ چاپ پنهان است؛ در حالت print،
 * کل UI تعاملی پنهان می‌شود و دو صفحه نمایش داده می‌شود:
 *   صفحه ۱: متن تمرین با جای‌خالی‌های شماره‌دار + استخر کلمات
 *   صفحه ۲: پاسخ‌نامه
 *
 * نکات iOS Safari:
 *   - page-break-after: always و معادل مدرن break-after: page هر دو نوشته شده‌اند.
 *   - display: none برای پنهان‌کردن در Safari مدرن پشتیبانی می‌شود.
 *   - @page size A4 با margin مشخص برای اطمینان از جا شدن در یک صفحه.
 *   - position static (نه fixed/absolute) تا Safari ارتفاع را درست محاسبه کند.
 */
const PRINT_CSS = `
@media screen {
  .konn-print-area { display: none !important; }
}
@media print {
  @page { size: A4; margin: 1.4cm 1.6cm; }
  html, body { background: #fff !important; }
  .konn-interactive { display: none !important; }
  .konn-print-area {
    display: block !important;
    position: static !important;
    margin: 0 !important;
    padding: 0 !important;
    color: #000 !important;
    font-family: Georgia, 'Times New Roman', 'Noto Serif', serif !important;
  }
  .konn-print-exercise {
    page-break-after: always;
    break-after: page;
  }
  .konn-print-title {
    direction: ltr;
    text-align: left;
    font-size: 14pt;
    font-weight: 700;
    margin: 0 0 8pt 0;
    color: #000;
  }
  .konn-print-sub {
    direction: rtl;
    text-align: right;
    font-size: 10pt;
    color: #444;
    margin: 0 0 10pt 0;
    font-family: 'Tahoma', 'Vazirmatn', sans-serif;
  }
  .konn-print-text {
    direction: ltr;
    text-align: left;
    font-size: 12pt;
    line-height: 1.7;
    color: #000;
    white-space: normal;
    word-wrap: break-word;
  }
  .konn-print-blank {
    display: inline-block;
    min-width: 64px;
    border-bottom: 1.5px solid #000;
    text-align: center;
    font-weight: 700;
    font-size: 11pt;
    color: #000;
    margin: 0 2px;
    padding: 0 4px;
    line-height: 1.4;
  }
  .konn-print-pool {
    direction: ltr;
    text-align: left;
    margin-top: 14pt;
    padding: 8pt 10pt;
    border: 1.2px solid #555;
    border-radius: 5px;
    font-size: 11pt;
    color: #000;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .konn-print-pool b { font-size: 11pt; }
  .konn-print-answers-title {
    direction: ltr;
    text-align: left;
    font-size: 14pt;
    font-weight: 700;
    margin: 0 0 8pt 0;
    color: #000;
  }
  .konn-print-answers-list {
    direction: ltr;
    text-align: left;
    font-size: 12pt;
    line-height: 1.9;
    color: #000;
    list-style: decimal;
    padding-left: 20pt;
    margin: 0;
  }
  .konn-print-answers-list li { margin-bottom: 3pt; }
  .konn-print-answers-list b { color: #000; }
  .konn-print-footer {
    direction: rtl;
    text-align: right;
    font-size: 9pt;
    color: #666;
    margin-top: 14pt;
    border-top: 1px solid #ccc;
    padding-top: 4pt;
    font-family: 'Tahoma', 'Vazirmatn', sans-serif;
  }
}
`;

export const KonnektorTrainer: React.FC<KonnektorTrainerProps> = ({ onClose, onShowToast }) => {
  const [exercises, setExercises] = useState<KonnektorItem[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return saved.length ? saved : DEFAULT_EXERCISES;
    } catch {
      return DEFAULT_EXERCISES;
    }
  });

  const [currentId, setCurrentId] = useState<string>(exercises[0]?.id || 'konn-1');
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [draggedWord, setDraggedWord] = useState<string | null>(null);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [generating, setGenerating] = useState(false);

  // پیکربندی ساخت تمرین جدید
  const [level, setLevel] = useState<Lvl>('B1');
  const [count, setCount] = useState(8);
  const [topic, setTopic] = useState('');

  // چت با معلم
  const [chatOpen, setChatOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const currentEx = exercises.find(e => e.id === currentId) || exercises[0];

  useEffect(() => {
    setUserAnswers({});
    setChecked(false);
    setChatOpen(false);
  }, [currentId]);

  useEffect(() => {
    if (chatOpen) setTimeout(() => chatEndRef.current?.scrollIntoView({ block: 'end' }), 120);
  }, [chatOpen, currentEx?.chats]);

  const saveArchive = (list: KonnektorItem[]) => {
    setExercises(list);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 40)));
    } catch {
      /* ignore */
    }
  };

  const handleGenerateNew = async () => {
    if (generating) return;
    if (!hasAIKey()) {
      onShowToast('هوش مصنوعی در تنظیمات برنامه فعال نیست — از صفحهٔ تنظیمات کلید را وارد و ذخیره کن.', true);
      return;
    }
    setGenerating(true);
    try {
      const raw = await askJsonAI(buildPrompt(level, count, topic));
      const res = parseJSONLoose<{ title?: string; text?: string; blanks?: { id?: number; answer?: string }[]; pool?: unknown[] }>(raw);

      // اعتبارسنجی و یکسان‌سازی متن و blanks:
      // 1) تمام مارکرها را به شکل استاندارد (N) تبدیل می‌کنیم
      let uIdx = 0;
      const normalizedText = (res.text || '')
        .replace(/_{3,}/g, () => `(${++uIdx})`) // هر _____ پشت‌سرهم شمارهٔ ترتیبی می‌گیرد
        .replace(/\[\s*(\d+)\s*\]/g, '($1)')
        .replace(/\{\s*(\d+)\s*\}/g, '($1)');
      // شمارش جای‌خالی‌های واقعی در متن نرمال‌شده
      const blankMatches = normalizedText.match(/\(\s*\d+\s*\)/g) || [];
      if (!blankMatches.length) throw new Error('متن ساخته‌شده جای‌خالی نداشت — دوباره تلاش کن.');
      let blanks = Array.isArray(res.blanks) ? res.blanks.map((b, i) => ({
        id: typeof b?.id === 'number' ? b.id : i + 1,
        answer: String(b?.answer || '').trim()
      })).filter(b => b.answer) : [];

      // اگر تعداد blanks کمتر از تعداد جای‌خالی متن باشد، مابقی را با جای‌خالی خالی پر می‌کنیم
      // اگر بیشتر باشد، اضافه‌ها نادیده گرفته می‌شوند
      if (blanks.length < blankMatches.length) {
        for (let i = blanks.length; i < blankMatches.length; i++) {
          blanks.push({ id: i + 1, answer: '—' });
        }
      }

      // pool: حتماً همهٔ پاسخ‌های درست داخلش باشند (سپس تله‌های AI)
      const answers = blanks.map(b => b.answer).filter(a => a !== '—');
      const pool = Array.from(new Set([
        ...answers,
        ...(Array.isArray(res.pool) ? res.pool.map(x => String(x)).filter(Boolean) : [])
      ]));

      const newItem: KonnektorItem = {
        id: 'konn-' + Date.now(),
        title: res.title || 'Neue Konnektoren-Übung',
        text: normalizedText,
        blanks,
        pool,
        level,
        topic: topic.trim(),
        chats: []
      };

      const updated = [newItem, ...exercises];
      saveArchive(updated);
      setCurrentId(newItem.id);
      onShowToast(`تمرین جدید با ${blankMatches.length} جای خالی ساخته شد ✓`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      onShowToast(msg && /[\u0600-\u06FF]/.test(msg) ? msg : aiErr(e), true);
    } finally {
      setGenerating(false);
    }
  };

  /* ── چت با معلم ── */
  const pushChatMsg = (m: ChatMsg) => {
    if (!currentEx) return;
    saveArchive(exercises.map(ex => ex.id === currentEx.id
      ? { ...ex, chats: [...(ex.chats || []), m] }
      : ex));
  };

  const sendChat = async (text: string) => {
    if (!currentEx || chatBusy) return;
    const q = text.trim();
    if (!q) return;
    if (!hasAIKey()) {
      onShowToast('هوش مصنوعی در تنظیمات برنامه فعال نیست — از صفحهٔ تنظیمات کلید را وارد و ذخیره کن.', true);
      return;
    }
    const hist0 = currentEx.chats || [];
    setChatBusy(true);
    setChatDraft('');
    pushChatMsg({ role: 'user', text: q });
    try {
      const ans = await askChatAI(buildChatPrompt(currentEx, q, hist0));
      pushChatMsg({ role: 'ai', text: ans.trim() });
    } catch (e) {
      onShowToast(aiErr(e), true);
      // پیام ناموفق کاربر حذف می‌شود و متنش برمی‌گردد به ورودی
      saveArchive(exercises.map(ex => ex.id === currentEx.id
        ? { ...ex, chats: (ex.chats || []).filter(m => !(m.role === 'user' && m.text === q)) }
        : ex));
      setChatDraft(q);
    } finally {
      setChatBusy(false);
    }
  };

  const handleDrop = (blankId: number, word: string) => {
    setUserAnswers(prev => ({ ...prev, [blankId]: word }));
    setDraggedWord(null);
    setSelectedWord(null);
  };

  const handleBlankClick = (blankId: number) => {
    if (selectedWord) {
      handleDrop(blankId, selectedWord);
    }
  };

  const handlePrint = () => {
    // iOS Safari نیاز به تأخیر کوتاه دارد تا استایل چاپ در DOM قرار گیرد و layout محاسبه شود.
    // ۵۰ms کافی است و تأخیر قابل‌ملاحظه‌ای برای کاربر ایجاد نمی‌کند.
    setTimeout(() => {
      window.print();
    }, 50);
  };

  // تفکیک متن و جای‌گذاری باکس‌ها
  // پشتیبانی از انواع مارکر جای‌خالی:
  //   _____  (هر تعداد خط‌زیر ≥ ۳)
  //   (1) (2) ...   |   [1] [2] ...   |   {1} {2} ...
  const renderInteractiveText = () => {
    const parts = currentEx.text.split(/_{3,}|\(\s*\d+\s*\)|\[\s*\d+\s*\]|\{\s*\d+\s*\}/g);
    // شمارش تعداد جای‌خالی واقعی که regex پیدا کرده (تعداد cut‌ها + ۱)
    const blankCount = parts.length - 1;
    // استفاده از blanks تا حد موجود؛ اگر کمتر از تعداد جای‌خالی بود، باکس اضافی رندر نشود
    const usableBlanks = currentEx.blanks.slice(0, blankCount);

    return (
      <div
        className="text-lg md:text-xl font-sans leading-loose text-slate-900 dark:text-slate-100"
        dir="ltr"
        style={{ textAlign: 'left' }}
      >
        {parts.map((part, index) => {
          const blankId = index + 1;
          const hasBlank = index < usableBlanks.length;
          if (!hasBlank) {
            return <span key={index} className="inline-block">{part}</span>;
          }
          const correctAnswer = usableBlanks[index].answer;
          const filled = userAnswers[blankId];
          const isCorrect = checked && filled?.trim().toLowerCase() === correctAnswer.toLowerCase();
          const showCorrect = checked && !isCorrect;

          return (
            <React.Fragment key={index}>
              <span className="inline-block">{part}</span>
              <span
                onClick={() => handleBlankClick(blankId)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => draggedWord && handleDrop(blankId, draggedWord)}
                className={`inline-flex items-center justify-center min-w-[90px] h-9 mx-1 px-3 rounded-xl border-2 font-bold text-base cursor-pointer transition align-middle ${
                  checked
                    ? isCorrect
                      ? 'bg-emerald-100 border-emerald-500 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
                      : 'bg-red-100 border-red-500 text-red-900 dark:bg-red-950 dark:text-red-200'
                    : filled
                    ? 'bg-blue-50 border-[#1f5fbf] text-[#1f5fbf] dark:bg-blue-950/60 dark:text-blue-300'
                    : 'bg-slate-100 dark:bg-slate-800 border-dashed border-slate-300 dark:border-slate-700 text-slate-400'
                }`}
              >
                {checked && !isCorrect && filled ? (
                  // نمایش پاسخ غلط خط‌خورده + پاسخ درست زیر آن
                  <span className="flex flex-col items-center leading-tight">
                    <span className="line-through opacity-70">{filled}</span>
                    <span className="text-emerald-700 dark:text-emerald-300 font-bold">→ {correctAnswer}</span>
                  </span>
                ) : checked && !isCorrect ? (
                  <span className="text-emerald-700 dark:text-emerald-300">→ {correctAnswer}</span>
                ) : (
                  filled || `(${blankId})`
                )}
              </span>
              {/* دکمهٔ پاک‌کردن این جای‌خالی (فقط قبل از تصحیح) */}
              {filled && !checked && (
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    setUserAnswers(prev => { const n = { ...prev }; delete n[blankId]; return n; });
                  }}
                  className="text-xs text-red-500 hover:text-red-700 font-bold mr-1"
                  title="پاک کردن این پاسخ"
                >
                  ✕
                </button>
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  /**
   * نسخهٔ چاپ متن: جای‌خالی‌ها به‌صورت (۱)، (۲)، ... با خط زیر نشان داده می‌شوند.
   * این نسخه در screen پنهان است و فقط هنگام print نمایش داده می‌شود.
   */
  const renderPrintText = () => {
    const parts = currentEx.text.split(/_{3,}|\(\s*\d+\s*\)|\[\s*\d+\s*\]|\{\s*\d+\s*\}/g);
    const blankCount = parts.length - 1;
    const usableBlanks = currentEx.blanks.slice(0, blankCount);

    return (
      <div className="konn-print-text">
        {parts.map((part, index) => {
          const blankId = index + 1;
          const hasBlank = index < usableBlanks.length;
          if (!hasBlank) {
            return <span key={index}>{part}</span>;
          }
          return (
            <React.Fragment key={index}>
              <span>{part}</span>
              <span className="konn-print-blank">({blankId})</span>
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  const chatMsgs = currentEx.chats || [];

  return (
    <div className="space-y-4 text-right max-w-2xl mx-auto pb-10" dir="rtl">
      {/* استایل چاپ — در DOM باقی می‌ماند تا Safari در print هم آن را اعمال کند */}
      <style>{PRINT_CSS}</style>

      {/* هدر مشابه سایر بخش‌ها */}
      <div className="konn-interactive bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl px-4 py-2.5 flex items-center justify-between gap-2 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="text-xl">📝</span>
          <span className="font-extrabold text-sm md:text-base text-slate-900 dark:text-slate-100">
            متن جای‌خالی (Konnektoren)
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handlePrint}
            className="bg-slate-700 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-xs"
            title="چاپ تمرین + پاسخنامه (دو صفحه)"
          >
            🖨️ چاپ
          </button>
          <button onClick={onClose} className="text-sm bg-slate-200 dark:bg-slate-800 px-3 py-1.5 rounded-xl font-semibold">
            ✕ خروج
          </button>
        </div>
      </div>

      {/* پیکربندی: سطح + تعداد جای خالی + موضوع → ساخت تمرین جدید با AI */}
      <div className="konn-interactive bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 space-y-3 shadow-xs">
        <div className="text-sm font-bold text-slate-700 dark:text-slate-300">✨ ساخت تمرین جدید با هوش مصنوعی</div>

        {/* وضعیت هوش مصنوعی — کلید از تنظیمات برنامه */}
        <div className={`rounded-xl border px-3 py-2 text-xs font-bold leading-5 ${
          hasAIKey()
            ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
            : 'border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
        }`}>
          {hasAIKey()
            ? <>🤖 متصل: <b dir="ltr">{aiLabel()}</b> — کلید از «{getAiDebugInfo().source}» خوانده شد.</>
            : <>🔌 هوش مصنوعی در تنظیمات برنامه فعال نشده — بدون کلید ساخت تمرین و چت کار نمی‌کند؛ از صفحهٔ تنظیمات کلید را وارد و <b>ذخیره</b> کن. تمرین‌های آرشیو شده همچنان قابل اجرا هستند.
                <span className="block text-[10px] font-normal mt-0.5 opacity-80">چک فنی: {getAiDebugInfo().source}</span></>}
        </div>

        {/* سطح */}
        <div>
          <div className="text-xs font-bold text-[#5d6676] dark:text-[#a3adbd] mb-1.5">۱. سطح — حروف ربط و واژگان فقط از همین سطح</div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {LVL_ORDER.map(l => (
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
          <p className="text-[11px] text-[#5d6676] dark:text-[#a3adbd] mt-2 leading-5">{LVL_INFO[level].label}</p>
        </div>

        {/* تعداد جای خالی */}
        <div>
          <div className="text-xs font-bold text-[#5d6676] dark:text-[#a3adbd] mb-1.5">۲. تعداد جای خالی</div>
          <div className="flex gap-2 flex-wrap">
            {COUNTS.map(n => (
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
          <div className="text-xs font-bold text-[#5d6676] dark:text-[#a3adbd] mb-1.5">۳. موضوع (اختیاری)</div>
          <input
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="مثلاً: Beruf, Reise, Umwelt … (خالی = موضوع آزاد)"
            className="w-full border-2 border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-[#141923] outline-none"
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {TOPIC_CHIPS.map(t => (
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
          onClick={handleGenerateNew}
          disabled={generating}
          className="w-full bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white py-3 rounded-xl font-bold text-sm shadow-xs active:scale-[.99] transition disabled:opacity-50"
        >
          {generating ? '⏳ در حال ساخت…' : '✨ ساخت تمرین جدید'}
        </button>
      </div>

      {/* انتخابگر تمرین‌های آرشیو شده */}
      <div className="konn-interactive bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-slate-700 dark:text-slate-300">🗂 انتخاب از آرشیو ({toFa(exercises.length)}):</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold bg-blue-50 dark:bg-blue-950/40 text-[#1f5fbf] dark:text-blue-300 rounded-full px-2 py-0.5">
              سطح {currentEx.level || 'B1'}
            </span>
            <select
              value={currentId}
              onChange={e => setCurrentId(e.target.value)}
              className="bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-sm font-bold max-w-[240px]"
            >
              {exercises.map(ex => (
                <option key={ex.id} value={ex.id}>
                  {ex.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* جعبه کلمات (Pool) برای کشیدن یا کلیک */}
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#141923] border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="text-xs font-bold text-[#5d6676] dark:text-[#a3adbd]">
            کلمات پیشنهادی (برای جای‌گذاری بکشید یا روی کلمه و سپس جای خالی کلیک کنید):
          </div>
          <div className="flex flex-wrap gap-2" dir="ltr">
            {currentEx.pool.map((word, i) => {
              const isSelected = selectedWord === word;
              return (
                <div
                  key={i}
                  draggable
                  onDragStart={() => setDraggedWord(word)}
                  onClick={() => setSelectedWord(isSelected ? null : word)}
                  className={`px-3.5 py-1.5 rounded-xl font-bold text-sm cursor-grab active:cursor-grabbing transition shadow-xs ${
                    isSelected
                      ? 'bg-[#1f5fbf] text-white ring-2 ring-blue-300'
                      : 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:border-[#1f5fbf]'
                  }`}
                >
                  {word}
                </div>
              );
            })}
          </div>
        </div>

        {/* متن تمرین — LTR واقعی برای آلمانی */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#1b2029] border border-slate-200 dark:border-slate-800" dir="ltr" style={{ textAlign: 'left' }}>
          {renderInteractiveText()}
        </div>

        {/* دکمه تصحیح */}
        <div className="flex gap-2 pt-2">
          {!checked ? (
            <button
              onClick={() => setChecked(true)}
              className="flex-1 bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white py-2.5 rounded-xl text-sm font-bold shadow-md"
            >
              تصحیح پاسخ‌ها 🔍
            </button>
          ) : (
            <button
              onClick={() => {
                setChecked(false);
                setUserAnswers({});
              }}
              className="flex-1 bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 py-2.5 rounded-xl text-sm font-bold"
            >
              🔄 تلاش مجدد
            </button>
          )}
        </div>
      </div>

      {/* 💬 چت با معلم دربارهٔ همین متن — گفتگوها در آرشیو ذخیره می‌شوند */}
      <div className="konn-interactive rounded-2xl border border-[#1f5fbf]/40 bg-blue-50/40 dark:bg-blue-950/20 dark:border-[#7fb0ff]/30 p-3 space-y-2" dir="rtl">
        <button onClick={() => setChatOpen(o => !o)} className="w-full flex items-center justify-between text-sm font-bold">
          <span>💬 چت با معلم دربارهٔ این متن{chatMsgs.length ? ` (${toFa(chatMsgs.length)})` : ''}</span>
          <span className="text-[#5d6676]">{chatOpen ? '▲' : '▼'}</span>
        </button>
        {chatOpen && (
          <>
            <div ref={chatEndRef} className="max-h-64 overflow-y-auto space-y-2">
              {chatMsgs.length === 0 && (
                <p className="text-[11px] text-[#5d6676] dark:text-[#a3adbd] leading-5">
                  دربارهٔ حروف ربط این متن هر سؤالی داری بپرس — مثلاً «چرا جای خالی (۳) این‌طور است؟» — معلم متن کامل و پاسخ‌ها را می‌بیند.
                </p>
              )}
              {chatMsgs.map((m, i) => (
                <div
                  key={i}
                  className={`text-xs leading-6 rounded-lg px-2.5 py-1.5 max-w-[88%] ${m.role === 'user'
                    ? 'bg-[#1f5fbf] text-white ml-auto'
                    : 'bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a]'}`}
                  style={{ whiteSpace: 'pre-wrap' }}
                >
                  {m.text}
                </div>
              ))}
              {chatBusy && <div className="text-[11px] text-[#5d6676] animate-pulse">هوش مصنوعی دارد می‌نویسد…</div>}
            </div>
            <div className="flex flex-wrap gap-1">
              {QUICK_QS.map(q => (
                <button
                  key={q}
                  onClick={() => sendChat(q)}
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
                onChange={e => setChatDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') sendChat(chatDraft); }}
                placeholder="دربارهٔ همین متن بپرس…"
                className="flex-1 min-w-0 border-2 border-[#1f5fbf]/50 dark:border-[#7fb0ff]/40 rounded-lg px-3 py-2 text-base bg-white dark:bg-[#141923] outline-none"
              />
              <button
                onClick={() => sendChat(chatDraft)}
                disabled={chatBusy || !chatDraft.trim()}
                className="w-10 h-10 rounded-lg bg-[#1f5fbf] text-white flex items-center justify-center flex-shrink-0 disabled:opacity-40"
                aria-label="ارسال"
              >
                ↑
              </button>
            </div>
          </>
        )}
      </div>

      {/*
        ناحیهٔ چاپ — در screen پنهان، در print نمایش داده می‌شود.
        صفحهٔ اول: متن تمرین با جای‌خالی شماره‌دار + استخر کلمات.
        صفحهٔ دوم: پاسخ‌نامه.
      */}
      <div className="konn-print-area" aria-hidden="true">
        {/* صفحه ۱: تمرین */}
        <div className="konn-print-exercise">
          <div className="konn-print-title">{currentEx.title}</div>
          <div className="konn-print-sub">
            تمرین حروف ربط و اضافه (سطح {currentEx.level || 'B1'}) — جای‌خالی‌ها را با کلمات مناسب پر کنید.
          </div>
          {renderPrintText()}
          {currentEx.pool.length > 0 && (
            <div className="konn-print-pool">
              <b>Wörter:</b> {currentEx.pool.join('   |   ')}
            </div>
          )}
        </div>

        {/* صفحه ۲: پاسخ‌نامه */}
        <div className="konn-print-answers">
          <div className="konn-print-answers-title">Lösungen — پاسخ‌نامه</div>
          <ol className="konn-print-answers-list">
            {currentEx.blanks.map(b => (
              <li key={b.id}>
                <b>({b.id})</b> &nbsp; {b.answer}
              </li>
            ))}
          </ol>
          <div className="konn-print-footer">
            WörterBuchMitPeyman — Konnektoren & Präpositionen
          </div>
        </div>
      </div>
    </div>
  );
};
