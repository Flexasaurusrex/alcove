export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const body = req.body || {};
    const { title, artist, tags, collection, description } = body;
    if (!title && !tags?.length) return res.status(200).json({ note: '' });

    const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
    if (!apiKey) return res.status(200).json({ note: '' });

    const context = [
      title ? `Title: "${title}"` : 'Title: Untitled',
      artist ? `Artist: ${artist}` : null,
      collection ? `Collection: "${collection}"` : null,
      tags?.length ? `Tags: ${tags.slice(0, 6).join(', ')}` : null,
      description?.trim() ? `Artist's statement: ${description.trim()}` : null,
    ].filter(Boolean).join('\n');

    const prompt = `You are writing a curator's note for Alcove, a gallery of digital art on the Tezos blockchain. This ecosystem — born from the Hic et Nunc moment of 2021 — spans generative algorithmic work (fxhash), glitch aesthetics, experimental photography, code-based practice, and artist-led NFT work. The artists range from veterans of the demoscene and net.art to a new generation of code poets.

${context}

Write 2–3 sentences (under 65 words). Your note must:
1. Open with a formal or conceptual observation grounded in the available metadata — if the artist's statement is abstract or poetic, treat it as intentional and read it closely for meaning rather than dismissing it
2. Situate the work in a specific lineage or tradition — generative art (Vera Molnár, Sol LeWitt, Casey Reas), glitch (Rosa Menkman, JODI), photography-as-data, post-internet, blockchain-native practice, conceptual art, etc.
3. Close with what the work asks of or offers the viewer

Rules: Never use "stunning," "captivating," "unique," "beautiful," "innovative," or any marketing language. Write as a trained curator. Be historically precise. Return only the note — no title, no label, no preamble.`;

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 180,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      return res.status(200).json({ note: '' });
    }

    const data = await resp.json();
    const note = data.content?.[0]?.text?.trim() || '';
    return res.status(200).json({ note });

  } catch (err) {
    console.error('Curator error:', err.message);
    return res.status(200).json({ note: '' });
  }
}
