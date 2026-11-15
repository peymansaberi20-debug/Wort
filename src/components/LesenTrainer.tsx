/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { generateWithGemini, parseAI } from '../utils/ai';
import { Clock } from 'lucide-react';

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
  title: string;
  durationMinutes: number;
  parts: ReadingPart[];
}

const EXAM_SPECS: Record<string, Record<string, { duration: number; structure: string }>> = {
  ÖSD: {
    A1: { duration: 30, structure: '2 Teile: Kurze Mitteilungen/Anzeigen (Richtig/Falsch) und Alltags-Informationen (Multiple Choice).' },
    A2: { duration: 40, structure: '2 Teile: Zeitungsanzeigen zuordnen und ein Informationstext mit Multiple-Choice-Aufgaben.' },
    B1: { duration: 65, structure: '4 Teile: Teil 1 (Überschriften zuordnen), Teil 2 (Pressetext - Detailverstehen), Teil 3 (Situationen/Anzeigen zuordnen), Teil 4 (Lückentext/Sprachbausteine).' },
    B2: { duration: 90, structure: '4 Teile: Teil 1 (Längerer Sachtext/Kommentar - komplexe Multiple-Choice-Fragen), Teil 2 (Überschriften/Abschnitte zuordnen), Teil 3 (Lückentext mit Satzteilen/Wörtern), Teil 4 (Lexik/Grammatik im Kontext).' },
    C1: { duration: 90, structure: '4 Teile: Wissenschaftliche/feuilletonistische Texte, präzises Detail- und Schlussfolgerungsverstehen, komplexe Textrekonstruktion.' }
  },
  Goethe: {
    A1: { duration: 25, structure: '3 Teile: Kurze E-Mails/Notizen, Informationsschilder und Hinweistafeln.' },
    A2: { duration: 30, structure: '4 Teile: Zeitungsartikel, Veranstaltungskalender, E-Mails und Online-Anzeigen.' },
    B1: { duration: 65, structure: '5 Teile: Teil 1 (Blogbeitrag - Richtig/Falsch), Teil 2 (2 Pressetexte - Multiple Choice), Teil 3 (Anzeigen zuordnen), Teil 4 (Leserbriefe/Meinungen - Ja/Nein), Teil 5 (Hausordnung/Regeln - Multiple Choice).' },
    B2: { duration: 65, structure: '5 Teile: Teil 1 (Forumsbeiträge zuordnen), Teil 2 (Magazinartikel - Absätze zuordnen), Teil 3 (Kommentar/Essay - Multiple Choice), Teil 4 (Leserbriefe/Standpunkte zuordnen), Teil 5 (Vertrags-/Ordnungstext).' },
    C1: { duration: 70, structure: '4 Teile: Anspruchsvolle Sachtexte, Rekonstruktion von Textlücken, Meinungszuordnung und detaillierte Textanalyse.' }
  },
  telc: {
    A1: { duration: 25, structure: '3 Teile: Kurze Notizen, Anzeigen und Schilder.' },
    A2: { duration: 30, structure: '3 Teile: Alltagsmitteilungen, Anzeigen und kurze Artikel.' },
    B1: { duration: 90, structure: '3 Teile Leseverstehen + 2 Teile Sprachbausteine: Globalverstehen (Überschriften), Detailverstehen (Pressetext), Selektives Verstehen (Anzeigen) und Grammatik/Wortschatz-Lückentext.' },
    B2: { duration: 90, structure: '3 Teile Leseverstehen + 2 Teile Sprachbausteine: Globalverstehen (komplexe Überschriften), Detailverstehen (langer Sachtext), Selektives Verstehen (Situationen/Anzeigen) und Sprachbausteine (Wortschatz & Strukturen).' },
    C1: { duration: 90, structure: '4 Teile: Textrekonstruktion, selektives Verstehen, Detailverstehen wissenschaftlicher Texte und Sprachbausteine.' }
  },
  EPD: {
    B2: { duration: 90, structure: 'Universitäres Prüfungsformat (Wien): Wissenschaftsorientierter Sachtext mit komplexen Verständnisfragen, Textkohärenz und akademischem Wortschatz.' },
    C1: { duration: 90, structure: 'Universitäres Prüfungsformat (Wien): Akademischer Fachtext, komplexe Argumentationsstrukturen, Schlussfolgerungen und Sprachstrukturen.' }
  }
};

export const LesenTrainer: React.FC<LesenTrainerProps> = ({ onShowToast }) => {
  const [step, setStep] = useState<'setup' | 'reading' | 'result'>('setup');
  const [examOrg, setExamOrg] = useState<'ÖSD' | 'Goethe' | 'telc' | 'EPD'>('ÖSD');
  const [examLevel, setExamLevel] = useState<'A1' | 'A2' | 'B1' | 'B2' | 'C1'>('B2');

  const [isLoading, setIsLoading] = useState(false);
  const [examData, setExamData] = useState<ReadingExam | null>(null);
  const [activePartIdx, setActivePartIdx] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  // مدیریت تایمر آزمون
  useEffect(() => {
    if (step !== 'reading' || isLoading || secondsLeft <= 0) return;
    const timer = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          onShowToast('زمان آزمون به پایان رسید!', true);
          setStep('result');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [step, isLoading, secondsLeft, onShowToast]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // استخراج ایمن آبجکت آزمون از پاسخ هوش مصنوعی
  const extractExamObject = (raw: string): ReadingExam | null => {
    try {
      const parsed = parseAI(raw);
      const obj = Array.isArray(parsed) ? parsed[0] : parsed;
      if (obj && Array.isArray(obj.parts) && obj.parts.length > 0) {
        return obj as ReadingExam;
      }
    } catch {
      // ادامه به روش استخراج مستقیم
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

  const startExam = async () => {
    setStep('reading');
    setIsLoading(true);
    setUserAnswers({});
    setActivePartIdx(0);
    setExamData(null);

    const spec = EXAM_SPECS[examOrg]?.[examLevel] || {
      duration: examLevel === 'A1' || examLevel === 'A2' ? 30 : 65,
      structure: 'Offizielles mehrteiliges Prüfungsformat mit authentischen Texten.'
    };

    const wordCountTarget =
      examLevel === 'A1' ? '80-120 words per part' :
      examLevel === 'A2' ? '130-180 words per part' :
      examLevel === 'B1' ? '220-300 words per part' :
      '320-450 words per part (sophisticated vocabulary, complex subordinate clauses, passive voice, nominalizations, realistic journalistic/academic style)';

    const prompt = `You are an official German exam developer for ${examOrg}. Create an authentic, rigorous, exam-level Reading Comprehension test (Leseverstehen) strictly calibrated to CEFR Level ${examLevel}.

EXAM FORMAT SPECIFICATION:
- Organization: ${examOrg}
- Level: ${examLevel}
- Official Structure Reference: ${spec.structure}
- Text Length & Complexity Requirement: ${wordCountTarget}.
- IMPORTANT: Do NOT write simple beginner sentences if level is B1, B2, or C1! Use authentic, challenging, nuanced German appropriate for ${examLevel} with plausible distractors where the learner must read carefully to distinguish subtle differences in meaning.

Create 3 distinct exam parts (Teile) reflecting the real ${examOrg} ${examLevel} module (e.g., Teil 1: Sachtext / Detailverstehen, Teil 2: Meinungen / Leserbriefe / Zuordnung, Teil 3: Sprachbausteine / Lückentext im Kontext).
Each part must have 4 questions (total 12 questions, numbered sequentially 1 to 12).

Return ONLY a valid JSON object (no markdown fences, no commentary) with this exact schema:
{
  "title": "${examOrg} Zertifikat ${examLevel} – Leseverstehen",
  "durationMinutes": ${spec.duration},
  "parts": [
    {
      "partNumber": 1,
      "partTitle": "Teil 1: ...",
      "instruction": "Clear German exam instruction for this part",
      "text": "Full authentic German reading text for Teil 1...",
      "questions": [
        {
          "id": 1,
          "question": "Detailed question or statement in German",
          "options": ["Option A", "Option B", "Option C"],
          "correct": "Exact matching string from options",
          "explanation": "Kurze Begründung mit Textbeleg auf Deutsch + توضیح کوتاه فارسی"
        }
      ]
    }
  ]
}`;

    try {
      const res = await generateWithGemini(prompt, { json: true, timeoutMs: 60000, retries: 1 });
      const extracted = extractExamObject(res);

      if (!extracted) {
        throw new Error('ساختار آزمون دریافتی ناقص بود.');
      }

      // اطمینان از یکتا بودن شماره سوالات
      let qCounter = 1;
      extracted.parts.forEach(p => {
        if (Array.isArray(p.questions)) {
          p.questions.forEach(q => {
            q.id = qCounter++;
          });
        }
      });

      setExamData(extracted);
      setSecondsLeft((extracted.durationMinutes || spec.duration) * 60);
    } catch (e: any) {
      onShowToast(e?.message || 'خطا در تولید آزمون با هوش مصنوعی. لطفاً دوباره تلاش کنید.', true);
      setStep('setup');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectOption = (qId: number, option: string) => {
    setUserAnswers(prev => ({ ...prev, [qId]: option }));
  };

  const allQuestions: ReadingQuestion[] = examData?.parts?.flatMap(p => p.questions || []) || [];
  const answeredCount = allQuestions.filter(q => !!userAnswers[q.id]).length;
  const totalScore = allQuestions.filter(q => userAnswers[q.id] === q.correct).length;

  const availableLevels: ('A1' | 'A2' | 'B1' | 'B2' | 'C1')[] =
    examOrg === 'EPD' ? ['B2', 'C1'] : ['A1', 'A2', 'B1', 'B2', 'C1'];

  const handleOrgChange = (newOrg: 'ÖSD' | 'Goethe' | 'telc' | 'EPD') => {
    setExamOrg(newOrg);
    if (newOrg === 'EPD' && examLevel !== 'B2' && examLevel !== 'C1') {
      setExamLevel('B2');
    }
  };

  const currentSpec = EXAM_SPECS[examOrg]?.[examLevel];

  return (
    <div className="space-y-4 text-right max-w-3xl mx-auto pb-10" dir="rtl">
      {/* مرحله ۱: انتخاب آزمون و سطح */}
      {step === 'setup' && (
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-6 shadow-sm space-y-5 text-right">
          <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <span className="text-3xl">📖</span>
            <div>
              <h2 className="font-extrabold text-base md:text-lg text-slate-900 dark:text-slate-100">
                آزمون‌های درک مطلب (Lesen – Prüfungstraining)
              </h2>
              <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">
                شبیه‌سازی استاندارد و چندبخشی منطبق بر ساختار رسمی آزمون‌ها
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold mb-1.5">سازمان برگزاری آزمون:</label>
              <select
                value={examOrg}
                onChange={e => handleOrgChange(e.target.value as any)}
                className="w-full bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold outline-none"
              >
                <option value="ÖSD">ÖSD (اتریش و بین‌المللی)</option>
                <option value="Goethe">Goethe-Zertifikat (گته)</option>
                <option value="telc">telc Deutsch (تلک)</option>
                <option value="EPD">EPD (آزمون دانشگاهی وین)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold mb-1.5">انتخاب سطح:</label>
              <select
                value={examLevel}
                onChange={e => setExamLevel(e.target.value as any)}
                className="w-full bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold outline-none"
              >
                {availableLevels.map(lvl => (
                  <option key={lvl} value={lvl}>
                    سطح {lvl}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* نمایش مشخصات ساختار رسمی آزمون انتخاب‌شده */}
          {currentSpec && (
            <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/70 space-y-1.5 text-xs">
              <div className="font-extrabold text-[#1f5fbf] dark:text-[#7fb0ff] flex items-center justify-between">
                <span>📋 ساختار رسمی {examOrg} ({examLevel})</span>
                <span>⏱ زمان استاندارد: {currentSpec.duration} دقیقه</span>
              </div>
              <p className="text-slate-700 dark:text-slate-300 leading-relaxed font-sans" dir="ltr">
                {currentSpec.structure}
              </p>
            </div>
          )}

          <button
            onClick={() => void startExam()}
            className="w-full bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white py-3.5 rounded-xl font-bold text-sm shadow-md transition active:scale-[0.99]"
          >
            ساخت و شروع آزمون استاندارد {examOrg} ({examLevel}) ▶
          </button>
        </div>
      )}

      {/* مرحله ۲: اجرای آزمون چندبخشی */}
      {step === 'reading' && (
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-5 md:p-6 shadow-sm space-y-5">
          {/* هدر وضعیت آزمون و تایمر */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <span className="font-extrabold text-sm md:text-base text-[#1f5fbf] dark:text-[#7fb0ff] block">
                {examData?.title || `آزمون ${examOrg} – سطح ${examLevel}`}
              </span>
              {!isLoading && examData && (
                <span className="text-xs text-[#5d6676] dark:text-[#a3adbd]">
                  پاسخ داده‌شده: {answeredCount} از {allQuestions.length} سؤال
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {!isLoading && secondsLeft > 0 && (
                <span className="px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs font-mono font-bold flex items-center gap-1.5">
                  <Clock size={14} />
                  {formatTime(secondsLeft)}
                </span>
              )}
              <button
                onClick={() => setStep('setup')}
                className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              >
                انصراف
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="py-20 text-center space-y-3">
              <span className="text-4xl animate-bounce block">📝</span>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                در حال طراحی متن‌های تحلیلی و سؤالات استاندارد سطح {examLevel} ({examOrg})...
              </p>
              <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">
                تولید چند بخش آزمونی متناسب با سطح انتخابی ممکن است ۱۰ تا ۲۰ ثانیه زمان ببرد.
              </p>
            </div>
          ) : examData && examData.parts[activePartIdx] ? (
            <div className="space-y-6">
              {/* ناوبری بین بخش‌های آزمون (Teil 1, Teil 2, Teil 3) */}
              <div className="grid grid-cols-3 gap-2 p-1.5 bg-slate-100 dark:bg-[#141923] rounded-2xl">
                {examData.parts.map((part, idx) => {
                  const partAnswered = part.questions.filter(q => !!userAnswers[q.id]).length;
                  return (
                    <button
                      key={part.partNumber || idx}
                      onClick={() => setActivePartIdx(idx)}
                      className={`py-2 px-2 rounded-xl text-xs font-bold transition flex flex-col items-center gap-0.5 ${
                        activePartIdx === idx
                          ? 'bg-[#1f5fbf] text-white shadow-xs'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span>Teil {part.partNumber || idx + 1}</span>
                      <span className="text-[10px] opacity-80">
                        ({partAnswered}/{part.questions.length})
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* محتوای بخش فعال */}
              {(() => {
                const currentPart = examData.parts[activePartIdx];
                return (
                  <div className="space-y-5">
                    {/* دستورالعمل بخش */}
                    <div className="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/70 text-xs md:text-sm font-semibold text-indigo-950 dark:text-indigo-200" dir="ltr">
                      <div className="font-extrabold mb-1">{currentPart.partTitle}</div>
                      <div>{currentPart.instruction}</div>
                    </div>

                    {/* متن اصلی */}
                    <div className="p-4 md:p-5 rounded-2xl bg-slate-50 dark:bg-[#141923] border border-slate-200 dark:border-slate-800 space-y-2">
                      <p className="text-sm md:text-base font-sans leading-7 text-slate-900 dark:text-slate-100 whitespace-pre-line text-left" dir="ltr">
                        {currentPart.text}
                      </p>
                    </div>

                    {/* سوالات این بخش */}
                    <div className="space-y-4">
                      {currentPart.questions.map(q => (
                        <div key={q.id} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 bg-white dark:bg-[#1b2029]">
                          <p className="text-sm md:text-base font-bold text-slate-900 dark:text-slate-100 text-left" dir="ltr">
                            {q.id}. {q.question}
                          </p>
                          <div className="space-y-2" dir="ltr">
                            {Array.isArray(q.options) && q.options.map((opt, optIdx) => {
                              const isSelected = userAnswers[q.id] === opt;
                              const letter = String.fromCharCode(65 + optIdx);
                              return (
                                <button
                                  key={optIdx}
                                  onClick={() => handleSelectOption(q.id, opt)}
                                  className={`w-full py-2.5 px-3.5 rounded-xl text-xs md:text-sm font-semibold border transition text-left flex items-start gap-2.5 ${
                                    isSelected
                                      ? 'bg-[#1f5fbf] text-white border-[#1f5fbf] shadow-xs'
                                      : 'bg-slate-50 dark:bg-[#141923] border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-[#1f5fbf]'
                                  }`}
                                >
                                  <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700'}`}>
                                    {letter}
                                  </span>
                                  <span className="flex-1">{opt}</span>
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

              {/* دکمه‌های جابه‌جایی بین بخش‌ها و تحویل نهایی */}
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                {activePartIdx > 0 ? (
                  <button
                    onClick={() => setActivePartIdx(prev => prev - 1)}
                    className="px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs md:text-sm font-bold"
                  >
                    ▶ بخش قبلی
                  </button>
                ) : (
                  <div />
                )}

                {activePartIdx < examData.parts.length - 1 ? (
                  <button
                    onClick={() => setActivePartIdx(prev => prev + 1)}
                    className="bg-[#1f5fbf] text-white px-5 py-3 rounded-xl font-bold text-xs md:text-sm shadow-xs"
                  >
                    بخش بعدی (Teil {activePartIdx + 2}) ◀
                  </button>
                ) : (
                  <button
                    onClick={() => setStep('result')}
                    className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-6 py-3 rounded-xl font-bold text-xs md:text-sm shadow-md"
                  >
                    پایان آزمون و مشاهده کارنامه ✓
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* مرحله ۳: کارنامه تحلیلی و استناد متنی */}
      {step === 'result' && examData && (
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-6 shadow-sm space-y-6 text-right">
          <div className="text-center space-y-2 border-b border-slate-100 dark:border-slate-800 pb-5">
            <span className="text-4xl block">🎓</span>
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
              کارنامه آزمون {examOrg} – سطح {examLevel}
            </h3>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {totalScore} از {allQuestions.length} امتیاز ({Math.round((totalScore / Math.max(1, allQuestions.length)) * 100)}٪)
            </div>
            <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">
              حد نصاب قبولی در آزمون‌های رسمی {examOrg} معمولاً ۶۰٪ است.
            </p>
          </div>

          <div className="space-y-5">
            {examData.parts.map((part, pIdx) => (
              <div key={pIdx} className="space-y-3">
                <h4 className="font-extrabold text-sm text-[#1f5fbf] dark:text-[#7fb0ff]" dir="ltr">
                  {part.partTitle}
                </h4>
                {part.questions.map(q => {
                  const userAns = userAnswers[q.id];
                  const isCorrect = userAns === q.correct;
                  return (
                    <div
                      key={q.id}
                      className={`p-4 rounded-2xl border text-xs md:text-sm space-y-2 ${
                        isCorrect
                          ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900'
                          : 'bg-red-50/70 dark:bg-red-950/30 border-red-200 dark:border-red-900'
                      }`}
                    >
                      <div className="font-bold text-slate-900 dark:text-slate-100 text-left" dir="ltr">
                        {q.id}. {q.question}
                      </div>
                      <div className="space-y-1 text-xs">
                        <div>
                          پاسخ شما:{' '}
                          <strong className={isCorrect ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-400'} dir="ltr">
                            {userAns || 'بدون پاسخ'}
                          </strong>
                        </div>
                        {!isCorrect && (
                          <div>
                            پاسخ صحیح:{' '}
                            <strong className="text-emerald-700 dark:text-emerald-300" dir="ltr">
                              {q.correct}
                            </strong>
                          </div>
                        )}
                      </div>
                      {q.explanation && (
                        <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                          💡 <strong>توضیح و استناد متنی:</strong> {q.explanation}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <button
            onClick={() => setStep('setup')}
            className="w-full bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white py-3.5 rounded-xl font-bold text-sm shadow-md"
          >
            شروع آزمون خواندن جدید 🔄
          </button>
        </div>
      )}
    </div>
  );
};
