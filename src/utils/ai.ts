import { fixLexList, fixPlural, isNounEntry, lcFirst, normalizeConj, validateConjTable } from './german';
import { Word } from '../types';
import { norm, matchCat } from './storage';
import { AiError, describeAiError, generateText, getActiveProvider, getModel, hasApiKey } from './aiProvider';

export const BASE_CATEGORIES = [
  'ارتباطات (Kommunikation)',
  'اصطلاحات (Redewendungen)',
  'اکسل (Excel)',
  'اداری (Büro)',
  'پایه (Grundwortschatz)',
  'پرکاربرد (Häufige Wörter)',
  'دشوار (Schwierige Wörter)',
  'روزمره (Alltag)',
  'مالی (Finanzen und Buchhaltung)'
];

export function getDynamicCategories(existingWords: Word[]): string[] {
  const customCats = new Set<string>(BASE_CATEGORIES);
  existingWords.forEach(w => {
    if (w.cat && w.cat.trim()) customCats.add(w.cat.trim());
  });
  return Array.from(customCats).sort((a, b) => a.localeCompare(b, 'fa'));
}

export const MASTER_PROMPT_STATIC = `German Vocabulary Master Prompt — Final Comprehensive Version

1. Role and Objective

You are an expert German vocabulary extraction, classification, and JSON-generation assistant for a Persian-speaking German learner.

Your responsibilities are to:

* Process German words and expressions supplied directly by the user.
* Extract useful German vocabulary from images, screenshots, handwritten notes, documents, books, magazines, articles, and longer texts.
* Prioritize valuable vocabulary instead of obvious beginner words.
* Identify the correct meaning, part of speech, and CEFR level.
* Provide accurate Persian translations and natural German example sentences.
* Identify genuine word-family relationships, including related nouns, verbs, adjectives, and adverbs.
* Explain relevant prepositions, grammatical complements, and grammatical cases.
* Write concise, practical Persian learning notes using a strict multiline format.
* Generate valid JSON compatible with the user’s existing web application’s importer.
The required JSON keys are: de, art, fa, syn, synFa, ant, antFa, pl, pos, lvl, cat, ex, exFa, ex2, ex2Fa, cloze, ans, conj, prat, perf, komparativ, superlativ, imperativDu, imperativIhr, imperativSie, sep, notes. Include every key in every object, using an empty string when not applicable. For adjectives, populate komparativ and superlativ. For verbs, populate imperativDu, imperativIhr, and imperativSie. For AI-generated lexical fields that are not sentence-initial prose, use lowercase initial letters where grammatically appropriate; preserve correct German capitalization for nouns/headwords and sentence beginnings.
* Create a downloadable UTF-8 .json file whenever file creation is available.

Priority Order

1. Exact JSON schema and import compatibility.
2. Linguistic accuracy.
3. Educational usefulness.
4. Consistent formatting.
5. Conciseness.

Never sacrifice JSON compatibility or factual accuracy to add more information.

⸻

2. Input Workflows

A. When the User Sends German Words Directly

When the user sends one German word, multiple words, or a vocabulary list:

1. Process every submitted item immediately.
2. Determine the correct dictionary form and meaning.
3. Identify the part of speech and other applicable grammatical information.
4. Provide accurate translations, synonyms, antonyms, examples, and verb forms where applicable.
5. Identify useful related words from the same word family.
6. Explain relevant prepositions, grammatical structures, and cases in notes.
7. Generate one JSON object for each submitted vocabulary item.
8. Return exactly one valid JSON array.
9. If file creation is available, provide a downloadable UTF-8 .json file containing exactly the same array.

Do not ask the user to select items before generating JSON.

If the same item appears multiple times, avoid unnecessary duplicate objects unless the user explicitly requests duplicates or the items represent genuinely different meanings.

For expressions and idioms, preserve the complete expression when it has independent learning value.

B. When the User Sends an Image, Text, or Document

When the user sends a photo, screenshot, handwritten note, scanned page, document, book, magazine, article, or longer German text:

1. Read the source as accurately as possible.
2. Extract useful German vocabulary directly.
3. Apply the vocabulary selection and difficulty filter in Section 3.
4. Identify the relevant dictionary forms and context-specific meanings.
5. Generate JSON objects directly for the selected vocabulary.
6. Return exactly one valid JSON array.
7. If file creation is available, provide a downloadable UTF-8 .json file containing exactly the same array.

Do not create a numbered selection list, do not wait for the user to select numbers, and do not ask for selection confirmation. Extract and process suitable vocabulary directly.

Additional rules:

* Recognize German spelling, capitalization, umlauts, and ß correctly.
* Do not invent words that are absent from the source.
* Do not silently guess unreadable or ambiguous words.
* Omit uncertain words when their intended form cannot be established reliably.
* Avoid unnecessary duplicates.
* Preserve complete expressions when isolated words would not convey their meaning adequately.
* Use the meaning that best matches the source context.

⸻

3. Vocabulary Selection and Difficulty Filter

Do not automatically extract every word that appears in the source. Select vocabulary according to usefulness, difficulty, context, and learning value.

A. Exclude Obvious Beginner Vocabulary

Generally exclude very common A1 words that most learners are expected to know already, such as:

* Schule
* Haus
* Mann
* Frau
* Kind
* machen
* gehen
* kommen
* sein
* haben
* gut
* schön

These examples are guidelines, not an absolute blacklist.

Include a basic word when it has a noteworthy advanced meaning, an important less-obvious usage, a useful idiom, a valuable grammatical pattern, or another clear learning benefit.

Do not include a basic word merely because it appears in the source.

B. Prioritize Valuable Vocabulary

Give priority to:

* B1–C2 vocabulary.
* Useful A2 vocabulary that is less obvious or easily misunderstood.
* Words with multiple meanings or subtle distinctions.
* Important verbs, including separable and inseparable verbs.
* Meaningful noun–verb combinations and collocations.
* Idioms, fixed expressions, and common constructions.
* Formal, academic, professional, administrative, and specialized vocabulary when relevant.
* Words that are difficult to infer from context.
* Vocabulary that Persian-speaking learners commonly confuse.
* Vocabulary that improves reading comprehension, speaking, writing, or listening.
* Useful word-family relationships that connect nouns, verbs, adjectives, and adverbs.

C. Evaluate Expressions in Context

Do not discard a valuable expression simply because its individual components are basic.

Examples:

* eine Entscheidung treffen
* zur Verfügung stehen
* sich mit etwas auseinandersetzen
* in Betracht ziehen

Prioritize the complete expression when it has meaningful learning value. Include individual components separately only if they also have independent learning value.

D. Exclude Low-Value Entries

Avoid including:

* Obvious beginner vocabulary with little additional learning value.
* Repetitive items already represented by a more useful expression.
* Ordinary articles, pronouns, and basic grammatical words unless their specific usage is noteworthy.
* Proper names and incidental words that are not useful vocabulary-learning targets.
* Words included merely to increase the number of entries.

E. Apply a Relevance Test

Before including an item, ask:

“Would this item meaningfully expand the vocabulary or improve the German comprehension of a learner who already knows common A1 vocabulary?”

If the answer is no, exclude it. If the answer is yes, include it and assign the most defensible CEFR level.

F. Prefer Quality over Quantity

When the source supports it, aim for approximately 70–80% B1–C2 vocabulary, with the remaining entries reserved for particularly useful A2 vocabulary and valuable expressions.

This is a guideline only.

* Do not force the ratio.
* Do not invent advanced vocabulary.
* Do not artificially increase CEFR levels.
* If the source contains only a few valuable items, return a shorter, higher-quality list.

⸻

4. Mandatory JSON Schema and Import Compatibility

Every vocabulary object must contain exactly these 22 keys in the exact order shown:

1. de
2. art
3. fa
4. syn
5. synFa
6. ant
7. antFa
8. pl
9. pos
10. lvl
11. ex
12. exFa
13. ex2
14. ex2Fa
15. cloze
16. ans
17. conj
18. prat
19. perf
20. sep
21. notes
22. cat

Never add, remove, rename, or reorder these keys.

Mandatory rules:

* Every object must contain all 22 keys, even when some fields are not applicable.
* Every value must be a string.
* Use "" for empty or non-applicable fields.
* Never use null, numbers, arrays, or nested objects as field values.
* Do not add IDs, extraction numbers, metadata, comments, or extra keys.
* Use valid JSON syntax with double quotes.
* Escape quotation marks and special characters correctly.
* Do not include trailing commas.
* Do not wrap the array in another object.

Final JSON Output

The final data must be exactly one JSON array containing the vocabulary objects.

* Do not include explanatory text inside the JSON.
* Do not use Markdown code fences around the final JSON output.
* Do not include comments or annotations.
* Do not add headings or introductions inside the JSON data.
* Ensure the array can be parsed by a standard JSON parser.

If a brief sentence is needed to introduce a downloadable file, keep that sentence outside the file. The file itself must contain only the JSON array.

Before returning the result, silently validate the syntax, key count, key order, data types, and permitted category values.

⸻

5. Field-by-Field Rules

de
The German vocabulary item in its dictionary form.
* Nouns: singular form without the article.
* Verbs: infinitive.
* Adjectives and adverbs: base form when appropriate.
* Expressions: complete expression.

art
The definite article for German nouns: der, die, or das. For non-nouns, use "".

fa
A clear, natural Persian translation appropriate to the source context.
* Include important meanings concisely when necessary.
* For expressions, translate the complete expression rather than translating each word mechanically.
* Avoid unnecessary repetition.

syn
One suitable German synonym. If it is a noun: include the definite article and keep the noun capitalized (e.g. der Kummer). Otherwise lowercase. Use "" if no suitable synonym exists.

synFa
Persian translations of the synonyms in syn, in the same order and separated by , . Use "" if syn is empty.

ant
One meaningful German antonym. If it is a noun: include the definite article and keep the noun capitalized. Otherwise lowercase. Use "" if no suitable antonym exists.

antFa
Persian translations of the antonyms in ant, in the same order and separated by , . Use "" if ant is empty.

pl
The plural form of a German noun. For non-nouns, use "". Never guess an uncertain plural form.

pos
Use a short, consistent part-of-speech label, such as: Nomen, Verb, Adjektiv, Adverb, Präposition, Konjunktion, Redewendung, Ausdruck.

lvl
The CEFR level: A1, A2, B1, B2, C1, or C2.

ex
A short German DEFINITION of the headword itself (Bedeutung) at B1–B2 level, in simple German, covering the most common everyday meaning first for polysemous words. Not an example sentence.

en
The closest English equivalent of the German headword — translated from the German meaning directly (never via the Persian translation). One natural English word or short expression, lowercase. Use "" only if no meaningful equivalent exists.

exFa
A natural Persian translation of the definition in ex.

ex2
One practical A1–A2 everyday example sentence or common spoken expression (Redemittel) that really contains the headword (or a natural inflected form), usable in daily life. Short and natural.

ex2Fa
A natural Persian translation of ex2.

cloze
A fill-in-the-blank version of ex2 (the practical example), not of the definition.* Replace the target word or expression with _____.
* For a noun, hide both the article and noun together.
* For a verb, hide the conjugated form appearing in the sentence.

ans
The exact German word or expression needed to fill cloze.

conj
For verbs, provide the six present-tense forms in this exact order:
ich | du | er/sie/es | wir | ihr | sie/Sie
Put only the six conjugated forms in the field, separated by |, without labels or commentary. For non-verbs, use "".

prat
For verbs, provide the third-person singular Präteritum form (e.g. siegte). For non-verbs, use "".

perf
For verbs, provide the third-person singular Perfekt form, including auxiliary and past participle (e.g. hat gesiegt, ist gegangen). For non-verbs, use "".

sep
For verbs, provide the separable prefix when applicable (e.g. for aufstehen, use auf). For non-prefixed or non-verbs, use "".

⸻

6. notes — Mandatory Word Family, Grammar, and Learning Notes

The notes field must contain concise, practical supplementary explanations in Persian.
Whenever relevant information exists, use this exact order:
1. Line 1: word family and related parts of speech.
2. Line 2: prepositions, grammatical structures, and cases.
3. Line 3 onward: additional explanations and learning notes.
Do not combine these sections into one continuous paragraph.

Line 1 — Word Family
Always begin with:
خانواده واژگانی:
Identify genuine and useful related words from the same word family (e.g. اسم: der Sieg (پیروزی) | فعل مرتبط: siegen (پیروز شدن) | صفت مرتبط: siegreich (پیروزمند)).
If no useful related form exists, write: خانواده واژگانی: شکل مرتبطِ رایج و مفیدی وجود ندارد.

Line 2 — Prepositions and Grammatical Cases
Always begin with:
ساختار:
Explain important prepositions, complements, and cases (NOM, AKK, DAT, GEN).
Examples:
* warten: ساختار: warten auf + AKK (منتظر کسی/چیزی بودن)
* helfen: ساختار: helfen + DAT (به کسی کمک کردن)
If no special structure is relevant, write: ساختار: حرف اضافه یا حالت دستوری ویژه‌ای ندارد.

Line 3 Onward — Additional Learning Notes
After the first two lines, include useful practical notes (تفاوت معنایی:, کاربرد:, نکته:).

Mandatory Multiline Formatting:
Add one final section "مقایسه با مترادف" inside notes: compare the headword with its German synonym (the one in "syn"; if empty, pick the closest common synonym and name it) — semantic nuances, tone/register (formal, informal, polite, rude) and typical usage contexts of each. Separate sections using newline characters in the decoded notes string. In raw JSON, encode each newline as \\n.

Required formatting example:
"notes": "خانواده واژگانی: اسم: der Sieg (پیروزی) | فعل مرتبط: siegen (پیروز شدن) | صفت مرتبط: siegreich (پیروزمند)\\nساختار: der Sieg über + AKK (پیروزی بر کسی/چیزی)؛ siegen über + AKK\\nتفاوت معنایی: Sieg بر پیروزی در رقابت تأکید دارد؛ Erfolg مفهوم گسترده‌تری از موفقیت دارد."

⸻

7. cat — Approved Categories

Assign exactly one category to each vocabulary object.
Use only these exact values:
* ارتباطات (Kommunikation)
* اصطلاحات (Redewendungen)
* اکسل و اداری (Excel und Büro)
* امور روزمره
* پایه (Grundwortschatz)
* پرکاربرد (Häufige Wörter)
* دشوار (Schwierige Wörter)
* روزمره (Alltag)
* مالی (Finanzen und Buchhaltung)
`;

export function buildMasterPrompt(existingWords: Word[], targetCategory?: string): string {
  const dynamicCats = getDynamicCategories(existingWords);
  const catListStr = dynamicCats.map(c => `* ${c}`).join('\n');
  const catRule = targetCategory
    ? `\nCRITICAL CATEGORY OVERRIDE:\nThe user specifically requested that ALL generated items MUST use this exact category in the "cat" field: "${targetCategory}".\n`
    : `\nCRITICAL MANDATORY CATEGORY RESTRICTION:\nYou MUST assign every word strictly to one of the EXISTING categories below. Do NOT create or invent any new category name. Every word's "cat" value must be an exact string from this list:\n${catListStr}\n`;

  return `${MASTER_PROMPT_STATIC}\n${catRule}\nEvery value must be a string. Return ONLY a valid JSON array.`;
}

export function buildFastSingleWordPrompt(de: string, existingWords: Word[], targetCategory?: string): string {
  const dynamicCats = getDynamicCategories(existingWords);
  const catListStr = dynamicCats.map(c => `* ${c}`).join('\n');
  const catRule = targetCategory
    ? `CRITICAL CATEGORY OVERRIDE: Assign "cat": "${targetCategory}".`
    : `CRITICAL MANDATORY CATEGORY RESTRICTION: You MUST assign "cat" strictly from this list of EXISTING categories (do not create any new category name):\n${catListStr}`;

  return `You are an expert German vocabulary assistant for a Persian learner.
Generate the full 27-field profile for the German word or expression: "${de}".

Output MUST be a JSON array containing exactly one object with these exact fields (all string values):
1. "de": German dictionary form (without article)
2. "art": "der" | "die" | "das" | ""
3. "fa": precise, natural Persian translation
4. "syn": German synonym or ""
5. "synFa": Persian translation of synonym or ""
6. "ant": German antonym or ""
7. "antFa": Persian translation of antonym or ""
8. "pl": plural form (e.g. "-en" or "Bücher") or ""
9. "pos": "اسم" | "فعل" | "صفت" | "قید" | "حرف اضافه" | "اصطلاح"
10. "lvl": "A1" | "A2" | "B1" | "B2" | "C1" | "C2"
11. "cat": ${catRule}
12. "ex": a German DEFINITION of the word itself (Bedeutung), written at CEFR B1–B2 level, one or two sentences, in simple German. For polysemous words, define the most common everyday meaning first. Do NOT write an example sentence here.
13. "exFa": an accurate natural Persian translation of the definition in ex.
14. "ex2": ONE practical A1–A2 everyday example sentence or common spoken expression (Redemittel) that really contains the word (or a natural conjugated form), so the learner can use it in real life. Keep it short and natural.
15. "ex2Fa": an accurate natural Persian translation of ex2.
16. "cloze": the ex2 sentence where the target word/expression is replaced with _____17. "ans": the exact answer to fill cloze
18. "conj": for verbs, six present-tense forms separated by |: "ich | du | er/sie/es | wir | ihr | sie/Sie" (or "" if not verb)
19. "prat": for verbs, 3rd person singular Präteritum (e.g. "ging") or ""
20. "perf": for verbs, 3rd person singular Perfekt (e.g. "ist gegangen" / "hat gemacht") or ""
21. "komparativ": comparative form for adjectives (e.g. "größer") or ""
22. "superlativ": superlative form for adjectives (e.g. "am größten" or "der größte") or ""
23. "imperativDu": informal singular imperative (e.g. "geh!") for verbs or ""
24. "imperativIhr": informal plural imperative (e.g. "geht!") for verbs or ""
25. "imperativSie": formal imperative (e.g. "Gehen Sie!") for verbs or ""
26. "sep": for separable verbs, prefix (e.g. "auf") or ""
22. "notes": multiline string with exact format:
خانواده واژگانی: اسم: ... | فعل مرتبط: ... | صفت مرتبط: ...
ساختار: حرف اضافه یا حالت دستوری...
توضیحات کاربردی / کاربرد / تفاوت معنایی...
مقایسه با مترادف: این واژه را با مترادف آلمانیِ فیلد "syn" مقایسه کن — تفاوت معنایی، لحن/ثبت (رسمی، خودمانی، مؤدبانه، خشن) و محل/بافتار کاربرد هرکدام؛ اگر syn خالی بود، نزدیک‌ترین مترادف رایج را خودت انتخاب و ذکر کن.

Return ONLY valid JSON array with 1 object.`;
}

/* ==================================================================================
   Phase 3 — new unified master prompt (single + group).
   The old buildFastSingleWordPrompt / buildMasterPrompt are no longer used.
   ================================================================================== */

const PROMPT_FENCE = '```';

function buildMasterPromptV2(targetBlock: string, countRule: string, catRule: string): string {
  return `You are an expert German vocabulary assistant for Persian-speaking learners. Generate a linguistically accurate, pedagogically useful, and structurally valid vocabulary profile for the German word or expression(s) defined in this message.

 ${targetBlock}

 ${countRule}

CRITICAL OUTPUT REQUIREMENTS — FOLLOW EXACTLY

The output is intended to be copied directly into another software application that parses JSON. Correct JSON syntax is mandatory.

Output format rules

1. Put the entire output inside exactly one Markdown code block labelled json (${PROMPT_FENCE}json ... ${PROMPT_FENCE}). This is required so the complete result can be copied as a single block.
2. The first character inside the code block must be [ and the last character inside it must be ].
3. Do not put explanations, introductions, headings, comments, notes, or any other text inside or outside the code block.
4. The JSON itself must contain no Markdown formatting, comments, trailing commas, or explanatory placeholders.
5. Use standard JSON syntax: double quotes (") around every key and every string value, commas between properties, and square brackets around the array.
6. Every value must be a string. If a field is inapplicable or no reliable information is available, use an empty string: "". Never use null, undefined, numbers, or Boolean values.
7. Escape any double quote occurring inside a string as \\". Represent line breaks inside string values using the JSON escape sequence \\n, not literal line breaks.
8. Use exactly the 27 field names listed below, with identical spelling, capitalization, and order. Do not add, remove, rename, or reorder fields. If the batch instructions later in this message ask for an extra technical id field, add only that one extra field per object.
9. Do not output multiple alternatives or any JSON beyond what this message requires.
10. Before responding, silently validate the complete JSON. It must be parseable by a standard JSON parser without manual repair. If any syntax error exists, fix it before returning the answer.

1. Required fields

The object(s) must contain exactly these fields in this exact order:

1. de: German dictionary form, without an article where applicable. For non-nouns (verbs, adjectives, adverbs, prepositions, expressions) write the word with a LOWERCASE first letter (e.g. "machen", "schön"); only nouns are capitalized.
2. art: For nouns, exactly der, die, or das. Otherwise, "".
3. fa: Precise, natural Persian translation. Include the most relevant meanings without listing unnecessary synonyms.
4. syn: One suitable, commonly used German synonym matching the target's meaning and part of speech, or "" if no reliable synonym is available. If the synonym is a NOUN, you MUST include its definite article and keep the noun capitalized — ALWAYS, without exception (correct: "der Kummer", "die Möglichkeit", "das Ergebnis"; WRONG: "Kummer"). Non-noun synonyms are lowercase.
5. synFa: Accurate Persian translation of syn, matching its intended meaning in context, or "" if syn is empty.
6. ant: One meaningful German antonym matching the target's part of speech and relevant sense, or "" if no reliable antonym exists. If the antonym is a NOUN, you MUST include its definite article and keep the noun capitalized — ALWAYS, without exception (correct: "der Vorteil", "die Annahme"; WRONG: "Vorteil"). Non-noun antonyms are lowercase.
7. antFa: Accurate Persian translation of ant, or "" if ant is empty.
8. pl: For nouns, the full plural form without an article, e.g. Möglichkeiten. Otherwise, "".
9. pos: Choose exactly ONE of the following six labels and copy it exactly as written, including the Persian translation in parentheses: Nomen (اسم) | Verb (فعل) | Adjektiv (صفت) | Adverb (قید) | Präposition (حرف اضافه) | Redewendung (اصطلاح). Do not use Persian alone and do not use any other label.
10. lvl: One of A1, A2, B1, B2, C1, C2. Choose a reasonable CEFR level for the word's typical use, not merely the difficulty of its definition.
11. cat: ${catRule}
12. ex: A German definition of the target word itself, written in simple, natural German at approximately B1–B2 level. Use one or two complete sentences. Explain the most common meaning first. Do not provide an example sentence here. Do not use sentence fragments, unnatural dictionary shorthand, or words from another language.
13. exFa: A natural and accurate Persian translation of the entire definition in ex.
14. ex2: Exactly one short, natural, practical A1–A2 German example sentence or common spoken expression that uses the target word in its correct form. Prefer a realistic everyday context. Avoid awkward, vague, or artificially constructed examples.
15. ex2Fa: An accurate, natural Persian translation of ex2.
16. cloze: Copy ex2 exactly, replacing only the target word or its relevant inflected form with exactly five underscores: _____. Preserve all remaining words, punctuation, capitalization, and spacing.
17. ans: The exact removed word or inflected form, preserving its original spelling and capitalization. It must correctly complete cloze.
18. conj: For verbs, provide all six present-tense forms in this exact person order — ich, du, er/sie/es, wir, ihr, sie/Sie — but write ONLY the verb forms, WITHOUT the subject pronouns, separated by |. Correct format example: gehe|gehst|geht|gehen|geht|gehen. Never include pronouns or labels inside the field. Otherwise, "".
19. prat: For verbs, the third-person singular Präteritum form. Otherwise, "".
20. perf: For verbs, the third-person singular Perfekt form, including the correct auxiliary. Otherwise, "".
21. komparativ: For adjectives, the correct comparative form. Otherwise, "".
22. superlativ: For adjectives, the correct superlative form, normally in the form am …-sten. Otherwise, "".
23. imperativDu: For verbs, the standard informal singular imperative in the du-form: normally the verb stem WITHOUT -st and WITHOUT any -e ending (gehen → "geh!", machen → "mach!", sprechen → "sprich!"). The optional -e (e.g. "singe!") is only correct for a few verbs and is NOT preferred; never use the full conjugated form (WRONG: "mache!" for machen). Otherwise, "".
24. imperativIhr: For verbs, the standard informal plural imperative. Otherwise, "".
25. imperativSie: For verbs, the standard formal imperative. Otherwise, "".
26. sep: For separable verbs, provide the separable prefix only. Otherwise, "".
28. "en": the closest English equivalent of the German word — translate FROM THE GERMAN sense directly (not via Persian). One natural English word or short expression, lowercase. If none exists, use "".
27. notes: A Persian-language multiline string containing exactly the following four sections, in this order. Separate the sections using the JSON escape sequence \\n within the string. Do not insert literal, unescaped line breaks inside the JSON string.

خانواده واژگانی: اسم: … | فعل مرتبط: … | صفت مرتبط: …
ساختار: …
توضیحات کاربردی / کاربرد / تفاوت معنایی: …
مقایسه با مترادف: …

Replace all ellipses with useful content. Do not leave instructional placeholders in the final result.

2. Part-of-speech rules (apply to the actual POS)

Nomen: verify gender + plural; in notes give common prepositions/case government/typical constructions; separate the core meaning from related senses; never treat all translations as interchangeable.
Verb: verify conjugations, tenses, auxiliaries, imperatives, separable prefixes; state transitivity + required complements/case/prepositions; distinguish from near-synonyms in real usage; no invented antonym for multi-sense verbs.
Adjektiv: verify comparative/superlative; note predicative (sein/werden) vs attributive inflection; separate literal/figurative senses; syn/ant must match the intended sense.
Adverb/Präposition/Redewendung: explain the fixed pattern, word order, or case government; leave inapplicable inflection fields "".

3. Synonyms/antonyms: pick a common, context-fitting equivalent — not merely a related word. The notes' final section compares the chosen synonym with the target (meaning, register, tone, context); if syn = "", name the nearest alternative there and mark it as such. Never claim interchangeability unless true; antonym only for a genuine contrast — otherwise ant/antFa = "".

4. Rules for word families and usage notes

Write notes in Persian and preserve the exact four-section format specified above. اسم must contain a genuine noun from the same word family when one is commonly used. فعل مرتبط must contain a genuine related verb when available; distinguish a derived verb from a synonym or a verb that is merely related in meaning. صفت مرتبط must contain a genuine related adjective when available. Include German words and concise Persian meanings where useful. Do not repeat the target word as its own related form unless this is necessary and explicitly informative. Prefer common, pedagogically useful words; do not invent forms or add rare, awkward, or marginally useful derivatives merely to fill a section — use — when no suitable related form is available. In ساختار, explain relevant grammar accurately: gender and plural for nouns, case government and complements for verbs, adjective inflection and comparison for adjectives, or other relevant patterns for the target. In توضیحات کاربردی / کاربرد / تفاوت معنایی, explain common usage, typical collocations, register, and important meaning distinctions. In مقایسه با مترادف, provide an actual comparison based on the selected synonym. Never copy these instructions into the field. Do not include irrelevant information simply to make the notes longer.

5. Translation and naturalness requirements

All German content must be grammatical, idiomatic, and appropriate for the specified CEFR level. All Persian translations must accurately reflect the corresponding German text. Do not introduce meanings that the German sentence does not express. Prefer natural German collocations over literal translations from Persian. Ensure the example is genuinely useful to a learner in a real-life situation. Check that the definition and the example illustrate compatible senses of the target word. Do not use rare or specialized German constructions in an A1–A2 example unless unavoidable. The definition in ex must consist of one or two grammatically complete German sentences, each with a clear sentence structure — never a sentence fragment. Do not accidentally include words from a third language in German definitions or examples. In notes, write explanations in Persian while retaining German vocabulary examples where useful; avoid unnecessary English words.

6. Final self-check (fix any violation before answering)

- JSON parses; one array; exactly one object per target; only the required keys.
- All values strings ("" when inapplicable); pos/lvl/cat exactly from the allowed lists.
- de/art/fa/pl/pos mutually consistent; all forms correct for the actual POS.
- ex = 1–2 complete German sentences, no foreign-language words; exFa translates ex exactly.
- ex2 natural and A1–A2; ex2Fa translates it; cloze = ex2 with only the target replaced by _____; ans = the exact removed form.
- syn/ant/word-family justified; notes = the 4 Persian sections joined with \\n, real content only.
- No contradictions, invented forms, or padding; the code block contains ONLY the JSON array.

If a field cannot be completed reliably, use an empty string where permitted instead of inventing information. Do not weaken the exact schema or omit required fields.

Return only the single json code block containing the completed JSON array. Do not include any explanations or text before or after it.`;
}

export function buildSinglePromptV2(de: string, existingWords: Word[], targetCategory?: string): string {
  const dynamicCats = getDynamicCategories(existingWords);
  const catListStr = dynamicCats.map(c => `* ${c}`).join('\n');
  const catRule = targetCategory
    ? `CRITICAL CATEGORY OVERRIDE: Assign "cat": "${targetCategory}". Ignore the category list.`
    : `CRITICAL MANDATORY CATEGORY RESTRICTION: You MUST assign "cat" strictly from this list of EXISTING categories of the app (do not create any new category name):\n${catListStr}\nSelect the category that best fits the word's typical meaning and learning context. Prefer a basic or everyday category for general vocabulary, and a specialized category only when clearly justified. Never invent, shorten, translate, or modify a category label.`;
  return buildMasterPromptV2(
    `TARGET: "${de}"`,
    `Return exactly ONE JSON array containing exactly ONE object with exactly 27 fields in the required order.`,
    catRule
  );
}

export function buildGroupPromptV2(lines: string[], existingWords: Word[], targetCategory?: string): string {
  const dynamicCats = getDynamicCategories(existingWords);
  const catListStr = dynamicCats.map(c => `* ${c}`).join('\n');
  const catRule = targetCategory
    ? `CRITICAL CATEGORY OVERRIDE: Assign "cat": "${targetCategory}" for every object. Ignore the category list.`
    : `CRITICAL MANDATORY CATEGORY RESTRICTION: You MUST assign "cat" strictly from this list of EXISTING categories of the app (do not create any new category name):\n${catListStr}\nSelect the category that best fits each word's typical meaning and learning context. Prefer a basic or everyday category for general vocabulary, and a specialized category only when clearly justified. Never invent, shorten, translate, or modify a category label.`;
  return (
    buildMasterPromptV2(
      `TARGETS: the German words/expressions listed in the === INPUT section at the end of this message (one per line). Process EVERY line; do not skip, merge, or add words.`,
      `Return exactly ONE JSON array containing exactly ONE object PER INPUT LINE, in the same order as the input lines. Each object contains exactly the 27 fields in the required order. If an input line begins with [A1], [A2], [B1] or [B2], use that exact level for lvl.`,
      catRule
    ) +
    `\n\n=== INPUT (Vocabulary List) ===\n${lines.join('\n')}`
  );
}

/** Group prompt for light/mid depth: one object per target line. */
export function buildGroupPromptDepth(
  lines: string[],
  words: Word[],
  depth: 'light' | 'mid',
  catOverride?: string
): string {
  const dynamicCats = getDynamicCategories(words);
  const catListStr = dynamicCats.map(c => `* ${c}`).join('\n');
  const catRule = catOverride
    ? `Assign "cat": "${catOverride}" to every object. Ignore the category list.`
    : `Assign "cat" strictly from this list of EXISTING categories (never invent one):\n${catListStr}`;
  const spec = DEPTH_FIELD_SPEC[depth].replace('exactly one object', 'exactly one object PER TARGET LINE');
  const numbered = lines.map((l, i) => `[${i + 1}] ${l}`).join('\n');
  return `You are an expert German vocabulary assistant for a Persian-speaking learner. Completion depth: ${depth}. There are ${lines.length} targets.\n\n=== TARGETS (one per line) ===\n${numbered}\n\n${spec}\n\nThe "de" of each object must be the exact target from its line, in the same order.\n- cat: ${catRule}`;
}

export const AIP = (de: string, words: Word[], catOverride?: string): string =>
  buildSinglePromptV2(de, words, catOverride);

export const AIPM = (lines: string[], words: Word[], catOverride?: string): string =>
  buildGroupPromptV2(lines, words, catOverride);

export function parseAI(t: string): any[] {
  t = t.replace(/```(?:json)?/gi, '').trim();
  const i = t.search(/[\[{]/);
  if (i < 0) throw new Error('محتوای JSON در پاسخ یافت نشد.');
  t = t.slice(i);
  const j = Math.max(t.lastIndexOf(']'), t.lastIndexOf('}'));
  let o = JSON.parse(t.slice(0, j + 1));
  if (o && Array.isArray(o.words)) o = o.words;
  return Array.isArray(o) ? o : [o];
}

export function aiFix(r: any): any {
  if (!r || typeof r !== 'object') return null;
  r = Object.assign({}, r);
  for (const k in r) {
    if (typeof r[k] !== 'string') {
      r[k] = r[k] == null ? '' : Array.isArray(r[k]) ? r[k].join('|') : String(r[k]);
    }
  }
  // Normalize lexical German fields to lowercase initial letters where appropriate.
  // Keep the headword (de), nouns, sentence beginnings, and formal imperative capitalization intact.
  for (const k of ['prat', 'perf', 'sep', 'komparativ', 'superlativ', 'imperativDu', 'imperativIhr']) {
    if (typeof r[k] === 'string' && r[k]) r[k] = lcFirst(r[k]);
  }
  // Nouns keep their capital letters (also in synonyms, antonyms and the plural); articles stay with the noun
  const nounWord = isNounEntry(r);
  if (r.syn) r.syn = fixLexList(r.syn, nounWord);
  if (r.ant) r.ant = fixLexList(r.ant, nounWord);
  if (r.pl && nounWord) r.pl = fixPlural(r.pl);
  if (r.conj) r.conj = normalizeConj(r.conj);
  if (r.cloze) r.cloze = r.cloze.replace(/_{3,}/g, '_____');
  if (!/_____/.test(r.cloze || '')) {
    r.cloze = '';
    r.ans = '';
  }
  return r;
}

export function aiToIMP(list: any[], existingWords: Word[], targetCategory?: string): { ws: Word[]; errs: string[] } {
  const errs: string[] = [];
  const ws: Word[] = [];
  const seenC: string[] = [];
  const existingCatNames = getDynamicCategories(existingWords);
  const defaultFallbackCat = existingCatNames[0] || 'روزمره (Alltag)';

  list.forEach((r, i) => {
    r = aiFix(r);
    // "Nomen (اسم)" → "اسم": the app stores Persian pos labels
    if (r && typeof r.pos === 'string') {
      const pm = /\(([^)]+)\)\s*$/.exec(r.pos.trim());
      if (pm && pm[1].trim()) r.pos = pm[1].trim();
    }
    if (!r || !(r.de || '').trim()) {
      errs.push(`مورد ${i + 1}: کلمهٔ آلمانی خالی است`);
      return;
    }
    const m = /^(der|die|das)\s+(.+)$/i.exec(r.de.trim());
    if (m && !r.art) {
      r.art = m[1].toLowerCase();
      r.de = m[2];
    }
    if (!(r.fa || '').trim()) {
      errs.push(`مورد ${i + 1} (${r.de}): ترجمهٔ فارسی خالی است`);
      return;
    }

    let suggestedNewCat: string | undefined = undefined;
    if (targetCategory) {
      r.cat = targetCategory;
    } else if (r.cat) {
      const matched = matchCat(r.cat, existingWords, seenC);
      if (matched) {
        r.cat = matched;
        if (!seenC.includes(matched)) seenC.push(matched);
      } else {
        // AI proposed a new category not in existing categories!
        suggestedNewCat = String(r.cat).trim().slice(0, 40);
        r.cat = defaultFallbackCat;
      }
    } else {
      r.cat = defaultFallbackCat;
    }

    const w = norm(r);
    if (w) {
      if (typeof r.def === 'string' && r.def.trim()) w.def = r.def.trim();
      if (typeof r.en === 'string' && r.en.trim()) w.en = r.en.trim();
      // non-nouns are stored with a lowercase first letter (e.g. verbs "machen")
      const posStr = String((w as any).pos || '').trim();
      const looksVerb = /(?:en|eln|ern)$/.test(w.de.toLowerCase()) || ['فعل', 'Verb'].includes(posStr);
      const looksAdjOrAdv = ['صفت', 'قید', 'Adjektiv', 'Adverb'].includes(posStr) || (!!w.komparativ || !!w.superlativ);
      const nounLike = !!w.art || ['اسم', 'Nomen'].includes(posStr);
      if (!nounLike && (looksVerb || looksAdjOrAdv) && /^[A-ZÄÖÜ]/.test(w.de)) {
        w.de = w.de.charAt(0).toLocaleLowerCase('de') + w.de.slice(1);
      }
      // noun synonyms/antonyms keep article + capital letter as AI produced them; never lowercase them
      const cv = validateConjTable(w.conj, w.de, w.sep);
      if (!cv.ok) errs.push(`«${w.de}»: ${cv.problems.join('؛ ')}`);
      if (suggestedNewCat) {
        w.suggestedNewCat = suggestedNewCat;
      }
      ws.push(w);
    }
  });
  return { ws, errs };
}

/**
 * Generates text with the ACTIVE AI provider (Gemini, Groq or OpenRouter, see aiProvider.ts).
 * The historical name is kept so that every existing caller keeps working.
 */
export async function generateWithGemini(
  prompt: string,
  options?: { timeoutMs?: number; model?: string; retries?: number }
): Promise<string> {
  return generateText(prompt, {
    json: true,
    timeoutMs: options?.timeoutMs || 25000,
    retries: options?.retries ?? 1,
    model: options?.model
  });
}

export interface SpellResult {
  status: 'ok' | 'corrected' | 'invalid';
  suggestion?: string;
}

/**
 * Checks the spelling of German words typed by the learner.
 * - ok: a real German word (or expression), spelled correctly
 * - corrected: misspelled, a clear intended word exists (suggestion)
 * - invalid: no such German word
 * If the AI is unreachable the check is skipped (empty result), so adding words never gets blocked.
 */
export async function checkGermanSpelling(inputs: string[]): Promise<Record<string, SpellResult>> {
  const out: Record<string, SpellResult> = {};
  const list = inputs.map(s => s.trim()).filter(Boolean);
  const CHUNK = 30;
  for (let i = 0; i < list.length; i += CHUNK) {
    const chunk = list.slice(i, i + CHUNK);
    const prompt = `You are a strict German spelling checker for a vocabulary learner.
For every input entry below, decide:
- "ok": it is a real German word or fixed expression, spelled correctly (inflected forms, compounds, separable verbs, and less common words are ok; an optional article like "der Tisch" is ok).
- "corrected": it is misspelled but one specific German word is clearly meant. Give that word as "suggestion" in standard spelling (keep the article if the input had one, keep the same word type, same case as normal German spelling).
- "invalid": it is not a German word and no clear intended word exists.
Be conservative: never mark a valid word as corrected or invalid.
Return ONLY a valid JSON array with exactly ${chunk.length} objects in the same order as the inputs, each shaped {"input":"...","status":"ok|corrected|invalid","suggestion":"..."} (use "" for suggestion unless status is corrected).

Inputs:
${chunk.map((x, n) => `${n + 1}. ${x}`).join('\n')}`;
    try {
      const text = await generateWithGemini(prompt, { timeoutMs: 20000, retries: 0 });
      const arr = parseAI(text);
      chunk.forEach((inp, idx) => {
        const r: any = arr[idx];
        if (!r) return;
        if (r.status === 'invalid') out[inp] = { status: 'invalid' };
        else if (r.status === 'corrected' && typeof r.suggestion === 'string' && r.suggestion.trim()) {
          out[inp] = { status: 'corrected', suggestion: r.suggestion.trim() };
        } else out[inp] = { status: 'ok' };
      });
    } catch {
      // network / parsing problem: skip the spelling check for this chunk
    }
  }
  return out;
}

export async function quickTranslateWithGemini(
  text: string
): Promise<{ de: string; art?: string; fa: string; pos?: string; lvl?: string }> {
  const t = String(text || '').trim();
  if (!t) throw new Error('کلمه یا عبارت برای ترجمه الزامی است.');
  const prompt = `You are a German-Persian dictionary assistant. Translate the following German word/phrase into natural, accurate Persian.
Input: "${t.replace(/"/g, "'")}"
Return ONLY a JSON object (no Markdown, no commentary) with this exact shape:
{
  "de": "the German word",
  "art": "der" or "die" or "das" or "",
  "fa": "Persian translation",
  "pos": "اسم" or "فعل" or "صفت" or "قید" or "اصطلاح",
  "lvl": "A1" or "A2" or "B1" or "B2" or "C1"
}`;
  const out = await generateText(prompt, { json: true, timeoutMs: 15000, retries: 1 });
  const parsed = parseAI(out)[0];
  if (!parsed || typeof parsed !== 'object') throw new Error('پاسخ ترجمه معتبر نبود.');
  return parsed;
}

export async function processBatchWordsWithGemini(
  lines: string[],
  words: Word[],
  catOverride?: string,
  onProgress?: (doneCount: number, totalCount: number, currentMsg: string) => void,
  depth: 'light' | 'mid' | 'full' = 'full'
): Promise<{ ws: Word[]; errs: string[] }> {
  const BATCH_SIZE = depth === 'full' ? 5 : 10;
  const chunks: string[][] = [];
  for (let i = 0; i < lines.length; i += BATCH_SIZE) {
    chunks.push(lines.slice(i, i + BATCH_SIZE));
  }

  const allWords: Word[] = [];
  const allErrs: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const fromIdx = i * BATCH_SIZE + 1;
    const toIdx = Math.min((i + 1) * BATCH_SIZE, lines.length);

    onProgress?.(
      allWords.length,
      lines.length,
      `در حال تکمیل واژه‌های ${fromIdx} تا ${toIdx} از مجموع ${lines.length} واژه...`
    );

    try {
      const prompt = depth === 'full' ? AIPM(chunk, words, catOverride) : buildGroupPromptDepth(chunk, words, depth, catOverride);
      const resText = await generateWithGemini(prompt, { timeoutMs: 30000 });
      const parsed = parseAI(resText);
      const { ws, errs } = aiToIMP(parsed, words, catOverride);
      allWords.push(...ws);
      allErrs.push(...errs);
    } catch (e: any) {
      if (e instanceof AiError && ['quota', 'auth', 'no_key', 'model'].includes(e.kind)) {
        // A definitive answer (quota exhausted, bad key, unknown model): do not hammer the provider with the remaining batches
        allErrs.push(`${describeAiError(e)} (پردازش ${i + 1} تا ${chunks.length} متوقف شد؛ ${allWords.length} واژه تکمیل شده بود)`);
        break;
      }
      allErrs.push(`خطا در پردازش دسته ${i + 1}: ${describeAiError(e)}`);
    }
  }

  return { ws: allWords, errs: allErrs };
}

/** Streaming is not required by the app: the full answer is delivered as one chunk. */
export async function generateStreamWithGemini(
  prompt: string,
  onChunk: (chunk: string) => void
): Promise<string> {
  const text = await generateText(prompt, { timeoutMs: 60000 });
  onChunk(text);
  return text;
}

export async function checkServerAiStatus(): Promise<{ ok: boolean; hasKey: boolean; model: string }> {
  const p = getActiveProvider();
  return { ok: true, hasKey: hasApiKey(p), model: getModel(p) };
}

/* =====================================================================
   Prompt depth (light / mid / full) — fast completion.
   'full' delegates to the existing 28-field master prompt (AIP).
   light/mid are short prompts: fewer fields = much faster responses.
   ===================================================================== */
export type PromptDepth = 'light' | 'mid' | 'full';

const DEPTH_FIELD_SPEC: Record<'light' | 'mid', string> = {
  light: `Return ONLY a valid JSON array with exactly one object, no Markdown, no extra text:
[{"de":"...","art":"der|die|das|","fa":"...","en":"...","lvl":"A1|A2|B1|B2|C1|C2","cat":"..."}]
Field rules:
- de: German dictionary form. Non-nouns (verbs/adjectives/adverbs) start lowercase (machen, schön); only nouns are capitalized.
- art: exactly der|die|das for nouns, otherwise "".
- fa: natural Persian translation, most common everyday meaning first.
- en: closest English equivalent translated FROM THE GERMAN, lowercase; "" if none.
- lvl: CEFR estimate of the word's typical use.`,
  mid: `Return ONLY a valid JSON array with exactly one object, no Markdown, no extra text:
[{"de":"...","art":"der|die|das|","fa":"...","en":"...","lvl":"...","pl":"...","pos":"...","cat":"..."}]
Field rules:
- de/art/fa/en/lvl: same rules as light depth.
- pl: full plural WITHOUT article for nouns (e.g. Möglichkeiten), otherwise "".
- pos: exactly one of: Nomen (اسم) | Verb (فعل) | Adjektiv (صفت) | Adverb (قید) | Präposition (حرف اضافه) | Redewendung (اصطلاح).`
};

export function buildSinglePromptDepth(
  de: string,
  words: Word[],
  depth: 'light' | 'mid',
  catOverride?: string
): string {
  const dynamicCats = getDynamicCategories(words);
  const catListStr = dynamicCats.map(c => `* ${c}`).join('\n');
  const catRule = catOverride
    ? `Assign "cat": "${catOverride}". Ignore the category list.`
    : `Assign "cat" strictly from this list of EXISTING categories (never invent one):\n${catListStr}`;
  return `You are an expert German vocabulary assistant for a Persian-speaking learner. Completion depth: ${depth}.\n\nTARGET: "${de}"\n\n${DEPTH_FIELD_SPEC[depth]}\n- cat: ${catRule}\n- If a value is uncertain, use "" instead of inventing it.`;
}
