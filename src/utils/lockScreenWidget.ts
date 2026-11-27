/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * lockScreenWidget.ts — Widget صفحهٔ قفل گوشی (درخواست کاربر ۱۱)
 *
 * سه واژه در روز با ۳ بازهٔ زمانی:
 *   - صبح تا ظهر (۰۶:۰۰ تا ۱۲:۰۰)
 *   - ظهر تا عصر (۱۲:۰۰ تا ۱۸:۰۰)
 *   - عصر تا آخر شب (۱۸:۰۰ تا ۰۶:۰۰ روز بعد)
 *
 * پیاده‌سازی:
 *   - سه واژه به‌صورت روزانه از state.words انتخاب می‌شوند
 *   - در شروع هر بازه، یک Notification با واژهٔ آن بازه نمایش داده می‌شود
 *   - نگه‌داری در localStorage: واژه‌های امروز + بازهٔ آخر نمایش
 *   - API: Notifications + Badge API (در صورت پشتیبانی مرورگر)
 *
 * برای اندروید، این پیاده‌سازی به‌عنوان «PWA Notifications» روی صفحهٔ قفل
 * و در Notification Center ظاهر می‌شود.
 */
import { Word } from '../types';
import { dstr, DAY } from './dates';

const KEY = 'wb_lock_widget_v1';

type Slot = 'morning' | 'noon' | 'evening';

interface WidgetState {
  date: string;
  words: Record<Slot, { word: Word; shownAt?: number }>;
}

const load = (): WidgetState | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as WidgetState;
    if (s?.date !== dstr(Date.now())) return null;
    return s;
  } catch { return null; }
};

const save = (s: WidgetState): void => {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
};

const shuffle = <T,>(a: T[]): T[] => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

/** انتخاب ۳ واژهٔ روزانه: ترجیحاً سررسید، وگرنه اخیر */
const pickDailyWords = (words: Word[]): { morning: Word; noon: Word; evening: Word } => {
  const now = Date.now();
  const due = words.filter(w => w.last && w.due <= now).sort((a, b) => a.due - b.due);
  const recent = words.filter(w => w.last).sort((a, b) => (b.last || 0) - (a.last || 0));
  const pool = due.length >= 3 ? shuffle(due).slice(0, 3)
    : recent.length >= 3 ? shuffle(recent).slice(0, 3)
    : shuffle(words).slice(0, 3);
  return { morning: pool[0], noon: pool[1 % pool.length], evening: pool[2 % pool.length] };
};

const getSlot = (): Slot => {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'noon';
  return 'evening';
};

/** شمارهٔ بازهٔ برای نمایش به کاربر */
export const SLOT_INFO: Record<Slot, { label: string; faLabel: string; nextHour: number }> = {
  morning: { label: 'Morning', faLabel: 'صبح تا ظهر', nextHour: 12 },
  noon: { label: 'Noon', faLabel: 'ظهر تا عصر', nextHour: 18 },
  evening: { label: 'Evening', faLabel: 'عصر تا شب', nextHour: 6 }
};

/** دریافت یا ساخت ۳ واژهٔ امروز */
export const getTodayWidgetWords = (words: Word[]): WidgetState => {
  const existing = load();
  if (existing) return existing;
  const picked = pickDailyWords(words);
  const s: WidgetState = {
    date: dstr(Date.now()),
    words: {
      morning: { word: picked.morning },
      noon: { word: picked.noon },
      evening: { word: picked.evening }
    }
  };
  save(s);
  return s;
};

/** واژهٔ بازهٔ فعلی */
export const getCurrentSlotWord = (words: Word[]): { slot: Slot; word: Word; info: typeof SLOT_INFO[Slot] } | null => {
  if (words.length === 0) return null;
  const s = getTodayWidgetWords(words);
  const slot = getSlot();
  const entry = s.words[slot];
  if (!entry) return null;
  return { slot, word: entry.word, info: SLOT_INFO[slot] };
};

/**
 * ارسال Notification برای واژهٔ بازهٔ فعلی اگر قبلاً نشان داده نشده.
 * نیازمند Permission: 'granted'
 */
export const notifyCurrentSlot = async (words: Word[]): Promise<boolean> => {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission !== 'granted') return false;
  const s = getTodayWidgetWords(words);
  const slot = getSlot();
  const entry = s.words[slot];
  if (!entry) return false;
  if (entry.shownAt && (Date.now() - entry.shownAt) < 4 * 60 * 60 * 1000) {
    // در ۴ ساعت اخیر نشان داده شده — تکرار نده
    return false;
  }
  const w = entry.word;
  const title = `${SLOT_INFO[slot].faLabel} — واژهٔ ${SLOT_INFO[slot].label}`;
  const body = `${w.art ? w.art + ' ' : ''}${w.de}\n${w.fa || ''}\n\nکلیک کن تا پروفایل همین واژه باز شود.`;
  try {
    // درخواست کاربر ۶: کلیک روی Notification → پروفایل همان واژه باز شود
    const base = typeof import.meta !== 'undefined' && (import.meta as any).env?.BASE_URL;
    const prefix = base && base !== '/' ? base.replace(/\/$/, '') : '';
    const url = `${prefix}/?action=view-word&wordId=${encodeURIComponent(w.id)}`;
    const n = new Notification(title, {
      body,
      icon: `${prefix}/IMG_9115.png`,
      badge: `${prefix}/IMG_9115.png`,
      tag: `wb-${slot}-${s.date}`,
      data: { url } as any
    });
    n.onclick = () => {
      window.focus();
      // ناوبری به URL با اکشن view-word
      try { window.location.href = url; } catch { /* ignore */ }
      n.close();
    };
    entry.shownAt = Date.now();
    save(s);
    return true;
  } catch {
    return false;
  }
};

/**
 * راه‌اندازی Watcher برای ارسال Notification در شروع هر بازه.
 * این watcher را در App.tsx یک‌بار mount کن.
 */
export const startLockWidgetWatcher = (getWords: () => Word[]): () => void => {
  let timer: any = null;
  const tick = async () => { await notifyCurrentSlot(getWords()); };
  // اولین تیک پس از ۵ ثانیه
  setTimeout(() => void tick(), 5000);
  // سپس هر ۱۵ دقیقه بررسی کن (در بازهٔ جدید Notification بفرست)
  timer = setInterval(() => void tick(), 15 * 60 * 1000);
  return () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
};

/** درخواست Permission از کاربر */
export const requestWidgetPermission = async (): Promise<boolean> => {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const r = await Notification.requestPermission();
    return r === 'granted';
  } catch { return false; }
};
