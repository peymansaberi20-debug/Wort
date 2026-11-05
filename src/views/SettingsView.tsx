import React, { useState, useEffect, useMemo } from 'react';
import { AppSettings, Word } from '../types';
import { getCategories } from '../utils/storage';
import { getGermanVoices, speak, stopSpeaking } from '../utils/audio';
import { GeminiKeyCard } from '../components/GeminiKeyCard';
import { PROVIDERS, describeAiError, getActiveProvider, getApiKey, getModel, testConnection } from '../utils/aiProvider';

interface SettingsViewProps {
  settings: AppSettings;
  words: Word[];
  onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
  onClearHistory: () => void;
  onClearAllWords: () => void;
  onShowToast: (msg: string, isErr?: boolean) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
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

  return (
    <div className="space-y-5 text-right max-w-3xl mx-auto pb-10">
      {/* ========================================================= */}
      {/* 1. Appearance & Flashcard Direction (Section 2) */}
      {/* ========================================================= */}
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 md:p-5 shadow-xs space-y-4">
        <h3 className="font-bold text-base md:text-lg flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 text-slate-900 dark:text-slate-100">
          <span>🎨</span> پوسته و جهت فلش‌کارت‌ها
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs md:text-sm">
          <div>
            <label className="block font-bold mb-1.5 text-slate-800 dark:text-slate-200">
              پوستهٔ برنامه:
            </label>
            <select
              value={settings.theme || 'light'}
              onChange={e => onUpdateSettings({ theme: e.target.value as 'light' | 'dark' })}
              className="w-full bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2.5 outline-none font-medium"
            >
              <option value="light">☀️ روشن (پیش‌فرض)</option>
              <option value="dark">🌙 تیره (Dark Mode)</option>
            </select>
          </div>

          <div>
            <label className="block font-bold mb-1.5 text-slate-800 dark:text-slate-200">
              جهت پیش‌فرض نمایش فلش‌کارت‌ها:
            </label>
            <select
              value={settings.dir || 'de'}
              onChange={e => onUpdateSettings({ dir: e.target.value as 'de' | 'fa' | 'rand' })}
              className="w-full bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2.5 outline-none font-medium"
            >
              <option value="de">🇩🇪 آلمانی ← فارسی</option>
              <option value="fa">🇮🇷 فارسی ← آلمانی</option>
              <option value="rand">🔀 جهت تصادفی برای هر کارت (مستقل)</option>
            </select>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. Daily Learning Limits & Session Order (Section 3) */}
      {/* ========================================================= */}
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 md:p-5 shadow-xs space-y-4">
        <h3 className="font-bold text-base md:text-lg flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 text-slate-900 dark:text-slate-100">
          <span>📊</span> محدودیت‌های روزانه و ترتیب جلسه
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs md:text-sm">
          <div>
            <label className="block font-bold mb-1.5 text-slate-800 dark:text-slate-200">
              سهمیه کلمه جدید در روز:
            </label>
            <input
              type="number"
              min={0}
              max={500}
              value={settings.nw ?? 10}
              onChange={e => onUpdateSettings({ nw: Math.max(0, Math.min(500, parseInt(e.target.value) || 0)) })}
              className="w-full bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 outline-none font-medium text-center"
            />
            <span className="text-[11px] text-[#5d6676] dark:text-[#a3adbd] block mt-1">۰ تا ۵۰۰ (۰ = بدون لغت جدید)</span>
          </div>

          <div>
            <label className="block font-bold mb-1.5 text-slate-800 dark:text-slate-200">
              حداکثر مرور در روز:
            </label>
            <input
              type="number"
              min={0}
              max={500}
              value={settings.rv ?? 20}
              onChange={e => onUpdateSettings({ rv: Math.max(0, Math.min(500, parseInt(e.target.value) || 0)) })}
              className="w-full bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 outline-none font-medium text-center"
            />
            <span className="text-[11px] text-[#5d6676] dark:text-[#a3adbd] block mt-1">۰ تا ۵۰۰ (۰ = بدون محدودیت مرور)</span>
          </div>

          <div>
            <label className="block font-bold mb-1.5 text-slate-800 dark:text-slate-200">
              ترتیب چینش کارت‌ها:
            </label>
            <select
              value={settings.order || 'due'}
              onChange={e => onUpdateSettings({ order: e.target.value as any })}
              className="w-full bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 outline-none font-medium"
            >
              <option value="due">🔁 اول سررسیدها، سپس جدیدها</option>
              <option value="new">🌟 اول واژگان جدید</option>
              <option value="mix">🔀 ترکیب یکی‌درمیان (سررسید و جدید)</option>
              <option value="rand">🎲 چینش کاملاً تصادفی</option>
            </select>
          </div>
        </div>

        {/* Category Filter for Study Session (3.4) */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
          <label className="block font-bold text-xs md:text-sm mb-2 text-slate-800 dark:text-slate-200">
            فیلتر دسته‌های فعال در جلسات روزانه:
          </label>
          <p className="text-[11px] text-[#5d6676] dark:text-[#a3adbd] mb-2">
            در صورت عدم انتخاب، واژگان تمامی دسته‌ها در مطالعه روزانه شرکت می‌کنند.
          </p>

          <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-2 bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl">
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
                    className={`px-3 py-1 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-[#1f5fbf] text-white shadow-xs'
                        : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <span>{isSelected ? '✓' : '+'}</span>
                    <span>{catName}</span>
                    <span className="opacity-70 text-[10px]">({count})</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 3. Review Algorithm & Difficult Words (Section 4) */}
      {/* ========================================================= */}
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 md:p-5 shadow-xs space-y-4">
        <h3 className="font-bold text-base md:text-lg flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 text-slate-900 dark:text-slate-100">
          <span>🧠</span> الگوریتم تکرار فاصله‌دار و واژه‌های دشوار
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs md:text-sm">
          <div>
            <label className="block font-bold mb-1.5 text-slate-800 dark:text-slate-200">
              ضریب فاصلهٔ مرور (ivlMod):
            </label>
            <select
              value={settings.ivlMod ?? 1}
              onChange={e => onUpdateSettings({ ivlMod: parseFloat(e.target.value) || 1 })}
              className="w-full bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 outline-none font-medium"
            >
              <option value="0.8">0.8 (حالت سخت‌گیرانه - فواصل کوتاه‌تر)</option>
              <option value="1">1.0 (حالت عادی استاندارد)</option>
              <option value="1.25">1.25 (حالت آسان‌تر - فواصل طولانی‌تر)</option>
            </select>
          </div>

          <div>
            <label className="block font-bold mb-1.5 text-slate-800 dark:text-slate-200">
              آستانهٔ خطای واژهٔ دشوار (leechN):
            </label>
            <input
              type="number"
              min={2}
              max={20}
              value={settings.leechN ?? 4}
              onChange={e => onUpdateSettings({ leechN: Math.max(2, Math.min(20, parseInt(e.target.value) || 4)) })}
              className="w-full bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 outline-none font-medium text-center"
            />
            <span className="text-[11px] text-[#5d6676] dark:text-[#a3adbd] block mt-1">تعداد خطاهای مکرر (۲ تا ۲۰)</span>
          </div>

          <div>
            <label className="block font-bold mb-1.5 text-slate-800 dark:text-slate-200">
              واکنش به واژه‌های دشوار:
            </label>
            <select
              value={settings.leechAct || 'mark'}
              onChange={e => onUpdateSettings({ leechAct: e.target.value as 'mark' | 'suspend' })}
              className="w-full bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 outline-none font-medium"
            >
              <option value="mark">فقط نشانه‌گذاری با 🩸 (بدون تعلیق)</option>
              <option value="suspend">نشانه‌گذاری و تعلیق از جلسات روزانه</option>
            </select>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 4. Flashcard Timer (Section 5) */}
      {/* ========================================================= */}
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 md:p-5 shadow-xs space-y-4">
        <h3 className="font-bold text-base md:text-lg flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 text-slate-900 dark:text-slate-100">
          <span>⏱️</span> تایمر تمرین‌ها
        </h3>

        <p className="text-xs md:text-sm leading-7 text-[#5d6676] dark:text-[#a3adbd]">
          تایمر هر تمرین جداگانه تنظیم می‌شود: داخل هر تمرین، آیکن ⏱ را در نوار بالا (قبل از آیکن شناسنامهٔ واژه) بزنید، تایمر را روشن یا خاموش کنید و مدت آن را تعیین کنید. تنظیم هر تمرین ذخیره می‌ماند. «تمرین ترکیبی واژه‌های سخت» از تایمر همان تمرین اصلی هر سؤال پیروی می‌کند.
        </p>
      </div>

      {/* ========================================================= */}
      {/* 5. Pronunciation and Audio Settings (Section 6) */}
      {/* ========================================================= */}
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 md:p-5 shadow-xs space-y-4">
        <h3 className="font-bold text-base md:text-lg flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 text-slate-900 dark:text-slate-100">
          <span>🔊</span> تلفظ و تنظیمات صوتی آلمانی
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs md:text-sm">
          <div>
            <label className="block font-bold mb-1.5 text-slate-800 dark:text-slate-200">
              لهجهٔ آلمانی (منطقه):
            </label>
            <select
              value={settings.vreg || ''}
              onChange={e => onUpdateSettings({ vreg: e.target.value })}
              className="w-full bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 outline-none font-medium"
            >
              <option value="">خودکار / پیش‌فرض سیستم</option>
              <option value="de-DE">آلمانی آلمان (de-DE)</option>
              <option value="de-AT">آلمانی اتریش (de-AT)</option>
              <option value="de-CH">آلمانی سوئیس (de-CH)</option>
            </select>
          </div>

          <div>
            <label className="block font-bold mb-1.5 text-slate-800 dark:text-slate-200">
              صدای گوینده (Speech Voice):
            </label>
            <select
              value={settings.voice || ''}
              onChange={e => onUpdateSettings({ voice: e.target.value })}
              className="w-full bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 outline-none font-medium"
            >
              <option value="">انتخاب خودکار صدای آلمانی</option>
              {availableVoices.map(v => (
                <option key={v.name} value={v.name}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-bold mb-1.5 text-slate-800 dark:text-slate-200">
              سرعت گفتار: {settings.rate ?? 0.85}x
            </label>
            <input
              type="range"
              min={0.5}
              max={1.1}
              step={0.05}
              value={settings.rate ?? 0.85}
              onChange={e => onUpdateSettings({ rate: parseFloat(e.target.value) || 0.85 })}
              className="w-full accent-[#1f5fbf] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>0.5x (آهسته)</span>
              <span>0.85x</span>
              <span>1.1x (سریع)</span>
            </div>
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <label className="flex items-center gap-2.5 cursor-pointer text-xs md:text-sm font-semibold select-none">
            <input
              type="checkbox"
              checked={!!settings.auto}
              onChange={e => onUpdateSettings({ auto: e.target.checked })}
              className="w-4 h-4 rounded text-[#1f5fbf] accent-[#1f5fbf] cursor-pointer"
            />
            <span>پخش خودکار تلفظ کلمه هنگام باز شدن کارت</span>
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer text-xs md:text-sm font-semibold select-none">
            <input
              type="checkbox"
              checked={!!settings.autoEx}
              onChange={e => onUpdateSettings({ autoEx: e.target.checked })}
              className="w-4 h-4 rounded text-[#1f5fbf] accent-[#1f5fbf] cursor-pointer"
            />
            <span>خواندن جملهٔ مثال پس از پایان تلفظ واژه (در صورت وجود مثال)</span>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
          <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleTestVoice}
            className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 px-4 py-2 rounded-xl text-xs md:text-sm font-bold flex items-center gap-2 transition"
          >
            <span>🔊</span>
            <span>تست صدا (Test Voice)</span>
          </button>
          <button
            type="button"
            onClick={() => setIsVoiceGuideOpen(true)}
            className="bg-blue-50 hover:bg-blue-100 text-[#1f5fbf] dark:bg-blue-950/50 dark:hover:bg-blue-900/60 dark:text-[#a9cbff] border border-blue-200 dark:border-blue-800 px-4 py-2 rounded-xl text-xs md:text-sm font-bold transition"
          >
            راهنمای نصب و طبیعی کردن صدا
          </button>
          </div>
          <span className="text-[11px] text-[#5d6676] dark:text-[#c0c8d5]">
            عبارت تستی: «Guten Tag! Ich lerne Deutsch in Wien.»
          </span>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 6. Daily Goal & Backup Reminder (Section 7) */}
      {/* ========================================================= */}
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 md:p-5 shadow-xs space-y-4">
        <h3 className="font-bold text-base md:text-lg flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3 text-slate-900 dark:text-slate-100">
          <span>🎯</span> هدف روزانه و یادآوری پشتیبان‌گیری
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs md:text-sm">
          <div>
            <label className="block font-bold mb-1.5 text-slate-800 dark:text-slate-200">
              هدف مطالعه روزانه (تعداد کارت):
            </label>
            <input
              type="number"
              min={0}
              max={500}
              value={settings.goal ?? 20}
              onChange={e => onUpdateSettings({ goal: Math.max(0, Math.min(500, parseInt(e.target.value) || 0)) })}
              className="w-full bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 outline-none font-medium text-center"
            />
            <span className="text-[11px] text-[#5d6676] dark:text-[#a3adbd] block mt-1">۰ تا ۵۰۰ (۰ = غیرفعال)</span>
          </div>

          <div>
            <label className="block font-bold mb-1.5 text-slate-800 dark:text-slate-200">
              دوره یادآوری پشتیبان‌گیری:
            </label>
            <select
              value={settings.bkDays ?? 7}
              onChange={e => onUpdateSettings({ bkDays: parseInt(e.target.value) || 0 })}
              className="w-full bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 outline-none font-medium"
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

      {/* ========================================================= */}
      {/* 7. Gemini AI Integration (Server-Side) */}
      {/* ========================================================= */}
      {isVoiceGuideOpen && (
        <div
          className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5"
          onMouseDown={event => { if (event.target === event.currentTarget) setIsVoiceGuideOpen(false); }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="voice-guide-title" dir="rtl" className="w-full max-w-2xl max-h-[85dvh] overflow-y-auto bg-white dark:bg-[#1b2029] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-700 pb-3 mb-4">
              <div>
                <h2 id="voice-guide-title" className="text-base sm:text-lg font-extrabold">راهنمای نصب و طبیعی کردن صدا</h2>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">نام منوها بسته به نسخهٔ سیستم‌عامل و دستگاه ممکن است کمی متفاوت باشد.</p>
              </div>
              <button type="button" autoFocus onClick={() => setIsVoiceGuideOpen(false)} aria-label="بستن راهنما" className="shrink-0 rounded-lg px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-sm font-bold">✕ بستن</button>
            </div>
            <p className="text-sm leading-7 mb-4">برنامه از صداهای آلمانی نصب‌شده روی دستگاه استفاده می‌کند. کیفیت و دسترسی به صداها به سیستم‌عامل، مرورگر و صداهایی که مرورگر در اختیار برنامه می‌گذارد بستگی دارد؛ برنامه نمی‌تواند صدایی را که مرورگر ارائه نمی‌کند مستقیماً انتخاب کند.</p>
            <div className="space-y-3 text-sm leading-7">
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3"><b>📱 آیفون و آیپد</b><p>Settings → Accessibility → Spoken Content → Voices → German. اگر گزینهٔ Enhanced یا Premium موجود بود، آن را دانلود کنید.</p></div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3"><b>🤖 اندروید</b><p>Settings → System → Languages &amp; input → Text-to-speech output. موتور گفتار Google را انتخاب کنید و در تنظیمات آن، دادهٔ صدای آلمانی را نصب کنید.</p></div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3"><b>🪟 ویندوز</b><p>Microsoft Edge ممکن است در صورت پشتیبانی، صداهای آنلاین با کیفیت بالاتر ارائه کند. در Windows 11 مسیر Settings → Time &amp; language → Speech → Manage voices → Add voices → German را بررسی کنید.</p></div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3"><b>🍎 macOS</b><p>System Settings → Accessibility → Spoken Content → System voice → Manage Voices. در صورت وجود، صدای آلمانی با کیفیت بالاتر را دانلود کنید.</p></div>
            </div>
            <div className="mt-4 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 p-3 text-sm leading-7">
              برای صدای طبیعی‌تر، سرعت را حدود <b dir="ltr">0.8–0.9</b> تنظیم کنید، از دکمهٔ «تست صدا» استفاده کنید و پس از نصب صدای جدید، صفحهٔ برنامه را تازه‌سازی کنید. نام یا کیفیت مشخصی از صدا در همهٔ دستگاه‌ها تضمین‌شده نیست.
            </div>
          </section>
        </div>
      )}

      <GeminiKeyCard />

      {/* ========================================================= */}
      {/* 8. Data Management & Destructive Actions (Section 8) */}
      {/* ========================================================= */}
      <div className="bg-white dark:bg-[#1b2029] border border-red-200 dark:border-red-900/60 rounded-2xl p-4 md:p-5 shadow-xs space-y-4">
        <h3 className="font-bold text-base md:text-lg flex items-center gap-2 border-b border-red-100 dark:border-red-950 pb-3 text-red-700 dark:text-red-400">
          <span>⚠️</span> مدیریت داده‌ها و عملیات حساس
        </h3>
        <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">
          لطفاً پیش از انجام این عملیات، در صورت نیاز از تب «ورود و صدور» یک فایل پشتیبان دریافت کنید.
        </p>

        <div className="space-y-3 pt-2">
          {/* Action 1: Clear Review History (8.1) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-[#141923] border border-slate-200 dark:border-slate-800">
            <div>
              <b className="text-xs md:text-sm text-slate-900 dark:text-slate-100 block">
                پاک کردن سابقهٔ مرور (Reset Review History)
              </b>
              <span className="text-[11px] text-[#5d6676] dark:text-[#a3adbd]">
                واژه‌ها حفظ می‌شوند؛ فواصل، آمار درست/غلط و مراحل یادگیری صفر می‌شوند.
              </span>
            </div>
            <button
              onClick={handleClearHistoryClick}
              className="bg-amber-100 hover:bg-amber-200 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200 px-4 py-2 rounded-xl text-xs font-bold transition flex-shrink-0"
            >
              🔄 پاک کردن سابقه مرور
            </button>
          </div>

          {/* Action 2: Delete All Vocabulary (8.2 - 2 steps) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-red-50/60 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40">
            <div>
              <b className="text-xs md:text-sm text-red-800 dark:text-red-300 block">
                حذف کامل واژگان (Delete All Vocabulary)
              </b>
              <span className="text-[11px] text-red-600/80 dark:text-red-400/80">
                کلیه لغات، دسته‌ها و سوابق به طور برگشت‌ناپذیر حذف می‌شوند. نیازمند دو مرحله تأیید.
              </span>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {deleteStep === 1 && (
                <button
                  onClick={() => setDeleteStep(0)}
                  className="bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-xl text-xs font-semibold"
                >
                  انصراف
                </button>
              )}
              <button
                onClick={handleDeleteAllWordsClick}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-xs transition"
              >
                {deleteStep === 0 ? '🗑 حذف کامل واژگان' : '⚠️ تأیید مرحله دوم: کاملاً مطمئنم'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
