const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const KEY_NAME = 'gemini_api_key';
const DEFAULT_MODEL = 'gemini-3.1-flash-lite';
const FALLBACK_MODEL = 'gemini-3.8-flash';

const realFetch = window.fetch.bind(window);

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function getKey(): string {
  let k = '';
  try { k = localStorage.getItem(KEY_NAME) || ''; } catch {}
  if (!k) {
    k = (window.prompt('کلید API گوگل Gemini را وارد کنید (فقط در همین مرورگر ذخیره می‌شود):') || '').trim();
    if (k) { try { localStorage.setItem(KEY_NAME, k); } catch {} }
  }
  return k;
}

function clearKey() {
  try { localStorage.removeItem(KEY_NAME); } catch {}
}

function buildBody(model: string, contents: any, systemInstruction?: string, mime?: string) {
  const body: any = { contents };
  if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };
  const gc: any = {};
  if (mime) gc.responseMimeType = mime;
  if (/3\.8-flash|4-argon/.test(model)) gc.thinkingConfig = { thinkingLevel: 'low' };
  if (Object.keys(gc).length) body.generationConfig = gc;
  return body;
}

async function callGemini(model: string, key: string, body: any): Promise<string> {
  const r = await realFetch(`${BASE}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
  });
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error?.message || `HTTP ${r.status}`;
    if (/API key/i.test(msg)) clearKey();
    throw new Error(msg);
  }
  return (data.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('');
}

async function withFallback(
  primary: string,
  key: string,
  make: (model: string) => any
): Promise<string> {
  try {
    return await callGemini(primary, key, make(primary));
  } catch (e) {
    const fb = primary === DEFAULT_MODEL ? FALLBACK_MODEL : DEFAULT_MODEL;
    return await callGemini(fb, key, make(fb));
  }
}

function parseJson(raw: string) {
  const s = (raw || '{}').trim();
  try { return JSON.parse(s); } catch {
    const m = s.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : {};
  }
}

const textContents = (prompt: string) => [{ role: 'user', parts: [{ text: prompt }] }];

window.fetch = async (input: any, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  let path = '';
  try { path = new URL(url, location.href).pathname; } catch {}
  const m = path.match(/\/api\/gemini\/([a-z-]+)$/);
  if (!m) return realFetch(input, init);

  const action = m[1];
  try {
    const req: any = init?.body ? JSON.parse(String(init.body)) : {};
    const key = getKey();

    if (action === 'status') {
      if (!key) return json({ ok: true, hasKey: false, model: DEFAULT_MODEL });
      const r = await realFetch(`${BASE}/models?pageSize=1`, { headers: { 'x-goog-api-key': key } });
      if (!r.ok) {
        clearKey();
        return json({ ok: true, hasKey: false, model: DEFAULT_MODEL });
      }
      return json({ ok: true, hasKey: true, model: DEFAULT_MODEL });
    }

    if (!key) return json({ error: 'کلید API وارد نشده است.' }, 400);

    if (action === 'generate') {
      if (!req.prompt) return json({ error: 'متن پرامپت الزامی است.' }, 400);
      const text = await withFallback(req.model || DEFAULT_MODEL, key, (mdl) =>
        buildBody(mdl, textContents(req.prompt), req.systemInstruction, req.responseMimeType)
      );
      return json({ text });
    }

    if (action === 'quick-translate') {
      const t = String(req.text || '').trim();
      if (!t) return json({ error: 'کلمه یا عبارت برای ترجمه الزامی است.' }, 400);
      const prompt = `You are a German-Persian dictionary assistant. Translate the following German word/phrase into natural, accurate Persian.
Input: "${t}"
Return ONLY a JSON object with this exact shape:
{
  "de": "${t}",
  "art": "der" or "die" or "das" or "",
  "fa": "Persian translation",
  "pos": "اسم" or "فعل" or "صفت" or "قید" or "اصطلاح",
  "lvl": "A1" or "A2" or "B1" or "B2" or "C1"
}`;
      const text = await callGemini(
        DEFAULT_MODEL,
        key,
        buildBody(DEFAULT_MODEL, textContents(prompt), undefined, 'application/json')
      );
      return json(parseJson(text));
    }

    if (action === 'extract-image') {
      if (!Array.isArray(req.images) || req.images.length === 0) {
        return json({ error: 'حداقل یک تصویر الزامی است.' }, 400);
      }
      const parts: any[] = req.images.map((img: any) => ({
        inlineData: { mimeType: img.mimeType || 'image/jpeg', data: img.data },
      }));
      if (req.prompt) parts.push({ text: req.prompt });
      const text = await withFallback(req.model || DEFAULT_MODEL, key, (mdl) =>
        buildBody(mdl, [{ role: 'user', parts }])
      );
      return json({ text });
    }

    if (action === 'stream') {
      if (!req.prompt) return json({ error: 'متن پرامپت الزامی است.' }, 400);
      const model = req.model || FALLBACK_MODEL;
      const r = await realFetch(`${BASE}/models/${model}:streamGenerateContent?alt=sse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(buildBody(model, textContents(req.prompt), req.systemInstruction)),
      });
      if (!r.ok || !r.body) {
        const d: any = await r.json().catch(() => ({}));
        return json({ error: d?.error?.message || `HTTP ${r.status}` }, 500);
      }
      const enc = new TextEncoder();
      const dec = new TextDecoder();
      const upstream = r.body.getReader();
      const stream = new ReadableStream({
        async start(ctrl) {
          let buf = '';
          try {
            while (true) {
              const { done, value } = await upstream.read();
              if (done) break;
              buf += dec.decode(value, { stream: true });
              const lines = buf.split('\n');
              buf = lines.pop() || '';
              for (const line of lines) {
                if (!line.startsWith('data:')) continue;
                const j = line.slice(5).trim();
                if (!j) continue;
                try {
                  const d = JSON.parse(j);
                  const t = (d.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('');
                  ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ text: t })}\n\n`));
                } catch {}
              }
            }
            ctrl.enqueue(enc.encode('data: [DONE]\n\n'));
          } catch (e: any) {
            ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ error: e?.message || 'خطا در استریم' })}\n\n`));
          } finally {
            ctrl.close();
          }
        },
      });
      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
    }

    return json({ error: 'این قابلیت در نسخهٔ بدون سرور پشتیبانی نمی‌شود.' }, 501);
  } catch (e: any) {
    return json({ error: e?.message || 'خطا در ارتباط با هوش مصنوعی' }, 500);
  }
};

export {};
