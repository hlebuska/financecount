import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DEFAULT_CATEGORIES } from '@app/contracts';
import { DbService } from './db.service';

@Injectable()
export class CategoryDefaultsService implements OnModuleInit {
  private readonly logger = new Logger(CategoryDefaultsService.name);

  constructor(private readonly db: DbService) {}

  async onModuleInit() {
    await Promise.all(
      DEFAULT_CATEGORIES.map((category) =>
        this.db.category.upsert({
          where: {
            slug: category.slug,
          },
          update: {
            name: category.name,
          },
          create: category,
        }),
      ),
    );

    this.logger.log(`Ensured ${DEFAULT_CATEGORIES.length} default categories.`);
  }
}
