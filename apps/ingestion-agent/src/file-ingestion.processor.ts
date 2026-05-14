import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  FILE_INGESTION_QUEUE,
  PROCESS_INGESTION_FILE_JOB,
  ProcessIngestionFileJobPayload,
} from '@app/contracts';
import { DbService } from '@app/db';
import { FileProcessingStatus, Prisma } from '@prisma/client';
import { Job } from 'bullmq';
import { ParserClientService } from './parser-client.service';
import { TransactionStructurerService } from './transaction-structurer.service';

@Processor(FILE_INGESTION_QUEUE, {
  concurrency: 1,
})
export class FileIngestionProcessor extends WorkerHost {
  constructor(
    private readonly prisma: DbService,
    private readonly parserClient: ParserClientService,
    private readonly transactionStructurer: TransactionStructurerService,
  ) {
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

    const parserOutputText = await this.parserClient.parseFile(file.storagePath);
    const structuredRows = await this.transactionStructurer.structure(parserOutputText);

    if (structuredRows.length > 0) {
      await this.prisma.rawExtractedTransaction.createMany({
        data: structuredRows.map((row) => ({
          fileId: file.id,
          userId: file.userId,
          sourceRowIndex: row.sourceRowIndex,
          rawDescription: row.rawDescription,
          rawAmountText: row.rawAmountText,
          rawCurrencyText: row.rawCurrencyText,
          rawDirectionText: row.rawDirectionText,
          rawDateText: row.rawDateText,
          rawPayload: row.rawPayload as Prisma.InputJsonValue | undefined,
        })),
      });
    }

    const completed = await this.prisma.ingestionFile.update({
      where: {
        id: fileId,
      },
      data: {
        status: FileProcessingStatus.COMPLETED,
        parserOutputText,
        processingFinishedAt: new Date(),
        errorMessage: null,
        extractedTransactionsCount: structuredRows.length,
      },
    });

    return {
      fileId: completed.id,
      status: completed.status,
    };
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<ProcessIngestionFileJobPayload> | undefined, error: Error) {
    const fileId = job?.data.fileId;

    if (!fileId) {
      return;
    }

    await this.prisma.ingestionFile.update({
      where: {
        id: fileId,
      },
      data: {
        status: FileProcessingStatus.FAILED,
        processingFinishedAt: new Date(),
        errorMessage: error.message,
      },
    });
  }
}
