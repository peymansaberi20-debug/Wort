/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { stopSpeaking, getTtsWorkerBase } from '../utils/audio';
import { describeAiError } from '../utils/aiProvider';
import { addErrors } from '../utils/errorBook';
import {
  ARCHIVE_HOEREN, ExamRun, MAX_PLAYS, S, TOPICS_DE, askJson, audioGet, audioPut, hash, loadList, pick, saveList, useNoHelp
} from '../utils/trainerKit';
import { ClickableText, WordLookupModal } from './WordLookup';
import type { Word } from '../types';

type ExamType = 'Standard' | 'Goethe' | 'OESD' | 'Telc' | 'EPD';
type TF = { statement: string; answer: boolean; explanation: string; translation?: string };
type MC = { question: string; options: string[]; answerIndex: number; explanation: string; translation?: string };
type Gap = { sentence: string; answer: string; translation?: string };
type Short = { question: string; answer: string; translation?: string };
type Vocab = { word: string; meaning: string };
type Grade = { correct: boolean; points: number; feedback: string; feedbackFa: string };
type SectionScore = { label: string; earned: number; total: number; percentage: number };
type GradingResult = {
  score: number; maxScore: number; percentage: number; gradeLabel: string; passed: boolean; sections: SectionScore[];
  teacherComment: string; teacherCommentFa: string; strengths: string; recommendations: string; details: Record<string, Grade>;
};
type HistoryAttempt = { date: string; score: number; maxScore: number; percentage: number; gradeLabel: string; passed: boolean };
type Exercise = { title: string; examType: ExamType; level: string; part1TF: TF[]; part2MC: MC[]; part3Gap: Gap[]; part4Short: Short[]; vocabulary: Vocab[] };
type SavedExerciseRecord = {
  id: string; createdAt: string; title: string; examType: ExamType; level: string; transcript: string; exercise: Exercise;
  sentencePairsCache?: { de: string; fa: string }[]; audioUrl?: string; answers: Record<string, string>; submitted: boolean;
  result: GradingResult | null; historyAttempts?: HistoryAttempt[];
};

const DEFAULT_TTS_WORKER = 'https://wort-tts.peymansaberi20.workers.dev';
const ETYPE: Record<string, ExamType> = { Goethe: 'Goethe', 'ÖSD': 'OESD', telc: 'Telc', EPD: 'EPD' };

const EXAM_LABELS: Record<ExamType, string> = {
  Standard: 'Standard / Allgemein', Goethe: 'Goethe-Zertifikat', OESD: 'ÖSD', Telc: 'telc Deutsch', EPD: 'EPD (Uni Wien / VWU)',
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

/** Validates the AI answer; invalid single items are dropped, an exercise with too few items is rejected. */
const exerciseCheck = (examType: ExamType, level: string) => (data: any): Exercise => {
  const tf = S.arr(q => ({ statement: S.req(q?.statement), answer: q?.answer === true || String(q?.answer).toLowerCase() === 'true', explanation: S.str()(q?.explanation), translation: S.str()(q?.translation) }));
  const mc = S.arr(q => {
    const options = S.arr(S.req, 2)(q?.options); const idx = Number(q?.answerIndex);
    if (!(idx >= 0 && idx < options.length)) throw new Error('bad index');
    return { question: S.req(q?.question), options, answerIndex: idx, explanation: S.str()(q?.explanation), translation: S.str()(q?.translation) };
  });
  const gap = S.arr(q => { const sentence = S.req(q?.sentence); if (!/_{2,}/.test(sentence)) throw new Error('no blank'); return { sentence, answer: S.req(q?.answer), translation: S.str()(q?.translation) }; });
  const sh = S.arr(q => ({ question: S.req(q?.question), answer: S.str()(q?.answer), translation: S.str()(q?.translation) }));
  const vo = S.arr(q => ({ word: S.req(q?.word), meaning: S.str()(q?.meaning) }));
  const ex: Exercise = {
    title: S.str()(data?.title) || `Hörverstehen (${EXAM_LABELS[examType]})`, examType, level: S.str()(data?.level) || level,
    part1TF: tf(data?.part1TF), part2MC: mc(data?.part2MC), part3Gap: gap(data?.part3Gap), part4Short: sh(data?.part4Short), vocabulary: vo(data?.vocabulary)
  };
  if (ex.part1TF.length + ex.part2MC.length + ex.part3Gap.length + ex.part4Short.length < 3) throw new Error('too few questions');
  return ex;
};

const gradeCheck = S.obj({
  results: S.arr(S.obj({ id: S.req, points: S.num(0, 1), feedback: S.str(), feedbackFa: S.str() })),
  teacherComment: S.str(), teacherCommentFa: S.str(), strengths: S.str(), recommendations: S.str()
});
const transcriptCheck = (x: any): string => { const t = S.req(x?.transcript); if (t.length < 80) throw new Error('short'); return t; };

function splitForTts(text: string, max = 350): string[] {
  const sentences = text.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]*\s*/g) || [text];
  const chunks: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && (cur + s).length > max) { chunks.push(cur.trim()); cur = ''; }
    cur += s;
  }
  if (cur.trim()) chunks.push(cur.trim());
  const result: string[] = [];
  for (const c of chunks) {
    if (c.length <= max * 1.6) result.push(c);
    else for (let i = 0; i < c.length; i += max) result.push(c.slice(i, i + max));
  }
  return result;
}

/** Cloud TTS for a whole transcript; result is cached (Cache API), so it is never generated twice. */
async function makeAudio(text: string, onProg?: (s: string) => void): Promise<string> {
  const cached = await audioGet(text);
  if (cached) return URL.createObjectURL(cached);
  const base = getTtsWorkerBase() || DEFAULT_TTS_WORKER;
  const chunks = splitForTts(text);
  const blobs: Blob[] = [];
  for (let i = 0; i < chunks.length; i++) {
    onProg?.(`${i + 1} / ${chunks.length}`);
    let res: Response | null = null;
    try { res = await fetch(`${base}/?lang=de&text=${encodeURIComponent(chunks[i])}`); } catch { res = null; }
    if (!res || !res.ok) {
      res = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: chunks[i], lang: 'de' }) });
    }
    if (!res.ok) throw new Error('خطا در ارتباط با سرور صوت.');
    blobs.push(await res.blob());
  }
  const blob = new Blob(blobs, { type: 'audio/mpeg' });
  void audioPut(text, blob);
  return URL.createObjectURL(blob);
}

const WORDS: Record<string, string> = { A1: '80-110', A2: '110-150', B1: '160-220', B2: '220-300', C1: '280-380' };
const genTranscript = (topic: string, lv: string, et: ExamType) =>
  askJson<string>(
    `Write an authentic German listening-comprehension script for ${EXAM_LABELS[et]}, CEFR level ${lv}. Topic: "${topic}". Form: ${lv === 'A1' || lv === 'A2' ? 'a short dialogue between two people' : 'a dialogue, radio report or short lecture'}. About ${WORDS[lv] || '160-220'} words, natural spoken German. Write ONLY the spoken words: no speaker names or labels, no stage directions, no markdown. Return ONLY JSON: {"transcript":"..."}`,
    transcriptCheck, { timeoutMs: 45000 }
  );

export const HoerenTrainer: React.FC<{
  onClose: () => void;
  initialView?: 'menu' | 'creator' | 'archive';
  onQuickAddWord?: (w: Partial<Word>) => boolean;
  exam?: ExamRun;
}> = ({ onClose, initialView = 'menu', onQuickAddWord, exam }) => {
  const [viewMode, setViewMode] = useState<'menu' | 'creator' | 'archive' | 'exercise'>(initialView === 'creator' ? 'creator' : initialView === 'archive' ? 'archive' : 'menu');
  const [savedExercises, setSavedExercises] = useState<SavedExerciseRecord[]>(() => loadList<SavedExerciseRecord>(ARCHIVE_HOEREN));
  const [currentArchiveId, setCurrentArchiveId] = useState<string | null>(null);

  const [transcript, setTranscript] = useState('');
  const [examType, setExamType] = useState<ExamType>(exam ? ETYPE[exam.org] : 'Standard');
  const [level, setLevel] = useState(exam ? exam.level : 'B1');
  const [topic, setTopic] = useState('');
  const [genTextBusy, setGenTextBusy] = useState(false);
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [grading, setGrading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<GradingResult | null>(null);
  const [error, setError] = useState('');
  const [warningMsg, setWarningMsg] = useState('');
  const [buildErr, setBuildErr] = useState('');

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [audioGenProgress, setAudioGenProgress] = useState('');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [plays, setPlays] = useState(0);
  const playsRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [historyAttempts, setHistoryAttempts] = useState<HistoryAttempt[]>([]);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showFa, setShowFa] = useState<Record<string, boolean>>({});
  const [lookup, setLookup] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(-1);
  const [noHelp, setNoHelp] = useNoHelp();
  const limited = !!exam || noHelp;
  const submitRef = useRef<() => void>(() => {});

  useEffect(() => () => { stopSpeaking(); }, []);

  useEffect(() => { playsRef.current = 0; setPlays(0); setIsPlayingAudio(false); }, [audioUrl]);

  // audio of a transcript is cached: reopening an archived exercise brings the voice back
  useEffect(() => {
    if (viewMode === 'exercise' && transcript && !audioUrl) {
      void audioGet(transcript).then(b => { if (b) setAudioUrl(URL.createObjectURL(b)); });
    }
  }, [viewMode, transcript]);

  const stopAllPlayback = () => {
    stopSpeaking();
    audioRef.current?.pause();
    setIsPlayingAudio(false);
  };

  const persistCurrentToArchive = (curEx: Exercise | null, curTr: string, curAns: Record<string, string>, curSub: boolean, curRes: GradingResult | null, curHist: HistoryAttempt[]) => {
    if (!curEx) return;
    const list = [...savedExercises];
    const targetId = currentArchiveId || 'ex_' + Date.now();
    if (!currentArchiveId) setCurrentArchiveId(targetId);
    const idx = list.findIndex(i => i.id === targetId);
    const rec: SavedExerciseRecord = {
      id: targetId,
      createdAt: idx !== -1 ? list[idx].createdAt : new Date().toLocaleDateString('de-AT', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
      title: curEx.title, examType: curEx.examType, level: curEx.level, transcript: curTr, exercise: curEx,
      answers: curAns, submitted: curSub, result: curRes, historyAttempts: curHist
    };
    if (idx !== -1) list[idx] = rec; else list.unshift(rec);
    setSavedExercises(list);
    saveList(ARCHIVE_HOEREN, list);
  };

  const handleBackToMenu = () => {
    stopAllPlayback();
    if (viewMode === 'exercise' && initialView === 'archive') setViewMode('archive');
    else if (initialView === 'menu' && (viewMode === 'creator' || viewMode === 'exercise')) setViewMode('menu');
    else onClose();
  };

  const answer = (id: string, value: string) => {
    if (submitted) return;
    setWarningMsg('');
    setAnswers(prev => ({ ...prev, [id]: value }));
  };

  const allIds = (ex: Exercise) => [
    ...ex.part1TF.map((_, i) => `tf-${i}`), ...ex.part2MC.map((_, i) => `mc-${i}`), ...ex.part3Gap.map((_, i) => `gap-${i}`),
    ...ex.part4Short.map((_, i) => `short-${i}`), ...ex.vocabulary.map((_, i) => `v-${i}`)
  ];

  const handleCheckClick = () => {
    if (!exercise || grading || submitted) return;
    const unanswered = allIds(exercise).filter(id => !(answers[id] || '').trim()).length;
    if (unanswered > 0 && !warningMsg) {
      setWarningMsg(`هنوز ${unanswered} سؤال بدون پاسخ مانده است. برای ثبت نهایی و تصحیح، دوباره روی دکمه کلیک کنید.`);
      return;
    }
    setWarningMsg('');
    void submitAnswers();
  };

  const submitAnswers = async () => {
    if (!exercise || grading || submitted) return;
    setGrading(true); setError(''); setWarningMsg('');
    try {
      const details: Record<string, Grade> = {};
      const pointsById: Record<string, number> = {};
      const errs: { original: string; corrected: string; type: string; why: string; src: string }[] = [];
      const freeQuestions: { id: string; question: string; expected: string; userAnswer: string; category: string }[] = [];

      exercise.part1TF.forEach((q, i) => {
        const id = `tf-${i}`; const given = answers[id]; const correct = given === String(q.answer);
        pointsById[id] = correct ? 1 : 0;
        details[id] = { correct, points: correct ? 1 : 0, feedback: q.explanation || `Richtige Antwort: ${q.answer ? 'Richtig' : 'Falsch'}`, feedbackFa: `پاسخ صحیح: ${q.answer ? 'درست (Richtig)' : 'نادرست (Falsch)'} — ${q.explanation}` };
        if (given && !correct) errs.push({ original: `${q.statement} → ${given === 'true' ? 'Richtig' : 'Falsch'}`, corrected: `${q.statement} → ${q.answer ? 'Richtig' : 'Falsch'}`, type: 'Hören', why: q.explanation, src: 'Hören' });
      });
      exercise.part2MC.forEach((q, i) => {
        const id = `mc-${i}`; const given = answers[id]; const correct = given === String(q.answerIndex);
        const opt = q.options[q.answerIndex] || '';
        pointsById[id] = correct ? 1 : 0;
        details[id] = { correct, points: correct ? 1 : 0, feedback: q.explanation || `Richtige Antwort: ${String.fromCharCode(65 + q.answerIndex)}) ${opt}`, feedbackFa: `پاسخ صحیح: ${String.fromCharCode(65 + q.answerIndex)}) ${opt} — ${q.explanation}` };
        if (given && !correct) errs.push({ original: `${q.question} → ${q.options[Number(given)] || ''}`, corrected: `${q.question} → ${opt}`, type: 'Hören', why: q.explanation, src: 'Hören' });
      });
      const addFree = (id: string, question: string, expected: string, category: string) => freeQuestions.push({ id, question, expected, userAnswer: answers[id] || '', category });
      exercise.part3Gap.forEach((q, i) => addFree(`gap-${i}`, q.sentence, q.answer, 'Lückentext'));
      exercise.part4Short.forEach((q, i) => addFree(`short-${i}`, q.question, q.answer, 'Offene Frage'));
      exercise.vocabulary.forEach((q, i) => addFree(`v-${i}`, q.word, q.meaning, 'Wortschatz'));

      let tc = '', tcFa = '', st = '', rec = '';
      const answeredFree = freeQuestions.filter(q => q.userAnswer.trim());
      if (answeredFree.length > 0) {
        const parsed = await askJson<any>(
          `Du bist ein erfahrener Prüfer für Deutsch als Fremdsprache (${EXAM_LABELS[exercise.examType]}, Niveau ${exercise.level}).
Bewerte die Antworten fair; Erklärungen und Feedback AUCH AUF PERSISCH (فارسی). Vergib pro Aufgabe genau 0, 0.5 oder 1 Punkt. Nicht beantwortete Aufgaben wurden bereits entfernt.
Ausgabe NUR als JSON: {"results":[{"id":"gap-0","points":1,"feedback":"Begründung","feedbackFa":"توضیح فارسی"}],"teacherComment":"...","teacherCommentFa":"...","strengths":"...","recommendations":"..."}
\n\nTRANSKRIPT:\n${transcript}\n\nANTWORTEN:\n${JSON.stringify(answeredFree)}`,
          gradeCheck, { timeoutMs: 60000 }
        );
        const byId = new Map<string, any>(parsed.results.map((r: any) => [r.id, r]));
        freeQuestions.forEach(q => {
          const g = byId.get(q.id);
          const pts = q.userAnswer.trim() && g ? Math.round(g.points * 2) / 2 : 0;
          pointsById[q.id] = pts;
          details[q.id] = { correct: pts === 1, points: pts, feedback: g?.feedback || '', feedbackFa: g?.feedbackFa || '' };
          if (q.userAnswer.trim() && pts < 1) {
            const blank = /_{2,}/.test(q.question);
            errs.push({
              original: blank ? q.question.replace(/_{2,}/, q.userAnswer) : `${q.question} → ${q.userAnswer}`,
              corrected: blank ? q.question.replace(/_{2,}/, q.expected) : `${q.question} → ${q.expected}`,
              type: 'Hören', why: g?.feedbackFa || '', src: 'Hören'
            });
          }
        });
        tc = parsed.teacherComment; tcFa = parsed.teacherCommentFa; st = parsed.strengths; rec = parsed.recommendations;
      } else {
        freeQuestions.forEach(q => { pointsById[q.id] = 0; details[q.id] = { correct: false, points: 0, feedback: '', feedbackFa: '' }; });
      }

      const sections: SectionScore[] = [];
      const calc = (label: string, ids: string[]) => {
        if (!ids.length) return;
        const earned = ids.reduce((s, id) => s + (pointsById[id] ?? 0), 0);
        sections.push({ label, earned, total: ids.length, percentage: Math.round((earned / ids.length) * 100) });
      };
      calc('Richtig / Falsch', exercise.part1TF.map((_, i) => `tf-${i}`));
      calc('Multiple Choice', exercise.part2MC.map((_, i) => `mc-${i}`));
      calc('Lückentext', exercise.part3Gap.map((_, i) => `gap-${i}`));
      calc('Offene Fragen', exercise.part4Short.map((_, i) => `short-${i}`));
      calc('Wortschatz', exercise.vocabulary.map((_, i) => `v-${i}`));

      const ids = allIds(exercise);
      const maxScore = ids.length;
      const score = ids.reduce((s, id) => s + (pointsById[id] ?? 0), 0);   // total is always summed by code
      const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
      const { gradeLabel, passed } = getOfficialGradeInfo(percentage);
      const finalRes: GradingResult = {
        score, maxScore, percentage, gradeLabel, passed, sections,
        teacherComment: tc || 'Gut gemacht.', teacherCommentFa: tcFa || 'عملکرد شما ثبت شد.', strengths: st, recommendations: rec, details
      };
      setResult(finalRes); setSubmitted(true);
      if (errs.length) addErrors(errs);
      const hist = [...historyAttempts, { date: new Date().toLocaleDateString('de-AT'), score, maxScore, percentage, gradeLabel, passed }];
      setHistoryAttempts(hist);
      persistCurrentToArchive(exercise, transcript, answers, true, finalRes, hist);
      exam?.onFinish({ score, max: maxScore, note: tcFa });
    } catch (e: any) {
      setError(describeAiError(e));
    } finally {
      setGrading(false);
    }
  };
  submitRef.current = () => { void submitAnswers(); };

  const generate = async () => {
    if (transcript.trim().length < 80) { setError('متن کامل‌تری وارد کنید (حداقل ۸۰ نویسه).'); return; }
    stopAllPlayback();
    setError(''); setWarningMsg(''); setExercise(null); setAnswers({}); setSubmitted(false); setResult(null);
    setHistoryAttempts([]); setCurrentArchiveId(null); setAudioUrl(null); setShowTranscript(false); setShowFa({});
    setLoading(true);
    try {
      const tr = transcript.trim();
      const ex = await askJson<Exercise>(`${buildPrompt(examType, level)}\n\nTRANSKRIPT:\n${tr}`, exerciseCheck(examType, level), { timeoutMs: 60000, cacheKey: 'hx:' + hash(examType + level + tr) });
      setExercise(ex); setViewMode('exercise');
      persistCurrentToArchive(ex, tr, {}, false, null, []);
    } catch (e: any) { setError(describeAiError(e)); } finally { setLoading(false); }
  };

  const handleGenerateText = async () => {
    if (genTextBusy) return;
    setGenTextBusy(true); setError('');
    try { setTranscript(await genTranscript(topic.trim() || pick(TOPICS_DE), level, examType)); }
    catch (e: any) { setError(describeAiError(e)); } finally { setGenTextBusy(false); }
  };

  const handleGenerateAudio = async () => {
    if (!transcript.trim() || audioUrl || generatingAudio) return;
    stopAllPlayback(); setGeneratingAudio(true); setAudioGenProgress(''); setError('');
    try { setAudioUrl(await makeAudio(transcript, setAudioGenProgress)); }
    catch (e: any) { setError(e?.message || 'ساخت فایل صوتی ناموفق بود.'); }
    finally { setGeneratingAudio(false); setAudioGenProgress(''); }
  };

  // ---- full-exam mode: build everything automatically, then run with the real timer ----
  const autoBuild = async () => {
    if (!exam) return;
    setBuildErr(''); setLoading(true);
    try {
      const et = ETYPE[exam.org];
      const tr = await genTranscript(pick(TOPICS_DE), exam.level, et);
      const ex = await askJson<Exercise>(`${buildPrompt(et, exam.level)}\n\nTRANSKRIPT:\n${tr}`, exerciseCheck(et, exam.level), { timeoutMs: 60000 });
      const url = await makeAudio(tr, setAudioGenProgress);
      setTranscript(tr); setExercise(ex); setAudioUrl(url); setViewMode('exercise'); setSecondsLeft(exam.minutes * 60);
      persistCurrentToArchive(ex, tr, {}, false, null, []);
    } catch (e: any) { setBuildErr(describeAiError(e)); } finally { setLoading(false); }
  };
  useEffect(() => { if (exam) void autoBuild(); }, []);

  useEffect(() => {
    if (!exam || viewMode !== 'exercise' || submitted || secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearInterval(t);
  }, [exam, viewMode, submitted, secondsLeft > 0]);
  useEffect(() => { if (exam && viewMode === 'exercise' && !submitted && secondsLeft === 0) submitRef.current(); }, [secondsLeft]);

  /** Counts a "play" each time the audio starts from the beginning; pause/resume is free. */
  const playsLeft = Math.max(0, MAX_PLAYS - plays);
  const midPlay = !!audioRef.current && !audioRef.current.ended && audioRef.current.currentTime >= 0.3;
  const playLocked = limited && !isPlayingAudio && playsLeft === 0 && !midPlay;
  const togglePlayPauseAudio = () => {
    const a = audioRef.current; if (!a) return;
    if (!a.paused) { a.pause(); setIsPlayingAudio(false); return; }
    const fresh = a.ended || a.currentTime < 0.3;
    if (fresh && limited && playsRef.current >= MAX_PLAYS) return;
    if (fresh) { playsRef.current++; setPlays(playsRef.current); }
    void a.play(); setIsPlayingAudio(true);
  };

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const inp = 'w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-sans outline-none';
  const faBtn = (id: string, t?: string) => (!t || (limited && !submitted)) ? null : (showFa[id]
    ? <p className="text-xs text-slate-400">{t}</p>
    : <button onClick={() => setShowFa(p => ({ ...p, [id]: true }))} className="text-xs font-bold text-[#1f5fbf]">👁 نمایش فارسی</button>);
  const fb = (id: string) => { const d = result?.details?.[id]; return submitted && d ? (
    <div className={`p-2 rounded-xl text-xs space-y-0.5 ${d.correct ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
      <div dir="ltr" className="font-sans">{d.correct ? '✔' : '✘'} {d.feedback}</div><div>{d.feedbackFa}</div>
    </div>) : null; };
  const box = 'bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4';
  const noHelpChip = (
    <button onClick={() => setNoHelp(!noHelp)} className={`px-3 py-1.5 rounded-full text-xs font-bold border ${noHelp ? 'bg-rose-600 text-white border-rose-600' : 'bg-white dark:bg-[#1b2029] border-[#dde1ea] dark:border-[#333b4a]'}`}>
      🚫 حالت بدون کمک {noHelp ? '(روشن)' : ''}
    </button>
  );

  // ---- full-exam: waiting / error screen before the exercise is ready ----
  if (exam && viewMode !== 'exercise') {
    return (
      <div className={box + ' text-center space-y-3'} dir="rtl">
        {buildErr ? (
          <>
            <div className="text-sm text-red-700">{buildErr}</div>
            <button onClick={() => void autoBuild()} className="px-5 py-2.5 rounded-xl bg-[#1f5fbf] text-white text-sm font-bold">تلاش مجدد</button>
          </>
        ) : (
          <>
            <span className="text-4xl animate-bounce block">🎧</span>
            <p className="text-sm font-bold">در حال ساخت متن، سؤال‌ها و فایل صوتی آزمون Hören… {audioGenProgress}</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 text-right max-w-4xl mx-auto pb-10" dir="rtl">
      {viewMode === 'menu' && (
        <div className="space-y-3">
          <div className={box + ' flex items-center justify-between shadow-xs'}>
            <div className="flex items-center gap-3">
              <span className="text-3xl">✨</span>
              <div>
                <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100">ساخت تمرین جدید</h3>
                <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">متن را وارد کن یا بگذار برایت بسازد؛ تمرین شنیداری، سؤال‌ها و فایل صوتی ساخته می‌شود</p>
              </div>
            </div>
            <button onClick={() => setViewMode('creator')} className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-xs">شروع ▶</button>
          </div>
          <div className={box + ' flex items-center justify-between shadow-xs'}>
            <div className="flex items-center gap-3">
              <span className="text-3xl">📁</span>
              <div>
                <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100">تمرینات قبلی (آرشیو)</h3>
                <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">تمرین‌های ذخیره‌شده را دوباره انجام بده</p>
              </div>
            </div>
            <button onClick={() => setViewMode('archive')} className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-xs">مشاهده ▶</button>
          </div>
        </div>
      )}

      {viewMode === 'creator' && (
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-6 shadow-sm space-y-5 text-right">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100">طراحی تمرین جدید شنیداری</h2>
            <button onClick={handleBackToMenu} className="px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">بازگشت</button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold mb-1.5">نوع آزمون / استاندارد:</label>
              <select value={examType} onChange={e => setExamType(e.target.value as ExamType)} className="w-full bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold outline-none">
                {Object.entries(EXAM_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold mb-1.5">سطح زبان:</label>
              <select value={level} onChange={e => setLevel(e.target.value)} className="w-full bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold outline-none">
                {['A1', 'A2', 'B1', 'B2', 'C1'].map(lvl => <option key={lvl} value={lvl}>سطح {lvl}</option>)}
              </select>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 space-y-2">
            <div className="text-xs font-bold">✨ متن ندارید؟ موضوع بدهید تا برایتان بسازد (با سطح بالا):</div>
            <div className="flex gap-2">
              <input dir="ltr" value={topic} onChange={e => setTopic(e.target.value)} placeholder="z. B. Wohnungssuche (خالی = موضوع تصادفی)" className="flex-1 min-w-0 bg-white dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-sans outline-none" />
              <button onClick={() => void handleGenerateText()} disabled={genTextBusy} className="px-4 py-2 rounded-xl bg-[#6b4fd8] text-white text-xs font-bold disabled:opacity-50 whitespace-nowrap">{genTextBusy ? '⏳ …' : 'برایم متن بساز'}</button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold mb-1.5">متن آلمانی (Transcript):</label>
            <textarea rows={8} value={transcript} onChange={e => setTranscript(e.target.value)} placeholder="متن فایل صوتی یا گفتار را اینجا وارد کنید..."
              className="w-full bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-sm font-sans outline-none text-left" dir="ltr" />
          </div>

          <div className="flex items-center justify-between gap-2">{noHelpChip}<span className="text-[11px] text-[#5d6676]">بدون ترجمه، حداکثر ۲ بار پخش، متن تا پایان مخفی</span></div>

          {error && <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs">{error}</div>}

          <button onClick={() => void generate()} disabled={loading}
            className="w-full bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white py-3.5 rounded-xl font-bold text-sm shadow-md disabled:opacity-50">
            {loading ? 'در حال ساخت آزمون و سؤالات...' : 'تولید تمرین و سؤالات هوشمند 🚀'}
          </button>
        </div>
      )}

      {viewMode === 'archive' && (
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-6 shadow-sm space-y-4 text-right">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="font-extrabold text-base">آرشیو تمرینات شنیداری</h2>
            <button onClick={handleBackToMenu} className="px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">بازگشت</button>
          </div>
          <div className="space-y-3">
            {savedExercises.length === 0 ? (
              <div className="py-12 text-center text-sm text-[#5d6676]">هیچ تمرینی در آرشیو ذخیره نشده است.</div>
            ) : savedExercises.map(item => (
              <div key={item.id}
                onClick={() => {
                  setCurrentArchiveId(item.id); setExercise(item.exercise); setTranscript(item.transcript); setAnswers(item.answers || {});
                  setSubmitted(item.submitted || false); setResult(item.result || null); setHistoryAttempts(item.historyAttempts || []);
                  setAudioUrl(null); setShowTranscript(false); setShowFa({}); setViewMode('exercise');
                }}
                className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#141923] flex items-center justify-between cursor-pointer hover:border-[#1f5fbf] transition">
                <div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">{item.title}</h4>
                  <span className="text-xs text-[#5d6676]">تاریخ: {item.createdAt} • سطح: {item.level}</span>
                </div>
                <span className="bg-[#1f5fbf] text-white px-4 py-2 rounded-xl text-xs font-bold">ورود به تمرین ▶</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {viewMode === 'exercise' && exercise && (
        <div className="space-y-6">
          <div className={box + ' flex items-center justify-between gap-2'}>
            <div className="min-w-0">
              <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100">{exercise.title}</h3>
              <span className="text-xs text-[#5d6676]">سطح: {exercise.level} • فرمت: {EXAM_LABELS[exercise.examType]}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {exam && secondsLeft >= 0 && !submitted && (
                <span className="px-3 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-mono font-bold">⏱ {fmt(secondsLeft)}</span>
              )}
              {!exam && <>{!submitted && noHelpChip}<button onClick={handleBackToMenu} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">بازگشت</button></>}
            </div>
          </div>

          <div className={box + ' space-y-3'}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold">🎧 فایل صوتی تمرین:</span>
              {!audioUrl ? (
                <button onClick={() => void handleGenerateAudio()} disabled={generatingAudio} className="px-4 py-2 rounded-xl bg-[#1f5fbf] text-white text-xs font-bold disabled:opacity-50">
                  {generatingAudio ? `در حال ساخت (${audioGenProgress})...` : 'تولید فایل صوتی ابری 🔊'}
                </button>
              ) : (
                <button onClick={togglePlayPauseAudio} disabled={playLocked} className="px-4 py-2 rounded-xl bg-emerald-600 disabled:bg-slate-400 text-white text-xs font-bold">
                  {isPlayingAudio ? 'توقف پخش ⏸' : playLocked ? 'پخش‌ها تمام شد' : 'پخش صوت ▶'}
                </button>
              )}
            </div>
            {limited && audioUrl && <div className="text-[11px] text-[#5d6676]">طبق قانون آزمون فقط {MAX_PLAYS} بار پخش مجاز است — باقی‌مانده: {playsLeft}</div>}
            {audioUrl && <audio ref={audioRef} src={audioUrl} onEnded={() => setIsPlayingAudio(false)} className="hidden" />}
          </div>

          {(!limited || submitted) && (
            <div className={box + ' space-y-2'}>
              <button onClick={() => setShowTranscript(v => !v)} className="text-sm font-bold text-[#1f5fbf]">{showTranscript ? '🙈 مخفی کردن متن' : '📄 نمایش متن شنیداری (Transcript)'}</button>
              {showTranscript && (
                <>
                  <p className="text-[11px] text-[#1f5fbf]">💡 روی هر واژه بزن تا معنی‌اش را ببینی و به واژه‌نامه اضافه کنی.</p>
                  <div className="font-sans text-sm leading-7 text-left" dir="ltr"><ClickableText text={transcript} onWord={setLookup} /></div>
                </>
              )}
            </div>
          )}
          {lookup && <WordLookupModal word={lookup} level={exercise.level} cat="Hören" onQuickAddWord={onQuickAddWord} onClose={() => setLookup(null)} />}

          <div className="bg-white dark:bg-[#1b2029] border rounded-3xl p-6 space-y-6">
            {exercise.part1TF.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-extrabold text-sm text-[#1f5fbf]">بخش ۱: درست یا نادرست (Richtig / Falsch)</h4>
                {exercise.part1TF.map((q, idx) => { const id = `tf-${idx}`; return (
                  <div key={id} className="p-4 rounded-2xl border bg-slate-50 dark:bg-[#141923] space-y-2">
                    <p className="text-base font-extrabold text-left" dir="ltr">{idx + 1}. {q.statement}</p>
                    {faBtn(id, q.translation)}
                    <div className="flex gap-2" dir="ltr">
                      <button onClick={() => answer(id, 'true')} className={`px-4 py-2 rounded-xl text-xs font-bold border ${answers[id] === 'true' ? 'bg-[#1f5fbf] text-white' : 'bg-white dark:bg-slate-800'}`}>Richtig{limited && !submitted ? '' : ' (درست)'}</button>
                      <button onClick={() => answer(id, 'false')} className={`px-4 py-2 rounded-xl text-xs font-bold border ${answers[id] === 'false' ? 'bg-[#1f5fbf] text-white' : 'bg-white dark:bg-slate-800'}`}>Falsch{limited && !submitted ? '' : ' (نادرست)'}</button>
                    </div>
                    {fb(id)}
                  </div>); })}
              </div>
            )}

            {exercise.part2MC.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-extrabold text-sm text-[#1f5fbf]">بخش ۲: چندگزینه‌ای (Multiple Choice)</h4>
                {exercise.part2MC.map((q, idx) => { const id = `mc-${idx}`; return (
                  <div key={id} className="p-4 rounded-2xl border bg-slate-50 dark:bg-[#141923] space-y-2">
                    <p className="text-base font-extrabold text-left" dir="ltr">{idx + 1}. {q.question}</p>
                    {faBtn(id, q.translation)}
                    <div className="space-y-1.5" dir="ltr">
                      {q.options.map((o, oi) => (
                        <button key={oi} onClick={() => answer(id, String(oi))} className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-semibold border ${answers[id] === String(oi) ? 'bg-[#1f5fbf] text-white border-[#1f5fbf]' : 'bg-white dark:bg-slate-800 border-slate-200'}`}>{String.fromCharCode(65 + oi)}) {o}</button>
                      ))}
                    </div>
                    {fb(id)}
                  </div>); })}
              </div>
            )}

            {exercise.part3Gap.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-extrabold text-sm text-[#1f5fbf]">بخش ۳: جای‌خالی (Lückentext)</h4>
                {exercise.part3Gap.map((q, idx) => { const id = `gap-${idx}`; return (
                  <div key={id} className="p-4 rounded-2xl border bg-slate-50 dark:bg-[#141923] space-y-2">
                    <p className="text-base font-extrabold text-left" dir="ltr">{idx + 1}. {q.sentence}</p>
                    {faBtn(id, q.translation)}
                    <input dir="ltr" value={answers[id] || ''} onChange={e => answer(id, e.target.value)} className={inp} />
                    {fb(id)}
                  </div>); })}
              </div>
            )}

            {exercise.part4Short.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-extrabold text-sm text-[#1f5fbf]">بخش ۴: سؤال‌های باز (Offene Fragen)</h4>
                {exercise.part4Short.map((q, idx) => { const id = `short-${idx}`; return (
                  <div key={id} className="p-4 rounded-2xl border bg-slate-50 dark:bg-[#141923] space-y-2">
                    <p className="text-base font-extrabold text-left" dir="ltr">{idx + 1}. {q.question}</p>
                    {faBtn(id, q.translation)}
                    <textarea dir="ltr" rows={2} value={answers[id] || ''} onChange={e => answer(id, e.target.value)} className={inp} />
                    {fb(id)}
                  </div>); })}
              </div>
            )}

            {exercise.vocabulary.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-extrabold text-sm text-[#1f5fbf]">بخش ۵: واژگان (Wortschatz) — معنی/توضیح بنویس</h4>
                {exercise.vocabulary.map((q, idx) => { const id = `v-${idx}`; return (
                  <div key={id} className="p-4 rounded-2xl border bg-slate-50 dark:bg-[#141923] space-y-2">
                    <p className="text-base font-extrabold text-left" dir="ltr">{q.word}</p>
                    <input dir="ltr" value={answers[id] || ''} onChange={e => answer(id, e.target.value)} className={inp} />
                    {fb(id)}
                  </div>); })}
              </div>
            )}

            {warningMsg && <div className="p-3 bg-amber-50 text-amber-800 rounded-xl text-xs font-bold">{warningMsg}</div>}
            {error && <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs">{error}</div>}

            {!submitted ? (
              <button onClick={handleCheckClick} disabled={grading}
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white py-3.5 rounded-xl font-bold text-sm shadow-md disabled:opacity-50">
                {grading ? 'در حال بررسی و تصحیح هوش مصنوعی...' : exam ? 'ثبت پاسخ‌ها و ادامه ✓' : 'ثبت و بررسی پاسخ‌ها (Antworten überprüfen) ✓'}
              </button>
            ) : result && (
              <div className="p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 space-y-3">
                <h4 className="font-extrabold text-base text-emerald-800 dark:text-emerald-300">نتیجه آزمون شما: {result.score} / {result.maxScore} ({result.percentage}%) — {result.gradeLabel}</h4>
                <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                  {result.sections.map(s => <div key={s.label} className="p-2 rounded-xl bg-white/70 dark:bg-slate-800 flex justify-between"><span>{s.label}</span><span dir="ltr">{s.earned}/{s.total}</span></div>)}
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300">{result.teacherCommentFa}</p>
                <p className="text-[11px] text-[#5d6676]">پاسخ‌های اشتباه به «دفتر خطاها» اضافه شد.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
