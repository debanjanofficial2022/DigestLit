// Digestlit site shell: routing, the sign-in gate and the header.
import { getUser, onAuthChange, configured } from './auth.js';
import { logoSVG } from './logo.js';
import * as pages from './pages.js';
import { trackersPage, newTrackerPage, trackerPage, editTrackerPage } from './trackers.js';

// Pages anyone can open, and pages that need a signed-in account
const open = {
  '/signin': { view: pages.signin, title: 'Sign in' },
  '/logo': { view: pages.logoPage, title: 'Logo versions' },
  '/get-a-key': { view: pages.getKey, title: 'Get a key', nav: 'get-a-key' },
};
const gated = {
  '/': { view: pages.dashboard, title: null, nav: null },
  '/trackers': { view: trackersPage, title: 'Trackers', nav: 'trackers' },
  '/trackers/new': { view: newTrackerPage, title: 'New tracker', nav: 'trackers' },
  '/reports': { view: pages.reports, title: 'Reports', nav: 'reports' },
  '/monthly': { view: pages.monthly, title: 'Monthly', nav: 'monthly' },
  '/settings': { view: pages.settings, title: 'Settings', nav: 'settings' },
};

// Addresses with an id in them: /trackers/<id>, /trackers/<id>/edit
const gatedPatterns = [
  { re: /^\/trackers\/([0-9a-f-]{36})$/i, view: trackerPage, title: 'Tracker', nav: 'trackers' },
  { re: /^\/trackers\/([0-9a-f-]{36})\/edit$/i, view: editTrackerPage, title: 'Edit tracker', nav: 'trackers' },
];

function matchGated(path) {
  if (gated[path]) return { ...gated[path], args: [] };
  for (const p of gatedPatterns) {
    const m = path.match(p.re);
    if (m) return { ...p, args: m.slice(1) };
  }
  return null;
}

const main = document.getElementById('main');
let user = null;
let renderId = 0;

function go(path) {
  history.pushState(null, '', path);
  render();
}

async function render() {
  const id = ++renderId;
  let path = location.pathname.replace(/\/+$/, '') || '/';

  // A signed-in person has no use for the sign-in page
  if (user && path === '/signin') {
    history.replaceState(null, '', '/');
    path = '/';
  }

  const g = matchGated(path);
  let route = open[path] || g;
  let view;
  if (!route) view = pages.notFound;
  else if (g && !user) {
    // Signed out: the start page explains Digestlit; other private pages ask for sign-in
    route = path === '/' ? { view: pages.home, title: null } : { view: pages.signin, title: 'Sign in' };
    view = route.view;
  } else view = route.view;

  document.title = route && route.title ? `${route.title} · Digestlit` : 'Digestlit';
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (route && a.dataset.nav === route.nav) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.getElementById('topnav').hidden = !user;
  document.getElementById('signin-link').hidden = !!user || path === '/signin' || path === '/';

  main.innerHTML = '<p class="loading">Loading…</p>';
  try {
    const node = await view(user, ...((route && route.args) || []));
    if (id !== renderId) return;
    main.replaceChildren(node);
  } catch (err) {
    if (id !== renderId) return;
    main.innerHTML = `<div class="wrap narrow"><h1>Something went wrong</h1><p class="muted"></p></div>`;
    main.querySelector('p').textContent = err.message || String(err);
  }
  if (flash) {
    const box = document.createElement('p');
    box.className = 'notice';
    box.style.margin = '20px auto 0';
    box.style.maxWidth = '680px';
    box.textContent = flash;
    main.prepend(box);
    flash = null;
  }
}

// A sign-in link that failed (expired or already used) comes back with an error in the address
let flash = null;
function readLinkError() {
  const params = new URLSearchParams(location.hash.slice(1) || location.search.slice(1));
  if (params.get('error')) {
    flash =
      params.get('error_code') === 'otp_expired'
        ? 'That sign-in link has expired or was already used. Enter your email to get a new one.'
        : `Sign-in didn't work: ${params.get('error_description') || params.get('error')}`;
    history.replaceState(null, '', location.pathname);
  }
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  go(a.getAttribute('href'));
});
addEventListener('popstate', render);

async function start() {
  document.getElementById('brand-logo').innerHTML = logoSVG(undefined, 34);
  document.getElementById('year').textContent = new Date().getFullYear();
  readLinkError();
  try {
    user = await getUser(); // also finishes a sign-in from a magic link in the address
  } catch {
    user = null;
  }
  if (location.hash.includes('access_token')) history.replaceState(null, '', location.pathname);
  await render();
  if (configured()) {
    onAuthChange((u) => {
      const changed = (u && u.id) !== (user && user.id);
      user = u;
      if (changed) render();
    });
  }
}

start();
