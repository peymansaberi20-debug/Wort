import test from 'node:test';
import assert from 'node:assert/strict';

// minimal localStorage for node
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  get length() { return store.size; },
  key: (i: number) => [...store.keys()][i] ?? null
};

import {
  AiError, PROVIDERS, sanitizeModel, clearApiKey, generateText, getAIConfig, getActiveProvider, getApiKey, getModel,
  isKeyPersisted, setActiveProvider, setApiKey, setModel, testConnection
} from '../utils/aiProvider';

type Call = { url: string; init: any };
let calls: Call[] = [];
let responder: (c: Call) => { status?: number; body?: any } | Error = () => ({ body: {} });
(globalThis as any).fetch = async (url: string, init: any) => {
  const c = { url, init };
  calls.push(c);
  const r = responder(c);
  if (r instanceof Error) throw r;
  const status = r.status ?? 200;
  const body = r.body ?? {};
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
  } as any;
};
const reset = () => {
  store.clear();
  clearApiKey(); // clears SESSION_KEYS + canonical storage + detection cache
  calls = [];
  responder = () => ({ body: {} });
};
const gemOk = (t: string) => ({ body: { candidates: [{ content: { parts: [{ text: t }] } }] } });
const oaiOk = (t: string) => ({ body: { choices: [{ message: { content: t } }] } });

test('request construction per provider', async () => {
  // gemini: dedicated endpoint, key header, JSON mime in json mode
  reset();
  setApiKey('gemini', 'AIzaSyFAKEKEYFAKEKEYFAKEKEY12345', false);
  setActiveProvider('gemini');
  responder = () => gemOk('{"a":1}');
  await generateText('hi', { json: true, retries: 0 });
  assert.match(calls[0].url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/[^/]+:generateContent$/);
  assert.equal(calls[0].init.headers['x-goog-api-key'], 'AIzaSyFAKEKEYFAKEKEYFAKEKEY12345');
  const gBody = JSON.parse(calls[0].init.body as string);
  assert.equal(gBody.generationConfig.responseMimeType, 'application/json');

  // groq: OpenAI-compatible chat endpoint, Bearer auth, no response_format for arrays
  reset();
  setApiKey('groq', 'gsk_FAKEGROQKEYFAKEGROQKEY1234', false);
  setActiveProvider('groq');
  responder = () => oaiOk('[]');
  await generateText('hi', { json: true, retries: 0 });
  assert.equal(calls[0].url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer gsk_FAKEGROQKEYFAKEGROQKEY1234');
  const qBody = JSON.parse(calls[0].init.body as string);
  assert.equal(qBody.messages[0].role, 'user');
  assert.equal(qBody.response_format, undefined); // no JSON mode assumption for arrays

  // openrouter: same chat endpoint family, Bearer auth
  reset();
  setApiKey('openrouter', 'sk-or-FAKEOPENROUTERKEYFAKE12345', false);
  setActiveProvider('openrouter');
  responder = () => oaiOk('x');
  await generateText('hi', { retries: 0 });
  assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer sk-or-FAKEOPENROUTERKEYFAKE12345');

  // images: provider specific payload formats
  reset();
  setApiKey('gemini', 'AIzaSyFAKEKEYFAKEKEYFAKEKEY12345', false);
  setActiveProvider('gemini');
  responder = () => gemOk('ok');
  await generateText('p', { retries: 0 });
  const gi = JSON.parse(calls[0].init.body as string);
  assert.equal(gi.contents[0].parts[0].text, 'p');

  // sanitizeModel strips the "models/" prefix some storages keep
  assert.equal(sanitizeModel('models/gemini-2.5-flash'), 'gemini-2.5-flash');
});

test('selection: the active provider is the only host that is called', async () => {
  for (const [id, host, ok] of [
    ['gemini', 'generativelanguage.googleapis.com', gemOk],
    ['groq', 'api.groq.com', oaiOk],
    ['openrouter', 'openrouter.ai', oaiOk]
  ] as const) {
    reset();
    setApiKey(id, id === 'gemini' ? 'AIzaSyFAKEKEYFAKEKEYFAKEKEY12345' : id === 'groq' ? 'gsk_FAKEGROQKEYFAKEGROQKEY1234' : 'sk-or-FAKEOPENROUTERKEYFAKE12345', false);
    setActiveProvider(id);
    assert.equal(getActiveProvider(), id);
    responder = () => ok('{"a":1}');
    const out = await generateText('prompt', { json: true, retries: 0 });
    assert.equal(out, '{"a":1}');
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.includes(host), calls[0].url);
    assert.ok(!(calls[0].init.body as string).includes('AIzaSyFAKEKEY'), 'key must never be in the body/prompt');
  }
});

test('model is configurable per provider and never switched automatically', async () => {
  reset();
  setApiKey('groq', 'gsk_FAKEGROQKEYFAKEGROQKEY1234', false);
  setActiveProvider('groq');
  const def = getModel('groq');
  assert.ok(def.length > 0, 'a default model exists');
  setModel('groq', 'my-model');
  assert.equal(getModel('groq'), 'my-model');
  assert.ok(getModel('openrouter').length > 0);
  // quota answers are transient here: they are retried (per GenerateOpts.retries) but never
  // switch provider or silently rewrite the configured model
  responder = () => ({ status: 429, body: { error: { message: 'quota exceeded per day' } } });
  await assert.rejects(generateText('p', { retries: 2 }), (e: any) => e instanceof AiError && e.code === 'AI_HTTP_429');
  assert.equal(calls.length, 3, 'every retry stays with the same provider/model');
  assert.ok(calls.every(c => c.url.includes('api.groq.com')), 'no automatic provider fallback');
  assert.equal(JSON.parse(calls[0].init.body).model, 'my-model');
  assert.equal(getModel('groq'), 'my-model', 'model stays as configured');
  assert.equal(getActiveProvider(), 'groq', 'no automatic provider fallback');
});

test('error normalisation: no key, auth, timeout, network, empty, server', async () => {
  reset();
  // no key at all → NO_KEY and no network call
  await assert.rejects(generateText('p'), (e: any) => e instanceof AiError && e.code === 'NO_KEY');
  assert.equal(calls.length, 0);

  setApiKey('gemini', 'AIzaSyFAKEKEYFAKEKEYFAKEKEY12345', false);
  setActiveProvider('gemini');

  calls = [];
  responder = () => ({ status: 400, body: { error: { message: 'API key not valid. Please pass a valid API key.' } } });
  await assert.rejects(generateText('p', { retries: 0 }), (e: any) => e.code === 'AI_HTTP_400');

  calls = [];
  responder = () => ({ status: 401, body: { error: { message: 'Invalid API Key' } } });
  await assert.rejects(generateText('p', { retries: 0 }), (e: any) => e.code === 'AI_HTTP_401');

  calls = [];
  responder = () => new TypeError('Failed to fetch');
  await assert.rejects(generateText('p', { retries: 0 }), (e: any) => e.code === 'AI_NETWORK');

  calls = [];
  responder = () => ({ body: { candidates: [] } });
  await assert.rejects(generateText('p', { retries: 0 }), (e: any) => e.code === 'AI_EMPTY');

  calls = [];
  responder = () => ({ status: 503, body: { error: { message: 'overloaded' } } });
  await assert.rejects(generateText('p', { retries: 0 }), (e: any) => e.code === 'AI_HTTP_503');

  // transient rate limits get exactly one limited retry
  calls = [];
  responder = () => ({ status: 429, body: { error: { message: 'Too many requests, slow down' } } });
  await assert.rejects(generateText('p', { retries: 1 }), (e: any) => e.code === 'AI_HTTP_429');
  assert.equal(calls.length, 2, 'rate limits get one limited retry');
});

test('keys: session-only by default, opt-in persistence, clearing, legacy Gemini key kept', () => {
  reset();
  setApiKey('openrouter', 'sk-or-aaaaaaaaaaaaaaaaaaaa', false);
  assert.equal(getApiKey('openrouter'), 'sk-or-aaaaaaaaaaaaaaaaaaaa');
  assert.equal(isKeyPersisted('openrouter'), false);
  assert.ok(![...store.values()].some(v => v.includes('sk-or-aaaa')), 'not written to browser storage');
  setApiKey('openrouter', 'sk-or-aaaaaaaaaaaaaaaaaaaa', true);
  assert.ok([...store.values()].some(v => v.includes('sk-or-aaaa')));
  assert.equal(isKeyPersisted('openrouter'), true);
  clearApiKey('openrouter');
  assert.equal(getApiKey('openrouter'), '');
  assert.ok(![...store.values()].some(v => v.includes('sk-or-aaaa')));
  // a Gemini key saved by an earlier version is still found by auto-detection
  reset();
  store.set('gemini_api_key', 'AIzaLEGACYKEYLEGACYKEY123456');
  assert.equal(getAIConfig().key, 'AIzaLEGACYKEYLEGACYKEY123456');
  assert.equal(getAIConfig().provider, 'gemini');
});

test('connection test uses only the typed key and does not change settings', async () => {
  reset();
  setApiKey('gemini', 'AIzaORIGINALKEYORIGINALKEY12345', false);
  setActiveProvider('gemini');
  responder = () => ({ status: 401, body: { error: { message: 'Invalid API Key' } } });
  const r = await testConnection('groq', 'typed-bad-key-123456');
  assert.equal(r.ok, false);
  assert.equal(getApiKey('gemini'), 'AIzaORIGINALKEYORIGINALKEY12345');
  assert.equal(getActiveProvider(), 'gemini');
  assert.ok(calls[0].url.startsWith('https://api.groq.com/openai/v1/chat/completions'));
  responder = () => oaiOk('OK');
  const good = await testConnection('openrouter', 'sk-or-bbbbbbbbbbbbbbbbbbbb');
  assert.equal(good.ok, true);
});

test('PROVIDERS stays robust for unknown ids', () => {
  assert.equal(PROVIDERS.gemini.label, 'Gemini');
  assert.ok(PROVIDERS['unknown-provider'].models.length === 0, 'unknown ids get a safe empty meta');
});
