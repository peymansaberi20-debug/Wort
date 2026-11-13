import React, { useState, useEffect } from 'react';
import { generateWithGemini, parseAI } from '../utils/ai';

type ExamType = 'Standard' | 'Goethe' | 'OESD' | 'Telc' | 'EPD';

type TF = { statement: string; answer: boolean; explanation: string };
type MC = { question: string; options: string[]; answerIndex: number; explanation: string };
type Gap = { sentence: string; answer: string };
type Short = { question: string; answer: string };
type Vocab = { word: string; meaning: string };

type Grade = {
  correct: boolean;
  points: number;
  feedback: string;
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

const STORAGE_KEY = 'hoeren_trainer_state_v2';

const EXAM_LABELS: Record<ExamType, string> = {
  Standard: 'Standard / Allgemein',
  Goethe: 'Goethe-Zertifikat',
  OESD: 'ÖSD (Österreichisches Sprachdiplom)',
  Telc: 'telc Deutsch',
  EPD: 'EPD (Ergänzungsprüfung Deutsch – Uni Wien / VWU)',
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
- Stil: Goethe-Zertifikat Hörverstehen. Fokus auf Global-, Detail- und selektives Verstehen, Meinungen und Absichten der Sprecher.
- Aufteilung:
  * part1TF: 4 Richtig/Falsch-Aussagen
  * part2MC: 4 Multiple-Choice-Fragen (je 3 Optionen, typisches Goethe-Format mit Distraktoren)
  * part3Gap: 0 Lückensätze (leeres Array [])
  * part4Short: 0 offene Fragen (leeres Array [])
  * vocabulary: 3 prüfungsrelevante Ausdrücke`,
  OESD: `
- Stil: ÖSD (Österreichisches Sprachdiplom Deutsch). Fokus auf präzise Detailinformationen, Zahlen/Fakten und standardsprachliche Nuancen.
- Aufteilung:
  * part1TF: 3 Richtig/Falsch-Aussagen
  * part2MC: 2 Multiple-Choice-Fragen (je 3 Optionen)
  * part3Gap: 3 Lückensätze (Notizen/Stichworte ergänzen, typisch für ÖSD)
  * part4Short: 1 offene Detailfrage
  * vocabulary: 3 relevante Wörter/Wendungen`,
  Telc: `
- Stil: telc Deutsch Hörverstehen (Globalverstehen, Detailverstehen, selektives Verstehen). Klare, direkte Aussagen.
- Aufteilung:
  * part1TF: 5 Richtig/Falsch-Aussagen
  * part2MC: 4 Multiple-Choice-Fragen (je 3 Optionen, telc-typisch)
  * part3Gap: 0 Lückensätze (leeres Array [])
  * part4Short: 0 offene Fragen (leeres Array [])
  * vocabulary: 3 wichtige Begriffe`,
  EPD: `
- Stil: EPD (Ergänzungsprüfung Deutsch für österreichische Universitäten / VWU). Akademisches Hochschulniveau. Fokus auf Argumentationsstruktur, Kausalzusammenhänge, Fachterminologie und präzise Wiedergabe.
- Aufteilung:
  * part1TF: 2 anspruchsvolle Richtig/Falsch-Aussagen
  * part2MC: 2 akademische Multiple-Choice-Fragen (je 3 Optionen)
  * part3Gap: 3 komplexe Lückensätze (inhaltliche Zusammenfassung des Hörtextes)
  * part4Short: 3 offene Verständnis- und Synthesefragen (typisch für EPD)
  * vocabulary: 4 akademische/gehobene Ausdrücke aus dem Transkript`,
};

function getOfficialGradeInfo(percentage: number, examType: ExamType) {
  const passThreshold = examType === 'EPD' ? 60 : 60;
  const passed = percentage >= passThreshold;

  if (percentage >= 90) {
    return { gradeLabel: 'Sehr gut (1)', passed };
  }
  if (percentage >= 80) {
    return { gradeLabel: 'Gut (2)', passed };
  }
  if (percentage >= 70) {
    return { gradeLabel: 'Befriedigend (3)', passed };
  }
  if (percentage >= 60) {
    return { gradeLabel: 'Ausreichend (4)', passed };
  }
  return { gradeLabel: 'Nicht bestanden (5)', passed: false };
}

function buildPrompt(examType: ExamType, level: string): string {
  return `
Erstelle eine HÖRVERSTEHEN-Prüfung im exakten Stil von: "${EXAM_LABELS[examType]}" auf dem Sprachniveau "${level}".
Benutze ausschließlich Informationen aus dem Transkript. Erfinde keine Fakten. Falsche Aussagen müssen durch den Text widerlegt werden.
Antworte ausschließlich mit gültigem JSON, ohne Markdown-Blöcke.

Spezifische Prüfungsanforderungen für ${examType} (${level}):
${EXAM_INSTRUCTIONS[examType]}

JSON-Schema (halte dich exakt an diese Schlüssel):
{
  "title": "Passender Prüfungstitel",
  "examType": "${examType}",
  "level": "${level}",
  "part1TF": [
    {"statement": "Aussage", "answer": true, "explanation": "Kurze Begründung auf Deutsch"}
  ],
  "part2MC": [
    {"question": "Frage", "options": ["Option A", "Option B", "Option C"], "answerIndex": 0, "explanation": "Kurze Begründung auf Deutsch"}
  ],
  "part3Gap": [
    {"sentence": "Satz mit _____", "answer": "fehlender Text"}
  ],
  "part4Short": [
    {"question": "Offene Frage", "answer": "Musterantwort auf Deutsch"}
  ],
  "vocabulary": [
    {"word": "Wort/Ausdruck aus dem Text", "meaning": "Einfache Erklärung auf Deutsch"}
  ]
}

Wichtige Regeln:
- Wenn ein Aufgabentyp laut Prüfungsanforderung 0 Aufgaben hat, gib ein leeres Array [] zurück.
- Bei part1TF müssen sowohl richtige (true) als auch falsche (false) Aussagen vorkommen.
- Bei part2MC muss "options" immer genau 3 plausible Optionen enthalten, und "answerIndex" muss 0, 1 oder 2 sein.
- Sprachniveau (${level}) und Komplexität der Aufgaben müssen exakt dem Niveau und dem Prüfungsformat (${examType}) entsprechen.
`;
}

function normalize(data: any, fallbackExam: ExamType, fallbackLevel: string): Exercise {
  const tf = (arr: any): TF[] =>
    (Array.isArray(arr) ? arr : []).map((q: any) => ({
      statement: String(q?.statement || ''),
      answer: q?.answer === true || String(q?.answer).toLowerCase() === 'true',
      explanation: String(q?.explanation || ''),
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
      };
    });

  const gaps = (arr: any): Gap[] =>
    (Array.isArray(arr) ? arr : []).map((q: any) => ({
      sentence: String(q?.sentence || ''),
      answer: String(q?.answer || ''),
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

  // بازیابی خودکار از LocalStorage
  useEffect(() => {
    try {
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
      }
    } catch {
      // نادیده گرفتن خطاهای احتمالی storage
    }
  }, []);

  // ذخیره خودکار در LocalStorage
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
        })
      );
    } catch {
      // نادیده گرفتن خطای پر شدن حافظه
    }
  }, [transcript, examType, level, exercise, answers, submitted, result]);

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

      // 1. بخش Richtig / Falsch
      exercise.part1TF.forEach((q, i) => {
        const id = `tf-${i}`;
        const given = answers[id];
        const correct = given === String(q.answer);
        const pts = correct ? 1 : 0;

        pointsById[id] = pts;
        details[id] = {
          correct,
          points: pts,
          feedback:
            q.explanation ||
            `Richtige Antwort: ${q.answer ? 'Richtig' : 'Falsch'}`,
        };
      });

      // 2. بخش چندگزینه‌ای (Multiple Choice)
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
          feedback:
            q.explanation ||
            `Richtige Antwort: ${String.fromCharCode(65 + q.answerIndex)}) ${correctOptionText}`,
        };
      });

      // 3. سوالات تشریحی، جای‌خالی و واژگان
      const addFree = (
        id: string,
        question: string,
        expected: string,
        category: string
      ) => {
        freeQuestions.push({
          id,
          question,
          expected,
          userAnswer: answers[id] || '',
          category,
        });
      };

      exercise.part3Gap.forEach((q, i) =>
        addFree(`gap-${i}`, q.sentence, q.answer, 'Lückentext')
      );

      exercise.part4Short.forEach((q, i) =>
        addFree(`short-${i}`, q.question, q.answer, 'Offene Frage')
      );

      exercise.vocabulary.forEach((q, i) =>
        addFree(`v-${i}`, q.word, q.meaning, 'Wortschatz')
      );

      // محاسبه اولیه برای ارسال خلاصه عملکرد به ممتحن
      let aiTeacherComment = '';
      let aiStrengths = '';
      let aiRecommendations = '';

      if (freeQuestions.length > 0) {
        const gradingPrompt = `
Du bist ein erfahrener, zertifizierter Prüfer für Deutsch als Fremdsprache (${EXAM_LABELS[exercise.examType]}, Niveau ${exercise.level}).
Bewerte die Antworten des Prüfungsteilnehmers fair, objektiv und nach offiziellen Prüfungsmaßstäben.

Regeln für die Einzelbewertung:
- Verwende ausschließlich das Transkript und die Musterantworten als Grundlage.
- Akzeptiere sinngleiche, inhaltlich korrekte Antworten.
- Maßstab nach Prüfungsformat:
  * Bei EPD & C1/C2: Achte auf präzise inhaltliche Wiedergabe, korrekte Fachterminologie und klare Ausdrucksweise.
  * Bei Goethe/telc/ÖSD (A2–B2): Die kommunikative und inhaltliche Verständlichkeit steht im Vordergrund; kleine Rechtschreibfehler ohne Sinnentstellung führen nicht zum Punktabzug.
- Vergib für jede Aufgabe:
  * 1 (vollständig richtig)
  * 0.5 (teilweise richtig / Kerninformation erfasst, aber unvollständig)
  * 0 (falsch oder leer)
- Gib bei falschen oder teilrichtigen Antworten eine kurze, konstruktive Erklärung auf Deutsch.

Erstelle zusätzlich ein professionelles Gesamtfeedback eines Deutschlehrers (auf Deutsch, motivierend und fachlich fundiert):
- "teacherComment": Gesamteinschätzung der Hörverstehensleistung (2-3 Sätze).
- "strengths": Was hat der Lernende gut gemacht? (1-2 Sätze).
- "recommendations": Konkrete Lerntipps für das Prüfungsformat ${exercise.examType} auf Niveau ${exercise.level} (1-2 Sätze).

Transkript:
${transcript}

Aufgaben und Antworten:
${JSON.stringify(freeQuestions)}

Gib ausschließlich gültiges JSON in folgendem Format zurück:
{
  "results": [
    {
      "id": "gap-0",
      "points": 1,
      "feedback": "Kurze Begründung auf Deutsch"
    }
  ],
  "teacherComment": "...",
  "strengths": "...",
  "recommendations": "..."
}
`;

        const raw = await generateWithGemini(gradingPrompt, {
          timeoutMs: 60000,
          retries: 1,
        });

        const parsed = parseAI(raw)[0];
        const aiResults = Array.isArray(parsed?.results) ? parsed.results : [];

        const aiById = new Map<string, any>(
          aiResults.map((item: any) => [String(item.id), item])
        );

        freeQuestions.forEach(q => {
          const graded = aiById.get(q.id);
          const points = Number(graded?.points);
          const validPoints = [0, 0.5, 1].includes(points) ? points : 0;

          pointsById[q.id] = validPoints;
          details[q.id] = {
            correct: validPoints === 1,
            points: validPoints,
            feedback: String(
              graded?.feedback ||
                'Die Antwort konnte nicht zuverlässig bewertet werden.'
            ),
          };
        });

        aiTeacherComment = String(parsed?.teacherComment || '');
        aiStrengths = String(parsed?.strengths || '');
        aiRecommendations = String(parsed?.recommendations || '');
      }

      // محاسبه نمرات به تفکیک هر بخش
      const sections: SectionScore[] = [];
      const calcSection = (label: string, ids: string[]) => {
        if (ids.length === 0) return;
        const earned = ids.reduce((s, id) => s + (pointsById[id] ?? 0), 0);
        const total = ids.length;
        sections.push({
          label,
          earned,
          total,
          percentage: Math.round((earned / total) * 100),
        });
      };

      calcSection(
        'Richtig / Falsch',
        exercise.part1TF.map((_, i) => `tf-${i}`)
      );
      calcSection(
        'Multiple Choice',
        exercise.part2MC.map((_, i) => `mc-${i}`)
      );
      calcSection(
        'Lückentext',
        exercise.part3Gap.map((_, i) => `gap-${i}`)
      );
      calcSection(
        'Offene Fragen',
        exercise.part4Short.map((_, i) => `short-${i}`)
      );
      calcSection(
        'Wortschatz',
        exercise.vocabulary.map((_, i) => `v-${i}`)
      );

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
      const { gradeLabel, passed } = getOfficialGradeInfo(percentage, exercise.examType);

      // اگر آزمونی فقط بخش تستی (TF/MC) داشت و پرامپت تشریحی اجرا نشد، بازخورد استاندارد استاد ساخته شود
      if (!aiTeacherComment) {
        if (percentage >= 85) {
          aiTeacherComment = `Hervorragende Leistung im Prüfungsformat ${EXAM_LABELS[exercise.examType]} (${exercise.level}). Sie haben sowohl globale Zusammenhänge als auch feine Details des Hörtextes sicher erfasst.`;
          aiStrengths = 'Hohe Genauigkeit bei der Unterscheidung von Haupt- und Nebeninformationen sowie sicheres Erkennen von Ablenkern (Distraktoren).';
          aiRecommendations = 'Trainieren Sie als Nächstes mit schnelleren Originalaufnahmen oder komplexeren Fachtexten auf dem nächsthöheren Niveau.';
        } else if (percentage >= 60) {
          aiTeacherComment = `Solide Leistung auf dem Niveau ${exercise.level}. Die wichtigsten Kernaussagen wurden verstanden, bei einigen Detailfragen besteht jedoch noch Optimierungspotenzial.`;
          aiStrengths = 'Gutes Grundverständnis des Gesamtkontextes und der zentralen Themen des Transkripts.';
          aiRecommendations = 'Achten Sie beim Hören besonders auf Signalwörter, Verneinungen und feine Bedeutungsunterschiede in den Antwortoptionen.';
        } else {
          aiTeacherComment = `Das Ergebnis liegt noch unter der Bestehensgrenze für ${EXAM_LABELS[exercise.examType]} (${exercise.level}). Eine gezielte Wiederholung des Wortschatzes und der Hörstrategien wird empfohlen.`;
          aiStrengths = 'Erste Ansätze beim Erfassen einzelner Schlüsselwörter sind erkennbar.';
          aiRecommendations = 'Lesen Sie das Transkript parallel zum Hören mit, markieren Sie unbekannte Ausdrücke und wiederholen Sie die Übung anschließend ohne Textvorlage.';
        }
      }

      setResult({
        score,
        maxScore,
        percentage,
        gradeLabel,
        passed,
        sections,
        teacherComment: aiTeacherComment,
        strengths: aiStrengths,
        recommendations: aiRecommendations,
        details,
      });
      setSubmitted(true);
    } catch (e: any) {
      setError(
        e?.message ||
          'Die Antworten konnten nicht bewertet werden. Bitte erneut versuchen.'
      );
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

    try {
      const promptText = buildPrompt(examType, level);
      const raw = await generateWithGemini(
        `${promptText}\n\nTRANSKRIPT:\n${transcript.trim()}`,
        { timeoutMs: 60000, retries: 1 }
      );

      const generatedExercise = normalize(parseAI(raw)[0], examType, level);

      const totalQuestions =
        generatedExercise.part1TF.length +
        generatedExercise.part2MC.length +
        generatedExercise.part3Gap.length +
        generatedExercise.part4Short.length;

      if (totalQuestions === 0) {
        throw new Error(
          'Die Aufgaben konnten nicht vollständig erstellt werden. Bitte erneut versuchen.'
        );
      }

      setExercise(generatedExercise);
    } catch (e: any) {
      setError(
        e?.message || 'ساخت تمرین ناموفق بود. تنظیمات هوش مصنوعی را بررسی کن.'
      );
    } finally {
      setLoading(false);
    }
  };

  // تولید خروجی PDF تمیز و استاندارد از طریق پنجره پرینت مرورگر
  const handlePrintPDF = (mode: 'transcript' | 'questions' | 'certificate') => {
    if (!exercise) return;

    const printWindow = window.open('', '_blank', 'width=900,height=750');
    if (!printWindow) {
      setError('لطفاً اجازه باز شدن پنجره (Pop-up) را در مرورگر فعال کنید تا فایل PDF ساخته شود.');
      return;
    }

    const today = new Date().toLocaleDateString('de-AT', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    const baseStyles = `
      <style>
        @page { size: A4; margin: 18mm 16mm; }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          color: #1e293b;
          line-height: 1.55;
          font-size: 10.5pt;
          margin: 0;
          padding: 0;
        }
        .header {
          border-bottom: 2px solid #0f172a;
          padding-bottom: 10px;
          margin-bottom: 18px;
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }
        .header-title {
          font-size: 16pt;
          font-weight: 800;
          color: #0f172a;
          margin: 0;
        }
        .header-meta {
          font-size: 9pt;
          color: #475569;
          margin-top: 4px;
        }
        .badge {
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          padding: 4px 10px;
          border-radius: 6px;
          font-weight: 700;
          font-size: 9.5pt;
        }
        h2 {
          font-size: 12pt;
          color: #0f172a;
          border-left: 4px solid #2563eb;
          padding-left: 8px;
          margin: 18px 0 10px 0;
          page-break-after: avoid;
        }
        .question-box {
          margin-bottom: 12px;
          padding: 8px 10px;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          page-break-inside: avoid;
        }
        .options {
          margin-top: 6px;
          padding-left: 14px;
        }
        .option-item {
          margin: 3px 0;
        }
        .write-line {
          border-bottom: 1px dashed #64748b;
          height: 22px;
          margin-top: 6px;
        }
        .transcript-body {
          white-space: pre-wrap;
          text-align: justify;
          font-size: 11pt;
          line-height: 1.7;
          background: #f8fafc;
          padding: 16px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 12px 0;
          font-size: 9.5pt;
        }
        th, td {
          border: 1px solid #cbd5e1;
          padding: 7px 10px;
          text-align: left;
        }
        th {
          background: #f1f5f9;
          font-weight: 700;
        }
        .summary-card {
          background: #f8fafc;
          border: 1.5px solid #94a3b8;
          border-radius: 8px;
          padding: 14px;
          margin-bottom: 16px;
        }
        .pass { color: #059669; font-weight: 700; }
        .fail { color: #dc2626; font-weight: 700; }
        .partial { color: #d97706; font-weight: 700; }
        .footer {
          margin-top: 24px;
          padding-top: 8px;
          border-top: 1px solid #cbd5e1;
          font-size: 8.5pt;
          color: #64748b;
          display: flex;
          justify-content: space-between;
        }
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
                  .map(
                    (opt, idx) =>
                      `<div class="option-item">☐ <strong>${String.fromCharCode(65 + idx)})</strong>${escapeHtml(opt)}</div>`
                  )
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
        <div style="margin-bottom:14px; font-size:9.5pt;">
          <strong>Name:</strong> ___________________________ &nbsp;&nbsp;&nbsp; <strong>Datum:</strong> ${today}
        </div>
        ${qHtml}
      `;
    } else if (mode === 'certificate' && result) {
      const sectionRows = result.sections
        .map(
          s => `
          <tr>
            <td>${escapeHtml(s.label)}</td>
            <td>${s.earned} / ${s.total}</td>
            <td>${s.percentage} %</td>
          </tr>`
        )
        .join('');

      let detailRows = '';
      const appendDetailRow = (label: string, userAns: string, grade?: Grade) => {
        if (!grade) return;
        const statusText =
          grade.points ===
