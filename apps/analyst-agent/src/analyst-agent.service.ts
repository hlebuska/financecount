import { Injectable, Logger } from '@nestjs/common';
import {
  AnalysisDimensionType,
  AnalysisPeriodType,
  AnalysisSignalSeverity,
  AnalysisSignalType,
  FinancialMetric,
  Prisma,
  Transaction,
  TransactionCategoryStatus,
} from '@prisma/client';
import {
  getAllTimeWindow,
  getAnalysisMonthWindow,
  getAnalysisWeekWindow,
  getCurrentAnalysisTime,
  getPreviousPeriodWindow,
} from '@app/common';
import { DbService } from '@app/db';

type PeriodWindow = ReturnType<typeof getAnalysisWeekWindow>;

type AnalysisTransaction = Pick<
  Transaction,
  | 'id'
  | 'amount'
  | 'currency'
  | 'direction'
  | 'occurredAt'
  | 'normalizedMerchantName'
  | 'rawMerchantLabel'
  | 'categoryStatus'
> & {
  category: {
    id: string;
    name: string;
    slug: string;
  } | null;
};

@Injectable()
export class AnalystAgentService {
  readonly logger = new Logger(AnalystAgentService.name);

  constructor(private readonly prisma: DbService) {}

  getHello(): string {
    return 'Analyst agent is running.';
  }

  async refreshUserAnalysis(userId: string, queuedJobId: string) {
    const request = await this.prisma.analysisRefreshRequest.findUnique({
      where: {
        userId,
      },
    });

    if (!request || request.queuedJobId !== queuedJobId) {
      return {
        skipped: true,
      };
    }

    const now = getCurrentAnalysisTime();
    const periods = this.buildPeriods(now, request);

    for (const period of periods) {
      await this.recomputePeriod(userId, period);
    }

    const latestRequest = await this.prisma.analysisRefreshRequest.findUnique({
      where: {
        userId,
      },
    });

    if (latestRequest?.queuedJobId === queuedJobId) {
      await this.prisma.analysisRefreshRequest.delete({
        where: {
          userId,
        },
      });
    }

    return {
      userId,
      refreshedPeriods: periods.length,
    };
  }

  private buildPeriods(now: Date, request: { dirtyWeekStarts: unknown; dirtyMonthStarts: unknown }) {
    const periods = new Map<string, PeriodWindow>();
    const currentWeek = getAnalysisWeekWindow(now);
    const currentMonth = getAnalysisMonthWindow(now);
    const allTime = getAllTimeWindow();

    periods.set(`WEEK:${currentWeek.periodStart.toISOString()}`, currentWeek);
    periods.set(`MONTH:${currentMonth.periodStart.toISOString()}`, currentMonth);
    periods.set(`ALL_TIME:${allTime.periodStart.toISOString()}`, allTime);

    for (const isoStart of this.readIsoArray(request.dirtyWeekStarts)) {
      const start = new Date(isoStart);
      periods.set(`WEEK:${start.toISOString()}`, {
        periodType: 'WEEK',
        periodStart: start,
        periodEndExclusive: new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000),
        periodEndInclusive: new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000 - 1),
      });
    }

    for (const isoStart of this.readIsoArray(request.dirtyMonthStarts)) {
      const start = new Date(isoStart);
      periods.set(`MONTH:${start.toISOString()}`, getAnalysisMonthWindow(start));
    }

    return [...periods.values()].sort((left, right) => left.periodStart.getTime() - right.periodStart.getTime());
  }

  private readIsoArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is string => typeof item === 'string');
  }

  private async recomputePeriod(userId: string, period: PeriodWindow) {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        occurredAt:
          period.periodType === 'ALL_TIME'
            ? undefined
            : {
                gte: period.periodStart,
                lt: period.periodEndExclusive,
              },
      },
      include: {
        category: true,
      },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.financialStat.deleteMany({
        where: {
          userId,
          periodType: period.periodType as AnalysisPeriodType,
          periodStart: period.periodStart,
        },
      });

      await tx.analysisSignal.deleteMany({
        where: {
          userId,
          periodType: period.periodType as AnalysisPeriodType,
          periodStart: period.periodStart,
        },
      });

      const stats = this.buildFinancialStats(userId, period, transactions);

      if (stats.length > 0) {
        await tx.financialStat.createMany({
          data: stats,
        });
      }

      const signals = await this.buildSignals(userId, period, transactions);

      if (signals.length > 0) {
        await tx.analysisSignal.createMany({
          data: signals,
        });
      }
    });
  }

  private buildFinancialStats(
    userId: string,
    period: PeriodWindow,
    transactions: AnalysisTransaction[],
  ): Prisma.FinancialStatCreateManyInput[] {
    const computedAt = new Date();
    const rows: Prisma.FinancialStatCreateManyInput[] = [];
    const currencyGroups = this.groupBy(transactions, (transaction) => transaction.currency);

    for (const [currency, currencyTransactions] of currencyGroups) {
      const totalIncome = this.sum(currencyTransactions.filter((t) => t.direction === 'INCOME'));
      const totalExpense = this.sum(currencyTransactions.filter((t) => t.direction === 'EXPENSE'));
      const transactionCount = currencyTransactions.length;

      rows.push(
        this.createStatRow({
          userId,
          period,
          dimensionType: AnalysisDimensionType.OVERALL,
          metric: FinancialMetric.TOTAL_INCOME,
          value: totalIncome,
          currency,
          computedAt,
        }),
        this.createStatRow({
          userId,
          period,
          dimensionType: AnalysisDimensionType.OVERALL,
          metric: FinancialMetric.TOTAL_EXPENSE,
          value: totalExpense,
          currency,
          computedAt,
        }),
        this.createStatRow({
          userId,
          period,
          dimensionType: AnalysisDimensionType.OVERALL,
          metric: FinancialMetric.NET_CASHFLOW,
          value: totalIncome - totalExpense,
          currency,
          computedAt,
        }),
        this.createStatRow({
          userId,
          period,
          dimensionType: AnalysisDimensionType.OVERALL,
          metric: FinancialMetric.TRANSACTION_COUNT,
          value: transactionCount,
          currency,
          computedAt,
        }),
      );

      const categoryGroups = this.groupBy(currencyTransactions, (transaction) => this.getCategoryKey(transaction));

      for (const [categoryKey, categoryTransactions] of categoryGroups) {
        rows.push(
          this.createStatRow({
            userId,
            period,
            dimensionType: AnalysisDimensionType.CATEGORY,
            dimensionKey: categoryKey,
            dimensionLabel: this.getCategoryLabel(categoryTransactions[0]),
            metric: FinancialMetric.TOTAL_EXPENSE,
            value: this.sum(categoryTransactions.filter((t) => t.direction === 'EXPENSE')),
            currency,
            computedAt,
          }),
          this.createStatRow({
            userId,
            period,
            dimensionType: AnalysisDimensionType.CATEGORY,
            dimensionKey: categoryKey,
            dimensionLabel: this.getCategoryLabel(categoryTransactions[0]),
            metric: FinancialMetric.TOTAL_INCOME,
            value: this.sum(categoryTransactions.filter((t) => t.direction === 'INCOME')),
            currency,
            computedAt,
          }),
          this.createStatRow({
            userId,
            period,
            dimensionType: AnalysisDimensionType.CATEGORY,
            dimensionKey: categoryKey,
            dimensionLabel: this.getCategoryLabel(categoryTransactions[0]),
            metric: FinancialMetric.TRANSACTION_COUNT,
            value: categoryTransactions.length,
            currency,
            computedAt,
          }),
        );
      }

      const merchantGroups = this.groupBy(
        currencyTransactions,
        (transaction) => this.getMerchantLabel(transaction),
      );

      for (const [merchantKey, merchantTransactions] of merchantGroups) {
        rows.push(
          this.createStatRow({
            userId,
            period,
            dimensionType: AnalysisDimensionType.MERCHANT,
            dimensionKey: merchantKey,
            dimensionLabel: merchantKey,
            metric: FinancialMetric.TOTAL_EXPENSE,
            value: this.sum(merchantTransactions.filter((t) => t.direction === 'EXPENSE')),
            currency,
            computedAt,
          }),
          this.createStatRow({
            userId,
            period,
            dimensionType: AnalysisDimensionType.MERCHANT,
            dimensionKey: merchantKey,
            dimensionLabel: merchantKey,
            metric: FinancialMetric.TRANSACTION_COUNT,
            value: merchantTransactions.length,
            currency,
            computedAt,
          }),
        );
      }
    }

    return rows;
  }

  private async buildSignals(
    userId: string,
    period: PeriodWindow,
    transactions: AnalysisTransaction[],
  ): Promise<Prisma.AnalysisSignalCreateManyInput[]> {
    if (period.periodType === 'ALL_TIME') {
      return [];
    }

    const previousPeriod = getPreviousPeriodWindow(period);

    if (!previousPeriod) {
      return [];
    }

    const previousTransactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        occurredAt: {
          gte: previousPeriod.periodStart,
          lt: previousPeriod.periodEndExclusive,
        },
      },
      include: {
        category: true,
      },
    });

    const signals: Prisma.AnalysisSignalCreateManyInput[] = [];
    const computedAt = new Date();
    const currencies = new Set([
      ...transactions.map((transaction) => transaction.currency),
      ...previousTransactions.map((transaction) => transaction.currency),
    ]);

    for (const currency of currencies) {
      const currentCurrencyTransactions = transactions.filter((transaction) => transaction.currency === currency);
      const previousCurrencyTransactions = previousTransactions.filter(
        (transaction) => transaction.currency === currency,
      );
      const currentExpense = this.sum(currentCurrencyTransactions.filter((t) => t.direction === 'EXPENSE'));

      if (currentExpense > 0) {
        const uncategorizedExpense = this.sum(
          currentCurrencyTransactions.filter(
            (transaction) =>
              transaction.direction === 'EXPENSE' &&
              transaction.categoryStatus !== TransactionCategoryStatus.CATEGORIZED,
          ),
        );

        if (uncategorizedExpense / currentExpense >= 0.25) {
          signals.push({
            userId,
            type: AnalysisSignalType.HIGH_UNCATEGORIZED_SHARE,
            severity: AnalysisSignalSeverity.WARNING,
            periodType: period.periodType,
            periodStart: period.periodStart,
            periodEnd: period.periodEndInclusive,
            dimensionKey: 'uncategorized',
            dimensionLabel: 'Uncategorized',
            currency,
            title: 'High uncategorized share',
            description: 'A large share of this period\'s spending is still uncategorized.',
            evidenceJson: {
              uncategorizedExpense,
              totalExpense: currentExpense,
              share: uncategorizedExpense / currentExpense,
            } as never,
            computedAt,
          });
        }
      }

      const currentCategoryTotals = this.getExpenseTotalsByCategory(currentCurrencyTransactions);
      const previousCategoryTotals = this.getExpenseTotalsByCategory(previousCurrencyTransactions);
      const categoryComparisons = [...new Set([...currentCategoryTotals.keys(), ...previousCategoryTotals.keys()])]
        .map((categoryKey) => {
          const currentTotal = currentCategoryTotals.get(categoryKey) ?? 0;
          const previousTotal = previousCategoryTotals.get(categoryKey) ?? 0;

          return {
            categoryKey,
            currentTotal,
            previousTotal,
            delta: currentTotal - previousTotal,
          };
        })
        .filter((comparison) => comparison.previousTotal > 0 && Math.abs(comparison.delta) >= 1_000)
        .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta));

      const increase = categoryComparisons.find((comparison) => comparison.delta > 0);

      if (increase && increase.delta / increase.previousTotal >= 0.2) {
        signals.push({
          userId,
          type: AnalysisSignalType.CATEGORY_INCREASE,
          severity: AnalysisSignalSeverity.NOTICE,
          periodType: period.periodType,
          periodStart: period.periodStart,
          periodEnd: period.periodEndInclusive,
          dimensionKey: increase.categoryKey,
          dimensionLabel: increase.categoryKey,
          currency,
          title: `${increase.categoryKey} spending increased`,
          description: `${increase.categoryKey} spending is up compared to the previous ${period.periodType.toLowerCase()}.`,
          evidenceJson: {
            currentTotal: increase.currentTotal,
            previousTotal: increase.previousTotal,
            delta: increase.delta,
            deltaPercent: increase.delta / increase.previousTotal,
          } as never,
          computedAt,
        });
      }

      const decrease = categoryComparisons.find((comparison) => comparison.delta < 0);

      if (decrease && Math.abs(decrease.delta) / decrease.previousTotal >= 0.2) {
        signals.push({
          userId,
          type: AnalysisSignalType.CATEGORY_DECREASE,
          severity: AnalysisSignalSeverity.INFO,
          periodType: period.periodType,
          periodStart: period.periodStart,
          periodEnd: period.periodEndInclusive,
          dimensionKey: decrease.categoryKey,
          dimensionLabel: decrease.categoryKey,
          currency,
          title: `${decrease.categoryKey} spending decreased`,
          description: `${decrease.categoryKey} spending is down compared to the previous ${period.periodType.toLowerCase()}.`,
          evidenceJson: {
            currentTotal: decrease.currentTotal,
            previousTotal: decrease.previousTotal,
            delta: decrease.delta,
            deltaPercent: decrease.delta / decrease.previousTotal,
          } as never,
          computedAt,
        });
      }

      const currentTopCategory = this.getTopCategory(currentCategoryTotals);
      const previousTopCategory = this.getTopCategory(previousCategoryTotals);

      if (
        currentTopCategory &&
        previousTopCategory &&
        currentTopCategory.categoryKey !== previousTopCategory.categoryKey
      ) {
        signals.push({
          userId,
          type: AnalysisSignalType.TOP_CATEGORY_CHANGED,
          severity: AnalysisSignalSeverity.NOTICE,
          periodType: period.periodType,
          periodStart: period.periodStart,
          periodEnd: period.periodEndInclusive,
          dimensionKey: currentTopCategory.categoryKey,
          dimensionLabel: currentTopCategory.categoryKey,
          currency,
          title: 'Top spending category changed',
          description: `${currentTopCategory.categoryKey} replaced ${previousTopCategory.categoryKey} as the top spending category.`,
          evidenceJson: {
            currentTopCategory,
            previousTopCategory,
          } as never,
          computedAt,
        });
      }
    }

    return signals;
  }

  private createStatRow(params: {
    userId: string;
    period: PeriodWindow;
    dimensionType: AnalysisDimensionType;
    metric: FinancialMetric;
    value: number;
    currency: string;
    computedAt: Date;
    dimensionKey?: string;
    dimensionLabel?: string;
  }): Prisma.FinancialStatCreateManyInput {
    return {
      userId: params.userId,
      periodType: params.period.periodType as AnalysisPeriodType,
      periodStart: params.period.periodStart,
      periodEnd: params.period.periodEndInclusive,
      dimensionType: params.dimensionType,
      dimensionKey: params.dimensionKey ?? null,
      dimensionLabel: params.dimensionLabel ?? null,
      metric: params.metric,
      value: params.value,
      currency: params.currency,
      computedAt: params.computedAt,
    };
  }

  private sum(transactions: Array<Pick<Transaction, 'amount'>>) {
    return transactions.reduce((total, transaction) => total + Number(transaction.amount), 0);
  }

  private groupBy<T>(items: T[], getKey: (item: T) => string) {
    const groups = new Map<string, T[]>();

    for (const item of items) {
      const key = getKey(item);
      const current = groups.get(key);

      if (current) {
        current.push(item);
      } else {
        groups.set(key, [item]);
      }
    }

    return groups;
  }

  private getCategoryKey(transaction: AnalysisTransaction) {
    return transaction.category?.slug ?? 'uncategorized';
  }

  private getCategoryLabel(transaction: AnalysisTransaction) {
    return transaction.category?.name ?? 'Uncategorized';
  }

  private getMerchantLabel(transaction: AnalysisTransaction) {
    return transaction.normalizedMerchantName ?? transaction.rawMerchantLabel ?? 'Unknown Merchant';
  }

  private getExpenseTotalsByCategory(transactions: AnalysisTransaction[]) {
    const totals = new Map<string, number>();

    for (const transaction of transactions) {
      if (transaction.direction !== 'EXPENSE') {
        continue;
      }

      const categoryKey = this.getCategoryLabel(transaction);
      totals.set(categoryKey, (totals.get(categoryKey) ?? 0) + Number(transaction.amount));
    }

    return totals;
  }

  private getTopCategory(totals: Map<string, number>) {
    let topCategory: { categoryKey: string; total: number } | null = null;

    for (const [categoryKey, total] of totals) {
      if (!topCategory || total > topCategory.total) {
        topCategory = { categoryKey, total };
      }
    }

    return topCategory;
  }
}
