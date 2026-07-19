function normalizeWhitespace(value) {
  /* node:coverage ignore next */
  return String(value ?? '').replace(/\s+/gu, ' ').trim();
}

function normalizeTitle(value) {
  return normalizeWhitespace(value).toLowerCase().replace(/[{}:.,]/gu, '');
}

function normalizeDoi(value) {
  let normalized = normalizeWhitespace(value)
    .replace(/^https?:\/\/(dx\.)?doi\.org\//iu, '')
    .replace(/[.,;:!?，。；：！？]+$/u, '');
  while (normalized.endsWith(')') && countCharacter(normalized, ')') > countCharacter(normalized, '(')) {
    normalized = normalized.slice(0, -1).replace(/[.,;:!?，。；：！？]+$/u, '');
  }
  return normalized.toLowerCase();
}

function countCharacter(value, character) {
  return [...value].filter((candidate) => candidate === character).length;
}

function normalizeAuthorName(value) {
  const raw = normalizeWhitespace(value).replace(/[{}]/gu, '');
  const commaParts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  const reordered = commaParts.length >= 2 ? `${commaParts.slice(1).join(' ')} ${commaParts[0]}` : raw;
  const parts = reordered
    .toLowerCase()
    .replace(/[.,]/gu, '')
    .split(/\s+/u)
    .filter(Boolean);
  if (parts.length <= 1) return parts.join(' ');
  return `${parts[0]} ${parts.at(-1)}`;
}

function bibAuthors(value) {
  return normalizeWhitespace(value)
    .split(/\s+and\s+|;/iu)
    .map(normalizeAuthorName)
    .filter(Boolean);
}

function evidenceAuthors(value) {
  /* node:coverage ignore next */
  if (!Array.isArray(value)) return [];
  return value.map(normalizeAuthorName).filter(Boolean);
}

function authorsOverlap(bibEntry, evidence) {
  const bibNames = bibAuthors(bibEntry.author);
  const evidenceNames = evidenceAuthors(evidence.authors);
  /* node:coverage ignore next */
  if (bibNames.length === 0 || evidenceNames.length === 0) return true;
  return bibNames.some((bibName) => evidenceNames.includes(bibName));
}

function arxivIdFromValue(value) {
  const raw = String(value ?? '');
  return /arxiv[:./](\d{4}\.\d{4,5}(?:v\d+)?)/iu.exec(raw)?.[1] ?? /^\s*(\d{4}\.\d{4,5}(?:v\d+)?)\s*$/u.exec(raw)?.[1];
}

function normalizedArxivId(value) {
  const id = arxivIdFromValue(value);
  return id ? id.replace(/v\d+$/u, '') : undefined;
}

function bibArxivId(bibEntry) {
  return normalizedArxivId(bibEntry?.arxiv) ?? normalizedArxivId(bibEntry?.doi) ?? normalizedArxivId(bibEntry?.eprint);
}

function parseBibEntries(bibliography = '') {
  const entries = new Map();
  const entryRegex = /@\w+\s*\{\s*([^,]+)\s*,([\s\S]*?)(?=\n@\w+\s*\{|$)/gu;
  for (const entryMatch of bibliography.matchAll(entryRegex)) {
    const key = entryMatch[1].trim();
    const body = entryMatch[2];
    const fields = { key };
    const fieldRegex = /(title|author|year|doi|eprint|journal|booktitle|venue)\s*=\s*(?:\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}|"([^"]*)")/giu;
    for (const fieldMatch of body.matchAll(fieldRegex)) {
      /* node:coverage ignore next */
      fields[fieldMatch[1].toLowerCase()] = normalizeWhitespace(fieldMatch[2] ?? fieldMatch[3] ?? '');
    }
    entries.set(key, fields);
  }
  return entries;
}

export function extractCitationTargets(text) {
  const targets = [];
  const seen = new Set();
  function add(target) {
    const dedupeKey = `${target.kind}:${target.key}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    targets.push(target);
  }

  const bracketRegex = /\[@([A-Za-z0-9:_./-]+)\]/gu;
  for (const match of text.matchAll(bracketRegex)) {
    add({ kind: 'key', key: match[1], quote: match[0], index: match.index });
  }

  const citeRegex = /\\cite[a-zA-Z]*\{([^}]+)\}/gu;
  for (const match of text.matchAll(citeRegex)) {
    for (const rawKey of match[1].split(',')) {
      const key = rawKey.trim();
      if (key) add({ kind: 'key', key, quote: match[0], index: match.index });
    }
  }

  const doiRegex = /(?:DOI:\s*|https?:\/\/(?:dx\.)?doi\.org\/)(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/giu;
  for (const match of text.matchAll(doiRegex)) {
    add({ kind: 'doi', key: normalizeDoi(match[1]), quote: match[0], index: match.index });
  }

  const arxivRegex = /(?:arXiv:\s*|https?:\/\/arxiv\.org\/abs\/)(\d{4}\.\d{4,5}(?:v\d+)?)/giu;
  for (const match of text.matchAll(arxivRegex)) {
    add({ kind: 'arxiv', key: match[1], quote: match[0], index: match.index });
  }

  return targets.sort((a, b) => a.index - b.index);
}

function recordIdCandidates(record) {
  const candidates = [];
  if (record.id) candidates.push(String(record.id));
  if (record.key) candidates.push(String(record.key));
  if (record.doi) candidates.push(normalizeDoi(record.doi));
  if (record.arxiv) candidates.push(String(record.arxiv));
  return candidates;
}

function evidenceForTarget(target, bibEntry, evidenceRecords) {
  const targetKey = target.kind === 'doi' ? normalizeDoi(target.key) : String(target.key);
  return evidenceRecords.find((record) => {
    const candidates = recordIdCandidates(record);
    if (candidates.some((candidate) => candidate === targetKey)) return true;
    if (target.kind === 'key' && bibEntry?.doi && record.doi) {
      return normalizeDoi(bibEntry.doi) === normalizeDoi(record.doi);
    }
    if (target.kind === 'key' && record.arxiv) {
      const bibArxiv = bibArxivId(bibEntry);
      const recordArxiv = normalizedArxivId(record.arxiv);
      return Boolean(bibArxiv && recordArxiv && bibArxiv === recordArxiv);
    }
    return false;
  }) ?? null;
}

function bibEntryForTarget(target, bibEntries) {
  if (target.kind === 'key') return bibEntries.get(target.key) ?? null;
  if (target.kind === 'doi') {
    for (const entry of bibEntries.values()) {
      if (entry.doi && normalizeDoi(entry.doi) === normalizeDoi(target.key)) return entry;
    }
  }
  return null;
}

function compareBibToEvidence(bibEntry, evidence) {
  const mismatches = [];
  /* node:coverage ignore next */
  if (!bibEntry || !evidence) return mismatches;
  if (bibEntry.title && evidence.title && normalizeTitle(bibEntry.title) !== normalizeTitle(evidence.title)) {
    mismatches.push('title');
  }
  if (bibEntry.year && evidence.year && String(bibEntry.year) !== String(evidence.year)) {
    mismatches.push('year');
  }
  if (bibEntry.doi && evidence.doi && normalizeDoi(bibEntry.doi) !== normalizeDoi(evidence.doi)) {
    mismatches.push('doi');
  }
  if (bibEntry.author && evidence.authors && !authorsOverlap(bibEntry, evidence)) {
    mismatches.push('author');
  }
  if (evidence.arxiv && bibArxivId(bibEntry) && bibArxivId(bibEntry) !== normalizedArxivId(evidence.arxiv)) {
    mismatches.push('arxiv');
  }
  return mismatches;
}

function locationFor(text, index, language = 'en') {
  const paragraph = text.slice(0, Math.max(0, index)).split(/\n\s*\n/u).length;
  return language === 'zh' ? `第 ${paragraph} 段` : `paragraph ${paragraph}`;
}

function issueFromCitation(citation, text, language) {
  const severity = citation.status === 'MISMATCH' ? 'CRITICAL' : 'WARNING';
  const problem = citation.status === 'MISMATCH'
    ? `Citation metadata mismatches evidence: ${citation.mismatches.join(', ')}.`
    : 'No evidence source verified this citation.';
  return {
    id: `citation-${citation.kind}-${citation.key}`,
    category: 'citation',
    dimension: 'citation',
    severity,
    location: locationFor(text, citation.index, language),
    quote: citation.quote,
    problem: language === 'zh'
      /* node:coverage ignore next */
      ? (citation.status === 'MISMATCH' ? `引用元数据与证据不一致：${citation.mismatches.join(', ')}。` : '没有证据来源核实该引用。')
      : problem,
    suggestion: language === 'zh'
      ? '用 DOI、arXiv、Crossref 或本地文献库核对标题、作者、年份和 DOI。'
      : 'Verify title, authors, year, and DOI against DOI, arXiv, Crossref, or a local literature record.',
    citation,
  };
}

export function verifyCitations({ text = '', bibliography = '', evidenceRecords = [], language = 'en' } = {}) {
  const bibEntries = parseBibEntries(bibliography);
  const citations = extractCitationTargets(text).map((target) => {
    const bibEntry = bibEntryForTarget(target, bibEntries);
    const evidence = evidenceForTarget(target, bibEntry, evidenceRecords);
    if (!evidence) {
      return {
        ...target,
        status: 'UNVERIFIED',
        problem: 'No evidence source verified this citation.',
      };
    }
    /* node:coverage ignore next */
    const mismatches = compareBibToEvidence(bibEntry, evidence);
    if (mismatches.length > 0) {
      return {
        ...target,
        status: 'MISMATCH',
        evidence,
        observed: bibEntry,
        mismatches,
        problem: `Citation metadata mismatches evidence: ${mismatches.join(', ')}.`,
      };
    }
    return {
      ...target,
      status: 'VERIFIED',
      evidence,
      observed: bibEntry,
      mismatches: [],
    };
  });

  return {
    citations,
    issues: citations
      .filter((citation) => citation.status !== 'VERIFIED')
      .map((citation) => issueFromCitation(citation, text, language)),
  };
}

export function parseLocalLiteratureRecords(markdown = '') {
  const records = [];
  const blocks = markdown.split(/\n(?=##\s+)/u);
  for (const block of blocks) {
    const titleMatch = /^##\s+(.+)$/mu.exec(block);
    if (!titleMatch) continue;
    const authorsMatch = /\*\*Authors?:\*\*\s*([^\n]+)/iu.exec(block);
    const yearMatch = /\*\*Year:\*\*\s*(\d{4})|\bYear:\s*(\d{4})/iu.exec(block);
    const doiMatch = /\bdoi\s*[:：]\s*(10\.\d{4,9}\/\S+)/iu.exec(block);
    records.push({
      id: normalizeTitle(titleMatch[1]),
      title: normalizeWhitespace(titleMatch[1]),
      authors: authorsMatch ? authorsMatch[1].split(/,| and /u).map(normalizeWhitespace).filter(Boolean) : [],
      year: yearMatch ? Number(yearMatch[1] ?? yearMatch[2]) : undefined,
      doi: doiMatch ? normalizeDoi(doiMatch[1]) : undefined,
      provider: 'local-literature',
    });
  }
  return records;
}

function wantedProviders(providers) {
  if (!Array.isArray(providers) || providers.length === 0) return new Set(['doi', 'arxiv', 'crossref']);
  return new Set(providers);
}

async function fetchJson(fetchImpl, url, headers = {}) {
  const response = await fetchImpl(url, { headers });
  if (!response.ok) return null;
  return response.json();
}

async function fetchText(fetchImpl, url) {
  const response = await fetchImpl(url);
  if (!response.ok) return null;
  return response.text();
}

async function lookupDoi(target, fetchImpl) {
  const doi = normalizeDoi(target.key);
  const data = await fetchJson(
    fetchImpl,
    `https://api.crossref.org/works/${encodeURIComponent(doi)}`,
    { Accept: 'application/json' },
  );
  const message = data?.message;
  /* node:coverage ignore next */
  if (!message) return null;
  return {
    id: doi,
    doi,
    title: Array.isArray(message.title) ? message.title[0] : message.title,
    authors: Array.isArray(message.author)
      /* node:coverage ignore next */
      ? message.author.map((author) => normalizeWhitespace(`${author.given ?? ''} ${author.family ?? ''}`)).filter(Boolean)
      : [],
    year: message.published?.['date-parts']?.[0]?.[0] ?? message.issued?.['date-parts']?.[0]?.[0],
    provider: 'crossref',
  };
}

async function lookupArxiv(target, fetchImpl) {
  const id = String(target.key).replace(/v\d+$/u, '');
  const xml = await fetchText(fetchImpl, `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`);
  /* node:coverage ignore next */
  if (!xml) return null;
  const entry = /<entry>([\s\S]*?)<\/entry>/u.exec(xml)?.[1];
  /* node:coverage ignore next */
  if (!entry) return null;
  /* node:coverage ignore next */
  const title = /<title>([\s\S]*?)<\/title>/u.exec(entry)?.[1];
  const year = /<published>(\d{4})/u.exec(entry)?.[1];
  const authors = [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>\s*<\/author>/gu)]
    .map((match) => normalizeWhitespace(match[1]));
  return {
    id: target.key,
    arxiv: target.key,
    title: title ? normalizeWhitespace(title) : undefined,
    authors,
    year: year ? Number(year) : undefined,
    provider: 'arxiv',
  };
}

function externalLookupTargets(text, bibliography) {
  const bibEntries = parseBibEntries(bibliography);
  const targets = extractCitationTargets(text).flatMap((target) => {
    if (target.kind !== 'key') return [target];
    const entry = bibEntries.get(target.key);
    if (!entry) return [target];
    const targets = [];
    /* node:coverage ignore next */
    if (entry.doi) {
      targets.push({ kind: 'doi', key: normalizeDoi(entry.doi), quote: target.quote, index: target.index });
    }
    /* node:coverage ignore next */
    const arxivId = arxivIdFromValue(entry.doi) ?? arxivIdFromValue(entry.eprint);
    /* node:coverage ignore next */
    if (arxivId) {
      targets.push({ kind: 'arxiv', key: arxivId, quote: target.quote, index: target.index });
    }
    /* node:coverage ignore next */
    return targets.length > 0 ? targets : [target];
  });

  const seen = new Set();
  return targets.filter((target) => {
    const key = `${target.kind}:${target.key}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function fetchExternalCitationEvidence({ text = '', bibliography = '', allowNetwork = false, citationProviders, fetchImpl = globalThis.fetch } = {}) {
  if (!allowNetwork || typeof fetchImpl !== 'function') return [];
  const providers = wantedProviders(citationProviders);
  const records = [];
  for (const target of externalLookupTargets(text, bibliography)) {
    try {
      if (target.kind === 'doi' && (providers.has('doi') || providers.has('crossref'))) {
        const record = await lookupDoi(target, fetchImpl);
        if (record) records.push(record);
      }
      if (target.kind === 'arxiv' && (providers.has('arxiv') || providers.has('doi'))) {
        const record = await lookupArxiv(target, fetchImpl);
        if (record) records.push(record);
      }
    } catch {
      // Network lookup failures must not fabricate certainty. The caller will keep citations UNVERIFIED.
    }
  }
  return records;
}
