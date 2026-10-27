# OAuth App Guides

A developer who wants their users to connect a third-party app often has to register an OAuth app with that provider first, and sometimes get it approved. This project answers four questions up front: **how hard is it, how long will it take, what could block me, and what can an agent do versus what do I have to do.**

- **Library**: 5 curated guides chosen for different setup challenges (GitHub, Slack, Notion, Google, LinkedIn).
- **Live generation**: type any app name or website and a research agent builds a guide from public sources, with a shareable link.

## Run it

```bash
npm test          # unit tests, no dependencies to install
npm start         # http://localhost:3000
```

No `npm install` is needed (zero dependencies, Node 20+). Live research needs a **free** Gemini key (create one at https://aistudio.google.com/apikey; no paid account needed):

```bash
cp .env.example .env     # then set GEMINI_API_KEY
```

Without a key the app still runs. Library guides work; unknown apps return a guide clearly marked **STUB / not researched** instead of made-up content.

### Deploy (Vercel)
Import the repo, set `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`) in the project's environment variables, deploy. `vercel.json` sets a 300s function limit because live research is slow; check your plan's maximum.

## Key decisions

1. **Evidence tags over confident prose.** Every requirement is `confirmed` (read in the cited source) or `unconfirmed`, and each guide has a "what we could not verify" list. The prompt forbids the agent from upgrading confidence from memory or inventing wait times; unknown timelines render as "Not published".
2. **Difficulty is defined by approval, not by form complexity.** Registering a client is nearly always easy; the variable that hurts developers is review, verification and partner gating. So time is split into hands-on time and approval wait.
3. **Agent/human split is part of every guide.** Each step is labelled agent / you / both, because identity, 2FA, payment, legal sign-off and reviewer emails are where automation stops.
4. **Stateless sharing.** A generated guide is encoded into the URL fragment (`/guide#g=...`), so it can be shared without a database. Curated guides live at `/guide?slug=...`.
5. **Library first.** A query matching a curated guide (by name or domain) returns it instead of spending a generation.
6. **Untrusted output boundary.** Agent output goes through `normalizeGuide()` (enum-clamped fields, http(s)-only URLs, length limits) and the UI renders with `textContent` only, so a hostile guide or share link cannot inject markup.
7. **Zero dependencies.** One `fetch` to the Gemini API (free tier) with Google Search grounding; Anthropic is supported as an optional alternative if `GEMINI_API_KEY` is unset. Easy to audit and deploy.

## Evidence and limits (read this)

See [VERIFICATION.md](VERIFICATION.md) for exactly what was checked, corrected and left unverified.

- **No provider app was actually registered** for any guide. Guidance is from reading primary docs, not from setup attempts. The `tested` field on each guide says so.
- Approval timelines are mostly **not published** by providers; guides say that rather than guess.
- The live agent does web research only. It does not log in, register apps or click through consoles. That is the natural next step (browser-driven setup attempts) and would produce much stronger evidence.
- Generated guides are not human reviewed. Search-based research can pick up stale or third-party pages; use the source links.
- The live generator is rate limited in-memory per IP (best effort on serverless) and is the only part that spends API credit.
- Only 5 of the target 100 guides exist, by design of this take-home.
- This build was not run against a live API key in my environment, so the Gemini/Anthropic request paths are unit-tested for parsing and normalization but **not yet exercised end to end**. Do a first live run before relying on it.

## Layout

```
api/        generate.js, guide.js, guides.js  (Vercel functions, also used by server.js)
lib/        schema.js (normalize/validate), generate.js (agent + stub), store.js, http.js
data/guides curated guide JSON
public/     index.html, guide.html, common.js, style.css
test/       node:test unit tests
```
