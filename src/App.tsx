/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { PwaExitModal } from './components/PwaExitModal';

import { DashboardView } from './views/DashboardView';
import { ExercisesView, ExerciseMode } from './views/ExercisesView';
import { VocabularyView } from './views/VocabularyView';
import { ImportExportView } from './views/ImportExportView';
import { SettingsView } from './views/SettingsView';
import { today } from './utils/dates';
import { isDuplicateEntry } from './utils/duplicates';
import { ImportDecision, applyImportPlan, mergeWordUpdate } from './utils/vocabMerge';

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

  // PWA Exit Modal State (Phase 2 Requirement)
  const [isPwaExitModalOpen, setIsPwaExitModalOpen] = useState(false);

  // Active Modals
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<{ words: Word[]; kind: 'single' | 'bulk'; source: string } | null>(null);
  const [isDeletionInProgress, setIsDeletionInProgress] = useState(false);
  const deletionLockRef = useRef(false);

  useEffect(() => {
    if (!pendingDeletion) deletionLockRef.current = false;
  }, [pendingDeletion]);
  const [editingWordId, setEditingWordId] = useState<string | null>(null);
  const [exerciseSuspended, setExerciseSuspended] = useState(false);
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

  // PWA Standalone Mode Detection for Exit Action
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent default mini-infobar if needed
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

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
    meta.setAttribute('content', t);

    if (t === 'dark') {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
    }
  }, [state.set.theme]);

  // Handle Tab Navigation
  const navigateToTab = (tab: NavTab) => {
    if (tab !== currentTab || activeExercise) {
      setHistoryStack(prev => [...prev.slice(-25), currentTab]);
    }
    if (editingWordId && tab !== 'lib') {
      setEditingWordId(null);
    }
    setExerciseSuspended(false);
    setIsQualityModalOpen(false);
    setIsWordManagerOpen(false);
    setIsDuplicateModalOpen(false);

    setCurrentTab(tab);
    setActiveExercise(null);
    setPracticeWordIds(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    // Check if PWA standalone and at root, prompt exit modal
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
    if (isStandalone && historyStack.length === 0 && !activeExercise && !selectedWord && !editingWordId) {
      setIsPwaExitModalOpen(true);
      return;
    }

    if (editingWordId && (isQualityModalOpen || isDuplicateModalOpen)) {
      setEditingWordId(null);
      return;
    }
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

    if (exerciseSuspended) {
      setEditingWordId(null);
      return;
    }

    if (activeExercise) {
      setActiveExercise(null);
      setPracticeWordIds(null);
      return;
    }

    if (historyStack.length > 0) {
      const prev = historyStack[historyStack.length - 1];
      setHistoryStack(historyStack.slice(0, -1));
      setCurrentTab(prev);
      if (editingWordId) setEditingWordId(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleToggleTheme = () => {
    const nextTheme = state.set.theme === 'dark' ? 'light' : 'dark';
    setState(prev => ({
      ...prev,
      set: { ...prev.set, theme: nextTheme }
    }));
  };

  const handleSaveAndExit = () => {
    saveState(state);
    showToast('همه اطلاعات با موفقیت ذخیره شد. می‌توانید با آسودگی خارج شوید.');
  };

  // ... [بخش‌های مربوط به توابع ذخیره‌سازی، ویرایش، حذف، ایمپورت و غیره بدون تغییر باقی می‌مانند]
  
  const handleSaveWord = (wordData: Partial<Word>, isEdit: boolean) => {
    // ... منطق ذخیره واژه
  };

  const handleDeleteWord = (word: Word) => {
    // ... منطق حذف
  };

  const handleBatchDeleteWords = (wordIds: string[], source = 'مدیریت گروهی') => {
    // ...
  };

  const confirmPendingDeletion = () => {
    // ...
  };

  const handleEditWord = (word: Word) => {
    // ...
  };

  const handleImageChange = (word: Word, newImg: string) => {
    // ...
  };

  const handleRenameCategory = (oldCat: string, newCat: string) => {
    // ...
  };

  const handleDeleteCategory = (cat: string) => {
    // ...
  };

  const handleBatchMoveWords = (wordIds: string[], targetCat: string) => {
    // ...
  };

  const handleMergeWords = (canonicalId: string, mergedData: Partial<Word>, removedIds: string[]) => {
    // ...
  };

  const qualityIssueCount = state.words.filter(w => !(extData.ok || {})[w.id] && auditWord(w).length > 0).length;

  const handleIgnoreQualityWord = (wordId: string) => {
    const updated = { ...extData, ok: { ...(extData.ok || {}), [wordId]: 1 } };
    setExtData(updated);
    saveExtData(updated);
    showToast('واژه نادیده گرفته شد.');
  };

  const handleRecordResult = (
    item: Word | CaseQuestion,
    mode: string,
    grade: number,
    isRetry: boolean
  ) => {
    // ...
  };

  const handleImportWords = (newWords: Word[], overwrite: boolean) => {
    // ...
  };

  const handleApplyImportPlan = (fresh: Word[], decisions: ImportDecision[], updateCategory = false) => {
    // ...
  };

  const handleUpdateExistingWord = (id: string, incoming: Word, updateCategory = false) => {
    // ...
  };

  const handleRestoreBackup = (backupState: AppState) => {
    // ...
  };

  return (
    <div className="min-h-screen bg-[#f6f7fb] dark:bg-[#12151c] text-[#1d2330] dark:text-[#eef1f6] flex flex-col font-sans transition-colors duration-200">
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
      />

      <div className="flex-1 max-w-6xl w-full mx-auto p-3.5 md:p-6 grid grid-cols-1 md:grid-cols-[230px_minmax(0,1fr)] gap-5 pb-24 md:pb-12">
        <Navigation currentTab={currentTab} onSelectTab={navigateToTab} />

        <main className="min-w-0">
          {activeExercise && (
            <div className={exerciseSuspended ? 'hidden' : ''}>
            <ExercisesView
              paused={exerciseSuspended || !!activeHelpTopic}
              words={state.words}
              settings={state.set}
              activeMode={activeExercise}
              practiceWordIds={practiceWordIds}
              dailyProgress={state.daily.d === today() ? state.daily : { d: today(), n: 0, r: 0 }}
              onSelectMode={mode => {
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
          {(!activeExercise || exerciseSuspended) && (
            <>
              {currentTab === 'dash' && (
                <DashboardView
                  state={state}
                  ignoredQualityIds={extData.ok || {}}
                  onNavigate={tab => {
                    if (tab === 'daily') {
                      setActiveExercise('daily');
                    } else if (tab === 'prac') {
                      navigateToTab('prac');
                    }
                  }}
                  onPracticeWords={(ids, intent = 'targeted') => {
                    // ... منطق تمرین واژگان هدفمند
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
      <footer className="border-t border-[#dde1ea] dark:border-[#333b4a] pt-5 pb-[calc(6.25rem+env(safe-area-inset-bottom))] md:pb-6 px-4 text-center text-xs text-[#475569] dark:text-[#c0c8d5] space-y-1 mt-auto">
        <p>
          نام محصول: <b>WörterBuch: واژه‌نامه آلمانی و فلش کارت</b>
        </p>
        <p>
          طراحی و برنامه‌نویسی: <b>پیمان صابری (Peyman Saberi)</b>
        </p>
        <p>
          تماس: <a href="mailto:peymansaberi20@gmail.com" dir="ltr" className="text-[#1f5fbf] dark:text-[#7fb0ff]">peymansaberi20@gmail.com</a>
        </p>
      </footer>

      {/* Modals */}
      <WordDetailModal
        word={selectedWord}
        onClose={() => setSelectedWord(null)}
        onEdit={handleEditWord}
        onDelete={handleDeleteWord}
        onImageChange={handleImageChange}
      />

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

      {/* PWA Exit Modal (Phase 2 Requirement) */}
      <PwaExitModal
        isOpen={isPwaExitModalOpen}
        onConfirm={() => {
          setIsPwaExitModalOpen(false);
          try {
            window.close();
          } catch (e) {
            // Fallback if browser blocks window.close
          }
        }}
        onCancel={() => setIsPwaExitModalOpen(false)}
      />

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
    </div>
  );
}
