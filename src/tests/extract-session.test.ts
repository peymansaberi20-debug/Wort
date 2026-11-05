import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATCH_SIZES, DEFAULT_BATCH_SIZE, buildExternalPrompt, candidateKey, chunkCandidates, gotoBatch, loadSession, makeCandidates,
  markCompleted, newSession, nextOpenBatch, saveSession, sessionBatches, sessionProgress, setBatchSize, splitCandidates,
  validateBatchResponse, validationToWords
} from '../utils/extractSession';
import { copyText } from '../utils/clipboard';
import { fixLexEntry, fixLexList, fixPlural, normalizeConj, validateConjTable } from '../utils/german';
import { aiFix } from '../utils/ai';

const cands = (n: number) => makeCandidates(Array.from({ length: n }, (_, i) => ({ de: `Wort${i + 1}` })));
const answer = (batch: { cid: string; de: string }[], extra: Record<string, any> = {}) =>
  JSON.stringify(batch.map(c => ({ cid: c.cid, de: c.de, art: 'das', fa: 'ترجمه', pos: 'اسم', lvl: 'A2', cat: 'روزمره (Alltag)', ...extra })));

/* ---------- local text -> candidates ---------- */
test('text candidates: expressions kept, sentences split, duplicates and trivial words removed, order kept', () => {
  const out = splitCandidates('1. die Schule\nder Tisch; das Buch\nIch gehe heute in die Schule und lerne Deutsch.\nsich freuen auf\nSchule\n42\n• Hausaufgabe');
  assert.deepEqual(out.slice(0, 3), ['Schule', 'Tisch', 'Buch']);
  assert.ok(out.includes('sich freuen auf'));
  assert.ok(out.includes('Hausaufgabe') && out.includes('lerne') && out.includes('Deutsch'));
  assert.equal(out.filter(x => candidateKey(x) === 'schule').length, 1);
  assert.ok(!out.includes('und') && !out.includes('die') && !out.includes('42'));
  assert.deepEqual(splitCandidates('   \n  '), []);
  assert.deepEqual(splitCandidates('der die und'), []);
});

test('text candidates: umlauts, ß and short real words are not discarded', () => {
  const out = splitCandidates('Größe\nÜbung\nSpaß\nAuto\nOhr');
  assert.deepEqual(out, ['Größe', 'Übung', 'Spaß', 'Auto', 'Ohr']);
  assert.deepEqual(splitCandidates('und\nist', { dropTrivial: false }), ['und', 'ist']);
});

/* ---------- batches ---------- */
test('batch sizes and default', () => {
  assert.deepEqual([...BATCH_SIZES], [5, 10, 15]);
  assert.equal(DEFAULT_BATCH_SIZE, 10);
});

test('batching: 1 word, fewer than the size, exactly one batch, 30 words, short last batch', () => {
  const lens = (n: number, size = 10) => sessionBatches(newSession(cands(n), size as any)).map(b => b.length);
  assert.deepEqual(lens(1), [1]);
  assert.deepEqual(lens(7), [7]);
  assert.deepEqual(lens(10), [10]);
  assert.deepEqual(lens(30), [10, 10, 10]);
  assert.deepEqual(lens(23), [10, 10, 3]);
  assert.deepEqual(lens(30, 15), [15, 15]);
  assert.deepEqual(lens(11, 5), [5, 5, 1]);
  assert.deepEqual(chunkCandidates([1, 2, 3], 2), [[1, 2], [3]]);
  const p = sessionProgress(newSession(cands(30)));
  assert.deepEqual([p.total, p.batches, p.current, p.doneWords, p.remaining, p.currentWords.length], [30, 3, 1, 0, 30, 10]);
});

test('candidate ids are unique and stable; identical text gets distinct ids', () => {
  const c = makeCandidates([{ de: 'Bank' }, { de: 'Bank' }, { de: 'Bänke' }]);
  assert.equal(new Set(c.map(x => x.cid)).size, 3);
});

/* ---------- external prompt ---------- */
test('external prompt: only the batch words, ids, strict JSON rules; no network and no secrets', () => {
  const realFetch = (globalThis as any).fetch;
  let called = 0;
  (globalThis as any).fetch = () => { called++; throw new Error('network must not be used'); };
  try {
    const s = newSession(cands(12), 5);
    const [b1] = sessionBatches(s);
    const prompt = buildExternalPrompt(b1, 1, 3, [], undefined);
    assert.equal(called, 0);
    assert.match(prompt, /\[c1\] Wort1/);
    assert.match(prompt, /\[c5\] Wort5/);
    assert.doesNotMatch(prompt, /Wort6/);
    assert.match(prompt, /BATCH 1 OF 3/);
    assert.match(prompt, /"cid"/);
    assert.match(prompt, /without Markdown code fences/);
    assert.doesNotMatch(prompt, /AIza|sk-|gsk_|Bearer/);
  } finally {
    (globalThis as any).fetch = realFetch;
  }
});

/* ---------- validation ---------- */
test('valid answer for a batch maps every word', () => {
  const b = cands(3);
  const v = validateBatchResponse(answer(b), b);
  assert.equal(v.ok, true);
  const r = validationToWords(v, b, []);
  assert.equal(r.ws.length, 3);
  assert.equal(r.errs.length, 0);
  assert.ok(r.ws.every(w => !('cid' in (w as any))));
});

test('invalid JSON is reported and nothing is accepted', () => {
  const v = validateBatchResponse('Hier sind die Wörter: {kaputt', cands(2));
  assert.equal(v.ok, false);
  assert.match(v.problems[0], /JSON/);
});

test('missing words are listed and the batch is not complete', () => {
  const b = cands(3);
  const v = validateBatchResponse(answer(b.slice(0, 2)), b);
  assert.equal(v.ok, false);
  assert.deepEqual(v.missing.map(c => c.cid), ['c3']);
});

test('unexpected extra record and duplicates are detected', () => {
  const b = cands(2);
  const raw = JSON.parse(answer(b));
  raw.push({ cid: 'c99', de: 'Fremd', fa: 'x' });
  raw.push({ cid: 'c1', de: 'Wort1', fa: 'x' });
  const v = validateBatchResponse(JSON.stringify(raw), b);
  assert.equal(v.ok, false);
  assert.equal(v.extra.length, 1);
  assert.deepEqual(v.duplicates, ['c1']);
});

test('similar word text: ids decide, the German word is only a unique fallback', () => {
  const b = makeCandidates([{ de: 'Bank' }, { de: 'Bank' }]); // same text twice
  const noIds = JSON.stringify([{ de: 'Bank', fa: 'a', pos: 'اسم' }, { de: 'Bank', fa: 'b', pos: 'اسم' }]);
  assert.equal(validateBatchResponse(noIds, b).ok, false); // ambiguous without ids
  const withIds = JSON.stringify([{ cid: 'c2', de: 'Bank', fa: 'b', pos: 'اسم' }, { cid: 'c1', de: 'Bank', fa: 'a', pos: 'اسم' }]);
  const v = validateBatchResponse(withIds, b);
  assert.equal(v.ok, true);
  assert.equal(v.byCid.c1.fa, 'a');
  const noCid = validateBatchResponse(JSON.stringify([{ de: 'die Schule', fa: 'مدرسه' }]), makeCandidates([{ de: 'Schule' }]));
  assert.equal(noCid.ok, true); // unique fallback by word (article ignored)
});

/* ---------- session progress, retry, going back ---------- */
test('retry does not duplicate completions; failed batch keeps its words; earlier batch reachable', () => {
  let s = newSession(cands(25), 10);
  const [b1, b2] = sessionBatches(s);
  s = markCompleted(s, b1.map(c => c.cid));
  s = markCompleted(s, b1.map(c => c.cid)); // retried
  assert.equal(s.completed.length, 10);
  assert.equal(nextOpenBatch(s), 1);
  s = gotoBatch(s, 1);
  let p = sessionProgress(s);
  assert.deepEqual([p.current, p.doneWords, p.remaining, p.currentDone], [2, 10, 15, false]);
  // failed answer for batch 2 -> nothing is marked
  const bad = validateBatchResponse('nonsense', b2);
  assert.equal(bad.ok, false);
  assert.equal(sessionProgress(s).doneWords, 10);
  // go back to batch 1: still complete, completed list unchanged
  s = gotoBatch(s, 0);
  p = sessionProgress(s);
  assert.equal(p.currentDone, true);
  assert.equal(s.completed.length, 10);
  // unknown ids are ignored
  assert.equal(markCompleted(s, ['zzz']).completed.length, 10);
});

test('changing the batch size keeps progress and moves to the first open batch', () => {
  let s = newSession(cands(30), 10);
  s = markCompleted(s, sessionBatches(s)[0].map(c => c.cid));
  s = setBatchSize(s, 5);
  assert.equal(sessionBatches(s).length, 6);
  assert.equal(s.current, 2);
  assert.equal(s.completed.length, 10);
});

/* ---------- persistence ---------- */
test('session persistence round-trip without secrets, corrupt data is ignored', () => {
  const mem: Record<string, string> = {};
  const storage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
  let s = newSession(cands(12), 5);
  s = markCompleted(s, ['c1', 'c2']);
  saveSession(s, storage);
  const back = loadSession(storage)!;
  assert.deepEqual(back.completed, ['c1', 'c2']);
  assert.equal(back.batchSize, 5);
  assert.doesNotMatch(Object.values(mem).join(''), /key|token|secret/i);
  mem['wort.extractSession.v1'] = '{kaputt';
  assert.equal(loadSession(storage), null);
  saveSession(null, storage);
  assert.equal(Object.keys(mem).length, 0);
});

/* ---------- clipboard ---------- */
test('clipboard failure is reported honestly (no navigator / no document)', async () => {
  assert.equal(await copyText('abc'), false);
});

/* ---------- German data quality ---------- */
test('synonyms/antonyms: nouns keep capitals and articles, others start lower-case, duplicates removed', () => {
  assert.equal(fixLexEntry('der kummer', true), 'der Kummer');
  assert.equal(fixLexEntry('gebäude', true), 'Gebäude');
  assert.equal(fixLexEntry('Schnell', false), 'schnell');
  assert.equal(fixLexList('gebäude, Heim, heim, das haus', true), 'Gebäude, Heim, das Haus');
  assert.equal(fixLexList('Schnell, rasch', false), 'schnell, rasch');
  assert.equal(fixPlural('häuser'), 'Häuser');
  assert.equal(fixPlural('die häuser'), 'die Häuser');
});

test('aiFix keeps noun capitalisation in syn/ant/pl and normalises the conjugation', () => {
  const r = aiFix({ de: 'Haus', art: 'das', pos: 'اسم', fa: 'خانه', syn: 'gebäude, heim', ant: 'wohnung', pl: 'häuser', cloze: 'Das ___ ist groß.' });
  assert.equal(r.syn, 'Gebäude, Heim');
  assert.equal(r.ant, 'Wohnung');
  assert.equal(r.pl, 'Häuser');
  const v = aiFix({ de: 'gehen', pos: 'فعل', fa: 'رفتن', syn: 'Laufen', conj: 'ich gehe|du gehst|er/sie/es geht|wir gehen|ihr geht|sie/Sie gehen' });
  assert.equal(v.conj, 'gehe|gehst|geht|gehen|geht|gehen');
  assert.equal(v.syn, 'laufen');
});

test('conjugation validation: separable, reflexive, both; duplicated pronouns; wrong count', () => {
  assert.equal(validateConjTable('gehe|gehst|geht|gehen|geht|gehen', 'gehen').ok, true);
  assert.equal(validateConjTable('rufe an|rufst an|ruft an|rufen an|ruft an|rufen an', 'anrufen', 'an').ok, true);
  assert.equal(validateConjTable('freue mich|freust dich|freut sich|freuen uns|freut euch|freuen sich', 'sich freuen').ok, true);
  assert.equal(validateConjTable('ziehe mich an|ziehst dich an|zieht sich an|ziehen uns an|zieht euch an|ziehen sich an', 'sich anziehen', 'an').ok, true);
  const dup = validateConjTable('ich gehe ich|du gehst|er geht|wir gehen|ihr geht|sie gehen', 'gehen');
  assert.equal(dup.ok, false);
  assert.equal(validateConjTable('gehe|gehst|geht', 'gehen').ok, false);
  const noRefl = validateConjTable('freue|freust|freut|freuen|freut|freuen', 'sich freuen');
  assert.equal(noRefl.ok, false);
  const wrongPrefix = validateConjTable('an rufe|rufst an|ruft an|rufen an|ruft an|rufen an', 'anrufen', 'an');
  assert.equal(wrongPrefix.ok, false);
  assert.equal(normalizeConj('ich fahre|du fährst|er fährt|wir fahren|ihr fahrt|sie fahren'), 'fahre|fährst|fährt|fahren|fahrt|fahren');
});

import { applyGermanQuality } from '../utils/german';
import { ocrQuality } from '../utils/ocr';
import { applyImportPlan, classifyImport, mergeWordUpdate } from '../utils/vocabMerge';
import { SORT_LABELS, sortWords, splitCategoryName, hasTimestamp } from '../utils/wordSort';

test('shared quality rules give the same result for every entry path', () => {
  const w = applyGermanQuality({ art: 'das', pos: 'اسم', syn: 'gebäude, heim', ant: 'wohnung', pl: 'häuser', conj: '' });
  assert.deepEqual([w.syn, w.ant, w.pl], ['Gebäude, Heim', 'Wohnung', 'Häuser']);
  const v = applyGermanQuality({ art: '', pos: 'فعل', syn: 'Laufen', conj: 'ich gehe|du gehst|er geht|wir gehen|ihr geht|sie gehen' });
  assert.deepEqual([v.syn, v.conj], ['laufen', 'gehe|gehst|geht|gehen|geht|gehen']);
});

test('OCR quality judgement', () => {
  assert.equal(ocrQuality('', 90), 'empty');
  assert.equal(ocrQuality('  ~ ', 90), 'empty');
  assert.equal(ocrQuality('Schule Tisch', 40), 'poor');
  assert.equal(ocrQuality('Schule Tisch', 80), 'ok');
});

const W = (o: any): any => ({
  id: 'w0', de: 'Haus', art: 'das', fa: 'خانه', syn: '', synFa: '', ant: '', antFa: '', pl: '', pos: 'اسم', lvl: 'A1', ex: '', exFa: '', ex2: '', ex2Fa: '',
  conj: '', prat: '', perf: '', sep: '', cat: 'روزمره (Alltag)', cloze: '', ans: '', acc: [], tags: '', notes: '', img: '', added: 0, last: 0, due: 0, ivl: 0, ease: 2.5, stage: 0, ok: 0, bad: 0, res: '', ...o
});

test('duplicate import: update keeps id, category and learning progress and never empties data', () => {
  const old = W({ id: 'keep-1', fa: 'خانه', ex: 'Mein Haus ist groß.', cat: 'مسکن', ok: 7, bad: 2, stage: 3, ivl: 9, last: 123, due: 456, added: 99 });
  const incoming = W({ id: 'new-id', fa: 'خانهٔ مسکونی', ex: '', syn: 'Gebäude', pl: 'Häuser', cat: 'روزمره (Alltag)', ok: 0, bad: 0, stage: 0 });
  const m = mergeWordUpdate(old, incoming);
  assert.equal(m.id, 'keep-1');
  assert.equal(m.cat, 'مسکن');
  assert.deepEqual([m.ok, m.bad, m.stage, m.ivl, m.last, m.due, m.added], [7, 2, 3, 9, 123, 456, 99]);
  assert.equal(m.ex, 'Mein Haus ist groß.'); // empty incoming value does not erase
  assert.equal(m.syn, 'Gebäude');
  assert.equal(m.pl, 'Häuser');
});

test('classification and decisions: new word, update, skip and cancel', () => {
  const existing = [W({ id: 'a', de: 'Haus', art: 'das', ok: 5 })];
  const cls = classifyImport([W({ id: 'x', de: 'Tisch', art: 'der' }), W({ id: 'y', de: 'Haus', art: 'das', fa: 'خانهٔ جدید' }), W({ id: 'z', de: '', fa: 'x' })], existing);
  assert.equal(cls.fresh.length, 1);
  assert.equal(cls.conflicts.length, 1);
  assert.equal(cls.invalid.length, 1);
  // cancel = nothing is applied: the caller simply does not call applyImportPlan -> list unchanged
  // skip
  const skipped = applyImportPlan(existing, cls.fresh, [{ existingId: 'a', incoming: cls.conflicts[0].incoming, action: 'keep' }]);
  assert.equal(skipped.words.length, 2);
  assert.equal(skipped.words.find(w => w.id === 'a')!.fa, 'خانه');
  assert.equal(skipped.skipped, 1);
  // update
  const upd = applyImportPlan(existing, cls.fresh, [{ existingId: 'a', incoming: cls.conflicts[0].incoming, action: 'update' }]);
  const a = upd.words.find(w => w.id === 'a')!;
  assert.equal(a.fa, 'خانهٔ جدید');
  assert.equal(a.ok, 5);
  assert.equal(upd.words.filter(w => w.de === 'Haus').length, 1); // no second record
  assert.equal(upd.updated, 1);
  // retrying the same plan never duplicates
  const again = applyImportPlan(upd.words, cls.fresh, []);
  assert.equal(again.words.length, 2);
});

test('sorting is deterministic, stable and does not mutate; timestamps are never invented', () => {
  const list = [W({ id: '1', de: 'Zug', art: 'der', cat: 'سفر (Reisen)', added: 0 }), W({ id: '2', de: 'Äpfel', art: '', cat: 'غذا (Essen)', added: 50 }), W({ id: '3', de: 'Apfel', art: 'der', cat: 'غذا (Essen)', added: 20 })];
  const copy = JSON.stringify(list);
  const alpha = sortWords(list, 'alpha').map(w => w.id);
  assert.deepEqual(alpha, sortWords([...list].reverse(), 'alpha').map(w => w.id));
  assert.equal(JSON.stringify(list), copy);
  assert.deepEqual(sortWords(list, 'newest').map(w => w.id).slice(0, 2), ['2', '3']);
  assert.equal(hasTimestamp(list[0]), false);
  assert.ok(Object.keys(SORT_LABELS).length >= 5);
  assert.deepEqual(splitCategoryName('ارتباطات (Kommunikation)'), { fa: 'ارتباطات', de: 'Kommunikation' });
  assert.deepEqual(splitCategoryName('امور روزمره'), { fa: 'امور روزمره', de: '' });
});
