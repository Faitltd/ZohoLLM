import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

import { embed } from '$lib/vectorDb';
import { toCollectionName } from '$lib/personKey';
import { getOrCreateCollectionByName, query as httpQuery, getDocs } from '$lib/chromaHttp';
import { rewriteQuestion } from '$lib/assist';

// quick lexical score
function contains(hay: string, needle: string) {
  return hay.toLowerCase().includes(needle.toLowerCase());
}

// map user intents to fields
const FIELD_SYNONYMS: Record<string, string[]> = {
  Amount: ['amount','contract','price','total','value','budget','quote'],
  Stage: ['stage','status','pipeline'],
  Address: ['address','location','street','zip','city'],
  Email: ['email','e-mail','mail'],
  Phone: ['phone','mobile','cell','number'],
  WorkDrive: ['workdrive','folder','file','document','link']
};

function tryStructuredAnswer(q: string, metas: any[]) {
  const ql = q.toLowerCase();
  const wants: string[] = [];
  for (const [field, syns] of Object.entries(FIELD_SYNONYMS)) {
    if (syns.some(s => ql.includes(s))) wants.push(field);
  }
  if (!wants.length) return null;

  const out: string[] = [];
  const used: { mod?: string, id?: string }[] = [];

  for (const m of metas) {
    for (const w of wants) {
      const v = m[w] ?? m[w.toUpperCase()];
      if (v) {
        out.push(`${w}: ${String(v)}`);
        used.push({ mod: m.module, id: m.id });
      }
    }
  }
  if (!out.length) return { answer: null, missing: wants } as any;
  return {
    answer: out.join('\n'),
    sources: metas.map(m => `${m.module || 'Record'} • ID: ${m.id || '—'}`)
  } as any;
}

export const config = { runtime: 'nodejs22.x' } as const;

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const threadId = (body.threadId || 'default').toString();
    const entity = (body.entity || '').toString().trim();
    let question = (body.question || body.q || '').toString().trim();
    const topK = Number(body.topK ?? 10);

    if (!entity) return json({ error: 'Missing entity' }, { status: 400 });
    if (!question) return json({ error: 'Missing question' }, { status: 400 });

    // 1) rewrite (you can add real history later)
    question = await rewriteQuestion([], entity, question);

    // 2) vector retrieval
    const safe = toCollectionName(entity);
    const col = await getOrCreateCollectionByName(safe);
    const [qvec] = await embed([question]);
    const vres = await httpQuery(col.id, { query_embeddings: [qvec], n_results: topK });

    const ids = vres.ids?.[0] ?? [];
    const docs: string[] = vres.documents?.[0] ?? [];
    const metas: any[] = vres.metadatas?.[0] ?? [];

    // 3) lexical boost: pull docs (cap) and pick those that contain key terms
    const dump = await getDocs(col.id, { limit: 150, include: ['metadatas','documents','ids'] });
    const lexMatches = (dump.documents || []).map((d: string, i: number) => ({
      score: contains(d, question) ? 2 : 0,
      doc: d,
      meta: dump.metadatas?.[i],
      id: dump.ids?.[i]
    })).filter(x => x.score > 0);

    // blend (keep unique)
    const blended: { id: string, doc: string, meta: any }[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < docs.length; i++) {
      const id = ids[i]; if (!id || seen.has(id)) continue;
      seen.add(id);
      blended.push({ id, doc: docs[i], meta: metas[i] });
    }
    for (const m of lexMatches) {
      if (m.id && !seen.has(m.id)) {
        seen.add(m.id);
        blended.push({ id: m.id, doc: m.doc, meta: m.meta });
      }
    }

    if (!blended.length) {
      return json({
        answer: 'I don’t have facts yet for this client. Save a Deal/Lead/Note/Call/Task in Zoho and try again.',
        sources: []
      });
    }

    // 4) structured-first shortcut
    const struct = tryStructuredAnswer(question, blended.map(b => b.meta ?? {}));
    if (struct && (struct as any).answer) {
      return json({ answer: (struct as any).answer, sources: (struct as any).sources || [] });
    }
    if (struct && (struct as any).missing) {
      return json({
        answer: `I don't see ${(struct as any).missing.join(', ')} for this client. Please capture it in Zoho and I'll pick it up.`,
        sources: blended.map(b => `${b.meta?.module || 'Record'} • ID: ${b.meta?.id || b.id}`)
      });
    }

    // 5) compose context and ask LLM (RAG)
    const context = blended.slice(0, 12).map((b, i) => {
      const tag = `${b.meta?.module || 'Record'} • ID: ${b.meta?.id || b.id}`;
      return `[#${i+1}] ${tag}\n${b.doc}`;
    }).join('\n\n');

    const sys = `
Answer using ONLY the context. If unknown, say exactly what is missing (e.g., "No Amount found").
Be concise. Always include a "Sources" list with module + id used.
`.trim();

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type':'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: `Question: ${question}\n\nContext:\n${context}` }
        ]
      })
    });
    const data = await r.json();
    const answer = data?.choices?.[0]?.message?.content ?? '(no answer)';

    const sources = blended.map(b => `${b.meta?.module || 'Record'} • ID: ${b.meta?.id || b.id}`);

    return json({ answer, sources });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, { status: 500 });
  }
};

