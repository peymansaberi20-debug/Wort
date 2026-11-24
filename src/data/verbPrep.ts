/** Verben mit Präpositionen: verb | preposition | case (A = Akkusativ, D = Dativ) | Persian | example (preposition appears as its own word). */
import { splitConj, stripHeadAnnotation } from '../utils/conjugation';

export interface VP { id: string; verb: string; prep: string; kase: 'A' | 'D'; fa: string; ex: string; custom?: boolean; lvl?: string }

export const PREPS = ['an', 'auf', 'aus', 'bei', 'für', 'gegen', 'in', 'mit', 'nach', 'über', 'um', 'von', 'vor', 'zu'];

const RAW = `
denken|an|A|فکر کردن به|Ich denke oft an meine Familie.
glauben|an|A|باور داشتن به|Er glaubt an das Gute im Menschen.
sich erinnern|an|A|به یاد آوردن|Ich erinnere mich gern an unseren Urlaub.
sich gewöhnen|an|A|عادت کردن به|Ich gewöhne mich langsam an das Wetter.
sich wenden|an|A|مراجعه کردن به|Wenden Sie sich bitte an den Kundenservice.
schreiben|an|A|نوشتن برای (نامه)|Ich schreibe einen Brief an meinen Freund.
sich halten|an|A|پایبند بودن به|Bitte halten Sie sich an die Regeln.
teilnehmen|an|D|شرکت کردن در|Ich nehme an einem Deutschkurs teil.
arbeiten|an|D|کار کردن روی|Er arbeitet an seiner Doktorarbeit.
zweifeln|an|D|شک داشتن به|Ich zweifle an seiner Ehrlichkeit.
sich beteiligen|an|D|مشارکت کردن در|Alle beteiligen sich an dem Projekt.
leiden|an|D|مبتلا بودن به (بیماری)|Sie leidet an einer Allergie.
sterben|an|D|مردن از (بیماری)|Er ist an einer Grippe gestorben.
liegen|an|D|ناشی بودن از|Es liegt an dem schlechten Wetter.
warten|auf|A|منتظر بودن|Ich warte auf den Bus.
sich freuen|auf|A|مشتاقانه منتظر بودن (آینده)|Ich freue mich auf den Urlaub.
hoffen|auf|A|امید داشتن به|Wir hoffen auf besseres Wetter.
sich verlassen|auf|A|تکیه/اعتماد کردن به|Du kannst dich auf mich verlassen.
achten|auf|A|توجه کردن به|Bitte achte auf die Kinder.
aufpassen|auf|A|مراقب بودن|Er passt auf den Hund auf.
antworten|auf|A|پاسخ دادن به|Ich antworte auf deine E-Mail.
reagieren|auf|A|واکنش نشان دادن به|Wie hat sie auf die Nachricht reagiert?
ankommen|auf|A|بستگی داشتن به|Es kommt auf den Preis an.
verzichten|auf|A|صرف‌نظر کردن از|Ich verzichte auf den Nachtisch.
sich konzentrieren|auf|A|تمرکز کردن روی|Ich muss mich auf die Prüfung konzentrieren.
sich vorbereiten|auf|A|آماده شدن برای|Sie bereitet sich auf das Interview vor.
sich beziehen|auf|A|اشاره/ارجاع دادن به|Ich beziehe mich auf Ihre E-Mail.
stolz sein|auf|A|افتخار کردن به|Ich bin stolz auf meine Tochter.
Lust haben|auf|A|میل داشتن به|Ich habe Lust auf ein Eis.
angewiesen sein|auf|A|وابسته بودن به|Er ist auf Hilfe angewiesen.
bestehen|auf|D|اصرار کردن بر|Er besteht auf seinem Recht.
beruhen|auf|D|مبتنی بودن بر|Das beruht auf einem Missverständnis.
bestehen|aus|D|تشکیل شدن از|Das Team besteht aus fünf Personen.
stammen|aus|D|اهل ... بودن|Sie stammt aus dem Iran.
folgen|aus|D|نتیجه شدن از|Was folgt aus diesem Ergebnis?
sich bedanken|bei|D|تشکر کردن از (شخص)|Ich bedanke mich bei meinen Kollegen.
sich entschuldigen|bei|D|عذرخواهی کردن از (شخص)|Ich entschuldige mich bei dir.
helfen|bei|D|کمک کردن در|Er hilft mir bei den Hausaufgaben.
sich beschweren|bei|D|شکایت کردن نزد (شخص)|Sie beschwert sich bei dem Chef.
sich bewerben|bei|D|درخواست دادن نزد (شرکت)|Ich bewerbe mich bei einer Bank.
bleiben|bei|D|پای ... ماندن|Wir bleiben bei unserer Meinung.
zusehen|bei|D|تماشا کردن هنگام کار|Ich sehe dir bei der Arbeit zu.
sich interessieren|für|A|علاقه داشتن به|Ich interessiere mich für Geschichte.
sich entscheiden|für|A|انتخاب کردن|Wir entscheiden uns für das rote Auto.
danken|für|A|تشکر کردن برای|Ich danke dir für deine Hilfe.
sich bedanken|für|A|تشکر کردن برای|Ich bedanke mich für das Geschenk.
sorgen|für|A|مراقب/متکفل بودن|Sie sorgt für die Kinder.
sich entschuldigen|für|A|عذرخواهی برای|Ich entschuldige mich für die Verspätung.
halten|für|A|دانستن / پنداشتن|Ich halte das für eine gute Idee.
sich eignen|für|A|مناسب بودن برای|Dieses Buch eignet sich für Anfänger.
sich einsetzen|für|A|تلاش کردن برای|Er setzt sich für den Umweltschutz ein.
verantwortlich sein|für|A|مسئول بودن برای|Ich bin für die Buchhaltung verantwortlich.
dankbar sein|für|A|سپاسگزار بودن برای|Ich bin dir für alles dankbar.
gelten|für|A|مصداق داشتن برای|Diese Regel gilt für alle.
kämpfen|gegen|A|مبارزه کردن با|Sie kämpfen gegen die Armut.
protestieren|gegen|A|اعتراض کردن به|Die Leute protestieren gegen den Plan.
sich wehren|gegen|A|مقاومت کردن در برابر|Man muss sich gegen Unrecht wehren.
verstoßen|gegen|A|تخطی کردن از|Er hat gegen das Gesetz verstoßen.
stimmen|gegen|A|رأی دادن علیه|Ich stimme gegen den Vorschlag.
etwas haben|gegen|A|ایراد/مخالفت داشتن|Hast du etwas gegen meinen Plan?
sich verlieben|in|A|عاشق شدن در|Er hat sich in sie verliebt.
sich einmischen|in|A|دخالت کردن در|Misch dich nicht in meine Sachen ein.
investieren|in|A|سرمایه‌گذاری کردن در|Die Firma investiert in neue Maschinen.
sich irren|in|D|اشتباه کردن در|Ich habe mich in der Zeit geirrt.
sich täuschen|in|D|اشتباه کردن دربارهٔ (شخص)|Ich habe mich in ihm getäuscht.
sprechen|mit|D|صحبت کردن با|Ich spreche mit meinem Chef.
anfangen|mit|D|شروع کردن با|Wir fangen mit dem Unterricht an.
aufhören|mit|D|دست کشیدن از|Er hört mit dem Rauchen auf.
rechnen|mit|D|انتظار داشتن / حساب کردن روی|Wir rechnen mit viel Verkehr.
sich beschäftigen|mit|D|مشغول بودن با|Sie beschäftigt sich mit Grammatik.
telefonieren|mit|D|تلفنی صحبت کردن با|Ich telefoniere mit meiner Mutter.
zufrieden sein|mit|D|راضی بودن از|Ich bin mit dem Ergebnis zufrieden.
einverstanden sein|mit|D|موافق بودن با|Sind Sie mit dem Vorschlag einverstanden?
sich treffen|mit|D|دیدار کردن با|Ich treffe mich mit Freunden.
sich unterhalten|mit|D|گپ زدن با|Wir unterhalten uns mit den Nachbarn.
zusammenarbeiten|mit|D|همکاری کردن با|Die Firma arbeitet mit einem Partner zusammen.
sich auseinandersetzen|mit|D|به‌طور جدی پرداختن به|Ich setze mich mit dem Thema auseinander.
umgehen|mit|D|برخورد کردن با|Er geht gut mit Kindern um.
vergleichen|mit|D|مقایسه کردن با|Man kann Wien nicht mit Berlin vergleichen.
sich verabreden|mit|D|قرار گذاشتن با|Ich verabrede mich mit einer Kollegin.
fragen|nach|D|پرسیدن دربارهٔ|Ich frage nach dem Weg.
sich erkundigen|nach|D|جویا شدن|Er erkundigt sich nach dem Preis.
suchen|nach|D|جستجو کردن برای|Wir suchen nach einer Lösung.
riechen|nach|D|بوی ... دادن|Es riecht nach Kaffee.
schmecken|nach|D|طعم ... دادن|Die Suppe schmeckt nach Knoblauch.
sich sehnen|nach|D|دلتنگ/مشتاق بودن|Sie sehnt sich nach Ruhe.
streben|nach|D|کوشیدن برای|Er strebt nach Erfolg.
sich richten|nach|D|تابع ... بودن|Wir richten uns nach dem Fahrplan.
sich freuen|über|A|خوشحال بودن از (اکنون/گذشته)|Ich freue mich über das Geschenk.
sich ärgern|über|A|عصبانی بودن از|Ich ärgere mich über den Lärm.
sich beschweren|über|A|شکایت کردن از|Er beschwert sich über das Essen.
sprechen|über|A|صحبت کردن دربارهٔ|Wir sprechen über das Wetter.
nachdenken|über|A|فکر کردن دربارهٔ|Ich denke über deinen Vorschlag nach.
diskutieren|über|A|بحث کردن دربارهٔ|Sie diskutieren über Politik.
sich wundern|über|A|تعجب کردن از|Ich wundere mich über seine Antwort.
lachen|über|A|خندیدن به|Alle lachen über den Witz.
informieren|über|A|اطلاع دادن دربارهٔ|Der Lehrer informiert uns über die Prüfung.
berichten|über|A|گزارش دادن دربارهٔ|Die Zeitung berichtet über den Unfall.
sich aufregen|über|A|ناراحت/عصبانی شدن از|Reg dich nicht über Kleinigkeiten auf.
verfügen|über|A|در اختیار داشتن|Das Hotel verfügt über einen Pool.
sich streiten|über|A|دعوا کردن بر سر|Sie streiten sich über Geld.
sich kümmern|um|A|رسیدگی کردن به|Ich kümmere mich um den Papierkram.
bitten|um|A|درخواست کردن|Ich bitte dich um Hilfe.
sich bewerben|um|A|درخواست دادن برای (شغل)|Er bewirbt sich um eine Stelle.
sich sorgen|um|A|نگران بودن دربارهٔ|Ich sorge mich um meine Mutter.
es geht|um|A|موضوع ... است|Es geht um die Miete.
es handelt sich|um|A|مربوط بودن به|Es handelt sich um einen Irrtum.
kämpfen|um|A|جنگیدن برای به دست آوردن|Sie kämpfen um den Sieg.
sich bemühen|um|A|تلاش کردن برای|Er bemüht sich um eine Wohnung.
trauern|um|A|سوگواری برای|Sie trauert um ihren Vater.
träumen|von|D|رؤیا دیدن از|Sie träumt von einem Haus am Meer.
erzählen|von|D|تعریف کردن از|Er erzählt von seiner Reise.
halten|von|D|نظر داشتن دربارهٔ|Was hältst du von dem Plan?
abhängen|von|D|بستگی داشتن به|Das hängt von deiner Entscheidung ab.
sich erholen|von|D|بهبود یافتن از|Ich erhole mich von der Arbeit.
handeln|von|D|دربارهٔ ... بودن (کتاب/فیلم)|Der Film handelt von einer Familie.
sich trennen|von|D|جدا شدن از|Sie hat sich von ihrem Freund getrennt.
leben|von|D|زندگی کردن از (درآمد)|Er lebt von seinem Gehalt.
sich verabschieden|von|D|خداحافظی کردن از|Ich verabschiede mich von meinen Gästen.
überzeugen|von|D|متقاعد کردن به|Er überzeugt mich von seiner Idee.
ausgehen|von|D|فرض کردن / ناشی شدن از|Ich gehe von diesen Zahlen aus.
sich fürchten|vor|D|ترسیدن از|Das Kind fürchtet sich vor Hunden.
Angst haben|vor|D|ترس داشتن از|Ich habe Angst vor der Prüfung.
warnen|vor|D|هشدار دادن نسبت به|Ich warne dich vor dem Hund.
sich schützen|vor|D|محافظت شدن از|Man schützt sich vor Kälte.
flüchten|vor|D|گریختن از|Sie flüchten vor dem Krieg.
Respekt haben|vor|D|احترام داشتن به|Ich habe Respekt vor dir.
gehören|zu|D|جزو ... بودن|Er gehört zu meinen besten Freunden.
einladen|zu|D|دعوت کردن به|Ich lade dich zu meiner Party ein.
führen|zu|D|منجر شدن به|Das führt zu Problemen.
beitragen|zu|D|سهم داشتن در|Alle tragen zu diesem Erfolg bei.
passen|zu|D|مناسب بودن با|Die Jacke passt gut zu deiner Hose.
gratulieren|zu|D|تبریک گفتن به مناسبت|Ich gratuliere dir zu deinem Geburtstag.
neigen|zu|D|تمایل داشتن به|Er neigt zu Übertreibungen.
raten|zu|D|توصیه کردن به|Der Arzt rät zu mehr Bewegung.
sich entschließen|zu|D|تصمیم گرفتن به|Ich habe mich zu einem Umzug entschlossen.
zwingen|zu|D|مجبور کردن به|Niemand kann dich zu etwas zwingen.
`;

export const makeId = (verb: string, prep: string) => `${verb}|${prep}`;
export const parseVP = (raw: string, custom = false): VP[] =>
  raw.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const [verb, prep, k, fa, ex] = l.split('|').map(x => (x || '').trim());
    if (!verb || !prep || (k !== 'A' && k !== 'D') || !ex) return null;
    return { id: makeId(verb, prep), verb, prep: prep.toLowerCase(), kase: k as 'A' | 'D', fa, ex, custom } as VP;
  }).filter((x): x is VP => !!x);

export const VERB_PREPS: VP[] = parseVP(RAW);

/* ============================================================
 * درخواست فاز ۴: حرف اضافهٔ خودکار فعل در نمایش اصلی واژه
 * واژهٔ فعل با هر منبعی اضافه/ویرایش شود، اگر در این دیتاست
 * (یا فهرست سفارشی کاربر در VerbPrep) باشد، حرف اضافه و حالت
 * دستوری‌اش کنار خودش نمایش داده می‌شود: warten auf (A)
 * ============================================================ */

const CUSTOM_KEY = 'wb_vprep_custom';
const loadCustom = (): VP[] => {
  try {
    const v = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]');
    return Array.isArray(v) ? v.filter(x => x && x.verb && x.prep) : [];
  } catch { return []; }
};

/** همهٔ فعل+حرف اضافه‌ها: دیتاست پایه + فهرست سفارشی کاربر */
export const allVerbPreps = (): VP[] => [...VERB_PREPS, ...loadCustom()];

/** جداکردن «sich » از ابتدای فعل برای تطبیق */
export const baseVerb = (v: string): string => (v || '').trim().replace(/^sich\s+/i, '').toLowerCase();

const INDEX = () => {
  const m = new Map<string, VP>();
  for (const vp of allVerbPreps()) {
    m.set(vp.verb.trim().toLowerCase(), vp);          // با sich
    m.set(baseVerb(vp.verb), vp);                      // بدون sich
  }
  return m;
};

/** VP از خودِ سرِ پسونددار فعل («sich sträuben gegen +A»، «gedeihen +D») — وقتی دیتاست جواب نمی‌دهد */
const vpFromHead = (de: string): VP | null => {
  const m = /^(.+?)\s*\+\s*([ad])\b\.?\s*$/i.exec((de || '').trim());
  if (!m) return null;
  const words = m[1].trim().split(/\s+/);
  const last = (words[words.length - 1] || '').toLowerCase();
  const hasPrep = words.length > 1 && isPrepToken(last);
  const verb = hasPrep ? words.slice(0, -1).join(' ') : m[1].trim();
  if (!verb) return null;
  const prep = hasPrep ? last : '';
  return { id: makeId(verb, prep), verb, prep, kase: m[2].toUpperCase() as 'A' | 'D', fa: '', ex: '' };
};

/** فعل+حرف اضافهٔ متناظر با این واژه (تطبیق مستقیم، بدون sich، یا با سرِ پسونددار «warten auf +A»)؛ بی‌نتیجه = null */
export const verbPrepOf = (de: string): VP | null => {
  const t = (de || '').trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  const idx = INDEX();
  const direct = idx.get(lower) || idx.get(baseVerb(lower));
  if (direct) return direct;
  // سرِ پسونددار (warten auf +A / sich entschließen zu +D): بعد از برهنه‌سازی دوباره تطبیق بده
  const bare = stripHeadAnnotation(t).trim().toLowerCase();
  if (bare && bare !== lower) {
    const hit = idx.get(bare) || idx.get(baseVerb(bare));
    if (hit) return hit;
  }
  // فعل خارج از دیتاست که سرِ پسونددار دارد — خود سر واژه را بخوان
  return vpFromHead(t);
};

const vowel = (p: string) => /^[aeiouäöü]/i.test(p);
export const woForm = (p: string) => 'wo' + (vowel(p) ? 'r' : '') + p;   // woran, worauf, wofür …
export const daForm = (p: string) => 'da' + (vowel(p) ? 'r' : '') + p;   // daran, darauf, dafür …
const stripP = (t: string) => t.replace(/^[„"“'(]+|[.,!?;:"“”')]+$/g, '');
/** Splits the example around the first word equal to the preposition. */
export const splitEx = (ex: string, prep: string): [string, string, string] | null => {
  const toks = ex.split(' ');
  const i = toks.findIndex(t => stripP(t).toLowerCase() === prep);
  if (i < 0) return null;
  const core = toks[i]; const m = core.match(/^([„"“'(]*)(.*?)([.,!?;:"“”')]*)$/);
  return [toks.slice(0, i).concat(m ? m[1] : '').join(' ').replace(/\s+$/, i > 0 ? ' ' : ''), m ? m[2] : core, (m ? m[3] : '') + (i < toks.length - 1 ? ' ' : '') + toks.slice(i + 1).join(' ')];
};
export const blankEx = (ex: string, prep: string): string => { const p = splitEx(ex, prep); return p ? `${p[0]}${p[0] && !p[0].endsWith(' ') ? ' ' : ''}____${p[2]}` : ex; };

/** CEFR level of a verb: A1–A2 / B1 (default) / B2 / C1. User-added verbs carry their own level in `lvl`. */
export const LEVELS = ['A1–A2', 'B1', 'B2', 'C1'];
const ids = (s: string) => new Set(s.split(',').map(x => x.trim()));
const L_A2 = ids('denken|an, schreiben|an, arbeiten|an, teilnehmen|an, warten|auf, sich freuen|auf, antworten|auf, aufpassen|auf, Lust haben|auf, stammen|aus, sich bedanken|bei, sich entschuldigen|bei, helfen|bei, bleiben|bei, sich interessieren|für, danken|für, sich bedanken|für, sprechen|mit, anfangen|mit, aufhören|mit, telefonieren|mit, sich treffen|mit, sich verabreden|mit, fragen|nach, suchen|nach, riechen|nach, schmecken|nach, sprechen|über, sich freuen|über, lachen|über, bitten|um, sich kümmern|um, träumen|von, erzählen|von, sich verabschieden|von, Angst haben|vor, einladen|zu, gehören|zu, gratulieren|zu');
const L_B2 = ids('leiden|an, zweifeln|an, sich beteiligen|an, liegen|an, sterben|an, angewiesen sein|auf, sich beziehen|auf, verzichten|auf, sich eignen|für, sich einsetzen|für, gelten|für, sich wehren|gegen, stimmen|gegen, etwas haben|gegen, investieren|in, umgehen|mit, ausgehen|von, überzeugen|von, sich richten|nach, sich streiten|über, kämpfen|um, raten|zu, sich entschließen|zu, zwingen|zu, beitragen|zu, flüchten|vor, Respekt haben|vor, sich schützen|vor');
const L_C1 = ids('beruhen|auf, bestehen|auf, verfügen|über, verstoßen|gegen, streben|nach, neigen|zu, sich auseinandersetzen|mit, folgen|aus, sich einmischen|in, sich täuschen|in, sich irren|in, trauern|um, sich bemühen|um');
export const levelOf = (v: VP): string => v.lvl || (L_A2.has(v.id) ? 'A1–A2' : L_C1.has(v.id) ? 'C1' : L_B2.has(v.id) ? 'B2' : 'B1');

/* ============================================================
 * درخواست کاربر — سرِ واژهٔ فعل با sich + حرف اضافه + حالت دستوری:
 * پس از هر مسیر «تکمیل» (تکی، گروهی، عکس، مقایسه، Excel) سرِ واژهٔ فعل
 * باید حرف ربط و حالت دستوری‌اش را خودش نشان بدهد:
 *   warten          → warten auf +A
 *   sich freuen     → sich freuen auf +A
 *   helfen (+ DAT)  → helfen +D
 * منابع به ترتیب اولویت:
 *   ۱) فهرست سفارشی کاربر در تب VerbPrep (localStorage)
 *   ۲) دیتاست پایهٔ Verben mit Präpositionen
 *   ۳) خط «ساختار:» در notes که هوش مصنوعی می‌نویسد (مثلاً «warten auf + AKK» یا «helfen + DAT»)
 * تابع idempotent است: واژهٔ از قبل پسونددار دست‌نخورده می‌ماند و فقط فعل‌ها پسوند می‌گیرند.
 * ============================================================ */

export { stripHeadAnnotation };

export type PrepCaseLabel = 'A' | 'D' | 'G';

const CASE_OF: Record<string, PrepCaseLabel> = {
  a: 'A', akk: 'A', akkusativ: 'A', acc: 'A', accusative: 'A',
  d: 'D', dat: 'D', dativ: 'D', dative: 'D',
  g: 'G', gen: 'G', genitiv: 'G', genitive: 'G'
};

const ANNOT_RE = /\+\s*(?:akk|akkusativ|acc|accusative|dat|dativ|dative|gen|genitiv|genitive|a|d|g)\b/i;

/** آیا سرِ واژه پسوند حالت دستوری دارد («warten auf +A»)؟ — این پسوند فقط به فعل‌ها داده می‌شود */
export const hasHeadAnnotation = (de: string): boolean => ANNOT_RE.test(String(de || '').trim());

/** حرف اضافه‌های رایج‌تر خارج از PREPS (برای خواندن خط «ساختار») */
const EXTRA_PREPS = new Set([
  'ohne', 'durch', 'seit', 'gegenüber', 'gegenueber', 'außer', 'ausser', 'trotz',
  'während', 'waehrend', 'ab', 'binnen', 'innerhalb', 'wegen', 'entlang', 'dank', 'laut', 'zufolge'
]);

const isPrepToken = (t: string): boolean => PREPS.includes(t) || EXTRA_PREPS.has(t);

export interface HeadAnnotationInput {
  pos?: string;   // برچسب نقش (فعل/Verb = فعل)
  art?: string;   // آرتیکل → اسم است
  conj?: string;  // جدول صرف — برای تشخیص فعل بازتابی
  notes?: string; // نکته‌ها — خط «ساختار:»
}

/** آیا این سرِ واژه یک فعل است؟ pos معتبر ملاک است؛ بدون pos شکل مصدر بررسی می‌شود */
export function isVerbHead(de: string, opts: HeadAnnotationInput = {}): boolean {
  const p = String(opts.pos || '').trim().toLowerCase();
  if (p) return p === 'فعل' || p === 'verb';
  if (String(opts.art || '').trim()) return false;
  return /^[a-zäöüß]{2,}(?:eln|ern|en)$/i.test((de || '').trim());
}

/** دیتاست (سفارشی کاربر اول، بعد پایه) جفت حرف اضافه/حالت این فعل را دارد؟ */
function datasetPrepCase(base: string): { prep: string; kase: 'A' | 'D' } | null {
  const t = (base || '').trim().toLowerCase();
  if (!t) return null;
  for (const vp of [...loadCustom(), ...VERB_PREPS]) {
    if (baseVerb(vp.verb) === t) return { prep: vp.prep, kase: vp.kase };
  }
  return null;
}

/** دیتاست این فعل را بازتابی ثبت کرده؟ (مثل sich freuen) */
function datasetHasReflexive(base: string): boolean {
  const t = (base || '').trim().toLowerCase();
  if (!t) return false;
  return allVerbPreps().some(vp => baseVerb(vp.verb) === t && /^sich\s+/i.test(vp.verb.trim()));
}

/** جدول صرف نشان می‌دهد فعل بازتابی است؟ (ضمیر بازتابی داخل شکل‌ها) */
function conjLooksReflexive(conj?: string): boolean {
  const forms = splitConj(String(conj || ''));
  return forms.some(f => /\s(mich|dich|sich|euch)\b/i.test(` ${String(f).trim()} `));
}

/** جفت حرف اضافه/حالت را از خط «ساختار:» notes بیرون می‌کشد (fallback وقتی دیتاست جواب نمی‌دهد) */
export function prepCaseFromNotes(notes?: string): { prep: string; kase: PrepCaseLabel } | null {
  const line = String(notes || '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .find(l => l.startsWith('ساختار') || /^(struktur|rektion)\b/i.test(l));
  if (!line) return null;
  // الگوی پرامت: «warten auf + AKK» | «helfen + DAT» | «sich freuen auf +A»
  const m1 = /([a-zäöüß]+)\s*\+\s*(akk|akkusativ|acc|accusative|dat|dativ|dative|gen|genitiv|genitive|a|d|g)\b/i.exec(line);
  if (m1) {
    const kase = CASE_OF[m1[2].toLowerCase()];
    if (!kase) return null;
    const tok = m1[1].toLowerCase();
    // واژهٔ پیش از + حرف اضافه است یا خود فعل (helfen + DAT → فقط حالت)
    return isPrepToken(tok) ? { prep: tok, kase } : { prep: '', kase };
  }
  // الگوی جایگزین: «warten auf (AKK)» — فقط وقتی واژهٔ پیش از پرانتز حرف اضافه است
  const m2 = /([a-zäöüß]+)\s*\((akk|akkusativ|acc|dat|dativ|gen|genitiv)\)/i.exec(line);
  if (m2) {
    const kase = CASE_OF[m2[2].toLowerCase()];
    const tok = m2[1].toLowerCase();
    return kase && isPrepToken(tok) ? { prep: tok, kase } : null;
  }
  return null;
}

/**
 * سرِ واژهٔ کامل فعل: [sich ]فعل[ حرف اضافه][ +حالت]
 * غیرفعل‌ها و واژه‌های بی‌داده دست‌نخورده برمی‌گردند؛ هرگز داده‌ای از خودش نمی‌سازد.
 */
export function annotatedHeadword(de: string, opts: HeadAnnotationInput = {}): string {
  const raw = String(de || '').trim().replace(/\s+/g, ' ');
  if (!raw) return raw;
  if (ANNOT_RE.test(raw)) return raw; // از قبل پسوند دارد — دست نمی‌زنیم
  if (!isVerbHead(raw, opts)) return raw;
  const base = raw.replace(/^sich\s+/i, '').trim();
  if (!base) return raw;
  const refl = /^sich\s+/i.test(raw) || datasetHasReflexive(base) || conjLooksReflexive(opts.conj);
  const fromDataset = datasetPrepCase(base);
  const fromNotes = fromDataset ? null : prepCaseFromNotes(opts.notes);
  const prep = fromDataset?.prep ?? fromNotes?.prep ?? '';
  const kase = fromDataset?.kase ?? fromNotes?.kase ?? null;
  if (!refl && !kase) return raw;
  const parts: string[] = [];
  if (refl) parts.push('sich');
  parts.push(base);
  if (prep) parts.push(prep);
  if (kase) parts.push('+' + kase);
  const out = parts.join(' ');
  return out === raw ? raw : out;
}

/** برهنه‌کردن پسوند و sich از سر واژه برای مقایسه: "sich freuen auf +A" → "freuen" */
export const bareHead = (de: string): string =>
  stripHeadAnnotation(String(de || '').trim())
    .replace(/^(der|die|das)\s+/i, '')
    .replace(/^sich\s+/i, '')
    .trim()
    .toLowerCase();
