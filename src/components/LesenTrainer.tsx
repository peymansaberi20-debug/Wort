/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { generateWithGemini, parseAI } from '../utils/ai';
import { speak, stopSpeaking } from '../utils/audio';
import type { Word } from '../types';
import { Clock, Printer, Volume2, Square, Eye, EyeOff, PlusCircle, Lightbulb, PauseCircle } from 'lucide-react';

interface LesenTrainerProps {
  onClose: () => void;
  onShowToast: (msg: string, isErr?: boolean) => void;
  onQuickAddWord?: (w: Partial<Word>) => boolean;
}

interface ReadingQuestion {
  id: number;
  question: string;
  options: string[];
  correct: string;
  explanation?: string;
}

interface ReadingPart {
  partNumber: number;
  partTitle: string;
  instruction: string;
  strategyTip?: string;
  text: string;
  questions: ReadingQuestion[];
}

interface ReadingExam {
  id?: string;
  org: string;
  level: string;
  title: string;
  durationMinutes: number;
  parts: ReadingPart[];
  createdAt?: string;
}

interface ExamResultRecord {
  id: string;
  examId: string;
  examTitle: string;
  org: string;
  level: string;
  date: string;
  score: number;
  total: number;
  percentage: number;
  userAnswers: Record<number, string>;
}

const EXAM_SPECS: Record<string, Record<string, { duration: number; structure: string }>> = {
  ÖSD: {
    A1: { duration: 30, structure: '2 Teile: Kurze Mitteilungen/Anzeigen und Alltagstexte.' },
    A2: { duration: 40, structure: '2 Teile: Zeitungsanzeigen zuordnen und Informationstext.' },
    B1: { duration: 65, structure: '4 Teile: Überschriften, Pressetext, Anzeigen und Sprachbausteine.' },
    B2: { duration: 90, structure: '4 Teile: Sachtext, Komplexes Leseverstehen und Grammatik im Kontext.' },
    C1: { duration: 90, structure: '4 Teile: Wissenschaftliche und feuilletonistische Texte.' }
  },
  Goethe: {
    A1: { duration: 25, structure: '3 Teile: E-Mails, Schilder und Hinweistafeln.' },
    A2: { duration: 30, structure: '4 Teile: Artikel, Veranstaltungskalender und Online-Anzeigen.' },
    B1: { duration: 65, structure: '5 Teile: Blogbeitrag, Pressetexte, Anzeigen, Leserbriefe und Regeln.' },
    B2: { duration: 65, structure: '5 Teile: Forumsbeiträge, Magazinartikel und Essay.' },
    C1: { duration: 70, structure: '4 Teile: Anspruchsvolle Sachtexte und Textrekonstruktion.' }
  },
  telc: {
    A1: { duration: 25, structure: '3 Teile: Notizen, Anzeigen und Schilder.' },
    A2: { duration: 30, structure: '3 Teile: Alltagsmitteilungen und kurze Artikel.' },
    B1: { duration: 90, structure: '3 Teile Leseverstehen + 2 Teile Sprachbausteine.' },
    B2: { duration: 90, structure: '3 Teile Leseverstehen + 2 Teile Sprachbausteine.' },
    C1: { duration: 90, structure: '4 Teile: Textrekonstruktion und wissenschaftliche Texte.' }
  },
  EPD: {
    B2: { duration: 90, structure: 'Universitäres Prüfungsformat (Wien): Wissenschaftsorientierter Sachtext.' },
    C1: { duration: 90, structure: 'Universitäres Prüfungsformat (Wien): Akademischer Fachtext.' }
  }
};

const ARCHIVE_KEY = 'wb_lesen_exam_archive_v1';
const RESULTS_KEY = 'wb_lesen_results_v1';

export const LesenTrainer: React.FC<LesenTrainerProps> = ({ onShowToast, onQuickAddWord }) => {
  const [view, setView] = useState<'menu' | 'creator' | 'archive_levels' | 'archive_exams' | 'exam_active' | 'result'>('menu');

  const [examOrg, setExamOrg] = useState<'ÖSD' | 'Goethe' | 'telc' | 'EPD'>('ÖSD');
  const [examLevel, setExamLevel] = useState<'A1' | 'A2' | 'B1' | 'B2' | 'C1'>('B2');

  const [archiveExams, setArchiveExams] = useState<ReadingExam[]>([]);
  const [examResults, setExamResults] = useState<ExamResultRecord[]>([]);
  const [selectedArchiveLevel, setSelectedArchiveLevel] = useState<string>('');

  const [isLoading, setIsLoading] = useState(false);
  const [currentExam, setCurrentExam] = useState<ReadingExam | null>(null);
  const [activePartIdx, setActivePartIdx] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  // وضعیت‌های جدید: توقف تایمر، نمایش متن هر بخش و پخش صوتی
  const [isTimerPaused, setIsTimerPaused] = useState<boolean>(false);
  const [visibleTexts, setVisibleTexts] = useState<Record<number, boolean>>({});
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [addForm, setAddForm] = useState<{ de: string; art: string; fa: string; ex: string } | null>(null);
  const [selectedWordModal, setSelectedWordModal] = useState<{ word: string; meaning?: string; loading?: boolean } | null>(null);

  useEffect(() => {
    try {
      const savedExams = localStorage.getItem(ARCHIVE_KEY);
      if (savedExams) setArchiveExams(JSON.parse(savedExams));
      const savedResults = localStorage.getItem(RESULTS_KEY);
      if (savedResults) setExamResults(JSON.parse(savedResults));
    } catch {
      // ignore
    }
    return () => {
      stopSpeaking();
    };
  }, []);

  // توقف صدا هنگام تغییر بخش یا خروج از صفحه آزمون
  useEffect(() => {
    stopSpeaking();
    setIsPlayingAudio(false);
  }, [activePartIdx, view]);

  const saveExamToArchive = (exam: ReadingExam) => {
    try {
      const updated = [exam, ...archiveExams.filter(e => e.id !== exam.id)];
      setArchiveExams(updated);
      localStorage.setItem(ARCHIVE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const saveExamResult = (exam: ReadingExam, answers: Record<number, string>) => {
    const allQ: ReadingQuestion[] = exam.parts.flatMap(p => p.questions || []);
    const correctCount = allQ.filter(q => answers[q.id] === q.correct).length;
    const percentage = Math.round((correctCount / Math.max(1, allQ.length)) * 100);

    const newRecord: ExamResultRecord = {
      id: 'res_' + Date.now(),
      examId: exam.id || 'ex_default',
      examTitle: exam.title,
      org: exam.org,
      level: exam.level,
      date: new Date().toLocaleDateString('fa-IR') + ' ' + new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
      score: correctCount,
      total: allQ.length,
      percentage,
      userAnswers: answers
    };

    try {
      const updated = [newRecord, ...examResults];
      setExamResults(updated);
      localStorage.setItem(RESULTS_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  // تایمر هوشمند با قابلیت توقف کامل هنگام افزودن واژه
  useEffect(() => {
    if (view !== 'exam_active' || isLoading || secondsLeft <= 0 || isTimerPaused) return;
    const timer = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          onShowToast('زمان آزمون به پایان رسید!', true);
          finishExam();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [view, isLoading, secondsLeft, isTimerPaused]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const extractExamObject = (raw: string): ReadingExam | null => {
    try {
      const parsed = parseAI(raw);
      const obj = Array.isArray(parsed) ? parsed[0] : parsed;
      if (obj && Array.isArray(obj.parts) && obj.parts.length > 0) return obj as ReadingExam;
    } catch { /* ignore */ }
    try {
      const firstBrace = raw.indexOf('{');
      const lastBrace = raw.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        const directObj = JSON.parse(raw.slice(firstBrace, lastBrace + 1));
        if (directObj && Array.isArray(directObj.parts) && directObj.parts.length > 0) return directObj as ReadingExam;
      }
    } catch { /* ignore */ }
    return null;
  };

  const generateNewExam = async () => {
    setView('exam_active');
    setIsLoading(true);
    setUserAnswers({});
    setActivePartIdx(0);
    setVisibleTexts({});
    setIsTimerPaused(false);
    setCurrentExam(null);

    const spec = EXAM_SPECS[examOrg]?.[examLevel] || {
      duration: examLevel === 'A1' || examLevel === 'A2' ? 30 : 65,
      structure: 'Offizielles mehrteiliges Prüfungsformat.'
    };

    const wordCountTarget =
      examLevel === 'A1' ? '80-120 words per part' :
      examLevel === 'A2' ? '130-180 words per part' :
      examLevel === 'B1' ? '220-300 words per part' :
      '320-450 words per part (authentic journalistic/academic style)';

    const prompt = `You are an official German exam developer for ${examOrg}. Create an authentic, rigorous Reading Comprehension test (Leseverstehen) calibrated to CEFR Level ${examLevel}.
- Organization: ${examOrg}
- Level: ${examLevel}
- Structure: ${spec.structure}
- Length: ${wordCountTarget}.

Create 3 distinct exam parts (Teile) with 4 questions each (total 12 questions numbered sequentially 1 to 12).
For each part, also include "strategyTip": a practical, concise exam-solving strategy in Persian (فوت‌وفن تست‌زنی این بخش به فارسی).

Return ONLY a valid JSON object (no markdown, no extra text):
{
  "title": "${examOrg} ${examLevel} – Leseverstehen",
  "durationMinutes": ${spec.duration},
  "parts": [
    {
      "partNumber": 1,
      "partTitle": "Teil 1: ...",
      "instruction": "Instruction in German",
      "strategyTip": "راهنمای استراتژی حل این بخش به فارسی...",
      "text": "Reading text in German...",
      "questions": [
        {
          "id": 1,
          "question": "Question in German",
          "options": ["Option A", "Option B", "Option C"],
          "correct": "Exact matching string from options",
          "explanation": "Begründung auf Deutsch + توضیح فارسی"
        }
      ]
    }
  ]
}`;

    try {
      const res = await generateWithGemini(prompt, { json: true, timeoutMs: 60000, retries: 1 });
      const extracted = extractExamObject(res);
      if (!extracted) throw new Error('ساختار آزمون دریافتی ناقص بود.');

      extracted.id = 'exam_' + Date.now();
      extracted.org = examOrg;
      extracted.level = examLevel;
      extracted.createdAt = new Date().toLocaleDateString('fa-IR');

      let qCounter = 1;
      extracted.parts.forEach(p => {
        p.questions?.forEach(q => { q.id = qCounter++; });
      });

      setCurrentExam(extracted);
      setSecondsLeft((extracted.durationMinutes || spec.duration) * 60);
      saveExamToArchive(extracted);
    } catch (e: any) {
      onShowToast(e?.message || 'خطا در تولید آزمون. لطفاً دوباره تلاش کنید.', true);
      setView('menu');
    } finally {
      setIsLoading(false);
    }
  };

  const startArchivedExam = (exam: ReadingExam) => {
    setCurrentExam(exam);
    setUserAnswers({});
    setActivePartIdx(0);
    setVisibleTexts({});
    setIsTimerPaused(false);
    setSecondsLeft((exam.durationMinutes || 60) * 60);
    setView('exam_active');
  };

  const handleSelectOption = (qId: number, option: string) => {
    setUserAnswers(prev => ({ ...prev, [qId]: option }));
  };

  const finishExam = () => {
    stopSpeaking();
    setIsPlayingAudio(false);
    if (currentExam) saveExamResult(currentExam, userAnswers);
    setView('result');
  };

  // کنترل پخش و توقف صوتی متن هر بخش
  const handleToggleAudio = (text: string) => {
    if (isPlayingAudio) {
      stopSpeaking();
      setIsPlayingAudio(false);
    } else {
      setIsPlayingAudio(true);
      speak(text, {
        onEnd: () => setIsPlayingAudio(false)
      });
    }
  };

  // کلیک روی هر کلمه آلمانی: توقف تایمر و باز شدن پنجره سریع واژه + ارسال به لایتنر
  const handleWordClick = async (rawToken: string) => {
    const cleanWord = rawToken.replace(/[.,!?;:"„“()[\]—–-]/g, '').trim();
    if (!cleanWord || cleanWord.length < 2) return;

    // توقف فوری زمان آزمون
    setIsTimerPaused(true);
    setSelectedWordModal({ word: cleanWord, loading: true });

    try {
      const prompt = `Translate the German word "${cleanWord}" (level ${examLevel}) to Persian with article (if noun) or infinitive (if verb) and 1 short example. Return ONLY JSON: [{"meaning": "معنی فارسی + آرتیکل/مصدر"}]`;
      const res = await generateWithGemini(prompt, { json: true, timeoutMs: 12000, retries: 0 });
      const parsed = parseAI(res)[0];
      setSelectedWordModal({
        word: cleanWord,
        meaning: parsed?.meaning || 'معنی یافت نشد',
        loading: false
      });
    } catch {
      setSelectedWordModal({
        word: cleanWord,
        meaning: 'امکان دریافت ترجمه فوری نبود؛ می‌توانید مستقیماً به لایتنر اضافه کنید.',
        loading: false
      });
    }
  };

  // رندر متن به صورت کلمات قابل کلیک برای هایلایت و ذخیره در لایتنر
  const renderInteractiveText = (text: string) => {
    const paragraphs = text.split('\n');
    return paragraphs.map((para, pIdx) => (
      <p key={pIdx} className="mb-3 last:mb-0 leading-8">
        {para.split(/(\s+)/).map((token, tIdx) => {
          if (/^\s+$/.test(token)) return <span key={tIdx}>{token}</span>;
          return (
            <span
              key={tIdx}
              onClick={() => void handleWordClick(token)}
              title="برای مشاهده معنی و افزودن به لایتنر کلیک کنید (زمان متوقف می‌شود)"
              className="cursor-pointer rounded px-0.5 hover:bg-amber-200/80 dark:hover:bg-amber-700/50 hover:text-slate-950 dark:hover:text-white transition"
            >
              {token}
            </span>
          );
        })}
      </p>
    ));
  };

  const availableLevels: ('A1' | 'A2' | 'B1' | 'B2' | 'C1')[] =
    examOrg === 'EPD' ? ['B2', 'C1'] : ['A1', 'A2', 'B1', 'B2', 'C1'];

  return (
    <div className="space-y-4 text-right max-w-3xl mx-auto pb-10" dir="rtl">
      
      {/* 1. نمای اولیه (مشابه تب Hören) */}
      {view === 'menu' && (
        <div className="space-y-3">
          <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-3">
              <span className="text-3xl">✨</span>
              <div>
                <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100">ساخت تمرین جدید (Lesen)</h3>
                <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">تولید آزمون‌های استاندارد درک مطلب با هوش مصنوعی و قابلیت Hör-Lesen</p>
              </div>
            </div>
            <button
              onClick={() => setView('creator')}
              className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-xs transition"
            >
              شروع ساخت ▶
            </button>
          </div>

          <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-3">
              <span className="text-3xl">📂</span>
              <div>
                <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100">تمرینات قبلی (آرشیو آزمون‌ها)</h3>
                <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">دسترسی به تمام آزمون‌های ساخته‌شده و سوابق مقایسه‌ای</p>
              </div>
            </div>
            <button
              onClick={() => setView('archive_levels')}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-xs transition"
            >
              مشاهده آرشیو ▶
            </button>
          </div>
        </div>
      )}

      {/* 2. سازنده تمرین جدید */}
      {view === 'creator' && (
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-6 shadow-sm space-y-5 text-right">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100">تنظیمات آزمون Lesen</h2>
            <button onClick={() => setView('menu')} className="px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">بازگشت</button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold mb-1.5">سازمان برگزاری آزمون:</label>
              <select
                value={examOrg}
                onChange={e => {
                  const org = e.target.value as any;
                  setExamOrg(org);
                  if (org === 'EPD' && examLevel !== 'B2' && examLevel !== 'C1') setExamLevel('B2');
                }}
                className="w-full bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold outline-none"
              >
                <option value="ÖSD">ÖSD (اتریش و بین‌المللی)</option>
                <option value="Goethe">Goethe-Zertifikat (گته)</option>
                <option value="telc">telc Deutsch (تلک)</option>
                <option value="EPD">EPD (دانشگاهی وین)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold mb-1.5">انتخاب سطح:</label>
              <select
                value={examLevel}
                onChange={e => setExamLevel(e.target.value as any)}
                className="w-full bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold outline-none"
              >
                {availableLevels.map(lvl => <option key={lvl} value={lvl}>سطح {lvl}</option>)}
              </select>
            </div>
          </div>

          <button
            onClick={() => void generateNewExam()}
            className="w-full bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white py-3.5 rounded-xl font-bold text-sm shadow-md transition"
          >
            تولید و شروع آزمون استاندارد 🚀
          </button>
        </div>
      )}

      {/* 3. آرشیو: سطوح */}
      {view === 'archive_levels' && (
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-6 shadow-sm space-y-4 text-right">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="font-extrabold text-base">انتخاب سطح از آرشیو تمرینات</h2>
            <button onClick={() => setView('menu')} className="px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">بازگشت</button>
          </div>

          <div className="space-y-2">
            {['A1', 'A2', 'B1', 'B2', 'C1'].map(lvl => {
              const count = archiveExams.filter(e => e.level === lvl).length;
              return (
                <button
                  key={lvl}
                  onClick={() => { setSelectedArchiveLevel(lvl); setView('archive_exams'); }}
                  className="w-full p-4 rounded-2xl bg-slate-50 dark:bg-[#141923] border border-slate-200 dark:border-slate-800 flex items-center justify-between hover:border-[#1f5fbf] transition"
                >
                  <span className="font-extrabold text-base text-slate-900 dark:text-slate-100">سطح {lvl}</span>
                  <span className="px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/50 text-[#1f5fbf] dark:text-[#7fb0ff] text-xs font-bold">
                    {count} آزمون آماده
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. آرشیو: لیست آزمون‌های سطح انتخاب‌شده */}
      {view === 'archive_exams' && (
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-6 shadow-sm space-y-4 text-right">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="font-extrabold text-base">آزمون‌های سطح {selectedArchiveLevel}</h2>
            <button onClick={() => setView('archive_levels')} className="px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">بازگشت</button>
          </div>

          <div className="space-y-3">
            {archiveExams.filter(e => e.level === selectedArchiveLevel).length === 0 ? (
              <div className="py-12 text-center text-sm text-[#5d6676]">هیچ آزمونی در این سطح ذخیره نشده است.</div>
            ) : (
              archiveExams.filter(e => e.level === selectedArchiveLevel).map(exam => (
                <div
                  key={exam.id}
                  onClick={() => startArchivedExam(exam)}
                  className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#141923] flex items-center justify-between cursor-pointer hover:border-[#1f5fbf] transition"
                >
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">{exam.title}</h4>
                    <span className="text-xs text-[#5d6676]">سازمان: {exam.org} • تاریخ ساخت: {exam.createdAt}</span>
                  </div>
                  <span className="bg-[#1f5fbf] text-white px-4 py-2 rounded-xl text-xs font-bold">شروع آزمون ▶</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 5. اجرای آزمون (با استراتژی حل، حالت Hör-Lesen و هایلایت واژگان) */}
      {view === 'exam_active' && (
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-5 md:p-6 shadow-sm space-y-5">
          {/* هدر و تایمر با وضعیت توقف */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <span className="font-extrabold text-sm md:text-base text-[#1f5fbf] dark:text-[#7fb0ff] block">
                {currentExam?.title}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {!isLoading && secondsLeft > 0 && (
                <span className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-1.5 ${
                  isTimerPaused
                    ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 text-rose-700 dark:text-rose-300'
                    : 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 text-amber-800 dark:text-amber-200'
                }`}>
                  {isTimerPaused ? <PauseCircle size={14} /> : <Clock size={14} />}
                  {formatTime(secondsLeft)}
                  {isTimerPaused && <span className="text-[10px] font-sans">(متوقف)</span>}
                </span>
              )}
              <button onClick={() => setView('menu')} className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">انصراف</button>
            </div>
          </div>

          {isLoading ? (
            <div className="py-20 text-center space-y-3">
              <span className="text-4xl animate-bounce block">📝</span>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">در حال طراحی متن‌ها، فایل صوتی و استراتژی آزمون...</p>
            </div>
          ) : currentExam && currentExam.parts[activePartIdx] ? (
            <div className="space-y-5">
              {/* تب‌های جابه‌جایی بین بخش‌ها */}
              <div className="grid grid-cols-3 gap-2 p-1.5 bg-slate-100 dark:bg-[#141923] rounded-2xl">
                {currentExam.parts.map((part, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActivePartIdx(idx)}
                    className={`py-2 px-2 rounded-xl text-xs font-bold transition flex flex-col items-center ${activePartIdx === idx ? 'bg-[#1f5fbf] text-white shadow-xs' : 'text-slate-700 dark:text-slate-300'}`}
                  >
                    <span>Teil {part.partNumber || idx + 1}</span>
                  </button>
                ))}
              </div>

              {(() => {
                const currentPart = currentExam.parts[activePartIdx];
                const isTextShown = !!visibleTexts[activePartIdx];

                return (
                  <div className="space-y-5">
                    {/* باکس فوت‌وفن و استراتژی آزمون (Prüfungstipp) */}
                    <div className="p-3.5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/80 text-xs space-y-1">
                      <div className="font-extrabold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                        <Lightbulb size={15} />
                        <span>استراتژی و تکنیک حل سریع این بخش:</span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-200 leading-relaxed">
                        {currentPart.strategyTip || 'ابتدا کلیدواژه‌های سؤالات را بخوانید و سپس در متن به دنبال مترادف‌ها و مفهوم اصلی بگردید.'}
                      </p>
                    </div>

                    {/* دستورالعمل رسمی آلمانی */}
                    <div className="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 text-xs md:text-sm font-semibold text-indigo-950 dark:text-indigo-200" dir="ltr">
                      <div className="font-extrabold mb-1">{currentPart.partTitle}</div>
                      <div>{currentPart.instruction}</div>
                    </div>

                    {/* پخش‌کننده صوتی و کنترل نمایش متن (حالت ترکیبی Hör-Lesen) */}
                    <div className="p-4 rounded-2xl bg-gradient-to-l from-blue-50 to-indigo-50/60 dark:from-[#161e2e] dark:to-[#1a2236] border border-blue-200 dark:border-blue-900/60 space-y-3">
                      <div className="flex items-start gap-2.5">
                        <span className="text-2xl">🎧</span>
                        <div className="flex-1">
                          <h4 className="font-extrabold text-xs md:text-sm text-slate-900 dark:text-slate-100">
                            پیشنهاد تقویتی: ابتدا به فایل صوتی گوش دهید و مهارت Hören خود را بسنجید!
                          </h4>
                          <p className="text-[11px] text-[#5d6676] dark:text-[#a3adbd] mt-0.5">
                            متن این بخش به صورت پیش‌فرض مخفی است. هر زمان نیاز داشتید می‌توانید متن را باز یا بسته کنید.
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleToggleAudio(currentPart.text)}
                          className={`px-4 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 shadow-xs transition ${
                            isPlayingAudio
                              ? 'bg-rose-600 hover:bg-rose-700'
                              : 'bg-[#1f5fbf] hover:bg-[#194ea0]'
                          }`}
                        >
                          {isPlayingAudio ? <><Square size={14} /> توقف پخش صدا</> : <><Volume2 size={15} /> پخش صوتی متن</>}
                        </button>

                        <button
                          type="button"
                          onClick={() => setVisibleTexts(prev => ({ ...prev, [activePartIdx]: !prev[activePartIdx] }))}
                          className="px-4 py-2.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 shadow-xs hover:bg-slate-50 transition"
                        >
                          {isTextShown ? <><EyeOff size={15} /> مخفی کردن متن</> : <><Eye size={15} /> نمایش متن</>}
                        </button>
                      </div>
                    </div>

                    {/* متن قابل کلیک و هایلایت واژگان (در صورت باز بودن نمایش متن) */}
                    {isTextShown && (
                      <div className="p-4 md:p-5 rounded-2xl bg-slate-50 dark:bg-[#141923] border border-slate-200 dark:border-slate-800 space-y-2 animate-fadeIn">
                        <div className="text-[11px] text-[#1f5fbf] dark:text-[#7fb0ff] font-bold flex items-center justify-between border-b border-slate-200/70 dark:border-slate-800 pb-2 mb-2">
                          <span>💡 روی هر کلمه در متن کلیک کنید تا معنی آن را ببینید و به واژه‌نامه اضافه کنید (تایمر متوقف می‌شود).</span>
                        </div>
                        <div className="text-sm md:text-base font-sans text-slate-900 dark:text-slate-100 text-left select-text" dir="ltr">
                          {renderInteractiveText(currentPart.text)}
                        </div>
                      </div>
                    )}

                    {/* سوالات این بخش */}
                    <div className="space-y-4">
                      {currentPart.questions.map(q => (
                        <div key={q.id} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 bg-white dark:bg-[#1b2029]">
                          <p className="text-sm md:text-base font-bold text-slate-900 dark:text-slate-100 text-left" dir="ltr">
                            {q.id}. {q.question}
                          </p>
                          <div className="space-y-2" dir="ltr">
                            {q.options.map((opt, optIdx) => {
                              const isSelected = userAnswers[q.id] === opt;
                              return (
                                <button
                                  key={optIdx}
                                  onClick={() => handleSelectOption(q.id, opt)}
                                  className={`w-full py-2.5 px-3.5 rounded-xl text-xs md:text-sm font-semibold border transition text-left flex items-start gap-2.5 ${isSelected ? 'bg-[#1f5fbf] text-white border-[#1f5fbf]' : 'bg-slate-50 dark:bg-[#141923] border-slate-200 text-slate-800 dark:text-slate-200'}`}
                                >
                                  <span>{opt}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* ناوبری پایین صفحه */}
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                {activePartIdx > 0 ? (
                  <button onClick={() => setActivePartIdx(prev => prev - 1)} className="px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">بخش قبلی</button>
                ) : <div />}

                {activePartIdx < currentExam.parts.length - 1 ? (
                  <button onClick={() => setActivePartIdx(prev => prev + 1)} className="bg-[#1f5fbf] text-white px-5 py-3 rounded-xl font-bold text-xs">بخش بعدی ◀</button>
                ) : (
                  <button onClick={finishExam} className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-6 py-3 rounded-xl font-bold text-xs">پایان آزمون و مشاهده کارنامه ✓</button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* مودال هایلایت واژه (تایمر در این حالت متوقف است) */}
      {selectedWordModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => { setSelectedWordModal(null); setIsTimerPaused(false); }}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-5 space-y-4 shadow-xl text-right"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <span className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                <PauseCircle size={14} /> زمان آزمون متوقف شد
              </span>
              <button
                onClick={() => { setSelectedWordModal(null); setIsTimerPaused(false); }}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="text-center space-y-2 py-2">
              <div className="flex items-center justify-center gap-2" dir="ltr">
                <span className="text-2xl font-extrabold font-sans text-slate-900 dark:text-slate-100">
                  {selectedWordModal.word}
                </span>
                <button
                  onClick={() => speak(selectedWordModal.word)}
                  className="w-8 h-8 rounded-full bg-blue-50 dark:bg-slate-800 text-sm flex items-center justify-center"
                >
                  🔊
                </button>
              </div>
              <div className="text-sm font-semibold text-[#1f5fbf] dark:text-[#7fb0ff]">
                {selectedWordModal.loading ? 'در حال دریافت معنی...' : selectedWordModal.meaning}
              </div>
            </div>

            <div className="flex gap-2">
              {onQuickAddWord && (
                <button
                  onClick={() => {
                    const w = selectedWordModal.word;
                    const m = selectedWordModal.loading ? '' : (selectedWordModal.meaning || '');
                    setSelectedWordModal(null);
                    setAddForm({ de: w, art: '', fa: m, ex: '' });
                  }}
                  className="flex-1 bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <PlusCircle size={15} /> افزودن به واژه‌نامه
                </button>
              )}
              <button
                onClick={() => { setSelectedWordModal(null); setIsTimerPaused(false); }}
                className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold"
              >
                ادامه آزمون
              </button>
            </div>
          </div>
        </div>
      )}

      {/* پنجرهٔ افزودن واژه به کتابخانه */}
      {addForm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-[#1b2029] rounded-3xl p-5 space-y-3 text-right" dir="rtl">
            <h3 className="font-extrabold text-sm">➕ افزودن واژه به کتابخانه</h3>
            <div className="flex gap-2" dir="ltr">
              <select value={addForm.art} onChange={e => setAddForm({ ...addForm, art: e.target.value })} className="border rounded-xl px-2 bg-slate-50 dark:bg-[#141923]">
                <option value="">—</option><option>der</option><option>die</option><option>das</option>
              </select>
              <input value={addForm.de} onChange={e => setAddForm({ ...addForm, de: e.target.value })} className="flex-1 border rounded-xl px-3 py-2 font-sans bg-slate-50 dark:bg-[#141923]" />
            </div>
            <input value={addForm.fa} onChange={e => setAddForm({ ...addForm, fa: e.target.value })} placeholder="معنی فارسی" className="w-full border rounded-xl px-3 py-2 text-sm bg-slate-50 dark:bg-[#141923]" />
            <input dir="ltr" value={addForm.ex} onChange={e => setAddForm({ ...addForm, ex: e.target.value })} placeholder="Beispielsatz (optional)" className="w-full border rounded-xl px-3 py-2 text-sm font-sans bg-slate-50 dark:bg-[#141923]" />
            <div className="flex gap-2">
              <button onClick={() => { if (onQuickAddWord?.({ de: addForm.de.trim(), art: addForm.art, fa: addForm.fa.trim(), ex: addForm.ex.trim(), cat: 'Lesen', lvl: examLevel })) { setAddForm(null); setIsTimerPaused(false); } }} className="flex-1 bg-[#1f5fbf] text-white py-2.5 rounded-xl text-xs font-bold">ذخیره</button>
              <button onClick={() => { setAddForm(null); setIsTimerPaused(false); }} className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">انصراف</button>
            </div>
          </div>
        </div>
      )}

      {/* 6. کارنامه قابل چاپ (سازگار با iOS) و جدول مقایسه نتایج */}
      {view === 'result' && currentExam && (
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-6 shadow-sm space-y-6 text-right print:bg-white print:text-black">
          <div className="flex items-center justify-between print:hidden">
            <button onClick={() => setView('menu')} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">بازگشت به منو</button>
            <button onClick={() => window.print()} className="px-4 py-2 rounded-xl bg-[#1f5fbf] text-white text-xs font-bold flex items-center gap-1.5">
              <Printer size={16} /> چاپ کارنامه (PDF / iOS)
            </button>
          </div>

          <div className="text-center space-y-2 border-b border-slate-100 dark:border-slate-800 pb-5">
            <span className="text-4xl block">🎓</span>
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">کارنامه رسمی آزمون Lesen</h3>
            <p className="text-xs text-[#5d6676]">{currentExam.title}</p>
          </div>

          <div className="space-y-3 pt-2">
            <h4 className="font-extrabold text-sm text-[#1f5fbf]">📊 مقایسه تلاش‌ها و سوابق این آزمون:</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-center border-collapse">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800">
                    <th className="p-2 border border-slate-200 dark:border-slate-700">تاریخ ثبت</th>
                    {examResults.filter(r => r.examId === currentExam.id).map((res, i) => (
                      <th key={res.id} className="p-2 border border-slate-200 dark:border-slate-700">تلاش {i + 1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-2 border border-slate-200 dark:border-slate-700 font-bold">درصد موفقیت</td>
                    {examResults.filter(r => r.examId === currentExam.id).map(res => (
                      <td key={res.id} className="p-2 border border-slate-200 dark:border-slate-700 font-extrabold text-emerald-600">
                        {res.percentage}% ({res.score}/{res.total})
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4 pt-4">
            <h4 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">بررسی سوالات و پاسخ‌های شما:</h4>
            {currentExam.parts.flatMap(p => p.questions).map(q => {
              const userAns = userAnswers[q.id];
              const isCorrect = userAns === q.correct;
              return (
                <div key={q.id} className={`p-4 rounded-2xl border text-xs space-y-1.5 ${isCorrect ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200' : 'bg-red-50 dark:bg-red-950/30 border-red-200'}`}>
                  <div className="font-bold text-slate-900 dark:text-slate-100 text-left" dir="ltr">{q.id}. {q.question}</div>
                  <div className="flex gap-4">
                    <span>پاسخ شما: <strong className={isCorrect ? 'text-emerald-700' : 'text-red-600'} dir="ltr">{userAns || 'نداده'}</strong></span>
                    {!isCorrect && <span>پاسخ صحیح: <strong className="text-emerald-700" dir="ltr">{q.correct}</strong></span>}
                  </div>
                  {q.explanation && <div className="text-[11px] text-slate-600 dark:text-slate-400 pt-1">💡 {q.explanation}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
};
