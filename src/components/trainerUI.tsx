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

/* ───────────────────────── سیستم چاپ یکدست برنامه (نسخهٔ ۲) ─────────────────────────
 * همهٔ تمرین‌ها از همین یک نمای استفاده می‌کنند — هیچ تمرینی CSS چاپ خودش را ندارد،
 * پس دیگر قاعدهٔ رقیبِ «هر چیز جز برگهٔ من را پنهان کن» وجود ندارد که برگهٔ سفید می‌ساخت.
 *
 *   - اورلی تمام‌صفحه؛ نوار بالای آن فقط دو دکمهٔ آیکونی دارد: پرینتر و بستن (✕)
 *     — طبق درخواست کاربر هیچ‌جا واژهٔ «چاپ» یا مشابه آن نوشته نمی‌شود، فقط آیکون.
 *   - دکمهٔ پرینتر دقیقاً در همان رویداد کلیک window.print() را صدا می‌زند
 *     (بدون setTimeout) تا در Safari/iOS هم gesture حفظ شود و پنجرهٔ چاپ باز شود.
 *   - صفحهٔ ۱ (+حداکثر صفحهٔ ۲) = سؤال‌ها سفید و بدون پاسخ؛ صفحهٔ بعد = پاسخنامهٔ مستقل
 *     (Lösungen)؛ صفحات اختیاری بعدی (Transkript، کارنامه) هرکدام از صفحهٔ تازه شروع می‌شوند.
 *   - جمله‌های آلمانی LTR چپ‌چین (prG) و توضیح فارسی RTL راست‌چین (prFa).
 *   - <WriteLines/> فضای نوشتن را تا انتهای صفحهٔ A4 با خط‌کشی ۹ میلی‌متری پر می‌کند.
 *   - فقط یک پیش‌نمایش اجازهٔ چاپ دارد: اگر چند اورلیِ keep-alive هم‌زمان مونت باشند،
 *     جدیدترین‌شان «فعال» می‌شود و بقیه با data-wpr-suppressed از چاپ حذف می‌شوند.
 * راه چاپ: Portal به body + پنهان‌کردن هر چیز غیر از .wpr-screen در print —
 * همین باعث می‌شود نوارها و هدر برنامه داخل برگه چاپ نشوند. */

import { Printer, X } from 'lucide-react';

/** رجیستری اورلی‌های چاپ باز — فقط آخرین اورلی اجازهٔ چاپ دارد (بقیه suppressed) */
const wprStack: HTMLElement[] = [];
const wprRepick = (): void => {
  wprStack.forEach(el => el.removeAttribute('data-wpr-suppressed'));
  const active = wprStack[wprStack.length - 1] || null;
  wprStack.forEach(el => { if (el !== active) el.setAttribute('data-wpr-suppressed', ''); });
};

/** چاپِ سازگار با همهٔ مرورگرها به‌خصوص Safari/iOS:
 *  صدا زدن window.print() باید هم‌زمان با کلیک کاربر (user gesture) و بدون واسطهٔ
 *  setTimeout انجام شود وگرنه سافاری آن را نادیده می‌گیرد یا برگهٔ سفید می‌دهد.
 *  عنوان سند موقتاً عوض می‌شود تا نام فایل PDF پیشنهادی معنادار باشد؛ پس‌زمینهٔ
 *  ریشه/بدنه هم موقتاً سفید می‌شود (inline !important از هر قانون لایه‌دار قوی‌تر است). */
export const runPrint = (docTitle?: string): void => {
  const html = document.documentElement;
  const body = document.body;
  const savedHtml = html.getAttribute('style') || '';
  const savedBody = body.getAttribute('style') || '';
  try {
    const prev = document.title;
    if (docTitle) {
      const clean = docTitle.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (clean) document.title = `${clean} — Wortschatz-Trainer`;
    }
    // سافاری گاهی ناحیهٔ اسکرول‌شدهٔ اورلی را با شیفت چاپ می‌کند — به بالای برگه برگرد
    document.querySelectorAll<HTMLElement>('.wpr-screen').forEach(el => { el.scrollTop = 0; });
    window.scrollTo(0, 0);
    // پس‌زمینهٔ تم برنامه (index.css داخل @layer base با !important) کاغذ را کمرنگ می‌کند — inline قوی‌تر است
    html.style.setProperty('background', '#fff', 'important');
    body.style.setProperty('background', '#fff', 'important');
    window.print();
    if (docTitle) window.setTimeout(() => { document.title = prev; }, 1200);
    window.setTimeout(() => {
      html.setAttribute('style', savedHtml);
      body.setAttribute('style', savedBody);
    }, 1500);
  } catch {
    html.setAttribute('style', savedHtml);
    body.setAttribute('style', savedBody);
  }
};

export const PRINT_PREVIEW_CSS = `
.wpr-screen { position: fixed; inset: 0; z-index: 1000; background: #3f4753; overflow-y: auto; -webkit-overflow-scrolling: touch; }
.wpr-bar { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 8px; padding: 10px 14px; padding-top: max(10px, env(safe-area-inset-top)); background: #1f2937; color: #fff; flex-wrap: wrap; }
.wpr-btn { display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 36px; border-radius: 10px; background: rgba(255,255,255,.14); color: #fff; }
.wpr-btn:hover { background: rgba(255,255,255,.24); }
.wpr-btn-primary { background: #1f5fbf; width: 46px; }
.wpr-btn-primary:hover { background: #194ea0; }
.wpr-hint { font-size: 11px; opacity: .85; margin-inline-start: auto; }
.wpr-pages { max-width: 780px; margin: 18px auto 48px; padding: 0 10px; }
.wpr-page { background: #fff; color: #111; padding: 42px 46px; min-height: 1010px; box-shadow: 0 3px 18px rgba(0,0,0,.45); margin-bottom: 20px; }
.wpr-head { border-bottom: 2px solid #1f5fbf; padding-bottom: 8px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.wpr-title { font-size: 15px; font-weight: 800; }
.wpr-meta { font-size: 10.5px; color: #555; }
.wpr-page li { break-inside: avoid; page-break-inside: avoid; }
/* خط‌کشی نوشتن: روی صفحه ارتفاع ثابت، در چاپ تا انتهای صفحهٔ A4 پر می‌شود (فاصلهٔ خطوط ۹ میلی‌متر) */
.wpr-write { background: repeating-linear-gradient(to bottom, transparent 0, transparent calc(var(--wpr-gap, 9mm) - 1px), #98a0ae calc(var(--wpr-gap, 9mm) - 1px), #98a0ae var(--wpr-gap, 9mm)); background-origin: content-box; }
@media print {
  /* پوستهٔ برنامه در index.css روی :root/html/body[data-theme] رنگ‌های !important داخل
     @layer base دارد — برای important، قانون لایه‌دار از قانون لایه‌نخورده قوی‌تر است؛
     پس override هم باید داخل همان لایه و با specificity دست‌کم برابر (:root + attribute) باشد
     وگرنه کاغذ چاپ به‌جای سفید، #f6f7fb (روشن) یا #12151c (تیره) می‌شود */
  @layer base {
    :root[data-theme="light"], :root[data-theme="dark"],
    html[data-theme], body[data-theme],
    html, body {
      background: #fff !important;
      color-scheme: light;
    }
  }
  /* همهٔ فرزندان body جز اورلی فعال حذف می‌شوند — ارتفاع صفر، پس صفحهٔ خالی نمی‌سازند */
  html body > *:not(.wpr-screen) { display: none !important; }
  html body > .wpr-screen { display: block !important; position: static !important; inset: auto !important; height: auto !important; background: #fff !important; overflow: visible !important; }
  html body > .wpr-screen[data-wpr-suppressed] { display: none !important; }
  .wpr-bar { display: none !important; }
  .wpr-pages { max-width: none; margin: 0; padding: 0; }
  .wpr-page { box-shadow: none !important; margin: 0 !important; padding: 0 !important; min-height: 0 !important; }
  .wpr-page:not(:last-child) { page-break-after: always; break-after: page; }
  /* صفحه‌ای که <WriteLines/> دارد: ستون فلکس با ارتفاع دقیق A4 منهای حاشیه‌ها — خط‌کشی تا پایین برگه پر می‌شود */
  .wpr-page:has(.wpr-write) { display: flex; flex-direction: column; height: 271mm; overflow: hidden; }
  .wpr-page:has(.wpr-write) .wpr-write { height: auto !important; flex: 1 1 auto; min-height: 40mm; }
  @page { size: A4; margin: 13mm; }
}
.wpr-screen, .wpr-screen * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
`;

/** سبک‌های متن داخل برگه — همهٔ تمرین‌ها یک شکل: آلمانی LTR چپ‌چین، فارسی RTL راست‌چین */
export const prG = (extra?: React.CSSProperties): React.CSSProperties =>
  ({ direction: 'ltr' as const, unicodeBidi: 'embed', textAlign: 'left', ...extra });
export const prFa = (extra?: React.CSSProperties): React.CSSProperties =>
  ({ direction: 'rtl' as const, unicodeBidi: 'embed', textAlign: 'right', ...extra });

/** خط‌کشی نوشتن با فاصلهٔ منطقی (پیش‌فرض ۹ میلی‌متر مثل دفتر مدرسه) — در چاپ تا انتهای صفحهٔ A4 پر می‌شود */
export const WriteLines: React.FC<{ gapMm?: number; screenHeight?: number }> = ({ gapMm = 9, screenHeight = 620 }) => (
  <div className="wpr-write" style={{ height: screenHeight, ['--wpr-gap' as never]: `${gapMm}mm` }} />
);

export const PrintPreview: React.FC<{
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  /** عنوان سند هنگام چاپ → نام پیشنهادی فایل PDF (اختیاری) */
  docTitle?: string;
  meta?: React.ReactNode;
  questions: React.ReactNode;
  solutions?: React.ReactNode;
  solutionsMeta?: React.ReactNode;
  /** صفحات اختیاری بعد از پاسخنامه — هرکدام از صفحهٔ تازه شروع می‌شوند (مثل Transkript و کارنامهٔ Hören) */
  extraPages?: { title: React.ReactNode; meta?: React.ReactNode; content: React.ReactNode }[];
  hint?: string;   // متن راهنمای نوار بالای پیش‌نمایش (اختیاری)
}> = ({ open, onClose, title, docTitle, meta, questions, solutions, solutionsMeta, extraPages, hint }) => {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!open) return;
    const el = rootRef.current;
    if (!el) return;
    wprStack.push(el);
    wprRepick();
    return () => { const i = wprStack.indexOf(el); if (i >= 0) wprStack.splice(i, 1); wprRepick(); };
  }, [open]);
  if (!open) return null;
  const pages: { title?: React.ReactNode; meta?: React.ReactNode; content: React.ReactNode }[] = [
    { title, meta, content: questions },
  ];
  if (solutions) pages.push({ title: 'Lösungen — پاسخنامه', meta: solutionsMeta ?? meta, content: solutions });
  if (extraPages) pages.push(...extraPages);
  return createPortal(
    <div className="wpr-screen" ref={rootRef} role="dialog" aria-modal="true" dir="rtl">
      <style>{PRINT_PREVIEW_CSS}</style>
      <div className="wpr-bar">
        <button onClick={() => runPrint(docTitle)} className="wpr-btn wpr-btn-primary" aria-label="چاپ برگه">
          <Printer size={17} />
        </button>
        <button onClick={onClose} className="wpr-btn" aria-label="بستن">
          <X size={17} />
        </button>
        <span className="wpr-hint">{hint || 'پیش‌نمایش برگهٔ A4 — سؤال‌ها سفید و بدون پاسخ، پاسخنامه در صفحهٔ مستقل بعدی'}</span>
      </div>
      <div className="wpr-pages">
        {pages.map((p, i) => (
          <div className="wpr-page" key={i}>
            {p.title !== undefined && (
              <div className="wpr-head">
                <div className="wpr-title">{p.title}</div>
                {p.meta && <div className="wpr-meta">{p.meta}</div>}
              </div>
            )}
            {p.content}
          </div>
        ))}
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
