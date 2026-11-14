import React, { useState, useEffect, useRef } from 'react';
import { generateWithGemini, parseAI } from '../utils/ai';
import { speak, stopSpeaking } from '../utils/audio';

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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const HoerenTrainer: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [viewMode, setViewMode] = useState<'menu' | 'creator' | 'archive'>('menu');
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

  // استیت‌های صوت و پلیر پیشرفته
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioRate, setAudioRate] = useState(1.0);
  const [browserSpeaking, setBrowserSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
        audioUrl: curAudioUrl || undefined,
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
    const confirmLeave = window.confirm('با خارج شدن شما این تمرین در لیست تمرینات آرشیو ذخیره خواهد شد و برای ادامه تمرین یا تمرین مجدد از آن بخش می‌توانید استفاده کنید. آیا مایل به خروج هستید؟');
    if (!confirmLeave) return;

    if (exercise) {
      persistCurrentToArchive(exercise, transcript, answers, submitted, result, sentencePairsCache, audioUrl, historyAttempts);
    }

    setViewMode('menu');
    setCurrentArchiveId(null);
    setTranscript('');
    setExercise(null);
    setAnswers({});
    setSubmitted(false);
    setResult(null);
    setAudioUrl(null);
    setIsPlayingAudio(false);
    setBrowserSpeaking(false);
    stopSpeaking();
    setSentencePairsCache([]);
    setHistoryAttempts([]);
    if (audioRef.current) {
      audioRef.current.pause();
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
      setWarningMsg(
        `هنوز ${unanswered} سؤال بدون پاسخ مانده است. برای ثبت نهایی و تصحیح، دوباره روی دکمه «Antworten überprüfen» کلیک کنید.`
      );
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
      const freeQuestions: {
        id: string;
        question: string;
        expected: string;
        userAnswer: string;
        category: string;
      }[] = [];

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

JSON-Ausgabeformat (streng einhalten):
{
  "results": [
    {
      "id": "gap-0",
      "points": 1,
      "feedback": "Begründung auf Deutsch",
      "feedbackFa": "توضیح و دلیل به زبان فارسی"
    }
  ],
  "teacherComment": "Gesamteinschätzung auf Deutsch",
  "teacherCommentFa": "ارزیابی کلی عملکرد به زبان فارسی",
  "strengths": "Stärken auf Deutsch und Persisch",
  "recommendations": "Empfehlungen auf Deutsch und Persisch"
}

Transkript:
${transcript}

Aufgaben und Antworten:
${JSON.stringify(freeQuestions)}
`;

        const raw = await generateWithGemini(gradingPrompt, { timeoutMs: 60000, retries: 1 });
        const parsed = parseAI(raw)[0];
        const aiResults = Array.isArray(parsed?.results) ? parsed.results : [];
        const aiById = new Map<string, any>(aiResults.map((item: any) => [String(item.id), item]));

        freeQuestions.forEach(q => {
          const graded = aiById.get(q.id);
          const points = Number(graded?.points);
          const validPoints = [0, 0.5, 1].includes(points) ? points : 0;
          pointsById[q.id] = validPoints;
          details[q.id] = {
            correct: validPoints === 1,
            points: validPoints,
            feedback: String(graded?.feedback || 'Die Antwort konnte nicht bewertet werden.'),
            feedbackFa: String(graded?.feedbackFa || 'پاسخ قابل ارزیابی دقیق نبود.'),
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

      if (!aiTeacherComment) {
        aiTeacherComment = `Leistung auf Niveau ${exercise.level}.`;
        aiTeacherCommentFa = `عملکرد شما در سطح ${exercise.level} ارزیابی شد.`;
        aiStrengths = 'Gutes Bemühen beim Verstehen des Hörtextes.';
        aiRecommendations = 'Üben Sie weiter mit originalen Audios.';
      }

      const finalRes: GradingResult = {
        score,
        maxScore,
        percentage,
        gradeLabel,
        passed,
        sections,
        teacherComment: aiTeacherComment,
        teacherCommentFa: aiTeacherCommentFa,
        strengths: aiStrengths,
        recommendations: aiRecommendations,
        details,
      };

      setResult(finalRes);
      setSubmitted(true);

      const todayStr = new Date().toLocaleDateString('de-AT', { year: 'numeric', month: '2-digit', day: '2-digit' });
      const newAttempt: HistoryAttempt = {
        date: todayStr + ' (' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ')',
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
      setError(e?.message || 'Die Antworten konnten nicht bewertet werden.');
    } finally {
      setGrading(false);
    }
  };

  const generate = async () => {
    if (transcript.trim().length < 80) {
      setError('متن کامل‌تری وارد کن (حداقل ۸۰ نویسه).');
      return;
    }

    setLoading(true);
    setError('');
    setWarningMsg('');
    setExercise(null);
    setAnswers({});
    setSolutions(false);
    setSubmitted(false);
    setResult(null);
    setAudioUrl(null);
    setIsPlayingAudio(false);
    setBrowserSpeaking(false);
    stopSpeaking();
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
      const totalQuestions =
        generatedExercise.part1TF.length +
        generatedExercise.part2MC.length +
        generatedExercise.part3Gap.length +
        generatedExercise.part4Short.length;

      if (totalQuestions === 0) {
        throw new Error('Die Aufgaben konnten nicht vollständig erstellt werden.');
      }

      setExercise(generatedExercise);
      persistCurrentToArchive(generatedExercise, transcript, {}, false, null, [], null, []);
    } catch (e: any) {
      setError(e?.message || 'ساخت تمرین ناموفق بود.');
    } finally {
      setLoading(false);
    }
  };

  // تولید صوت با کیفیت بالا (ابری)
  const handleGenerateAudio = async () => {
    if (!transcript.trim() || audioUrl) return;
    setGeneratingAudio(true);
    setError('');

    try {
      const response = await fetch('https://wort-tts.peymansaberi20.workers.de', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: transcript }),
      });

      if (!response.ok) {
        throw new Error('خطا در ارتباط با موتور تولید صوت.');
      }

      const blob = await response.blob();
      const newAudioUrl = URL.createObjectURL(blob);
      setAudioUrl(newAudioUrl);
      setGeneratingAudio(false);

      persistCurrentToArchive(exercise, transcript, answers, submitted, result, sentencePairsCache, newAudioUrl, historyAttempts);
    } catch (err: any) {
      setError(err?.message || 'ساخت فایل صوتی با خطا مواجه شد.');
      setGeneratingAudio(false);
    }
  };

  // پخش آنی با صدای پیش‌فرض مرورگر
  const handleToggleBrowserSpeech = () => {
    if (browserSpeaking) {
      stopSpeaking();
      setBrowserSpeaking(false);
    } else {
      if (!transcript.trim()) return;
      setBrowserSpeaking(true);
      speak(transcript, {
        rate: audioRate,
        onEnd: () => setBrowserSpeaking(false),
        onErr: () => setBrowserSpeaking(false)
      });
    }
  };

  const togglePlayPauseAudio = () => {
    if (!audioRef.current) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlayingAudio(true);
      }).catch(() => {});
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const current = audioRef.current.currentTime;
      const duration = audioRef.current.duration || 1;
      setAudioCurrentTime(current);
      setAudioDuration(duration);
      setAudioProgress((current / duration) * 100);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setAudioProgress(val);
    if (audioRef.current && audioRef.current.duration) {
      const newTime = (val / 100) * audioRef.current.duration;
      audioRef.current.currentTime = newTime;
      setAudioCurrentTime(newTime);
    }
  };

  const handleRateChange = (newRate: number) => {
    setAudioRate(newRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = newRate;
    }
  };

  const handleOpenSentenceModal = async () => {
    if (!transcript.trim()) return;
    setShowSentenceModal(true);

    if (sentencePairsCache.length > 0) {
      return;
    }

    setLoadingSentences(true);
    try {
      const prompt = `
Zerlege den folgenden deutschen Text in einzelne Sätze. Gib das Ergebnis als JSON-Array zurück, wobei jedes Objekt den deutschen Satz ("de") und dessen genaue persische Übersetzung ("fa") enthält.
Antworte ausschließlich mit gültigem JSON (ohne Markdown).
Format: [{"de": "Deutscher Satz...", "fa": "ترجمه فارسی..."}]

Text:
${transcript}
`;
      const raw = await generateWithGemini(prompt, { timeoutMs: 45000, retries: 1 });
      const parsed = parseAI(raw);
      const arr = Array.isArray(parsed[0]) ? parsed[0] : Array.isArray(parsed) ? parsed : [];
      const formatted = arr.map((item: any) => ({ de: String(item?.de || ''), fa: String(item?.fa || '') }));
      setSentencePairsCache(formatted);
      persistCurrentToArchive(exercise, transcript, answers, submitted, result, formatted, audioUrl, historyAttempts);
    } catch {
      setSentencePairsCache([{ de: transcript, fa: 'خطا در بارگذاری ترجمه جمله به جمله.' }]);
    } finally {
      setLoadingSentences(false);
    }
  };

  const handleOpenVocabModal = async () => {
    if (!transcript.trim()) return;
    setShowVocabModal(true);
    fetchExtractedVocabs(vocabMinLevel);
  };

  const fetchExtractedVocabs = async (minLvl: string) => {
    setLoadingVocabs(true);
    try {
      const prompt = `
Analysiere das folgende Transkript und extrahiere wichtige Wörter oder Ausdrücke ab dem Niveau "${minLvl}" und höher.
Gib das Ergebnis als JSON-Array zurück: [{"word": "der Vorschlag", "translation": "پیشنهاد", "level": "B1"}]
Antworte ausschließlich mit gültigem JSON.

Transkript:
${transcript}
`;
      const raw = await generateWithGemini(prompt, { timeoutMs: 45000, retries: 1 });
      const parsed = parseAI(raw);
      const arr = Array.isArray(parsed[0]) ? parsed[0] : Array.isArray(parsed) ? parsed : [];
      setExtractedVocabs(
        arr.map((item: any) => ({
          word: String(item?.word || ''),
          translation: String(item?.translation || ''),
          level: String(item?.level || minLvl),
          selected: true,
        }))
      );
    } catch {
      setExtractedVocabs([]);
    } finally {
      setLoadingVocabs(false);
    }
  };

  const handleCopySelectedVocabs = () => {
    const selectedWords = extractedVocabs.filter(v => v.selected).map(v => v.word).join('\n');
    if (!selectedWords) return;
    navigator.clipboard.writeText(selectedWords);
    setCopySuccessMsg('لیست لغات کپی شد.');
    setTimeout(() => setCopySuccessMsg(''), 5000);
  };

  const handlePrintPDF = (mode: 'transcript' | 'questions' | 'certificate') => {
    if (!exercise) return;

    const baseStyles = `
      <style>
        @page { size: A4; margin: 15mm; }
        body { font-family: 'Segoe UI', Tahoma, sans-serif; color: #1e293b; line-height: 1.5; font-size: 11pt; direction: rtl; text-align: right; }
        .header { border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 15px; }
        .header-title { font-size: 15pt; font-weight: 800; color: #0f172a; margin: 0; }
        .question-box { margin-bottom: 12px; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; page-break-inside: avoid; direction: ltr; text-align: left; }
        .transcript-body { white-space: pre-wrap; font-size: 11pt; line-height: 1.6; background: #f8fafc; padding: 15px; border: 1px solid #cbd5e1; border-radius: 6px; direction: ltr; text-align: left; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: center; font-size: 10pt; }
        th { background: #e2e8f0; }
      </style>
    `;

    let bodyContent = '';
    if (mode === 'transcript') {
      bodyContent = `<div class="header"><h1 class="header-title">Hörtext / Transkript</h1></div><div class="transcript-body">${escapeHtml(transcript.trim())}</div>`;
    } else if (mode === 'questions') {
      let qHtml = '';
      exercise.part1TF.forEach((q, i) => {
        qHtml += `<div class="question-box"><strong>${i + 1}.</strong> ${escapeHtml(q.statement)}<br/>☐ Richtig &nbsp;&nbsp;&nbsp; ☐ Falsch</div>`;
      });
      exercise.part2MC.forEach((q, i) => {
        qHtml += `<div class="question-box"><strong>${i + 1}.</strong> ${escapeHtml(q.question)}<br/>${q.options.map((o, idx) => `<div>${String.fromCharCode(65 + idx)}) ${escapeHtml(o)}</div>`).join('')}</div>`;
      });
      bodyContent = `<div class="header"><h1 class="header-title">Prüfungsaufgaben</h1></div>${qHtml}`;
    } else if (mode === 'certificate') {
      let historyRows = '';
      if (historyAttempts.length > 0) {
        const datesHeader = historyAttempts.map(att => `<th>${att.date}</th>`).join('');
        const scoresRow = historyAttempts.map(att => `<td>${att.score} / ${att.maxScore}</td>`).join('');
        const percentRow = historyAttempts.map(att => `<td>${att.percentage}%</td>`).join('');
        const gradeRow = historyAttempts.map(att => `<td>${att.gradeLabel}</td>`).join('');

        historyRows = `
          <h3>تاریخچه و مقایسه تلاش‌ها (کارنامه پیشرفت)</h3>
          <table>
            <thead>
              <tr>
                <th>متریک / تاریخ</th>
                ${datesHeader}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="font-weight: bold;">امتیاز مکتسبه</td>
                ${scoresRow}
              </tr>
              <tr>
                <td style="font-weight: bold;">درصد موفقیت</td>
                ${percentRow}
              </tr>
              <tr>
                <td style="font-weight: bold;">ارزیابی / وضعیت</td>
                ${gradeRow}
              </tr>
            </tbody>
          </table>
        `;
      }

      bodyContent = `
        <div class="header"><h1 class="header-title">Prüfungszertifikat & Leistungsbericht</h1></div>
        <p><strong>تمرین:</strong> ${escapeHtml(exercise.title)} (${EXAM_LABELS[exercise.examType]} - Niveau ${exercise.level})</p>
        ${historyRows}
        ${result ? `<div style="margin-top: 15px; padding: 10px; background: #f1f5f9; border-radius: 6px;"><strong>نظر مدرس:</strong><br/>${escapeHtml(result.teacherComment)}<br/><span style="color: #475569;">${escapeHtml(result.teacherCommentFa)}</span></div>` : ''}
      `;
    }

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(`<html><head><title>Print</title>${baseStyles}</head><body>${bodyContent}</body></html>`);
      doc.close();
      setTimeout(() => { iframe.contentWindow?.print(); }, 300);
    }
  };

  const renderFeedback = (id: string, translation?: string) => {
    return (
      <div className="space-y-1 pt-1">
        {submitted && translation && (
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium" dir="rtl">
            ترجمه: {translation}
          </p>
        )}
        {submitted && result?.details[id] && (
          <div>
            {result.details[id].points === 1 ? (
              <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">✓ Richtig</p>
            ) : (
              <div className="text-xs space-y-0.5">
                <p className={result.details[id].points === 0.5 ? 'text-amber-600 font-bold' : 'text-red-600 font-bold'}>
                  {result.details[id].points === 0.5 ? '◐ Teilweise richtig' : '✗ Falsch'}
                </p>
                <p className="text-red-600 dark:text-red-400 font-medium" dir="rtl">
                  {result.details[id].feedbackFa}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  let sectionCounter = 0;

  if (viewMode === 'menu') {
    return (
      <div className="max-w-xl mx-auto space-y-6 text-left text-sm text-slate-800 dark:text-slate-100 py-8" dir="ltr">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            برگشت به منو
          </button>
          <span className="text-xs font-medium text-slate-400">Hörverstehen Hub</span>
        </div>

        <div className="text-center space-y-2">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">🎧 Hörverstehen Training</h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            لطفاً یکی از گزینه‌های زیر را انتخاب کنید:
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
          <button
            onClick={() => setViewMode('creator')}
            className="rounded-2xl border-2 border-blue-500/40 bg-blue-50/50 hover:bg-blue-100/60 dark:bg-blue-950/20 dark:border-blue-700/60 p-6 flex flex-col items-center justify-center text-center space-y-3 transition shadow-sm group"
          >
            <span className="text-3xl group-hover:scale-110 transition">✨</span>
            <div>
              <h3 className="font-bold text-base text-blue-900 dark:text-blue-300">ساخت تمرین جدید</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">تولید تمرین شنیداری، سوالات و فایل صوتی از روی متن جدید</p>
            </div>
          </button>

          <button
            onClick={() => setViewMode('archive')}
            className="rounded-2xl border-2 border-emerald-500/40 bg-emerald-50/50 hover:bg-emerald-100/60 dark:bg-emerald-950/20 dark:border-emerald-700/60 p-6 flex flex-col items-center justify-center text-center space-y-3 transition shadow-sm group"
          >
            <span className="text-3xl group-hover:scale-110 transition">📂</span>
            <div>
              <h3 className="font-bold text-base text-emerald-900 dark:text-emerald-300">تمرینات قبلی (آرشیو)</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">مشاهده لیست تمرین‌های ذخیره‌شده و تمرین مجدد</p>
            </div>
          </button>
        </div>
      </div>
    );
  }

  if (viewMode === 'archive') {
    return (
      <div className="max-w-3xl mx-auto space-y-4 text-left text-sm text-slate-800 dark:text-slate-100" dir="ltr">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
          <button
            type="button"
            onClick={() => setViewMode('menu')}
            className="rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            برگشت به منو
          </button>
          <h2 className="text-base font-bold">📂 آرشیو تمرینات درک شنیداری</h2>
        </div>

        {savedExercises.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-xs space-y-2">
            <p>هنوز هیچ تمرینی در آرشیو ذخیره نشده است.</p>
            <button
              onClick={() => setViewMode('creator')}
              className="text-blue-600 dark:text-blue-400 font-semibold underline"
            >
              ساخت تمرین جدید
            </button>
          </div>
        ) : (
          <div className="space-y-3 max-h-[75vh] overflow-y-auto pr-1">
            {savedExercises.map(item => (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1b2029] p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                      {item.level} · {EXAM_LABELS[item.examType]}
                    </span>
                    <span className="text-xs text-slate-400">{item.createdAt}</span>
                  </div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">{item.title}</h3>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setCurrentArchiveId(item.id);
                      setTranscript(item.transcript);
                      setExamType(item.examType);
                      setLevel(item.level);
                      setExercise(item.exercise);
                      setAnswers({});
                      setSubmitted(false);
                      setResult(null);
                      setAudioUrl(item.audioUrl || null);
                      setSentencePairsCache(item.sentencePairsCache || []);
                      setHistoryAttempts(item.historyAttempts || []);
                      setViewMode('creator');
                    }}
                    className="rounded-xl bg-blue-600 hover:bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition"
                  >
                    شروع تمرین ➔
                  </button>
                  <button
                    onClick={() => {
                      const confirmDelete = window.confirm('آیا از حذف این تمرین از آرشیو اطمینان دارید؟');
                      if (!confirmDelete) return;
                      const filtered = savedExercises.filter(x => x.id !== item.id);
                      setSavedExercises(filtered);
                      localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(filtered));
                    }}
                    className="rounded-xl border border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/40 p-2 text-red-600 text-xs transition"
                    title="حذف از آرشیو"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4 text-left text-sm text-slate-800 dark:text-slate-100" dir="ltr">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleBackToMenu}
          className="rounded-xl border border-slate-300 dark:border-slate-600 px-3.5 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        >
          برگشت به منو
        </button>
        <span className="text-xs font-medium text-slate-400">Deutsch Hörverstehen · Simulator</span>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1b2029] p-4 sm:p-5 shadow-sm space-y-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
            <span>🎧</span>
            <span>Hörverstehen erstellen</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            نوع آزمون و سطح را انتخاب کنید و متن فایل صوتی را وارد نمایید.
          </p>
        </div>

        <textarea
          rows={5}
          value={transcript}
          onChange={e => setTranscript(e.target.value)}
          className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-900/40 p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          placeholder="Transkript hier einfügen …"
        />

        {transcript.trim().length >= 10 && (
          <div className="space-y-3 bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {!audioUrl && (
                  <button
                    type="button"
                    onClick={handleGenerateAudio}
                    disabled={generatingAudio}
                    className="rounded-xl px-4 py-2 text-xs font-bold text-white shadow-sm transition flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
                  >
                    <span>🔊</span>
                    <span>{generatingAudio ? 'در حال ساخت فایل صوتی با کیفیت بالا…' : 'ساخت فایل صوتی باکیفیت'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleToggleBrowserSpeech}
                  className={`rounded-xl px-3.5 py-2 text-xs font-bold text-white shadow-sm transition flex items-center gap-1.5 ${
                    browserSpeaking ? 'bg-amber-600 hover:bg-amber-700' : 'bg-slate-700 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600'
                  }`}
                >
                  <span>🗣️</span>
                  <span>{browserSpeaking ? 'توقف صدای مرورگر' : 'پخش با صدای مرورگر (آنی)'}</span>
                </button>
              </div>

              {/* کنترل‌های صوت همیشه در صورت وجود صوت یا امکان پخش فعال هستند */}
              {audioUrl && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={togglePlayPauseAudio}
                    className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#232934] px-4 py-2 text-xs font-bold flex items-center gap-1.5 hover:bg-slate-100 shadow-sm"
                  >
                    <span>{isPlayingAudio ? '⏸ Pause' : '▶ Play'}</span>
                  </button>

                  <label className="text-xs font-semibold flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                    <span>سرعت:</span>
                    <select
                      value={audioRate}
                      onChange={(e) => handleRateChange(parseFloat(e.target.value))}
                      className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#232934] px-2.5 py-1 text-xs font-medium"
                    >
                      <option value={0.75}>0.75x</option>
                      <option value={1.0}>1.0x (معمولی)</option>
                      <option value={1.25}>1.25x</option>
                      <option value={1.5}>1.5x</option>
                    </select>
                  </label>
                </div>
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

            {audioUrl && (
              <div className="space-y-1.5 pt-1">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={audioProgress}
                  onChange={handleSeek}
                  className="w-full accent-purple-600 cursor-pointer h-2.5 bg-slate-200 dark:bg-slate-700 rounded-lg shadow-inner"
                />
                <div className="flex justify-between text-[11px] font-semibold text-slate-500">
                  <span>{Math.floor(audioCurrentTime)}s</span>
                  <span>{Math.floor(audioDuration)}s</span>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 items-center">
          <label className="text-xs font-semibold flex flex-col gap-1 text-slate-600 dark:text-slate-300">
            <span>Prüfungsformat:</span>
            <select
              value={examType}
              onChange={e => setExamType(e.target.value as ExamType)}
              disabled={!!currentArchiveId}
              className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#232934] px-3 py-2 text-xs font-medium disabled:opacity-50"
            >
              {(Object.keys(EXAM_LABELS) as ExamType[]).map(type => (
                <option key={type} value={type}>
                  {EXAM_LABELS[type]}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-semibold flex flex-col gap-1 text-slate-600 dark:text-slate-300">
            <span>Niveau:</span>
            <select
              value={level}
              onChange={e => setLevel(e.target.value)}
              disabled={!!currentArchiveId}
              className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#232934] px-3 py-2 text-xs font-medium disabled:opacity-50"
            >
              {['A2', 'B1', 'B2', 'C1', 'C2'].map(x => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>

          {!currentArchiveId && (
            <div className="flex items-end pt-4 sm:pt-0">
              <button
                onClick={generate}
                disabled={loading}
                className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-sm disabled:opacity-50 transition"
              >
                {loading ? 'در حال ساخت تمرین…' : 'ساخت تمرین'}
              </button>
            </div>
          )}
        </div>

        {transcript.trim().length >= 20 && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={handleOpenSentenceModal}
              className="rounded-lg border border-purple-300 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:border-purple-800 px-3 py-1.5 text-xs font-semibold text-purple-700 dark:text-purple-300 transition flex items-center gap-1.5"
            >
              <span>📖</span>
              <span>ترجمه جمله به جمله متن</span>
            </button>

            <button
              type="button"
              onClick={handleOpenVocabModal}
              className="rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:border-emerald-800 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition flex items-center gap-1.5"
            >
              <span>🔤</span>
              <span>استخراج هوشمند واژگان</span>
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>

      {exercise && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1b2029] p-4 sm:p-6 shadow-sm space-y-6 text-base">
          <div className="border-b border-slate-200 dark:border-slate-700 pb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                {exercise.title}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                HÖRVERSTEHEN · {EXAM_LABELS[exercise.examType]} · Niveau {exercise.level}
              </p>
            </div>
            <span className="inline-flex items-center rounded-md bg-blue-50 dark:bg-blue-950/60 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              {exercise.level} · {exercise.examType}
            </span>
          </div>

          {exercise.part1TF.length > 0 && (() => {
            sectionCounter++;
            return (
              <section className="space-y-3">
                <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100">
                  {sectionCounter}. Richtig oder falsch?
                </h3>
                {exercise.part1TF.map((q, i) => {
                  const id = `tf-${i}`;
                  return (
                    <div key={id} className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/40 dark:bg-slate-800/20 p-3.5 space-y-2">
                      <p className="text-base leading-snug font-medium">
                        <span className="font-bold">{i + 1}.</span> {q.statement}
                      </p>
                      <div className="flex gap-6 text-sm">
                        {['Richtig', 'Falsch'].map((label, j) => (
                          <label key={label} className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="radio"
                              name={id}
                              checked={answers[id] === String(j === 0)}
                              onChange={() => answer(id, String(j === 0))}
                              disabled={submitted}
                              className="accent-blue-600 w-4 h-4"
                            />
                            <span className="font-medium">{label}</span>
                          </label>
                        ))}
                      </div>
                      {solutions && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400">
                          <strong>Lösung:</strong> {q.answer ? 'Richtig' : 'Falsch'} — {q.explanation}
                        </p>
                      )}
                      {renderFeedback(id, q.translation)}
                    </div>
                  );
                })}
              </section>
            );
          })()}

          {exercise.part2MC.length > 0 && (() => {
            sectionCounter++;
            return (
              <section className="space-y-3">
                <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100">
                  {sectionCounter}. Wählen Sie die richtige Lösung (A, B oder C).
                </h3>
                {exercise.part2MC.map((q, i) => {
                  const id = `mc-${i}`;
                  return (
                    <div key={id} className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/40 dark:bg-slate-800/20 p-3.5 space-y-2">
                      <p className="text-base font-semibold leading-snug">
                        <span className="font-bold">{i + 1}.</span> {q.question}
                      </p>
                      <div className="space-y-2 pl-1 text-sm">
                        {q.options.map((opt, optIdx) => (
                          <label key={optIdx} className="flex items-start gap-2 cursor-pointer select-none">
                            <input
                              type="radio"
                              name={id}
                              checked={answers[id] === String(optIdx)}
                              onChange={() => answer(id, String(optIdx))}
                              disabled={submitted}
                              className="mt-1 accent-blue-600 w-4 h-4"
                            />
                            <span className="leading-snug font-medium">
                              <strong className="font-bold">{String.fromCharCode(65 + optIdx)})</strong> {opt}
                            </span>
                          </label>
                        ))}
                      </div>
                      {solutions && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400">
                          <strong>Lösung:</strong> {String.fromCharCode(65 + q.answerIndex)}) {q.options[q.answerIndex]} — {q.explanation}
                        </p>
                      )}
                      {renderFeedback(id, q.translation)}
                    </div>
                  );
                })}
              </section>
            );
          })()}

          {exercise.part3Gap.length > 0 && (() => {
            sectionCounter++;
            return (
              <section className="space-y-3">
                <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100">
                  {sectionCounter}. Ergänzen Sie die Lücken.
                </h3>
                {exercise.part3Gap.map((q, i) => {
                  const id = `gap-${i}`;
                  return (
                    <div key={id} className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/40 dark:bg-slate-800/20 p-3.5 space-y-2">
                      <p className="text-base leading-snug font-medium">
                        <span className="font-bold">{i + 1}.</span> {q.sentence}
                      </p>
                      <input
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900/50 px-3.5 py-2 text-base"
                        value={answers[id] || ''}
                        onChange={e => answer(id, e.target.value)}
                        disabled={submitted}
                        placeholder="Antwort auf Deutsch"
                      />
                      {solutions && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400">
                          <strong>Lösung:</strong> {q.answer}
                        </p>
                      )}
                      {renderFeedback(id, q.translation)}
                    </div>
                  );
                })}
              </section>
            );
          })()}

          {exercise.part4Short.length > 0 && (() => {
            sectionCounter++;
            return (
              <section className="space-y-3">
                <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100">
                  {sectionCounter}. Beantworten Sie die Fragen.
                </h3>
                {exercise.part4Short.map((q, i) => {
                  const id = `short-${i}`;
                  return (
                    <div key={id} className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/40 dark:bg-slate-800/20 p-3.5 space-y-2">
                      <p className="text-base leading-snug font-medium">
                        <span className="font-bold">{i + 1}.</span> {q.question}
                      </p>
                      <textarea
                        rows={2}
                        value={answers[id] || ''}
                        onChange={e => answer(id, e.target.value)}
                        disabled={submitted}
                        className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900/50 px-3.5 py-2 text-base"
                        placeholder="Ihre Antwort auf Deutsch"
                      />
                      {solutions && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400">
                          <strong>Musterantwort:</strong> {q.answer}
                        </p>
                      )}
                      {renderFeedback(id, q.translation)}
                    </div>
                  );
                })}
              </section>
            );
          })()}

          {warningMsg && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-300">
              {warningMsg}
            </div>
          )}

          <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleCheckClick}
                disabled={grading || submitted}
                className="rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50 transition"
              >
                {grading ? 'Antworten werden bewertet…' : submitted ? 'Antworten überprüft' : 'Antworten überprüfen'}
              </button>

              <button
                type="button"
                onClick={() => setSolutions(v => !v)}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition"
              >
                {solutions ? 'Lösungen ausblenden' : 'Lösungen anzeigen'}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handlePrintPDF('transcript')}
                className="rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium"
              >
                📄 Transkript (PDF)
              </button>
              <button
                type="button"
                onClick={() => handlePrintPDF('questions')}
                className="rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium"
              >
                📝 Fragen (PDF)
              </button>
              <button
                type="button"
                onClick={() => handlePrintPDF('certificate')}
                className="rounded-lg border border-indigo-300 dark:border-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 px-3 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-300"
              >
                🏆 چاپ کارنامه (PDF)
              </button>
            </div>
          </div>

          {result && (
            <section className="rounded-2xl border border-slate-300 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-900/50 p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-700 pb-3">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                    Prüfungsergebnis & Historischer Vergleich (کارنامه پیشرفت)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    با هر بار آزمون مجدد، ستون جدیدی به این جدول اضافه می‌شود
                  </p>
                </div>
              </div>

              {historyAttempts.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-200 dark:bg-slate-800">
                        <th className="p-2 border border-slate-300 dark:border-slate-700">متریک / تاریخ آزمون</th>
                        {historyAttempts.map((att, idx) => (
                          <th key={idx} className="p-2 border border-slate-300 dark:border-slate-700 text-center font-bold">
                            تلاش {idx + 1} ({att.date})
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="p-2 border border-slate-300 dark:border-slate-700 font-semibold">امتیاز مکتسبه</td>
                        {historyAttempts.map((att, idx) => (
                          <td key={idx} className="p-2 border border-slate-300 dark:border-slate-700 text-center font-bold text-blue-600">
                            {att.score} / {att.maxScore}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="p-2 border border-slate-300 dark:border-slate-700 font-semibold">درصد موفقیت</td>
                        {historyAttempts.map((att, idx) => (
                          <td key={idx} className="p-2 border border-slate-300 dark:border-slate-700 text-center font-bold">
                            {att.percentage} %
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="p-2 border border-slate-300 dark:border-slate-700 font-semibold">ارزیابی / وضعیت</td>
                        {historyAttempts.map((att, idx) => (
                          <td key={idx} className={`p-2 border border-slate-300 dark:border-slate-700 text-center font-semibold ${att.passed ? 'text-emerald-600' : 'text-red-600'}`}>
                            {att.gradeLabel}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 p-3.5 space-y-2 text-xs leading-relaxed">
                <p className="font-bold text-blue-900 dark:text-blue-300">👨‍🏫 Beurteilung der Lehrkraft:</p>
                <p className="text-slate-700 dark:text-slate-200">{result.teacherComment}</p>
                <p className="text-slate-700 dark:text-slate-300 font-medium" dir="rtl">{result.teacherCommentFa}</p>
              </div>

              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => { setSubmitted(false); setResult(null); setSolutions(false); setAnswers({}); }}
                  className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#1b2029] px-3.5 py-1.5 text-xs font-semibold"
                >
                  تمرین مجدد (فرم سفید)
                </button>
              </div>
            </section>
          )}
        </div>
      )}

      {showSentenceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6" dir="ltr">
          <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-white dark:bg-[#1b2029] border border-slate-200 dark:border-slate-700 shadow-2xl p-5 space-y-4 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
              <h3 className="text-base font-bold flex items-center gap-2">
                <span>📖</span>
                <span>Satz-für-Satz Übersetzung</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowSentenceModal(false)}
                className="rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-1 text-xs font-semibold"
              >
                بستن
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {loadingSentences ? (
                <div className="py-12 text-center text-xs text-slate-500">در حال ترجمه متن…</div>
              ) : sentencePairsCache.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">متنی یافت نشد.</div>
              ) : (
                sentencePairsCache.map((pair, idx) => (
                  <div key={idx} className="rounded-xl border border-slate-200 dark:border-slate-700/80 p-3 space-y-1.5 bg-slate-50/50 dark:bg-slate-800/30">
                    <p className="text-sm font-medium text-slate-900 dark:text-white text-left">{pair.de}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 text-right font-medium" dir="rtl">{pair.fa}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showVocabModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6" dir="ltr">
          <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-[#1b2029] border border-slate-200 dark:border-slate-700 shadow-2xl p-5 space-y-4 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
              <h3 className="text-base font-bold flex items-center gap-2">
                <span>🔤</span>
                <span>Wortschatz-Extraktor</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowVocabModal(false)}
                className="rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-1 text-xs font-semibold"
              >
                بستن
              </button>
            </div>

            <div className="flex-1 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl">
              {loadingVocabs ? (
                <div className="py-16 text-center text-xs text-slate-500">در حال استخراج لغات…</div>
              ) : extractedVocabs.length === 0 ? (
                <div className="py-16 text-center text-xs text-slate-500">لغتی یافت نشد.</div>
              ) : (
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0">
                    <tr>
                      <th className="p-2.5 border-b font-bold">Wort</th>
                      <th className="p-2.5 border-b font-bold">Bedeutung</th>
                      <th className="p-2.5 border-b font-bold text-center">Auswahl</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extractedVocabs.map((v, idx) => (
                      <tr key={idx} className="border-b hover:bg-slate-50/50">
                        <td className="p-2.5 font-semibold">{v.word}</td>
                        <td className="p-2.5 font-medium" dir="rtl">{v.translation}</td>
                        <td className="p-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={v.selected}
                            onChange={() => {
                              const updated = [...extractedVocabs];
                              updated[idx].selected = !updated[idx].selected;
                              setExtractedVocabs(updated);
                            }}
                            className="w-4 h-4 accent-blue-600 cursor-pointer"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {copySuccessMsg && (
              <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-800 font-medium">
                {copySuccessMsg}
              </div>
            )}

            <div className="pt-2 border-t flex items-center justify-between">
              <button
                type="button"
                onClick={handleCopySelectedVocabs}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-sm transition"
              >
                کپی لیست لغات انتخاب‌شده
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
