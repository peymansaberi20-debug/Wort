/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * pronunciationScore.ts — امتیازدهی تلفظ با Web Speech Recognition API (درخواست کاربر ۷)
 *
 * روند:
 *   ۱) میکروفون باز می‌شود و کاربر متن هدف را می‌خواند.
 *   ۲) Web Speech Recognition متن شنیده‌شده را به‌صورت رشته برمی‌گرداند.
 *   ۳) تطبیق کلمه‌به‌کلمه با متن هدف → درصد تطابق + فهرست کلمات غلط/حذف/اضافه.
 *
 * هیچ سرویس خارجی استفاده نمی‌شود — فقط API بومی مرورگر. اگر مرورگر
 * پشتیبانی نکند (Firefox)، یک پیام خطای مهربان نشان داده می‌شود.
 *
 * خروجی: { score, recognized, missing, extra, wrong, notes }
 *   score: ۰ تا ۱۰۰
 *   recognized: کلمات درست شنیده‌شده (به‌ترتیب)
 *   missing: کلمات هدف که شنیده نشدند
 *   extra: کلمات اضافه که کاربر گفت ولی در هدف نبود
 *   wrong: کلماتی که اشتباه شنیده شدند (درست شنیده ولی متفاوت با هدف)
 *   notes: راهنمایی فارسی کوتاه
 */

export interface PronunciationResult {
  score: number;          // ۰ تا ۱۰۰
  recognizedText: string; // کل متن شنیده‌شده
  matched: string[];      // کلمات درست
  missing: string[];      // کلمات حذف‌شده از هدف
  extra: string[];        // کلمات اضافه
  wrong: { target: string; heard: string }[]; // کلمات جایگزین‌شده
  notes: string[];        // راهنمایی فارسی
}

/** آیا مرورگر از Web Speech Recognition پشتیبانی می‌کند؟ */
export function isSpeechRecognitionSupported(): boolean {
  return typeof window !== 'undefined'
    && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

/** نرمال‌سازی کلمه برای مقایسه: حذف نشانه‌گذاری، کوچک، حذف umlaut markup های اضافی */
const normWord = (w: string): string =>
  (w || '').trim().toLowerCase()
    .replace(/[.,!?;:"„""'()[\]]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .trim();

const tokenize = (s: string): string[] =>
  (s || '').split(/\s+/).map(normWord).filter(Boolean);

/** فاصلهٔ ویرایش (Levenshtein) برای تشخیص کلمات نزدیک — در صورت غلط املایی کاربر */
const lev = (a: string, b: string): number => {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n];
};

/**
 * تطبیق کلمه‌به‌کلمه بر اساس LCS (longest common subsequence).
 * الگوریتم استاندارد dp برای پیدا کردن کلمات مشترک به‌ترتیب،
 * بعد بقیه یا missing یا extra/wrong hand-lex می‌شوند.
 */
function alignWords(target: string[], spoken: string[]): {
  matched: string[]; missing: string[]; extra: string[]; wrong: { target: string; heard: string }[];
} {
  const m = target.length, n = spoken.length;
  // جدول LCS
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      // تطبیق مستقیم یا تحمل یک غلط املایی کوچک (lev ≤ 1)
      const directMatch = target[i] === spoken[j];
      const fuzzyMatch = !directMatch && target[i].length >= 3 && spoken[j].length >= 3 && lev(target[i], spoken[j]) <= 1;
      dp[i][j] = (directMatch || fuzzyMatch) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  // بازخوانی مسیر
  const matched: string[] = [];
  const wrong: { target: string; heard: string }[] = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    const directMatch = target[i] === spoken[j];
    const fuzzyMatch = !directMatch && target[i].length >= 3 && spoken[j].length >= 3 && lev(target[i], spoken[j]) <= 1;
    if (directMatch) { matched.push(target[i]); i++; j++; }
    else if (fuzzyMatch) { matched.push(target[i]); wrong.push({ target: target[i], heard: spoken[j] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++; // target[i] حذف شده
    else j++; // spoken[j] اضافه است
  }
  const missing = target.slice(i);
  const extra = spoken.slice(j);
  // همچنین کلمات target که از مسیر خارج شدند به‌عنوان missing
  // در طول بازخوانی، وقتی i++ بدون j++ می‌کنیم یعنی missing ولی در slice نهایی گیر نمی‌افتد
  // پس یک بازخوانی دوم برای پیدا کردن missing واقعی:
  const walkedTarget = new Set<number>();
  const walkedSpoken = new Set<number>();
  i = 0; j = 0;
  while (i < m && j < n) {
    const directMatch = target[i] === spoken[j];
    const fuzzyMatch = !directMatch && target[i].length >= 3 && spoken[j].length >= 3 && lev(target[i], spoken[j]) <= 1;
    if (directMatch || fuzzyMatch) { walkedTarget.add(i); walkedSpoken.add(j); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  const finalMissing = target.filter((_, k) => !walkedTarget.has(k));
  const finalExtra = spoken.filter((_, k) => !walkedSpoken.has(k));
  return { matched, missing: finalMissing, extra: finalExtra, wrong };
}

/** محاسبهٔ امتیاز ۰-۱۰۰ بر اساس تطبیق */
function computeScore(target: string[], matched: string[], wrong: { target: string; heard: string }[]): number {
  if (!target.length) return 0;
  // کلمات درست + کلمات «تقریباً درست» (فقط fuzzy) — ولی wrong هم جریمه دارد
  const exact = matched.length - wrong.length;
  const fuzzy = wrong.length;
  // امتیاز: exact = 1، fuzzy = 0.5، missing = 0
  const raw = exact + fuzzy * 0.5;
  const score = Math.round((raw / target.length) * 100);
  return Math.max(0, Math.min(100, score));
}

/** ساخت راهنمایی فارسی بر اساس نوع خطاها */
function buildNotes(target: string[], matched: string[], missing: string[], extra: string[], wrong: { target: string; heard: string }[]): string[] {
  const notes: string[] = [];
  if (missing.length > 0) {
    notes.push(`📚 کلمات حذف‌شده (${missing.length}): ${missing.slice(0, 5).join('، ')}${missing.length > 5 ? '…' : ''}`);
  }
  if (extra.length > 0) {
    notes.push(`➕ کلمات اضافه (${extra.length}): ${extra.slice(0, 5).join('، ')}${extra.length > 5 ? '…' : ''}`);
  }
  if (wrong.length > 0) {
    notes.push(`🔀 کلمات اشتباه: ${wrong.slice(0, 3).map(w => `«${w.target}» ← «${w.heard}»`).join('، ')}`);
  }
  if (!notes.length) {
    notes.push('🎉 همهٔ کلمات درست تلفظ شدند!');
  }
  return notes;
}

/**
 * تابع اصلی: متن هدف + متن شنیده‌شده → نتیجهٔ امتیازدهی
 */
export function scorePronunciation(targetText: string, recognizedText: string): PronunciationResult {
  const target = tokenize(targetText);
  const spoken = tokenize(recognizedText);
  if (!target.length) {
    return { score: 0, recognizedText, matched: [], missing: [], extra: [], wrong: [], notes: ['متن هدف خالی است.'] };
  }
  if (!spoken.length) {
    return { score: 0, recognizedText: '', matched: [], missing: target, extra: [], wrong: [], notes: ['هیچ کلمه‌ای شنیده نشد — میکروفون را نزدیک‌تر بگیر یا دوباره تلاش کن.'] };
  }
  const { matched, missing, extra, wrong } = alignWords(target, spoken);
  const score = computeScore(target, matched, wrong);
  const notes = buildNotes(target, matched, missing, extra, wrong);
  return { score, recognizedText, matched, missing, extra, wrong, notes };
}

/**
 * اجرای یک‌بارهٔ تشخیص گفتار با Web Speech API.
 * یک Promise برمی‌گرداند که با متن شنیده‌شده resolve یا با خطا reject می‌شود.
 */
export function recognizeOnce(opts: { lang?: string; maxSec?: number } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!isSpeechRecognitionSupported()) {
      reject(new Error('مرورگر شما از تشخیص گفتار پشتیبانی نمی‌کند. Chrome یا Edge را امتحان کن.'));
      return;
    }
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = opts.lang || 'de-DE';
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) { resolved = true; try { rec.stop(); } catch { /* ignore */ } reject(new Error('زمان تشخیص به پایان رسید.')); }
    }, (opts.maxSec || 10) * 1000);
    rec.onresult = (e: any) => {
      if (resolved) return;
      resolved = true; clearTimeout(timeout);
      const r = e.results?.[0]?.[0]?.transcript || '';
      resolve(String(r));
    };
    rec.onerror = (e: any) => {
      if (resolved) return;
      resolved = true; clearTimeout(timeout);
      const err = String(e?.error || '');
      const msg = err === 'no-speech' ? 'هیچ گفتاری شنیده نشد — دوباره تلاش کن.'
        : err === 'not-allowed' || err === 'service-not-allowed' ? 'اجازهٔ میکروفون داده نشد.'
        : err === 'network' ? 'خطای شبکه در تشخیص گفتار.'
        : `خطای تشخیص گفتار: ${err}`;
      reject(new Error(msg));
    };
    rec.onend = () => {
      if (!resolved) { resolved = true; clearTimeout(timeout); resolve(''); }
    };
    try { rec.start(); } catch (e: any) { clearTimeout(timeout); reject(e); }
  });
}
