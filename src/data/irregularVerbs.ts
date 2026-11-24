/**
 * irregularVerbs.ts — بانک فعل‌های بی‌قاعدهٔ سطح‌محور برای بازی «فعل‌های بی‌قاعده در سه زمان»
 *
 * ▌منطق بانک:
 *   هر سطح A1–C2 فعل‌های بی‌قاعدهٔ ردهٔ خودش را دارد؛ اعم از اینکه Präteritum بی‌قاعده باشد
 *   یا Partizip II یا هر دو (همان چیزی که کاربر خواسته: «چه Perfekt شون بی‌قاعده باشه
 *   چه Präteritum شون چه هر دو»).
 *   فرم‌ها همان قرارداد تمرین «داستان همهٔ زمان‌ها» است:
 *     prt = شکل er/sie/es در Präteritum (جداشدنی‌ها: «kam an»)
 *     pp  = شکل کامل Partizip II (با ge- یا بدون آن؛ جداشدنی‌ها: «angekommen»)
 *     aux = فعل کمکی Perfekt (haben/sein)
 *   هایلایت بخشِ تغییر یافته به‌صورت خودکار با مقایسهٔ مصدر و شکل مشتق در src/utils/irrDiff.ts
 *   انجام می‌شود؛ فقط برای چند فعل خاص (فعل‌های مُدال مثل wollen که تغییرشان وسط کلمه است)
 *   هایلایت دستی hPrat/hPp داده شده است.
 */

export type IrrLvl = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export const IRR_LVL_ORDER: IrrLvl[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export const IRR_LVL_INFO: Record<IrrLvl, { label: string }> = {
  A1: { label: 'پایه: sein/haben، فعل کمکی werden و پرکاربردترین بی‌قاعده‌های روزمره' },
  A2: { label: 'مقدماتی: بی‌قاعده‌های جداشدنی و زندگی روزمره (anfangen, einladen, bringen…)' },
  B1: { label: 'متوسط: بی‌قاعده‌های پیشونددار و جداشدنی (verstehen, entscheiden, aufgeben…)' },
  B2: { label: 'متوسط پیشرفته: بی‌قاعده‌های انتزاعی‌تر (gelten, empfangen, stattfinden…)' },
  C1: { label: 'پیشرفته: اصیل‌ترین بی‌قاعده‌ها (geschehen, genießen, erschrecken…)' },
  C2: { label: 'مهارتی: نادرترین بی‌قاعده‌ها (fechten, gären, gebären…)' }
};

export interface IrrVerb {
  inf: string;         // مصدر
  fa: string;          // معنی فارسی
  aux: 'haben' | 'sein'; // فعل کمکی Perfekt
  prt: string;         // Präteritum (شکل er/sie/es)
  pp: string;          // Partizip II
  lvl: IrrLvl;         // سطح
  sep?: string;        // پیشوند جداشدنی (اگر دارد)
  altPrt?: string[];   // شکل‌های Präteritum دیگر که پذیرفته می‌شوند
  altPp?: string[];    // شکل‌های Partizip II دیگر که پذیرفته می‌شوند
  hPrat?: string;      // هایلایت دستی بخش تغییر یافتهٔ prt (وقتی تشخیص خودکار کافی نیست)
  hPp?: string;        // هایلایت دستی بخش تغییر یافتهٔ pp
  src?: 'bank' | 'lib'; // منبع فعل: بانک آماده یا کتاب واژگان کاربر
}

/** همهٔ فعل‌های بی‌قاعدهٔ بانک */
export const IRR_VERBS: IrrVerb[] = [
  // ───────────────── A1 — پرکاربردترین‌ها ─────────────────
  { inf: 'sein', fa: 'بودن', aux: 'sein', prt: 'war', pp: 'gewesen', lvl: 'A1' },
  { inf: 'haben', fa: 'داشتن', aux: 'haben', prt: 'hatte', pp: 'gehabt', lvl: 'A1' },
  { inf: 'werden', fa: 'شدن؛ فعل کمکی آینده', aux: 'sein', prt: 'wurde', pp: 'geworden', lvl: 'A1' },
  { inf: 'gehen', fa: 'رفتن', aux: 'sein', prt: 'ging', pp: 'gegangen', lvl: 'A1' },
  { inf: 'kommen', fa: 'آمدن', aux: 'sein', prt: 'kam', pp: 'gekommen', lvl: 'A1' },
  { inf: 'fahren', fa: 'رانندگی/حرکت کردن', aux: 'sein', prt: 'fuhr', pp: 'gefahren', lvl: 'A1' },
  { inf: 'bleiben', fa: 'ماندن', aux: 'sein', prt: 'blieb', pp: 'geblieben', lvl: 'A1' },
  { inf: 'laufen', fa: 'دویدن/راه رفتن', aux: 'sein', prt: 'lief', pp: 'gelaufen', lvl: 'A1' },
  { inf: 'essen', fa: 'خوردن', aux: 'haben', prt: 'aß', pp: 'gegessen', lvl: 'A1' },
  { inf: 'trinken', fa: 'نوشیدن', aux: 'haben', prt: 'trank', pp: 'getrunken', lvl: 'A1' },
  { inf: 'lesen', fa: 'خواندن', aux: 'haben', prt: 'las', pp: 'gelesen', lvl: 'A1' },
  { inf: 'sehen', fa: 'دیدن', aux: 'haben', prt: 'sah', pp: 'gesehen', lvl: 'A1' },
  { inf: 'sprechen', fa: 'حرف زدن', aux: 'haben', prt: 'sprach', pp: 'gesprochen', lvl: 'A1' },
  { inf: 'nehmen', fa: 'گرفتن', aux: 'haben', prt: 'nahm', pp: 'genommen', lvl: 'A1' },
  { inf: 'geben', fa: 'دادن', aux: 'haben', prt: 'gab', pp: 'gegeben', lvl: 'A1' },
  { inf: 'finden', fa: 'پیدا کردن', aux: 'haben', prt: 'fand', pp: 'gefunden', lvl: 'A1' },
  { inf: 'helfen', fa: 'کمک کردن', aux: 'haben', prt: 'half', pp: 'geholfen', lvl: 'A1' },
  { inf: 'schreiben', fa: 'نوشتن', aux: 'haben', prt: 'schrieb', pp: 'geschrieben', lvl: 'A1' },
  { inf: 'denken', fa: 'فکر کردن', aux: 'haben', prt: 'dachte', pp: 'gedacht', lvl: 'A1' },
  { inf: 'schlafen', fa: 'خوابیدن', aux: 'haben', prt: 'schlief', pp: 'geschlafen', lvl: 'A1' },
  { inf: 'stehen', fa: 'ایستادن', aux: 'haben', prt: 'stand', pp: 'gestanden', lvl: 'A1' },
  { inf: 'sitzen', fa: 'نشستن', aux: 'haben', prt: 'saß', pp: 'gesessen', lvl: 'A1' },
  { inf: 'liegen', fa: 'خوابیده/دراز کشیدن', aux: 'haben', prt: 'lag', pp: 'gelegen', lvl: 'A1' },
  { inf: 'heißen', fa: 'نام داشتن', aux: 'haben', prt: 'hieß', pp: 'geheißen', lvl: 'A1' },
  { inf: 'wissen', fa: 'دانستن', aux: 'haben', prt: 'wusste', pp: 'gewusst', lvl: 'A1' },
  { inf: 'können', fa: 'توانستن', aux: 'haben', prt: 'konnte', pp: 'gekonnt', lvl: 'A1', hPrat: 'onn' },
  { inf: 'müssen', fa: 'مجبور بودن/باید', aux: 'haben', prt: 'musste', pp: 'gemusst', lvl: 'A1', hPrat: 'uss' },
  { inf: 'dürfen', fa: 'اجازه داشتن', aux: 'haben', prt: 'durfte', pp: 'gedurft', lvl: 'A1', hPrat: 'urf' },
  { inf: 'wollen', fa: 'خواستن', aux: 'haben', prt: 'wollte', pp: 'gewollt', lvl: 'A1', hPrat: 'oll', hPp: 'oll' },
  { inf: 'sollen', fa: 'قرار بودن/باید', aux: 'haben', prt: 'sollte', pp: 'gesollt', lvl: 'A1', hPrat: 'oll', hPp: 'oll' },
  { inf: 'mögen', fa: 'دوست داشتن/مایل بودن', aux: 'haben', prt: 'mochte', pp: 'gemocht', lvl: 'A1' },

  // ───────────────── A2 — جداشدنی‌ها و زندگی روزمره ─────────────────
  { inf: 'anfangen', fa: 'شروع کردن', aux: 'haben', prt: 'fing an', pp: 'angefangen', lvl: 'A2', sep: 'an' },
  { inf: 'aufstehen', fa: 'بیدار شدن/بلند شدن', aux: 'sein', prt: 'stand auf', pp: 'aufgestanden', lvl: 'A2', sep: 'auf' },
  { inf: 'ankommen', fa: 'رسیدن', aux: 'sein', prt: 'kam an', pp: 'angekommen', lvl: 'A2', sep: 'an' },
  { inf: 'mitnehmen', fa: 'با خود بردن', aux: 'haben', prt: 'nahm mit', pp: 'mitgenommen', lvl: 'A2', sep: 'mit' },
  { inf: 'einladen', fa: 'دعوت کردن', aux: 'haben', prt: 'lud ein', pp: 'eingeladen', lvl: 'A2', sep: 'ein' },
  { inf: 'bekommen', fa: 'دریافت کردن', aux: 'haben', prt: 'bekam', pp: 'bekommen', lvl: 'A2' },
  { inf: 'verlieren', fa: 'گم کردن/باختن', aux: 'haben', prt: 'verlor', pp: 'verloren', lvl: 'A2' },
  { inf: 'gewinnen', fa: 'بردن (مسابقه)', aux: 'haben', prt: 'gewann', pp: 'gewonnen', lvl: 'A2' },
  { inf: 'vergessen', fa: 'فراموش کردن', aux: 'haben', prt: 'vergaß', pp: 'vergessen', lvl: 'A2' },
  { inf: 'treffen', fa: 'ملاقات کردن', aux: 'haben', prt: 'traf', pp: 'getroffen', lvl: 'A2' },
  { inf: 'bitten', fa: 'درخواست کردن', aux: 'haben', prt: 'bat', pp: 'gebeten', lvl: 'A2' },
  { inf: 'halten', fa: 'نگه داشتن', aux: 'haben', prt: 'hielt', pp: 'gehalten', lvl: 'A2' },
  { inf: 'schwimmen', fa: 'شنا کردن', aux: 'sein', prt: 'schwamm', pp: 'geschwommen', lvl: 'A2' },
  { inf: 'singen', fa: 'آواز خواندن', aux: 'haben', prt: 'sang', pp: 'gesungen', lvl: 'A2' },
  { inf: 'fliegen', fa: 'پرواز کردن', aux: 'sein', prt: 'flog', pp: 'geflogen', lvl: 'A2' },
  { inf: 'backen', fa: 'پختن (نان/کیک)', aux: 'haben', prt: 'backte', pp: 'gebacken', lvl: 'A2', altPrt: ['buk'] },
  { inf: 'waschen', fa: 'شستن', aux: 'haben', prt: 'wusch', pp: 'gewaschen', lvl: 'A2' },
  { inf: 'schneiden', fa: 'بریدن', aux: 'haben', prt: 'schnitt', pp: 'geschnitten', lvl: 'A2' },
  { inf: 'tragen', fa: 'حمل کردن/پوشیدن', aux: 'haben', prt: 'trug', pp: 'getragen', lvl: 'A2' },
  { inf: 'rufen', fa: 'صدا زدن', aux: 'haben', prt: 'rief', pp: 'gerufen', lvl: 'A2' },
  { inf: 'rennen', fa: 'دویدن', aux: 'sein', prt: 'rannte', pp: 'gerannt', lvl: 'A2' },
  { inf: 'kennen', fa: 'شناختن/آشنا بودن', aux: 'haben', prt: 'kannte', pp: 'gekannt', lvl: 'A2' },
  { inf: 'nennen', fa: 'نامیدن', aux: 'haben', prt: 'nannte', pp: 'genannt', lvl: 'A2' },
  { inf: 'brennen', fa: 'سوختن', aux: 'haben', prt: 'brannte', pp: 'gebrannt', lvl: 'A2' },
  { inf: 'bringen', fa: 'آوردن', aux: 'haben', prt: 'brachte', pp: 'gebracht', lvl: 'A2' },
  { inf: 'verbringen', fa: 'گذراندن (وقت)', aux: 'haben', prt: 'verbrachte', pp: 'verbracht', lvl: 'A2' },
  { inf: 'wachsen', fa: 'رشد کردن', aux: 'sein', prt: 'wuchs', pp: 'gewachsen', lvl: 'A2' },
  { inf: 'springen', fa: 'پریدن', aux: 'sein', prt: 'sprang', pp: 'gesprungen', lvl: 'A2' },

  // ───────────────── B1 — پیشونددارها ─────────────────
  { inf: 'verstehen', fa: 'فهمیدن', aux: 'haben', prt: 'verstand', pp: 'verstanden', lvl: 'B1' },
  { inf: 'entstehen', fa: 'به وجود آمدن', aux: 'sein', prt: 'entstand', pp: 'entstanden', lvl: 'B1' },
  { inf: 'verschwinden', fa: 'ناپدید شدن', aux: 'sein', prt: 'verschwand', pp: 'verschwunden', lvl: 'B1' },
  { inf: 'gelingen', fa: 'موفق شدن/سر گرفتن', aux: 'sein', prt: 'gelang', pp: 'gelungen', lvl: 'B1' },
  { inf: 'fallen', fa: 'افتادن', aux: 'sein', prt: 'fiel', pp: 'gefallen', lvl: 'B1' },
  { inf: 'brechen', fa: 'شکستن/پاره شدن', aux: 'haben', prt: 'brach', pp: 'gebrochen', lvl: 'B1' },
  { inf: 'werfen', fa: 'پرتاب کردن', aux: 'haben', prt: 'warf', pp: 'geworfen', lvl: 'B1' },
  { inf: 'treten', fa: 'گام گذاشتن/لگد زدن', aux: 'sein', prt: 'trat', pp: 'getreten', lvl: 'B1' },
  { inf: 'schlagen', fa: 'زدن', aux: 'haben', prt: 'schlug', pp: 'geschlagen', lvl: 'B1' },
  { inf: 'stoßen', fa: 'تصادم کردن/کوبیدن', aux: 'haben', prt: 'stieß', pp: 'gestoßen', lvl: 'B1' },
  { inf: 'ziehen', fa: 'کشیدن', aux: 'haben', prt: 'zog', pp: 'gezogen', lvl: 'B1' },
  { inf: 'scheinen', fa: 'تابیدن/به نظر رسیدن', aux: 'haben', prt: 'schien', pp: 'geschienen', lvl: 'B1' },
  { inf: 'greifen', fa: 'چنگ زدن', aux: 'haben', prt: 'griff', pp: 'gegriffen', lvl: 'B1' },
  { inf: 'stehlen', fa: 'دزدیدن', aux: 'haben', prt: 'stahl', pp: 'gestohlen', lvl: 'B1' },
  { inf: 'bieten', fa: 'ارائه کردن/پیشنهاد دادن', aux: 'haben', prt: 'bot', pp: 'geboten', lvl: 'B1' },
  { inf: 'schießen', fa: 'شوت/شلیک کردن', aux: 'haben', prt: 'schoss', pp: 'geschossen', lvl: 'B1' },
  { inf: 'streiten', fa: 'دعوا/بحث کردن', aux: 'haben', prt: 'stritt', pp: 'gestritten', lvl: 'B1' },
  { inf: 'schreien', fa: 'فریاد زدن', aux: 'haben', prt: 'schrie', pp: 'geschrien', lvl: 'B1' },
  { inf: 'lügen', fa: 'دروغ گفتن', aux: 'haben', prt: 'log', pp: 'gelogen', lvl: 'B1' },
  { inf: 'hauen', fa: 'کوبیدن/ضربه زدن', aux: 'haben', prt: 'hieb', pp: 'gehauen', lvl: 'B1', altPrt: ['haute'], altPp: ['gehaut'] },
  { inf: 'aufwachsen', fa: 'بزرگ شدن (کودکی)', aux: 'sein', prt: 'wuchs auf', pp: 'aufgewachsen', lvl: 'B1', sep: 'auf' },
  { inf: 'aussehen', fa: 'به نظر آمدن (ظاهر)', aux: 'haben', prt: 'sah aus', pp: 'ausgesehen', lvl: 'B1', sep: 'aus' },
  { inf: 'anziehen', fa: 'پوشیدن', aux: 'haben', prt: 'zog an', pp: 'angezogen', lvl: 'B1', sep: 'an' },
  { inf: 'auffallen', fa: 'جلب توجه کردن', aux: 'sein', prt: 'fiel auf', pp: 'aufgefallen', lvl: 'B1', sep: 'auf' },
  { inf: 'umsehen', fa: 'اطراف را نگاه کردن', aux: 'haben', prt: 'sah um', pp: 'umgesehen', lvl: 'B1', sep: 'um' },
  { inf: 'anbieten', fa: 'پیشنهاد دادن', aux: 'haben', prt: 'bot an', pp: 'angeboten', lvl: 'B1', sep: 'an' },
  { inf: 'aufgeben', fa: 'تسلیم شدن/واگذار کردن', aux: 'haben', prt: 'gab auf', pp: 'aufgegeben', lvl: 'B1', sep: 'auf' },
  { inf: 'ausgeben', fa: 'خرج کردن', aux: 'haben', prt: 'gab aus', pp: 'ausgegeben', lvl: 'B1', sep: 'aus' },
  { inf: 'entscheiden', fa: 'تصمیم گرفتن', aux: 'haben', prt: 'entschied', pp: 'entschieden', lvl: 'B1' },
  { inf: 'beschreiben', fa: 'توصیف کردن', aux: 'haben', prt: 'beschrieb', pp: 'beschrieben', lvl: 'B1' },
  { inf: 'vergleichen', fa: 'مقایسه کردن', aux: 'haben', prt: 'verglich', pp: 'verglichen', lvl: 'B1' },
  { inf: 'vermeiden', fa: 'اجتناب کردن', aux: 'haben', prt: 'vermied', pp: 'vermieden', lvl: 'B1' },
  { inf: 'verbinden', fa: 'وصل کردن', aux: 'haben', prt: 'verband', pp: 'verbunden', lvl: 'B1' },
  { inf: 'unternehmen', fa: 'انجام دادن (کار بزرگ)', aux: 'haben', prt: 'unternahm', pp: 'unternommen', lvl: 'B1' },
  { inf: 'übernehmen', fa: 'بر عهده گرفتن', aux: 'haben', prt: 'übernahm', pp: 'übernommen', lvl: 'B1' },
  { inf: 'erhalten', fa: 'دریافت کردن', aux: 'haben', prt: 'erhielt', pp: 'erhalten', lvl: 'B1' },
  { inf: 'verlassen', fa: 'ترک کردن', aux: 'haben', prt: 'verließ', pp: 'verlassen', lvl: 'B1' },
  { inf: 'verschieben', fa: 'عقب انداختن/جابه‌جا کردن', aux: 'haben', prt: 'verschob', pp: 'verschoben', lvl: 'B1' },
  { inf: 'verbrennen', fa: 'سوزاندن', aux: 'haben', prt: 'verbrannte', pp: 'verbrannt', lvl: 'B1' },
  { inf: 'beweisen', fa: 'اثبات کردن', aux: 'haben', prt: 'bewies', pp: 'bewiesen', lvl: 'B1' },
  { inf: 'beschließen', fa: 'تصمیم گرفتن', aux: 'haben', prt: 'beschloss', pp: 'beschlossen', lvl: 'B1' },
  { inf: 'empfehlen', fa: 'توصیه کردن', aux: 'haben', prt: 'empfahl', pp: 'empfohlen', lvl: 'B1' },
  { inf: 'schmelzen', fa: 'ذوب شدن', aux: 'sein', prt: 'schmolz', pp: 'geschmolzen', lvl: 'B1' },

  // ───────────────── B2 — انتزاعی‌تر ─────────────────
  { inf: 'gefallen', fa: 'خوش آمدن/پسند آمدن', aux: 'haben', prt: 'gefiel', pp: 'gefallen', lvl: 'B2' },
  { inf: 'geraten', fa: 'افتادن (به حالتی)', aux: 'sein', prt: 'geriet', pp: 'geraten', lvl: 'B2' },
  { inf: 'gelten', fa: 'اعتبار داشتن', aux: 'haben', prt: 'galt', pp: 'gegolten', lvl: 'B2' },
  { inf: 'leiden', fa: 'رنج بردن', aux: 'haben', prt: 'litt', pp: 'gelitten', lvl: 'B2' },
  { inf: 'begreifen', fa: 'درک کردن', aux: 'haben', prt: 'begriff', pp: 'begriffen', lvl: 'B2' },
  { inf: 'empfangen', fa: 'دریافت کردن', aux: 'haben', prt: 'empfing', pp: 'empfangen', lvl: 'B2' },
  { inf: 'raten', fa: 'توصیه/حدس زدن', aux: 'haben', prt: 'riet', pp: 'geraten', lvl: 'B2' },
  { inf: 'auftreten', fa: 'رخ دادن/ظاهر شدن', aux: 'sein', prt: 'trat auf', pp: 'aufgetreten', lvl: 'B2', sep: 'auf' },
  { inf: 'einbrechen', fa: 'سرقت کردن/فروریختن', aux: 'sein', prt: 'brach ein', pp: 'eingebrochen', lvl: 'B2', sep: 'ein' },
  { inf: 'ausbrechen', fa: 'بیرون زدن/شروع شدن', aux: 'sein', prt: 'brach aus', pp: 'ausgebrochen', lvl: 'B2', sep: 'aus' },
  { inf: 'aussteigen', fa: 'پیاده شدن', aux: 'sein', prt: 'stieg aus', pp: 'ausgestiegen', lvl: 'B2', sep: 'aus' },
  { inf: 'umziehen', fa: 'اسباب‌کشی کردن', aux: 'sein', prt: 'zog um', pp: 'umgezogen', lvl: 'B2', sep: 'um' },
  { inf: 'nachlassen', fa: 'کاهش یافتن', aux: 'haben', prt: 'ließ nach', pp: 'nachgelassen', lvl: 'B2', sep: 'nach' },
  { inf: 'vergehen', fa: 'گذشتن (زمان)', aux: 'sein', prt: 'verging', pp: 'vergangen', lvl: 'B2' },
  { inf: 'abnehmen', fa: 'کم کردن (وزن)/گرفتن', aux: 'haben', prt: 'nahm ab', pp: 'abgenommen', lvl: 'B2', sep: 'ab' },
  { inf: 'zunehmen', fa: 'زیاد کردن (وزن)/گرفتن', aux: 'haben', prt: 'nahm zu', pp: 'zugenommen', lvl: 'B2', sep: 'zu' },
  { inf: 'stattfinden', fa: 'برگزار شدن', aux: 'haben', prt: 'fand statt', pp: 'stattgefunden', lvl: 'B2', sep: 'statt' },
  { inf: 'ausfallen', fa: 'لغو شدن', aux: 'sein', prt: 'fiel aus', pp: 'ausgefallen', lvl: 'B2', sep: 'aus' },
  { inf: 'aushalten', fa: 'تحمل کردن', aux: 'haben', prt: 'hielt aus', pp: 'ausgehalten', lvl: 'B2', sep: 'aus' },
  { inf: 'befehlen', fa: 'دستور دادن', aux: 'haben', prt: 'befahl', pp: 'befohlen', lvl: 'B2' },

  // ───────────────── C1 — اصیل‌ترین‌ها ─────────────────
  { inf: 'geschehen', fa: 'اتفاق افتادن', aux: 'sein', prt: 'geschah', pp: 'geschehen', lvl: 'C1' },
  { inf: 'verschmelzen', fa: 'ذوب/ادغام شدن', aux: 'sein', prt: 'verschmolz', pp: 'verschmolzen', lvl: 'C1' },
  { inf: 'abreißen', fa: 'تخریب شدن', aux: 'haben', prt: 'riss ab', pp: 'abgerissen', lvl: 'C1', sep: 'ab' },
  { inf: 'durchziehen', fa: 'اجرا کردن/عبور کردن', aux: 'haben', prt: 'zog durch', pp: 'durchgezogen', lvl: 'C1', sep: 'durch' },
  { inf: 'genießen', fa: 'لذت بردن', aux: 'haben', prt: 'genoss', pp: 'genossen', lvl: 'C1' },
  { inf: 'erschrecken', fa: 'ترسیدن', aux: 'sein', prt: 'erschrak', pp: 'erschrocken', lvl: 'C1' },
  { inf: 'schwören', fa: 'سوگند خوردن', aux: 'haben', prt: 'schwur', pp: 'geschworen', lvl: 'C1' },
  { inf: 'verderben', fa: 'خراب کردن', aux: 'haben', prt: 'verderbte', pp: 'verdorben', lvl: 'C1', altPrt: ['verdorb'] },
  { inf: 'empfinden', fa: 'احساس کردن', aux: 'haben', prt: 'empfand', pp: 'empfunden', lvl: 'C1' },
  { inf: 'schaffen', fa: 'خلق کردن (بی‌قاعده)', aux: 'haben', prt: 'schuf', pp: 'geschaffen', lvl: 'C1' },
  { inf: 'begehen', fa: 'مرتکب شدن/برگزاری کردن', aux: 'haben', prt: 'beging', pp: 'begangen', lvl: 'C1' },

  // ───────────────── C2 — نادرترین‌ها ─────────────────
  { inf: 'fechten', fa: 'مبارزه کردن', aux: 'haben', prt: 'focht', pp: 'gefochten', lvl: 'C2' },
  { inf: 'gleichen', fa: 'شبیه بودن', aux: 'haben', prt: 'glich', pp: 'geglichen', lvl: 'C2' },
  { inf: 'schwellen', fa: 'متورم شدن', aux: 'sein', prt: 'schwoll', pp: 'geschwollen', lvl: 'C2', altPrt: ['schwellte'], altPp: ['geschwellt'] },
  { inf: 'weben', fa: 'بافتن', aux: 'haben', prt: 'wob', pp: 'gewoben', lvl: 'C2' },
  { inf: 'gären', fa: 'تخمیر شدن', aux: 'sein', prt: 'gor', pp: 'gegoren', lvl: 'C2', altPrt: ['gärte'], altPp: ['gegärt'] },
  { inf: 'saugen', fa: 'مکیدن', aux: 'haben', prt: 'sog', pp: 'gesogen', lvl: 'C2', altPrt: ['saugte'], altPp: ['gesaugt'] },
  { inf: 'bleichen', fa: 'رنگ‌پریده شدن', aux: 'sein', prt: 'blich', pp: 'geblichen', lvl: 'C2' },
  { inf: 'erfrieren', fa: 'یخ زدن/از سرما مردن', aux: 'sein', prt: 'erfror', pp: 'erfroren', lvl: 'C2' },
  { inf: 'erlöschen', fa: 'خاموش شدن', aux: 'sein', prt: 'erlosch', pp: 'erloschen', lvl: 'C2' },
  { inf: 'verzeihen', fa: 'بخشیدن', aux: 'haben', prt: 'verzieh', pp: 'verziehen', lvl: 'C2' },
  { inf: 'gebären', fa: 'به دنیا آوردن', aux: 'haben', prt: 'gebar', pp: 'geboren', lvl: 'C2' },
];

/** فعل‌های بی‌قاعدهٔ یک سطح */
export const irrVerbsOf = (lvl: IrrLvl): IrrVerb[] => IRR_VERBS.filter(v => v.lvl === lvl);
