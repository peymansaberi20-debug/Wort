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
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
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
  const [aiChoicePrompt, setAiChoicePrompt] = useState<{ title: string; message: string; options: { label: string; target: string; instruction: string }[] } | null>(null);
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
  // Typo-tolerant suggestions from the user's own library
const lev = (a: string, b: string): number => {
const m = a.length, n = b.length;
const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
for (let j = 0; j <= n; j++) d[0][j] = j;
for (let i = 1; i <= m; i++)
for (let j = 1; j <= n; j++)
d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
return d[m][n];
};
const similarWords = useMemo(() => {
const q = searchQuery.trim().toLowerCase().replace(/^(der|die|das)\s+/i, '');
if (!q || q.length < 3) return [];
return words
.map(w => ({ w, d: lev(q, w.de.toLowerCase().replace(/^(der|die|das)\s+/i, '')) }))
.filter(x => x.d > 0 && x.d <= (q.length > 6 ? 3 : 2))
.sort((a, b) => a.d - b.d)
.slice(0, 5)
.map(x => x.w);
}, [words, searchQuery]);
  const addSimilar = (w: Word) => {
    // chip click = open the word's profile; closing it returns to the same search
    onSelectWord(w);
  };
// Phase 3: search found nothing → offer the existing creation workflow
  const noResults = !!searchQuery.trim() && filteredWords.length === 0;
  const addFromSearch = () => {
    const q = searchQuery.trim();
    const m = /^(der|die|das)\s+(.+)$/i.exec(q);
    resetForm();
    setFormArt(m ? m[1].toLowerCase() : '');
    setFormDe(m ? m[2] : q);
    setIsFormOpen(true);
    setFaCandidates([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    onShowToast(`«${c.de}» انتخاب شد؛ حالا تکمیل خودکار یا دستی ادامه بده.`, false);
  };

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

    const handleAiAutoFill = async (choice?: { target: string; instruction: string }) => {
    if (aiOperationRef.current) return;
    // spelling pick: user chose a library word as the correct spelling → open its profile, no AI call
        if (choice?.instruction.startsWith('SPELLING-PICK:')) {
      const pick = wordsRef.current.find(w => (w.art ? `${w.art} ${w.de}` : w.de) === choice.target);
      if (pick) {
        onSelectWord(pick);
        onShowToast('پروفایل واژهٔ موجود باز شد.', false);
      }
      return;
    }
    if (choice?.instruction.startsWith('SPELLING-CORRECT:')) {
      setFormDe(choice.target);
    }
    if (!choice) {
            const raw = formDe.trim();
      const lower = raw.toLocaleLowerCase('de').replace(/[.!?]+$/, '');
      // Phase 3: spelling control BEFORE AI — offer close library matches first
      const bareTyped = lower.replace(/^(der|die|das)\s+/i, '');
      if (bareTyped.length >= 3) {
        const best = wordsRef.current
          .map(w => ({ w, d: lev(bareTyped, w.de.toLowerCase().replace(/^(der|die|das)\s+/i, '')) }))
          .sort((a, b) => a.d - b.d)[0];
                if (best && best.d > 0 && best.d <= (bareTyped.length >= 6 ? 2 : 1)) {
          const full = best.w.art ? `${best.w.art} ${best.w.de}` : best.w.de;
          setAiChoicePrompt({
            title: 'کنترل املا',
            message: `«${raw}» در کتابخانه نیست، اما «${full}» بسیار نزدیک است. منظورت همین بود؟`,
            options: [
              { label: `بله، پروفایل «${full}» را باز کن`, target: full, instruction: 'SPELLING-PICK:' },
              { label: `نه، «${raw}» را با هوش مصنوعی ادامه بده`, target: raw, instruction: '' }
            ]
          });
          return;
        }
      }
      const option = (label: string, target: string, instruction: string) => ({ label, target, instruction });
      // High-value ambiguity cases: ask only when a common alternate analysis is genuinely plausible.
      const ambiguityMap: Record<string, { label: string; target: string; instruction: string }[]> = {
        essen: [option('اسم: das Essen (غذا / وعدهٔ غذایی)', 'Essen', 'منظور اسم das Essen به معنی غذا/وعدهٔ غذایی است، نه فعل essen.'), option('فعل: essen (غذا خوردن)', 'essen', 'منظور مصدر فعل essen به معنی غذا خوردن است، نه اسم Essen.')],
        morgen: [option('قید: morgen (فردا)', 'morgen', 'منظور قید morgen به معنی فردا است.'), option('اسم: der Morgen (صبح)', 'Morgen', 'منظور اسم der Morgen به معنی صبح است.')],
        arm: [option('صفت: arm (فقیر)', 'arm', 'منظور صفت arm به معنی فقیر است؛ مقایسه‌ای‌ها را نیز بساز.'), option('اسم: der Arm (بازو)', 'Arm', 'منظور اسم der Arm به معنی بازو است.')],
        laut: [option('صفت: laut (بلند / پرصدا)', 'laut', 'منظور صفت laut است.'), option('اسم: der Laut (آوا)', 'Laut', 'منظور اسم der Laut به معنی آوا/صدای زبانی است.')],
        sieben: [option('عدد: sieben (هفت)', 'sieben', 'منظور عدد sieben به معنی هفت است.'), option('فعل: sieben (الک کردن)', 'sieben', 'منظور فعل sieben به معنی الک کردن است؛ با عدد اشتباه نشود.')],
        acht: [option('عدد: acht (هشت)', 'acht', 'منظور عدد acht به معنی هشت است.'), option('فعل: achten (توجه/رعایت کردن)', 'achten', 'منظور فعل achten به معنی توجه یا رعایت کردن است.')],
        schuld: [option('اسم: die Schuld (تقصیر / بدهی)', 'Schuld', 'منظور اسم die Schuld به معنی تقصیر یا بدهی است.'), option('صفت/جزء ترکیب: schuld', 'schuld', 'منظور کاربرد وصفی یا ترکیبی schuld است؛ محدودیت کاربرد را توضیح بده.')],
        recht: [option('اسم: das Recht (حق / قانون)', 'Recht', 'منظور اسم das Recht به معنی حق یا قانون است.'), option('قید/صفت: recht (نسبتاً / درست)', 'recht', 'منظور کاربرد قیدی یا وصفی recht است، نه اسم das Recht.')],
        lachen: [option('فعل: lachen (خندیدن)', 'lachen', 'منظور مصدر فعل lachen است.'), option('اسم: das Lachen (خنده)', 'Lachen', 'منظور اسم‌مصدر das Lachen به معنی خنده است.')],
        lesen: [option('فعل: lesen (خواندن)', 'lesen', 'منظور مصدر فعل lesen است.'), option('اسم‌مصدر: das Lesen (مطالعه)', 'Lesen', 'منظور اسم‌مصدر das Lesen است.')],
        schreiben: [option('فعل: schreiben (نوشتن)', 'schreiben', 'منظور مصدر فعل schreiben است.'), option('اسم‌مصدر: das Schreiben (نوشتن / نامه)', 'Schreiben', 'منظور اسم‌مصدر das Schreiben یا در بافت اداری نامه است.')],
        trinken: [option('فعل: trinken (نوشیدن)', 'trinken', 'منظور مصدر فعل trinken است.'), option('اسم‌مصدر: das Trinken (نوشیدن)', 'Trinken', 'منظور اسم‌مصدر das Trinken است.')],
        fahren: [option('فعل: fahren (رفتن با وسیله / رانندگی)', 'fahren', 'منظور مصدر فعل fahren است.'), option('اسم‌مصدر: das Fahren', 'Fahren', 'منظور اسم‌مصدر das Fahren است.')],
        laufen: [option('فعل: laufen (دویدن / راه رفتن)', 'laufen', 'منظور مصدر فعل laufen است.'), option('اسم‌مصدر: das Laufen', 'Laufen', 'منظور اسم‌مصدر das Laufen است.')],
        spielen: [option('فعل: spielen (بازی کردن / نواختن)', 'spielen', 'منظور مصدر فعل spielen است.'), option('اسم‌مصدر: das Spielen', 'Spielen', 'منظور اسم‌مصدر das Spielen است.')],
        arbeiten: [option('فعل: arbeiten (کار کردن)', 'arbeiten', 'منظور مصدر فعل arbeiten است.'), option('اسم‌مصدر: das Arbeiten', 'Arbeiten', 'منظور اسم‌مصدر das Arbeiten است.')],
        kochen: [option('فعل: kochen (پختن)', 'kochen', 'منظور مصدر فعل kochen است.'), option('اسم‌مصدر: das Kochen (آشپزی)', 'Kochen', 'منظور اسم‌مصدر das Kochen است.')],
        lernen: [option('فعل: lernen (یاد گرفتن)', 'lernen', 'منظور مصدر فعل lernen است.'), option('اسم‌مصدر: das Lernen (یادگیری)', 'Lernen', 'منظور اسم‌مصدر das Lernen است.')],
        sprechen: [option('فعل: sprechen (صحبت کردن)', 'sprechen', 'منظور مصدر فعل sprechen است.'), option('اسم‌مصدر: das Sprechen', 'Sprechen', 'منظور اسم‌مصدر das Sprechen است.')],
        schlafen: [option('فعل: schlafen (خوابیدن)', 'schlafen', 'منظور مصدر فعل schlafen است.'), option('اسم‌مصدر: das Schlafen', 'Schlafen', 'منظور اسم‌مصدر das Schlafen است.')],
        gefallen: [option('فعل: gefallen (مورد پسند بودن)', 'gefallen', 'منظور فعل gefallen به معنی مورد پسند بودن است؛ با fallen فرق دارد.'), option('Partizip II فعل fallen (افتادن)', 'gefallen', 'منظور شکل Partizip II فعل fallen به معنی افتادن است، نه مصدر gefallen.')],
        übersetzen: [option('übersetzen = ترجمه کردن', 'übersetzen', 'منظور فعل جدا‌نشدنی übersetzen به معنی ترجمه کردن است.'), option('übersetzen = با قایق به آن‌سوی آب بردن', 'übersetzen', 'منظور فعل جداشدنی über|setzen است؛ تفاوت تکیه و جداشدن را توضیح بده.')],
        umfahren: [option('umfahren = دور زدن', 'umfahren', 'منظور فعل جداشدنی um|fahren به معنی دور زدن است.'), option('umfahren = زیر گرفتن', 'umfahren', 'منظور فعل جدا‌نشدنی umfahren به معنی زیر گرفتن است؛ تفاوت تکیه و Partizip را توضیح بده.')]
      };
      if (ambiguityMap[lower]) {
                setAiChoicePrompt({ title: 'این واژه چند معنی یا نقش دارد', message: `برای «${raw}» چند برداشت محتمل وجود دارد. معنی یا نقش موردنظر را انتخاب کنید.`, options: ambiguityMap[lower] });
        return;
      }
      // spelling control with AI for words not found in the library
      try {
        const chkText = await generateWithGemini(`You are a German spelling checker. Is "${raw}" a correctly spelled standard German dictionary word (ignore a leading der/die/das)? Answer ONLY a JSON array: if correct [{"ok":true,"word":"${raw}"}] — if misspelled or not a real German word [{"ok":false,"word":"the closest correctly spelled German dictionary word"}].`, { timeoutMs: 12000, retries: 0 });
        const chk = parseAI(chkText)[0];
        const sug = String(chk?.word || '').trim();
        if (chk && chk.ok === false && sug && sug.toLocaleLowerCase('de') !== lower) {
          setAiChoicePrompt({
            title: 'کنترل املا با هوش مصنوعی',
            message: `«${raw}» به‌نظر واژهٔ درست آلمانی نیست. منظورت «${sug}» بود؟`,
            options: [
              { label: `بله، «${sug}» را تکمیل کن`, target: sug, instruction: 'SPELLING-CORRECT:' },
              { label: `نه، همان «${raw}» را ادامه بده`, target: raw, instruction: 'SPELLING-KEEP:' }
            ]
          });
          return;
        }
      } catch { /* چک املا در دسترس نبود → ادامهٔ عادی */ }

      // German Partizip-II lookup: irregular verbs, common regular verbs and separable-prefix forms.
      const participleMap: Record<string, string> = {};
      const pairs = `gewesen=sein gehabt=haben geworden=werden gekonnt=können gemusst=müssen gedurft=dürfen gesollt=sollen gewollt=wollen gemocht=mögen gewusst=wissen gedacht=denken gebracht=bringen gekannt=kennen genannt=nennen gerannt=rennen gebrannt=brennen gewendet=wenden gegessen=essen gesehen=sehen geschrieben=schreiben gesprochen=sprechen genommen=nehmen gegangen=gehen gekommen=kommen gefunden=finden gebunden=binden geblieben=bleiben gefahren=fahren geflogen=fliegen geschlafen=schlafen gelesen=lesen getrunken=trinken geholfen=helfen geöffnet=öffnen gekauft=kaufen gemacht=machen gesagt=sagen gelernt=lernen gearbeitet=arbeiten aufgestanden=aufstehen angekommen=ankommen eingeladen=einladen entschieden=entscheiden verstanden=verstehen begonnen=beginnen verloren=verlieren vergessen=vergessen gestanden=stehen gesessen=sitzen gelegen=liegen gehangen=hängen gehängt=hängen gesprungen=springen gesungen=singen gesunken=sinken gestiegen=steigen gestorben=sterben gestohlen=stehlen geschwommen=schwimmen geschlagen=schlagen geschoben=schieben geschossen=schießen geschlossen=schließen geschmolzen=schmelzen geschnitten=schneiden geschrien=schreien geschwiegen=schweigen geschworen=schwören gezogen=ziehen gezwungen=zwingen gezählt=zählen gezahlt=zahlen gezeigt=zeigen geholt=holen gehalten=halten gehoben=heben gehauen=hauen geheißen=heißen geheiratet=heiraten geheilt=heilen gejagt=jagen geklungen=klingen geklebt=kleben gekrochen=kriechen gelacht=lachen geladen=laden gelassen=lassen gelaufen=laufen geliehen=leihen gelogen=lügen gelöst=lösen gelitten=leiden gemalt=malen gemessen=messen gemieden=meiden gemeldet=melden gemerkt=merken gemischt=mischen mitgebracht=mitbringen mitgenommen=mitnehmen mitgekommen=mitkommen nachgedacht=nachdenken nachgefragt=nachfragen nachgeschaut=nachschauen vorgenommen=vornehmen vorbereitet=vorbereiten vorgestellt=vorstellen vorausgesetzt=voraussetzen vorgekommen=vorkommen vorgeschlagen=vorschlagen vorgehabt=vorhaben weggegangen=weggehen weggenommen=wegnehmen weitergemacht=weitermachen wiedergefunden=wiederfinden wiederholt=wiederholen zurückgekommen=zurückkommen zurückgegeben=zurückgeben zurückgegangen=zurückgehen zurückgenommen=zurücknehmen zurückgerufen=zurückrufen zugemacht=zumachen zugelassen=zulassen zugestimmt=zustimmen zugehört=zuhören zugesehen=zusehen zugenommen=zunehmen abgemacht=abmachen abgefahren=abfahren abgeflogen=abfliegen abgegeben=abgeben abgeholt=abholen abgenommen=abnehmen abgerufen=abrufen abgesagt=absagen abgeschlossen=abschließen abgeschnitten=abschneiden abgeschrieben=abschreiben abgeschickt=abschicken abgestiegen=absteigen angeboten=anbieten angefangen=anfangen angefahren=anfahren angehalten=anhalten angemeldet=anmelden angenommen=annehmen angerufen=anrufen angeschaut=anschauen angeschlossen=anschließen angesprochen=ansprechen angestellt=anstellen angetroffen=antreffen angewendet=anwenden angezeigt=anzeigen aufgegeben=aufgeben aufgefallen=auffallen aufgefangen=auffangen aufgehalten=aufhalten aufgekommen=aufkommen aufgeladen=aufladen aufgelöst=auflösen aufgenommen=aufnehmen aufgerufen=aufrufen aufgeschrieben=aufschreiben aufgesetzt=aufsetzen aufgestiegen=aufsteigen aufgetaucht=auftauchen aufgeteilt=aufteilen aufgetreten=auftreten aufgewacht=aufwachen ausgegangen=ausgehen ausgegeben=ausgeben ausgefüllt=ausfüllen ausgefallen=ausfallen ausgehalten=aushalten ausgelacht=auslachen ausgelassen=auslassen ausgeliehen=ausleihen ausgemacht=ausmachen ausgenommen=ausnehmen ausgeschaltet=ausschalten ausgeschlossen=ausschließen ausgeschlafen=ausschlafen ausgeschrieben=ausschreiben ausgeschnitten=ausschneiden ausgesucht=aussuchen ausgesehen=aussehen ausgestiegen=aussteigen ausgetauscht=austauschen ausgewählt=auswählen ausgewiesen=ausweisen ausgezogen=ausziehen bekommen=bekommen beraten=beraten berichtet=berichten beschrieben=beschreiben beschlossen=beschließen besprochen=besprechen bestellt=bestellen bestanden=bestehen besucht=besuchen betrogen=betrügen bewiesen=beweisen beworben=bewerben bezahlt=bezahlen gebeten=bitten geboten=bieten gebucht=buchen gedient=dienen gedreht=drehen gedruckt=drucken geduscht=duschen gedankt=danken gedauert=dauern geehrt=ehren geeilt=eilen geeinigt=einigen eingeatmet=einatmen eingebaut=einbauen eingebrochen=einbrechen eingefallen=einfallen eingeführt=einführen eingegangen=eingehen eingehalten=einhalten eingeholt=einholen eingekauft=einkaufen eingeleitet=einleiten eingepackt=einpacken eingeschlafen=einschlafen eingeschlossen=einschließen eingeschrieben=einschreiben eingesetzt=einsetzen eingestiegen=einsteigen eingestellt=einstellen eingetreten=eintreten eingetragen=eintragen eingezogen=einziehen empfohlen=empfehlen empfangen=empfangen entdeckt=entdecken entfernt=entfernen entlassen=entlassen entspannt=entspannen entstanden=entstehen entwickelt=entwickeln entworfen=entwerfen erfahren=erfahren erhalten=erhalten erholt=erholen erinnert=erinnern erkannt=erkennen erklärt=erklären erlaubt=erlauben erlebt=erleben erledigt=erledigen eröffnet=eröffnen erreicht=erreichen erschaffen=erschaffen erschrocken=erschrecken erzählt=erzählen erzogen=erziehen erworben=erwerben erzeugt=erzeugen gefeiert=feiern gefehlt=fehlen geflohen=fliehen gefolgt=folgen gefordert=fordern gefördert=fördern gefragt=fragen gefreut=freuen gefroren=frieren geführt=führen gefühlt=fühlen geärgert=ärgern geantwortet=antworten geatmet=atmen gebadet=baden gebastelt=basteln gebaut=bauen gebraucht=brauchen geparkt=parken gepasst=passen geprüft=prüfen gepflanzt=pflanzen geplant=planen geputzt=putzen geredet=reden geregnet=regnen gereicht=reichen gereist=reisen gerettet=retten gerufen=rufen gesammelt=sammeln gespart=sparen gespürt=spüren gestartet=starten gesteckt=stecken gestellt=stellen gestreikt=streiken gestört=stören getauscht=tauschen getestet=testen geteilt=teilen getragen=tragen geträumt=träumen getroffen=treffen getreten=treten getrieben=treiben getrocknet=trocknen getötet=töten getröstet=trösten geübt=üben verwendet=verwenden verkauft=verkaufen verlassen=verlassen verliehen=verleihen verliebt=verlieben vermieden=vermeiden vermisst=vermissen vermutet=vermuten verpasst=verpassen versprochen=versprechen versucht=versuchen verteilt=verteilen vertragen=vertragen vertreten=vertreten verwirklicht=verwirklichen verzichtet=verzichten verzogen=verziehen gewartet=warten geweint=weinen gewechselt=wechseln geweckt=wecken geworfen=werfen gewaschen=waschen gewachsen=wachsen gewandert=wandern gewarnt=warnen gewünscht=wünschen organisiert=organisieren informiert=informieren interessiert=interessieren repariert=reparieren probiert=probieren passiert=passieren diskutiert=diskutieren telefoniert=telefonieren studiert=studieren reserviert=reservieren produziert=produzieren präsentiert=präsentieren trainiert=trainieren kontrolliert=kontrollieren korrigiert=korrigieren kopiert=kopieren fotografiert=fotografieren akzeptiert=akzeptieren aktiviert=aktivieren analysiert=analysieren dekoriert=dekorieren definiert=definieren dokumentiert=dokumentieren existiert=existieren gratuliert=gratulieren kombiniert=kombinieren kommuniziert=kommunizieren konzentriert=konzentrieren motiviert=motivieren sortiert=sortieren transportiert=transportieren variiert=variieren`.split(/\s+/);
      for (const pair of pairs) { const i = pair.indexOf('='); if (i > 0) participleMap[pair.slice(0, i)] = pair.slice(i + 1); }
      const excludedInfinitives = new Set(['gelten','genießen','geraten','gebären','gedeihen','genesen','genügen','genieren','geistern','gewähren','geizen','gewinnen','gebieten','gerinnen','gellen','gerben','gären']);
      const likelyParticiple = participleMap[lower] || (/^ge[\p{L}]{3,}(?:t|en)$/iu.test(lower) && lower.length > 5 && !excludedInfinitives.has(lower) ? '__unknown__' : (/^[\p{L}]{3,}iert$/iu.test(lower) && lower.length > 6 ? '__unknown__' : ''));
      if (likelyParticiple) {
        const knownLemma = likelyParticiple === '__unknown__' ? '' : likelyParticiple;
        const baseInstruction = knownLemma
          ? `شکل «${raw}» Partizip II فعل «${knownLemma}» است. پروفایل مصدر «${knownLemma}» را بساز و صرف‌ها را از مصدر تولید کن.`
          : `«${raw}» احتمالاً Partizip II است، اما مصدر آن در نگاشت محلی نیست. مصدر استاندارد آلمانی را با دانش زبانی تشخیص بده. در خروجی de باید مصدر باشد و اگر چند تحلیل معتبر وجود دارد آن‌ها را در notes توضیح بده. شکل ورودی را به‌اشتباه مصدر فرض نکن.`;
        setAiChoicePrompt({ title: 'احتمال شکل Partizip II', message: knownLemma
          ? `«${raw}» معمولاً Partizip II فعل «${knownLemma}» است. کدام مسیر را می‌خواهید؟`
          : `«${raw}» از نظر ساخت واژه ممکن است Partizip II باشد، اما مصدر قطعی نیست. کدام مسیر را می‌خواهید؟`, options: [
          option(`همین «${raw}» را به‌عنوان صفت/Partizip بررسی کن`, raw, `واژهٔ هدف دقیقاً «${raw}» است؛ آن را به مصدر تبدیل نکن. مشخص کن آیا کاربرد وصفی طبیعی دارد یا فقط Partizip II است و مثال طبیعی بده.`),
          option(knownLemma ? `پروفایل فعل پایه «${knownLemma}» را بساز` : 'مصدر فعل را با کمک هوش مصنوعی تشخیص بده', knownLemma || raw, baseInstruction + (knownLemma ? '' : ' پس از دریافت پاسخ، فیلد ورودی را نیز با مصدر خروجی جایگزین کن.'))
        ] });
        return;
      }
    }
    if (!formDe.trim()) {
      onShowToast('ابتدا کلمهٔ آلمانی را بنویسید.', true);
      return;
    }
    if (checkForDuplicate(choice?.target || formDe.trim())) {
      onShowToast('این واژه از قبل در کتابخانه وجود دارد؛ هوش مصنوعی اجرا نشد.', true);
      return;
    }
    aiOperationRef.current = true;
    setAiLoading(true);
    try {
      const targetWord = choice?.target || formDe.trim();
      const prompt = AIP(targetWord, wordsRef.current, formCat && formCat !== '__new' ? formCat : undefined) + (choice?.instruction ? `\n\nIMPORTANT USER-SELECTED MEANING/FORM:\n${choice.instruction}\nUse the selected target exactly and do not revert to another meaning.` : '');
      const resText = await generateWithGemini(prompt, { timeoutMs: 25000 });
      const duplicateAfterAi = checkForDuplicate(choice?.target || formDe.trim());
      if (duplicateAfterAi) {
        onShowToast('این واژه در حین پردازش به کتابخانه اضافه شده است؛ اطلاعات تولیدشده اعمال نشد.', true);
        return;
      }
      const parsed = parseAI(resText);
      const { ws, errs } = aiToIMP(parsed, wordsRef.current, formCat && formCat !== '__new' ? formCat : undefined);
            if (choice?.instruction.includes('فیلد ورودی را نیز با مصدر خروجی جایگزین کن') && ws[0]?.de) setFormDe(ws[0].de);
      // user typed a misspelling and let AI continue: keep the AI's correct dictionary form
      if (!choice && ws[0]?.de && lev(lower.replace(/^(der|die|das)\s+/i, ''), ws[0].de.toLowerCase().replace(/^(der|die|das)\s+/i, '')) <= 3 && lower.replace(/^(der|die|das)\s+/i, '') !== ws[0].de.toLowerCase().replace(/^(der|die|das)\s+/i, '')) {
        setFormDe(ws[0].de);
        onShowToast(`املای واژه اصلاح شد: ${formDe.trim()} → ${ws[0].de}`);
      }
            if (ws.length > 0) {
        const item = ws[0];
        // Phase 3: AI returned the proper dictionary form for a misspelled input → fix the form word
        if (item.de) {
          const typedBare = (choice?.target || formDe.trim()).trim().replace(/^(der|die|das)\s+/i, '');
          const dTyped = typedBare.toLocaleLowerCase('de');
          const dAi = item.de.trim().toLocaleLowerCase('de');
          if (dTyped && dAi && dTyped !== dAi && lev(dTyped, dAi) <= 3) {
            setFormDe(item.de.trim());
            onShowToast(`املای واژه اصلاح شد: ${typedBare} → ${item.de.trim()}`);
          }
        }
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

  // Phase 3: Persian → German equivalents (find candidates from a Persian meaning)
  const [faCandidates, setFaCandidates] = useState<{ de: string; art: string; short: string }[]>([]);
  const [faLoading, setFaLoading] = useState(false);
  // suggestions must vanish whenever the form closes (× / save / tab switch)
  React.useEffect(() => {
    if (!isFormOpen) { setFaCandidates([]); setFaLoading(false); }
  }, [isFormOpen]);
  const handleFaToDe = async () => {
    const fa = formFa.trim();
    if (!fa || faLoading) return;
    setFaLoading(true);
    setFaCandidates([]);
    try {
      const prompt = `You are a German vocabulary assistant. A Persian-speaking learner knows the meaning "${fa}" and wants the German word.
Give the 5 most common German equivalents (different senses if applicable). Answer ONLY a JSON array, no code fence, no commentary:
[{"de":"German word without article","art":"der|die|das|","short":"very short Persian hint (2-5 words)"}]`;
      const out = await generateWithGemini(prompt, { timeoutMs: 15000, retries: 0 });
      const list = parseAI(out)
        .filter((x: any) => x && typeof x.de === 'string' && x.de.trim())
        .slice(0, 5)
        .map((x: any) => ({ de: String(x.de).trim(), art: ['der', 'die', 'das'].includes(String(x.art || '')) ? String(x.art) : '', short: String(x.short || '').trim() }));
      setFaCandidates(list);
      if (list.length === 0) onShowToast('معادلی پیدا نشد؛ عبارت را دقیق‌تر بنویس.', true);
    } catch (e: any) {
      onShowToast(e?.message || 'یافتن معادل ممکن نشد.', true);
    } finally {
      setFaLoading(false);
    }
  };
  const pickFaCandidate = (c: { de: string; art: string; short: string }) => {
    resetForm();
    setFormFa(formFa);
    setFormArt(c.art);
    setFormDe(c.de);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    onShowToast(`«${c.de}» انتخاب شد؛ حالا تکمیل خودکار یا دستی ادامه بده.`, false);
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
      {/* Phase 3: empty-search suggestion — opens the existing creation workflow */}
{noResults && (
<div className="mb-3 p-4 rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 text-sm">
<div className="font-bold text-slate-800 dark:text-slate-100 mb-1">
با این جستجو واژه‌ای یافت نشد.
</div>
<div className="text-[#5d6676] dark:text-[#a3adbd] mb-2">
«{searchQuery.trim()}» در واژگان شما نیست — می‌توانی همین حالا اضافه‌اش کنی (تکمیل دستی یا با هوش مصنوعی در فرم).
</div>
{similarWords.length > 0 && (
<div className="mb-2">
<div className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">شاید منظورت یکی از این‌ها بود؟ (کلیک → پروفایل واژه) </div>
<div className="flex flex-wrap gap-1.5">
{similarWords.map(sw => (
<button
key={sw.id}
type="button"
onClick={() => addSimilar(sw)}
className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-2.5 py-1 text-xs font-sans"
dir="ltr"
>
{sw.art ? sw.art + ' ' : ''}{sw.de}
</button>
))}
</div>
</div>
)}
<button
type="button"
onClick={addFromSearch}
className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-4 py-2 rounded-xl text-xs md:text-sm font-bold"
>
➕ افزودن «{searchQuery.trim()}»
</button>
</div>
)}
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
                onClick={() => { resetForm(); setFaCandidates([]); }}
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
                  onClick={() => { const existing = duplicateWord; setDuplicateWord(null); setVisFa({}); onSelectWord(existing); }}
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
          
                      <div className="mt-2">
              <button
                type="button"
                onClick={handleFaToDe}
                disabled={faLoading || !formFa.trim()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-xs disabled:opacity-40 transition flex items-center gap-1.5"
              >
                {faLoading ? <><span className="inline-block animate-spin">⏳</span><span>در حال یافتن معادل‌ها…</span></> : <span>🇩🇪 معادل‌های آلمانی این معنی را بیاب</span>}
              </button>
              {faCandidates.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-200">معادل‌های پیشنهادی — یکی را انتخاب کن (کلیک → در کادر واژه می‌نشیند):</div>
                  {faCandidates.map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => pickFaCandidate(c)}
                      className="w-full text-right bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:border-emerald-500 rounded-xl px-3 py-2 transition flex items-center justify-between gap-2"
                    >
                      <span className="text-xs text-[#5d6676] dark:text-[#a3adbd]">{c.short}</span>
                      <span dir="ltr" className="font-sans font-bold text-sm text-slate-900 dark:text-slate-100">{c.art ? c.art + ' ' : ''}{c.de}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          
          {/* AI Helper Bar */}
          <div className="bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleAiAutoFill()}
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

            <div className="mt-2">
              <button
                type="button"
                onClick={handleFaToDe}
                disabled={faLoading || !formFa.trim()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-xs disabled:opacity-40 transition flex items-center gap-1.5"
              >
                {faLoading ? <><span className="inline-block animate-spin">⏳</span><span>در حال یافتن معادل‌ها…</span></> : <span>🇩🇪 معادل‌های آلمانی این معنی را بیاب</span>}
              </button>
              {faCandidates.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-200">معادل‌های پیشنهادی — یکی را انتخاب کن (کلیک → در کادر واژه می‌نشیند):</div>
                  {faCandidates.map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => pickFaCandidate(c)}
                      className="w-full text-right bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:border-emerald-500 rounded-xl px-3 py-2 transition flex items-center justify-between gap-2"
                    >
                      <span className="text-xs text-[#5d6676] dark:text-[#a3adbd]">{c.short}</span>
                      <span dir="ltr" className="font-sans font-bold text-sm text-slate-900 dark:text-slate-100">{c.art ? c.art + ' ' : ''}{c.de}</span>
                    </button>
                  ))}
                </div>
              )}
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
          onClick={() => setCategoryManagerOpen(true)}
          className="min-w-0 min-h-[48px] w-full rounded-xl border border-sky-200 dark:border-slate-700 bg-sky-50 dark:bg-slate-800/80 px-1 sm:px-3 py-2 text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 hover:bg-sky-100 dark:hover:bg-slate-700 transition flex items-center justify-center gap-1 sm:gap-2"
        >
          <span aria-hidden="true">📁</span>
          <span className="truncate">مدیریت دسته</span>
        </button>
      </div>

      {/* Category Management Modal: hidden until the pale-blue action button is pressed */}
      {categoryManagerOpen && (
        <div
          className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 md:p-6"
          onClick={e => {
            if (e.target === e.currentTarget) setCategoryManagerOpen(false);
          }}
        >
          <div className="w-full max-w-xl max-h-[85vh] overflow-y-auto bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-base">🗂 مدیریت دسته‌ها ({categories.length})</h3>
              <div className="flex items-center gap-2">
                {/* Fulfills Request #20: Help for Category Management */}
                <button
                  type="button"
                  onClick={() => onOpenHelp('cat_mgr')}
                  className="text-xs bg-blue-50 text-[#1f5fbf] hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 px-2.5 py-1.5 rounded-lg font-bold"
                >
                  ❓ راهنما
                </button>
                <button
                  type="button"
                  onClick={() => setCategoryManagerOpen(false)}
                  aria-label="بستن مدیریت دسته‌ها"
                  className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 font-bold"
                >
                  ✕
                </button>
              </div>
            </div>

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
          </div>
        </div>
      )}

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
                          onClick={() => { setVisFa({}); onSelectWord(w); }}
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
      {aiChoicePrompt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="ai-choice-title">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1b2029] p-5 shadow-2xl space-y-4">
            <h3 id="ai-choice-title" className="text-base font-extrabold text-slate-900 dark:text-white">{aiChoicePrompt.title}</h3>
            <p className="text-sm leading-7 text-slate-700 dark:text-slate-200">{aiChoicePrompt.message}</p>
            <div className="space-y-2">
              {aiChoicePrompt.options.map((option, index) => (
                <button key={`${option.target}-${index}`} type="button" onClick={() => { setAiChoicePrompt(null); setFormDe(option.target); void handleAiAutoFill({ target: option.target, instruction: option.instruction }); }} className="w-full rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 px-4 py-3 text-right text-sm font-bold transition">
                  {option.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setAiChoicePrompt(null)} className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-semibold">انصراف</button>
          </div>
        </div>
      )}
    </div>
  );
};
