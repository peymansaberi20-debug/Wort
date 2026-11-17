این رو چک کن. چرا تمرین "حروف ربط و اضافه" وقتی میزنم اجرا اینطوری سفیده مثل عکسی که فرستادم
این رو چک کن. چرا تمرین "حروف ربط و اضافه" وقتی میزنم اجرا اینطوری سفیده مثل عکسی که فرستادم 

Thought Process
اجازه بده برای پیدا کردن جایی که حالت konnektoren رندر می‌شود، در فایل جستجو کنم.

علت را پیدا کردم. بگذارید ابتدا فایل را بررسی و علت دقیق را توضیح دهم، سپس نسخهٔ اصلاح‌شده را آماده کنم.

علت سفید بودن صفحه
تمرین «حروف ربط و اضافه» (konnektoren) به یک باگ منطقی در چیدمان JSX گیر افتاده است.

کامپوننت KonnektorTrainer در خط ۲۶۵۸ قرار دارد، اما داخل یک بلوک شرطی بزرگ IIFE است که در خط ۲۴۷۶ شروع می‌شود:

jsx
{(qMode === 'conj' || qMode === 'tense' || qMode === 'cloze' || qMode === 'plural'
  || qMode === 'dict' || qMode === 'prod' || qMode === 'synant' || qMode === 'n2v'
  || qMode === 'v2n' || qMode === 'adjdecl' || qMode === 'sent'
  || isSelfContainedMode(qMode)) && (() => {
    ...
    {activeMode === 'konnektoren' && <KonnektorTrainer ... />}  // خط 2658
    ...
  })()}
مشکل: تابع isSelfContainedMode (خط ۱۲۰) شامل 'konnektoren' نیست:

js
const isSelfContainedMode = (m: ExerciseMode | null): boolean =>
  m === 'freesent' || m === 'schreiben' || m === 'schreiben_exam' || m === 'puzzle'
  || m === 'dikt' || m === 'errnb' || m === 'vprep' || m === 'hoeren';
//   ❌ 'konnektoren' جا افتاده
چون qMode === 'konnektoren' با هیچ‌کدام از شرط‌های خط ۲۴۷۶ مطابقت ندارد، کل IIFE رندر نمی‌شود — و چون KonnektorTrainer داخل همان IIFE است، هرگز روی صفحه نمی‌آید. نتیجه: یک کارت سفیدِ خالی زیر هدر و نوار پیشرفت می‌ماند (دقیقاً مثل عکسی که فرستادید).

اجازه بدهید نسخهٔ اصلاح‌شده را بسازم:

اکنون دو اصلاح انجام می‌دهم: (۱) اضافه کردن 'konnektoren' به isSelfContainedMode، و (۲) برداشتن KonnektorTrainer از داخل IIFE خط ۲۴۷۶ تا به‌عنوان یک بلوک مستقل رندر شود.

بررسی می‌کنم که باگ فرعی دیگری وجود ندارد — به‌خصوص در ترتیب شرط‌های ساخت queue:

خوب — ترتیب درست است: شاخهٔ konnektoren قبل از isSelfContainedMode چک می‌شود، پس queue درست با 'konnektoren-main' پر می‌شود. حالا نکتهٔ مهم: با اضافه شدن 'konnektoren' به isSelfContainedMode، نوار پیشرفت و دکمه‌های هدر هم برای konnektoren مخفی می‌شوند (که درست است — چون KonnektorTrainer مدیریت صف خودش را دارد).

اکنون تأیید می‌کنم که فایل نهایی معتبر است و تفاوت را خلاصه می‌زنم:

فایل اصلاح‌شده آماده است.

علت سفید بودن صفحه
تمرین «حروف ربط و اضافه» (konnektoren) روی صفحه خالی می‌ماند، چون یک شروط JSX اشتباه داشت.

کامپوننت KonnektorTrainer در خط ۲۶۵۸ داخل یک IIFE بزرگ رندر می‌شود که فقط وقتی اجرا می‌شود که یکی از این حالت‌ها فعال باشد:

js
qMode === 'conj' || qMode === 'tense' || qMode === 'cloze' || ... || isSelfContainedMode(qMode)
اما تابع isSelfContainedMode در خط ۱۲۰ konnektoren را شامل نمی‌شد:

js
const isSelfContainedMode = (m) =>
  m === 'freesent' || m === 'schreiben' || ... || m === 'hoeren';
  // ❌ 'konnektoren' جا افتاده بود
نتیجه: وقتی روی تمرین «حروف ربط و اضافه» می‌زدید، qMode === 'konnektoren' با هیچ شرطی در IIFE تطابق نداشت → کل بدنهٔ IIFE (که KonnektorTrainer هم داخلش بود) رندر نمی‌شد → فقط یک کارت سفیدِ خالی زیر هدر و نوار پیشرفت می‌ماند، دقیقاً مثل عکس شما.

اصلاح
فقط یک کلمه به انتهای خط ۱۲۰ اضافه شد:

js
const isSelfContainedMode = (m: ExerciseMode | null): boolean =>
  m === 'freesent' || m === 'schreiben' || m === 'schreiben_exam' || m === 'puzzle'
  || m === 'dikt' || m === 'errnb' || m === 'vprep' || m === 'hoeren'
  || m === 'konnektoren';   // ✅ اضافه شد
این اصلاح کافی است؛ چون:

queue از قبل درست پر می‌شود (activeMode === 'konnektoren' در خط ۱۰۳۵ قبل از شاخهٔ کلی isSelfContainedMode چک می‌شود، پس ['konnektoren-main'] می‌سازد).
currentItem هم برای konnektoren از قبل FREE_SENT_WORD برمی‌گرداند (خط ۱۰۵۹).
حالا IIFE رندر می‌شود و KonnektorTrainer دیده خواهد شد. ضمناً نوار پیشرفت/دکمه‌های شناسنامه و جمله‌سازی هم (که برای این تمرین بی‌معنی‌اند) به‌خاطر همین پرچم جدید مخفی می‌شوند.
فایل اصلاح‌شده: ExercisesView.tsx

کافی است این فایل را جایگزین نسخهٔ قبلی در پروژه‌تان کنید. اگر می‌خواهید، خود فایل KonnektorTrainer.tsx را هم بررسی کنم تا مطمئن شویم خطای دیگری در همان کامپوننت نیست.

بله بررسی کن 
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { askJson, S } from '../utils/trainerKit';
import { speak } from '../utils/audio';

interface KonnektorTrainerProps {
  onClose: () => void;
  onShowToast: (msg: string, isErr?: boolean) => void;
}

interface KonnektorItem {
  id: string;
  title: string;
  text: string; // شامل جای‌خالی‌های مثل [1], [2] یا خط تیره
  blanks: { id: number; answer: string }[];
  pool: string[]; // شامل پاسخ‌های درست + ۲ تله
}

const STORAGE_KEY = 'wb_konnektor_archive_v1';

const DEFAULT_EXERCISES: KonnektorItem[] = [
  {
    id: 'konn-1',
    title: 'Übung 1: Konnektoren im Beruf',
    text: '_____ mein Freund endlich einen Ausbildungsplatz hatte, war er sehr froh. Er wusste nicht mehr genau, _____ er seine Bewerbung abgeschickt hatte. _____ er das erste Mal seinen Chef sah, war er aufgeregt. Es dauerte ein paar Wochen, _____ er alleine Aufgaben übernehmen konnte. _____ er jetzt an seine Anfangszeit zurückdenkt, ist er glücklich, dass er es geschafft hat. Es war damals sehr froh, _____ er sein erstes Gehalt bekam. _____ er seine Ausbildung in dieser Firma macht, wirkt er selbstbewusster als früher. Es dauert noch zwei Jahre, _____ er mit seiner Ausbildung fertig sein wird.',
    blanks: [
      { id: 1, answer: 'Als' },
      { id: 2, answer: 'wann' },
      { id: 3, answer: 'Als' },
      { id: 4, answer: 'bis' },
      { id: 5, answer: 'Wenn' },
      { id: 6, answer: 'seit' },
      { id: 7, answer: 'Weil' },
      { id: 8, answer: 'bevor' }
    ],
    pool: ['Als', 'wann', 'bis', 'Wenn', 'seit', 'Weil', 'bevor', 'obwohl', 'während']
  }
];

export const KonnektorTrainer: React.FC<KonnektorTrainerProps> = ({ onClose, onShowToast }) => {
  const [exercises, setExercises] = useState<KonnektorItem[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return saved.length ? saved : DEFAULT_EXERCISES;
    } catch {
      return DEFAULT_EXERCISES;
    }
  });

  const [currentId, setCurrentId] = useState<string>(exercises[0]?.id || 'konn-1');
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [draggedWord, setDraggedWord] = useState<string | null>(null);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [generating, setGenerating] = useState(false);

  const currentEx = exercises.find(e => e.id === currentId) || exercises[0];

  useEffect(() => {
    setUserAnswers({});
    setChecked(false);
  }, [currentId]);

  const saveArchive = (list: KonnektorItem[]) => {
    setExercises(list);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      /* ignore */
    }
  };

  const handleGenerateNew = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const prompt = `Create a German grammar exercise about connectors (Konnektoren und Präpositionen like als, wenn, während, obwohl, seit, bis, bevor, weil, etc.) at level B1/B2.
Provide a short text with exactly 6 to 7 blanks represented by placeholders like (1), (2), etc.
Provide the correct answers for each blank, and a pool of words that includes the correct answers PLUS 2 misleading distractor words (traps).
Return ONLY JSON: {"title":"...","text":"Text with (1), (2)... blanks","blanks":[{"id":1,"answer":"..."}],"pool":["...","..."]}`;
      
      const schema = S.obj({
        title: S.str('Übung'),
        text: S.req,
        blanks: S.arr(S.obj({ id: S.num(1, 10), answer: S.req })),
        pool: S.arr(S.req, 5)
      });

      const res = await askJson<any>(prompt, schema, { timeoutMs: 30000 });
      const newItem: KonnektorItem = {
        id: 'konn-' + Date.now(),
        title: res.title || 'Neue Konnektoren-Übung',
        text: res.text,
        blanks: res.blanks,
        pool: res.pool
      };

      const updated = [newItem, ...exercises];
      saveArchive(updated);
      setCurrentId(newItem.id);
      onShowToast('تمرین جدید با موفقیت ساخته شد ✓');
    } catch (e: any) {
      onShowToast(e?.message || 'ساخت تمرین ناموفق بود.', true);
    } finally {
      setGenerating(false);
    }
  };

  const handleDrop = (blankId: number, word: string) => {
    setUserAnswers(prev => ({ ...prev, [blankId]: word }));
    setDraggedWord(null);
    setSelectedWord(null);
  };

  const handleBlankClick = (blankId: number) => {
    if (selectedWord) {
      handleDrop(blankId, selectedWord);
    }
  };

  // تفکیک متن و جای‌گذاری باکس‌ها
  const renderInteractiveText = () => {
    let parts = currentEx.text.split(/_____|\(\d+\)/g);
    return (
      <div className="text-lg md:text-xl font-sans leading-loose text-slate-900 dark:text-slate-100 space-x-2 space-x-reverse" dir="ltr">
        {parts.map((part, index) => {
          const blankId = index + 1;
          const hasBlank = blankId <= currentEx.blanks.length;
          const filled = userAnswers[blankId];
          const isCorrect = checked && filled?.trim().toLowerCase() === currentEx.blanks.find(b => b.id === blankId)?.answer.toLowerCase();

          return (
            <React.Fragment key={index}>
              <span className="inline-block">{part}</span>
              {hasBlank && (
                <span
                  onClick={() => handleBlankClick(blankId)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => draggedWord && handleDrop(blankId, draggedWord)}
                  className={`inline-flex items-center justify-center min-w-[90px] h-9 mx-1 px-3 rounded-xl border-2 font-bold text-base cursor-pointer transition align-middle ${
                    checked
                      ? isCorrect
                        ? 'bg-emerald-100 border-emerald-500 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
                        : 'bg-red-100 border-red-500 text-red-900 dark:bg-red-950 dark:text-red-200'
                      : filled
                      ? 'bg-blue-50 border-[#1f5fbf] text-[#1f5fbf] dark:bg-blue-950/60 dark:text-blue-300'
                      : 'bg-slate-100 dark:bg-slate-800 border-dashed border-slate-300 dark:border-slate-700 text-slate-400'
                  }`}
                >
                  {filled || `(${blankId})`}
                </span>
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4 text-right max-w-2xl mx-auto pb-10" dir="rtl">
      {/* هدر مشابه سایر بخش‌ها */}
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl px-4 py-2.5 flex items-center justify-between gap-2 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="text-xl">🔗</span>
          <span className="font-extrabold text-sm md:text-base text-slate-900 dark:text-slate-100">
            حروف ربط و اضافه (Konnektoren & Präpositionen)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerateNew}
            disabled={generating}
            className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-xs disabled:opacity-50"
          >
            {generating ? '⏳ در حال ساخت…' : '✨ ساخت تمرین جدید'}
          </button>
          <button onClick={onClose} className="text-sm bg-slate-200 dark:bg-slate-800 px-3 py-1.5 rounded-xl font-semibold">
            ✕ خروج
          </button>
        </div>
      </div>

      {/* انتخابگر تمرین‌های آرشیو شده */}
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-slate-700 dark:text-slate-300">انتخاب تمرین:</span>
          <select
            value={currentId}
            onChange={e => setCurrentId(e.target.value)}
            className="bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-sm font-bold"
          >
            {exercises.map(ex => (
              <option key={ex.id} value={ex.id}>
                {ex.title}
              </option>
            ))}
          </select>
        </div>

        {/* جعبه کلمات (Pool) برای کشیدن یا کلیک */}
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#141923] border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="text-xs font-bold text-[#5d6676] dark:text-[#a3adbd]">
            کلمات پیشنهادی (برای جای‌گذاری بکشید یا روی کلمه و سپس جای خالی کلیک کنید):
          </div>
          <div className="flex flex-wrap gap-2" dir="ltr">
            {currentEx.pool.map((word, i) => {
              const isSelected = selectedWord === word;
              return (
                <div
                  key={i}
                  draggable
                  onDragStart={() => setDraggedWord(word)}
                  onClick={() => setSelectedWord(isSelected ? null : word)}
                  className={`px-3.5 py-1.5 rounded-xl font-bold text-sm cursor-grab active:cursor-grabbing transition shadow-xs ${
                    isSelected
                      ? 'bg-[#1f5fbf] text-white ring-2 ring-blue-300'
                      : 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:border-[#1f5fbf]'
                  }`}
                >
                  {word}
                </div>
              );
            })}
          </div>
        </div>

        {/* متن تمرین */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#1b2029] border border-slate-200 dark:border-slate-800">
          {renderInteractiveText()}
        </div>

        {/* دکمه تصحیح */}
        <div className="flex gap-2 pt-2">
          {!checked ? (
            <button
              onClick={() => setChecked(true)}
              className="flex-1 bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white py-2.5 rounded-xl text-sm font-bold shadow-md"
            >
              تصحیح پاسخ‌ها 🔍
            </button>
          ) : (
            <button
              onClick={() => {
                setChecked(false);
                setUserAnswers({});
              }}
              className="flex-1 bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 py-2.5 rounded-xl text-sm font-bold"
            >
              🔄 تلاش مجدد
            </button>
          )}
        </div>
      </div>
    </div>
  );
}; 

Thought Process
اجازه دهید فایل را ذخیره و بررسی کامل کنم.

فایل را به دقت بررسی کردم. چند مشکل پیدا کردم که مهم‌ترینشان یک باگ یادگیری است و بقیه مشکلات فرعی/UX هستند.

مشکلات پیدا‌شده
۱. ⚠️ مهم‌ترین: پاسخ درست بعد از تصحیح نشان داده نمی‌شود
وقتی کاربر «تصحیح پاسخ‌ها» را می‌زند و جوابی غلط است، فقط جواب غلطِ خودش قرمز نمایش داده می‌شود — اما پاسخ درست هرگز نشان داده نمی‌شود. این یعنی کاربر نمی‌تواند از اشتباهش درس بگیرد. این بزرگ‌ترین نقص تمرین است.

۲. speak ایمپورت شده ولی هرگز استفاده نمی‌شود
js
import { speak } from '../utils/audio';  // ❌ استفاده‌نشده
۳. let parts به‌جای const parts
متغیر parts دوباره مقدار نمی‌گیرد؛ باید const باشد.

۴. Regex مقاوم نیست برای خروجی هوش مصنوعی
js
let parts = currentEx.text.split(/_____|\(\d+\)/g);
فقط دقیقاً _____ (پنج خط‌زیر) یا (N) را می‌شناسد. اگر هوش مصنوعی به‌جای (1) از [1] یا به‌جای _____ از ___ یا ______ استفاده کند، split نمی‌شود و کل متن بدون جای‌خالی نمایش داده می‌شود. چون دکمهٔ «ساخت تمرین جدید» به هوش مصنوعی وابسته است، این احتمال واقعی است.

۵. تطابق تعداد blanks با تعداد جای‌خالی بررسی نمی‌شود
اگر هوش مصنوعی متن با ۶ جای‌خالی ولی blanks با ۷ آیتم برگرداند، یک باکس اضافیِ خالی رندر می‌شود. اگر blanks کمتر از تعداد جای‌خالی باشد، باکس‌های انتهایی بدون تطابق می‌مانند.

۶. نمی‌توان یک جای‌خالی را به‌تنهایی خالی کرد
وقتی کلمه‌ای در جای‌خالی گذاشته شد، فقط با انتخاب کلمهٔ دیگر قابل جایگزینی است؛ پاک کردن تک‌تک ممکن نیست (فقط «تلاش مجدد» همه را پاک می‌کند).

۷. تکرار کلمه در Pool و استفادهٔ مجدد
در تمرین پیش‌فرض، Als دو بار پاسخ درست است (جای‌خالی ۱ و ۳) ولی فقط یک بار در pool آمده. این مشکلی نیست چون کلمات مصرف نمی‌شوند — ولی اگر انتظار کاربر «هر کلمه یک بار» باشد، گیج‌کننده است. این یک تصمیم طراحی است، نه باگ.

حالا نسخهٔ اصلاح‌شده را می‌سازم که مشکلات ۱ تا ۵ را حل می‌کند:

اکنون اصلاحات اصلی را در renderInteractiveText اعمال می‌کنم: (الف) پشتیبانی از انواع مختلف مارکر جای‌خالی، (ب) نمایش پاسخ درست بعد از تصحیح، (پ) دکمهٔ پاک‌کردن تک‌تک:

حالا یک تابع اعتبارسنجی برای تمرین‌های تولیدشده با هوش مصنوعی اضافه می‌کنم تا اگر تعداد جای‌خالی با blanks مطابقت نداشت، خودکار اصلاح شود و کاربر صفحهٔ خراب نبیند:

اکنون بررسی نهایی که فایل معتبر است و خطای syntax ندارد:

node نمی‌تواند مستقیماً .tsx را چک کند. یک چک سبک با حذف JSX از طریق یک تبدیل ساده انجام می‌دهم تا دست‌کم خطای پرانتز/کروشه باشد:

موجودیت پرانتزها و کروشه‌ها متوازن است. حالا یک بررسی نهایی روی فایل می‌کنم تا مطمئن شوم همهٔ اصلاحات درست اعمال شده‌اند:

اکنون یک تست سریع روی منطق split انجام می‌دهم تا مطمئن شوم regex جدید درست کار می‌کند:

منطق split درست کار می‌کند. حالا یک تست هم روی تمرین پیش‌فرض انجام می‌دهم تا مطمئن شوم تعداد جای‌خالی (۸) با تعداد blanks (۸) مطابقت دارد:

همه چیز درست است. فایل نهایی آماده است.

خلاصهٔ بررسی و اصلاحات
فایل KonnektorTrainer.tsx را بررسی کردم و ۶ مشکل پیدا کردم که همه را اصلاح کردم:

مشکلات اصلاح‌شده
#
مشکل
اصلاح
۱	مهم‌ترین: پاسخ درست بعد از تصحیح نشان داده نمی‌شد — کاربر نمی‌توانست درس بگیرد	حالا وقتی غلط است، پاسخ غلط خط‌خورده + «→ پاسخ درست» سبز در همان باکس نمایش داده می‌شود
۲	speak ایمپورت شده ولی استفاده نشده بود	حذف شد
۳	let parts به‌جای const parts	const شد
۴	regex فقط دقیقاً _____ (پنج خط) یا (N) را می‌شناخت؛ خروجی هوش مصنوعی مثل [1] یا ___ شکست می‌خورد	regex جدید: _{3,} (هر تعداد خط ≥۳) + (N) + [N] + {N} را پشتیبانی می‌کند
۵	اگر هوش مصنوعی تعداد blanks را درست برنگرداند، باکس‌های اضافی/ناقص رندر می‌شد	اعتبارسنجی خودکار در handleGenerateNew: مارکرها به شکل استاندارد (N) نرمال می‌شوند، تعداد blanks با تعداد جای‌خالی متن تطبیق داده می‌شود، pool به‌عنوان آرایهٔ رشته‌ها تضمین می‌شود
۶	نمی‌شد یک جای‌خالی را به‌تنهایی پاک کرد	دکمهٔ ✕ کنار هر باکس پرشده اضافه شد (قبل از تصحیح)

نکات کلیدی رفتار جدید
قبل از تصحیح: کاربر کلمه را با drag یا click می‌گذارد؛ می‌تواند ✕ بزند و پاک کند.
بعد از تصحیح:
درست: باکس سبز با پاسخ کاربر.
غلط: باکس قرمز، پاسخ کاربر خط‌خورده + «→ پاسخ درست» سبز زیرش.
خالی: باکس قرمز + «→ پاسخ درست» سبز.
بررسی‌های انجام‌شده
✅ موجودیت پرانتز/کروشه/آکولاد متوازن است.
✅ regex روی متن پیش‌فرض: ۸ جای‌خالی = ۸ blanks در آرایه.
✅ regex روی حالت‌های (1), [1], {1}, ___, و حالت مخلوط تست شد — همگی درست split می‌شوند.
فایل اصلاح‌شده: KonnektorTrainer.tsx

این فایل را جایگزین src/components/KonnektorTrainer.tsx در پروژه‌تان کنید. همراه با اصلاح ExercisesView.tsx در پیام قبلی، تمرین «حروف ربط و اضافه» حالا باید هم نمایش داده شود و هم به‌درستی کار کند.

اگر می‌خواهید، می‌توانم ../utils/trainerKit (که askJson و S از آن می‌آیند) را هم بررسی کنم تا مطمئن شویم در ساخت تمرین جدید مشکلی نیست.

All files in task
2
File
KonnektorTrainer
· tsx
File
ExercisesView
· tsx
app wort
Send a Message


Connect IM

GLM-5.2
Chat controls
File
KonnektorTrainer.tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { askJson, S } from '../utils/trainerKit';

interface KonnektorTrainerProps {
  onClose: () => void;
  onShowToast: (msg: string, isErr?: boolean) => void;
}

interface KonnektorItem {
  id: string;
  title: string;
  text: string; // شامل جای‌خالی‌های مثل [1], [2] یا خط تیره
  blanks: { id: number; answer: string }[];
  pool: string[]; // شامل پاسخ‌های درست + ۲ تله
}

const STORAGE_KEY = 'wb_konnektor_archive_v1';

const DEFAULT_EXERCISES: KonnektorItem[] = [
  {
    id: 'konn-1',
    title: 'Übung 1: Konnektoren im Beruf',
    text: '_____ mein Freund endlich einen Ausbildungsplatz hatte, war er sehr froh. Er wusste nicht mehr genau, _____ er seine Bewerbung abgeschickt hatte. _____ er das erste Mal seinen Chef sah, war er aufgeregt. Es dauerte ein paar Wochen, _____ er alleine Aufgaben übernehmen konnte. _____ er jetzt an seine Anfangszeit zurückdenkt, ist er glücklich, dass er es geschafft hat. Es war damals sehr froh, _____ er sein erstes Gehalt bekam. _____ er seine Ausbildung in dieser Firma macht, wirkt er selbstbewusster als früher. Es dauert noch zwei Jahre, _____ er mit seiner Ausbildung fertig sein wird.',
    blanks: [
      { id: 1, answer: 'Als' },
      { id: 2, answer: 'wann' },
      { id: 3, answer: 'Als' },
      { id: 4, answer: 'bis' },
      { id: 5, answer: 'Wenn' },
      { id: 6, answer: 'seit' },
      { id: 7, answer: 'Weil' },
      { id: 8, answer: 'bevor' }
    ],
    pool: ['Als', 'wann', 'bis', 'Wenn', 'seit', 'Weil', 'bevor', 'obwohl', 'während']
  }
];

export const KonnektorTrainer: React.FC<KonnektorTrainerProps> = ({ onClose, onShowToast }) => {
  const [exercises, setExercises] = useState<KonnektorItem[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return saved.length ? saved : DEFAULT_EXERCISES;
    } catch {
      return DEFAULT_EXERCISES;
    }
  });

  const [currentId, setCurrentId] = useState<string>(exercises[0]?.id || 'konn-1');
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [draggedWord, setDraggedWord] = useState<string | null>(null);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [generating, setGenerating] = useState(false);

  const currentEx = exercises.find(e => e.id === currentId) || exercises[0];

  useEffect(() => {
    setUserAnswers({});
    setChecked(false);
  }, [currentId]);

  const saveArchive = (list: KonnektorItem[]) => {
    setExercises(list);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      /* ignore */
    }
  };

  const handleGenerateNew = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const prompt = `Create a German grammar exercise about connectors (Konnektoren und Präpositionen like als, wenn, während, obwohl, seit, bis, bevor, weil, etc.) at level B1/B2.
Provide a short text with exactly 6 to 7 blanks represented by placeholders like (1), (2), etc.
Provide the correct answers for each blank, and a pool of words that includes the correct answers PLUS 2 misleading distractor words (traps).
Return ONLY JSON: {"title":"...","text":"Text with (1), (2)... blanks","blanks":[{"id":1,"answer":"..."}],"pool":["...","..."]}`;
      
      const schema = S.obj({
        title: S.str('Übung'),
        text: S.req,
        blanks: S.arr(S.obj({ id: S.num(1, 10), answer: S.req })),
        pool: S.arr(S.req, 5)
      });

      const res = await askJson<any>(prompt, schema, { timeoutMs: 30000 });

      // اعتبارسنجی و یکسان‌سازی متن و blanks:
      // 1) تمام مارکرها را به شکل استاندارد (N) تبدیل می‌کنیم
      const normalizedText = (res.text || '')
        .replace(/_{3,}/g, m => `(${(res.blanks || []).length})`)  //_____ -> آخرین شماره (تقریبی)
        .replace(/\[\s*(\d+)\s*\]/g, '($1)')
        .replace(/\{\s*(\d+)\s*\}/g, '($1)');
      // شمارش جای‌خالی‌های واقعی در متن نرمال‌شده
      const blankMatches = normalizedText.match(/\(\s*\d+\s*\)/g) || [];
      let blanks = Array.isArray(res.blanks) ? res.blanks.map((b: any, i: number) => ({
        id: typeof b.id === 'number' ? b.id : i + 1,
        answer: String(b.answer || '').trim()
      })).filter((b: any) => b.answer) : [];

      // اگر تعداد blanks کمتر از تعداد جای‌خالی متن باشد، مابقی را با جای‌خالی خالی پر می‌کنیم
      // اگر بیشتر باشد، اضافه‌ها نادیده گرفته می‌شوند
      if (blanks.length < blankMatches.length) {
        for (let i = blanks.length; i < blankMatches.length; i++) {
          blanks.push({ id: i + 1, answer: '—' });
        }
      }

      // pool: حتماً آرایهٔ رشته‌ها
      const pool = Array.isArray(res.pool) ? res.pool.map((x: any) => String(x)).filter(Boolean) : [];

      const newItem: KonnektorItem = {
        id: 'konn-' + Date.now(),
        title: res.title || 'Neue Konnektoren-Übung',
        text: normalizedText,
        blanks,
        pool
      };

      const updated = [newItem, ...exercises];
      saveArchive(updated);
      setCurrentId(newItem.id);
      onShowToast('تمرین جدید با موفقیت ساخته شد ✓');
    } catch (e: any) {
      onShowToast(e?.message || 'ساخت تمرین ناموفق بود.', true);
    } finally {
      setGenerating(false);
    }
  };

  const handleDrop = (blankId: number, word: string) => {
    setUserAnswers(prev => ({ ...prev, [blankId]: word }));
    setDraggedWord(null);
    setSelectedWord(null);
  };

  const handleBlankClick = (blankId: number) => {
    if (selectedWord) {
      handleDrop(blankId, selectedWord);
    }
  };

  // تفکیک متن و جای‌گذاری باکس‌ها
  // پشتیبانی از انواع مارکر جای‌خالی:
  //   _____  (هر تعداد خط‌زیر ≥ ۳)
  //   (1) (2) ...   |   [1] [2] ...   |   {1} {2} ...
  const renderInteractiveText = () => {
    const parts = currentEx.text.split(/_{3,}|\(\s*\d+\s*\)|\[\s*\d+\s*\]|\{\s*\d+\s*\}/g);
    // شمارش تعداد جای‌خالی واقعی که regex پیدا کرده (تعداد cut‌ها + ۱)
    const blankCount = parts.length - 1;
    // استفاده از blanks تا حد موجود؛ اگر کمتر از تعداد جای‌خالی بود، باکس اضافی رندر نشود
    const usableBlanks = currentEx.blanks.slice(0, blankCount);

    return (
      <div className="text-lg md:text-xl font-sans leading-loose text-slate-900 dark:text-slate-100 space-x-2 space-x-reverse" dir="ltr">
        {parts.map((part, index) => {
          const blankId = index + 1;
          const hasBlank = index < usableBlanks.length;
          if (!hasBlank) {
            return <span key={index} className="inline-block">{part}</span>;
          }
          const correctAnswer = usableBlanks[index].answer;
          const filled = userAnswers[blankId];
          const isCorrect = checked && filled?.trim().toLowerCase() === correctAnswer.toLowerCase();
          const showCorrect = checked && !isCorrect;

          return (
            <React.Fragment key={index}>
              <span className="inline-block">{part}</span>
              <span
                onClick={() => handleBlankClick(blankId)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => draggedWord && handleDrop(blankId, draggedWord)}
                className={`inline-flex items-center justify-center min-w-[90px] h-9 mx-1 px-3 rounded-xl border-2 font-bold text-base cursor-pointer transition align-middle ${
                  checked
                    ? isCorrect
                      ? 'bg-emerald-100 border-emerald-500 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
                      : 'bg-red-100 border-red-500 text-red-900 dark:bg-red-950 dark:text-red-200'
                    : filled
                    ? 'bg-blue-50 border-[#1f5fbf] text-[#1f5fbf] dark:bg-blue-950/60 dark:text-blue-300'
                    : 'bg-slate-100 dark:bg-slate-800 border-dashed border-slate-300 dark:border-slate-700 text-slate-400'
                }`}
              >
                {checked && !isCorrect && filled ? (
                  // نمایش پاسخ غلط خط‌خورده + پاسخ درست زیر آن
                  <span className="flex flex-col items-center leading-tight">
                    <span className="line-through opacity-70">{filled}</span>
                    <span className="text-emerald-700 dark:text-emerald-300 font-bold">→ {correctAnswer}</span>
                  </span>
                ) : checked && !isCorrect ? (
                  <span className="text-emerald-700 dark:text-emerald-300">→ {correctAnswer}</span>
                ) : (
                  filled || `(${blankId})`
                )}
              </span>
              {/* دکمهٔ پاک‌کردن این جای‌خالی (فقط قبل از تصحیح) */}
              {filled && !checked && (
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    setUserAnswers(prev => { const n = { ...prev }; delete n[blankId]; return n; });
                  }}
                  className="text-xs text-red-500 hover:text-red-700 font-bold mr-1"
                  title="پاک کردن این پاسخ"
                >
                  ✕
                </button>
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4 text-right max-w-2xl mx-auto pb-10" dir="rtl">
      {/* هدر مشابه سایر بخش‌ها */}
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl px-4 py-2.5 flex items-center justify-between gap-2 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="text-xl">🔗</span>
          <span className="font-extrabold text-sm md:text-base text-slate-900 dark:text-slate-100">
            حروف ربط و اضافه (Konnektoren & Präpositionen)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerateNew}
            disabled={generating}
            className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-xs disabled:opacity-50"
          >
            {generating ? '⏳ در حال ساخت…' : '✨ ساخت تمرین جدید'}
          </button>
          <button onClick={onClose} className="text-sm bg-slate-200 dark:bg-slate-800 px-3 py-1.5 rounded-xl font-semibold">
            ✕ خروج
          </button>
        </div>
      </div>

      {/* انتخابگر تمرین‌های آرشیو شده */}
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-slate-700 dark:text-slate-300">انتخاب تمرین:</span>
          <select
            value={currentId}
            onChange={e => setCurrentId(e.target.value)}
            className="bg-slate-50 dark:bg-[#141923] border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-sm font-bold"
          >
            {exercises.map(ex => (
              <option key={ex.id} value={ex.id}>
                {ex.title}
              </option>
            ))}
          </select>
        </div>

        {/* جعبه کلمات (Pool) برای کشیدن یا کلیک */}
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#141923] border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="text-xs font-bold text-[#5d6676] dark:text-[#a3adbd]">
            کلمات پیشنهادی (برای جای‌گذاری بکشید یا روی کلمه و سپس جای خالی کلیک کنید):
          </div>
          <div className="flex flex-wrap gap-2" dir="ltr">
            {currentEx.pool.map((word, i) => {
              const isSelected = selectedWord === word;
              return (
                <div
                  key={i}
                  draggable
                  onDragStart={() => setDraggedWord(word)}
                  onClick={() => setSelectedWord(isSelected ? null : word)}
                  className={`px-3.5 py-1.5 rounded-xl font-bold text-sm cursor-grab active:cursor-grabbing transition shadow-xs ${
                    isSelected
                      ? 'bg-[#1f5fbf] text-white ring-2 ring-blue-300'
                      : 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:border-[#1f5fbf]'
                  }`}
                >
                  {word}
                </div>
              );
            })}
          </div>
        </div>

        {/* متن تمرین */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#1b2029] border border-slate-200 dark:border-slate-800">
          {renderInteractiveText()}
        </div>

        {/* دکمه تصحیح */}
        <div className="flex gap-2 pt-2">
          {!checked ? (
            <button
              onClick={() => setChecked(true)}
              className="flex-1 bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white py-2.5 rounded-xl text-sm font-bold shadow-md"
            >
              تصحیح پاسخ‌ها 🔍
            </button>
          ) : (
            <button
              onClick={() => {
                setChecked(false);
                setUserAnswers({});
              }}
              className="flex-1 bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 py-2.5 rounded-xl text-sm font-bold"
            >
              🔄 تلاش مجدد
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
