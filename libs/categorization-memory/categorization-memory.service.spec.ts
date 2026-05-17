import { Test, TestingModule } from '@nestjs/testing';
import { CategorizationMemoryService } from './categorization-memory.service';

describe('CategorizationMemoryService', () => {
  let service: CategorizationMemoryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CategorizationMemoryService],
    }).compile();

    service = module.get<CategorizationMemoryService>(CategorizationMemoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
