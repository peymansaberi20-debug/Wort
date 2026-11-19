/**
 * tenseStoryVerbs.ts — بانک سطح‌محور تمرین «داستان همهٔ زمان‌ها»
 *
 * ▌منطق تمرین (مثل کتاب: «Ergänzen Sie die Verben im Präteritum!»):
 *   هر سطح A1–C2 فعل‌ها و حروف اضافهٔ ردهٔ خودش را دارد. این بانک سه کار می‌کند:
 *   ۱) راهنمای «فعل‌ها و حروف اضافهٔ این سطح» در صفحهٔ تنظیم تمرین
 *   ۲) بذرِ پرامپت هوش مصنوعی: داستانِ هر سطح فقط با فعل‌های همان سطح ساخته می‌شود
 *   ۳) زنجیرهٔ صرف (prt3 → pp) در پاسخنامهٔ چاپی
 * کلید هر فعل باید در جدول VERBS فایل tenseStoryData.ts موجود باشد.
 */

export type TLvl = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export const TLVL_ORDER: TLvl[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export const TLVL_INFO: Record<TLvl, { label: string }> = {
  A1: { label: 'پایه: فعل‌های روزمره و بی‌قاعدهٔ اصلی — sein/haben و افعال حرکت و زندگی روزمره' },
  A2: { label: 'متوسط مقدماتی: افعال جداشدنی و زندگی روزمرهٔ کامل‌تر (aufstehen, mitnehmen, verabreden…)' },
  B1: { label: 'متوسط: افعال جداشدنی و ترکیبی‌تر، نظم و برنامه‌ریزی، علت و نتیجه' },
  B2: { label: 'متوسط پیشرفته: فرایندها و گزارش‌های اداری/رسانه‌ای، افعال ترکیبی پیچیده‌تر' },
  C1: { label: 'پیشرفته: واژگان انتزاعی، فرایندهای اجتماعی و تحلیلی' },
  C2: { label: 'مهارتی: واژگان علمی/اداری/رسانه‌ای و اصیل‌ترین افعال بی‌قاعده' }
};

/** فعل‌های هر سطح (کلیدها ⊂ VERBS در tenseStoryData.ts) */
export const LEVEL_VERBS: Record<TLvl, string[]> = {
  A1: [
    'sein', 'haben', 'werden', 'gehen', 'fahren', 'kommen', 'bleiben', 'essen', 'trinken',
    'lesen', 'nehmen', 'sprechen', 'sehen', 'finden', 'geben', 'machen', 'wohnen', 'kaufen',
    'kochen', 'lernen', 'spielen', 'hören', 'sagen', 'arbeiten', 'leben', 'schreiben',
    'helfen', 'denken', 'wissen', 'können', 'wollen', 'stehen', 'sitzen', 'suchen', 'zeigen', 'danken'
  ],
  A2: [
    'aufstehen', 'aufräumen', 'mitnehmen', 'ankommen', 'einpacken', 'packen', 'bestellen',
    'besuchen', 'bezahlen', 'kosten', 'versuchen', 'erzählen', 'erklären', 'warten', 'schenken',
    'öffnen', 'beginnen', 'verlieren', 'gewinnen', 'treffen', 'verabreden', 'abschicken',
    'schicken', 'reservieren', 'notieren', 'wandern', 'schwimmen', 'singen', 'lachen',
    'schlafen', 'backen', 'sammeln', 'interessieren', 'fotografieren', 'üben'
  ],
  B1: [
    'verstehen', 'erinnern', 'erwähnen', 'benutzen', 'brauchen', 'nennen', 'entstehen',
    'verschwinden', 'eintreffen', 'ankündigen', 'verpassen', 'verschlafen', 'wegfahren',
    'klappen', 'gelingen', 'schiefgehen', 'warnen', 'betonen', 'unterstützen', 'beenden',
    'korrigieren', 'kontrollieren', 'erstellen', 'erledigen', 'lösen', 'prüfen', 'informieren',
    'organisieren', 'vorbereiten', 'ausschalten', 'belohnen', 'verbringen', 'aussehen',
    'anziehen', 'auffallen', 'umsehen', 'anbieten', 'treten', 'werfen', 'fallen', 'stellen', 'vermitteln'
  ],
  B2: [
    'erhalten', 'studieren', 'verlassen', 'verschieben', 'verändern', 'erwähnen', 'verbrennen',
    'auffallen', 'ausdenken', 'umsehen', 'anfühlen', 'unternehmen', 'übernehmen', 'empfangen',
    'vermitteln', 'aufbauen', 'verfügen', 'gefallen', 'bewerben', 'ablaufen',
    'überraschen', 'äußern', 'dokumentieren', 'gewöhnen',
    'wandern', 'spenden', 'füllen', 'fällen', 'verlegen', 'prüfen'
  ],
  C1: [
    'geraten', 'gelten', 'empfehlen', 'empfinden', 'begreifen', 'wirken', 'leiden', 'aufbauen',
    'übernehmen', 'unternehmen', 'verfügen', 'gefallen', 'beweisen', 'beschließen', 'überarbeiten',
    'durchziehen', 'dokumentieren', 'verwandeln', 'schmücken', 'abkühlen', 'abreißen', 'verlegen',
    'gewöhnen', 'begrüßen', 'betrachten', 'äußern', 'erhalten', 'verschmelzen', 'entstehen',
    'vermitteln', 'verstehen', 'erinnern'
  ],
  C2: [
    'verschmelzen', 'sezieren', 'sanieren', 'blockieren', 'bewerten', 'schulen', 'fällen',
    'applaudieren', 'betrachten', 'begreifen', 'empfinden', 'geraten', 'gelten', 'wirken',
    'durchziehen', 'abreißen', 'überarbeiten', 'beschließen', 'beweisen', 'verfügen', 'leiden',
    'verschwinden', 'entstehen', 'gelingen', 'schiefgehen', 'warnen'
  ]
};

/** حروف اضافه و گروه‌های حرف‌اضافه‌ای ردهٔ هر سطح (با حالت دستوری) */
export const LEVEL_PREPS: Record<TLvl, string[]> = {
  A1: [
    'in (+Dat/Akk)', 'auf (+Dat/Akk)', 'an (+Dat/Akk)', 'mit (+Dat)', 'von (+Dat)', 'zu (+Dat)',
    'nach (+Dat)', 'aus (+Dat)', 'bei (+Dat)', 'für (+Akk)', 'ohne (+Akk)', 'um (+Akk)'
  ],
  A2: [
    'über (+Akk)', 'unter (+Dat/Akk)', 'vor (+Dat/Akk)', 'hinter (+Dat/Akk)', 'neben (+Dat/Akk)',
    'zwischen (+Dat/Akk)', 'seit (+Dat)', 'ab (+Dat)', 'bis (+Akk)', 'gegen (+Akk)',
    'um … zu + Infinitiv', 'durch (+Akk)'
  ],
  B1: [
    'während (+Gen)', 'trotz (+Gen)', 'wegen (+Gen)', 'ohne … zu + Infinitiv',
    'damit / dass (Satz)', 'anlässlich (+Gen)', 'infolge (+Gen)', 'gemäß (+Dat/Gen)',
    'entsprechend (+Dat)', 'laut (+Dat/Gen)', 'außer (+Dat)', 'seit'
  ],
  B2: [
    'anhand (+Gen)', 'im Rahmen (+Gen)', 'hinsichtlich (+Gen)', 'bezüglich (+Gen)',
    'aufgrund (+Gen)', 'mittels (+Gen)', 'zwecks (+Gen)', 'via (+Akk/Gen)',
    'im Gegensatz zu (+Dat)', 'in Bezug auf (+Akk)', 'hinsichtlich', 'zufolge (+Dat/Gen)'
  ],
  C1: [
    'im Zuge (+Gen)', 'mit Blick auf (+Akk)', 'ungeachtet (+Gen)', 'kraft (+Gen)',
    'seitens (+Gen)', 'im Hinblick auf (+Akk)', 'im Falle (+Gen)', 'zugunsten (+Gen)',
    'analog zu (+Dat)', 'im Vorfeld (+Gen)', 'zumal (Nebensatz)', 'nichtsdestotrotz'
  ],
  C2: [
    'abzüglich (+Gen)', 'eingeschlossen (+Gen)', 'exklusive (+Gen)', 'nebst (+Dat)',
    'samt (+Dat)', 'zuzüglich (+Gen)', 'betreffs (+Gen)', 'binnen (+Gen/Dat)',
    'zu Lasten (+Gen)', 'mit Ausnahme von (+Dat)', 'vermittels (+Gen)', 'gen (+Gen)'
  ]
};

/** نگاشت سطح A1–C2 به بانک داستان آفلاین A/B/C (برای «داستان آماده») */
export const bandOf = (l: TLvl): 'A' | 'B' | 'C' =>
  l === 'A1' || l === 'A2' ? 'A' : l === 'B1' || l === 'B2' ? 'B' : 'C';
