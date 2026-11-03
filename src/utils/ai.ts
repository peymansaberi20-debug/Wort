import type { Word } from '../types';
import { GEM_KEY, GEM_MOD, DEF_MOD } from './storage';

export type SpellResult = {
  status: 'correct' | 'corrected' | 'invalid' | 'unknown';
  suggestion?: string;
  explanation?: string;
};

type AIOptions = {
  timeoutMs?: number;
  model?: string;
};

type ProgressCallback = (
  doneCount: number,
  totalCount: number,
  currentMsg: string
) => void;

const readKey = (): string => {
  try {
    return localStorage.getItem(GEM_KEY) ||
      localStorage.getItem('gemini_api_key') ||
      '';
  } catch {
    return '';
  }
};

const readModel = (): string => {
  try {
    return (
      localStorage.getItem(GEM_MOD) ||
      DEF_MOD ||
      'gemini-2.5-flash'
    ).trim();
  } catch {
    return 'gemini-2.5-flash';
  }
};

async function requestGemini(
  prompt: string,
  options: AIOptions = {}
): Promise<string> {
  const apiKey = readKey();

  if (!apiKey) {
    throw new Error(
      'کلید Gemini پیدا نشد. ابتدا کلید API را در تنظیمات برنامه وارد کنید.'
    );
  }

  const model = options.model || readModel();
  const timeoutMs = options.timeoutMs ?? 30000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
          },
        }),
        signal: controller.signal,
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message =
        data?.error?.message ||
        `خطای Gemini (${response.status})`;

      throw new Error(message);
    }

    const text = data?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text || '')
      .join('')
      .trim();

    if (!text) {
      throw new Error('Gemini پاسخ متنی معتبری برنگرداند.');
    }

    return text;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('زمان انتظار پاسخ Gemini به پایان رسید.');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * ارسال درخواست متنی به Gemini
 */
export async function generateWithGemini(
  prompt: string,
  options: AIOptions = {}
): Promise<string> {
  return requestGemini(prompt, options);
}

/**
 * استخراج JSON از پاسخ هوش مصنوعی
 */
export function parseAI(input: unknown): any {
  if (typeof input !== 'string') {
    return input;
  }

  let text = input.trim();

  text = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(text);
  } catch {
    // گاهی پاسخ شامل توضیح قبل یا بعد از JSON است.
  }

  const startArray = text.indexOf('[');
  const startObject = text.indexOf('{');

  let start = -1;

  if (startArray >= 0 && startObject >= 0) {
    start = Math.min(startArray, startObject);
  } else {
    start = Math.max(startArray, startObject);
  }

  if (start < 0) {
    throw new Error('JSON معتبری در پاسخ هوش مصنوعی پیدا نشد.');
  }

  const opening = text[start];
  const closing = opening === '[' ? ']' : '}';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === opening) {
      depth++;
    } else if (char === closing) {
      depth--;

      if (depth === 0) {
        return JSON.parse(text.slice(start, i + 1));
      }
    }
  }

  throw new Error('ساختار JSON ناقص است.');
}

const asText = (value: unknown): string =>
  value == null ? '' : String(value).trim();

const unwrapWords = (value: any): any[] => {
  if (Array.isArray(value)) return value;

  if (value && typeof value === 'object') {
    if (Array.isArray(value.words)) return value.words;
    if (Array.isArray(value.ws)) return value.ws;
    if (Array.isArray(value.results)) return value.results;

    if (value.de || value.word || value.german) {
      return [value];
    }
  }

  return [];
};

const createWord = (source: any, category = ''): Word => {
  const de = asText(source?.de ?? source?.word ?? source?.german);
  const fa = asText(source?.fa ?? source?.translation ?? source?.persian);

  return {
    id: asText(source?.id) || `ai-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    de,
    art: asText(source?.art ?? source?.article),
    fa,
    syn: asText(source?.syn ?? source?.synonyms),
    synFa: asText(source?.synFa),
    ant: asText(source?.ant ?? source?.antonyms),
    antFa: asText(source?.antFa),
    pl: asText(source?.pl ?? source?.plural),
    pos: asText(source?.pos ?? source?.partOfSpeech),
    lvl: asText(source?.lvl ?? source?.level),
    ex: asText(source?.ex ?? source?.example),
    exFa: asText(source?.exFa ?? source?.exampleFa),
    ex2: asText(source?.ex2 ?? source?.example2),
    ex2Fa: asText(source?.ex2Fa ?? source?.example2Fa),
    conj: asText(source?.conj ?? source?.conjugation),
    prat: asText(source?.prat ?? source?.praeteritum),
    perf: asText(source?.perf ?? source?.partizipII),
    komparativ: asText(source?.komparativ),
    superlativ: asText(source?.superlativ),
    imperativDu: asText(source?.imperativDu),
    imperativIhr: asText(source?.imperativIhr),
    imperativSie: asText(source?.imperativSie),
    sep: asText(source?.sep),
    cat: category || asText(source?.cat ?? source?.category),
    cloze: asText(source?.cloze),
    ans: asText(source?.ans),
    acc: Array.isArray(source?.acc) ? source.acc.map(String) : [],
    tags: asText(source?.tags),
    notes: asText(source?.notes),
    img: asText(source?.img),
    added: Number(source?.added) || Date.now(),
    last: Number(source?.last) || 0,
    due: Number(source?.due) || 0,
    ivl: Number(source?.ivl) || 0,
    ease: Number(source?.ease) || 2.5,
    stage: Number(source?.stage) || 0,
    ok: Number(source?.ok) || 0,
    bad: Number(source?.bad) || 0,
    res: asText(source?.res),
    ...(source?.cs != null ? { cs: Number(source.cs) || 0 } : {}),
  };
};

/**
 * تبدیل پاسخ هوش مصنوعی به واژه‌های قابل استفاده در برنامه
 */
export function aiToIMP(
  parsed: unknown,
  existingWords: Word[] = [],
  category = ''
): { ws: Word[]; errs: string[] } {
  const ws: Word[] = [];
  const errs: string[] = [];
  const seen = new Set(
    existingWords.map((word) => asText(word.de).toLocaleLowerCase('de'))
  );

  for (const [index, item] of unwrapWords(parsed).entries()) {
    try {
      const word = createWord(item, category);

      if (!word.de || !word.fa) {
        errs.push(`ردیف ${index + 1}: واژه آلمانی یا ترجمه فارسی ناقص است.`);
        continue;
      }

      const key = word.de.toLocaleLowerCase('de');

      if (seen.has(key)) {
        errs.push(`«${word.de}»: این واژه از قبل وجود دارد.`);
        continue;
      }

      seen.add(key);
      ws.push(word);
    } catch {
      errs.push(`ردیف ${index + 1}: تبدیل واژه با خطا مواجه شد.`);
    }
  }

  if (ws.length === 0 && errs.length === 0) {
    errs.push('هیچ واژه قابل استفاده‌ای در پاسخ پیدا نشد.');
  }

  return { ws, errs };

}


/**
 * ساخت prompt برای واردکردن و تکمیل گروهی واژه‌ها
 */
export function AIP(
  targetWord: string | Word,
  words: Word[] = [],
  category = ''
): string {
  const term = asText(
    typeof targetWord === 'string'
      ? targetWord
      : targetWord.de
  );

  // فهرست واژه‌های موجود صرفاً برای بررسی تکراری‌ها بود؛
  // نباید وارد دستور تولید یک واژه شود.
  void words;

  if (!term) {
    throw new Error('واژه‌ای برای تکمیل به هوش مصنوعی ارسال نشده است.');
  }

  return `
تو دستیار تخصصی آموزش زبان آلمانی برای فارسی‌زبانان هستی.

فقط پروفایل همین یک واژه یا عبارت را تکمیل کن.

واژه هدف:
${JSON.stringify(term)}

قوانین الزامی:
1. فقط یک شیء JSON برگردان؛ نه آرایه و نه چند واژه.
2. فیلد de باید همین واژه هدف باشد؛ واژه دیگری نساز و جایگزین نکن.
3. اگر واژه با der، die یا das نوشته شده است، آرتیکل را در art و خود اسم را در de قرار بده.
4. اگر ورودی یک عبارت یا فعل چندکلمه‌ای است، تمام عبارت را حفظ کن.
5. واژه‌های موجود، نمونه‌ها و واژه‌های پیش‌فرض برنامه ورودی تولید نیستند.
6. معنی و توضیحات را به فارسی روان بنویس.
7. برای اطلاعات نامربوط، رشته خالی قرار بده؛ اطلاعات دستوری را حدس نزن.
8. فقط JSON معتبر و بدون Markdown برگردان.

دسته‌بندی:
${JSON.stringify(category)}

ساختار دقیق خروجی:
{
  "de": "",
  "art": "",
  "fa": "",
  "syn": "",
  "synFa": "",
  "ant": "",
  "antFa": "",
  "pl": "",
  "pos": "",
  "lvl": "",
  "ex": "",
  "exFa": "",
  "ex2": "",
  "ex2Fa": "",
  "conj": "",
  "prat": "",
  "perf": "",
  "komparativ": "",
  "superlativ": "",
  "imperativDu": "",
  "imperativIhr": "",
  "imperativSie": "",
  "sep": ""
}
`.trim();
}

/**
 * ترجمه سریع واژه آلمانی
 */


/**
 * ساخت prompt برای استخراج و تکمیل گروهی واژه‌ها
 */
export function AIPM(
  words: string | Word[],
  existingWords: Word[] = [],
  category = ''
): string {
  const source = (
    typeof words === 'string'
      ? words.trim()
      : words.map((word) => asText(word?.de)).filter(Boolean).join('\n')
  );

  // واژه‌های موجود نباید باعث تولید واژه‌های پیش‌فرض شوند.
  void existingWords;

  if (!source) {
    throw new Error('هیچ واژه یا متنی برای پردازش ارسال نشده است.');
  }

  return `
تو دستیار تخصصی آموزش زبان آلمانی برای فارسی‌زبانان هستی.

وظیفه تو استخراج و تکمیل اطلاعات آموزشی فقط برای واژه‌های موجود در ورودی است.

متن ورودی:
${JSON.stringify(source)}

قوانین الزامی:
1. فقط واژه‌ها و عبارت‌های آلمانی موجود در متن ورودی را پردازش کن.
2. هیچ واژه جدید، پیش‌فرض یا پیشنهادی به فهرست اضافه نکن.
3. برای هر ورودی، فقط یک شیء خروجی تولید کن.
4. فیلد de باید همان واژه یا عبارت ورودی باشد؛ املای آن را بی‌دلیل تغییر نده.
5. اگر ورودی شامل آرتیکل der، die یا das است، آرتیکل را در art و اسم را در de قرار بده.
6. اگر ورودی با پیشوند سطح مانند [B2] شروع می‌شود، سطح را در lvl قرار بده و پیشوند را از de حذف کن.
7. معنی، ترجمه و توضیحات را به فارسی روان بنویس.
8. اگر اطلاعاتی کاربرد ندارد یا از آن مطمئن نیستی، رشته خالی قرار بده.
9. خروجی باید یک شیء JSON با کلید words و مقدار آرایه باشد.
10. فقط JSON معتبر و بدون Markdown برگردان.

دسته‌بندی:
${JSON.stringify(category)}

ساختار خروجی:
{
  "words": [
    {
      "de": "",
      "art": "",
      "fa": "",
      "syn": "",
      "synFa": "",
      "ant": "",
      "antFa": "",
      "pl": "",
      "pos": "",
      "lvl": "",
      "ex": "",
      "exFa": "",
      "ex2": "",
      "ex2Fa": "",
      "conj": "",
      "prat": "",
      "perf": "",
      "komparativ": "",
      "superlativ": "",
      "imperativDu": "",
      "imperativIhr": "",
      "imperativSie": "",
      "sep": ""
    }
  ]
}
`.trim();
}

export async function quickTranslateWithGemini(
  germanWord: string
): Promise<{ fa: string; art?: string; pos?: string; lvl?: string }> {
  const prompt = `
واژه آلمانی ${JSON.stringify(germanWord)} را برای زبان‌آموز فارسی‌زبان تحلیل کن.
فقط JSON معتبر برگردان:
{"fa":"معنی فارسی","art":"der/die/das در صورت اسم","pos":"نوع کلمه","lvl":"سطح CEFR"}
اگر واژه اسم نیست، art را رشته خالی قرار بده.
`.trim();

  const result = parseAI(
    await requestGemini(prompt, { timeoutMs: 20000 })
  );

  const item = Array.isArray(result) ? result[0] : result;

  if (!item || typeof item !== 'object' || !asText(item.fa)) {
    throw new Error('ترجمه معتبر از Gemini دریافت نشد.');
  }

  return {
    fa: asText(item.fa),
    art: asText(item.art),
    pos: asText(item.pos),
    lvl: asText(item.lvl),
  };
}

/**
 * بررسی املای واژه‌های آلمانی
 */
export async function checkGermanSpelling(
  words: string[]
): Promise<Record<string, SpellResult>> {
  const input = [...new Set(words.map(asText).filter(Boolean))];
  const output: Record<string, SpellResult> = {};

  if (!input.length) return output;

  const prompt = `
املای واژه‌های آلمانی زیر را بررسی کن.
برای هر واژه یکی از وضعیت‌های correct، corrected یا invalid را تعیین کن.
correct یعنی املای درست؛ corrected یعنی پیشنهاد اصلاح؛ invalid یعنی واژه قابل تشخیص نیست.
فقط JSON معتبر با این ساختار برگردان:
{"results":[{"word":"ورودی","status":"correct","suggestion":"","explanation":""}]}

واژه‌ها:
${JSON.stringify(input)}
`.trim();

  try {
    const parsed = parseAI(await requestGemini(prompt, { timeoutMs: 25000 }));
    const items = unwrapWords(parsed?.results ?? parsed);

    for (const item of items) {
      const word = asText(item.word ?? item.de ?? item.input);
      if (!word) continue;

      const status = asText(item.status).toLowerCase();
      const normalizedStatus: SpellResult['status'] =
        status === 'correct'
          ? 'correct'
          : status === 'corrected'
            ? 'corrected'
            : status === 'invalid'
              ? 'invalid'
              : 'unknown';

      output[word] = {
        status: normalizedStatus,
        suggestion: asText(item.suggestion),
        explanation: asText(item.explanation),
      };
    }
  } catch {
    // در صورت قطع اتصال، نتیجه unknown است؛ واژه را غلط اعلام نکن.
  }

  for (const word of input) {
    if (!output[word]) {
      output[word] = { status: 'unknown' };
    }
  }

  return output;
}

/**
 * تکمیل گروهی واژه‌های استخراج‌شده
 */
export async function processBatchWordsWithGemini(
  lines: string[],
  existingWords: Word[] = [],
  category?: string,
  onProgress?: ProgressCallback
): Promise<{ ws: Word[]; errs: string[] }> {
  const input = lines.map(asText).filter(Boolean);
  const ws: Word[] = [];
  const errs: string[] = [];

  if (!input.length) {
    return { ws, errs: ['هیچ واژه‌ای برای پردازش ارسال نشده است.'] };
  }

  const normalizeInput = (value: string): string =>
    asText(value)
      .normalize('NFC')
      .replace(/^\[(?:A1|A2|B1|B2|C1|C2)\]\s*/i, '')
      .replace(/^(?:der|die|das)\s+/i, '')
      .replace(/\s+/g, ' ')
      .toLocaleLowerCase('de');

  const batchSize = 5;

  for (let start = 0; start < input.length; start += batchSize) {
    const batch = input.slice(start, start + batchSize);
    const requested = new Set(batch.map(normalizeInput));

    onProgress?.(
      start,
      input.length,
      `در حال تکمیل واژه‌های ${start + 1} تا ${Math.min(
        start + batch.length,
        input.length
      )}`
    );

    const prompt = `
برای هر یک از ورودی‌های مشخص‌شده، اطلاعات آموزشی آلمانی تولید کن.

قوانین:
- فقط ورودی‌های آرایه را پردازش کن.
- هیچ واژه پیش‌فرض یا واژه جدیدی اضافه نکن.
- فیلد de باید با همان ورودی متناظر باشد.
- ترتیب ورودی‌ها را حفظ کن.
- اگر ورودی با پیشوند سطح مانند [B2] شروع می‌شود، آن پیشوند را از de حذف کن و سطح را در lvl قرار بده.
- برای هر ورودی یک شیء خروجی تولید کن.
- فقط JSON معتبر برگردان.

دسته‌بندی:
${JSON.stringify(category || '')}

آرایه ورودی:
${JSON.stringify(batch)}

ساختار خروجی:
{
  "words": [
    {
      "de": "",
      "art": "",
      "fa": "",
      "syn": "",
      "synFa": "",
      "ant": "",
      "antFa": "",
      "pl": "",
      "pos": "",
      "lvl": "",
      "ex": "",
      "exFa": "",
      "ex2": "",
      "ex2Fa": "",
      "conj": "",
      "prat": "",
      "perf": "",
      "komparativ": "",
      "superlativ": "",
      "imperativDu": "",
      "imperativIhr": "",
      "imperativSie": "",
      "sep": ""
    }
  ]
}
`.trim();

    try {
      const response = await requestGemini(prompt, {
        timeoutMs: 45000
      });

      const parsed = parseAI(response);
      const returned = unwrapWords(parsed);

      if (!returned.length) {
        errs.push(
          `بسته ${Math.floor(start / batchSize) + 1}: خروجی واژه‌ای نداشت.`
        );
        continue;
      }

      const converted = aiToIMP(
        returned,
        [...existingWords, ...ws],
        category || ''
      );

      const accepted = converted.ws.filter((word) =>
        requested.has(normalizeInput(word.de))
      );

      const unexpected = converted.ws.filter(
        (word) => !requested.has(normalizeInput(word.de))
      );

      ws.push(...accepted);

      errs.push(...converted.errs);

      for (const word of unexpected) {
        errs.push(
          `«${word.de}» وارد نشد؛ این واژه در فهرست ورودی این بسته نبود.`
        );
      }

      const acceptedKeys = new Set(
        accepted.map((word) => normalizeInput(word.de))
      );

      for (const term of batch) {
        if (!acceptedKeys.has(normalizeInput(term))) {
          const alreadyReported = converted.errs.some((message) =>
            message.toLocaleLowerCase('de').includes(
              normalizeInput(term)
            )
          );

          if (!alreadyReported) {
            errs.push(
              `«${term}»: در خروجی معتبر این بسته پیدا نشد.`
            );
          }
        }
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'خطای نامشخص Gemini';

      errs.push(
        `بسته ${Math.floor(start / batchSize) + 1}: ${message}`
      );
    }

    const done = Math.min(start + batch.length, input.length);

    onProgress?.(
      done,
      input.length,
      `پردازش ${done} از ${input.length} واژه`
    );
  }

  return { ws, errs };
}
