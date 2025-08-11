export const config = { runtime: 'nodejs22.x' } as const;

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { env } from "$env/dynamic/private";
import { getOrCreateCollectionByName, query as httpQuery } from "$lib/chromaHttp";

async function embed(texts: string[]): Promise<number[][]> {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: texts })
  });
  if (!r.ok) throw new Error(`OpenAI embeddings failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return j.data.map((d: any) => d.embedding as number[]);
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { message, entity, topK = 5 } = await request.json();

    if (!entity || typeof entity !== "string") {
      return json({ error: "Missing 'entity' id" }, { status: 400 });
    }
    if (!message || typeof message !== "string") {
      return json({ error: "Missing 'message'" }, { status: 400 });
    }

    const col = await getOrCreateCollectionByName(`entity_${entity}`);
    const [q] = await embed([message]);
    const res = await httpQuery(col.id, { query_embeddings: [q], n_results: topK });

    return json({
      entity,
      topK,
      ids: res.ids?.[0] ?? [],
      distances: res.distances?.[0] ?? [],
      documents: res.documents?.[0] ?? [],
      metadatas: res.metadatas?.[0] ?? []
    });
  } catch (e: any) {
    return json({ message: "Internal Error", error: e?.message || String(e) }, { status: 500 });
  }
};
