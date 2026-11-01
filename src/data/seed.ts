import { CaseQuestion, Word } from '../types';

export const P6 = ['ich', 'du', 'er/sie/es', 'wir', 'ihr', 'sie/Sie'];

export const SEED_NOUNS: Partial<Word>[] = [
  { de: 'Mann', art: 'der', fa: 'مرد', pl: 'Männer', pos: 'اسم', lvl: 'A1', cat: 'امور روزمره', ex: 'Der Mann hilft allen.', exFa: 'مرد به همه کمک می‌کند.', cloze: '_____ hilft allen.', id: 's_Mann' },
  { de: 'Frau', art: 'die', fa: 'زن', pl: 'Frauen', pos: 'اسم', lvl: 'A1', cat: 'امور روزمره', ex: 'Die Frau liest ein Buch.', exFa: 'زن کتابی می‌خواند.', cloze: '_____ liest ein Buch.', id: 's_Frau' },
  { de: 'Kind', art: 'das', fa: 'کودک', pl: 'Kinder', pos: 'اسم', lvl: 'A1', cat: 'امور روزمره', ex: 'Das Kind spielt im Garten.', exFa: 'کودک در باغ بازی می‌کند.', cloze: '_____ spielt im Garten.', id: 's_Kind' },
  { de: 'Mädchen', art: 'das', fa: 'دختر', pl: 'Mädchen', pos: 'اسم', lvl: 'A1', cat: 'امور روزمره', ex: 'Das Mädchen singt ein Lied.', exFa: 'دختر آهنگی می‌خواند.', cloze: '_____ singt ein Lied.', id: 's_Mädchen' },
  { de: 'Straße', art: 'die', fa: 'خیابان', pl: 'Straßen', pos: 'اسم', lvl: 'A1', cat: 'امور روزمره', ex: 'Die Straße ist sehr lang.', exFa: 'خیابان خیلی طولانی است.', cloze: '_____ ist sehr lang.', id: 's_Straße' },
  { de: 'Haus', art: 'das', fa: 'خانه', pl: 'Häuser', pos: 'اسم', lvl: 'A1', cat: 'امور روزمره', ex: 'Das Haus ist neu.', exFa: 'خانه نو است.', cloze: '_____ ist neu.', id: 's_Haus' },
  { de: 'Tisch', art: 'der', fa: 'میز', pl: 'Tische', pos: 'اسم', lvl: 'A1', cat: 'امور روزمره', ex: 'Der Tisch steht in der Küche.', exFa: 'میز در آشپزخانه است.', cloze: '_____ steht in der Küche.', id: 's_Tisch' },
  { de: 'Schule', art: 'die', fa: 'مدرسه', pl: 'Schulen', pos: 'اسم', lvl: 'A1', cat: 'امور روزمره', ex: 'Die Schule beginnt um acht Uhr.', exFa: 'مدرسه ساعت هشت شروع می‌شود.', cloze: '_____ beginnt um acht Uhr.', id: 's_Schule' }
];

export const EX2: Record<string, [string, string]> = {
  Mann: ['Der Mann, der neben uns wohnt, arbeitet als Ingenieur in einem internationalen Unternehmen.', 'مردی که کنار ما زندگی می‌کند، به‌عنوان مهندس در یک شرکت بین‌المللی کار می‌کند.'],
  Frau: ['Die Frau, mit der ich gestern gesprochen habe, leitet eine kleine Firma.', 'زنی که دیروز با او صحبت کردم، یک شرکت کوچک را اداره می‌کند.'],
  Kind: ['Obwohl das Kind noch sehr jung ist, kann es schon fließend lesen.', 'با اینکه کودک هنوز خیلی کوچک است، همین حالا هم روان می‌خواند.'],
  Mädchen: ['Das Mädchen hat sich entschieden, nach dem Abitur im Ausland zu studieren.', 'دختر تصمیم گرفته است بعد از دیپلم در خارج از کشور درس بخواند.'],
  Straße: ['Wegen der Bauarbeiten ist die Straße bis nächste Woche gesperrt.', 'به‌خاطر کارهای ساختمانی، خیابان تا هفتهٔ آینده بسته است.'],
  Haus: ['Sie haben das Haus saniert, damit die Heizkosten deutlich sinken.', 'آن‌ها خانه را بازسازی کرده‌اند تا هزینهٔ گرمایش به‌طور محسوسی کاهش یابد.'],
  Tisch: ['Wir sollten einen Tisch reservieren, weil das Restaurant am Wochenende meistens voll ist.', 'بهتر است میزی رزرو کنیم، چون رستوران آخر هفته‌ها معمولاً پر است.'],
  Schule: ['Die Schule bietet zusätzliche Sprachkurse an, die den Schülern den Einstieg erleichtern.', 'مدرسه کلاس‌های زبان اضافی ارائه می‌دهد که شروع کار را برای دانش‌آموزان آسان‌تر می‌کند.']
};

export const SEED_VERBS: Partial<Word>[] = [
  { id: 's_gehen', de: 'gehen', art: '', fa: 'رفتن', pl: '', pos: 'فعل', lvl: 'A1', cat: 'امور روزمره', conj: 'gehe|gehst|geht|gehen|geht|gehen', ex: 'Ich gehe zur Arbeit.', exFa: 'من به سر کار می‌روم.', cloze: 'Ich _____ zur Arbeit.', ans: 'gehe', ex2: 'Wenn das Wetter schön ist, gehe ich lieber zu Fuß, anstatt den Bus zu nehmen.', ex2Fa: 'وقتی هوا خوب است، ترجیح می‌دهم به‌جای اتوبوس پیاده بروم.', prat: 'ging', perf: 'ist gegangen', sep: '' },
  { id: 's_machen', de: 'machen', art: '', fa: 'انجام دادن', pl: '', pos: 'فعل', lvl: 'A1', cat: 'امور روزمره', conj: 'mache|machst|macht|machen|macht|machen', ex: 'Du machst die Hausaufgaben.', exFa: 'تو تکالیف را انجام می‌دهی.', cloze: 'Du _____ die Hausaufgaben.', ans: 'machst', ex2: 'Ich habe mir vorgenommen, nächstes Jahr eine Weiterbildung zu machen.', ex2Fa: 'تصمیم گرفته‌ام سال آینده یک دورهٔ تکمیلی بگذرانم.', prat: 'machte', perf: 'hat gemacht', sep: '' },
  { id: 's_lernen', de: 'lernen', art: '', fa: 'یاد گرفتن', pl: '', pos: 'فعل', lvl: 'A1', cat: 'امور روزمره', conj: 'lerne|lernst|lernt|lernen|lernt|lernen', ex: 'Ich lerne jeden Tag Deutsch.', exFa: 'من هر روز آلمانی یاد می‌گیرم.', cloze: 'Ich _____ jeden Tag Deutsch.', ans: 'lerne', ex2: 'Um die Prüfung zu bestehen, muss man regelmäßig lernen und sich gut organisieren.', ex2Fa: 'برای قبول شدن در امتحان باید مرتب درس خواند و خوب برنامه‌ریزی کرد.', prat: 'lernte', perf: 'hat gelernt', sep: '' },
  { id: 's_haben', de: 'haben', art: '', fa: 'داشتن', pl: '', pos: 'فعل', lvl: 'A1', cat: 'امور روزمره', conj: 'habe|hast|hat|haben|habt|haben', ex: 'Er hat einen Hund.', exFa: 'او یک سگ دارد.', cloze: 'Er _____ einen Hund.', ans: 'hat', ex2: 'Obwohl wir wenig Zeit haben, wollen wir die Aufgabe gründlich erledigen.', ex2Fa: 'با اینکه وقت کمی داریم، می‌خواهیم کار را دقیق انجام دهیم.', prat: 'hatte', perf: 'hat gehabt', sep: '' },
  { id: 's_sein', de: 'sein', art: '', fa: 'بودن', pl: '', pos: 'فعل', lvl: 'A1', cat: 'امور روزمره', conj: 'bin|bist|ist|sind|seid|sind', ex: 'Wir sind zu Hause.', exFa: 'ما خانه هستیم.', cloze: 'Wir _____ zu Hause.', ans: 'sind', ex2: 'Es ist wichtig, dass wir pünktlich sind, weil der Termin sehr kurzfristig angesetzt wurde.', ex2Fa: 'مهم است که سر وقت باشیم، چون قرار خیلی کوتاه‌مدت تعیین شده است.', prat: 'war', perf: 'ist gewesen', sep: '' },
  { id: 's_arbeiten', de: 'arbeiten', art: '', fa: 'کار کردن', pl: '', pos: 'فعل', lvl: 'A1', cat: 'امور روزمره', conj: 'arbeite|arbeitest|arbeitet|arbeiten|arbeitet|arbeiten', ex: 'Ihr arbeitet in Wien.', exFa: 'شما در وین کار می‌کنید.', cloze: 'Ihr _____ in Wien.', ans: 'arbeitet', ex2: 'Seit drei Jahren arbeitet sie in einem Team, das neue Software entwickelt.', ex2Fa: 'او سه سال است در تیمی کار می‌کند که نرم‌افزار جدید توسعه می‌دهد.', prat: 'arbeitete', perf: 'hat gearbeitet', sep: '' },
  { id: 's_aufstehen', de: 'aufstehen', art: '', fa: 'بلند شدن (از خواب)', pl: '', pos: 'فعل', lvl: 'A1', cat: 'امور روزمره', conj: 'stehe auf|stehst auf|steht auf|stehen auf|steht auf|stehen auf', ex: 'Ich stehe um sieben Uhr auf.', exFa: 'من ساعت هفت بیدار می‌شوم.', cloze: 'Ich stehe um sieben Uhr _____.', ans: 'auf', ex2: 'Obwohl es gestern spät wurde, stehe ich heute trotzdem früh auf.', ex2Fa: 'با اینکه دیشب دیر شد، امروز هم زود بیدار می‌شوم.', prat: 'stand auf', perf: 'ist aufgestanden', sep: 'auf' },
  { id: 's_anrufen', de: 'anrufen', art: '', fa: 'تلفن زدن', pl: '', pos: 'فعل', lvl: 'A1', cat: 'امور روزمره', conj: 'rufe an|rufst an|ruft an|rufen an|ruft an|rufen an', ex: 'Ich rufe dich morgen an.', exFa: 'فردا به تو زنگ می‌زنم.', cloze: 'Ich rufe dich morgen _____.', ans: 'an', ex2: 'Falls es Probleme gibt, rufen Sie bitte sofort die Hotline an.', ex2Fa: 'اگر مشکلی پیش آمد، لطفاً فوراً با خط پشتیبانی تماس بگیرید.', prat: 'rief an', perf: 'hat angerufen', sep: 'an' },
  { id: 's_einkaufen', de: 'einkaufen', art: '', fa: 'خرید کردن', pl: '', pos: 'فعل', lvl: 'A1', cat: 'امور روزمره', conj: 'kaufe ein|kaufst ein|kauft ein|kaufen ein|kauft ein|kaufen ein', ex: 'Wir kaufen im Supermarkt ein.', exFa: 'ما از سوپرمارکت خرید می‌کنیم.', cloze: 'Wir kaufen im Supermarkt _____.', ans: 'ein', ex2: 'Am Wochenende kaufen wir meistens auf dem Markt ein, weil die Produkte dort frischer sind.', ex2Fa: 'آخر هفته‌ها معمولاً از بازار خرید می‌کنیم، چون محصولات آنجا تازه‌ترند.', prat: 'kaufte ein', perf: 'hat eingekauft', sep: 'ein' },
  { id: 's_mitkommen', de: 'mitkommen', art: '', fa: 'همراه آمدن', pl: '', pos: 'فعل', lvl: 'A1', cat: 'امور روزمره', conj: 'komme mit|kommst mit|kommt mit|kommen mit|kommt mit|kommen mit', ex: 'Kommst du mit?', exFa: 'با ما می‌آیی؟', cloze: 'Kommst du _____?', ans: 'mit', ex2: 'Ich würde gern am Samstag mitkommen, falls ich bis dahin mit der Arbeit fertig bin.', ex2Fa: 'اگر تا آن موقع کارم تمام شود، دوست دارم شنبه همراه شما بیایم.', prat: 'kam mit', perf: 'ist mitgekommen', sep: 'mit' }
];

export const INITIAL_SEED: Partial<Word>[] = [
  ...SEED_NOUNS.map(n => ({
    ...n,
    ex2: EX2[n.de || '']?.[0] || '',
    ex2Fa: EX2[n.de || '']?.[1] || ''
  })),
  ...SEED_VERBS
];

export const CASEQ: CaseQuestion[] = [
  { id: 'c0', cs: 1, s: 'Ich fahre ___ ___ Bus zur Arbeit.', prepAns: 'mit', artAns: 'dem', ans: 'mit dem', n: 'der Bus', c: 'Dativ (mit)', r: 'mit ← همیشه Dativ؛ der Bus ← dem', fa: 'من با اتوبوس به سر کار می‌روم.', ex: 'Ich fahre mit dem Bus zur Arbeit.', exFa: 'من با اتوبوس به سر کار می‌روم.' },
  { id: 'c1', cs: 1, s: 'Sie kommt ___ ___ Schule.', prepAns: 'aus', artAns: 'der', ans: 'aus der', n: 'die Schule', c: 'Dativ (aus)', r: 'aus ← همیشه Dativ؛ die Schule ← der', fa: 'او از مدرسه می‌آید.', ex: 'Sie kommt aus der Schule.', exFa: 'او از مدرسه می‌آید.' },
  { id: 'c2', cs: 1, s: 'Wir gehen ___ ___ Arzt.', prepAns: 'zu', artAns: 'dem', ans: 'zu dem', n: 'der Arzt', c: 'Dativ (zu)', r: 'zu ← همیشه Dativ؛ der Arzt ← dem (zum)', fa: 'ما پیش دکتر می‌رویم.', ex: 'Wir gehen zu dem Arzt.', exFa: 'ما پیش دکتر می‌رویم.' },
  { id: 'c3', cs: 1, s: 'Er wohnt ___ ___ Eltern.', prepAns: 'bei', artAns: 'den', ans: 'bei den', n: 'die Eltern (جمع)', c: 'Dativ (bei)', r: 'bei ← همیشه Dativ؛ جمع در Dativ: den', fa: 'او نزد والدینش زندگی می‌کند.', ex: 'Er wohnt bei den Eltern.', exFa: 'او نزد والدینش زندگی می‌کند.' },
  { id: 'c4', cs: 1, s: 'Das Geschenk ist ___ ___ Mutter.', prepAns: 'für', artAns: 'die', ans: 'für die', n: 'die Mutter', c: 'Akkusativ (für)', r: 'für ← همیشه Akkusativ؛ die Mutter ← die', fa: 'این هدیه برای مادر است.', ex: 'Das Geschenk ist für die Mutter.', exFa: 'این هدیه برای مادر است.' },
  { id: 'c5', cs: 1, s: 'Ich gehe ___ ___ Hund spazieren.', prepAns: 'ohne', artAns: 'den', ans: 'ohne den', n: 'der Hund', c: 'Akkusativ (ohne)', r: 'ohne ← همیشه Akkusativ؛ der Hund ← den', fa: 'من بدون سگ قدم می‌زنم.', ex: 'Ich gehe ohne den Hund spazieren.', exFa: 'من بدون سگ قدم می‌زنم.' },
  { id: 'c6', cs: 1, s: 'Wir laufen ___ ___ Park.', prepAns: 'durch', artAns: 'den', ans: 'durch den', n: 'der Park', c: 'Akkusativ (durch)', r: 'durch ← همیشه Akkusativ؛ der Park ← den', fa: 'ما از میان پارک می‌دویم.', ex: 'Wir laufen durch den Park.', exFa: 'ما از میان پارک می‌دویم.' },
  { id: 'c7', cs: 1, s: 'Sie sitzen ___ ___ Tisch.', prepAns: 'um', artAns: 'den', ans: 'um den', n: 'der Tisch', c: 'Akkusativ (um)', r: 'um ← همیشه Akkusativ؛ der Tisch ← den', fa: 'آن‌ها دور میز نشسته‌اند.', ex: 'Sie sitzen um den Tisch.', exFa: 'آن‌ها دور میز نشسته‌اند.' },
  { id: 'c8', cs: 1, s: 'Das Buch liegt ___ ___ Tisch.', prepAns: 'auf', artAns: 'dem', ans: 'auf dem', n: 'der Tisch', c: 'Dativ (مکان wo?)', r: 'auf (حالت سکون/مکان wo?) ← Dativ؛ der Tisch ← dem', fa: 'کتاب روی میز است.', ex: 'Das Buch liegt auf dem Tisch.', exFa: 'کتاب روی میز است.' },
  { id: 'c9', cs: 1, s: 'Ich lege das Buch ___ ___ Tisch.', prepAns: 'auf', artAns: 'den', ans: 'auf den', n: 'der Tisch', c: 'Akkusativ (جهت حرکت wohin?)', r: 'auf (جهت حرکت wohin?) ← Akkusativ؛ der Tisch ← den', fa: 'کتاب را روی میز می‌گذارم.', ex: 'Ich lege das Buch auf den Tisch.', exFa: 'کتاب را روی میز می‌گذارم.' },
  { id: 'c10', cs: 1, s: 'Wir sind ___ ___ Küche.', prepAns: 'in', artAns: 'der', ans: 'in der', n: 'die Küche', c: 'Dativ (مکان wo?)', r: 'in (حالت سکون/مکان wo?) ← Dativ؛ die Küche ← der', fa: 'ما در آشپزخانه‌ایم.', ex: 'Wir sind in der Küche.', exFa: 'ما در آشپزخانه‌ایم.' },
  { id: 'c11', cs: 1, s: 'Sie geht ___ ___ Küche.', prepAns: 'in', artAns: 'die', ans: 'in die', n: 'die Küche', c: 'Akkusativ (جهت حرکت wohin?)', r: 'in (جهت حرکت wohin?) ← Akkusativ؛ die Küche ← die', fa: 'او به آشپزخانه می‌رود.', ex: 'Sie geht in die Küche.', exFa: 'او به آشپزخانه می‌رود.' },
  { id: 'c12', cs: 1, s: 'Ich warte ___ ___ Bus.', prepAns: 'auf', artAns: 'den', ans: 'auf den', n: 'der Bus (warten)', c: 'Akkusativ (warten auf)', r: 'warten auf + Akkusativ؛ der Bus ← den', fa: 'منتظر اتوبوس هستم.', ex: 'Ich warte auf den Bus.', exFa: 'منتظر اتوبوس هستم.' },
  { id: 'c13', cs: 1, s: 'Er interessiert sich ___ ___ Musik.', prepAns: 'für', artAns: 'die', ans: 'für die', n: 'die Musik (sich interessieren)', c: 'Akkusativ (sich interessieren für)', r: 'sich interessieren für + Akkusativ؛ die Musik ← die', fa: 'او به موسیقی علاقه دارد.', ex: 'Er interessiert sich für Musik.', exFa: 'او به موسیقی علاقه دارد.' },
  { id: 'c14', cs: 1, s: 'Wir sprechen ___ ___ Lehrer.', prepAns: 'mit', artAns: 'dem', ans: 'mit dem', n: 'der Lehrer (sprechen)', c: 'Dativ (sprechen mit)', r: 'sprechen mit + Dativ؛ der Lehrer ← dem', fa: 'ما با معلم صحبت می‌کنیم.', ex: 'Wir sprechen mit dem Lehrer.', exFa: 'ما با معلم صحبت می‌کنیم.' },
  { id: 'c15', cs: 1, s: 'Sie träumt ___ ___ Haus.', prepAns: 'von', artAns: 'dem', ans: 'von dem', n: 'das Haus (träumen)', c: 'Dativ (träumen von)', r: 'träumen von + Dativ؛ das Haus ← dem (vom)', fa: 'او رؤیای یک خانه را می‌بیند.', ex: 'Sie träumt von dem Haus.', exFa: 'او رؤیای یک خانه را می‌بیند.' },
  { id: 'c16', cs: 1, s: 'Ich freue mich ___ ___ Wochenende.', prepAns: 'auf', artAns: 'das', ans: 'auf das', n: 'das Wochenende (sich freuen)', c: 'Akkusativ (sich freuen auf)', r: 'sich freuen auf + Akkusativ؛ das Wochenende ← das', fa: 'منتظر آخر هفته‌ام.', ex: 'Ich freue mich auf das Wochenende.', exFa: 'منتظر آخر هفته‌ام.' },
  { id: 'c17', cs: 1, s: 'Er denkt oft ___ ___ Familie.', prepAns: 'an', artAns: 'die', ans: 'an die', n: 'die Familie (denken)', c: 'Akkusativ (denken an)', r: 'denken an + Akkusativ؛ die Familie ← die', fa: 'او اغلب به خانواده‌اش فکر می‌کند.', ex: 'Er denkt oft an seine Familie.', exFa: 'او اغلب به خانواده‌اش فکر می‌کند.' }
];

