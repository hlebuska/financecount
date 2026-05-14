import { Module } from '@nestjs/common';
import { AdvisorAgentController } from './advisor-agent.controller';
import { AdvisorAgentService } from './advisor-agent.service';

@Module({
  imports: [],
  controllers: [AdvisorAgentController],
  providers: [AdvisorAgentService],
})
export class AdvisorAgentModule {}
