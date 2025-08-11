import { env } from "$env/dynamic/private";

const BASE = env.CHROMA_URL;

function headers(extra: Record<string,string> = {}) {
  return {
    "content-type": "application/json",
    "x-fait-key": env.CHROMA_SHARED_KEY ?? "",
    ...extra
  };
}

async function request(path: string, init?: RequestInit) {
  const r = await fetch(`${BASE}${path}`, { ...(init || {}), headers: headers(init?.headers as any) });
  const body = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${body}`);
  try { return JSON.parse(body); } catch { return body; }
}

export async function listCollections() {
  return request(`/api/v1/collections`);
}

export async function getOrCreateCollectionByName(name: string) {
  const cols = await listCollections();
  let found = cols.find((c: any) => c.name === name);
  if (found) return found;
  return request(`/api/v1/collections`, { method: "POST", body: JSON.stringify({ name }) });
}

export async function upsertDocs(collectionId: string, payload: {
  ids: string[], documents: string[], metadatas?: any[], embeddings?: number[][]
}) {
  return request(`/api/v1/collections/${collectionId}/upsert`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function query(collectionId: string, payload: {
  query_embeddings: number[][];
  n_results?: number;
  where?: Record<string, any>;
}) {
  return request(`/api/v1/collections/${collectionId}/query`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}


// Debug/inspection: list items in a collection
export async function getDocs(collectionId: string, payload: {
  ids?: string[];
  where?: Record<string, any>;
  limit?: number;
  offset?: number;
  include?: string[]; // e.g., ["metadatas","documents","embeddings","uris"]
}) {
  return request(`/api/v1/collections/${collectionId}/get`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
