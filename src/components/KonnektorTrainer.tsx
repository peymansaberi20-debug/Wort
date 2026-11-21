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
 *  - ترجمهٔ فارسی کل متن با همان دستور اول ساخته می‌شود و فقط بعد از «تصحیح» نمایش داده می‌شود.
 *  - 💬 چت با معلم دربارهٔ همین متن (با حافظهٔ گفتگو) — ذخیره‌شده در آرشیو.
 *  - 🗂 آرشیو یکدست (مثل بقیهٔ تمرین‌ها): فهرست جمع‌شونده + اجرا + حذف با تأییدیه.
 *  - 🖨 چاپ دو صفحه‌ای سازگار با iOS Safari: صفحهٔ ۱ تمرین + استخر کلمات، صفحهٔ ۲ پاسخنامه.
 *
 * پل هوش مصنوعی: کلید و مدل از تنظیمات برنامه (src/utils/aiProvider) می‌آید — بدون کلید،
 * ساخت تمرین و چت غیرفعال است ولی تمرین‌های آرشیو شده همچنان قابل اجرا هستند.
 */

import React, { useState, useEffect, useRef } from 'react';
import { describeAiError, generateText, hasApiKey } from '../utils/aiProvider';
import { Lvl, LVL_ORDER } from '../data/konnektorenData';
import { ArchivePanel, ArchiveRow, CountChips, LevelChips, MiniChip, PrimaryBtn, PrintPreview, Section, SqBtn, TopicInput, faDate, prFa, prG, toFa, useConfirm } from './trainerUI';

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
  /** ترجمهٔ فارسی کل متن — با همان دستور اول AI گرفته می‌شود، بعد از تصحیح نمایش داده می‌شود */
  fa?: string;
}

const STORAGE_KEY = 'wb_konnektor_archive_v1'; // همان کلید قبلی — آرشیو قبلی حفظ می‌شود
const TOPIC_CHIPS = ['Alltag', 'Beruf', 'Reise', 'Umwelt', 'Technik', 'Gesundheit'];
const QUICK_QS = ['چرا این‌طور درست است؟', 'قاعدهٔ جایگاه فعل را بگو', 'یک مثال مشابه بده', 'فرق wenn و als چیست؟'];

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
"fa": ترجمهٔ فارسی روانِ کل متن کامل (با جاهای خالی پرشده) — این ترجمه تا زمان تصحیح پنهان می‌ماند.
Gib NUR JSON zurück: {"title":"Kurzer deutscher Titel","text":"Text mit (1) (2) ...","blanks":[{"id":1,"answer":"..."}],"pool":["alle Lösungen + 2 Fallen"],"fa":"ترجمهٔ فارسی کل متن"}`;

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

/* استایل چاپ → PrintPreview مشترک در trainerUI (نمای یکدست همهٔ تمرین‌ها) */


export const KonnektorTrainer: React.FC<KonnektorTrainerProps> = ({ onShowToast }) => {
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
  const [printOpen, setPrintOpen] = useState(false);
  const { ask, dialog } = useConfirm();

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
      const res = parseJSONLoose<{ title?: string; text?: string; blanks?: { id?: number; answer?: string }[]; pool?: unknown[]; fa?: string }>(raw);

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
        chats: [],
        fa: String(res.fa || '').trim() || undefined
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

  /* ── برگهٔ چاپ مشترک: صفحهٔ ۱ متن تمرین + جعبهٔ کلمات، صفحهٔ ۲ پاسخنامه ──
     (Portal به body — نوارها و هدر برنامه داخل برگه چاپ نمی‌شوند) */
  const printMeta = `${currentEx.level || 'B1'} · ${toFa(currentEx.blanks.length)} جای خالی${currentEx.topic ? ` · ${currentEx.topic}` : ''} · ${faDate(Date.now())} · نام و تاریخ: ...........................`;
  const printQuestions = (
    <>
      <div style={prFa({ fontSize: 10.5, color: '#555', marginBottom: 8 })}>
        جای خالی‌های شماره‌دار را با کلماتِ مناسب از جعبهٔ «Wörter» پر کنید.
      </div>
      <div style={prG({ fontSize: 12.5, lineHeight: 2.1 })}>{renderPrintText()}</div>
      {currentEx.pool.length > 0 && (
        <div style={{ marginTop: 14, padding: '8pt 10pt', border: '1.2px solid #555', borderRadius: 5 }}>
          <div style={prG({ fontSize: 11.5, fontWeight: 700 })}>Wörter: {currentEx.pool.join('   |   ')}</div>
        </div>
      )}
    </>
  );
  const printSolutions = (
    <>
      <ol style={{ margin: 0, paddingInlineStart: 22, listStyle: 'decimal' }}>
        {currentEx.blanks.map(b => (
          <li key={b.id} style={{ fontSize: 12, marginBottom: 5 }}>
            <span style={prG({})}><b>({b.id})</b> {b.answer}</span>
          </li>
        ))}
      </ol>
      {currentEx.fa && (
        <div style={prFa({ marginTop: 12, fontSize: 10, color: '#333' })}>🇮🇷 ترجمهٔ فارسی متن: {currentEx.fa}</div>
      )}
      <div style={prFa({ marginTop: 14, fontSize: 9, color: '#666', borderTop: '1px solid #ccc', paddingTop: 6 })}>WörterBuchMitPeyman — Konnektoren &amp; Präpositionen</div>
    </>
  );
  const printPreview = (
    <PrintPreview
      open={printOpen}
      onClose={() => setPrintOpen(false)}
      title={<span dir="ltr" style={{ fontFamily: 'Georgia, serif' }}>{currentEx.title}</span>}
      meta={<>{`تمرین حروف ربط و اضافه — سطح ${currentEx.level || 'B1'}`}</>}
      questions={printQuestions}
      solutions={printSolutions}
    />
  );

  return (
    <div className="space-y-3 text-right max-w-2xl mx-auto pb-10" dir="rtl">
      {/* پیکربندی: سطح + تعداد جای خالی + موضوع → دکمهٔ ساخت تمرین (پوستهٔ یکدست، بدون تیتر اضافه) */}
      <div className="konn-interactive bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 space-y-4 shadow-xs">
        <Section n="۱" label="سطح">
          <LevelChips value={level} onChange={l => setLevel(l as Lvl)} levels={LVL_ORDER as unknown as string[]} />
        </Section>

        <Section n="۲" label="تعداد جای خالی">
          <CountChips value={count} onChange={setCount} counts={[5, 8, 10, 12]} unit="جای خالی" />
        </Section>

        <Section n="۳" label="موضوع (اختیاری)">
          <TopicInput value={topic} onChange={setTopic} chips={TOPIC_CHIPS} placeholder="مثلاً: Beruf, Reise, Umwelt … (خالی = موضوع آزاد)" />
        </Section>

        <PrimaryBtn onClick={handleGenerateNew} busy={generating} busyLabel="⏳ در حال ساخت…" label="🚀 ساخت تمرین" />
      </div>

      {/* تمرین جاری — جای‌گذاری کلمات */}
      <div className="konn-interactive bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-slate-700 dark:text-slate-300">📝 {currentEx.title}</span>
          <span className="text-[10px] font-bold bg-blue-50 dark:bg-blue-950/40 text-[#1f5fbf] dark:text-blue-300 rounded-full px-2 py-0.5 flex-shrink-0">
            سطح {currentEx.level || 'B1'}
          </span>
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

        {/* ترجمهٔ فارسی متن — با همان دستور اول ساخته شده و فقط بعد از تصحیح نمایش داده می‌شود */}
        {checked && currentEx.fa && (
          <div className="rounded-xl px-3 py-2.5 text-sm bg-sky-50 text-sky-900 dark:bg-sky-950/40 dark:text-sky-200 leading-7">
            🇮🇷 ترجمهٔ فارسی متن: {currentEx.fa}
          </div>
        )}

        {/* دکمه تصحیح */}
        <div className="flex gap-2 pt-1">
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

      {/* 🖨️ چاپ — فقط در پایان تمرین (بعد از تصحیح) طبق درخواست کاربر */}
      {checked && (
        <div className="konn-interactive">
          <button
            onClick={() => setPrintOpen(true)}
            className="w-full bg-slate-700 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 text-white py-3 rounded-xl text-sm font-bold shadow-md"
            title="پیش‌نمایش چاپ — صفحهٔ ۱ سؤال، صفحهٔ ۲ پاسخنامه"
          >
            🖨️ چاپ تمرین + پاسخنامه
          </button>
        </div>
      )}

      {/* 🗂 آرشیو یکدست (مثل بقیهٔ تمرین‌ها) — اجرا + حذف با تأییدیه */}
      <div className="konn-interactive">
        <ArchivePanel
          title="آرشیو تمرین‌های ساخته‌شده"
          count={exercises.length}
          emptyText="تمرینی ذخیره نشده است."
          footer={exercises.length > 0 ? (
            <button
              onClick={async () => {
                if (await ask('پاک کردن کل آرشیو', `همهٔ ${exercises.length} تمرین ذخیره‌شده برای همیشه حذف می‌شوند. مطمئن هستی؟`)) {
                  saveArchive(DEFAULT_EXERCISES);
                  setCurrentId(DEFAULT_EXERCISES[0].id);
                }
              }}
              className="text-[11px] text-red-500 px-2 py-1"
            >
              پاک کردن کل آرشیو (بازگشت به تمرین نمونه)
            </button>
          ) : undefined}
        >
          {exercises.map(ex => (
            <ArchiveRow
              key={ex.id}
              title={<>{ex.id === currentId && <span className="text-emerald-600">● </span>}{ex.title}</>}
              chips={<>
                <MiniChip tone="blue">سطح {ex.level || 'B1'}</MiniChip>
                <MiniChip>{toFa(ex.blanks.length)} جای خالی</MiniChip>
                {ex.topic && <MiniChip>{ex.topic}</MiniChip>}
                {ex.chats && ex.chats.length > 0 && <MiniChip tone="blue">💬 {toFa(ex.chats.length)}</MiniChip>}
              </>}
            >
              <SqBtn onClick={() => setCurrentId(ex.id)} title="اجرای این تمرین">▶</SqBtn>
              <SqBtn
                tone="red"
                onClick={async () => {
                  if (await ask('حذف تمرین', `«${ex.title}» از آرشیو برای همیشه حذف می‌شود. مطمئن هستی؟`)) {
                    const next = exercises.filter(x => x.id !== ex.id);
                    const finalList = next.length ? next : DEFAULT_EXERCISES;
                    saveArchive(finalList);
                    if (ex.id === currentId) setCurrentId(finalList[0].id);
                  }
                }}
                title="حذف"
              >🗑</SqBtn>
            </ArchiveRow>
          ))}
        </ArchivePanel>
      </div>

      {printPreview}

      {dialog}
      {dialog}
    </div>
  );
};
