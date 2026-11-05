import { Word } from '../types';
import { findDuplicateWord } from './duplicates';

/**
 * Safe merging of imported vocabulary into existing records.
 * - The existing record keeps its id, category, learning progress and history.
 * - Incoming non-empty values replace the old ones; empty / placeholder values never erase data.
 */

const CONTENT_FIELDS: (keyof Word)[] = [
  'de', 'art', 'fa', 'syn', 'synFa', 'ant', 'antFa', 'pl', 'pos', 'lvl', 'ex', 'exFa', 'ex2', 'ex2Fa',
  'conj', 'prat', 'perf', 'komparativ', 'superlativ', 'imperativDu', 'imperativIhr', 'imperativSie',
  'sep', 'cloze', 'ans', 'tags', 'notes'
];

export const FIELD_LABELS: Record<string, string> = {
  de: 'کلمهٔ آلمانی', art: 'آرتیکل', fa: 'ترجمهٔ فارسی', syn: 'مترادف', synFa: 'ترجمهٔ مترادف', ant: 'متضاد',
  antFa: 'ترجمهٔ متضاد', pl: 'جمع', pos: 'نوع کلمه', lvl: 'سطح', ex: 'مثال ۱', exFa: 'ترجمهٔ مثال ۱', ex2: 'مثال ۲',
  ex2Fa: 'ترجمهٔ مثال ۲', conj: 'صرف فعل', prat: 'Präteritum', perf: 'Perfekt', komparativ: 'Komparativ',
  superlativ: 'Superlativ', imperativDu: 'امر (du)', imperativIhr: 'امر (ihr)', imperativSie: 'امر (Sie)',
  sep: 'پیشوند جداشدنی', cloze: 'جملهٔ جای‌خالی', ans: 'پاسخ جای‌خالی', tags: 'برچسب‌ها', notes: 'یادداشت', cat: 'دسته'
};

const PLACEHOLDERS = new Set(['', '-', '—', '–', '...', '…', 'n/a', 'na', 'null', 'undefined', 'none', 'unknown', '?']);

/** True when the value carries no real information (empty or a placeholder). */
export const isEmptyValue = (v: unknown): boolean => {
  if (v === null || v === undefined) return true;
  if (Array.isArray(v)) return v.length === 0;
  return PLACEHOLDERS.has(String(v).trim().toLowerCase());
};

export interface MergeOptions {
  /** Replace the category by the incoming one (default: keep the existing category). */
  updateCategory?: boolean;
}

export function mergeWordUpdate(old: Word, incoming: Partial<Word>, opts: MergeOptions = {}): Word {
  const out: any = { ...old };
  CONTENT_FIELDS.forEach(f => {
    const v = (incoming as any)[f];
    if (!isEmptyValue(v)) out[f] = typeof v === 'string' ? v.trim() : v;
  });
  if (Array.isArray(incoming.acc) && incoming.acc.length) {
    out.acc = Array.from(new Set([...(old.acc || []), ...incoming.acc.filter(a => !isEmptyValue(a))]));
  }
  if (opts.updateCategory && !isEmptyValue(incoming.cat)) out.cat = incoming.cat;
  if (isEmptyValue(old.img) && !isEmptyValue(incoming.img)) out.img = incoming.img;
  // never touched: identity and learning data
  out.id = old.id;
  out.added = old.added;
  out.last = old.last;
  out.due = old.due;
  out.ivl = old.ivl;
  out.ease = old.ease;
  out.stage = old.stage;
  out.ok = old.ok;
  out.bad = old.bad;
  out.res = old.res;
  delete out.suggestedNewCat;
  return out as Word;
}

export interface FieldChange {
  field: string;
  label: string;
  from: string;
  to: string;
}

/** Fields that would change if `merged` replaced `old` (for the preview of the confirmation dialog). */
export function diffWords(old: Word, merged: Word): FieldChange[] {
  const out: FieldChange[] = [];
  [...CONTENT_FIELDS, 'cat' as keyof Word].forEach(f => {
    const a = String((old as any)[f] ?? '').trim();
    const b = String((merged as any)[f] ?? '').trim();
    if (a !== b) out.push({ field: String(f), label: FIELD_LABELS[String(f)] || String(f), from: a, to: b });
  });
  return out;
}

export interface Conflict {
  incoming: Word;
  existing: Word;
}

export interface ImportClassification {
  fresh: Word[];
  conflicts: Conflict[];
  invalid: { word: Partial<Word>; reason: string }[];
  /** Entries repeated inside the imported list itself (skipped). */
  repeated: Word[];
}

/** Splits an import into new words, words that already exist, invalid records and in-list repeats. */
export function classifyImport(incoming: Word[], existing: Word[]): ImportClassification {
  const res: ImportClassification = { fresh: [], conflicts: [], invalid: [], repeated: [] };
  const seen: Word[] = [];
  incoming.forEach(w => {
    if (!w || isEmptyValue(w.de)) {
      res.invalid.push({ word: w || {}, reason: 'کلمهٔ آلمانی خالی است' });
      return;
    }
    if (isEmptyValue(w.fa)) {
      res.invalid.push({ word: w, reason: `ترجمهٔ فارسی «${w.de}» خالی است` });
      return;
    }
    if (findDuplicateWord(w.de, w.art, seen)) {
      res.repeated.push(w);
      return;
    }
    seen.push(w);
    const dup = findDuplicateWord(w.de, w.art, existing);
    if (dup) res.conflicts.push({ incoming: w, existing: dup });
    else res.fresh.push(w);
  });
  return res;
}

export interface ImportDecision {
  existingId: string;
  incoming: Word;
  action: 'update' | 'keep';
}

export interface ImportResult {
  words: Word[];
  added: number;
  updated: number;
  skipped: number;
}

/**
 * Pure: applies an import plan to the word list. Nothing is changed unless the plan says so.
 * New words never reuse an id that already exists.
 */
export function applyImportPlan(
  existing: Word[],
  fresh: Word[],
  decisions: ImportDecision[],
  opts: MergeOptions = {},
  now: number = Date.now()
): ImportResult {
  const words = [...existing];
  const ids = new Set(words.map(w => w.id));
  let added = 0;
  let updated = 0;
  let skipped = 0;

  fresh.forEach((w, i) => {
    if (isEmptyValue(w?.de)) return;
    // the same rule as everywhere: a word that appeared in the meantime is not added twice
    if (findDuplicateWord(w.de, w.art, words)) {
      skipped++;
      return;
    }
    let id = w.id;
    if (!id || ids.has(id)) id = `w${now.toString(36)}${i}${Math.random().toString(36).slice(2, 6)}`;
    ids.add(id);
    words.push({ ...w, id, added: w.added || now });
    added++;
  });

  decisions.forEach(d => {
    if (d.action !== 'update') {
      skipped++;
      return;
    }
    const idx = words.findIndex(x => x.id === d.existingId);
    if (idx < 0) {
      skipped++;
      return;
    }
    words[idx] = mergeWordUpdate(words[idx], d.incoming, opts);
    updated++;
  });

  return { words, added, updated, skipped };
}
