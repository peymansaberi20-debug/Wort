import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowRight, MoreVertical, Info, Save, Palette, Cloud, ChevronLeft
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
}

/** Detects installed/standalone PWA mode (iOS & Android/desktop). */
const isStandalone = (): boolean =>
  typeof window !== 'undefined' && (
    (window as any).matchMedia?.('(display-mode: standalone)').matches ||
    (window as any).navigator?.standalone === true
  );

const THEME_LABEL: Record<string, string> = { light: 'روشن', dark: 'تیره', green: 'مطالعهٔ سبز' };

export const Header: React.FC<HeaderProps> = ({
  onBack, onAbout, theme, onToggleTheme, onSaveAndExit, canGoBack, onOpenCloud, cloudEmail
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

  const menuItem = 'w-full px-3.5 h-12 flex items-center gap-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition text-right';

  return (
    <header className="sticky top-0 z-20 bg-gradient-to-r from-[#1f5fbf]/95 to-[#6b4fd8]/95 backdrop-blur-md text-white shadow-lg flex items-center justify-between gap-2 px-3 md:px-5 h-14 md:h-16">
      {/* Brand (start) */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-white/20 border border-white/25 flex items-center justify-center flex-shrink-0 shadow-inner">
          <span dir="ltr" className="font-sans font-extrabold text-base md:text-lg leading-none">W</span>
        </div>
        <div className="flex flex-col min-w-0 overflow-hidden">
          <h1 dir="ltr" className="text-sm md:text-base font-bold truncate text-left leading-tight">WörterBuch</h1>
          <span className="hidden md:block text-[11px] text-white/70 font-normal truncate">
            پلتفرم هوشمند یادگیری واژگان آلمانی • © 2025 Peyman Saberi
          </span>
        </div>
      </div>

      {/* Controls (end) */}
      <div ref={menuRef} className="flex items-center gap-1.5 flex-shrink-0 relative">
        {canGoBack && (
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-xl bg-white/15 hover:bg-white/25 transition flex items-center justify-center flex-shrink-0"
            title="بازگشت" aria-label="بازگشت"
          >
            <ArrowRight size={20} />
          </button>
        )}
        <button
          onClick={() => setMenuOpen(v => !v)}
          className="w-10 h-10 rounded-xl bg-white/15 hover:bg-white/25 transition flex items-center justify-center flex-shrink-0"
          title="منو" aria-label="منوی اصلی" aria-expanded={menuOpen}
        >
          <MoreVertical size={20} />
        </button>

        {menuOpen && (
          <div
            className="absolute top-full mt-2 left-0 w-64 bg-white dark:bg-[#1b2029] border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden z-30"
            dir="rtl"
          >
            <div className="px-3.5 pt-3 pb-1 text-[10px] font-bold text-[#5d6676] dark:text-[#a3adbd] tracking-wide">تنظیمات سریع</div>

            {/* Theme */}
            <button onClick={() => { onToggleTheme(); }} className={menuItem}>
              <Palette size={17} className="text-[#1f5fbf] flex-shrink-0" />
              <span className="flex-1 font-bold">پوسته</span>
              <span className="text-[11px] text-[#5d6676] dark:text-[#a3adbd] flex items-center gap-0.5">
                {THEME_LABEL[theme]} <ChevronLeft size={13} />
              </span>
            </button>

            {/* Cloud */}
            <button onClick={() => { setMenuOpen(false); onOpenCloud(); }} className={menuItem}>
              <span className="relative flex-shrink-0">
                <Cloud size={17} className="text-sky-600" />
                {cloudEmail && <span className="absolute -top-1 -left-1 w-2 h-2 rounded-full bg-emerald-500 border border-white" />}
              </span>
              <span className="flex-1 font-bold">فضای ابری</span>
              <span className="text-[11px] text-[#5d6676] dark:text-[#a3adbd] truncate max-w-[90px]" dir="ltr">
                {cloudEmail ? cloudEmail.split('@')[0] : 'ورود'}
              </span>
            </button>

            <div className="px-3.5 pt-2 pb-1 text-[10px] font-bold text-[#5d6676] dark:text-[#a3adbd] tracking-wide">برنامه</div>

            {/* About */}
            <button onClick={() => { setMenuOpen(false); onAbout(); }} className={menuItem}>
              <Info size={17} className="text-[#1f5fbf] flex-shrink-0" />
              <span className="flex-1 font-bold">درباره برنامه</span>
            </button>

            {/* Save and exit */}
            <button
              onClick={() => { setMenuOpen(false); if (!isStandalone()) { onSaveAndExit(); return; } setConfirmExit(true); }}
              className={menuItem + ' border-t border-slate-100 dark:border-slate-800'}
            >
              <Save size={17} className="text-[#1f5fbf] flex-shrink-0" />
              <span className="flex-1 font-bold">ذخیره و خروج</span>
            </button>
          </div>
        )}
      </div>

      {confirmExit && (
        <div className="fixed inset-0 z-[110] bg-black/60 flex items-center justify-center p-4" dir="rtl" role="alertdialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl border border-amber-200 dark:border-amber-900 bg-white dark:bg-[#1b2029] p-5 shadow-2xl space-y-3">
            <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100">خروج از برنامه</h2>
            <p className="text-sm leading-7 text-slate-700 dark:text-slate-200">
              داده‌های شما ذخیره شده است. آیا می‌خواهید از برنامه خارج شوید؟
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => {
                  setConfirmExit(false);
                  try { window.close(); } catch { /* ignore */ }
                  setTimeout(() => { if (!window.closed) onSaveAndExit(); }, 150);
                }}
                className="h-11 rounded-xl bg-[#1f5fbf] hover:bg-[#194ea0] text-white text-sm font-bold transition"
              >
                تأیید خروج
              </button>
              <button
                onClick={() => setConfirmExit(false)}
                className="h-11 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-bold transition"
              >
                انصراف
              </button>
            </div>
            <p className="text-[11px] text-[#5d6676] dark:text-[#a3adbd]">
              این خروج فقط بستن برنامه است — حساب ابری شما فعال می‌ماند.
            </p>
          </div>
        </div>
      )}
    </header>
  );
};
