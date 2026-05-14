import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { IngestionFilesModule } from './ingestion-files/ingestion-files.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), IngestionFilesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
