import React, { useEffect } from 'react';

interface ImportHelpModalProps {
  onClose: () => void;
  onDownloadTemplate?: () => void;
}

export const ImportHelpModal: React.FC<ImportHelpModalProps> = ({
  onClose,
  onDownloadTemplate
}) => {
  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 overflow-y-auto"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col text-right">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#dde1ea] dark:border-[#333b4a] flex items-center justify-between gap-2 bg-slate-50 dark:bg-[#141923]">
          <div className="flex items-center gap-2">
            <span className="text-xl">📖</span>
            <h3 className="font-bold text-base md:text-lg text-slate-900 dark:text-slate-100">
              راهنمای جامع ورود فایل (Excel, CSV و JSON)
            </h3>
          </div>
          <button
            onClick={onClose}
            className="bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            ×
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs md:text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
          {/* Section 1: Formats */}
          <div className="space-y-2">
            <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5 text-[#1f5fbf] dark:text-[#7fb0ff]">
              <span>📌</span> فرمت‌های پشتیبانی‌شده:
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="bg-slate-50 dark:bg-[#141923] p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
                <b className="text-emerald-700 dark:text-emerald-400 block mb-1">📗 فایل Excel (.xlsx)</b>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                  ساده‌ترین و امن‌ترین فرمت بدون مشکل به هم ریختن کاما یا گیومه. قالب نمونه آماده مستقیماً قابل استفاده است.
                </p>
              </div>

              <div className="bg-slate-50 dark:bg-[#141923] p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
                <b className="text-blue-700 dark:text-blue-400 block mb-1">📄 فایل CSV (.csv)</b>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                  باید حتماً با انکودینگ <b>UTF-8</b> ذخیره شود تا حروف آلمانی (ä, ö, ü, ß) و متن‌های فارسی آسیب نبینند.
                </p>
              </div>

              <div className="bg-slate-50 dark:bg-[#141923] p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
                <b className="text-purple-700 dark:text-purple-400 block mb-1">📦 فایل JSON (.json)</b>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                  شامل فایل پشتیبان کامل برنامه (با کلید <code>words</code>) یا آرایه‌ای از اشیاء واژگان آلمانی.
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Columns Specification */}
          <div className="space-y-2">
            <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5 text-[#1f5fbf] dark:text-[#7fb0ff]">
              <span>📊</span> عناوین ستون‌ها و فیلدها:
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              سطر اول فایل باید حاوی عناوین ستون‌ها باشد. نام ستون‌ها به حروف کوچک/بزرگ حساس نیست:
            </p>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 font-bold text-slate-900 dark:text-slate-100">
                  <tr>
                    <th className="p-2">نام ستون (انگلیسی یا معادل فارسی)</th>
                    <th className="p-2">وضعیت</th>
                    <th className="p-2">توضیحات و مثال</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  <tr className="bg-emerald-50/40 dark:bg-emerald-950/20">
                    <td className="p-2 font-mono font-bold" dir="ltr">german / de / word / آلمانی</td>
                    <td className="p-2 text-emerald-700 dark:text-emerald-400 font-bold">الزامی</td>
                    <td className="p-2">سرواژه یا اصطلاح آلمانی (مانند: <code>Entscheidung</code> یا <code>treffen</code>)</td>
                  </tr>
                  <tr className="bg-emerald-50/40 dark:bg-emerald-950/20">
                    <td className="p-2 font-mono font-bold" dir="ltr">persian / fa / ترجمه / فارسی</td>
                    <td className="p-2 text-emerald-700 dark:text-emerald-400 font-bold">الزامی</td>
                    <td className="p-2">ترجمه فارسی واژه (مانند: <code>تصمیم</code>)</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-mono" dir="ltr">article / art / آرتیکل</td>
                    <td className="p-2 text-slate-500">اختیاری</td>
                    <td className="p-2">آرتیکل اسم: دقیقاً یکی از مقادیر <code>der</code>, <code>die</code>, <code>das</code></td>
                  </tr>
                  <tr>
                    <td className="p-2 font-mono" dir="ltr">plural / pl / جمع</td>
                    <td className="p-2 text-slate-500">اختیاری</td>
                    <td className="p-2">شکل جمع اسم (مانند: <code>die Entscheidungen</code> یا <code>-en</code>)</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-mono" dir="ltr">partOfSpeech / pos / نقش</td>
                    <td className="p-2 text-slate-500">اختیاری</td>
                    <td className="p-2">اسم، فعل، صفت، قید، حرف اضافه، اصطلاح</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-mono" dir="ltr">level / lvl / سطح</td>
                    <td className="p-2 text-slate-500">اختیاری</td>
                    <td className="p-2">سطح CEFR: مقادیر A1, A2, B1, B2, C1, C2</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-mono" dir="ltr">example / ex / مثال</td>
                    <td className="p-2 text-slate-500">اختیاری</td>
                    <td className="p-2">جمله کاربردی آلمانی حاوی واژه</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-mono" dir="ltr">exampleTranslation / exFa</td>
                    <td className="p-2 text-slate-500">اختیاری</td>
                    <td className="p-2">ترجمه فارسی جمله مثال اول</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-mono" dir="ltr">category / cat / دسته</td>
                    <td className="p-2 text-slate-500">اختیاری</td>
                    <td className="p-2">نام دسته موضوعی (در صورت خالی بودن، دسته عمومی لحاظ می‌شود)</td>
                  </tr>
                  <tr>
                    <td className="p-2 font-mono" dir="ltr">synonym / ant / cloze ...</td>
                    <td className="p-2 text-slate-500">اختیاری</td>
                    <td className="p-2">سایر فیلدهای غنی‌سازی نظیر مترادف، متضاد، صرف فعل و یادداشت</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 3: Escaping & Encoding Rules */}
          <div className="space-y-2 bg-amber-50 dark:bg-amber-950/30 p-3.5 rounded-2xl border border-amber-200 dark:border-amber-800 text-xs">
            <b className="text-amber-900 dark:text-amber-200 flex items-center gap-1">
              <span>⚠️</span> نکات کلیدی برای جلوگیری از خطا:
            </b>
            <ul className="list-disc list-inside space-y-1 text-slate-700 dark:text-slate-300">
              <li><b>انکودینگ UTF-8:</b> هنگام خروجی گرفتن CSV از اکسل، گزینه <code>CSV UTF-8 (Comma delimited)</code> را انتخاب کنید تا حروف فارسی و آلمانی علامت سؤال یا ناخوانا نشوند.</li>
              <li><b>علامت گیومه (Quote):</b> در فایل‌های CSV، اگر در متن فیلدی علامت کاما (,) یا خط جدید وجود دارد، باید کل آن فیلد بین علامت <code>"..."</code> قرار گیرد.</li>
              <li><b>واژه‌های تکراری:</b> اگر واژه‌ای قبلاً در کتابخانه شما وجود داشته باشد، اطلاعات تکمیلی آن به‌روزرسانی شده و تاریخچه مرور قبلی شما محفوظ خواهد ماند.</li>
            </ul>
          </div>

          {/* Section 4: Template Download Callout */}
          {onDownloadTemplate && (
            <div className="p-3.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-2xl flex flex-wrap items-center justify-between gap-3">
              <div>
                <b className="text-xs text-blue-900 dark:text-blue-200 block">دانلود قالب آماده و استاندارد اکسل:</b>
                <span className="text-[11px] text-slate-600 dark:text-slate-300">
                  می‌توانید فایل قالب را دانلود کرده، با اطلاعات خود پر کنید و مستقیماً وارد برنامه نمایید.
                </span>
              </div>
              <button
                onClick={() => {
                  onDownloadTemplate();
                  onClose();
                }}
                className="bg-[#1f5fbf] hover:bg-[#184a96] text-white text-xs font-bold py-2 px-3.5 rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <span>📥 دانلود قالب اکسل (.xlsx)</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#dde1ea] dark:border-[#333b4a] bg-slate-50 dark:bg-[#141923] flex justify-end">
          <button
            onClick={onClose}
            className="bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 px-5 py-2 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            متوجه شدم
          </button>
        </div>
      </div>
    </div>
  );
};
