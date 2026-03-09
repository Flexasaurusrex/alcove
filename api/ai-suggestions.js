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

    const prompt = `You are a curator for a Tezos digital art discovery tool that searches OBJKT. The search matches against token name, description, tags, collection name, and artist alias.

Tezos has the richest art community in crypto: generative art (fxhash, fxhash2), photography, illustration, glitch, abstract, experimental, pixel art, AI art, animated, and more. Known artists: zancan, William Mapan, gorillasun, Yazid, Quasimondo, Iskra Velitchkova, Zancan, Hicetnunc veterans.

Common Tezos art tags: generative, abstract, glitch, photography, illustration, pixel, animation, landscape, portrait, surreal, minimal, geometric, organic, code, p5js, processing, webgl, noise, flow, particle, fractal, nature, urban, dark, light, color, monochrome, experimental.

TRANSLATE the user's query into concrete search terms optimized for OBJKT's metadata. The search uses SQL ILIKE (%%term%%), so shorter, more specific terms work better than long phrases. Include both conceptual terms AND relevant Tezos art tags.

Return JSON:
{
  "queries": ["term1", "term2", ...]  // 4-8 search strings, 1-3 words each
}

EXAMPLES:
- "dreamy landscapes" → ["landscape", "dreamscape", "ethereal", "pastel terrain", "atmospheric", "nature generative"]
- "glitch aesthetic" → ["glitch", "databending", "distortion", "corruption", "pixel", "broken"]
- "portraits made through code" → ["generative portrait", "portrait", "face", "algorithmic", "p5js portrait", "processing"]
- "zancan style trees" → ["zancan", "tree", "garden", "botanical", "generative nature"]

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
