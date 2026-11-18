// Relevance: how well each paper fits the research question, by meaning and
// not just by keywords. A small open embedding model (bge-small-en-v1.5) runs in
// the browser, so nothing is sent anywhere and it costs nothing. The same model
// will score papers in the scheduled worker.
//
// Final score (0-100) = 65% meaning match + 35% keyword match.

const TRANSFORMERS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';
const MODEL = 'Xenova/bge-small-en-v1.5';
const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: ';

// Cosine similarities from this model mostly fall between these two values;
// they are stretched to 0..1 so the score reads naturally.
const LOW = 0.55;
const HIGH = 0.85;

let extractorP = null;

function loadModel(onStatus) {
  if (!extractorP) {
    extractorP = (async () => {
      onStatus && onStatus('Loading the relevance model (about 35 MB, once)…');
      const { pipeline, env } = await import(TRANSFORMERS);
      env.allowLocalModels = false;
      return pipeline('feature-extraction', MODEL, { dtype: 'q8' });
    })();
    extractorP.catch(() => {
      extractorP = null;
    });
  }
  return extractorP;
}

const paperText = (p) => `${p.title}. ${(p.abstract || '').slice(0, 1400)}`;

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * Add .meaning (0..1 or null) and .relevance (0..100) to each paper.
 * Falls back to the keyword score alone if the model can't load.
 * Returns { method: 'meaning+keywords' | 'keywords' }.
 */
export async function scorePapers(question, asks, papers, onStatus) {
  const finish = (method) => {
    for (const p of papers) {
      const kw = p.keywordScore || 0;
      p.relevance = p.meaning == null ? Math.round(kw * 100) : Math.round(100 * (0.65 * p.meaning + 0.35 * kw));
    }
    papers.sort((a, b) => b.relevance - a.relevance || (b.date || '').localeCompare(a.date || ''));
    return { method };
  };
  if (!papers.length) return finish('meaning+keywords');
  let extractor;
  try {
    extractor = await loadModel(onStatus);
  } catch (err) {
    console.warn('Relevance model unavailable; using keywords only', err);
    for (const p of papers) p.meaning = null;
    return finish('keywords');
  }
  const query = `${QUERY_PREFIX}${question}${asks ? ` ${asks}` : ''}`;
  const [q] = (await extractor([query], { pooling: 'cls', normalize: true })).tolist();
  const batch = 8;
  for (let i = 0; i < papers.length; i += batch) {
    onStatus && onStatus(`Scoring relevance… ${Math.min(i + batch, papers.length)} of ${papers.length}`);
    const slice = papers.slice(i, i + batch);
    const vecs = (await extractor(slice.map(paperText), { pooling: 'cls', normalize: true })).tolist();
    slice.forEach((p, j) => {
      const cos = dot(q, vecs[j]);
      p.similarity = Math.round(cos * 1000) / 1000;
      p.meaning = Math.min(1, Math.max(0, (cos - LOW) / (HIGH - LOW)));
    });
  }
  return finish('meaning+keywords');
}
