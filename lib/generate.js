import { normalizeGuide, slugify } from './schema.js';
import { fetchDoc } from './fetchdocs.js';

const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

const SYSTEM = `You are a research agent for developers who must create an OAuth app (or equivalent client registration) with a third-party provider so that their own product's end users can connect that provider's account.

Investigate the requested app using web search and the provider's OWN developer documentation first. Then output ONE JSON object and nothing else.

Rules for evidence:
- Every requirement must carry "confidence": "confirmed" ONLY if you read it on a page you cite in "source"; otherwise "unconfirmed". Never upgrade confidence from memory.
- Cite real URLs you actually visited. Do not invent URLs.
- If approval/review time is not stated by the provider, say so: set time.wait to "Not published" and time.waitConfidence to "unconfirmed". Never invent a duration.
- Put anything you could not verify (review timelines, fees, user caps, plan restrictions) in "uncertain".
- Distinguish who does what: steps and lists must say what an agent with browser/API access could do ("agent") versus what needs the developer's identity, payment, legal sign-off, 2FA/CAPTCHA or email replies ("developer").
- If the app has no public OAuth support, say so: difficulty "unknown", explain in summary, and list alternatives (API keys, partner programs).

JSON shape:
{
 "name": string, "website": url,
 "summary": "2-3 sentences: what the developer has to do and the main risk",
 "difficulty": "easy|moderate|hard|unknown", "difficultyWhy": string,
 "time": {"handsOn": "e.g. ~30 min", "wait": "e.g. none | 1-2 weeks | Not published", "waitConfidence": "confirmed|unconfirmed"},
 "approval": {"required": "no|sometimes|yes|unknown", "details": string},
 "requirements": [{"text": string, "confidence": "confirmed|unconfirmed", "source": url}],
 "steps": [{"title": string, "detail": string, "owner": "agent|developer|both", "source": url}],
 "blockers": [{"issue": string, "fix": string}],
 "agentCan": [string], "developerMust": [string],
 "uncertain": [string],
 "sources": [{"title": string, "url": url}]
}`;

// Free tier first: Gemini (free key from aistudio.google.com). Anthropic is an optional paid alternative.
export function providerName() {
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return 'stub';
}

export async function generateGuide(query) {
  const name = query.trim();
  const provider = providerName();
  if (provider === 'gemini') return geminiGuide(name);
  if (provider === 'anthropic') return anthropicGuide(name);
  return stubGuide(name);
}

const userPrompt = query =>
  `App (name or website): ${JSON.stringify(query)}\nToday: ${new Date().toISOString().slice(0, 10)}\nProduce the JSON guide.`;

// ---- Gemini (free tier) ------------------------------------------------------------------
// Google Search grounding is not available on the free tier, so research is done here:
//   1. the model proposes official docs URLs   2. the server fetches them (public hosts only)
//   3. the model writes the guide from that fetched text only
//   4. the server downgrades any claim whose source was not actually fetched.
const GEMINI_MODELS = () => [
  process.env.GEMINI_MODEL,
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite-preview',
  'gemini-flash-lite-latest',
].filter(Boolean).filter((m, i, a) => a.indexOf(m) === i);

async function geminiCall({ system, prompt, maxOutputTokens = 16000 }) {
  let lastErr;
  for (const model of GEMINI_MODELS()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          signal: AbortSignal.timeout(90000),
          headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens },
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('\n');
          if (text.trim()) return text;
          lastErr = new Error(`${model}: empty response`);
          break;
        }
        lastErr = new Error(`${model}: HTTP ${res.status}`);
        if (res.status === 503 && attempt === 0) { await new Promise(r => setTimeout(r, 2500)); continue; }
        break; // 404 (retired model), 429 (quota) -> try next model
      } catch (e) {
        lastErr = new Error(`${model}: ${e.name}`);
        break;
      }
    }
  }
  throw lastErr || new Error('No Gemini model available');
}

const DISCOVER_SYSTEM = `You find official developer documentation. Output ONE JSON object only:
{"name": string, "website": url, "docsUrls": [up to 6 https URLs]}
docsUrls must be the provider's OWN developer-docs pages (not blogs or third parties) most likely to cover: creating/registering an OAuth app, redirect URIs and scopes, app review/verification/approval, and token lifetimes. Prefer specific pages over homepages. Only include URLs you are confident exist.`;

const PICK_SYSTEM = `From a list of real links on a provider's developer site, choose up to 4 that most likely explain: creating/registering an OAuth app, app review/verification/approval or publishing, scopes/permissions, or token lifetimes. Output ONE JSON object only: {"urls": [exact URLs copied from the list]}. If none are relevant, return {"urls": []}.`;

const DOCS_SYSTEM = SYSTEM
  .replace("Investigate the requested app using web search and the provider's OWN developer documentation first.",
    'You are given the text of documentation pages fetched just now, each labelled [SOURCE n] with its URL. Use ONLY these pages as evidence.')
  .replace('ONLY if you read it on a page you cite in "source"', 'ONLY if it is stated in a provided SOURCE page whose exact URL you put in "source"')
  .replace('Cite real URLs you actually visited. Do not invent URLs.', 'Cite only URLs of provided SOURCE pages. Anything from your own background knowledge must be "unconfirmed" with an empty source.');

// Enforce the evidence contract regardless of what the model claimed.
export function enforceEvidence(guide, fetched) {
  const ok = new Set(fetched.map(f => f.url));
  for (const r of guide.requirements) {
    if (r.confidence === 'confirmed' && !ok.has(r.source)) { r.confidence = 'unconfirmed'; r.source = ''; }
  }
  for (const s of guide.steps) if (s.source && !ok.has(s.source)) s.source = '';
  guide.sources = fetched.map(f => ({ title: f.title, url: f.url }));
  if (guide.time.waitConfidence === 'confirmed' && !guide.requirements.some(r => r.confidence === 'confirmed')) {
    guide.time.waitConfidence = 'unconfirmed';
  }
  return guide;
}

async function geminiGuide(query) {
  const found = extractJson(await geminiCall({
    system: DISCOVER_SYSTEM, prompt: userPrompt(query), maxOutputTokens: 4000,
  })) || {};
  const candidates = [...new Set((found.docsUrls || []).filter(u => typeof u === 'string').slice(0, 6))];

  const fetchAll = async urls =>
    (await Promise.allSettled(urls.map(fetchDoc))).filter(r => r.status === 'fulfilled').map(r => r.value);
  const fetched = await fetchAll(candidates);

  // The model's URLs are often guesses. Let it choose from links that really exist on the pages we read.
  const seen = new Set(fetched.map(f => f.url));
  const pool = fetched.flatMap(f => f.links).filter(l => !seen.has(l.url));
  if (pool.length) {
    const picked = extractJson(await geminiCall({
      system: PICK_SYSTEM,
      prompt: `App: ${found.name || query}\nLINKS:\n${pool.slice(0, 120).map((l, i) => `${i}. ${l.text} | ${l.url}`).join('\n')}`,
      maxOutputTokens: 4000,
    }).catch(() => '{}')) || {};
    const urls = (picked.urls || []).filter(u => pool.some(l => l.url === u)).slice(0, 4);
    for (const d of await fetchAll(urls)) if (!seen.has(d.url)) { fetched.push(d); seen.add(d.url); }
  }
  if (!fetched.length) {
    throw new Error("Could not read any official docs pages for this app, so no guide was generated. Try the app's website address.");
  }

  const pages = fetched.slice(0, 7).map((f, i) => `[SOURCE ${i + 1}] ${f.url}\n${f.text}`).join('\n\n---\n\n');
  const text = await geminiCall({
    system: DOCS_SYSTEM,
    prompt: `${userPrompt(query)}\nApp name hint: ${found.name || query}\n\nFETCHED PAGES:\n\n${pages}`,
  });
  const json = extractJson(text);
  if (!json) throw new Error('Agent did not return a parseable guide');
  json.slug = slugify(json.slug || json.name || query);
  if (!json.website && found.website) json.website = found.website;
  const guide = enforceEvidence(normalizeGuide(json, { generatedBy: 'agent' }), fetched);
  guide.meta.tested = `Read ${Math.min(fetched.length, 7)} official docs page(s) live and summarised them with Gemini. Model-proposed URLs that did not load were discarded. No provider app was registered by the agent.`;
  return guide;
}

async function anthropicGuide(query) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL(),
      max_tokens: 8000,
      system: SYSTEM,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 12 }],
      messages: [{ role: 'user', content: userPrompt(query) }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  const json = extractJson(text);
  if (!json) throw new Error('Agent did not return a parseable guide');
  json.slug = slugify(json.slug || json.name || query);
  const guide = normalizeGuide(json, { generatedBy: 'agent' });
  guide.meta.tested = 'Researched live from public web sources. No provider app was registered by the agent.';
  return guide;
}

export function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

// Used when no API key is configured. Deliberately makes no claims about the provider.
export function stubGuide(query) {
  const q = encodeURIComponent(`${query} OAuth app registration developer docs`);
  return normalizeGuide({
    name: query,
    summary:
      'STUB: no LLM key is configured on this server, so no research was done. Nothing below is specific to this app. Add a free GEMINI_API_KEY to enable live research.',
    difficulty: 'unknown',
    difficultyWhy: 'No research performed.',
    time: { handsOn: 'Unknown', wait: 'Unknown', waitConfidence: 'unconfirmed' },
    approval: { required: 'unknown', details: 'Not researched.' },
    requirements: [{ text: 'Generic OAuth 2.0 apps need a redirect URI and produce a client ID/secret (not verified for this provider).', confidence: 'unconfirmed' }],
    steps: [
      { title: 'Find the provider developer console', detail: 'Search for the provider developer docs.', owner: 'agent', source: `https://www.google.com/search?q=${q}` },
      { title: 'Register the app', detail: 'Create the OAuth app and add your redirect URI.', owner: 'developer' },
    ],
    uncertain: ['Everything: this guide was not researched.'],
  }, { generatedBy: 'stub' });
}
