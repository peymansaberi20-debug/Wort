/** Personal "mistake notebook": sentences the learner got wrong, reviewed with simple spaced repetition. */
export interface ErrItem {
  id: string; original: string; corrected: string; type: string; why: string;
  added: number; box: number; due: number; ok: number; bad: number;
}
const KEY = 'wb_error_book';
const DAYS = [0, 1, 3, 7, 14, 30];
const norm = (s: string) => s.toLowerCase().replace(/[.,!?;:„“”"'()\-–]/g, ' ').replace(/\s+/g, ' ').trim();
export const normSentence = norm;

export const getErrors = (): ErrItem[] => {
  try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
};
const save = (a: ErrItem[]) => { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* ignore */ } };

/** Adds new items (deduplicated). Returns how many were really added. */
export const addErrors = (items: { original: string; corrected: string; type?: string; why?: string }[]): number => {
  const all = getErrors();
  const seen = new Set(all.map(e => norm(e.original) + '|' + norm(e.corrected)));
  let n = 0;
  for (const it of items) {
    const o = (it.original || '').trim(); const c = (it.corrected || '').trim();
    if (!o || !c || norm(o) === norm(c)) continue;
    const k = norm(o) + '|' + norm(c);
    if (seen.has(k)) continue;
    seen.add(k);
    all.push({ id: 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), original: o, corrected: c, type: it.type || '', why: it.why || '', added: Date.now(), box: 0, due: Date.now(), ok: 0, bad: 0 });
    n++;
  }
  if (n) save(all);
  return n;
};
export const dueErrors = (all = getErrors()) => all.filter(e => e.due <= Date.now());
export const gradeError = (id: string, correct: boolean) => {
  const all = getErrors(); const e = all.find(x => x.id === id); if (!e) return;
  if (correct) { e.ok++; e.box = Math.min(5, e.box + 1); e.due = Date.now() + DAYS[e.box] * 86400000; }
  else { e.bad++; e.box = 0; e.due = Date.now(); }
  save(all);
};
export const removeError = (id: string) => save(getErrors().filter(e => e.id !== id));
export const clearErrors = () => save([]);
