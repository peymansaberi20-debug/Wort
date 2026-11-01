import React, { useState, useMemo, useRef } from 'react';
import { Word } from '../types';
import { getCategories, matchCat, resolveCat, isLeech, fullWord } from '../utils/storage';
import { AIP, generateWithGemini, parseAI, aiToIMP, quickTranslateWithGemini } from '../utils/ai';
import { speak } from '../utils/audio';

// Match a vocabulary entry after Unicode normalization, whitespace cleanup, and case folding.
const duplicateKey = (value: string) =>
  (value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de');

const parseGermanEntry = (input: string, selectedArt = ''): { de: string; art: string } => {
  const value = duplicateKey(input);
  const match = /^(der|die|das)\s+(.+)$/i.exec(value);
  const chosenArt = duplicateKey(selectedArt);
  return {
    de: match ? duplicateKey(match[2]) : value,
    art: match ? match[1].toLowerCase() : (['der', 'die', 'das'].includes(chosenArt) ? chosenArt : '')
  };
};

const findExistingDuplicate = (input: string, selectedArt: string, words: Word[], excludeId?: string | null): Word | null => {
  const target = parseGermanEntry(input, selectedArt);
  if (!target.de) return null;
  return words.find(word => {
    if (excludeId && word.id === excludeId) return false;
    const existing = parseGermanEntry(word.de, word.art);
    if (existing.de !== target.de) return false;
    return !target.art || !existing.art || existing.art === target.art;
  }) || null;
};

interface VocabularyViewProps {
  words: Word[];
  editingWordId: string | null;
  onSetEditingWordId: (id: string | null) => void;
  onSaveWord: (wordData: Partial<Word>, isEdit: boolean) => void;
  onDeleteWord: (word: Word) => void;
  onRenameCategory: (oldCat: string, newCat: string) => void;
  onDeleteCategory: (cat: string) => void;
  onSelectWord: (word: Word) => void;
  onOpenWordManager: () => void;
  onOpenDuplicateDetector?: () => void;
  onOpenHelp: (topic: string) => void;
  onShowToast: (msg: string, isErr?: boolean) => void;
}

export const VocabularyView: React.FC<VocabularyViewProps> = ({
  words,
  editingWordId,
  onSetEditingWordId,
  onSaveWord,
  onDeleteWord,
  onRenameCategory,
  onDeleteCategory,
  onSelectWord,
  onOpenWordManager,
  onOpenDuplicateDetector,
  onOpenHelp,
  onShowToast
}) => {
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterArt, setFilterArt] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState<'de' | 'added' | 'hard' | 'due'>('de');

  // Category open accordion
  const [openCat, setOpenCat] = useState<string | null>(null);
  const [collapsedInSearch, setCollapsedInSearch] = useState<Set<string>>(new Set());

  // Translation visibility map for compact word previews
  const [visFa, setVisFa] = useState<Record<string, boolean>>({});

  // Add / Edit form state
  const isEditing = !!editingWordId;
  const editingWord = isEditing ? words.find(w => w.id === editingWordId) : null;
  const [isFormOpen, setIsFormOpen] = useState(isEditing);

  // Form Fields
  const [formDe, setFormDe] = useState(editingWord?.de || '');
  const [formArt, setFormArt] = useState(editingWord?.art || '');
  const [formFa, setFormFa] = useState(editingWord?.fa || '');
  const [formCat, setFormCat] = useState(editingWord?.cat || '');
  const [newCatInput, setNewCatInput] = useState('');
  const [formSyn, setFormSyn] = useState(editingWord?.syn || '');
  const [formSynFa, setFormSynFa] = useState(editingWord?.synFa || '');
  const [formAnt, setFormAnt] = useState(editingWord?.ant || '');
  const [formAntFa, setFormAntFa] = useState(editingWord?.antFa || '');
  const [formPl, setFormPl] = useState(editingWord?.pl || '');
  const [formPos, setFormPos] = useState(editingWord?.pos || 'اسم');
  const [formLvl, setFormLvl] = useState(editingWord?.lvl || 'A1');
  const [formEx, setFormEx] = useState(editingWord?.ex || '');
  const [formExFa, setFormExFa] = useState(editingWord?.exFa || '');
  const [formEx2, setFormEx2] = useState(editingWord?.ex2 || '');
  const [formEx2Fa, setFormEx2Fa] = useState(editingWord?.ex2Fa || '');
  const [formCloze, setFormCloze] = useState(editingWord?.cloze || '');
  const [formAns, setFormAns] = useState(editingWord?.ans || '');
  const [formConj, setFormConj] = useState(editingWord?.conj || '');
  const [formPrat, setFormPrat] = useState(editingWord?.prat || '');
  const [formPerf, setFormPerf] = useState(editingWord?.perf || '');
  const [formKomparativ, setFormKomparativ] = useState(editingWord?.komparativ || '');
  const [formSuperlativ, setFormSuperlativ] = useState(editingWord?.superlativ || '');
  const [formImperativDu, setFormImperativDu] = useState(editingWord?.imperativDu || '');
  const [formImperativIhr, setFormImperativIhr] = useState(editingWord?.imperativIhr || '');
  const [formImperativSie, setFormImperativSie] = useState(editingWord?.imperativSie || '');
  const [formSep, setFormSep] = useState(editingWord?.sep || '');
  const [formTags, setFormTags] = useState(editingWord?.tags || '');
  const [formNotes, setFormNotes] = useState(editingWord?.notes || '');
  const [formImg, setFormImg] = useState(editingWord?.img || '');

  // AI loading in form
  const [aiLoading, setAiLoading] = useState(false);
  const [translateLoading, setTranslateLoading] = useState(false);
  const [pasteAiJson, setPasteAiJson] = useState('');
  const [duplicateWord, setDuplicateWord] = useState<Word | null>(null);
  const wordsRef = useRef(words);
  const aiOperationRef = useRef(false);
  wordsRef.current = words;

  const checkForDuplicate = (input = formDe, art = formArt): Word | null => {
    const duplicate = findExistingDuplicate(input, art, wordsRef.current, editingWordId);
    setDuplicateWord(duplicate);
    return duplicate;
  };

  // Categories list
  const categories = useMemo(() => getCategories(words), [words]);

  // When editingWord changes, sync form
  React.useEffect(() => {
    if (editingWord) {
      setFormDe(editingWord.de || '');
      setFormArt(editingWord.art || '');
      setFormFa(editingWord.fa || '');
      setFormCat(editingWord.cat || '');
      setFormSyn(editingWord.syn || '');
      setFormSynFa(editingWord.synFa || '');
      setFormAnt(editingWord.ant || '');
      setFormAntFa(editingWord.antFa || '');
      setFormPl(editingWord.pl || '');
      setFormPos(editingWord.pos || 'اسم');
      setFormLvl(editingWord.lvl || 'A1');
      setFormEx(editingWord.ex || '');
      setFormExFa(editingWord.exFa || '');
      setFormEx2(editingWord.ex2 || '');
      setFormEx2Fa(editingWord.ex2Fa || '');
      setFormCloze(editingWord.cloze || '');
      setFormAns(editingWord.ans || '');
      setFormConj(editingWord.conj || '');
      setFormPrat(editingWord.prat || '');
      setFormPerf(editingWord.perf || '');
      setFormKomparativ(editingWord.komparativ || '');
      setFormSuperlativ(editingWord.superlativ || '');
      setFormImperativDu(editingWord.imperativDu || '');
      setFormImperativIhr(editingWord.imperativIhr || '');
      setFormImperativSie(editingWord.imperativSie || '');
      setFormSep(editingWord.sep || '');
      setFormTags(editingWord.tags || '');
      setFormNotes(editingWord.notes || '');
      setFormImg(editingWord.img || '');
      setIsFormOpen(true);
    }
  }, [editingWord]);

  // Filtered and sorted words
  const filteredWords = useMemo(() => {
    const n = Date.now();
    return words
      .filter(w => {
        const matchesQuery =
          !searchQuery.trim() ||
          (w.de + ' ' + w.fa).toLowerCase().includes(searchQuery.trim().toLowerCase());
        const matchesArt = !filterArt || w.art === filterArt;
        const matchesStatus =
          filterStatus === 'all' ||
          (filterStatus === 'new' ? !w.last :
          filterStatus === 'due' ? w.last && w.due <= n :
          filterStatus === 'hard' ? isLeech(w) :
          w.last);
        return matchesQuery && matchesArt && matchesStatus;
      })
      .sort((a, b) => {
        if (sortBy === 'de') return a.de.localeCompare(b.de, 'de');
        if (sortBy === 'added') return b.added - a.added;
        if (sortBy === 'hard') return b.bad - a.bad;
        return a.due - b.due;
      });
  }, [words, searchQuery, filterArt, filterStatus, sortBy]);

  // Group by category
  const wordsByCategory = useMemo(() => {
    const map = new Map<string, Word[]>();
    filteredWords.forEach(w => {
      const c = w.cat || 'بدون دسته';
      if (!map.has(c)) map.set(c, []);
      map.get(c)!.push(w);
    });
    return map;
  }, [filteredWords]);

  const categoryNames = useMemo(() => {
    return Array.from(wordsByCategory.keys()).sort((a, b) => {
      if (a === 'بدون دسته') return 1;
      if (b === 'بدون دسته') return -1;
      return a.localeCompare(b, 'fa');
    });
  }, [wordsByCategory]);

  const toggleFaVisibility = (wordId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setVisFa(prev => ({ ...prev, [wordId]: !prev[wordId] }));
  };

  const resetForm = () => {
    onSetEditingWordId(null);
    setFormDe('');
    setFormArt('');
    setFormFa('');
    setFormCat('');
    setNewCatInput('');
    setFormSyn('');
    setFormSynFa('');
    setFormAnt('');
    setFormAntFa('');
    setFormPl('');
    setFormPos('اسم');
    setFormLvl('A1');
    setFormEx('');
    setFormExFa('');
    setFormEx2('');
    setFormEx2Fa('');
    setFormCloze('');
    setFormAns('');
    setFormConj('');
    setFormPrat('');
    setFormPerf('');
    setFormKomparativ('');
    setFormSuperlativ('');
    setFormImperativDu('');
    setFormImperativIhr('');
    setFormImperativSie('');
    setFormSep('');
    setFormTags('');
    setFormNotes('');
    setFormImg('');
    setIsFormOpen(false);
  };

  const handleAiAutoFill = async () => {
    if (aiOperationRef.current) return;
    if (!formDe.trim()) {
      onShowToast('ابتدا کلمهٔ آلمانی را بنویسید.', true);
      return;
    }
    if (checkForDuplicate()) {
      onShowToast('این واژه از قبل در کتابخانه وجود دارد؛ هوش مصنوعی اجرا نشد.', true);
      return;
    }
    aiOperationRef.current = true;
    setAiLoading(true);
    try {
      const prompt = AIP(formDe.trim(), wordsRef.current, formCat && formCat !== '__new' ? formCat : undefined);
      const resText = await generateWithGemini(prompt, { timeoutMs: 25000 });
      const duplicateAfterAi = checkForDuplicate();
      if (duplicateAfterAi) {
        onShowToast('این واژه در حین پردازش به کتابخانه اضافه شده است؛ اطلاعات تولیدشده اعمال نشد.', true);
        return;
      }
      const parsed = parseAI(resText);
      const { ws, errs } = aiToIMP(parsed, wordsRef.current, formCat && formCat !== '__new' ? formCat : undefined);
      if (ws.length > 0) {
        const item = ws[0];
        if (item.art) setFormArt(item.art);
        if (item.fa) setFormFa(item.fa);
        if (item.syn) setFormSyn(item.syn);
        if (item.synFa) setFormSynFa(item.synFa);
        if (item.ant) setFormAnt(item.ant);
        if (item.antFa) setFormAntFa(item.antFa);
        if (item.pl) setFormPl(item.pl);
        if (item.pos) setFormPos(item.pos);
        if (item.lvl) setFormLvl(item.lvl);
        if (item.ex) setFormEx(item.ex);
        if (item.exFa) setFormExFa(item.exFa);
        if (item.ex2) setFormEx2(item.ex2);
        if (item.ex2Fa) setFormEx2Fa(item.ex2Fa);
        if (item.cloze) setFormCloze(item.cloze);
        if (item.ans) setFormAns(item.ans);
        if (item.conj) setFormConj(item.conj);
        if (item.prat) setFormPrat(item.prat);
        if (item.perf) setFormPerf(item.perf);
        if (item.komparativ) setFormKomparativ(item.komparativ);
        if (item.superlativ) setFormSuperlativ(item.superlativ);
        if (item.imperativDu) setFormImperativDu(item.imperativDu);
        if (item.imperativIhr) setFormImperativIhr(item.imperativIhr);
        if (item.imperativSie) setFormImperativSie(item.imperativSie);
        if (item.sep) setFormSep(item.sep);
        if (item.notes) setFormNotes(item.notes);
        if (item.cat && !formCat) setFormCat(item.cat);
        onShowToast(`پروفایل کامل ۲۲ پارامتری با هوش مصنوعی تکمیل شد.`);
      } else if (errs.length > 0) {
        onShowToast(errs[0], true);
      }
    } catch (err: any) {
      onShowToast(err.message || 'خطا در تکمیل با هوش مصنوعی', true);
    } finally {
      aiOperationRef.current = false;
      setAiLoading(false);
    }
  };

  const handleQuickTranslate = async () => {
    if (aiOperationRef.current) return;
    if (!formDe.trim()) {
      onShowToast('ابتدا کلمهٔ آلمانی را بنویسید.', true);
      return;
    }
    if (checkForDuplicate()) {
      onShowToast('این واژه از قبل در کتابخانه وجود دارد؛ ترجمهٔ هوش مصنوعی اجرا نشد.', true);
      return;
    }
    aiOperationRef.current = true;
    setTranslateLoading(true);
    try {
      const res = await quickTranslateWithGemini(formDe.trim());
      const duplicateAfterTranslate = checkForDuplicate();
      if (duplicateAfterTranslate) {
        onShowToast('این واژه در حین ترجمه به کتابخانه اضافه شده است؛ ترجمه اعمال نشد.', true);
        return;
      }
      if (res && res.fa) {
        setFormFa(res.fa);
        if (res.art && !formArt) setFormArt(res.art.toLowerCase());
        if (res.pos && !formPos) setFormPos(res.pos);
        if (res.lvl && !formLvl) setFormLvl(res.lvl);
        onShowToast(`ترجمهٔ سریع انجام شد: ${res.fa}`);
      } else {
        onShowToast('ترجمه‌ای دریافت نشد. لطفاً دوباره امتحان کنید.', true);
      }
    } catch (err: any) {
      onShowToast(err.message || 'خطا در ترجمه سریع با هوش مصنوعی', true);
    } finally {
      aiOperationRef.current = false;
      setTranslateLoading(false);
    }
  };

  const handleApplyPastedJson = () => {
    if (!pasteAiJson.trim()) return;
    try {
      const parsed = parseAI(pasteAiJson);
      const { ws, errs } = aiToIMP(parsed, words);
      if (errs.length > 0) {
        onShowToast(errs[0], true);
        return;
      }
      if (ws.length > 0) {
        const item = ws[0];
        if (item.de) setFormDe(item.de);
        if (item.art) setFormArt(item.art);
        if (item.fa) setFormFa(item.fa);
        if (item.cat) setFormCat(item.cat);
        if (item.syn) setFormSyn(item.syn);
        if (item.synFa) setFormSynFa(item.synFa);
        if (item.ant) setFormAnt(item.ant);
        if (item.antFa) setFormAntFa(item.antFa);
        if (item.pl) setFormPl(item.pl);
        if (item.pos) setFormPos(item.pos);
        if (item.lvl) setFormLvl(item.lvl);
        if (item.ex) setFormEx(item.ex);
        if (item.exFa) setFormExFa(item.exFa);
        if (item.ex2) setFormEx2(item.ex2);
        if (item.ex2Fa) setFormEx2Fa(item.ex2Fa);
        if (item.cloze) setFormCloze(item.cloze);
        if (item.ans) setFormAns(item.ans);
        if (item.conj) setFormConj(item.conj);
        if (item.prat) setFormPrat(item.prat);
        if (item.perf) setFormPerf(item.perf);
        if (item.komparativ) setFormKomparativ(item.komparativ);
        if (item.superlativ) setFormSuperlativ(item.superlativ);
        if (item.imperativDu) setFormImperativDu(item.imperativDu);
        if (item.imperativIhr) setFormImperativIhr(item.imperativIhr);
        if (item.imperativSie) setFormImperativSie(item.imperativSie);
        if (item.sep) setFormSep(item.sep);
        if (item.notes) setFormNotes(item.notes);
        setPasteAiJson('');
        onShowToast('اطلاعات JSON وارد شد.');
      }
    } catch (e: any) {
      onShowToast('قالب JSON معتبر نیست.', true);
    }
  };

  const handleCopyPrompt = async () => {
    if (!formDe.trim()) {
      onShowToast('ابتدا کلمهٔ آلمانی را بنویسید.', true);
      return;
    }
    try {
      await navigator.clipboard.writeText(AIP(formDe.trim(), words));
      onShowToast('دستور با موفقیت کپی شد. می‌توانید در ChatGPT یا Claude بچسبانید.');
    } catch (e) {
      onShowToast('کپی در کلیپ‌بورد ممکن نشد.', true);
    }
  };

  const handleSave = () => {
    if (!formDe.trim() || !formFa.trim()) {
      onShowToast('کلمهٔ آلمانی و ترجمهٔ فارسی الزامی هستند.', true);
      return;
    }

    if (checkForDuplicate()) {
      onShowToast('این واژه قبلاً ثبت شده است. برای جلوگیری از ثبت تکراری، ذخیره انجام نشد.', true);
      return;
    }

    let finalCat = formCat;
    if (formCat === '__new') {
      finalCat = resolveCat(newCatInput, words);
    }

    onSaveWord(
      {
        de: formDe.trim(),
        art: formArt,
        fa: formFa.trim(),
        cat: finalCat,
        syn: formSyn.trim(),
        synFa: formSynFa.trim(),
        ant: formAnt.trim(),
        antFa: formAntFa.trim(),
        pl: formPl.trim(),
        pos: formPos.trim(),
        lvl: formLvl.trim(),
        ex: formEx.trim(),
        exFa: formExFa.trim(),
        ex2: formEx2.trim(),
        ex2Fa: formEx2Fa.trim(),
        cloze: formCloze.trim(),
        ans: formAns.trim(),
        conj: formConj.trim(),
        prat: formPrat.trim(),
        perf: formPerf.trim(),
        komparativ: formKomparativ.trim(),
        superlativ: formSuperlativ.trim(),
        imperativDu: formImperativDu.trim(),
        imperativIhr: formImperativIhr.trim(),
        imperativSie: formImperativSie.trim(),
        sep: formSep.trim(),
        tags: formTags.trim(),
        notes: formNotes.trim(),
        img: formImg
      },
      isEditing
    );
    setDuplicateWord(null);
    resetForm();
  };

  return (
    <div className="space-y-4 text-right">
      {/* Add / Edit Word Form Accordion */}
      {isFormOpen && (
        <div className="bg-white dark:bg-[#1b2029] border-2 border-blue-200 dark:border-blue-900 rounded-3xl p-5 shadow-sm space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between border-b pb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">{isEditing ? '✏️' : '➕'}</span>
              <h3 className="font-bold text-base md:text-lg">
                {isEditing ? `ویرایش واژه: ${editingWord?.de}` : 'افزودن واژهٔ جدید'}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {/* Fulfills Request #20: Help button for Add Word */}
              <button
                onClick={() => onOpenHelp('add_word')}
                className="text-xs bg-blue-50 text-[#1f5fbf] hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 px-2.5 py-1 rounded-xl font-bold transition flex items-center gap-1"
              >
                ❓ راهنما
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="w-8 h-8 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-lg font-bold transition flex items-center justify-center"
                title="انصراف"
                aria-label="انصراف"
              >
                ×
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-3 py-2 rounded-xl text-xs font-bold shadow-xs hover:opacity-95 transition"
              >
                {isEditing ? 'ذخیره' : 'افزودن'}
              </button>
            </div>
          </div>

          {/*
            Fulfills User Request #25:
            "اون باکس « کلمه آلمانی» رو بیار بالا گزینه اول باشه و bold باشه،
            که کاربر وارد ک شد سردرگم نباشه و بدونه اول باید کلمه رو اونجا بزنه ."
          */}
          <div className="bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-2xl p-4">
            <label className="block text-sm font-extrabold text-[#1f5fbf] dark:text-[#7fb0ff] mb-1.5">
              کلمهٔ آلمانی (گام اول - الزامی):
            </label>
            <input
              type="text"
              dir="ltr"
              placeholder="z.B. Entscheidung یا gehen یا schön"
              value={formDe}
              onChange={e => { setFormDe(e.target.value); setDuplicateWord(null); }}
              className="w-full bg-white dark:bg-[#141923] border-2 border-[#1f5fbf] dark:border-[#7fb0ff] rounded-xl px-3.5 py-2.5 font-bold text-base md:text-lg outline-none font-sans"
            />
          </div>

          {duplicateWord && (
            <div role="alert" className="rounded-2xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-3">
              <div className="font-extrabold text-amber-900 dark:text-amber-200">
                ⚠️ این واژه از قبل در کتابخانه وجود دارد.
              </div>
              <div className="text-sm text-amber-900 dark:text-amber-100">
                <span dir="ltr" className="font-bold">{duplicateWord.art ? `${duplicateWord.art} ` : ''}{duplicateWord.de}</span>
                {duplicateWord.fa ? <span> — {duplicateWord.fa}</span> : null}
                <div className="mt-1 text-xs opacity-80">برای جلوگیری از ثبت تکراری، تکمیل هوش مصنوعی و ذخیره متوقف شده‌اند. متن واردشده پاک نمی‌شود.</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => { const existing = duplicateWord; setDuplicateWord(null); onSelectWord(existing); }}
                  className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white px-3 py-2 text-xs font-bold transition"
                >
                  مشاهدهٔ پروفایل واژهٔ موجود
                </button>
                <button
                  type="button"
                  onClick={() => setDuplicateWord(null)}
                  className="rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold transition"
                >
                  بستن هشدار و ادامهٔ ویرایش
                </button>
              </div>
            </div>
          )}

          {/* AI Helper Bar */}
          <div className="bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleAiAutoFill}
                disabled={aiLoading || translateLoading || !formDe.trim()}
                className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-3.5 py-2 rounded-xl text-xs md:text-sm font-bold shadow-xs hover:opacity-95 disabled:opacity-40 transition flex items-center gap-1.5"
              >
                {aiLoading ? (
                  <>
                    <span className="inline-block animate-spin">⏳</span>
                    <span>در حال تکمیل ۲۲ فیلد...</span>
                  </>
                ) : (
                  <span>✨ تکمیل خودکار کل واژه (۲۲ پارامتر)</span>
                )}
              </button>
              <button
                type="button"
                onClick={handleQuickTranslate}
                disabled={translateLoading || aiLoading || !formDe.trim()}
                className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-xl text-xs md:text-sm font-bold shadow-xs disabled:opacity-40 transition flex items-center gap-1"
              >
                {translateLoading ? (
                  <>
                    <span className="inline-block animate-spin">⚡</span>
                    <span>در حال ترجمه...</span>
                  </>
                ) : (
                  <span>⚡ ترجمه و آرتیکل سریع (~۱ ثانیه)</span>
                )}
              </button>
              <button
                type="button"
                onClick={handleCopyPrompt}
                disabled={!formDe.trim()}
                className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] hover:bg-slate-100 dark:hover:bg-slate-800 px-3 py-2 rounded-xl text-xs font-medium transition disabled:opacity-40"
              >
                📋 کپی دستور هوش مصنوعی
              </button>
            </div>

            {/*
              Fulfills User Request #26:
              "باکس «خروجی هوش مصنوعی را اینجا بچسبانید رو کوچیک کن الکی فضا گرفته یک خطش کن"
            */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                dir="ltr"
                placeholder="خروجی JSON هوش مصنوعی را اینجا بچسبانید (یک خط)..."
                value={pasteAiJson}
                onChange={e => setPasteAiJson(e.target.value)}
                className="flex-1 bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-1.5 text-xs outline-none font-mono"
              />
              <button
                type="button"
                onClick={handleApplyPastedJson}
                disabled={!pasteAiJson.trim()}
                className="bg-[#1f5fbf] text-white px-3 py-1.5 rounded-xl text-xs font-bold disabled:opacity-40 transition flex-shrink-0"
              >
                اعمال JSON
              </button>
            </div>
          </div>

          {/* Form Fields Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block font-bold mb-1">آرتیکل (اسم):</label>
              <select
                value={formArt}
                onChange={e => setFormArt(e.target.value)}
                className="w-full bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 outline-none"
              >
                <option value="">بدون آرتیکل</option>
                <option value="der">der</option>
                <option value="die">die</option>
                <option value="das">das</option>
              </select>
            </div>

            <div>
              <label className="block font-bold mb-1">دستهٔ واژه:</label>
              <select
                value={formCat}
                onChange={e => setFormCat(e.target.value)}
                className="w-full bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 outline-none"
              >
                <option value="">— بدون دسته —</option>
                {categories.map(([c, n]) => (
                  <option key={c} value={c}>
                    {c} ({n})
                  </option>
                ))}
                <option value="__new">➕ دستهٔ جدید…</option>
              </select>
              {formCat === '__new' && (
                <input
                  type="text"
                  placeholder="نام دسته جدید..."
                  value={newCatInput}
                  onChange={e => setNewCatInput(e.target.value)}
                  className="mt-1.5 w-full bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-1.5 outline-none"
                />
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold">ترجمهٔ فارسی (الزامی):</label>
                <button
                  type="button"
                  onClick={handleQuickTranslate}
                  disabled={translateLoading || !formDe.trim()}
                  className="text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 px-2 py-0.5 rounded-lg border border-amber-200 dark:border-amber-800 disabled:opacity-40 transition flex items-center gap-1"
                >
                  {translateLoading ? '⏳...' : '⚡ ترجمه سریع'}
                </button>
              </div>
              <input
                type="text"
                dir="rtl"
                placeholder="معنی دقیق فارسی"
                value={formFa}
                onChange={e => setFormFa(e.target.value)}
                className="w-full bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 outline-none"
              />
            </div>

            <div>
              <label className="block font-bold mb-1">مترادف آلمانی:</label>
              <input
                type="text"
                dir="ltr"
                value={formSyn}
                onChange={e => setFormSyn(e.target.value)}
                className="w-full bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 outline-none"
              />
            </div>

            <div>
              <label className="block font-bold mb-1">ترجمهٔ مترادف:</label>
              <input
                type="text"
                dir="rtl"
                value={formSynFa}
                onChange={e => setFormSynFa(e.target.value)}
                className="w-full bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 outline-none"
              />
            </div>

            <div>
              <label className="block font-bold mb-1">متضاد آلمانی:</label>
              <input
                type="text"
                dir="ltr"
                value={formAnt}
                onChange={e => setFormAnt(e.target.value)}
                className="w-full bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 outline-none"
              />
            </div>

            <div>
              <label className="block font-bold mb-1">شکل جمع (اسامی):</label>
              <input
                type="text"
                dir="ltr"
                value={formPl}
                onChange={e => setFormPl(e.target.value)}
                className="w-full bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 outline-none"
              />
            </div>

            <div>
              <label className="block font-bold mb-1">نوع کلمه (Part of Speech):</label>
              <input
                type="text"
                placeholder="اسم، فعل، صفت، قید..."
                value={formPos}
                onChange={e => setFormPos(e.target.value)}
                className="w-full bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 outline-none"
              />
            </div>

            <div>
              <label className="block font-bold mb-1">سطح (CEFR):</label>
              <select
                value={formLvl}
                onChange={e => setFormLvl(e.target.value)}
                className="w-full bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 outline-none"
              >
                <option value="A1">A1</option>
                <option value="A2">A2</option>
                <option value="B1">B1</option>
                <option value="B2">B2</option>
                <option value="C1">C1</option>
                <option value="C2">C2</option>
              </select>
            </div>
          </div>

          {( /(صفت|adjektiv|adjective)/i.test(formPos) ) && (
           <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
             <div><label className="block font-bold mb-1">Komparativ (صفت تفضیلی):</label><input type="text" dir="ltr" value={formKomparativ} onChange={e => setFormKomparativ(e.target.value)} placeholder="z. B. größer" className="w-full bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 outline-none" /></div>
             <div><label className="block font-bold mb-1">Superlativ (عالی‌ترین):</label><input type="text" dir="ltr" value={formSuperlativ} onChange={e => setFormSuperlativ(e.target.value)} placeholder="z. B. am größten / der größte" className="w-full bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 outline-none" /></div>
           </div>
         )}

         {/* Example sentences */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
            <div>
              <label className="block font-bold mb-1">جملهٔ مثال ۱ (آلمانی):</label>
              <input
                type="text"
                dir="ltr"
                value={formEx}
                onChange={e => setFormEx(e.target.value)}
                className="w-full bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 outline-none"
              />
            </div>
            <div>
              <label className="block font-bold mb-1">ترجمهٔ مثال ۱ (فارسی):</label>
              <input
                type="text"
                dir="rtl"
                value={formExFa}
                onChange={e => setFormExFa(e.target.value)}
                className="w-full bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 outline-none"
              />
            </div>
          </div>

          {/* Second example */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
            <div>
              <label className="block font-bold mb-1">جملهٔ مثال ۲ (آلمانی):</label>
              <input
                type="text"
                dir="ltr"
                value={formEx2}
                onChange={e => setFormEx2(e.target.value)}
                className="w-full bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 outline-none"
              />
            </div>
            <div>
              <label className="block font-bold mb-1">ترجمهٔ مثال ۲ (فارسی):</label>
              <input
                type="text"
                dir="rtl"
                value={formEx2Fa}
                onChange={e => setFormEx2Fa(e.target.value)}
                className="w-full bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 outline-none"
              />
            </div>
          </div>

          {/* Cloze & Grammar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
            <div>
              <label className="block font-bold mb-1">جمله جای‌خالی (با _____):</label>
              <input
                type="text"
                dir="ltr"
                value={formCloze}
                onChange={e => setFormCloze(e.target.value)}
                className="w-full bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 outline-none"
              />
            </div>
            <div>
              <label className="block font-bold mb-1">پاسخ جای‌خالی:</label>
              <input
                type="text"
                dir="ltr"
                value={formAns}
                onChange={e => setFormAns(e.target.value)}
                className="w-full bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 outline-none"
              />
            </div>
          </div>

          {/* Verb Forms */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs pt-1">
            <div>
              <label className="block font-bold mb-1">صرف زمان حال (۶ ضمیر با |):</label>
              <input
                type="text"
                dir="ltr"
                placeholder="gehe|gehst|geht|..."
                value={formConj}
                onChange={e => setFormConj(e.target.value)}
                className="w-full bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 outline-none"
              />
            </div>
            <div>
              <label className="block font-bold mb-1">Präteritum (er/sie/es):</label>
              <input
                type="text"
                dir="ltr"
                value={formPrat}
                onChange={e => setFormPrat(e.target.value)}
                className="w-full bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 outline-none"
              />
            </div>
            <div>
              <label className="block font-bold mb-1">Perfekt:</label>
              <input
                type="text"
                dir="ltr"
                placeholder="hat gemacht یا ist gegangen"
                value={formPerf}
                onChange={e => setFormPerf(e.target.value)}
                className="w-full bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 outline-none"
              />
            </div>
            <div>
              <label className="block font-bold mb-1">پیشوند جداشدنی:</label>
              <input
                type="text"
                dir="ltr"
                placeholder="auf / an / ein..."
                value={formSep}
                onChange={e => setFormSep(e.target.value)}
                className="w-full bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 outline-none"
              />
            </div>
          </div>

          {/(فعل|verb)/i.test(formPos) && (
           <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
             <div><label className="block font-bold mb-1">Imperativ du (تو):</label><input type="text" dir="ltr" value={formImperativDu} onChange={e => setFormImperativDu(e.target.value)} placeholder="z. B. mach! / fahr!" className="w-full bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 outline-none" /></div>
             <div><label className="block font-bold mb-1">Imperativ ihr (شما، جمع غیررسمی):</label><input type="text" dir="ltr" value={formImperativIhr} onChange={e => setFormImperativIhr(e.target.value)} placeholder="z. B. macht! / fahrt!" className="w-full bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 outline-none" /></div>
             <div><label className="block font-bold mb-1">Imperativ Sie (شما، رسمی):</label><input type="text" dir="ltr" value={formImperativSie} onChange={e => setFormImperativSie(e.target.value)} placeholder="z. B. machen Sie! / fahren Sie!" className="w-full bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2 outline-none" /></div>
           </div>
         )}

         {/* Notes */}
          <div className="text-xs">
            <label className="block font-bold mb-1">یادداشت / یادیار / خانواده واژگانی و ساختار:</label>
            <textarea
              dir="rtl"
              rows={3}
              placeholder="خانواده واژگانی:...&#10;ساختار:...&#10;نکته:..."
              value={formNotes}
              onChange={e => setFormNotes(e.target.value)}
              className="w-full bg-white dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl p-3 outline-none leading-relaxed"
            />
          </div>

          {/* Form Submit & Cancel Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            <button
              type="button"
              onClick={resetForm}
              className="bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl text-xs md:text-sm font-semibold transition"
            >
              انصراف
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-6 py-2 rounded-xl text-xs md:text-sm font-bold shadow-xs hover:opacity-95 transition"
            >
              {isEditing ? 'ذخیره تغییرات' : 'افزودن واژه'}
            </button>
          </div>
        </div>
      )}


      {/*
        Fulfills User Request #2:
        "در قسمت واژگان ، جستجو توی یک خط مستقل بیاد
        و سه تا تنظیم جستجو کنار هم و تو یک خط زیر همون جستجو قرار بگیرن"
      */}
      <div className="space-y-2.5 bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 shadow-xs">
        {/* Line 1: Search input by itself */}
        <div>
          <input
            type="text"
            placeholder="🔍 جستجو در واژگان (کلمه آلمانی یا معنی فارسی)..."
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              setCollapsedInSearch(new Set());
            }}
            className="w-full bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3.5 py-2.5 text-base outline-none focus:border-[#1f5fbf]"
          />
        </div>

        {/* Line 2: 3 search filters side-by-side in one line */}
        <div className="grid grid-cols-3 gap-2">
          {/* 1. Article Filter */}
          <select
            value={filterArt}
            onChange={e => setFilterArt(e.target.value)}
            className="w-full bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-2.5 py-2 text-xs outline-none"
          >
            <option value="">آرتیکل: همه</option>
            <option value="der">der</option>
            <option value="die">die</option>
            <option value="das">das</option>
          </select>

          {/* 2. Status Filter */}
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="w-full bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-2.5 py-2 text-xs outline-none"
          >
            <option value="all">وضعیت: همه</option>
            <option value="new">جدید</option>
            <option value="due">سررسید مرور</option>
            <option value="learn">در حال یادگیری</option>
            <option value="hard">سخت 🩸</option>
          </select>

          {/* 3. Sort Order */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
            className="w-full bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-2.5 py-2 text-xs outline-none"
          >
            <option value="de">مرتب‌سازی: الفبا</option>
            <option value="added">تاریخ افزودن</option>
            <option value="hard">سختی</option>
            <option value="due">مرور بعدی</option>
          </select>
        </div>
      </div>

      {/* Primary actions: equal-width, single-row buttons with a shared pale-blue style */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => {
            if (isFormOpen && isEditing) resetForm();
            else setIsFormOpen(!isFormOpen);
          }}
          className="min-w-0 min-h-[48px] w-full rounded-xl border border-sky-200 dark:border-slate-700 bg-sky-50 dark:bg-slate-800/80 px-1 sm:px-3 py-2 text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 hover:bg-sky-100 dark:hover:bg-slate-700 transition flex items-center justify-center gap-1 sm:gap-2"
        >
          <span aria-hidden="true">{isFormOpen ? '▲' : '➕'}</span>
          <span className="truncate">{isFormOpen ? 'بستن فرم' : 'افزودن واژهٔ جدید'}</span>
        </button>
        <button
          type="button"
          onClick={onOpenWordManager}
          className="min-w-0 min-h-[48px] w-full rounded-xl border border-sky-200 dark:border-slate-700 bg-sky-50 dark:bg-slate-800/80 px-1 sm:px-3 py-2 text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 hover:bg-sky-100 dark:hover:bg-slate-700 transition flex items-center justify-center gap-1 sm:gap-2"
        >
          <span aria-hidden="true">🗂</span>
          <span className="truncate">مدیریت گروهی</span>
        </button>
        <button
          type="button"
          onClick={() => {
            const categoryManager = document.getElementById('category-manager-details') as HTMLDetailsElement | null;
            if (categoryManager) {
              categoryManager.open = true;
              categoryManager.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }}
          className="min-w-0 min-h-[48px] w-full rounded-xl border border-sky-200 dark:border-slate-700 bg-sky-50 dark:bg-slate-800/80 px-1 sm:px-3 py-2 text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 hover:bg-sky-100 dark:hover:bg-slate-700 transition flex items-center justify-center gap-1 sm:gap-2"
        >
          <span aria-hidden="true">📁</span>
          <span className="truncate">مدیریت دسته</span>
        </button>
      </div>

      {/* Category Management Collapsible */}
      <details id="category-manager-details" className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 shadow-xs">
        <summary className="font-bold text-sm cursor-pointer select-none flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>🗂 مدیریت دسته‌ها ({categories.length})</span>
          </div>
          {/* Fulfills Request #20: Help for Category Management */}
          <button
            type="button"
            onClick={e => {
              e.preventDefault();
              onOpenHelp('cat_mgr');
            }}
            className="text-xs bg-blue-50 text-[#1f5fbf] hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 px-2 py-0.5 rounded-lg font-bold"
          >
            ❓ راهنما
          </button>
        </summary>

        {/*
          Fulfills User Request #23:
          "در قسمت مدیریت دسته ها ، جلوی هر دسته نوشته شده «تغییر نام / ادغام» ،
          این نوشته رو بردار همون ایکون مداد ک گذاشتی باشه کافیه .
          ایکون حذف هم که سطل اشغاله همون باشه خوبه .
          هر دو ایکون به سمت چپ ردیف خودشون فیکس بشن ."
        */}
        <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800 space-y-1">
          {categories.length === 0 ? (
            <p className="text-xs text-[#5d6676] py-2">هنوز دسته‌ای ساخته نشده است.</p>
          ) : (
            categories.map(([catName, count]) => (
              <div
                key={catName}
                className="py-2 flex items-center justify-between gap-2 text-xs md:text-sm"
              >
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  📁 {catName} <span className="text-[#5d6676] text-xs">({count} واژه)</span>
                </span>

                {/* Icons pinned to the left (end in RTL) */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => {
                      const newName = prompt('نام جدید دسته را وارد کنید:', catName);
                      if (newName && newName.trim() && newName.trim() !== catName) {
                        onRenameCategory(catName, newName.trim());
                      }
                    }}
                    title="تغییر نام / ادغام"
                    aria-label="تغییر نام دسته"
                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center text-sm transition"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`آیا از حذف دستهٔ «${catName}» اطمینان دارید؟ واژه‌ها حذف نمی‌شوند و فقط بدون دسته خواهند شد.`)) {
                        onDeleteCategory(catName);
                      }
                    }}
                    title="حذف دسته"
                    aria-label="حذف دسته"
                    className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 text-red-600 flex items-center justify-center text-sm transition"
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </details>


      {/*
        Fulfills User Request #27 and Part F duplicate button
      */}
      <div className="flex flex-wrap items-center justify-between text-xs font-bold text-[#5d6676] dark:text-[#a3adbd] px-1 gap-2">
        <div className="flex items-center gap-2">
          <span>
            دسته‌بندی واژگان ({filteredWords.length} واژه در {categoryNames.length} دسته)
          </span>
          {searchQuery && (
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-normal">
              (دسته‌های حاوی نتیجه باز شدند)
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onOpenDuplicateDetector && (
            <button
              onClick={onOpenDuplicateDetector}
              className="bg-amber-50 hover:bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200 border border-amber-200 dark:border-amber-800 px-3 py-1 rounded-xl font-bold transition flex items-center gap-1 shadow-2xs"
            >
              <span>🔍</span>
              <span>بررسی تکراری‌ها و مشابه</span>
            </button>
          )}
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setCollapsedInSearch(new Set());
              }}
              className="text-[#1f5fbf] hover:underline font-normal"
            >
              پاک کردن جستجو
            </button>
          )}
        </div>
      </div>

      {/* Words List Grouped by Category */}
      <div className="space-y-3">
        {categoryNames.length === 0 ? (
          <div className="text-center py-12 text-[#5d6676] bg-white dark:bg-[#1b2029] border rounded-2xl">
            واژه‌ای با این شرایط یافت نشد.
          </div>
        ) : (
          categoryNames.map(cat => {
            const catWords = wordsByCategory.get(cat) || [];
            // Fulfills Requirement 14: when search is active, categories with matches are auto-expanded
            const isOpen = searchQuery.trim() ? !collapsedInSearch.has(cat) : openCat === cat;
            return (
              <div
                key={cat}
                className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl overflow-hidden shadow-xs"
              >
                {/* Category Header */}
                <button
                  onClick={() => {
                    if (searchQuery.trim()) {
                      setCollapsedInSearch(prev => {
                        const next = new Set(prev);
                        if (next.has(cat)) next.delete(cat);
                        else next.add(cat);
                        return next;
                      });
                    } else {
                      setOpenCat(openCat === cat ? null : cat);
                    }
                  }}
                  className="w-full px-4 py-3 flex items-center justify-between text-right font-bold text-sm bg-slate-50/70 hover:bg-slate-100/70 dark:bg-slate-800/40 dark:hover:bg-slate-800/80 transition"
                >
                  <span className="flex items-center gap-2">
                    <span>📁 {cat}</span>
                    <span className="text-xs text-[#5d6676] font-normal">({catWords.length} واژه)</span>
                  </span>
                  <span className="text-xs text-[#5d6676]">{isOpen ? '▲' : '▼'}</span>
                </button>

                {/*
                  Fulfills User Request #4:
                  "در قسمت واژگان ، وقتی هر دسته رو باز میکنی ، پیش نمایش لغات زیر دسته خیلی بزرگه برای هر واژه .
                  اصلاح کن : خطیتر و جمع و جورترش کن (تنظیمات قبلیش حذف نشه یعنی «دکمه تلفظ داشته باشه،
                  ترجمه مخفی باشه و با زدن روی چشم دیده بشه» )"
                */}
                {isOpen && (
                  <div className="p-3 divide-y divide-slate-100 dark:divide-slate-800 space-y-1">
                    {catWords.map(w => {
                      const isShowFa = !!visFa[w.id];
                      return (
                        <div
                          key={w.id}
                          onClick={() => onSelectWord(w)}
                          className="pt-1.5 pb-1.5 px-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition flex items-center justify-between gap-3 text-xs md:text-sm"
                        >
                          {/* Word + Article + Hidden Translation + Audio */}
                          <div className="flex items-center gap-2.5 min-w-0">
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                speak(fullWord(w));
                              }}
                              className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center text-xs flex-shrink-0"
                              title="پخش تلفظ"
                              aria-label="پخش تلفظ"
                            >
                              🔊
                            </button>

                            <div className="flex items-center gap-1.5" dir="ltr">
                              {w.art && (
                                <span className={`px-1.5 py-0.2 rounded font-bold text-xs ${
                                  w.art === 'der' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' :
                                  w.art === 'die' ? 'bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300' :
                                  'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                }`}>
                                  {w.art}
                                </span>
                              )}
                              <span className="font-bold text-slate-900 dark:text-slate-100 font-sans">
                                {w.de}
                              </span>
                            </div>

                            {/* Translation toggle button or revealed text */}
                            <div className="mr-2">
                              {isShowFa ? (
                                <span className="font-semibold text-slate-700 dark:text-slate-300 text-xs">
                                  {w.fa}
                                </span>
                              ) : (
                                <button
                                  onClick={e => toggleFaVisibility(w.id, e)}
                                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 px-1.5 py-0.5 rounded text-xs flex items-center gap-1 transition"
                                  title="نمایش ترجمه"
                                >
                                  👁 <span className="hidden sm:inline text-[11px]">ترجمه</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Quick indicators */}
                          <div className="flex items-center gap-1.5 text-[11px] text-[#5d6676] flex-shrink-0">
                            {w.lvl && (
                              <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded text-[10px]">
                                {w.lvl}
                              </span>
                            )}
                            {isLeech(w) && <span>🩸</span>}
                            {w.img && <span>🖼</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
