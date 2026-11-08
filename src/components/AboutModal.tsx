import React from 'react';
import { IconBtn } from './IconBtn';
import { X } from 'lucide-react';

interface AboutModalProps {
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ onClose }) => {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 overflow-y-auto"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col text-right">
        {/* Header */}
        <div dir="ltr" className="px-5 py-4 border-b border-[#dde1ea] dark:border-[#333b4a] flex items-center justify-between gap-2 bg-slate-50 dark:bg-[#141923]">
          <IconBtn onClick={onClose} title="بستن"><X size={18} className="text-red-500" /></IconBtn>
          <h3 className="font-bold text-base md:text-lg text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <span>ℹ️</span> درباره WörterBuch
          </h3>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs md:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <div className="text-center pb-3 border-b border-slate-100 dark:border-slate-800">
            <h4 dir="ltr" className="font-extrabold text-lg text-[#1f5fbf] dark:text-[#7fb0ff] font-sans">WörterBuch</h4>
            <p className="mt-1 text-xs text-[#5d6676] dark:text-[#a3adbd]">پلتفرم هوشمند یادگیری، تثبیت و مرور واژگان زبان آلمانی</p>
          </div>

          <div>
            <b className="block mb-1.5 text-slate-900 dark:text-slate-100">✨ قابلیت‌ها</b>
            <ul className="space-y-1">
              <li>• تکمیل خودکار واژگان با هوش مصنوعی (Gemini / Groq / OpenRouter)</li>
              <li>• استخراج واژه از تصویر و متن + تکمیل گروهی ادامه‌پذیر</li>
              <li>• سیستم تکرار فاصله‌دار لایتنر با تحلیل هوشمند یادگیری</li>
              <li>• ۱۸ نوع تمرین تعاملی + ساخت جمله با بازخورد هوش مصنوعی</li>
              <li>• مقایسهٔ تا ۴ واژهٔ مشابه + کنترل املا هوشمند</li>
              <li>• تعریف آلمانی، مثال کاربردی، مقایسهٔ مترادف و معادل انگلیسی</li>
              <li>• سه پوسته (روشن / تیره / مطالعهٔ سبز) + کارکرد کامل آفلاین</li>
            </ul>
          </div>

          <div className="bg-slate-50 dark:bg-[#141923] p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-1.5">
            <p><b>حریم خصوصی:</b> تمام داده‌های شما فقط روی مرورگر خودتان ذخیره می‌شود و به هیچ سروری ارسال نمی‌گردد.</p>
            <p><b>هوش مصنوعی:</b> کلیدهای API فقط روی دستگاه شما نگهداری و مستقیماً به ارائه‌دهندهٔ انتخابی ارسال می‌شوند.</p>
          </div>

          <div className="space-y-1.5 text-xs text-[#5d6676] dark:text-[#a3adbd]">
            <p>
              <b className="text-slate-900 dark:text-slate-100">طراحی و توسعه:</b>{' '}
              پیمان صابری (<span dir="ltr" className="font-sans font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">Peyman Saberi</span>)
            </p>
            <p>
              <b>ارتباط:</b>{' '}
              <a href="mailto:peymansaberi20@gmail.com" dir="ltr" className="text-[#1f5fbf] dark:text-[#7fb0ff] font-sans font-semibold underline">peymansaberi20@gmail.com</a>
            </p>
          </div>
        </div>

        <div className="p-3.5 border-t border-[#dde1ea] dark:border-[#333b4a] bg-slate-50/50 dark:bg-slate-900/30 flex items-center justify-between gap-2">
          <span className="text-[11px] text-[#5d6676] dark:text-[#a3adbd]">© 2025 Peyman Saberi — تمام حقوق محفوظ است.</span>
          <button
            onClick={onClose}
            className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-5 py-1.5 rounded-xl font-bold text-xs md:text-sm shadow-xs transition"
          >
            بستن
          </button>
        </div>
      </div>
    </div>
  );
};
