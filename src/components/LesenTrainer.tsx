/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { generateWithGemini, parseAI } from '../utils/ai';
import { BookOpen, CheckCircle, Award, ArrowLeft, RefreshCw, Clock } from 'lucide-react';

interface LesenTrainerProps {
  onClose: () => void;
  onShowToast: (msg: string, isErr?: boolean) => void;
}

export const LesenTrainer: React.FC<LesenTrainerProps> = ({ onClose, onShowToast }) => {
  const [step, setStep] = useState<'setup' | 'reading' | 'result'>('setup');
  const [examOrg, setExamOrg] = useState<'ÖSD' | 'Goethe' | 'telc' | 'EPD'>('ÖSD');
  const [examLevel, setExamLevel] = useState<'A1' | 'A2' | 'B1' | 'B2' | 'C1'>('B1');
  
  const [isLoading, setIsLoading] = useState(false);
  const [examData, setExamData] = useState<any>(null);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [score, setScore] = useState<number | null>(null);

  // تولید تمرین خواندن متناسب با نوع آزمون و سطح
  const startExam = async () => {
    setStep('reading');
    setIsLoading(true);
    setUserAnswers({});
    setScore(null);

    let parsedData: any = null;

    try {
      const prompt = `You are an expert German language test creator. Create a formal reading comprehension test (${examOrg} style, Level ${examLevel}).
Return ONLY a valid JSON object with this exact structure, containing NO markdown blocks or extra text:
{
  "title": "Exam Title in German",
  "text": "A realistic reading text in German appropriate for level ${examLevel} (approx. 150-200 words).",
  "questions": [
    {
      "id": 1,
      "question": "Question statement in German",
      "options": ["Option A", "Option B", "Option C"],
      "correct": "Option A"
    },
    {
      "id": 2,
      "question": "Question statement in German",
      "options": ["Option A", "Option B", "Option C"],
      "correct": "Option B"
    },
    {
      "id": 3,
      "question": "Question statement in German",
      "options": ["Option A", "Option B", "Option C"],
      "correct": "Option C"
    }
  ]
}`;

      const res = await generateWithGemini(prompt, { json: true, timeoutMs: 35000 });
      parsedData = parseAI(res);
    } catch (e: any) {
      onShowToast('خطا در ارتباط با هوش مصنوعی. استفاده از داده‌های پیش‌فرض.', true);
    }

    // بررسی ایمنی داده‌های دریافتی برای جلوگیری از خطای map
    if (!parsedData || !Array.isArray(parsedData.questions) || parsedData.questions.length === 0) {
      parsedData = {
        title: `${examOrg} Leseverstehen (${examLevel})`,
        text: 'Wohnen in Wien ist sehr beliebt. Viele Menschen suchen eine Wohnung mit guter Anbindung an die öffentlichen Verkehrsmittel. Besonders Studenten bevorzugen kleine WG-Zimmer im Zentrum.',
        questions: [
          {
            id: 1,
            question: 'Was ist in Wien sehr beliebt?',
            options: ['Wohnen', 'Auto fahren', 'Fliegen'],
            correct: 'Wohnen'
          },
          {
            id: 2,
            question: 'Was bevorzugen besonders Studenten?',
            options: ['Große Häuser', 'Kleine WG-Zimmer', 'Villen'],
            correct: 'Kleine WG-Zimmer'
          }
        ]
      };
    }

    setExamData(parsedData);
    setIsLoading(false);
  };

  // ثبت پاسخ کاربر
  const handleSelectOption = (qId: number, option: string) => {
    setUserAnswers(prev => ({ ...prev, [qId]: option }));
  };

  // ارزیابی و پایان آزمون
  const evaluateExam = () => {
    if (!examData || !Array.isArray(examData.questions)) return;
    let correctCount = 0;
    examData.questions.forEach((q: any) => {
      if (userAnswers[q.id] === q.correct) {
        correctCount++;
      }
    });
    setScore(correctCount);
    setStep('result');
  };

  return (
    <div className="space-y-4 text-right max-w-3xl mx-auto pb-10" dir="rtl">
      {/* مرحله ۱: انتخاب آزمون و سطح */}
      {step === 'setup' && (
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-6 shadow-sm space-y-5 text-right">
          <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <span className="text-3xl">📖</span>
            <div>
              <h2 className="font-extrabold text-base md:text-lg text-slate-900 dark:text-slate-100">بخش خواندن و درک متن (Lesen)</h2>
              <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">تمرین‌های ساختاریافته و استاندارد منطبق بر آزمون‌های رسمی</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold mb-1.5">سازمان برگزاری آزمون:</label>
              <select
                value={examOrg}
                onChange={e => setExamOrg(e.target.value as any)}
                className="w-full bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold outline-none"
              >
                <option value="ÖSD">ÖSD (آزمون رسمی اتریش)</option>
                <option value="Goethe">Goethe-Zertifikat (گته)</option>
                <option value="telc">telc Deutsch (تلک)</option>
                <option value="EPD">EPD (دانشگاهی)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold mb-1.5">انتخاب سطح:</label>
              <select
                value={examLevel}
                onChange={e => setExamLevel(e.target.value as any)}
                className="w-full bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold outline-none"
              >
                <option value="A1">A1 (مبتدی)</option>
                <option value="A2">A2 (پایه)</option>
                <option value="B1">B1 (متوسط)</option>
                <option value="B2">B2 (پیشرفته)</option>
                <option value="C1">C1 (تخصصی)</option>
              </select>
            </div>
          </div>

          <button
            onClick={() => void startExam()}
            className="w-full bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white py-3.5 rounded-xl font-bold text-sm shadow-md transition"
          >
            شروع تمرین Lesen ({examOrg} - {examLevel}) ▶
          </button>
        </div>
      )}

      {/* مرحله ۲: نمایش متن و سوالات */}
      {step === 'reading' && (
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-5 md:p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <span className="font-extrabold text-sm text-[#1f5fbf] dark:text-[#7fb0ff]">
              آزمون {examOrg} - سطح {examLevel}
            </span>
            <button
              onClick={() => setStep('setup')}
              className="px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold"
            >
              لغو و بازگشت
            </button>
          </div>

          {isLoading ? (
            <div className="py-20 text-center space-y-3">
              <span className="text-3xl animate-bounce block">⏳</span>
              <p className="text-sm font-bold text-slate-600 dark:text-slate-300">در حال آماده‌سازی متن خواندن و سوالات استاندارد...</p>
            </div>
          ) : examData ? (
            <div className="space-y-6">
              {/* بخش متن خواندنی */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#141923] border border-slate-200 dark:border-slate-800 space-y-2">
                <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">{examData.title}</h3>
                <p className="text-base font-sans leading-relaxed text-slate-900 dark:text-slate-100" dir="ltr">
                  {examData.text}
                </p>
              </div>

              {/* بخش سوالات چهارگزینه‌ای */}
              <div className="space-y-4">
                <h4 className="font-extrabold text-sm text-slate-800 dark:text-slate-200">سوالات درک مطلب:</h4>
                {Array.isArray(examData.questions) && examData.questions.map((q: any, idx: number) => (
                  <div key={q.id || idx} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5">
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100" dir="ltr">
                      {idx + 1}. {q.question}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" dir="ltr">
                      {Array.isArray(q.options) && q.options.map((opt: string) => {
                        const isSelected = userAnswers[q.id] === opt;
                        return (
                          <button
                            key={opt}
                            onClick={() => handleSelectOption(q.id, opt)}
                            className={`py-2 px-3 rounded-xl text-xs font-bold border transition text-left ${
                              isSelected
                                ? 'bg-[#1f5fbf] text-white border-[#1f5fbf]'
                                : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200'
                            }`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={evaluateExam}
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white py-3.5 rounded-xl font-bold text-sm shadow-md"
              >
                ارسال و بررسی پاسخ‌ها ✓
              </button>
            </div>
          ) : null}
        </div>
      )}

      {/* مرحله ۳: نمایش نتیجه و ارزیابی */}
      {step === 'result' && examData && (
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-6 shadow-sm space-y-5 text-right">
          <div className="text-center space-y-2">
            <span className="text-4xl block">🏆</span>
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">نتیجه آزمون Lesen</h3>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {score} از {Array.isArray(examData.questions) ? examData.questions.length : 0} پاسخ درست
            </p>
          </div>

          <div className="space-y-3 pt-2">
            {Array.isArray(examData.questions) && examData.questions.map((q: any, idx: number) => {
              const userAns = userAnswers[q.id];
              const isCorrect = userAns === q.correct;
              return (
                <div key={q.id || idx} className={`p-3.5 rounded-xl border text-xs space-y-1 ${isCorrect ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200' : 'bg-red-50 dark:bg-red-950/30 border-red-200'}`}>
                  <div className="font-bold text-slate-900 dark:text-slate-100" dir="ltr">
                    {idx + 1}. {q.question}
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <span>پاسخ شما: <strong className={isCorrect ? 'text-emerald-700' : 'text-red-600'} dir="ltr">{userAns || 'پاسخ نداده‌اید'}</strong></span>
                    {!isCorrect && <span>| پاسخ درست: <strong className="text-emerald-700" dir="ltr">{q.correct}</strong></span>}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={() => setStep('setup')}
            className="w-full bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white py-3 rounded-xl font-bold text-sm shadow-md"
          >
            آزمون خواندن جدید 🔄
          </button>
        </div>
      )}
    </div>
  );
};
