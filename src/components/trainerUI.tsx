/**
 * trainerUI.tsx — پوستهٔ بصری مشترک همهٔ تمرین‌های گرامر (درخواست یکدست‌سازی)
 *
 * همهٔ تمرین‌های زیرمجموعهٔ گرامر (متن جای‌خالی، حرف ربط انتخابی، جای‌خالی فعل+حرف اضافه،
 * تکمیل جمله، چیدن جمله، فعل+حرف اضافه، داستان زمان‌ها) از همین اجزا استفاده می‌کنند تا
 * شروع تمرین، انتخاب سطح/تعداد/موضوع، دکمهٔ ساخت و آرشیو، همه‌جا دقیقاً یک شکل باشند:
 *   - Section      : ردیف شماره‌دار پیکربندی («۱. سطح»، «۲. تعداد»، …)
 *   - LevelChips   : انتخاب سطح — گزینه‌های کوچک همیشه در یک خط
 *   - CountChips   : انتخاب تعداد
 *   - TopicInput   : موضوع اختیاری + چیپ‌های آماده
 *   - PrimaryBtn   : دکمهٔ اصلی «ساخت تمرین» (بعد از انتخاب‌ها)
 *   - ArchivePanel : آرشیو یکدست — جمع‌شونده، با ردیف‌های ArchiveRow
 *   - useConfirm   : تأییدیهٔ حذف (هیچ چیزی بدون پرسش پاک نمی‌شود)
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';

export const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
export const toFa = (n: number | string): string => String(n).replace(/[0-9]/g, (d) => FA_DIGITS[+d]);
export const faDate = (ts: number): string => {
  try { return new Date(ts).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }); }
  catch { return new Date(ts).toLocaleDateString(); }
};

/* ───────────────────────── پیش‌نمایش چاپ مشترک ─────────────────────────
 * همهٔ تمرین‌هایی که چاپ دارند از همین یک نمای استفاده می‌کنند (درخواست کاربر):
 *   - اورلی تمام‌صفحه با «🖨 چاپ / PDF» و «✕ بستن» بالای صفحه
 *   - صفحهٔ ۱ = سؤال‌ها با جای کافی برای نوشتن با خودکار
 *   - صفحهٔ ۲ = پاسخنامه (Lösungen)
 *   - جمله‌های آلمانی چپ‌به‌راست، توضیح فارسی خط مستقل راست‌به‌چپ
 *   - بدون صفحهٔ خالی اضافی در انتهای چاپ
 * راه چاپ: Portal به body + پنهان‌کردن هر چیز غیر از .wpr-screen در print —
 * همین باعث می‌شود نوارها و هدر برنامه داخل برگه چاپ نشوند (باگ تصویر ۱۵). */

export const PRINT_PREVIEW_CSS = `
.wpr-screen { position: fixed; inset: 0; z-index: 1000; background: #3f4753; overflow-y: auto; -webkit-overflow-scrolling: touch; }
.wpr-bar { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: #1f2937; color: #fff; flex-wrap: wrap; }
.wpr-btn { border-radius: 10px; padding: 8px 14px; font-size: 12px; font-weight: 700; background: rgba(255,255,255,.14); color: #fff; }
.wpr-btn-primary { background: #1f5fbf; }
.wpr-hint { font-size: 11px; opacity: .85; margin-inline-start: auto; }
.wpr-pages { max-width: 780px; margin: 18px auto 48px; padding: 0 10px; }
.wpr-page { background: #fff; color: #111; padding: 42px 46px; min-height: 1010px; box-shadow: 0 3px 18px rgba(0,0,0,.45); margin-bottom: 20px; }
.wpr-head { border-bottom: 2px solid #1f5fbf; padding-bottom: 8px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.wpr-title { font-size: 15px; font-weight: 800; }
.wpr-meta { font-size: 10.5px; color: #555; }
@media print {
  body > *:not(.wpr-screen) { display: none !important; }
  .wpr-screen { position: static !important; background: #fff !important; overflow: visible !important; }
  .wpr-bar { display: none !important; }
  .wpr-pages { max-width: none; margin: 0; padding: 0; }
  .wpr-page { box-shadow: none; margin: 0 !important; padding: 0 !important; min-height: 0 !important; }
  .wpr-page:not(:last-child) { page-break-after: always; break-after: page; }
  @page { size: A4; margin: 13mm 13mm; }
}
.wpr-screen, .wpr-screen * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
`;

/** سبک‌های متن داخل برگه — همهٔ تمرین‌ها یک شکل: آلمانی LTR چپ‌چین، فارسی RTL راست‌چین */
export const prG = (extra?: React.CSSProperties): React.CSSProperties =>
  ({ direction: 'ltr' as const, unicodeBidi: 'embed', textAlign: 'left', ...extra });
export const prFa = (extra?: React.CSSProperties): React.CSSProperties =>
  ({ direction: 'rtl' as const, unicodeBidi: 'embed', textAlign: 'right', ...extra });

export const PrintPreview: React.FC<{
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  meta?: React.ReactNode;
  questions: React.ReactNode;
  solutions?: React.ReactNode;
  solutionsMeta?: React.ReactNode;
  hint?: string;   // متن راهنمای نوار بالای پیش‌نمایش (اختیاری — برای تمرین‌های بدون پاسخنامه)
}> = ({ open, onClose, title, meta, questions, solutions, solutionsMeta, hint }) => {
  if (!open) return null;
  return createPortal(
    <div className="wpr-screen" role="dialog" aria-modal="true" dir="rtl">
      <style>{PRINT_PREVIEW_CSS}</style>
      <div className="wpr-bar">
        <button onClick={onClose} className="wpr-btn">✕ بستن</button>
        <button onClick={() => window.print()} className="wpr-btn wpr-btn-primary">🖨 چاپ / PDF</button>
        <span className="wpr-hint">{hint || 'پیش‌نمایش چاپ — صفحهٔ ۱ سؤال‌ها با جای نوشتن، صفحهٔ ۲ پاسخنامه'}</span>
      </div>
      <div className="wpr-pages">
        <div className="wpr-page">
          <div className="wpr-head">
            <div className="wpr-title">{title}</div>
            {meta && <div className="wpr-meta">{meta}</div>}
          </div>
          {questions}
        </div>
        {solutions && (
          <div className="wpr-page">
            <div className="wpr-head">
              <div className="wpr-title">Lösungen — پاسخنامه</div>
              {solutionsMeta || meta}
            </div>
            {solutions}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

/* ───────────────────────── تأییدیهٔ حذف ───────────────────────── */

export const ConfirmDialog: React.FC<{
  title: string;
  message: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ title, message, confirmLabel, onCancel, onConfirm }) => createPortal(
  <div
    className="fixed inset-0 z-[1001] bg-black/60 flex items-center justify-center p-4"
    role="presentation"
    onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
  >
    <section
      role="alertdialog"
      aria-modal="true"
      className="w-full max-w-sm rounded-2xl border border-red-200 dark:border-red-900 bg-white dark:bg-[#1b2029] p-5 shadow-2xl text-right"
      dir="rtl"
    >
      <h2 className="text-base font-extrabold text-red-700 dark:text-red-300 mb-2">{title}</h2>
      <p className="text-sm leading-7 text-slate-700 dark:text-slate-200">{message}</p>
      <div className="mt-4 flex gap-2">
        <button onClick={onCancel} className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700">انصراف</button>
        <button onClick={onConfirm} className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold bg-red-600 hover:bg-red-700 text-white">{confirmLabel || 'بله، حذف شود'}</button>
      </div>
    </section>
  </div>,
  document.body
);

/** هوک تأییدیه: const { ask, dialog } = useConfirm();  if (await ask('…','…')) … ; رندر {dialog} */
export function useConfirm(): {
  ask: (title: string, message: string, confirmLabel?: string) => Promise<boolean>;
  dialog: React.ReactElement | null;
} {
  const [state, setState] = useState<{ title: string; message: string; label?: string; resolve: (v: boolean) => void } | null>(null);
  const ask = (title: string, message: string, confirmLabel?: string): Promise<boolean> =>
    new Promise<boolean>(resolve => setState({ title, message, label: confirmLabel, resolve }));
  const dialog = state ? (
    <ConfirmDialog
      title={state.title}
      message={state.message}
      confirmLabel={state.label}
      onCancel={() => { setState(null); state.resolve(false); }}
      onConfirm={() => { setState(null); state.resolve(true); }}
    />
  ) : null;
  return { ask, dialog };
}

/* ───────────────────────── اجزای پیکربندی ───────────────────────── */

const CHIP_ON = 'bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white border-transparent shadow-sm';
const CHIP_OFF = 'bg-slate-50 dark:bg-[#141923] border-[#dde1ea] dark:border-[#333b4a] text-slate-700 dark:text-slate-200 hover:border-[#1f5fbf]/50';
export const chipCls = (active: boolean): string => `rounded-xl font-bold border transition ${active ? CHIP_ON : CHIP_OFF}`;

export const Section: React.FC<{
  n: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ n, label, hint, disabled, children }) => (
  <div className={disabled ? 'opacity-45 pointer-events-none select-none' : ''}>
    <div className="text-xs font-bold text-[#5d6676] dark:text-[#a3adbd] mb-1.5 flex items-center gap-1.5">
      <span className="w-5 h-5 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-extrabold flex-shrink-0">{n}</span>
      <span>{label}</span>
      {hint && <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">({hint})</span>}
    </div>
    {children}
  </div>
);

/** انتخاب سطح — گزینه‌های کوچک همیشه در یک خط (درخواست: «سطح ۶ تا گزینه کوچک بسه تو یک خط») */
export const LevelChips: React.FC<{
  value: string;
  onChange: (l: string) => void;
  levels: string[];
  disabled?: boolean;
}> = ({ value, onChange, levels, disabled }) => (
  <div className={`grid gap-1.5 ${disabled ? 'opacity-45 pointer-events-none' : ''}`} style={{ gridTemplateColumns: `repeat(${Math.min(levels.length, 6)}, minmax(0, 1fr))` }}>
    {levels.map(l => (
      <button key={l} onClick={() => onChange(l)} className={`${chipCls(value === l)} py-2 px-1 text-[11px] text-center whitespace-nowrap`}>
        {l}
      </button>
    ))}
  </div>
);

export const CountChips: React.FC<{
  value: number;
  onChange: (n: number) => void;
  counts?: number[];
  unit?: string;
  disabled?: boolean;
}> = ({ value, onChange, counts, unit, disabled }) => (
  <div className={`flex gap-2 flex-wrap ${disabled ? 'opacity-45 pointer-events-none' : ''}`}>
    {(counts || [5, 8, 10, 12]).map(n => (
      <button key={n} onClick={() => onChange(n)} className={`${chipCls(value === n)} px-4 py-2 text-xs`}>
        {toFa(n)}{unit ? ` ${unit}` : ''}
      </button>
    ))}
  </div>
);

export const TopicInput: React.FC<{
  value: string;
  onChange: (t: string) => void;
  chips?: string[];
  placeholder?: string;
  disabled?: boolean;
}> = ({ value, onChange, chips, placeholder, disabled }) => (
  <div className={disabled ? 'opacity-45 pointer-events-none' : ''}>
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder || 'مثلاً: Umwelt, mein Job, Reisen … (خالی = موضوع آزاد)'}
      className="w-full border-2 border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-[#141923] outline-none focus:border-[#1f5fbf]"
    />
    {chips && chips.length > 0 && (
      <div className="flex flex-wrap gap-1.5 mt-2">
        {chips.map(t => (
          <button
            key={t}
            onClick={() => onChange(t === value ? '' : t)}
            dir="ltr"
            className={`text-[11px] rounded-full px-2.5 py-1 border transition ${value === t ? 'bg-[#1f5fbf] text-white border-transparent' : 'bg-slate-50 dark:bg-[#141923] border-[#dde1ea] dark:border-[#333b4a] text-slate-700 dark:text-slate-200'}`}
          >
            {t}
          </button>
        ))}
      </div>
    )}
  </div>
);

/** دکمهٔ اصلی «ساخت تمرین» — بعد از انتخاب‌ها؛ همه‌جا یک شکل */
export const PrimaryBtn: React.FC<{
  onClick: () => void;
  busy?: boolean;
  busyLabel?: string;
  label?: string;
  disabled?: boolean;
}> = ({ onClick, busy, busyLabel, label, disabled }) => (
  <button
    onClick={onClick}
    disabled={busy || disabled}
    className="w-full bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white py-3 rounded-xl font-bold text-sm shadow-xs active:scale-[.99] transition disabled:opacity-60"
  >
    {busy ? (busyLabel || '⏳ هوش مصنوعی دارد تمرین را می‌سازد…') : (label || '🚀 ساخت تمرین')}
  </button>
);

/* ───────────────────────── آرشیو یکدست ───────────────────────── */

/** پوستهٔ آرشیو — جمع‌شونده؛ محتوا (ردیف‌ها) را فراخوان می‌سازد تا دکمه‌های هر تمرین آزاد بمانند */
export const ArchivePanel: React.FC<{
  title: string;
  count: number;
  emptyText?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ title, count, emptyText, children, footer }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 shadow-xs">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between text-sm font-bold">
        <span>🗂 {title} ({toFa(count)})</span>
        <span className="text-[#5d6676]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {count === 0 && <p className="text-xs text-[#5d6676] py-2">{emptyText || 'هنوز موردی ذخیره نشده است.'}</p>}
          {children}
          {footer}
        </div>
      )}
    </div>
  );
};

/** ردیف آرشیو: عنوان + چیپ‌ها + دکمه‌ها — یک شکل در همهٔ تمرین‌ها */
export const ArchiveRow: React.FC<{
  title: React.ReactNode;
  chips?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, chips, children }) => (
  <div className="flex items-center justify-between gap-2 rounded-xl border border-[#dde1ea] dark:border-[#333b4a] p-2.5">
    <div className="min-w-0">
      <div className="text-xs font-bold leading-5">{title}</div>
      {chips && <div className="text-[10px] text-[#5d6676] dark:text-[#a3adbd] flex flex-wrap gap-1.5 mt-1">{chips}</div>}
    </div>
    <div className="flex items-center gap-1.5 flex-shrink-0">{children}</div>
  </div>
);

/** چیپ‌های کوچک اطلاعاتی داخل ردیف آرشیو */
export const MiniChip: React.FC<{ children: React.ReactNode; tone?: 'plain' | 'blue' | 'green' }> = ({ children, tone }) => (
  <span className={`rounded px-1.5 py-0.5 font-bold whitespace-nowrap ${
    tone === 'blue' ? 'bg-blue-50 dark:bg-blue-950/40 text-[#1f5fbf] dark:text-[#7fb0ff]'
      : tone === 'green' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
        : 'bg-slate-100 dark:bg-slate-800 text-[#5d6676] dark:text-[#a3adbd]'
  }`}>{children}</span>
);

/** دکمه‌های مربع آرشیو (اجرا / آزمون دوباره / حذف) */
export const SqBtn: React.FC<{
  onClick: () => void;
  title: string;
  tone?: 'blue' | 'green' | 'red';
  children: React.ReactNode;
}> = ({ onClick, title, tone, children }) => (
  <button
    onClick={onClick}
    title={title}
    aria-label={title}
    className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm flex-shrink-0 ${
      tone === 'green' ? 'bg-emerald-600 text-white'
        : tone === 'red' ? 'bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 text-red-600'
          : 'bg-[#1f5fbf] text-white'
    }`}
  >
    {children}
  </button>
);
