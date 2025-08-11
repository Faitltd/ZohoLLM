import { env } from '$env/dynamic/private';
import { getOrCreateCollectionByName, upsertDocs } from '$lib/chromaHttp';

/** Build a searchable name string from typical CRM fields */
function buildDisplayName(payload: any) {
  const parts = [
    payload?.Lead_Name,
    payload?.Account_Name,
    payload?.Company,
    payload?.Full_Name,
    payload?.First_Name && payload?.Last_Name ? `${payload.First_Name} ${payload.Last_Name}` : null,
    payload?.Email
  ].filter(Boolean);
  const unique = Array.from(new Set(parts));
  return unique.join(' • ');
}

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

/** Upsert/refresh an entity's card in a global index collection (entity_directory) */
export async function ensureDirectoryEntry(entity: string, payload: any) {
  // Accept payloads shaped either like Zoho (Lead_Name/Company/Email...) or already normalized
  const pk = {
    name: (payload.name ?? buildDisplayName(payload) ?? '').trim(),
    company: payload.company ?? payload.Company ?? null,
    email: payload.email ?? payload.Email ?? null,
    phone: payload.phone ?? payload.Phone ?? null,
    phoneDigits: (payload.phoneDigits ?? '').toString(),
    address: payload.address ?? payload.Address_Line ?? null,
    phones_joined: [payload.Phone, payload.Mobile, payload.Work_Phone].filter(Boolean).join(', ')
  } as any;

  if (!pk.name && !pk.company && !pk.email && !pk.phone && !pk.address) return; // nothing to index

  const doc = [
    pk.name && `name: ${pk.name}`,
    pk.company && `company: ${pk.company}`,
    pk.email && `email: ${pk.email}`,
    pk.phone && `phone: ${pk.phone}`,
    pk.address && `address: ${pk.address}`
  ].filter(Boolean).join('\n');

  const col = await getOrCreateCollectionByName('entity_directory');
  const [embedding] = await embed([doc]);

  const meta = {
    entity,
    name: pk.name ?? null,
    company: pk.company ?? null,
    email: pk.email ?? null,
    phone: pk.phone ?? null,
    phones_joined: pk.phones_joined ?? null,
    phone_digits: pk.phoneDigits ?? null,
    address_line: pk.address ?? null
  };

  // Use entity id as the record id so re-seeding updates the same entry
  await upsertDocs(col.id, {
    ids: [entity],
    documents: [doc],
    metadatas: [meta],
    embeddings: [embedding]
  });
}

