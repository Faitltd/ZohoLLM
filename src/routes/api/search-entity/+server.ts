// src/routes/api/search-entity/+server.ts
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { getOrCreateCollectionByName, query as chromaQuery, getDocs } from '$lib/chromaHttp';

export const config = { runtime: 'nodejs22.x' } as const;

function norm(s: unknown) {
  return String(s ?? '').trim();
}
function toLower(s: unknown) {
  return norm(s).toLowerCase();
}
function digitsOnly(s: string) {
  return (s || '').replace(/\D+/g, '');
}

async function embed(text: string): Promise<number[]> {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text })
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`OpenAI embeddings failed: ${r.status} ${t}`);
  }
  const j = await r.json();
  return j.data[0].embedding as number[];
}

export const GET: RequestHandler = async ({ url }) => {
  try {
    const termRaw = url.searchParams.get('term') ?? url.searchParams.get('name') ?? '';
    const limit = Number(url.searchParams.get('k') ?? url.searchParams.get('limit') ?? 10);
    const term = termRaw.trim();
    if (!term) return new Response(JSON.stringify({ term, matches: [] }), { headers: { 'content-type': 'application/json' } });

    const dir = await getOrCreateCollectionByName('entity_directory');

    // 1) Substring-first ranking over a window of directory cards
    const dump = await getDocs(dir.id, { limit: 2000, include: ['metadatas','documents'] });
    const mdRows: any[] = dump.metadatas ?? [];

    const tokens = toLower(term).split(/\s+/).filter(Boolean);
    const qDigits = digitsOnly(term);

    function rowMatches(md: any, doc: string) {
      const hay = [
        toLower(md.name),
        toLower(md.company),
        toLower(md.email),
        toLower(md.address_line),
        toLower(md.phones_joined),
        toLower(md.phone_digits),
        toLower(doc)
      ];
      const textHit = tokens.length > 0 && tokens.every(t => hay.some(h => h.includes(t)));
      const phoneHit = !!qDigits && (md.phone_digits || '').includes(qDigits);
      const emailExact = md.email && md.email.toLowerCase() === term.toLowerCase();
      return { matched: textHit || phoneHit || emailExact, textHit, phoneHit, emailExact };
    }

    const substringRanked = mdRows
      .map((md, i) => ({ md, i, ...rowMatches(md, String(dump.documents?.[i] || '')) }))
      .filter(x => x.matched)
      .map(x => {
        let score = 0;
        if (x.textHit) score += 10;
        if (x.emailExact) score += 5;
        if (x.phoneHit) score += 4;
        if (x.md.name && tokens.every(t => toLower(x.md.name).includes(t))) score += 2;
        if (x.md.company && tokens.every(t => toLower(x.md.company).includes(t))) score += 1;
        return { md: x.md, score };
      })
      .sort((a, b) => b.score - a.score)
      .map(x => ({
        entity: x.md.entity,
        name: x.md.name ?? '',
        company: x.md.company ?? '',
        email: x.md.email ?? '',
        phone: x.md.phone ?? '',
        distance: 0.0,
        reason: 'substring'
      }));

    // 2) Vector recall as tie-breaker (append a small number not already included)
    const uniq = new Set(substringRanked.map(m => m.entity));
    const qVec = await embed(term);
    const vres = await chromaQuery(dir.id, { query_embeddings: [qVec], n_results: 15 });
    const vecMatches = (vres.metadatas?.[0] || []).map((md: any, i: number) => ({
      entity: md.entity,
      name: md.name ?? '',
      company: md.company ?? '',
      email: md.email ?? '',
      phone: md.phone ?? '',
      distance: (vres.distances?.[0]?.[i] ?? 999),
      reason: 'vector'
    })).filter(m => m.entity && !uniq.has(m.entity)).slice(0, 2);

    const matches = [...substringRanked, ...vecMatches].slice(0, Math.max(1, limit));

    return new Response(JSON.stringify({ term, matches }), {
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
};

