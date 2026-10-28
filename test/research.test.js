import test from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateIp, fetchDoc, htmlToText } from '../lib/fetchdocs.js';
import { enforceEvidence } from '../lib/generate.js';
import { normalizeGuide } from '../lib/schema.js';

test('isPrivateIp blocks internal ranges and allows public ones', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.1', '172.16.5.5', '169.254.169.254', '0.0.0.0', '::1', 'fe80::1', 'fd00::1', '::ffff:10.0.0.1']) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '140.82.112.3', '2606:4700::1111']) assert.equal(isPrivateIp(ip), false, ip);
});

test('fetchDoc refuses non-https, localhost and metadata hosts', async () => {
  for (const u of ['http://example.com', 'https://localhost/x', 'https://127.0.0.1/', 'https://169.254.169.254/latest/meta-data', 'https://user:pw@example.com/']) {
    await assert.rejects(() => fetchDoc(u), u);
  }
});

test('htmlToText strips scripts and tags', () => {
  const t = htmlToText('<html><script>evil()</script><h1>Hi</h1><p>A &amp; B</p></html>');
  assert.ok(!t.includes('evil'));
  assert.match(t, /Hi/);
  assert.match(t, /A & B/);
});

const PAGE = { url: 'https://docs.x.com/a', title: 'A', text: "You must be the account owner. Refresh tokens expire after 90 days. Use the app's redirect URL." };

test('enforceEvidence keeps a claim only if its quote is in the fetched page text', () => {
  const g = normalizeGuide({
    name: 'X',
    time: { handsOn: '~30 min', wait: '2 weeks', waitConfidence: 'confirmed' },
    requirements: [
      { text: 'real', confidence: 'confirmed', source: PAGE.url, quote: 'Refresh tokens expire after 90 days.' },
      { text: 'punctuation/case tolerant', confidence: 'confirmed', source: PAGE.url, quote: "use the APP'S redirect url" },
      { text: 'real page, invented claim', confidence: 'confirmed', source: PAGE.url, quote: 'Tokens never expire at all.' },
      { text: 'no quote', confidence: 'confirmed', source: PAGE.url },
      { text: 'quote too short', confidence: 'confirmed', source: PAGE.url, quote: 'the account' },
      { text: 'invented source', confidence: 'confirmed', source: 'https://made-up.example/z', quote: 'Refresh tokens expire after 90 days.' },
    ],
    steps: [{ title: 's', source: 'https://made-up.example/z' }],
  });
  enforceEvidence(g, [PAGE]);
  assert.deepEqual(g.requirements.map(r => r.confidence),
    ['confirmed', 'confirmed', 'unconfirmed', 'unconfirmed', 'unconfirmed', 'unconfirmed']);
  assert.equal(g.requirements[2].source, '');
  assert.equal(g.requirements[2].quote, '');
  assert.equal(g.steps[0].source, '');
  assert.deepEqual(g.sources, [{ title: 'A', url: PAGE.url }]);
  assert.match(g.meta.evidenceNote, /4 claim/);
});

test('enforceEvidence labels hands-on time as an estimate once', () => {
  const g = normalizeGuide({ name: 'X', time: { handsOn: '~30 min' } });
  enforceEvidence(g, [PAGE]);
  assert.equal(g.time.handsOn, 'Estimate: ~30 min');
  enforceEvidence(g, [PAGE]);
  assert.equal(g.time.handsOn, 'Estimate: ~30 min');
});

test('enforceEvidence downgrades console-click steps from agent to both, keeps code steps', () => {
  const g = normalizeGuide({
    name: 'X',
    steps: [
      { title: 'Test Locally', detail: 'Navigate to the Local Test page, select Add App Now and Allow.', owner: 'agent' },
      { title: 'Build token exchange', detail: 'Implement the code-for-token POST and store the refresh token.', owner: 'agent' },
      { title: 'Create app', detail: 'Click Create.', owner: 'developer' },
    ],
  });
  enforceEvidence(g, [PAGE]);
  assert.deepEqual(g.steps.map(s => s.owner), ['both', 'agent', 'developer']);
});

test('requirement appliesTo defaults to always and rejects junk', () => {
  const g = normalizeGuide({ name: 'X', requirements: [
    { text: 'a', appliesTo: 'publishing' }, { text: 'b' }, { text: 'c', appliesTo: 'whenever' },
  ] });
  assert.deepEqual(g.requirements.map(r => r.appliesTo), ['publishing', 'always', 'always']);
});

test('htmlToText decodes numeric and hex entities so quotes can match', () => {
  assert.match(htmlToText("<p>the app&#x27;s URL &#8211; ok &#39;x&#39;</p>"), /the app's URL . ok 'x'/);
});
