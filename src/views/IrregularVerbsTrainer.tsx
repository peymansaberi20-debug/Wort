/**
 * IrregularVerbsTrainer.tsx — بازی «فعل‌های بی‌قاعده در سه زمان» (تب گرامر → فعل و زمان‌ها)
 *
 * ▌منطق تمرین (درخواست کاربر):
 *   - اول مثل بقیهٔ تمرین‌ها سطح انتخاب می‌شود (A1 تا C2)
 *   - بعد همهٔ فعل‌های بی‌قاعدهٔ آن سطح — چه Präteritum بی‌قاعده داشته باشد چه Partizip II چه هر دو —
 *     دونه‌دونه در قالب یک بازی دوتایی تمرین و تکرار می‌شوند
 *   - هر فعل دو قدم دارد: ۱) نوشتن شکل Präteritum (er/sie/es)  ۲) نوشتن Perfekt با فعل کمکی (ist/hat + Partizip II)
 *   - بعد از هر پاسخ، زنجیرهٔ سه زمان نمایش داده می‌شود و «بخشی که تغییر کرده» قرمز است
 *     (قسمت‌های ثابتِ مشترک با مصدر، عادی می‌مانند — منطق مقایسه در src/utils/irrDiff.ts)
 *   - امتیاز، زنجیرهٔ برد (streak)، برگهٔ مرور کل سطح و تکرار فقط اشتباه‌ها
 */

import React, { useCallback, useMemo, useState } from 'react';
import { AppSettings, Word } from '../types';
import { speak } from '../utils/audio';
import { IrrVerb, IrrLvl, IRR_LVL_ORDER, IRR_LVL_INFO, irrVerbsOf } from '../data/irregularVerbs';
import { markForm, eqDe, normDe } from '../utils/irrDiff';
import { libIrregularVerbs } from '../utils/irrLibrary';
import { MiniChip, toFa } from '../components/trainerUI';

/* ───────────────────────── قطعهٔ قرمزشده ───────────────────────── */

const CHANGED_CLS = 'text-red-600 dark:text-red-400 font-black underline decoration-red-500/60 decoration-2 underline-offset-4';

/** یک شکل فعل با قرمز کردن بخش تغییر یافته نسبت به مصدر */
const MarkedForm: React.FC<{
  form: string;
  verb: IrrVerb;
  kind: 'prt' | 'pp';
  size?: 'sm' | 'lg';
}> = ({ form, verb, kind, size }) => {
  const segs = markForm(form, {
    inf: verb.inf,
    kind,
    sep: verb.sep,
    override: kind === 'prt' ? verb.hPrat : verb.hPp,
  });
  return (
    <span dir="ltr" className={`inline-block font-sans font-bold tracking-wide ${size === 'lg' ? 'text-2xl md:text-3xl' : 'text-base'}`}>
      {segs.map((s, i) =>
        s.changed ? (
          <span key={i} className={CHANGED_CLS}>{s.text}</span>
        ) : (
          <span key={i}>{s.text}</span>
        )
      )}
    </span>
  );
};

/** شکل کامل Perfekt: فعل کمکی (همیشه قرمز — باید همراه فعل حفظ شود) + Partizip II */
const PerfektForm: React.FC<{ verb: IrrVerb; size?: 'sm' | 'lg' }> = ({ verb, size }) => (
  <span dir="ltr" className={`inline-flex items-baseline gap-x-1.5 font-sans font-bold ${size === 'lg' ? 'text-2xl md:text-3xl' : 'text-base'}`}>
    <span className="text-red-600 dark:text-red-400 font-black underline decoration-red-500/60 decoration-2 underline-offset-4">
      {verb.aux === 'sein' ? 'ist' : 'hat'}
    </span>
    <MarkedForm form={verb.pp} verb={verb} kind="pp" size={size} />
  </span>
);

/* ───────────────────────── تشخیص اینکه کدام بخش بی‌قاعده است ───────────────────────── */

const irrParts = (v: IrrVerb): { prt: boolean; pp: boolean } => {
  const prtRed = markForm(v.prt, { inf: v.inf, kind: 'prt', sep: v.sep, override: v.hPrat }).some(s => s.changed);
  const ppRed = markForm(v.pp, { inf: v.inf, kind: 'pp', sep: v.sep, override: v.hPp }).some(s => s.changed);
  // پایان قوی -en در Partizip II هم بخشی از بی‌قاعدگی است (مثل gebacken/gekommen)
  return { prt: prtRed, pp: ppRed || v.pp.endsWith('en') };
};

const irrChipLabel = (v: IrrVerb): string => {
  const p = irrParts(v);
  if (p.prt && p.pp) return 'هر دو بی‌قاعده';
  if (p.prt) return 'فقط Präteritum';
  return 'فقط Perfekt';
};

/* ───────────────────────── بررسی پاسخ ───────────────────────── */

const checkPrt = (given: string, v: IrrVerb): boolean =>
  [v.prt, ...(v.altPrt || [])].some(p => eqDe(given, p));

const checkPerfekt = (given: string, v: IrrVerb): { ok: boolean; auxIssue: boolean } => {
  const exp = `${v.aux === 'sein' ? 'ist' : 'hat'} ${v.pp}`;
  if (eqDe(given, exp)) return { ok: true, auxIssue: false };
  // Partizip II درست ولی فعل کمکی جا افتاده یا غلط («hat geschmolzen» برای فعل sein)
  const tight = (s: string): string => normDe(s).replace(/\s+/g, '');
  const g = tight(given);
  const ppOk = [v.pp, ...(v.altPp || [])].some(p => g === tight(p) || g.endsWith(tight(p)));
  if (ppOk) return { ok: false, auxIssue: true };
  return { ok: false, auxIssue: false };
};

const speakChain = (v: IrrVerb): void => {
  try {
    speak(`${v.inf}, ${v.prt}, ${v.aux === 'sein' ? 'ist' : 'hat'} ${v.pp}`).catch(() => { /* بی‌صدا */ });
  } catch { /* پشتیبانی نشد */ }
};

/* ───────────────────────── خود کامپوننت ───────────────────────── */

interface IrregularVerbsTrainerProps {
  settings?: AppSettings;
  /** کتاب واژگان کاربر — فعل‌های بی‌قاعده‌اش خودکار به بازی اضافه می‌شوند (به‌صورت زنده) */
  words?: Word[];
  onShowToast?: (msg: string) => void;
  onClose?: () => void;
}

type Phase = 'setup' | 'play' | 'result' | 'table';

const shuffle = <T,>(arr: T[]): T[] => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const IrregularVerbsTrainer: React.FC<IrregularVerbsTrainerProps> = ({ words, onShowToast }) => {
  const [phase, setPhase] = useState<Phase>('setup');
  const [lvl, setLvl] = useState<IrrLvl>('A1');
  const [useLib, setUseLib] = useState(true);
  const [queue, setQueue] = useState<IrrVerb[]>([]);
  const [qi, setQi] = useState(0);
  const [step, setStep] = useState<'prt' | 'pp'>('prt');
  const [input, setInput] = useState('');
  const [verdict, setVerdict] = useState<{ ok: boolean; note?: string } | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [mistakes, setMistakes] = useState<string[]>([]);

  // فعل‌های بی‌قاعدهٔ کتاب واژگان — از prop زنده؛ هر فعل جدید خودکار وارد می‌شود
  const libVerbs = useMemo(() => libIrregularVerbs(words), [words]);
  const bankVerbs = useMemo(() => irrVerbsOf(lvl), [lvl]);
  const libForLevel = useMemo(
    () => (useLib ? libVerbs.filter(v => v.lvl === lvl) : []),
    [libVerbs, useLib, lvl]
  );
  /** بانک + واژگان کاربر (هم‌پوشانی‌ها در irrLibrary حذف شده‌اند) */
  const levelVerbs = useMemo(() => [...bankVerbs, ...libForLevel], [bankVerbs, libForLevel]);
  const current = queue[qi] as IrrVerb | undefined;
  const mistakesVerbs = useMemo(
    () => mistakes.map(inf => queue.find(v => v.inf === inf)).filter((v): v is IrrVerb => !!v),
    [mistakes, queue]
  );

  const start = useCallback((verbs: IrrVerb[]): void => {
    if (!verbs.length) return;
    setQueue(shuffle(verbs));
    setQi(0);
    setStep('prt');
    setInput('');
    setVerdict(null);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setMistakes([]);
    setPhase('play');
  }, []);

  /** رفتن به قدم بعد یا فعل بعد — بعد از نشان دادن نتیجه */
  const advance = useCallback((): void => {
    if (step === 'prt') {
      setStep('pp');
      setInput('');
      setVerdict(null);
    } else {
      if (qi + 1 >= queue.length) {
        setPhase('result');
        if (onShowToast && mistakes.length === 0) onShowToast('🎉 بی‌نقص! هیچ اشتباهی نداشتی');
      } else {
        setQi(qi + 1);
        setStep('prt');
        setInput('');
        setVerdict(null);
      }
    }
  }, [step, qi, queue.length, mistakes.length, onShowToast]);

  /** ثبت نتیجهٔ یک قدم */
  const settle = useCallback((ok: boolean, note?: string): void => {
    if (ok) {
      setScore(s => s + 1);
      setStreak(s => {
        const n = s + 1;
        setBestStreak(b => Math.max(b, n));
        return n;
      });
    } else {
      setStreak(0);
      if (current && !mistakes.includes(current.inf)) setMistakes(m => [...m, current.inf]);
    }
    setVerdict({ ok, note });
  }, [current, mistakes]);

  const check = useCallback((): void => {
    if (!current || verdict || !input.trim()) return;
    if (step === 'prt') {
      settle(checkPrt(input, current));
    } else {
      const r = checkPerfekt(input, current);
      settle(r.ok, r.auxIssue ? 'aux' : undefined);
    }
  }, [current, verdict, input, step, settle]);

  const reveal = useCallback((): void => {
    if (!current || verdict) return;
    settle(false, 'shown');
  }, [current, verdict, settle]);

  /* ── صفحهٔ انتخاب سطح ── */
  if (phase === 'setup') {
    return (
      <div className="space-y-4">
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 space-y-2.5">
          <p className="text-[13px] font-bold text-slate-900 dark:text-slate-100 leading-6">
            🎢 زنجیرهٔ سه زمان را کامل کن: مصدر ← Präteritum ← Perfekt
          </p>
          <p className="text-[12px] text-[#5d6676] dark:text-[#a3adbd] leading-6">
            هر فعل دو قدم دارد: اول شکل <b>Präteritum</b> (er/sie/es) را می‌نویسی، بعد <b>Perfekt</b> با فعل کمکی
            (<span dir="ltr" className="font-sans font-bold">ist / hat</span> + Partizip II). بعد از هر پاسخ، کل زنجیره
            نشان داده می‌شود و <span className="text-red-600 dark:text-red-400 font-bold">قسمت‌هایی که تغییر کرده‌اند قرمز</span> هستند.
          </p>
        </div>

        <div className="grid grid-cols-6 gap-1.5" dir="ltr">
          {IRR_LVL_ORDER.map(l => (
            <button
              key={l}
              onClick={() => setLvl(l)}
              className={`py-2.5 rounded-xl text-xs font-bold border transition ${
                lvl === l
                  ? 'bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white border-transparent shadow'
                  : 'bg-slate-50 dark:bg-[#141923] border-[#dde1ea] dark:border-[#333b4a] text-[#1f2a3d] dark:text-[#e7ecf5]'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-[#5d6676] dark:text-[#8b95a7] -mt-2 leading-5">{IRR_LVL_INFO[lvl].label}</p>

        <div className="flex items-center justify-between gap-2 bg-slate-50 dark:bg-[#141923] rounded-xl px-3.5 py-2.5 border border-[#dde1ea] dark:border-[#333b4a]">
          <span className="text-[12px] font-bold text-[#1f2a3d] dark:text-[#e7ecf5]">
            🎯 {toFa(levelVerbs.length)} فعل بی‌قاعده در سطح {lvl}
            {useLib && libForLevel.length > 0 && (
              <span className="text-[11px] font-bold text-[#5d6676] dark:text-[#a3adbd]">
                {' '}(بانک: {toFa(bankVerbs.length)} + واژگان تو: {toFa(libForLevel.length)})
              </span>
            )}
          </span>
          <button
            onClick={() => setPhase('table')}
            className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-[#5d6676] dark:text-[#a3adbd]"
          >
            🗂 جدول مرور
          </button>
        </div>

        {libVerbs.length > 0 && (
          <button
            onClick={() => setUseLib(x => !x)}
            className="w-full flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 border transition bg-white dark:bg-[#1b2029] border-[#dde1ea] dark:border-[#333b4a]"
          >
            <span className="text-[12px] font-bold text-[#1f2a3d] dark:text-[#e7ecf5] text-right">
              📖 فعل‌های بی‌قاعدهٔ کتاب واژگان خودت
              <span className="block text-[10.5px] font-bold text-[#5d6676] dark:text-[#a3adbd] leading-4 mt-0.5">
                {toFa(libVerbs.length)} فعل از واژگان تو شناسایی شده — فعل جدیدی هم که اضافه کنی خودکار می‌آید
              </span>
            </span>
            <span className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold flex-shrink-0 ${useLib ? 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400' : 'bg-slate-100 dark:bg-slate-800 text-[#5d6676] dark:text-[#a3adbd]'}`}>
              {useLib ? '✓ اضافه می‌شوند' : 'خاموش'}
            </span>
          </button>
        )}

        <button
          onClick={() => start(levelVerbs)}
          disabled={!levelVerbs.length}
          className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white text-sm font-extrabold shadow disabled:opacity-50"
        >
          🎮 شروع بازی ({toFa(levelVerbs.length * 2)} امتیاز)
        </button>
      </div>
    );
  }

  /* ── برگهٔ مرور کل سطح ── */
  if (phase === 'table') {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => setPhase('setup')} className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">→ انتخاب سطح</button>
          <b className="text-xs text-[#5d6676] dark:text-[#a3adbd]">🗂 فعل‌های بی‌قاعدهٔ سطح {lvl} — {toFa(levelVerbs.length)} فعل</b>
        </div>
        <p className="text-[11px] text-[#5d6676] dark:text-[#8b95a7] leading-5">
          <span className="text-red-600 dark:text-red-400 font-bold">قرمز</span> = بخشی که نسبت به مصدر تغییر می‌کند •
          فعل کمکی <span dir="ltr" className="font-sans font-bold text-red-600 dark:text-red-400">ist / hat</span> هم باید همراه فعل حفظ شود •
          <span className="text-[#1f5fbf] font-bold">📖</span> = از کتاب واژگان تو.
        </p>
        <div className="overflow-x-auto bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl">
          <table className="w-full text-[13px]" dir="ltr">
            <thead>
              <tr className="text-[11px] text-[#5d6676] dark:text-[#a3adbd] border-b border-[#dde1ea] dark:border-[#333b4a]">
                <th className="px-2.5 py-2 text-left font-bold">Infinitiv</th>
                <th className="px-2.5 py-2 text-left font-bold">Präteritum</th>
                <th className="px-2.5 py-2 text-left font-bold">Perfekt</th>
                <th className="px-2.5 py-2 text-right font-bold" dir="rtl">معنی</th>
                <th className="px-1 py-2" />
              </tr>
            </thead>
            <tbody>
              {levelVerbs.map(v => (
                <tr key={v.inf} className="border-b border-[#eef0f5] dark:border-[#232a37] last:border-0">
                  <td className="px-2.5 py-1.5 font-sans font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                    {v.inf}
                    {v.src === 'lib' && <span className="mr-1 text-[9px] font-extrabold text-[#1f5fbf]">📖</span>}
                  </td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap"><MarkedForm form={v.prt} verb={v} kind="prt" /></td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap"><PerfektForm verb={v} /></td>
                  <td className="px-2.5 py-1.5 text-right text-[11px] text-[#5d6676] dark:text-[#a3adbd]" dir="rtl">{v.fa}</td>
                  <td className="px-1 py-1.5">
                    <button onClick={() => speakChain(v)} title="خواندن سه زمان" className="text-sm opacity-70 hover:opacity-100">🔊</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          onClick={() => start(levelVerbs)}
          className="w-full py-2.5 rounded-2xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white text-sm font-extrabold shadow"
        >
          🎮 با همین سطح بازی کن
        </button>
      </div>
    );
  }

  /* ── صفحهٔ نتیجه ── */
  if (phase === 'result') {
    const max = queue.length * 2;
    const pct = max ? Math.round((score / max) * 100) : 0;
    return (
      <div className="space-y-4">
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 text-center space-y-1.5">
          <div className="text-3xl">{pct >= 90 ? '🏆' : pct >= 60 ? '👏' : '💪'}</div>
          <p className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
            {toFa(score)} از {toFa(max)} امتیاز — {toFa(pct)}٪
          </p>
          <p className="text-[12px] text-[#5d6676] dark:text-[#a3adbd]">
            سطح {lvl} • بهترین زنجیره: {toFa(bestStreak)} • {mistakes.length ? `${toFa(mistakes.length)} فعل برای تکرار` : 'بدون اشتباه!'}
          </p>
        </div>

        {mistakesVerbs.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[12px] font-bold text-[#5d6676] dark:text-[#a3adbd] px-1">📋 زنجیره‌هایی که باید تکرار کنی:</p>
            {mistakesVerbs.map(v => (
              <div key={v.inf} className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 flex items-center gap-2 flex-wrap" dir="ltr">
                <span className="font-sans font-bold text-slate-900 dark:text-slate-100">{v.inf}</span>
                <span className="text-[#8b95a7]">→</span>
                <MarkedForm form={v.prt} verb={v} kind="prt" />
                <span className="text-[#8b95a7]">→</span>
                <PerfektForm verb={v} />
                <span className="text-[10px] text-[#5d6676] dark:text-[#a3adbd] mr-auto" dir="rtl">{v.fa}</span>
                <button onClick={() => speakChain(v)} className="text-sm opacity-70 hover:opacity-100">🔊</button>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {mistakesVerbs.length > 0 && (
            <button onClick={() => start(mistakesVerbs)} className="py-2.5 rounded-2xl bg-amber-500 text-white text-[13px] font-extrabold shadow">
              🔁 فقط اشتباه‌ها
            </button>
          )}
          <button onClick={() => start(levelVerbs)} className="py-2.5 rounded-2xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white text-[13px] font-extrabold shadow">
            ↺ دوبارهٔ همین سطح
          </button>
          <button onClick={() => setPhase('table')} className="py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-[13px] font-bold text-[#1f2a3d] dark:text-[#e7ecf5]">
            🗂 جدول مرور سطح
          </button>
          <button onClick={() => setPhase('setup')} className="py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 text-[13px] font-bold text-[#1f2a3d] dark:text-[#e7ecf5]">
            🎯 سطح دیگر
          </button>
        </div>
      </div>
    );
  }

  /* ── صفحهٔ بازی ── */
  if (!current) return null;
  const aux = current.aux === 'sein' ? 'ist' : 'hat';
  const prtDone = step === 'pp' || !!verdict;

  return (
    <div className="space-y-3.5">
      {/* نوار وضعیت */}
      <div className="flex items-center gap-2 flex-wrap">
        <MiniChip tone="blue">{lvl}</MiniChip>
        <MiniChip>{toFa(qi + 1)}/{toFa(queue.length)}</MiniChip>
        <MiniChip tone="green">⭐ {toFa(score)}</MiniChip>
        {streak >= 2 && <MiniChip tone="green">🔥 زنجیره {toFa(streak)}</MiniChip>}
        <button
          onClick={() => setPhase('table')}
          className="mr-auto px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-[#5d6676] dark:text-[#a3adbd]"
        >
          🗂 جدول سطح
        </button>
        <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] transition-all"
            style={{ width: `${((prtDone ? 1 : 0.5) + qi) / queue.length * 100}%` }}
          />
        </div>
      </div>

      {/* زنجیرهٔ سه زمان — قدم‌به‌قدم پر می‌شود */}
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-3 flex items-center justify-center gap-2 flex-wrap" dir="ltr">
        <span className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-[#141923] font-sans font-extrabold text-slate-900 dark:text-slate-100 text-lg">{current.inf}</span>
        <span className="text-[#8b95a7] font-bold">→</span>
        {prtDone ? (
          <span className="px-3 py-1.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200/70 dark:border-red-900/40"><MarkedForm form={current.prt} verb={current} kind="prt" size="lg" /></span>
        ) : (
          <span className="px-4 py-1.5 rounded-xl border-2 border-dashed border-[#c6cbd8] dark:border-[#3a4354] text-[#8b95a7] font-bold">؟</span>
        )}
        <span className="text-[#8b95a7] font-bold">→</span>
        {verdict ? (
          <span className="px-3 py-1.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200/70 dark:border-red-900/40"><PerfektForm verb={current} size="lg" /></span>
        ) : (
          <span className="px-4 py-1.5 rounded-xl border-2 border-dashed border-[#c6cbd8] dark:border-[#3a4354] text-[#8b95a7] font-bold">؟</span>
        )}
      </div>

      {/* کارت فعل */}
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <MiniChip>{verdict ? irrChipLabel(current) : 'قدم ' + (step === 'prt' ? '۱ از ۲' : '۲ از ۲')}</MiniChip>
            {current.src === 'lib' && <MiniChip tone="blue">📖 از واژگان تو</MiniChip>}
            <span className="text-[11px] text-[#5d6676] dark:text-[#a3adbd]" dir="rtl">{current.fa}</span>
          </div>
          <button onClick={() => speakChain(current)} title="خواندن زنجیره" className="text-base opacity-70 hover:opacity-100">🔊</button>
        </div>

        {!verdict ? (
          <>
            <p className="text-[13px] font-bold text-slate-900 dark:text-slate-100">
              {step === 'prt' ? 'شکل Präteritum (er/sie/es) را بنویس:' : `Perfekt را کامل بنویس (${aux} یا ${aux === 'ist' ? 'hat' : 'ist'} + Partizip II):`}
            </p>
            <input
              key={`${qi}-${step}`}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') check(); }}
              autoFocus
              dir="ltr"
              placeholder={step === 'prt' ? 'Präteritum …' : 'ist/hat + Partizip II …'}
              className="w-full px-3.5 py-3 rounded-xl border border-[#dde1ea] dark:border-[#333b4a] bg-slate-50 dark:bg-[#141923] text-slate-900 dark:text-slate-100 font-sans font-bold text-lg outline-none focus:border-[#1f5fbf]"
            />
            <div className="flex gap-2">
              <button onClick={check} disabled={!input.trim()} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white text-sm font-extrabold shadow disabled:opacity-40">
                بررسی ✓
              </button>
              <button onClick={reveal} className="px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-[12px] font-bold text-[#5d6676] dark:text-[#a3adbd]">
                نمی‌دونم 👁
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={`rounded-xl px-3.5 py-2.5 text-[13px] font-bold leading-6 ${
              verdict.ok
                ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border border-green-200/70 dark:border-green-900/40'
                : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200/70 dark:border-red-900/40'
            }`}>
              {verdict.ok
                ? (step === 'prt' ? '✅ درست! حالا Perfekt:' : '✅ درست! زنجیرهٔ این فعل کامل شد')
                : verdict.note === 'aux'
                  ? `⚠ Partizip II را درست نوشتی، ولی فعل کمکی این فعل «${aux}» است: ${aux} ${current.pp}`
                  : verdict.note === 'shown'
                    ? `👀 شکل درست: ${step === 'prt' ? current.prt : `${aux} ${current.pp}`}`
                    : `❌ شکل درست: ${step === 'prt' ? current.prt : `${aux} ${current.pp}`}`}
            </div>
            {!verdict.ok && verdict.note !== 'aux' && (
              <p className="text-[11px] text-[#5d6676] dark:text-[#a3adbd] px-1 leading-5">
                {step === 'prt'
                  ? 'در Präteritum، ریشهٔ فعل (حروف صدادار) عوض می‌شود — قسمت قرمز را ببین.'
                  : 'در Perfekt، فعل کمکی + Partizip II (معمولاً با ge- و پایان -en) می‌آید — قسمت‌های قرمز را ببین.'}
              </p>
            )}
            <button
              onClick={advance}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white text-sm font-extrabold shadow"
            >
              {step === 'prt' ? 'قدم بعد: Perfekt ←' : qi + 1 >= queue.length ? 'دیدن نتیجه 🏁' : 'فعل بعدی ←'}
            </button>
          </>
        )}
      </div>

      {/* راهنمای کوتاه قرمز */}
      <p className="text-[10.5px] text-[#8b95a7] px-1 leading-5">
        قرمز = تغییر نسبت به مصدر • شکل ضعیفِ قاعده‌مند (مثل backte/gemacht) قرمز نمی‌شود •
        جداشدنی‌ها: ذرهٔ جداشدنی ثابت می‌ماند.
      </p>
    </div>
  );
};

export default IrregularVerbsTrainer;
