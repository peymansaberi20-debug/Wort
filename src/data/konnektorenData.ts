/**
 * konnektorenData.ts — بانک کامل حروف ربط آلمانی، دسته‌بندی‌شده و بر اساس سطح (A1–C2)
 * این لیست به پرامتِ هوش مصنوعی داده می‌شود تا جمله‌های تمرین «Sätze komplettieren»
 * فقط با حروف ربطِ همان سطح ساخته شود. (~۱۵۰ مورد)
 */

export type Lvl = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export type Kat =
  | 'anr'      // ترتیب و افزودن
  | 'temp'     // زمان
  | 'kausal'   // علت
  | 'kond'     // شرط
  | 'konz'     // تقابل / اگرچه
  | 'konsek'   // نتیجه
  | 'fin'      // هدف
  | 'mod'      // شیوه
  | 'advers'   // تضاد / اصلاح
  | 'komp'     // مقایسه
  | 'alt'      // دوگانگی / انتخاب
  | 'restr'    // محدودسازی
  | 'illok'    // توضیح و دیدگاه
  | 'praep'    // حرف اضافهٔ پیوند
  | 'verbpraep'; // فعل + حرف اضافه (darauf, dass…)

export const KAT_LABEL: Record<Kat, string> = {
  anr: 'ترتیب و افزودن', temp: 'زمان', kausal: 'علت', kond: 'شرط', konz: 'تقابل (اگرچه)',
  konsek: 'نتیجه', fin: 'هدف', mod: 'شیوه', advers: 'تضاد و اصلاح', komp: 'مقایسه',
  alt: 'دوگانگی / انتخاب', restr: 'محدودسازی', illok: 'توضیح و دیدگاه',
  praep: 'حرف اضافهٔ پیوند', verbpraep: 'فعل + حرف اضافه'
};

export const LVL_ORDER: Lvl[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export const LVL_INFO: Record<Lvl, { label: string; spec: string }> = {
  A1: { label: 'A1 — مبتدی', spec: 'sehr kurze Hauptsätze, nur Präsens, Wortschatz: Familie, Alltag, Essen, Schule, Zahlen; einfache Verben' },
  A2: { label: 'A2 — پایه', spec: 'einfache Sätze, Präsens/Präteritum/Perfekt, Wortschatz Alltag, Einkaufen, Reisen, Wohnen; Nebensätze kurz' },
  B1: { label: 'B1 — متوسط', spec: 'Themen: Arbeit, Gesundheit, Medien, Pläne; Perfekt/Präteritum/Futur; typische Alltagssituationen; Nebensätze normal' },
  B2: { label: 'B2 — متوسط بالا', spec: 'Themen: Umwelt, Gesellschaft, Beruf, Technik; komplexe Nebensätze, Konjunktiv II möglich, abstraktere Inhalte' },
  C1: { label: 'C1 — پیشرفته', spec: 'Themen: Politik, Wissenschaft, Kultur, Wirtschaft; gehobene aber klare Schriftsprache, Passiv und Nominalisierung möglich' },
  C2: { label: 'C2 — بسیار پیشرفته', spec: 'fast literarisch/pressesprachlich, idiome und seltene Strukturen erlaubt, aber immer klar und korrekt' }
};

export interface KonnektorItem {
  w: string;        // شکل به‌کاررفته در جمله
  cat: Kat;
  lvl: Lvl;
  fa: string;
  note?: string;    // نکتهٔ گرامری (جایگاه فعل، ساختار)
}

export const KONNEKTOREN: KonnektorItem[] = [
  // ═══════════ A1 ═══════════
  { w: 'und', cat: 'anr', lvl: 'A1', fa: 'و', note: 'جایگاه صفر؛ فعل‌ها عادی می‌مانند' },
  { w: 'oder', cat: 'alt', lvl: 'A1', fa: 'یا' },
  { w: 'aber', cat: 'advers', lvl: 'A1', fa: 'اما؛ ولی', note: 'جایگاه صفر؛ فعل جملهٔ دوم سر جای خودش است' },
  { w: 'dann', cat: 'temp', lvl: 'A1', fa: 'سپس؛ بعد', note: 'جایگاه اول → فعل بلافاصله بعدش (V2)' },
  { w: 'sonst', cat: 'kond', lvl: 'A1', fa: 'وگرنه', note: 'جایگاه اول → V2' },
  { w: 'natürlich', cat: 'illok', lvl: 'A1', fa: 'البته / طبیعتاً' },

  // ═══════════ A2 ═══════════
  { w: 'denn', cat: 'kausal', lvl: 'A2', fa: 'چون که', note: 'جایگاه صفر؛ برخلاف weil فعل جملهٔ دوم وسط می‌ماند (V2)' },
  { w: 'sondern', cat: 'advers', lvl: 'A2', fa: 'بلکه', note: 'بعد از جملهٔ منفی/نهی؛ جایگزین aber' },
  { w: 'weil', cat: 'kausal', lvl: 'A2', fa: 'چون', note: 'نیم‌کاما: فعل در انتهای نیم‌کاما' },
  { w: 'dass', cat: 'mod', lvl: 'A2', fa: 'که', note: 'نیم‌کاما: فعل آخر' },
  { w: 'wenn', cat: 'kond', lvl: 'A2', fa: 'اگر / وقتی', note: 'شرط یا زمان تکرارشونده؛ فعل آخر' },
  { w: 'deshalb', cat: 'kausal', lvl: 'A2', fa: 'به همین دلیل', note: 'جایگاه اول → V2' },
  { w: 'deswegen', cat: 'kausal', lvl: 'A2', fa: 'به همین سبب', note: 'جایگاه اول → V2' },
  { w: 'darum', cat: 'kausal', lvl: 'A2', fa: 'برای همین', note: 'جایگاه اول → V2' },
  { w: 'später', cat: 'temp', lvl: 'A2', fa: 'بعداً' },
  { w: 'vorher', cat: 'temp', lvl: 'A2', fa: 'قبل از آن' },
  { w: 'danach', cat: 'temp', lvl: 'A2', fa: 'بعد از آن' },
  { w: 'zum Beispiel', cat: 'illok', lvl: 'A2', fa: 'برای مثال' },
  { w: 'zuerst', cat: 'temp', lvl: 'A2', fa: 'اول' },
  { w: 'wahrscheinlich', cat: 'illok', lvl: 'A2', fa: 'احتمالاً' },
  { w: 'trotzdem', cat: 'konz', lvl: 'A2', fa: 'با این حال / با وجود این', note: 'جایگاه اول → V2' },

  // ═══════════ B1 ═══════════
  { w: 'obwohl', cat: 'konz', lvl: 'B1', fa: 'اگرچه', note: 'نیم‌کاما: فعل آخر' },
  { w: 'bevor', cat: 'temp', lvl: 'B1', fa: 'قبل از اینکه' },
  { w: 'nachdem', cat: 'temp', lvl: 'B1', fa: 'بعد از اینکه', note: 'معمولاً با Plusquamperfekt/Perfekt در نیم‌کاما' },
  { w: 'während', cat: 'temp', lvl: 'B1', fa: 'در حالی که / در طولِ', note: 'نیم‌کاما یا + Genitiv' },
  { w: 'bis', cat: 'temp', lvl: 'B1', fa: 'تا وقتی که / تا' },
  { w: 'seitdem', cat: 'temp', lvl: 'B1', fa: 'از وقتی که', note: 'گاهی «seit» هم نوشته می‌شود' },
  { w: 'damit', cat: 'fin', lvl: 'B1', fa: 'تا اینکه / برای اینکه', note: 'هدف؛ برای علت از weil استفاده کن؛ فعل آخر' },
  { w: 'um … zu', cat: 'fin', lvl: 'B1', fa: 'برای اینکه', note: 'وقتی فاعلِ دو جمله یکی است؛ مصدر در انتها' },
  { w: 'ohne … zu', cat: 'mod', lvl: 'B1', fa: 'بدون اینکه', note: 'مصدر در انتها؛ با فاعل متفاوت: ohne dass' },
  { w: 'sodass', cat: 'konsek', lvl: 'B1', fa: 'چنان‌که / در نتیجه', note: 'شکل «so dass» هم درست است' },
  { w: 'falls', cat: 'kond', lvl: 'B1', fa: 'اگر (در صورتِ)' },
  { w: 'als', cat: 'temp', lvl: 'B1', fa: 'وقتی که (یک‌بار در گذشته)', note: 'نقطهٔ گذشته؛ برای تکرار/آینده: wenn' },
  { w: 'außerdem', cat: 'anr', lvl: 'B1', fa: 'علاوه بر این' },
  { w: 'und zwar', cat: 'illok', lvl: 'B1', fa: 'و دقیقاً / و به‌طور مشخص' },
  { w: 'nämlich', cat: 'illok', lvl: 'B1', fa: 'یعنی / چون که (توضیح)', note: 'داخل جمله بعد از فعل صرف‌شده می‌آید، نه جایگاه اول' },
  { w: 'allerdings', cat: 'restr', lvl: 'B1', fa: 'البته / اما', note: 'جایگاه اول → V2 یا داخل جمله' },
  { w: 'jedoch', cat: 'advers', lvl: 'B1', fa: 'اما (رسمی‌تر)' },
  { w: 'tatsächlich', cat: 'illok', lvl: 'B1', fa: 'واقعاً / در واقع' },
  { w: 'übrigens', cat: 'illok', lvl: 'B1', fa: 'راستی / ضمناً' },
  { w: 'währenddessen', cat: 'temp', lvl: 'B1', fa: 'در همین اثنا' },
  { w: 'inzwischen', cat: 'temp', lvl: 'B1', fa: 'در این میان / تا حالا' },
  { w: 'damals', cat: 'temp', lvl: 'B1', fa: 'آن روزها' },
  { w: 'gleichzeitig', cat: 'temp', lvl: 'B1', fa: 'همزمان' },
  { w: 'anfangs', cat: 'temp', lvl: 'B1', fa: 'در ابتدا' },
  { w: 'schließlich', cat: 'temp', lvl: 'B1', fa: 'در نهایت / سرانجام' },
  { w: 'entweder … oder', cat: 'alt', lvl: 'B1', fa: 'یا … یا' },
  { w: 'selbstverständlich', cat: 'illok', lvl: 'B1', fa: 'بدیهی است' },
  { w: 'dazu', cat: 'fin', lvl: 'B1', fa: 'برای این کار / به این منظور' },

  // ═══════════ B2 ═══════════
  { w: 'sobald', cat: 'temp', lvl: 'B2', fa: 'به محض اینکه' },
  { w: 'solange', cat: 'temp', lvl: 'B2', fa: 'تا وقتی که (مدت)' },
  { w: 'sooft', cat: 'temp', lvl: 'B2', fa: 'هر بار که' },
  { w: 'ehe', cat: 'temp', lvl: 'B2', fa: 'پیش از آنکه' },
  { w: 'da', cat: 'kausal', lvl: 'B2', fa: 'چون (رسمی، زمینه‌ای)', note: 'نیم‌کاما؛ فعل آخر؛ علتِ زمینه‌ای نه پاسخ مستقیم چرا' },
  { w: 'indem', cat: 'mod', lvl: 'B2', fa: 'از طریق اینکه / با اینکه (وسیله)', note: 'فعل آخر' },
  { w: 'dadurch dass', cat: 'mod', lvl: 'B2', fa: 'از این طریق که' },
  { w: 'ohne dass', cat: 'mod', lvl: 'B2', fa: 'بدون اینکه', note: 'وقتی فاعل‌ها متفاوت‌اند' },
  { w: 'anstatt dass', cat: 'mod', lvl: 'B2', fa: 'به‌جای اینکه', note: 'با مصدر: anstatt … zu' },
  { w: 'wobei', cat: 'mod', lvl: 'B2', fa: 'که در این ارتباط / آنجا که' },
  { w: 'wodurch', cat: 'mod', lvl: 'B2', fa: 'که از این طریق' },
  { w: 'so … dass', cat: 'konsek', lvl: 'B2', fa: 'چنان … که' },
  { w: 'zu … als dass', cat: 'konsek', lvl: 'B2', fa: 'آن‌قدر … که نتوان', note: 'نیم‌کاما با Konjunktiv' },
  { w: 'je … desto', cat: 'komp', lvl: 'B2', fa: 'هرچه … , …تر', note: 'je + صفت تفضیلی در نیم‌کاما اول (فعل آخر)، desto + تفضیلی در دوم' },
  { w: 'es sei denn', cat: 'kond', lvl: 'B2', fa: 'مگر اینکه' },
  { w: 'andernfalls', cat: 'kond', lvl: 'B2', fa: 'در غیر این صورت', note: 'جایگاه اول → V2' },
  { w: 'sofern', cat: 'kond', lvl: 'B2', fa: 'در صورت اینکه / تا وقتی که' },
  { w: 'vorausgesetzt (dass)', cat: 'kond', lvl: 'B2', fa: 'به شرط آنکه' },
  { w: 'im Falle (dass)', cat: 'kond', lvl: 'B2', fa: 'در صورتِ' },
  { w: 'für den Fall (dass)', cat: 'kond', lvl: 'B2', fa: 'برای فرضِ اینکه' },
  { w: 'insofern', cat: 'konsek', lvl: 'B2', fa: 'از این جهت / بدین معنا' },
  { w: 'soweit', cat: 'restr', lvl: 'B2', fa: 'تا جایی که' },
  { w: 'inwieweit', cat: 'illok', lvl: 'B2', fa: 'تا چه حد' },
  { w: 'ob … oder', cat: 'alt', lvl: 'B2', fa: 'چه … چه' },
  { w: 'einerseits … andererseits', cat: 'anr', lvl: 'B2', fa: 'از یک سو … از سوی دیگر' },
  { w: 'zum einen … zum anderen', cat: 'anr', lvl: 'B2', fa: 'اول اینکه … دوم اینکه' },
  { w: 'infolgedessen', cat: 'konsek', lvl: 'B2', fa: 'در نتیجه / در پی آن' },
  { w: 'demzufolge', cat: 'konsek', lvl: 'B2', fa: 'بر همین اساس / بنا بر این' },
  { w: 'folglich', cat: 'konsek', lvl: 'B2', fa: 'بنابراین / نتیجتاً' },
  { w: 'demnach', cat: 'konsek', lvl: 'B2', fa: 'بر این اساس' },
  { w: 'somit', cat: 'konsek', lvl: 'B2', fa: 'بدین ترتیب' },
  { w: 'aus diesem Grund', cat: 'kausal', lvl: 'B2', fa: 'به همین دلیل' },
  { w: 'dennoch', cat: 'konz', lvl: 'B2', fa: 'با این حال', note: 'جایگاه اول → V2' },
  { w: 'vielmehr', cat: 'advers', lvl: 'B2', fa: 'بلکه (تأکیدی)' },
  { w: 'stattdessen', cat: 'advers', lvl: 'B2', fa: 'به‌جای آن' },
  { w: 'hingegen', cat: 'advers', lvl: 'B2', fa: 'در مقابل / برخلافِ آن' },
  { w: 'dagegen', cat: 'advers', lvl: 'B2', fa: 'در برابر آن / اما' },
  { w: 'im Gegensatz dazu', cat: 'advers', lvl: 'B2', fa: 'در تضاد با آن' },
  { w: 'andererseits', cat: 'advers', lvl: 'B2', fa: 'از سوی دیگر' },
  { w: 'wiederum', cat: 'advers', lvl: 'B2', fa: 'در نقطهٔ مقابل / از سوی دیگر' },
  { w: 'weiterhin', cat: 'anr', lvl: 'B2', fa: 'همچنان / علاوه بر این' },
  { w: 'zusätzlich', cat: 'anr', lvl: 'B2', fa: 'علاوه بر آن' },
  { w: 'darunter', cat: 'illok', lvl: 'B2', fa: 'از جمله / در میان آن‌ها' },
  { w: 'unter anderem', cat: 'illok', lvl: 'B2', fa: 'از جمله' },
  { w: 'insbesondere', cat: 'illok', lvl: 'B2', fa: 'به‌طور خاص' },
  { w: 'vor allem', cat: 'illok', lvl: 'B2', fa: 'به‌ویژه' },
  { w: 'hauptsächlich', cat: 'illok', lvl: 'B2', fa: 'عمدتاً' },
  { w: 'mit anderen Worten', cat: 'illok', lvl: 'B2', fa: 'به عبارت دیگر' },
  { w: 'das heißt', cat: 'illok', lvl: 'B2', fa: 'یعنی / به بیان دیگر' },
  { w: 'genauer gesagt', cat: 'illok', lvl: 'B2', fa: 'به بیان دقیق‌تر' },
  { w: 'zusammenfassend', cat: 'illok', lvl: 'B2', fa: 'به جمع‌بندی' },
  { w: 'insgesamt', cat: 'illok', lvl: 'B2', fa: 'در مجموع' },
  { w: 'abschließend', cat: 'anr', lvl: 'B2', fa: 'در پایان' },
  { w: 'letztlich', cat: 'illok', lvl: 'B2', fa: 'در نهایت' },
  { w: 'angeblich', cat: 'illok', lvl: 'B2', fa: 'ظاهراً / به‌گفتهٔ' },
  { w: 'offenbar', cat: 'illok', lvl: 'B2', fa: 'ظاهراً' },
  { w: 'anscheinend', cat: 'illok', lvl: 'B2', fa: 'به نظر می‌رسد' },
  { w: 'vermutlich', cat: 'illok', lvl: 'B2', fa: 'احتمالاً' },
  { w: 'in der Tat', cat: 'illok', lvl: 'B2', fa: 'واقعاً / همان‌طور که گفتی' },
  { w: 'ohnehin', cat: 'illok', lvl: 'B2', fa: 'در هر حال / به هر روی' },
  { w: 'zweifellos', cat: 'illok', lvl: 'B2', fa: 'بدون شک' },
  { w: 'trotz + Gen', cat: 'praep', lvl: 'B2', fa: 'با وجودِ', note: 'بعدش جملهٔ اصلی با V2 می‌آید (نه aber)' },
  { w: 'wegen + Gen/D', cat: 'praep', lvl: 'B2', fa: 'به‌خاطرِ' },
  { w: 'aufgrund + Gen', cat: 'praep', lvl: 'B2', fa: 'بر اساسِ / به سببِ' },
  { w: 'dank + Dat', cat: 'praep', lvl: 'B2', fa: 'به لطفِ' },
  { w: 'laut / gemäß / zufolge', cat: 'praep', lvl: 'B2', fa: 'طبق / مطابق / بنا بر' },
  { w: 'anhand + Gen', cat: 'praep', lvl: 'B2', fa: 'با استفاده از' },
  { w: 'angesichts + Gen', cat: 'praep', lvl: 'B2', fa: 'با توجه به / در آستانهٔ' },
  { w: 'hinsichtlich + Gen', cat: 'praep', lvl: 'B2', fa: 'در موردِ / از نظرِ' },
  { w: 'bezüglich + Gen', cat: 'praep', lvl: 'B2', fa: 'دربارهٔ / در بابِ' },
  { w: 'innerhalb / außerhalb + Gen', cat: 'praep', lvl: 'B2', fa: 'درونِ / بیرونِ' },
  { w: 'mittels + Gen', cat: 'praep', lvl: 'B2', fa: 'به‌وسیلهٔ' },
  { w: 'infolge + Gen', cat: 'praep', lvl: 'B2', fa: 'در پیِ / در اثرِ' },
  { w: 'infolge dessen', cat: 'konsek', lvl: 'B2', fa: 'در پی آن' },
  { w: 'zu diesem Zweck', cat: 'fin', lvl: 'B2', fa: 'به همین منظور' },
  { w: 'mit dem Ziel', cat: 'fin', lvl: 'B2', fa: 'با هدفِ' },
  { w: 'sowohl … als auch', cat: 'anr', lvl: 'B2', fa: 'هم … هم' },
  { w: 'weder … noch', cat: 'anr', lvl: 'B2', fa: 'نه … و نه' },
  { w: 'nicht nur … sondern auch', cat: 'anr', lvl: 'B2', fa: 'نه فقط … بلکه همچنین' },
  { w: 'teils … teils', cat: 'alt', lvl: 'B2', fa: 'گاهی … گاهی' },
  { w: 'sowie', cat: 'anr', lvl: 'B2', fa: 'همچنین / به محضِ' },
  { w: 'beziehungsweise (bzw.)', cat: 'anr', lvl: 'B2', fa: 'یا بهتر بگوییم / و دقیق‌تر' },
  { w: 'darauf / daran / darüber + dass', cat: 'verbpraep', lvl: 'B2', fa: 'روی آن که / به آن که / دربارهٔ آن که', note: 'ادامهٔ جمله با «dass» شروع می‌شود؛ فعل آخر' },
  { w: 'dafür + dass', cat: 'verbpraep', lvl: 'B2', fa: 'برای آنکه' },

  // ═══════════ C1 ═══════════
  { w: 'obgleich', cat: 'konz', lvl: 'C1', fa: 'اگرچه (رسمی)' },
  { w: 'obschon', cat: 'konz', lvl: 'C1', fa: 'اگرچه (کتابی)' },
  { w: 'obzwar', cat: 'konz', lvl: 'C1', fa: 'اگرچه (کتابی)' },
  { w: 'wenngleich', cat: 'konz', lvl: 'C1', fa: 'هرچند' },
  { w: 'gleichwohl', cat: 'konz', lvl: 'C1', fa: 'با این همه', note: 'جایگاه اول → V2' },
  { w: 'nichtsdestotrotz', cat: 'konz', lvl: 'C1', fa: 'با وجود همهٔ این‌ها' },
  { w: 'nichtsdestoweniger', cat: 'konz', lvl: 'C1', fa: 'با این وجود' },
  { w: 'ungeachtet + Gen', cat: 'konz', lvl: 'C1', fa: 'بی‌اعتنا به / به رغمِ' },
  { w: 'zumal', cat: 'kausal', lvl: 'C1', fa: 'به‌ویژه که', note: 'نیم‌کاما؛ علتِ اضافی و تأکیدی' },
  { w: 'geschweige denn', cat: 'restr', lvl: 'C1', fa: 'چه برسد به' },
  { w: 'derart … dass', cat: 'konsek', lvl: 'C1', fa: 'به آن حد … که' },
  { w: 'indes(sen)', cat: 'advers', lvl: 'C1', fa: 'در این میان / اما' },
  { w: 'freilich', cat: 'illok', lvl: 'C1', fa: 'البته / طبعاً' },
  { w: 'bekanntlich', cat: 'illok', lvl: 'C1', fa: 'همان‌طور که معلوم است' },
  { w: 'alles in allem', cat: 'illok', lvl: 'C1', fa: 'روهم‌رفته' },
  { w: 'kurzum', cat: 'illok', lvl: 'C1', fa: 'خلاصه اینکه' },
  { w: 'überdies', cat: 'anr', lvl: 'C1', fa: 'افزون بر این' },
  { w: 'ferner', cat: 'anr', lvl: 'C1', fa: 'بعلاوه / فراتر از آن' },
  { w: 'des Weiteren', cat: 'anr', lvl: 'C1', fa: 'افزون بر این (رسمی)' },
  { w: 'namentlich', cat: 'illok', lvl: 'C1', fa: 'به‌طور خاص' },
  { w: 'seitens + Gen', cat: 'praep', lvl: 'C1', fa: 'از سویِ' },
  { w: 'vermittels + Gen', cat: 'praep', lvl: 'C1', fa: 'به‌واسطهٔ' },
  { w: 'unterdessen', cat: 'temp', lvl: 'C1', fa: 'در این فاصله' },
  { w: 'zwischenzeitlich', cat: 'temp', lvl: 'C1', fa: 'در این میان / موقتاً' },
  { w: 'zuvor', cat: 'temp', lvl: 'C1', fa: 'قبلاً / پیش از آن' },
  { w: 'hierauf', cat: 'temp', lvl: 'C1', fa: 'پس از این' },
  { w: 'woraufhin', cat: 'konsek', lvl: 'C1', fa: 'در پی آن' },
  { w: 'abgesehen von', cat: 'restr', lvl: 'C1', fa: 'کنار از اینکه / به‌جز' },
  { w: 'zwecks + Gen', cat: 'praep', lvl: 'C1', fa: 'به منظورِ' },
  { w: 'anlässlich + Gen', cat: 'praep', lvl: 'C1', fa: 'به مناسبتِ' },
  { w: 'mangels + Gen', cat: 'praep', lvl: 'C1', fa: 'به دلیل نبودِ / به علت فقدانِ' },
  { w: 'inwiefern', cat: 'illok', lvl: 'C1', fa: 'تا چه میزان' },

  // ═══════════ C2 ═══════════
  { w: 'kraft + Gen', cat: 'praep', lvl: 'C2', fa: 'به موجبِ / به قوّتِ' },
  { w: 'vermöge + Gen', cat: 'praep', lvl: 'C2', fa: 'به‌سببِ / به‌واسطهٔ' },
  { w: 'einst', cat: 'temp', lvl: 'C2', fa: 'روزی / روزگاری' },
  { w: 'offenkundig', cat: 'illok', lvl: 'C2', fa: 'آشکارا / بدیهی' },
  { w: 'mutmaßlich', cat: 'illok', lvl: 'C2', fa: 'به گمانِ' }
];

/** حروف ربطِ یک سطح */
export const connectorsFor = (lvl: Lvl): KonnektorItem[] => KONNEKTOREN.filter(k => k.lvl === lvl);

/** جستجوی سریع یک حرف ربط در بانک (برای کارت راهنما) */
export const findKonnektor = (word: string): KonnektorItem | undefined => {
  const s = word.toLowerCase().trim();
  return KONNEKTOREN.find(k => k.w.toLowerCase() === s || k.w.toLowerCase().split(' / ')[0] === s);
};
