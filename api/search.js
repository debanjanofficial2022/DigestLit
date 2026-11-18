// Vercel serverless function: find papers for a tracker in a date window.
// Signed-in people only (the Supabase sign-in token is checked), so the shared
// OpenAlex allowance can't be used by strangers.
//
// POST { keywords: [[...]], exclude: [...], preprints: bool, fields: [...], venues: [...], days: 14 }
// -> { papers: [...], counts: {...}, errors: [...], window: {from, to} }

const { normalizeGroups, normalizeList, keywordCheck } = require('./_lib/query');
const { openalex, crossref, arxiv } = require('./_lib/sources');
const { SUPABASE_URL, SUPABASE_KEY } = require('./_lib/config');

async function signedIn(req) {
  const auth = String(req.headers.authorization || '');
  if (!/^Bearer\s+\S+/.test(auth)) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, authorization: auth },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!res || !res.ok) return null;
  return res.json();
}

const normTitle = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Merge papers found by several sources: same DOI, arXiv id or title is one paper. */
function merge(lists) {
  const byKey = new Map();
  const out = [];
  for (const list of lists) {
    for (const p of list) {
      if (!p.title) continue;
      const keys = [p.doi && `doi:${p.doi}`, p.arxiv && `arxiv:${p.arxiv.toLowerCase()}`, `t:${normTitle(p.title)}`].filter(Boolean);
      const hit = keys.map((k) => byKey.get(k)).find(Boolean);
      if (hit) {
        // Keep the richest copy of each field
        if ((p.abstract || '').length > (hit.abstract || '').length) hit.abstract = p.abstract;
        if (!hit.venue || hit.venue === 'arXiv') hit.venue = p.venue || hit.venue;
        if (!hit.field) hit.field = p.field;
        if (!hit.oaUrl) hit.oaUrl = p.oaUrl;
        if (!hit.oa || hit.oa === 'closed') hit.oa = p.oa || hit.oa;
        if (!hit.arxiv) hit.arxiv = p.arxiv;
        if (hit.authors.length < p.authors.length) hit.authors = p.authors;
        hit.cited = Math.max(hit.cited, p.cited);
        for (const s of p.sources) if (!hit.sources.includes(s)) hit.sources.push(s);
        for (const k of keys) byKey.set(k, hit);
      } else {
        const copy = { ...p, sources: [...p.sources] };
        out.push(copy);
        for (const k of keys) byKey.set(k, copy);
      }
    }
  }
  return out;
}

module.exports = async function handler(req, res) {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  const send = (code, body) => {
    res.statusCode = code;
    res.end(JSON.stringify(body));
  };
  if (req.method !== 'POST') return send(405, { error: 'POST only' });

  const user = await signedIn(req);
  if (!user) return send(401, { error: 'Please sign in again.' });

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }
  if (!body || typeof body !== 'object') return send(400, { error: 'Bad request' });

  const groups = normalizeGroups(body.keywords);
  if (!groups.length) return send(400, { error: 'Add at least one keyword.' });
  const exclude = normalizeList(body.exclude);
  const plain = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const fields = normalizeList(body.fields, 26).map(plain);
  const venues = normalizeList(body.venues, 50).map((v) => v.toLowerCase());
  const preprints = body.preprints !== false;
  const days = Math.min(Math.max(parseInt(body.days, 10) || 14, 1), 31);

  const to = new Date();
  const from = new Date(to.getTime() - days * 86400000);
  const args = { groups, exclude, from, to, preprints };

  const runs = [
    ['OpenAlex', openalex(args)],
    ['Crossref', crossref(args)],
  ];
  if (preprints) runs.push(['arXiv', arxiv(args)]);
  const settled = await Promise.allSettled(runs.map((r) => r[1]));

  const errors = [];
  const counts = { found: {}, merged: 0, kept: 0, excludedByKeywords: 0, excludedByFilter: 0 };
  const lists = [];
  settled.forEach((r, i) => {
    const name = runs[i][0];
    if (r.status === 'fulfilled') {
      counts.found[name] = r.value.length;
      lists.push(r.value);
    } else {
      counts.found[name] = 0;
      errors.push(`${name}: ${r.reason && r.reason.message ? r.reason.message : 'failed'}`);
    }
  });

  const merged = merge(lists);
  counts.merged = merged.length;
  const fromDay = from.toISOString().slice(0, 10);
  const papers = [];
  for (const p of merged) {
    if (p.date && p.date < fromDay) continue; // some sources date by online-first; keep the window strict
    const kw = keywordCheck(p, groups, exclude);
    if (kw === null) {
      counts.excludedByKeywords++;
      continue;
    }
    if (fields.length && p.field && !fields.includes(plain(p.field))) {
      counts.excludedByFilter++;
      continue;
    }
    if (venues.length && p.type === 'journal' && !(p.venue && venues.some((v) => p.venue.toLowerCase().includes(v)))) {
      counts.excludedByFilter++;
      continue;
    }
    p.keywordScore = Math.round(kw * 100) / 100;
    p.abstract = (p.abstract || '').slice(0, 3000);
    papers.push(p);
  }
  counts.kept = papers.length;
  papers.sort((a, b) => b.keywordScore - a.keywordScore || (b.date || '').localeCompare(a.date || ''));

  send(200, { papers, counts, errors, window: { from: fromDay, to: to.toISOString().slice(0, 10), days } });
};
