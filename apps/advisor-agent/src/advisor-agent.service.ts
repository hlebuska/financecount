import { Injectable } from '@nestjs/common';
import { AIMessage, HumanMessage, SystemMessage, createAgent, tool } from 'langchain';
import { ChatOpenAI } from '@langchain/openai';
import { AnalysisPeriodType, ConversationMessageRole } from '@prisma/client';
import { z } from 'zod';
import { AdvisorKnowledgeService } from './advisor-knowledge.service';
import { AdvisorRetrievalService } from './advisor-retrieval.service';
import { AdvisorResponse, advisorResponseSchema } from './advisor.types';

const USER_ID = 'demo-user';

const queryPeriodSchema = z.enum(['WEEK', 'MONTH', 'ALL_TIME']).nullable();
const overallStatsToolSchema = z.object({
  periodType: queryPeriodSchema.describe('Use WEEK, MONTH, or ALL_TIME.'),
});
const categoryStatsToolSchema = z.object({
  periodType: queryPeriodSchema.describe('Use WEEK, MONTH, or ALL_TIME.'),
  category: z.string().nullable().describe('Optional category name or slug.'),
});
const analysisSignalsToolSchema = z.object({
  periodType: queryPeriodSchema.describe('Use WEEK, MONTH, or ALL_TIME.'),
  limit: z.number().int().min(1).max(20).nullable(),
});
const topMerchantsToolSchema = z.object({
  periodType: queryPeriodSchema.describe('Use WEEK, MONTH, or ALL_TIME.'),
  limit: z.number().int().min(1).max(20).nullable(),
});
const recentTransactionsToolSchema = z.object({
  periodType: queryPeriodSchema.describe('Use WEEK, MONTH, or ALL_TIME.'),
  category: z.string().nullable(),
  merchant: z.string().nullable(),
  limit: z.number().int().min(1).max(20).nullable(),
});
const reviewItemsToolSchema = z.object({
  status: z.enum(['OPEN', 'RESOLVED', 'DISMISSED']).nullable(),
  limit: z.number().int().min(1).max(20).nullable(),
});
const financeKnowledgeToolSchema = z.object({
  query: z.string(),
});

function getConfiguredModel() {
  const model = process.env.CHAT_MODEL;

  if (!model || model === 'your_chat_model_here') {
    return 'gpt-4o-mini';
  }

  return model;
}

@Injectable()
export class AdvisorAgentService {
  private readonly model = new ChatOpenAI({
    model: getConfiguredModel(),
    apiKey: process.env.OPENAI_API_KEY ?? process.env.LLM_API_KEY,
    temperature: 0.2,
  });

  private readonly agent = createAgent({
    model: this.model,
    tools: [
      tool(
        async ({ periodType }: z.infer<typeof overallStatsToolSchema>) => {
          const stats = await this.retrievalService.getOverallStats(
            USER_ID,
            (periodType as AnalysisPeriodType | undefined) ?? AnalysisPeriodType.MONTH,
          );
          return JSON.stringify(stats, null, 2);
        },
        {
          name: 'get_overall_stats',
          description: 'Get overall financial stats for the user for a period.',
          schema: overallStatsToolSchema,
        },
      ),
      tool(
        async ({ periodType, category }: z.infer<typeof categoryStatsToolSchema>) => {
          const stats = await this.retrievalService.getCategoryStats(USER_ID, {
            periodType: (periodType as AnalysisPeriodType | undefined) ?? AnalysisPeriodType.MONTH,
            category,
          });
          return JSON.stringify(stats, null, 2);
        },
        {
          name: 'get_category_stats',
          description: 'Get category financial stats, optionally for a specific category.',
          schema: categoryStatsToolSchema,
        },
      ),
      tool(
        async ({ periodType, limit }: z.infer<typeof analysisSignalsToolSchema>) => {
          const signals = await this.retrievalService.getAnalysisSignals(
            USER_ID,
            (periodType as AnalysisPeriodType | undefined) ?? AnalysisPeriodType.MONTH,
            limit ?? 10,
          );
          return JSON.stringify(signals, null, 2);
        },
        {
          name: 'get_analysis_signals',
          description: 'Get analysis signals that explain changes or issues in user finances.',
          schema: analysisSignalsToolSchema,
        },
      ),
      tool(
        async ({ periodType, limit }: z.infer<typeof topMerchantsToolSchema>) => {
          const stats = await this.retrievalService.getTopMerchants(
            USER_ID,
            (periodType as AnalysisPeriodType | undefined) ?? AnalysisPeriodType.MONTH,
            limit ?? 10,
          );
          return JSON.stringify(stats, null, 2);
        },
        {
          name: 'get_top_merchants',
          description: 'Get top merchants by financial activity.',
          schema: topMerchantsToolSchema,
        },
      ),
      tool(
        async ({ periodType, category, merchant, limit }: z.infer<typeof recentTransactionsToolSchema>) => {
          const transactions = await this.retrievalService.getRecentTransactions(USER_ID, {
            periodType: periodType as AnalysisPeriodType | undefined,
            category,
            merchant,
            limit,
          });
          return JSON.stringify(this.retrievalService.formatTransactionsForFacts(transactions), null, 2);
        },
        {
          name: 'get_recent_transactions',
          description: 'Get recent transactions, optionally filtered by period, category, or merchant.',
          schema: recentTransactionsToolSchema,
        },
      ),
      tool(
        async ({ status, limit }: z.infer<typeof reviewItemsToolSchema>) => {
          const reviews = await this.retrievalService.getReviewItems(USER_ID, status, limit ?? 10);
          return JSON.stringify(reviews, null, 2);
        },
        {
          name: 'get_review_items',
          description: 'Get review items for unresolved or resolved categorization cases.',
          schema: reviewItemsToolSchema,
        },
      ),
      tool(
        async ({ query }: z.infer<typeof financeKnowledgeToolSchema>) => {
          const knowledge = await this.knowledgeService.retrieve(query);
          return JSON.stringify(knowledge, null, 2);
        },
        {
          name: 'retrieve_finance_knowledge',
          description:
            'Retrieve general finance and budgeting knowledge. Use only when advice or explanation is needed.',
          schema: financeKnowledgeToolSchema,
        },
      ),
    ],
    responseFormat: advisorResponseSchema,
    systemPrompt: [
      'You are Fincount advisor, a grounded personal finance assistant.',
      'Use SQL-backed tools for user-specific facts: transactions, reviews, stats, and signals.',
      'Use finance knowledge retrieval only for general guidance or explanation framing.',
      'Never invent totals, trends, or transaction facts.',
      'If data is incomplete or uncategorized, mention that in limitations.',
      'Return concise, helpful structured output.',
    ].join(' '),
  });

  constructor(
    private readonly retrievalService: AdvisorRetrievalService,
    private readonly knowledgeService: AdvisorKnowledgeService,
  ) {}

  getHello(): string {
    return 'Advisor agent is running.';
  }

  async answerQuestion(params: {
    question: string;
    summaryText?: string | null;
    recentMessages: Array<{ role: ConversationMessageRole; contentText: string }>;
  }) {
    const messages: Array<SystemMessage | HumanMessage | AIMessage> = [];

    if (params.summaryText?.trim()) {
      messages.push(
        new SystemMessage(
          `Conversation summary so far: ${params.summaryText}. Use it as background context when relevant.`,
        ),
      );
    }

    for (const message of params.recentMessages) {
      if (message.role === ConversationMessageRole.USER) {
        messages.push(new HumanMessage(message.contentText));
      } else {
        messages.push(new AIMessage(message.contentText));
      }
    }

    const result = await this.agent.invoke({ messages });
    const structuredResponse = result.structuredResponse as AdvisorResponse;

    return {
      response: structuredResponse,
      text: this.renderAssistantText(structuredResponse),
    };
  }

  async summarizeConversation(params: {
    existingSummaryText?: string | null;
    messages: Array<{ role: ConversationMessageRole; contentText: string }>;
  }) {
    if (params.messages.length === 0) {
      return null;
    }

    const prompt = [
      'Summarize this financial assistant conversation for future turns.',
      'Preserve the user\'s goals, important financial facts mentioned, unresolved questions, and any guidance already given.',
      'Keep the summary concise and factual.',
      params.existingSummaryText?.trim()
        ? `Existing summary:\n${params.existingSummaryText}`
        : 'Existing summary: none.',
      'Messages:',
      ...params.messages.map((message) => `${message.role === ConversationMessageRole.USER ? 'User' : 'Assistant'}: ${message.contentText}`),
    ].join('\n\n');

    const result = await this.model.invoke([new HumanMessage(prompt)]);
    return this.normalizeModelText(result.content);
  }

  private renderAssistantText(response: AdvisorResponse) {
    const sections = [response.summary, response.answer];

    if (response.supportingFacts.length > 0) {
      sections.push(`Supporting facts:\n- ${response.supportingFacts.join('\n- ')}`);
    }

    if (response.recommendations.length > 0) {
      sections.push(`Recommendations:\n- ${response.recommendations.join('\n- ')}`);
    }

    if (response.limitations.length > 0) {
      sections.push(`Limitations:\n- ${response.limitations.join('\n- ')}`);
    }

    return sections.filter(Boolean).join('\n\n');
  }

  private normalizeModelText(content: unknown) {
    if (typeof content === 'string') {
      return content.trim();
    }

    if (Array.isArray(content)) {
      return content
        .map((item) => {
          if (typeof item === 'string') {
            return item;
          }

          if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string') {
            return item.text;
          }

          return '';
        })
        .join('\n')
        .trim();
    }

    return String(content ?? '').trim();
  }
}
