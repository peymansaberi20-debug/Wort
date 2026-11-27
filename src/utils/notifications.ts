/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * notifications.ts — یادآور روزانه با PWA Notifications (درخواست کاربر ۱۸)
 *
 * روند:
 *   ۱) کاربر در تنظیمات یادآور را فعال می‌کند + ساعت را تنظیم می‌کند (مثلاً ۲۰:۳۰).
 *   ۲) برنامه درخواست اجازهٔ Notification می‌کند.
 *   ۳) هر بار که برنامه باز می‌شود، timeout برای ساعت بعدی تنظیم می‌شود.
 *   ۴) در ساعت مقرر، یک یادآور نمایش داده می‌شود («وقت تمرین آلمانی!»).
 *
 * نکته: چون Service Worker در این برنامه فعال نیست (Vite SPA بدون SW)،
 * یادآور فقط وقتی برنامه باز است یا در background tab کار می‌کند.
 * برای push notifications واقعی (حتی وقتی برنامه بسته)، نیاز به Service Worker
 * و Push API است — ولی این پیاده‌سازی برای یادآور در-صفحه کافی است.
 *
 * اگر مرورگر از Notification پشتیبانی نکند (Safari iOS < 16.4)، silent می‌شود.
 */

const SETTINGS_KEY = 'wb_notifications_v1';

export interface NotificationSettings {
  enabled: boolean;
  hour: number;     // 0-23
  minute: number;   // 0-59
  /** آخرین باری که یادآور نشان داده شد (YYYY-MM-DD) — جلوگیری از تکرار در همان روز */
  lastShown?: string;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: false,
  hour: 20,
  minute: 30
};

/** بارگذاری تنظیمات یادآور */
export function loadNotificationSettings(): NotificationSettings {
  try {
    const v = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '');
    if (v && typeof v === 'object') {
      return {
        enabled: !!v.enabled,
        hour: Math.max(0, Math.min(23, Number(v.hour) || DEFAULT_SETTINGS.hour)),
        minute: Math.max(0, Math.min(59, Number(v.minute) || DEFAULT_SETTINGS.minute)),
        lastShown: typeof v.lastShown === 'string' ? v.lastShown : undefined
      };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

function saveNotificationSettings(s: NotificationSettings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

/** آیا مرورگر از Notification API پشتیبانی می‌کند؟ */
export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** سطح دسترسی فعلی: 'default' | 'granted' | 'denied' | 'unsupported' */
export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * درخواست اجازهٔ Notification.
 * @returns true اگر granted، false در غیر این صورت
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const r = await Notification.requestPermission();
    return r === 'granted';
  } catch { return false; }
}

/** تاریخ امروز به‌صورت YYYY-MM-DD */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** فعال‌کردن یادآور + درخواست اجازه */
export async function enableNotifications(hour: number, minute: number): Promise<{ ok: boolean; error?: string }> {
  if (!notificationsSupported()) return { ok: false, error: 'مرورگر شما از Notification پشتیبانی نمی‌کند.' };
  const granted = await requestNotificationPermission();
  if (!granted) return { ok: false, error: 'اجازهٔ Notification داده نشد.' };
  saveNotificationSettings({ enabled: true, hour, minute });
  return { ok: true };
}

/** غیرفعال‌کردن یادآور */
export function disableNotifications(): void {
  saveNotificationSettings({ ...loadNotificationSettings(), enabled: false });
}

/** به‌روزرسانی ساعت یادآور بدون تغییر enabled */
export function updateNotificationTime(hour: number, minute: number): void {
  const s = loadNotificationSettings();
  saveNotificationSettings({ ...s, hour, minute });
}

/**
 * نمایش یادآور — در صورت لزوم.
 * فقط اگر:
 *   - یادآور فعال باشد
 *   - اجازه داده شده باشد
 *   - امروز هنوز نشان داده نشده باشد
 *   - ساعت فعلی ≥ ساعت تنظیم‌شده باشد
 */
export function maybeShowNotification(): void {
  const s = loadNotificationSettings();
  if (!s.enabled) return;
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  if (s.lastShown === todayStr()) return;
  const now = new Date();
  const targetMinutes = s.hour * 60 + s.minute;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  if (nowMinutes < targetMinutes) return; // هنوز نرسیده
  // نشان بده
  try {
    const n = new Notification('🎓 وقت تمرین آلمانی!', {
      body: `هر روز ${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')} یادت می‌آیم. بیا تمرین کنیم!`,
      icon: '/favicon.ico',
      tag: 'wort-daily-reminder',
      silent: false
    });
    n.onclick = () => {
      try { window.focus(); n.close(); } catch { /* ignore */ }
    };
    // Auto-close پس از ۱۰ ثانیه
    setTimeout(() => { try { n.close(); } catch { /* ignore */ } }, 10000);
  } catch { /* ignore */ }
  // ثبت نشان داده‌شدن امروز
  saveNotificationSettings({ ...s, lastShown: todayStr() });
}

/**
 * تنظیم timer برای یادآور — هر دقیقه چک می‌کند.
 * در App.tsx هنگام mount صدا زده می‌شود و cleanup را برمی‌گرداند.
 */
export function startNotificationWatcher(): () => void {
  if (!notificationsSupported()) return () => { /* no-op */ };
  // اولین چک فوری
  maybeShowNotification();
  // بعد هر ۶۰ ثانیه
  const interval = setInterval(maybeShowNotification, 60 * 1000);
  return () => clearInterval(interval);
}

/** متن فارسی ساعت به‌فرمت ۲۴ ساعته */
export function formatTime(hour: number, minute: number): string {
  const h = String(hour).padStart(2, '0');
  const m = String(minute).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * محاسبهٔ زمان تا یادآور بعدی — برای نمایش «یادآور بعدی: ۲ ساعت و ۱۵ دقیقه دیگر».
 * @returns متن فارسی یا null اگر فعال نباشد
 */
export function nextReminderText(): string | null {
  const s = loadNotificationSettings();
  if (!s.enabled) return null;
  const now = new Date();
  const target = new Date();
  target.setHours(s.hour, s.minute, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1); // فردا
  const diffMs = target.getTime() - now.getTime();
  const diffH = Math.floor(diffMs / (60 * 60 * 1000));
  const diffM = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));
  if (diffH === 0) return `یادآور بعدی: ${diffM} دقیقه دیگر`;
  return `یادآور بعدی: ${diffH} ساعت و ${diffM} دقیقه دیگر`;
}
