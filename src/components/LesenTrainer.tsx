/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { generateWithGemini, parseAI } from '../utils/ai';
import { Clock, BookOpen, Archive, PlusCircle, CheckCircle, Award, Printer, ArrowRight } from 'lucide-react';

interface LesenTrainerProps {
  onClose: () => void;
  onShowToast: (msg: string, isErr?: boolean) => void;
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

export const LesenTrainer: React.FC<LesenTrainerProps> = ({ onShowToast }) => {
  // نماهای اصلی: منوی اولیه، سازنده، انتخاب از آرشیو، اجرای آزمون، کارنامه
  const [view, setView] = useState<'menu' | 'creator' | 'archive_levels' | 'archive_exams' | 'exam_active' | 'result'>('menu');
  
  // فیلترهای سازنده
  const [examOrg, setExamOrg] = useState<'ÖSD' | 'Goethe' | 'telc' | 'EPD'>('ÖSD');
  const [examLevel, setExamLevel] = useState<'A1' | 'A2' | 'B1' | 'B2' | 'C1'>('B2');

  // داده‌های آرشیو و ذخیره‌سازی
  const [archiveExams, setArchiveExams] = useState<ReadingExam[]>([]);
  const [examResults, setExamResults] = useState<ExamResultRecord[]>([]);
  const [selectedArchiveLevel, setSelectedArchiveLevel] = useState<string>('');
  const [selectedArchiveOrg, setSelectedArchiveOrg] = useState<string>('');

  // حالت‌های اجرای آزمون فعلی
  const [isLoading, setIsLoading] = useState(false);
  const [currentExam, setCurrentExam] = useState<ReadingExam | null>(null);
  const [activePartIdx, setActivePartIdx] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  // بارگذاری آرشیو و نتایج از حافظه محلی
  useEffect(() => {
    try {
      const savedExams = localStorage.getItem(ARCHIVE_KEY);
      if (savedExams) setArchiveExams(JSON.parse(savedExams));

      const savedResults = localStorage.getItem(RESULTS_KEY);
      if (savedResults) setExamResults(JSON.parse(savedResults));
    } catch {
      // خطا در خواندن حافظه
    }
  }, []);

  // ذخیره آرشیو در حافظه
  const saveExamToArchive = (exam: ReadingExam) => {
    try {
      const updated = [exam, ...archiveExams.filter(e => e.id !== exam.id)];
      setArchiveExams(updated);
      localStorage.setItem(ARCHIVE_KEY, JSON.stringify(updated));
    } catch {
      // خطا در ذخیره
    }
  };

  // ذخیره نتیجه آزمون در حافظه (اختصاصی کاربر)
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
      // خطا در ذخیره نتیجه
    }
  };

  // مدیریت تایمر آزمون
  useEffect(() => {
    if (view !== 'exam_active' || isLoading || secondsLeft <= 0) return;
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
  }, [view, isLoading, secondsLeft]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const extractExamObject = (raw: string): ReadingExam | null => {
    try {
      const parsed = parseAI(raw);
      const obj = Array.isArray(parsed) ? parsed[0] : parsed;
      if (obj && Array.isArray(obj.parts) && obj.parts.length > 0) {
        return obj as ReadingExam;
      }
    } catch {
      // ناموفق
    }
    try {
      const firstBrace = raw.indexOf('{');
      const lastBrace = raw.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        const directObj = JSON.parse(raw.slice(firstBrace, lastBrace + 1));
        if (directObj && Array.isArray(directObj.parts) && directObj.parts.length > 0) {
          return directObj as ReadingExam;
        }
      }
    } catch {
      // ناموفق
    }
    return null;
  };

  // تولید آزمون جدید با هوش مصنوعی
  const generateNewExam = async () => {
    setView('exam_active');
    setIsLoading(true);
    setUserAnswers({});
    setActivePartIdx(0);
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
Return ONLY a valid JSON object (no markdown, no extra text):
{
  "title": "${examOrg} ${examLevel} – Leseverstehen",
  "durationMinutes": ${spec.duration},
  "parts": [
    {
      "partNumber": 1,
      "partTitle": "Teil 1: ...",
      "instruction": "Instruction in German",
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

  // شروع تمرین از آرشیو
  const startArchivedExam = (exam: ReadingExam) => {
    setCurrentExam(exam);
    setUserAnswers({});
    setActivePartIdx(0);
    setSecondsLeft((exam.durationMinutes || 60) * 60);
    setView('exam_active');
  };

  const handleSelectOption = (qId: number, option: string) => {
    setUserAnswers(prev => ({ ...prev, [qId]: option }));
  };

  const finishExam = () => {
    if (currentExam) {
      saveExamResult(currentExam, userAnswers);
    }
    setView('result');
  };

  const availableLevels: ('A1' | 'A2' | 'B1' | 'B2' | 'C1')[] =
    examOrg === 'EPD' ? ['B2', 'C1'] : ['A1', 'A2', 'B1', 'B2', 'C1'];

  return (
    <div className="space-y-4 text-right max-w-3xl mx-auto pb-10" dir="rtl">
      
      {/* 1. نمای اولیه (منوی اصلی مشابه تب Hören) */}
      {view === 'menu' && (
        <div className="space-y-3">
          <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-3">
              <span className="text-3xl">✨</span>
              <div>
                <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100">ساخت تمرین جدید (Lesen)</h3>
                <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">تولید آزمون‌های استاندارد درک مطلب با هوش مصنوعی</p>
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

      {/* 2. سازنده تمرین جدید (انتخاب سازمان و سطح) */}
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

      {/* 3. مرحله اول آرشیو: انتخاب سطح (خط‌های زیر هم) */}
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

      {/* 4. مرحله دوم آرشیو: لیست آزمون‌های آن سطح */}
      {view === 'archive_exams' && (
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-6 shadow-sm space-y-4 text-right">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="font-extrabold text-base">آزمون‌های سطح {selectedArchiveLevel}</h2>
            <button onClick={() => setView('archive_levels')} className="px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">بازگشت</button>
          </div>

          <div className="space-y-3">
            {archiveExams.filter(e => e.level === selectedArchiveLevel).length === 0 ? (
              <div className="py-12 text-center text-sm text-[#5d6676]">هیچ آزمونی در این سطح ذخیره نشده است. ابتدا یک آزمون جدید بسازید.</div>
            ) : (
              archiveExams.filter(e => e.level === selectedArchiveLevel).map(exam => (
                <div
                  key={exam.id}
                  onClick={() => startArchivedExam(exam)}
                  className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#141923] flex items-center justify-between cursor-pointer hover:border-[#1f5fbf] transition"
                >
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">{exam.title}</h4>
                    <span className="text-xs text-[#5d6676]">سازمان: {exam.org} • تاریخ ساخت: {exam.createdAt || 'اخ اخ'}</span>
                  </div>
                  <span className="bg-[#1f5fbf] text-white px-4 py-2 rounded-xl text-xs font-bold">شروع آزمون ▶</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 5. اجرای آزمون */}
      {view === 'exam_active' && (
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-5 md:p-6 shadow-sm space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <span className="font-extrabold text-sm md:text-base text-[#1f5fbf] dark:text-[#7fb0ff] block">
                {currentExam?.title}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {!isLoading && secondsLeft > 0 && (
                <span className="px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 text-amber-800 text-xs font-mono font-bold flex items-center gap-1.5">
                  <Clock size={14} /> {formatTime(secondsLeft)}
                </span>
              )}
              <button onClick={() => setView('menu')} className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">انصراف</button>
            </div>
          </div>

          {isLoading ? (
            <div className="py-20 text-center space-y-3">
              <span className="text-4xl animate-bounce block">📝</span>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">در حال آماده‌سازی آزمون...</p>
            </div>
          ) : currentExam && currentExam.parts[activePartIdx] ? (
            <div className="space-y-6">
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
                return (
                  <div className="space-y-5">
                    <div className="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 text-xs md:text-sm font-semibold text-indigo-950 dark:text-indigo-200" dir="ltr">
                      <div className="font-extrabold mb-1">{currentPart.partTitle}</div>
                      <div>{currentPart.instruction}</div>
                    </div>

                    <div className="p-4 md:p-5 rounded-2xl bg-slate-50 dark:bg-[#141923] border border-slate-200 dark:border-slate-800">
                      <p className="text-sm md:text-base font-sans leading-7 text-slate-900 dark:text-slate-100 whitespace-pre-line text-left" dir="ltr">
                        {currentPart.text}
                      </p>
                    </div>

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

          {/* جدول مقایسه تلاش‌های قبلی در ستون‌های مجزا */}
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

          {/* بررسی جزئیات پاسخ‌ها */}
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
