// Guide shape shared by curated guides and agent-generated ones.
// normalizeGuide() is the trust boundary: anything coming from an LLM passes through it.

const DIFFICULTY = ['easy', 'moderate', 'hard', 'unknown'];
const OWNER = ['agent', 'developer', 'both'];
const CONFIDENCE = ['confirmed', 'unconfirmed'];

const str = (v, max = 600) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const arr = (v, max = 30) => (Array.isArray(v) ? v.slice(0, max) : []);
const pick = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);

export function safeUrl(u) {
  try {
    const url = new URL(String(u));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

export function slugify(s) {
  return (
    String(s)
      .toLowerCase()
      .replace(/^https?:\/\/(www\.)?/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'app'
  );
}

export function normalizeGuide(raw, { generatedBy = 'agent' } = {}) {
  const g = raw && typeof raw === 'object' ? raw : {};
  const time = g.time && typeof g.time === 'object' ? g.time : {};
  const approval = g.approval && typeof g.approval === 'object' ? g.approval : {};

  return {
    slug: slugify(g.slug || g.name),
    name: str(g.name, 80) || 'Unknown app',
    website: safeUrl(g.website),
    summary: str(g.summary, 800),
    difficulty: pick(g.difficulty, DIFFICULTY, 'unknown'),
    difficultyWhy: str(g.difficultyWhy, 500),
    time: {
      handsOn: str(time.handsOn, 120) || 'Unknown',
      wait: str(time.wait, 200) || 'Unknown',
      waitConfidence: pick(time.waitConfidence, CONFIDENCE, 'unconfirmed'),
    },
    approval: {
      required: pick(approval.required, ['no', 'sometimes', 'yes', 'unknown'], 'unknown'),
      details: str(approval.details, 800),
    },
    requirements: arr(g.requirements).map(item => ({
      text: str(item?.text, 400),
      confidence: pick(item?.confidence, CONFIDENCE, 'unconfirmed'),
      source: safeUrl(item?.source),
    })).filter(i => i.text),
    steps: arr(g.steps, 40).map(s => ({
      title: str(s?.title, 160),
      detail: str(s?.detail, 800),
      owner: pick(s?.owner, OWNER, 'developer'),
      source: safeUrl(s?.source),
    })).filter(s => s.title),
    blockers: arr(g.blockers).map(b => ({
      issue: str(b?.issue, 300),
      fix: str(b?.fix, 600),
    })).filter(b => b.issue),
    agentCan: arr(g.agentCan).map(x => str(x, 300)).filter(Boolean),
    developerMust: arr(g.developerMust).map(x => str(x, 300)).filter(Boolean),
    uncertain: arr(g.uncertain).map(x => str(x, 400)).filter(Boolean),
    sources: arr(g.sources, 25).map(s => ({
      title: str(s?.title, 160),
      url: safeUrl(s?.url),
    })).filter(s => s.url),
    meta: {
      generatedBy: pick(generatedBy, ['curated', 'agent', 'stub'], 'agent'),
      researchedOn: str(g.meta?.researchedOn, 20) || new Date().toISOString().slice(0, 10),
      tested: str(g.meta?.tested, 600),
    },
  };
}
