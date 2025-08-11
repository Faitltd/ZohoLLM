import type { RequestHandler } from './$types';
import { getOrCreateCollectionByName, getDocs } from '$lib/chromaHttp';

export const config = { runtime: 'nodejs22.x' } as const;

export const GET: RequestHandler = async ({ url }) => {
  const limit = Number(url.searchParams.get('limit') || '10');
  try {
    const col = await getOrCreateCollectionByName('entity_directory');
    const res = await getDocs(col.id, {
      limit,
      include: ['metadatas','documents']
    });
    return new Response(JSON.stringify({
      collectionId: col.id,
      count: res.ids?.length ?? 0,
      ids: res.ids ?? [],
      metadatas: res.metadatas ?? [],
      documents: res.documents ?? []
    }), { headers: { 'content-type': 'application/json' }});
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500 });
  }
};

