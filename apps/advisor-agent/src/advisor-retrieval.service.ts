import { Injectable } from '@nestjs/common';
import {
  AnalysisDimensionType,
  AnalysisPeriodType,
  ReviewItemStatus,
  TransactionDirection,
  TransactionCategoryStatus,
} from '@prisma/client';
import { getAllTimeWindow, getAnalysisMonthWindow, getAnalysisWeekWindow, getCurrentAnalysisTime } from '@app/common';
import { DbService } from '@app/db';

@Injectable()
export class AdvisorRetrievalService {
  constructor(private readonly prisma: DbService) {}

  async getOverallStats(userId: string, periodType: AnalysisPeriodType = AnalysisPeriodType.MONTH) {
    const periodStart = await this.getLatestPeriodStart(userId, periodType);

    if (!periodStart) {
      return [];
    }

    return this.prisma.financialStat.findMany({
      where: {
        userId,
        periodType,
        periodStart,
        dimensionType: AnalysisDimensionType.OVERALL,
      },
      orderBy: [{ metric: 'asc' }],
    });
  }

  async getCategoryStats(
    userId: string,
    params: { periodType?: AnalysisPeriodType; category?: string | null },
  ) {
    const periodType = params.periodType ?? AnalysisPeriodType.MONTH;
    const periodStart = await this.getLatestPeriodStart(userId, periodType);

    if (!periodStart) {
      return [];
    }

    return this.prisma.financialStat.findMany({
      where: {
        userId,
        periodType,
        periodStart,
        dimensionType: AnalysisDimensionType.CATEGORY,
        OR: params.category
          ? [
              { dimensionKey: params.category.toLowerCase() },
              { dimensionLabel: params.category },
            ]
          : undefined,
      },
      orderBy: [{ value: 'desc' }],
      take: params.category ? undefined : 10,
    });
  }

  async getTopMerchants(userId: string, periodType: AnalysisPeriodType = AnalysisPeriodType.MONTH, limit = 10) {
    const periodStart = await this.getLatestPeriodStart(userId, periodType);

    if (!periodStart) {
      return [];
    }

    return this.prisma.financialStat.findMany({
      where: {
        userId,
        periodType,
        periodStart,
        dimensionType: AnalysisDimensionType.MERCHANT,
      },
      orderBy: [{ value: 'desc' }],
      take: limit,
    });
  }

  async getAnalysisSignals(userId: string, periodType: AnalysisPeriodType = AnalysisPeriodType.MONTH, limit = 10) {
    const periodStart = await this.getLatestSignalPeriodStart(userId, periodType);

    if (!periodStart) {
      return [];
    }

    return this.prisma.analysisSignal.findMany({
      where: {
        userId,
        periodType,
        periodStart,
      },
      orderBy: [{ computedAt: 'desc' }],
      take: limit,
    });
  }

  async getRecentTransactions(
    userId: string,
    params: {
      limit?: number;
      periodType?: AnalysisPeriodType;
      category?: string | null;
      merchant?: string | null;
      direction?: TransactionDirection | null;
    },
  ) {
    const occurredAt = this.getOccurredAtWindow(params.periodType);

    return this.prisma.transaction.findMany({
      where: {
        userId,
        occurredAt,
        OR: params.category
          ? [{ category: { slug: params.category.toLowerCase() } }, { category: { name: params.category } }]
          : undefined,
        normalizedMerchantName: params.merchant
          ? {
              contains: params.merchant,
              mode: 'insensitive',
            }
          : undefined,
        direction: params.direction ?? undefined,
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
      orderBy: [{ occurredAt: 'desc' }],
      take: params.limit ?? 10,
    });
  }

  async getReviewItems(userId: string, status: ReviewItemStatus = ReviewItemStatus.OPEN, limit = 10) {
    return this.prisma.reviewItem.findMany({
      where: {
        userId,
        status,
      },
      include: {
        transaction: {
          include: {
            category: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: limit,
    });
  }

  async getConversation(id: string, userId: string) {
    return this.prisma.conversation.findFirst({
      where: {
        id,
        userId,
      },
      include: {
        messages: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });
  }

  async listConversations(userId: string) {
    return this.prisma.conversation.findMany({
      where: {
        userId,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      select: {
        id: true,
        title: true,
        updatedAt: true,
      },
    });
  }

  private async getLatestPeriodStart(userId: string, periodType: AnalysisPeriodType) {
    const latest = await this.prisma.financialStat.findFirst({
      where: {
        userId,
        periodType,
      },
      orderBy: {
        periodStart: 'desc',
      },
      select: {
        periodStart: true,
      },
    });

    return latest?.periodStart ?? null;
  }

  private async getLatestSignalPeriodStart(userId: string, periodType: AnalysisPeriodType) {
    const latest = await this.prisma.analysisSignal.findFirst({
      where: {
        userId,
        periodType,
      },
      orderBy: {
        periodStart: 'desc',
      },
      select: {
        periodStart: true,
      },
    });

    return latest?.periodStart ?? null;
  }

  private getOccurredAtWindow(periodType?: AnalysisPeriodType) {
    const now = getCurrentAnalysisTime();

    if (!periodType || periodType === AnalysisPeriodType.ALL_TIME) {
      return undefined;
    }

    const window =
      periodType === AnalysisPeriodType.WEEK
        ? getAnalysisWeekWindow(now)
        : periodType === AnalysisPeriodType.MONTH
          ? getAnalysisMonthWindow(now)
          : getAllTimeWindow();

    return {
      gte: window.periodStart,
      lt: window.periodEndExclusive,
    };
  }

  formatTransactionsForFacts(input: Array<{
    occurredAt: Date;
    amount: unknown;
    currency: string;
    normalizedMerchantName: string | null;
    rawMerchantLabel: string | null;
    category: { name: string } | null;
    categoryStatus: TransactionCategoryStatus;
  }>) {
    return input.map((transaction) => ({
      occurredAt: transaction.occurredAt.toISOString(),
      amount: Number(transaction.amount),
      currency: transaction.currency,
      direction: transaction.direction,
      merchant: transaction.normalizedMerchantName ?? transaction.rawMerchantLabel ?? 'Unknown Merchant',
      category: transaction.category?.name ?? 'Uncategorized',
      categoryStatus: transaction.categoryStatus,
    }));
  }
}
