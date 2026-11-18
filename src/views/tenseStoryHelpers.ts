/**
 * tenseStoryHelpers.ts — مثال افعال، فرم‌های دستی، پارس داستان و جستجوی واژه
 */

import { VERBS, TENSE_INFO } from './tenseStoryData';
import { DICT } from './tenseStoryDict';
import { STORIES, Story } from './tenseStoryBank';
import { Tense, Band, DictEntry } from './tenseStoryData';

export interface Blank {
  inf: string;
  ans: string;
  kind: 'fin' | 'aux' | 'pp';
  tense: Tense; // در داستان‌های ترکیبی از نشانه خوانده می‌شود؛ در غیر این صورت زمانِ داستان
}
export type Segment = { t: 'txt'; text: string } | { t: 'blank'; blank: Blank; idx: number };

/** مثال کوتاه برای هر فعل (کلید = مصدر) */
export const VERB_EX: Record<string, { ex: string; exFa: string }> = {
  sein: { ex: 'Ich bin müde.', exFa: 'من خسته‌ام.' },
  haben: { ex: 'Wir haben Zeit.', exFa: 'ما وقت داریم.' },
  werden: { ex: 'Es wird kalt.', exFa: 'هوا سرد می‌شود.' },
  gehen: { ex: 'Wir gehen nach Hause.', exFa: 'به خانه می‌رویم.' },
  fahren: { ex: 'Ich fahre mit dem Bus.', exFa: 'با اتوبوس می‌روم.' },
  kommen: { ex: 'Kommst du mit?', exFa: 'تو هم می‌آیی؟' },
  bleiben: { ex: 'Ich bleibe heute hier.', exFa: 'امروز همین‌جا می‌مانم.' },
  laufen: { ex: 'Der Hund läuft schnell.', exFa: 'سگ سریع می‌دود.' },
  essen: { ex: 'Wir essen um zwölf Uhr.', exFa: 'ساعت دوازده غذا می‌خوریم.' },
  trinken: { ex: 'Ich trinke Wasser.', exFa: 'آب می‌نوشم.' },
  lesen: { ex: 'Sie liest ein Buch.', exFa: 'او کتاب می‌خواند.' },
  nehmen: { ex: 'Ich nehme den Bus.', exFa: 'اتوبوس را برمی‌دارم.' },
  sprechen: { ex: 'Wir sprechen Deutsch.', exFa: 'آلمانی حرف می‌زنیم.' },
  sehen: { ex: 'Sehen wir den Film?', exFa: 'فیلم را می‌بینیم؟' },
  finden: { ex: 'Ich finde das gut.', exFa: 'این را خوب می‌دانم.' },
  geben: { ex: 'Er gibt mir die Antwort.', exFa: 'او به من جواب می‌دهد.' },
  halten: { ex: 'Der Bus hält hier.', exFa: 'اتوبوس اینجا نگه می‌دارد.' },
  brechen: { ex: 'Die Kette bricht.', exFa: 'زنجیر پاره می‌شود.' },
  helfen: { ex: 'Kannst du mir helfen?', exFa: 'می‌توانی کمکم کنی؟' },
  schwimmen: { ex: 'Wir schwimmen im See.', exFa: 'در دریاچه شنا می‌کنیم.' },
  singen: { ex: 'Die Kinder singen.', exFa: 'بچه‌ها آواز می‌خوانند.' },
  schlafen: { ex: 'Das Kind schläft.', exFa: 'کودک می‌خوابد.' },
  backen: { ex: 'Oma backt einen Kuchen.', exFa: 'مادربزرگ کیک می‌پزد.' },
  geraten: { ex: 'Das Wort gerät in Vergessenheit.', exFa: 'آن کلمه در فراموشی فرو می‌رود.' },
  verschwinden: { ex: 'Die Sonne verschwindet.', exFa: 'خورشید ناپدید می‌شود.' },
  entstehen: { ex: 'Hier entstehen neue Häuser.', exFa: 'اینجا خانه‌های نو ساخته می‌شوند.' },
  eintreffen: { ex: 'Der Zug trifft um zehn ein.', exFa: 'قطار ساعت ده می‌رسد.' },
  scheinen: { ex: 'Die Sonne scheint.', exFa: 'خورشید می‌تابد.' },
  auffallen: { ex: 'Der Fehler fällt mir auf.', exFa: 'آن غلط توجه‌ام را جلب می‌کند.' },
  aussehen: { ex: 'Du siehst glücklich aus.', exFa: 'خوشحال به نظر می‌رسی.' },
  anziehen: { ex: 'Ich ziehe den Mantel an.', exFa: 'پالتو را می‌پوشم.' },
  ausdenken: { ex: 'Er denkt eine Geschichte aus.', exFa: 'او داستانی از خود درمی‌آورد.' },
  umsehen: { ex: 'Ich sehe mich in der Stadt um.', exFa: 'در شهر یک دور می‌زنم.' },
  anfühlen: { ex: 'Die Beine fühlen sich schwer an.', exFa: 'پاها سنگین حس می‌شوند.' },
  unternehmen: { ex: 'Wir unternehmen etwas Schönes.', exFa: 'کار خوشایندی انجام می‌دهیم.' },
  übernehmen: { ex: 'Ich übernehme die Aufgabe.', exFa: 'آن وظیفه را بر عهده می‌گیرم.' },
  empfangen: { ex: 'Das Team empfängt uns herzlich.', exFa: 'تیم گرم از ما استقبال می‌کند.' },
  begreifen: { ex: 'Ich begreife die Regel.', exFa: 'قاعده را می‌فهمم.' },
  empfinden: { ex: 'Er empfindet Freude.', exFa: 'او شادی احساس می‌کند.' },
  verschmelzen: { ex: 'Die Grenzen verschmelzen.', exFa: 'مرزها در هم می‌روند.' },
  gelten: { ex: 'Die Regel gilt für alle.', exFa: 'قاعده برای همه برقرار است.' },
  verbrennen: { ex: 'Das Papier verbrennt schnell.', exFa: 'کاغذ سریع می‌سوزد.' },
  abreißen: { ex: 'Sie reißen das Haus ab.', exFa: 'خانه را تخریب می‌کنند.' },
  ablaufen: { ex: 'Die Frist läuft morgen ab.', exFa: 'مهلت فردا تمام می‌شود.' },
  durchziehen: { ex: 'Die Stadt zieht das Projekt durch.', exFa: 'شهر آن پروژه را پیش می‌برد.' },
  wissen: { ex: 'Ich weiß die Antwort.', exFa: 'جواب را می‌دانم.' },
  denken: { ex: 'Ich denke an dich.', exFa: 'به تو فکر می‌کنم.' },
  bringen: { ex: 'Er bringt das Werkzeug mit.', exFa: 'ابزار را با خود می‌آورد.' },
  kennen: { ex: 'Ich kenne die Stadt.', exFa: 'آن شهر را می‌شناسم.' },
  spielen: { ex: 'Die Kinder spielen.', exFa: 'بچه‌ها بازی می‌کنند.' },
  hören: { ex: 'Ich höre Musik.', exFa: 'موسیقی گوش می‌دهم.' },
  kaufen: { ex: 'Wir kaufen Obst.', exFa: 'میوه می‌خریم.' },
  suchen: { ex: 'Ich suche meine Brille.', exFa: 'عینکم را می‌گردم.' },
  bezahlen: { ex: 'Ich bezahle an der Kasse.', exFa: 'پشت صندوق پرداخت می‌کنم.' },
  kochen: { ex: 'Mutter kocht das Essen.', exFa: 'مادر غذا می‌پزد.' },
  wohnen: { ex: 'Ich wohne in Teheran.', exFa: 'در تهران زندگی می‌کنم.' },
  machen: { ex: 'Was machst du?', exFa: 'چه کار می‌کنی؟' },
  erklären: { ex: 'Die Lehrerin erklärt die Regel.', exFa: 'معلم قاعده را توضیح می‌دهد.' },
  schreiben: { ex: 'Ich schreibe eine E-Mail.', exFa: 'ایمیل می‌نویسم.' },
  sammeln: { ex: 'Wir sammeln Plastikmüll.', exFa: 'زباله پلاستیکی جمع می‌کنیم.' },
  sagen: { ex: 'Er sagt die Wahrheit.', exFa: 'او راست می‌گوید.' },
  steigen: { ex: 'Die Preise steigen.', exFa: 'قیمت‌ها بالا می‌رود.' },
  versuchen: { ex: 'Ich versuche es noch einmal.', exFa: 'دوباره تلاش می‌کنم.' },
  kosten: { ex: 'Das Buch kostet zehn Euro.', exFa: 'کتاب ده یورو خرج دارد.' },
  verändern: { ex: 'Die Technik verändert die Welt.', exFa: 'فناوری دنیا را تغییر می‌دهد.' },
  setzen: { ex: 'Wir setzen uns an den Tisch.', exFa: 'پشت میز می‌نشینیم.' },
  warnen: { ex: 'Die Experten warnen vor Sturm.', exFa: 'کارشناس‌ها از توفان خبر می‌دهند.' },
  betonen: { ex: 'Sie betont die Wichtigkeit.', exFa: 'او بر اهمیت آن تأکید می‌کند.' },
  leiden: { ex: 'Die Qualität leidet.', exFa: 'کیفیت آسیب می‌بیند.' },
  leben: { ex: 'Sie lebt in Hamburg.', exFa: 'او در هامبورگ زندگی می‌کند.' },
  verlieren: { ex: 'Ich verliere den Schlüssel.', exFa: 'کلید را گم می‌کنم.' },
  empfehlen: { ex: 'Ich empfehle dieses Buch.', exFa: 'این کتاب را پیشنهاد می‌کنم.' },
  wirken: { ex: 'Die Pause wirkt Wunder.', exFa: 'وقفه معجزه می‌کند.' },
  üben: { ex: 'Ich übe jeden Tag.', exFa: 'هر روز تمرین می‌کنم.' },
  besuchen: { ex: 'Wir besuchen das Museum.', exFa: 'موزه را می‌بینیم.' },
  lachen: { ex: 'Die Kinder lachen.', exFa: 'بچه‌ها می‌خندند.' },
  wollen: { ex: 'Ich will jetzt schlafen.', exFa: 'الان می‌خواهم بخوابم.' },
  schmücken: { ex: 'Wir schmücken den Raum.', exFa: 'اتاق را تزیین می‌کنیم.' },
  öffnen: { ex: 'Ich öffne die Tür.', exFa: 'در را باز می‌کنم.' },
  rufen: { ex: 'Sie ruft laut.', exFa: 'او بلند فریاد می‌زند.' },
  danken: { ex: 'Ich danke dir herzlich.', exFa: 'صمیمانه از تو تشکر می‌کنم.' },
  spenden: { ex: 'Wir spenden Bücher.', exFa: 'کتاب اهدا می‌کنیم.' },
  fühlen: { ex: 'Ich fühle mich gut.', exFa: 'حال‌وهوای خوبی دارم.' },
  applaudieren: { ex: 'Das Publikum applaudiert lange.', exFa: 'تماشاگران طولانی کف می‌زنند.' },
  betrachten: { ex: 'Wir betrachten die Bilder.', exFa: 'تابلوها را تماشا می‌کنیم.' },
  begrüßen: { ex: 'Sie begrüßt die Gäste.', exFa: 'او مهمان‌ها را خوش‌آمد می‌گوید.' },
  antworten: { ex: 'Ich antworte ehrlich.', exFa: 'صادقانه جواب می‌دهم.' },
  anbieten: { ex: 'Er bietet mir Hilfe an.', exFa: 'او به من کمک پیشنهاد می‌دهد.' },
  warten: { ex: 'Wir warten auf den Bus.', exFa: 'منتظر اتوبوس هستیم.' },
  überraschen: { ex: 'Das Geschenk überrascht mich.', exFa: 'هدیه مرا غافلگیر می‌کند.' },
  fällen: { ex: 'Die Stadt fällt alte Bäume.', exFa: 'شهر درخت‌های کهنه را قطع می‌کند.' },
  füllen: { ex: 'Ich fülle die Flasche.', exFa: 'بطری را پر می‌کنم.' },
  organisieren: { ex: 'Wir organisieren die Party.', exFa: 'مهمانی را سازماندهی می‌کنیم.' },
  gewöhnen: { ex: 'Ich gewöhne mich an das Wetter.', exFa: 'خودم را با هوا عادت می‌دهم.' },
  dokumentieren: { ex: 'Wir dokumentieren alles.', exFa: 'همه‌چیز را مستند می‌کنیم.' },
  äußern: { ex: 'Er äußert seine Meinung.', exFa: 'او نظرش را می‌گوید.' },
  regnen: { ex: 'Es regnet stark.', exFa: 'باران شدید می‌بارد.' },
  einpacken: { ex: 'Ich packe den Schirm ein.', exFa: 'چتر را داخل کیف می‌گذارم.' },
  beginnen: { ex: 'Der Film beginnt um acht.', exFa: 'فیلم ساعت هشت شروع می‌شود.' },
  zeigen: { ex: 'Sie zeigt mir die Stadt.', exFa: 'شهر را به من نشان می‌دهد.' },
  korrigieren: { ex: 'Ich korrigiere den Fehler.', exFa: 'غلط را اصلاح می‌کنم.' },
  abschicken: { ex: 'Ich schicke die E-Mail ab.', exFa: 'ایمیل را می‌فرستم.' },
  verabreden: { ex: 'Wir verabreden uns um 18 Uhr.', exFa: 'ساعت ۱۸ قرار می‌گذاریم.' },
  schicken: { ex: 'Sie schickt mir eine Nachricht.', exFa: 'به من پیام می‌فرستد.' },
  bestellen: { ex: 'Ich bestelle einen Kaffee.', exFa: 'قهوه سفارش می‌دهم.' },
  sitzen: { ex: 'Wir sitzen im Park.', exFa: 'در پارک می‌نشینیم.' },
  verlassen: { ex: 'Ich verlasse das Haus.', exFa: 'خانه را ترک می‌کنم.' },
  verschieben: { ex: 'Wir verschieben das Meeting.', exFa: 'جلسه را عقب می‌اندازیم.' },
  erzählen: { ex: 'Er erzählt eine Geschichte.', exFa: 'او داستان تعریف می‌کند.' },
  sanieren: { ex: 'Die Stadt saniert die Altstadt.', exFa: 'شهر بافت قدیمی را نوسازی می‌کند.' },
  verstehen: { ex: 'Ich verstehe dich gut.', exFa: 'تو را خوب می‌فهمم.' },
  studieren: { ex: 'Sie studiert in Berlin.', exFa: 'او در برلین درس می‌خواند.' },
  beweisen: { ex: 'Die Daten bewiesen die Idee.', exFa: 'داده‌ها آن ایده را اثبات می‌کنند.' },
  fälschen: { ex: 'Er fälscht die Unterschrift.', exFa: 'او امضا را جعل می‌کند.' },
  informieren: { ex: 'Wir informieren die Polizei.', exFa: 'پلیس را مطلع می‌کنیم.' },
  lösen: { ex: 'Ich löse das Rätsel.', exFa: 'معما را حل می‌کنم.' },
  erledigen: { ex: 'Ich erledige die Einkäufe.', exFa: 'خریدها را انجام می‌دهم.' },
  prüfen: { ex: 'Wir prüfen die Quellen.', exFa: 'منبع‌ها را بررسی می‌کنیم.' },
  überarbeiten: { ex: 'Ich überarbeite den Text.', exFa: 'متن را بازبینی و اصلاح می‌کنم.' },
  blockieren: { ex: 'Sie blockieren den Entwurf.', exFa: 'آنها طرح را مسدود می‌کنند.' },
  beschließen: { ex: 'Das Parlament beschließt den Haushalt.', exFa: 'مجلس بودجه را تصویب می‌کند.' },
  sezieren: { ex: 'Die Medien sezieren das Ergebnis.', exFa: 'رسانه‌ها نتیجه را کالبدشکافی می‌کنند.' },
  bewerten: { ex: 'Die Jury bewertet die Arbeit.', exFa: 'داوران کار را ارزیابی می‌کنند.' },
  erstellen: { ex: 'Ich erstelle einen Plan.', exFa: 'برنامه‌ای تنظیم می‌کنم.' },
  notieren: { ex: 'Ich notiere die Termine.', exFa: 'قرارها را یادداشت می‌کنم.' },
  reservieren: { ex: 'Wir reservieren zwei Abende.', exFa: 'دو شب را کنار می‌گذاریم.' },
  kontrollieren: { ex: 'Die Lehrerin kontrolliert die Hefte.', exFa: 'معلم دفترها را چک می‌کند.' },
  ausschalten: { ex: 'Ich schalte das Handy aus.', exFa: 'موبایل را خاموش می‌کنم.' },
  belohnen: { ex: 'Ich belohne mich mit Musik.', exFa: 'با موسیقی به خودم پاداش می‌دهم.' },
  packen: { ex: 'Vater packt das Picknick.', exFa: 'پدر پیک‌نیک را جا می‌دهد.' },
  fotografieren: { ex: 'Wir fotografieren viel.', exFa: 'زیاد عکس می‌گیریم.' },
  unterstützen: { ex: 'Sie unterstützt mich.', exFa: 'او از من حمایت می‌کند.' },
  beenden: { ex: 'Ich beende die Arbeit.', exFa: 'کار را تمام می‌کنم.' },
  zuhören: { ex: 'Hörst du mir zu?', exFa: 'به من گوش می‌دهی؟' },
  schenken: { ex: 'Ich schenke dir ein Buch.', exFa: 'به تو کتاب هدیه می‌دهم.' },
  verbringen: { ex: 'Wir verbringen den Tag am See.', exFa: 'روز را کنار دریاچه می‌گذرانیم.' },
  anführen: { ex: 'Er führt gute Beispiele an.', exFa: 'او مثال‌های خوب برمی‌شمارد.' },
  abkühlen: { ex: 'Die Stadt kühlt sich ab.', exFa: 'شهر خنک می‌شود.' },
  verwandeln: { ex: 'Wir verwandeln das Zimmer.', exFa: 'اتاق را تبدیل می‌کنیم.' },
  ankommen: { ex: 'Der Zug kommt um zehn an.', exFa: 'قطار ساعت ده می‌رسد.' },
  wandern: { ex: 'Wir wandern in den Bergen.', exFa: 'در کوه‌ها کوه‌پیمایی می‌کنیم.' },
  mitnehmen: { ex: 'Ich nehme den Schirm mit.', exFa: 'چتر را با خود می‌برم.' },
  interessieren: { ex: 'Ich interessiere mich für Musik.', exFa: 'به موسیقی علاقه‌مندم.' },
  treffen: { ex: 'Wir treffen uns am Freitag.', exFa: 'جمعه همدیگر را می‌بینیم.' },
  bewerben: { ex: 'Ich bewerbe mich bei einer Firma.', exFa: 'به یک شرکت درخواست کار می‌دهم.' },
  lohnen: { ex: 'Die Mühe lohnt sich.', exFa: 'زحمتش می‌ارزد.' },
  aufstehen: { ex: 'Ich stehe um sieben auf.', exFa: 'ساعت هفت بیدار می‌شوم.' },
  arbeiten: { ex: 'Ich arbeite in einem Büro.', exFa: 'در یک دفتر کار می‌کنم.' },
  'erwähnen': { ex: 'Er erwähnt den Namen.', exFa: 'او نام را بر زبان می‌آورد.' },
  erhalten: { ex: 'Ich erhalte eine Antwort.', exFa: 'پاسخی دریافت می‌کنم.' },
  verschlafen: { ex: 'Ich verschlafe den Wecker.', exFa: 'خواب زنگ ساعت می‌مانم.' },
  verpassen: { ex: 'Ich verpasste den Bus.', exFa: 'اتوبوس را از دست دادم.' },
  speichern: { ex: 'Ich speichere die Datei.', exFa: 'فایل را ذخیره می‌کنم.' },
  lernen: { ex: 'Wir lernen Deutsch.', exFa: 'آلمانی یاد می‌گیریم.' },
  entdecken: { ex: 'Sie entdeckt einen Fehler.', exFa: 'او خطایی کشف می‌کند.' },
  wegfahren: { ex: 'Der Bus fährt weg.', exFa: 'اتوبوس می‌رود.' },
  klappen: { ex: 'Der Plan klappt.', exFa: 'برنامه جواب می‌دهد.' },
  gelingen: { ex: 'Das Projekt gelingt.', exFa: 'پروژه به نتیجه می‌رسد.' },
  schiefgehen: { ex: 'Der Plan geht schief.', exFa: 'برنامه خراب می‌شود.' }
};

/** فرم‌های صرف‌شدهٔ چاپ‌شده در متن که جاهای خالی نیستند */
export const MANUAL_FORMS: Record<string, string> = {
  ankam: 'ankommen',
  ankamen: 'ankommen',
  kam: 'ankommen',
  begann: 'beginnen',
  entdeckte: 'entdecken',
  gelernt: 'lernen',
  gespeichert: 'speichern',
  worden: 'werden',
  verpasste: 'verpassen',
  klappt: 'klappen',
  gelingt: 'gelingen',
  bleibt: 'bleiben',
  schiefgeht: 'schiefgehen',
  bin: 'sein',
  kann: 'können'
};

// فرم‌های متنِ چاپ‌شده (غیر خالی) → مصدر، از جدول افعال ساخته می‌شود
const sepFirst = (s: string): string => s.split(' ')[0] || s;

const FORMS: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [inf, v] of Object.entries(VERBS)) {
    m[inf.toLowerCase()] = inf;
    m[sepFirst(v.prt3).toLowerCase()] = inf;
    m[v.pp.toLowerCase()] = inf;
  }
  for (const [f, inf] of Object.entries(MANUAL_FORMS)) m[f.toLowerCase()] = inf;
  // همهٔ پاسخ‌های جاهای خالی هم به مصدر نگاشت می‌شوند
  for (const s of STORIES) {
    for (const b of parseBlanks(s)) m[b.ans.toLowerCase()] = b.inf;
  }
  return m;
})();

/** پارس متن داستان به بخش‌های متن/جای خالی */
export function parseBlanks(s: Story): Blank[] {
  const out: Blank[] = [];
  const re = /\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s.text)) !== null) {
    const parts = m[1].split('|');
    if (parts.length < 3) continue;
    const kindTense = parts[2].split(':');
    out.push({
      inf: parts[0].trim(),
      ans: parts[1].trim(),
      kind: kindTense[0].trim() as Blank['kind'],
      tense: (kindTense[1]?.trim() || s.ts) as Tense
    });
  }
  return out;
}

export function parseSegments(s: Story): Segment[] {
  const segs: Segment[] = [];
  const re = /\{([^}]+)\}/g;
  let last = 0, idx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s.text)) !== null) {
    if (m.index > last) segs.push({ t: 'txt', text: s.text.slice(last, m.index) });
    const parts = m[1].split('|');
    const kindTense = (parts[2] || 'fin').split(':');
    segs.push({
      t: 'blank', idx: idx++,
      blank: { inf: parts[0].trim(), ans: parts[1].trim(), kind: kindTense[0].trim() as Blank['kind'], tense: (kindTense[1]?.trim() || s.ts) as Tense }
    });
    last = m.index + m[0].length;
  }
  if (last < s.text.length) segs.push({ t: 'txt', text: s.text.slice(last) });
  return segs;
}

export interface Lookup {
  fa: string;
  inf?: string;      // برای افعال: مصدر
  aux?: 'haben' | 'sein';
  entry?: DictEntry; // اگر در واژه‌نامه است
  ex?: string;
  exFa?: string;
  de?: string;       // لِم برای افزودن به واژگان
  art?: string;
  pos?: string;
}

/** جستجوی کلمه: اول فرم فعل، بعد واژه‌نامه */
export function lookupWord(raw: string): Lookup | null {
  const w = raw.toLowerCase().replace(/[.,!?;:„“"()]/g, '');
  if (!w) return null;
  const inf = FORMS[w];
  if (inf && VERBS[inf]) {
    const v = VERBS[inf];
    const ex = VERB_EX[inf];
    return { fa: v.fa, inf, aux: v.aux, ex: ex?.ex, exFa: ex?.exFa, de: inf, pos: 'verb' };
  }
  const e = DICT[w];
  if (e && e.fa) {
    return {
      fa: e.fa, entry: e,
      ex: e.ex, exFa: e.exFa,
      de: e.de, art: e.art, pos: e.pos
    };
  }
  return { fa: 'این کلمه در واژه‌نامهٔ این تمرین نیست.' };
}

/** انتخاب داستان بر اساس سطح و زمان */
export function pickStory(band: Band, ts: Tense): Story {
  const pool = STORIES.filter(s => s.band === band && s.ts === ts);
  if (pool.length === 0) return STORIES[0];
  return pool[Math.floor(Math.random() * pool.length)];
}

/** توضیح گرامری هر جای خالی (فارسی) */
export function explainBlank(b: Blank, chain: boolean): string {
  const parts: string[] = [];
  const t = TENSE_INFO[b.tense];
  parts.push(`${t.de} (${t.fa}): ${t.expl}`);
  const v = VERBS[b.inf];
  if (v && chain) parts.push(`${b.inf} → ${v.prt3} → ${v.pp} (Perfekt با ${v.aux})`);
  if (b.kind === 'aux') parts.push('در این جای خالی فقط فعل کمکی صرف می‌شود؛ شکل «Partizip II» در جمله داده شده است.');
  if (b.kind === 'pp') parts.push('در این جای خالی «Partizip II» نوشته می‌شود؛ فعل کمکی با فاعل صرف شده و در جمله است.');
  if (b.kind === 'fin') parts.push('فعل اصلی در جایگاه دوم صرف می‌شود و با فاعل جمله هماهنگ است.');
  return parts.join(' • ');
}

/** تطبیق پاسخ تایپ‌شده با پاسخ درست (بی‌حساس به بزرگی‌کوچکی و ß/ss) */
export function normalizeAnswer(s: string): string {
  return s.trim().toLowerCase().replace(/\u00df/g, 'ss').replace(/\s+/g, ' ').replace(/[.!]+$/, '');
}
export function isCorrect(given: string, ans: string): boolean {
  return normalizeAnswer(given) === normalizeAnswer(ans);
}
