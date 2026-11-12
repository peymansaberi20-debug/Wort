import React from 'react';

interface PageOverlayProps { title: string; icon: string; subtitle?: string; onClose: () => void; children: React.ReactNode; }

/** Full-screen page used by the ⋮ menu (backup, restore, import, settings). Close button sits on the left. */
export const PageOverlay: React.FC<PageOverlayProps> = ({ title, icon, subtitle, onClose, children }) => (
  <div className="fixed inset-0 z-[45] overflow-y-auto bg-[#f6f7fb] dark:bg-[#12151c] text-[#1d2330] dark:text-[#eef1f6] font-sans" dir="rtl">
    <div className="sticky top-0 z-10 bg-gradient-to-l from-[#6b4fd8] via-[#4a5ac9] to-[#1f5fbf] text-white shadow-lg flex items-center gap-3 px-3 h-14">
      <span className="text-2xl">{icon}</span>
      <div className="flex-1 min-w-0">
        <h1 className="font-extrabold text-base truncate">{title}</h1>
        {subtitle && <p className="text-[11px] text-white/75 truncate">{subtitle}</p>}
      </div>
      <button onClick={onClose} aria-label="بستن" title="بستن" className="w-10 h-10 rounded-xl bg-white/15 hover:bg-white/25 text-xl flex items-center justify-center flex-shrink-0">✕</button>
    </div>
    <div className="max-w-3xl mx-auto p-3 md:p-5 pb-24">{children}</div>
  </div>
);
