import { Test, TestingModule } from '@nestjs/testing';
import { ReviewResolutionService } from './review-resolution.service';

describe('ReviewResolutionService', () => {
  let service: ReviewResolutionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReviewResolutionService],
    }).compile();

    service = module.get<ReviewResolutionService>(ReviewResolutionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
