import { ReviewResolutionService } from './review-resolution.service';

describe('ReviewResolutionService', () => {
  let service: ReviewResolutionService;
  let prisma: {
    $transaction: jest.Mock;
  };
  let categorizationMemoryService: {
    upsertFromResolvedTransaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(),
    };
    categorizationMemoryService = {
      upsertFromResolvedTransaction: jest.fn(),
    };

    service = new ReviewResolutionService(prisma as never, categorizationMemoryService as never);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('resolves an existing review item and writes the transaction to memory', async () => {
    const updatedTransaction = {
      id: 'tx-1',
      userId: 'user-1',
      rawExtractedTransactionId: 'raw-1',
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
    prisma.$transaction.mockImplementation(async (callback: (txArg: typeof tx) => unknown) => callback(tx));

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
    expect(result).toBe(resolvedTransaction);
  });

  it('creates a resolved review item when a transaction had none and writes it to memory', async () => {
    const updatedTransaction = {
      id: 'tx-2',
      userId: 'user-2',
      rawExtractedTransactionId: 'raw-2',
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
    prisma.$transaction.mockImplementation(async (callback: (txArg: typeof tx) => unknown) => callback(tx));

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
    expect(result).toBe(resolvedTransaction);
  });
});
