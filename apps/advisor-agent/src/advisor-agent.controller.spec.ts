import { Test, TestingModule } from '@nestjs/testing';
import { AdvisorAgentController } from './advisor-agent.controller';
import { AdvisorAgentService } from './advisor-agent.service';
import { ConversationsService } from './conversations.service';

describe('AdvisorAgentController', () => {
  let advisorAgentController: AdvisorAgentController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AdvisorAgentController],
      providers: [
        {
          provide: AdvisorAgentService,
          useValue: {
            getHello: jest.fn().mockReturnValue('Advisor agent is running.'),
          },
        },
        {
          provide: ConversationsService,
          useValue: {
            listConversations: jest.fn(),
            getConversationMessages: jest.fn(),
            submitQuery: jest.fn(),
          },
        },
      ],
    }).compile();

    advisorAgentController = app.get<AdvisorAgentController>(AdvisorAgentController);
  });

  describe('root', () => {
    it('should return advisor health text', () => {
      expect(advisorAgentController.getHello()).toBe('Advisor agent is running.');
    });
  });
});
