export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { query, variables } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Missing GraphQL query' });
    }

    const resp = await fetch('https://data.objkt.com/v3/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.error('OBJKT proxy error:', resp.status, errText);
      return res.status(resp.status).json({ error: 'OBJKT API error' });
    }

    const data = await resp.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error('OBJKT proxy error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
