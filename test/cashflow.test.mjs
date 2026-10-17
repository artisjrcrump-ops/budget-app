import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paydayFor, cashflow } from '../js/cashflow.js';

const settings = { weekStart: 2, nyc: true, cashDeclared: 1, otherDeductions: 4.9, payday: 5 };
const shift = (date, credit, cash = 0) => ({ date, start: '16:00', end: '23:00', hourly: 79.45, credit, cash, tipout: 0 });

test('a Tue-Mon week is paid the Friday after it ends', () => {
  assert.equal(paydayFor('2026-10-06', 5), '2026-10-16');
  assert.equal(paydayFor('2026-10-13', 5), '2026-10-23');
});

test('safe to spend is the low point before the next check', () => {
  const shifts = [shift('2026-10-13', 300, 100), shift('2026-10-14', 300), shift('2026-10-18', 300, 50)];
  const bills = [
    { id: 'r', name: 'Rent', amount: 1600, repeat: 'monthly', dueDay: 8 },
    { id: 'c', name: 'Con Ed', amount: 190, repeat: 'monthly', dueDay: 21 },
  ];
  const flow = cashflow({ shifts, bills, settings: { ...settings, balance: 500, balanceDate: '2026-10-17' } }, '2026-10-19');
  // Cash from the 10/18 shift is in hand; the 10/13 cash was already in the balance.
  assert.equal(flow.now, 550);
  assert.equal(flow.nextPayday, '2026-10-23');
  assert.equal(flow.safe, 360);
  const rent = flow.events.find((e) => e.label === 'Rent');
  assert.equal(rent.date, '2026-11-08');
  assert.ok(flow.events.some((e) => e.kind === 'pay' && e.date === '2026-10-23' && e.amount > 0));
});

test('bills marked paid are left out', () => {
  const bills = [{ id: 'c', name: 'Con Ed', amount: 190, repeat: 'monthly', dueDay: 21, paid: ['2026-10'] }];
  const flow = cashflow({ shifts: [], bills, settings: { ...settings, balance: 100, balanceDate: '2026-10-17' } }, '2026-10-17');
  assert.equal(flow.safe, 100);
  assert.equal(flow.events.filter((e) => e.kind === 'bill' && e.date.startsWith('2026-10')).length, 0);
});

test('no balance means no timeline yet', () => {
  assert.equal(cashflow({ shifts: [], bills: [], settings }, '2026-10-17'), null);
});
