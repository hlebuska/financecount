import { ReviewResolutionService } from './review-resolution.service';

describe('ReviewResolutionService', () => {
  let service: ReviewResolutionService;
  let prisma: {
    $transaction: jest.Mock;
  };
  let categorizationMemoryService: {
    upsertFromResolvedTransaction: jest.Mock;
  };
  let analysisRefreshSchedulerService: {
    requestRefresh: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(),
    };
    categorizationMemoryService = {
      upsertFromResolvedTransaction: jest.fn(),
    };
    analysisRefreshSchedulerService = {
      requestRefresh: jest.fn(),
    };

    service = new ReviewResolutionService(
      prisma as never,
      categorizationMemoryService as never,
      analysisRefreshSchedulerService as never,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('positive scenarios', () => {
    it('resolves an existing review item and writes the transaction to memory', async () => {
      const updatedTransaction = {
        id: 'tx-1',
        userId: 'user-1',
        rawExtractedTransactionId: 'raw-1',
        occurredAt: new Date('2026-05-17T10:00:00.000Z'),
      };
      const resolvedTransaction = {
        ...updatedTransaction,
        category: { id: 'cat-1', slug: 'groceries', name: 'Groceries' },
        reviewItems: [{ id: 'review-1', status: 'RESOLVED', message: 'Needs review' }],
      };
      const tx = {
        transaction: {
          update: jest.fn().mockResolvedValue(updatedTransaction),
          findFirst: jest.fn().mockResolvedValue(resolvedTransaction),
        },
        reviewItem: {
          update: jest.fn().mockResolvedValue(undefined),
          create: jest.fn(),
        },
      };
      prisma.$transaction.mockImplementation(async (callback: (txArg: typeof tx) => unknown) =>
        callback(tx),
      );

      const result = await service.resolveCategoryReview({
        transactionId: 'tx-1',
        reviewItemId: 'review-1',
        categoryId: 'cat-1',
      });

      expect(tx.reviewItem.update).toHaveBeenCalledWith({
        where: { id: 'review-1' },
        data: { status: 'RESOLVED' },
      });
      expect(tx.reviewItem.create).not.toHaveBeenCalled();
      expect(categorizationMemoryService.upsertFromResolvedTransaction).toHaveBeenCalledWith(
        resolvedTransaction,
      );
      expect(analysisRefreshSchedulerService.requestRefresh).toHaveBeenCalledWith({
        userId: 'user-1',
        occurredAtDates: [updatedTransaction.occurredAt],
        reason: 'review_resolution',
      });
      expect(result).toBe(resolvedTransaction);
    });

    it('creates a resolved review item when a transaction had none and writes it to memory', async () => {
      const updatedTransaction = {
        id: 'tx-2',
        userId: 'user-2',
        rawExtractedTransactionId: 'raw-2',
        occurredAt: new Date('2026-05-17T11:00:00.000Z'),
      };
      const resolvedTransaction = {
        ...updatedTransaction,
        category: { id: 'cat-2', slug: 'transport', name: 'Transport' },
        reviewItems: [
          {
            id: 'review-created',
            status: 'RESOLVED',
            message: 'Category changed manually by the user to improve future categorization.',
          },
        ],
      };
      const tx = {
        transaction: {
          update: jest.fn().mockResolvedValue(updatedTransaction),
          findFirst: jest.fn().mockResolvedValue(resolvedTransaction),
        },
        reviewItem: {
          update: jest.fn(),
          create: jest.fn().mockResolvedValue(undefined),
        },
      };
      prisma.$transaction.mockImplementation(async (callback: (txArg: typeof tx) => unknown) =>
        callback(tx),
      );

      const result = await service.resolveCategoryReview({
        transactionId: 'tx-2',
        categoryId: 'cat-2',
      });

      expect(tx.reviewItem.update).not.toHaveBeenCalled();
      expect(tx.reviewItem.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-2',
          rawExtractedTransactionId: 'raw-2',
          transactionId: 'tx-2',
          type: 'UNCATEGORIZED_TRANSACTION',
          status: 'RESOLVED',
          message: 'Category changed manually by the user to improve future categorization.',
        },
      });
      expect(categorizationMemoryService.upsertFromResolvedTransaction).toHaveBeenCalledWith(
        resolvedTransaction,
      );
      expect(analysisRefreshSchedulerService.requestRefresh).toHaveBeenCalledWith({
        userId: 'user-2',
        occurredAtDates: [updatedTransaction.occurredAt],
        reason: 'manual_category_change',
      });
      expect(result).toBe(resolvedTransaction);
    });
  });

  describe('negative scenarios', () => {
    it('throws when the transaction cannot be reloaded after resolution', async () => {
      const updatedTransaction = {
        id: 'tx-missing',
        userId: 'user-1',
        rawExtractedTransactionId: 'raw-1',
        occurredAt: new Date('2026-05-17T10:00:00.000Z'),
      };
      const tx = {
        transaction: {
          update: jest.fn().mockResolvedValue(updatedTransaction),
          findFirst: jest.fn().mockResolvedValue(null),
        },
        reviewItem: {
          update: jest.fn().mockResolvedValue(undefined),
          create: jest.fn(),
        },
      };
      prisma.$transaction.mockImplementation(async (callback: (txArg: typeof tx) => unknown) =>
        callback(tx),
      );

      await expect(
        service.resolveCategoryReview({
          transactionId: 'tx-missing',
          reviewItemId: 'review-1',
          categoryId: 'cat-1',
        }),
      ).rejects.toThrow('Transaction not found after category resolution: tx-missing');

      expect(categorizationMemoryService.upsertFromResolvedTransaction).not.toHaveBeenCalled();
      expect(analysisRefreshSchedulerService.requestRefresh).not.toHaveBeenCalled();
    });
  });

  describe('adversarial scenarios', () => {
    it('preserves the explicit review-resolution reason when a manual change also updates category state', async () => {
      const updatedTransaction = {
        id: 'tx-3',
        userId: 'user-3',
        rawExtractedTransactionId: 'raw-3',
        occurredAt: new Date('2026-05-17T12:00:00.000Z'),
      };
      const resolvedTransaction = {
        ...updatedTransaction,
        category: { id: 'cat-3', slug: 'utilities', name: 'Utilities' },
        reviewItems: [{ id: 'review-3', status: 'RESOLVED', message: 'Needs review' }],
      };
      const tx = {
        transaction: {
          update: jest.fn().mockResolvedValue(updatedTransaction),
          findFirst: jest.fn().mockResolvedValue(resolvedTransaction),
        },
        reviewItem: {
          update: jest.fn().mockResolvedValue(undefined),
          create: jest.fn(),
        },
      };
      prisma.$transaction.mockImplementation(async (callback: (txArg: typeof tx) => unknown) =>
        callback(tx),
      );

      await service.resolveCategoryReview({
        transactionId: 'tx-3',
        reviewItemId: 'review-3',
        categoryId: 'cat-3',
      });

      expect(analysisRefreshSchedulerService.requestRefresh).toHaveBeenCalledWith({
        userId: 'user-3',
        occurredAtDates: [updatedTransaction.occurredAt],
        reason: 'review_resolution',
      });
    });
  });
});
