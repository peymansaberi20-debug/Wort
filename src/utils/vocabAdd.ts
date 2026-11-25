/**
 * vocabAdd.ts — گیت مرکزی «افزودن به واژه‌نامه» از داخل تمرین‌ها
 *
 * قبل از هر افزودن، کل کتابخانهٔ واژگان بررسی می‌شود و یکی از این تصمیم‌ها برمی‌گردد:
 *   1) exists   — واژه با قانون واحد تکراری‌های برنامه (utils/duplicates.ts) از قبل هست
 *   2) partizip — واژهٔ لمس‌شده شکل Partizip II یک فعل موجود در کتابخانه است
 *                 (منابع تشخیص: فیلد perf فعل کتابخانه، تولید شکل باقاعده، بانک فعل‌های بی‌قاعده)
 *   3) synonym  — واژهٔ لمس‌شده در فیلد «مترادف» (syn / synCluster) یک واژهٔ موجود ثبت شده
 *   4) ok       — واژهٔ تازه است؛ افزودن معمولی
 */

import { Word } from '../types';
import { findDuplicateWord, parseEntry } from './duplicates';
import { isVerbPos } from './storage';
import { IRR_VERBS } from '../data/irregularVerbs';

export type AddDecision =
  | { kind: 'ok' }
  | { kind: 'exists'; existing: Word }
  | { kind: 'partizip'; infinitive: Word; p2: string }
  | { kind: 'synonym'; host: Word };

const lc = (s: string) => (s || '').trim().toLocaleLowerCase('de');

/** حذف فعل کمکی («hat gemacht» → «gemacht» / «ist aufgestanden» → «aufgestanden») */
const perfP2 = (perf: string): string => {
  const toks = (perf || '').trim().split(/\s+/).filter(Boolean);
  return toks.length ? toks[toks.length - 1] : '';
};

/** پیشوندهای جداشدنی (هم‌نهنگ با VERB_PARTICLES در utils/storage.ts) */
const SEP_PREFIXES = [
  'ab', 'an', 'auf', 'aus', 'bei', 'ein', 'fest', 'her', 'hin', 'los', 'mit', 'nach', 'um', 'vor', 'weg',
  'weiter', 'zu', 'zurück', 'zusammen', 'statt', 'teil', 'heraus', 'hinaus', 'herein', 'hinein', 'vorbei',
  'wieder', 'durch', 'dar', 'fern', 'frei', 'hoch', 'nieder', 'empor', 'zurecht'
];

/** پیشوندهای ناجداشدنی — Partizip II بدون ge- می‌آید */
const INSEPARABLE = ['be', 'ge', 'er', 'ver', 'zer', 'ent', 'emp', 'miss'];

const STEM_SUFFIX_ET = /(?:[dt]|[dnm]n|chn|fn|tm|dm)$/;
const isVowelEnd = (s: string) => /[aäeäoöuüi]$/.test(s);

/**
 * تولید شکل‌های محتمل Partizip II باقاعده از مصدر (best-effort؛ فقط مکملِ
 * فیلد perf و بانک بی‌قاعده‌هاست تا پوشش فعل‌های باقاعدهٔ کتابخانه کامل شود).
 */
function regularP2Forms(infLower: string): string[] {
  let core = infLower.replace(/^sich\s+/, '').trim();
  // پسوند «حرف اضافه + حالت» سر واژه («warten auf +A») حذف می‌شود
  core = core.replace(/\s*\+\s*.*$/, '').trim();
  const tokens = core.split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const main = tokens[0];
  let prefix = '';
  for (const p of SEP_PREFIXES) {
    if (main.startsWith(p) && main.length > p.length + 2) { prefix = p; break; }
  }
  let stem = prefix ? main.slice(prefix.length) : main;
  if (stem.endsWith('en')) stem = stem.slice(0, -2);
  else if (stem.endsWith('n') && stem.length > 3) stem = stem.slice(0, -1);
  else if (stem.endsWith('eln') || stem.endsWith('ern')) stem = stem.slice(0, -1);
  if (stem.length < 3) return [];
  const suffix = STEM_SUFFIX_ET.test(stem) ? 'et' : 't';
  const out: string[] = [];
  if (INSEPARABLE.some(p => main.startsWith(p) && main.length > p.length + 3)) {
    // ver/arbeiten → verarbeitet: بدون ge-
    out.push(main.slice(0, main.length - (main.endsWith('en') ? 2 : main.endsWith('n') ? 1 : 0)) + suffix);
  } else if (/ieren$/.test(main)) {
    // studieren → studiert: بدون ge-
    out.push(main.slice(0, -1) + 't');
  } else {
    out.push(prefix + 'ge' + stem + suffix);
    out.push(prefix + 'ge' + stem + 'en'); // شکل قوی محتمل
  }
  return [...new Set(out.filter(Boolean))];
}

/** P2-های شناخته‌شدهٔ یک فعل کتابخانه: فیلد perf + شکل‌های تولیدی باقاعده */
function p2CandidatesOfVerb(w: Word): string[] {
  const out = new Set<string>();
  const fromPerf = perfP2(w.perf || '');
  if (fromPerf && fromPerf.toLocaleLowerCase('de') !== (w.de || '').toLocaleLowerCase('de')) out.add(lc(fromPerf));
  const inf = parseEntry(w.de, w.art).de;
  for (const f of regularP2Forms(inf)) out.add(f);
  out.delete(lc(w.de || ''));
  return [...out];
}

/** نمای مصدرِ فعل برای نمایش و جست‌وجو در کتابخانه */
const verbKey = (de: string): string => parseEntry(stripSich(de), '').de;

function stripSich(de: string): string {
  return (de || '').replace(/^sich\s+(?:und\s+\S+\s+)?/i, '').replace(/\s*\+\s*.*$/, '').trim();
}

/** آیا مصدر داده‌شده در کتابخانه هست؟ (مطابق قانون واحد duplicates) */
function findVerbInLibrary(inf: string, words: Word[]): Word | null {
  const bare = verbKey(inf);
  if (!bare) return null;
  return (
    words.find(w => {
      if (!isVerbPos(w.pos)) return false;
      return parseEntry(w.de, w.art).de === bare;
    }) ||
    words.find(w => parseEntry(w.de, w.art).de === bare) ||
    null
  );
}

/** توکن‌های فیلد مترادف یک واژهٔ کتابخانه */
function synTokensOf(w: Word): string[] {
  const raw = [w.syn || '', w.synCluster || ''].join(';');
  return raw
    .split(/[,;،/|]+/)
    .map(t => t.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim())
    .filter(t => t.length >= 2)
    .map(lc);
}

/**
 * تصمیم مرکزی افزودن: اول تکراری، بعد Partizip II، بعد مترادف.
 * `data` باید حداقل de (و ترجیحاً art) را داشته باشد.
 */
export function classifyAdd(data: Partial<Word>, words: Word[]): AddDecision {
  const de = (data.de || '').trim();
  if (!de) return { kind: 'ok' };

  // ۱) واژهٔ دقیق از قبل در کتابخانه هست؟
  const existing = findDuplicateWord(de, data.art || '', words);
  if (existing) return { kind: 'exists', existing };

  const token = lc(parseEntry(de, data.art || '').de);

  // ۲) Partizip II یک فعل موجود؟
  //    الف) فیلد perf فعل‌های کتابخانه
  for (const w of words) {
    if (!isVerbPos(w.pos)) continue;
    const cands = p2CandidatesOfVerb(w);
    if (cands.includes(token)) return { kind: 'partizip', infinitive: w, p2: de };
  }
  //    ب) بانک فعل‌های بی‌قاعده — فقط وقتی مصدرش در کتابخانه هست
  for (const v of IRR_VERBS) {
    const forms = new Set([v.pp, ...(v.altPp || [])].map(lc));
    if (forms.has(token)) {
      const host = findVerbInLibrary(v.inf, words);
      if (host) return { kind: 'partizip', infinitive: host, p2: de };
    }
  }

  // ۳) مترادفِ یک واژهٔ کتابخانه؟ (خود واژه‌ها قبلاً در شاخهٔ exists چک شدند)
  for (const w of words) {
    if (synTokensOf(w).includes(token)) return { kind: 'synonym', host: w };
  }

  return { kind: 'ok' };
}

/** آیا این توکن، مصدرِ یک واژهٔ کتابخانه است؟ (برای دکمهٔ مشاهده در دیالوگ‌ها) */
export function findLibraryWord(token: string, words: Word[]): Word | null {
  return findDuplicateWord(token, '', words);
}
