import React, { useMemo, useState } from 'react';
import { Conflict, ImportDecision, diffWords, mergeWordUpdate } from '../utils/vocabMerge';

interface ImportConflictDialogProps {
  conflicts: Conflict[];
  /** 'single': one word, three buttons. 'multi': per-entry choice with batch shortcuts. */
  mode: 'single' | 'multi';
  onResolve: (decisions: ImportDecision[]) => void;
  onCancel: () => void;
}

const short = (s: string) => (s.length > 90 ? s.slice(0, 90) + '…' : s || '—');
const title = (w: { art?: string; de: string }) => (w.art ? `${w.art} ${w.de}` : w.de);

/**
 * Asked whenever imported vocabulary matches a word that already exists:
 * update the existing record, keep it unchanged, or cancel. Nothing changes before the user decides.
 */
export const ImportConflictDialog: React.FC<ImportConflictDialogProps> = ({ conflicts, mode, onResolve, onCancel }) => {
  const rows = useMemo(
    () => conflicts.map(c => ({ ...c, changes: diffWords(c.existing, mergeWordUpdate(c.existing, c.incoming)) })),
    [conflicts]
  );
  const [choice, setChoice] = useState<Record<string, 'update' | 'keep'>>(() =>
    Object.fromEntries(conflicts.map(c => [c.existing.id, 'update' as const]))
  );

  const decide = (action: (id: string) => 'update' | 'keep'): ImportDecision[] =>
    conflicts.map(c => ({ existingId: c.existing.id, incoming: c.incoming, action: action(c.existing.id) }));

  return (
    <div className="fixed inset-0 z-[120] bg-black/55 flex items-center justify-center p-3" dir="rtl" role="dialog" aria-modal="true">
      <div className="bg-white dark:bg-[#1b2030] rounded-3xl shadow-xl w-full max-w-lg max-h-[88vh] flex flex-col">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-extrabold text-base">
            {mode === 'single' ? 'این واژه از قبل در کتابخانه وجود دارد' : `${conflicts.length} واژه از قبل در کتابخانه وجود دارند`}
          </h3>
          <p className="text-xs text-[#5d6676] dark:text-[#a3adbd] mt-1 leading-6">
            تا وقتی تصمیم نگیرید هیچ چیزی تغییر نمی‌کند. در به‌روزرسانی، شناسه، دسته و پیشرفت یادگیری واژه حفظ می‌شود و
            مقدارهای خالی داده‌های موجود را پاک نمی‌کنند.
          </p>
        </div>

        <div className="p-4 overflow-y-auto space-y-3 text-sm">
          {rows.map(r => (
            <div key={r.existing.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-bold" dir="ltr">
                  {title(r.existing)} <span className="text-slate-500 font-normal" dir="rtl">— {r.existing.fa}</span>
                </div>
                {mode === 'multi' && (
                  <div className="flex gap-1.5 text-xs">
                    {(['update', 'keep'] as const).map(a => (
                      <button
                        key={a}
                        onClick={() => setChoice(c => ({ ...c, [r.existing.id]: a }))}
                        className={`px-2.5 py-1 rounded-lg font-bold border ${
                          choice[r.existing.id] === a
                            ? a === 'update'
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-slate-700 text-white border-slate-700'
                            : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                        }`}
                      >
                        {a === 'update' ? 'به‌روزرسانی' : 'حفظ موجود'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {r.changes.length === 0 ? (
                <div className="text-xs text-slate-500">داده‌های واردشده تغییری نسبت به واژهٔ موجود ایجاد نمی‌کنند.</div>
              ) : (
                <ul className="space-y-1.5 text-xs">
                  {r.changes.map(c => (
                    <li key={c.field} className="leading-5">
                      <b>{c.label}:</b>{' '}
                      <span className="text-red-600 line-through break-words" dir="auto">{short(c.from)}</span>{' '}
                      <span className="text-slate-400">←</span>{' '}
                      <span className="text-emerald-700 dark:text-emerald-300 break-words" dir="auto">{short(c.to)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex flex-wrap gap-2">
          {mode === 'single' ? (
            <>
              <button
                onClick={() => onResolve(decide(() => 'update'))}
                className="flex-1 min-w-[9rem] bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-3 py-2.5 text-sm font-bold"
              >
                به‌روزرسانی واژه موجود
              </button>
              <button
                onClick={() => onResolve(decide(() => 'keep'))}
                className="flex-1 min-w-[9rem] bg-slate-700 hover:bg-slate-800 text-white rounded-xl px-3 py-2.5 text-sm font-bold"
              >
                حفظ واژه موجود
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onResolve(decide(id => choice[id] || 'keep'))}
                className="flex-1 min-w-[9rem] bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-3 py-2.5 text-sm font-bold"
              >
                اعمال انتخاب‌ها
              </button>
              <button
                onClick={() => setChoice(Object.fromEntries(conflicts.map(c => [c.existing.id, 'update' as const])))}
                className="bg-blue-50 text-blue-800 rounded-xl px-3 py-2.5 text-xs font-bold"
              >
                همه: به‌روزرسانی
              </button>
              <button
                onClick={() => setChoice(Object.fromEntries(conflicts.map(c => [c.existing.id, 'keep' as const])))}
                className="bg-slate-100 text-slate-800 rounded-xl px-3 py-2.5 text-xs font-bold"
              >
                همه: حفظ موجود
              </button>
            </>
          )}
          <button
            onClick={onCancel}
            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm font-bold"
          >
            لغو عملیات
          </button>
        </div>
      </div>
    </div>
  );
};
