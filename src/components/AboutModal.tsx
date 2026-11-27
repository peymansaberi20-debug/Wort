import React from 'react';
import { IconBtn } from './IconBtn';
import { X } from 'lucide-react';
import { CURRENT_SCHEMA_VERSION } from '../utils/migrations';

interface AboutModalProps {
  onClose: () => void;
}

/** چهار ستون قابلیت‌های کلیدی — مثل صفحهٔ About نرم‌افزارهای حرفه‌ای */
const PILLARS: { icon: string; title: string; desc: string }[] = [
  { icon: '🎓', title: 'یادگیری هوشمند', desc: 'تکرار فاصله‌دار لایتنر + تحلیل نقاط ضعف + مسیر تطبیقی برای رسیدن به B2' },
  { icon: '🤖', title: 'هوش مصنوعی', desc: 'تکمیل واژگان، تصحیح جمله، تولید تمرین و مکالمه با Gemini، Groq و OpenRouter' },
  { icon: '📚', title: '۲۰+ تمرین', desc: 'از فلش‌کارت تا آزمون جامع B2 — شامل اصطلاحات، Konjunktiv، Passiv و دیالوگ' },
  { icon: '🔒', title: 'حریم خصوصی', desc: 'همهٔ داده‌ها روی مرورگر شما — هیچ سروری به آن‌ها دسترسی ندارد' },
];

export const AboutModal: React.FC<AboutModalProps> = ({ onClose }) => {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 overflow-y-auto"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col text-right">

        {/* ─────────── Hero: لوگو + نام + نسخه ─────────── */}
        <div className="relative px-6 pt-8 pb-6 bg-gradient-to-br from-[#1f5fbf] via-[#4a3dc7] to-[#6b4fd8] text-white text-center">
          <button
            onClick={onClose}
            aria-label="بستن"
            className="absolute top-3 left-3 w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition"
          >
            <X size={18} className="text-white/90" />
          </button>

          {/* آیکون برنامه */}
          <div className="w-20 h-20 mx-auto mb-3 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-lg">
            <span className="text-4xl">📖</span>
          </div>

          <h3 dir="ltr" className="font-extrabold text-2xl tracking-tight">WörterBuch</h3>
          <p className="mt-1 text-[12px] text-white/80 leading-relaxed">
            پلتفرم هوشمند یادگیری زبان آلمانی
          </p>
          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-[11px] font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
            نسخهٔ ۶.۰ — {CURRENT_SCHEMA_VERSION}
          </div>
        </div>

        {/* ─────────── چهار ستون قابلیت‌ها ─────────── */}
        <div className="px-5 py-5 grid grid-cols-2 gap-3">
          {PILLARS.map(p => (
            <div
              key={p.title}
              className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-[#141923]/70 border border-slate-100 dark:border-slate-800 text-center"
            >
              <div className="text-2xl mb-1.5">{p.icon}</div>
              <div className="text-[13px] font-bold text-slate-900 dark:text-slate-100 mb-1">{p.title}</div>
              <div className="text-[11px] text-[#5d6676] dark:text-[#a3adbd] leading-relaxed">{p.desc}</div>
            </div>
          ))}
        </div>

        {/* ─────────── خلاصهٔ کوتاه ─────────── */}
        <div className="px-5 pb-4">
          <p className="text-[12px] text-[#5d6676] dark:text-[#a3adbd] leading-relaxed text-center">
            طراحی‌شده برای دانش‌آموزانی که می‌خواهند در کوتاه‌ترین زمان به مدرک B2 برسند — با تمرکز روی نقاط ضعف و مسیر یادگیری شخصی‌سازی‌شده.
          </p>
        </div>

        {/* ─────────── طراح + ارتباط ─────────── */}
        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-[#141923]/40">
          <div className="flex items-center justify-between gap-3">
            <div className="text-right">
              <div className="text-[11px] text-[#5d6676] dark:text-[#a3adbd] mb-0.5">طراحی و توسعه</div>
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                پیمان صابری
              </div>
            </div>
            <a
              href="mailto:peymansaberi20@gmail.com"
              dir="ltr"
              className="text-[12px] font-semibold text-[#1f5fbf] dark:text-[#7fb0ff] hover:underline"
            >
              peymansaberi20@gmail.com
            </a>
          </div>
        </div>

        {/* ─────────── فوتر ─────────── */}
        <div className="px-5 py-3 border-t border-[#dde1ea] dark:border-[#333b4a] flex items-center justify-between gap-2">
          <span className="text-[10px] text-[#5d6676] dark:text-[#a3adbd]">© ۲۰۲۵ Peyman Saberi</span>
          <button
            onClick={onClose}
            className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-5 py-1.5 rounded-xl font-bold text-xs shadow-xs transition active:scale-95"
          >
            بستن
          </button>
        </div>
      </div>
    </div>
  );
};
