/**
 * Shared kit for the skill trainers (Hören / Lesen / Sprechen / Schreiben / full exam).
 *  - persistent lists mirrored to cloud + backup ("extras")
 *  - AI answers validated against a small schema (with one automatic repair retry) + cache
 *  - cache for generated audio (Cache API)
 *  - exam rules (minutes, max plays)
 */
import { useState } from 'react';
import { generateWithGemini, parseAI } from './ai';

export type Skill = 'lesen' | 'hoeren' | 'schreiben' | 'sprechen';
export interface SkillResult { score: number; max: number; note?: string }
export interface ExamRun {
  org: 'ÖSD' | 'Goethe' | 'telc' | 'EPD';
  level: string;
  minutes: number;
  onFinish: (r: SkillResult) => void;
}

export const MAX_PLAYS = 2;
export const SKILLS: { id: Skill; icon: string; label: string }[] = [
  { id: 'lesen', icon: '📖', label: 'Lesen' },
  { id: 'hoeren', icon: '🎧', label: 'Hören' },
  { id: 'schreiben', icon: '✍️', label: 'Schreiben' },
  { id: 'sprechen', icon: '🗣️', label: 'Sprechen' }
];
/** Approximate official durations (minutes). */
const MIN: Record<string, Record<Skill, number>> = {
  A1: { lesen: 25, hoeren: 20, schreiben: 20, sprechen: 15 },
  A2: { lesen: 30, hoeren: 30, schreiben: 30, sprechen: 15 },
  B1: { lesen: 65, hoeren: 40, schreiben: 60, sprechen: 15 },
  B2: { lesen: 65, hoeren: 40, schreiben: 75, sprechen: 15 },
  C1: { lesen: 70, hoeren: 40, schreiben: 80, sprechen: 20 }
};
export const minutesFor = (level: string, s: Skill): number => (MIN[level] || MIN.B1)[s];

export const TOPICS_DE = ['Wohnungssuche und Hausverwaltung', 'Arbeitsplatz und Beruf', 'Gesundheit und Arztbesuch', 'Reisen und Verkehr', 'Einkaufen und Geld', 'Studium und Weiterbildung', 'Freizeit und Sport', 'Umwelt und Nachhaltigkeit', 'Medien und Internet', 'Behörden und Formulare'];
export const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

/* ---------------------------- persistent lists ("extras") ---------------------------- */
export const ARCHIVE_HOEREN = 'hoeren_trainer_archive_list_v3';
export const ARCHIVE_LESEN = 'wb_lesen_exam_archive_v1';
export const RESULTS_LESEN = 'wb_lesen_results_v1';
export const ERROR_BOOK = 'wb_error_book';
export const EXAM_HISTORY = 'wb_fullexam_history_v1';
export const EXTRA_KEYS = [ARCHIVE_HOEREN, ARCHIVE_LESEN, RESULTS_LESEN, ERROR_BOOK, EXAM_HISTORY];
export const EXTRAS_EVENT = 'wb-extras-changed';

export const loadList = <T,>(key: string): T[] => {
  try { const a = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
};
export const saveList = (key: string, list: any[], silent = false) => {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { return; }
  if (!silent) { try { window.dispatchEvent(new CustomEvent(EXTRAS_EVENT)); } catch { /* ignore */ } }
};
export const collectExtras = (): Record<string, any[]> => {
  const o: Record<string, any[]> = {};
  EXTRA_KEYS.forEach(k => { const l = loadList<any>(k); if (l.length) o[k] = l; });
  return o;
};
/** Union by id (local wins). Never deletes local data. */
export const restoreExtras = (x?: Record<string, any>) => {
  if (!x) return;
  EXTRA_KEYS.forEach(k => {
    const inc = Array.isArray(x[k]) ? x[k] : [];
    if (!inc.length) return;
    const cur = loadList<any>(k);
    const ids = new Set(cur.map(i => i?.id));
    const add = inc.filter((i: any) => i && i.id && !ids.has(i.id));
    if (add.length) saveList(k, [...cur, ...add], true);
  });
};

/* ---------------------------------- helpers ---------------------------------- */
export const hash = (s: string): string => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + s.length.toString(36);
};

export function useNoHelp(): [boolean, (v: boolean) => void] {
  const [v, setV] = useState<boolean>(() => { try { return localStorage.getItem('wb_nohelp') === '1'; } catch { return false; } });
  return [v, (x: boolean) => { setV(x); try { localStorage.setItem('wb_nohelp', x ? '1' : '0'); } catch { /* ignore */ } }];
}

/** Turns an issue (wrong → correct substring) into a full sentence pair for the error book. */
export function sentenceFix(text: string, wrong: string, correct: string): { original: string; corrected: string } {
  const ss = text.replace(/([.!?])\s+/g, '$1\n').split(/\n+/).map(s => s.trim()).filter(Boolean);
  const hit = wrong ? ss.find(s => s.includes(wrong)) : undefined;
  return hit ? { original: hit, corrected: hit.replace(wrong, correct) } : { original: wrong, corrected: correct };
}

/* ------------------------------- AI answer schema ------------------------------- */
export type V = (x: any) => any;
export const S = {
  str: (def = ''): V => x => (x == null ? def : String(x).trim()),
  req: ((x: any) => { const s = x == null ? '' : String(x).trim(); if (!s) throw new Error('empty'); return s; }) as V,
  num: (min: number, max: number, def = 0): V => x => { const n = Number(x); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def; },
  arr: (item: V, min = 0): V => x => {
    const out: any[] = [];
    (Array.isArray(x) ? x : []).forEach(i => { try { out.push(item(i)); } catch { /* drop invalid item */ } });
    if (out.length < min) throw new Error('too few valid items');
    return out;
  },
  obj: (shape: Record<string, V>): V => x => {
    if (!x || typeof x !== 'object') throw new Error('not an object');
    const o: any = {};
    for (const k in shape) o[k] = shape[k](x[k]);
    return o;
  }
};

const CK = 'wb_aicache_v1';
const cget = (k: string): any => { try { return JSON.parse(localStorage.getItem(CK) || '{}')[k]?.v; } catch { return undefined; } };
const cset = (k: string, v: any) => {
  try {
    const m = JSON.parse(localStorage.getItem(CK) || '{}');
    m[k] = { t: Date.now(), v };
    const keys = Object.keys(m);
    if (keys.length > 60) keys.sort((a, b) => m[a].t - m[b].t).slice(0, keys.length - 50).forEach(x => delete m[x]);
    localStorage.setItem(CK, JSON.stringify(m));
  } catch { /* ignore */ }
};

/**
 * Asks the AI for JSON, validates it with `check` and retries once with a repair hint.
 * Throws a Persian error instead of silently returning empty data.
 */
export async function askJson<T = any>(
  prompt: string,
  check: V,
  o: { timeoutMs?: number; retries?: number; cacheKey?: string; call?: (p: string) => Promise<string> } = {}
): Promise<T> {
  if (o.cacheKey) { const c = cget(o.cacheKey); if (c !== undefined) { try { return check(c); } catch { /* stale cache */ } } }
  for (let a = 0; a < 2; a++) {
    try {
      const p = a ? `${prompt}\n\nIMPORTANT: your previous reply was not valid JSON in the required shape. Reply with ONLY the JSON, exactly in the requested shape.` : prompt;
      const raw = o.call ? await o.call(p) : await generateWithGemini(p, { timeoutMs: o.timeoutMs, retries: o.retries ?? 1 });
      const v = check(parseAI(raw)[0]);
      if (o.cacheKey) cset(o.cacheKey, v);
      return v;
    } catch (e: any) {
      if (e?.kind && e.kind !== 'bad_response') throw e; // quota / key / network: do not hammer the provider
    }
  }
  throw new Error('پاسخ معلم ساختار معتبر نداشت؛ دوباره تلاش کنید.');
}

/* -------------------------------- audio cache -------------------------------- */
const audioKey = (t: string) => 'https://wb.local/tts/' + hash(t);
export async function audioGet(text: string): Promise<Blob | null> {
  try {
    if (typeof caches === 'undefined') return null;
    const r = await (await caches.open('wb-tts-v1')).match(audioKey(text));
    return r ? await r.blob() : null;
  } catch { return null; }
}
export async function audioPut(text: string, blob: Blob): Promise<void> {
  try { if (typeof caches !== 'undefined') await (await caches.open('wb-tts-v1')).put(audioKey(text), new Response(blob)); } catch { /* ignore */ }
}
