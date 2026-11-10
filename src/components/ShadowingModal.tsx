import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Word } from '../types';
import { fullWord } from '../utils/storage';
import { speak, stopSpeaking, getTtsWorkerBase } from '../utils/audio';
import { generateWithGemini, parseAI } from '../utils/ai';
import { IconBtn } from './IconBtn';
import { X, Mic, Square, Play, Trash2, Volume2, Wand2 } from 'lucide-react';

interface ShadowingModalProps {
  word: Word;
  onClose: () => void;
}

interface ShadowReport {
  ipa: string;
  syllables: { syl: string; stress: boolean }[];
  tips_fa: string[];
  trap_fa: string;
}

const fmtDur = (d: number | null) => (d != null && isFinite(d) ? `${d.toFixed(1)}s` : '—');

export const ShadowingModal: React.FC<ShadowingModalProps> = ({ word, onClose }) => {
  const parts: { key: string; label: string; text: string }[] = [
    { key: 'de', label: 'واژه', text: fullWord(word) },
    ...(word.ex ? [{ key: 'ex', label: 'تعریف', text: word.ex }] : []),
    ...(word.ex2 ? [{ key: 'ex2', label: 'مثال کاربردی', text: word.ex2 }] : [])
  ];
  const [part, setPart] = useState('de');
  const text = parts.find(p => p.key === part)?.text || fullWord(word);

  const [recBusy, setRecBusy] = useState(false);
  const [recUrl, setRecUrl] = useState<string | null>(null);
  const [recDur, setRecDur] = useState<number | null>(null);
  const [sampleDur, setSampleDur] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState('');
  const [report, setReport] = useState<ShadowReport | null>(null);

  useEffect(() => {
    setReport(null); setErr(''); setRecUrl(null); setRecDur(null); setPart('de');
  }, [word.id]);

  // sample duration from cloud mp3 metadata (if worker configured)
  useEffect(() => {
    setSampleDur(null);
    const base = getTtsWorkerBase();
    if (!base) return;
    const a = new Audio(`${base}/?lang=de&text=${encodeURIComponent(text)}`);
    const onMeta = () => { if (isFinite(a.duration)) setSampleDur(a.duration); };
    a.addEventListener('loadedmetadata', onMeta);
    return () => a.removeEventListener('loadedmetadata', onMeta);
  }, [text]);

  useEffect(() => {
    if (!recUrl) { setRecDur(null); return; }
    const a = new Audio(recUrl);
    const onMeta = () => { if (isFinite(a.duration)) setRecDur(a.duration); };
    a.addEventListener('loadedmetadata', onMeta);
    return () => a.removeEventListener('loadedmetadata', onMeta);
  }, [recUrl]);

  const playSample = () => {
    const base = getTtsWorkerBase();
    stopSpeaking();
    if (base) {
      const a = new Audio(`${base}/?lang=de&text=${encodeURIComponent(text)}`);
      void a.play().catch(() => speak(text));
    } else {
      speak(text);
    }
  };

  const startRec = async () => {
    setErr('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setErr('مرورگر شما از ضبط صدا پشتیبانی نمی‌کند.');
      return;
    }
    stopSpeaking();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        if (recUrl) URL.revokeObjectURL(recUrl);
        setRecUrl(URL.createObjectURL(new Blob(chunksRef.current, { type: mime || 'audio/webm' })));
        setRecBusy(false);
      };
      recRef.current = rec;
      rec.start();
      setRecBusy(true);
      setTimeout(() => { if (recRef.current?.state === 'recording') recRef.current!.stop(); }, 10000);
    } catch {
      setErr('اجازهٔ دسترسی به میکروفون داده نشد.');
      setRecBusy(false);
    }
  };

  const stopRec = () => { try { recRef.current?.stop(); } catch { /* ignore */ } };

  const playRec = () => {
    if (!recUrl) return;
    stopSpeaking();
    void new Audio(recUrl).play().catch(() => setErr('پخش ضبط ناموفق بود.'));
  };

  const askAi = async () => {
    if (aiBusy) return;
    setAiBusy(true); setAiErr(''); setReport(null);
    try {
      const out = await generateWithGemini(`You are a German pronunciation coach for Persian-speaking learners.\nTarget text: "${text}"\nReturn ONLY a JSON array with exactly one object, no markdown:\n[{"ipa":"IPA transcription of the text","syllables":[{"syl":"German syllable in order","stress":true}],"tips_fa":["2-4 short Persian tips: sounds, stress and rhythm Persian speakers typically get wrong in THIS text"],"trap_fa":"one short Persian line: the single most important thing to get right"}]\nRules: syllables in German order; exactly one stress=true (main stressed syllable); Persian explanations concise; German stays German.`, { json: true, timeoutMs: 30000, retries: 1 });
      const r: any = parseAI(out)[0];
      if (!r || !r.ipa) throw new Error('پاسخ نامعتبر بود.');
      setReport({
        ipa: String(r.ipa || ''),
        syllables: Array.isArray(r.syllables) ? r.syllables : [],
        tips_fa: Array.isArray(r.tips_fa) ? r.tips_fa : [],
        trap_fa: String(r.trap_fa || '')
      });
    } catch (e: any) {
      setAiErr(e?.message || 'راهنمای تلفظ ناموفق بود.');
    } finally { setAiBusy(false); }
  };

  const ratio = sampleDur && recDur ? recDur / sampleDur : null;
  const rhythmHint = ratio == null ? '' :
    ratio > 1.35 ? '🐢 ضبط تو آهسته‌تر از نمونه است.' :
    ratio < 0.65 ? '🐇 ضبط تو تندتر از نمونه است.' :
    '⏱ ریتم تو نزدیک به نمونه است.';

  return createPortal(
    <div
      className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-xs flex items-start sm:items-center justify-center p-3 md:p-6 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl w-full max-w-xl max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col" dir="rtl">
        <div dir="ltr" className="sticky top-0 z-10 bg-white/95 dark:bg-[#1b2029]/95 backdrop-blur-md px-4 py-3 border-b border-[#dde1ea] dark:border-[#333b4a] flex items-center gap-2">
          <IconBtn onClick={onClose} title="بستن"><X size={18} className="text-red-500" /></IconBtn>
          <h3 className="flex-1 text-right font-bold text-base text-slate-900 dark:text-slate-100">🎙 تمرین تلفظ (Shadowing)</h3>
        </div>

        <div className="p-4 md:p-5 space-y-4">
          {/* text picker */}
          <div className="flex flex-wrap gap-1.5">
            {parts.map(p => (
              <button key={p.key} onClick={() => setPart(p.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${part === p.key ? 'bg-[#1f5fbf] text-white border-[#1f5fbf]' : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <div dir="ltr" className="bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 font-sans font-bold text-lg text-slate-900 dark:text-slate-100 text-center">
            {text}
          </div>

          {/* controls */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={playSample}
              className="h-12 rounded-xl bg-[#1f5fbf] hover:bg-[#194ea0] text-white text-sm font-bold transition flex items-center justify-center gap-2">
              <Volume2 size={17} /> بشنو (نمونه)
            </button>
            {recBusy ? (
              <button onClick={stopRec}
                className="h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition flex items-center justify-center gap-2 animate-pulse">
                <Square size={16} /> توقف ضبط
              </button>
            ) : (
              <button onClick={() => void startRec()}
                className="h-12 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold transition flex items-center justify-center gap-2">
                <Mic size={17} /> ضبط کن (تا ۱۰ ثانیه)
              </button>
            )}
          </div>

          {recUrl && (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={playRec}
                className="h-11 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-bold transition flex items-center justify-center gap-2">
                <Play size={15} /> پخش ضبط من
              </button>
              <button onClick={() => { if (recUrl) URL.revokeObjectURL(recUrl); setRecUrl(null); setRecDur(null); }}
                className="h-11 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300 text-sm font-bold transition flex items-center justify-center gap-2">
                <Trash2 size={15} /> حذف ضبط
              </button>
            </div>
          )}

          {/* compare row */}
          {(sampleDur || recDur) && (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] text-sm space-y-1">
              <div className="flex justify-between"><span>⏱ نمونه:</span><b dir="ltr">{fmtDur(sampleDur)}</b></div>
              <div className="flex justify-between"><span>🎙 ضبط من:</span><b dir="ltr">{fmtDur(recDur)}</b></div>
              {rhythmHint && <div className="text-xs text-[#5d6676] dark:text-[#a3adbd]">{rhythmHint}</div>}
            </div>
          )}

          {err && <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">{err}</div>}

          {/* AI coach */}
          <button onClick={() => void askAi()} disabled={aiBusy}
            className="w-full h-12 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white text-sm font-bold transition flex items-center justify-center gap-2 disabled:opacity-50">
            {aiBusy ? <><span className="inline-block animate-spin">⏳</span><span>در حال آماده‌سازی راهنما…</span></> : <><Wand2 size={17} /><span>🤖 راهنمای تلفظ این متن</span></>}
          </button>

          {aiErr && <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">{aiErr}</div>}

          {report && (
            <div className="space-y-2.5">
              {report.ipa && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a]">
                  <div className="text-[11px] font-bold text-[#5d6676] mb-1">آوانگاری (IPA):</div>
                  <div dir="ltr" className="font-sans font-bold text-lg text-slate-900 dark:text-slate-100 text-center">{report.ipa}</div>
                </div>
              )}
              {report.syllables.length > 0 && (
                <div className="flex flex-wrap justify-center gap-1.5" dir="ltr">
                  {report.syllables.map((s, i) => (
                    <span key={i} className={`px-2.5 py-1 rounded-lg font-sans font-bold text-sm border ${s.stress ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800' : 'bg-white text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'}`}>
                      {s.syl}{s.stress ? ' ˈ' : ''}
                    </span>
                  ))}
                </div>
              )}
              {report.tips_fa.length > 0 && (
                <ul className="space-y-1.5 text-sm leading-7 text-slate-800 dark:text-slate-100">
                  {report.tips_fa.map((t, i) => <li key={i} className="flex gap-2"><span className="text-[#1f5fbf]">•</span><span>{t}</span></li>)}
                </ul>
              )}
              {report.trap_fa && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-sm leading-7">
                  <b className="text-rose-700 dark:text-rose-300">⚠️ مهم‌ترین نکته: </b>{report.trap_fa}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ShadowingModal;