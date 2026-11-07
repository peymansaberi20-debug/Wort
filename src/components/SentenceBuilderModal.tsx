import React, { useEffect, useState } from 'react';
import { Word } from '../types';
import { generateWithGemini, parseAI } from '../utils/ai';
import { IconBtn } from './IconBtn';

interface SentenceBuilderModalProps {
  word: Word | null;
  onClose: () => void;
  onShowToast?: (msg: string, isErr?: boolean) => void;
}

interface SentenceIssue {
  type: string;
  wrong: string;
  correct: string;
  why_fa: string;
}

interface SentenceReport {
  understood_fa: string;
  score: number;
  corrected_de: string;
  issues: SentenceIssue[];
  preposition_case_fa: string;
  spelling_fa: string;
  tip_fa: string;
}

const FENCE = '```';

const ISSUE_BADGE: Record<string, string> = {
  'گرامر': 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
  'املا': 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  'حرف اضافه و حالت دستوری': 'bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300',
  'واژه‌گزینی': 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300',
  'ساختار و ترتیب': 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300'
};

export const SentenceBuilderModal: React.FC<SentenceBuilderModalProps> = ({ word, onClose, onShowToast }) => {
  const [text, setText] = useState('');
  const [showFa, setShowFa] = useState(false);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<SentenceReport | null>(null);
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    setText(''); setShowFa(false); setReport(null); setErrMsg(''); setLoading(false);
  }, [word?.id]);

  if (!word) return null;

  const runCheck = async () => {
    const sentence = text.trim();
    if (!sentence || loading) return;
    setLoading(true); setErrMsg(''); setReport(null);
    const prompt = `You are an expert German teacher and proofreader for Persian-speaking learners. Strictly but fairly evaluate the learner's sentence and explain errors concisely in Persian.

INPUT
Target word: "${word.de}"
Article: "${word.art || '—'}"
Persian meaning: "${word.fa || '—'}"
Learner's sentence: "${sentence}"

TASK
Check grammar, verb conjugation, spelling, capitalization, punctuation, prepositions and required cases (Akkusativ/Dativ/Genitiv), word order, verb position, vocabulary, meaning, naturalness, and correct use of the target word.

RULES
- Correct only genuine errors. Preserve the original meaning and change as little as possible.
- Distinguish actual errors from grammatically correct but less natural expressions. Accept valid alternatives and standard variants.
- Never invent errors or rewrite solely for stylistic preference.
- The target word or a natural inflected form must be used in the corrected sentence when possible. If missing or misused, report it explicitly as an issue.
- Every non-empty "wrong" value must be an exact substring of the original sentence. If the target word is missing, use "" for that issue's "wrong".
- Use only these issue types: "گرامر", "املا", "حرف اضافه و حالت دستوری", "واژه‌گزینی", "ساختار و ترتیب".
- Each issue must explain one genuine error in one short Persian sentence. Avoid duplicate issues.
- "understood_fa": translate what a native speaker would actually understand from the ORIGINAL sentence. If unclear, explain its actual meaning or ambiguity in Persian.
- "corrected_de": give the minimally corrected, natural German sentence. If already correct, preserve it exactly.
- "preposition_case_fa": briefly assess relevant prepositions and cases; use "" if none are involved.
- "spelling_fa": briefly explain genuine spelling or orthography issues; use "" if none.
- "tip_fa": give one useful, non-repetitive Persian learning tip; otherwise use "".

SCORING (0-100 integer)
Guideline weights: grammar and conjugation 30%, word order and structure 25%, vocabulary/meaning/target-word use 20%, spelling and orthography 15%, prepositions and cases 10%. Assess only applicable categories and redistribute their weights proportionally. Penalize errors according to severity and impact on meaning; minor spelling errors cost less than serious grammatical errors. Avoid double penalties. A fully correct and appropriate sentence scores 100. Apply scores consistently.

OUTPUT
Return the JSON inside exactly one Markdown code block labelled json, and nothing else outside it. The array must contain exactly one object with exactly these seven fields in this order:

 ${FENCE}json
[{"understood_fa":"...","score":0,"corrected_de":"...","issues":[{"type":"...","wrong":"...","correct":"...","why_fa":"..."}],"preposition_case_fa":"...","spelling_fa":"...","tip_fa":"..."}]
 ${FENCE}

JSON REQUIREMENTS
- Exactly one object, all seven fields.
- "score" must be an integer; "issues" must be an array (use [] if there are no errors).
- Each issue object must contain exactly four fields: "type", "wrong", "correct", "why_fa".
- Valid JSON with double quotes, properly escaped characters, no trailing commas.
- Explanations in Persian; issue-type labels exactly as listed above.
- Corrections must match the reported issues; every "wrong" fragment must match the original sentence exactly.
- If the sentence is correct: issues = [], corrected_de = the exact original sentence, score = 100.
- Validate the JSON internally before responding. No commentary outside the code block.`;
    try {
      const out = await generateWithGemini(prompt, { timeoutMs: 45000, retries: 1 });
      const parsed = parseAI(out)[0] as SentenceReport;
      if (!parsed || typeof parsed.score !== 'number') throw new Error('پاسخ نامعتبر از هوش مصنوعی دریافت شد.');
      setReport({
        understood_fa: String(parsed.understood_fa || ''),
        score: Math.max(0, Math.min(100, Math.round(Number(parsed.score)))),
        corrected_de: String(parsed.corrected_de || ''),
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        preposition_case_fa: String(parsed.preposition_case_fa || ''),
        spelling_fa: String(parsed.spelling_fa || ''),
        tip_fa: String(parsed.tip_fa || '')
      });
    } catch (e: any) {
      setErrMsg(e?.message || 'تصحیح با هوش مصنوعی ممکن نشد؛ دوباره تلاش کن.');
    } finally {
      setLoading(false);
    }
  };

  const scoreBadge = (s: number): string =>
    s >= 80
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
      : s >= 50
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
        : 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300';

  return (
    <div
      className="fixed inset-0 z-[95] bg-black/60 backdrop-blur-xs flex items-start sm:items-center justify-center p-3 md:p-6 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col" dir="rtl">
        {/* Header — standardized icon strip, close leftmost */}
        <div dir="ltr" className="sticky top-0 z-10 bg-white/95 dark:bg-[#1b2029]/95 backdrop-blur-md px-4 py-3 border-b border-[#dde1ea] dark:border-[#333b4a] flex items-center justify-start gap-2">
          <IconBtn onClick={onClose} title="بستن و برگشت به تمرین">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="w-4 h-4" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </IconBtn>
          <h3 className="flex-1 text-right font-bold text-base md:text-lg text-slate-900 dark:text-slate-100">✍️ ساخت جمله با این واژه</h3>
        </div>

        <div className="p-4 md:p-5 space-y-4">
          <div className="bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 text-center">
            <div dir="ltr" className="text-2xl md:text-3xl font-extrabold font-sans text-slate-900 dark:text-slate-100">
              {word.art ? `${word.art} ` : ''}{word.de}
            </div>
            <div className="mt-2">
              {showFa && word.fa ? (
                <p className="text-base font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">{word.fa}</p>
              ) : null}
              <button
                type="button"
                onClick={() => setShowFa(v => !v)}
                className="mt-1 text-xs font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 transition"
              >
                {showFa ? '🙈 مخفی کردن معنی' : '👁 نمایش معنی'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-extrabold text-[#1f5fbf] dark:text-[#7fb0ff] mb-1.5">
              جملهٔ خودت را بنویس (کوتاه، روزمره):
            </label>
            <textarea
              dir="ltr"
              rows={4}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Deinen Satz hier schreiben …"
              className="w-full bg-white dark:bg-[#141923] border-2 border-[#1f5fbf] dark:border-[#7fb0ff] rounded-xl px-3.5 py-2.5 font-sans text-base outline-none"
            />
            <div className="flex flex-wrap items-center gap-2 mt-2.5">
              <button
                type="button"
                onClick={() => void runCheck()}
                disabled={loading || !text.trim()}
                className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-4 py-2 rounded-xl text-xs md:text-sm font-bold shadow-xs hover:opacity-95 disabled:opacity-40 transition flex items-center gap-1.5"
              >
                {loading ? (
                  <><span className="inline-block animate-spin">⏳</span><span>در حال تصحیح…</span></>
                ) : (
                  <span>🤖 تصحیح با هوش مصنوعی</span>
                )}
              </button>
              {report && (
                <button
                  type="button"
                  onClick={() => setReport(null)}
                  className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-3 py-2 rounded-xl text-xs font-bold transition"
                >
                  🔄 تلاش دوباره
                </button>
              )}
            </div>
          </div>

          {errMsg && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
              {errMsg}
            </div>
          )}

          {report && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className={`px-3 py-1 rounded-xl text-sm font-extrabold ${scoreBadge(report.score)}`}>
                  نمره: {report.score}/100
                </span>
                {report.issues.length === 0 && (
                  <span className="text-emerald-700 dark:text-emerald-300 text-sm font-bold">✅ جمله بدون خطا!</span>
                )}
              </div>

              {report.understood_fa && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] text-sm leading-7">
                  <b className="text-[#1f5fbf] dark:text-[#7fb0ff]">🧠 برداشت آلمانی‌زبان از جملهٔ تو: </b>
                  {report.understood_fa}
                </div>
              )}

              {report.issues.length > 0 && (
                <div className="space-y-2">
                  {report.issues.map((it, i) => (
                    <div key={i} className="p-3 rounded-xl bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] space-y-1.5">
                      <span className={`inline-block px-2 py-0.5 rounded-lg text-[11px] font-bold ${ISSUE_BADGE[it.type] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>
                        {it.type}
                      </span>
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

              {report.preposition_case_fa && (
                <div className="p-3 rounded-xl bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-900 text-sm leading-7">
                  <b className="text-violet-700 dark:text-violet-300">🧩 حرف اضافه و حالت دستوری: </b>
                  {report.preposition_case_fa}
                </div>
              )}

              {report.spelling_fa && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-sm leading-7">
                  <b className="text-amber-700 dark:text-amber-300">🔤 املا (Rechtschreibung): </b>
                  {report.spelling_fa}
                </div>
              )}

              {report.tip_fa && (
                <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 text-sm leading-7">
                  <b className="text-indigo-700 dark:text-indigo-300">💡 نکته: </b>
                  {report.tip_fa}
                </div>
              )}

              {report.corrected_de && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
                  <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300 mb-1">✅ شکل درست و طبیعی جمله:</div>
                  <div dir="ltr" className="font-sans font-bold text-base text-slate-900 dark:text-slate-100">{report.corrected_de}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SentenceBuilderModal;
