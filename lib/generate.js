import { normalizeGuide, slugify } from './schema.js';

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

async function geminiGuide(query) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt(query) }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 8000 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts || []).map(p => p.text || '').join('\n');
  const json = extractJson(text);
  if (!json) throw new Error('Agent did not return a parseable guide');
  json.slug = slugify(json.slug || json.name || query);
  // Add pages Gemini actually searched/grounded on when the model cited few sources itself.
  const grounded = (cand?.groundingMetadata?.groundingChunks || [])
    .map(c => ({ title: c.web?.title || 'Search result', url: c.web?.uri }))
    .filter(s => s.url);
  json.sources = [...(Array.isArray(json.sources) ? json.sources : []), ...grounded.slice(0, 8)];
  const guide = normalizeGuide(json, { generatedBy: 'agent' });
  guide.meta.tested = 'Researched live via Gemini with Google Search grounding. No provider app was registered by the agent.';
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
