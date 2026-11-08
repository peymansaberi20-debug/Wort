export interface Word {
  id: string;
  de: string;
  art: string; // 'der' | 'die' | 'das' | ''
  fa: string;
  syn: string;
  synFa: string;
  ant: string;
  antFa: string;
  pl: string;
  pos: string;
  lvl: string;
  ex: string;
  exFa: string;
  ex2: string;
  ex2Fa: string;
  conj: string; // ich|du|er|wir|ihr|sie
  prat: string;
  perf: string;
  komparativ?: string;
  superlativ?: string;
  imperativDu?: string;
  imperativIhr?: string;
  imperativSie?: string;
  sep: string;
  cat: string;
  cloze: string;
  ans: string;
  acc: string[];
  tags: string;
  notes: string;
  def?: string; // German definition (B1–B2 wording), shown above examples
  en?: string; // closest English equivalent (translated FROM the German), optional
  img: string;
  added: number;
  last: number;
  due: number;
  ivl: number;
  ease: number;
  stage: number;
  ok: number;
  bad: number;
  res: string;
  cs?: number; // for case study items
  suggestedNewCat?: string; // AI proposed new category awaiting user confirmation
}

export interface HistItem {
  id: string;
  t: number;
  type: string;
  sub?: string;
  exp: string;
  ok: number;
  cat?: string;
}

/** Countdown timer of one exercise type (configured inside that exercise). */
export interface ExerciseTimerCfg {
  on: boolean;
  sec: number;
}

export interface AppSettings {
  theme: 'light' | 'dark';
  dir: 'de' | 'fa' | 'rand';
  nw: number; // new words per day 0-500
  rv: number; // reviews per day 0-500
  order: 'due' | 'new' | 'mix' | 'rand';
  activeCats: string[];
  ivlMod: number; // 0.8 | 1 | 1.25
  leechN: number; // 2-20
  leechAct: 'mark' | 'suspend';
  revealSec: number; // 0-120
  showTimer: boolean;
  auto: boolean; // autoplay speech
  autoEx: boolean; // read example sentence
  vreg: string; // speech accent e.g. "de-DE", "de-AT", "de-CH"
  voice: string; // speech voice name
  rate: number; // 0.5 - 1.1
  goal: number; // daily goal 0-500
  bkDays: number; // backup reminder frequency
  freeCat?: string;
  freeDir?: 'de' | 'fa';
  freeRnd?: boolean;
  /** Per-exercise countdown timers, keyed by exercise type (e.g. 'cloze', 'dict', 'flash'). */
  timers?: Record<string, ExerciseTimerCfg>;
}

export interface DailyGoal {
  d: string;
  n: number;
  r: number;
}

export interface AppState {
  v: number;
  sv: number;
  words: Word[];
  hist: HistItem[];
  set: AppSettings;
  daily: DailyGoal;
}

export interface ExtData {
  ok?: Record<string, number>; // ignored quality audit ids
  bk?: number; // last backup timestamp
}

export interface CaseQuestion {
  id: string;
  cs: number;
  s: string; // sentence with "___ ___"
  prepAns: string; // correct preposition e.g. "mit"
  artAns: string; // correct article e.g. "dem"
  ans: string; // combined answer e.g. "mit dem"
  n: string; // noun info e.g. "der Bus"
  c: string; // case description e.g. "Dativ (mit)"
  r: string; // rule explanation
  fa: string;
  ex: string;
  exFa: string;
}
