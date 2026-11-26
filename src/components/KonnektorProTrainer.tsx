/**
 * KonnektorProTrainer.tsx — «حرف ربط انتخابی» (Sätze komplettieren)
 *
 * مثل تمرین کتاب: بخش اول جمله با حرف ربطِ هدف داده می‌شود و شما ادامه را می‌نویسید.
 * جملات را هوش مصنوعی طبق سطح انتخابی A1–C2 می‌سازد — یا فقط با حروف ربطی که خودت از
 * بانک کامل (src/data/konnektorenData.ts، ~۱۵۰ حرف ربط) انتخاب می‌کنی (یکی یا چندتا از همهٔ سطوح؛
 * با انتخاب حرف ربط، انتخاب سطح غیرفعال می‌شود).
 *
 * امکانات:
 *  - تصحیح سه‌لایه + ترجمهٔ فارسی جملهٔ نهایی (با همان دستور اول گرفته می‌شود، بعد از بررسی نمایش داده می‌شود)
 *  - چت درون‌خطی با معلمِ هوش مصنوعی برای همین جمله (با حافظهٔ گفتگوی همان جمله)
 *  - لمس هر کلمه → ترجمه فارسی درون‌متنی + مثال + افزودن به واژگان (پنجره وسط صفحه باز می‌شود)
 *  - آرشیو یکدست: «مشاهدهٔ آخرین عملکرد» (همان‌طور که بود) و «آزمون دوباره» (همان جمله‌ها، خالی و سفید)
 *  - همهٔ حذف‌ها اول تأییدیه می‌خواهند؛ چاپ/PDF دو صفحه‌ای
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { AppSettings, Word } from '../types';
import { speak } from '../utils/audio';
import { Lvl, Kat, KAT_LABEL, LVL_ORDER, KonnektorItem, KONNEKTOREN, connectorsFor, findKonnektor } from '../data/konnektorenData';
import { SYS_AI, buildExercisePrompt, buildCorrectionPrompt, buildWordPrompt, buildChatPrompt, ChatCtx } from '../utils/konnektorPrompts';
import { generateText, hasApiKey, describeAiError } from '../utils/aiProvider';
import { ArchivePanel, ArchiveRow, CountChips, LevelChips, MiniChip, PrimaryBtn, PrintPreview, Section, SqBtn, TopicInput, faDate, prFa, prG, toFa, useConfirm } from './trainerUI';
import { Printer } from 'lucide-react';
import { ClickableWords } from './WordLookup';
import { useVocabGate } from './VocabDecisionDialog';

/* ───────────────────────── پل هوش مصنوعی برنامه ───────────────────────── */

const askGemini = async (prompt: string, system?: string): Promise<string> =>
  generateText((system ? system + '\n\n' : '') + prompt, { json: true, timeoutMs: 90000, retries: 1 });

const askGeminiChat = async (prompt: string, system?: string): Promise<string> =>
  generateText((system ? system + '\n\n' : '') + prompt, { timeoutMs: 60000, retries: 1 });

const aiErrorText = (e: unknown): string => {
  try { return describeAiError(e); } catch { return 'خطای نامشخص در اتصال به معلم.'; }
};

const hasAIKey = (): boolean => { try { return !!hasApiKey(); } catch { return false; } };

/** تبدیل پاسخ AI به JSON حتی وقتی ```json یا متن اضافه دارد */
function parseJSONLoose<T>(raw: string): T {
  let s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const tryParse = (x: string): T | null => { try { return JSON.parse(x) as T; } catch { return null; } };
  let out = tryParse(s);
  if (out) return out;
  const a = s.indexOf('['), b = s.lastIndexOf(']');
  if (a >= 0 && b > a) { out = tryParse(s.slice(a, b + 1)); if (out) return out; }
  const ao = s.indexOf('{'), bo = s.lastIndexOf('}');
  if (ao >= 0 && bo > ao) { out = tryParse(s.slice(ao, bo + 1)); if (out) return out; }
  throw new Error('AI_PARSE');
}

const HKEY = 'konnektor_pro_history_v1';
const WORD_RE = /[A-Za-zÄÖÜäöüß]+(?:-[A-Za-zÄÖÜäöüß]+)*/g;
const QUICK_QS = ['چرا این‌طور درست است؟', 'یک مثال مشابه بده', 'ساده‌تر چطور بگویم؟', 'با حرف ربط دیگری هم می‌شود؟'];
const TOPIC_CHIPS = ['Alltag', 'Reise', 'Arbeit', 'Umwelt', 'Technik', 'Medien', 'Gesundheit'];

interface KItem { no: number; connector: string; first: string; hint?: string; }
interface Correction { no: number; ok: boolean; corrected: string; userFa?: string; fa?: string; grammar: string; meaning: string; thinking: string; }
interface ChatMsg { role: 'user' | 'ai'; text: string; }
interface KExercise {
  id: string; ts: number; level: Lvl; topic: string;
  items: KItem[];
  answers: Record<number, string>;
  /** تصحیحِ هر جمله پس از بررسی همان جمله اینجا ذخیره می‌شود (کلید = no) — جریان تک‌موردی */
  corrections: Record<number, Correction>;
  chats: Record<number, ChatMsg[]>;
}
interface WInfo { lemma: string; fa: string; pos: string; art?: string; ex?: string; exFa?: string; }

const loadHist = (): KExercise[] => {
  try {
    const h = JSON.parse(localStorage.getItem(HKEY) || '[]');
    if (!Array.isArray(h)) return [];
    // سازگاری با نسخهٔ قدیمی: corrections آرایه بود → تبدیل به Record بر اساس no
    return h.map((x: any) => ({
      ...x,
      corrections: Array.isArray(x?.corrections)
        ? Object.fromEntries((x.corrections as Correction[]).filter(Boolean).map((c: Correction) => [String(c.no), c]))
        : (x?.corrections && typeof x.corrections === 'object' ? x.corrections : {})
    })) as KExercise[];
  } catch { return []; }
};
const saveHist = (h: KExercise[]) => { try { localStorage.setItem(HKEY, JSON.stringify(h.slice(0, 30))); } catch { /* ignore */ } };

interface KonnektorProTrainerProps {
  settings?: AppSettings;
  onShowToast: (msg: string, isErr?: boolean) => void;
  onQuickAddWord?: (w: Partial<Word>) => boolean;
  /** کل کتابخانه — گیتِ تکراری/Partizip II/مترادف */
  words?: Word[];
  onViewWord?: (w: Word) => void;
  onClose?: () => void;
}

/** همهٔ حروف ربط بانک، مرتب بر اساس سطح و سپس الفبای آلمانی */
const ALL_KONNS: KonnektorItem[] = [...KONNEKTOREN].sort((a, b) => {
  const li = LVL_ORDER.indexOf(a.lvl) - LVL_ORDER.indexOf(b.lvl);
  return li !== 0 ? li : a.w.localeCompare(b.w, 'de');
});

export const KonnektorProTrainer: React.FC<KonnektorProTrainerProps> = ({ settings, onShowToast, onQuickAddWord, words, onViewWord, onClose }) => {
  const [screen, setScreen] = useState<'config' | 'play' | 'review'>('config');
  const [level, setLevel] = useState<Lvl>('A1');
  const [count, setCount] = useState(8);
  const [topic, setTopic] = useState('');
  const [selKons, setSelKons] = useState<KonnektorItem[]>([]);
  const [konsOpen, setKonsOpen] = useState(false);
  const [konsSearch, setKonsSearch] = useState('');
  const [ex, setEx] = useState<KExercise | null>(null);
  const [curNo, setCurNo] = useState(1); // جملهٔ جاری — جریان تک‌موردی (مثل تمرین فعل+حرف اضافه)
  const [generating, setGenerating] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [chatOpen, setChatOpen] = useState<number | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState<number | null>(null);
  const [wCard, setWCard] = useState<{ word: string; sentence: string; info: WInfo | null; loading: boolean } | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [hist, setHist] = useState<KExercise[]>(loadHist);
  const [guideOpen, setGuideOpen] = useState(false);
  const { ask, dialog } = useConfirm();
  const wCache = useRef<Map<string, WInfo>>(new Map());
  // گیت مرکزی افزودن به واژگان: تکراری / Partizip II فعل موجود / مترادف → دیالوگ تصمیم
  const gate = useVocabGate({
    words: words || [],
    onAdd: data => (onQuickAddWord ? onQuickAddWord(data) : false),
    onView: onViewWord,
    onDone: (data, ok) => { if (ok) { const de = String(data.de || ''); if (de) setAdded(a => new Set(a).add(de)); } }
  });

  // ذخیرهٔ خودکار (با تأخیر ۷۰۰ms تا هر حروف تایپ محاسبه نشود)
  useEffect(() => {
    if (!ex || !ex.items.length) return;
    const t = setTimeout(() => {
      const rest = loadHist().filter(x => x.id !== ex.id);
      const next = [ex, ...rest];
      saveHist(next);
      setHist(next);
    }, 700);
    return () => clearTimeout(t);
  }, [ex]);

  const doSpeak = (text: string) => {
    try {
      speak(text, { rate: settings?.rate, vreg: settings?.vreg, voiceName: settings?.voice });
    } catch {
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'de-DE';
        speechSynthesis.speak(u);
      } catch { /* ignore */ }
    }
  };

  // ────────── ساخت تمرین با هوش مصنوعی ──────────
  const generate = async () => {
    if (!hasAIKey()) { onShowToast('معلم در تنظیمات برنامه فعال نیست — از صفحهٔ تنظیمات فعالش کن.', true); return; }
    setGenerating(true);
    try {
      // اگر کاربر حرف ربط انتخاب کرده باشد فقط با همان‌ها ساخته می‌شود؛ وگرنه حروف ربطِ سطح
      const konns = selKons.length ? selKons : connectorsFor(level);
      const specOverride = selKons.length
        ? 'Der Schwierigkeitsgrad jedes Satzes richtet sich nach dem Niveau des jeweiligen ausgewählten Konnektors (gemischte Niveaus sind erlaubt).'
        : undefined;
      const raw = await askGemini(buildExercisePrompt(level, count, topic, konns, specOverride), SYS_AI);
      const items = parseJSONLoose<KItem[]>(raw);
      const clean: KItem[] = (Array.isArray(items) ? items : [])
        .filter(i => i && typeof i.first === 'string' && i.first.trim().length > 10)
        .map((i, idx) => ({ no: idx + 1, connector: String(i.connector || '').trim(), first: String(i.first).trim(), hint: i.hint ? String(i.hint).trim() : '' }));
      if (!clean.length) throw new Error('AI_EMPTY');
      const e: KExercise = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ts: Date.now(), level, topic: topic.trim(),
        items: clean, answers: {}, corrections: {}, chats: {}
      };
      setEx(e);
      setCurNo(1);
      setScreen('play');
      setChatOpen(null);
      setAdded(new Set());
      onShowToast(`تمرین با ${clean.length} جمله ساخته شد ✓`);
    } catch (e) {
      onShowToast(aiErrorText(e), true);
    } finally {
      setGenerating(false);
    }
  };

  // ────────── تصحیح فوری همان جمله (تک‌موردی) ──────────
  const checkOne = async () => {
    if (!ex || correcting) return;
    const it = ex.items[curNo - 1];
    if (!it) return;
    const ans = (ex.answers[it.no] || '').trim();
    if (!ans) { onShowToast('اول جمله را کامل کن، بعد بررسی کن.', true); return; }
    setCorrecting(true);
    try {
      const raw = await askGemini(buildCorrectionPrompt(ex.level, [it], { [it.no]: ans }), SYS_AI);
      const corr = parseJSONLoose<Correction[]>(raw);
      const c0 = (Array.isArray(corr) ? corr : []).find(c => c && typeof c.no === 'number')
        || { no: it.no, ok: false, corrected: '', fa: '', grammar: 'پاسخ بررسی نشد', meaning: '', thinking: '' };
      const merged: Record<number, Correction> = { ...ex.corrections, [it.no]: { ...c0, no: it.no } };
      setEx({ ...ex, corrections: merged });
      onShowToast(c0.ok ? '✓ قابل قبول بود' : 'بررسی شد — بازخورد زیر جمله است.');
    } catch (e) {
      onShowToast(aiErrorText(e), true);
    } finally {
      setCorrecting(false);
    }
  };

  // جملهٔ بعدی — یا در آخرین جمله، نتیجهٔ جلسه
  const nextItem = () => {
    if (!ex) return;
    if (curNo >= ex.items.length) { setScreen('review'); setChatOpen(null); return; }
    setCurNo(curNo + 1);
    setChatOpen(null);
  };

  // رد کردن بدون بررسی
  const skipItem = () => { nextItem(); };

  // ادامهٔ موارد بررسی‌نشده از صفحهٔ نتیجه
  const continueRemaining = () => {
    if (!ex) return;
    const open = ex.items.find(i => !ex.corrections[i.no]);
    if (open) setCurNo(open.no);
    setScreen('play');
    setChatOpen(null);
  };

  // ────────── چت درون‌خطیِ هر جمله ──────────
  const sendChat = async (no: number, text: string) => {
    if (!ex) return;
    const q = text.trim();
    if (!q || chatBusy !== null) return;
    const item = ex.items.find(i => i.no === no);
    if (!item) return;
    const hist0 = ex.chats[no] || [];
    const corr = (ex.corrections && ex.corrections[no]) || null;
    setChatBusy(no);
    setChatInput('');
    setEx({ ...ex, chats: { ...ex.chats, [no]: [...hist0, { role: 'user', text: q }] } });
    try {
      const ctx: ChatCtx = {
        no, connector: item.connector, first: item.first,
        userText: ex.answers[no] || '', question: q,
        correction: corr, history: hist0
      };
      const ans = await askGeminiChat(buildChatPrompt(ctx, ex.level), SYS_AI);
      setEx(prev => prev
        ? { ...prev, chats: { ...prev.chats, [no]: [...(prev.chats[no] || []), { role: 'ai', text: ans.trim() }] } }
        : prev);
    } catch (e) {
      onShowToast(aiErrorText(e), true);
      setEx(prev => prev ? { ...prev, chats: { ...prev.chats, [no]: (prev.chats[no] || []).filter(m => !(m.role === 'user' && m.text === q)) } } : prev);
      setChatInput(q);
    } finally {
      setChatBusy(null);
    }
  };

  // ────────── لمس کلمه: ترجمهٔ هوش مصنوعی درون‌متنی ──────────
  const tapWord = (e: React.MouseEvent, token: string, sentence: string) => {
    e.stopPropagation();
    const cached = wCache.current.get(token.toLowerCase());
    if (cached) { setWCard({ word: token, sentence, info: cached, loading: false }); return; }
    setWCard({ word: token, sentence, info: null, loading: true });
    if (!hasAIKey()) {
      setWCard({ word: token, sentence, info: { lemma: token, fa: 'برای ترجمهٔ خودکار، معلم را در تنظیمات برنامه فعال کن.', pos: 'other' }, loading: false });
      return;
    }
    const lvl = ex?.level || level;
    askGemini(buildWordPrompt(token, sentence, lvl), SYS_AI)
      .then(raw => parseJSONLoose<WInfo>(raw))
      .then(info => {
        wCache.current.set(token.toLowerCase(), info);
        setWCard(prev => (prev && prev.word === token) ? { ...prev, info, loading: false } : prev);
      })
      .catch(err => {
        setWCard(prev => (prev && prev.word === token) ? { ...prev, info: { lemma: token, fa: '⚠ ' + aiErrorText(err), pos: 'other' }, loading: false } : prev);
      });
  };

  const tapKonnektor = (e: React.MouseEvent, w: string) => {
    e.stopPropagation();
    const k = findKonnektor(w) || connectorsFor(level).find(x => x.w === w);
    if (!k) return;
    setWCard({ word: k.w, sentence: '', info: { lemma: k.w, fa: k.fa + (k.note ? ' — ' + k.note : ''), pos: 'phrase' }, loading: false });
  };

  /** لمس واژه از متن‌های غیرلمس‌پذیر (بازخورد/مرور) — بدون رویداد ماوس */
  const tapTok = (token: string, sentence: string) => {
    tapWord({ stopPropagation: () => {} } as unknown as React.MouseEvent, token, sentence);
  };

  const addWord = () => {
    const wc = wCard;
    if (!wc || !wc.info) return;
    const de = wc.info.lemma || wc.word;
    if (!onQuickAddWord) { onShowToast('افزودن به واژگان در این بخش متصل نشده است.', true); return; }
    if (added.has(de)) { onShowToast('این واژه همین حالا اضافه شده بود.'); return; }
    const w = { de, fa: wc.info.fa, pos: wc.info.pos, art: wc.info.art || undefined, lvl: ex?.level || level, ex: wc.info.ex || '', exFa: wc.info.exFa || '' } as unknown as Partial<Word>;
    // مسیر گیت: تکراری/P2/مترادف → دیالوگ تصمیم؛ تازه → افزودن مستقیم (toast در App)
    gate.attempt(w);
  };

  /** مشاهدهٔ آخرین عملکرد: همان تمرین با پاسخ‌ها و تصحیح‌های قبلی */
  const openFromHistory = (h: KExercise) => {
    setEx(h);
    setLevel(h.level);
    setTopic(h.topic);
    const open = h.items.find(i => !h.corrections || !h.corrections[i.no]);
    if (open) { setScreen('play'); setCurNo(open.no); } else { setScreen('review'); }
    setChatOpen(null);
  };

  /** آزمون دوباره: همین جمله‌ها، بدون پاسخ و سفید از اول */
  const retakeFromHistory = (h: KExercise) => {
    setEx({ ...h, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ts: Date.now(), answers: {}, corrections: {}, chats: {} });
    setLevel(h.level);
    setTopic(h.topic);
    setCurNo(1);
    setScreen('play');
    setChatOpen(null);
    setAdded(new Set());
  };

  const toggleKons = (k: KonnektorItem) => {
    setSelKons(prev => prev.some(x => x.w === k.w) ? prev.filter(x => x.w !== k.w) : [...prev, k]);
  };

  const corrList = ex?.corrections ? Object.values(ex.corrections) : [];
  const checkedCount = corrList.length;
  const okCount = corrList.filter(c => c?.ok).length;
  const uncheckedCount = ex ? Math.max(0, ex.items.length - checkedCount) : 0;

  // راهنمای حروف ربطِ سطح، دسته‌بندی‌شده
  const byCat = useMemo(() => {
    const m = new Map<Kat, KonnektorItem[]>();
    connectorsFor(level).forEach(k => {
      if (!m.has(k.cat)) m.set(k.cat, []);
      m.get(k.cat)!.push(k);
    });
    return m;
  }, [level]);

  // ────────── قطعه‌های مشترک رندر ──────────
  const renderGermanWords = (text: string, keyBase: string, sentence: string) => {
    const pieces = text.split(new RegExp(`(${WORD_RE.source})`, 'g'));
    return pieces.map((p, i) => {
      if (!p) return null;
      if (/^[A-Za-zÄÖÜäöüß-]+$/.test(p)) {
        return (
          <button
            key={`${keyBase}-w${i}`}
            onClick={e => tapWord(e, p, sentence)}
            className="hover:bg-[#1f5fbf]/10 dark:hover:bg-[#7fb0ff]/15 rounded px-0.5 transition-colors"
            title="ترجمهٔ فارسی"
          >
            {p}
          </button>
        );
      }
      return <span key={`${keyBase}-p${i}`}>{p}</span>;
    });
  };

  /* ⚠️ رندر مستقیم چت (نه کامپوننت داخل رندر) — با هر حرف تایپ دوباره mount نشود
     تا کیبورد موبایل باز بماند (رفع باگ درخواست کاربر). */
  const renderChatBox = (no: number): React.ReactElement => {
    const msgs = ex?.chats[no] || [];
    return (
      <div className="rounded-xl border border-[#1f5fbf]/40 bg-blue-50/40 dark:bg-blue-950/20 dark:border-[#7fb0ff]/30 p-2.5 space-y-2" dir="rtl">
        <div className="flex items-center justify-between text-xs font-bold text-[#5d6676]">
          <span>💬 گفتگو با معلم دربارهٔ جملهٔ {toFa(no)}</span>
          <button onClick={() => setChatOpen(null)} className="w-7 h-7 rounded bg-white/70 dark:bg-[#141923] flex items-center justify-center">✕</button>
        </div>
        <div className="max-h-56 overflow-y-auto space-y-2">
          {msgs.length === 0 && <p className="text-xs text-[#5d6676]">هر سؤالی دربارهٔ همین جمله داری بپرس — معلم با تصحیحِ همین جمله در گفتگو جواب می‌دهد.</p>}
          {msgs.map((m, i) => (
            <div
              key={i}
              className={`text-[13px] leading-6 rounded-lg px-2.5 py-1.5 max-w-[88%] ${m.role === 'user'
                ? 'bg-[#1f5fbf] text-white ml-auto'
                : 'bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a]'}`}
              style={{ whiteSpace: 'pre-wrap' }}
            >
              {m.text}
            </div>
          ))}
          {chatBusy === no && <div className="text-xs text-[#5d6676] animate-pulse">معلم دارد می‌نویسد…</div>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_QS.map(q => (
            <button
              key={q}
              onClick={() => sendChat(no, q)}
              disabled={chatBusy === no}
              className="text-xs bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-full px-3 py-1.5 transition disabled:opacity-40"
            >
              {q}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') sendChat(no, chatInput); }}
            placeholder="دربارهٔ همین جمله بپرس…"
            className="flex-1 min-w-0 border-2 border-[#1f5fbf]/50 dark:border-[#7fb0ff]/40 rounded-lg px-3 py-2 text-base bg-white dark:bg-[#141923] outline-none"
          />
          <button
            onClick={() => sendChat(no, chatInput)}
            disabled={chatBusy === no || !chatInput.trim()}
            className="w-10 h-10 rounded-lg bg-[#1f5fbf] text-white flex items-center justify-center flex-shrink-0 disabled:opacity-40"
            aria-label="ارسال"
          >
            ↑
          </button>
        </div>
      </div>
    );
  };

  // ────────── برگهٔ چاپ مشترک (PrintPreview): صفحهٔ ۱ سؤال‌ها، صفحهٔ ۲ تصحیح‌شده ──────────
  /* برگهٔ چاپ مشترک — printHist: تمرین هدف چاپ از تاریخچه، یا null (= تمرین جاری) */
  const [printHist, setPrintHist] = useState<KExercise | null>(null);
  const pEx = printHist || ex;
  const printMeta = pEx
    ? `سطح ${pEx.level}${pEx.topic ? ` • ${pEx.topic}` : ''} • تاریخ: ${faDate(pEx.ts)} • ${pEx.items.length} جمله • امتیاز: … / ${pEx.items.length}`
    : '';

  const printQuestions = pEx ? (
    <>
      <p style={prFa({ fontSize: 11, color: '#333', marginBottom: 10 })}>
        Ergänzen Sie die Sätze sinnvoll und sprachlich richtig! — ادامهٔ هر جمله را طوری بنویسید که معنایی کامل و ساختار درست (جایگاه فعل، کاما) داشته باشد.
      </p>
      <ol style={{ margin: '10px 0 0', paddingInlineStart: 20, listStyle: 'decimal' }}>
        {pEx.items.map(it => (
          <li key={it.no} style={{ fontSize: 12.5, marginBottom: 18, lineHeight: 1.9, breakInside: 'avoid' }}>
            <span style={prG()}>
              {it.first} <span style={{ letterSpacing: 1 }}>__________________</span>
              {it.hint ? <b> ({it.hint})</b> : null}
            </span>
            <div style={{ borderBottom: '1.1px solid #999', height: 24, marginTop: 10 }} />
          </li>
        ))}
      </ol>
    </>
  ) : null;

  const printSolutions = pEx && Object.keys(pEx.corrections).length > 0 ? (
    <>
      {pEx.items.map(it => {
        const c = pEx.corrections[it.no];
        return (
          <div key={it.no} style={{ fontSize: 11, marginBottom: 12, breakInside: 'avoid' }}>
            <div style={prG({ fontSize: 11.5, fontWeight: 700, color: c?.ok ? '#047857' : '#b45309' })}>
              {it.no}. {c?.corrected || '(بدون پاسخ)'}
            </div>
            {c?.userFa && <div style={prFa({ color: '#333', marginTop: 2 })}>🇮🇷 ترجمهٔ جملهٔ تو: {c.userFa}</div>}
            {c?.fa && <div style={prFa({ color: '#333', marginTop: 1 })}>🇮🇷 ترجمهٔ جملهٔ اصلاح‌شده: {c.fa}</div>}
            <div style={prFa({ color: '#555', marginTop: 1 })}>پاسخ شما: {(pEx.answers[it.no] || '').trim() || '—'}</div>
            {c?.grammar && <div style={prFa({ marginTop: 2 })}>• گرامری: {c.grammar}</div>}
            {c?.meaning && <div style={prFa({})}>• مفهومی: {c.meaning}</div>}
            {c?.thinking && <div style={prFa({})}>• تفکر آلمانی: {c.thinking}</div>}
          </div>
        );
      })}
    </>
  ) : pEx ? (
    <ol style={{ margin: 0, paddingInlineStart: 20, listStyle: 'decimal' }}>
      {pEx.items.map(it => (
        <li key={it.no} style={{ fontSize: 11.5, marginBottom: 7, lineHeight: 1.8, breakInside: 'avoid' }}>
          <span style={prG()}>{it.no}. <b>{it.first}</b> — پاسخ تو: {(pEx.answers[it.no] || '').trim() || '(بدون پاسخ)'}</span>
        </li>
      ))}
    </ol>
  ) : null;

  const printPreview = pEx ? (
    <PrintPreview
      open={printOpen}
      onClose={() => { setPrintOpen(false); setPrintHist(null); }}
      title={<span dir="ltr" style={{ fontFamily: 'Georgia, serif' }}>Sätze komplettieren</span>}
      docTitle="Sätze komplettieren — Konnektoren"
      meta={<>{`حرف ربط انتخابی (سطح ${pEx.level})`}</>}
      questions={printQuestions}
      solutions={printSolutions}
    />
  ) : null;

  // ═══════════════════ رندر ═══════════════════
  return (
    <div className="space-y-3 text-right">
      {/* ═════════ پیکربندی ═════════ */}
      {screen === 'config' && (
        <div className="space-y-3">
          <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 space-y-4 shadow-xs">
            {/* ۱. حروف ربط (اختیاری) — لیست کشویی همهٔ سطوح */}
            <Section n="۱" label="حروف ربط (اختیاری)" hint="انتخاب نکنی = حروف ربطِ سطح">
              <button
                onClick={() => setKonsOpen(o => !o)}
                className="w-full flex items-center justify-between gap-2 border-2 border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-[#141923]"
              >
                <span className="font-bold">
                  {selKons.length === 0
                    ? <span className="text-[#5d6676] dark:text-[#a3adbd]">همهٔ حروف ربط سطح انتخابی (لیست کشویی)</span>
                    : <span>انتخاب شده: {toFa(selKons.length)} حرف ربط</span>}
                </span>
                <span className="text-[#5d6676]">{konsOpen ? '▲' : '▼'}</span>
              </button>

              {selKons.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {selKons.map(k => (
                    <button key={k.w} onClick={() => toggleKons(k)} dir="ltr" className="text-[11px] font-bold font-sans bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-full px-2 py-0.5">
                      {k.w} ✕
                    </button>
                  ))}
                  <button onClick={() => setSelKons([])} className="text-[11px] font-bold text-red-500 px-2">پاک کردن انتخاب‌ها</button>
                </div>
              )}

              {konsOpen && (
                <div className="mt-2 rounded-xl border border-[#dde1ea] dark:border-[#333b4a] overflow-hidden">
                  <div className="p-2 border-b border-[#dde1ea] dark:border-[#333b4a] bg-slate-50 dark:bg-[#141923]">
                    <input
                      value={konsSearch}
                      onChange={e => setKonsSearch(e.target.value)}
                      placeholder="جستجو بین همهٔ حروف ربط (آلمانی یا فارسی)…"
                      className="w-full border border-[#dde1ea] dark:border-[#333b4a] rounded-lg px-3 py-2 text-sm bg-white dark:bg-[#1b2029] outline-none focus:border-[#1f5fbf]"
                    />
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {ALL_KONNS
                      .filter(k => !konsSearch.trim() || k.w.toLowerCase().includes(konsSearch.toLowerCase()) || (k.fa || '').includes(konsSearch.trim()))
                      .map(k => {
                        const on = selKons.some(x => x.w === k.w);
                        return (
                          <button
                            key={k.lvl + k.w}
                            onClick={() => toggleKons(k)}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-right border-b border-slate-100 dark:border-slate-800 last:border-0 transition ${on ? 'bg-emerald-50/70 dark:bg-emerald-950/30' : 'hover:bg-slate-50 dark:hover:bg-[#141923]'}`}
                          >
                            <span className={`w-5 h-5 rounded-md border flex items-center justify-center text-[11px] flex-shrink-0 ${on ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>{on ? '✓' : ''}</span>
                            <span dir="ltr" className="font-sans font-bold text-sm text-slate-800 dark:text-slate-100 whitespace-nowrap">{k.w}</span>
                            <span className="text-[11px] text-[#5d6676] dark:text-[#a3adbd] truncate flex-1">{k.fa}{k.note ? ` — ${k.note}` : ''}</span>
                            <span className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-0.5 text-[#5d6676] flex-shrink-0">{k.lvl}</span>
                          </button>
                        );
                      })}
                    {ALL_KONNS.filter(k => !konsSearch.trim() || k.w.toLowerCase().includes(konsSearch.toLowerCase()) || (k.fa || '').includes(konsSearch.trim())).length === 0 && (
                      <p className="text-xs text-[#5d6676] p-3 text-center">حرف ربطی با این نام پیدا نشد.</p>
                    )}
                  </div>
                </div>
              )}
            </Section>

            {/* ۲. سطح — با انتخاب حرف ربط غیرفعال می‌شود */}
            <Section n="۲" label="سطح" hint={selKons.length > 0 ? 'با انتخاب حرف ربط غیرفعال است' : undefined} disabled={selKons.length > 0}>
              <LevelChips value={level} onChange={l => setLevel(l as Lvl)} levels={LVL_ORDER as unknown as string[]} />
            </Section>

            {/* ۳. تعداد — فقط عدد */}
            <Section n="۳" label="تعداد جمله‌ها">
              <CountChips value={count} onChange={setCount} counts={[5, 8, 10, 12]} />
            </Section>

            {/* ۴. موضوع */}
            <Section n="۴" label="موضوع (اختیاری)">
              <TopicInput value={topic} onChange={setTopic} chips={TOPIC_CHIPS} />
            </Section>

            {/* راهنمای حروف ربط سطح */}
            <div className="rounded-xl border border-[#dde1ea] dark:border-[#333b4a] overflow-hidden">
              <button onClick={() => setGuideOpen(o => !o)} className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold">
                <span>📚 راهنمای حروف ربط سطح {level} ({connectorsFor(level).length} مورد)</span>
                <span className="text-[#5d6676]">{guideOpen ? '▲' : '▼'}</span>
              </button>
              {guideOpen && (
                <div className="px-3 pb-3 max-h-72 overflow-y-auto space-y-2">
                  {[...byCat.entries()].map(([cat, items]) => (
                    <div key={cat}>
                      <div className="text-[11px] font-extrabold text-[#1f5fbf] dark:text-[#7fb0ff] mb-1">{KAT_LABEL[cat]}</div>
                      <div className="space-y-1">
                        {items.map(k => (
                          <div key={k.w} className="flex items-start gap-1.5 text-[11px] leading-5">
                            <button
                              onClick={e => tapKonnektor(e, k.w)}
                              dir="ltr"
                              className="font-sans font-bold bg-slate-100 dark:bg-slate-800 rounded px-1.5 text-left hover:bg-[#1f5fbf]/10 transition whitespace-nowrap"
                            >
                              {k.w}
                            </button>
                            <span className="text-[#5d6676]">{k.fa}{k.note ? ` — ${k.note}` : ''}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <PrimaryBtn onClick={generate} busy={generating} busyLabel="⏳ معلم دارد جمله‌ها را می‌سازد…" label="🚀 ساخت تمرین" />
          </div>

          {/* آرشیو یکدست: مشاهدهٔ آخرین عملکرد + آزمون دوباره + حذف با تأیید */}
          <ArchivePanel
            title="تمرین‌های ذخیره‌شده"
            count={hist.length}
            emptyText="هنوز تمرینی ساخته نشده است."
            footer={hist.length > 0 ? (
              <button
                onClick={async () => {
                  if (await ask('پاک کردن کل تاریخچه', `همهٔ ${hist.length} تمرین ذخیره‌شده برای همیشه حذف می‌شوند. مطمئن هستی؟`)) {
                    saveHist([]); setHist([]);
                  }
                }}
                className="text-xs text-red-500 px-2 py-1"
              >
                پاک کردن کل تاریخچه
              </button>
            ) : undefined}
          >
            {hist.map(h => (
              <ArchiveRow
                key={h.id}
                title={<>سطح {h.level} • {h.items.length} جمله{h.topic ? ` • ${h.topic}` : ''}{h.corrections && Object.keys(h.corrections).length > 0 ? <span className="text-emerald-600"> • تصحیح‌شده {Object.values(h.corrections).filter(c => c.ok).length}/{h.items.length}</span> : ''}</>}
                chips={<>
                  <MiniChip>{faDate(h.ts)}</MiniChip>
                  <MiniChip>پاسخ‌داده: {h.items.filter(i => (h.answers[i.no] || '').trim()).length}/{h.items.length}</MiniChip>
                  {h.chats && Object.keys(h.chats).length > 0 && <MiniChip tone="blue">💬 {toFa(Object.keys(h.chats).length)}</MiniChip>}
                </>}
              >
                <SqBtn onClick={() => openFromHistory(h)} title="مشاهدهٔ آخرین عملکرد">▶</SqBtn>
                <SqBtn tone="green" onClick={() => retakeFromHistory(h)} title="آزمون دوباره (همان جمله‌ها، خالی)">🔁</SqBtn>
                <SqBtn onClick={() => { setPrintHist(h); setPrintOpen(true); }} title="برگهٔ A4 این تمرین ذخیره‌شده — سؤال‌ها و پاسخنامه">
                  <Printer size={15} />
                </SqBtn>
                <SqBtn
                  tone="red"
                  onClick={async () => {
                    if (await ask('حذف تمرین', 'این تمرین از تاریخچه برای همیشه حذف می‌شود. مطمئن هستی؟')) {
                      const next = loadHist().filter(x => x.id !== h.id);
                      saveHist(next); setHist(next);
                    }
                  }}
                  title="حذف"
                >🗑</SqBtn>
              </ArchiveRow>
            ))}
          </ArchivePanel>
        </div>
      )}

      {/* ═════════ در حال تمرین — جمله به جمله با تصحیح فوری ═════════ */}
      {screen === 'play' && ex && (() => {
        const it = ex.items[curNo - 1];
        if (!it) return null;
        const c = ex.corrections[it.no];
        const ans = ex.answers[it.no] || '';
        const isLast = curNo >= ex.items.length;
        const pct = Math.round((curNo / ex.items.length) * 100);
        return (
          <div className="space-y-3">
            <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 shadow-xs">
              <div className="flex items-center justify-between gap-2 text-xs mb-1.5">
                <div className="flex flex-wrap gap-1.5">
                  <span className="bg-blue-50 dark:bg-blue-950/40 text-[#1f5fbf] dark:text-[#7fb0ff] rounded-full px-2 py-0.5 font-bold">سطح {ex.level}</span>
                  {ex.topic && <span className="bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 rounded-full px-2 py-0.5 font-bold">{ex.topic}</span>}
                </div>
                <div className="text-[#5d6676] font-bold">جملهٔ {toFa(curNo)} از {toFa(ex.items.length)}</div>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mb-3">
                <div className="h-full bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] transition-all duration-300" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-[11px] text-[#5d6676] leading-5 mb-3">
                جمله را کامل کن و «بررسی همین جمله» را بزن — همان‌جا تصحیح و بازخورد سه‌لایه می‌گیری؛
                با 💬 همان‌جا از معلم بپرس، بعد با «بعدی» برو سراغ جملهٔ بعد.
                روی حرف ربط سبز بزنی نکتهٔ گرامری‌اش را می‌بینی و روی هر کلمه بزنی ترجمهٔ فارسی می‌آید.
              </p>

              <div className="rounded-xl border border-[#dde1ea] dark:border-[#333b4a] p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-bold bg-slate-100 dark:bg-slate-800 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0">{toFa(it.no)}</span>
                    <button
                      onClick={e => tapKonnektor(e, it.connector)}
                      dir="ltr"
                      className="text-[11px] font-bold font-sans bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-full px-2 py-0.5 transition"
                      title="نکتهٔ این حرف ربط"
                    >
                      {it.connector}
                    </button>
                    {it.hint && <span className="text-[11px] text-orange-600 dark:text-orange-400 font-bold">({it.hint})</span>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => doSpeak(it.first + ' ' + ans)}
                      className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-sm"
                      title="تلفظ"
                      aria-label="تلفظ"
                    >
                      🔊
                    </button>
                    <button
                      onClick={() => setChatOpen(chatOpen === it.no ? null : it.no)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm transition ${(ex.chats[it.no] || []).length || chatOpen === it.no
                        ? 'bg-[#1f5fbf] text-white'
                        : 'bg-slate-100 dark:bg-slate-800'}`}
                      title="گفتگو دربارهٔ این جمله"
                      aria-label="گفتگو دربارهٔ این جمله"
                    >
                      💬
                    </button>
                  </div>
                </div>
                <p dir="ltr" className="font-sans text-[15px] md:text-base leading-[2] text-slate-800 dark:text-slate-100" style={{ textAlign: 'left' }}>
                  {renderGermanWords(it.first, `it${it.no}`, it.first)}
                  <span className="inline-block border-b-2 border-dashed border-[#1f5fbf] dark:border-[#7fb0ff] w-10 mx-1 align-baseline" />
                </p>
                <textarea
                  rows={2}
                  dir="ltr"
                  readOnly={!!c}
                  value={ans}
                  onChange={e => setEx({ ...ex, answers: { ...ex.answers, [it.no]: e.target.value } })}
                  placeholder="ادامهٔ جمله را آلمانی بنویس…"
                  className="w-full border-2 border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 text-base font-sans bg-white dark:bg-[#141923] outline-none focus:border-[#1f5fbf] dark:focus:border-[#7fb0ff] transition text-left"
                />

                {/* بازخورد فوری همان‌جا — بعد از بررسی */}
                {c && (
                  <div className={`rounded-xl p-3 space-y-2 border ${c.ok ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' : 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800'}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold ${c.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-400'}`}>{c.ok ? '✓ قابل قبول' : '✗ نیاز به اصلاح'}</span>
                      <button onClick={() => doSpeak(c.corrected || it.first + ' ' + ans)} className="text-base" title="تلفظ جملهٔ درست">🔊</button>
                    </div>
                    {!c.ok && ans.trim() && (
                      <div dir="ltr" className="text-sm leading-7" style={{ textAlign: 'left' }}>
                        <span className="text-[#5d6676] font-sans"><ClickableWords text={it.first} onWord={t => tapTok(t, it.first)} /> </span>
                        <b className="text-red-500 line-through decoration-1 font-sans">{ans}</b>
                      </div>
                    )}
                    {c.corrected && (
                      <div dir="ltr" className="text-sm leading-7 font-sans font-bold text-emerald-900 dark:text-emerald-200" style={{ textAlign: 'left' }}><ClickableWords text={c.corrected} onWord={t => tapTok(t, c.corrected || '')} /></div>
                    )}
                    {/* ترجمهٔ جملهٔ کاربر — اول از همه (درخواست کاربر) */}
                    {c.userFa && (
                      <div className="text-xs leading-6 rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900 p-2.5">
                        <b className="text-sky-700 dark:text-sky-300">🇮🇷 ترجمهٔ جملهٔ تو:</b> {c.userFa}
                      </div>
                    )}
                    {/* ترجمهٔ فارسی جملهٔ اصلاح‌شده — بعد از آن */}
                    {c.fa && (
                      <div className="text-xs leading-6 rounded-lg bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900 p-2.5">
                        <b className="text-sky-700 dark:text-sky-300">🇮🇷 ترجمهٔ جملهٔ اصلاح‌شده:</b> {c.fa}
                      </div>
                    )}
                    {c.grammar && (
                      <div className="text-xs leading-6 rounded-lg bg-white/70 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] p-2.5">
                        <b className="text-[#1f5fbf] dark:text-[#7fb0ff]">📐 گرامری:</b> {c.grammar}
                      </div>
                    )}
                    {c.meaning && (
                      <div className="text-xs leading-6 rounded-lg bg-white/70 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] p-2.5">
                        <b className="text-[#1f5fbf] dark:text-[#7fb0ff]">🧭 مفهومی:</b> {c.meaning}
                      </div>
                    )}
                    {c.thinking && (
                      <div className="text-xs leading-6 rounded-lg bg-white/70 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] p-2.5">
                        <b className="text-[#1f5fbf] dark:text-[#7fb0ff]">🇩🇪 تفکر آلمانی:</b> {c.thinking}
                      </div>
                    )}
                    <p className="text-[11px] text-[#5d6676]">سؤال داری؟ با 💬 همین‌جا از معلم بپرس، بعد «بعدی» را بزن.</p>
                  </div>
                )}
                {chatOpen === it.no && renderChatBox(it.no)}
              </div>

              {c ? (
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <button onClick={nextItem} className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white py-3 rounded-xl text-sm font-bold transition">
                    {isLast ? '🏁 پایان و دیدن نتیجه' : 'بعدی ←'}
                  </button>
                  <button onClick={() => setChatOpen(chatOpen === it.no ? null : it.no)} className="border-2 border-[#1f5fbf]/40 text-[#1f5fbf] dark:text-[#7fb0ff] py-3 rounded-xl text-sm font-bold transition">
                    💬 چت با معلم{(ex.chats[it.no] || []).length ? ` (${(ex.chats[it.no] || []).length})` : ''}
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5 mt-3">
                  <button
                    onClick={checkOne}
                    disabled={correcting || !ans.trim()}
                    className="w-full bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white py-3 rounded-xl text-sm font-bold transition disabled:opacity-60"
                  >
                    {correcting ? '⏳ معلم دارد همین جمله را بررسی می‌کند…' : '✅ بررسی همین جمله'}
                  </button>
                  <button onClick={skipItem} disabled={correcting} className="w-full text-[11px] text-[#5d6676] dark:text-[#a3adbd] py-1">
                    {isLast ? 'رد کردن و رفتن به نتیجه' : 'رد کردن بدون بررسی ←'}
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2">
              <button onClick={() => { setScreen('config'); setEx(null); setChatOpen(null); }} className="bg-slate-100 dark:bg-slate-800 py-2.5 rounded-xl text-xs font-bold transition">بازگشت به فهرست</button>
            </div>
          </div>
        );
      })()}

      {/* ═════════ نتیجهٔ جلسه و مرور — حتی وقتی هیچ جمله‌ای بررسی نشده (تصویر ۱۴) ═════════ */}
      {screen === 'review' && ex && Object.keys(ex.corrections).length === 0 && (
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-6 text-center space-y-3 shadow-xs">
          <div className="text-5xl">🤷</div>
          <div className="text-lg font-extrabold">هیچ جمله‌ای را بررسی نکردی!</div>
          <p className="text-xs text-[#5d6676] leading-6">
            هر {toFa(ex.items.length)} جمله را بدون جواب رد کردی — نتیجه‌ای برای نمایش نیست.
            برای تصحیح معلم، جمله‌ها را کامل کن و «بررسی همین جمله» را بزن؛ یا یک تمرین تازه بساز.
          </p>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button onClick={continueRemaining} className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white py-2.5 rounded-xl text-xs font-bold">
              ✏️ شروع از جملهٔ اول
            </button>
            <button onClick={generate} disabled={generating} className="bg-slate-100 dark:bg-slate-800 py-2.5 rounded-xl text-xs font-bold disabled:opacity-60">
              {generating ? '⏳ …' : '✨ تمرین جدید'}
            </button>
          </div>
          <button onClick={() => { setScreen('config'); setEx(null); setChatOpen(null); }} className="w-full bg-slate-100 dark:bg-slate-800 py-2 rounded-xl text-xs font-bold">
            بازگشت به فهرست
          </button>
        </div>
      )}
      {screen === 'review' && ex && Object.keys(ex.corrections).length > 0 && (
        <div className="space-y-3">
          <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-5 text-center shadow-xs">
            <div className="text-4xl">{okCount === checkedCount && checkedCount === ex.items.length ? '🏆' : okCount >= ex.items.length * 0.7 ? '🎉' : '💪'}</div>
            <div className="text-2xl font-extrabold mt-2">{okCount} / {checkedCount} قابل قبول</div>
            <p className="text-xs text-[#5d6676] mt-1">
              {uncheckedCount > 0 && <>{uncheckedCount} جمله بررسی‌نشده ماند. </>}
              زیر هر جمله: تصحیح معلم + سه لایهٔ بازخورد (گرامری / مفهومی / تفکر آلمانی).
              با 💬 دربارهٔ هر جمله سؤال بپرس — معلم با همان تصحیح در گفتگو جواب می‌دهد.
            </p>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <button onClick={generate} disabled={generating} className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white py-2.5 rounded-xl text-xs font-bold disabled:opacity-60">
                {generating ? '⏳ …' : '✨ تمرین جدید (همین سطح)'}
              </button>
              {uncheckedCount > 0
                ? <button onClick={continueRemaining} className="bg-[#1f5fbf] text-white py-2.5 rounded-xl text-xs font-bold">✏️ ادامهٔ {uncheckedCount} جملهٔ باقی‌مانده</button>
                : <button onClick={() => { setScreen('play'); setChatOpen(null); }} className="bg-[#1f5fbf] text-white py-2.5 rounded-xl text-xs font-bold">✏️ مرور جمله‌ها</button>}
              <button onClick={() => { setPrintHist(null); setPrintOpen(true); }} disabled={!ex}
                title="برگهٔ A4 — سؤال‌ها + پاسخنامه" aria-label="برگهٔ A4"
                className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold flex items-center justify-center disabled:opacity-40"><Printer size={15} /></button>
              <button onClick={() => { setScreen('config'); setEx(null); }} className="bg-slate-100 dark:bg-slate-800 py-2.5 rounded-xl text-xs font-bold">بازگشت به فهرست</button>
            </div>
          </div>

          <div className="space-y-3">
            {ex.items.map(it => {
              const c = ex.corrections[it.no];
              const userAns = (ex.answers[it.no] || '').trim();
              if (!c) {
                return (
                  <div key={it.no} className="bg-white dark:bg-[#1b2029] border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 shadow-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold bg-slate-100 dark:bg-slate-800 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0">{toFa(it.no)}</span>
                        <span className="text-xs font-bold text-[#5d6676]">بدون بررسی</span>
                      </div>
                      <button onClick={() => { setCurNo(it.no); setScreen('play'); setChatOpen(null); }} className="text-[11px] px-3 py-1.5 rounded-lg bg-[#1f5fbf] text-white font-bold">
                        بررسی کن
                      </button>
                    </div>
                    <div dir="ltr" className="text-sm leading-7 mt-2 font-sans" style={{ textAlign: 'left' }}>
                      <span className="text-[#5d6676]"><ClickableWords text={it.first} onWord={t => tapTok(t, it.first)} /> </span><b><ClickableWords text={userAns || '—'} onWord={t => tapTok(t, it.first + ' ' + userAns)} /></b>
                    </div>
                  </div>
                );
              }
              return (
                <div key={it.no} className={`bg-white dark:bg-[#1b2029] border rounded-2xl p-4 space-y-2.5 shadow-xs ${c.ok ? 'border-emerald-300 dark:border-emerald-800' : 'border-red-300 dark:border-red-800'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold bg-slate-100 dark:bg-slate-800 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0">{toFa(it.no)}</span>
                    <span className={`text-xs font-bold ${c.ok ? 'text-emerald-600' : 'text-red-500'}`}>{c.ok ? '✓ قابل قبول' : '✗ نیاز به اصلاح'}</span>
                    <button
                      onClick={() => setChatOpen(chatOpen === it.no ? null : it.no)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm transition ${(ex.chats[it.no] || []).length || chatOpen === it.no
                        ? 'bg-[#1f5fbf] text-white'
                        : 'bg-slate-100 dark:bg-slate-800'}`}
                      aria-label="گفتگو"
                    >
                      💬
                    </button>
                  </div>

                  <div dir="ltr" className="text-sm leading-7 rounded-xl p-3 bg-slate-50 dark:bg-[#141923]" style={{ textAlign: 'left' }}>
                    <span className="text-[#5d6676]">{renderGermanWords(it.first, `r${it.no}-f`, it.first)} </span>
                    <b className="text-red-500 line-through decoration-1">{userAns || '(بدون پاسخ)'}</b>
                  </div>

                  {c.corrected && (
                    <div dir="ltr" className="flex items-start gap-2 text-sm leading-7 rounded-xl p-3 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800" style={{ textAlign: 'left' }}>
                      <span className="flex-1 font-sans font-bold text-emerald-900 dark:text-emerald-200"><ClickableWords text={c.corrected} onWord={t => tapTok(t, c.corrected || '')} /></span>
                      <button onClick={() => doSpeak(c.corrected)} className="text-base flex-shrink-0 mt-1" title="تلفظ جملهٔ درست">🔊</button>
                    </div>
                  )}

                  {c.userFa && (
                    <div className="text-xs leading-6 rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900 p-2.5">
                      <b className="text-sky-700 dark:text-sky-300">🇮🇷 ترجمهٔ جملهٔ تو:</b> {c.userFa}
                    </div>
                  )}

                  {c.fa && (
                    <div className="text-xs leading-6 rounded-lg bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900 p-2.5">
                      <b className="text-sky-700 dark:text-sky-300">🇮🇷 ترجمهٔ جملهٔ اصلاح‌شده:</b> {c.fa}
                    </div>
                  )}

                  {c.grammar && (
                    <div className="text-xs leading-6 rounded-lg border border-[#dde1ea] dark:border-[#333b4a] p-2.5">
                      <b className="text-[#1f5fbf] dark:text-[#7fb0ff]">📐 گرامری:</b> {c.grammar}
                    </div>
                  )}
                  {c.meaning && (
                    <div className="text-xs leading-6 rounded-lg border border-[#dde1ea] dark:border-[#333b4a] p-2.5">
                      <b className="text-[#1f5fbf] dark:text-[#7fb0ff]">🧭 مفهومی:</b> {c.meaning}
                    </div>
                  )}
                  {c.thinking && (
                    <div className="text-xs leading-6 rounded-lg border border-[#dde1ea] dark:border-[#333b4a] p-2.5">
                      <b className="text-[#1f5fbf] dark:text-[#7fb0ff]">🇩🇪 تفکر آلمانی:</b> {c.thinking}
                    </div>
                  )}

                  {chatOpen === it.no && renderChatBox(it.no)}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═════════ کارت واژه (ترجمهٔ کلیکی) — وسط صفحه باز می‌شود ═════════ */}
      {wCard && (
        <div
          className="fixed inset-0 z-[86] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setWCard(null); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full sm:max-w-sm max-h-[80vh] overflow-y-auto bg-white dark:bg-[#1b2029] rounded-3xl p-4 shadow-2xl space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xl font-extrabold font-sans" dir="ltr">{wCard.info?.lemma || wCard.word}</div>
                {wCard.info?.art && <span className="text-[11px] text-[#5d6676]" dir="ltr">{wCard.info.art}</span>}
                {wCard.word !== (wCard.info?.lemma || '') && (
                  <div className="text-[11px] text-[#5d6676]" dir="ltr">در متن: {wCard.word}</div>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={() => doSpeak(wCard.info?.lemma || wCard.word)} className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-base" title="تلفظ">🔊</button>
                <button onClick={() => setWCard(null)} className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-sm">✕</button>
              </div>
            </div>

            {wCard.loading ? (
              <div className="py-6 text-center text-sm text-[#5d6676] animate-pulse">⏳ معلم دارد ترجمه می‌کند…</div>
            ) : (
              <>
                <div className="text-sm font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">{wCard.info?.fa}</div>
                {wCard.info?.ex && (
                  <div className="bg-slate-50 dark:bg-[#141923] rounded-xl p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2" dir="ltr">
                      <span className="font-sans font-bold">{wCard.info.ex}</span>
                      <button onClick={() => doSpeak(wCard.info?.ex || '')} className="text-sm flex-shrink-0">🔊</button>
                    </div>
                    {wCard.info.exFa && <div className="text-[#5d6676]" dir="rtl">{wCard.info.exFa}</div>}
                  </div>
                )}
                <button
                  onClick={addWord}
                  disabled={!wCard.info || !wCard.info.lemma}
                  className="w-full bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-bold transition"
                >
                  ➕ افزودن به واژگان{added.has(wCard.info?.lemma || '') ? ' (اضافه شده ✓)' : ''}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* برگهٔ چاپ */}
      {printPreview}
      {dialog}

      {/* دیالوگ تصمیم افزودن به واژگان (تکراری / Partizip II / مترادف) */}
      {gate.node}
    </div>
  );
};
