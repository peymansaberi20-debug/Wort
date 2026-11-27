/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * migrations.ts — مهاجرت schema state با نسخه‌بندی (درخواست کاربر ۱۱)
 *
 * هر تغییر schema یک migration است:
 *   - هر migration یک تابع pure است که state را از نسخهٔ N به N+1 ارتقا می‌دهد.
 *   - migrationها به‌ترتیب اجرا می‌شوند — از نسخهٔ ذخیره‌شده تا CURRENT.
 *   - اگر migration شکست بخورد، state دست‌نخورده برمی‌گردد تا کاربر داده‌اش را از دست ندهد.
 *   - لاگ مهاجرت در کنسول چاپ می‌شود (در production silent می‌شود).
 *
 * نسخه‌بندی:
 *   - state.v = نسخهٔ قالب state (همیشه ۱ — برای سازگاری با نسخه‌های قدیمی)
 *   - state.sv = نسخهٔ schema (مبنای migration)
 *
 * تاریخچهٔ schema:
 *   sv=1: نسخهٔ اولیه (واژگان + hist + settings + daily)
 *   sv=2: افزودن فیلد en (معادل انگلیسی) به Word
 *   sv=3: افزودن status (aktiv/passiv/kandidat) و synCluster
 *   sv=4: افزودن آمار دوگانه pOk/pBad/rOk/rBad و win/stOk/pStreak/rStreak
 *   sv=5: سرِ واژهٔ فعل با annotatedHeadword (sich + prep + +A/+D/+G) — درخواست کاربر ۵
 *   sv=6: افزودن فیلدهای needsFull و register (در صورت نبود)
 */

import { AppState, Word } from '../types';
import { norm } from './storage';
import { annotatedHeadword, isVerbHead, hasHeadAnnotation } from '../data/verbPrep';

/** نسخهٔ فعلی schema — وقتی فیلدی به Word/AppState اضافه می‌شود، این را +۱ کن و یک migration اضافه کن. */
export const CURRENT_SCHEMA_VERSION = 6;

interface MigrationStep {
  from: number;
  to: number;
  description: string;
  migrate: (state: any) => any;
}

const migrations: MigrationStep[] = [
  {
    from: 1, to: 2,
    description: 'افزودن فیلد en (معادل انگلیسی) به واژه‌ها',
    migrate: (s: any) => {
      if (Array.isArray(s.words)) {
        s.words = s.words.map((w: any) => ({ ...w, en: typeof w.en === 'string' ? w.en : '' }));
      }
      return s;
    }
  },
  {
    from: 2, to: 3,
    description: 'افزودن status (aktiv/passiv/kandidat) و synCluster به واژه‌ها',
    migrate: (s: any) => {
      if (Array.isArray(s.words)) {
        s.words = s.words.map((w: any) => ({
          ...w,
          status: ['aktiv', 'passiv', 'kandidat'].includes(w.status) ? w.status : 'passiv',
          synCluster: typeof w.synCluster === 'string' ? w.synCluster : ''
        }));
      }
      return s;
    }
  },
  {
    from: 3, to: 4,
    description: 'افزودن آمار دوگانه pOk/pBad/rOk/rBad و win/stOk/pStreak/rStreak به واژه‌ها',
    migrate: (s: any) => {
      if (Array.isArray(s.words)) {
        s.words = s.words.map((w: any) => ({
          ...w,
          pOk: typeof w.pOk === 'number' ? w.pOk : 0,
          pBad: typeof w.pBad === 'number' ? w.pBad : 0,
          rOk: typeof w.rOk === 'number' ? w.rOk : 0,
          rBad: typeof w.rBad === 'number' ? w.rBad : 0,
          rStreak: typeof w.rStreak === 'number' ? w.rStreak : 0,
          pStreak: typeof w.pStreak === 'number' ? w.pStreak : 0,
          win: Array.isArray(w.win) ? w.win : [],
          stOk: typeof w.stOk === 'number' ? w.stOk : 0
        }));
      }
      // افزودن sn/sr به daily اگر نبود
      if (s.daily && typeof s.daily === 'object') {
        s.daily = {
          ...s.daily,
          sn: typeof s.daily.sn === 'number' ? s.daily.sn : 0,
          sr: typeof s.daily.sr === 'number' ? s.daily.sr : 0
        };
      }
      return s;
    }
  },
  {
    from: 4, to: 5,
    description: 'سرِ واژهٔ فعل با annotatedHeadword (sich + prep + +A/+D/+G) — درخواست کاربر ۵',
    migrate: (s: any) => {
      if (Array.isArray(s.words)) {
        s.words = s.words.map((w: any) => {
          if (!w || typeof w.de !== 'string') return w;
          const de = String(w.de).trim();
          if (!de || hasHeadAnnotation(de)) return w; // از قبل پسوند دارد
          // تشخیص فعل: یا pos صریح، یا سرِ واژه شامل sich، یا مصدر منظم
          const opts = { pos: String(w.pos || ''), art: String(w.art || ''), conj: String(w.conj || ''), notes: String(w.notes || '') };
          if (!isVerbHead(de, opts)) return w;
          try {
            const ann = annotatedHeadword(de, opts);
            if (ann && ann !== de) return { ...w, de: ann };
          } catch { /* ignore — واژه دست‌نخورده می‌ماند */ }
          return w;
        });
      }
      return s;
    }
  },
  {
    from: 5, to: 6,
    description: 'افزودن needsFull و register به واژه‌ها (در صورت نبود)',
    migrate: (s: any) => {
      if (Array.isArray(s.words)) {
        s.words = s.words.map((w: any) => ({
          ...w,
          needsFull: typeof w.needsFull === 'boolean' ? w.needsFull : false,
          register: typeof w.register === 'string' ? w.register : ''
        }));
      }
      // افزودن suggestedNewCat و cs در صورت نبود
      if (Array.isArray(s.words)) {
        s.words = s.words.map((w: any) => ({
          ...w,
          suggestedNewCat: typeof w.suggestedNewCat === 'string' ? w.suggestedNewCat : undefined,
          cs: typeof w.cs === 'number' ? w.cs : undefined
        }));
      }
      return s;
    }
  }
];

/**
 * اجرای migrationهای لازم روی state بارگذاری‌شده.
 * state را دست‌نخورده برمی‌گرداند اگر migration شکست بخورد.
 */
export function migrateState(raw: any): { state: any; fromVersion: number; toVersion: number; migrationsRun: string[] } {
  if (!raw || typeof raw !== 'object') {
    return { state: raw, fromVersion: 0, toVersion: 0, migrationsRun: [] };
  }
  const startVersion = Number(raw.sv || 0);
  let current = JSON.parse(JSON.stringify(raw)); // deep clone — امن در برابر جهش
  const run: string[] = [];

  if (startVersion < CURRENT_SCHEMA_VERSION) {
    for (const step of migrations) {
      if (startVersion < step.to && Number(current.sv || startVersion) < step.to) {
        try {
          current = step.migrate(current);
          current.sv = step.to;
          run.push(`sv${step.from}→${step.to}: ${step.description}`);
        } catch (e) {
          // در صورت خطا، state تا همین‌جا برگردانده می‌شود — بهتر از از دست رفتن کامل
          console.warn(`Migration sv${step.from}→${step.to} failed:`, e);
          break;
        }
      }
    }
  }

  // همیشه sv را به CURRENT تنظیم کن (حتی اگر هیچ migration لازم نبود)
  current.sv = CURRENT_SCHEMA_VERSION;
  current.v = 1;
  return { state: current, fromVersion: startVersion, toVersion: CURRENT_SCHEMA_VERSION, migrationsRun: run };
}

/** آیا state ذخیره‌شده نیاز به migration دارد؟ */
export function needsMigration(raw: any): boolean {
  if (!raw || typeof raw !== 'object') return false;
  return Number(raw.sv || 0) < CURRENT_SCHEMA_VERSION;
}

/** در محیط توسعه، لاگ مهاجرت را چاپ کن */
export function logMigration(result: { fromVersion: number; toVersion: number; migrationsRun: string[] }): void {
  if (result.migrationsRun.length === 0) return;
  if (typeof console !== 'undefined' && console.group) {
    console.group(`%c[Wortschatz] State migration: sv${result.fromVersion} → sv${result.toVersion}`, 'color: #1f5fbf; font-weight: bold');
    result.migrationsRun.forEach(m => console.log(' •', m));
    console.groupEnd();
  }
}
