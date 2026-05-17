import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ANALYSIS_REFRESH_QUEUE, PROCESS_ANALYSIS_REFRESH_JOB, ProcessAnalysisRefreshJobPayload } from '@app/contracts';
import { DbService } from '@app/db';
import { Queue } from 'bullmq';
import { getAnalysisMonthWindow, getAnalysisWeekWindow, uniqueIsoDates } from './analysis-periods';

const ANALYSIS_REFRESH_DEBOUNCE_MS = 30_000;
const REMOVABLE_JOB_STATES = new Set(['delayed', 'waiting', 'waiting-children', 'prioritized']);

@Injectable()
export class AnalysisRefreshSchedulerService {
  private readonly logger = new Logger(AnalysisRefreshSchedulerService.name);

  constructor(
    private readonly prisma: DbService,
    @InjectQueue(ANALYSIS_REFRESH_QUEUE)
    private readonly analysisRefreshQueue: Queue<ProcessAnalysisRefreshJobPayload>,
  ) {}

  async requestRefresh(params: { userId: string; occurredAtDates: Date[]; reason: string }) {
    const weekStarts = uniqueIsoDates(
      params.occurredAtDates.map((occurredAt) => getAnalysisWeekWindow(occurredAt).periodStart),
    );
    const monthStarts = uniqueIsoDates(
      params.occurredAtDates.map((occurredAt) => getAnalysisMonthWindow(occurredAt).periodStart),
    );

    const existing = await this.prisma.analysisRefreshRequest.findUnique({
      where: {
        userId: params.userId,
      },
    });

    if (existing?.queuedJobId) {
      const existingJob = await this.analysisRefreshQueue.getJob(existing.queuedJobId);

      if (existingJob) {
        const state = await existingJob.getState();

        if (REMOVABLE_JOB_STATES.has(state)) {
          await existingJob.remove().catch(() => undefined);
        }
      }
    }

    const queuedJobId = `analysis-refresh:${params.userId}:${Date.now()}`;

    await this.prisma.analysisRefreshRequest.upsert({
      where: {
        userId: params.userId,
      },
      update: {
        dirtyWeekStarts: [
          ...new Set([...(this.readIsoArray(existing?.dirtyWeekStarts)), ...weekStarts]),
        ] as never,
        dirtyMonthStarts: [
          ...new Set([...(this.readIsoArray(existing?.dirtyMonthStarts)), ...monthStarts]),
        ] as never,
        latestReason: params.reason,
        queuedJobId,
        requestedAt: new Date(),
      },
      create: {
        userId: params.userId,
        dirtyWeekStarts: weekStarts as never,
        dirtyMonthStarts: monthStarts as never,
        latestReason: params.reason,
        queuedJobId,
      },
    });

    await this.analysisRefreshQueue.add(
      PROCESS_ANALYSIS_REFRESH_JOB,
      {
        userId: params.userId,
      },
      {
        jobId: queuedJobId,
        delay: ANALYSIS_REFRESH_DEBOUNCE_MS,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2_000,
        },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );

    this.logger.log(`Scheduled analysis refresh for user ${params.userId}`);
  }

  private readIsoArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is string => typeof item === 'string');
  }
}
