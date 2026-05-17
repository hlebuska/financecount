import { Module } from '@nestjs/common';
import { CategoryDefaultsService } from './category-defaults.service';
import { DbService } from './db.service';

@Module({
  providers: [DbService, CategoryDefaultsService],
  exports: [DbService],
})
export class DbModule {}
