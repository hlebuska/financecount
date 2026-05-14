import { Test, TestingModule } from '@nestjs/testing';
import { AnalystAgentController } from './analyst-agent.controller';
import { AnalystAgentService } from './analyst-agent.service';

describe('AnalystAgentController', () => {
  let analystAgentController: AnalystAgentController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AnalystAgentController],
      providers: [AnalystAgentService],
    }).compile();

    analystAgentController = app.get<AnalystAgentController>(AnalystAgentController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(analystAgentController.getHello()).toBe('Hello World!');
    });
  });
});
