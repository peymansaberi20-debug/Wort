import { applyGermanQuality } from '../utils/german';
import { classifyImport } from '../utils/vocabMerge';
import { copyText } from '../utils/clipboard';
import React, { useState, useMemo } from 'react';
import { AppState, Word } from '../types';
import { getCategories, norm, matchCat, resolveCat } from '../utils/storage';
import { AIPM, buildMasterPrompt, generateWithGemini, parseAI, aiToIMP, processBatchWordsWithGemini, checkGermanSpelling } from '../utils/ai';
import * as XLSX from 'xlsx';
import { ImportHelpModal } from '../components/ImportHelpModal';

interface ImportExportViewProps {
  state: AppState;
  words: Word[];
  onImportWords: (newWords: Word[], overwrite: boolean) => void;
  onRestoreBackup: (backupState: AppState) => void;
  onOpenImageExtract: () => void;
  onOpenHelp: (topic: string) => void;
  onShowToast: (msg: string, isErr?: boolean) => void;
}

export const ImportExportView: React.FC<ImportExportViewProps> = ({
  state,
  words,
  onImportWords,
  onRestoreBackup,
  onOpenImageExtract,
  onOpenHelp,
  onShowToast
}) => {
  // Bulk AI state
  const [bulkText, setBulkText] = useState('');
  const [bulkCategory, setBulkCategory] = useState(''); // Default: empty = AI decides
  const [bulkNewCatName, setBulkNewCatName] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('');
  const [pastedJson, setPastedJson] = useState('');

  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

  // Pending imported items preview
  const [pendingImport, setPendingImport] = useState<{
    words: Word[];
    errors: string[];
    backupState?: AppState;
  } | null>(null);

  const categories = useMemo(() => getCategories(words), [words]);

  // Fulfills Task 3.2: Generate genuine Excel-compatible workbook (.xlsx) with 2 sheets
/** Builds an Anki-importable TSV file (UTF-8 with BOM for correct Persian display). */
const buildAnkiText = (ws: Word[]): string => {
  const rows = ws.map(w => {
    const front = fullWord(w);
    const backParts: string[] = [];
    if (w.fa) backParts.push(`<b>${w.fa}</b>`);
    if (w.en) backParts.push(`🇬🇧 ${w.en}`);
    if (w.pl) backParts.push(`📐 Plural: ${w.pl}`);
    if (w.ex2) backParts.push(`💬 ${w.ex2}`);
    if (w.ex) backParts.push(`📖 ${w.ex}`);
    const grammar: string[] = [];
    if (w.conj) grammar.push(`Präsens: ${w.conj.split('|').join(', ')}`);
    if (w.prat) grammar.push(`Präteritum: ${w.prat}`);
    if (w.perf) grammar.push(`Perfekt: ${w.perf}`);
    if (w.sep) grammar.push(`trennbar: ${w.sep}-`);
    if (grammar.length) backParts.push(`🔧 ${grammar.join(' • ')}`);
    if (w.notes) backParts.push(`📝 ${w.notes.split('\n').join('<br>')}`);
    const tags = [w.cat, w.lvl].filter(Boolean).join(' ');
    const esc = (s: string) => s.replace(/\t/g, ' ').replace(/\n/g, '<br>');
    return `${esc(front)}\t${esc(backParts.join('<br>'))}\t${esc(tags)}`;
  });
  return '\ufeff' + ['#separator:tab', '#html:true', ...rows].join('\n');
};  
  const generateExcelTemplate = () => {
    try {
      const wb = XLSX.utils.book_new();

      const vocabHeaders = [
        'german',
        'article',
        'persian',
        'english',
        'plural',
        'partOfSpeech',
        'level',
        'definition (Bedeutung)',
        'definitionTranslation',
        'example (Redemittel)',
        'example2Translation',
        'synonym',
        'synonymTranslation',
        'antonym',
        'antonymTranslation',
        'category',
        'conjugation',
        'preteritum',
        'perfekt',
        'separablePrefix',
        'notes'
      ];

      const sampleRows = [
        {
          german: 'Entscheidung',
          article: 'die',
          persian: 'تصمیم',
          english: 'decision',
          plural: 'die Entscheidungen',
          partOfSpeech: 'اسم',
          level: 'B1',
          'definition (Bedeutung)': 'Eine Entscheidung ist die Wahl zwischen mehreren Möglichkeiten, die man nach dem Denken trifft.',
          definitionTranslation: 'تصمیم، انتخاب بین چند امکان پس از فکر کردن است.',
          'example (Redemittel)': 'Wir müssen eine wichtige Entscheidung treffen.',
          example2Translation: 'ما باید یک تصمیم مهم بگیریم.',
          synonym: 'der Beschluss',
          synonymTranslation: 'مصوبه، تصمیم',
          antonym: 'die Unentschlossenheit',
          antonymTranslation: 'بلاتکلیفی، دودلی',
          category: 'ارتباطات (Kommunikation)',
          conjugation: '',
          preteritum: '',
          perfekt: '',
          separablePrefix: '',
          notes: 'ترکیب فعلی: eine Entscheidung treffen (تصمیم گرفتن)'
        },
        {
          german: 'Tisch',
          article: 'der',
          persian: 'میز',
          english: 'table',
          plural: 'die Tische',
          partOfSpeech: 'اسم',
          level: 'A1',
          'definition (Bedeutung)': 'Ein Tisch ist ein Möbel mit einer flachen Platte und Beinen, an dem man sitzt und arbeitet oder isst.',
          definitionTranslation: 'میز، مبله‌ای با صفحهٔ صاف و پایه‌هاست که کنارش می‌نشینیم و کار یا غذا خوردن انجام می‌دهیم.',
          'example (Redemittel)': 'Das Buch liegt auf dem Tisch.',
          example2Translation: 'کتاب روی میز قرار دارد.',
          synonym: '',
          synonymTranslation: '',
          antonym: '',
          antonymTranslation: '',
          category: 'امور روزمره',
          conjugation: '',
          preteritum: '',
          perfekt: '',
          separablePrefix: '',
          notes: 'حرف اضافه: an dem Tisch sitzen'
        },
        {
          german: 'Haus',
          article: 'das',
          persian: 'خانه',
          english: 'house',
          plural: 'die Häuser',
          partOfSpeech: 'اسم',
          level: 'A1',
          'definition (Bedeutung)': 'Ein Haus ist ein Gebäude, in dem Menschen wohnen und leben.',
          definitionTranslation: 'خانه، بنایی است که آدم‌ها در آن ساکن می‌شوند و زندگی می‌کنند.',
          'example (Redemittel)': 'Mein Haus hat einen schönen Garten.',
          example2Translation: 'خانه من یک باغچه زیبا دارد.',
          synonym: 'das Gebäude',
          synonymTranslation: 'ساختمان',
          antonym: '',
          antonymTranslation: '',
          category: 'امور روزمره',
          conjugation: '',
          preteritum: '',
          perfekt: '',
          separablePrefix: '',
          notes: 'ترکیب: nach Hause gehen (رفتن به خانه)'
        },
        {
          german: 'freuen',
          article: '',
          persian: 'خوشحال شدن، منتظر بودن',
          english: 'to be glad, to look forward to',
          plural: '',
          partOfSpeech: 'فعل',
          level: 'A2',
          'definition (Bedeutung)': 'Sich freuen bedeutet, eine positive, glückliche Emotion zu haben und sich auf etwas Schönes zu freuen.',
          definitionTranslation: 'خوشحال شدن یعنی داشتن احساس مثبت و شاد، و مشتاق چیزی زیبا بودن.',
          'example (Redemittel)': 'Ich freue mich auf den Urlaub.',
          example2Translation: 'من مشتاقانه منتظر تعطیلات هستم.',
          synonym: '',
          synonymTranslation: '',
          antonym: '',
          antonymTranslation: '',
          category: 'اصطلاحات (Redewendungen)',
          conjugation: 'freue, freust, freut, freuen, freut, freuen',
          preteritum: 'freute',
          perfekt: 'hat gefreut',
          separablePrefix: '',
          notes: 'sich freuen auf + Akk (انتظار آینده)\nsich freuen über + Akk (شادی از حال/گذشته)'
        },
        {
          german: 'anrufen',
          article: '',
          persian: 'تلفن زدن، تماس گرفتن',
          english: 'to call (by phone)',
          plural: '',
          partOfSpeech: 'فعل',
          level: 'A1',
          'definition (Bedeutung)': 'Anrufen bedeutet, mit dem Telefon jemanden zu kontaktieren und mit ihm zu sprechen.',
          definitionTranslation: 'تلفن زدن یعنی با تلفن با کسی تماس گرفته و صحبت کردن.',
          'example (Redemittel)': 'Ich rufe dich morgen an.',
          example2Translation: 'من فردا به تو زنگ می‌زنم.',
          synonym: 'telefonieren',
          synonymTranslation: 'تلفنی صحبت کردن',
          antonym: '',
          antonymTranslation: '',
          category: 'ارتباطات (Kommunikation)',
          conjugation: 'rufe an, rufst an, ruft an, rufen an, ruft an, rufen an',
          preteritum: 'rief an',
          perfekt: 'hat angerufen',
          separablePrefix: 'an',
          notes: 'فعل پیشوندی جداشدنی. مفعول مستقیم Akkusativ می‌گیرد.'
        },
        {
          german: 'schnell',
          article: '',
          persian: 'سریع، تند',
          english: 'fast, quick',
          plural: '',
          partOfSpeech: 'صفت',
          level: 'A1',
          'definition (Bedeutung)': 'Schnell bedeutet mit hoher Geschwindigkeit, in kurzer Zeit.',
          definitionTranslation: 'سریع یعنی با سرعت زیاد و در زمان کوتاه.',
          'example (Redemittel)': 'Der Zug fährt sehr schnell.',
          example2Translation: 'قطار خیلی سریع حرکت می‌کند.',
          synonym: 'rasch',
          synonymTranslation: 'شتابان، سریع',
          antonym: 'langsam',
          antonymTranslation: 'آرام، کند',
          category: 'پایه (Grundwortschatz)',
          conjugation: '',
          preteritum: '',
          perfekt: '',
          separablePrefix: '',
          notes: 'درجه‌بندی: schnell, schneller, am schnellsten'
        }
      ];

      const wsVocab = XLSX.utils.json_to_sheet(sampleRows, { header: vocabHeaders });
      wsVocab['!cols'] = [
        { wch: 18 },
        { wch: 8 },
        { wch: 22 },
        { wch: 20 },
        { wch: 12 },
        { wch: 8 },
        { wch: 38 },
        { wch: 35 },
        { wch: 35 },
        { wch: 30 },
        { wch: 16 },
        { wch: 18 },
        { wch: 18 },
        { wch: 20 },
        { wch: 25 },
        { wch: 30 },
        { wch: 14 },
        { wch: 16 },
        { wch: 14 },
        { wch: 45 }
      ];
      XLSX.utils.book_append_sheet(wb, wsVocab, 'قالب واژگان');

      const instructionRows = [
        { 'ستون': 'german', 'وضعیت': 'الزامی', 'توضیحات': 'سرواژه یا اصطلاح آلمانی در شکل پایه یا مصدری' },
        { 'ستون': 'persian', 'وضعیت': 'الزامی', 'توضیحات': 'ترجمه فارسی روان و دقیق واژه' },
        { 'ستون': 'article', 'وضعیت': 'اختیاری', 'توضیحات': 'فقط برای اسامی: der یا die یا das' },
        { 'ستون': 'plural', 'وضعیت': 'اختیاری', 'توضیحات': 'شکل جمع اسم (مثلاً die Tische یا -e)' },
        { 'ستون': 'partOfSpeech', 'وضعیت': 'اختیاری', 'توضیحات': 'نوع دستوری: اسم، فعل، صفت، قید، اصطلاح' },
        { 'ستون': 'level', 'وضعیت': 'اختیاری', 'توضیحات': 'سطح CEFR از A1 تا C2' },
        { 'ستون': 'example', 'وضعیت': 'اختیاری', 'توضیحات': 'جمله مثال کاربردی آلمانی' },
        { 'ستون': 'exampleTranslation', 'وضعیت': 'اختیاری', 'توضیحات': 'ترجمه فارسی جمله مثال اول' },
        { 'ستون': 'category', 'وضعیت': 'اختیاری', 'توضیحات': 'دسته موضوعی، در صورت خالی بودن دسته عمومی لحاظ می‌شود' },
        { 'ستون': 'راهنما', 'وضعیت': 'نکته مهم', 'توضیحات': 'می‌توانید ردیف‌های نمونه را با واژگان دلخواه خود جایگزین کرده و فایل را بدون تغییر عناوین ستون‌ها مستقیماً در برنامه وارد کنید.' }
      ];
      const wsInst = XLSX.utils.json_to_sheet(instructionRows);
      wsInst['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 60 }];
      XLSX.utils.book_append_sheet(wb, wsInst, 'راهنمای تکمیل');

      XLSX.writeFile(wb, 'deutschlab_template.xlsx');
      onShowToast('قالب استاندارد اکسل (.xlsx) با موفقیت دانلود شد.');
    } catch (err: any) {
      console.error('Template generation error:', err);
      onShowToast('خطا در تولید فایل قالب اکسل', true);
    }
  };

  const downloadFile = (filename: string, content: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 1000);
  };

  // Convert words to CSV
  const wordsToCSV = (ws: Word[]): string => {
    const headers = [
      'id',
      'german',
      'article',
      'persian',
      'synonym',
      'synonymTranslation',
      'antonym',
      'antonymTranslation',
      'plural',
      'partOfSpeech',
      'level',
      'example',
      'exampleTranslation',
      'example2',
      'example2Translation',
      'conjugation',
      'preteritum',
      'perfekt',
      'separablePrefix',
      'clozeSentence',
      'clozeAnswer',
      'acceptedAnswers',
      'tags',
      'notes',
      'category'
    ];
    const esc = (v: any) => {
      const s = String(v == null ? '' : v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = ws.map(w =>
      [
        w.id,
        w.de,
        w.art,
        w.fa,
        w.syn,
        w.synFa,
        w.ant,
        w.antFa,
        w.pl,
        w.pos,
        w.lvl,
        w.ex,
        w.exFa,
        w.ex2,
        w.ex2Fa,
        w.conj,
        w.prat,
        w.perf,
        w.sep,
        w.cloze,
        w.ans,
        w.acc?.join('|') || '',
        w.tags,
        w.notes,
        w.cat
      ]
        .map(esc)
        .join(',')
    );
    return '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
  };

  // Handle Bulk AI auto-fill
  const handleBulkAutoFill = async () => {
    const lines = bulkText.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      onShowToast('ابتدا فهرست کلمات را بنویسید.', true);
      return;
    }

    let finalCatOverride: string | undefined = undefined;
    if (bulkCategory === '__new') {
      const resolved = resolveCat(bulkNewCatName, words);
      if (resolved) finalCatOverride = resolved;
    } else if (bulkCategory) {
      finalCatOverride = bulkCategory;
    }

    setBulkLoading(true);
    setBulkStatus('در حال بررسی املای واژه‌ها...');
    try {
      // Spelling check: fix misspelled words, skip words that do not exist in German
      const spellable = lines.filter(l => l.length <= 40 && l.split(/\s+/).length <= 3);
      const spell = await checkGermanSpelling(spellable);
      const spellMsgs: string[] = [];
      const cleanedLines: string[] = [];
      lines.forEach(l => {
        const r = spell[l];
        if (r?.status === 'invalid') {
          spellMsgs.push(`«${l}» چنین لغتی در زبان آلمانی وجود ندارد و وارد نشد.`);
        } else if (r?.status === 'corrected' && r.suggestion && r.suggestion.toLowerCase() !== l.toLowerCase()) {
          spellMsgs.push(`املای «${l}» به «${r.suggestion}» اصلاح شد.`);
          cleanedLines.push(r.suggestion);
        } else {
          cleanedLines.push(l);
        }
      });
      if (cleanedLines.length === 0) {
        setPendingImport(null);
        setBulkStatus(spellMsgs.join(' • ') || 'واژهٔ معتبری برای افزودن پیدا نشد.');
        onShowToast('هیچ‌کدام از واژه‌ها املای معتبر آلمانی نداشتند.', true);
        return;
      }

      setBulkStatus('در حال آماده‌سازی و ارسال به هوش مصنوعی...');
      const { ws, errs } = await processBatchWordsWithGemini(
        cleanedLines,
        words,
        finalCatOverride,
        (_done, _total, msg) => setBulkStatus(msg)
      );

      setPendingImport({
        words: ws,
        errors: [...spellMsgs, ...errs]
      });
      setBulkStatus(`تکمیل شد: ${ws.length} واژه آماده وارد کردن است.`);
    } catch (err: any) {
      console.error(err);
      onShowToast(err.message || 'خطا در تکمیل خودکار', true);
      setBulkStatus('خطا در ارتباط با هوش مصنوعی. می‌توانید از دکمه «کپی دستور گروهی» استفاده کنید.');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleCopyBulkPrompt = async () => {
    const lines = bulkText.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      onShowToast('ابتدا فهرست کلمات را بنویسید.', true);
      return;
    }
    let finalCatOverride: string | undefined = undefined;
    if (bulkCategory === '__new') {
      finalCatOverride = resolveCat(bulkNewCatName, words);
    } else if (bulkCategory) {
      finalCatOverride = bulkCategory;
    }

    // no network request: the prompt is only built and copied (works without any API key or quota)
    const prompt = AIPM(lines, words, finalCatOverride);
    if (await copyText(prompt)) {
      onShowToast('دستور گروهی کپی شد. می‌توانید در ChatGPT یا Claude بچسبانید.');
    } else {
      onShowToast('کپی در کلیپ‌بورد ممکن نشد؛ مرورگر اجازهٔ کپی نمی‌دهد.', true);
    }
  };

  const handleApplyPastedBulkJson = () => {
    if (!pastedJson.trim()) return;
    try {
      const parsed = parseAI(pastedJson);
      let finalCatOverride: string | undefined = undefined;
      if (bulkCategory === '__new') {
        finalCatOverride = resolveCat(bulkNewCatName, words);
      } else if (bulkCategory) {
        finalCatOverride = bulkCategory;
      }
      const { ws, errs } = aiToIMP(parsed, words, finalCatOverride);
      setPendingImport({
        words: ws,
        errors: errs
      });
      setPastedJson('');
      onShowToast(`${ws.length} واژه در پیش‌نمایش بارگذاری شد.`);
    } catch (e: any) {
      onShowToast('محتوای چسبانده‌شده یک JSON معتبر نیست.', true);
    }
  };

  // Multi-format File Upload Parser (.xlsx, .xls, .csv, .json)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const lowerName = file.name.toLowerCase();

    try {
      if (lowerName.endsWith('.json')) {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (parsed && Array.isArray(parsed.words)) {
          // Full app backup
          setPendingImport({
            words: parsed.words.map(norm).filter(Boolean) as Word[],
            errors: [],
            backupState: parsed
          });
          onShowToast('فایل پشتیبان کامل JSON بارگذاری شد.');
        } else if (Array.isArray(parsed)) {
          const { ws, errs } = aiToIMP(parsed, words);
          setPendingImport({ words: ws, errors: errs });
        } else {
          throw new Error('فرمت فایل JSON نامعتبر است.');
        }
      } else if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
        // Genuine Excel Workbook parsing
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) throw new Error('فایل اکسل هیچ برگه‌ای (Sheet) ندارد.');

        const worksheet = workbook.Sheets[sheetName];
        const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        if (rawRows.length === 0) throw new Error('برگه اول فایل اکسل خالی است یا عنوانی ندارد.');

        const ws: Word[] = [];
        const errs: string[] = [];

        rawRows.forEach((row, rowIdx) => {
          // Normalize row keys to lowercase without spaces/underscores
          const normRow: Record<string, string> = {};
          for (const [k, v] of Object.entries(row)) {
            const cleanKey = k.trim().toLowerCase().replace(/[\s"_-]/g, '');
            normRow[cleanKey] = typeof v === 'string' ? v.trim() : (v != null ? String(v).trim() : '');
          }

          const getVal = (aliases: string[]): string => {
            for (const a of aliases) {
              if (normRow[a]) return normRow[a];
            }
            return '';
          };

          const de = getVal(['german', 'de', 'word', 'wort', 'آلمانی', 'کلمه', 'واژه']);
          const fa = getVal(['persian', 'fa', 'translation', 'farsi', 'ترجمه', 'فارسی', 'معنی']);

          if (!de) {
            errs.push(`سطر ${rowIdx + 2}: ستون واژه آلمانی (german) خالی است.`);
            return;
          }
          if (!fa) {
            errs.push(`سطر ${rowIdx + 2} (${de}): ستون ترجمه فارسی (persian) خالی است.`);
            return;
          }

          const art = getVal(['article', 'art', 'آرتیکل']);
          const pl = getVal(['plural', 'pl', 'جمع']);
          const pos = getVal(['partofspeech', 'pos', 'نوع', 'نقش']);
          const lvl = getVal(['level', 'lvl', 'سطح']);
          const ex = getVal(['example', 'ex', 'مثال']);
          const exFa = getVal(['exampletranslation', 'exfa', 'ترجمهمثال']);
          const ex2 = getVal(['example2', 'ex2', 'مثالکاربردی']);
          const ex2Fa = getVal(['example2translation', 'ex2fa', 'ترجمهمثالکاربردی']);
          const en = getVal(['english', 'en', 'معادلانگلیسی', 'انگلیسی']);
          const syn = getVal(['synonym', 'syn', 'مترادف']);
          const synFa = getVal(['synonymtranslation', 'synfa']);
          const ant = getVal(['antonym', 'ant', 'متضاد']);
          const antFa = getVal(['antonymtranslation', 'antfa']);
          const cat = getVal(['category', 'cat', 'دسته', 'دسته‌بندی']);
          const conj = getVal(['conjugation', 'conj', 'صرف']);
          const prat = getVal(['preteritum', 'prat']);
          const perf = getVal(['perfekt', 'perf']);
          const sep = getVal(['separableprefix', 'sep']);
          const notes = getVal(['notes', 'یادداشت', 'نکات']);
          const tags = getVal(['tags', 'برچسب']);

          const w = norm({
            de,
            art,
            fa,
            pl,
            pos,
            lvl,
            ex,
            exFa,
            ex2,
            ex2Fa,
            en,
            syn,
            synFa,
            ant,
            antFa,
            cat,
            conj,
            prat,
            perf,
            sep,
            notes,
            tags
          });

          if (w) ws.push(applyGermanQuality(w));
        });

        if (ws.length === 0 && errs.length > 0) {
          throw new Error(errs[0]);
        }

        setPendingImport({ words: ws, errors: errs });
        onShowToast(`${ws.length} واژه از فایل اکسل (${file.name}) بارگذاری شد.`);
      } else {
        // Comprehensive CSV parsing
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) throw new Error('فایل خالی است یا عنوان ندارد.');

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[\s"_-]/g, ''));
        const deIdx = headers.findIndex(h => ['german', 'de', 'word', 'wort', 'آلمانی'].includes(h));
        const faIdx = headers.findIndex(h => ['persian', 'fa', 'translation', 'farsi', 'ترجمه', 'فارسی'].includes(h));

        if (deIdx < 0 || faIdx < 0) {
          throw new Error('ستون‌های german و persian در فایل الزامی هستند.');
        }

        const artIdx = headers.findIndex(h => ['article', 'art', 'آرتیکل'].includes(h));
        const plIdx = headers.findIndex(h => ['plural', 'pl', 'جمع'].includes(h));
        const posIdx = headers.findIndex(h => ['partofspeech', 'pos', 'نقش'].includes(h));
        const lvlIdx = headers.findIndex(h => ['level', 'lvl', 'سطح'].includes(h));
        const exIdx = headers.findIndex(h => ['example', 'ex', 'مثال', 'definition', 'bedeutung', 'تعریف'].includes(h));
        const exFaIdx = headers.findIndex(h => ['exampletranslation', 'exfa', 'ترجمهمثال', 'ترجمهتعریف'].includes(h));
        const ex2Idx = headers.findIndex(h => ['example2', 'ex2', 'مثال2', 'مثالکاربردی'].includes(h));
        const ex2FaIdx = headers.findIndex(h => ['example2translation', 'ex2fa', 'ترجمهمثال2'].includes(h));
        const enIdx = headers.findIndex(h => ['english', 'en', 'معادلانگلیسی', 'انگلیسی'].includes(h));
        const catIdx = headers.findIndex(h => ['category', 'cat', 'دسته'].includes(h));

        const ws: Word[] = [];
        const errs: string[] = [];

        lines.slice(1).forEach((line, rowIdx) => {
          const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
          const de = cols[deIdx];
          const fa = cols[faIdx];
          if (!de) {
            errs.push(`سطر ${rowIdx + 2}: کلمه آلمانی خالی است`);
            return;
          }
          if (!fa) {
            errs.push(`سطر ${rowIdx + 2} (${de}): ترجمه فارسی خالی است`);
            return;
          }

          const w = norm({
            de,
            fa,
            art: artIdx >= 0 ? cols[artIdx] : '',
            pl: plIdx >= 0 ? cols[plIdx] : '',
            pos: posIdx >= 0 ? cols[posIdx] : '',
            lvl: lvlIdx >= 0 ? cols[lvlIdx] : '',
            ex: exIdx >= 0 ? cols[exIdx] : '',
            exFa: exFaIdx >= 0 ? cols[exFaIdx] : '',
            ex2: ex2Idx >= 0 ? cols[ex2Idx] : '',
            ex2Fa: ex2FaIdx >= 0 ? cols[ex2FaIdx] : '',
            en: enIdx >= 0 ? cols[enIdx] : '',
            cat: catIdx >= 0 ? cols[catIdx] : ''
          });
          if (w) ws.push(applyGermanQuality(w));
        });

        setPendingImport({ words: ws, errors: errs });
        onShowToast(`${ws.length} واژه از فایل CSV خوانده شد.`);
      }
    } catch (err: any) {
      console.error('File upload error:', err);
      onShowToast(err.message || 'خطا در خواندن فایل', true);
    }
  };

  return (
    <div className="space-y-5 text-right">
      {/* Pending Import Preview Card */}
      {pendingImport && (
        <div className="bg-white dark:bg-[#1b2029] border-2 border-emerald-400 dark:border-emerald-700 rounded-3xl p-5 shadow-md space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between border-b pb-3">
            <h3 className="font-bold text-base md:text-lg text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
              <span>📋</span> پیش‌نمایش داده‌های آمادهٔ ورود
            </h3>
            <button
              onClick={() => setPendingImport(null)}
              className="text-xs bg-slate-200 dark:bg-slate-800 px-3 py-1 rounded-xl font-semibold"
            >
              ×
            </button>
          </div>

          <div className="text-xs text-[#5d6676] space-y-1">
            <p>
              تعداد واژگان معتبر: <b className="text-emerald-600 text-sm">{pendingImport.words.length}</b> واژه
              {pendingImport.errors.length > 0 && (
                <span className="text-red-500 mr-2">({pendingImport.errors.length} خطا نادیده گرفته شد)</span>
              )}
            </p>
          </div>

          {/*
            Fulfills User Request #2:
            "وقتی هوش مصنوعی لیست لغات اضافه میکنه چرا میره دسته جدید درست میکنه ؟ باید تو دسته های قبلی بگنجاند. اگر نبود پیشنهاد بده سوال کنه از کاربر ک آیا میخواید فلان کلمه در دسته جدید با نام فلان ذخیره شود ، بعد دسته جدید اضافه بشه . پس فقط میره از لیست دسته های موجود انتخاب میکنه و انتقال میده اونجا"
          */}
          {pendingImport.words.some(w => w.suggestedNewCat) && (
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-2xl p-3.5 space-y-2">
              <b className="text-xs text-amber-900 dark:text-amber-200 block">
                💡 پیشنهاد دسته‌بندی جدید توسط هوش مصنوعی:
              </b>
              <p className="text-[11px] text-[#5d6676] dark:text-[#a3adbd]">
                واژه‌های زیر به صورت پیش‌فرض در دسته‌های موجود قرار داده شده‌اند. اگر مایلید، می‌توانید ساخت دستهٔ پیشنهادی را تأیید کنید:
              </p>
              <div className="space-y-2 pt-1">
                {pendingImport.words.filter(w => w.suggestedNewCat).map((w, idx) => (
                  <div key={idx} className="flex flex-wrap items-center justify-between gap-2 text-xs bg-white dark:bg-[#1a202c] p-2.5 rounded-xl border border-amber-200 dark:border-amber-900 shadow-2xs">
                    <div>
                      <span>آیا واژهٔ <b>«{w.de}»</b> در دستهٔ جدید <b>«{w.suggestedNewCat}»</b> ذخیره شود؟</span>
                      <span className="text-[10px] text-slate-500 block mt-0.5">
                        (دسته فعلی در نظر گرفته شده: {w.cat})
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          setPendingImport(prev => {
                            if (!prev) return null;
                            const nextWords = prev.words.map(x =>
                              (x.id === w.id || (x.de === w.de && x.cat === w.cat))
                                ? { ...x, cat: w.suggestedNewCat!, suggestedNewCat: undefined }
                                : x
                            );
                            return { ...prev, words: nextWords };
                          });
                          onShowToast(`دسته جدید «${w.suggestedNewCat}» تایید شد.`);
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg font-bold text-[11px]"
                      >
                        ✅ بله، ایجاد دسته جدید
                      </button>
                      <button
                        onClick={() => {
                          setPendingImport(prev => {
                            if (!prev) return null;
                            const nextWords = prev.words.map(x =>
                              (x.id === w.id || (x.de === w.de && x.cat === w.cat))
                                ? { ...x, suggestedNewCat: undefined }
                                : x
                            );
                            return { ...prev, words: nextWords };
                          });
                          onShowToast(`در دسته موجود (${w.cat}) ماند.`);
                        }}
                        className="bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-2.5 py-1 rounded-lg text-[11px]"
                      >
                        ❌ خیر، در دسته فعلی بماند
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Which words are new and which already exist (nothing is changed before you choose a button below) */}
          {(() => {
            const c = classifyImport(pendingImport.words, words);
            return (
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] text-xs space-y-1.5">
                <div className="flex flex-wrap gap-x-4 gap-y-1 font-bold">
                  <span className="text-emerald-700 dark:text-emerald-400">🆕 جدید: {c.fresh.length}</span>
                  <span className="text-amber-700 dark:text-amber-400">♻️ از قبل موجود: {c.conflicts.length}</span>
                  {c.repeated.length > 0 && <span className="text-slate-500">تکراری داخل همین فهرست: {c.repeated.length}</span>}
                  {c.invalid.length > 0 && <span className="text-red-600">نامعتبر: {c.invalid.length}</span>}
                </div>
                {c.conflicts.length > 0 && (
                  <p className="text-[#5d6676] dark:text-[#a3adbd] leading-6" dir="ltr">
                    {c.conflicts.slice(0, 8).map(x => (x.existing.art ? `${x.existing.art} ` : '') + x.existing.de).join(', ')}
                    {c.conflicts.length > 8 ? ` … +${c.conflicts.length - 8}` : ''}
                  </p>
                )}
                {c.conflicts.length > 0 && (
                  <p className="text-[#5d6676] dark:text-[#a3adbd] leading-6">
                    «افزودن» فقط واژه‌های جدید را ثبت می‌کند و موجودها را دست‌نخورده می‌گذارد. «به‌روزرسانی» اطلاعات تازه را با واژهٔ موجود ادغام می‌کند (شناسه، دسته و پیشرفت یادگیری حفظ می‌شود و مقدار خالی چیزی را پاک نمی‌کند).
                  </p>
                )}
              </div>
            );
          })()}

          {/* Quick list preview */}
          <div className="max-h-44 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs bg-slate-50 dark:bg-[#141923] p-3 rounded-2xl border">
            {pendingImport.words.slice(0, 8).map((w, i) => (
              <div key={i} className="py-1.5 flex items-center justify-between" dir="ltr">
                <span className="font-bold">{w.art ? `${w.art} ${w.de}` : w.de}</span>
                <span className="text-slate-500" dir="rtl">{w.fa}</span>
              </div>
            ))}
            {pendingImport.words.length > 8 && (
              <div className="pt-2 text-center text-[#5d6676]">
                ... و {pendingImport.words.length - 8} واژه دیگر
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              onClick={() => {
                onImportWords(pendingImport.words, false);
                setPendingImport(null);
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs md:text-sm font-bold shadow-xs transition"
            >
              ➕ افزودن (بدون بازنویسی تکراری‌ها)
            </button>
            <button
              onClick={() => {
                if (confirm('واژه‌های تکراری با مقادیر جدید بازنویسی شوند؟')) {
                  onImportWords(pendingImport.words, true);
                  setPendingImport(null);
                }
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs md:text-sm font-bold shadow-xs transition"
            >
              🔄 به‌روزرسانی و بازنویسی تکراری‌ها
            </button>
            {pendingImport.backupState && (
              <button
                onClick={() => {
                  if (confirm('⚠️ کلیه واژگان و تاریخچه‌های فعلی با این نسخه پشتیبان جایگزین خواهند شد. ادامه؟')) {
                    onRestoreBackup(pendingImport.backupState!);
                    setPendingImport(null);
                  }
                }}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-xs md:text-sm font-bold shadow-xs transition"
              >
                ♻️ جایگزینی کامل با پشتیبان
              </button>
            )}
          </div>
        </div>
      )}

      {/*
        Fulfills User Request #15:
        "اول « افزودن گروهی با هوش مصنوعی» باشه،
        بعد «ورود (CSV یا JSON) » باشه ،
        بعد «خروجی/پشتیبان گیری»"
      */}

      {/* 1. FIRST CARD: افزودن گروهی با هوش مصنوعی */}
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-4 md:p-5 shadow-xs space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <span className="text-2xl leading-none mt-0.5">🤖</span>
            <div className="min-w-0">
              <b className="block text-sm md:text-base text-slate-900 dark:text-slate-100">افزودن گروهی با هوش مصنوعی</b>
              <p className="text-[11px] md:text-xs text-[#5d6676] dark:text-[#a3adbd] leading-relaxed mt-0.5">
                کلمات آلمانی را بنویسید تا ترجمه، مثال، آرتیکل، صرف و یادداشت‌ها خودکار تولید شوند.
              </p>
            </div>
          </div>
          <button
            onClick={() => onOpenHelp('bulk_ai')}
            aria-label="راهنما"
            title="راهنما"
            className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-50 text-[#1f5fbf] hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 text-base font-extrabold transition flex items-center justify-center"
          >
            !
          </button>
        </div>

        {/* Words box */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200">کلمات (هر کلمه در یک خط)</label>
            <button
              onClick={onOpenImageExtract}
              className="bg-blue-50 hover:bg-blue-100 text-[#1f5fbf] dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-900 px-3 py-1.5 rounded-xl text-[11px] md:text-xs font-bold transition flex items-center gap-1"
            >
              <span>📷 استخراج از تصویر</span>
            </button>
          </div>
          <textarea
            dir="ltr"
            rows={5}
            placeholder="z.B.&#10;Entscheidung&#10;[B2] zur Verfügung stehen&#10;nachhaltig"
            value={bulkText}
            onChange={e => setBulkText(e.target.value)}
            className="w-full bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2.5 text-sm leading-relaxed outline-none font-sans focus:border-[#1f5fbf]"
          />
        </div>

        {/* Category */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">دستهٔ لغات</label>
          <select
            value={bulkCategory}
            onChange={e => setBulkCategory(e.target.value)}
            className="w-full bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2.5 text-sm outline-none font-medium focus:border-[#1f5fbf]"
          >
            <option value="">📁 به تشخیص هوش مصنوعی</option>
            {categories.map(([c, n]) => (
              <option key={c} value={c}>
                {c} ({n} واژه)
              </option>
            ))}
            <option value="__new">➕ دستهٔ جدید…</option>
          </select>
          {bulkCategory === '__new' && (
            <input
              type="text"
              placeholder="نام دستهٔ جدید..."
              value={bulkNewCatName}
              onChange={e => setBulkNewCatName(e.target.value)}
              className="w-full bg-slate-50 dark:bg-[#141923] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#1f5fbf]"
            />
          )}
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-2.5">
          <button
            onClick={handleBulkAutoFill}
            disabled={bulkLoading || !bulkText.trim()}
            className="bg-gradient-to-r from-[#1f5fbf] to-[#6b4fd8] text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-xs hover:opacity-95 disabled:opacity-40 transition"
          >
            {bulkLoading ? '⏳ در حال تکمیل...' : '✨ تکمیل خودکار همهٔ کلمات'}
          </button>
          <button
            onClick={handleCopyBulkPrompt}
            disabled={!bulkText.trim()}
            className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-[#dde1ea] dark:border-[#333b4a] px-3 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 transition"
          >
            📋 کپی دستور گروهی
          </button>
        </div>

        {bulkStatus && (
          <p className="text-xs text-[#1f5fbf] dark:text-[#7fb0ff] bg-blue-50/60 dark:bg-blue-950/20 rounded-xl px-3 py-2">{bulkStatus}</p>
        )}

        {/* Collapsible Manual JSON Paste */}
        <details className="text-xs border border-[#dde1ea] dark:border-[#333b4a] rounded-xl bg-slate-50/60 dark:bg-[#141923]/60">
          <summary className="cursor-pointer px-3 py-2.5 text-[#5d6676] dark:text-[#a3adbd] hover:text-[#1f5fbf] font-semibold">
            یا خروجی JSON هوش مصنوعی را دستی اینجا بچسبانید
          </summary>
          <div className="px-3 pb-3 space-y-2">
            <textarea
              dir="ltr"
              rows={3}
              placeholder="JSON خروجی هوش مصنوعی را اینجا بچسبانید..."
              value={pastedJson}
              onChange={e => setPastedJson(e.target.value)}
              className="w-full bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-xl p-2.5 text-xs outline-none font-mono focus:border-[#1f5fbf]"
            />
            <button
              onClick={handleApplyPastedBulkJson}
              disabled={!pastedJson.trim()}
              className="w-full bg-[#1f5fbf] text-white px-3.5 py-2 rounded-xl text-sm font-bold disabled:opacity-40"
            >
              وارد کردن متن چسبانده‌شده
            </button>
          </div>
        </details>
      </div>

      {/* 2. SECOND CARD: ورود (Excel, CSV یا JSON) - Fulfills Task 3 */}
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-5 shadow-xs space-y-4">
        <div className="rounded-xl border border-sky-200 dark:border-sky-900 bg-sky-50/60 dark:bg-sky-950/30 px-3.5 py-2.5 text-xs leading-6 text-slate-700 dark:text-slate-200">
          💡 برای استخراج واژه از <b>تصویر/PDF/متن</b> با تنظیمات سه‌وضعیتی (سبک/نیمه/کامل)، دستهٔ گروهی و فیلتر سطح → واژگان ← <b>📦 افزودن واژگان گروهی</b>. این کارت برای ورود مستقیم فایل‌های اکسل/CSV/JSON و پشتیبان‌ها است.
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📥</span>
            <div>
              <b className="text-base text-slate-900 dark:text-slate-100">ورود فایل (Excel, CSV یا JSON)</b>
              <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">
                پشتیبان‌های قبلی برنامه، فایل‌های اکسل (.xlsx) یا فایل‌های واژگان CSV استاندارد را وارد کنید
              </p>
            </div>
          </div>

          {/* Help button beside heading (Task 3.1) */}
          <button
            type="button"
            onClick={() => setIsHelpModalOpen(true)}
            className="bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900 text-[#1f5fbf] dark:text-[#7fb0ff] border border-blue-200 dark:border-blue-800 px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="مشاهده راهنمای قالب فایل و ستون‌های استاندارد"
          >
            <span>ℹ️ راهنمای ورود فایل</span>
          </button>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
              انتخاب فایل از دستگاه (.xlsx, .xls, .csv, .json):
            </label>

            {/* Downloadable sample Excel template button (Task 3.2) */}
            <button
              type="button"
              onClick={generateExcelTemplate}
              className="bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="دانلود فایل اکسل نمونه با ستون‌های استاندارد و نمونه‌های کاربردی"
            >
              <span>📗 دانلود قالب نمونه اکسل (.xlsx)</span>
            </button>
          </div>

          <input
            type="file"
            accept=".xlsx,.xls,.csv,.json"
            onChange={handleFileUpload}
            className="w-full text-xs file:bg-slate-100 dark:file:bg-slate-800 file:border-0 file:rounded-xl file:px-4 file:py-2.5 file:text-xs file:font-bold file:mr-2 cursor-pointer border border-[#dde1ea] dark:border-[#333b4a] rounded-2xl p-2 bg-slate-50/50 dark:bg-[#141923]"
          />
        </div>
      </div>

      {/*
        3. THIRD CARD: خروجی/پشتیبان گیری
        Fulfills User Request #15:
        "سه تا گزینه زیر خروجی هم توی یک خط جا داده بشن"
      */}
      <div className="bg-white dark:bg-[#1b2029] border border-[#dde1ea] dark:border-[#333b4a] rounded-3xl p-5 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b pb-3">
          <span className="text-2xl">💾</span>
          <div>
            <b className="text-base text-slate-900 dark:text-slate-100">خروجی و پشتیبان‌گیری</b>
            <p className="text-xs text-[#5d6676] dark:text-[#a3adbd]">
              دانلود واژگان در قالب فایل اکسل/CSV و ذخیره نسخه کامل تاریخچه و تنظیمات
            </p>
          </div>
        </div>

        {/* The 3 buttons side-by-side in a single line! */}
        <div className="flex flex-row flex-wrap md:flex-nowrap items-center gap-2.5">
          <button
            onClick={() => downloadFile('deutschlab_vocab.csv', wordsToCSV(words), 'text/csv')}
            className="flex-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-[#dde1ea] dark:border-[#333b4a] py-2.5 px-3 rounded-xl text-xs md:text-sm font-bold transition flex items-center justify-center gap-1.5 shadow-xs"
          >
            <span>📊 واژگان (CSV)</span>
          </button>

          <button
            onClick={() => downloadFile('worterbuch_backup.json', JSON.stringify(state, null, 2), 'application/json')}
            className="flex-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-[#dde1ea] dark:border-[#333b4a] py-2.5 px-3 rounded-xl text-xs md:text-sm font-bold transition flex items-center justify-center gap-1.5 shadow-xs"
          >
            <span>💾 پشتیبان کامل (JSON)</span>
          </button>

          <button
            onClick={() => downloadFile('deutschlab_history.json', JSON.stringify(state.hist, null, 2), 'application/json')}
            className="flex-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-[#dde1ea] dark:border-[#333b4a] py-2.5 px-3 rounded-xl text-xs md:text-sm font-bold transition flex items-center justify-center gap-1.5 shadow-xs"
          >
            <span>📈 تاریخچهٔ مرور (JSON)</span>
          </button>
        </div>

        <button
          onClick={() => {
            downloadFile('worterbuch_anki_deck.txt', buildAnkiText(words), 'text/plain;charset=utf-8');
            onShowToast(`${words.length} کارت Anki ساخته شد — در Anki: File ← Import.`);
          }}
          className="w-full bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/40 dark:hover:bg-violet-900/60 text-violet-800 dark:text-violet-300 border border-violet-200 dark:border-violet-800 py-2.5 px-3 rounded-xl text-xs md:text-sm font-bold transition flex items-center justify-center gap-2"
          title="خروجی استاندارد Anki (TSV) برای درون‌ریزی مستقیم"
        >
          <span>🃏 خروجی Anki — {words.length} کارت آماده</span>
          <span className="text-[10px] font-normal opacity-70 hidden sm:inline">(در Anki: File ← Import)</span>
        </button>
      </div>

      {/* Import Help Modal (Task 3.1) */}
      {isHelpModalOpen && (
        <ImportHelpModal
          onClose={() => setIsHelpModalOpen(false)}
          onDownloadTemplate={generateExcelTemplate}
        />
      )}
    </div>
  );
};
