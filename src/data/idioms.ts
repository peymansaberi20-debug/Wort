/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * idioms.ts — Redewendungen (اصطلاحات آلمانی) برای آزمون B2
 *
 * شامل اصطلاحات پرکاربرد در آزمون‌های Goethe/ÖSD/telc B2:
 *   - اصطلاحات بدنی (die Daumen drücken, ins Gras beißen)
 *   - اصطلاحات حیوانی (die Kuh vom Eis holen, einen Bärenhunger haben)
 *   - اصطلاحات عددی (alle Jubeljahre, fünf gerade sein lassen)
 *   - افعال ترکیبی با اسم (in den Wald kommen, auf dem Schlauch stehen)
 *
 * هر اصطلاح: idiom (آلمانی) | literalFa (ترجمهٔ تحت‌اللفظی) | meaningFa (معنای واقعی) | example (مثال آلمانی) | exampleFa (ترجمهٔ مثال) | level
 */

export interface Idiom {
  id: string;
  idiom: string;
  literalFa: string;
  meaningFa: string;
  example: string;
  exampleFa: string;
  level: string;
  cat: string;
}

const RAW = `
die Daumen drücken|انگشت شست فشار دادن|آرزوی موفقیت برای کسی|Ich drücke dir die Daumen für die Prüfung!|برای آزمونت برات آرزوی موفقیت می‌کنم!|B1|بدنی
ins Gras beißen|به چمن گاز زدن|مردن/سوختن|Der alte Hund musste leider ins Gras beißen.|سگ پیر متأسفانه مرد.|B2|بدنی
die Beine in die Hand nehmen|پاها را به دست بگیر|فرار کردن/سریع دویدن|Die Kinder nahmen die Beine in die Hand und rannten nach Hause.|بچه‌ها سریع دویدند به خانه.|B2|بدنی
jemandem auf die Füße treten|روی پاهای کسی پاشیدن|توهین به احساسات کسی|Mit ihrer Kritik ist sie ihm auf die Füße getreten.|با نقدش به احساساتش توهین کرد.|B2|بدنی
die Hand über den Kopf legen|دست را روی سر بگذار|قاطعانه تصمیم بگیرد|Ich lege die Hand über den Kopf: wir gehen nicht dorthin.|قاطعانه می‌گویم: آنجا نمی‌رویم.|C1|بدنی
die Kuh vom Eis holen|گاو را از یخ بیرون بکش|مشکل را حل کن|Jetzt müssen wir die Kuh vom Eis holen.|حالا باید مشکل را حل کنیم.|B2|حیوانی
einen Bärenhunger haben|گرسنهٔ خرس داشتن|خیلی گرسنه بودن|Ich habe einen Bärenhunger!|خیلی گرسنه‌ام!|B2|حیوانی
wie Hund und Katze sein|مثل سگ و گربه بودن|همیشه دعوا داشتن|Die beiden sind wie Hund und Katze.|آن دو همیشه دعوا دارند.|B2|حیوانی
die Fliege machen|مگس بساز|فرار کردن|Mach die Fliege, bevor ich wütend werde!|فرار کن قبل از اینکه عصبانی شم!|B2|حیوانی
einen Vogel haben|پرنده داشتن|دیوانه بودن|Du hast wohl einen Vogel!|خودت دیوانه‌ای!|B1|حیوانی
alle Jubeljahre|هر سال جشن|بسیار نادر|Er besucht uns nur alle Jubeljahre.|او فقط هر چند سال یک‌بار به ما سر می‌زند.|B2|عددی
fünf gerade sein lassen|پنج را زوج بگیر|چشم‌پوشی کن|Lass fünf gerade sein, das ist nicht so wichtig.|چشم‌پوشی کن، این مهم نیست.|B2|عددی
ein Haar in der Suppe finden|یک مو در سوپ پیدا کن|ایراد پیدا کن|Er findet immer ein Haar in der Suppe.|او همیشه ایراد پیدا می‌کند.|B2|غذایی
nicht das Gelbe vom Ei sein|زردهٔ تخم‌مرغ نبودن|کامل نبودن|Das Hotel war nicht das Gelbe vom Ei.|هتل خیلی کامل نبود.|B2|غذایی
die Würfel fallen|تاس‌ها بیفتند|تصمیم نهایی گرفته شود|Jetzt fallen die Würfel.|حالا تصمیم نهایی گرفته می‌شود.|B2|عددی
ins Wasser fallen|به آب بیفتد|لغو شود|Unser Plan ist leider ins Wasser gefallen.|برنامه‌مان متأسفانه لغو شد.|B2|طبیعت
jm. nicht das Wasser reichen können|به کسی آب ندادن|به پای کسی نرسیدن|Er kann ihr nicht das Wasser reichen.|او به پای او نمی‌رسد.|B2|طبیعت
die Katze im Sack kaufen|گربه را در کیسه بخر|بدون دیدن چیزی را خریدن|Ich kaufe nicht die Katze im Sack.|بدون دیدن نمی‌خرم.|B2|حیوانی
die Reißleine ziehen|ریس‌لین را بکش|قطع رابطه|Als es schwierig wurde, zog er die Reißleine.|وقتی سخت شد، رابطه را قطع کرد.|C1|تصادفی
auf dem Schlauch stehen|روی شیلنگ بایست|سوتی بده/نمی‌فهمی|Ich stand gerade total auf dem Schlauch.|اصلاً نمی‌فهمیدم چی می‌گویند.|B2|تصادفی
den Wald vor lauter Bäumen nicht sehen|جنگل را از درختان نبین|میخود را در چوب‌خط نبین|Du siehst den Wald vor lauter Bäumen nicht.|گُل در گل نمی‌بینیش.|B2|طبیعت
den Nagel auf den Kopf treffen|میخ را روی سر بزن|دقیق به نقطه بزن|Mit dieser Analyse hast du den Nagel auf den Kopf getroffen.|با این تحلیل دقیق به نقطه زدی.|B2|تصادفی
jm. in die Quere kommen|در راه کسی بیفت|مانع شوی|Ich will niemandem in die Quere kommen.|نمی‌خوام مانع کسی بشم.|B2|تصادفی
ein Brett vorm Kopf haben|تخته جلوی سر داشتن|نمی‌فهمی|Du hast wohl ein Brett vorm Kopf!|اصلاً نمی‌فهمی!|B2|بدنی
jm. in den Rücken fallen|به پشت کسی چاقو بزن|خیانت کن|Er ist seinem Freund in den Rücken gefallen.|به رفیعش خیانت کرد.|B2|بدنی
die Flinte ins Korn werfen|تفنگ را به انبار بینداز|بی‌حوصلگی کن|Mach nicht die Flinte ins Korn!|بی‌حوصلگی نکن!|B2|تصادفی
in die Bresche springen|در شکاف بپر|کمک کن|Für die Kollegin sprang er in die Bresche.|برای همکارش کمک کرد.|C1|تصادفی
auf die Pauke hauen|بر طبل بکوب|مست کن/سر و صدا کن|Er hat wieder auf die Pauke gehauen.|دوباره مست و سر و صدا کرده.|B2|تصادفی
ein Auge auf jn. werfen|چشم به کسی بینداز|به کسی علاقه‌مند شوی|Er hat ein Auge auf sie geworfen.|به او علاقه‌مند شده.|B2|بدنی
aus dem Häuschen sein|از خانه بیرون باش|خیلی هیجان‌زده باش|Die Kinder sind ganz aus dem Häuschen.|بچه‌ها خیلی هیجان‌زده‌اند.|B2|بدنی
den Faden verlieren|نخ را گم کن|حرفت را گم کن|Ich habe den Faden verloren.|حرفم را گم کردم.|B2|تصادفی
jn. über den Tisch ziehen|کسی را روی میز بکش|فریب کسی بده|Der Verkäufer hat mich über den Tisch gezogen.|فروشنده فریبم داد.|B2|تصادفی
mit dem Kopf durch die Wand wollen|با سر از دیوار برو|سرسخت باش|Er will immer mit dem Kopf durch die Wand.|همیشه سرسخت است.|B2|بدنی
den Karren vor das Pferd spannen|گاری را جلوی اسب ببند|برعکس عمل کن|Du spannst den Karren vor das Pferd.|برعکس عمل می‌کنی.|C1|حیوانی
ein offenes Buch sein|کتاب باز بودن|آشکار بودن|Für mich ist sie ein offenes Buch.|برای من آشکار است.|B1|کتابی
das Kind beim Namen nennen|بچه را به نام صدا کن|راستش را بگو|Wir müssen das Kind beim Namen nennen.|باید راستش را بگوییم.|B2|تصادفی
`;

export const IDIOMS: Idiom[] = RAW
  .split('\n')
  .map(l => l.trim())
  .filter(Boolean)
  .map(l => {
    const [idiom, literalFa, meaningFa, example, exampleFa, level, cat] = l.split('|').map(s => (s || '').trim());
    if (!idiom || !meaningFa) return null;
    return {
      id: idiom.toLowerCase().replace(/\s+/g, '_').slice(0, 60),
      idiom, literalFa, meaningFa, example, exampleFa,
      level: level || 'B2',
      cat: cat || 'عمومی'
    } as Idiom;
  })
  .filter((x): x is Idiom => !!x);

export const IDIOM_CATS = Array.from(new Set(IDIOMS.map(i => i.cat)));
export const IDIOM_LEVELS = ['A2', 'B1', 'B2', 'C1'];
