import { env } from '$env/dynamic/private';
import { getOrCreateCollectionByName, upsertDocs } from '$lib/chromaHttp';
import { toCollectionName } from '$lib/personKey';


function digitsOnly(s: string) {
  return (s || '').replace(/\D+/g, '');
}

// Helper to normalize string tokens
function toTokens(...vals: Array<string | undefined>) {
  return [...new Set(
    vals
      .map(v => (v ?? '').toString().trim().toLowerCase())
      .filter(Boolean)
  )];
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
  // Extract name variants
  const first = payload.First_Name || payload.Client_First_Name || '';
  const last  = payload.Last_Name  || payload.Client_Last_Name  || '';
  const partnerFirst = payload.Partner_First_Name || '';
  const partnerLast  = payload.Partner_Last_Name  || '';
  const contactName  = payload.Contact_Name || payload.Lead_Name || '';
  const dealName     = payload.Deal_Name || '';
  const accountName  = payload.Account_Name || payload.Company || '';

  const primaryName = (
    payload.name ||
    contactName ||
    [first, last].filter(Boolean).join(' ') ||
    [partnerFirst, partnerLast].filter(Boolean).join(' ') ||
    dealName ||
    accountName ||
    ''
  ).toString().trim();

  // Contact info
  const email = (payload.Email || payload.email || '').toString().trim().toLowerCase();
  const phone = (payload.Phone || payload.phone || '').toString().trim();
  // Prefer composed address_line if provided; otherwise assemble from parts
  const address_line = (
    payload.address_line ||
    [
      payload.Mailing_Street || payload.Street || payload.Address,
      payload.Mailing_City || payload.City,
      payload.Mailing_State || payload.State,
      payload.Mailing_Zip || payload.Zip || payload.Zip_Code || payload.Postal_Code,
    ].filter(Boolean).join(', ')
  ).toString().trim();

  // Aliases and phone variants
  const alt_names = toTokens(
    primaryName,
    contactName,
    [first, last].filter(Boolean).join(' '),
    [partnerFirst, partnerLast].filter(Boolean).join(' '),
    dealName,
    accountName
  );
  const phone_digits = digitsOnly(phone);
  const phones_joined = toTokens(phone, phone_digits).join(' ');

  // Build searchable document text
  const doc = [
    primaryName ? `name: ${primaryName}` : '',
    accountName ? `company: ${accountName}` : '',
    email ? `email: ${email}` : '',
    address_line ? `address: ${address_line}` : '',
    alt_names.length ? `aliases: ${alt_names.join(', ')}` : ''
  ].filter(Boolean).join('\n');

  // Important: keep the directory collection name stable so readers see new entries
  const col = await getOrCreateCollectionByName('entity_directory');
  const [embedding] = await embed([doc]);

  await upsertDocs(col.id, {
    ids: [entity],
    documents: [doc],
    metadatas: [{
      entity,
      name: primaryName || null,
      company: accountName || null,
      email: email || null,
      address_line: address_line || null,
      phone: phone || null,
      phone_digits: phone_digits || null,
      phones_joined: phones_joined || null,
      alt_names
    }],
    embeddings: [embedding]
  });
}

