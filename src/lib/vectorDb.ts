import { ChromaClient } from 'chromadb';
import OpenAI from 'openai';
import { env } from '$env/dynamic/private';

// Initialize clients using runtime env (works on Vercel)
const CHROMA_PATH = env.CHROMA_URL || 'http://localhost:8000';
const OPENAI_KEY = env.OPENAI_API_KEY;

const chromaClient = new ChromaClient({ path: CHROMA_PATH });
const openai = new OpenAI({ apiKey: OPENAI_KEY });

const COLLECTION_NAME = 'zoho_crm_context';

/**
 * A helper function to get or create a ChromaDB collection.
 * @returns {Promise<import('chromadb').Collection>}
 */
async function getCollection() {
    try {
        // Provide a NOOP embedding function to fully bypass Chroma's DefaultEmbeddingFunction
        // in serverless environments. We always pass `embeddings` explicitly on upsert/query.
        const NOOP: any = { generate: async () => { throw new Error('NOOP embedding function used. All operations must provide embeddings explicitly.'); } };
        return await chromaClient.getOrCreateCollection({ name: COLLECTION_NAME, embeddingFunction: NOOP });
    } catch (error) {
        console.error('Error getting or creating Chroma collection:', error);
        throw error;
    }
}


	/**
	 * Helper to embed a single string with OpenAI (small model for cost/latency)
	 */
	async function embedText(text: string): Promise<number[]> {
		if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY not configured');
		const res = await openai.embeddings.create({
			model: 'text-embedding-3-small',
			input: text
		});
		return res.data[0].embedding as unknown as number[];
	}

/**
 * Creates a text chunk from Zoho data, generates an embedding, and upserts it into the vector DB.
 * @param {string} moduleType - The Zoho module (e.g., 'leads', 'notes').
 * @param {string} recordId - The unique ID of the Zoho record.
 * @param {string} entityId - The parent entity ID (e.g., Lead ID, Deal ID) for grouping.
 * @param {object} data - The full data object from the webhook.
 */
export async function upsertToVectorDb(moduleType, recordId, entityId, data) {
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
 * @param {string} question - The user's question from the chat interface.
 * @param {string} entityId - The specific entity (lead, deal) we are asking about.
 * @returns {Promise<string>} - A formatted string of relevant context.
 */
export async function queryVectorDb(question, entityId) {
    const collection = await getCollection();

    // 1. Create an embedding for the user's question
    const queryEmbedding = await embedText(question);

    // 2. Query Chroma for the top 5 most relevant documents using embeddings
    // This avoids relying on the Chroma default embedding function in serverless envs
    const results = await collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: 5,
        where: { entityId }
    });

    if (!results.documents || results.documents.length === 0 || results.documents[0].length === 0) {
        return "No relevant context found in the database.";
    }

    // 3. Format the results into a clean string for the LLM prompt
    return "Relevant Context:\n" + results.documents[0].join("\n---\n");
}
