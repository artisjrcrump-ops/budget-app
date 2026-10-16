import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weeklyWithholding, federalWeekly, nysWeekly } from '../js/tax.js';

// Worked by hand from the 2026 tables for a $1,500 week.
test('federal: Pub 15-T annualized percentage method', () => {
  // 1500 x 52 - 8600 = 69,400 -> 5,800 + 22% of 11,500 = 8,330 a year
  assert.equal(federalWeekly(1500), 160.19);
});

test('New York State: weekly exact calculation method', () => {
  // 1500 - 142.30 = 1357.70 -> 11.27 + 5.4% of 1090.70
  assert.equal(nysWeekly(1500), 70.17);
});

test('payroll taxes and NY insurance', () => {
  const { lines } = weeklyWithholding(1500, { ytdBefore: 50000 });
  assert.equal(lines.socialSecurity, 93);
  assert.equal(lines.medicare, 21.75);
  assert.equal(lines.paidFamilyLeave, 6.48);
  assert.equal(lines.disability, 0.60);
});

test('stops Social Security at the wage base', () => {
  assert.equal(weeklyWithholding(1000, { ytdBefore: 184500 }).lines.socialSecurity, 0);
});

test('a bigger week pays a higher share on its top dollars', () => {
  const at = (g) => weeklyWithholding(g).total;
  assert.ok(at(2500) - at(2400) > at(1100) - at(1000));
});
