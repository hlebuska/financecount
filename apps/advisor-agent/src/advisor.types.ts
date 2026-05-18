import { z } from 'zod';

export const advisorResponseSchema = z.object({
  summary: z.string(),
  answer: z.string(),
  supportingFacts: z.array(z.string()),
  recommendations: z.array(z.string()),
  limitations: z.array(z.string()),
});

export type AdvisorResponse = z.infer<typeof advisorResponseSchema>;

export interface ConversationMessageView {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
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
