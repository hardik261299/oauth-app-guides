import { generateGuide, providerName } from '../lib/generate.js';
import { findGuide } from '../lib/store.js';
import { readJson, rateLimited, send } from '../lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });

  let query;
  try {
    query = String((await readJson(req)).query || '').trim();
  } catch {
    return send(res, 400, { error: 'Invalid JSON body' });
  }
  if (query.length < 2 || query.length > 200) {
    return send(res, 400, { error: 'Enter an app name or website (2-200 characters).' });
  }

  // Curated guides win over a fresh (costly, less-checked) generation.
  const existing = await findGuide(query);
  if (existing) return send(res, 200, { guide: existing, source: 'library' });

  if (providerName() !== 'stub' && rateLimited(req)) {
    return send(res, 429, { error: 'Generation limit reached for now. Try again later.' });
  }

  try {
    const guide = await generateGuide(query);
    send(res, 200, { guide, source: providerName() });
  } catch (err) {
    console.error('generate failed:', err.message);
    send(res, 502, { error: 'The research agent failed. Please try again.' });
  }
}
