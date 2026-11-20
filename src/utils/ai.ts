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

export interface ProviderMeta { label: string; name: string; vision: boolean; models: string[]; modelExamples: string[]; keyUrl: string; baseUrl: string; }

const BASE_PROVIDERS: Record<string, ProviderMeta> = {
  gemini: {
    label: 'Gemini', name: 'Gemini', vision: true,
    models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro', 'gemini-flash-latest'],
    modelExamples: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro', 'gemini-flash-latest'],
    keyUrl: 'https://aistudio.google.com/apikey',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  },
  groq: {
    label: 'Groq', name: 'Groq', vision: false,
    models: ['openai/gpt-oss-120b', 'qwen/qwen3-32b', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'],
    modelExamples: ['openai/gpt-oss-120b', 'qwen/qwen3-32b', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'],
    keyUrl: 'https://console.groq.com/keys',
    baseUrl: 'https://api.groq.com/openai/v1',
  },
  openrouter: {
    label: 'OpenRouter', name: 'OpenRouter', vision: true,
    models: ['openrouter/auto', 'google/gemini-2.5-flash', 'anthropic/claude-sonnet-4.5', 'openai/gpt-4o-mini'],
    modelExamples: ['openrouter/auto', 'google/gemini-2.5-flash', 'anthropic/claude-sonnet-4.5', 'openai/gpt-4o-mini'],
    keyUrl: 'https://openrouter.ai/keys',
    baseUrl: 'https://openrouter.ai/api/v1',
  },
};

/** PROVIDERS مقاوم: هر id ناشناسی هم فیلد کامل پیش‌فرض می‌گیرد تا UI هرگز به فیلد گم‌شده سفید نشود */
export const PROVIDERS: Record<string, ProviderMeta> = new Proxy(BASE_PROVIDERS, {
  get(t, p) {
    if (typeof p !== 'string' || p === 'then') return undefined;
    if (p in t) return t[p];
    return { label: p, name: p, vision: false, models: [], modelExamples: [], keyUrl: '', baseUrl: '' };
  },
});
/** نام جایگزین که بعضی صفحه‌های تنظیمات import می‌کنند */
export const AI_PROVIDERS = PROVIDERS;

/** ترتیب ارائه‌دهنده‌ها برای منوها */
export const PROVIDER_IDS: ProviderId[] = ['gemini', 'groq', 'openrouter'];

/** خطای استاندارد هوش مصنوعی — کد در code و message */
export class AiError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message || code);
    this.name = 'AiError';
    this.code = code;
  }
}

export interface GenerateOpts { json?: boolean; timeoutMs?: number; retries?: number; model?: string; }
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
  // قرارداد صفحهٔ تنظیمات همین برنامه (wort_ai_key_…)
  'wort_ai_key_gemini', 'wort_ai_key_groq', 'wort_ai_key_openrouter',
  'gemini_api_key', 'GEMINI_API_KEY', 'geminiKey', 'gemini_key',
  'ai_api_key', 'ai_apiKey', 'ai_key', 'apiKey', 'API_KEY',
  'groq_api_key', 'GROQ_API_KEY', 'openrouter_api_key', 'OPENROUTER_API_KEY',
  'konnektor_pro_key',
];

const DEFAULT_MODELS: Record<ProviderId, string> = {
  gemini: 'gemini-2.5-flash',
  // llama-3.3-70b-versatile از ۱۶ اوت ۲۰۲۶ برای حساب‌های معمولی جمع شده — جایگزین رسمی گروق:
  groq: 'openai/gpt-oss-120b',
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

/** نام مدل تمیز: حذف فاصله و پیشوند models/ که بعضی ذخیره‌ها دارند (۴۰۴ می‌دهد) */
export function sanitizeModel(m: string): string {
  let s = (m || '').trim();
  while (s.toLowerCase().startsWith('models/')) s = s.slice(7);
  return s.trim();
}

/** ارائه‌دهندهٔ معتبر از hint و کلید — idهای ناشناس (مثلاً openai قدیمی) را نرمال می‌کند */
function knownProvider(hint: unknown, key?: string): ProviderId {
  const h = normProvider(hint);
  if (h) return h;
  const mk = key ? matchKey(key) : null;
  return mk?.provider || 'gemini';
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
      else if (MODEL_FIELDS.test(k)) model = sanitizeModel(v);
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
    // ۰) کلید نشستِ ارائه‌دهندهٔ فعال (persist=false کارت تنظیمات)
    const ap0 = readStored().provider;
    if (ap0 && PROVIDER_IDS.includes(ap0) && SESSION_KEYS[ap0]) {
      const m = sanitizeModel(readStored().model || '');
      res = { key: SESSION_KEYS[ap0] as string, provider: ap0, model: m || DEFAULT_MODELS[ap0], source: 'کلید نشست (بدون ذخیره)', explicitModel: !!m };
    }
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
    // ۴) کلید ذخیره‌شدهٔ متعارف حتی اگر الگویش را نشناسیم (مثلاً کلید پروژه)
    if (!res) {
      const s = readStored();
      if (s.key && s.key.length > 20) {
        const p = knownProvider(s.provider, s.key);
        const m = sanitizeModel(s.model || '');
        res = { key: s.key, provider: p, model: m || DEFAULT_MODELS[p], source: CANON[0], explicitModel: !!m };
      }
    }
    // ۵) مدل ذخیره‌شدهٔ متعارف حتی وقتی کلید از جای دیگری آمده
    if (res && !res.explicitModel) {
      const m = sanitizeModel(readStored().model || '');
      if (m && m !== res.model) res = { ...res, model: m, explicitModel: true };
    }
    // ۶) کلید نشست هر ارائه‌دهندهٔ دیگر
    if (!res) {
      for (const p of PROVIDER_IDS) {
        if (SESSION_KEYS[p]) {
          res = { key: SESSION_KEYS[p] as string, provider: p, model: perProviderModel(p) || DEFAULT_MODELS[p], source: 'کلید نشست (بدون ذخیره)', explicitModel: false };
          break;
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

/* ───────────── ذخیرهٔ متعارف — API صفحهٔ تنظیمات (GeminiKeyCard) ───────────── */
const CANON = ['worter_ai_settings', 'ai_settings'];

/** کلیدهای نشست (persist=false کارت تنظیمات) — فقط در حافظه، هرگز در localStorage */
const SESSION_KEYS: Partial<Record<ProviderId, string>> = {};

/** کلید یک ارائه‌دهندهٔ مشخص — قرارداد کارت تنظیمات: wort_ai_key_<id> */
function perProviderKey(p: ProviderId): string {
  const s = SESSION_KEYS[p];
  if (s) return s;
  try {
    const v = (localStorage.getItem('wort_ai_key_' + p) || '').trim();
    if (v) return v;
  } catch { /* ignore */ }
  const st = readStored();
  if (st.key && st.provider === p) return st.key;
  return '';
}

/** مدل یک ارائه‌دهندهٔ مشخص — قرارداد کارت تنظیمات: wort_ai_model_<id> */
function perProviderModel(p: ProviderId): string {
  try {
    const m = sanitizeModel(localStorage.getItem('wort_ai_model_' + p) || '');
    if (m) return m;
  } catch { /* ignore */ }
  const st = readStored();
  if (st.provider === p) return sanitizeModel(st.model || '');
  return '';
}

function readStored(): { provider?: ProviderId; key?: string; model?: string } {
  for (const k of CANON) {
    try {
      const o = JSON.parse(localStorage.getItem(k) || 'null');
      if (o && typeof o === 'object') return o;
    } catch { /* ignore */ }
  }
  return {};
}

function writeStored(patch: { provider?: ProviderId; key?: string; model?: string }): void {
  const cur = readStored();
  const next = { provider: patch.provider ?? cur.provider, key: patch.key ?? cur.key, model: patch.model ?? cur.model };
  try {
    const json = JSON.stringify(next);
    localStorage.setItem(CANON[0], json);
    localStorage.setItem(CANON[1], json);
    if (next.key) {
      const p = next.provider || matchKey(next.key)?.provider;
      if (p) localStorage.setItem(p + '_api_key', next.key);
    }
    invalidateAiCache();
  } catch { /* ignore */ }
}

/**
 * ذخیرهٔ کلید — دو فرم:
 *   setApiKey(key)                     فرم قدیمی: کلید سراسری در ذخیرهٔ متعارف
 *   setApiKey(provider, key, persist)  فرم کارت تنظیمات: کلید مخصوص همان ارائه‌دهنده
 * رشتهٔ خالی یعنی پاک کردن.
 */
export function setApiKey(providerOrKey: ProviderId | string, key?: string, persist: boolean = true): void {
  if (key === undefined) {
    const k = (providerOrKey || '').trim();
    if (!k) { clearApiKey(); return; }
    writeStored({ key: k });
    return;
  }
  const p = providerOrKey as ProviderId;
  const k = (key || '').trim();
  if (!k) { clearApiKey(p); return; }
  if (persist) {
    try { localStorage.setItem('wort_ai_key_' + p, k); } catch { /* ignore */ }
    delete SESSION_KEYS[p];
    writeStored({ provider: p, key: k });
  } else {
    SESSION_KEYS[p] = k;
    try { localStorage.removeItem('wort_ai_key_' + p); } catch { /* ignore */ }
    // ارائه‌دهنده فعال می‌شود ولی کلید در localStorage نمی‌آید
    writeStored({ provider: p, key: '' });
  }
}

/** ذخیرهٔ مدل — setModel(model) فرم قدیمی، setModel(provider, model) فرم کارت تنظیمات */
export function setModel(providerOrModel: ProviderId | string, model?: string): void {
  if (model === undefined) {
    writeStored({ model: (providerOrModel || '').trim() });
    return;
  }
  const p = providerOrModel as ProviderId;
  const m = (model || '').trim();
  try { localStorage.setItem('wort_ai_model_' + p, m); } catch { /* ignore */ }
  const st = readStored();
  if (!st.provider || st.provider === p) writeStored({ model: m });
}

/** تغییر ارائه‌دهندهٔ فعال — مدل ناسازگار خودکار به پیش‌فرض همان ارائه‌دهنده می‌رود */
export function setActiveProvider(p: ProviderId): void {
  const m = (readStored().model || '').trim();
  const fits = p === 'gemini' ? m.startsWith('gemini') : !!m && !m.startsWith('gemini');
  writeStored({ provider: p, model: fits ? m : DEFAULT_MODELS[p] });
}

/** پاک کردن کلید و تنظیمات — با id فقط همان ارائه‌دهنده، بدون id همه */
export function clearApiKey(provider?: ProviderId): void {
  if (!provider) {
    try {
      for (const k of CANON) localStorage.removeItem(k);
      for (const k of PLAIN_KEY_CANDIDATES) {
        if (k === 'apiKey' || k === 'API_KEY') continue; // نام عمومی — ممکن است بخش دیگری استفاده کند
        localStorage.removeItem(k);
      }
      for (const p of PROVIDER_IDS) {
        localStorage.removeItem('wort_ai_key_' + p);
        localStorage.removeItem('wort_ai_model_' + p);
        localStorage.removeItem(p + '_api_key');
      }
    } catch { /* ignore */ }
    for (const p of PROVIDER_IDS) delete SESSION_KEYS[p];
    invalidateAiCache();
    return;
  }
  try {
    localStorage.removeItem('wort_ai_key_' + provider);
    localStorage.removeItem('wort_ai_model_' + provider);
    localStorage.removeItem(provider + '_api_key');
    const st = readStored();
    if (!st.provider || st.provider === provider) {
      for (const k of CANON) localStorage.removeItem(k);
    }
  } catch { /* ignore */ }
  delete SESSION_KEYS[provider];
  invalidateAiCache();
}

/** کلید ذخیره‌شده در دسترس است؟ — با id فقط همان ارائه‌دهنده، بدون id کلاً */
export function isKeyPersisted(provider?: ProviderId): boolean {
  if (provider) {
    if (SESSION_KEYS[provider]) return false; // فقط نشست — ذخیره نشده
    try { if ((localStorage.getItem('wort_ai_key_' + provider) || '').trim()) return true; } catch { /* ignore */ }
    const st = readStored();
    return !!(st.key && st.provider === provider);
  }
  return !!detect();
}

export function hasApiKey(_provider?: ProviderId): boolean { return !!detect(); }

export function getActiveProvider(): ProviderId {
  const s = readStored();
  if (s.provider && PROVIDER_IDS.includes(s.provider)) return s.provider;
  return detect()?.provider || 'gemini';
}

export function getModel(provider?: ProviderId): string {
  if (provider) return perProviderModel(provider) || DEFAULT_MODELS[provider];
  const s = readStored();
  const m = sanitizeModel(s.model || '');
  if (m) return m;
  return detect()?.model || DEFAULT_MODELS[getActiveProvider()];
}

/** اطلاعات وضعیت برای نمایش — بدون محتوای کلید */
export function getAiDebugInfo(): AiDebugInfo {
  const d = detect();
  if (!d) return { found: false, source: 'هیچ کلیدی در حافظهٔ برنامه پیدا نشد', provider: 'gemini', model: '', keyLen: 0 };
  return { found: true, source: d.source, provider: d.provider, model: d.model, keyLen: d.key.length };
}

/** کلید فعال (برای کدهای قدیمی که خودشان مستقیم REST می‌زنند) — با id فقط همان ارائه‌دهنده */
export function getApiKey(provider?: ProviderId): string {
  if (provider) return perProviderKey(provider);
  return readStored().key || getAIConfig().key || '';
}

/** آزمون اتصال کارت تنظیمات — فقط کلید داده‌شده را امتحان می‌کند و هیچ چیز را ذخیره/تغییر نمی‌دهد */
export async function testConnection(provider?: ProviderId, key?: string): Promise<{ ok: boolean; message: string }> {
  const p = provider || getActiveProvider();
  const k = (key || '').trim() || getApiKey(p);
  if (!k) return { ok: false, message: 'ابتدا کلید API را وارد کنید.' };
  const model = getModel(p) || DEFAULT_MODELS[p];
  try {
    await callProvider('Antworte nur mit: OK', [], { timeoutMs: 15000, retries: 0 }, { provider: p, key: k, model });
    return { ok: true, message: 'اتصال با «' + (PROVIDERS[p]?.label || p) + '» برقرار است و مدل «' + model + '» پاسخ داد.' };
  } catch (e) {
    return { ok: false, message: describeAiError(e) };
  }
}

/* ───────────── فراخوانی REST ───────────── */
const aiErr = (code: string): AiError => new AiError(code);

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

/** لیست مدل‌های واقعی حساب از خود ارائه‌دهنده — برای خودترمیمی وقتی مدل ذخیره‌شده منقضی شده */
async function fetchProviderModels(provider: ProviderId, key: string): Promise<string[] | null> {
  const urls: Record<ProviderId, string> = {
    gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
    groq: 'https://api.groq.com/openai/v1/models',
    openrouter: 'https://openrouter.ai/api/v1/models',
  };
  const headers: Record<string, string> = provider === 'gemini'
    ? { 'x-goog-api-key': key }
    : { 'Authorization': `Bearer ${key}` };
  try {
    const res = await fetchWithTimeout(urls[provider], { method: 'GET', headers }, 15000);
    if (!res.ok) return null;
    const data: any = await res.json();
    const raw: any[] = provider === 'gemini' ? (data?.models || []) : (data?.data || []);
    const ids = raw
      .map((m: any) => sanitizeModel(String(provider === 'gemini' ? (m?.name ?? '') : (m?.id ?? ''))))
      .filter(Boolean);
    return ids.length ? ids : null;
  } catch { return null; }
}

/** بهترین مدل چتِ در دسترس از میان لیست واقعی حساب */
function pickChatModel(ids: string[], provider: ProviderId): string | null {
  const BAD = /(whisper|tts|guard|embed|rank|aqa|imagen|veo|live|learnlm|playai|distil)/i;
  const good = ids.filter(i => !BAD.test(i) && (provider !== 'gemini' || /gemini/i.test(i)));
  if (!good.length) return null;
  const PREF = provider === 'gemini'
    ? ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite']
    : provider === 'groq'
      ? ['openai/gpt-oss-120b', 'qwen/qwen3-32b', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant']
      : ['openrouter/auto', 'google/gemini-2.5-flash'];
  for (const p of PREF) { const hit = good.find(i => i === p); if (hit) return hit; }
  const RES: RegExp[] = provider === 'gemini'
    ? [/gemini-2\.5.*flash/i, /flash/i, /gemini-2\.5/i]
    : provider === 'groq'
      ? [/120b/i, /qwen3/i, /20b/i, /instant/i]
      : [/gemini-2\.5-flash/i, /flash/i];
  for (const re of RES) { const hit = good.find(i => re.test(i)); if (hit) return hit; }
  return good[0];
}

type CallOverride = { provider: ProviderId; key: string; model: string };

async function callProvider(prompt: string, images: Array<{ mimeType: string; data: string }>, opts: GenerateOpts, override?: CallOverride): Promise<string> {
  const cfg = override || getAIConfig();
  if (!cfg.key) throw aiErr('NO_KEY');
  const json = !!opts.json;
  const timeoutMs = opts.timeoutMs ?? 60000;
  const provider = cfg.provider;
  const def = DEFAULT_MODELS[provider];
  const primary = sanitizeModel(cfg.model) || def;

  const attempt = async (model: string): Promise<string> => {
    const url = {
      gemini: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      groq: 'https://api.groq.com/openai/v1/chat/completions',
      openrouter: 'https://openrouter.ai/api/v1/chat/completions',
    }[provider];

    let init: RequestInit;
    if (provider === 'gemini') {
      init = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.key },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [{ text: prompt }, ...images.map(i => ({ inlineData: { mimeType: i.mimeType, data: i.data } }))],
          }],
          // maxOutputTokens: the default can truncate several full 28-field profiles (thinking tokens count too)
          generationConfig: { temperature: 0.8, maxOutputTokens: 32768, ...(json ? { responseMimeType: 'application/json' } : {}) },
        }),
      };
    } else {
      init = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.key}` },
        body: JSON.stringify({ model, messages: toOpenAiMessages(prompt, images, json), temperature: 0.8 }),
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
    return provider === 'gemini' ? extractTextGemini(data) : extractTextOpenAI(data);
  };

  try {
    return await attempt(primary);
  } catch (e) {
    if ((e as Error).message !== 'AI_HTTP_404') throw e;
    const heal = (m: string): void => {
      if (override) return; // آزمون اتصال هیچ چیز را ذخیره یا تغییر نمی‌دهد
      try { setModel(m); } catch { /* ignore */ }
      try { localStorage.setItem('wort_ai_model_' + provider, m); } catch { /* ignore */ }
    };
    // لایهٔ ۱: مدل پیش‌فرض ارائه‌دهنده — مدل ذخیره‌شده ممکن است منقضی شده باشد
    if (primary !== def) {
      try { const r = await attempt(def); heal(def); return r; }
      catch (e2) { if ((e2 as Error).message !== 'AI_HTTP_404') throw e2; }
    }
    // لایهٔ ۲: کشف مدل از لیست واقعی حساب (گروق مدل‌های قدیمی را جمع کرده)
    try {
      const ids = await fetchProviderModels(provider, cfg.key);
      const pick = ids ? pickChatModel(ids, provider) : null;
      if (pick && pick !== primary && pick !== def) {
        const r = await attempt(pick); heal(pick); return r;
      }
    } catch { /* لیست مدل‌ها در دسترس نبود — خطای اصلی ۴۰۴ را بده */ }
    throw e;
  }
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
  throw friendlyErr(last);
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
  throw friendlyErr(last);
}
/** نام جایگزین رایج */
export const callAI = generateText;

/** پیام خطا را خوانا می‌کند ولی code را نگه می‌دارد (همه‌جا e.message فارسی می‌شود) */
function friendlyErr(e: unknown): unknown {
  return e instanceof AiError ? new AiError(e.code, describeAiError(e)) : e;
}

/** پیام خطای خوانا برای کاربر */
export function describeAiError(e: unknown): string {
  const msg = e instanceof AiError && e.code ? e.code : (e instanceof Error ? e.message : String(e || ''));
  if (msg === 'NO_KEY') return 'کلید هوش مصنوعی در تنظیمات وارد نشده است';
  if (msg === 'AI_TIMEOUT') return 'هوش مصنوعی دیر جواب داد (timeout) — کمی بعد دوباره تلاش کن.';
  if (msg === 'AI_NETWORK') return 'اتصال به سرور هوش مصنوعی برقرار نشد — اینترنت را چک کن.';
  if (msg.startsWith('AI_BLOCKED')) return 'پاسخ توسط فیلتر ایمنی ارائه‌دهنده بازداشته شد — سؤال را کمی عوض کن.';
  if (msg.startsWith('AI_HTTP_401') || msg.startsWith('AI_HTTP_403')) return 'کلید هوش مصنوعی نامعتبر است یا اجازه ندارد — در تنظیمات چک کن.';
  if (msg.startsWith('AI_HTTP_404')) return 'مدل انتخابی پیدا نشد — در تنظیمات مدل را عوض کن.';
  if (msg.startsWith('AI_HTTP_429')) {
    const cur = getActiveProvider();
    const others = PROVIDER_IDS.filter(p => p !== cur).map(p => PROVIDERS[p].label).join(' یا ');
    return `سقف درخواست «${PROVIDERS[cur].label}» پر شده (محدودیت دقیقه‌ای یا روزانه). چند دقیقه صبر کن، یا از منوی ⋮ ← تنظیمات ← «اتصال به هوش مصنوعی» سرویس دیگر (${others}) را انتخاب و «ذخیره و فعال‌سازی» بزن.`;
  }
  if (/^AI_HTTP_5/.test(msg)) return 'خطای سرور ارائه‌دهنده (' + msg.replace('AI_HTTP_', 'کد ') + ') — کمی بعد تلاش کن.';
  if (msg.startsWith('AI_HTTP_')) return 'خطای شبکه/سرویس هوش مصنوعی (کد HTTP ' + msg.replace('AI_HTTP_', '') + ') — کلید، مدل و اینترنت را چک کن.';
  if (msg === 'AI_EMPTY') return 'هوش مصنوعی پاسخ خالی داد — دوباره تلاش کن.';
  if (msg === 'AI_PARSE') return 'پاسخ هوش مصنوعی قابل تبدیل به JSON نبود — دوباره تلاش کن.';
  return 'خطای نامشخص در اتصال به هوش مصنوعی: ' + msg.slice(0, 120);
}
