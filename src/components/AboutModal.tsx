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
            <span>ℹ️</span> درباره برنامه / About
          </h3>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs md:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <div>
            <h4 className="font-extrabold text-base text-[#1f5fbf] dark:text-[#7fb0ff]">
              WörterBuch: واژه‌نامه آلمانی و فلش کارت
            </h4>
            <p className="mt-1 text-xs text-[#5d6676] dark:text-[#a3adbd]">
              سامانهٔ تخصصی یادگیری، تثبیت و مرور واژگان زبان آلمانی با سیستم تکرار فاصله‌دار لایتنر، استخراج هوشمند لغات و پشتیبانی از دستورزبان و حروف اضافه.
            </p>
          </div>

          <div className="bg-slate-50 dark:bg-[#141923] p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-2">
            <p>
              <b>طراحی و برنامه‌نویسی: </b>
              <span>پیمان صابری (</span>
              <span dir="ltr" className="font-sans font-bold">Peyman Saberi</span>
              <span>)</span>
            </p>
            <p>
              <b>ایمیل و ارتباط: </b>
              <a
                href="mailto:peymansaberi20@gmail.com"
                dir="ltr"
                className="text-[#1f5fbf] dark:text-[#7fb0ff] font-sans font-semibold underline"
              >
                peymansaberi20@gmail.com
              </a>
            </p>
          </div>

          <div className="space-y-1.5 text-xs text-[#5d6676] dark:text-[#a3adbd]">
            <p>
              <b>قابلیت آفلاین:</b> تمامی اطلاعات و رکوردهای یادگیری به طور مستقیم روی مرورگر شما در این دستگاه ذخیره می‌شوند.
            </p>
            <p>
              <b>هوش مصنوعی:</b> مجهز به دستیار استخراج و طبقه‌بندی خودکار بر پایه Google Gemini.
            </p>
          </div>
        </div>

        <div className="p-3.5 border-t border-[#dde1ea] dark:border-[#333b4a] bg-slate-50/50 dark:bg-slate-900/30 flex justify-end">
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
