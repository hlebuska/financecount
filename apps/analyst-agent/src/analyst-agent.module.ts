import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { ANALYSIS_REFRESH_QUEUE } from '@app/contracts';
import { DbModule } from '@app/db';
import { AnalystAgentController } from './analyst-agent.controller';
import { AnalysisRefreshProcessor } from './analysis-refresh.processor';
import { AnalystAgentService } from './analyst-agent.service';

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
      name: ANALYSIS_REFRESH_QUEUE,
    }),
  ],
  controllers: [AnalystAgentController],
  providers: [AnalystAgentService, AnalysisRefreshProcessor],
})
export class AnalystAgentModule {}
