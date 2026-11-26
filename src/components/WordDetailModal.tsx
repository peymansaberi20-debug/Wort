import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Word, WordStatus } from '../types';
import { dueText } from '../utils/dates';
import { speak } from '../utils/audio';
import { P6 } from '../data/seed';
import { isLeech, isVerbPos, leechRecoveryProgress } from '../utils/storage';
import { splitConj } from '../utils/conjugation';
import { ConjugatedForm, ConjugationLegend } from './ConjugatedForm';
import { IconBtn } from './IconBtn';
import { ShadowingModal } from './ShadowingModal';
import { ImageCropper } from './ImageCropper';
import { PratText } from './PratText';
import { VerbPhrase, verbPrepFor } from './VerbPhrase';
import { hasHeadAnnotation } from '../data/verbPrep';
import { X, Pencil, Trash2, Mic, Sparkles, Volume2, Eye, EyeOff, Camera } from 'lucide-react';
import {
  statusOf, clusterOf, clusterGuide, promotionReady, activationReady, PROMO_STREAK, AKT_STREAK,
  STATUS_LABELS, STATUS_SHORT, STATUS_BADGE, STATUS_BADGE_HERO, STATUS_HINTS,
  WORD_STATUSES, REGISTER_OPTIONS, REGISTER_LABELS,
} from '../utils/wordStatus';

interface WordDetailModalProps {
  word: Word | null;
  /** همهٔ واژگان کتابخانه — برای یافتن اعضای خوشهٔ مترادف */
  words?: Word[];
  /** آستانهٔ خطای واژهٔ سخت از تنظیمات (leechN) — فاز ۵: به‌جای عدد ثابت ۴ */
  leechN?: number;
  /** اعمال تغییرات وضعیت/رجیستر/خوشه بدون باز کردن فرم ویرایش */
  onPatchWord?: (word: Word, patch: Partial<Word>) => void;
  onClose: () => void;
  onEdit: (word: Word) => void;
  onDelete: (word: Word) => void;
  onImageChange: (word: Word, newImg: string) => void;
}

export const WordDetailModal: React.FC<WordDetailModalProps> = ({
  word,
  words = [],
  leechN = 4,
  onPatchWord,
  onClose,
  onEdit,
  onDelete,
  onImageChange
}) => {
  const [showFa, setShowFa] = useState(false);
  const [shadowOpen, setShadowOpen] = useState(false);

  /* درخواست فاز ۴ #۲: عنوان طولانی هیرو خودکار کوچک می‌شود تا در یک خط جا شود */
  const heroWordRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const sp = heroWordRef.current;
    if (!sp || !word) return;
    const md = window.innerWidth >= 768;
    const len = word.de.length + (word.art ? word.art.length + 1 : 0);
    let base = md ? 36 : 30; // text-4xl / text-3xl
    if (len > 32) base = md ? 19 : 16;
    else if (len > 24) base = md ? 24 : 20;
    else if (len > 15) base = md ? 30 : 25;
    const fit = () => {
      let s = base;
      sp.style.fontSize = s + 'px';
      sp.style.whiteSpace = 'nowrap';
      const parent = sp.parentElement;
      const max = parent ? parent.clientWidth - 100 : sp.clientWidth; // جای آیکن‌ها + آرتیکل
      let guard = 0;
      while (s > 13 && sp.scrollWidth > max && guard++ < 40) {
        s -= 1;
        sp.style.fontSize = s + 'px';
      }
      if (s <= 13) sp.style.whiteSpace = ''; // واژهٔ فوق‌طولانی: شکستن خط بهتر از بریده‌شدن است
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [word?.de, word?.art]);

  /* درخواست فاز ۴ #۱: حرف اضافهٔ خودکار فعل — warten auf (A) / sich entscheiden für (A) */
  const heroVP = word && (isVerbPos(word.pos) || hasHeadAnnotation(word.de)) ? verbPrepFor(word.de) : null;
  // پاپ‌اپ تنظیمات واژه (سطح تسلط، رجیستر، خوشهٔ مترادف) — با ستارهٔ نوار آیکون باز می‌شود؛
  // بستنش فقط همین پاپ‌اپ را می‌بندد و پروفایل واژه زیر آن باز می‌ماند
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingImg, setPendingImg] = useState<string | null>(null); // picked photo waiting for crop
  const [clusterDraft, setClusterDraft] = useState(''); // فاز ۱: پیش‌نویس فیلد خوشهٔ مترادف

  // Hide every Persian translation whenever the active word changes or the modal closes.
  useEffect(() => {
    setShowFa(false);
    setSettingsOpen(false);
    setClusterDraft(word?.synCluster || '');
  }, [word?.id]);

  if (!word) return null;

  const handlePickImage = () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => setPendingImg(reader.result as string); // crop first, save on confirm
      reader.readAsDataURL(file);
    };
    fileInput.click();
  };

  // cropped dataURL -> max 800 px long edge, JPEG 0.8, then store on the word
  const saveCropped = (dataUrl: string) => {
    setPendingImg(null);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 800 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) { onImageChange(word, dataUrl); return; }
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      onImageChange(word, canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => onImageChange(word, dataUrl);
    img.src = dataUrl;
  };

  const articleBadge = () => {
    if (!word.art) return null;
    const colors: Record<string, string> = {
      der: 'bg-[#dbe9ff] text-[#0b3d91] dark:bg-[#1c3258] dark:text-[#a9ccff]',
      die: 'bg-[#ffe0e3] text-[#a1122b] dark:bg-[#4a1f28] dark:text-[#ffb3bf]',
      das: 'bg-[#dff5e3] text-[#0b6b2c] dark:bg-[#17402a] dark:text-[#a6efc0]'
    };
    return (
      <span className={`inline-block px-2.5 py-0.5 rounded-lg font-bold text-base ml-2 ${colors[word.art] || ''}`}>
        {word.art}
      </span>
    );
  };

    // ---------- Phase 3: plural display with highlighted endings ----------
  const UMLAUT_PAIRS: Record<string, string> = { a: 'ä', o: 'ö', u: 'ü', A: 'Ä', O: 'Ö', U: 'Ü' };

  const pluralSegments = (): { pre: string; parts: { t: 'n' | 'r'; s: string }[] } | null => {
    if (!word || !word.pl) return null;
    const raw = word.pl.trim();
    const m = /^die\s+(.+)$/i.exec(raw);
    const article = m ? 'die ' : '';
    const pl = (m ? m[1] : raw).trim();
    const sg = (word.de || '').trim();
    if (!pl || !sg) return null;

    if (pl.toLocaleLowerCase('de') === sg.toLocaleLowerCase('de')) {
      return { pre: article, parts: [{ t: 'n', s: pl }] };
    }
    if (pl.length > sg.length && pl.slice(0, sg.length) === sg) {
      return { pre: article, parts: [{ t: 'n', s: sg }, { t: 'r', s: pl.slice(sg.length) }] };
    }
    for (let i = 0; i < Math.min(sg.length, pl.length); i++) {
      const uml = UMLAUT_PAIRS[sg[i]];
      if (uml && pl[i] === uml) {
        const pre = sg.slice(0, i);
        const post = sg.slice(i + 1);
        const rest = pl.slice(i + 1);
        if (pl.slice(0, i) === pre && rest.startsWith(post)) {
          const ending = rest.slice(post.length);
          const parts: { t: 'n' | 'r'; s: string }[] = [];
          if (pre) parts.push({ t: 'n', s: pre });
          parts.push({ t: 'r', s: uml });
          if (post) parts.push({ t: 'n', s: post });
          if (ending) parts.push({ t: 'r', s: ending });
          return { pre: article, parts };
        }
      }
    }
    return { pre: article, parts: [{ t: 'n', s: pl }] };
  };

  // v2 engine: umlaut-aware, case-insensitive prefix/suffix diff; capitalized display
const deUmlaut = (s: string): string => s.replace(/[äöüÄÖÜ]/g, c => ({ 'ä': 'a', 'ö': 'o', 'ü': 'u', 'Ä': 'A', 'Ö': 'O', 'Ü': 'U' }[c] || c));
const isUmlautChar = (c: string): boolean => 'äöüÄÖÜ'.includes(c);

const pluralSegments2 = (): { pre: string; parts: { t: 'n' | 'r'; s: string }[] } | null => {
if (!word || !word.pl) return null;
const raw = word.pl.trim();
if (!raw) return null;
const artM = /^(der|die|das)\s+(.+)$/i.exec(raw);
const storedArt = artM ? artM[1].toLowerCase() : '';
const plRaw = (artM ? artM[2] : raw).trim();
const sg = (word.de || '').trim();
if (!plRaw || !sg) return null;
const pre = (storedArt || 'die') + '\u00a0';

// plural of a German noun always starts with a capital letter
const pl = plRaw.charAt(0).toLocaleUpperCase('de') + plRaw.slice(1);
const sgL = sg.toLocaleLowerCase('de');
const plL = pl.toLocaleLowerCase('de');

const all = (s: string): { t: 'n' | 'r'; s: string }[] => [{ t: 'n', s }];

// 1) identical: nothing changed
if (plL === sgL) return { pre, parts: all(pl) };

// 2) plural = singular + ending (Bär→Bären, Kind→Kinder, ...)
if (plL.startsWith(sgL) && pl.length > sg.length) {
return { pre, parts: [...all(pl.slice(0, sg.length)), { t: 'r', s: pl.slice(sg.length) }] };
}

// ending notation like "-e" / "-er"
const endM = /^[-–—]+\s*([a-zäöü]{1,4})$/i.exec(plRaw);
if (endM) return { pre, parts: [...all(sg), { t: 'r', s: endM[1] }] };

// 3) umlaut-aware general diff (Haus→Häuser, Bad→Bäder, Stadt→Städte, ...)
const nsg = deUmlaut(sgL);
const npl = deUmlaut(plL);
let lcp = 0;
while (lcp < nsg.length && lcp < npl.length && nsg[lcp] === npl[lcp]) lcp++;
let lcs = 0;
while (lcs < nsg.length - lcp && lcs < npl.length - lcp && nsg[nsg.length - 1 - lcs] === npl[npl.length - 1 - lcs]) lcs++;
const parts: { t: 'n' | 'r'; s: string }[] = [];
for (let j = 0; j < pl.length; j++) {
const red = (j >= lcp && j < pl.length - lcs) || isUmlautChar(pl[j]);
if (parts.length && parts[parts.length - 1].t === (red ? 'r' : 'n')) parts[parts.length - 1].s += pl[j];
else parts.push({ t: red ? 'r' : 'n', s: pl[j] });
}
return { pre, parts };
};

const renderPluralBlock = () => {
const seg = pluralSegments2();
    if (!seg) return null;
    return (
      <div className="mt-2 inline-flex items-center gap-2 bg-[#eef2fb] dark:bg-[#182234] border border-[#c9d6f2] dark:border-[#2c3a55] rounded-xl px-3 py-1.5" dir="ltr">
        <span className="text-[11px] font-bold text-[#5d6676] dark:text-[#a3adbd] uppercase tracking-wide">Pl. </span>
        <span className="font-sans font-extrabold text-lg text-slate-900 dark:text-slate-100">
          {seg.pre && <span className="text-[#5d6676] dark:text-[#a3adbd] font-bold">{seg.pre}</span>}
          {seg.parts.map((p, i) =>
            p.t === 'r' ? (
              <span key={i} className="text-red-600 dark:text-red-400">{p.s}</span>
            ) : (
              <span key={i}>{p.s}</span>
            )
          )}
        </span>
      </div>
    );
  };

  // Verb tables builder
  const renderVerbTable = () => {
    if (!word.conj && !word.prat && !word.perf && !word.imperativDu && !word.imperativIhr && !word.imperativSie) return null;
    // Shared splitter: accepts "a|b|c|d|e|f" and also comma-separated data
    const presForms = word.conj ? splitConj(word.conj) : [];

    return (
      <div className="bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 my-3 text-right">
        <h4 className="font-bold text-sm text-[#5d6676] dark:text-[#a3adbd] mb-3 flex items-center justify-between">
          <span>جدول صرف فعل</span>
          <span className="text-xs font-normal">
            {word.sep ? `جداشدنی (${word.sep})` : 'فعل استاندارد'}
          </span>
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {presForms.length > 0 && (
            <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl p-3">
              <div className="font-bold text-xs text-[#1f5fbf] dark:text-[#7fb0ff] border-b pb-1 mb-2 flex justify-between">
                <span>Präsens</span>
                <span className="text-[#5d6676]">زمان حال</span>
              </div>
              <div className="space-y-1 text-xs">
                {presForms.map((f, i) => (
                  <div key={i} className="flex justify-between gap-2 border-b border-dashed border-slate-100 dark:border-slate-800 pb-0.5" dir="ltr">
                    <span className="text-slate-400 text-[11px] flex-shrink-0">{P6[i]}</span>
                    <span className="min-w-0 text-right">
                      <ConjugatedForm verb={word.de} form={f} pronounIndex={i} sep={word.sep} />
                    </span>
                  </div>
                ))}
              </div>
              <ConjugationLegend />
            </div>
          )}

          {word.prat && (
            <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl p-3">
              <div className="font-bold text-xs text-amber-600 dark:text-amber-400 border-b pb-1 mb-2 flex justify-between">
                <span>Präteritum</span>
                <span className="text-[#5d6676]">گذشته ساده</span>
              </div>
              <div className="text-xs space-y-1" dir="ltr">
                <div className="text-slate-500 text-[11px]">3. Person (er/sie/es):</div>
                {/* فاز ۴ #۵: فونت خنثی تا قرمزیِ بخش تغییرکرده دیده شود */}
                <div className="font-bold text-sm text-slate-800 dark:text-slate-200"><PratText inf={word.de} prat={word.prat} /></div>
              </div>
            </div>
          )}

          {word.perf && (
            <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl p-3">
              <div className="font-bold text-xs text-emerald-600 dark:text-emerald-400 border-b pb-1 mb-2 flex justify-between">
                <span>Perfekt</span>
                <span className="text-[#5d6676]">گذشته نقلی</span>
              </div>
              <div className="text-xs space-y-1" dir="ltr">
                <div className="text-slate-500 text-[11px]">Hilfsverb + Partizip II:</div>
                <div className="font-bold text-sm text-emerald-700 dark:text-emerald-300">{word.perf}</div>
              </div>
            </div>
          )}

          {(word.imperativDu || word.imperativIhr || word.imperativSie) && (
            <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl p-3">
              <div className="font-bold text-xs text-violet-600 dark:text-violet-400 border-b pb-1 mb-2 flex justify-between">
                <span>Imperativ</span><span className="text-[#5d6676]">وجه امری</span>
              </div>
              <div className="space-y-2 text-xs" dir="ltr">
                {word.imperativDu && <div className="flex justify-between gap-3"><span className="text-slate-500">du</span><strong>{word.imperativDu}</strong></div>}
                {word.imperativIhr && <div className="flex justify-between gap-3"><span className="text-slate-500">ihr</span><strong>{word.imperativIhr}</strong></div>}
                {word.imperativSie && <div className="flex justify-between gap-3"><span className="text-slate-500">Sie</span><strong>{word.imperativSie}</strong></div>}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Structured notes parser
  const renderNotes = () => {
    if (!word.notes) return null;
    const lines = word.notes.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    return (
      <div className="bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 my-3 text-right">
        <h4 className="font-bold text-sm text-[#5d6676] dark:text-[#a3adbd] mb-2">یادداشت‌ها و نکات ساختاری:</h4>
        <div className="space-y-2 text-sm leading-relaxed" dir="rtl">
          {lines.map((line, idx) => {
            const isWordFamily = line.startsWith('خانواده واژگانی:');
            const isStructure = line.startsWith('ساختار:');
            const isTrick = line.startsWith('🎯');
            return isTrick ? (
              /* فاز ۴ #۶: تریک حفظ‌سازی — آخرین خط notes، برجسته */
              <p key={idx} className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl px-3 py-2.5 font-bold text-amber-800 dark:text-amber-300 text-[15px] leading-7">
                {line}
              </p>
            ) : (
              <p key={idx} className="text-[#1d2330] dark:text-[#eef1f6]">
                {isWordFamily && <span className="font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">خانواده واژگانی: </span>}
                {isStructure && <span className="font-bold text-emerald-600 dark:text-emerald-400">ساختار: </span>}
                {!isWordFamily && !isStructure && <span className="font-bold">نکته: </span>}
                <span>{line.replace(/^(خانواده واژگانی:|ساختار:|نکته:)\s*/, '')}</span>
              </p>
            );
          })}
        </div>
      </div>
    );
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] bg-black/60 flex items-center justify-center p-3 md:p-6 overflow-y-auto"
      onClick={e => {
        if (e.target === e.currentTarget) { setShowFa(false); onClose(); }
      }}
    >
      {shadowOpen && <ShadowingModal word={word} onClose={() => setShadowOpen(false)} />}
      {pendingImg && (
        <ImageCropper src={pendingImg} title="برش تصویر واژه" onCancel={() => setPendingImg(null)} onConfirm={saveCropped} />
      )}
      {/* پاپ‌اپ تنظیمات واژه — لایهٔ روی پروفایل؛ بستنش پروفایل واژه را زیر خودش باز نگه می‌دارد */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-[1100] bg-black/50 flex items-center justify-center p-3 md:p-6 overflow-y-auto"
          onClick={e => { if (e.target === e.currentTarget) setSettingsOpen(false); }}
        >
          <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl w-full max-w-xl max-h-[85vh] overflow-y-auto shadow-2xl">
            <div dir="ltr" className="sticky top-0 z-10 bg-white/95 dark:bg-[#1b2029]/95 backdrop-blur-md px-4 py-3 border-b border-[#dde1ea] dark:border-[#333b4a] flex items-center justify-between gap-2">
              <span dir="rtl" className="font-bold text-sm text-[#1f5fbf] dark:text-[#7fb0ff]">⚙️ تنظیمات واژه — سطح تسلط، رجیستر، خوشهٔ مترادف</span>
              <IconBtn onClick={() => setSettingsOpen(false)} title="بستن و بازگشت به پروفایل واژه"><X size={18} className="text-red-500" /></IconBtn>
            </div>
            <div className="p-4">
              <div className="bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-3.5 space-y-3">
                {/* ۱) سطح تسلط */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-[#1f5fbf] dark:text-[#7fb0ff] text-sm">🎯 سطح تسلط:</span>
                  {WORD_STATUSES.map(s => (
                    <button
                      key={s}
                      disabled={!onPatchWord}
                      onClick={() => onPatchWord?.(word, { status: s as WordStatus })}
                      className={`px-3 py-1 rounded-xl text-xs font-bold transition border ${
                        statusOf(word) === s
                          ? `${STATUS_BADGE[s]} border-transparent shadow-2xs`
                          : 'bg-white dark:bg-[#1b2029] border-[#dde1ea] dark:border-[#333b4a] text-[#5d6676] dark:text-[#a3adbd] hover:border-[#1f5fbf]'
                      }`}
                      title={STATUS_HINTS[s]}
                    >
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-[#5d6676] dark:text-[#a3adbd] leading-5">
                  {STATUS_HINTS[statusOf(word)]}
                </p>

                {/* ۱٫۵) فاز ۲: آمار دوگانهٔ تسلط + پیشنهاد ارتقای دریافتی → کاندید */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#5d6676] dark:text-[#a3adbd]">
                  <span>📈 <b className="text-emerald-700 dark:text-emerald-400">تولیدی</b>: ✅{word.pOk || 0} ❌{word.pBad || 0}</span>
                  <span>👁 <b className="text-sky-700 dark:text-sky-400">شناختی</b>: ✅{word.rOk || 0} ❌{word.rBad || 0}</span>
                  {statusOf(word) === 'passiv' && (word.rStreak || 0) > 0 && (
                    <span>🔥 زنجیره: {word.rStreak}/{PROMO_STREAK}</span>
                  )}
                  {/* فاز ۳: زنجیرهٔ تولیدی کاندید — پایهٔ ارتقا به فعال */}
                  {statusOf(word) === 'kandidat' && (word.pStreak || 0) > 0 && (
                    <span>🔥 زنجیرهٔ تولید: {word.pStreak}/{AKT_STREAK}</span>
                  )}
                </div>
                {promotionReady(word) && (
                  <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800">
                    <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
                      🎉 این واژه {PROMO_STREAK} بار پیاپی در تشخیص درست بود — آمادهٔ ارتقاست!
                    </span>
                    <button
                      disabled={!onPatchWord}
                      onClick={() => onPatchWord?.(word, { status: 'kandidat' as WordStatus })}
                      className="px-3 py-1 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-2xs disabled:opacity-40 transition"
                    >
                      ⬆ ارتقا به کاندید فعال‌سازی
                    </button>
                  </div>
                )}
                {/* فاز ۳: بنر فعال‌سازی — کاندید آمادهٔ ارتقا به فعال */}
                {activationReady(word) && (
                  <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800">
                    <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                      🎉 این واژه {AKT_STREAK} بار پیاپی در تولید درست بود — آمادهٔ فعال‌سازی است!
                    </span>
                    <button
                      disabled={!onPatchWord}
                      onClick={() => onPatchWord?.(word, { status: 'aktiv' as WordStatus })}
                      className="px-3 py-1 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs disabled:opacity-40 transition"
                    >
                      ⬆ ارتقا به فعال
                    </button>
                  </div>
                )}

                {/* ۲) رجیستر — خنثی، محاوره‌ای، کتابی و… */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-bold text-amber-600 dark:text-amber-400 text-sm mr-1">🏷 رجیستر:</span>
                  {REGISTER_OPTIONS.map(o => (
                    <button
                      key={o.value || 'none'}
                      disabled={!onPatchWord}
                      onClick={() => onPatchWord?.(word, { register: o.value })}
                      className={`px-2 py-0.5 rounded-lg text-[11px] font-bold transition border ${
                        (word.register || '') === o.value
                          ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border-transparent shadow-2xs'
                          : 'bg-white dark:bg-[#1b2029] border-[#dde1ea] dark:border-[#333b4a] text-[#5d6676] dark:text-[#a3adbd] hover:border-amber-400'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>

                {/* ۳) خوشهٔ مترادف — قاعدهٔ «یک بلیط فعال، بقیه دریافتی» */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">🔗 خوشهٔ مترادف:</span>
                    <input
                      type="text"
                      dir="ltr"
                      value={clusterDraft}
                      onChange={e => setClusterDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && onPatchWord) onPatchWord(word, { synCluster: clusterDraft.trim() }); }}
                      placeholder="z.B. geschehen"
                      className="flex-1 min-w-0 bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-[#1f5fbf] font-sans"
                    />
                    <button
                      disabled={!onPatchWord}
                      onClick={() => onPatchWord?.(word, { synCluster: clusterDraft.trim() })}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition flex-shrink-0"
                    >
                      ذخیره
                    </button>
                  </div>
                  {clusterGuide(word, clusterOf(word, words)) && (
                    <p className="text-xs text-[#5d6676] dark:text-[#a3adbd] leading-5">
                      💡 {clusterGuide(word, clusterOf(word, words))}
                    </p>
                  )}
                  {clusterOf(word, words).length > 1 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {clusterOf(word, words).map(m => (
                        <span
                          key={m.word.id}
                          dir="ltr"
                          className={`px-2 py-0.5 rounded-lg text-[11px] font-bold font-sans ${
                            m.word.id === word.id
                              ? 'bg-[#1f5fbf] text-white'
                              : STATUS_BADGE[statusOf(m.word)]
                          }`}
                        >
                          {m.word.de}{m.isCore ? ' ★' : ''}
                        </span>
                      ))}
                      <span className="text-[10px] text-[#5d6676] dark:text-[#a3adbd]">★ = بلیط فعال خوشه</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col">
        {/*
          Fulfills User Request #9:
          "همون بالا دکمه های : بازگشت ، ویرایش ، حذف و افزودن عکس هست. کمی به هم ریخته هستند .
          مرتب و تمیز هر چهارتا رو در یک خط نمایش بده و ترتیب و منطق اونها بر اساس عرف و روال استاندارد و کاربر پسند نرم افزارها و APP های فارسی باشه"
        */}
        {/* Sticky block: icon strip + frozen word bar — while scrolling, word and Persian meaning remain visible (request #7) */}
        <div className="sticky top-0 z-20">
          <div dir="ltr" className="bg-white/95 dark:bg-[#1b2029]/95 backdrop-blur-md px-4 py-3 border-b border-[#dde1ea] dark:border-[#333b4a] flex items-center justify-start gap-2">
            {/* نوار آیکن‌ها — چینش حرفه‌ای: بستن/شنیدن/ترجمه ← ویرایش/تصویر/تمرین ← تنظیمات ← حذف (جدا) */}
            <IconBtn onClick={() => { setShowFa(false); onClose(); }} title="بستن"><X size={18} className="text-red-500" /></IconBtn>
            <div className="flex items-center gap-1.5">
              <IconBtn onClick={() => speak(word.art ? `${word.art} ${word.de}` : word.de)} title="پخش تلفظ">
                <Volume2 size={18} className="text-[#1f5fbf] dark:text-[#7fb0ff]" />
              </IconBtn>
              <IconBtn onClick={() => setShowFa(v => !v)} active={showFa} title={showFa ? 'مخفی کردن ترجمه‌ها' : 'نمایش همه ترجمه‌ها'} aria-expanded={showFa}>
                {showFa ? <EyeOff size={18} className="text-amber-500" /> : <Eye size={18} className="text-amber-500" />}
              </IconBtn>
              <div className="w-px h-5 bg-[#dde1ea] dark:bg-[#333b4a]" aria-hidden="true" />
              <IconBtn onClick={() => onEdit(word)} title="ویرایش واژه"><Pencil size={18} className="text-[#1f5fbf]" /></IconBtn>
              <IconBtn onClick={handlePickImage} active={!!word.img} title={word.img ? 'تغییر تصویر' : 'افزودن تصویر'}>
                <Camera size={18} className="text-slate-500 dark:text-slate-300" />
              </IconBtn>
              <IconBtn onClick={() => setShadowOpen(true)} title="تمرین تلفظ"><Mic size={18} className="text-rose-600" /></IconBtn>
              <IconBtn
                onClick={() => setSettingsOpen(true)}
                active={settingsOpen}
                title="تنظیمات واژه (سطح تسلط، رجیستر، خوشهٔ مترادف)"
              >
                <Sparkles size={18} className="text-amber-500" />
              </IconBtn>
              <div className="w-px h-5 bg-[#dde1ea] dark:bg-[#333b4a]" aria-hidden="true" />
              <IconBtn onClick={() => onDelete(word)} title="حذف واژه" danger><Trash2 size={18} className="text-red-500" /></IconBtn>
            </div>
          </div>
          {/* Frozen word bar: word + Persian translation (when enabled) always stays at the top of the page */}
          {/* فاز ۴ #۴: هدر چسبان دیگر زمینهٔ آبیِ کارت واژه را ندارد — سطح روشن با فونت serif */}
          <div dir="ltr" className="bg-white/95 dark:bg-[#141923]/95 backdrop-blur-md text-slate-900 dark:text-slate-100 px-3 py-2 flex items-center justify-between gap-2 border-b border-[#dde1ea] dark:border-[#333b4a] shadow-md">
            <div className="flex items-center gap-2 min-w-0">
              {articleBadge()}
              {heroVP ? (
                /* فعل با سرِ پسونددار در نوار چسبان هم استایل‌دار رندر می‌شود */
                <VerbPhrase vp={heroVP} className="text-base md:text-lg text-slate-900 dark:text-slate-100" />
              ) : (
                <span className="font-extrabold font-serif text-base md:text-lg truncate">{word.de}</span>
              )}
            </div>
            {showFa && word.fa && (
              <div className="flex items-center min-w-0">
                <span dir="rtl" className="text-sm md:text-base font-bold text-amber-600 dark:text-amber-300 truncate max-w-[52vw] sm:max-w-[280px]">{word.fa}</span>
              </div>
            )}
          </div>
        </div>

        {/* Modal Hero / Word Header — فاز ۴ #۴: پالت جدید هدر (دیگر آبیِ کارت واژه نیست) */}
        <div className="bg-gradient-to-br from-[#16384f] via-[#1e5163] to-[#493a72] text-white px-4 pt-3 pb-5 text-center">
          {/* 1. status line (small) */}
          <div className="text-[10px] md:text-[11px] text-white/70 font-medium leading-5">
            {dueText(word)} · فاصله: {word.ivl} روز · درست: {word.ok} · غلط: {word.bad}
          </div>

          {/* 2. category / part of speech / level */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 mt-1.5">
            {word.cat && (
              <span className="bg-white/20 text-white text-xs px-2.5 py-0.5 rounded-full font-medium">📁 {word.cat}</span>
            )}
            {word.pos && (
              <span className="bg-white/20 text-white text-xs px-2.5 py-0.5 rounded-full font-medium">{word.pos}</span>
            )}
            {word.lvl && (
              <span className="bg-amber-400 text-slate-900 text-xs px-2.5 py-0.5 rounded-full font-bold">{word.lvl}</span>
            )}
            {/* فاز ۱: نشان وضعیت واژگانی در هیرو */}
            <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${STATUS_BADGE_HERO[statusOf(word)]}`}>
              {STATUS_SHORT[statusOf(word)]}
            </span>
            {word.register && (
              <span className="bg-white/20 text-white text-xs px-2.5 py-0.5 rounded-full font-medium">
                {REGISTER_LABELS[word.register] || word.register}
              </span>
            )}
            {isLeech(word, leechN) && (
              <span className="bg-red-500 text-white text-xs px-2.5 py-0.5 rounded-full font-bold">🩸 واژه سخت</span>
            )}
          </div>

          {/* فاز ۵: پیشرفت بازیابی واژهٔ سخت — مسیر خروج از لیست 🩸 و جایگاه فعلی در آن */}
          {isLeech(word, leechN) && (() => {
            const rec = leechRecoveryProgress(word, leechN);
            return (
              <div dir="rtl" className="mx-auto max-w-md mt-2.5 bg-white/10 border border-white/25 rounded-xl px-3 py-2 text-[11px] md:text-xs text-white/90 leading-5 space-y-0.5">
                <div className="font-bold">راه خروج از لیست سخت:</div>
                <div>
                  زنجیرهٔ درستِ پیاپی: <span className="font-bold">{Math.min(rec.streak, rec.streakNeeded)}/{rec.streakNeeded}</span>
                  {' · '}
                  دقت {rec.winN > 0 ? `${rec.winN} پاسخ اخیر` : 'کل'}: <span className="font-bold">{100 - rec.winErrPct}٪</span>
                  {' · '}
                  خطای کل: <span className="font-bold">{rec.lifetimeErrPct}٪</span>
                </div>
                <div className="text-white/70">
                  {rec.byLifetime
                    ? (rec.streak >= rec.streakNeeded
                      ? '۳ درستِ پیاپی داری — با حفظ دقت اخیر ≥ ۷۰٪ (یا افت خطای کل زیر ۴۰٪) از لیست خارج می‌شود.'
                      : '۳ پاسخ درستِ پیاپی + دقت اخیر ≥ ۷۰٪، یا افت نرخ خطای کل زیر ۴۰٪ — هر کدام زودتر برسد.')
                    : 'نرخ خطای کل این واژه سالم است؛ مشکل فقط پاسخ‌های اخیر است: ۳ درستِ پیاپی + دقت اخیر ≥ ۷۰٪ تا از لیست خارج شود.'}
                </div>
              </div>
            );
          })()}

          {/* 3. the word in a card, with audio and translation toggle (icons only) */}
          <div dir="ltr" className="mt-3 mx-auto max-w-md rounded-2xl bg-white dark:bg-[#10151f] text-slate-900 dark:text-white shadow-lg ring-1 ring-white/40 px-4 py-3.5">
            <div className="flex items-center justify-center gap-2.5 flex-wrap">
              {articleBadge()}
              {heroVP ? (
                /* فاز ۴ #۱: فعل با حرف اضافه و حالت دستوری — sich entscheiden für (A) */
                <VerbPhrase vp={heroVP} className="text-3xl md:text-4xl tracking-wide text-slate-900 dark:text-slate-100" />
              ) : (
                /* فاز ۴ #۲: عنوان با فونت serif و کوچک‌شدن خودکار برای جا شدن در یک خط */
                <span ref={heroWordRef} className="font-extrabold tracking-wide font-serif text-slate-900 dark:text-slate-100" style={{ fontSize: 30 }}>{word.de}</span>
              )}
            </div>
            {renderPluralBlock()}
          </div>

          {/* 4. Persian translation box — same style family as the English-equivalent box */}
          {showFa && word.fa && (
            <div dir="rtl" className="mt-2.5 mx-auto max-w-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl p-3.5 text-sm flex items-center justify-between gap-3 text-slate-900 dark:text-slate-100">
              <span className="font-bold text-amber-700 dark:text-amber-300 flex-shrink-0">🇮🇷 معادل فارسی:</span>
              <span className="text-lg md:text-xl font-bold text-left">{word.fa}</span>
            </div>
          )}
        </div>

        {/* Modal Body — پروفایل واژه: بدون کارت‌های تنظیماتی؛ سطح تسلط/رجیستر/خوشه فقط در پاپ‌اپ ستاره */}
        <div className="p-4 md:p-6 space-y-4">
          {/* English equivalent — revealed with the translations toggle */}
          {word.en && showFa && (
            <div className="bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900 rounded-2xl p-3.5 text-sm flex items-center justify-between gap-2">
              <span className="font-bold text-sky-700 dark:text-sky-300">🇬🇧 معادل انگلیسی:</span>
              <span dir="ltr" className="font-sans font-bold text-slate-900 dark:text-slate-100">{word.en}</span>
            </div>
          )}
          {/* Synonyms & Antonyms */}
          {(word.syn || word.ant) && (
            <div className="bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-3.5 text-sm space-y-2">
              {word.syn && (
                <div className="flex flex-wrap items-center gap-2 justify-start">
                  <span className="font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">مترادف:</span>
                  <span className="font-bold" dir="ltr">{word.syn}</span>
                  {showFa && word.synFa && <span className="text-[#5d6676] dark:text-[#a3adbd]">({word.synFa})</span>}
                </div>
              )}
              {word.ant && (
                <div className="flex flex-wrap items-center gap-2 justify-start">
                  <span className="font-bold text-amber-600 dark:text-amber-400">متضاد:</span>
                  <span className="font-bold" dir="ltr">{word.ant}</span>
                  {showFa && word.antFa && <span className="text-[#5d6676] dark:text-[#a3adbd]">({word.antFa})</span>}
                </div>
              )}
            </div>
          )}

          {/* Image */}
          {word.img && (
            <div className="text-center bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-3">
              <img
                src={word.img}
                alt={word.de}
                className="max-h-56 mx-auto rounded-xl object-contain shadow-xs"
              />
              <button
                onClick={() => onImageChange(word, '')}
                className="mt-2 text-xs text-red-500 hover:text-red-700 underline"
              >
                حذف تصویر
              </button>
            </div>
          )}

          {/*
            Fulfills User Request #11:
            "مثالها و ترجمه ها : مثال از چپ به راست هست ولی ترجمه وسط چین هست ، ترجمه راست به چپ بشه"
          */}
          {/* Phase 3: German definition first, then examples */}
          {word.def && (
            <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 rounded-2xl p-4 text-right">
              <div className="flex items-center justify-between mb-1.5">
                <h4 className="font-bold text-sm text-[#4338ca] dark:text-[#a5b4fc]">Bedeutung</h4>
                <span className="text-[10px] text-[#5d6676] dark:text-[#a3adbd]">تعریف آلمانی</span>
              </div>
              <p className="font-sans text-sm md:text-base font-semibold text-slate-900 dark:text-slate-100 leading-relaxed text-left" dir="ltr">{word.def}</p>
            </div>
          )}
          {(word.ex || word.ex2) && (
            <div className="bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 text-right">
              <h4 className="font-bold text-sm text-[#5d6676] dark:text-[#a3adbd] mb-3">📖 Bedeutung & Praxisbeispiel — تعریف آلمانی، بعد مثال کاربردی:</h4>
              <div className="space-y-4">
                                {word.ex && (
                  <div className="border-b border-dashed border-[#dde1ea] dark:border-[#333b4a] pb-3 last:border-0 last:pb-0">
                    <div className="text-[10px] font-bold text-[#4338ca] dark:text-[#a5b4fc] mb-1">📖 Bedeutung — تعریف</div>                    <div className="flex items-start justify-between gap-2" dir="ltr">
                      <p className="text-sm md:text-base font-semibold text-slate-900 dark:text-slate-100 leading-relaxed text-left">
                        {word.ex}
                      </p>
                      <button
                        onClick={() => speak(word.ex)}
                        className="text-xs bg-white dark:bg-slate-800 border rounded-lg px-2 py-1 flex-shrink-0"
                      >
                        🔊
                      </button>
                    </div>
                    {showFa && word.exFa && (
                      <p className="text-xs md:text-sm text-[#5d6676] dark:text-[#a3adbd] mt-1.5 text-right" dir="rtl">
                        {word.exFa}
                      </p>
                    )}
                  </div>
                )}

                {word.ex2 && (
                  <div className="pt-1">
                    <div className="flex items-start justify-between gap-2" dir="ltr">
                      <p className="text-sm md:text-base font-semibold text-slate-900 dark:text-slate-100 leading-relaxed text-left">
                        {word.ex2}
                      </p>
                      <button
                        onClick={() => speak(word.ex2)}
                        className="text-xs bg-white dark:bg-slate-800 border rounded-lg px-2 py-1 flex-shrink-0"
                      >
                        🔊
                      </button>
                    </div>
                    {showFa && word.ex2Fa && (
                      <p className="text-xs md:text-sm text-[#5d6676] dark:text-[#a3adbd] mt-1.5 text-right" dir="rtl">
                        {word.ex2Fa}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Verb conjugations if verb */}
          {(word.komparativ || word.superlativ) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-3">
              {word.komparativ && <div className="rounded-xl border border-[#dde1ea] dark:border-[#333b4a] bg-slate-50 dark:bg-[#141923] p-3"><div className="text-xs text-[#5d6676] mb-1">Komparativ · صفت تفضیلی</div><div dir="ltr" className="font-bold">{word.komparativ}</div></div>}
              {word.superlativ && <div className="rounded-xl border border-[#dde1ea] dark:border-[#333b4a] bg-slate-50 dark:bg-[#141923] p-3"><div className="text-xs text-[#5d6676] mb-1">Superlativ · صفت عالی</div><div dir="ltr" className="font-bold">{word.superlativ}</div></div>}
            </div>
          )}
          {renderVerbTable()}

          {/* Notes and structure */}
          {renderNotes()}

          {/* Tags */}
          {word.tags && (
            <div className="flex flex-wrap gap-1.5 text-xs text-right">
              {word.tags.split(/[,،]/).map((tag, i) => (
                <span
                  key={i}
                  className="bg-slate-200 dark:bg-slate-700 px-2.5 py-1 rounded-full text-slate-700 dark:text-slate-300"
                >
                  #{tag.trim()}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
