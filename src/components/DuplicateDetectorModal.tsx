import React, { useState, useMemo } from 'react';
import { Word } from '../types';
import { lev, fullWord } from '../utils/storage';
import { generateWithGemini } from '../utils/ai';

export interface DuplicateGroup {
  id: string;
  type: 'exact' | 'likely' | 'similar';
  title: string;
  reason: string;
  words: Word[];
}

interface DuplicateDetectorModalProps {
  words: Word[];
  onClose: () => void;
  onDeleteWord: (word: Word) => void;
  onMergeWords: (canonicalId: string, mergedData: Partial<Word>, removedIds: string[]) => void;
  onShowToast: (msg: string, isErr?: boolean) => void;
}

export const DuplicateDetectorModal: React.FC<DuplicateDetectorModalProps> = ({
  words,
  onClose,
  onDeleteWord,
  onMergeWords,
  onShowToast
}) => {
  // Ignored / dismissed groups for this session
  const [dismissedGroupIds, setDismissedGroupIds] = useState<Set<string>>(new Set());

  // Filter type
  const [activeFilter, setActiveFilter] = useState<'all' | 'exact' | 'likely' | 'similar'>('all');

  // AI Merge in progress
  const [mergingGroupId, setMergingGroupId] = useState<string | null>(null);
  const [mergePreview, setMergePreview] = useState<{
    groupId: string;
    canonicalId: string;
    removedIds: string[];
    draft: Partial<Word>;
  } | null>(null);

  // Normalize string ignoring umlauts
  const stripUmlauts = (s: string) =>
    s
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]/g, '');

  const norm = (s: string) => (s || '').trim().toLowerCase();

  // Scan and detect duplicate/similar groups
  const duplicateGroups = useMemo(() => {
    const groups: DuplicateGroup[] = [];
    const usedWordIds = new Set<string>();

    // 1. Exact duplicates: exact headword and article match
    const exactMap = new Map<string, Word[]>();
    words.forEach(w => {
      const k = `${(w.art || '').toLowerCase()} ${norm(w.de)}`.trim();
      if (!exactMap.has(k)) exactMap.set(k, []);
      exactMap.get(k)!.push(w);
    });

    exactMap.forEach((ws, k) => {
      if (ws.length > 1) {
        ws.forEach(w => usedWordIds.add(w.id));
        groups.push({
          id: `exact_${k}`,
          type: 'exact',
          title: fullWord(ws[0]),
          reason: 'تکرار دقیق: واژهٔ آلمانی و آرتیکل کاملاً یکسان هستند.',
          words: ws
        });
      }
    });

    // 2. Likely duplicates: same headword regardless of article or capitalization/umlaut variations
    const likelyMap = new Map<string, Word[]>();
    words.forEach(w => {
      if (usedWordIds.has(w.id)) return;
      const k = stripUmlauts(w.de);
      if (k.length >= 3) {
        if (!likelyMap.has(k)) likelyMap.set(k, []);
        likelyMap.get(k)!.push(w);
      }
    });

    likelyMap.forEach((ws, k) => {
      if (ws.length > 1) {
        ws.forEach(w => usedWordIds.add(w.id));
        groups.push({
          id: `likely_${k}`,
          type: 'likely',
          title: ws.map(w => fullWord(w)).join(' / '),
          reason: 'تکرار محتمل: املای واژه آلمانی یا تفاوت فقط در آرتیکل یا حروف خاص است.',
          words: ws
        });
      }
    });

    // 3. Similar entries: same Persian translation OR Levenshtein distance <= 2 on German words
    for (let i = 0; i < words.length; i++) {
      const a = words[i];
      if (usedWordIds.has(a.id)) continue;

      const similarCluster: Word[] = [a];

      for (let j = i + 1; j < words.length; j++) {
        const b = words[j];
        if (usedWordIds.has(b.id)) continue;

        const deA = norm(a.de);
        const deB = norm(b.de);
        const faA = norm(a.fa);
        const faB = norm(b.fa);

        const isCloseGerman = deA.length >= 4 && deB.length >= 4 && lev(deA, deB) <= 2;
        const isSameFa = faA && faB && faA === faB;

        if (isCloseGerman || isSameFa) {
          similarCluster.push(b);
          usedWordIds.add(b.id);
        }
      }

      if (similarCluster.length > 1) {
        usedWordIds.add(a.id);
        groups.push({
          id: `sim_${a.id}`,
          type: 'similar',
          title: similarCluster.map(w => fullWord(w)).join(' • '),
          reason: 'مشابه نیازمند بررسی: دارای املای نزدیک یا ترجمه فارسی یکسان.',
          words: similarCluster
        });
      }
    }

    return groups;
  }, [words]);

  const visibleGroups = useMemo(() => {
    return duplicateGroups
      .filter(g => !dismissedGroupIds.has(g.id))
      .filter(g => activeFilter === 'all' || g.type === activeFilter);
  }, [duplicateGroups, dismissedGroupIds, activeFilter]);

  const handleDismissGroup = (groupId: string) => {
    setDismissedGroupIds(prev => new Set(prev).add(groupId));
    onShowToast('هر دو مورد حفظ شدند و از فهرست تکراری‌ها نادیده گرفته شدند.');
  };

  const handleDeleteEntry = (word: Word, group: DuplicateGroup) => {
    if (window.confirm(`آیا از حذف واژهٔ «${fullWord(word)}» اطمینان دارید؟`)) {
      onDeleteWord(word);
      onShowToast(`واژهٔ «${fullWord(word)}» حذف شد.`);
    }
  };

  const handlePickCanonical = (canonical: Word, group: DuplicateGroup) => {
    const duplicates = group.words.filter(w => w.id !== canonical.id);
    if (window.confirm(`واژهٔ «${fullWord(canonical)}» به‌عنوان نسخه اصلی نگه داشته شود و ${duplicates.length} مورد تکراری دیگر حذف شوند؟`)) {
      duplicates.forEach(d => onDeleteWord(d));
      onShowToast(`نسخهٔ اصلی حفظ شد و ${duplicates.length} مورد تکراری حذف گردید.`);
    }
  };

  // AI-Assisted Merge
  const handleStartAiMerge = async (group: DuplicateGroup) => {
    setMergingGroupId(group.id);
    onShowToast('در حال مقایسه و ادغام هوشمند لغات با هوش مصنوعی...');

    const promptText = `You are an expert German lexicographer. Merge the following duplicate/similar German vocabulary entries into ONE unified, complete dictionary entry.
Reconcile and pick the best, most comprehensive values:
- Keep the correct German headword ('de') and article ('art': 'der'|'die'|'das'|'').
- Combine distinct Persian meanings ('fa') with '؛ ' if valid.
- Combine or pick the best example sentences ('ex', 'exFa', 'ex2', 'ex2Fa').
- Preserve part of speech ('pos'), level ('lvl'), category ('cat'), conjugation ('conj'), preteritum ('prat'), perfekt ('perf'), separable prefix ('sep'), and notes ('notes').

Entries to merge:
${JSON.stringify(group.words.map(w => ({
  de: w.de,
  art: w.art,
  fa: w.fa,
  pos: w.pos,
  lvl: w.lvl,
  cat: w.cat,
  ex: w.ex,
  exFa: w.exFa,
  conj: w.conj,
  prat: w.prat,
  perf: w.perf,
  notes: w.notes
})), null, 2)}

Reply with ONLY a valid JSON object matching these keys:
{
  "de": "...",
  "art": "...",
  "fa": "...",
  "pos": "...",
  "lvl": "...",
  "cat": "...",
  "syn": "...",
  "synFa": "...",
  "ant": "...",
  "antFa": "...",
  "pl": "...",
  "ex": "...",
  "exFa": "...",
  "ex2": "...",
  "ex2Fa": "...",
  "conj": "...",
  "prat": "...",
  "perf": "...",
  "sep": "...",
  "notes": "..."
}`;

    try {
      const responseText = await generateWithGemini(promptText);
      const jsonMatch = /\{[\s\S]*\}/.exec(responseText);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText);

      // Best canonical ID: the one with more review progress
      const sortedByProgress = [...group.words].sort((a, b) => (b.ok + b.bad) - (a.ok + a.bad));
      const canonical = sortedByProgress[0];
      const removedIds = group.words.filter(w => w.id !== canonical.id).map(w => w.id);

      setMergePreview({
        groupId: group.id,
        canonicalId: canonical.id,
        removedIds,
        draft: {
          de: parsed.de || canonical.de,
          art: parsed.art || canonical.art,
          fa: parsed.fa || canonical.fa,
          pos: parsed.pos || canonical.pos,
          lvl: parsed.lvl || canonical.lvl,
          cat: parsed.cat || canonical.cat,
          syn: parsed.syn || canonical.syn || '',
          synFa: parsed.synFa || canonical.synFa || '',
          ant: parsed.ant || canonical.ant || '',
          antFa: parsed.antFa || canonical.antFa || '',
          pl: parsed.pl || canonical.pl || '',
          ex: parsed.ex || canonical.ex || '',
          exFa: parsed.exFa || canonical.exFa || '',
          ex2: parsed.ex2 || canonical.ex2 || '',
          ex2Fa: parsed.ex2Fa || canonical.ex2Fa || '',
          conj: parsed.conj || canonical.conj || '',
          prat: parsed.prat || canonical.prat || '',
          perf: parsed.perf || canonical.perf || '',
          sep: parsed.sep || canonical.sep || '',
          notes: parsed.notes || canonical.notes || ''
        }
      });
      onShowToast('پیش‌نویس ادغام آماده شد. لطفاً بررسی و تأیید نمایید.');
    } catch (err: any) {
      console.warn('AI merge fallback to manual consolidation:', err);
      // Fallback merge without crashing
      const sortedByProgress = [...group.words].sort((a, b) => (b.ok + b.bad) - (a.ok + a.bad));
      const canonical = sortedByProgress[0];
      const other = group.words.find(w => w.id !== canonical.id) || group.words[1];
      const removedIds = group.words.filter(w => w.id !== canonical.id).map(w => w.id);

      setMergePreview({
        groupId: group.id,
        canonicalId: canonical.id,
        removedIds,
        draft: {
          de: canonical.de,
          art: canonical.art || other?.art || '',
          fa: canonical.fa !== other?.fa ? `${canonical.fa}؛ ${other?.fa || ''}` : canonical.fa,
          pos: canonical.pos || other?.pos || 'اسم',
          lvl: canonical.lvl || other?.lvl || 'A1',
          cat: canonical.cat || other?.cat || '',
          ex: canonical.ex || other?.ex || '',
          exFa: canonical.exFa || other?.exFa || '',
          ex2: canonical.ex2 || other?.ex2 || '',
          ex2Fa: canonical.ex2Fa || other?.ex2Fa || '',
          conj: canonical.conj || other?.conj || '',
          prat: canonical.prat || other?.prat || '',
          perf: canonical.perf || other?.perf || '',
          sep: canonical.sep || other?.sep || '',
          notes: [canonical.notes, other?.notes].filter(Boolean).join('\n')
        }
      });
      onShowToast('ادغام اولیه با مقادیر تکمیلی آماده شد. لطفاً ویرایش و ذخیره کنید.');
    } finally {
      setMergingGroupId(null);
    }
  };

  const handleConfirmMerge = () => {
    if (!mergePreview) return;
    onMergeWords(mergePreview.canonicalId, mergePreview.draft, mergePreview.removedIds);
    setDismissedGroupIds(prev => new Set(prev).add(mergePreview.groupId));
    setMergePreview(null);
    onShowToast('ادغام با موفقیت ذخیره شد و سابقهٔ مرور منتقل گردید.');
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 overflow-y-auto"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl w-full max-w-3xl max-h-[92vh] overflow-hidden shadow-2xl flex flex-col text-right">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#dde1ea] dark:border-[#333b4a] flex items-center justify-between gap-2 bg-slate-50 dark:bg-[#141923]">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔍</span>
            <h3 className="font-bold text-base md:text-lg text-slate-900 dark:text-slate-100">
              شناسایی و ادغام واژگان تکراری و مشابه
            </h3>
          </div>
          <button
            onClick={onClose}
            className="bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 px-3 py-1 rounded-xl text-xs md:text-sm font-semibold transition"
          >
            ×
          </button>
        </div>

        {/* Filter bar */}
        <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-600 dark:text-slate-400">فیلتر نوع:</span>
            {(['all', 'exact', 'likely', 'similar'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveFilter(tab)}
                className={`px-2.5 py-1 rounded-xl font-bold transition ${
                  activeFilter === tab
                    ? 'bg-[#1f5fbf] text-white shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                }`}
              >
                {tab === 'all' && `همه (${duplicateGroups.length})`}
                {tab === 'exact' && `تکرار دقیق (${duplicateGroups.filter(g => g.type === 'exact').length})`}
                {tab === 'likely' && `تکرار محتمل (${duplicateGroups.filter(g => g.type === 'likely').length})`}
                {tab === 'similar' && `مشابه (${duplicateGroups.filter(g => g.type === 'similar').length})`}
              </button>
            ))}
          </div>

          <span className="text-[#5d6676] dark:text-[#a3adbd]">
            {visibleGroups.length} گروه نیازمند بررسی
          </span>
        </div>

        {/* Merge Preview Drawer if active */}
        {mergePreview && (
          <div className="p-4 bg-blue-50/90 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-800 space-y-3">
            <div className="flex items-center justify-between">
              <b className="text-xs md:text-sm text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                <span>🪄</span> پیش‌نمایش و ویرایش واژهٔ ادغام‌شده
              </b>
              <button
                onClick={() => setMergePreview(null)}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div>
                <label className="block font-bold mb-1">واژه آلمانی:</label>
                <input
                  type="text"
                  dir="ltr"
                  value={mergePreview.draft.de || ''}
                  onChange={e => setMergePreview({
                    ...mergePreview,
                    draft: { ...mergePreview.draft, de: e.target.value }
                  })}
                  className="w-full bg-white dark:bg-[#141923] border border-blue-300 dark:border-blue-700 rounded-xl px-2.5 py-1.5 outline-none font-bold"
                />
              </div>

              <div>
                <label className="block font-bold mb-1">آرتیکل:</label>
                <select
                  value={mergePreview.draft.art || ''}
                  onChange={e => setMergePreview({
                    ...mergePreview,
                    draft: { ...mergePreview.draft, art: e.target.value }
                  })}
                  className="w-full bg-white dark:bg-[#141923] border border-blue-300 dark:border-blue-700 rounded-xl px-2.5 py-1.5 outline-none"
                >
                  <option value="">بدون آرتیکل</option>
                  <option value="der">der (مذکر - آبی)</option>
                  <option value="die">die (مؤنث - صورتی)</option>
                  <option value="das">das (خنثی - سبز)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold mb-1">ترجمه فارسی:</label>
                <input
                  type="text"
                  dir="rtl"
                  value={mergePreview.draft.fa || ''}
                  onChange={e => setMergePreview({
                    ...mergePreview,
                    draft: { ...mergePreview.draft, fa: e.target.value }
                  })}
                  className="w-full bg-white dark:bg-[#141923] border border-blue-300 dark:border-blue-700 rounded-xl px-2.5 py-1.5 outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div>
                <label className="block font-bold mb-1">جمله مثال:</label>
                <input
                  type="text"
                  dir="ltr"
                  value={mergePreview.draft.ex || ''}
                  onChange={e => setMergePreview({
                    ...mergePreview,
                    draft: { ...mergePreview.draft, ex: e.target.value }
                  })}
                  className="w-full bg-white dark:bg-[#141923] border border-blue-300 dark:border-blue-700 rounded-xl px-2.5 py-1.5 outline-none"
                />
              </div>
              <div>
                <label className="block font-bold mb-1">ترجمه مثال:</label>
                <input
                  type="text"
                  dir="rtl"
                  value={mergePreview.draft.exFa || ''}
                  onChange={e => setMergePreview({
                    ...mergePreview,
                    draft: { ...mergePreview.draft, exFa: e.target.value }
                  })}
                  className="w-full bg-white dark:bg-[#141923] border border-blue-300 dark:border-blue-700 rounded-xl px-2.5 py-1.5 outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setMergePreview(null)}
                className="bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-xl text-xs font-semibold"
              >
                انصراف
              </button>
              <button
                onClick={handleConfirmMerge}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-1.5 rounded-xl text-xs font-bold shadow-xs transition"
              >
                ✓ تأیید و ثبت ادغام نهایی
              </button>
            </div>
          </div>
        )}

        {/* Groups List */}
        <div className="p-4 overflow-y-auto flex-1 max-h-[58vh] space-y-4">
          {visibleGroups.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              🎉 موردی برای نمایش یافت نشد. همهٔ واژگان متمایز و پاکیزه هستند!
            </div>
          ) : (
            visibleGroups.map(group => {
              const isMerging = mergingGroupId === group.id;
              return (
                <div
                  key={group.id}
                  className="bg-slate-50/70 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 space-y-3"
                >
                  {/* Group Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 dark:border-slate-800 pb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${
                        group.type === 'exact' ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' :
                        group.type === 'likely' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' :
                        'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                      }`}>
                        {group.type === 'exact' ? 'تکرار قطعی' : group.type === 'likely' ? 'تکرار احتمالی' : 'واژه‌های مشابه'}
                      </span>
                      <b className="text-xs md:text-sm font-sans" dir="ltr">{group.title}</b>
                    </div>

                    <button
                      onClick={() => handleDismissGroup(group.id)}
                      className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    >
                      نگه‌داشتن هر دو (صرف‌نظر) ✕
                    </button>
                  </div>

                  <p className="text-[11px] text-[#5d6676] dark:text-[#a3adbd]">
                    {group.reason}
                  </p>

                  {/* Words inside group */}
                  <div className="space-y-2">
                    {group.words.map(w => (
                      <div
                        key={w.id}
                        className="bg-white dark:bg-[#1b2029] border border-slate-200/70 dark:border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2" dir="ltr">
                            {w.art && (
                              <span className={`px-1.5 py-0.2 rounded font-bold text-xs ${
                                w.art === 'der' ? 'text-blue-600 dark:text-blue-400' :
                                w.art === 'die' ? 'text-pink-600 dark:text-pink-400' :
                                'text-emerald-600 dark:text-emerald-400'
                              }`}>
                                {w.art}
                              </span>
                            )}
                            <span className="font-bold text-sm text-slate-900 dark:text-slate-100 font-sans">
                              {w.de}
                            </span>
                            <span className="text-slate-500" dir="rtl">
                              — {w.fa}
                            </span>
                          </div>
                          <div className="text-[11px] text-[#5d6676] dark:text-[#a3adbd] flex flex-wrap gap-2">
                            <span>دسته: {w.cat || 'بدون دسته'}</span>
                            <span>سطح: {w.lvl || '—'}</span>
                            <span>مرورها: {w.ok} درست / {w.bad} غلط</span>
                          </div>
                          {w.ex && (
                            <p className="text-[11px] text-slate-600 dark:text-slate-300 italic truncate" dir="ltr">
                              "{w.ex}"
                            </p>
                          )}
                        </div>

                        {/* Individual Word Actions */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => handlePickCanonical(w, group)}
                            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2.5 py-1 rounded-lg text-[11px] font-bold transition"
                            title="حفظ این مورد و حذف بقیه"
                          >
                            ⭐ انتخاب به‌عنوان اصل
                          </button>
                          <button
                            onClick={() => handleDeleteEntry(w, group)}
                            className="bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-300 border border-red-200 dark:border-red-800 px-2 py-1 rounded-lg text-[11px] font-bold transition"
                            title="حذف این مورد"
                          >
                            🗑 حذف
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Group Action: AI Merge */}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      onClick={() => handleStartAiMerge(group)}
                      disabled={isMerging}
                      className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-4 py-1.5 rounded-xl text-xs font-bold shadow-xs hover:opacity-95 disabled:opacity-40 transition flex items-center gap-1.5"
                    >
                      <span>{isMerging ? '⏳ در حال مقایسه و ادغام...' : '✨ ادغام هوشمند با هوش مصنوعی'}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
