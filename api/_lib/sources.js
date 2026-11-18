// Free scholarly sources for new papers: OpenAlex (main index), Crossref (new
// DOIs, journals and ChemRxiv preprints) and arXiv. Each returns papers in one shape:
// { doi, arxiv, title, abstract, authors[], venue, date, type, url, oa, field, cited, sources[] }

const { openalexQuery, arxivQuery, crossrefQuery } = require('./query');

const UA = 'Digestlit/0.2 (https://digestlit.vercel.app)';
const TIMEOUT = 12000;

async function getJSON(url, headers = {}) {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json', ...headers }, signal: AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return res.json();
}

const normDoi = (d) =>
  d ? String(d).trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '').replace(/^doi:\s*/, '') || null : null;

const stripTags = (s) =>
  String(s || '')
    .replace(/<jats:title>[^<]*<\/jats:title>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/** OpenAlex stores abstracts as {word: [positions]}; rebuild the text. */
function invertedToText(inv) {
  if (!inv) return '';
  const words = [];
  for (const [w, positions] of Object.entries(inv)) for (const p of positions) words[p] = w;
  return words.filter(Boolean).join(' ');
}

const ymd = (d) => d.toISOString().slice(0, 10);

// ---------- OpenAlex ----------

async function openalex({ groups, exclude, from, to, preprints }) {
  const filters = [
    `from_publication_date:${ymd(from)}`,
    `to_publication_date:${ymd(to)}`,
    `title_and_abstract.search:${openalexQuery(groups, exclude)}`,
  ];
  if (!preprints) filters.push('type:!preprint');
  const select = 'id,doi,display_name,publication_date,type,primary_location,authorships,abstract_inverted_index,open_access,primary_topic,cited_by_count,ids';
  const key = (process.env.OPENALEX_API_KEY || '').trim();
  const out = [];
  let cursor = '*';
  for (let page = 0; page < 3 && cursor; page++) {
    const params = new URLSearchParams({ filter: filters.join(','), select, per_page: '100', cursor });
    if (key) params.set('api_key', key);
    const data = await getJSON(`https://api.openalex.org/works?${params}`);
    for (const w of data.results || []) {
      const loc = w.primary_location || {};
      const src = loc.source || {};
      const arxivId = (w.ids && w.ids.arxiv) || (String(w.doi || '').match(/10\.48550\/arxiv\.(.+)$/i) || [])[1];
      out.push({
        doi: normDoi(w.doi),
        arxiv: arxivId ? String(arxivId).replace(/^.*arxiv\.org\/abs\//i, '').replace(/v\d+$/, '') : null,
        title: stripTags(w.display_name),
        abstract: invertedToText(w.abstract_inverted_index),
        authors: (w.authorships || []).map((a) => a.author && a.author.display_name).filter(Boolean),
        venue: src.display_name || null,
        date: w.publication_date || null,
        type: w.type === 'preprint' || src.type === 'repository' ? 'preprint' : 'journal',
        url: w.doi || loc.landing_page_url || w.id,
        oa: w.open_access ? (w.open_access.is_oa ? w.open_access.oa_status : 'closed') : null,
        oaUrl: w.open_access && w.open_access.oa_url ? w.open_access.oa_url : null,
        field: w.primary_topic && w.primary_topic.field ? w.primary_topic.field.display_name : null,
        cited: w.cited_by_count || 0,
        sources: ['OpenAlex'],
      });
    }
    cursor = data.meta && data.meta.next_cursor;
    if (!data.results || data.results.length < 100) break;
  }
  return out;
}

// ---------- Crossref ----------

function crossrefItem(it) {
  const parts = (it.published || it['published-online'] || it['published-print'] || it.posted || it.created || {})['date-parts'];
  const p = parts && parts[0];
  const date = p ? [p[0], String(p[1] || 1).padStart(2, '0'), String(p[2] || 1).padStart(2, '0')].join('-') : null;
  const doi = normDoi(it.DOI);
  const preprint = it.type === 'posted-content';
  return {
    doi,
    arxiv: null,
    title: stripTags((it.title || [])[0]),
    abstract: stripTags(it.abstract),
    authors: (it.author || []).map((a) => [a.given, a.family].filter(Boolean).join(' ')).filter(Boolean),
    venue: (it['container-title'] || [])[0] || (preprint && /^10\.26434\//.test(doi) ? 'ChemRxiv' : (it.institution || [])[0]?.name) || null,
    date,
    type: preprint ? 'preprint' : 'journal',
    url: `https://doi.org/${doi}`,
    oa: null,
    oaUrl: null,
    field: null,
    cited: it['is-referenced-by-count'] || 0,
    sources: [preprint && /^10\.26434\//.test(doi) ? 'ChemRxiv' : 'Crossref'],
  };
}

async function crossref({ groups, from, to, preprints }) {
  const mail = (process.env.CONTACT_EMAIL || '').trim();
  const select = 'DOI,title,abstract,container-title,published,published-online,published-print,posted,created,author,type,institution,is-referenced-by-count';
  const base = { 'query.bibliographic': crossrefQuery(groups), rows: '100', select };
  if (mail) base.mailto = mail;
  const calls = [
    new URLSearchParams({ ...base, filter: `from-pub-date:${ymd(from)},until-pub-date:${ymd(to)},type:journal-article` }),
  ];
  // ChemRxiv preprints are registered with Crossref under the 10.26434 prefix
  if (preprints) calls.push(new URLSearchParams({ ...base, filter: `from-posted-date:${ymd(from)},until-posted-date:${ymd(to)},prefix:10.26434` }));
  const results = await Promise.allSettled(calls.map((p) => getJSON(`https://api.crossref.org/works?${p}`)));
  const out = [];
  for (const r of results) if (r.status === 'fulfilled') for (const it of r.value.message.items || []) out.push(crossrefItem(it));
  if (results.every((r) => r.status === 'rejected')) throw results[0].reason;
  return out;
}

// ---------- arXiv ----------

const xmlText = (s) =>
  String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? xmlText(m[1]) : '';
};

async function arxiv({ groups, exclude, from, to }) {
  const stamp = (d, end) => ymd(d).replace(/-/g, '') + (end ? '2359' : '0000');
  const q = `(${arxivQuery(groups, exclude)}) AND submittedDate:[${stamp(from)} TO ${stamp(to, true)}]`;
  const params = new URLSearchParams({ search_query: q, start: '0', max_results: '150', sortBy: 'submittedDate', sortOrder: 'descending' });
  const res = await fetch(`https://export.arxiv.org/api/query?${params}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) throw new Error(`arXiv answered ${res.status}`);
  const xml = await res.text();
  const out = [];
  for (const block of xml.split('<entry>').slice(1)) {
    const id = tag(block, 'id').replace(/^https?:\/\/arxiv\.org\/abs\//, '').replace(/v\d+$/, '');
    const doi = normDoi(tag(block, 'arxiv:doi'));
    const journal = tag(block, 'arxiv:journal_ref');
    out.push({
      doi: doi || `10.48550/arxiv.${id.toLowerCase()}`,
      arxiv: id,
      title: tag(block, 'title'),
      abstract: tag(block, 'summary'),
      authors: [...block.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map((m) => xmlText(m[1])),
      venue: journal || 'arXiv',
      date: tag(block, 'published').slice(0, 10) || null,
      type: doi ? 'journal' : 'preprint',
      url: `https://arxiv.org/abs/${id}`,
      oa: 'green',
      oaUrl: `https://arxiv.org/pdf/${id}`,
      field: null,
      cited: 0,
      sources: ['arXiv'],
    });
  }
  return out;
}

module.exports = { openalex, crossref, arxiv, normDoi, invertedToText, stripTags };
