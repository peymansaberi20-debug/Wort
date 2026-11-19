/**
 * ErrorBoundary.tsx — ضد «صفحهٔ سفید» (درخواست‌های #۴ و #۵، لایهٔ ایمنی کلی)
 *
 * اگر هر بخشی از برنامه خطای زمان‌اجرا بدهد، به‌جای سفید شدن کل صفحه،
 * یک کارت خطای خوانا با دکمهٔ «تلاش دوباره» نشان داده می‌شود.
 *
 * استفاده:
 *   1) کل برنامه در App.tsx:
 *        <ErrorBoundary label="برنامه"><AppInner /></ErrorBoundary>
 *   2) دور مودال‌های مشکل‌دار (تا کل اپ نیفتد):
 *        <ErrorBoundary label="ساخت جمله"><SentenceBuilderModal … /></ErrorBoundary>
 *        <ErrorBoundary label="تمرین تلفظ"><ShadowingModal … /></ErrorBoundary>
 *
 * نکته: این لایه فقط جلوی صفحهٔ سفید را می‌گیرد؛ ریشهٔ خطاهای «ساخت جمله → تصحیح با
 * هوش مصنوعی» و «تمرین تلفظ متن» را با فایل‌های SentenceBuilderModal.tsx و
 * ShadowingModal.tsx / SchreibenCorrector.tsx باید درست کنیم.
 */

import React from 'react';

interface EBProps { children: React.ReactNode; label?: string }
interface EBState { err: Error | null; info: string }

export class ErrorBoundary extends React.Component<EBProps, EBState> {
  constructor(props: EBProps) {
    super(props);
    this.state = { err: null, info: '' };
  }

  static getDerivedStateFromError(err: Error): Partial<EBState> {
    return { err };
  }

  componentDidCatch(err: Error, info: React.ErrorInfo): void {
    // ردیابی در کنسول برای پیدا کردن ریشهٔ خطا
    console.error(`[ErrorBoundary:${this.props.label || 'app'}]`, err, info.componentStack);
    this.setState({ info: (info.componentStack || '').split('\n').slice(0, 6).join('\n') });
  }

  private retry = () => this.setState({ err: null, info: '' });

  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div dir="rtl" className="p-4 max-w-md mx-auto my-8">
        <div className="bg-white dark:bg-[#1b2029] border border-red-300 dark:border-red-800 rounded-2xl p-5 space-y-3 text-right shadow-xs">
          <div className="text-3xl">⚠️</div>
          <div className="text-sm font-bold text-red-600 dark:text-red-400">
            خطا در بخش «{this.props.label || 'برنامه'}» — بقیهٔ اپ سالم است
          </div>
          <div className="text-xs leading-6 text-[#5d6676] dark:text-[#a3adbd] break-words">
            {this.state.err.message || String(this.state.err)}
          </div>
          {this.state.info && (
            <pre dir="ltr" className="text-[9px] leading-4 bg-slate-50 dark:bg-[#141923] rounded-lg p-2 overflow-x-auto text-left max-h-28">
              {this.state.info}
            </pre>
          )}
          <div className="flex gap-2">
            <button onClick={this.retry} className="flex-1 bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white py-2.5 rounded-xl text-xs font-bold">
              ↻ تلاش دوباره
            </button>
            <button onClick={() => window.location.reload()} className="flex-1 bg-slate-100 dark:bg-slate-800 py-2.5 rounded-xl text-xs font-bold">
              بارگذاری کل برنامه
            </button>
          </div>
        </div>
      </div>
    );
  }
};
