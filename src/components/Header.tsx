import React from 'react';

interface HeaderProps {
  onBack: () => void;
  onAbout: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onSaveAndExit: () => void;
  canGoBack: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onBack,
  onAbout,
  theme,
  onToggleTheme,
  onSaveAndExit,
  canGoBack
}) => {
  return (
    <header className="sticky top-0 z-20 bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-4 py-2.5 shadow-md flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex flex-col min-w-0 overflow-hidden">
          <h1 className="text-sm md:text-base font-bold truncate flex items-center gap-1.5 leading-tight">
            <span dir="ltr" className="font-sans font-extrabold tracking-wide">WörterBuch</span>
            <span className="opacity-90 font-medium text-xs md:text-sm">: واژه‌نامه آلمانی و فلش کارت</span>
          </h1>
          <span className="text-[11px] md:text-xs text-white/80 font-normal truncate">
            طراحی و برنامه‌نویسی: پیمان صابری (<span dir="ltr">Peyman Saberi</span>)
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={onAbout}
          className="bg-white/15 hover:bg-white/25 rounded-lg px-2.5 py-1.5 text-xs md:text-sm transition flex items-center gap-1"
          title="درباره ما / About"
          aria-label="درباره ما"
        >
          ℹ️ <span className="hidden sm:inline">درباره ما</span>
        </button>
        <button
          onClick={onToggleTheme}
          className="bg-white/15 hover:bg-white/25 rounded-lg px-2.5 py-1.5 text-xs md:text-sm transition"
          title="تغییر پوسته"
          aria-label="تغییر پوسته"
        >
          {theme === 'dark' ? '☀️' : '🌓'}
        </button>
        <button
          onClick={onSaveAndExit}
          className="bg-white text-[#1f5fbf] hover:bg-slate-100 font-bold rounded-lg p-2 text-xs md:text-sm shadow-sm transition flex items-center justify-center"
          title="ذخیره و خروج / Save and Exit"
          aria-label="ذخیره و خروج"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4 md:w-5 md:h-5"
            aria-hidden="true"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    </header>
  );
};
