import React, { useState } from 'react';
import { AppState, Word } from '../types';
import { fullWord } from '../utils/storage';

const buildAnkiText = (ws: Word[]): string => {
  const rows = ws.map(w => {
    const front = fullWord(w);
    const backParts: string[] = [];
    if (w.fa) backParts.push(`<b>${w.fa}</b>`);
    if (w.en) backParts.push(`🇬🇧 ${w.en}`);
    if (w.pl) backParts.push(`📐 Plural: ${w.pl}`);
    if (w.ex2) backParts.push(`💬 ${w.ex2}`);
    if (w.ex) backParts.push(`📖 ${w.ex}`);
    const grammar: string[] = [];
    if (w.conj) grammar.push(`Präsens: ${w.conj.split('|').join(', ')}`);
    if (w.prat) grammar.push(`Präteritum: ${w.prat}`);
    if (w.perf) grammar.push(`Perfekt: ${w.perf}`);
    if (w.sep) grammar.push(`trennbar: ${w.sep}-`);
    if (grammar.length) backParts.push(`🔧 ${grammar.join(' • ')}`);
    if (w.notes) backParts.push(`📝 ${w.notes.split('\n').join('<br>')}`);
    const tags = [w.cat, w.lvl].filter(Boolean).join(' ');
    const esc = (s: string) => s.replace(/\t/g, ' ').replace(/\n/g, '<br>');
    return `${esc(front)}\t${esc(backParts.join('<br>'))}\t${esc(tags)}`;
  });
  return '\ufeff' + ['#separator:tab', '#html:true', ...rows].join('\n');
};

const downloadFile = (filename: string, content: string, type: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1000);
};

const wordsToCSV = (ws: Word[]): string => {
  const headers = [
    'id',
    'german',
    'article',
    'persian',
    'synonym',
    'synonymTranslation',
    'antonym',
    'antonymTranslation',
    'plural',
    'partOfSpeech',
    'level',
    'example',
    'exampleTranslation',
    'example2',
    'example2Translation',
    'conjugation',
    'preteritum',
    'perfekt',
    'separablePrefix',
    'clozeSentence',
    'clozeAnswer',
    'acceptedAnswers',
    'tags',
    'notes',
    'category'
  ];
  const esc = (v: any) => {
    const s = String(v == null ? '' : v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = ws.map(w =>
    [
      w.id,
      w.de,
      w.art,
      w.fa,
      w.syn,
      w.synFa,
      w.ant,
      w.antFa,
      w.pl,
      w.pos,
      w.lvl,
      w.ex,
      w.exFa,
      w.ex2,
      w.ex2Fa,
      w.conj,
      w.prat,
      w.perf,
      w.sep,
      w.cloze,
      w.ans,
      w.acc?.join('|') || '',
      w.tags,
      w.notes,
      w.cat
    ]
      .map(esc)
      .join(',')
  );
  return '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
};

const LAST_KEY = 'wb_last_backup';
const getLast = (): number => { try { return Number(localStorage.getItem(LAST_KEY) || 0); } catch { return 0; } };
const dateTag = () => new Date().toISOString().slice(0, 10);
const rel = (t: number) => {
  if (!t) return 'هنوز پشتیبان نگرفته‌ای';
  const d = Math.floor((Date.now() - t) / 86400000);
  return d <= 0 ? 'امروز' : d === 1 ? 'دیروز' : `${d} روز پیش`;
};
const card = 'bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 shadow-xs';
const histCount = (s: any) => Array.isArray(s?.hist) ? s.hist.length : Object.keys(s?.hist || {}).length;
const catCount = (ws: any[]) => new Set((ws || []).map(w => w?.cat).filter(Boolean)).size;

const Stat: React.FC<{ icon: string; value: React.ReactNode; label: string }> = ({ icon, value, label }) => (
  <div className="flex-1 min-w-0 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-[#e6e9f0] dark:border-[#2a3140] py-2.5 text-center">
    <div className="text-xl leading-none">{icon}</div>
    <div className="font-extrabold text-base mt-1" dir="ltr">{value}</div>
    <div className="text-[10px] text-[#5d6676] dark:text-[#a3adbd]">{label}</div>
  </div>
);

export const BackupPanel: React.FC<{ state: AppState; words: Word[]; onShowToast: (m: string, e?: boolean) => void }> = ({ state, words, onShowToast }) => {
  const [last, setLast] = useState<number>(getLast());
  const days = (state as any)?.set?.bkDays || 0;
  const overdue = !last || (days > 0 && Date.now() - last > days * 86400000);
  const stamp = () => { const t = Date.now(); try { localStorage.setItem(LAST_KEY, String(t)); } catch { /* ignore */ } setLast(t); };
  const json = () => JSON.stringify(state, null, 2);
  const doJson = () => { downloadFile(`worterbuch_backup_${dateTag()}.json`, json(), 'application/json'); stamp(); onShowToast('پشتیبان کامل ذخیره شد.'); };
  const doShare = async () => {
    try {
      const file = new File([json()], `worterbuch_backup_${dateTag()}.json`, { type: 'application/json' });
      const nav: any = navigator;
      if (nav.canShare && nav.canShare({ files: [file] })) { await nav.share({ files: [file], title: 'WörterBuch backup' }); stamp(); }
      else doJson();
    } catch (e: any) { if (e?.name !== 'AbortError') onShowToast('اشتراک‌گذاری ممکن نشد؛ از دکمهٔ دانلود استفاده کن.', true); }
  };
  const canShare = typeof navigator !== 'undefined' && !!(navigator as any).share;
  const rows: { icon: string; title: string; desc: string; run: () => void }[] = [
    { icon: '📊', title: 'واژگان (CSV)', desc: 'برای باز کردن در اکسل', run: () => downloadFile(`deutschlab_vocab_${dateTag()}.csv`, wordsToCSV(words), 'text/csv') },
    { icon: '🃏', title: 'کارت‌های Anki', desc: `${words.length} کارت — در Anki: File ← Import`, run: () => { downloadFile('worterbuch_anki_deck.txt', buildAnkiText(words), 'text/plain;charset=utf-8'); onShowToast(`${words.length} کارت Anki ساخته شد.`); } },
    { icon: '📈', title: 'تاریخچهٔ مرور (JSON)', desc: 'فقط سابقهٔ مرور و آمار', run: () => downloadFile(`deutschlab_history_${dateTag()}.json`, JSON.stringify((state as any).hist, null, 2), 'application/json') }
  ];
  return (
    <div className="space-y-4 text-right">
      <div className={`${card} ${overdue ? 'border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-950/20' : ''}`}>
        <div className="flex items-center gap-3">
          <span className="text-3xl">{overdue ? '⏰' : '✅'}</span>
          <div className="min-w-0">
            <div className="font-extrabold text-sm">آخرین پشتیبان: {rel(last)}</div>
            <div className="text-[11px] text-[#5d6676] dark:text-[#a3adbd]">{overdue ? 'پیشنهاد می‌شود همین حالا یک نسخهٔ پشتیبان بگیری.' : 'داده‌های تو امن است.'}</div>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <Stat icon="📚" value={words.length} label="واژه" />
          <Stat icon="🗂" value={catCount(words)} label="دسته" />
          <Stat icon="📈" value={histCount(state)} label="سابقهٔ مرور" />
        </div>
      </div>

      <div className={card + ' space-y-2.5'}>
        <div className="font-bold text-sm">💾 پشتیبان کامل</div>
        <p className="text-[11px] leading-6 text-[#5d6676] dark:text-[#a3adbd]">شامل همهٔ واژگان، تاریخچهٔ مرور و تنظیمات. این فایل را در Drive، ایمیل یا حافظهٔ گوشی نگه دار.</p>
        <button onClick={doJson} className="w-full h-12 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white font-bold text-sm shadow-md active:scale-[.99] transition">⬇️ دانلود پشتیبان کامل (JSON)</button>
        {canShare && <button onClick={doShare} className="w-full h-11 rounded-xl border border-[#1f5fbf] text-[#1f5fbf] dark:text-blue-300 font-bold text-sm">📤 ارسال / ذخیره در برنامهٔ دیگر</button>}
      </div>

      <div className={card + ' !p-0 overflow-hidden'}>
        <div className="px-4 pt-3 pb-1 text-[11px] font-bold text-[#5d6676] dark:text-[#a3adbd]">خروجی‌های دیگر</div>
        {rows.map(r => (
          <button key={r.title} onClick={r.run} className="w-full flex items-center gap-3 px-4 py-3 border-t border-[#eef0f5] dark:border-[#2a3140] text-right hover:bg-slate-50 dark:hover:bg-slate-800/60 transition">
            <span className="text-2xl w-8 text-center">{r.icon}</span>
            <span className="flex-1 min-w-0"><span className="block font-bold text-sm">{r.title}</span><span className="block text-[11px] text-[#5d6676] dark:text-[#a3adbd] truncate">{r.desc}</span></span>
            <span className="text-[#1f5fbf] text-sm font-bold">دانلود</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export const RestorePanel: React.FC<{ state: AppState; onRestore: (s: AppState) => void; onShowToast: (m: string, e?: boolean) => void }> = ({ state, onRestore, onShowToast }) => {
  const [pending, setPending] = useState<any>(null);
  const [name, setName] = useState('');
  const [ack, setAck] = useState(false);
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    try {
      const parsed = JSON.parse(await f.text());
      if (!parsed || !Array.isArray(parsed.words)) throw new Error('این فایل، پشتیبان کامل برنامه نیست. باید فایل JSON «پشتیبان کامل» باشد.');
      setPending(parsed); setName(f.name); setAck(false);
    } catch (err: any) { setPending(null); onShowToast(err?.message || 'فایل نامعتبر است.', true); }
  };
  const saveCurrent = () => { downloadFile(`worterbuch_backup_before_restore_${dateTag()}.json`, JSON.stringify(state, null, 2), 'application/json'); try { localStorage.setItem(LAST_KEY, String(Date.now())); } catch { /* ignore */ } onShowToast('نسخهٔ فعلی ذخیره شد.'); };
  const cur: any = state;
  return (
    <div className="space-y-4 text-right">
      <div className={card + ' space-y-3'}>
        <div className="font-bold text-sm">♻️ بازیابی از فایل پشتیبان</div>
        <p className="text-[11px] leading-6 text-[#5d6676] dark:text-[#a3adbd]">فایل JSON پشتیبان کامل را انتخاب کن. قبل از جایگزینی، خلاصهٔ آن را می‌بینی.</p>
        <label className="flex flex-col items-center justify-center gap-1 h-28 rounded-2xl border-2 border-dashed border-[#1f5fbf] text-[#1f5fbf] dark:text-blue-300 font-bold text-sm cursor-pointer active:scale-[.99] transition">
          <span className="text-3xl">📂</span>
          <span>{name || 'انتخاب فایل پشتیبان (.json)'}</span>
          <input type="file" accept=".json,application/json" className="hidden" onChange={onFile} />
        </label>
      </div>

      {pending && (
        <div className={card + ' space-y-3 border-amber-300 dark:border-amber-700'}>
          <div className="font-bold text-sm">خلاصهٔ فایل انتخاب‌شده</div>
          <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 py-2"><div className="font-extrabold text-base" dir="ltr">{pending.words.length}</div>واژه در پشتیبان</div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 py-2"><div className="font-extrabold text-base" dir="ltr">{catCount(pending.words)}</div>دسته</div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 py-2"><div className="font-extrabold text-base" dir="ltr">{cur.words.length}</div>واژهٔ فعلی</div>
          </div>
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3 text-[12px] leading-6 text-amber-900 dark:text-amber-200">
            ⚠️ با بازیابی، همهٔ واژگان، تاریخچه و تنظیمات فعلی با محتوای این فایل جایگزین می‌شود.
          </div>
          <button onClick={saveCurrent} className="w-full h-10 rounded-xl border border-[#dde1ea] dark:border-[#333b4a] text-sm font-bold">💾 اول از داده‌های فعلی پشتیبان بگیر</button>
          <label className="flex items-center gap-2.5 text-sm font-bold cursor-pointer">
            <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} className="w-5 h-5 accent-[#6b4fd8]" />
            <span>می‌دانم که داده‌های فعلی جایگزین می‌شود</span>
          </label>
          <button disabled={!ack} onClick={() => onRestore(pending)} className="w-full h-12 rounded-xl bg-gradient-to-r from-[#6b4fd8] to-[#1f5fbf] text-white font-bold text-sm disabled:opacity-40">♻️ بازیابی کامل</button>
        </div>
      )}
    </div>
  );
};
