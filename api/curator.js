// Belt and braces for the prompt's format rules: plain prose, no dashes, no markdown.
function cleanNote(raw) {
  return raw
    .split('\n')
    .filter(line => !/^\s*(#{1,6}\s|curator'?s note\s*:?\s*$)/i.test(line))
    .join(' ')
    .replace(/^\s*curator'?s note\s*:\s*/i, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/\s*[\u2014\u2013]\s*/g, ', ')
    .replace(/,\s*([.;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/^["\u201c]([^"\u201c\u201d]*)["\u201d]$/, '$1'); // only quotes that wrap the whole note
}

// Keep whole sentences up to the word cap, so a long note never ends mid-thought.
function capWords(text, max) {
  if (text.split(/\s+/).length <= max) return text;
  const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)/g) || [text];
  let out = '';
  for (const sent of sentences) {
    if ((out + sent).trim().split(/\s+/).length > max) break;
    out += sent;
  }
  return (out || sentences[0]).trim();
}

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

    const prompt = `You are writing a curator's note for Alcove, a gallery of digital art on the Tezos blockchain. This ecosystem, born from the Hic et Nunc moment of 2021, spans generative algorithmic work (fxhash), glitch aesthetics, experimental photography, code-based practice, and artist-led NFT work. The artists range from veterans of the demoscene and net.art to a new generation of code poets.

${context}

Write exactly two sentences, about 50 words in total and never more than 65. Your note should:
1. Open with a formal or conceptual observation about the work itself. If the artist's statement is abstract or poetic, treat it as intentional and read it closely for meaning rather than dismissing it
2. Situate the work in a specific lineage or tradition: generative art (Vera Molnár, Sol LeWitt, Casey Reas), glitch (Rosa Menkman, JODI), photography-as-data, post-internet, blockchain-native practice, conceptual art, etc.
3. End on what the work asks of or offers the viewer

You will not see the image. When the details above are thin, write from what is known: what the title proposes, the tradition its tags and medium imply, and what that tradition asks of a viewer. Do not invent visual details such as colors, figures, or composition. Never decline, never write in the first person, and never mention missing information, metadata, or these instructions.

Rules: Never use "stunning," "captivating," "unique," "beautiful," "innovative," or any marketing language. Write as a trained curator. Be historically precise.
Format: plain prose in one paragraph. No title, heading, label, preamble, markdown, quotation marks around the note, or bullet points. Never use em dashes or en dashes; use commas, colons, semicolons, or separate sentences instead.`;

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-5-5',
        // Haiku 5.5 thinks by default; that alone used up the old 180-token cap and
        // returned no text. A 65-word note needs no reasoning pass.
        thinking: { type: 'disabled' },
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.error('Curator Anthropic error:', resp.status, errText.slice(0, 300));
      return res.status(200).json({ note: '' });
    }

    const data = await resp.json();
    const textBlock = (data.content || []).find(b => b.type === 'text');
    let note = capWords(cleanNote(textBlock?.text || ''), 75);
    // A first-person reply is the model explaining itself, not a note; hide the section instead.
    if (/^(I|I'm|I've|I'd)\b/.test(note) || /\b(I can't|I cannot|I have no)\b/.test(note)) note = '';
    if (!note) console.error('Curator empty note:', data.stop_reason, JSON.stringify((data.content || []).map(b => b.type)));
    return res.status(200).json({ note });

  } catch (err) {
    console.error('Curator error:', err.message);
    return res.status(200).json({ note: '' });
  }
}
