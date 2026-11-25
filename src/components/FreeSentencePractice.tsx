/**
 * FreeSentencePractice.tsx — «تولید جملهٔ آزاد» (از ExercisesView جدا شد)
 *
 * هر جملهٔ آلمانی که کاربر بنویسد، تصحیح کامل می‌شود (گرامر، حروف ربط، حرف اضافه و حالت،
 * آرتیکل و صرف صفت، معنا و منطق) با نمره و چت با معلم.
 * از تمرین «جای‌خالی فعل + حرف اضافه (AI)» هم با آیکن ✒️ باز می‌شود؛ با بستن آن،
 * کاربر دقیقاً به همان جای تمرین برمی‌گردد (درخواست کاربر).
 */

import React, { useState } from 'react';
import { Word } from '../types';
import { ShadowingModal } from './ShadowingModal';
import { toFa } from './trainerUI';
import { ClickableWords, WordLookupModal } from './WordLookup';
import { generateWithGemini, parseAI } from '../utils/ai';

const germanTokens = (t: string): string[] => t.split(/[^\p{L}]+/u).filter(Boolean);

export const FREE_SENT_WORD: Word = {
  id: 'freesent-self', de: '', art: '', fa: '', syn: '', synFa: '', ant: '', antFa: '',
  pl: '', pos: '', lvl: 'A2', ex: '', exFa: '', ex2: '', ex2Fa: '', conj: '', prat: '',
  perf: '', sep: '', cat: 'گرامر', cloze: '', ans: '', acc: [], tags: '', img: '',
  notes: '', added: 0, last: 0, due: 0, ivl: 0, ease: 2.5, stage: 0, ok: 0, bad: 0, res: ''
};

interface FreeGood { text: string; why_fa: string }

/** نتیجهٔ تصحیح — بر اساس جریان خواستهٔ کاربر:
 *  ۱) ترجمهٔ جملهٔ خود کاربر  ۲) برداشت یک آلمانی‌زبان  ۳) سبز: چیزهایی که درست نوشته
 *  ۴) قرمز: ایرادها یکی‌یکی با ضربدر  + شکل درست نهایی */
interface FreeReport {
  user_fa: string;
  understood_fa: string;
  score: number;
  corrected_de: string;
  good: FreeGood[];
  issues: { type: string; wrong: string; correct: string; why_fa: string }[];
  tip_fa: string;
}

const FREE_ISSUE_BADGE: Record<string, string> = {
  'گرامر': 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
  'املا': 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  'حرف اضافه و حالت دستوری': 'bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300',
  'واژه‌گزینی': 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300',
  'حروف ربط و ترتیب جمله': 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300',
  'آرتیکل و صرف صفت': 'bg-pink-100 text-pink-800 dark:bg-pink-950/60 dark:text-pink-300',
  'معنا و منطق جمله': 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
};

export const FreeSentencePractice: React.FC<{
  onShowToast: (m: string, e?: boolean) => void;
  onQuickAddWord?: (w: Partial<Word>) => boolean;
  /** کل کتابخانه — گیتِ تکراری/Partizip II/مترادف */
  words?: Word[];
  onViewWord?: (w: Word) => void;
}> = ({ onShowToast, onQuickAddWord, words, onViewWord }) => {
  const [text, setText] = useState('');
  const [report, setReport] = useState<FreeReport | null>(null);
  const [lookup, setLookup] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [chat, setChat] = useState<{ q: string; a: string; err?: boolean }[]>([]);
  const [shadowOpen, setShadowOpen] = useState(false);
  const [chatQ, setChatQ] = useState('');
  const [chatBusy, setChatBusy] = useState(false);

  const runCheck = async () => {
    const s = text.trim();
    if (!s || busy) return;
    setBusy(true); setErrMsg(''); setReport(null);
    const prompt = `You are an expert German teacher who checks BOTH grammar AND meaning/logic ("deutsches Denken") for Persian-speaking learners. Evaluate the sentence.\n\nINPUT: "${s}"\n\nCHECK:\n1) Meaning & logic FIRST: does the sentence make sense? Is the connector logically correct for the intended meaning? obwohl = concession AGAINST the expectation, trotzdem = nevertheless, weil = reason. If the logic contradicts the connector (e.g. "wenig Geld, obwohl große Reise" — the money is a REASON against the trip), that is a serious error: fix the connector or the logic and explain.\n2) Grammar and verb conjugation.\n3) Connectors and clause order (Hauptsatz/Nebensatz, verb position).\n4) Prepositions and required cases.\n5) Articles, gender, adjective endings.\n6) Word order.\n7) Spelling and capitalization.\n8) Naturalness and register.\n\nRULES:\n- Correct genuine errors only; preserve meaning as much as possible.\n- If correct and natural: corrected_de = the exact input, score = 100, issues = [].\n- Every "wrong" must be an exact substring of the input. Never invent or paraphrase.\n- Report each distinct error once. Issue types exactly one of: "گرامر" | "املا" | "حرف اضافه و حالت دستوری" | "واژه‌گزینی" | "حروف ربط و ترتیب جمله" | "آرتیکل و صرف صفت" | "معنا و منطق جمله".\n- FAIR feedback: if something is correct (e.g. verb position after the comma, correct connector choice, correct conjugation), it belongs in "good" — NEVER list correct word order as an error. Each error card must be about ONE real mistake.\n- "user_fa": translate the LEARNER'S OWN sentence exactly as written into Persian — not the corrected sentence.\n- "understood_fa": what a German native speaker would actually understand/feel when reading the learner's sentence (1–2 short Persian sentences).\n- "good": ALWAYS list 1–3 things the learner did CORRECTLY (e.g. "gehe ich nach dem Komma — جایگاه فعل درست", connector choice, tense, vocabulary) — "text" short (German snippet or short label), "why_fa" short Persian reason. Find at least one, even in weak sentences.\n- Score 0-100 (integer): meaning/logic errors cost the most.\n- Explanations and the tip: concise Persian, no repetition.\n- A greeting, a single word or a fragment without a verb is NOT a sentence: score ≤ 20, add an issue of type "معنا و منطق جمله", and understood_fa must say there is no real message.\n- Return ONLY a valid JSON array with exactly one object, no Markdown, no extra text:\n[{"user_fa":"...","understood_fa":"...","score":0,"corrected_de":"...","good":[{"text":"...","why_fa":"..."}],"issues":[{"type":"...","wrong":"...","correct":"...","why_fa":"..."}],"tip_fa":"..."}]`;
    try {
      const out = await generateWithGemini(prompt, { timeoutMs: 45000, retries: 1 });
      const r: any = parseAI(out)[0] || {};
      if (typeof r.score !== 'number') throw new Error('پاسخ نامعتبر از معلم دریافت شد.');
      setReport({
        user_fa: String(r.user_fa || ''),
        understood_fa: String(r.understood_fa || ''),
        score: Math.min(Math.max(0, Math.min(100, Math.round(Number(r.score)))), germanTokens(s).length < 3 ? 20 : 100),
        corrected_de: String(r.corrected_de || ''),
        good: Array.isArray(r.good)
          ? (r.good as any[]).map((g) => ({ text: String(g?.text ?? '').trim(), why_fa: String(g?.why_fa ?? '').trim() })).filter((g) => g.text || g.why_fa)
          : [],
        issues: Array.isArray(r.issues) ? r.issues : [],
        tip_fa: String(r.tip_fa || '')
      });
    } catch (e: any) {
      setErrMsg(e?.message || 'تصحیح با معلم ناموفق بود.');
      onShowToast(e?.message || 'تصحیح ناموفق بود.', true);
    } finally { setBusy(false); }
  };

  const askChat = async () => {
    const q = chatQ.trim();
    if (!q || chatBusy || !report) return;
    setChatBusy(true);
    const ctx = `Sentence: "${text.trim()}" | Score: ${report.score}/100 | Corrected: "${report.corrected_de}" | Issues: ${report.issues.map(i => `${i.type}: "${i.wrong}" -> "${i.correct}"`).join('; ') || 'none'}`;
    setChat(prev => [...prev, { q, a: '…' }]);
    setChatQ('');
    try {
      const out = await generateWithGemini(`You are an expert German teacher. A learner's sentence was just proofread.\n${ctx}\nThe learner asks (in Persian): "${q}"If the question concerns meaning, logic or connector choice (e.g. obwohl vs trotzdem), explain the German thinking with mini examples.\nAnswer ONLY a JSON array with one object — nothing outside it:\n[{"answer":"پاسخ کوتاه فارسی (۳ تا ۶ خط). واژه‌ها و مثال‌های آلمانی به آلمانی بمانند."}]`, { timeoutMs: 30000, retries: 1 });
      let answer = out.trim();
      try {
        const parsed = parseAI(out)[0];
        if (parsed && typeof parsed.answer === 'string' && parsed.answer.trim()) answer = parsed.answer.trim();
      } catch { /* ignore */ }
      setChat(prev => { const next = [...prev]; next[next.length - 1] = { q, a: answer || 'پاسخی دریافت نشد.' }; return next; });
    } catch (e: any) {
      setChat(prev => { const next = [...prev]; next[next.length - 1] = { q, a: e?.friendly || e?.message || 'پاسخی دریافت نشد.', err: true }; return next; });
    } finally { setChatBusy(false); }
  };

  return (
    <div className="space-y-3 text-right">
      <p className="text-sm font-semibold text-[#5d6676] dark:text-[#a3adbd] text-center">
        هر جملهٔ آلمانی که می‌خواهی بنویس — گرامر، حروف ربط، حرف اضافه و حالت، آرتیکل و صرف صفت بررسی می‌شود:
      </p>
      <textarea
        dir="ltr" rows={4} value={text} onChange={e => setText(e.target.value)}
        placeholder="Schreiben Sie einen beliebigen deutschen Satz …"
        className="w-full bg-slate-50 dark:bg-[#141923] border-2 border-[#1f5fbf] dark:border-[#7fb0ff] rounded-xl px-3.5 py-2.5 font-sans text-base outline-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => void runCheck()}
          disabled={busy || !text.trim()}
          className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] disabled:opacity-40 text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-1.5"
        >
          {busy ? <><span className="inline-block animate-spin">⏳</span><span>در حال تصحیح…</span></> : <span>🎓 تصحیح و نمره‌دهی</span>}
        </button>
        {report && (
          <button onClick={() => { setReport(null); setText(''); setChat([]); setChatQ(''); }} className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-4 py-2.5 rounded-xl text-sm font-bold">
            🔄 جملهٔ جدید
          </button>
        )}
      </div>

      {errMsg && (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">{errMsg}</div>
      )}

      {report && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className={`px-3.5 py-1 rounded-xl text-sm font-extrabold ${report.score >= 80 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' : report.score >= 50 ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' : 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'}`}>
              نمره: {report.score}/100
            </span>
            {report.issues.length === 0 && report.score >= 80 && <span className="text-emerald-700 dark:text-emerald-300 text-sm font-bold">✅ جمله بدون خطا!</span>}
          </div>
          <div className="text-sm font-extrabold text-[#1f5fbf] dark:text-[#7fb0ff]">📝 تصحیح و نکات</div>
          {/* ۱) ترجمهٔ جملهٔ خود کاربر (درخواست کاربر: ترجمهٔ نمونهٔ AI نه، جملهٔ من) */}
          {report.user_fa && (
            <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900 text-sm leading-7">
              <b className="text-sky-700 dark:text-sky-300">🇮🇷 ترجمهٔ جملهٔ تو: </b>{report.user_fa}
            </div>
          )}
          {/* ۲) برداشت یک آلمانی‌زبان از این جمله */}
          {report.understood_fa && (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] text-sm leading-7">
              <b className="text-[#1f5fbf] dark:text-[#7fb0ff]">🧠 برداشت آلمانی‌زبان: </b>{report.understood_fa}
            </div>
          )}
          {/* ۳) باکس سبز: چیزهایی که درست نوشتی (همیشه حداقل یکی) */}
          {report.good.length > 0 && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 space-y-1.5">
              <div className="text-sm font-bold text-emerald-800 dark:text-emerald-200">✅ چیزهایی که درست نوشتی</div>
              {report.good.map((g, i) => (
                <div key={i} className="text-xs leading-6 text-emerald-900 dark:text-emerald-100">
                  <b>✓</b>{' '}{g.text && <b dir="ltr" className="font-sans"><ClickableWords text={g.text} onWord={setLookup} /></b>}{g.text && g.why_fa ? ' — ' : ''}{g.why_fa}
                </div>
              ))}
            </div>
          )}
          {/* ۴) باکس قرمز: ایرادها یکی‌یکی با ضربدر */}
          {report.issues.length > 0 && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 space-y-2.5">
              <div className="text-sm font-bold text-red-800 dark:text-red-200">❌ ایرادها ({toFa(report.issues.length)})</div>
              {report.issues.map((it, i) => (
                <div key={i} className="rounded-xl bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] p-2.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <b className="text-red-600 dark:text-red-300 text-sm">✗</b>
                    <span className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-bold ${FREE_ISSUE_BADGE[it.type] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>{it.type}</span>
                  </div>
                  {(it.wrong || it.correct) && (
                    <div className="flex flex-wrap items-baseline gap-2 text-base" dir="ltr">
                      {it.wrong && <span className="font-sans font-bold text-red-600 dark:text-red-400 line-through"><ClickableWords text={it.wrong} onWord={setLookup} /></span>}
                      {it.wrong && it.correct && <span className="text-slate-400">→</span>}
                      {it.correct && <span className="font-sans font-bold text-emerald-700 dark:text-emerald-300"><ClickableWords text={it.correct} onWord={setLookup} /></span>}
                    </div>
                  )}
                  {it.why_fa && <div className="text-xs leading-6 text-[#5d6676] dark:text-[#a3adbd]">{it.why_fa}</div>}
                </div>
              ))}
            </div>
          )}

          <div className="text-sm font-extrabold text-[#1f5fbf] dark:text-[#7fb0ff]">🧾 جمع بندی</div>
          {report.tip_fa && (
            <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 text-sm leading-7">
              <b className="text-indigo-700 dark:text-indigo-300">💡 نکته: </b>{report.tip_fa}
            </div>
          )}

          {report.corrected_de && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
              <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300 mb-1">✅ شکل درست و طبیعی:</div>
              <div dir="ltr" className="font-sans font-bold text-base text-slate-900 dark:text-slate-100"><ClickableWords text={report.corrected_de} onWord={setLookup} /></div>
              <button
                onClick={() => setShadowOpen(true)}
                className="mt-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition flex items-center gap-1.5"
              >
                🎙 تمرین تلفظ این جمله
              </button>
            </div>
          )}
          {shadowOpen && (
            <ShadowingModal freeText={report.corrected_de} word={FREE_SENT_WORD} onClose={() => setShadowOpen(false)} />
          )}

          <div className="pt-1 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <div className="text-sm font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">💬 سوالی دربارهٔ این جمله یا تصحیحش داری؟ بپرس:</div>
            {chat.map((m, i) => (
              <div key={i} className="space-y-1">
                <div className="flex justify-start">
                  <div className="max-w-[85%] bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-2xl rounded-se-sm px-3.5 py-2 text-sm text-slate-800 dark:text-slate-100">{m.q}</div>
                </div>
                <div className="flex justify-end">
                  <div className={`max-w-[92%] rounded-2xl rounded-ss-sm px-3.5 py-2 text-sm leading-7 whitespace-pre-wrap border ${m.err ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300' : 'bg-white dark:bg-[#141923] border-[#dde1ea] dark:border-[#333b4a] text-slate-800 dark:text-slate-100'}`}>{m.a}</div>
                </div>
              </div>
            ))}
            <div className="flex items-end gap-2">
              <textarea
                dir="rtl" rows={2} value={chatQ}
                onChange={e => setChatQ(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && window.innerWidth >= 768) { e.preventDefault(); void askChat(); } }}
                placeholder="سوالت را اینجا بنویس…"
                className="flex-1 bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-sm outline-none resize-none"
              />
              <button
                onClick={() => void askChat()}
                disabled={chatBusy || !chatQ.trim()}
                className="bg-[#1f5fbf] hover:bg-[#194ea0] disabled:opacity-40 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition"
              >
                {chatBusy ? '⏳' : '➤ ارسال'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* پاپ‌آپ واژهٔ لمس‌شده — جملهٔ تصحیح‌شده، ایرادها و پاسخ معلم */}
      {lookup && (
        <WordLookupModal
          word={lookup}
          level={FREE_SENT_WORD.lvl || 'A2'}
          cat="جملهٔ آزاد"
          onQuickAddWord={onQuickAddWord}
          words={words}
          onViewWord={onViewWord}
          onClose={() => setLookup(null)}
        />
      )}
    </div>
  );
};
