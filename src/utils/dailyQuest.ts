/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * dailyQuest.ts — چالش روزانه (درخواست کاربر ۸)
 *
 * هر روز یک چالش کوچک و متفاوت تولید می‌شود:
 *   - نوع: review / new / weak / writing / listening / speaking / consecutive
 *   - هدف کمی
 *   - پیشرفت و تکمیل در همان روز ذخیره می‌شود
 *
 * نگه‌داری در localStorage با کلید wb_daily_quest_v1.
 * سازگار با کلاینت — هیچ وابستگی به سمت سرور ندارد.
 */
import { AppState, Word } from '../types';
import { today } from './dates';
import { isLeech } from './storage';
import { analyzeWeaknesses } from './weaknessAnalysis';

const KEY = 'wb_daily_quest_v1';

export type QuestKind = 'review' | 'new' | 'weak' | 'writing' | 'listening' | 'speaking' | 'consecutive';

export interface DailyQuest {
  date: string;       // YYYY-MM-DD (تقویم میلادی)
  kind: QuestKind;
  icon: string;
  title: string;
  desc: string;
  target: number;     // تعداد/مقدار هدف
  progress: number;   // پیشرفت فعلی
  completed: boolean;
  startedAt?: number; // timestamp شروع
  completedAt?: number;
}

interface SavedShape { date: string; quest: Omit<DailyQuest, 'progress' | 'completed' | 'completedAt' | 'startedAt'>; progress: number; completed: boolean; startedAt?: number; completedAt?: number }

/** تاریخ شمول یک چالش — در همان روز ذخیره و بازخوانی می‌شود. */
export const loadDailyQuest = (): DailyQuest | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SavedShape;
    if (s?.date !== today()) return null;
    return { ...s.quest, date: s.date, progress: s.progress || 0, completed: !!s.completed, startedAt: s.startedAt, completedAt: s.completedAt };
  } catch { return null; }
};

const save = (q: DailyQuest): void => {
  try {
    const s: SavedShape = { date: q.date, quest: { date: q.date, kind: q.kind, icon: q.icon, title: q.title, desc: q.desc, target: q.target }, progress: q.progress, completed: q.completed, startedAt: q.startedAt, completedAt: q.completedAt };
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch { /* ignore */ }
};

/** روزی به ازای هر کاربر یک چالش متفاوت تولید می‌کند. seeded بر اساس تاریخ. */
export const generateDailyQuest = (state: AppState): DailyQuest => {
  const d = today();
  // seed روزانه: ۰ تا ۶
  const seed = parseInt(d.replace(/-/g, ''), 10);
  const kinds: QuestKind[] = ['review', 'new', 'weak', 'writing', 'listening', 'speaking', 'consecutive'];
  const kind = kinds[seed % kinds.length];

  const dueReviewCount = state.words.filter(w => w.last && w.due <= Date.now()).length;
  const newAvailable = state.words.filter(w => !w.last).length;
  const report = analyzeWeaknesses(state);
  const weakCount = state.words.filter(w => isLeech(w, state.set.leechN || 4)).length;

  let quest: Omit<DailyQuest, 'progress' | 'completed' | 'startedAt' | 'completedAt'>;
  switch (kind) {
    case 'review':
      quest = {
        date: d, kind, icon: '⚡', title: 'مرور سریع', desc: `${Math.min(15, Math.max(5, dueReviewCount))} واژهٔ سررسید را مرور کن`,
        target: Math.min(15, Math.max(5, dueReviewCount))
      };
      break;
    case 'new':
      quest = {
        date: d, kind, icon: '🆕', title: 'یادگیری واژهٔ جدید', desc: `${Math.min(5, Math.max(3, newAvailable))} واژهٔ جدید امروز را یاد بگیر`,
        target: Math.min(5, Math.max(3, newAvailable))
      };
      break;
    case 'weak':
      quest = {
        date: d, kind, icon: '🎯', title: 'حمله به نقاط ضعف', desc: `${Math.min(10, Math.max(3, weakCount))} واژهٔ سخت را تمرین کن`,
        target: Math.min(10, Math.max(3, weakCount))
      };
      break;
    case 'writing':
      quest = {
        date: d, kind, icon: '✍️', title: 'یک جمله بنویس', desc: 'یک متن کوتاه آلمانی بنویس و تصحیح کن',
        target: 1
      };
      break;
    case 'listening':
      quest = {
        date: d, kind, icon: '🎧', title: 'گوش دادن فعال', desc: 'یک تمرین شنیداری کامل انجام بده',
        target: 1
      };
      break;
    case 'speaking':
      quest = {
        date: d, kind, icon: '🎙️', title: 'صحبت کردن', desc: 'حداقل ۲ دقیقه با معلم شفاهی صحبت کن',
        target: 1
      };
      break;
    case 'consecutive':
    default:
      quest = {
        date: d, kind: 'consecutive', icon: '🔥', title: 'زنجیرهٔ استمرار', desc: 'روی استمرارت ادامه بده — امروز تمرین کن',
        target: 1
      };
      break;
  }
  const q: DailyQuest = { ...quest, progress: 0, completed: false };
  save(q);
  return q;
};

/** گرفتن یا تولیدٔ چالش امروز. */
export const getOrCreateDailyQuest = (state: AppState): DailyQuest => {
  const existing = loadDailyQuest();
  if (existing) return existing;
  return generateDailyQuest(state);
};

/** افزودن به پیشرفت چالش امروز. completed=true وقتی progress به target برسد. */
export const advanceDailyQuest = (delta: number): DailyQuest | null => {
  const q = loadDailyQuest();
  if (!q) return null;
  if (q.completed) return q;
  const np = Math.max(0, Math.min(q.target, q.progress + delta));
  const nc = np >= q.target;
  const nq: DailyQuest = { ...q, progress: np, completed: nc, completedAt: nc ? Date.now() : undefined, startedAt: q.startedAt ?? Date.now() };
  save(nq);
  return nq;
};

/** علامت‌گذاری کامل چالش (برای موارد qualitative مثل نوشتن/شنیداری/گفتار). */
export const markDailyQuestDone = (): DailyQuest | null => {
  const q = loadDailyQuest();
  if (!q) return null;
  const nq: DailyQuest = { ...q, progress: q.target, completed: true, completedAt: Date.now(), startedAt: q.startedAt ?? Date.now() };
  save(nq);
  return nq;
};

/** شروع چالش (برای نشان دادن دکمهٔ شروع). */
export const startDailyQuest = (): DailyQuest | null => {
  const q = loadDailyQuest();
  if (!q) return null;
  if (q.startedAt) return q;
  const nq: DailyQuest = { ...q, startedAt: Date.now() };
  save(nq);
  return nq;
};
