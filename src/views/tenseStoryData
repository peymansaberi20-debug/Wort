/**
 * tenseStoryData.ts — داده‌های «داستان همهٔ زمان‌ها»
 * افعال، دیکشنری تمرین (ترجمهٔ فارسی + مثال)، و توضیحات گرامری زمان‌ها.
 * ماجرای داستان‌ها در tenseStoryBank.ts است.
 */

export type Band = 'A' | 'B' | 'C';
export type Tense = 'prs' | 'prt' | 'perf' | 'pq' | 'f1' | 'f2' | 'mix';

/** فعل با جدول صرف لازم برای توضیح گرامری */
export interface VerbInfo {
  fa: string;
  aux: 'haben' | 'sein';
  prt3: string; // شکل سوم شخص مفرد Präteritum
  pp: string;   // Partizip II
  sep?: string; // پیشوند جداشدنی (اگر دارد)
  ref?: boolean; // انعکاسی (sich)
  star?: string; // تغییر ریشهٔ مصوّت در Präsens (du/er)
}

/** واژه‌نامهٔ تمرین: کلید = کلمهٔ کوچک‌شده */
export interface DictEntry {
  fa: string;
  ex?: string;   // مثال سادهٔ آلمانی
  exFa?: string; // ترجمهٔ مثال
  de?: string;   // شکل لِم برای افزودن به واژگان
  art?: string;  // آرتیکل (اسم‌ها)
  pos?: string;  // نوع واژه برای افزودن به واژگان
}

export const TENSE_INFO: Record<Tense, { de: string; fa: string; expl: string }> = {
  prs: { de: 'Präsens', fa: 'زمان حال', expl: 'برای حال، عادت‌ها و حقایق کلی. پایانه‌ها: -e, -st, -t, -en, -t, -en' },
  prt: { de: 'Präteritum', fa: 'گذشتهٔ ساده', expl: 'زمان روایتِ گذشته در نوشتار. فعل ضعیف: ریشه + te؛ فعل قوی: تغییر ریشه' },
  perf: { de: 'Perfekt', fa: 'گذشتهٔ کامل (زبان روزمره)', expl: 'haben یا sein (صرف با فاعل، جایگاه دوم) + Partizip II در انتهای جمله' },
  pq: { de: 'Plusquamperfekt', fa: 'گذشتهٔ دور (قبل از گذشته)', expl: 'hatte یا war + Partizip II؛ برای فعلی که پیش از فعلی دیگر در گذشته رخ داده است' },
  f1: { de: 'Futur I', fa: 'آینده', expl: 'werden (صرف با فاعل، جایگاه دوم) + مصدر فعل در انتهای جمله' },
  f2: { de: 'Futur II', fa: 'آیندهٔ کامل', expl: 'werden + Partizip II + haben یا sein در انتهای جمله؛ فعلی که تا زمانی معیّن در آینده تمام شده است' },
  mix: { de: 'Zeiten gemischt', fa: 'زمان‌های ترکیبی', expl: 'در متن، هر جای خالی زمانِ خودش را دارد؛ نشانه‌های زمانی (gestern، heute، nächstes Wochenende …) راهنما هستند' }
};

export const BAND_INFO: Record<Band, { label: string; lvl: string }> = {
  A: { label: 'مبتدی (A1–A2)', lvl: 'A2' },
  B: { label: 'متوسط (B1–B2)', lvl: 'B2' },
  C: { label: 'پیشرفته (C1–C2)', lvl: 'C2' }
};

/** افعال به‌کاررفته در داستان‌ها؛ کلید = مصدر */
export const VERBS: Record<string, VerbInfo> = {
  // ── افعال پرکاربرد/بی‌قاعدهٔ کلیدی ──
  sein: { fa: 'بودن', aux: 'sein', prt3: 'war', pp: 'gewesen', star: 'ist (du bist)' },
  haben: { fa: 'داشتن', aux: 'haben', prt3: 'hatte', pp: 'gehabt', star: 'hat (du hast)' },
  werden: { fa: 'شدن؛ فعل کمکی آینده', aux: 'sein', prt3: 'wurde', pp: 'geworden', star: 'wird (du wirst)' },
  gehen: { fa: 'رفتن', aux: 'sein', prt3: 'ging', pp: 'gegangen' },
  fahren: { fa: 'رانندگی/حرکت کردن', aux: 'sein', prt3: 'fuhr', pp: 'gefahren', star: 'fährt (du fährst)' },
  kommen: { fa: 'آمدن', aux: 'sein', prt3: 'kam', pp: 'gekommen' },
  bleiben: { fa: 'ماندن', aux: 'sein', prt3: 'blieb', pp: 'geblieben' },
  laufen: { fa: 'دویدن/راه رفتن', aux: 'sein', prt3: 'lief', pp: 'gelaufen', star: 'läuft (du läufst)' },
  essen: { fa: 'خوردن', aux: 'haben', prt3: 'aß', pp: 'gegessen', star: 'isst (du isst)' },
  trinken: { fa: 'نوشیدن', aux: 'haben', prt3: 'trank', pp: 'getrunken' },
  lesen: { fa: 'خواندن', aux: 'haben', prt3: 'las', pp: 'gelesen', star: 'liest (du liest)' },
  nehmen: { fa: 'گرفتن', aux: 'haben', prt3: 'nahm', pp: 'genommen', star: 'nimmt (du nimmst)' },
  sprechen: { fa: 'حرف زدن', aux: 'haben', prt3: 'sprach', pp: 'gesprochen', star: 'spricht (du sprichst)' },
  sehen: { fa: 'دیدن', aux: 'haben', prt3: 'sah', pp: 'gesehen', star: 'sieht (du siehst)' },
  finden: { fa: 'پیدا کردن', aux: 'haben', prt3: 'fand', pp: 'gefunden' },
  geben: { fa: 'دادن', aux: 'haben', prt3: 'gab', pp: 'gegeben', star: 'gibt (du gibst)' },
  halten: { fa: 'نگه داشتن؛ برگزار کردن', aux: 'haben', prt3: 'hielt', pp: 'gehalten', star: 'hält (du hältst)' },
  brechen: { fa: 'شکستن؛ پاره شدن', aux: 'haben', prt3: 'brach', pp: 'gebrochen', star: 'bricht (du brichst)' },
  helfen: { fa: 'کمک کردن', aux: 'haben', prt3: 'half', pp: 'geholfen', star: 'hilft (du hilfst)' },
  werfen: { fa: 'پرتاب کردن', aux: 'haben', prt3: 'warf', pp: 'geworfen', star: 'wirft (du wirfst)' },
  schwimmen: { fa: 'شنا کردن', aux: 'sein', prt3: 'schwamm', pp: 'geschwommen' },
  singen: { fa: 'آواز خواندن', aux: 'haben', prt3: 'sang', pp: 'gesungen' },
  schlafen: { fa: 'خوابیدن', aux: 'haben', prt3: 'schlief', pp: 'geschlafen', star: 'schläft (du schläfst)' },
  backen: { fa: 'پختن (نان/کیک)', aux: 'haben', prt3: 'backte', pp: 'gebacken', star: 'backt (du backst)' },
  treten: { fa: 'گام گذاشتن؛ بیرون زدن', aux: 'sein', prt3: 'trat', pp: 'getreten', star: 'tritt (du tritts)' },
  geraten: { fa: 'افتادن (به حالتی)', aux: 'sein', prt3: 'geriet', pp: 'geraten' },
  verschwinden: { fa: 'ناپدید شدن', aux: 'sein', prt3: 'verschwand', pp: 'verschwunden' },
  entstehen: { fa: 'به وجود آمدن', aux: 'sein', prt3: 'entstand', pp: 'entstanden' },
  eintreffen: { fa: 'رسیدن (رسمی)', aux: 'sein', prt3: 'traf ein', pp: 'eingetroffen', sep: 'ein' },
  scheinen: { fa: 'تابیدن؛ به نظر رسیدن', aux: 'haben', prt3: 'schien', pp: 'geschienen', star: 'scheint (du scheinst)' },
  auffallen: { fa: 'جلب توجه کردن', aux: 'sein', prt3: 'fiel auf', pp: 'aufgefallen', sep: 'auf' },
  aussehen: { fa: 'به نظر رسیدن (ظاهر)', aux: 'haben', prt3: 'sah aus', pp: 'ausgesehen', sep: 'aus' },
  anziehen: { fa: 'پوشیدن', aux: 'haben', prt3: 'zog an', pp: 'angezogen', sep: 'an' },
  ausdenken: { fa: 'از خود درآوردن؛ ساختن (بهانه)', aux: 'haben', prt3: 'dachte aus', pp: 'ausgedacht', sep: 'aus', ref: true },
  umsehen: { fa: 'طرف کردن؛ نگاه انداختن', aux: 'haben', prt3: 'sah um', pp: 'umgesehen', sep: 'um', ref: true },
  anfühlen: { fa: 'حس شدن (بدن)', aux: 'haben', prt3: 'fühlte an', pp: 'angefühlt', sep: 'an', ref: true },
  unternehmen: { fa: 'انجام دادن (کار/برنامه)', aux: 'haben', prt3: 'unternahm', pp: 'unternommen' },
  übernehmen: { fa: 'بر عهده گرفتن', aux: 'haben', prt3: 'übernahm', pp: 'übernommen' },
  empfangen: { fa: 'استقبال کردن؛ دریافت کردن', aux: 'haben', prt3: 'empfing', pp: 'empfangen', star: 'empfängt (du empfängst)' },
  begreifen: { fa: 'درک کردن', aux: 'haben', prt3: 'begriff', pp: 'begriffen', star: 'begreift (du begreifst)' },
  empfinden: { fa: 'احساس کردن', aux: 'haben', prt3: 'empfand', pp: 'empfunden', star: 'empfindet (du empfindest)' },
  verschmelzen: { fa: 'در هم فرو رفتن؛ یکی شدن', aux: 'sein', prt3: 'verschmolz', pp: 'verschmolzen', star: 'verschmilzt (du verschmilzt)' },
  gelten: { fa: 'صادق بودن؛ رواج داشتن', aux: 'haben', prt3: 'galt', pp: 'gegolten', star: 'gilt (du giltst)' },
  verbrennen: { fa: 'سوختن؛ نسوزاندن', aux: 'haben', prt3: 'verbrannte', pp: 'verbrannt' },
  abreißen: { fa: 'تخریب کردن', aux: 'haben', prt3: 'riss ab', pp: 'abgerissen', sep: 'ab' },
  ablaufen: { fa: 'پایان یافتن (مهلت)', aux: 'sein', prt3: 'lief ab', pp: 'abgelaufen', sep: 'ab' },
  durchziehen: { fa: 'پیش بردن (اصلاحات)', aux: 'haben', prt3: 'zog durch', pp: 'durchgezogen', sep: 'durch' },
  gewinnen: { fa: 'برنده شدن', aux: 'haben', prt3: 'gewann', pp: 'gewonnen' },
  wissen: { fa: 'دانستن', aux: 'haben', prt3: 'wusste', pp: 'gewusst', star: 'weiß (du weißt)' },
  denken: { fa: 'فکر کردن', aux: 'haben', prt3: 'dachte', pp: 'gedacht', star: 'denkt (du denkst)' },
  bringen: { fa: 'آوردن', aux: 'haben', prt3: 'brachte', pp: 'gebracht', star: 'bringt (du bringst)' },
  kennen: { fa: 'شناختن', aux: 'haben', prt3: 'kannte', pp: 'gekannt', star: 'kennt (du kennst)' },
  nennen: { fa: 'نامیدن', aux: 'haben', prt3: 'nannte', pp: 'genannt', star: 'nennt (du nennst)' },
  // ── افعال ضعیف (قاعده‌مند) ──
  spielen: { fa: 'بازی کردن', aux: 'haben', prt3: 'spielte', pp: 'gespielt' },
  hören: { fa: 'شنیدن؛ گوش دادن', aux: 'haben', prt3: 'hörte', pp: 'gehört' },
  kaufen: { fa: 'خریدن', aux: 'haben', prt3: 'kaufte', pp: 'gekauft' },
  suchen: { fa: 'جست‌وجو کردن', aux: 'haben', prt3: 'suchte', pp: 'gesucht' },
  bezahlen: { fa: 'پرداخت کردن', aux: 'haben', prt3: 'bezahlte', pp: 'bezahlt' },
  kochen: { fa: 'پختن (غذا)', aux: 'haben', prt3: 'kochte', pp: 'gekocht' },
  wohnen: { fa: 'زندگی کردن (اقامت)', aux: 'haben', prt3: 'wohnte', pp: 'gewohnt' },
  machen: { fa: 'کردن، انجام دادن', aux: 'haben', prt3: 'machte', pp: 'gemacht' },
  erklären: { fa: 'توضیح دادن', aux: 'haben', prt3: 'erklärte', pp: 'erklärt' },
  schreiben: { fa: 'نوشتن', aux: 'haben', prt3: 'schrieb', pp: 'geschrieben' },
  sammeln: { fa: 'جمع کردن', aux: 'haben', prt3: 'sammelte', pp: 'gesammelt' },
  sagen: { fa: 'گفتن', aux: 'haben', prt3: 'sagte', pp: 'gesagt' },
  steigen: { fa: 'بالا رفتن؛ افزایش یافتن', aux: 'sein', prt3: 'stieg', pp: 'gestiegen', star: 'steigt (du steigst)' },
  versuchen: { fa: 'سعی کردن', aux: 'haben', prt3: 'versuchte', pp: 'versucht' },
  kosten: { fa: 'خرج داشتن؛ هزینه بردن', aux: 'haben', prt3: 'kostete', pp: 'gekostet' },
  verändern: { fa: 'تغییر دادن', aux: 'haben', prt3: 'veränderte', pp: 'verändert' },
  setzen: { fa: 'گذاشتن؛ تعیین کردن', aux: 'haben', prt3: 'setzte', pp: 'gesetzt' },
  warnen: { fa: 'هشدار دادن', aux: 'haben', prt3: 'warnte', pp: 'gewarnt' },
  betonen: { fa: 'تأکید کردن', aux: 'haben', prt3: 'betonte', pp: 'betont' },
  leiden: { fa: 'رنج بردن؛ آسیب دیدن', aux: 'haben', prt3: 'litt', pp: 'gelitten', star: 'leidet (du leidest)' },
  leben: { fa: 'زندگی کردن', aux: 'haben', prt3: 'lebte', pp: 'gelebt' },
  verlieren: { fa: 'گم کردن؛ از دست دادن', aux: 'haben', prt3: 'verlor', pp: 'verloren' },
  empfehlen: { fa: 'توصیه کردن', aux: 'haben', prt3: 'empfahl', pp: 'empfohlen', star: 'empfiehlt (du empfiehlst)' },
  wirken: { fa: 'اثر گذاشتن؛ اثر کردن', aux: 'haben', prt3: 'wirkte', pp: 'gewirkt' },
  üben: { fa: 'تمرین کردن', aux: 'haben', prt3: 'übte', pp: 'geübt' },
  besuchen: { fa: 'دیدن، ملاقات کردن', aux: 'haben', prt3: 'besuchte', pp: 'besucht' },
  lachen: { fa: 'خندیدن', aux: 'haben', prt3: 'lachte', pp: 'gelacht' },
  wollen: { fa: 'خواستن (فعل مُدال)', aux: 'haben', prt3: 'wollte', pp: 'gewollt' },
  schmücken: { fa: 'تزیین کردن', aux: 'haben', prt3: 'schmückte', pp: 'geschmückt' },
  öffnen: { fa: 'باز کردن', aux: 'haben', prt3: 'öffnete', pp: 'geöffnet' },
  rufen: { fa: 'فریاد زدن؛ صدا زدن', aux: 'haben', prt3: 'rief', pp: 'gerufen' },
  danken: { fa: 'تشکر کردن', aux: 'haben', prt3: 'dankte', pp: 'gedankt' },
  spenden: { fa: 'اهدا کردن', aux: 'haben', prt3: 'spendete', pp: 'gespendet' },
  fühlen: { fa: 'احساس کردن', aux: 'haben', prt3: 'fühlte', pp: 'gefühlt', ref: true },
  applaudieren: { fa: 'کف زدن', aux: 'haben', prt3: 'applaudierte', pp: 'applaudiert' },
  betrachten: { fa: 'تماشا کردن؛ بررسی کردن', aux: 'haben', prt3: 'betrachtete', pp: 'betrachtet' },
  begrüßen: { fa: 'خوش‌آمد گفتن؛ سلام کردن', aux: 'haben', prt3: 'begrüßte', pp: 'begrüßt' },
  antworten: { fa: 'پاسخ دادن', aux: 'haben', prt3: 'antwortete', pp: 'geantwortet' },
  anbieten: { fa: 'پیشنهاد دادن', aux: 'haben', prt3: 'bot an', pp: 'angeboten', sep: 'an', star: 'bietet an (du bietest an)' },
  warten: { fa: 'منتظر بودن', aux: 'haben', prt3: 'wartete', pp: 'gewartet' },
  überraschen: { fa: 'غافلگیر کردن', aux: 'haben', prt3: 'überraschte', pp: 'überrascht' },
  fällen: { fa: 'قطع کردن (درخت)', aux: 'haben', prt3: 'fällte', pp: 'gefällt' },
  füllen: { fa: 'پر کردن', aux: 'haben', prt3: 'füllte', pp: 'gefüllt' },
  organisieren: { fa: 'سازماندهی کردن', aux: 'haben', prt3: 'organisierte', pp: 'organisiert' },
  gewöhnen: { fa: 'عادت دادن (خود را)', aux: 'haben', prt3: 'gewöhnte', pp: 'gewöhnt', ref: true },
  dokumentieren: { fa: 'مستند کردن', aux: 'haben', prt3: 'dokumentierte', pp: 'dokumentiert' },
  äußern: { fa: 'اظهار کردن (نظر)', aux: 'haben', prt3: 'äußerte', pp: 'geäußert', ref: true },
  regnen: { fa: 'باران باریدن', aux: 'haben', prt3: 'regnete', pp: 'geregnet' },
  einpacken: { fa: 'بسته‌بندی کردن؛ گذاشتن در کیف', aux: 'haben', prt3: 'packte ein', pp: 'eingepackt', sep: 'ein' },
  beginnen: { fa: 'شروع شدن', aux: 'haben', prt3: 'begann', pp: 'begonnen' },
  zeigen: { fa: 'نشان دادن', aux: 'haben', prt3: 'zeigte', pp: 'gezeigt' },
  korrigieren: { fa: 'اصلاح کردن', aux: 'haben', prt3: 'korrigierte', pp: 'korrigiert' },
  abschicken: { fa: 'ارسال کردن', aux: 'haben', prt3: 'schickte ab', pp: 'abgeschickt', sep: 'ab' },
  verabreden: { fa: 'قرار گذاشتن (با هم)', aux: 'haben', prt3: 'verabredete', pp: 'verabredet', ref: true },
  schicken: { fa: 'فرستادن', aux: 'haben', prt3: 'schickte', pp: 'geschickt' },
  bestellen: { fa: 'سفارش دادن', aux: 'haben', prt3: 'bestellte', pp: 'bestellt' },
  sitzen: { fa: 'نشستن', aux: 'haben', prt3: 'saß', pp: 'gesessen', star: 'sitzt (du sitzt)' },
  verlassen: { fa: 'ترک کردن؛ ترک گفتن', aux: 'haben', prt3: 'verließ', pp: 'verlassen' },
  verschieben: { fa: 'جابه‌جا کردن؛ عقب انداختن', aux: 'haben', prt3: 'verschob', pp: 'verschoben' },
  erzählen: { fa: 'تعریف کردن', aux: 'haben', prt3: 'erzählte', pp: 'erzählt' },
  sanieren: { fa: 'نوسازی کردن', aux: 'haben', prt3: 'sanierte', pp: 'saniert' },
  verstehen: { fa: 'فهمیدن', aux: 'haben', prt3: 'verstand', pp: 'verstanden' },
  studieren: { fa: 'بررسی کردن؛ درس خواندن', aux: 'haben', prt3: 'studierte', pp: 'studierte' },
  beweisen: { fa: 'اثبات کردن', aux: 'haben', prt3: 'bewies', pp: 'bewiesen', star: 'beweist (du beweist)' },
  fälschen: { fa: 'جعل کردن', aux: 'haben', prt3: 'fälschte', pp: 'gefälscht' },
  informieren: { fa: 'اطلاع دادن؛ مطلع کردن', aux: 'haben', prt3: 'informierte', pp: 'informiert' },
  lösen: { fa: 'حل کردن', aux: 'haben', prt3: 'löste', pp: 'gelöst' },
  erledigen: { fa: 'انجام و تمام کردن', aux: 'haben', prt3: 'erledigte', pp: 'erledigt' },
  prüfen: { fa: 'بررسی کردن؛ امتحان کردن', aux: 'haben', prt3: 'prüfte', pp: 'geprüft' },
  überarbeiten: { fa: 'بازبینی و اصلاح کردن', aux: 'haben', prt3: 'überarbeitete', pp: 'überarbeitet' },
  blockieren: { fa: 'مسدود کردن', aux: 'haben', prt3: 'blockierte', pp: 'blockiert' },
  beschließen: { fa: 'تصویب کردن؛ تصمیم گرفتن', aux: 'haben', prt3: 'beschloss', pp: 'beschlossen', star: 'beschließt (du beschließt)' },
  sezieren: { fa: 'کالبدشکافی کردن', aux: 'haben', prt3: 'sezierte', pp: 'seziert' },
  bewerten: { fa: 'ارزیابی کردن', aux: 'haben', prt3: 'bewertete', pp: 'bewertet' },
  erstellen: { fa: 'ایجاد کردن؛ تنظیم کردن', aux: 'haben', prt3: 'erstellte', pp: 'erstellt' },
  notieren: { fa: 'یادداشت کردن', aux: 'haben', prt3: 'notierte', pp: 'notiert' },
  reservieren: { fa: 'رزرو کردن؛ کنار گذاشتن', aux: 'haben', prt3: 'reservierte', pp: 'reserviert' },
  kontrollieren: { fa: 'کنترل کردن؛ چک کردن', aux: 'haben', prt3: 'kontrollierte', pp: 'kontrolliert' },
  ausschalten: { fa: 'خاموش کردن', aux: 'haben', prt3: 'schaltete aus', pp: 'ausgeschaltet', sep: 'aus' },
  belohnen: { fa: 'پاداش دادن (به خود/کسی)', aux: 'haben', prt3: 'belohnte', pp: 'belohnt', ref: true },
  packen: { fa: 'بستن؛ جا دادن', aux: 'haben', prt3: 'packte', pp: 'gepackt' },
  fotografieren: { fa: 'عکس گرفتن', aux: 'haben', prt3: 'fotografierte', pp: 'fotografiert' },
  unterstützen: { fa: 'حمایت کردن', aux: 'haben', prt3: 'unterstützte', pp: 'unterstützt' },
  beenden: { fa: 'پایان دادن', aux: 'haben', prt3: 'beendete', pp: 'beendet' },
  zuhören: { fa: 'گوش دادن', aux: 'haben', prt3: 'hörte zu', pp: 'zugehört', sep: 'zu' },
  schenken: { fa: 'هدیه دادن', aux: 'haben', prt3: 'schenkte', pp: 'geschenkt' },
  verbringen: { fa: 'گذراندن (وقت)', aux: 'haben', prt3: 'verbrachte', pp: 'verbracht' },
  anführen: { fa: 'برشمار کردن؛ استناد کردن', aux: 'haben', prt3: 'führte an', pp: 'angeführt', sep: 'an' },
  abkühlen: { fa: 'خنک شدن؛ خنک کردن', aux: 'sein', prt3: 'kühlte ab', pp: 'abgekühlt', sep: 'ab' },
  verwandeln: { fa: 'تبدیل کردن', aux: 'haben', prt3: 'verwandelte', pp: 'verwandelt', ref: true },
  ankommen: { fa: 'رسیدن؛ بستگی داشتن (auf)', aux: 'sein', prt3: 'kam an', pp: 'angekommen', sep: 'an' },
  wandern: { fa: 'کوه‌پیمایی کردن', aux: 'sein', prt3: 'wanderte', pp: 'gewandert' },
  mitnehmen: { fa: 'با خود بردن', aux: 'haben', prt3: 'nahm mit', pp: 'mitgenommen', sep: 'mit' },
  interessieren: { fa: 'علاقه‌مند بودن (به)', aux: 'haben', prt3: 'interessierte', pp: 'interessiert', ref: true },
  treffen: { fa: 'ملاقات کردن (با هم)', aux: 'haben', prt3: 'traf', pp: 'getroffen', ref: true, star: 'trifft (du triffst)' },
  bewerben: { fa: 'درخواست کار دادن (bei/um)', aux: 'haben', prt3: 'bewarb', pp: 'beworben', ref: true, star: 'bewirbt (du bewirbst)' },
  lohnen: { fa: 'می‌ارزد', aux: 'haben', prt3: 'lohnte', pp: 'gelohnt', ref: true },
  aufstehen: { fa: 'بیدار شدن؛ ایستادن', aux: 'sein', prt3: 'stand auf', pp: 'aufgestanden', sep: 'auf', star: 'steht auf (du stehst auf)' },
  // ── افعال اضافه (چاپ‌شده در متن یا جاهای خالی) ──
  arbeiten: { fa: 'کار کردن', aux: 'haben', prt3: 'arbeitete', pp: 'gearbeitet', star: 'arbeitet (du arbeitest)' },
  'erwähnen': { fa: 'اشاره کردن (به)', aux: 'haben', prt3: 'erwähnte', pp: 'erwähnt' },
  erhalten: { fa: 'دریافت کردن', aux: 'haben', prt3: 'erhielt', pp: 'erhalten' },
  verschlafen: { fa: 'خواب ماندن', aux: 'haben', prt3: 'verschlief', pp: 'verschlafen', sep: 'ver' },
  verpassen: { fa: 'از دست دادن (قطار/فرصت)', aux: 'haben', prt3: 'verpasste', pp: 'verpasst', sep: 'ver' },
  speichern: { fa: 'ذخیره کردن', aux: 'haben', prt3: 'speicherte', pp: 'gespeichert' },
  lernen: { fa: 'یاد گرفتن', aux: 'haben', prt3: 'lernte', pp: 'gelernt' },
  entdecken: { fa: 'کشف کردن', aux: 'haben', prt3: 'entdeckte', pp: 'entdeckt' },
  wegfahren: { fa: 'راه افتادن / رفته بودن', aux: 'sein', prt3: 'fuhr weg', pp: 'weggefahren', sep: 'weg' },
  klappen: { fa: 'جواب دادن (برنامه)', aux: 'haben', prt3: 'klapte', pp: 'geklappt', star: 'klappt (du klapptst)' },
  gelingen: { fa: 'به نتیجه رسیدن، موفق شدن', aux: 'sein', prt3: 'gelang', pp: 'gelungen', star: 'gelingt (du gelingst)' },
  schiefgehen: { fa: 'خراب شدن (برنامه)', aux: 'sein', prt3: 'ging schief', pp: 'schiefgegangen', sep: 'schief' },
  // ── افعال تکمیلی (جاهای خالی و افعال چاپ‌شدهٔ متن) ──
  stehen: { fa: 'ایستادن؛ نوشته‌شده بودن', aux: 'haben', prt3: 'stand', pp: 'gestanden', star: 'steht (du stehst)' },
  verfügen: { fa: 'برخوردار بودن (über)', aux: 'haben', prt3: 'verfügte', pp: 'verfügt' },
  erinnern: { fa: 'به یاد آوردن (sich erinnern)', aux: 'haben', prt3: 'erinnerte', pp: 'erinnert', ref: true },
  gefallen: { fa: 'خوش آمدن؛ پسند آمدن', aux: 'haben', prt3: 'gefiel', pp: 'gefallen', star: 'gefällt (du gefällst)' },
  stellen: { fa: 'قرار دادن؛ مطرح کردن', aux: 'haben', prt3: 'stellte', pp: 'gestellt' },
  aufräumen: { fa: 'جمع‌وری کردن؛ مرتب کردن', aux: 'haben', prt3: 'räumte auf', pp: 'aufgeräumt', sep: 'auf' },
  aufbauen: { fa: 'بنا کردن؛ از نو ساختن', aux: 'haben', prt3: 'baute auf', pp: 'aufgebaut', sep: 'auf' },
  brauchen: { fa: 'نیاز داشتن', aux: 'haben', prt3: 'brauchte', pp: 'gebraucht' },
  vermitteln: { fa: 'انتقال دادن؛ القا کردن', aux: 'haben', prt3: 'vermittelte', pp: 'vermittelt' },
  'ankündigen': { fa: 'اعلام کردن', aux: 'haben', prt3: 'kündigte an', pp: 'angekündigt', sep: 'an' },
  verlegen: { fa: 'جابه‌جا کردن؛ عقب انداختن', aux: 'haben', prt3: 'verlegte', pp: 'verlegt' },
  fallen: { fa: 'افتادن', aux: 'sein', prt3: 'fiel', pp: 'gefallen' },
  schulen: { fa: 'تقویت کردن (تمرکز/ذهن)', aux: 'haben', prt3: 'schulte', pp: 'geschult' },
  benutzen: { fa: 'استفاده کردن', aux: 'haben', prt3: 'benutzte', pp: 'benutzt' },
  tun: { fa: 'انجام دادن', aux: 'haben', prt3: 'tat', pp: 'getan', star: 'tut (du tust)' },
  können: { fa: 'توانستن (فعل مُدال)', aux: 'haben', prt3: 'konnte', pp: 'gekonnt' },
  vorbereiten: { fa: 'آماده کردن؛ آماده‌سازی کردن', aux: 'haben', prt3: 'bereitete vor', pp: 'vorbereitet', sep: 'vor' }
};
