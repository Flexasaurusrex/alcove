// Alcove charts: Most Popular (7d), top 15 Artists (30d), top 15 Most Sold Pieces (30d),
// Top Collectors (24h). Computed from raw OBJKT sale events, cached at the edge.

const OBJKT = 'https://data.objkt.com/v3/graphql';
const PAGE = 500; // OBJKT caps rows per query at 500
const DAY = 864e5;

const SALE_WHERE = {
  _or: [
    { marketplace_event_type: { _in: ['list_buy', 'offer_accept', 'offer_floor_accept', 'dutch_auction_buy', 'english_auction_settle'] } },
    { event_type: { _eq: 'open_edition_buy' } },
  ],
  reverted: { _neq: true },
  price_xtz: { _gt: 0 },
};

const TOKEN_FIELDS = `
  pk token_id name description mime artifact_uri display_uri thumbnail_uri fa_contract flag supply
  fa { name collection_id path creator_address floor_price editions }
  creators { holder { alias address } }
  tags { tag { name } }
  lowest_ask timestamp
`;

async function gql(query, variables) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(OBJKT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
      });
      const text = await r.text();
      let j;
      try { j = JSON.parse(text); } catch { throw new Error(`OBJKT ${r.status} non-JSON`); }
      if (j.errors) throw new Error(j.errors[0]?.message || 'gql error');
      return j.data;
    } catch (e) {
      if (attempt === 2) throw e;
      await new Promise(res => setTimeout(res, 1000 * 2 ** attempt));
    }
  }
}

// Pull every sale in [from, to) by paging on id, newest first.
async function salesInSlice(from, to) {
  const out = [];
  let lastId = null;
  for (let i = 0; i < 200; i++) {
    const where = { ...SALE_WHERE, timestamp: { _gte: from, _lt: to } };
    if (lastId) where.id = { _lt: lastId };
    const d = await gql(`query($w: event_bool_exp!, $l: Int!) {
      event(where: $w, order_by: { id: desc }, limit: $l) {
        id timestamp price_xtz amount creator_address recipient_address token_pk
        token { creators { creator_address } }
      }
    }`, { w: where, l: PAGE });
    const rows = d.event || [];
    out.push(...rows);
    if (rows.length < PAGE) break;
    lastId = rows[rows.length - 1].id;
  }
  return out;
}

let failedSlices = 0;
async function allSales(days) {
  failedSlices = 0;
  const now = Date.now();
  const SLICES = 4; // concurrency inside one function, not across scripts
  const step = (days * DAY) / SLICES;
  const parts = await Promise.all(Array.from({ length: SLICES }, (_, i) => {
    const from = new Date(now - days * DAY + i * step).toISOString();
    const to = new Date(i === SLICES - 1 ? now + 60e3 : now - days * DAY + (i + 1) * step).toISOString();
    // A slice that still fails after retries (OBJKT sometimes answers with an HTML error page)
    // is dropped instead of sinking the whole build; failures are counted and reported.
    return salesInSlice(from, to).catch(e => { console.error('charts slice failed:', e.message); failedSlices++; return []; });
  }));
  if (failedSlices === SLICES) throw new Error('all slices failed');
  const seen = new Set();
  return parts.flat().filter(s => (seen.has(s.id) ? false : seen.add(s.id)));
}

function rank(map, key, n) {
  return [...map.values()].sort((a, b) => b[key] - a[key] || b.volume - a.volume).slice(0, n);
}

async function hydrateTokens(pks) {
  const byPk = new Map();
  for (let i = 0; i < pks.length; i += 100) {
    const chunk = pks.slice(i, i + 100);
    const d = await gql(`query($pks: [bigint!]) { token(where: { pk: { _in: $pks } }) { ${TOKEN_FIELDS} } }`, { pks: chunk });
    for (const t of d.token || []) byPk.set(String(t.pk), t);
  }
  return byPk;
}

async function hydrateHolders(addrs) {
  if (!addrs.length) return new Map();
  const d = await gql(`query($a: [String!]) { holder(where: { address: { _in: $a } }) { address alias logo } }`, { a: addrs });
  return new Map((d.holder || []).map(h => [h.address, h]));
}

const okToken = t => t && t.flag !== 'banned' && Number(t.supply) > 0;

async function build() {
  const now = Date.now();
  const sales = await allSales(30);
  // Drop self-trades (seller buying from themselves).
  const real = sales.filter(s => s.recipient_address && s.recipient_address !== s.creator_address);

  const since7 = now - 7 * DAY, since1 = now - DAY;
  const pop7 = new Map(), pieces30 = new Map(), artists30 = new Map(), collectors1 = new Map();

  for (const s of real) {
    const t = Date.parse(s.timestamp);
    const xtz = Number(s.price_xtz) * (Number(s.amount) || 1) / 1e6;
    const pk = String(s.token_pk);
    const bump = (m, k, init) => { const v = m.get(k) || init(); v.sales++; v.volume += xtz; m.set(k, v); return v; };

    bump(pieces30, pk, () => ({ pk, sales: 0, volume: 0 }));
    if (t >= since7) bump(pop7, pk, () => ({ pk, sales: 0, volume: 0 }));
    const artist = s.token?.creators?.[0]?.creator_address;
    if (artist) bump(artists30, artist, () => ({ address: artist, sales: 0, volume: 0 }));
    if (t >= since1) bump(collectors1, s.recipient_address, () => ({ address: s.recipient_address, sales: 0, volume: 0 }));
  }

  // Over-fetch so banned / burned tokens can be dropped and still leave full lists.
  const popRanked = rank(pop7, 'sales', 360);
  const piecesRanked = rank(pieces30, 'sales', 40);
  const tokens = await hydrateTokens([...new Set([...popRanked, ...piecesRanked].map(r => r.pk))]);

  const slim = t => t && ({ ...t, description: (t.description || '').slice(0, 400), tags: (t.tags || []).slice(0, 8) });
  const withToken = list => list.map(r => ({ ...r, token: slim(tokens.get(r.pk)) })).filter(r => okToken(r.token));

  const topArtists = rank(artists30, 'volume', 15);
  const topCollectors = rank(collectors1, 'volume', 15);
  const holders = await hydrateHolders([...topArtists, ...topCollectors].map(r => r.address));
  const withHolder = list => list.map(r => ({ ...r, alias: holders.get(r.address)?.alias || null, logo: holders.get(r.address)?.logo || null }));

  const round = list => list.map(r => ({ ...r, volume: Math.round(r.volume * 100) / 100 }));

  return {
    generatedAt: new Date(now).toISOString(),
    salesCounted: real.length,
    partial: failedSlices > 0,
    popular: round(withToken(popRanked).slice(0, 300)),
    topPieces: round(withToken(piecesRanked).slice(0, 15)),
    topArtists: round(withHolder(topArtists)),
    topCollectors: round(withHolder(topCollectors)),
  };
}

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  try {
    const data = await build();
    // Fresh for 15 min at the edge, served stale up to a day while it rebuilds.
    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=86400');
    return res.status(200).json(data);
  } catch (e) {
    console.error('charts error:', e.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'charts unavailable' });
  }
}
