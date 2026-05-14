import { Controller, Get } from '@nestjs/common';
import { AdvisorAgentService } from './advisor-agent.service';

@Controller()
export class AdvisorAgentController {
  constructor(private readonly advisorAgentService: AdvisorAgentService) {}

  @Get()
  getHello(): string {
    return this.advisorAgentService.getHello();
  }
}
