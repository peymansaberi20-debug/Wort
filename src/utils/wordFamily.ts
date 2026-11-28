/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * wordFamily.ts — خانواده واژگان (درخواست کاربر ۳، اصلاح این دور)
 *
 * تجمیع همهٔ واژه‌ها بر اساس families (مشتقاتشان) برای نمایش در تب واژگان.
 *
 * قواعد:
 *  - سرشاخه همیشه «فعل مصدر ساده» است (مثلاً brauchen). فعل‌های پیشوندی/مشتق
 *    (verbrauchen، gebrauchen، abbrechen، …) خودشان سرشاخه نیستند؛ زیر مصدر ساده می‌آیند.
 *  - اسم/صفت/قید سرشاخه نمی‌شوند ولی به‌عنوان زیرشاخه طبیعتاً می‌توانند باشند.
 *  - ترجمهٔ مهم هر عضو (داخل پرانتز) برای اعضای ghost (که در واژگان نیستند) نگه‌داری می‌شود.
 *
 * اصلاح این دور (علت تکراری‌ها مثل «sich engagieren»):
 *  - فعل‌های ذخیره‌شده سرِ پسونددار دارند («sich engagieren für +A»). کلید مقایسه (lemmaKey) قبلاً
 *    این پسوند را حذف نمی‌کرد، پس «engagieren für +a» با «engagieren» یکی حساب نمی‌شد و هم‌زمان
 *    یک عضو واقعی و یک عضو ghost (یا سرِ ghost + همان واژه به‌عنوان عضو) نمایش داده می‌شد.
 *    حالا کلید همه‌جا بدون «+A/+D»، بدون «sich» و بدون آرتیکل ساخته می‌شود.
 *  - هر واژهٔ واقعی فقط یک بار در یک خانواده می‌آید؛ اگر واژه خانوادهٔ مالک خودش را دارد،
 *    از خانواده‌های دیگر که فقط در notes ذکر شده حذف می‌شود.
 *  - جست‌وجوی واژه بر اساس نوع (فعل/اسم/صفت) انجام می‌شود تا «das Essen» و «essen» قاطی نشوند.
 */
import { Word } from '../types';
import { parseFamily, fullWord, nz, isVerbPos, isNounPos } from './storage';
import { stripHeadAnnotation, hasHeadAnnotation } from '../data/verbPrep';

export interface FamilyMember {
  word: Word;
  role: 'head' | 'noun' | 'verb' | 'adj';
  /** آیا این واژه توی واژگان کاربر نیست (ghost)؟ درخواست کاربر ۲ */
  isGhost: boolean;
  /** ترجمهٔ مهم فارسی این عضو (برای ghost از پرانتز استخراج می‌شود؛ برای موجود از w.fa) */
  fa: string;
}

export interface WordFamily {
  /** id یکتا — معمولاً lowercase سرِ خانواده (فعل مصدر ساده) */
  id: string;
  /** سرِ خانواده — نمایش برای کاربر */
  head: string;
  /** معنی فارسی سرِ خانواده */
  headFa: string;
  /** آیکن خانواده — فقط فعل سرشاخه است پس همیشه 🔄 */
  icon: string;
  /** آیا سر در واژگان موجود است؟ */
  headExists: boolean;
  /** همهٔ اعضای خانواده (شامل خود سر) */
  members: FamilyMember[];
  /** تعداد اعضا */
  count: number;
  /** سطح CEFR رایج‌ترین عضو */
  level: string;
}

const familyIconFor = (_head: Word | null): string => '🔄'; // درخواست کاربر: فقط فعل سرشاخه است

type Kind = 'verb' | 'noun' | 'adj';

/**
 * کلید یکتای واژه: بدون آرتیکل، بدون «sich»، بدون پسوند حرف اضافه/حالت («+A»)، بدون پرانتز، lowercase.
 * مثال: «sich engagieren für +A» → «engagieren»، «der Verbrauch» → «verbrauch»
 */
const lemmaKey = (de: string): string => {
  const raw = de || '';
  let bare = raw;
  try { bare = stripHeadAnnotation(raw) || raw; } catch { bare = raw; }
  return nz(bare)
    .replace(/\s*[（(][^)）]*[)）]\s*/g, ' ')
    .trim()
    .replace(/^(der|die|das|sich)\s+/, '')
    .trim();
};

const INF_RE = /^[a-zäöüß]{3,}(?:eln|ern|en)$/;

/** پیشوندهای جداشدنی (separable) */
const SEPARABLE_PREFIXES = [
  'ab', 'an', 'auf', 'aus', 'bei', 'ein', 'entgegen', 'fort', 'her', 'heraus', 'herein', 'herauf',
  'herunter', 'heran', 'herum', 'hervor', 'hin', 'hinein', 'hinaus', 'hinauf', 'hinunter', 'hinzu',
  'los', 'mit', 'nach', 'nieder', 'statt', 'teil', 'um', 'vor', 'voran', 'voraus', 'vorbei', 'vorher',
  'weg', 'weiter', 'wieder', 'zurück', 'zusammen', 'zurecht', 'zu', 'fest', 'frei', 'hoch', 'dar',
  'dazu', 'dabei', 'daran', 'darauf', 'auseinander', 'aneinander', 'miteinander', 'durch', 'über', 'unter'
];
/** پیشوندهای جدانشدنی (inseparable) */
const INSEPARABLE_PREFIXES = ['be', 'ent', 'er', 'ge', 'miss', 'ver', 'zer', 'emp', 'hinter', 'wider', 'voll'];
const ALL_PREFIXES = Array.from(new Set([...SEPARABLE_PREFIXES, ...INSEPARABLE_PREFIXES]))
  .sort((a, b) => b.length - a.length);
const SEPARABLE_SORTED = [...SEPARABLE_PREFIXES].sort((a, b) => b.length - a.length);

/** فعل‌های پایهٔ پرکاربرد — برای اعتبارسنجی اینکه «باقی‌ماندهٔ بعد از حذف پیشوند» واقعاً یک فعل ساده است */
const KNOWN_BASE_VERBS = new Set((
  'achten ahnen antworten ärgern arbeiten atmen backen baden bauen bedeuten beißen beten bieten bilden binden bitten ' +
  'bleiben blicken blühen bohren borgen brauchen brechen brennen bringen decken denken dienen drehen dringen drucken ' +
  'drücken dürfen duften duschen eilen enden erben essen fahren fallen fangen fassen fehlen feiern fertigen finden ' +
  'fliegen fliehen fließen folgen fordern fördern formen fragen fressen freuen frieren fühlen führen füllen geben ' +
  'gehen gelten genießen gewinnen gießen gleichen graben greifen grüßen haben halten handeln hängen hassen hauen ' +
  'heben heilen heißen heizen helfen hoffen holen hören irren jagen kämpfen kaufen kehren kennen klagen klären ' +
  'kleben kleiden klingen klopfen kochen kommen können kosten kratzen kriechen kühlen kümmern lächeln lachen laden ' +
  'lagern landen langen lassen laufen leben legen leiden leihen leiten lernen lesen lieben liefern liegen loben ' +
  'lösen lügen machen mahlen malen meiden meinen merken messen mieten mischen mögen müssen nähen nehmen nennen ' +
  'nutzen nützen öffnen opfern ordnen packen parken passen pfeifen pflegen planen preisen prüfen putzen quälen ' +
  'rächen raten rauchen rechnen reden regeln regnen reiben reichen reinigen reisen reißen reiten rennen retten ' +
  'richten riechen ringen rücken rufen sagen salzen sammeln saugen schaden schaffen schälen schalten schämen ' +
  'schätzen schauen scheiden scheinen schenken schicken schieben schießen schlafen schlagen schleichen schließen ' +
  'schlucken schmecken schmelzen schmerzen schneiden schneien schonen schreiben schreien schreiten schützen ' +
  'schweigen schwimmen schwingen schwören segnen sehen senden setzen sichern siegen singen sinken sitzen sollen ' +
  'sorgen sparen speichern spenden sperren spielen sprechen springen spüren stecken stehen stehlen steigen stellen ' +
  'sterben stimmen stören stoßen strafen strecken streichen streiten stricken studieren stützen suchen tanzen ' +
  'tauschen täuschen teilen testen töten tragen trauen träumen treffen treiben trennen treten trinken trocknen ' +
  'trösten tun üben überlegen wagen wählen wahren wachsen wandern warnen warten waschen wechseln wecken weinen ' +
  'weisen wenden werben werden werfen werten widmen wirken wissen wohnen wollen wünschen zahlen zählen zeichnen ' +
  'zeigen zeugen ziehen zielen zögern zünden zweifeln zwingen'
).split(/\s+/).filter(Boolean));

/** دیکشنری ساده برای برگرداندن Partizip II به مصدر — برای موارد متداول */
const PARTICIPLE_TO_INFINITIVE: Record<string, string> = {
  'gebrochen': 'brechen', 'gesprochen': 'sprechen', 'geschrieben': 'schreiben',
  'gegangen': 'gehen', 'gelaufen': 'laufen', 'gefahren': 'fahren',
  'gekommen': 'kommen', 'gesehen': 'sehen', 'gegeben': 'geben',
  'genommen': 'nehmen', 'gelesen': 'lesen', 'gegessen': 'essen',
  'getrunken': 'trinken', 'geschlafen': 'schlafen', 'getroffen': 'treffen',
  'gefallen': 'fallen', 'gestanden': 'stehen', 'gelegen': 'liegen',
  'gesessen': 'sitzen', 'gehalten': 'halten', 'getragen': 'tragen',
  'geworfen': 'werfen', 'gezogen': 'ziehen', 'geschlossen': 'schließen',
  'gemessen': 'messen', 'vergessen': 'vergessen', 'gelassen': 'lassen',
  'gelitten': 'leiden', 'geritten': 'reiten',
  'gebissen': 'beißen', 'gefolgen': 'folgen',
  'geplant': 'planen', 'gemacht': 'machen', 'gesagt': 'sagen',
  'gelernt': 'lernen', 'gekauft': 'kaufen', 'gearbeitet': 'arbeiten',
  'gespielt': 'spielen', 'gewohnt': 'wohnen', 'gebraucht': 'gebrauchen'
};

const WEAK_PARTICIPLE_RE = /^ge.{3,}t$/;
const weakParticipleToInfinitive = (s: string): string => {
  const c = s.slice(2, -1);
  return /en$/.test(c) ? c : c + 'en';
};

/** نوع واژه: فعل / اسم / (صفت و بقیه) */
const kindOf = (w: Word): Kind => {
  if (isVerbPos(w.pos) || hasHeadAnnotation(w.de || '')) return 'verb';
  if (w.art || isNounPos(w.pos)) return 'noun';
  // برچسب نوع خالی + شکل مصدر بدون آرتیکل → فعل
  if (!(w.pos || '').trim() && INF_RE.test(lemmaKey(w.de))) return 'verb';
  return 'adj';
};

/** از یک رشتهٔ فعل (با/بدون sich، +A، پرانتز) مصدر تمیز بساز: اولین کلمه، lowercase */
const cleanVerbForm = (raw: string): string => {
  const s = lemmaKey(raw);
  return (s.split(/\s+/)[0] || '').trim();
};

/**
 * حذف پیشوندها تا رسیدن به مصدر ساده.
 * فقط وقتی حذف می‌کنیم که باقی‌مانده یک «مصدر معتبر» باشد (isValidBase).
 *   verbrauchen → brauchen   |  gebrauchen → brauchen  |  abbrechen → brechen
 *   zurückbekommen → kommen  |  engagieren → engagieren (پیشوندی ندارد)
 */
const reduceVerb = (s: string, isValidBase: (v: string) => boolean, depth = 0): string => {
  if (depth > 2) return s;
  for (const p of ALL_PREFIXES) {
    if (!s.startsWith(p) || s.length < p.length + 4) continue;
    const rest = s.slice(p.length);
    if (!INF_RE.test(rest)) continue;
    const deeper = reduceVerb(rest, isValidBase, depth + 1);
    if (isValidBase(deeper)) return deeper;
  }
  return s;
};

/**
 * استخراج سرِ خانواده (فعل مصدر ساده) از یک رشتهٔ آلمانی.
 * اگر رشته فعل نباشد → null.
 */
const makeRootFinder = (isValidBase: (v: string) => boolean) => (raw: string): string | null => {
  let s = cleanVerbForm(raw);
  if (!s || !/^[a-zäöüß]+$/.test(s)) return null;

  if (PARTICIPLE_TO_INFINITIVE[s]) {
    s = PARTICIPLE_TO_INFINITIVE[s];
  } else if (WEAK_PARTICIPLE_RE.test(s) && s.length > 5) {
    s = weakParticipleToInfinitive(s);
  } else if (!INF_RE.test(s)) {
    // Partizip II با پیشوند جداشدنی: abgebrochen → brechen، abgeholt → holen
    for (const p of SEPARABLE_SORTED) {
      if (!s.startsWith(p) || s.length < p.length + 4) continue;
      const rest = s.slice(p.length);
      if (PARTICIPLE_TO_INFINITIVE[rest]) { s = PARTICIPLE_TO_INFINITIVE[rest]; break; }
      if (WEAK_PARTICIPLE_RE.test(rest)) { s = weakParticipleToInfinitive(rest); break; }
    }
  }

  if (!INF_RE.test(s)) return null;
  return reduceVerb(s, isValidBase);
};

/**
 * ساخت فهرست خانواده‌ها از همهٔ واژه‌ها.
 *
 *   ۱. برای هر واژه که در notes خط «خانواده واژگانی» دارد، سرشاخهٔ منطقی (فعل مصدر ساده) پیدا می‌شود:
 *      - خودش فعل است → ریشهٔ مصدر ساده‌اش (verbrauchen → brauchen)
 *      - اسم/صفت/قید است → ریشهٔ اولین فعل مرتبط در notes
 *   ۲. اعضایی که به یک سرشاخهٔ مشترک اشاره می‌کنند، زیر همان سرشاخه جمع می‌شوند.
 *   ۳. هر عضو فقط یک بار در یک خانواده می‌آید (dedupe بر اساس نوع + کلید بدون +A/sich/آرتیکل).
 */
export const buildWordFamilies = (words: Word[]): WordFamily[] => {
  // ── ۰) شاخص‌ها ───────────────────────────────────────────────
  const byKey = new Map<string, Word[]>();
  const verbKeys = new Set<string>();
  const notesOf = new Map<string, ReturnType<typeof parseFamily>>();
  const glossByVerb = new Map<string, string>();

  for (const w of words) {
    const k = lemmaKey(w.de);
    if (!k) continue;
    const list = byKey.get(k);
    if (list) list.push(w); else byKey.set(k, [w]);
    if (kindOf(w) === 'verb') verbKeys.add(k);

    const fam = parseFamily(w.notes);
    notesOf.set(w.id, fam);
    for (const v of fam.verbsFa) {
      const vk = cleanVerbForm(v.de);
      if (!vk) continue;
      verbKeys.add(vk);
      if (v.fa && !glossByVerb.has(vk)) glossByVerb.set(vk, v.fa);
    }
  }

  // شمارش باقی‌مانده‌های مشترک بعد از حذف پیشوند: اگر دو فعل مختلف (مثلاً verbrauchen و gebrauchen)
  // به یک مصدر مشترک (brauchen) برسند، آن مصدر معتبر است حتی اگر خودش در واژگان نباشد.
  const stemCount = new Map<string, number>();
  for (const vk of verbKeys) {
    const seen = new Set<string>();
    for (const p of ALL_PREFIXES) {
      if (!vk.startsWith(p) || vk.length < p.length + 4) continue;
      const rest = vk.slice(p.length);
      if (INF_RE.test(rest) && !seen.has(rest)) {
        seen.add(rest);
        stemCount.set(rest, (stemCount.get(rest) || 0) + 1);
      }
    }
  }
  const isValidBase = (v: string): boolean =>
    KNOWN_BASE_VERBS.has(v) || verbKeys.has(v) || (stemCount.get(v) || 0) >= 2;
  const rootOfVerb = makeRootFinder(isValidBase);

  /** پیدا کردن واژهٔ واقعی با کلید و نوع (فعل فقط با فعل جور می‌شود) */
  const lookup = (key: string, kind: Kind): Word | undefined => {
    const list = byKey.get(key);
    if (!list || list.length === 0) return undefined;
    const same = list.find(w => kindOf(w) === kind);
    if (same) return same;
    return kind === 'verb' ? undefined : list.find(w => kindOf(w) !== 'verb');
  };

  // ── ۱) خانواده‌ها ─────────────────────────────────────────────
  interface FamAgg {
    headWord: Word | null; // سرشاخهٔ واقعی (ممکن است توی واژگان نباشد)
    headDe: string; // متن سرشاخه
    headFa: string;
    members: Map<string, FamilyMember>;
    realKeys: Set<string>; // `${role}:${key}` برای اعضای واقعی — جلوگیری از ghost تکراری
  }
  const families = new Map<string, FamAgg>();
  const ownerRoot = new Map<string, string>(); // word.id → ریشهٔ خانوادهٔ مالک

  const ensureFamily = (rootKey: string, headWord: Word | null, headFa: string): FamAgg => {
    let agg = families.get(rootKey);
    if (!agg) {
      agg = { headWord, headDe: rootKey, headFa, members: new Map(), realKeys: new Set() };
      families.set(rootKey, agg);
    } else if (!agg.headFa && headFa) {
      agg.headFa = headFa;
    }
    return agg;
  };

  const addReal = (agg: FamAgg, role: Exclude<FamilyMember['role'], 'head'>, real: Word, fa: string) => {
    const key = lemmaKey(real.de);
    const mk = `r:${real.id}`;
    if (!agg.members.has(mk)) {
      // اگر قبلاً ghost هم‌نوع با همین کلید بوده، حذفش کن (نسخهٔ واقعی جایگزین می‌شود)
      agg.members.delete(`g:${role}:${key}`);
      agg.members.set(mk, { word: real, role, isGhost: false, fa: real.fa || fa || '' });
    }
    agg.realKeys.add(`${role}:${key}`);
    agg.realKeys.add(`${kindOf(real)}:${key}`);
  };

  const addGhost = (
    agg: FamAgg,
    role: Exclude<FamilyMember['role'], 'head'>,
    key: string,
    de: string,
    art: string,
    fa: string,
    proto: Word,
    pos: string
  ) => {
    if (agg.realKeys.has(`${role}:${key}`)) return; // نسخهٔ واقعی همین واژه در خانواده هست
    const mk = `g:${role}:${key}`;
    const existing = agg.members.get(mk);
    if (existing) {
      if (!existing.fa && fa) {
        agg.members.set(mk, { ...existing, fa, word: { ...existing.word, fa } });
      }
      return;
    }
    const ghost: Word = { ...proto, id: `ghost-${role}-${key}`, de, art, fa, pos };
    agg.members.set(mk, { word: ghost, role, isGhost: true, fa });
  };

  for (const w of words) {
    const fam = notesOf.get(w.id);
    if (!fam) continue;
    if (fam.nounsFa.length === 0 && fam.verbsFa.length === 0 && fam.adjsFa.length === 0) continue;

    const wKind = kindOf(w);

    // پیدا کردن سرشاخهٔ منطقی برای این واژه
    let rootKey: string | null = null;
    if (wKind === 'verb') rootKey = rootOfVerb(w.de);
    if (!rootKey) {
      for (const v of fam.verbsFa) {
        const r = rootOfVerb(v.de);
        if (r) { rootKey = r; break; }
      }
    }
    // فقط فعل‌ها سرشاخه‌اند؛ واژه‌ای که هیچ فعل منطقی ندارد رد می‌شود
    if (!rootKey) continue;

    const rootWord = lookup(rootKey, 'verb') || null;
    const headFa =
      rootWord?.fa ||
      fam.verbsFa.find(v => cleanVerbForm(v.de) === rootKey)?.fa ||
      glossByVerb.get(rootKey) ||
      '';
    const agg = ensureFamily(rootKey, rootWord, headFa);
    ownerRoot.set(w.id, rootKey);

    // خود واژه به‌عنوان عضو (اگر خودش همان سرشاخهٔ فعل نیست)
    const wKey = lemmaKey(w.de);
    if (!(wKind === 'verb' && wKey === rootKey)) {
      const canonical = lookup(wKey, wKind) || w;
      addReal(agg, wKind, canonical, '');
    }

    // اعضای خانواده از notes
    for (const nf of fam.nounsFa) {
      const mk = lemmaKey(nf.de);
      if (!mk) continue;
      const mw = lookup(mk, 'noun');
      if (mw) addReal(agg, 'noun', mw, nf.fa);
      else addGhost(agg, 'noun', mk, nf.de.replace(/^(der|die|das)\s+/i, ''),
        (nf.de.match(/^(der|die|das)/i) || [])[0]?.toLowerCase() || '', nf.fa, w, 'اسم');
    }
    for (const vf of fam.verbsFa) {
      const vk = cleanVerbForm(vf.de);
      if (!vk || vk === rootKey) continue; // خود سرشاخه جدا اضافه می‌شود
      // فعلی که ریشهٔ ساده‌اش همین سرشاخه است یا هیچ ریشه‌ای ندارد، عضو این خانواده است
      const vw = lookup(vk, 'verb');
      if (vw) addReal(agg, 'verb', vw, vf.fa);
      else addGhost(agg, 'verb', vk, vf.de.replace(/^sich\s+/i, ''), '', vf.fa, w, 'فعل');
    }
    for (const af of fam.adjsFa) {
      const ak = lemmaKey(af.de);
      if (!ak) continue;
      const aw = lookup(ak, 'adj');
      if (aw) addReal(agg, 'adj', aw, af.fa);
      else addGhost(agg, 'adj', ak, af.de, '', af.fa, w, 'صفت');
    }
  }

  // ── ۲) هر واژهٔ واقعی فقط در خانوادهٔ مالک خودش بماند ───────────
  for (const [rk, agg] of families) {
    for (const [mk, m] of Array.from(agg.members.entries())) {
      if (m.isGhost) continue;
      const own = ownerRoot.get(m.word.id);
      if (own && own !== rk && families.has(own)) agg.members.delete(mk);
    }
  }

  // ── ۳) تبدیل به خروجی نهایی ──────────────────────────────────
  const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const result: WordFamily[] = [];
  for (const [rootKey, agg] of families.entries()) {
    // اضافه‌کردن خود سرشاخه به‌عنوان عضو head
    let headMember: FamilyMember;
    if (agg.headWord) {
      headMember = { word: agg.headWord, role: 'head', isGhost: false, fa: agg.headWord.fa || agg.headFa };
    } else {
      // سرشاخه توی واژگان نیست — یک ghost بساز
      const ghost: Word = {
        id: `ghost-head-${rootKey}`,
        de: agg.headDe,
        art: '',
        fa: agg.headFa,
        pos: 'فعل'
      } as any;
      headMember = { word: ghost, role: 'head', isGhost: true, fa: agg.headFa };
    }

    // خود سرشاخه (واقعی) هرگز دوباره به‌عنوان عضو نمایش داده نشود
    const rest = Array.from(agg.members.values()).filter(
      m => !(agg.headWord && !m.isGhost && m.word.id === agg.headWord.id)
    );
    const allMembers = [headMember, ...rest];
    if (allMembers.length < 2) continue; // حداقل سر + یک عضو

    // سطح رایج: میانه
    const lvls = allMembers.map(m => m.word.lvl).filter(Boolean) as string[];
    const level = lvls.length
      ? lvls.sort((a, b) => LEVELS.indexOf(a) - LEVELS.indexOf(b))[Math.floor(lvls.length / 2)]
      : '';

    result.push({
      id: rootKey,
      head: agg.headWord ? fullWord(agg.headWord) : agg.headDe,
      headFa: agg.headFa,
      icon: familyIconFor(agg.headWord),
      headExists: !!agg.headWord,
      members: allMembers,
      count: allMembers.length,
      level
    });
  }

  // مرتب‌سازی بر اساس تعداد اعضا (نزولی)
  return result.sort((a, b) => b.count - a.count || a.head.localeCompare(b.head, 'de'));
};

/** آیا واژه در یک خانواده است؟ — برای نمایش badge در پروفایل واژه (سر یا عضو) */
export const wordFamilyOf = (w: Word, words: Word[]): WordFamily | undefined => {
  const families = buildWordFamilies(words);
  return (
    families.find(f => f.members.some(m => !m.isGhost && m.word.id === w.id)) ||
    families.find(f => f.id === lemmaKey(w.de))
  );
};
