import { Injectable } from '@nestjs/common';
import { DbService } from '@app/db';

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: DbService) {}

  findMany(userId: string) {
    return this.prisma.transaction.findMany({
      where: {
        userId,
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
  }
}
