// Serves index.html for /p/<contract>/<id> (a piece) and /a/<address> (an artist) with
// that page's title, description and artwork in the meta tags. Link-preview crawlers
// (X, iMessage, Discord) don't run JavaScript, so without this every shared Alcove
// link would preview as the homepage. The page itself still routes client-side.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SITE = 'https://thealcove.art';
const GATEWAY = 'https://ipfs.fileship.xyz/';
let template = null;

function loadTemplate() {
  if (!template) template = readFileSync(join(process.cwd(), 'public', 'index.html'), 'utf8');
  return template;
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const oneLine = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

function media(uri) {
  if (!uri) return '';
  if (uri.startsWith('ipfs://')) return GATEWAY + uri.slice(7);
  if (uri.startsWith('http')) return uri;
  return '';
}

async function gql(query, variables) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);
  try {
    const r = await fetch('https://data.objkt.com/v3/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: ctrl.signal,
    });
    return (await r.json()).data || {};
  } finally { clearTimeout(timer); }
}

async function pieceMeta(fa, id) {
  const d = await gql(`query($fa: String!, $id: String!) {
    token(where: { fa_contract: { _eq: $fa }, token_id: { _eq: $id } }, limit: 1) {
      name description display_uri thumbnail_uri lowest_ask creators { holder { alias address } }
    }
  }`, { fa, id });
  const t = d.token?.[0];
  if (!t) return null;
  const artist = t.creators?.[0]?.holder;
  const by = artist?.alias || (artist?.address ? artist.address.slice(0, 8) : 'an artist');
  const title = `${t.name || 'Untitled'} by ${by}`;
  const price = t.lowest_ask ? ` Available for ${+(t.lowest_ask / 1e6).toFixed(2)} ꜩ.` : '';
  return {
    title: `${title} · Alcove`,
    ogTitle: title,
    description: oneLine(t.description, 150) || `Digital art on Tezos by ${by}.${price} Collect it on Alcove.`,
    image: media(t.display_uri || t.thumbnail_uri),
    url: `${SITE}/p/${fa}/${id}`,
  };
}

async function artistMeta(addr) {
  const d = await gql(`query($a: String!) {
    holder_by_pk(address: $a) { alias description logo }
    token(where: { creators: { creator_address: { _eq: $a } }, supply: { _gt: "0" }, flag: { _neq: "banned" } }, order_by: { pk: desc }, limit: 1) { display_uri thumbnail_uri }
  }`, { a: addr });
  const h = d.holder_by_pk;
  if (!h && !d.token?.length) return null;
  const name = h?.alias || `${addr.slice(0, 6)}…${addr.slice(-4)}`;
  const latest = d.token?.[0];
  return {
    title: `${name} · Alcove`,
    ogTitle: `${name} on Alcove`,
    description: oneLine(h?.description, 150) || `Work by ${name} on Tezos. Browse and collect it on Alcove.`,
    // A piece reads better in a preview card than a small square avatar.
    image: media(latest?.display_uri || latest?.thumbnail_uri) || media(h?.logo),
    url: `${SITE}/a/${addr}`,
  };
}

function inject(html, m) {
  const t = esc(m.title), ot = esc(m.ogTitle), d = esc(m.description), u = esc(m.url);
  let out = html
    .replace(/<title>[^<]*<\/title>/, `<title>${t}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${d}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${ot}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${d}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${u}$2`);
  if (m.image) {
    const i = esc(m.image);
    out = out
      .replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${i}$2`)
      .replace(/(<meta name="twitter:image" content=")[^"]*(")/, `$1${i}$2`)
      // Artwork isn't 1200x630; drop the fixed size so crawlers read the real one.
      .replace(/<meta property="og:image:width"[^>]*>\s*/, '')
      .replace(/<meta property="og:image:height"[^>]*>\s*/, '');
  }
  return out.replace('</head>', `<link rel="canonical" href="${u}">\n</head>`);
}

export default async function handler(req, res) {
  const html = loadTemplate();
  const { kind, fa, id, addr } = req.query || {};
  let meta = null;
  try {
    if (kind === 'p' && /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(fa || '') && /^\d{1,30}$/.test(id || '')) meta = await pieceMeta(fa, id);
    if (kind === 'a' && /^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$|^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr || '')) meta = await artistMeta(addr);
  } catch (e) {
    console.error('page meta error:', e.message);
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (meta) {
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).send(inject(html, meta));
  }
  // Unknown piece/artist or OBJKT down: still serve the app, just with default meta.
  res.setHeader('Cache-Control', 'public, s-maxage=60');
  return res.status(200).send(html);
}
