import { Injectable } from '@nestjs/common';
import { DbService } from '@app/db';
import {
  IngestionIssueSeverity,
  IngestionIssueType,
  Prisma,
  RawExtractedTransaction,
  RawTransactionStatus,
  ReviewItemType,
  TransactionCategoryStatus,
} from '@prisma/client';
import { CategorizationResult, DuplicateCheckResult, NormalizedTransactionData } from './ingestion.types';

@Injectable()
export class TransactionFinalizerService {
  constructor(private readonly prisma: DbService) {}

  async markInvalid(rawTransactionId: string, fileId: string, reason: string) {
    await this.prisma.$transaction([
      this.prisma.rawExtractedTransaction.update({
        where: { id: rawTransactionId },
        data: {
          status: RawTransactionStatus.INVALID,
          skipReason: reason,
        },
      }),
      this.prisma.ingestionIssue.create({
        data: {
          fileId,
          rawExtractedTransactionId: rawTransactionId,
          severity: IngestionIssueSeverity.WARNING,
          type: IngestionIssueType.MALFORMED_TRANSACTION,
          message: reason,
        },
      }),
    ]);
  }

  async markDuplicate(
    rawTransactionId: string,
    fileId: string,
    duplicateCheck: DuplicateCheckResult,
  ) {
    const reason = `${duplicateCheck.duplicateType ?? 'exact'} duplicate transaction detected.`;

    await this.prisma.$transaction([
      this.prisma.rawExtractedTransaction.update({
        where: { id: rawTransactionId },
        data: {
          status: RawTransactionStatus.SKIPPED_DUPLICATE,
          skipReason: reason,
        },
      }),
      this.prisma.ingestionIssue.create({
        data: {
          fileId,
          rawExtractedTransactionId: rawTransactionId,
          severity: IngestionIssueSeverity.INFO,
          type: IngestionIssueType.DUPLICATE_TRANSACTION,
          message: reason,
        },
      }),
    ]);
  }

  async finalize(params: {
    fileId: string;
    userId: string;
    rawTransaction: RawExtractedTransaction;
    normalized: NormalizedTransactionData;
    categorization: CategorizationResult;
  }) {
    const transactionData: Prisma.TransactionUncheckedCreateInput = {
      userId: params.userId,
      rawExtractedTransactionId: params.rawTransaction.id,
      amount: params.normalized.amount,
      currency: params.normalized.currency,
      direction: params.normalized.direction,
      occurredAt: params.normalized.occurredAt,
      rawMerchantLabel: params.rawTransaction.rawDescription,
      normalizedMerchantName: params.categorization.normalizedMerchantName,
      categoryId:
        params.categorization.categoryStatus === TransactionCategoryStatus.CATEGORIZED
          ? params.categorization.categoryId
          : null,
      categoryStatus: params.categorization.categoryStatus,
      businessType: params.categorization.businessType,
      merchantConfidence: params.categorization.confidence,
      sourceFingerprint: params.normalized.sourceFingerprint,
      fuzzyFingerprint: params.normalized.fuzzyFingerprint,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.rawExtractedTransaction.update({
        where: { id: params.rawTransaction.id },
        data: {
          status:
            params.categorization.categoryStatus === TransactionCategoryStatus.CATEGORIZED
              ? RawTransactionStatus.NORMALIZED
              : RawTransactionStatus.NEEDS_REVIEW,
          skipReason: null,
          normalizedAmount: params.normalized.amount,
          normalizedCurrency: params.normalized.currency,
          normalizedDirection: params.normalized.direction,
          normalizedOccurredAt: params.normalized.occurredAt,
          normalizedMerchantCandidate: params.normalized.merchantCandidate,
          sourceFingerprint: params.normalized.sourceFingerprint,
          fuzzyFingerprint: params.normalized.fuzzyFingerprint,
        },
      });

      const transaction = await tx.transaction.create({
        data: transactionData,
      });

      if (params.categorization.categoryStatus === TransactionCategoryStatus.UNCATEGORIZED) {
        await tx.reviewItem.create({
          data: {
            userId: params.userId,
            rawExtractedTransactionId: params.rawTransaction.id,
            transactionId: transaction.id,
            type: ReviewItemType.UNCATEGORIZED_TRANSACTION,
            message: 'Transaction could not be categorized confidently.',
          },
        });

        await tx.ingestionIssue.create({
          data: {
            fileId: params.fileId,
            rawExtractedTransactionId: params.rawTransaction.id,
            severity: IngestionIssueSeverity.INFO,
            type: IngestionIssueType.LOW_CONFIDENCE_CATEGORY,
            message: 'Transaction stored as uncategorized.',
          },
        });
      }
    });
  }
}
