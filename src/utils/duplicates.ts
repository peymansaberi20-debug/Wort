import { Word } from '../types';

/**
 * The single duplicate rule of the application (manual entry, JSON import, bulk import, image
 * extraction, merge screen): Unicode NFC, whitespace cleanup, case folding; an article only has to
 * match when both entries have one.
 */
const ARTS = ['der', 'die', 'das'];
const key = (s: string) => (s || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de');

export function parseEntry(input: string, selectedArt = ''): { de: string; art: string } {
  const t = key(input);
  const m = /^(der|die|das)\s+(.+)$/.exec(t);
  if (m) return { art: m[1], de: m[2] };
  const a = key(selectedArt);
  return { art: ARTS.includes(a) ? a : '', de: t };
}

export function findDuplicateWord(
  input: string,
  selectedArt: string,
  words: Word[],
  excludeId?: string | null
): Word | null {
  const { de, art } = parseEntry(input, selectedArt);
  if (!de) return null;
  return (
    words.find(w => {
      if (excludeId && w.id === excludeId) return false;
      const e = parseEntry(w.de, w.art);
      if (e.de !== de) return false;
      return !art || !e.art || e.art === art;
    }) || null
  );
}

export const isDuplicateEntry = (candidate: Partial<Word>, words: Word[], excludeId?: string | null): boolean =>
  !!findDuplicateWord(candidate.de || '', candidate.art || '', words, excludeId);
