import React, { useState } from 'react';
import { Word } from '../types';
import { getCategories, norm, uid } from '../utils/storage';
import { processBatchWordsWithGemini } from '../utils/ai';

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
  onShowToast: (msg: string, isErr?: boolean) => void;
}

export const ImageExtractModal: React.FC<ImageExtractModalProps> = ({
  words,
  onClose,
  onAddEnrichedWords,
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

  const existingCategories = getCategories(words);

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

      // Single fast model request using gemini-3.1-flash-lite
      const res = await fetch('/api/gemini/extract-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptText,
          images: imagesPayload,
          model: 'gemini-3.1-flash-lite'
        })
      });

      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `خطا در سرور: ${res.status}`);

      const rawText = j.text || '';
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
        }
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

  const selectedCount = candidates.filter(c => c.on).length;

  return (
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
            ✕ بستن
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
            <p className="text-[#5d6676] dark:text-[#a3adbd]">
              تصویر کتاب، جزوه یا دست‌نوشته آلمانی را انتخاب کنید. پس از استخراج سریع، لغات مدنظرتان را انتخاب کنید تا با هوش مصنوعی مشخصات کامل آن‌ها تکمیل و ثبت شود:
            </p>

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

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                onClick={handleExtract}
                disabled={loading || enriching || files.length === 0}
                className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] hover:from-[#194ea0] hover:to-[#573db7] text-white px-4 py-2 rounded-xl font-bold disabled:opacity-40 transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                {loading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>در حال استخراج سریع...</span>
                  </>
                ) : (
                  <span>⚡ شروع استخراج سریع لغات</span>
                )}
              </button>
              <span className="text-[#5d6676] dark:text-[#a3adbd] truncate max-w-xs">{statusMsg}</span>
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
                <p>تصویری انتخاب نکرده‌اید یا لغتی هنوز استخراج نشده است.</p>
              )}
            </div>
          ) : (
            candidates.map((cand, idx) => {
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
                  <div className="flex items-center justify-between gap-2 text-xs">
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
            })
          )}
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
      </div>
    </div>
  );
};
