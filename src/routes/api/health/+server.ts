export const config = { runtime: "nodejs22.x" } as const;

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { env } from "$env/dynamic/private";

export const GET: RequestHandler = async () => {
  const configured = (env.VECTOR_BACKEND || "auto").toLowerCase();
  const health: any = { configured_backend: configured, active_backend: configured };

  try {
    const url = `${env.CHROMA_URL}/api/v1/collections`;
    const r = await fetch(url, { headers: { "x-fait-key": env.CHROMA_SHARED_KEY ?? "" } });
    const body = await r.text();
    health.chroma = { ok: r.ok, status: r.status, url, body };
    if (configured === "auto") health.active_backend = r.ok ? "chroma" : "memory";
  } catch (e: any) {
    health.chroma = { ok: false, error: e?.message || String(e) };
    if (configured === "auto") health.active_backend = "memory";
  }

  return json(health);
};
