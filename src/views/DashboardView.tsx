import React from 'react';
import { AppState, Word } from '../types';
import {
  dayStart,
  dstr,
  formatGregorianMonthDayNumeric,
  formatShamsiDayMonthNumeric,
  formatGregorianNumeric,
  formatShamsiFullNumeric,
  ymd,
  dueText,
  DAY,
  today
} from '../utils/dates';
import { isLeech, isWeak, streakCount, auditWord, fullWord } from '../utils/storage';
import { PageOverlay } from '../components/PageOverlay';
import { WeaknessHeatmap } from '../components/WeaknessHeatmap';
import { AchievementsPanel } from '../components/AchievementsPanel';

interface DashboardViewProps {
  state: AppState;
  ignoredQualityIds: Record<string, number>;
  onNavigate: (view: string) => void;
  onOpenQualityModal?: () => void;
  onPracticeWords: (wordIds: string[], intent?: 'review' | 'targeted' | 'hard') => void;
  onUpdateDailyNewTarget: (target: number) => void;
  onSelectWord: (word: Word) => void;
}

const LVL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
const LVL_CLS: Record<string, string> = {
  A1: 'bg-emerald-500',
  A2: 'bg-sky-500',
  B1: 'bg-blue-600',
  B2: 'bg-violet-500',
  C1: 'bg-purple-600',
  C2: 'bg-fuchsia-600'
};

/** دقیقه‌ای یک‌بار به‌روز می‌شود — تا شمارش «سررسید» بدون رندر بی‌پایان تازه بماند */
const useMinuteTick = (): number => {
  const [minute, setMinute] = React.useState(() => Math.floor(Date.now() / 60000));
  React.useEffect(() => {
    const t = setInterval(() => setMinute(Math.floor(Date.now() / 60000)), 60000);
    return () => clearInterval(t);
  }, []);
  return minute * 60000;
};

/* ─────────────── صحنهٔ پویای زمان روز (درخواست کاربر ۳) ───────────────
 * یک نمای انیمیشنی از خط افق و خورشید/ماه که با ساعت روز هماهنگ است:
 *  - صبح (۵ تا ۱۱): خورشید از افق شرق بالا می‌آید — رنگ‌های صورتی و کهربایی
 *  - ظهر (۱۱ تا ۱۶): خورشید در بالای آسمان — آبی روشن
 *  - عصر (۱۶ تا ۲۱): خورشید در افق غرب غروب می‌کند — نارنجی و بنفش
 *  - شب (۲۱ تا ۵): ماه و ستاره‌ها — نیلوی تیره
 * صحنه خط افق همیشه دیده می‌شود و خورشید/ماه با انیمیشن روی آن حرکت می‌کنند.
 */
const TimeScene: React.FC<{ hour: number; minute: number }> = ({ hour, minute }) => {
  const totalMin = hour * 60 + minute;
  // خورشید از ساعت ۶ تا ۱۸ روی آسمان است.
  const dayProg = Math.max(0, Math.min(1, (totalMin - 6 * 60) / (12 * 60)));
  const isDay = hour >= 6 && hour < 18; // خورشید در این ساعت‌ها روی آسمان است

  // موقعیت خورشید روی قوس افقی: ۰٪ شرق، ۱۰۰٪ غرب؛ ارتفاع قوس سینوسی.
  const sunX = 8 + dayProg * 84;
  const sunY = 85 - Math.sin(dayProg * Math.PI) * 65;

  // فازها بر اساس ساعت روز هماهنگ با خوش‌آمدگویی فارسی:
  //  - ۰ تا ۵ و ۲۱ به بعد: شب (ماه و ستاره)
  //  - ۵ تا ۱۲: صبح (طلوع و قبل از ظهر — خورشید قبل از ۶ هنوز پشت افق)
  //  - ۱۲ تا ۱۷: ظهر (خورشید در اوج)
  //  - ۱۷ تا ۲۱: عصر (غروب — خورشید قبل از ۱۸ هنوز پایین افق غرب)
  const phase: 'morning' | 'noon' | 'evening' | 'night' =
    hour < 5 || hour >= 21 ? 'night' :
    hour < 12 ? 'morning' :
    hour < 17 ? 'noon' :
    'evening';

  const skyGrad: Record<string, string> = {
    morning: 'from-amber-100 via-sky-200 to-sky-100',
    noon: 'from-sky-300 via-sky-200 to-blue-100',
    evening: 'from-orange-200 via-rose-300 to-purple-200',
    night: 'from-indigo-900 via-indigo-800 to-slate-800'
  };

  // ستاره‌ها — موقعیت ثابت، چشمک‌زن
  const stars = React.useMemo(() => Array.from({ length: 22 }).map((_, i) => ({
    id: i,
    x: (i * 17 + 7) % 100,
    y: (i * 11 + 3) % 55,
    size: i % 4 === 0 ? 2 : 1.5,
    delay: (i % 7) * 0.3,
    dur: 1.8 + (i % 4) * 0.5
  })), []);

  // ابرها — برای حالت روز (با درفت آرام)
  const clouds = React.useMemo(() => [
    { y: 28, w: 36, dur: 28, delay: 0 },
    { y: 50, w: 28, dur: 34, delay: -8 },
    { y: 18, w: 32, dur: 30, delay: -14 }
  ], []);

  const phaseFa = phase === 'night' ? 'شب' : phase === 'morning' ? 'صبح' : phase === 'noon' ? 'ظهر' : 'عصر';

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-xl border border-purple-200/70 dark:border-purple-800/70"
      role="img"
      aria-label={`آسمان ${phaseFa}`}
    >
      <style>{`
        @keyframes wort-twinkle { 0%, 100% { opacity: 0.25; transform: scale(0.85); } 50% { opacity: 1; transform: scale(1); } }
        @keyframes wort-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
        @keyframes wort-cloud-drift { 0% { transform: translateX(-120%); } 100% { transform: translateX(120%); } }
        @keyframes wort-sun-glow { 0%, 100% { box-shadow: 0 0 24px 6px rgba(253, 224, 71, 0.55); } 50% { box-shadow: 0 0 32px 10px rgba(253, 224, 71, 0.75); } }
      `}</style>

      {/* آسمان — گرادیان بر اساس فاز */}
      <div className={`absolute inset-0 bg-gradient-to-b ${skyGrad[phase]} transition-all duration-1000`} />

      {/* هالهٔ رنگی افق در غروب/طلوع */}
      {(phase === 'morning' || phase === 'evening') && (
        <div
          className="absolute inset-x-0 bottom-6 h-14"
          style={{
            background: phase === 'morning'
              ? 'linear-gradient(to top, rgba(251,146,60,0.35), rgba(251,146,60,0))'
              : 'linear-gradient(to top, rgba(244,114,182,0.4), rgba(244,114,182,0))'
          }}
        />
      )}

      {/* ستاره‌ها — شب */}
      {phase === 'night' && stars.map(s => (
        <div
          key={s.id}
          className="absolute rounded-full bg-white"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            animation: `wort-twinkle ${s.dur}s ease-in-out infinite`,
            animationDelay: `${s.delay}s`
          }}
        />
      ))}

      {/* خورشید — روز */}
      {isDay && (
        <div
          className="absolute"
          style={{
            left: `${sunX}%`,
            top: `${sunY}%`,
            transform: 'translate(-50%, -50%)',
            animation: 'wort-float 5s ease-in-out infinite'
          }}
        >
          <div
            className="w-9 h-9 md:w-11 md:h-11 rounded-full"
            style={{
              animation: 'wort-sun-glow 3s ease-in-out infinite',
              background: phase === 'morning' || phase === 'evening'
                ? 'radial-gradient(circle at 40% 40%, #fef9c3, #fbbf24 70%, #f97316)'
                : 'radial-gradient(circle at 40% 40%, #fef9c3, #fde047 60%, #facc15)'
            }}
          />
        </div>
      )}

      {/* ماه — شب */}
      {phase === 'night' && (
        <div
          className="absolute"
          style={{
            left: '72%',
            top: '24%',
            transform: 'translate(-50%, -50%)',
            animation: 'wort-float 6s ease-in-out infinite'
          }}
        >
          <div
            className="relative w-9 h-9 md:w-10 md:h-10 rounded-full bg-slate-100"
            style={{ boxShadow: '0 0 22px 6px rgba(241, 245, 249, 0.5)' }}
          >
            <div className="absolute top-1 left-2 w-1.5 h-1.5 rounded-full bg-slate-300/60" aria-hidden="true" />
            <div className="absolute bottom-2 right-1.5 w-1 h-1 rounded-full bg-slate-300/60" aria-hidden="true" />
          </div>
        </div>
      )}

      {/* ابرها — روز */}
      {isDay && clouds.map((c, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            top: `${c.y}%`,
            left: 0,
            width: `${c.w}%`,
            animation: `wort-cloud-drift ${c.dur}s linear infinite`,
            animationDelay: `${c.delay}s`
          }}
        >
          <svg viewBox="0 0 100 40" className="w-full" preserveAspectRatio="none" aria-hidden="true">
            <path
              d="M 15 30 Q 5 30 5 22 Q 5 12 18 14 Q 22 5 35 8 Q 50 0 60 10 Q 75 5 80 18 Q 95 18 95 28 Q 95 35 85 35 L 20 35 Q 10 35 15 30 Z"
              fill={phase === 'evening' ? 'rgba(254, 215, 170, 0.85)' : 'rgba(255, 255, 255, 0.85)'}
            />
          </svg>
        </div>
      ))}

      {/* خط افق — زمین و خط */}
      <div className="absolute bottom-0 inset-x-0 h-6 bg-gradient-to-t from-emerald-700/40 to-transparent" />
      <div className="absolute bottom-5 inset-x-0 h-px bg-emerald-800/25" />
    </div>
  );
};

/* ─────────────── بخش جمع‌شوندهٔ داشبورد (درخواست کاربر ۲) ───────────────
 * همهٔ بخش‌ها به‌جز دو تای اول زیر عنوانشان جمع می‌شوند.
 * فقط یک بخش در هر لحظه باز است (یا هیچ‌کدام).
 * روی عنوان کلیک می‌کنی → باز می‌شود؛ روی عنوان دیگری کلیک می‌کنی →
 * قبلی بسته می‌شود و این یکی باز می‌شود. */
const AccordionSection: React.FC<{
  id: string;
  icon: string;
  title: string;
  badge?: React.ReactNode;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  children: React.ReactNode;
}> = ({ id, icon, title, badge, openId, setOpenId, children }) => {
  const open = openId === id;
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpenId(open ? null : id)}
        aria-expanded={open}
        className="w-full px-4 md:px-5 py-3.5 flex items-center justify-between gap-2 text-right rounded-2xl bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800/40 transition active:scale-[0.99]"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-xl flex-shrink-0">{icon}</span>
          <span className="text-sm md:text-base font-bold text-slate-900 dark:text-slate-100 truncate">{title}</span>
        </span>
        <span className="flex items-center gap-2 flex-shrink-0">
          {badge}
          <span className={`text-slate-500 dark:text-slate-400 text-xs transition-transform duration-300 ${open ? 'rotate-180' : ''}`} aria-hidden="true">▼</span>
        </span>
      </button>
      {open && <div>{children}</div>}
    </div>
  );
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  state,
  ignoredQualityIds,
  onNavigate,
  onPracticeWords,
  onUpdateDailyNewTarget,
  onSelectWord
}) => {
  const n = useMinuteTick();
  const [stageView, setStageView] = React.useState<string | null>(null);
  const [stageQuery, setStageQuery] = React.useState('');
  const [dueQuery, setDueQuery] = React.useState('');
  /* درخواست کاربر ۲: بخش‌های داشبورد (به‌جز دو تای اول) زیر عنوانشان جمع می‌شوند.
   * همیشه یا هیچ بخشی باز نیست یا فقط یکی. */
  const [openSection, setOpenSection] = React.useState<string | null>(null);
  /* معنی واژه‌ها در فهرست مراحل تسلط — پیش‌فرض مخفی، با آیکن چشم نمایش داده می‌شود */
  const [revealedFa, setRevealedFa] = React.useState<Set<string>>(new Set());
  const toggleFa = (id: string) => {
    setRevealedFa(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  /* ───────────── آمار — یک پاس روی داده‌ها، کش‌شده تا تیک دقیقه ───────────── */
  const s = React.useMemo(() => {
    const words = state.words;
    const hist = state.hist;
    const t0 = dayStart(0);

    const dailyToday = state.daily.d === today() ? state.daily : { d: today(), n: 0, r: 0, sn: 0, sr: 0 };
    // هدف امروز فقط پیشرفت «جلسهٔ روزانه» (sn/sr) است؛ شمارنده‌های سراسری n/r با تمرین‌های دیگر هم پر می‌شوند
    const dailyNewDone = Math.max(0, dailyToday.sn || 0);
    const dailyReviewDone = Math.max(0, dailyToday.sr || 0);

    const activeCategorySet = new Set(state.set.activeCats || []);
    const dailyPool = words.filter(w =>
      (!activeCategorySet.size || activeCategorySet.has(w.cat)) &&
      (state.set.leechAct !== 'suspend' || !isLeech(w, state.set.leechN || 4))
    );

    // پاس واحد: مرحلهٔ تسلط، سطح CEFR، سررسید، عقب‌افتاده‌ها
    const stageOf = (w: Word): 'mastered' | 'familiar' | 'learning' | 'newWords' | 'weak' =>
      !w.last ? 'newWords' : isWeak(w) ? 'weak' : w.ivl >= 21 ? 'mastered' : w.ivl >= 3 ? 'familiar' : 'learning';
    const stageLists: Record<string, Word[]> = { mastered: [], familiar: [], learning: [], newWords: [], weak: [] };
    const lvlCounts: Record<string, number> = {};
    const byDay = new Map<string, number>();
    let okTotal = 0;
    let clozeTotal = 0;
    let clozeOk = 0;
    let okLast7 = 0;
    let totalLast7 = 0;
    let matureOk = 0;
    let matureAll = 0;

    for (const w of words) {
      stageLists[stageOf(w)].push(w);
      if (w.lvl) {
        const k = w.lvl.trim().toUpperCase();
        if (LVL_ORDER.includes(k as any)) lvlCounts[k] = (lvlCounts[k] || 0) + 1;
      }
      if (w.ivl >= 7) { matureOk += w.ok; matureAll += w.ok + w.bad; }
    }
    for (const x of hist) {
      if (x.ok) okTotal++;
      if (x.type === 'cloze') { clozeTotal++; if (x.ok) clozeOk++; }
      if (x.t > n - 7 * DAY) { totalLast7++; if (x.ok) okLast7++; }
      const k = dstr(x.t);
      byDay.set(k, (byDay.get(k) || 0) + 1);
    }

    const dueWords = dailyPool.filter(w => w.last && w.due <= n).sort((a, b) => a.due - b.due);
    const reviewedTodayOk = new Set(hist.filter(x => x.ok && dstr(x.t) === today()).map(x => x.id));
    const dueReviewWords = dueWords.filter(w => !reviewedTodayOk.has(w.id));
    const overdueWords = dueReviewWords.filter(w => w.due < t0);

    const dailyDueAvailable = dueWords.length;
    const dailyNewAvailable = dailyPool.filter(w => !w.last).length;
    const dailyReviewRemaining = state.set.rv > 0 ? Math.max(0, state.set.rv - dailyReviewDone) : 0;
    const dailyNewRemaining = state.set.nw > 0 ? Math.max(0, state.set.nw - dailyNewDone) : 0;
    const dailyReviewTasksLeft = Math.min(dailyReviewRemaining, dueReviewWords.length);
    const dailyNewTasksLeft = Math.min(dailyNewRemaining, dailyNewAvailable);
    const dailyTasksLeft = dailyReviewTasksLeft + dailyNewTasksLeft;
    const estimatedMins = Math.ceil((dailyReviewTasksLeft * 20 + dailyNewTasksLeft * 30) / 60);

    const last7Days = [6, 5, 4, 3, 2, 1, 0].map(offset => {
      const timestamp = dayStart(-offset);
      const dateObj = new Date(timestamp);
      return {
        offset,
        count: byDay.get(ymd(-offset)) || 0,
        weekdayFa: dateObj.toLocaleDateString('fa-IR', { weekday: 'short' }),
        shamsiNumeric: formatShamsiDayMonthNumeric(dateObj),
        gregNumeric: formatGregorianMonthDayNumeric(dateObj),
        isToday: offset === 0
      };
    });

    const weakList = stageLists.weak;
    // فاز ۵: آستانهٔ واژهٔ دشوار از تنظیمات (leechN) — به‌جای عدد ثابت ۳
    const leechN = state.set.leechN || 4;
    const hardMistakenWords = words
      .filter(w => (w.bad || 0) >= leechN)
      .sort((a, b) => (b.bad || 0) - (a.bad || 0) || (a.ok || 0) - (b.ok || 0));

    const totalAuditedIssues = words
      .filter(w => !ignoredQualityIds[w.id])
      .filter(w => auditWord(w).length > 0).length;

    return {
      words,
      dailyNewDone,
      dailyReviewDone,
      dailyPool,
      dueWords,
      dueReviewWords,
      overdueWords,
      dailyDueAvailable,
      dailyNewAvailable,
      dailyTasksLeft,
      dailyComplete: dailyTasksLeft === 0,
      estimatedMins,
      last7Days,
      okTotal,
      clozeTotal,
      clozeOk,
      acc7: totalLast7 ? okLast7 / totalLast7 : null,
      retentionRate: matureAll ? Math.round((matureOk / matureAll) * 100) : null,
      stageLists,
      lvlCounts,
      weakList,
      hardMistakenWords,
      totalAuditedIssues,
      overdueBacklog: dailyPool.filter(w => w.last && w.due < t0).length
    };
  }, [state.words, state.hist, state.daily, state.set, ignoredQualityIds, n]);

  const nextReviewWord = s.words.filter(w => w.last && w.due > n).sort((a, b) => a.due - b.due)[0];
  const weekTotal = s.last7Days.reduce((a, d) => a + d.count, 0);
  const maxActivity = Math.max(1, ...s.last7Days.map(d => d.count));
  const avgPerDay = Math.round(weekTotal / 7);
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}٪` : '—');

  // هدف ترکیبی امروز برای حلقهٔ پیشرفت
  const totalTarget = state.set.nw + state.set.rv;
  const totalDone = s.dailyNewDone + s.dailyReviewDone;
  const ringProgress = totalTarget > 0 ? Math.min(1, totalDone / totalTarget) : 0;
  const RING_R = 30;
  const RING_C = 2 * Math.PI * RING_R;

  // پیشنهاد هوشمند سهمیه
  let suggestedNew = state.set.nw;
  if (s.acc7 !== null && (s.acc7 < 0.7 || s.dailyDueAvailable > 40)) {
    suggestedNew = Math.max(3, state.set.nw - 3);
  } else if (s.acc7 !== null && s.acc7 > 0.9 && s.dailyDueAvailable < 10) {
    suggestedNew = Math.min(500, state.set.nw + 2);
  }

  const stageDefs: { key: string; icon: string; label: string; cls: string; list: Word[] }[] = [
    { key: 'mastered', icon: '🏆', label: 'مسلط', cls: 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-200', list: s.stageLists.mastered },
    { key: 'familiar', icon: '✨', label: 'آشنا', cls: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/30 dark:border-blue-900 dark:text-blue-200', list: s.stageLists.familiar },
    { key: 'learning', icon: '🌱', label: 'در حال یادگیری', cls: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-200', list: s.stageLists.learning },
    { key: 'newWords', icon: '🆕', label: 'کلمات جدید', cls: 'bg-purple-50 border-purple-200 text-purple-800 dark:bg-purple-950/30 dark:border-purple-900 dark:text-purple-200', list: s.stageLists.newWords },
    { key: 'weak', icon: '🩸', label: 'ضعیف / سخت', cls: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-900 dark:text-red-200', list: s.stageLists.weak }
  ];

  // خوش‌آمدگویی بر اساس ساعت روز + تاریخ امروز (شمسی و میلادی)
  const nowDate = new Date(n);
  const hour = nowDate.getHours();
  const minute = nowDate.getMinutes(); // برای صحنهٔ پویای زمان روز
  const greeting = hour < 5 ? 'شب‌بخیر' : hour < 12 ? 'صبح‌بخیر' : hour < 17 ? 'ظهر بخیر' : hour < 21 ? 'عصر بخیر' : 'شب‌بخیر';
  const todayShamsi = formatShamsiFullNumeric(n);
  const todayGreg = formatGregorianNumeric(n);
  const todayWeekday = nowDate.toLocaleDateString('fa-IR', { weekday: 'long' });

  // جست‌وجوی داخل فهرست مرور و فهرست مرحلهٔ تسلط
  const dueFiltered = dueQuery.trim()
    ? s.dueReviewWords.filter(w => {
        const q = dueQuery.trim().toLowerCase();
        return w.de.toLowerCase().includes(q) || (w.fa || '').includes(dueQuery.trim()) || (w.cat || '').includes(dueQuery.trim());
      })
    : s.dueReviewWords;

  const lvls = LVL_ORDER.filter(l => (s.lvlCounts[l] || 0) > 0);
  const maxLvl = Math.max(1, ...lvls.map(l => s.lvlCounts[l] || 0));

  const activeStage = stageView ? stageDefs.find(x => x.key === stageView) : null;
  const stageFiltered = activeStage && stageQuery.trim()
    ? activeStage.list.filter(w => {
        const q = stageQuery.trim().toLowerCase();
        return w.de.toLowerCase().includes(q) || (w.fa || '').includes(stageQuery.trim()) || (w.cat || '').toLowerCase().includes(q);
      })
    : activeStage?.list;

  return (
    <div className="space-y-4 text-right">
      {/* ─────────── سربرگ خوش‌آمد: سلام، تاریخ، رشتهٔ استمرار و حلقهٔ پیشرفت امروز ─────────── */}
      <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900 rounded-2xl p-5 text-purple-900 dark:text-purple-100 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* درخواست کاربر ۳: نمای انیمیشنی زمان روز جلوی خوش‌آمدگویی */}
            <div className="w-24 h-16 md:w-32 md:h-20 flex-shrink-0">
              <TimeScene hour={hour} minute={minute} />
            </div>
            <div className="min-w-0">
              <b className="text-lg md:text-xl font-extrabold block">{greeting} 👋</b>
              <p className="text-xs text-purple-800/80 dark:text-purple-300/80 mt-0.5" dir="ltr">
                {todayWeekday} • {todayShamsi} • {todayGreg}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="bg-white/70 dark:bg-purple-900/40 border border-purple-200 dark:border-purple-800 px-3.5 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5"
              title="روزهای پیاپی تمرین"
              aria-label="رشتهٔ استمرار مطالعه"
            >
              🔥 {streakCount(state.hist)} روز استمرار
            </span>
            <span
              className="bg-white/70 dark:bg-purple-900/40 border border-purple-200 dark:border-purple-800 px-3.5 py-2 rounded-xl text-sm font-bold"
              title="کل واژگان کتابخانه"
            >
              📚 {s.words.length} واژه
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-4">
          <div className="relative w-[72px] h-[72px] flex-shrink-0" role="img" aria-label={`پیشرفت امروز: ${Math.round(ringProgress * 100)}٪`}>
            <svg viewBox="0 0 72 72" className="w-full h-full -rotate-90">
              <circle cx="36" cy="36" r={RING_R} fill="none" strokeWidth="8" className="stroke-purple-200 dark:stroke-purple-900" />
              <circle
                cx="36" cy="36" r={RING_R} fill="none" strokeWidth="8" strokeLinecap="round"
                className="stroke-emerald-500 dark:stroke-emerald-300 transition-all duration-700"
                strokeDasharray={RING_C}
                strokeDashoffset={RING_C * (1 - ringProgress)}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold">
              {totalTarget > 0 ? `${Math.round(ringProgress * 100)}٪` : '—'}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <b className="text-sm font-bold block">هدف امروز: {totalDone} از {totalTarget > 0 ? totalTarget : '—'} تمرین</b>
            <p className="text-xs text-purple-800/80 dark:text-purple-300/80 mt-1">
              {totalTarget > 0
                ? `کلمهٔ جدید ${s.dailyNewDone}/${state.set.nw} • مرور ${s.dailyReviewDone}/${state.set.rv}`
                : 'برای شروع، سهمیهٔ روزانه را در تنظیمات تعیین کن.'}
            </p>
            <p className="text-xs text-purple-800/70 dark:text-purple-400/80 mt-0.5">
              {s.dailyComplete && totalTarget > 0
                ? '✅ تمرین‌های امروز کامل شده — آفرین!'
                : `⏳ حدود ${s.estimatedMins} دقیقه زمان می‌برد.`}
            </p>
          </div>
        </div>

        {/* دکمه‌های دسترسی سریع */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          <button
            onClick={() => onNavigate('daily')}
            className="bg-white text-purple-800 hover:bg-purple-100 px-3 py-2.5 rounded-xl text-xs font-extrabold shadow-sm transition active:scale-95 flex items-center justify-center gap-1.5"
          >
            {s.dailyComplete && totalTarget > 0 ? '✅ جلسهٔ امروز کامل' : `🌟 شروع روزانه (${s.dailyTasksLeft})`}
          </button>
          {s.dueReviewWords.length > 0 && (
            <button
              onClick={() => onPracticeWords(s.dueReviewWords.map(w => w.id), 'review')}
              className="bg-white/70 border border-purple-200 hover:bg-white text-purple-900 dark:bg-purple-900/40 dark:border-purple-800 dark:hover:bg-purple-900/60 dark:text-purple-100 px-3 py-2.5 rounded-xl text-xs font-bold transition active:scale-95 flex items-center justify-center gap-1.5"
            >
              ⚡ مرور سررسید ({s.dueReviewWords.length})
            </button>
          )}
          {s.weakList.length > 0 && (
            <button
              onClick={() => onPracticeWords(s.weakList.map(w => w.id), 'targeted')}
              className="bg-white/70 border border-purple-200 hover:bg-white text-purple-900 dark:bg-purple-900/40 dark:border-purple-800 dark:hover:bg-purple-900/60 dark:text-purple-100 px-3 py-2.5 rounded-xl text-xs font-bold transition active:scale-95 flex items-center justify-center gap-1.5"
            >
              🎯 نقاط ضعف ({s.weakList.length})
            </button>
          )}
          <button
            onClick={() => onNavigate('lib')}
            className="bg-white/70 border border-purple-200 hover:bg-white text-purple-900 dark:bg-purple-900/40 dark:border-purple-800 dark:hover:bg-purple-900/60 dark:text-purple-100 px-3 py-2.5 rounded-xl text-xs font-bold transition active:scale-95 flex items-center justify-center gap-1.5"
          >
            📚 کتابخانهٔ واژگان
          </button>
        </div>
      </div>

      {/* ─────────── فعالیت ۷ روز اخیر ─────────── */}
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 md:p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔥</span>
            <b className="text-base text-slate-900 dark:text-slate-100">فعالیت ۷ روز اخیر</b>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#5d6676] dark:text-[#a3adbd]">
            <span className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-[#141923]" title="مجموع تمرین‌های هفته">
              مجموع ۷ روز اخیر: <b className="text-slate-800 dark:text-slate-200">{weekTotal}</b> تمرین
            </span>
            <span className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-[#141923]" title="میانگین تمرین در روز">
              میانگین روزانه: <b className="text-slate-800 dark:text-slate-200">{avgPerDay}</b> تمرین
            </span>
          </div>
        </div>

        <div className="flex items-end gap-1.5 sm:gap-3 h-44 pt-4 px-1">
          {s.last7Days.map(item => {
            const barHeight = Math.max(6, Math.round((item.count / maxActivity) * 85));
            const isZero = item.count === 0;
            return (
              <div key={item.offset} className="flex-1 flex flex-col items-center justify-end h-full">
                <span className={`text-xs font-bold mb-1 ${isZero ? 'text-slate-400 dark:text-slate-600' : 'text-slate-700 dark:text-slate-300'}`}>
                  {item.count}
                </span>
                <div
                  title={`${item.weekdayFa} ${item.shamsiNumeric} (${item.gregNumeric}) — ${item.count} تمرین`}
                  aria-label={`${item.weekdayFa}: ${item.count} تمرین`}
                  className={`w-full max-w-[42px] rounded-t-lg transition-all duration-300 ${item.isToday ? 'ring-2 ring-[#6b4fd8] ring-offset-1 ring-offset-white dark:ring-offset-[#1b2029]' : ''} ${
                    isZero
                      ? 'bg-slate-200 dark:bg-slate-700'
                      : 'bg-gradient-to-t from-[#1f5fbf] to-[#6b4fd8] hover:opacity-85'
                  }`}
                  style={{ height: `${barHeight}px` }}
                />
                <div className="mt-2 text-center flex flex-col items-center gap-0.5 leading-tight">
                  <span className={`text-xs font-bold ${item.isToday ? 'text-[#1f5fbf] dark:text-[#7fb0ff]' : 'text-slate-800 dark:text-slate-200'}`}>
                    {item.isToday ? 'امروز' : item.weekdayFa}
                  </span>
                  {/* تاریخ عددی شمسی، مثل 08/09 */}
                  <span className="text-[11px] text-[#1f5fbf] dark:text-[#7fb0ff] font-medium" dir="ltr">
                    {item.shamsiNumeric}
                  </span>
                  {/* تاریخ عددی میلادی، مثل 10/31 */}
                  <span className="text-[11px] text-[#5d6676] dark:text-[#a3adbd]" dir="ltr">
                    {item.gregNumeric}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─────────── نقشهٔ حرارتی نقاط ضعف + مسیر یادگیری تطبیقی ───────────
          درخواست کاربر: تحلیل هوشمند آمار یادگیری + پیشنهاد برنامهٔ روزانه برای رسیدن به B2
          درخواست کاربر ۲: زیر عنوانش جمع می‌شود */}
      <AccordionSection id="weakness" icon="🎯" title="تحلیل نقاط ضعف و مسیر یادگیری" openId={openSection} setOpenId={setOpenSection}>
        <WeaknessHeatmap state={state} onNavigate={onNavigate} />
      </AccordionSection>

      {/* ─────────── استمرار و نشان‌ها (گیمیفیکیشن) ───────────
          درخواست کاربر ۸: streak freeze + achievements
          درخواست کاربر ۲: زیر عنوانش جمع می‌شود */}
      <AccordionSection id="achievements" icon="🏅" title="استمرار و نشان‌ها" openId={openSection} setOpenId={setOpenSection}>
        <AchievementsPanel state={state} />
      </AccordionSection>

      {/* ─────────── هدف و پیشرفت امروز (درخواست کاربر ۲: زیر عنوانش جمع می‌شود) ─────────── */}
      <AccordionSection id="goal" icon="🎯" title="هدف و پیشرفت امروز" openId={openSection} setOpenId={setOpenSection}>
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-5 shadow-xs space-y-3">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span>کلمات جدید:</span>
            <span>
              {s.dailyNewDone} از {state.set.nw}
              {remainingOf(state.set.nw, s.dailyNewDone) > 0 && (
                <span className="text-[#5d6676] dark:text-[#a3adbd]"> • {remainingOf(state.set.nw, s.dailyNewDone)} باقی‌مانده</span>
              )}
            </span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] h-full transition-all"
              style={{ width: `${state.set.nw <= 0 ? 100 : Math.min(100, (s.dailyNewDone / state.set.nw) * 100)}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <span>مرور:</span>
            <span>
              {s.dailyReviewDone} از {state.set.rv}
              {remainingOf(state.set.rv, s.dailyReviewDone) > 0 && (
                <span className="text-[#5d6676] dark:text-[#a3adbd]"> • {remainingOf(state.set.rv, s.dailyReviewDone)} باقی‌مانده</span>
              )}
            </span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
            <div
              className="bg-emerald-500 h-full transition-all"
              style={{ width: `${state.set.rv <= 0 ? 100 : Math.min(100, (s.dailyReviewDone / state.set.rv) * 100)}%` }}
            />
          </div>
        </div>

        <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">
          کل واژگان: {s.words.length} • آمادهٔ مرور: {s.dueReviewWords.length}
          {!s.dueReviewWords.length && s.dailyDueAvailable > 0 && (
            <span> • هر {s.dailyDueAvailable} سررسید امروز مرور شده ✅</span>
          )}
          {s.dueReviewWords.length === 0 && nextReviewWord && (
            <span> • نزدیک‌ترین مرور: {dueText(nextReviewWord)}</span>
          )}
        </p>

        <div className="pt-1">
          {s.dailyComplete ? (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 px-3.5 py-3 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              ✅ تمرین‌های امروز تمام شده‌اند. برای تمرین بیشتر، از بخش تمرین‌ها استفاده کنید.
            </div>
          ) : (
            <button
              onClick={() => onNavigate('daily')}
              className="w-full bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-4 py-2 rounded-xl text-xs md:text-sm font-bold shadow-xs hover:opacity-95 transition"
            >
              🌟 شروع جلسهٔ روزانه ({s.dailyTasksLeft} تمرین باقی‌مانده)
            </button>
          )}
        </div>
        </div>
      </AccordionSection>

      {/* ─────────── تحلیل هوشمند یادگیری و حافظه (درخواست کاربر ۲: زیر عنوانش جمع می‌شود) ─────────── */}
      <AccordionSection
        id="analysis"
        icon="🧠"
        title="تحلیل هوشمند یادگیری و حافظه"
        badge={s.retentionRate !== null ? (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
            نرخ ماندگاری: {s.retentionRate}٪
          </span>
        ) : undefined}
        openId={openSection}
        setOpenId={setOpenSection}
      >
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-5 shadow-xs space-y-4">
        <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">
          ارزیابی مرحله به مرحلهٔ تسلط، راندمان تثبیت و برنامهٔ مرور لایتنر
        </p>

        {/* باکس‌های مرحلهٔ تسلط — همیشه ۵ باکس در یک خط */}
        <div className="grid grid-cols-5 gap-1 sm:gap-1.5 text-center">
          {stageDefs.map(b => (
            <button key={b.key} type="button" onClick={() => { setStageView(b.key); setStageQuery(''); }}
              className={`${b.cls} border rounded-xl py-2 px-0.5 flex flex-col items-center gap-0.5 active:scale-95 transition`}
              aria-label={`${b.label}: ${b.list.length} واژه`}>
              <span className="text-xl leading-none" aria-hidden="true">{b.icon}</span>
              <b className="text-base leading-tight">{b.list.length}</b>
              <span className="text-xs font-bold leading-tight">{b.label}</span>
              {s.words.length > 0 && (
                <span className="text-xs opacity-70 leading-tight">{Math.round((b.list.length / s.words.length) * 100)}٪ از کل</span>
              )}
            </button>
          ))}
        </div>
        <p className="text-xs text-[#5d6676] dark:text-[#a3adbd] -mt-1">روی هر باکس بزن تا فهرست واژه‌هایش را ببینی.</p>

        {/* توزیع سطح CEFR */}
        {lvls.length > 0 && (
          <div className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
            <b className="text-xs text-slate-700 dark:text-slate-300 flex items-center gap-1.5 pt-2">
              <span>📶</span> توزیع سطح واژگان (CEFR)
            </b>
            {lvls.map(l => (
              <div key={l} className="flex items-center gap-2 text-xs">
                <span className="w-6 font-extrabold text-slate-600 dark:text-slate-300" dir="ltr">{l}</span>
                <div className="flex-1 h-2.5 bg-slate-100 dark:bg-[#141923] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${LVL_CLS[l]}`}
                    style={{ width: `${Math.max(4, Math.round(((s.lvlCounts[l] || 0) / maxLvl) * 100))}%` }}
                  />
                </div>
                <b className="w-10 text-left text-slate-600 dark:text-slate-300" title={`${s.lvlCounts[l] || 0} واژه در سطح ${l}`}>
                  {s.lvlCounts[l] || 0}
                </b>
              </div>
            ))}
          </div>
        )}

        {s.weakList.length > 0 && (
          <button
            onClick={() => onPracticeWords(s.weakList.map(w => w.id), 'targeted')}
            className="w-full bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-300 px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
          >
            🎯 تمرین نقاط ضعف ({s.weakList.length})
          </button>
        )}

        {/* پیشنهاد هوشمند سهمیه + کیفیت داده */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {suggestedNew !== state.set.nw ? (
            <div className="flex items-center gap-2 text-xs bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-2 rounded-xl">
              <span>
                پیشنهاد هوشمند سهمیه کلمه روزانه: <b>{suggestedNew}</b> (فعلی: {state.set.nw})
              </span>
              <button
                onClick={() => onUpdateDailyNewTarget(suggestedNew)}
                className="bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1 rounded-lg font-bold"
              >
                اعمال سهمیه
              </button>
            </div>
          ) : (
            <div className="text-xs text-[#5d6676]">سهمیه روزانه شما ({state.set.nw} واژه) متناسب با عملکرد فعلی است.</div>
          )}
        </div>
        </div>
      </AccordionSection>

      {/* ─────────── آمار کلی تمرین‌ها (درخواست کاربر ۲: زیر عنوانش جمع می‌شود) ─────────── */}
      <AccordionSection id="stats" icon="📊" title="آمار کلی تمرین‌ها" openId={openSection} setOpenId={setOpenSection}>
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-5 shadow-xs space-y-3">
        <div className="grid grid-cols-5 gap-1 sm:gap-2 pt-1">
          {[
            { label: 'کل واژگان', value: s.words.length, cls: 'text-slate-800 dark:text-slate-200' },
            { label: 'واژه‌های مسلط', value: s.stageLists.mastered.length, cls: 'text-emerald-600' },
            { label: 'پاسخ‌های درست', value: s.okTotal, cls: 'text-emerald-600' },
            { label: 'پاسخ‌های نادرست', value: state.hist.length - s.okTotal, cls: 'text-red-500' },
            { label: 'دقت کلی', value: pct(s.okTotal, state.hist.length), cls: 'text-[#1f5fbf] dark:text-[#7fb0ff]' }
          ].map(tile => (
            <div key={tile.label} className="bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] p-1.5 sm:p-2.5 rounded-xl text-center flex flex-col justify-center gap-0.5">
              <span className="text-xs sm:text-xs leading-tight text-[#5d6676] dark:text-[#a3adbd]">{tile.label}</span>
              <b className={`text-sm sm:text-base ${tile.cls}`}>{tile.value}</b>
            </div>
          ))}
        </div>
        </div>
      </AccordionSection>

      {/* ─────────── نکات مربی‌گری (درخواست کاربر ۲: زیر عنوانش جمع می‌شود) ─────────── */}
      <AccordionSection id="coach" icon="💡" title="نکات مربی‌گری" openId={openSection} setOpenId={setOpenSection}>
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl shadow-xs p-3.5 text-xs text-slate-700 dark:text-slate-300 space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            مرورهای عقب‌افتاده: <b className="text-red-500">{s.overdueBacklog}</b> • سررسید همین حالا:{' '}
            <b className="text-[#1f5fbf] dark:text-[#7fb0ff]">{s.dueReviewWords.length}</b> • زمان تقریبی جلسه:{' '}
            <b>{s.estimatedMins} دقیقه</b>
          </span>
          {s.acc7 !== null && (
            <span>
              دقت ۷ روز اخیر: <b>{Math.round(s.acc7 * 100)}٪</b>
            </span>
          )}
        </div>
        <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">
          💡 طبق الگوریتم فاصله، واژه‌های جدید بعد از اتمام مرورهای سررسیدشده ارائه می‌شوند تا حافظه اشباع نشود.
        </p>
        </div>
      </AccordionSection>

      {/* ─────────── فهرست واژه‌های آمادهٔ مرور (درخواست کاربر ۲: زیر عنوانش جمع می‌شود) ─────────── */}
      <AccordionSection
        id="review-list"
        icon="📋"
        title="فهرست واژه‌های آماده برای مرور و مطالعه"
        badge={<span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">{s.dueReviewWords.length} واژه</span>}
        openId={openSection}
        setOpenId={setOpenSection}
      >
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-5 shadow-xs space-y-3">
        {s.dueReviewWords.length > 0 && (
          <button
            onClick={() => onPracticeWords(s.dueReviewWords.map(w => w.id), 'review')}
            className="bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 w-full sm:w-auto"
          >
            <span>⚡ همین حالا مرور کن ({s.dueReviewWords.length} واژه)</span>
          </button>
        )}

        {/* تفکیک سررسید امروز و عقب‌افتاده‌ها */}
        {s.dueReviewWords.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold border border-blue-100 dark:border-blue-900">
              سررسید امروز: {s.dueReviewWords.length - s.overdueWords.length}
            </span>
            {s.overdueWords.length > 0 && (
              <span className="px-2 py-1 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300 font-bold border border-red-100 dark:border-red-900">
                عقب‌افتاده: {s.overdueWords.length}
              </span>
            )}
            {s.dueReviewWords.length > 8 && (
              <input
                type="text"
                value={dueQuery}
                onChange={e => setDueQuery(e.target.value)}
                placeholder="جست‌وجو در فهرست مرور…"
                aria-label="جست‌وجو در فهرست واژه‌های آمادهٔ مرور"
                className="flex-1 min-w-[140px] px-3 py-1.5 rounded-lg border border-[#dde1ea] dark:border-[#333b4a] bg-white dark:bg-[#141923] text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#4385e8]"
              />
            )}
          </div>
        )}

        {s.dueReviewWords.length === 0 ? (
          <div className="text-xs text-emerald-600 dark:text-emerald-400 py-3 text-center bg-emerald-50/70 dark:bg-emerald-950/20 rounded-xl">
            {s.dailyDueAvailable > 0
              ? `✅ همهٔ ${s.dailyDueAvailable} سررسید امروز مرور شده‌اند — جلسهٔ امروز کامل است!`
              : '✅ در فهرست فعلی واژهٔ سررسیدشده‌ای برای مرور وجود ندارد؛ واژهٔ معوقه‌ای در این فهرست نیست.'}
          </div>
        ) : (
          <div className="max-h-52 overflow-y-auto bg-white dark:bg-[#1b2029] rounded-xl border border-[#dde1ea] dark:border-[#333b4a]">
            <table className="w-full table-fixed text-xs border-collapse">
              <colgroup>
                <col style={{ width: '36%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '24%' }} />
                <col style={{ width: '29%' }} />
              </colgroup>
              <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300">
                <tr>
                  <th scope="col" className="px-2 py-1.5 text-left font-bold">واژه</th>
                  <th scope="col" className="px-1 py-1.5 text-center font-bold">سطح</th>
                  <th scope="col" className="px-2 py-1.5 text-right font-bold">دسته</th>
                  <th scope="col" className="px-2 py-1.5 text-right font-bold">سررسید</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {dueFiltered.map((w, idx) => {
                  const isOverdue = w.due < dayStart(0);
                  const overdueDays = Math.max(1, Math.ceil((dayStart(0) - w.due) / DAY));
                  return (
                    <tr
                      key={w.id || idx}
                      onClick={() => onSelectWord(w)}
                      className="align-middle cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
                      title={`مشاهدهٔ پروفایل واژهٔ ${fullWord(w)}`}
                    >
                      <td className="px-2 py-2 text-left font-bold text-slate-900 dark:text-slate-100 text-sm truncate" dir="ltr">
                        {fullWord(w)}
                      </td>
                      <td className="px-1 py-2 text-center">
                        {w.lvl ? (
                          <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 text-[11px] font-bold">
                            {w.lvl}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right text-xs text-[#5d6676] dark:text-[#a3adbd] truncate">
                        {w.cat || '—'}
                      </td>
                      <td className="px-2 py-2 text-right text-xs whitespace-nowrap">
                        {isOverdue ? (
                          <span className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950/70 text-red-600 dark:text-red-300 font-bold">
                            {overdueDays} روز عقب‌افتاده
                          </span>
                        ) : (
                          <b className="text-slate-700 dark:text-slate-300">امروز</b>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {dueFiltered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-2 py-3 text-center text-slate-500 dark:text-slate-400">
                      واژه‌ای با این جست‌وجو پیدا نشد.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        </div>
      </AccordionSection>

      {/* ─────────── واژه‌های پر اشتباه و سخت (درخواست کاربر ۲: زیر عنوانش جمع می‌شود) ─────────── */}
      <AccordionSection
        id="hard-words"
        icon="🩸"
        title="واژه‌های پر اشتباه و سخت"
        badge={s.hardMistakenWords.length > 0 ? (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950/80 dark:text-red-300">
            {s.hardMistakenWords.length} واژه دشوار
          </span>
        ) : undefined}
        openId={openSection}
        setOpenId={setOpenSection}
      >
        <div className="bg-white dark:bg-[#1b2029] border border-red-200 dark:border-red-950/60 rounded-2xl p-5 shadow-xs space-y-4">
        <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">
          واژگانی با بیش از ۳ بار خطا، مرتب‌شده بر اساس بیشترین تکرار اشتباه
        </p>

        {s.hardMistakenWords.length === 0 ? (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#141923] text-center text-xs text-slate-600 dark:text-slate-400">
            👏 عالی است! در حال حاضر هیچ واژه‌ای با بیش از ۳ بار اشتباه در کتابخانه شما وجود ندارد.
          </div>
        ) : (
          <>
            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 bg-slate-50 dark:bg-[#141923] rounded-xl border border-[#dde1ea] dark:border-[#333b4a] px-3 py-1">
              {s.hardMistakenWords.map(w => (
                <button
                  key={w.id}
                  onClick={() => onSelectWord(w)}
                  className="w-full py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-right hover:bg-slate-100/70 dark:hover:bg-slate-800/40 rounded-lg px-1 transition"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-bold text-slate-900 dark:text-slate-100 text-sm" dir="ltr">
                      {fullWord(w)}
                    </span>
                    <span className="text-slate-600 dark:text-slate-300 truncate">
                      : {w.fa}
                    </span>
                    {w.cat && (
                      <span className="text-[11px] text-[#5d6676] dark:text-[#a3adbd]">
                        ({w.cat})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="px-2 py-0.5 rounded-lg bg-red-100 dark:bg-red-950/70 text-red-600 dark:text-red-300 font-bold text-xs">
                      ❌ {w.bad} بار اشتباه
                    </span>
                    <span className="px-2 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 text-xs">
                      ✅ {w.ok} بار درست
                    </span>
                  </div>
                </button>
              ))}
            </div>

            <div className="pt-1">
              <button
                onClick={() => onPracticeWords(s.hardMistakenWords.map(w => w.id), 'hard')}
                className="w-full bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 text-white py-3 px-4 rounded-xl text-xs md:text-sm font-bold shadow-xs transition flex items-center justify-center gap-2"
              >
                <span>🎯 تمرین اختصاصی این واژه‌های سخت ({s.hardMistakenWords.length} واژه)</span>
              </button>
            </div>
          </>
        )}
        </div>
      </AccordionSection>

      {/* ─────────── لایهٔ فهرست واژه‌های هر مرحلهٔ تسلط (با جست‌وجو) ─────────── */}
      {activeStage && (() => {
        const artCls = (a: string) => a === 'der' ? 'bg-blue-100 text-blue-800' : a === 'die' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800';
        const sorted = [...(stageFiltered || [])].sort((a, b) => a.de.localeCompare(b.de, 'de'));
        return (
          <PageOverlay icon={activeStage.icon} title={`${activeStage.label} (${activeStage.list.length})`} onClose={() => { setStageView(null); setStageQuery(''); }}>
            {activeStage.list.length > 8 && (
              <input
                type="text"
                value={stageQuery}
                onChange={e => setStageQuery(e.target.value)}
                placeholder="جست‌وجو در این فهرست…"
                aria-label={`جست‌وجو در فهرست ${activeStage.label}`}
                className="w-full mb-2 px-3.5 py-2.5 rounded-xl border border-[#dde1ea] dark:border-[#333b4a] bg-white dark:bg-[#141923] text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#4385e8]"
              />
            )}
            {sorted.length === 0 ? (
              <div className="p-4 rounded-xl bg-white dark:bg-[#1b2029] text-center text-sm text-[#5d6676]">
                {activeStage.list.length === 0 ? 'واژه‌ای در این گروه نیست.' : 'واژه‌ای با این جست‌وجو پیدا نشد.'}
              </div>
            ) : (
              <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl overflow-hidden">
                {sorted.map(w => {
                  const shown = revealedFa.has(w.id);
                  return (
                    <button key={w.id} onClick={() => onSelectWord(w)} className="w-full flex items-center justify-between gap-2 sm:gap-3 px-3 py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0 text-right hover:bg-slate-50 dark:hover:bg-slate-800/60">
                      <span dir="ltr" className="flex items-center gap-2 min-w-0">
                        {w.art && <span className={`text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${artCls(w.art)}`}>{w.art}</span>}
                        <b className="text-base sm:text-lg font-sans truncate" dir="ltr">{w.de}</b>
                        {w.lvl && <span className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 rounded-full flex-shrink-0" dir="ltr">{w.lvl}</span>}
                      </span>
                      <span className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                        {shown && (
                          <span className="text-xs sm:text-sm text-[#5d6676] dark:text-[#a3adbd] max-w-[38vw] sm:max-w-[220px] truncate" title={w.fa}>
                            {w.fa}
                          </span>
                        )}
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={e => { e.stopPropagation(); toggleFa(w.id); }}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleFa(w.id); } }}
                          aria-label={shown ? 'پنهان کردن معنی' : 'نمایش معنی'}
                          aria-pressed={shown}
                          title={shown ? 'پنهان کردن معنی' : 'نمایش معنی'}
                          className="text-lg sm:text-xl leading-none px-1 py-0.5 rounded-lg opacity-75 hover:opacity-100 active:scale-90 transition cursor-pointer select-none flex-shrink-0"
                        >
                          {shown ? '🙈' : '👁️'}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </PageOverlay>
        );
      })()}
    </div>
  );
};

/** باقی‌ماندهٔ هدف روزانه (هرگز منفی نمی‌شود) */
const remainingOf = (target: number, done: number): number =>
  target > 0 ? Math.max(0, target - done) : 0;
