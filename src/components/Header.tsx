import React, { useState, useEffect, useRef } from 'react';
import { Cloud, ArrowRight, MoreVertical, Info, Save } from 'lucide-react';

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

export const Header: React.FC<HeaderProps> = ({
  onBack,
  onAbout,
  theme,
  onToggleTheme,
  onSaveAndExit,
  canGoBack,
  onOpenCloud,
  cloudEmail
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    if (menuOpen) document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const iconBtn = 'w-10 h-10 bg-white hover:bg-slate-100 text-[#1f5fbf] rounded-xl transition flex items-center justify-center shadow-sm flex-shrink-0';

  return (
    <header className="sticky top-0 z-20 bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-3 md:px-4 py-2.5 shadow-md flex items-center justify-between gap-2">
      {/* Start (RTL: right) — back arrow + brand */}
      <div className="flex items-center gap-1.5 min-w-0">
        {canGoBack && (
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-xl bg-white/15 hover:bg-white/25 transition flex items-center justify-center flex-shrink-0"
            title="بازگشت"
            aria-label="بازگشت"
          >
            <ArrowRight size={20} />
          </button>
        )}
        <div className="flex flex-col min-w-0 overflow-hidden">
          <h1 className="text-sm md:text-base font-bold truncate flex items-center gap-1.5 leading-tight">
            <span dir="ltr" className="font-sans font-extrabold tracking-wide">WörterBuch</span>
            <span className="hidden sm:inline opacity-90 font-medium text-xs md:text-sm">— پلتفرم هوشمند یادگیری واژگان آلمانی</span>
          </h1>
          <span className="text-[11px] md:text-xs text-white/70 font-normal truncate">
            طراحی و توسعه: <span dir="ltr" className="font-medium">Peyman Saberi</span> • © 2025 تمام حقوق محفوظ است
          </span>
        </div>
      </div>

      {/* End (RTL: left) — theme, cloud avatar-chip, overflow menu */}
      <div ref={menuRef} className="flex items-center gap-1.5 flex-shrink-0 relative">
        <button
          onClick={onToggleTheme}
          className={iconBtn}
          title={theme === 'light' ? 'حالت تیره' : theme === 'dark' ? 'حالت مطالعهٔ سبز' : 'حالت روشن'}
          aria-label="تغییر پوسته"
        >
          {theme === 'light' ? '🌓' : theme === 'dark' ? '🌿' : '☀️'}
        </button>
        <button
          onClick={onOpenCloud}
          className={iconBtn + ' relative'}
          title={cloudEmail ? `حساب ابری: ${cloudEmail}` : 'ورود و همگام‌سازی ابری'}
          aria-label="حساب ابری"
        >
          {cloudEmail ? (
            <span className="w-6 h-6 rounded-full bg-sky-600 text-white text-[11px] font-bold flex items-center justify-center font-sans">
              {(cloudEmail[0] || '?').toUpperCase()}
            </span>
          ) : (
            <Cloud size={18} className="text-sky-600" />
          )}
          {cloudEmail && <span className="absolute -top-0.5 -left-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />}
        </button>
        <button
          onClick={() => setMenuOpen(v => !v)}
          className={iconBtn}
          title="منو"
          aria-label="منوی بیشتر"
          aria-expanded={menuOpen}
        >
          <MoreVertical size={18} />
        </button>
        {menuOpen && (
          <div
            className="absolute top-full mt-2 left-0 w-48 bg-white dark:bg-[#1b2029] border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden z-30"
            dir="rtl"
          >
            <button
              onClick={() => { setMenuOpen(false); onAbout(); }}
              className="w-full h-11 px-3 flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              <Info size={16} className="text-[#1f5fbf]" /> درباره برنامه
            </button>
            <button
              onClick={() => { setMenuOpen(false); onSaveAndExit(); }}
              className="w-full h-11 px-3 flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition border-t border-slate-100 dark:border-slate-800"
            >
              <Save size={16} className="text-[#1f5fbf]" /> ذخیره و خروج
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
