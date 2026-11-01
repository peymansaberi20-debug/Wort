export const DAY = 86400000;

export const pad = (n: number | string): string => String(n).padStart(2, '0');

export const dstr = (t: number | Date): string => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const today = (): string => dstr(Date.now());

export const dayStart = (offset: number): number => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d.getTime();
};

export const ymd = (offset: number): string => dstr(dayStart(offset));

/**
 * Gregorian date in purely numeric format: YYYY/MM/DD (no month names!)
 * Fulfills User Request #3: "تاریخ های میلادی نمیخواد اسم ماه بیاد , همه فرمت عددی باشه"
 */
export const formatGregorianNumeric = (t: number | Date): string => {
  const d = new Date(t);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
};

export const formatGregorianMonthDayNumeric = (t: number | Date): string => {
  const d = new Date(t);
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
};

/**
 * Converts a Gregorian date to Solar Hijri (Shamsi/Jalali)
 */
export function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    355666 +
    365 * gy +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) +
    gd +
    g_d_m[gm - 1];
  let jy = -1595 + 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  let jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}

/**
 * Returns Shamsi Day/Month in numeric format e.g. "08/09"
 * Fulfills User Request #6
 */
export function formatShamsiDayMonthNumeric(t: number | Date): string {
  const d = new Date(t);
  const [, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return `${pad(jm)}/${pad(jd)}`;
}

/**
 * Full Shamsi numeric e.g. "1405/08/09"
 */
export function formatShamsiFullNumeric(t: number | Date): string {
  const d = new Date(t);
  const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return `${jy}/${pad(jm)}/${pad(jd)}`;
}

/**
 * Due text calculation using purely numeric Gregorian dates!
 */
export function dueText(w: { last?: number; due?: number }): string {
  if (!w.last) return 'جدید (هنوز مرور نشده)';
  const n = Date.now();
  const due = w.due || 0;
  const d = new Date(due);
  const shamsi = formatShamsiFullNumeric(d);
  const greg = formatGregorianNumeric(d); // Numeric only! No month names!
  const dt = `${shamsi} • ${greg}`;

  if (due <= n) return 'همین حالا';
  if (due < dayStart(1)) return `امروز (${dt})`;
  if (due < dayStart(2)) return `فردا (${dt})`;
  const daysLeft = Math.round((due - dayStart(0)) / DAY);
  return `${daysLeft} روز دیگر (${dt})`;
}
