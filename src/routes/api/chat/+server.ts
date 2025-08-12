export const config = { runtime: 'nodejs22.x' } as const;

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { env } from "$env/dynamic/private";
aimport { toCollectionName } from "$lib/personKey";
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

async function llmSummarize(question: string, docs: string[], metas: any[]) {
  const system = `You are an assistant for a residential renovation company.
Given the user's question and retrieved CRM context (Deals, Contacts, Notes, Tasks, Calls, WorkDrive pointers),
produce a concise, accurate answer. If asked for an overview, structure it with sections:
Project Overview, Scope of Work by Trade, Financial Summary, Next Steps.
Only use provided context. If you lack details, say what's missing.`;

  const context = docs.map((d, i) => {
    const m = metas?.[i] ?? {};
    return `---\nDOC ${i + 1}\n${d}\nMETA: ${JSON.stringify(m)}\n`;
  }).join('\n');

  const prompt = `Question:\n${question}\n\nContext:\n${context}\n\nAnswer:`;

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt }
      ]
    })
  });
  if (!r.ok) throw new Error(`LLM failed: ${r.status}`);
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? "";
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

    const collectionName = toCollectionName(entity);
    const col = await getOrCreateCollectionByName(collectionName);
    const [q] = await embed([message]);
    const res = await httpQuery(col.id, { query_embeddings: [q], n_results: topK });

    const docs = res.documents?.[0] ?? [];
    const metas = res.metadatas?.[0] ?? [];
    const answer = await llmSummarize(message, docs, metas);

    return json({
      entity,
      topK,
      answer,
      ids: res.ids?.[0] ?? [],
      distances: res.distances?.[0] ?? [],
      documents: docs,
      metadatas: metas
    });
  } catch (e: any) {
    return json({ message: "Internal Error", error: e?.message || String(e) }, { status: 500 });
  }
};
