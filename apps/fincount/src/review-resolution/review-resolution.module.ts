import { Module } from '@nestjs/common';
import { DbModule } from '@app/db';
import { ReviewResolutionController } from './review-resolution.controller';
import { ReviewResolutionService } from './review-resolution.service';
import { CategorizationMemoryModule } from '../../../../libs/categorization-memory/categorization-memory.module';

@Module({
  imports: [DbModule, CategorizationMemoryModule],
  controllers: [ReviewResolutionController],
  providers: [ReviewResolutionService],
})
export class ReviewResolutionModule {}