/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * B2GrammarHub.tsx — هاب تمرین گرامر B2: Konjunktiv II، Passiv، Trennbare Verben
 *
 * سه تمرین در یک کامپوننت:
 *   ۱) Konjunktiv II — تبدیل Indikativ به Konjunktiv II (hätte/wäre/würde + …)
 *   ۲) Passiv — تبدیل Aktiv به Passiv (werden + Partizip II) و برعکس
 *   ۳) Trennbare Verben — تشخیص پیشوند و جایگاه آن در جملهٔ اصلی/پیرو
 *
 * هر تمرین با AI ساخته می‌شود (نمونهٔ Indikativ + پاسخ Konjunktiv II/Passiv + ترجمهٔ فارسی).
 * الگو از KonnektorTrainer گرفته شده — آرشیو، چت با معلم، چاپ A4.
 */

import React, { useState, useEffect, useRef } from 'react';
import { describeAiError, generateText, hasApiKey } from '../utils/aiProvider';
import { Lvl, LVL_ORDER } from '../data/konnektorenData';
import { ArchivePanel, ArchiveRow, CountChips, LevelChips, MiniChip, PrimaryBtn, PrintPreview, Section, SqBtn, faDate, prFa, prG, toFa, useConfirm } from './trainerUI';
import { Printer, X } from 'lucide-react';
import { pushAiBank, fetchAiBank, aiBankMarkSeen, aiBankSeenIds, mergeAiBank } from '../utils/aiBank';

type HubMode = 'konjunktiv' | 'passiv' | 'trennbar';

interface B2Item {
  id: string;
  prompt: string;   // سؤال آلمانی (Indikativ / Aktiv / جمله با پیشوند جداشدنی)
  answer: string;   // پاسخ درست آلمانی
  fa: string;       // ترجمهٔ فارسی پاسخ
  hint?: string;    // راهنمایی کوتاه فارسی
  rule?: string;    // قاعدهٔ گرامری فارسی
  level: string;
  chats?: { role: 'user' | 'ai'; text: string }[];
}

interface B2Arch { id: string; ts: number; mode: HubMode; level: string; count: number; items: B2Item[] }

const ARCH_KEY = 'wb_b2grammar_arch_v1';
const BANK_KEY = 'b2grammar';
const load = <T,>(k: string, d: T): T => { try { const v = JSON.parse(localStorage.getItem(k) || ''); return v ?? d; } catch { return d; } };
const save = (k: string, v: any) => { try { localStorage.setItem(k, JSON.stringify(v.slice(0, 30))); } catch { /* ignore */ } };

const shuffle = <T,>(a: T[]): T[] => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const norm = (s: string) => (s || '').trim().toLowerCase().replace(/[.,!?;:"„""']+$/g, '').replace(/^[.,!?;:"„""']+/g, '').replace(/\s+/g, ' ');
const matchAns = (a: string, b: string) => norm(a) === norm(b);

const MODE_META: Record<HubMode, { label: string; icon: string; desc: string; archLabel: string }> = {
  konjunktiv: { label: 'Konjunktiv II', icon: '🌟', desc: 'تبدیل Indikativ به Konjunktiv II (hätte/wäre/würde + …) — برای شرطی، آرزو، نصیحت', archLabel: 'Konjunktiv II' },
  passiv: { label: 'Passiv', icon: '🔄', desc: 'تبدیل Aktiv ↔ Passiv (werden + Partizip II) — مهم برای متن‌های رسمی B2', archLabel: 'Passiv' },
  trennbar: { label: 'Trennbare Verben', icon: '✂️', desc: 'تشخیص پیشوند جداشدنی و جایگاه آن در جملهٔ اصلی/پیرو', archLabel: 'Trennbare Verben' }
};

const PROMPTS: Record<HubMode, (level: string, count: number) => string> = {
  konjunktiv: (lvl, n) => `Du bist ein erfahrener Deutschlehrer (Niveau ${lvl}).
Erstelle GENAU ${n} Übungen zum Konjunktiv II (Irrealis).
Regeln:
- Jede Übung wandelt einen Indikativ-Satz in einen Konjunktiv-II-Satz um.
- Verwende die Formen: hätte/wäre/würde + Partizip II oder würde + Infinitiv, sowie könnte/sollte/müsste/dürfte/wüsste.
- Realistische B2-Sätze: Wünsche, Ratschläge, irreale Bedingungen.
- "prompt": der Indikativ-Satz (mit klarem Kontext).
- "answer": der korrekte Konjunktiv-II-Satz.
- "fa": natürliche persische Übersetzung des Konjunktiv-II-Satzes.
- "hint": eine kurze persische Erinnerung (z. B. "hätte + Partizip II").
- "rule": eine kurze persische Erklärung der Konjunktiv-II-Regel für diesen Satz.
Antworte NUR mit einem JSON-Array: [{"prompt":"...","answer":"...","fa":"...","hint":"...","rule":"..."}]`,
  passiv: (lvl, n) => `Du bist ein erfahrener Deutschlehrer (Niveau ${lvl}).
Erstelle GENAU ${n} Übungen zum Passiv (Vorgangspassiv mit werden).
Regeln:
- Etwa die Hälfte: Aktiv → Passiv; die andere Hälfte: Passiv → Aktiv.
- Verschiedene Zeiten: Präsens, Präteritum, Perfekt (Passiv: wird/wurde/ist … worden + Partizip II).
- Realistische B2-Sätze aus Alltag, Nachrichten, Wissenschaft.
- "prompt": der Ursprungssatz.
- "answer": der transformierte Satz (Passiv bzw. Aktiv).
- "fa": persische Übersetzung des Antwort-Satzes.
- "hint": eine kurze persische Erinnerung (z. B. "werden + Partizip II im Präsens").
- "rule": eine kurze persische Erklärung der Passiv-Regel für diesen Satz.
Antworte NUR mit einem JSON-Array: [{"prompt":"...","answer":"...","fa":"...","hint":"...","rule":"..."}]`,
  trennbar: (lvl, n) => `Du bist ein erfahrener Deutschlehrer (Niveau ${lvl}).
Erstelle GENAU ${n} Übungen zu trennbaren Verben (z. B. an|rufen, ab|holen, ein|kaufen, zu|hören, auf|räumen).
Regeln:
- Jeder Satz enthält ein trennbares Verb. Der Lerner muss den Infinitiv mit | markieren und die richtige Position des Präfixes im Satz identifizieren.
- Hauptsatz: Präfix am Ende. Nebensatz: Präfix bleibt am Verb.
- Verschiedene Verben und Themen (Alltag, Beruf, Reise).
- "prompt": ein deutscher Satz mit einem trennbaren Verb (das Verb im Hauptsatz konjugiert, Präfix ans Ende).
- "answer": der Infinitiv des Verbs mit Trennstrich (z. B. "an|rufen").
- "fa": persische Übersetzung des Satzes.
- "hint": eine kurze persische Erinnerung (z. B. "Im Hauptsatz steht das Präfix am Ende").
- "rule": eine kurze persische Erklärung der Regel für trennbare Verben in diesem Satz.
Antworte NUR mit einem JSON-Array: [{"prompt":"...","answer":"...","fa":"...","hint":"...","rule":"..."}]`
};

interface Props {
  mode: HubMode;
  onShowToast: (m: string, e?: boolean) => void;
}

export const B2GrammarHub: React.FC<Props> = ({ mode, onShowToast }) => {
  const [level, setLevel] = useState<Lvl>('B2');
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<B2Item[]>([]);
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState('');
  const [res, setRes] = useState<null | boolean>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [arch, setArch] = useState<B2Arch[]>(() => load(ARCH_KEY, []).filter((x: B2Arch) => x?.id && x.mode === mode));
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const { ask: askDel, dialog: delDialog } = useConfirm();
  const meta = MODE_META[mode];
  const card = 'bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 space-y-3';

  // همگام‌سازی آرشیو با بانک مشترک
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const seen = aiBankSeenIds(BANK_KEY);
        const cloud = await fetchAiBank<B2Arch>(BANK_KEY);
        if (!alive) return;
        aiBankMarkSeen(BANK_KEY, cloud.map(c => c.id));
        setArch(prev => {
          // فیلتر دستهٔ فعلی (mode) — کلید ابری در data ذخیره شده
          const cloudForMode = cloud.filter(c => c?.data?.mode === mode);
          const merged = mergeAiBank(prev, cloudForMode, seen);
          if (merged !== prev && merged.length > prev.length) { save(ARCH_KEY, merged); return merged; }
          return prev;
        });
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, [mode]);

  // وقتی mode عوض می‌شود، آرشیو را فیلتر کن
  useEffect(() => {
    setArch(load(ARCH_KEY, []).filter((x: B2Arch) => x?.id && x.mode === mode));
  }, [mode]);

  const generate = async () => {
    if (!hasApiKey()) { onShowToast('معلم در تنظیمات فعال نیست.', true); return; }
    setBusy(true);
    try {
      const raw = await generateText(PROMPTS[mode](level, count), { json: true, timeoutMs: 90000, retries: 1 });
      let arr: any[] = [];
      try {
        const s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
        const a = s.indexOf('['), b = s.lastIndexOf(']');
        arr = JSON.parse(a >= 0 && b > a ? s.slice(a, b + 1) : s);
      } catch { arr = []; }
      const its: B2Item[] = (Array.isArray(arr) ? arr : [])
        .filter((x: any) => x && typeof x.prompt === 'string' && typeof x.answer === 'string')
        .map((x: any) => ({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          prompt: String(x.prompt).trim(),
          answer: String(x.answer).trim(),
          fa: String(x.fa || '').trim(),
          hint: String(x.hint || '').trim(),
          rule: String(x.rule || '').trim(),
          level
        }))
        .slice(0, count);
      if (!its.length) throw new Error('پاسخ معلم ساختار معتبر نداشت — دوباره تلاش کن.');
      const entry: B2Arch = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ts: Date.now(), mode, level, count: its.length, items: its };
      const next = [entry, ...load(ARCH_KEY, [])].slice(0, 30);
      save(ARCH_KEY, next); setArch(next.filter((x: B2Arch) => x.mode === mode));
      pushAiBank(BANK_KEY, entry.id, entry, { kind: mode, level, count: entry.count });
      setItems(its); setIdx(0); setScore(0); setDone(false); setTyped(''); setRes(null);
      onShowToast(`${its.length} تمرین ساخته شد ✓`);
    } catch (e) {
      onShowToast(describeAiError ? describeAiError(e) : String(e), true);
    } finally { setBusy(false); }
  };

  const runArch = (a: B2Arch) => {
    setItems(a.items || []); setIdx(0); setScore(0); setDone(false); setTyped(''); setRes(null);
  };
  const removeArch = async (a: B2Arch) => {
    if (!await askDel('حذف تمرین', 'این مجموعه از آرشیو حذف شود؟')) return;
    const next = load<B2Arch[]>(ARCH_KEY, []).filter(x => x.id !== a.id);
    save(ARCH_KEY, next); setArch(next.filter((x: B2Arch) => x.mode === mode));
  };

  const cur = items[idx];

  const check = () => {
    if (!cur || res !== null) return;
    const ok = matchAns(typed, cur.answer);
    setRes(ok); if (ok) setScore(s => s + 1);
  };
  const next = () => {
    if (idx + 1 >= items.length) setDone(true);
    else { setIdx(idx + 1); setTyped(''); setRes(null); }
  };
  const restart = () => { setItems([]); setDone(false); setIdx(0); setScore(0); };

  const sendChat = async () => {
    if (chatBusy || !cur) return;
    const q = chatDraft.trim();
    if (!q) return;
    if (!hasApiKey()) { onShowToast('معلم فعال نیست.', true); return; }
    setChatMsgs(m => [...m, { role: 'user', text: q }]);
    setChatDraft(''); setChatBusy(true);
    try {
      const sys = `تو معلم صبور آلمانی برای فارسی‌زبانان هستی. در تمرین «${meta.label}» (سطح ${level}) دانش‌آموز دارد این سؤال را حل می‌کند:
سؤال: ${cur.prompt}
پاسخ درست: ${cur.answer}
قاعده: ${cur.rule || '—'}
پاسخ‌ها: فارسی، کوتاه (۲–۵ جمله)، با مثال آلمانی.`;
      const out = await generateText(`${sys}\n\nپرسش دانش‌آموز: ${q}`, { json: false, timeoutMs: 60000, retries: 1 });
      setChatMsgs(m => [...m, { role: 'ai', text: String(out || '').trim() }]);
    } catch (e: any) {
      setChatMsgs(m => [...m, { role: 'ai', text: 'خطا: ' + (e?.message || 'پاسخ دریافت نشد.') }]);
    } finally { setChatBusy(false); }
  };

  /* ─────────── SETUP / DONE ─────────── */
  if (items.length === 0 || done) {
    return (
      <div className="space-y-3 text-right max-w-2xl mx-auto">
        <div className={card}>
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-base flex items-center gap-2"><span>{meta.icon}</span> {meta.label}</h3>
          </div>
          <p className="text-xs text-[#5d6676] dark:text-[#a3adbd] leading-7">{meta.desc}</p>
          {done && (
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 p-3 text-center">
              <div className="text-3xl">{score / items.length >= 0.8 ? '🏆' : score / items.length >= 0.5 ? '👍' : '💪'}</div>
              <div className="font-extrabold text-sm mt-1">{toFa(score)} / {toFa(items.length)} درست</div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => setPrintOpen(true)} className="flex-1 h-10 rounded-xl bg-[#1f5fbf] text-white text-xs font-bold flex items-center justify-center gap-1"><Printer size={14} /> چاپ با پاسخنامه</button>
                <button onClick={restart} className="flex-1 h-10 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white text-xs font-bold">آزمون دوباره</button>
              </div>
            </div>
          )}
          <Section n="۱" label="سطح"><LevelChips value={level} onChange={l => setLevel(l as Lvl)} levels={LVL_ORDER as unknown as string[]} /></Section>
          <Section n="۲" label="تعداد سؤال"><CountChips value={count} onChange={setCount} counts={[3, 5, 8, 10]} /></Section>
          <PrimaryBtn onClick={() => void generate()} busy={busy} busyLabel="⏳ معلم دارد تمرین می‌سازد…" label="🚀 ساخت تمرین" />
        </div>

        {/* آرشیو */}
        <ArchivePanel title={`🗂 تمرین‌های ذخیره‌شدهٔ ${meta.archLabel}`} count={arch.length}
          emptyText="هر تمرین که با معلم بسازی اینجا ذخیره می‌شود و در بانک مشترک برای همهٔ دستگاه‌ها قابل دسترس است.">
          {arch.map(a => (
            <ArchiveRow key={a.id}
              title={<span dir="ltr" className="font-sans">{meta.label} — Niveau {a.level}</span>}
              chips={<><MiniChip>{toFa(a.count || a.items?.length || 0)} سؤال</MiniChip><MiniChip>{faDate(a.ts)}</MiniChip><MiniChip tone="blue">☁️ بانک مشترک</MiniChip></>}
            >
              <SqBtn onClick={() => runArch(a)} tone="green" title="اجرای این تمرین">▶</SqBtn>
              <SqBtn onClick={() => void removeArch(a)} tone="red" title="حذف از آرشیو">🗑</SqBtn>
            </ArchiveRow>
          ))}
        </ArchivePanel>
        {delDialog}
        {/* پرینت پاسخنامهٔ آزمون انجام‌شده */}
        {printOpen && done && (
          <PrintPreview
            open onClose={() => setPrintOpen(false)}
            title={<span>{meta.label} — Niveau {level}</span>}
            docTitle={`${meta.label} — ${level}`}
            meta={<>{toFa(items.length)} سؤال • نمره: {toFa(score)}</>}
            questions={
              <ol className="space-y-3">
                {items.map((it, i) => (
                  <li key={it.id}>
                    <div style={prG()} className="font-bold font-sans">{i + 1}. {it.prompt}</div>
                    {it.hint && <div style={prFa()} className="text-xs text-slate-500">راهنمایی: {it.hint}</div>}
                  </li>
                ))}
              </ol>
            }
            solutions={
              <ol className="space-y-3">
                {items.map((it, i) => (
                  <li key={it.id}>
                    <div style={prG()} className="font-bold font-sans">{i + 1}. {it.prompt}</div>
                    <div style={prG()} className="text-sm"><b>پاسخ: </b><span className="text-[#1f5fbf]">{it.answer}</span></div>
                    {it.fa && <div style={prFa()} className="text-xs">{it.fa}</div>}
                    {it.rule && <div style={prFa()} className="text-xs text-slate-500">قاعده: {it.rule}</div>}
                  </li>
                ))}
              </ol>
            }
          />
        )}
      </div>
    );
  }

  /* ─────────── RUN ─────────── */
  return (
    <div className="space-y-3 text-right max-w-2xl mx-auto">
      <div className="flex justify-between text-xs font-bold text-[#5d6676] dark:text-[#a3adbd]">
        <span>سؤال {toFa(idx + 1)} از {toFa(items.length)}</span>
        <span>امتیاز: {toFa(score)}</span>
      </div>
      <div className={card}>
        <div className="text-xs font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">{meta.icon} {meta.label}</div>
        {/* prompt */}
        <div dir="ltr" className="font-sans text-base md:text-lg font-bold leading-8 bg-slate-50 dark:bg-[#141923] p-3 rounded-xl border border-[#dde1ea] dark:border-[#333b4a]">
          {cur.prompt}
        </div>
        {cur.hint && <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2 rounded-lg">💡 {cur.hint}</div>}
        {/* پاسخ کاربر */}
        <input dir="ltr" value={typed} onChange={e => setTyped(e.target.value)} disabled={res !== null} onKeyDown={e => { if (e.key === 'Enter') check(); }}
          placeholder="پاسخت را اینجا بنویس…" className="w-full bg-white dark:bg-[#141923] border-2 border-[#1f5fbf] dark:border-[#7fb0ff] rounded-xl px-3 py-2.5 font-sans text-base outline-none" />
        {res === null ? (
          <div className="flex gap-2">
            <button onClick={check} disabled={!typed.trim()} className="flex-1 h-12 rounded-xl bg-emerald-600 text-white font-bold text-sm disabled:opacity-40">✅ بررسی</button>
            <button onClick={next} className="px-4 h-12 rounded-xl border border-[#dde1ea] dark:border-[#333b4a] bg-slate-50 dark:bg-slate-800 text-xs font-bold">⏭ بعدی (بدون بررسی)</button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className={`p-3 md:p-4 rounded-xl text-sm md:text-base font-bold leading-7 ${res ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800' : 'bg-rose-50 dark:bg-rose-950/30 text-rose-800'}`}>
              {res ? '✅ درست!' : '❌ پاسخ درست:'}
              {!res && <div dir="ltr" className="font-sans mt-1">{cur.answer}</div>}
            </div>
            {cur.rule && <div className="text-xs leading-6 text-[#5d6676] dark:text-[#a3adbd] bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg">📋 {cur.rule}</div>}
            {cur.fa && <div className="text-xs text-[#5d6676] dark:text-[#a3adbd]">ترجمه: {cur.fa}</div>}
            <div className="flex gap-2">
              <button onClick={() => setChatOpen(true)} className="px-4 h-11 rounded-xl border border-[#dde1ea] dark:border-[#333b4a] bg-slate-50 dark:bg-slate-800 text-xs font-bold flex items-center gap-1">💬 چت با معلم</button>
              <button onClick={next} className="flex-1 h-11 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white font-bold text-sm">{idx + 1 >= items.length ? 'پایان' : 'بعدی ←'}</button>
            </div>
          </div>
        )}
      </div>

      {/* چت با معلم */}
      {chatOpen && (
        <div className="fixed inset-0 z-[1000] bg-black/50 flex items-center justify-center p-3" onClick={e => { if (e.target === e.currentTarget) setChatOpen(false); }}>
          <div className="bg-white dark:bg-[#1b2029] rounded-2xl border border-[#dde1ea] dark:border-[#333b4a] w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-3 border-b border-[#dde1ea] dark:border-[#333b4a]">
              <b className="text-sm">💬 گفتگو با معلم — {meta.label}</b>
              <button onClick={() => setChatOpen(false)} className="text-red-500"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
              {chatMsgs.length === 0 && <p className="text-xs text-[#5d6676]">پرسشت را بنویس — مثلاً «چرا این‌جا würde استفاده شد؟»</p>}
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
