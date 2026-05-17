import { Injectable } from '@nestjs/common';
import { DbService } from '@app/db';
import { ReviewItemStatus, ReviewItemType } from '@prisma/client';
import { CategorizationMemoryService } from '../../../../libs/categorization-memory/categorization-memory.service';
import { ResolveCategoryReviewDto } from './dto/resolve-category-review.dto';

@Injectable()
export class ReviewResolutionService {
  constructor(
    private readonly prisma: DbService,
    private readonly categorizationMemoryService: CategorizationMemoryService,
  ) {}

  async resolveCategoryReview(dto: ResolveCategoryReviewDto) {
    const transaction = await this.prisma.$transaction(async (tx) => {
      const updatedTransaction = await tx.transaction.update({
        where: {
          id: dto.transactionId,
        },
        data: {
          categoryId: dto.categoryId,
          categoryStatus: 'CATEGORIZED',
        },
      });

      if (dto.reviewItemId) {
        await tx.reviewItem.update({
          where: {
            id: dto.reviewItemId,
          },
          data: {
            status: ReviewItemStatus.RESOLVED,
          },
        });
      } else {
        await tx.reviewItem.create({
          data: {
            userId: updatedTransaction.userId,
            rawExtractedTransactionId: updatedTransaction.rawExtractedTransactionId,
            transactionId: updatedTransaction.id,
            type: ReviewItemType.UNCATEGORIZED_TRANSACTION,
            status: ReviewItemStatus.RESOLVED,
            message: 'Category changed manually by the user to improve future categorization.',
          },
        });
      }

      const resolvedTransaction = await tx.transaction.findFirst({
        where: {
          id: dto.transactionId,
        },
        include: {
          category: true,
          reviewItems: {
            select: {
              id: true,
              status: true,
              message: true,
            },
          },
        },
      });

      if (!resolvedTransaction) {
        throw new Error(`Transaction not found after category resolution: ${dto.transactionId}`);
      }

      return resolvedTransaction;
    });

    await this.categorizationMemoryService.upsertFromResolvedTransaction(transaction);

    return transaction;
  }
}
