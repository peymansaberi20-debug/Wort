import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AppSettings, CaseQuestion, Word } from '../types';
import { CASEQ, P6 } from '../data/seed';
import { checkWord, fullWord, getCategories, intervalPreview, isLeech } from '../utils/storage';
import { speak, stopSpeaking } from '../utils/audio';
import { splitConj } from '../utils/conjugation';
import { WordDetailModal } from '../components/WordDetailModal';
import { ConjugatedForm } from '../components/ConjugatedForm';

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
  | 'prod'
  | 'sent';

export const EXERCISE_NAMES: Record<ExerciseMode, { title: string; icon: string; desc: string }> = {
  flash: { title: 'فلش‌کارت', icon: '🃏', desc: 'کارت واژه با الگوریتم تکرار فاصله‌دار لایتنر' },
  free: { title: 'مرور آزاد دسته', icon: '📚', desc: 'مرور همهٔ واژگان یک دسته، بدون محدودیت و بدون اثر بر لایتنر' },
  daily: { title: 'جلسهٔ روزانه', icon: '🌟', desc: 'سررسیدها + واژه‌های جدید متناسب با سهمیه روزانه' },
  review: { title: 'مرور سررسیدها', icon: '🔁', desc: 'فقط واژه‌هایی که تاریخ مرور آن‌ها فرا رسیده' },
  cloze: { title: 'جای‌خالی', icon: '✍️', desc: 'تکمیل جمله با واژه یا عبارت درست' },
  art: { title: 'آرتیکل', icon: '🎨', desc: 'تشخیص der / die / das برای اسامی' },
  dict: { title: 'دیکته و شنیدار', icon: '🎧', desc: 'شنیدن تلفظ و نوشتن املای آلمانی' },
  plural: { title: 'جمع اسم‌ها', icon: '🔢', desc: 'نوشتن شکل جمع اسامی آلمانی' },
  conj: { title: 'صرف فعل', icon: '🔤', desc: 'صرف فعل برای ضمایر مختلف با هایلایت پایانه و تغییر ریشه' },
  tense: { title: 'زمان فعل', icon: '⏳', desc: 'تمرین زمان‌های Präteritum و Perfekt' },
  case: { title: 'حالت و حرف اضافه', icon: '🧩', desc: 'دو جای خالی مجزا برای حرف اضافه و آرتیکل' },
  prod: { title: 'فارسی ← آلمانی (تایپی)', icon: '🔁', desc: 'دیدن ترجمه و نوشتن کامل واژه آلمانی' },
  sent: { title: 'تولید جمله', icon: '🗣', desc: 'جمله‌سازی با واژه و بررسی ساختار' }
};

/**
 * Colour-coded conjugated form (regular endings blue, irregular stem changes red).
 * The logic now lives in src/utils/conjugation.ts and is shared with the vocabulary profile.
 * Kept as an export for backward compatibility.
 */
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
}

export const ExercisesView: React.FC<ExercisesViewProps> = ({
  words,
  settings,
  activeMode,
  practiceWordIds,
  onSelectMode,
  onRecordResult,
  onOpenHelp,
  onShowToast
}) => {
  // Free review configuration
  const [freeCat, setFreeCat] = useState<string>(settings?.freeCat || '');
  const [freeDir, setFreeDir] = useState<'de' | 'fa'>(settings?.freeDir || 'de');
  const [freeRnd, setFreeRnd] = useState<boolean>(settings?.freeRnd ?? true);
  const [isFreeStarted, setIsFreeStarted] = useState<boolean>(false);

  // Flashcard setup config
  const [flashDir, setFlashDir] = useState<'de' | 'fa' | 'rand'>(settings?.dir || 'de');
  const [flashCat, setFlashCat] = useState<string>('');
  const [isFlashConfigured, setIsFlashConfigured] = useState<boolean>(false);

  // Active session queue
  const [queue, setQueue] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  // Fulfills Section 10: Independent answer visibility per card
  const [revealedCardId, setRevealedCardId] = useState<string | null>(null);
  const [currentCardDir, setCurrentCardDir] = useState<'de' | 'fa'>('de');

  // Input states
  const [userInput, setUserInput] = useState<string>('');
  // Fulfills Section 19: Two separate blanks for Case & Preposition
  const [casePrepInput, setCasePrepInput] = useState<string>('');
  const [caseArtInput, setCaseArtInput] = useState<string>('');
  const [caseResult, setCaseResult] = useState<{ prepOk: boolean; artOk: boolean } | null>(null);

  const [answerResult, setAnswerResult] = useState<{ ok: number; exp: string; msg?: string } | null>(null);
  const [hintLevel, setHintLevel] = useState<number>(0);

  // Fulfills Section 21: View Full Word Profile modal accessible from EVERY exercise
  const [profileModalWord, setProfileModalWord] = useState<Word | null>(null);

  // Fulfills Section 5: Flashcard timer per card
  const [cardTimerSec, setCardTimerSec] = useState<number>(0);
  const timerRef = useRef<any>(null);

  // For free review tracking
  const [knownMap, setKnownMap] = useState<Record<string, number>>({});

  const categories = useMemo(() => getCategories(words), [words]);

  // Clean up timers and audio on unmount or question change
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopSpeaking();
    };
  }, []);

  // Build queue when activeMode starts
  useEffect(() => {
    if (!activeMode) {
      setQueue([]);
      setCurrentIndex(0);
      setRevealedCardId(null);
      setUserInput('');
      setCasePrepInput('');
      setCaseArtInput('');
      setCaseResult(null);
      setAnswerResult(null);
      setHintLevel(0);
      setIsFreeStarted(false);
      setIsFlashConfigured(false);
      stopSpeaking();
      return;
    }

    const n = Date.now();
    let qIds: string[] = [];

    // Filter by active categories if specified (Section 3.4)
    let pool = words;
    if (settings?.activeCats && settings.activeCats.length > 0) {
      const allowed = new Set(settings.activeCats);
      pool = pool.filter(w => allowed.has(w.cat));
    }

    // Exclude suspended words if leechAct === 'suspend' (Section 4.3)
    if (settings?.leechAct === 'suspend') {
      const leechThreshold = settings.leechN || 4;
      pool = pool.filter(w => !isLeech(w, leechThreshold));
    }

    if (practiceWordIds && practiceWordIds.length > 0) {
      qIds = [...practiceWordIds];
    } else if (activeMode === 'case') {
      qIds = CASEQ.map(q => q.id).sort(() => Math.random() - 0.5);
    } else if (activeMode === 'free') {
      return;
    } else if (activeMode === 'flash' || activeMode === 'review') {
      if (!isFlashConfigured && activeMode === 'flash') return;
      if (flashCat) pool = pool.filter(w => w.cat === flashCat);

      if (activeMode === 'review') {
        pool = pool.filter(w => w.last && w.due <= n).sort((a, b) => a.due - b.due);
      } else {
        const dueWords = pool.filter(w => w.last && w.due <= n);
        const newWords = pool.filter(w => !w.last);

        // Respect session order (Section 3.3)
        const order = settings?.order || 'due';
        if (order === 'new') {
          pool = [...newWords, ...dueWords];
        } else if (order === 'rand') {
          pool = [...dueWords, ...newWords].sort(() => Math.random() - 0.5);
        } else if (order === 'mix') {
          const mixed: Word[] = [];
          const maxLen = Math.max(dueWords.length, newWords.length);
          for (let i = 0; i < maxLen; i++) {
            if (i < dueWords.length) mixed.push(dueWords[i]);
            if (i < newWords.length) mixed.push(newWords[i]);
          }
          pool = mixed;
        } else {
          // 'due' default
          pool = [...dueWords, ...newWords];
        }
      }
      qIds = pool.map(w => w.id).slice(0, settings?.rv || 20);
    } else if (activeMode === 'daily') {
      const due = pool.filter(w => w.last && w.due <= n);
      const nw = pool.filter(w => !w.last);
      const dailyNewLimit = settings?.nw ?? 10;
      const dailyRevLimit = settings?.rv ?? 20;
      qIds = [...due.slice(0, dailyRevLimit), ...nw.slice(0, dailyNewLimit)].map(w => w.id);
    } else if (activeMode === 'art') {
      qIds = pool.filter(w => !!w.art).sort(() => Math.random() - 0.5).slice(0, 15).map(w => w.id);
    } else if (activeMode === 'cloze') {
      qIds = pool.filter(w => !!w.cloze || !!w.ans).sort(() => Math.random() - 0.5).slice(0, 15).map(w => w.id);
    } else if (activeMode === 'plural') {
      qIds = pool.filter(w => !!w.pl).sort(() => Math.random() - 0.5).slice(0, 15).map(w => w.id);
    } else if (activeMode === 'conj') {
      qIds = pool.filter(w => !!w.conj).sort(() => Math.random() - 0.5).slice(0, 15).map(w => w.id);
    } else if (activeMode === 'tense') {
      qIds = pool.filter(w => !!w.prat || !!w.perf).sort(() => Math.random() - 0.5).slice(0, 15).map(w => w.id);
    } else if (activeMode === 'dict' || activeMode === 'prod') {
      qIds = pool.slice().sort(() => Math.random() - 0.5).slice(0, 15).map(w => w.id);
    } else if (activeMode === 'sent') {
      qIds = pool.filter(w => !!w.last).slice().sort(() => Math.random() - 0.5).slice(0, 10).map(w => w.id);
    }

    setQueue(qIds);
    setCurrentIndex(0);
    setRevealedCardId(null);
    setUserInput('');
    setCasePrepInput('');
    setCaseArtInput('');
    setCaseResult(null);
    setAnswerResult(null);
    setHintLevel(0);
  }, [activeMode, practiceWordIds, isFlashConfigured, flashCat, settings?.order, settings?.activeCats, settings?.leechAct]);

  // Current item
  const currentItem = useMemo(() => {
    if (queue.length === 0 || currentIndex >= queue.length) return null;
    const id = queue[currentIndex];
    if (activeMode === 'case') {
      return CASEQ.find(q => q.id === id) || null;
    }
    return words.find(w => w.id === id) || null;
  }, [queue, currentIndex, activeMode, words]);

  // Fulfills Section 2.2: Independent random direction per card
  // Fulfills Section 5: Flashcard timer per card
  // Fulfills Section 6.1: Automatic audio playback
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    stopSpeaking();

    if (!currentItem) return;

    // Free practice uses its own direction setting, independently of scheduled review settings.
    const defaultDir = settings?.dir || 'de';
    if (activeMode === 'free') {
      setCurrentCardDir(freeRnd ? (Math.random() > 0.5 ? 'de' : 'fa') : freeDir);
    } else if (defaultDir === 'rand') {
      setCurrentCardDir(Math.random() > 0.5 ? 'de' : 'fa');
    } else if (activeMode === 'flash') {
      setCurrentCardDir(flashDir === 'rand' ? (Math.random() > 0.5 ? 'de' : 'fa') : flashDir);
    } else {
      setCurrentCardDir(defaultDir);
    }

    // Reset card-specific state (Section 10)
    setRevealedCardId(null);
    setCardTimerSec(0);

    const isFlashType = activeMode === 'flash' || activeMode === 'free' || activeMode === 'review';

    // Automatic TTS for question if German is shown (Section 6.1)
    if (isFlashType && settings?.auto && currentCardDir === 'de') {
      const w = currentItem as Word;
      speak(fullWord(w), {
        rate: settings.rate,
        vreg: settings.vreg,
        voiceName: settings.voice
      });
    }

    // Timer (Section 5)
    const revealSec = settings?.revealSec || 0;
    const showTimer = !!settings?.showTimer;

    if (isFlashType && (revealSec > 0 || showTimer)) {
      let elapsed = 0;
      timerRef.current = setInterval(() => {
        elapsed++;
        setCardTimerSec(elapsed);

        // Auto reveal when revealSec reached
        if (revealSec > 0 && elapsed >= revealSec) {
          clearInterval(timerRef.current);
          setRevealedCardId(currentItem.id);
        }
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopSpeaking();
    };
  }, [currentIndex, currentItem?.id, activeMode, freeDir, freeRnd, flashDir, settings?.dir]);

  // Advance to next question
  const advanceQuestion = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    stopSpeaking();
    setCurrentIndex(prev => prev + 1);
    setRevealedCardId(null);
    setUserInput('');
    setCasePrepInput('');
    setCaseArtInput('');
    setCaseResult(null);
    setAnswerResult(null);
    setHintLevel(0);
  };

  const handleFlashGrade = (grade: number) => {
    if (!currentItem) return;
    onRecordResult(currentItem, activeMode || 'flash', grade, false);
    if (grade === 0) {
      setQueue(prev => [...prev, currentItem.id]);
    }
    advanceQuestion();
  };

  const handleFreeKnow = (know: number) => {
    if (!currentItem) return;
    setKnownMap(prev => ({ ...prev, [currentItem.id]: know }));
    advanceQuestion();
  };

  // User manual reveal
  const handleRevealCard = () => {
    if (!currentItem) return;
    setRevealedCardId(currentItem.id);
    if (timerRef.current) clearInterval(timerRef.current);

    // Audio on reveal (Section 6.1 & 6.2)
    const w = currentItem as Word;
    if (settings?.auto || settings?.autoEx) {
      stopSpeaking();
      speak(fullWord(w), {
        rate: settings?.rate,
        vreg: settings?.vreg,
        voiceName: settings?.voice,
        onEnd: () => {
          if (settings?.autoEx && w.ex) {
            speak(w.ex, {
              rate: settings.rate,
              vreg: settings.vreg,
              voiceName: settings.voice
            });
          }
        }
      });
    }
  };

  // Fulfills Section 19: Check Case and Preposition Exercise with TWO separate blanks
  const handleCheckCaseAnswer = () => {
    if (!currentItem || answerResult) return;
    const q = currentItem as CaseQuestion;

    const prep = casePrepInput.trim().toLowerCase();
    const art = caseArtInput.trim().toLowerCase();

    if (!prep && !art) {
      onShowToast('لطفاً هر دو جای خالی را پر کنید.', true);
      return;
    }

    const prepExpected = q.prepAns.toLowerCase();
    const artExpected = q.artAns.toLowerCase();

    const isPrepOk = prep === prepExpected;
    const isArtOk = art === artExpected;

    setCaseResult({ prepOk: isPrepOk, artOk: isArtOk });

    let msg = '';
    const isBothOk = isPrepOk && isArtOk;

    if (isBothOk) {
      msg = `✔ آفرین! هر دو بخش درست است. (${q.prepAns} ${q.artAns})`;
    } else if (!isPrepOk && isArtOk) {
      msg = `❌ حرف اضافه نادرست است (درست: «${q.prepAns}») • آرتیکل درست بود («${q.artAns}»)`;
    } else if (isPrepOk && !isArtOk) {
      msg = `✔ حرف اضافه درست است («${q.prepAns}») • ❌ آرتیکل نادرست است (درست: «${q.artAns}»)`;
    } else {
      msg = `❌ هر دو نادرست است (حرف اضافه درست: «${q.prepAns}» • آرتیکل درست: «${q.artAns}»)`;
    }

    setAnswerResult({
      ok: isBothOk ? 1 : 0,
      exp: `${q.prepAns} ${q.artAns}`,
      msg
    });

    onRecordResult(q, 'case', isBothOk ? 2 : (isPrepOk || isArtOk ? 1 : 0), false);
    if (!isBothOk) {
      setQueue(prev => [...prev, q.id]);
    }
  };

  // Check standard interactive text exercises
  const handleCheckAnswer = () => {
    if (!currentItem || answerResult) return;
    const trimmed = userInput.trim();
    if (!trimmed) {
      onShowToast('لطفاً پاسخ را وارد کنید.', true);
      return;
    }

    const w = currentItem as Word;

    if (activeMode === 'conj') {
      const forms = w.conj.split('|');
      const isCorrect = forms.some(f => f.trim().toLowerCase() === trimmed.toLowerCase());
      const res = {
        ok: isCorrect ? 1 : 0,
        exp: forms[0] || w.de,
        msg: isCorrect ? undefined : `شکل درست: ${forms.join(' | ')}`
      };
      setAnswerResult(res);
      onRecordResult(w, 'conj', isCorrect ? 2 : 0, false);
      return;
    }

    if (activeMode === 'tense') {
      const expPrat = w.prat || '';
      const expPerf = w.perf || '';
      const isCorrect =
        trimmed.toLowerCase() === expPrat.toLowerCase() ||
        trimmed.toLowerCase() === expPerf.toLowerCase() ||
        trimmed.toLowerCase() === `er ${expPrat}`.toLowerCase();
      const res = {
        ok: isCorrect ? 1 : 0,
        exp: expPrat || expPerf,
        msg: isCorrect ? undefined : `شکل‌های درست: Prät: ${w.prat} • Perf: ${w.perf}`
      };
      setAnswerResult(res);
      onRecordResult(w, 'tense', isCorrect ? 2 : 0, false);
      return;
    }

    const r = checkWord(w, trimmed);
    setAnswerResult(r);
    onRecordResult(w, activeMode || 'cloze', r.ok ? (hintLevel > 0 ? 1 : 2) : 0, false);
    if (!r.ok) {
      setQueue(prev => [...prev, w.id]);
    }
  };

  // Open Full Word Profile Modal from ANY exercise (Section 21)
  const handleOpenWordProfile = () => {
    if (!currentItem) return;
    if (activeMode === 'case') {
      const q = currentItem as CaseQuestion;
      const cleanNoun = q.n.replace(/^(der|die|das)\s+/i, '').trim();
      const matched = words.find(w => w.de.toLowerCase() === cleanNoun.toLowerCase());
      if (matched) {
        setProfileModalWord(matched);
      } else {
        setProfileModalWord({
          id: q.id,
          de: cleanNoun,
          art: (q.n.match(/^(der|die|das)/i) || [''])[0].toLowerCase(),
          fa: q.fa,
          ex: q.ex,
          exFa: q.exFa,
          ex2: '',
          ex2Fa: '',
          notes: `${q.r}\nحالت دستوری: ${q.c}`,
          pos: 'اسم',
          lvl: 'A1',
          cat: 'گرامر و حالت‌ها',
          added: Date.now(),
          last: 0,
          due: 0,
          ivl: 0,
          ease: 2.5,
          stage: 0,
          ok: 0,
          bad: 0,
          res: '',
          syn: '',
          synFa: '',
          ant: '',
          antFa: '',
          pl: '',
          conj: '',
          prat: '',
          perf: '',
          sep: '',
          cloze: '',
          ans: '',
          acc: [],
          tags: '',
          img: ''
        });
      }
    } else {
      setProfileModalWord(currentItem as Word);
    }
  };

  // Unified clean card display (revealed face)
  const renderUnifiedWordCard = (w: Word) => {
    return (
      <div className="bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 space-y-3 text-right">
        {/* Top: Word, Article, Translation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 dark:border-slate-800 pb-2">
          <div className="flex items-center gap-2" dir="ltr">
            {w.art && (
              <span className={`px-2 py-0.5 rounded-lg font-bold text-xs ${
                w.art === 'der' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' :
                w.art === 'die' ? 'bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300' :
                'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
              }`}>
                {w.art}
              </span>
            )}
            <span className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-slate-100 font-sans">
              {w.de}
            </span>
            <button
              onClick={() => speak(fullWord(w), { rate: settings?.rate, vreg: settings?.vreg, voiceName: settings?.voice })}
              className="w-7 h-7 rounded-full bg-white dark:bg-slate-800 text-xs flex items-center justify-center shadow-xs"
              title="تلفظ"
            >
              🔊
            </button>
          </div>

          <div className="text-base md:text-lg font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">
            {w.fa}
          </div>
        </div>

        {/* Synonyms & Antonyms */}
        {(w.syn || w.ant) && (
          <div className="flex flex-wrap items-center gap-4 text-xs">
            {w.syn && (
              <div>
                <span className="font-bold text-[#1f5fbf] dark:text-[#7fb0ff]">مترادف: </span>
                <span className="font-semibold" dir="ltr">{w.syn}</span>
                {w.synFa && <span className="text-[#5d6676]"> ({w.synFa})</span>}
              </div>
            )}
            {w.ant && (
              <div>
                <span className="font-bold text-amber-600 dark:text-amber-400">متضاد: </span>
                <span className="font-semibold" dir="ltr">{w.ant}</span>
                {w.antFa && <span className="text-[#5d6676]"> ({w.antFa})</span>}
              </div>
            )}
          </div>
        )}

        {/* Example sentences - revealed ONLY when card is revealed (Section 11) */}
        {(w.ex || w.ex2) && (
          <div className="space-y-2 pt-1">
            {w.ex && (
              <div className="bg-white dark:bg-[#1b2029] p-3 rounded-xl border border-slate-200/60 dark:border-slate-800 space-y-1">
                <div className="flex items-center justify-between gap-2" dir="ltr">
                  <p className="text-xs md:text-sm font-semibold text-slate-800 dark:text-slate-200 text-left">
                    {w.ex}
                  </p>
                  <button onClick={() => speak(w.ex, { rate: settings?.rate, vreg: settings?.vreg, voiceName: settings?.voice })} className="text-xs">🔊</button>
                </div>
                {w.exFa && (
                  <p className="text-xs text-[#5d6676] dark:text-[#a3adbd] text-right" dir="rtl">
                    {w.exFa}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Verb table with regular endings (blue) and irregular stem changes (red) - shared logic */}
        {w.conj && (
          <div className="text-xs bg-white dark:bg-[#1b2029] p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-800 flex flex-wrap gap-2 justify-between">
            {splitConj(w.conj).map((f, i) => (
              <span key={i} dir="ltr" className="text-slate-600 dark:text-slate-300">
                <b className="text-slate-400">{P6[i]}:</b>{' '}
                <HighlightedVerbForm verb={w.de} form={f} pronounIndex={i} sep={w.sep} />
              </span>
            ))}
          </div>
        )}

        {/* Image if available */}
        {w.img && (
          <div className="text-center pt-1">
            <img src={w.img} alt={w.de} className="max-h-40 mx-auto rounded-xl object-contain shadow-xs" />
          </div>
        )}
      </div>
    );
  };

  // ==========================================
  // If NO active mode is selected: Show Menu
  // ==========================================
  if (!activeMode) {
    return (
      <div className="space-y-4 text-right max-w-2xl mx-auto">
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 shadow-xs">
          <h2 className="text-base md:text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">
            🎯 مرکز تمرین‌های زبان آلمانی
          </h2>
          <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">
            مهارت‌های واژگان، گرامر، زمان‌ها و آرتیکل‌ها را با سیستم‌های فاصله‌دار و تمرین‌های تعاملی تقویت کنید.
          </p>
        </div>

        <div className="space-y-2.5">
          {(Object.keys(EXERCISE_NAMES) as ExerciseMode[]).map(mode => {
            const info = EXERCISE_NAMES[mode];
            return (
              <div
                key={mode}
                className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-3.5 hover:border-[#1f5fbf] transition flex items-center justify-between gap-3 shadow-xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-2xl flex-shrink-0">{info.icon}</span>
                  <div className="min-w-0">
                    <b className="text-sm md:text-base text-slate-900 dark:text-slate-100 block">
                      {info.title}
                    </b>
                    <span className="text-xs text-[#5d6676] dark:text-[#a3adbd] truncate block">
                      {info.desc}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => onSelectMode(mode)}
                  className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-4 py-2 rounded-xl text-xs md:text-sm font-bold shadow-xs hover:opacity-95 transition flex-shrink-0"
                >
                  شروع ▶
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Flashcard setup modal if needed
  if (activeMode === 'flash' && !isFlashConfigured) {
    return (
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-5 md:p-6 shadow-sm space-y-4 text-right max-w-xl mx-auto">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h2 className="text-base md:text-lg font-bold flex items-center gap-2">
            <span>🃏</span>
            <span>تنظیمات شروع جلسهٔ فلش‌کارت</span>
          </h2>
          <button
            onClick={() => onSelectMode(null)}
            className="text-xs bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 px-3 py-1 rounded-xl font-semibold"
          >
            ↩ بازگشت
          </button>
        </div>

        <div>
          <label className="block text-xs font-bold mb-1.5">تمرین مخصوص یک دستهٔ خاص (اختیاری):</label>
          <select
            value={flashCat}
            onChange={e => setFlashCat(e.target.value)}
            className="w-full bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3.5 py-2 text-xs md:text-sm outline-none"
          >
            <option value="">همهٔ دسته‌ها (کلیت واژگان)</option>
            {categories.map(([c, n]) => (
              <option key={c} value={c}>
                {c} ({n} واژه)
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold mb-1.5">کدام جهت را می‌خواهید تمرین کنید؟</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              onClick={() => {
                setFlashDir('de');
                setIsFlashConfigured(true);
              }}
              className="py-3 px-3 bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white rounded-xl font-bold text-xs md:text-sm shadow-xs transition"
            >
              🇩🇪 آلمانی ← فارسی
            </button>
            <button
              onClick={() => {
                setFlashDir('fa');
                setIsFlashConfigured(true);
              }}
              className="py-3 px-3 bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white rounded-xl font-bold text-xs md:text-sm shadow-xs transition"
            >
              🇮🇷 فارسی ← آلمانی
            </button>
            <button
              onClick={() => {
                setFlashDir('rand');
                setIsFlashConfigured(true);
              }}
              className="py-3 px-3 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold text-xs md:text-sm shadow-xs transition"
            >
              🔀 تصادفی مستقل هر کارت
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // Independent Free Category Review setup
  // ==========================================
  if (activeMode === 'free' && !isFreeStarted) {
    const selectedCount = words.filter(w => !freeCat || w.cat === freeCat).length;


    return (
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-5 md:p-6 shadow-sm space-y-5 text-right max-w-xl mx-auto">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h2 className="text-base md:text-lg font-bold flex items-center gap-2"><span>📚</span> مرور آزاد دسته</h2>
          <button onClick={() => onSelectMode(null)} className="text-xs bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 px-3 py-1 rounded-xl font-semibold">↩ بازگشت</button>
        </div>
        <div>
          <label className="block text-xs font-bold mb-1.5">دستهٔ واژگان</label>
          <select value={freeCat} onChange={e => { setFreeCat(e.target.value); }} className="w-full bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3.5 py-2 text-sm">
            <option value="">همهٔ دسته‌ها ({words.length} واژه)</option>
            {categories.map(([cat, count]) => <option key={cat} value={cat}>{cat} ({count} واژه)</option>)}
          </select>
          <p className="text-xs text-[#5d6676] dark:text-[#a3adbd] mt-1.5">{selectedCount} واژه در این انتخاب؛ مستقل از سررسید و جعبه‌های لایتنر.</p>
        </div>
        <div>
          <label className="block text-xs font-bold mb-1.5">جهت تمرین</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button onClick={() => { setFreeDir('de'); setFreeRnd(false); }} className={`py-3 px-3 rounded-xl font-bold text-xs md:text-sm transition ${!freeRnd && freeDir === 'de' ? 'bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>🇩🇪 آلمانی ← فارسی</button>
            <button onClick={() => { setFreeDir('fa'); setFreeRnd(false); }} className={`py-3 px-3 rounded-xl font-bold text-xs md:text-sm transition ${!freeRnd && freeDir === 'fa' ? 'bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>🇮🇷 فارسی ← آلمانی</button>
            <button onClick={() => { setFreeRnd(true); }} className={`py-3 px-3 rounded-xl font-bold text-xs md:text-sm transition ${freeRnd ? 'bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>🔀 تصادفی برای هر کارت</button>
          </div>
        </div>
        <button disabled={selectedCount === 0} onClick={() => {
          const freeWords = words.filter(w => !freeCat || w.cat === freeCat);
          setQueue(freeWords.map(w => w.id));
          setCurrentIndex(0);
          setKnownMap({});
          setRevealedCardId(null);
          setIsFreeStarted(true);
        }} className="w-full bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] disabled:opacity-40 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-md">
          {selectedCount ? `شروع مرور (${selectedCount} واژه) ▶` : 'این دسته واژه‌ای ندارد'}
        </button>
        {selectedCount === 0 && <p className="text-sm text-amber-700 dark:text-amber-300">این دسته واژه‌ای ندارد. دستهٔ دیگری انتخاب کنید.</p>}
      </div>
    );
  }

  // ==========================================
  // Active Exercise Runner
  // ==========================================
  const progressPercent = queue.length > 0 ? Math.round(((currentIndex + 1) / queue.length) * 100) : 0;
  const isFlashType = activeMode === 'flash' || activeMode === 'free' || activeMode === 'review' || activeMode === 'daily';
  const isCardRevealed = !!currentItem && revealedCardId === currentItem.id;

  if (queue.length === 0 || currentIndex >= queue.length) {
    return (
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-7 text-center space-y-4 max-w-xl mx-auto shadow-sm">
        <span className="text-4xl block">🎉</span>
        <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100">
          تبریک! تمرین به پایان رسید.
        </h3>
        <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">
          تمامی پرسش‌های این بخش با موفقیت مرور و بررسی شدند.
        </p>
        <button
          onClick={() => onSelectMode(null)}
          className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-6 py-2.5 rounded-xl font-bold text-xs md:text-sm shadow-md"
        >
          بازگشت به مرکز تمرین‌ها
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-right max-w-2xl mx-auto pb-10">
      {/* Exercise Top Bar */}
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl px-4 py-2.5 flex items-center justify-between gap-2 shadow-xs">
        {/* Help + Title */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onOpenHelp(activeMode)}
            className="bg-blue-50 text-[#1f5fbf] hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 px-2.5 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1"
          >
            ❓ راهنما
          </button>
          <span className="font-extrabold text-sm md:text-base text-slate-900 dark:text-slate-100">
            {EXERCISE_NAMES[activeMode]?.title}
          </span>
        </div>

        {/* Full Word Profile button (Section 21) + Exit button */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenWordProfile}
            className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 px-2.5 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1"
            title="مشاهده شناسنامه کامل واژه بدون وقفه در تمرین"
          >
            <span>📖</span>
            <span className="hidden sm:inline">شناسنامه واژه</span>
          </button>

          <button
            onClick={() => onSelectMode(null)}
            className="text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1 rounded-xl font-semibold transition"
          >
            خروج ✕
          </button>
        </div>
      </div>

      {/* Progress & Subtitle */}
      <div className="space-y-1.5">
        <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
          <div
            className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] h-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-[#5d6676] dark:text-[#a3adbd]">
          <span className="font-medium">
            سؤال {currentIndex + 1} از {queue.length}
            {settings?.showTimer && cardTimerSec > 0 && (
              <span className="mr-2 px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono">
                ⏱ {cardTimerSec}s
              </span>
            )}
          </span>
          <span>{progressPercent}٪ تکمیل</span>
        </div>
      </div>

      {/* Active Card Body */}
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-5 md:p-7 shadow-sm space-y-4">
        {/* ========================================================= */}
        {/* FLASHCARD / REVIEW CARD (Sections 10 & 11) */}
        {/* ========================================================= */}
        {isFlashType && (() => {
          const w = currentItem as Word;
          const isFaDir = currentCardDir === 'fa';

          return (
            <div className="space-y-4 text-center">
              {/* Question Face */}
              {!isFaDir ? (
                <div className="py-4 space-y-2">
                  <div className="flex items-center justify-center gap-2" dir="ltr">
                    {w.art && (
                      <span className={`px-2.5 py-0.5 rounded-lg font-bold text-sm ${
                        w.art === 'der' ? 'text-blue-600 dark:text-blue-400' :
                        w.art === 'die' ? 'text-pink-600 dark:text-pink-400' :
                        'text-emerald-600 dark:text-emerald-400'
                      }`}>
                        {w.art}
                      </span>
                    )}
                    <span className="text-3xl md:text-4xl font-extrabold font-sans text-slate-900 dark:text-slate-100">
                      {w.de}
                    </span>
                    <button
                      onClick={() => speak(fullWord(w), { rate: settings?.rate, vreg: settings?.vreg, voiceName: settings?.voice })}
                      className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-sm flex items-center justify-center"
                    >
                      🔊
                    </button>
                  </div>
                  {w.pos && <span className="text-xs text-[#5d6676]">{w.pos}</span>}
                </div>
              ) : (
                <div className="py-4 space-y-2">
                  <div className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-slate-100" dir="rtl">
                    {w.fa}
                  </div>
                  {w.pos && <span className="text-xs text-[#5d6676]">{w.pos}</span>}
                </div>
              )}

              {/* Reveal Action Button (Section 10 & 11: Examples & answers strictly hidden until revealed) */}
              {!isCardRevealed ? (
                <div className="pt-2">
                  <button
                    onClick={handleRevealCard}
                    className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-md hover:opacity-95 transition"
                  >
                    👁 {isFaDir ? 'نمایش لغت آلمانی و جزئیات' : 'نمایش ترجمه و جزئیات'}
                  </button>
                </div>
              ) : (
                <>
                  {renderUnifiedWordCard(w)}

                  {/* Rating / Decision Buttons */}
                  {activeMode === 'free' ? (
                    <div className="flex items-center justify-center gap-3 pt-3">
                      <button
                        onClick={() => handleFreeKnow(0)}
                        className="bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-300 border border-red-200 dark:border-red-800 px-5 py-2.5 rounded-xl font-bold text-xs md:text-sm transition flex-1 max-w-xs"
                      >
                        ❌ هنوز نه
                      </button>
                      <button
                        onClick={() => handleFreeKnow(1)}
                        className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-5 py-2.5 rounded-xl font-bold text-xs md:text-sm transition flex-1 max-w-xs"
                      >
                        ✅ بلدم
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3">
                      <button
                        onClick={() => handleFlashGrade(0)}
                        className="bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-300 border border-red-200 dark:border-red-900 py-2.5 px-2 rounded-xl text-xs font-bold"
                      >
                        دوباره · {intervalPreview(w, 0, settings?.ivlMod || 1.0)}
                      </button>
                      <button
                        onClick={() => handleFlashGrade(1)}
                        className="bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-900 py-2.5 px-2 rounded-xl text-xs font-bold"
                      >
                        سخت · {intervalPreview(w, 1, settings?.ivlMod || 1.0)}
                      </button>
                      <button
                        onClick={() => handleFlashGrade(2)}
                        className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 py-2.5 px-2 rounded-xl text-xs font-bold"
                      >
                        خوب · {intervalPreview(w, 2, settings?.ivlMod || 1.0)}
                      </button>
                      <button
                        onClick={() => handleFlashGrade(3)}
                        className="bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-900 py-2.5 px-2 rounded-xl text-xs font-bold"
                      >
                        آسان · {intervalPreview(w, 3, settings?.ivlMod || 1.0)}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })()}

        {/* ========================================================= */}
        {/* ARTICLE PRACTICE (der / die / das) */}
        {/* ========================================================= */}
        {activeMode === 'art' && (() => {
          const w = currentItem as Word;
          return (
            <div className="space-y-4 text-center">
              <p className="text-xs text-[#5d6676]">آرتیکل درست برای این اسم کدام است؟</p>
              <div className="text-3xl font-extrabold font-sans py-2" dir="ltr">
                {w.de}
              </div>
              <p className="text-sm font-semibold text-[#1f5fbf]">{w.fa}</p>

              {!answerResult ? (
                <div className="grid grid-cols-3 gap-3 pt-2 max-w-sm mx-auto">
                  {['der', 'die', 'das'].map(art => (
                    <button
                      key={art}
                      onClick={() => {
                        const ok = w.art.toLowerCase() === art;
                        setAnswerResult({
                          ok: ok ? 1 : 0,
                          exp: `${art} ${w.de}`,
                          msg: ok ? undefined : `آرتیکل درست: ${w.art}`
                        });
                        onRecordResult(w, 'art', ok ? 2 : 0, false);
                      }}
                      className={`py-3 rounded-2xl font-bold text-lg font-sans transition ${
                        art === 'der' ? 'bg-blue-100 hover:bg-blue-200 text-blue-900' :
                        art === 'die' ? 'bg-pink-100 hover:bg-pink-200 text-pink-900' :
                        'bg-emerald-100 hover:bg-emerald-200 text-emerald-900'
                      }`}
                    >
                      {art}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  <div className={`p-3 rounded-xl text-sm font-bold ${
                    answerResult.ok ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {answerResult.ok ? '✔ آفرین! درست بود.' : `✘ ${answerResult.msg}`}
                  </div>
                  {renderUnifiedWordCard(w)}
                  <button
                    onClick={advanceQuestion}
                    className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-6 py-2 rounded-xl text-xs md:text-sm font-bold shadow-xs"
                  >
                    سؤال بعدی ⬅
                  </button>
                </div>
              )}
            </div>
          );
        })()}

        {/* ========================================================= */}
        {/* Fulfills Section 19: REDESIGNED CASE AND PREPOSITION WITH 2 BLANKS */}
        {/* ========================================================= */}
        {activeMode === 'case' && (() => {
          const q = currentItem as CaseQuestion;
          const bareNoun = q.n.replace(/^(der|die|das|den|dem|des)\s+/i, '').trim();
          const remainingHints = Math.max(0, 2 - hintLevel);

          return (
            <div className="space-y-4 text-center">
              <p className="text-xs font-semibold text-[#5d6676]">
                دو جای خالی زیر را کامل کنید (حرف اضافه و آرتیکل):
              </p>

              {/* Sentence with 2 blanks */}
              <div className="text-xl md:text-2xl font-bold font-sans py-2 text-slate-900 dark:text-slate-100" dir="ltr">
                {q.s}
              </div>

              <div className="text-xs text-[#5d6676]">
                کلمه مرجع: <span className="font-bold font-sans" dir="ltr">({bareNoun})</span> — {q.fa}
              </div>

              {!answerResult ? (
                <div className="space-y-3 pt-2 max-w-md mx-auto">
                  {/* Two Separate Inputs (Section 19) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-right">
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 dark:text-slate-300">
                        ۱. حرف اضافه (Preposition):
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        placeholder="مثلاً auf / in / mit..."
                        value={casePrepInput}
                        onChange={e => setCasePrepInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleCheckCaseAnswer();
                        }}
                        className="w-full bg-slate-50 dark:bg-[#141923] border-2 border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-center font-bold text-base outline-none font-sans focus:border-[#1f5fbf]"
                      />
                    </div>

                    <div>
                      <label className="block font-bold mb-1 text-slate-700 dark:text-slate-300">
                        ۲. آرتیکل (Article):
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        placeholder="مثلاً dem / den / die..."
                        value={caseArtInput}
                        onChange={e => setCaseArtInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleCheckCaseAnswer();
                        }}
                        className="w-full bg-slate-50 dark:bg-[#141923] border-2 border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-center font-bold text-base outline-none font-sans focus:border-[#1f5fbf]"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-2 pt-1">
                    <button
                      onClick={handleCheckCaseAnswer}
                      className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-6 py-2 rounded-xl text-xs md:text-sm font-bold shadow-xs flex-1"
                    >
                      بررسی دو پاسخ
                    </button>

                    <button
                      onClick={() => setHintLevel(prev => Math.min(2, prev + 1))}
                      disabled={remainingHints === 0}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition ${
                        remainingHints > 0
                          ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300'
                          : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                      }`}
                    >
                      💡 راهنمایی ({remainingHints})
                    </button>
                  </div>

                  {hintLevel >= 1 && (
                    <div className="p-2.5 bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-900 dark:text-amber-200 text-right space-y-1">
                      <p>
                        <b>راهنمایی ۱ (حالت دستوری): </b>
                        <span>{q.c}</span>
                      </p>
                      {hintLevel >= 2 && (
                        <p className="border-t border-amber-200/60 pt-1">
                          <b>راهنمایی ۲ (آرتیکل اسم / حرف اول): </b>
                          <span dir="ltr">({q.n}) — شروع پاسخ با «{q.prepAns.slice(0, 1)}...»</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  <div className={`p-3 rounded-xl text-sm font-bold ${
                    answerResult.ok ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {answerResult.msg}
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-[#141923] rounded-xl text-xs text-right space-y-1">
                    <p><b>قاعده:</b> {q.r}</p>
                    <p dir="ltr" className="font-semibold text-slate-800 dark:text-slate-200">{q.ex}</p>
                    <p className="text-[#5d6676]">{q.exFa}</p>
                  </div>
                  <button
                    onClick={advanceQuestion}
                    className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-6 py-2 rounded-xl text-xs md:text-sm font-bold shadow-xs"
                  >
                    سؤال بعدی ⬅
                  </button>
                </div>
              )}
            </div>
          );
        })()}

        {/* ========================================================= */}
        {/* OTHER INTERACTIVE EXERCISES */}
        {/* ========================================================= */}
        {(activeMode === 'conj' || activeMode === 'tense' || activeMode === 'cloze' || activeMode === 'plural' || activeMode === 'dict' || activeMode === 'prod') && (() => {
          const w = currentItem as Word;
          const remainingHints = Math.max(0, 2 - hintLevel);

          return (
            <div className="space-y-4 text-center">
              {activeMode === 'conj' && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-[#5d6676]">صرف فعل برای ضمیر داده‌شده:</p>
                  <div className="text-2xl font-bold font-sans py-1 text-slate-900 dark:text-slate-100" dir="ltr">
                    er/sie/es _____
                  </div>
                  <div className="text-xs text-[#5d6676]">
                    مصدر: <span className="font-bold font-sans" dir="ltr">{w.de}</span> ({w.fa})
                  </div>
                </div>
              )}

              {activeMode === 'tense' && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-[#5d6676]">فعل را به Präteritum یا Perfekt ببرید:</p>
                  <div className="text-2xl font-bold font-sans py-1 text-slate-900 dark:text-slate-100" dir="ltr">
                    {w.de}
                  </div>
                  <div className="text-xs text-[#5d6676]">
                    ترجمه: <span className="font-bold">{w.fa}</span>
                  </div>
                </div>
              )}

              {activeMode === 'cloze' && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-[#5d6676]">جای خالی را با کلمه مناسب تکمیل کنید:</p>
                  <div className="text-xl md:text-2xl font-bold font-sans py-2 text-slate-900 dark:text-slate-100 leading-relaxed" dir="ltr">
                    {w.cloze || `${w.de} _____`}
                  </div>
                  <p className="text-xs text-[#5d6676]">({w.fa})</p>
                </div>
              )}

              {activeMode === 'plural' && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-[#5d6676]">شکل جمع این اسم را بنویسید:</p>
                  <div className="text-2xl font-bold font-sans py-1" dir="ltr">
                    {fullWord(w)}
                  </div>
                  <p className="text-xs text-[#5d6676]">({w.fa})</p>
                </div>
              )}

              {activeMode === 'dict' && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-[#5d6676]">واژه را بشنوید و بنویسید:</p>
                  <button
                    onClick={() => speak(fullWord(w), { rate: settings?.rate, vreg: settings?.vreg, voiceName: settings?.voice })}
                    className="w-12 h-12 mx-auto rounded-full bg-[#1f5fbf] text-white text-xl flex items-center justify-center shadow-md hover:opacity-95"
                  >
                    🔊
                  </button>
                  <p className="text-xs text-[#5d6676]">معنی: {w.fa}</p>
                </div>
              )}

              {activeMode === 'prod' && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-[#5d6676]">معادل آلمانی را تایپ کنید (با آرتیکل در صورت اسم بودن):</p>
                  <div className="text-2xl md:text-3xl font-extrabold text-[#1f5fbf] dark:text-[#7fb0ff] py-1">
                    {w.fa}
                  </div>
                  <p className="text-xs text-[#5d6676]">نوع کلمه: {w.pos}</p>
                </div>
              )}

              {/* Input Box and Action Bar */}
              {!answerResult ? (
                <div className="space-y-3 pt-2 max-w-sm mx-auto">
                  <input
                    type="text"
                    dir="ltr"
                    placeholder="پاسخ را اینجا تایپ کنید..."
                    value={userInput}
                    onChange={e => setUserInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleCheckAnswer();
                    }}
                    className="w-full bg-slate-50 dark:bg-[#141923] border-2 border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-center font-bold text-base md:text-lg outline-none font-sans"
                  />

                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={handleCheckAnswer}
                      className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-6 py-2 rounded-xl text-xs md:text-sm font-bold shadow-xs flex-1"
                    >
                      بررسی پاسخ
                    </button>

                    <button
                      onClick={() => setHintLevel(prev => Math.min(2, prev + 1))}
                      disabled={remainingHints === 0}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition ${
                        remainingHints > 0
                          ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300'
                          : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                      }`}
                    >
                      💡 راهنمایی ({remainingHints})
                    </button>
                  </div>

                  {hintLevel > 0 && (
                    <div className="p-2.5 bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 rounded-xl text-xs text-amber-900 dark:text-amber-200" dir="ltr">
                      {w.ans ? w.ans.slice(0, hintLevel * 2) + '...' : w.de.slice(0, hintLevel * 2) + '...'}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  <div className={`p-3 rounded-xl text-sm font-bold ${
                    answerResult.ok ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {answerResult.ok ? '✔ درست است! آفرین.' : `✘ ${answerResult.msg || 'پاسخ نادرست است.'}`}
                  </div>

                  {renderUnifiedWordCard(w)}

                  <button
                    onClick={advanceQuestion}
                    className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-6 py-2 rounded-xl text-xs md:text-sm font-bold shadow-xs"
                  >
                    سؤال بعدی ⬅
                  </button>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Fulfills Section 21: Full Word Profile Modal from Exercise */}
      {profileModalWord && (
        <WordDetailModal
          word={profileModalWord}
          onClose={() => setProfileModalWord(null)}
          onEdit={() => {}}
          onDelete={() => {}}
          onImageChange={() => {}}
        />
      )}
    </div>
  );
};
