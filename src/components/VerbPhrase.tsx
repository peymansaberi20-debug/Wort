import React from 'react';
import { VP, verbPrepOf } from '../data/verbPrep';

const CASE_LABEL: Record<string, string> = { A: 'A', D: 'D', G: 'G' };

/**
 * درخواست فاز ۴ — نمایش فعل با حرف اضافه و حالت دستوری در جای اصلی واژه:
 * sich entscheiden für (A) — sich و حرف اضافه/حالت یک شماره کوچکتر و غیرbold، خود فعل bold.
 */
export const VerbPhrase: React.FC<{ vp: VP; className?: string }> = ({ vp, className }) => {
  const raw = vp.verb.trim();
  const reflexive = /^sich\s+/i.test(raw);
  const base = reflexive ? raw.replace(/^sich\s+/i, '') : raw;
  return (
    <span dir="ltr" className={`inline-flex items-baseline gap-x-1 font-sans whitespace-nowrap ${className || ''}`}>
      {reflexive && (
        <span className="font-medium opacity-80" style={{ fontSize: '0.62em' }}>sich</span>
      )}
      <span className="font-extrabold">{base}</span>
      <span className="font-semibold opacity-75" style={{ fontSize: '0.62em' }}>
        {vp.prep ? `${vp.prep} (${CASE_LABEL[vp.kase] || vp.kase})` : `+${CASE_LABEL[vp.kase] || vp.kase}`}
      </span>
    </span>
  );
};

/** فعل+حرف اضافهٔ این واژه را می‌دهد؛ برای واژهٔ غیرفعل یا بی‌حرف اضافه = null */
export const verbPrepFor = (de: string): VP | null => verbPrepOf(de);

export default VerbPhrase;
