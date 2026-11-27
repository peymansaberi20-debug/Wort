/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * wordFamily.ts — خانواده واژگان (درخواست کاربر ۳، اصلاح این دور)
 *
 * تجمیع همهٔ واژه‌ها بر اساس families (مشتقاتشان) برای نمایش در تب واژگان.
 *
 * درخواست کاربر این دور:
 *  - تجمیع: اگر چند واژه به یک سرِ مشترک اشاره می‌کنند (مثلاً abbrechen و brechen و abgebrochen
 *    همگی به brechen مرتبط‌اند)، زیر یک سرِ واحد جمع شوند — نه چند کارت جدا.
 *  - فقط فعل‌های مصدر ساده (بدون پیشوند/پسوند) سرشاخه باشند. اسم/صفت/قید به‌عنوان سرشاخه
 *    در نظر گرفته نمی‌شوند ولی به‌عنوان زیرشاخه طبیعتاً می‌توانند باشند.
 *  - ترجمهٔ مهم هر عضو (داخل پرانتز) برای اعضای ghost (که در واژگان نیستند) نگه‌داری شود.
 */
import { Word } from '../types';
import { parseFamily, fullWord, nz, isVerbPos, isNounPos } from './storage';

export interface FamilyMember {
  word: Word;
  role: 'head' | 'noun' | 'verb' | 'adj';
  /** آیا این واژه توی واژگان کاربر نیست (ghost)؟ درخواست کاربر ۲ */
  isGhost: boolean;
  /** ترجمهٔ مهم فارسی این عضو (برای ghost از پرانتز استخراج می‌شود؛ برای موجود از w.fa) */
  fa: string;
}

export interface WordFamily {
  /** id یکتا — معمولاً lowercase سرِ خانواده (فعل مصدر ساده) */
  id: string;
  /** سرِ خانواده — نمایش برای کاربر */
  head: string;
  /** معنی فارسی سرِ خانواده */
  headFa: string;
  /** آیکن خانواده — فقط فعل سرشاخه است پس همیشه 🔄 */
  icon: string;
  /** آیا سر در واژگان موجود است؟ */
  headExists: boolean;
  /** همهٔ اعضای خانواده (شامل خود سر) */
  members: FamilyMember[];
  /** تعداد اعضا */
  count: number;
  /** سطح CEFR رایج‌ترین عضو */
  level: string;
}

const familyIconFor = (_head: Word | null): string => '🔄'; // درخواست کاربر: فقط فعل سرشاخه است

const lemmaKey = (de: string): string => nz(de).replace(/^(der|die|das|sich)\s+/, '');

/**
 * استخراج ریشهٔ فعل مصدر ساده از یک فعل آلمانی:
 *  - حذف پیشوندهای جداشدنی/جدانشدنی: ab-, an-, auf-, aus-, bei-, ein-, mit-, nach-, vor-, zu-, zurück-, heraus-, hin-, her-, ent-, ver-, be-, ge-, er-, zer-, miss-, emp-, abge-, ...
 *  - حذف پسوند Partizip II: ge- در ابتدا و -t/-en در انتها برای بازیابی مصدر (ساده‌سازی)
 *  - اگر کلمه با حرف بزرگ شروع شد (احتمالاً اسم) یا صفت است، null برگردان (سرشاخه فعل نیست)
 *
 * مثال:
 *   abbrechen → brechen
 *   abgebrochen → brechen (حذف ge- و تبدیل -brochen به -brechen با دیکشنری ساده)
 *   brechen → brechen
 *   ausgehen → gehen
 *   vermissen → missen
 */
const COMMON_SEPARABLE_PREFIXES = [
  'ab', 'an', 'auf', 'aus', 'bei', 'ein', 'entgegen', 'fort', 'her', 'heraus', 'herein',
  'hervor', 'hin', 'hinein', 'hinunter', 'los', 'mit', 'nach', 'nieder', 'statt', 'teil',
  'über', 'um', 'vor', 'vorbei', 'weg', 'zurück', 'zusammen', 'zurecht', 'zufrieden',
  'zukauf', 'zukehr'
];
const COMMON_INSEPARABLE_PREFIXES = ['be', 'ent', 'er', 'ge', 'miss', 'ver', 'zer', 'emp', 'hinter', 'wider', 'voll'];

/** دیکشنری ساده برای برگرداندن Partizip II به مصدر — برای موارد متداول */
const PARTICIPLE_TO_INFINITIVE: Record<string, string> = {
  'gebrochen': 'brechen', 'gesprochen': 'sprechen', 'geschrieben': 'schreiben',
  'gegangen': 'gehen', 'gelaufen': 'laufen', 'gefahren': 'fahren',
  'gekommen': 'kommen', 'gesehen': 'sehen', 'gegeben': 'geben',
  'genommen': 'nehmen', 'gelesen': 'lesen', 'gegessen': 'essen',
  'getrunken': 'trinken', 'geschlafen': 'schlafen', 'getroffen': 'treffen',
  'gefallen': 'fallen', 'gestanden': 'stehen', 'gelegen': 'liegen',
  'gesessen': 'sitzen', 'gehalten': 'halten', 'getragen': 'tragen',
  'geworfen': 'werfen', 'gezogen': 'ziehen', 'geschlossen': 'schließen',
  'gemessen': 'messen', 'vergessen': 'vergessen', 'gelassen': 'lassen',
  'gelitten': 'leiden', 'gelitten2': 'leiden', 'geritten': 'reiten',
  'gebissen': 'beißen', 'gefolgen': 'folgen'
};

/**
 * استخراج سرِ خانواده (فعل مصدر ساده) از یک رشتهٔ آلمانی.
 * اگر رشته اسم یا صفت باشد → null (سرشاخه فعل نیست).
 */
const extractVerbRoot = (de: string): string | null => {
  let s = nz(de).replace(/^(der|die|das|sich)\s+/, '').trim();
  if (!s) return null;
  if (!/^[a-zäöüß]/.test(s)) return null; // حرف بزرگ → اسم (سرشاخه فعل نیست)

  // ۱. اگر در جدول Partizip II بود → مصدر معادل
  if (PARTICIPLE_TO_INFINITIVE[s]) return PARTICIPLE_TO_INFINITIVE[s];

  // ۲. حذف پیشوند ge- + پسوند -t یا -en برای تشخیص Partizip II
  // مثلاً ge+mach+t → mach
  if (/^ge.+t$/.test(s) && s.length > 5) {
    const candidate = s.replace(/^ge/, '').replace(/t$/, '');
    // اگر به یک مصدر معقول می‌رسیم (طول >= ۳ و تماماً حروف کوچک)
    if (candidate.length >= 3 && /^[a-zäöüß]+$/.test(candidate)) {
      // برگرداندن به حالت مصدر با افزودن -en اگر فعلاً -en ندارد
      const withEn = /en$/.test(candidate) ? candidate : candidate + 'en';
      return withEn;
    }
  }

  // ۳. حذف پیشوندهای جداشدنی و جدا نشدنی متداول
  const allPrefixes = [...COMMON_SEPARABLE_PREFIXES, ...COMMON_INSEPARABLE_PREFIXES].sort((a, b) => b.length - a.length);
  for (const p of allPrefixes) {
    if (s.startsWith(p) && s.length > p.length + 2) {
      const rest = s.slice(p.length);
      // اگر بعد از حذف پیشوند، مصدر معقول داریم (با -en تمام می‌شود)
      if (/en$/.test(rest) && rest.length >= 3) {
        return rest;
      }
    }
  }

  // ۴. اگر خودش -en دارد، خودش سرشاخه است
  if (/en$/.test(s)) return s;

  return null;
};

/**
 * ساخت فهرست خانواده‌ها از همهٔ واژه‌ها.
 *
 * الگوریتم تجمیع (درخواست کاربر ۶):
 *   ۱. برای هر واژه که در notes خط «خانواده واژگانی» دارد، سرشاخهٔ منطقی را پیدا کن:
 *      - اگر خودش فعل ساده است → خودش سرشاخه
 *      - اگر فعل با پیشوند/پسوند است (مثل abgebrochen) → ریشه‌اش (brechen) را سرشاخه بگیر
 *      - اگر اسم/صفت/قید است → در notes را بررسی کن: آیا به فعل اشاره می‌کند؟ آن فعل سرشاخه‌است
 *   ۲. اعضایی که به یک سرشاخهٔ مشترک اشاره می‌کنند، زیر همان سرشاخه جمع می‌شوند.
 *   ۳. فقط فعل‌های مصدر ساده به‌عنوان سرشاخهٔ نمایش در فهرست لیست می‌شوند.
 */
export const buildWordFamilies = (words: Word[]): WordFamily[] => {
  // نقشهٔ واژه‌ها بر اساس lemma
  const byLemma = new Map<string, Word>();
  for (const w of words) {
    const k = lemmaKey(w.de);
    if (k && !byLemma.has(k)) byLemma.set(k, w);
  }

  // برای هر واژه که در notes خانواده دارد، «سرشاخهٔ منطقی» را پیدا کن
  // خانواده‌ها به‌صورت Map<rootLemma, { head: Word | null; members: FamilyMember[] }> نگه‌داری می‌شوند
  interface FamAgg {
    headWord: Word | null; // سرشاخهٔ واقعی (ممکن است توی واژگان نباشد)
    headDe: string; // متن سرشاخه
    headFa: string;
    members: FamilyMember[];
  }
  const families = new Map<string, FamAgg>();

  /**
   * افزودن یا ایجاد خانواده بر اساس سرشاخه
   */
  const ensureFamily = (rootLemma: string, headDe: string, headFa: string, headWord: Word | null): FamAgg => {
    if (!families.has(rootLemma)) {
      families.set(rootLemma, {
        headWord,
        headDe,
        headFa,
        members: []
      });
    }
    return families.get(rootLemma)!;
  };

  for (const w of words) {
    const fam = parseFamily(w.notes);
    if (fam.nounsFa.length === 0 && fam.verbsFa.length === 0 && fam.adjsFa.length === 0) continue;

    // پیدا کردن سرشاخهٔ منطقی برای این واژه
    let rootDe: string | null = null;
    let rootWord: Word | null = null;

    // حالت ۱: خود واژه فعل ساده است (سرشاخه است)
    if (isVerbPos(w.pos)) {
      const r = extractVerbRoot(w.de);
      if (r) {
        rootDe = r;
        rootWord = byLemma.get(lemmaKey(r)) || null;
      }
    }

    // حالت ۲: اگر واژه اسم/صفت/قید است یا فعل با پیشوند، ولی در notes فعل مرتبط دارد، آن فعل سرشاخه است
    if (!rootDe && fam.verbsFa.length > 0) {
      const firstVerb = fam.verbsFa[0].de;
      const r = extractVerbRoot(firstVerb);
      if (r) {
        rootDe = r;
        rootWord = byLemma.get(lemmaKey(r)) || null;
      }
    }

    // حالت ۳: اگر هیچ فعل منطقی پیدا نشد، این واژه فاقد سرشاخهٔ فعل است → رد شو
    // (درخواست کاربر: فقط فعل‌ها سرشاخه هستند)
    if (!rootDe) continue;

    const rootLemma = lemmaKey(rootDe);
    const headFa = rootWord?.fa || (fam.verbsFa.find(v => nz(v.de) === nz(rootDe))?.fa || '');
    const famAgg = ensureFamily(rootLemma, rootDe, headFa, rootWord);

    // افزودن خود واژه به‌عنوان عضو (اگر خودش سرشاخه نیست و هنوز اضافه نشده)
    const wLemma = lemmaKey(w.de);
    if (wLemma !== rootLemma && !famAgg.members.some(m => nz(m.word.de) === wLemma && !m.isGhost)) {
      const role: FamilyMember['role'] = isVerbPos(w.pos) ? 'verb' : isNounPos(w.pos) ? 'noun' : 'adj';
      famAgg.members.push({
        word: w,
        role,
        isGhost: false,
        fa: w.fa || ''
      });
    } else if (wLemma === rootLemma && rootWord?.id === w.id) {
      // خود سرشاخه را به‌عنوان عضو head اضافه می‌کنیم بعداً
    }

    // افزودن اعضای خانواده از notes
    for (const nf of fam.nounsFa) {
      const mk = lemmaKey(nf.de);
      const mw = byLemma.get(mk);
      const exists = !!mw;
      // اگر واژه در واژگان موجود است و در members فعلی موجود است، رد شو
      if (mw && famAgg.members.some(m => nz(m.word.de) === mk && !m.isGhost)) continue;
      // اگر قبلاً به‌عنوان ghost اضافه شده و حالا نسخهٔ واقعی داریم، ghost را حذف کن
      if (mw) {
        famAgg.members = famAgg.members.filter(m => !(nz(m.word.de) === mk && m.isGhost));
        famAgg.members.push({
          word: mw,
          role: 'noun',
          isGhost: false,
          fa: mw.fa || nf.fa
        });
      } else {
        // ghost — ترجمه از پرانتز استخراج شده
        const ghost: Word = {
          ...w,
          id: `ghost-${mk}-${w.id}`,
          de: nf.de.replace(/^(der|die|das)\s+/i, ''),
          art: (nf.de.match(/^(der|die|das)/i) || [])[0]?.toLowerCase() || '',
          fa: nf.fa,
          pos: 'اسم'
        };
        famAgg.members.push({ word: ghost, role: 'noun', isGhost: true, fa: nf.fa });
      }
    }
    for (const vf of fam.verbsFa) {
      const vk = lemmaKey(vf.de);
      const vw = byLemma.get(vk);
      // خود سرشاخه را رد کن — آن جدا اضافه می‌شود
      if (vk === rootLemma) continue;
      if (vw && famAgg.members.some(m => nz(m.word.de) === vk && !m.isGhost)) continue;
      if (vw) {
        famAgg.members = famAgg.members.filter(m => !(nz(m.word.de) === vk && m.isGhost));
        famAgg.members.push({
          word: vw,
          role: 'verb',
          isGhost: false,
          fa: vw.fa || vf.fa
        });
      } else {
        const ghost: Word = {
          ...w,
          id: `ghost-${vk}-${w.id}`,
          de: vf.de.replace(/^sich\s+/i, ''),
          art: '',
          fa: vf.fa,
          pos: 'فعل'
        };
        famAgg.members.push({ word: ghost, role: 'verb', isGhost: true, fa: vf.fa });
      }
    }
    for (const af of fam.adjsFa) {
      const ak = lemmaKey(af.de);
      const aw = byLemma.get(ak);
      if (aw && famAgg.members.some(m => nz(m.word.de) === ak && !m.isGhost)) continue;
      if (aw) {
        famAgg.members = famAgg.members.filter(m => !(nz(m.word.de) === ak && m.isGhost));
        famAgg.members.push({
          word: aw,
          role: 'adj',
          isGhost: false,
          fa: aw.fa || af.fa
        });
      } else {
        const ghost: Word = {
          ...w,
          id: `ghost-${ak}-${w.id}`,
          de: af.de,
          art: '',
          fa: af.fa,
          pos: 'صفت'
        };
        famAgg.members.push({ word: ghost, role: 'adj', isGhost: true, fa: af.fa });
      }
    }
  }

  // تبدیل به خروجی نهایی
  const result: WordFamily[] = [];
  for (const [rootLemma, agg] of families.entries()) {
    // اضافه‌کردن خود سرشاخه به‌عنوان عضو head
    let headMember: FamilyMember;
    if (agg.headWord) {
      headMember = { word: agg.headWord, role: 'head', isGhost: false, fa: agg.headWord.fa || agg.headFa };
    } else {
      // سرشاخه توی واژگان نیست — یک ghost بساز
      const ghost: Word = {
        id: `ghost-head-${rootLemma}`,
        de: agg.headDe,
        art: '',
        fa: agg.headFa,
        pos: 'فعل'
      } as any;
      headMember = { word: ghost, role: 'head', isGhost: true, fa: agg.headFa };
    }

    const allMembers = [headMember, ...agg.members];
    if (allMembers.length < 2) continue; // حداقل سر + یک عضو

    // سطح رایج: میانه
    const lvls = allMembers.map(m => m.word.lvl).filter(Boolean);
    const level = lvls.length
      ? lvls.sort((a, b) =>
        (['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].indexOf(a) -
         ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].indexOf(b))
      )[Math.floor(lvls.length / 2)]
      : '';

    result.push({
      id: rootLemma,
      head: agg.headWord ? fullWord(agg.headWord) : agg.headDe,
      headFa: agg.headFa,
      icon: familyIconFor(agg.headWord),
      headExists: !!agg.headWord,
      members: allMembers,
      count: allMembers.length,
      level
    });
  }

  // مرتب‌سازی بر اساس تعداد اعضا (نزولی)
  return result.sort((a, b) => b.count - a.count || a.head.localeCompare(b.head, 'de'));
};

/** آیا واژه در یک خانواده است؟ — برای نمایش badge در پروفایل واژه */
export const wordFamilyOf = (w: Word, words: Word[]): WordFamily | undefined => {
  const fam = parseFamily(w.notes);
  if (fam.nounsFa.length === 0 && fam.verbsFa.length === 0 && fam.adjsFa.length === 0) return undefined;
  const families = buildWordFamilies(words);
  return families.find(f => f.id === lemmaKey(w.de));
};
