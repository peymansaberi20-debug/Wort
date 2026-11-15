/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { generateWithGemini, parseAI } from '../utils/ai';
import { speak, stopSpeaking, getTtsWorkerBase } from '../utils/audio';

type ExamType = 'Standard' | 'Goethe' | 'OESD' | 'Telc' | 'EPD';

type TF = { statement: string; answer: boolean; explanation: string; translation?: string };
type MC = { question: string; options: string[]; answerIndex: number; explanation: string; translation?: string };
type Gap = { sentence: string; answer: string; translation?: string };
type Short = { question: string; answer: string; translation?: string };
type Vocab = { word: string; meaning: string };

type Grade = {
  correct: boolean;
  points: number;
  feedback: string;
  feedbackFa: string;
};

type SectionScore = {
  label: string;
  earned: number;
  total: number;
  percentage: number;
};

type GradingResult = {
  score: number;
  maxScore: number;
  percentage: number;
  gradeLabel: string;
  passed: boolean;
  sections: SectionScore[];
  teacherComment: string;
  teacherCommentFa: string;
  strengths: string;
  recommendations: string;
  details: Record<string, Grade>;
};

type HistoryAttempt = {
  date: string;
  score: number;
  maxScore: number;
  percentage: number;
  gradeLabel: string;
  passed: boolean;
};

type Exercise = {
  title: string;
  examType: ExamType;
  level: string;
  part1TF: TF[];
  part2MC: MC[];
  part3Gap: Gap[];
  part4Short: Short[];
  vocabulary: Vocab[];
};

type SavedExerciseRecord = {
  id: string;
  createdAt: string;
  title: string;
  examType: ExamType;
  level: string;
  transcript: string;
  exercise: Exercise;
  sentencePairsCache?: { de: string; fa: string }[];
  audioUrl?: string;
  answers: Record<string, string>;
  submitted: boolean;
  result: GradingResult | null;
  historyAttempts?: HistoryAttempt[];
};

const ARCHIVE_STORAGE_KEY = 'hoeren_trainer_archive_list_v3';
const DEFAULT_TTS_WORKER = 'https://wort-tts.peymansaberi20.workers.dev';

const EXAM_LABELS: Record<ExamType, string> = {
  Standard: 'Standard / Allgemein',
  Goethe: 'Goethe-Zertifikat',
  OESD: 'ÖSD',
  Telc: 'telc Deutsch',
  EPD: 'EPD (Uni Wien / VWU)',
};

const EXAM_INSTRUCTIONS: Record<ExamType, string> = {
  Standard: `
- Stil: Allgemeines deutsches Hörverstehen-Arbeitsblatt.
- Aufteilung:
  * part1TF: 3 Richtig/Falsch-Aussagen
  * part2MC: 2 Multiple-Choice-Fragen (je 3 Optionen: A, B, C)
  * part3Gap: 3 Lückensätze
  * part4Short: 2 offene Verständnisfragen
  * vocabulary: 4 wichtige Wörter/Ausdrücke aus dem Text`,
  Goethe: `
- Stil: Goethe-Zertifikat Hörverstehen. Fokus auf Global-, Detail- und selektives Verstehen.
- Aufteilung:
  * part1TF: 4 Richtig/Falsch-Aussagen
  * part2MC: 4 Multiple-Choice-Fragen (je 3 Optionen)
  * part3Gap: 0 Lückensätze (leeres Array [])
  * part4Short: 0 offene Fragen (leeres Array [])
  * vocabulary: 3 prüfungsrelevante Ausdrücke`,
  OESD: `
- Stil: ÖSD (Österreichisches Sprachdiplom Deutsch). Fokus auf präzise Detailinformationen und Zahlen/Fakten.
- Aufteilung:
  * part1TF: 3 Richtig/Falsch-Aussagen
  * part2MC: 2 Multiple-Choice-Fragen (je 3 Optionen)
  * part3Gap: 3 Lückensätze (Notizen/Stichworte ergänzen)
  * part4Short: 1 offene Detailfrage
  * vocabulary: 3 relevante Wörter/Wendungen`,
  Telc: `
- Stil: telc Deutsch Hörverstehen.
- Aufteilung:
  * part1TF: 5 Richtig/Falsch-Aussagen
  * part2MC: 4 Multiple-Choice-Fragen (je 3 Optionen)
  * part3Gap: 0 Lückensätze (leeres Array [])
  * part4Short: 0 offene Fragen (leeres Array [])
  * vocabulary: 3 wichtige Begriffe`,
  EPD: `
- Stil: EPD (Ergänzungsprüfung Deutsch für österreichische Universitäten / VWU). Akademisches Hochschulniveau.
- Aufteilung:
  * part1TF: 2 anspruchsvolle Richtig/Falsch-Aussagen
  * part2MC: 2 akademische Multiple-Choice-Fragen (je 3 Optionen)
  * part3Gap: 3 komplexe Lückensätze
  * part4Short: 3 offene Verständnis- und Synthesefragen
  * vocabulary: 4 akademische/gehobene Ausdrücke aus dem Transkript`,
};

function getOfficialGradeInfo(percentage: number) {
  const passed = percentage >= 60;
  if (percentage >= 90) return { gradeLabel: 'Sehr gut (1)', passed };
  if (percentage >= 80) return { gradeLabel: 'Gut (2)', passed };
  if (percentage >= 70) return { gradeLabel: 'Befriedigend (3)', passed };
  if (percentage >= 60) return { gradeLabel: 'Ausreichend (4)', passed };
  return { gradeLabel: 'Nicht bestanden (5)', passed: false };
}

function buildPrompt(examType: ExamType, level: string): string {
  return `
Erstelle eine HÖRVERSTEHEN-Prüfung im exakten Stil von: "${EXAM_LABELS[examType]}" auf dem Sprachniveau "${level}".
Benutze ausschließlich Informationen aus dem Transkript. Erfinde keine Fakten.
Antworte ausschließlich mit gültigem JSON, ohne Markdown-Blöcke.

Spezifische Prüfungsanforderungen für ${examType} (${level}):
${EXAM_INSTRUCTIONS[examType]}

JSON-Schema (halte dich exakt an diese Schlüssel und füge zu jeder Frage/Aussage "translation" mit der persischen Übersetzung hinzu):
{
  "title": "Passender Prüfungstitel",
  "examType": "${examType}",
  "level": "${level}",
  "part1TF": [
    {"statement": "Aussage auf Deutsch", "answer": true, "explanation": "Kurze Begründung auf Deutsch", "translation": "ترجمه فارسی"}
  ],
  "part2MC": [
    {"question": "Frage auf Deutsch", "options": ["Option A", "Option B", "Option C"], "answerIndex": 0, "explanation": "Begründung auf Deutsch", "translation": "ترجمه فارسی"}
  ],
  "part3Gap": [
    {"sentence": "Satz mit _____ auf Deutsch", "answer": "fehlender Text", "translation": "ترجمه فارسی جمله"}
  ],
  "part4Short": [
    {"question": "Offene Frage auf Deutsch", "answer": "Musterantwort auf Deutsch", "translation": "ترجمه فارسی"}
  ],
  "vocabulary": [
    {"word": "Wort aus dem Text", "meaning": "Einfache Erklärung auf Deutsch"}
  ]
}
`;
}

function normalize(data: any, fallbackExam: ExamType, fallbackLevel: string): Exercise {
  const tf = (arr: any): TF[] =>
    (Array.isArray(arr) ? arr : []).map((q: any) => ({
      statement: String(q?.statement || ''),
      answer: q?.answer === true || String(q?.answer).toLowerCase() === 'true',
      explanation: String(q?.explanation || ''),
      translation: String(q?.translation || ''),
    }));

  const mc = (arr: any): MC[] =>
    (Array.isArray(arr) ? arr : []).map((q: any) => {
      const opts = Array.isArray(q?.options) ? q.options.map((o: any) => String(o)) : [];
      const idx = Number(q?.answerIndex);
      return {
        question: String(q?.question || ''),
        options: opts.length >= 2 ? opts : ['Option A', 'Option B', 'Option C'],
        answerIndex: [0, 1, 2].includes(idx) ? idx : 0,
        explanation: String(q?.explanation || ''),
        translation: String(q?.translation || ''),
      };
    });

  const gaps = (arr: any): Gap[] =>
    (Array.isArray(arr) ? arr : []).map((q: any) => ({
      sentence: String(q?.sentence || ''),
      answer: String(q?.answer || ''),
      translation: String(q?.translation || ''),
    }));

  return {
    title: String(data?.title || `Hörverstehen (${EXAM_LABELS[fallbackExam]})`),
    examType: fallbackExam,
    level: String(data?.level || fallbackLevel),
    part1TF: tf(data?.part1TF),
    part2MC: mc(data?.part2MC),
    part3Gap: gaps(data?.part3Gap),
    part4Short: (Array.isArray(data?.part4Short) ? data.part4Short : []).map((q: any) => ({
      question: String(q?.question || ''),
      answer: String(q?.answer || ''),
      translation: String(q?.translation || ''),
    })),
    vocabulary: (Array.isArray(data?.vocabulary) ? data.vocabulary : []).map((q: any) => ({
      word: String(q?.word || ''),
      meaning: String(q?.meaning || ''),
    })),
  };
}

function splitForTts(text: string, max = 350): string[] {
  const sentences = text.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]*\s*/g) || [text];
  const chunks: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && (cur + s).length > max) {
      chunks.push(cur.trim());
      cur = '';
    }
    cur += s;
  }
  if (cur.trim()) chunks.push(cur.trim());
  const result: string[] = [];
  for (const c of chunks) {
    if (c.length <= max * 1.6) {
      result.push(c);
    } else {
      for (let i = 0; i < c.length; i += max) result.push(c.slice(i, i + max));
    }
  }
  return result;
}

export const HoerenTrainer: React.FC<{ onClose: () => void; initialView?: 'menu' | 'creator' | 'archive' }> = ({ onClose, initialView = 'menu' }) => {
  const [viewMode, setViewMode] = useState<'menu' | 'creator' | 'archive' | 'exercise'>(initialView === 'creator' ? 'creator' : initialView === 'archive' ? 'archive' : 'menu');
  const [savedExercises, setSavedExercises] = useState<SavedExerciseRecord[]>([]);
  const [currentArchiveId, setCurrentArchiveId] = useState<string | null>(null);

  const [transcript, setTranscript] = useState('');
  const [examType, setExamType] = useState<ExamType>('Standard');
  const [level, setLevel] = useState('B1');
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [solutions, setSolutions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [grading, setGrading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<GradingResult | null>(null);
  const [error, setError] = useState('');
  const [warningMsg, setWarningMsg] = useState('');

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [audioGenProgress, setAudioGenProgress] = useState('');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioRate, setAudioRate] = useState(1.0);
  const [browserSpeaking, setBrowserSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechToken = useRef(0);

  const [sentencePairsCache, setSentencePairsCache] = useState<{ de: string; fa: string }[]>([]);
  const [historyAttempts, setHistoryAttempts] = useState<HistoryAttempt[]>([]);

  const [showSentenceModal, setShowSentenceModal] = useState(false);
  const [loadingSentences, setLoadingSentences] = useState(false);

  const [showVocabModal, setShowVocabModal] = useState(false);
  const [vocabMinLevel, setVocabMinLevel] = useState<string>('B1');
  const [extractedVocabs, setExtractedVocabs] = useState<{ word: string; translation: string; level: string; selected: boolean }[]>([]);
  const [loadingVocabs, setLoadingVocabs] = useState(false);
  const [copySuccessMsg, setCopySuccessMsg] = useState('');

  useEffect(() => {
    try {
      const storedArchive = localStorage.getItem(ARCHIVE_STORAGE_KEY);
      if (storedArchive) {
        setSavedExercises(JSON.parse(storedArchive));
      }
    } catch {}
  }, []);

  useEffect(() => {
    return () => {
      speechToken.current++;
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
    setIsPlayingAudio(false);
    setAudioProgress(0);
    setAudioCurrentTime(0);
    setAudioDuration(0);
  }, [audioUrl]);

  const stopAllPlayback = () => {
    speechToken.current++;
    stopSpeaking();
    setBrowserSpeaking(false);
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlayingAudio(false);
  };

  const persistCurrentToArchive = (curEx: Exercise | null, curTr: string, curAns: Record<string, string>, curSub: boolean, curRes: GradingResult | null, curPairs: { de: string; fa: string }[], curAudioUrl: string | null, curHist: HistoryAttempt[]) => {
    if (!curEx) return;
    try {
      const existingList = [...savedExercises];
      const targetId = currentArchiveId || 'ex_' + Date.now();
      if (!currentArchiveId) {
        setCurrentArchiveId(targetId);
      }

      const recordIndex = existingList.findIndex(item => item.id === targetId);
      const recordData: SavedExerciseRecord = {
        id: targetId,
        createdAt: recordIndex !== -1 ? existingList[recordIndex].createdAt : new Date().toLocaleDateString('de-AT', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
        title: curEx.title,
        examType: curEx.examType,
        level: curEx.level,
        transcript: curTr,
        exercise: curEx,
        sentencePairsCache: curPairs,
        audioUrl: curAudioUrl && !curAudioUrl.startsWith('blob:') ? curAudioUrl : undefined,
        answers: curAns,
        submitted: curSub,
        result: curRes,
        historyAttempts: curHist,
      };

      if (recordIndex !== -1) {
        existingList[recordIndex] = recordData;
      } else {
        existingList.unshift(recordData);
      }

      setSavedExercises(existingList);
      localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(existingList));
    } catch {}
  };

  const handleBackToMenu = () => {
    stopAllPlayback();
    if (viewMode === 'creator' || viewMode === 'exercise') {
      setViewMode('menu');
    } else {
      onClose();
    }
  };

  const answer = (id: string, value: string) => {
    setWarningMsg('');
    setAnswers(prev => ({ ...prev, [id]: value }));
  };

  const countUnanswered = (): number => {
    if (!exercise) return 0;
    const allIds = [
      ...exercise.part1TF.map((_, i) => `tf-${i}`),
      ...exercise.part2MC.map((_, i) => `mc-${i}`),
      ...exercise.part3Gap.map((_, i) => `gap-${i}`),
      ...exercise.part4Short.map((_, i) => `short-${i}`),
      ...exercise.vocabulary.map((_, i) => `v-${i}`),
    ];
    return allIds.filter(id => !(answers[id] || '').trim()).length;
  };

  const handleCheckClick = () => {
    if (!exercise || grading || submitted) return;
    const unanswered = countUnanswered();
    if (unanswered > 0 && !warningMsg) {
      setWarningMsg(`هنوز ${unanswered} سؤال بدون پاسخ مانده است. برای ثبت نهایی و تصحیح، دوباره روی دکمه کلیک کنید.`);
      return;
    }
    setWarningMsg('');
    submitAnswers();
  };

  const submitAnswers = async () => {
    if (!exercise || grading || submitted) return;
    setGrading(true);
    setError('');
    setWarningMsg('');

    try {
      const details: Record<string, Grade> = {};
      const pointsById: Record<string, number> = {};
      const freeQuestions: { id: string; question: string; expected: string; userAnswer: string; category: string }[] = [];

      exercise.part1TF.forEach((q, i) => {
        const id = `tf-${i}`;
        const given = answers[id];
        const correct = given === String(q.answer);
        const pts = correct ? 1 : 0;
        pointsById[id] = pts;
        details[id] = {
          correct,
          points: pts,
          feedback: q.explanation || `Richtige Antwort: ${q.answer ? 'Richtig' : 'Falsch'}`,
          feedbackFa: `پاسخ صحیح: ${q.answer ? 'درست (Richtig)' : 'نادرست (Falsch)'} — ${q.explanation}`,
        };
      });

      exercise.part2MC.forEach((q, i) => {
        const id = `mc-${i}`;
        const given = answers[id];
        const correct = given === String(q.answerIndex);
        const pts = correct ? 1 : 0;
        const correctOptionText = q.options[q.answerIndex] || '';
        pointsById[id] = pts;
        details[id] = {
          correct,
          points: pts,
          feedback: q.explanation || `Richtige Antwort: ${String.fromCharCode(65 + q.answerIndex)}) ${correctOptionText}`,
          feedbackFa: `پاسخ صحیح: ${String.fromCharCode(65 + q.answerIndex)}) ${correctOptionText} — ${q.explanation}`,
        };
      });

      const addFree = (id: string, question: string, expected: string, category: string) => {
        freeQuestions.push({ id, question, expected, userAnswer: answers[id] || '', category });
      };

      exercise.part3Gap.forEach((q, i) => addFree(`gap-${i}`, q.sentence, q.answer, 'Lückentext'));
      exercise.part4Short.forEach((q, i) => addFree(`short-${i}`, q.question, q.answer, 'Offene Frage'));
      exercise.vocabulary.forEach((q, i) => addFree(`v-${i}`, q.word, q.meaning, 'Wortschatz'));

      let aiTeacherComment = '';
      let aiTeacherCommentFa = '';
      let aiStrengths = '';
      let aiRecommendations = '';

      if (freeQuestions.length > 0) {
        const gradingPrompt = `
Du bist ein erfahrener Prüfer für Deutsch als Fremdsprache (${EXAM_LABELS[exercise.examType]}, Niveau ${exercise.level}).
Bewerte die Antworten fair und gib Erklärungen und Feedback AUCH AUF PERSISCH (فارسی).
Vergib pro Aufgabe genau 0, 0.5 oder 1 Punkt.

JSON-Ausgabeformat (streng einhalten, ohne Markdown):
{
  "results": [
    {"id": "gap-0", "points": 1, "feedback": "Begründung", "feedbackFa": "توضیح فارسی"}
  ],
  "teacherComment": "Gesamteinschätzung",
  "teacherCommentFa": "ارزیابی کلی فارسی",
  "strengths": "Stärken",
  "recommendations": "Empfehlungen"
}
`;
        const raw = await generateWithGemini(`${gradingPrompt}\n\nTRANSKRIPT:\n${transcript}\n\nANTworten:\n${JSON.stringify(freeQuestions)}`, { timeoutMs: 60000, retries: 1 });
        const parsed = parseAI(raw)[0];
        const aiResults = Array.isArray(parsed?.results) ? parsed.results : [];
        const aiById = new Map<string, any>(aiResults.map((item: any) => [String(item.id), item]));

        freeQuestions.forEach(q => {
          const graded = aiById.get(q.id);
          const points = Number(graded?.points);
          const hasAnswer = (q.userAnswer || '').trim().length > 0;
          const validPoints = hasAnswer && [0, 0.5, 1].includes(points) ? points : 0;
          pointsById[q.id] = validPoints;
          details[q.id] = {
            correct: validPoints === 1,
            points: validPoints,
            feedback: String(graded?.feedback || ''),
            feedbackFa: String(graded?.feedbackFa || ''),
          };
        });

        aiTeacherComment = String(parsed?.teacherComment || '');
        aiTeacherCommentFa = String(parsed?.teacherCommentFa || '');
        aiStrengths = String(parsed?.strengths || '');
        aiRecommendations = String(parsed?.recommendations || '');
      }

      const sections: SectionScore[] = [];
      const calcSection = (label: string, ids: string[]) => {
        if (ids.length === 0) return;
        const earned = ids.reduce((s, id) => s + (pointsById[id] ?? 0), 0);
        const total = ids.length;
        sections.push({ label, earned, total, percentage: Math.round((earned / total) * 100) });
      };

      calcSection('Richtig / Falsch', exercise.part1TF.map((_, i) => `tf-${i}`));
      calcSection('Multiple Choice', exercise.part2MC.map((_, i) => `mc-${i}`));
      calcSection('Lückentext', exercise.part3Gap.map((_, i) => `gap-${i}`));
      calcSection('Offene Fragen', exercise.part4Short.map((_, i) => `short-${i}`));
      calcSection('Wortschatz', exercise.vocabulary.map((_, i) => `v-${i}`));

      const allIds = [
        ...exercise.part1TF.map((_, i) => `tf-${i}`),
        ...exercise.part2MC.map((_, i) => `mc-${i}`),
        ...exercise.part3Gap.map((_, i) => `gap-${i}`),
        ...exercise.part4Short.map((_, i) => `short-${i}`),
        ...exercise.vocabulary.map((_, i) => `v-${i}`),
      ];

      const maxScore = allIds.length;
      const score = allIds.reduce((sum, id) => sum + (pointsById[id] ?? 0), 0);
      const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
      const { gradeLabel, passed } = getOfficialGradeInfo(percentage);

      const finalRes: GradingResult = {
        score,
        maxScore,
        percentage,
        gradeLabel,
        passed,
        sections,
        teacherComment: aiTeacherComment || 'Gut gemacht.',
        teacherCommentFa: aiTeacherCommentFa || 'عملکرد شما ثبت شد.',
        strengths: aiStrengths,
        recommendations: aiRecommendations,
        details,
      };

      setResult(finalRes);
      setSubmitted(true);
      const todayStr = new Date().toLocaleDateString('de-AT');
      const newAttempt: HistoryAttempt = {
        date: todayStr,
        score,
        maxScore,
        percentage,
        gradeLabel,
        passed,
      };
      const updatedHistory = [...historyAttempts, newAttempt];
      setHistoryAttempts(updatedHistory);
      persistCurrentToArchive(exercise, transcript, answers, true, finalRes, sentencePairsCache, audioUrl, updatedHistory);
    } catch (e: any) {
      setError(e?.message || 'خطا در ارزیابی پاسخ‌ها.');
    } finally {
      setGrading(false);
    }
  };

  const generate = async () => {
    if (transcript.trim().length < 80) {
      setError('متن کامل‌تری وارد کنید (حداقل ۸۰ نویسه).');
      return;
    }

    stopAllPlayback();
    setLoading(true);
    setError('');
    setWarningMsg('');
    setExercise(null);
    setAnswers({});
    setSolutions(false);
    setSubmitted(false);
    setResult(null);
    setSentencePairsCache([]);
    setHistoryAttempts([]);
    setCurrentArchiveId(null);

    try {
      const promptText = buildPrompt(examType, level);
      const raw = await generateWithGemini(`${promptText}\n\nTRANSKRIPT:\n${transcript.trim()}`, {
        timeoutMs: 60000,
        retries: 1,
      });

      const generatedExercise = normalize(parseAI(raw)[0], examType, level);
      setExercise(generatedExercise);
      setViewMode('exercise');
      persistCurrentToArchive(generatedExercise, transcript, {}, false, null, [], audioUrl, []);
    } catch (e: any) {
      setError(e?.message || 'ساخت تمرین ناموفق بود.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateAudio = async () => {
    if (!transcript.trim() || audioUrl || generatingAudio) return;
    stopAllPlayback();
    setGeneratingAudio(true);
    setAudioGenProgress('');
    setError('');

    try {
      const base = getTtsWorkerBase() || DEFAULT_TTS_WORKER;
      const chunks = splitForTts(transcript);
      const blobs: Blob[] = [];

      for (let i = 0; i < chunks.length; i++) {
        setAudioGenProgress(`${i + 1} / ${chunks.length}`);
        const chunk = chunks[i];
        let res: Response | null = null;
        try {
          res = await fetch(`${base}/?lang=de&text=${encodeURIComponent(chunk)}`);
        } catch {
          res = null;
        }
        if (!res || !res.ok) {
          res = await fetch(base, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: chunk, lang: 'de' }),
          });
        }
        if (!res.ok) throw new Error('خطا در ارتباط با سرور صوت.');
        const blob = await res.blob();
        blobs.push(blob);
      }

      const newAudioUrl = URL.createObjectURL(new Blob(blobs, { type: 'audio/mpeg' }));
      setAudioUrl(newAudioUrl);
    } catch (err: any) {
      setError(err?.message || 'ساخت فایل صوتی ناموفق بود.');
    } finally {
      setGeneratingAudio(false);
      setAudioGenProgress('');
    }
  };

  return (
    <div className="space-y-4 text-right max-w-4xl mx-auto pb-10" dir="rtl">
      {/* منوی اصلی تب Hören */}
      {viewMode === 'menu' && (
        <div className="space-y-3">
          <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-3">
              <span className="text-3xl">✨</span>
              <div>
                <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100">ساخت تمرین جدید</h3>
                <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">متن را وارد کن؛ تمرین شنیداری، سؤال‌ها و فایل صوتی ساخته می‌شود</p>
              </div>
            </div>
            <button
              onClick={() => setViewMode('creator')}
              className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-xs transition"
            >
              شروع ▶
            </button>
          </div>

          <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-3">
              <span className="text-3xl">📁</span>
              <div>
                <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100">تمرینات قبلی (آرشیو)</h3>
                <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">تمرین‌های ذخیره‌شده را دوباره انجام بده</p>
              </div>
            </div>
            <button
              onClick={() => setViewMode('archive')}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-xs transition"
            >
              مشاهده ▶
            </button>
          </div>
        </div>
      )}

      {/* صفحه سازنده تمرین (ورود متن و تنظیمات) */}
      {viewMode === 'creator' && (
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-6 shadow-sm space-y-5 text-right">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100">طراحی تمرین جدید شنیداری</h2>
            <button onClick={handleBackToMenu} className="px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">بازگشت</button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold mb-1.5">نوع آزمون / استاندارد:</label>
              <select
                value={examType}
                onChange={e => setExamType(e.target.value as ExamType)}
                className="w-full bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold outline-none"
              >
                {Object.entries(EXAM_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold mb-1.5">سطح زبان:</label>
              <select
                value={level}
                onChange={e => setLevel(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold outline-none"
              >
                {['A1', 'A2', 'B1', 'B2', 'C1'].map(lvl => (
                  <option key={lvl} value={lvl}>سطح {lvl}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold mb-1.5">متن آلمانی (Transcript):</label>
            <textarea
              rows={8}
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              placeholder="متن فایل صوتی یا گفتار را اینجا وارد کنید..."
              className="w-full bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-sm font-sans outline-none text-left"
              dir="ltr"
            />
          </div>

          {error && <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs">{error}</div>}

          <button
            onClick={() => void generate()}
            disabled={loading}
            className="w-full bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white py-3.5 rounded-xl font-bold text-sm shadow-md transition disabled:opacity-50"
          >
            {loading ? 'در حال ساخت آزمون و سؤالات...' : 'تولید تمرین و سؤالات هوشمند 🚀'}
          </button>
        </div>
      )}

      {/* لیست آرشیو تمرینات */}
      {viewMode === 'archive' && (
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-6 shadow-sm space-y-4 text-right">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="font-extrabold text-base">آرشیو تمرینات شنیداری</h2>
            <button onClick={handleBackToMenu} className="px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">بازگشت</button>
          </div>

          <div className="space-y-3">
            {savedExercises.length === 0 ? (
              <div className="py-12 text-center text-sm text-[#5d6676]">هیچ تمرینی در آرشیو ذخیره نشده است.</div>
            ) : (
              savedExercises.map(item => (
                <div
                  key={item.id}
                  onClick={() => {
                    setCurrentArchiveId(item.id);
                    setExercise(item.exercise);
                    setTranscript(item.transcript);
                    setAnswers(item.answers || {});
                    setSubmitted(item.submitted || false);
                    setResult(item.result || null);
                    setHistoryAttempts(item.historyAttempts || []);
                    setViewMode('exercise');
                  }}
                  className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#141923] flex items-center justify-between cursor-pointer hover:border-[#1f5fbf] transition"
                >
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">{item.title}</h4>
                    <span className="text-xs text-[#5d6676]">تاریخ: {item.createdAt} • سطح: {item.level}</span>
                  </div>
                  <span className="bg-[#1f5fbf] text-white px-4 py-2 rounded-xl text-xs font-bold">ورود به تمرین ▶</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* صفحه حل تمرین و آزمون */}
      {viewMode === 'exercise' && exercise && (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-white dark:bg-[#1b2029] p-4 rounded-2xl border">
            <div>
              <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100">{exercise.title}</h3>
              <span className="text-xs text-[#5d6676]">سطح: {exercise.level} • فرمت: {EXAM_LABELS[exercise.examType]}</span>
            </div>
            <button onClick={handleBackToMenu} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">بازگشت به منو</button>
          </div>

          {/* پلیر صوت */}
          <div className="bg-white dark:bg-[#1b2029] border rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">🎧 فایل صوتی تمرین:</span>
              {!audioUrl ? (
                <button
                  onClick={() => void handleGenerateAudio()}
                  disabled={generatingAudio}
                  className="px-4 py-2 rounded-xl bg-[#1f5fbf] text-white text-xs font-bold disabled:opacity-50"
                >
                  {generatingAudio ? `در حال ساخت (${audioGenProgress})...` : 'تولید فایل صوتی ابری 🔊'}
                </button>
              ) : (
                <button
                  onClick={togglePlayPauseAudio}
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold"
                >
                  {isPlayingAudio ? 'توقف پخش ⏸' : 'پخش صوت ▶'}
                </button>
              )}
            </div>
            {audioUrl && (
              <audio
                ref={audioRef}
                src={audioUrl}
                onTimeUpdate={handleTimeUpdate}
                onEnded={() => setIsPlayingAudio(false)}
                className="hidden"
              />
            )}
          </div>

          {/* سوالات آزمون */}
          <div className="bg-white dark:bg-[#1b2029] border rounded-3xl p-6 space-y-6">
            {exercise.part1TF.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-extrabold text-sm text-[#1f5fbf]">بخش ۱: درست یا نادرست (Richtig / Falsch)</h4>
                {exercise.part1TF.map((q, idx) => {
                  const id = `tf-${idx}`;
                  return (
                    <div key={id} className="p-4 rounded-2xl border bg-slate-50 dark:bg-[#141923] space-y-2">
                      <p className="text-sm font-bold text-left" dir="ltr">{idx + 1}. {q.statement}</p>
                      {q.translation && <p className="text-xs text-slate-500">{q.translation}</p>}
                      <div className="flex gap-2" dir="ltr">
                        <button
                          onClick={() => answer(id, 'true')}
                          className={`px-4 py-2 rounded-xl text-xs font-bold border ${answers[id] === 'true' ? 'bg-[#1f5fbf] text-white' : 'bg-white dark:bg-slate-800'}`}
                        >
                          Richtig (درست)
                        </button>
                        <button
                          onClick={() => answer(id, 'false')}
                          className={`px-4 py-2 rounded-xl text-xs font-bold border ${answers[id] === 'false' ? 'bg-[#1f5fbf] text-white' : 'bg-white dark:bg-slate-800'}`}
                        >
                          Falsch (نادرست)
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {warningMsg && <div className="p-3 bg-amber-50 text-amber-800 rounded-xl text-xs font-bold">{warningMsg}</div>}
            {error && <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs">{error}</div>}

            {!submitted ? (
              <button
                onClick={handleCheckClick}
                disabled={grading}
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white py-3.5 rounded-xl font-bold text-sm shadow-md transition disabled:opacity-50"
              >
                {grading ? 'در حال بررسی و تصحیح هوش مصنوعی...' : 'ثبت و بررسی پاسخ‌ها (Antworten überprüfen) ✓'}
              </button>
            ) : (
              result && (
                <div className="p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 space-y-3">
                  <h4 className="font-extrabold text-base text-emerald-800 dark:text-emerald-300">نتیجه آزمون شما: {result.score} / {result.maxScore} ({result.percentage}%)</h4>
                  <p className="text-xs text-slate-700 dark:text-slate-300">{result.teacherCommentFa}</p>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
};
