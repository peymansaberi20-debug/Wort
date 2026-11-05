import test from 'node:test';
import assert from 'node:assert/strict';
import { checkWord, checkSynAnt } from '../utils/storage';
import { checkConjAnswer, splitConj, P6_LABELS } from '../utils/conjugation';
import { analyzeMistake } from '../utils/grammar';

const base: any = { acc: [], art: '', ans: '', pl: '', sep: '', pos: '', cloze: '', de: '' };
const noun = (o: any) => ({ ...base, pos: 'اسم', ...o });

test('dictation requires the article of a noun', () => {
  const w = noun({ de: 'Hektik', art: 'die' });
  assert.equal(checkWord(w, 'die Hektik', 'dict').ok, 1);
  assert.equal(checkWord(w, 'Hektik', 'dict').ok, 0);
  assert.equal(checkWord(w, 'der Hektik', 'dict').ok, 0);
  assert.equal(checkWord(w, 'Die  hektik ', 'dict').ok, 1);
});

test('cloze: article already in the sentence is not typed again', () => {
  const w = noun({ de: 'Hektik', art: 'die', ans: 'Hektik', cloze: 'Ich mag die ___ der Stadt nicht.' });
  assert.equal(checkWord(w, 'Hektik', 'cloze').ok, 1);
  assert.equal(checkWord(w, 'die Hektik', 'cloze').ok, 0);
});

test('cloze: complete noun phrase without article in the sentence', () => {
  const w = noun({ de: 'Hektik', art: 'die', ans: 'Hektik', cloze: '___ macht mich müde.' });
  assert.equal(checkWord(w, 'Hektik', 'cloze').ok, 1);
  assert.equal(checkWord(w, 'die Hektik', 'cloze').ok, 1);
});

test('adjective: dictionary form is correct when no noun follows the blank (effektiv)', () => {
  const w = { ...base, pos: 'صفت', de: 'effektiv', ans: 'effektive', cloze: 'Die Methode ist sehr ___. Die Ergebnisse sind gut.' };
  const r = checkWord(w, 'effektiv', 'cloze');
  assert.equal(r.ok, 1, JSON.stringify(r));
});

test('adjective: inflected form is required before a noun', () => {
  const w = { ...base, pos: 'صفت', de: 'effektiv', ans: 'effektive', cloze: 'Wir brauchen eine ___ Methode.' };
  assert.equal(checkWord(w, 'effektive', 'cloze').ok, 1);
  assert.equal(checkWord(w, 'effektiv', 'cloze').ok, 0);
  assert.equal(checkWord(w, 'effektiven', 'cloze').ok, 0);
});

test('adjective: dictionary form requested in dictation', () => {
  const w = { ...base, pos: 'صفت', de: 'effektiv', ans: 'effektive' };
  assert.equal(checkWord(w, 'effektiv', 'dict').ok, 1);
});

test('conjugation: all six persons, with and without pronoun', () => {
  const conj = 'fahre|fährst|fährt|fahren|fahrt|fahren';
  const forms = splitConj(conj);
  assert.equal(forms.length, 6);
  const pron = ['ich', 'du', 'er', 'wir', 'ihr', 'sie'];
  const idx = [0, 1, 2, 3, 4, 5];
  idx.forEach(i => {
    assert.equal(checkConjAnswer(conj, i, forms[i], 'fahren').ok, true, `person ${i}`);
    const withPron = i === 2 ? `er ${forms[i]}` : `${pron[i]} ${forms[i]}`;
    assert.equal(checkConjAnswer(conj, i, withPron, 'fahren').ok, true, `person ${i} with pronoun`);
  });
  assert.equal(checkConjAnswer(conj, 2, 'fährst', 'fahren').ok, false);
  assert.equal(checkConjAnswer(conj, 2, 'fährst', 'fahren').otherIdx, 1);
  assert.equal(checkConjAnswer(conj, 2, 'du fährt', 'fahren').wrongPron, 'du');
  assert.equal(checkConjAnswer(conj, 2, 'fährt', 'fahren').target, 'fährt');
});

test('conjugation table order is ich du er wir ihr sie', () => {
  assert.deepEqual(P6_LABELS, ['ich', 'du', 'er/sie/es', 'wir', 'ihr', 'sie/Sie']);
  assert.deepEqual(splitConj('er/sie/es fährt|ich fahre|du fährst|wir fahren|ihr fahrt|sie/Sie fahren'), ['fahre', 'fährst', 'fährt', 'fahren', 'fahrt', 'fahren']);
});

test('separable verbs accept both forms', () => {
  const w = { ...base, pos: 'فعل', de: 'abziehen', sep: 'ab' };
  assert.equal(checkWord(w, 'abziehen', 'prod').ok, 1);
  assert.equal(checkWord(w, 'ziehen ab', 'prod').ok, 1);
});

test('mistake analysis is correct and has no duplicate notes', () => {
  const r = analyzeMistake('Haeuser', 'Häuser');
  assert.equal(new Set(r.notes).size, r.notes.length);
  const r2 = analyzeMistake('effektiv', 'effektive');
  assert.equal(r2.notes.length, 1);
  assert.match(r2.notes[0], /«e»/);
  const r3 = analyzeMistake('Strase', 'Straße');
  assert.ok(r3.notes.length >= 1);
});

test('adjective at the end of a sentence is not attributive (next sentence starts with a capital)', () => {
  const w = { ...base, pos: 'صفت', de: 'effektiv', ans: 'effektive', cloze: 'Das Training war ___. Die Firma investiert mehr.' };
  assert.equal(checkWord(w, 'effektiv', 'cloze').ok, 1);
  const w2 = { ...base, pos: 'صفت', de: 'effektiv', ans: 'effektive', cloze: 'Er arbeitet ___, Frau Müller lobt ihn.' };
  assert.equal(checkWord(w2, 'effektiv', 'cloze').ok, 1);
  const w3 = { ...base, pos: 'صفت', de: 'effektiv', ans: 'effektive', cloze: 'Ist das eine ___ Lösung?' };
  assert.equal(checkWord(w3, 'effektiv', 'cloze').ok, 0);
});

test('synonym/antonym: article is part of the answer when stored with it', () => {
  assert.equal(checkSynAnt(['die Hektik'], 'die Hektik').ok, true);
  const miss = checkSynAnt(['die Hektik'], 'Hektik');
  assert.equal(miss.ok, false);
  assert.match(miss.msg || '', /آرتیکل/);
  assert.equal(checkSynAnt(['die Hektik'], 'der Hektik').ok, false);
});

test('synonym/antonym: bare stored entries accept bare answers and verified articles', () => {
  const look = (b: string) => (b === 'Heim' ? 'das' : '');
  assert.equal(checkSynAnt(['Gebäude', 'Heim'], 'heim', look).ok, true);
  assert.equal(checkSynAnt(['Heim'], 'das Heim', look).ok, true);
  const bad = checkSynAnt(['Heim'], 'der Heim', look);
  assert.equal(bad.ok, false);
  assert.match(bad.msg || '', /das Heim/);
  assert.equal(checkSynAnt(['Gebäude'], 'das Gebäude').ok, true); // article cannot be verified
});

import { getTimerCfg } from '../utils/storage';

test('timer config: safe defaults, legacy flashcard value, per-exercise persistence', () => {
  assert.deepEqual(getTimerCfg(undefined, 'cloze'), { on: false, sec: 30 });
  assert.deepEqual(getTimerCfg({} as any, 'dict'), { on: false, sec: 30 });
  // older saved settings: former global flashcard auto-reveal value only applies to flashcard types
  assert.deepEqual(getTimerCfg({ revealSec: 12 } as any, 'flash'), { on: true, sec: 12 });
  assert.deepEqual(getTimerCfg({ revealSec: 12 } as any, 'cloze'), { on: false, sec: 30 });
  // saved per-exercise config wins and is independent per exercise
  const set: any = { revealSec: 12, timers: { flash: { on: false, sec: 20 }, cloze: { on: true, sec: 45 } } };
  assert.deepEqual(getTimerCfg(set, 'flash'), { on: false, sec: 20 });
  assert.deepEqual(getTimerCfg(set, 'cloze'), { on: true, sec: 45 });
  assert.deepEqual(getTimerCfg(set, 'dict'), { on: false, sec: 30 });
  // values are clamped
  assert.equal(getTimerCfg({ timers: { dict: { on: true, sec: 1 } } } as any, 'dict').sec, 3);
  assert.equal(getTimerCfg({ timers: { dict: { on: true, sec: 9999 } } } as any, 'dict').sec, 600);
});

test('mistake analysis: positions and diagnostics', () => {
  const miss = analyzeMistake('effektiv', 'effektive');
  assert.deepEqual(miss.notes.length, 1);
  assert.match(miss.notes[0], /جا افتاده/);
  assert.match(miss.notes[0], /«e»/); // the missing letter is named, with its context
  assert.match(miss.notes[0], /iv/);
  const extra = analyzeMistake('effektivee', 'effektive');
  assert.equal(extra.notes.length, 1);
  assert.match(extra.notes[0], /اضافه/);
  const umlaut = analyzeMistake('Haeuser', 'Häuser');
  assert.ok(umlaut.notes.length >= 1);
  const art = analyzeMistake('der Hektik', 'die Hektik');
  assert.match(art.notes.join(' '), /آرتیکل/);
  assert.equal(analyzeMistake('Straße', 'Straße').notes.length, 1); // identical text: only the generic note
});

import { sortWords, splitCategoryName, hasTimestamp } from '../utils/wordSort';

test('sorting: deterministic, stable ties, never mutates, no invented timestamps', () => {
  const mk = (id: string, de: string, o: any = {}): any => ({ id, de, art: '', fa: 'x', pos: 'اسم', cat: 'ب', added: 0, ...o });
  const list = [mk('3', 'Zug', { added: 300, cat: 'ب' }), mk('1', 'Apfel', { added: 100, cat: 'الف' }), mk('2', 'Apfel', { added: 0, cat: 'ب' }), mk('4', 'ärger', { added: 200, pos: 'فعل' })];
  const snapshot = list.map(w => w.id).join();
  assert.deepEqual(sortWords(list, 'alpha').map(w => w.id), ['1', '2', '4', '3']);
  assert.deepEqual(sortWords(list, 'newest').map(w => w.id), ['3', '4', '1', '2']); // id 2 has no real timestamp -> last
  assert.deepEqual(sortWords(list, 'oldest').map(w => w.id), ['1', '4', '3', '2']);
  assert.equal(list.map(w => w.id).join(), snapshot);
  assert.deepEqual(sortWords(list, 'cat').map(w => w.id), sortWords([...list].reverse(), 'cat').map(w => w.id)); // same result for any input order
  assert.deepEqual(sortWords(list, 'pos').map(w => w.id).slice(-1), ['4']);
  assert.equal(hasTimestamp(mk('x', 'a', { added: 0 })), false);
});

test('category names: Persian on the first line, German below; no invented translation', () => {
  assert.deepEqual(splitCategoryName('روزمره (Alltag)'), { fa: 'روزمره', de: 'Alltag' });
  assert.deepEqual(splitCategoryName('ارتباطات (Kommunikation)'), { fa: 'ارتباطات', de: 'Kommunikation' });
  assert.deepEqual(splitCategoryName('فقط فارسی'), { fa: 'فقط فارسی', de: '' });
  assert.deepEqual(splitCategoryName('Redewendungen'), { fa: 'Redewendungen', de: '' });
});
