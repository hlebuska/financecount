import { Injectable } from '@nestjs/common';
import { DbService } from '@app/db';
import { AnalysisPeriodType } from '@prisma/client';

@Injectable()
export class AnalysisService {
  constructor(private readonly prisma: DbService) {}

  findStats(userId: string, periodType?: AnalysisPeriodType) {
    return this.prisma.financialStat.findMany({
      where: {
        userId,
        periodType,
      },
      orderBy: [{ periodStart: 'desc' }, { dimensionType: 'asc' }, { metric: 'asc' }],
    });
  }

  findSignals(userId: string, periodType?: AnalysisPeriodType) {
    return this.prisma.analysisSignal.findMany({
      where: {
        userId,
        periodType,
      },
      orderBy: [{ periodStart: 'desc' }, { computedAt: 'desc' }],
    });
  }
}
