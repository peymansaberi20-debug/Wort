/**
 * IrregularVerbsTrainer.tsx — بازی «فعل‌های بی‌قاعده در سه زمان» (تب گرامر → فعل و زمان‌ها)
 *
 * ▌منطق تمرین (درخواست کاربر):
 *   - اول مثل بقیهٔ تمرین‌ها سطح انتخاب می‌شود (A1 تا C2)
 *   - بعد همهٔ فعل‌های بی‌قاعدهٔ آن سطح — چه Präteritum بی‌قاعده داشته باشد چه Partizip II چه هر دو —
 *     دونه‌دونه در قالب یک بازی دوتایی تمرین و تکرار می‌شوند
 *   - هر فعل دو قدم دارد: ۱) نوشتن شکل Präteritum (er/sie/es)  ۲) نوشتن Perfekt با فعل کمکی (ist/hat + Partizip II)
 *   - رنگ‌ها: قرمز = بخش تغییر یافته نسبت به مصدر • ist (sein) آبی • hat (haben) نارنجی
 *   - در زنجیره، Perfekt فقط بعد از پاسخ به قدم دوم نشان داده می‌شود (جواب قدم بعدی لو نمی‌رود)
 *   - پاسخ اشتباه: مقایسهٔ حرف‌به‌حرف «پاسخ تو» با «شکل درست» (answerDiff در src/utils/irrDiff.ts)
 *   - جمع‌بندی هر فعل، نتیجهٔ هر دو قدم را می‌گوید (نه فقط قدم آخر)
 *   - برگهٔ مرور با دکمهٔ چاپ روی A4 تمیز پرینت می‌شود (visibility تکنیک — سازگار با سافاری)
 *   - امتیاز، زنجیرهٔ برد (streak)، برگهٔ مرور کل سطح و تکرار فقط اشتباه‌ها
 */

import React, { useCallback, useMemo, useState } from 'react';
import { AppSettings, Word } from '../types';
import { speak } from '../utils/audio';
import { IrrVerb, IrrLvl, IRR_LVL_ORDER, IRR_LVL_INFO, irrVerbsOf } from '../data/irregularVerbs';
import { markForm, eqDe, normDe, answerDiff, AnsSeg } from '../utils/irrDiff';
import { libIrregularVerbs } from '../utils/irrLibrary';
import { LevelChips, MiniChip, PrintPreview, toFa } from '../components/trainerUI';
import { ClickableWords, WordLookupModal } from '../components/WordLookup';
import { useVocabGate } from '../components/VocabDecisionDialog';
import { Printer } from 'lucide-react';

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

/** رنگ فعل‌های کمکی: ist (sein) آبی، hat (haben) نارنجی — قرمز فقط برای تغییر ریشه است */
const AUX_SEIN_CLS = 'text-sky-600 dark:text-sky-400 font-black underline decoration-sky-500/70 decoration-2 underline-offset-4';
const AUX_HABEN_CLS = 'text-amber-600 dark:text-amber-400 font-black underline decoration-amber-500/70 decoration-2 underline-offset-4';

/** شکل کامل Perfekt: فعل کمکی با رنگ اختصاصی (ist آبی، hat نارنجی) + Partizip II با قرمز تغییرها */
const PerfektForm: React.FC<{ verb: IrrVerb; size?: 'sm' | 'lg' }> = ({ verb, size }) => (
  <span dir="ltr" className={`inline-flex items-baseline gap-x-1.5 font-sans font-bold ${size === 'lg' ? 'text-2xl md:text-3xl' : 'text-base'}`}>
    <span className={verb.aux === 'sein' ? AUX_SEIN_CLS : AUX_HABEN_CLS}>
      {verb.aux === 'sein' ? 'ist' : 'hat'}
    </span>
    <MarkedForm form={verb.pp} verb={verb} kind="pp" size={size} />
  </span>
);

/** ذکر رنگی فعل کمکی داخل متن‌های فارسی */
const AuxWord: React.FC<{ aux: 'haben' | 'sein' }> = ({ aux }) => (
  <span dir="ltr" className={`font-sans ${aux === 'sein' ? AUX_SEIN_CLS : AUX_HABEN_CLS}`}>
    {aux === 'sein' ? 'ist' : 'hat'}
  </span>
);

/** یک خط مقایسه («پاسخ تو» / «شکل درست») — bad قرمزِ موج‌دار، fix سبز */
const AnsLine: React.FC<{ label: string; segs: AnsSeg[] }> = ({ label, segs }) => (
  <div className="flex items-baseline gap-2 flex-wrap">
    <span className="text-[11px] font-bold text-[#5d6676] dark:text-[#a3adbd] w-[68px] flex-shrink-0">{label}</span>
    <span dir="ltr" className="font-sans font-bold text-[15px] tracking-wide text-slate-900 dark:text-slate-100">
      {segs.map((s, i) =>
        s.state === 'same' ? (
          <span key={i}>{s.text}</span>
        ) : s.state === 'bad' ? (
          <span key={i} className="text-red-600 dark:text-red-400 font-black underline decoration-wavy decoration-red-500/70 underline-offset-4">{s.text}</span>
        ) : (
          <span key={i} className="text-green-700 dark:text-green-400 font-black underline decoration-green-600/70 underline-offset-4">{s.text}</span>
        )
      )}
    </span>
  </div>
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

/** کلید مرتب‌سازی «موارد شبیه زیر هم»: وارونهٔ مصدر — فعل‌هایی که پایان مشترک دارند
 *  کنار هم می‌افتند (empfehlen/befehlen، kapieren/kontrollieren/informieren و…) */
const rkey = (s: string): string => s.split('').reverse().join('');

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
  /** افزودن واژهٔ لمس‌شده به کتابخانه (گیت تکراری/Partizip II/مترادف) */
  onQuickAddWord?: (w: Partial<Word>) => boolean;
  onViewWord?: (w: Word) => void;
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

export const IrregularVerbsTrainer: React.FC<IrregularVerbsTrainerProps> = ({ words, onShowToast, onQuickAddWord, onViewWord }) => {
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
  const [prtOk, setPrtOk] = useState<boolean | null>(null); // نتیجهٔ قدم Präteritum — برای جمع‌بندی درست قدم دوم
  // پاپ‌آپ واژهٔ لمس‌شده (زنجیرهٔ سه زمان، جدول مرور و نتیجه) + گیت تکراری/P2/مترادف
  const [lookup, setLookup] = useState<string | null>(null);
  const gate = useVocabGate({
    words: words || [],
    onAdd: data => (onQuickAddWord ? onQuickAddWord(data) : false),
    onView: onViewWord
  });

  const lookupNodes = (
    <>
      {gate.node}
      {lookup && (
        <WordLookupModal
          word={lookup}
          level={lvl}
          cat="IrregularVerbs"
          onQuickAddWord={onQuickAddWord}
          words={words}
          onViewWord={onViewWord}
          onClose={() => setLookup(null)}
        />
      )}
    </>
  );

  // فعل‌های بی‌قاعدهٔ کتاب واژگان — از prop زنده؛ هر فعل جدید خودکار وارد می‌شود
  const libVerbs = useMemo(() => libIrregularVerbs(words), [words]);
  const bankVerbs = useMemo(() => irrVerbsOf(lvl), [lvl]);
  const libForLevel = useMemo(
    () => (useLib ? libVerbs.filter(v => v.lvl === lvl) : []),
    [libVerbs, useLib, lvl]
  );
  /** بانک + واژگان کاربر — مرتب بر اساس وارونهٔ مصدر تا فعل‌های شبیه زیر هم باشند */
  const levelVerbs = useMemo(
    () => [...bankVerbs, ...libForLevel].sort((a, b) => {
      const ka = rkey(a.inf), kb = rkey(b.inf);
      return ka < kb ? -1 : ka > kb ? 1 : a.inf < b.inf ? -1 : a.inf > b.inf ? 1 : 0;
    }),
    [bankVerbs, libForLevel]
  );
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
    setPrtOk(null);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setMistakes([]);
    setPhase('play');
  }, []);

  /** رفتن به قدم بعد یا فعل بعد — بعد از نشان دادن نتیجه */
  const advance = useCallback((): void => {
    if (step === 'prt') {
      setPrtOk(verdict ? verdict.ok : null); // نگه‌داری نتیجهٔ قدم اول برای جمع‌بندی قدم دوم
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

  /* ── برگهٔ چاپ A4 — از پیش‌نمایش مشترک trainerUI استفاده می‌شود.
     نسخهٔ قبلی یک برگهٔ پنهانِ همیشه‌مونت‌شده با CSS چاپ اختصاصی بود؛ قاعدهٔ
     «هر چیز جز برگهٔ من را حذف کن»ِ آن با برگهٔ بقیهٔ تمرین‌ها تداخل داشت و
     چاپِ آن‌ها را سفید می‌کرد — حالا فقط همین پیش‌نمایش مشترک وجود دارد. */
  const [printOpen, setPrintOpen] = useState(false);
  const printDate = useMemo(() => {
    try { return new Date().toLocaleDateString('fa-IR'); } catch { return ''; }
  }, []);
  const ptd: React.CSSProperties = { border: '0.5pt solid #94a3b8', padding: '3pt 7pt', fontSize: '10.5pt', whiteSpace: 'nowrap' };
  /** اندازهٔ فونت سلول چاپ بر اساس طول متن — کلمهٔ بلند کوچک می‌شود تا دوخطی نشود و ستون نپرد */
  const fitPt = (s: string): string => {
    const n = s.trim().length;
    return n >= 16 ? '7.5pt' : n >= 13 ? '8.5pt' : n >= 11 ? '9.5pt' : '10.5pt';
  };
  const irrPrintSheet = (
    <style>{`
      .irr-p-chg { color: #dc2626; font-weight: 800; text-decoration: underline; }
      .irr-p-aux-sein { color: #0284c7; font-weight: 800; }
      .irr-p-aux-haben { color: #d97706; font-weight: 800; }
      .irr-p-dim { color: #555; }
    `}</style>
  );
  const printSheetContent = (
    <>
      {irrPrintSheet}
      <div style={{ textAlign: 'center', marginBottom: '8pt' }}>
        <div style={{ fontSize: '15pt', fontWeight: 800 }}>فعل‌های بی‌قاعده در سه زمان — سطح {lvl}</div>
        <div className="irr-p-dim" style={{ fontSize: '9.5pt', marginTop: '3pt' }}>
          {toFa(levelVerbs.length)} فعل • {printDate} • <span className="irr-p-chg">قرمز</span> = تغییر نسبت به مصدر •
          <span className="irr-p-aux-sein"> ist </span>= sein • <span className="irr-p-aux-haben"> hat </span>= haben
        </div>
      </div>
      {/* پهنای ستون‌ها ثابت (tableLayout fixed) تا در همهٔ سطح‌ها یکسان بماند؛ کلمهٔ بلند با fitPt کوچک می‌شود */}
      <table style={{ width: '100%', borderCollapse: 'collapse', direction: 'ltr', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '23%' }} />
          <col style={{ width: '24%' }} />
          <col style={{ width: '31%' }} />
          <col style={{ width: '22%' }} />
        </colgroup>
        <thead>
          <tr>
            <th style={{ ...ptd, textAlign: 'left', fontWeight: 700 }}>Infinitiv</th>
            <th style={{ ...ptd, textAlign: 'left', fontWeight: 700 }}>Präteritum</th>
            <th style={{ ...ptd, textAlign: 'left', fontWeight: 700 }}>Perfekt</th>
            <th style={{ ...ptd, textAlign: 'right', fontWeight: 700 }} dir="rtl">معنی</th>
          </tr>
        </thead>
        <tbody>
          {levelVerbs.map(v => {
            const pSegs = markForm(v.prt, { inf: v.inf, kind: 'prt', sep: v.sep, override: v.hPrat });
            const ppSegs = markForm(v.pp, { inf: v.inf, kind: 'pp', sep: v.sep, override: v.hPp });
            return (
              <tr key={v.inf}>
                <td style={{ ...ptd, fontSize: fitPt(v.inf + (v.src === 'lib' ? ' *' : '')) }} dir="ltr">{v.inf}{v.src === 'lib' ? ' *' : ''}</td>
                <td style={{ ...ptd, fontSize: fitPt(v.prt) }} dir="ltr">{pSegs.map((s, k) => <span key={k} className={s.changed ? 'irr-p-chg' : undefined}>{s.text}</span>)}</td>
                <td style={{ ...ptd, fontSize: fitPt(`${v.aux === 'sein' ? 'ist' : 'hat'} ${v.pp}`) }} dir="ltr">
                  <span className={v.aux === 'sein' ? 'irr-p-aux-sein' : 'irr-p-aux-haben'}>{v.aux === 'sein' ? 'ist' : 'hat'}</span>
                  {' '}
                  {ppSegs.map((s, k) => <span key={k} className={s.changed ? 'irr-p-chg' : undefined}>{s.text}</span>)}
                </td>
                <td style={{ ...ptd, whiteSpace: 'normal', fontSize: '9.5pt' }} dir="rtl">{v.fa}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {levelVerbs.some(v => v.src === 'lib') && (
        <div className="irr-p-dim" style={{ fontSize: '9pt', marginTop: '5pt' }}>* از کتاب واژگان تو</div>
      )}
    </>
  );

  const irrPrintPreview = (
    <PrintPreview
      open={printOpen}
      onClose={() => setPrintOpen(false)}
      title={<span dir="ltr">Unregelmäßige Verben — {lvl}</span>}
      docTitle={`Unregelmäßige Verben ${lvl}`}
      meta={`فعل‌های بی‌قاعده در سه زمان • سطح ${lvl} • ${toFa(levelVerbs.length)} فعل • ${printDate}`}
      hint="پیش‌نمایش برگهٔ A4 — جدول مرور سه‌زمانی با رنگ‌بندی بخش‌های تغییرکرده"
      questions={printSheetContent}
    />
  );

  /* ── صفحهٔ انتخاب سطح ── */
  if (phase === 'setup') {
    return (
      <>
        {irrPrintPreview}
        <div className="space-y-4">
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 space-y-2.5">
          <p className="text-[13px] font-bold text-slate-900 dark:text-slate-100 leading-6">
            🎢 زنجیرهٔ سه زمان را کامل کن: مصدر ← Präteritum ← Perfekt
          </p>
          <p className="text-[12px] text-[#5d6676] dark:text-[#a3adbd] leading-6">
            هر فعل دو قدم دارد: اول شکل <b>Präteritum</b> (er/sie/es) را می‌نویسی، بعد <b>Perfekt</b> با فعل کمکی
            (<AuxWord aux="sein" /> یا <AuxWord aux="haben" /> + Partizip II). بعد از هر پاسخ، زنجیره تا جای پاسخ‌داده‌شده
            نشان داده می‌شود و <span className="text-red-600 dark:text-red-400 font-bold">قسمت‌هایی که تغییر کرده‌اند قرمز</span> هستند.
          </p>
        </div>

        <LevelChips value={lvl} onChange={l => setLvl(l as IrrLvl)} levels={IRR_LVL_ORDER as unknown as string[]} />
        <p className="text-xs text-[#5d6676] dark:text-[#8b95a7] -mt-1 leading-5">{IRR_LVL_INFO[lvl].label}</p>

        <div className="flex items-center justify-between gap-2 bg-slate-50 dark:bg-[#141923] rounded-xl px-3.5 py-2.5 border border-[#dde1ea] dark:border-[#333b4a]">
          <span className="text-[13px] font-bold text-[#1f2a3d] dark:text-[#e7ecf5]">
            🎯 {toFa(levelVerbs.length)} فعل بی‌قاعده در سطح {lvl}
            {useLib && libForLevel.length > 0 && (
              <span className="text-xs font-bold text-[#5d6676] dark:text-[#a3adbd]">
                {' '}(بانک: {toFa(bankVerbs.length)} + واژگان تو: {toFa(libForLevel.length)})
              </span>
            )}
          </span>
          <div className="flex gap-1.5 flex-shrink-0">
            <button
              onClick={() => setPhase('table')}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-[#5d6676] dark:text-[#a3adbd]"
            >
              🗂 جدول مرور
            </button>
            <button
              onClick={() => setPrintOpen(true)}
              title={`برگهٔ A4 فعل‌های بی‌قاعدهٔ سطح ${lvl}`}
              aria-label="برگهٔ A4"
              className="px-2.5 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-[#5d6676] dark:text-[#a3adbd] flex items-center justify-center"
            >
              <Printer size={14} />
            </button>
          </div>
        </div>

        {libVerbs.length > 0 && (
          <button
            onClick={() => setUseLib(x => !x)}
            className="w-full flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 border transition bg-white dark:bg-[#1b2029] border-[#dde1ea] dark:border-[#333b4a]"
          >
            <span className="text-[13px] font-bold text-[#1f2a3d] dark:text-[#e7ecf5] text-right">
              📖 فعل‌های بی‌قاعدهٔ کتاب واژگان خودت
              <span className="block text-xs font-bold text-[#5d6676] dark:text-[#a3adbd] leading-4 mt-0.5">
                {toFa(libVerbs.length)} فعل از واژگان تو شناسایی شده — فعل جدیدی هم که اضافه کنی خودکار می‌آید
              </span>
            </span>
            <span className={`px-2.5 py-1 rounded-lg text-xs font-extrabold flex-shrink-0 ${useLib ? 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400' : 'bg-slate-100 dark:bg-slate-800 text-[#5d6676] dark:text-[#a3adbd]'}`}>
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
      {lookupNodes}
      </>
    );
  }

  /* ── برگهٔ مرور کل سطح ── */
  if (phase === 'table') {
    return (
      <>
        {irrPrintPreview}
        <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1.5">
            <button onClick={() => setPhase('setup')} className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-[13px] font-bold">→ انتخاب سطح</button>
            <button onClick={() => setPrintOpen(true)} title={`برگهٔ A4 فعل‌های بی‌قاعدهٔ سطح ${lvl}`} aria-label="برگهٔ A4" className="px-2.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-[13px] font-bold flex items-center justify-center"><Printer size={15} /></button>
          </div>
          <b className="text-xs text-[#5d6676] dark:text-[#a3adbd]">🗂 فعل‌های بی‌قاعدهٔ سطح {lvl} — {toFa(levelVerbs.length)} فعل</b>
        </div>
        <p className="text-[11px] text-[#5d6676] dark:text-[#8b95a7] leading-5">
          <span className="text-red-600 dark:text-red-400 font-bold">قرمز</span> = بخشی که نسبت به مصدر تغییر می‌کند •
          فعل کمکی <span dir="ltr" className="font-sans font-bold text-sky-600 dark:text-sky-400">ist</span> (sein) و{' '}
          <span dir="ltr" className="font-sans font-bold text-amber-600 dark:text-amber-400">hat</span> (haben) باید همراه فعل حفظ شود •
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
                    <span className="cursor-pointer rounded px-0.5 hover:bg-amber-200/80 dark:hover:bg-amber-700/50 transition" onClick={() => setLookup(v.inf)}>{v.inf}</span>
                    {v.src === 'lib' && <span className="mr-1 text-[9px] font-extrabold text-[#1f5fbf]">📖</span>}
                  </td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap"><span className="cursor-pointer rounded px-0.5 hover:bg-amber-200/80 dark:hover:bg-amber-700/50 transition" onClick={() => setLookup(v.prt)}><MarkedForm form={v.prt} verb={v} kind="prt" /></span></td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap"><span className="cursor-pointer rounded px-0.5 hover:bg-amber-200/80 dark:hover:bg-amber-700/50 transition" onClick={() => setLookup(v.pp)}><PerfektForm verb={v} /></span></td>
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
      {lookupNodes}
      </>
    );
  }

  /* ── صفحهٔ نتیجه ── */
  if (phase === 'result') {
    const max = queue.length * 2;
    const pct = max ? Math.round((score / max) * 100) : 0;
    return (
      <>
        {irrPrintPreview}
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
                <span className="font-sans font-bold text-slate-900 dark:text-slate-100 cursor-pointer rounded px-0.5 hover:bg-amber-200/80 dark:hover:bg-amber-700/50 transition" onClick={() => setLookup(v.inf)}>{v.inf}</span>
                <span className="text-[#8b95a7]">→</span>
                <span className="cursor-pointer rounded px-0.5 hover:bg-amber-200/80 dark:hover:bg-amber-700/50 transition" onClick={() => setLookup(v.prt)}><MarkedForm form={v.prt} verb={v} kind="prt" /></span>
                <span className="text-[#8b95a7]">→</span>
                <span className="cursor-pointer rounded px-0.5 hover:bg-amber-200/80 dark:hover:bg-amber-700/50 transition" onClick={() => setLookup(v.pp)}><PerfektForm verb={v} /></span>
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
      {lookupNodes}
      </>
    );
  }

  /* ── صفحهٔ بازی ── */
  if (!current) return null;
  const aux = current.aux === 'sein' ? 'ist' : 'hat';
  const prtDone = step === 'pp' || !!verdict;

  return (
    <>
      {irrPrintPreview}
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
        <span className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-[#141923] font-sans font-extrabold text-slate-900 dark:text-slate-100 text-lg cursor-pointer rounded px-0.5 hover:bg-amber-200/80 dark:hover:bg-amber-700/50 transition" onClick={() => setLookup(current.inf)}>{current.inf}</span>
        <span className="text-[#8b95a7] font-bold">→</span>
        {prtDone ? (
          <span className="px-3 py-1.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200/70 dark:border-red-900/40 cursor-pointer rounded px-0.5 hover:bg-amber-200/80 dark:hover:bg-amber-700/50 transition" onClick={() => setLookup(current.prt)}><MarkedForm form={current.prt} verb={current} kind="prt" size="lg" /></span>
        ) : (
          <span className="px-4 py-1.5 rounded-xl border-2 border-dashed border-[#c6cbd8] dark:border-[#3a4354] text-[#8b95a7] font-bold">؟</span>
        )}
        <span className="text-[#8b95a7] font-bold">→</span>
        {/* Perfekt فقط بعد از پاسخ به قدم دوم نشان داده می‌شود — وگرنه جواب قدم بعدی لو می‌رود */}
        {verdict && step === 'pp' ? (
          <span className="px-3 py-1.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200/70 dark:border-red-900/40 cursor-pointer rounded px-0.5 hover:bg-amber-200/80 dark:hover:bg-amber-700/50 transition" onClick={() => setLookup(current.pp)}><PerfektForm verb={current} size="lg" /></span>
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
              {step === 'prt' ? 'شکل Präteritum (er/sie/es) را بنویس:' : <>Perfekt را کامل بنویس (<AuxWord aux="sein" /> یا <AuxWord aux="haben" /> + Partizip II):</>}
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
        ) : verdict.ok ? (
          <div className={`rounded-xl px-3.5 py-2.5 text-[13px] font-bold leading-6 border ${
            step === 'pp' && prtOk === false
              ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200/70 dark:border-amber-900/40'
              : 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border-green-200/70 dark:border-green-900/40'
          }`}>
            {step === 'prt'
              ? '✅ درست! حالا Perfekt:'
              : prtOk === false
                ? '⚠ Perfekt را درست گفتی، ولی Präteritum را اشتباه — این فعل را تکرار کن'
                : '✅ عالی! هر دو قدم درست — زنجیرهٔ این فعل کامل شد 🎉'}
          </div>
        ) : !input.trim() ? (
          <div className="rounded-xl px-3.5 py-2.5 text-[13px] font-bold leading-6 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200/70 dark:border-red-900/40">
            👀 شکل درست: <span dir="ltr" className="font-sans">{step === 'prt' ? current.prt : `${aux} ${current.pp}`}</span>
          </div>
        ) : (() => {
          const exp = step === 'prt' ? current.prt : `${aux} ${current.pp}`;
          const cmp = answerDiff(input, exp);
          return (
            <div className="rounded-xl border border-red-200/70 dark:border-red-900/40 bg-red-50 dark:bg-red-950/30 px-3.5 py-3 space-y-2" dir="rtl">
              <p className="text-[13px] font-extrabold text-red-700 dark:text-red-400 leading-6">
                {verdict.note === 'shown'
                  ? '👀 شکل درست — مقایسه با پاسخ تو:'
                  : `❌ ${step === 'prt' ? 'Präteritum' : 'Perfekt'} اشتباه بود — مقایسهٔ حرف‌به‌حرف:`}
              </p>
              {step === 'pp' && verdict.note !== 'shown' && (
                <p className={`text-[11.5px] font-bold leading-5 ${prtOk === false ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>
                  {prtOk === false ? 'هر دو قدم این فعل اشتباه شد.' : 'Präteritum را درست گفتی، ولی Perfekt را اشتباه.'}
                </p>
              )}
              <AnsLine label="پاسخ تو" segs={cmp.g} />
              <AnsLine label="شکل درست" segs={cmp.e} />
              {verdict.note === 'aux' && (
                <p className="text-[11px] font-bold text-[#5d6676] dark:text-[#a3adbd] leading-5">
                  Partizip II را درست نوشتی، ولی فعل کمکی غلط است — <AuxWord aux={current.aux} /> باید همراه فعل حفظ شود.
                </p>
              )}
            </div>
          );
        })()}
        {verdict && !verdict.ok && verdict.note !== 'aux' && (
          <p className="text-[11px] text-[#5d6676] dark:text-[#a3adbd] px-1 leading-5">
            {step === 'prt'
              ? 'در Präteritum، ریشهٔ فعل (حروف صدادار) عوض می‌شود — قسمت قرمز را ببین.'
              : 'در Perfekt، فعل کمکی (آبی ist / نارنجی hat) + Partizip II (معمولاً با ge- و پایان -en) می‌آید — قسمت‌های قرمز را ببین.'}
          </p>
        )}
        {verdict && (
          <button
            onClick={advance}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white text-sm font-extrabold shadow"
          >
            {step === 'prt' ? 'قدم بعد: Perfekt ←' : qi + 1 >= queue.length ? 'دیدن نتیجه 🏁' : 'فعل بعدی ←'}
          </button>
        )}
      </div>

      {/* راهنمای کوتاه رنگ‌ها */}
      <p className="text-[10.5px] text-[#8b95a7] px-1 leading-5">
        قرمز = تغییر نسبت به مصدر • <span dir="ltr" className="font-bold text-sky-600 dark:text-sky-400">ist</span> آبی /{' '}
        <span dir="ltr" className="font-bold text-amber-600 dark:text-amber-400">hat</span> نارنجی •
        شکل ضعیفِ قاعده‌مند (مثل backte/gemacht) قرمز نمی‌شود • جداشدنی‌ها: ذرهٔ جداشدنی ثابت می‌ماند.
      </p>
      </div>
    </>
  );
};

export default IrregularVerbsTrainer;
