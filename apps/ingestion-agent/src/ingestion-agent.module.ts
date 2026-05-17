import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { ANALYSIS_REFRESH_QUEUE, FILE_INGESTION_QUEUE } from '@app/contracts';
import { AnalysisRefreshSchedulerService } from '@app/common';
import { DbModule } from '@app/db';
import { FileIngestionProcessor } from './file-ingestion.processor';
import { MerchantEnrichmentService } from './merchant-enrichment.service';
import { ParserClientService } from './parser-client.service';
import { TransactionCategorizerService } from './transaction-categorizer.service';
import { TransactionDeduplicationService } from './transaction-deduplication.service';
import { TransactionFinalizerService } from './transaction-finalizer.service';
import { TransactionNormalizerService } from './transaction-normalizer.service';
import { TransactionStructurerService } from './transaction-structurer.service';
import { CategorizationMemoryModule } from '../../../libs/categorization-memory/categorization-memory.module';

@Module({
  imports: [
    CategorizationMemoryModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    HttpModule,
    DbModule,
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
  ],
  providers: [
    AnalysisRefreshSchedulerService,
    FileIngestionProcessor,
    MerchantEnrichmentService,
    ParserClientService,
    TransactionCategorizerService,
    TransactionDeduplicationService,
    TransactionFinalizerService,
    TransactionNormalizerService,
    TransactionStructurerService,
  ],
})
export class IngestionAgentModule {}
