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
    <header className="sticky top-0 z-20 bg-gradient-to-l from-[#6b4fd8] via-[#4a5ac9] to-[#1f5fbf] text-white shadow-lg flex items-center justify-between gap-2 px-3 md:px-5 h-16 md:h-[4.5rem]">
      {/* ── Brand ── */}
      <div className="flex items-center gap-2.5 min-w-0">
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
          <span className="text-[10px] md:text-[11px] text-white/75 truncate leading-tight">
            <span className="hidden sm:inline">پلتفرم هوشمند یادگیری واژگان آلمانی</span>
            <span className="hidden md:inline text-white/40"> — </span>
            <span className="hidden md:inline">طراحی و توسعه: <span dir="ltr" className="font-medium">Peyman Saberi</span></span>
            <span className="md:hidden">Peyman Saberi</span>
          </span>
        </div>
      </div>

      {/* ── Controls ── */}
      <div ref={menuRef} className="flex items-center gap-1.5 flex-shrink-0 relative">
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
            <button onClick={() => onToggleTheme()} className={menuItem}>
              <Palette size={17} className="text-[#1f5fbf] flex-shrink-0" />
              <span className="flex-1 font-bold">پوسته</span>
              <span className="text-[11px] text-[#5d6676] dark:text-[#a3adbd] flex items-center gap-0.5">
                {THEME_LABEL[theme]} <ChevronLeft size={13} />
              </span>
            </button>
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
            <button onClick={() => { setMenuOpen(false); onAbout(); }} className={menuItem}>
              <Info size={17} className="text-[#1f5fbf] flex-shrink-0" />
              <span className="flex-1 font-bold">درباره برنامه</span>
            </button>
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

      {/* ── PWA exit confirm — portal to body (independent of header stacking) ── */}
      {confirmExit && createPortal(
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
        </div>,
        document.body
      )}
    </header>
  );
};
