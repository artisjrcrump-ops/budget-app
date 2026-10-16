// Monthly budget math: safe income estimate, bills, categories and goals.
import { weekSummary, weekStartOf, addDays, parseDate, isoOf, sum } from './calc.js';

// Monthly cost of a bill whatever its schedule.
export function monthlyCost(bill) {
  if (bill.repeat === 'weekly') return bill.amount * 52 / 12;
  if (bill.repeat === 'yearly') return bill.amount / 12;
  return bill.amount;
}

// Take-home per calendar month, counting each pay week in the month it starts.
export function monthlyTakeHome(shifts, settings) {
  if (!shifts.length) return new Map();
  const dates = shifts.map((s) => s.date).sort();
  const months = new Map();
  for (let w = weekStartOf(dates[0], settings.weekStart); w <= dates[dates.length - 1]; w = addDays(w, 7)) {
    const wk = weekSummary(shifts, w, settings);
    if (!wk.shifts.length) continue;
    const m = w.slice(0, 7);
    months.set(m, (months.get(m) ?? 0) + wk.takeHome);
  }
  return months;
}

// A cautious monthly income: the average of the 3 lowest of the last 12 full months.
export function safeMonthlyIncome(shifts, settings, todayIso) {
  const thisMonth = todayIso.slice(0, 7);
  const months = [...monthlyTakeHome(shifts, settings)]
    .filter(([m]) => m < thisMonth)
    .slice(-12)
    .map(([, v]) => v)
    .sort((a, b) => a - b);
  if (!months.length) return 0;
  const low = months.slice(0, Math.min(3, months.length));
  return sum(low, (v) => v) / low.length;
}

// Next due date of a monthly bill on or after today; due day clamps to the month's last day.
export function nextDue(bill, todayIso) {
  const t = parseDate(todayIso);
  const due = (y, m) => new Date(y, m, Math.min(bill.dueDay, new Date(y, m + 1, 0).getDate()));
  let d = due(t.getFullYear(), t.getMonth());
  if (d < t) d = due(t.getFullYear(), t.getMonth() + 1);
  return isoOf(d);
}

export function daysBetween(aIso, bIso) {
  return Math.round((parseDate(bIso) - parseDate(aIso)) / 86400000);
}

export const goalSaved = (g) => sum(g.deposits ?? [], (d) => d.amount);

// What to put aside per month and per shift to reach a goal on time.
export function goalPace(goal, shifts, todayIso) {
  const left = Math.max(0, goal.target - goalSaved(goal));
  if (!goal.targetDate || !left) return { left, perMonth: 0, perShift: 0 };
  const days = Math.max(1, daysBetween(todayIso, goal.targetDate));
  const recent = shifts.filter((s) => s.date > addDays(todayIso, -84) && s.date <= todayIso).length;
  const shiftsPerDay = recent ? recent / 84 : 4 / 7;
  return {
    left,
    perMonth: left / Math.max(1, days / 30.44),
    perShift: left / Math.max(1, Math.round(days * shiftsPerDay)),
  };
}

export const spentThisMonth = (category, monthKey) =>
  sum((category.entries ?? []).filter((e) => e.date.startsWith(monthKey)), (e) => e.amount);
