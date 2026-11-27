/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * WeeklyReportModal.tsx — گزارش هفتگی با AI (درخواست کاربر ۱۲)
 *
 * یک مودال که:
 *   - دکمهٔ «تولید گزارش هفتگی» نشان می‌دهد
 *   - پس از کلیک، با AI گزارش هفتهٔ جاری را می‌سازد
 *   - گزارش‌های قبلی از آرشیو localStorage نمایش می‌دهد
 *   - هر گزارش شامل: چکیده، نقاط قوت، نقاط بهبود، توصیه
 */
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AppState } from '../types';
import { generateWeeklyReport, loadWeeklyReports, hasThisWeekReport, WeeklyReport } from '../utils/weeklyReport';
import { IconBtn } from './IconBtn';
import { X, BarChart3 } from 'lucide-react';

interface Props {
  open: boolean;
  state: AppState;
  onClose: () => void;
  onShowToast?: (msg: string, isErr?: boolean) => void;
}

const faDate = (ts: number): string => new Date(ts).toLocaleDateString('fa-IR', { weekday: 'short', day: 'numeric', month: 'short' });

export const WeeklyReportModal: React.FC<Props> = ({ open, state, onClose, onShowToast }) => {
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<WeeklyReport | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) {
      const arch = loadWeeklyReports();
      setReports(arch);
      setSelected(arch[0] || null);
    }
  }, [open]);

  if (!open) return null;

  const handleGenerate = async () => {
    setBusy(true); setErr('');
    try {
      const r = await generateWeeklyReport(state);
      const arch = loadWeeklyReports();
      setReports(arch);
      setSelected(r);
      onShowToast?.('گزارش هفتگی ساخته شد ✓');
    } catch (e: any) {
      setErr(e?.message || 'ساخت گزارش ناموفق بود.');
      onShowToast?.('ساخت گزارش ناموفق بود.', true);
    } finally {
      setBusy(false);
    }
  };

  const alreadyThisWeek = hasThisWeekReport();

  return createPortal(
    <div
      className="fixed inset-0 z-[95] bg-black/60 backdrop-blur-xs flex items-start sm:items-center justify-center p-3 md:p-6 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col" dir="rtl">
        <div dir="ltr" className="sticky top-0 z-10 bg-white/95 dark:bg-[#1b2029]/95 backdrop-blur-md px-4 py-3 border-b border-[#dde1ea] dark:border-[#333b4a] flex items-center justify-start gap-2">
          <IconBtn onClick={onClose} title="بستن"><X size={18} className="text-red-500" /></IconBtn>
          <h3 className="flex-1 text-right font-bold text-base md:text-lg text-slate-900 dark:text-slate-100">📊 گزارش هفتگی پیشرفت</h3>
        </div>

        <div className="p-4 md:p-5 space-y-4">
          {/* دکمهٔ تولید گزارش */}
          <button
            onClick={() => void handleGenerate()}
            disabled={busy}
            className="w-full bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-4 py-3 rounded-xl text-sm font-bold shadow-xs hover:opacity-95 disabled:opacity-50 transition flex items-center justify-center gap-2"
          >
            <BarChart3 size={16} />
            {busy ? '⏳ در حال ساخت با معلم…' : alreadyThisWeek ? '🔄 ساخت دوبارهٔ گزارش این هفته' : '🚀 ساخت گزارش هفتگی جدید'}
          </button>

          {err && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
              {err}
            </div>
          )}

          {/* لیست گزارش‌های قبلی */}
          {reports.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {reports.map(r => (
                <button
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${selected?.id === r.id
                    ? 'bg-[#1f5fbf] text-white border-transparent'
                    : 'bg-slate-50 dark:bg-[#141923] border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                >
                  {faDate(new Date(r.weekStart).getTime())} → {faDate(new Date(r.weekEnd).getTime())}
                </button>
              ))}
            </div>
          )}

          {/* گزارش انتخاب‌شده */}
          {selected && (
            <div className="space-y-3">
              {/* چکیده */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800">
                <b className="text-xs font-extrabold text-[#1f5fbf] dark:text-[#7fb0ff] block mb-1">📝 چکیده</b>
                <p className="text-sm leading-7 text-slate-700 dark:text-slate-200">{selected.summaryFa}</p>
              </div>

              {/* آمار عددی */}
              <div className="grid grid-cols-4 gap-2">
                <Stat label="تمرین" value={selected.stats.totalExercises} cls="text-slate-800 dark:text-slate-100" />
                <Stat label="دقت" value={`${selected.stats.accuracy}٪`} cls="text-emerald-600" />
                <Stat label="واژهٔ جدید" value={selected.stats.newWordsAdded} cls="text-blue-600" />
                <Stat label="استمرار" value={`${selected.stats.streakDays} روز`} cls="text-amber-600" />
              </div>

              {/* تفکیک نوع تمرین */}
              {Object.keys(selected.stats.byType).length > 0 && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#141923] border border-slate-100 dark:border-slate-800 space-y-1.5">
                  <b className="text-xs text-slate-700 dark:text-slate-300">📚 تفکیک تمرین‌ها</b>
                  {Object.entries(selected.stats.byType).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-xs">
                      <span className="text-[#5d6676] dark:text-[#a3adbd]" dir="ltr">{k}</span>
                      <span className="font-bold text-slate-700 dark:text-slate-200">{v.correct}/{v.total} ({Math.round((v.correct / Math.max(1, v.total)) * 100)}٪)</span>
                    </div>
                  ))}
                </div>
              )}

              {/* نقاط قوت */}
              {selected.strengthsFa.length > 0 && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                  <b className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300 block mb-1">💪 نقاط قوت</b>
                  <ul className="space-y-1 text-xs leading-6 text-emerald-800 dark:text-emerald-200 list-disc pr-4">
                    {selected.strengthsFa.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              )}

              {/* نقاط بهبود */}
              {selected.improvementsFa.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <b className="text-xs font-extrabold text-amber-700 dark:text-amber-300 block mb-1">⚠️ نقاط بهبود</b>
                  <ul className="space-y-1 text-xs leading-6 text-amber-800 dark:text-amber-200 list-disc pr-4">
                    {selected.improvementsFa.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              )}

              {/* توصیه */}
              {selected.recommendationFa && (
                <div className="p-3 rounded-xl bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800">
                  <b className="text-xs font-extrabold text-violet-700 dark:text-violet-300 block mb-1">🎯 توصیهٔ هفتهٔ آینده</b>
                  <p className="text-xs leading-6 text-violet-800 dark:text-violet-200">{selected.recommendationFa}</p>
                </div>
              )}

              {/* فعالیت روزانه */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#141923] border border-slate-100 dark:border-slate-800">
                <b className="text-xs text-slate-700 dark:text-slate-300 block mb-2">📈 فعالیت روزانه</b>
                <div className="flex items-end gap-1 h-16">
                  {selected.stats.byDay.map((d, i) => {
                    const maxC = Math.max(1, ...selected.stats.byDay.map(x => x.count));
                    const h = Math.max(4, Math.round((d.count / maxC) * 56));
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                        <span className="text-[9px] text-slate-600 dark:text-slate-300">{d.count || '-'}</span>
                        <div className="w-full rounded-t bg-gradient-to-t from-[#1f5fbf] to-[#6b4fd8]" style={{ height: `${h}px` }} />
                        <span className="text-[9px] text-[#5d6676] dark:text-[#a3adbd]">{new Date(d.date).toLocaleDateString('fa-IR', { weekday: 'narrow' })}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {!selected && !busy && (
            <div className="text-center text-sm text-[#5d6676] dark:text-[#a3adbd] py-8">
              هنوز گزارشی ساخته نشده. روی «🚀 ساخت گزارش هفتگی جدید» بزن.
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

const Stat: React.FC<{ label: string; value: React.ReactNode; cls: string }> = ({ label, value, cls }) => (
  <div className="text-center p-2 rounded-xl bg-slate-50 dark:bg-[#141923] border border-slate-100 dark:border-slate-800">
    <div className="text-[10px] text-[#5d6676] dark:text-[#a3adbd]">{label}</div>
    <b className={`text-sm ${cls}`}>{value}</b>
  </div>
);
