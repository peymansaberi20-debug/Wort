/**
 * konnektorAI.ts — پل تمرین «حروف ربط» به Gemini
 *
 * ▌اتصال به هوش مصنوعی برنامهٔ خودت:
 *   این فایل الان مستقیم با REST به Gemini وصل می‌شود (کلید در خود تمرین ذخیره می‌شود).
 *   وقتی فایل src/utils/ai.ts خودت را داشتی، فقط تابع «askGemini» پایین را
 *   با یک خط به تابع واقعی وصل کن، مثلاً:
 *       import { callAI } from './ai';
 *       export const askGemini: AskAI = (prompt, system) => callAI(prompt, system);
 *   بقیهٔ فایل‌ها هیچ تغییری نمی‌خواهند.
 */

export type AskAI = (prompt: string, system?: string) => Promise<string>;

const AI_STORE = 'konnektor_pro_ai';

/** کلیدهای رایجی که شاید برنامهٔ تو از قبل در localStorage داشته باشد */
const PROBE_KEYS = ['gemini_api_key', 'GEMINI_API_KEY', 'geminiKey', 'gemini_key', 'ai_api_key', 'konnektor_pro_key'];

function probeStoredKey(): string {
  for (const k of PROBE_KEYS) {
    try {
      const v = localStorage.getItem(k);
      if (v && v.trim().length > 20) return v.trim();
    } catch { /* ignore */ }
  }
  return '';
}

export interface AIConfig { key: string; model: string }

export function getAIConfig(): AIConfig {
  try {
    const c = JSON.parse(localStorage.getItem(AI_STORE) || '{}');
    return {
      key: (c.key && String(c.key).trim()) || probeStoredKey(),
      model: (c.model && String(c.model).trim()) || 'gemini-2.5-flash'
    };
  } catch {
    return { key: probeStoredKey(), model: 'gemini-2.5-flash' };
  }
}

export function setAIConfig(key: string, model: string): void {
  try {
    localStorage.setItem(AI_STORE, JSON.stringify({ key: key.trim(), model: model.trim() || 'gemini-2.5-flash' }));
  } catch { /* ignore */ }
}

export const hasAIKey = (): boolean => getAIConfig().key.length > 20;

/** پیام خطای خوانا برای کاربر */
export const aiErrorText = (e: unknown): string => {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === 'NO_KEY') return 'کلید Gemini تنظیم نشده — در کارت «اتصال هوش مصنوعی» کلید را وارد کن.';
  if (msg.startsWith('AI_HTTP_403') || msg.startsWith('AI_HTTP_400')) return 'کلید Gemini نامعتبر است یا مدل در دسترس نیست.';
  if (msg.startsWith('AI_HTTP_429')) return 'محدودیت تعداد درخواست Gemini — کمی بعد دوباره تلاش کن.';
  if (msg.startsWith('AI_HTTP_')) return 'خطای شبکه/سرور Gemini: ' + msg.slice(0, 120);
  if (msg === 'AI_EMPTY') return 'هوش مصنوعی پاسخ خالی داد — دوباره تلاش کن.';
  if (msg === 'AI_PARSE') return 'پاسخ هوش مصنوعی قابل تبدیل به JSON نبود — دوباره تلاش کن.';
  return 'خطای نامشخص در اتصال به هوش مصنوعی: ' + msg.slice(0, 120);
};

/**
 * فراخوانی Gemini (v1beta generateContent).
 * ▌نقطهٔ تعویض به ai.ts برنامهٔ خودت (توضیح بالای فایل).
 */
export const askGemini: AskAI = async (prompt, system) => {
  const { key, model } = getAIConfig();
  if (!key || key.length < 20) throw new Error('NO_KEY');
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: (system ? system + '\n\n' : '') + prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }
      })
    }
  );
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`AI_HTTP_${res.status}: ${t.slice(0, 200)}`);
  }
  const j = await res.json();
  const text: string = (j?.candidates?.[0]?.content?.parts || [])
    .map((p: { text?: string }) => p.text || '')
    .filter(Boolean)
    .join('');
  if (!text.trim()) throw new Error('AI_EMPTY');
  return text;
};

/** تبدیل پاسخ AI به JSON حتی وقتی ```json یا متن اضافه دارد */
export function parseJSONLoose<T>(raw: string): T {
  let s = raw.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  const tryParse = (x: string): T | null => {
    try { return JSON.parse(x) as T; } catch { return null; }
  };
  let out = tryParse(s);
  if (out) return out;
  const a = s.indexOf('['), b = s.lastIndexOf(']');
  if (a >= 0 && b > a) { out = tryParse(s.slice(a, b + 1)); if (out) return out; }
  const ao = s.indexOf('{'), bo = s.lastIndexOf('}');
  if (ao >= 0 && bo > ao) { out = tryParse(s.slice(ao, bo + 1)); if (out) return out; }
  throw new Error('AI_PARSE');
}
