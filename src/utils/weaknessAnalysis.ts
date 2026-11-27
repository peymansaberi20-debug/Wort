/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * weaknessAnalysis.ts — تحلیل نقاط ضعف و مسیر یادگیری تطبیقی (درخواست کاربر)
 *
 * دادهٔ خام:
 *   - state.hist: نتایج تمرین‌ها (type, ok, t)
 *   - state.words: آمار هر واژه (ok/bad/win/stOk/pOk/pBad/rOk/rBad/pos/lvl/cat)
 *   - allVerbPreps(): دیتاست فعل + حرف اضافه برای تحلیل حالت دستوری
 *
 * خروجی:
 *   - categories[]: هر دسته با total/correct/mastery%/recommendation
 *   - topWeaknesses: ۳ دستهٔ ضعیف‌تر از آستانه
 *   - b2Readiness: درصد آمادگی برای آزمون B2
 *   - dailyPlan: پیشنهاد تمرین امروز بر اساس نقاط ضعف
 *
 * همهٔ توابع pure هستند — برای تست راحت و برای استفاده در Dashboard.
 */

import { AppState, Word, HistItem } from '../types';
import { isNounPos, isVerbPos, isAdjPos } from './storage';
import { allVerbPreps, verbPrepOf } from '../data/verbPrep';

export interface WeakCategory {
  id: string;
  label: string;
  icon: string;
  total: number;       // کل پاسخ‌های ثبت‌شده در این دسته
  correct: number;     // تعداد درست
  mastery: number;     // ۰ تا ۱۰۰ — درصد تسلط
  /** پیشنهاد تمرین برای این دسته — به کاربر نمایش داده می‌شود */
  recommendation: string;
  /** مود تمرین پیشنهادی (ExerciseMode) برای ارجاع به تمرین مربوطه */
  suggestedMode?: string;
}

export interface B2Readiness {
  score: number;           // ۰ تا ۱۰۰ — درصد آمادگی کلی B2
  vocabB2: number;         // تعداد واژگان B2 در کتابخانه
  vocabB2Mastered: number; // واژگان B2 مسلط‌شده (ivl >= 21)
  verbPrepGraduated: number; // فعل‌های +حرف اضافهٔ دانش‌آموخته
  recentAccuracy: number;  // دقت ۷ روز اخیر
  weakAreas: string[];     // فهرست برچسب‌های ضعف
}

export interface DailyPlanItem {
  mode: string;
  label: string;
  icon: string;
  count: number;
  reason: string;
}

export interface DailyPlan {
  items: DailyPlanItem[];
  totalMinutes: number;
  focus: string; // عنوان تمرکز امروز
}

export interface WeaknessReport {
  categories: WeakCategory[];
  topWeaknesses: WeakCategory[];
  b2: B2Readiness;
  plan: DailyPlan;
}

const DAY = 86400000;

/* ──────────── تحلیل بر اساس نوع تمرین (از hist) ──────────── */
const MODE_LABELS: Record<string, { label: string; icon: string; rec: string }> = {
  cloze: { label: 'جای‌خالی واژه', icon: '✍️', rec: 'تمرین جای‌خالی واژه در جمله' },
  art: { label: 'آرتیکل (der/die/das)', icon: '🎨', rec: 'تمرین تشخیص آرتیکل اسامی' },
  conj: { label: 'صرف فعل', icon: '🔤', rec: 'صرف فعل برای ضمایر مختلف' },
  tense: { label: 'زمان فعل (Präteritum/Perfekt)', icon: '⏳', rec: 'تمرین زمان‌های گذشته فعل' },
  irrverb: { label: 'فعل‌های بی‌قاعده', icon: '🎢', rec: 'تمرین فعل‌های بی‌قاعده در سه زمان' },
  case: { label: 'حالت و حرف اضافه', icon: '🧩', rec: 'تمرین حالت دستوری + حرف اضافه' },
  adjdecl: { label: 'صرف صفت', icon: '🧱', rec: 'تمرین پایانهٔ صفت با آرتیکل/حالت' },
  plural: { label: 'جمع اسم‌ها', icon: '🔢', rec: 'نوشتن شکل جمع اسامی' },
  synant: { label: 'مترادف و متضاد', icon: '↔️', rec: 'نوشتن مترادف/متضاد واژه' },
  vprep: { label: 'فعل + حرف اضافه', icon: '🔗', rec: 'تمرین فعل + حرف اضافه + حالت' },
  puzzle: { label: 'چیدن جمله (Satzbau)', icon: '🧩', rec: 'تمرین ترتیب کلمه‌ها در جمله' },
  konnektoren: { label: 'متن جای‌خالی (Konnektoren)', icon: '📝', rec: 'تمرین حروف ربط در متن' },
  prod: { label: 'فارسی ← آلمانی', icon: '🔁', rec: 'تایپ معادل آلمانی از روی فارسی' },
  vmix: { label: 'تمرین دوگانه', icon: '🧠', rec: 'تمرین تولیدی/شناختی واژگان' },
  flash: { label: 'فلش‌کارت', icon: '🃏', rec: 'مرور فلش‌کارت با الگوریتم لایتنر' }
};

function analyzeByExerciseType(hist: HistItem[], recentOnlyDays?: number): WeakCategory[] {
  const cutoff = recentOnlyDays ? Date.now() - recentOnlyDays * DAY : 0;
  const buckets: Record<string, { total: number; correct: number }> = {};
  for (const h of hist) {
    if (recentOnlyDays && h.t < cutoff) continue;
    const t = String(h.type || '').trim();
    if (!t) continue;
    if (!buckets[t]) buckets[t] = { total: 0, correct: 0 };
    buckets[t].total++;
    if (h.ok) buckets[t].correct++;
  }
  return Object.entries(buckets)
    .filter(([t, b]) => b.total >= 3) // فقط دسته‌هایی که حداقل ۳ پاسخ دارند
    .map(([t, b]) => {
      const meta = MODE_LABELS[t] || { label: t, icon: '❓', rec: `تمرین ${t}` };
      return {
        id: 'mode:' + t,
        label: meta.label,
        icon: meta.icon,
        total: b.total,
        correct: b.correct,
        mastery: b.total ? Math.round((b.correct / b.total) * 100) : 0,
        recommendation: meta.rec,
        suggestedMode: t
      };
    })
    .sort((a, b) => a.mastery - b.mastery);
}

/* ──────────── تحلیل بر اساس نقش کلام (pos) ──────────── */
function analyzeByPos(words: Word[]): WeakCategory[] {
  const groups: Record<string, Word[]> = { noun: [], verb: [], adj: [], other: [] };
  for (const w of words) {
    if (isNounPos(w.pos)) groups.noun.push(w);
    else if (isVerbPos(w.pos)) groups.verb.push(w);
    else if (isAdjPos(w.pos)) groups.adj.push(w);
    else groups.other.push(w);
  }
  const out: WeakCategory[] = [];
  const meta: Record<string, { label: string; icon: string; rec: string }> = {
    noun: { label: 'اسامی', icon: '📘', rec: 'مرور اسامی و آرتیکل‌شان' },
    verb: { label: 'افعال', icon: '⚡', rec: 'صرف فعل‌ها و حالت دستوری‌شان' },
    adj: { label: 'صفات', icon: '🌈', rec: 'صرف صفت و پایانه‌ها' },
    other: { label: 'سایر (قید/حرف/…)', icon: '📎', rec: 'مرور واژگان متفرقه' }
  };
  for (const [k, ws] of Object.entries(groups)) {
    if (!ws.length) continue;
    let total = 0; let correct = 0;
    for (const w of ws) {
      const t = (w.ok || 0) + (w.bad || 0);
      if (t >= 1) { total += t; correct += w.ok || 0; }
    }
    if (total < 3) continue;
    out.push({
      id: 'pos:' + k,
      label: meta[k].label,
      icon: meta[k].icon,
      total,
      correct,
      mastery: total ? Math.round((correct / total) * 100) : 0,
      recommendation: meta[k].rec
    });
  }
  return out.sort((a, b) => a.mastery - b.mastery);
}

/* ──────────── تحلیل بر اساس حالت دستوری (A/D/G) ──────────── */
function analyzeByCase(words: Word[]): WeakCategory[] {
  // برای هر فعل در کتابخانهٔ کاربر، حالت دستوری‌اش را از دیتاست verbPrep می‌گیریم
  const groups: Record<string, { total: number; correct: number }> = { A: { total: 0, correct: 0 }, D: { total: 0, correct: 0 }, G: { total: 0, correct: 0 } };
  for (const w of words) {
    if (!isVerbPos(w.pos)) continue;
    const vp = verbPrepOf(w.de);
    if (!vp) continue;
    const k = String(vp.kase || '').trim().toUpperCase();
    // A/D → فقط A شمرده می‌شود (چون هر دو را قبول می‌کند)
    const key = k.startsWith('A') ? 'A' : k.startsWith('D') ? 'D' : k.startsWith('G') ? 'G' : '';
    if (!key) continue;
    const t = (w.ok || 0) + (w.bad || 0);
    if (t >= 1) { groups[key].total += t; groups[key].correct += w.ok || 0; }
  }
  const meta: Record<string, { label: string; icon: string; rec: string }> = {
    A: { label: 'حالت اکوزاتیو (Akkusativ)', icon: '🟠', rec: 'تمرین فعل‌های +Akkusativ (kaufen, essen, sehen…)' },
    D: { label: 'حالت داتیو (Dativ)', icon: '🟢', rec: 'تمرین فعل‌های +Dativ (helfen, danken, folgen…)' },
    G: { label: 'حالت گنتیو (Genitiv)', icon: '🔵', rec: 'تمرین فعل‌های +Genitiv (bedürfen, gedenken…)' }
  };
  return Object.entries(groups)
    .filter(([, b]) => b.total >= 2)
    .map(([k, b]) => ({
      id: 'case:' + k,
      label: meta[k].label,
      icon: meta[k].icon,
      total: b.total,
      correct: b.correct,
      mastery: b.total ? Math.round((b.correct / b.total) * 100) : 0,
      recommendation: meta[k].rec,
      suggestedMode: k === 'G' ? 'vprep' : 'case'
    }))
    .sort((a, b) => a.mastery - b.mastery);
}

/* ──────────── تحلیل بر اساس سطح CEFR ──────────── */
function analyzeByLevel(words: Word[]): WeakCategory[] {
  const groups: Record<string, { total: number; correct: number }> = {};
  for (const w of words) {
    const lvl = String(w.lvl || '').trim().toUpperCase();
    if (!lvl) continue;
    if (!groups[lvl]) groups[lvl] = { total: 0, correct: 0 };
    const t = (w.ok || 0) + (w.bad || 0);
    if (t >= 1) { groups[lvl].total += t; groups[lvl].correct += w.ok || 0; }
  }
  const order = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  return order
    .filter(l => groups[l] && groups[l].total >= 2)
    .map(l => ({
      id: 'lvl:' + l,
      label: `سطح ${l}`,
      icon: l === 'B2' ? '🎯' : l === 'C1' || l === 'C2' ? '🏆' : '📚',
      total: groups[l].total,
      correct: groups[l].correct,
      mastery: groups[l].total ? Math.round((groups[l].correct / groups[l].total) * 100) : 0,
      recommendation: `تمرین متمرکز روی واژگان سطح ${l}`
    }))
    .sort((a, b) => a.mastery - b.mastery);
}

/* ──────────── تحلیل بر اساس زمان فعل (Präteritum/Perfekt) ──────────── */
function analyzeByTense(words: Word[]): WeakCategory[] {
  const tenseVerbs = words.filter(w => isVerbPos(w.pos) && (w.prat || w.perf));
  if (!tenseVerbs.length) return [];
  // فرض: تسلط روی Präteritum و Perfekt را از آمار کلی همان فعل می‌گیریم (because the tense exercise records into w.ok/w.bad)
  // این یک تقریب معقول است — چون تمرین زمان فعل روی همین واژه‌ها عمل می‌کند
  let total = 0; let correct = 0;
  for (const w of tenseVerbs) {
    const t = (w.ok || 0) + (w.bad || 0);
    if (t >= 1) { total += t; correct += w.ok || 0; }
  }
  if (total < 3) return [];
  const mastery = total ? Math.round((correct / total) * 100) : 0;
  return [
    {
      id: 'tense:all',
      label: 'زمان‌های فعل (Prät./Perf.)',
      icon: '⏳',
      total,
      correct,
      mastery,
      recommendation: 'تمرین Präteritum و Perfekt فعل‌های بی‌قاعده',
      suggestedMode: 'tense'
    }
  ];
}

/* ──────────── محاسبهٔ آمادگی B2 ──────────── */
function computeB2Readiness(state: AppState, recentAccuracy: number): B2Readiness {
  const words = state.words;
  const vocabB2 = words.filter(w => String(w.lvl || '').trim().toUpperCase() === 'B2').length;
  const vocabB2Mastered = words.filter(w => String(w.lvl || '').trim().toUpperCase() === 'B2' && (w.ivl || 0) >= 21).length;

  // فعل‌های دانش‌آموخته از SRS (wb_vprep_srs_v1)
  let verbPrepGraduated = 0;
  try {
    const srs = JSON.parse(localStorage.getItem('wb_vprep_srs_v1') || '{}');
    for (const k of Object.keys(srs)) {
      if (srs[k]?.graduated) verbPrepGraduated++;
    }
  } catch { /* ignore */ }

  // نقاط ضعف مرتبط با B2
  const weakAreas: string[] = [];
  if (recentAccuracy < 0.7) weakAreas.push('دقت کلی زیر ۷۰٪');
  const b2Words = words.filter(w => String(w.lvl || '').trim().toUpperCase() === 'B2');
  if (b2Words.length > 0) {
    const b2MasteryRatio = vocabB2Mastered / b2Words.length;
    if (b2MasteryRatio < 0.5) weakAreas.push(`تنها ${Math.round(b2MasteryRatio * 100)}٪ از واژگان B2 مسلط‌شده`);
  }
  if (verbPrepGraduated < 30) weakAreas.push(`فقط ${verbPrepGraduated} فعل+حرف اضافه دانش‌آموخته`);

  // نمرهٔ آمادگی: ترکیب وزنی
  const b2VocabScore = vocabB2 > 0 ? Math.round((vocabB2Mastered / vocabB2) * 100) : 0;
  const accuracyScore = Math.round(recentAccuracy * 100);
  const srsScore = Math.min(100, Math.round((verbPrepGraduated / 50) * 100));
  const score = Math.round(b2VocabScore * 0.4 + accuracyScore * 0.35 + srsScore * 0.25);

  return {
    score: Math.max(0, Math.min(100, score)),
    vocabB2,
    vocabB2Mastered,
    verbPrepGraduated,
    recentAccuracy: Math.round(recentAccuracy * 100),
    weakAreas
  };
}

/* ──────────── ساخت برنامهٔ روزانهٔ تطبیقی ──────────── */
function buildDailyPlan(weaknesses: WeakCategory[], b2: B2Readiness): DailyPlan {
  const items: DailyPlanItem[] = [];
  // اولویت ۱: ۳ نقطهٔ ضعف اصلی
  for (const w of weaknesses.slice(0, 3)) {
    const count = w.mastery < 50 ? 8 : w.mastery < 70 ? 5 : 3;
    items.push({
      mode: w.suggestedMode || '',
      label: w.label,
      icon: w.icon,
      count,
      reason: `دقت فعلی ${w.mastery}٪ — نیاز به تمرکز`
    });
  }
  // اولویت ۲: واژگان سررسید (اگر زیادی باشد)
  // اولویت ۳: ارتقای آمادگی B2 — اگر آمادگی پایین است، تمرین B2-spec اضافه کن
  if (b2.score < 70 && b2.vocabB2 > 0) {
    items.push({
      mode: 'flash',
      label: 'مرور واژگان B2',
      icon: '🎯',
      count: 10,
      reason: `آمادگی B2: ${b2.score}٪ — تمرکز روی واژگان سطح B2`
    });
  }
  // اولویت ۴: فعل+حرف اضافه (مهم برای B2)
  if (b2.verbPrepGraduated < 50) {
    items.push({
      mode: 'vprep',
      label: 'فعل + حرف اضافه',
      icon: '🔗',
      count: 5,
      reason: `${b2.verbPrepGraduated} فعل دانش‌آموخته — هدف: ۵۰+`
    });
  }
  const totalMinutes = items.reduce((a, i) => a + i.count * 3, 0); // ~۳ دقیقه برای هر تمرین
  const focus = weaknesses[0] ? weaknesses[0].label : 'مرور متوازن';
  return { items, totalMinutes, focus };
}

/* ──────────── تابع اصلی: تحلیل کامل ──────────── */
export function analyzeWeaknesses(state: AppState): WeaknessReport {
  // تحلیل ۷ روز اخیر برای تمرکز روی وضعیت فعلی
  const recent = analyzeByExerciseType(state.hist, 7);
  const allTime = analyzeByExerciseType(state.hist);
  const byPos = analyzeByPos(state.words);
  const byCase = analyzeByCase(state.words);
  const byLevel = analyzeByLevel(state.words);
  const byTense = analyzeByTense(state.words);

  // ترکیب: تحلیل اخیر (۷ روز) اولویت دارد؛ اگر خالی بود، allTime
  const categories = [
    ...(recent.length ? recent : allTime),
    ...byCase,
    ...byTense,
    ...byPos,
    ...byLevel
  ];

  // فیلتر نهایی: فقط دسته‌هایی با حداقل ۳ پاسخ، و مرتب بر اساس mastery
  const filtered = categories
    .filter(c => c.total >= 3)
    .sort((a, b) => a.mastery - b.mastery);

  // نقاط ضعف اصلی: mastery < 70٪ — حداکثر ۳ مورد
  const topWeaknesses = filtered
    .filter(c => c.mastery < 70)
    .slice(0, 3);

  // دقت ۷ روز اخیر
  const recent7 = state.hist.filter(h => h.t > Date.now() - 7 * DAY);
  const recentAccuracy = recent7.length ? recent7.filter(h => h.ok).length / recent7.length : 0;

  const b2 = computeB2Readiness(state, recentAccuracy);
  const plan = buildDailyPlan(topWeaknesses.length ? topWeaknesses : filtered.slice(0, 2), b2);

  return { categories: filtered, topWeaknesses, b2, plan };
}
