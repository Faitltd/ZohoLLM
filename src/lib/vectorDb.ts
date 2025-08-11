import { env } from "$env/dynamic/private";
import { getOrCreateCollectionByName, upsertDocs, query as queryCollection } from "$lib/chromaHttp";

/** Which backend is active (memory|chroma|auto) */
export function getActiveVectorBackend(): "memory" | "chroma" | "auto" {
  const v = (env.VECTOR_BACKEND || "auto").toLowerCase();
  if (v === "memory" || v === "chroma") return v as any;
  return "auto";
}

/** OpenAI Embeddings helper */
async function embed(texts: string[]): Promise<number[][]> {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: texts })
  });
  if (!r.ok) throw new Error(`OpenAI embeddings failed: ${r.status}`);
  const j = await r.json();
  return j.data.map((d: any) => d.embedding as number[]);
}

/** Upsert one payload into the entity_<id> collection */
export async function upsertToVectorDb(args: { entity: string; payload: any }) {
  const { entity, payload } = args;
  if (!entity) throw new Error("missing entity id");
  if (!payload) throw new Error("missing payload");

  // Build a readable doc string from known fields (Notes vs Lead/Deal/Account)
  const chunks: string[] = [];
  if (payload.Note_Title || payload.Note_Content) {
    if (payload.Note_Title) chunks.push(`Title: ${payload.Note_Title}`);
    if (payload.Note_Content) chunks.push(`Content: ${payload.Note_Content}`);
  } else {
    const fields: [string, any][] = [
      ["Lead_Name", payload.Lead_Name],
      ["Company", payload.Company],
      ["Lead_Status", payload.Lead_Status],
      ["Email", payload.Email],
      ["Phone", payload.Phone],
      ["Description", payload.Description]
    ];
    for (const [k, v] of fields) if (v) chunks.push(`${k}: ${v}`);
    if (chunks.length === 0) {
      chunks.push(
        Object.entries(payload)
          .map(([k, v]) => `${k}: ${String(v)}`)
          .join("\n")
      );
    }
  }
  const doc = chunks.join("\n").trim();
  if (!doc) throw new Error("Nothing to upsert (empty document)");

  // Create/get collection and upsert via HTTP helper
  const col = await getOrCreateCollectionByName(`entity_${entity}`);
  const [embedding] = await embed([doc]);
  const id = String(payload.id ?? `${Date.now()}`);

  await upsertDocs(col.id, {
    ids: [id],
    documents: [doc],
    metadatas: [payload],
    embeddings: [embedding]
  });

  return { ok: true, entity, id };
}

/** Query topK for an entity collection */
export async function queryVectorDb(params: { entity: string; query: string; topK?: number }) {
  const { entity, query, topK = 5 } = params;
  const col = await getOrCreateCollectionByName(`entity_${entity}`);
  const [q] = await embed([query]);
  return queryCollection(col.id, { query_embeddings: [q], n_results: topK });
}
