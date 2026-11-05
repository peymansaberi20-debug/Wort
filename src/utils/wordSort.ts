import { Word } from '../types';

export type SortKey = 'cat' | 'alpha' | 'pos' | 'newest' | 'oldest';

export const SORT_LABELS: Record<SortKey, string> = {
  cat: 'دسته‌بندی',
  alpha: 'حروف الفبا (آلمانی)',
  pos: 'نوع کلمه',
  newest: 'جدیدترین افزوده‌شده',
  oldest: 'قدیمی‌ترین افزوده‌شده'
};

/** A word has a reliable creation time only if "added" is a real positive timestamp. */
export const hasTimestamp = (w: Word): boolean => typeof w.added === 'number' && Number.isFinite(w.added) && w.added > 0;

/** "روزمره (Alltag)" → { fa: "روزمره", de: "Alltag" }; names without a German part stay on one line. */
export function splitCategoryName(cat: string): { fa: string; de: string } {
  const t = String(cat || '').trim();
  const m = /^(.*?)\s*[(（]([^()（）]*)[)）]\s*$/.exec(t);
  if (m && m[1].trim() && m[2].trim()) return { fa: m[1].trim(), de: m[2].trim() };
  return { fa: t, de: '' };
}

const de = (a: string, b: string) => (a || '').localeCompare(b || '', 'de', { sensitivity: 'base' });
const fa = (a: string, b: string) => (a || '').localeCompare(b || '', 'fa');
const byWord = (a: Word, b: Word) => de(a.de, b.de) || de(a.art, b.art) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Pure and stable: returns a NEW sorted array, the input (stored vocabulary) is never mutated.
 * Ties are always broken by German word, article and finally id, so the order is deterministic.
 */
export function sortWords(list: Word[], key: SortKey): Word[] {
  const copy = [...list];
  const cmp: Record<SortKey, (a: Word, b: Word) => number> = {
    cat: (a, b) => fa(a.cat, b.cat),
    alpha: () => 0,
    pos: (a, b) => fa(a.pos, b.pos),
    newest: (a, b) => {
      const ha = hasTimestamp(a);
      const hb = hasTimestamp(b);
      if (ha !== hb) return ha ? -1 : 1; // words without a real timestamp always come last
      return ha ? b.added - a.added : 0;
    },
    oldest: (a, b) => {
      const ha = hasTimestamp(a);
      const hb = hasTimestamp(b);
      if (ha !== hb) return ha ? -1 : 1;
      return ha ? a.added - b.added : 0;
    }
  };
  return copy.sort((a, b) => cmp[key](a, b) || byWord(a, b));
}
