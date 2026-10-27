import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGuide, slugify, safeUrl } from '../lib/schema.js';
import { extractJson, stubGuide } from '../lib/generate.js';
import { loadGuides } from '../lib/store.js';

test('every curated guide survives normalization unchanged in structure', async () => {
  const guides = await loadGuides();
  assert.ok(guides.length >= 5);
  for (const g of guides) {
    const n = normalizeGuide(g, { generatedBy: 'curated' });
    assert.equal(n.slug, g.slug);
    assert.equal(n.steps.length, g.steps.length, `${g.slug} steps dropped`);
    assert.equal(n.requirements.length, g.requirements.length, `${g.slug} requirements dropped`);
    assert.ok(n.sources.length > 0, `${g.slug} has no sources`);
  }
});

test('confirmed requirements always cite a source', async () => {
  for (const g of await loadGuides()) {
    for (const r of g.requirements.filter(r => r.confidence === 'confirmed')) {
      assert.ok(r.source, `${g.slug}: confirmed claim without source: ${r.text}`);
    }
  }
});

test('normalizeGuide neutralises hostile LLM output', () => {
  const g = normalizeGuide({
    name: '<img src=x onerror=1>',
    website: 'javascript:alert(1)',
    difficulty: 'trivial',
    requirements: [{ text: 'x', confidence: 'definitely', source: 'javascript:alert(1)' }],
    sources: [{ title: 'bad', url: 'data:text/html,hi' }],
  });
  assert.equal(g.website, '');
  assert.equal(g.difficulty, 'unknown');
  assert.equal(g.requirements[0].confidence, 'unconfirmed');
  assert.equal(g.requirements[0].source, '');
  assert.equal(g.sources.length, 0);
});

test('slugify and safeUrl', () => {
  assert.equal(slugify('https://www.Asana.com/'), 'asana-com');
  assert.equal(safeUrl('ftp://x'), '');
});

test('extractJson tolerates prose around the JSON', () => {
  assert.deepEqual(extractJson('Here you go:\n{"a":1}\nDone'), { a: 1 });
  assert.equal(extractJson('no json'), null);
});

test('stub guide is clearly marked and unresearched', () => {
  const g = stubGuide('Zoom');
  assert.equal(g.meta.generatedBy, 'stub');
  assert.match(g.summary, /^STUB/);
  assert.equal(g.difficulty, 'unknown');
});
