import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { CONVERSATION_SUMMARY_QUEUE } from '@app/contracts';
import { DbModule } from '@app/db';
import { RagModule } from '../../../libs/rag/rag.module';
import { AdvisorAgentController } from './advisor-agent.controller';
import { AdvisorAgentService } from './advisor-agent.service';
import { AdvisorKnowledgeService } from './advisor-knowledge.service';
import { AdvisorRetrievalService } from './advisor-retrieval.service';
import { ConversationSummaryProcessor } from './conversation-summary.processor';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DbModule,
    RagModule,
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    }),
    BullModule.registerQueue({
      name: CONVERSATION_SUMMARY_QUEUE,
    }),
  ],
  controllers: [AdvisorAgentController],
  providers: [
    AdvisorAgentService,
    AdvisorKnowledgeService,
    AdvisorRetrievalService,
    ConversationsService,
    ConversationSummaryProcessor,
  ],
})
export class AdvisorAgentModule {}
