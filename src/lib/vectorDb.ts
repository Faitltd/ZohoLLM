import { ChromaClient } from "chromadb";
import { env } from "$env/dynamic/private";

let chromaClient: ChromaClient | null = null;

export function getActiveVectorBackend(): "auto" | "memory" | "chroma" {
  return (env.VECTOR_BACKEND || "auto").toLowerCase() as any;
}

export function getChroma(): ChromaClient {
  if (!chromaClient) {
    chromaClient = new ChromaClient({
      path: env.CHROMA_URL!,
      fetchOptions: { headers: { "x-fait-key": env.CHROMA_SHARED_KEY ?? "" } }
    });
  }
  return chromaClient;
}


async function embed(texts: string[]): Promise<number[][]> {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: texts
    })
  });
  if (!r.ok) throw new Error(`OpenAI embeddings failed: ${r.status}`);
  const j = await r.json();
  return j.data.map((d: any) => d.embedding as number[]);
}

function collectionName(entity: string) {
  return `entity_${entity}`;
}

export async function queryVectorDb(params: { entity: string; query: string; topK?: number }) {
  const { entity, query, topK = 5 } = params;
  const client = getChroma();
  const name = collectionName(entity);

  // Create or get collection; if it doesn't exist and cannot be created, return empty
  const col = await client.getOrCreateCollection({ name });

  const [q] = await embed([query]);
  const res = await col.query({ query_embeddings: [q], nResults: topK });
  return {
    ids: res.ids?.[0] ?? [],
    distances: res.distances?.[0] ?? [],
    documents: res.documents?.[0] ?? [],
    metadatas: res.metadatas?.[0] ?? []
  };
}

// --- add below existing code in src/lib/vectorDb.ts ---

export async function upsertToVectorDb(payload: any) {
  // Decide the owning entity (Notes use Parent_Id)
  const entity =
    payload?.Parent_Id ||
    payload?.entity ||
    payload?.id ||
    payload?.Lead_Id ||
    payload?.Account_Id;

  if (!entity) {
    throw new Error("Cannot determine entity id for upsert");
  }

  // Build a human-readable doc string from common Zoho fields
  const chunks: string[] = [];
  if (payload.Note_Title || payload.Note_Content) {
    if (payload.Note_Title) chunks.push(`Title: ${payload.Note_Title}`);
    if (payload.Note_Content) chunks.push(`Content: ${payload.Note_Content}`);
  } else {
    // Lead/Deal/Account style
    const fields = [
      ["Lead_Name", payload.Lead_Name],
      ["Company", payload.Company],
      ["Lead_Status", payload.Lead_Status],
      ["Email", payload.Email],
      ["Phone", payload.Phone],
      ["Description", payload.Description]
    ];
    for (const [k, v] of fields) if (v) chunks.push(`${k}: ${v}`);
    // fallback: include all keys if we had nothing
    if (chunks.length === 0) {
      chunks.push(
        Object.entries(payload)
          .map(([k, v]) => `${k}: ${v as string}`)
          .join("\n")
      );
    }
  }
  const doc = chunks.join("\n").trim();
  if (!doc) throw new Error("Nothing to upsert (empty document)");

  // Get/create collection for the entity
  const client = getChroma(); // your existing helper that includes the x-fait-key header
  const collection = await client.getOrCreateCollection({
    name: `entity_${entity}`
  });

  // Embed and upsert
  const [embedding] = await embed([doc]); // your existing OpenAI embed helper
  const id = String(payload.id ?? `${Date.now()}`);

  await collection.upsert({
    ids: [id],
    documents: [doc],
    metadatas: [payload],
    embeddings: [embedding]
  });

  return { ok: true, entity, id };
}

