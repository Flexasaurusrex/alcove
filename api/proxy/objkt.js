export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Read raw body to avoid any encoding mangling of % characters
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks).toString('utf-8');

    if (!rawBody) {
      return res.status(400).json({ error: 'Empty body' });
    }

    const resp = await fetch('https://data.objkt.com/v3/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: rawBody,
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.error('OBJKT proxy error:', resp.status, errText);
      return res.status(resp.status).json({ error: 'OBJKT API error', detail: errText });
    }

    const data = await resp.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error('OBJKT proxy error:', err.message);
    return res.status(500).json({ error: 'Internal error', detail: err.message });
  }
}
