/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { playSprechenAudio } from '../utils/sprechenAudio';
import { generateWithGemini, parseAI } from '../utils/ai';
import { Mic, MicOff, Volume2, ArrowLeft, Send, CheckCircle, Award, Sparkles } from 'lucide-react';

interface SprechenTrainerProps {
  onClose: () => void;
  onShowToast: (msg: string, isErr?: boolean) => void;
}

const FREE_TOPICS = [
  'Reisen und Urlaub (سفر و تعطیلات)',
  'Arbeit und Beruf (کار و شغل)',
  'Wohnen und Haushalt (مسکن و خانه داری)',
  'Gesundheit und Sport (سلامتی و ورزش)',
  'Essen und Trinken (خوراکی و نوشیدنی)',
  'Medien und Internet (رسانه و اینترنت)',
  'Umwelt und Natur (محیط زیست و طبیعت)',
  'Freizeit und Hobbys (فراغت و سرگرمی)',
  'Bildung und Lernen (آموزش و یادگیری)',
  'Einkaufen und Geld (خرید و پول)',
  'Feste und Traditionen (جشن‌ها و سنت‌ها)',
  'Stadt und Verkehr (شهر و حمل و نقل)',
  'Freunde und Familie (دوستان و خانواده)',
  'Zukunftspläne (برنامه‌های آینده)',
  'Freies Gespräch (مکالمه آزاد دلخواه)'
];

export const SprechenTrainer: React.FC<SprechenTrainerProps> = ({ onClose, onShowToast }) => {
  const [activeTab, setActiveTab] = useState<'hub' | 'free' | 'exam_setup' | 'exam_active'>('hub');

  // Free conversation states
  const [selectedTopic, setSelectedTopic] = useState(FREE_TOPICS[0]);
  const [chatHistory, setChatHistory] = useState<{ speaker: 'ai' | 'user'; text: string }[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);

  // Exam setup states
  const [examType, setExamType] = useState<'Goethe' | 'Telc' | 'ÖSD' | 'EPD'>('ÖSD');
  const [examLevel, setExamLevel] = useState<'A1' | 'A2' | 'B1' | 'B2'>('B1');
  const [examVariant, setExamVariant] = useState<'zb1' | 'zdoe_b1'>('zdoe_b1');
  const [examPrompt, setExamPrompt] = useState<any>(null);

  // شروع مکالمه آزاد با موضوع انتخابی
  const startFreeChat = async (topic: string) => {
    setSelectedTopic(topic);
    setActiveTab('free');
    setIsAiLoading(true);
    setChatHistory([]);
    try {
      const prompt = `You are a friendly German conversation partner at B1 level. Initiate a conversation about the topic "${topic}" in simple German. Ask a welcoming opening question. Return ONLY JSON: {"text": "German sentence here"}`;
      const res = await generateWithGemini(prompt, { json: true });
      const data = parseAI(res);
      const aiText = data.text || `Hallo! Lass uns über das Thema ${topic} sprechen. Was denkst du darüber?`;
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

  // ارسال پیام متنی یا صوتی کاربر
  const sendUserMessage = async (textToSend?: string) => {
    const text = (textToSend !== undefined ? textToSend : userInput).trim();
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

  // فعال‌سازی تشخیص گفتار (Speech-to-Text) برای وویس دادن
  const toggleSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      onShowToast('مرورگر شما از قابلیت تشخیص گفتار پشتیبانی نمی‌کند.', true);
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'de-DE';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      onShowToast('🎙️ در حال گوش دادن... به آلمانی صحبت کنید.');
    };

    recognition.onresult = (event: any) => {
      const speechToText = event.results[0][0].transcript;
      setUserInput(speechToText);
      setIsListening(false);
      void sendUserMessage(speechToText);
    };

    recognition.onerror = () => {
      setIsListening(false);
      onShowToast('خطا در دریافت صدای میکروفون.', true);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  // تولید آزمون ساختاریافته بر اساس نوع آزمون و سطح
  const generateExamTask = async () => {
    setActiveTab('exam_active');
    setIsAiLoading(true);
    try {
      const prompt = `Generate an official speaking exam task for ${examType} level ${examLevel} (Variant: ${examVariant}). Return ONLY JSON: {
        "title": "Exam task title in German",
        "part1_situation": "Task description for part 1",
        "part2_topic": "Presentation topic for part 2",
        "part3_questions": ["Question 1", "Question 2"]
      }`;
      const res = await generateWithGemini(prompt, { json: true });
      const data = parseAI(res);
      setExamPrompt(data);
    } catch {
      setExamPrompt({
        title: `${examType} Sprechen Prüfung (${examLevel})`,
        part1_situation: 'Gemeinsam etwas planen: Planen Sie einen Ausflug am Wochenende.',
        part2_topic: 'Mein Lieblingshobby und warum es wichtig ist.',
        part3_questions: ['Haben Sie Haustiere?', 'Was machen Sie am Abend?']
      });
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="space-y-4 text-right max-w-3xl mx-auto pb-10" dir="rtl">
      {/* نمای اولیه (Hub): کارت‌های خطی تمرین‌ها */}
      {activeTab === 'hub' && (
        <div className="space-y-3">
          <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-3">
              <span className="text-3xl">💬</span>
              <div>
                <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100">Freies Sprechen (مکالمه آزاد)</h3>
                <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">گفتگوی تعاملی با موضوعات پرکاربرد آزمونی و پشتیبانی میکروفون صوتی</p>
              </div>
            </div>
            <button
              onClick={() => startFreeChat(FREE_TOPICS[0])}
              className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-xs transition"
            >
              انتخاب موضوعات ▶
            </button>
          </div>

          <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🎓</span>
              <div>
                <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100">Prüfungsmodus (شبیه‌سازی آزمون رسمی)</h3>
                <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">پشتیبانی از آزمون‌های Goethe, Telc, ÖSD و EPD با انتخاب سطح دلخواه</p>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('exam_setup')}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-xs transition"
            >
              تنظیم آزمون ▶
            </button>
          </div>
        </div>
      )}

      {/* انتخاب موضوعات مکالمه آزاد با لیست کشویی */}
      {activeTab === 'free' && (
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-5 md:p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex-1">
              <label className="block text-xs font-bold text-[#1f5fbf] dark:text-[#7fb0ff] mb-1">انتخاب موضوع مکالمه:</label>
              <select
                value={selectedTopic}
                onChange={e => void startFreeChat(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-bold outline-none"
              >
                {FREE_TOPICS.map(topic => (
                  <option key={topic} value={topic}>{topic}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setActiveTab('hub')}
              className="self-end sm:self-center px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold"
            >
              بازگشت به منو
            </button>
          </div>

          <div className="space-y-3 max-h-[380px] overflow-y-auto p-2" dir="ltr">
            {chatHistory.map((msg, i) => (
              <div key={i} className={`flex ${msg.speaker === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.speaker === 'user' ? 'bg-[#1f5fbf] text-white rounded-se-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-ss-sm'}`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[10px] font-bold opacity-75">{msg.speaker === 'ai' ? 'پارتنر هوش مصنوعی' : 'شما'}</span>
                    {msg.speaker === 'ai' && (
                      <button onClick={() => void playSprechenAudio(msg.text)} className="text-xs hover:scale-110 transition">🔊 پخش صدا</button>
                    )}
                  </div>
                  <div className="font-sans font-semibold text-base">{msg.text}</div>
                </div>
              </div>
            ))}
            {isAiLoading && (
              <div className="flex justify-start">
                <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl px-4 py-3 text-sm animate-pulse">هوش مصنوعی در حال پاسخ...</div>
              </div>
            )}
          </div>

          {/* نوار ورودی متن و میکروفون صوتی */}
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={toggleSpeechRecognition}
              className={`p-3 rounded-xl text-white transition ${isListening ? 'bg-red-600 animate-pulse' : 'bg-rose-600 hover:bg-rose-700'}`}
              title="صحبت کردن با میکروفون (وویس)"
            >
              {isListening ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            <input
              type="text"
              dir="ltr"
              value={userInput}
              onChange={e => setUserInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void sendUserMessage(); }}
              placeholder="Antworte auf Deutsch oder nutze Mikrofon …"
              className="flex-1 bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-base font-sans outline-none"
            />
            <button
              onClick={() => void sendUserMessage()}
              disabled={isAiLoading || !userInput.trim()}
              className="bg-[#1f5fbf] hover:bg-[#194ea0] disabled:opacity-40 text-white px-5 py-3 rounded-xl font-bold text-sm transition"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      )}

      {/* تنظیمات پیشرفته آزمون (Goethe, Telc, ÖSD, EPD + سطح) */}
      {activeTab === 'exam_setup' && (
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-6 shadow-sm space-y-4 text-right">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h3 className="font-extrabold text-base">تنظیمات شبیه‌سازی آزمون شفاهی</h3>
            <button onClick={() => setActiveTab('hub')} className="px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">بازگشت</button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold mb-1.5">نوع آزمون:</label>
              <select
                value={examType}
                onChange={e => setExamType(e.target.value as any)}
                className="w-full bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold"
              >
                <option value="ÖSD">ÖSD (آزمون رسمی اتریش/بین‌المللی)</option>
                <option value="Goethe">Goethe-Zertifikat (گته)</option>
                <option value="Telc">TELC (تلک)</option>
                <option value="EPD">EPD (مخصوص دانشگاه‌ها)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold mb-1.5">سطح آزمون:</label>
              <select
                value={examLevel}
                onChange={e => setExamLevel(e.target.value as any)}
                className="w-full bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold"
              >
                <option value="A1">A1 (مبتدی)</option>
                <option value="A2">A2 (پایه)</option>
                <option value="B1">B1 (متوسط)</option>
                <option value="B2">B2 (پیشرفته)</option>
              </select>
            </div>
          </div>

          {examType === 'ÖSD' && (
            <div>
              <label className="block text-xs font-bold mb-1.5">نسخه استاندارد ÖSD:</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setExamVariant('zdoe_b1')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${examVariant === 'zdoe_b1' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-50 dark:bg-slate-800 border-slate-200'}`}
                >
                  🇦🇹 ZDÖ B1 (ویژه اقامت اتریش)
                </button>
                <button
                  type="button"
                  onClick={() => setExamVariant('zb1')}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${examVariant === 'zb1' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-50 dark:bg-slate-800 border-slate-200'}`}
                >
                  🌍 ÖSD ZB1 (استاندارد بین‌المللی)
                </button>
              </div>
            </div>
          )}

          <button
            onClick={generateExamTask}
            className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white py-3.5 rounded-xl font-bold text-sm shadow-md mt-2"
          >
            ساخت و شروع آزمون شفاهی 🎓
          </button>
        </div>
      )}

      {/* محیط اجرای آزمون */}
      {activeTab === 'exam_active' && (
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-6 shadow-sm space-y-4 text-right">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <span className="font-extrabold text-base text-emerald-600 dark:text-emerald-400">
              {examType} - سطح {examLevel}
            </span>
            <button onClick={() => setActiveTab('exam_setup')} className="px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">پایان آزمون</button>
          </div>

          {isAiLoading ? (
            <div className="py-12 text-center text-sm font-bold animate-pulse">در حال بارگذاری سناریوی استاندارد آزمون...</div>
          ) : examPrompt ? (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 space-y-2">
                <h4 className="font-bold text-emerald-900 dark:text-emerald-200">بخش ۱: برنامه‌ریزی مشترک (Gemeinsam etwas planen)</h4>
                <p className="text-sm font-sans" dir="ltr">{examPrompt.part1_situation}</p>
              </div>

              <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 space-y-2">
                <h4 className="font-bold text-blue-900 dark:text-blue-200">بخش ۲: ارائه موضوع (Ein Thema präsentieren)</h4>
                <p className="text-sm font-sans" dir="ltr">{examPrompt.part2_topic}</p>
              </div>

              <button
                onClick={() => startFreeChat(examPrompt.part2_topic)}
                className="w-full bg-[#1f5fbf] text-white py-3 rounded-xl font-bold text-sm shadow-xs"
              >
                شروع صحبت و تمرین تعاملی این بخش 🎙️
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
