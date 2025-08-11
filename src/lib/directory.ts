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
  const name = buildDisplayName(payload)?.trim();
  if (!name) return; // nothing to index

  const doc = [
    `name: ${name}`,
    payload?.Company ? `company: ${payload.Company}` : '',
    payload?.Email ? `email: ${payload.Email}` : ''
  ].filter(Boolean).join('\n');

  const col = await getOrCreateCollectionByName('entity_directory');
  const [embedding] = await embed([doc]);

  // Use entity id as the record id so re-seeding updates the same entry
  await upsertDocs(col.id, {
    ids: [entity],
    documents: [doc],
    metadatas: [{ entity, name, company: payload?.Company ?? null, email: payload?.Email ?? null }],
    embeddings: [embedding]
  });
}

