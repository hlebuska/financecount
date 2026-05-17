import { Test, TestingModule } from '@nestjs/testing';
import { ReviewResolutionController } from './review-resolution.controller';

describe('ReviewResolutionController', () => {
  let controller: ReviewResolutionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReviewResolutionController],
    }).compile();

    controller = module.get<ReviewResolutionController>(ReviewResolutionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
