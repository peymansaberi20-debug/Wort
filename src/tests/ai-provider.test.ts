import test from 'node:test';
import assert from 'node:assert/strict';

// minimal localStorage for node
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k)
};

import {
  AiError, PROVIDERS, buildRequest, clearApiKey, extractText, generateText, getActiveProvider, getApiKey, getModel,
  isKeyPersisted, normalizeHttpError, scrubSecrets, setActiveProvider, setApiKey, setModel, testConnection, __resetAiProviderState
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
  return { ok: status >= 200 && status < 300, status, json: async () => r.body ?? {} } as any;
};
const reset = () => {
  store.clear();
  __resetAiProviderState();
  calls = [];
  responder = () => ({ body: {} });
};
const gemOk = (t: string) => ({ body: { candidates: [{ content: { parts: [{ text: t }] } }] } });
const oaiOk = (t: string) => ({ body: { choices: [{ message: { content: t } }] } });

test('request construction per provider', () => {
  const g = buildRequest('gemini', { prompt: 'hi', model: 'm1', key: 'K', json: true });
  assert.match(g.url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/m1:generateContent$/);
  assert.equal(g.init.headers['x-goog-api-key'], 'K');
  assert.equal(JSON.parse(g.init.body as string).generationConfig.responseMimeType, 'application/json');
  const q = buildRequest('groq', { prompt: 'hi', model: 'm2', key: 'K', system: 'sys' });
  assert.equal(q.url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(q.init.headers.Authorization, 'Bearer K');
  const body = JSON.parse(q.init.body as string);
  assert.equal(body.model, 'm2');
  assert.deepEqual(body.messages.map((m: any) => m.role), ['system', 'user']);
  assert.equal(body.response_format, undefined); // no JSON mode assumption for arrays
  const o = buildRequest('openrouter', { prompt: 'hi', model: 'a/b:free', key: 'K' });
  assert.equal(o.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(o.init.headers.Authorization, 'Bearer K');
  // images: provider specific formats
  const gi = JSON.parse(buildRequest('gemini', { prompt: 'p', model: 'm', key: 'K', images: [{ mimeType: 'image/png', data: 'AAA' }] }).init.body as string);
  assert.equal(gi.contents[0].parts[0].inlineData.data, 'AAA');
  const oi = JSON.parse(buildRequest('groq', { prompt: 'p', model: 'm', key: 'K', images: [{ mimeType: 'image/png', data: 'AAA' }] }).init.body as string);
  assert.equal(oi.messages[0].content[1].image_url.url, 'data:image/png;base64,AAA');
});

test('selection: the active provider is the only host that is called', async () => {
  for (const [id, host, ok] of [['gemini', 'generativelanguage.googleapis.com', gemOk], ['groq', 'api.groq.com', oaiOk], ['openrouter', 'openrouter.ai', oaiOk]] as const) {
    reset();
    setApiKey(id, 'KEY-' + id + '-123456', false);
    setActiveProvider(id);
    assert.equal(getActiveProvider(), id);
    responder = () => ok('{"a":1}');
    const out = await generateText('prompt', { json: true });
    assert.equal(out, '{"a":1}');
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.includes(host), calls[0].url);
    assert.ok(!(calls[0].init.body as string).includes('KEY-'), 'key must never be in the body/prompt');
  }
});

test('model is configurable per provider and never switched automatically', async () => {
  reset();
  setApiKey('groq', 'KEY-groq-123456', false);
  setActiveProvider('groq');
  assert.equal(getModel('groq'), PROVIDERS.groq.defaultModel);
  setModel('groq', 'my-model');
  assert.equal(getModel('groq'), 'my-model');
  assert.equal(getModel('openrouter'), PROVIDERS.openrouter.defaultModel);
  responder = () => ({ status: 404, body: { error: { message: 'The model `my-model` does not exist' } } });
  await assert.rejects(generateText('p'), (e: any) => e instanceof AiError && e.kind === 'model');
  assert.equal(calls.length, 1); // no automatic second model
  assert.equal(JSON.parse(calls[0].init.body).model, 'my-model');
});

test('error normalisation: invalid key, quota (no retry), rate limit (limited retry), network, malformed, no key', async () => {
  reset();
  await assert.rejects(generateText('p'), (e: any) => e.kind === 'no_key');
  assert.equal(calls.length, 0);

  setApiKey('gemini', 'AIzaSyFAKEKEYFAKEKEYFAKEKEY12345', false);
  setActiveProvider('gemini');

  responder = () => ({ status: 400, body: { error: { message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } } });
  await assert.rejects(generateText('p'), (e: any) => e.kind === 'auth');
  assert.equal(calls.length, 1);

  calls = [];
  responder = () => ({ status: 429, body: { error: { message: 'You exceeded your current quota, please check your plan and billing details.', status: 'RESOURCE_EXHAUSTED' } } });
  await assert.rejects(generateText('p', { retries: 2 }), (e: any) => e.kind === 'quota');
  assert.equal(calls.length, 1, 'a definitive quota answer must not be retried');

  calls = [];
  responder = () => ({ status: 429, body: { error: { message: 'Too many requests, slow down' } } });
  await assert.rejects(generateText('p', { retries: 1 }), (e: any) => e.kind === 'rate');
  assert.equal(calls.length, 2, 'rate limits get one limited retry');

  calls = [];
  responder = () => new TypeError('Failed to fetch');
  await assert.rejects(generateText('p', { retries: 0 }), (e: any) => e.kind === 'network');

  calls = [];
  responder = () => ({ body: { candidates: [] } });
  await assert.rejects(generateText('p', { retries: 0 }), (e: any) => e.kind === 'bad_response');

  calls = [];
  responder = () => ({ status: 503, body: { error: { message: 'overloaded' } } });
  await assert.rejects(generateText('p', { retries: 0 }), (e: any) => e.kind === 'server');
});

test('no accidental provider fallback after a failure', async () => {
  reset();
  setApiKey('groq', 'KEY-groq-123456', false);
  setApiKey('gemini', 'KEY-gem-123456', false);
  setActiveProvider('groq');
  responder = () => ({ status: 429, body: { error: { message: 'quota exceeded per day' } } });
  await assert.rejects(generateText('p', { retries: 2 }), (e: any) => e.kind === 'quota' && e.provider === 'groq');
  assert.ok(calls.every(c => c.url.includes('api.groq.com')));
});

test('keys: session-only by default, opt-in persistence, clearing, legacy Gemini key kept', () => {
  reset();
  setApiKey('openrouter', 'sk-or-aaaaaaaaaaaaaaaaaaaa', false);
  assert.equal(getApiKey('openrouter'), 'sk-or-aaaaaaaaaaaaaaaaaaaa');
  assert.equal(isKeyPersisted('openrouter'), false);
  assert.ok(![...store.values()].some(v => v.includes('sk-or-aaaa')), 'not written to browser storage');
  setApiKey('openrouter', 'sk-or-aaaaaaaaaaaaaaaaaaaa', true);
  assert.ok([...store.values()].some(v => v.includes('sk-or-aaaa')));
  clearApiKey('openrouter');
  assert.equal(getApiKey('openrouter'), '');
  assert.ok(![...store.values()].some(v => v.includes('sk-or-aaaa')));
  // a Gemini key saved by an earlier version is still found
  reset();
  store.set('gemini_api_key', 'AIzaLEGACYKEYLEGACYKEY123456');
  assert.equal(getApiKey('gemini'), 'AIzaLEGACYKEYLEGACYKEY123456');
});

test('connection test uses only the typed key and does not change settings', async () => {
  reset();
  setApiKey('gemini', 'ORIGINAL-KEY-123456', false);
  responder = () => ({ status: 401, body: { error: { message: 'Invalid API Key' } } });
  const r = await testConnection('groq', 'typed-bad-key-123456');
  assert.equal(r.ok, false);
  assert.equal(getApiKey('gemini'), 'ORIGINAL-KEY-123456');
  assert.equal(getActiveProvider(), 'gemini');
  assert.ok(calls[0].url.startsWith('https://api.groq.com/openai/v1/models'));
  responder = () => ({ body: { data: {} } });
  assert.equal((await testConnection('openrouter', 'k-123456')).ok, true);
});

test('secrets are scrubbed from messages', () => {
  assert.ok(!scrubSecrets('bad key AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ0123').includes('AIza'));
  const e = normalizeHttpError('groq', 401, { error: { message: 'Invalid API Key gsk_abcdefghijklmnopqrstuvwxyz' } }, 'gsk_abcdefghijklmnopqrstuvwxyz');
  assert.ok(!e.message.includes('gsk_'));
  assert.throws(() => extractText('groq', { choices: [] }), AiError);
});
