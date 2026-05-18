import { Injectable } from '@nestjs/common';
import { EmbeddingsService } from '../../../libs/rag/embeddings.service';
import { QdrantService } from '../../../libs/rag/qdrant.service';

@Injectable()
export class AdvisorKnowledgeService {
  constructor(
    private readonly embeddingsService: EmbeddingsService,
    private readonly qdrantService: QdrantService,
  ) {}

  async retrieve(query: string) {
    const vector = await this.embeddingsService.embed(query);
    const results = await this.qdrantService.search({
      collectionName: 'finance_knowledge',
      vector,
      limit: 4,
    });

    return results.map((result) => {
      const payload = (result.payload ?? {}) as Record<string, unknown>;

      return {
        score: result.score,
        title: typeof payload.title === 'string' ? payload.title : 'Knowledge item',
        source: typeof payload.source === 'string' ? payload.source : null,
        text:
          typeof payload.text === 'string'
            ? payload.text
            : typeof payload.content === 'string'
              ? payload.content
              : null,
      };
    });
  }
}
