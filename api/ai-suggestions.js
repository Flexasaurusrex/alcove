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

    const prompt = `You are a curator for a FINE ART discovery tool that searches digital art on Ethereum and Tezos blockchains. Your job is to find REAL ART — not PFP collections, not meme tokens, not derivative cash grabs.

SOURCES:
- Ethereum (OpenSea): 1/1 fine art, generative art (Art Blocks, fxhash), photography, abstract, mixed media. Known artists: Beeple, XCOPY, Tyler Hobbs, Refik Anadol, Dimitri Cherniak, Sarah Zucker, Matt DesLauriers
- Tezos (OBJKT): The strongest art community in crypto. Generative art, photography, illustration, experimental, glitch, abstract. Known artists: zancan, William Mapan, gorillasun, Yazid, Quasimondo, Iskra Velitchkova

AVOID: PFP collections (10K profile pictures), meme tokens, derivative projects, anything with "ape", "punk", "club", "gang", "crew" in the name. Focus on ARTISTIC INTENT — pieces created as art, not as speculative assets.

TRANSLATE the user's query into concrete search terms that match NFT metadata (title, description, tags, collection names). For abstract/emotional queries, think about what visual elements and techniques embody that feeling.

Return JSON:
{
  "queries": ["term1", "term2", ...],  // 4-8 search strings, 2-4 words each
  "skip": []  // "ethereum" or "tezos" if query clearly doesn't fit that chain
}

EXAMPLES:
- "dreamy landscapes" → ["ethereal landscape", "dreamscape generative", "soft gradient nature", "pastel terrain", "atmospheric digital landscape"]
- "glitch aesthetic" → ["glitch art", "data corruption", "pixel distortion", "digital decay", "broken signal", "databending"]
- "minimalist geometric" → ["geometric minimal", "abstract geometry", "clean lines", "mathematical art", "sacred geometry"]

User query: "${query}"

Return ONLY valid JSON.`;

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
