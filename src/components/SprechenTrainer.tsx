/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Send, Square, Volume2, Clock, PlusCircle } from 'lucide-react';
import { speak, stopSpeaking } from '../utils/audio';
import { generateWithGemini, parseAI } from '../utils/ai';
import { describeAiError } from '../utils/aiProvider';
import { addErrors } from '../utils/errorBook';

interface SprechenTrainerProps {
  onClose: () => void;
  onShowToast: (msg: string, isErr?: boolean) => void;
}

type Level = 'A1' | 'A2' | 'B1' | 'B2';
type ExamType = 'Goethe' | 'Telc' | 'Zertifikat';
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
  'Gesundheit und Sport (سلامتی و ورزش)', 'Essen und Trinken (خوراک و نوشیدنی)',
  'Medien und Internet (رسانه و اینترنت)', 'Umwelt und Natur (محیط زیست)', 'Freizeit und Hobbys (فراغت و سرگرمی)',
  'Bildung und Lernen (آموزش و یادگیری)', 'Einkaufen und Geld (خرید و پول)', 'Stadt und Verkehr (شهر و حمل‌ونقل)',
  'Freunde und Familie (دوستان و خانواده)', 'Zukunftspläne (برنامه‌های آینده)', 'Freies Gespräch (مکالمهٔ آزاد)'
];
const PREF_KEY = 'wb_sprechen_prefs';
const DEFAULT_PREFS: Prefs = { autoplay: true, rate: 0.95, level: 'B1', autoSend: true, handsFree: false };
const loadPrefs = (): Prefs => { try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; } catch { return DEFAULT_PREFS; } };
const topicDe = (t: string) => t.replace(/\s*\(.*\)\s*$/, '');
const obj = (res: string): any => { try { const a = parseAI(res); return (Array.isArray(a) ? a[0] : a) || {}; } catch { return {}; } };
const arr = (v: any): any[] => (Array.isArray(v) ? v : []);
const str = (v: any) => (v == null ? '' : String(v));
const num = (v: any, max: number) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));

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
  const [examType, setExamType] = useState<ExamType>('Goethe');
  const [examLevel, setExamLevel] = useState<Level>('B1');
  const [parts, setParts] = useState<Part[]>([]);
  const [partIdx, setPartIdx] = useState(0);
  const [report, setReport] = useState<Report | null>(null);
  const [partSecondsLeft, setPartSecondsLeft] = useState<number>(180);
  const [showFa, setShowFa] = useState(false);

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

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs, busy]);
  useEffect(() => () => { speakToken.current++; stopSpeaking(); try { recRef.current?.abort?.(); } catch { /* ignore */ } clearTimeout(silenceRef.current); }, []);

  // تایمر معکوس برای هر بخش آزمون شفاهی
  useEffect(() => {
    if (screen !== 'exam' || busy || partSecondsLeft <= 0) return;
    const t = setInterval(() => {
      setPartSecondsLeft(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [screen, busy, partSecondsLeft]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

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
    rec.onerror = () => setListening(false);
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

  const ctxOf = (list: Msg[], who1 = 'Partner', who2 = 'Learner') => list.slice(-14).map(m => `${m.who === 'ai' ? who1 : who2}: ${m.text}`).join('\n');
  const sttNote = 'The learner\'s text may come from speech recognition: no punctuation — treat leniently.';

  const startFree = async () => {
    unlockAudio();
    setScreen('free'); setReport(null); setErr(''); setMsgs([]); setBusy(true); busyRef.current = true;
    try {
      const res = await generateWithGemini(`You are a friendly German conversation partner for a learner in Germany at level ${prefs.level}. Topic: "${topicDe(topic)}". Start conversation in German at level ${prefs.level}. Return ONLY JSON: {"reply":"..."}`, { json: true, timeoutMs: 30000, retries: 1 });
      const reply = str(obj(res).reply).trim();
      if (!reply) throw new Error('خطا در پاسخ هوش مصنوعی.');
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
        const res = await generateWithGemini(`German conversation partner (Level ${prefs.level}). Topic: "${topicDe(topic)}". ${sttNote}
History:\n${ctxOf(base)}
Task: (1) reply naturally in 1-2 sentences at level ${prefs.level} with a question; (2) check learner's message for grammar/naturalness.
Return ONLY JSON: {"reply":"...","ok":true,"corrected":"...","issues":[{"wrong":"","correct":"","why_fa":"..."}],"better":"...","tip_fa":"..."}`, { json: true, timeoutMs: 35000, retries: 1 });
        const r = obj(res);
        const reply = str(r.reply).trim();
        const issues = arr(r.issues).map((i: any) => ({ wrong: str(i.wrong), correct: str(i.correct), why_fa: str(i.why_fa) })).filter(i => i.wrong || i.correct);
        const fb: Fb = { ok: issues.length === 0, corrected: str(r.corrected) || text, issues, better: str(r.better), tip_fa: str(r.tip_fa) };
        if (issues.length) addErrors([{ original: text, corrected: fb.corrected, type: 'گرامر', why: issues.map(i => i.why_fa).join(' | ') }]);
        const next = [...base.slice(0, -1), { ...base[base.length - 1], fb }, { who: 'ai' as const, text: reply }];
        setMsgs(next); aiSays(reply);
      } else {
        const res = await generateWithGemini(`German oral examiner (${examType} Level ${examLevel}). Current part: "${part?.title_de}". React to candidate and ask follow-up. Return ONLY JSON: {"reply":"..."}`, { json: true, timeoutMs: 30000, retries: 1 });
        const reply = str(obj(res).reply).trim();
        setMsgs([...base, { who: 'ai', text: reply, part: partIdx }]); aiSays(reply);
      }
    } catch (e: any) { setErr(describeAiError(e)); }
    finally { setBusy(false); busyRef.current = false; }
  };
  sendRef.current = t => { void sendMessage(t); };

  const startExam = async () => {
    unlockAudio();
    setScreen('exam'); setReport(null); setErr(''); setMsgs([]); setPartIdx(0); setBusy(true); busyRef.current = true;
    setShowFa(false);
    let list: Part[] = [];
    try {
      const res = await generateWithGemini(`Design an official German speaking exam simulation for ${examType} at level ${examLevel} (standard Goethe/telc format for Germany). Exactly 3 parts.
Return ONLY JSON: {"parts":[{"type":"dialog|monolog","title_de":"Teil 1: ...","title_fa":"بخش ۱: ...","task_de":"...","task_fa":"...","points":["..."],"minutes":3,"opening":"..."}]}`, { json: true, timeoutMs: 40000, retries: 1 });
      list = arr(obj(res).parts).slice(0, 3).map((p: any) => ({
        type: p.type === 'monolog' ? 'monolog' : 'dialog', title_de: str(p.title_de), title_fa: str(p.title_fa),
        task_de: str(p.task_de), task_fa: str(p.task_fa), points: arr(p.points).map(str), minutes: Number(p.minutes) || 3, opening: str(p.opening)
      } as Part)).filter(p => p.task_de);
      if (list.length < 3) throw new Error('short');
    } catch {
      list = defaultParts(examType, examLevel);
      onShowToast('سناریوی استاندارد بارگذاری شد.', true);
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
    setShowFa(false);
    setPartIdx(i);
    setPartSecondsLeft((parts[i].minutes || 3) * 60);
    const op = parts[i].opening || parts[i].task_de;
    setMsgs([...msgsRef.current, { who: 'ai', text: op, part: i }]);
    aiSays(op);
  };

  const evaluate = async () => {
    const list = msgsRef.current;
    if (!list.some(m => m.who === 'user')) { onShowToast('هنوز پاسخی ثبت نشده است.', true); return; }
    unlockAudio(); stopListening(); stopTalking();
    setBusy(true); busyRef.current = true; setErr('');
    const exam = screenRef.current === 'exam';
    try {
      const transcript = list.map(m => `${m.who === 'ai' ? 'Examiner' : 'Candidate'}: ${m.text}`).join('\n');
      const res = await generateWithGemini(`TRANSCRIPT:\n${transcript}\n\nBe strict and honest: judge ONLY the Candidate's lines; very short or off-task answers get low scores. Evaluate candidate's German speaking transcript (${exam ? `${examType} ${examLevel}` : `level ${prefs.level}`}).
Return ONLY JSON: {"score":0,"passed":true,"level_estimate":"B1","criteria":{"task":0,"interaction":0,"vocab":0,"grammar":0},"summary_fa":"...","strengths_fa":["..."],"improvements_fa":["..."],"corrections":[{"original":"...","corrected":"...","why_fa":"..."}],"model_answer_de":"model answer 4-6 sentences"}`, { json: true, timeoutMs: 60000, retries: 1 });
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

  const card = 'bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4';
  const chip = (on: boolean) => `px-3 py-1.5 rounded-full text-xs font-bold border transition ${on ? 'bg-[#1f5fbf] text-white border-[#1f5fbf]' : 'bg-white dark:bg-[#1b2029] border-[#dde1ea] dark:border-[#333b4a]'}`;
  const PrefsUI = (
    <div className={card + ' space-y-2.5'}>
      <div className="flex flex-wrap items-center gap-1.5">
        <button onClick={() => setPrefs({ autoplay: !prefs.autoplay })} className={chip(prefs.autoplay)}>🔊 پخش خودکار صدا</button>
        <button onClick={() => setPrefs({ handsFree: !prefs.handsFree })} className={chip(prefs.handsFree)}>🤝 دست‌آزاد</button>
        <button onClick={() => setPrefs({ autoSend: !prefs.autoSend })} className={chip(prefs.autoSend)}>⚡ ارسال خودکار</button>
      </div>
    </div>
  );

  const Chat = (
    <>
      {(speaking || blocked) && (
        <div className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-bold ${blocked ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-800'}`}>
          <span>{blocked ? 'پخش صوتی مسدود شد؛ روی 🔊 بزن.' : '🔊 در حال صحبت…'}</span>
          {speaking && <button onClick={stopTalking} className="flex items-center gap-1 bg-white border rounded-lg px-2 py-1"><Square size={12} /> توقف</button>}
        </div>
      )}
      <div ref={listRef} className="space-y-3 max-h-[52vh] overflow-y-auto p-1" dir="ltr">
        {msgs.map((m, i) => (
          <div key={i} className={`flex flex-col ${m.who === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[88%] rounded-2xl px-4 py-2.5 ${m.who === 'user' ? 'bg-[#1f5fbf] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'}`}>
              <div className="flex items-center justify-between gap-3 mb-0.5">
                <span className="text-[10px] font-bold opacity-75">{m.who === 'ai' ? (isExam ? 'Prüfer/in' : 'AI Partner') : 'Du'}</span>
                {m.who === 'ai' && <button onClick={() => sayDe(m.text)} className="text-xs"><Volume2 size={14} /></button>}
              </div>
              <div className="font-sans text-base leading-relaxed">{m.text}</div>
            </div>
            {m.fb && (
              <div className="max-w-[92%] mt-1 rounded-xl border bg-white dark:bg-[#141923] px-3 py-2 text-sm space-y-1.5" dir="rtl">
                {m.fb.ok ? <div className="text-emerald-700 font-bold text-xs">✓ کاملاً درست و طبیعی</div> : (
                  <>
                    <div dir="ltr" className="font-sans font-bold text-emerald-700 text-left">✅ {m.fb.corrected}</div>
                    {m.fb.issues.map((x, k) => (
                      <div key={k} className="text-xs leading-6">
                        <span dir="ltr" className="font-sans"><s className="text-rose-600">{x.wrong}</s> → <b className="text-emerald-700">{x.correct}</b></span>
                        <div className="text-[#5d6676]">{x.why_fa}</div>
                        <button
                          onClick={() => {
                            addErrors([{ original: x.wrong, corrected: x.correct, type: 'گرامر مکالمه', why: x.why_fa }]);
                            onShowToast('خطا به دفترچه خطاها افزوده شد ✓');
                          }}
                          className="mt-1 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold flex items-center gap-1"
                        >
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
            <div className="flex items-center gap-3"><span className="text-3xl">💬</span><div><h3 className="font-extrabold text-base">Freies Sprechen (مکالمه آزاد)</h3><p className="text-xs text-[#5d6676]">گفتگو با میکروفون و تصحیح لحظه‌ای</p></div></div>
            <button onClick={() => setScreen('free_setup')} className="bg-[#1f5fbf] text-white px-4 py-2.5 rounded-xl font-bold text-sm">شروع ▶</button>
          </div>
          <div className={card + ' flex items-center justify-between gap-3'}>
            <div className="flex items-center gap-3"><span className="text-3xl">🎓</span><div><h3 className="font-extrabold text-base">Prüfungsmodus (شبیه‌ساز آزمون Goethe / telc)</h3><p className="text-xs text-[#5d6676]">۳ بخش آزمون واقعی، تایمر و ارزیابی استاندارد</p></div></div>
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
            <label className="text-xs font-bold">فرمت آزمون
              <select value={examType} onChange={e => setExamType(e.target.value as ExamType)} className="mt-1 w-full bg-slate-50 dark:bg-[#141923] border rounded-xl px-3 py-2.5 text-sm font-bold">
                <option value="Goethe">Goethe-Zertifikat</option><option value="Telc">telc Deutsch</option><option value="Zertifikat">Zertifikat Deutsch</option>
              </select></label>
            <label className="text-xs font-bold">سطح
              <select value={examLevel} onChange={e => setExamLevel(e.target.value as Level)} className="mt-1 w-full bg-slate-50 dark:bg-[#141923] border rounded-xl px-3 py-2.5 text-sm font-bold">
                {(['A1', 'A2', 'B1', 'B2'] as Level[]).map(l => <option key={l} value={l}>{l}</option>)}
              </select></label>
          </div>
          <button onClick={() => void startExam()} className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold text-sm">شروع شبیه‌ساز آزمون 🚀</button>
        </div>
      )}

      {screen === 'exam' && (
        <div className={card + ' space-y-3'}>
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1 min-w-0">
              <b className="text-sm">🎓 {examType} {examLevel} — Teil {partIdx + 1} von {parts.length}</b>
              <p className="text-base font-extrabold font-sans" dir="ltr">{parts[partIdx]?.task_de}</p>
              {showFa
                ? <p className="text-xs text-[#9aa3b2]">{parts[partIdx]?.task_fa}</p>
                : <button onClick={() => setShowFa(true)} className="text-xs font-bold text-[#1f5fbf]">👁 نمایش فارسی</button>}
            </div>
            {/* تایمر معکوس برای مدیریت زمان آزمون */}
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
            {([['task', 'انجام تکلیف'], ['interaction', 'تعامل'], ['vocab', 'واژگان'], ['grammar', 'گرامر']] as const).map(([k, l]) => (
              <div key={k} className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 flex justify-between"><span>{l}</span><span>{report.criteria[k]}/25</span></div>
            ))}
          </div>
          <p className="text-sm leading-7">{report.summary_fa}</p>
          {report.strengths_fa.length > 0 && <div className="text-sm"><b className="text-emerald-700">✅ نقاط قوت</b><ul className="list-disc pr-5 leading-7">{report.strengths_fa.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
          {report.improvements_fa.length > 0 && <div className="text-sm"><b className="text-amber-700">⚠️ نقاط قابل بهبود</b><ul className="list-disc pr-5 leading-7">{report.improvements_fa.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
          {report.corrections.length > 0 && <div className="space-y-2">{report.corrections.map((c, i) => (
            <div key={i} className="p-2.5 rounded-xl border text-xs space-y-1">
              <div dir="ltr" className="font-sans"><s className="text-rose-600">{c.original}</s> → <b className="text-emerald-700">{c.corrected}</b></div>
              <div className="text-[#5d6676]">{c.why_fa}</div>
            </div>))}</div>}

          {/* پخش صوتی پاسخ نمونه */}
          {report.model_answer_de && (
            <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-[#1f5fbf]">🎧 پاسخ نمونه استاندارد (Model Answer):</span>
                <button
                  onClick={() => sayDe(report.model_answer_de)}
                  className="px-3 py-1 rounded-lg bg-[#1f5fbf] text-white text-xs font-bold flex items-center gap-1"
                >
                  <Volume2 size={14} /> پخش صوتی پاسخ نمونه
                </button>
              </div>
              <p className="font-sans text-sm text-slate-800 dark:text-slate-100 text-left" dir="ltr">{report.model_answer_de}</p>
            </div>
          )}

          <button onClick={goHub} className="w-full bg-[#1f5fbf] text-white py-3 rounded-xl font-bold text-sm">بازگشت به منو 🔄</button>
        </div>
      )}
    </div>
  );
};
