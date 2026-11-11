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
import { X, Camera, FileText, Keyboard, ChevronLeft, Sparkles, Clock } from 'lucide-react';

interface GroupImportViewProps {
  words: Word[];
  onAddEnrichedWords: (ws: Word[]) => void;
  onClose: () => void;
  onShowToast: (msg: string, isErr?: boolean) => void;
}

interface GCand {
  de: string; art: string; cefr: string; fa: string;
  complete: boolean; full?: Word; have: boolean; on: boolean; cat: string;
  fix?: string;
}

const LEVEL_ORDER = ['', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const isBelowLevel = (cefr: string, min: string) => {
  const a = LEVEL_ORDER.indexOf((cefr || '').toUpperCase());
  const b = LEVEL_ORDER.indexOf(min.toUpperCase());
  return !!cefr && a > 0 && b > 0 && a <= b;
};

export const GroupImportView: React.FC<GroupImportViewProps> = ({ words, onAddEnrichedWords, onClose, onShowToast }) => {
  const [source, setSource] = useState<'file' | 'text' | null>(null);
  const [method, setMethod] = useState<'ai' | 'noai'>('ai');
  const [files, setFiles] = useState<File[]>([]);
  const [manualText, setManualText] = useState('');
  const [loading, setLoading] = useState(false);
  const [inputOpen, setInputOpen] = useState(true);
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
  const hasCands = cands.length > 0;
  useEffect(() => { if (hasCands) setInputOpen(false); }, [hasCands]);

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
        de, art: (it.art || '').toLowerCase(), cefr: (it.cefr || it.full?.lvl || '').toUpperCase(),
        fa: it.fa || '', complete: !!it.full, full: it.full, have, on: !have && !(minLevelFilter && isBelowLevel(((it.cefr || it.full?.lvl || '') + '').toUpperCase(), minLevelFilter)), cat: ''
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

  /** Returns text (digital PDF) or page images (scanned PDF). */
  const handlePdf = async (file: File): Promise<{ text: string; images: File[] }> => {
    setOcrMsg('در حال خواندن PDF…');
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
    const buf = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: buf }).promise;
    const maxPages = Math.min(pdf.numPages, 20);
    let text = '';
    for (let p = 1; p <= maxPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      text += '\n' + content.items.map((it: any) => it.str).join(' ');
    }
    if (text.replace(/\s/g, '').length > 20) return { text: text.trim(), images: [] };
    // scanned PDF: render pages as images (max 8) so AI / OCR can read them
    const images: File[] = [];
    for (let p = 1; p <= Math.min(pdf.numPages, 8); p++) {
      setOcrMsg(`PDF اسکن‌شده — تبدیل صفحه ${p} به تصویر…`);
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 1.6 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
      const blob: Blob = await new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('تبدیل صفحه PDF ممکن نشد.'))), 'image/jpeg', 0.8));
      images.push(new File([blob], `${file.name}-p${p}.jpg`, { type: 'image/jpeg' }));
    }
    return { text: '', images };
  };

  const onFilesChosen = async (fileList: FileList | null) => {
    if (!fileList || !fileList.length) return;
    setLoading(true); setStatusMsg('');
    const arr = Array.from(fileList);
    const images: File[] = [];
    let handledStructured = false;
    try {
      for (const f of arr) {
        const n = f.name.toLowerCase();
        if (f.type.startsWith('image/')) { images.push(f); continue; }
        if (n.endsWith('.pdf') || f.type === 'application/pdf') {
          const r = await handlePdf(f);
          if (r.text) {
            setManualText(prev => (prev ? prev + '\n' + r.text : r.text));
            setSource('text');
            onShowToast('متن PDF خوانده شد.', false);
          }
          images.push(...r.images);
          continue;
        }
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
      if (images.length) { setFiles(prev => [...prev, ...images]); setSource('file'); }
      if (handledStructured) setStatusMsg('فایل ساختاریافته خوانده شد — جدول پایین آماده است.');
      else if (images.length) setStatusMsg(`${images.length} تصویر اضافه شد — «استخراج» را بزن.`);
      else setStatusMsg('ورودی آماده است — «استخراج» را بزن.');
    } catch (e: any) {
      onShowToast(e?.message || 'خطا در خواندن فایل', true);
      setStatusMsg(e?.message || '');
    } finally { setOcrMsg(''); setLoading(false); }
  };

  // ---------- Extraction ----------
  const runExtract = async () => {
    setLoading(true); setCands([]); setStatusMsg('');
    const isImages = source === 'file' && files.length > 0;

    // AI from images → ONLY type the words into the manual textbox (same path as manual typing)
    if (isImages && method === 'ai') {
      try {
        const imagesPayload: { data: string; mimeType: string }[] = [];
        for (const f of files) imagesPayload.push({ data: await fileToBase64(f), mimeType: 'image/jpeg' });
        const promptText = `Extract visible German words and expressions from this image.
Rules:
- List only the visible German words or multiword expressions, one per line.
- Do NOT include noun articles (der, die, das, ein, eine, etc.). Omit the article and output only the noun itself (e.g. write "Schule", not "die Schule").
- After each word write " | " and its CEFR level (A1, A2, B1, B2, C1 or C2), e.g. "gehen | A1".
- Do NOT translate to Persian or English.
- Do NOT include definitions, examples, grammar notes, numbers, or bullet points.
- If a word is unreadable, omit it.`;
        // One request to the ACTIVE provider only — the proven legacy path that worked for months
        const rawText = await generateWithImages(promptText, imagesPayload, { timeoutMs: 90000, retries: 0 });
        const lines = rawText.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);

        const seen = new Set<string>();
        const list: { de: string; art?: string; cefr?: string; fa?: string }[] = [];
        for (const rawFull of lines) {
          const bar = rawFull.split('|'); const rawLine = bar[0]; const lvlM = (bar[1] || '').match(/[ABC][12]/i);
          let cleaned = rawLine.replace(/^[\*\-•\d\.\)\s]+/, '').trim();
          cleaned = cleaned.replace(/^(?:der|die|das|dem|den|des|ein|eine|einen|einem|einer|eines)\s+/i, '').trim();
          cleaned = cleaned.replace(/[\*_`#]/g, '').trim();
          if (!cleaned || cleaned.length < 2 || cleaned.toLowerCase() === 'none') continue;
          const k = cleaned.toLowerCase();
          if (seen.has(k)) continue;
          seen.add(k);
          list.push({ de: cleaned, cefr: lvlM ? lvlM[0].toUpperCase() : '' });
        }

        // Type the words into the manual textbox (user flow) AND build chips from the same list
        const typed = list.map(x => x.de);
        if (typed.length === 0) { setStatusMsg('هیچ واژه‌ای از تصویر خوانده نشد. عکس را واضح‌تر بگیر یا ردیف را دستی اضافه کن.'); return; }
        pushCands(list);
        setStatusMsg(`✅ ${typed.length} واژه در جدول پایین فهرست شد — ویرایش کن و ثبت بزن.`);
        onShowToast(`${typed.length} واژه استخراج شد.`, false);
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

  const updateCand = (i: number, patch: Partial<GCand>) =>
    setCands(prev => prev.map((x, j) => {
      if (j !== i) return x;
      const n = { ...x, ...patch };
      if (n.full && (patch.de !== undefined || patch.fix !== undefined)) {
        n.full = { ...n.full, de: (n.fix || '').trim() || n.de } as Word;
      }
      return n;
    }));
  const applyLevelFilter = (v: string) => {
    setMinLevelFilter(v);
    setCands(prev => prev.map(c => ({ ...c, on: (c.complete || !c.have) && !(v && isBelowLevel(c.cefr, v)) })));
  };
  const addEmptyRow = () => setCands(prev => [...prev, { de: '', art: '', cefr: '', fa: '', complete: false, have: false, on: true, cat: '' }]);
  const deleteCand = (i: number) => setCands(prev => prev.filter((_, j) => j !== i));
  const [quickAdd, setQuickAdd] = useState('');
  const addFromQuick = () => {
    const list = splitCandidates(quickAdd, { dropTrivial: false });
    if (!list.length) return;
    setCands(prev => {
      const seen = new Set(prev.map(c => c.de.toLowerCase()));
      const add = list.filter(l => !seen.has(l.toLowerCase())).map(l => ({ de: l, art: '', cefr: '', fa: '', complete: false, have: false, on: true, cat: '' } as GCand));
      return [...prev, ...add];
    });
    setQuickAdd('');
  };

  const candsCount = () => cands.filter(c => c.on).length;

  // ---------- Enrich & commit ----------
  const commit = async () => {
    const eff = (c: GCand) => ((c.fix || '').trim() || c.de).trim();
    const selected = cands.filter(c => c.on && eff(c).length >= 2);
    if (!selected.length) { onShowToast('حداقل یک واژه را انتخاب کن.', true); return; }
    setEnriching(true); setProgressPercent(5);
    setProgressMsg(`تکمیل ${selected.length} واژه (${depth === 'full' ? 'کامل' : depth === 'mid' ? 'نیمه' : 'سبک'})…`);
    try {
      const userCatMap = new Map<string, string>();
      selected.forEach(c => {
        const key = eff(c).toLowerCase();
        if (c.cat && c.cat.trim()) userCatMap.set(key, c.cat.trim());
        else if (bulkCat && bulkCat.trim()) userCatMap.set(key, bulkCat.trim());
      });

      const done: Word[] = [];
      let skippedByLevel = 0;
      // 1) complete ones (from structured files) go straight in
      selected.filter(c => c.complete && c.full).forEach(c => {
        done.push(c.full!);
      });

      // 2) enrich the rest by depth
      const rest = selected.filter(c => !c.complete);
      if (rest.length) {
        const lines = rest.map(c => eff(c));
        const { ws } = await processBatchWordsWithGemini(
          lines, words, undefined,
          (d, t, m) => { setProgressPercent(Math.round((d / Math.max(1, t)) * 85) + 5); setProgressMsg(m); },
          depth
        );
        const userOverride = new Map<string, GCand>();
        rest.forEach(c => userOverride.set(eff(c).toLowerCase(), c));
        ws.forEach(w => {
          const key = w.de.toLowerCase();
          const uo = userOverride.get(key);
          if (uo?.fa?.trim()) w.fa = uo.fa.trim();
          if (uo?.art) w.art = uo.art;
          if (userCatMap.has(key)) w.cat = userCatMap.get(key)!;
          const v = norm(w);
          if (v && v.de && v.fa) {
            done.push(v);
          }
        });
      }

      if (done.length === 0) throw new Error(skippedByLevel ? 'همهٔ واژه‌ها به‌خاطر فیلتر سطح حذف شدند.' : 'هیچ واژه‌ای تکمیل/ثبت نشد.');
      onAddEnrichedWords(done);
      setProgressPercent(100);
      onShowToast(`${done.length} واژه ثبت شد.${skippedByLevel ? ` (${skippedByLevel} واژه با فیلتر سطح حذف شد)` : ''}`, false);
      setCands([]);
      onClose();
    } catch (e: any) {
      onShowToast(e?.friendly || e?.message || 'خطا در ثبت گروهی', true);
      setProgressMsg(`خطا: ${e?.message || ''}`);
    } finally { setEnriching(false); }
  };

  const errMsg = '';

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-[#f6f7fb] dark:bg-[#12151c] text-[#1d2330] dark:text-[#eef1f6] flex flex-col font-sans">
      <header className="sticky top-0 z-20 bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-3 md:px-5 h-14 md:h-16 flex items-center gap-2 shadow-lg">
        <h1 className="flex-1 text-right font-bold text-base md:text-lg">📦 افزودن واژگان گروهی</h1>
        <span className="hidden sm:inline text-[11px] text-white/70">گام ۱: ورودی ← گام ۲: روش ← گام ۳: تنظیم و ثبت</span>
        <IconBtn onClick={onClose} title="بازگشت به واژگان"><X size={18} className="text-red-500" /></IconBtn>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto p-3.5 md:p-6 space-y-4 pb-16">
        {/* Step 1 — source */}
        <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 space-y-3">
          <button onClick={() => setInputOpen(o => !o)} className="w-full flex items-center justify-between text-sm md:text-base font-bold"><span>۱. ورودی را انتخاب کن</span><span className="text-xs text-[#5d6676]">{inputOpen ? '▲ بستن' : '▼ باز کردن'}</span></button>
          {inputOpen && (<div className="space-y-3">
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
              <div className="grid grid-cols-2 gap-2">
                <label className="h-12 rounded-2xl border-2 border-dashed border-[#1f5fbf] text-[#1f5fbf] dark:text-blue-300 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer">
                  <Camera size={16} /> 📷 دوربین
                  <input type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={e => { void onFilesChosen(e.target.files); e.target.value = ''; }} />
                </label>
                <label className="h-12 rounded-2xl border-2 border-dashed border-[#1f5fbf] text-[#1f5fbf] dark:text-blue-300 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer">
                  <FileText size={16} /> 🖼 عکس / PDF / اکسل
                  <input type="file" multiple accept="image/*,application/pdf,.pdf,.xlsx,.xls,.csv,.json,.txt" className="hidden"
                    onChange={e => { void onFilesChosen(e.target.files); e.target.value = ''; }} />
                </label>
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold">
                <input type="checkbox" checked={method === 'noai'} onChange={e => setMethod(e.target.checked ? 'noai' : 'ai')} className="w-4 h-4 accent-[#1f5fbf]" />
                <span>بدون هوش مصنوعی (فقط OCR محلی برای تصویر — بقیهٔ فرمت‌ها نیازی به AI ندارند)</span>
              </label>
              {files.length > 0 && (
                <div className="flex items-center justify-between text-[11px] text-[#5d6676]">
                  <span>{files.length} تصویر آماده استخراج</span>
                  <button onClick={() => setFiles([])} className="text-red-600 font-bold">پاک کردن تصاویر</button>
                </div>
              )}
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
              {loading ? <Clock size={16} className="animate-pulse" /> : <Sparkles size={16} />}
              <span>{loading ? 'در حال استخراج…' : method === 'noai' ? 'استخراج بدون هوش مصنوعی' : '⚡ استخراج با هوش مصنوعی'}</span>
            </button>
            <span className="text-xs text-[#5d6676] dark:text-[#a3adbd] truncate">{ocrMsg || statusMsg}</span>
          </div>
          </div>)}
        </div>

        {/* Step 3 — preview + settings */}
        {cands.length > 0 && (
          <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 space-y-3">
            <b className="text-sm md:text-base flex items-center gap-2"><span>۳.</span> تنظیم و ثبت ({cands.filter(c => c.on).length} انتخاب‌شده از {cands.length})</b>

            <div className="grid grid-cols-2 gap-2">
              <select value={depth} onChange={e => setDepth(e.target.value as any)} disabled={enriching}
                className="col-span-2 w-full bg-white dark:bg-slate-800 border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-2.5 py-2 text-xs font-bold outline-none">
                <option value="light">⚡ سبک (سریع — fa+en+lvl)</option>
                <option value="mid">⚙️ نیمه (+pl+pos)</option>
                <option value="full">💎 کامل (۲۸ فیلد)</option>
              </select>
              <select value={bulkCat} onChange={e => setBulkCat(e.target.value)} disabled={enriching}
                className="col-span-2 w-full bg-white dark:bg-slate-800 border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-2.5 py-1.5 text-xs font-bold outline-none">
                <option value="">📁 دستهٔ بی‌دسته‌ها: خودکار AI</option>
                {existingCategories.map(([c]) => <option key={c} value={c}>📁 {c}</option>)}
              </select>
              <select value={minLevelFilter} onChange={e => applyLevelFilter(e.target.value)} disabled={enriching}
                className="col-span-2 w-full bg-white dark:bg-slate-800 border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-2.5 py-2 text-xs font-bold outline-none">
                <option value="">فیلتر سطح: هیچ</option>
                <option value="A1">حذف A1 و پایین‌تر</option>
                <option value="A2">حذف A2 و پایین‌تر</option>
                <option value="B1">حذف B1 و پایین‌تر</option>
                <option value="B2">حذف B2 و پایین‌تر</option>
              </select>
              <button
                onClick={() => { const all = cands.every(c => c.on); setCands(prev => prev.map(c => ({ ...c, on: !all }))); }}
                disabled={enriching}
                className="w-full bg-blue-50 text-[#1f5fbf] hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-900 px-3 py-1.5 rounded-xl text-xs font-bold transition disabled:opacity-40">
                {cands.every(c => c.on) ? '☐ عدم انتخاب همه' : '☑ انتخاب همه'}
              </button>
              <button
                onClick={() => setCands(prev => prev.map(c => ({ ...c, on: c.complete ? true : !c.have })))}
                disabled={enriching}
                className="w-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 px-3 py-1.5 rounded-xl text-xs font-bold transition disabled:opacity-40"
                title="جدیدها + واژه‌های کامل فایل را انتخاب می‌کند؛ تکراری‌های کتابخانه نه">
                ✦ فقط جدیدها
              </button>
            </div>

            <div className="max-h-[55vh] overflow-y-auto overflow-x-hidden overscroll-contain border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl divide-y divide-[#e6e9f0] dark:divide-[#2a3140]" style={{ touchAction: 'pan-y' }}>
              {cands.map((c, i) => (
                <div key={i} className={`p-2 space-y-1.5 ${c.on ? '' : 'opacity-60'}`}>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={c.on} disabled={enriching} onChange={() => updateCand(i, { on: !c.on })} className="w-5 h-5 flex-shrink-0 accent-[#1f5fbf]" />
                    <input dir="ltr" value={c.de} disabled={enriching} onChange={e => updateCand(i, { de: e.target.value })} placeholder="Wort…"
                      className="flex-1 min-w-0 bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-lg px-2 py-1.5 text-sm font-bold outline-none focus:border-[#1f5fbf]" />
                    {c.cefr && <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-full font-bold flex-shrink-0">{c.cefr}</span>}
                  </div>
                  <div className="flex items-center gap-1.5 pr-7">
                    <input dir="ltr" value={c.fix || ''} disabled={enriching} onChange={e => updateCand(i, { fix: e.target.value })} placeholder="املای صحیح احتمالی…"
                      className={`flex-1 min-w-0 bg-white dark:bg-[#141923] border rounded-lg px-2 py-1 text-xs font-bold outline-none focus:border-[#1f5fbf] ${c.fix?.trim() ? 'border-amber-400' : 'border-[#dde1ea] dark:border-[#333b4a]'}`} />
                    {c.complete ? <span className="text-[10px] text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 rounded-full flex-shrink-0">کامل از فایل</span> : (
                      <select value={c.cat} disabled={enriching} onChange={e => updateCand(i, { cat: e.target.value })}
                        className="w-[34%] min-w-0 bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-lg px-1 py-1.5 text-[11px] outline-none">
                        <option value="">دسته: خودکار</option>
                        {existingCategories.map(([cc]) => <option key={cc} value={cc}>{cc}</option>)}
                      </select>
                    )}
                    <button onClick={() => deleteCand(i)} disabled={enriching} title="حذف ردیف"
                      className="w-10 h-9 flex-shrink-0 text-2xl leading-none text-red-500 font-bold rounded-lg active:bg-red-50">✕</button>
                  </div>
                  {c.have && <div className="pr-7"><span className="text-[10px] text-amber-700 bg-amber-50 dark:bg-amber-950/40 px-1.5 rounded-full">در کتابخانه هست</span></div>}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input dir="ltr" value={quickAdd} onChange={e => setQuickAdd(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addFromQuick(); }}
                placeholder="چند واژه را تایپ/بچسبان…" disabled={enriching}
                className="flex-1 min-w-[140px] bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-1.5 text-xs outline-none" />
              <button onClick={addFromQuick} disabled={enriching || !quickAdd.trim()}
                className="bg-blue-50 text-[#1f5fbf] dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-900 px-3 py-1.5 rounded-xl text-xs font-bold disabled:opacity-40">افزودن به جدول</button>
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
