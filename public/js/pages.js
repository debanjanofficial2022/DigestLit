// The pages of Digestlit: sign-in, dashboard and the simpler sections. Trackers live in trackers.js.
import { sendMagicLink, getProfile, signOut, configured } from './auth.js';
import { LOGOS, CURRENT_LOGO, logoSVG } from './logo.js';

import { esc, el, go } from './util.js';
import { listTrackers } from './trackers.js';

// ---------- Signed out ----------

function signInForm() {
  const form = el(`
    <form class="card signin-card" novalidate>
      <h2>Sign in or sign up</h2>
      <p class="muted small">Enter your email and we'll send a sign-in link. No password. A new address gets an account the first time.</p>
      <label class="field"><span>Email</span>
        <input type="email" name="email" autocomplete="email" required placeholder="you@university.edu" />
      </label>
      <button class="btn" type="submit">Email me a sign-in link</button>
      <p class="form-msg" role="status" aria-live="polite"></p>
    </form>`);
  const msg = form.querySelector('.form-msg');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    msg.className = 'form-msg';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      msg.textContent = 'Please enter a valid email address.';
      msg.classList.add('bad');
      return;
    }
    if (!configured()) {
      msg.textContent = 'Sign-in is not connected yet (the Supabase project is still being set up).';
      msg.classList.add('bad');
      return;
    }
    const btn = form.querySelector('button');
    btn.disabled = true;
    msg.textContent = 'Sending…';
    try {
      await sendMagicLink(email);
      msg.textContent = `Check ${email} for a link from Digestlit. Open it on this device to sign in.`;
      msg.classList.add('ok');
    } catch (err) {
      const text = `${err.code || ''} ${err.message || ''}`;
      msg.textContent = /not_authorized|not authorized/i.test(text)
        ? "Digestlit isn't open to everyone yet, so sign-in emails can only go to invited addresses for now."
        : /rate|seconds|too many/i.test(text)
          ? 'Too many sign-in emails just now. Please wait a few minutes and try again.'
          : `Couldn't send the link: ${err.message || 'unknown error'}`;
      msg.classList.add('bad');
    } finally {
      btn.disabled = false;
    }
  });
  return form;
}

export function home() {
  const page = el(`
    <div class="wrap">
      <section class="hero">
        <div>
          <p class="eyebrow">For researchers</p>
          <h1>The new papers in your field, read for you.</h1>
          <p class="lead">Give Digestlit your research questions and keywords. Every week or two it finds what was just published, reads each paper and writes a Word report on what is new, how it bears on your question, and where it agrees or disagrees with earlier work.</p>
          <ol class="steps">
            <li><strong>Sign in with your email.</strong> A magic link, no password.</li>
            <li><strong>Choose the AI.</strong> Paste an API key from any provider, or use the free low-tier AI.</li>
            <li><strong>Create a tracker.</strong> A question, keywords, and weekly or biweekly.</li>
            <li><strong>Read the reports.</strong> Star the papers you care about; build a monthly report from them.</li>
          </ol>
        </div>
        <div class="signin-slot"></div>
      </section>
    </div>`);
  page.querySelector('.signin-slot').append(signInForm());
  return page;
}

export function signin() {
  const page = el(`<div class="wrap narrow"><div class="signin-slot"></div></div>`);
  page.querySelector('.signin-slot').append(signInForm());
  return page;
}

// ---------- Signed in ----------

export async function dashboard(user) {
  const profile = await getProfile().catch(() => null);
  const trackers = await listTrackers().catch(() => []);
  const active = trackers.filter((t) => t.status === 'active').length;
  const name = (user.email || '').split('@')[0];
  return el(`
    <div class="wrap">
      <div class="page-head">
        <div>
          <p class="eyebrow">Dashboard</p>
          <h1>Welcome, ${esc(name)}</h1>
          <p class="muted">Reports run overnight in your time zone${profile && profile.time_zone ? ` (${esc(profile.time_zone)})` : ''}.</p>
        </div>
      </div>
      <div class="grid">
        <div class="card"><p class="eyebrow">Trackers</p><p class="stat">${trackers.length}</p><p class="muted small">${trackers.length ? `${active} active` : 'research topics followed'}</p></div>
        <div class="card"><p class="eyebrow">Reports</p><p class="stat">0</p><p class="muted small">weekly and biweekly reports</p></div>
        <div class="card"><p class="eyebrow">AI</p><p class="stat" style="font-size:1.3rem;margin-top:10px">Not set</p><p class="muted small">add a key or choose the free AI</p></div>
      </div>
      <hr class="rule" />
      ${
        trackers.length
          ? `<div class="page-head"><h2 style="margin:0">Your trackers</h2><a class="btn btn-quiet" href="/trackers/new" data-link>New tracker</a></div>
             <div class="grid">${trackers
               .map((t) => `<a class="card section-link" href="/trackers/${t.id}" data-link><h3>${esc(t.name)}</h3><p>${esc(t.question)}</p></a>`)
               .join('')}</div>`
          : `<div class="empty">
        <h2>No trackers yet</h2>
        <p>A tracker is one research question with its own keywords, schedule and reports.</p>
        <a class="btn" href="/trackers/new" data-link>New tracker</a>
      </div>`
      }
      <hr class="rule" />
      <div class="grid">
        <a class="card section-link" href="/reports" data-link><h3>Reports</h3><p>Every weekly and biweekly report, newest first.</p></a>
        <a class="card section-link" href="/monthly" data-link><h3>Monthly</h3><p>Turn a month of reports into one bigger one.</p></a>
        <a class="card section-link" href="/get-a-key" data-link><h3>Get a key</h3><p>Step-by-step guides for each AI provider.</p></a>
      </div>
    </div>`);
}

export function reports() {
  return el(`
    <div class="wrap">
      <div class="page-head">
        <div><p class="eyebrow">Reports</p><h1>Reports</h1>
        <p class="muted">Word reports from your trackers appear here, with a star next to each paper.</p></div>
      </div>
      <div class="empty">
        <h2>No reports yet</h2>
        <p>Reports appear after a tracker's first scheduled run.</p>
      </div>
    </div>`);
}

export function monthly() {
  return el(`
    <div class="wrap">
      <div class="page-head">
        <div><p class="eyebrow">Monthly</p><h1>Monthly report</h1>
        <p class="muted">Pick a tracker and a month, choose all papers or only the starred ones, and add PDFs for papers marked "Abstract only".</p></div>
      </div>
      <div class="empty">
        <h2>Nothing to build yet</h2>
        <p>A monthly report needs at least one month of weekly or biweekly reports.</p>
      </div>
    </div>`);
}

// ---------- Get a key ----------

const PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic', console: 'Claude Console', billing: 'Yes, prepaid credits', model: 'Haiku for weekly runs, Sonnet for monthly', note: 'Buy $5 of credit and set a spending limit before creating the key.' },
  { id: 'openai', name: 'OpenAI', console: 'OpenAI Platform', billing: 'Yes, prepaid credits', model: 'A "mini" model for weekly runs', note: 'Usage limits are set in the billing settings.' },
  { id: 'google', name: 'Google', console: 'Google AI Studio', billing: 'No for the free tier; yes to keep your data out of training', model: 'Flash', note: 'On the free tier, Google may use your data for training outside the EU/UK.' },
  { id: 'openrouter', name: 'OpenRouter', console: 'openrouter.ai', billing: 'No for free models', model: 'Any; free models end in ":free"', note: 'One key reaches models from many providers.' },
  { id: 'groq', name: 'Groq', console: 'GroqCloud console', billing: 'No', model: 'Llama 70B class', note: 'Very fast, with a daily request cap.' },
  { id: 'cerebras', name: 'Cerebras', console: 'Cerebras Cloud', billing: 'No', model: 'Llama 70B class', note: 'Has a daily token cap.' },
  { id: 'other', name: 'Other', console: "The provider's docs", billing: 'Varies', model: 'Any', note: 'Any OpenAI-compatible provider works: you need its base URL, a key and a model name.' },
];

export function getKey() {
  const page = el(`
    <div class="wrap narrow">
      <p class="eyebrow">Get a key</p>
      <h1>How to get an AI key</h1>
      <p class="lead">Digestlit works with any AI provider's key, so you pay your provider directly and never Digestlit. Or skip this and use the free low-tier AI.</p>
      <div class="card">
        <h2>The steps for every provider</h2>
        <ol class="numbered">
          <li>Go to the provider's developer console and sign up or log in.</li>
          <li>Add billing if the provider needs it, and set a monthly spending limit there, for example $5.</li>
          <li>Open the API keys page and create a new key named "Digestlit".</li>
          <li>Copy the key right away; most providers show it only once.</li>
          <li>In Digestlit, open Settings, then AI keys, then Add key; pick the provider and paste it.</li>
          <li>Digestlit tests the key and lists the models it can use. Pick one.</li>
        </ol>
      </div>
      <div class="card">
        <div class="tabs" role="tablist"></div>
        <div class="tab-panel" role="tabpanel"></div>
        <p class="notice small">Screenshots, direct links and the price of a typical report are added for each provider when AI keys go live, after each dashboard has been checked.</p>
        <div class="safety">
          <h3>Keep your key safe</h3>
          <ul>
            <li>A key is like a password: never post it or email it.</li>
            <li>Set a spending limit at the provider, so a mistake can never cost more than that.</li>
            <li>You can delete the key in Digestlit and revoke it at the provider at any time.</li>
          </ul>
        </div>
      </div>
    </div>`);
  const tabs = page.querySelector('.tabs');
  const panel = page.querySelector('.tab-panel');
  const show = (id) => {
    const p = PROVIDERS.find((x) => x.id === id);
    tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.id === id)));
    panel.innerHTML = `
      <h3>${esc(p.name)}</h3>
      <dl class="kv">
        <dt>Where</dt><dd>${esc(p.console)}</dd>
        <dt>Needs billing</dt><dd>${esc(p.billing)}</dd>
        <dt>Suggested model</dt><dd>${esc(p.model)}</dd>
        <dt>Note</dt><dd>${esc(p.note)}</dd>
      </dl>`;
  };
  for (const p of PROVIDERS) {
    const b = el(`<button type="button" role="tab" data-id="${p.id}">${esc(p.name)}</button>`);
    b.addEventListener('click', () => show(p.id));
    tabs.append(b);
  }
  show('anthropic');
  return page;
}

// ---------- Settings ----------

export async function settings(user) {
  const profile = await getProfile().catch(() => null);
  const page = el(`
    <div class="wrap narrow">
      <p class="eyebrow">Settings</p>
      <h1>Settings</h1>
      <div class="card">
        <h2>Account</h2>
        <dl class="kv">
          <dt>Email</dt><dd>${esc(user.email)}</dd>
          <dt>Time zone</dt><dd>${esc((profile && profile.time_zone) || Intl.DateTimeFormat().resolvedOptions().timeZone)}</dd>
          <dt>Joined</dt><dd>${esc(new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }))}</dd>
        </dl>
        <div class="btn-row" style="margin-top:20px"><button class="btn btn-quiet" data-signout>Sign out</button></div>
      </div>
      <div class="card">
        <h2>AI keys</h2>
        <p class="muted">No keys saved. Adding a key, testing it and choosing the free AI arrive with AI keys. Keys are encrypted before they are stored and only the last 4 characters are ever shown.</p>
        <button class="btn" disabled>Add key</button>
        <a class="btn btn-quiet" href="/get-a-key" data-link>How to get a key</a>
      </div>
    </div>`);
  page.querySelector('[data-signout]').addEventListener('click', async () => {
    await signOut();
    go('/');
  });
  return page;
}

// ---------- Logo versions ----------

export function logoPage() {
  const cards = Object.entries(LOGOS)
    .map(
      ([key, l]) => `
      <div class="card logo-card${key === CURRENT_LOGO ? ' current' : ''}">
        ${logoSVG(key, 150, `Digestlit logo, ${l.name}`)}
        <h3>${esc(l.name)} ${key === CURRENT_LOGO ? '<span class="tag">In use</span>' : ''}</h3>
        <p class="muted small">${esc(l.note)}</p>
        <div class="sizes">${logoSVG(key, 64)}${logoSVG(key, 32)}${logoSVG(key, 16)}</div>
      </div>`,
    )
    .join('');
  return el(`
    <div class="wrap">
      <p class="eyebrow">Logo</p>
      <h1>Logo versions</h1>
      <p class="lead">A serif "Dl" monogram in a thin circle, like a journal seal: deep navy on off-white, no animation. Each version is shown large and at 64, 32 and 16 pixels.</p>
      <div class="logo-grid">${cards}</div>
    </div>`);
}

export function notFound() {
  return el(`
    <div class="wrap narrow">
      <h1>Page not found</h1>
      <p class="muted">That page doesn't exist. <a href="/" data-link>Go to the start</a>.</p>
    </div>`);
}
