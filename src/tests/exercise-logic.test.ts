/**
 * Targeted tests for the shared exercise logic.
 * Run (no extra dependency needed):   npx tsx --test src/tests/exercise-logic.test.ts
 * (or: npx tsx src/tests/exercise-logic.test.ts)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkWord, getTimerCfg, isAttributiveBlank } from '../utils/storage';
import { checkConjAnswer, splitConj } from '../utils/conjugation';
import { ADJ_ENDINGS, analyzeMistake, buildAdjItem, closestAnswer, inflectAdjective, randomSpec } from '../utils/grammar';

const base: any = { acc: [], art: '', pl: '', sep: '', ans: '', pos: '', cloze: '', imperativDu: '', imperativIhr: '', imperativSie: '' };

/* ---------- article requirements ---------- */
test('dictation / vocabulary recall require the article of a noun', () => {
  const hektik = { ...base, de: 'Hektik', art: 'die', pos: 'اسم' };
  for (const kind of ['prod', 'dict']) {
    assert.equal(checkWord(hektik, 'die Hektik', kind).ok, 1);
    assert.equal(checkWord(hektik, 'Die Hektik', kind).ok, 1);
    assert.equal(checkWord(hektik, 'Hektik', kind).ok, 0, 'missing article must not be accepted');
    assert.equal(checkWord(hektik, 'der Hektik', kind).ok, 0, 'wrong article must not be accepted');
  }
});

test('cloze: the article is not required when the sentence already supplies it', () => {
  const w = { ...base, de: 'Hektik', art: 'die', pos: 'اسم', ans: 'Hektik', cloze: 'Die ___ im Büro ist groß.' };
  assert.equal(checkWord(w, 'Hektik', 'cloze').ok, 1);
  assert.equal(checkWord(w, 'die Hektik', 'cloze').ok, 0, 'article is already in the sentence');
});

test('cloze: a blank at the start of the sentence accepts the noun with its article', () => {
  const w = { ...base, de: 'Hektik', art: 'die', pos: 'اسم', ans: 'Hektik', cloze: '___ im Büro ist groß.' };
  assert.equal(checkWord(w, 'Hektik', 'cloze').ok, 1);
  assert.equal(checkWord(w, 'die Hektik', 'cloze').ok, 1);
});

/* ---------- adjectives: dictionary form vs inflected form ---------- */
test('adjective: contextual form is required, never an unrelated inflection', () => {
  const attr = { ...base, de: 'effektiv', pos: 'صفت', ans: 'effektive', cloze: 'Wir brauchen eine ___ Methode.' };
  const pred = { ...base, de: 'effektiv', pos: 'صفت', ans: 'effektive', cloze: 'Die Methode ist ___.' };
  assert.equal(checkWord(attr, 'effektive', 'cloze').ok, 1);
  assert.equal(checkWord(attr, 'effektiv', 'cloze').ok, 0);
  assert.equal(checkWord(pred, 'effektiv', 'cloze').ok, 1, 'predicative use needs the dictionary form');
  assert.equal(checkWord(pred, 'effektive', 'cloze').ok, 0);
  assert.equal(checkWord({ ...base, de: 'effektiv', pos: 'Adjektiv' }, 'effektiv', 'prod').ok, 1);
});

test('attributive detection handles coordinated and stacked adjectives', () => {
  assert.equal(isAttributiveBlank('Das ist eine ___ und günstige Lösung.'), true);
  assert.equal(isAttributiveBlank('Wir haben eine ___ neue Idee.'), true);
  assert.equal(isAttributiveBlank('Die Methode ist ___.'), false);
  assert.equal(isAttributiveBlank('Er ist ___ und kommt Montag.'), false);
});

/* ---------- adjective declension ---------- */
test('adjective endings follow the German declension tables', () => {
  const E = ADJ_ENDINGS;
  // definite article
  assert.deepEqual([E.def.nom.m, E.def.nom.f, E.def.nom.n, E.def.nom.pl], ['e', 'e', 'e', 'en']);
  assert.deepEqual([E.def.akk.m, E.def.akk.f, E.def.akk.n, E.def.akk.pl], ['en', 'e', 'e', 'en']);
  assert.deepEqual([E.def.dat.m, E.def.dat.f, E.def.dat.n, E.def.dat.pl], ['en', 'en', 'en', 'en']);
  assert.deepEqual([E.def.gen.m, E.def.gen.f, E.def.gen.n, E.def.gen.pl], ['en', 'en', 'en', 'en']);
  // indefinite article
  assert.deepEqual([E.indef.nom.m, E.indef.nom.f, E.indef.nom.n], ['er', 'e', 'es']);
  assert.deepEqual([E.indef.akk.m, E.indef.akk.f, E.indef.akk.n], ['en', 'e', 'es']);
  assert.deepEqual([E.indef.dat.m, E.indef.dat.f, E.indef.dat.n], ['en', 'en', 'en']);
  // no article
  assert.deepEqual([E.none.nom.m, E.none.nom.f, E.none.nom.n, E.none.nom.pl], ['er', 'e', 'es', 'e']);
  assert.deepEqual([E.none.dat.m, E.none.dat.f, E.none.dat.n, E.none.dat.pl], ['em', 'er', 'em', 'en']);
  assert.deepEqual([E.none.gen.m, E.none.gen.f, E.none.gen.n, E.none.gen.pl], ['en', 'er', 'en', 'er']);
});

test('adjective stems: spelling changes', () => {
  assert.equal(inflectAdjective('teuer', 'e'), 'teure');
  assert.equal(inflectAdjective('dunkel', 'en'), 'dunklen');
  assert.equal(inflectAdjective('hoch', 'es'), 'hohes');
  assert.equal(inflectAdjective('groß', 'en'), 'großen');
});

test('generated adjective items are consistent', () => {
  for (let i = 0; i < 300; i++) {
    const level = 1 + (i % 3);
    const item = buildAdjItem('schön', randomSpec(level));
    assert.ok(item, 'a valid spec must produce an item');
    assert.equal((item!.sentence.match(/_____/g) || []).length, 1);
    assert.ok(item!.full.toLowerCase().includes(item!.answer.toLowerCase())); // sentence-initial capital letter
    assert.ok(!item!.full.includes('_____'));
    assert.ok(item!.answer.startsWith('schön'));
  }
});

/* ---------- verb conjugation / pronouns ---------- */
const GEHEN = 'gehe|gehst|geht|gehen|geht|gehen';
test('conjugation table: fixed order, no duplicated pronouns', () => {
  assert.deepEqual(splitConj(GEHEN), ['gehe', 'gehst', 'geht', 'gehen', 'geht', 'gehen']);
  assert.deepEqual(splitConj('ich gehe|du gehst|er/sie/es geht|wir gehen|ihr geht|sie/Sie gehen'), ['gehe', 'gehst', 'geht', 'gehen', 'geht', 'gehen']);
  assert.deepEqual(splitConj('wir gehen|ich gehe|ihr geht|du gehst|sie gehen|er geht'), ['gehe', 'gehst', 'geht', 'gehen', 'geht', 'gehen']);
});

test('conjugation answers are validated for the requested pronoun', () => {
  const forms = ['gehe', 'gehst', 'geht', 'gehen', 'geht', 'gehen'];
  const pron = ['ich', 'du', 'er', 'wir', 'ihr', 'sie'];
  forms.forEach((f, i) => {
    assert.equal(checkConjAnswer(GEHEN, i, f).ok, true, `person ${i} without pronoun`);
    assert.equal(checkConjAnswer(GEHEN, i, `${pron[i]} ${f}`).ok, true, `person ${i} with pronoun`);
  });
  // er/sie/es must not be validated against the du form
  const wrong = checkConjAnswer(GEHEN, 2, 'gehst');
  assert.equal(wrong.ok, false);
  assert.equal(wrong.target, 'geht');
  assert.equal(wrong.otherIdx, 1);
  assert.equal(checkConjAnswer(GEHEN, 2, 'du geht').wrongPron, 'du');
  assert.deepEqual(wrong.cands, ['geht'], 'only the requested form is shown');
});

test('separable and reflexive verbs', () => {
  const AUF = 'stehe auf|stehst auf|steht auf|stehen auf|steht auf|stehen auf';
  assert.equal(checkConjAnswer(AUF, 2, 'steht auf').ok, true);
  const missing = checkConjAnswer(AUF, 2, 'steht');
  assert.equal(missing.ok, false);
  assert.equal(missing.missingPart, true);
  const SICH = 'freue mich|freust dich|freut sich|freuen uns|freut euch|freuen sich';
  assert.equal(checkConjAnswer(SICH, 1, 'freust dich').ok, true);
  assert.equal(checkConjAnswer(SICH, 1, 'freust').ok, true);
  assert.equal(checkConjAnswer(SICH, 1, 'freut').ok, false);
});

/* ---------- timer persistence ---------- */
test('timer configuration: defaults, saved values and legacy fallback', () => {
  assert.deepEqual(getTimerCfg(undefined, 'cloze'), { on: false, sec: 30 });
  const set: any = { timers: { cloze: { on: true, sec: 45 }, dict: { on: false, sec: 20 } }, revealSec: 12 };
  assert.deepEqual(getTimerCfg(set, 'cloze'), { on: true, sec: 45 });
  assert.deepEqual(getTimerCfg(set, 'dict'), { on: false, sec: 20 });
  assert.deepEqual(getTimerCfg(set, 'plural'), { on: false, sec: 30 }, 'other exercises are independent');
  assert.deepEqual(getTimerCfg(set, 'flash'), { on: true, sec: 12 }, 'older settings keep the flashcard timer');
  assert.equal(getTimerCfg({ timers: { cloze: { on: true, sec: 1 } } } as any, 'cloze').sec, 3, 'duration is clamped');
});

/* ---------- mistake explanations ---------- */
test('mistake analysis compares with the real expected answer', () => {
  const r = analyzeMistake('effektiv', 'effektive');
  assert.equal(r.notes.length, 1);
  assert.match(r.notes[0], /«e» جا افتاده/);
  assert.equal(closestAnswer('effektiv', ['Das Haus', 'effektive']), 'effektive');
  const art = analyzeMistake('der Hektik', 'die Hektik');
  assert.match(art.notes[0], /آرتیکل/);
  assert.equal(new Set(art.notes).size, art.notes.length, 'no duplicated bullet points');
  const um = analyzeMistake('Haeuser', 'Häuser');
  assert.ok(um.notes.length >= 1);
});
