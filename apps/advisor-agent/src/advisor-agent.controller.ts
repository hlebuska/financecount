import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AdvisorAgentService } from './advisor-agent.service';
import { ConversationsService } from './conversations.service';
import { AdvisorQueryDto } from './dto/advisor-query.dto';

@Controller()
export class AdvisorAgentController {
  constructor(
    private readonly advisorAgentService: AdvisorAgentService,
    private readonly conversationsService: ConversationsService,
  ) {}

  @Get()
  getHello(): string {
    return this.advisorAgentService.getHello();
  }

  @Get('conversations')
  listConversations() {
    return this.conversationsService.listConversations();
  }

  @Get('conversations/:conversationId/messages')
  getConversationMessages(@Param('conversationId') conversationId: string) {
    return this.conversationsService.getConversationMessages(conversationId);
  }

  @Post('advisor/query')
  submitQuery(@Body() dto: AdvisorQueryDto) {
    return this.conversationsService.submitQuery(dto);
  }
}
