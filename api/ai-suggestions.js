export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Missing query' });
    }

    const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
    if (!apiKey) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    const prompt = `You are a digital art curator who translates search queries into optimized NFT/digital art searches. You search across:
- Ethereum: ERC-721/1155 NFTs on OpenSea — generative art, PFPs, 1/1 fine art, photography, abstract
- Tezos (OBJKT): Clean NFT art scene — generative, photography, illustration, experimental, abstract

YOUR SKILL: When someone describes a FEELING, MOOD, or CONCEPT, translate the emotional essence into CONCRETE visual elements that would match digital art metadata on these platforms.

Return a JSON object with:
1. "queries": array of 4-8 search strings optimized for NFT metadata (title, description, tags)
2. "skip": array of sources to skip ("ethereum" or "tezos") if query clearly doesn't fit that chain

Focus on: artist styles, movement names, visual descriptors, technique terms, collection names, tag keywords.

User query: "${query}"

Return ONLY valid JSON, no explanation.`;

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.error('Anthropic error:', resp.status, errText);
      return res.status(500).json({ error: 'AI service error' });
    }

    const data = await resp.json();
    const text = data.content?.[0]?.text || '';

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(200).json({ queries: [query], skip: [] });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return res.status(200).json(parsed);
  } catch (err) {
    console.error('AI suggestions error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
