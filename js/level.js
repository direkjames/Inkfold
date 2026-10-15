// Inkfold — EXP and levels. Worked out from the writing log, so it adds up across synced devices,
// and deleting text never takes EXP away (the log only counts words added).
import { addDays, dayKey, parseDay } from './stats.js';

export const EXP_RULES = { perWord: 1, writingDay: 25, writingDayMin: 100, streakStep: 5, streakCap: 20 };

const TITLES = [
  [1, 'Ink Dabbler'], [3, 'Scribbler'], [5, 'Apprentice Scribe'], [8, 'Wordsmith'], [12, 'Storyteller'],
  [16, 'Chronicler'], [20, 'Novelist'], [25, 'Lorekeeper'], [30, 'Master Author'], [40, 'Legendary Bard'], [50, 'Living Legend'],
];
export const titleFor = lv => TITLES.reduce((t, [min, name]) => lv >= min ? name : t, TITLES[0][1]);

// Total EXP needed to reach a level (level 1 starts at 0)
export const expFor = lv => 200 * (lv - 1) * lv;
export function levelFor(exp) {
  let lv = 1;
  while (exp >= expFor(lv + 1)) lv++;
  return lv;
}

// byDay: Map('YYYY-MM-DD' -> words added that day)
export function computeExp(byDay) {
  const R = EXP_RULES;
  let words = 0, bonus = 0, run = 0;
  const days = [...byDay.keys()].sort();
  if (days.length) {
    const today = parseDay(dayKey());
    for (let d = parseDay(days[0]); d <= today; d = addDays(d, 1)) {
      const w = byDay.get(dayKey(d)) || 0;
      words += w;
      if (w >= R.writingDayMin) { run++; bonus += R.writingDay + R.streakStep * Math.min(run - 1, R.streakCap); }
      else run = 0;
    }
  }
  const exp = Math.round(words * R.perWord + bonus);
  const level = levelFor(exp);
  const from = expFor(level), to = expFor(level + 1);
  return { exp, level, title: titleFor(level), into: exp - from, need: to - from, pct: (exp - from) / (to - from), nextTitle: titleFor(level + 1) !== titleFor(level) ? titleFor(level + 1) : null };
}
