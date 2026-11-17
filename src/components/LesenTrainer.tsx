/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { speak, stopSpeaking } from '../utils/audio';
import { describeAiError } from '../utils/aiProvider';
import { ARCHIVE_LESEN, ExamRun, RESULTS_LESEN, S, askJson, loadList, saveList, useNoHelp } from '../utils/trainerKit';
import { ClickableText, WordLookupModal } from './WordLookup';
import type { Word } from '../types';
import { Clock, Printer, Volume2, Square, Eye, EyeOff, Lightbulb, PauseCircle } from 'lucide-react';

interface LesenTrainerProps {
  onClose: () => void;
  onShowToast: (msg: string, isErr?: boolean) => void;
  onQuickAddWord?: (w: Partial<Word>) => boolean;
  exam?: ExamRun;
}

interface ReadingQuestion { id: number; question: string; options: string[]; correct: string; explanation?: string }
interface ReadingPart { partNumber: number; partTitle: string; instruction: string; strategyTip?: string; text: string; questions: ReadingQuestion[] }
interface ReadingExam { id?: string; org: string; level: string; title: string; durationMinutes: number; parts: ReadingPart[]; createdAt?: string }
interface ExamResultRecord {
  id: string; examId: string; examTitle: string; org: string; level: string; date: string; score: number; total: number; percentage: number; userAnswers: Record<number, string>;
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

/** Validates the AI exam: invalid questions are dropped, `correct` is repaired (letter / case) or the question rejected. */
const questionCheck = (x: any): ReadingQuestion => {
  const options: string[] = S.arr(S.req, 2)(x?.options);
  let correct = S.str()(x?.correct);
  if (!options.includes(correct)) {
    const near = options.find(o => o.trim().toLowerCase() === correct.toLowerCase());
    const li = /^[A-D]$/i.test(correct) ? 'ABCD'.indexOf(correct.toUpperCase()) : -1;
    if (near) correct = near; else if (li >= 0 && options[li]) correct = options[li]; else throw new Error('bad correct');
  }
  return { id: 0, question: S.req(x?.question), options, correct, explanation: S.str()(x?.explanation) };
};
const examCheck = (x: any): ReadingExam => {
  const parts: ReadingPart[] = [];
  (Array.isArray(x?.parts) ? x.parts : []).forEach((p: any) => {
    try {
      const questions = S.arr(questionCheck, 2)(p?.questions);
      parts.push({
        partNumber: parts.length + 1, partTitle: S.str()(p?.partTitle) || `Teil ${parts.length + 1}`, instruction: S.str()(p?.instruction),
        strategyTip: S.str()(p?.strategyTip), text: S.req(p?.text), questions
      });
    } catch { /* drop invalid part */ }
  });
  let n = 1;
  parts.forEach(p => p.questions.forEach(q => { q.id = n++; }));
  if (!parts.length || n - 1 < 6) throw new Error('exam too small');
  return { org: '', level: '', title: S.str()(x?.title) || 'Leseverstehen', durationMinutes: S.num(5, 180, 60)(x?.durationMinutes), parts };
};

export const LesenTrainer: React.FC<LesenTrainerProps> = ({ onShowToast, onQuickAddWord, exam: run }) => {
  const [view, setView] = useState<'menu' | 'creator' | 'archive_levels' | 'archive_exams' | 'exam_active' | 'result'>(run ? 'exam_active' : 'menu');

  const [examOrg, setExamOrg] = useState<'ÖSD' | 'Goethe' | 'telc' | 'EPD'>(run ? run.org : 'ÖSD');
  const [examLevel, setExamLevel] = useState<'A1' | 'A2' | 'B1' | 'B2' | 'C1'>(run ? (run.level as any) : 'B2');

  const [archiveExams, setArchiveExams] = useState<ReadingExam[]>(() => loadList<ReadingExam>(ARCHIVE_LESEN));
  const [examResults, setExamResults] = useState<ExamResultRecord[]>(() => loadList<ExamResultRecord>(RESULTS_LESEN));
  const [selectedArchiveLevel, setSelectedArchiveLevel] = useState<string>('');

  const [isLoading, setIsLoading] = useState(false);
  const [loadErr, setLoadErr] = useState('');
  const [currentExam, setCurrentExam] = useState<ReadingExam | null>(null);
  const [activePartIdx, setActivePartIdx] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  const [isTimerPaused, setIsTimerPaused] = useState<boolean>(false);
  const [visibleTexts, setVisibleTexts] = useState<Record<number, boolean>>({});
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);
  const [lookup, setLookup] = useState<string | null>(null);
  const [noHelp, setNoHelp] = useNoHelp();
  const limited = !!run || noHelp; // no strategy tip, no audio, no word lookup, timer never pauses

  useEffect(() => () => { stopSpeaking(); }, []);
  useEffect(() => { stopSpeaking(); setIsPlayingAudio(false); }, [activePartIdx, view]);
  useEffect(() => { if (run) void generateNewExam(); }, []);

  const saveExamToArchive = (e: ReadingExam) => {
    const updated = [e, ...archiveExams.filter(x => x.id !== e.id)];
    setArchiveExams(updated);
    saveList(ARCHIVE_LESEN, updated);
  };

  const saveExamResult = (e: ReadingExam, answers: Record<number, string>): ExamResultRecord => {
    const allQ: ReadingQuestion[] = e.parts.flatMap(p => p.questions || []);
    const correctCount = allQ.filter(q => answers[q.id] === q.correct).length;
    const rec: ExamResultRecord = {
      id: 'res_' + Date.now(), examId: e.id || 'ex_default', examTitle: e.title, org: e.org, level: e.level,
      date: new Date().toLocaleDateString('fa-IR') + ' ' + new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
      score: correctCount, total: allQ.length, percentage: Math.round((correctCount / Math.max(1, allQ.length)) * 100), userAnswers: answers
    };
    const updated = [rec, ...examResults];
    setExamResults(updated);
    saveList(RESULTS_LESEN, updated);
    return rec;
  };

  const finishExam = () => {
    stopSpeaking(); setIsPlayingAudio(false);
    if (!currentExam) return;
    const rec = saveExamResult(currentExam, userAnswers);
    if (run) run.onFinish({ score: rec.score, max: rec.total, note: `${rec.percentage}%` });
    else setView('result');
  };

  useEffect(() => {
    if (view !== 'exam_active' || isLoading || secondsLeft <= 0 || isTimerPaused) return;
    const timer = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) { clearInterval(timer); onShowToast('زمان آزمون به پایان رسید!', true); finishExam(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [view, isLoading, secondsLeft, isTimerPaused]);

  const formatTime = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

  const generateNewExam = async () => {
    setView('exam_active'); setIsLoading(true); setLoadErr('');
    setUserAnswers({}); setActivePartIdx(0); setVisibleTexts({}); setIsTimerPaused(false); setCurrentExam(null);

    const spec = EXAM_SPECS[examOrg]?.[examLevel] || { duration: examLevel === 'A1' || examLevel === 'A2' ? 30 : 65, structure: 'Offizielles mehrteiliges Prüfungsformat.' };
    const wordCountTarget =
      examLevel === 'A1' ? '80-120 words per part' : examLevel === 'A2' ? '130-180 words per part' :
      examLevel === 'B1' ? '220-300 words per part' : '320-450 words per part (authentic journalistic/academic style)';

    const prompt = `You are an official German exam developer for ${examOrg}. Create an authentic, rigorous Reading Comprehension test (Leseverstehen) calibrated to CEFR Level ${examLevel}.
- Organization: ${examOrg}
- Level: ${examLevel}
- Structure: ${spec.structure}
- Length: ${wordCountTarget}.

Create 3 distinct exam parts (Teile) with 4 questions each (total 12 questions numbered sequentially 1 to 12).
Each question has exactly 3 options and "correct" must be the EXACT text of one option.
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
        { "id": 1, "question": "Question in German", "options": ["Option A", "Option B", "Option C"], "correct": "Exact matching string from options", "explanation": "Begründung auf Deutsch + توضیح فارسی" }
      ]
    }
  ]
}`;
    try {
      const ex = await askJson<ReadingExam>(prompt, examCheck, { timeoutMs: 60000 });
      ex.id = 'exam_' + Date.now(); ex.org = examOrg; ex.level = examLevel; ex.createdAt = new Date().toLocaleDateString('fa-IR');
      if (run) ex.durationMinutes = run.minutes;
      setCurrentExam(ex);
      setSecondsLeft((ex.durationMinutes || spec.duration) * 60);
      saveExamToArchive(ex);
    } catch (e: any) {
      if (run) setLoadErr(describeAiError(e));
      else { onShowToast(describeAiError(e), true); setView('menu'); }
    } finally {
      setIsLoading(false);
    }
  };

  const startArchivedExam = (e: ReadingExam) => {
    setCurrentExam(e); setUserAnswers({}); setActivePartIdx(0); setVisibleTexts({}); setIsTimerPaused(false);
    setSecondsLeft((e.durationMinutes || 60) * 60); setView('exam_active');
  };

  const handleToggleAudio = (text: string) => {
    if (isPlayingAudio) { stopSpeaking(); setIsPlayingAudio(false); }
    else { setIsPlayingAudio(true); speak(text, { onEnd: () => setIsPlayingAudio(false) }); }
  };

  const availableLevels: ('A1' | 'A2' | 'B1' | 'B2' | 'C1')[] = examOrg === 'EPD' ? ['B2', 'C1'] : ['A1', 'A2', 'B1', 'B2', 'C1'];
  const card = 'bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a]';

  return (
    <div className="space-y-4 text-right max-w-3xl mx-auto pb-10" dir="rtl">
      {view === 'menu' && (
        <div className="space-y-3">
          <div className={`${card} rounded-2xl p-4 flex items-center justify-between shadow-xs`}>
            <div className="flex items-center gap-3">
              <span className="text-3xl">✨</span>
              <div>
                <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100">ساخت تمرین جدید (Lesen)</h3>
                <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">تولید آزمون‌های استاندارد درک مطلب با هوش مصنوعی و قابلیت Hör-Lesen</p>
              </div>
            </div>
            <button onClick={() => setView('creator')} className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-xs">شروع ساخت ▶</button>
          </div>
          <div className={`${card} rounded-2xl p-4 flex items-center justify-between shadow-xs`}>
            <div className="flex items-center gap-3">
              <span className="text-3xl">📂</span>
              <div>
                <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100">تمرینات قبلی (آرشیو آزمون‌ها)</h3>
                <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">دسترسی به تمام آزمون‌های ساخته‌شده و سوابق مقایسه‌ای</p>
              </div>
            </div>
            <button onClick={() => setView('archive_levels')} className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-xs">مشاهده آرشیو ▶</button>
          </div>
        </div>
      )}

      {view === 'creator' && (
        <div className={`${card} rounded-3xl p-6 shadow-sm space-y-5 text-right`}>
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100">تنظیمات آزمون Lesen</h2>
            <button onClick={() => setView('menu')} className="px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">بازگشت</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold mb-1.5">سازمان برگزاری آزمون:</label>
              <select value={examOrg} onChange={e => { const org = e.target.value as any; setExamOrg(org); if (org === 'EPD' && examLevel !== 'B2' && examLevel !== 'C1') setExamLevel('B2'); }}
                className="w-full bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold outline-none">
                <option value="ÖSD">ÖSD (اتریش و بین‌المللی)</option>
                <option value="Goethe">Goethe-Zertifikat (گته)</option>
                <option value="telc">telc Deutsch (تلک)</option>
                <option value="EPD">EPD (دانشگاهی وین)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold mb-1.5">انتخاب سطح:</label>
              <select value={examLevel} onChange={e => setExamLevel(e.target.value as any)} className="w-full bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold outline-none">
                {availableLevels.map(lvl => <option key={lvl} value={lvl}>سطح {lvl}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <button onClick={() => setNoHelp(!noHelp)} className={`px-3 py-1.5 rounded-full text-xs font-bold border ${noHelp ? 'bg-rose-600 text-white border-rose-600' : 'bg-white dark:bg-[#1b2029] border-[#dde1ea] dark:border-[#333b4a]'}`}>🚫 حالت بدون کمک {noHelp ? '(روشن)' : ''}</button>
            <span className="text-[11px] text-[#5d6676]">بدون راهنما، صدا و ترجمهٔ واژه؛ تایمر هرگز متوقف نمی‌شود</span>
          </div>
          <button onClick={() => void generateNewExam()} className="w-full bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white py-3.5 rounded-xl font-bold text-sm shadow-md">تولید و شروع آزمون استاندارد 🚀</button>
        </div>
      )}

      {view === 'archive_levels' && (
        <div className={`${card} rounded-3xl p-6 shadow-sm space-y-4 text-right`}>
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="font-extrabold text-base">انتخاب سطح از آرشیو تمرینات</h2>
            <button onClick={() => setView('menu')} className="px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">بازگشت</button>
          </div>
          <div className="space-y-2">
            {['A1', 'A2', 'B1', 'B2', 'C1'].map(lvl => (
              <button key={lvl} onClick={() => { setSelectedArchiveLevel(lvl); setView('archive_exams'); }}
                className="w-full p-4 rounded-2xl bg-slate-50 dark:bg-[#141923] border border-slate-200 dark:border-slate-800 flex items-center justify-between hover:border-[#1f5fbf] transition">
                <span className="font-extrabold text-base text-slate-900 dark:text-slate-100">سطح {lvl}</span>
                <span className="px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/50 text-[#1f5fbf] dark:text-[#7fb0ff] text-xs font-bold">{archiveExams.filter(e => e.level === lvl).length} آزمون آماده</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {view === 'archive_exams' && (
        <div className={`${card} rounded-3xl p-6 shadow-sm space-y-4 text-right`}>
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="font-extrabold text-base">آزمون‌های سطح {selectedArchiveLevel}</h2>
            <button onClick={() => setView('archive_levels')} className="px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">بازگشت</button>
          </div>
          <div className="space-y-3">
            {archiveExams.filter(e => e.level === selectedArchiveLevel).length === 0 ? (
              <div className="py-12 text-center text-sm text-[#5d6676]">هیچ آزمونی در این سطح ذخیره نشده است.</div>
            ) : archiveExams.filter(e => e.level === selectedArchiveLevel).map(e => (
              <div key={e.id} onClick={() => startArchivedExam(e)} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#141923] flex items-center justify-between cursor-pointer hover:border-[#1f5fbf] transition">
                <div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">{e.title}</h4>
                  <span className="text-xs text-[#5d6676]">سازمان: {e.org} • تاریخ ساخت: {e.createdAt}</span>
                </div>
                <span className="bg-[#1f5fbf] text-white px-4 py-2 rounded-xl text-xs font-bold">شروع آزمون ▶</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'exam_active' && (
        <div className={`${card} rounded-3xl p-5 md:p-6 shadow-sm space-y-5`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <span className="font-extrabold text-sm md:text-base text-[#1f5fbf] dark:text-[#7fb0ff] block">{currentExam?.title}</span>
            <div className="flex items-center gap-2">
              {!isLoading && secondsLeft > 0 && (
                <span className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-1.5 ${isTimerPaused ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 text-rose-700' : 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 text-amber-800 dark:text-amber-200'}`}>
                  {isTimerPaused ? <PauseCircle size={14} /> : <Clock size={14} />}{formatTime(secondsLeft)}{isTimerPaused && <span className="text-[10px] font-sans">(متوقف)</span>}
                </span>
              )}
              {!run && <button onClick={() => setView('menu')} className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">انصراف</button>}
            </div>
          </div>

          {isLoading ? (
            <div className="py-20 text-center space-y-3">
              <span className="text-4xl animate-bounce block">📝</span>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">در حال طراحی متن‌ها و سؤال‌های آزمون...</p>
            </div>
          ) : loadErr ? (
            <div className="py-10 text-center space-y-3">
              <div className="text-sm text-red-700">{loadErr}</div>
              <button onClick={() => void generateNewExam()} className="px-5 py-2.5 rounded-xl bg-[#1f5fbf] text-white text-sm font-bold">تلاش مجدد</button>
            </div>
          ) : currentExam && currentExam.parts[activePartIdx] ? (
            <div className="space-y-5">
              <div className="grid gap-2 p-1.5 bg-slate-100 dark:bg-[#141923] rounded-2xl" style={{ gridTemplateColumns: `repeat(${currentExam.parts.length}, minmax(0, 1fr))` }}>
                {currentExam.parts.map((part, idx) => (
                  <button key={idx} onClick={() => setActivePartIdx(idx)} className={`py-2 px-2 rounded-xl text-xs font-bold transition ${activePartIdx === idx ? 'bg-[#1f5fbf] text-white shadow-xs' : 'text-slate-700 dark:text-slate-300'}`}>
                    Teil {part.partNumber || idx + 1}
                  </button>
                ))}
              </div>

              {(() => {
                const part = currentExam.parts[activePartIdx];
                const textShown = limited || !!visibleTexts[activePartIdx];
                return (
                  <div className="space-y-5">
                    {!limited && (
                      <div className="p-3.5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/80 text-xs space-y-1">
                        <div className="font-extrabold text-amber-800 dark:text-amber-300 flex items-center gap-1.5"><Lightbulb size={15} /><span>استراتژی و تکنیک حل سریع این بخش:</span></div>
                        <p className="text-slate-700 dark:text-slate-200 leading-relaxed">{part.strategyTip || 'ابتدا کلیدواژه‌های سؤالات را بخوانید و سپس در متن به دنبال مترادف‌ها و مفهوم اصلی بگردید.'}</p>
                      </div>
                    )}

                    <div className="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 text-xs md:text-sm font-semibold text-indigo-950 dark:text-indigo-200" dir="ltr">
                      <div className="font-extrabold mb-1">{part.partTitle}</div>
                      <div>{part.instruction}</div>
                    </div>

                    {!limited && (
                      <div className="p-4 rounded-2xl bg-gradient-to-l from-blue-50 to-indigo-50/60 dark:from-[#161e2e] dark:to-[#1a2236] border border-blue-200 dark:border-blue-900/60 space-y-3">
                        <div className="flex items-start gap-2.5">
                          <span className="text-2xl">🎧</span>
                          <div className="flex-1">
                            <h4 className="font-extrabold text-xs md:text-sm text-slate-900 dark:text-slate-100">پیشنهاد تقویتی: ابتدا به فایل صوتی گوش دهید و مهارت Hören خود را بسنجید!</h4>
                            <p className="text-[11px] text-[#5d6676] dark:text-[#a3adbd] mt-0.5">متن این بخش به صورت پیش‌فرض مخفی است. هر زمان نیاز داشتید می‌توانید متن را باز یا بسته کنید.</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button type="button" onClick={() => handleToggleAudio(part.text)} className={`px-4 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 shadow-xs ${isPlayingAudio ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[#1f5fbf] hover:bg-[#194ea0]'}`}>
                            {isPlayingAudio ? <><Square size={14} /> توقف پخش صدا</> : <><Volume2 size={15} /> پخش صوتی متن</>}
                          </button>
                          <button type="button" onClick={() => setVisibleTexts(prev => ({ ...prev, [activePartIdx]: !prev[activePartIdx] }))} className="px-4 py-2.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 shadow-xs">
                            {textShown ? <><EyeOff size={15} /> مخفی کردن متن</> : <><Eye size={15} /> نمایش متن</>}
                          </button>
                        </div>
                      </div>
                    )}

                    {textShown && (
                      <div className="p-4 md:p-5 rounded-2xl bg-slate-50 dark:bg-[#141923] border border-slate-200 dark:border-slate-800 space-y-2">
                        {!limited && <div className="text-[11px] text-[#1f5fbf] dark:text-[#7fb0ff] font-bold border-b border-slate-200/70 dark:border-slate-800 pb-2 mb-2">💡 روی هر کلمه کلیک کنید تا معنی آن را ببینید و به واژه‌نامه اضافه کنید (تایمر متوقف می‌شود).</div>}
                        <div className="text-sm md:text-base font-sans text-slate-900 dark:text-slate-100 text-left select-text" dir="ltr">
                          <ClickableText text={part.text} disabled={limited} onWord={w => { setIsTimerPaused(true); setLookup(w); }} />
                        </div>
                      </div>
                    )}

                    <div className="space-y-4">
                      {part.questions.map(q => (
                        <div key={q.id} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 bg-white dark:bg-[#1b2029]">
                          <p className="text-sm md:text-base font-bold text-slate-900 dark:text-slate-100 text-left" dir="ltr">{q.id}. {q.question}</p>
                          <div className="space-y-2" dir="ltr">
                            {q.options.map((opt, oi) => (
                              <button key={oi} onClick={() => setUserAnswers(prev => ({ ...prev, [q.id]: opt }))}
                                className={`w-full py-2.5 px-3.5 rounded-xl text-xs md:text-sm font-semibold border transition text-left ${userAnswers[q.id] === opt ? 'bg-[#1f5fbf] text-white border-[#1f5fbf]' : 'bg-slate-50 dark:bg-[#141923] border-slate-200 text-slate-800 dark:text-slate-200'}`}>{opt}</button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                {activePartIdx > 0 ? <button onClick={() => setActivePartIdx(p => p - 1)} className="px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">بخش قبلی</button> : <div />}
                {activePartIdx < currentExam.parts.length - 1
                  ? <button onClick={() => setActivePartIdx(p => p + 1)} className="bg-[#1f5fbf] text-white px-5 py-3 rounded-xl font-bold text-xs">بخش بعدی ◀</button>
                  : <button onClick={finishExam} className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-6 py-3 rounded-xl font-bold text-xs">{run ? 'پایان بخش Lesen ✓' : 'پایان آزمون و مشاهده کارنامه ✓'}</button>}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {lookup && (
        <WordLookupModal word={lookup} level={examLevel} cat="Lesen" paused onQuickAddWord={onQuickAddWord}
          onClose={() => { setLookup(null); setIsTimerPaused(false); }} />
      )}

      {view === 'result' && currentExam && (
        <div className={`${card} rounded-3xl p-6 shadow-sm space-y-6 text-right print:bg-white print:text-black`}>
          <div className="flex items-center justify-between print:hidden">
            <button onClick={() => setView('menu')} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">بازگشت به منو</button>
            <button onClick={() => window.print()} className="px-4 py-2 rounded-xl bg-[#1f5fbf] text-white text-xs font-bold flex items-center gap-1.5"><Printer size={16} /> چاپ کارنامه (PDF / iOS)</button>
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
                <thead><tr className="bg-slate-100 dark:bg-slate-800">
                  <th className="p-2 border border-slate-200 dark:border-slate-700">تاریخ ثبت</th>
                  {examResults.filter(r => r.examId === currentExam.id).map((r, i) => <th key={r.id} className="p-2 border border-slate-200 dark:border-slate-700">تلاش {i + 1}</th>)}
                </tr></thead>
                <tbody><tr>
                  <td className="p-2 border border-slate-200 dark:border-slate-700 font-bold">درصد موفقیت</td>
                  {examResults.filter(r => r.examId === currentExam.id).map(r => <td key={r.id} className="p-2 border border-slate-200 dark:border-slate-700 font-extrabold text-emerald-600">{r.percentage}% ({r.score}/{r.total})</td>)}
                </tr></tbody>
              </table>
            </div>
          </div>
          <div className="space-y-4 pt-4">
            <h4 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">بررسی سوالات و پاسخ‌های شما:</h4>
            {currentExam.parts.flatMap(p => p.questions).map(q => {
              const ua = userAnswers[q.id]; const ok = ua === q.correct;
              return (
                <div key={q.id} className={`p-4 rounded-2xl border text-xs space-y-1.5 ${ok ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200' : 'bg-red-50 dark:bg-red-950/30 border-red-200'}`}>
                  <div className="font-bold text-slate-900 dark:text-slate-100 text-left" dir="ltr">{q.id}. {q.question}</div>
                  <div className="flex gap-4">
                    <span>پاسخ شما: <strong className={ok ? 'text-emerald-700' : 'text-red-600'} dir="ltr">{ua || 'نداده'}</strong></span>
                    {!ok && <span>پاسخ صحیح: <strong className="text-emerald-700" dir="ltr">{q.correct}</strong></span>}
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
