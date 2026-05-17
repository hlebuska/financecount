import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { FILE_INGESTION_QUEUE } from '@app/contracts';
import { ANALYSIS_REFRESH_QUEUE } from '@app/contracts';
import { IngestionFilesModule } from './ingestion-files/ingestion-files.module';
import { TransactionsModule } from './transactions/transactions.module';
import { CategoriesService } from './categories/categories.service';
import { CategoriesModule } from './categories/categories.module';
import { ReviewResolutionModule } from './review-resolution/review-resolution.module';
import { CategorizationMemoryService } from '../../../libs/categorization-memory/categorization-memory.service';
import { CategorizationMemoryModule } from '../../../libs/categorization-memory/categorization-memory.module';
import { AnalysisModule } from './analysis/analysis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    }),
    BullModule.registerQueue({
      name: FILE_INGESTION_QUEUE,
    }),
    BullModule.registerQueue({
      name: ANALYSIS_REFRESH_QUEUE,
    }),
    IngestionFilesModule,
    TransactionsModule,
    CategoriesModule,
    ReviewResolutionModule,
    CategorizationMemoryModule,
    AnalysisModule,
  ],
})
export class AppModule {}
