import { store } from './store.js';
import { shiftsFromCsv, shiftsToCsv } from './csv.js';
import { marginalRate } from './tax.js';
import {
  shiftNet, shiftHours, weekStartOf, weekSummary, addDays, parseDate, today, money, sum,
} from './calc.js';

import { $, esc, openSheet, closeSheet, armDelete } from './ui.js';
import { renderBills, renderBudget, renderGoals } from './money.js';
import { cashflow } from './cashflow.js';
const fmtDay = (iso, opts) => parseDate(iso).toLocaleDateString('en-US', opts);

const view = $('#view');
const ui = { tab: 'home', weekOf: null, shiftsShown: 12 };

// ---------- Home ----------

function renderHome() {
  const { shifts, settings } = store.get();
  const start = ui.weekOf ?? weekStartOf(today(), settings.weekStart);
  ui.weekOf = start;
  const wk = weekSummary(shifts, start, settings);

  const year = start.slice(0, 4);
  const ytd = sum(shifts.filter((s) => s.date.startsWith(year) && s.date <= wk.end), shiftNet);
  const lastYear = sum(shifts.filter((s) => s.date.startsWith(String(year - 1))), shiftNet);
  // Same calendar dates a year earlier, as the old tip tracker counted it.
  const sameWeekLastYear = weekSummary(shifts, String(year - 1) + start.slice(4), settings).net;

  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((iso) => {
    const dayShifts = wk.shifts.filter((s) => s.date === iso);
    const net = sum(dayShifts, shiftNet);
    const hrs = sum(dayShifts, shiftHours);
    return `<button class="day ${iso === today() ? 'is-today' : ''} ${dayShifts.length ? 'has-shift' : ''}" data-day="${iso}">
      <span class="day-name">${fmtDay(iso, { weekday: 'short' })} ${fmtDay(iso, { month: 'numeric', day: 'numeric' })}</span>
      ${dayShifts.length ? `<span class="day-net">${money(net)}</span><span class="day-rate">${hrs ? money(net / hrs) + '/hr' : ''}</span>` : '<span class="day-add">+</span>'}
    </button>`;
  }).join('');

  const flow = cashflow(store.get(), today());
  const row = (label, value, attrs = '') => `<li ${attrs}><span>${label}</span><strong>${value}</strong></li>`;
  view.innerHTML = `
    <header class="bar">
      <button class="icon" data-week="-7" aria-label="Previous week">‹</button>
      <h1>Week of ${fmtDay(start, { month: 'numeric', day: 'numeric', year: '2-digit' })}</h1>
      <button class="icon" data-week="7" aria-label="Next week">›</button>
    </header>
    <div class="week-tools"><button class="link" data-tab-go="settings">Settings</button></div>
    <button class="paycheck" data-open="withholding">
      <span>Estimated paycheck</span>
      <strong>${money(wk.check)}</strong>
      <span class="sub">for ${fmtDay(start, { month: 'numeric', day: 'numeric' })} to ${fmtDay(wk.end, { month: 'numeric', day: 'numeric' })} · tap for details</span>
    </button>
    ${safeCard(flow)}
    <section class="days">${days}</section>
    <ul class="stats">
      ${row('Total this week', money(wk.net))}
      ${row('Estimated taxes', money(wk.withholding.total) + ' ›', 'class="tap" data-open="withholding"')}
      ${row('Estimated take-home', money(wk.takeHome), 'class="highlight"')}
      ${row('Cash this week', money(wk.cash))}
      ${row('Hours worked', `${Math.floor(wk.hours)} hr ${Math.round((wk.hours % 1) * 60)} min`)}
      ${row('Hourly average', wk.hours ? money(wk.perHour) + ' / hr' : '-')}
      ${row(`${year} so far`, money(ytd))}
      ${row('Same week last year', money(sameWeekLastYear))}
      ${row(`Total ${year - 1}`, money(lastYear))}
    </ul>
    ${shifts.length ? '' : `<p class="empty">No shifts yet. Tap a day to log one, or import your tip tracker file in Settings.</p>`}`;

  view.onclick = (e) => {
    const t = e.target.closest('button, [data-open]');
    if (!t) return;
    if (t.dataset.tabGo) { ui.tab = t.dataset.tabGo; render(); return; }
    if (t.dataset.week) { ui.weekOf = addDays(start, Number(t.dataset.week)); render(); }
    if (t.dataset.day) {
      const existing = wk.shifts.filter((s) => s.date === t.dataset.day);
      if (existing.length === 1) openShift(existing[0]);
      else if (existing.length > 1) openDay(t.dataset.day, existing);
      else openShift({ date: t.dataset.day });
    }
    if (t.dataset.open === 'withholding') openWithholding(wk);
    if (t.dataset.open === 'cashflow') openCashflow();
  };
}

function safeCard(flow) {
  if (!flow) {
    return `<button class="safe" data-open="cashflow"><span>Safe to spend</span><strong>Set up</strong>
      <span class="sub">Enter what's in your bank and wallet to see what you can spend before payday</span></button>`;
  }
  const short = flow.short && flow.short.date >= flow.nextPayday;
  return `<button class="safe ${flow.safe < 0 ? 'negative' : ''}" data-open="cashflow">
    <span>Safe to spend until ${fmtDay(flow.nextPayday, { weekday: 'long' })}</span>
    <strong>${money(flow.safe)}</strong>
    <span class="sub">${flow.safe < 0 ? 'Bills due before payday are more than you have' : 'after bills due before payday'}${short ? ` · short on ${fmtDay(flow.short.date, { month: 'numeric', day: 'numeric' })}` : ''} · tap for timeline</span>
  </button>`;
}

// ---------- Shifts list ----------

function renderShifts() {
  const { shifts } = store.get();
  const byMonth = new Map();
  for (const s of [...shifts].sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start))) {
    const m = s.date.slice(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m).push(s);
  }
  const months = [...byMonth].slice(0, ui.shiftsShown);
  view.innerHTML = `
    <header class="bar"><span></span><h1>Shifts</h1><button class="icon" data-add aria-label="Add shift">+</button></header>
    ${months.map(([m, list]) => `
      <h2 class="month"><span>${parseDate(m + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
        <span>${money(sum(list, shiftNet), false)} · ${list.length} shifts</span></h2>
      <ul class="list">${list.map((s) => `
        <li class="tap" data-id="${s.id}">
          <span>${fmtDay(s.date, { weekday: 'short', month: 'short', day: 'numeric' })} <em>${esc(s.period)}${s.role === 'Trainer' ? ' · Trainer' : ''}</em></span>
          <strong>${money(shiftNet(s))}</strong>
        </li>`).join('')}</ul>`).join('')}
    ${byMonth.size > ui.shiftsShown ? '<button class="wide" data-more>Show older months</button>' : ''}
    ${shifts.length ? '' : '<p class="empty">No shifts yet.</p>'}`;

  view.onclick = (e) => {
    const t = e.target.closest('[data-id], [data-add], [data-more]');
    if (!t) return;
    if (t.dataset.id) openShift(shifts.find((s) => s.id === t.dataset.id));
    else if (t.hasAttribute('data-add')) openShift({ date: today() });
    else { ui.shiftsShown += 12; render(); }
  };
}

// ---------- Settings ----------

function renderSettings() {
  const { settings, shifts } = store.get();
  view.innerHTML = `
    <header class="bar"><span></span><h1>Settings</h1><span></span></header>
    <h2 class="group">Your data</h2>
    <ul class="list">
      <li><label class="row-btn">Import tip tracker file (.csv)<input type="file" accept=".csv,text/csv" data-import-csv hidden></label></li>
      <li class="tap" data-action="export-csv"><span>Export shifts as CSV</span></li>
      <li class="tap" data-action="backup"><span>Back up everything</span></li>
      <li><label class="row-btn">Restore from backup<input type="file" accept=".json,application/json" data-restore hidden></label></li>
    </ul>
    <p class="note">${shifts.length} shifts saved on this phone. Back up after big changes and keep the file in iCloud Drive.</p>
    <p class="note" id="msg" role="status"></p>

    <h2 class="group">Paycheck estimate</h2>
    <ul class="list form">
      <li><span>Week starts on</span>
        <select data-setting="weekStart">
          ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((l, v) => `<option value="${v}" ${settings.weekStart === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select></li>
      <li><span>Paycheck arrives on</span>
        <select data-setting="payday">
          ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((l, v) => `<option value="${v}" ${settings.payday === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select></li>
      <li><span>Server hourly wage</span>
        <span class="suffix">$<input type="number" inputmode="decimal" step="0.01" min="0" data-setting="wage" value="${settings.wage}"></span></li>
      <li><span>Trainer hourly wage</span>
        <span class="suffix">$<input type="number" inputmode="decimal" step="0.01" min="0" data-setting="trainerWage" value="${settings.trainerWage}"></span></li>
      <li><span>New York City resident</span><input type="checkbox" data-setting="nyc" ${settings.nyc ? 'checked' : ''}></li>
      <li><span>Tip-out</span>
        <span class="suffix"><input type="number" inputmode="decimal" step="0.1" min="0" max="100" data-setting="tipoutRate" value="${+(settings.tipoutRate * 100).toFixed(2)}">%</span></li>
      <li><span>Cash tips declared</span>
        <span class="suffix"><input type="number" inputmode="numeric" min="0" max="100" data-setting="cashDeclared" value="${Math.round(settings.cashDeclared * 100)}">%</span></li>
      <li><span>Other deductions per check</span>
        <span class="suffix">$<input type="number" inputmode="decimal" step="0.01" min="0" data-setting="otherDeductions" value="${settings.otherDeductions}"></span></li>
    </ul>
    <p class="note">Estimates use 2026 federal, New York State and New York City withholding for a single filer. The city figure is approximate.</p>`;

  const msg = (text) => { $('#msg').textContent = text; };
  view.onclick = (e) => {
    const t = e.target.closest('[data-action]');
    if (!t) return;
    if (t.dataset.action === 'export-csv') download('shifts.csv', shiftsToCsv(store.get().shifts), 'text/csv');
    if (t.dataset.action === 'backup') download(`budget-backup-${today()}.json`, store.backup(), 'application/json');
  };
  view.onchange = async (e) => {
    const t = e.target;
    try {
      if (t.matches('[data-import-csv]') && t.files[0]) {
        const { added, skipped } = store.importShifts(shiftsFromCsv(await t.files[0].text()));
        msg(`Imported ${added} shifts${skipped ? `, skipped ${skipped} already saved` : ''}.`);
      } else if (t.matches('[data-restore]') && t.files[0]) {
        store.restore(await t.files[0].text());
        msg('Backup restored.');
      } else if (t.dataset.setting) {
        const k = t.dataset.setting;
        const v = k === 'nyc' ? t.checked
          : k === 'cashDeclared' || k === 'tipoutRate' ? Math.min(100, Math.max(0, Number(t.value))) / 100
          : Number(t.value);
        store.updateSettings({ [k]: v });
        if (k === 'weekStart') ui.weekOf = null;
      }
    } catch (err) {
      msg(`That didn't work: ${err.message}`);
    }
  };
}

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- Sheets ----------

function openShift(s) {
  const f = (k) => (s[k] ?? '');
  const num = (k) => (s[k] ? s[k] : '');
  openSheet(`
    <form>
      <header class="sheet-head">
        <button type="button" class="link" data-close>Cancel</button>
        <h2>${s.id ? 'Edit shift' : 'New shift'}</h2>
        <button class="link strong">Save</button>
      </header>
      <ul class="list form">
        <li><span>Date</span><input type="date" name="date" value="${esc(f('date'))}" required></li>
        <li><span>Role</span><select name="role">${['Server', 'Trainer'].map((r) => `<option ${(f('role') || 'Server') === r ? 'selected' : ''}>${r}</option>`).join('')}</select></li>
        <li><span>Shift</span><select name="period">${['Night', 'Day'].map((p) => `<option ${f('period') === p ? 'selected' : ''}>${p}</option>`).join('')}</select></li>
        <li><span>Start</span><input type="time" name="start" value="${esc(f('start') || '16:00')}"></li>
        <li><span>End</span><input type="time" name="end" value="${esc(f('end') || '23:00')}"></li>
      </ul>
      <ul class="list form">
        <li><span>Credit tips</span><span class="suffix">$<input name="credit" type="number" inputmode="decimal" step="0.01" min="0" value="${num('credit')}" placeholder="0"></span></li>
        <li><span>Cash tips</span><span class="suffix">$<input name="cash" type="number" inputmode="decimal" step="0.01" min="0" value="${num('cash')}" placeholder="0"></span></li>
        <li><span>Tipped out</span><span class="suffix">$<input name="tipout" type="number" inputmode="decimal" step="0.01" min="0" value="${num('tipout')}" placeholder="0"></span></li>
        <li><span>Hourly pay</span><span class="suffix">$<input name="hourly" type="number" inputmode="decimal" step="0.01" min="0" value="${num('hourly')}" placeholder="0"></span></li>
      </ul>
      <p class="live" id="live"></p>
      <h2 class="group" id="checkout-head">Checkout sheet</h2>
      <ul class="stats" id="checkout"></ul>
      ${s.id ? '<button type="button" class="wide danger" data-delete>Delete shift</button>' : ''}
    </form>`,
  (e) => {
    const del = e.target.closest('[data-delete]');
    if (!del) return;
    armDelete(del, () => { store.deleteShift(s.id); closeSheet(); });
  },
  (data) => {
    const n = (k) => Number(data.get(k)) || 0;
    store.saveShift({
      ...s, date: data.get('date'), role: data.get('role'), period: data.get('period'), start: data.get('start'), end: data.get('end'),
      credit: n('credit'), cash: n('cash'), tipout: n('tipout'), hourly: n('hourly'), note: s.note ?? '',
    });
    closeSheet();
  });

  const form = $('#sheet form');
  const hourlyInput = form.elements.hourly;
  const tipoutInput = form.elements.tipout;
  const { tipoutRate } = store.get().settings;
  const tipoutFor = (credit, cash) => Math.round((credit + cash) * tipoutRate * 100) / 100;
  // Tip-out fills from credit plus cash tips at the house rate until it is typed over.
  // An existing shift keeps updating only if its tip-out already matches the rate.
  let autoTipout = !s.id || Math.abs((s.tipout || 0) - tipoutFor(s.credit || 0, s.cash || 0)) < 0.01;
  tipoutInput.addEventListener('input', () => { autoTipout = false; });
  // Hourly pay fills from hours x the role's wage until it is typed over;
  // changing the role or times fills it again.
  let autoHourly = !s.id;
  hourlyInput.addEventListener('input', () => { autoHourly = false; });
  form.addEventListener('change', (e) => { if (['role', 'start', 'end'].includes(e.target.name)) { autoHourly = true; live(); } });
  function live() {
    if (autoTipout) {
      const t = tipoutFor(+form.elements.credit.value || 0, +form.elements.cash.value || 0);
      tipoutInput.value = t ? t.toFixed(2) : '';
    }
    if (autoHourly) {
      const { wage, trainerWage } = store.get().settings;
      const hrs = shiftHours({ start: form.elements.start.value, end: form.elements.end.value });
      hourlyInput.value = (hrs * (form.elements.role.value === 'Trainer' ? trainerWage : wage)).toFixed(2);
    }
    const d = new FormData(form);
    const x = { hourly: +d.get('hourly') || 0, cash: +d.get('cash') || 0, credit: +d.get('credit') || 0,
      tipout: +d.get('tipout') || 0, start: d.get('start'), end: d.get('end') };
    const net = shiftNet(x), hrs = shiftHours(x);
    $('#live').textContent = `Net ${money(net)}${hrs ? ` · ${money(net / hrs)}/hr over ${hrs.toFixed(1)} hr` : ''}`;
    // The same lines, in the same order, as the restaurant's nightly checkout sheet.
    const total = x.credit + x.cash;
    $('#checkout-head').hidden = $('#checkout').hidden = !total;
    $('#checkout').innerHTML = [
      ['Net c/c tips', money(x.credit)],
      ['+ Cash tips', money(x.cash)],
      ['= Total tips', money(total)],
      [`− ${+(tipoutRate * 100).toFixed(2)}% tip-out`, money(x.tipout)],
      ['= Claimed tips', money(total - x.tipout)],
      ['On paycheck <span class="sub">charge tips − tip-out</span>', money(x.credit - x.tipout), 'highlight'],
    ].map(([l, v, c]) => `<li class="${c ?? ''}"><span>${l}</span><strong>${v}</strong></li>`).join('');
  }
  form.oninput = live;
  live();
}

function openDay(iso, list) {
  openSheet(`
    <header class="sheet-head"><span></span><h2>${fmtDay(iso, { weekday: 'long', month: 'short', day: 'numeric' })}</h2><button class="link" data-close>Done</button></header>
    <ul class="list">${list.map((s) => `<li class="tap" data-id="${s.id}"><span>${esc(s.period)}${s.role === 'Trainer' ? ' trainer' : ''} ${esc(s.start)}–${esc(s.end)}</span><strong>${money(shiftNet(s))}</strong></li>`).join('')}
      <li class="tap" data-new><span>Add another shift</span><strong>+</strong></li></ul>`,
  (e) => {
    const t = e.target.closest('[data-id], [data-new]');
    if (!t) return;
    if (t.dataset.id) openShift(list.find((s) => s.id === t.dataset.id));
    else openShift({ date: iso });
  });
}

function openCashflow() {
  const { settings } = store.get();
  const flow = cashflow(store.get(), today());
  const short = (d) => fmtDay(d, { month: 'numeric', day: 'numeric' });
  const rows = (flow?.events ?? []).filter((e) => e.date > today() || e.kind === 'cash').map((e) => `
    <li class="${e.balance < 0 ? 'short' : ''}"><span class="stack">${esc(e.label)}${e.kind === 'pay' ? ` for ${short(e.week)}–${short(addDays(e.week, 6))}` : ''}
      <span class="sub">${fmtDay(e.date, { weekday: 'short', month: 'short', day: 'numeric' })}${e.estimate ? ' · estimate' : ''} · leaves ${money(e.balance)}</span></span>
      <strong class="${e.amount > 0 ? 'in' : ''}">${e.amount > 0 ? '+' : ''}${money(e.amount)}</strong></li>`).join('');
  openSheet(`
    <form>
      <header class="sheet-head"><span></span><h2>Money ahead</h2><button type="button" class="link" data-close>Done</button></header>
      <ul class="list form">
        <li><span class="stack">Bank + cash right now<span class="sub">${settings.balanceDate ? `Last set ${fmtDay(settings.balanceDate, { month: 'short', day: 'numeric' })}` : 'Not set yet'}</span></span>
          <span class="suffix">$<input name="balance" type="number" inputmode="decimal" step="0.01" value="${settings.balanceDate ? settings.balance : ''}" placeholder="0" required></span></li>
      </ul>
      <button class="wide">Update balance</button>
    </form>
    ${flow ? `
      <ul class="stats">
        <li><span>In hand now (estimated)</span><strong>${money(flow.now)}</strong></li>
        <li class="highlight"><span>Safe to spend until ${fmtDay(flow.nextPayday, { weekday: 'long' })}</span><strong>${money(flow.safe)}</strong></li>
      </ul>
      <h2 class="group">Next 5 weeks</h2>
      <ul class="list">${rows || '<li><span>No paychecks or bills coming up.</span></li>'}</ul>
      <p class="note">Checks for weeks you haven't finished count at least ${money(flow.cautious, false)}, the average of your 3 smallest checks lately. Cash tips from future shifts and yearly bills aren't counted. Update your balance every few days, and after you pay a bill.</p>` : ''}`,
  null,
  (d) => {
    store.updateSettings({ balance: Number(d.get('balance')) || 0, balanceDate: today() });
    openCashflow();
  });
}

function openWithholding(wk) {
  const labels = {
    federal: 'Federal income tax', socialSecurity: 'Social Security', medicare: 'Medicare',
    newYorkState: 'New York State', newYorkCity: 'New York City (approx.)', paidFamilyLeave: 'NY paid family leave',
    disability: 'NY disability', other: 'Other deductions',
  };
  const { settings } = store.get();
  const rate = wk.shifts.length ? marginalRate(wk.taxable, { nyc: settings.nyc }) : 0;
  openSheet(`
    <header class="sheet-head"><span></span><h2>Estimated paycheck</h2><button class="link" data-close>Done</button></header>
    <ul class="stats">
      <li><span>Pay through payroll</span><strong>${money(wk.taxable)}</strong></li>
      ${Object.entries(wk.withholding.lines).filter(([, v]) => v).map(([k, v]) => `<li><span>${labels[k]}</span><strong>-${money(v)}</strong></li>`).join('')}
      <li class="highlight"><span>Estimated check</span><strong>${money(wk.check)}</strong></li>
    </ul>
    <p class="note">Payroll counts your credit tips after tip-out, hourly pay and declared cash tips. Declared cash is already in your pocket, so it is taken back out of the check.</p>
    ${rate ? `<p class="note">At this week's pay, about ${Math.round(rate * 100)}¢ of each extra dollar goes to taxes. Only the dollars above each bracket line are taxed at the higher rate.</p>` : ''}`);
}

// ---------- Shell ----------

function render() {
  document.querySelectorAll('nav [data-tab]').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === ui.tab ? 'page' : 'false'));
  ({
    home: renderHome, shifts: renderShifts, settings: renderSettings,
    bills: () => renderBills(view), budget: () => renderBudget(view), goals: () => renderGoals(view),
  })[ui.tab]();
}

$('nav').onclick = (e) => {
  const t = e.target.closest('[data-tab]');
  if (!t) return;
  ui.tab = t.dataset.tab;
  if (ui.tab === 'home') ui.weekOf = null;
  render();
  window.scrollTo(0, 0);
};
store.subscribe(() => { if (ui.tab !== 'settings') render(); });
render();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
