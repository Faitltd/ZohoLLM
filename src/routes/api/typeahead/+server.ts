import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { getOrCreateCollectionByName, getDocs } from '$lib/chromaHttp';
import { toCollectionName } from '$lib/personKey';

export const config = { runtime: 'nodejs22.x' } as const;

function norm(s = '') { return s.toLowerCase().replace(/\s+/g, ' ').trim(); }
function digits(s = '') { return (s.match(/\d/g) ?? []).join(''); }

export const GET: RequestHandler = async ({ url, fetch }) => {
  const term = (url.searchParams.get('term') ?? '').trim();
  const limit = Number(url.searchParams.get('k') ?? 10);
  if (!term) return json({ term, matches: [] });

  try {
    const q = norm(term);
    const qd = digits(term);

    const col = await getOrCreateCollectionByName('entity_directory');
    const dump = await getDocs(col.id, { limit: 1000, include: ['metadatas','documents','ids'] });

    const rows = (dump.ids ?? []).map((id: string, i: number) => ({
      id,
      meta: dump.metadatas?.[i] ?? {},
      doc: dump.documents?.[i] ?? ''
    }));

    const scored = await Promise.all(rows.map(async r => {
      const m: any = r.meta || {};
      const name = norm(m.name || '');
      const email = norm(m.email || '');
      const company = norm(m.company || '');
      const address = norm(m.address_line || '');
      const phone = norm(m.phone || '');
      const pd = digits(m.phone || '');
      const pj = norm(m.phones_joined || '');

      let score = 0;
      const hits: string[] = [];

      if (name.includes(q)) { score += 10; hits.push('name'); }
      if (company.includes(q)) { score += 7; hits.push('company'); }
      if (email.includes(q)) { score += 9; hits.push('email'); }
      if (address.includes(q)) { score += 6; hits.push('address'); }
      if (phone.includes(q) || pj.includes(q)) { score += 6; hits.push('phone'); }
      if (qd && (pd.includes(qd) || pj.replace(/\D/g,'').includes(qd))) { score += 12; hits.push('digits'); }

      if (!score && q.length >= 3 && name.split(' ').some(tok => tok.startsWith(q))) { score += 5; hits.push('prefix'); }

      // Module counts are optional; do not fail the whole request if it errors
      const modules: Record<string, number> = {};
      if (m.entity) {
        try {
          const ecol = await getOrCreateCollectionByName(toCollectionName(m.entity));
          const edump = await getDocs(ecol.id, { limit: 300, include: ['metadatas'] });
          const md = edump.metadatas || [];
          for (const mm of md) {
            const mod = (mm?.module || mm?.Module || 'Record') as string;
            modules[mod] = (modules[mod] || 0) + 1;
          }
        } catch {}
      }

      return { score, hits, entity: m.entity, name: m.name || '', email: m.email || '', company: m.company || '', phone: m.phone || '', modules };
    }))
    .filter(r => r.score > 0)
    .sort((a,b) => b.score - a.score)
    .slice(0, limit);

    return json({ term, matches: scored });
  } catch (e) {
    // Fallback: proxy to search-entity results if any error occurs
    const proxied = await fetch(`/api/search-entity?term=${encodeURIComponent(term)}&k=${limit}`);
    const j = await proxied.json().catch(() => ({ matches: [] }));
    return json({ term, matches: j.matches || [] });
  }
};

