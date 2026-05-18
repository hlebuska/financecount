import { z } from 'zod';

const advisorTransactionCardItemSchema = z.object({
  id: z.string(),
  merchant: z.string(),
  occurredAt: z.string(),
  amount: z.number(),
  currency: z.string(),
  direction: z.enum(['EXPENSE', 'INCOME']),
  category: z.string(),
  categoryStatus: z.string(),
});

const advisorTransactionCardBlockSchema = z.object({
  type: z.literal('transaction_card'),
  title: z.string(),
  transactions: z.array(advisorTransactionCardItemSchema).max(5),
});

const advisorChartDataPointSchema = z.object({
  label: z.string(),
  value: z.number(),
});

const advisorChartBlockSchema = z.object({
  type: z.literal('chart'),
  chartType: z.enum(['bar', 'line']),
  title: z.string(),
  seriesLabel: z.string(),
  currency: z.string().nullable(),
  data: z.array(advisorChartDataPointSchema).min(2).max(12),
});

export const advisorVisualBlockSchema = z.union([
  advisorTransactionCardBlockSchema,
  advisorChartBlockSchema,
]);

export const advisorResponseSchema = z.object({
  summary: z.string(),
  answer: z.string(),
  supportingFacts: z.array(z.string()),
  recommendations: z.array(z.string()),
  limitations: z.array(z.string()),
  blocks: z.array(advisorVisualBlockSchema).max(4),
});

export type AdvisorResponse = z.infer<typeof advisorResponseSchema>;
export type AdvisorVisualBlock = z.infer<typeof advisorVisualBlockSchema>;

export interface ConversationMessageView {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  responseJson?: AdvisorResponse | null;
}

export interface ConversationListItem {
  id: string;
  title: string;
  updatedAt: string;
}

export interface AdvisorQueryResult {
  conversationId: string;
  title: string;
  userMessage: ConversationMessageView;
  assistantMessage: ConversationMessageView;
}
