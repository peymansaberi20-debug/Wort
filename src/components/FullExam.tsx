import React, { useState } from 'react';
import { LesenTrainer } from './LesenTrainer';
import { HoerenTrainer } from './HoerenTrainer';
import { SchreibenCorrector } from './SchreibenCorrector';
import { SprechenTrainer } from './SprechenTrainer';
import { EXAM_HISTORY, ExamRun, SKILLS, Skill, SkillResult, loadList, minutesFor, saveList } from '../utils/trainerKit';
import { LevelChips } from './trainerUI';
import type { Word } from '../types';

type Org = 'ÖSD' | 'Goethe' | 'telc' | 'EPD';
interface HistoryRec { id: string; date: string; org: Org; level: string; results: Partial<Record<Skill, SkillResult>>; avg: number }

/** Order of the real Goethe / ÖSD exams. */
const ORDER: Skill[] = ['lesen', 'hoeren', 'schreiben', 'sprechen'];
const pct = (r?: SkillResult) => (r && r.max > 0 ? Math.round((r.score / r.max) * 100) : 0);

interface Props {
  onShowToast: (m: string, e?: boolean) => void;
  onQuickAddWord?: (w: Partial<Word>) => boolean;
  onExit: () => void;
}

export const FullExam: React.FC<Props> = ({ onShowToast, onQuickAddWord, onExit }) => {
  const [phase, setPhase] = useState<'setup' | 'running' | 'between' | 'done'>('setup');
  const [org, setOrg] = useState<Org>('Goethe');
  const [level, setLevel] = useState('B1');
  const [stage, setStage] = useState(0);
  const [results, setResults] = useState<Partial<Record<Skill, SkillResult>>>({});
  const [history, setHistory] = useState<HistoryRec[]>(() => loadList<HistoryRec>(EXAM_HISTORY));
  const levels = org === 'EPD' ? ['B2', 'C1'] : ['A1', 'A2', 'B1', 'B2', 'C1'];
  const card = 'bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4';
  const totalMin = ORDER.reduce((a, s) => a + minutesFor(level, s), 0);

  const start = () => { setResults({}); setStage(0); setPhase('running'); };
  const abort = () => { if (window.confirm('آزمون نیمه‌کاره رها شود؟ نتیجه‌ای ذخیره نمی‌شود.')) setPhase('setup'); };

  const finishSkill = (skill: Skill, r: SkillResult) => {
    const next = { ...results, [skill]: r };
    setResults(next);
    if (stage >= ORDER.length - 1) {
      const avg = Math.round(ORDER.reduce((a, s) => a + pct(next[s]), 0) / ORDER.length);
      const rec: HistoryRec = { id: 'fe_' + Date.now(), date: new Date().toLocaleDateString('de-AT'), org, level, results: next, avg };
      const list = [rec, ...history].slice(0, 30);
      setHistory(list); saveList(EXAM_HISTORY, list);
      setPhase('done');
    } else setPhase('between');
  };

  const run = (skill: Skill): ExamRun => ({ org, level, minutes: minutesFor(level, skill), onFinish: r => finishSkill(skill, r) });

  if (phase === 'setup') {
    return (
      <div className="space-y-4 text-right" dir="rtl">
        <div className={card + ' space-y-4'}>
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-base">🏁 آزمون شبیه‌سازی کامل (۴ مهارت)</h3>
            <button onClick={onExit} className="px-3 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">↩ بازگشت</button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-[13px] font-bold mb-1">نوع آزمون</label>
              <select value={org} onChange={e => { const o = e.target.value as Org; setOrg(o); if (o === 'EPD' && !['B2', 'C1'].includes(level)) setLevel('B2'); }} className="w-full bg-slate-50 dark:bg-[#141923] border rounded-xl px-3 py-2.5 text-sm font-bold">
                <option value="Goethe">Goethe-Zertifikat</option><option value="ÖSD">ÖSD</option><option value="telc">telc Deutsch</option><option value="EPD">EPD (دانشگاهی وین)</option>
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-bold mb-1">سطح</label>
              <LevelChips value={level} onChange={l => setLevel(l)} levels={levels} />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center text-[11px] font-bold">
            {ORDER.map(s => { const m = SKILLS.find(x => x.id === s)!; return (
              <div key={s} className="rounded-xl bg-slate-50 dark:bg-slate-800/60 py-2.5"><div className="text-xl">{m.icon}</div><div>{m.label}</div><div className="text-[#1f5fbf]" dir="ltr">{minutesFor(level, s)} min</div></div>
            ); })}
          </div>
          <ul className="text-xs leading-7 list-disc pr-5 text-[#5d6676] dark:text-[#a3adbd]">
            <li>ترتیب مثل آزمون واقعی: Lesen ← Hören ← Schreiben ← Sprechen (جمعاً حدود {totalMin} دقیقه؛ زمان‌ها تقریبی و نزدیک به آزمون رسمی).</li>
            <li>هر بخش تایمر واقعی دارد و هیچ‌وقت متوقف نمی‌شود؛ با تمام‌شدن زمان، بخش خودکار ثبت می‌شود.</li>
            <li>بدون ترجمهٔ فارسی، بدون راهنما و بدون ترجمهٔ فوری واژه.</li>
            <li>در Hören هر متن فقط ۲ بار پخش می‌شود و متن تا پایان مخفی است.</li>
            <li>نتیجهٔ همهٔ بخش‌ها در پایان نمایش داده می‌شود؛ خطاها در «دفتر خطاها» ذخیره می‌شوند.</li>
            <li>قبل از شروع اینترنت پایدار و میکروفون (برای Sprechen) را آماده کن.</li>
          </ul>
          <button onClick={start} className="w-full bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white py-3.5 rounded-xl font-bold text-sm shadow-md">شروع آزمون 🚀</button>
        </div>

        {history.length > 0 && (
          <div className={card + ' space-y-2'}>
            <div className="font-bold text-sm">📈 آزمون‌های قبلی</div>
            {history.slice(0, 6).map(h => (
              <div key={h.id} className="flex items-center justify-between text-xs p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                <span dir="ltr">{h.date} · {h.org} {h.level}</span>
                <span className="font-bold" dir="ltr">{ORDER.map(s => `${s[0].toUpperCase()}${pct(h.results[s])}`).join(' ')} · <span className={h.avg >= 60 ? 'text-emerald-600' : 'text-rose-600'}>{h.avg}%</span></span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const skill = ORDER[stage];
  const meta = SKILLS.find(s => s.id === skill)!;

  if (phase === 'between') {
    const prev = ORDER[stage];
    const next = ORDER[stage + 1];
    const nm = SKILLS.find(s => s.id === next)!;
    return (
      <div className={card + ' text-center space-y-4'} dir="rtl">
        <span className="text-4xl">✅</span>
        <h3 className="font-extrabold">بخش {SKILLS.find(s => s.id === prev)!.label} ثبت شد</h3>
        <p className="text-sm text-[#5d6676]">کمی استراحت کن. تا دکمهٔ زیر را نزنی تایمر بخش بعد شروع نمی‌شود.</p>
        <button onClick={() => { setStage(stage + 1); setPhase('running'); }} className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white font-bold text-sm">
          شروع {nm.icon} {nm.label} ({minutesFor(level, next)} دقیقه) ▶
        </button>
      </div>
    );
  }

  if (phase === 'done') {
    const avg = Math.round(ORDER.reduce((a, s) => a + pct(results[s]), 0) / ORDER.length);
    return (
      <div className={card + ' space-y-4 text-right'} dir="rtl">
        <div className="text-center space-y-1 border-b pb-4">
          <span className="text-4xl">🏆</span>
          <h3 className="font-extrabold">کارنامهٔ آزمون {org} {level}</h3>
          <div className={`text-2xl font-black ${avg >= 60 ? 'text-emerald-600' : 'text-rose-600'}`} dir="ltr">{avg}% — {avg >= 60 ? 'قبول ✓' : 'نیاز به تلاش بیشتر'}</div>
          <div className="text-[11px] text-[#5d6676]">معیار قبولی هر مهارت ۶۰٪ است.</div>
        </div>
        <div className="space-y-2">
          {ORDER.map(s => {
            const m = SKILLS.find(x => x.id === s)!; const r = results[s]; const p = pct(r);
            return (
              <div key={s} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 space-y-1">
                <div className="flex items-center justify-between text-sm font-bold">
                  <span>{m.icon} {m.label}</span>
                  <span dir="ltr" className={p >= 60 ? 'text-emerald-600' : 'text-rose-600'}>{r ? `${Math.round(r.score * 10) / 10}/${r.max}` : '—'} ({p}%) {p >= 60 ? '✓' : '✗'}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"><div className={`h-full ${p >= 60 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${p}%` }} /></div>
                {r?.note && <div className="text-xs leading-6 text-[#5d6676] dark:text-[#a3adbd]">{r.note}</div>}
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-[#5d6676]">خطاهای Hören، Schreiben و Sprechen به «دفتر خطاها» اضافه شد؛ از آنجا «مرور خطاهای این هفته» را بزن.</p>
        <button onClick={() => setPhase('setup')} className="w-full bg-[#1f5fbf] text-white py-3 rounded-xl font-bold text-sm">بازگشت 🔄</button>
      </div>
    );
  }

  // running
  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-100 dark:bg-slate-800">
        <b className="text-sm">{meta.icon} بخش {stage + 1} از {ORDER.length} — {meta.label}</b>
        <button onClick={abort} className="px-3 py-1 rounded-xl bg-white dark:bg-slate-700 text-xs font-bold text-rose-600">خروج</button>
      </div>
      {skill === 'lesen' && <LesenTrainer key="lesen" onClose={() => undefined} onShowToast={onShowToast} exam={run('lesen')} />}
      {skill === 'hoeren' && <HoerenTrainer key="hoeren" onClose={() => undefined} onQuickAddWord={onQuickAddWord} exam={run('hoeren')} />}
      {skill === 'schreiben' && <SchreibenCorrector key="schreiben" variant="pruefung" onShowToast={onShowToast} exam={run('schreiben')} />}
      {skill === 'sprechen' && <SprechenTrainer key="sprechen" onClose={() => undefined} onShowToast={onShowToast} exam={run('sprechen')} />}
    </div>
  );
};
