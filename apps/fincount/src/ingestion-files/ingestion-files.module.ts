import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DbModule } from '@app/db';
import { FILE_INGESTION_QUEUE } from '@app/contracts';
import { IngestionFilesController } from './ingestion-files.controller';
import { IngestionFilesService } from './ingestion-files.service';

@Module({
  imports: [
    DbModule,
    BullModule.registerQueue({
      name: FILE_INGESTION_QUEUE,
    }),
  ],
  controllers: [IngestionFilesController],
  providers: [IngestionFilesService],
})
export class IngestionFilesModule {}
