import { ChromaClient } from 'chromadb';
import OpenAI from 'openai';
import { env } from '$env/dynamic/private';

// Initialize clients
const chromaClient = new ChromaClient({
    path: "http://localhost:8000"
}); // Connects to local ChromaDB instance
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const COLLECTION_NAME = "zoho_crm_context";

/**
 * A helper function to get or create a ChromaDB collection.
 */
async function getCollection() {
    try {
        return await chromaClient.getOrCreateCollection({ name: COLLECTION_NAME });
    } catch (error) {
        console.error("Error getting or creating Chroma collection:", error);
        throw error;
    }
}

/**
 * Creates a text chunk from Zoho data, generates an embedding, and upserts it into the vector DB.
 */
export async function upsertToVectorDb(moduleType: string, recordId: string, entityId: string, data: any) {
    const collection = await getCollection();
    
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
        model: "text-embedding-3-small", // Cost-effective and powerful
        input: documentText,
    });
    const embedding = embeddingResponse.data[0].embedding;

    // 3. Upsert into ChromaDB
    await collection.upsert({
        ids: [`${moduleType}-${recordId}`], // Create a unique ID for the chunk
        embeddings: [embedding],
        metadatas: [{
            module: moduleType,
            entityId: entityId, // Used for filtering
            timestamp: new Date().toISOString()
        }],
        documents: [documentText] // Store the original text for context
    });

    console.log(`Successfully upserted ${moduleType}-${recordId} into Vector DB.`);
}

/**
 * Queries the vector DB to find context relevant to a user's question.
 */
export async function queryVectorDb(question: string, entityId: string): Promise<string> {
    const collection = await getCollection();

    // 1. Create an embedding for the user's question
    const queryEmbedding = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: question,
    });

    // 2. Query Chroma for the top 5 most relevant documents
    // We filter by `entityId` to ensure we only get context for the customer in question.
    const results = await collection.query({
        queryEmbeddings: [queryEmbedding.data[0].embedding],
        nResults: 5, // Get the top 5 most relevant chunks
        where: { "entityId": entityId } // **CRITICAL**: Filter for the correct entity
    });

    if (!results.documents || results.documents.length === 0 || results.documents[0].length === 0) {
        return "No relevant context found in the database.";
    }

    // 3. Format the results into a clean string for the LLM prompt
    return "Relevant Context:\n" + results.documents[0].join("\n---\n");
}
