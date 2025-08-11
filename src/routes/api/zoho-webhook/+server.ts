import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { inferPersonKey, guessModule } from '$lib/personKey';
import { upsertToVectorDb } from '$lib/vectorDb';
import { ensureDirectoryEntry } from '$lib/directory';

export const config = { runtime: 'nodejs22.x' } as const;

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const payload = body;
    const providedEntity = body.entity || body.Parent_Id || body.id;

    // 1) derive the person key
    const pk = inferPersonKey(payload);
    const entity = providedEntity || pk.entity;

    // 2) build a readable document for the per-person index
    const moduleName = guessModule(payload);
    const docLines = [
      pk.name && `Name: ${pk.name}`,
      pk.company && `Company: ${pk.company}`,
      pk.email && `Email: ${pk.email}`,
      pk.phone && `Phone: ${pk.phone}`,
      pk.address && `Address: ${pk.address}`
    ].filter(Boolean);
    const doc = docLines.join('\n') || JSON.stringify(payload, null, 2);

    // 3) upsert to the person's collection (safe collection name)
    await upsertToVectorDb({
      entity,
      payload: {
        ...payload,
        entity,
        module: moduleName,
        Email: pk.email,
        Phone: pk.phone,
        Address_Line: pk.address
      }
    });

    // 4) ensure/update the directory card
    try {
      await ensureDirectoryEntry(entity, {
        name: pk.name,
        company: pk.company,
        email: pk.email,
        phone: pk.phone,
        address: pk.address
      });
    } catch (e: any) {
      console.error('directory upsert failed:', e?.message || String(e));
    }

    return new Response(JSON.stringify({ ok: true, entity }), {
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'Internal server error', details: e?.message || String(e) }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
};
