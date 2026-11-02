/**
 * Mistake analysis for typed answers.
 * Compares what the learner typed with the correct form (character by character)
 * and produces highlighted segments + short Persian explanations.
 * The comparison ignores upper/lower case, exactly like the answer checkers do.
 */

export interface MistakeSegment {
  kind: 'eq' | 'chg';
  exp: string; // text from the correct answer
  usr: string; // text from the user's answer
}

export interface MistakeReport {
  user: string;
  expected: string;
  segments: MistakeSegment[];
  notes: string[];
  tooDifferent: boolean;
}

const ARTICLES = ['der', 'die', 'das'];

const clean = (s: string): string =>
  String(s || '').normalize('NFC').trim().replace(/\s+/g, ' ');

const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

const showChars = (s: string): string => (s.trim() === '' ? 'فاصله' : s);

/** Plain Levenshtein distance on lower-cased text (used to pick the closest accepted answer). */
export function editDistance(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  const prev: number[] = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (x[i - 1] === y[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[y.length];
}

/** Picks the accepted answer that is closest to what the user typed. */
export function closestAnswer(user: string, candidates: string[]): string {
  const list = candidates.map(clean).filter(Boolean);
  if (list.length === 0) return '';
  const u = clean(user);
  return list.reduce((best, c) => (editDistance(u, c) < editDistance(u, best) ? c : best), list[0]);
}

type Op = { t: 'eq' | 'sub' | 'del' | 'ins'; e?: string; u?: string };

function align(exp: string, usr: string): Op[] {
  const n = exp.length;
  const m = usr.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = same(exp[i - 1], usr[j - 1]) ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j - 1] + cost, dp[i - 1][j] + 1, dp[i][j - 1] + 1);
    }
  }
  const ops: Op[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const eq = same(exp[i - 1], usr[j - 1]);
      if (dp[i][j] === dp[i - 1][j - 1] + (eq ? 0 : 1)) {
        ops.push({ t: eq ? 'eq' : 'sub', e: exp[i - 1], u: usr[j - 1] });
        i--;
        j--;
        continue;
      }
    }
    if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      ops.push({ t: 'del', e: exp[i - 1] });
      i--;
    } else {
      ops.push({ t: 'ins', u: usr[j - 1] });
      j--;
    }
  }
  return ops.reverse();
}

const UMLAUT_BASE: Record<string, string> = { ä: 'a', ö: 'o', ü: 'u', Ä: 'A', Ö: 'O', Ü: 'U' };

export function analyzeMistake(userRaw: string, expectedRaw: string): MistakeReport {
  const user = clean(userRaw);
  const expected = clean(expectedRaw);
  const ops = align(expected, user);

  // Merge operations into equal / changed segments
  const segments: MistakeSegment[] = [];
  const starts: number[] = []; // start index (in expected) for every segment
  let pos = 0;
  ops.forEach(op => {
    const isEq = op.t === 'eq';
    const last = segments[segments.length - 1];
    if (last && (last.kind === 'eq') === isEq) {
      last.exp += op.e || '';
      last.usr += op.u || '';
    } else {
      segments.push({ kind: isEq ? 'eq' : 'chg', exp: op.e || '', usr: op.u || '' });
      starts.push(pos);
    }
    if (op.e) pos += 1;
  });

  const expTokens = expected.split(' ');
  const usrTokens = user.split(' ');
  const maxLen = Math.max(expected.length, user.length, 1);
  const dist = editDistance(user, expected);
  const tooDifferent = dist / maxLen > 0.6 && expected.length > 3;

  const notes: string[] = [];

  if (!user) {
    notes.push('پاسخی ننوشته‌اید.');
    return { user, expected, segments, notes, tooDifferent: false };
  }

  if (tooDifferent) {
    notes.push('پاسخ شما با شکل درست تفاوت زیادی دارد؛ دو شکل را کنار هم مقایسه کنید.');
    return { user, expected, segments, notes, tooDifferent: true };
  }

  // Article handling (der / die / das at the beginning of the expected answer)
  const expArt = ARTICLES.includes(expTokens[0].toLowerCase()) && expTokens.length > 1 ? expTokens[0].toLowerCase() : '';
  let skipUntil = -1; // chunks that start before this position of the expected text are covered by an article note
  if (expArt) {
    const usrFirst = usrTokens[0].toLowerCase();
    if (ARTICLES.includes(usrFirst) && usrFirst !== expArt) {
      notes.push(`آرتیکل را اشتباه نوشته‌اید: شما «${usrFirst}» نوشته‌اید، ولی آرتیکل درست «${expArt}» است.`);
      skipUntil = expTokens[0].length;
    } else if (!ARTICLES.includes(usrFirst) && usrTokens.length === expTokens.length - 1) {
      notes.push(`آرتیکل «${expArt}» را ننوشته‌اید.`);
      skipUntil = expTokens[0].length + 1;
    }
  }

  const tokenAt = (index: number): string => {
    let acc = 0;
    for (const tok of expTokens) {
      if (index <= acc + tok.length) return tok;
      acc += tok.length + 1;
    }
    return expTokens[expTokens.length - 1];
  };

  segments.forEach((seg, idx) => {
    if (seg.kind !== 'chg') return;
    const start = starts[idx];
    if (start < skipUntil) return;

    const where = expTokens.length > 1 ? ` (در «${tokenAt(start)}»)` : ` (حرف ${start + 1})`;
    const e = seg.exp;
    const u = seg.usr;

    if (!e && u) {
      notes.push(`«${showChars(u)}» اضافه نوشته‌اید${where}.`);
    } else if (e && !u) {
      notes.push(`«${showChars(e)}» جا افتاده است${where}.`);
    } else if (e.length === 2 && same(e, [...u].reverse().join('')) && !same(e[0], e[1])) {
      notes.push(`جای دو حرف «${e}» عوض شده است؛ شما «${u}» نوشته‌اید${where}.`);
    } else if (e.length === 1 && UMLAUT_BASE[e] && same(u, UMLAUT_BASE[e])) {
      notes.push(`حرف «${e}» اومْلاوت (دو نقطه) دارد؛ شما «${u}» نوشته‌اید${where}.`);
    } else if (e.toLowerCase() === 'ß' || (e.toLowerCase() === 'ss' && u.toLowerCase() === 'ß')) {
      notes.push(`به‌جای «${e}» نوشته‌اید «${u}»؛ ß و ss در آلمانی یکسان نیستند${where}.`);
    } else {
      notes.push(`به‌جای «${showChars(e)}» نوشته‌اید «${showChars(u)}»${where}.`);
    }
  });

  if (notes.length === 0) {
    notes.push('نوشتهٔ شما با شکل درست تفاوت دارد؛ دو شکل را مقایسه کنید.');
  }

  return { user, expected, segments, notes, tooDifferent: false };
}
