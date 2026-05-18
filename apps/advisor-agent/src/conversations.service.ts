import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CONVERSATION_SUMMARY_QUEUE,
  PROCESS_CONVERSATION_SUMMARY_JOB,
  ProcessConversationSummaryJobPayload,
} from '@app/contracts';
import { DbService } from '@app/db';
import { Queue } from 'bullmq';
import { AdvisorAgentService } from './advisor-agent.service';
import { AdvisorQueryDto } from './dto/advisor-query.dto';
import { AdvisorQueryResult, ConversationListItem, ConversationMessageView } from './advisor.types';
import { ConversationMessageRole } from '@prisma/client';

const USER_ID = 'demo-user';
const SUMMARY_TRIGGER_MESSAGE_COUNT = 20;
const SUMMARY_RECENT_WINDOW = 10;
const SUMMARY_REFRESH_INTERVAL = 8;

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: DbService,
    private readonly advisorAgentService: AdvisorAgentService,
    @InjectQueue(CONVERSATION_SUMMARY_QUEUE)
    private readonly conversationSummaryQueue: Queue<ProcessConversationSummaryJobPayload>,
  ) {}

  async listConversations(): Promise<ConversationListItem[]> {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        userId: USER_ID,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      select: {
        id: true,
        title: true,
        updatedAt: true,
      },
    });

    return conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      updatedAt: conversation.updatedAt.toISOString(),
    }));
  }

  async getConversationMessages(conversationId: string): Promise<ConversationMessageView[]> {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        userId: USER_ID,
      },
      include: {
        messages: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found.');
    }

    return conversation.messages.map((message) => this.toMessageView(message));
  }

  async submitQuery(dto: AdvisorQueryDto): Promise<AdvisorQueryResult> {
    const question = dto.question?.trim();

    if (!question) {
      throw new BadRequestException('Question is required.');
    }

    const conversation = dto.conversationId
      ? await this.prisma.conversation.findFirst({
          where: {
            id: dto.conversationId,
            userId: USER_ID,
          },
          include: {
            messages: {
              orderBy: {
                createdAt: 'asc',
              },
            },
          },
        })
      : null;

    if (dto.conversationId && !conversation) {
      throw new NotFoundException('Conversation not found.');
    }

    const title = conversation ? conversation.title : this.buildTitle(question);
    const recentMessages = conversation?.messages.slice(-10) ?? [];
    const persistedConversation =
      conversation ??
      (await this.prisma.conversation.create({
        data: {
          userId: USER_ID,
          title,
        },
      }));

    const userMessage = await this.prisma.conversationMessage.create({
      data: {
        conversationId: persistedConversation.id,
        role: ConversationMessageRole.USER,
        contentText: question,
      },
    });

    const advisorResult = await this.advisorAgentService.answerQuestion({
      question,
      summaryText: conversation?.summaryText ?? null,
      recentMessages: [...recentMessages, { role: ConversationMessageRole.USER, contentText: question }],
    });

    const assistantMessage = await this.prisma.conversationMessage.create({
      data: {
        conversationId: persistedConversation.id,
        role: ConversationMessageRole.ASSISTANT,
        contentText: advisorResult.text,
        responseJson: advisorResult.response as never,
      },
    });

    await this.prisma.conversation.update({
      where: {
        id: persistedConversation.id,
      },
      data: {
        title,
        updatedAt: new Date(),
      },
    });

    const messageCount = await this.prisma.conversationMessage.count({
      where: {
        conversationId: persistedConversation.id,
      },
    });

    const freshConversation = await this.prisma.conversation.findUnique({
      where: {
        id: persistedConversation.id,
      },
      select: {
        summarizedMessageCount: true,
      },
    });

    const summarizedMessageCount = freshConversation?.summarizedMessageCount ?? 0;
    const summarizableMessageCount = Math.max(0, messageCount - SUMMARY_RECENT_WINDOW);

    if (
      messageCount > SUMMARY_TRIGGER_MESSAGE_COUNT &&
      summarizableMessageCount - summarizedMessageCount >= SUMMARY_REFRESH_INTERVAL
    ) {
      await this.enqueueSummaryRefresh(persistedConversation.id);
    }

    return {
      conversationId: persistedConversation.id,
      title,
      userMessage: this.toMessageView(userMessage),
      assistantMessage: this.toMessageView(assistantMessage),
    };
  }

  async refreshConversationSummary(conversationId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        userId: USER_ID,
      },
      include: {
        messages: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!conversation || conversation.messages.length <= SUMMARY_TRIGGER_MESSAGE_COUNT) {
      return;
    }

    const messagesToSummarize = conversation.messages.slice(0, Math.max(0, conversation.messages.length - SUMMARY_RECENT_WINDOW));
    const summaryText = await this.advisorAgentService.summarizeConversation({
      existingSummaryText: conversation.summaryText,
      messages: messagesToSummarize.map((message) => ({
        role: message.role,
        contentText: message.contentText,
      })),
    });

    await this.prisma.conversation.update({
      where: {
        id: conversation.id,
      },
      data: {
        summaryText,
        summaryUpdatedAt: new Date(),
        summarizedMessageCount: messagesToSummarize.length,
      },
    });
  }

  private async enqueueSummaryRefresh(conversationId: string) {
    const jobId = `conversation-summary:${conversationId}`;
    const existingJob = await this.conversationSummaryQueue.getJob(jobId);

    if (existingJob) {
      const state = await existingJob.getState();

      if (['delayed', 'waiting', 'waiting-children', 'prioritized'].includes(state)) {
        await existingJob.remove().catch(() => undefined);
      }
    }

    await this.conversationSummaryQueue.add(
      PROCESS_CONVERSATION_SUMMARY_JOB,
      { conversationId },
      {
        jobId,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2_000,
        },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );
  }

  private buildTitle(question: string) {
    return question.length > 72 ? `${question.slice(0, 69)}...` : question;
  }

  private toMessageView(message: { id: string; role: ConversationMessageRole; contentText: string; createdAt: Date }): ConversationMessageView {
    return {
      id: message.id,
      role: message.role === ConversationMessageRole.USER ? 'user' : 'assistant',
      text: message.contentText,
      createdAt: message.createdAt.toISOString(),
      responseJson:
        'responseJson' in message && message.responseJson && typeof message.responseJson === 'object'
          ? (message.responseJson as ConversationMessageView['responseJson'])
          : null,
    };
  }
}
