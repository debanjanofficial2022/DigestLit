// Keyword logic shared by every source: groups of alternatives that must all
// match, exclude words, the local check on title and abstract, and a simple
// keyword-based relevance score. The site adds a meaning-based score on top.

const clean = (s) => String(s || '').replace(/[\u0000-\u001f"(),:\[\]{}\\^~*?]/g, ' ').replace(/\s+/g, ' ').trim();

/** Tidy keyword groups: [["cobalt phthalocyanine","CoPc"],["CO2 reduction"]] */
function normalizeGroups(groups) {
  if (!Array.isArray(groups)) return [];
  return groups
    .map((g) => (Array.isArray(g) ? g : [g]).map(clean).filter((t) => t.length >= 2).slice(0, 12))
    .filter((g) => g.length)
    .slice(0, 8);
}

function normalizeList(list, max = 30) {
  return (Array.isArray(list) ? list : []).map(clean).filter((t) => t.length >= 2).slice(0, max);
}

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A term matches at the start of a word, so "cation" also finds "cations". Spaces and hyphens are interchangeable. */
function termRegex(term) {
  const body = term
    .toLowerCase()
    .split(/[\s-]+/)
    .map(escRe)
    .join('[\\s\\-]+');
  return new RegExp(`(^|[^a-z0-9])${body}`, 'gi');
}

function countHits(re, text) {
  re.lastIndex = 0;
  const m = text.match(re);
  return m ? m.length : 0;
}

/**
 * Check one paper against the keyword groups and exclude words.
 * Returns null when it fails, else a 0..1 keyword score.
 */
function keywordCheck(paper, groups, exclude) {
  const title = (paper.title || '').toLowerCase();
  const abstract = (paper.abstract || '').toLowerCase();
  const both = `${title} ${abstract}`;
  for (const ex of exclude) if (countHits(termRegex(ex), both)) return null;
  let total = 0;
  for (const group of groups) {
    let best = 0;
    for (const term of group) {
      const re = termRegex(term);
      const t = countHits(re, title);
      const a = countHits(re, abstract);
      best = Math.max(best, Math.min(1, (2 * t + a) / 3));
    }
    if (best === 0) return null;
    total += best;
  }
  return groups.length ? total / groups.length : 0;
}

// ---------- Source-specific query strings ----------

const quote = (t) => (/\s|-/.test(t) ? `"${t}"` : t);

/** OpenAlex boolean search: (a OR "b c") AND (d OR e) NOT (x OR y) */
function openalexQuery(groups, exclude) {
  let q = groups.map((g) => `(${g.map(quote).join(' OR ')})`).join(' AND ');
  if (exclude.length) q += ` NOT (${exclude.map(quote).join(' OR ')})`;
  return q;
}

/** arXiv: each term in title or abstract, groups joined with AND, excludes with ANDNOT */
function arxivQuery(groups, exclude) {
  const term = (t) => {
    const v = /\s|-/.test(t) ? `"${t.replace(/-/g, ' ')}"` : t;
    return `ti:${v} OR abs:${v}`;
  };
  let q = groups.map((g) => `(${g.map(term).join(' OR ')})`).join(' AND ');
  if (exclude.length) q += ` ANDNOT (${exclude.map(term).join(' OR ')})`;
  return q;
}

/** Crossref has no boolean search: send every term and filter locally afterwards. */
function crossrefQuery(groups) {
  return groups.flat().join(' ');
}

module.exports = { clean, normalizeGroups, normalizeList, keywordCheck, openalexQuery, arxivQuery, crossrefQuery, termRegex };
