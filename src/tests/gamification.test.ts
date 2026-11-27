/**
 * تست منطق گیمیفیکیشن: streak freeze + achievements (درخواست کاربر ۸).
 * Run:  npx tsx --test src/tests/gamification.test.ts
 *
 * نکته: چون streak freeze در localStorage ذخیره می‌شود و streakCount روی hist کار می‌کند،
 * تست‌ها با mock-hist و دستکاری localStorage انجام می‌شوند.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { AppState, Word, HistItem } from '../types';
import {
  FREEZE_PER_MONTH, loadFreeze, syncFreezeMonth, effectiveStreak,
  ACHIEVEMENTS, loadEarnedAchievements, checkNewAchievements, getAllAchievementsStatus,
  countEarned, countVPrepGraduated, countIdiomGraduated, countExamsDone, countAiExercisesCreated, countDialogDone,
  type AchContext
} from '../utils/gamification';

// mock localStorage برای node
const _store: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => _store[k] ?? null,
  setItem: (k: string, v: string) => { _store[k] = String(v); },
  removeItem: (k: string) => { delete _store[k]; }
};

let seq = 0;
const mkHist = (daysAgo: number): HistItem => ({
  id: 'h' + (++seq),
  t: Date.now() - daysAgo * 86400000,
  type: 'cloze',
  exp: 'test',
  ok: 1
});

const mkState = (hist: HistItem[] = []): AppState => ({
  v: 1, sv: 6,
  words: [],
  hist,
  set: {
    theme: 'light', dir: 'de', nw: 10, rv: 10, order: 'due',
    activeCats: [], ivlMod: 1, leechN: 4, leechAct: 'mark',
    revealSec: 0, showTimer: false, auto: false, autoEx: false,
    vreg: 'de-DE', voice: '', rate: 1, goal: 20, bkDays: 7
  },
  daily: { d: 'today', n: 0, r: 0, sn: 0, sr: 0 }
});

const mkCtx = (over: Partial<AchContext> = {}): AchContext => ({
  words: [], hist: [], streak: 0, b2Readiness: 0,
  vprepGraduated: 0, idiomGraduated: 0, examDone: 0,
  aiExercisesCreated: 0, dialogDone: 0,
  ...over
});

/* ---------- teardown: پاک‌کردن localStorage قبل از هر تست ---------- */
test.beforeEach(() => {
  for (const k of Object.keys(_store)) delete _store[k];
});

/* ---------- FREEZE_PER_MONTH = 2 ---------- */
test('FREEZE_PER_MONTH is 2 (Duolingo-like)', () => {
  assert.equal(FREEZE_PER_MONTH, 2);
});

/* ---------- loadFreeze: حالت اولیه ---------- */
test('loadFreeze returns fresh state with 2 freezes when nothing saved', () => {
  const f = loadFreeze();
  assert.equal(f.remaining, 2);
  assert.equal(f.used.length, 0);
  assert.ok(f.month); // YYYY-MM
});

/* ---------- syncFreezeMonth: اگر همان ماه باشد، تغییر نکند ---------- */
test('syncFreezeMonth does not reset within same month', () => {
  const f1 = syncFreezeMonth();
  _store['wb_streak_freeze_v1'] = JSON.stringify({ ...f1, remaining: 1, used: ['2024-01-15'] });
  const f2 = syncFreezeMonth();
  assert.equal(f2.remaining, 1);
  assert.equal(f2.used.length, 1);
});

/* ---------- effectiveStreak: با hist خالی، streak = 0 ---------- */
test('effectiveStreak: empty hist → streak 0, no freeze used', () => {
  const { streak, protectedByFreeze, freezesLeft } = effectiveStreak(mkState([]));
  assert.equal(streak, 0);
  // اگر امروز و دیروز تمرین نباشد و freeze داریم → protectedByFreeze = true ولی streak واقعی 0
  // چون streakCount روی hist خالی 0 می‌دهد
  assert.equal(freezesLeft, FREEZE_PER_MONTH);
});

/* ---------- effectiveStreak: امروز تمرین شده → streak از streakCount ---------- */
test('effectiveStreak: today exercised → uses streakCount directly', () => {
  const { streak, protectedByFreeze } = effectiveStreak(mkState([mkHist(0)]));
  assert.ok(streak >= 1);
  assert.equal(protectedByFreeze, false);
});

/* ---------- ACHIEVEMENTS: حداقل ۱۵ نشان ---------- */
test('ACHIEVEMENTS has at least 15 achievements defined', () => {
  assert.ok(ACHIEVEMENTS.length >= 15);
});

/* ---------- ACHIEVEMENTS: هر نشان id/icon/label/desc/check دارد ---------- */
test('every achievement has required fields', () => {
  for (const a of ACHIEVEMENTS) {
    assert.ok(a.id, 'id required');
    assert.ok(a.icon, 'icon required');
    assert.ok(a.label, 'label required');
    assert.ok(a.desc, 'desc required');
    assert.equal(typeof a.check, 'function');
  }
});

/* ---------- ACHIEVEMENTS: id یکتا ---------- */
test('achievement ids are unique', () => {
  const ids = ACHIEVEMENTS.map(a => a.id);
  assert.equal(new Set(ids).size, ids.length);
});

/* ---------- checkNewAchievements: اولین واژه ---------- */
test('checkNewAchievements: first word earns first_word', () => {
  const ctx = mkCtx({ words: [{ id: 'w1', de: 'x' } as any] });
  const earned = checkNewAchievements(ctx);
  assert.ok(earned.some(a => a.id === 'first_word'));
});

/* ---------- checkNewAchievements: ۱۰ واژه ---------- */
test('checkNewAchievements: 10 words earns ten_words', () => {
  const ctx = mkCtx({ words: Array.from({ length: 10 }, (_, i) => ({ id: 'w' + i, de: 'x' } as any)) });
  const earned = checkNewAchievements(ctx);
  assert.ok(earned.some(a => a.id === 'ten_words'));
  assert.ok(earned.some(a => a.id === 'first_word'));
});

/* ---------- checkNewAchievements: streak ۷ ---------- */
test('checkNewAchievements: streak 7 earns streak_7', () => {
  const ctx = mkCtx({ streak: 7 });
  const earned = checkNewAchievements(ctx);
  assert.ok(earned.some(a => a.id === 'streak_7'));
});

/* ---------- checkNewAchievements: idempotent — دوبار صدا زدن، بار دوم خالی ---------- */
test('checkNewAchievements: second call returns empty (idempotent)', () => {
  const ctx = mkCtx({ streak: 7 });
  const first = checkNewAchievements(ctx);
  assert.ok(first.length > 0);
  const second = checkNewAchievements(ctx);
  assert.equal(second.length, 0);
});

/* ---------- checkNewAchievements: streak 30 → هر دو streak_7 و streak_30 ---------- */
test('checkNewAchievements: streak 30 earns both 7 and 30', () => {
  // reset
  for (const k of Object.keys(_store)) delete _store[k];
  const ctx = mkCtx({ streak: 30 });
  const earned = checkNewAchievements(ctx);
  assert.ok(earned.some(a => a.id === 'streak_7'));
  assert.ok(earned.some(a => a.id === 'streak_30'));
});

/* ---------- b2 readiness 70 → b2_ready ---------- */
test('checkNewAchievements: b2 readiness 70 earns b2_ready', () => {
  const ctx = mkCtx({ b2Readiness: 70 });
  const earned = checkNewAchievements(ctx);
  assert.ok(earned.some(a => a.id === 'b2_ready'));
});

/* ---------- b2 readiness 85 → هر دو b2_ready و b2_master ---------- */
test('checkNewAchievements: b2 readiness 85 earns both b2_ready and b2_master', () => {
  for (const k of Object.keys(_store)) delete _store[k];
  const ctx = mkCtx({ b2Readiness: 85 });
  const earned = checkNewAchievements(ctx);
  assert.ok(earned.some(a => a.id === 'b2_ready'));
  assert.ok(earned.some(a => a.id === 'b2_master'));
});

/* ---------- getAllAchievementsStatus: نشان‌های کسب‌شده earned=true ---------- */
test('getAllAchievementsStatus: earned achievements marked correctly', () => {
  // ابتدا یک نشان بگیر
  checkNewAchievements(mkCtx({ streak: 7 }));
  // حالا status را بگیر
  const all = getAllAchievementsStatus(mkCtx({ streak: 7 }));
  const streak7 = all.find(a => a.id === 'streak_7');
  assert.ok(streak7);
  assert.equal(streak7!.earned, true);
  assert.ok(streak7!.earnedAt);
});

/* ---------- countEarned: شمارش درست ---------- */
test('countEarned: returns correct earned/total', () => {
  checkNewAchievements(mkCtx({ streak: 7 }));
  const { earned, total } = countEarned(mkCtx({}));
  // streak_7 و streak_7 فقط اگر streak>=7 باشد
  assert.ok(earned >= 1);
  assert.equal(total, ACHIEVEMENTS.length);
});

/* ---------- countVPrepGraduated: خالی → 0 ---------- */
test('countVPrepGraduated: empty storage returns 0', () => {
  assert.equal(countVPrepGraduated(), 0);
});

/* ---------- countVPrepGraduated: با دادهٔ mock ---------- */
test('countVPrepGraduated: counts graduated entries', () => {
  _store['wb_vprep_srs_v1'] = JSON.stringify({
    'warten|auf': { graduated: true, streak: 3 },
    'helfen|bei': { graduated: false, streak: 1 }
  });
  assert.equal(countVPrepGraduated(), 1);
});

/* ---------- countIdiomGraduated: با دادهٔ mock ---------- */
test('countIdiomGraduated: counts graduated idioms', () => {
  _store['wb_idioms_srs_v1'] = JSON.stringify({
    'die_daumen_drücken': { graduated: true, streak: 3 },
    'die_kuh_vom_eis_holen': { graduated: true, streak: 5 },
    'einen_vogel_haben': { graduated: false, streak: 0 }
  });
  assert.equal(countIdiomGraduated(), 2);
});

/* ---------- countExamsDone: خالی → 0 ---------- */
test('countExamsDone: empty storage returns 0', () => {
  assert.equal(countExamsDone(), 0);
});

/* ---------- countExamsDone: با آرشیو ComprehensiveExam ---------- */
test('countExamsDone: counts comprehensive exam records', () => {
  _store['wb_comprehensive_exam_v1'] = JSON.stringify([
    { id: 'ce_1', ts: 1, date: 'today', org: 'Goethe', level: 'B2', strict: false, sections: [], avg: 70, passed: true },
    { id: 'ce_2', ts: 2, date: 'today', org: 'Goethe', level: 'B2', strict: false, sections: [], avg: 50, passed: false }
  ]);
  assert.equal(countExamsDone(), 2);
});

/* ---------- countAiExercisesCreated: شمارش از چند آرشیو ---------- */
test('countAiExercisesCreated: sums across multiple archive keys', () => {
  _store['wb_konnektor_archive_v1'] = JSON.stringify([{ id: 'a' }]);
  _store['wb_dialog_arch_v1'] = JSON.stringify([{ id: 'b' }, { id: 'c' }]);
  assert.equal(countAiExercisesCreated(), 3);
});

/* ---------- countDialogDone ---------- */
test('countDialogDone: counts dialog archive items', () => {
  _store['wb_dialog_arch_v1'] = JSON.stringify([{ id: 'a' }, { id: 'b' }]);
  assert.equal(countDialogDone(), 2);
});
