/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AppSettings, CaseQuestion, ExerciseTimerCfg, Word } from '../types';
import { CASEQ, P6 } from '../data/seed';
import { checkSynAnt, checkWord, familyCands, fullWord, getCategories, intervalPreview, isAdjPos, isLeech, isNounPos, isVerbPos, nz, nz2, getTimerCfg } from '../utils/storage';
import { EXTRA_CASEQ, adjSourceByCode, adjSources, analyzeMistake, buildAdjItem, closestAnswer, parseSpec, randomSpec, specToString } from '../utils/grammar';
import { speak, stopSpeaking } from '../utils/audio';
import { checkConjAnswer, splitConj } from '../utils/conjugation';

/** Splits the six forms into two rows of three: [1..3] left column, [4..6] right column. */
const splitConjColumns = (forms: string[]): [string[], string[]] =>
  [forms.slice(0, 3), forms.slice(3, 6)];

import { WordDetailModal } from '../components/WordDetailModal';
import { SentenceBuilderModal } from '../components/SentenceBuilderModal';
import { SchreibenCorrector } from '../components/SchreibenCorrector';
import { SatzPuzzle, Diktat } from '../components/SentenceDrills';
import { ErrorNotebook } from '../components/ErrorNotebook';
import { VerbPrep } from '../components/VerbPrep';
import { PageOverlay } from '../components/PageOverlay';
import { today } from '../utils/dates';
import { ShadowingModal } from '../components/ShadowingModal';
import { IconBtn } from '../components/IconBtn';
import { X, BookOpen, PencilLine, HelpCircle, Timer as TimerIcon, Mic } from 'lucide-react';
import { ConjugatedForm } from '../components/ConjugatedForm';
import { generateWithGemini, parseAI } from '../utils/ai';
import { HoerenTrainer } from '../components/HoerenTrainer';
import { SprechenTrainer } from '../components/SprechenTrainer';
import { LesenTrainer } from '../components/LesenTrainer';

// تعریف مستقیم PratText برای نمایش شکل Präteritum بدون خطای مسیر
const PratText: React.FC<{ inf: string; prat: string }> = ({ prat }) => (
  <span className="font-sans font-bold">{prat}</span>
);

export type ExerciseMode =
  | 'flash'
  | 'free'
  | 'daily'
  | 'review'
  | 'cloze'
  | 'art'
  | 'dict'
  | 'plural'
  | 'conj'
  | 'tense'
  | 'case'
  | 'adjdecl'
  | 'prod'
  | 'synant'
  | 'n2v'
  | 'v2n'
  | 'hard'
  | 'sent'
  | 'freesent'
  | 'schreiben'
  | 'schreiben_exam'
  | 'puzzle'
  | 'dikt'
  | 'errnb'
  | 'vprep'
  | 'hoeren'
  | 'hoeren_new'
  | 'hoeren_archive';

export const EXERCISE_NAMES: Record<ExerciseMode, { title: string; icon: string; desc: string }> = {
  flash: { title: 'فلش‌کارت', icon: '🃏', desc: 'کارت واژه با الگوریتم تکرار فاصله‌دار لایتنر' },
  free: { title: 'مرور آزاد دسته', icon: '📚', desc: 'مرور همهٔ واژگان یک دسته، بدون محدودیت و بدون اثر بر لایتنر' },
  daily: { title: 'جلسهٔ روزانه', icon: '🌟', desc: 'سررسیدها + واژه‌های جدید متناسب با سهمیه روزانه' },
  review: { title: 'مرور سررسیدها', icon: '🔁', desc: 'فقط واژه‌هایی که تاریخ مرور آن‌ها فرا رسیده' },
  cloze: { title: 'جای‌خالی', icon: '✍️', desc: 'تکمیل جمله با واژه یا عبارت درست' },
  art: { title: 'آرتیکل', icon: '🎨', desc: 'تشخیص der / die / das برای اسامی' },
  dict: { title: 'دیکته واژه', icon: '🔊', desc: 'تمرین شنیدار و تشخیص واژگان از روی صدا' },
  plural: { title: 'جمع اسم‌ها', icon: '🔢', desc: 'نوشتن شکل جمع اسامی آلمانی' },
  conj: { title: 'صرف فعل', icon: '🔤', desc: 'صرف فعل برای ضمایر مختلف با هایلایت پایانه و تغییر ریشه' },
  tense: { title: 'زمان فعل', icon: '⏳', desc: 'تمرین زمان‌های Präteritum و Perfekt' },
  case: { title: 'حالت و حرف اضافه', icon: '🧩', desc: 'دو جای خالی مجزا برای حرف اضافه و آرتیکل' },
  adjdecl: { title: 'صرف صفت', icon: '🧱', desc: 'نوشتن شکل درست صفت (پایانه) با آرتیکل، حالت و جنس مختلف' },
  prod: { title: 'فارسی ← آلمانی (تایپی)', icon: '🔁', desc: 'دیدن ترجمه و نوشتن کامل واژه آلمانی' },
  synant: { title: 'مترادف و متضاد', icon: '↔️', desc: 'نوشتن مترادف یا متضاد واژهٔ داده‌شده' },
  n2v: { title: 'اسم ← فعل', icon: '🔁', desc: 'از روی اسم، فعل هم‌خانواده را بنویسید' },
  v2n: { title: 'فعل ← اسم', icon: '🂂', desc: 'از روی فعل، اسم هم‌خانواده را (با آرتیکل) بنویسید' },
  hard: { title: 'تمرین ترکیبی واژه‌های سخت', icon: '🩸', desc: 'هر واژهٔ سخت در قالب‌های مختلف و با چیدمان تصادفی' },
  sent: { title: 'تولید جمله', icon: '🗣', desc: 'جمله‌سازی با واژه و بررسی ساختار' },
  freesent: { title: 'تولید جملهٔ آزاد', icon: '✒️', desc: 'هر جمله‌ای بساز؛ تصحیح کامل گرامر، حروف ربط، حرف اضافه و حالت، آرتیکل و صرف صفت با نمره' },
  schreiben: { title: 'Schreiben prüfen', icon: '📸', desc: 'عکس دست‌نویس (چند صفحه)، فایل یا متن خودت را بفرست؛ تصحیح کامل با تفکر آلمانی، سبک و گرامر' },
  schreiben_exam: { title: 'Schreiben Prüfung', icon: '📝', desc: 'انتخاب سطح و سناریوی استاندارد آزمون (ایمیل رسمی، وبلاگ، درخواست کار) و نمره‌دهی' },
  puzzle: { title: 'چیدن جمله (Satzbau)', icon: '🧩', desc: 'کلمه‌های درهم‌ریختهٔ جمله‌های مثال خودت را به ترتیب درست آلمانی بچین' },
  dikt: { title: 'دیکته جمله', icon: '🎧', desc: 'جمله را بشنو و دقیق بنویس؛ تصحیح کلمه‌به‌کلمه' },
  errnb: { title: 'دفتر خطاها', icon: '📓', desc: 'جمله‌های غلطِ خودت (از تصحیح نوشتار) با مرور فاصله‌دار؛ خطاها تکرار نشوند' },
  vprep: { title: 'فعل + حرف اضافه (Verben mit Präpositionen)', icon: '🔗', desc: 'حرف اضافه و حالت دستوری ۱۰۰+ فعل مهم؛ یادگیری، تمرین فاصله‌دار و افزودن فعل جدید' },
  hoeren: { title: 'Hörverstehen', icon: '🎧', desc: 'Hörtexte, Richtig/Falsch und Lückentexte' },
  hoeren_new: { title: 'ساخت تمرین جدید', icon: '✨', desc: 'متن را وارد کن؛ تمرین شنیداری، سؤال‌ها و فایل صوتی ساخته می‌شود' },
  hoeren_archive: { title: 'تمرینات قبلی (آرشیو)', icon: '📂', desc: 'تمرین‌های ذخیره‌شده را دوباره انجام بده' }
};

const WORTSCHATZ_MODES: ExerciseMode[] = ['flash', 'free', 'daily', 'review', 'cloze', 'plural', 'prod', 'synant', 'n2v', 'v2n', 'sent']; 
const GRAMMATIK_MODES: ExerciseMode[] = ['art', 'conj', 'tense', 'case', 'adjdecl', 'puzzle', 'vprep'];
const SCHREIBEN_MODES: ExerciseMode[] = ['schreiben', 'schreiben_exam', 'freesent', 'errnb'];
const HOEREN_MODES: ExerciseMode[] = ['hoeren_new', 'hoeren_archive', 'dict', 'dikt'];
const isSelfContainedMode = (m: ExerciseMode | null): boolean =>
  m === 'freesent' || m === 'schreiben' || m === 'schreiben_exam' || m === 'puzzle' || m === 'dikt' || m === 'errnb' || m === 'vprep' || m === 'hoeren';

export const HighlightedVerbForm: React.FC<{
  verb: string;
  form: string;
  pronounIndex: number;
  sep?: string;
}> = ({ verb, form, pronounIndex, sep }) => (
  <ConjugatedForm verb={verb} form={form} pronounIndex={pronounIndex} sep={sep} />
);

interface ExercisesViewProps {
  words: Word[];
  settings?: AppSettings;
  activeMode: ExerciseMode | null;
  practiceWordIds?: string[] | null;
  onSelectMode: (mode: ExerciseMode | null) => void;
  onRecordResult: (word: Word | CaseQuestion, mode: string, grade: number, isRetry: boolean) => void;
  onOpenHelp: (topic: string) => void;
  onShowToast: (msg: string, isErr?: boolean) => void;
  onEditWord?: (word: Word) => void;
  onDeleteWord?: (word: Word) => void;
  onImageChange?: (word: Word, newImg: string) => void;
  paused?: boolean;
  onUpdateSettings?: (patch: Partial<AppSettings>) => void;
  onStartHard?: (ids: string[]) => void;
  dailyProgress?: { d: string; n: number; r: number };
}

export const ExercisesView: React.FC<ExercisesViewProps> = ({
  words: allWords,
  settings,
  activeMode,
  practiceWordIds,
  onSelectMode,
  onOpenHelp,
  onShowToast,
  onEditWord,
  onDeleteWord,
  onImageChange,
  paused,
  onUpdateSettings,
  onStartHard,
  dailyProgress
}) => {
  const topRef = useRef<HTMLDivElement>(null);
  const words = useMemo(() => {
    const cats = settings?.activeCats;
    const exempt = !activeMode || activeMode === 'flash' || activeMode === 'free' || isSelfContainedMode(activeMode);
    if (exempt || !cats || cats.length === 0 || (practiceWordIds && practiceWordIds.length > 0)) return allWords;
    const allowed = new Set(cats);
    return allWords.filter(w => allowed.has(w.cat));
  }, [allWords, settings?.activeCats, activeMode, practiceWordIds]);

  const [mainTab, setMainTab] = useState<'flash' | 'wortschatz' | 'grammatik' | 'schreiben' | 'hoeren' | 'sprechen' | 'lesen'>('flash');
  const [showHard, setShowHard] = useState(false);   

  // مدیریت نمایش درست کامپوننت‌های مستقل مانند Sprechen، Lesen و Hören
  if (mainTab === 'sprechen') {
    return (
      <div ref={topRef} className="space-y-4 text-right max-w-2xl mx-auto pb-10">
        {renderTabHeader()}
        <SprechenTrainer onClose={() => onSelectMode(null)} onShowToast={onShowToast} />
      </div>
    );
  }

  if (mainTab === 'lesen') {
    return (
      <div ref={topRef} className="space-y-4 text-right max-w-2xl mx-auto pb-10">
        {renderTabHeader()}
        <LesenTrainer onClose={() => onSelectMode(null)} onShowToast={onShowToast} />
      </div>
    );
  }

  if (mainTab === 'hoeren') {
    return (
      <div ref={topRef} className="space-y-4 text-right max-w-2xl mx-auto pb-10">
        {renderTabHeader()}
        <HoerenTrainer onClose={() => onSelectMode(null)} />
      </div>
    );
  }

  function renderTabHeader() {
    return (
      <div className="sticky top-16 md:top-[4.5rem] z-20 bg-[#f6f7fb]/95 dark:bg-[#12151c]/95 backdrop-blur -mx-2 px-2 py-2">
        <div className="grid grid-cols-7 gap-1 p-1.5 bg-slate-100 dark:bg-[#141923] rounded-2xl border border-[#dde1ea] dark:border-[#333b4a] text-xs sm:text-sm font-bold shadow-xs">
          <button
            onClick={() => setMainTab('flash')}
            className={`py-2.5 px-1 rounded-xl transition flex flex-col items-center gap-1 ${mainTab === 'flash' ? 'bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white shadow-md' : 'text-slate-700 dark:text-slate-300'}`}
          >
            <span className="text-lg">🃏</span>
            <span className="text-[10px] sm:text-xs leading-tight">Lernkarten</span>
          </button>
          <button
            onClick={() => setMainTab('wortschatz')}
            className={`py-2.5 px-1 rounded-xl transition flex flex-col items-center gap-1 ${mainTab === 'wortschatz' ? 'bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white shadow-md' : 'text-slate-700 dark:text-slate-300'}`}
          >
            <span className="text-lg">📚</span>
            <span className="text-[10px] sm:text-xs leading-tight">Wortschatz</span>
          </button>
          <button
            onClick={() => setMainTab('grammatik')}
            className={`py-2.5 px-1 rounded-xl transition flex flex-col items-center gap-1 ${mainTab === 'grammatik' ? 'bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white shadow-md' : 'text-slate-700 dark:text-slate-300'}`}
          >
            <span className="text-lg">🧩</span>
            <span className="text-[10px] sm:text-xs leading-tight">Grammatik</span>
          </button>
          <button
            onClick={() => setMainTab('schreiben')}
            className={`py-2.5 px-1 rounded-xl transition flex flex-col items-center gap-1 ${mainTab === 'schreiben' ? 'bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white shadow-md' : 'text-slate-700 dark:text-slate-300'}`}
          >
            <span className="text-lg">✍️</span>
            <span className="text-[10px] sm:text-xs leading-tight">Schreiben</span>
          </button>
          <button
            onClick={() => setMainTab('hoeren')}
            className={`py-2.5 px-1 rounded-xl transition flex flex-col items-center gap-1 ${mainTab === 'hoeren' ? 'bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white shadow-md' : 'text-slate-700 dark:text-slate-300'}`}
          >
            <span className="text-lg">🎧</span>
            <span className="text-[10px] sm:text-xs leading-tight">Hören</span>
          </button>
          <button
            onClick={() => setMainTab('sprechen')}
            className={`py-2.5 px-1 rounded-xl transition flex flex-col items-center gap-1 ${mainTab === 'sprechen' ? 'bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white shadow-md' : 'text-slate-700 dark:text-slate-300'}`}
          >
            <span className="text-lg">🗣️</span>
            <span className="text-[10px] sm:text-xs leading-tight">Sprechen</span>
          </button>
          <button
            onClick={() => setMainTab('lesen')}
            className={`py-2.5 px-1 rounded-xl transition flex flex-col items-center gap-1 ${mainTab === 'lesen' ? 'bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white shadow-md' : 'text-slate-700 dark:text-slate-300'}`}
          >
            <span className="text-lg">📖</span>
            <span className="text-[10px] sm:text-xs leading-tight">Lesen</span>
          </button>
        </div>
      </div>
    );
  }

  if (!activeMode) {
    const activeCatCount = settings?.activeCats?.length || 0;
    const hardWordsCount = allWords.filter(w => (w.bad || 0) > 3).length;

    return (
      <div ref={topRef} className="space-y-4 text-right max-w-2xl mx-auto pb-10">
        {renderTabHeader()}

        {mainTab === 'flash' && (
          <div className="space-y-3">
            <button
              onClick={() => onSelectMode('flash')}
              className="w-full text-right rounded-3xl p-6 bg-gradient-to-br from-[#1f5fbf] via-[#4a5ac9] to-[#6b4fd8] text-white shadow-xl active:scale-[.99] transition relative overflow-hidden"
            >
              <div className="relative flex items-center gap-4 w-full">
                <span className="text-5xl">🃏</span>
                <div className="min-w-0 flex-1">
                  <div className="text-2xl font-extrabold">جعبه لایتنر و فلش‌کارت</div>
                  <div className="text-sm text-white/85 mt-1">مرور هوشمند واژگان با تکرار فاصله‌دار استاندارد</div>
                  <div className="text-sm text-white/85 mt-3 flex flex-wrap gap-2">
                    <span className="bg-white/15 rounded-full px-3 py-1">📚 {words.length} واژه آماده مرور</span>
                    {activeCatCount > 0 && <span className="bg-white/15 rounded-full px-3 py-1">🗂 {activeCatCount} دستهٔ فعال</span>}
                  </div>
                </div>
                <span className="text-3xl text-white/85">‹</span>
              </div>
            </button>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => onSelectMode('review')}
                className="p-4 rounded-2xl bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] hover:border-[#1f5fbf] text-right transition flex items-center gap-3 shadow-xs"
              >
                <span className="text-3xl">🔁</span>
                <div>
                  <div className="font-bold text-base">مرور سررسیدها</div>
                  <div className="text-sm text-[#5d6676] dark:text-[#a3adbd] mt-0.5">فقط واژه‌های نیازمند مرور امروز</div>
                </div>
              </button>
              <button
                onClick={() => onSelectMode('daily')}
                className="p-4 rounded-2xl bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] hover:border-[#1f5fbf] text-right transition flex items-center gap-3 shadow-xs"
              >
                <span className="text-3xl">🌟</span>
                <div>
                  <div className="font-bold text-base">جلسه روزانه</div>
                  <div className="text-sm text-[#5d6676] dark:text-[#a3adbd] mt-0.5">ترکیب سررسیدها + لغات جدید</div>
                </div>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <button
                onClick={() => onSelectMode('free')}
                className="p-4 rounded-2xl bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] hover:border-[#1f5fbf] text-right transition flex items-center gap-3 shadow-xs"
              >
                <span className="text-3xl">📚</span>
                <div>
                  <div className="font-bold text-base">مرور آزاد دسته</div>
                  <div className="text-sm text-[#5d6676] dark:text-[#a3adbd] mt-0.5">مرور کل یک دسته بدون اثر بر لایتنر</div>
                </div>
              </button>
              <button
                onClick={() => setShowHard(true)}
                className="p-4 rounded-2xl bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] hover:border-[#1f5fbf] text-right transition flex items-center gap-3 shadow-xs"
              >
                <span className="text-3xl">🩸</span>
                <div>
                  <div className="font-bold text-base">واژه‌های پر اشتباه ({hardWordsCount})</div>
                  <div className="text-sm text-[#5d6676] dark:text-[#a3adbd] mt-0.5">تمرین اختصاصی واژه‌های سخت</div>
                </div>
              </button>
            </div>
          </div>
        )}

        {mainTab === 'wortschatz' && (
          <div className="space-y-3">
            {WORTSCHATZ_MODES.filter(m => m !== 'flash' && m !== 'review' && m !== 'daily' && m !== 'free').map(mode => {
              const info = EXERCISE_NAMES[mode];
              return (
                <div
                  key={mode}
                  onClick={() => onSelectMode(mode)}
                  className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 hover:border-[#1f5fbf] transition flex items-center justify-between gap-3 cursor-pointer shadow-xs"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span className="text-2xl flex-shrink-0">{info.icon}</span>
                    <div className="min-w-0">
                      <b className="text-base text-slate-900 dark:text-slate-100 block">{info.title}</b>
                      <span className="text-sm text-[#5d6676] dark:text-[#a3adbd] block mt-0.5">{info.desc}</span>
                    </div>
                  </div>
                  <span className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-4 py-2 rounded-xl text-sm font-bold flex-shrink-0">شروع ▶</span>
                </div>
              );
            })}
          </div>
        )}

        {mainTab === 'grammatik' && (
          <div className="space-y-3">
            {GRAMMATIK_MODES.map(mode => {
              const info = EXERCISE_NAMES[mode];
              return (
                <div
                  key={mode}
                  onClick={() => onSelectMode(mode)}
                  className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 hover:border-[#1f5fbf] transition flex items-center justify-between gap-3 cursor-pointer shadow-xs"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span className="text-2xl flex-shrink-0">{info.icon}</span>
                    <div className="min-w-0">
                      <b className="text-base text-slate-900 dark:text-slate-100 block">{info.title}</b>
                      <span className="text-sm text-[#5d6676] dark:text-[#a3adbd] block mt-0.5">{info.desc}</span>
                    </div>
                  </div>
                  <span className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-4 py-2 rounded-xl text-sm font-bold flex-shrink-0">شروع ▶</span>
                </div>
              );
            })}
          </div>
        )}

        {mainTab === 'schreiben' && (
          <div className="space-y-3">
            {SCHREIBEN_MODES.map(mode => {
              const info = EXERCISE_NAMES[mode];
              return (
                <div
                  key={mode}
                  onClick={() => onSelectMode(mode)}
                  className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 hover:border-[#1f5fbf] transition flex items-center justify-between gap-3 cursor-pointer shadow-xs"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span className="text-2xl flex-shrink-0">{info.icon}</span>
                    <div className="min-w-0">
                      <b className="text-base text-slate-900 dark:text-slate-100 block">{info.title}</b>
                      <span className="text-sm text-[#5d6676] dark:text-[#a3adbd] block mt-0.5">{info.desc}</span>
                    </div>
                  </div>
                  <span className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-4 py-2 rounded-xl text-sm font-bold flex-shrink-0">شروع ▶</span>
                </div>
              );
            })}
          </div>
        )}

        {mainTab === 'hoeren' && (
          <div className="space-y-3">
            {HOEREN_MODES.map(mode => {
              const info = EXERCISE_NAMES[mode];
              return (
                <div
                  key={mode}
                  onClick={() => {
                    if (mode === 'hoeren_new' || mode === 'hoeren_archive') {
                      setMainTab('hoeren');
                    } else {
                      onSelectMode(mode);
                    }
                  }}
                  className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 hover:border-[#1f5fbf] transition flex items-center justify-between gap-3 cursor-pointer shadow-xs"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span className="text-2xl flex-shrink-0">{info.icon}</span>
                    <div className="min-w-0">
                      <b className="text-base text-slate-900 dark:text-slate-100 block">{info.title}</b>
                      <span className="text-sm text-[#5d6676] dark:text-[#a3adbd] block mt-0.5">{info.desc}</span>
                    </div>
                  </div>
                  <span className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-4 py-2 rounded-xl text-sm font-bold flex-shrink-0">شروع ▶</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return null;
};
