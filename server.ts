import 'dotenv/config';
import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Modality, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
// Ensure port 3000 is used for dev server in AI Studio (avoid port 8080 used by container reverse proxy)
const args = process.argv.slice(2);
const portFlagIndex = args.findIndex(a => a === '--port' || a === '-p');
const parsedPort = portFlagIndex !== -1 && args[portFlagIndex + 1] ? Number(args[portFlagIndex + 1]) : 0;
const port = parsedPort || (process.env.PORT && process.env.PORT !== '8080' ? Number(process.env.PORT) : 3000);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Helper to get GoogleGenAI client with standard User-Agent header
const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('کلید GEMINI_API_KEY روی سرور تنظیم نشده است. لطفاً از پنل Secrets در AI Studio کلید را بررسی کنید.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

// 1. Status endpoint
app.get('/api/gemini/status', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    hasKey: Boolean(process.env.GEMINI_API_KEY),
    model: 'gemini-3.1-flash-lite',
  });
});

// 2. Generate content (standard text/JSON generation)
// Uses gemini-3.1-flash-lite by default for near-instant (1-3s) generation without reasoning delays,
// with graceful fallback to gemini-3.8-flash (with ThinkingLevel.LOW).
app.post('/api/gemini/generate', async (req: Request, res: Response) => {
  try {
    const { prompt, model, systemInstruction, responseMimeType } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'متن پرامپت الزامی است.' });
    }

    const ai = getAiClient();
    const primaryModel = model || 'gemini-3.1-flash-lite';

    const buildConfig = (m: string) => {
      const cfg: Record<string, any> = {};
      if (systemInstruction) cfg.systemInstruction = systemInstruction;
      if (responseMimeType) cfg.responseMimeType = responseMimeType;
      // If gemini-3.8-flash or gemini-4-argon is used, enforce ThinkingLevel.LOW to avoid long delays
      if (m.includes('3.8-flash') || m.includes('4-argon')) {
        cfg.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
      }
      return cfg;
    };

    let text = '';
    try {
      const response = await ai.models.generateContent({
        model: primaryModel,
        contents: prompt,
        config: buildConfig(primaryModel),
      });
      text = response.text || '';
    } catch (primaryErr: any) {
      console.warn(`Primary model ${primaryModel} failed, trying fallback:`, primaryErr?.message || primaryErr);
      // Fallback model
      const fallbackModel = primaryModel === 'gemini-3.1-flash-lite' ? 'gemini-3.8-flash' : 'gemini-3.1-flash-lite';
      const fallbackRes = await ai.models.generateContent({
        model: fallbackModel,
        contents: prompt,
        config: buildConfig(fallbackModel),
      });
      text = fallbackRes.text || '';
    }

    res.json({ text });
  } catch (err: any) {
    console.error('Server Gemini Generate Error:', err);
    res.status(500).json({ error: err.message || 'خطا در ارتباط با هوش مصنوعی سرور' });
  }
});

// 2b. Ultra-fast dedicated quick translation endpoint (~1s)
app.post('/api/gemini/quick-translate', async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'کلمه یا عبارت برای ترجمه الزامی است.' });
    }

    const ai = getAiClient();
    const prompt = `You are a German-Persian dictionary assistant. Translate the following German word/phrase into natural, accurate Persian.
Input: "${text.trim()}"
Return ONLY a JSON object with this exact shape:
{
  "de": "${text.trim()}",
  "art": "der" or "die" or "das" or "",
  "fa": "Persian translation",
  "pos": "اسم" or "فعل" or "صفت" or "قید" or "اصطلاح",
  "lvl": "A1" or "A2" or "B1" or "B2" or "C1"
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const raw = (response.text || '{}').trim();
    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    }

    res.json(parsed);
  } catch (err: any) {
    console.error('Quick translate error:', err);
    res.status(500).json({ error: err.message || 'خطا در ترجمه سریع با هوش مصنوعی' });
  }
});

// 3. Extract vocabulary & items from image(s) multimodal endpoint
app.post('/api/gemini/extract-image', async (req: Request, res: Response) => {
  try {
    const { prompt, images, model } = req.body;
    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'حداقل یک تصویر الزامی است.' });
    }

    const ai = getAiClient();
    // Default to gemini-3.1-flash-lite for near-instant (1-2s) multimodal extraction
    const targetModel = model || 'gemini-3.1-flash-lite';

    const parts: any[] = [];
    images.forEach((img: { data: string; mimeType?: string }) => {
      parts.push({
        inlineData: {
          mimeType: img.mimeType || 'image/jpeg',
          data: img.data,
        },
      });
    });

    if (prompt) {
      parts.push({ text: prompt });
    }

    let text = '';
    try {
      const response = await ai.models.generateContent({
        model: targetModel,
        contents: { parts },
      });
      text = response.text || '';
    } catch (err: any) {
      // Fallback to gemini-3.8-flash with LOW thinking level if primary fails
      console.warn(`Extraction with ${targetModel} failed, trying fallback:`, err.message);
      if (targetModel !== 'gemini-3.8-flash') {
        const fallbackRes = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: { parts },
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        });
        text = fallbackRes.text || '';
      } else {
        throw err;
      }
    }

    res.json({ text });
  } catch (err: any) {
    console.error('Server Gemini Image Extract Error:', err);
    res.status(500).json({ error: err.message || 'خطا در پردازش تصویر با هوش مصنوعی سرور' });
  }
});

// 4. Streaming SSE endpoint for real-time text generation
app.post('/api/gemini/stream', async (req: Request, res: Response) => {
  try {
    const { prompt, model, systemInstruction } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'متن پرامپت الزامی است.' });
    }

    const ai = getAiClient();
    const targetModel = model || 'gemini-3.8-flash';

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const config: Record<string, any> = {};
    if (systemInstruction) config.systemInstruction = systemInstruction;

    const streamResponse = await ai.models.generateContentStream({
      model: targetModel,
      contents: prompt,
      config: Object.keys(config).length ? config : undefined,
    });

    for await (const chunk of streamResponse) {
      const text = chunk.text || '';
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err: any) {
    console.error('Server Gemini Stream Error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message || 'خطا در استریم هوش مصنوعی' })}\n\n`);
    res.end();
  }
});

// 5. Live API WebSocket server proxy (low-latency real-time voice / audio bridge)
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  try {
    const host = request.headers.host || 'localhost';
    const { pathname } = new URL(request.url || '', `http://${host}`);
    if (pathname === '/api/gemini/live') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  } catch (err) {
    console.error('Upgrade handler error:', err);
  }
});

wss.on('connection', async (clientWs: WebSocket) => {
  try {
    const ai = getAiClient();
    const session = await ai.live.connect({
      model: 'gemini-3.8-live',
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
        },
        systemInstruction: 'You are an expert German language tutor and assistant.',
      },
      callbacks: {
        onmessage: (message: any) => {
          for (const part of message.serverContent?.modelTurn?.parts ?? []) {
            if (part.inlineData?.data) {
              clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
            }
          }
          if (message.serverContent?.interrupted) {
            clientWs.send(JSON.stringify({ interrupted: true }));
          }
        },
      },
    });

    clientWs.on('message', (data: any) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.audio) {
          session.sendRealtimeInput({
            audio: { data: parsed.audio, mimeType: 'audio/pcm;rate=16000' },
          });
        }
      } catch (e) {
        console.error('Error handling live WS client message:', e);
      }
    });

    clientWs.on('close', () => {
      try {
        session.close();
      } catch (e) {}
    });
  } catch (err: any) {
    console.error('Live API connection error:', err);
    clientWs.send(JSON.stringify({ error: err.message || 'Failed to connect to Live API' }));
    clientWs.close();
  }
});

// Vite middleware in development or static dist serving in production
const isProd = process.env.NODE_ENV === 'production';

if (isProd) {
  app.use(express.static(path.resolve(__dirname, 'dist')));
  app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
  });
} else {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: {
      middlewareMode: true,
      ws: {
        server,
      },
    },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

server.listen(port, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${port}`);
});
