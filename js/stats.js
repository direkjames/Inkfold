// Inkfold — writing log, goals and streaks.
// Each record counts words *added* (deleting doesn't undo progress) per day, project and device.
import { db, deviceInfo } from './db.js';

export const dayKey = (d = new Date()) => {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};
export const parseDay = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

let lastActivity = 0;
const IDLE = 5 * 60 * 1000;

export async function logWords(projectId, words) {
  if (!(words > 0)) return null;
  const { id: dev } = await deviceInfo();
  const date = dayKey();
  const id = `${date}|${projectId}|${dev}`;
  const rec = (await db.get('log', id)) || { id, date, projectId, device: dev, words: 0, hours: {}, minutes: 0 };
  const now = Date.now();
  if (lastActivity && now - lastActivity < IDLE) rec.minutes += (now - lastActivity) / 60000;
  lastActivity = now;
  rec.words += words;
  const h = new Date().getHours();
  rec.hours[h] = (rec.hours[h] || 0) + words;
  await db.put('log', rec);
  return rec;
}

export async function todayWords() {
  const k = dayKey();
  return (await db.all('log')).filter(l => l.date === k).reduce((s, l) => s + l.words, 0);
}

export async function summary(goal) {
  const log = await db.all('log');
  const byDay = new Map();
  const byProjectDay = new Map();
  const hours = new Array(24).fill(0);
  let minutes = 0, total = 0;
  for (const l of log) {
    byDay.set(l.date, (byDay.get(l.date) || 0) + l.words);
    const pk = l.projectId; if (!byProjectDay.has(pk)) byProjectDay.set(pk, new Map());
    byProjectDay.get(pk).set(l.date, (byProjectDay.get(pk).get(l.date) || 0) + l.words);
    for (const [h, w] of Object.entries(l.hours || {})) hours[+h] += w;
    minutes += l.minutes || 0; total += l.words;
  }
  const today = new Date();
  const tk = dayKey(today);
  const todayW = byDay.get(tk) || 0;
  const met = d => (byDay.get(dayKey(d)) || 0) >= goal;
  // current streak: today counts once the goal is met; otherwise the streak is still alive from yesterday
  let streak = 0, d = met(today) ? today : addDays(today, -1);
  while (met(d)) { streak++; d = addDays(d, -1); }
  // best streak
  let best = 0, run = 0;
  const days = [...byDay.keys()].sort();
  if (days.length) {
    for (let x = parseDay(days[0]); x <= today; x = addDays(x, 1)) { if (met(x)) { run++; best = Math.max(best, run); } else run = 0; }
  }
  const sumRange = (from, to) => { let s = 0; for (let x = addDays(today, from); x <= addDays(today, to); x = addDays(x, 1)) s += byDay.get(dayKey(x)) || 0; return s; };
  const week = sumRange(-6, 0), lastWeek = sumRange(-13, -7);
  const wph = minutes >= 10 ? Math.round(total / (minutes / 60)) : null;
  const peak = hours.some(Boolean) ? hours.indexOf(Math.max(...hours)) : null;
  return { today: todayW, goal, streak, best, week, lastWeek, total, wph, minutes, hours, peak, byDay, byProjectDay };
}

// Words per day needed to hit a project target by its deadline
export function plan(project, words, byProjectDay) {
  if (!project.target) return null;
  const remaining = Math.max(0, project.target - words);
  const pct = Math.min(1, words / project.target);
  if (!project.deadline) return { remaining, pct };
  const today = parseDay(dayKey());
  const end = parseDay(project.deadline);
  const daysLeft = Math.round((end - today) / 864e5) + 1; // include today
  const perDay = daysLeft > 0 ? Math.ceil(remaining / daysLeft) : remaining;
  const pd = byProjectDay?.get(project.id) || new Map();
  let recent = 0; for (let i = 0; i < 7; i++) recent += pd.get(dayKey(addDays(today, -i))) || 0;
  const pace = Math.round(recent / 7);
  return { remaining, pct, daysLeft, perDay, pace, onTrack: remaining === 0 || (daysLeft > 0 && pace >= perDay) };
}

export const hourLabel = h => h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
