// Shared DOM helpers. All content is written with textContent, never innerHTML.
export function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) node.append(kid);
  return node;
}

export function safeHref(u) {
  try {
    const url = new URL(String(u));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

export const link = (text, href) => {
  const h = safeHref(href);
  return h ? el('a', { href: h, target: '_blank', rel: 'noopener noreferrer', text }) : el('span', { text });
};

export const badge = d => el('span', { class: `badge ${['easy', 'moderate', 'hard'].includes(d) ? d : 'unknown'}`, text: d });

export function encodeGuide(guide) {
  const bytes = new TextEncoder().encode(JSON.stringify(guide));
  let bin = '';
  bytes.forEach(b => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeGuide(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
}
