// src/data/exercises.ts
export type ExerciseCategory = 'vocabulary' | 'grammar';

export interface ExerciseDefinition {
  id: string;
  title: string;
  description: string;
  category: ExerciseCategory;
}

export const EXERCISES_LIST: ExerciseDefinition[] = [
  // Wortschatz üben
  {
    id: 'vocab-flashcards',
    title: 'کارت‌های واژگان (Flashcards)',
    description: 'مرور و تمرین معانی واژگان به همراه تلفظ و مثال‌ها',
    category: 'vocabulary'
  },
  {
    id: 'vocab-synonyms',
    title: 'مترادف‌ها و متضادها',
    description: 'تمرین یافتن کلمات هم‌معنی و متضاد در سطح B1-B2',
    category: 'vocabulary'
  },
  {
    id: 'vocab-multiple-choice',
    title: 'تست چندگزینه‌ای کلمات',
    description: 'انتخاب ترجمه صحیح واژگان آلمانی',
    category: 'vocabulary'
  },

  // Grammatik üben
  {
    id: 'grammar-adj-declension',
    title: 'صرف صفت‌ها (Adjektivdeklination)',
    description: 'تمرین پایانه‌های صفت با انواع حروف تعریف',
    category: 'grammar'
  },
  {
    id: 'grammar-verb-conjugation',
    title: 'صرف افعال و افعال جداشدنی',
    description: 'تمرین زمان‌ها و افعال ترکیبی و انعکاسی',
    category: 'grammar'
  }
];
