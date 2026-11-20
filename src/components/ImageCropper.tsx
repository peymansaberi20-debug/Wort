/**
 * ImageCropper.tsx — کراپ عکس بعد از گرفتن با دوربین (درخواست #۶)
 *
 * استفاده در هر جایی که عکس گرفته می‌شود (ImageExtractModal، PageOverlay، …):
 *
 *   const [pendingImg, setPendingImg] = useState<string | null>(null);
 *   // بعد از گرفتن عکس به‌جای پردازش مستقیم:
 *   setPendingImg(dataUrl);
 *   ...
 *   {pendingImg && (
 *     <ImageCropper
 *       src={pendingImg}
 *       title="برش تصویر"
 *       onCancel={() => setPendingImg(null)}
 *       onConfirm={cropped => { setPendingImg(null); processImage(cropped); }}
 *     />
 *   )}
 *
 * • کشیدن داخل کادر = جابه‌جایی، کشیدن گوشه‌ها = تغییر اندازه، کشیدن بیرون کادر = انتخاب جدید
 * • خروجی: dataURL برش‌خورده (jpeg) با عرض محدودشده برای OCR سبک‌تر
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { X } from 'lucide-react';
import { IconBtn } from './IconBtn';

type Aspect = 'free' | '1:1' | '4:3';
interface Rect { x: number; y: number; w: number; h: number; } // مختصات نسبی 0..1
type DragMode = null | { kind: 'move' | 'resize' | 'new'; corner?: 'nw' | 'ne' | 'sw' | 'se'; sx: number; sy: number; start: Rect };

interface ImageCropperProps {
  src: string;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
  title?: string;
  maxOutWidth?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const ImageCropper: React.FC<ImageCropperProps> = ({ src, onCancel, onConfirm, title = 'برش تصویر', maxOutWidth = 1600 }) => {
  const [rect, setRect] = useState<Rect>({ x: 0.08, y: 0.08, w: 0.84, h: 0.84 });
  const [aspect, setAspect] = useState<Aspect>('free');
  // نسبت کادر در مختصات «نسبیِ» صفحه (w_rel/h_rel)؛ صفر = آزاد
  const relRatio = useRef(0);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const drag = useRef<DragMode>(null);

  const ASPECT_VAL: Record<Aspect, number> = { free: 0, '1:1': 1, '4:3': 4 / 3 };

  const onImgLoad = () => {
    const el = imgRef.current;
    if (el) setImgSize({ w: el.naturalWidth, h: el.naturalHeight });
  };

  const applyAspect = (a: Aspect) => {
    setAspect(a);
    if (a === 'free') { relRatio.current = 0; return; }
    const box = imgRef.current?.getBoundingClientRect();
    if (!box || box.width < 2 || box.height < 2) return;
    // w_disp/h_disp = r  →  w_rel/h_rel = r * boxH/boxW
    const rr = ASPECT_VAL[a] * box.height / box.width;
    relRatio.current = rr;
    const w = 0.84, h = w / rr;
    if (h <= 0.98) setRect({ x: (1 - w) / 2, y: (1 - h) / 2, w, h });
    else { const hh = 0.98, ww = hh * rr; setRect({ x: (1 - ww) / 2, y: (1 - hh) / 2, w: ww, h: hh }); }
  };

  const localPt = (e: React.PointerEvent): { x: number; y: number } => {
    const b = wrapRef.current!.getBoundingClientRect();
    return { x: clamp((e.clientX - b.left) / b.width, 0, 1), y: clamp((e.clientY - b.top) / b.height, 0, 1) };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!wrapRef.current) return;
    e.preventDefault();
    const p = localPt(e);
    const { x, y, w, h } = rect;
    const hitCorner = (cx: number, cy: number) => Math.abs(p.x - cx) < 0.06 && Math.abs(p.y - cy) < 0.08;
    let mode: DragMode = { kind: 'new', sx: p.x, sy: p.y, start: rect };
    if (hitCorner(x, y)) mode = { kind: 'resize', corner: 'nw', sx: p.x, sy: p.y, start: rect };
    else if (hitCorner(x + w, y)) mode = { kind: 'resize', corner: 'ne', sx: p.x, sy: p.y, start: rect };
    else if (hitCorner(x, y + h)) mode = { kind: 'resize', corner: 'sw', sx: p.x, sy: p.y, start: rect };
    else if (hitCorner(x + w, y + h)) mode = { kind: 'resize', corner: 'se', sx: p.x, sy: p.y, start: rect };
    else if (p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h) mode = { kind: 'move', sx: p.x, sy: p.y, start: rect };
    drag.current = mode;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const m = drag.current;
    if (!m || !wrapRef.current) return;
    const p = localPt(e);
    const s = m.start;
    if (m.kind === 'move') {
      setRect({ ...s, x: clamp(s.x + p.x - m.sx, 0, 1 - s.w), y: clamp(s.y + p.y - m.sy, 0, 1 - s.h) });
    } else if (m.kind === 'new') {
      const x = Math.min(m.sx, p.x), y = Math.min(m.sy, p.y);
      const w = Math.abs(p.x - m.sx), h = Math.abs(p.y - m.sy);
      setRect({ x, y, w: Math.max(w, 0.02), h: Math.max(h, 0.02) });
    } else {
      // resize با رعایت نسبت اختیاری
      let nx = s.x, ny = s.y, nw = s.w, nh = s.h;
      const dx = p.x - m.sx, dy = p.y - m.sy;
      const ar = relRatio.current;
      if (m.corner === 'se') { nw = s.w + dx; nh = s.h + dy; }
      else if (m.corner === 'sw') { nx = s.x + dx; nw = s.w - dx; nh = s.h + dy; }
      else if (m.corner === 'ne') { ny = s.y + dy; nw = s.w + dx; nh = s.h - dy; }
      else { nx = s.x + dx; ny = s.y + dy; nw = s.w - dx; nh = s.h - dy; }
      if (ar > 0) {
        // از محور غالب پیروی کن، دیگری از نسبت
        if (Math.abs(dx) >= Math.abs(dy)) { nw = Math.max(nw, 0.05); nh = nw / ar; }
        else { nh = Math.max(nh, 0.05); nw = nh * ar; }
        if (m.corner === 'sw' || m.corner === 'nw') nx = s.x + s.w - nw;
        if (m.corner === 'nw' || m.corner === 'ne') ny = s.y + s.h - nh;
      }
      nw = Math.max(nw, 0.04); nh = Math.max(nh, 0.04);
      nx = clamp(nx, 0, 1 - nw); ny = clamp(ny, 0, 1 - nh);
      setRect({ x: nx, y: ny, w: nw, h: nh });
    }
  }, [aspect]);

  const onPointerUp = () => { drag.current = null; };

  const confirm = () => {
    const img = imgRef.current;
    if (!img || !imgSize || busy) return;
    setBusy(true);
    try {
      const sx = rect.x * imgSize.w, sy = rect.y * imgSize.h;
      const sw = Math.max(8, rect.w * imgSize.w), sh = Math.max(8, rect.h * imgSize.h);
      const scale = Math.min(1, maxOutWidth / sw);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(sw * scale);
      canvas.height = Math.round(sh * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no ctx');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      onConfirm(canvas.toDataURL('image/jpeg', 0.92));
    } catch {
      onConfirm(src); // در بدترین حالت، عکس کامل
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => () => { drag.current = null; }, []);

  return (
    <div className="fixed inset-0 z-[95] bg-black/70 backdrop-blur-sm flex items-end sm:items-center sm:justify-center" dir="rtl">
      <div className="w-full sm:max-w-lg bg-white dark:bg-[#1b2029] rounded-t-3xl sm:rounded-3xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold">✂️ {title}</div>
          <IconBtn onClick={onCancel} title="بستن"><X size={18} className="text-red-500" /></IconBtn>
        </div>

        <div
          ref={wrapRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="relative w-full overflow-hidden rounded-xl border border-[#dde1ea] dark:border-[#333b4a] bg-slate-900 touch-none select-none"
          style={{ maxHeight: '52vh' }}
        >
          <img ref={imgRef} src={src} onLoad={onImgLoad} alt="برای برش" className="block w-full h-auto max-h-[52vh] object-contain pointer-events-none" draggable={false} />
          {/* لایهٔ تیره بیرون کادر */}
          <div className="absolute inset-0 bg-black/45 pointer-events-none" style={{ clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${rect.x * 100}% ${rect.y * 100}%, ${rect.x * 100}% ${(rect.y + rect.h) * 100}%, ${(rect.x + rect.w) * 100}% ${(rect.y + rect.h) * 100}%, ${(rect.x + rect.w) * 100}% ${rect.y * 100}%, ${rect.x * 100}% ${rect.y * 100}%)` }} />
          {/* کادر انتخاب */}
          <div className="absolute border-2 border-white pointer-events-none" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }}>
            {(['nw', 'ne', 'sw', 'se'] as const).map(c => (
              <span
                key={c}
                className="absolute w-4 h-4 bg-white rounded-full shadow-md"
                style={{
                  [c.includes('n') ? 'top' : 'bottom']: -8,
                  [c.includes('w') ? 'left' : 'right']: -8,
                  cursor: `${c}-resize`
                } as React.CSSProperties}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1.5">
            {(['free', '1:1', '4:3'] as Aspect[]).map(a => (
              <button
                key={a}
                onClick={() => applyAspect(a)}
                className={`text-[11px] font-bold rounded-full px-3 py-1.5 border transition ${aspect === a
                  ? 'bg-[#1f5fbf] text-white border-transparent'
                  : 'bg-slate-50 dark:bg-[#141923] border-[#dde1ea] dark:border-[#333b4a]'}`}
              >
                {a === 'free' ? 'آزاد' : a === '1:1' ? '۱:۱' : '۴:۳'}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={onCancel} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">انصراف</button>
            <button onClick={confirm} disabled={busy} className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white text-xs font-bold disabled:opacity-60">
              {busy ? '⏳ …' : '✓ برش و ادامه'}
            </button>
          </div>
        </div>
        <p className="text-[10px] text-[#5d6676] leading-4">
          داخل کادر را بکش تا جابه‌جا شود؛ از گوشه‌ها بکش تا اندازه عوض شود؛ بیرون کادر بکش تا انتخاب تازه بزنی.
        </p>
      </div>
    </div>
  );
};
