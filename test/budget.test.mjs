import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthlyCost, nextDue, goalPace, safeMonthlyIncome } from '../js/budget.js';

test('converts bill schedules to a monthly cost', () => {
  assert.equal(monthlyCost({ amount: 1200, repeat: 'yearly' }), 100);
  assert.equal(monthlyCost({ amount: 30, repeat: 'weekly' }), 130);
  assert.equal(monthlyCost({ amount: 2000, repeat: 'monthly' }), 2000);
});

test('finds the next due date and clamps short months', () => {
  assert.equal(nextDue({ dueDay: 20 }, '2026-10-16'), '2026-10-20');
  assert.equal(nextDue({ dueDay: 1 }, '2026-10-16'), '2026-11-01');
  assert.equal(nextDue({ dueDay: 31 }, '2027-02-10'), '2027-02-28');
});

test('spreads a goal over the remaining shifts', () => {
  const shifts = Array.from({ length: 48 }, (_, i) => ({ date: `2026-${String(8 + Math.floor(i / 16)).padStart(2, '0')}-${String(1 + (i % 16)).padStart(2, '0')}` }));
  const pace = goalPace({ target: 1000, targetDate: '2026-12-15', deposits: [{ amount: 200 }] }, shifts, '2026-10-16');
  assert.equal(pace.left, 800);
  assert.ok(pace.perShift > 0 && pace.perShift < 800);
});

test('safe income uses the lowest months', () => {
  const settings = { weekStart: 2, nyc: false, cashDeclared: 1, otherDeductions: 0 };
  const shifts = ['2026-07-07', '2026-08-04', '2026-08-05', '2026-09-08', '2026-09-09', '2026-09-10']
    .map((date) => ({ date, start: '16:00', end: '23:00', hourly: 0, cash: 500, credit: 0, tipout: 0 }));
  const safe = safeMonthlyIncome(shifts, settings, '2026-10-16');
  assert.ok(safe > 0 && safe < 1000, String(safe));
});
