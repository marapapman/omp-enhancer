import { normalizeDoi, normalizeWhitespace } from './fact-check.js';

const DEFAULT_PROVIDERS = ['crossref', 'arxiv', 'openalex', 'datacite', 'google-fact-check'];

export async function fetchProviderEvidence({
  claims = [],
  providers = DEFAULT_PROVIDERS,
  lane = 'A',
  allowNetwork = false,
  fetchImpl = globalThis.fetch,
  googleApiKey = process.env.GOOGLE_FACT_CHECK_API_KEY,
} = {}) {
  if (!allowNetwork || typeof fetchImpl !== 'function') return [];
  const wanted = new Set(Array.isArray(providers) && providers.length ? providers : DEFAULT_PROVIDERS);
  const records = [];
  for (const claim of claims) {
    for (const provider of wanted) {
      try {
        const record = await lookupProvider({ provider, claim, lane, fetchImpl, googleApiKey });
        if (record) records.push(record);
      } catch {
        // Provider failures degrade to insufficient evidence; callers should not
        // loop or block only because one external source is unavailable.
      }
    }
  }
  return records;
}

async function lookupProvider({ provider, claim, lane, fetchImpl, googleApiKey }) {
  if (provider === 'crossref') return lookupCrossref({ claim, lane, fetchImpl });
  if (provider === 'arxiv') return lookupArxiv({ claim, lane, fetchImpl });
  if (provider === 'openalex') return lookupOpenAlex({ claim, lane, fetchImpl });
  if (provider === 'datacite') return lookupDataCite({ claim, lane, fetchImpl });
  if (provider === 'google-fact-check') return lookupGoogleFactCheck({ claim, lane, fetchImpl, googleApiKey });
  return null;
}

async function lookupCrossref({ claim, lane, fetchImpl }) {
  const doi = doiFromText(claim.text);
  if (!doi) return null;
  const data = await fetchJson(fetchImpl, `https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
    Accept: 'application/json',
  });
  const message = data?.message;
  if (!message) return null;
  return {
    claimId: claim.id,
    lane,
    provider: 'crossref',
    status: 'SUPPORTED',
    source: `https://doi.org/${doi}`,
    quote: first(message.title),
    observed: {
      title: first(message.title),
      year: message.published?.['date-parts']?.[0]?.[0] ?? message.issued?.['date-parts']?.[0]?.[0],
      doi,
    },
  };
}

async function lookupArxiv({ claim, lane, fetchImpl }) {
  const id = arxivFromText(claim.text);
  if (!id) return null;
  const response = await fetchImpl(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id.replace(/v\d+$/u, ''))}`);
  if (!response.ok) return null;
  const xml = await response.text();
  const entry = /<entry>([\s\S]*?)<\/entry>/u.exec(xml)?.[1];
  if (!entry) return null;
  const title = normalizeWhitespace(/<title>([\s\S]*?)<\/title>/u.exec(entry)?.[1] ?? '');
  return {
    claimId: claim.id,
    lane,
    provider: 'arxiv',
    status: 'SUPPORTED',
    source: `https://arxiv.org/abs/${id}`,
    quote: title,
    observed: { title, arxiv: id },
  };
}

async function lookupOpenAlex({ claim, lane, fetchImpl }) {
  const data = await fetchJson(fetchImpl, `https://api.openalex.org/works?search=${encodeURIComponent(claim.text)}&per-page=1`);
  const work = data?.results?.[0];
  if (!work) return null;
  return {
    claimId: claim.id,
    lane,
    provider: 'openalex',
    status: 'SUPPORTED',
    source: work.id ?? work.doi ?? '',
    quote: work.display_name ?? '',
    observed: {
      title: work.display_name,
      year: work.publication_year,
      doi: work.doi ? normalizeDoi(work.doi) : undefined,
    },
  };
}

async function lookupDataCite({ claim, lane, fetchImpl }) {
  const doi = doiFromText(claim.text);
  if (!doi) return null;
  const data = await fetchJson(fetchImpl, `https://api.datacite.org/dois/${encodeURIComponent(doi)}`);
  const attributes = data?.data?.attributes;
  if (!attributes) return null;
  return {
    claimId: claim.id,
    lane,
    provider: 'datacite',
    status: 'SUPPORTED',
    source: `https://doi.org/${doi}`,
    quote: first(attributes.titles?.map((item) => item.title)),
    observed: {
      title: first(attributes.titles?.map((item) => item.title)),
      year: attributes.publicationYear,
      doi,
    },
  };
}

async function lookupGoogleFactCheck({ claim, lane, fetchImpl, googleApiKey }) {
  if (!googleApiKey) return null;
  const url = new URL('https://factchecktools.googleapis.com/v1alpha1/claims:search');
  url.searchParams.set('query', claim.text);
  url.searchParams.set('key', googleApiKey);
  const data = await fetchJson(fetchImpl, url.toString());
  const item = data?.claims?.[0];
  const review = item?.claimReview?.[0];
  if (!item || !review) return null;
  return {
    claimId: claim.id,
    lane,
    provider: 'google-fact-check',
    status: 'SUPPORTED',
    source: review.url ?? '',
    quote: normalizeWhitespace([item.text, review.textualRating].filter(Boolean).join(' | ')),
    observed: {
      title: review.title,
      rating: review.textualRating,
      publisher: review.publisher?.name,
    },
  };
}

async function fetchJson(fetchImpl, url, headers = {}) {
  const response = await fetchImpl(url, { headers });
  if (!response.ok) return null;
  return response.json();
}

function doiFromText(text = '') {
  const match = String(text).match(/(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/iu);
  return match ? normalizeDoi(match[1]) : '';
}

function arxivFromText(text = '') {
  return /(?:arxiv:\s*|arxiv\.org\/abs\/)(\d{4}\.\d{4,5}(?:v\d+)?)/iu.exec(String(text))?.[1] ?? '';
}

function first(value) {
  if (Array.isArray(value)) return value.find(Boolean) ?? '';
  return value ?? '';
}
