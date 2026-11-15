/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Send, Square, Volume2 } from 'lucide-react';
import { speak, stopSpeaking } from '../utils/audio';
import { generateWithGemini, parseAI } from '../utils/ai';
import { describeAiError } from '../utils/aiProvider';
import { addErrors } from '../utils/errorBook';

interface SprechenTrainerProps {
  onClose: () => void;
  onShowToast: (msg: string, isErr?: boolean) => void;
}

type Level = 'A1' | 'A2' | 'B1' | 'B2';
type ExamType = 'Goethe' | 'Telc' | 'ÖSD' | 'EPD';
interface Fb { ok: boolean; corrected: string; issues: { wrong: string; correct: string; why_fa: string }[]; better?: string; tip_fa?: string }
interface Msg { who: 'ai' | 'user'; text: string; fb?: Fb; part?: number }
interface Part { type: 'dialog' | 'monolog'; title_de: string; title_fa: string; task_de: string; task_fa: string; points: string[]; minutes: number; opening: string }
interface Report {
  score: number; passed: boolean; level_estimate: string;
  criteria: { task: number; interaction: number; vocab: number; grammar: number };
  summary_fa: string; strengths_fa: string[]; improvements_fa: string[];
  corrections: { original: string; corrected: string; why_fa: string }[]; model_answer_de: string;
}
interface Prefs { autoplay: boolean; rate: number; level: Level; autoSend: boolean; handsFree: boolean }

const FREE_TOPICS = [
  'Reisen und Urlaub (سفر و تعطیلات)', 'Arbeit und Beruf (کار و شغل)', 'Bewerbungsgespräch (مصاحبهٔ شغلی)',
  'Wohnen und Haushalt (مسکن و خانه‌داری)', 'Wohnungssuche (جست‌وجوی خانه)', 'Beim Arzt (نزد پزشک)',
  'Beim Amt (در اداره)', 'Gesundheit und Sport (سلامتی و ورزش)', 'Essen und Trinken (خوراک و نوشیدنی)',
  'Medien und Internet (رسانه و اینترنت)', 'Umwelt und Natur (محیط زیست)', 'Freizeit und Hobbys (فراغت و سرگرمی)',
  'Bildung und Lernen (آموزش و یادگیری)', 'Einkaufen und Geld (خرید و پول)', 'Feste und Traditionen (جشن‌ها و سنت‌ها)',
  'Stadt und Verkehr (شهر و حمل‌ونقل)', 'Freunde und Familie (دوستان و خانواده)', 'Zukunftspläne (برنامه‌های آینده)',
  'Freies Gespräch (مکالمهٔ آزاد)'
];
const PREF_KEY = 'wb_sprechen_prefs';
const DEFAULT_PREFS: Prefs = { autoplay: true, rate: 0.95, level: 'B1', autoSend: true, handsFree: false };
const loadPrefs = (): Prefs => { try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; } catch { return DEFAULT_PREFS; } };
const topicDe = (t: string) => t.replace(/\s*\(.*\)\s*$/, '');
const obj = (res: string): any => { try { const a = parseAI(res); return (Array.isArray(a) ? a[0] : a) || {}; } catch { return {}; } };
const arr = (v: any): any[] => (Array.isArray(v) ? v : []);
const str = (v: any) => (v == null ? '' : String(v));
const num = (v: any, max: number) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));

/** Unlocks audio playback inside a user gesture (browsers block audio started later from async code). */
const unlockAudio = () => {
  try { const a = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='); void a.play().catch(() => {}); } catch { /* ignore */ }
  try {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (AC) { const c = new AC(); void c.resume?.(); const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, 22050); s.connect(c.destination); s.start(0); setTimeout(() => { try { void c.close(); } catch { /* ignore */ } }, 200); }
  } catch { /* ignore */ }
  try { if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; window.speechSynthesis.speak(u); } } catch { /* ignore */ }
};

const defaultParts = (type: ExamType, level: Level): Part[] => [
  { type: 'dialog', title_de: 'Teil 1: Kontaktaufnahme', title_fa: 'بخش ۱: آشنایی و گفتگوی کوتاه', task_de: 'Stellen Sie sich vor und beantworten Sie Fragen zu Ihrer Person (Herkunft, Wohnort, Beruf, Familie, Hobbys).', task_fa: 'خودت را معرفی کن و به سؤال‌های شخصی جواب بده.', points: ['Name und Herkunft', 'Wohnort und Beruf', 'Familie und Hobbys'], minutes: 3, opening: 'Guten Tag! Schön, dass Sie da sind. Erzählen Sie mir bitte etwas über sich.' },
  { type: 'monolog', title_de: 'Teil 2: Ein Thema präsentieren', title_fa: 'بخش ۲: ارائهٔ یک موضوع', task_de: 'Präsentieren Sie das Thema „Mein Lieblingshobby und warum es wichtig ist“. Nennen Sie Beispiele aus Ihrem Leben.', task_fa: 'دربارهٔ «سرگرمی مورد علاقه‌ام و اهمیتش» صحبت کن و مثال بزن.', points: ['Einleitung', 'Eigene Erfahrungen', 'Vor- und Nachteile', 'Schluss'], minutes: 4, opening: 'Bitte beginnen Sie mit Ihrer Präsentation.' },
  { type: 'dialog', title_de: 'Teil 3: Gemeinsam etwas planen', title_fa: 'بخش ۳: برنامه‌ریزی مشترک', task_de: `Planen Sie gemeinsam einen Ausflug am Wochenende (${type}, ${level}). Machen Sie Vorschläge und reagieren Sie auf die Ideen Ihres Partners.`, task_fa: 'با شریک گفتگو یک گردش آخر هفته را برنامه‌ریزی کنید؛ پیشنهاد بده و به ایدهٔ او واکنش نشان بده.', points: ['Ort', 'Zeit und Treffpunkt', 'Verkehrsmittel', 'Essen'], minutes: 4, opening: 'Wir wollen am Wochenende gemeinsam einen Ausflug machen. Wohin möchten Sie gern fahren?' }
];

export const SprechenTrainer: React.FC<SprechenTrainerProps> = ({ onClose, onShowToast }) => {
  const [screen, setScreen] = useState<'hub' | 'free_setup' | 'free' | 'exam_setup' | 'exam' | 'report'>('hub');
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  const [topic, setTopic] = useState(FREE_TOPICS[0]);
  const [msgs, setMsgsState] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [listening, setListening] = useState(false);
  const [examType, setExamType] = useState<ExamType>('ÖSD');
  const [examLevel, setExamLevel] = useState<Level>('B1');
  const [examVariant, setExamVariant] = useState<'zb1' | 'zdoe_b1'>('zdoe_b1');
  const [parts, setParts] = useState<Part[]>([]);
  const [partIdx, setPartIdx] = useState(0);
  const [showFa, setShowFa] = useState(true);
  const [report, setReport] = useState<Report | null>(null);

  const msgsRef = useRef<Msg[]>([]);
  const busyRef = useRef(false);
  const prefsRef = useRef(prefs);
  const screenRef = useRef(screen);
  const speakToken = useRef(0);
  const recRef = useRef<any>(null);
  const finalRef = useRef('');
  const interimRef = useRef('');
  const silenceRef = useRef<any>(null);
  const sendRef = useRef<(t?: string) => void>(() => {});
  const listRef = useRef<HTMLDivElement>(null);
  prefsRef.current = prefs;
  screenRef.current = screen;

  const SR: any = typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;
  const setMsgs = (m: Msg[]) => { msgsRef.current = m; setMsgsState(m); };
  const setPrefs = (p: Partial<Prefs>) => { const n = { ...prefsRef.current, ...p }; setPrefsState(n); try { localStorage.setItem(PREF_KEY, JSON.stringify(n)); } catch { /* ignore */ } };
  const isExam = screen === 'exam';
  const level: Level = isExam ? examLevel : prefs.level;

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs, busy]);
  useEffect(() => () => { speakToken.current++; stopSpeaking(); try { recRef.current?.abort?.(); } catch { /* ignore */ } clearTimeout(silenceRef.current); }, []);

  // ---------- voice output ----------
  const stopTalking = () => { speakToken.current++; stopSpeaking(); setSpeaking(false); };
  const sayDe = (text: string, onDone?: () => void) => {
    if (!text) return;
    const token = ++speakToken.current;
    stopSpeaking();
    setSpeaking(true); setBlocked(false);
    const rate = prefsRef.current.rate;
    const done = () => { if (token !== speakToken.current) return; setSpeaking(false); onDone?.(); };
    const fail = () => { if (token !== speakToken.current) return; setSpeaking(false); setBlocked(true); };
    speak(text, { rate, onEnd: done, onErr: () => { if (token === speakToken.current) speak(text, { rate, forceBrowser: true, onEnd: done, onErr: fail }); } });
  };
  const aiSays = (text: string) => { if (prefsRef.current.autoplay) sayDe(text, prefsRef.current.handsFree ? () => startListening() : undefined); };

  // ---------- voice input ----------
  const stopListening = () => { clearTimeout(silenceRef.current); try { recRef.current?.stop?.(); } catch { /* ignore */ } };
  function startListening() {
    unlockAudio();
    if (!SR) { onShowToast('این مرورگر تشخیص گفتار ندارد (Chrome/Safari را امتحان کن؛ در برنامهٔ نصب‌شده ممکن است کار نکند). می‌توانی تایپ کنی.', true); return; }
    if (recRef.current) { stopListening(); return; }
    if (busyRef.current) return;
    stopTalking();
    const rec = new SR();
    rec.lang = 'de-DE'; rec.interimResults = true; rec.continuous = true; rec.maxAlternatives = 1;
    finalRef.current = ''; interimRef.current = '';
    const gap = screenRef.current === 'exam' ? 4500 : 2600;
    rec.onstart = () => setListening(true);
    rec.onresult = (e: any) => {
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
    rec.onerror = (e: any) => {
      const code = e?.error;
      if (code === 'no-speech') onShowToast('صدایی شنیده نشد؛ نزدیک‌تر صحبت کن و دوباره بزن.', true);
      else if (code === 'not-allowed' || code === 'service-not-allowed') onShowToast('اجازهٔ میکروفون داده نشده است (تنظیمات مرورگر ← میکروفون).', true);
      else if (code === 'audio-capture') onShowToast('میکروفونی پیدا نشد.', true);
      else if (code !== 'aborted') onShowToast('خطا در تشخیص گفتار: ' + code, true);
    };
    rec.onend = () => {
      clearTimeout(silenceRef.current);
      setListening(false); recRef.current = null;
      const text = (finalRef.current || interimRef.current).trim();
      if (!text) return;
      setInput(text);
      if (prefsRef.current.autoSend && screenRef.current !== 'exam') sendRef.current(text);
    };
    recRef.current = rec;
    try { rec.start(); } catch { setListening(false); recRef.current = null; }
  }

  // ---------- AI helpers ----------
  const ctxOf = (list: Msg[], who1 = 'Partner', who2 = 'Learner') => list.slice(-14).map(m => `${m.who === 'ai' ? who1 : who2}: ${m.text}`).join('\n');
  const sttNote = 'The learner\'s text may come from speech recognition: it has no punctuation or capitalisation — NEVER treat that as an error.';

  const startFree = async () => {
    unlockAudio();
    setScreen('free'); setReport(null); setErr(''); setMsgs([]); setBusy(true); busyRef.current = true;
    try {
      const res = await generateWithGemini(`You are a friendly German conversation partner for a Persian-speaking learner at level ${prefs.level}. Topic: "${topicDe(topic)}". Open the conversation: one short greeting plus ONE easy question, in German at level ${prefs.level}. Return ONLY JSON: {"reply":"..."}`, { json: true, timeoutMs: 30000, retries: 1 });
      const reply = str(obj(res).reply).trim();
      if (!reply) throw new Error('پاسخ نامعتبر از هوش مصنوعی.');
      setMsgs([{ who: 'ai', text: reply }]);
      aiSays(reply);
    } catch (e: any) { setErr(describeAiError(e)); }
    finally { setBusy(false); busyRef.current = false; }
  };

  const sendMessage = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || busyRef.current) return;
    unlockAudio(); stopListening(); stopTalking();
    const exam = screenRef.current === 'exam';
    const part = exam ? parts[partIdx] : undefined;
    const base = [...msgsRef.current, { who: 'user' as const, text, part: exam ? partIdx : undefined }];
    setMsgs(base); setInput(''); setBusy(true); busyRef.current = true; setErr('');
    try {
      if (!exam) {
        const res = await generateWithGemini(`You are a supportive German conversation partner for a Persian-speaking learner at level ${prefs.level}. Topic: "${topicDe(topic)}". ${sttNote}
Conversation so far:
${ctxOf(base)}

Task: (1) answer the learner's LAST message naturally in 1-3 German sentences at level ${prefs.level} and end with a question that keeps the talk going; (2) check the learner's LAST message: grammar, case, word order, verb forms, prepositions, word choice and naturalness. Do not over-correct; report only real errors. Every "wrong" must be an exact substring of the learner's message.
Return ONLY JSON: {"reply":"...","ok":true,"corrected":"learner's last message corrected (identical if fine)","issues":[{"wrong":"","correct":"","why_fa":"short Persian explanation naming the rule"}],"better":"one more natural or more advanced way to say it (German, optional)","tip_fa":"one short Persian tip (optional)"}`, { json: true, timeoutMs: 35000, retries: 1 });
        const r = obj(res);
        const reply = str(r.reply).trim();
        if (!reply) throw new Error('پاسخ نامعتبر از هوش مصنوعی.');
        const issues = arr(r.issues).map((i: any) => ({ wrong: str(i.wrong), correct: str(i.correct), why_fa: str(i.why_fa) })).filter(i => i.wrong || i.correct);
        const fb: Fb = { ok: issues.length === 0, corrected: str(r.corrected) || text, issues, better: str(r.better), tip_fa: str(r.tip_fa) };
        if (issues.length) addErrors([{ original: text, corrected: fb.corrected, type: 'گرامر', why: issues.map(i => i.why_fa).join(' | ') }]);
        const next = [...base.slice(0, -1), { ...base[base.length - 1], fb }, { who: 'ai' as const, text: reply }];
        setMsgs(next); aiSays(reply);
      } else {
        const role = part?.type === 'monolog'
          ? 'The candidate just gave (part of) a presentation. React briefly and ask ONE natural follow-up question (Nachfrage) about what they said.'
          : 'You are the exam partner in a dialogue. React to the candidate, make or discuss a suggestion, and ask for their opinion. Keep it balanced like a real partner.';
        const res = await generateWithGemini(`You are a friendly but professional German oral-exam partner/examiner (${examType} ${examLevel}). Current part: "${part?.title_de}" — task: ${part?.task_de}
${role} Speak in 1-3 short German sentences at level ${examLevel}. Do NOT correct the candidate and do not give feedback now (this is the exam simulation). ${sttNote}
Conversation:
${ctxOf(base.filter(m => m.part === partIdx || m.part === undefined), 'Examiner', 'Candidate')}
Return ONLY JSON: {"reply":"..."}`, { json: true, timeoutMs: 30000, retries: 1 });
        const reply = str(obj(res).reply).trim();
        if (!reply) throw new Error('پاسخ نامعتبر از هوش مصنوعی.');
        setMsgs([...base, { who: 'ai', text: reply, part: partIdx }]); aiSays(reply);
      }
    } catch (e: any) { setErr(describeAiError(e)); }
    finally { setBusy(false); busyRef.current = false; }
  };
  sendRef.current = t => { void sendMessage(t); };

  // ---------- exam ----------
  const startExam = async () => {
    unlockAudio();
    setScreen('exam'); setReport(null); setErr(''); setMsgs([]); setPartIdx(0); setBusy(true); busyRef.current = true;
    let list: Part[] = [];
    try {
      const res = await generateWithGemini(`Design a speaking-exam simulation for ${examType} at level ${examLevel}${examType === 'ÖSD' ? ` (variant ${examVariant === 'zdoe_b1' ? 'ZDÖ B1 – Austrian integration exam' : 'ÖSD Zertifikat B1 (ZB1)'})` : ''}. Use the real official structure of this exam if you know it (e.g. Kontaktaufnahme / Gemeinsam etwas planen / Ein Thema präsentieren / Reagieren), otherwise use exactly 3 parts of that kind. Realistic everyday topics for someone living in Austria. Tasks in German at level ${examLevel}.
Return ONLY JSON: {"parts":[{"type":"dialog|monolog","title_de":"Teil 1: ...","title_fa":"بخش ۱: ...","task_de":"task text in German","task_fa":"Persian translation of the task","points":["Leitpunkt 1","Leitpunkt 2","Leitpunkt 3"],"minutes":3,"opening":"first sentence the examiner says, in German"}]} — exactly 3 parts.`, { json: true, timeoutMs: 40000, retries: 1 });
      list = arr(obj(res).parts).slice(0, 3).map((p: any) => ({
        type: p.type === 'monolog' ? 'monolog' : 'dialog', title_de: str(p.title_de), title_fa: str(p.title_fa),
        task_de: str(p.task_de), task_fa: str(p.task_fa), points: arr(p.points).map(str), minutes: Number(p.minutes) || 3, opening: str(p.opening)
      } as Part)).filter(p => p.task_de);
      if (list.length < 3) throw new Error('short');
    } catch {
      list = defaultParts(examType, examLevel);
      onShowToast('سناریوی هوش مصنوعی ساخته نشد؛ سناریوی استاندارد داخلی استفاده شد.', true);
    }
    setParts(list); setPartIdx(0);
    const first = list[0].opening || list[0].task_de;
    setMsgs([{ who: 'ai', text: first, part: 0 }]);
    setBusy(false); busyRef.current = false;
    aiSays(first);
  };

  const nextPart = () => {
    stopListening(); stopTalking();
    if (partIdx >= parts.length - 1) { void evaluate(); return; }
    const i = partIdx + 1;
    setPartIdx(i);
    const op = parts[i].opening || parts[i].task_de;
    setMsgs([...msgsRef.current, { who: 'ai', text: op, part: i }]);
    aiSays(op);
  };

  const evaluate = async () => {
    const list = msgsRef.current;
    if (!list.some(m => m.who === 'user')) { onShowToast('هنوز چیزی نگفته‌ای.', true); return; }
    unlockAudio(); stopListening(); stopTalking();
    setBusy(true); busyRef.current = true; setErr('');
    const exam = screenRef.current === 'exam';
    try {
      const res = await generateWithGemini(`You are a strict but fair German examiner (${exam ? `${examType} ${examLevel} speaking exam` : `free conversation practice, level ${prefs.level}, topic "${topicDe(topic)}"`}). Evaluate ONLY the candidate's lines in this transcript. ${sttNote} Pronunciation cannot be judged from text — do not mention it.
Criteria (each 0-25): task = task fulfilment/content; interaction = reacting, fluency, coherence; vocab = range and accuracy of vocabulary; grammar = accuracy and variety of structures.
${exam ? 'Parts: ' + parts.map((p, i) => `${i + 1}) ${p.title_de}: ${p.task_de}`).join(' | ') : ''}
Transcript:
${list.map(m => `${m.who === 'ai' ? 'Examiner' : 'Candidate'}${m.part !== undefined ? ` [Teil ${m.part + 1}]` : ''}: ${m.text}`).join('\n')}
Return ONLY JSON: {"score":0,"passed":true,"level_estimate":"B1","criteria":{"task":0,"interaction":0,"vocab":0,"grammar":0},"summary_fa":"3-4 sentences in Persian","strengths_fa":["..."],"improvements_fa":["top 3 things to improve, Persian"],"corrections":[{"original":"candidate's sentence with error","corrected":"corrected","why_fa":"Persian rule"}],"model_answer_de":"a model answer (German, 4-6 sentences) for the candidate's weakest part"}
score = sum of the four criteria (0-100); passed = score >= 60.`, { json: true, timeoutMs: 60000, retries: 1 });
      const r = obj(res);
      const c = r.criteria || {};
      const crit = { task: num(c.task, 25), interaction: num(c.interaction, 25), vocab: num(c.vocab, 25), grammar: num(c.grammar, 25) };
      const score = crit.task + crit.interaction + crit.vocab + crit.grammar;
      const corrections = arr(r.corrections).map((x: any) => ({ original: str(x.original), corrected: str(x.corrected), why_fa: str(x.why_fa) })).filter(x => x.original && x.corrected);
      if (corrections.length) addErrors(corrections.map(x => ({ original: x.original, corrected: x.corrected, type: 'گرامر', why: x.why_fa })));
      setReport({ score, passed: score >= 60, level_estimate: str(r.level_estimate), criteria: crit, summary_fa: str(r.summary_fa), strengths_fa: arr(r.strengths_fa).map(str), improvements_fa: arr(r.improvements_fa).map(str), corrections, model_answer_de: str(r.model_answer_de) });
      setScreen('report');
    } catch (e: any) { setErr(describeAiError(e)); }
    finally { setBusy(false); busyRef.current = false; }
  };

  const goHub = () => { stopListening(); stopTalking(); setScreen('hub'); setMsgs([]); setErr(''); setInput(''); };

  // ---------- UI helpers ----------
  const card = 'bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4';
  const chip = (on: boolean) => `px-3 py-1.5 rounded-full text-xs font-bold border transition ${on ? 'bg-[#1f5fbf] text-white border-[#1f5fbf]' : 'bg-white dark:bg-[#1b2029] border-[#dde1ea] dark:border-[#333b4a]'}`;
  const Prefs = (
    <div className={card + ' space-y-2.5'}>
      <div className="flex flex-wrap items-center gap-1.5">
        <button onClick={() => setPrefs({ autoplay: !prefs.autoplay })} className={chip(prefs.autoplay)}>🔊 پخش خودکار صدا</button>
        <button onClick={() => setPrefs({ handsFree: !prefs.handsFree })} className={chip(prefs.handsFree)}>🤝 دست‌آزاد (بعد از صدای او، میکروفون)</button>
        <button onClick={() => setPrefs({ autoSend: !prefs.autoSend })} className={chip(prefs.autoSend)}>⚡ ارسال خودکار بعد از صحبت</button>
      </div>
      <label className="flex items-center gap-2 text-xs font-bold">
        سرعت صدا:
        <select value={prefs.rate} onChange={e => setPrefs({ rate: Number(e.target.value) })} className="bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-lg px-2 py-1">
          {[0.75, 0.85, 0.95, 1.05, 1.2].map(v => <option key={v} value={v}>{v}x</option>)}
        </select>
      </label>
    </div>
  );

  const Chat = (
    <>
      {(speaking || blocked) && (
        <div className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-bold ${blocked ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200'}`}>
          <span>{blocked ? 'پخش خودکار توسط مرورگر مسدود شد؛ روی 🔊 کنار پیام بزن.' : '🔊 در حال صحبت…'}</span>
          {speaking && <button onClick={stopTalking} className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1"><Square size={12} /> توقف</button>}
        </div>
      )}
      <div ref={listRef} className="space-y-3 max-h-[52vh] overflow-y-auto p-1" dir="ltr">
        {msgs.map((m, i) => (
          <div key={i} className={`flex flex-col ${m.who === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[88%] rounded-2xl px-4 py-2.5 ${m.who === 'user' ? 'bg-[#1f5fbf] text-white rounded-se-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-ss-sm'}`}>
              <div className="flex items-center justify-between gap-3 mb-0.5">
                <span className="text-[10px] font-bold opacity-75">{m.who === 'ai' ? (isExam ? 'Prüfer/in' : 'Partner (AI)') : 'Du'}</span>
                {m.who === 'ai' && <button onClick={() => sayDe(m.text)} className="text-xs" aria-label="پخش"><Volume2 size={14} /></button>}
              </div>
              <div className="font-sans text-base leading-relaxed">{m.text}</div>
            </div>
            {m.fb && (
              <div className="max-w-[92%] mt-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#141923] px-3 py-2 text-sm space-y-1.5" dir="rtl">
                {m.fb.ok ? <div className="text-emerald-700 dark:text-emerald-300 font-bold text-xs">✓ درست و طبیعی</div> : (
                  <>
                    <div dir="ltr" className="font-sans font-bold text-emerald-700 dark:text-emerald-300 text-left">✅ {m.fb.corrected}</div>
                    {m.fb.issues.map((x, k) => (
                      <div key={k} className="text-xs leading-6">
                        <span dir="ltr" className="font-sans"><s className="text-rose-600">{x.wrong}</s> → <b className="text-emerald-700 dark:text-emerald-300">{x.correct}</b></span>
                        <div className="text-[#5d6676] dark:text-[#a3adbd]">{x.why_fa}</div>
                      </div>
                    ))}
                  </>
                )}
                {m.fb.better && <div dir="ltr" className="font-sans text-xs text-indigo-700 dark:text-indigo-300 text-left">💡 {m.fb.better}</div>}
                {m.fb.tip_fa && <div className="text-xs text-[#5d6676] dark:text-[#a3adbd]">{m.fb.tip_fa}</div>}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="flex justify-start"><div className="bg-slate-100 dark:bg-slate-800 rounded-2xl px-4 py-2 text-sm animate-pulse" dir="rtl">در حال پاسخ…</div></div>}
      </div>
      {err && (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300 leading-7">
          {err}
          <button onClick={() => { setErr(''); if (msgsRef.current.length === 0) void (isExam ? startExam() : startFree()); else if (msgsRef.current[msgsRef.current.length - 1].who === 'user') { const last = msgsRef.current[msgsRef.current.length - 1].text; setMsgs(msgsRef.current.slice(0, -1)); void sendMessage(last); } }} className="mr-2 underline font-bold">تلاش دوباره</button>
        </div>
      )}
      <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <button onClick={() => startListening()} disabled={busy && !listening} className={`p-3 rounded-xl text-white transition disabled:opacity-40 ${listening ? 'bg-red-600 animate-pulse' : 'bg-rose-600 hover:bg-rose-700'}`} title={listening ? 'توقف و ثبت' : 'صحبت با میکروفون'}>
          {listening ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
        <input type="text" dir="ltr" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void sendMessage(); }}
          placeholder={listening ? 'Ich höre zu …' : 'Antworte auf Deutsch oder nutze das Mikrofon …'}
          className="flex-1 min-w-0 bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-base font-sans outline-none" />
        <button onClick={() => void sendMessage()} disabled={busy || !input.trim()} className="bg-[#1f5fbf] hover:bg-[#194ea0] disabled:opacity-40 text-white px-4 py-3 rounded-xl transition"><Send size={18} /></button>
      </div>
    </>
  );

  const bar = (label: string, n: number, max = 25) => (
    <div key={label}>
      <div className="flex justify-between text-xs mb-1"><b>{label}</b><b dir="ltr">{n}/{max}</b></div>
      <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"><div className={`h-full ${n / max >= 0.7 ? 'bg-emerald-500' : n / max >= 0.5 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${(n / max) * 100}%` }} /></div>
    </div>
  );

  return (
    <div className="space-y-4 text-right max-w-3xl mx-auto pb-10" dir="rtl">
      {screen === 'hub' && (
        <div className="space-y-3">
          {Prefs}
          <div className={card + ' flex items-center justify-between gap-3'}>
            <div className="flex items-center gap-3 min-w-0"><span className="text-3xl">💬</span><div className="min-w-0"><h3 className="font-extrabold text-base">Freies Sprechen (مکالمهٔ آزاد)</h3><p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">گفتگو با میکروفون، تصحیح لحظه‌ای هر جمله و ارزیابی پایانی</p></div></div>
            <button onClick={() => setScreen('free_setup')} className="flex-shrink-0 bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-4 py-2.5 rounded-xl font-bold text-sm">شروع ▶</button>
          </div>
          <div className={card + ' flex items-center justify-between gap-3'}>
            <div className="flex items-center gap-3 min-w-0"><span className="text-3xl">🎓</span><div className="min-w-0"><h3 className="font-extrabold text-base">Prüfungsmodus (شبیه‌ساز آزمون)</h3><p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">۳ بخش مثل آزمون واقعی، شریک گفتگوی هوشمند و نمرهٔ نهایی</p></div></div>
            <button onClick={() => setScreen('exam_setup')} className="flex-shrink-0 bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-4 py-2.5 rounded-xl font-bold text-sm">تنظیم ▶</button>
          </div>
          <button onClick={() => { goHub(); onClose(); }} className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">↩ بازگشت</button>
        </div>
      )}

      {screen === 'free_setup' && (
        <div className={card + ' space-y-4'}>
          <div className="flex items-center justify-between"><h3 className="font-extrabold">موضوع و سطح گفتگو</h3><button onClick={goHub} className="px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">بازگشت</button></div>
          <select value={topic} onChange={e => setTopic(e.target.value)} className="w-full bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold">{FREE_TOPICS.map(t => <option key={t} value={t}>{t}</option>)}</select>
          <div className="flex gap-1.5">{(['A2', 'B1', 'B2'] as Level[]).map(l => <button key={l} onClick={() => setPrefs({ level: l })} className={chip(prefs.level === l) + ' flex-1'}>{l}</button>)}</div>
          {Prefs}
          <button onClick={() => void startFree()} className="w-full bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white py-3 rounded-xl font-bold text-sm">شروع گفتگو 🎙️</button>
        </div>
      )}

      {screen === 'free' && (
        <div className={card + ' space-y-3'}>
          <div className="flex items-center justify-between gap-2">
            <b className="text-sm truncate">💬 {topicDe(topic)} · {prefs.level}</b>
            <div className="flex gap-1.5 flex-shrink-0">
              <button onClick={() => void evaluate()} disabled={busy} className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold disabled:opacity-40">📊 پایان و ارزیابی</button>
              <button onClick={goHub} className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">خروج</button>
            </div>
          </div>
          {Chat}
        </div>
      )}

      {screen === 'exam_setup' && (
        <div className={card + ' space-y-4'}>
          <div className="flex items-center justify-between"><h3 className="font-extrabold">تنظیمات آزمون شفاهی</h3><button onClick={goHub} className="px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">بازگشت</button></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs font-bold">نوع آزمون
              <select value={examType} onChange={e => setExamType(e.target.value as ExamType)} className="mt-1 w-full bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold">
                <option value="ÖSD">ÖSD</option><option value="Goethe">Goethe-Zertifikat</option><option value="Telc">telc</option><option value="EPD">EPD (دانشگاه)</option>
              </select></label>
            <label className="text-xs font-bold">سطح
              <select value={examLevel} onChange={e => setExamLevel(e.target.value as Level)} className="mt-1 w-full bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold">
                {(['A1', 'A2', 'B1', 'B2'] as Level[]).map(l => <option key={l} value={l}>{l}</option>)}
              </select></label>
          </div>
          {examType === 'ÖSD' && (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setExamVariant('zdoe_b1')} className={chip(examVariant === 'zdoe_b1')}>🇦🇹 ZDÖ B1</button>
              <button onClick={() => setExamVariant('zb1')} className={chip(examVariant === 'zb1')}>🌍 ÖSD ZB1</button>
            </div>
          )}
          {Prefs}
          <button onClick={() => void startExam()} className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white py-3 rounded-xl font-bold text-sm">ساخت و شروع آزمون 🎓</button>
        </div>
      )}

      {screen === 'exam' && (
        <div className="space-y-3">
          {parts.length > 0 && (
            <div className={card + ' space-y-2'}>
              <div className="flex items-center justify-between gap-2">
                <b className="text-sm">{examType} · {examLevel}</b>
                <div className="flex gap-1">{parts.map((_, i) => <span key={i} className={`w-7 h-1.5 rounded-full ${i < partIdx ? 'bg-emerald-500' : i === partIdx ? 'bg-[#1f5fbf]' : 'bg-slate-300 dark:bg-slate-700'}`} />)}</div>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 space-y-1.5">
                <div className="font-bold text-emerald-900 dark:text-emerald-200 text-sm">{showFa ? parts[partIdx].title_fa || parts[partIdx].title_de : parts[partIdx].title_de} <span className="text-xs font-normal">· حدود {parts[partIdx].minutes} دقیقه</span></div>
                <p dir="ltr" className="text-sm font-sans text-left leading-7">{parts[partIdx].task_de}</p>
                {showFa && parts[partIdx].task_fa && <p className="text-xs text-[#5d6676] dark:text-[#a3adbd] leading-6">{parts[partIdx].task_fa}</p>}
                {parts[partIdx].points.length > 0 && <ul dir="ltr" className="text-xs font-sans text-left list-disc pl-5 space-y-0.5">{parts[partIdx].points.map((p, i) => <li key={i}>{p}</li>)}</ul>}
                <button onClick={() => setShowFa(v => !v)} className="text-[11px] font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">{showFa ? 'پنهان کردن فارسی' : 'نمایش فارسی'}</button>
              </div>
            </div>
          )}
          <div className={card + ' space-y-3'}>
            {Chat}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={nextPart} disabled={busy} className="py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-40">{partIdx >= parts.length - 1 ? '📊 پایان آزمون و نمره' : 'بخش بعد ▶'}</button>
              <button onClick={goHub} className="py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">خروج</button>
            </div>
          </div>
        </div>
      )}

      {screen === 'report' && report && (
        <div className={card + ' space-y-4'}>
          <div className="flex items-center gap-4">
            <div className={`text-5xl font-extrabold ${report.passed ? 'text-emerald-600' : 'text-rose-600'}`} dir="ltr">{report.score}</div>
            <div className="text-sm space-y-0.5"><b>{report.passed ? '✅ قبول (بالای ۶۰)' : '❌ زیر ۶۰'}</b>{report.level_estimate && <div className="text-xs">سطح تقریبی: <b dir="ltr">{report.level_estimate}</b></div>}</div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
            {bar('محتوا و انجام تکلیف', report.criteria.task)}{bar('تعامل و روانی', report.criteria.interaction)}{bar('واژگان', report.criteria.vocab)}{bar('گرامر', report.criteria.grammar)}
          </div>
          {report.summary_fa && <p className="text-sm leading-7">{report.summary_fa}</p>}
          {report.strengths_fa.length > 0 && <div><div className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300 mb-1">👍 نقاط قوت</div><ul className="text-sm leading-7 list-disc pr-5">{report.strengths_fa.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
          {report.improvements_fa.length > 0 && <div><div className="text-xs font-extrabold text-rose-700 dark:text-rose-300 mb-1">🎯 برای بهتر شدن</div><ol className="text-sm leading-7 list-decimal pr-5">{report.improvements_fa.map((s, i) => <li key={i}>{s}</li>)}</ol></div>}
          {report.corrections.length > 0 && (
            <div className="space-y-2"><div className="text-xs font-extrabold text-[#1f5fbf] dark:text-[#7fb0ff]">📝 جمله‌های اصلاح‌شده (در «دفتر خطاها» هم ذخیره شد)</div>
              {report.corrections.map((c, i) => (
                <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-1">
                  <div dir="ltr" className="font-sans text-sm text-rose-700 dark:text-rose-300 text-left">{c.original}</div>
                  <div dir="ltr" className="font-sans text-sm font-bold text-emerald-700 dark:text-emerald-300 text-left">{c.corrected}</div>
                  <div className="text-xs text-[#5d6676] dark:text-[#a3adbd]">{c.why_fa}</div>
                </div>
              ))}
            </div>
          )}
          {report.model_answer_de && (
            <div className="rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 p-3 space-y-1.5">
              <div className="text-xs font-extrabold text-indigo-700 dark:text-indigo-300">🇩🇪 پاسخ نمونه</div>
              <p dir="ltr" className="font-sans text-sm text-left leading-7">{report.model_answer_de}</p>
              <button onClick={() => sayDe(report.model_answer_de)} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800">🔊 بشنو</button>
            </div>
          )}
          <button onClick={goHub} className="w-full py-3 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white font-bold text-sm">بازگشت به منوی Sprechen</button>
        </div>
      )}
      {err && (screen === 'exam_setup' || screen === 'free_setup' || screen === 'exam' || screen === 'free') ? null : err ? <div className="p-3 rounded-xl bg-red-50 text-sm text-red-700">{err}</div> : null}
    </div>
  );
};
