/**
 * Shared AI provider layer.
 *
 * - Three independently configurable providers: Google Gemini, Groq, OpenRouter.
 * - One request layer: provider selection, provider-specific request construction and response
 *   extraction, error normalisation, timeout, and a small number of safe retries.
 * - API keys: kept in memory for the current session by default. Persisting a key in the browser
 *   (localStorage) is an explicit opt-in per provider. Keys are never exported, logged, put into
 *   prompts, or sent to any host other than the provider the user selected.
 * - No automatic fallback to another provider or to another (possibly paid) model.
 */

export type ProviderId = 'gemini' | 'groq' | 'openrouter';

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  keyUrl: string;
  /** Suggested model. Availability and free quotas are controlled by the provider and can change. */
  defaultModel: string;
  /** Examples shown in the UI. They are suggestions only and are NOT verified to be available. */
  modelExamples: string[];
  supportsImages: boolean;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    defaultModel: 'gemini-3.1-flash-lite', // the model this application already used
    modelExamples: ['gemini-3.1-flash-lite', 'gemini-3.8-flash'],
    supportsImages: true
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    keyUrl: 'https://console.groq.com/keys',
    defaultModel: 'llama-3.3-70b-versatile',
    modelExamples: ['llama-3.3-70b-versatile', 'meta-llama/llama-4-scout-17b-16e-instruct'],
    supportsImages: true
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    keyUrl: 'https://openrouter.ai/keys',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    modelExamples: ['meta-llama/llama-3.3-70b-instruct:free', 'google/gemini-2.0-flash-exp:free'],
    supportsImages: true
  }
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

/* ------------------------------------------------------------------------------------------ */
/* Errors                                                                                      */
/* ------------------------------------------------------------------------------------------ */

export type AiErrorKind =
  | 'no_key'
  | 'auth'
  | 'quota'
  | 'rate'
  | 'model'
  | 'network'
  | 'timeout'
  | 'server'
  | 'bad_response'
  | 'unknown';

export class AiError extends Error {
  kind: AiErrorKind;
  status?: number;
  provider?: ProviderId;
  constructor(kind: AiErrorKind, message: string, status?: number, provider?: ProviderId) {
    super(message);
    this.name = 'AiError';
    this.kind = kind;
    this.status = status;
    this.provider = provider;
  }
  /** Only these are worth retrying. A definitive quota answer is never retried. */
  get retryable(): boolean {
    return this.kind === 'rate' || this.kind === 'network' || this.kind === 'server';
  }
}

const label = (p?: ProviderId) => (p ? PROVIDERS[p].label : 'هوش مصنوعی');

/** Removes API-key-like material from provider messages before they are shown. */
export function scrubSecrets(text: string, key?: string): string {
  let t = String(text || '');
  if (key && key.length > 6) t = t.split(key).join('***');
  return t
    .replace(/AIza[0-9A-Za-z_\-]{20,}/g, '***')
    .replace(/gsk_[0-9A-Za-z]{20,}/g, '***')
    .replace(/sk-or-[0-9A-Za-z_\-]{16,}/g, '***')
    .slice(0, 400);
}

/** Maps an HTTP failure of any provider to one normalised error. */
export function normalizeHttpError(provider: ProviderId, status: number, body: any, key?: string): AiError {
  const raw = scrubSecrets(
    body?.error?.message || (typeof body?.error === 'string' ? body.error : '') || body?.message || '',
    key
  );
  const code = String(body?.error?.status || body?.error?.code || '').toLowerCase();
  const name = label(provider);

  if (status === 401 || status === 403 || /api key|invalid[_ ]key|unauthor|permission_denied|credentials/i.test(raw + code)) {
    if (status === 401 || status === 403 || /api key not valid|invalid api key|unauthor/i.test(raw)) {
      return new AiError('auth', `کلید API «${name}» نامعتبر است یا دسترسی ندارد. کلید را بررسی کنید.`, status, provider);
    }
  }
  if (status === 402 || /insufficient[_ ]credit|payment required|billing/i.test(raw)) {
    return new AiError('quota', `اعتبار یا سهمیهٔ «${name}» کافی نیست (${raw || 'پرداخت لازم است'}).`, status, provider);
  }
  if (status === 429 || code.includes('resource_exhausted') || /quota|rate.?limit|too many requests/i.test(raw)) {
    const isQuota = /quota|exceeded your current|per day|daily|billing|resource_exhausted/i.test(raw + code);
    return isQuota
      ? new AiError('quota', `سهمیهٔ رایگان «${name}» تمام شده است. ارائه‌دهندهٔ دیگری انتخاب کنید یا بعداً تلاش کنید.`, status, provider)
      : new AiError('rate', `تعداد درخواست‌ها به «${name}» زیاد است؛ کمی صبر کنید و دوباره تلاش کنید.`, status, provider);
  }
  if (status === 404 || /model/i.test(code) || /model.*(not found|does not exist|not supported|unavailable|decommission)|not a valid model/i.test(raw)) {
    return new AiError('model', `مدل انتخاب‌شده برای «${name}» در دسترس نیست یا پشتیبانی نمی‌شود. نام مدل را در تنظیمات تغییر دهید.`, status, provider);
  }
  if (status >= 500) {
    return new AiError('server', `سرور «${name}» موقتاً خطا داد (${status}). کمی بعد دوباره تلاش کنید.`, status, provider);
  }
  return new AiError('unknown', `خطا از «${name}» (${status})${raw ? `: ${raw}` : ''}`, status, provider);
}

/* ------------------------------------------------------------------------------------------ */
/* Configuration & key storage                                                                 */
/* ------------------------------------------------------------------------------------------ */

interface StoredConfig {
  active: ProviderId;
  models: Partial<Record<ProviderId, string>>;
  /** Providers whose key the user explicitly chose to keep in this browser. */
  persist: Partial<Record<ProviderId, boolean>>;
}

const CONFIG_KEY = 'wort_ai_config_v1';
const LEGACY_GEMINI_KEY = 'gemini_api_key'; // key of earlier versions (kept for compatibility)
const keyStorageName = (p: ProviderId) => (p === 'gemini' ? LEGACY_GEMINI_KEY : `wort_ai_key_${p}`);

const memoryKeys: Partial<Record<ProviderId, string>> = {};

const ls = (): Storage | null => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

function readConfig(): StoredConfig {
  const base: StoredConfig = { active: 'gemini', models: {}, persist: {} };
  const s = ls();
  try {
    const raw = s?.getItem(CONFIG_KEY);
    if (raw) {
      const j = JSON.parse(raw);
      if (j && PROVIDER_IDS.includes(j.active)) base.active = j.active;
      if (j?.models && typeof j.models === 'object') base.models = j.models;
      if (j?.persist && typeof j.persist === 'object') base.persist = j.persist;
    }
  } catch {
    /* ignore corrupt config */
  }
  // Migration: a Gemini key saved by an earlier version stays available (never erased).
  try {
    if (s?.getItem(LEGACY_GEMINI_KEY) && base.persist.gemini === undefined) base.persist.gemini = true;
  } catch {
    /* ignore */
  }
  return base;
}

function writeConfig(c: StoredConfig) {
  try {
    ls()?.setItem(CONFIG_KEY, JSON.stringify({ active: c.active, models: c.models, persist: c.persist }));
  } catch {
    /* storage may be unavailable */
  }
}

export const getActiveProvider = (): ProviderId => readConfig().active;

export function setActiveProvider(p: ProviderId) {
  if (!PROVIDER_IDS.includes(p)) return;
  const c = readConfig();
  c.active = p;
  writeConfig(c);
}

export function getModel(p: ProviderId): string {
  const m = (readConfig().models[p] || '').trim();
  return m || PROVIDERS[p].defaultModel;
}

export function setModel(p: ProviderId, model: string) {
  const c = readConfig();
  const m = (model || '').trim();
  if (m && m !== PROVIDERS[p].defaultModel) c.models[p] = m;
  else delete c.models[p];
  writeConfig(c);
}

export const isKeyPersisted = (p: ProviderId): boolean => !!readConfig().persist[p];

export function getApiKey(p: ProviderId): string {
  if (memoryKeys[p]) return memoryKeys[p] as string;
  if (readConfig().persist[p] || (p === 'gemini' && ls()?.getItem(LEGACY_GEMINI_KEY))) {
    try {
      return (ls()?.getItem(keyStorageName(p)) || '').trim();
    } catch {
      return '';
    }
  }
  return '';
}

export const hasApiKey = (p: ProviderId): boolean => !!getApiKey(p);

/** Saves a key for this session; stores it in the browser only when `persist` is true. */
export function setApiKey(p: ProviderId, key: string, persist: boolean) {
  const k = (key || '').trim();
  const c = readConfig();
  if (!k) {
    clearApiKey(p);
    return;
  }
  memoryKeys[p] = k;
  c.persist[p] = !!persist;
  writeConfig(c);
  try {
    if (persist) ls()?.setItem(keyStorageName(p), k);
    else ls()?.removeItem(keyStorageName(p));
  } catch {
    /* ignore */
  }
}

export function clearApiKey(p: ProviderId) {
  delete memoryKeys[p];
  const c = readConfig();
  c.persist[p] = false;
  writeConfig(c);
  try {
    ls()?.removeItem(keyStorageName(p));
  } catch {
    /* ignore */
  }
}

/** For tests. */
export function __resetAiProviderState() {
  PROVIDER_IDS.forEach(p => delete memoryKeys[p]);
}

/* ------------------------------------------------------------------------------------------ */
/* Request construction (pure, unit-tested)                                                    */
/* ------------------------------------------------------------------------------------------ */

export interface ImageInput {
  mimeType: string;
  /** base64 without the data: prefix */
  data: string;
}

export interface RequestParams {
  prompt: string;
  system?: string;
  model: string;
  key: string;
  /** The caller expects JSON. Gemini gets a JSON mime type; OpenAI-compatible providers rely on the prompt. */
  json?: boolean;
  images?: ImageInput[];
}

export interface BuiltRequest {
  url: string;
  init: RequestInit & { headers: Record<string, string> };
}

export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const GROQ_BASE = 'https://api.groq.com/openai/v1';
export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

export function buildRequest(provider: ProviderId, p: RequestParams): BuiltRequest {
  if (provider === 'gemini') {
    const parts: any[] = [{ text: p.prompt }];
    (p.images || []).forEach(img => parts.unshift({ inlineData: { mimeType: img.mimeType || 'image/jpeg', data: img.data } }));
    const body: any = { contents: [{ role: 'user', parts }] };
    if (p.system) body.systemInstruction = { parts: [{ text: p.system }] };
    const gc: any = {};
    if (p.json && !(p.images && p.images.length)) gc.responseMimeType = 'application/json';
    if (/3\.8-flash|4-argon/.test(p.model)) gc.thinkingConfig = { thinkingLevel: 'low' };
    if (Object.keys(gc).length) body.generationConfig = gc;
    return {
      url: `${GEMINI_BASE}/models/${encodeURIComponent(p.model)}:generateContent`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': p.key },
        body: JSON.stringify(body)
      }
    };
  }

  // Groq and OpenRouter: OpenAI-compatible chat completions
  const messages: any[] = [];
  if (p.system) messages.push({ role: 'system', content: p.system });
  if (p.images && p.images.length) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: p.prompt },
        ...p.images.map(img => ({
          type: 'image_url',
          image_url: { url: `data:${img.mimeType || 'image/jpeg'};base64,${img.data}` }
        }))
      ]
    });
  } else {
    messages.push({ role: 'user', content: p.prompt });
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${p.key}`
  };
  if (provider === 'openrouter') {
    // Optional attribution headers documented by OpenRouter
    try {
      if (typeof location !== 'undefined' && location.origin) headers['HTTP-Referer'] = location.origin;
    } catch {
      /* ignore */
    }
    headers['X-Title'] = 'WoerterBuch';
  }
  return {
    url: `${provider === 'groq' ? GROQ_BASE : OPENROUTER_BASE}/chat/completions`,
    init: {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: p.model, messages, temperature: 0.2 })
    }
  };
}

/** Extracts the generated text from a successful response of any provider. */
export function extractText(provider: ProviderId, data: any): string {
  if (provider === 'gemini') {
    const block = data?.promptFeedback?.blockReason;
    if (block) throw new AiError('bad_response', `درخواست توسط ${label(provider)} مسدود شد (${block}).`, undefined, provider);
    const parts = data?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts) ? parts.map((x: any) => x?.text || '').join('') : '';
    if (!text.trim()) throw new AiError('bad_response', 'پاسخ خالی از هوش مصنوعی دریافت شد.', undefined, provider);
    return text;
  }
  const c = data?.choices?.[0]?.message?.content;
  const text = Array.isArray(c) ? c.map((x: any) => x?.text || '').join('') : typeof c === 'string' ? c : '';
  if (!text.trim()) {
    const msg = data?.error?.message;
    throw new AiError('bad_response', msg ? scrubSecrets(msg) : 'پاسخ خالی از هوش مصنوعی دریافت شد.', undefined, provider);
  }
  return text;
}

/* ------------------------------------------------------------------------------------------ */
/* Requests                                                                                    */
/* ------------------------------------------------------------------------------------------ */

export interface GenerateOptions {
  system?: string;
  json?: boolean;
  timeoutMs?: number;
  /** Extra attempts for transient errors only (rate limit, network, 5xx). Default 1. */
  retries?: number;
  /** Overrides the model configured for the ACTIVE provider (never switches provider). */
  model?: string;
  images?: ImageInput[];
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function callOnce(provider: ProviderId, params: RequestParams, timeoutMs: number): Promise<string> {
  const { url, init } = buildRequest(provider, params);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: controller.signal });
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        throw new AiError('timeout', 'زمان انتظار برای پاسخ هوش مصنوعی به پایان رسید. دوباره تلاش کنید.', undefined, provider);
      }
      throw new AiError('network', `ارتباط با «${label(provider)}» برقرار نشد. اینترنت را بررسی کنید.`, undefined, provider);
    }
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) throw normalizeHttpError(provider, res.status, body, params.key);
    return extractText(provider, body);
  } finally {
    clearTimeout(timer);
  }
}

/** Generates text with the ACTIVE provider. Never falls back to another provider or model. */
export async function generateText(prompt: string, options: GenerateOptions = {}): Promise<string> {
  const provider = getActiveProvider();
  const key = getApiKey(provider);
  if (!key) {
    throw new AiError('no_key', `کلید API برای «${label(provider)}» وارد نشده است. از تنظیمات کلید را وارد کنید.`, undefined, provider);
  }
  if (options.images?.length && !PROVIDERS[provider].supportsImages) {
    throw new AiError('model', `«${label(provider)}» تصویر را پشتیبانی نمی‌کند.`, undefined, provider);
  }
  const params: RequestParams = {
    prompt,
    system: options.system,
    model: (options.model || getModel(provider)).trim(),
    key,
    json: options.json,
    images: options.images
  };
  const timeoutMs = options.timeoutMs ?? 30000;
  const maxRetries = Math.max(0, Math.min(2, options.retries ?? 1));
  let last: AiError | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await callOnce(provider, params, timeoutMs);
    } catch (e: any) {
      const err = e instanceof AiError ? e : new AiError('unknown', scrubSecrets(e?.message || 'خطا در پردازش هوش مصنوعی.', key), undefined, provider);
      last = err;
      if (!err.retryable || attempt >= maxRetries) break;
      await sleep(attempt === 0 ? 800 : 2000);
    }
  }
  throw last as AiError;
}

export const generateWithImages = (prompt: string, images: ImageInput[], options: GenerateOptions = {}) =>
  generateText(prompt, { ...options, images });

/** Tests a connection with the given (not yet saved) key. Never changes any stored setting. */
export async function testConnection(provider: ProviderId, key: string): Promise<{ ok: boolean; message: string }> {
  const k = (key || '').trim();
  if (!k) return { ok: false, message: 'ابتدا کلید API را وارد کنید.' };
  const target =
    provider === 'gemini'
      ? { url: `${GEMINI_BASE}/models?pageSize=1`, headers: { 'x-goog-api-key': k } }
      : provider === 'groq'
        ? { url: `${GROQ_BASE}/models`, headers: { Authorization: `Bearer ${k}` } }
        : { url: `${OPENROUTER_BASE}/auth/key`, headers: { Authorization: `Bearer ${k}` } };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(target.url, { headers: target.headers, signal: controller.signal });
    if (res.ok) return { ok: true, message: `اتصال به «${label(provider)}» برقرار است.` };
    const body: any = await res.json().catch(() => ({}));
    return { ok: false, message: normalizeHttpError(provider, res.status, body, k).message };
  } catch (e: any) {
    return {
      ok: false,
      message: e?.name === 'AbortError' ? 'زمان آزمون اتصال تمام شد.' : `ارتباط با «${label(provider)}» برقرار نشد. اینترنت را بررسی کنید.`
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Short Persian text for an error, safe to show in a toast (never contains a key). */
export function describeAiError(e: any): string {
  if (e instanceof AiError) return e.message;
  return scrubSecrets(e?.message || 'خطا در پردازش هوش مصنوعی.');
}
