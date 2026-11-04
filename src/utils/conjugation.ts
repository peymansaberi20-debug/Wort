/**
 * Shared German present-tense conjugation segmentation.
 *
 * Splits one conjugated form into structured segments so every screen
 * (flashcards, vocabulary profile, ...) colours it in exactly the same way:
 *   - 'stem'   : unchanged part of the verb stem
 *   - 'change' : irregular stem-vowel change (and genuinely irregular letters) -> red
 *   - 'ending' : regular personal ending (-e, -st, -t, -en ...)              -> blue
 *   - 'extra'  : words after the finite verb (separated prefix, reflexive pronoun)
 */

export type SegKind = 'stem' | 'change' | 'ending' | 'extra';

export interface ConjSegment {
  text: string;
  kind: SegKind;
}

const PRON_RE = /^(ich|du|er\/sie\/es|er\/sie|er|es|wir|ihr|sie\/sie|sie)\s+(\S[\s\S]*)$/i;

/** Grammatical slot (0 ich .. 5 sie/Sie) of a leading pronoun; a bare "sie" is resolved by its position. */
function pronounSlot(pron: string, position: number): number {
  const p = pron.toLowerCase();
  if (p === 'ich') return 0;
  if (p === 'du') return 1;
  if (p === 'er' || p === 'es' || p === 'er/sie' || p === 'er/sie/es') return 2;
  if (p === 'wir') return 3;
  if (p === 'ihr') return 4;
  if (p === 'sie/sie') return 5;
  return position <= 3 ? 2 : 5; // plain "sie"
}

/**
 * Splits the stored conjugation string into (up to) six forms in the fixed grammatical order
 * ich, du, er/sie/es, wir, ihr, sie/Sie. Forms are returned WITHOUT a leading personal pronoun
 * (the pronoun is shown separately by every screen), even if the stored text contained pronouns
 * or listed the persons in a different order.
 */
export function splitConj(conj: string): string[] {
  const raw = (conj || '').trim();
  if (!raw) return [];
  const parts = (raw.includes('|') ? raw.split('|') : raw.split(/[,;،]/)).map(p => p.trim()).slice(0, 6);
  const parsed = parts.map((p, i) => {
    const m = p.match(PRON_RE);
    return m ? { slot: pronounSlot(m[1], i), form: m[2].trim() } : null;
  });
  if (parsed.every(x => x === null)) return parts;
  if (parsed.some(x => x === null)) return parts.map((p, i) => (parsed[i] ? parsed[i]!.form : p));
  const out: string[] = new Array(Math.max(parts.length, 6)).fill('');
  let unique = true;
  parsed.forEach(x => {
    if (out[x!.slot]) unique = false;
    out[x!.slot] = x!.form;
  });
  if (!unique) return parsed.map(x => x!.form);
  return parts.length === 6 ? out : out.slice(0, Math.max(...parsed.map(x => x!.slot)) + 1);
}

// Candidate regular endings per person (ich, du, er/sie/es, wir, ihr, sie/Sie).
// '' = no ending (modal verbs, sein, ...).
const ENDINGS: string[][] = [
  ['e', ''],
  ['est', 'st', 't', ''],
  ['et', 't', ''],
  ['en', 'n', ''],
  ['et', 't', ''],
  ['en', 'n', '']
];

const VOWELS = 'aeiouäöüy';
const isVowel = (c: string) => VOWELS.includes(c.toLowerCase());
// ß is spelling-equivalent to s (ss <-> ß) for comparison purposes.
const fold = (c: string) => (c.toLowerCase() === 'ß' ? 's' : c.toLowerCase());

const COST_SUB = 1;
const COST_INS = 1; // letter in the form that is not in the infinitive stem
const COST_DEL = 0.5; // letter of the infinitive stem missing in the form (e.g. dropped e)

type Op = 'M' | 'S' | 'I'; // match / substitution / insertion (per letter of `stem`)

interface Alignment {
  cost: number;
  ops: Op[];
}

/** Edit-distance alignment of the form's stem against the infinitive stem. */
function align(stem: string, inf: string): Alignment {
  const n = stem.length;
  const m = inf.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) dp[i][0] = i * COST_INS;
  for (let j = 1; j <= m; j++) dp[0][j] = j * COST_DEL;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const same = fold(stem[i - 1]) === fold(inf[j - 1]);
      dp[i][j] = Math.min(
        dp[i - 1][j - 1] + (same ? 0 : COST_SUB),
        dp[i - 1][j] + COST_INS,
        dp[i][j - 1] + COST_DEL
      );
    }
  }
  const ops: Op[] = new Array(n);
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const same = fold(stem[i - 1]) === fold(inf[j - 1]);
      if (dp[i][j] === dp[i - 1][j - 1] + (same ? 0 : COST_SUB)) {
        ops[i - 1] = same ? 'M' : 'S';
        i--;
        j--;
        continue;
      }
    }
    if (i > 0 && dp[i][j] === dp[i - 1][j] + COST_INS) {
      ops[i - 1] = 'I';
      i--;
      continue;
    }
    j--; // deletion: nothing to display
  }

  // ß <-> ss is spelling, not a stem change: an inserted "s" next to a matched s/ß is neutral.
  for (let k = 0; k < n; k++) {
    if (ops[k] === 'I' && fold(stem[k]) === 's') {
      const prev = k > 0 && ops[k - 1] === 'M' && fold(stem[k - 1]) === 's';
      const next = k < n - 1 && ops[k + 1] === 'M' && fold(stem[k + 1]) === 's';
      if (prev || next) ops[k] = 'M';
    }
  }
  return { cost: dp[n][m], ops };
}

function infinitiveStem(base: string): string {
  if (/(eln|ern)$/.test(base)) return base.slice(0, -1); // sammeln -> sammel
  if (/en$/.test(base)) return base.slice(0, -2);
  if (/n$/.test(base)) return base.slice(0, -1); // tun -> tu, sein -> sei
  return base;
}

/** Infinitive without "sich", without a separable prefix, last word only. */
function baseInfinitive(infinitive: string, mainLower: string, prefixCandidates: string[]): string {
  let b = (infinitive || '').trim().toLowerCase().replace(/^sich\s+/, '');
  for (const p of prefixCandidates) {
    const pre = (p || '').trim().toLowerCase();
    if (pre && b.startsWith(pre) && b.length > pre.length && !mainLower.startsWith(pre)) {
      b = b.slice(pre.length);
      break;
    }
  }
  const tokens = b.split(/\s+/).filter(Boolean);
  return tokens.length ? tokens[tokens.length - 1] : b;
}

function pushSeg(out: ConjSegment[], text: string, kind: SegKind) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.kind === kind) last.text += text;
  else out.push({ text, kind });
}

export function segmentConjugation(
  infinitive: string,
  form: string,
  pronounIndex: number,
  sep?: string
): ConjSegment[] {
  const clean = (form || '').trim();
  if (!clean) return [];

  const tokens = clean.split(/\s+/);
  const main = tokens[0];
  const trailing = tokens.slice(1).join(' ');
  const mainLower = main.toLowerCase();

  const out: ConjSegment[] = [];
  const finish = () => {
    if (trailing) pushSeg(out, ' ' + trailing, 'extra');
    return out;
  };

  const base = baseInfinitive(infinitive, mainLower, [sep || '', tokens[1] || '']);
  const infStem = infinitiveStem(base);

  // Without a usable infinitive we can only mark the ending.
  const candidates = ENDINGS[pronounIndex] || [''];
  let best: { ending: string; stem: string; al: Alignment; score: number } | null = null;

  for (const ending of candidates) {
    if (ending && !mainLower.endsWith(ending)) continue;
    const stem = main.slice(0, main.length - ending.length);
    if (!stem) continue;
    // du + bare "t" only when the stem's last sound is s/ß/x/z (du liest, du heißt, du tanzt)
    if (pronounIndex === 1 && ending === 't' && !/[sßxz]$/i.test(stem)) continue;
    const al = infStem
      ? align(stem.toLowerCase(), infStem)
      : { cost: 0, ops: new Array<Op>(stem.length).fill('M') };
    const score = al.cost + (ending === '' ? 0.01 : 0);
    if (!best || score < best.score) best = { ending, stem, al, score };
  }

  if (!best) {
    pushSeg(out, main, 'stem');
    return finish();
  }

  let { ending, stem } = best;
  const ops = best.al.ops.slice();
  const lowStem = stem.toLowerCase();
  const matched = ops.filter(o => o === 'M').length;
  const red: boolean[] = new Array(stem.length).fill(false);

  if (infStem && matched <= 1 && stem.length >= 2 && infStem.length >= 2) {
    // practically nothing in common with the infinitive (bin, bist, ist ...): whole stem irregular
    red.fill(true);
  } else if (infStem) {
    const lastMatch = ops.lastIndexOf('M');
    for (let i = 0; i < stem.length; i++) {
      if (ops[i] === 'M') continue;
      const c = lowStem[i];
      if (isVowel(c)) {
        red[i] = true;
        // a vowel added next to a matched vowel forms one new vowel group (e -> ie, i -> ei)
        if (ops[i] === 'I') {
          for (const j of [i - 1, i + 1]) {
            if (j >= 0 && j < stem.length && ops[j] === 'M' && isVowel(lowStem[j])) red[j] = true;
          }
        }
      } else {
        const doubling =
          (i > 0 && ops[i - 1] === 'M' && lowStem[i - 1] === c) ||
          (i < stem.length - 1 && ops[i + 1] === 'M' && lowStem[i + 1] === c);
        // a consonant change counts only when appended after everything that matches (sind, seid)
        if (!doubling && i > lastMatch) red[i] = true;
      }
    }
  }

  // du liest / du heißt / du tanzt: the stem's final s-sound is shared with the "-st" ending
  if (pronounIndex === 1 && ending === 't' && /[sßxz]$/i.test(stem) && !red[stem.length - 1]) {
    ending = stem[stem.length - 1] + ending;
    stem = stem.slice(0, -1);
    red.pop();
  }

  // er hält / ihr ... : the stem's final t is shared with the "-t" ending (halten, raten, gelten)
  if (
    (pronounIndex === 2 || pronounIndex === 4) &&
    ending === '' &&
    /t$/i.test(stem) &&
    infStem.endsWith('t') &&
    !red[stem.length - 1]
  ) {
    ending = stem[stem.length - 1];
    stem = stem.slice(0, -1);
    red.pop();
  }

  for (let i = 0; i < stem.length; i++) pushSeg(out, stem[i], red[i] ? 'change' : 'stem');
  pushSeg(out, ending, 'ending');
  return finish();
}

export const P6_LABELS = ['ich', 'du', 'er/sie/es', 'wir', 'ihr', 'sie/Sie'];

const PRON_ACCEPT: string[][] = [['ich'], ['du'], ['er', 'sie', 'es', 'er/sie/es'], ['wir'], ['ihr'], ['sie', 'sie/sie']];
const ALL_SUBJECT_PRONOUNS = ['ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr'];
const REFLEXIVE_PRONOUNS = ['mich', 'dich', 'sich', 'uns', 'euch'];

const nzc = (x: string) => (x || '').trim().replace(/\s+/g, ' ').toLowerCase();

export interface ConjCheck {
  ok: boolean;
  target: string; // the correct form for the requested pronoun
  wrongPron: string; // a different subject pronoun typed in front of the form
  otherIdx: number; // index of another person whose form was typed (-1 if none)
  missingPart: boolean; // separable prefix missing
  cands: string[];
}

/**
 * Validates an answer of the conjugation exercise for the requested person (0 ich .. 5 sie/Sie).
 * The pronoun belongs to the question: the answer may be written with or without it,
 * but a different pronoun in front of the form is an error.
 */
export function checkConjAnswer(conj: string, pron: number, input: string, fallback = ''): ConjCheck {
  const forms = splitConj(conj);
  const target = forms[pron] || fallback;
  const words = target.split(/\s+/);
  const reflexive = words.length === 2 && REFLEXIVE_PRONOUNS.includes(words[1].toLowerCase());
  const trimmed = (input || '').trim();
  const parts = trimmed.split(/\s+/);
  const first = nzc(parts[0] || '');
  let candidate = trimmed;
  let wrongPron = '';
  if (parts.length > 1 && ALL_SUBJECT_PRONOUNS.includes(first)) {
    if (PRON_ACCEPT[pron].includes(first)) candidate = parts.slice(1).join(' ');
    else wrongPron = first;
  }
  const ok = !wrongPron && !!target && (nzc(target) === nzc(candidate) || (reflexive && nzc(words[0]) === nzc(candidate)));
  const missingPart = !ok && !wrongPron && !reflexive && words.length > 1 && nzc(words[0]) === nzc(candidate);
  const otherIdx = forms.findIndex((f, i) => i !== pron && nzc(f) === nzc(candidate));
  return { ok, target, wrongPron, otherIdx: otherIdx >= 0 && nzc(forms[otherIdx]) !== nzc(target) ? otherIdx : -1, missingPart, cands: reflexive ? [target, words[0]] : [target] };
}
