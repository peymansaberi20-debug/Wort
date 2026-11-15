/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { playSprechenAudio } from '../utils/sprechenAudio';
import { generateWithGemini, parseAI } from '../utils/ai';
import { Mic, Volume2, RotateCcw, Award, CheckCircle, ArrowLeft, Clock } from 'lucide-react';

type SprechenMode = 'hub' | 'free' | 'exam_intro' | 'exam_active' | 'exam_result';
type OsdVariant = 'zb1' | 'zdoe_b1';

interface SprechenTrainerProps {
  onClose: () => void;
  onShowToast: (msg: string, isErr?: boolean) => void;
}

export const SprechenTrainer: React.FC<SprechenTrainerProps> = ({ onClose, onShowToast }) => {
  const [mode, setMode] = useState<SprechenMode>('hub');
  const [osdVariant, setOsdVariant] = useState<OsdVariant>('zdoe_b1'); // پیش‌فرض ZDÖ B1 (اتریش)
  
  // Free conversation states
  const [freeTopic, setFreeTopic] = useState('Reisen und Urlaub');
  const [chatHistory, setChatHistory] = useState<{ speaker: 'ai' | 'user'; text: string }[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Exam simulation states
  const [examPart, setExamPart] = useState<1 | 2 | 3>(1);
  const [timeLeft, setTimeLeft] = useState(180); // 3 minutes preparation
  const [isExamRecording, setIsExamRecording] = useState(false);
  const [examTranscript, setExamTranscript] = useState('');
  const [examEvaluation, setExamEvaluation] = useState<any>(null);

  // شروع مکالمه آزاد
  const startFreeConversation = async (topic: string) => {
    setFreeTopic(topic);
    setMode('free');
    setIsAiLoading(true);
    try {
      const prompt = `You are a friendly German conversation partner at B1 level. Initiate a conversation about the topic "${topic}" in simple German (ÖSD B1 style). Ask a welcoming question. Return ONLY JSON: {"text": "German sentence here"}`;
      const res = await generateWithGemini(prompt, { json: true });
      const data = parseAI(res);
      const aiText = data.text || 'Hallo! Lass uns über dieses Thema sprechen. Wie denkst du darüber?';
      setChatHistory([{ speaker: 'ai', text: aiText }]);
      void playSprechenAudio(aiText);
    } catch {
      const fallback = `Hallo! Lass uns über das Thema ${topic} sprechen. Was ist deine Meinung dazu?`;
      setChatHistory([{ speaker: 'ai', text: fallback }]);
      void playSprechenAudio(fallback);
    } finally {
      setIsAiLoading(false);
    }
  };

  const sendFreeMessage = async () => {
    const text = userInput.trim();
    if (!text || isAiLoading) return;
    
    const newHistory = [...chatHistory, { speaker: 'user' as const, text }];
    setChatHistory(newHistory);
    setUserInput('');
    setIsAiLoading(true);

    try {
      const historyContext = newHistory.map(h => `${h.speaker === 'ai' ? 'Interlocutor' : 'Learner'}: ${h.text}`).join('\n');
      const prompt = `You are a supportive B1 German conversation partner. Continue the dialogue naturally, gently correcting any major grammar mistakes if necessary while keeping the conversation flowing.\n\nConversation:\n${historyContext}\n\nReturn ONLY JSON: {"text": "Next response in German", "correction": "brief grammar tip in Persian if any, or null"}`;
      const res = await generateWithGemini(prompt, { json: true });
      const data = parseAI(res);
      const aiText = data.text || 'Verstehe. Erzähl mir mehr darüber!';
      if (data.correction) {
        onShowToast(`💡 نکته گرامری: ${data.correction}`);
      }
      setChatHistory([...newHistory, { speaker: 'ai', text: aiText }]);
      void playSprechenAudio(aiText);
    } catch {
      const errText = 'Interessant! Kannst du das bitte genauer erklären?';
      setChatHistory([...newHistory, { speaker: 'ai', text: errText }]);
      void playSprechenAudio(errText);
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="space-y-4 text-right max-w-3xl mx-auto pb-10" dir="rtl">
      {/* هدر بخش Sprechen */}
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl px-5 py-3 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">🗣️</span>
          <div>
            <h2 className="font-extrabold text-base md:text-lg text-slate-900 dark:text-slate-100">بخش مکالمه و گفتار (Sprechen)</h2>
            <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">تمرین آزاد مکالمه و شبیه‌سازی رسمی امتحان ÖSD (ZB1 و ZDÖ B1)</p>
          </div>
        </div>
        <button
          onClick={() => {
            if (mode === 'hub') onClose();
            else setMode('hub');
          }}
          className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-sm font-bold flex items-center gap-1.5"
        >
          <ArrowLeft size={16} />
          <span>{mode === 'hub' ? 'خروج' : 'بازگشت به منو'}</span>
        </button>
      </div>

      {/* منوی اصلی Sprechen (Hub) */}
      {mode === 'hub' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* کارت ۱: مکالمه آزاد */}
          <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-6 shadow-sm space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center text-2xl font-bold">💬</div>
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">Freies Sprechen (مکالمه آزاد)</h3>
              <p className="text-sm text-[#5d6676] dark:text-[#a3adbd] leading-relaxed">
                گفتگوی آزاد روزمره با هوش مصنوعی در نقش پارتنر تمرینی، با قابلیت تصحیح زنده و صدای طبیعی اتریشی/آلمانی.
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                {['Reisen', 'Arbeit', 'Wohnen', 'Gesundheit'].map(t => (
                  <button
                    key={t}
                    onClick={() => startFreeConversation(t)}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-blue-50 dark:bg-slate-800 dark:hover:bg-blue-950/40 text-xs font-bold transition border border-slate-200 dark:border-slate-700"
                  >
                     موضوع: {t}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => startFreeConversation('Alltag und Leben')}
              className="w-full mt-4 bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white py-3 rounded-xl font-bold text-sm shadow-md transition"
            >
              شروع مکالمه آزاد ▶
            </button>
          </div>

          {/* کارت ۲: شبیه‌سازی امتحان ÖSD */}
          <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-6 shadow-sm space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-2xl font-bold">📝</div>
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">Prüfungsmodus (شبیه‌سازی امتحان ÖSD)</h3>
              <p className="text-sm text-[#5d6676] dark:text-[#a3adbd] leading-relaxed">
                شبیه‌سازی کامل ۳ بخش امتحان شفاهی B1 با تفکیک استاندارد بین‌المللی <b>ZB1</b> و استاندارد اقامت و مهاجرت اتریش <b>ZDÖ B1</b>.
              </p>
              
              <div className="space-y-2 pt-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">انتخاب استاندارد آزمون:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setOsdVariant('zdoe_b1')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${osdVariant === 'zdoe_b1' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}
                  >
                    🇦🇹 ZDÖ B1 (ویژه اتریش)
                  </button>
                  <button
                    onClick={() => setOsdVariant('zb1')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${osdVariant === 'zb1' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}
                  >
                    🌍 ÖSD ZB1 (بین‌المللی)
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={() => setMode('exam_intro')}
              className="w-full mt-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white py-3 rounded-xl font-bold text-sm shadow-md transition"
            >
              شروع شبیه‌سازی آزمون 🎓
            </button>
          </div>
        </div>
      )}

      {/* حالت مکالمه آزاد (Free Sprechen) */}
      {mode === 'free' && (
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-5 md:p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <span className="font-bold text-base text-[#1f5fbf] dark:text-[#7fb0ff]">موضوع گفتگو: {freeTopic}</span>
            <span className="text-xs px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold">Edge TTS صوتی فعال</span>
          </div>

          <div className="space-y-3 max-h-[400px] overflow-y-auto p-2" dir="ltr">
            {chatHistory.map((msg, i) => (
              <div key={i} className={`flex ${msg.speaker === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.speaker === 'user' ? 'bg-[#1f5fbf] text-white rounded-se-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-ss-sm'}`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[10px] font-bold opacity-75">{msg.speaker === 'ai' ? 'پارتنر هوش مصنوعی' : 'شما'}</span>
                    {msg.speaker === 'ai' && (
                      <button onClick={() => void playSprechenAudio(msg.text)} className="text-xs hover:scale-110 transition">🔊</button>
                    )}
                  </div>
                  <div className="font-sans font-semibold text-base">{msg.text}</div>
                </div>
              </div>
            ))}
            {isAiLoading && (
              <div className="flex justify-start">
                <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl px-4 py-3 text-sm animate-pulse">در حال پاسخ‌گویی…</div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <input
              type="text"
              dir="ltr"
              value={userInput}
              onChange={e => setUserInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void sendFreeMessage(); }}
              placeholder="Antworte auf Deutsch hier …"
              className="flex-1 bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-base font-sans outline-none"
            />
            <button
              onClick={() => void sendFreeMessage()}
              disabled={isAiLoading || !userInput.trim()}
              className="bg-[#1f5fbf] hover:bg-[#194ea0] disabled:opacity-40 text-white px-5 py-3 rounded-xl font-bold text-sm transition"
            >
              ارسال ➤
            </button>
          </div>
        </div>
      )}

      {/* معرفی آزمون ÖSD */}
      {mode === 'exam_intro' && (
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-6 shadow-sm space-y-4 text-right">
          <h3 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
            ساختار آزمون شفاهی {osdVariant === 'zdoe_b1' ? 'ZDÖ B1 (اتریش)' : 'ÖSD ZB1'}
          </h3>
          <p className="text-sm text-[#5d6676] dark:text-[#a3adbd] leading-relaxed">
            این آزمون شامل ۳ بخش استاندارد است:
          </p>
          <ul className="space-y-2 text-sm text-slate-800 dark:text-slate-200">
            <li><b>بخش ۱ (Gemeinsam etwas planen):</b> برنامه‌ریزی یک فعالیت دوطرفه (مثلاً هماهنگی مهمانی یا سفر).</li>
            <li><b>بخش ۲ (Ein Thema präsentieren):</b> ارائه یک موضوع شخصی یا اجتماعی (۳ دقیقه صحبت).</li>
            <li><b>بخش ۳ (Über ein Thema sprechen / Fragen beantworten):</b> پاسخ به سوالات و بازخورد دادن به ارائه‌ی پارتنر.</li>
          </ul>

          <div className="pt-4">
            <button
              onClick={() => { setExamPart(1); setMode('exam_active'); }}
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white py-3.5 rounded-xl font-bold text-sm shadow-md"
            >
              شروع شبیه‌سازی بخش اول ▶
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
