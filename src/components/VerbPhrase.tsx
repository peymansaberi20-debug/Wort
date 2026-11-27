import React from 'react';
import { VP, verbPrepOf, bareCaseVerb } from '../data/verbPrep';

/** رنگ حالت دستوری (کلاس‌ها در index.css): اکوزاتیو نارنجی، داتیو سبز پررنگ، گنتیو آبی بین فیروزه‌ای و آسمانی */
const CASE_CLASS: Record<string, string> = { A: 'vp-case-a', D: 'vp-case-d', G: 'vp-case-g' };

/** پسوند حالت دستوری: +A / +D / +A/D / +G — کوچکتر از فعل، حروف رنگی با زیرخط هم‌رنگ */
const CaseSuffix: React.FC<{ kase: string }> = ({ kase }) => (
  <span className="font-bold" style={{ fontSize: '0.55em' }}>
    +{String(kase)
      .split('')
      .map((ch, i) => {
        const cls = CASE_CLASS[ch.toUpperCase()];
        return cls ? (
          <span key={i} className={cls}>{ch}</span>
        ) : (
          <span key={i}>{ch}</span>
        );
      })}
  </span>
);

/**
 * درخواست فاز ۴ — نمایش فعل با حرف اضافه و حالت دستوری در جای اصلی واژه:
 * sich entscheiden für +A — sich و حرف اضافه/حالت یک شماره کوچکتر و غیرbold، خود فعل bold.
 * درخواست کاربر: حالت دستوری همیشه در انتها به شکل +A/+D/+A/D/+G می‌آید — اکوزاتیو زیرخط نارنجی،
 * داتیو سبز پررنگ، گنتیو آبی فیروزه‌ای-آسمانی (فلش‌کارت و صرف هم همین نمایش را استفاده می‌کنند).
 */
export const VerbPhrase: React.FC<{ vp: VP; className?: string }> = ({ vp, className }) => {
  const raw = vp.verb.trim();
  const reflexive = /^sich\s+/i.test(raw);
  const base = reflexive ? raw.replace(/^sich\s+/i, '') : raw;
  return (
    <span dir="ltr" className={`inline-flex items-baseline gap-x-1 font-sans whitespace-nowrap ${className || ''}`}>
      {reflexive && (
        <span className="font-medium opacity-80" style={{ fontSize: '0.55em' }}>sich</span>
      )}
      <span className="font-extrabold">{base}</span>
      {vp.prep && (
        <span className="font-semibold opacity-75" style={{ fontSize: '0.55em' }}>{vp.prep}</span>
      )}
      {vp.kase && <CaseSuffix kase={String(vp.kase)} />}
    </span>
  );
};

/**
 * فعل+حرف اضافهٔ این واژه را می‌دهد؛ برای واژهٔ غیرفعل یا بی‌حرف اضافه = null.
 * درخواست کاربر: فعلی که حرف اضافه ندارد ولی حالت مشخصی می‌گیرد (essen +A، helfen +D) هم
 * یک VP با prep خالی و kase مشخص می‌دهد تا پسوند حالت در نمایش/فلش‌کارت دیده شود.
 */
export const verbPrepFor = (de: string): VP | null => {
  const hit = verbPrepOf(de);
  if (hit) return hit;
  // فعل بدون حرف اضافه که در فهرست متعدی/داتیو رایج هست
  const t = (de || '').trim();
  if (!t) return null;
  const base = t.replace(/^sich\s+/i, '').trim().toLowerCase();
  if (!base) return null;
  const k = bareCaseVerb(base);
  if (!k) return null;
  return { id: `${base}|`, verb: t, prep: '', kase: k, fa: '', ex: '' };
};

export default VerbPhrase;
