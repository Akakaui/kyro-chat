import { pipeline, env } from '@xenova/transformers';

// Disable model auto-downloading for first run
env.allowLocalModels = false;
env.useBrowserCache = false;

let embeddingModel: any = null;

/**
 * Get or initialize the embedding model (lazy loading)
 */
async function getEmbeddingModel(): Promise<any> {
  if (!embeddingModel) {
    embeddingModel = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return embeddingModel;
}

/**
 * Generate embedding vector for text
 * Returns Float32Array of 384 dimensions
 */
export async function generateEmbedding(text: string): Promise<Float32Array> {
  const model = await getEmbeddingModel();

  // Truncate to ~512 tokens (~2000 chars) for MiniLM
  const truncated = text.slice(0, 2000);

  const output = await model(truncated, {
    pooling: 'mean',
    normalize: true,
  });

  return output.data;
}

/**
 * Generate embeddings for multiple texts in batch
 */
export async function generateEmbeddings(texts: string[]): Promise<Float32Array[]> {
  const model = await getEmbeddingModel();
  const embeddings: Float32Array[] = [];

  // Process in batches of 32
  const batchSize = 32;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    const promises = batch.map(text => {
      const truncated = text.slice(0, 2000);
      return model(truncated, {
        pooling: 'mean',
        normalize: true,
      });
    });

    const results = await Promise.all(promises);
    embeddings.push(...results.map((r: any) => r.data));
  }

  return embeddings;
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Chunk text into overlapping segments
 */
export function chunkText(
  text: string,
  chunkSize: number = 1000,
  overlap: number = 200
): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);

  let currentChunk = '';
  let currentLength = 0;

  for (const sentence of sentences) {
    const sentenceLength = sentence.length;

    if (currentLength + sentenceLength > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());

      // Keep overlap
      const overlapText = currentChunk.slice(-overlap);
      currentChunk = overlapText + ' ' + sentence;
      currentLength = overlapText.length + sentenceLength;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
      currentLength += sentenceLength;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}
