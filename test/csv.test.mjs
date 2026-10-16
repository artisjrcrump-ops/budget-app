import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { shiftsFromCsv, shiftsToCsv } from '../js/csv.js';

const sample = `Shift Date,Job,Position,Shift period,Start Time,End Time,Hourly Income,Cash Tips,Credit Tips,Tipped Out
10/15/26,Default Job,New Position,Night,16:00,00:00,$90.80,$0,"$1,192.02",$333.77
`;

test('parses quoted money with commas', () => {
  const [s] = shiftsFromCsv(sample);
  assert.deepEqual(s, { date: '2026-10-15', role: 'Server', period: 'Night', start: '16:00', end: '00:00',
    hourly: 90.8, cash: 0, credit: 1192.02, tipout: 333.77, note: '' });
});

test('round-trips through export', () => {
  const shifts = shiftsFromCsv(sample);
  assert.deepEqual(shiftsFromCsv(shiftsToCsv(shifts)), shifts);
});

// Set SHIFTS_CSV to a real export to check it parses; the file itself never goes in the repo.
const real = process.env.SHIFTS_CSV;
test('imports a full tip tracker export', { skip: !real || !existsSync(real) }, () => {
  const shifts = shiftsFromCsv(readFileSync(real, 'utf8'));
  assert.ok(shifts.length > 0);
  assert.ok(shifts.every((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.date)));
});

test('reads a trainer shift from the Position column', () => {
  const [s] = shiftsFromCsv(sample.replace('New Position', 'Trainer'));
  assert.equal(s.role, 'Trainer');
});
