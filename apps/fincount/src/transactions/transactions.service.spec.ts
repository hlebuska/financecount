import { TransactionsService } from './transactions.service';

describe('TransactionsService', () => {
  it('loads transactions for a user ordered by most recent activity', async () => {
    const prisma = {
      transaction: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const service = new TransactionsService(prisma as never);

    await service.findMany('user-1');

    expect(prisma.transaction.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
      },
      orderBy: [
        {
          occurredAt: 'desc',
        },
        {
          createdAt: 'desc',
        },
      ],
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
  });
});
