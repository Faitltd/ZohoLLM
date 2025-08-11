import { env } from "$env/dynamic/private";
import { getOrCreateCollectionByName, upsertDocs, query as queryCollection } from "$lib/chromaHttp";
import { toCollectionName } from "$lib/personKey";

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
export async function upsertToVectorDb(args: { entity: string; payload: any }) {
  const { entity, payload } = args;
  if (!entity) throw new Error("missing entity id");
  if (!payload) throw new Error("missing payload");

  // Build a readable doc string with module-aware formatting so embeddings have substance
  const chunks: string[] = [];
  const Module = String(payload.Module ?? payload.module ?? "");

  // Notes (simple)
  if (payload.Note_Title || payload.Note_Content) {
    if (payload.Note_Title) chunks.push(`Title: ${payload.Note_Title}`);
    if (payload.Note_Content) chunks.push(`Content: ${payload.Note_Content}`);
  } else if (Module === "Deals") {
    if (payload.Deal_Name) chunks.push(`Deal: ${payload.Deal_Name}`);
    if (payload.Stage) chunks.push(`Stage: ${payload.Stage}`);
    if (payload.Amount) chunks.push(`Amount: ${payload.Amount}`);
    if (payload.Probability) chunks.push(`Probability: ${payload.Probability}`);
    if (payload.Next_Step) chunks.push(`Next step: ${payload.Next_Step}`);
    const addr = [payload.Street, payload.City, payload.Zip_Code].filter(Boolean).join(", ");
    if (addr) chunks.push(`Address: ${addr}`);
    if (payload.WorkDrive) chunks.push(`WorkDrive: ${payload.WorkDrive}`);
    const more: [string, any][] = [
      ["Closing_Date", payload.Closing_Date],
      ["Pipeline", payload.Pipeline],
      ["Account_Name", payload.Account_Name],
      ["Contact_Name", payload.Contact_Name],
      ["Owner", payload.Owner],
      ["Email", payload.Email],
      ["Phone", payload.Phone],
      ["Description", payload.Description]
    ];
    for (const [k, v] of more) if (v) chunks.push(`${k}: ${v}`);
  } else if (Module === "Contacts") {
    const full = payload.Full_Name || [payload.First_Name, payload.Last_Name].filter(Boolean).join(" ");
    if (full) chunks.push(`Contact: ${full}`);
    if (payload.Account_Name) chunks.push(`Account: ${payload.Account_Name}`);
    if (payload.Title) chunks.push(`Title: ${payload.Title}`);
    if (payload.Department) chunks.push(`Department: ${payload.Department}`);
    const phones = [payload.Phone, payload.Mobile].filter(Boolean).join(", ");
    if (payload.Email) chunks.push(`Email: ${payload.Email}`);
    if (phones) chunks.push(`Phone: ${phones}`);
    const maddr = [payload.Mailing_Street, payload.Mailing_City, payload.Mailing_State, payload.Mailing_Zip, payload.Mailing_Country]
      .filter(Boolean).join(", ");
    if (maddr) chunks.push(`Mailing: ${maddr}`);
    if (payload.Description) chunks.push(`Description: ${payload.Description}`);
  } else if (Module === "Leads") {
    const full = payload.Full_Name || payload.Lead_Name || [payload.First_Name, payload.Last_Name].filter(Boolean).join(" ");
    if (full) chunks.push(`Lead: ${full}`);
    if (payload.Company) chunks.push(`Company: ${payload.Company}`);
    if (payload.Lead_Source) chunks.push(`Source: ${payload.Lead_Source}`);
    if (payload.Lead_Status) chunks.push(`Status: ${payload.Lead_Status}`);
    if (payload.Email) chunks.push(`Email: ${payload.Email}`);
    const phones = [payload.Phone, payload.Mobile].filter(Boolean).join(", ");
    if (phones) chunks.push(`Phone: ${phones}`);
    const addr = [payload.Street, payload.City, payload.State, payload.Zip_Code, payload.Country].filter(Boolean).join(", ");
    if (addr) chunks.push(`Address: ${addr}`);
    if (payload.Description) chunks.push(`Description: ${payload.Description}`);
  } else if (Module === "Tasks") {
    if (payload.Subject || payload.Task) chunks.push(`Task: ${payload.Subject || payload.Task}`);
    if (payload.Status) chunks.push(`Status: ${payload.Status}`);
    if (payload.Priority) chunks.push(`Priority: ${payload.Priority}`);
    if (payload.Due_Date) chunks.push(`Due: ${payload.Due_Date}`);
    if (payload.Description) chunks.push(`Notes: ${payload.Description}`);
  } else if (Module === "Calls") {
    if (payload.Subject) chunks.push(`Call: ${payload.Subject}`);
    if (payload.Call_Purpose) chunks.push(`Purpose: ${payload.Call_Purpose}`);
    if (payload.Call_Type) chunks.push(`Type: ${payload.Call_Type}`);
    if (payload.Call_Duration) chunks.push(`Duration: ${payload.Call_Duration}`);
    if (payload.Call_Start_Time) chunks.push(`When: ${payload.Call_Start_Time}`);
    if (payload.Outcomes || payload.Outcome) chunks.push(`Outcome: ${payload.Outcomes || payload.Outcome}`);
    if (payload.Description) chunks.push(`Notes: ${payload.Description}`);
  } else if (Module === "Meetings" || Module === "Events") {
    const title = payload.Event_Title || payload.Subject || payload.Title;
    if (title) chunks.push(`Meeting: ${title}`);
    const when = [payload.Start_DateTime || payload.Start_Time, payload.End_DateTime || payload.End_Time].filter(Boolean).join(" → ");
    if (when) chunks.push(`When: ${when}`);
    if (payload.Location) chunks.push(`Location: ${payload.Location}`);
    if (payload.Description) chunks.push(`Notes: ${payload.Description}`);
  } else if (Module === "WorkDrive") {
    if (payload.File_Name) chunks.push(`File: ${payload.File_Name}`);
    if (payload.Folder_Name) chunks.push(`Folder: ${payload.Folder_Name}`);
    if (payload.WorkDrive_Id) chunks.push(`WorkDrive Id: ${payload.WorkDrive_Id}`);
    if (payload.Description) chunks.push(`Notes: ${payload.Description}`);
  } else if (Module === "Emails") {
    if (payload.Subject) chunks.push(`Email: ${payload.Subject}`);
    const fromTo = [payload.From, payload.To, payload.Cc].filter(Boolean).join(" | ");
    if (fromTo) chunks.push(`Participants: ${fromTo}`);
    if (payload.Snippet || payload.Body) chunks.push(`Body: ${payload.Snippet || payload.Body}`);
  } else {
    // Generic fallback for unknown modules
    const fields: [string, any][] = [
      ["Lead_Name", payload.Lead_Name],
      ["Company", payload.Company],
      ["Lead_Status", payload.Lead_Status],
      ["Email", payload.Email],
      ["Phone", payload.Phone],
      ["Description", payload.Description]
    ];
    for (const [k, v] of fields) if (v) chunks.push(`${k}: ${v}`);
  }

  if (chunks.length === 0) {
    chunks.push(
      Object.entries(payload)
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join("\n")
    );
  }

  const doc = chunks.join("\n").trim();
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
