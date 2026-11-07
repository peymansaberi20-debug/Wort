/**
 * Candidate extraction (OCR / pasted text) and resumable, batch-based external-AI completion.
 * Everything here is pure (no network, no UI) so it can be tested without a browser.
 * Nothing in this file talks to an AI provider: it only builds prompts and validates pasted answers.
 */
import { Word } from '../types';
import { AIPM, aiToIMP, parseAI } from './ai';

/* ------------------------------------------------------------------ */
/* Candidate extraction from recognised / pasted text                  */
/* ------------------------------------------------------------------ */

/** Very frequent function words; only these are dropped (and only if the user keeps the filter on). */
export const TRIVIAL_WORDS = new Set(
  ('der die das den dem des ein eine einen einem einer eines und oder aber ist sind war waren bin bist seid ' +
    'ich du er sie es wir ihr mich dich sich uns euch mein dein sein nicht kein keine zu in im am an auf mit von ' +
    'für bei nach aus um als wie auch noch nur dass wenn ob so da hier dort').split(/\s+/)
);

const ARTICLE_START = /^(?:der|die|das|dem|den|des|ein|eine|einen|einem|einer|eines)\s+/i;

/** Comparison key of a candidate: lower case, no leading article, no surrounding punctuation. */
export function candidateKey(s: string): string {
  return String(s || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(ARTICLE_START, '')
    .replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface SplitOptions {
  /** drop pure function words ("und", "ist", articles ...) – default true */
  dropTrivial?: boolean;
}

/**
 * Deterministic text → candidate list.
 * - A short line (≤ 4 tokens) is kept as one expression, e.g. "sich freuen auf".
 * - A longer line (a sentence) is split into single words.
 * - Bullets, numbering, digits, lone symbols are removed; case-insensitive duplicates are dropped; order is kept.
 */
export function splitCandidates(text: string, opts: SplitOptions = {}): string[] {
  const dropTrivial = opts.dropTrivial !== false;
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    let c = raw
      .replace(/[\u200c\u200f\u200e]/g, '')
      .replace(/[“”„"«»()[\]{}<>|*_`#=+~^\\/]/g, ' ')
      .replace(/^[\s\-–—•·●▪◦\d.)\]:;,]+/u, '')
      .replace(/[\s,;:.!?…]+$/u, '')
      .replace(/\s+/g, ' ')
      .trim();
    c = c.replace(ARTICLE_START, m => (c.split(' ').length > 1 && c.split(' ').length <= 4 ? '' : m)).trim();
    if (c.length < 2 || !/\p{L}/u.test(c) || /^\d+$/.test(c)) return;
    if (/[^\p{L}\p{M}\s'’-]/u.test(c)) {
      // contains digits / odd symbols: keep only the letter parts
      c = c.replace(/[^\p{L}\p{M}\s'’-]+/gu, ' ').replace(/\s+/g, ' ').trim();
      if (c.length < 2) return;
    }
    const key = candidateKey(c);
    if (!key || seen.has(key)) return;
    if (dropTrivial && !key.includes(' ') && TRIVIAL_WORDS.has(key)) return;
    seen.add(key);
    out.push(c);
  };

  String(text || '')
    .split(/\r?\n+/)
    .forEach(line => {
      const parts = line.split(/[;•·|]|\s{3,}|,(?!\s*\p{Ll}{0,2}\s*$)/u);
      parts.forEach(part => {
        const tokens = part.trim().split(/\s+/).filter(Boolean);
        if (tokens.length === 0) return;
        if (tokens.length <= 4) push(part);
        else tokens.forEach(t => push(t));
      });
    });
  return out;
}

/* ------------------------------------------------------------------ */
/* Session candidates and batches                                      */
/* ------------------------------------------------------------------ */

export interface SessionCandidate {
  cid: string; // stable temporary id of this extraction session ("c1", "c2" ...)
  de: string;
  ctx?: string; // optional source context
}

export const BATCH_SIZES = [5, 10, 15] as const;
export type BatchSize = (typeof BATCH_SIZES)[number];
export const DEFAULT_BATCH_SIZE: BatchSize = 10;

/** Ids are never reused inside a session, even after candidates are removed. */
export function makeCandidates(list: { de: string; ctx?: string }[], startAt = 1): SessionCandidate[] {
  return list.map((c, i) => ({ cid: `c${startAt + i}`, de: c.de.trim(), ...(c.ctx ? { ctx: c.ctx } : {}) }));
}

export function chunkCandidates<T>(items: T[], size: number): T[][] {
  const n = Math.max(1, Math.floor(size) || DEFAULT_BATCH_SIZE);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

export interface BatchSession {
  candidates: SessionCandidate[];
  batchSize: BatchSize;
  /** cids whose batch response was validated AND applied/accepted */
  completed: string[];
  /** index of the batch the user is working on */
  current: number;
}

export const newSession = (candidates: SessionCandidate[], batchSize: BatchSize = DEFAULT_BATCH_SIZE): BatchSession => ({
  candidates,
  batchSize,
  completed: [],
  current: 0
});

export const sessionBatches = (s: BatchSession): SessionCandidate[][] => chunkCandidates(s.candidates, s.batchSize);

export interface SessionProgress {
  total: number;
  batches: number;
  current: number; // 1-based
  doneWords: number;
  remaining: number;
  currentWords: SessionCandidate[];
  currentDone: boolean;
}

export function sessionProgress(s: BatchSession): SessionProgress {
  const batches = sessionBatches(s);
  const cur = Math.min(Math.max(0, s.current), Math.max(0, batches.length - 1));
  const done = new Set(s.completed);
  const doneWords = s.candidates.filter(c => done.has(c.cid)).length;
  const currentWords = batches[cur] || [];
  return {
    total: s.candidates.length,
    batches: batches.length,
    current: batches.length ? cur + 1 : 0,
    doneWords,
    remaining: s.candidates.length - doneWords,
    currentWords,
    currentDone: currentWords.length > 0 && currentWords.every(c => done.has(c.cid))
  };
}

/** Changing the batch size keeps the candidates and completed words; the position moves to the first unfinished batch. */
export function setBatchSize(s: BatchSession, size: BatchSize): BatchSession {
  const next = { ...s, batchSize: size };
  const batches = sessionBatches(next);
  const done = new Set(s.completed);
  const first = batches.findIndex(b => b.some(c => !done.has(c.cid)));
  return { ...next, current: first < 0 ? 0 : first };
}

export function gotoBatch(s: BatchSession, index: number): BatchSession {
  const n = sessionBatches(s).length;
  return { ...s, current: Math.min(Math.max(0, index), Math.max(0, n - 1)) };
}

/** Marks the given cids as completed (idempotent: retrying never creates duplicates). */
export function markCompleted(s: BatchSession, cids: string[]): BatchSession {
  const set = new Set([...s.completed, ...cids.filter(id => s.candidates.some(c => c.cid === id))]);
  return { ...s, completed: s.candidates.map(c => c.cid).filter(id => set.has(id)) };
}

/** Next batch with unfinished words after the current one (or -1). */
export function nextOpenBatch(s: BatchSession): number {
  const done = new Set(s.completed);
  const batches = sessionBatches(s);
  for (let i = s.current + 1; i < batches.length; i++) if (batches[i].some(c => !done.has(c.cid))) return i;
  return -1;
}

/* ------------------------------------------------------------------ */
/* Prompt for an external AI                                           */
/* ------------------------------------------------------------------ */

/**
 * Prompt for ONE batch. It contains only the selected words (+ their context) and the app's schema prompt.
 * No network request is made and no credentials can appear in it.
 */
export function buildExternalPrompt(
  batch: SessionCandidate[],
  batchNo: number,
  batchCount: number,
  existing: Word[],
  category?: string
): string {
  const lines = batch.map(c => `[${c.cid}] ${c.de}${c.ctx ? `  (context from source: ${c.ctx.replace(/\s+/g, ' ').slice(0, 160)})` : ''}`);
  return (
    AIPM(lines, existing, category) +
    `\n\n=== BATCH ${batchNo} OF ${batchCount} ===\n` +
    `Every input line starts with an id in square brackets, e.g. [${batch[0]?.cid || 'c1'}]. ` +
    `Add to EACH returned object an extra string field "cid" containing exactly that id (without brackets). ` +
    `Return exactly ${batch.length} objects, one per input line, no duplicates, no extra entries, and do not invent context. ` +
     `Output exactly one JSON array wrapped in a single json Markdown code block, exactly as the master instructions require, with no text outside the block.`
  );
}

/* ------------------------------------------------------------------ */
/* Validation of the pasted answer                                     */
/* ------------------------------------------------------------------ */

export interface BatchValidation {
  ok: boolean;
  /** raw answer objects by candidate id (only for ids that belong to this batch) */
  byCid: Record<string, any>;
  missing: SessionCandidate[];
  extra: any[];
  duplicates: string[];
  problems: string[];
}

export function validateBatchResponse(text: string, batch: SessionCandidate[]): BatchValidation {
  const res: BatchValidation = { ok: false, byCid: {}, missing: [], extra: [], duplicates: [], problems: [] };
  let list: any[];
  try {
    list = parseAI(String(text || ''));
  } catch {
    res.problems.push('پاسخ، JSON معتبر نیست. دستور همین گروه را دوباره کپی کنید و از هوش مصنوعی فقط JSON بخواهید.');
    return res;
  }
  const ids = new Set(batch.map(c => c.cid));
  const byKey = new Map<string, SessionCandidate[]>();
  batch.forEach(c => byKey.set(candidateKey(c.de), [...(byKey.get(candidateKey(c.de)) || []), c]));

  list.forEach(obj => {
    if (!obj || typeof obj !== 'object') {
      res.extra.push(obj);
      return;
    }
    let cid = typeof obj.cid === 'string' ? obj.cid.replace(/[\[\]\s]/g, '') : '';
    if (!ids.has(cid)) {
      // no usable id: fall back to the German word, but only when it identifies exactly one candidate
      const hits = byKey.get(candidateKey(String(obj.de || ''))) || [];
      cid = hits.length === 1 ? hits[0].cid : '';
    }
    if (!cid) {
      res.extra.push(obj);
      return;
    }
    if (res.byCid[cid]) {
      res.duplicates.push(cid);
      return;
    }
    res.byCid[cid] = obj;
  });

  res.missing = batch.filter(c => !res.byCid[c.cid]);
  if (res.missing.length) res.problems.push(`${res.missing.length} واژه در پاسخ نیست: ${res.missing.map(c => c.de).join('، ')}`);
  if (res.extra.length) res.problems.push(`${res.extra.length} مورد اضافه یا ناشناس در پاسخ هست که به هیچ واژهٔ این گروه برنمی‌گردد.`);
  if (res.duplicates.length) res.problems.push(`مورد تکراری در پاسخ: ${res.duplicates.map(id => batch.find(c => c.cid === id)?.de || id).join('، ')}`);
  res.ok = res.problems.length === 0;
  return res;
}

/** Converts a validated answer into app words (batch order); the helper field "cid" never reaches the word. */
export function validationToWords(
  v: BatchValidation,
  batch: SessionCandidate[],
  existing: Word[],
  category?: string
): { ws: Word[]; errs: string[]; cidOfWord: Map<Word, string> } {
  const raws: any[] = [];
  const order: string[] = [];
  batch.forEach(c => {
    const o = v.byCid[c.cid];
    if (!o) return;
    const { cid: _cid, ...rest } = o;
    raws.push(rest);
    order.push(c.cid);
  });
  const { ws, errs } = aiToIMP(raws, existing, category);
  const cidOfWord = new Map<Word, string>();
  // aiToIMP can drop invalid entries; match the survivors back by their German headword
  ws.forEach(w => {
    const hit = batch.find(c => candidateKey(c.de) === candidateKey(w.de)) || batch.find(c => order.includes(c.cid) && candidateKey(c.de) === candidateKey(`${w.art || ''} ${w.de}`));
    if (hit) cidOfWord.set(w, hit.cid);
  });
  return { ws, errs, cidOfWord };
}

/* ------------------------------------------------------------------ */
/* Persistence (no secrets are ever stored here)                       */
/* ------------------------------------------------------------------ */

export const SESSION_KEY = 'wort.extractSession.v1';

export function saveSession(s: BatchSession | null, storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined = globalThis.localStorage): void {
  try {
    if (!storage) return;
    if (!s || s.candidates.length === 0) storage.removeItem(SESSION_KEY);
    else storage.setItem(SESSION_KEY, JSON.stringify({ v: 1, ...s }));
  } catch {
    // storage unavailable: the session simply is not persisted
  }
}

export function loadSession(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): BatchSession | null {
  try {
    const raw = storage?.getItem(SESSION_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || o.v !== 1 || !Array.isArray(o.candidates)) return null;
    const cands: SessionCandidate[] = o.candidates
      .filter((c: any) => c && typeof c.cid === 'string' && typeof c.de === 'string' && c.de.trim())
      .map((c: any) => ({ cid: c.cid, de: c.de, ...(typeof c.ctx === 'string' && c.ctx ? { ctx: c.ctx } : {}) }));
    if (!cands.length) return null;
    const size = (BATCH_SIZES as readonly number[]).includes(o.batchSize) ? (o.batchSize as BatchSize) : DEFAULT_BATCH_SIZE;
    const ids = new Set(cands.map(c => c.cid));
    return {
      candidates: cands,
      batchSize: size,
      completed: Array.isArray(o.completed) ? o.completed.filter((id: any) => ids.has(id)) : [],
      current: Number.isInteger(o.current) && o.current >= 0 ? o.current : 0
    };
  } catch {
    return null;
  }
}
