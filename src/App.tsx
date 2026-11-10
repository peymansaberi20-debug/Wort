/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { onCloudUserChanged, uploadStateToCloud } from './utils/cloud';
import { type User } from 'firebase/auth';
import { CloudAccountModal } from './components/CloudAccountModal';
import { GroupImportView } from './views/GroupImportView';
import { AppState, Word, CaseQuestion } from './types';
import {
  loadState,
  saveState,
  getExtData,
  saveExtData,
  sched,
  norm,
  fullWord,
  clearReviewHistory,
  clearAllVocabulary,
  auditWord
} from './utils/storage';
import { Header } from './components/Header';
import { Navigation, NavTab } from './components/Navigation';
import { Toast } from './components/Toast';
import { WordDetailModal } from './components/WordDetailModal';
import { QualityControlModal } from './components/QualityControlModal';
import { WordManagerModal } from './components/WordManagerModal';
import { HelpModal } from './components/HelpModal';
import { ImageExtractModal } from './components/ImageExtractModal';
import { AboutModal } from './components/AboutModal';
import { DuplicateDetectorModal } from './components/DuplicateDetectorModal';

import { DashboardView } from './views/DashboardView';
import { ExercisesView, ExerciseMode } from './views/ExercisesView';
import { VocabularyView } from './views/VocabularyView';
import { ImportExportView } from './views/ImportExportView';
import { SettingsView } from './views/SettingsView';
import { dstr, today } from './utils/dates';
import { isDuplicateEntry } from './utils/duplicates';
import { ImportDecision, applyImportPlan, mergeWordUpdate } from './utils/vocabMerge';
import { getTtsWorkerBase } from './utils/audio';

const isDuplicateVocabularyEntry = isDuplicateEntry;

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [extData, setExtData] = useState(() => getExtData());
  const [currentTab, setCurrentTab] = useState<NavTab>('dash');
  const [historyStack, setHistoryStack] = useState<NavTab[]>([]);

  // Active exercise mode if inside practice
  const [activeExercise, setActiveExercise] = useState<ExerciseMode | null>(null);
  const [practiceWordIds, setPracticeWordIds] = useState<string[] | null>(null);
  const [lastTargetedMode, setLastTargetedMode] = useState<ExerciseMode | null>(null);

  // Active Modals
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<{ words: Word[]; kind: 'single' | 'bulk'; source: string } | null>(null);
  const [isDeletionInProgress, setIsDeletionInProgress] = useState(false);
  const deletionLockRef = useRef(false);

  useEffect(() => {
    if (!pendingDeletion) deletionLockRef.current = false;
  }, [pendingDeletion]);
  const [editingWordId, setEditingWordId] = useState<string | null>(null);
  // True while a word is edited from inside an exercise: the exercise stays alive (hidden) and is shown again afterwards
  const [exerciseSuspended, setExerciseSuspended] = useState(false);
  const [exerciseHidden, setExerciseHidden] = useState(false);
  const [exerciseReturnTab, setExerciseReturnTab] = useState<NavTab>('dash');

  useEffect(() => {
    if (exerciseSuspended && !editingWordId) {
      setExerciseSuspended(false);
      setCurrentTab(exerciseReturnTab);
      window.scrollTo({ top: 0 });
    }
  }, [exerciseSuspended, editingWordId, exerciseReturnTab]);
  const [isQualityModalOpen, setIsQualityModalOpen] = useState(false);
  const [isWordManagerOpen, setIsWordManagerOpen] = useState(false);
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  const [isImageExtractOpen, setIsImageExtractOpen] = useState(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [cloudUser, setCloudUser] = useState<any>(null);
  const [showGroupImport, setShowGroupImport] = useState(false);
  const [cloudOpen, setCloudOpen] = useState(false);
  useEffect(() => onCloudUserChanged((u: any) => setCloudUser(u)), []);
  // CloudAccountModal enabling flag → App-level (kept simple: modal writes directly)
  const [activeHelpTopic, setActiveHelpTopic] = useState<string | null>(null);

  // Toast
  const [toastMsg, setToastMsg] = useState('');
  const [toastIsError, setToastIsError] = useState(false);

  const showToast = useCallback((msg: string, isErr = false) => {
    setToastMsg(msg);
    setToastIsError(isErr);
    setTimeout(() => {
      setToastMsg('');
    }, 4000);
  }, []);

  // Sync state to localStorage on state changes
  useEffect(() => {
    saveState(state);
  }, [state]);

  // Sync and directly enforce theme independent of mobile OS
  useEffect(() => {
    const t = state.set.theme || 'light';
    document.documentElement.dataset.theme = t;
    document.documentElement.setAttribute('data-theme', t);
    document.body.setAttribute('data-theme', t);
    document.documentElement.style.setProperty('color-scheme', t);
    document.body.style.setProperty('color-scheme', t);

    let meta = document.querySelector('meta[name="color-scheme"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'color-scheme');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', t === 'green' ? 'dark' : t);
    
    if (t === 'dark' || t === 'green') {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
    }
    document.body.classList.toggle('green-tint', t === 'green');
  }, [state.set.theme]);

  // Handle Tab Navigation with bugfix for Request #5
  const navigateToTab = (tab: NavTab) => {
    if (tab !== currentTab || activeExercise) {
      setHistoryStack(prev => [...prev.slice(-25), currentTab]);
    }
    //
    // Fulfills User Request #5:
    // "الان وقتی ویرایش رو میزنم وارد ویرایش واژه میشه،
    // اگر از پایین مثلا داشبورد انتخاب کنم و برم داشبورد ، اون فرم ویرایش بسته نمیشه و باز میمونه توی قسمت واژگان ، این ایراد رو حتما رفع کن ."
    //
    if (editingWordId && tab !== 'lib') {
      setEditingWordId(null);
    }
    setExerciseSuspended(false);
    setIsQualityModalOpen(false);
    setIsWordManagerOpen(false);
    setIsDuplicateModalOpen(false);

        if (activeExercise) {
      // Keep the running exercise alive: hide it instead of destroying it.
      // Leaving the exercise happens only through the exercise's own exit action.
      setExerciseHidden(tab !== 'prac');
      setCurrentTab(tab);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setExerciseHidden(false);
    setCurrentTab(tab);
    setActiveExercise(null);
    setPracticeWordIds(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    // Word edit form opened from the quality control list: close it and show the list again
    if (editingWordId && (isQualityModalOpen || isDuplicateModalOpen)) {
      setEditingWordId(null);
      return;
    }
    // If modal is open, close modal first
    if (selectedWord) {
      setSelectedWord(null);
      return;
    }
    if (isQualityModalOpen) {
      setIsQualityModalOpen(false);
      return;
    }
    if (isWordManagerOpen) {
      setIsWordManagerOpen(false);
      return;
    }
    if (isDuplicateModalOpen) {
      setIsDuplicateModalOpen(false);
      return;
    }
    if (isImageExtractOpen) {
      setIsImageExtractOpen(false);
      return;
    }
    if (isAboutModalOpen) {
      setIsAboutModalOpen(false);
      return;
    }
    if (activeHelpTopic) {
      setActiveHelpTopic(null);
      return;
    }

    // Editing a word that was opened from an exercise: close the form and go back to the exercise
    if (exerciseSuspended) {
      setEditingWordId(null);
      return;
    }

    // If inside exercise, exit exercise
    if (activeExercise) {
      setActiveExercise(null);
      setPracticeWordIds(null);
      return;
    }

    // Otherwise navigate back in stack
    if (historyStack.length > 0) {
      const prev = historyStack[historyStack.length - 1];
      setHistoryStack(historyStack.slice(0, -1));
      setCurrentTab(prev);
      if (editingWordId) setEditingWordId(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleToggleTheme = () => {
    // cycle: light → dark → green (night reading) → light
    const nextTheme: 'light' | 'dark' | 'green' =
      state.set.theme === 'light' ? 'dark' :
      state.set.theme === 'dark' ? 'green' : 'light';
    setState(prev => ({
      ...prev,
      set: { ...prev.set, theme: nextTheme }
    }));
  };
  
  const handleSaveAndExit = () => {
    saveState(state);
    showToast('همه اطلاعات با موفقیت ذخیره شد. می‌توانید با آسودگی خارج شوید.');
  };

  // Add / Edit Word. Duplicate checks here are a final guard in addition to the form-level check.
  const handleSaveWord = (wordData: Partial<Word>, isEdit: boolean) => {
    if (!isEdit && isDuplicateVocabularyEntry(wordData, state.words)) {
      showToast('این واژه قبلاً در کتابخانه وجود دارد؛ واژهٔ تکراری ذخیره نشد.', true);
      return;
    }

        // Phase 3: build the new word up front so its profile can be opened after save
    const newWord = isEdit ? null : (norm({ ...wordData, added: Date.now() }) as Word);

    setState(prev => {
      // Recheck against the latest state immediately before insertion to avoid stale-state duplicates.
      if (!isEdit && isDuplicateVocabularyEntry(wordData, prev.words)) {
        showToast('این واژه هم‌زمان به کتابخانه اضافه شده است؛ ثبت تکراری انجام نشد.', true);
        return prev;
      }

      const nextWords = [...prev.words];
      if (isEdit && editingWordId) {
        const idx = nextWords.findIndex(w => w.id === editingWordId);
        if (idx >= 0) {
          const old = nextWords[idx];
          nextWords[idx] = norm({
            ...old,
            ...wordData,
            id: old.id
          }) as Word;
        }
            } else {
        if (newWord) nextWords.push(newWord);
      }
      showToast(isEdit ? 'تغییرات واژه ذخیره شد.' : 'واژه با موفقیت به کتابخانه افزوده شد.');
            return { ...prev, words: nextWords };
    });
    // Phase 3: after adding or editing a word, open its profile; closing it returns to the vocabulary view
    if (newWord) {
      setSelectedWord(newWord);
      // Pre-warm cloud TTS for the new word in the background (no user wait)
      if (getTtsWorkerBase()) {
        const texts = [fullWord(newWord), newWord.ex, newWord.ex2].filter(Boolean) as string[];
        void Promise.all(texts.map(t => fetch(`https://${getTtsWorkerBase()!.replace(/^https?:\/\//, '')}/?lang=de&text=${encodeURIComponent(t)}`).catch(() => null)));
      }
    } else if (isEdit) {
      const updated = state.words.find(w => w.id === editingWordId);
      if (updated) {
        const merged = norm({ ...updated, ...wordData, id: updated.id }) as Word;
        setSelectedWord(merged);
        // Pre-warm cloud TTS for edited words too (only what is missing)
        if (getTtsWorkerBase()) {
          const texts = [fullWord(merged), merged.ex, merged.ex2].filter(Boolean) as string[];
          void Promise.all(texts.map(t => fetch(`https://${getTtsWorkerBase()!.replace(/^https?:\/\//, '')}/?lang=de&text=${encodeURIComponent(t)}`).catch(() => null)));
        }
      }
    }
    setEditingWordId(null);
  };

  // Centralized deletion request: no record is removed until the user confirms.
  const handleDeleteWord = (word: Word) => {
    const current = state.words.find(w => w.id === word.id);
    if (!current) {
      showToast('این واژه دیگر در کتابخانه وجود ندارد.', true);
      return;
    }
    setPendingDeletion({ words: [current], kind: 'single', source: 'واژه' });
  };

  const handleBatchDeleteWords = (wordIds: string[], source = 'مدیریت گروهی') => {
    const ids = new Set(wordIds);
    const selected = state.words.filter(w => ids.has(w.id));
    if (selected.length === 0) return;
    setPendingDeletion({ words: selected, kind: 'bulk', source });
  };

  const confirmPendingDeletion = () => {
    if (!pendingDeletion || deletionLockRef.current) return;
    deletionLockRef.current = true;
    setIsDeletionInProgress(true);
    const ids = new Set(pendingDeletion.words.map(w => w.id));
    const count = ids.size;
    setState(prev => ({ ...prev, words: prev.words.filter(w => !ids.has(w.id)) }));
    setSelectedWord(prev => (prev && ids.has(prev.id) ? null : prev));
    setEditingWordId(prev => (prev && ids.has(prev) ? null : prev));
    setPendingDeletion(null);
    setIsDeletionInProgress(false);
    showToast(count === 1
      ? `واژهٔ «${pendingDeletion.words[0].de}» حذف شد.`
      : `${count} واژه با موفقیت حذف شدند.`);
  };

  const handleEditWord = (word: Word) => {
    setSelectedWord(null);
    setEditingWordId(word.id);
    if (isQualityModalOpen || isDuplicateModalOpen) {
      // Opened from the quality control / duplicate list (which stays open, hidden, behind the form)
      setCurrentTab('lib');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (activeExercise) {
      // Opened from inside an exercise: keep the exercise alive (hidden) so it can be resumed afterwards
      setExerciseReturnTab(currentTab);
      setExerciseSuspended(true);
      setCurrentTab('lib');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    // Keep a route back to the previous context.
    if (currentTab !== 'lib') {
      setHistoryStack(prev => [...prev.slice(-25), currentTab]);
    }
    setCurrentTab('lib');
    setActiveExercise(null);
    setPracticeWordIds(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Word Image Change
  const handleImageChange = (word: Word, newImg: string) => {
    setState(prev => ({
      ...prev,
      words: prev.words.map(w => (w.id === word.id ? { ...w, img: newImg } : w))
    }));
    if (selectedWord?.id === word.id) {
      setSelectedWord(prev => (prev ? { ...prev, img: newImg } : null));
    }
    showToast(newImg ? 'تصویر واژه به‌روز شد.' : 'تصویر واژه حذف شد.');
  };

  // Category Operations
  const handleRenameCategory = (oldCat: string, newCat: string) => {
    setState(prev => ({
      ...prev,
      words: prev.words.map(w => (w.cat === oldCat ? { ...w, cat: newCat } : w))
    }));
    showToast(`نام دسته به «${newCat}» تغییر یافت.`);
  };

  const handleDeleteCategory = (cat: string) => {
    setState(prev => ({
      ...prev,
      words: prev.words.map(w => (w.cat === cat ? { ...w, cat: '' } : w))
    }));
    showToast(`دستهٔ «${cat}» حذف شد و واژه‌های آن بدون دسته شدند.`);
  };

  // Batch operations from WordManagerModal
  const handleBatchMoveWords = (wordIds: string[], targetCat: string) => {
    const idSet = new Set(wordIds);
    setState(prev => ({
      ...prev,
      words: prev.words.map(w => (idSet.has(w.id) ? { ...w, cat: targetCat } : w))
    }));
    showToast(`${wordIds.length} واژه به دستهٔ «${targetCat || 'بدون دسته'}» منتقل شدند.`);
  };

  const handleMergeWords = (canonicalId: string, mergedData: Partial<Word>, removedIds: string[]) => {
    const removedSet = new Set(removedIds);
    setState(prev => {
      const updatedWords = prev.words
        .filter(w => !removedSet.has(w.id))
        .map(w => {
          if (w.id === canonicalId) {
            return norm({ ...w, ...mergedData, id: canonicalId }) as Word;
          }
          return w;
        });

      // Safely remap review history from deleted IDs to the canonical ID
      const updatedHist = prev.hist.map(h => {
        if (removedSet.has(h.id)) {
          return { ...h, id: canonicalId };
        }
        return h;
      });

      return {
        ...prev,
        words: updatedWords,
        hist: updatedHist
      };
    });
    showToast('ادغام واژگان با موفقیت انجام شد.');
  };

  // Quality Control operations
  const qualityIssueCount = state.words.filter(w => !(extData.ok || {})[w.id] && auditWord(w).length > 0).length;

  const handleIgnoreQualityWord = (wordId: string) => {
    const updated = { ...extData, ok: { ...(extData.ok || {}), [wordId]: 1 } };
    setExtData(updated);
    saveExtData(updated);
    showToast('واژه نادیده گرفته شد.');
  };

  // Record practice result
  const handleRecordResult = (
    item: Word | CaseQuestion,
    mode: string,
    grade: number,
    isRetry: boolean
  ) => {
    const isWord = !('cs' in item);
    setState(prev => {
      let nextWords = prev.words;
      let nextDaily = prev.daily.d === today()
        ? { ...prev.daily }
        : { d: today(), n: 0, r: 0 };

      if (isWord) {
        const w = item as Word;
        const targetIdx = nextWords.findIndex(x => x.id === w.id);
        if (targetIdx >= 0) {
          const clone = { ...nextWords[targetIdx] };
          const isFirstTime = sched(clone, grade, prev.set.ivlMod || 1.0, prev.set.leechN || 4);
          nextWords = [...nextWords];
          nextWords[targetIdx] = clone;

          if (!isRetry) {
            if (isFirstTime) nextDaily.n = (nextDaily.n || 0) + 1;
            else nextDaily.r = (nextDaily.r || 0) + 1;
          }
        }
      }

      const nextHist = [
        ...prev.hist,
        {
          id: item.id,
          t: Date.now(),
          type: mode,
          exp: isWord ? fullWord(item as Word) : (item as CaseQuestion).ans,
          ok: grade > 0 ? 1 : 0
        }
      ];
      if (nextHist.length > 5000) nextHist.splice(0, nextHist.length - 5000);

      return {
        ...prev,
        words: nextWords,
        hist: nextHist,
        daily: nextDaily
      };
    });
  };

  // Import operations
  const handleImportWords = (newWords: Word[], overwrite: boolean) => {
    let added = 0;
    let updated = 0;

    setState(prev => {
      const existing = [...prev.words];
      const normDe = (s: string) => (s || '').trim().toLowerCase();
      const normFull = (w: Word) => (w.art ? `${w.art.toLowerCase()} ${normDe(w.de)}` : normDe(w.de));

      newWords.forEach(w => {
        if (!w || !w.de) return;
        let idx = existing.findIndex(x => x.id === w.id);
        if (idx < 0) idx = existing.findIndex(x => normFull(x) === normFull(w));
        if (idx < 0) idx = existing.findIndex(x => normDe(x.de) === normDe(w.de));

        if (idx < 0) {
          existing.push(w);
          added++;
        } else if (overwrite) {
          // safe merge: identity, category and learning progress stay; empty values never erase data
          existing[idx] = mergeWordUpdate(existing[idx], w);
          updated++;
        }
      });

      return { ...prev, words: existing };
    });

    if (overwrite && updated > 0) {
      showToast(`${added} واژه افزوده شد و ${updated} واژه بازنویسی شد.`);
    } else {
      showToast(`${added} واژه با موفقیت به کتابخانه افزوده شد.`);
    }
  };

  /** Applies a reviewed import plan: new words + per-entry update/keep decisions (one atomic state change). */
  const handleApplyImportPlan = (fresh: Word[], decisions: ImportDecision[], updateCategory = false) => {
    const current = state.words;
    const preview = applyImportPlan(current, fresh, decisions, { updateCategory });
    setState(prev => {
      const r = applyImportPlan(prev.words, fresh, decisions, { updateCategory });
      return { ...prev, words: r.words };
    });
    const parts: string[] = [];
    if (preview.added) parts.push(`${preview.added} واژهٔ جدید افزوده شد`);
    if (preview.updated) parts.push(`${preview.updated} واژه به‌روزرسانی شد`);
    if (preview.skipped) parts.push(`${preview.skipped} واژه بدون تغییر ماند`);
    showToast(parts.length ? parts.join('، ') + '.' : 'تغییری اعمال نشد.');
  };

  /** Updates ONE existing word with imported data (single-word JSON import). */
  const handleUpdateExistingWord = (id: string, incoming: Word, updateCategory = false) => {
    if (!state.words.some(w => w.id === id)) {
      showToast('این واژه دیگر در کتابخانه وجود ندارد.', true);
      return;
    }
    setState(prev => ({
      ...prev,
      words: prev.words.map(w => (w.id === id ? mergeWordUpdate(w, incoming, { updateCategory }) : w))
    }));
    showToast('واژهٔ موجود به‌روزرسانی شد (شناسه، دسته و پیشرفت یادگیری حفظ شد).');
  };

  const handleRestoreBackup = (backupState: AppState) => {
    setState(backupState);
    showToast('نسخه پشتیبان با موفقیت بازیابی شد.');
  };

  return (
    <div className="min-h-screen bg-[#f6f7fb] dark:bg-[#12151c] text-[#1d2330] dark:text-[#eef1f6] flex flex-col font-sans transition-colors duration-200">
      {/* Top Application Header */}
      <Header
        onBack={handleBack}
        onAbout={() => setIsAboutModalOpen(true)}
        theme={state.set.theme}
        onToggleTheme={handleToggleTheme}
        onSaveAndExit={handleSaveAndExit}
        canGoBack={
          historyStack.length > 0 ||
          !!activeExercise ||
          !!selectedWord ||
          isQualityModalOpen ||
          isDuplicateModalOpen ||
          isWordManagerOpen
        }
        onOpenCloud={() => setCloudOpen(true)}
        cloudEmail={cloudUser?.email || null}
      />
      {showGroupImport && (
        <GroupImportView
          words={state.words}
          onAddEnrichedWords={ws => setState(prev => ({ ...prev, words: [...prev.words, ...ws] }))}
          onClose={() => setShowGroupImport(false)}
          onShowToast={showToast}
        />
      )}
      <CloudAccountModal
        open={cloudOpen}
        onClose={() => setCloudOpen(false)}
        user={cloudUser}
        state={state}
        onApplyState={s => setState(s)}
        onShowToast={showToast}
      />
      <AutoCloudSync
        user={cloudUser}
        state={state}
        showToast={showToast}
      />

      {/* Main Container */}
      <div className="flex-1 max-w-6xl w-full mx-auto p-3.5 md:p-6 grid grid-cols-1 md:grid-cols-[230px_minmax(0,1fr)] gap-5 pb-24 md:pb-12">
        {/* Desktop Sidebar / Mobile Nav */}
        <Navigation currentTab={currentTab} onSelectTab={navigateToTab} />

        {/* Dynamic Tab View */}
        <main className="min-w-0">
          {activeExercise && (
            <div className={(exerciseSuspended || exerciseHidden) ? 'hidden' : ''}>
            <ExercisesView
              paused={exerciseSuspended || exerciseHidden || !!activeHelpTopic}
              words={state.words}
              settings={state.set}
              activeMode={activeExercise}
              practiceWordIds={practiceWordIds}
              dailyProgress={state.daily.d === today() ? state.daily : { d: today(), n: 0, r: 0 }}
              onSelectMode={mode => {
                setExerciseHidden(false);
                setActiveExercise(mode);
                if (mode === null) setPracticeWordIds(null);
              }}
              onRecordResult={handleRecordResult}
              onOpenHelp={setActiveHelpTopic}
              onShowToast={showToast}
              onEditWord={handleEditWord}
              onDeleteWord={handleDeleteWord}
              onImageChange={handleImageChange}
              onUpdateSettings={patch => setState(prev => ({ ...prev, set: { ...prev.set, ...patch } }))}
            />
            </div>
          )}
          {(!activeExercise || exerciseSuspended || exerciseHidden) && (
            <>
              {currentTab === 'dash' && (
                <DashboardView
                  state={state}
                  ignoredQualityIds={extData.ok || {}}
                  onNavigate={tab => {
                    if (tab === 'daily') {
                      setExerciseHidden(false);
                      setActiveExercise('daily');
                    } else if (tab === 'prac') {
                      navigateToTab('prac');
                    }
                  }}
                  onPracticeWords={(ids, intent = 'targeted') => {
                    const selectedIds = new Set(ids);
                    if (intent === 'hard') {
                      const hardIds = state.words.filter(w => selectedIds.has(w.id)).map(w => w.id);
                      if (hardIds.length === 0) {
                        showToast('واژهٔ مناسبی برای تمرین اختصاصی پیدا نشد.', true);
                        return;
                      }
                      setPracticeWordIds(hardIds);
                      setExerciseHidden(false);
                      setActiveExercise('hard');
                      return;
                    }
                    if (intent === 'review') {
                      // skip words already reviewed today in this dashboard list (no repeat on re-entry)
                      const reviewedToday = new Set(
                        state.hist
                          .filter(x => x.ok && dstr(x.t) === today())
                          .map(x => x.id)
                      );
                      const dueIds = state.words
                        .filter(w => selectedIds.has(w.id) && w.last && w.due <= Date.now() && !reviewedToday.has(w.id))
                        .sort((a, b) => a.due - b.due)
                        .map(w => w.id);
                      if (dueIds.length === 0) {
                        showToast('در حال حاضر واژهٔ سررسیدشده‌ای برای مرور وجود ندارد.');
                        return;
                      }
                      setPracticeWordIds(dueIds);
                      setExerciseHidden(false);
                      setActiveExercise('review');
                      return;
                    }

                    const selectedWords = state.words.filter(w => selectedIds.has(w.id));
                    const candidates: { mode: ExerciseMode; ids: string[] }[] = [
                      { mode: 'art', ids: selectedWords.filter(w => !!w.art).map(w => w.id) },
                      { mode: 'cloze', ids: selectedWords.filter(w => !!w.cloze || !!w.ans).map(w => w.id) },
                      { mode: 'plural', ids: selectedWords.filter(w => !!w.pl).map(w => w.id) },
                      { mode: 'conj', ids: selectedWords.filter(w => !!w.conj).map(w => w.id) },
                      { mode: 'tense', ids: selectedWords.filter(w => !!w.prat || !!w.perf).map(w => w.id) },
                      { mode: 'dict', ids: selectedWords.map(w => w.id) },
                      { mode: 'prod', ids: selectedWords.map(w => w.id) },
                      { mode: 'synant', ids: selectedWords.filter(w => !!w.syn || !!w.ant).map(w => w.id) }
                    ].filter(candidate => candidate.ids.length > 0 && candidate.ids.length === selectedWords.length);

                    if (candidates.length === 0 || selectedWords.length === 0) {
                      showToast('واژهٔ مناسبی برای تمرین اختصاصی پیدا نشد.', true);
                      return;
                    }
                    const alternatives = candidates.filter(candidate => candidate.mode !== lastTargetedMode);
                    const choices = alternatives.length > 0 ? alternatives : candidates;
                    const selected = choices[Math.floor(Math.random() * choices.length)];
                    setLastTargetedMode(selected.mode);
                    setPracticeWordIds(selected.ids);
                    setActiveExercise(selected.mode);
                  }}
                  onUpdateDailyNewTarget={target => {
                    setState(prev => ({
                      ...prev,
                      set: { ...prev.set, nw: target }
                    }));
                    showToast(`سهمیه جدید روزانه (${target} واژه) اعمال شد.`);
                  }}
                  onSelectWord={setSelectedWord}
                />
              )}

              {currentTab === 'prac' && (
                <ExercisesView
                  words={state.words}
                  settings={state.set}
                  activeMode={null}
                  onSelectMode={setActiveExercise}
                  onRecordResult={handleRecordResult}
                  onOpenHelp={setActiveHelpTopic}
                  onShowToast={showToast}
                  onEditWord={handleEditWord}
                  onDeleteWord={handleDeleteWord}
                  onImageChange={handleImageChange}
                  onUpdateSettings={patch => setState(prev => ({ ...prev, set: { ...prev.set, ...patch } }))}
                />
              )}

              {currentTab === 'lib' && (
                <VocabularyView
                  words={state.words}
                  editingWordId={editingWordId}
                  onSetEditingWordId={setEditingWordId}
                  onSaveWord={handleSaveWord}
                  onDeleteWord={handleDeleteWord}
                  onRenameCategory={handleRenameCategory}
                  onDeleteCategory={handleDeleteCategory}
                  onSelectWord={setSelectedWord}
                  onOpenWordManager={() => setIsWordManagerOpen(true)}
                  onOpenHelp={setActiveHelpTopic}
                  onShowToast={showToast}
                />
              )}

              {currentTab === 'io' && (
                <ImportExportView
                  state={state}
                  words={state.words}
                  onImportWords={handleImportWords}
                  onRestoreBackup={handleRestoreBackup}
                  onOpenImageExtract={() => setIsImageExtractOpen(true)}
                  onOpenHelp={setActiveHelpTopic}
                  onShowToast={showToast}
                />
              )}

              {currentTab === 'set' && (
                <SettingsView
                  settings={state.set}
                  words={state.words}
                  onUpdateSettings={newSet => {
                    setState(prev => ({
                      ...prev,
                      set: { ...prev.set, ...newSet }
                    }));
                    showToast('تنظیمات ذخیره شد.');
                  }}
                  onClearHistory={() => {
                    setState(prev => clearReviewHistory(prev));
                    showToast('سابقه مرور با موفقیت پاک شد.');
                  }}
                  onClearAllWords={() => {
                    setState(prev => clearAllVocabulary(prev));
                    showToast('کلیهٔ واژگان پاک شدند.', true);
                  }}
                  onShowToast={showToast}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-[#dde1ea] dark:border-[#333b4a] pt-5 pb-[calc(6.25rem+env(safe-area-inset-bottom))] md:pb-6 px-4 text-center text-xs text-[#475569] dark:text-[#c0c8d5] space-y-1.5 mt-auto">
        <p dir="ltr" className="font-sans font-extrabold text-sm text-[#1f5fbf] dark:text-[#7fb0ff] tracking-wide">WörterBuch</p>
        <p>پلتفرم هوشمند یادگیری، تثبیت و مرور واژگان زبان آلمانی</p>
        <p className="flex items-center justify-center gap-3 flex-wrap">
          <span>طراحی و توسعه: <b>پیمان صابری</b></span>
          <span aria-hidden="true">•</span>
          <a href="mailto:peymansaberi20@gmail.com" dir="ltr" className="text-[#1f5fbf] dark:text-[#7fb0ff] font-sans hover:underline">peymansaberi20@gmail.com</a>
        </p>
        <p className="text-[11px] opacity-80">© 2025 Peyman Saberi — تمام حقوق این برنامه محفوظ است. استفادهٔ تجاری بدون اجازهٔ کتبی مجاز نیست.</p>
      </footer>

      {/* Modals */}
      <WordDetailModal
        word={selectedWord}
        onClose={() => setSelectedWord(null)}
        onEdit={handleEditWord}
        onDelete={handleDeleteWord}
        onImageChange={handleImageChange}
      />

      {/* Popups below stay mounted (but hidden) while a word is edited from the quality list */}
      <div className={editingWordId ? 'hidden' : ''}>
        {isWordManagerOpen && (
          <WordManagerModal
            words={state.words}
            onClose={() => setIsWordManagerOpen(false)}
            onMoveWords={handleBatchMoveWords}
            onBatchDelete={handleBatchDeleteWords}
            onOpenDuplicateDetector={() => setIsDuplicateModalOpen(true)}
            onOpenQualityControl={() => setIsQualityModalOpen(true)}
            qualityIssueCount={qualityIssueCount}
          />
        )}

        {isQualityModalOpen && (
          <QualityControlModal
            words={state.words}
            ignoredIds={extData.ok || {}}
            onClose={() => setIsQualityModalOpen(false)}
            onEditWord={handleEditWord}
            onIgnoreWord={handleIgnoreQualityWord}
            onDeleteWord={handleDeleteWord}
          />
        )}
      </div>

      {isDuplicateModalOpen && (
        <DuplicateDetectorModal
          words={state.words}
          onClose={() => setIsDuplicateModalOpen(false)}
          onDeleteWord={handleDeleteWord}
          onBatchDelete={(ids: string[]) => handleBatchDeleteWords(ids, 'تشخیص واژه‌های تکراری')}
          onMergeWords={handleMergeWords}
          onEditWord={handleEditWord}
          onImageChange={handleImageChange}
          hidden={!!editingWordId}
          onShowToast={showToast}
        />
      )}

      {isImageExtractOpen && (
        <ImageExtractModal
          words={state.words}
          onClose={() => setIsImageExtractOpen(false)}
          onAddEnrichedWords={enrichedWords => {
            handleImportWords(enrichedWords, false);
          }}
          onApplyImportPlan={(fresh, decisions) => handleApplyImportPlan(fresh, decisions)}
          onShowToast={showToast}
        />
      )}

      {isAboutModalOpen && (
        <AboutModal onClose={() => setIsAboutModalOpen(false)} />
      )}

      {activeHelpTopic && (
        <HelpModal
          topicKey={activeHelpTopic}
          onClose={() => setActiveHelpTopic(null)}
        />
      )}

      {pendingDeletion && (
        <div
          className="fixed inset-0 z-[100] bg-black/65 backdrop-blur-xs flex items-center justify-center p-4"
          role="presentation"
          onClick={e => { if (e.target === e.currentTarget && !isDeletionInProgress) setPendingDeletion(null); }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
            className="w-full max-w-md rounded-2xl border border-red-200 dark:border-red-900 bg-white dark:bg-[#1b2029] p-5 shadow-2xl text-right"
            dir="rtl"
          >
            <h2 id="delete-confirm-title" className="text-lg font-extrabold text-red-700 dark:text-red-300 mb-2">تأیید حذف واژه</h2>
            {pendingDeletion.kind === 'single' ? (
              <p className="text-sm leading-7 text-slate-700 dark:text-slate-200">آیا از حذف واژهٔ «<strong>{pendingDeletion.words[0].de}</strong>» اطمینان دارید؟ این عملیات فقط همین واژه را حذف می‌کند و قابل بازگشت نیست.</p>
            ) : (
              <div className="text-sm leading-7 text-slate-700 dark:text-slate-200">
                <p>آیا از حذف کامل <strong>{pendingDeletion.words.length} واژه</strong> انتخاب‌شده از بخش «{pendingDeletion.source}» مطمئن هستید؟ {pendingDeletion.source === 'تشخیص واژه‌های تکراری' ? 'این‌ها رکوردهای تکراری/منبع هستند؛ واژه‌های انتخاب‌شده حذف می‌شوند و فقط نسخه‌هایی که در این فهرست انتخاب نشده‌اند باقی می‌مانند.' : ''} این عملیات قابل بازگشت نیست.</p>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">نمونه: {pendingDeletion.words.slice(0, 3).map(w => w.de).join('، ')}{pendingDeletion.words.length > 3 ? ' و موارد دیگر' : ''}</p>
              </div>
            )}
            <div className="mt-5 flex justify-start gap-2">
              <button type="button" disabled={isDeletionInProgress} onClick={() => setPendingDeletion(null)} className="rounded-xl px-4 py-2 text-sm font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50">انصراف</button>
              <button type="button" disabled={isDeletionInProgress} onClick={confirmPendingDeletion} className="rounded-xl px-4 py-2 text-sm font-bold bg-red-600 hover:bg-red-700 text-white disabled:opacity-50">بله، حذف شود</button>
            </div>
          </section>
        </div>
      )}


      {/* Floating Notification Toast */}
      <Toast message={toastMsg} isError={toastIsError} />
    </div>
  );
}

/** Silent background sync: after data changes, uploads to the cloud when enabled. */
function AutoCloudSync({ user, state, showToast }: { user: any; state: any; showToast: (m: string, e?: boolean) => void }) {
  const timerRef = useRef<any>(null);
  const savingRef = useRef(false);
  const lastSigRef = useRef<string>('');

  // debounced auto-sync: whenever signed-in AND data changed, upload the latest snapshot
  useEffect(() => {
    if (!user) return;
    const sig = JSON.stringify([state.words.length, state.hist.length, state.daily]);
    if (sig === lastSigRef.current) return;
    if (savingRef.current) return;
    if (state.words.length === 0) return; // never auto-push an empty library
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      savingRef.current = true;
      try {
        await uploadStateToCloud(user, state);
        lastSigRef.current = sig;
        showToast('☁️ همگام‌سازی ابری انجام شد.', false);
      } catch (e: any) {
        showToast(e?.friendly || e?.message || 'خطا در همگام‌سازی ابری.', true);
      } finally {
        savingRef.current = false;
      }
    }, 3000);
    return () => clearTimeout(timerRef.current);
  }, [state, user]);

  return null;
}
