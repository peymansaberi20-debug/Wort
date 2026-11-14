import React from 'react';

const PRON = new Set(['ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'er/sie/es', 'sie/er/es']);

/** Splits a Präteritum form into unchanged and changed parts (irregular/strong verbs only). */
export const pratParts = (inf: string, prat: string): { text: string; changed: boolean }[] => {
  const raw = (prat || '').trim();
  if (!raw) return [];
  const toks = raw.split(/\s+/);
  while (toks.length > 1 && PRON.has(toks[0].toLowerCase())) toks.shift();
  const finite = toks[0];
  const tail = toks.slice(1).join(' ');
  let base = (inf || '').trim().replace(/^sich\s+/i, '');
  const particle = toks.length > 1 ? toks[toks.length - 1] : '';
  if (particle && base.toLowerCase().startsWith(particle.toLowerCase())) base = base.slice(particle.length);
  const stem = /en$/i.test(base) ? base.slice(0, -2) : /n$/i.test(base) ? base.slice(0, -1) : base;
  const lf = finite.toLowerCase();
  const ls = stem.toLowerCase();
  if (!stem || lf === ls + 'te' || lf === ls + 'ete') return [{ text: toks.join(' '), changed: false }]; // regular verb
  let k = 0;
  while (k < ls.length && k < lf.length && ls[k] === lf[k]) k++;
  if (k >= lf.length) return [{ text: toks.join(' '), changed: false }];
  const parts: { text: string; changed: boolean }[] = [];
  if (k > 0) parts.push({ text: finite.slice(0, k), changed: false });
  parts.push({ text: finite.slice(k), changed: true });
  if (tail) parts.push({ text: ' ' + tail, changed: false });
  return parts;
};

/** Präteritum form; the changed part of an irregular verb is shown in red. */
export const PratText: React.FC<{ inf: string; prat: string }> = ({ inf, prat }) => (
  <span dir="ltr" className="font-sans">
    {pratParts(inf, prat).map((p, i) => p.changed
      ? <span key={i} className="text-red-600 dark:text-red-400 font-extrabold">{p.text}</span>
      : <span key={i}>{p.text}</span>)}
  </span>
);
