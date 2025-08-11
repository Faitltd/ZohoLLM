export const config = { runtime: 'nodejs22.x' } as const;

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { env } from "$env/dynamic/private";
import { getOrCreateCollectionByName, query as httpQuery } from "$lib/chromaHttp";
import { toCollectionName } from "$lib/personKey";

/** Reuse OpenAI embeddings (same model we used everywhere) */
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

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { entity, question, topK = 6 } = await request.json();

    if (!entity || typeof entity !== "string")
      return json({ error: "Missing 'entity'" }, { status: 400 });
    if (!question || typeof question !== "string")
      return json({ error: "Missing 'question'" }, { status: 400 });

    // Same collection convention we use elsewhere (safe collection name)
    const collectionName = toCollectionName(entity);
    const col = await getOrCreateCollectionByName(collectionName);

    // Retrieve relevant snippets
    const [q] = await embed([question]);
    const res = await httpQuery(col.id, { query_embeddings: [q], n_results: topK });
    const docs: string[] = res.documents?.[0] ?? [];
    const ids: string[] = res.ids?.[0] ?? [];
    const metas: any[] = res.metadatas?.[0] ?? [];

    // Build grounded prompt
    const context = docs
      .map((d, i) => `# Source ${i + 1}\nID: ${ids[i] ?? ""}\n${d}`)
      .join("\n\n");

    const system =
      "You are a CRM assistant. Answer ONLY using the provided Context. " +
      "If the answer is not in Context, say you don't have that information and suggest what to capture next. " +
      "Be concise. Use numbers and bullet points when helpful.";

    // Call OpenAI for the final answer
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 500,
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Question: ${question}\n\nContext:\n${context}` }
        ]
      })
    });

    if (!r.ok) {
      return json({ error: "OpenAI error", detail: await r.text() }, { status: 500 });
    }
    const data = await r.json();
    const answer = data.choices?.[0]?.message?.content ?? "";

    const sources = docs.map((text, i) => ({
      id: ids[i] ?? "",
      meta: metas[i] ?? {},
      text
    }));

    return json({ entity, question, answer, sources });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, { status: 500 });
  }
};

