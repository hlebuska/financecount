import { Processor, WorkerHost } from '@nestjs/bullmq';
import {
  FILE_INGESTION_QUEUE,
  PROCESS_INGESTION_FILE_JOB,
  ProcessIngestionFileJobPayload,
} from '@app/contracts';
import { DbService } from '@app/db';
import { FileProcessingStatus } from '@prisma/client';
import { Job } from 'bullmq';

@Processor(FILE_INGESTION_QUEUE, {
  concurrency: 1,
})
export class FileIngestionProcessor extends WorkerHost {
  constructor(private readonly prisma: DbService) {
    super();
  }

  async process(job: Job<ProcessIngestionFileJobPayload>) {
    if (job.name !== PROCESS_INGESTION_FILE_JOB) {
      return;
    }

    const { fileId } = job.data;

    const file = await this.prisma.ingestionFile.findUnique({
      where: {
        id: fileId,
      },
    });

    if (!file) {
      throw new Error(`Ingestion file not found: ${fileId}`);
    }

    if (
      file.status === FileProcessingStatus.COMPLETED ||
      file.status === FileProcessingStatus.DUPLICATE_FILE
    ) {
      return {
        skipped: true,
        reason: `File already has terminal status: ${file.status}`,
      };
    }

    await this.prisma.ingestionFile.update({
      where: {
        id: fileId,
      },
      data: {
        status: FileProcessingStatus.PROCESSING,
        processingStartedAt: new Date(),
        processingAttemptCount: {
          increment: 1,
        },
      },
    });

    console.log(`Processing file: ${file.originalName}`);
    console.log(`Path: ${file.storagePath}`);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const completed = await this.prisma.ingestionFile.update({
      where: {
        id: fileId,
      },
      data: {
        status: FileProcessingStatus.COMPLETED,
        processingFinishedAt: new Date(),
        errorMessage: null,
      },
    });

    return {
      fileId: completed.id,
      status: completed.status,
    };
  }
}
