import { Module } from '@nestjs/common';
import { IngestionAgentController } from './ingestion-agent.controller';
import { IngestionAgentService } from './ingestion-agent.service';

@Module({
  imports: [],
  controllers: [IngestionAgentController],
  providers: [IngestionAgentService],
})
export class IngestionAgentModule {}
