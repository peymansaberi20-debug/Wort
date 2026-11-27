import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Word } from '../types';
import { speak } from '../utils/audio';
import { generateText, hasApiKey, describeAiError } from '../utils/aiProvider';
import { generateWithGemini } from '../utils/ai';
import { Lvl, LVL_ORDER } from '../data/konnektorenData';
import { ArchivePanel, ArchiveRow, CountChips, LevelChips, MiniChip, PrimaryBtn, Section, SqBtn, TopicInput, faDate, toFa, useConfirm } from './trainerUI';
import { pushAiBank, fetchAiBank, aiBankMarkSeen, aiBankSeenIds, mergeAiBank } from '../utils/aiBank';
import { ClickableWords, WordLookupModal } from './WordLookup';

interface Item { de: string; fa: string; src: 'own' | 'ai' }
interface DrillProps {
  words: Word[];
  onShowToast: (m: string, e?: boolean) => void;
  onQuickAddWord?: (w: Partial<Word>) => boolean;
  /** بازکردن پروفایل واژهٔ کتابخانه («مشاهدهٔ واژه») */
  onViewWord?: (w: Word) => void;
}

const card = 'bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 space-y-3';
const shuffle = <T,>(a: T[]): T[] => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const clean = (t: string) => t.replace(/^[„"“'(]+|[.,!?;:"“”')]+$/g, '');

/** Example sentences of the user's own vocabulary (4–14 words). */
const collect = (words: Word[], min = 4, max = 14): Item[] => {
  const out: Item[] = []; const seen = new Set<string>();
  for (const w of words) {
    for (const [de, fa] of [[w.ex, w.exFa], [w.ex2, w.ex2Fa]] as [string, string][]) {
      const s = (de || '').trim(); const n = s.split(/\s+/).length;
      if (n >= min && n <= max && !seen.has(s)) { seen.add(s); out.push({ de: s, fa: (fa || '').trim(), src: 'own' }); }
    }
  }
  return out;
};

const Done: React.FC<{ score: number; total: number; onAgain: () => void }> = ({ score, total, onAgain }) => (
  <div className={card + ' text-center'}>
    <div className="text-5xl">{score / total >= 0.8 ? '🏆' : score / total >= 0.5 ? '👍' : '💪'}</div>
    <div className="font-extrabold text-lg" dir="ltr">{toFa(score)} / {toFa(total)}</div>
    <button onClick={onAgain} className="w-full h-12 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white font-bold text-sm">🔄 یک دور دیگر</button>
  </div>
);

/* ───────────────────────── آرشیو تمرین‌های ساخته‌شدهٔ AI + بانک مشترک ابری ─────────────────────────
 * درخواست کاربر: تمرین‌های ساخته‌شده با هوش مصنوعی در برنامه ذخیره شوند و روی همهٔ
 * دستگاه‌ها / با هر ایمیل / حتی بدون ورود در دسترس همه باشند. برای «چیدن جمله» که قبلاً
 * آرشیو نداشت، آرشیو محلی جدید (wb_satzbau_ai_arch_v1) + بانک مشترک Firestore اضافه شد. */
const SATZ_ARCH_KEY = 'wb_satzbau_ai_arch_v1';
const SATZ_BANK = 'satzbau';
interface SatzArch { id: string; ts: number; level: string; count: number; items: { de: string; fa: string }[] }
const loadSatzArch = (): SatzArch[] => {
  try {
    const a = JSON.parse(localStorage.getItem(SATZ_ARCH_KEY) || '[]');
    return Array.isArray(a) ? a.filter((x: SatzArch) => x?.id && Array.isArray(x.items)) : [];
  } catch { return []; }
};
const saveSatzArch = (a: SatzArch[]): void => { try { localStorage.setItem(SATZ_ARCH_KEY, JSON.stringify(a.slice(0, 30))); } catch { /* ignore */ } };

/**
 * چیدن جمله (Satzbau) — با پیکربندی یکدست مثل بقیهٔ تمرین‌ها (درخواست کاربر):
 *  - «جمله‌های خودت»: از مثال‌های واژگان کاربر (مثل قبل)
 *  - «ساخت با هوش مصنوعی»: انتخاب سطح + تعداد جمله → AI جمله‌های تازهٔ هم‌سطح می‌سازد
 *
 * درخواست کاربر (درخواست ۷ SatzPuzzle بهبود):
 *  - همیشه ۳ کلمهٔ اضافی (distractor) به بانک کلمه‌ها افزوده می‌شود.
 *  - اندازهٔ بانک کلمه‌ها = تعداد واژه‌های جمله + ۳.
 *  - جعبهٔ پاسخ با ابعاد ثابت (نه با اضافه‌شدن کلمه‌ها بزرگ‌نمایی نمی‌شود) و جای خالی N تا (N = تعداد واژه‌های جمله).
 *  - پیام «۳ کلمه اضافی برای آزمایش شما اضافه شده» بالای هر تمرین.
 *  - چت با معلم پایین هر تمرین.
 *  - دکمهٔ «بعدی (بدون بررسی)» پیش از بررسی برای عبور بدون امتیاز.
 *  - پشتیبانی از HTML5 drag-and-drop (به‌علاوهٔ کلیک برای جای‌گذاری).
 *  - رنگ‌های روشن‌تر کاشی‌های بانک کلمه‌ها و دکمهٔ بلندگو از قرمز به آبی تغییر کرد.
 *  - سطح‌بندی AI: در سطوح بالاتر جمله‌ها پیچیده‌تر (حرف اضافه، فعل بازتابی، جملهٔ پیرو).
 */
export const SatzPuzzle: React.FC<DrillProps> = ({ words, onShowToast, onQuickAddWord, onViewWord }) => {
  const ownPool = useMemo(() => collect(words), [words]);
  const [screen, setScreen] = useState<'config' | 'run'>('config');
  const [lookup, setLookup] = useState<string | null>(null);
  const [mode, setMode] = useState<'own' | 'ai'>(ownPool.length >= 3 ? 'own' : 'ai');
  const [level, setLevel] = useState<Lvl>('A2');
  const [count, setCount] = useState(8);
  const [busy, setBusy] = useState(false);

  const [queue, setQueue] = useState<Item[]>([]);
  const [idx, setIdx] = useState(0);
  const split = (s: string) => s.split(/\s+/);
  const scramble = (s: string) => {
    const t = split(s);
    let b = shuffle(t);
    for (let k = 0; k < 6 && b.join(' ') === t.join(' '); k++) b = shuffle(t);
    return b.map((text, id) => ({ id, text }));
  };
  const [bank, setBank] = useState<{ id: number; text: string }[]>([]);
  const [ans, setAns] = useState<{ id: number; text: string }[]>([]);
  const [res, setRes] = useState<null | boolean>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  /** شمارهٔ کلمه‌ای که در حال drag است — null یعنی هیچ کلمه‌ای در حال drag نیست */
  const [dragId, setDragId] = useState<number | null>(null);

  // چت با معلم — مینیمال، فقط برای همین جمله
  const [chatMsgs, setChatMsgs] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (chatEndRef.current) chatEndRef.current.scrollIntoView({ block: 'end' }); }, [chatMsgs, chatBusy]);

  // آرشیو تمرین‌های ساخته‌شدهٔ AI + بانک مشترک ابری
  const [arch, setArch] = useState<SatzArch[]>(loadSatzArch);
  const { ask: askDel, dialog: delDialog } = useConfirm();

  // همگام‌سازی با بانک مشترک — یک‌بار هنگام مونت؛ بی‌صدا در خطا (آفلاین = همان رفتار محلی)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const seen = aiBankSeenIds(SATZ_BANK);
        const cloud = await fetchAiBank<SatzArch>(SATZ_BANK);
        if (!alive) return;
        aiBankMarkSeen(SATZ_BANK, cloud.map(c => c.id));
        setArch(prev => {
          const merged = mergeAiBank(prev, cloud, seen);
          if (merged !== prev && merged.length > prev.length) { saveSatzArch(merged); return merged; }
          return prev;
        });
        const have = new Set(cloud.map(c => c.id));
        loadSatzArch().filter(x => x?.id && !have.has(x.id)).slice(0, 25)
          .forEach(x => pushAiBank(SATZ_BANK, x.id, x, { level: x.level, count: x.count }));
      } catch { /* بی‌صدا */ }
    })();
    return () => { alive = false; };
  }, []);

  /* ───────── درخواست کاربر: ۳ کلمهٔ اضافی (distractor) ─────────
   * بانک کلمه‌های هر جمله = کلمه‌های خودِ جمله + ۳ کلمهٔ اضافی گمراه‌کننده.
   * در حالت own: از یک فهرست کوتاه واژه‌های رایج آلمانی انتخاب تصادفی می‌شوند.
   * در حالت ai: AI در فیلد distractors سه کلمه پیشنهاد می‌دهد؛ اگر نداد، از همان فهرست انتخاب می‌شود. */
  const DISTRACTOR_POOL: string[] = useMemo(() => [
    'aber', 'und', 'oder', 'deshalb', 'trotzdem', 'weil', 'dass', 'wenn', 'als', 'ob',
    'heute', 'morgen', 'gestern', 'später', 'früh', 'jetzt', 'immer', 'nie', 'oft', 'selten',
    'schnell', 'langsam', 'schön', 'groß', 'klein', 'gut', 'schlecht', 'neu', 'alt', 'viel',
    'der', 'die', 'das', 'ein', 'eine', 'mein', 'dein', 'sein', 'ihr', 'unser',
    'Haus', 'Schule', 'Arbeit', 'Freund', 'Familie', 'Wetter', 'Zeit', 'Stadt', 'Land', 'Kind',
    'gehen', 'kommen', 'machen', 'sehen', 'sagen', 'wissen', 'können', 'wollen', 'müssen', 'sollen',
    'sich', 'man', 'doch', 'ja', 'nein', 'schon', 'noch', 'nur', 'auch', 'sehr'
  ], []);

  const pickDistractors = (sentence: string, n = 3, aiList?: string[]): string[] => {
    const used = new Set(sentence.split(/\s+/).map(s => s.toLowerCase().replace(/[^\wäöüß]/gi, '')));
    const out: string[] = [];
    const fromAi = Array.isArray(aiList) ? aiList.map(s => String(s || '').trim()).filter(Boolean) : [];
    for (const cand of fromAi) {
      const k = cand.toLowerCase().replace(/[^\wäöüß]/gi, '');
      if (k && !used.has(k) && !out.some(x => x.toLowerCase().replace(/[^\wäöüß]/gi, '') === k)) out.push(cand);
      if (out.length >= n) break;
    }
    const pool = shuffle(DISTRACTOR_POOL);
    for (const cand of pool) {
      if (out.length >= n) break;
      const k = cand.toLowerCase().replace(/[^\wäöüß]/gi, '');
      if (k && !used.has(k) && !out.some(x => x.toLowerCase().replace(/[^\wäöüß]/gi, '') === k)) out.push(cand);
    }
    return out.slice(0, n);
  };

  /** ساخت بانک کلمه‌ها برای یک جمله — جمله + ۳ کلمهٔ اضافی، همه با هم به‌هم‌ریخته */
  const buildBank = (de: string, distractors: string[]): { id: number; text: string }[] => {
    const ws = split(de).map(t => t.trim()).filter(Boolean);
    const extra = distractors.filter(Boolean);
    const all = shuffle([...ws, ...extra]);
    return all.map((text, id) => ({ id, text }));
  };

  /** شروع با جمله‌های خودت */
  const startOwn = () => {
    const q = shuffle(ownPool).slice(0, 10);
    if (!q.length) { onShowToast('جمله‌ای برای تمرین پیدا نشد.', true); return; }
    setQueue(q); setScore(0); setDone(false); setIdx(0);
    setBank(buildBank(q[0].de, pickDistractors(q[0].de))); setAns([]); setRes(null);
    setChatMsgs([]); setChatDraft('');
    setScreen('run');
  };

  /** ساخت جمله‌های هم‌سطح با هوش مصنوعی (سطح + تعداد از پیکربندی) — درخواست کاربر: سطح‌بندی پیچیدگی */
  const startAi = async () => {
    if (!hasApiKey()) { onShowToast('معلم در تنظیمات برنامه فعال نیست — از صفحهٔ تنظیمات فعالش کن.', true); return; }
    setBusy(true);
    try {
      // درخواست کاربر: در سطح بالاتر جمله‌ها پیچیده‌تر — حرف اضافه، فعل بازتابی، جملهٔ پیرو
      const lvlHint = level === 'A1' || level === 'A2'
        ? 'einfache Hauptsätze, 5–8 Wörter, häufiger Wortschatz'
        : level === 'B1'
          ? 'mit Präpositionen, reflexiven Verben (sich …), gelegentlich Nebensatz mit weil/dass/wenn, 6–10 Wörter'
          : level === 'B2'
            ? 'komplexere Sätze mit Nebensatz, reflexiven Verben mit Akkusativ/Dativ, Präpositionen, 7–12 Wörter'
            : 'anspruchsvolle Sätze mit Konjunktiv, erweitertem Infinitiv, komplexen Präpositionalgefügen, 8–14 Wörter';
      const prompt = `Du bist ein erfahrener Deutschlehrer (Niveau ${level}).
Erstelle GENAU ${count} vollständige deutsche Beispielsätze für einen Satzbau-Übungstyp: der Lerner sieht die Wörter durcheinander und ordnet sie.
Schwierigkeit für Niveau ${level}: ${lvlHint}.
Regeln:
- Jeder Satz ist grammatisch korrekt und typisch für Niveau ${level}.
- Themen: Alltag, Familie, Arbeit, Schule, Reisen, Wetter — abwechslungsreich, jeder Satz ein anderes Thema.
- "de": der vollständige Satz (mit Endpunkt). "fa": natürliche persische Übersetzung des Satzes.
- "distractors": ein JSON-Array mit GENAU 3 kurzen deutschen Wörtern oder Phrasen, die plausible, aber falsche Alternativen sind (andere Präpositionen, andere Pronomen, Verneinungswörter etc.), NICHT im Satz vorkommend.
- Keine Satzzeichen im Satzinneren außer Kommas; keine Anführungszeichen.
Antworte NUR mit einem JSON-Array: [{"de":"...","fa":"...","distractors":["...","...","..."]}]`;
      const raw = await generateText(prompt, { json: true, timeoutMs: 90000, retries: 1 });
      let arr: any[] = [];
      try {
        const s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
        const a = s.indexOf('['), b = s.lastIndexOf(']');
        arr = JSON.parse(a >= 0 && b > a ? s.slice(a, b + 1) : s);
      } catch { arr = []; }
      const items: Item[] = (Array.isArray(arr) ? arr : [])
        .filter((x: any) => x && typeof x.de === 'string' && x.de.trim().split(/\s+/).length >= 4)
        .map((x: any) => ({ de: String(x.de).trim(), fa: String(x.fa || '').trim(), src: 'ai' as const }))
        .slice(0, count);
      if (!items.length) throw new Error('پاسخ معلم ساختار معتبر نداشت — دوباره تلاش کن.');
      // ذخیرهٔ distractorهای AI برای استفاده در buildBank اولین جمله
      const firstDistractors = arr && arr[0] && Array.isArray(arr[0].distractors) ? arr[0].distractors as string[] : undefined;
      // ☁️ ذخیرهٔ مجموعهٔ ساخته‌شده در آرشیو محلی + بانک مشترک (همهٔ دستگاه‌ها/کاربران)
      const entry: SatzArch = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ts: Date.now(), level, count: items.length, items: items.map(i => ({ de: i.de, fa: i.fa })) };
      const nextArch = [entry, ...loadSatzArch()];
      saveSatzArch(nextArch); setArch(nextArch);
      pushAiBank(SATZ_BANK, entry.id, entry, { level, count: entry.count });
      setQueue(items); setScore(0); setDone(false); setIdx(0);
      setBank(buildBank(items[0].de, pickDistractors(items[0].de, 3, firstDistractors))); setAns([]); setRes(null);
      setChatMsgs([]); setChatDraft('');
      setScreen('run');
      onShowToast(`${items.length} جمله ساخته شد ✓ ☁️`);
    } catch (e) {
      onShowToast(describeAiError ? describeAiError(e) : String(e), true);
    } finally {
      setBusy(false);
    }
  };

  const cur = queue[idx];
  const goto = (q: Item[], i: number) => {
    setIdx(i);
    setBank(buildBank(q[i].de, pickDistractors(q[i].de)));
    setAns([]); setRes(null);
    setChatMsgs([]); setChatDraft('');
  };
  const restart = () => { setScreen('config'); setDone(false); };
  /** اجرای یک تمرین ذخیره‌شدهٔ آرشیو (محلی یا دریافتی از بانک مشترک) */
  const runArch = (a: SatzArch) => {
    const q: Item[] = (a.items || []).map(i => ({ de: String(i?.de || ''), fa: String(i?.fa || ''), src: 'ai' as const })).filter(i => i.de);
    if (!q.length) return;
    setQueue(q); setScore(0); setDone(false); setIdx(0);
    setBank(buildBank(q[0].de, pickDistractors(q[0].de))); setAns([]); setRes(null);
    setChatMsgs([]); setChatDraft('');
    setScreen('run');
  };
  /** حذف از آرشیو محلی (با تأییدیه) — نسخهٔ بانک مشترک برای دستگاه‌های دیگر می‌ماند */
  const removeArch = async (a: SatzArch) => {
    if (!await askDel('حذف تمرین ذخیره‌شده', 'این مجموعهٔ تمرین از آرشیو این دستگاه حذف شود؟ (کپیِ بانک مشترک برای دستگاه‌های دیگر باقی می‌ماند.)')) return;
    const next = loadSatzArch().filter(x => x.id !== a.id);
    saveSatzArch(next); setArch(next);
  };
  const next = () => { if (idx + 1 >= queue.length) setDone(true); else goto(queue, idx + 1); };
  /** بعدی بدون بررسی — درخواست کاربر: عبور بدون امتیاز پیش از بررسی */
  const skipNext = () => { if (idx + 1 >= queue.length) setDone(true); else goto(queue, idx + 1); };
  /* درخواست کاربر: بعد از بررسی، اگر درست بود قفل می‌کنیم؛ اگر اشتباه بود اجازه می‌دهیم
   * کلمه‌ها را دوباره بچیند و دوباره روی «بررسی» بزند تا درست شود. */
  const pick = (t: { id: number; text: string }) => { if (res === true) return; setBank(b => b.filter(x => x.id !== t.id)); setAns(a => [...a, t]); };
  const back = (t: { id: number; text: string }) => { if (res === true) return; setAns(a => a.filter(x => x.id !== t.id)); setBank(b => [...b, t]); };
  const check = () => { const ok = ans.map(t => t.text).join(' ') === split(cur.de).join(' '); setRes(ok); if (ok && res !== true) setScore(s => s + 1); };
  const say = () => speak(cur.de, { onErr: m => onShowToast(m, true) });

  /* ───────── HTML5 drag-and-drop ─────────
   * هر کلمه draggable است؛ می‌توان آن را از بانک به جعبهٔ پاسخ کشید، یا بین دو کلمهٔ
   * درون جعبهٔ پاسخ جابه‌جا کرد. جای‌گذاری روی placeholderهای خالی هم پشتیبانی می‌شود. */
  const onTileDragStart = (e: React.DragEvent, tile: { id: number; text: string }, fromBank: boolean) => {
    setDragId(tile.id);
    e.dataTransfer.setData('application/json', JSON.stringify({ id: tile.id, text: tile.text, fromBank }));
    e.dataTransfer.effectAllowed = 'move';
  };
  const onTileDragEnd = () => setDragId(null);
  /** جابه‌جایی داخل جعبهٔ پاسخ: یک کاشی به‌جای کاشی دیگر */
  const reorderAns = (draggedId: number, targetId: number) => {
    setAns(prev => {
      const dIdx = prev.findIndex(x => x.id === draggedId);
      const tIdx = prev.findIndex(x => x.id === targetId);
      if (dIdx < 0 || tIdx < 0 || dIdx === tIdx) return prev;
      const next = [...prev];
      const [moved] = next.splice(dIdx, 1);
      next.splice(tIdx, 0, moved);
      return next;
    });
  };
  /** drop روی جعبهٔ پاسخ: اگر از بانک آمده → اضافه شود؛ اگر از داخل جعبه آمده → جابه‌جا شود */
  const onAnswerDrop = (e: React.DragEvent, targetTile?: { id: number; text: string }) => {
    e.preventDefault();
    if (res === true) return; // فقط بعد از پاسخ درست قفل می‌شود
    const data = e.dataTransfer.getData('application/json');
    if (!data) { setDragId(null); return; }
    try {
      const parsed = JSON.parse(data) as { id: number; text: string; fromBank: boolean };
      if (parsed.fromBank) {
        // بانک → جعبه: اگر targetTile هست، در همان جایگاه درج شود
        if (targetTile) {
          setBank(b => b.filter(x => x.id !== parsed.id));
          setAns(a => {
            const tIdx = a.findIndex(x => x.id === targetTile.id);
            if (tIdx < 0) return [...a, parsed];
            const next = [...a];
            next.splice(tIdx, 0, parsed);
            return next;
          });
        } else {
          pick(parsed);
        }
      } else {
        // داخل جعبه → جابه‌جایی
        if (targetTile && targetTile.id !== parsed.id) reorderAns(parsed.id, targetTile.id);
      }
    } catch { /* ignore */ }
    setDragId(null);
  };
  /** drop روی بانک: کاشی از جعبهٔ پاسخ به بانک بازگردد */
  const onBankDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (res === true) { setDragId(null); return; } // فقط بعد از پاسخ درست قفل
    const data = e.dataTransfer.getData('application/json');
    if (!data) { setDragId(null); return; }
    try {
      const parsed = JSON.parse(data) as { id: number; text: string; fromBank: boolean };
      if (!parsed.fromBank) {
        setAns(a => a.filter(x => x.id !== parsed.id));
        setBank(b => [...b, { id: parsed.id, text: parsed.text }]);
      }
    } catch { /* ignore */ }
    setDragId(null);
  };

  /* ───────── چت با معلم (مینیمال) — درخواست کاربر: چت پایین هر تمرین ───────── */
  const sendChat = async (override?: string) => {
    if (!cur || chatBusy) return;
    const q = (override || chatDraft).trim();
    if (!q) return;
    if (!hasApiKey()) { onShowToast('هوش مصنوعی در تنظیمات برنامه فعال نیست.', true); return; }
    setChatMsgs(m => [...m, { role: 'user', text: q }]);
    setChatDraft('');
    setChatBusy(true);
    try {
      const sys = `تو معلم صبور آلمانی برای فارسی‌زبانان هستی. در تمرین «چیدن جمله» دانش‌آموز جملهٔ آلمانیِ
«${cur.de}» (ترجمهٔ فارسی: ${cur.fa || '—'}) را می‌چیند. دربارهٔ ترتیب کلمه‌ها، جایگاه فعل، قواعد آلمانی پاسخ بده.
پاسخ‌ها: فارسی، کوتاه (۲–۵ جمله)، با مثال آلمانی وقتی کمک می‌کند.`;
      const out = await generateWithGemini(`${sys}\n\nپرسش دانش‌آموز: ${q}`, { timeoutMs: 60000, retries: 1 });
      setChatMsgs(m => [...m, { role: 'ai', text: String(out || '').trim() }]);
    } catch (e) {
      setChatMsgs(m => [...m, { role: 'ai', text: '⚠️ ' + (describeAiError(e) || String(e)) }]);
    } finally {
      setChatBusy(false);
    }
  };

  /* ── پیکربندی یکدست: نوع جمله‌ها + (سطح و تعداد برای AI) ── */
  if (screen === 'config') {
    return (
      <div className="space-y-3 text-right max-w-xl mx-auto">
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 space-y-4 shadow-xs">
          <Section n="۱" label="جمله‌ها از کجا بیایند؟">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setMode('own')} disabled={ownPool.length < 3} className={`py-2.5 px-2 rounded-xl text-xs font-bold border transition disabled:opacity-40 ${mode === 'own' ? 'bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white border-transparent' : 'bg-slate-50 dark:bg-[#141923] border-[#dde1ea] dark:border-[#333b4a]'}`}>
                📚 جمله‌های خودت
                <span className="block text-[11px] font-medium mt-0.5 opacity-80">از مثال‌های واژگان ({toFa(ownPool.length)})</span>
              </button>
              <button onClick={() => setMode('ai')} className={`py-2.5 px-2 rounded-xl text-xs font-bold border transition ${mode === 'ai' ? 'bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white border-transparent' : 'bg-slate-50 dark:bg-[#141923] border-[#dde1ea] dark:border-[#333b4a]'}`}>
                🎓 ساخت با معلم
                <span className="block text-[11px] font-medium mt-0.5 opacity-80">جمله‌های تازهٔ هم‌سطح</span>
              </button>
            </div>
          </Section>

          {mode === 'ai' && (
            <>
              <Section n="۲" label="سطح">
                <LevelChips value={level} onChange={l => setLevel(l as Lvl)} levels={LVL_ORDER as unknown as string[]} />
              </Section>
              <Section n="۳" label="تعداد جمله‌ها">
                <CountChips value={count} onChange={setCount} counts={[5, 8, 10]} />
              </Section>
            </>
          )}

          {mode === 'own' && ownPool.length < 3 && (
            <p className="text-xs text-amber-700 dark:text-amber-300 leading-6">
              برای این حالت به جمله‌های مثال نیاز است. در واژگانت چند واژه با «مثال» (ex) داشته باش، یا «ساخت با معلم» را انتخاب کن.
            </p>
          )}

          <PrimaryBtn
            onClick={() => { if (mode === 'own') startOwn(); else void startAi(); }}
            busy={busy}
            busyLabel="⏳ معلم دارد جمله‌ها را می‌سازد…"
            label={mode === 'own' ? '▶️ شروع تمرین' : '🚀 ساخت تمرین'}
            disabled={mode === 'own' && ownPool.length < 3}
          />
        </div>

        {/* 🗂 آرشیو تمرین‌های ساخته‌شدهٔ AI — محلی + بانک مشترک ابری (همهٔ دستگاه‌ها) */}
        <ArchivePanel
          title="🗂 تمرین‌های ساخته‌شدهٔ قبلی (AI)"
          count={arch.length}
          emptyText="هنوز تمرینی با معلم نساخته‌ای — هر مجموعه که بسازی اینجا ذخیره می‌شود و روی همهٔ دستگاه‌ها و برای همهٔ کاربران در دسترس خواهد بود."
        >
          {arch.map(a => (
            <ArchiveRow
              key={a.id}
              title={<span dir="ltr" className="font-sans">Satzbau — Niveau {a.level || '—'}</span>}
              chips={<><MiniChip>{toFa(a.count || a.items?.length || 0)} جمله</MiniChip><MiniChip>{faDate(a.ts)}</MiniChip><MiniChip tone="blue">☁️ بانک مشترک</MiniChip></>}
            >
              <SqBtn onClick={() => runArch(a)} title="اجرای این تمرین" tone="green">▶</SqBtn>
              <SqBtn onClick={() => void removeArch(a)} title="حذف از آرشیو این دستگاه" tone="red">🗑</SqBtn>
            </ArchiveRow>
          ))}
        </ArchivePanel>
        {delDialog}
      </div>
    );
  }

  if (done) return <Done score={score} total={queue.length} onAgain={restart} />;
  if (!cur) return null;
  /** تعداد جای خالی = تعداد واژه‌های جمله (درخواست کاربر) */
  const blanks = split(cur.de).length;
  return (
    <div className="space-y-3 text-right max-w-xl mx-auto">
      <div className="flex justify-between text-xs font-bold text-[#5d6676] dark:text-[#a3adbd]"><span>جمله {toFa(idx + 1)} از {toFa(queue.length)}</span><span>امتیاز: {toFa(score)}</span></div>
      <div className={card}>
        {/* بنر بالای هر تمرین: «۳ کلمه اضافی برای آزمایش شما اضافه شده» (درخواست کاربر) */}
        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs md:text-sm font-bold text-amber-800 dark:text-amber-300">
          ⚠️ {toFa(3)} کلمهٔ اضافی برای آزمایش شما اضافه شده — مجموع کلمه‌های پایین: {toFa(blanks + 3)} ({toFa(blanks)} اصلی + {toFa(3)} گمراه‌کننده)
        </div>
        <div className="text-xs font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">🧩 کلمه‌ها را به ترتیب درست آلمانی بچین</div>
        {cur.fa && <div className="text-base font-bold leading-8">{cur.fa}</div>}
        {/* جعبهٔ پاسخ با ابعاد ثابت — درخواست کاربر: با اضافه‌شدن کلمه‌ها بزرگ‌نمایی نمی‌شود
            N جای خالی نقطه‌چین نشان می‌دهد تا کاربر بداند چند کلمه باید بچیند */}
        <div
          dir="ltr"
          onDragOver={e => e.preventDefault()}
          onDrop={e => onAnswerDrop(e)}
          className="min-h-[88px] min-w-[260px] p-2 rounded-xl border-2 border-dashed border-[#1f5fbf]/50 flex flex-wrap gap-2 items-start bg-slate-50/40 dark:bg-slate-800/20"
        >
          {ans.length === 0 && (
            <span className="text-xs text-slate-400 p-1">{toFa(blanks)} جای خالی — کلمه‌ها را اینجا بگذار…</span>
          )}
          {ans.map(t => (
            <button
              key={t.id}
              onClick={() => back(t)}
              draggable
              onDragStart={e => onTileDragStart(e, t, false)}
              onDragEnd={onTileDragEnd}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.stopPropagation(); onAnswerDrop(e, t); }}
              className={`px-3 py-2 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/60 dark:to-indigo-900/60 text-blue-900 dark:text-blue-100 border border-blue-200 dark:border-blue-800 font-bold text-base font-sans ${dragId === t.id ? 'opacity-50' : ''}`}
            >{t.text}</button>
          ))}
        </div>
        {/* جای‌خالی‌های نقطه‌چین (درخواست کاربر: N جای خالی خالی نشان می‌دهد) — فقط وقتی ans ناقص است */}
        {ans.length < blanks && (
          <div dir="ltr" className="flex flex-wrap gap-2">
            {Array.from({ length: blanks - ans.length }).map((_, i) => (
              <span key={i} className="inline-block min-w-[56px] h-9 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 bg-transparent" />
            ))}
          </div>
        )}
        {/* بانک کلمه‌ها — رنگ روشن‌تر (درخواست کاربر) */}
        <div
          dir="ltr"
          onDragOver={e => e.preventDefault()}
          onDrop={onBankDrop}
          className="flex flex-wrap gap-2"
        >
          {bank.map(t => (
            <button
              key={t.id}
              onClick={() => pick(t)}
              draggable
              onDragStart={e => onTileDragStart(e, t, true)}
              onDragEnd={onTileDragEnd}
              className={`px-3 py-2 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/60 dark:to-indigo-900/60 text-blue-900 dark:text-blue-100 border border-blue-200 dark:border-blue-800 font-bold text-base font-sans active:scale-95 ${dragId === t.id ? 'opacity-50' : ''}`}
            >{t.text}</button>
          ))}
        </div>
        {res === null ? (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={skipNext} className="h-12 rounded-xl border border-slate-300 dark:border-slate-600 text-xs md:text-sm font-bold">بعدی (بدون بررسی)</button>
            <button onClick={check} disabled={ans.length === 0} className="h-12 rounded-xl bg-emerald-600 text-white font-bold text-sm disabled:opacity-40">✅ بررسی</button>
          </div>
        ) : res ? (
          /* درست — پیام تایید + دکمهٔ بعدی */
          <div className="space-y-2">
            <div className="p-3 md:p-4 rounded-xl text-sm md:text-base font-bold leading-7 md:leading-8 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200">✅ درست!</div>
            <div dir="ltr" className="font-sans font-bold text-base md:text-lg leading-8 md:leading-9"><ClickableWords text={cur.de} onWord={setLookup} /></div>
            <div className="flex gap-2">
              <button onClick={say} className="px-4 h-11 rounded-xl bg-[#1f5fbf] text-white text-sm font-bold">🔊</button>
              <button onClick={next} className="flex-1 h-11 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white font-bold text-sm">{idx + 1 >= queue.length ? 'پایان' : 'بعدی ←'}</button>
            </div>
          </div>
        ) : (
          /* اشتباه — درخواست کاربر: اخطار + اجازهٔ جابجایی و اصلاح + دکمهٔ «بررسی دوباره»
           * کاربر می‌تواند کلمه‌ها را دوباره بچیند و دوباره روی «بررسی دوباره» بزند تا
           * مقایسهٔ تازه انجام شود و درستی یا اشتباه جدید اعلام شود. */
          <div className="space-y-2">
            <div className="p-3 md:p-4 rounded-xl text-sm md:text-base font-bold leading-7 md:leading-8 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200">
              ❌ هنوز درست نیست. کلمه‌ها را بچین و دوباره روی «بررسی دوباره» بزن.
            </div>
            <div dir="ltr" className="font-sans font-bold text-base md:text-lg leading-8 md:leading-9"><ClickableWords text={cur.de} onWord={setLookup} /></div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={skipNext} className="h-11 rounded-xl border border-slate-300 dark:border-slate-600 text-xs font-bold">بعدی (بدون امتیاز)</button>
              <button onClick={check} disabled={ans.length === 0} className="h-11 rounded-xl bg-emerald-600 text-white font-bold text-sm disabled:opacity-40">✅ بررسی دوباره</button>
            </div>
            <div className="flex gap-2">
              <button onClick={say} className="px-4 h-11 rounded-xl bg-[#1f5fbf] text-white text-sm font-bold">🔊</button>
              <button onClick={() => { setScore(s => s + 1); setRes(true); }} className="flex-1 h-11 rounded-xl border border-slate-300 dark:border-slate-600 text-xs font-bold">ترتیب من هم درست است</button>
              <button onClick={next} className="flex-1 h-11 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white font-bold text-sm">{idx + 1 >= queue.length ? 'پایان' : 'بعدی ←'}</button>
            </div>
          </div>
        )}
      </div>

      {/* چت با معلم (مینیمال) — پایین هر تمرین (درخواست کاربر) */}
      <div className="rounded-xl border border-[#1f5fbf]/40 bg-blue-50/40 dark:bg-blue-950/20 dark:border-[#7fb0ff]/30 p-2.5 space-y-2" dir="rtl">
        <div className="flex items-center justify-between text-[11px] font-bold text-[#5d6676]">
          <span>💬 گفتگو با معلم دربارهٔ همین جمله</span>
        </div>
        <div className="max-h-48 overflow-y-auto space-y-2">
          {chatMsgs.length === 0 && <p className="text-[11px] text-[#5d6676]">دربارهٔ ترتیب کلمه‌ها یا قواعد این جمله بپرس.</p>}
          {chatMsgs.map((m, i) => (
            <div key={i} className={`text-xs leading-6 rounded-lg px-2.5 py-1.5 max-w-[88%] whitespace-pre-wrap ${m.role === 'user' ? 'bg-[#1f5fbf] text-white ml-auto' : 'bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a]'}`}>{m.text}</div>
          ))}
          {chatBusy && <div className="text-[11px] text-[#5d6676] animate-pulse">معلم دارد می‌نویسد…</div>}
          <div ref={chatEndRef} />
        </div>
        <div className="flex items-center gap-1.5">
          <input
            value={chatDraft}
            onChange={e => setChatDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') sendChat(); }}
            placeholder="پرسشت را بنویس…"
            className="flex-1 min-w-0 border-2 border-[#1f5fbf]/50 dark:border-[#7fb0ff]/40 rounded-lg px-3 py-2 text-base bg-white dark:bg-[#141923] outline-none"
          />
          <button
            onClick={() => sendChat()}
            disabled={chatBusy || !chatDraft.trim()}
            className="w-10 h-10 rounded-lg bg-[#1f5fbf] text-white flex items-center justify-center flex-shrink-0 disabled:opacity-40"
            aria-label="ارسال"
          >↑</button>
        </div>
      </div>

      {/* پاپ‌آپ واژهٔ لمس‌شده — جملهٔ درست بعد از بررسی */}
      {lookup && (
        <WordLookupModal
          word={lookup}
          level={mode === 'ai' ? level : 'A2'}
          cat="Satzbau"
          onQuickAddWord={onQuickAddWord}
          words={words}
          onViewWord={onViewWord}
          onClose={() => setLookup(null)}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------- Diktat
type Cell = { t: string; ok: boolean };
const diff = (orig: string, typed: string): { cells: Cell[]; extra: string[]; pct: number } => {
  const a = orig.split(/\s+/).filter(Boolean); const b = typed.split(/\s+/).filter(Boolean);
  const A = a.map(clean); const B = b.map(clean);
  const L: number[][] = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const cells: Cell[] = []; const usedB = new Set<number>(); let i = 0, j = 0;
  while (i < A.length) {
    if (j < B.length && A[i] === B[j]) { cells.push({ t: a[i], ok: true }); usedB.add(j); i++; j++; }
    else if (j < B.length && L[i][j + 1] >= L[i + 1][j]) j++;
    else { cells.push({ t: a[i], ok: false }); i++; }
  }
  const extra = b.filter((_, k) => !usedB.has(k));
  return { cells, extra, pct: A.length ? Math.round((cells.filter(c => c.ok).length / A.length) * 100) : 0 };
};

export const Diktat: React.FC<DrillProps> = ({ words, onShowToast, onQuickAddWord, onViewWord }) => {
  const pool = useMemo(() => collect(words, 3, 12), [words]);
  const make = () => shuffle(pool).slice(0, 8);
  const [queue, setQueue] = useState<Item[]>(make);
  const [lookup, setLookup] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState('');
  const [slow, setSlow] = useState(false);
  const [res, setRes] = useState<null | ReturnType<typeof diff>>(null);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(false);

  if (pool.length < 3) return (
    <div className={card + ' text-sm leading-7 text-center'}>برای این تمرین به جمله‌های مثال نیاز است. در واژگانت چند واژه با «مثال» (ex) داشته باش، یا واژه‌ها را با پرامپت کامل اضافه کن.</div>
  );
  const cur = queue[idx];
  const play = (forceSlow?: boolean) => speak(cur.de, { rate: (forceSlow ?? slow) ? 0.7 : 1, onErr: m => onShowToast(m, true) });
  const check = () => { const r = diff(cur.de, text); setRes(r); setTotal(t => t + r.pct); };
  const next = () => { if (idx + 1 >= queue.length) setDone(true); else { setIdx(idx + 1); setText(''); setRes(null); } };
  const restart = () => { setQueue(make()); setIdx(0); setText(''); setRes(null); setTotal(0); setDone(false); };

  if (done) return <Done score={Math.round(total / queue.length)} total={100} onAgain={restart} />;
  return (
    <div className="space-y-3 text-right max-w-xl mx-auto">
      <div className="flex justify-between text-xs font-bold text-[#5d6676] dark:text-[#a3adbd]"><span>جمله {toFa(idx + 1)} از {toFa(queue.length)}</span><span>میانگین دقت: {idx + (res ? 1 : 0) ? Math.round(total / (idx + (res ? 1 : 0))) : 0}٪</span></div>
      <div className={card}>
        <div className="text-xs font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">🎧 جمله را بشنو و دقیقاً بنویس (با حروف بزرگ اسم‌ها و نشانه‌گذاری)</div>
        <div className="flex gap-2">
          <button onClick={() => play()} className="flex-1 h-14 rounded-xl bg-rose-600 text-white font-bold text-base">🔊 پخش</button>
          <button onClick={() => { setSlow(true); play(true); }} className="px-4 h-14 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-bold">🐢 آهسته</button>
        </div>
        <textarea dir="ltr" value={text} onChange={e => setText(e.target.value)} disabled={res !== null} rows={3} placeholder="Schreibe, was du hörst …"
          className="w-full bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl p-3 text-base font-sans leading-8 outline-none focus:border-[#1f5fbf]" />
        {res === null ? (
          <button onClick={check} disabled={!text.trim()} className="w-full h-12 rounded-xl bg-emerald-600 text-white font-bold text-sm disabled:opacity-40">✅ بررسی</button>
        ) : (
          <div className="space-y-2">
            <div className="font-extrabold text-sm md:text-base">دقت: <span className={res.pct >= 80 ? 'text-emerald-600' : res.pct >= 50 ? 'text-amber-600' : 'text-rose-600'} dir="ltr">{res.pct}%</span></div>
            <div dir="ltr" className="font-sans text-base md:text-lg leading-9 md:leading-10 flex flex-wrap gap-x-1.5">
              {res.cells.map((c, i) => <span key={i} onClick={() => setLookup(clean(c.t) || c.t)} className={`cursor-pointer rounded px-0.5 hover:bg-amber-200/80 dark:hover:bg-amber-700/50 transition ${c.ok ? 'text-emerald-700 dark:text-emerald-300 font-bold' : 'text-rose-600 dark:text-rose-400 font-bold underline decoration-wavy'}`}>{c.t}</span>)}
            </div>
            {res.extra.length > 0 && <div className="text-xs md:text-sm text-rose-600 dark:text-rose-400" dir="ltr">✗ {res.extra.join(' · ')}</div>}
            {cur.fa && <div className="text-sm md:text-base leading-7 md:leading-8 text-[#5d6676] dark:text-[#a3adbd]">{cur.fa}</div>}
            <button onClick={next} className="w-full h-11 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white font-bold text-sm">{idx + 1 >= queue.length ? 'پایان' : 'بعدی ←'}</button>
          </div>
        )}
      </div>
      {/* پاپ‌آپ واژهٔ لمس‌شده — سلول‌های نتیجهٔ دیکته */}
      {lookup && (
        <WordLookupModal
          word={lookup}
          level="A2"
          cat="Diktat"
          onQuickAddWord={onQuickAddWord}
          words={words}
          onViewWord={onViewWord}
          onClose={() => setLookup(null)}
        />
      )}
    </div>
  );
};
