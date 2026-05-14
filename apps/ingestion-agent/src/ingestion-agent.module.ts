import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { FILE_INGESTION_QUEUE } from '@app/contracts';
import { DbModule } from '@app/db';
import { FileIngestionProcessor } from './file-ingestion.processor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
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
  ],
  providers: [FileIngestionProcessor],
})
export class IngestionAgentModule {}
