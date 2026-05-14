import { Controller, Get } from '@nestjs/common';
import { AnalystAgentService } from './analyst-agent.service';

@Controller()
export class AnalystAgentController {
  constructor(private readonly analystAgentService: AnalystAgentService) {}

  @Get()
  getHello(): string {
    return this.analystAgentService.getHello();
  }
}
