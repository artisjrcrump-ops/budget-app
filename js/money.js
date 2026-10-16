// Bills, Budget and Goals screens.
import { store } from './store.js';
import { esc, openSheet, closeSheet, armDelete, moneyInput } from './ui.js';
import { money, today, parseDate, weekStartOf, weekSummary, addDays, sum } from './calc.js';
import {
  monthlyCost, nextDue, daysBetween, safeMonthlyIncome, goalSaved, goalPace, spentThisMonth,
} from './budget.js';

const fmt = (iso, opts = { month: 'short', day: 'numeric' }) => parseDate(iso).toLocaleDateString('en-US', opts);
const monthKey = () => today().slice(0, 7);
const meter = (part, whole) => {
  const pct = whole ? Math.min(100, (part / whole) * 100) : 0;
  return `<div class="meter ${whole && part > whole ? 'over' : ''}"><i style="width:${pct.toFixed(1)}%"></i></div>`;
};
const header = (title, addLabel) =>
  `<header class="bar"><span></span><h1>${title}</h1><button class="icon" data-add aria-label="${addLabel}">+</button></header>`;

// ---------- Bills ----------

export function renderBills(view) {
  const { bills } = store.get();
  const now = today();
  const month = monthKey();
  const sorted = [...bills].sort((a, b) => {
    const da = a.repeat === 'monthly' ? nextDue(a, now) : '9999';
    const db = b.repeat === 'monthly' ? nextDue(b, now) : '9999';
    return da.localeCompare(db) || a.name.localeCompare(b.name);
  });
  const total = sum(bills, monthlyCost);
  // A monthly bill's paid mark belongs to the month of its next due date.
  const dueMonth = (b) => nextDue(b, now).slice(0, 7);
  const isPaid = (b) => b.repeat === 'monthly' && (b.paid ?? []).includes(dueMonth(b));
  const unpaid = sum(bills.filter((b) => b.repeat === 'monthly' && dueMonth(b) === month && !isPaid(b)), (b) => b.amount);

  view.innerHTML = `
    ${header('Bills', 'Add bill')}
    <div class="big"><strong>${money(total)}</strong><span>a month in bills · ${money(unpaid)} still due this month</span></div>
    <ul class="list">${sorted.map((b) => {
      const paid = isPaid(b);
      let when = b.repeat === 'weekly' ? 'Every week' : b.repeat === 'yearly' ? 'Once a year' : '';
      if (b.repeat === 'monthly') {
        const due = nextDue(b, now);
        const days = daysBetween(now, due);
        when = paid ? `Paid for ${fmt(due, { month: 'long' })}` : `Due ${fmt(due)}${days === 0 ? ', today' : days === 1 ? ', tomorrow' : `, in ${days} days`}`;
      }
      return `<li class="tap ${paid ? 'done' : ''}" data-id="${b.id}">
        ${b.repeat === 'monthly' ? `<button class="check ${paid ? 'on' : ''}" data-paid="${b.id}" aria-label="Mark paid">${paid ? '✓' : ''}</button>` : ''}
        <span class="stack">${esc(b.name)}<span class="sub">${when}${b.autopay ? ' · autopay' : ''}</span></span>
        <strong>${money(b.amount)}</strong></li>`;
    }).join('')}</ul>
    ${bills.length ? '' : '<p class="empty">Add rent, phone, transit, subscriptions and anything else you pay regularly.</p>'}
    <button class="wide" data-add>Add a bill</button>`;

  view.onclick = (e) => {
    const paidBtn = e.target.closest('[data-paid]');
    if (paidBtn) {
      const b = bills.find((x) => x.id === paidBtn.dataset.paid);
      const set = new Set(b.paid ?? []);
      const key = dueMonth(b);
      set.has(key) ? set.delete(key) : set.add(key);
      store.upsert('bills', { ...b, paid: [...set] });
      return;
    }
    const t = e.target.closest('[data-id], [data-add]');
    if (!t) return;
    openBill(t.dataset.id ? bills.find((b) => b.id === t.dataset.id) : { repeat: 'monthly', dueDay: 1 });
  };
}

function openBill(b) {
  openSheet(`
    <form>
      <header class="sheet-head"><button type="button" class="link" data-close>Cancel</button>
        <h2>${b.id ? 'Edit bill' : 'New bill'}</h2><button class="link strong">Save</button></header>
      <ul class="list form">
        <li><span>Name</span><input type="text" name="name" value="${esc(b.name)}" placeholder="Rent" required></li>
        <li><span>Amount</span>${moneyInput('amount', b.amount, 'required')}</li>
        <li><span>Repeats</span><select name="repeat">
          ${[['monthly', 'Every month'], ['weekly', 'Every week'], ['yearly', 'Every year']].map(([v, l]) => `<option value="${v}" ${b.repeat === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select></li>
        <li><span>Due on day</span><input type="number" name="dueDay" inputmode="numeric" min="1" max="31" value="${b.dueDay ?? 1}"></li>
        <li><span>Autopay</span><input type="checkbox" name="autopay" ${b.autopay ? 'checked' : ''}></li>
      </ul>
      ${b.id ? '<button type="button" class="wide danger" data-delete>Delete bill</button>' : ''}
    </form>`,
  (e) => {
    const del = e.target.closest('[data-delete]');
    if (del) armDelete(del, () => { store.remove('bills', b.id); closeSheet(); });
  },
  (d) => {
    store.upsert('bills', {
      ...b, name: d.get('name').trim(), amount: Number(d.get('amount')) || 0, repeat: d.get('repeat'),
      dueDay: Math.min(31, Math.max(1, Number(d.get('dueDay')) || 1)), autopay: d.get('autopay') === 'on', paid: b.paid ?? [],
    });
    closeSheet();
  });
}

// ---------- Budget ----------

const SUGGESTED = ['Groceries', 'Eating out', 'Transit', 'Personal'];

export function renderBudget(view) {
  const { shifts, bills, categories, goals, settings } = store.get();
  const now = today();
  const month = monthKey();
  const safe = safeMonthlyIncome(shifts, settings, now);
  const billTotal = sum(bills, monthlyCost);
  const limits = sum(categories, (c) => c.limit);
  const goalTotal = sum(goals, (g) => goalPace(g, shifts, now).perMonth);
  const left = safe - billTotal - limits - goalTotal;

  // Take-home from pay weeks that started this month.
  let soFar = 0;
  for (let w = weekStartOf(`${month}-01`, settings.weekStart); w <= now; w = addDays(w, 7)) {
    if (w.startsWith(month)) soFar += weekSummary(shifts, w, settings).takeHome;
  }

  view.innerHTML = `
    ${header('Budget', 'Add category')}
    <div class="big ${left < 0 ? 'negative' : ''}"><strong>${money(left, false)}</strong>
      <span>${left < 0 ? 'over plan each month' : 'left over each month after everything below'}</span></div>
    <ul class="stats">
      <li class="tap" data-info><span>Safe monthly income ⓘ</span><strong>${money(safe, false)}</strong></li>
      <li><span>Bills</span><strong>-${money(billTotal, false)}</strong></li>
      <li><span>Spending limits</span><strong>-${money(limits, false)}</strong></li>
      <li><span>Savings goals</span><strong>-${money(goalTotal, false)}</strong></li>
      <li class="highlight"><span>Taken home in ${fmt(now, { month: 'long' })} so far</span><strong>${money(soFar, false)}</strong></li>
    </ul>
    <h2 class="group">Spending this month</h2>
    <ul class="list">${categories.map((c) => {
      const spent = spentThisMonth(c, month);
      return `<li class="tap" data-id="${c.id}"><span class="stack">${esc(c.name)}
        <span class="sub">${money(spent, false)} of ${money(c.limit, false)}${c.limit ? (spent > c.limit ? ` · ${money(spent - c.limit, false)} over` : ` · ${money(c.limit - spent, false)} left`) : ''}</span>
        ${meter(spent, c.limit)}</span></li>`;
    }).join('')}</ul>
    ${categories.length ? '' : '<button class="wide" data-suggest>Add groceries, eating out, transit and personal</button>'}
    <button class="wide" data-add>Add a category</button>`;

  view.onclick = (e) => {
    if (e.target.closest('[data-info]')) return openSafeInfo(safe);
    if (e.target.closest('[data-suggest]')) {
      SUGGESTED.forEach((name) => store.upsert('categories', { name, limit: 0, entries: [] }));
      return;
    }
    const t = e.target.closest('[data-id], [data-add]');
    if (!t) return;
    if (t.dataset.id) openCategory(categories.find((c) => c.id === t.dataset.id));
    else editCategory({ limit: 0, entries: [] });
  };
}

function openSafeInfo(safe) {
  openSheet(`
    <header class="sheet-head"><span></span><h2>Safe monthly income</h2><button class="link" data-close>Done</button></header>
    <p class="note">${money(safe, false)} is the average take-home of your 3 slowest months out of the last 12, after estimated taxes. Planning on a slow month means a good month leaves extra instead of a slow month leaving you short.</p>`);
}

function openCategory(c) {
  const month = monthKey();
  const entries = (c.entries ?? []).filter((x) => x.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date));
  openSheet(`
    <form>
      <header class="sheet-head"><button type="button" class="link" data-edit>Edit</button>
        <h2>${esc(c.name)}</h2><button type="button" class="link" data-close>Done</button></header>
      <ul class="list form">
        <li><span>Spent</span>${moneyInput('amount', '', 'required')}</li>
        <li><span>On</span><input type="text" name="note" placeholder="Optional"></li>
        <li><span>Date</span><input type="date" name="date" value="${today()}"></li>
      </ul>
      <button class="wide">Add spending</button>
    </form>
    <h2 class="group">This month · ${money(spentThisMonth(c, month))} of ${money(c.limit, false)}</h2>
    <ul class="list">${entries.map((x) => `<li><span class="stack">${esc(x.note) || 'Spending'}<span class="sub">${fmt(x.date)}</span></span>
      <strong>${money(x.amount)}</strong><button class="link danger" data-del-entry="${x.id}" aria-label="Remove">✕</button></li>`).join('')}</ul>`,
  (e) => {
    if (e.target.closest('[data-edit]')) return editCategory(c);
    const del = e.target.closest('[data-del-entry]');
    if (del) {
      const next = { ...c, entries: c.entries.filter((x) => x.id !== del.dataset.delEntry) };
      store.upsert('categories', next);
      openCategory(next);
    }
  },
  (d) => {
    const next = { ...c, entries: [...(c.entries ?? []), { id: store.newId(), date: d.get('date') || today(), amount: Number(d.get('amount')) || 0, note: d.get('note').trim() }] };
    store.upsert('categories', next);
    openCategory(next);
  });
}

function editCategory(c) {
  openSheet(`
    <form>
      <header class="sheet-head"><button type="button" class="link" data-close>Cancel</button>
        <h2>${c.id ? 'Edit category' : 'New category'}</h2><button class="link strong">Save</button></header>
      <ul class="list form">
        <li><span>Name</span><input type="text" name="name" value="${esc(c.name)}" placeholder="Groceries" required></li>
        <li><span>Monthly limit</span>${moneyInput('limit', c.limit)}</li>
      </ul>
      ${c.id ? '<button type="button" class="wide danger" data-delete>Delete category</button>' : ''}
    </form>`,
  (e) => {
    const del = e.target.closest('[data-delete]');
    if (del) armDelete(del, () => { store.remove('categories', c.id); closeSheet(); });
  },
  (d) => {
    store.upsert('categories', { ...c, name: d.get('name').trim(), limit: Number(d.get('limit')) || 0 });
    closeSheet();
  });
}

// ---------- Goals ----------

export function renderGoals(view) {
  const { goals, shifts } = store.get();
  const now = today();
  view.innerHTML = `
    ${header('Goals', 'Add goal')}
    <ul class="list">${goals.map((g) => {
      const saved = goalSaved(g);
      const pace = goalPace(g, shifts, now);
      const plan = pace.left === 0 ? 'Reached. Nice work.'
        : g.targetDate ? `Save ${money(pace.perShift)} a shift (${money(pace.perMonth, false)} a month) to reach it by ${fmt(g.targetDate, { month: 'short', day: 'numeric', year: 'numeric' })}`
        : `${money(pace.left, false)} to go`;
      return `<li class="tap" data-id="${g.id}"><span class="stack">${esc(g.name)}
        <span class="sub">${money(saved, false)} of ${money(g.target, false)} · ${plan}</span>${meter(saved, g.target)}</span></li>`;
    }).join('')}</ul>
    ${goals.length ? '' : '<p class="empty">Add something to save for, like an emergency fund, a trip or a car, with a target date.</p>'}
    <button class="wide" data-add>Add a goal</button>`;

  view.onclick = (e) => {
    const t = e.target.closest('[data-id], [data-add]');
    if (!t) return;
    if (t.dataset.id) openGoal(goals.find((g) => g.id === t.dataset.id));
    else editGoal({ deposits: [] });
  };
}

function openGoal(g) {
  const deposits = [...(g.deposits ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  openSheet(`
    <form>
      <header class="sheet-head"><button type="button" class="link" data-edit>Edit</button>
        <h2>${esc(g.name)}</h2><button type="button" class="link" data-close>Done</button></header>
      <div class="big"><strong>${money(goalSaved(g), false)}</strong><span>saved of ${money(g.target, false)}</span></div>
      <ul class="list form">
        <li><span>Put aside</span>${moneyInput('amount', '', 'required')}</li>
        <li><span>Date</span><input type="date" name="date" value="${today()}"></li>
      </ul>
      <button class="wide">Add to goal</button>
    </form>
    <ul class="list">${deposits.map((x) => `<li><span>${fmt(x.date, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
      <strong>${money(x.amount)}</strong><button class="link danger" data-del-dep="${x.id}" aria-label="Remove">✕</button></li>`).join('')}</ul>`,
  (e) => {
    if (e.target.closest('[data-edit]')) return editGoal(g);
    const del = e.target.closest('[data-del-dep]');
    if (del) {
      const next = { ...g, deposits: g.deposits.filter((x) => x.id !== del.dataset.delDep) };
      store.upsert('goals', next);
      openGoal(next);
    }
  },
  (d) => {
    const next = { ...g, deposits: [...(g.deposits ?? []), { id: store.newId(), date: d.get('date') || today(), amount: Number(d.get('amount')) || 0 }] };
    store.upsert('goals', next);
    openGoal(next);
  });
}

function editGoal(g) {
  openSheet(`
    <form>
      <header class="sheet-head"><button type="button" class="link" data-close>Cancel</button>
        <h2>${g.id ? 'Edit goal' : 'New goal'}</h2><button class="link strong">Save</button></header>
      <ul class="list form">
        <li><span>Name</span><input type="text" name="name" value="${esc(g.name)}" placeholder="Emergency fund" required></li>
        <li><span>Target</span>${moneyInput('target', g.target, 'required')}</li>
        <li><span>Reach by</span><input type="date" name="targetDate" value="${esc(g.targetDate)}"></li>
      </ul>
      ${g.id ? '<button type="button" class="wide danger" data-delete>Delete goal</button>' : ''}
    </form>`,
  (e) => {
    const del = e.target.closest('[data-delete]');
    if (del) armDelete(del, () => { store.remove('goals', g.id); closeSheet(); });
  },
  (d) => {
    store.upsert('goals', { ...g, name: d.get('name').trim(), target: Number(d.get('target')) || 0, targetDate: d.get('targetDate') || '' });
    closeSheet();
  });
}
