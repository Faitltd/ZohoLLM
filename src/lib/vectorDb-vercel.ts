import OpenAI from 'openai';
import { env } from '$env/dynamic/private';

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

// In-memory storage (in production, use a proper vector database like Pinecone)
let vectorStore: VectorDocument[] = [];

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

    // 3. Store in memory (remove existing document with same ID)
    const documentId = `${moduleType}-${recordId}`;
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

    console.log(`Successfully upserted ${moduleType}-${recordId} into Vector Store. Total documents: ${vectorStore.length}`);
}

/**
 * Queries the vector store to find context relevant to a user's question by lead name, deal name, or company.
 */
export async function queryVectorDb(question: string, searchName: string): Promise<string> {
    if (vectorStore.length === 0) {
        return "No data found in the vector store. Please ensure webhook data has been processed.";
    }

    // 1. Create an embedding for the user's question
    const queryEmbedding = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: question,
    });

    // 2. Filter documents by lead name, deal name, or company name and calculate similarities
    const searchTerm = searchName.toLowerCase();
    const relevantDocs = vectorStore
        .filter(doc =>
            doc.metadata.leadName.includes(searchTerm) ||
            doc.metadata.dealName.includes(searchTerm) ||
            doc.metadata.companyName.includes(searchTerm)
        )
        .map(doc => ({
            ...doc,
            similarity: cosineSimilarity(queryEmbedding.data[0].embedding, doc.embedding)
        }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 5); // Get top 5 most relevant

    if (relevantDocs.length === 0) {
        const availableLeads = [...new Set(vectorStore.map(doc => doc.metadata.leadName).filter(name => name))];
        const availableDeals = [...new Set(vectorStore.map(doc => doc.metadata.dealName).filter(name => name))];
        const availableCompanies = [...new Set(vectorStore.map(doc => doc.metadata.companyName).filter(name => name))];
        return `No relevant context found for "${searchName}". Available leads: ${availableLeads.join(', ')}. Available deals: ${availableDeals.join(', ')}. Available companies: ${availableCompanies.join(', ')}`;
    }

    // 3. Format the results
    const contextDocuments = relevantDocs.map(doc => 
        `${doc.document} (Similarity: ${doc.similarity.toFixed(3)})`
    );

    return "Relevant Context:\n" + contextDocuments.join("\n---\n");
}
