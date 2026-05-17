import { Module } from '@nestjs/common';
import { EmbeddingsService } from './embeddings.service';
import { QdrantService } from './qdrant.service';

@Module({
  providers: [EmbeddingsService, QdrantService],
  exports: [EmbeddingsService, QdrantService],
})
export class RagModule {}