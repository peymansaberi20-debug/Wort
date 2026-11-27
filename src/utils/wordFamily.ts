/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * wordFamily.ts — خانواده واژگان (درخواست کاربر ۳)
 *
 * تجمیع همهٔ واژه‌ها بر اساس families (مشتقاتشان) برای نمایش در تب واژگان.
 * - یک فهرست از "خانواده‌ها" می‌سازد: هر خانواده دارای یک سرِ مشخص (مثلاً "gehen")
 *   و اعضای خانواده (اسم‌ها، فعل‌ها، صفت‌ها).
 * - بر اساس parseFamily از storage.ts، اما تجمیع‌شده و قابل نمایش.
 */
import { Word } from '../types';
import { parseFamily, fullWord, nz, isVerbPos, isNounPos } from './storage';

export interface FamilyMember {
  word: Word;
  role: 'head' | 'noun' | 'verb' | 'adj';
}

export interface WordFamily {
  /** id یکتا — معمولاً lowercase سرِ خانواده */
  id: string;
  /** سرِ خانواده — نمایش برای کاربر */
  head: string;
  /** معنی فارسی سرِ خانواده */
  headFa: string;
  /** آیکن خانواده بر اساس نوع سرِ خانواده */
  icon: string;
  /** همهٔ اعضای خانواده (شامل خود سر) */
  members: FamilyMember[];
  /** تعداد اعضا */
  count: number;
  /** سطح CEFR رایج‌ترین عضو */
  level: string;
}

const familyIconFor = (head: Word): string => {
  if (isVerbPos(head.pos)) return '🔄';
  if (isNounPos(head.pos)) return '🌳';
  return '🔗';
};

const lemmaKey = (de: string): string => nz(de).replace(/^(der|die|das|sich)\s+/, '');

/**
 * ساخت فهرست خانواده‌ها از همهٔ واژه‌ها.
 * هر واژه‌ای که در notes خط «خانواده واژگانی» داشته باشد، خانواده‌اش را تشکیل می‌دهد.
 * اعضای خانواده از همان notes استخراج می‌شوند و در صورت وجود واژهٔ واقعی در words،
 * به آن متصل می‌شوند. اگر نبود، نمایش متن خالی است.
 */
export const buildWordFamilies = (words: Word[]): WordFamily[] => {
  // نقشهٔ واژه‌ها بر اساس lemma برای پیدا کردن سریع
  const byLemma = new Map<string, Word>();
  for (const w of words) {
    const k = lemmaKey(w.de);
    if (k && !byLemma.has(k)) byLemma.set(k, w);
  }

  // هر واژه‌ای که در notes خانواده دارد → خانوادهٔ جدید
  const seen = new Set<string>();
  const families: WordFamily[] = [];
  for (const w of words) {
    const fam = parseFamily(w.notes);
    if (fam.nouns.length === 0 && fam.verbs.length === 0 && fam.adjs.length === 0) continue;
    const headKey = lemmaKey(w.de);
    if (seen.has(headKey)) continue;
    seen.add(headKey);
    const members: FamilyMember[] = [{ word: w, role: 'head' }];
    for (const n of fam.nouns) {
      const mk = lemmaKey(n);
      const mw = byLemma.get(mk);
      if (mw && mw.id !== w.id) members.push({ word: mw, role: 'noun' });
      else {
        // واژهٔ اسم در notes موجود نیست — اعضای صوری
        const ghost: Word = {
          ...w,
          id: `ghost-${mk}-${w.id}`,
          de: n.replace(/^(der|die|das)\s+/i, ''),
          art: (n.match(/^(der|die|das)/i) || [])[0]?.toLowerCase() || '',
          fa: ''
        };
        members.push({ word: ghost, role: 'noun' });
      }
    }
    for (const v of fam.verbs) {
      const vk = lemmaKey(v);
      const vw = byLemma.get(vk);
      if (vw && vw.id !== w.id) members.push({ word: vw, role: 'verb' });
      else {
        const ghost: Word = {
          ...w,
          id: `ghost-${vk}-${w.id}`,
          de: v.replace(/^sich\s+/i, ''),
          art: '',
          fa: '',
          pos: 'فعل'
        };
        members.push({ word: ghost, role: 'verb' });
      }
    }
    for (const a of fam.adjs) {
      const ak = lemmaKey(a);
      const aw = byLemma.get(ak);
      if (aw && aw.id !== w.id) members.push({ word: aw, role: 'adj' });
      else {
        const ghost: Word = {
          ...w,
          id: `ghost-${ak}-${w.id}`,
          de: a,
          art: '',
          fa: '',
          pos: 'صفت'
        };
        members.push({ word: ghost, role: 'adj' });
      }
    }
    if (members.length < 2) continue;
    // سطح رایج: مدین
    const lvls = members.map(m => m.word.lvl).filter(Boolean);
    const level = lvls.length
      ? lvls.sort((a, b) =>
        (['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].indexOf(a) -
         ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].indexOf(b))
      )[Math.floor(lvls.length / 2)]
      : '';
    families.push({
      id: headKey,
      head: fullWord(w),
      headFa: w.fa || '',
      icon: familyIconFor(w),
      members,
      count: members.length,
      level
    });
  }
  // مرتب‌سازی بر اساس تعداد اعضا (نزولی)
  return families.sort((a, b) => b.count - a.count || a.head.localeCompare(b.head, 'de'));
};

/** آیا واژه در یک خانواده است؟ — برای نمایش badge در پروفایل واژه */
export const wordFamilyOf = (w: Word, words: Word[]): WordFamily | undefined => {
  const fam = parseFamily(w.notes);
  if (fam.nouns.length === 0 && fam.verbs.length === 0 && fam.adjs.length === 0) return undefined;
  const families = buildWordFamilies(words);
  return families.find(f => f.id === lemmaKey(w.de));
};
