// Fetch public documentation pages for the research agent.
// URLs come from an LLM (and indirectly from user input), so this refuses anything that is not a
// public https host: no localhost, private ranges, link-local/metadata addresses, or redirects into them.
import dns from 'node:dns/promises';
import net from 'node:net';

const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;

export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::' || v.startsWith('fe80') || v.startsWith('fc') || v.startsWith('fd')) return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateIp(mapped[1]) : false;
  }
  return true;
}

async function assertPublic(url) {
  if (url.protocol !== 'https:') throw new Error('https only');
  if (url.username || url.password) throw new Error('credentials in URL');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some(a => isPrivateIp(a.address))) throw new Error('non-public host');
}

export function htmlToText(html, max = 9000) {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|br|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim()
    .slice(0, max);
}

// Same-host https links found in a page: [{ url, text }]. Gives the agent real URLs to choose from.
export function extractLinks(html, base, max = 120) {
  const out = new Map();
  const re = /<a\b[^>]*?href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && out.size < max) {
    try {
      const u = new URL(m[1], base);
      if (u.protocol !== 'https:' || u.hostname !== new URL(base).hostname) continue;
      u.hash = '';
      const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
      if (!out.has(u.href)) out.set(u.href, text);
    } catch { /* skip malformed */ }
  }
  return [...out].map(([url, text]) => ({ url, text }));
}

// Returns { url, title, text, links } or throws.
export async function fetchDoc(rawUrl) {
  let url = new URL(rawUrl);
  url.hash = '';
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
      headers: { 'user-agent': 'oauth-guides-research/0.1', accept: 'text/html,text/plain;q=0.9' },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location'), url);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get('content-type') || '';
    if (!/text\/|json|xml/.test(type)) throw new Error(`unsupported type ${type}`);
    const body = (await res.text()).slice(0, MAX_BYTES);
    const title = (body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || url.hostname).replace(/\s+/g, ' ').trim().slice(0, 140);
    const text = /html/.test(type) ? htmlToText(body) : body.slice(0, 9000);
    if (text.length < 200) throw new Error('page has too little text (likely JavaScript-rendered)');
    return { url: url.href, title, text, links: /html/.test(type) ? extractLinks(body, url.href) : [] };
  }
  throw new Error('too many redirects');
}
