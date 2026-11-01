/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
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
  clearAllVocabulary
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

const normalizeGermanDuplicateKey = (value: string) =>
  (value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de');

const isDuplicateVocabularyEntry = (candidate: Partial<Word>, words: Word[], excludeId?: string | null) => {
  const raw = normalizeGermanDuplicateKey(candidate.de || '');
  const candidateMatch = /^(der|die|das)\s+(.+)$/i.exec(raw);
  const de = normalizeGermanDuplicateKey(candidateMatch ? candidateMatch[2] : raw);
  const art = candidateMatch ? candidateMatch[1].toLowerCase() : normalizeGermanDuplicateKey(candidate.art || '');
  if (!de) return false;

  return words.some(word => {
    if (excludeId && word.id === excludeId) return false;
    const existingRaw = normalizeGermanDuplicateKey(word.de || '');
    const existingMatch = /^(der|die|das)\s+(.+)$/i.exec(existingRaw);
    const existingDe = normalizeGermanDuplicateKey(existingMatch ? existingMatch[2] : existingRaw);
    const existingArt = existingMatch ? existingMatch[1].toLowerCase() : normalizeGermanDuplicateKey(word.art || '');
    if (existingDe !== de) return false;
    return !art || !existingArt || existingArt === art;
  });
};

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [extData, setExtData] = useState(() => getExtData());
  const [currentTab, setCurrentTab] = useState<NavTab>('dash');
  const [historyStack, setHistoryStack] = useState<NavTab[]>([]);

  // Active exercise mode if inside practice
  const [activeExercise, setActiveExercise] = useState<ExerciseMode | null>(null);
  const [practiceWordIds, setPracticeWordIds] = useState<string[] | null>(null);

  // Active Modals
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const [editingWordId, setEditingWordId] = useState<string | null>(null);
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

    setCurrentTab(tab);
    setActiveExercise(null);
    setPracticeWordIds(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
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

  // Add / Edit Word. Duplicate checks here are a final guard in addition to the form-level check.
  const handleSaveWord = (wordData: Partial<Word>, isEdit: boolean) => {
    if (!isEdit && isDuplicateVocabularyEntry(wordData, state.words)) {
      showToast('این واژه قبلاً در کتابخانه وجود دارد؛ واژهٔ تکراری ذخیره نشد.', true);
      return;
    }

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
        const newWord = norm({
          ...wordData,
          added: Date.now()
        }) as Word;
        if (newWord) nextWords.push(newWord);
      }
      showToast(isEdit ? 'تغییرات واژه ذخیره شد.' : 'واژه با موفقیت به کتابخانه افزوده شد.');
      return { ...prev, words: nextWords };
    });
    setEditingWordId(null);
  };

  // Delete single word
  const handleDeleteWord = (word: Word) => {
    setState(prev => ({
      ...prev,
      words: prev.words.filter(w => w.id !== word.id)
    }));
    if (selectedWord?.id === word.id) setSelectedWord(null);
    showToast(`واژهٔ «${word.de}» حذف شد.`);
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

  const handleBatchDeleteWords = (wordIds: string[]) => {
    const idSet = new Set(wordIds);
    setState(prev => ({
      ...prev,
      words: prev.words.filter(w => !idSet.has(w.id))
    }));
    showToast(`${wordIds.length} واژه با موفقیت حذف شدند.`);
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
      let nextDaily = { ...prev.daily };

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
          const old = existing[idx];
          existing[idx] = {
            ...old,
            ...w,
            id: old.id,
            last: old.last,
            due: old.due,
            ivl: old.ivl,
            ease: old.ease,
            stage: old.stage,
            ok: old.ok,
            bad: old.bad,
            res: old.res
          };
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
          isWordManagerOpen
        }
      />

      {/* Main Container */}
      <div className="flex-1 max-w-6xl w-full mx-auto p-3.5 md:p-6 grid grid-cols-1 md:grid-cols-[230px_minmax(0,1fr)] gap-5 pb-24 md:pb-12">
        {/* Desktop Sidebar / Mobile Nav */}
        <Navigation currentTab={currentTab} onSelectTab={navigateToTab} />

        {/* Dynamic Tab View */}
        <main className="min-w-0">
          {activeExercise ? (
            <ExercisesView
              words={state.words}
              settings={state.set}
              activeMode={activeExercise}
              practiceWordIds={practiceWordIds}
              onSelectMode={setActiveExercise}
              onRecordResult={handleRecordResult}
              onOpenHelp={setActiveHelpTopic}
              onShowToast={showToast}
            />
          ) : (
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
                  onOpenQualityModal={() => setIsQualityModalOpen(true)}
                  onPracticeWords={ids => {
                    setPracticeWordIds(ids);
                    setActiveExercise('flash');
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
                  onOpenDuplicateDetector={() => setIsDuplicateModalOpen(true)}
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
      <footer className="border-t border-[#dde1ea] dark:border-[#333b4a] py-6 px-4 text-center text-xs text-[#5d6676] dark:text-[#a3adbd] space-y-1 mt-auto">
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
        onEdit={w => {
          setSelectedWord(null);
          setEditingWordId(w.id);
          setCurrentTab('lib');
          setActiveExercise(null);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onDelete={handleDeleteWord}
        onImageChange={handleImageChange}
      />

      {isQualityModalOpen && (
        <QualityControlModal
          words={state.words}
          ignoredIds={extData.ok || {}}
          onClose={() => setIsQualityModalOpen(false)}
          onEditWord={w => {
            setIsQualityModalOpen(false);
            setEditingWordId(w.id);
            setCurrentTab('lib');
            setActiveExercise(null);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          onIgnoreWord={handleIgnoreQualityWord}
          onDeleteWord={handleDeleteWord}
        />
      )}

      {isWordManagerOpen && (
        <WordManagerModal
          words={state.words}
          onClose={() => setIsWordManagerOpen(false)}
          onMoveWords={handleBatchMoveWords}
          onBatchDelete={handleBatchDeleteWords}
          onOpenDuplicateDetector={() => setIsDuplicateModalOpen(true)}
        />
      )}

      {isDuplicateModalOpen && (
        <DuplicateDetectorModal
          words={state.words}
          onClose={() => setIsDuplicateModalOpen(false)}
          onDeleteWord={handleDeleteWord}
          onMergeWords={handleMergeWords}
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

      {/* Floating Back Button at bottom-left */}
      {(historyStack.length > 0 || !!activeExercise) && (
        <button
          onClick={handleBack}
          aria-label="بازگشت"
          className="fixed left-4 bottom-20 md:bottom-6 z-40 bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-4 py-2.5 rounded-full font-bold text-sm md:text-base shadow-2xl flex items-center gap-1.5 hover:scale-105 active:scale-95 transition-all border border-white/20"
        >
          <span>↩</span>
          <span>بازگشت</span>
        </button>
      )}

      {/* Floating Notification Toast */}
      <Toast message={toastMsg} isError={toastIsError} />
    </div>
  );
}
