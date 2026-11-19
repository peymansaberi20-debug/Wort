/**
 * aiProvider.ts — پل هوش مصنوعی برنامه (Gemini / Groq / OpenRouter)
 * نسخهٔ «کاوشگر» — چرا؟ تمرین‌ها می‌گفتند «کلید فعال نشده» در حالی که صفحهٔ تنظیمات «وصل» را نشان می‌داد.
 * این نسخه کلید را از هر قرارداد ذخیرهٔ معروفی پیدا می‌کند:
 *   ۱) آبجکت‌های تنظیمات JSON با هر نامی (key / apiKey / api_key / geminiKey / token …)
 *   ۲) کلیدهای تخت localStorage (gemini_api_key، ai_api_key، groq_api_key …)
 *   ۳) جستجوی عمیق در «همهٔ» ورودی‌های localStorage با تشخیص الگوی خود کلیدها
 *      (Gemini با AIza… ، Groq با gsk_… ، OpenRouter با sk-or-…)
 * محتوای کلید هرگز لاگ یا نمایش داده نمی‌شود — فقط محل کشف و طولش.
 */

export type ProviderId = 'gemini' | 'groq' | 'openrouter';

export const PROVIDERS: Record<string, { label: string; vision: boolean }> = {
  gemini: { label: 'Gemini', vision: true },
  groq: { label: 'Groq', vision: false },
  openrouter: { label: 'OpenRouter', vision: true },
};
/** نام جایگزین که بعضی صفحه‌های تنظیمات import می‌کنند */
export const AI_PROVIDERS = PROVIDERS;

export interface GenerateOpts { json?: boolean; timeoutMs?: number; retries?: number; }
export interface AIConfig { key: string; model: string; provider: ProviderId; source: string; }
export interface AiDebugInfo { found: boolean; source: string; provider: ProviderId; model: string; keyLen: number; }

interface Detected extends AIConfig { explicitModel: boolean; }

/* ───────────── الگوهای خود کلیدها ───────────── */
const KEY_RES: Array<{ re: RegExp; provider: ProviderId }> = [
  { re: /AIza[0-9A-Za-z_\-]{20,}/, provider: 'gemini' },
  { re: /gsk_[0-9A-Za-z]{20,}/, provider: 'groq' },
  { re: /sk-or-[0-9A-Za-z\-]{20,}/, provider: 'openrouter' },
];
const KEY_FIELDS = /^(key|apiKey|api_key|geminiKey|gemini_api_key|groqKey|groq_api_key|openrouterKey|openrouter_api_key|token|api)$/i;
const MODEL_FIELDS = /^(model|modelName|model_name|aiModel)$/i;
const PROVIDER_FIELDS = /^(provider|vendor|aiProvider)$/i;

const JSON_SETTINGS_KEYS = [
  'worter_ai_settings', 'ai_settings', 'aiSettings', 'ai_config', 'aiConfig',
  'app_ai_settings', 'settings_ai', 'konnektor_pro_ai', 'ai', 'worter_ai',
];
const PLAIN_KEY_CANDIDATES = [
  'gemini_api_key', 'GEMINI_API_KEY', 'geminiKey', 'gemini_key',
  'ai_api_key', 'ai_apiKey', 'ai_key', 'apiKey', 'API_KEY',
  'groq_api_key', 'GROQ_API_KEY', 'openrouter_api_key', 'OPENROUTER_API_KEY',
  'konnektor_pro_key',
];

const DEFAULT_MODELS: Record<ProviderId, string> = {
  gemini: 'gemini-2.5-flash',
  groq: 'llama-3.3-70b-versatile',
  openrouter: 'openrouter/auto',
};

function matchKey(v: string): { key: string; provider: ProviderId } | null {
  for (const { re, provider } of KEY_RES) {
    const m = v.match(re);
    if (m) return { key: m[0], provider };
  }
  return null;
}

function normProvider(v: unknown): ProviderId | null {
  const s = String(v || '').toLowerCase().trim();
  if (s.includes('gemini') || s === 'google') return 'gemini';
  if (s.includes('groq')) return 'groq';
  if (s.includes('openrouter')) return 'openrouter';
  return null;
}

function fromJsonBlob(raw: string, source: string): Detected | null {
  let o: any;
  try { o = JSON.parse(raw); } catch { return null; }
  if (!o || typeof o !== 'object') return null;
  const blobs: any[] = [o, o.ai, o.aiSettings, o.ai_settings, o.aiConfig].filter(x => x && typeof x === 'object');
  for (const b of blobs) {
    let found: { key: string; provider: ProviderId } | null = null;
    let model = '', providerHint: ProviderId | null = null;
    for (const k of Object.keys(b)) {
      const v = b[k];
      if (typeof v !== 'string' || !v.trim()) continue;
      if (!found && KEY_FIELDS.test(k)) { const mk = matchKey(v); if (mk) found = mk; }
      else if (MODEL_FIELDS.test(k)) model = v.trim();
      else if (PROVIDER_FIELDS.test(k)) providerHint = normProvider(v);
      if (!found && typeof v === 'string' && v.length < 500) { const mk = matchKey(v); if (mk) found = mk; }
    }
    if (found) {
      const provider = providerHint || found.provider;
      return { ...found, provider, model: model || DEFAULT_MODELS[provider], source, explicitModel: !!model };
    }
  }
  return null;
}

/* ───────────── کشف تنظیمات ───────────── */
let cache: Detected | null | undefined; // undefined = هنوز نشناخته، null = چیزی نبود

export function invalidateAiCache(): void { cache = undefined; }

function detect(): Detected | null {
  if (cache !== undefined) return cache;
  let res: Detected | null = null;
  try {
    if (typeof localStorage === 'undefined') { cache = null; return null; }
    // ۱) آبجکت‌های تنظیمات JSON با نام‌های معروف
    for (const k of JSON_SETTINGS_KEYS) {
      const v = localStorage.getItem(k);
      if (!v) continue;
      const d = fromJsonBlob(v, k);
      if (d) { res = d; break; }
    }
    // ۲) کلیدهای تخت معروف
    if (!res) {
      for (const k of PLAIN_KEY_CANDIDATES) {
        const v = (localStorage.getItem(k) || '').trim();
        if (!v) continue;
        const mk = matchKey(v);
        if (mk) { res = { ...mk, model: DEFAULT_MODELS[mk.provider], source: k, explicitModel: false }; break; }
      }
    }
    // ۳) جستجوی عمیق در همهٔ ورودی‌ها
    if (!res) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        const v = localStorage.getItem(k) || '';
        if (!v || v.length > 100000) continue;
        // مقدار تخت خودِ کلید
        if (v.length < 500) { const mk = matchKey(v.trim()); if (mk) { res = { ...mk, model: DEFAULT_MODELS[mk.provider], source: k, explicitModel: false }; break; } }
        // یا آبجکت JSON با فیلد کلید
        if (v.trim().startsWith('{') || v.trim().startsWith('[')) {
          const d = fromJsonBlob(v, k);
          if (d) { res = d; break; }
        }
      }
    }
  } catch { /* localStorage در دسترس نیست */ }
  cache = res;
  return res;
}

/** تنظیمات فعلی — حتی اگر صفحهٔ تنظیمات با قرارداد متفاوتی ذخیره کرده باشد */
export function getAIConfig(): AIConfig {
  const d = detect();
  if (d) return { key: d.key, model: d.model, provider: d.provider, source: d.source };
  return { key: '', model: '', provider: 'gemini', source: '' };
}

/** ذخیرهٔ آگاهانهٔ تنظیمات (صفحهٔ تنظیمات می‌تواند از این استفاده کند) */
export function setAIConfig(key: string, model: string, provider?: ProviderId): void {
  const k = key.trim();
  const mk = matchKey(k);
  const p: ProviderId = provider || (mk ? mk.provider : 'gemini');
  const m = model.trim() || DEFAULT_MODELS[p];
  try {
    localStorage.setItem('worter_ai_settings', JSON.stringify({ provider: p, key: k, model: m }));
    localStorage.setItem('ai_settings', JSON.stringify({ provider: p, key: k, model: m }));
    invalidateAiCache();
  } catch { /* ignore */ }
}
/** نام‌های جایگزین رایج */
export const saveAiSettings = setAIConfig;
export const loadAiSettings = getAIConfig;

export function hasApiKey(): boolean { return !!detect(); }

export function getActiveProvider(): ProviderId { return detect()?.provider || 'gemini'; }

export function getModel(): string { return detect()?.model || DEFAULT_MODELS[getActiveProvider()]; }

/** اطلاعات وضعیت برای نمایش — بدون محتوای کلید */
export function getAiDebugInfo(): AiDebugInfo {
  const d = detect();
  if (!d) return { found: false, source: 'هیچ کلیدی در حافظهٔ برنامه پیدا نشد', provider: 'gemini', model: '', keyLen: 0 };
  return { found: true, source: d.source, provider: d.provider, model: d.model, keyLen: d.key.length };
}

/** کلید فعال (برای کدهای قدیمی که خودشان مستقیم REST می‌زنند) */
export function getApiKey(): string { return getAIConfig().key || ''; }

/** تست اتصال سریع — true یعنی کلید و مدل پاسخ می‌دهند */
export async function testConnection(): Promise<boolean> {
  try { const r = await generateText('Antworte nur mit: OK', { timeoutMs: 15000, retries: 0 }); return !!r; }
  catch { return false; }
}

/* ───────────── فراخوانی REST ───────────── */
const aiErr = (code: string): Error => { const e = new Error(code); (e as any).aiCode = true; return e; };

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try { return await fetch(url, { ...init, signal: ac.signal }); }
  finally { clearTimeout(t); }
}

function extractTextGemini(data: any): string {
  const parts = data?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts) ? parts.map((p: any) => p?.text || '').join('') : '';
  if (!text.trim()) {
    const reason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason || '';
    throw aiErr(reason && reason !== 'STOP' ? 'AI_BLOCKED:' + String(reason) : 'AI_EMPTY');
  }
  return text;
}

function extractTextOpenAI(data: any): string {
  const text = data?.choices?.[0]?.message?.content;
  if (!text || !String(text).trim()) throw aiErr('AI_EMPTY');
  return String(text);
}

function toOpenAiMessages(prompt: string, images: Array<{ mimeType: string; data: string }>, json: boolean): any[] {
  const text = json ? prompt + '\n\nAntworte NUR mit gültigem JSON.' : prompt;
  if (!images.length) return [{ role: 'user', content: text }];
  return [{
    role: 'user',
    content: [
      { type: 'text', text },
      ...images.map(i => ({ type: 'image_url', image_url: { url: `data:${i.mimeType};base64,${i.data}` } })),
    ],
  }];
}

async function callProvider(prompt: string, images: Array<{ mimeType: string; data: string }>, opts: GenerateOpts): Promise<string> {
  const cfg = getAIConfig();
  if (!cfg.key) throw aiErr('NO_KEY');
  const json = !!opts.json;
  const timeoutMs = opts.timeoutMs ?? 60000;
  const url = {
    gemini: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`,
    groq: 'https://api.groq.com/openai/v1/chat/completions',
    openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  }[cfg.provider];

  let init: RequestInit;
  if (cfg.provider === 'gemini') {
    init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.key },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: prompt }, ...images.map(i => ({ inlineData: { mimeType: i.mimeType, data: i.data } }))],
        }],
        generationConfig: { temperature: 0.8, ...(json ? { responseMimeType: 'application/json' } : {}) },
      }),
    };
  } else {
    init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.key}` },
      body: JSON.stringify({ model: cfg.model, messages: toOpenAiMessages(prompt, images, json), temperature: 0.8 }),
    };
  }

  let res: Response;
  try {
    res = await fetchWithTimeout(url, init, timeoutMs);
  } catch (e: any) {
    if (e?.name === 'AbortError') throw aiErr('AI_TIMEOUT');
    throw aiErr('AI_NETWORK');
  }
  if (!res.ok) throw aiErr('AI_HTTP_' + res.status);
  let data: any;
  try { data = await res.json(); } catch { throw aiErr('AI_EMPTY'); }
  return cfg.provider === 'gemini' ? extractTextGemini(data) : extractTextOpenAI(data);
}

const RETRYABLE = (code: string): boolean =>
  code === 'AI_TIMEOUT' || code === 'AI_NETWORK' ||
  code === 'AI_HTTP_429' || /^AI_HTTP_5/.test(code);

/** متن ساده یا JSON (بسته به opts.json) — بازخوانی خودکار روی خطای موقت */
export async function generateText(prompt: string, opts: GenerateOpts = {}): Promise<string> {
  const attempts = 1 + Math.max(0, opts.retries ?? 0);
  let last: unknown;
  for (let a = 0; a < attempts; a++) {
    try { return await callProvider(prompt, [], opts); }
    catch (e) { last = e; if (a < attempts - 1 && RETRYABLE((e as Error).message)) { await new Promise(r => setTimeout(r, 800)); continue; } }
  }
  throw last;
}

/** مثل generateText ولی با تصویر (OCR/تصحیح عکس) */
export async function generateWithImages(
  prompt: string,
  images: Array<{ mimeType: string; data: string }>,
  opts: GenerateOpts = {}
): Promise<string> {
  const attempts = 1 + Math.max(0, opts.retries ?? 0);
  let last: unknown;
  for (let a = 0; a < attempts; a++) {
    try { return await callProvider(prompt, images.filter(i => i && i.data), opts); }
    catch (e) { last = e; if (a < attempts - 1 && RETRYABLE((e as Error).message)) { await new Promise(r => setTimeout(r, 800)); continue; } }
  }
  throw last;
}
/** نام جایگزین رایج */
export const callAI = generateText;

/** پیام خطای خوانا برای کاربر */
export function describeAiError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e || '');
  if (msg === 'NO_KEY') return 'هوش مصنوعی در تنظیمات برنامه فعال نیست — کلید را در صفحهٔ تنظیمات وارد کن.';
  if (msg === 'AI_TIMEOUT') return 'هوش مصنوعی دیر جواب داد (timeout) — کمی بعد دوباره تلاش کن.';
  if (msg === 'AI_NETWORK') return 'اتصال به سرور هوش مصنوعی برقرار نشد — اینترنت را چک کن.';
  if (msg.startsWith('AI_BLOCKED')) return 'پاسخ توسط فیلتر ایمنی ارائه‌دهنده بازداشته شد — سؤال را کمی عوض کن.';
  if (msg.startsWith('AI_HTTP_401') || msg.startsWith('AI_HTTP_403')) return 'کلید هوش مصنوعی نامعتبر است یا اجازه ندارد — در تنظیمات چک کن.';
  if (msg.startsWith('AI_HTTP_404')) return 'مدل انتخابی پیدا نشد — در تنظیمات مدل را عوض کن.';
  if (msg.startsWith('AI_HTTP_429')) return 'محدودیت تعداد درخواست — کمی بعد دوباره تلاش کن.';
  if (/^AI_HTTP_5/.test(msg)) return 'خطای سرور ارائه‌دهنده (' + msg.replace('AI_HTTP_', 'کد ') + ') — کمی بعد تلاش کن.';
  if (msg.startsWith('AI_HTTP_')) return 'خطای HTTP ارائه‌دهنده: ' + msg.replace('AI_HTTP_', '');
  if (msg === 'AI_EMPTY') return 'هوش مصنوعی پاسخ خالی داد — دوباره تلاش کن.';
  if (msg === 'AI_PARSE') return 'پاسخ هوش مصنوعی قابل تبدیل به JSON نبود — دوباره تلاش کن.';
  return 'خطای نامشخص در اتصال به هوش مصنوعی: ' + msg.slice(0, 120);
}
