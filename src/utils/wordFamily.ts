/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * wordFamily.ts — خانواده واژگان (نسخه نهایی اصلاح‌شده)
 */
import { Word } from '../types';
import { parseFamily, fullWord, nz, isVerbPos, isNounPos } from './storage';
import { stripHeadAnnotation, hasHeadAnnotation } from '../data/verbPrep';

export interface FamilyMember {
  word: Word;
  role: 'head' | 'noun' | 'verb' | 'adj';
  isGhost: boolean;
  fa: string;
}

export interface WordFamily {
  id: string;
  head: string;
  headFa: string;
  icon: string;
  headExists: boolean;
  members: FamilyMember[];
  count: number;
  level: string;
}

const familyIconFor = (_head: Word | null): string => '🔄';

type Kind = 'verb' | 'noun' | 'adj';

const lemmaKey = (de: string): string => {
  const raw = de || '';
  let bare = raw;
  try { bare = stripHeadAnnotation(raw) || raw; } catch { bare = raw; }
  return nz(bare)
    .replace(/\s*[（(][^)）]*[)）]\s*/g, ' ')
    .trim()
    .replace(/^(der|die|das|sich)\s+/i, '')
    .trim()
    .toLowerCase();
};

const INF_RE = /^[a-zäöüß]{3,}(?:eln|ern|en)$/;

const SEPARABLE_PREFIXES = [
  'ab', 'an', 'auf', 'aus', 'bei', 'ein', 'entgegen', 'fort', 'her', 'heraus', 'herein', 'herauf',
  'herunter', 'heran', 'herum', 'hervor', 'hin', 'hinein', 'hinaus', 'hinauf', 'hinunter', 'hinzu',
  'los', 'mit', 'nach', 'nieder', 'statt', 'teil', 'um', 'vor', 'voran', 'voraus', 'vorbei', 'vorher',
  'weg', 'weiter', 'wieder', 'zurück', 'zusammen', 'zurecht', 'zu', 'fest', 'frei', 'hoch', 'dar',
  'dazu', 'dabei', 'daran', 'darauf', 'auseinander', 'aneinander', 'miteinander', 'durch', 'über', 'unter'
];
const INSEPARABLE_PREFIXES = ['be', 'ent', 'er', 'ge', 'miss', 'ver', 'zer', 'emp', 'hinter', 'wider', 'voll'];
const ALL_PREFIXES = Array.from(new Set([...SEPARABLE_PREFIXES, ...INSEPARABLE_PREFIXES]))
  .sort((a, b) => b.length - a.length);
const SEPARABLE_SORTED = [...SEPARABLE_PREFIXES].sort((a, b) => b.length - a.length);

const KNOWN_BASE_VERBS = new Set((
  'achten ahnen antworten ärgern arbeiten atmen backen baden bauen bedeuten beißen beten bieten bilden binden bitten ' +
  'bleiben blicken blühen bohren borgen brauchen brechen brennen bringen decken dienen drehen dringen drucken ' +
  'drücken dürfen duften duschen eilen enden erben essen fahren fallen fangen fassen fehlen feiern fertigen finden ' +
  'fliegen fliehen fließen folgen fordern fördern formen fragen fressen freuen frieren fühlen führen füllen geben ' +
  'gehen gelten informieren genießen gewinnen gießen gleichen graben greifen grüßen haben halten handeln hängen hassen hauen ' +
  'heben heilen heißen heizen helfen hoffen hören irren jagen kämpfen kehren kennen klagen klären ' +
  'kleben kleiden klingen klopfen kochen kommen können kosten kratzen kriechen kühlen kümmern lächeln lachen laden ' +
  'lagern landen langen lassen laufen leben legen leiden leihen leiten lernen lesen lieben liegen loben ' +
  'lösen lügen machen mahlen malen meiden meinen merken messen mieten mischen mögen müssen nähen nehmen nennen ' +
  'nutzen nützen öffnen opfern ordnen packen parken passen pfeifen pflegen planen preisen prüfen putzen quälen ' +
  'rächen raten rauchen rechnen reden regeln regnen reiben reichen reinigen reisen reißen reiten rennen retten ' +
  'richten riechen ringen rücken rufen sagen salzen sammeln saugen schaden schaffen schälen schalten schämen ' +
  'schätzen schauen scheiden scheinen schenken schicken schieben schießen schlafen schlagen schleichen schließen ' +
  'schlucken schmecken schmelzen schmerzen schneiden schneien schonen schreiben schreien schreiten schützen ' +
  'schweigen schwimmen schwingen schwören segnen senden setzen sichern siegen singen sinken sitzen sollen ' +
  'sorgen sparen speichern spenden sperren spielen sprechen springen spüren stecken stehen stehlen steigen stellen ' +
  'sterben stimmen stören stoßen strafen strecken streichen streiten stricken studieren stützen suchen tanzen ' +
  'tauschen täuschen teilen testen töten tragen trauen träumen treffen treiben trennen treten trinken trocknen ' +
  'trösten tun üben überlegen wagen wählen wahren wachsen wandern warnen warten waschen wechseln wecken weinen ' +
  'weisen wenden werben werden werfen werten widmen wirken wissen wohnen wollen wünschen zahlen zählen zeichnen ' +
  'zeigen zeugen ziehen zielen zögern zünden zweifeln zwingen'
).split(/\s+/).filter(Boolean));

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

const kindOf = (w: Word): Kind => {
  if (isVerbPos(w.pos) || hasHeadAnnotation(w.de || '')) return 'verb';
  if (w.art || isNounPos(w.pos)) return 'noun';
  if (!(w.pos || '').trim() && INF_RE.test(lemmaKey(w.de))) return 'verb';
  return 'adj';
};

const cleanVerbForm = (raw: string): string => {
  const s = lemmaKey(raw);
  return (s.split(/\s+/)[0] || '').trim();
};

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

const makeRootFinder = (isValidBase: (v: string) => boolean) => (raw: string): string | null => {
  let s = cleanVerbForm(raw);
  if (!s || !/^[a-zäöüß]+$/.test(s)) return null;

  if (PARTICIPLE_TO_INFINITIVE[s]) {
    s = PARTICIPLE_TO_INFINITIVE[s];
  } else if (WEAK_PARTICIPLE_RE.test(s) && s.length > 5) {
    s = weakParticipleToInfinitive(s);
  } else if (!INF_RE.test(s)) {
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

export const buildWordFamilies = (words: Word[]): WordFamily[] => {
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
    KNOWN_BASE_VERBS.has(v) || verbKeys.has(v) || (stemCount.get(v) || 0) >= 2 || v === 'brauchen';
  const rootOfVerb = makeRootFinder(isValidBase);

  const lookup = (key: string, kind: Kind): Word | undefined => {
    const list = byKey.get(key);
    if (!list || list.length === 0) return undefined;
    const same = list.find(w => kindOf(w) === kind);
    if (same) return same;
    return kind === 'verb' ? undefined : list.find(w => kindOf(w) !== 'verb');
  };

  interface FamAgg {
    headWord: Word | null;
    headDe: string;
    headFa: string;
    members: Map<string, FamilyMember>;
    realKeys: Set<string>;
  }
  const families = new Map<string, FamAgg>();
  const ownerRoot = new Map<string, string>();

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
    if (agg.realKeys.has(`${role}:${key}`)) return;
    const mk = `g:${role}:${key}`;
    const existing = agg.members.get(mk);
    if (existing) {
      if (!existing.fa && fa) {
        agg.members.set(mk, { ...existing, fa, word: { ...existing.word, fa } });
      }
      return;
    }
    const ghost: Word = { ...proto, id: `ghost-${role}-${key}`, de, art, fa, pos } as any;
    agg.members.set(mk, { word: ghost, role, isGhost: true, fa });
  };

  for (const w of words) {
    const fam = notesOf.get(w.id);
    if (!fam) continue;
    if (fam.nounsFa.length === 0 && fam.verbsFa.length === 0 && fam.adjsFa.length === 0) continue;

    const wKind = kindOf(w);

    let rootKey: string | null = null;
    if (wKind === 'verb') rootKey = rootOfVerb(w.de);
    if (!rootKey) {
      for (const v of fam.verbsFa) {
        const r = rootOfVerb(v.de);
        if (r) { rootKey = r; break; }
      }
    }
    if (!rootKey) continue;

    const rootWord = lookup(rootKey, 'verb') || null;
    const headFa =
      rootWord?.fa ||
      fam.verbsFa.find(v => cleanVerbForm(v.de) === rootKey)?.fa ||
      glossByVerb.get(rootKey) ||
      '';
    const agg = ensureFamily(rootKey, rootWord, headFa);
    ownerRoot.set(w.id, rootKey);

    const wKey = lemmaKey(w.de);
    if (!(wKind === 'verb' && wKey === rootKey)) {
      const canonical = lookup(wKey, wKind) || w;
      addReal(agg, wKind, canonical, '');
    }

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
      if (!vk || vk === rootKey) continue;
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

  for (const [rk, agg] of families) {
    for (const [mk, m] of Array.from(agg.members.entries())) {
      if (m.isGhost) continue;
      const own = ownerRoot.get(m.word.id);
      if (own && own !== rk && families.has(own)) agg.members.delete(mk);
    }
  }

  const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const result: WordFamily[] = [];
  for (const [rootKey, agg] of families.entries()) {
    let headMember: FamilyMember;
    if (agg.headWord) {
      headMember = { word: agg.headWord, role: 'head', isGhost: false, fa: agg.headWord.fa || agg.headFa };
    } else {
      const ghost: Word = {
        id: `ghost-head-${rootKey}`,
        de: agg.headDe,
        art: '',
        fa: agg.headFa,
        pos: 'فعل'
      } as any;
      headMember = { word: ghost, role: 'head', isGhost: true, fa: agg.headFa };
    }

    const rest = Array.from(agg.members.values()).filter(
      m => !(agg.headWord && !m.isGhost && m.word.id === agg.headWord.id)
    );
    const allMembers = [headMember, ...rest];
    if (allMembers.length < 2) continue;

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

  return result.sort((a, b) => b.count - a.count || a.head.localeCompare(b.head, 'de'));
};

export const wordFamilyOf = (w: Word, words: Word[]): WordFamily | undefined => {
  const families = buildWordFamilies(words);
  return (
    families.find(f => f.members.some(m => !m.isGhost && m.word.id === w.id)) ||
    families.find(f => f.id === lemmaKey(w.de))
  );
};
