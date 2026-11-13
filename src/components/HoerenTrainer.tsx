import React, { useState, useEffect, useRef } from 'react';
import { generateWithGemini, parseAI } from '../utils/ai';

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

// اینترفیس برای ذخیره کامل تمرین در آرشیو
type SavedExerciseRecord = {
  id: string;
  createdAt: string;
  title: string;
  examType: ExamType;
  level: string;
  transcript: string;
  exercise: Exercise;
  audioUrl?: string;
  answers: Record<string, string>;
  submitted: boolean;
  result: GradingResult | null;
};

const STORAGE_KEY = 'hoeren_trainer_state_v3';
const ARCHIVE_STORAGE_KEY = 'hoeren_trainer_archive_list_v1';

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
  // ویو مود: 'menu' (صفحه انتخاب دو گزینه‌ای) | 'creator' (صفحه ساخت تمرین) | 'archive' (لیست تمرینات ذخیره‌شده)
  const [viewMode, setViewMode] = useState<'menu' | 'creator' | 'archive'>('menu');
  const [savedExercises, setSavedExercises] = useState<SavedExerciseRecord[]>([]);

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

  // استیت‌های تولید صوت (TTS)
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // استیت‌های مودم‌ها (پاپ‌آپ‌ها)
  const [showSentenceModal, setShowSentenceModal] = useState(false);
  const [sentencePairs, setSentencePairs] = useState<{ de: string; fa: string }[]>([]);
  const [loadingSentences, setLoadingSentences] = useState(false);

  const [showVocabModal, setShowVocabModal] = useState(false);
  const [vocabMinLevel, setVocabMinLevel] = useState<string>('B1');
  const [extractedVocabs, setExtractedVocabs] = useState<{ word: string; translation: string; level: string; selected: boolean }[]>([]);
  const [loadingVocabs, setLoadingVocabs] = useState(false);
  const [copySuccessMsg, setCopySuccessMsg] = useState('');

  // بارگذاری آرشیو از localStorage
  useEffect(() => {
    try {
      const storedArchive = localStorage.getItem(ARCHIVE_STORAGE_KEY);
      if (storedArchive) {
        setSavedExercises(JSON.parse(storedArchive));
      }
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.transcript) setTranscript(parsed.transcript);
        if (parsed.examType) setExamType(parsed.examType);
        if (parsed.level) setLevel(parsed.level);
        if (parsed.exercise) setExercise(parsed.exercise);
        if (parsed.answers) setAnswers(parsed.answers);
        if (typeof parsed.submitted === 'boolean') setSubmitted(parsed.submitted);
        if (parsed.result) setResult(parsed.result);
        if (parsed.audioBlobUrl) setAudioBlobUrl(parsed.audioBlobUrl);
      }
    } catch {}
  }, []);

  // ذخیره خودکار وضعیت جاری
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          transcript,
          examType,
          level,
          exercise,
          answers,
          submitted,
          result,
          audioBlobUrl,
        })
      );
    } catch {}
  }, [transcript, examType, level, exercise, answers, submitted, result, audioBlobUrl]);

  // ذخیره لیست آرشیو در localStorage
  const saveToArchiveList = (currentExercise: Exercise, curTranscript: string, curAudioUrl: string | null, curAnswers: Record<string, string>, curSub: boolean, curRes: GradingResult | null) => {
    try {
      const newItem: SavedExerciseRecord = {
        id: 'ex_' + Date.now(),
        createdAt: new Date().toLocaleDateString('de-AT', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
        title: currentExercise.title,
        examType: currentExercise.examType,
        level: currentExercise.level,
        transcript: curTranscript,
        exercise: currentExercise,
        audioUrl: curAudioUrl || undefined,
        answers: curAnswers,
        submitted: curSub,
        result: curRes,
      };
      const updated = [newItem, ...savedExercises];
      setSavedExercises(updated);
      localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(updated));
    } catch {}
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
        aiStrengths = 'Gutes Bemühen beim Verstehen des Hörtextes. تلاش خوب در درک متن شنیداری.';
        aiRecommendations = 'Üben Sie weiter mit originalen Audios. تمرین بیشتر با فایل‌های صوتی توصیه می‌شود.';
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

      // ذخیره اتوماتیک در آرشیو تمرینات پس از تصحیح
      saveToArchiveList(exercise, transcript, audioBlobUrl, answers, true, finalRes);
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
    setAudioBlobUrl(null);

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
      // ذخیره اولیه در آرشیو تمرینات
      saveToArchiveList(generatedExercise, transcript, null, {}, false, null);
    } catch (e: any) {
      setError(e?.message || 'ساخت تمرین ناموفق بود.');
    } finally {
      setLoading(false);
    }
  };

  // تابع ساخت فایل صوتی با استفاده از Web Speech Synthesis API (موتور TTS مرورگر) یا قابلیت صوتی برنامه
  const handleGenerateAudio = () => {
    if (!transcript.trim()) return;
    setGeneratingAudio(true);

    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(transcript);
        utterance.lang = 'de-DE';
        utterance.rate = 0.95; // سرعت طبیعی و مناسب برای تمرین شنیداری

        // ساخت Blob صوتی شبیه‌سازی‌شده یا استفاده از رخدادهای SpeechSynthesis
        utterance.onend = () => setIsPlayingAudio(false);
        utterance.onerror = () => setIsPlayingAudio(false);

        window.speechSynthesis.speak(utterance);
        setIsPlayingAudio(true);
        setGeneratingAudio(false);
      } else {
        alert('مروگر شما از قابلیت تولید صوت پشتیبانی نمی‌کند.');
        setGeneratingAudio(false);
      }
    } catch {
      setGeneratingAudio(false);
    }
  };

  const togglePlayPauseAudio = () => {
    if ('speechSynthesis' in window) {
      if (isPlayingAudio) {
        window.speechSynthesis.pause();
        setIsPlayingAudio(false);
      } else {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        } else {
          handleGenerateAudio();
        }
        setIsPlayingAudio(true);
      }
    }
  };

  // تابع باز کردن پاپ‌آپ ترجمه جمله به جمله
  const handleOpenSentenceModal = async () => {
    if (!transcript.trim()) return;
    setShowSentenceModal(true);
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
      setSentencePairs(arr.map((item: any) => ({ de: String(item?.de || ''), fa: String(item?.fa || '') })));
    } catch {
      setSentencePairs([{ de: transcript, fa: 'خطا در بارگذاری ترجمه جمله به جمله.' }]);
    } finally {
      setLoadingSentences(false);
    }
  };

  // تابع باز کردن پاپ‌آپ استخراج واژگان
  const handleOpenVocabModal = async () => {
    if (!transcript.trim()) return;
    setShowVocabModal(true);
    fetchExtractedVocabs(vocabMinLevel);
  };

  const fetchExtractedVocabs = async (minLvl: string) => {
    setLoadingVocabs(true);
    try {
      const prompt = `
Analysiere das folgende Transkript und extrahiere wichtige Wörter oder Ausdrücke ab dem Niveau "${minLvl}" und höher (z.B. wenn minLvl=B1, dann B1, B2, C1, C2).
Ignoriere Wörter unterhalb des gewählten Niveaus (wie A1/A2, einfache Pronomen یا Grundverben).
Gib das Ergebnis als JSON-Array zurück. Jedes Objekt muss folgende Felder haben:
- "word": Das Wort auf Deutsch (bei Nomen UNBEDINGT mit Artikel, z.B. "der Tisch", "das Buch").
- "translation": Persische Übersetzung.
- "level": Das Sprachniveau (z.B. "B1", "B2", "C1").

Antworte ausschließlich mit gültigem JSON (ohne Markdown).
Format: [{"word": "der Vorschlag", "translation": "پیشنهاد", "level": "B1"}]

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
    setCopySuccessMsg('لیست لغات کپی شد ، از تب واژگان قسمت افزودن گروهی بخش متن دستی میتوانید لغات را به واژگان برنامه اضافه کنید');
    setTimeout(() => setCopySuccessMsg(''), 7000);
  };

  // تابع چاپ PDF با فونت‌های ۳۰٪ ریزتر شده در بخش پرینت
  const handlePrintPDF = (mode: 'transcript' | 'questions' | 'certificate') => {
    if (!exercise) return;

    const today = new Date().toLocaleDateString('de-AT', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    // فونت‌ها حدود ۳۰ درصد کوچک‌تر شده‌اند (مثلا از ۱۱.۵pt به ۸pt و سایر اندازه‌ها متناسب)
    const baseStyles = `
      <style>
        @page { size: A4; margin: 12mm; }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          color: #1e293b;
          line-height: 1.3;
          font-size: 8pt;
          margin: 0;
          padding: 0;
        }
        .header {
          border-bottom: 1.5px solid #0f172a;
          padding-bottom: 4px;
          margin-bottom: 8px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }
        .header-title { font-size: 10pt; font-weight: 800; color: #0f172a; margin: 0; }
        .header-meta { font-size: 6.5pt; color: #475569; margin-top: 1px; }
        .badge { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 1px 6px; border-radius: 3px; font-weight: 700; font-size: 6.5pt; }
        h2 { font-size: 8.5pt; color: #0f172a; border-left: 2.5px solid #2563eb; padding-left: 4px; margin: 8px 0 4px 0; page-break-after: avoid; }
        .question-box { margin-bottom: 5px; padding: 4px 6px; border: 1px solid #cbd5e1; border-radius: 3px; page-break-inside: avoid; }
        .options { margin-top: 2px; padding-left: 8px; font-size: 7.5pt; }
        .option-item { margin: 1px 0; }
        .write-line { border-bottom: 1px dashed #64748b; height: 12px; margin-top: 3px; }
        .transcript-body { white-space: pre-wrap; text-align: justify; font-size: 7.5pt; line-height: 1.35; background: #f8fafc; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; }
        table { width: 100%; border-collapse: collapse; margin: 5px 0; font-size: 7pt; }
        th, td { border: 1px solid #cbd5e1; padding: 3px 5px; text-align: left; }
        th { background: #f1f5f9; font-weight: 700; }
        .summary-card { background: #f8fafc; border: 1px solid #94a3b8; border-radius: 4px; padding: 6px; margin-bottom: 6px; font-size: 7pt; }
        .pass { color: #059669; font-weight: 700; }
        .fail { color: #dc2626; font-weight: 700; }
        .partial { color: #d97706; font-weight: 700; }
        .footer { margin-top: 10px; padding-top: 3px; border-top: 1px solid #cbd5e1; font-size: 6pt; color: #64748b; display: flex; justify-content: space-between; }
      </style>
    `;

    let bodyContent = '';

    if (mode === 'transcript') {
      bodyContent = `
        <div class="header">
          <div>
            <h1 class="header-title">Hörtext / Transkript</h1>
            <div class="header-meta">${escapeHtml(exercise.title)} · ${escapeHtml(EXAM_LABELS[exercise.examType])}</div>
          </div>
          <div class="badge">Niveau ${escapeHtml(exercise.level)} · ${today}</div>
        </div>
        <div class="transcript-body">${escapeHtml(transcript.trim())}</div>
      `;
    } else if (mode === 'questions') {
      let secNum = 0;
      let qHtml = '';

      if (exercise.part1TF.length > 0) {
        secNum++;
        qHtml += `<h2>${secNum}. Richtig oder falsch?</h2>`;
        exercise.part1TF.forEach((q, i) => {
          qHtml += `
            <div class="question-box">
              <div><strong>${i + 1}.</strong> ${escapeHtml(q.statement)}</div>
              <div class="options">☐ Richtig &nbsp;&nbsp;&nbsp;&nbsp; ☐ Falsch</div>
            </div>`;
        });
      }

      if (exercise.part2MC.length > 0) {
        secNum++;
        qHtml += `<h2>${secNum}. Wählen Sie die richtige Lösung (A, B oder C).</h2>`;
        exercise.part2MC.forEach((q, i) => {
          qHtml += `
            <div class="question-box">
              <div><strong>${i + 1}.</strong> ${escapeHtml(q.question)}</div>
              <div class="options">
                ${q.options
                  .map((opt, idx) => `<div class="option-item">☐ <strong>${String.fromCharCode(65 + idx)})</strong> ${escapeHtml(opt)}</div>`)
                  .join('')}
              </div>
            </div>`;
        });
      }

      if (exercise.part3Gap.length > 0) {
        secNum++;
        qHtml += `<h2>${secNum}. Ergänzen Sie die Lücken.</h2>`;
        exercise.part3Gap.forEach((q, i) => {
          qHtml += `
            <div class="question-box">
              <div><strong>${i + 1}.</strong> ${escapeHtml(q.sentence)}</div>
              <div class="write-line"></div>
            </div>`;
        });
      }

      if (exercise.part4Short.length > 0) {
        secNum++;
        qHtml += `<h2>${secNum}. Beantworten Sie die Fragen.</h2>`;
        exercise.part4Short.forEach((q, i) => {
          qHtml += `
            <div class="question-box">
              <div><strong>${i + 1}.</strong> ${escapeHtml(q.question)}</div>
              <div class="write-line"></div>
            </div>`;
        });
      }

      if (exercise.vocabulary.length > 0) {
        qHtml += `<h2>Wortschatz – Erklären Sie die Wörter auf Deutsch.</h2>`;
        exercise.vocabulary.forEach((q, i) => {
          qHtml += `
            <div class="question-box">
              <div><strong>${i + 1}. ${escapeHtml(q.word)}</strong></div>
              <div class="write-line"></div>
            </div>`;
        });
      }

      bodyContent = `
        <div class="header">
          <div>
            <h1 class="header-title">HÖRVERSTEHEN – Prüfungsaufgaben</h1>
            <div class="header-meta">${escapeHtml(exercise.title)} · ${escapeHtml(EXAM_LABELS[exercise.examType])}</div>
          </div>
          <div class="badge">Niveau ${escapeHtml(exercise.level)} · ${today}</div>
        </div>
        <div style="margin-bottom:6px; font-size:7pt;">
          <strong>Name:</strong> ___________________________ &nbsp;&nbsp;&nbsp; <strong>Datum:</strong> ${today}
        </div>
        ${qHtml}
      `;
    } else if (mode === 'certificate' && result) {
      const sectionRows = result.sections
        .map(s => `<tr><td>${escapeHtml(s.label)}</td><td>${s.earned} / ${s.total}</td><td>${s.percentage} %</td></tr>`)
        .join('');

      let detailRows = '';
      const appendDetailRow = (label: string, userAns: string, grade?: Grade) => {
        if (!grade) return;
        const statusText =
          grade.points === 1
            ? '<span class="pass">✓ Richtig</span>'
            : grade.points === 0.5
              ? '<span class="partial">◐ Teilweise</span>'
              : '<span class="fail">✗ Falsch</span>';

        detailRows += `
          <tr>
            <td>${escapeHtml(label)}</td>
            <td>${escapeHtml(userAns || '(Keine)')}</td>
            <td>${statusText}</td>
            <td>${escapeHtml(grade.feedback)}<br/><span style="color:#475569; font-size:6pt;">${escapeHtml(grade.feedbackFa)}</span></td>
          </tr>`;
      };

      exercise.part1TF.forEach((q, i) => {
        const val = answers[`tf-${i}`];
        appendDetailRow(`TF ${i + 1}: ${q.statement}`, val === 'true' ? 'Richtig' : val === 'false' ? 'Falsch' : '', result.details[`tf-${i}`]);
      });
      exercise.part2MC.forEach((q, i) => {
        const idx = Number(answers[`mc-${i}`]);
        appendDetailRow(`MC ${i + 1}: ${q.question}`, !isNaN(idx) && q.options[idx] ? `${String.fromCharCode(65 + idx)}) ${q.options[idx]}` : '', result.details[`mc-${i}`]);
      });
      exercise.part3Gap.forEach((q, i) => {
        appendDetailRow(`Lücke ${i + 1}`, answers[`gap-${i}`] || '', result.details[`gap-${i}`]);
      });
      exercise.part4Short.forEach((q, i) => {
        appendDetailRow(`Frage ${i + 1}`, answers[`short-${i}`] || '', result.details[`short-${i}`]);
      });
      exercise.vocabulary.forEach((q, i) => {
        appendDetailRow(`Wort ${q.word}`, answers[`v-${i}`] || '', result.details[`v-${i}`]);
      });

      bodyContent = `
        <div class="header">
          <div>
            <h1 class="header-title">Prüfungszeugnis & Auswertung</h1>
            <div class="header-meta">${escapeHtml(exercise.title)} · ${escapeHtml(EXAM_LABELS[exercise.examType])}</div>
          </div>
          <div class="badge">Niveau ${escapeHtml(exercise.level)} · ${today}</div>
        </div>

        <div class="summary-card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="font-size:9pt; font-weight:800;">Ergebnis: ${result.score} / ${result.maxScore} (${result.percentage} %)</span>
            <span style="font-size:8.5pt;" class="${result.passed ? 'pass' : 'fail'}">${escapeHtml(result.gradeLabel)} · ${result.passed ? 'BESTANDEN' : 'NICHT BESTANDEN'}</span>
          </div>
          <p style="margin:2px 0;"><strong>Lehrkraft:</strong> ${escapeHtml(result.teacherComment)} / <span dir="rtl">${escapeHtml(result.teacherCommentFa)}</span></p>
        </div>

        <h2>Teilergebnisse</h2>
        <table><thead><tr><th>Bereich</th><th>Punkte</th><th>%</th></tr></thead><tbody>${sectionRows}</tbody></table>

        <h2>Detailauswertung</h2>
        <table><thead><tr><th>Aufgabe</th><th>Antwort</th><th>Status</th><th>Feedback</th></tr></thead><tbody>${detailRows}</tbody></table>
      `;
    }

    const existingIframe = document.getElementById('print-iframe');
    if (existingIframe) existingIframe.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'print-iframe';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html lang="de">
        <head>
          <meta charset="UTF-8" />
          <title>Print</title>
          ${baseStyles}
        </head>
        <body>
          ${bodyContent}
          <div class="footer">
            <span>Peyman Saberi · Hörverstehen Trainer</span>
            <span>${today}</span>
          </div>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 300);
            };
          </script>
        </body>
        </html>
      `);
      doc.close();
    }
  };

  // رندر فیدبک با رعایت قانون ۱ (ترجمه مخفی تا زمان تصحیح) و قانون ۲ (حذف توضیحات تکراری و نمایش تک‌توضیح شفاف)
  const renderFeedback = (id: string, translation?: string) => {
    return (
      <div className="space-y-1 pt-1">
        {/* ترجمه سوال فقط بعد از زدن دکمه تصحیح نمایش داده می‌شود */}
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
                {/* حذف توضیحات تکراری و نمایش بازخورد دقیق یکتا */}
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

  // ۱. صفحه منوی دو گزینه‌ای (ورودی Hörverstehen)
  if (viewMode === 'menu') {
    return (
      <div className="max-w-xl mx-auto space-y-6 text-left text-sm text-slate-800 dark:text-slate-100 py-8" dir="ltr">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-300 dark:border-slate-600 w-8 h-8 flex items-center justify-center text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            ✕
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
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">مشاهده لیست تمرین‌های ذخیره‌شده و تمرین مجدد بدون نیاز به هوش مصنوعی</p>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // ۲. صفحه لیست تمرینات قبلی (آرشیو)
  if (viewMode === 'archive') {
    return (
      <div className="max-w-3xl mx-auto space-y-4 text-left text-sm text-slate-800 dark:text-slate-100" dir="ltr">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
          <button
            type="button"
            onClick={() => setViewMode('menu')}
            className="rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            ← بازگشت به منو
          </button>
          <h2 className="text-base font-bold">📂 آرشیو تمرینات درک شنیداری</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-300 dark:border-slate-600 w-8 h-8 flex items-center justify-center text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        {savedExercises.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-xs space-y-2">
            <p>هنوز هیچ تمرینی در آرشیو ذخیره نشده است.</p>
            <button
              onClick={() => setViewMode('creator')}
              className="text-blue-600 dark:text-blue-400 font-semibold underline"
            >
              همین حالا اولین تمرین را بسازید
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
                      setTranscript(item.transcript);
                      setExamType(item.examType);
                      setLevel(item.level);
                      setExercise(item.exercise);
                      setAnswers(item.answers || {});
                      setSubmitted(item.submitted || false);
                      setResult(item.result || null);
                      setAudioBlobUrl(item.audioUrl || null);
                      setViewMode('creator');
                    }}
                    className="rounded-xl bg-blue-600 hover:bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition"
                  >
                    شروع / ادامه تمرین ➔
                  </button>
                  <button
                    onClick={() => {
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

  // ۳. صفحه اصلی ساخت و انجام تمرین
  return (
    <div className="max-w-4xl mx-auto space-y-4 text-left text-sm text-slate-800 dark:text-slate-100" dir="ltr">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setViewMode('menu')}
          className="rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          ← منوی اصلی
        </button>
        <button
          type="button"
          onClick={onClose}
          title="Schließen"
          aria-label="Schließen"
          className="rounded-full border border-slate-300 dark:border-slate-600 w-8 h-8 flex items-center justify-center text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        >
          ✕
        </button>
      </div>

      {/* باکس ورودی متن و تنظیمات */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1b2029] p-4 sm:p-5 shadow-sm space-y-3.5">
        <div>
          <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
            <span>🎧</span>
            <span>Hörverstehen erstellen</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            نوع آزمون و سطح را انتخاب کنید و متن فایل صوتی را وارد کنید تا آزمون استاندارد ساخته شود.
          </p>
        </div>

        <textarea
          rows={6}
          value={transcript}
          onChange={e => setTranscript(e.target.value)}
          className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-900/40 p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          placeholder="Transkript hier einfügen …"
        />

        {/* دکمه ساخت فایل صوتی با قابلیت Play/Pause و موتور صوتی پیشرفته */}
        {transcript.trim().length >= 10 && (
          <div className="flex flex-wrap items-center gap-3 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={handleGenerateAudio}
              disabled={generatingAudio}
              className="rounded-xl bg-purple-600 hover:bg-purple-700 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition flex items-center gap-1.5"
            >
              <span>🔊</span>
              <span>{generatingAudio ? 'در حال ساخت فایل صوتی…' : 'ساخت فایل صوتی (تلفظ ترانسکریپت)'}</span>
            </button>

            <button
              type="button"
              onClick={togglePlayPauseAudio}
              disabled={!transcript.trim()}
              className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#232934] px-3.5 py-2 text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-100 transition"
            >
              <span>{isPlayingAudio ? '⏸ Pause' : '▶ Play'}</span>
            </button>

            <span className="text-[11px] text-slate-500 ml-auto">سیستم صوتی مجهز به موتور استاندارد تبدیل متن به گفتار آلمانی.</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <label className="text-xs font-semibold flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <span>Prüfungsformat:</span>
            <select
              value={examType}
              onChange={e => setExamType(e.target.value as ExamType)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#232934] px-2.5 py-1.5 text-xs font-medium"
            >
              {(Object.keys(EXAM_LABELS) as ExamType[]).map(type => (
                <option key={type} value={type}>
                  {EXAM_LABELS[type]}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-semibold flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <span>Niveau:</span>
            <select
              value={level}
              onChange={e => setLevel(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#232934] px-2.5 py-1.5 text-xs font-medium"
            >
              {['A2', 'B1', 'B2', 'C1', 'C2'].map(x => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>

          <button
            onClick={generate}
            disabled={loading}
            className="ml-auto rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm disabled:opacity-50 transition"
          >
            {loading ? 'در حال ساخت تمرین…' : 'ساخت تمرین'}
          </button>
        </div>

        {/* دکمه‌های ابزار کمکی (ترجمه جمله به جمله و استخراج لغات) */}
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

      {/* بدنه آزمون */}
      {exercise && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#1b2029] p-4 sm:p-6 shadow-sm space-y-5">
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

          {/* بخش ۱: TF */}
          {exercise.part1TF.length > 0 && (() => {
            sectionCounter++;
            return (
              <section className="space-y-2.5">
                <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100">
                  {sectionCounter}. Richtig oder falsch?
                </h3>
                {exercise.part1TF.map((q, i) => {
                  const id = `tf-${i}`;
                  return (
                    <div key={id} className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/40 dark:bg-slate-800/20 p-3 space-y-2">
                      <p className="text-sm leading-snug">
                        <span className="font-semibold">{i + 1}.</span> {q.statement}
                      </p>
                      <div className="flex gap-6 text-xs sm:text-sm">
                        {['Richtig', 'Falsch'].map((label, j) => (
                          <label key={label} className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="radio"
                              name={id}
                              checked={answers[id] === String(j === 0)}
                              onChange={() => answer(id, String(j === 0))}
                              disabled={submitted}
                              className="accent-blue-600"
                            />
                            <span>{label}</span>
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

          {/* بخش ۲: MC */}
          {exercise.part2MC.length > 0 && (() => {
            sectionCounter++;
            return (
              <section className="space-y-2.5">
                <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100">
                  {sectionCounter}. Wählen Sie die richtige Lösung (A, B oder C).
                </h3>
                {exercise.part2MC.map((q, i) => {
                  const id = `mc-${i}`;
                  return (
                    <div key={id} className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/40 dark:bg-slate-800/20 p-3 space-y-2">
                      <p className="text-sm font-medium leading-snug">
                        <span className="font-semibold">{i + 1}.</span> {q.question}
                      </p>
                      <div className="space-y-1.5 pl-1 text-xs sm:text-sm">
                        {q.options.map((opt, optIdx) => (
                          <label key={optIdx} className="flex items-start gap-2 cursor-pointer select-none">
                            <input
                              type="radio"
                              name={id}
                              checked={answers[id] === String(optIdx)}
                              onChange={() => answer(id, String(optIdx))}
                              disabled={submitted}
                              className="mt-1 accent-blue-600"
                            />
                            <span className="leading-snug">
                              <strong className="font-semibold">{String.fromCharCode(65 + optIdx)})</strong> {opt}
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

          {/* بخش ۳: Gap */}
          {exercise.part3Gap.length > 0 && (() => {
            sectionCounter++;
            return (
              <section className="space-y-2.5">
                <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100">
                  {sectionCounter}. Ergänzen Sie die Lücken.
                </h3>
                {exercise.part3Gap.map((q, i) => {
                  const id = `gap-${i}`;
                  return (
                    <div key={id} className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/40 dark:bg-slate-800/20 p-3 space-y-2">
                      <p className="text-sm leading-snug">
                        <span className="font-semibold">{i + 1}.</span> {q.sentence}
                      </p>
                      <input
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900/50 px-3 py-1.5 text-sm"
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

          {/* بخش ۴: Short */}
          {exercise.part4Short.length > 0 && (() => {
            sectionCounter++;
            return (
              <section className="space-y-2.5">
                <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100">
                  {sectionCounter}. Beantworten Sie die Fragen.
                </h3>
                {exercise.part4Short.map((q, i) => {
                  const id = `short-${i}`;
                  return (
                    <div key={id} className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/40 dark:bg-slate-800/20 p-3 space-y-2">
                      <p className="text-sm leading-snug">
                        <span className="font-semibold">{i + 1}.</span> {q.question}
                      </p>
                      <textarea
                        rows={2}
                        value={answers[id] || ''}
                        onChange={e => answer(id, e.target.value)}
                        disabled={submitted}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900/50 px-3 py-1.5 text-sm"
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

          {/* واژگان */}
          {exercise.vocabulary.length > 0 && (
            <section className="space-y-2.5">
              <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100">
                Wortschatz – Erklären Sie die Wörter.
              </h3>
              {exercise.vocabulary.map((q, i) => {
                const id = `v-${i}`;
                return (
                  <div key={id} className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/40 dark:bg-slate-800/20 p-3 space-y-2">
                    <p className="text-sm font-semibold">
                      {i + 1}. {q.word}
                    </p>
                    <input
                      value={answers[id] || ''}
                      onChange={e => answer(id, e.target.value)}
                      disabled={submitted}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900/50 px-3 py-1.5 text-sm"
                      placeholder="Bedeutung auf Deutsch"
                    />
                    {solutions && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">
                        <strong>Erklärung:</strong> {q.meaning}
                      </p>
                    )}
                    {renderFeedback(id)}
                  </div>
                );
              })}
            </section>
          )}

          {warningMsg && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-300">
              {warningMsg}
            </div>
          )}

          {/* دکمه‌های پایانی آزمون و چاپ PDF */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleCheckClick}
                disabled={grading || submitted}
                className="rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm disabled:opacity-50 transition"
              >
                {grading ? 'Antworten werden bewertet…' : submitted ? 'Antworten überprüft' : 'Antworten überprüfen'}
              </button>

              <button
                type="button"
                onClick={() => setSolutions(v => !v)}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm transition"
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
                disabled={!result}
                className="rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium disabled:opacity-40"
              >
                📊 Zeugnis (PDF)
              </button>
            </div>
          </div>

          {/* کارنامه */}
          {result && (
            <section className="rounded-2xl border border-slate-300 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-900/50 p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-700 pb-3">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                    Prüfungsergebnis & Gutachten
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {EXAM_LABELS[exercise.examType]} · Niveau {exercise.level}
                  </p>
                </div>

                <div className="text-right">
                  <div className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">
                    {result.score} / {result.maxScore} <span className="text-sm font-semibold text-slate-500">({result.percentage} %)</span>
                  </div>
                  <div className={`text-xs font-bold ${result.passed ? 'text-emerald-600' : 'text-red-600'}`}>
                    {result.gradeLabel} · {result.passed ? 'Bestanden' : 'Nicht bestanden'}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 p-3.5 space-y-2 text-xs leading-relaxed">
                <p className="font-bold text-blue-900 dark:text-blue-300">👨‍🏫 Beurteilung der Lehrkraft:</p>
                <p className="text-slate-700 dark:text-slate-200">{result.teacherComment}</p>
                <p className="text-slate-700 dark:text-slate-300 font-medium" dir="rtl">{result.teacherCommentFa}</p>
              </div>

              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => { setSubmitted(false); setResult(null); setSolutions(false); }}
                  className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#1b2029] px-3.5 py-1.5 text-xs font-semibold"
                >
                  Antworten bearbeiten
                </button>
                <button
                  type="button"
                  onClick={() => { setAnswers({}); setSubmitted(false); setResult(null); setSolutions(false); }}
                  className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#1b2029] px-3.5 py-1.5 text-xs font-semibold"
                >
                  Erneut üben
                </button>
              </div>
            </section>
          )}
        </div>
      )}

      {/* مودال (پاپ‌آپ) ترجمه جمله به جمله */}
      {showSentenceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6" dir="ltr">
          <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-white dark:bg-[#1b2029] border border-slate-200 dark:border-slate-700 shadow-2xl p-5 space-y-4 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
              <h3 className="text-base font-bold flex items-center gap-2">
                <span>📖</span>
                <span>Satz-für-Satz Übersetzung (ترجمه جمله به جمله)</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowSentenceModal(false)}
                className="rounded-full w-8 h-8 flex items-center justify-center border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {loadingSentences ? (
                <div className="py-12 text-center text-xs text-slate-500">در حال پردازش و ترجمه متن…</div>
              ) : sentencePairs.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">متنی یافت نشد.</div>
              ) : (
                sentencePairs.map((pair, idx) => (
                  <div key={idx} className="rounded-xl border border-slate-200 dark:border-slate-700/80 p-3 space-y-1.5 bg-slate-50/50 dark:bg-slate-800/30">
                    <p className="text-sm font-medium text-slate-900 dark:text-white text-left">
                      {pair.de}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 text-right font-medium" dir="rtl">
                      {pair.fa}
                    </p>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 text-right">
              <button
                type="button"
                onClick={() => setShowSentenceModal(false)}
                className="rounded-xl bg-slate-200 dark:bg-slate-800 px-4 py-2 text-xs font-semibold"
              >
                بستن (Zurück)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* مودال (پاپ‌آپ) استخراج هوشمند واژگان */}
      {showVocabModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6" dir="ltr">
          <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-[#1b2029] border border-slate-200 dark:border-slate-700 shadow-2xl p-5 space-y-4 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
              <h3 className="text-base font-bold flex items-center gap-2">
                <span>🔤</span>
                <span>Wortschatz-Extraktor (استخراج هوشمند واژگان)</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowVocabModal(false)}
                className="rounded-full w-8 h-8 flex items-center justify-center border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            {/* انتخاب فیلتر سطح */}
            <div className="flex flex-wrap items-center gap-3 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
              <label className="text-xs font-semibold flex items-center gap-2">
                <span>حذف سطوح پایین‌تر از:</span>
                <select
                  value={vocabMinLevel}
                  onChange={e => {
                    const val = e.target.value;
                    setVocabMinLevel(val);
                    fetchExtractedVocabs(val);
                  }}
                  className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#232934] px-2.5 py-1 text-xs font-medium"
                >
                  <option value="A2">A2 (و پایین‌تر را نمی‌خواهم)</option>
                  <option value="B1">B1 (و پایین‌تر را نمی‌خواهم)</option>
                  <option value="B2">B2 (و پایین‌تر را نمی‌خواهم)</option>
                  <option value="C1">C1 (و پایین‌تر را نمی‌خواهم)</option>
                </select>
              </label>
              <span className="text-xs text-slate-500 ml-auto">فقط لغات سطح انتخابی و بالاتر استخراج می‌شوند.</span>
            </div>

            {/* جدول لغات */}
            <div className="flex-1 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl">
              {loadingVocabs ? (
                <div className="py-16 text-center text-xs text-slate-500">در حال استخراج و تحلیل سطح لغات متن…</div>
              ) : extractedVocabs.length === 0 ? (
                <div className="py-16 text-center text-xs text-slate-500">لغتی با این فیلتر سطح یافت نشد.</div>
              ) : (
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0">
                    <tr>
                      <th className="p-2.5 border-b border-slate-200 dark:border-slate-700 font-bold">Wort (واژه با ارتیکل)</th>
                      <th className="p-2.5 border-b border-slate-200 dark:border-slate-700 font-bold">Bedeutung (ترجمه فارسی)</th>
                      <th className="p-2.5 border-b border-slate-200 dark:border-slate-700 font-bold">Niveau</th>
                      <th className="p-2.5 border-b border-slate-200 dark:border-slate-700 font-bold text-center">Auswahl (انتخاب)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extractedVocabs.map((v, idx) => (
                      <tr key={idx} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="p-2.5 font-semibold text-slate-900 dark:text-white">{v.word}</td>
                        <td className="p-2.5 font-medium text-slate-700 dark:text-slate-200" dir="rtl">{v.translation}</td>
                        <td className="p-2.5"><span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold text-[10px]">{v.level}</span></td>
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
              <div className="rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-700 p-3 text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed font-medium">
                {copySuccessMsg}
              </div>
            )}

            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <button
                type="button"
                onClick={handleCopySelectedVocabs}
                disabled={extractedVocabs.filter(v => v.selected).length === 0}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-50 transition flex items-center gap-1.5"
              >
                <span>📋</span>
                <span>کپی لیست لغات انتخاب‌شده</span>
              </button>

              <button
                type="button"
                onClick={() => setShowVocabModal(false)}
                className="rounded-xl bg-slate-200 dark:bg-slate-800 px-4 py-2 text-xs font-semibold"
              >
                بستن (Zurück)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
