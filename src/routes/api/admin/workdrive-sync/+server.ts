import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { embed } from '$lib/vectorDb';
import { upsertDocs, getOrCreateCollectionByName } from '$lib/chromaHttp';
import { toCollectionName } from '$lib/personKey';
import { docFromWorkDriveFile } from '$lib/builders';

export const config = { runtime: 'nodejs22.x' } as const;

function chunk(text: string, size = 700, overlap = 80) {
  const words = (text || '').split(/\s+/);
  const out: string[] = [];
  if (!text || !text.trim()) return out;
  for (let i = 0; i < words.length; i += (size - overlap)) {
    out.push(words.slice(i, i + size).join(' '));
    if (i + size >= words.length) break;
  }
  return out;
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    // Expect: { entity, files: [{ Name, Path, Url, Size, ContentText }] }
    const body = await request.json();
    const key = request.headers.get('x-admin-key') || '';
    if (!env.ADMIN_SHARED_KEY || key !== env.ADMIN_SHARED_KEY) return json({ error: 'unauthorized' }, { status: 401 });

    const entity = (body?.entity || '').toString().trim();
    const files = Array.isArray(body?.files) ? body.files : [];
    if (!entity || !files.length) return json({ error: 'bad input' }, { status: 400 });

    const col = await getOrCreateCollectionByName(toCollectionName(entity));
    const ids: string[] = [];
    const docs: string[] = [];
    const metas: any[] = [];
    const embs: number[][] = [];

    for (const f of files) {
      const chunks = chunk(f.ContentText || '');
      let idx = 0;
      for (const c of chunks) {
        const id = `${f.Url || f.Path}#${idx++}`;
        const doc = docFromWorkDriveFile(f, c);
        const [vec] = await embed([doc]);
        ids.push(id);
        docs.push(doc);
        metas.push({ module: 'WorkDrive', id: f.Url || f.Path, path: f.Path, url: f.Url, name: f.Name, size: f.Size });
        embs.push(vec);
      }
    }

    if (ids.length) await upsertDocs(col.id, { ids, documents: docs, metadatas: metas, embeddings: embs });
    return json({ ok: true, upserted: ids.length });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, { status: 500 });
  }
};

