/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * QuickReview60.tsx — مرور سریع ۶۰ ثانیه‌ای (درخواست کاربر ۱۰)
 *
 * یک حالت سریع برای وقتی فقط ۱ دقیقه وقت داری (در صف، مترو، استراحت کوتاه):
 *   - ۵ فلش‌کارت از واژه‌های سررسید یا واژه‌های اخیر
 *   - ۱۲ ثانیه برای هر کلمه
 *   - حرکت انگشت چپ/راست یا کلیک = بعدی / شناخته / ناشناخته
 *   - در پایان: خلاصه (چند تا شناخته، چند تا ناشناخته)
 *   - ثبت در hist بدون امتیاز (تشخیصی) + پیشرفت چالش روزانه
 */
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Word } from '../types';
import { speak } from '../utils/audio';
import { recordRecent, fullWord, isLeech } from '../utils/storage';
import { recordPractice } from '../utils/practiceTracker';
import { advanceDailyQuest } from '../utils/dailyQuest';
import { IconBtn } from './IconBtn';
import { X, Volume2, Check, X as XIcon, ChevronRight } from 'lucide-react';

interface Props {
  open: boolean;
  words: Word[];
  onClose: () => void;
  onShowToast?: (m: string, e?: boolean) => void;
  onRecordResult?: (w: Word, ok: boolean) => void;
}

const TOTAL_SECONDS = 60;
const PER_CARD = 12;

interface CardResult { word: Word; ok: boolean | null; duration: number }

export const QuickReview60: React.FC<Props> = ({ open, words, onClose, onShowToast, onRecordResult }) => {
  const [started, setStarted] = useState(false);
  const [queue, setQueue] = useState<Word[]>([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_SECONDS);
  const [results, setResults] = useState<CardResult[]>([]);
  const [done, setDone] = useState(false);
  const startTimeRef = useRef<number>(Date.now());
  const cardStartRef = useRef<number>(Date.now());

  // انتخاب ۵ واژه: ترجیحاً سررسید، وگرنه واژه‌های اخیر
  const buildQueue = useCallback(() => {
    const now = Date.now();
    const due = words.filter(w => w.last && w.due <= now).sort((a, b) => a.due - b.due);
    if (due.length >= 5) return shuffle(due).slice(0, 5);
    const recent = words.filter(w => w.last).sort((a, b) => (b.last || 0) - (a.last || 0));
    if (recent.length >= 5) return shuffle(recent).slice(0, 5);
    return shuffle(words).slice(0, 5);
  }, [words]);

  const start = () => {
    const q = buildQueue();
    if (q.length === 0) {
      onShowToast?.('واژه‌ای برای مرور نیست.', true);
      return;
    }
    setQueue(q); setIdx(0); setRevealed(false); setResults([]); setDone(false);
    setSecondsLeft(TOTAL_SECONDS);
    setStarted(true);
    startTimeRef.current = Date.now();
    cardStartRef.current = Date.now();
  };

  // شمارش معکوس
  useEffect(() => {
    if (!started || done) return;
    if (secondsLeft <= 0) { setDone(true); return; }
    const t = setTimeout(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [started, secondsLeft, done]);

  if (!open) return null;

  const current = queue[idx];

  const nextCard = (ok: boolean | null) => {
    if (!current) return;
    const dur = Date.now() - cardStartRef.current;
    setResults(r => [...r, { word: current, ok, duration: dur }]);
    // ثبت نتیجه (بدون امتیاز سختگیرانه — فقط تشخیصی)
    if (ok !== null && onRecordResult) onRecordResult(current, ok);
    if (ok !== null) recordPractice(1);
    // پیشرفت چالش روزانه: هر کارت شناخته = +۱
    if (ok === true) advanceDailyQuest(1);
    // بعدی
    if (idx + 1 >= queue.length || (TOTAL_SECONDS - secondsLeft) > TOTAL_SECONDS - 1) {
      setDone(true);
      return;
    }
    setIdx(i => i + 1);
    setRevealed(false);
    cardStartRef.current = Date.now();
  };

  const restart = () => { setStarted(false); setDone(false); };

  if (!started && !done) {
    return (
      <div className="fixed inset-0 z-[95] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-6 max-w-md w-full text-center shadow-2xl" dir="rtl">
          <button onClick={onClose} className="absolute top-3 left-3"><IconBtn onClick={onClose} title="بستن"><X size={18} className="text-red-500" /></IconBtn></button>
          <div className="text-5xl mb-3">⚡</div>
          <h3 className="text-xl font-extrabold mb-1">مرور سریع ۶۰ ثانیه‌ای</h3>
          <p className="text-sm text-[#5d6676] dark:text-[#a3adbd] mb-4 leading-6">
            ۵ فلش‌کارت از واژه‌های سررسید، هر کدام ۱۲ ثانیه.<br />
            هر کلمه را «شناخته» یا «ناشناخته» علامت بزن.<br />
            سریع، ساده، در هر زمان و مکان.
          </p>
          <button onClick={start} className="w-full py-3 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white font-bold text-sm shadow-md transition hover:opacity-95 active:scale-95">
            🚀 شروع مرور
          </button>
        </div>
      </div>
    );
  }

  if (done) {
    const known = results.filter(r => r.ok === true).length;
    const unknown = results.filter(r => r.ok === false).length;
    const noAnswer = results.length - known - unknown;
    return (
      <div className="fixed inset-0 z-[95] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-6 max-w-md w-full text-center shadow-2xl" dir="rtl">
          <div className="absolute top-3 left-3"><IconBtn onClick={onClose} title="بستن"><X size={18} className="text-red-500" /></IconBtn></div>
          <div className="text-5xl mb-3">{known >= 3 ? '🎉' : '💪'}</div>
          <h3 className="text-xl font-extrabold mb-2">پایان ۶۰ ثانیه</h3>
          <div className="grid grid-cols-3 gap-2 my-3">
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
              <div className="text-2xl font-extrabold text-emerald-600">{known}</div>
              <div className="text-[10px] text-emerald-700 dark:text-emerald-300">شناخته</div>
            </div>
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800">
              <div className="text-2xl font-extrabold text-rose-600">{unknown}</div>
              <div className="text-[10px] text-rose-700 dark:text-rose-300">ناشناخته</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#141923] border border-slate-200 dark:border-slate-700">
              <div className="text-2xl font-extrabold text-slate-600 dark:text-slate-300">{noAnswer}</div>
              <div className="text-[10px] text-slate-700 dark:text-slate-300">بدون جواب</div>
            </div>
          </div>
          <p className="text-xs text-[#5d6676] dark:text-[#a3adbd] mb-3">به‌خاطر سپردن این واژه‌ها و حفظ زنجیرهٔ استمرار مهم است. هر شناخته در چالش روزانه هم محاسبه شد.</p>
          <div className="flex gap-2">
            <button onClick={restart} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white font-bold text-sm">🔄 دوباره</button>
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-bold">بستن</button>
          </div>
        </div>
      </div>
    );
  }

  // شمارش معکوس: درصد نوار پیشرفت
  const progress = ((TOTAL_SECONDS - secondsLeft) / TOTAL_SECONDS) * 100;
  const isUrgent = secondsLeft <= 10;

  return (
    <div className="fixed inset-0 z-[95] bg-gradient-to-b from-slate-900/80 to-black/80 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white dark:bg-[#1b2029] rounded-3xl p-5 max-w-md w-full shadow-2xl">
        <div className="flex items-center justify-between mb-2">
          <button onClick={onClose} className="text-red-500 text-xs font-bold">✕ خروج</button>
          <div className="text-xs font-bold text-[#5d6676] dark:text-[#a3adbd]">⚡ مرور سریع</div>
          <div className={`text-sm font-mono font-extrabold ${isUrgent ? 'text-rose-500 animate-pulse' : 'text-slate-700 dark:text-slate-200'}`}>
            {Math.floor(secondsLeft / 60)}:{(secondsLeft % 60).toString().padStart(2, '0')}
          </div>
        </div>
        {/* نوار پیشرفت زمان */}
        <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mb-3">
          <div className={`h-full transition-all duration-1000 ease-linear ${isUrgent ? 'bg-rose-500' : 'bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8]'}`} style={{ width: `${progress}%` }} />
        </div>
        {/* کارت */}
        {current && (
          <div className="text-center py-6">
            <div className="text-xs text-[#5d6676] dark:text-[#a3adbd] mb-2">کارت {idx + 1} از {queue.length} • {(Date.now() - cardStartRef.current) / 1000 | 0} ثانیه</div>
            <div className="text-3xl font-extrabold font-sans text-slate-900 dark:text-slate-100 mb-2" dir="ltr">
              {current.art ? `${current.art} ` : ''}{current.de}
            </div>
            {revealed && (
              <div className="mt-3">
                <button onClick={() => speak(current.de, { onErr: m => onShowToast?.(m, true) })} className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold mb-2">
                  <Volume2 size={14} /> پخش
                </button>
                <p className="text-base font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">{current.fa}</p>
                {current.cat && <p className="text-xs text-[#5d6676] dark:text-[#a3adbd] mt-1">{current.cat}</p>}
              </div>
            )}
          </div>
        )}
        {/* دکمه‌ها */}
        {!revealed ? (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setRevealed(true)} className="py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">👁 معنی</button>
            <button onClick={() => nextCard(null)} className="py-3 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-bold flex items-center justify-center gap-1">
              رد <ChevronRight size={16} />
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => nextCard(false)} className="py-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-sm font-bold flex items-center justify-center gap-1">
              <XIcon size={16} /> ناشناخته
            </button>
            <button onClick={() => nextCard(true)} className="py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-1">
              <Check size={16} /> شناخته
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const shuffle = <T,>(a: T[]): T[] => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};
