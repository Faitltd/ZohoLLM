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

