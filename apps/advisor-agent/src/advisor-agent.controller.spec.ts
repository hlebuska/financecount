import { Test, TestingModule } from '@nestjs/testing';
import { AdvisorAgentController } from './advisor-agent.controller';
import { AdvisorAgentService } from './advisor-agent.service';

describe('AdvisorAgentController', () => {
  let advisorAgentController: AdvisorAgentController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AdvisorAgentController],
      providers: [AdvisorAgentService],
    }).compile();

    advisorAgentController = app.get<AdvisorAgentController>(AdvisorAgentController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(advisorAgentController.getHello()).toBe('Hello World!');
    });
  });
});
