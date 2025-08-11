// src/routes/api/search-entity/+server.ts
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { getOrCreateCollectionByName, query as chromaQuery, getDocs } from '$lib/chromaHttp';

export const config = { runtime: 'nodejs22.x' } as const;

/** quick normalizers for substring fallback */
function normPhoneDigits(s: string) {
  return (s || '').replace(/\D+/g, '');
}
function norm(s: string) {
  return (s || '').toLowerCase().trim();
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
    const term = url.searchParams.get('term') ?? url.searchParams.get('name') ?? '';
    const topK = Number(url.searchParams.get('k') ?? 10);
    const q = term.trim();
    if (!q) return new Response(JSON.stringify({ matches: [] }), { headers: { 'content-type': 'application/json' } });

    // 1) Vector search over the directory card text
    const dir = await getOrCreateCollectionByName('entity_directory');
    const vec = await embed(q);
    const vres = await chromaQuery(dir.id, { query_embeddings: [vec], n_results: Math.max(10, topK) });

    type Match = { entity: string; name: string; company?: string; email?: string; phone?: string; distance?: number };
    const byEntity = new Map<string, Match>();

    const ids = vres.ids?.[0] ?? [];
    const docs = vres.documents?.[0] ?? [];
    const metas = vres.metadatas?.[0] ?? [];
    const dists = vres.distances?.[0] ?? [];
    for (let i = 0; i < ids.length; i++) {
      const m = metas[i] || {};
      const item: Match = {
        entity: m.entity ?? ids[i],
        name: m.name ?? '',
        company: m.company,
        email: m.email,
        phone: m.phone,
        distance: dists[i]
      };
      if (!byEntity.has(item.entity)) byEntity.set(item.entity, item);
    }

    // 2) Substring fallback for phone/address/name tokens
    //    (small-scale: fetch up to a few hundred cards and filter in memory)
    const digitsQ = normPhoneDigits(q);
    const qnorm = norm(q);
    if (digitsQ.length >= 7 || qnorm.length >= 2) {
      const dump = await getDocs(dir.id, { limit: 500 });
      const dIds = dump.ids ?? [];
      const dDocs = dump.documents ?? [];
      const dMeta = dump.metadatas ?? [];

      for (let i = 0; i < dIds.length; i++) {
        const m = (dMeta[i] || {}) as any;
        const hay = [
          norm(m.name),
          norm(m.company),
          norm(m.email),
          norm(m.phones_joined),
          norm(m.address_line),
          norm(dDocs[i] || '')
        ].join(' | ');

        const hasTextHit = qnorm && hay.includes(qnorm);
        const hasPhoneHit = digitsQ && (m.phone_digits || '').includes(digitsQ);
        if (hasTextHit || hasPhoneHit) {
          const entity = m.entity ?? dIds[i];
          if (!byEntity.has(entity)) {
            byEntity.set(entity, {
              entity,
              name: m.name ?? '',
              company: m.company,
              email: m.email,
              phone: m.phone,
              distance: undefined
            });
          }
        }
      }
    }

    // Sort: vector distance first, then name contains, then company contains
    const all = Array.from(byEntity.values());
    all.sort((a, b) => {
      const da = a.distance ?? 9e9;
      const db = b.distance ?? 9e9;
      if (da !== db) return da - db;
      const an = (a.name || '').toLowerCase();
      const bn = (b.name || '').toLowerCase();
      const ql = q.toLowerCase();
      const anHit = an.includes(ql) ? 0 : 1;
      const bnHit = bn.includes(ql) ? 0 : 1;
      if (anHit !== bnHit) return anHit - bnHit;
      return (a.company || '').localeCompare(b.company || '');
    });

    return new Response(JSON.stringify({ term: q, matches: all.slice(0, topK) }), {
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
};

