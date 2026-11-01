import { Word } from '../types';
import { norm, matchCat } from './storage';

export const BASE_CATEGORIES = [
  'ارتباطات (Kommunikation)',
  'اصطلاحات (Redewendungen)',
  'اکسل و اداری (Excel und Büro)',
  'امور روزمره',
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
German synonyms separated by , . Use "" if no suitable synonym exists.

synFa
Persian translations of the synonyms in syn, in the same order and separated by , . Use "" if syn is empty.

ant
German antonyms separated by , . Use "" if no suitable antonym exists.

antFa
Persian translations of the antonyms in ant, in the same order and separated by , . Use "" if ant is empty.

pl
The plural form of a German noun. For non-nouns, use "". Never guess an uncertain plural form.

pos
Use a short, consistent part-of-speech label, such as: Nomen, Verb, Adjektiv, Adverb, Präposition, Konjunktion, Redewendung, Ausdruck.

lvl
The CEFR level: A1, A2, B1, B2, C1, or C2.

ex
A natural German example sentence illustrating the intended meaning.

exFa
A natural Persian translation of ex.

ex2
A second German example sentence differing meaningfully from ex.

ex2Fa
A natural Persian translation of ex2.

cloze
A fill-in-the-blank version of the first German example sentence.
* Replace the target word or expression with _____.
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
Separate sections using newline characters in the decoded notes string. In raw JSON, encode each newline as \\n.

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
Generate the full 22-field profile for the German word or expression: "${de}".

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
12. "ex": natural German example sentence
13. "exFa": Persian translation of ex
14. "ex2": second natural German example sentence
15. "ex2Fa": Persian translation of ex2
16. "cloze": German sentence where target word/expression is replaced with _____
17. "ans": the exact answer to fill cloze
18. "conj": for verbs, six present-tense forms separated by |: "ich | du | er/sie/es | wir | ihr | sie/Sie" (or "" if not verb)
19. "prat": for verbs, 3rd person singular Präteritum (e.g. "ging") or ""
20. "perf": for verbs, 3rd person singular Perfekt (e.g. "ist gegangen" / "hat gemacht") or ""
21. "sep": for separable verbs, prefix (e.g. "auf") or ""
22. "notes": multiline string with exact format:
خانواده واژگانی: اسم: ... | فعل مرتبط: ... | صفت مرتبط: ...
ساختار: حرف اضافه یا حالت دستوری...
توضیحات کاربردی / کاربرد / تفاوت معنایی...

Return ONLY valid JSON array with 1 object.`;
}

export const AIP = (de: string, words: Word[], catOverride?: string): string =>
  buildFastSingleWordPrompt(de, words, catOverride);

export const AIPM = (lines: string[], words: Word[], catOverride?: string): string =>
  buildMasterPrompt(words, catOverride) +
  `\n\n=== INPUT (Vocabulary List) ===\n${lines.join('\n')}\n\nIf a line begins with [A1], [A2], [B1] or [B2], use that exact level for lvl. Return exactly one JSON array containing exactly one object per item above, in the same order.`;

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
      if (suggestedNewCat) {
        w.suggestedNewCat = suggestedNewCat;
      }
      ws.push(w);
    }
  });
  return { ws, errs };
}

export async function generateWithGemini(
  prompt: string,
  options?: { timeoutMs?: number; model?: string; retries?: number }
): Promise<string> {
  const timeoutMs = options?.timeoutMs || 25000;
  const maxRetries = options?.retries ?? 1;
  const model = options?.model || 'gemini-3.1-flash-lite';

  let lastError: any = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch('/api/gemini/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          prompt,
          model,
          responseMimeType: 'application/json'
        })
      });

      clearTimeout(timeoutId);

      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((j && j.error) || `خطای ارتباط با سرور هوش مصنوعی (${res.status})`);
      }

      const text = j.text || '';
      if (!text) throw new Error('پاسخ خالی از هوش مصنوعی دریافت شد.');
      return text;
    } catch (err: any) {
      clearTimeout(timeoutId);
      const isAbort = err.name === 'AbortError' || /aborted/i.test(err.message || '');
      lastError = isAbort
        ? new Error('زمان انتظار برای دریافت پاسخ هوش مصنوعی به پایان رسید (تایم‌اوت). لطفاً دوباره تلاش کنید.')
        : err;

      if (attempt < maxRetries) {
        // Short pause before retry
        await new Promise(r => setTimeout(r, 600));
      }
    }
  }

  throw lastError || new Error('خطا در پردازش هوش مصنوعی.');
}

export async function quickTranslateWithGemini(
  text: string
): Promise<{ de: string; art?: string; fa: string; pos?: string; lvl?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch('/api/gemini/quick-translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ text })
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || `خطا در ترجمه (${res.status})`);
    }

    const data = await res.json();
    return data;
  } catch (err: any) {
    clearTimeout(timeoutId);
    const isAbort = err.name === 'AbortError' || /aborted/i.test(err.message || '');
    if (isAbort) {
      throw new Error('زمان ترجمهٔ سریع به پایان رسید. دوباره تلاش کنید.');
    }
    throw err;
  }
}

export async function processBatchWordsWithGemini(
  lines: string[],
  words: Word[],
  catOverride?: string,
  onProgress?: (doneCount: number, totalCount: number, currentMsg: string) => void
): Promise<{ ws: Word[]; errs: string[] }> {
  const BATCH_SIZE = 5;
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
      const prompt = AIPM(chunk, words, catOverride);
      const resText = await generateWithGemini(prompt, { timeoutMs: 30000 });
      const parsed = parseAI(resText);
      const { ws, errs } = aiToIMP(parsed, words, catOverride);
      allWords.push(...ws);
      allErrs.push(...errs);
    } catch (e: any) {
      allErrs.push(`خطا در پردازش دسته ${i + 1}: ${e.message || 'ناموفق'}`);
    }
  }

  return { ws: allWords, errs: allErrs };
}

export async function generateStreamWithGemini(
  prompt: string,
  onChunk: (chunk: string) => void
): Promise<string> {
  const res = await fetch('/api/gemini/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      model: 'gemini-3.8-flash'
    })
  });

  if (!res.ok || !res.body) {
    const j = await res.json().catch(() => ({}));
    throw new Error((j && j.error) || `خطای استریم هوش مصنوعی (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') continue;
        try {
          const parsed = JSON.parse(payload);
          if (parsed.text) {
            fullText += parsed.text;
            onChunk(parsed.text);
          }
          if (parsed.error) {
            throw new Error(parsed.error);
          }
        } catch (e: any) {
          if (e.message && e.message !== 'Unexpected end of JSON input') {
            console.error(e);
          }
        }
      }
    }
  }

  return fullText;
}

export async function checkServerAiStatus(): Promise<{ ok: boolean; hasKey: boolean; model: string }> {
  const res = await fetch('/api/gemini/status');
  if (!res.ok) throw new Error(`خطای بررسی وضعیت سرور (${res.status})`);
  return res.json();
}
