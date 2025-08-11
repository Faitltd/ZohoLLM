import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

export const config = { runtime: 'nodejs22.x' } as const;

export const GET: RequestHandler = async ({ request }) => {
  const key = request.headers.get('x-fait-key') ?? '';
  if (!env.CHROMA_SHARED_KEY || key !== env.CHROMA_SHARED_KEY) {
    return new Response('Unauthorized', { status: 401 });
  }

  const url = `${env.CHROMA_URL}/api/v1/collections`;
  let status = 0, body = '';
  try {
    const r = await fetch(url, { headers: { 'x-fait-key': env.CHROMA_SHARED_KEY } });
    status = r.status;
    body = await r.text();
  } catch (e: any) {
    body = e?.message || String(e);
  }
  return new Response(JSON.stringify({ url, status, body }), {
    headers: { 'content-type': 'application/json' }
  });
};

