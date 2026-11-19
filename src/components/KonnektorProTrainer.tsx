/**
 * KonnektorProTrainer.tsx — «ساخت جمله با همهٔ حروف ربط» (Sätze komplettieren)
 *
 * مثل تمرین کتاب: بخش اول جمله با حرف ربطِ هدف داده می‌شود و شما ادامه را می‌نویسید.
 * جملات را هوش مصنوعی (Gemini) طبق سطح انتخابی A1–C2 می‌سازد — از بانک کامل حروف ربط
 * (src/data/konnektorenData.ts، ~۱۵۰ حرف ربط) به‌عنوان راهنمای سطح استفاده می‌کند.
 *
 * امکانات:
 *  - تصحیح سه‌لایه: گرامری + مفهومی + «تفکر آلمانی» زیر هر جمله
 *  - چت درون‌خطی با معلمِ هوش مصنوعی برای همین جمله (با حافظهٔ گفتگوی همان جمله)
 *  - لمس هر کلمه → ترجمه فارسی درون‌متنی + مثال + افزودن به واژگان
 *  - ذخیرهٔ خودکار تمرین‌ها و بازکردن دوباره، چاپ/PDF (صفحهٔ ۱ سؤال، صفحهٔ ۲ پاسخنامهٔ تصحیح‌شده)
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AppSettings, Word } from '../types';
import { speak } from '../utils/audio';
import { Lvl, Kat, KAT_LABEL, LVL_INFO, LVL_ORDER, KonnektorItem, connectorsFor, findKonnektor } from '../data/konnektorenData';
import { SYS_AI, buildExercisePrompt, buildCorrectionPrompt, buildWordPrompt, buildChatPrompt, ChatCtx } from '../utils/konnektorPrompts';

/* ───────────────────────── پل هوش مصنوعی برنامه ─────────────────────────
 * کلید و مدل از تنظیمات برنامه (src/utils/aiProvider — Gemini/Groq/OpenRouter) می‌آید.
 * هیچ کارت کلیدی داخل تمرین نیست؛ اگر کلید در تنظیمات نباشد فقط پیام راهنما می‌بینی. */
import { generateText, hasApiKey, describeAiError, getActiveProvider, getModel } from '../utils/aiProvider';

/** ساخت/تصحیح/واژه — پاسخ JSON (قرارداد پروایدر برنامه) */
export const askGemini = async (prompt: string, system?: string): Promise<string> =>
  generateText((system ? system + '\n\n' : '') + prompt, { json: true, timeoutMs: 90000, retries: 1 });

/** گفتگوی آزاد با معلم — متن ساده */
export const askGeminiChat = async (prompt: string, system?: string): Promise<string> =>
  generateText((system ? system + '\n\n' : '') + prompt, { timeoutMs: 60000, retries: 1 });

/** پیام خطای خوانا از پروایدر برنامه */
export const aiErrorText = (e: unknown): string => {
  try { return describeAiError(e); } catch { return 'خطای نامشخص در اتصال به هوش مصنوعی.'; }
};

/** وضعیت کلید از تنظیمات برنامه */
export const hasAIKey = (): boolean => { try { return !!hasApiKey(); } catch { return false; } };

/** برچسب وضعیت برای نمایش */
export const aiStatusLabel = (): string => {
  try {
    const p = String(getActiveProvider() || 'AI');
    const m = String(getModel() || '').trim();
    return m ? `${p} · ${m}` : p;
  } catch { return 'AI'; }
};

/** تبدیل پاسخ AI به JSON حتی وقتی ```json یا متن اضافه دارد */
export function parseJSONLoose<T>(raw: string): T {
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
interface Correction { no: number; ok: boolean; corrected: string; grammar: string; meaning: string; thinking: string; }
interface ChatMsg { role: 'user' | 'ai'; text: string; }
interface KExercise {
  id: string; ts: number; level: Lvl; topic: string;
  items: KItem[];
  answers: Record<number, string>;
  corrections: Correction[] | null;
  chats: Record<number, ChatMsg[]>;
}
interface WInfo { lemma: string; fa: string; pos: string; art?: string; ex?: string; exFa?: string; }

const faDate = (ts: number): string => {
  try { return new Date(ts).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }); }
  catch { return new Date(ts).toLocaleDateString(); }
};
const loadHist = (): KExercise[] => {
  try { const h = JSON.parse(localStorage.getItem(HKEY) || '[]'); return Array.isArray(h) ? h : []; } catch { return []; }
};
const saveHist = (h: KExercise[]) => { try { localStorage.setItem(HKEY, JSON.stringify(h.slice(0, 30))); } catch { /* ignore */ } };

interface KonnektorProTrainerProps {
  settings?: AppSettings;
  onShowToast: (msg: string, isErr?: boolean) => void;
  onQuickAddWord?: (w: Partial<Word>) => boolean;
  onClose?: () => void;
}

export const KonnektorProTrainer: React.FC<KonnektorProTrainerProps> = ({ settings, onShowToast, onQuickAddWord, onClose }) => {
  const [screen, setScreen] = useState<'config' | 'play' | 'review'>('config');
  const [level, setLevel] = useState<Lvl>('A1');
  const [count, setCount] = useState(8);
  const [topic, setTopic] = useState('');
  const [ex, setEx] = useState<KExercise | null>(null);
  const [generating, setGenerating] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [chatOpen, setChatOpen] = useState<number | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState<number | null>(null);
  const [wCard, setWCard] = useState<{ word: string; sentence: string; info: WInfo | null; loading: boolean } | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [hist, setHist] = useState<KExercise[]>(loadHist);
  const [histOpen, setHistOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const wCache = useRef<Map<string, WInfo>>(new Map());

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
    if (!hasAIKey()) { onShowToast('هوش مصنوعی در تنظیمات برنامه فعال نیست — از صفحهٔ تنظیمات فعالش کن.', true); return; }
    setGenerating(true);
    try {
      const konns = connectorsFor(level);
      const raw = await askGemini(buildExercisePrompt(level, count, topic, konns), SYS_AI);
      const items = parseJSONLoose<KItem[]>(raw);
      const clean: KItem[] = (Array.isArray(items) ? items : [])
        .filter(i => i && typeof i.first === 'string' && i.first.trim().length > 10)
        .map((i, idx) => ({ no: idx + 1, connector: String(i.connector || '').trim(), first: String(i.first).trim(), hint: i.hint ? String(i.hint).trim() : '' }));
      if (!clean.length) throw new Error('AI_EMPTY');
      const e: KExercise = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ts: Date.now(), level, topic: topic.trim(),
        items: clean, answers: {}, corrections: null, chats: {}
      };
      setEx(e);
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

  // ────────── ارسال برای تصحیح ──────────
  const sendCorrection = async () => {
    if (!ex) return;
    const answered = ex.items.filter(i => (ex.answers[i.no] || '').trim()).length;
    if (!answered) { onShowToast('اول حداقل یک جمله را کامل کن.', true); return; }
    if (answered < ex.items.length && !window.confirm(`فقط ${answered} جمله از ${ex.items.length} کامل شده؛ بقیه «بی‌پاسخ» تصحیح می‌شود. ادامه؟`)) return;
    setCorrecting(true);
    try {
      const raw = await askGemini(buildCorrectionPrompt(ex.level, ex.items, ex.answers), SYS_AI);
      const corr = parseJSONLoose<Correction[]>(raw);
      const map = new Map<number, Correction>((Array.isArray(corr) ? corr : []).filter(c => c && typeof c.no === 'number').map(c => [c.no, c]));
      const merged: Correction[] = ex.items.map(it => map.get(it.no) || { no: it.no, ok: false, corrected: '', grammar: 'پاسخ داده نشد', meaning: '', thinking: '' });
      setEx({ ...ex, corrections: merged });
      setScreen('review');
      setChatOpen(null);
      const okN = merged.filter(c => c.ok).length;
      onShowToast(`تصحیح شد: ${okN} از ${merged.length} درست ✓`);
    } catch (e) {
      onShowToast(aiErrorText(e), true);
    } finally {
      setCorrecting(false);
    }
  };

  // ────────── چت درون‌خطیِ هر جمله ──────────
  const sendChat = async (no: number, text: string) => {
    if (!ex) return;
    const q = text.trim();
    if (!q || chatBusy !== null) return;
    const item = ex.items.find(i => i.no === no);
    if (!item) return;
    const hist0 = ex.chats[no] || [];
    const corr = (ex.corrections || []).find(c => c.no === no) || null;
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
      setWCard({ word: token, sentence, info: { lemma: token, fa: 'برای ترجمهٔ خودکار، هوش مصنوعی را در تنظیمات برنامه فعال کن.', pos: 'other' }, loading: false });
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

  const addWord = () => {
    const wc = wCard;
    if (!wc || !wc.info) return;
    const de = wc.info.lemma || wc.word;
    if (!onQuickAddWord) { onShowToast('افزودن به واژگان در این بخش متصل نشده است.', true); return; }
    if (added.has(de)) { onShowToast('این واژه همین حالا اضافه شده بود.'); return; }
    const w = { de, fa: wc.info.fa, pos: wc.info.pos, art: wc.info.art || undefined, lvl: ex?.level || level } as unknown as Partial<Word>;
    const ok = onQuickAddWord(w);
    if (ok) {
      setAdded(new Set([...added, de]));
      onShowToast(`«${de}» به واژگان اضافه شد ✓`);
    } else {
      onShowToast('افزودن به واژگان انجام نشد.', true);
    }
  };

  const openFromHistory = (h: KExercise) => {
    setEx(h);
    setLevel(h.level);
    setTopic(h.topic);
    setScreen(h.corrections ? 'review' : 'play');
    setChatOpen(null);
  };

  const answeredCount = ex ? ex.items.filter(i => (ex.answers[i.no] || '').trim()).length : 0;
  const okCount = ex?.corrections ? ex.corrections.filter(c => c.ok).length : 0;

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

  const ChatBox = ({ no }: { no: number }) => {
    const msgs = ex?.chats[no] || [];
    return (
      <div className="rounded-xl border border-[#1f5fbf]/40 bg-blue-50/40 dark:bg-blue-950/20 dark:border-[#7fb0ff]/30 p-2.5 space-y-2" dir="rtl">
        <div className="flex items-center justify-between text-[11px] font-bold text-[#5d6676]">
          <span>💬 گفتگو با معلم دربارهٔ جملهٔ {no}</span>
          <button onClick={() => setChatOpen(null)} className="w-6 h-6 rounded bg-white/70 dark:bg-[#141923] flex items-center justify-center">✕</button>
        </div>
        <div className="max-h-56 overflow-y-auto space-y-2">
          {msgs.length === 0 && <p className="text-[11px] text-[#5d6676]">هر سؤالی دربارهٔ همین جمله داری بپرس — معلم با تصحیحِ همین جمله در گفتگو جواب می‌دهد.</p>}
          {msgs.map((m, i) => (
            <div
              key={i}
              className={`text-xs leading-6 rounded-lg px-2.5 py-1.5 max-w-[88%] ${m.role === 'user'
                ? 'bg-[#1f5fbf] text-white ml-auto'
                : 'bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a]'}`}
              style={{ whiteSpace: 'pre-wrap' }}
            >
              {m.text}
            </div>
          ))}
          {chatBusy === no && <div className="text-[11px] text-[#5d6676] animate-pulse">هوش مصنوعی دارد می‌نویسد…</div>}
        </div>
        <div className="flex flex-wrap gap-1">
          {QUICK_QS.map(q => (
            <button
              key={q}
              onClick={() => sendChat(no, q)}
              disabled={chatBusy === no}
              className="text-[10px] bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-full px-2 py-0.5 transition disabled:opacity-40"
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

  // ────────── برگهٔ چاپ (Portal به body) ──────────
  const printRoot = ex ? (
    <div className="kpp-print-root" dir="rtl">
      <style>{`
        .kpp-print-root { display: none; }
        @media print {
          body > *:not(.kpp-print-root) { display: none !important; }
          .kpp-print-root { display: block !important; position: static !important; }
          .kpp-print-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .kpp-pagebreak { break-before: page; page-break-before: always; }
          @page { size: A4; margin: 14mm 13mm; }
        }
      `}</style>

      {/* صفحهٔ ۱: سؤالات */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '2px solid #1f5fbf', paddingBottom: 6 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800 }}>Sätze komplettieren — تمرین حروف ربط (سطح {ex.level})</div>
            <div style={{ fontSize: 10, color: '#555' }}>
              موضوع: {ex.topic || 'آزاد'} • تاریخ: {faDate(ex.ts)} • {ex.items.length} جمله
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#555' }}>امتیاز: … / {ex.items.length}</div>
        </div>
        <p style={{ fontSize: 11, marginTop: 8, color: '#333' }}>
          Ergänzen Sie die Sätze sinnvoll und sprachlich richtig! — ادامهٔ هر جمله را طوری بنویسید که معنایی کامل و ساختار درست (جایگاه فعل، کاما) داشته باشد.
        </p>
        <ol style={{ margin: '10px 0 0', paddingInlineStart: 18, listStyle: 'decimal' }}>
          {ex.items.map(it => (
            <li key={it.no} style={{ fontSize: 12.5, marginBottom: 10, lineHeight: 1.9, breakInside: 'avoid' }}>
              <span dir="ltr" style={{ direction: 'ltr', unicodeBidi: 'embed' }}>
                {it.first} <span style={{ letterSpacing: 1 }}>__________________</span>
                {it.hint ? <b> ({it.hint})</b> : null}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {/* صفحهٔ ۲: پاسخنامهٔ تصحیح‌شده */}
      {ex.corrections && (
        <div className="kpp-pagebreak" dir="rtl">
          <div style={{ borderBottom: '2px solid #1f5fbf', paddingBottom: 6, marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>پاسخنامهٔ تصحیح‌شده + بازخورد</div>
            <div style={{ fontSize: 10, color: '#555' }}>سطح {ex.level} • موضوع: {ex.topic || 'آزاد'}</div>
          </div>
          {ex.items.map((it, i) => {
            const c = ex.corrections![i];
            return (
              <div key={it.no} style={{ fontSize: 11, marginBottom: 10, breakInside: 'avoid' }}>
                <div style={{ fontSize: 11.5 }}>
                  <b>{it.no}. </b>
                  <span dir="ltr" style={{ direction: 'ltr', unicodeBidi: 'embed', fontWeight: 700, color: c?.ok ? '#047857' : '#b45309' }}>
                    {c?.corrected || '(بدون پاسخ)'}
                  </span>
                </div>
                <div style={{ color: '#555', marginTop: 1 }}>پاسخ شما: {(ex.answers[it.no] || '').trim() || '—'}</div>
                {c?.grammar && <div style={{ marginTop: 2 }}>• گرامری: {c.grammar}</div>}
                {c?.meaning && <div>• مفهومی: {c.meaning}</div>}
                {c?.thinking && <div>• تفکر آلمانی: {c.thinking}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  ) : null;

  // ═══════════════════ رندر ═══════════════════
  return (
    <div className="space-y-3 text-right">
      {/* ═════════ پیکربندی ═════════ */}
      {screen === 'config' && (
        <div className="space-y-3">
          <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 space-y-3 shadow-xs">
            <p className="text-sm text-[#5d6676] dark:text-[#a3adbd] leading-6">
              مثل تمرین کتاب: بخش اول جمله با حرف ربطِ هدف داده می‌شود و شما ادامه را می‌نویسید.
              جملات را <b>هوش مصنوعی</b> طبق سطح می‌سازد و بعد از تکمیل، هر جمله را سه‌لایه تصحیح می‌کند
              (گرامری / مفهومی / تفکر آلمانی) و می‌توانی دربارهٔ همین جمله با معلم گفتگو کنی.
            </p>

            {/* وضعیت هوش مصنوعی — فقط نمایش؛ تنظیم در صفحهٔ تنظیمات برنامه */}
            <div className={`rounded-xl border px-3 py-2 text-xs font-bold leading-5 ${
              hasAIKey()
                ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                : 'border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
            }`}>
              {hasAIKey()
                ? <>🤖 متصل: <b dir="ltr">{aiStatusLabel()}</b> — کلید و مدل از تنظیمات برنامه استفاده می‌شود.</>
                : <>🔌 هوش مصنوعی در تنظیمات برنامه فعال نشده — در صفحهٔ تنظیمات کلید را وارد کن؛ بدون کلید هم می‌توانی حروف ربط را از بانک مرور کنی.</>}
            </div>

            {/* سطح */}
            <div>
              <div className="text-xs font-bold text-[#5d6676] mb-1.5">۱. سطح — حروف ربط و جملات فقط از همین سطح می‌آیند</div>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {LVL_ORDER.map(l => (
                  <button
                    key={l}
                    onClick={() => setLevel(l)}
                    className={`py-2.5 rounded-xl text-xs font-bold border transition ${
                      level === l
                        ? 'bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white border-transparent'
                        : 'bg-slate-50 dark:bg-[#141923] border-[#dde1ea] dark:border-[#333b4a]'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-[#5d6676] mt-2 leading-5">{LVL_INFO[level].label}</p>
            </div>

            {/* تعداد + موضوع */}
            <div>
              <div className="text-xs font-bold text-[#5d6676] mb-1.5">۲. تعداد جمله‌ها</div>
              <div className="flex gap-2 flex-wrap">
                {[5, 8, 10, 12].map(n => (
                  <button
                    key={n}
                    onClick={() => setCount(n)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold border transition ${
                      count === n
                        ? 'bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white border-transparent'
                        : 'bg-slate-50 dark:bg-[#141923] border-[#dde1ea] dark:border-[#333b4a]'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-bold text-[#5d6676] mb-1.5">۳. موضوع (اختیاری)</div>
              <input
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="مثلاً: Umwelt, Klima, mein Job … (خالی = موضوع آزاد)"
                className="w-full border-2 border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-[#141923] outline-none"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {TOPIC_CHIPS.map(t => (
                  <button
                    key={t}
                    onClick={() => setTopic(t === topic ? '' : t)}
                    dir="ltr"
                    className={`text-[11px] rounded-full px-2.5 py-1 border transition ${topic === t
                      ? 'bg-[#1f5fbf] text-white border-transparent'
                      : 'bg-slate-50 dark:bg-[#141923] border-[#dde1ea] dark:border-[#333b4a]'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

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

            <button
              onClick={generate}
              disabled={generating}
              className="w-full bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white py-3 rounded-xl font-bold text-sm shadow-xs active:scale-[.99] transition disabled:opacity-60"
            >
              {generating ? '⏳ هوش مصنوعی دارد جمله‌ها را می‌سازد…' : '✨ ساخت تمرین با هوش مصنوعی'}
            </button>
          </div>

          {/* تاریخچه */}
          <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 shadow-xs">
            <button onClick={() => setHistOpen(o => !o)} className="w-full flex items-center justify-between text-sm font-bold">
              <span>🗂 تمرین‌های ذخیره‌شده ({hist.length})</span>
              <span className="text-[#5d6676]">{histOpen ? '▲' : '▼'}</span>
            </button>
            {histOpen && (
              <div className="mt-3 space-y-2">
                {hist.length === 0 && <p className="text-xs text-[#5d6676] py-2">هنوز تمرینی ساخته نشده است.</p>}
                {hist.map(h => (
                  <div key={h.id} className="flex items-center justify-between gap-2 rounded-xl border border-[#dde1ea] dark:border-[#333b4a] p-2.5">
                    <div className="min-w-0">
                      <div className="text-xs font-bold">
                        سطح {h.level} • {h.items.length} جمله{h.topic ? ` • ${h.topic}` : ''}
                        {h.corrections ? <span className="text-emerald-600"> • تصحیح‌شده {h.corrections.filter(c => c.ok).length}/{h.items.length}</span> : ''}
                      </div>
                      <div className="text-[10px] text-[#5d6676] flex flex-wrap gap-1.5 mt-1">
                        <span className="bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-0.5">{faDate(h.ts)}</span>
                        <span className="bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-0.5">پاسخ‌داده: {h.items.filter(i => (h.answers[i.no] || '').trim()).length}/{h.items.length}</span>
                        {h.chats && Object.keys(h.chats).length > 0 && (
                          <span className="bg-blue-50 dark:bg-blue-950/40 text-[#1f5fbf] dark:text-[#7fb0ff] rounded px-1.5 py-0.5">💬 {Object.keys(h.chats).length}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => openFromHistory(h)}
                        className="w-9 h-9 rounded-lg bg-[#1f5fbf] text-white flex items-center justify-center text-sm"
                        title="ادامهٔ این تمرین"
                        aria-label="ادامهٔ این تمرین"
                      >
                        ▶
                      </button>
                      <button
                        onClick={() => { const next = loadHist().filter(x => x.id !== h.id); saveHist(next); setHist(next); }}
                        className="w-9 h-9 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 text-red-600 flex items-center justify-center text-sm"
                        title="حذف"
                        aria-label="حذف"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                ))}
                {hist.length > 0 && (
                  <button onClick={() => { saveHist([]); setHist([]); }} className="text-[11px] text-red-500 px-2 py-1">
                    پاک کردن کل تاریخچه
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═════════ در حال تمرین ═════════ */}
      {screen === 'play' && ex && (
        <div className="space-y-3">
          <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between gap-2 text-xs mb-2">
              <div className="flex flex-wrap gap-1.5">
                <span className="bg-blue-50 dark:bg-blue-950/40 text-[#1f5fbf] dark:text-[#7fb0ff] rounded-full px-2 py-0.5 font-bold">سطح {ex.level}</span>
                {ex.topic && <span className="bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 rounded-full px-2 py-0.5 font-bold">{ex.topic}</span>}
              </div>
              <div className="text-[#5d6676]">✍️ {answeredCount}/{ex.items.length}</div>
            </div>
            <p className="text-[11px] text-[#5d6676] leading-5 mb-3">
              ادامهٔ هر جمله را آلمانی بنویس (کادر زیر جمله). روی حرف ربط سبز بزنی، نکتهٔ گرامری‌اش را می‌بینی؛
              روی هر کلمهٔ جمله بزنی، ترجمهٔ فارسی + مثال می‌آید و می‌توانی به واژگان اضافه‌اش کنی.
              جمله‌ای که سؤال داری، با 💬 مستقیم از معلم بپرس.
            </p>
            <div className="space-y-3">
              {ex.items.map(it => (
                <div key={it.no} className="rounded-xl border border-[#dde1ea] dark:border-[#333b4a] p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-bold bg-slate-100 dark:bg-slate-800 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0">{it.no}</span>
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
                        onClick={() => doSpeak(it.first + ' ' + (ex.answers[it.no] || ''))}
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
                    value={ex.answers[it.no] || ''}
                    onChange={e => setEx({ ...ex, answers: { ...ex.answers, [it.no]: e.target.value } })}
                    placeholder="ادامهٔ جمله را آلمانی بنویس…"
                    className="w-full border-2 border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 text-base font-sans bg-white dark:bg-[#141923] outline-none focus:border-[#1f5fbf] dark:focus:border-[#7fb0ff] transition text-left"
                  />
                  {chatOpen === it.no && <ChatBox no={it.no} />}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={sendCorrection}
              disabled={correcting}
              className="col-span-2 bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white py-3 rounded-xl text-sm font-bold transition disabled:opacity-60"
            >
              {correcting ? '⏳ معلم دارد جمله‌ها را تصحیح می‌کند…' : '✅ تکمیل کردم — تصحیح و بازخورد بده'}
            </button>
            <button onClick={() => window.print()} className="bg-slate-100 dark:bg-slate-800 py-2.5 rounded-xl text-xs font-bold transition">🖨 چاپ / PDF</button>
            <button onClick={() => { setScreen('config'); setEx(null); setChatOpen(null); }} className="bg-slate-100 dark:bg-slate-800 py-2.5 rounded-xl text-xs font-bold transition">بازگشت به فهرست</button>
          </div>
        </div>
      )}

      {/* ═════════ بازخورد و گفتگو ═════════ */}
      {screen === 'review' && ex && ex.corrections && (
        <div className="space-y-3">
          <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-5 text-center shadow-xs">
            <div className="text-4xl">{okCount === ex.items.length ? '🏆' : okCount >= ex.items.length * 0.7 ? '🎉' : '💪'}</div>
            <div className="text-2xl font-extrabold mt-2">{okCount} / {ex.items.length}</div>
            <p className="text-xs text-[#5d6676] mt-1">
              زیر هر جمله: تصحیح معلم + سه لایهٔ بازخورد (گرامری / مفهومی / تفکر آلمانی).
              با 💬 دربارهٔ هر جمله سؤال بپرس — معلم با همان تصحیح در گفتگو جواب می‌دهد.
            </p>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <button onClick={generate} disabled={generating} className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white py-2.5 rounded-xl text-xs font-bold disabled:opacity-60">
                {generating ? '⏳ …' : '✨ تمرین جدید (همین سطح)'}
              </button>
              <button onClick={() => setScreen('play')} className="bg-[#1f5fbf] text-white py-2.5 rounded-xl text-xs font-bold">✏️ برگشت به پاسخ‌ها</button>
              <button onClick={() => window.print()} className="bg-slate-100 dark:bg-slate-800 py-2.5 rounded-xl text-xs font-bold">🖨 چاپ / PDF (با پاسخنامه)</button>
              <button onClick={() => { setScreen('config'); setEx(null); }} className="bg-slate-100 dark:bg-slate-800 py-2.5 rounded-xl text-xs font-bold">بازگشت به فهرست</button>
            </div>
          </div>

          <div className="space-y-3">
            {ex.items.map((it, i) => {
              const c = ex.corrections![i];
              const userAns = (ex.answers[it.no] || '').trim();
              return (
                <div key={it.no} className={`bg-white dark:bg-[#1b2029] border rounded-2xl p-4 space-y-2.5 shadow-xs ${c?.ok ? 'border-emerald-300 dark:border-emerald-800' : 'border-red-300 dark:border-red-800'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold bg-slate-100 dark:bg-slate-800 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0">{it.no}</span>
                    <span className={`text-xs font-bold ${c?.ok ? 'text-emerald-600' : 'text-red-500'}`}>{c?.ok ? '✓ قابل قبول' : '✗ نیاز به اصلاح'}</span>
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

                  {c?.corrected && (
                    <div dir="ltr" className="flex items-start gap-2 text-sm leading-7 rounded-xl p-3 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800" style={{ textAlign: 'left' }}>
                      <span className="flex-1 font-sans font-bold text-emerald-900 dark:text-emerald-200">{c.corrected}</span>
                      <button onClick={() => doSpeak(c.corrected)} className="text-base flex-shrink-0 mt-1" title="تلفظ جملهٔ درست">🔊</button>
                    </div>
                  )}

                  {c?.grammar && (
                    <div className="text-xs leading-6 rounded-lg border border-[#dde1ea] dark:border-[#333b4a] p-2.5">
                      <b className="text-[#1f5fbf] dark:text-[#7fb0ff]">📐 گرامری:</b> {c.grammar}
                    </div>
                  )}
                  {c?.meaning && (
                    <div className="text-xs leading-6 rounded-lg border border-[#dde1ea] dark:border-[#333b4a] p-2.5">
                      <b className="text-[#1f5fbf] dark:text-[#7fb0ff]">🧭 مفهومی:</b> {c.meaning}
                    </div>
                  )}
                  {c?.thinking && (
                    <div className="text-xs leading-6 rounded-lg border border-[#dde1ea] dark:border-[#333b4a] p-2.5">
                      <b className="text-[#1f5fbf] dark:text-[#7fb0ff]">🇩🇪 تفکر آلمانی:</b> {c.thinking}
                    </div>
                  )}

                  {chatOpen === it.no && <ChatBox no={it.no} />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═════════ کارت واژه (ترجمهٔ کلیکی) ═════════ */}
      {wCard && (
        <div
          className="fixed inset-0 z-[86] bg-black/50 backdrop-blur-sm flex items-end sm:items-center sm:justify-center"
          onClick={e => { if (e.target === e.currentTarget) setWCard(null); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full sm:max-w-sm bg-white dark:bg-[#1b2029] rounded-t-3xl sm:rounded-3xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl space-y-3"
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
              <div className="py-6 text-center text-sm text-[#5d6676] animate-pulse">⏳ هوش مصنوعی دارد ترجمه می‌کند…</div>
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
      {printRoot && createPortal(printRoot, document.body)}
    </div>
  );
};
