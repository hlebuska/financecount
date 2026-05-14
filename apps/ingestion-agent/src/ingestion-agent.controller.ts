import { Controller, Get } from '@nestjs/common';
import { IngestionAgentService } from './ingestion-agent.service';

@Controller()
export class IngestionAgentController {
  constructor(private readonly ingestionAgentService: IngestionAgentService) {}

  @Get()
  getHello(): string {
    return this.ingestionAgentService.getHello();
  }
}
