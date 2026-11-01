import { Word } from '../types';
import { nz } from './storage';

const ARTS = ['der', 'die', 'das'];
const key = (s: string) => nz((s || '').normalize('NFC'));

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
