import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { AnalysisRefreshSchedulerService } from '@app/common';
import {
  FILE_INGESTION_QUEUE,
  PROCESS_INGESTION_FILE_JOB,
  ProcessIngestionFileJobPayload,
} from '@app/contracts';
import { DbService } from '@app/db';
import { FileProcessingStatus, IngestionFileStage, RawTransactionStatus } from '@prisma/client';
import { Job } from 'bullmq';
import { ParserClientService } from './parser-client.service';
import { TransactionCategorizerService } from './transaction-categorizer.service';
import { TransactionDeduplicationService } from './transaction-deduplication.service';
import { TransactionFinalizerService } from './transaction-finalizer.service';
import { TransactionNormalizerService } from './transaction-normalizer.service';
import { TransactionStructurerService } from './transaction-structurer.service';

@Processor(FILE_INGESTION_QUEUE, {
  concurrency: 1,
})
export class FileIngestionProcessor extends WorkerHost {
  private static readonly terminalStatuses = new Set<FileProcessingStatus>([
    FileProcessingStatus.COMPLETED,
    FileProcessingStatus.COMPLETED_WITH_WARNINGS,
    FileProcessingStatus.DUPLICATE_FILE,
  ]);

  constructor(
    private readonly prisma: DbService,
    private readonly parserClient: ParserClientService,
    private readonly transactionStructurer: TransactionStructurerService,
    private readonly transactionNormalizer: TransactionNormalizerService,
    private readonly transactionDeduplication: TransactionDeduplicationService,
    private readonly transactionCategorizer: TransactionCategorizerService,
    private readonly transactionFinalizer: TransactionFinalizerService,
    private readonly analysisRefreshSchedulerService: AnalysisRefreshSchedulerService,
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

    if (FileIngestionProcessor.terminalStatuses.has(file.status)) {
      return {
        skipped: true,
        reason: `File already has terminal status: ${file.status}`,
      };
    }

    await this.updateFileProgress(fileId, {
      status: FileProcessingStatus.PROCESSING,
      stage: IngestionFileStage.PARSING_FILE,
      message: 'Parsing the uploaded file.',
      progressPercent: 5,
      createEvent: true,
      processingStartedAt: new Date(),
      processingAttemptCount: {
        increment: 1,
      },
    });

    const parserOutputText = await this.parserClient.parseFile(file.storagePath);

    await this.updateFileProgress(fileId, {
      stage: IngestionFileStage.STRUCTURING_TRANSACTIONS,
      message: 'Transforming parsed text into transaction rows.',
      progressPercent: 20,
      createEvent: true,
    });

    const structuredRows = await this.transactionStructurer.structure(parserOutputText);

    await this.updateFileProgress(fileId, {
      stage: IngestionFileStage.PROCESSING_TRANSACTIONS,
      message:
        structuredRows.length > 0
          ? `Processing 0 of ${structuredRows.length} transaction rows.`
          : 'No transaction rows were extracted from the file.',
      progressPercent: structuredRows.length > 0 ? 25 : 90,
      totalRows: structuredRows.length,
      processedRows: 0,
      currentRowIndex: structuredRows.length > 0 ? 0 : null,
      createEvent: true,
    });

    for (const [index, row] of structuredRows.entries()) {
      const rowNumber = index + 1;

      await this.updateFileProgress(fileId, {
        stage: IngestionFileStage.PROCESSING_TRANSACTIONS,
        message: `Normalizing transaction row ${rowNumber} of ${structuredRows.length}.`,
        currentRowIndex: rowNumber,
        processedRows: index,
        progressPercent: this.getRowProgressPercent(index, structuredRows.length),
      });

      const rawTransaction = await this.prisma.rawExtractedTransaction.create({
        data: {
          fileId: file.id,
          userId: file.userId,
          sourceRowIndex: row.sourceRowIndex,
          rawDescription: row.rawDescription,
          rawAmountText: row.rawAmountText,
          rawCurrencyText: row.rawCurrencyText,
          rawDirectionText: row.rawDirectionText,
          rawDateText: row.rawDateText,
          rawPayload: row.rawPayload as never,
          parserConfidence:
            typeof row.rawPayload?.confidence === 'number' ? row.rawPayload.confidence : null,
        },
      });

      const normalizedResult = this.transactionNormalizer.normalize(rawTransaction);

      if (!normalizedResult.data || normalizedResult.reason) {
        await this.transactionFinalizer.markInvalid(
          rawTransaction.id,
          file.id,
            normalizedResult.reason ?? 'Transaction could not be normalized.',
        );

        await this.updateFileProgress(fileId, {
          stage: IngestionFileStage.PROCESSING_TRANSACTIONS,
          message: `Processed ${rowNumber} of ${structuredRows.length} rows.`,
          processedRows: rowNumber,
          progressPercent: this.getRowProgressPercent(rowNumber, structuredRows.length),
        });
        continue;
      }

      await this.updateFileProgress(fileId, {
        stage: IngestionFileStage.PROCESSING_TRANSACTIONS,
        message: `Checking row ${rowNumber} of ${structuredRows.length} for duplicates.`,
        currentRowIndex: rowNumber,
        processedRows: index,
        progressPercent: this.getRowProgressPercent(index, structuredRows.length),
      });

      const duplicateCheck = await this.transactionDeduplication.checkDuplicate({
        userId: file.userId,
        normalized: normalizedResult.data,
      });

      if (duplicateCheck.isDuplicate) {
        await this.transactionFinalizer.markDuplicate(rawTransaction.id, file.id, duplicateCheck);

        await this.updateFileProgress(fileId, {
          stage: IngestionFileStage.PROCESSING_TRANSACTIONS,
          message: `Processed ${rowNumber} of ${structuredRows.length} rows.`,
          processedRows: rowNumber,
          progressPercent: this.getRowProgressPercent(rowNumber, structuredRows.length),
        });
        continue;
      }

      await this.prisma.rawExtractedTransaction.update({
        where: {
          id: rawTransaction.id,
        },
        data: {
          normalizedAmount: normalizedResult.data.amount,
          normalizedCurrency: normalizedResult.data.currency,
          normalizedDirection: normalizedResult.data.direction,
          normalizedOccurredAt: normalizedResult.data.occurredAt,
          normalizedMerchantCandidate: normalizedResult.data.merchantCandidate,
          sourceFingerprint: normalizedResult.data.sourceFingerprint,
          fuzzyFingerprint: normalizedResult.data.fuzzyFingerprint,
        },
      });

      await this.updateFileProgress(fileId, {
        stage: IngestionFileStage.CATEGORIZING_TRANSACTIONS,
        message: `Categorizing row ${rowNumber} of ${structuredRows.length}.`,
        currentRowIndex: rowNumber,
        processedRows: index,
        progressPercent: this.getRowProgressPercent(index, structuredRows.length),
      });

      const categorization = await this.transactionCategorizer.categorize({
        userId: file.userId,
        rawExtractedTransactionId: rawTransaction.id,
        rawDescription: rawTransaction.rawDescription,
        normalized: normalizedResult.data,
      });

      await this.transactionFinalizer.finalize({
        fileId: file.id,
        userId: file.userId,
        rawTransaction,
        normalized: normalizedResult.data,
        categorization,
      });

      await this.updateFileProgress(fileId, {
        stage: IngestionFileStage.PROCESSING_TRANSACTIONS,
        message: `Processed ${rowNumber} of ${structuredRows.length} rows.`,
        processedRows: rowNumber,
        progressPercent: this.getRowProgressPercent(rowNumber, structuredRows.length),
      });
    }

    await this.updateFileProgress(fileId, {
      stage: IngestionFileStage.FINALIZING_FILE,
      message: 'Finalizing file-level totals and status.',
      currentRowIndex: structuredRows.length > 0 ? structuredRows.length : null,
      processedRows: structuredRows.length,
      progressPercent: 95,
      createEvent: true,
    });

    const counts = await this.prisma.rawExtractedTransaction.groupBy({
      by: ['status'],
      where: {
        fileId,
      },
      _count: {
        _all: true,
      },
    });

    const countMap = new Map(counts.map((entry) => [entry.status, entry._count._all]));
    const invalidTransactionsCount = countMap.get(RawTransactionStatus.INVALID) ?? 0;
    const duplicateTransactionsCount = countMap.get(RawTransactionStatus.SKIPPED_DUPLICATE) ?? 0;
    const normalizedTransactionsCount =
      (countMap.get(RawTransactionStatus.NORMALIZED) ?? 0) +
      (countMap.get(RawTransactionStatus.NEEDS_REVIEW) ?? 0);
    const hasWarnings =
      invalidTransactionsCount > 0 ||
      duplicateTransactionsCount > 0 ||
      (countMap.get(RawTransactionStatus.NEEDS_REVIEW) ?? 0) > 0;

    const completed = await this.prisma.ingestionFile.update({
      where: {
        id: fileId,
      },
      data: {
        status: hasWarnings
          ? FileProcessingStatus.COMPLETED_WITH_WARNINGS
          : FileProcessingStatus.COMPLETED,
        currentStage: IngestionFileStage.COMPLETED,
        currentStageMessage: hasWarnings
          ? 'Processing finished with warnings.'
          : 'Processing finished successfully.',
        progressPercent: 100,
        totalRows: structuredRows.length,
        processedRows: structuredRows.length,
        currentRowIndex: structuredRows.length > 0 ? structuredRows.length : null,
        parserOutputText,
        processingFinishedAt: new Date(),
        errorMessage: null,
        extractedTransactionsCount: structuredRows.length,
        normalizedTransactionsCount,
        duplicateTransactionsCount,
        invalidTransactionsCount,
        processingEvents: {
          create: {
            stage: IngestionFileStage.COMPLETED,
            message: hasWarnings
              ? 'File processing completed with warnings.'
              : 'File processing completed successfully.',
            metadata: {
              extractedTransactionsCount: structuredRows.length,
              normalizedTransactionsCount,
              duplicateTransactionsCount,
              invalidTransactionsCount,
            } as never,
          },
        },
      },
    });

    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId: file.userId,
        rawExtractedTransaction: {
          is: {
            fileId,
          },
        },
      },
      select: {
        occurredAt: true,
      },
    });

    if (transactions.length > 0) {
      await this.analysisRefreshSchedulerService.requestRefresh({
        userId: file.userId,
        occurredAtDates: transactions.map((transaction) => transaction.occurredAt),
        reason: 'ingestion_completion',
      });
    }

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
        currentStage: IngestionFileStage.FAILED,
        currentStageMessage: error.message,
        processingFinishedAt: new Date(),
        errorMessage: error.message,
        processingEvents: {
          create: {
            stage: IngestionFileStage.FAILED,
            message: 'File processing failed.',
            metadata: {
              errorMessage: error.message,
            } as never,
          },
        },
      },
    });
  }

  private getRowProgressPercent(processedRows: number, totalRows: number) {
    if (totalRows <= 0) {
      return 90;
    }

    const progressRangeStart = 25;
    const progressRangeSize = 65;

    return Math.min(
      90,
      progressRangeStart + Math.round((processedRows / totalRows) * progressRangeSize),
    );
  }

  private async updateFileProgress(
    fileId: string,
    params: {
      status?: FileProcessingStatus;
      stage: IngestionFileStage;
      message: string;
      progressPercent: number;
      totalRows?: number;
      processedRows?: number;
      currentRowIndex?: number | null;
      processingStartedAt?: Date;
      processingAttemptCount?: {
        increment: number;
      };
      eventMetadata?: Record<string, unknown>;
      createEvent?: boolean;
    },
  ) {
    const data: Record<string, unknown> = {
      status: params.status,
      currentStage: params.stage,
      currentStageMessage: params.message,
      progressPercent: params.progressPercent,
      totalRows: params.totalRows,
      processedRows: params.processedRows,
      currentRowIndex: params.currentRowIndex,
      processingStartedAt: params.processingStartedAt,
      processingAttemptCount: params.processingAttemptCount,
    };

    if (params.createEvent) {
      data.processingEvents = {
        create: {
          stage: params.stage,
          message: params.message,
          metadata: params.eventMetadata as never,
        },
      };
    }

    await this.prisma.ingestionFile.update({
      where: {
        id: fileId,
      },
      data,
    });
  }
}
