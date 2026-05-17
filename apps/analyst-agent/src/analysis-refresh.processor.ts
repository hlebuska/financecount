import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  ANALYSIS_REFRESH_QUEUE,
  PROCESS_ANALYSIS_REFRESH_JOB,
  ProcessAnalysisRefreshJobPayload,
} from '@app/contracts';
import { Job } from 'bullmq';
import { AnalystAgentService } from './analyst-agent.service';

@Processor(ANALYSIS_REFRESH_QUEUE, {
  concurrency: 1,
})
export class AnalysisRefreshProcessor extends WorkerHost {
  constructor(private readonly analystAgentService: AnalystAgentService) {
    super();
  }

  async process(job: Job<ProcessAnalysisRefreshJobPayload>) {
    if (job.name !== PROCESS_ANALYSIS_REFRESH_JOB) {
      return;
    }

    return this.analystAgentService.refreshUserAnalysis(job.data.userId, String(job.id));
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<ProcessAnalysisRefreshJobPayload> | undefined, error: Error) {
    if (!job?.data.userId) {
      return;
    }

    this.analystAgentService.logger.error(
      `Analysis refresh failed for user ${job.data.userId}`,
      error.stack,
    );
  }
}
