/**
 * irrLibrary.ts — اتصال کتاب واژگان کاربر به بازی «فعل‌های بی‌قاعده در سه زمان»
 *
 * ▌منطق (درخواست کاربر):
 *   فعل‌های کتاب واژگان برنامه که Präteritum یا Perfekt (Partizip II) بی‌قاعده دارند
 *   به بانک فعل‌های بی‌قاعده اضافه می‌شوند؛ و چون خروجی این ماژول از prop زندهٔ
 *   words محاسبه می‌شود، هر فعل جدیدی که بعداً به واژگان اضافه شود خودکار
 *   در تمرین ظاهر می‌شود (بدون هیچ تنظیم اضافه).
 *
 * ▌تشخیص بی‌قاعدگی (src/utils/irrDiff.ts):
 *   - Präteritum بی‌قاعده است اگر تغییر ریشه داشته باشد (شکل ضعیفِ قاعده‌مند
 *     مثل machte/backte بی‌قاعده شمرده نمی‌شود)
 *   - Partizip II بی‌قاعده است اگر تغییر ریشه داشته باشد یا پایان قوی -en بگیرد
 *     (به‌جای -t قاعده‌مند؛ مثل gebacken در برابر gemacht)
 *
 * ▌فعل کمکی:
 *   - فیلد perf واژه معمولاً کامل است («ist gegangen»، «hat gemacht») → aux از همان‌جا
 *   - اگر فعل کمکی جا افتاده بود: اول بانک (تطابق مصدر)، بعد فهرست فعل‌های sein
 *     (حرکت/تغییر حالت)، وگرنه haben
 *
 * ▌هم‌پوشانی با بانک:
 *   اگر مصدر در بانک آماده موجود باشد، نسخهٔ بانک (با دادهٔ بازبینی‌شده) برنده است
 *   تا یک فعل دو بار در یک جلسه ظاهر نشود؛ بقیهٔ فعل‌های واژگان اضافه می‌شوند.
 */

import { Word } from '../types';
import { IrrVerb, IrrLvl, IRR_LVL_ORDER, IRR_VERBS } from '../data/irregularVerbs';
import { isIrregularPrt, isIrregularPp } from './irrDiff';

/** نگاشت مصدر نرمال‌شده → فعل بانک (برای فعل کمکی و سطح و جاافتاده‌ها) */
const BANK_BY_INF = new Map<string, IrrVerb>(
  IRR_VERBS.map(v => [normInf(v.inf), v])
);

/** مصدر نرمال‌شده برای تطبیق: بدون «sich »، کوچک، بدون فاصلهٔ اضافه */
export function normInf(inf: string): string {
  return inf.trim().replace(/^sich\s+/i, '').toLowerCase();
}

/** پیشوندهای جداشدنی رایج — بلندترین تطبیق اول.
 *  «um/über/unter/wieder» عمداً حذف شدند: هم جداشدنی دارند هم ناجداشدنی (umarmen/umziehen) و حدس خطرناک است؛
 *  برای آن‌ها مقایسهٔ پیشوندیِ markForm کافی و درست است. */
const SEP_PREFIXES = [
  'zurück', 'zusammen', 'weiter', 'herunter', 'hinauf', 'hinunter', 'herauf',
  'empor', 'entlang', 'vorbei', 'nieder', 'rauf', 'runter', 'statt',
  'ab', 'an', 'auf', 'aus', 'bei', 'ein', 'fehl', 'fest', 'fort', 'frei',
  'heim', 'her', 'hin', 'los', 'mit', 'nach', 'vor', 'weg', 'zu',
];

/** تشخیص ذرهٔ جداشدنی از شکل خودِ فعل (شواهد، نه فقط حدس):
 *  prt «ging weiter» → ذره در انتها؛ pp «angekommen» → ذره در ابتدا. */
function detectSep(inf: string, prt: string, pp: string): string | undefined {
  for (const p of SEP_PREFIXES) {
    if (!inf.startsWith(p) || inf.length <= p.length + 2) continue;
    if (prt.endsWith(' ' + p) || prt.startsWith(p + ' ') || pp.startsWith(p)) return p;
  }
  return undefined;
}

/** فقط نخستین معنی — واژه‌های کتاب چند معنی دارند («ادامه دادن به رفتن / ادامه داشتن») و در جدول شلوغ می‌شود */
function firstFa(fa: string): string {
  return (fa.split(/[،,;(|/]/)[0] || '').trim().replace(/\s+/g, ' ');
}

/** فعل کمکی‌های احتمالی در ابتدای فیلد perf */
const AUX_MAP: Record<string, 'haben' | 'sein'> = {
  ist: 'sein', bin: 'sein', war: 'sein',
  hat: 'haben', habe: 'haben', hatte: 'haben',
};

/** فعل‌های حرکت/تغییر حالت — وقتی فعل کمکی در داده نبود و در بانک هم نبود */
const SEIN_HINTS = new Set([
  'gehen', 'fahren', 'kommen', 'laufen', 'fliegen', 'schwimmen', 'springen', 'rennen',
  'bleiben', 'sein', 'werden', 'wachsen', 'aufstehen', 'ankommen', 'umziehen',
  'aussteigen', 'einsteigen', 'einbrechen', 'ausbrechen', 'entstehen', 'verschwinden',
  'fallen', 'gelingen', 'geschehen', 'vergehen', 'geraten', 'auffallen', 'auftreten',
  'sterben', 'begegnen', 'passieren', 'schmelzen', 'erschrecken', 'erfrieren',
  'ertrinken', 'verderben', 'aufwachsen', 'vorbeikommen', 'zurückkehren', 'einziehen',
  'ausgehen', 'aufgehen', 'untergehen', 'aufbrechen', 'weggehen', 'zurückgehen',
]);

/** حدس فعل کمکی از روی مصدر */
function inferAux(inf: string): 'haben' | 'sein' {
  const bank = BANK_BY_INF.get(normInf(inf));
  if (bank) return bank.aux;
  const core = normInf(inf);
  if (SEIN_HINTS.has(core)) return 'sein';
  // مصدرهای جداشدنی با هستهٔ sein-فعل («mitkommen»، «anfangen»)
  for (const hint of SEIN_HINTS) {
    if (core.length > hint.length && core.endsWith(hint)) return 'sein';
  }
  return 'haben';
}

/** سطح معتبر A1–C2؛ نامعتبر → از بانک، وگرنه A1 */
function normalizeLvl(lvl: string | undefined, inf: string): IrrLvl {
  const raw = (lvl || '').trim().toUpperCase();
  if (IRR_LVL_ORDER.includes(raw as IrrLvl)) return raw as IrrLvl;
  const bank = BANK_BY_INF.get(normInf(inf));
  return bank ? bank.lvl : 'A1';
}

/** تبدیل یک واژهٔ فعلِ کتاب واژگان به فرمت بازی — اگر بی‌قاعده نبود یا داده ناقص بود null */
export function wordToIrrVerb(w: Word): IrrVerb | null {
  if (w.pos !== 'فعل') return null;
  const inf = normInf(w.de);
  if (!inf || inf.length < 3) return null;

  // فیلد perf معمولاً «ist/hat + Partizip II» است — فعل کمکی را جدا می‌کنیم
  let pp = (w.perf || '').trim();
  let aux: 'haben' | 'sein' | null = null;
  const first = pp.split(/\s+/)[0]?.toLowerCase() || '';
  if (AUX_MAP[first]) {
    aux = AUX_MAP[first];
    pp = pp.slice(first.length).trim();
  }
  let prt = (w.prat || '').trim();
  const sep = (w.sep || '').trim() || undefined;

  // ضمیر انعکاسی («sich anziehen») — از فرم‌ها هم حذف می‌شود تا مقایسه تمیز باشد
  if (/^sich\s+/i.test(w.de)) {
    pp = pp.replace(/^sich\s+/i, '');
    prt = prt.replace(/\s+sich\s+/i, ' ').replace(/^sich\s+/i, '').trim();
  }

  if (!pp && !prt) return null;
  if (!aux) aux = inferAux(inf);

  // شکل جاافتاده را از بانک می‌گیریم (فعل ناشناختهٔ ناقص وارد بازی نمی‌شود)
  const bank = BANK_BY_INF.get(inf);
  const prtFinal = prt || bank?.prt || '';
  const ppFinal = pp || bank?.pp || '';
  // ذرهٔ جداشدنی: از واژه → از بانک → تشخیص از شکل خود فعل (پیشوند جداشدنیِ ناشناخته هم پیدایش می‌کند)
  const sepFinal = sep || bank?.sep || detectSep(inf, prtFinal, ppFinal);
  if (!prtFinal || !ppFinal) return null;

  // فقط بی‌قاعده‌ها: چه Präteritum بی‌قاعده چه Partizip II چه هر دو
  const irrPrt = isIrregularPrt(inf, prtFinal, sepFinal);
  const irrPp = isIrregularPp(inf, ppFinal, sepFinal);
  if (!irrPrt && !irrPp) return null;

  return {
    inf,
    fa: firstFa(w.fa || ''),
    aux,
    prt: prtFinal,
    pp: ppFinal,
    lvl: normalizeLvl(w.lvl, inf),
    sep: sepFinal,
    src: 'lib',
  };
}

/** همهٔ فعل‌های بی‌قاعدهٔ کتاب واژگان — از prop زندهٔ words؛ هر فعل جدید خودکار می‌آید */
export function libIrregularVerbs(words: Word[] | undefined): IrrVerb[] {
  const out: IrrVerb[] = [];
  const seen = new Set<string>();
  for (const w of words || []) {
    const v = wordToIrrVerb(w);
    if (!v) continue;
    const key = normInf(v.inf);
    // کنترل تکراری در همهٔ سطوح: «gelten für» هم با «geltenِ» بانک B2 یکی است
    const tok = key.split(/\s+/)[0] || key;
    if (seen.has(key) || seen.has(tok)) continue;
    if (BANK_BY_INF.has(key) || BANK_BY_INF.has(tok)) continue;
    seen.add(key);
    if (tok !== key) seen.add(tok);
    out.push(v);
  }
  return out;
}
