import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export const config = { runtime: 'nodejs22.x' } as const;

async function fetchWorkDriveFiles(folderId: string, token: string) {
  // Placeholder: implement real WorkDrive API call here
  // Return shape: [{ Name, Path, Url, Size, ContentText? }, ...]
  const url = `https://www.zohoapis.com/workdrive/api/v1/folders/${encodeURIComponent(folderId)}/files`;
  const r = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
  if (!r.ok) throw new Error(`WorkDrive list failed: ${r.status}`);
  const j = await r.json();
  // Map to our expected shape; this depends on actual API response structure
  const files = (j?.data || []).map((f: any) => ({
    Name: f.name,
    Path: f.path || f.name,
    Url: f.url || f.previewUrl || f.permalink || '',
    Size: f.size,
    ContentText: '' // extraction will fill later
  }));
  return files;
}

async function extractTextForFile(file: any, token: string) {
  // Simplified: if it's a text/pdf/doc, call preview/content endpoint or use external extractor
  try {
    const name = (file.Name || '').toLowerCase();
    if (name.endsWith('.txt')) {
      const r = await fetch(file.Url);
      return await r.text();
    }
    if (name.endsWith('.pdf')) {
      // Placeholder: in real impl, call a PDF-to-text microservice
      return '';
    }
    if (name.endsWith('.doc') || name.endsWith('.docx')) {
      return '';
    }
  } catch {
    // ignore
  }
  return '';
}

export const POST: RequestHandler = async ({ request, fetch }) => {
  try {
    const key = request.headers.get('x-admin-key') || '';
    if (!env.ADMIN_SHARED_KEY || key !== env.ADMIN_SHARED_KEY) return json({ error: 'unauthorized' }, { status: 401 });

    const body = await request.json();
    const entity = (body?.entity || '').toString().trim();
    const folderId = (body?.folderId || '').toString().trim();
    if (!entity || !folderId) return json({ error: 'bad input' }, { status: 400 });

    const token = env.ZOHO_OAUTH_TOKEN || '';
    if (!token) return json({ error: 'missing token' }, { status: 500 });

    const files = await fetchWorkDriveFiles(folderId, token);

    const processed: any[] = [];
    const errors: string[] = [];

    for (const f of files) {
      try {
        const text = await extractTextForFile(f, token);
        processed.push({ ...f, ContentText: text });
      } catch (e: any) {
        errors.push(`extract failed ${f.Name}: ${e?.message || String(e)}`);
      }
    }

    // Call our sync endpoint
    const syncRes = await fetch('/api/admin/workdrive-sync', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-admin-key': env.ADMIN_SHARED_KEY || ''
      },
      body: JSON.stringify({ entity, files: processed })
    });
    if (!syncRes.ok) {
      errors.push(`sync failed: ${syncRes.status}`);
    }

    return json({ ok: true, processed: processed.length, errors });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, { status: 500 });
  }
};

