import { env } from '$env/dynamic/private';

export type Msg = { role: 'user'|'assistant'|'system'; content: string };

export async function rewriteQuestion(history: Msg[], entity: string, q: string) {
  const sys = `
You are a query rewriter. Given prior turns and a follow-up, produce a single, explicit question.
Always include the entity/person key: ${entity}.
Keep domain terms (Deals, Leads, Stage, Amount, Notes, WorkDrive).
Return ONLY the rewritten question text.
`.trim();

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [{ role: 'system', content: sys }, ...history, { role: 'user', content: q }]
    })
  });
  const data = await r.json();
  return data?.choices?.[0]?.message?.content?.trim() || q;
}

