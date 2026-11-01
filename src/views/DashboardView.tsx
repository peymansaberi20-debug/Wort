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

interface DashboardViewProps {
  state: AppState;
  ignoredQualityIds: Record<string, number>;
  onNavigate: (view: string) => void;
  onOpenQualityModal: () => void;
  onPracticeWords: (wordIds: string[], intent?: 'review' | 'targeted') => void;
  onUpdateDailyNewTarget: (target: number) => void;
  onSelectWord: (word: Word) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  state,
  ignoredQualityIds,
  onNavigate,
  onOpenQualityModal,
  onPracticeWords,
  onUpdateDailyNewTarget,
  onSelectWord
}) => {
  const n = Date.now();
  const words = state.words;
  const hist = state.hist;
  const dueWords = words.filter(w => w.last && w.due <= n);
  const dueCount = dueWords.length;
  const dailyToday = state.daily.d === today() ? state.daily : { d: today(), n: 0, r: 0 };
  const dailyNewDone = Math.max(0, dailyToday.n || 0);
  const dailyReviewDone = Math.max(0, dailyToday.r || 0);
  const activeCategorySet = new Set(state.set.activeCats || []);
  const dailyPool = words.filter(w =>
    (!activeCategorySet.size || activeCategorySet.has(w.cat)) &&
    (state.set.leechAct !== 'suspend' || !isLeech(w, state.set.leechN || 4))
  );
  const dailyDueAvailable = dailyPool.filter(w => w.last && w.due <= n).length;
  const dailyNewAvailable = dailyPool.filter(w => !w.last).length;
  const dailyReviewRemaining = state.set.rv > 0 ? Math.max(0, state.set.rv - dailyReviewDone) : 0;
  const dailyNewRemaining = state.set.nw > 0 ? Math.max(0, state.set.nw - dailyNewDone) : 0;
  const dailyReviewTasksLeft = Math.min(dailyReviewRemaining, dailyDueAvailable);
  const dailyNewTasksLeft = Math.min(dailyNewRemaining, dailyNewAvailable);
  const dailyTasksLeft = dailyReviewTasksLeft + dailyNewTasksLeft;
  const dailyComplete = dailyTasksLeft === 0;
  const okTotal = hist.filter(x => x.ok).length;
  const clozeHist = hist.filter(x => x.type === 'cloze');
  const clozeOk = clozeHist.filter(x => x.ok).length;

  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}٪` : '—');

  //
  // Fulfills User Request #6:
  // "در صفحه داشبورد ، قسمت فعالیت ۷ روز اخیر ، زیر روزهای هفته تاریخ رو و ماه عددی شمسی، زیرش هم میلادی ، نشون بده"
  //
  const last7Days = [6, 5, 4, 3, 2, 1, 0].map(offset => {
    const timestamp = dayStart(-offset);
    const dateObj = new Date(timestamp);
    const dateStr = ymd(-offset);
    const count = hist.filter(x => dstr(x.t) === dateStr).length;

    const weekdayFa = dateObj.toLocaleDateString('fa-IR', { weekday: 'short' });
    const shamsiNumeric = formatShamsiDayMonthNumeric(dateObj); // e.g. 08/09
    const gregNumeric = formatGregorianMonthDayNumeric(dateObj); // e.g. 10/31 (purely numeric!)

    return {
      offset,
      count,
      weekdayFa,
      shamsiNumeric,
      gregNumeric
    };
  });

  const maxActivity = Math.max(1, ...last7Days.map(d => d.count));

  //
  // Fulfills User Request #7:
  // "قسمت تحلیل هوشمند یادگیری رو جذابتر و قابل فهم تر گزارش بده"
  //
  const t0 = dayStart(0);
  const histLast7 = hist.filter(x => x.t > n - 7 * DAY);
  const overdueBacklog = words.filter(w => w.last && w.due < t0).length;
  const newWordsLeftToday = dailyNewTasksLeft;
  const estimatedMins = Math.ceil((dueCount * 20 + newWordsLeftToday * 30) / 60);

  const acc7 = histLast7.length ? histLast7.filter(y => y.ok).length / histLast7.length : null;
  const matureWords = words.filter(w => w.ivl >= 7 && w.ok + w.bad > 0);
  const retentionRate = matureWords.length
    ? Math.round(
        (matureWords.reduce((acc, w) => acc + w.ok, 0) /
          matureWords.reduce((acc, w) => acc + w.ok + w.bad, 0)) *
          100
      )
    : null;

  // Mastery breakdown
  const stages = {
    mastered: words.filter(w => w.last && w.ivl >= 21).length,
    familiar: words.filter(w => w.last && w.ivl >= 3 && w.ivl < 21 && !isWeak(w)).length,
    learning: words.filter(w => w.last && (w.stage > 0 || w.ivl < 3) && !isWeak(w)).length,
    newWords: words.filter(w => !w.last).length,
    weakWords: words.filter(w => isWeak(w)).length
  };

  let suggestedNew = state.set.nw;
  if (acc7 !== null && (acc7 < 0.7 || dueCount > 40)) {
    suggestedNew = Math.max(3, state.set.nw - 3);
  } else if (acc7 !== null && acc7 > 0.9 && dueCount < 10) {
    suggestedNew = state.set.nw + 2;
  }

  const weakList = words.filter(isWeak);
  const totalAuditedIssues = words
    .filter(w => !ignoredQualityIds[w.id])
    .filter(w => auditWord(w).length > 0).length;

  // Next review
  const nextReviewWord = words.filter(w => w.last && w.due > n).sort((a, b) => a.due - b.due)[0];

  // Words due for study and review today (Fulfills Request #4)
  const dueReviewWords = dailyPool
    .filter(w => w.last && w.due <= n)
    .sort((a, b) => a.due - b.due);

  // Frequently mistaken hard words with > 3 errors sorted descending (Fulfills Request #5)
  const hardMistakenWords = words
    .filter(w => (w.bad || 0) > 3)
    .sort((a, b) => (b.bad || 0) - (a.bad || 0));

  return (
    <div className="space-y-4 text-right">
      {/* 7 Days Activity Chart */}
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 md:p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔥</span>
            <b className="text-base text-slate-900 dark:text-slate-100">فعالیت ۷ روز اخیر</b>
          </div>
          <span className="text-xs text-[#5d6676] dark:text-[#a3adbd]">
            رشتهٔ استمرار مطالعه: <b className="text-amber-500 font-bold">{streakCount(hist)} روز</b>
          </span>
        </div>

        {/*
          Fulfills User Request #6:
          "زیر روزهای هفته تاریخ رو و ماه عددی شمسی، زیرش هم میلادی ، نشون بده"
        */}
        <div className="flex items-end gap-1.5 sm:gap-3 h-44 pt-4 px-1">
          {last7Days.map(item => {
            const barHeight = Math.max(6, Math.round((item.count / maxActivity) * 85));
            return (
              <div key={item.offset} className="flex-1 flex flex-col items-center justify-end h-full">
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {item.count}
                </span>
                <div
                  className="w-full max-w-[42px] bg-gradient-to-t from-[#1f5fbf] to-[#6b4fd8] rounded-t-lg transition-all duration-300"
                  style={{ height: `${barHeight}px` }}
                />
                <div className="mt-2 text-center flex flex-col items-center gap-0.5 leading-tight">
                  <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                    {item.weekdayFa}
                  </span>
                  {/* Shamsi Day/Month numeric e.g. 08/09 */}
                  <span className="text-[10px] text-[#1f5fbf] dark:text-[#7fb0ff] font-medium" dir="ltr">
                    {item.shamsiNumeric}
                  </span>
                  {/* Gregorian Day/Month numeric e.g. 10/31 */}
                  <span className="text-[9px] text-[#5d6676] dark:text-[#a3adbd]" dir="ltr">
                    {item.gregNumeric}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/*
        Fulfills User Request #7:
        "قسمت تحلیل هوشمند یادگیری رو جذابتر و قابل فهم تر گزارش بده"
      */}
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🧠</span>
            <div>
              <b className="text-base text-slate-900 dark:text-slate-100">تحلیل هوشمند یادگیری و حافظه</b>
              <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">
                ارزیابی مرحله به مرحلهٔ تسلط، راندمان تثبیت و برنامهٔ مرور لایتنر
              </p>
            </div>
          </div>
          {retentionRate !== null && (
            <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5">
              <span>نرخ ماندگاری:</span>
              <span className="text-sm font-extrabold">{retentionRate}٪</span>
            </div>
          )}
        </div>

        {/* Word Mastery Distribution Grid with badges and counts */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-center">
          <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 rounded-xl p-2.5">
            <span className="text-xs text-emerald-700 dark:text-emerald-300 font-bold block mb-1">
              🏆 مسلط
            </span>
            <b className="text-lg text-emerald-900 dark:text-emerald-100">{stages.mastered}</b>
            <span className="text-[10px] text-emerald-600 block mt-0.5">فاصله ۲۱+ روز</span>
          </div>

          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-xl p-2.5">
            <span className="text-xs text-blue-700 dark:text-blue-300 font-bold block mb-1">
              ✨ آشنا
            </span>
            <b className="text-lg text-blue-900 dark:text-blue-100">{stages.familiar}</b>
            <span className="text-[10px] text-blue-600 block mt-0.5">در مسیر تثبیت</span>
          </div>

          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl p-2.5">
            <span className="text-xs text-amber-700 dark:text-amber-300 font-bold block mb-1">
              🌱 در حال یادگیری
            </span>
            <b className="text-lg text-amber-900 dark:text-amber-100">{stages.learning}</b>
            <span className="text-[10px] text-amber-600 block mt-0.5">تکرار کوتاه‌مدت</span>
          </div>

          <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900 rounded-xl p-2.5">
            <span className="text-xs text-purple-700 dark:text-purple-300 font-bold block mb-1">
              🆕 کلمات جدید
            </span>
            <b className="text-lg text-purple-900 dark:text-purple-100">{stages.newWords}</b>
            <span className="text-[10px] text-purple-600 block mt-0.5">منتظر اولین مرور</span>
          </div>

          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl p-2.5 col-span-2 sm:col-span-1">
            <span className="text-xs text-red-700 dark:text-red-300 font-bold block mb-1">
              🩸 ضعیف / سخت
            </span>
            <b className="text-lg text-red-900 dark:text-red-100">{stages.weakWords}</b>
            <span className="text-[10px] text-red-600 block mt-0.5">نیاز به تمرکز ویژه</span>
          </div>
        </div>

        {weakList.length > 0 && (
          <button
            onClick={() => onPracticeWords(weakList.map(w => w.id), 'targeted')}
            className="w-full bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-300 px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
          >
            🎯 تمرین نقاط ضعف ({weakList.length})
          </button>
        )}

        {/* Key Coaching Insights in compact banner */}
        <div className="bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl p-3.5 text-xs text-slate-700 dark:text-slate-300 space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              مرورهای عقب‌افتاده: <b className="text-red-500">{overdueBacklog}</b> • سررسید همین حالا:{' '}
              <b className="text-[#1f5fbf] dark:text-[#7fb0ff]">{dueCount}</b> • زمان تقریبی جلسه:{' '}
              <b>{estimatedMins} دقیقه</b>
            </span>
            {acc7 !== null && (
              <span>
                دقت ۷ روز اخیر: <b>{Math.round(acc7 * 100)}٪</b>
              </span>
            )}
          </div>
          <p className="text-[11px] text-[#5d6676] dark:text-[#a3adbd]">
            💡 طبق الگوریتم فاصله، واژه‌های جدید بعد از اتمام مرورهای سررسیدشده ارائه می‌شوند تا حافظه اشباع نشود.
          </p>
        </div>

        {/*
          Fulfills User Request #4:
          "در صفحه داشبورد در قسمت تحلیل هوشمند که میگه چندتا لغت باید مطالعه بشوند ، لیست لغات (بدون ترجمه ) و تاریخی که باید مرور بشن توی باکس قابل اسکرول نشون داده بشن و یک دکمه هم تعبیه بشه که همین حالا انجامش بده و با زدن رو اون لغاتی که وقتشون هست شروع بشه به مرور شدن طبق دستورالعملی که باید باشه"
        */}
        <div className="bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-base">📋</span>
              <b className="text-xs md:text-sm text-slate-900 dark:text-slate-100">
                فهرست واژه‌های آماده برای مرور و مطالعه ({dueReviewWords.length} واژه)
              </b>
            </div>
            {dueReviewWords.length > 0 && (
              <button
                onClick={() => onPracticeWords(dueReviewWords.map(w => w.id), 'review')}
                className="bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5"
              >
                <span>⚡ همین حالا مرور کن ({dueReviewWords.length} واژه)</span>
              </button>
            )}
          </div>

          {dueReviewWords.length === 0 ? (
            <div className="text-xs text-emerald-600 dark:text-emerald-400 py-3 text-center bg-emerald-50/70 dark:bg-emerald-950/20 rounded-xl">
              ✅ در فهرست فعلی واژهٔ سررسیدشده‌ای برای مرور وجود ندارد؛ واژهٔ معوقه‌ای در این فهرست نیست.
            </div>
          ) : (
            <div className="max-h-44 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-[#1b2029] rounded-xl border border-[#dde1ea] dark:border-[#333b4a] px-3 py-1">
              {dueReviewWords.map((w, idx) => {
                const shamsi = w.due ? formatShamsiFullNumeric(w.due) : 'امروز';
                const greg = w.due ? formatGregorianNumeric(w.due) : formatGregorianNumeric(Date.now());
                return (
                  <div key={w.id || idx} className="py-2 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-slate-100 text-sm" dir="ltr">
                        {fullWord(w)}
                      </span>
                      {w.lvl && (
                        <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                          {w.lvl}
                        </span>
                      )}
                      {w.cat && (
                        <span className="text-[10px] text-[#5d6676] dark:text-[#a3adbd]">
                          ({w.cat})
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {!w.last ? (
                        <span className="text-purple-600 dark:text-purple-400 font-semibold">واژه جدید (اولین مطالعه)</span>
                      ) : (
                        <span>
                          سررسید: <b className="text-slate-700 dark:text-slate-300">{shamsi}</b> • {greg}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Suggested Target & Actions */}
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

        {/*
          Fulfills User Request #5:
          "در قسمت کنترل کیفیت واژگان داشبورد ، وقتی روش میزنم لیست زیرش باز نشه ، پاپ اپ باز بشه ..."
        */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <button
            onClick={onOpenQualityModal}
            className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-100/80 hover:bg-slate-200/80 dark:bg-slate-800/60 dark:hover:bg-slate-800 transition text-xs md:text-sm font-bold text-slate-800 dark:text-slate-200"
          >
            <div className="flex items-center gap-2">
              <span>🔍 کنترل کیفیت واژگان:</span>
              <span className={totalAuditedIssues > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600'}>
                {totalAuditedIssues > 0 ? `${totalAuditedIssues} واژه نیاز به بررسی دارد` : 'کیفیت عالی'}
              </span>
            </div>
            <span className="text-xs text-[#1f5fbf] dark:text-[#7fb0ff]">مشاهده ↗</span>
          </button>
        </div>
      </div>

      {/* Today's Goal and Overall Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Today's Target Card */}
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-5 shadow-xs space-y-3">
          <b className="text-base text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <span>🎯</span> هدف و پیشرفت امروز
          </b>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span>کلمات جدید:</span>
              <span>
                {dailyNewDone} از {state.set.nw}
              </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] h-full transition-all"
                style={{ width: `${state.set.nw <= 0 ? 100 : Math.min(100, (dailyNewDone / state.set.nw) * 100)}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span>مرور:</span>
              <span>
                {dailyReviewDone} از {state.set.rv}
              </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
              <div
                className="bg-emerald-500 h-full transition-all"
                style={{ width: `${state.set.rv <= 0 ? 100 : Math.min(100, (dailyReviewDone / state.set.rv) * 100)}%` }}
              />
            </div>
          </div>

          <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">
            کل واژگان: {words.length} • سررسید مرور: {dueCount}
            {dueCount === 0 && nextReviewWord && (
              <span> • نزدیک‌ترین مرور: {dueText(nextReviewWord)}</span>
            )}
          </p>

          <div className="pt-1">
            {dailyComplete ? (
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 px-3.5 py-3 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                ✅ تمرین‌های امروز تمام شده‌اند. برای تمرین بیشتر، از بخش تمرین‌ها استفاده کنید.
              </div>
            ) : (
              <button
                onClick={() => onNavigate('daily')}
                className="w-full bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-4 py-2 rounded-xl text-xs md:text-sm font-bold shadow-xs hover:opacity-95 transition"
              >
                🌟 شروع جلسهٔ روزانه ({dailyTasksLeft} تمرین باقی‌مانده)
              </button>
            )}
          </div>
        </div>

        {/* Global Statistics Card */}
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-5 shadow-xs space-y-3">
          <b className="text-base text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <span>📊</span> آمار کلی تمرین‌ها
          </b>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
            <div className="bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] p-2.5 rounded-xl text-center">
              <span className="text-[11px] text-[#5d6676] block mb-0.5">پاسخ‌های درست</span>
              <b className="text-base text-emerald-600">{okTotal}</b>
            </div>
            <div className="bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] p-2.5 rounded-xl text-center">
              <span className="text-[11px] text-[#5d6676] block mb-0.5">پاسخ‌های نادرست</span>
              <b className="text-base text-red-500">{hist.length - okTotal}</b>
            </div>
            <div className="bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] p-2.5 rounded-xl text-center">
              <span className="text-[11px] text-[#5d6676] block mb-0.5">دقت کلی</span>
              <b className="text-base text-[#1f5fbf] dark:text-[#7fb0ff]">{pct(okTotal, hist.length)}</b>
            </div>
            <div className="bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] p-2.5 rounded-xl text-center">
              <span className="text-[11px] text-[#5d6676] block mb-0.5">دقت جای‌خالی</span>
              <b className="text-base text-purple-600">{pct(clozeOk, clozeHist.length)}</b>
            </div>
            <div className="bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] p-2.5 rounded-xl text-center col-span-2 sm:col-span-1">
              <span className="text-[11px] text-[#5d6676] block mb-0.5">امروز (جدید / مرور)</span>
              <b className="text-base text-slate-800 dark:text-slate-200">
                {dailyNewDone} / {dailyReviewDone}
              </b>
            </div>
          </div>
        </div>
      </div>

      {/*
        Fulfills User Request #5:
        "در پایین صفحه داشبورد ، یک بخش جدید اضافه بشه واژه های پر اشتباه و سخت و زیرش لیست واژه هایی ک بیشترین تکرار اشتباه رو داشتن از بیشترین به کمترین لیست بشه و گزینه تمرین این واژه ها زیرش باشه . شرط اومدن تو این قسمت بیش از ۳ بار اشتباه"
      */}
      <div className="bg-white dark:bg-[#1b2029] border border-red-200 dark:border-red-950/60 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-xl">🩸</span>
            <div>
              <b className="text-base text-slate-900 dark:text-slate-100">واژه‌های پر اشتباه و سخت</b>
              <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">
                واژگانی با بیش از ۳ بار خطا، مرتب‌شده بر اساس بیشترین تکرار اشتباه
              </p>
            </div>
          </div>
          {hardMistakenWords.length > 0 && (
            <span className="px-3 py-1 rounded-xl bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 text-xs font-bold">
              {hardMistakenWords.length} واژه دشوار
            </span>
          )}
        </div>

        {hardMistakenWords.length === 0 ? (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#141923] text-center text-xs text-slate-600 dark:text-slate-400">
            👏 عالی است! در حال حاضر هیچ واژه‌ای با بیش از ۳ بار اشتباه در کتابخانه شما وجود ندارد.
          </div>
        ) : (
          <>
            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 bg-slate-50 dark:bg-[#141923] rounded-xl border border-[#dde1ea] dark:border-[#333b4a] px-3 py-1">
              {hardMistakenWords.map(w => (
                <div key={w.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 dark:text-slate-100 text-sm" dir="ltr">
                      {fullWord(w)}
                    </span>
                    <span className="text-slate-600 dark:text-slate-300">
                      : {w.fa}
                    </span>
                    {w.cat && (
                      <span className="text-[10px] text-[#5d6676] dark:text-[#a3adbd]">
                        ({w.cat})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-lg bg-red-100 dark:bg-red-950/70 text-red-600 dark:text-red-300 font-bold text-[11px]">
                      ❌ {w.bad} بار اشتباه
                    </span>
                    <span className="px-2 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 text-[11px]">
                      ✅ {w.ok} بار درست
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-1">
              <button
                onClick={() => onPracticeWords(hardMistakenWords.map(w => w.id), 'targeted')}
                className="w-full bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 text-white py-3 px-4 rounded-xl text-xs md:text-sm font-bold shadow-xs transition flex items-center justify-center gap-2"
              >
                <span>🎯 تمرین اختصاصی این واژه‌های سخت ({hardMistakenWords.length} واژه)</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
