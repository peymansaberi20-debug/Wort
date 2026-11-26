/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { stopSpeaking, getTtsWorkerBase, speak } from '../utils/audio';
import { describeAiError } from '../utils/aiProvider';
import { addErrors } from '../utils/errorBook';
import {
  ARCHIVE_HOEREN, ExamRun, MAX_PLAYS, S, TOPICS_DE, askJson, audioGet, audioPut, hash, loadList, pick, saveList, useNoHelp
} from '../utils/trainerKit';
import { ClickableWords, WordLookupModal } from './WordLookup';
import { pushAiBank, fetchAiBank, aiBankMarkSeen, aiBankSeenIds, mergeAiBank, omitTop } from '../utils/aiBank';
import { LevelChips, PrintPreview, WriteLines } from './trainerUI';
import { Printer } from 'lucide-react';
import type { Word } from '../types';

type ExamType = 'Standard' | 'Goethe' | 'OESD' | 'Telc' | 'EPD';
type TF = { statement: string; answer: boolean; explanation: string; translation?: string };
type MC = { question: string; options: string[]; answerIndex: number; explanation: string; translation?: string };
type Gap = { sentence: string; answer: string; translation?: string };
type Short = { question: string; answer: string; translation?: string };
type Vocab = { word: string; meaning: string };
type Grade = { correct: boolean; points: number; feedback: string; feedbackFa: string; expected?: string; given?: string };
type SectionScore = { label: string; earned: number; total: number; percentage: number };
type GradingResult = {
  score: number; maxScore: number; percentage: number; gradeLabel: string; passed: boolean; sections: SectionScore[];
  teacherComment: string; teacherCommentFa: string; strengths: string; recommendations: string; details: Record<string, Grade>;
};
type HistoryAttempt = { date: string; score: number; maxScore: number; percentage: number; gradeLabel: string; passed: boolean };
type Exercise = { title: string; examType: ExamType; level: string; part1TF: TF[]; part2MC: MC[]; part3Gap: Gap[]; part4Short: Short[]; vocabulary: Vocab[] };
type TrChunk = { t: string; g: number[] };
type SavedExerciseRecord = {
  id: string; createdAt: string; title: string; examType: ExamType; level: string; transcript: string; exercise: Exercise;
  sentencePairsCache?: { de: string; fa: string }[]; audioUrl?: string; srcAudio?: string; trans?: TrChunk[][]; answers: Record<string, string>; submitted: boolean;
  result: GradingResult | null; historyAttempts?: HistoryAttempt[];
};

/* ── بانک مشترک ابری آزمون‌های شنیداری AI (درخواست: دسترس‌پذیری همه‌جا) ──
 * آزمون‌های ساخته‌شده با AI (متن + سؤال‌ها) به کالکشن عمومی Firestore فرستاده می‌شوند و
 * آزمون‌های بانک که روی این دستگاه نیستند به آرشیو افزوده می‌شوند — با هر ایمیل یا حتی
 * بدون ورود. پاسخ‌ها/نتیجه/تاریخچهٔ خود کاربر فقط محلی می‌مانند و به بانک نمی‌روند. */
const BANK_SKILL = 'hoeren';
const toBank = (r: SavedExerciseRecord): SavedExerciseRecord =>
  omitTop(r as any, ['answers', 'submitted', 'result', 'historyAttempts', 'audioUrl']) as SavedExerciseRecord;

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

/** Persian translation check: {"paragraphs":[{"chunks":[{"t":"...","g":[0,1]}]}]} */
const trCheck = (n: number) => (data: any): TrChunk[][] => {
  const arr = Array.isArray(data) ? data : data?.paragraphs;
  if (!Array.isArray(arr) || arr.length < 1) throw new Error('bad translation');
  return Array.from({ length: n }, (_, i) => {
    const p = arr[i]; const cs = Array.isArray(p) ? p : p?.chunks;
    if (!Array.isArray(cs)) return [];
    return cs
      .map((c: any) => ({ t: String(c?.t ?? '').trim(), g: Array.isArray(c?.g) ? c.g.map(Number).filter((x: number) => Number.isInteger(x)) : [] }))
      .filter((c: TrChunk) => c.t);
  });
};

/** Transcript -> paragraphs (by line break; long blocks are cut every 3 sentences) -> word tokens. */
function buildParas(text: string): string[][] {
  const out: string[][] = [];
  for (const block of text.split(/\n+/)) {
    const sents = block.replace(/[ \t]+/g, ' ').trim().match(/[^.!?]+[.!?]*\s*/g) || [];
    for (let i = 0; i < sents.length; i += 3) {
      const toks = sents.slice(i, i + 3).join(' ').trim().split(/\s+/).filter(Boolean);
      if (toks.length) out.push(toks);
    }
  }
  return out;
}
const cleanWord = (t: string) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
const nz = (s: string) => s.toLowerCase().replace(/ß/g, 'ss').replace(/[.,;:!?"'„“”()]/g, '').replace(/\s+/g, ' ').trim();

/** Chunks of max ~180 characters (cloud TTS workers usually limit the text length). */
function splitForTts(text: string, max = 180): string[] {
  const sents = text.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]*\s*/g) || [text];
  const out: string[] = [];
  let cur = '';
  const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
  for (const s0 of sents) {
    const parts: string[] = [];
    if (s0.length <= max) parts.push(s0.trim());
    else {
      let w = '';
      for (const word of s0.trim().split(' ')) {
        if (w && (w + ' ' + word).length > max) { parts.push(w); w = word; } else w = w ? w + ' ' + word : word;
      }
      if (w) parts.push(w);
    }
    for (const p of parts) {
      if (cur && (cur + ' ' + p).length > max) push();
      cur = cur ? cur + ' ' + p : p;
    }
  }
  push();
  return out;
}

async function fetchChunk(base: string, text: string): Promise<Blob> {
  let lastErr = '';
  for (let a = 0; a < 3; a++) {
    for (const mode of ['get', 'post'] as const) {
      try {
        const res = mode === 'get'
          ? await fetch(`${base}/?lang=de&text=${encodeURIComponent(text)}`)
          : await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, lang: 'de' }) });
        if (!res.ok) { lastErr = 'HTTP ' + res.status; continue; }
        const b = await res.blob();
        if (b.size < 800) { lastErr = 'پاسخ خالی'; continue; }
        if (/json|text|html/i.test(b.type)) { lastErr = 'پاسخ صوتی نبود'; continue; }
        return b.type.startsWith('audio') ? b : new Blob([b], { type: 'audio/mpeg' });
      } catch { lastErr = 'اتصال'; }
    }
    await new Promise(r => setTimeout(r, 700));
  }
  throw new Error(`ساخت صدا ناموفق بود (${lastErr}). آدرس Worker را در تنظیمات بررسی کن، یا «پخش با صدای مرورگر» را بزن.`);
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
    blobs.push(await fetchChunk(base, chunks[i]));
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
  /** کل کتابخانه — گیتِ تکراری/Partizip II/مترادف */
  words?: Word[];
  onViewWord?: (w: Word) => void;
  exam?: ExamRun;
}> = ({ onClose, initialView = 'menu', onQuickAddWord, words, onViewWord, exam }) => {
  const [viewMode, setViewMode] = useState<'menu' | 'creator' | 'archive' | 'exercise'>(initialView === 'creator' ? 'creator' : initialView === 'archive' ? 'archive' : 'menu');
  const [savedExercises, setSavedExercises] = useState<SavedExerciseRecord[]>(() => loadList<SavedExerciseRecord>(ARCHIVE_HOEREN));
  const archiveId = useRef<string | null>(null);

  // همگام‌سازی آرشیو با بانک مشترک ابری — یک‌بار هنگام مونت؛ بی‌صدا در خطا
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const seen = aiBankSeenIds(BANK_SKILL);
        const cloud = await fetchAiBank<SavedExerciseRecord>(BANK_SKILL);
        if (!alive) return;
        aiBankMarkSeen(BANK_SKILL, cloud.map((c) => c.id));
        setSavedExercises((prev) => {
          const merged = mergeAiBank(prev, cloud, seen);
          if (merged !== prev && merged.length > prev.length) { saveList(ARCHIVE_HOEREN, merged); return merged; }
          return prev;
        });
        const have = new Set(cloud.map((c) => c.id));
        loadList<SavedExerciseRecord>(ARCHIVE_HOEREN).filter((x) => x?.id && !have.has(x.id)).slice(0, 20)
          .forEach((x) => pushAiBank(BANK_SKILL, x.id, toBank(x), { level: x.level, kind: x.examType, title: x.title }));
      } catch { /* بی‌صدا */ }
    })();
    return () => { alive = false; };
  }, []);

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
  const [srcAudio, setSrcAudio] = useState('');      // saved original mp3 link (permanent per exercise)
  const [srcInput, setSrcInput] = useState('');
  const srcRef = useRef('');
  srcRef.current = srcAudio;
  const playUrl = srcAudio || audioUrl;
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [audioGenProgress, setAudioGenProgress] = useState('');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [browserPlaying, setBrowserPlaying] = useState(false);
  const [plays, setPlays] = useState(0);
  const playsRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bTok = useRef(0);
  const [rate, setRate] = useState(1);
  const [curT, setCurT] = useState(0);
  const [dur, setDur] = useState(0);

  const [historyAttempts, setHistoryAttempts] = useState<HistoryAttempt[]>([]);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showTr, setShowTr] = useState(false);
  const [trans, setTrans] = useState<TrChunk[][] | null>(null);
  const [trBusy, setTrBusy] = useState(false);
  const [trErr, setTrErr] = useState('');
  const [hov, setHov] = useState<{ p: number; kind: 'd' | 'f'; i: number } | null>(null);
  const [showFa, setShowFa] = useState<Record<string, boolean>>({});
  const [lookup, setLookup] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(-1);
  const [noHelp, setNoHelp] = useNoHelp();
  const limited = !!exam || noHelp;
  const submitRef = useRef<() => void>(() => {});
  const paras = useMemo(() => buildParas(transcript), [transcript]);

  // Print: unified A4 preview from trainerUI (questions → Lösungen → Transkript → report).
  // window.print() runs synchronously inside the click gesture — works in iOS Safari too.
  const [printOpen, setPrintOpen] = useState(false);
  /** exercise targeted for printing — null = the currently open one (used for printing straight from the archive) */
  const [printTarget, setPrintTarget] = useState<SavedExerciseRecord | null>(null);

  useEffect(() => () => { stopSpeaking(); }, []);

  useEffect(() => { playsRef.current = 0; setPlays(0); setIsPlayingAudio(false); setCurT(0); setDur(0); }, [playUrl]);

  // audio of a transcript is cached: reopening an archived exercise brings the voice back
  useEffect(() => {
    if (viewMode === 'exercise' && transcript && !audioUrl) {
      void audioGet(transcript).then(b => { if (b) setAudioUrl(URL.createObjectURL(b)); });
    }
  }, [viewMode, transcript]);

  const stopAllPlayback = () => {
    bTok.current++; setBrowserPlaying(false);
    stopSpeaking();
    audioRef.current?.pause();
    setIsPlayingAudio(false);
  };

  /** Writes a partial change into one archive record (keeps everything else). */
  const patchRecord = (id: string | null, patch: Partial<SavedExerciseRecord>) => {
    if (!id) return;
    setSavedExercises(prev => {
      const list = prev.map(r => r.id === id ? { ...r, ...patch } : r);
      saveList(ARCHIVE_HOEREN, list);
      return list;
    });
  };

  const persistCurrentToArchive = (curEx: Exercise | null, curTr: string, curAns: Record<string, string>, curSub: boolean, curRes: GradingResult | null, curHist: HistoryAttempt[]) => {
    if (!curEx) return;
    const id = archiveId.current || (archiveId.current = 'ex_' + Date.now());
    setSavedExercises(prev => {
      const idx = prev.findIndex(i => i.id === id);
      const old = idx !== -1 ? prev[idx] : undefined;
      const rec: SavedExerciseRecord = {
        ...(old || {}),
        id,
        createdAt: old?.createdAt || new Date().toLocaleDateString('de-AT', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
        title: curEx.title, examType: curEx.examType, level: curEx.level, transcript: curTr, exercise: curEx,
        srcAudio: old ? old.srcAudio : (srcRef.current || undefined),
        answers: curAns, submitted: curSub, result: curRes, historyAttempts: curHist
      };
      const list = old ? prev.map(r => r.id === id ? rec : r) : [rec, ...prev];
      saveList(ARCHIVE_HOEREN, list);
      return list;
    });
  };

  /** ☁️ ارسال نسخهٔ تمیزِ آزمونِ تازه به بانک مشترک (بدون پاسخ/نتیجهٔ کاربر) —
   *  فقط یک‌بار بلافاصله بعد از ساخته‌شدن آزمون صدا زده می‌شود. */
  const pushCurrentToBank = (curEx: Exercise, curTr: string) => {
    if (!archiveId.current) return;
    const rec: SavedExerciseRecord = {
      id: archiveId.current,
      createdAt: new Date().toLocaleDateString('de-AT', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
      title: curEx.title, examType: curEx.examType, level: curEx.level, transcript: curTr, exercise: curEx,
      answers: {}, submitted: false, result: null,
      ...(srcRef.current ? { srcAudio: srcRef.current } : {})
    };
    pushAiBank(BANK_SKILL, rec.id, toBank(rec), { level: curEx.level, kind: curEx.examType, title: curEx.title });
  };

  const handleBackToMenu = () => {
    stopAllPlayback();
    if (viewMode === 'exercise' && initialView === 'archive') setViewMode('archive');
    else if (initialView === 'menu' && (viewMode === 'creator' || viewMode === 'exercise')) setViewMode('menu');
    else onClose();
  };

  /** باز کردن تمرین ذخیره‌شده از آرشیو — هر بار شروعِ تازه و خالی (نتایج قبلی فقط در تاریخچه می‌مانند) */
  const openArchivedFresh = (item: SavedExerciseRecord) => {
    stopAllPlayback();
    archiveId.current = item.id; setExercise(item.exercise); setTranscript(item.transcript);
    setAnswers({}); setSubmitted(false); setResult(null); setError(''); setWarningMsg('');
    setHistoryAttempts(item.historyAttempts || []);
    setSrcAudio(item.srcAudio || ''); setSrcInput(item.srcAudio || ''); srcRef.current = item.srcAudio || '';
    setTrans(item.trans || null); setShowTr(false); setTrErr('');
    playsRef.current = 0; setPlays(0);
    setAudioUrl(null); setShowTranscript(false); setShowFa({}); setViewMode('exercise');
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
      const free: { id: string; question: string; expected: string; userAnswer: string; category: string }[] = [];

      exercise.part1TF.forEach((q, i) => {
        const id = `tf-${i}`; const given = answers[id]; const correct = given === String(q.answer);
        pointsById[id] = correct ? 1 : 0;
        details[id] = {
          correct, points: correct ? 1 : 0, feedback: q.explanation || '', feedbackFa: '',
          expected: q.answer ? 'Richtig (درست)' : 'Falsch (نادرست)', given: given ? (given === 'true' ? 'Richtig' : 'Falsch') : ''
        };
        if (given && !correct) errs.push({ original: `${q.statement} → ${given === 'true' ? 'Richtig' : 'Falsch'}`, corrected: `${q.statement} → ${q.answer ? 'Richtig' : 'Falsch'}`, type: 'Hören', why: q.explanation, src: 'Hören' });
      });
      exercise.part2MC.forEach((q, i) => {
        const id = `mc-${i}`; const given = answers[id]; const correct = given === String(q.answerIndex);
        const opt = q.options[q.answerIndex] || '';
        pointsById[id] = correct ? 1 : 0;
        details[id] = {
          correct, points: correct ? 1 : 0, feedback: q.explanation || '', feedbackFa: '',
          expected: `${String.fromCharCode(65 + q.answerIndex)}) ${opt}`,
          given: given !== undefined && given !== '' ? `${String.fromCharCode(65 + Number(given))}) ${q.options[Number(given)] || ''}` : ''
        };
        if (given && !correct) errs.push({ original: `${q.question} → ${q.options[Number(given)] || ''}`, corrected: `${q.question} → ${opt}`, type: 'Hören', why: q.explanation, src: 'Hören' });
      });
      const addFree = (id: string, question: string, expected: string, category: string) => free.push({ id, question, expected, userAnswer: answers[id] || '', category });
      exercise.part3Gap.forEach((q, i) => addFree(`gap-${i}`, q.sentence, q.answer, 'Lückentext'));
      exercise.part4Short.forEach((q, i) => addFree(`short-${i}`, q.question, q.answer, 'Offene Frage'));
      exercise.vocabulary.forEach((q, i) => addFree(`v-${i}`, q.word, q.meaning, 'Wortschatz'));

      // 1) unanswered -> 0 points; 2) gap answers identical to the solution are graded locally (no AI call needed)
      const toAi: typeof free = [];
      free.forEach(q => {
        const base = { expected: q.expected, given: q.userAnswer };
        if (!q.userAnswer.trim()) {
          pointsById[q.id] = 0; details[q.id] = { correct: false, points: 0, feedback: '', feedbackFa: '', ...base };
        } else if (q.category === 'Lückentext' && nz(q.userAnswer) === nz(q.expected)) {
          pointsById[q.id] = 1; details[q.id] = { correct: true, points: 1, feedback: 'Richtig ✔', feedbackFa: '', ...base };
        } else toAi.push(q);
      });

      let tc = '', tcFa = '', st = '', rec = '';
      if (toAi.length > 0) {
        const parsed = await askJson<any>(
          `Du bist ein erfahrener Prüfer für Deutsch als Fremdsprache (${EXAM_LABELS[exercise.examType]}, Niveau ${exercise.level}).
Bewerte die Antworten fair und nach dem Sinn (kleine Tippfehler oder gleichwertige Formulierungen nicht hart bestrafen); Erklärungen und Feedback AUCH AUF PERSISCH (فارسی). Vergib pro Aufgabe genau 0, 0.5 oder 1 Punkt. Nenne in "feedbackFa" kurz, was falsch/fehlend war und was die richtige Lösung ist. Nicht beantwortete Aufgaben wurden bereits entfernt.
Ausgabe NUR als JSON: {"results":[{"id":"gap-0","points":1,"feedback":"Begründung","feedbackFa":"توضیح فارسی"}],"teacherComment":"...","teacherCommentFa":"...","strengths":"... (فارسی)","recommendations":"... (فارسی)"}
\n\nTRANSKRIPT:\n${transcript}\n\nANTWORTEN:\n${JSON.stringify(toAi)}`,
          gradeCheck, { timeoutMs: 60000 }
        );
        const byId = new Map<string, any>(parsed.results.map((r: any) => [r.id, r]));
        toAi.forEach(q => {
          const g = byId.get(q.id);
          const p = g ? Math.round(g.points * 2) / 2 : 0;
          pointsById[q.id] = p;
          details[q.id] = { correct: p === 1, points: p, feedback: g?.feedback || '', feedbackFa: g?.feedbackFa || '', expected: q.expected, given: q.userAnswer };
          if (p < 1) {
            const blank = /_{2,}/.test(q.question);
            errs.push({
              original: blank ? q.question.replace(/_{2,}/, q.userAnswer) : `${q.question} → ${q.userAnswer}`,
              corrected: blank ? q.question.replace(/_{2,}/, q.expected) : `${q.question} → ${q.expected}`,
              type: 'Hören', why: g?.feedbackFa || '', src: 'Hören'
            });
          }
        });
        tc = parsed.teacherComment; tcFa = parsed.teacherCommentFa; st = parsed.strengths; rec = parsed.recommendations;
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
        teacherComment: tc || (passed ? 'Gut gemacht.' : 'Weiter üben.'),
        teacherCommentFa: tcFa || (passed ? 'عملکرد خوبی داشتید.' : 'نیاز به تمرین بیشتر دارید؛ بخش‌های ضعیف‌تر را دوباره گوش کنید.'),
        strengths: st, recommendations: rec, details
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

  /** Fresh, empty attempt of the same exercise (answers/result cleared, attempt history kept). */
  const resetAttempt = () => {
    stopAllPlayback();
    setAnswers({}); setSubmitted(false); setResult(null); setError(''); setWarningMsg(''); setShowFa({});
    playsRef.current = 0; setPlays(0);
    persistCurrentToArchive(exercise, transcript, {}, false, null, historyAttempts);
  };

  const generate = async () => {
    if (transcript.trim().length < 80) { setError('متن کامل‌تری وارد کنید (حداقل ۸۰ نویسه).'); return; }
    stopAllPlayback();
    const su = srcInput.trim();
    if (su && !/^https?:\/\//i.test(su)) { setError('لینک mp3 باید با http:// یا https:// شروع شود.'); return; }
    setError(''); setWarningMsg(''); setExercise(null); setAnswers({}); setSubmitted(false); setResult(null);
    setHistoryAttempts([]); archiveId.current = null; setAudioUrl(null); setSrcAudio(su); srcRef.current = su;
    setShowTranscript(false); setShowTr(false); setTrans(null); setTrErr(''); setShowFa({});
    setLoading(true);
    try {
      const tr = transcript.trim();
      const ex = await askJson<Exercise>(`${buildPrompt(examType, level)}\n\nTRANSKRIPT:\n${tr}`, exerciseCheck(examType, level), { timeoutMs: 60000, cacheKey: 'hx:' + hash(examType + level + tr) });
      setExercise(ex); setViewMode('exercise');
      persistCurrentToArchive(ex, tr, {}, false, null, []);
      pushCurrentToBank(ex, tr);
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

  /** Saves (or removes) the original mp3 link permanently for this exercise. */
  const saveSrcAudio = (remove = false) => {
    const v = remove ? '' : srcInput.trim();
    if (v && !/^https?:\/\//i.test(v)) { setError('لینک mp3 باید با http:// یا https:// شروع شود.'); return; }
    setError(''); stopAllPlayback();
    setSrcAudio(v); srcRef.current = v; if (remove) setSrcInput('');
    patchRecord(archiveId.current, { srcAudio: v || undefined });
  };

  // ---- Persian translation under each paragraph (cached in the archive record) ----
  const loadTranslation = async () => {
    if (trans || trBusy || !paras.length) return;
    setTrBusy(true); setTrErr('');
    try {
      const numbered = paras.map((t, i) => `[${i}] ` + t.map((w, j) => `${j}:${w}`).join(' ')).join('\n');
      const res = await askJson<TrChunk[][]>(
        `Translate this German listening text into natural Persian, paragraph by paragraph. Each paragraph is given as numbered German tokens ("index:word").
For each paragraph return the Persian translation split into short chunks IN PERSIAN READING ORDER. Each chunk has "t" (the Persian words) and "g" (array of the German token indexes that this chunk translates). Every German token index must appear in at least one chunk; the chunks together must form a complete, fluent Persian translation.
Return ONLY JSON: {"paragraphs":[{"chunks":[{"t":"...","g":[0,1]}]}]} with exactly ${paras.length} paragraphs in the same order.

PARAGRAPHS:
${numbered}`,
        trCheck(paras.length), { timeoutMs: 60000, cacheKey: 'htr:' + hash(transcript) }
      );
      setTrans(res); patchRecord(archiveId.current, { trans: res });
    } catch (e: any) { setTrErr(describeAiError(e)); } finally { setTrBusy(false); }
  };
  const toggleTr = () => {
    const nv = !showTr; setShowTr(nv); setHov(null);
    if (nv) void loadTranslation();
  };

  // hover sync: German word <-> Persian chunk
  const actD = (pi: number, i: number) => !!hov && hov.p === pi && (hov.kind === 'd' ? hov.i === i : !!trans?.[pi]?.[hov.i]?.g.includes(i));
  const actF = (pi: number, ci: number) => !!hov && hov.p === pi && (hov.kind === 'f' ? hov.i === ci : !!trans?.[pi]?.[ci]?.g.includes(hov.i));

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
      pushCurrentToBank(ex, tr);
    } catch (e: any) { setBuildErr(e?.message && !/^AI_/.test(e.message) ? e.message : describeAiError(e)); } finally { setLoading(false); }
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
    stopSpeaking(); bTok.current++; setBrowserPlaying(false);
    a.playbackRate = limited ? 1 : rate;
    a.play().then(() => setIsPlayingAudio(true)).catch(() => setIsPlayingAudio(false));
  };
  const skip = (d: number) => { const a = audioRef.current; if (!a || !dur) return; a.currentTime = Math.max(0, Math.min(dur, a.currentTime + d)); setCurT(a.currentTime); };
  const changeRate = (r: number) => { setRate(r); if (audioRef.current) audioRef.current.playbackRate = r; };

  /** Browser voice: no generation needed; plays the transcript sentence by sentence. */
  const browserLocked = limited && !browserPlaying && playsRef.current >= MAX_PLAYS;
  const playBrowser = () => {
    if (browserPlaying) { stopAllPlayback(); return; }
    if (!transcript.trim() || browserLocked) return;
    stopAllPlayback();
    if (limited) { playsRef.current++; setPlays(playsRef.current); }
    const tok = ++bTok.current; setBrowserPlaying(true);
    const chunks = splitForTts(transcript, 220);
    const next = (i: number) => {
      if (bTok.current !== tok) return;
      if (i >= chunks.length) { setBrowserPlaying(false); return; }
      void speak(chunks[i], {
        forceBrowser: true, rate: 0.9,
        onEnd: () => next(i + 1),
        onErr: () => { if (bTok.current === tok) { setBrowserPlaying(false); setError('پخش با صدای مرورگر ناموفق بود.'); } }
      });
    };
    next(0);
  };

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const inp = 'w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-sans outline-none';
  const faBtn = (id: string, t?: string) => (!t || (limited && !submitted)) ? null : (showFa[id]
    ? <p className="text-xs text-slate-400">{t}</p>
    : <button onClick={() => setShowFa(p => ({ ...p, [id]: true }))} className="text-xs font-bold text-[#1f5fbf]">👁 نمایش فارسی</button>);
  const fb = (id: string) => {
    const d = result?.details?.[id];
    if (!submitted || !d) return null;
    const tone = d.points === 1 ? 'bg-emerald-50 text-emerald-800' : d.points > 0 ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-700';
    const tap = (t: string) => { const w = cleanWord(t); if (w) setLookup(w); };
    return (
      <div className={`p-2.5 rounded-xl text-xs space-y-1 ${tone}`}>
        <div className="font-bold">{d.points === 1 ? '✔' : d.points > 0 ? '◐' : '✘'} امتیاز: {d.points} / 1</div>
        {d.given !== undefined && <div>پاسخ شما: <span dir="ltr" className="font-sans font-bold">{d.given || '— (بدون پاسخ)'}</span></div>}
        {d.points < 1 && d.expected && <div>پاسخ صحیح: <span dir="ltr" className="font-sans font-bold cursor-pointer rounded px-0.5 hover:bg-amber-200/80 dark:hover:bg-amber-700/50 transition" onClick={() => tap(d.expected!)}>{d.expected}</span></div>}
        {d.feedback && <div dir="ltr" className="font-sans text-left"><ClickableWords text={d.feedback} onWord={tap} /></div>}
        {d.feedbackFa && <div>{d.feedbackFa}</div>}
      </div>
    );
  };
  const optCls = (sel: boolean, right: boolean) => submitted
    ? (right ? 'bg-emerald-600 text-white border-emerald-600' : sel ? 'bg-red-600 text-white border-red-600' : 'bg-white dark:bg-slate-800 border-slate-200 opacity-70')
    : (sel ? 'bg-[#1f5fbf] text-white border-[#1f5fbf]' : 'bg-white dark:bg-slate-800 border-slate-200');
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
          <div className="flex justify-end">
            <button onClick={onClose} aria-label="خروج از تمرین" title="خروج از تمرین" className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-base font-bold flex items-center justify-center flex-shrink-0 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40">✕</button>
          </div>
          <div className={box + ' flex items-center justify-between shadow-xs'}>
            <div className="flex items-center gap-3">
              <span className="text-3xl">✨</span>
              <div>
                <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100">ساخت تمرین جدید</h3>
                <p className="text-[13px] text-[#5d6676] dark:text-[#a3adbd]">متن را وارد کن یا بگذار برایت بسازد؛ تمرین شنیداری، سؤال‌ها و فایل صوتی ساخته می‌شود</p>
              </div>
            </div>
            <button onClick={() => setViewMode('creator')} className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-xs">شروع ▶</button>
          </div>
          <div className={box + ' flex items-center justify-between shadow-xs'}>
            <div className="flex items-center gap-3">
              <span className="text-3xl">🗂</span>
              <div>
                <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100">تمرین‌های ذخیره‌شده</h3>
                <p className="text-[13px] text-[#5d6676] dark:text-[#a3adbd]">تمرین‌های ذخیره‌شده را دوباره انجام بده</p>
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
              <label className="block text-[13px] font-bold mb-1.5">سطح زبان:</label>
              <LevelChips value={level} onChange={l => setLevel(l)} levels={['A1', 'A2', 'B1', 'B2', 'C1']} />
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

          <div>
            <label className="block text-xs font-bold mb-1.5">🔗 لینک mp3 صدای اصلی (اختیاری — برای همیشه روی همین تمرین ذخیره می‌شود):</label>
            <input dir="ltr" value={srcInput} onChange={e => setSrcInput(e.target.value)} placeholder="https://example.com/audio.mp3" className="w-full bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-sans outline-none" />
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
            <h2 className="font-extrabold text-base">🗂 تمرین‌های ذخیره‌شده</h2>
            <button onClick={handleBackToMenu} className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-[13px] font-bold">بازگشت</button>
          </div>
          <div className="space-y-3">
            {savedExercises.length === 0 ? (
              <div className="py-12 text-center text-sm text-[#5d6676]">هیچ تمرینی ذخیره نشده است.</div>
            ) : savedExercises.map(item => {
              const last = item.historyAttempts?.[item.historyAttempts.length - 1];
              return (
                <div key={item.id}
                  onClick={() => openArchivedFresh(item)}
                  title="آزمون جدید — تمرین بدون پاسخ و آمادهٔ آزمون دادن"
                  className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#141923] flex items-center justify-between cursor-pointer hover:border-[#1f5fbf] transition">
                  <div>
                    <h4 className="font-bold text-[15px] text-slate-900 dark:text-slate-100">{item.title}</h4>
                    <span className="text-[13px] text-[#5d6676]">تاریخ: {item.createdAt} • سطح: {item.level}{item.srcAudio ? ' • 🔗 صدای اصلی' : ''}{last ? ` • آخرین نتیجه: ${last.percentage}%` : ''}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); setPrintTarget(item); setPrintOpen(true); }}
                      title="برگهٔ A4 این تمرین ذخیره‌شده — سؤال‌ها، پاسخنامه و Transkript"
                      aria-label="برگهٔ A4"
                      className="w-9 h-9 rounded-lg bg-[#1f5fbf] text-white flex items-center justify-center flex-shrink-0 hover:bg-[#194ea0] transition"
                    >
                      <Printer size={15} />
                    </button>
                    <span className="bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap">آزمون جدید ▶</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {viewMode === 'exercise' && exercise && (
        <div className="space-y-6">
          <div className={box + ' space-y-2'}>
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0 flex-1">
                <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100 break-words">{exercise.title}</h3>
                <span className="text-xs text-[#5d6676]">سطح: {exercise.level} • فرمت: {EXAM_LABELS[exercise.examType]}</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                {exam && secondsLeft >= 0 && !submitted && (
                  <span className="px-3 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-mono font-bold whitespace-nowrap">⏱ {fmt(secondsLeft)}</span>
                )}
                {!exam && <button onClick={handleBackToMenu} aria-label="بازگشت" className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-sm font-bold">✕</button>}
              </div>
            </div>
          </div>

          <div className={box + ' space-y-3'}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-sm font-bold">🎧 فایل صوتی تمرین:</span>
              <div className="flex items-center gap-2 flex-wrap">
                {!playUrl ? (
                  <button onClick={() => void handleGenerateAudio()} disabled={generatingAudio} className="px-4 py-2 rounded-xl bg-[#1f5fbf] text-white text-xs font-bold disabled:opacity-50">
                    {generatingAudio ? `در حال ساخت (${audioGenProgress})...` : 'تولید فایل صوتی ابری 🔊'}
                  </button>
                ) : (
                  <button onClick={togglePlayPauseAudio} disabled={playLocked} className="px-4 py-2 rounded-xl bg-emerald-600 disabled:bg-slate-400 text-white text-xs font-bold">
                    {isPlayingAudio ? 'توقف پخش ⏸' : playLocked ? 'پخش‌ها تمام شد' : (srcAudio ? 'پخش صدای اصلی ▶' : 'پخش صوت ▶')}
                  </button>
                )}
                <button onClick={playBrowser} disabled={browserLocked} className="px-4 py-2 rounded-xl bg-indigo-600 disabled:bg-slate-400 text-white text-xs font-bold">
                  {browserPlaying ? 'توقف صدای مرورگر ⏹' : browserLocked ? 'پخش‌ها تمام شد' : '🔈 پخش با صدای مرورگر'}
                </button>
              </div>
            </div>

            {playUrl && !limited && (
              <div className="flex items-center gap-2" dir="ltr">
                <button onClick={() => skip(-10)} className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-bold">⏪ 10</button>
                <span className="font-mono text-[11px] w-10 text-center">{fmt(Math.floor(curT))}</span>
                <input type="range" className="flex-1 min-w-0" min={0} max={dur || 0} step={0.1} value={Math.min(curT, dur || 0)} disabled={!dur}
                  onChange={e => { const v = Number(e.target.value); if (audioRef.current) audioRef.current.currentTime = v; setCurT(v); }} />
                <span className="font-mono text-[11px] w-10 text-center">{dur ? fmt(Math.floor(dur)) : '--:--'}</span>
                <button onClick={() => skip(10)} className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-bold">10 ⏩</button>
                <input key={rate} type="number" inputMode="decimal" step="0.01" min="0.25" max="3" defaultValue={rate}
                  onBlur={e => { const v = Number(String(e.target.value).replace(',', '.')); changeRate(v >= 0.25 && v <= 3 ? Math.round(v * 100) / 100 : 1); }}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  title="سرعت (مثلاً 0.9 یا 1.03)"
                  className="w-14 bg-slate-100 dark:bg-slate-800 rounded-lg px-1.5 py-1 text-[11px] font-bold text-center outline-none" />
              </div>
            )}
            {limited && (playUrl || transcript) && <div className="text-[11px] text-[#5d6676]">طبق قانون آزمون فقط {MAX_PLAYS} بار پخش مجاز است — باقی‌مانده: {playsLeft}</div>}

            {!exam && (
              <div className="space-y-1">
                <div className="flex gap-2" dir="ltr">
                  <input value={srcInput} onChange={e => setSrcInput(e.target.value)} placeholder="🔗 https://example.com/audio.mp3" className="flex-1 min-w-0 bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-sans outline-none" />
                  <button onClick={() => saveSrcAudio()} className="px-3 py-2 rounded-xl bg-[#1f5fbf] text-white text-xs font-bold whitespace-nowrap">ذخیره لینک</button>
                  {srcAudio && <button onClick={() => saveSrcAudio(true)} className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">حذف</button>}
                </div>
                <p className="text-[11px] text-[#5d6676]">{srcAudio ? '✔ صدای اصلی روی این تمرین ذخیره است و همیشه پخش می‌شود.' : 'لینک مستقیم فایل mp3 را بگذار تا به‌جای صدای ساخته‌شده، صدای اصلی روی همین تمرین ذخیره شود.'}</p>
              </div>
            )}

            {playUrl && (
              <audio ref={audioRef} src={playUrl} preload="metadata" className="hidden"
                onEnded={() => setIsPlayingAudio(false)} onPause={() => setIsPlayingAudio(false)} onPlay={() => setIsPlayingAudio(true)}
                onTimeUpdate={e => setCurT(e.currentTarget.currentTime)}
                onLoadedMetadata={e => { const d = e.currentTarget.duration; setDur(Number.isFinite(d) ? d : 0); e.currentTarget.playbackRate = limited ? 1 : rate; }}
                onError={() => setError('فایل صوتی پخش نشد — لینک را بررسی کن یا از «پخش با صدای مرورگر» استفاده کن.')} />
            )}
          </div>

          {!exam && !submitted && (
            <button onClick={() => setNoHelp(!noHelp)} className={`w-full py-2.5 rounded-xl text-sm font-bold border ${noHelp ? 'bg-rose-600 text-white border-rose-600' : 'bg-white dark:bg-[#1b2029] border-[#dde1ea] dark:border-[#333b4a]'}`}>
              🚫 حالت بدون کمک {noHelp ? '(روشن)' : '(خاموش)'}
            </button>
          )}

          {(!limited || submitted) && (
            <div className={box + ' space-y-2'}>
              <div className="flex items-center gap-4 flex-wrap">
                <button onClick={() => setShowTranscript(v => !v)} className="text-sm font-bold text-[#1f5fbf]">{showTranscript ? '🙈 مخفی کردن متن' : '📄 نمایش متن شنیداری (Transcript)'}</button>
                {showTranscript && <button onClick={toggleTr} className="text-sm font-bold text-[#6b4fd8]">{showTr ? '🙈 مخفی کردن ترجمه فارسی' : '🌐 مشاهده ترجمه فارسی'}</button>}
              </div>
              {showTranscript && (
                <>
                  <p className="text-[11px] text-[#1f5fbf]">💡 روی هر واژه بزن تا معنی‌اش را ببینی و به واژه‌نامه اضافه کنی. با نگه‌داشتن موس روی واژه، معادل فارسی‌اش هم روشن می‌شود.</p>
                  {trErr && <div className="p-2 bg-red-50 text-red-700 rounded-xl text-xs">{trErr}</div>}
                  <div className="space-y-4">
                    {paras.map((toks, pi) => (
                      <div key={pi} className="space-y-1.5">
                        <div className="font-sans text-sm leading-7 text-left" dir="ltr">
                          {toks.map((tk, i) => (
                            <span key={i}>
                              <span
                                onMouseEnter={() => setHov({ p: pi, kind: 'd', i })} onMouseLeave={() => setHov(null)}
                                onClick={() => { setHov({ p: pi, kind: 'd', i }); const w = cleanWord(tk); if (w) setLookup(w); }}
                                className={`cursor-pointer rounded px-0.5 transition-colors ${actD(pi, i) ? 'bg-amber-300 dark:bg-amber-600/70' : 'hover:bg-amber-100 dark:hover:bg-amber-900/40'}`}>{tk}</span>{' '}
                            </span>
                          ))}
                        </div>
                        {showTr && (trBusy && !trans
                          ? <p className="text-xs text-slate-400" dir="rtl">⏳ در حال ترجمه…</p>
                          : trans?.[pi]?.length ? (
                            <div className="text-sm leading-7 text-right text-slate-600 dark:text-slate-300 border-r-2 border-[#6b4fd8]/40 pr-2" dir="rtl">
                              {trans[pi].map((c, ci) => (
                                <span key={ci}>
                                  <span
                                    onMouseEnter={() => setHov({ p: pi, kind: 'f', i: ci })} onMouseLeave={() => setHov(null)}
                                    onClick={() => setHov({ p: pi, kind: 'f', i: ci })}
                                    className={`cursor-pointer rounded px-0.5 transition-colors ${actF(pi, ci) ? 'bg-amber-300 dark:bg-amber-600/70' : 'hover:bg-amber-100 dark:hover:bg-amber-900/40'}`}>{c.t}</span>{' '}
                                </span>
                              ))}
                            </div>
                          ) : null)}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {lookup && <WordLookupModal word={lookup} level={exercise.level} cat="Hören" onQuickAddWord={onQuickAddWord} words={words} onViewWord={onViewWord} onClose={() => setLookup(null)} />}

          <div className="bg-white dark:bg-[#1b2029] border rounded-3xl p-6 space-y-6">
            {exercise.part1TF.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-extrabold text-sm text-[#1f5fbf]">بخش ۱: درست یا نادرست (Richtig / Falsch)</h4>
                {exercise.part1TF.map((q, idx) => { const id = `tf-${idx}`; return (
                  <div key={id} className="p-4 rounded-2xl border bg-slate-50 dark:bg-[#141923] space-y-2">
                    <p className="text-base font-extrabold text-left" dir="ltr">{idx + 1}. <ClickableWords text={q.statement} onWord={t => setLookup(t)} /></p>
                    {faBtn(id, q.translation)}
                    <div className="flex gap-2" dir="ltr">
                      <button onClick={() => answer(id, 'true')} className={`px-4 py-2 rounded-xl text-xs font-bold border ${optCls(answers[id] === 'true', q.answer === true)}`}>Richtig{limited && !submitted ? '' : ' (درست)'}</button>
                      <button onClick={() => answer(id, 'false')} className={`px-4 py-2 rounded-xl text-xs font-bold border ${optCls(answers[id] === 'false', q.answer === false)}`}>Falsch{limited && !submitted ? '' : ' (نادرست)'}</button>
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
                    <p className="text-base font-extrabold text-left" dir="ltr">{idx + 1}. <ClickableWords text={q.question} onWord={t => setLookup(t)} /></p>
                    {faBtn(id, q.translation)}
                    <div className="space-y-1.5" dir="ltr">
                      {q.options.map((o, oi) => (
                        <button key={oi} onClick={() => answer(id, String(oi))} className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-semibold border ${optCls(answers[id] === String(oi), oi === q.answerIndex)}`}>{String.fromCharCode(65 + oi)}) <ClickableWords text={o} onWord={t => setLookup(t)} /></button>
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
                    <p className="text-base font-extrabold text-left" dir="ltr">{idx + 1}. <ClickableWords text={q.sentence} onWord={t => setLookup(t)} /></p>
                    {faBtn(id, q.translation)}
                    <input dir="ltr" readOnly={submitted} value={answers[id] || ''} onChange={e => answer(id, e.target.value)} className={inp} />
                    {fb(id)}
                  </div>); })}
              </div>
            )}

            {exercise.part4Short.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-extrabold text-sm text-[#1f5fbf]">بخش ۴: سؤال‌های باز (Offene Fragen)</h4>
                {exercise.part4Short.map((q, idx) => { const id = `short-${idx}`; return (
                  <div key={id} className="p-4 rounded-2xl border bg-slate-50 dark:bg-[#141923] space-y-2">
                    <p className="text-base font-extrabold text-left" dir="ltr">{idx + 1}. <ClickableWords text={q.question} onWord={t => setLookup(t)} /></p>
                    {faBtn(id, q.translation)}
                    <textarea dir="ltr" rows={2} readOnly={submitted} value={answers[id] || ''} onChange={e => answer(id, e.target.value)} className={inp} />
                    {fb(id)}
                  </div>); })}
              </div>
            )}

            {exercise.vocabulary.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-extrabold text-sm text-[#1f5fbf]">بخش ۵: واژگان (Wortschatz) — معنی/توضیح بنویس</h4>
                {exercise.vocabulary.map((q, idx) => { const id = `v-${idx}`; return (
                  <div key={id} className="p-4 rounded-2xl border bg-slate-50 dark:bg-[#141923] space-y-2">
                    <p className="text-base font-extrabold text-left" dir="ltr"><ClickableWords text={q.word} onWord={t => setLookup(t)} /></p>
                    <input dir="ltr" readOnly={submitted} value={answers[id] || ''} onChange={e => answer(id, e.target.value)} className={inp} />
                    {fb(id)}
                  </div>); })}
              </div>
            )}

            {warningMsg && <div className="p-3 bg-amber-50 text-amber-800 rounded-xl text-xs font-bold">{warningMsg}</div>}
            {error && <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs">{error}</div>}

            {!submitted ? (
              <button onClick={handleCheckClick} disabled={grading}
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white py-3.5 rounded-xl font-bold text-sm shadow-md disabled:opacity-50">
                {grading ? 'در حال بررسی و تصحیح توسط معلم...' : exam ? 'ثبت پاسخ‌ها و ادامه ✓' : 'ثبت و بررسی پاسخ‌ها (Antworten überprüfen) ✓'}
              </button>
            ) : result && (
              <div className="p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 space-y-3">
                <h4 className="font-extrabold text-base text-emerald-800 dark:text-emerald-300">نتیجه آزمون شما: {result.score} / {result.maxScore} ({result.percentage}%) — {result.gradeLabel}</h4>
                <div className="flex items-center gap-2 text-xs font-bold">
                  <span className={`px-2.5 py-0.5 rounded-full text-white ${result.passed ? 'bg-emerald-600' : 'bg-red-600'}`}>{result.passed ? 'قبول ✓' : 'مردود ✗'}</span>
                  <span className="text-[#5d6676]">حد نصاب قبولی: ۶۰٪</span>
                </div>
                <div className="h-2 rounded-full bg-white/70 dark:bg-slate-800 overflow-hidden">
                  <div className={`h-full ${result.passed ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${result.percentage}%` }} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                  {result.sections.map(s => <div key={s.label} className="p-2 rounded-xl bg-white/70 dark:bg-slate-800 flex justify-between"><span>{s.label}</span><span dir="ltr">{s.earned}/{s.total} ({s.percentage}%)</span></div>)}
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300">{result.teacherCommentFa}</p>
                {result.strengths && <p className="text-xs text-emerald-800 dark:text-emerald-300">💪 نقاط قوت: {result.strengths}</p>}
                {result.recommendations && <p className="text-xs text-indigo-800 dark:text-indigo-300">🎯 پیشنهاد: {result.recommendations}</p>}
                {historyAttempts.length > 1 && <p className="text-[11px] text-[#5d6676]">تلاش‌ها: {historyAttempts.map(h => `${h.percentage}%`).join(' ← ')}</p>}
                <p className="text-[11px] text-[#5d6676]">پاسخ‌های اشتباه به «دفتر خطاها» اضافه شد.</p>
                {!exam && <button onClick={resetAttempt} className="px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-emerald-300 text-emerald-800 dark:text-emerald-300 text-xs font-bold">🔄 آزمون دوباره (برگهٔ سفید)</button>}
              </div>
            )}
          </div>
        </div>
      )}

       {viewMode === 'exercise' && exercise && (
        <div className="flex justify-end">
          <button
            onClick={() => { setPrintTarget(null); setPrintOpen(true); }}
            title="برگهٔ A4 — سؤال‌ها + پاسخنامه + Transkript"
            aria-label="برگهٔ A4"
            className="w-10 h-10 rounded-xl bg-[#1f5fbf] text-white flex items-center justify-center shadow-sm hover:bg-[#194ea0] transition"
          >
            <Printer size={16} />
          </button>
        </div>
      )}

      {/* برگهٔ چاپ یکدست (trainerUI): صفحهٔ ۱ سؤال‌ها سفید و بدون پاسخ، صفحهٔ ۲ پاسخنامهٔ مستقل،
          بعد Transkript و کارنامه — هرکدام از صفحهٔ تازه. دکمهٔ پرینتر همان‌جا window.print() را
          داخل رویداد کلیک صدا می‌زند، پس در Safari/iOS هم پنجرهٔ چاپ باز می‌شود. */}
      {(() => {
        const src = printTarget
          ? { ex: printTarget.exercise, tr: printTarget.transcript || '', res: printTarget.result }
          : exercise ? { ex: exercise, tr: transcript, res: result } : null;
        if (!src) return null;
        const ex = src.ex;
        const line = { borderBottom: '1.1px solid #98a0ae', height: 26 } as React.CSSProperties;
        const qTitle = { fontSize: 12.5, fontWeight: 800, margin: '14px 0 6px' } as React.CSSProperties;
        const qItem = { fontSize: 12.5, lineHeight: 1.8, marginBottom: 9 } as React.CSSProperties;
        const questions = (
          <div>
            {ex.part1TF.length > 0 && (
              <>
                <div dir="ltr" style={qTitle}>1. Richtig / Falsch — ankreuzen</div>
                {ex.part1TF.map((q, i) => (
                  <div key={i} dir="ltr" style={qItem}>
                    <b>{i + 1}.</b> {q.statement} &nbsp;&nbsp;&nbsp; ☐ Richtig &nbsp;&nbsp; ☐ Falsch
                  </div>
                ))}
              </>
            )}
            {ex.part2MC.length > 0 && (
              <>
                <div dir="ltr" style={qTitle}>2. Multiple Choice — kreuzen Sie die richtige Antwort an</div>
                {ex.part2MC.map((q, i) => (
                  <div key={i} dir="ltr" style={{ ...qItem, marginBottom: 12 }}>
                    <b>{i + 1}.</b> {q.question}
                    <div style={{ marginTop: 2 }}>
                      {q.options.map((o, oi) => <div key={oi} style={{ fontSize: 12, lineHeight: 1.7 }}>{String.fromCharCode(65 + oi)}) {o}</div>)}
                    </div>
                  </div>
                ))}
              </>
            )}
            {ex.part3Gap.length > 0 && (
              <>
                <div dir="ltr" style={qTitle}>3. Lückentext — füllen Sie die Lücken aus</div>
                {ex.part3Gap.map((q, i) => (
                  <div key={i} dir="ltr" style={qItem}><b>{i + 1}.</b> {q.sentence}</div>
                ))}
              </>
            )}
            {ex.part4Short.length > 0 && (
              <>
                <div dir="ltr" style={qTitle}>4. Offene Fragen — beantworten Sie schriftlich</div>
                {ex.part4Short.map((q, i) => (
                  <div key={i} dir="ltr" style={{ ...qItem, marginBottom: 14 }}>
                    <b>{i + 1}.</b> {q.question}
                    <div style={{ ...line, marginTop: 6 }} />
                    <div style={{ ...line, marginTop: 9 }} />
                  </div>
                ))}
              </>
            )}
            {ex.vocabulary.length > 0 && (
              <>
                <div dir="ltr" style={qTitle}>5. Wortschatz — auf Deutsch</div>
                {ex.vocabulary.map((q, i) => (
                  <div key={i} dir="ltr" style={qItem}>
                    <b>{i + 1}.</b> {q.word} =
                    <span style={{ display: 'inline-block', minWidth: 210, borderBottom: '1.1px solid #98a0ae', marginInlineStart: 6 }}>&nbsp;</span>
                  </div>
                ))}
              </>
            )}
            <div dir="ltr" style={{ marginTop: 18, fontSize: 11, color: '#555' }}>Name: ..............................  Datum: ....................</div>
          </div>
        );
        const solutions = (
          <div>
            {ex.part1TF.length > 0 && (
              <>
                <div dir="ltr" style={qTitle}>1. Richtig / Falsch</div>
                {ex.part1TF.map((q, i) => (
                  <div key={i} dir="ltr" style={qItem}><b>{i + 1}.</b> <b style={{ color: '#1a7a3a' }}>{q.answer ? 'Richtig' : 'Falsch'}</b>{q.explanation ? ` — ${q.explanation}` : ''}</div>
                ))}
              </>
            )}
            {ex.part2MC.length > 0 && (
              <>
                <div dir="ltr" style={qTitle}>2. Multiple Choice</div>
                {ex.part2MC.map((q, i) => (
                  <div key={i} dir="ltr" style={qItem}><b>{i + 1}.</b> <b style={{ color: '#1a7a3a' }}>{String.fromCharCode(65 + q.answerIndex)}) {q.options[q.answerIndex]}</b>{q.explanation ? ` — ${q.explanation}` : ''}</div>
                ))}
              </>
            )}
            {ex.part3Gap.length > 0 && (
              <>
                <div dir="ltr" style={qTitle}>3. Lückentext</div>
                {ex.part3Gap.map((q, i) => (
                  <div key={i} dir="ltr" style={qItem}><b>{i + 1}.</b> <b style={{ color: '#1a7a3a' }}>{q.answer}</b></div>
                ))}
              </>
            )}
            {ex.part4Short.length > 0 && (
              <>
                <div dir="ltr" style={qTitle}>4. Offene Fragen — Musterantwort</div>
                {ex.part4Short.map((q, i) => (
                  <div key={i} dir="ltr" style={qItem}><b>{i + 1}.</b> <b style={{ color: '#1a7a3a' }}>{q.answer}</b></div>
                ))}
              </>
            )}
            {ex.vocabulary.length > 0 && (
              <>
                <div dir="ltr" style={qTitle}>5. Wortschatz</div>
                {ex.vocabulary.map((q, i) => (
                  <div key={i} dir="ltr" style={qItem}><b>{i + 1}.</b> {q.word} = <b style={{ color: '#1a7a3a' }}>{q.meaning}</b></div>
                ))}
              </>
            )}
          </div>
        );
        return (
          <PrintPreview
            open={printOpen}
            onClose={() => { setPrintOpen(false); setPrintTarget(null); }}
            title={<span dir="ltr" style={{ fontFamily: 'Georgia, serif' }}>{ex.title}</span>}
            docTitle={`Hören — ${ex.title}`}
            meta={`${EXAM_LABELS[ex.examType]} • Niveau ${ex.level} • نام و تاریخ: ...........................`}
            questions={questions}
            solutions={solutions}
            extraPages={[
              src.tr ? {
                title: 'Transkript',
                content: <div dir="ltr" style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, lineHeight: 2 }}>{src.tr}</div>,
              } : null,
              src.res ? {
                title: 'کارنامه و گزارش',
                content: (
                  <div dir="rtl">
                    <p style={{ fontSize: 13, marginBottom: 8 }}><b>امتیاز:</b> <span dir="ltr">{src.res.score} / {src.res.maxScore} ({src.res.percentage}%)</span> — {src.res.gradeLabel}</p>
                    <p style={{ fontSize: 12.5, marginBottom: 8 }}>{src.res.teacherCommentFa}</p>
                    {src.res.sections.length > 0 && (
                      <ul style={{ margin: 0, paddingInlineStart: 20, listStyle: 'disc' }}>
                        {src.res.sections.map(s => <li key={s.label} style={{ fontSize: 12, marginBottom: 4 }}>{s.label}: <span dir="ltr">{s.earned}/{s.total} ({s.percentage}%)</span></li>)}
                      </ul>
                    )}
                  </div>
                ),
              } : null,
            ].filter(Boolean) as { title: React.ReactNode; content: React.ReactNode }[]}
          />
        );
      })()}
    </div>
  );
};
