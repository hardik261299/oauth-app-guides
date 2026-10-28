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

test('enforceEvidence downgrades confirmed claims whose source was not fetched', () => {
  const g = normalizeGuide({
    name: 'X',
    time: { wait: '2 weeks', waitConfidence: 'confirmed' },
    requirements: [
      { text: 'real', confidence: 'confirmed', source: 'https://docs.x.com/a' },
      { text: 'invented source', confidence: 'confirmed', source: 'https://made-up.example/z' },
    ],
    steps: [{ title: 's', source: 'https://made-up.example/z' }],
  });
  enforceEvidence(g, [{ url: 'https://docs.x.com/a', title: 'A' }]);
  assert.equal(g.requirements[0].confidence, 'confirmed');
  assert.equal(g.requirements[1].confidence, 'unconfirmed');
  assert.equal(g.requirements[1].source, '');
  assert.equal(g.steps[0].source, '');
  assert.deepEqual(g.sources, [{ title: 'A', url: 'https://docs.x.com/a' }]);
});
