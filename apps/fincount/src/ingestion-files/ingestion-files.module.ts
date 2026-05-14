import { Module } from '@nestjs/common';
import { DbModule } from '@app/db';
import { IngestionFilesController } from './ingestion-files.controller';
import { IngestionFilesService } from './ingestion-files.service';

@Module({
  imports: [DbModule],
  controllers: [IngestionFilesController],
  providers: [IngestionFilesService],
})
export class IngestionFilesModule {}
