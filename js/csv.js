// Import and export shifts in the tip tracker's CSV layout:
// Shift Date,Job,Position,Shift period,Start Time,End Time,Hourly Income,Cash Tips,Credit Tips,Tipped Out

export const CSV_HEADER = ['Shift Date', 'Job', 'Position', 'Shift period', 'Start Time', 'End Time',
  'Hourly Income', 'Cash Tips', 'Credit Tips', 'Tipped Out'];

export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

const money = (s) => Number(String(s || '').replace(/[$,\s]/g, '')) || 0;

// "10/15/26" -> "2026-10-15"
function isoDate(s) {
  const [m, d, y] = s.trim().split('/').map(Number);
  const year = y < 100 ? 2000 + y : y;
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function shiftsFromCsv(text) {
  const [header, ...rows] = parseCsv(text);
  const col = (name) => header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  const idx = Object.fromEntries(CSV_HEADER.map((h) => [h, col(h)]));
  if (idx['Shift Date'] < 0) throw new Error('This file has no "Shift Date" column.');
  const get = (r, h) => (idx[h] >= 0 ? r[idx[h]] ?? '' : '');
  return rows.map((r) => ({
    date: isoDate(get(r, 'Shift Date')),
    period: get(r, 'Shift period') || 'Night',
    start: get(r, 'Start Time'),
    end: get(r, 'End Time'),
    hourly: money(get(r, 'Hourly Income')),
    cash: money(get(r, 'Cash Tips')),
    credit: money(get(r, 'Credit Tips')),
    tipout: money(get(r, 'Tipped Out')),
    note: '',
  }));
}

export function shiftsToCsv(shifts) {
  const q = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const usDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${m}/${d}/${String(y).slice(2)}`; };
  const $ = (n) => `$${n.toFixed(2)}`;
  const lines = [CSV_HEADER.join(',')];
  for (const s of shifts) {
    lines.push([usDate(s.date), 'Default Job', 'New Position', s.period, s.start, s.end,
      $(s.hourly), $(s.cash), $(s.credit), $(s.tipout)].map((v) => q(String(v))).join(','));
  }
  return lines.join('\n') + '\n';
}
