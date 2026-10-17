// Money timeline: your balance, upcoming paychecks and bills, and what is safe to spend before payday.
import { weekSummary, weekStartOf, addDays, parseDate, sum } from './calc.js';

// A pay week is paid on the first payday weekday after it ends.
export function paydayFor(weekStartIso, payday) {
  const end = addDays(weekStartIso, 6);
  const ahead = (payday - parseDate(end).getDay() + 7) % 7 || 7;
  return addDays(end, ahead);
}

// A cautious weekly check: the average of the 3 lowest of the last 12 worked weeks.
export function cautiousCheck(shifts, settings, todayIso) {
  const current = weekStartOf(todayIso, settings.weekStart);
  const checks = [];
  for (let w = addDays(current, -7), n = 0; checks.length < 12 && n < 26; w = addDays(w, -7), n++) {
    const wk = weekSummary(shifts, w, settings);
    if (wk.shifts.length) checks.push(wk.check);
  }
  if (!checks.length) return 0;
  const low = checks.sort((a, b) => a - b).slice(0, 3);
  return sum(low, (v) => v) / low.length;
}

// Every money in and out from the day the balance was set until a few weeks ahead,
// with the running balance after each one.
export function cashflow({ shifts, bills, settings }, todayIso, weeks = 5) {
  const from = settings.balanceDate;
  if (!from) return null;
  const until = addDays(todayIso, weeks * 7);
  const events = [];

  // Cash tips from shifts after the balance was set are already in hand.
  const cash = sum(shifts.filter((s) => s.date > from && s.date <= todayIso), (s) => s.cash);
  if (cash) events.push({ date: todayIso, kind: 'cash', label: 'Cash tips since your balance', amount: cash });

  const cautious = cautiousCheck(shifts, settings, todayIso);
  const paydays = [];
  for (let w = addDays(weekStartOf(from, settings.weekStart), -14); w <= until; w = addDays(w, 7)) {
    const date = paydayFor(w, settings.payday);
    if (date <= from || date > until) continue;
    const wk = weekSummary(shifts, w, settings);
    const done = wk.end < todayIso;
    // A week still in progress or not started yet counts at least a cautious check.
    const amount = done ? wk.check : Math.max(wk.check, cautious);
    paydays.push(date);
    if (amount) events.push({ date, kind: 'pay', label: 'Paycheck', week: w, amount, estimate: !done || !wk.shifts.length });
  }

  for (const b of bills) {
    if (b.repeat === 'monthly') {
      const start = parseDate(from);
      for (let m = 0; m <= weeks / 4 + 2; m++) {
        const y = start.getFullYear(), mo = start.getMonth() + m;
        const last = new Date(y, mo + 1, 0).getDate();
        const d = new Date(y, mo, Math.min(b.dueDay, last));
        const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (date <= from || date > until || (b.paid ?? []).includes(date.slice(0, 7))) continue;
        events.push({ date, kind: 'bill', label: b.name, amount: -b.amount, billId: b.id });
      }
    } else if (b.repeat === 'weekly') {
      // Weekly bills have no due day, so they come out of each paycheck.
      for (const date of paydays) events.push({ date, kind: 'bill', label: b.name, amount: -b.amount, billId: b.id });
    }
  }

  // Money in before money out on the same day.
  events.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
  let running = settings.balance;
  for (const e of events) { running += e.amount; e.balance = running; }

  const now = settings.balance + sum(events.filter((e) => e.date <= todayIso), (e) => e.amount);
  const nextPayday = paydays.find((d) => d > todayIso) ?? until;
  // Safe to spend: the lowest the balance gets before the next check lands.
  const beforePay = events.filter((e) => e.date > todayIso && e.date < nextPayday);
  const safe = Math.min(now, ...beforePay.map((e) => e.balance));
  const short = events.find((e) => e.date > todayIso && e.balance < 0);
  return { events, now, safe, nextPayday, short, cautious };
}
