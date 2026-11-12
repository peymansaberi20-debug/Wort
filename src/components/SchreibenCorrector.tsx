import React, { useRef, useState } from 'react';
import { Word } from '../types';
import { generateWithGemini, parseAI } from '../utils/ai';
import { describeAiError, generateWithImages } from '../utils/aiProvider';
import { ShadowingModal } from './ShadowingModal';
import { addErrors } from '../utils/errorBook';

/** Synthetic target for pronunciation practice (no vocabulary item involved). */
const SELF_WORD: Word = {
  id: 'schreiben-self', de: '', art: '', fa: '', syn: '', synFa: '', ant: '', antFa: '',
  pl: '', pos: '', lvl: 'B1', ex: '', exFa: '', ex2: '', ex2Fa: '', conj: '', prat: '',
  perf: '', sep: '', cat: 'گرامر', cloze: '', ans: '', acc: [], tags: '', img: '',
  notes: '', added: 0, last: 0, due: 0, ivl: 0, ease: 2.5, stage: 0, ok: 0, bad: 0, res: ''
};

interface Issue { type: string; wrong: string; correct: string; why_fa: string }
interface Sent { original: string; corrected: string; ok: boolean; issues: Issue[] }
interface Report {
  text_type_fa: string; level: string; score: number;
  scores: { grammar: number; vocab: number; style: number; structure: number; logic: number };
  summary_fa: string; sentences: Sent[]; style_fa: string; logic_fa: string;
  strengths_fa: string[]; priorities_fa: string[];
  corrected_de: string; natural_de: string;
  vocab: { de: string; fa: string; note_fa: string }[];
}
interface Page { id: number; preview: string; data: string }

const BADGE: Record<string, string> = {
  'گرامر': 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
  'املا': 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  'نشانه‌گذاری': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/60 dark:text-yellow-300',
  'حرف اضافه و حالت دستوری': 'bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300',
  'واژه‌گزینی': 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300',
  'ساختار و ترتیب': 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300',
  'سبک و سطح زبان': 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950/60 dark:text-fuchsia-300',
  'معنا و منطق': 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
};
const TEXT_TYPES = ['تشخیص خودکار', 'نامهٔ رسمی / ایمیل رسمی', 'نامهٔ غیررسمی / پیام به دوست', 'نظر و استدلال (Meinung)', 'توصیف و گزارش', 'داستان و تجربه', 'درخواست / شکایت / تماس با اداره'];
const LEVELS = ['A2', 'B1', 'B2', 'C1'];
const TASK_KINDS = ['ایمیل کاری (حسابداری / اداری)', 'درخواست کار (Bewerbung)', 'ایمیل به صاحب‌خانه یا Hausverwaltung', 'نامه به بیمه یا اداره', 'ایمیل به پزشک / وقت گرفتن', 'نظر و استدلال (Meinung)', 'پیام غیررسمی به دوست', 'گزارش از یک تجربه'];
interface Task { title: string; situation: string; points: string[]; min: number }

const card = 'bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 space-y-3';
const clamp = (n: any) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
const col = (n: number) => (n >= 80 ? 'text-emerald-600 dark:text-emerald-400' : n >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400');
const bar = (n: number) => (n >= 80 ? 'bg-emerald-500' : n >= 60 ? 'bg-amber-500' : 'bg-rose-500');
const arr = (v: any): any[] => (Array.isArray(v) ? v : []);
const str = (v: any) => (v == null ? '' : String(v));

const prepImage = (file: File): Promise<Page> => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const s = Math.min(1, 1800 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    const ctx = c.getContext('2d');
    if (!ctx) { URL.revokeObjectURL(url); reject(new Error('پردازش تصویر ممکن نشد.')); return; }
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const d = c.toDataURL('image/jpeg', 0.82);
    URL.revokeObjectURL(url);
    resolve({ id: Date.now() + Math.random(), preview: d, data: d.split(',')[1] });
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('خواندن تصویر ممکن نشد.')); };
  img.src = url;
});

const Score: React.FC<{ label: string; n: number }> = ({ label, n }) => (
  <div>
    <div className="flex justify-between text-xs mb-1"><span className="font-bold">{label}</span><span className={`font-extrabold ${col(n)}`} dir="ltr">{n}</span></div>
    <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"><div className={`h-full rounded-full ${bar(n)}`} style={{ width: `${n}%` }} /></div>
  </div>
);

export const SchreibenCorrector: React.FC<{ onShowToast: (m: string, e?: boolean) => void }> = ({ onShowToast }) => {
  const [pages, setPages] = useState<Page[]>([]);
  const [text, setText] = useState('');
  const [textType, setTextType] = useState(TEXT_TYPES[0]);
  const [level, setLevel] = useState('B1');
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [showOk, setShowOk] = useState(false);
  const [shadowOpen, setShadowOpen] = useState(false);
  const [savedErr, setSavedErr] = useState(0);
  const [task, setTask] = useState<Task | null>(null);
  const [taskKind, setTaskKind] = useState(TASK_KINDS[0]);
  const [taskBusy, setTaskBusy] = useState(false);
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);

  const addFiles = async (list: FileList | null) => {
    if (!list || !list.length) return;
    try {
      const imgs = await Promise.all(Array.from(list).filter(f => f.type.startsWith('image/')).map(prepImage));
      if (!imgs.length) { onShowToast('فقط فایل تصویری انتخاب کن.', true); return; }
      setPages(p => [...p, ...imgs].slice(0, 8));
      if (pages.length + imgs.length > 8) onShowToast('حداکثر ۸ صفحه پذیرفته می‌شود.', true);
    } catch (e: any) { onShowToast(e?.message || 'خطا در خواندن تصویر', true); }
  };
  const move = (i: number, d: number) => setPages(p => { const a = [...p]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; });

  const readText = async () => {
    if (!pages.length || reading) return;
    setReading(true); setErrMsg('');
    const prompt = `Transcribe the handwritten or printed GERMAN text in these ${pages.length} page image(s), in page order, as ONE continuous text.
Rules: copy EXACTLY what the writer wrote, INCLUDING all spelling and grammar mistakes. Do NOT correct, improve, translate or complete anything. Keep paragraph breaks. If a word is illegible write [?]. Ignore crossed-out words, page numbers and margin notes. Output ONLY the transcribed text, with no comments and no code fences.`;
    try {
      const out = await generateWithImages(prompt, pages.map(p => ({ mimeType: 'image/jpeg', data: p.data })), { timeoutMs: 120000, retries: 1 });
      const clean = String(out || '').replace(/^```[a-z]*\n?/i, '').replace(/```$/,'').trim();
      if (!clean) throw new Error('متنی از تصویر خوانده نشد. عکس را واضح‌تر بگیر.');
      setText(clean); setReport(null);
      onShowToast('متن خوانده شد. اگر جایی اشتباه خوانده شده، همین‌جا درستش کن.');
    } catch (e: any) { setErrMsg(describeAiError ? describeAiError(e) : (e?.message || 'خطا')); }
    finally { setReading(false); }
  };

  const runCheck = async () => {
    const t = text.trim();
    if (t.length < 15 || busy) { if (t.length < 15) onShowToast('متن خیلی کوتاه است.', true); return; }
    setBusy(true); setErrMsg(''); setReport(null);
    const prompt = `You are an experienced German teacher and examiner (Korrektor) for Persian-speaking learners. Correct the learner's WHOLE text and give feedback in PERSIAN (German examples stay German).
THINK LIKE A NATIVE GERMAN WRITER: do not judge by word-for-word translation from Persian. Check not only grammar and vocabulary but also whether the text sounds natural, whether the text type (Textsorte) and register fit, and whether the content is logical.
${task ? 'TASK GIVEN TO THE LEARNER (also check task fulfilment: is every Leitpunkt covered, is the length sufficient, does the register fit? Name missing points in logic_fa):\nSituation: ' + task.situation + '\nLeitpunkte: ' + task.points.join(' | ') + '\nMinimum words: ' + task.min + '\n' : ''}Target level: ${level}. Declared text type: ${textType === TEXT_TYPES[0] ? 'unknown - detect it' : textType}.
CHECK ALL OF THESE:
1) Grammar: Artikel/Genus/Kasus, Adjektivendungen, Verbposition (V2, Nebensatz verb-final, Inversion), Konjugation, Tempus and Perfekt auxiliary (haben/sein), Passiv, Konjunktiv II, trennbare Verben, Präpositionen with Kasus, Pronomen, Plural, Negation (nicht/kein).
2) Spelling and punctuation: noun capitalisation, ß/ss, commas (dass/weil/Relativsatz/Infinitivgruppen), sentence ends.
3) Vocabulary: word choice, collocations, false friends, Persian-influenced calques, needless repetition.
4) Style and register: conventions of the text type (Anrede, Betreff, Einleitung, Schlussformel and Grußformel for letters/emails), consistent Sie or du, formal vs colloquial words, politeness formulas, suitability for the situation and level.
5) Structure and cohesion: introduction / main part / ending, paragraphs, connectors (weil, deshalb, außerdem, trotzdem, ...), reference words, sentence variety.
6) Logic and content: coherent, no contradictions, on topic, plausible order of events, appropriate things to say in this situation.
RULES: keep the learner's meaning and voice; make only necessary edits in "corrected". Split the text into sentences in order and include EVERY sentence. ok=true only if the sentence is fully correct AND natural. Issue "type" must be one of: "گرامر","املا","نشانه‌گذاری","حرف اضافه و حالت دستوری","واژه‌گزینی","ساختار و ترتیب","سبک و سطح زبان","معنا و منطق". "wrong" and "correct" are the minimal fragments; "why_fa" is a short Persian explanation naming the rule. Text-level problems (register, structure, logic) go in style_fa / logic_fa. Scores are 0-100.
Return ONLY valid JSON:
{"text_type_fa":"detected text type in Persian","level":"estimated CEFR level of the writing","score":0,"scores":{"grammar":0,"vocab":0,"style":0,"structure":0,"logic":0},"summary_fa":"3-4 sentences overall assessment in Persian","sentences":[{"original":"","corrected":"","ok":true,"issues":[{"type":"","wrong":"","correct":"","why_fa":""}]}],"style_fa":"register / text-type evaluation in Persian","logic_fa":"content logic, coherence and connectors evaluation in Persian","strengths_fa":["..."],"priorities_fa":["top 3 things to practise, in Persian"],"corrected_de":"the full corrected text","natural_de":"a more natural, native-like version of the whole text","vocab":[{"de":"better word or phrase","fa":"meaning","note_fa":"when to use it"}]}
TEXT TO CORRECT:
"""
${t}
"""`;
    try {
      const out = await generateWithGemini(prompt, { timeoutMs: 150000, retries: 1 });
      const r: any = parseAI(out)[0] || {};
      if (typeof r.score !== 'number' && !arr(r.sentences).length) throw new Error('پاسخ نامعتبر از هوش مصنوعی دریافت شد. دوباره تلاش کن.');
      const sc = r.scores || {};
      setReport({
        text_type_fa: str(r.text_type_fa), level: str(r.level), score: clamp(r.score),
        scores: { grammar: clamp(sc.grammar), vocab: clamp(sc.vocab), style: clamp(sc.style), structure: clamp(sc.structure), logic: clamp(sc.logic) },
        summary_fa: str(r.summary_fa),
        sentences: arr(r.sentences).map((s: any) => ({
          original: str(s.original), corrected: str(s.corrected), ok: !!s.ok && !arr(s.issues).length,
          issues: arr(s.issues).map((i: any) => ({ type: str(i.type), wrong: str(i.wrong), correct: str(i.correct), why_fa: str(i.why_fa) }))
        })),
        style_fa: str(r.style_fa), logic_fa: str(r.logic_fa),
        strengths_fa: arr(r.strengths_fa).map(str), priorities_fa: arr(r.priorities_fa).map(str),
        corrected_de: str(r.corrected_de), natural_de: str(r.natural_de),
        vocab: arr(r.vocab).map((v: any) => ({ de: str(v.de), fa: str(v.fa), note_fa: str(v.note_fa) }))
      });
      const bads = arr(r.sentences)
        .filter((s: any) => !(s.ok && !arr(s.issues).length) && str(s.original) && str(s.corrected))
        .map((s: any) => ({ original: str(s.original), corrected: str(s.corrected), type: str(arr(s.issues)[0]?.type), why: arr(s.issues).map((i: any) => `${str(i.type)}: ${str(i.why_fa)}`).join(' | ') }));
      setSavedErr(addErrors(bads));
    } catch (e: any) { setErrMsg(describeAiError ? describeAiError(e) : (e?.message || 'خطا')); }
    finally { setBusy(false); }
  };

  const makeTask = async () => {
    if (taskBusy) return;
    setTaskBusy(true); setErrMsg('');
    const prompt = `Create ONE realistic German writing task (Schreibaufgabe) for a learner at level ${level}. Kind of text: ${taskKind}. Setting: everyday life or work in Austria (Vienna) where natural; for work topics use accounting/office contexts (Rechnung, Mahnung, Umsatzsteuer, Bewerbung als Buchhalter).
Return ONLY valid JSON: {"title":"short Persian title","situation":"2-3 sentences in German describing the situation and who the learner writes to","points":["3 or 4 Leitpunkte in German, each a short sentence of what must be mentioned"],"min":80}
"min" = minimum words (A2: 60, B1: 80, B2: 120, C1: 150).`;
    try {
      const out = await generateWithGemini(prompt, { timeoutMs: 60000, retries: 1 });
      const r: any = parseAI(out)[0] || {};
      if (!str(r.situation) || !arr(r.points).length) throw new Error('موضوع ساخته نشد. دوباره تلاش کن.');
      setTask({ title: str(r.title), situation: str(r.situation), points: arr(r.points).map(str), min: Number(r.min) || 80 });
      setReport(null);
    } catch (e: any) { setErrMsg(describeAiError ? describeAiError(e) : (e?.message || 'خطا')); }
    finally { setTaskBusy(false); }
  };

  const copy = (s: string) => { try { navigator.clipboard.writeText(s); onShowToast('کپی شد.'); } catch { onShowToast('کپی ممکن نشد.', true); } };
  const reset = () => { setPages([]); setText(''); setReport(null); setErrMsg(''); };
  const bad = report ? report.sentences.filter(s => !s.ok) : [];
  const good = report ? report.sentences.filter(s => s.ok) : [];

  return (
    <div className="space-y-4 text-right max-w-3xl mx-auto">
      {/* 0. optional task (Aufgabe) */}
      <div className={card}>
        <div className="font-extrabold text-sm">🎯 موضوع برای نوشتن (اختیاری)</div>
        <p className="text-[12px] leading-6 text-[#5d6676] dark:text-[#a3adbd]">اگر موضوعی نداری، برنامه مثل آزمون یک «Aufgabe» می‌دهد. بعد از نوشتن، تصحیح هم بررسی می‌کند که همهٔ نکته‌ها را پوشش داده‌ای.</p>
        <div className="flex gap-2">
          <select value={taskKind} onChange={e => setTaskKind(e.target.value)} className="flex-1 min-w-0 bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-2 py-2 text-xs font-bold outline-none">
            {TASK_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <button onClick={makeTask} disabled={taskBusy} className="px-3 h-10 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white font-bold text-xs disabled:opacity-40 flex-shrink-0">{taskBusy ? '⏳ …' : task ? '🔄 موضوع دیگر' : '🎯 موضوع بده'}</button>
        </div>
        {task && (
          <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 space-y-2">
            <div className="flex items-start justify-between gap-2"><b className="text-sm">{task.title}</b><button onClick={() => setTask(null)} className="text-red-600 text-lg leading-none">✕</button></div>
            <div dir="ltr" className="text-sm font-sans leading-7">{task.situation}</div>
            <ul dir="ltr" className="text-sm font-sans leading-7 list-disc pl-5">{task.points.map((p, i) => <li key={i}>{p}</li>)}</ul>
            <div className="text-xs text-[#5d6676] dark:text-[#a3adbd]">حداقل {task.min} کلمه</div>
          </div>
        )}
      </div>

      {/* 1. photos */}
      <div className={card}>
        <div className="font-extrabold text-sm flex items-center justify-between"><span>📷 عکس متن نوشته‌شده (چند صفحه)</span>{(pages.length > 0 || text) && <button onClick={reset} className="text-xs text-red-600 font-bold">🔄 شروع دوباره</button>}</div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => camRef.current?.click()} className="h-12 rounded-xl border-2 border-dashed border-[#1f5fbf] text-[#1f5fbf] dark:text-blue-300 font-bold text-sm">📷 دوربین</button>
          <button onClick={() => galRef.current?.click()} className="h-12 rounded-xl border-2 border-dashed border-[#1f5fbf] text-[#1f5fbf] dark:text-blue-300 font-bold text-sm">🖼 گالری (چند عکس)</button>
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { void addFiles(e.target.files); e.target.value = ''; }} />
          <input ref={galRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { void addFiles(e.target.files); e.target.value = ''; }} />
        </div>
        {pages.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {pages.map((p, i) => (
              <div key={p.id} className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                <img src={p.preview} alt={`صفحه ${i + 1}`} className="w-full h-28 object-cover" />
                <span className="absolute top-1 right-1 bg-black/60 text-white text-[11px] font-bold px-1.5 rounded-full">{i + 1}</span>
                <button onClick={() => setPages(a => a.filter(x => x.id !== p.id))} className="absolute top-0.5 left-0.5 w-7 h-7 text-lg text-white bg-red-600/85 rounded-full leading-none">✕</button>
                <div className="absolute bottom-0 inset-x-0 flex justify-between bg-black/45 text-white text-sm px-1">
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="px-1.5 disabled:opacity-30">▶</button>
                  <button onClick={() => move(i, 1)} disabled={i === pages.length - 1} className="px-1.5 disabled:opacity-30">◀</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <select value={textType} onChange={e => setTextType(e.target.value)} className="w-full bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-2 py-2 text-xs font-bold outline-none">
            {TEXT_TYPES.map(t => <option key={t} value={t}>{t === TEXT_TYPES[0] ? 'نوع متن: تشخیص خودکار' : t}</option>)}
          </select>
          <select value={level} onChange={e => setLevel(e.target.value)} className="w-full bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-2 py-2 text-xs font-bold outline-none">
            {LEVELS.map(l => <option key={l} value={l}>سطح هدف: {l}</option>)}
          </select>
        </div>
        <button onClick={readText} disabled={!pages.length || reading} className="w-full h-12 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white font-bold text-sm disabled:opacity-40">
          {reading ? '⏳ در حال خواندن متن از عکس‌ها…' : '📖 خواندن متن از عکس‌ها'}
        </button>
      </div>

      {/* 2. text (editable) */}
      <div className={card}>
        <div className="font-extrabold text-sm">📝 متن شما</div>
        <p className="text-[12px] leading-6 text-[#5d6676] dark:text-[#a3adbd]">متن خوانده‌شده را با عکس مقایسه کن. فقط اشتباه «خواندن» را درست کن؛ خطاهای خودت را عوض نکن تا تصحیح درست انجام شود. می‌توانی متن را مستقیم هم تایپ کنی.</p>
        <textarea dir="ltr" value={text} onChange={e => setText(e.target.value)} rows={9} placeholder="Hier steht dein deutscher Text …"
          className="w-full bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl p-3 text-sm font-sans leading-7 outline-none focus:border-[#1f5fbf]" />
        <button onClick={runCheck} disabled={busy || text.trim().length < 15} className="w-full h-12 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-sm disabled:opacity-40">
          {busy ? '⏳ در حال تصحیح کامل متن…' : '✅ تصحیح کامل'}
        </button>
        {errMsg && <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300 leading-7">{errMsg}</div>}
      </div>

      {/* 3. report */}
      {report && (
        <div className="space-y-4">
          <div className={card}>
            <div className="flex items-center gap-4">
              <div className={`text-5xl font-extrabold ${col(report.score)}`} dir="ltr">{report.score}</div>
              <div className="min-w-0 text-sm space-y-1">
                <div className="font-extrabold">نمرهٔ کلی از ۱۰۰</div>
                {report.level && <div className="text-xs">سطح تقریبی نوشته: <b dir="ltr">{report.level}</b></div>}
                {report.text_type_fa && <div className="text-xs">نوع متن: <b>{report.text_type_fa}</b></div>}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
              <Score label="گرامر" n={report.scores.grammar} />
              <Score label="واژگان" n={report.scores.vocab} />
              <Score label="سبک و سطح زبان" n={report.scores.style} />
              <Score label="ساختار و پیوستگی" n={report.scores.structure} />
              <Score label="منطق و محتوا" n={report.scores.logic} />
            </div>
            {report.summary_fa && <p className="text-sm leading-7">{report.summary_fa}</p>}
            {savedErr > 0 && <div className="text-xs font-bold text-indigo-700 dark:text-indigo-300">📓 {savedErr} جمله به «دفتر خطاها» اضافه شد؛ در تمرین «دفتر خطاها» مرورشان کن.</div>}
          </div>

          {(report.strengths_fa.length > 0 || report.priorities_fa.length > 0) && (
            <div className={card}>
              {report.strengths_fa.length > 0 && (<div><div className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300 mb-1">👍 نقاط قوت</div><ul className="text-sm leading-7 list-disc pr-5">{report.strengths_fa.map((s, i) => <li key={i}>{s}</li>)}</ul></div>)}
              {report.priorities_fa.length > 0 && (<div><div className="text-xs font-extrabold text-rose-700 dark:text-rose-300 mb-1">🎯 مهم‌ترین چیزها برای تمرین</div><ol className="text-sm leading-7 list-decimal pr-5">{report.priorities_fa.map((s, i) => <li key={i}>{s}</li>)}</ol></div>)}
            </div>
          )}

          {(report.style_fa || report.logic_fa) && (
            <div className={card}>
              {report.style_fa && <div><div className="text-xs font-extrabold text-fuchsia-700 dark:text-fuchsia-300 mb-1">🎩 سبک، لحن و نوع متن</div><p className="text-sm leading-7">{report.style_fa}</p></div>}
              {report.logic_fa && <div><div className="text-xs font-extrabold text-rose-700 dark:text-rose-300 mb-1">🧠 منطق، پیوستگی و ربط جمله‌ها</div><p className="text-sm leading-7">{report.logic_fa}</p></div>}
            </div>
          )}

          <div className="space-y-3">
            <div className="text-sm font-extrabold">🔎 بررسی جمله‌به‌جمله — {bad.length} جمله نیاز به اصلاح دارد</div>
            {bad.map((s, i) => (
              <div key={i} className={card + ' !p-3'}>
                <div dir="ltr" className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 text-sm font-sans leading-7 text-rose-900 dark:text-rose-200">{s.original}</div>
                <div dir="ltr" className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-sm font-sans font-bold leading-7 text-emerald-900 dark:text-emerald-200">{s.corrected}</div>
                {s.issues.map((is, k) => (
                  <div key={k} className="text-sm leading-7 border-t border-slate-100 dark:border-slate-800 pt-2">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${BADGE[is.type] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>{is.type || 'نکته'}</span>
                    {(is.wrong || is.correct) && <span dir="ltr" className="font-sans mx-2"><s className="text-rose-600">{is.wrong}</s>{is.wrong && is.correct ? ' → ' : ''}<b className="text-emerald-700 dark:text-emerald-300">{is.correct}</b></span>}
                    <div className="mt-1">{is.why_fa}</div>
                  </div>
                ))}
              </div>
            ))}
            {good.length > 0 && (
              <div className={card + ' !p-3'}>
                <button onClick={() => setShowOk(v => !v)} className="w-full text-right text-sm font-bold text-emerald-700 dark:text-emerald-300">✅ {good.length} جمله درست و طبیعی {showOk ? '▲' : '▼'}</button>
                {showOk && good.map((s, i) => <div key={i} dir="ltr" className="text-sm font-sans leading-7 border-t border-slate-100 dark:border-slate-800 pt-1.5">{s.corrected || s.original}</div>)}
              </div>
            )}
          </div>

          {report.corrected_de && (
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 space-y-2">
              <div className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300">✅ متن اصلاح‌شده (با حداقل تغییر)</div>
              <div dir="ltr" className="font-sans text-sm leading-8 whitespace-pre-wrap">{report.corrected_de}</div>
              <div className="flex gap-2">
                <button onClick={() => copy(report.corrected_de)} className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-800 text-xs font-bold">📋 کپی</button>
                <button onClick={() => setShadowOpen(true)} className="px-3.5 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold">🎙 تمرین تلفظ</button>
              </div>
            </div>
          )}
          {report.natural_de && (
            <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 space-y-2">
              <div className="text-xs font-extrabold text-indigo-700 dark:text-indigo-300">🇩🇪 نسخهٔ طبیعی‌تر، مثل یک آلمانی‌زبان (برای الگوگیری)</div>
              <div dir="ltr" className="font-sans text-sm leading-8 whitespace-pre-wrap">{report.natural_de}</div>
              <button onClick={() => copy(report.natural_de)} className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-800 text-xs font-bold">📋 کپی</button>
            </div>
          )}
          {report.vocab.length > 0 && (
            <div className={card}>
              <div className="text-xs font-extrabold text-teal-700 dark:text-teal-300">💎 واژه‌ها و عبارت‌های بهتر</div>
              {report.vocab.map((v, i) => (
                <div key={i} className="text-sm leading-7 border-t border-slate-100 dark:border-slate-800 pt-1.5 first:border-0 first:pt-0">
                  <b dir="ltr" className="font-sans">{v.de}</b> — {v.fa}{v.note_fa ? <span className="text-[#5d6676] dark:text-[#a3adbd]"> ({v.note_fa})</span> : null}
                </div>
              ))}
            </div>
          )}
          {shadowOpen && <ShadowingModal freeText={report.corrected_de} word={SELF_WORD} onClose={() => setShadowOpen(false)} />}
        </div>
      )}
    </div>
  );
};
