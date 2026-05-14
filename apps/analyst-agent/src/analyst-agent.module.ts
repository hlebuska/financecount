import { Module } from '@nestjs/common';
import { AnalystAgentController } from './analyst-agent.controller';
import { AnalystAgentService } from './analyst-agent.service';

@Module({
  imports: [],
  controllers: [AnalystAgentController],
  providers: [AnalystAgentService],
})
export class AnalystAgentModule {}
