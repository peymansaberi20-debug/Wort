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
export function AIPM(
  words: string | Word[],
  existingWords: Word[] = [],
  category = ''
): string {
  const input =
    typeof words === 'string'
      ? words
      : words.map((word) => word.de).filter(Boolean).join('\n');

  const existing = existingWords
    .map((word) => word.de)
    .filter(Boolean)
    .slice(0, 150);

  return `
تو دستیار تخصصی آموزش زبان آلمانی برای فارسی‌زبانان هستی.
برای هر واژه اطلاعات آموزشی آلمانی به فارسی تولید کن.
فقط JSON معتبر و بدون Markdown برگردان.

دسته‌بندی: ${JSON.stringify(category)}
واژه‌های موجود: ${JSON.stringify(existing)}
واژه‌های ورودی:
${input}

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

/**
 * ساخت prompt برای تهیه اطلاعات یک واژه
 */
export function AIP(
  targetWord: string | Word,
  words: Word[] = [],
  category = ''
): string {
  const term =
    typeof targetWord === 'string'
      ? targetWord
      : targetWord.de;

  const existing = words
    .slice(0, 150)
    .map((word) => word.de)
    .filter(Boolean)
    .join(', ');

  return `
تو دستیار تخصصی آموزش زبان آلمانی برای فارسی‌زبانان هستی.
برای واژه زیر اطلاعات آموزشی دقیق تولید کن.
معنی‌ها و توضیحات فارسی روان باشند.
فقط JSON معتبر و بدون Markdown برگردان.

واژه: ${JSON.stringify(term)}
دسته‌بندی: ${JSON.stringify(category)}
واژه‌های موجود برای جلوگیری از تکرار: ${JSON.stringify(existing)}

ساختار خروجی:
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

  const batchSize = 5;

  for (let start = 0; start < input.length; start += batchSize) {
    const batch = input.slice(start, start + batchSize);

    onProgress?.(
      start,
      input.length,
      `در حال تکمیل واژه‌های ${start + 1} تا ${Math.min(start + batch.length, input.length)}`
    );

    const prompt = `
برای هر یک از واژه‌ها یا عبارت‌های زیر اطلاعات آموزشی آلمانی تولید کن.
خروجی فقط JSON معتبر و شامل آرایه‌ای در کلید words باشد.
ترجمه فارسی، نوع کلمه و مثال‌ها را تا حد ممکن دقیق بنویس.
واژه‌های ناقص یا غیرقابل تشخیص را حدس نزن.

ساختار هر واژه:
{"de":"","art":"","fa":"","syn":"","synFa":"","ant":"","antFa":"","pl":"","pos":"","lvl":"","ex":"","exFa":"","ex2":"","ex2Fa":"","conj":"","prat":"","perf":"","komparativ":"","superlativ":"","imperativDu":"","imperativIhr":"","imperativSie":"","sep":""}

دسته‌بندی: ${JSON.stringify(category || '')}
واژه‌های ورودی: ${JSON.stringify(batch)}

خروجی:
{"words":[...]}
`.trim();

    try {
      const response = await requestGemini(prompt, { timeoutMs: 45000 });
      const parsed = parseAI(response);
      const converted = aiToIMP(
        parsed?.words ?? parsed,
        [...existingWords, ...ws],
        category || ''
      );

      ws.push(...converted.ws);
      errs.push(...converted.errs);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'خطای نامشخص Gemini';

      errs.push(`بسته ${Math.floor(start / batchSize) + 1}: ${message}`);
    }

    const done = Math.min(start + batch.length, input.length);
    onProgress?.(done, input.length, `پردازش ${done} از ${input.length} واژه`);
  }

  return { ws, errs };
}
