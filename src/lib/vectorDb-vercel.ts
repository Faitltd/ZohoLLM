import OpenAI from 'openai';
import { env } from '$env/dynamic/private';
import { ChromaClient, type Collection } from 'chromadb';

// Simple in-memory vector store for Vercel deployment
interface VectorDocument {
    id: string;
    embedding: number[];
    metadata: {
        module: string;
        entityId: string;
        leadName: string;
        dealName: string;
        companyName: string;
        timestamp: string;
    };
    document: string;
}

// In-memory storage (in production, use a proper vector database like Chroma/Pinecone)
let vectorStore: VectorDocument[] = [];

// Backend selection
const VECTOR_BACKEND = (env.VECTOR_BACKEND || 'memory').toLowerCase();
let chromaClient: ChromaClient | null = null;
let chromaCollection: Collection | null = null;

async function getChromaCollection(): Promise<Collection> {
    if (!chromaClient) {
        const path = env.CHROMA_URL || 'http://localhost:8000';
        chromaClient = new ChromaClient({ path });
    }
    if (!chromaCollection) {
        chromaCollection = await chromaClient.getOrCreateCollection({ name: 'crm_vectors' });
    }
    return chromaCollection!;
}

// Lightweight webhook ingestion log for monitoring
interface WebhookEventLog {
    module: string;
    recordId: string;
    entityId: string;
    timestamp: string;
}
let webhookLog: WebhookEventLog[] = [];

export function getWebhookLog() {
    return webhookLog.slice(-200); // last 200 events
}

export function listEntities() {
    const leads = new Set<string>();
    const deals = new Set<string>();
    const companies = new Set<string>();
    for (const doc of vectorStore) {
        if (doc.metadata.leadName) leads.add(doc.metadata.leadName);
        if (doc.metadata.dealName) deals.add(doc.metadata.dealName);
        if (doc.metadata.companyName) companies.add(doc.metadata.companyName);
    }
    return {
        leads: Array.from(leads).filter(Boolean).sort(),
        deals: Array.from(deals).filter(Boolean).sort(),
        companies: Array.from(companies).filter(Boolean).sort(),
        totals: { documents: vectorStore.length }
    };
}

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Creates a text chunk from Zoho data, generates an embedding, and stores it in memory.
 */
export async function upsertToVectorDb(moduleType: string, recordId: string, entityId: string, data: any) {
    // Extract lead name, deal name, and company names for better searching
    let leadName = '';
    let dealName = '';
    let companyName = '';

    if (moduleType === 'leads') {
        leadName = data.Lead_Name || (data.First_Name + ' ' + data.Last_Name).trim() || '';
        companyName = data.Company || data.Account_Name || '';
    } else if (moduleType === 'deals') {
        dealName = data.Deal_Name || '';
        leadName = data.Contact_Name || ''; // Sometimes deals have associated contact names
        companyName = data.Account_Name || data.Company || '';
    } else if (moduleType === 'notes' || moduleType === 'chats') {
        // For notes, try to get info from related records
        leadName = data.Parent_Name || data.Related_To_Name || '';
        dealName = data.Deal_Name || '';
        companyName = data.Company || '';
    } else if (moduleType === 'emails') {
        leadName = data.From || data.To || '';
        companyName = data.Company || '';
    }

    // 1. Format the data into a meaningful text chunk for embedding
    let documentText = `Module: ${moduleType}\n`;
    if (moduleType === 'leads') {
        documentText += `Lead: ${data.Lead_Name}, Company: ${data.Company}, Status: ${data.Lead_Status}, Email: ${data.Email}`;
    } else if (moduleType === 'notes') {
        documentText += `Note: ${data.Note_Title} - ${data.Note_Content}`;
    } else if (moduleType === 'emails') {
        documentText += `Email Subject: ${data.Subject}\nFrom: ${data.From}\nTo: ${data.To}\nContent: ${data.Content}`;
    } else {
        // Generic fallback for other modules like Deals, Projects
        documentText += JSON.stringify(data);
    }

    // 2. Generate embedding using OpenAI
    const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: documentText,
    });
    const embedding = embeddingResponse.data[0].embedding;

    // 3. Store in selected backend
    const documentId = `${moduleType}-${recordId}`;

    if (VECTOR_BACKEND === 'chroma') {
        const col = await getChromaCollection();
        try { await col.delete({ ids: [documentId] }); } catch {}
        await col.add({
            ids: [documentId],
            embeddings: [embedding],
            metadatas: [{
                module: moduleType,
                entityId,
                leadName: leadName.toLowerCase(),
                dealName: dealName.toLowerCase(),
                companyName: companyName.toLowerCase(),
                timestamp: new Date().toISOString()
            }],
            documents: [documentText]
        });
    } else {
        vectorStore = vectorStore.filter(doc => doc.id !== documentId);
        vectorStore.push({
            id: documentId,
            embedding,
            metadata: {
                module: moduleType,
                entityId: entityId,
                leadName: leadName.toLowerCase(),
                dealName: dealName.toLowerCase(),
                companyName: companyName.toLowerCase(),
                timestamp: new Date().toISOString()
            },
            document: documentText
        });
    }

    // Log webhook event
    webhookLog.push({
        module: moduleType,
        recordId: String(recordId),
        entityId: String(entityId),
        timestamp: new Date().toISOString()
    });

    console.log(`Successfully upserted ${moduleType}-${recordId} into Vector Store. Total documents: ${vectorStore.length}`);
}

/**
 * Queries the vector store to find context relevant to a user's question by lead name, deal name, or company.
 */
export async function queryVectorDb(question: string, searchName: string): Promise<string> {
    // Graceful fallback if OpenAI key is not configured
    if (!env.OPENAI_API_KEY) {
        return `Vector search is disabled because OPENAI_API_KEY is not set.\nSearched for: ${searchName}\nQuestion: ${question}`;
    }

    // Only check in-memory store when using memory backend; Chroma persists separately
    if (VECTOR_BACKEND !== 'chroma' && vectorStore.length === 0) {
        return "No data found in the vector store. Please ensure webhook data has been processed.";
    }

    // 1) Embed the user's question once
    const queryEmbedding = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: question,
    });

    // 2) Build expanded related terms from initial searchName
    const base = (searchName || '').toLowerCase().trim();
    if (!base) {
        return "Please provide a lead, deal or company to search.";
    }

    let directMatches: (VectorDocument | { metadata: VectorDocument['metadata']; document: string; embedding: number[] })[];
    if (VECTOR_BACKEND === 'chroma') {
        const col = await getChromaCollection();
        // We approximate direct matches by filtering metadatas via where clause (company OR lead OR deal contains base)
        // Chroma where clause doesn't support contains; so fetch all metadatas cheaply is not ideal.
        // For now, perform a naive query using document search, then expand via metadata.
        const res = await col.query({
            queryTexts: [base],
            nResults: 50
        });
        directMatches = (res.ids?.[0] || []).map((id: string, idx: number) => ({
            metadata: (res.metadatas?.[0]?.[idx] || {}) as any,
            document: (res.documents?.[0]?.[idx] as string) || '',
            embedding: (res.embeddings?.[0]?.[idx] as number[]) || []
        }));
    } else {
        directMatches = vectorStore.filter((doc) =>
            doc.metadata.leadName.includes(base) ||
            doc.metadata.dealName.includes(base) ||
            doc.metadata.companyName.includes(base)
        );
    }

    // Collect related names that co-occur with the base term
    const relatedCompanies = new Set<string>();
    const relatedLeads = new Set<string>();
    const relatedDeals = new Set<string>();

    for (const d of directMatches) {
        if (d.metadata.companyName) relatedCompanies.add(d.metadata.companyName);
        if (d.metadata.leadName) relatedLeads.add(d.metadata.leadName);
        if (d.metadata.dealName) relatedDeals.add(d.metadata.dealName);
    }

    // If the base matches a company, include all leads/deals under that company.
    // If it matches a lead or deal, include their company and siblings.
    const expandedTerms = new Set<string>([base]);
    for (const c of relatedCompanies) expandedTerms.add(c);
    for (const l of relatedLeads) expandedTerms.add(l);
    for (const d of relatedDeals) expandedTerms.add(d);

    // 3) Fetch docs that match ANY expanded term across company/lead/deal
    let expandedDocs: { metadata: VectorDocument['metadata']; document: string; embedding: number[] }[];
    if (VECTOR_BACKEND === 'chroma') {
        const col = await getChromaCollection();
        // Query by expanded terms and merge results
        const terms = Array.from(expandedTerms).filter(Boolean);
        const results = await Promise.all(terms.map(term => col.query({ queryTexts: [term], nResults: 25 })));
        const merged: Record<string, { metadata: any; document: string; embedding: number[] }> = {};
        for (const res of results) {
            const ids = res.ids?.[0] || [];
            for (let i = 0; i < ids.length; i++) {
                const id = ids[i] as string;
                merged[id] = {
                    metadata: (res.metadatas?.[0]?.[i] || {}) as any,
                    document: (res.documents?.[0]?.[i] as string) || '',
                    embedding: (res.embeddings?.[0]?.[i] as number[]) || []
                };
            }
        }
        expandedDocs = Object.values(merged).filter(d => {
            const ln = (d.metadata.leadName || '').toLowerCase();
            const dn = (d.metadata.dealName || '').toLowerCase();
            const cn = (d.metadata.companyName || '').toLowerCase();
            return terms.some(t => ln.includes(t) || dn.includes(t) || cn.includes(t));
        });
    } else {
        expandedDocs = vectorStore.filter((doc) => {
            const { leadName, dealName, companyName } = doc.metadata;
            for (const term of expandedTerms) {
                if (!term) continue;
                if (leadName.includes(term) || dealName.includes(term) || companyName.includes(term)) return true;
            }
            return false;
        });
    }

    if (expandedDocs.length === 0) {
        const availableLeads = [...new Set(vectorStore.map(doc => doc.metadata.leadName).filter(Boolean))];
        const availableDeals = [...new Set(vectorStore.map(doc => doc.metadata.dealName).filter(Boolean))];
        const availableCompanies = [...new Set(vectorStore.map(doc => doc.metadata.companyName).filter(Boolean))];
        return `No relevant context found for "${searchName}". Available leads: ${availableLeads.join(', ')}. Available deals: ${availableDeals.join(', ')}. Available companies: ${availableCompanies.join(', ')}`;
    }

    // 4) Score by similarity of the question embedding
    const scored = expandedDocs
        .map((doc) => ({
            ...doc,
            similarity: cosineSimilarity(queryEmbedding.data[0].embedding, doc.embedding)
        }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 8); // Top 8 after expansion

    // 5) Build a succinct context with a header that shows expansion
    const headerLines = [
        `Query: ${question}`,
        `Searched for: ${searchName}`,
        `Expanded terms: ${Array.from(expandedTerms).join(', ')}`
    ];

    const contextDocuments = scored.map((doc) => {
        const meta = doc.metadata;
        const tag = `module=${meta.module} | lead=${meta.leadName || '-'} | deal=${meta.dealName || '-'} | company=${meta.companyName || '-'}`;
        return `${tag}\n${doc.document}\n(Similarity: ${doc.similarity.toFixed(3)})`;
    });

    return [
        headerLines.join('\n'),
        '---',
        contextDocuments.join('\n---\n')
    ].join('\n');
}
