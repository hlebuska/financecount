import { Module } from '@nestjs/common';
import { RagModule } from '../rag/rag.module';
import { CategorizationMemoryService } from './categorization-memory.service';

@Module({
  imports: [RagModule],
  providers: [CategorizationMemoryService],
  exports: [CategorizationMemoryService],
})
export class CategorizationMemoryModule {}