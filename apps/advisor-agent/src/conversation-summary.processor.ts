import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  CONVERSATION_SUMMARY_QUEUE,
  PROCESS_CONVERSATION_SUMMARY_JOB,
  ProcessConversationSummaryJobPayload,
} from '@app/contracts';
import { Job } from 'bullmq';
import { ConversationsService } from './conversations.service';

@Processor(CONVERSATION_SUMMARY_QUEUE, {
  concurrency: 1,
})
export class ConversationSummaryProcessor extends WorkerHost {
  constructor(private readonly conversationsService: ConversationsService) {
    super();
  }

  async process(job: Job<ProcessConversationSummaryJobPayload>) {
    if (job.name !== PROCESS_CONVERSATION_SUMMARY_JOB) {
      return;
    }

    await this.conversationsService.refreshConversationSummary(job.data.conversationId);
  }

  @OnWorkerEvent('failed')
  onFailed(_job: Job<ProcessConversationSummaryJobPayload> | undefined, _error: Error) {
    return;
  }
}
