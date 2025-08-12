import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { listZohoRecords } from '$lib/zoho';
import { upsertToVectorDb } from '$lib/vectorDb';
import { inferPersonKey, guessModule } from '$lib/personKey';
import { ensureDirectoryEntry } from '$lib/directory';
import { buildDoc } from '$lib/builders';

export const config = { runtime: 'nodejs22.x' } as const;

async function syncModule(moduleName: string, limitPages = 3) {
  let page = 1;
  let total = 0;
  while (page <= limitPages) {
    const { data, info } = await listZohoRecords({ module: moduleName, page, per_page: 200 });
    for (const rec of data) {
      try {
        const payload = { ...rec, module: moduleName };
        const pk = inferPersonKey(payload);
        const entity = pk.entity;
        const doc = buildDoc(moduleName, payload);
        await upsertToVectorDb({ entity, payload, doc });
        await ensureDirectoryEntry(entity, { ...payload, name: pk.name, company: pk.company, email: pk.email, phone: pk.phone, address_line: pk.address });
        total++;
      } catch (e) {
        console.error('sync item failed', moduleName, e);
      }
    }
    if (!info?.more_records) break;
    page++;
  }
  return total;
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const key = request.headers.get('x-admin-key') || '';
    if (!env.ADMIN_SHARED_KEY || key !== env.ADMIN_SHARED_KEY) return json({ error: 'unauthorized' }, { status: 401 });

    const modules = (await request.json()?.modules) || ['Leads', 'Contacts', 'Deals', 'Notes', 'Tasks', 'Calls', 'Projects'];
    const results: Record<string, number> = {};
    for (const m of modules) {
      results[m] = await syncModule(m, 5);
    }

    return json({ ok: true, results });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, { status: 500 });
  }
};

