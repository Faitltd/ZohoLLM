import { ChromaClient } from "chromadb";
import { env } from "$env/dynamic/private";

let chromaClient: ChromaClient | null = null;

export function getActiveVectorBackend(): "auto" | "memory" | "chroma" {
  return (env.VECTOR_BACKEND || "auto").toLowerCase() as any;
}

export function getChroma(): ChromaClient {
  if (!chromaClient) {
    chromaClient = new ChromaClient({
      path: env.CHROMA_URL!,
      fetchOptions: { headers: { "x-fait-key": env.CHROMA_SHARED_KEY ?? "" } }
    });
  }
  return chromaClient;
}

