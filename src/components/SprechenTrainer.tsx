/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SprechenTrainer (enhanced with persona avatars + stable voice selection)
 * -------------------------------------------------------------------------
 * All original features preserved:
 *  - instant per-message correction + feedback (Fb, addErrors)
 *  - fluency measurement (words/wpm/pauses/fillers)
 *  - exam simulator (3 parts, timer, model answer, criteria)
 *  - prefs (autoplay, hands-free, auto-send, no-help)
 *  - error book integration
 * Added:
 *  - 5 conversation personas + 2 exam personas (gender-aware)
 *  - avatar (emoji) + name in chat header
 *  - stable voice selection (browser TTS: pick German voice matching persona gender)
 *  - voice selection via audio.ts (cloud-first via wort.ttsWorker, browser-TTS
 *    fallback) with persona-aware German voice name
 */

import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Send, Square, Volume2, Clock, PlusCircle, Repeat } from 'lucide-react';
import { speak, stopSpeaking, getTtsWorkerBase, setTtsWorkerBase } from '../utils/audio';
import { describeAiError } from '../utils/aiProvider';
import { addErrors } from '../utils/errorBook';
import { ExamRun, S, askJson, useNoHelp } from '../utils/trainerKit';
import { LevelChips } from './trainerUI';
import { ClickableWords, WordLookupModal } from './WordLookup';
import type { Word } from '../types';

interface SprechenTrainerProps {
  onClose: () => void;
  onShowToast: (msg: string, isErr?: boolean) => void;
  onQuickAddWord?: (w: Partial<Word>) => boolean;
  /** کل کتابخانه — گیتِ تکراری/Partizip II/مترادف */
  words?: Word[];
  onViewWord?: (w: Word) => void;
  exam?: ExamRun;
}

type Level = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
type ExamType = 'Goethe' | 'Telc' | 'Zertifikat' | 'ÖSD' | 'EPD';
interface Fb { ok: boolean; corrected: string; issues: { wrong: string; correct: string; why_fa: string }[]; better?: string; tip_fa?: string }
interface Stat { words: number; secs: number; pauses: number; longest: number; fillers: number; fillerList: string[] }
interface Msg { who: 'ai' | 'user'; text: string; fb?: Fb; part?: number; stat?: Stat }
interface Part { type: 'dialog' | 'monolog'; title_de: string; title_fa: string; task_de: string; task_fa: string; points: string[]; minutes: number; opening: string }
interface Flu { words: number; wpm: number; pauses: number; longest: number; fillers: number; fillerList: string[] }
interface Report {
  score: number; passed: boolean; level_estimate: string;
  criteria: { task: number; interaction: number; vocab: number; grammar: number };
  summary_fa: string; strengths_fa: string[]; improvements_fa: string[];
  corrections: { original: string; corrected: string; why_fa: string }[]; model_answer_de: string; flu?: Flu;
}
interface Prefs { autoplay: boolean; rate: number; level: Level; autoSend: boolean; handsFree: boolean }

/* ----------------------------- Personas ----------------------------- */
type Gender = 'female' | 'male';
interface Persona {
  id: string;
  name: string;        // German display name
  emoji: string;       // avatar (SVG/3D not needed for v1)
  role: string;        // short role label (fa)
  levels: Level[];     // recommended levels
  gender: Gender;      // for voice selection
  /** Injected verbatim into the system prompt. */
  prompt: string;
  /** First-line opening the persona says (optional; otherwise AI generates). */
  opening?: string;
}

const PERSONAS: Persona[] = [
  {
    id: 'anna', name: 'Anna', emoji: '☕', role: 'باریستای کافهٔ برلین', levels: ['A1', 'A2'],
    gender: 'female',
    prompt: 'Du bist Anna, 24, Barista in einem Café in Berlin-Mitte. Charakter: freundlich, geduldig, ein bisschen witzig. Sprachstil: kurze Sätze, "nee" statt "nein", "super!" als Bestätigung, du wiederholst die Bestellung kurz zur Sicherheit. Bleib IMMER in Rolle. Antworte NUR auf Deutsch. Maximal 2 Sätze pro Antwort. Wenn der Lernende blockiert, hilf mit einer kurzen Frage.',
    opening: 'Hallo! Schön, dass du da bist. Was darf ich dir bringen — Kaffee oder Tee?',
  },
  {
    id: 'mueller', name: 'Herr Müller', emoji: '🏛️', role: 'کارمند ادارهٔ ثبت‌نام', levels: ['A2', 'B1'],
    gender: 'male',
    prompt: 'Du bist Herr Müller, 55, Sachbearbeiter im Bürgeramt. Charakter: höflich, formell, geduldig, fragt präzise nach. Sprachstil: formelles Deutsch ("Sie", "könnten Sie bitte...", "ich bräuchte noch..."). Bleib IMMER in Rolle. Antworte NUR auf Deutsch. Maximal 2 Sätze. Stell immer genau die Frage, die für die Anmeldung nötig ist.',
    opening: 'Guten Tag. Hier ist das Bürgeramt. Was kann ich für Sie tun?',
  },
  {
    id: 'lukas', name: 'Lukas', emoji: '🎒', role: 'دانشجو، Mensa', levels: ['B1'],
    gender: 'male',
    prompt: 'Du bist Lukas, 20, Student in München, triffst den Lernenden in der Mensa. Charakter: locker, neugierig, bisschen sarkastisch aber nett. Sprachstil: umgangssprachlich ("Alter", "nee", "krass", "völlig"). Bleib IMMER in Rolle. Antworte NUR auf Deutsch. 1-3 Sätze. Stell eine natürliche Folgefrage zum Uni-Alltag.',
    opening: 'Hey! Setz dich doch. Bist du auch neu hier an der Uni?',
  },
  {
    id: 'schmidt', name: 'Frau Schmidt', emoji: '🏠', role: 'مالک آپارتمان', levels: ['B1', 'B2'],
    gender: 'female',
    prompt: 'Du bist Frau Schmidt, 45, Vermieterin. Charakter: direkt, geschäftsmäßig, freundlich aber bestimmt. Sprachstil: klares Standarddeutsch, fragt nach Details (Miete, Kaution, Dauer). Bleib IMMER in Rolle. Antworte NUR auf Deutsch. Maximal 2-3 Sätze. Verhandle leicht, wenn der Lernende einen Vorschlag macht.',
    opening: 'Guten Tag. Sie wollten sich die Wohnung ansehen, richtig?',
  },
  {
    id: 'weber', name: 'Prof. Weber', emoji: '📚', role: 'استاد دانشگاه', levels: ['B2', 'C1'],
    gender: 'male',
    prompt: 'Du bist Prof. Weber, 60, Universität Mainz. Charakter: intellektuell, ruhig, ermutigend, stellt tiefe Fragen. Sprachstil: gehobenes, präzises Deutsch, akademische Wendungen. Bleib IMMER in Rolle. Antworte NUR auf Deutsch. 2-3 Sätze mit einer echten Diskussionsfrage. Keine Überkorrektur im Chat — reagiere nur inhaltlich.',
    opening: 'Herzlich willkommen. Lassen Sie uns über das Thema sprechen — was ist Ihr erster Gedanke dazu?',
  },
];

const EXAM_PERSONAS: Record<ExamType, Persona> = {
  Goethe: {
    id: 'ex-goethe', name: 'Frau Becker', emoji: '📋', role: 'ممتحن Goethe', levels: ['B1', 'B2'], gender: 'female',
    prompt: 'Du bist Frau Becker, offizielle Prüferin für das Goethe-Zertifikat. Du bleibst neutral, freundlich, professionell. Du stellst die Aufgaben wie in einer echten Prüfung und stellst Nachfragen. Antworte NUR auf Deutsch, kurz.',
  },
  Telc: {
    id: 'ex-telc', name: 'Herr Klein', emoji: '📋', role: 'ممتحن telc', levels: ['B1', 'B2'], gender: 'male',
    prompt: 'Du bist Herr Klein, offizieller telc-Prüfer. Neutral, sachlich, professionell. Du stellst die Aufgaben wie in einer echten telc-Prüfung und stellst Nachfragen. Antworte NUR auf Deutsch, kurz.',
  },
  Zertifikat: {
    id: 'ex-zert', name: 'Frau Weber', emoji: '📋', role: 'ممتحن Zertifikat Deutsch', levels: ['B1'], gender: 'female',
    prompt: 'Du bist Frau Weber, offizielle Prüferin für das Zertifikat Deutsch. Neutral, sachlich. Du stellst die Aufgaben wie in einer echten Prüfung. Antworte NUR auf Deutsch, kurz.',
  },
  ÖSD: {
    id: 'ex-oesd', name: 'Frau Gruber', emoji: '📋', role: 'ممتحن ÖSD', levels: ['B1', 'B2'], gender: 'female',
    prompt: 'Du bist Frau Gruber, offizielle ÖSD-Prüferin (Österreich). Neutral, sachlich, österreichische Färbung in Begrüßung. Antworte NUR auf Deutsch, kurz.',
  },
  EPD: {
    id: 'ex-epd', name: 'Prof. Hartmann', emoji: '📋', role: 'ممتحن EPD', levels: ['B2', 'C1'], gender: 'male',
    prompt: 'Du bist Prof. Hartmann, EPD-Prüfer (Ergänzungsprüfung Deutsch, Universität). Akademisch, sachlich. Antworte NUR auf Deutsch, kurz.',
  },
};

/* ------------------------- Voice selection ------------------------- *
 * We rely on the real `audio.ts` (cloud-first via wort.ttsWorker, browser
 * TTS fallback with German voice). `audio.ts` exposes `SpeakOptions.voiceName`
 * and `vreg` (lang code), so we only need to map each persona's gender to a
 * stable German browser voice name. The list below prefers well-known voices
 * present on macOS/iOS ("Anna", "Markus") and Windows ("Katja", "Conrad");
 * missing names simply fall back to the first German voice inside `speak()`.
 */
const VOICE_BY_GENDER: Record<Gender, string[]> = {
  female: ['Anna', 'Katja', 'Petra', 'Sabina', 'Marlene', 'Hanna', 'Helena'],
  male: ['Markus', 'Conrad', 'Yannick', 'Maxim', 'Julius', 'Jakob', 'Tom'],
};

const pickVoiceName = (gender: Gender): string | undefined => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return undefined;
  const all = window.speechSynthesis.getVoices() || [];
  const de = all.filter(v => (v.lang || '').toLowerCase().startsWith('de'));
  if (!de.length) return undefined;
  const candidates = VOICE_BY_GENDER[gender];
  const hit = de.find(v => candidates.some(c => v.name.toLowerCase().includes(c.toLowerCase())));
  return (hit || de[0]).name;
};

const FREE_TOPICS = [
  'Reisen und Urlaub (سفر و تعطیلات)', 'Arbeit und Beruf (کار و شغل)', 'Bewerbungsgespräch (مصاحبهٔ شغلی)',
  'Wohnen und Haushalt (مسکن و خانه‌داری)', 'Wohnungssuche (جست‌وجوی خانه)', 'Beim Arzt (نزد پزشک)',
  'Gesundheit und Sport (سلامتی و ورزش)', 'Essen und Trinken (خوراک و نوشیدنی)',
  'Medien und Internet (رسانه و اینترنت)', 'Umwelt und Natur (محیط زیست)', 'Freizeit und Hobbys (فراغت و سرگرمی)',
  'Bildung und Lernen (آموزش و یادگیری)', 'Einkaufen und Geld (خرید و پول)', 'Stadt und Verkehr (شهر و حمل‌ونقل)',
  'Freunde und Familie (دوستان و خانواده)', 'Zukunftspläne (برنامه‌های آینده)', 'Freies Gespräch (مکالمهٔ آزاد)'
];
const PREF_KEY = 'wb_sprechen_prefs';
const PERSONA_KEY = 'wb_sprechen_persona';
const DEFAULT_PREFS: Prefs = { autoplay: true, rate: 0.95, level: 'B1', autoSend: true, handsFree: false };
const loadPrefs = (): Prefs => { try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; } catch { return DEFAULT_PREFS; } };
const loadPersona = (): string => { try { return localStorage.getItem(PERSONA_KEY) || 'anna'; } catch { return 'anna'; } };
const topicDe = (t: string) => t.replace(/\s*\(.*\)\s*$/, '');
const ETYPE: Record<string, ExamType> = { Goethe: 'Goethe', 'ÖSD': 'ÖSD', telc: 'Telc', EPD: 'EPD' };

const unlockAudio = () => {
  try { const a = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='); void a.play().catch(() => {}); } catch { /* ignore */ }
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (AC) { const c = new AC(); void c.resume?.(); const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, 22050); s.connect(c.destination); s.start(0); setTimeout(() => { try { void c.close(); } catch { /* ignore */ } }, 200); }
  } catch { /* ignore */ }
  try { if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; window.speechSynthesis.speak(u); } } catch { /* ignore */ }
};

const defaultParts = (type: ExamType, level: Level): Part[] => [
  { type: 'dialog', title_de: 'Teil 1: Kontaktaufnahme', title_fa: 'بخش ۱: آشنایی و گفتگو', task_de: 'Stellen Sie sich vor und sprechen Sie über Ihre Person und Erfahrungen.', task_fa: 'خودت را معرفی کن و درباره تجربیاتت صحبت کن.', points: ['Person', 'Erfahrung'], minutes: 3, opening: 'Guten Tag! Erzählen Sie mir bitte etwas über sich.' },
  { type: 'monolog', title_de: 'Teil 2: Ein Thema präsentieren', title_fa: 'بخش ۲: ارائه موضوع', task_de: `Präsentieren Sie ein Thema (${type}, ${level}). Nennen Sie Beispiele und begründen Sie Ihre Meinung.`, task_fa: 'موضوع را ارائه بده، مثال بزن و دلایلت را بگو.', points: ['Präsentation', 'Beispiele', 'Meinung'], minutes: 4, opening: 'Bitte beginnen Sie mit Ihrer Präsentation.' },
  { type: 'dialog', title_de: 'Teil 3: Gemeinsam etwas planen', title_fa: 'بخش ۳: برنامه‌ریزی مشترک', task_de: 'Planen Sie gemeinsam eine Aktivität. Machen Sie Vorschläge und reagieren Sie auf Ihren Partner.', task_fa: 'با پارتنر برنامه‌ریزی کن، پیشنهاد بده و واکنش نشان بده.', points: ['Planung', 'Vorschlag'], minutes: 4, opening: 'Lassen Sie uns gemeinsam etwas planen. Was schlagen Sie vor?' }
];

/* ---------- fluency measurement ---------- */
const FILLER_RE = /\b(äh+m?|ähm|öhm?|hm+|also|halt|sozusagen|quasi)\b/gi;
const countWords = (t: string) => t.split(/\s+/).filter(w => /\p{L}/u.test(w)).length;
const fillersOf = (t: string): string[] => (t.toLowerCase().match(FILLER_RE) || []);
const fluencyOf = (list: Msg[]): Flu | undefined => {
  const sp = list.filter(m => m.who === 'user' && m.stat);
  if (!sp.length) return undefined;
  const words = sp.reduce((a, m) => a + m.stat!.words, 0);
  const secs = sp.reduce((a, m) => a + m.stat!.secs, 0);
  const all = sp.flatMap(m => m.stat!.fillerList);
  const top: Record<string, number> = {};
  all.forEach(f => { top[f] = (top[f] || 0) + 1; });
  return {
    words, wpm: secs >= 5 ? Math.round((words / secs) * 60) : 0,
    pauses: sp.reduce((a, m) => a + m.stat!.pauses, 0), longest: Math.max(0, ...sp.map(m => m.stat!.longest)),
    fillers: all.length, fillerList: Object.entries(top).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}×${n}`)
  };
};

const replyCheck = S.obj({ reply: S.req });
const chatCheck = S.obj({
  reply: S.req, corrected: S.str(), better: S.str(), tip_fa: S.str(),
  issues: S.arr(S.obj({ wrong: S.str(), correct: S.str(), why_fa: S.str() }))
});
const partsCheck = S.obj({
  parts: S.arr(S.obj({
    type: S.str('dialog'), title_de: S.str(), title_fa: S.str(), task_de: S.req, task_fa: S.str(),
    points: S.arr(S.str()), minutes: S.num(1, 15, 3), opening: S.str()
  }), 3)
});
const reportCheck = S.obj({
  level_estimate: S.str(),
  criteria: S.obj({ task: S.num(0, 25), interaction: S.num(0, 25), vocab: S.num(0, 25), grammar: S.num(0, 25) }),
  summary_fa: S.str(), strengths_fa: S.arr(S.req), improvements_fa: S.arr(S.req),
  corrections: S.arr(S.obj({ original: S.req, corrected: S.req, why_fa: S.str() })), model_answer_de: S.str()
});

export const SprechenTrainer: React.FC<SprechenTrainerProps> = ({ onClose, onShowToast, onQuickAddWord, words, onViewWord, exam }) => {
  const [screen, setScreen] = useState<'hub' | 'free_setup' | 'free' | 'exam_setup' | 'exam' | 'report'>(exam ? 'exam' : 'hub');
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  const [personaId, setPersonaId] = useState<string>(loadPersona);
  const [topic, setTopic] = useState(FREE_TOPICS[0]);
  const [msgs, setMsgsState] = useState<Msg[]>([]);
  const [lookup, setLookup] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [listening, setListening] = useState(false);
  const [examType, setExamType] = useState<ExamType>(exam ? ETYPE[exam.org] : 'Goethe');
  const [examLevel, setExamLevel] = useState<Level>(exam ? (exam.level as Level) : 'B1');

  // درخواست کاربر ۴: شروع مستقیم آزمون شفاهی از داشبورد — گوش‌دادن به رویداد window
  useEffect(() => {
    const handler = () => setScreen('exam_setup');
    window.addEventListener('wb-start-oral-exam', handler);
    return () => window.removeEventListener('wb-start-oral-exam', handler);
  }, []);
  const [parts, setParts] = useState<Part[]>([]);
  const [partIdx, setPartIdx] = useState(0);
  const [report, setReport] = useState<Report | null>(null);
  const [partSecondsLeft, setPartSecondsLeft] = useState<number>(180);
  const [showFa, setShowFa] = useState(false);
  const [noHelp, setNoHelp] = useNoHelp();
  const [ttsWorkerInput, setTtsWorkerInput] = useState<string>(() => getTtsWorkerBase() || '');
  const [ttsWorkerSaved, setTtsWorkerSaved] = useState<string | null>(null);
  const limited = !!exam || noHelp;

  const msgsRef = useRef<Msg[]>([]);
  const busyRef = useRef(false);
  const prefsRef = useRef(prefs);
  const screenRef = useRef(screen);
  const limitedRef = useRef(limited);
  const personaRef = useRef(personaId);
  const examTypeRef = useRef(examType);
  const speakToken = useRef(0);
  const recRef = useRef<any>(null);
  const finalRef = useRef('');
  const interimRef = useRef('');
  const silenceRef = useRef<any>(null);
  const statRef = useRef({ t0: 0, tl: 0, pauses: 0, longest: 0 });
  const pendStat = useRef<{ text: string; stat: Stat } | null>(null);
  const sendRef = useRef<(t?: string) => void>(() => {});
  const nextPartRef = useRef<() => void>(() => {});
  const autoEndRef = useRef(-1);
  const listRef = useRef<HTMLDivElement>(null);
  prefsRef.current = prefs;
  screenRef.current = screen;
  limitedRef.current = limited;
  personaRef.current = personaId;
  examTypeRef.current = examType;

  const SR: any = typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;
  const setMsgs = (m: Msg[]) => { msgsRef.current = m; setMsgsState(m); };
  const setPrefs = (p: Partial<Prefs>) => { const n = { ...prefsRef.current, ...p }; setPrefsState(n); try { localStorage.setItem(PREF_KEY, JSON.stringify(n)); } catch { /* ignore */ } };
  const setPersona = (id: string) => { setPersonaId(id); personaRef.current = id; try { localStorage.setItem(PERSONA_KEY, id); } catch { /* ignore */ } };
  const isExam = screen === 'exam';

  // active persona object: exam persona overrides during exam screen
  const activePersona: Persona = (() => {
    if (screenRef.current === 'exam') return EXAM_PERSONAS[examTypeRef.current] || EXAM_PERSONAS.Goethe;
    return PERSONAS.find(p => p.id === personaRef.current) || PERSONAS[0];
  })();

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs, busy]);
  useEffect(() => () => { speakToken.current++; stopSpeaking(); try { recRef.current?.abort?.(); } catch { /* ignore */ } clearTimeout(silenceRef.current); }, []);
  useEffect(() => { if (exam) void startExam(ETYPE[exam.org], exam.level as Level); }, []);
  // iOS Safari: voices load async; warm up once on mount so first speak() has a German voice ready.
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const warm = () => { try { window.speechSynthesis.getVoices(); } catch { /* ignore */ } };
    warm();
    window.speechSynthesis.onvoiceschanged = warm;
    return () => { try { window.speechSynthesis.onvoiceschanged = null; } catch { /* ignore */ } };
  }, []);

  useEffect(() => {
    if (screen !== 'exam' || busy || partSecondsLeft <= 0) return;
    const t = setInterval(() => setPartSecondsLeft(prev => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(t);
  }, [screen, busy, partSecondsLeft]);
  useEffect(() => {
    if (!exam || screen !== 'exam' || busy || !parts.length || partSecondsLeft > 0 || autoEndRef.current === partIdx) return;
    autoEndRef.current = partIdx;
    nextPartRef.current();
  }, [partSecondsLeft, parts.length]);

  const formatTime = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

  const stopTalking = () => { speakToken.current++; stopSpeaking(); setSpeaking(false); };

  // Persona-aware speak: delegates to `audio.ts` `speak()`, which is itself
  // cloud-first (wort.ttsWorker) with a browser-TTS fallback. We only choose a
  // German voice matching the persona gender so each persona sounds consistent
  // across sessions. On iOS Safari, `audio.ts` already warms up voices and uses
  // the same unlock flow, so playback works there too.
  const personaSay = (text: string, onDone?: () => void) => {
    if (!text) return;
    const token = ++speakToken.current;
    stopSpeaking();
    setSpeaking(true); setBlocked(false);
    const rate = prefsRef.current.rate;
    const voiceName = pickVoiceName(activePersona.gender);
    const done = () => { if (token !== speakToken.current) return; setSpeaking(false); onDone?.(); };
    const fail = () => { if (token !== speakToken.current) return; setSpeaking(false); setBlocked(true); };
    void speak(text, {
      rate,
      vreg: 'de-DE',
      voiceName,
      onEnd: done,
      onErr: () => {
        // Cloud may fail (no worker, network) — audio.ts already falls back to
        // browser TTS internally, so this branch only fires if even the
        // browser voice failed. Try once more with forceBrowser to be safe.
        void speak(text, { rate, vreg: 'de-DE', voiceName, forceBrowser: true, onEnd: done, onErr: fail });
      },
    });
  };

  const sayDe = (text: string, onDone?: () => void) => personaSay(text, onDone);
  const aiSays = (text: string) => { if (prefsRef.current.autoplay || limitedRef.current) personaSay(text, prefsRef.current.handsFree ? () => startListening() : undefined); };

  const stopListening = () => { clearTimeout(silenceRef.current); try { recRef.current?.stop?.(); } catch { /* ignore */ } };
  function startListening() {
    unlockAudio();
    if (!SR) { onShowToast('تشخیص گفتار در این مرورگر فعال نیست. می‌توانی تایپ کنی.', true); return; }
    if (recRef.current) { stopListening(); return; }
    if (busyRef.current) return;
    stopTalking();
    const rec = new SR();
    rec.lang = 'de-DE'; rec.interimResults = true; rec.continuous = true; rec.maxAlternatives = 1;
    finalRef.current = ''; interimRef.current = '';
    statRef.current = { t0: 0, tl: 0, pauses: 0, longest: 0 };
    const gap = screenRef.current === 'exam' ? 4500 : 2600;
    rec.onstart = () => setListening(true);
    rec.onresult = (e: any) => {
      const now = Date.now(); const s = statRef.current;
      if (!s.t0) s.t0 = now;
      else { const g = now - s.tl; if (g > 1400) { s.pauses++; s.longest = Math.max(s.longest, g); } }
      s.tl = now;
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current += r[0].transcript + ' '; else interim += r[0].transcript;
      }
      interimRef.current = interim;
      setInput((finalRef.current + interim).trim());
      clearTimeout(silenceRef.current);
      silenceRef.current = setTimeout(() => { try { rec.stop(); } catch { /* ignore */ } }, gap);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => {
      clearTimeout(silenceRef.current);
      setListening(false); recRef.current = null;
      const text = (finalRef.current || interimRef.current).trim();
      if (!text) return;
      const s = statRef.current;
      const fl = fillersOf(text);
      pendStat.current = { text, stat: { words: countWords(text), secs: s.t0 ? Math.max(1, (s.tl - s.t0) / 1000) : 0, pauses: s.pauses, longest: Math.round(s.longest / 100) / 10, fillers: fl.length, fillerList: fl } };
      setInput(text);
      if (prefsRef.current.autoSend && screenRef.current !== 'exam') sendRef.current(text);
    };
    recRef.current = rec;
    try { rec.start(); } catch { setListening(false); recRef.current = null; }
  }

  const ctxOf = (list: Msg[]) => list.slice(-14).map(m => `${m.who === 'ai' ? 'Partner' : 'Learner'}: ${m.text}`).join('\n');
  const sttNote = 'The learner\'s text may come from speech recognition: no punctuation — treat leniently.';

  const personaBlock = (level: Level): string => {
    const p = activePersona;
    return `PERSONA (bleib IMMER in dieser Rolle, sprich als ${p.name}):\n${p.prompt}\nLernenden-Niveau: ${level}.`;
  };

  const startFree = async () => {
    unlockAudio();
    setScreen('free'); setReport(null); setErr(''); setMsgs([]); setBusy(true); busyRef.current = true;
    try {
      const p = activePersona;
      const r = await askJson<any>(`${personaBlock(prefs.level)}\nThema: "${topicDe(topic)}". Beginne das Gespräch auf Deutsch. Return ONLY JSON: {"reply":"..."}`, replyCheck, { timeoutMs: 30000 });
      setMsgs([{ who: 'ai', text: r.reply }]);
      aiSays(r.reply);
    } catch (e: any) { setErr(describeAiError(e)); }
    finally { setBusy(false); busyRef.current = false; }
  };

  const sendMessage = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || busyRef.current) return;
    unlockAudio(); stopListening(); stopTalking();
    const exam_ = screenRef.current === 'exam';
    const part = exam_ ? parts[partIdx] : undefined;
    const ps = pendStat.current;
    const stat = ps && ps.text.toLowerCase() === text.toLowerCase() ? ps.stat : undefined;
    pendStat.current = null;
    const base: Msg[] = [...msgsRef.current, { who: 'user', text, part: exam_ ? partIdx : undefined, stat }];
    setMsgs(base); setInput(''); setBusy(true); busyRef.current = true; setErr('');
    try {
      if (!exam_) {
        const r = await askJson<any>(`${personaBlock(prefs.level)}\nThema: "${topicDe(topic)}". ${sttNote}
History:\n${ctxOf(base)}
Task: (1) antworte natürlich in 1-2 Sätzen auf Niveau ${prefs.level} mit einer Frage; (2) prüfe die letzte Nachricht des Lernenden auf Grammatik/Natürlichkeit.
Return ONLY JSON: {"reply":"...","corrected":"...","issues":[{"wrong":"","correct":"","why_fa":"..."}],"better":"...","tip_fa":"..."}`, chatCheck, { timeoutMs: 35000 });
        const issues = r.issues.filter((i: any) => i.wrong || i.correct);
        const fb: Fb = { ok: issues.length === 0, corrected: r.corrected || text, issues, better: r.better, tip_fa: r.tip_fa };
        if (issues.length) addErrors([{ original: text, corrected: fb.corrected, type: 'گرامر', why: issues.map((i: any) => i.why_fa).join(' | '), src: 'Sprechen' }]);
        setMsgs([...base.slice(0, -1), { ...base[base.length - 1], fb }, { who: 'ai', text: r.reply }]); aiSays(r.reply);
      } else {
        const p = activePersona;
        const r = await askJson<any>(`${personaBlock(examLevel)}\nPrüfungstyp: ${examType}. Aktueller Teil: "${part?.title_de}". Aufgabe: "${part?.task_de}". History:\n${ctxOf(base)}\nReagiere kurz als Prüfer/in und stell EINE Rückfrage oder gib den nächsten Impuls. Return ONLY JSON: {"reply":"..."}`, replyCheck, { timeoutMs: 30000 });
        setMsgs([...base, { who: 'ai', text: r.reply, part: partIdx }]); aiSays(r.reply);
      }
    } catch (e: any) { setErr(describeAiError(e)); }
    finally { setBusy(false); busyRef.current = false; }
  };
  sendRef.current = t => { void sendMessage(t); };

  const startExam = async (et: ExamType = examType, lv: Level = examLevel) => {
    unlockAudio();
    setScreen('exam'); setReport(null); setErr(''); setMsgs([]); setPartIdx(0); setBusy(true); busyRef.current = true; setShowFa(false); autoEndRef.current = -1;
    let list: Part[] = [];
    try {
      const r = await askJson<any>(`Design an official German speaking exam simulation for ${et} at level ${lv} (standard format for Germany/Austria). Exactly 3 parts.
Return ONLY JSON: {"parts":[{"type":"dialog|monolog","title_de":"Teil 1: ...","title_fa":"بخش ۱: ...","task_de":"...","task_fa":"...","points":["..."],"minutes":3,"opening":"..."}]}`, partsCheck, { timeoutMs: 40000 });
      list = r.parts.slice(0, 3).map((p: any) => ({ ...p, type: p.type === 'monolog' ? 'monolog' : 'dialog' }));
    } catch {
      list = defaultParts(et, lv);
      onShowToast('سناریوی استاندارد بارگذاری شد.', true);
    }
    if (exam) {
      const sum = list.reduce((a, p) => a + p.minutes, 0) || 1;
      list = list.map(p => ({ ...p, minutes: Math.max(1, Math.round((p.minutes * exam.minutes) / sum)) }));
    }
    setParts(list); setPartIdx(0);
    setPartSecondsLeft((list[0].minutes || 3) * 60);
    const first = list[0].opening || list[0].task_de;
    setMsgs([{ who: 'ai', text: first, part: 0 }]);
    setBusy(false); busyRef.current = false;
    aiSays(first);
  };

  const nextPart = () => {
    stopListening(); stopTalking();
    if (partIdx >= parts.length - 1) { void evaluate(); return; }
    const i = partIdx + 1;
    setShowFa(false); setPartIdx(i);
    setPartSecondsLeft((parts[i].minutes || 3) * 60);
    const op = parts[i].opening || parts[i].task_de;
    setMsgs([...msgsRef.current, { who: 'ai', text: op, part: i }]);
    aiSays(op);
  };
  nextPartRef.current = nextPart;

  const evaluate = async () => {
    const list = msgsRef.current;
    if (!list.some(m => m.who === 'user')) {
      if (exam) { exam.onFinish({ score: 0, max: 100, note: 'پاسخی ثبت نشد' }); return; }
      onShowToast('هنوز پاسخی ثبت نشده است.', true); return;
    }
    unlockAudio(); stopListening(); stopTalking();
    setBusy(true); busyRef.current = true; setErr('');
    const exam_ = screenRef.current === 'exam';
    try {
      const transcript = list.map(m => `${m.who === 'ai' ? 'Examiner' : 'Candidate'}: ${m.text}`).join('\n');
      const flu = fluencyOf(list);
      const candWords = list.filter(m => m.who === 'user').reduce((a, m) => a + countWords(m.text), 0);
      const facts = flu
        ? `MEASURED FACTS (from audio timing, do not contradict): ${flu.wpm ? `${flu.wpm} words/minute (natural B1+ speech is roughly 90-130); ` : ''}${flu.pauses} pauses longer than 1.4 s (longest ${flu.longest} s); ${flu.fillers} filler words${flu.fillerList.length ? ` (${flu.fillerList.join(', ')})` : ''}. Speech recognition often drops "äh", so treat fillers as a lower bound.`
        : 'No audio timing is available (answers were typed): judge only language.';
      const r = await askJson<any>(`TRANSCRIPT:\n${transcript}\n\n${facts}\nCandidate spoke ${candWords} words in total.

You are a strict, honest German oral examiner (${exam_ ? `${examType} ${examLevel}` : `level ${prefs.level}`}). Judge ONLY the Candidate's lines. Very short or off-task answers get low scores.
Give four criteria, each an INTEGER 0-25 (do NOT output a total):
- task: Aufgabenerfüllung (all points of the task covered, appropriate length)
- interaction: Interaktion und Flüssigkeit (reacts to the examiner, keeps the talk going, fluency/pauses/fillers per the facts)
- vocab: Wortschatz (range, precision, idiomatic use)
- grammar: Grammatik und Strukturen (correctness and complexity)
Return ONLY JSON: {"level_estimate":"B1","criteria":{"task":0,"interaction":0,"vocab":0,"grammar":0},"summary_fa":"...","strengths_fa":["..."],"improvements_fa":["..."],"corrections":[{"original":"...","corrected":"...","why_fa":"..."}],"model_answer_de":"model answer 4-6 sentences"}`,
        reportCheck, { timeoutMs: 60000 });
      const k = candWords < 25 ? 0.4 : 1;
      const crit = { task: Math.round(r.criteria.task * k), interaction: Math.round(r.criteria.interaction * k), vocab: Math.round(r.criteria.vocab * k), grammar: Math.round(r.criteria.grammar * k) };
      const score = crit.task + crit.interaction + crit.vocab + crit.grammar;
      if (r.corrections.length) addErrors(r.corrections.map((x: any) => ({ original: x.original, corrected: x.corrected, type: 'گرامر', why: x.why_fa, src: 'Sprechen' })));
      const rep: Report = { score, passed: score >= 60, level_estimate: r.level_estimate, criteria: crit, summary_fa: r.summary_fa, strengths_fa: r.strengths_fa, improvements_fa: r.improvements_fa, corrections: r.corrections, model_answer_de: r.model_answer_de, flu };
      setReport(rep); setScreen('report');
      exam?.onFinish({ score, max: 100, note: r.summary_fa });
    } catch (e: any) { setErr(describeAiError(e)); }
    finally { setBusy(false); busyRef.current = false; }
  };

  const goHub = () => { stopListening(); stopTalking(); setScreen('hub'); setMsgs([]); setErr(''); setInput(''); };

  const card = 'bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4';
  const chip = (on: boolean) => `px-3 py-1.5 rounded-full text-xs font-bold border transition ${on ? 'bg-[#1f5fbf] text-white border-[#1f5fbf]' : 'bg-white dark:bg-[#1b2029] border-[#dde1ea] dark:border-[#333b4a]'}`;
  const PrefsUI = (
    <div className={card + ' space-y-2.5'}>
      <div className="flex flex-wrap items-center gap-1.5">
        <button onClick={() => setPrefs({ autoplay: !prefs.autoplay })} className={chip(prefs.autoplay)}>🔊 پخش خودکار صدا</button>
        <button onClick={() => setPrefs({ handsFree: !prefs.handsFree })} className={chip(prefs.handsFree)}>🤝 دست‌آزاد</button>
        <button onClick={() => setPrefs({ autoSend: !prefs.autoSend })} className={chip(prefs.autoSend)}>⚡ ارسال خودکار</button>
        <button onClick={() => setNoHelp(!noHelp)} className={chip(noHelp)}>🚫 بدون کمک</button>
      </div>
      <div className="border-t border-slate-100 dark:border-slate-800 pt-2.5 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-[#5d6676]">☁️ صدای ابری (Worker TTS)</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ttsWorkerInput.trim() ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
            {ttsWorkerInput.trim() ? 'فعال' : 'غیرفعال (مرورگری)'}
          </span>
        </div>
        <div className="flex gap-1.5">
          <input
            dir="ltr"
            value={ttsWorkerInput}
            onChange={e => { setTtsWorkerInput(e.target.value); setTtsWorkerSaved(null); }}
            placeholder="https://wort-tts.peymansaberi20.workers.dev"
            className="flex-1 min-w-0 bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono outline-none"
          />
          <button
            onClick={() => {
              const v = ttsWorkerInput.trim().replace(/\/+$/, '');
              setTtsWorkerBase(v);
              setTtsWorkerInput(v);
              setTtsWorkerSaved(v ? 'ذخیره شد ✓' : 'پاک شد (حالت مرورگری)');
              setTimeout(() => setTtsWorkerSaved(null), 2500);
            }}
            className="px-3 py-2 rounded-xl bg-[#1f5fbf] text-white text-xs font-bold whitespace-nowrap"
          >ذخیره</button>
        </div>
        <div className="text-[10px] text-[#5d6676] leading-5">
          وقتی آدرس Worker ثبت شود، صدا از سرور ابری پخش می‌شود (باکیفیت، یکدست در همه دستگاه‌ها و iOS). خالی گذاشتن = صدای مرورگر.
          {ttsWorkerSaved && <span className="block text-emerald-600 font-bold mt-0.5">{ttsWorkerSaved}</span>}
        </div>
      </div>
    </div>
  );

  // Persona picker (free chat only). Exam personas are fixed per exam type.
  const PersonaPicker = (
    <div className="space-y-2">
      <div className="text-xs font-bold text-[#5d6676]">🎭 شخصیت هم‌صحبت را انتخاب کن:</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {PERSONAS.map(p => {
          const on = personaId === p.id;
          const ok = p.levels.includes(prefs.level);
          const btnCls = on
            ? 'bg-[#1f5fbf] text-white border-[#1f5fbf]'
            : 'bg-white dark:bg-[#1b2029] border-[#dde1ea] dark:border-[#333b4a] hover:border-[#1f5fbf]';
          const nameCls = on ? 'text-white/80' : 'text-[#5d6676]';
          const lvlCls = on ? 'text-white/70' : 'text-[#9aa3b2]';
          return (
            <button key={p.id} onClick={() => setPersona(p.id)} className={'text-right p-2.5 rounded-xl border transition ' + btnCls}>
              <div className="flex items-center gap-2">
                <span className="text-2xl shrink-0">{p.emoji}</span>
                <div className="min-w-0">
                  <div className="font-bold text-sm truncate">{p.name}</div>
                  <div className={'text-[10px] ' + nameCls}>{p.role}</div>
                  <div className={'text-[10px] ' + lvlCls}>{p.levels.join(' / ')}</div>
                </div>
              </div>
              {!ok && <div className={'text-[9px] mt-1 ' + (on ? 'text-white/70' : 'text-amber-600')}>سطح پیشنهادی: {p.levels.join('/')}</div>}
            </button>
          );
        })}
      </div>
    </div>
  );

  // Persona header inside chat
  const PersonaHeader = (
    <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-2xl shrink-0">{activePersona.emoji}</span>
        <div className="min-w-0">
          <div className="font-bold text-sm truncate">{activePersona.name}</div>
          <div className="text-[10px] text-[#5d6676]">{activePersona.role}</div>
        </div>
      </div>
      {screen === 'free' && (
        <button onClick={() => { stopTalking(); goHub(); setScreen('free_setup'); }} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[10px] font-bold shrink-0" title="تعویض شخصیت">
          <Repeat size={12} /> تعویض
        </button>
      )}
    </div>
  );

  const Chat = (
    <>
      {PersonaHeader}
      {(speaking || blocked) && (
        <div className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-bold ${blocked ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-800'}`}>
          <span>{blocked ? 'پخش صوتی مسدود شد؛ روی 🔊 بزن.' : '🔊 در حال صحبت…'}</span>
          {speaking && !limited && <button onClick={stopTalking} className="flex items-center gap-1 bg-white border rounded-lg px-2 py-1"><Square size={12} /> توقف</button>}
        </div>
      )}
      <div ref={listRef} className="space-y-3 max-h-[48vh] overflow-y-auto p-1" dir="ltr">
        {msgs.map((m, i) => (
          <div key={i} className={`flex flex-col ${m.who === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[88%] rounded-2xl px-4 py-2.5 ${m.who === 'user' ? 'bg-[#1f5fbf] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'}`}>
              <div className="flex items-center justify-between gap-3 mb-0.5">
                <span className="text-[10px] font-bold opacity-75">{m.who === 'ai' ? (isExam ? 'Prüfer/in' : activePersona.name) : 'Du'}</span>
                {m.who === 'ai' && (!limited || blocked) && <button onClick={() => sayDe(m.text)} className="text-xs"><Volume2 size={14} /></button>}
              </div>
              <div className="font-sans text-base leading-relaxed"><ClickableWords text={m.text} onWord={setLookup} /></div>
            </div>
            {m.fb && !limited && (
              <div className="max-w-[92%] mt-1 rounded-xl border bg-white dark:bg-[#141923] px-3 py-2 text-sm space-y-1.5" dir="rtl">
                {m.fb.ok ? <div className="text-emerald-700 font-bold text-xs">✓ کاملاً درست و طبیعی</div> : (
                  <>
                    <div dir="ltr" className="font-sans font-bold text-emerald-700 text-left">✅ <ClickableWords text={m.fb.corrected} onWord={setLookup} /></div>
                    {m.fb.issues.map((x, k) => (
                      <div key={k} className="text-xs leading-6">
                        <span dir="ltr" className="font-sans"><s className="text-rose-600"><ClickableWords text={x.wrong} onWord={setLookup} /></s> → <b className="text-emerald-700"><ClickableWords text={x.correct} onWord={setLookup} /></b></span>
                        <div className="text-[#5d6676]">{x.why_fa}</div>
                        <button onClick={() => { addErrors([{ original: x.wrong, corrected: x.correct, type: 'گرامر مکالمه', why: x.why_fa, src: 'Sprechen' }]); onShowToast('خطا به دفترچه خطاها افزوده شد ✓'); }}
                          className="mt-1 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold flex items-center gap-1">
                          <PlusCircle size={12} /> افزودن این خطا به دفتر خطاها
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="flex justify-start"><div className="bg-slate-100 dark:bg-slate-800 rounded-2xl px-4 py-2 text-sm animate-pulse" dir="rtl">در حال پاسخ…</div></div>}
      </div>
      {err && <div className="p-3 rounded-xl bg-red-50 text-sm text-red-700">{err}</div>}
      <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <button onClick={() => startListening()} disabled={busy && !listening} className={`p-3 rounded-xl text-white ${listening ? 'bg-red-600 animate-pulse' : 'bg-rose-600 hover:bg-rose-700'}`}>
          {listening ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
        <input type="text" dir="ltr" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void sendMessage(); }}
          placeholder={listening ? 'Ich höre zu …' : 'Antworte auf Deutsch …'}
          className="flex-1 min-w-0 bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-base font-sans outline-none" />
        <button onClick={() => void sendMessage()} disabled={busy || !input.trim()} className="bg-[#1f5fbf] text-white px-4 py-3 rounded-xl"><Send size={18} /></button>
      </div>
    </>
  );

  return (
    <div className="space-y-4 text-right max-w-3xl mx-auto pb-10" dir="rtl">
      {screen === 'hub' && (
        <div className="space-y-3">
          {PrefsUI}
          <div className={card + ' flex items-center justify-between gap-3'}>
            <div className="flex items-center gap-3"><span className="text-3xl">💬</span><div><h3 className="font-extrabold text-base">Freies Sprechen (مکالمه آزاد)</h3><p className="text-[13px] text-[#5d6676]">گفتگو با میکروفون، تصحیح لحظه‌ای و شخصیت ثابت</p></div></div>
            <button onClick={() => setScreen('free_setup')} className="bg-[#1f5fbf] text-white px-4 py-2.5 rounded-xl font-bold text-sm">شروع ▶</button>
          </div>
          <div className={card + ' flex items-center justify-between gap-3'}>
            <div className="flex items-center gap-3"><span className="text-3xl">🎓</span><div><h3 className="font-extrabold text-base">Prüfungsmodus (شبیه‌ساز آزمون Goethe / telc)</h3><p className="text-[13px] text-[#5d6676]">۳ بخش آزمون واقعی، تایمر و ارزیابی استاندارد</p></div></div>
            <button onClick={() => setScreen('exam_setup')} className="bg-emerald-600 text-white px-4 py-2.5 rounded-xl font-bold text-sm">تنظیم ▶</button>
          </div>
          <button onClick={() => { goHub(); onClose(); }} className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">↩ بازگشت</button>
        </div>
      )}

      {screen === 'free_setup' && (
        <div className={card + ' space-y-4'}>
          <div className="flex items-center justify-between"><h3 className="font-extrabold">موضوع و سطح گفتگو</h3><button onClick={goHub} className="px-3 py-1 rounded-xl bg-slate-100 text-xs font-bold">بازگشت</button></div>
          <select value={topic} onChange={e => setTopic(e.target.value)} className="w-full bg-slate-50 dark:bg-[#141923] border rounded-xl px-3 py-2.5 text-sm font-bold">{FREE_TOPICS.map(t => <option key={t} value={t}>{t}</option>)}</select>
          <div className="flex gap-1.5">{(['A2', 'B1', 'B2'] as Level[]).map(l => <button key={l} onClick={() => setPrefs({ level: l })} className={chip(prefs.level === l) + ' flex-1'}>{l}</button>)}</div>
          {PersonaPicker}
          <button onClick={() => void startFree()} className="w-full bg-[#1f5fbf] text-white py-3 rounded-xl font-bold text-sm">شروع گفتگو 🎙️</button>
        </div>
      )}

      {screen === 'free' && (
        <div className={card + ' space-y-3'}>
          <div className="flex items-center justify-between">
            <b className="text-sm">💬 {topicDe(topic)} · {prefs.level}</b>
            <div className="flex gap-1.5">
              <button onClick={() => void evaluate()} disabled={busy} className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold">📊 پایان و ارزیابی</button>
              <button onClick={goHub} className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">خروج</button>
            </div>
          </div>
          {Chat}
        </div>
      )}

      {screen === 'exam_setup' && (
        <div className={card + ' space-y-4'}>
          <div className="flex items-center justify-between"><h3 className="font-extrabold">تنظیمات آزمون شفاهی (آلمان)</h3><button onClick={goHub} className="px-3 py-1 rounded-xl bg-slate-100 text-xs font-bold">بازگشت</button></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-[13px] font-bold">فرمت آزمون
              <select value={examType} onChange={e => setExamType(e.target.value as ExamType)} className="mt-1 w-full bg-slate-50 dark:bg-[#141923] border rounded-xl px-3 py-2.5 text-sm font-bold">
                <option value="Goethe">Goethe-Zertifikat</option><option value="Telc">telc Deutsch</option><option value="ÖSD">ÖSD</option><option value="Zertifikat">Zertifikat Deutsch</option>
              </select></label>
            <div className="text-[13px] font-bold">سطح
              <div className="mt-1">
                <LevelChips value={examLevel} onChange={l => setExamLevel(l as Level)} levels={['A1', 'A2', 'B1', 'B2', 'C1']} />
              </div>
            </div>
          </div>
          <div className="text-xs text-[#5d6676] bg-slate-50 dark:bg-[#141923] rounded-xl p-2">
            📋 شخصیت ممتحن به‌صورت خودکار بر اساس نوع آزمون انتخاب می‌شود: {EXAM_PERSONAS[examType].emoji} {EXAM_PERSONAS[examType].name} — {EXAM_PERSONAS[examType].role}
          </div>
          <button onClick={() => void startExam()} className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold text-sm">شروع شبیه‌ساز آزمون 🚀</button>
        </div>
      )}

      {screen === 'exam' && (
        <div className={card + ' space-y-3'}>
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1 min-w-0">
              <b className="text-sm">🎓 {examType} {examLevel} — Teil {partIdx + 1} von {parts.length || 3}</b>
              <p className="text-base font-extrabold font-sans" dir="ltr"><ClickableWords text={parts[partIdx]?.task_de || ''} onWord={setLookup} /></p>
              {!limited && (showFa
                ? <p className="text-xs text-[#9aa3b2]">{parts[partIdx]?.task_fa}</p>
                : <button onClick={() => setShowFa(true)} className="text-xs font-bold text-[#1f5fbf]">👁 نمایش فارسی</button>)}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="px-3 py-1 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 text-amber-800 text-xs font-mono font-bold flex items-center gap-1">
                <Clock size={13} /> {formatTime(partSecondsLeft)}
              </span>
              <button onClick={nextPart} disabled={busy} className="px-3 py-1.5 rounded-xl bg-[#1f5fbf] text-white text-xs font-bold">{partIdx >= parts.length - 1 ? 'پایان آزمون ✓' : 'بخش بعدی ◀'}</button>
            </div>
          </div>
          {Chat}
        </div>
      )}

      {report && screen === 'report' && (
        <div className={card + ' space-y-4 text-right'}>
          <div className="text-center space-y-1 border-b pb-4">
            <span className="text-3xl">🏆</span>
            <h3 className="font-extrabold text-base">کارنامه ارزیابی مکالمه</h3>
            <div className="text-2xl font-black text-emerald-600">{report.score}/100 ({report.passed ? 'قبول ✓' : 'تلاش مجدد'})</div>
            {report.level_estimate && <div className="text-xs text-[#5d6676]">سطح تخمینی: {report.level_estimate}</div>}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs font-bold">
            {([['task', 'انجام تکلیف'], ['interaction', 'تعامل و روانی'], ['vocab', 'واژگان'], ['grammar', 'گرامر']] as const).map(([k, l]) => (
              <div key={k} className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 flex justify-between"><span>{l}</span><span>{report.criteria[k]}/25</span></div>
            ))}
          </div>
          <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 text-xs space-y-1">
            <div className="font-extrabold text-indigo-800 dark:text-indigo-300">⏱ سنجش روانی گفتار (از زمان‌بندی ضبط)</div>
            {report.flu ? (
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <span>تعداد کلمه: <b dir="ltr">{report.flu.words}</b></span>
                <span>سرعت: <b dir="ltr">{report.flu.wpm ? `${report.flu.wpm} wpm` : '—'}</b></span>
                <span>مکث‌های بلند (&gt;۱٫۴ ثانیه): <b dir="ltr">{report.flu.pauses}</b></span>
                <span>طولانی‌ترین مکث: <b dir="ltr">{report.flu.longest}s</b></span>
                <span className="col-span-2">پرکننده‌ها (äh, also, halt…): <b dir="ltr">{report.flu.fillers}{report.flu.fillerList.length ? ` — ${report.flu.fillerList.join(', ')}` : ''}</b></span>
              </div>
            ) : <div>پاسخ‌ها تایپ شده بودند؛ روانی گفتار قابل اندازه‌گیری نیست.</div>}
            <div className="text-[10px] text-[#5d6676]">تشخیص گفتار گاهی «äh» را حذف می‌کند؛ تعداد پرکننده‌ها حداقل مقدار است. تلفظ (Aussprache) از روی صدا سنجیده نمی‌شود.</div>
          </div>
          <p className="text-sm leading-7">{report.summary_fa}</p>
          {report.strengths_fa.length > 0 && <div className="text-sm"><b className="text-emerald-700">✅ نقاط قوت</b><ul className="list-disc pr-5 leading-7">{report.strengths_fa.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
          {report.improvements_fa.length > 0 && <div className="text-sm"><b className="text-amber-700">⚠️ نقاط قابل بهبود</b><ul className="list-disc pr-5 leading-7">{report.improvements_fa.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
          {report.corrections.length > 0 && <div className="space-y-2">{report.corrections.map((c, i) => (
            <div key={i} className="p-2.5 rounded-xl border text-xs space-y-1">
              <div dir="ltr" className="font-sans"><s className="text-rose-600"><ClickableWords text={c.original} onWord={setLookup} /></s> → <b className="text-emerald-700"><ClickableWords text={c.corrected} onWord={setLookup} /></b></div>
              <div className="text-[#5d6676]">{c.why_fa}</div>
            </div>))}</div>}
          {report.model_answer_de && (
            <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-[#1f5fbf]">🎧 پاسخ نمونه استاندارد (Model Answer):</span>
                <button onClick={() => sayDe(report.model_answer_de)} className="px-3 py-1 rounded-lg bg-[#1f5fbf] text-white text-xs font-bold flex items-center gap-1"><Volume2 size={14} /> پخش صوتی پاسخ نمونه</button>
              </div>
              <p className="font-sans text-sm text-slate-800 dark:text-slate-100 text-left" dir="ltr"><ClickableWords text={report.model_answer_de} onWord={setLookup} /></p>
            </div>
          )}
          {!exam && <button onClick={goHub} className="w-full bg-[#1f5fbf] text-white py-3 rounded-xl font-bold text-sm">بازگشت به منو 🔄</button>}
        </div>
      )}

      {/* پاپ‌آپ واژهٔ لمس‌شده — مشترک در چت، تصحیح‌ها، تکلیف آزمون و کارنامه */}
      {lookup && (
        <WordLookupModal
          word={lookup}
          level={isExam ? examLevel : prefs.level}
          cat="Sprechen"
          onQuickAddWord={onQuickAddWord}
          words={words}
          onViewWord={onViewWord}
          onClose={() => setLookup(null)}
        />
      )}
    </div>
  );
};
