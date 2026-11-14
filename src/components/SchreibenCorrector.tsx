/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { generateWithGemini, parseAI } from '../utils/ai';
import { ShadowingModal } from './ShadowingModal';

interface SchreibenReport {
  understood_fa: string;
  score: number;
  corrected_de: string;
  issues: { type: string; wrong: string; correct: string; why_fa: string }[];
  tip_fa: string;
}

const SCHREIBEN_TOPICS = [
  { id: 'work', title: 'ایمیل کاری (حسابداری / اداری)', level: 'B1/B2', desc: 'نگارش مکاتبات مالی، گزارش کار، هماهنگی با همکاران یا مدیریت' },
  { id: 'bewerbung', title: 'درخواست کار (Bewerbung)', level: 'B1/B2', desc: 'ارسال رزومه، درخواست مصاحبه شغلی یا کارآموزی' },
  { id: 'haus', title: 'ایمیل به صاحب‌خانه یا Hausverwaltung', level: 'A2/B1', desc: 'گزارش خرابی، اعتراض به شارژ ساختمان یا هماهنگی تخلیه' },
  { id: 'insurance', title: 'نامه به بیمه یا اداره', level: 'B1', desc: 'پیگیری خسارت، درخواست خدمات یا ارسال مدارک رسمی' },
  { id: 'doctor', title: 'ایمیل به پزشک / وقت گرفتن', level: 'A2/B1', desc: 'دریافت نوبت معاینه، پرسش درباره نسخه یا گواهی استعلاجی' },
  { id: 'opinion', title: 'نظر و استدلال (Meinung)', level: 'B1/B2', desc: 'نوشتن دیدگاه درباره یک موضوع اجتماعی یا کاری با استدلال' },
  { id: 'friend', title: 'پیام غیررسمی به دوست', level: 'A2', desc: 'دعوت به مهمانی، برنامه‌ریزی آخر هفته یا احوالپرسی' },
  { id: 'report', title: 'گزارش از یک تجربه', level: 'B1', desc: 'تعریف یک اتفاق، سفر، دوره آموزشی یا خرید' }
];

const ISSUE_BADGE: Record<string, string> = {
  'گرامر': 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
  'املا': 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  'حرف اضافه و حالت دستوری': 'bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300',
  'واژه‌گزینی': 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300',
  'حروف ربط و ترتیب جمله': 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300',
  'آرتیکل و صرف صفت': 'bg-pink-100 text-pink-800 dark:bg-pink-950/60 dark:text-pink-300',
  'معنا و منطق جمله': 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
};

export const SchreibenCorrector: React.FC<{ onShowToast: (m: string, e?: boolean) => void }> = ({ onShowToast }) => {
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [targetLevel, setTargetLevel] = useState<string>('B1');
  const [promptData, setPromptData] = useState<{ taskDe: string; taskFa: string; points: string[] } | null>(null);
  const [generatingPrompt, setGeneratingPrompt] = useState(false);

  const [text, setText] = useState('');
  const [report, setReport] = useState<SchreibenReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [shadowOpen, setShadowOpen] = useState(false);
  const [chat, setChat] = useState<{ q: string; a: string; err?: boolean }[]>([]);
  const [chatQ, setChatQ] = useState('');
  const [chatBusy, setChatBusy] = useState(false);

  const fetchTaskPrompt = async (topicId: string) => {
    const topObj = SCHREIBEN_TOPICS.find(t => t.id === topicId);
    if (!topObj) return;
    setGeneratingPrompt(true);
    setPromptData(null);
    try {
      const p = `You are a strict German exam designer (like ÖSD/Goethe for levels B1/B2). Create an exact exam Aufgabe card for: "${topObj.title} (${topObj.desc})" at level ${targetLevel}.
The output must strictly mirror official exam formats (like Blog-Eintrag Stellungnahme or Formelles E-Mail with specific word counts, points to cover, and grammar requirements).

Return ONLY valid JSON with no markdown formatting:
{
  "taskDe": "The exact exam instruction in German, including a realistic quote/blog excerpt or scenario (e.g. 'In einem Blog zum Thema... finden Sie folgende Meinung:' or formal email context), required word count (e.g. 100-120 Wörter or 40-50 Wörter), and clear instructions on what points to explain and which grammar structures (Nebensätze, Konnektoren) to use.",
  "taskFa": "ترجمه و راهنمای فارسی سناریو و خواسته آزمون",
  "points": ["نکته یا پوینت اول که باید در متن نوشته شود", "نکته دوم", "نکته سوم (گرامر یا ساختار دستوری خاص)"]
}`;
      const out = await generateWithGemini(p, { json: true, timeoutMs: 25000, retries: 1 });
      const r: any = parseAI(out)[0] || {};
      setPromptData({
        taskDe: r.taskDe || `Schreiben Sie einen Text zum Thema ${topObj.title}.`,
        taskFa: r.taskFa || topObj.desc,
        points: [r.point1, r.point2, r.point3].filter(Boolean)
      });
    } catch {
      onShowToast('دریافت سناریو ناموفق بود.', true);
    } finally {
      setGeneratingPrompt(false);
    }
  };


  const runCheck = async () => {
    const s = text.trim();
    if (!s || busy) return;
    setBusy(true); setErrMsg(''); setReport(null);
    const topicTitle = SCHREIBEN_TOPICS.find(t => t.id === selectedTopic)?.title || 'آزاد';
    const prompt = `You are an expert German exam corrector and teacher. Evaluate this German writing for level ${targetLevel} (Context: ${topicTitle}).\n\nINPUT TEXT:\n"${s}"\n\n${promptData ? `TASK CONTEXT:\n${promptData.taskDe}` : ''}\n\nCHECK:\n1) Meaning & logic: does the text make sense? Are connectors used correctly?\n2) Grammar, verb conjugation, syntax, Hauptsatz/Nebensatz verb position.\n3) Prepositions and required cases.\n4) Articles, gender, adjective endings.\n5) Spelling, capitalization and formal/informal register consistency.\n\nRULES:\n- Correct genuine errors; preserve learner's voice as much as possible.\n- If correct: corrected_de = exact input, score = 100, issues = [].\n- Every "wrong" must be an exact substring of the input text.\n- Issue types must be exactly one of: "گرامر" | "املا" | "حرف اضافه و حالت دستوری" | "واژه‌گزینی" | "حروف ربط و ترتیب جمله" | "آرتیکل و صرف صفت" | "معنا و منطق جمله".\n- Score 0-100 integer.\n- Concise Persian explanations.\n- Return ONLY a valid JSON array with one object, no Markdown:\n[{"understood_fa":"...","score":0,"corrected_de":"...","issues":[{"type":"...","wrong":"...","correct":"...","why_fa":"..."}],"tip_fa":"..."}]`;
    try {
      const out = await generateWithGemini(prompt, { json: true, timeoutMs: 45000, retries: 1 });
      const r: any = parseAI(out)[0] || {};
      if (typeof r.score !== 'number') throw new Error('پاسخ نامعتبر از هوش مصنوعی.');
      setReport({
        understood_fa: String(r.understood_fa || ''),
        score: Math.max(0, Math.min(100, Math.round(Number(r.score)))),
        corrected_de: String(r.corrected_de || ''),
        issues: Array.isArray(r.issues) ? r.issues : [],
        tip_fa: String(r.tip_fa || '')
      });
    } catch (e: any) {
      setErrMsg(e?.message || 'تصحیح نوشتار ناموفق بود.');
      onShowToast(e?.message || 'تصحیح ناموفق بود.', true);
    } finally { setBusy(false); }
  };

  const askChat = async () => {
    const q = chatQ.trim();
    if (!q || chatBusy || !report) return;
    setChatBusy(true);
    setChat(prev => [...prev, { q, a: '…' }]);
    setChatQ('');
    try {
      const out = await generateWithGemini(`You are an expert German teacher. A learner's text was corrected.\nLearner text: "${text.trim()}"\nQuestion (in Persian): "${q}"\nAnswer ONLY a JSON array with one object:\n[{"answer":"پاسخ کوتاه و کاربردی فارسی (۳ تا ۵ خط)."}]`, { json: true, timeoutMs: 30000, retries: 1 });
      let answer = out.trim();
      try {
        const parsed = parseAI(out)[0];
        if (parsed && typeof parsed.answer === 'string') answer = parsed.answer.trim();
      } catch { /* ignore */ }
      setChat(prev => { const next = [...prev]; next[next.length - 1] = { q, a: answer || 'پاسخی دریافت نشد.' }; return next; });
    } catch (e: any) {
      setChat(prev => { const next = [...prev]; next[next.length - 1] = { q, a: e?.message || 'خطا در ارتباط', err: true }; return next; });
    } finally { setChatBusy(false); }
  };

  return (
    <div className="space-y-4 text-right">
      <div className="p-4 rounded-2xl bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">🎯 انتخاب موضوع و سناریوی آزمون Schreiben</span>
          <select
            value={targetLevel}
            onChange={e => setTargetLevel(e.target.value)}
            className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1 text-xs font-bold outline-none"
          >
            <option value="A2">سطح A2</option>
            <option value="B1">سطح B1</option>
            <option value="B2">سطح B2</option>
          </select>
        </div>

        <select
          value={selectedTopic}
          onChange={e => {
            const val = e.target.value;
            setSelectedTopic(val);
            if (val) void fetchTaskPrompt(val);
            else setPromptData(null);
          }}
          className="w-full bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs md:text-sm font-semibold outline-none"
        >
          <option value="">-- نوشتن آزاد (بدون سناریوی آزمون) --</option>
          {SCHREIBEN_TOPICS.map(t => (
            <option key={t.id} value={t.id}>{t.title} ({t.level})</option>
          ))}
        </select>

        {generatingPrompt && (
          <div className="text-xs text-indigo-600 dark:text-indigo-400 font-bold animate-pulse text-center py-2">
            ⏳ در حال بارگذاری سناریو و نکات آزمون...
          </div>
        )}

        {promptData && (
          <div className="p-3.5 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900 space-y-2 text-xs md:text-sm leading-6">
            <div className="font-bold text-indigo-900 dark:text-indigo-200">📋 صورت سوال (Aufgabenstellung):</div>
            <div dir="ltr" className="font-sans font-semibold text-slate-800 dark:text-slate-100 text-left bg-white dark:bg-[#141923] p-2.5 rounded-lg border border-indigo-100 dark:border-indigo-900/50">
              {promptData.taskDe}
            </div>
            <div className="text-slate-700 dark:text-slate-300">{promptData.taskFa}</div>
            {promptData.points.length > 0 && (
              <div className="pt-1">
                <span className="font-bold">نکات کلیدی برای نوشتن:</span>
                <ul className="list-disc list-inside space-y-0.5 mt-1 text-slate-600 dark:text-slate-400">
                  {promptData.points.map((pt, i) => <li key={i}>{pt}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <textarea
        dir="ltr"
        rows={6}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Hier steht dein deutscher Text … (متن آلمانی خود را اینجا بنویسید یا پیست کنید)"
        className="w-full bg-slate-50 dark:bg-[#141923] border-2 border-[#1f5fbf] dark:border-[#7fb0ff] rounded-2xl px-4 py-3 font-sans text-base outline-none leading-relaxed shadow-xs"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => void runCheck()}
          disabled={busy || !text.trim()}
          className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] disabled:opacity-40 text-white px-6 py-3 rounded-xl text-sm font-bold flex items-center gap-2 shadow-md transition"
        >
          {busy ? <><span className="inline-block animate-spin">⏳</span><span>در حال تصحیح موشکافانه…</span></> : <span>🤖 تصحیح جامع و نمره‌دهی آزمون</span>}
        </button>
        {report && (
          <button
            onClick={() => { setReport(null); setText(''); setChat([]); setChatQ(''); }}
            className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-4 py-3 rounded-xl text-sm font-bold transition"
          >
            🔄 نوشتهٔ جدید
          </button>
        )}
      </div>

      {errMsg && (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">{errMsg}</div>
      )}

      {report && (
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <span className={`px-4 py-1.5 rounded-xl text-sm font-extrabold shadow-xs ${
              report.score >= 80 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' :
              report.score >= 50 ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' :
              'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
            }`}>
              نمره تقریبی آزمون: {report.score}/100
            </span>
            {report.issues.length === 0 && <span className="text-emerald-700 dark:text-emerald-300 text-sm font-bold">✅ متن کاملاً درست و استاندارد!</span>}
          </div>

          {report.understood_fa && (
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] text-sm leading-7">
              <b className="text-[#1f5fbf] dark:text-[#7fb0ff]">🧠 برداشت ممتحن از متن شما: </b>{report.understood_fa}
            </div>
          )}

          {report.issues.length > 0 && (
            <div className="space-y-2.5">
              <div className="text-xs font-extrabold text-[#1f5fbf] dark:text-[#7fb0ff]">📝 اشکالات یافت‌شده و اصلاحات:</div>
              {report.issues.map((it, i) => (
                <div key={i} className="p-3.5 rounded-2xl bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] space-y-2 shadow-xs">
                  <span className={`inline-block px-2.5 py-0.5 rounded-lg text-[11px] font-bold ${ISSUE_BADGE[it.type] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>{it.type}</span>
                  {(it.wrong || it.correct) && (
                    <div className="flex flex-wrap items-baseline gap-2 text-sm" dir="ltr">
                      {it.wrong && <span className="font-sans font-bold text-red-600 dark:text-red-400 line-through">{it.wrong}</span>}
                      {it.wrong && it.correct && <span className="text-slate-400">→</span>}
                      {it.correct && <span className="font-sans font-bold text-emerald-700 dark:text-emerald-300">{it.correct}</span>}
                    </div>
                  )}
                  {it.why_fa && <div className="text-xs leading-6 text-[#5d6676] dark:text-[#a3adbd]">{it.why_fa}</div>}
                </div>
              ))}
            </div>
          )}

          {report.tip_fa && (
            <div className="p-3.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 text-sm leading-7">
              <b className="text-indigo-700 dark:text-indigo-300">💡 پیشنهاد برای بهبود نمره: </b>{report.tip_fa}
            </div>
          )}

          {report.corrected_de && (
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 space-y-2">
              <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300">✅ نسخه اصلاح‌شده و استاندارد آزمون:</div>
              <div dir="ltr" className="font-sans font-bold text-base text-slate-900 dark:text-slate-100 leading-relaxed whitespace-pre-wrap">{report.corrected_de}</div>
              <button
                onClick={() => setShadowOpen(true)}
                className="mt-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
              >
                🎙 تمرین تلفظ این متن
              </button>
            </div>
          )}

          {shadowOpen && (
            <ShadowingModal freeText={report.corrected_de} onClose={() => setShadowOpen(false)} />
          )}

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="text-xs font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">💬 سوالی درباره ساختار این نامه یا اصطلاحاتش داری؟ بپرس:</div>
            {chat.map((m, i) => (
              <div key={i} className="space-y-1">
                <div className="flex justify-start"><div className="max-w-[85%] bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-2xl rounded-se-sm px-3.5 py-2 text-sm text-slate-800 dark:text-slate-100">{m.q}</div></div>
                <div className="flex justify-end"><div className={`max-w-[92%] rounded-2xl rounded-ss-sm px-3.5 py-2 text-sm leading-7 whitespace-pre-wrap border ${m.err ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300' : 'bg-white dark:bg-[#141923] border-[#dde1ea] dark:border-[#333b4a] text-slate-800 dark:text-slate-100'}`}>{m.a}</div></div>
              </div>
            ))}
            <div className="flex items-end gap-2">
              <textarea
                dir="rtl" rows={2} value={chatQ}
                onChange={e => setChatQ(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void askChat(); } }}
                placeholder="سوالت را درباره گرامر یا واژگان بنویس…"
                className="flex-1 bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2 text-sm outline-none resize-none"
              />
              <button
                onClick={() => void askChat()}
                disabled={chatBusy || !chatQ.trim()}
                className="bg-[#1f5fbf] hover:bg-[#194ea0] disabled:opacity-40 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition"
              >
                {chatBusy ? '⏳' : '➤ ارسال'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
