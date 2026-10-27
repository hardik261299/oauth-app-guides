import { loadGuides } from '../lib/store.js';
import { send } from '../lib/http.js';
import { providerName } from '../lib/generate.js';

export default async function handler(req, res) {
  const guides = await loadGuides();
  send(res, 200, {
    mode: providerName(),
    guides: guides.map(({ slug, name, website, summary, difficulty, time, approval }) => ({
      slug, name, website, summary, difficulty, time, approval,
    })),
  });
}
