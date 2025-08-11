import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { getOrCreateCollectionByName, query as chromaQuery } from '$lib/chromaHttp';

export const config = { runtime: 'nodejs22.x' } as const;

async function embed(texts: string[]): Promise<number[][]> {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: texts })
  });
  if (!r.ok) throw new Error(`OpenAI embeddings failed: ${r.status}`);
  const j = await r.json();
  return j.data.map((d: any) => d.embedding as number[]);
}

export const GET: RequestHandler = async ({ url }) => {
  const name = (url.searchParams.get('name') || '').trim();
  const k = Number(url.searchParams.get('k') || '5');
  if (!name) return new Response(JSON.stringify({ error: 'Missing name' }), { status: 400 });

  try {
    const col = await getOrCreateCollectionByName('entity_directory');
    const [q] = await embed([name]);
    const res = await chromaQuery(col.id, { query_embeddings: [q], n_results: k });

    // Normalize response
    const out = (res.ids?.[0] || []).map((id: string, i: number) => ({
      entity: id,
      name: res.metadatas?.[0]?.[i]?.name ?? null,
      company: res.metadatas?.[0]?.[i]?.company ?? null,
      distance: res.distances?.[0]?.[i] ?? null
    }));

    return new Response(JSON.stringify({ matches: out }), {
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500 });
  }
};

