/** Personal "mistake notebook": sentences the learner got wrong, reviewed with simple spaced repetition. */
export interface ErrItem {
  id: string; original: string; corrected: string; type: string; why: string;
  added: number; box: number; due: number; ok: number; bad: number;
  /** where the mistake came from: Sprechen | Schreiben | Hören */
  src?: string;
}
const KEY = 'wb_error_book';
const DAYS = [0, 1, 3, 7, 14, 30];
const norm = (s: string) => s.toLowerCase().replace(/[.,!?;:„“”"'()\-–]/g, ' ').replace(/\s+/g, ' ').trim();
export const normSentence = norm;

export const getErrors = (): ErrItem[] => {
  try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
};
// saving notifies the cloud auto-sync (see trainerKit EXTRAS_EVENT)
const save = (a: ErrItem[]) => {
  try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { return; }
  try { window.dispatchEvent(new CustomEvent('wb-extras-changed')); } catch { /* ignore */ }
};

/** Adds new items (deduplicated). Returns how many were really added. */
export const addErrors = (items: { original: string; corrected: string; type?: string; why?: string; src?: string }[]): number => {
  const all = getErrors();
  const seen = new Set(all.map(e => norm(e.original) + '|' + norm(e.corrected)));
  let n = 0;
  for (const it of items) {
    const o = (it.original || '').trim(); const c = (it.corrected || '').trim();
    if (!o || !c || norm(o) === norm(c)) continue;
    const k = norm(o) + '|' + norm(c);
    if (seen.has(k)) continue;
    seen.add(k);
    all.push({ id: 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), original: o, corrected: c, type: it.type || '', why: it.why || '', src: it.src || '', added: Date.now(), box: 0, due: Date.now(), ok: 0, bad: 0 });
    n++;
  }
  if (n) save(all);
  return n;
};
export const dueErrors = (all = getErrors()) => all.filter(e => e.due <= Date.now());
export const weekErrors = (all = getErrors()) => all.filter(e => e.added >= Date.now() - 7 * 86400000);
/** Counts per source and per error type (top first). */
export const errorStats = (list: ErrItem[]) => {
  const count = (f: (e: ErrItem) => string) => {
    const m: Record<string, number> = {};
    list.forEach(e => { const k = f(e); if (k) m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };
  return { bySrc: count(e => e.src || ''), byType: count(e => e.type) };
};
export const gradeError = (id: string, correct: boolean) => {
  const all = getErrors(); const e = all.find(x => x.id === id); if (!e) return;
  if (correct) { e.ok++; e.box = Math.min(5, e.box + 1); e.due = Date.now() + DAYS[e.box] * 86400000; }
  else { e.bad++; e.box = 0; e.due = Date.now(); }
  save(all);
};
export const removeError = (id: string) => save(getErrors().filter(e => e.id !== id));
export const clearErrors = () => save([]);
