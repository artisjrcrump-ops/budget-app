// Pure money and date helpers shared by the screens.
import { weeklyWithholding } from './tax.js';

export const shiftNet = (s) => s.hourly + s.cash + s.credit - s.tipout;

// Pay that runs through payroll: wages, credit tips after tip-out, and declared cash tips.
export const shiftTaxable = (s, cashDeclared = 1) => s.hourly + s.credit - s.tipout + s.cash * cashDeclared;

// Hours between "16:00" and "00:00", wrapping past midnight.
export function shiftHours(s) {
  if (!s.start || !s.end) return 0;
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
  let mins = toMin(s.end) - toMin(s.start);
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}

// Dates are handled as local "YYYY-MM-DD" strings to avoid time zone drift.
export function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function isoOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function addDays(iso, n) {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return isoOf(d);
}
export function weekStartOf(iso, weekStart = 1) {
  const d = parseDate(iso);
  const back = (d.getDay() - weekStart + 7) % 7;
  return addDays(iso, -back);
}
export const today = () => isoOf(new Date());

export function weekSummary(shifts, startIso, settings) {
  const endIso = addDays(startIso, 6);
  const inWeek = shifts.filter((s) => s.date >= startIso && s.date <= endIso);
  const year = startIso.slice(0, 4);
  const ytdBefore = shifts
    .filter((s) => s.date.startsWith(year) && s.date < startIso)
    .reduce((a, s) => a + shiftTaxable(s, settings.cashDeclared), 0);
  const net = sum(inWeek, shiftNet);
  const cash = sum(inWeek, (s) => s.cash);
  const hours = sum(inWeek, shiftHours);
  const taxable = sum(inWeek, (s) => shiftTaxable(s, settings.cashDeclared));
  const withholding = inWeek.length
    ? weeklyWithholding(taxable, { ytdBefore, nyc: settings.nyc, otherDeductions: settings.otherDeductions })
    : { lines: {}, total: 0 };
  return {
    start: startIso, end: endIso, shifts: inWeek, net, cash, hours, taxable,
    withholding, takeHome: net - withholding.total,
    perHour: hours ? net / hours : 0,
  };
}

export const sum = (list, fn) => list.reduce((a, x) => a + fn(x), 0);

export const money = (n, cents = true) =>
  (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US',
    { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
