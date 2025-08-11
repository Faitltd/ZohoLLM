import { ChromaClient, type Collection } from 'chromadb';
import OpenAI from 'openai';
import { env } from '$env/dynamic/private';

// Runtime configuration
const CHROMA_PATH = env.CHROMA_URL || process.env.CHROMA_URL || 'http://localhost:8000';
const CHROMA_SHARED_KEY = env.CHROMA_SHARED_KEY || process.env.CHROMA_SHARED_KEY || '';
const OPENAI_KEY = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
const CONFIGURED_BACKEND = (env.VECTOR_BACKEND || process.env.VECTOR_BACKEND || 'auto').toLowerCase();

// OpenAI (shared)
const openai = new OpenAI({ apiKey: OPENAI_KEY });

// Chroma client (lazy)
let chromaClient: ChromaClient | null = null;
let chromaCollection: Collection | null = null;

export function getChroma(): ChromaClient {
	if (!chromaClient) {
		chromaClient = new ChromaClient({
			path: CHROMA_PATH,
			fetchOptions: { headers: { 'x-fait-key': CHROMA_SHARED_KEY } }
		});
	}
	return chromaClient;
}

// Active backend state
let ACTIVE_BACKEND: 'chroma' | 'memory' = CONFIGURED_BACKEND === 'memory' ? 'memory' : 'memory';

const COLLECTION_NAME = 'zoho_crm_context';

// In-memory fallback store (id -> { embedding, metadata, document })
const memoryStore = new Map<string, { embedding: number[]; metadata: any; document: string }>();

export function getActiveVectorBackend() {
	return ACTIVE_BACKEND;
}

/**
 * A helper function to get or create a ChromaDB collection.
 * @returns {Promise<import('chromadb').Collection>}
 */
async function getCollection() {
  // Respect configured backend
  if (CONFIGURED_BACKEND === 'memory') {
    ACTIVE_BACKEND = 'memory';
    throw new Error('VECTOR_BACKEND=memory');
  }

  try {
    if (!chromaClient) chromaClient = getChroma();
    // Provide a NOOP embedding function to fully bypass Chroma's DefaultEmbeddingFunction
    const NOOP: any = { generate: async () => { throw new Error('NOOP embedding function used.'); } };
    chromaCollection = await chromaClient.getOrCreateCollection({ name: COLLECTION_NAME, embeddingFunction: NOOP });
    ACTIVE_BACKEND = 'chroma';
    return chromaCollection;
  } catch (error) {
    // Fallback to memory if auto
    if (CONFIGURED_BACKEND === 'auto') {
      ACTIVE_BACKEND = 'memory';
      console.warn('Chroma unreachable, falling back to in-memory vectors:', (error as any)?.message || error);
      throw new Error('FALLBACK_TO_MEMORY');
    }
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
  // 1. Format the data into a meaningful text chunk for embedding
  let documentText = `Module: ${moduleType}\n`;
  if (moduleType === 'leads') {
    documentText += `Lead: ${data.Lead_Name}, Company: ${data.Company}, Status: ${data.Lead_Status}, Email: ${data.Email}`;
  } else if (moduleType === 'notes') {
    documentText += `Note: ${data.Note_Title} - ${data.Note_Content}`;
  } else if (moduleType === 'emails') {
    documentText += `Email Subject: ${data.Subject}\nFrom: ${data.From}\nTo: ${data.To}\nContent: ${data.Content}`;
  } else {
    documentText += JSON.stringify(data);
  }

  // 2. Generate embedding using OpenAI
  const embedding = await embedText(documentText);

  // Try Chroma; if not available and auto, persist to memory
  try {
    const collection = await getCollection();
    await collection.upsert({
      ids: [`${moduleType}-${recordId}`],
      embeddings: [embedding],
      metadatas: [{ module: moduleType, entityId, timestamp: new Date().toISOString() }],
      documents: [documentText]
    });
    ACTIVE_BACKEND = 'chroma';
  } catch (e: any) {
    if (CONFIGURED_BACKEND === 'auto' && (e?.message === 'FALLBACK_TO_MEMORY' || e?.message === 'VECTOR_BACKEND=memory')) {
      memoryStore.set(`${moduleType}-${recordId}`, { embedding, metadata: { module: moduleType, entityId, timestamp: new Date().toISOString() }, document: documentText });
      ACTIVE_BACKEND = 'memory';
    } else {
      throw e;
    }
  }

  console.log(`Successfully upserted ${moduleType}-${recordId} into Vector DB (backend=${ACTIVE_BACKEND}).`);
}

/**
 * Queries the vector DB to find context relevant to a user's question.
 * @param {string} question - The user's question from the chat interface.
 * @param {string} entityId - The specific entity (lead, deal) we are asking about.
 * @returns {Promise<string>} - A formatted string of relevant context.
 */
export async function queryVectorDb(question, entityId) {
  // 1) Embed the query
  const queryEmbedding = await embedText(question);

  // 2) Try Chroma first
  try {
    const collection = await getCollection();
    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: 5,
      where: { entityId }
    });

    if (!results.documents || !results.documents[0] || results.documents[0].length === 0) {
      return 'No relevant context found in the database.';
    }
    return 'Relevant Context:\n' + results.documents[0].join('\n---\n');
  } catch (e: any) {
    if (CONFIGURED_BACKEND === 'auto' && (e?.message === 'FALLBACK_TO_MEMORY' || e?.message === 'VECTOR_BACKEND=memory')) {
      // 3) Memory fallback: cosine similarity over memoryStore
      const entries = Array.from(memoryStore.entries()).filter(([, v]) => v.metadata?.entityId === entityId);
      if (entries.length === 0) return 'No relevant context found in the database.';

      function cosine(a: number[], b: number[]) {
        const dot = a.reduce((s, x, i) => s + x * b[i], 0);
        const magA = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
        const magB = Math.sqrt(b.reduce((s, x) => s + x * x, 0));
        return dot / (magA * magB);
      }

      const scored = entries
        .map(([, v]) => ({ ...v, score: cosine(queryEmbedding, v.embedding) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(v => v.document);

      return 'Relevant Context:\n' + scored.join('\n---\n');
    }
    throw e;
  }
}
