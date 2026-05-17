import { Injectable } from '@nestjs/common';
import { DbService } from '@app/db';
import { TransactionDirection } from '@prisma/client';
import { DuplicateCheckResult, NormalizedTransactionData } from './ingestion.types';

@Injectable()
export class TransactionDeduplicationService {
  constructor(private readonly prisma: DbService) {}

  async checkDuplicate(params: {
    userId: string;
    normalized: NormalizedTransactionData;
  }): Promise<DuplicateCheckResult> {
    const { userId, normalized } = params;

    const exactMatch = await this.prisma.transaction.findFirst({
      where: {
        userId,
        sourceFingerprint: normalized.sourceFingerprint,
      },
      select: {
        id: true,
      },
    });

    if (exactMatch) {
      return { isDuplicate: true, duplicateType: 'exact' };
    }

    const startOfDay = new Date(normalized.occurredAt);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(normalized.occurredAt);
    endOfDay.setHours(23, 59, 59, 999);

    const fuzzyMatch = await this.prisma.transaction.findFirst({
      where: {
        userId,
        amount: normalized.amount,
        direction: normalized.direction as TransactionDirection,
        occurredAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
        fuzzyFingerprint: normalized.fuzzyFingerprint,
      },
      select: {
        id: true,
      },
    });

    if (fuzzyMatch) {
      return { isDuplicate: true, duplicateType: 'fuzzy' };
    }

    return { isDuplicate: false, duplicateType: null };
  }
}
