/**
 * تست منطق تحلیل نقاط ضعف (درخواست کاربر: نقشهٔ حرارتی + مسیر تطبیقی).
 * Run:  npx tsx --test src/tests/weakness-analysis.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { AppState, Word, HistItem } from '../types';
import { analyzeWeaknesses } from '../utils/weaknessAnalysis';

let seq = 0;
const mkWord = (p: Partial<Word> = {}): Word => ({
  id: 'w' + (++seq),
  de: 'Testwort', art: '', fa: 'آزمون', syn: '', synFa: '', ant: '', antFa: '',
  pl: '', pos: 'اسم', lvl: 'B1', ex: '', exFa: '', ex2: '', ex2Fa: '',
  conj: '', prat: '', perf: '', sep: '', cat: 'تست', cloze: '', ans: '',
  acc: [], tags: '', notes: '', img: '', added: Date.now(), last: 0, due: 0,
  ivl: 0, ease: 2.5, stage: 0, ok: 0, bad: 0, res: '',
  ...p
}) as Word;

const mkHist = (mode: string, ok: boolean, daysAgo = 0): HistItem => ({
  id: 'h' + (++seq),
  t: Date.now() - daysAgo * 86400000,
  type: mode,
  exp: 'test',
  ok: ok ? 1 : 0
});

const mkState = (words: Word[] = [], hist: HistItem[] = []): AppState => ({
  v: 1, sv: 6, words, hist,
  set: {
    theme: 'light', dir: 'de', nw: 10, rv: 10, order: 'due',
    activeCats: [], ivlMod: 1, leechN: 4, leechAct: 'mark',
    revealSec: 0, showTimer: false, auto: false, autoEx: false,
    vreg: 'de-DE', voice: '', rate: 1, goal: 20, bkDays: 7
  },
  daily: { d: 'today', n: 0, r: 0, sn: 0, sr: 0 }
});

/* ---------- خالی: بدون داده، آمادگی B2 = 0 ---------- */
test('empty state: zero categories, b2 score 0', () => {
  const r = analyzeWeaknesses(mkState());
  assert.equal(r.categories.length, 0);
  assert.equal(r.b2.score, 0);
  assert.equal(r.b2.vocabB2, 0);
  assert.equal(r.topWeaknesses.length, 0);
});

/* ---------- فقط دادهٔ کافی: دسته‌بندی کمتر از ۳ پاسخ حذف می‌شود ---------- */
test('categories with < 3 responses are filtered out', () => {
  const hist = [
    mkHist('cloze', true),
    mkHist('cloze', false)
  ];
  const r = analyzeWeaknesses(mkState([], hist));
  // فقط ۲ پاسخ cloze — باید فیلتر شود
  assert.equal(r.categories.filter(c => c.id === 'mode:cloze').length, 0);
});

/* ---------- دسته با ≥ ۳ پاسخ: نمایش داده می‌شود ---------- */
test('category with >= 3 responses is shown with correct mastery', () => {
  const hist = [
    mkHist('cloze', true),
    mkHist('cloze', true),
    mkHist('cloze', false)
  ];
  const r = analyzeWeaknesses(mkState([], hist));
  const clozeCat = r.categories.find(c => c.id === 'mode:cloze');
  assert.ok(clozeCat);
  assert.equal(clozeCat!.total, 3);
  assert.equal(clozeCat!.correct, 2);
  // mastery = ۲/۳ ≈ ۶۷
  assert.ok(clozeCat!.mastery >= 60 && clozeCat!.mastery <= 70);
});

/* ---------- ضعف اصلی: mastery < 70 ---------- */
test('top weaknesses are categories with mastery < 70', () => {
  const hist = [
    ...[true, false, false, false].map(ok => mkHist('art', ok)),
    ...[true, true, true, true].map(ok => mkHist('conj', ok))
  ];
  const r = analyzeWeaknesses(mkState([], hist));
  // art با دقت ۲۵٪ باید در topWeaknesses باشد
  assert.ok(r.topWeaknesses.some(w => w.id === 'mode:art'));
  // conj با دقت ۱۰۰٪ نباید در topWeaknesses باشد
  assert.ok(!r.topWeaknesses.some(w => w.id === 'mode:conj'));
});

/* ---------- برنامهٔ روزانه: حداقل یک آیتم اگه نقاط ضعف هست ---------- */
test('daily plan has at least one item when there are weaknesses', () => {
  const hist = [
    ...[false, false, false].map(ok => mkHist('cloze', ok))
  ];
  const r = analyzeWeaknesses(mkState([], hist));
  // cloze با ۰٪ mastery → top weakness
  assert.ok(r.topWeaknesses.length > 0);
  assert.ok(r.plan.items.length > 0);
});

/* ---------- آمادگی B2: با واژگان B2 مسلط‌شده، score > 0 ---------- */
test('b2 readiness increases with mastered B2 words', () => {
  const words = [
    mkWord({ lvl: 'B2', ivl: 21, ok: 5, bad: 1 }), // مسلط
    mkWord({ lvl: 'B2', ivl: 21, ok: 5, bad: 1 })  // مسلط
  ];
  const r = analyzeWeaknesses(mkState(words));
  assert.ok(r.b2.vocabB2 >= 2);
  assert.ok(r.b2.vocabB2Mastered >= 2);
  assert.ok(r.b2.score > 0);
});

/* ---------- آمادگی B2: بدون واژگان B2 → score از آمار اخیر ---------- */
test('b2 readiness without B2 vocab still computes from accuracy', () => {
  const words = [mkWord({ lvl: 'A1', ivl: 5 })];
  const hist = [mkHist('cloze', true), mkHist('cloze', true)];
  const r = analyzeWeaknesses(mkState(words, hist));
  // بدون واژگان B2 → b2VocabScore = 0 ولی score از accuracy محاسبه می‌شود
  assert.equal(r.b2.vocabB2, 0);
  assert.equal(r.b2.vocabB2Mastered, 0);
});

/* ---------- تحلیل بر اساس نقش کلام: اسم/فعل/صفت ---------- */
test('analysis by pos groups nouns/verbs/adjectives', () => {
  const words = [
    mkWord({ pos: 'اسم', ok: 3, bad: 1 }),
    mkWord({ pos: 'فعل', ok: 1, bad: 3 }),
    mkWord({ pos: 'صفت', ok: 2, bad: 2 })
  ];
  const r = analyzeWeaknesses(mkState(words));
  // هر سه pos باید در categories باشند (هر کدام ≥ ۴ پاسخ)
  assert.ok(r.categories.some(c => c.id === 'pos:noun'));
  assert.ok(r.categories.some(c => c.id === 'pos:verb'));
  assert.ok(r.categories.some(c => c.id === 'pos:adj'));
});

/* ---------- تحلیل بر اساس سطح CEFR ---------- */
test('analysis by level groups A1/A2/B1/B2', () => {
  const words = [
    mkWord({ lvl: 'A1', ok: 3, bad: 1 }),
    mkWord({ lvl: 'B2', ok: 1, bad: 3 })
  ];
  const r = analyzeWeaknesses(mkState(words));
  assert.ok(r.categories.some(c => c.id === 'lvl:A1'));
  assert.ok(r.categories.some(c => c.id === 'lvl:B2'));
});

/* ---------- نقاط ضعف: حداکثر ۳ مورد ---------- */
test('top weaknesses capped at 3', () => {
  // ۵ دستهٔ ضعیف
  const hist: HistItem[] = [];
  const modes = ['cloze', 'art', 'conj', 'case', 'plural'];
  for (const m of modes) {
    for (let i = 0; i < 4; i++) hist.push(mkHist(m, false));
  }
  const r = analyzeWeaknesses(mkState([], hist));
  assert.ok(r.topWeaknesses.length <= 3);
});

/* ---------- برنامهٔ روزانه: شامل تمرین فعل+حرف اضافه اگر SRS کم است ---------- */
test('daily plan includes vprep if graduated count is low', () => {
  const words = [mkWord({ lvl: 'B2', ivl: 0 })];
  const r = analyzeWeaknesses(mkState(words));
  // verbPrepGraduated = 0 → باید vprep در plan باشد
  assert.ok(r.plan.items.some(it => it.mode === 'vprep'));
});
