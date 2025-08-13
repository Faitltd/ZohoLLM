import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { listZohoRecords } from '$lib/zoho';
import { upsertToVectorDb } from '$lib/vectorDb';
import { inferPersonKey, guessModule } from '$lib/personKey';
import { ensureDirectoryEntry } from '$lib/directory';
import { buildDoc } from '$lib/builders';

export const config = { runtime: 'nodejs22.x' } as const;

const FIELDS: Record<string, string[]> = {
  Leads: ['id','First_Name','Last_Name','Lead_Name','Company','Lead_Status','Email','Phone','Street','City','State','Zip_Code','Description'],
  Contacts: ['id','First_Name','Last_Name','Full_Name','Contact_Name','Email','Phone','Mobile','Mailing_Street','Mailing_City','Mailing_State','Mailing_Zip'],
  Deals: ['id','Deal_Name','Stage','Amount','Probability','Next_Step','Email','Phone','Account_Name','Street','City','State','Zip_Code','Description'],
  Notes: ['id','Note_Title','Note_Content','Parent_Id'],
  Tasks: ['id','Subject','Status','Due_Date','Description'],
  Calls: ['id','Subject','Call_Type','Call_Purpose','Call_Result','Call_Duration','Phone'],
  Meetings: ['id','Subject','Start_Time','End_Time','Location','Description']
};

async function syncModule(moduleName: string, limitPages = 1, perPage = 40) {
  let page = 1;
  let total = 0;
  while (page <= limitPages) {
    let data: any[] = [];
    let info: any = { more_records: false };
    try {
      const r = await listZohoRecords({ module: moduleName, page, per_page: perPage, fields: FIELDS[moduleName] || ['id'] });
      data = r.data; info = r.info;
    } catch (e) {
      console.error('listZohoRecords failed', moduleName, e);
      break;
    }
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

    const body = await request.json().catch(() => ({} as any));
    const modules = (body?.modules as string[]) || ['Contacts', 'Deals'];
    const pages = Number(body?.pages ?? 1);
    const perPage = Number(body?.perPage ?? 40);
    const results: Record<string, number> = {};
    for (const m of modules) {
      results[m] = await syncModule(m, pages, perPage);
    }

    return json({ ok: true, results });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, { status: 500 });
  }
};

