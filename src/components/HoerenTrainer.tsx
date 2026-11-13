import React, { useState } from 'react';
import { generateWithGemini, parseAI } from '../utils/ai';

type TF = { statement: string; answer: boolean; explanation: string };
type Gap = { sentence: string; answer: string };
type Short = { question: string; answer: string };
type Vocab = { word: string; meaning: string };

type Grade = {
  correct: boolean;
  points: number;
  feedback: string;
};

type GradingResult = {
  score: number;
  maxScore: number;
  percentage: number;
  details: Record<string, Grade>;
};

type Exercise = {
  title: string;
  level: string;
  part1: TF[];
  part2: Gap[];
  part3: TF[];
  part4: Gap[];
  part5: Short[];
  part6: TF[];
  vocabulary: Vocab[];
};

const PROMPT = `
Erstelle eine HÖRVERSTEHEN-Prüfung im Stil eines deutschen Arbeitsblatts.
Benutze ausschließlich Informationen aus dem Transkript.
Erfinde keine Fakten. Falsche Aussagen müssen durch den Text widerlegt werden.
Antworte ausschließlich mit gültigem JSON, ohne Markdown.

Schema:
{
"title":"Titel",
"level":"B1",
"part1":[{"statement":"Aussage","answer":true,"explanation":"Begründung auf Deutsch"}],
"part2":[{"sentence":"Satz mit _____","answer":"fehlender Text"}],
"part3":[{"statement":"Aussage","answer":false,"explanation":"Begründung auf Deutsch"}],
"part4":[{"sentence":"Satz mit _____","answer":"fehlender Text"}],
"part5":[{"question":"Frage","answer":"Antwort auf Deutsch"}],
"part6":[{"statement":"Aussage","answer":true,"explanation":"Begründung auf Deutsch"}],
"vocabulary":[{"word":"Wort aus dem Text","meaning":"Einfache Erklärung auf Deutsch"}]
}

Anzahl:
part1: 3 Aussagen
part2: 2 Lückensätze
part3: 2 Aussagen
part4: 1 Lückensatz
part5: 2 offene Fragen
part6: 2 Aussagen
vocabulary: 4 Wörter oder Ausdrücke.

Die Richtig/Falsch-Aussagen müssen richtige UND falsche Aussagen enthalten.
Lückenantworten müssen aus dem Transkript ableitbar sein.
Sprachniveau und Aufgabenformulierungen müssen zum gewünschten Niveau passen.
`;

function normalize(data: any): Exercise {
  const tf = (arr: any): TF[] =>
    (Array.isArray(arr) ? arr : []).map((q: any) => ({
      statement: String(q?.statement || ''),
      answer: q?.answer === true || String(q?.answer).toLowerCase() === 'true',
      explanation: String(q?.explanation || '')
    }));

  const gaps = (arr: any): Gap[] =>
    (Array.isArray(arr) ? arr : []).map((q: any) => ({
      sentence: String(q?.sentence || ''),
      answer: String(q?.answer || '')
    }));

  return {
    title: String(data?.title || 'Hörverstehen'),
    level: String(data?.level || 'B1'),
    part1: tf(data?.part1),
    part2: gaps(data?.part2),
    part3: tf(data?.part3),
    part4: gaps(data?.part4),
    part5: (data?.part5 || []).map((q: any) => ({
      question: String(q?.question || ''),
      answer: String(q?.answer || '')
    })),
    part6: tf(data?.part6),
    vocabulary: (data?.vocabulary || []).map((q: any) => ({
      word: String(q?.word || ''),
      meaning: String(q?.meaning || '')
    }))
  };
}

export const HoerenTrainer: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [transcript, setTranscript] = useState('');
  const [level, setLevel] = useState('B1');
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [solutions, setSolutions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [grading, setGrading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<GradingResult | null>(null);
  const [error, setError] = useState('');

  const answer = (id: string, value: string) =>
    setAnswers(prev => ({ ...prev, [id]: value }));

  const submitAnswers = async () => {
    if (!exercise || grading || submitted) return;

    setGrading(true);
    setError('');

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

      const addTF = (items: TF[], prefix: string) => {
        items.forEach((q, i) => {
          const id = `${prefix}-${i}`;
          const given = answers[id];
          const correct = given === String(q.answer);
          const pts = correct ? 1 : 0;

          pointsById[id] = pts;
          details[id] = {
            correct,
            points: pts,
            feedback:
              q.explanation ||
              `Richtige Antwort: ${q.answer ? 'Richtig' : 'Falsch'}`
          };
        });
      };

      addTF(exercise.part1, 'p1');
      addTF(exercise.part3, 'p3');
      addTF(exercise.part6, 'p6');

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
          category
        });
      };

      exercise.part2.forEach((q, i) =>
        addFree(`p2-${i}`, q.sentence, q.answer, 'Lückentext')
      );

      exercise.part4.forEach((q, i) =>
        addFree(`p4-${i}`, q.sentence, q.answer, 'Lückentext')
      );

      exercise.part5.forEach((q, i) =>
        addFree(`p5-${i}`, q.question, q.answer, 'Offene Frage')
      );

      exercise.vocabulary.forEach((q, i) =>
        addFree(`v-${i}`, q.word, q.meaning, 'Wortschatz')
      );

      if (freeQuestions.length > 0) {
        const gradingPrompt = `
Bewerte die Antworten eines Deutschlernenden fair und anhand des Transkripts.
Niveau: ${exercise.level}

Regeln:
- Verwende ausschließlich das Transkript und die Musterantworten als Grundlage.
- Akzeptiere sinngleiche, grammatisch vertretbare Antworten.
- Bei Lückentexten muss die Ergänzung in den Satz passen und die Information korrekt wiedergeben.
- Bei offenen Fragen zählen inhaltlich richtige Antworten, auch wenn sie anders formuliert sind.
- Bei Wortschatz zählt eine sinngemäß richtige deutsche Erklärung.
- Bewerte jede Antwort mit 1 (richtig), 0.5 (teilweise richtig) oder 0 (falsch).
- Leere Antworten erhalten 0 Punkte.
- Erfinde keine zusätzlichen Fakten.
- Feedback und Begründungen auf Deutsch.
- Gib ausschließlich gültiges JSON zurück.

Transkript:
${transcript}

Aufgaben und Antworten:
${JSON.stringify(freeQuestions)}

JSON-Format:
{
  "results": [
    {
      "id": "p2-0",
      "points": 1,
      "feedback": "Kurze Begründung auf Deutsch"
    }
  ]
}

Jede übergebene ID muss genau einmal bewertet werden.
`;

        const raw = await generateWithGemini(gradingPrompt, {
          timeoutMs: 60000,
          retries: 1
        });

        const parsed = parseAI(raw)[0];
        const aiResults = Array.isArray(parsed?.results)
          ? parsed.results
          : [];

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
            )
          };
        });
      }

      const allIds = [
        ...exercise.part1.map((_, i) => `p1-${i}`),
        ...exercise.part2.map((_, i) => `p2-${i}`),
        ...exercise.part3.map((_, i) => `p3-${i}`),
        ...exercise.part4.map((_, i) => `p4-${i}`),
        ...exercise.part5.map((_, i) => `p5-${i}`),
        ...exercise.part6.map((_, i) => `p6-${i}`),
        ...exercise.vocabulary.map((_, i) => `v-${i}`)
      ];

      const maxScore = allIds.length;
      const score = allIds.reduce(
        (sum, id) => sum + (pointsById[id] ?? 0),
        0
      );

      setResult({
        score,
        maxScore,
        percentage: maxScore > 0 ? Math.round((score / maxScore) * 100) : 0,
        details
      });
      setSubmitted(true);
      setSolutions(true);
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
    setExercise(null);
    setAnswers({});
    setSolutions(false);
    setSubmitted(false);
    setResult(null);

    try {
      const raw = await generateWithGemini(
        `${PROMPT}\nNiveau: ${level}\n\nTRANSKRIPT:\n${transcript.trim()}`,
        { timeoutMs: 60000, retries: 1 }
      );

      const generatedExercise = normalize(parseAI(raw)[0]);

      if (!generatedExercise.part1.length || !generatedExercise.part2.length || !generatedExercise.part3.length) {
        throw new Error('Die Aufgaben konnten nicht vollständig erstellt werden. Bitte erneut versuchen.');
      }

      setExercise(generatedExercise);
    } catch (e: any) {
      setError(e?.message || 'ساخت تمرین ناموفق بود. تنظیمات هوش مصنوعی را بررسی کن.');
    } finally {
      setLoading(false);
    }
  };

  const renderFeedback = (id: string) => {
    if (!submitted || !result?.details[id]) return null;
    const item = result.details[id];

    return (
      <p
        className={`text-sm font-semibold ${
          item.points === 1
            ? 'text-emerald-600'
            : item.points === 0.5
              ? 'text-amber-600'
              : 'text-red-600'
        }`}
      >
        {item.points === 1
          ? '✓ Richtig'
          : item.points === 0.5
            ? '◐ Teilweise richtig'
            : '✗ Falsch'}
        {' — '}
        {item.feedback}
      </p>
    );
  };

  const renderTF = (title: string, items: TF[], prefix: string) => (
    <section className="space-y-3">
      <h3 className="text-lg font-bold">{title}</h3>
      {items.map((q, i) => {
        const id = `${prefix}-${i}`;
        return (
          <div key={id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
            <p>{i + 1}. {q.statement}</p>
            <div className="flex gap-5">
              {['Richtig', 'Falsch'].map((label, j) => (
                <label key={label} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name={id}
                    checked={answers[id] === String(j === 0)}
                    onChange={() => answer(id, String(j === 0))}
                    disabled={submitted}
                  />
                  {label}
                </label>
              ))}
            </div>
            {solutions && (
              <p className="text-sm text-emerald-600">
                Lösung: {q.answer ? 'Richtig' : 'Falsch'} — {q.explanation}
              </p>
            )}
            {renderFeedback(id)}
          </div>
        );
      })}
    </section>
  );

  const renderGaps = (title: string, items: Gap[], prefix: string) => (
    <section className="space-y-3">
      <h3 className="text-lg font-bold">{title}</h3>
      {items.map((q, i) => {
        const id = `${prefix}-${i}`;
        return (
          <div key={id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
            <p>{i + 1}. {q.sentence}</p>
            <input
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent p-2"
              value={answers[id] || ''}
              onChange={e => answer(id, e.target.value)}
              disabled={submitted}
              placeholder="Antwort auf Deutsch"
            />
            {solutions && <p className="text-sm text-emerald-600">Lösung: {q.answer}</p>}
            {renderFeedback(id)}
          </div>
        );
      })}
    </section>
  );

  return (
    <div className="space-y-5 text-left" dir="ltr">
      <div className="flex justify-start mb-3" dir="ltr">
        <button
          type="button"
          onClick={onClose}
          title="Schließen"
          aria-label="Schließen"
          className="rounded-full border border-slate-300 dark:border-slate-600 p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          ✕
        </button>
      </div>
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1b2029] p-4 space-y-3">
        <h2 className="text-xl font-extrabold">🎧 Hörverstehen erstellen</h2>
        <p className="text-sm text-slate-500">
          متن آلمانی را وارد کن تا تمرینی مشابه نمونه همراه با پاسخ‌نامه ساخته شود.
        </p>

        <textarea
          rows={7}
          value={transcript}
          onChange={e => setTranscript(e.target.value)}
          className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-transparent p-3"
          placeholder="Transkript hier einfügen …"
        />

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-semibold">
            Niveau:
            <select
              value={level}
              onChange={e => setLevel(e.target.value)}
              className="mr-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent p-2"
            >
              {['A2', 'B1', 'B2', 'C1'].map(x => (
                <option key={x} value={x}>{x}</option>
              ))}
            </select>
          </label>

          <button
            onClick={generate}
            disabled={loading}
            className="rounded-xl bg-blue-600 px-4 py-2.5 font-bold text-white disabled:opacity-50"
          >
            {loading ? 'در حال ساخت…' : 'ساخت تمرین'}
          </button>
        </div>

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </div>

      {exercise && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1b2029] p-4 md:p-6 space-y-6">
          <div className="border-b border-slate-200 dark:border-slate-700 pb-3">
            <h2 className="text-2xl font-extrabold">{exercise.title}</h2>
            <p className="text-sm text-slate-500">
              HÖRVERSTEHEN · Niveau {exercise.level}
            </p>
          </div>

          {renderTF('1. Richtig oder falsch?', exercise.part1, 'p1')}
          {renderGaps('2. Ergänzen Sie die Lücken.', exercise.part2, 'p2')}
          {renderTF('3. Richtig oder falsch?', exercise.part3, 'p3')}
          {renderGaps('4. Ergänzen Sie den Satz.', exercise.part4, 'p4')}

          <section className="space-y-3">
            <h3 className="text-lg font-bold">5. Beantworten Sie die Fragen.</h3>
            {exercise.part5.map((q, i) => {
              const id = `p5-${i}`;
              return (
                <div key={id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                  <p>{i + 1}. {q.question}</p>
                  <textarea
                    rows={2}
                    value={answers[id] || ''}
                    onChange={e => answer(id, e.target.value)}
                    disabled={submitted}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent p-2"
                  />
                  {solutions && <p className="text-sm text-emerald-600">Musterantwort: {q.answer}</p>}
                  {renderFeedback(id)}
                </div>
              );
            })}
          </section>

          {renderTF('6. Richtig oder falsch?', exercise.part6, 'p6')}

          <section className="space-y-3">
            <h3 className="text-lg font-bold">Wortschatz – Erklären Sie die Wörter.</h3>
            {exercise.vocabulary.map((q, i) => {
              const id = `v-${i}`;
              return (
                <div key={id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                  <p className="font-bold">{i + 1}. {q.word}</p>
                  <input
                    value={answers[id] || ''}
                    onChange={e => answer(id, e.target.value)}
                    disabled={submitted}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent p-2"
                    placeholder="Bedeutung auf Deutsch"
                  />
                  {solutions && <p className="text-sm text-emerald-600">Erklärung: {q.meaning}</p>}
                  {renderFeedback(id)}
                </div>
              );
            })}
          </section>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={submitAnswers}
              disabled={grading || submitted}
              className="rounded-xl bg-blue-600 px-4 py-2.5 font-bold text-white disabled:opacity-50"
            >
              {grading
                ? 'Antworten werden bewertet…'
                : submitted
                  ? 'Antworten überprüft'
                  : 'Antworten überprüfen'}
            </button>

            <button
              type="button"
              onClick={() => setSolutions(v => !v)}
              className="rounded-xl bg-emerald-600 px-4 py-2.5 font-bold text-white"
            >
              {solutions ? 'Lösungen ausblenden' : 'Lösungen anzeigen'}
            </button>
          </div>

          {result && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-3">
              <h3 className="text-xl font-extrabold">Prüfungsergebnis</h3>

              <p className="text-3xl font-extrabold">
                {result.score} / {result.maxScore}
              </p>

              <p className="text-lg">
                Ergebnis: {result.percentage} %
              </p>

              <p className="text-sm text-slate-500">
                Niveau {exercise.level} · Ergebnis dieser Übung, keine offizielle Prüfungsnote.
                Teilpunkte werden bei der Berechnung berücksichtigt.
              </p>

              <button
                type="button"
                onClick={() => {
                  setAnswers({});
                  setSubmitted(false);
                  setResult(null);
                  setSolutions(false);
                }}
                className="rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-2 font-semibold"
              >
                Erneut üben
              </button>
            </section>
          )}
        </div>
      )}
    </div>
  );
};
