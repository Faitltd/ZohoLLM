export const runtime = "nodejs";
import { env } from "$env/dynamic/private";

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { ChromaClient } from "chromadb";
import { getActiveVectorBackend } from "$lib/vectorDb";

export const GET: RequestHandler = async () => {
  const configured = (env.VECTOR_BACKEND || "auto").toLowerCase();
  const active = getActiveVectorBackend();
  const health: any = { configured_backend: configured, active_backend: active };

  if (configured !== "memory") {
    try {
      const path = env.CHROMA_URL!;
      const client = new ChromaClient({
        path,
        fetchOptions: { headers: { "x-fait-key": env.CHROMA_SHARED_KEY ?? "" } }
      });
      const collections = await client.listCollections();
      health.chroma = { ok: true, url: path, collections_count: collections.length };
    } catch (e: any) {
      health.chroma = { ok: false, error: e?.message || String(e) };
    }
  } else {
    health.chroma = { ok: false, reason: "Configured to memory" };
  }

  return json(health);
};

