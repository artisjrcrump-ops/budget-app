// All data lives on the phone in localStorage under one key.

const KEY = 'budget-app/v1';

const DEFAULTS = {
  shifts: [],
  bills: [], // { id, name, amount, dueDay, repeat: 'monthly' | 'weekly' | 'yearly', autopay, paid: ['YYYY-MM'] }
  categories: [], // { id, name, limit, entries: [{ id, date, amount, note }] }
  goals: [], // { id, name, target, targetDate, deposits: [{ id, date, amount }] }
  settings: {
    weekStart: 2, // 0 = Sunday ... 6 = Saturday; Tuesday matches the Tue-Mon pay period
    nyc: true,
    cashDeclared: 1, // share of cash tips reported to payroll
    otherDeductions: 4.90, // per check, after tax
    wage: 11.35, // server hourly wage, used to fill in hourly pay from shift hours
    trainerWage: 17.00, // hourly wage on shifts spent training someone
    payday: 5, // weekday the check lands; a pay week is paid on the first payday after it ends
    balance: 0, // bank plus cash on hand, as of balanceDate
    balanceDate: null,
  },
};

let state = load();
const listeners = new Set();

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved) return { ...DEFAULTS, ...saved, settings: { ...DEFAULTS.settings, ...saved.settings } };
  } catch { /* fall through to defaults */ }
  return structuredClone(DEFAULTS);
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { alertOnce(e); }
  listeners.forEach((fn) => fn(state));
}

let warned = false;
function alertOnce(e) {
  if (warned) return;
  warned = true;
  console.error('Could not save', e);
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

export const store = {
  get: () => state,
  subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },

  saveShift(shift) {
    if (shift.id) state.shifts = state.shifts.map((s) => (s.id === shift.id ? shift : s));
    else state.shifts.push({ ...shift, id: newId() });
    save();
  },
  deleteShift(id) {
    state.shifts = state.shifts.filter((s) => s.id !== id);
    save();
  },
  // Adds shifts, skipping any that match an existing shift's date, start time and tips.
  importShifts(shifts) {
    const key = (s) => [s.date, s.start, s.credit, s.cash].join('|');
    const seen = new Set(state.shifts.map(key));
    const fresh = shifts.filter((s) => !seen.has(key(s))).map((s) => ({ ...s, id: newId() }));
    state.shifts.push(...fresh);
    save();
    return { added: fresh.length, skipped: shifts.length - fresh.length };
  },
  // Bills, categories and goals share one add-or-replace and one delete.
  upsert(list, item) {
    if (item.id) state[list] = state[list].map((x) => (x.id === item.id ? item : x));
    else state[list].push({ ...item, id: newId() });
    save();
  },
  remove(list, id) {
    state[list] = state[list].filter((x) => x.id !== id);
    save();
  },
  newId,
  updateSettings(patch) {
    state.settings = { ...state.settings, ...patch };
    save();
  },
  backup: () => JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 1),
  restore(json) {
    const data = JSON.parse(json);
    if (!Array.isArray(data.shifts)) throw new Error('This is not a budget app backup.');
    state = { ...DEFAULTS, ...data, settings: { ...DEFAULTS.settings, ...data.settings } };
    delete state.exportedAt;
    save();
  },
};
