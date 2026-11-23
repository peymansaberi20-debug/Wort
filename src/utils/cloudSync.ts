import { AppState, Word, HistItem } from '../types';
import { findDuplicateWord, parseEntry } from './duplicates';

/**
 * Lossless merge of two AppState copies (local device ↔ cloud mirror).
 *
 * Why: AutoCloudSync used to replace the whole cloud with the local snapshot,
 * so a device with 18 words wiped a cloud library of 500 words. Merging keeps
 * every word from both sides — the union is always >= the bigger side.
 *
 * Rules:
 * - A word is identified by its id OR by the app-wide duplicate rule (art + de).
 * - Same word on both sides: the copy with the newer review date (`last`) wins;
 *   ties go to more learning progress (`ok`), then to the richer content, then
 *   to local. Empty content fields of the winner are filled from the loser.
 * - `deletedIds` (words present on this device at session start but deleted
 *   since) propagate to the merge; everything else from the cloud survives.
 * - History: union deduped by item id, newest first. Daily goal: newer date
 *   wins, same date takes the maxima. Settings: local wins, cloud fills gaps.
 */

const PROTECTED_FIELDS = new Set(['id', 'acc', 'added', 'last', 'due', 'ivl', 'ease', 'stage', 'ok', 'bad', 'res']);

export interface MergeOptions {
  /** Word ids deliberately deleted on this device during the session. */
  deletedIds?: Set<string>;
}

const richness = (w: Word): number => JSON.stringify(w || {}).length;

/** Progress score of a word: newer review beats more reviews beats richer content. */
function scoreWord(w: Word): [number, number, number] {
  return [Number(w.last) || 0, Number(w.ok) || 0, richness(w)];
}

function betterOf(a: Word, b: Word): [Word, Word] {
  const sa = scoreWord(a);
  const sb = scoreWord(b);
  for (let i = 0; i < 3; i++) {
    if (sa[i] !== sb[i]) return sa[i] > sb[i] ? [a, b] : [b, a];
  }
  return [a, b];
}

/** Bidirectional content fill: winner keeps its values, its gaps come from the loser. */
function mergeWordPair(a: Word, b: Word): Word {
  const [winner, loser] = betterOf(a, b);
  const out: any = { ...winner };
  (Object.keys(loser) as (keyof Word)[]).forEach(k => {
    if (PROTECTED_FIELDS.has(k)) return;
    const wv = (winner as any)[k];
    const lv = (loser as any)[k];
    const wEmpty = wv === null || wv === undefined || wv === '' || (Array.isArray(wv) && !wv.length);
    const lOk = lv !== null && lv !== undefined && lv !== '';
    if (wEmpty && lOk) out[k] = lv;
  });
  out.acc = Array.from(new Set([...(a.acc || []), ...(b.acc || [])]));
  return out as Word;
}

const natKey = (w: Word): string => {
  const { de, art } = parseEntry(w.de || '', w.art || '');
  return `${art}|${de}`;
};

/**
 * Pure: merges the cloud state into the local state. Nothing on either side is
 * lost (except ids listed in `deletedIds`); the local copy keeps its identity.
 */
export function mergeStates(local: AppState, cloud: AppState, opts: MergeOptions = {}): AppState {
  const deleted = opts.deletedIds || new Set<string>();
  const byId = new Map<string, Word>();
  const byNat = new Map<string, Word>();
  const outWords: Word[] = [];

  const absorb = (cand: Word) => {
    if (!cand || !cand.de || deleted.has(cand.id)) return;
    const dup = byId.get(cand.id) || findDuplicateWord(cand.de, cand.art, outWords);
    if (!dup) {
      byId.set(cand.id, cand);
      byNat.set(natKey(cand), cand);
      outWords.push(cand);
      return;
    }
    const merged = mergeWordPair(dup, cand);
    const idx = outWords.indexOf(dup);
    if (idx >= 0) outWords[idx] = merged;
    else outWords.push(merged);
    for (const [k, v] of byNat) if (v === dup) byNat.delete(k);
    for (const [k, v] of byId) if (v === dup) byId.delete(k);
    byId.set(merged.id, merged);
    byNat.set(natKey(merged), merged);
  };

  local.words.forEach(absorb);
  (cloud.words || []).forEach(absorb);

  // history: union deduped by item id, newest first
  const histById = new Map<string, HistItem>();
  [...(local.hist || []), ...(cloud.hist || [])].forEach(h => { if (h && h.id && !histById.has(h.id)) histById.set(h.id, h); });
  const hist = Array.from(histById.values()).sort((x, y) => (y.t || 0) - (x.t || 0));

  // daily goal: newer date wins; on the same date keep the maxima
  const ld = local.daily || { d: '', n: 0, r: 0 };
  const cd = cloud.daily || { d: '', n: 0, r: 0 };
  const daily = ld.d > cd.d ? ld
    : cd.d > ld.d ? cd
    : { d: ld.d || cd.d, n: Math.max(ld.n || 0, cd.n || 0), r: Math.max(ld.r || 0, cd.r || 0) };

  // settings: local wins, cloud fills missing keys
  const set = { ...(cloud.set || {}), ...(local.set || {}) } as AppState['set'];

  return {
    v: Math.max(local.v || 1, cloud.v || 1),
    sv: Math.max(local.sv || 1, cloud.sv || 1),
    words: outWords,
    hist,
    set,
    daily,
  } as AppState;
}

/** True when the two states hold the same word/history ids, daily goal and settings. */
export function sameWordSets(a: AppState, b: AppState): boolean {
  const ids = (s: AppState) => s.words.map(w => w.id).sort().join(',');
  const hids = (s: AppState) => s.hist.map(h => h.id).sort().join(',');
  return ids(a) === ids(b) && hids(a) === hids(b)
    && JSON.stringify(a.daily) === JSON.stringify(b.daily)
    && JSON.stringify(a.set) === JSON.stringify(b.set);
}
