import { RuleMatchType, TransactionCategoryStatus } from '@prisma/client';
import { TransactionCategorizerService } from './transaction-categorizer.service';

describe('TransactionCategorizerService', () => {
  it('prefers user and global rules before enrichment or LLM classification', async () => {
    const prisma = {
      merchantCategoryRule: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'rule-1',
            userId: 'user-1',
            rawPattern: 'YANDEX GO',
            matchType: RuleMatchType.CONTAINS,
            normalizedMerchantName: 'Yandex Go',
            categoryId: 'category-1',
            category: {
              id: 'category-1',
              slug: 'transport',
              name: 'Transport',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            businessType: 'Ride Hailing',
            confidence: 1,
            source: 'USER_CORRECTION',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      },
      merchantEnrichmentResult: {
        upsert: jest.fn(),
      },
    };
    const merchantEnrichmentService = {
      enrich: jest.fn(),
    };
    const service = new TransactionCategorizerService(
      prisma as never,
      merchantEnrichmentService as never,
    );

    const result = await service.categorize({
      userId: 'user-1',
      rawDescription: 'Yandex Go Almaty',
      normalized: {
        amount: '1250.50',
        currency: 'KZT',
        direction: 'EXPENSE',
        occurredAt: new Date(),
        merchantCandidate: 'YANDEX GO ALMATY',
        sourceFingerprint: 'a',
        fuzzyFingerprint: 'b',
      },
    });

    expect(result).toEqual({
      normalizedMerchantName: 'Yandex Go',
      categoryId: 'category-1',
      categoryName: 'Transport',
      businessType: 'Ride Hailing',
      confidence: 1,
      categoryStatus: TransactionCategoryStatus.CATEGORIZED,
    });
    expect(merchantEnrichmentService.enrich).not.toHaveBeenCalled();
  });

  it('falls back to uncategorized when no rule or confident enrichment exists', async () => {
    const prisma = {
      merchantCategoryRule: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      merchantEnrichmentResult: {
        upsert: jest.fn(),
      },
    };
    const merchantEnrichmentService = {
      enrich: jest.fn().mockResolvedValue(null),
    };
    const service = new TransactionCategorizerService(
      prisma as never,
      merchantEnrichmentService as never,
    );

    const result = await service.categorize({
      userId: 'user-1',
      rawDescription: 'Kaspi QR',
      normalized: {
        amount: '500.00',
        currency: 'KZT',
        direction: 'EXPENSE',
        occurredAt: new Date(),
        merchantCandidate: 'KASPI QR',
        sourceFingerprint: 'a',
        fuzzyFingerprint: 'b',
      },
    });

    expect(result).toEqual({
      normalizedMerchantName: 'KASPI QR',
      categoryId: null,
      categoryName: null,
      businessType: null,
      confidence: 0,
      categoryStatus: TransactionCategoryStatus.UNCATEGORIZED,
    });
  });
});
