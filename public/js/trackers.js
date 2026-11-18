// Trackers: one research question each, with keywords, schedule and its own
// reports. Create, edit, pause and delete them, and preview what the search
// would have found in the last two weeks before saving.
import { client, getProfile } from './auth.js';
import { esc, el, go, DAYS, fmtDate, hourLabel } from './util.js';
import { scorePapers } from './relevance.js';

// OpenAlex's 26 subject fields, for the optional field filter
const FIELDS = [
  'Agricultural and Biological Sciences', 'Arts and Humanities', 'Biochemistry, Genetics and Molecular Biology',
  'Business, Management and Accounting', 'Chemical Engineering', 'Chemistry', 'Computer Science', 'Decision Sciences',
  'Dentistry', 'Earth and Planetary Sciences', 'Economics, Econometrics and Finance', 'Energy', 'Engineering',
  'Environmental Science', 'Health Professions', 'Immunology and Microbiology', 'Materials Science', 'Mathematics',
  'Medicine', 'Neuroscience', 'Nursing', 'Pharmacology, Toxicology and Pharmaceutics', 'Physics and Astronomy',
  'Psychology', 'Social Sciences', 'Veterinary',
];

// ---------- Data ----------

const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};

export async function listTrackers() {
  const sb = await client();
  return must(await sb.from('trackers').select('*').order('created_at'));
}

async function getTracker(id) {
  const sb = await client();
  const row = must(await sb.from('trackers').select('*').eq('id', id).maybeSingle());
  if (!row) throw new Error("That tracker doesn't exist, or it isn't yours.");
  return row;
}

async function saveTracker(id, values) {
  const sb = await client();
  if (id) return must(await sb.from('trackers').update(values).eq('id', id).select().single());
  return must(await sb.from('trackers').insert(values).select().single());
}

async function deleteTracker(id) {
  const sb = await client();
  must(await sb.from('trackers').delete().eq('id', id));
}

// ---------- Keyword text <-> groups ----------

const groupsToText = (groups) => (groups || []).map((g) => g.join(', ')).join('\n');
const textToGroups = (text) =>
  String(text || '')
    .split('\n')
    .map((line) => line.split(/[,;]/).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean))
    .filter((g) => g.length);
const linesToList = (text, re = /[\n,;]/) =>
  String(text || '')
    .split(re)
    .map((t) => t.trim())
    .filter(Boolean);
const DOI_RE = /^10\.\d{4,9}\/\S+$/;
const cleanDoi = (d) => d.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');

function scheduleText(t) {
  const every = t.cadence === 'weekly' ? 'Every' : 'Every other';
  return `${every} ${DAYS[t.run_day]}, around ${hourLabel(t.run_hour)}`;
}

// ---------- List ----------

export async function trackersPage() {
  const trackers = await listTrackers();
  const page = el(`
    <div class="wrap">
      <div class="page-head">
        <div><p class="eyebrow">Trackers</p><h1>Your trackers</h1>
        <p class="muted">Each tracker follows one research question and is reported separately. You can have up to 10.</p></div>
        <a class="btn" href="/trackers/new" data-link ${trackers.length >= 10 ? 'aria-disabled="true" style="pointer-events:none;opacity:.45"' : ''}>New tracker</a>
      </div>
      <div class="tracker-list"></div>
    </div>`);
  const list = page.querySelector('.tracker-list');
  if (!trackers.length) {
    list.append(
      el(`<div class="empty">
        <h2>No trackers yet</h2>
        <p>Set a research question, keywords and a weekly or biweekly run day, then preview the papers it would have found in the last two weeks.</p>
        <a class="btn" href="/trackers/new" data-link>Create your first tracker</a>
      </div>`),
    );
  }
  for (const t of trackers) {
    list.append(
      el(`<a class="card section-link tracker-card" href="/trackers/${t.id}" data-link>
        <div class="tracker-card-head">
          <h3>${esc(t.name)}</h3>
          <span class="tag ${t.status === 'paused' ? 'tag-grey' : ''}">${t.status === 'paused' ? 'Paused' : 'Active'}</span>
        </div>
        <p>${esc(t.question)}</p>
        <p class="small muted" style="margin-top:8px">${esc(scheduleText(t))} · up to ${t.paper_cap} papers · ${t.report_depth === 'detailed' ? 'Detailed' : 'Short'} report</p>
      </a>`),
    );
  }
  return page;
}

// ---------- Form ----------

export async function newTrackerPage() {
  return trackerForm(null);
}

export async function editTrackerPage(_user, id) {
  return trackerForm(await getTracker(id));
}

async function trackerForm(t) {
  const profile = await getProfile().catch(() => null);
  const tz = (profile && profile.time_zone) || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const v = t || {
    name: '', question: '', specific_asks: '', keywords: [], exclude_words: [], baseline_dois: [], fields: [], venues: [],
    include_preprints: true, cadence: 'biweekly', run_day: 1, run_hour: 2, paper_cap: 25, relevance_cutoff: 40, report_depth: 'short',
  };
  const page = el(`
    <div class="wrap">
      <p class="eyebrow">${t ? 'Edit tracker' : 'New tracker'}</p>
      <h1>${t ? esc(t.name) : 'A new tracker'}</h1>
      <form class="tracker-form" novalidate>
        <div class="form-grid">
          <div class="card">
            <h2>What to follow</h2>
            <label class="field"><span>Name</span>
              <input type="text" name="name" maxlength="80" required placeholder="Cation effects on CoPc" value="${esc(v.name)}" />
              <small>A short label.</small></label>
            <label class="field"><span>Research question</span>
              <textarea name="question" rows="3" maxlength="1000" required placeholder="How do electrolyte cations change methanol selectivity on CoPc?">${esc(v.question)}</textarea>
              <small>In plain words. Relevance is judged against this.</small></label>
            <label class="field"><span>Specific asks <em>(optional)</em></span>
              <textarea name="specific_asks" rows="2" maxlength="1000" placeholder="Flag any paper reporting FE for methanol above 40%">${esc(v.specific_asks || '')}</textarea>
              <small>Things the report should watch for.</small></label>
            <label class="field"><span>Keywords</span>
              <textarea name="keywords" rows="4" required placeholder="cobalt phthalocyanine, CoPc&#10;CO2 reduction, CO2RR, CO2 electroreduction&#10;cation, electrolyte">${esc(groupsToText(v.keywords))}</textarea>
              <small>One group per line; a paper must match <strong>every line</strong>. Separate alternatives on a line with commas. A word also matches its plural.</small></label>
            <label class="field"><span>Exclude words <em>(optional)</em></span>
              <input type="text" name="exclude" placeholder="photocatalysis, photoelectrochemical" value="${esc(v.exclude_words.join(', '))}" />
              <small>A paper with any of these in its title or abstract is left out.</small></label>
            <label class="field"><span>Baseline papers <em>(optional)</em></span>
              <textarea name="baseline" rows="2" placeholder="10.1038/s41586-019-1760-8">${esc(v.baseline_dois.join('\n'))}</textarea>
              <small>DOIs of the key earlier work, one per line. New papers will be compared with these.</small></label>
          </div>
          <div class="card">
            <h2>Sources and filters</h2>
            <label class="check"><input type="checkbox" name="preprints" ${v.include_preprints ? 'checked' : ''} /> Include preprints (arXiv, ChemRxiv), always labelled "not peer reviewed"</label>
            <details class="field" ${v.fields.length ? 'open' : ''}><summary>Fields <em>(optional)</em>${v.fields.length ? ` · ${v.fields.length} chosen` : ''}</summary>
              <div class="checks">${FIELDS.map((f) => `<label class="check"><input type="checkbox" name="field" value="${esc(f)}" ${v.fields.includes(f) ? 'checked' : ''}/> ${esc(f)}</label>`).join('')}</div>
              <small>Leave all unticked to search every field.</small></details>
            <label class="field"><span>Journals <em>(optional)</em></span>
              <textarea name="venues" rows="2" placeholder="Journal of the American Chemical Society&#10;Nature Catalysis">${esc(v.venues.join('\n'))}</textarea>
              <small>One per line. If set, journal papers must come from one of these (preprints are kept).</small></label>
            <h2 style="margin-top:28px">Schedule and report</h2>
            <div class="row2">
              <label class="field"><span>Cadence</span>
                <select name="cadence"><option value="weekly">Weekly</option><option value="biweekly">Biweekly</option></select></label>
              <label class="field"><span>Run day</span>
                <select name="run_day">${DAYS.map((d, i) => `<option value="${i}">${d}</option>`).join('')}</select></label>
            </div>
            <div class="row2">
              <label class="field"><span>Run time</span>
                <select name="run_hour">${Array.from({ length: 24 }, (_, h) => `<option value="${h}">${hourLabel(h)}</option>`).join('')}</select>
                <small>${esc(tz)}</small></label>
              <label class="field"><span>Report</span>
                <select name="report_depth"><option value="short">Short (about 4 pages)</option><option value="detailed">Detailed (10-15 pages)</option></select></label>
            </div>
            <div class="row2">
              <label class="field"><span>Paper cap</span>
                <input type="number" name="paper_cap" min="5" max="50" value="${v.paper_cap}" />
                <small>Most papers read per report; the rest are listed by title.</small></label>
              <label class="field"><span>Relevance cut-off</span>
                <input type="number" name="relevance_cutoff" min="0" max="100" value="${v.relevance_cutoff}" />
                <small>Papers scoring below this (0-100) are dropped.</small></label>
            </div>
            <p class="notice small">The AI that writes the reports is chosen per tracker once AI keys are added.</p>
          </div>
        </div>
        <p class="form-msg" role="status" aria-live="polite"></p>
        <div class="btn-row sticky-actions">
          <button type="button" class="btn btn-quiet" data-preview>Preview the last two weeks</button>
          <button type="submit" class="btn">${t ? 'Save changes' : 'Save tracker'}</button>
          <a class="btn btn-quiet" href="${t ? `/trackers/${t.id}` : '/trackers'}" data-link>Cancel</a>
        </div>
      </form>
      <div class="preview-slot"></div>
    </div>`);

  const form = page.querySelector('form');
  form.cadence.value = v.cadence;
  form.run_day.value = String(v.run_day);
  form.run_hour.value = String(v.run_hour);
  form.report_depth.value = v.report_depth;
  const msg = page.querySelector('.form-msg');

  const read = () => {
    const keywords = textToGroups(form.keywords.value);
    const baseline = linesToList(form.baseline.value, /[\s,;]+/).map(cleanDoi);
    return {
      name: form.name.value.trim(),
      question: form.question.value.trim(),
      specific_asks: form.specific_asks.value.trim() || null,
      keywords,
      exclude_words: linesToList(form.exclude.value),
      baseline_dois: baseline,
      fields: [...form.querySelectorAll('input[name=field]:checked')].map((c) => c.value),
      venues: linesToList(form.venues.value, /\n/),
      include_preprints: form.preprints.checked,
      cadence: form.cadence.value,
      run_day: Number(form.run_day.value),
      run_hour: Number(form.run_hour.value),
      report_depth: form.report_depth.value,
      paper_cap: Math.min(50, Math.max(5, parseInt(form.paper_cap.value, 10) || 25)),
      relevance_cutoff: Math.min(100, Math.max(0, parseInt(form.relevance_cutoff.value, 10) || 0)),
    };
  };

  const problems = (x, forSave) => {
    const out = [];
    if (forSave && !x.name) out.push('Give the tracker a name.');
    if (!x.question) out.push('Write the research question.');
    if (!x.keywords.length) out.push('Add at least one keyword.');
    if (x.keywords.length > 8) out.push('Use at most 8 keyword lines.');
    const bad = x.baseline_dois.filter((d) => !DOI_RE.test(d));
    if (forSave && bad.length) out.push(`These don't look like DOIs: ${bad.join(', ')}`);
    return out;
  };

  const showProblems = (list) => {
    msg.className = 'form-msg bad';
    msg.textContent = list.join(' ');
  };

  page.querySelector('[data-preview]').addEventListener('click', () => {
    const x = read();
    const p = problems(x, false);
    if (p.length) return showProblems(p);
    msg.textContent = '';
    const slot = page.querySelector('.preview-slot');
    slot.replaceChildren(previewPanel(x));
    slot.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const x = read();
    const p = problems(x, true);
    if (p.length) return showProblems(p);
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    msg.className = 'form-msg';
    msg.textContent = 'Saving…';
    try {
      const saved = await saveTracker(t && t.id, x);
      go(`/trackers/${saved.id}`);
    } catch (err) {
      showProblems([err.message || 'Could not save.']);
      btn.disabled = false;
    }
  });
  return page;
}

// ---------- One tracker ----------

export async function trackerPage(_user, id) {
  const t = await getTracker(id);
  const page = el(`
    <div class="wrap">
      <p class="eyebrow"><a href="/trackers" data-link>Trackers</a></p>
      <div class="page-head">
        <div><h1>${esc(t.name)}</h1>
        <p class="muted">${esc(scheduleText(t))} · <span class="tag ${t.status === 'paused' ? 'tag-grey' : ''}">${t.status === 'paused' ? 'Paused' : 'Active'}</span></p></div>
        <div class="btn-row">
          <a class="btn btn-quiet" href="/trackers/${t.id}/edit" data-link>Edit</a>
          <button class="btn btn-quiet" data-pause>${t.status === 'paused' ? 'Resume' : 'Pause'}</button>
          <button class="btn btn-quiet btn-danger" data-delete>Delete</button>
        </div>
      </div>
      <div class="card">
        <dl class="kv">
          <dt>Question</dt><dd>${esc(t.question)}</dd>
          ${t.specific_asks ? `<dt>Specific asks</dt><dd>${esc(t.specific_asks)}</dd>` : ''}
          <dt>Keywords</dt><dd>${t.keywords.map((g) => `<div>${g.map((k) => `<span class="kw">${esc(k)}</span>`).join(' <span class="muted small">or</span> ')}</div>`).join('<div class="muted small">and</div>')}</dd>
          ${t.exclude_words.length ? `<dt>Exclude</dt><dd>${t.exclude_words.map((k) => `<span class="kw kw-x">${esc(k)}</span>`).join(' ')}</dd>` : ''}
          ${t.baseline_dois.length ? `<dt>Baseline papers</dt><dd>${t.baseline_dois.map((d) => `<div><a href="https://doi.org/${esc(d)}" target="_blank" rel="noopener">${esc(d)}</a></div>`).join('')}</dd>` : ''}
          <dt>Sources</dt><dd>OpenAlex, Crossref${t.include_preprints ? ', arXiv and ChemRxiv (preprints labelled "not peer reviewed")' : ' (no preprints)'}</dd>
          ${t.fields.length ? `<dt>Fields</dt><dd>${esc(t.fields.join(', '))}</dd>` : ''}
          ${t.venues.length ? `<dt>Journals</dt><dd>${esc(t.venues.join('; '))}</dd>` : ''}
          <dt>Report</dt><dd>${t.report_depth === 'detailed' ? 'Detailed (10-15 pages)' : 'Short (about 4 pages)'}; up to ${t.paper_cap} papers read, relevance cut-off ${t.relevance_cutoff}</dd>
        </dl>
      </div>
      <div class="empty" style="margin-top:16px">
        <h2>No reports yet</h2>
        <p>Scheduled reports start once AI keys and the report writer are added. Until then, preview what this tracker would find.</p>
        <button class="btn" data-preview>Preview the last two weeks</button>
      </div>
      <div class="preview-slot"></div>
    </div>`);

  page.querySelector('[data-preview]').addEventListener('click', () => {
    const slot = page.querySelector('.preview-slot');
    slot.replaceChildren(previewPanel(t));
    slot.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  page.querySelector('[data-pause]').addEventListener('click', async (e) => {
    e.target.disabled = true;
    await saveTracker(t.id, { status: t.status === 'paused' ? 'active' : 'paused' });
    go(`/trackers/${t.id}`);
  });
  page.querySelector('[data-delete]').addEventListener('click', async (e) => {
    if (!confirm(`Delete "${t.name}"? Its settings are removed. (Past reports will be kept once reports exist.)`)) return;
    e.target.disabled = true;
    await deleteTracker(t.id);
    go('/trackers');
  });
  return page;
}

// ---------- Preview ----------

async function search(t, days = 14) {
  const sb = await client();
  const { data } = await sb.auth.getSession();
  const token = data.session && data.session.access_token;
  const res = await fetch('/api/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({
      keywords: t.keywords,
      exclude: t.exclude_words,
      preprints: t.include_preprints,
      fields: t.fields,
      venues: t.venues,
      days,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Search failed (${res.status})`);
  return body;
}

const authorLine = (a) => (a.length > 3 ? `${a.slice(0, 3).join(', ')} et al.` : a.join(', '));

function readLabel(p) {
  if (p.type === 'preprint') return '<span class="tag tag-pre">Preprint · not peer reviewed</span>';
  if (p.oa && p.oa !== 'closed') return '<span class="tag tag-oa">Open access · full text</span>';
  return '<span class="tag tag-grey">Abstract only</span>';
}

function paperRow(p, n) {
  const row = el(`
    <li class="paper">
      <div class="paper-score" title="Relevance ${p.relevance}/100${p.meaning != null ? ` (meaning ${Math.round(p.meaning * 100)}, keywords ${Math.round(p.keywordScore * 100)})` : ''}">${p.relevance}</div>
      <div class="paper-body">
        <a class="paper-title" href="${esc(p.url)}" target="_blank" rel="noopener">${n ? `<span class="muted">${n}.</span> ` : ''}${esc(p.title)}</a>
        <p class="paper-meta">${esc(authorLine(p.authors))}${p.authors.length ? ' · ' : ''}<em>${esc(p.venue || 'Unknown venue')}</em> · ${esc(fmtDate(p.date))}</p>
        <p class="paper-tags">${readLabel(p)} <span class="small muted">via ${esc(p.sources.join(', '))}</span></p>
        ${p.abstract ? `<details><summary>Abstract</summary><p>${esc(p.abstract)}</p></details>` : '<p class="small muted">No abstract in the indexes.</p>'}
      </div>
    </li>`);
  return row;
}

function previewPanel(t) {
  const panel = el(`
    <section class="preview card">
      <div class="page-head" style="margin-bottom:12px">
        <div><p class="eyebrow">Preview</p><h2>What this tracker would have found</h2>
        <p class="muted small preview-status">Searching OpenAlex, Crossref${t.include_preprints ? ' and arXiv' : ''}…</p></div>
        <label class="field cutoff" hidden><span>Cut-off: <strong class="cutoff-val">${t.relevance_cutoff}</strong></span>
          <input type="range" min="0" max="100" value="${t.relevance_cutoff}" /></label>
      </div>
      <div class="preview-body"><p class="loading">Searching…</p></div>
    </section>`);
  const status = panel.querySelector('.preview-status');
  const body = panel.querySelector('.preview-body');
  const cutWrap = panel.querySelector('.cutoff');
  const cutInput = cutWrap.querySelector('input');
  const cutVal = cutWrap.querySelector('.cutoff-val');

  let result = null;
  let method = 'meaning+keywords';

  const render = () => {
    const cutoff = Number(cutInput.value);
    cutVal.textContent = cutoff;
    const above = result.papers.filter((p) => p.relevance >= cutoff);
    const below = result.papers.filter((p) => p.relevance < cutoff);
    const read = above.slice(0, t.paper_cap);
    const listed = above.slice(t.paper_cap);
    const c = result.counts;
    const found = Object.entries(c.found).map(([k, n]) => `${k} ${n}`).join(', ');
    body.innerHTML = `
      <div class="preview-stats">
        <div><span class="stat">${read.length}</span><span class="small muted">would be read</span></div>
        <div><span class="stat">${listed.length}</span><span class="small muted">listed by title only</span></div>
        <div><span class="stat">${below.length}</span><span class="small muted">below the cut-off</span></div>
      </div>
      <p class="small muted">${esc(fmtDate(result.window.from))} to ${esc(fmtDate(result.window.to))}. Found ${esc(found)}; ${c.merged} after merging duplicates, ${c.kept} matched every keyword line${c.excludedByFilter ? `, ${c.excludedByFilter} left out by field or journal filters` : ''}.
      Relevance is ${method === 'keywords' ? '<strong>keyword match only</strong> (the meaning model could not load)' : 'meaning match with the question (65%) plus keyword match (35%)'}.</p>
      ${result.errors.length ? `<p class="notice small">Some sources didn't answer: ${esc(result.errors.join('; '))}</p>` : ''}`;
    if (!result.papers.length) {
      body.append(el(`<div class="empty"><h3>Nothing found in the last two weeks</h3><p>Try fewer keyword lines, more alternatives on each line, or fewer exclude words.</p></div>`));
      return;
    }
    const section = (title, items, start, open = true) => {
      if (!items.length) return;
      const wrap = el(`<details class="paper-group" ${open ? 'open' : ''}><summary><h3>${title} <span class="muted">(${items.length})</span></h3></summary><ol class="papers"></ol></details>`);
      const ol = wrap.querySelector('ol');
      items.forEach((p, i) => ol.append(paperRow(p, start + i)));
      body.append(wrap);
    };
    section('Would be read', read, 1);
    section('Listed by title only (past the cap)', listed, read.length + 1);
    section('Below the cut-off', below, 0, false);
  };

  cutInput.addEventListener('input', () => result && render());

  (async () => {
    try {
      result = await search(t);
      status.textContent = `Found ${result.counts.kept} matching papers. Scoring relevance…`;
      body.innerHTML = '<p class="loading">Scoring relevance…</p>';
      const r = await scorePapers(t.question, t.specific_asks, result.papers, (s) => {
        body.innerHTML = `<p class="loading">${esc(s)}</p>`;
      });
      method = r.method;
      status.textContent = 'Drag the cut-off to see where it falls; tighten the keywords if the list is off.';
      cutWrap.hidden = false;
      render();
    } catch (err) {
      status.textContent = '';
      body.innerHTML = `<p class="form-msg bad">${esc(err.message || 'Search failed.')}</p>`;
    }
  })();
  return panel;
}
