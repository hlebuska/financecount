import { QdrantClient } from '@qdrant/js-client-rest';

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL ?? 'http://localhost:6333',
});

async function main() {
  const collections = await qdrant.getCollections();
  const existingNames = collections.collections.map((collection) => collection.name);

  if (!existingNames.includes('categorization_memory')) {
    await qdrant.createCollection('categorization_memory', {
      vectors: {
        size: 1536,
        distance: 'Cosine',
      },
    });
  }

  if (!existingNames.includes('finance_knowledge')) {
    await qdrant.createCollection('finance_knowledge', {
      vectors: {
        size: 1536,
        distance: 'Cosine',
      },
    });
  }
}

void main();