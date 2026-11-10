import React, { useEffect, useState } from 'react';
import { Word } from '../types';
import { getCategories, norm, uid } from '../utils/storage';
import { processBatchWordsWithGemini } from '../utils/ai';
import { describeAiError, generateWithImages, getActiveProvider } from '../utils/aiProvider';
import { PROVIDERS } from '../utils/aiProvider';
import { Conflict, ImportDecision, classifyImport } from '../utils/vocabMerge';
import { ImportConflictDialog } from './ImportConflictDialog';
import { copyText } from '../utils/clipboard';
import { recognizeImage, releaseOcr } from '../utils/ocr';
import { BATCH_SIZES, BatchSession, BatchSize, buildExternalPrompt, gotoBatch, loadSession, makeCandidates, markCompleted, newSession, buildSinglePromptDepth, type PromptDepth,
  nextOpenBatch, saveSession, sessionProgress, setBatchSize, splitCandidates, validateBatchResponse, validationToWords
} from '../utils/extractSession';

interface ExtractedCandidate {
  de: string;
  have: boolean;
  on: boolean;
  correctedSpell: string;
  cat: string;
}

interface ImageExtractModalProps {
  words: Word[];
  onClose: () => void;
  onAddEnrichedWords: (words: Word[]) => void;
  /** Duplicate-aware import (new words + update/keep decisions); used by the external-AI batch workflow. */
  onApplyImportPlan?: (fresh: Word[], decisions: ImportDecision[]) => void;
  onShowToast: (msg: string, isErr?: boolean) => void;
}

export const ImageExtractModal: React.FC<ImageExtractModalProps> = ({
  words,
  onClose,
  onAddEnrichedWords,
  onApplyImportPlan,
  onShowToast
}) => {
  const [candidates, setCandidates] = useState<ExtractedCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [sourceCollapsed, setSourceCollapsed] = useState<boolean>(false);

  const LEVEL_ORDER = ['', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  const isBelowLevel = (cefr: string, min: string) => {
    const a = LEVEL_ORDER.indexOf((cefr || '').toUpperCase());
    const b = LEVEL_ORDER.indexOf(min.toUpperCase());
    return a >= 0 && b > 0 && a <= b;
  };

  const existingCategories = getCategories(words);

  // Extraction method: AI (selected provider) | local OCR (no AI) | manual text (no AI)
  const [method, setMethod] = useState<'ai' | 'ocr' | 'manual'>('ai');
  const [manualText, setManualText] = useState('');
  const [dropTrivial, setDropTrivial] = useState(true);
  const [ocrMsg, setOcrMsg] = useState('');

  // External-AI batch session (resumable; contains no secrets)
  const [ext, setExt] = useState<BatchSession | null>(null);
  const [extCats, setExtCats] = useState<Record<string, string>>({});
  const [resumable, setResumable] = useState<BatchSession | null>(() => loadSession());
  const [pasted, setPasted] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [copyFallback, setCopyFallback] = useState('');
  const [conflictState, setConflictState] = useState<{ fresh: Word[]; conflicts: Conflict[]; cids: string[] } | null>(null);
  const [enrichDepth, setEnrichDepth] = useState<'light' | 'mid' | 'full'>('light');
  const [minLevelFilter, setMinLevelFilter] = useState('');

  useEffect(() => {
    if (ext) saveSession(ext);
  }, [ext]);
  useEffect(() => () => { void releaseOcr(); }, []);

  // Fast client-side image resizing and encoding to minimize payload and latency
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        // 1200px and 0.75 JPEG quality for minimal latency while keeping clear text legibility
        const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL('image/jpeg', 0.75).split(',')[1]);
        } else {
          reject(new Error('خطا در فشرده‌سازی تصویر'));
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('تصویر قابل خواندن نیست.'));
      };
      img.src = url;
    });
  };

  // Step 1: Maximum-speed initial extraction without translations, articles, or enrichment
  const handleExtract = async () => {
    if (files.length === 0) {
      onShowToast('ابتدا یک یا چند تصویر انتخاب کنید.', true);
      return;
    }

    setLoading(true);
    setStatusMsg('در حال استخراج سریع لغات آلمانی از تصویر...');
    setCandidates([]);

    const haveWords = new Set(words.map(w => w.de.toLowerCase()));

    try {
      const promptText = `Extract visible German words and expressions from this image.
Rules:
- List only the visible German words or multiword expressions, one per line.
- Do NOT include noun articles (der, die, das, ein, eine, etc.). Omit the article and output only the noun itself (e.g. write "Schule", not "die Schule").
- Do NOT translate to Persian or English.
- Do NOT include definitions, examples, grammar notes, numbers, or bullet points.
- If a word is unreadable, omit it.`;

      const imagesPayload: { data: string; mimeType: string }[] = [];
      for (const f of files) {
        const b64 = await fileToBase64(f);
        imagesPayload.push({
          data: b64,
          mimeType: 'image/jpeg'
        });
      }

      // One request to the ACTIVE provider only (no automatic fallback to another provider)
      const rawText = await generateWithImages(promptText, imagesPayload, { timeoutMs: 60000, retries: 0 });
      const lines = rawText.split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean);

      const seen = new Set<string>();
      const resCandidates: ExtractedCandidate[] = [];

      for (const rawLine of lines) {
        let cleaned = rawLine.replace(/^[\*\-•\d\.\)\s]+/, '').trim();
        // Remove leading articles
        cleaned = cleaned.replace(/^(?:der|die|das|dem|den|des|ein|eine|einen|einem|einer|eines)\s+/i, '').trim();
        cleaned = cleaned.replace(/[\*_`#]/g, '').trim();

        if (!cleaned || cleaned.length < 2 || cleaned.toLowerCase() === 'none') continue;

        const k = cleaned.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);

        const isHave = haveWords.has(k);
        resCandidates.push({
          de: cleaned,
          have: isHave,
          on: !isHave,
          correctedSpell: '',
          cat: ''
        });
      }

      setCandidates(resCandidates);
      if (resCandidates.length > 0) {
        setSourceCollapsed(true);
      }
      setStatusMsg(
        resCandidates.length
          ? `${resCandidates.length} واژه آلمانی شناسایی شد. اکنون واژه‌های مدنظر را انتخاب کنید تا با هوش مصنوعی تکمیل شوند.`
          : 'واژه‌ای در تصویر شناسایی نشد.'
      );
    } catch (err: any) {
      console.error('Image extraction error:', err);
      setStatusMsg(`خطا: ${err.message || 'عملیات ناموفق بود.'}`);
      onShowToast(err.message || 'خطا در استخراج لغات', true);
    } finally {
      setLoading(false);
    }
  };

  const toggleCandidate = (index: number) => {
    setCandidates(prev => {
      const next = [...prev];
      next[index].on = !next[index].on;
      return next;
    });
  };

  // select all / deselect all extracted candidates
  const allSelected = candidates.length > 0 && candidates.every(c => c.on);
  const toggleAllCandidates = () => {
    setCandidates(prev => prev.map(c => ({ ...c, on: !allSelected })));
  };

  const updateCandidateSpellInput = (index: number, val: string) => {
    setCandidates(prev => {
      const next = [...prev];
      next[index].correctedSpell = val;
      return next;
    });
  };

  const confirmSpelling = (index: number) => {
    setCandidates(prev => {
      const next = [...prev];
      const newSpelling = next[index].correctedSpell.trim();
      if (!newSpelling) return prev;
      next[index].de = newSpelling;
      next[index].correctedSpell = '';
      return next;
    });
    onShowToast('املای لغت با موفقیت اصلاح شد.');
  };

  const updateCandidateCategory = (index: number, cat: string) => {
    setCandidates(prev => {
      const next = [...prev];
      next[index].cat = cat;
      return next;
    });
  };

  // Steps 3, 4, 5, 6: Complete selected vocabulary through the full AI enrichment workflow
  const handleStartEnrichmentAndImport = async () => {
    if (enriching) return; // Prevent duplicate clicks

    const selected = candidates.filter(c => c.on);
    if (selected.length === 0) {
      onShowToast('لطفاً حداقل یک واژه را با تیک کنار آن انتخاب کنید.', true);
      return;
    }

    setEnriching(true);
    setProgressPercent(5);
    setProgressMsg(`در حال آغاز تکمیل مشخصات برای ${selected.length} واژه منتخب...`);

    // Map each candidate's selected category if set
    const userCatMap = new Map<string, string>();
    selected.forEach(c => {
      if (c.cat && c.cat.trim()) {
        userCatMap.set(c.de.trim().toLowerCase(), c.cat.trim());
      }
    });

    const lines = selected.map(c => c.de.trim());

    try {
      const { ws, errs } = await processBatchWordsWithGemini(
        lines,
        words,
        undefined,
        (doneCount, totalCount, currentMsg) => {
          const pct = Math.round((doneCount / Math.max(1, totalCount)) * 90) + 5;
          setProgressPercent(pct);
          setProgressMsg(currentMsg);
        },
        enrichDepth
      );

      // Step 5: Validate and apply any user-selected categories
      const validCompletedWords: Word[] = [];
      const completedDeSet = new Set<string>();

      ws.forEach(w => {
        const lowerDe = w.de.toLowerCase();
        if (userCatMap.has(lowerDe)) {
          w.cat = userCatMap.get(lowerDe)!;
        }
        const validated = norm(w);
        if (validated && validated.de && validated.fa) {
          validCompletedWords.push(validated);
          completedDeSet.add(lowerDe);
        }
      });

      if (validCompletedWords.length === 0) {
        throw new Error(errs[0] || 'تکمیل خودکار اطلاعات واژگان ناموفق بود.');
      }

      // Step 6: Commit completed words to the main vocabulary list
      onAddEnrichedWords(validCompletedWords);

      // Handle any items that failed so the user doesn't lose them
      const remainingCandidates = candidates.filter(
        c => !c.on || !completedDeSet.has(c.de.toLowerCase())
      );

      setCandidates(remainingCandidates);
      setProgressPercent(100);

      if (remainingCandidates.length === 0) {
        onClose();
        onShowToast(`تمامی ${validCompletedWords.length} واژه با مشخصات کامل (ترجمه، آرتیکل، مثال، صرف و...) ثبت شدند.`);
      } else {
        const failedCount = selected.length - validCompletedWords.length;
        if (failedCount > 0) {
          onShowToast(
            `${validCompletedWords.length} واژه با موفقیت تکمیل و ثبت شدند. ${failedCount} واژه با خطا مواجه شد و برای بررسی مجدد باقی ماند.`,
            true
          );
        } else {
          onClose();
          onShowToast(`${validCompletedWords.length} واژه با مشخصات کامل با موفقیت ثبت شد.`);
        }
      }
    } catch (err: any) {
      console.error('Enrichment error:', err);
      onShowToast(`خطا در تکمیل خودکار واژگان: ${err.message || 'ناموفق'}`, true);
      setProgressMsg(`خطا: ${err.message || 'عملیات با خطا مواجه شد.'}`);
    } finally {
      setEnriching(false);
    }
  };

  const rowsFromList = (list: string[]): ExtractedCandidate[] => {
    const have = new Set(words.map(w => w.de.toLowerCase()));
    return list.map(de => ({ de, have: have.has(de.toLowerCase()), on: !have.has(de.toLowerCase()), correctedSpell: '', cat: '' }));
  };

  // Option B: local OCR in the browser (no AI provider, no API key)
  const handleOcr = async () => {
    if (files.length === 0) {
      onShowToast('ابتدا یک یا چند تصویر انتخاب کنید.', true);
      return;
    }
    setLoading(true);
    setCandidates([]);
    setStatusMsg('');
    try {
      let all = '';
      let minConf = 100;
      for (let i = 0; i < files.length; i++) {
        const r = await recognizeImage(files[i], (pct, msg) => setOcrMsg(`${msg} ${pct}٪ — تصویر ${i + 1} از ${files.length}`));
        all += '\n' + r.text;
        if (r.quality !== 'empty') minConf = Math.min(minConf, r.confidence);
      }
      const list = splitCandidates(all, { dropTrivial });
      if (list.length === 0) {
        setManualText(all.trim());
        setStatusMsg('متنی از تصویر خوانده نشد. تصویر واضح‌تر بگیرید یا متن را در «ورود متن به‌صورت دستی» بنویسید.');
        return;
      }
      setCandidates(rowsFromList(list));
      setSourceCollapsed(true);
      setStatusMsg(
        minConf < 55
          ? `${list.length} واژه خوانده شد، ولی دقت OCR پایین است؛ املای واژه‌ها را حتماً بررسی و اصلاح کنید.`
          : `${list.length} واژه با OCR محلی خوانده شد. املا را بررسی کنید؛ OCR فقط متن را می‌خواند و معنی را نمی‌فهمد.`
      );
    } catch (err: any) {
      setStatusMsg(`خطا: ${err.message || 'OCR ناموفق بود.'}`);
      onShowToast(err.message || 'خطا در OCR', true);
    } finally {
      setOcrMsg('');
      setLoading(false);
    }
  };

  // Option C: manual text (deterministic, no AI)
  const handleManualText = () => {
    const list = splitCandidates(manualText, { dropTrivial });
    if (list.length === 0) {
      setStatusMsg('واژهٔ قابل‌استفاده‌ای در متن پیدا نشد.');
      return;
    }
    setCandidates(rowsFromList(list));
    setSourceCollapsed(true);
    setStatusMsg(`${list.length} واژه از متن ساخته شد. می‌توانید حذف یا اصلاحشان کنید.`);
  };

  // ---- external AI: batch workflow ----
  const startExternal = () => {
    const selected = candidates.filter(c => c.on);
    if (selected.length === 0) {
      onShowToast('لطفاً حداقل یک واژه را با تیک کنار آن انتخاب کنید.', true);
      return;
    }
    const sc = makeCandidates(selected.map(c => ({ de: c.de })));
    const cats: Record<string, string> = {};
    sc.forEach((c, i) => {
      if (selected[i].cat) cats[c.cid] = selected[i].cat;
    });
    setExtCats(cats);
    setExt(newSession(sc));
    setPasted('');
    setProblems([]);
    setCopyFallback('');
  };

  const prog = ext ? sessionProgress(ext) : null;
  const batchPrompt = ext && prog ? buildExternalPrompt(prog.currentWords, prog.current, prog.batches, words) : '';

  const copyBatch = async () => {
    const ok = await copyText(batchPrompt);
    if (ok) {
      setCopyFallback('');
      onShowToast('دستور این گروه کپی شد. آن را در ChatGPT، Claude یا هر هوش مصنوعی دیگر بچسبانید و پاسخ JSON را اینجا وارد کنید.');
    } else {
      setCopyFallback(batchPrompt);
      onShowToast('کپی خودکار ممکن نشد؛ متن دستور را از کادر زیر دستی کپی کنید.', true);
    }
  };

  const commitBatch = (fresh: Word[], decisions: ImportDecision[], cids: string[]) => {
    if (onApplyImportPlan) onApplyImportPlan(fresh, decisions);
    else onAddEnrichedWords(fresh);
    setExt(prev => {
      if (!prev) return prev;
      let n = markCompleted(prev, cids);
      const nxt = nextOpenBatch(n);
      if (nxt >= 0) n = gotoBatch(n, nxt);
      return n;
    });
    setPasted('');
    setProblems([]);
    setCopyFallback('');
    setConflictState(null);
  };

  const submitBatch = () => {
    if (!ext || !prog) return;
    const v = validateBatchResponse(pasted, prog.currentWords);
    if (!v.ok) {
      setProblems(v.problems);
      return;
    }
    const { ws, errs, cidOfWord } = validationToWords(v, prog.currentWords, words);
    if (ws.length < prog.currentWords.length) {
      setProblems(errs.length ? errs : ['بعضی از رکوردهای پاسخ معتبر نبودند.']);
      return;
    }
    ws.forEach(w => {
      const cid = cidOfWord.get(w);
      if (cid && extCats[cid]) w.cat = extCats[cid];
    });
    const cls = classifyImport(ws, words);
    if (cls.invalid.length > 0) {
      setProblems(cls.invalid.map(i => i.reason));
      return;
    }
    const cids = prog.currentWords.map(c => c.cid);
    if (cls.conflicts.length > 0) {
      setConflictState({ fresh: cls.fresh, conflicts: cls.conflicts, cids });
      return;
    }
    commitBatch(cls.fresh, [], cids);
  };

  const closeExternal = () => {
    saveSession(null);
    setExt(null);
    setResumable(null);
  };

  const selectedCount = candidates.filter(c => c.on).length;

  return (
    <>
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 overflow-y-auto"
      onClick={e => {
        if (!enriching && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-hidden shadow-2xl flex flex-col text-right">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#dde1ea] dark:border-[#333b4a] flex items-center justify-between gap-2 bg-slate-50 dark:bg-[#141923]">
          <div className="flex items-center gap-2">
            <span className="text-xl">📷</span>
            <h3 className="font-bold text-base md:text-lg text-slate-900 dark:text-slate-100">
              استخراج و تکمیل هوشمند لغات از تصویر
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={enriching}
            className="bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 px-3 py-1 rounded-xl text-xs md:text-sm font-semibold transition cursor-pointer disabled:opacity-40"
          >
            ×
          </button>
        </div>

        {/* Source Section Header with Collapse Toggle */}
        <div className="px-5 py-2.5 border-b border-[#dde1ea] dark:border-[#333b4a] bg-slate-100/70 dark:bg-[#141923] flex items-center justify-between text-xs">
          <span className="font-bold text-slate-800 dark:text-slate-200">
            {sourceCollapsed
              ? `🖼 منبع تصویر (${files.length} فایل انتخاب‌شده) — بخش منبع برای تمرکز روی لغات جمع شده است`
              : '🖼 انتخاب تصویر یا دست‌نوشته'}
          </span>
          {candidates.length > 0 && (
            <button
              onClick={() => setSourceCollapsed(prev => !prev)}
              disabled={enriching}
              className="text-[#1f5fbf] dark:text-[#7fb0ff] hover:underline font-bold px-2 py-0.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 transition cursor-pointer disabled:opacity-50"
            >
              {sourceCollapsed ? '🔽 نمایش و ویرایش تصویر' : '🔼 جمع کردن بخش تصویر'}
            </button>
          )}
        </div>

        {/* Upload Controls (collapsible) */}
        {!sourceCollapsed && (
          <div className="p-4 border-b border-[#dde1ea] dark:border-[#333b4a] space-y-3 bg-slate-50/50 dark:bg-slate-900/20 text-xs">
            <div className="grid grid-cols-3 gap-1.5" role="tablist" aria-label="روش استخراج">
              {([
                ['ai', '🤖 هوش مصنوعی'],
                ['ocr', '🔎 OCR بدون هوش مصنوعی'],
                ['manual', '⌨️ ورود متن دستی']
              ] as const).map(([k, label]) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={method === k}
                  onClick={() => setMethod(k)}
                  disabled={loading || enriching}
                  className={`px-2 py-2 rounded-xl text-[11px] md:text-xs font-bold border transition ${
                    method === k
                      ? 'bg-[#1f5fbf] text-white border-[#1f5fbf]'
                      : 'bg-white dark:bg-[#141923] text-slate-700 dark:text-slate-300 border-[#dde1ea] dark:border-[#333b4a]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {method === 'ai' && (
              <p className="text-[#5d6676] dark:text-[#a3adbd] leading-6">
                تصویر به <b>{PROVIDERS[getActiveProvider()].label}</b> (ارائه‌دهندهٔ فعال شما) فرستاده می‌شود. اگر سهمیه تمام شد یا کلید نداشتید، از «OCR بدون هوش مصنوعی» یا «ورود متن دستی» استفاده کنید؛ تصویر هرگز خودکار به ارائه‌دهندهٔ دیگری نمی‌رود.
              </p>
            )}
            {method === 'ocr' && (
              <p className="text-[#5d6676] dark:text-[#a3adbd] leading-6">
                متن تصویر داخل مرورگر شما خوانده می‌شود و به هیچ هوش مصنوعی فرستاده نمی‌شود. OCR فقط متن را تشخیص می‌دهد و مثل هوش مصنوعی معنی را نمی‌فهمد. بار اول موتور OCR و داده‌های زبان آلمانی از اینترنت دانلود می‌شود (به‌صورت کاملاً آفلاین تضمین نمی‌شود).
              </p>
            )}
            {method === 'manual' && (
              <p className="text-[#5d6676] dark:text-[#a3adbd] leading-6">
                متن را که از جای دیگری (دوربین گوشی، برنامهٔ OCR دیگر و...) گرفته‌اید اینجا بچسبانید. فهرست واژه‌ها بدون هیچ هوش مصنوعی و فقط با قواعد ساده ساخته می‌شود.
              </p>
            )}

            {method !== 'manual' ? (
              <div>
                <label className="block font-bold mb-1.5">انتخاب فایل(ها):</label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={loading || enriching}
                  onChange={e => setFiles(Array.from(e.target.files || []))}
                  className="w-full text-xs file:bg-slate-100 file:border-0 file:rounded-xl file:px-3 file:py-1.5 file:text-xs file:font-bold file:mr-2 cursor-pointer"
                />
              </div>
            ) : (
              <textarea
                dir="ltr"
                value={manualText}
                onChange={e => setManualText(e.target.value)}
                placeholder={'Schule\nsich freuen auf\nHausaufgabe'}
                rows={5}
                className="w-full bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 text-sm outline-none font-sans"
              />
            )}

            {method !== 'ai' && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={dropTrivial} onChange={e => setDropTrivial(e.target.checked)} className="w-4 h-4" />
                <span>حذف واژه‌های کاملاً پایه (der، die، und، ist ...)</span>
              </label>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                onClick={method === 'ai' ? handleExtract : method === 'ocr' ? handleOcr : handleManualText}
                disabled={loading || enriching || (method !== 'manual' && files.length === 0) || (method === 'manual' && !manualText.trim())}
                className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] hover:from-[#194ea0] hover:to-[#573db7] text-white px-4 py-2 rounded-xl font-bold disabled:opacity-40 transition flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>{method === 'ocr' ? 'در حال OCR...' : 'در حال استخراج سریع...'}</span>
                  </>
                ) : (
                  <span>{method === 'ai' ? '⚡ شروع استخراج سریع لغات' : method === 'ocr' ? '🔎 خواندن متن با OCR' : '📝 ساخت فهرست از متن'}</span>
                )}
              </button>
              <span className="text-[#5d6676] dark:text-[#a3adbd] truncate max-w-xs">{ocrMsg || statusMsg}</span>
            </div>
          </div>
        )}

        {/* Progress bar during AI Completion */}
        {enriching && (
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-800 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-900 dark:text-emerald-200">
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></span>
                <span>تکمیل هوشمند مشخصات واژگان با هوش مصنوعی...</span>
              </span>
              <span>{progressPercent}%</span>
            </div>
            <div className="w-full bg-emerald-200 dark:bg-emerald-900 rounded-full h-2 overflow-hidden">
              <div
                className="bg-emerald-600 dark:bg-emerald-400 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
            <p className="text-[11px] text-emerald-800 dark:text-emerald-300 truncate">{progressMsg}</p>
          </div>
        )}

        {ext && prog ? (
          <div className="p-4 overflow-y-auto flex-1 max-h-[60vh] space-y-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <button onClick={() => setExt(null)} className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 font-bold">↩ بازگشت به فهرست واژه‌ها</button>
              <label className="flex items-center gap-1.5 font-bold">
                تعداد واژه‌ها در هر گروه:
                <select
                  value={ext.batchSize}
                  onChange={e => { setExt(setBatchSize(ext, Number(e.target.value) as BatchSize)); setPasted(''); setProblems([]); setCopyFallback(''); }}
                  className="bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-lg px-2 py-1"
                >
                  {BATCH_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>

            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] space-y-1.5">
              <div className="font-bold text-sm">
                گروه فعلی: {prog.current} از {prog.batches}
                {prog.currentDone && <span className="text-emerald-600"> ✔ ثبت شده</span>}
              </div>
              <div className="text-[#5d6676] dark:text-[#a3adbd]">
                کل واژه‌های انتخاب‌شده: {prog.total} • تکمیل‌شده: {prog.doneWords} • مانده: {prog.remaining}
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                <div className="bg-emerald-600 h-2" style={{ width: `${prog.total ? Math.round((prog.doneWords / prog.total) * 100) : 0}%` }} />
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1" dir="ltr">
                {prog.currentWords.map(c => (
                  <span key={c.cid} className={`px-2 py-0.5 rounded-full border font-sans ${ext.completed.includes(c.cid) ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-white dark:bg-[#1b2029] border-[#dde1ea] dark:border-[#333b4a]'}`}>
                    {c.de}
                  </span>
                ))}
              </div>
            </div>

            {prog.remaining === 0 ? (
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 text-emerald-900 dark:text-emerald-200 font-bold space-y-2">
                <div>🎉 همهٔ گروه‌ها ثبت شد.</div>
                <button onClick={() => { closeExternal(); onClose(); }} className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold">بستن</button>
              </div>
            ) : (
              <>
                <ol className="list-decimal pr-5 space-y-0.5 text-[#5d6676] dark:text-[#a3adbd] leading-6">
                  <li>«کپی دستور این گروه» را بزنید و آن را در یک هوش مصنوعی خارجی (ChatGPT، Claude و...) بچسبانید.</li>
                  <li>پاسخ JSON را کپی کنید و در کادر زیر بچسبانید.</li>
                  <li>«ثبت پاسخ و ادامه» را بزنید؛ بعد از ثبت، گروه بعدی نشان داده می‌شود.</li>
                </ol>

                <div className="flex flex-wrap gap-2">
                  <button onClick={copyBatch} className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-4 py-2 rounded-xl font-bold">📋 کپی دستور این گروه</button>
                  <button onClick={() => { setExt(gotoBatch(ext, ext.current - 1)); setPasted(''); setProblems([]); setCopyFallback(''); }} disabled={prog.current <= 1} className="px-3 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 font-bold disabled:opacity-40">گروه قبلی</button>
                  <button onClick={() => { setExt(gotoBatch(ext, ext.current + 1)); setPasted(''); setProblems([]); setCopyFallback(''); }} disabled={prog.current >= prog.batches} className="px-3 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 font-bold disabled:opacity-40">گروه بعدی</button>
                </div>

                {copyFallback && (
                  <div className="space-y-1">
                    <p className="font-bold text-amber-700 dark:text-amber-400">کپی خودکار ممکن نشد؛ متن زیر را انتخاب و دستی کپی کنید:</p>
                    <textarea readOnly dir="ltr" value={copyFallback} rows={5} onFocus={e => e.currentTarget.select()} className="w-full bg-white dark:bg-[#141923] border border-amber-300 rounded-xl px-3 py-2 font-mono text-[11px]" />
                  </div>
                )}

                <textarea
                  dir="ltr"
                  value={pasted}
                  onChange={e => setPasted(e.target.value)}
                  placeholder="پاسخ JSON هوش مصنوعی را اینجا بچسبانید..."
                  rows={6}
                  className="w-full bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 text-xs outline-none font-mono"
                />

                {problems.length > 0 && (
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 text-red-800 dark:text-red-300 space-y-1" role="alert">
                    <div className="font-bold">پاسخ پذیرفته نشد؛ این گروه هنوز ثبت نشده است:</div>
                    <ul className="list-disc pr-5">{problems.map((m, i) => <li key={i}>{m}</li>)}</ul>
                    <button onClick={copyBatch} className="mt-1 px-3 py-1.5 rounded-lg bg-red-600 text-white font-bold">🔁 تلاش مجدد (کپی دوبارهٔ دستور همین گروه)</button>
                  </div>
                )}

                <button onClick={submitBatch} disabled={!pasted.trim()} className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white px-4 py-2 rounded-xl font-bold disabled:opacity-40">
                  ✅ ثبت پاسخ و ادامه
                </button>
              </>
            )}
          </div>
        ) : (
        <>
        {/* Candidates List */}
        <div className="p-4 overflow-y-auto flex-1 max-h-[48vh] space-y-2.5">
          {candidates.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs space-y-1">
              {loading ? (
                <div className="flex flex-col items-center gap-2">
                  <span className="w-6 h-6 border-2 border-[#1f5fbf] border-t-transparent rounded-full animate-spin"></span>
                  <span className="font-semibold text-slate-600 dark:text-slate-300">در حال خواندن تصویر و فهرست‌کردن لغات آلمانی...</span>
                </div>
              ) : (
                <>
                  <p>تصویری انتخاب نکرده‌اید یا لغتی هنوز استخراج نشده است.</p>
                  {resumable && resumable.completed.length < resumable.candidates.length && (
                    <div className="mt-3 p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 text-amber-900 dark:text-amber-200 space-y-2">
                      <div className="font-bold">یک جلسهٔ نیمه‌تمام دارید: {resumable.completed.length} از {resumable.candidates.length} واژه ثبت شده است.</div>
                      <div className="flex justify-center gap-2">
                        <button onClick={() => { setExt(resumable); setResumable(null); }} className="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-bold">ادامهٔ جلسه</button>
                        <button onClick={closeExternal} className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 font-bold">حذف جلسه</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <select
                value={enrichDepth}
                onChange={e => setEnrichDepth(e.target.value as 'light' | 'mid' | 'full')}
                disabled={enriching}
                className="bg-white dark:bg-slate-800 border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-2.5 py-1.5 text-xs font-bold outline-none"
              >
                <option value="light">⚡ سبک (سریع — fa+en+lvl)</option>
                <option value="mid">⚙️ نیمه (+pl+pos)</option>
                <option value="full">💎 کامل (۲۸ فیلد)</option>
              </select>
              <select
                value={minLevelFilter}
                onChange={e => setMinLevelFilter(e.target.value)}
                disabled={enriching}
                className="bg-white dark:bg-slate-800 border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-2.5 py-1.5 text-xs font-bold outline-none"
              >
                <option value="">فیلتر سطح: هیچ</option>
                <option value="A1">حذف A1 و پایین‌تر</option>
                <option value="A2">حذف A2 و پایین‌تر</option>
                <option value="B1">حذف B1 و پایین‌تر</option>
              </select>
              <button
                type="button"
                onClick={toggleAllCandidates}
                disabled={candidates.length === 0 || enriching}
                className="bg-blue-50 text-[#1f5fbf] hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-900 px-3 py-1.5 rounded-xl text-xs font-bold transition disabled:opacity-40"
              >
                {allSelected ? '☐ عدم انتخاب همه' : '☑ انتخاب همه'}
              </button>
            </div>
            {candidates.map((cand, idx) => {
              const canConfirmSpell = !!cand.correctedSpell.trim() && cand.correctedSpell.trim() !== cand.de;
              return (
                <div
                  key={idx}
                  className={`p-2.5 rounded-2xl border transition space-y-1.5 ${
                    cand.on
                      ? 'bg-blue-50/60 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900'
                      : 'bg-white dark:bg-[#1b2029] border-[#dde1ea] dark:border-[#333b4a] opacity-75'
                  }`}
                >
                  <div className={`flex items-center justify-between gap-2 text-xs ${minLevelFilter && cand.cefr && isBelowLevel(cand.cefr, minLevelFilter) ? 'opacity-40' : ''}`}>
                    <label className="flex items-center gap-2 cursor-pointer min-w-0">
                      <input
                        type="checkbox"
                        checked={cand.on}
                        disabled={enriching}
                        onChange={() => toggleCandidate(idx)}
                        className="w-4 h-4 rounded text-[#1f5fbf] flex-shrink-0 cursor-pointer"
                      />
                      <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100" dir="ltr">
                        {cand.de}
                      </span>
                    </label>

                    {cand.have && (
                      <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full flex-shrink-0">
                        در کتابخانه هست
                      </span>
                    )}
                  </div>

                  {/* Inline spelling correction and category selector */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/60">
                    <div className="flex items-center gap-1 flex-1 min-w-[180px]">
                      <input
                        type="text"
                        dir="ltr"
                        disabled={enriching}
                        placeholder="اصلاح املا در صورت نیاز"
                        value={cand.correctedSpell}
                        onChange={e => updateCandidateSpellInput(idx, e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && canConfirmSpell) confirmSpelling(idx);
                        }}
                        className="bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-lg px-2 py-1 text-xs flex-1 outline-none font-sans"
                      />
                      <button
                        type="button"
                        onClick={() => confirmSpelling(idx)}
                        disabled={enriching || !canConfirmSpell}
                        title="تأیید املای جدید"
                        className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs transition ${
                          canConfirmSpell
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs cursor-pointer'
                            : 'bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-600 cursor-not-allowed'
                        }`}
                      >
                        ✓
                      </button>
                    </div>

                    <div className="flex-1 min-w-[160px]">
                      <select
                        value={cand.cat}
                        disabled={enriching}
                        onChange={e => updateCandidateCategory(idx, e.target.value)}
                        className="w-full bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-lg px-2 py-1 text-xs outline-none"
                      >
                        <option value="">📁 دسته‌بندی خودکار با هوش مصنوعی</option>
                        {existingCategories.map(([c]) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              );
              })}
            </>)}
        </div>

        {/* Footer actions with explicit AI Completion Workflow (Task 1) */}
        {candidates.length > 0 && (
          <div className="p-3.5 border-t border-[#dde1ea] dark:border-[#333b4a] bg-slate-50 dark:bg-[#141923] flex flex-wrap items-center justify-between gap-2.5 text-xs">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCandidates(prev => prev.map(c => ({ ...c, on: true })))}
                disabled={enriching}
                className="bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 px-2.5 py-1.5 rounded-lg cursor-pointer font-medium disabled:opacity-40"
              >
                انتخاب همه
              </button>
              <button
                onClick={() => setCandidates(prev => prev.map(c => ({ ...c, on: !c.have })))}
                disabled={enriching}
                className="bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 px-2.5 py-1.5 rounded-lg cursor-pointer font-medium disabled:opacity-40"
              >
                فقط جدیدها
              </button>
            </div>

            <button
              onClick={startExternal}
              disabled={enriching || selectedCount === 0}
              className="bg-white dark:bg-[#1b2029] border border-[#1f5fbf] text-[#1f5fbf] dark:text-[#7fb0ff] px-3 py-2 rounded-xl font-bold disabled:opacity-40 transition"
              title="بدون استفاده از هیچ سهمیه یا کلید API"
            >
              📋 کپی دستور برای هوش مصنوعی خارجی ({selectedCount})
            </button>

            <button
              onClick={handleStartEnrichmentAndImport}
              disabled={enriching || selectedCount === 0}
              className="bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white px-4 py-2 rounded-xl font-bold disabled:opacity-40 transition shadow-xs flex items-center gap-2 cursor-pointer"
            >
              {enriching ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>در حال تکمیل مشخصات کامل با AI...</span>
                </>
              ) : (
                <span>✨ تکمیل و ثبت واژه‌های انتخاب‌شده با هوش مصنوعی ({selectedCount})</span>
              )}
            </button>
          </div>
        )}
        </>
        )}
      </div>
    </div>
    {conflictState && (
      <ImportConflictDialog
        conflicts={conflictState.conflicts}
        mode={conflictState.conflicts.length === 1 ? 'single' : 'multi'}
        onResolve={decisions => commitBatch(conflictState.fresh, decisions, conflictState.cids)}
        onCancel={() => setConflictState(null)}
      />
    )}
    </>
  );
};
