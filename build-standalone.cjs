const fs = require('fs');
const path = require('path');

// Read the base HTML file
const srcPath = path.join(__dirname, 'public', 'assets', 'aistudio', 'index_149fd5e3.html');
let html = fs.readFileSync(srcPath, 'utf8');

console.log('Original length:', html.length);

// 1. Direct Theme Enforcement (User Request #1)
// Replace line 10 script theme loader: do NOT fallback to OS matchMedia
html = html.replace(
  `document.documentElement.dataset.theme=(t&&t.theme)||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light')`,
  `var themeMode=(t&&t.theme)||'light';document.documentElement.dataset.theme=themeMode;document.documentElement.setAttribute('data-theme',themeMode);document.documentElement.style.colorScheme=themeMode;`
);

// Update setTheme function to directly apply to documentElement and body and colorScheme
html = html.replace(
  `function setTheme(t){st.set.theme=t;document.documentElement.dataset.theme=t;save()}`,
  `function setTheme(t){st.set.theme=t;document.documentElement.dataset.theme=t;document.documentElement.setAttribute('data-theme',t);if(document.body)document.body.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t;save()}`
);

// In CSS, add strict color-scheme overrides so mobile OS dark/light cannot interfere
html = html.replace(
  `:root{--g:linear-gradient(135deg,#1f5fbf,#6b4fd8);--bg:#f6f7fb;--card:#fff;--tx:#1d2330;--mu:#5d6676;--bd:#dde1ea;--ac:#1f5fbf;--acx:#fff;--ok:#0d7a3e;--okb:#e2f5ea;--er:#b3261e;--erb:#fdeaea;color-scheme:light}`,
  `:root,:root[data-theme=light],html[data-theme=light],body[data-theme=light]{--g:linear-gradient(135deg,#1f5fbf,#6b4fd8);--bg:#f6f7fb;--card:#fff;--tx:#1d2330;--mu:#5d6676;--bd:#dde1ea;--ac:#1f5fbf;--acx:#fff;--ok:#0d7a3e;--okb:#e2f5ea;--er:#b3261e;--erb:#fdeaea;color-scheme:light!important}`
);

html = html.replace(
  `:root[data-theme=dark]{--g:linear-gradient(135deg,#7fb0ff,#b39bff);--bg:#12151c;--card:#1b2029;--tx:#eef1f6;--mu:#a3adbd;--bd:#333b4a;--ac:#7fb0ff;--acx:#0b1220;--ok:#6fe0a0;--okb:#12301f;--er:#ff9a92;--erb:#3a1a18;color-scheme:dark}`,
  `:root[data-theme=dark],html[data-theme=dark],body[data-theme=dark]{--g:linear-gradient(135deg,#7fb0ff,#b39bff);--bg:#12151c;--card:#1b2029;--tx:#eef1f6;--mu:#a3adbd;--bd:#333b4a;--ac:#7fb0ff;--acx:#0b1220;--ok:#6fe0a0;--okb:#12301f;--er:#ff9a92;--erb:#3a1a18;color-scheme:dark!important}`
);

// 2. Increase base font size by one size (User Request #2)
html = html.replace(
  `body{margin:0;background:radial-gradient(1000px 460px at 100% -8%,color-mix(in srgb,var(--ac) 14%,transparent),transparent),var(--bg);background-attachment:fixed;color:var(--tx);font:16px/1.8 'IRANYekan','IRANYekanX','Iran Yekan',Vazirmatn,Tahoma,system-ui,sans-serif;padding-bottom:env(safe-area-inset-bottom,0)}`,
  `html{font-size:17.5px}body{margin:0;background:radial-gradient(1000px 460px at 100% -8%,color-mix(in srgb,var(--ac) 14%,transparent),transparent),var(--bg);background-attachment:fixed;color:var(--tx);font:17.5px/1.85 'IRANYekan','IRANYekanX','Iran Yekan',Vazirmatn,Tahoma,system-ui,sans-serif;padding-bottom:env(safe-area-inset-bottom,0)}`
);

// 3. Floating Back Button at Bottom Left (User Request #3)
// Remove #bk from header
html = html.replace(
  `<div class="row">\n    <button id="bk" aria-label="بازگشت">↩ بازگشت</button>\n    <h1>`,
  `<div class="row">\n    <h1>`
);
html = html.replace(
  `<div class="row">\n    <button id="bk" aria-label="بازگشت">↩ بازگشت</button><h1>`,
  `<div class="row"><h1>`
);
// Style floating #bk at bottom left
html = html.replace(
  `#bk{position:fixed;left:.8rem;bottom:calc(.8rem + env(safe-area-inset-bottom,0px));z-index:14;border-radius:999px;box-shadow:0 6px 18px rgba(20,30,60,.28);background:var(--g);color:var(--acx);border:0;font-weight:700;min-height:42px;padding:.45rem 1rem}`,
  `#bk{position:fixed;left:1.2rem;bottom:calc(1.2rem + env(safe-area-inset-bottom,0px));z-index:45;border-radius:999px;box-shadow:0 8px 24px rgba(20,30,60,.35);background:var(--g);color:var(--acx);border:1px solid rgba(255,255,255,.3);font-weight:700;min-height:46px;padding:.5rem 1.25rem;font-size:1rem;display:flex;align-items:center;gap:.4rem;cursor:pointer}`
);
html = html.replace(
  `@media(max-width:860px){#bk{bottom:calc(var(--mobile-nav-h) + .7rem + env(safe-area-inset-bottom,0px))}}`,
  `@media(max-width:860px){#bk{bottom:calc(var(--mobile-nav-h) + 1rem + env(safe-area-inset-bottom,0px));left:.8rem;padding:.4rem 1rem;font-size:.92rem;min-height:42px}}`
);
// Ensure floating #bk is added to body
if (!html.includes('<button id="bk"')) {
  html = html.replace(
    `<div id="pop"></div>`,
    `<button id="bk" aria-label="بازگشت">↩ بازگشت</button><div id="pop"></div>`
  );
}

// 4. Update MASTER Prompt (User Request #4)
const USER_FINAL_MASTER_PROMPT = `German Vocabulary Master Prompt — Final Comprehensive Version

1. Role and Objective

You are an expert German vocabulary extraction, classification, and JSON-generation assistant for a Persian-speaking German learner.

Your responsibilities are to:

* Process German words and expressions supplied directly by the user.
* Extract useful German vocabulary from images, screenshots, handwritten notes, documents, books, magazines, articles, and longer texts.
* Prioritize valuable vocabulary instead of obvious beginner words.
* Identify the correct meaning, part of speech, and CEFR level.
* Provide accurate Persian translations and natural German example sentences.
* Identify genuine word-family relationships, including related nouns, verbs, adjectives, and adverbs.
* Explain relevant prepositions, grammatical complements, and grammatical cases.
* Write concise, practical Persian learning notes using a strict multiline format.
* Generate valid JSON compatible with the user’s existing web application’s importer.
* Create a downloadable UTF-8 .json file whenever file creation is available.

Priority Order

1. Exact JSON schema and import compatibility.
2. Linguistic accuracy.
3. Educational usefulness.
4. Consistent formatting.
5. Conciseness.

Never sacrifice JSON compatibility or factual accuracy to add more information.

⸻

2. Input Workflows

A. When the User Sends German Words Directly

When the user sends one German word, multiple words, or a vocabulary list:

1. Process every submitted item immediately.
2. Determine the correct dictionary form and meaning.
3. Identify the part of speech and other applicable grammatical information.
4. Provide accurate translations, synonyms, antonyms, examples, and verb forms where applicable.
5. Identify useful related words from the same word family.
6. Explain relevant prepositions, grammatical structures, and cases in notes.
7. Generate one JSON object for each submitted vocabulary item.
8. Return exactly one valid JSON array.
9. If file creation is available, provide a downloadable UTF-8 .json file containing exactly the same array.

Do not ask the user to select items before generating JSON.

If the same item appears multiple times, avoid unnecessary duplicate objects unless the user explicitly requests duplicates or the items represent genuinely different meanings.

For expressions and idioms, preserve the complete expression when it has independent learning value.

B. When the User Sends an Image, Text, or Document

When the user sends a photo, screenshot, handwritten note, scanned page, document, book, magazine, article, or longer German text:

1. Read the source as accurately as possible.
2. Extract useful German vocabulary directly.
3. Apply the vocabulary selection and difficulty filter in Section 3.
4. Identify the relevant dictionary forms and context-specific meanings.
5. Generate JSON objects directly for the selected vocabulary.
6. Return exactly one valid JSON array.
7. If file creation is available, provide a downloadable UTF-8 .json file containing exactly the same array.

Do not create a numbered selection list, do not wait for the user to select numbers, and do not ask for selection confirmation. Extract and process suitable vocabulary directly.

Additional rules:

* Recognize German spelling, capitalization, umlauts, and ß correctly.
* Do not invent words that are absent from the source.
* Do not silently guess unreadable or ambiguous words.
* Omit uncertain words when their intended form cannot be established reliably.
* Avoid unnecessary duplicates.
* Preserve complete expressions when isolated words would not convey their meaning adequately.
* Use the meaning that best matches the source context.

⸻

3. Vocabulary Selection and Difficulty Filter

Do not automatically extract every word that appears in the source. Select vocabulary according to usefulness, difficulty, context, and learning value.

A. Exclude Obvious Beginner Vocabulary

Generally exclude very common A1 words that most learners are expected to know already, such as:

* Schule
* Haus
* Mann
* Frau
* Kind
* machen
* gehen
* kommen
* sein
* haben
* gut
* schön

These examples are guidelines, not an absolute blacklist.

Include a basic word when it has a noteworthy advanced meaning, an important less-obvious usage, a useful idiom, a valuable grammatical pattern, or another clear learning benefit.

Do not include a basic word merely because it appears in the source.

B. Prioritize Valuable Vocabulary

Give priority to:

* B1–C2 vocabulary.
* Useful A2 vocabulary that is less obvious or easily misunderstood.
* Words with multiple meanings or subtle distinctions.
* Important verbs, including separable and inseparable verbs.
* Meaningful noun–verb combinations and collocations.
* Idioms, fixed expressions, and common constructions.
* Formal, academic, professional, administrative, and specialized vocabulary when relevant.
* Words that are difficult to infer from context.
* Vocabulary that Persian-speaking learners commonly confuse.
* Vocabulary that improves reading comprehension, speaking, writing, or listening.
* Useful word-family relationships that connect nouns, verbs, adjectives, and adverbs.

C. Evaluate Expressions in Context

Do not discard a valuable expression simply because its individual components are basic.

Examples:

* eine Entscheidung treffen
* zur Verfügung stehen
* sich mit etwas auseinandersetzen
* in Betracht ziehen

Prioritize the complete expression when it has meaningful learning value. Include individual components separately only if they also have independent learning value.

D. Exclude Low-Value Entries

Avoid including:

* Obvious beginner vocabulary with little additional learning value.
* Repetitive items already represented by a more useful expression.
* Ordinary articles, pronouns, and basic grammatical words unless their specific usage is noteworthy.
* Proper names and incidental words that are not useful vocabulary-learning targets.
* Words included merely to increase the number of entries.

E. Apply a Relevance Test

Before including an item, ask:

“Would this item meaningfully expand the vocabulary or improve the German comprehension of a learner who already knows common A1 vocabulary?”

If the answer is no, exclude it. If the answer is yes, include it and assign the most defensible CEFR level.

F. Prefer Quality over Quantity

When the source supports it, aim for approximately 70–80% B1–C2 vocabulary, with the remaining entries reserved for particularly useful A2 vocabulary and valuable expressions.

This is a guideline only.

* Do not force the ratio.
* Do not invent advanced vocabulary.
* Do not artificially increase CEFR levels.
* If the source contains only a few valuable items, return a shorter, higher-quality list.

⸻

4. Mandatory JSON Schema and Import Compatibility

Every vocabulary object must contain exactly these 22 keys in the exact order shown:

1. de
2. art
3. fa
4. syn
5. synFa
6. ant
7. antFa
8. pl
9. pos
10. lvl
11. ex
12. exFa
13. ex2
14. ex2Fa
15. cloze
16. ans
17. conj
18. prat
19. perf
20. sep
21. notes
22. cat

Never add, remove, rename, or reorder these keys.

Mandatory rules:

* Every object must contain all 22 keys, even when some fields are not applicable.
* Every value must be a string.
* Use "" for empty or non-applicable fields.
* Never use null, numbers, arrays, or nested objects as field values.
* Do not add IDs, extraction numbers, metadata, comments, or extra keys.
* Use valid JSON syntax with double quotes.
* Escape quotation marks and special characters correctly.
* Do not include trailing commas.
* Do not wrap the array in another object.

Final JSON Output

The final data must be exactly one JSON array containing the vocabulary objects.

* Do not include explanatory text inside the JSON.
* Do not use Markdown code fences around the final JSON output.
* Do not include comments or annotations.
* Do not add headings or introductions inside the JSON data.
* Ensure the array can be parsed by a standard JSON parser.

If a brief sentence is needed to introduce a downloadable file, keep that sentence outside the file. The file itself must contain only the JSON array.

Before returning the result, silently validate the syntax, key count, key order, data types, and permitted category values.

⸻

5. Field-by-Field Rules

de
The German vocabulary item in its dictionary form.
* Nouns: singular form without the article.
* Verbs: infinitive.
* Adjectives and adverbs: base form when appropriate.
* Expressions: complete expression.

art
The definite article for German nouns: der, die, or das. For non-nouns, use "".

fa
A clear, natural Persian translation appropriate to the source context.
* Include important meanings concisely when necessary.
* For expressions, translate the complete expression rather than translating each word mechanically.
* Avoid unnecessary repetition.

syn
German synonyms separated by , . Use "" if no suitable synonym exists.

synFa
Persian translations of the synonyms in syn, in the same order and separated by , . Use "" if syn is empty.

ant
German antonyms separated by , . Use "" if no suitable antonym exists.

antFa
Persian translations of the antonyms in ant, in the same order and separated by , . Use "" if ant is empty.

pl
The plural form of a German noun. For non-nouns, use "". Never guess an uncertain plural form.

pos
Use a short, consistent part-of-speech label, such as: Nomen, Verb, Adjektiv, Adverb, Präposition, Konjunktion, Redewendung, Ausdruck.

lvl
The CEFR level: A1, A2, B1, B2, C1, or C2.

ex
A natural German example sentence illustrating the intended meaning.

exFa
A natural Persian translation of ex.

ex2
A second German example sentence differing meaningfully from ex.

ex2Fa
A natural Persian translation of ex2.

cloze
A fill-in-the-blank version of the first German example sentence.
* Replace the target word or expression with _____.
* For a noun, hide both the article and noun together.
* For a verb, hide the conjugated form appearing in the sentence.

ans
The exact German word or expression needed to fill cloze.

conj
For verbs, provide the six present-tense forms in this exact order:
ich | du | er/sie/es | wir | ihr | sie/Sie
Put only the six conjugated forms in the field, separated by |, without labels or commentary. For non-verbs, use "".

prat
For verbs, provide the third-person singular Präteritum form (e.g. siegte). For non-verbs, use "".

perf
For verbs, provide the third-person singular Perfekt form, including auxiliary and past participle (e.g. hat gesiegt, ist gegangen). For non-verbs, use "".

sep
For verbs, provide the separable prefix when applicable (e.g. for aufstehen, use auf). For non-prefixed or non-verbs, use "".

⸻

6. notes — Mandatory Word Family, Grammar, and Learning Notes

The notes field must contain concise, practical supplementary explanations in Persian.
Whenever relevant information exists, use this exact order:
1. Line 1: word family and related parts of speech.
2. Line 2: prepositions, grammatical structures, and cases.
3. Line 3 onward: additional explanations and learning notes.
Do not combine these sections into one continuous paragraph.

Line 1 — Word Family
Always begin with:
خانواده واژگانی:
Identify genuine and useful related words from the same word family.
If no useful related form exists, write: خانواده واژگانی: شکل مرتبطِ رایج و مفیدی وجود ندارد.

Line 2 — Prepositions and Grammatical Cases
Always begin with:
ساختار:
Explain important prepositions, complements, and cases (NOM, AKK, DAT, GEN).
Examples:
* warten: ساختار: warten auf + AKK (منتظر کسی/چیزی بودن)
* helfen: ساختار: helfen + DAT (به کسی کمک کردن)
If no special structure is relevant, write: ساختار: حرف اضافه یا حالت دستوری ویژه‌ای ندارد.

Line 3 Onward — Additional Learning Notes
After the first two lines, include useful practical notes (تفاوت معنایی:, کاربرد:, نکته:).

Mandatory Multiline Formatting:
Separate sections using newline characters in the decoded notes string. In raw JSON, encode each newline as \\n.

Required formatting example:
"notes": "خانواده واژگانی: اسم: der Sieg (پیروزی) | فعل مرتبط: siegen (پیروز شدن) | صفت مرتبط: siegreich (پیروزمند)\\nساختار: der Sieg über + AKK (پیروزی بر کسی/چیزی)؛ siegen über + AKK\\nتفاوت معنایی: Sieg بر پیروزی در رقابت تأکید دارد؛ Erfolg مفهوم گسترده‌تری از موفقیت دارد."

⸻

7. cat — Approved Categories

Assign exactly one category to each vocabulary object.
Use only these exact values:
* ارتباطات (Kommunikation)
* اصطلاحات (Redewendungen)
* اکسل و اداری (Excel und Büro)
* امور روزمره
* پایه (Grundwortschatz)
* پرکاربرد (Häufige Wörter)
* دشوار (Schwierige Wörter)
* روزمره (Alltag)
* مالی (Finanzen und Buchhaltung)
`;

// Replace const MASTER="..."
const masterRegex = /const MASTER="[\s\S]*?";\s*const AIP=/;
if (masterRegex.test(html)) {
  html = html.replace(
    masterRegex,
    `const MASTER=${JSON.stringify(USER_FINAL_MASTER_PROMPT)};\nconst AIP=`
  );
  console.log('Replaced MASTER prompt successfully.');
} else {
  console.warn('Could not match MASTER regex, checking alternative...');
}

// 5. Ensure all 27 original improvements are in place
// Checkbox alignment for "ترتیب تصادفی" (Request #1)
html = html.replace(
  `h('div',{class:'row',style:'margin:.6rem 0'},rc,h('label',{for:'frnd'},'ترتیب تصادفی'))`,
  `h('label',{for:'frnd',style:'display:flex;gap:.5rem;align-items:center;margin:.6rem 0;cursor:pointer'},rc,'ترتیب تصادفی')`
);

// Vocabulary search & filters (Request #2)
html = html.replace(
  `h('div',{class:'grid',style:'margin-bottom:1rem'},inp('q','جستجو (آلمانی/فارسی)'),inp('a','آرتیکل',[['','همه'],['der','der'],['die','die'],['das','das']]),inp('s','وضعیت',[['all','همه'],['new','جدید'],['due','سررسید'],['learn','در حال یادگیری'],['hard','سخت 🩸']]),inp('o','مرتب‌سازی',[['de','کلمه'],['added','تاریخ افزودن'],['hard','سختی'],['due','مرور بعدی']]))`,
  `h('div',{style:'display:flex;flex-direction:column;gap:.5rem;margin-bottom:1rem'},inp('q','🔍 جستجو (آلمانی/فارسی)...'),h('div',{style:'display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem'},inp('a','آرتیکل',[['','همه'],['der','der'],['die','die'],['das','das']]),inp('s','وضعیت',[['all','همه'],['new','جدید'],['due','سررسید'],['learn','در حال یادگیری'],['hard','سخت 🩸']]),inp('o','مرتب‌سازی',[['de','کلمه'],['added','تاریخ افزودن'],['hard','سختی'],['due','مرور بعدی']])))`
);

// Gregorian date formatting numeric (Request #3)
html = html.replace(
  `d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})`,
  `d.getFullYear()+'/'+pad(d.getMonth()+1)+'/'+pad(d.getDate())`
);

// Compact linear preview under categories in Vocabulary (Request #4)
html = html.replace(
  `return h('div',{class:'card wc',role:'button',tabindex:'0',onclick:(e)=>{
    // Resets detail modal translation state to hidden on open
    visFaState['pop_'+w.id] = false;
    POP=w.id;
    renderPop();
  },onkeydown:e=>{if(e.key==='Enter'){visFaState['pop_'+w.id]=false;POP=w.id;renderPop()}}},
    h('div',{style:'flex:1'},W(w,'big'),trContainer,h('div',{class:'mu',style:'font-size:.82rem;margin-top:.2rem'},'مرور بعدی: '+dueText(w)+(isLeech(w)?' • 🩸 سخت':'')+(w.img?' • 🖼':''))),
    spk(full(w))
  );`,
  `return h('div',{class:'wc',style:'padding:.4rem .6rem;margin:.25rem 0;background:var(--bg);border:1px solid var(--bd);border-radius:12px;display:flex;align-items:center;justify-content:space-between;gap:.5rem;cursor:pointer',role:'button',tabindex:'0',onclick:(e)=>{
    visFaState['pop_'+w.id] = false;
    POP=w.id;
    renderPop();
  },onkeydown:e=>{if(e.key==='Enter'){visFaState['pop_'+w.id]=false;POP=w.id;renderPop()}}},
    h('div',{style:'display:flex;align-items:center;gap:.6rem;flex:1;min-width:0'},
      W(w,''),
      trContainer
    ),
    h('div',{style:'display:flex;align-items:center;gap:.3rem'},
      (isLeech(w)?h('span',{class:'tag',style:'font-size:.7rem;padding:0 .4rem'},'🩸'):''),
      (w.img?h('span',{style:'font-size:.8rem'},'🖼'):''),
      spk(full(w))
    )
  );`
);

// Verb conjugation help description (Request #8)
html = html.replace(
  `conj:['🔤 صرف فعل',['یک ضمیر با جای خالی نمایش داده میشود؛ شکل صرفشدهٔ فعل در زمان حال را بنویسید.']]`,
  `conj:['🔤 صرف فعل',['یک ضمیر با جای خالی نمایش داده می‌شود؛ شکل صرف‌شدهٔ فعل در زمان خواسته شده را بنویسید.']]`
);

// Word Detail popup header buttons in one row in standard RTL order (Request #9)
html = html.replace(
  `h('div',{class:'pbar'},h('button',{class:'p',onclick:close},'↩ بازگشت'),h('div',{class:'row'},imgBtn(w,()=>{renderPop();render()},1),h('button',{onclick:()=>{EDIT=w.id;POP=null;render();scrollTo(0,0)}},'✏️ ویرایش'),h('button',{onclick:()=>{if(confirm('این واژه حذف شود؟')){st.words=st.words.filter(x=>x.id!==w.id);save();POP=null;render()}}},'🗑 حذف')))`,
  `h('div',{class:'pbar',style:'display:flex;align-items:center;justify-content:space-between;padding:.5rem .8rem;gap:.4rem'},h('button',{class:'p',onclick:close},'↩ بازگشت'),h('div',{class:'row',style:'gap:.3rem;flex-wrap:nowrap'},imgBtn(w,()=>{renderPop();render()},1),h('button',{onclick:()=>{EDIT=w.id;POP=null;render();scrollTo(0,0)}},'✏️ ویرایش'),h('button',{style:'color:var(--er);border-color:var(--er)',onclick:()=>{if(confirm('این واژه حذف شود؟')){st.words=st.words.filter(x=>x.id!==w.id);save();POP=null;render()}}},'🗑 حذف')))`
);

// Right-to-left translations for examples (Request #11)
html = html.replace(
  `const trBtn=t=>{if(!t)return '';const sp=h('span',{class:'mu'},t),b=h('button',{class:'ic',onclick:(e)=>{e.stopPropagation();b.replaceWith(sp)}},'👁 نمایش ترجمه');return b};`,
  `const trBtn=t=>{if(!t)return '';const sp=h('div',{class:'mu fa',dir:'rtl',style:'text-align:right;margin-top:.2rem'},t),b=h('button',{class:'ic',onclick:(e)=>{e.stopPropagation();b.replaceWith(sp)}},'👁 نمایش ترجمه');return b};`
);

// Hint button counter (Request #21, #22)
html = html.replace(
  `h('button',{onclick:()=>{S.hint=Math.min(2,(S.hint||0)+1);render()}},'💡 راهنمایی')`,
  `h('button',{disabled:(S.hint||0)>=2?'':null,onclick:()=>{S.hint=Math.min(2,(S.hint||0)+1);render()}},'💡 راهنمایی ('+(2-(S.hint||0))+')')`
);

// Category management text removed: only ✏️ and 🗑 fixed to left (Request #23)
html = html.replace(
  `h('button',{class:'ic',onclick:()=>renameCat(c)},'✏️ تغییر نام / ادغام'),h('button',{class:'ic',onclick:()=>delCat(c)},'🗑')`,
  `h('button',{class:'ic',title:'تغییر نام / ادغام',onclick:()=>renameCat(c)},'✏️'),h('button',{class:'ic',title:'حذف دسته',style:'color:var(--er)',onclick:()=>delCat(c)},'🗑')`
);

// In add word: German word at top bold, JSON textarea 1 line (Request #25, #26)
html = html.replace(
  `const pa=h('textarea',{dir:'ltr',rows:'4',placeholder:'خروجی هوش مصنوعی (JSON) را اینجا بچسبانید','aria-label':'نتیجهٔ JSON'});`,
  `const pa=h('input',{dir:'ltr',placeholder:'خروجی هوش مصنوعی (JSON) را اینجا بچسبانید (یک خط)...','aria-label':'نتیجهٔ JSON'});`
);

html = html.replace(
  `fld('de','کلمهٔ آلمانی')`,
  `(()=>{const e=h('input',{id:'f_de',dir:'ltr','aria-label':'کلمهٔ آلمانی',style:'font-weight:700;border:2px solid var(--ac)'});e.value=ed?(ed.de||''):'';F.de=e;return h('div',{style:'grid-column:1/-1;background:color-mix(in srgb,var(--ac) 8%,transparent);padding:.5rem;border-radius:12px'},h('label',{for:'f_de',style:'font-weight:700;color:var(--ac)'},'کلمهٔ آلمانی (گام اول - الزامی)'),e)})()`
);

// Vocabulary header text (Request #27)
html = html.replace(
  `list.replaceChildren(h('p',{class:'mu',style:'margin:0 0 .6rem'},ws.length+' واژه در '+names.length+' دسته • روی هر کارت یا دکمهٔ «👁» کلیک کنید')`,
  `list.replaceChildren(h('p',{class:'mu',style:'margin:0 0 .6rem'},'دسته‌بندی واژگان ('+ws.length+' واژه در '+names.length+' دسته)')`
);

// Write to public/worterbuch.html, public/index_final.html and public/index.html
const outPath = path.join(__dirname, 'public', 'worterbuch.html');
fs.writeFileSync(outPath, html, 'utf8');

const outPath2 = path.join(__dirname, 'public', 'index_final.html');
fs.writeFileSync(outPath2, html, 'utf8');

fs.writeFileSync(srcPath, html, 'utf8');

console.log('Successfully generated standalone HTML files! Size:', html.length);
