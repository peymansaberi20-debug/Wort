import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight, MoreVertical, Info, Save, Palette, Cloud, ChevronLeft, Sparkles
} from 'lucide-react';

interface HeaderProps {
  onBack: () => void;
  onAbout: () => void;
  theme: 'light' | 'dark' | 'green';
  onToggleTheme: () => void;
  onSaveAndExit: () => void;
  canGoBack: boolean;
  onOpenCloud: () => void;
  cloudEmail?: string | null;
  onNavigate?: (target: string) => void;
  backupDue?: boolean;
  wordCount?: number;
}

/** Detects installed/standalone PWA mode (iOS & Android/desktop). */
const isStandalone = (): boolean =>
  typeof window !== 'undefined' && (
    (window as any).matchMedia?.('(display-mode: standalone)').matches ||
    (window as any).navigator?.standalone === true
  );

const THEME_LABEL: Record<string, string> = { light: 'روشن', dark: 'تیره', green: 'مطالعهٔ سبز' };

export const Header: React.FC<HeaderProps> = ({
  onBack, onAbout, theme, onToggleTheme, onSaveAndExit, canGoBack, onOpenCloud, cloudEmail, onNavigate, backupDue, wordCount
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    if (menuOpen) document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const go = (t: string) => { setMenuOpen(false); onNavigate?.(t); };
  
  // سرتیتر دسته‌بندی‌ها با طراحی کارت‌مانند و مدرن
  const sec = (t: string) => (
    <div className="px-4 pt-3.5 pb-1.5 text-[11px] font-extrabold text-slate-400 dark:text-slate-500 tracking-wider">
      {t}
    </div>
  );

  // آیتم‌های مدرن منو با کارت‌های کوچک، آیکون‌های رنگی و هاور نرم
  const row = (icon: string, label: string, desc: string, run: () => void, badge?: string) => (
    <button
      key={label}
      onClick={run}
      className="w-full px-3.5 py-2.5 my-0.5 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 active:bg-slate-100 transition text-right rounded-xl group"
    >
      <span className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800/80 group-hover:bg-blue-50 dark:group-hover:bg-blue-950/60 group-hover:text-blue-600 flex items-center justify-center text-lg flex-shrink-0 transition shadow-xs">
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">{label}</span>
        {desc && <span className="block text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{desc}</span>}
      </span>
      {badge && (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 flex-shrink-0 shadow-xs">
          {badge}
        </span>
      )}
    </button>
  );

  return (
    <header className="sticky top-0 z-20 bg-gradient-to-l from-[#6b4fd8] via-[#4a5ac9] to-[#1f5fbf] text-white shadow-lg flex items-center justify-between gap-2 px-3 md:px-5 h-16 md:h-[4.5rem]">
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute -top-10 -left-6 w-36 h-36 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-12 right-10 w-40 h-40 rounded-full bg-fuchsia-300/15 blur-2xl" />
      </div>
      {/* ── Brand ── */}
      <div className="relative flex items-center gap-2.5 min-w-0">
        {canGoBack && (
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-xl bg-white/15 hover:bg-white/25 transition flex items-center justify-center flex-shrink-0"
            title="بازگشت" aria-label="بازگشت"
          >
            <ArrowRight size={20} />
          </button>
        )}
        <div className="relative w-11 h-11 md:w-12 md:h-12 rounded-2xl bg-gradient-to-br from-white to-white/70 flex items-center justify-center flex-shrink-0 shadow-md">
          <span dir="ltr" className="font-sans font-black text-xl md:text-2xl bg-gradient-to-br from-[#1f5fbf] to-[#6b4fd8] bg-clip-text text-transparent leading-none">W</span>
          <Sparkles size={12} className="absolute -top-1 -right-1 text-amber-300" aria-hidden="true" />
        </div>
        <div className="flex flex-col min-w-0 overflow-hidden gap-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span dir="ltr" className="font-sans font-extrabold text-base md:text-lg tracking-tight truncate">WörterBuch</span>
            <span className="hidden md:inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-white/15 border border-white/25 text-white/90">
              <Sparkles size={10} /> AI-Powered
            </span>
          </div>
          <span className="text-[11px] md:text-xs text-white/85 truncate leading-tight font-medium">
            <span>واژه‌نامه آلمانی و فلش‌کارت</span>
            <span className="hidden md:inline text-white/40"> — </span>
            <span className="hidden md:inline">طراحی و توسعه: <span dir="ltr" className="font-medium">Peyman Saberi</span></span>
          </span>
        </div>
      </div>

      {/* ── Controls ── */}
      <div ref={menuRef} className="relative z-10 flex items-center gap-2 flex-shrink-0">
        {typeof wordCount === 'number' && (
          <span className="inline-flex items-center gap-1 h-8 px-2.5 rounded-full bg-white/15 border border-white/20 text-[11px] font-bold">
            <span aria-hidden="true">📚</span><span dir="ltr">{wordCount}</span>
          </span>
        )}
        <button
          onClick={() => setMenuOpen(v => !v)}
          className="relative w-10 h-10 rounded-xl bg-white/15 hover:bg-white/25 transition flex items-center justify-center flex-shrink-0"
          title="منو" aria-label="منوی اصلی" aria-expanded={menuOpen}
        >
          <MoreVertical size={20} />
          {backupDue && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-amber-400 border-2 border-[#4a5ac9]" />}
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-20 bg-black/40 backdrop-blur-xs md:bg-transparent" onClick={() => setMenuOpen(false)} />
            <div
              className="fixed md:absolute z-30 inset-x-3 md:inset-x-auto top-[4.25rem] md:top-full md:mt-2 md:left-0 md:w-80 max-h-[calc(100vh-5.5rem)] overflow-y-auto bg-white dark:bg-[#1b2029] border border-slate-200 dark:border-slate-700/80 rounded-3xl shadow-2xl p-2.5 space-y-1"
              dir="rtl"
            >
              {sec('حساب')}
              <div className="bg-slate-50/70 dark:bg-[#141923]/60 rounded-2xl p-1 border border-slate-100 dark:border-slate-800/80">
                {row('☁️', 'فضای ابری', cloudEmail ? cloudEmail : 'ورود و همگام‌سازی', () => { setMenuOpen(false); onOpenCloud(); })}
              </div>

              {sec('داده‌ها')}
              <div className="bg-slate-50/70 dark:bg-[#141923]/60 rounded-2xl p-1 border border-slate-100 dark:border-slate-800/80 space-y-0.5">
                {row('💾', 'ذخیره و پشتیبان‌گیری', 'پشتیبان کامل، CSV، Anki', () => go('backup'), backupDue ? 'یادآوری' : undefined)}
                {row('♻️', 'بازیابی پشتیبان', 'برگرداندن از فایل JSON', () => go('restore'))}
                {row('📥', 'ورود واژگان', 'Excel، CSV یا JSON', () => go('io'))}
              </div>

              {sec('تنظیمات')}
              <div className="bg-slate-50/70 dark:bg-[#141923]/60 rounded-2xl p-1 border border-slate-100 dark:border-slate-800/80 space-y-0.5">
                {row('🎨', 'پوسته', THEME_LABEL[theme], () => onToggleTheme())}
                {row('🃏', 'ظاهر و فلش‌کارت', 'جهت کارت و نمایش', () => go('set:appearance'))}
                {row('🎓', 'یادگیری و مرور', 'سقف روزانه، الگوریتم، تایمر', () => go('set:learning'))}
                {row('🔊', 'صدا و تلفظ', 'صدا، سرعت و لهجه', () => go('set:audio'))}
                {row('🎯', 'هدف روزانه و یادآوری', 'هدف و دورهٔ پشتیبان‌گیری', () => go('set:goal'))}
                {row('🤖', 'اتصال به هوش مصنوعی', 'کلید Gemini', () => go('set:ai'))}
                {row('⚙️', 'همهٔ تنظیمات', 'نمای کامل', () => go('set'))}
                {row('⚠️', 'مدیریت داده‌ها', 'پاک‌سازی سابقه و واژگان', () => go('set:data'))}
              </div>

              {sec('برنامه')}
              <div className="bg-slate-50/70 dark:bg-[#141923]/60 rounded-2xl p-1 border border-slate-100 dark:border-slate-800/80 space-y-0.5">
                {row('ℹ️', 'درباره برنامه', 'نسخه و سازنده', () => { setMenuOpen(false); onAbout(); })}
                <button
                  onClick={() => { setMenuOpen(false); if (!isStandalone()) { onSaveAndExit(); return; } setConfirmExit(true); }}
                  className="w-full px-3.5 py-2.5 my-0.5 flex items-center gap-3 hover:bg-red-50 dark:hover:bg-red-950/40 active:bg-red-100 transition text-right rounded-xl group text-red-600 dark:text-red-400"
                >
                  <span className="w-9 h-9 rounded-xl bg-red-100/70 dark:bg-red-950/60 flex items-center justify-center text-lg flex-shrink-0 transition shadow-xs">
                    <Save size={17} className="flex-shrink-0" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-bold">ذخیره و خروج</span>
                    <span className="block text-[10px] text-red-500/80 truncate mt-0.5">خروج امن از اپلیکیشن</span>
                  </span>
                </button>
              </div>

              <div className="text-center text-[10px] text-slate-400 dark:text-slate-500 pt-2 pb-1" dir="ltr">
                WörterBuch · Peyman Saberi
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── PWA exit confirm — portal to body ── */}
      {confirmExit && createPortal(
        <div className="fixed inset-0 z-[110] bg-black/60 flex items-center justify-center p-4" dir="rtl" role="alertdialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-3xl border border-amber-200 dark:border-amber-900 bg-white dark:bg-[#1b2029] p-6 shadow-2xl space-y-4">
            <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100">خروج از برنامه</h2>
            <p className="text-xs sm:text-sm leading-7 text-slate-700 dark:text-slate-200">
              داده‌های شما ذخیره شده است. آیا می‌خواهید از برنامه خارج شوید؟
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => {
                  setConfirmExit(false);
                  try { window.close(); } catch { /* ignore */ }
                  setTimeout(() => { if (!window.closed) onSaveAndExit(); }, 150);
                }}
                className="h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-xs"
              >
                تأیید خروج
              </button>
              <button
                onClick={() => setConfirmExit(false)}
                className="h-11 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold transition"
              >
                انصراف
              </button>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              این خروج فقط بستن برنامه است — حساب ابری شما فعال می‌ماند.
            </p>
          </div>
        </div>,
        document.body
      )}
    </header>
  );
};
