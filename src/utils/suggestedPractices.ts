/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * suggestedPractices.ts — توصیه‌گر روزانه (درخواست کاربر ۷)
 *
 * بر اساس داده‌های روزانه کاربر، یک توصیهٔ اولویت‌بندی‌شده تولید می‌کند:
 *   - اگر امروز هنوز هدف روزانه شروع نشده → شروع روزانه
 *   - اگر ساعت ۸ شب گذشته و هدف شروع نشده → «حالت اضطراری» با ویبره
 *   - اگر مرورهای عقب‌افتاده زیاد → مرور سررسیدها
 *   - اگر واژه‌های سخت زیاد → تمرین نقاط ضعف
 *   - اگر واژه‌های فراموش‌شده زیاد → تمرین بازیابی
 *   - وگرنه: یک واژهٔ جدید
 */
import { AppState } from '../types';
import { isLeech } from './storage';
import { dayStart } from './dates';

export type SuggestionKind =
  | 'urgent'           // حالت اضطراری: ۸ شب گذشته و هدف شروع نشده
  | 'daily-not-started' // هدف امروز شروع نشده
  | 'overdue-review'    // مرورهای عقب‌افتاده زیاد
  | 'weak-words'        // واژه‌های سخت زیاد
  | 'forgotten'         // واژه‌های فراموش‌شده زیاد
  | 'new-words'         // واژه‌های جدید
  | 'all-done';         // امروز همه چیز انجام شده

export interface Suggestion {
  kind: SuggestionKind;
  icon: string;
  title: string;
  desc: string;
  /** مسیر navigation برای اجرا (مثل onNavigate string) */
  action: 'daily' | 'review' | 'weak' | 'forgotten' | 'new' | 'none';
  urgent?: boolean; // نوفیفیکیشن/ویبره
  /** تعداد مورد نیاز — برای نمایش */
  count?: number;
}

const FORGOTTEN_DAYS = 60; // ۶۰ روز بدون مرور = «فراموش‌شده»

export const getSuggestion = (state: AppState): Suggestion => {
  const n = Date.now();
  const hour = new Date(n).getHours();
  const dailyDone = state.daily.d === new Date().toISOString().slice(0, 10)
    ? (state.daily.sn || 0) + (state.daily.sr || 0)
    : 0;
  const totalTarget = (state.set.nw || 0) + (state.set.rv || 0);

  const dueReviewWords = state.words.filter(w => w.last && w.due <= n);
  const overdueWords = dueReviewWords.filter(w => w.due < dayStart(0));
  const weakWords = state.words.filter(w => isLeech(w, state.set.leechN || 4));
  const forgotten = state.words.filter(w => w.last && (n - w.last) > FORGOTTEN_DAYS * 86400000);

  // حالت اضطراری: ساعت ۸ شب گذشته و هدف شروع نشده
  if (hour >= 20 && totalTarget > 0 && dailyDone === 0) {
    return {
      kind: 'urgent',
      icon: '🚨',
      title: 'وقت کم است!',
      desc: `${totalTarget} تمرین امروز باقی مانده — همین الان شروع کن تا رشتهٔ استمرارت نشکند.`,
      action: 'daily',
      urgent: true,
      count: totalTarget
    };
  }

  // هدف شروع نشده
  if (totalTarget > 0 && dailyDone < totalTarget) {
    return {
      kind: 'daily-not-started',
      icon: '🌟',
      title: 'جلسهٔ روزانه',
      desc: `${totalTarget - dailyDone} تمرین تا تکمیل هدف امروز — حدود ${Math.ceil(((totalTarget - dailyDone) * 25) / 60)} دقیقه.`,
      action: 'daily',
      count: totalTarget - dailyDone
    };
  }

  // همه چیز انجام شده
  if (totalTarget > 0 && dailyDone >= totalTarget) {
    // اگر واژه‌های فراموش‌شده زیادند → پیشنهاد بازیابی
    if (forgotten.length >= 8) {
      return {
        kind: 'forgotten',
        icon: '🧊',
        title: 'بازیابی واژه‌های فراموش‌شده',
        desc: `${forgotten.length} واژه ۶۰ روز است مرور نشده‌اند — یک جلسهٔ کوتاه بازیابی بزن.`,
        action: 'forgotten',
        count: forgotten.length
      };
    }
    if (weakWords.length >= 5) {
      return {
        kind: 'weak-words',
        icon: '🎯',
        title: 'تمرین نقاط ضعف',
        desc: `${weakWords.length} واژهٔ سخت داری — تمرین اختصاصی بزن.`,
        action: 'weak',
        count: weakWords.length
      };
    }
    return {
      kind: 'all-done',
      icon: '🎉',
      title: 'تمرین امروز کامل شد!',
      desc: 'آفرین! وقت استراحت یا یادگیری یک واژهٔ تازه داری.',
      action: 'none'
    };
  }

  // هدف تنظیم نشده — بر اساس اولویت‌ها پیشنهاد بده
  if (overdueWords.length > 0) {
    return {
      kind: 'overdue-review',
      icon: '⚡',
      title: 'مرور عقب‌افتاده‌ها',
      desc: `${overdueWords.length} واژه عقب‌افتاده — اول این‌ها را مرور کن.`,
      action: 'review',
      count: overdueWords.length
    };
  }
  if (weakWords.length >= 5) {
    return {
      kind: 'weak-words',
      icon: '🎯',
      title: 'تمرین نقاط ضعف',
      desc: `${weakWords.length} واژهٔ سخت داری — تمرین اختصاصی بزن.`,
      action: 'weak',
      count: weakWords.length
    };
  }
  if (forgotten.length >= 8) {
    return {
      kind: 'forgotten',
      icon: '🧊',
      title: 'بازیابی واژه‌های فراموش‌شده',
      desc: `${forgotten.length} واژه ۶۰ روز است مرور نشده‌اند.`,
      action: 'forgotten',
      count: forgotten.length
    };
  }
  return {
    kind: 'new-words',
    icon: '🆕',
    title: 'یادگیری واژهٔ جدید',
    desc: 'همه چیز در حال حاضر به‌نظر می‌رسد — وقت یادگیری واژهٔ جدید!',
    action: 'new'
  };
};

/** آیا در حالت اضطراری هستیم؟ — برای ویبره/انیمیشن */
export const isUrgent = (state: AppState): boolean => {
  const n = Date.now();
  const hour = new Date(n).getHours();
  if (hour < 20) return false;
  const totalTarget = (state.set.nw || 0) + (state.set.rv || 0);
  if (totalTarget === 0) return false;
  const dailyDone = state.daily.d === new Date().toISOString().slice(0, 10)
    ? (state.daily.sn || 0) + (state.daily.sr || 0)
    : 0;
  return dailyDone === 0;
};
