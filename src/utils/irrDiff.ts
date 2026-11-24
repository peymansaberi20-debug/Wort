/**
 * irrDiff.ts — تشخیص «بخش تغییر یافته» در شکل‌های فعل بی‌قاعده + نرمال‌سازی پاسخ
 *
 * ▌منطق هایلایت قرمز:
 *   شکل مشتق (Präteritum / Partizip II) را با مصدر مقایسه می‌کنیم؛ هرچه در ابتدای
 *   مشترک و انتهای مشترک نماند، همان بخشِ تغییر یافته است (قرمز می‌شود):
 *     gehen → g**ing**  (senior g و g پایانی ثابت‌اند، وسط قرمز)
 *     schreiben → schr**ieb**  /  geschrieben → gesch**rieb**en؟ — نه: gesch+**rieb**…
 *   نکته‌های مهم الگوریتم:
 *   - Partizip II با پیشوند ge- : اول ge- کنار گذاشته می‌شود (پیشوند انتظاریِ قاعده‌مند
 *     است، قرمز نمی‌شود) و هسته با مصدر مقایسه می‌شود.
 *   - فعل‌های جداشدنی: در Präteritum هستهٔ اصلی («kam») با مصدرِ بدون پیشوند
 *     («kommen») مقایسه می‌شود؛ ذرهٔ جداشدنی («an») ثابت می‌ماند.
 *   - شکل ضعیف‌مانند (ریشه + te یا ge + ریشه + t بدون تغییر) قرمز نمی‌شود؛
 *     مثل backte یا gehabt که تغییر بی‌قاعده ندارند.
 *   - فعل کمکی Perfekt (ist/hat) همیشه قرمز است — باید همراه فعل حفظ شود.
 */

export interface MarkedSeg {
  text: string;
  changed: boolean;
}

/** طول پیشوند مشترک دو رشته */
const commonPrefix = (a: string, b: string): number => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
};

/** طول پسوند مشترک (حداکثر cap — تا با پیشوند هم‌پوشان نشود) */
const commonSuffix = (a: string, b: string, cap: number): number => {
  let i = 0;
  while (i < cap && i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
  return i;
};

/** بازهٔ [شروع، پایان) بخش تغییر یافتهٔ form نسبت به مرجع — null یعنی تغییر مشخصی ندارد */
const changedRegion = (form: string, ref: string): [number, number] | null => {
  if (form === ref) return null;
  const p = commonPrefix(form, ref);
  const s = commonSuffix(form, ref, form.length - p);
  if (p + s >= form.length) return null;
  return [p, form.length - s];
};

/** ریشهٔ مصدر (حذف پایانهٔ -en یا -n؛ فعل‌های -ieren فقط n حذف می‌شود: studieren → studier) */
export const stemOf = (inf: string): string => {
  if (inf.endsWith('ieren') && inf.length > 6) return inf.slice(0, -1);
  if (inf.length >= 5 && inf.endsWith('en')) return inf.slice(0, -2);
  if (inf.endsWith('n') && inf.length > 3) return inf.slice(0, -1);
  return inf;
};

/**
 * آیا شکل، ضعیفِ قاعده‌مند است (بدون هیچ تغییر ریشه)؟
 *  - ریشهٔ ختم به t/d: پیوند -ete / -et (arbeiten → arbeitete / gearbeitet)
 *  - فعل‌های پیشونددارِ ناجداشدنی بدون ge-: besuchen → besucht
 *  - بقیه: stem + te  /  ge + stem + t
 */
const isWeakLike = (form: string, stem: string, kind: 'prt' | 'pp'): boolean => {
  const f = form.trim();
  if (kind === 'prt') return f === `${stem}te` || f === `${stem}ete`;
  return f === `ge${stem}t` || f === `ge${stem}et` || f === `${stem}t` || f === `${stem}et`;
};

interface MarkOpts {
  inf: string;
  kind: 'prt' | 'pp';
  sep?: string;       // پیشوند جداشدنی مصدر
  override?: string;  // هایلایت دستی (برای فعل‌های مُدال و امثالهم)
}

/** تبدیل یک شکل فعل به قطعه‌های [متن، آیا قرمز است] */
export function markForm(form: string, opts: MarkOpts): MarkedSeg[] {
  const { inf, kind, sep, override } = opts;

  // ۱) هایلایت دستی (فعل‌های مُدال: تغییر وسط کلمه است و مقایسهٔ ساده پیدایش نمی‌کند)
  if (override && form.includes(override)) {
    const at = form.indexOf(override);
    return [
      { text: form.slice(0, at), changed: false },
      { text: override, changed: true },
      { text: form.slice(at + override.length), changed: false },
    ].filter(s => s.text.length > 0);
  }

  const stem = stemOf(inf);

  // ۲) Präteritum فعل جداشدنی («kam an») — هسته با مصدرِ بدون ذره مقایسه می‌شود
  if (kind === 'prt' && form.includes(' ')) {
    const sp = form.indexOf(' ');
    const core = form.slice(0, sp);
    const rest = form.slice(sp + 1);
    const infCore = sep && inf.startsWith(sep) ? inf.slice(sep.length) : inf;
    const reg = isWeakLike(core, stemOf(infCore), 'prt') ? null : changedRegion(core, infCore);
    return [
      ...(reg ? splitByRegion(core, reg) : [{ text: core, changed: false }]),
      { text: ' ' + rest, changed: false },
    ];
  }

  // ۳) Partizip II فعل جداشدنی («angekommen») — ذره + ge کنار گذاشته می‌شود
  if (kind === 'pp' && sep && form.startsWith(sep)) {
    const infCore = inf.slice(sep.length);
    const rest = form.slice(sep.length);
    const hasGe = rest.startsWith('ge') && !infCore.startsWith('ge');
    const core = hasGe ? rest.slice(2) : rest;
    const off = sep.length + (hasGe ? 2 : 0);
    const reg = isWeakLike(hasGe ? `ge${core}` : core, stemOf(infCore), 'pp')
      ? null
      : changedRegion(core, infCore);
    return reg ? splitByRegion(form, reg, off) : [{ text: form, changed: false }];
  }

  // ۴) Partizip II با ge- معمولی («gegangen») — ge کنار گذاشته می‌شود
  if (kind === 'pp' && form.startsWith('ge') && !inf.startsWith('ge')) {
    const reg = isWeakLike(form, stem, 'pp') ? null : changedRegion(form.slice(2), inf);
    if (!reg) return [{ text: form, changed: false }];
    return splitByRegion(form, reg, 2);
  }

  // ۵) مقایسهٔ مستقیم («ging»، «verstanden»، «kam»)
  const reg = isWeakLike(form, stem, kind) ? null : changedRegion(form, inf);
  return reg ? splitByRegion(form, reg) : [{ text: form, changed: false }];
}

/** برش form بر اساس بازهٔ محلی (off = جابه‌جایی وقتی قسمتی از ابتدا حذف شده) */
function splitByRegion(form: string, [a, b]: [number, number], off = 0): MarkedSeg[] {
  const sa = a + off;
  const sb = b + off;
  return [
    { text: form.slice(0, sa), changed: false },
    { text: form.slice(sa, sb), changed: true },
    { text: form.slice(sb), changed: false },
  ].filter(s => s.text.length > 0);
}

/** نرمال‌سازی پاسخ آلمانی (بی‌حساس به بزرگی/کوچکی، ß/ss، اُم‌لاوت و فاصله) */
export function normDe(s: string): string {
  return s.trim().toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/\s+/g, ' ');
}

/** آیا Präteritumِ یک فعل بی‌قاعده است؟ (تغییر ریشه؛ شکل ضعیفِ قاعده‌مند مثل «machte/backte» بی‌قاعده نیست) */
export function isIrregularPrt(inf: string, prt: string, sep?: string): boolean {
  if (!prt.trim()) return false;
  return markForm(prt.trim(), { inf: inf.trim(), kind: 'prt', sep }).some(s => s.changed);
}

/** آیا Partizip II یک فعل بی‌قاعده است؟ (تغییر ریشه یا پایان قوی -en به‌جای -t قاعده‌مند) */
export function isIrregularPp(inf: string, pp: string, sep?: string): boolean {
  const p = pp.trim();
  if (!p) return false;
  const red = markForm(p, { inf: inf.trim(), kind: 'pp', sep }).some(s => s.changed);
  return red || p.endsWith('en');
}

/** تطبیق دو شکل آلمانی — فاصله‌ها هم بی‌اثرند («kam an» ≈ «kaman») */
export function eqDe(a: string, b: string): boolean {
  const x = normDe(a);
  const y = normDe(b);
  return x === y || x.replace(/\s+/g, '') === y.replace(/\s+/g, '');
}
