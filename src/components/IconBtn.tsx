import React from 'react';

/**
 * Standardized icon-only toolbar button (Phase 2 — Section 1).
 * Same size, shape and colors everywhere; Persian tooltip only (no visible text label).
 * Row order rule: exit/close is always the leftmost icon.
 */
export const IconBtn: React.FC<{
  onClick?: () => void;
  title: string;
  ariaLabel?: string;
  active?: boolean;   // highlighted state (e.g. timer enabled)
  danger?: boolean;   // destructive action (delete)
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ onClick, title, ariaLabel, active, danger, disabled, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-label={ariaLabel || title}
    className={`w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0 transition disabled:opacity-40 ${
      danger
        ? 'bg-red-50 hover:bg-red-100 text-[#b3261e] border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900 dark:hover:bg-red-900/60'
        : active
          ? 'bg-blue-50 text-[#1f5fbf] border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900'
          : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:border-slate-700'
    }`}
  >
    {children}
  </button>
);

export default IconBtn;
