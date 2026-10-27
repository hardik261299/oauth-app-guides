import { getGuide } from '../lib/store.js';
import { send } from '../lib/http.js';

export default async function handler(req, res) {
  const slug = new URL(req.url, 'http://x').searchParams.get('slug') || '';
  const guide = await getGuide(slug);
  if (!guide) return send(res, 404, { error: 'Guide not found' });
  send(res, 200, guide);
}
