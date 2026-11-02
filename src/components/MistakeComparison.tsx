import React, { useMemo } from 'react';
import { analyzeMistake, closestAnswer } from '../utils/mistakes';

interface MistakeComparisonProps {
  /** What the learner typed */
  user: string;
  /** The correct answer, or all accepted answers (the closest one is used for the comparison) */
  expected: string | string[];
  /** Optional small title, e.g. "حرف اضافه" when an exercise has several blanks */
  label?: string;
}

/**
 * Shows the learner's wrong answer next to the correct one, highlights the differing
 * characters and explains in Persian what exactly went wrong.
 */
export const MistakeComparison: React.FC<MistakeComparisonProps> = ({ user, expected, label }) => {
  const report = useMemo(() => {
    const list = Array.isArray(expected) ? expected : [expected];
    const target = closestAnswer(user, list) || (list[0] || '');
    return analyzeMistake(user, target);
  }, [user, expected]);

  if (!report.expected) return null;

  return (
    <div className="p-3 rounded-xl bg-white dark:bg-[#141923] border border-red-200 dark:border-red-900/60 text-right space-y-2 text-xs md:text-sm">
      <div className="font-bold text-slate-700 dark:text-slate-200">
        🔍 مقایسهٔ پاسخ شما با شکل درست{label ? ` — ${label}` : ''}
      </div>

      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-[#5d6676] dark:text-[#a3adbd] font-semibold flex-shrink-0">نوشتهٔ شما:</span>
        <span dir="ltr" className="font-sans font-bold text-base tracking-wide break-all">
          {report.user === '' ? (
            <span className="text-red-600 dark:text-red-400">—</span>
          ) : (
            report.segments.map((seg, i) =>
              seg.kind === 'eq' ? (
                <span key={i} className="text-slate-900 dark:text-slate-100">{seg.usr}</span>
              ) : seg.usr ? (
                <span
                  key={i}
                  className="text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-950/60 rounded-sm underline decoration-wavy"
                >
                  {seg.usr.replace(/ /g, '\u00a0')}
                </span>
              ) : (
                <span key={i} className="text-red-600 dark:text-red-400 font-extrabold" title="حرف جا افتاده">
                  _
                </span>
              )
            )
          )}
        </span>
      </div>

      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-[#5d6676] dark:text-[#a3adbd] font-semibold flex-shrink-0">شکل درست:</span>
        <span dir="ltr" className="font-sans font-bold text-base tracking-wide break-all">
          {report.segments.map((seg, i) =>
            seg.kind === 'eq' ? (
              <span key={i} className="text-slate-900 dark:text-slate-100">{seg.exp}</span>
            ) : seg.exp ? (
              <span
                key={i}
                className="text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 rounded-sm underline"
              >
                {seg.exp.replace(/ /g, '\u00a0')}
              </span>
            ) : null
          )}
        </span>
      </div>

      <div className="pt-1 border-t border-slate-200/70 dark:border-slate-800">
        <div className="font-bold text-red-600 dark:text-red-400 mb-1">اشتباه شما:</div>
        <ul className="space-y-0.5 text-slate-800 dark:text-slate-200 leading-relaxed">
          {report.notes.map((note, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span className="text-red-500 mt-0.5">•</span>
              <span>{note}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
