import React from 'react';
import { segmentConjugation, SegKind } from '../utils/conjugation';

interface ConjugatedFormProps {
  /** Infinitive of the verb (word.de) */
  verb: string;
  /** One conjugated form, e.g. "fährst" or "rufe an" */
  form: string;
  /** 0 = ich, 1 = du, 2 = er/sie/es, 3 = wir, 4 = ihr, 5 = sie/Sie */
  pronounIndex: number;
  /** Separable prefix (word.sep), optional */
  sep?: string;
}

// Colour is never the only signal: changes are also underlined, endings are bold.
const SEG_CLASS: Record<SegKind, string> = {
  stem: 'text-slate-900 dark:text-slate-100',
  change:
    'text-red-700 dark:text-red-400 font-extrabold underline decoration-red-500 decoration-2 underline-offset-2',
  ending: 'text-blue-700 dark:text-blue-400 font-extrabold',
  extra: 'text-slate-600 dark:text-slate-300 font-normal'
};

export const ConjugatedForm: React.FC<ConjugatedFormProps> = ({ verb, form, pronounIndex, sep }) => {
  const segments = segmentConjugation(verb, form, pronounIndex, sep);
  if (segments.length === 0) return null;

  return (
    <span className="font-semibold font-sans whitespace-pre-wrap" dir="ltr">
      {segments.map((seg, i) => (
        <span key={i} className={SEG_CLASS[seg.kind]}>
          {seg.text}
        </span>
      ))}
    </span>
  );
};

/** Small legend explaining the colours (used under conjugation tables). */
export const ConjugationLegend: React.FC = () => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#5d6676] dark:text-[#a3adbd] pt-2" dir="rtl">
    <span>
      <b className="text-blue-700 dark:text-blue-400 font-extrabold" dir="ltr">st</b>
      {' '}آبی: پایانهٔ منظم
    </span>
    <span>
      <b className="text-red-700 dark:text-red-400 font-extrabold underline decoration-red-500 decoration-2 underline-offset-2" dir="ltr">ä / e / ß</b>
      {' '}قرمز (زیرخط‌دار): تغییر ریشه، «e» واسط (du leistest / er arbeitet) یا صوت اشتراکی با پایانهٔ کوتاه du (du heißt)
    </span>
  </div>
);
