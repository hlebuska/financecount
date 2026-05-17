import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  FILE_INGESTION_QUEUE,
  PROCESS_INGESTION_FILE_JOB,
  ProcessIngestionFileJobPayload,
} from '@app/contracts';
import { DbService } from '@app/db';
import { FileProcessingStatus, RawTransactionStatus } from '@prisma/client';
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
  constructor(
    private readonly prisma: DbService,
    private readonly parserClient: ParserClientService,
    private readonly transactionStructurer: TransactionStructurerService,
    private readonly transactionNormalizer: TransactionNormalizerService,
    private readonly transactionDeduplication: TransactionDeduplicationService,
    private readonly transactionCategorizer: TransactionCategorizerService,
    private readonly transactionFinalizer: TransactionFinalizerService,
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

    const parserOutputText = await this.parserClient.parseFile(file.storagePath);
    const structuredRows = await this.transactionStructurer.structure(parserOutputText);

    for (const row of structuredRows) {
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
        continue;
      }

      const duplicateCheck = await this.transactionDeduplication.checkDuplicate({
        userId: file.userId,
        normalized: normalizedResult.data,
      });

      if (duplicateCheck.isDuplicate) {
        await this.transactionFinalizer.markDuplicate(rawTransaction.id, file.id, duplicateCheck);
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

      const enrichment = await this.transactionCategorizer.persistEnrichment(
        rawTransaction.id,
        normalizedResult.data,
        rawTransaction.rawDescription,
      );

      const categorization = await this.transactionCategorizer.categorize({
        userId: file.userId,
        rawDescription: rawTransaction.rawDescription,
        normalized: normalizedResult.data,
        enrichment,
      });

      await this.transactionFinalizer.finalize({
        fileId: file.id,
        userId: file.userId,
        rawTransaction,
        normalized: normalizedResult.data,
        categorization,
      });
    }

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
        parserOutputText,
        processingFinishedAt: new Date(),
        errorMessage: null,
        extractedTransactionsCount: structuredRows.length,
        normalizedTransactionsCount,
        duplicateTransactionsCount,
        invalidTransactionsCount,
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
