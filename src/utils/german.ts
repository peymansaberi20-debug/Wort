/**
 * German orthography / grammar helpers shared by manual entry, AI completion and imports.
 * Pure functions (no I/O) so the same rules apply to every entry path.
 */
import { splitConj } from './conjugation';

const ARTICLE_RE = /^(der|die|das)\s+(.+)$/i;
const NOUN_POS = /^(اسم|noun|nomen|substantiv)$/i;

export const lcFirst = (s: string): string => (s ? s.charAt(0).toLocaleLowerCase('de') + s.slice(1) : s);
export const ucFirst = (s: string): string => (s ? s.charAt(0).toLocaleUpperCase('de') + s.slice(1) : s);

export const isNounEntry = (w: { art?: string; pos?: string }): boolean =>
  !!(w.art || '').trim() || NOUN_POS.test(String(w.pos || '').trim());

/**
 * One synonym / antonym entry.
 * - With an article ("der Kummer"): article stays lower-case, the noun gets a capital letter.
 * - Without an article: a noun (headword is a noun) is capitalised, everything else starts lower-case.
 * Hyphenated / multi-word expressions are only touched at the first letter.
 */
export function fixLexEntry(entry: string, headwordIsNoun: boolean): string {
  const t = String(entry || '').trim().replace(/\s+/g, ' ');
  if (!t) return '';
  const m = ARTICLE_RE.exec(t);
  if (m) return `${m[1].toLowerCase()} ${ucFirst(m[2])}`;
  return headwordIsNoun ? ucFirst(t) : lcFirst(t);
}

/** A "a, b | c" list of synonyms/antonyms: normalises every entry and removes duplicates (case-insensitive). */
export function fixLexList(list: string, headwordIsNoun: boolean): string {
  const seen = new Set<string>();
  const out: string[] = [];
  String(list || '')
    .split(/[,;،؛|]/)
    .forEach(raw => {
      const e = fixLexEntry(raw, headwordIsNoun);
      const key = e.toLowerCase().replace(/^(der|die|das)\s+/, '');
      if (!e || seen.has(key)) return;
      seen.add(key);
      out.push(e);
    });
  return out.join(', ');
}

/** Plural of a noun: "Häuser" (an optional leading "die" is kept lower-case). */
export function fixPlural(pl: string): string {
  const t = String(pl || '').trim().replace(/\s+/g, ' ');
  if (!t) return '';
  const m = /^die\s+(.+)$/i.exec(t);
  return m ? `die ${ucFirst(m[1])}` : ucFirst(t);
}

/* ---------------- verb conjugation validation ---------------- */

const SUBJECT_PRON = /^(ich|du|er|sie|es|wir|ihr|er\/sie\/es|sie\/sie)\s+/i;
const REFLEXIVE = ['mich', 'dich', 'sich', 'uns', 'euch', 'sich'];

export interface ConjValidation {
  ok: boolean;
  forms: string[]; // six forms without subject pronouns (empty array if not usable)
  problems: string[];
}

/**
 * Validates a present-tense table "ich|du|er/sie/es|wir|ihr|sie/Sie".
 * Pronoun labels are not part of the stored forms, every person must appear exactly once,
 * separable verbs keep their prefix at the end and reflexive verbs carry their reflexive pronoun.
 */
export function validateConjTable(conj: string, de: string, sep = ''): ConjValidation {
  const problems: string[] = [];
  const raw = String(conj || '').trim();
  if (!raw) return { ok: true, forms: [], problems };
  const forms = splitConj(raw).map(f => f.trim());
  if (forms.length !== 6) {
    problems.push(`جدول صرف باید دقیقاً شش شکل داشته باشد (${forms.length} شکل یافت شد)`);
    return { ok: false, forms: [], problems };
  }
  forms.forEach((f, i) => {
    if (!f) problems.push(`شکل شمارهٔ ${i + 1} خالی است`);
    if (SUBJECT_PRON.test(f) || /\s+(ich|du|er|es|wir|ihr)$/i.test(f)) problems.push(`ضمیر فاعلی داخل شکل «${f}» تکرار شده است`);
  });
  const reflexive = /^sich\s+/i.test(String(de || '').trim());
  if (reflexive) {
    forms.forEach((f, i) => {
      if (f && !new RegExp(`(^|\\s)${REFLEXIVE[i]}(\\s|$)`, 'i').test(f)) {
        problems.push(`ضمیر بازتابی «${REFLEXIVE[i]}» در شکل «${f}» نیست`);
      }
    });
  }
  const particle = String(sep || '').trim().toLowerCase();
  if (particle) {
    forms.forEach(f => {
      const words = f.toLowerCase().split(/\s+/);
      if (f && words[words.length - 1] !== particle) problems.push(`پیشوند جداشدنی «${particle}» باید آخر شکل «${f}» بیاید`);
    });
  }
  return { ok: problems.length === 0, forms, problems };
}

/** Stored form of a table: six forms joined by "|" when usable, otherwise the original text. */
export const normalizeConj = (conj: string): string => {
  const f = splitConj(conj);
  return f.length === 6 ? f.map(x => x.trim()).join('|') : String(conj || '');
};

/**
 * The same German data-quality rules for every entry path (manual form, AI, JSON, Excel/CSV):
 * noun capitalisation in synonyms / antonyms / plural, no duplicate entries, normalised conjugation table.
 * Returns a copy; empty fields stay empty and nothing is invented.
 */
export function applyGermanQuality<T extends { art?: string; pos?: string; syn?: string; ant?: string; pl?: string; conj?: string }>(w: T): T {
  const out: T = { ...w };
  const noun = isNounEntry(out);
  if (out.syn) out.syn = fixLexList(out.syn, noun);
  if (out.ant) out.ant = fixLexList(out.ant, noun);
  if (out.pl && noun) out.pl = fixPlural(out.pl);
  if (out.conj) out.conj = normalizeConj(out.conj);
  return out;
}
