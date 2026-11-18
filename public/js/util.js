// Small helpers shared by the pages.

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function el(html) {
  const div = document.createElement('div');
  div.innerHTML = html.trim();
  return div.firstElementChild;
}

/** Go to another page of the site without a reload. */
export function go(path) {
  history.pushState(null, '', path);
  dispatchEvent(new PopStateEvent('popstate'));
}

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const fmtDate = (d) =>
  d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';

export function hourLabel(h) {
  const d = new Date(2000, 0, 1, h);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
