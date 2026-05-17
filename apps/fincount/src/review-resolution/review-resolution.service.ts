import { Injectable } from '@nestjs/common';
import { DbService } from '@app/db';
import { CategorizationMemoryService } from '../../../../libs/categorization-memory/categorization-memory.service';
import { ResolveCategoryReviewDto } from './dto/resolve-category-review.dto';

@Injectable()
export class ReviewResolutionService {
  constructor(
    private readonly prisma: DbService,
    private readonly categorizationMemoryService: CategorizationMemoryService,
  ) {}

  async resolveCategoryReview(dto: ResolveCategoryReviewDto) {
    const transaction = await this.prisma.transaction.update({
      where: {
        id: dto.transactionId,
      },
      data: {
        categoryId: dto.categoryId,
        categoryStatus: 'CATEGORIZED',
        reviewItems: {
          update: {
            where: {
              id: dto.reviewItemId,
            },
            data: {
              status: 'RESOLVED',
            },
          },
        },
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

    await this.categorizationMemoryService.upsertFromResolvedTransaction(transaction);

    return transaction;
  }
}