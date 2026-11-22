/**
 * فشرده‌سازی تصویر پیش از ذخیره — همراه با لایهٔ imageStore.ts (ذخیرهٔ عکس‌ها در IndexedDB):
 *  ۱) عکس‌ها دیگر داخل JSON اصلی localStorage نمی‌مانند، ولی سقف نویسه داده‌URL همچنان
 *     آپلود ابری (سند ~۱MB در Firestore) و مصرف حافظه را ایمن نگه می‌دارد؛
 *  ۲) این کمک‌تابع بزرگ‌ترین ضلع را به maxDim محدود و کیفیت JPEG پله‌پله پایین می‌آورد
 *     تا رشتهٔ base64 حتماً زیر MAX_IMG_CHARS نویسه (~۲۵۰KB باینری) بماند.
 */

export const MAX_IMG_CHARS = 350_000;

export function shrinkImageForStorage(dataUrl: string, maxDim = 800, maxChars = MAX_IMG_CHARS): Promise<string> {
  return new Promise(resolve => {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) { resolve(dataUrl || ''); return; }
    if (dataUrl.length <= maxChars) { resolve(dataUrl); return; }

    const img = new Image();
    img.onload = () => {
      // نسبت بزرگ‌ترین ضلع به سقف مجاز؛ اگر خود عکس کوچک‌تر است فقط کیفیت را کم کن
      const baseScale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const scales = [baseScale, baseScale * 0.75, baseScale * 0.55, baseScale * 0.4];
      const qualities = [0.78, 0.62, 0.5, 0.4];
      let last = dataUrl;
      for (const s of scales) {
        const w = Math.max(1, Math.round(img.width * s));
        const h = Math.max(1, Math.round(img.height * s));
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) break;
        canvas.width = w; canvas.height = h;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        for (const q of qualities) {
          last = canvas.toDataURL('image/jpeg', q);
          if (last.length <= maxChars) { resolve(last); return; }
        }
      }
      resolve(last); // کوچک‌ترین خروجی حتی اگر باز هم بزرگ بود (سقف norm() محافظ نهایی است)
    };
    img.onerror = () => resolve(dataUrl); // عکس ناخوانا → همان ورودی (رفتار قبلی)
    img.src = dataUrl;
  });
}
