import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { listEntities } from '$lib/vectorDb-vercel.js';

// Loosely import Chroma only when needed to avoid bundler warnings if not used
let ChromaClientCtor: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ChromaClientCtor = (await import('chromadb')).ChromaClient;
} catch {
  // ignore when not installed/used
}

export const GET: RequestHandler = async () => {
  const backend = (env.VECTOR_BACKEND || 'memory').toLowerCase();
  const entities = listEntities();

  const health: any = {
    vector_backend: backend,
    totals: entities.totals,
    entities_counts: {
      leads: entities.leads.length,
      deals: entities.deals.length,
      companies: entities.companies.length
    }
  };

  if (backend === 'chroma') {
    const base = (env.CHROMA_URL || 'http://localhost:8000').replace(/\/$/, '');
    health.chroma = { url: base, ok: false };
    try {
      // First try via official JS client (supports current server APIs)
      if (!ChromaClientCtor) throw new Error('chromadb client not available');
      const client = new ChromaClientCtor({ path: base });
      const col = await client.getOrCreateCollection({ name: 'crm_vectors' });
      let count: number | null = null;
      try {
        // @ts-ignore
        count = (await (col as any).count?.()) ?? null;
      } catch {}
      health.chroma = { url: base, ok: true, collection: 'crm_vectors', count };
    } catch (clientErr: any) {
      // Fallback to REST v2
      try {
        let res = await fetch(`${base}/api/v2/collections`);
        if (!res.ok) throw new Error(`Chroma v2 list failed: ${res.status}`);
        const listJson: any = await res.json();
        const collections: any[] = Array.isArray(listJson) ? listJson : (listJson?.collections || []);
        const has = collections.some((c: any) => c.name === 'crm_vectors');
        if (!has) {
          const createRes = await fetch(`${base}/api/v2/collections`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'crm_vectors' })
          });
          if (!createRes.ok) throw new Error(`Chroma v2 create failed: ${createRes.status}`);
        }
        const verifyRes = await fetch(`${base}/api/v2/collections`);
        const verifyJson: any = await verifyRes.json();
        const afterCollections: any[] = Array.isArray(verifyJson) ? verifyJson : (verifyJson?.collections || []);
        health.chroma = { url: base, ok: true, collection: 'crm_vectors', api_version: 'v2', collections_count: afterCollections.length };
      } catch (e: any) {
        health.chroma = { url: base, ok: false, error: e?.message || String(e) };
      }
    }
  }

  return json(health);
};

