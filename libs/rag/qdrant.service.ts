import { Injectable } from '@nestjs/common';
import { QdrantClient } from '@qdrant/js-client-rest';

@Injectable()
export class QdrantService {
  private readonly client = new QdrantClient({
    url: process.env.QDRANT_URL ?? 'http://localhost:6333',
  });

  async upsertPoint(input: {
    collectionName: string;
    id: string;
    vector: number[];
    payload: Record<string, unknown>;
  }) {
    return this.client.upsert(input.collectionName, {
      points: [
        {
          id: input.id,
          vector: input.vector,
          payload: input.payload,
        },
      ],
    });
  }

  async search(input: {
    collectionName: string;
    vector: number[];
    limit?: number;
  }) {
    return this.client.search(input.collectionName, {
      vector: input.vector,
      limit: input.limit ?? 5,
      with_payload: true,
    });
  }
}