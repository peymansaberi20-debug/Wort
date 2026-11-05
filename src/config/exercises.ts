import { ExerciseDefinition } from '../types/exercise';

export const EXERCISES_LIST: ExerciseDefinition[] = [
  // --- Wortschatz üben (Vocabulary Exercises) ---
  {
    id: 'vocab-flashcards',
    title: 'کارت‌های واژگان (Flashcards)',
    description: 'مرور و تمرین معانی واژگان به همراه تلفظ و مثال‌ها',
    category: 'vocabulary',
    icon: 'cards'
  },
  {
    id: 'vocab-synonyms',
    title: 'مترادف‌ها و متضادها',
    description: 'تمرین یافتن کلمات هم‌معنی و متضاد در سطح B1-B2',
    category: 'vocabulary',
    icon: 'swap'
  },
  {
    id: 'vocab-multiple-choice',
    title: 'تست چندگزینه‌ای کلمات',
    description: 'انتخاب ترجمه صحیح واژگان آلمانی به فارسی/انگلیسی',
    category: 'vocabulary',
    icon: 'check-list'
  },

  // --- Grammatik üben (Grammar Exercises) ---
  {
    id: 'grammar-adj-declension',
    title: 'صرف صفت‌ها (Adjektivdeklination)',
    description: 'تمرین پایانه‌های صفت با حرف تعریف مشخص، نامشخص و بدون حرف تعریف',
    category: 'grammar',
    icon: 'edit-text'
  },
  {
    id: 'grammar-verb-conjugation',
    title: 'صرف افعال و افعال جداشدنی',
    description: 'تمرین زمان‌ها و افعال ترکیبی/انعکاسی (Trennbare & Reflexive Verben)',
    category: 'grammar',
    icon: 'code-branch'
  },
  {
    id: 'grammar-sentence-structure',
    title: 'ساختار جمله و حروف اضافه',
    description: 'تمرین موقعیت فعل در جمله و حروف اضافه Dativ / Akkusativ',
    category: 'grammar',
    icon: 'sort-alphabet'
  }
];
