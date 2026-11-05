/**
 * Local (in-browser) OCR with Tesseract.js. No AI provider and no API key are involved:
 * the recognised text never leaves the device.
 *
 * The OCR engine (script, WASM core and the German language data) is downloaded from a public CDN
 * the first time it is used, so the very first run needs an internet connection. After that the
 * browser cache normally serves it, but this is NOT guaranteed to work fully offline.
 * The loaded worker is reused for all images of a session.
 */

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

export type OcrQuality = 'ok' | 'poor' | 'empty';

/** Pure: judges an OCR result so the UI can warn the user. */
export function ocrQuality(text: string, confidence: number): OcrQuality {
  const letters = (String(text || '').match(/\p{L}/gu) || []).length;
  if (letters < 3) return 'empty';
  if (!(confidence >= 55)) return 'poor';
  return 'ok';
}

let scriptPromise: Promise<any> | null = null;

export function loadTesseract(): Promise<any> {
  const w = globalThis as any;
  if (w.Tesseract) return Promise.resolve(w.Tesseract);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('OCR فقط در مرورگر کار می‌کند.'));
      return;
    }
    const s = document.createElement('script');
    s.src = TESSERACT_URL;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.onload = () => (w.Tesseract ? resolve(w.Tesseract) : reject(new Error('موتور OCR بارگذاری شد ولی در دسترس نیست.')));
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error('دانلود موتور OCR ممکن نشد. اتصال اینترنت را بررسی کنید (بار اول لازم است) یا از «ورود متن به‌صورت دستی» استفاده کنید.'));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

let workerPromise: Promise<any> | null = null;
let progressCb: ((pct: number, msg: string) => void) | undefined;

async function getWorker(): Promise<any> {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    const T = await loadTesseract();
    return T.createWorker('deu', 1, {
      logger: (m: any) => {
        if (!progressCb || !m) return;
        const pct = Math.round((m.progress || 0) * 100);
        const label = m.status === 'recognizing text' ? 'در حال خواندن متن' : 'در حال آماده‌سازی OCR (بار اول داده‌های زبان آلمانی دانلود می‌شود)';
        progressCb(pct, label);
      }
    });
  })().catch(e => {
    workerPromise = null;
    throw e;
  });
  return workerPromise;
}

export interface OcrResult {
  text: string;
  confidence: number;
  quality: OcrQuality;
}

export async function recognizeImage(file: Blob, onProgress?: (pct: number, msg: string) => void): Promise<OcrResult> {
  progressCb = onProgress;
  const worker = await getWorker();
  const { data } = await worker.recognize(file);
  const text = String(data?.text || '');
  const confidence = Number(data?.confidence ?? 0);
  return { text, confidence, quality: ocrQuality(text, confidence) };
}

export async function releaseOcr(): Promise<void> {
  const p = workerPromise;
  workerPromise = null;
  progressCb = undefined;
  try {
    if (p) await (await p).terminate();
  } catch {
    // worker already gone
  }
}
