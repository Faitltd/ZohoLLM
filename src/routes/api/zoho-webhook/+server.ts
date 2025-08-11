import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { upsertToVectorDb } from '$lib/vectorDb';
import { ensureDirectoryEntry } from '$lib/directory';

export const config = { runtime: 'nodejs22.x' } as const;

export const POST: RequestHandler = async ({ request }) => {
  try {
    const payload = await request.json();

    // Accept explicit entity, or fall back to Parent_Id or id
    const entity = payload.entity ?? payload.Parent_Id ?? payload.id;
    if (!entity) {
      return json({ error: 'Bad Request', details: 'missing entity id' }, { status: 400 });
    }

    const result = await upsertToVectorDb({ entity, payload });
    // Best-effort directory indexing (log errors for visibility)
    try {
      await ensureDirectoryEntry(entity, payload);
    } catch (e: any) {
      console.error('directory upsert failed:', e?.message || String(e));
    }
    return json(result);
  } catch (e: any) {
    return json({ error: 'Internal server error', details: e?.message ?? String(e) }, { status: 500 });
  }
};
