import { TransactionCategoryStatus } from '@prisma/client';
import { TransactionCategorizerService } from './transaction-categorizer.service';

describe('TransactionCategorizerService', () => {
  it('prefers categorization memory before enrichment or LLM classification', async () => {
    const prisma = {
      category: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'category-1',
            slug: 'transport',
            name: 'Transport',
          }),
      },
      merchantEnrichmentResult: {
        upsert: jest.fn(),
      },
    };
    const categorizationMemoryService = {
      findBestCategoryMatch: jest.fn().mockResolvedValue({
        score: 0.93,
        categoryId: 'category-1',
        categoryName: 'Transport',
        normalizedMerchantName: 'Yandex Go',
        businessType: 'Ride Hailing',
      }),
    };
    const merchantEnrichmentService = {
      enrich: jest.fn(),
    };
    const service = new TransactionCategorizerService(
      prisma as never,
      categorizationMemoryService as never,
      merchantEnrichmentService as never,
    );

    const result = await service.categorize({
      userId: 'user-1',
      rawExtractedTransactionId: 'raw-1',
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
      confidence: 0.93,
      categoryStatus: TransactionCategoryStatus.CATEGORIZED,
    });
    expect(categorizationMemoryService.findBestCategoryMatch).toHaveBeenCalled();
    expect(merchantEnrichmentService.enrich).not.toHaveBeenCalled();
  });

  it('ignores stale memory category ids and falls through to enrichment', async () => {
    const prisma = {
      category: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: 'category-2',
            slug: 'groceries',
            name: 'Groceries',
          }),
      },
      merchantEnrichmentResult: {
        upsert: jest.fn(),
      },
    };
    const categorizationMemoryService = {
      findBestCategoryMatch: jest.fn().mockResolvedValue({
        score: 0.91,
        categoryId: 'stale-category-id',
        categoryName: 'Transport',
        categorySlug: 'transport',
        normalizedMerchantName: 'Old Merchant',
        businessType: 'Old Type',
      }),
    };
    const merchantEnrichmentService = {
      enrich: jest.fn().mockResolvedValue({
        normalizedMerchantName: 'Magnum',
        likelyCategory: 'Groceries',
        businessType: 'Supermarket',
        confidence: 0.92,
        ambiguityFlags: [],
        rawResponse: {},
      }),
    };
    const service = new TransactionCategorizerService(
      prisma as never,
      categorizationMemoryService as never,
      merchantEnrichmentService as never,
    );

    const result = await service.categorize({
      userId: 'user-1',
      rawExtractedTransactionId: 'raw-stale-memory',
      rawDescription: 'Magnum',
      normalized: {
        amount: '2500.00',
        currency: 'KZT',
        direction: 'EXPENSE',
        occurredAt: new Date(),
        merchantCandidate: 'MAGNUM',
        sourceFingerprint: 'a',
        fuzzyFingerprint: 'b',
      },
    });

    expect(result).toEqual({
      normalizedMerchantName: 'Magnum',
      categoryId: 'category-2',
      categoryName: 'Groceries',
      businessType: 'Supermarket',
      confidence: 0.92,
      categoryStatus: TransactionCategoryStatus.CATEGORIZED,
    });
    expect(merchantEnrichmentService.enrich).toHaveBeenCalled();
  });

  it('falls back to uncategorized when no confident memory or enrichment exists', async () => {
    const prisma = {
      category: {
        findUnique: jest.fn(),
      },
      merchantEnrichmentResult: {
        upsert: jest.fn(),
      },
    };
    const categorizationMemoryService = {
      findBestCategoryMatch: jest.fn().mockResolvedValue(null),
    };
    const merchantEnrichmentService = {
      enrich: jest.fn().mockResolvedValue(null),
    };
    const service = new TransactionCategorizerService(
      prisma as never,
      categorizationMemoryService as never,
      merchantEnrichmentService as never,
    );

    const result = await service.categorize({
      userId: 'user-1',
      rawExtractedTransactionId: 'raw-2',
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

  it('keeps transactions uncategorized when the model suggests a category outside the existing set', async () => {
    const prisma = {
      category: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      merchantEnrichmentResult: {
        upsert: jest.fn(),
      },
    };
    const categorizationMemoryService = {
      findBestCategoryMatch: jest.fn().mockResolvedValue(null),
    };
    const merchantEnrichmentService = {
      enrich: jest.fn().mockResolvedValue({
        normalizedMerchantName: 'Unknown Merchant',
        likelyCategory: 'Crypto',
        businessType: 'Exchange',
        confidence: 0.95,
        ambiguityFlags: [],
        rawResponse: {},
      }),
    };
    const service = new TransactionCategorizerService(
      prisma as never,
      categorizationMemoryService as never,
      merchantEnrichmentService as never,
    );

    const result = await service.categorize({
      userId: 'user-1',
      rawExtractedTransactionId: 'raw-3',
      rawDescription: 'Unknown Merchant',
      normalized: {
        amount: '100.00',
        currency: 'KZT',
        direction: 'EXPENSE',
        occurredAt: new Date(),
        merchantCandidate: 'UNKNOWN MERCHANT',
        sourceFingerprint: 'a',
        fuzzyFingerprint: 'b',
      },
    });

    expect(result).toEqual({
      normalizedMerchantName: 'UNKNOWN MERCHANT',
      categoryId: null,
      categoryName: null,
      businessType: null,
      confidence: 0.95,
      categoryStatus: TransactionCategoryStatus.UNCATEGORIZED,
    });
  });
});
