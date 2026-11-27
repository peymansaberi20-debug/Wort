/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * DialogTrainer.tsx — تمرین دیالوگ و مکالمه دو نفره (درخواست کاربر ۵)
 *
 * AI یک سناریوی مکالمهٔ واقعی B2 می‌سازد (رستوران، دکتر، ایستگاه، مصاحبه شغلی، …):
 *   - نقش A: طرف مقابل (گارسون، پزشک، کارمند، مصاحبه‌کننده) — جمله‌های A از پیش نمایش داده می‌شوند
 *   - نقش B: کاربر — باید پاسخ هر جملهٔ A را تایپ کند
 *   - تصحیح: AI پاسخ کاربر را در بافت دیالوگ بررسی می‌کند (گرامر، لحن، مناسب بودن)
 *
 * - انتخاب سطح + موضوع (سناریو)
 * - آرشیو محلی + بانک مشترک ابری
 * - چاپ با پاسخنامه (PrintPreview مشترک)
 * - چت با معلم دربارهٔ هر پاسخ
 *
 * قرمز: هیچ قابلیت دیگری حذف نشده — فقط یک تمرین جدید اضافه شده.
 */

import React, { useState, useEffect, useRef } from 'react';
import { describeAiError, generateText, hasApiKey } from '../utils/aiProvider';
import { generateWithGemini } from '../utils/ai';
import { Lvl, LVL_ORDER } from '../data/konnektorenData';
import { ArchivePanel, ArchiveRow, CountChips, LevelChips, MiniChip, PrimaryBtn, PrintPreview, Section, SqBtn, faDate, prFa, prG, toFa, useConfirm } from './trainerUI';
import { pushAiBank, fetchAiBank, aiBankMarkSeen, aiBankSeenIds, mergeAiBank } from '../utils/aiBank';
import { X, Printer, Mic, MicOff } from 'lucide-react';
// درخواست کاربر ۳: پشتیبانی صوتی — پخش TTS و تشخیص گفتار
import { speak, stopSpeaking } from '../utils/audio';

interface DialogTurn {
  role: 'A' | 'B';
  /** متن پیش‌فرض این نوبت (برای A: جملهٔ طرف مقابل؛ برای B: پاسخ نمونه) */
  text: string;
  /** راهنمایی فارسی برای کاربر وقتی نوبت اوست (فقط برای نقش B) */
  hint?: string;
}
interface DialogItem {
  id: string;
  scenario: string;   // عنوان سناریو (مثلاً «در رستوران»)
  scenarioFa: string; // ترجمهٔ فارسی سناریو
  level: string;
  turns: DialogTurn[];
  /** ترجمهٔ فارسی پاسخ‌های نمونهٔ B */
  bTurnsFa?: string[];
}
interface DialogArch { id: string; ts: number; level: string; count: number; items: DialogItem[] }

const ARCH_KEY = 'wb_dialog_arch_v1';
const BANK_KEY = 'dialog';
const load = <T,>(k: string, d: T): T => { try { const v = JSON.parse(localStorage.getItem(k) || ''); return v ?? d; } catch { return d; } };
const save = (k: string, v: any) => { try { localStorage.setItem(k, JSON.stringify(v.slice(0, 30))); } catch { /* ignore */ } };
const shuffle = <T,>(a: T[]): T[] => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

const SCENARIOS = [
  { de: 'Im Restaurant', fa: 'در رستوران' },
  { de: 'Beim Arzt', fa: 'نزد پزشک' },
  { de: 'Am Bahnhof / Im Zug', fa: 'در ایستگاه قطار' },
  { de: 'Bewerbungsgespräch', fa: 'مصاحبه شغلی' },
  { de: 'Wohnungssuche / Beim Makler', fa: 'جستجوی آپارتمان / نزد مشاور املاک' },
  { de: 'Im Supermarkt', fa: 'در سوپرمارکت' },
  { de: 'Beim Einwohnermeldeamt', fa: 'در اداره ثبت‌نام سکنی' },
  { de: 'Telefonieren mit dem Vermieter', fa: 'تماس تلفنی با صاحب‌خانه' },
  { de: 'Im Hotel an der Rezeption', fa: 'در هتل، پذیرش' },
  { de: 'Nach dem Weg fragen', fa: 'پرسیدن مسیر' },
  { de: 'Freunde treffen / Verabredung', fa: 'ملاقات دوستان / قرار گذاشتن' },
  { de: 'Beim Friseur', fa: 'نزد آرایشگر' }
];

interface Props {
  onShowToast: (m: string, isErr?: boolean) => void;
}

interface ChatMsg { role: 'user' | 'ai'; text: string }
interface EvalRes { score: number; feedbackFa: string; correctedDe: string }

export const DialogTrainer: React.FC<Props> = ({ onShowToast }) => {
  const [level, setLevel] = useState<Lvl>('B2');
  const [scenario, setScenario] = useState<string>('Im Restaurant');
  const [count, setCount] = useState(2); // تعداد دیالوگ‌ها
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<DialogItem[]>([]);
  const [curItem, setCurItem] = useState<DialogItem | null>(null);
  const [turnIdx, setTurnIdx] = useState(0);
  const [typed, setTyped] = useState('');
  const [evalRes, setEvalRes] = useState<EvalRes | null>(null);
  const [evalBusy, setEvalBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [score, setScore] = useState(0);
  const [arch, setArch] = useState<DialogArch[]>(() => load(ARCH_KEY, []));
  const [printOpen, setPrintOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const { ask: askDel, dialog: delDialog } = useConfirm();
  const card = 'bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 space-y-3';

  // درخواست کاربر ۳: حالت صوتی — تشخیص گفتار کاربر + پخش خودکار جمله‌های A
  const [listening, setListening] = useState(false);
  const [recSupported, setRecSupported] = useState(false);
  const recRef = useRef<any>(null);
  const interimRef = useRef('');
  const spokenThisTurnRef = useRef<Set<string>>(new Set()); // جلوگیری از پخش تکراری هر نوبت A

  // مقادیر مشتق‌شده — قبل از useEffect چون از آن‌ها استفاده می‌شود
  const bTurnIndices = curItem ? curItem.turns.map((t, i) => t.role === 'B' ? i : -1).filter(i => i >= 0) : [];
  const curBTurnIdx = bTurnIndices.indexOf(turnIdx);
  const curTurn = curItem?.turns[turnIdx];

  useEffect(() => {
    const SR: any = (typeof window !== 'undefined') ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;
    setRecSupported(!!SR);
  }, []);

  // پخش خودکار جملهٔ A وقتی وارد نوبت می‌شویم
  useEffect(() => {
    if (!curItem || !curTurn || curTurn.role !== 'A') return;
    // فقط اگر این نوبت قبلاً پخش نشده
    const key = `${curItem.id}-${turnIdx}`;
    if (spokenThisTurnRef.current.has(key)) return;
    spokenThisTurnRef.current.add(key);
    // پخش صوتی جملهٔ A — طرف مقابل صحبت می‌کند
    void speak(curTurn.text, { rate: 1, vreg: 'de-DE', onErr: () => { /* بی‌صدا */ } });
  }, [curItem, turnIdx]);

  // stop listening و speaking در unmount
  useEffect(() => {
    return () => {
      stopSpeaking();
      try { recRef.current?.abort?.(); } catch { /* ignore */ }
    };
  }, []);

  const startListening = () => {
    const SR: any = (typeof window !== 'undefined') ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;
    if (!SR) { onShowToast('مرورگر شما از تشخیص گفتار پشتیبانی نمی‌کند.', true); return; }
    try { recRef.current?.abort?.(); } catch { /* ignore */ }
    const rec = new SR();
    rec.lang = 'de-DE';
    rec.interimResults = true;
    rec.continuous = false;
    interimRef.current = '';
    rec.onresult = (e: any) => {
      let finalText = '';
      let interimText = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      interimRef.current = interimText;
      if (finalText) setTyped(t => (t ? t + ' ' : '') + finalText.trim());
    };
    rec.onerror = (e: any) => {
      setListening(false);
      if (e?.error !== 'aborted' && e?.error !== 'no-speech') {
        onShowToast('خطای تشخیص گفتار: ' + (e?.error || ''), true);
      }
    };
    rec.onend = () => { setListening(false); interimRef.current = ''; };
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const stopListening = () => {
    try { recRef.current?.abort?.(); } catch { /* ignore */ }
    setListening(false);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const seen = aiBankSeenIds(BANK_KEY);
        const cloud = await fetchAiBank<DialogArch>(BANK_KEY);
        if (!alive) return;
        aiBankMarkSeen(BANK_KEY, cloud.map(c => c.id));
        setArch(prev => {
          const merged = mergeAiBank(prev, cloud, seen);
          if (merged !== prev && merged.length > prev.length) { save(ARCH_KEY, merged); return merged; }
          return prev;
        });
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, []);

  const generate = async () => {
    if (!hasApiKey()) { onShowToast('معلم در تنظیمات فعال نیست.', true); return; }
    setBusy(true);
    try {
      const sc = SCENARIOS.find(s => s.de === scenario) || SCENARIOS[0];
      const prompt = `Du bist ein erfahrener Deutschlehrer (Niveau ${level}). Erstelle GENAU ${count} Dialoge für das Sprechen-Training auf Niveau ${level}.
Szenario für alle Dialoge: "${sc.de}" (${sc.fa}).
Regeln:
- Jeder Dialog hat 6–8 Turns (abwechselnd A und B). Rolle A ist der Gegenüber (Kellner, Arzt, Verkäufer…); Rolle B ist der Lerner.
- Rolle A beginnt. Die Äußerungen von A sind vollständig und natürlich.
- Rolle B hat "text": eine beispielhafte, korrekte Antwort und "hint": eine kurze persische Hilfestellung (was man sagen könnte, ohne die Antwort vorwegzunehmen).
- "bTurnsFa": persische Übersetzungen aller B-Antworten (Array der Länge = Anzahl B-Turns).
- Realistisch, alltagstauglich, mit höflichen Formeln (Bitte, Danke, Entschuldigung).
Antworte NUR mit einem JSON-Array:
[{"scenario":"${sc.de}","scenarioFa":"${sc.fa}","level":"${level}","turns":[{"role":"A","text":"…"},{"role":"B","text":"…","hint":"…"}],"bTurnsFa":["…","…"]}]`;
      const raw = await generateText(prompt, { json: true, timeoutMs: 90000, retries: 1 });
      let arr: any[] = [];
      try {
        const s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
        const a = s.indexOf('['), b = s.lastIndexOf(']');
        arr = JSON.parse(a >= 0 && b > a ? s.slice(a, b + 1) : s);
      } catch { arr = []; }
      const its: DialogItem[] = (Array.isArray(arr) ? arr : [])
        .filter((x: any) => x && Array.isArray(x.turns) && x.turns.length >= 4)
        .map((x: any) => ({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          scenario: String(x.scenario || sc.de),
          scenarioFa: String(x.scenarioFa || sc.fa),
          level,
          turns: x.turns.map((t: any) => ({ role: String(t.role || 'A').toUpperCase() === 'B' ? 'B' : 'A', text: String(t.text || '').trim(), hint: String(t.hint || '').trim() })),
          bTurnsFa: Array.isArray(x.bTurnsFa) ? x.bTurnsFa.map((s: any) => String(s || '').trim()) : []
        }))
        .slice(0, count);
      if (!its.length) throw new Error('پاسخ معلم ساختار معتبر نداشت — دوباره تلاش کن.');
      const entry: DialogArch = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ts: Date.now(), level, count: its.length, items: its };
      const next = [entry, ...load<DialogArch[]>(ARCH_KEY, [])].slice(0, 30);
      save(ARCH_KEY, next); setArch(next);
      pushAiBank(BANK_KEY, entry.id, entry, { level, count: entry.count });
      setItems(its); setCurItem(its[0]); setTurnIdx(0); setTyped(''); setEvalRes(null); setDone(false); setScore(0);
      onShowToast(`${its.length} دیالوگ ساخته شد ✓`);
    } catch (e) {
      onShowToast(describeAiError ? describeAiError(e) : String(e), true);
    } finally { setBusy(false); }
  };

  const runArch = (a: DialogArch) => {
    if (!a.items?.length) return;
    setItems(a.items); setCurItem(a.items[0]); setTurnIdx(0); setTyped(''); setEvalRes(null); setDone(false); setScore(0);
  };
  const removeArch = async (a: DialogArch) => {
    if (!await askDel('حذف دیالوگ', 'این مجموعه از آرشیو حذف شود؟')) return;
    const next = load<DialogArch[]>(ARCH_KEY, []).filter(x => x.id !== a.id);
    save(ARCH_KEY, next); setArch(next);
  };

  // (bTurnIndices/curBTurnIdx/curTurn قبلاً در بالا تعریف شده‌اند)

  const evalAnswer = async () => {
    if (!curItem || !curTurn || evalBusy) return;
    const ans = typed.trim();
    if (!ans) return;
    setEvalBusy(true); setEvalRes(null);
    try {
      // بافت دیالوگ تا اینجا
      const context = curItem.turns.slice(0, turnIdx + 1).map(t => `${t.role}: ${t.role === 'B' && t.text === typed ? ans : t.text}`).join('\n');
      const prompt = `Du bist ein strenger, aber fairer Deutschlehrer (Niveau ${level}). Bewerte die Antwort des Lerners (Rolle B) im folgenden Dialogausschnitt.
Szenario: ${curItem.scenario}
Kontext:
${context}

Antwort des Lerners (Rolle B): "${ans}"

Aufgaben:
1. Bewerte die Antwort auf Skala 0-100 (Grammatik, Wortschatz, Angemessenheit im Kontext, Höflichkeit).
2. Gib eine kurze persische Rückmeldung (2-4 Sätze): Was war gut, was kann verbessert werden?
3. Gib eine korrigierte, natürlichere Version der Antwort auf Deutsch.

Antworte NUR mit JSON: {"score":0,"feedbackFa":"…","correctedDe":"…"}`;
      const out = await generateWithGemini(prompt, { timeoutMs: 60000, retries: 1 });
      const m = /\{[\s\S]*\}/.exec(out || '');
      if (!m) throw new Error('پاسخ نامعتبر');
      const parsed = JSON.parse(m[0]) as EvalRes;
      setEvalRes({
        score: Math.max(0, Math.min(100, Math.round(parsed.score || 0))),
        feedbackFa: String(parsed.feedbackFa || ''),
        correctedDe: String(parsed.correctedDe || '')
      });
      if ((parsed.score || 0) >= 70) setScore(s => s + 1);
    } catch (e: any) {
      setEvalRes({ score: 0, feedbackFa: 'خطا در تصحیح: ' + (e?.message || ''), correctedDe: typed });
    } finally { setEvalBusy(false); }
  };

  const nextTurn = () => {
    if (!curItem) return;
    // نوبت بعدی B را پیدا کن
    const nextB = bTurnIndices.find(i => i > turnIdx);
    if (nextB === undefined) {
      // دیالوگ تمام شد — بعدی یا پایان
      const curIdx = items.indexOf(curItem);
      if (curIdx + 1 >= items.length) {
        setDone(true);
        onShowToast(`تمرین به پایان رسید — ${toFa(score)} پاسخ خوب از ${toFa(bTurnIndices.length * items.length)}`);
      } else {
        setCurItem(items[curIdx + 1]); setTurnIdx(items[curIdx + 1].turns.findIndex(t => t.role === 'B')); setTyped(''); setEvalRes(null);
      }
    } else {
      setTurnIdx(nextB); setTyped(''); setEvalRes(null);
    }
  };

  const sendChat = async () => {
    if (chatBusy || !curTurn) return;
    const q = chatDraft.trim();
    if (!q) return;
    if (!hasApiKey()) { onShowToast('معلم فعال نیست.', true); return; }
    setChatMsgs(m => [...m, { role: 'user', text: q }]);
    setChatDraft(''); setChatBusy(true);
    try {
      const sys = `تو معلم صبور آلمانی برای فارسی‌زبانان هستی. در دیالوگ «${curItem?.scenario || ''}» (سطح ${level}) دانش‌آموز نقش B را بازی می‌کند.
جملهٔ طرف مقابل (A): ${curItem?.turns[turnIdx - 1]?.text || '—'}
جملهٔ نمونهٔ B: ${curTurn.text}
پاسخ فارسی، کوتاه، با مثال آلمانی.`;
      const out = await generateText(`${sys}\n\nپرسش: ${q}`, { json: false, timeoutMs: 60000, retries: 1 });
      setChatMsgs(m => [...m, { role: 'ai', text: String(out || '').trim() }]);
    } catch (e: any) {
      setChatMsgs(m => [...m, { role: 'ai', text: 'خطا: ' + (e?.message || '') }]);
    } finally { setChatBusy(false); }
  };

  /* ─────────── SETUP / DONE ─────────── */
  if ((!curItem && items.length === 0) || done) {
    return (
      <div className="space-y-3 text-right max-w-2xl mx-auto">
        <div className={card}>
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-base flex items-center gap-2"><span>🎭</span> تمرین دیالوگ و مکالمه</h3>
          </div>
          <p className="text-xs text-[#5d6676] dark:text-[#a3adbd] leading-7">AI یک سناریوی واقعی می‌سازد؛ نقش A (طرف مقابل) جمله می‌گوید و تو نقش B را تایپ می‌کنی. معلم پاسخت را در بافت دیالوگ تصحیح می‌کند.</p>
          {done && (
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 p-3 text-center">
              <div className="text-3xl">{score / (bTurnIndices.length * items.length || 1) >= 0.7 ? '🏆' : '💪'}</div>
              <div className="font-extrabold text-sm mt-1">{toFa(score)} پاسخ خوب از {toFa(bTurnIndices.length * items.length)}</div>
              <button onClick={() => setPrintOpen(true)} className="mt-2 mx-auto block bg-[#1f5fbf] text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"><Printer size={14} /> چاپ با پاسخنامه</button>
            </div>
          )}
          <Section n="۱" label="سطح"><LevelChips value={level} onChange={l => setLevel(l as Lvl)} levels={LVL_ORDER as unknown as string[]} /></Section>
          <Section n="۲" label="سناریو">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {SCENARIOS.map(s => (
                <button key={s.de} onClick={() => setScenario(s.de)} dir="ltr" className={`text-[11px] rounded-lg px-2 py-1.5 border text-left ${scenario === s.de ? 'bg-[#1f5fbf] text-white border-transparent' : 'bg-slate-50 dark:bg-[#141923] border-[#dde1ea] dark:border-[#333b4a]'}`}>
                  <div className="font-bold">{s.de}</div>
                  <div className="text-[10px] opacity-75" dir="rtl">{s.fa}</div>
                </button>
              ))}
            </div>
          </Section>
          <Section n="۳" label="تعداد دیالوگ"><CountChips value={count} onChange={setCount} counts={[1, 2, 3]} /></Section>
          <PrimaryBtn onClick={() => void generate()} busy={busy} busyLabel="⏳ معلم دارد دیالوگ می‌سازد…" label="🚀 ساخت دیالوگ" />
        </div>

        <ArchivePanel title="🗂 دیالوگ‌های ذخیره‌شده" count={arch.length}
          emptyText="هر دیالوگ که با معلم بسازی اینجا ذخیره می‌شود و در بانک مشترک برای همهٔ دستگاه‌ها قابل دسترس است.">
          {arch.map(a => (
            <ArchiveRow key={a.id}
              title={<span dir="ltr" className="font-sans">Dialog — Niveau {a.level} ({toFa(a.count)} دیالوگ)</span>}
              chips={<><MiniChip>{faDate(a.ts)}</MiniChip><MiniChip tone="blue">☁️ بانک مشترک</MiniChip></>}
            >
              <SqBtn onClick={() => runArch(a)} tone="green" title="اجرای این مجموعه">▶</SqBtn>
              <SqBtn onClick={() => void removeArch(a)} tone="red" title="حذف">🗑</SqBtn>
            </ArchiveRow>
          ))}
        </ArchivePanel>
        {delDialog}
        {printOpen && done && (
          <PrintPreview
            open onClose={() => setPrintOpen(false)}
            title={<span>Dialoge — Niveau {level}</span>}
            docTitle={`Dialoge — ${level}`}
            meta={<>{toFa(items.length)} دیالوگ</>}
            questions={
              <div className="space-y-4">
                {items.map((it, i) => (
                  <div key={it.id}>
                    <div className="font-bold text-sm mb-1.5">{i + 1}. {it.scenario} <span className="text-xs text-slate-500">({it.scenarioFa})</span></div>
                    <div className="space-y-1">
                      {it.turns.map((t, j) => (
                        <div key={j} style={prG()} className={`text-sm ${t.role === 'A' ? 'text-slate-700' : 'text-[#1f5fbf] font-bold'}`}>
                          <b>{t.role}:</b> {t.role === 'B' ? '_________________' : t.text}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            }
            solutions={
              <div className="space-y-4">
                {items.map((it, i) => (
                  <div key={it.id}>
                    <div className="font-bold text-sm mb-1.5">{i + 1}. {it.scenario}</div>
                    <div className="space-y-1">
                      {it.turns.map((t, j) => (
                        <div key={j} style={prG()} className={`text-sm ${t.role === 'A' ? 'text-slate-700' : 'text-emerald-700 font-bold'}`}>
                          <b>{t.role}:</b> {t.text}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            }
          />
        )}
      </div>
    );
  }

  /* ─────────── RUN ─────────── */
  if (!curItem || !curTurn) return null;
  const aTurnsShown = curItem.turns.slice(0, turnIdx + 1);
  return (
    <div className="space-y-3 text-right max-w-2xl mx-auto">
      <div className="flex justify-between text-xs font-bold text-[#5d6676] dark:text-[#a3adbd]">
        <span>{curItem.scenario} <span className="text-[10px] opacity-75">({curItem.scenarioFa})</span></span>
        <span>دیالوگ {toFa(items.indexOf(curItem) + 1)} از {toFa(items.length)} • نوبت B {toFa(curBTurnIdx + 1)}/{toFa(bTurnIndices.length)}</span>
      </div>
      <div className={card}>
        {/* نمایش دیالوگ تا اینجا — درخواست کاربر ۳: دکمهٔ پخش صوتی روی هر جملهٔ A */}
        <div className="space-y-2 max-h-[280px] overflow-y-auto p-2 rounded-xl bg-slate-50 dark:bg-[#141923]">
          {aTurnsShown.map((t, i) => (
            <div key={i} className={`text-sm leading-7 ${t.role === 'A' ? 'text-right' : 'text-left'}`}>
              {t.role === 'A' ? (
                <div dir="ltr" className="inline-flex items-end gap-1.5 max-w-[90%]">
                  <div className="inline-block px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100">
                    <b className="text-[10px] text-slate-500 block">A:</b> {t.text}
                  </div>
                  <button
                    onClick={() => speak(t.text, { rate: 1, vreg: 'de-DE', onErr: () => {} })}
                    className="flex-shrink-0 w-7 h-7 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[#1f5fbf] dark:text-[#7fb0ff] flex items-center justify-center hover:bg-blue-50 dark:hover:bg-blue-950/30 transition"
                    title="پخش این جمله"
                  >🔊</button>
                </div>
              ) : (
                <div dir="ltr" className="inline-block max-w-[85%] px-3 py-1.5 rounded-xl bg-[#1f5fbf] text-white">
                  <b className="text-[10px] opacity-80 block">B:</b> {i === turnIdx ? (typed || '…') : t.text}
                </div>
              )}
            </div>
          ))}
        </div>
        {/* راهنمایی */}
        {curTurn.hint && !evalRes && (
          <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2 rounded-lg">💡 {curTurn.hint}</div>
        )}
        {/* پاسخ کاربر — درخواست کاربر ۳: دکمهٔ میکروفون کنار فیلد */}
        <div className="flex gap-1.5 items-stretch">
          <input dir="ltr" value={typed} onChange={e => setTyped(e.target.value)} disabled={evalRes !== null || evalBusy} onKeyDown={e => { if (e.key === 'Enter') void evalAnswer(); }}
            placeholder="پاسخت را به آلمانی بنویس یا بگو…" className="flex-1 bg-white dark:bg-[#141923] border-2 border-[#1f5fbf] dark:border-[#7fb0ff] rounded-xl px-3 py-2.5 font-sans text-base outline-none disabled:opacity-60" />
          {recSupported && (
            <button
              onClick={listening ? stopListening : startListening}
              disabled={evalRes !== null || evalBusy}
              className={`w-12 flex-shrink-0 rounded-xl flex items-center justify-center transition disabled:opacity-40 ${listening ? 'bg-rose-600 text-white animate-pulse' : 'bg-[#1f5fbf] text-white hover:bg-[#1557a0]'}`}
              title={listening ? 'توقف ضبط' : 'پاسخت را بگو (میکروفون)'}
            >
              {listening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
          )}
        </div>
        {listening && (
          <p className="text-[11px] text-rose-600 dark:text-rose-300 text-center animate-pulse">🎙 در حال شنیدن…</p>
        )}
        {evalRes === null && !evalBusy && (
          <div className="flex gap-2">
            <button onClick={() => void evalAnswer()} disabled={!typed.trim()} className="flex-1 h-12 rounded-xl bg-emerald-600 text-white font-bold text-sm disabled:opacity-40">✅ تصحیح با معلم</button>
            <button onClick={nextTurn} className="px-4 h-12 rounded-xl border border-[#dde1ea] dark:border-[#333b4a] bg-slate-50 dark:bg-slate-800 text-xs font-bold">⏭ رد شدن</button>
          </div>
        )}
        {evalBusy && <div className="text-center text-xs text-[#5d6676] py-2">🤖 معلم در حال تصحیح…</div>}
        {evalRes && (
          <div className="space-y-2">
            <div className={`p-3 md:p-4 rounded-xl text-sm md:text-base font-bold ${evalRes.score >= 70 ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800' : evalRes.score >= 50 ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-800' : 'bg-rose-50 dark:bg-rose-950/30 text-rose-800'}`}>
              نمره: {toFa(evalRes.score)}/۱۰۰
            </div>
            {evalRes.feedbackFa && <div className="text-xs leading-6 text-[#5d6676] dark:text-[#a3adbd] bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg">{evalRes.feedbackFa}</div>}
            {evalRes.correctedDe && (
              <div dir="ltr" className="text-sm leading-7 font-sans bg-emerald-50 dark:bg-emerald-950/30 p-2 rounded-lg">
                <b className="text-emerald-700 dark:text-emerald-300">✓ پاسخ نمونه:</b> {evalRes.correctedDe}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setChatOpen(true)} className="px-4 h-11 rounded-xl border border-[#dde1ea] dark:border-[#333b4a] bg-slate-50 dark:bg-slate-800 text-xs font-bold">💬 چت با معلم</button>
              <button onClick={nextTurn} className="flex-1 h-11 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white font-bold text-sm">{curBTurnIdx + 1 >= bTurnIndices.length && items.indexOf(curItem) + 1 >= items.length ? 'پایان' : 'نوبت بعد ←'}</button>
            </div>
          </div>
        )}
      </div>

      {/* چت با معلم */}
      {chatOpen && (
        <div className="fixed inset-0 z-[1000] bg-black/50 flex items-center justify-center p-3" onClick={e => { if (e.target === e.currentTarget) setChatOpen(false); }}>
          <div className="bg-white dark:bg-[#1b2029] rounded-2xl border border-[#dde1ea] dark:border-[#333b4a] w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-3 border-b border-[#dde1ea] dark:border-[#333b4a]">
              <b className="text-sm">💬 گفتگو با معلم</b>
              <button onClick={() => setChatOpen(false)} className="text-red-500"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
              {chatMsgs.length === 0 && <p className="text-xs text-[#5d6676]">پرسشت دربارهٔ این نوبت دیالوگ را بنویس.</p>}
              {chatMsgs.map((m, i) => <div key={i} className={`p-2 rounded-xl text-xs leading-6 ${m.role === 'user' ? 'bg-[#1f5fbf] text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>{m.text}</div>)}
              {chatBusy && <div className="text-xs text-[#5d6676]">🤖 در حال پاسخ…</div>}
            </div>
            <div className="p-3 border-t border-[#dde1ea] dark:border-[#333b4a] flex gap-2">
              <input dir="rtl" value={chatDraft} onChange={e => setChatDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void sendChat(); }} placeholder="پرسش…" className="flex-1 bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 text-sm outline-none" />
              <button onClick={() => void sendChat()} disabled={chatBusy || !chatDraft.trim()} className="px-4 rounded-xl bg-[#1f5fbf] text-white text-sm font-bold disabled:opacity-40">ارسال</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
