import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { ChromaClient } from 'chromadb';

export const GET: RequestHandler = async () => {
  const backend = (env.VECTOR_BACKEND || 'chroma').toLowerCase();
  const health: any = {
    vector_backend: backend
  };

  if (backend === 'chroma') {
    try {
      const path = env.CHROMA_URL || 'http://localhost:8000';
      const client = new ChromaClient({ path });
      const collections = await client.listCollections();
      health.chroma = { ok: true, url: path, collections_count: collections.length };
    } catch (e: any) {
      health.chroma = { ok: false, error: e?.message || String(e) };
    }
  }

  return json(health);
};

