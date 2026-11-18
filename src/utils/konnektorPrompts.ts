/**
 * konnektorPrompts.ts — پرامت‌های تمرین «ساخت جمله با همهٔ حروف ربط»
 * همهٔ تعامل با هوش مصنوعی از اینجا ساخته می‌شود: تولید تمرین، تصحیح سه‌لایه،
 * ترجمهٔ واژه با کلیک، و چت درون‌خطیِ هر جمله.
 */

import { Lvl, KonnektorItem, LVL_INFO } from '../data/konnektorenData';

/** پیام سیستم مشترک: معلم آلمانی، پاسخ فارسی، مثال آلمانی، JSON تمیز */
export const SYS_AI =
  'Du bist eine erfahrene Deutschlehrkraft (DaF) und korrigierst wie eine muttersprachliche Prüfungskorrektheit (Goethe-Zertifikat / telc / ÖSD). ' +
  'Antworte auf Persisch (Farsi), alle deutschen Beispiele und Sätze bleiben auf Deutsch. ' +
  'Ton: freundlich, konkret, ermutigend, keine langen Vorreden. ' +
  'Wenn JSON gefordert ist, liefere NUR gültiges JSON — ohne Markdown-Codezäune, ohne Einleitung, ohne Erklärung.';

/** توصیف دقیق سطح برای پرامت */
export const lvlSpec = (l: Lvl): string => LVL_INFO[l].spec;

/** پراخت تمرین: N جملهٔ نیمه‌تمام با حروف ربطِ همان سطح */
export function buildExercisePrompt(level: Lvl, count: number, topic: string, konns: KonnektorItem[]): string {
  const list = konns.map(k => k.w).join(' | ');
  const t = topic.trim();
  return `Erzeuge ${count} Aufgaben vom Typ „Sätze komplettieren“ für Lerner der Stufe ${level}.

Sprachliche Vorgaben für ${level}:
${lvlSpec(level)}

Erlaubte Leit-Konnektoren (NUR aus dieser Liste, jeder höchstens einmal, wähle abwechslungsreich aus verschiedenen Kategorien):
${list}
${t ? `\nThema der Sätze: „${t}“ — alle Sätze sollen zu diesem Thema passen.` : '\nThema: frei, aber abwechslungsreich (Alltag, Arbeit, Umwelt, Reisen, Technik, Gesellschaft …).'}

Format jeder Aufgabe:
- „first“: der VORGEGEBENE erste Teilsatz. Er MUSS den Leit-Konnektor an der richtigen Position enthalten und mit einem Komma enden (oder bei Konditionalsatz mit „dann“-Nachsatz mit Komma enden).
  Beispiele für die Bauweise:
  {"no":1,"connector":"weil","first":"Weil ich sehr gerne reise,"}
  {"no":2,"connector":"daher","first":"Auf Dosen und Flaschen gibt es 25 Cent Pfand, daher"}
  {"no":3,"connector":"darauf / daran / darüber + dass","first":"Besonders die junge Generation hofft darauf,","hint":"dass …"}
- „hint“: nur wenn der Lernende beim Ergänzen einen Startpunkt braucht (z. B. "dann" bei wenn-Sätzen, "dass …" nach Verb+Präposition). Sonst leerer String "".
- Die Schwierigkeit der Ergänzung (zweiter Teilsatz) muss ${level} entsprechen.
- Vermeide zwei Aufgaben mit demselben Konnektor. Mische Kategorien (kausal, konzessiv, final, temporal …).
- Inhaltlich: logisch ergänzbare, interessante Sätze — keine Nonsens-Sätze.

Antworte NUR mit einem JSON-Array in genau dieser Form:
[{"no":1,"connector":"…","first":"…","hint":"…"}]`;
}

/** پراخت تصحیح: سه لایهٔ بازخورد — گرامری، مفهومی، تفکر آلمانی */
export function buildCorrectionPrompt(
  level: Lvl,
  items: { no: number; connector: string; first: string; hint?: string }[],
  answers: Record<number, string>
): string {
  const payload = items.map(it => ({
    no: it.no,
    connector: it.connector,
    first: it.first,
    hint: it.hint || '',
    user: (answers[it.no] || '').trim()
  }));
  return `Korrigiere die Ergänzungen eines Lerners der Stufe ${level} (${lvlSpec(level)}).

Aufgaben und Antworten des Lerners (JSON):
${JSON.stringify(payload, null, 1)}

Prüfe für jede Antwort DREI Dinge und antworte pro Aufgabe:
1) „grammar“ (auf Persisch, 1–2 Sätze): Konnektor richtig gesetzt und an richtiger Position? Wortstellung: Verb am Ende im Nebensatz, Position 2 im Hauptsatz? Kommas? Zeitformen stimmig? Nenne den Fachbegriff und zeige die Berichtigung kurz (deutsch).
2) „meaning“ (auf Persisch, 1–2 Sätze): Passt der Inhalt logisch zum ersten Teilsatz? Ist die Ergänzung sinnvoll oder widersprüchlich?
3) „thinking“ (auf Persisch, 1–2 Sätze): „Deutsches Denken“ — wie würde ein/e Muttersprachler/in das natürlich formulieren? Gib gern eine idiomatischere Alternative (deutsch). Wenn die Antwort schon natürlich ist: sage das und gib einen kleinen Zusatz-Tipp.

Regeln:
- „corrected“: der komplett korrigierte GESAMTSATZ (erster Teilsatz + korrigierte Ergänzung) auf Deutsch. Wenn die Antwort schon perfekt ist: exakt der Satz des Lerners.
- „ok“: true nur, wenn Ergänzung inhaltlich und grammatisch akzeptabel ist (kleine Rechtschreibfehler: noch ok=true, aber im „grammar“ erwähnen).
- Wenn die Antwort leer ist: ok=false, corrected="", grammar="پاسخ ندادی", meaning="", thinking="گزینهٔ نمونه در فیلد corrected خالی است؛ در چت بخواه تا نمونه بدهم."
- Antworte auf Persisch, deutsche Beispiele auf Deutsch.
- Antworte NUR mit JSON-Array:
[{"no":1,"ok":true,"corrected":"…","grammar":"…","meaning":"…","thinking":"…"}]`;
}

/** پراخت ترجمهٔ واژه با کلیک (متن‌ها AI تولید کرده‌اند، پس واژه‌نامهٔ ثابت کافی نیست) */
export function buildWordPrompt(word: string, sentence: string, level: Lvl): string {
  return `Übersetze das deutsche Wort „${word}“ für einen Lerner der Stufe ${level}.
Kontextsatz: „${sentence}“

Regeln:
- „lemma“: die Grundform des Wortes (Infinitiv bei Verben, Nominativ Singular bei Substantiven, Positiv bei Adjektiven).
- „fa“: die passende Übersetzung ins Persische IM KONTEXT des Satzes (nicht nur Wörterbuch-Bedeutung), kurz.
- „pos“: "noun" | "verb" | "adj" | "adv" | "phrase" | "other".
- „art“: bei Substantiven "der"/"die"/"das", sonst "".
- „ex“: ein kurzer, sehr einfacher neuer Beispielsatz auf Deutsch mit dem LEMMA (nicht das Kontext-Beispiel kopieren).
- „exFa“: Übersetzung des Beispielsatzes ins Persische.

Antworte NUR mit JSON:
{"lemma":"…","fa":"…","pos":"…","art":"…","ex":"…","exFa":"…"}`;
}

/** پرامت چت درون‌خطیِ هر جمله — با حافظهٔ گفتگوی همان جمله */
export interface ChatCtx {
  no: number;
  connector: string;
  first: string;
  userText: string;
  question: string;
  correction?: { ok: boolean; corrected: string; grammar: string; meaning: string; thinking: string } | null;
  history: { role: 'user' | 'ai'; text: string }[];
}

export function buildChatPrompt(ctx: ChatCtx, level: Lvl): string {
  const corr = ctx.correction
    ? `تصحیح پیشین معلم:\n- جملهٔ درست: ${ctx.correction.corrected}\n- گرامری: ${ctx.correction.grammar}\n- مفهومی: ${ctx.correction.meaning}\n- تفکر آلمانی: ${ctx.correction.thinking}`
    : '(هنوز تصحیح نشده — اگر لازم است خودت جملهٔ کامل را در نظر بگیر.)';
  const hist = ctx.history.length
    ? 'گفتگوی پیشین همین جمله:\n' + ctx.history.map(m => (m.role === 'user' ? 'دانش‌آموز: ' : 'معلم: ') + m.text).join('\n')
    : '(شروع گفتگو)';
  return `جملهٔ تمرین شمارهٔ ${ctx.no} (سطح ${level}):
- بخش اول (داده‌شده): ${ctx.first}
- حرف ربط هدف: ${ctx.connector}
- تکمیل دانش‌آموز: ${ctx.userText || '(خالی)'}

${corr}

${hist}

پرسش تازهٔ دانش‌آموز:
«${ctx.question}»

قواعد پاسخ:
- فارسی جواب بده، مثال‌های آلمانی را آلمانی بنویس.
- کوتاه و مفید (حدود ۶۰–۱۲۰ کلمه مگر اینکه دانش‌آموز توضیح بیشتر بخواهد).
- اگر گرامر یا جایگاه فعل مطرح است، مثال متضاد (غلط/درست) بده.
- اگر می‌شود با حرف ربط دیگری هم جمله ساخت، یکی دو جایگزین طبیعی پیشنهاد بده و فرق معنایی را بگو.
- انگیزه‌بخش باشد، نه موعظه.`;
}
