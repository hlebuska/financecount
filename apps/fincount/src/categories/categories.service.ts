import { Injectable } from '@nestjs/common';
import { DbService } from '@app/db';
import { CreateCategoryDto } from './dto/create-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: DbService) {}

  findMany() {
    return this.prisma.category.findMany({
      orderBy: {
        name: 'asc',
      },
    });
  }

  create(data: CreateCategoryDto) {
    return this.prisma.category.create({
      data: {
        slug: data.slug,
        name: data.name,
      },
    }); 
  }
}