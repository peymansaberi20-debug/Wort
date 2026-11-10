import React, { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Word } from '../types';
import { norm, getCategories } from '../utils/storage';
import { applyGermanQuality } from '../utils/german';
import { splitCandidates } from '../utils/extractSession';
import { generateWithGemini, processBatchWordsWithGemini, parseAI } from '../utils/ai';
import { generateWithImages } from '../utils/aiProvider';
import { recognizeImage, releaseOcr } from '../utils/ocr';
import { IconBtn } from '../components/IconBtn';
import { X, Camera, FileText, Keyboard, ChevronLeft, Sparkles } from 'lucide-react';

interface GroupImportViewProps {
  words: Word[];
  onAddEnrichedWords: (ws: Word[]) => void;
  onClose: () => void;
  onShowToast: (msg: string, isErr?: boolean) => void;
}

interface GCand {
  de: string; art: string; cefr: string; fa: string;
  complete: boolean; full?: Word; have: boolean; on: boolean; cat: string;
}

const LEVEL_ORDER = ['', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const isBelowLevel = (cefr: string, min: string) => {
  const a = LEVEL_ORDER.indexOf((cefr || '').toUpperCase());
  const b = LEVEL_ORDER.indexOf(min.toUpperCase());
  return a >= 0 && b > 0 && a <= b;
};

export const GroupImportView: React.FC<GroupImportViewProps> = ({ words, onAddEnrichedWords, onClose, onShowToast }) => {
  const [source, setSource] = useState<'file' | 'text' | null>(null);
  const [method, setMethod] = useState<'ai' | 'noai' | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [manualText, setManualText] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [ocrMsg, setOcrMsg] = useState('');
  const [cands, setCands] = useState<GCand[]>([]);
  const [depth, setDepth] = useState<'light' | 'mid' | 'full'>('light');
  const [bulkCat, setBulkCat] = useState('');
  const [minLevelFilter, setMinLevelFilter] = useState('');
  const [enriching, setEnriching] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const ocrRef = useRef<any>(null);

  const existingCategories = getCategories(words);
  useEffect(() => () => { void releaseOcr(); }, []);

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL('image/jpeg', 0.75).split(',')[1]);
        } else { reject(new Error('خطا در فشرده‌سازی تصویر')); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('تصویر قابل خواندن نیست.')); };
      img.src = url;
    });

  const pushCands = (list: { de: string; art?: string; cefr?: string; fa?: string; full?: Word }[]) => {
    const haveKey = (de: string) => {
      const k = de.toLowerCase().replace(/^(der|die|das)\s+/i, '').trim();
      return words.some(w => w.de.toLowerCase() === k || `${w.art} ${w.de}`.toLowerCase() === de.toLowerCase().trim());
    };
    const seen = new Set<string>();
    const next: GCand[] = [];
    for (const it of list) {
      const de = (it.de || '').trim().replace(/^(?:der|die|das)\s+/i, '').trim();
      if (!de || de.length < 2) continue;
      const k = de.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      const have = haveKey(it.art ? `${it.art} ${de}` : de) || haveKey(de);
      next.push({
        de, art: (it.art || '').toLowerCase(), cefr: (it.cefr || '').toUpperCase(),
        fa: it.fa || '', complete: !!it.full, full: it.full, have, on: !have, cat: ''
      });
    }
    setCands(next);
  };

  /** Structured files (xlsx/xls/csv/json-array) → complete candidates immediately. */
  const handleStructuredFile = async (file: File): Promise<boolean> => {
    const name = file.name.toLowerCase();
    if (name.endsWith('.json')) {
      const parsed = JSON.parse(await file.text());
      if (parsed && Array.isArray(parsed.words)) {
        throw new Error('این فایل پشتیبان کامل برنامه است — برای بازیابی به بخش «ورود/خروج» برو.');
      }
      if (!Array.isArray(parsed)) throw new Error('فایل JSON نامعتبر است.');
      const { ws, errs } = (() => { const r = { ws: [] as Word[], errs: [] as string[] }; try { const imp = norm ? null : null; } catch { /* noop */ } return r; })();
      const mapped = (parsed as any[]).map(o => norm(o)).filter(Boolean) as Word[];
      pushCands(mapped.map(w => ({ de: `${w.art ? w.art + ' ' : ''}${w.de}`, art: w.art, fa: w.fa, full: w })));
      if (errs.length) onShowToast(errs[0], true);
      return true;
    }
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error('فایل اکسل برگه‌ای ندارد.');
      const rawRows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
      const out: { de: string; art: string; fa: string; full: Word }[] = [];
      rawRows.forEach(row => {
        const normRow: Record<string, string> = {};
        for (const [k, v] of Object.entries(row)) {
          normRow[k.trim().toLowerCase().replace(/[\s"_-]/g, '')] = typeof v === 'string' ? v.trim() : (v != null ? String(v).trim() : '');
        }
        const getVal = (aliases: string[]) => { for (const a of aliases) if (normRow[a]) return normRow[a]; return ''; };
        const de = getVal(['german', 'de', 'word', 'wort', 'آلمانی', 'کلمه', 'واژه']);
        const fa = getVal(['persian', 'fa', 'translation', 'farsi', 'ترجمه', 'فارسی', 'معنی']);
        if (!de || !fa) return;
        const w = norm({
          de, fa,
          art: getVal(['article', 'art', 'آرتیکل']),
          pl: getVal(['plural', 'pl', 'جمع']),
          pos: getVal(['partofspeech', 'pos', 'نوع', 'نقش']),
          lvl: getVal(['level', 'lvl', 'سطح']),
          ex: getVal(['example', 'ex', 'مثال']),
          exFa: getVal(['exampletranslation', 'exfa', 'ترجمهمثال']),
          ex2: getVal(['example2', 'ex2', 'مثالکاربردی']),
          ex2Fa: getVal(['example2translation', 'ex2fa', 'ترجمهمثالکاربردی']),
          en: getVal(['english', 'en', 'معادلانگلیسی', 'انگلیسی']),
          syn: getVal(['synonym', 'syn', 'مترادف']),
          synFa: getVal(['synonymtranslation', 'synfa']),
          ant: getVal(['antonym', 'ant', 'متضاد']),
          antFa: getVal(['antonymtranslation', 'antfa']),
          cat: getVal(['category', 'cat', 'دسته', 'دسته‌بندی']),
          conj: getVal(['conjugation', 'conj', 'صرف']),
          prat: getVal(['preteritum', 'prat']),
          perf: getVal(['perfekt', 'perf']),
          sep: getVal(['separableprefix', 'sep']),
          notes: getVal(['notes', 'یادداشت', 'نکات']),
          tags: getVal(['tags', 'برچسب'])
        });
        if (w) { out.push({ de: `${w.art ? w.art + ' ' : ''}${w.de}`, art: w.art, fa: w.fa, full: applyGermanQuality(w) }); }
      });
      if (out.length === 0) throw new Error('در فایل اکسل واژهٔ قابل ورودی پیدا نشد (german + persian لازم است).');
      pushCands(out);
      return true;
    }
    if (name.endsWith('.csv')) {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) throw new Error('فایل CSV خالی است یا عنوان ندارد.');
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[\s"_-]/g, ''));
      const deIdx = headers.findIndex(h => ['german', 'de', 'word', 'wort', 'آلمانی'].includes(h));
      const faIdx = headers.findIndex(h => ['persian', 'fa', 'translation', 'farsi', 'ترجمه', 'فارسی'].includes(h));
      if (deIdx < 0 || faIdx < 0) throw new Error('ستون‌های german و persian الزامی هستند.');
      const idx = (names: string[]) => headers.findIndex(h => names.includes(h));
      const artIdx = idx(['article', 'art', 'آرتیکل']);
      const lvlIdx = idx(['level', 'lvl', 'سطح']);
      const catIdx = idx(['category', 'cat', 'دسته']);
      const exIdx = idx(['example', 'ex', 'مثال', 'definition', 'bedeutung', 'تعریف']);
      const exFaIdx = idx(['exampletranslation', 'exfa', 'ترجمهمثال', 'ترجمهتعریف']);
      const ex2Idx = idx(['example2', 'ex2', 'مثال2', 'مثالکاربردی']);
      const ex2FaIdx = idx(['example2translation', 'ex2fa', 'ترجمهمثال2']);
      const enIdx = idx(['english', 'en', 'معادلانگلیسی', 'انگلیسی']);
      const plIdx = idx(['plural', 'pl', 'جمع']);
      const posIdx = idx(['partofspeech', 'pos', 'نقش']);
      const synIdx = idx(['synonym', 'syn', 'مترادف']);
      const synFaIdx = idx(['synonymtranslation', 'synfa']);
      const antIdx = idx(['antonym', 'ant', 'متضاد']);
      const antFaIdx = idx(['antonymtranslation', 'antfa']);
      const conjIdx = idx(['conjugation', 'conj', 'صرف']);
      const pratIdx = idx(['preteritum', 'prat']);
      const perfIdx = idx(['perfekt', 'perf']);
      const sepIdx = idx(['separableprefix', 'sep']);
      const notesIdx = idx(['notes', 'یادداشت', 'نکات']);
      const tagsIdx = idx(['tags', 'برچسب']);
      const out: { de: string; art: string; fa: string; full: Word }[] = [];
      lines.slice(1).forEach(line => {
        const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        const de = cols[deIdx], fa = cols[faIdx];
        if (!de || !fa) return;
        const w = norm({
          de, fa,
          art: artIdx >= 0 ? cols[artIdx] : '',
          pl: plIdx >= 0 ? cols[plIdx] : '',
          pos: posIdx >= 0 ? cols[posIdx] : '',
          lvl: lvlIdx >= 0 ? cols[lvlIdx] : '',
          ex: exIdx >= 0 ? cols[exIdx] : '',
          exFa: exFaIdx >= 0 ? cols[exFaIdx] : '',
          ex2: ex2Idx >= 0 ? cols[ex2Idx] : '',
          ex2Fa: ex2FaIdx >= 0 ? cols[ex2FaIdx] : '',
          en: enIdx >= 0 ? cols[enIdx] : '',
          syn: synIdx >= 0 ? cols[synIdx] : '',
          synFa: synFaIdx >= 0 ? cols[synFaIdx] : '',
          ant: antIdx >= 0 ? cols[antIdx] : '',
          antFa: antFaIdx >= 0 ? cols[antFaIdx] : '',
          cat: catIdx >= 0 ? cols[catIdx] : '',
          conj: conjIdx >= 0 ? cols[conjIdx] : '',
          prat: pratIdx >= 0 ? cols[pratIdx] : '',
          perf: perfIdx >= 0 ? cols[perfIdx] : '',
          sep: sepIdx >= 0 ? cols[sepIdx] : '',
          notes: notesIdx >= 0 ? cols[notesIdx] : '',
          tags: tagsIdx >= 0 ? cols[tagsIdx] : ''
        });
        if (w) out.push({ de: `${w.art ? w.art + ' ' : ''}${w.de}`, art: w.art, fa: w.fa, full: applyGermanQuality(w) });
      });
      if (out.length === 0) throw new Error('در CSV واژهٔ قابل ورودی پیدا نشد.');
      pushCands(out);
      return true;
    }
    return false;
  };

  const handlePdf = async (file: File): Promise<boolean> => {
    if (!file.name.toLowerCase().endsWith('.pdf')) return false;
    setOcrMsg('در حال خواندن PDF…');
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    const buf = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: buf }).promise;
    let text = '';
    for (let p = 1; p <= Math.min(pdf.numPages, 20); p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      text += '\n' + content.items.map((it: any) => it.str).join(' ');
    }
    if (!text.trim()) {
      throw new Error('این PDF متن قابل استخراج ندارد (احتمالاً اسکن است) — صفحاتش را عکس بگیر و به‌عنوان تصویر وارد کن.');
    }
    setManualText(prev => (prev ? prev + '\n' + text.trim() : text.trim()));
    setSource('text');
    onShowToast('متن PDF استخراج و به ورودی متن اضافه شد.', false);
    return true;
  };

  const onFilesChosen = async (fileList: FileList | null) => {
    if (!fileList || !fileList.length) return;
    setLoading(true); setStatusMsg(''); setErr2('');
    const arr = Array.from(fileList);
    const images: File[] = [];
    let handledStructured = false;
    try {
      for (const f of arr) {
        const n = f.name.toLowerCase();
        if (f.type.startsWith('image/')) { images.push(f); continue; }
        if (n.endsWith('.pdf')) { await handlePdf(f); continue; }
        if (n.endsWith('.xlsx') || n.endsWith('.xls') || n.endsWith('.csv') || n.endsWith('.json')) {
          await handleStructuredFile(f); handledStructured = true; continue;
        }
        if (n.endsWith('.txt')) {
          const t = await f.text();
          setManualText(prev => (prev ? prev + '\n' + t : t));
          setSource('text');
          continue;
        }
        throw new Error(`فرمت «${f.name}» پشتیبانی نمی‌شود.`);
      }
      if (images.length) { setFiles(images); setSource('file'); }
      if (handledStructured) setStatusMsg('فایل ساختاریافته خوانده شد — پیش‌نمایش پایین آماده است.');
      else if (images.length) setStatusMsg(`${images.length} تصویر آماده است — حالا روش پردازش را انتخاب کن.`);
      else if (!handledStructured) setStatusMsg('ورودی آماده است.');
    } catch (e: any) {
      onShowToast(e?.message || 'خطا در خواندن فایل', true);
      setStatusMsg(e?.message || '');
    } finally { setLoading(false); }
  };

  // ---------- Extraction ----------
  const runExtract = async () => {
    setLoading(true); setCands([]); setStatusMsg('');
    const isImages = source === 'file' && files.length > 0;

    if (isImages && method === 'ai') {
      try {
        const imagesPayload: { data: string; mimeType: string }[] = [];
        for (const f of files) imagesPayload.push({ data: await fileToBase64(f), mimeType: 'image/jpeg' });
        const promptText = `Extract visible German words and expressions from this image.
Return ONLY a JSON array, no Markdown, no commentary:
[{"de":"noun WITHOUT article or the word/expression as-is","art":"der|die|das|","cefr":"A1|A2|B1|B2|C1|C2"}]
Rules:
- de: the visible German word/expression; for nouns omit the article and put it in "art".
- cefr: realistic CEFR estimate (A1 = sehr einfach; C2 = selten/fach).
- No translations, no definitions, no notes, no bullet points. If a word is unreadable, omit it.`;
        const rawText = await generateWithImages(promptText, imagesPayload, { timeoutMs: 60000, retries: 0 });
        const haveKey = (d: string) => words.some(w => w.de.toLowerCase() === d.toLowerCase());
        let ok = false;
        try {
          const arr = parseAI(rawText);
          if (Array.isArray(arr) && arr.length && arr[0]?.de) {
            ok = true;
            pushCands(arr.map((o: any) => ({ de: String(o.de || ''), art: String(o.art || '').toLowerCase(), cefr: String(o.cefr || '').toUpperCase() })));
          }
        } catch { ok = false; }
        if (!ok) {
          const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          pushCands(lines.map(l => ({ de: l.replace(/^[\*\-•\d\.\)\s]+/, '').replace(/^(?:der|die|das)\s+/i, '').trim() })));
        }
        setStatusMsg(`${candsCount()} واژه شناسایی شد.`);
      } catch (e: any) {
        setStatusMsg(`خطا: ${e?.message || 'استخراج ناموفق بود.'}`);
        onShowToast(e?.message || 'خطا در استخراج', true);
      } finally { setLoading(false); }
      return;
    }

    if (isImages && method === 'noai') {
      try {
        let all = ''; let minConf = 100;
        for (let i = 0; i < files.length; i++) {
          const r = await recognizeImage(files[i], (pct, msg) => setOcrMsg(`${msg} ${pct}٪ — تصویر ${i + 1} از ${files.length}`));
          all += '\n' + r.text;
          if (r.quality !== 'empty') minConf = Math.min(minConf, r.confidence);
        }
        const list = splitCandidates(all, { dropTrivial: true });
        if (list.length === 0) { setStatusMsg('متنی از تصویر خوانده نشد.'); setLoading(false); return; }
        pushCands(list.map(l => ({ de: l })));
        setStatusMsg(minConf < 55 ? `${list.length} واژه خوانده شد ولی دقت OCR پایین است؛ املا را بررسی کن.` : `${list.length} واژه با OCR خوانده شد.`);
      } catch (e: any) {
        setStatusMsg(`خطا: ${e?.message || 'OCR ناموفق بود.'}`);
      } finally { setOcrMsg(''); setLoading(false); }
      return;
    }

    if (source === 'text' && manualText.trim()) {
      const text = manualText.trim();
      if (method === 'ai') {
        try {
          const prompt = `Extract the German words and expressions worth learning from this German text (skip trivial function words).
Return ONLY a JSON array, no Markdown:
[{"de":"...","art":"der|die|das|","cefr":"A1|A2|B1|B2|C1|C2"}]\n\nTEXT:\n${text.slice(0, 6000)}`;
          const raw = await generateWithGemini(prompt, { timeoutMs: 60000, retries: 0 });
          const arr = parseAI(raw);
          pushCands((Array.isArray(arr) ? arr : []).map((o: any) => ({ de: String(o?.de || ''), art: String(o?.art || '').toLowerCase(), cefr: String(o?.cefr || '').toUpperCase() })));
          setStatusMsg('واژه‌های پیشنهادی استخراج شد.');
        } catch (e: any) {
          setStatusMsg(`خطا: ${e?.message || 'استخراج ناموفق بود.'}`);
        } finally { setLoading(false); }
        return;
      }
      const list = splitCandidates(text, { dropTrivial: true });
      pushCands(list.map(l => ({ de: l })));
      setStatusMsg(`${list.length} واژه از متن استخراج شد.`);
      setLoading(false);
      return;
    }
    setLoading(false);
  };

  const candsCount = () => cands.filter(c => c.on).length;

  // ---------- Enrich & commit ----------
  const commit = async () => {
    const selected = cands.filter(c => c.on);
    if (!selected.length) { onShowToast('حداقل یک واژه را انتخاب کن.', true); return; }
    setEnriching(true); setProgressPercent(5);
    setProgressMsg(`تکمیل ${selected.length} واژه (${depth === 'full' ? 'کامل' : depth === 'mid' ? 'نیمه' : 'سبک'})…`);
    try {
      const userCatMap = new Map<string, string>();
      selected.forEach(c => {
        const key = c.de.toLowerCase();
        if (c.cat && c.cat.trim()) userCatMap.set(key, c.cat.trim());
        else if (bulkCat && bulkCat.trim()) userCatMap.set(key, bulkCat.trim());
      });

      const done: Word[] = [];
      // 1) complete ones (from structured files) go straight in
      selected.filter(c => c.complete && c.full).forEach(c => done.push(c.full!));

      // 2) enrich the rest by depth
      const rest = selected.filter(c => !c.complete);
      if (rest.length) {
        const lines = rest.map(c => c.de.trim());
        const { ws } = await processBatchWordsWithGemini(
          lines, words, undefined,
          (d, t, m) => { setProgressPercent(Math.round((d / Math.max(1, t)) * 85) + 5); setProgressMsg(m); },
          depth
        );
        ws.forEach(w => {
          const key = w.de.toLowerCase();
          if (userCatMap.has(key)) w.cat = userCatMap.get(key)!;
          const v = norm(w);
          if (v && v.de && v.fa) done.push(v);
        });
      }

      if (done.length === 0) throw new Error('هیچ واژه‌ای تکمیل/ثبت نشد.');
      onAddEnrichedWords(done);
      setProgressPercent(100);
      onShowToast(`${done.length} واژه ثبت شد.`, false);
      setCands([]);
      onClose();
    } catch (e: any) {
      onShowToast(e?.friendly || e?.message || 'خطا در ثبت گروهی', true);
      setProgressMsg(`خطا: ${e?.message || ''}`);
    } finally { setEnriching(false); }
  };

  const errMsg = '';

  return (
    <div className="min-h-screen bg-[#f6f7fb] dark:bg-[#12151c] text-[#1d2330] dark:text-[#eef1f6] flex flex-col font-sans">
      <header className="sticky top-0 z-20 bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-3 md:px-5 h-14 md:h-16 flex items-center gap-2 shadow-lg">
        <IconBtn onClick={onClose} title="بازگشت به واژگان"><X size={18} className="text-red-500" /></IconBtn>
        <h1 className="flex-1 text-right font-bold text-base md:text-lg">📦 افزودن واژگان گروهی</h1>
        <span className="hidden sm:inline text-[11px] text-white/70">گام ۱: ورودی ← گام ۲: روش ← گام ۳: تنظیم و ثبت</span>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto p-3.5 md:p-6 space-y-4 pb-16">
        {/* Step 1 — source */}
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 space-y-3">
          <b className="text-sm md:text-base flex items-center gap-2"><span>۱.</span> ورودی را انتخاب کن</b>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setSource('file')}
              className={`h-16 rounded-2xl border-2 font-bold text-sm transition flex items-center justify-center gap-2 ${source === 'file' ? 'border-[#1f5fbf] bg-blue-50 dark:bg-blue-950/40 text-[#1f5fbf] dark:text-blue-300' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200'}`}>
              📷 / 🖼 / 📄 فایل (تصویر، PDF، اکسل، CSV)
            </button>
            <button onClick={() => setSource('text')}
              className={`h-16 rounded-2xl border-2 font-bold text-sm transition flex items-center justify-center gap-2 ${source === 'text' ? 'border-[#1f5fbf] bg-blue-50 dark:bg-blue-950/40 text-[#1f5fbf] dark:text-blue-300' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200'}`}>
              ⌨️ متن دستی
            </button>
          </div>

          {source === 'file' && (
            <div className="space-y-2">
              <input
                type="file" multiple
                accept="image/*,application/pdf,.xlsx,.xls,.csv,.json,.txt"
                onChange={e => void onFilesChosen(e.target.files)}
                className="w-full text-xs file:bg-slate-100 dark:file:bg-slate-800 file:border-0 file:rounded-xl file:px-4 file:py-2.5 file:text-xs file:font-bold file:mr-2 cursor-pointer border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-2 bg-slate-50/50 dark:bg-[#141923]"
              />
              <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold">
                <input type="checkbox" checked={method === 'noai'} onChange={e => setMethod(e.target.checked ? 'noai' : 'ai')} className="w-4 h-4 accent-[#1f5fbf]" />
                <span>بدون هوش مصنوعی (فقط OCR محلی برای تصویر — بقیهٔ فرمت‌ها نیازی به AI ندارند)</span>
              </label>
              {files.length > 0 && <div className="text-[11px] text-[#5d6676]">{files.length} فایل تصویری انتخاب شده.</div>}
            </div>
          )}

          {source === 'text' && (
            <div className="space-y-2">
              <textarea
                dir="ltr" rows={6} value={manualText}
                onChange={e => setManualText(e.target.value)}
                placeholder="متن آلمانی یا فهرست واژه‌ها را اینجا بچسبان/تایپ کن…"
                className="w-full bg-white dark:bg-[#141923] border-2 border-[#1f5fbf] dark:border-[#7fb0ff] rounded-xl px-3.5 py-2.5 font-sans text-sm outline-none"
              />
              <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold">
                <input type="checkbox" checked={method === 'noai'} onChange={e => setMethod(e.target.checked ? 'noai' : 'ai')} className="w-4 h-4 accent-[#1f5fbf]" />
                <span>بدون هوش مصنوعی (جداسازی سادهٔ واژه‌ها)</span>
              </label>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => void runExtract()}
              disabled={loading || enriching || !source || (source === 'file' && files.length === 0) || (source === 'text' && !manualText.trim())}
              className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-40 transition flex items-center gap-2"
            >
              {loading ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span> : <Sparkles size={16} />}
              <span>{method === 'noai' ? 'استخراج بدون هوش مصنوعی' : 'استخراج با هوش مصنوعی'}</span>
            </button>
            <span className="text-xs text-[#5d6676] dark:text-[#a3adbd] truncate">{ocrMsg || statusMsg}</span>
          </div>
        </div>

        {/* Step 3 — preview + settings */}
        {cands.length > 0 && (
          <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 space-y-3">
            <b className="text-sm md:text-base flex items-center gap-2"><span>۳.</span> تنظیم و ثبت ({cands.filter(c => c.on).length} انتخاب‌شده از {cands.length})</b>

            <div className="flex flex-wrap items-center gap-2">
              <select value={depth} onChange={e => setDepth(e.target.value as any)} disabled={enriching}
                className="bg-white dark:bg-slate-800 border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-2.5 py-1.5 text-xs font-bold outline-none">
                <option value="light">⚡ سبک (سریع — fa+en+lvl)</option>
                <option value="mid">⚙️ نیمه (+pl+pos)</option>
                <option value="full">💎 کامل (۲۸ فیلد)</option>
              </select>
              <select value={bulkCat} onChange={e => setBulkCat(e.target.value)} disabled={enriching}
                className="bg-white dark:bg-slate-800 border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-2.5 py-1.5 text-xs font-bold outline-none max-w-[220px] truncate">
                <option value="">📁 دستهٔ بی‌دسته‌ها: خودکار AI</option>
                {existingCategories.map(([c]) => <option key={c} value={c}>📁 {c}</option>)}
              </select>
              <select value={minLevelFilter} onChange={e => setMinLevelFilter(e.target.value)} disabled={enriching}
                className="bg-white dark:bg-slate-800 border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-2.5 py-1.5 text-xs font-bold outline-none">
                <option value="">فیلتر سطح: هیچ</option>
                <option value="A1">حذف A1 و پایین‌تر</option>
                <option value="A2">حذف A2 و پایین‌تر</option>
                <option value="B1">حذف B1 و پایین‌تر</option>
              </select>
              <button
                onClick={() => setCands(prev => prev.map(c => ({ ...c, on: !c.on })))}
                disabled={enriching}
                className="bg-blue-50 text-[#1f5fbf] hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-900 px-3 py-1.5 rounded-xl text-xs font-bold transition disabled:opacity-40">
                {cands.every(c => c.on) ? '☐ عدم انتخاب همه' : '☑ انتخاب همه'}
              </button>
              <button
                onClick={() => setCands(prev => prev.map(c => ({ ...c, on: c.complete ? true : !c.have && !c.on })))}
                disabled={enriching}
                className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 px-3 py-1.5 rounded-xl text-xs font-bold transition disabled:opacity-40"
                title="جدیدها + واژه‌های کامل فایل را انتخاب می‌کند؛ تکراری‌های کتابخانه نه">
                ✦ فقط جدیدها
              </button>
            </div>

            <div className="max-h-[46vh] overflow-y-auto space-y-2">
              {cands.map((c, i) => {
                const dim = minLevelFilter && isBelowLevel(c.cefr, minLevelFilter);
                return (
                  <div key={i} className={`p-2.5 rounded-2xl border transition space-y-1.5 ${c.on ? 'bg-blue-50/60 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900' : 'bg-white dark:bg-[#1b2029] border-[#dde1ea] dark:border-[#333b4a] opacity-70'} ${dim ? 'opacity-40' : ''}`}>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <label className="flex items-center gap-2 cursor-pointer min-w-0">
                        <input type="checkbox" checked={c.on} disabled={enriching} onChange={() => setCands(prev => prev.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))} className="w-4 h-4 accent-[#1f5fbf]" />
                        <span dir="ltr" className="font-extrabold text-sm font-sans text-slate-900 dark:text-slate-100">
                          {c.art ? c.art + ' ' : ''}{c.de}
                        </span>
                        {c.cefr && <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded text-[10px]">{c.cefr}</span>}
                      </label>
                      {c.have && <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">در کتابخانه هست</span>}
                      {c.complete && <span className="text-[10px] text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">کامل از فایل</span>}
                    </div>
                    {c.fa && <div className="text-xs text-[#5d6676] dark:text-[#a3adbd] text-right pr-6">{c.fa}</div>}
                    {!c.complete && (
                      <div className="flex-1 min-w-[160px]">
                        <select value={c.cat} disabled={enriching}
                          onChange={e => setCands(prev => prev.map((x, j) => (j === i ? { ...x, cat: e.target.value } : x)))}
                          className="w-full bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-lg px-2 py-1 text-xs outline-none">
                          <option value="">📁 دسته‌بندی خودکار با هوش مصنوعی</option>
                          {existingCategories.map(([cc]) => <option key={cc} value={cc}>{cc}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {enriching && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 space-y-2">
                <div className="flex justify-between text-xs font-bold text-emerald-800 dark:text-emerald-200">
                  <span>{progressMsg || 'در حال تکمیل…'}</span><span>{progressPercent}%</span>
                </div>
                <div className="w-full bg-emerald-200 dark:bg-emerald-900 rounded-full h-2 overflow-hidden">
                  <div className="bg-emerald-600 h-2 rounded-full transition-all" style={{ width: `${progressPercent}%` }} />
                </div>
              </div>
            )}

            <button
              onClick={() => void commit()}
              disabled={enriching || cands.filter(c => c.on).length === 0}
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-700 text-white py-3 rounded-xl text-sm font-bold shadow-md transition disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {enriching ? <><span className="inline-block animate-spin">⏳</span><span>در حال تکمیل و ثبت…</span></> : <span>✅ تکمیل و ثبت ({cands.filter(c => c.on).length} واژه)</span>}
            </button>
          </div>
        )}

        {errMsg && <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">{errMsg}</div>}
      </main>
    </div>
  );
};

export default GroupImportView;
