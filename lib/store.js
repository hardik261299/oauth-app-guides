import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'guides');

let cache;
export async function loadGuides() {
  if (cache) return cache;
  const files = (await readdir(dir)).filter(f => f.endsWith('.json')).sort();
  cache = await Promise.all(files.map(async f => JSON.parse(await readFile(path.join(dir, f), 'utf8'))));
  return cache;
}

export async function getGuide(slug) {
  return (await loadGuides()).find(g => g.slug === slug) || null;
}

const host = u => {
  try { return new URL(/^https?:\/\//.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, ''); } catch { return ''; }
};

// Match a free-text query (name or URL) to a curated guide.
export async function findGuide(query) {
  const q = query.trim().toLowerCase();
  const qHost = q.includes('.') ? host(q) : '';
  return (await loadGuides()).find(g =>
    g.slug === q || g.name.toLowerCase() === q || g.name.toLowerCase().split(' ')[0] === q ||
    (qHost && (host(g.website) === qHost || host(g.website).endsWith(`.${qHost}`) || qHost.endsWith(`.${host(g.website)}`)))
  ) || null;
}
