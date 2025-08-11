import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getOrCreateCollectionByName, query as httpQuery } from '$lib/chromaHttp';

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
  if (!r.ok) throw new Error(`OpenAI embeddings failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return j.data.map((d: any) => d.embedding as number[]);
}

export const GET: RequestHandler = async ({ url }) => {
  try {
    const entity = url.searchParams.get('entity') || 'lead_123';
    const q = url.searchParams.get('q') || 'What do we know about this entity?';
    const topK = Number(url.searchParams.get('k') || 5);

    const col = await getOrCreateCollectionByName(`entity_${entity}`);
    const [vec] = await embed([q]);
    const res = await httpQuery(col.id, { query_embeddings: [vec], n_results: topK });

    return json({
      ok: true,
      entity,
      collection: { id: col.id, name: col.name },
      n: res.ids?.[0]?.length || 0,
      ids: res.ids?.[0] || [],
      distances: res.distances?.[0] || [],
      docs: (res.documents?.[0] || []).map((d: string) => d.slice(0, 160))
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
};
