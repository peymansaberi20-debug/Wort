/**
 * تست منطق امتیازدهی تلفظ (درخواست کاربر ۷) — تشخیص گفتار و تطبیق کلمه‌به‌کلمه.
 * Run:  npx tsx --test src/tests/pronunciation-score.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { scorePronunciation, isSpeechRecognitionSupported } from '../utils/pronunciationScore';

/* ---------- متن هدف خالی ---------- */
test('empty target returns score 0 with note', () => {
  const r = scorePronunciation('', 'Hallo');
  assert.equal(r.score, 0);
  assert.ok(r.notes.length > 0);
});

/* ---------- تطابق کامل: ۱۰۰٪ ---------- */
test('exact match gives 100%', () => {
  const r = scorePronunciation('Ich gehe heute ins Kino', 'Ich gehe heute ins Kino');
  assert.equal(r.score, 100);
  assert.equal(r.matched.length, 5);
  assert.equal(r.missing.length, 0);
  assert.equal(r.extra.length, 0);
  assert.equal(r.wrong.length, 0);
});

/* ---------- حذف کلمه: زیر ۱۰۰٪ ---------- */
test('missing word reduces score', () => {
  const r = scorePronunciation('Ich gehe heute ins Kino', 'Ich gehe ins Kino');
  assert.ok(r.score < 100);
  assert.equal(r.missing.length, 1);
  assert.equal(r.missing[0], 'heute');
});

/* ---------- کلمه اضافه ---------- */
test('extra word is captured', () => {
  const r = scorePronunciation('Ich gehe ins Kino', 'Ich gehe jetzt ins Kino');
  assert.ok(r.extra.length >= 1);
  assert.ok(r.extra.includes('jetzt'));
});

/* ---------- تحمل غلط املایی کوچک (Levenshtein ≤ 1) ---------- */
test('typo tolerance: 1 char off still counts as wrong but matched', () => {
  // gehe → gebe (1 substitution: h→b)
  const r = scorePronunciation('Ich gehe ins Kino', 'Ich gebe ins Kino');
  // باید به‌عنوان wrong شناسایی شود ولی still matched
  assert.ok(r.matched.length >= 4);
  assert.ok(r.wrong.some(w => w.target === 'gehe' && w.heard === 'gebe'));
});

/* ---------- کلمات فارسی در هدف: نرمال‌سازی ---------- */
test('punctuation is stripped during normalization', () => {
  const r = scorePronunciation('Hallo, wie geht es dir?', 'Hallo wie geht es dir');
  assert.equal(r.score, 100);
});

/* ---------- umlaut normalization: ß → ss ---------- */
test('ß is normalized to ss for comparison', () => {
  const r = scorePronunciation('Straße', 'Strasse');
  assert.equal(r.score, 100);
});

/* ---------- هیچ کلمه شنیده نشد ---------- */
test('empty recognized text gives 0 with helpful note', () => {
  const r = scorePronunciation('Hallo Welt', '');
  assert.equal(r.score, 0);
  assert.equal(r.recognizedText, '');
  assert.ok(r.notes.some(n => n.includes('هیچ کلمه‌ای شنیده نشد')));
});

/* ---------- ترتیب کلمات حفظ می‌شود ---------- */
test('word order matters — scrambled words give partial score', () => {
  const r = scorePronunciation('Ich gehe heute ins Kino', 'Kino gehe ich heute ins');
  // تطابق به‌ترتیب: فقط «gehe heute ins» به‌ترتیب مشترک (۳ از ۵)
  assert.ok(r.score < 100);
  assert.ok(r.matched.length <= 5);
});

/* ---------- پشتیبانی مرورگر در محیط node: false (چون window تعریف نشده) ---------- */
test('isSpeechRecognitionSupported returns false in node (no window)', () => {
  // در node، window تعریف نشده → باید false برگرداند
  assert.equal(isSpeechRecognitionSupported(), false);
});

/* ---------- کلمه بلند با غلط املایی بزرگ: NOT fuzzy ---------- */
test('large typo (>1 char) is not fuzzy-matched', () => {
  // gehen → gelaufen (بیشتر از ۱ تفاوت)
  const r = scorePronunciation('Ich gehe ins Kino', 'Ich gelaufen ins Kino');
  // «gehe» باید به‌عنوان missing یا wrong-hand نشود — ولی fuzzy نیست
  assert.ok(!r.wrong.some(w => w.target === 'gehe' && w.heard === 'gelaufen'));
});
