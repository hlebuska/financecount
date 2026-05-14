import { Test, TestingModule } from '@nestjs/testing';
import { IngestionAgentController } from './ingestion-agent.controller';
import { IngestionAgentService } from './ingestion-agent.service';

describe('IngestionAgentController', () => {
  let ingestionAgentController: IngestionAgentController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [IngestionAgentController],
      providers: [IngestionAgentService],
    }).compile();

    ingestionAgentController = app.get<IngestionAgentController>(IngestionAgentController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(ingestionAgentController.getHello()).toBe('Hello World!');
    });
  });
});
