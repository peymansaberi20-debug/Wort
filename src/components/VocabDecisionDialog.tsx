/**
 * VocabDecisionDialog.tsx — دیالوگ تصمیمِ مرکزیِ «افزودن به واژه‌نامه»
 *
 * وقتی کاربر در هر تمرینی دکمهٔ افزودن را می‌زند، classifyAdd اول کل کتابخانه را چک می‌کند.
 * اگر واژه تازه باشد افزودن مستقیم انجام می‌شود؛ در سه حالت دیگر این دیالوگ باز می‌شود:
 *   • exists   → «این واژه از قبل در کتابخانه است» + دکمهٔ مشاهدهٔ واژه
 *   • partizip → «این Partizip II فعلِ X است» + مشاهدهٔ فعل / ثبت به‌عنوان صفت
 *   • synonym  → «این واژه مترادفِ X است» + مشاهدهٔ X / ثبت به‌عنوان واژهٔ مستقل
 */

import React, { createContext, useContext, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, PlusCircle, X } from 'lucide-react';
import { Word } from '../types';
import { classifyAdd, AddDecision } from '../utils/vocabAdd';

export interface VocabGateCtx {
  /** کل کتابخانهٔ واژگان (برای چک تکراری/P2/مترادف) */
  words: Word[];
  /** افزودن نهایی (App.handleQuickAddWord) — toast موفقیت/شکست خودش را دارد */
  onAdd: (data: Partial<Word>) => boolean;
  /** بازکردن پروفایل واژهٔ کتابخانه (App.setSelectedWord) */
  onView?: (w: Word) => void;
  /** اطلاع به تمرینِ میزبان بعد از پایان هر مسیر (برای مجموعهٔ added محلی و toast اختصاصی) */
  onDone?: (data: Partial<Word>, ok: boolean) => void;
}

interface Pending {
  data: Partial<Word>;
  decision: Exclude<AddDecision, { kind: 'ok' }>;
}

/** دیالوگ شناورِ تصمیم — روی همهٔ پاپ‌آپ‌های تمرین‌ها (z-50/z-75/z-86) و هم‌تراز WordDetailModal */
export const VocabDecisionDialog: React.FC<{ pending: Pending | null; ctx: VocabGateCtx; onClose: () => void }> = ({ pending, ctx, onClose }) => {
  if (!pending) return null;
  const { data, decision } = pending;
  const de = (data.de || '').trim();

  const finish = (payload: Partial<Word>) => {
    const ok = ctx.onAdd(payload);
    ctx.onDone?.(payload, ok);
    onClose();
  };

  const view = (w: Word) => {
    onClose();
    ctx.onView?.(w);
  };

  let title = '';
  let body: React.ReactNode = null;
  let actions: React.ReactNode = null;

  if (decision.kind === 'exists') {
    const ex = decision.existing;
    title = 'این واژه قبلاً در کتابخانهٔ توست';
    body = (
      <div className="rounded-2xl bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 p-3 space-y-1">
        <div className="font-extrabold font-sans text-lg" dir="ltr">{ex.art ? `${ex.art} ${ex.de}` : ex.de}</div>
        <div className="text-sm font-semibold text-[#1f5fbf] dark:text-[#7fb0ff]">{ex.fa}</div>
        {ex.ex && <div dir="ltr" className="text-xs text-slate-500 dark:text-slate-400 font-sans text-left">{ex.ex}</div>}
      </div>
    );
    actions = (
      <>
        <button onClick={() => view(ex)} className="flex-1 flex items-center justify-center gap-1.5 bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white py-2.5 rounded-xl text-xs font-bold">
          <BookOpen size={15} /> مشاهدهٔ واژه
        </button>
        <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">بستن</button>
      </>
    );
  } else if (decision.kind === 'partizip') {
    const inf = decision.infinitive;
    title = 'این کلمه یک Partizip II است';
    body = (
      <div className="rounded-2xl bg-violet-50 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-800 p-3 space-y-1.5">
        <div className="text-sm leading-6">
          <b className="font-sans" dir="ltr">{de}</b> شکل <b>Partizip II</b> فعل <b className="font-sans" dir="ltr">{inf.art ? `${inf.art} ${inf.de}` : inf.de}</b> است که از قبل در کتابخانهٔ داری.
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">چطور ادامه بدهم؟</div>
      </div>
    );
    actions = (
      <>
        <button onClick={() => view(inf)} className="flex-1 flex items-center justify-center gap-1.5 bg-[#1f5fbf] text-white py-2.5 rounded-xl text-xs font-bold">
          <BookOpen size={15} /> این P2 مالِ فعل «<span className="font-sans" dir="ltr">{inf.de}</span>» است — مشاهده
        </button>
        <button onClick={() => finish({ ...data, de, pos: 'صفت' })} className="flex-1 flex items-center justify-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white py-2.5 rounded-xl text-xs font-bold">
          <PlusCircle size={15} /> ثبت این P2 به‌عنوان صفت
        </button>
        <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">
          <X size={14} />
        </button>
      </>
    );
  } else {
    const host = decision.host;
    title = 'این واژه مترادفِ یک واژهٔ کتابخانه است';
    body = (
      <div className="rounded-2xl bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-800 p-3 space-y-1.5">
        <div className="text-sm leading-6">
          <b className="font-sans" dir="ltr">{de}</b> در توضیحات واژهٔ <b className="font-sans" dir="ltr">{host.art ? `${host.art} ${host.de}` : host.de}</b> به‌عنوان <b>مترادف</b> ثبت شده است.
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">چطور ادامه بدهم؟</div>
      </div>
    );
    actions = (
      <>
        <button onClick={() => view(host)} className="flex-1 flex items-center justify-center gap-1.5 bg-[#1f5fbf] text-white py-2.5 rounded-xl text-xs font-bold">
          <BookOpen size={15} /> مشاهدهٔ «<span className="font-sans" dir="ltr">{host.de}</span>»
        </button>
        <button onClick={() => finish(data)} className="flex-1 flex items-center justify-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white py-2.5 rounded-xl text-xs font-bold">
          <PlusCircle size={15} /> ثبت به‌عنوان واژهٔ مستقل
        </button>
        <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">
          <X size={14} />
        </button>
      </>
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[1000] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-5 space-y-3 shadow-xl text-right" dir="rtl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-extrabold">{title}</span>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-bold">✕</button>
        </div>
        {body}
        <div className="flex gap-2 flex-wrap">{actions}</div>
      </div>
    </div>,
    document.body
  );
};

/**
 * هوک گیتِ افزودن — تمرین‌های میزبان فقط `attempt(data)` را صدا می‌زنند و `node` را رندر می‌کنند:
 *   const gate = useVocabGate({ words, onAdd: onQuickAddWord!, onView });
 *   gate.attempt({ de, fa, ... });
 *   {gate.node}
 */
export function useVocabGate(ctx: VocabGateCtx) {
  const [pending, setPending] = useState<Pending | null>(null);
  const ctxRef = useMemo(() => ctx, [ctx.words, ctx.onAdd, ctx.onView, ctx.onDone]); // eslint-disable-line react-hooks/exhaustive-deps
  const attempt = (data: Partial<Word>): boolean => {
    const d = classifyAdd(data, ctxRef.words);
    if (d.kind === 'ok') {
      const ok = ctxRef.onAdd(data);
      ctxRef.onDone?.(data, ok);
      return ok;
    }
    setPending({ data, decision: d });
    return false;
  };
  const node = (
    <VocabDecisionDialog
      pending={pending}
      ctx={ctxRef}
      onClose={() => setPending(null)}
    />
  );
  return { attempt, node, close: () => setPending(null) };
}

/** نسخهٔ Context برای تمرین‌هایی که گیت را در چند لایه پاس می‌دهند */
export const VocabGateContext = createContext<VocabGateCtx | null>(null);
export const useVocabGateCtx = () => useContext(VocabGateContext);
