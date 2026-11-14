import React, { useState, useEffect, useMemo } from 'react';
import { AppSettings, Word } from '../types';
import { getCategories, fullWord } from '../utils/storage';
import { getGermanVoices, speak, stopSpeaking, getTtsWorkerBase, setTtsWorkerBase, prewarmTts } from '../utils/audio';
import { GeminiKeyCard } from '../components/GeminiKeyCard';
import { PROVIDERS, describeAiError, getActiveProvider, getApiKey, getModel, testConnection } from '../utils/aiProvider';

interface SettingsViewProps {
  section?: string;
  settings: AppSettings;
  words: Word[];
  onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
  onClearHistory: () => void;
  onClearAllWords: () => void;
  onShowToast: (msg: string, isErr?: boolean) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  section,
  settings,
  words,
  onUpdateSettings,
  onClearHistory,
  onClearAllWords,
  onShowToast
}) => {
  // Server-side Gemini AI status check
  const [testStatus, setTestStatus] = useState('');
  const [testing, setTesting] = useState(false);

  // Available German voices
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  // Destructive delete confirmation step
  const [deleteStep, setDeleteStep] = useState<number>(0);
  // Cloud TTS worker settings
  const [ttsWorkerDraft, setTtsWorkerDraft] = useState<string>(() => getTtsWorkerBase() || '');
  const [prewarmBusy, setPrewarmBusy] = useState(false);
  const [prewarmDone, setPrewarmDone] = useState(0);
  const [prewarmTotal, setPrewarmTotal] = useState(0);
  const [prewarmError, setPrewarmError] = useState('');

  const handlePrewarmAll = async () => {
    if (prewarmBusy) return;
    setPrewarmBusy(true); setPrewarmError('');
    try {
      const texts: string[] = [];
      words.forEach(w => {
        texts.push(fullWord(w));
        if (w.ex) texts.push(w.ex);
        if (w.ex2) texts.push(w.ex2);
      });
      setPrewarmTotal(texts.length);
      await prewarmTts(texts, (d, t) => setPrewarmDone(d));
      onShowToast?.(`🎙 پیش‌تولید صدا برای ${texts.length} مورد کامل شد.`);
    } catch (e: any) {
      setPrewarmError(e?.message || 'پیش‌تولید ناموفق بود.');
    } finally { setPrewarmBusy(false); }
  };
  const [isVoiceGuideOpen, setIsVoiceGuideOpen] = useState(false);

  // Load voices asynchronously
  useEffect(() => {
    const updateVoices = () => {
      const v = getGermanVoices();
      setAvailableVoices(v);
    };
    updateVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isVoiceGuideOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setIsVoiceGuideOpen(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isVoiceGuideOpen]);

  const categories = useMemo(() => getCategories(words), [words]);

  const handleTestAi = async () => {
    setTesting(true);
    setTestStatus('در حال بررسی هوش مصنوعی انتخاب‌شده...');
    try {
      const p = getActiveProvider();
      const key = getApiKey(p);
      if (!key) {
        setTestStatus(`⚠️ برای «${PROVIDERS[p].label}» هنوز کلیدی وارد نشده است.`);
        onShowToast('ابتدا کلید API را وارد کنید.', true);
      } else {
        const r = await testConnection(p, key);
        setTestStatus(`${r.ok ? '✅' : '❌'} ${r.message} (مدل: ${getModel(p)})`);
        onShowToast(r.message, !r.ok);
      }
    } catch (err: any) {
      setTestStatus(`❌ ${describeAiError(err)}`);
      onShowToast('خطا در آزمون اتصال', true);
    } finally {
      setTesting(false);
    }
  };

  const handleTestVoice = () => {
    stopSpeaking();
    speak('Guten Tag! Ich lerne Deutsch in Wien.', {
      rate: settings.rate,
      vreg: settings.vreg,
      voiceName: settings.voice,
      onErr: msg => onShowToast(msg, true)
    });
  };

  const toggleCategory = (catName: string) => {
    const current = settings.activeCats || [];
    let updated: string[];
    if (current.includes(catName)) {
      updated = current.filter(c => c !== catName);
    } else {
      updated = [...current, catName];
    }
    onUpdateSettings({ activeCats: updated });
  };

  const handleClearHistoryClick = () => {
    if (window.confirm('آیا از پاک کردن کامل تاریخچهٔ مرور و ریست شدن فواصل لایتنر مطمئن هستید؟ واژگان شما دست‌نخورده باقی خواهند ماند.')) {
      onClearHistory();
    }
  };

  const handleDeleteAllWordsClick = () => {
    if (deleteStep === 0) {
      setDeleteStep(1);
    } else if (deleteStep === 1) {
      if (window.confirm('⚠️ اخطار نهایی: کلیه واژگان، ترجمه‌ها، مثال‌ها و دسته‌بندی‌ها برای همیشه حذف خواهند شد. این عملیات قابل بازگشت نیست. آیا کاملاً مطمئن هستید؟')) {
        onClearAllWords();
        setDeleteStep(0);
      }
    }
  };

  const show = (k: string) => !section || section === k;

  return (
    <div className="space-y-6 text-right max-w-3xl mx-auto pb-12" dir="rtl">
      {show('appearance') && (
        <div className="bg-white dark:bg-[#1b2029] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-5 transition-all">
          <div className="flex items-center gap-3.5 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xl shadow-inner">🎨</div>
            <div>
              <h3 className="font-extrabold text-base md:text-lg text-slate-900 dark:text-slate-100">پوسته و جهت فلش‌کارت‌ها</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">شخصی‌سازی ظاهر برنامه و نحوه نمایش کارت‌های یادگیری</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-[#141923]/70 border border-slate-100 dark:border-slate-800 space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                پوستهٔ برنامه:
              </label>
              <select
                value={settings.theme || 'light'}
                onChange={e => onUpdateSettings({ theme: e.target.value as 'light' | 'dark' })}
                className="w-full bg-white dark:bg-[#1b2029] border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs md:text-sm outline-none font-medium transition focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="light">☀️ روشن (پیش‌فرض)</option>
                <option value="dark">🌙 تیره (Dark Mode)</option>
              </select>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-[#141923]/70 border border-slate-100 dark:border-slate-800 space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                جهت پیش‌فرض نمایش فلش‌کارت‌ها:
              </label>
              <select
                value={settings.dir || 'de'}
                onChange={e => onUpdateSettings({ dir: e.target.value as 'de' | 'fa' | 'rand' })}
                className="w-full bg-white dark:bg-[#1b2029] border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs md:text-sm outline-none font-medium transition focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="de">🇩🇪 آلمانی ← فارسی</option>
                <option value="fa">🇮🇷 فارسی ← آلمانی</option>
                <option value="rand">🔀 جهت تصادفی برای هر کارت (مستقل)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {show('learning') && (
        <>
          <div className="bg-white dark:bg-[#1b2029] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-5 transition-all">
            <div className="flex items-center gap-3.5 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xl shadow-inner">📊</div>
              <div>
                <h3 className="font-extrabold text-base md:text-lg text-slate-900 dark:text-slate-100">محدودیت‌های روزانه و ترتیب جلسه</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">تنظیم سهمیه لغات جدید، سقف مرور و چینش کارت‌ها</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-[#141923]/70 border border-slate-100 dark:border-slate-800 space-y-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  سهمیه کلمه جدید در روز:
                </label>
                <input
                  type="number"
                  min={0}
                  max={500}
                  value={settings.nw ?? 10}
                  onChange={e => onUpdateSettings({ nw: Math.max(0, Math.min(500, parseInt(e.target.value) || 0)) })}
                  className="w-full bg-white dark:bg-[#1b2029] border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs md:text-sm outline-none font-medium text-center transition focus:ring-2 focus:ring-blue-500/20"
                />
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block text-center mt-1">۰ تا ۵۰۰ (۰ = بدون لغت جدید)</span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-[#141923]/70 border border-slate-100 dark:border-slate-800 space-y-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  حداکثر مرور در روز:
                </label>
                <input
                  type="number"
                  min={0}
                  max={500}
                  value={settings.rv ?? 20}
                  onChange={e => onUpdateSettings({ rv: Math.max(0, Math.min(500, parseInt(e.target.value) || 0)) })}
                  className="w-full bg-white dark:bg-[#1b2029] border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs md:text-sm outline-none font-medium text-center transition focus:ring-2 focus:ring-blue-500/20"
                />
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block text-center mt-1">۰ تا ۵۰۰ (۰ = بدون محدودیت مرور)</span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-[#141923]/70 border border-slate-100 dark:border-slate-800 space-y-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  ترتیب چینش کارت‌ها:
                </label>
                <select
                  value={settings.order || 'due'}
                  onChange={e => onUpdateSettings({ order: e.target.value as any })}
                  className="w-full bg-white dark:bg-[#1b2029] border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs md:text-sm outline-none font-medium transition focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="due">🔁 اول سررسیدها، سپس جدیدها</option>
                  <option value="new">🌟 اول واژگان جدید</option>
                  <option value="mix">🔀 ترکیب یکی‌درمیان (سررسید و جدید)</option>
                  <option value="rand">🎲 چینش کاملاً تصادفی</option>
                  <option value="randnew">🎲 چینش تصادفی واژه‌های جدید (سررسیدها اول)</option>
                </select>
              </div>
            </div>

            {/* Category Filter for Study Session */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <div>
                <label className="block text-xs md:text-sm font-bold text-slate-800 dark:text-slate-200">
                  فیلتر دسته‌های فعال در جلسات روزانه:
                </label>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  در صورت عدم انتخاب، واژگان تمامی دسته‌ها در مطالعه روزانه شرکت می‌کنند.
                </p>
              </div>

              <div className="flex flex-wrap gap-2 max-h-44 overflow-y-auto p-3.5 bg-slate-50/80 dark:bg-[#141923]/70 border border-slate-100 dark:border-slate-800 rounded-2xl">
                {categories.length === 0 ? (
                  <span className="text-xs text-slate-400">هنوز دسته‌ای ایجاد نشده است.</span>
                ) : (
                  categories.map(([catName, count]) => {
                    const isSelected = (settings.activeCats || []).includes(catName);
                    return (
                      <button
                        key={catName}
                        type="button"
                        onClick={() => toggleCategory(catName)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shadow-xs ${
                          isSelected
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        <span className="text-[10px]">{isSelected ? '✓' : '+'}</span>
                        <span>{catName}</span>
                        <span className="opacity-70 text-[10px]">({count})</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Review Algorithm & Difficult Words */}
          <div className="bg-white dark:bg-[#1b2029] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-5 transition-all">
            <div className="flex items-center gap-3.5 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xl shadow-inner">🧠</div>
              <div>
                <h3 className="font-extrabold text-base md:text-lg text-slate-900 dark:text-slate-100">الگوریتم تکرار فاصله‌دار و واژه‌های دشوار</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">تنظیم ضرایب لایتنر و مدیریت لغات سخت (Leeches)</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-[#141923]/70 border border-slate-100 dark:border-slate-800 space-y-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  ضریب فاصلهٔ مرور (ivlMod):
                </label>
                <select
                  value={settings.ivlMod ?? 1}
                  onChange={e => onUpdateSettings({ ivlMod: parseFloat(e.target.value) || 1 })}
                  className="w-full bg-white dark:bg-[#1b2029] border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs md:text-sm outline-none font-medium transition focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="0.8">0.8 (حالت سخت‌گیرانه - فواصل کوتاه‌تر)</option>
                  <option value="1">1.0 (حالت عادی استاندارد)</option>
                  <option value="1.25">1.25 (حالت آسان‌تر - فواصل طولانی‌تر)</option>
                </select>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-[#141923]/70 border border-slate-100 dark:border-slate-800 space-y-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  آستانهٔ خطای واژهٔ دشوار (leechN):
                </label>
                <input
                  type="number"
                  min={2}
                  max={20}
                  value={settings.leechN ?? 4}
                  onChange={e => onUpdateSettings({ leechN: Math.max(2, Math.min(20, parseInt(e.target.value) || 4)) })}
                  className="w-full bg-white dark:bg-[#1b2029] border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs md:text-sm outline-none font-medium text-center transition focus:ring-2 focus:ring-blue-500/20"
                />
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block text-center mt-1">تعداد خطاهای مکرر (۲ تا ۲۰)</span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-[#141923]/70 border border-slate-100 dark:border-slate-800 space-y-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  واکنش به واژه‌های دشوار:
                </label>
                <select
                  value={settings.leechAct || 'mark'}
                  onChange={e => onUpdateSettings({ leechAct: e.target.value as 'mark' | 'suspend' })}
                  className="w-full bg-white dark:bg-[#1b2029] border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs md:text-sm outline-none font-medium transition focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="mark">فقط نشانه‌گذاری با 🩸 (بدون تعلیق)</option>
                  <option value="suspend">نشانه‌گذاری و تعلیق از جلسات روزانه</option>
                </select>
              </div>
            </div>
          </div>

          {/* Flashcard Timer */}
          <div className="bg-white dark:bg-[#1b2029] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4 transition-all">
            <div className="flex items-center gap-3.5 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xl shadow-inner">⏱️</div>
              <div>
                <h3 className="font-extrabold text-base md:text-lg text-slate-900 dark:text-slate-100">تایمر تمرین‌ها</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">راهنمای تنظیم زمان‌سنج اختصاصی هر بخش</p>
              </div>
            </div>

            <p className="text-xs md:text-sm leading-8 text-slate-600 dark:text-slate-300 bg-slate-50/80 dark:bg-[#141923]/70 p-4.5 rounded-2xl border border-slate-100 dark:border-slate-800">
              تایمر هر تمرین جداگانه تنظیم می‌شود: داخل هر تمرین، آیکن ⏱ را در نوار بالا (قبل از آیکن شناسنامهٔ واژه) بزنید، تایمر را روشن یا خاموش کنید و مدت آن را تعیین کنید. تنظیم هر تمرین ذخیره می‌ماند. «تمرین ترکیبی واژه‌های سخت» از تایمر همان تمرین اصلی هر سؤال پیروی می‌کند.
            </p>
          </div>
        </>
      )}

      {show('audio') && (
        <div className="bg-white dark:bg-[#1b2029] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-5 transition-all">
          <div className="flex items-center gap-3.5 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="w-10 h-10 rounded-2xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center text-xl shadow-inner">🔊</div>
            <div>
              <h3 className="font-extrabold text-base md:text-lg text-slate-900 dark:text-slate-100">تلفظ و تنظیمات صوتی آلمانی</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">مدیریت صداهای ابری، لهجه و سرعت گفتار</p>
            </div>
          </div>

          <div className="rounded-2xl border border-sky-200 dark:border-sky-900/60 bg-sky-50/40 dark:bg-sky-950/20 p-5 space-y-3.5 shadow-inner">
            <div className="flex items-center gap-2">
              <b className="text-sm text-sky-900 dark:text-sky-200">☁️ صدای ابری باکیفیت (پیشنهادی — مخصوصاً برای iOS)</b>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-6">
              آدرس سرویس TTS خودت را وارد کن؛ در صورت فعال بودن، همهٔ تلفظ‌ها با کیفیت یکسان و طبیعی از CDN پخش می‌شوند (حتی روی آیفون). اگر خالی بماند، صدای مرورگر استفاده می‌شود.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <input
                type="url"
                dir="ltr"
                placeholder="https://wort-tts.peymansaberi20.workers.dev"
                value={ttsWorkerDraft}
                onChange={e => setTtsWorkerDraft(e.target.value)}
                className="flex-1 min-w-[240px] bg-white dark:bg-[#1b2029] border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs outline-none font-mono transition focus:ring-2 focus:ring-blue-500/20"
              />
              <button
                type="button"
                onClick={() => {
                  setTtsWorkerBase(ttsWorkerDraft);
                  onShowToast?.(ttsWorkerDraft.trim() ? 'آدرس صوت ابری ذخیره شد.' : 'صدای ابری خاموش شد؛ صدای مرورگر فعال است.');
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-xs"
              >
                ذخیره
              </button>
              <button
                type="button"
                onClick={handleTestVoice}
                className="border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 transition"
              >
                🔊 تست با این آدرس
              </button>
            </div>
            <button
              type="button"
              onClick={() => void handlePrewarmAll()}
              disabled={prewarmBusy || !getTtsWorkerBase()}
              className="w-full bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/40 dark:hover:bg-violet-900/60 text-violet-800 dark:text-violet-300 border border-violet-200 dark:border-violet-800/80 py-2.5 rounded-xl text-xs font-bold transition disabled:opacity-40 flex items-center justify-center gap-2 shadow-xs"
              title="تمام واژه‌ها و مثال‌ها را یک‌بار از Worker می‌گیرد تا کش CDN داغ شود"
            >
              {prewarmBusy
                ? <span>⏳ پیش‌تولید… {prewarmDone}/{prewarmTotal}</span>
                : <span>🎙 پیش‌تولید صدا برای همهٔ واژه‌ها (یک‌بار)</span>}
            </button>
            {prewarmError && <div className="text-[11px] text-red-600 dark:text-red-400">{prewarmError}</div>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-[#141923]/70 border border-slate-100 dark:border-slate-800 space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                لهجهٔ آلمانی (منطقه):
              </label>
              <select
                value={settings.vreg || ''}
                onChange={e => onUpdateSettings({ vreg: e.target.value })}
                className="w-full bg-white dark:bg-[#1b2029] border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs md:text-sm outline-none font-medium transition focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">خودکار / پیش‌فرض سیستم</option>
                <option value="de-DE">آلمانی آلمان (de-DE)</option>
                <option value="de-AT">آلمانی اتریش (de-AT)</option>
                <option value="de-CH">آلمانی سوئیس (de-CH)</option>
              </select>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-[#141923]/70 border border-slate-100 dark:border-slate-800 space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                صدای گوینده (Speech Voice):
              </label>
              <select
                value={settings.voice || ''}
                onChange={e => onUpdateSettings({ voice: e.target.value })}
                className="w-full bg-white dark:bg-[#1b2029] border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs md:text-sm outline-none font-medium transition focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">انتخاب خودکار صدای آلمانی</option>
                {availableVoices.map(v => (
                  <option key={v.name} value={v.name}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-[#141923]/70 border border-slate-100 dark:border-slate-800 space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                سرعت گفتار: {settings.rate ?? 0.85}x
              </label>
              <input
                type="range"
                min={0.5}
                max={1.1}
                step={0.05}
                value={settings.rate ?? 0.85}
                onChange={e => onUpdateSettings({ rate: parseFloat(e.target.value) || 0.85 })}
                className="w-full accent-blue-600 cursor-pointer pt-2"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>0.5x (آهسته)</span>
                <span>0.85x</span>
                <span>1.1x (سریع)</span>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <label className="flex items-center gap-3 cursor-pointer text-xs md:text-sm font-semibold select-none p-3.5 rounded-2xl bg-slate-50/80 dark:bg-[#141923]/70 border border-slate-100 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition">
              <input
                type="checkbox"
                checked={!!settings.auto}
                onChange={e => onUpdateSettings({ auto: e.target.checked })}
                className="w-4 h-4 rounded text-blue-600 accent-blue-600 cursor-pointer"
              />
              <span className="text-slate-800 dark:text-slate-200">پخش خودکار تلفظ کلمه هنگام باز شدن کارت</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer text-xs md:text-sm font-semibold select-none p-3.5 rounded-2xl bg-slate-50/80 dark:bg-[#141923]/70 border border-slate-100 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition">
              <input
                type="checkbox"
                checked={!!settings.autoEx}
                onChange={e => onUpdateSettings({ autoEx: e.target.checked })}
                className="w-4 h-4 rounded text-blue-600 accent-blue-600 cursor-pointer"
              />
              <span className="text-slate-800 dark:text-slate-200">خواندن جملهٔ مثال پس از پایان تلفظ واژه (در صورت وجود مثال)</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleTestVoice}
                className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 px-4 py-2.5 rounded-xl text-xs md:text-sm font-bold flex items-center gap-2 transition shadow-xs"
              >
                <span>🔊</span>
                <span>تست صدا (Test Voice)</span>
              </button>
              <button
                type="button"
                onClick={() => setIsVoiceGuideOpen(true)}
                className="bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:hover:bg-blue-900/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-4 py-2.5 rounded-xl text-xs md:text-sm font-bold transition shadow-xs"
              >
                راهنمای نصب و طبیعی کردن صدا
              </button>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              عبارت تستی: «Guten Tag! Ich lerne Deutsch in Wien.»
            </span>
          </div>
        </div>
      )}

      {show('goal') && (
        <div className="bg-white dark:bg-[#1b2029] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-5 transition-all">
          <div className="flex items-center gap-3.5 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="w-10 h-10 rounded-2xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center text-xl shadow-inner">🎯</div>
            <div>
              <h3 className="font-extrabold text-base md:text-lg text-slate-900 dark:text-slate-100">هدف روزانه و یادآوری پشتیبان‌گیری</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">تنظیم تعداد کارت‌های هدف و دوره‌های پشتیبان‌گیری از داده‌ها</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-[#141923]/70 border border-slate-100 dark:border-slate-800 space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                هدف مطالعه روزانه (تعداد کارت):
              </label>
              <input
                type="number"
                min={0}
                max={500}
                value={settings.goal ?? 20}
                onChange={e => onUpdateSettings({ goal: Math.max(0, Math.min(500, parseInt(e.target.value) || 0)) })}
                className="w-full bg-white dark:bg-[#1b2029] border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs md:text-sm outline-none font-medium text-center transition focus:ring-2 focus:ring-blue-500/20"
              />
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block text-center mt-1">۰ تا ۵۰۰ (۰ = غیرفعال)</span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-[#141923]/70 border border-slate-100 dark:border-slate-800 space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                دوره یادآوری پشتیبان‌گیری:
              </label>
              <select
                value={settings.bkDays ?? 7}
                onChange={e => onUpdateSettings({ bkDays: parseInt(e.target.value) || 0 })}
                className="w-full bg-white dark:bg-[#1b2029] border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs md:text-sm outline-none font-medium transition focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="0">غیرفعال</option>
                <option value="3">هر ۳ روز یک‌بار</option>
                <option value="7">هر ۷ روز یک‌بار (پیش‌فرض)</option>
                <option value="14">هر ۱۴ روز یک‌بار</option>
                <option value="30">هر ۳۰ روز یک‌بار</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {isVoiceGuideOpen && (
        <div
          className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onMouseDown={event => { if (event.target === event.currentTarget) setIsVoiceGuideOpen(false); }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="voice-guide-title" dir="rtl" className="w-full max-w-2xl max-h-[85dvh] overflow-y-auto bg-white dark:bg-[#1b2029] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-700 pb-3 mb-4">
              <div>
                <h2 id="voice-guide-title" className="text-base sm:text-lg font-extrabold">راهنمای نصب و طبیعی کردن صدا</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">نام منوها بسته به نسخهٔ سیستم‌عامل و دستگاه ممکن است کمی متفاوت باشد.</p>
              </div>
              <button type="button" autoFocus onClick={() => setIsVoiceGuideOpen(false)} aria-label="بستن راهنما" className="shrink-0 rounded-xl px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold transition">✕ بستن</button>
            </div>
            <p className="text-xs sm:text-sm leading-7 mb-4 text-slate-700 dark:text-slate-300">برنامه از صداهای آلمانی نصب‌شده روی دستگاه استفاده می‌کند. کیفیت و دسترسی به صداها به سیستم‌عامل، مرورگر و صداهایی که مرورگر در اختیار برنامه می‌گذارد بستگی دارد؛ برنامه نمی‌تواند صدایی را که مرورگر ارائه نمی‌کند مستقیماً انتخاب کند.</p>
            <div className="space-y-3 text-xs sm:text-sm leading-7">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 p-4 bg-slate-50/60 dark:bg-[#141923]/50"><b>📱 آیفون و آیپد</b><p className="text-slate-600 dark:text-slate-400 mt-1">Settings → Accessibility → Spoken Content → Voices → German. اگر گزینهٔ Enhanced یا Premium موجود بود، آن را دانلود کنید.</p></div>
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 p-4 bg-slate-50/60 dark:bg-[#141923]/50"><b>🤖 اندروید</b><p className="text-slate-600 dark:text-slate-400 mt-1">Settings → System → Languages &amp; input → Text-to-speech output. موتور گفتار Google را انتخاب کنید و در تنظیمات آن، دادهٔ صدای آلمانی را نصب کنید.</p></div>
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 p-4 bg-slate-50/60 dark:bg-[#141923]/50"><b>🪟 ویندوز</b><p className="text-slate-600 dark:text-slate-400 mt-1">Microsoft Edge ممکن است در صورت پشتیبانی، صداهای آنلاین با کیفیت بالاتر ارائه کند. در Windows 11 مسیر Settings → Time &amp; language → Speech → Manage voices → Add voices → German را بررسی کنید.</p></div>
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700/80 p-4 bg-slate-50/60 dark:bg-[#141923]/50"><b>🍎 macOS</b><p className="text-slate-600 dark:text-slate-400 mt-1">System Settings → Accessibility → Spoken Content → System voice → Manage Voices. در صورت وجود، صدای آلمانی با کیفیت بالاتر را دانلود کنید.</p></div>
            </div>
            <div className="mt-5 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 p-4 text-xs sm:text-sm leading-7 text-blue-900 dark:text-blue-200">
              برای صدای طبیعی‌تر، سرعت را حدود <b dir="ltr">0.8–0.9</b> تنظیم کنید، از دکمهٔ «تست صدا» استفاده کنید و پس از نصب صدای جدید، صفحهٔ برنامه را تازه‌سازی کنید. نام یا کیفیت مشخصی از صدا در همهٔ دستگاه‌ها تضمین‌شده نیست.
            </div>
          </section>
        </div>
      )}

      {show('ai') && <GeminiKeyCard />}

      {show('data') && (
        <div className="bg-white dark:bg-[#1b2029] border border-red-200/90 dark:border-red-900/50 rounded-3xl p-6 shadow-sm space-y-5 transition-all">
          <div className="flex items-center gap-3.5 border-b border-red-100 dark:border-red-950 pb-4">
            <div className="w-10 h-10 rounded-2xl bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center text-xl shadow-inner">⚠️</div>
            <div>
              <h3 className="font-extrabold text-base md:text-lg text-red-700 dark:text-red-400">مدیریت داده‌ها و عملیات حساس</h3>
              <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-0.5">بخش مدیریت سوابق و حذف اطلاعات (نیازمند دقت)</p>
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            لطفاً پیش از انجام این عملیات، در صورت نیاز از منوی ⋮ ← «ذخیره و پشتیبان‌گیری» یک فایل پشتیبان دریافت کنید.
          </p>

          <div className="space-y-3.5 pt-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50/80 dark:bg-[#141923]/70 border border-slate-100 dark:border-slate-800">
              <div>
                <b className="text-xs md:text-sm text-slate-900 dark:text-slate-100 block">
                  پاک کردن سابقهٔ مرور (Reset Review History)
                </b>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 block">
                  واژه‌ها حفظ می‌شوند؛ فواصل، آمار درست/غلط و مراحل یادگیری صفر می‌شوند.
                </span>
              </div>
              <button
                onClick={handleClearHistoryClick}
                className="bg-amber-100 hover:bg-amber-200 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200 px-4 py-2.5 rounded-xl text-xs font-bold transition flex-shrink-0 shadow-xs"
              >
                🔄 پاک کردن سابقه مرور
              </button>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-red-50/50 dark:bg-red-950/20 border border-red-200/90 dark:border-red-900/40">
              <div>
                <b className="text-xs md:text-sm text-red-800 dark:text-red-300 block">
                  حذف کامل واژگان (Delete All Vocabulary)
                </b>
                <span className="text-[11px] text-red-600/80 dark:text-red-400/80 mt-0.5 block">
                  کلیه لغات، دسته‌ها و سوابق به طور برگشت‌ناپذیر حذف می‌شوند. نیازمند دو مرحله تأیید.
                </span>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {deleteStep === 1 && (
                  <button
                    onClick={() => setDeleteStep(0)}
                    className="bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-3 py-2.5 rounded-xl text-xs font-semibold transition"
                  >
                    انصراف
                  </button>
                )}
                <button
                  onClick={handleDeleteAllWordsClick}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-xs transition"
                >
                  {deleteStep === 0 ? '🗑 حذف کامل واژگان' : '⚠️ تأیید مرحله دوم: کاملاً مطمئنم'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
