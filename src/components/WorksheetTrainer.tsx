/**
 * WorksheetTrainer.tsx — برگه‌های تمرین گرامر (Arbeitsblätter)
 * همان برگه‌های کاغذی کتاب‌کاری/کلاس، اما نه به‌صورت لیست زیر هم:
 *   هر مورد یک کارت مستقل می‌آید → پاسخ → بررسی → توضیح → مورد بعدی.
 * دو نوع تمرین:
 *   1) جای‌خالی (WshItem): تایپ حرف اضافه/واژه با پاسخ مشخص؛ چند جای‌خالی پشتیبانی می‌شود.
 *   2) آزاد (WshOpenItem): توضیح واژه یا کامل‌کردن جمله با حرف ربط داده‌شده — تصحیح با هوش مصنوعی
 *      (محتوا، گرامر و جایگاه فعل) + پاسخ نمونه؛ اگر AI در دسترس نبود، خودارزیابی.
 * در پایان: صفحهٔ نتیجه + تکرار فقط موارد غلط + ذخیرهٔ بهترین رکورد.
 * محتوا از برگه‌های خود کاربر دیجیتال شده است (مطالعهٔ شخصی).
 */

import React, { useState } from 'react';
import { describeAiError, generateText } from '../utils/aiProvider';

/* ───────────── بانک برگه‌ها ───────────── */

export interface WshItem {
  /** 'gap' پیش‌فرض — جای‌خالی با پاسخ مشخص */
  kind?: 'gap';
  /** قطعه‌های جمله؛ اندیس‌های فرد جای خالی هستند */
  seg: string[];
  /** پاسخ درست هر جای خالی (به ترتیب) */
  answers: string[];
  /** توضیح کوتاه فارسی: فعل/ساختار + حرف اضافه + حالت */
  note: string;
  /** پاسخ‌های جایگزین پذیرفته برای هر جای خالی */
  alt?: string[][];
}

/** تمرین آزاد: توضیح واژه یا کامل‌کردن جمله — تصحیح با هوش مصنوعی */
export interface WshOpenItem {
  kind: 'open';
  /** بخش ثابت سؤال یا شروع جمله */
  prompt: string;
  /** حرف ربط داده‌شده (پررنگ نمایش داده می‌شود) */
  connector?: string;
  /** پاسخ نمونهٔ خوب */
  model: string;
  /** نکتهٔ کوتاه فارسی (مثلاً قاعدهٔ جایگاه فعل) */
  note: string;
}

export type WshEntry = WshItem | WshOpenItem;
export interface WshSheet { id: string; title: string; topic: string; items: WshEntry[] }

const isOpen = (it: WshEntry): it is WshOpenItem => (it as WshOpenItem).kind === 'open';

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
  {
    id: 'klasse-stadt',
    title: 'Klasse: Stadt & Verkehr (AUFGABE 2+3)',
    topic: 'Vokabeln erklären + Sätze komplettieren mit Konnektoren — برگهٔ کلاس (B1/B2)',
    items: [
      { kind: 'open', prompt: '(im Boden / in der Erde) versickern', model: 'Wenn Wasser langsam in den Boden fließt und dort verschwindet, versickert es.', note: 'versickern = فرو رفتن/نفوذ کردن آب در خاک؛ مثال: Das Regenwasser versickert im Boden.' },
      { kind: 'open', prompt: 'e Überschwemmung', model: 'Wenn es lange regnet oder ein Fluss über die Ufer tritt, stehen Straßen und Häuser unter Wasser — das ist eine Überschwemmung.', note: 'die Überschwemmung, -en = سیل («e» شروع‌شده یعنی ماده — die).' },
      { kind: 'open', prompt: 'etw. abschaffen', model: 'Eine Regel oder einen Brauch beenden, sodass es ihn nicht mehr gibt — z.B. die Parkgebühren abschaffen.', note: 'etwas abschaffen = لغو/حذف کردن چیزی.' },
      { kind: 'open', prompt: 'Zu viel Asphalt in den Städten ist ein Risiko,', connector: 'darum', model: '…, darum sollten Städte mehr Grünflächen und moderne Parkhäuser bauen.', note: 'darum/daher/trotzdem/dennoch قیدند → بعد از ویرگول جملهٔ اصلی می‌سازند و فعل بلافاصله بعد از قید می‌آید.' },
      { kind: 'open', prompt: 'Viele Autofahrer:innen möchten nicht, dass die Anzahl der Parkplätze reduziert wird,', connector: 'obwohl', model: '…, obwohl die Innenstadt ohne Autos lebenswerter und sauberer wird.', note: 'obwohl/damit حرف ربط وابسته‌سازند → جملهٔ جانبی: فعل در «انتهای» جملهٔ دوم.' },
      { kind: 'open', prompt: 'Meine Mutter braucht ihr Auto, um zur Arbeit zu kommen,', connector: 'dennoch', model: '…, dennoch unterstützt sie die neuen Park & Ride-Plätze am Stadtrand.', note: 'dennoch = قید؛ فعل بلافاصله بعد از آن (Position 2).' },
      { kind: 'open', prompt: 'Besucher:innen und Tourist:innen sollten ihre Autos am Stadtrand parken,', connector: 'damit', model: '…, damit die Innenstadt ruhiger und die Luft besser wird.', note: 'damit (هدف) = وابسته‌ساز؛ فعل در انتهای جملهٔ جانبی.' },
      { kind: 'open', prompt: 'Es ist wichtig, die Bevölkerung zu Infrastrukturprojekten zu befragen,', connector: 'damit', model: '…, damit die Projekte die Menschen wirklich erreichen.', note: 'damit (هدف) = وابسته‌ساز؛ فعل در انتها.' },
      { kind: 'open', prompt: 'Obwohl mehr als zwei Drittel der Bevölkerung für mehr Grünflächen in der Stadt sind,', model: '…, wollen viele Politiker die Parkplätze trotzdem nicht reduzieren.', note: '«Obwohl» اول جملهٔ جانبی است؛ بعد از ویرگول جملهٔ اصلی می‌آید و فعل در جایگاه ۱ می‌نشیند (فعل اول!).' },
      { kind: 'open', prompt: 'Die Parkgebühren wurden stark erhöht,', connector: 'trotzdem', model: '…, trotzdem fahren viele Menschen immer noch mit dem Auto in die Stadt.', note: 'trotzdem = قید؛ فعل بلافاصله بعد از آن.' },
      { kind: 'open', prompt: 'Die Menschen in L.A. verschwenden jährlich im Schnitt 80 Stunden bei der Parkplatzsuche,', connector: 'daher', model: '…, daher braucht die Stadt mehr Parkhäuser und bessere Verkehrsverbindungen.', note: 'daher = قید؛ فعل بلافاصله بعد از آن.' },
    ],
  },
];

/* ───────────── منطق ───────────── */

const norm = (s: string): string => s.toLowerCase().trim().replace(/\s+/g, ' ');

/** جملهٔ کامل با پاسخ‌های درست (برای AI و توضیح) */
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

interface OpenVerdict { ok: boolean | null; feedback: string; model: string }

/** استخراج JSON از پاسخ AI (با تحمل فنس کد) */
const parseVerdict = (raw: string): { ok: boolean; feedback: string; model: string } | null => {
  try {
    let s = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const m = s.match(/\{[\s\S]*\}/);
    if (m) s = m[0];
    const o = JSON.parse(s) as { ok?: unknown; feedback?: unknown; model?: unknown };
    if (o && typeof o === 'object' && 'ok' in o) {
      return { ok: !!o.ok, feedback: String(o.feedback || ''), model: String(o.model || '') };
    }
  } catch { /* ignore */ }
  return null;
};

export const WorksheetTrainer: React.FC<{ onShowToast?: (m: string) => void; onClose?: () => void }> = ({ onShowToast, onClose }) => {
  const [phase, setPhase] = useState<Phase>('pick');
  const [sess, setSess] = useState<Session | null>(null);
  const [inputs, setInputs] = useState<string[]>([]);
  const [checked, setChecked] = useState<boolean[] | null>(null); // وضعیت هر جای خالی پس از بررسی
  const [itemOk, setItemOk] = useState<boolean | null>(null);
  const [hint, setHint] = useState(false);
  const [why, setWhy] = useState<{ busy: boolean; text: string; err: string; idx: number }>({ busy: false, text: '', err: '', idx: -1 });
  const [openText, setOpenText] = useState('');
  const [openVerdict, setOpenVerdict] = useState<OpenVerdict | null>(null);
  const [openBusy, setOpenBusy] = useState(false);
  const [openModel, setOpenModel] = useState(false);
  const [prog, setProg] = useState<Record<string, SheetProg>>(() => loadProg());

  const resetItem = (): void => {
    setChecked(null); setItemOk(null); setHint(false);
    setOpenText(''); setOpenVerdict(null); setOpenBusy(false); setOpenModel(false);
    setWhy({ busy: false, text: '', err: '', idx: -1 });
  };

  const start = (sheet: WshSheet, order?: number[]): void => {
    const ord = order && order.length ? order : sheet.items.map((_, i) => i);
    const first = sheet.items[ord[0]];
    setSess({ sheet, order: ord, idx: 0, ok: 0, wrong: [] });
    setInputs(isOpen(first) ? [] : new Array(first.answers.length).fill(''));
    resetItem();
    setPhase('run');
  };

  const check = (): void => {
    if (!sess || checked) return;
    const cur = sess.sheet.items[sess.order[sess.idx]];
    if (isOpen(cur)) return;
    const res = cur.answers.map((_, g) => gapGood(cur, g, inputs[g] || ''));
    setChecked(res);
    setItemOk(res.every(Boolean));
  };

  const next = (): void => {
    if (!sess) return;
    const cur = sess.sheet.items[sess.order[sess.idx]];
    if (isOpen(cur)) { if (!openVerdict || openVerdict.ok === null) return; } else if (!checked) return;
    const good = isOpen(cur) ? openVerdict?.ok === true : itemOk === true;
    const itemIdx = sess.order[sess.idx];
    const ok = sess.ok + (good ? 1 : 0);
    const wrong = good ? sess.wrong : [...sess.wrong, itemIdx];
    if (sess.idx + 1 >= sess.order.length) {
      const p = { ...prog };
      const curP = p[sess.sheet.id] || { best: 0, lastWrong: [] };
      p[sess.sheet.id] = { best: Math.max(curP.best, ok), lastWrong: wrong };
      setProg(p); saveProg(p);
      setSess({ ...sess, idx: sess.idx + 1, ok, wrong });
      setPhase('done');
      onShowToast?.(`نتیجهٔ برگه ذخیره شد: ${ok} از ${sess.order.length}`);
      return;
    }
    const nItem = sess.sheet.items[sess.order[sess.idx + 1]];
    setSess({ ...sess, idx: sess.idx + 1, ok, wrong });
    setInputs(isOpen(nItem) ? [] : new Array(nItem.answers.length).fill(''));
    resetItem();
  };

  const askWhy = async (it: WshItem): Promise<void> => {
    if (!sess) return;
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

  const checkOpen = async (): Promise<void> => {
    if (!sess || openBusy) return;
    const cur = sess.sheet.items[sess.order[sess.idx]];
    if (!isOpen(cur) || !openText.trim()) return;
    const it = cur;
    setOpenBusy(true);
    try {
      const prompt =
        `Du bist ein geduldiger Deutschlehrer (Niveau B1/B2). Der Lerner löst eine Aufgabe vom Arbeitsblatt.\n` +
        `Aufgabe/Anfang: "${it.prompt}"\n` +
        (it.connector ? `Vorgegebener Konnektor: "${it.connector}"\n` : '') +
        `Antwort des Lerners: "${openText.trim()}"\n` +
        (it.connector
          ? `Prüfe Inhalt, Grammatik und die korrekte Verwendung des Konnektors (Wortstellung! Konnektoren wie "darum/daher/trotzdem/dennoch" sind Adverbien: direkt danach kommt das Verb (Position 2); "obwohl/damit" leiten einen Nebensatz ein: Verb am Ende).\n`
          : `Prüfe, ob die Antwort die Aufgabe (Worterklärung) sinnvoll und grammatikalisch korrekt erfüllt.\n`) +
        `Antworte NUR mit JSON: {"ok": true|false, "feedback": "<2-3 kurze Sätze auf Persisch (Farsi): Fehler + Regel>", "model": "<eine gute Modellantwort auf Deutsch>"}`;
      const t = await generateText(prompt, { json: true, timeoutMs: 45000, retries: 1 });
      const v = parseVerdict(t);
      if (v) setOpenVerdict({ ok: v.ok, feedback: v.feedback, model: v.model || it.model });
      else setOpenVerdict({ ok: null, feedback: '', model: it.model });
    } catch (e) {
      setOpenVerdict({ ok: null, feedback: describeAiError(e), model: it.model });
    }
    setOpenBusy(false);
  };

  const selfCheck = (ok: boolean): void => {
    const cur = sess ? sess.sheet.items[sess.order[sess.idx]] : null;
    if (!cur || !isOpen(cur)) return;
    setOpenVerdict((v) => ({
      ok,
      feedback: ok ? 'خودت تأیید کردی — آفرین.' : 'خودت نادرست علامت زدی؛ پاسخ نمونه را خوب ببین.',
      model: (v && v.model) || cur.model,
    }));
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
          هر جمله/سؤال یک کارت مستقل می‌آید، جواب می‌دهی، بررسی و توضیح می‌بینی
          و می‌روی سراغ مورد بعدی — نه لیست طولانی زیر هم. دو نوع تمرین دارد: جای‌خالی با پاسخ مشخص و تمرین آزاد
          (توضیح واژه، کامل‌کردن جمله با حرف ربط) با تصحیح هوش مصنوعی و پاسخ نمونه.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {SHEETS.map((sh) => {
            const p = prog[sh.id];
            return (
              <div key={sh.id} className="rounded-2xl border border-[#dde1ea] dark:border-[#333b4a] p-4 space-y-2">
                <div dir="ltr" className="font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">{sh.title}</div>
                <div className="text-xs text-[#5d6676] dark:text-[#a3adbd]">{sh.topic}</div>
                <div className="text-xs text-[#5d6676] dark:text-[#a3adbd]">
                  {toFa(sh.items.length)} مورد{p ? ` · بهترین نتیجه: ${toFa(p.best)}/${toFa(sh.items.length)}` : ''}
                </div>
                <button onClick={() => start(sh)} className="w-full py-2 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white text-sm font-bold">
                  شروع تمرین
                </button>
                {p && p.lastWrong.length > 0 && (
                  <button onClick={() => start(sh, p.lastWrong)} className="w-full py-2 rounded-xl bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 text-sm font-bold">
                    تکرار {toFa(p.lastWrong.length)} مورد غلط آخرین بار
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
            {good ? 'همه درست! فوق‌العاده بود.' : sess.ok >= total * 0.7 ? 'خیلی خوب بود — چند مورد را دوباره مرور کن.' : 'اشکالی ندارد؛ تمرین یعنی همین — غلط‌ها را تکرار کن.'}
          </div>
        </div>
        {sess.wrong.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-bold">مورد نادرست ({toFa(sess.wrong.length)}):</div>
            {sess.wrong.map((wi) => {
              const w = sess.sheet.items[wi];
              if (isOpen(w)) {
                return (
                  <div key={wi} className="rounded-xl border border-[#dde1ea] dark:border-[#333b4a] p-3 space-y-1">
                    <div className="text-xs text-[#5d6676] dark:text-[#a3adbd]">مورد {toFa(wi + 1)}</div>
                    <div dir="ltr" className="font-sans text-sm leading-7">
                      {w.prompt} {w.connector && <b className="text-[#6b4fd8] dark:text-[#a68bff]">{w.connector}</b>} <span className="text-[#9aa3b2]">______</span>
                    </div>
                    <div dir="ltr" className="text-sm leading-7 text-emerald-700 dark:text-emerald-300">✓ {w.model}</div>
                    <div className="text-xs text-[#5d6676] dark:text-[#a3adbd]">💡 {w.note}</div>
                  </div>
                );
              }
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
              تکرار همین {toFa(sess.wrong.length)} مورد غلط
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

  /* ── اجرای تمرین: یک مورد در هر صفحه ── */
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
          <span>{isOpen(it) ? 'مورد' : 'جملهٔ'} {toFa(sess.idx + 1)} از {toFa(total)}</span>
          <span>درست: {toFa(sess.ok)} · نادرست: {toFa(sess.wrong.length)}</span>
        </div>
        <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {isOpen(it) ? (
        <>
          <div dir="ltr" className="text-lg md:text-xl leading-9 font-sans text-slate-800 dark:text-slate-100">
            <span className="whitespace-pre-wrap">{it.prompt} </span>
            {it.connector && <b className="text-[#6b4fd8] dark:text-[#a68bff]">{it.connector}</b>}
            <span className="text-[#9aa3b2]"> ______</span>
          </div>
          <textarea
            dir="ltr"
            rows={3}
            value={openText}
            onChange={(e) => setOpenText(e.target.value)}
            disabled={!!openVerdict && openVerdict.ok !== null}
            spellCheck={false}
            placeholder="پاسخ خود را به آلمانی بنویسید…"
            className="w-full rounded-xl border border-[#dde1ea] dark:border-[#333b4a] bg-[#f6f7fb] dark:bg-[#12151c] p-3 font-sans text-base outline-none focus:border-[#1f5fbf] disabled:opacity-70"
          />
          {openModel && (
            <div className="rounded-xl px-3 py-2 text-sm bg-[#f6f7fb] dark:bg-[#12151c] leading-7">
              پاسخ نمونه: <b dir="ltr">{it.model}</b>
            </div>
          )}
          {openVerdict && openVerdict.ok === true && (
            <div className="rounded-xl px-3 py-2 text-sm space-y-1 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
              <div>✅ {openVerdict.feedback || 'پاسخ قابل قبول بود!'}</div>
              <div dir="ltr" className="leading-7">پاسخ نمونه: <b>{openVerdict.model}</b></div>
            </div>
          )}
          {openVerdict && openVerdict.ok === false && (
            <div className="rounded-xl px-3 py-2 text-sm space-y-1 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200">
              <div>❌ {openVerdict.feedback}</div>
              <div dir="ltr" className="leading-7">پاسخ بهتر: <b>{openVerdict.model}</b></div>
              <div>💡 {it.note}</div>
            </div>
          )}
          {openVerdict && openVerdict.ok === null && (
            <div className="rounded-xl px-3 py-2 text-sm space-y-2 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <div>{openVerdict.feedback || 'بررسی هوش مصنوعی در دسترس نبود.'}</div>
              <div dir="ltr" className="leading-7">پاسخ نمونه: <b>{openVerdict.model}</b></div>
              <div>خودت با پاسخ نمونه مقایسه کن و بگو:</div>
              <div className="flex gap-2">
                <button onClick={() => selfCheck(true)} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold">درست بود ✓</button>
                <button onClick={() => selfCheck(false)} className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-bold">نادرست بود ✗</button>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {!(openVerdict && openVerdict.ok !== null) ? (
              <>
                <button onClick={checkOpen} disabled={openBusy || !openText.trim()} className="px-4 py-2 rounded-xl bg-[#1f5fbf] text-white text-sm font-bold disabled:opacity-60">
                  {openBusy ? 'در حال بررسی…' : 'بررسی با AI 🤖'}
                </button>
                <button onClick={() => setOpenModel(true)} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold">پاسخ نمونه 💡</button>
              </>
            ) : (
              <button onClick={next} className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white text-sm font-bold">
                {last ? 'دیدن نتیجه' : 'مورد بعدی ←'}
              </button>
            )}
          </div>
        </>
      ) : (
        <>
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
                <button onClick={() => askWhy(it)} disabled={why.busy} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-bold disabled:opacity-60">
                  {why.busy ? 'در حال توضیح…' : '🤖 چرا این جواب؟'}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};
