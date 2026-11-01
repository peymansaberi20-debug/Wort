import { AppSettings, AppState, CaseQuestion, DailyGoal, ExtData, Word } from '../types';
import { INITIAL_SEED, P6 } from '../data/seed';
import { dayStart, today, dstr } from './dates';

export const KEY = 'deutschlab_pro_fa_v1';
export const EXT_KEY = 'wb_ext';
export const GEM_KEY = 'wb_gem_key';
export const GEM_MOD = 'wb_gem_model';
export const DEF_MOD = 'gemini-3.8-flash';

export const uid = (): string => 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);
export const fullWord = (w: Partial<Word>): string => (w.art ? cap(w.art) + ' ' + (w.de || '') : w.de || '');

const IMGOK = /^data:image\/(jpeg|png|webp|gif);base64,/;

export function norm(w: any): Word | null {
  if (!w || typeof w.de !== 'string' || !w.de.trim()) return null;
  const s = (k: string) => (typeof w[k] === 'string' ? w[k] : '');
  const a = s('art').toLowerCase();
  const validArt = ['der', 'die', 'das'].includes(a) ? a : '';

  return {
    id: s('id') || uid(),
    de: w.de.trim(),
    syn: s('syn'),
    synFa: s('synFa'),
    ant: s('ant'),
    antFa: s('antFa'),
    art: validArt,
    fa: s('fa'),
    pl: s('pl'),
    pos: s('pos'),
    lvl: s('lvl'),
    ex: s('ex'),
    exFa: s('exFa'),
    ex2: s('ex2'),
    ex2Fa: s('ex2Fa'),
    conj: s('conj'),
    prat: s('prat'),
    perf: s('perf'),
    komparativ: s('komparativ'),
    superlativ: s('superlativ'),
    imperativDu: s('imperativDu'),
    imperativIhr: s('imperativIhr'),
    imperativSie: s('imperativSie'),
    sep: s('sep'),
    cat: s('cat').trim().slice(0, 40),
    cloze: s('cloze'),
    ans: s('ans'),
    acc: Array.isArray(w.acc) ? w.acc.map(String) : [],
    tags: s('tags'),
    notes: s('notes'),
    img: IMGOK.test(s('img')) && s('img').length < 600000 ? s('img') : '',
    added: +w.added || Date.now(),
    last: +w.last || 0,
    due: +w.due || 0,
    ivl: +w.ivl || 0,
    ease: +w.ease || 2.5,
    stage: Math.max(0, Math.min(2, +w.stage || 0)),
    ok: +w.ok || 0,
    bad: +w.bad || 0,
    res: s('res'),
    suggestedNewCat: w.suggestedNewCat ? String(w.suggestedNewCat) : undefined
  };
}

const FILL: (keyof Word)[] = ['syn', 'synFa', 'ant', 'antFa', 'cat', 'ex2', 'ex2Fa', 'conj', 'prat', 'perf', 'sep', 'cloze', 'ans'];

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  dir: 'de',
  nw: 10,
  rv: 20,
  order: 'due',
  activeCats: [],
  ivlMod: 1,
  leechN: 4,
  leechAct: 'mark',
  revealSec: 0,
  showTimer: false,
  auto: false,
  autoEx: false,
  vreg: '',
  voice: '',
  rate: 0.85,
  goal: 20,
  bkDays: 7,
  freeDir: 'de',
  freeRnd: true
};

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw);
      if (o && Array.isArray(o.words)) {
        const ws = o.words.map(norm).filter(Boolean) as Word[];
        if ((o.sv || 0) < 4) {
          INITIAL_SEED.forEach(sd => {
            const e = ws.find(x => x.id === sd.id);
            if (!e) {
              const nw = norm(sd);
              if (nw) ws.push(nw);
            } else {
              FILL.forEach(k => {
                if (!e[k] && sd[k]) (e as any)[k] = sd[k];
              });
            }
          });
        }
        return {
          v: 1,
          sv: 4,
          words: ws,
          hist: Array.isArray(o.hist) ? o.hist : [],
          set: Object.assign({}, DEFAULT_SETTINGS, o.set || {}),
          daily: o.daily || { d: today(), n: 0, r: 0 }
        };
      }
    }
  } catch (e) {
    console.warn('Failed to load state from localStorage:', e);
  }

  return {
    v: 1,
    sv: 4,
    words: INITIAL_SEED.map(norm).filter(Boolean) as Word[],
    hist: [],
    set: { ...DEFAULT_SETTINGS },
    daily: { d: today(), n: 0, r: 0 }
  };
}

export function saveState(st: AppState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(st));
    return true;
  } catch (e) {
    console.error('Failed to save state:', e);
    return false;
  }
}

export function getExtData(): ExtData {
  try {
    return JSON.parse(localStorage.getItem(EXT_KEY) || '{}') || {};
  } catch (e) {
    return {};
  }
}

export function saveExtData(ext: ExtData): void {
  try {
    localStorage.setItem(EXT_KEY, JSON.stringify(ext));
  } catch (e) {}
}

export const isLeech = (w: Word, threshold = 4): boolean =>
  w.bad >= threshold && (w.ok + w.bad > 0) && (w.bad / (w.ok + w.bad) >= 0.4);
export const isWeak = (w: Word, threshold = 4): boolean =>
  isLeech(w, threshold) || (w.bad >= 2 && w.bad >= w.ok * 0.5);

export function clearReviewHistory(st: AppState): AppState {
  const resetWords = st.words.map(w => ({
    ...w,
    last: 0,
    due: 0,
    ivl: 0,
    ease: 2.5,
    stage: 0,
    ok: 0,
    bad: 0,
    res: ''
  }));
  return {
    ...st,
    words: resetWords,
    hist: [],
    daily: { d: today(), n: 0, r: 0 }
  };
}

export function clearAllVocabulary(st: AppState): AppState {
  return {
    ...st,
    words: [],
    hist: [],
    daily: { d: today(), n: 0, r: 0 }
  };
}

export function getDaily(st: AppState): DailyGoal {
  if (st.daily.d !== today()) {
    st.daily = { d: today(), n: 0, r: 0 };
  }
  return st.daily;
}

export function streakCount(hist: AppState['hist']): number {
  const s = new Set(hist.map(x => {
    const d = new Date(x.t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }));
  let o = s.has(today()) ? 0 : -1;
  let n = 0;
  while (s.has(dstr(dayStart(o)))) {
    n++;
    o--;
  }
  return n;
}

export function sched(w: Word, g: number, ivlMod = 1.0, leechN = 4): boolean {
  const n = Date.now();
  const first = !w.last;
  const learning = first || w.stage > 0;
  const oldI = Math.max(0, +w.ivl || 0);
  const oldEase = Math.max(1.3, Math.min(3.5, +w.ease || 2.5));

  if (g === 0) {
    w.bad++;
    w.ease = Math.max(1.3, oldEase - 0.2);
    w.ivl = 0;
    w.stage = 1;
    w.due = n + 60000;
  } else if (learning && g === 1) {
    w.ok++;
    w.stage = 1;
    w.ivl = 0;
    w.due = n + 6 * 60000;
  } else if (learning && g === 2) {
    w.ok++;
    if (first) {
      w.stage = 1;
      w.ivl = 0;
      w.due = n + 10 * 60000;
    } else {
      w.stage = 0;
      w.ivl = Math.max(1, Math.round(1 * (ivlMod || 1.0)));
      w.due = dayStart(w.ivl);
    }
  } else if (g === 3) {
    w.ok++;
    w.ease = Math.min(3.5, oldEase + 0.15);
    w.stage = 0;
    let baseI = learning ? 4 : Math.max(4, Math.round(Math.max(1, oldI) * oldEase * 1.3));
    w.ivl = Math.max(1, Math.round(baseI * (ivlMod || 1.0)));
    w.due = dayStart(w.ivl);
  } else {
    w.ok++;
    w.stage = 0;
    const factor = g === 1 ? Math.max(1.15, oldEase * 0.55) : oldEase;
    let baseI = oldI < 1 ? 1 : Math.max(1, Math.round(oldI * factor));
    w.ivl = Math.max(1, Math.round(baseI * (ivlMod || 1.0)));
    if (g === 1) w.ease = Math.max(1.3, oldEase - 0.15);
    if (isLeech(w, leechN)) w.ivl = Math.min(w.ivl, 3);
    w.due = dayStart(w.ivl);
  }

  // Cap interval for weak words
  if (g >= 1 && isWeak(w, leechN) && w.ivl > 7) {
    w.ivl = 7;
    w.due = dayStart(7);
  }

  w.last = n;
  w.res = g ? 'ok' : 'bad';
  return first;
}

export function intervalPreview(w: Word, g: number, ivlMod = 1.0): string {
  const first = !w.last;
  const learning = first || w.stage > 0;
  let mins = 0;
  let days = 0;
  if (g === 0) mins = 1;
  else if (learning && g === 1) mins = 6;
  else if (learning && g === 2) {
    if (first) mins = 10;
    else days = Math.max(1, Math.round(1 * (ivlMod || 1.0)));
  } else if (g === 3) {
    const base = learning ? 4 : Math.max(4, Math.round(Math.max(1, w.ivl) * w.ease * 1.3));
    days = Math.max(1, Math.round(base * (ivlMod || 1.0)));
  } else if (g === 1) {
    const base = Math.max(1, Math.round(Math.max(1, w.ivl) * 1.2));
    days = Math.max(1, Math.round(base * (ivlMod || 1.0)));
  } else {
    const base = w.ivl < 1 ? 1 : Math.max(1, Math.round(w.ivl * w.ease));
    days = Math.max(1, Math.round(base * (ivlMod || 1.0)));
  }
  return mins ? `${mins} دقیقه` : `${days} روز`;
}


export function lev(a: string, b: string): number {
  const m = [...Array(a.length + 1)].map((_, i) => [i]);
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return m[a.length][b.length];
}

export const nz = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase();
export const nz2 = (s: string): string => nz(s).replace(/[.,!?;:"“”]/g, '');

export function checkWord(w: Word, inp: string): { ok: number; exp: string; cat?: string; msg?: string } {
  const exp = w.ans || fullWord(w);
  if ([exp, ...w.acc].some(a => nz(a) === nz(inp))) return { ok: 1, exp };

  const e = exp.split(' ');
  const u = inp.trim().split(/\s+/);
  let cat = 'other';
  let msg = 'پاسخ نادرست است.';

  if (e.length === 2) {
    if (u.length === 1 && nz(u[0]) === nz(e[1])) {
      cat = 'missing';
      msg = 'آرتیکل را ننوشتید؛ آرتیکل درست: ' + e[0].toLowerCase();
    } else if (u.length === 2 && nz(u[1]) === nz(e[1])) {
      cat = 'article';
      msg = 'آرتیکل اشتباه است؛ آرتیکل درست: ' + e[0].toLowerCase();
    } else if (u.length === 2 && nz(u[0]) === nz(e[0]) && lev(nz(u[1]), nz(e[1])) <= 2) {
      cat = 'spelling';
      msg = 'املای اسم اشتباه است؛ درست: ' + e[1];
    }
  } else if (u.length === 1 && lev(nz(inp), nz(exp)) <= 2) {
    cat = 'spelling';
    msg = 'املا اشتباه است؛ درست: ' + exp;
  }
  return { ok: 0, exp, cat, msg };
}

export function genCheck(q: { exp: string; acc?: string[] }, v: string): { ok: number; exp: string; msg?: string } {
  const ok = [q.exp, ...(q.acc || [])].some(a => nz2(a) === nz2(v));
  return ok
    ? { ok: 1, exp: q.exp }
    : { ok: 0, exp: q.exp, msg: lev(nz2(v), nz2(q.exp)) <= 2 ? 'نزدیک بود؛ املا را بررسی کنید.' : 'پاسخ نادرست است.' };
}

export const nzc = (s: string): string =>
  String(s || '')
    .replace(/[\u200c\s]+/g, '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .toLowerCase();

export function getCategories(words: Word[]): [string, number][] {
  const m = new Map<string, number>();
  words.forEach(w => {
    if (w.cat) m.set(w.cat, (m.get(w.cat) || 0) + 1);
  });
  return [...m].sort((a, b) => a[0].localeCompare(b[0], 'fa'));
}

export function matchCat(n: string, words: Word[], extra?: string[]): string {
  n = nzc(n);
  if (!n) return '';
  if (n === 'redewendungen') return 'اصطلاحات (Redewendungen)';
  const all = [...getCategories(words).map(x => x[0]), ...(extra || [])];
  return (
    all.find(c => nzc(c) === n) ||
    all.find(c => {
      const k = nzc(c);
      return Math.min(k.length, n.length) >= 4 && lev(k, n) <= 1;
    }) ||
    ''
  );
}

export function resolveCat(name: string, words: Word[]): string {
  name = (name || '').trim().slice(0, 40);
  if (!name) return '';
  const ex = matchCat(name, words);
  if (ex) return ex;
  return name;
}

/**
 * Quality control audit function for vocabulary (Request #5)
 */
const SUF: Record<string, string[]> = {
  die: ['ung', 'heit', 'keit', 'schaft', 'tion', 'sion', 'tät', 'ur', 'ei'],
  das: ['chen', 'lein', 'ment'],
  der: ['ling', 'ismus']
};

export function auditWord(w: Word): string[] {
  const o: string[] = [];
  const noun = w.pos === 'اسم' || !!w.art;
  const ex = (w.ex || '').trim();

  if (noun) {
    if (!w.art) o.push('آرتیکل ندارد');
    else {
      const l = w.de.toLowerCase();
      for (const a in SUF) {
        if (a !== w.art && SUF[a].some(s => l.endsWith(s))) {
          o.push(`آرتیکل مشکوک: پایانهٔ این واژه معمولاً ${a} است`);
        }
      }
    }
    if (!w.pl) o.push('جمع ثبت نشده');
  }

  if (w.pos === 'فعل') {
    if (!w.conj) o.push('صرف حال ندارد');
    if (!w.perf) o.push('Perfekt ندارد');
  }

  if (!ex) {
    o.push('جملهٔ مثال ندارد');
  } else {
    if (ex.split(/\s+/).length < 3) o.push('مثال خیلی کوتاه است (طبیعی نیست)');
    const b = (w.sep && w.de.startsWith(w.sep) ? w.de.slice(w.sep.length) : w.de).toLowerCase().replace(/e?n$/, '');
    const s = b.slice(0, Math.max(3, b.length - 2));
    if (!ex.toLowerCase().includes(s) && !(w.pl && ex.toLowerCase().includes(w.pl.toLowerCase().slice(0, Math.max(3, w.pl.length - 1))))) {
      o.push('واژه در جملهٔ مثال دیده نمی‌شود');
    }
    if (!w.exFa) o.push('ترجمهٔ مثال ندارد');
    if (w.ex2 && w.ex2 === ex) o.push('دو مثال یکسان است');
  }

  if (!w.fa) {
    o.push('ترجمهٔ فارسی ندارد');
  } else {
    if (/[A-Za-z]/.test(w.fa)) o.push('ترجمه حروف لاتین دارد؛ بررسی شود');
    if (w.fa.split(/[،؛\/|]/).length > 2) o.push('چندمعنایی؟ برای هر معنی ورودی جدا بسازید');
  }

  if (w.ant && (w.ant.toLowerCase() === w.de.toLowerCase() || w.ant === w.syn)) {
    o.push('متضاد مشکوک/ساختگی؛ اگر واقعی نیست پاک کنید');
  }
  if ((w.ant && !w.antFa) || (w.syn && !w.synFa)) {
    o.push('ترجمهٔ مترادف/متضاد ناقص است');
  }
  if (w.cloze && !w.ans) {
    o.push('پاسخ جای‌خالی ندارد');
  }

  return o;
}
