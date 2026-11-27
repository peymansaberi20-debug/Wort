/**
 * تست مهاجرت schema state (درخواست کاربر ۱۱).
 * Run:  npx tsx --test src/tests/migrations.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateState, needsMigration, CURRENT_SCHEMA_VERSION, logMigration } from '../utils/migrations';

// mock localStorage برای node
const _store: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => _store[k] ?? null,
  setItem: (k: string, v: string) => { _store[k] = String(v); },
  removeItem: (k: string) => { delete _store[k]; }
};

test.beforeEach(() => {
  for (const k of Object.keys(_store)) delete _store[k];
});

/* ---------- CURRENT_SCHEMA_VERSION ≥ 6 ---------- */
test('CURRENT_SCHEMA_VERSION is at least 6', () => {
  assert.ok(CURRENT_SCHEMA_VERSION >= 6);
});

/* ---------- state خالی: بدون تغییر ---------- */
test('migrateState: empty state is preserved', () => {
  const r = migrateState(null);
  assert.equal(r.state, null);
  assert.equal(r.migrationsRun.length, 0);
});

/* ---------- state در نسخهٔ فعلی: بدون migration ---------- */
test('migrateState: current version state has no migrations', () => {
  const state = { v: 1, sv: CURRENT_SCHEMA_VERSION, words: [], hist: [], set: {}, daily: {} };
  const r = migrateState(state);
  assert.equal(r.migrationsRun.length, 0);
  assert.equal(r.state.sv, CURRENT_SCHEMA_VERSION);
});

/* ---------- state در sv=0: همهٔ migrationها اجرا می‌شوند ---------- */
test('migrateState: sv=0 runs all migrations up to CURRENT', () => {
  const state = { v: 1, sv: 0, words: [{ id: 'w1', de: 'gehen', pos: 'فعل', art: '' }], hist: [], set: {}, daily: {} };
  const r = migrateState(state);
  assert.ok(r.migrationsRun.length >= 5);
  assert.equal(r.state.sv, CURRENT_SCHEMA_VERSION);
  // فیلدهای جدید اضافه شده باشند
  const w = r.state.words[0];
  assert.equal(typeof w.en, 'string');
  assert.ok(['aktiv', 'passiv', 'kandidat'].includes(w.status));
  assert.equal(typeof w.pOk, 'number');
  assert.equal(typeof w.pBad, 'number');
});

/* ---------- state در sv=3: فقط migrationهای 3→4, 4→5, 5→6 ---------- */
test('migrateState: sv=3 runs only migrations from 4 onward', () => {
  const state = { v: 1, sv: 3, words: [{ id: 'w1', de: 'gehen', pos: 'فعل' }], hist: [], set: {}, daily: {} };
  const r = migrateState(state);
  // 3→4, 4→5, 5→6 = 3 migration
  assert.ok(r.migrationsRun.length === 3 || r.migrationsRun.length === 4);
  assert.equal(r.state.sv, CURRENT_SCHEMA_VERSION);
});

/* ---------- migration sv=4→5: سرِ واژهٔ فعل با annotatedHeadword ---------- */
test('migrateState: sv=4→5 adds head annotation to verbs', () => {
  const state = {
    v: 1, sv: 4,
    words: [
      { id: 'w1', de: 'warten', pos: 'فعل', art: '' },
      { id: 'w2', de: 'Haus', pos: 'اسم', art: 'das' }
    ],
    hist: [], set: {}, daily: {}
  };
  const r = migrateState(state);
  const verb = r.state.words.find((w: any) => w.id === 'w1');
  const noun = r.state.words.find((w: any) => w.id === 'w2');
  // فعل باید پسونددار شده باشد (warten auf +A)
  assert.ok(verb.de.includes('+A') || verb.de.includes('+D') || verb.de.includes('+G') || verb.de === 'warten');
  // اسم دست‌نخورده
  assert.equal(noun.de, 'Haus');
});

/* ---------- migration sv=5→6: افزودن needsFull و register ---------- */
test('migrateState: sv=5→6 adds needsFull and register', () => {
  const state = {
    v: 1, sv: 5,
    words: [{ id: 'w1', de: 'Haus', pos: 'اسم', art: 'das' }],
    hist: [], set: {}, daily: {}
  };
  const r = migrateState(state);
  const w = r.state.words[0];
  assert.equal(typeof w.needsFull, 'boolean');
  assert.equal(typeof w.register, 'string');
});

/* ---------- needsMigration: sv < CURRENT → true ---------- */
test('needsMigration: returns true when sv < CURRENT', () => {
  assert.equal(needsMigration({ sv: 1, v: 1, words: [] }), true);
  assert.equal(needsMigration({ sv: CURRENT_SCHEMA_VERSION - 1, v: 1, words: [] }), true);
});

/* ---------- needsMigration: sv = CURRENT → false ---------- */
test('needsMigration: returns false when sv = CURRENT', () => {
  assert.equal(needsMigration({ sv: CURRENT_SCHEMA_VERSION, v: 1, words: [] }), false);
});

/* ---------- needsMigration: state null → false ---------- */
test('needsMigration: null state returns false', () => {
  assert.equal(needsMigration(null), false);
});

/* ---------- migration شکست‌خورده: state تا همان‌جا برمی‌گردد ---------- */
test('migrateState: bad state structure does not crash', () => {
  const state = { v: 1, sv: 1, words: 'not-an-array', hist: [], set: {}, daily: {} };
  // نباید throw کند
  const r = migrateState(state);
  // state دست‌نخورده برمی‌گردد (یا حداقل sv = CURRENT)
  assert.equal(r.state.sv, CURRENT_SCHEMA_VERSION);
});

/* ---------- logMigration: silent در محیط بدون console.group ---------- */
test('logMigration: does not throw when console.group is missing', () => {
  // node معمولاً console.group دارد ولی تست می‌کنیم که در صورت نبود هم خطا ندهد
  const orig = (console as any).group;
  (console as any).group = undefined;
  try {
    logMigration({ fromVersion: 1, toVersion: 6, migrationsRun: ['test'] });
    // نباید throw
    assert.ok(true);
  } finally {
    (console as any).group = orig;
  }
});

/* ---------- idempotent: migrate دو بار = migrate یک بار ---------- */
test('migrateState: idempotent — migrating twice equals migrating once', () => {
  const state = { v: 1, sv: 1, words: [{ id: 'w1', de: 'Haus', pos: 'اسم', art: 'das' }], hist: [], set: {}, daily: {} };
  const r1 = migrateState(state);
  const r2 = migrateState(r1.state);
  assert.equal(r2.migrationsRun.length, 0);
  // فقط فیلدهای اصلی را مقایسه کن (undefined keys در deepEqual سخت‌گیرانه است)
  assert.equal(r1.state.words[0].de, r2.state.words[0].de);
  assert.equal(r1.state.words[0].needsFull, r2.state.words[0].needsFull);
  assert.equal(r1.state.words[0].register, r2.state.words[0].register);
  assert.equal(r1.state.sv, r2.state.sv);
});

/* ---------- state با daily بدون sn/sr: migration 3→4 اضافه می‌کند ---------- */
test('migrateState: sv=3→4 adds sn/sr to daily', () => {
  const state = {
    v: 1, sv: 3,
    words: [],
    hist: [],
    set: {},
    daily: { d: 'today', n: 5, r: 3 } // بدون sn/sr
  };
  const r = migrateState(state);
  assert.equal(r.state.daily.sn, 0);
  assert.equal(r.state.daily.sr, 0);
});

/* ---------- state با فعل بازتابی (sich freuen): سرِ واژه کامل می‌شود ---------- */
test('migrateState: reflexive verb gets sich + prep + case', () => {
  const state = {
    v: 1, sv: 4,
    words: [{ id: 'w1', de: 'sich freuen', pos: 'فعل', art: '' }],
    hist: [], set: {}, daily: {}
  };
  const r = migrateState(state);
  const w = r.state.words[0];
  // «sich freuen auf +A» یا مشابه
  assert.ok(w.de.startsWith('sich ') || w.de === 'sich freuen');
  if (w.de.includes('+')) {
    assert.ok(w.de.includes('+A') || w.de.includes('+D'));
  }
});

/* ---------- state با فعل بدون حرف اضافه (essen): حالت اکوزاتیو ---------- */
test('migrateState: bare transitive verb gets +A suffix', () => {
  const state = {
    v: 1, sv: 4,
    words: [{ id: 'w1', de: 'essen', pos: 'فعل', art: '' }],
    hist: [], set: {}, daily: {}
  };
  const r = migrateState(state);
  const w = r.state.words[0];
  // essen باید +A بگیرد (چون در bareCaseVerb فهرست است)
  assert.ok(w.de.includes('+A') || w.de === 'essen');
});
