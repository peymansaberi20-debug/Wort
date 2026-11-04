import type { CaseQuestion, Word } from '../types';

/* ------------------------------------------------------------------ */
/*  Adjective declension (typed fill-in-the-blank exercise)             */
/* ------------------------------------------------------------------ */

export type GCase = 'nom' | 'akk' | 'dat' | 'gen';
export type Gender = 'm' | 'f' | 'n' | 'pl';
export type Decl = 'def' | 'indef' | 'none';

const CASES: GCase[] = ['nom', 'akk', 'dat', 'gen'];
const GENDERS: Gender[] = ['m', 'f', 'n', 'pl'];

const DEF_ART: Record<GCase, Record<Gender, string>> = {
  nom: { m: 'der', f: 'die', n: 'das', pl: 'die' },
  akk: { m: 'den', f: 'die', n: 'das', pl: 'die' },
  dat: { m: 'dem', f: 'der', n: 'dem', pl: 'den' },
  gen: { m: 'des', f: 'der', n: 'des', pl: 'der' }
};

// ein-words (singular: ein / eine ...; plural: possessive "meine" as the mixed-declension article)
const INDEF_ART: Record<GCase, Record<Gender, string>> = {
  nom: { m: 'ein', f: 'eine', n: 'ein', pl: 'meine' },
  akk: { m: 'einen', f: 'eine', n: 'ein', pl: 'meine' },
  dat: { m: 'einem', f: 'einer', n: 'einem', pl: 'meinen' },
  gen: { m: 'eines', f: 'einer', n: 'eines', pl: 'meiner' }
};

export const ADJ_ENDINGS: Record<Decl, Record<GCase, Record<Gender, string>>> = {
  def: {
    nom: { m: 'e', f: 'e', n: 'e', pl: 'en' },
    akk: { m: 'en', f: 'e', n: 'e', pl: 'en' },
    dat: { m: 'en', f: 'en', n: 'en', pl: 'en' },
    gen: { m: 'en', f: 'en', n: 'en', pl: 'en' }
  },
  indef: {
    nom: { m: 'er', f: 'e', n: 'es', pl: 'en' },
    akk: { m: 'en', f: 'e', n: 'es', pl: 'en' },
    dat: { m: 'en', f: 'en', n: 'en', pl: 'en' },
    gen: { m: 'en', f: 'en', n: 'en', pl: 'en' }
  },
  none: {
    nom: { m: 'er', f: 'e', n: 'es', pl: 'e' },
    akk: { m: 'en', f: 'e', n: 'es', pl: 'e' },
    dat: { m: 'em', f: 'er', n: 'em', pl: 'en' },
    gen: { m: 'en', f: 'er', n: 'en', pl: 'er' }
  }
};

interface Noun {
  de: string;
  g: 'm' | 'f' | 'n';
  gen: string; // genitive singular
  pl: string; // nominative / accusative / genitive plural
  datPl: string;
  kind: 'person' | 'thing';
}

const NOUNS: Noun[] = [
  { de: 'Mann', g: 'm', gen: 'Mannes', pl: 'Männer', datPl: 'Männern', kind: 'person' },
  { de: 'Lehrer', g: 'm', gen: 'Lehrers', pl: 'Lehrer', datPl: 'Lehrern', kind: 'person' },
  { de: 'Freund', g: 'm', gen: 'Freundes', pl: 'Freunde', datPl: 'Freunden', kind: 'person' },
  { de: 'Tisch', g: 'm', gen: 'Tisches', pl: 'Tische', datPl: 'Tischen', kind: 'thing' },
  { de: 'Garten', g: 'm', gen: 'Gartens', pl: 'Gärten', datPl: 'Gärten', kind: 'thing' },
  { de: 'Frau', g: 'f', gen: 'Frau', pl: 'Frauen', datPl: 'Frauen', kind: 'person' },
  { de: 'Lehrerin', g: 'f', gen: 'Lehrerin', pl: 'Lehrerinnen', datPl: 'Lehrerinnen', kind: 'person' },
  { de: 'Stadt', g: 'f', gen: 'Stadt', pl: 'Städte', datPl: 'Städten', kind: 'thing' },
  { de: 'Straße', g: 'f', gen: 'Straße', pl: 'Straßen', datPl: 'Straßen', kind: 'thing' },
  { de: 'Idee', g: 'f', gen: 'Idee', pl: 'Ideen', datPl: 'Ideen', kind: 'thing' },
  { de: 'Kind', g: 'n', gen: 'Kindes', pl: 'Kinder', datPl: 'Kindern', kind: 'person' },
  { de: 'Haus', g: 'n', gen: 'Hauses', pl: 'Häuser', datPl: 'Häusern', kind: 'thing' },
  { de: 'Buch', g: 'n', gen: 'Buches', pl: 'Bücher', datPl: 'Büchern', kind: 'thing' },
  { de: 'Auto', g: 'n', gen: 'Autos', pl: 'Autos', datPl: 'Autos', kind: 'thing' },
  { de: 'Zimmer', g: 'n', gen: 'Zimmers', pl: 'Zimmer', datPl: 'Zimmern', kind: 'thing' }
];

// Mass nouns: used for the singular without article ("kalter Kaffee", "frische Milch")
const MASS: Noun[] = [
  { de: 'Kaffee', g: 'm', gen: 'Kaffees', pl: '', datPl: '', kind: 'thing' },
  { de: 'Regen', g: 'm', gen: 'Regens', pl: '', datPl: '', kind: 'thing' },
  { de: 'Milch', g: 'f', gen: 'Milch', pl: '', datPl: '', kind: 'thing' },
  { de: 'Hitze', g: 'f', gen: 'Hitze', pl: '', datPl: '', kind: 'thing' },
  { de: 'Wasser', g: 'n', gen: 'Wassers', pl: '', datPl: '', kind: 'thing' },
  { de: 'Wetter', g: 'n', gen: 'Wetters', pl: '', datPl: '', kind: 'thing' },
  { de: 'Brot', g: 'n', gen: 'Brotes', pl: '', datPl: '', kind: 'thing' }
];

interface Frame {
  cas: GCase;
  kinds: ('person' | 'thing' | 'any')[];
  text: string; // {NP} = noun phrase, [sg|pl] = verb agreement
}

const FRAMES: Frame[] = [
  { cas: 'nom', kinds: ['any'], text: 'Dort [steht|stehen] {NP}.' },
  { cas: 'nom', kinds: ['any'], text: 'Hier [ist|sind] {NP}.' },
  { cas: 'nom', kinds: ['thing'], text: '{NP} [gefällt|gefallen] mir sehr.' },
  { cas: 'nom', kinds: ['person'], text: 'Gestern [kam|kamen] {NP} zu uns.' },
  { cas: 'akk', kinds: ['any'], text: 'Ich sehe {NP} dort.' },
  { cas: 'akk', kinds: ['thing'], text: 'Wir brauchen {NP}.' },
  { cas: 'akk', kinds: ['person'], text: 'Sie kennt {NP} schon lange.' },
  { cas: 'akk', kinds: ['any'], text: 'Das Geschenk ist für {NP}.' },
  { cas: 'akk', kinds: ['any'], text: 'Er geht ohne {NP} nach Hause.' },
  { cas: 'akk', kinds: ['thing'], text: 'Sie kauft {NP}.' },
  { cas: 'dat', kinds: ['person'], text: 'Ich helfe {NP}.' },
  { cas: 'dat', kinds: ['person'], text: 'Wir sprechen oft mit {NP}.' },
  { cas: 'dat', kinds: ['person'], text: 'Das Buch gehört {NP}.' },
  { cas: 'dat', kinds: ['person'], text: 'Er wohnt bei {NP}.' },
  { cas: 'dat', kinds: ['thing'], text: 'Nach {NP} gehen wir nach Hause.' },
  { cas: 'dat', kinds: ['any'], text: 'Sie spricht von {NP}.' },
  { cas: 'gen', kinds: ['person'], text: 'Das ist die Idee {NP}.' },
  { cas: 'gen', kinds: ['thing'], text: 'Wegen {NP} bleiben wir zu Hause.' },
  { cas: 'gen', kinds: ['thing'], text: 'Trotz {NP} gehen wir spazieren.' }
];

const INVARIABLE = new Set([
  'rosa', 'lila', 'prima', 'super', 'klasse', 'spitze', 'pleite', 'fit', 'egal', 'quitt', 'bereit', 'gern', 'sehr', 'viel',
  'wenig', 'mehr', 'genug', 'allein', 'fertig', 'schuld', 'leid', 'recht', 'online', 'offline', 'okay', 'ok'
]);

/** Can this word be inflected like an attributive adjective? */
export function isInflectableAdjective(base: string): boolean {
  const b = (base || '').trim().toLowerCase();
  return /^[a-zäöüß]{3,}$/.test(b) && !INVARIABLE.has(b);
}

/** Adds an adjective ending to the base form, handling the usual spelling changes. */
export function inflectAdjective(baseRaw: string, ending: string): string {
  const base = baseRaw.trim().toLowerCase();
  if (base === 'hoch') return 'hoh' + ending;
  if (/[aeiouäöü]er$/.test(base)) return base.slice(0, -2) + 'r' + ending; // teuer -> teure
  if (/el$/.test(base) && ending.startsWith('e')) return base.slice(0, -2) + 'l' + ending; // dunkel -> dunkle
  if (base.endsWith('e')) return base + ending.slice(ending.startsWith('e') ? 1 : 0); // leise -> leiser
  return base + ending;
}

export interface AdjSpec {
  decl: Decl;
  cas: GCase;
  g: Gender;
  noun: number; // index into nounPool
  frame: number; // index into FRAMES
}

const nounPool = (decl: Decl, g: Gender): Noun[] =>
  g === 'pl' ? NOUNS : (decl === 'none' ? MASS : NOUNS).filter(n => n.g === g);

const frameFits = (f: Frame, cas: GCase, n: Noun): boolean =>
  f.cas === cas && (f.kinds.includes('any') || f.kinds.includes(n.kind));

export const specToString = (s: AdjSpec): string => `${s.decl}.${s.cas}.${s.g}.${s.noun}.${s.frame}`;

export function parseSpec(str: string): AdjSpec | null {
  const m = String(str || '').split('.');
  if (m.length !== 5) return null;
  const [decl, cas, g, noun, frame] = m;
  if (!['def', 'indef', 'none'].includes(decl) || !CASES.includes(cas as GCase) || !GENDERS.includes(g as Gender)) return null;
  const spec = { decl: decl as Decl, cas: cas as GCase, g: g as Gender, noun: +noun, frame: +frame };
  const pool = nounPool(spec.decl, spec.g);
  if (!pool[spec.noun] || !FRAMES[spec.frame]) return null;
  return frameFits(FRAMES[spec.frame], spec.cas, pool[spec.noun]) ? spec : null;
}

/** Difficulty of a combination: 1 (easiest) .. 3 */
export function specLevel(decl: Decl, cas: GCase): number {
  if (decl === 'def') return cas === 'nom' || cas === 'akk' ? 1 : 2;
  if (decl === 'indef') return cas === 'nom' || cas === 'akk' ? 2 : 3;
  return 3;
}

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** Random exercise specification of the requested difficulty level (1-3). */
export function randomSpec(level: number): AdjSpec {
  for (let tries = 0; tries < 200; tries++) {
    const decl = pick<Decl>(['def', 'indef', 'none']);
    const cas = pick(CASES);
    if (specLevel(decl, cas) !== level) continue;
    const g = pick(GENDERS);
    // without article the genitive singular is only practised with mass nouns of any gender
    const pool = nounPool(decl, g);
    const nounIdx = Math.floor(Math.random() * pool.length);
    const frames = FRAMES.map((f, i) => ({ f, i })).filter(x => frameFits(x.f, cas, pool[nounIdx]));
    if (frames.length === 0) continue;
    return { decl, cas, g, noun: nounIdx, frame: pick(frames).i };
  }
  return { decl: 'def', cas: 'nom', g: 'm', noun: 0, frame: 0 };
}

const nounForm = (n: Noun, cas: GCase, g: Gender): string => {
  if (g === 'pl') return cas === 'dat' ? n.datPl : n.pl;
  return cas === 'gen' ? n.gen : n.de;
};

const DECL_LABEL: Record<Decl, string> = {
  def: 'بعد از آرتیکل معین (der/die/das)',
  indef: 'بعد از ein-/kein-/mein- (صرف مختلط)',
  none: 'بدون آرتیکل (صرف قوی)'
};
const CASE_LABEL: Record<GCase, string> = { nom: 'Nominativ', akk: 'Akkusativ', dat: 'Dativ', gen: 'Genitiv' };
const GENDER_LABEL: Record<Gender, string> = { m: 'مذکر (der)', f: 'مؤنث (die)', n: 'خنثی (das)', pl: 'جمع (die)' };
const RULE: Record<Decl, string> = {
  def: 'بعد از آرتیکل معین فقط دو پایانه داریم: «-e» (Nominativ هر سه جنس، Akkusativ مؤنث و خنثی) و «-en» (همهٔ حالت‌های دیگر).',
  indef:
    'بعد از ein-words مثل صرف معین است، ولی چون ein در Nominativ مذکر و Nominativ/Akkusativ خنثی پایانه ندارد، خودِ صفت پایانهٔ آرتیکل را می‌گیرد: «-er» و «-es».',
  none: 'بدون آرتیکل صفت خودش نقش آرتیکل را بازی می‌کند و پایانهٔ der/die/das/dem… را می‌گیرد؛ استثنا: Genitiv مذکر و خنثی «-en».'
};

export interface AdjItem {
  sentence: string; // with _____
  full: string; // completed sentence
  answer: string;
  base: string;
  determiner: string;
  noun: string;
  ending: string;
  level: number;
  caseLabel: string;
  explanation: string;
}

/** Builds the exercise for an adjective base form and a specification. Returns null if the spec is invalid. */
export function buildAdjItem(base: string, spec: AdjSpec): AdjItem | null {
  const pool = nounPool(spec.decl, spec.g);
  const noun = pool[spec.noun];
  const frame = FRAMES[spec.frame];
  if (!noun || !frame || !frameFits(frame, spec.cas, noun) || !isInflectableAdjective(base)) return null;

  const ending = ADJ_ENDINGS[spec.decl][spec.cas][spec.g];
  const answer = inflectAdjective(base, ending);
  const det = spec.decl === 'def' ? DEF_ART[spec.cas][spec.g] : spec.decl === 'indef' ? INDEF_ART[spec.cas][spec.g] : '';
  const nounText = nounForm(noun, spec.cas, spec.g);
  const plural = spec.g === 'pl';

  const build = (adj: string) => {
    const np = [det, adj, nounText].filter(Boolean).join(' ');
    let text = frame.text
      .replace(/\[([^|\]]+)\|([^\]]+)\]/g, (_, a, b) => (plural ? b : a))
      .replace('{NP}', np);
    return text.charAt(0).toUpperCase() + text.slice(1);
  };

  const level = specLevel(spec.decl, spec.cas);
  return {
    sentence: build('_____'),
    full: build(answer),
    answer,
    base: base.toLowerCase(),
    determiner: det,
    noun: nounText,
    ending,
    level,
    caseLabel: CASE_LABEL[spec.cas],
    explanation: `${DECL_LABEL[spec.decl]} • ${CASE_LABEL[spec.cas]} • ${GENDER_LABEL[spec.g]} ⇒ پایانهٔ «-${ending}». ${RULE[spec.decl]}`
  };
}

const splitList = (s: string): string[] =>
  (s || '').split(/[,;،؛/|]/).map(x => x.trim()).filter(Boolean);

export interface AdjSource {
  code: string; // 'b' = the word itself, 's<i>' = i-th synonym, 'a<i>' = i-th antonym
  base: string;
  fa: string;
}

/** The adjectives that can be used for a vocabulary entry: the word itself and its single-word synonyms/antonyms. */
export function adjSources(w: Word, isAdj: boolean): AdjSource[] {
  if (!isAdj) return [];
  const out: AdjSource[] = [];
  if (isInflectableAdjective(w.de)) out.push({ code: 'b', base: w.de.toLowerCase(), fa: w.fa });
  const add = (list: string, listFa: string, prefix: string) => {
    const items = splitList(list);
    const fas = splitList(listFa);
    items.forEach((it, i) => {
      if (/\s/.test(it) || !isInflectableAdjective(it)) return;
      out.push({ code: `${prefix}${i}`, base: it.toLowerCase(), fa: fas.length === items.length ? fas[i] : '' });
    });
  };
  add(w.syn, w.synFa, 's');
  add(w.ant, w.antFa, 'a');
  return out;
}

export function adjSourceByCode(w: Word, code: string): AdjSource | null {
  const all = adjSources(w, true);
  return all.find(s => s.code === code) || null;
}

/* ------------------------------------------------------------------ */
/*  Extra case / preposition questions (levels 2 and 3)                 */
/* ------------------------------------------------------------------ */

const q = (
  id: string,
  cs: number,
  s: string,
  prepAns: string,
  artAns: string,
  n: string,
  c: string,
  r: string,
  fa: string,
  ex: string
): CaseQuestion => ({ id, cs, s, prepAns, artAns, ans: `${prepAns} ${artAns}`, n, c, r, fa, ex, exFa: fa });

export const EXTRA_CASEQ: CaseQuestion[] = [
  // Level 2: verbs / prepositions with a fixed case
  q('x1', 2, 'Wir warten schon lange ___ ___ Bus.', 'auf', 'den', 'der Bus', 'Akkusativ (warten auf)', 'warten auf ← همیشه Akkusativ؛ der Bus ← den', 'ما مدت‌هاست منتظر اتوبوس هستیم.', 'Wir warten schon lange auf den Bus.'),
  q('x2', 2, 'Er interessiert sich ___ ___ Geschichte.', 'für', 'die', 'die Geschichte', 'Akkusativ (sich interessieren für)', 'sich interessieren für ← Akkusativ؛ die Geschichte ← die', 'او به تاریخ علاقه دارد.', 'Er interessiert sich für die Geschichte.'),
  q('x3', 2, 'Sie spricht ___ ___ Lehrerin.', 'mit', 'der', 'die Lehrerin', 'Dativ (mit)', 'mit ← همیشه Dativ؛ die Lehrerin ← der', 'او با معلم (خانم) صحبت می‌کند.', 'Sie spricht mit der Lehrerin.'),
  q('x4', 2, 'Ich komme gerade ___ ___ Arbeit.', 'von', 'der', 'die Arbeit', 'Dativ (von)', 'von ← همیشه Dativ؛ die Arbeit ← der', 'من همین الان از سر کار می‌آیم.', 'Ich komme gerade von der Arbeit.'),
  q('x5', 2, 'Nach der Party fahre ich ___ ___ Freund.', 'zu', 'dem', 'der Freund', 'Dativ (zu)', 'zu ← همیشه Dativ؛ der Freund ← dem', 'بعد از مهمانی پیش دوستم می‌روم.', 'Nach der Party fahre ich zu dem Freund.'),
  q('x6', 2, 'Ich denke oft ___ ___ Reise.', 'an', 'die', 'die Reise', 'Akkusativ (denken an)', 'denken an ← Akkusativ؛ die Reise ← die', 'من اغلب به سفر فکر می‌کنم.', 'Ich denke oft an die Reise.'),
  q('x7', 2, 'Ich freue mich ___ ___ Wochenende.', 'auf', 'das', 'das Wochenende', 'Akkusativ (sich freuen auf)', 'sich freuen auf ← Akkusativ (آینده)؛ das Wochenende ← das', 'من منتظر آخر هفته هستم و ذوق دارم.', 'Ich freue mich auf das Wochenende.'),
  q('x8', 2, 'Er ärgert sich ___ ___ Lärm.', 'über', 'den', 'der Lärm', 'Akkusativ (sich ärgern über)', 'sich ärgern über ← Akkusativ؛ der Lärm ← den', 'او از سر و صدا عصبانی می‌شود.', 'Er ärgert sich über den Lärm.'),
  q('x9', 2, 'Sie läuft jeden Morgen ___ ___ Park.', 'durch', 'den', 'der Park', 'Akkusativ (durch)', 'durch ← همیشه Akkusativ؛ der Park ← den', 'او هر صبح از میان پارک می‌دود.', 'Sie läuft jeden Morgen durch den Park.'),
  q('x10', 2, 'Er kommt ___ ___ Büro.', 'aus', 'dem', 'das Büro', 'Dativ (aus)', 'aus ← همیشه Dativ؛ das Büro ← dem', 'او از دفتر می‌آید.', 'Er kommt aus dem Büro.'),
  q('x11', 2, 'Wir gehen ___ ___ Bahnhof.', 'zu', 'dem', 'der Bahnhof', 'Dativ (zu)', 'zu ← همیشه Dativ؛ der Bahnhof ← dem (zum)', 'ما به ایستگاه قطار می‌رویم.', 'Wir gehen zu dem Bahnhof.'),
  q('x12', 2, 'Das Auto fährt ___ ___ Wand.', 'gegen', 'die', 'die Wand', 'Akkusativ (gegen)', 'gegen ← همیشه Akkusativ؛ die Wand ← die', 'ماشین به دیوار می‌خورد.', 'Das Auto fährt gegen die Wand.'),
  q('x13', 2, 'Der Brief ist ___ ___ Eltern.', 'für', 'die', 'die Eltern (جمع)', 'Akkusativ (für)', 'für ← همیشه Akkusativ؛ جمع در Akkusativ: die', 'این نامه برای والدین است.', 'Der Brief ist für die Eltern.'),
  q('x14', 2, 'Das Kind spielt ___ ___ Kindern.', 'mit', 'den', 'die Kinder (جمع)', 'Dativ (mit)', 'mit ← همیشه Dativ؛ جمع در Dativ: den (+ n در اسم)', 'بچه با بچه‌ها بازی می‌کند.', 'Das Kind spielt mit den Kindern.'),
  q('x15', 2, 'Wir sprechen ___ ___ Probleme.', 'über', 'die', 'die Probleme (جمع)', 'Akkusativ (sprechen über)', 'sprechen über ← Akkusativ؛ جمع در Akkusativ: die', 'ما دربارهٔ مشکلات صحبت می‌کنیم.', 'Wir sprechen über die Probleme.'),
  // Level 3: two-way prepositions (movement = Akkusativ, position = Dativ) and Genitiv
  q('x16', 3, 'Die Kinder gehen ___ ___ Schule.', 'in', 'die', 'die Schule', 'Akkusativ (in + حرکت: کجا؟ wohin)', 'in + حرکت به سمت مقصد (Wohin?) ← Akkusativ؛ die Schule ← die', 'بچه‌ها به مدرسه می‌روند.', 'Die Kinder gehen in die Schule.'),
  q('x17', 3, 'Die Kinder sind ___ ___ Schule.', 'in', 'der', 'die Schule', 'Dativ (in + مکان: کجا؟ wo)', 'in + مکان ثابت (Wo?) ← Dativ؛ die Schule ← der', 'بچه‌ها در مدرسه هستند.', 'Die Kinder sind in der Schule.'),
  q('x18', 3, 'Ich hänge das Bild ___ ___ Wand.', 'an', 'die', 'die Wand', 'Akkusativ (an + حرکت)', 'hängen (متعدی: آویزان کردن) = حرکت ← Akkusativ؛ die Wand ← die', 'من عکس را به دیوار آویزان می‌کنم.', 'Ich hänge das Bild an die Wand.'),
  q('x19', 3, 'Das Bild hängt ___ ___ Wand.', 'an', 'der', 'die Wand', 'Dativ (an + مکان)', 'hängen (لازم: آویزان بودن) = مکان ← Dativ؛ die Wand ← der', 'عکس به دیوار آویزان است.', 'Das Bild hängt an der Wand.'),
  q('x20', 3, 'Er legt das Buch ___ ___ Tisch.', 'auf', 'den', 'der Tisch', 'Akkusativ (auf + حرکت)', 'legen = حرکت دادن (Wohin?) ← Akkusativ؛ der Tisch ← den', 'او کتاب را روی میز می‌گذارد.', 'Er legt das Buch auf den Tisch.'),
  q('x21', 3, 'Das Buch liegt ___ ___ Tisch.', 'auf', 'dem', 'der Tisch', 'Dativ (auf + مکان)', 'liegen = مکان (Wo?) ← Dativ؛ der Tisch ← dem', 'کتاب روی میز است.', 'Das Buch liegt auf dem Tisch.'),
  q('x22', 3, 'Wir fahren ___ ___ Urlaub.', 'in', 'den', 'der Urlaub', 'Akkusativ (in + حرکت)', 'fahren in ← مقصد (Wohin?) ← Akkusativ؛ der Urlaub ← den', 'ما به تعطیلات می‌رویم.', 'Wir fahren in den Urlaub.'),
  q('x23', 3, 'Sie stellt die Lampe ___ ___ Schrank.', 'neben', 'den', 'der Schrank', 'Akkusativ (neben + حرکت)', 'stellen = حرکت دادن (Wohin?) ← Akkusativ؛ der Schrank ← den', 'او لامپ را کنار کمد می‌گذارد.', 'Sie stellt die Lampe neben den Schrank.'),
  q('x24', 3, 'Die Lampe steht ___ ___ Schrank.', 'neben', 'dem', 'der Schrank', 'Dativ (neben + مکان)', 'stehen = مکان (Wo?) ← Dativ؛ der Schrank ← dem', 'لامپ کنار کمد ایستاده است.', 'Die Lampe steht neben dem Schrank.'),
  q('x25', 3, 'Das Flugzeug fliegt ___ ___ Stadt.', 'über', 'die', 'die Stadt', 'Akkusativ (über + حرکت)', 'fliegen über = عبور و حرکت ← Akkusativ؛ die Stadt ← die', 'هواپیما از روی شهر پرواز می‌کند.', 'Das Flugzeug fliegt über die Stadt.'),
  q('x26', 3, 'Die Lampe hängt ___ ___ Tisch.', 'über', 'dem', 'der Tisch', 'Dativ (über + مکان)', 'hängen (لازم) = مکان (Wo?) ← Dativ؛ der Tisch ← dem', 'لامپ بالای میز آویزان است.', 'Die Lampe hängt über dem Tisch.'),
  q('x27', 3, 'Der Fisch schwimmt ___ ___ Wasser.', 'in', 'dem', 'das Wasser', 'Dativ (in + مکان)', 'schwimmen in ← مکان فعالیت (Wo?) ← Dativ؛ das Wasser ← dem', 'ماهی در آب شنا می‌کند.', 'Der Fisch schwimmt in dem Wasser.'),
  q('x28', 3, 'Der Hund springt ___ ___ Wasser.', 'in', 'das', 'das Wasser', 'Akkusativ (in + حرکت)', 'springen in ← مقصد (Wohin?) ← Akkusativ؛ das Wasser ← das', 'سگ توی آب می‌پرد.', 'Der Hund springt in das Wasser.'),
  q('x29', 3, 'Heute bleiben wir ___ ___ Regens zu Hause.', 'wegen', 'des', 'der Regen', 'Genitiv (wegen)', 'wegen ← Genitiv؛ der Regen ← des Regens (مذکر: -s)', 'امروز به خاطر باران در خانه می‌مانیم.', 'Heute bleiben wir wegen des Regens zu Hause.'),
  q('x30', 3, 'Sie fährt ___ ___ schlechten Wetters mit dem Auto.', 'trotz', 'des', 'das Wetter', 'Genitiv (trotz)', 'trotz ← Genitiv؛ das Wetter ← des Wetters (خنثی: -s)', 'او با وجود هوای بد با ماشین می‌رود.', 'Sie fährt trotz des schlechten Wetters mit dem Auto.'),
  q('x31', 3, 'Er arbeitet ___ ___ Ferien nicht.', 'während', 'der', 'die Ferien (جمع)', 'Genitiv (während)', 'während ← Genitiv؛ جمع در Genitiv: der', 'او در طول تعطیلات کار نمی‌کند.', 'Er arbeitet während der Ferien nicht.'),
  q('x32', 3, 'Ich nehme den Bus ___ ___ Autos.', 'statt', 'des', 'das Auto', 'Genitiv (statt)', 'statt ← Genitiv؛ das Auto ← des Autos (خنثی: -s)', 'من به جای ماشین اتوبوس می‌گیرم.', 'Ich nehme den Bus statt des Autos.'),
  q('x33', 3, 'Wir gehen ___ ___ Kino.', 'in', 'das', 'das Kino', 'Akkusativ (in + حرکت)', 'gehen in ← مقصد (Wohin?) ← Akkusativ؛ das Kino ← das', 'ما به سینما می‌رویم.', 'Wir gehen in das Kino.'),
  q('x34', 3, 'Der Film läuft ___ ___ Kino.', 'in', 'dem', 'das Kino', 'Dativ (in + مکان)', 'laufen in ← مکان (Wo?) ← Dativ؛ das Kino ← dem', 'فیلم در سینما نمایش داده می‌شود.', 'Der Film läuft in dem Kino.')
];


/* ------------------------------------------------------------------ */
/*  Typed-answer mistake analysis                                       */
/* ------------------------------------------------------------------ */

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
  const ustarts: number[] = []; // start index (in the user's text) for every segment
  let pos = 0;
  let upos = 0;
  ops.forEach(op => {
    const isEq = op.t === 'eq';
    const last = segments[segments.length - 1];
    if (last && (last.kind === 'eq') === isEq) {
      last.exp += op.e || '';
      last.usr += op.u || '';
    } else {
      segments.push({ kind: isEq ? 'eq' : 'chg', exp: op.e || '', usr: op.u || '' });
      starts.push(pos);
      ustarts.push(upos);
    }
    if (op.e) pos += 1;
    if (op.u) upos += 1;
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

    const e = seg.exp;
    const u = seg.usr;
    let where = '';
    if (e && !u) {
      where = start >= expected.length
        ? ' (در انتهای پاسخ)'
        : start === 0
          ? ' (در ابتدای پاسخ)'
          : ` (بعد از «${expected.slice(Math.max(0, start - 2), start)}»)`;
    } else if (!e && u) {
      where = ` (حرف ${ustarts[idx] + 1} نوشتهٔ شما)`;
    } else {
      where = expTokens.length > 1 ? ` (در «${tokenAt(start)}»)` : ` (حرف ${start + 1})`;
    }

    if (!e && u) {
      notes.push(`«${showChars(u)}» اضافه نوشته‌اید${where}.`);
    } else if (e && !u) {
      notes.push(`«${showChars(e)}» جا افتاده است${where}.`);
    } else if (e.length === 2 && same(e, [...u].reverse().join('')) && !same(e[0], e[1])) {
      notes.push(`جای دو حرف «${e}» عوض شده است؛ شما «${u}» نوشته‌اید${where}.`);
    } else if (e.length === 1 && UMLAUT_BASE[e] && same(u, UMLAUT_BASE[e])) {
      notes.push(`حرف «${e}» اومْلاوت (دو نقطه) دارد؛ شما «${u}» نوشته‌اید${where}.`);
    } else if (e === 'ß' && u.toLowerCase() === 's') {
      notes.push(`در این واژه حرف «ß» لازم است، ولی «s» نوشته‌اید${where}.`);
    } else if (e.toLowerCase() === 'ß' || (e.toLowerCase() === 'ss' && u.toLowerCase() === 'ß')) {
      notes.push(`به‌جای «${e}» نوشته‌اید «${u}»؛ ß و ss در املای این واژه یکسان نیستند${where}.`);
    } else {
      notes.push(`به‌جای «${showChars(e)}» نوشته‌اید «${showChars(u)}»${where}.`);
    }
  });

  if (notes.length === 0) {
    notes.push('نوشتهٔ شما با شکل درست تفاوت دارد؛ دو شکل را مقایسه کنید.');
  }

  // no duplicated bullet points
  const uniqueNotes = notes.filter((n, i) => notes.indexOf(n) === i);
  return { user, expected, segments, notes: uniqueNotes, tooDifferent: false };
}
