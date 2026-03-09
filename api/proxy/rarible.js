export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { path, body } = req.body;

    if (!path) {
      return res.status(400).json({ error: 'Missing API path' });
    }

    const apiKey = (process.env.RARIBLE_API_KEY || '').trim();
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (apiKey) {
      headers['X-API-KEY'] = apiKey;
    }

    const resp = await fetch(`https://api.rarible.org/v0.1${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.error('Rarible proxy error:', resp.status, errText);
      return res.status(resp.status).json({ error: 'Rarible API error', detail: errText });
    }

    const data = await resp.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error('Rarible proxy error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
