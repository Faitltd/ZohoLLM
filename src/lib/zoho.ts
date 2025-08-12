import { env } from '$env/dynamic/private';

/**
 * Minimal Zoho OAuth token helper using a long-lived refresh token.
 * Set env: ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN,
 * ZOHO_ACCOUNTS_BASE (default: https://accounts.zoho.com), ZOHO_API_BASE (default: https://www.zohoapis.com)
 */
export async function getZohoAccessToken(): Promise<string> {
  const accounts = env.ZOHO_ACCOUNTS_BASE || 'https://accounts.zoho.com';
  const url = `${accounts}/oauth/v2/token`;
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: String(env.ZOHO_CLIENT_ID || ''),
    client_secret: String(env.ZOHO_CLIENT_SECRET || ''),
    refresh_token: String(env.ZOHO_REFRESH_TOKEN || '')
  });
  const r = await fetch(`${url}?${params.toString()}`, { method: 'POST' });
  if (!r.ok) throw new Error(`Zoho token error: ${r.status} ${await r.text()}`);
  const j = await r.json();
  const token = j.access_token as string;
  if (!token) throw new Error('Zoho token missing access_token');
  return token;
}

export type ZohoListOpts = {
  module: string;
  page?: number;
  per_page?: number;
  modified_since_iso?: string; // optional ISO for If-Modified-Since
  fields?: string[];
};

export async function listZohoRecords(opts: ZohoListOpts) {
  const api = env.ZOHO_API_BASE || 'https://www.zohoapis.com';
  const token = await getZohoAccessToken();
  const url = new URL(`${api}/crm/v3/${encodeURIComponent(opts.module)}`);
  if (opts.page) url.searchParams.set('page', String(opts.page));
  url.searchParams.set('per_page', String(opts.per_page ?? 200));
  if (opts.fields?.length) url.searchParams.set('fields', opts.fields.join(','));

  const headers: Record<string, string> = {
    Authorization: `Zoho-oauthtoken ${token}`,
    'Content-Type': 'application/json'
  };
  if (opts.modified_since_iso) headers['If-Modified-Since'] = opts.modified_since_iso;

  const r = await fetch(url.toString(), { headers });
  if (r.status === 204) return { data: [], info: { more_records: false } };
  if (!r.ok) throw new Error(`Zoho list ${opts.module} ${r.status} ${await r.text()}`);
  const j = await r.json();
  const data = j.data || [];
  const info = j.info || { more_records: false };
  return { data, info };
}

