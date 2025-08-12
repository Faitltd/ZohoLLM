import { env } from "$env/dynamic/private";
import { getOrCreateCollectionByName, upsertDocs, query as queryCollection } from "$lib/chromaHttp";
import { toCollectionName } from "$lib/personKey";

// --- Helper builders for concise, module-aware documents ---
function val(x: unknown) {
  return (x ?? '').toString().trim();
}

function joinLines(lines: Array<string | false | null | undefined>) {
  return lines.filter(Boolean).join('\n');
}

/**
 * Build a human-readable document string from a Zoho payload.
 * We keep it short, structured, and module-aware so retrieval works well.
 */
export function buildDocFromPayload(moduleName: string | undefined, p: Record<string, any>) {
  const m = (moduleName || '').trim();

  switch (m) {
    case 'Deals': {
      return joinLines([
        p.Deal_Name && `Deal: ${val(p.Deal_Name)}`,
        p.Stage && `Stage: ${val(p.Stage)}`,
        p.Amount && `Amount: ${val(p.Amount)}`,
        p.Probability && `Probability: ${val(p.Probability)}%`,
        p.Next_Step && `Next step: ${val(p.Next_Step)}`,
        (p.Street || p.City || p.Zip_Code) &&
          `Address: ${val(p.Street)}, ${val(p.City)} ${val(p.Zip_Code)}`,
        p.WorkDrive && `WorkDrive: ${val(p.WorkDrive)}`,
        p.Email && `Email: ${val(p.Email)}`,
        p.Phone && `Phone: ${val(p.Phone)}`
      ]);
    }

    case 'Leads': {
      return joinLines([
        (p.First_Name || p.Last_Name || p.Lead_Name) &&
          `Lead: ${val(p.First_Name)} ${val(p.Last_Name)} ${val(p.Lead_Name)}`.replace(/\s+/g, ' ').trim(),
        p.Company && `Company: ${val(p.Company)}`,
        p.Lead_Status && `Status: ${val(p.Lead_Status)}`,
        p.Email && `Email: ${val(p.Email)}`,
        p.Phone && `Phone: ${val(p.Phone)}`,
        (p.Street || p.City || p.Zip_Code) &&
          `Address: ${val(p.Street)}, ${val(p.City)} ${val(p.Zip_Code)}`,
        p.Description && `Notes: ${val(p.Description)}`
      ]);
    }

    case 'Contacts': {
      return joinLines([
        (p.First_Name || p.Last_Name || p.Contact_Name) &&
          `Contact: ${val(p.First_Name)} ${val(p.Last_Name)} ${val(p.Contact_Name)}`.replace(/\s+/g, ' ').trim(),
        p.Email && `Email: ${val(p.Email)}`,
        (p.Phone || p.Mobile) && `Phone(s): ${val(p.Phone)} ${val(p.Mobile)}`.trim(),
        (p.Mailing_Street || p.Mailing_City || p.Mailing_Zip) &&
          `Address: ${val(p.Mailing_Street)}, ${val(p.Mailing_City)} ${val(p.Mailing_Zip)}`
      ]);
    }

    case 'Notes': {
      return joinLines([
        p.Note_Title && `Note: ${val(p.Note_Title)}`,
        p.Note_Content && val(p.Note_Content)
      ]);
    }

    case 'Calls': {
      return joinLines([
        p.Subject && `Call: ${val(p.Subject)}`,
        p.Call_Type && `Type: ${val(p.Call_Type)}`,
        p.Call_Purpose && `Purpose: ${val(p.Call_Purpose)}`,
        p.Call_Result && `Result: ${val(p.Call_Result)}`,
        p.Call_Duration && `Duration: ${val(p.Call_Duration)}`,
        p.Phone && `Phone: ${val(p.Phone)}`
      ]);
    }

    case 'Tasks': {
      return joinLines([
        p.Subject && `Task: ${val(p.Subject)}`,
        p.Status && `Status: ${val(p.Status)}`,
        p.Due_Date && `Due: ${val(p.Due_Date)}`,
        p.Description && `Details: ${val(p.Description)}`
      ]);
    }

    case 'Meetings': {
      return joinLines([
        p.Subject && `Meeting: ${val(p.Subject)}`,
        p.Start_Time && `Start: ${val(p.Start_Time)}`,
        p.End_Time && `End: ${val(p.End_Time)}`,
        p.Location && `Location: ${val(p.Location)}`,
        p.Description && `Details: ${val(p.Description)}`
      ]);
    }

    default: {
      // Generic fallback – include the most recognisable fields
      const lines: string[] = [];
      if (p.Email) lines.push(`Email: ${val(p.Email)}`);
      if (p.Phone) lines.push(`Phone: ${val(p.Phone)}`);
      if (p.Company) lines.push(`Company: ${val(p.Company)}`);
      if (p.Description) lines.push(`Notes: ${val(p.Description)}`);
      if (lines.length === 0) {
        lines.push(
          Object.entries(p)
            .slice(0, 24)
            .map(([k, v]) => `${k}: ${val(v)}`)
            .join('\n')
        );
      }
      return lines.join('\n');
    }
  }
}

/** Which backend is active (memory|chroma|auto) */
export function getActiveVectorBackend(): "memory" | "chroma" | "auto" {
  const v = (env.VECTOR_BACKEND || "auto").toLowerCase();
  if (v === "memory" || v === "chroma") return v as any;
  return "auto";
}

/** OpenAI Embeddings helper */
async function embed(texts: string[]): Promise<number[][]> {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: texts })
  });
  if (!r.ok) throw new Error(`OpenAI embeddings failed: ${r.status}`);
  const j = await r.json();
  return j.data.map((d: any) => d.embedding as number[]);
}

/** Upsert one payload into the entity_<id> collection */
export async function upsertToVectorDb(args: { entity: string; payload: any; doc?: string }) {
  const { entity, payload } = args;
  if (!entity) throw new Error("missing entity id");
  if (!payload) throw new Error("missing payload");

  // Build module-aware doc (or use provided doc override)
  const moduleName = val(args.payload?.module || args.payload?.Module);
  const built = buildDocFromPayload(moduleName, payload);
  const doc = (args.doc && args.doc.trim()) ? args.doc : built;
  if (!doc) throw new Error("Nothing to upsert (empty document)");

  // Create/get collection and upsert via HTTP helper
  const collectionName = toCollectionName(entity);
  const col = await getOrCreateCollectionByName(collectionName);
  const [embedding] = await embed([doc]);
  const id = String(payload.id ?? `${Date.now()}`);

  await upsertDocs(col.id, {
    ids: [id],
    documents: [doc],
    metadatas: [payload],
    embeddings: [embedding]
  });

  return { ok: true, entity, id };
}

/** Query topK for an entity collection */
export async function queryVectorDb(params: { entity: string; query: string; topK?: number }) {
  const { entity, query, topK = 5 } = params;
  const collectionName = toCollectionName(entity);
  const col = await getOrCreateCollectionByName(collectionName);
  const [q] = await embed([query]);
  return queryCollection(col.id, { query_embeddings: [q], n_results: topK });
}
