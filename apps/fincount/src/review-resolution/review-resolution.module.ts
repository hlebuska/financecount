import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ANALYSIS_REFRESH_QUEUE } from '@app/contracts';
import { AnalysisRefreshSchedulerService } from '@app/common';
import { DbModule } from '@app/db';
import { ReviewResolutionController } from './review-resolution.controller';
import { ReviewResolutionService } from './review-resolution.service';
import { CategorizationMemoryModule } from '../../../../libs/categorization-memory/categorization-memory.module';

@Module({
  imports: [
    DbModule,
    CategorizationMemoryModule,
    BullModule.registerQueue({
      name: ANALYSIS_REFRESH_QUEUE,
    }),
  ],
  controllers: [ReviewResolutionController],
  providers: [ReviewResolutionService, AnalysisRefreshSchedulerService],
})
export class ReviewResolutionModule {}
