/**
 * WorksheetTrainer.tsx — برگه‌های تمرین گرامر (Arbeitsblätter)
 * همان برگه‌های کاغذی کتاب‌کاری، اما نه به‌صورت لیست زیر هم:
 *   هر جمله یک کارت مستقل می‌آید → تایپ حرف اضافه(ها) → بررسی فوری → توضیح → جملهٔ بعدی.
 *   پشتیبانی از چند جای‌خالی در یک جمله (مثل «warten ___ einen Brief ___ …»).
 *   در پایان: صفحهٔ نتیجه + تکرار فقط جمله‌های غلط + ذخیرهٔ بهترین رکورد.
 *   دکمهٔ «چرا این جواب؟» توضیح فارسی با هوش مصنوعی همان کلید تنظیمات.
 * محتوا از برگه‌های خود کاربر دیجیتال شده است (مطالعهٔ شخصی).
 */

import React, { useState } from 'react';
import { describeAiError, generateText, hasApiKey } from '../utils/aiProvider';

/* ───────────── بانک برگه‌ها ───────────── */

export interface WshItem {
  /** قطعه‌های جمله؛ اندیس‌های فرد جای خالی هستند */
  seg: string[];
  /** پاسخ درست هر جای خالی (به ترتیب) */
  answers: string[];
  /** توضیح کوتاه فارسی: فعل/ساختار + حرف اضافه + حالت */
  note: string;
  /** پاسخ‌های جایگزین پذیرفته برای هر جای خالی */
  alt?: string[][];
}

export interface WshSheet { id: string; title: string; topic: string; items: WshItem[] }

const SHEETS: WshSheet[] = [
  {
    id: 'prap3',
    title: 'Welche Präpositionen passen? (3)',
    topic: 'Verben mit Präpositionen — فعل + حرف اضافه',
    items: [
      { seg: ['Erika freut sich schon ', ' ihren Geburtstag.'], answers: ['auf'], note: 'sich freuen auf + Akk — شادی برای رویداد آینده (تولدی که هنوز نیامده)' },
      { seg: ['Franz wartet ', ' einen Brief ', ' seiner Freundin.'], answers: ['auf', 'von'], note: 'warten auf + Akk (منتظر نامه بودن) + von («از طرفِ» دوستش)' },
      { seg: ['Ich habe keine Angst ', ' Prüfungen.'], answers: ['vor'], note: 'Angst haben vor + Dat' },
      { seg: ['Er trifft sich ', ' seinen Freunden ', ' dem Kino.'], answers: ['mit', 'in'], note: 'sich treffen mit + Dat (با کسی) + in + Dat برای مکان (in dem Kino)' },
      { seg: ['Glaubst du ', ' Wunder?'], answers: ['an'], note: 'glauben an + Akk' },
      { seg: ['Maria bewirbt sich ', ' einen Praktikumsplatz.'], answers: ['um'], note: 'sich bewerben um + Akk' },
      { seg: ['Mojmir sehnt sich ', ' seiner Heimat.'], answers: ['nach'], note: 'sich sehnen nach + Dat' },
      { seg: ['Wir kümmern uns ', ' die kranke Nachbarin.'], answers: ['um'], note: 'sich kümmern um + Akk' },
      { seg: ['Max fürchtet sich ', ' Hunden.'], answers: ['vor'], note: 'sich fürchten vor + Dat' },
      { seg: ['Erkundigst du dich ', ' dem Fahrplan?'], answers: ['nach'], note: 'sich erkundigen nach + Dat' },
      { seg: ['Er denkt gern ', ' seinen Urlaub in Amerika.'], answers: ['an'], note: 'denken an + Akk' },
      { seg: ['', ' wem hast du dich so lange unterhalten?'], answers: ['Mit'], note: 'sich unterhalten mit + Dat — «با چه کسی؟» (شروع جمله، پس حرف بزرگ)' },
      { seg: ['Ich bin böse ', ' meine Cousine. Sie hat meine Brille kaputt gemacht.'], answers: ['auf'], note: 'böse sein auf + Akk (عصبانی بودن از کسی)' },
      { seg: ['Cornelia hat sich ', ' einen netten Mann verliebt.'], answers: ['in'], note: 'sich verlieben in + Akk' },
      { seg: ['Ich habe gestern ', ' meiner Mutter telefoniert.'], answers: ['mit'], note: 'telefonieren mit + Dat' },
      { seg: ['Freust du dich ', ' das Geschenk?'], answers: ['über'], note: 'sich freuen über + Akk — چیزی که آمده یا گرفته شده' },
      { seg: ['Er nimmt seit März ', ' einem Deutschkurs teil.'], answers: ['an'], note: 'teilnehmen an + Dat' },
      { seg: ['Hast du dich schon ', ' die vielen Geschenke bedankt?'], answers: ['für'], note: 'sich bedanken für + Akk' },
      { seg: ['Gestern habe ich ', ' meiner Großmutter geträumt.'], answers: ['von'], note: 'träumen von + Dat' },
      { seg: ['Wir müssen ', ' unseren Kollegen darüber sprechen.'], answers: ['mit'], note: 'sprechen mit + Dat (با کسی حرف زدن)' },
      { seg: ['Fürchtet ihr euch ', ' Spinnen?'], answers: ['vor'], note: 'sich fürchten vor + Dat' },
      { seg: ['Der Kuchen ist nicht gut. Er schmeckt ', ' Salz.'], answers: ['nach'], note: 'schmecken nach + Dat (طعم چیزی را دادن)' },
      { seg: ['Ich bin ', ' diesem Plan nicht einverstanden.'], answers: ['mit'], note: 'einverstanden sein mit + Dat (موافق بودن با چیزی)' },
      { seg: ['Könnt ihr euch noch ', ' Tante Klara erinnern?'], answers: ['an'], note: 'sich erinnern an + Akk' },
      { seg: ['Wir haben viel ', ' diesen Film gelacht.'], answers: ['über'], note: 'lachen über + Akk' },
      { seg: ['Interessierst du dich auch ', ' Sport?'], answers: ['für'], note: 'sich interessieren für + Akk' },
      { seg: ['Ich muss noch ', ' die Prüfung lernen.'], answers: ['für'], note: 'lernen für + Akk (برای چیزی درس خواندن)' },
    ],
  },
];

/* ───────────── منطق ───────────── */

const norm = (s: string): string => s.toLowerCase().trim().replace(/\s+/g, ' ');

/** جملهٔ کامل با پاسخ‌های درست (برای AI و لیست نتیجه) */
const itemFull = (it: WshItem): string => {
  let s = it.seg[0] || '';
  for (let g = 0; g < it.answers.length; g++) s += it.answers[g] + (it.seg[g + 1] || '');
  return s;
};

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const toFa = (n: number | string): string => String(n).replace(/[0-9]/g, (d) => FA_DIGITS[+d]);

const PROG_KEY = 'wb_wsh_v1';
interface SheetProg { best: number; lastWrong: number[] }
const loadProg = (): Record<string, SheetProg> => {
  try { return JSON.parse(localStorage.getItem(PROG_KEY) || '{}') || {}; } catch { return {}; }
};
const saveProg = (p: Record<string, SheetProg>): void => {
  try { localStorage.setItem(PROG_KEY, JSON.stringify(p)); } catch { /* ignore */ }
};

type Phase = 'pick' | 'run' | 'done';
interface Session { sheet: WshSheet; order: number[]; idx: number; ok: number; wrong: number[] }

const gapGood = (it: WshItem, g: number, v: string): boolean => {
  const got = norm(v || '');
  if (!got) return false;
  if (got === norm(it.answers[g])) return true;
  return (it.alt?.[g] || []).some((a) => norm(a) === got);
};

export const WorksheetTrainer: React.FC<{ onShowToast?: (m: string) => void; onClose?: () => void }> = ({ onShowToast, onClose }) => {
  const [phase, setPhase] = useState<Phase>('pick');
  const [sess, setSess] = useState<Session | null>(null);
  const [inputs, setInputs] = useState<string[]>([]);
  const [checked, setChecked] = useState<boolean[] | null>(null); // وضعیت هر جای خالی پس از بررسی
  const [itemOk, setItemOk] = useState<boolean | null>(null);
  const [hint, setHint] = useState(false);
  const [why, setWhy] = useState<{ busy: boolean; text: string; err: string; idx: number }>({ busy: false, text: '', err: '', idx: -1 });
  const [prog, setProg] = useState<Record<string, SheetProg>>(() => loadProg());

  const start = (sheet: WshSheet, order?: number[]): void => {
    const ord = order && order.length ? order : sheet.items.map((_, i) => i);
    setSess({ sheet, order: ord, idx: 0, ok: 0, wrong: [] });
    setInputs(new Array(sheet.items[ord[0]].answers.length).fill(''));
    setChecked(null); setItemOk(null); setHint(false);
    setWhy({ busy: false, text: '', err: '', idx: -1 });
    setPhase('run');
  };

  const check = (): void => {
    if (!sess || checked) return;
    const it = sess.sheet.items[sess.order[sess.idx]];
    const res = it.answers.map((_, g) => gapGood(it, g, inputs[g] || ''));
    setChecked(res);
    setItemOk(res.every(Boolean));
  };

  const next = (): void => {
    if (!sess || !checked) return;
    const itemIdx = sess.order[sess.idx];
    const good = itemOk === true;
    const ok = sess.ok + (good ? 1 : 0);
    const wrong = good ? sess.wrong : [...sess.wrong, itemIdx];
    if (sess.idx + 1 >= sess.order.length) {
      const p = { ...prog };
      const cur = p[sess.sheet.id] || { best: 0, lastWrong: [] };
      p[sess.sheet.id] = { best: Math.max(cur.best, ok), lastWrong: wrong };
      setProg(p); saveProg(p);
      setSess({ ...sess, idx: sess.idx + 1, ok, wrong });
      setPhase('done');
      onShowToast?.(`نتیجهٔ برگه ذخیره شد: ${ok} از ${sess.order.length}`);
      return;
    }
    const nItem = sess.sheet.items[sess.order[sess.idx + 1]];
    setSess({ ...sess, idx: sess.idx + 1, ok, wrong });
    setInputs(new Array(nItem.answers.length).fill(''));
    setChecked(null); setItemOk(null); setHint(false);
    setWhy({ busy: false, text: '', err: '', idx: -1 });
  };

  const askWhy = async (): Promise<void> => {
    if (!sess) return;
    const it = sess.sheet.items[sess.order[sess.idx]];
    setWhy({ busy: true, text: '', err: '', idx: sess.idx });
    try {
      const prompt =
        `Du bist ein geduldiger Deutschlehrer. Erkläre KURZ auf Persisch (Farsi), warum im folgenden Satz ` +
        `die Präposition(en) "${it.answers.join(' + ')}" richtig ist/sind:\n"${itemFull(it)}"\n` +
        `Nenne: das Verb / die Wendung, die Präposition(en) und den Kasus. Maximal 3 kurze Sätze.`;
      const t = await generateText(prompt, { timeoutMs: 30000, retries: 1 });
      setWhy({ busy: false, text: t.trim(), err: '', idx: sess.idx });
    } catch (e) {
      setWhy({ busy: false, text: '', err: describeAiError(e), idx: sess.idx });
    }
  };

  /* ── فهرست برگه‌ها ── */
  if (phase === 'pick' || !sess) {
    return (
      <div dir="rtl" className="bg-white dark:bg-[#1b2030] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-bold flex items-center gap-2"><span>📄</span><span>برگه‌های تمرین (Arbeitsblatt)</span></h3>
          {onClose && (
            <button onClick={onClose} className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">بازگشت ✕</button>
          )}
        </div>
        <p className="text-sm text-[#5d6676] dark:text-[#a3adbd] leading-7">
          همان برگه‌های کاغذی گرامر، اما جمله‌به‌جمله: هر جمله یک کارت مستقل می‌آید، جواب می‌دهی، بررسی و توضیح می‌بینی
          و می‌روی سراغ جملهٔ بعدی — نه لیست طولانی زیر هم. جاهای خالی چندتایی (مثل جملهٔ ۲ و ۴) هم پشتیبانی می‌شوند.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {SHEETS.map((sh) => {
            const p = prog[sh.id];
            return (
              <div key={sh.id} className="rounded-2xl border border-[#dde1ea] dark:border-[#333b4a] p-4 space-y-2">
                <div dir="ltr" className="font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">{sh.title}</div>
                <div className="text-xs text-[#5d6676] dark:text-[#a3adbd]">{sh.topic}</div>
                <div className="text-xs text-[#5d6676] dark:text-[#a3adbd]">
                  {toFa(sh.items.length)} جمله{p ? ` · بهترین نتیجه: ${toFa(p.best)}/${toFa(sh.items.length)}` : ''}
                </div>
                <button onClick={() => start(sh)} className="w-full py-2 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white text-sm font-bold">
                  شروع تمرین
                </button>
                {p && p.lastWrong.length > 0 && (
                  <button onClick={() => start(sh, p.lastWrong)} className="w-full py-2 rounded-xl bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 text-sm font-bold">
                    تکرار {toFa(p.lastWrong.length)} جملهٔ غلط آخرین بار
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ── صفحهٔ نتیجه ── */
  if (phase === 'done') {
    const total = sess.order.length;
    const good = sess.ok === total;
    return (
      <div dir="rtl" className="bg-white dark:bg-[#1b2030] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-5 space-y-4">
        <div className="text-center space-y-1">
          <div className="text-4xl">{good ? '🏆' : sess.ok >= total * 0.7 ? '👍' : '💪'}</div>
          <div className="text-2xl font-extrabold">{toFa(sess.ok)} / {toFa(total)}</div>
          <div className="text-sm text-[#5d6676] dark:text-[#a3adbd]">
            {good ? 'همه درست! فوق‌العاده بود.' : sess.ok >= total * 0.7 ? 'خیلی خوب بود — چند جمله را دوباره مرور کن.' : 'اشکالی ندارد؛ تمرین یعنی همین — غلط‌ها را تکرار کن.'}
          </div>
        </div>
        {sess.wrong.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-bold">جمله‌های نادرست ({toFa(sess.wrong.length)}):</div>
            {sess.wrong.map((wi) => {
              const w = sess.sheet.items[wi];
              return (
                <div key={wi} className="rounded-xl border border-[#dde1ea] dark:border-[#333b4a] p-3 space-y-1">
                  <div className="text-xs text-[#5d6676] dark:text-[#a3adbd]">جملهٔ {toFa(wi + 1)}</div>
                  <div dir="ltr" className="font-sans text-sm leading-7">
                    {w.seg.map((s, i) => (
                      <React.Fragment key={i}>
                        <span className="whitespace-pre-wrap">{s}</span>
                        {i < w.answers.length && <b className="text-emerald-600 dark:text-emerald-400 mx-0.5">{w.answers[i]}</b>}
                      </React.Fragment>
                    ))}
                  </div>
                  <div className="text-xs text-[#5d6676] dark:text-[#a3adbd]">💡 {w.note}</div>
                </div>
              );
            })}
            <button onClick={() => start(sess.sheet, sess.wrong)} className="w-full py-2 rounded-xl bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 text-sm font-bold">
              تکرار همین {toFa(sess.wrong.length)} جملهٔ غلط
            </button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => start(sess.sheet)} className="flex-1 py-2 rounded-xl bg-[#1f5fbf] text-white text-sm font-bold">از اول</button>
          <button onClick={() => { setPhase('pick'); setSess(null); }} className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">فهرست برگه‌ها</button>
        </div>
      </div>
    );
  }

  /* ── اجرای تمرین: یک جمله در هر صفحه ── */
  const it = sess.sheet.items[sess.order[sess.idx]];
  const total = sess.order.length;
  const pct = Math.round((sess.idx / total) * 100);
  const last = sess.idx + 1 >= total;
  return (
    <div dir="rtl" className="bg-white dark:bg-[#1b2030] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-bold text-[#5d6676] dark:text-[#a3adbd]">{sess.sheet.title}</div>
        <button onClick={() => { setPhase('pick'); setSess(null); }} className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">پایان ⏹</button>
      </div>

      <div>
        <div className="flex justify-between text-xs text-[#5d6676] dark:text-[#a3adbd] mb-1">
          <span>جملهٔ {toFa(sess.idx + 1)} از {toFa(total)}</span>
          <span>درست: {toFa(sess.ok)} · نادرست: {toFa(sess.wrong.length)}</span>
        </div>
        <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div dir="ltr" className="text-lg md:text-xl leading-10 font-sans text-slate-800 dark:text-slate-100">
        {it.seg.map((s, i) => (
          <React.Fragment key={i}>
            <span className="whitespace-pre-wrap">{s}</span>
            {i < it.answers.length && (() => {
              const good = checked ? checked[i] : null;
              return (
                <input
                  dir="ltr"
                  value={inputs[i] || ''}
                  onChange={(e) => { const v = e.target.value; setInputs((prev) => prev.map((x, j) => (j === i ? v : x))); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (checked) next(); else check(); } }}
                  disabled={!!checked}
                  spellCheck={false}
                  autoComplete="off"
                  className={`inline-block w-28 mx-1 px-2 py-0.5 rounded-lg border-b-2 text-center font-bold outline-none transition ${
                    good === true ? 'border-emerald-500 text-emerald-600'
                      : good === false ? 'border-red-400 text-red-500'
                        : 'border-[#1f5fbf] bg-[#f6f7fb] dark:bg-[#12151c]'}`}
                />
              );
            })()}
          </React.Fragment>
        ))}
      </div>

      {hint && !checked && (
        <div className="rounded-xl px-3 py-2 text-sm bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          راهنما — حرف اول پاسخ‌ها: <b dir="ltr">{it.answers.map((a) => a[0] + '…').join(' + ')}</b>
        </div>
      )}

      {checked && (
        <div className={`rounded-xl px-3 py-2 text-sm space-y-1 ${itemOk ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200' : 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200'}`}>
          <div>{itemOk ? '✅ درست بود!' : <>❌ نادرست — پاسخ درست: <b dir="ltr">{it.answers.join(' + ')}</b></>}</div>
          <div>💡 {it.note}</div>
        </div>
      )}

      {why.err && <div className="rounded-xl px-3 py-2 text-sm bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">{why.err}</div>}
      {why.text && why.idx === sess.idx && (
        <div className="rounded-xl px-3 py-2 text-sm bg-[#f6f7fb] dark:bg-[#12151c] leading-7 whitespace-pre-wrap">{why.text}</div>
      )}

      <div className="flex flex-wrap gap-2">
        {!checked ? (
          <>
            <button onClick={check} className="px-4 py-2 rounded-xl bg-[#1f5fbf] text-white text-sm font-bold">بررسی (Enter)</button>
            <button onClick={() => setHint(true)} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">راهنما</button>
          </>
        ) : (
          <>
            <button onClick={next} className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white text-sm font-bold">
              {last ? 'دیدن نتیجه' : 'جملهٔ بعدی ←'} (Enter)
            </button>
            <button onClick={askWhy} disabled={why.busy} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold disabled:opacity-60">
              {why.busy ? 'در حال توضیح…' : '🤖 چرا این جواب؟'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};
