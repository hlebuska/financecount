import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { FILE_INGESTION_QUEUE } from '@app/contracts';
import { IngestionFilesModule } from './ingestion-files/ingestion-files.module';
import { TransactionsModule } from './transactions/transactions.module';
import { CategoriesService } from './categories/categories.service';
import { CategoriesModule } from './categories/categories.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    }),
    BullModule.registerQueue({
      name: FILE_INGESTION_QUEUE,
    }),
    IngestionFilesModule,
    TransactionsModule,
    CategoriesModule,
  ],
})
export class AppModule {}
