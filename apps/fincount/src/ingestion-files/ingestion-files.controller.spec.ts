import { Test, TestingModule } from '@nestjs/testing';
import { IngestionFilesController } from './ingestion-files.controller';
import { IngestionFilesService } from './ingestion-files.service';

describe('IngestionFilesController', () => {
  let controller: IngestionFilesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IngestionFilesController],
      providers: [
        {
          provide: IngestionFilesService,
          useValue: {
            registerUploadedFile: jest.fn(),
            findMany: jest.fn(),
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<IngestionFilesController>(IngestionFilesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
