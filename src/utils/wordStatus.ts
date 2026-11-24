/**
 * موتور وضعیت واژگانی (فاز ۱ طرح «واژگان فعال و دریافتی»).
 *
 * سه وضعیت:
 *  - aktiv   : واژه باید در گفتار و نوشتن «تولید» شود (بازیابی فرم: معنی → واژهٔ آلمانی).
 *  - passiv  : فقط فهم هنگام دیدن/شنیدن کافی است (بازیابی معنی: واژه → معنی)؛
 *              استفاده‌نشدن آن در جمله‌سازی شخصی مسئله‌ای نیست.
 *  - kandidat: بین این دو — شناخت تثبیت شده و آمادهٔ ورود به تمرین‌های تولیدی
 *              (در فاز ۳ به‌صورت خودکار از آستانه‌ها پر می‌شود؛ فعلاً فقط دستی).
 *
 * پیشنهاد خودکار: لِمّاهای هستهٔ پربسامد (freqCore) → aktiv؛ بقیه → passiv.
 * مهاجرت دادهٔ موجود در norm() انجام می‌شود (idempotent؛ وضعیت دستی کاربر حفظ می‌ماند).
 */
import { Word, WordStatus } from '../types';
import { FREQ_CORE } from '../data/freqCore';
import { stripHeadAnnotation } from '../data/verbPrep';

export const WORD_STATUSES: WordStatus[] = ['aktiv', 'kandidat', 'passiv'];

export const STATUS_LABELS: Record<WordStatus, string> = {
  aktiv: 'فعال',
  passiv: 'دریافتی',
  kandidat: 'کاندید فعال‌سازی',
};

export const STATUS_SHORT: Record<WordStatus, string> = {
  aktiv: 'فعال',
  passiv: 'دریافتی',
  kandidat: 'کاندید',
};

export const STATUS_HINTS: Record<WordStatus, string> = {
  aktiv: 'در گفتار و نوشتن به کار می‌برید؛ تمرین تولیدی دارد (جای‌خالی بدون گزینه، ساخت جمله، ترجمه).',
  passiv: 'فقط کافی است هنگام دیدن یا شنیدن معنی را بفهمید؛ استفاده‌نشدن در جمله‌سازی مساله‌ای نیست.',
  kandidat: 'شناختش تثبیت شده و منتظر ورود به تمرین‌های تولیدی است.',
};

/** رنگ نشان وضعیت (پیل کوچک) — سبز: فعال، آبی: دریافتی، کهربایی: کاندید */
export const STATUS_BADGE: Record<WordStatus, string> = {
  aktiv: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  passiv: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  kandidat: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
};

/** نشان با پس‌زمینهٔ تیره برای هدر بنفش/آبی WordDetailModal */
export const STATUS_BADGE_HERO: Record<WordStatus, string> = {
  aktiv: 'bg-emerald-400 text-emerald-950',
  passiv: 'bg-sky-300 text-sky-950',
  kandidat: 'bg-amber-300 text-amber-950',
};

/** رجیسترهای استاندارد با برچسب فارسی — در WordDetailModal به‌صورت چیپ انتخابی */
export const REGISTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'بدون رجیستر' },
  { value: 'neutral', label: 'خنثی' },
  { value: 'umgangssprachlich', label: 'محاوره‌ای (ugs.)' },
  { value: 'schriftsprachlich', label: 'کتابی/نوشتاری' },
  { value: 'gehoben', label: 'رسمی/فاخر (geh.)' },
  { value: 'fachsprachlich', label: 'تخصصی' },
  { value: 'veraltet', label: 'کهنه/غیرمستعمل' },
];

export const REGISTER_LABELS: Record<string, string> = Object.fromEntries(
  REGISTER_OPTIONS.map(o => [o.value, o.label])
);

/** حذف آرتیکل و sich و zu و پسوند حرف اضافه/حالت (+A) و نقطه‌گذاری → لِمّای مقایسه‌پذیر */
export function lemmaOf(de: string): string {
  return stripHeadAnnotation(de || '')
    .toLowerCase()
    .replace(/^\s*(der|die|das|ein|eine|einen|einem|einer|eines|to)\s+/, '')
    .replace(/^\s*sich\s+/, '')
    .replace(/^zu\s+/, '')
    .replace(/[.,;:!?"'()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const VALID: WordStatus[] = WORD_STATUSES;

/** اگر وضعیت ذخیره‌شده معتبر است همان را می‌دهد، وگرنه undefined (تا پیشنهاد اجرا شود) */
export function parseStatus(v: unknown): WordStatus | undefined {
  return VALID.includes(v as WordStatus) ? (v as WordStatus) : undefined;
}

/**
 * پیشنهاد وضعیت اولیه: هستهٔ پربسامد → فعال؛ بقیه → دریافتی.
 * مبنای تصمیم: اصل بسامد (Nation) — واژه‌های پربسامد بازده تمرین مولد دارند.
 */
export function suggestStatus(de: string): WordStatus {
  return FREQ_CORE.has(lemmaOf(de)) ? 'aktiv' : 'passiv';
}

/** وضعیت نهایی یک واژه: دستی کاربر اگر معتبر، وگرنه پیشنهاد خودکار */
export function statusOf(word: Pick<Word, 'de' | 'status'>): WordStatus {
  return word.status || suggestStatus(word.de);
}

/** شمارنده‌های داشبورد/لیست به تفکیک وضعیت */
export function statusCounts(words: Pick<Word, 'de' | 'status'>[]): Record<WordStatus, number> {
  const out: Record<WordStatus, number> = { aktiv: 0, passiv: 0, kandidat: 0 };
  for (const w of words) out[statusOf(w)]++;
  return out;
}

export interface ClusterMember {
  word: Pick<Word, 'id' | 'de' | 'status' | 'register' | 'synCluster' | 'syn'>;
  /** این عضو بلیط فعال خوشه است؟ */
  isCore: boolean;
}

/**
 * اعضای خوشهٔ مترادف یک واژه از میان همهٔ واژگان:
 * ۱) واژه‌هایی که synCluster یکسانی دارند؛ ۲) در نبود آن، اتصال از طریق فیلد syn
 * (واژه‌ای که de آن برابر syn این واژه است یا syn آن شامل de این واژه).
 */
export function clusterOf(word: Word, words: Word[]): ClusterMember[] {
  const members = new Map<string, ClusterMember>();
  const self = statusOf(word);
  members.set(word.id, { word, isCore: self === 'aktiv' });

  const push = (w: Word) => {
    if (w.id === word.id || members.has(w.id)) return;
    members.set(w.id, { word: w, isCore: statusOf(w) === 'aktiv' });
  };

  const cluster = (word.synCluster || '').trim().toLowerCase();
  if (cluster) {
    words.forEach(w => {
      if ((w.synCluster || '').trim().toLowerCase() === cluster) push(w);
    });
  }
  // اتصال از طریق فیلد مترادفِ خود واژه‌ها (فارغ از synCluster)
  const selfLemma = lemmaOf(word.de);
  const synLemma = lemmaOf(word.syn || '');
  words.forEach(w => {
    const wLemma = lemmaOf(w.de);
    const wSynLemma = lemmaOf(w.syn || '');
    if (synLemma && wLemma === synLemma) push(w);
    if (wSynLemma && wSynLemma === selfLemma) push(w);
  });
  return [...members.values()];
}

/**
 * جملهٔ راهنمای خوشه — همان قاعدهٔ «یک بلیط فعال، بقیه دریافتی»:
 * مثال خروجی: «بلیط فعال این خوشه: passieren — sich ereignen را فقط بشناس.»
 */
export function clusterGuide(word: Word, members: ClusterMember[]): string | null {
  if (members.length < 2) return null;
  const self = members.find(m => m.word.id === word.id);
  const core = members.filter(m => m.isCore && m.word.id !== word.id);
  if (self?.isCore) {
    const others = members.filter(m => m.word.id !== word.id).map(m => m.word.de);
    return others.length
      ? `این واژه بلیط فعال خوشه است؛ معادل‌های دیگر (${others.join('، ')}) را فقط بشناس.`
      : null;
  }
  if (core.length) {
    const cores = core.map(m => m.word.de).join('، ');
    return `بلیط فعال این خوشه: ${cores} — ${word.de} را فقط بشناس.`;
  }
  // هیچ عضوی فعال نیست — کاربر باید یکی را انتخاب کند
  const all = members.map(m => m.word.de).join('، ');
  return `از خوشهٔ (${all}) یکی را به‌عنوان بلیط فعال انتخاب کن؛ بقیه دریافتی می‌مانند.`;
}

/* ============================================================
 * فاز ۲: موتور تمرین دوگانه — آمار جداگانهٔ تولیدی/شناختی + ارتقای دریافتی → کاندید
 * ============================================================ */

/** تمرین‌های «تولیدی»: بازیابی فرم آلمانی (معنی → واژه/جمله) — فقط برای واژگان فعال/کاندید منطقی است */
const PROD_KINDS: Set<string> = new Set([
  'prod', 'sent', 'freesent', 'schreiben', 'schreiben_exam', 'vmix_prod', 'act',
]);

/** تمرین‌های «شناختی»: بازیابی معنی (واژه/صدا → معنی) — مسیر اصلی واژگان دریافتی */
const RECOG_KINDS: Set<string> = new Set([
  'flash', 'review', 'daily', 'free', 'hard', 'cloze', 'art', 'dict', 'dikt',
  'plural', 'n2v', 'v2n', 'synant', 'adjdecl', 'errnb', 'vmc',
]);

export type MasteryKind = 'prod' | 'recog' | 'neutral';

/** هر تمرین به کدام دستهٔ تسلط می‌خورد؟ */
export function kindOf(exerciseMode: string): MasteryKind {
  if (PROD_KINDS.has(exerciseMode)) return 'prod';
  if (RECOG_KINDS.has(exerciseMode)) return 'recog';
  return 'neutral';
}

/** آستانهٔ ارتقای دریافتی → کاندید: ۳ موفقیت پیاپی در تمرین شناختی */
export const PROMO_STREAK = 3;

/** فاز ۳ — آستانهٔ ارتقای کاندید → فعال: ۳ تولید پیاپی درست */
export const AKT_STREAK = 3;

/**
 * آمار دوگانهٔ واژه را با نتیجهٔ یک تمرین به‌روز می‌کند.
 * با ورد شیوهٔ عملیاتی ندارد (زمان‌بندی لایتنر جداگانه در sched می‌ماند).
 */
export function applyModeResult(
  word: Pick<Word, 'pOk' | 'pBad' | 'pStreak' | 'rOk' | 'rBad' | 'rStreak'>,
  exerciseMode: string,
  ok: boolean
): Pick<Word, 'pOk' | 'pBad' | 'pStreak' | 'rOk' | 'rBad' | 'rStreak'> {
  const kind = kindOf(exerciseMode);
  if (kind === 'neutral') return {};
  if (kind === 'prod') {
    return {
      pOk: (word.pOk || 0) + (ok ? 1 : 0),
      pBad: (word.pBad || 0) + (ok ? 0 : 1),
      pStreak: ok ? (word.pStreak || 0) + 1 : 0,
    };
  }
  return {
    rOk: (word.rOk || 0) + (ok ? 1 : 0),
    rBad: (word.rBad || 0) + (ok ? 0 : 1),
    rStreak: ok ? (word.rStreak || 0) + 1 : 0,
  };
}

/** آیا واژهٔ دریافتی آمادهٔ ارتقاست؟ (زنجیرهٔ ۳ موفقیت شناختی + حداقل ۴ موفقیت کل) */
export function promotionReady(word: Pick<Word, 'status' | 'rStreak' | 'rOk'>): boolean {
  return word.status === 'passiv' && (word.rStreak || 0) >= PROMO_STREAK && (word.rOk || 0) >= 4;
}

/** فاز ۳: آیا واژهٔ کاندید آمادهٔ ارتقا به فعال است؟ (زنجیرهٔ ۳ تولید پیاپی + حداقل ۴ موفقیت تولیدی کل) */
export function activationReady(word: Pick<Word, 'status' | 'pStreak' | 'pOk'>): boolean {
  return word.status === 'kandidat' && (word.pStreak || 0) >= AKT_STREAK && (word.pOk || 0) >= 4;
}
