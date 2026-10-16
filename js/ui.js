// Small DOM helpers shared by the screens.

export const $ = (sel, root = document) => root.querySelector(sel);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const sheet = () => $('#sheet');

// Bottom sheet. onClick gets clicks inside it; onSubmit gets the form's data.
export function openSheet(html, onClick, onSubmit) {
  const el = sheet();
  el.innerHTML = `<div class="sheet-body">${html}</div>`;
  el.onclick = (e) => {
    if (e.target === el || e.target.closest('[data-close]')) return closeSheet();
    onClick?.(e);
  };
  const form = $('form', el);
  if (form && onSubmit) form.onsubmit = (e) => { e.preventDefault(); onSubmit(new FormData(form)); };
  if (!el.open) el.showModal();
  return el;
}
export function closeSheet() { sheet().close(); }

// A delete button that asks for a second tap instead of a browser dialog.
export function armDelete(btn, onConfirm) {
  if (btn.dataset.armed) return onConfirm();
  btn.dataset.armed = '1';
  btn.textContent = 'Tap again to delete';
}

export const moneyInput = (name, value, extra = '') =>
  `<span class="suffix">$<input name="${name}" type="number" inputmode="decimal" step="0.01" min="0" value="${value || ''}" placeholder="0" ${extra}></span>`;
