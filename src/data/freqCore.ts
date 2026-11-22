/**
 * هستهٔ پربسامد آلمانی — مبنای پیشنهاد خودکار وضعیت واژه (فاز ۱).
 *
 * این فهرست مجموعهٔ کوچک و دست‌چینِ لِمّاهای بسیار پرکاربرد زبان آلمانی است
 * (واژه‌های تابعی + فعل‌ها و اسم‌ها و صفت‌های پرتکرار) که تقریباً در هر متنی
 * و هر مکالمه‌ای ظاهر می‌شوند؛ لذا به‌عنوان «بلیط فعال» پیشنهاد می‌شوند.
 * لِمّاهای خارج این فهرست پیش‌فرض «دریافتی» می‌گیرند و کاربر می‌تواند دستی
 * وضعیت را عوض کند یا در WordDetailModal خوشهٔ مترادف و رجیستر ثبت کند.
 *
 * فرم‌های ذخیره‌شده همه کوچک‌اند؛ مقایسه با lemmaOf() انجام می‌شود
 * (حذف آرتیکل، حذف sich، حذف zu، حذف علامت‌ها).
 */
export const FREQ_CORE = new Set<string>([
  // واژه‌های تابعی و ضمیرها و حروف اضافه
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'eines',
  'und', 'oder', 'aber', 'denn', 'sondern', 'weil', 'dass', 'ob', 'als', 'wenn', 'wie',
  'in', 'an', 'auf', 'mit', 'von', 'zu', 'bei', 'nach', 'vor', 'aus', 'für', 'um', 'über',
  'unter', 'durch', 'gegen', 'ohne', 'bis', 'seit', 'ab', 'hinter', 'neben', 'zwischen',
  'ja', 'nein', 'doch', 'nicht', 'kein', 'niemand', 'alles', 'nichts', 'etwas', 'alle',
  'man', 'wir', 'ich', 'du', 'er', 'sie', 'es', 'ihr', 'uns', 'mich', 'dir', 'ihnen',
  'hier', 'da', 'dort', 'jetzt', 'heute', 'morgen', 'gestern', 'dann', 'damals', 'immer',
  'nie', 'noch', 'schon', 'nur', 'auch', 'sehr', 'so', 'gar', 'eben', 'mal', 'denn',
  'hierher', 'dorthin', 'wo', 'wohin', 'woher', 'warum', 'wieso', 'was', 'wer', 'wann',
  // فعل‌های پربسامد
  'sein', 'haben', 'werden', 'können', 'müssen', 'wollen', 'sollen', 'dürfen', 'mögen',
  'möchten', 'sagen', 'machen', 'geben', 'gehen', 'kommen', 'sehen', 'hören', 'sprechen',
  'reden', 'fragen', 'antworten', 'denken', 'glauben', 'wissen', 'kennen', 'verstehen',
  'lernen', 'lehren', 'arbeiten', 'spielen', 'leben', 'lieben', 'essen', 'trinken',
  'schlafen', 'sitzen', 'stehen', 'liegen', 'laufen', 'fahren', 'fliegen', 'bleiben',
  'helfen', 'danken', 'brauchen', 'kaufen', 'verkaufen', 'bezahlen', 'kosten', 'nehmen',
  'geben', 'bringen', 'holen', 'suchen', 'finden', 'verlieren', 'bekommen', 'warten',
  'anfangen', 'aufhören', 'beginnen', 'enden', 'passieren', 'geschehen', 'tun', 'zeigen',
  'fühlen', 'meinen', 'erwarten', 'hoffen', 'freuen', 'lachen', 'weinen', 'lächeln',
  'trinken', 'schreiben', 'lesen', 'rechnen', 'erklären', 'erzählen', 'beschreiben',
  'übersetzen', 'wiederholen', 'üben', 'vergessen', 'erinnern', 'merken', 'entscheiden',
  'wählen', 'ändern', 'nutzen', 'brauchen', 'benutzen', 'öffnen', 'schließen', 'starten',
  'wohnen', 'bauen', 'werden', 'bleiben', 'gewinnen', 'verlieren', 'schaffen',
  'verstehen', 'erwarten', 'treffen', 'einladen', 'besuchen', 'einchecken',
  'grüßen', 'begrüßen', 'verabschieden', 'vorstellen', 'vorbereiten', 'aufräumen',
  'schauen', 'gucken', 'stellen', 'legen', 'setzen', 'kochen', 'waschen', 'zahlen', 'reisen',
  // اسم‌های پربسامد
  'jahr', 'tag', 'woche', 'monat', 'stunde', 'minute', 'zeit', 'uhr', 'morgen', 'abend',
  'nacht', 'mittag', 'welt', 'land', 'stadt', 'dorf', 'haus', 'zimmer', 'küche', 'schule',
  'universität', 'lehrer', 'schüler', 'student', 'schule', 'klasse', 'unterricht',
  'arbeit', 'büro', 'chef', 'kollege', 'geld', 'euro', 'preis', 'einkauf', 'geschäft',
  'markt', 'geschäft', 'lebensmittel', 'essen', 'frühstück', 'mittagessen', 'abendessen',
  'familie', 'mutter', 'vater', 'eltern', 'kind', 'kinder', 'sohn', 'tochter', 'bruder',
  'schwester', 'freund', 'freundin', 'mann', 'frau', 'mensch', 'person', 'leute', 'name',
  'körper', 'kopf', 'hand', 'auge', 'herz', 'gesundheit', 'arzt', 'krankenhaus', 'krankheit',
  'medikament', 'schmerz', 'sprache', 'wort', 'satz', 'frage', 'antwort', 'buch', 'zeitung',
  'brief', 'telefon', 'handy', 'computer', 'internet', 'fernsehen', 'film', 'musik', 'lied',
  'auto', 'zug', 'bus', 'bahn', 'flugzeug', 'fahrrad', 'straße', 'weg', 'platz', 'stadt',
  'wetter', 'regen', 'schnee', 'wind', 'sonne', 'himmel', 'erde', 'wasser',
  'feuer', 'luft', 'baum', 'blume', 'tier', 'hund', 'katze', 'vogel', 'haus', 'tür',
  'fenster', 'tisch', 'stuhl', 'bett', 'licht', 'bild', 'tasche', 'kleidung', 'schuh',
  'woche', 'urlaub', 'reise', 'flug', 'bahnhof', 'flughafen', 'hotel', 'restaurant',
  'kaffee', 'tee', 'bier', 'wein', 'milch', 'brot', 'butter', 'käse', 'fleisch', 'fisch',
  'gemüse', 'obst', 'apfel', 'kuchen', 'salz', 'zucker', 'rechnung', 'konto', 'bank',
  'versicherung', 'post', 'paket', 'briefmarke', 'verabredung', 'treffen', 'party',
  'geburtstag', 'weihnachten', 'ostern', 'geschenk', 'glückwunsch', 'wunsch', 'traum',
  'angst', 'freude', 'liebe', 'hoffnung', 'meinung', 'idee', 'problem', 'lösung', 'frage',
  'grund', 'ziel', 'plan', 'aufgabe', 'arbeit', 'beruf', 'ausbildung', 'prüfung', 'zeugnis',
  'sprache', 'deutsch', 'beispiel', 'sinn', 'bedeutung', 'teil', 'stück', 'menge', 'zahl',
  'nummer', 'gruppe', 'seite', 'ende', 'anfang', 'mitte', 'art', 'weise', 'weise',
  'möglichkeit', 'chance', 'hilfe', 'tip', 'tipp', 'sache', 'ding', 'thema', 'bereich',
  // صفت‌ها و قیدهای پربسامد
  'gut', 'schlecht', 'schön', 'hübsch', 'groß', 'klein', 'neu', 'alt', 'jung', 'warm',
  'kalt', 'kühl', 'heiß', 'hell', 'dunkel', 'leicht', 'schwer', 'schnell', 'langsam',
  'früh', 'spät', 'lange', 'kurz', 'hoch', 'tief', 'breit', 'dick', 'dünn', 'richtig',
  'falsch', 'richtig', 'wahr', 'wirklich', 'möglich', 'unmöglich', 'wichtig', 'interessant',
  'nett', 'lieb', 'glücklich', 'traurig', 'müde', 'krank', 'gesund', 'hungrig', 'durstig',
  'fertig', 'bereit', 'frei', 'besetzt', 'offen', 'geschlossen', 'teuer', 'billig', 'preiswert',
  'modern', 'altmodisch', 'einfach', 'kompliziert', 'klar', 'deutlich', 'leise', 'laut',
  'viele', 'viel', 'wenig', 'mehr', 'weniger', 'ein bisschen', 'erste', 'zweite', 'dritte',
  'letzte', 'nächste', 'eigene', 'eigen', 'ganz', 'halbe', 'halb', 'beide', 'verschieden',
  'gleich', 'ähnlich', 'neue', 'besondere', 'besonders', 'gerne', 'zusammen', 'getrennt',
  'links', 'rechts', 'geradeaus', 'wieder', 'weiter', 'zunächst', 'endlich', 'plötzlich',
  'langsam', 'schnell', 'vielleicht', 'sicher', 'bestimmt', 'natürlich', 'leider', 'hoffentlich',
  'eigentlich', 'plötzlich', 'ungefähr', 'etwa', 'fast', 'beinahe', 'total', 'völlig',
]);
