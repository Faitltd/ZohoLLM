export const config = { runtime: "nodejs22.x" } as const;

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { env } from "$env/dynamic/private";

export const GET: RequestHandler = async () => {
  const configured = (env.VECTOR_BACKEND || 'auto').toLowerCase();
  const health: any = { configured_backend: configured, active_backend: configured };

  if (configured !== 'memory') {
    try {
      const url = `${env.CHROMA_URL}/api/v1/collections`;
      const r = await fetch(url, {
        headers: { "x-fait-key": env.CHROMA_SHARED_KEY ?? "" }
      });
      const text = await r.text();
      if (!r.ok) throw new Error(`chroma ${r.status}: ${text}`);
      const cols = JSON.parse(text);
      health.active_backend = 'chroma';
      health.chroma = { ok: true, url: env.CHROMA_URL, collections_count: cols.length };
    } catch (e: any) {
      health.active_backend = 'memory';
      health.chroma = { ok: false, error: e?.message || String(e) };
    }
  } else {
    health.active_backend = 'memory';
    health.chroma = { ok: false, reason: 'Configured to memory' };
  }

  return json(health);
};
