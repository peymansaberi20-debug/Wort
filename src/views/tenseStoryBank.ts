/**
 * tenseStoryBank.ts — بانک داستان‌های تمرین «همهٔ زمان‌ها»
 * نشانه‌گذاری جای خالی داخل متن: {مصدر|پاسخ|kind}
 *   kind = fin (فعل اصلی صرف‌شده) | aux (فعل کمکی haben/sein/werden) | pp (Partizip II)
 * در داستان‌های ترکیبی (mix) زمانِ هر جای خالی بعد از kind می‌آید: {inf|ans|kind:prt}
 * یعنی: جملهٔ «Mit 16 Jahren {wollen|wollte|fin} Tim …» → جای خالی ۱ پاسخش «wollte» است.
 */

import { Band, Tense } from './tenseStoryData';

export interface Story {
  id: string;
  title: string;
  titleFa: string;
  band: Band;
  ts: Tense;
  text: string;
}

export const STORIES: Story[] = [
  // ═══════════ Präsens ═══════════
  {
    id: 'prs-a1', title: 'Ein normaler Tag', titleFa: 'یک روز معمولی', band: 'A', ts: 'prs',
    text: 'Jeden Morgen {trinken|trinke|fin} ich Kaffee und {essen|esse|fin} ein Brötchen. Um acht Uhr {nehmen|nehme|fin} ich den Bus zur Schule. Dort {sprechen|sprechen|fin} wir viel Deutsch. Am Nachmittag {spielen|spielen|fin} wir Fußball im Park. Am Abend {hören|hört|fin} meine Schwester Musik und ich {lesen|lese|fin} ein Buch. Um zehn Uhr {gehen|gehe|fin} ich ins Bett.'
  },
  {
    id: 'prs-a2', title: 'Samstag im Supermarkt', titleFa: 'شنبه در سوپرمارکت', band: 'A', ts: 'prs',
    text: 'Heute {sein|ist|fin} Samstag. Meine Mutter {fahren|fährt|fin} zum Supermarkt und ich {kommen|komme|fin} mit. Sie {kaufen|kauft|fin} Obst und Gemüse, ich {suchen|suche|fin} Saft und Käse. An der Kasse {stehen|steht|fin} eine lange Schlange. Wir {bezahlen|bezahlen|fin} zusammen und danach {gehen|gehen|fin} wir nach Hause.'
  },
  {
    id: 'prs-b1', title: 'Ein Praktikum in Hamburg', titleFa: 'کارآموزی در هامبورگ', band: 'B', ts: 'prs',
    text: 'Tom {wohnen|wohnt|fin} seit einem Monat in Hamburg. Er {machen|macht|fin} dort ein Praktikum in einer Werbeagentur. Jeden Morgen {fahren|fährt|fin} er mit dem Fahrrad ins Büro, weil er keinen Parkplatz {finden|findet|fin}. Seine Kolleginnen {erklären|erklären|fin} ihm die Aufgaben geduldig. Freitags {treffen|trifft|fin} sich das Team zu einem Meeting. Am Abend {schreiben|schreibt|fin} er seiner Familie eine E-Mail auf Deutsch.'
  },
  {
    id: 'prs-b2', title: 'Klimaschutz im Alltag', titleFa: 'حفاظت از محیط‌زیست در زندگی روزمره', band: 'B', ts: 'prs',
    text: 'Immer mehr Menschen {interessieren|interessieren|fin} sich für Klimaschutz. Viele junge Leute {sammeln|sammeln|fin} Plastikmüll im Park und am Fluss. Meine Nachbarin {kaufen|kauft|fin} nur regionale Produkte auf dem Markt. Sie {sagen|sagt|fin}: „Jeder kann etwas tun, auch ohne viel Geld.“ Deshalb {steigen|steigt|fin} die Zahl der Fahrräder in der Stadt ständig. Auch ich {versuchen|versuche|fin}, weniger Plastik zu benutzen. Das {kosten|kostet|fin} zwar Zeit, aber es {lohnen|lohnt|fin} sich.'
  },
  {
    id: 'prs-c1', title: 'Digitalisierung der Arbeitswelt', titleFa: 'دیجیتالی‌شدن دنیای کار', band: 'C', ts: 'prs',
    text: 'Die Digitalisierung {verändern|verändert|fin} die Arbeitswelt zusehends. Viele Unternehmen {setzen|setzen|fin} auf cloud-basierte Systeme und Automatisierung. Während manche Berufe {verschwinden|verschwinden|fin}, {entstehen|entstehen|fin} zugleich neue Berufsbilder. Wer über digitale Kompetenzen {verfügen|verfügt|fin}, {haben|hat|fin} klare Vorteile. Die Grenze zwischen Büro und Zuhause {verschmelzen|verschmilzt|fin} zunehmend. Kritiker {warnen|warnen|fin} jedoch vor ständiger Erreichbarkeit. Sie {betonen|betonen|fin}, dass die Work-Life-Balance oft {leiden|leidet|fin}.'
  },
  {
    id: 'prs-c2', title: 'Der Lärm der Großstadt', titleFa: 'شلوغیِ شهر بزرگ', band: 'C', ts: 'prs',
    text: 'Wer in einer Metropole {leben|lebt|fin}, {kennen|kennt|fin} den täglichen Lärm. Zwischen Terminen und Bahnsteig {verlieren|verliert|fin} manches Nervensystem seine Ruhe. Psychologen {empfehlen|empfehlen|fin} daher bewusste Pausen ohne Bildschirm. Ein Spaziergang im Grünen {wirken|wirkt|fin} oft Wunder. Wer {üben|übt|fin}, seinen Fokus zu schulen, {bleiben|bleibt|fin} auch im Trubel konzentriert. Letztlich {gelten|gilt|fin} der Satz: „Weniger ist mehr.“'
  },

  // ═══════════ Präteritum ═══════════
  {
    id: 'prt-a1', title: 'Der Schulausflug nach Wien', titleFa: 'اردوی مدرسه به وین', band: 'A', ts: 'prt',
    text: 'Mit unserer Klasse {sein|war|fin} ich letzten Mai in Wien. Wir {fahren|fuhren|fin} früh am Morgen mit dem Zug. Im Zug {singen|singen|fin} wir Lieder. In Wien {besuchen|besuchten|fin} wir zuerst Schloss Schönbrunn. Danach {gehen|gingen|fin} wir in ein Restaurant und {essen|aßen|fin} Wiener Schnitzel. Am Abend {sein|waren|fin} alle müde, aber glücklich.'
  },
  {
    id: 'prt-a2', title: 'Ein Tag am See', titleFa: 'یک روز کنار دریاچه', band: 'A', ts: 'prt',
    text: 'Gestern {sein|war|fin} ein schöner Sommertag. Wir {gehen|gingen|fin} an den See und {machen|machten|fin} ein Picknick. Mein Bruder {schwimmen|schwamm|fin} eine halbe Stunde im Wasser. Ich {lesen|las|fin} ein Buch unter einem Baum. Plötzlich {kommen|kam|fin} ein Hund und {nehmen|nahm|fin} unser Brot! Wir {lachen|lachten|fin} laut, und der Hund {laufen|lief|fin} schnell in den Wald.'
  },
  {
    id: 'prt-b1', title: 'Die Überraschungsparty', titleFa: 'مهمانی سورپرایز', band: 'B', ts: 'prt',
    text: 'Letzten Samstag {haben|hatte|fin} Lena Geburtstag. Ihre Freunde {wollen|wollten|fin} ihr eine Überraschungsparty geben. Am Nachmittag {schmücken|schmückten|fin} wir das Wohnzimmer mit Ballons. Lena {denken|dachte|fin} zunächst, dass niemand Zeit {haben|hatte|fin}. Als sie die Tür {öffnen|öffnete|fin}, {rufen|riefen|fin} alle: „Überraschung!“ Sie {sein|war|fin} überglücklich.'
  },
  {
    id: 'prt-b2', title: 'Das kaputte Fahrrad', titleFa: 'دوچرخهٔ خراب', band: 'B', ts: 'prt',
    text: 'Vor einem Jahr {kaufen|kaufte|fin} ich mir ein gebrauchtes Fahrrad. Es {kosten|kostete|fin} nur achtzig Euro. Zuerst {fahren|fuhr|fin} ich damit jeden Tag zur Arbeit. Eines Tages {brechen|brach|fin} die Kette. Ich {wissen|wusste|fin} mir keinen Rat. Ein Nachbar {sehen|sah|fin} mein Problem und {bringen|brachte|fin} Werkzeug mit. In zwanzig Minuten {sein|war|fin} alles wieder in Ordnung. Ich {danken|dankte|fin} ihm herzlich.'
  },
  {
    id: 'prt-c1', title: 'Die alte Postkarte', titleFa: 'کارت‌پستال قدیمی', band: 'C', ts: 'prt',
    text: 'Beim Aufräumen des Dachbodens {finden|fand|fin} ich eine sehr alte Postkarte. Auf ihr {stehen|stand|fin} eine Adresse in Dresden und ein kurzes Gedicht. Der Absender, ein junger Maler, {schreiben|schrieb|fin} von seiner großen Liebe. Er {erwähnen|erwähnte|fin}, dass er jeden Sonntag an die Elbe {gehen|ging|fin}. Neugierig geworden, {besuchen|besuchte|fin} ich das Stadtarchiv. Eine Mitarbeiterin {helfen|half|fin} mir geduldig bei der Suche. Nach zwei Wochen {erhalten|erhielt|fin} ich endlich Antwort: Die Malerin {leben|lebte|fin} bis 1968.'
  },
  {
    id: 'prt-c2', title: 'Die Rede des Bürgermeisters', titleFa: 'نطق شهردار', band: 'C', ts: 'prt',
    text: 'Am Jahrestag der Stadtbibliothek {halten|hielt|fin} der Bürgermeister eine bewegende Rede. Er {erinnern|erinnerte|fin} daran, wie die Bibliothek im Krieg fast ganz {verbrennen|verbrannte|fin}. Jahrzehnte später {wollen|wollte|fin} die Stadt sie neu aufbauen. Viele Bürger {spenden|spendeten|fin} Bücher und Geld. „Bücher {sein|waren|fin} unsere stille Hoffnung“, {sagen|sagte|fin} er. Am Ende {applaudieren|applaudierte|fin} das Publikum lange. Auch ich {fühlen|fühlte|fin} mich tief berührt.'
  },

  // ═══════════ Perfekt ═══════════
  {
    id: 'perf-a1', title: 'Das Wochenende von Anna', titleFa: 'آخر هفتهٔ آنا', band: 'A', ts: 'perf',
    text: 'Am Samstag habe ich lange {schlafen|geschlafen|pp}. Danach bin ich mit Freunden {schwimmen|geschwommen|pp}. Wir haben zusammen Pizza {essen|gegessen|pp}. Am Abend habe ich einen Film {sehen|gesehen|pp}. Am Sonntag bin ich zu meiner Oma {fahren|gefahren|pp}. Sie hat Kuchen {backen|gebacken|pp}. Dann habe ich meiner Mutter in der Küche {helfen|geholfen|pp}. Es hat mir viel Spaß gemacht.'
  },
  {
    id: 'perf-a2', title: 'Peters Reise nach Berlin', titleFa: 'سفر پتر به برلین', band: 'A', ts: 'perf',
    text: 'Letzten Monat bin ich nach Berlin {fahren|gefahren|pp}. Dort habe ich meine Tante {besuchen|besucht|pp}. Wir sind viel zu Fuß {gehen|gegangen|pp}. Im Museum habe ich alte Gemälde lange {betrachten|betrachtet|pp}. Am Abend hat meine Tante leckeres Essen {kochen|gekocht|pp}. Ich habe viele Fotos {machen|gemacht|pp}. Die Reise {gefallen|hat|aux} mir sehr gut gefallen. Nach drei Tagen habe ich den Zug nach Hause {nehmen|genommen|pp}.'
  },
  {
    id: 'perf-b1', title: 'Das Vorstellungsgespräch', titleFa: 'مصاحبهٔ استخدام', band: 'B', ts: 'perf',
    text: 'Gestern habe ich mich bei einer Firma {bewerben|beworben|pp}. Ich bin um acht Uhr aus dem Haus {gehen|gegangen|pp}. Der Zug hat leider zehn Minuten Verspätung {haben|gehabt|pp}. Deshalb bin ich fast zu spät {kommen|gekommen|pp}. Die Chefin hat mich freundlich {begrüßen|begrüßt|pp}. Wir haben zwanzig Minuten über meine Erfahrungen {sprechen|gesprochen|pp}. Dann hat sie mir viele Fragen {stellen|gestellt|pp}. Ich habe ehrlich {antworten|geantwortet|pp}. Am Ende hat sie mir die Stelle {anbieten|angeboten|pp}. Ich habe natürlich Ja {sagen|gesagt|pp}.'
  },
  {
    id: 'perf-b2', title: 'Das Konzert', titleFa: 'کنسرت', band: 'B', ts: 'perf',
    text: 'Am Freitagabend habe ich ein Konzert meiner Lieblingsband {besuchen|besucht|pp}. Meine Freundin hat die Tickets schon vor Wochen {kaufen|gekauft|pp}. Wir sind mit der S-Bahn ins Zentrum {fahren|gefahren|pp}. Vor der Halle haben wir lange {warten|gewartet|pp}. Die Band hat zwei Stunden {spielen|gespielt|pp}. Alle haben laut {singen|gesungen|pp}. Danach bin ich total müde, aber glücklich nach Hause {kommen|gekommen|pp}. Der Abend hat sich wirklich {lohnen|gelohnt|pp}.'
  },
  {
    id: 'perf-c1', title: 'Nach dem Unwetter', titleFa: 'بعد از توفان', band: 'C', ts: 'perf',
    text: 'In der Nacht hat ein schweres Unwetter die Region {überraschen|überrascht|pp}. Der Sturm hat mehrere alte Bäume {fällen|gefällt|pp}. Ein Fluss ist über die Ufer {treten|getreten|pp}. Viele Keller haben sich mit Wasser {füllen|gefüllt|pp}. Die Feuerwehr hat zwölf Stunden ohne Pause {arbeiten|gearbeitet|pp}. Glücklicherweise hat niemand großen Schaden {nehmen|genommen|pp}. Die Versicherung hat die Kosten {übernehmen|übernommen|pp}. Die Bewohner haben sich schnell {organisieren|organisiert|pp}. Bis Montag hat die Stadt ihren normalen Rhythmus wieder {finden|gefunden|pp}.'
  },
  {
    id: 'perf-c2', title: 'Der erste Monat im neuen Job', titleFa: 'ماه اول در شغل جدید', band: 'C', ts: 'perf',
    text: 'Seit Januar habe ich mich an die neue Routine {gewöhnen|gewöhnt|pp}. Mein Team hat mich herzlich {empfangen|empfangen|pp}. Ich habe die neuen Systeme schnell {begreifen|begriffen|pp}. Dabei haben mir die Kollegen vieles {erklären|erklärt|pp}. Zur Sicherheit habe ich alles schriftlich {dokumentieren|dokumentiert|pp}. Die erste Präsentation habe ich vor der Geschäftsleitung {halten|gehalten|pp}. Mein Chef hat sich danach positiv {äußern|geäußert|pp}. Insgesamt habe ich den Einstieg als sehr motivierend {empfinden|empfunden|pp}. Nun habe ich mir neue Ziele {setzen|gesetzt|pp}.'
  },

  // ═══════════ Plusquamperfekt ═══════════
  {
    id: 'pq-a1', title: 'Der verpasste Bus', titleFa: 'اتوبوسی که از دست رفت', band: 'A', ts: 'pq',
    text: 'Gestern {haben|hatte|aux} ich verschlafen. Als ich zur Haltestelle kam, {sein|war|aux} der Bus schon weggefahren. Ich {sein|war|aux} am Abend vorher zu spät ins Bett gegangen. Außerdem {haben|hatte|aux} ich den Wecker nicht gestellt. Am Ende {haben|hatte|aux} ich den nächsten Bus genommen. Unterwegs {haben|hatte|aux} ich eine Nachbarin getroffen. Sie {geben|hatte|aux} mir zum Glück ihre Zeitung gegeben. So war das Warten gar nicht lang.'
  },
  {
    id: 'pq-a2', title: 'Der Regenmorgen', titleFa: 'صبحِ بارانی', band: 'A', ts: 'pq',
    text: 'Am Morgen {haben|hatte|aux} es in Strömen geregnet. Bevor ich aus dem Haus ging, {haben|hatte|aux} ich meinen Regenmantel schon angezogen. Die Straße {haben|hatte|aux} wie ein Fluss ausgesehen. Ich {haben|hatte|aux} deshalb ein zweites Handtuch eingepackt. Als ich in der Schule ankam, {haben|hatte|aux} der Unterricht zum Glück noch nicht begonnen. Meine Lehrerin {haben|hatte|aux} nämlich auch verschlafen. Zum Schluss {sein|waren|aux} alle Schuhe nass gewesen.'
  },
  {
    id: 'pq-b1', title: 'Der Tippfehler im Bericht', titleFa: 'غلط تایپی در گزارش', band: 'B', ts: 'pq',
    text: 'Ich {haben|hatte|aux} den Bericht schon dreimal gelesen. Ich {sein|war|aux} mir ganz sicher. Eine Kollegin {haben|hatte|aux} mir am Vortag noch einen Fehler gezeigt. Ich {haben|hatte|aux} ihn sofort korrigiert. Nachdem ich die Datei gespeichert hatte, {haben|hatte|aux} ich sie an den Chef abgeschickt. Erst am nächsten Morgen {sein|war|aux} mir der kleine Tippfehler aufgefallen. Ich {sein|war|aux} rot geworden. Aber meine Chefin {haben|hatte|aux} zum Glück Humor gezeigt.'
  },
  {
    id: 'pq-b2', title: 'Die Verspätung', titleFa: 'تأخیر', band: 'B', ts: 'pq',
    text: 'Laura und ich {haben|hatten|aux} uns für 18 Uhr verabredet. Ich {sein|war|aux} pünktlich da gewesen. Sie {haben|hatte|aux} mir leider keine Nachricht geschickt. Nach 30 Minuten {sein|war|aux} sie endlich eingetroffen. Sie {haben|hatte|aux} in der Bahn ihr Handy verloren. Deshalb {sein|war|aux} sie einen Umweg gefahren. Ich {haben|hatte|aux} natürlich längst einen Kaffee bestellt. Wir {haben|hatten|aux} dann noch zwei Stunden beisammen gesessen. Am Ende {sein|war|aux} der Abend richtig schön geworden.'
  },
  {
    id: 'pq-c1', title: 'Die Rückkehr nach zwanzig Jahren', titleFa: 'بازگشت پس از بیست سال', band: 'C', ts: 'pq',
    text: 'Herr Brandt hatte seine Heimatstadt vor zwanzig Jahren {verlassen|verlassen|pp}. Seine alte Schule {sein|war|aux} längst abgerissen worden. Der Marktplatz hatte sich an den Stadtrand {verschieben|verschoben|pp}. Neugierig, wie er war, hatte er sich trotzdem gründlich {umsehen|umgesehen|pp}. Nichts {bleiben|war|aux} so geblieben, wie es einmal gewesen war. Ein fremder Mann hatte ihm die Geschichte des Viertels {erzählen|erzählt|pp}. Die Altstadt {sein|war|aux} nach dem Krieg komplett saniert worden. Am Abend hatte er vieles besser {verstehen|verstanden|pp}. Seine Erinnerungen {bleiben|waren|aux} dagegen unverändert geblieben.'
  },
  {
    id: 'pq-c2', title: 'Der Beweis', titleFa: 'مدارکِ سرنوشت‌ساز', band: 'C', ts: 'pq',
    text: 'Der Detektiv hatte den Fall bereits zwei Wochen {studieren|studierte|pp}. Der Verdächtige {sein|war|aux} am Tatabend nachweislich im Theater gewesen. Genau dieses Alibi hatte er sich offenbar {ausdenken|ausgedacht|pp}. Die Kartendaten {haben|hatten|aux} aber etwas anderes bewiesen. Niemand hatte an eine Täuschung {denken|gedacht|pp}. Der Auftraggeber hatte die Karten {fälschen|gefälscht|pp}. Als der Detektiv dies entdeckte, {sein|war|aux} die Frist schon abgelaufen. Er hatte die Polizei trotzdem sofort {informieren|informiert|pp}. Damit {sein|war|aux} das Rätsel endgültig gelöst.'
  },

  // ═══════════ Futur I ═══════════
  {
    id: 'f1-a1', title: 'Der Ausflug morgen', titleFa: 'گردشِ فردا', band: 'A', ts: 'f1',
    text: 'Morgen {werden|werde|aux} ich mit meiner Familie einen Ausflug machen. Wir {werden|werden|aux} mit dem Zug nach Leipzig fahren. Mein Vater {werden|wird|aux} das Picknick packen. Meine Schwester {werden|wird|aux} ihre Kamera mitnehmen. Ich {werden|werde|aux} natürlich wieder viel fotografieren. Das Wetter {werden|wird|aux} hoffentlich schön sein. Abends {werden|werden|aux} wir alle müde ins Bett fallen.'
  },
  {
    id: 'f1-a2', title: 'Der Traum vom Feuerwehrberuf', titleFa: 'رؤیای آتش‌نشان شدن', band: 'A', ts: 'f1',
    text: 'Mein kleiner Cousin sagt: „Ich {werden|werde|aux} mal Feuerwehrmann werden.“ Er {werden|wird|aux} dann große Autos fahren. Er {werden|wird|aux} vielen Menschen helfen. Seine Mutter {werden|wird|aux} ihn dabei unterstützen. Aber zuerst {werden|wird|aux} er noch die Schule beenden. Seine Oma {werden|wird|aux} ihm auf jeden Fall zuhören. Und ich {werden|werde|aux} ihm ein Feuerwehrbuch schenken.'
  },
  {
    id: 'f1-b1', title: 'Die Wetterprognose', titleFa: 'پیش‌بینی هوا', band: 'B', ts: 'f1',
    text: 'Am Wochenende {werden|wird|aux} das Wetter deutlich besser. Der Samstag {werden|wird|aux} sonnig und warm sein. Viele Familien {werden|werden|aux} einen Tag am See verbringen. Die Campingplätze {werden|werden|aux} wahrscheinlich schnell voll sein. Am Sonntag {werden|wird|aux} es Wolken und kurze Schauer geben. Die Temperaturen {werden|werden|aux} auf 24 Grad steigen. Die Experten {werden|werden|aux} für die neue Woche milden Frost ankündigen. Wir {werden|werden|aux} das Grillen also ins Freie verlegen.'
  },
  {
    id: 'f1-b2', title: 'Meine Lernziele', titleFa: 'اهداف یادگیری من', band: 'B', ts: 'f1',
    text: 'Im nächsten Semester {werden|werde|aux} ich regelmäßiger lernen. Ich {werden|werde|aux} mir einen festen Wochenplan erstellen. Zuerst {werden|werde|aux} ich alle Klausurtermine notieren. Dann {werden|werde|aux} ich zwei Abende pro Woche zum Lernen reservieren. Meine Freundin {werden|wird|aux} mir dabei sicher helfen. Sie {werden|wird|aux} mich auch kontrollieren. Außerdem {werden|werde|aux} ich mein Handy beim Lernen ausschalten. So {werden|werde|aux} ich am Ende hoffentlich bessere Noten haben. Und wenn das klappt, {werden|werde|aux} ich mich mit einem Konzert belohnen.'
  },
  {
    id: 'f1-c1', title: 'Die Stadt von morgen', titleFa: 'شهرِ آینده', band: 'C', ts: 'f1',
    text: 'In zwanzig Jahren {werden|wird|aux} die Innenstadt autofrei sein. Autos {werden|werden|aux} in Parkhäusern am Stadtrand verschwinden. Stattdessen {werden|wird|aux} ein dichtes Netz an E-Bussen und Radwegen entstehen. Die Kommunen {werden|werden|aux} Leerwohnungen in bezahlbaren Wohnraum verwandeln. Dachgärten {werden|werden|aux} das Stadtklima spürbar abkühlen. Jeder Bewohner {werden|wird|aux} Zugang zu schnellem Internet haben. Kritiker {werden|werden|aux} weiterhin vor hohen Kosten warnen. Die Verwaltung {werden|wird|aux} jedoch Erfolgserlebnisse anderer Städte anführen. Ob alles gelingt, {werden|werden|aux} die kommenden Jahre zeigen.'
  },
  {
    id: 'f1-c2', title: 'Interview: Künstliche Intelligenz', titleFa: 'مصاحبه: هوش مصنوعی', band: 'C', ts: 'f1',
    text: 'Frau Dr. Weber, wie {werden|wird|aux} sich die KI unsere Berufe verändern? Sie {werden|wird|aux} vor allem Routineaufgaben übernehmen. Kreative Tätigkeiten {werden|werden|aux} dagegen menschliche Stärke bleiben. Ich {werden|werde|aux} mir um die Arbeitsplätze insgesamt weniger Sorgen machen. Die Gesellschaft {werden|wird|aux} neue Regeln brauchen. Die Bildung {werden|wird|aux} der größte Hebel sein. Wir {werden|werden|aux} unseren Kindern frühzeitig Medienkompetenz vermitteln. Wer neugierig bleibt, {werden|wird|aux} den Wandel als Chance empfinden. Und genau darauf {werden|wird|aux} es ankommen.'
  },

  // ═══════════ Futur II ═══════════
  {
    id: 'f2-a1', title: 'Bis zum Abend', titleFa: 'تا عصر', band: 'A', ts: 'f2',
    text: 'Bis zum Mittag {werden|werde|aux} ich alle Einkäufe erledigt haben. Bis drei Uhr {werden|werde|aux} ich dann auch gegessen haben. Bis zum Abend {werden|wird|aux} meine Schwester alle Hausaufgaben gemacht haben. Bis morgen Früh {werden|wird|aux} das Wetter hoffentlich besser geworden sein. Und bis nächste Woche {werden|werden|aux} wir die Sonne endlich wieder gesehen haben.'
  },
  {
    id: 'f2-b1', title: 'Bis zur Abgabe', titleFa: 'تا مهلت تحویل', band: 'B', ts: 'f2',
    text: 'Bis Freitagabend {werden|werde|aux} ich den Aufsatz endlich geschrieben haben. Bis dahin {werden|werde|aux} ich auch alle Quellen geprüft haben. Mein Betreuer {werden|wird|aux} bis Montag sicher Feedback gegeben haben. Bis Ende des Monats {werden|werde|aux} ich alle Kapitel überarbeitet haben. Und bis zum Semesterende {werden|wird|aux} sich die Mühe garantiert gelohnt haben.'
  },
  {
    id: 'f2-c1', title: 'Bis zur Wahl', titleFa: 'تا انتخابات', band: 'C', ts: 'f2',
    text: 'Bis zur Wahl im Herbst {werden|wird|aux} die Regierung zwei große Reformen durchgezogen haben. Bis dahin {werden|wird|aux} die Opposition freilich jeden Entwurf blockiert haben. Bis Ende des Jahres {werden|wird|aux} das Parlament außerdem den Haushalt beschlossen haben. Bis dahin {werden|werden|aux} die Medien jede Einzelheit seziert haben. Und bis 2030 {werden|werden|aux} die Wähler das Ergebnis ohnehin bewertet haben. Bis dahin {werden|wird|aux} manches Versprechen in Vergessenheit geraten sein.'
  },

  // ═══════════ ترکیبی (همهٔ زمان‌ها) ═══════════
  {
    id: 'mix-a1', title: 'Der Wochenendtrip', titleFa: 'سفر آخر هفته', band: 'A', ts: 'mix',
    text: 'Letzten Freitag {fahren|fuhren|fin:prt} Lena und ich nach Dresden. Das Wetter {sein|war|fin:prt} am Samstag perfekt. Wir {besuchen|besuchten|fin:prt} die Frauenkirche und {machen|machten|fin:prt} viele Fotos. Am Sonntag {sein|ist|fin:prs} das Wetter leider schlecht. Deshalb {gehen|gehen|fin:prs} wir ins Museum. Heute {erzählen|erzähle|fin:prs} ich dir alles. Nächstes Wochenende {werden|werden|aux:f1} wir zusammen in Berlin.'
  },
  {
    id: 'mix-b1', title: 'Berge gestern, Berge morgen', titleFa: 'دیروز کوه، فردا کوه', band: 'B', ts: 'mix',
    text: 'Am Samstag {haben|habe|aux:perf} ich einen Ausflug in die Berge gemacht. Das Wetter {sein|war|fin:prt} am Vormittag noch trüb. Aber als wir ankamen, {scheinen|schien|fin:prt} plötzlich die Sonne. Wir {sein|sind|aux:perf} dann fünf Stunden gewandert. Heute {anfühlen|fühle|fin:prs} sich meine Beine müde an. Nächstes Wochenende {werden|werden|aux:f1} wir wieder etwas unternehmen. Ich {werden|werde|aux:f1} sicherlich meine Kamera mitnehmen. Bis dahin {haben|werde|aux:f2} ich mir auch neue Wanderschuhe gekauft haben. Vielleicht {werden|wird|aux:f1} das Wetter ja wieder so gut sein.'
  },
  {
    id: 'mix-c1', title: 'Jahresrückblick', titleFa: 'مرورِ یک سال', band: 'C', ts: 'mix',
    text: 'Rückblickend {haben|habe|aux:perf} ich dieses Jahr vieles gelernt. Im Frühling {arbeiten|arbeitete|fin:prt} ich noch in meinem alten Job. Dann {kommen|kam|fin:prt} das Angebot der neuen Firma. Heute {verbringen|verbringe|fin:prs} ich meine Tage deutlich produktiver. Wie die Studie gezeigt hat, {sein|sind|fin:prs} solche Wechsel oft anstrengend, aber lohnend. Nächstes Jahr {werden|werde|aux:f1} ich ein eigenes Team übernehmen. Bis dahin {haben|werde|aux:f2} ich mich gründlich vorbereitet haben. Und falls etwas schiefgeht, {sein|ist|fin:prs} das eben so.'
  }
];
