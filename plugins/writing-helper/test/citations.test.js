import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { fetchExternalCitationEvidence, verifyCitations } from '../src/citations.js';

describe('verifyCitations', () => {
  it('verifies a local BibTeX citation when title author year and DOI match', () => {
    const result = verifyCitations({
      text: 'CLIP is a common baseline [@radford2021clip].',
      bibliography: '@inproceedings{radford2021clip, title={Learning Transferable Visual Models From Natural Language Supervision}, author={Radford, Alec and Kim, Jong Wook}, year={2021}, doi={10.48550/arXiv.2103.00020}}',
      evidenceRecords: [
        {
          id: 'radford2021clip',
          title: 'Learning Transferable Visual Models From Natural Language Supervision',
          authors: ['Alec Radford', 'Jong Wook Kim'],
          year: 2021,
          doi: '10.48550/arXiv.2103.00020',
          provider: 'local-literature',
        },
      ],
    });

    assert.equal(result.citations[0].status, 'VERIFIED');
    assert.equal(result.citations[0].evidence.provider, 'local-literature');
  });

  it('marks a citation mismatch when local evidence contradicts the bibliography', () => {
    const result = verifyCitations({
      text: 'CLIP is a common baseline [@radford2021clip].',
      bibliography: '@inproceedings{radford2021clip, title={Learning Transferable Visual Models From Natural Language Supervision}, author={Radford, Alec}, year={2020}, doi={10.48550/arXiv.2103.00020}}',
      evidenceRecords: [
        {
          id: 'radford2021clip',
          title: 'Learning Transferable Visual Models From Natural Language Supervision',
          authors: ['Alec Radford'],
          year: 2021,
          doi: '10.48550/arXiv.2103.00020',
          provider: 'local-literature',
        },
      ],
    });

    assert.equal(result.citations[0].status, 'MISMATCH');
    assert.deepEqual(result.citations[0].mismatches, ['year']);
  });

  it('marks a citation mismatch when evidence contradicts the author list', () => {
    const result = verifyCitations({
      text: 'CLIP is a common baseline [@radford2021clip].',
      bibliography: '@inproceedings{radford2021clip, title={Learning Transferable Visual Models From Natural Language Supervision}, author={Smith, Jane}, year={2021}, doi={10.48550/arXiv.2103.00020}}',
      evidenceRecords: [
        {
          id: 'radford2021clip',
          title: 'Learning Transferable Visual Models From Natural Language Supervision',
          authors: ['Alec Radford'],
          year: 2021,
          doi: '10.48550/arXiv.2103.00020',
          provider: 'local-literature',
        },
      ],
    });

    assert.equal(result.citations[0].status, 'MISMATCH');
    assert.deepEqual(result.citations[0].mismatches, ['author']);
  });

  it('never upgrades missing evidence to verified', () => {
    const result = verifyCitations({
      text: 'A doubtful claim cites a missing source [@ghost2024].',
      bibliography: '',
      evidenceRecords: [],
    });

    assert.equal(result.citations[0].status, 'UNVERIFIED');
    assert.match(result.citations[0].problem, /No evidence/i);
  });

  it('does not treat a BibTeX entry alone as authenticity evidence for a key citation', () => {
    const result = verifyCitations({
      text: 'CLIP is a common baseline [@radford2021clip].',
      bibliography: '@inproceedings{radford2021clip, title={Learning Transferable Visual Models From Natural Language Supervision}, author={Radford, Alec}, year={2021}, doi={10.48550/arXiv.2103.00020}}',
      evidenceRecords: [],
    });

    assert.equal(result.citations[0].status, 'UNVERIFIED');
  });

  it('uses a key citation BibTeX DOI for opt-in external evidence lookup', async () => {
    const requestedUrls = [];
    const fetchImpl = async (url) => {
      requestedUrls.push(String(url));
      return {
        ok: true,
        async json() {
          return {
            message: {
              title: ['Learning Transferable Visual Models From Natural Language Supervision'],
              author: [{ given: 'Alec', family: 'Radford' }],
              issued: { 'date-parts': [[2021]] },
              DOI: '10.48550/arXiv.2103.00020',
            },
          };
        },
      };
    };

    const evidence = await fetchExternalCitationEvidence({
      text: 'CLIP is a common baseline [@radford2021clip].',
      bibliography: '@inproceedings{radford2021clip, title={Learning Transferable Visual Models From Natural Language Supervision}, author={Radford, Alec}, year={2021}, doi={10.48550/arXiv.2103.00020}}',
      allowNetwork: true,
      citationProviders: ['doi'],
      fetchImpl,
    });
    const result = verifyCitations({
      text: 'CLIP is a common baseline [@radford2021clip].',
      bibliography: '@inproceedings{radford2021clip, title={Learning Transferable Visual Models From Natural Language Supervision}, author={Radford, Alec}, year={2021}, doi={10.48550/arXiv.2103.00020}}',
      evidenceRecords: evidence,
    });

    assert.equal(requestedUrls.some((url) => /10\.48550%2FarXiv\.2103\.00020/i.test(url)), true);
    assert.equal(result.citations[0].status, 'VERIFIED');
    assert.equal(result.citations[0].evidence.provider, 'crossref');
  });

  it('falls back to arXiv lookup for BibTeX DOI values that encode arXiv ids', async () => {
    const requestedUrls = [];
    const fetchImpl = async (url) => {
      requestedUrls.push(String(url));
      if (String(url).includes('crossref')) {
        return { ok: false, async json() { return {}; } };
      }
      return {
        ok: true,
        async text() {
          return '<feed><entry><title>Learning Transferable Visual Models From Natural Language Supervision</title><published>2021-02-26T00:00:00Z</published><author><name>Alec Radford</name></author></entry></feed>';
        },
      };
    };

    const bibliography = '@inproceedings{radford2021clip, title={Learning Transferable Visual Models From Natural Language Supervision}, author={Radford, Alec}, year={2021}, doi={10.48550/arXiv.2103.00020}}';
    const evidence = await fetchExternalCitationEvidence({
      text: 'CLIP is a common baseline [@radford2021clip].',
      bibliography,
      allowNetwork: true,
      citationProviders: ['doi'],
      fetchImpl,
    });
    const result = verifyCitations({
      text: 'CLIP is a common baseline [@radford2021clip].',
      bibliography,
      evidenceRecords: evidence,
    });

    assert.equal(requestedUrls.some((url) => url.includes('api.crossref.org')), true);
    assert.equal(requestedUrls.some((url) => url.includes('export.arxiv.org')), true);
    assert.equal(result.citations[0].status, 'VERIFIED');
    assert.equal(result.citations[0].evidence.provider, 'arxiv');
  });

  it('extracts DOI and arXiv identifiers as citation targets', () => {
    const result = verifyCitations({
      text: 'See DOI: 10.1145/3366423.3380124 and arXiv:2103.00020.',
      bibliography: '',
      evidenceRecords: [],
    });

    assert.deepEqual(result.citations.map((citation) => citation.kind), ['doi', 'arxiv']);
    assert.equal(result.citations.every((citation) => citation.status === 'UNVERIFIED'), true);
  });

  it('keeps external evidence opt-in and parses arXiv metadata when enabled', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return {
        ok: true,
        async text() {
          return '<feed><entry><title>Learning Transferable Visual Models From Natural Language Supervision</title><published>2021-02-26T00:00:00Z</published><author><name>Alec Radford</name></author></entry></feed>';
        },
      };
    };

    assert.deepEqual(
      await fetchExternalCitationEvidence({
        text: 'See arXiv:2103.00020.',
        allowNetwork: false,
        fetchImpl,
      }),
      [],
    );
    assert.equal(calls, 0);

    const evidence = await fetchExternalCitationEvidence({
      text: 'See arXiv:2103.00020.',
      allowNetwork: true,
      citationProviders: ['arxiv'],
      fetchImpl,
    });
    assert.equal(evidence[0].provider, 'arxiv');
    assert.equal(evidence[0].year, 2021);
  });
  it('parses multiple LaTeX citation keys from one cite command', () => {
    const result = verifyCitations({
      text: 'Prior work includes \\cite{radford2021clip, vaswani2017attention}.',
      bibliography: '',
      evidenceRecords: [],
    });

    assert.deepEqual(result.citations.map((citation) => citation.key), [
      'radford2021clip',
      'vaswani2017attention',
    ]);
    assert.equal(result.citations.every((citation) => citation.status === 'UNVERIFIED'), true);
  });

  it('verifies direct DOI citations against matching local evidence records', () => {
    const result = verifyCitations({
      text: 'The paper is identified by DOI: 10.1145/3366423.3380124',
      bibliography: '@article{clip, title={CLIP}, author={Radford, Alec}, year={2021}, doi={10.1145/3366423.3380124}}',
      evidenceRecords: [{ doi: '10.1145/3366423.3380124', provider: 'local-literature' }],
    });

    assert.equal(result.citations[0].kind, 'doi');
    assert.equal(result.citations[0].status, 'VERIFIED');
    assert.equal(result.citations[0].evidence.doi, '10.1145/3366423.3380124');
  });

  it('keeps direct DOI citations unverified when only bibliography matches', () => {
    const result = verifyCitations({
      text: 'The paper is identified by DOI: 10.1145/3366423.3380124',
      bibliography: '@article{clip, title={CLIP}, author={Radford, Alec}, year={2021}, doi={10.1145/3366423.3380124}}',
      evidenceRecords: [],
    });

    assert.equal(result.citations[0].kind, 'doi');
    assert.equal(result.citations[0].status, 'UNVERIFIED');
  });

  it('keeps direct DOI citations unverified when local evidence has a different DOI', () => {
    const result = verifyCitations({
      text: 'The paper is identified by DOI: 10.1145/3366423.3380124',
      bibliography: '',
      evidenceRecords: [{ doi: '10.1145/0000000.0000000', provider: 'local-literature' }],
    });

    assert.equal(result.citations[0].status, 'UNVERIFIED');
  });

  it('reports title and DOI mismatches when evidence contradicts bibliography', () => {
    const result = verifyCitations({
      text: 'CLIP is a common baseline [@radford2021clip].',
      bibliography: '@inproceedings{radford2021clip, title={Learning Transferable Visual Models From Natural Language Supervision}, author={Radford, Alec}, year={2021}, doi={10.48550/arXiv.2103.00020}}',
      evidenceRecords: [
        {
          id: 'radford2021clip',
          title: 'Attention Is All You Need',
          authors: ['Alec Radford'],
          year: 2021,
          doi: '10.48550/arXiv.1706.03762',
          provider: 'local-literature',
        },
      ],
    });

    assert.equal(result.citations[0].status, 'MISMATCH');
    assert.deepEqual(result.citations[0].mismatches, ['title', 'doi']);
  });


  it('reports eprint arXiv mismatches when local evidence contradicts bibliography', () => {
    const result = verifyCitations({
      text: 'CLIP is a common baseline [@clip].',
      bibliography: '@article{clip, title={CLIP}, author={Radford, Alec}, year={2021}, eprint={2103.00020}}',
      evidenceRecords: [
        {
          id: 'clip',
          title: 'CLIP',
          authors: ['Alec Radford'],
          year: 2021,
          arxiv: '1706.03762',
          provider: 'local-literature',
        },
      ],
    });

    assert.equal(result.citations[0].status, 'MISMATCH');
    assert.deepEqual(result.citations[0].mismatches, ['arxiv']);
  });

  it('does not match unparsable arXiv evidence to a key citation without arXiv metadata', () => {
    const result = verifyCitations({
      text: 'A method is cited [@paper].',
      bibliography: '@article{paper, title={A Method}, author={Li}, year={2024}}',
      evidenceRecords: [
        {
          arxiv: 'not-an-arxiv-id',
          title: 'A Method',
          authors: ['Li'],
          year: 2024,
          provider: 'local-literature',
        },
      ],
    });

    assert.equal(result.citations[0].status, 'UNVERIFIED');
  });
});
