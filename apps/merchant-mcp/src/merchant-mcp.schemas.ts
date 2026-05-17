import * as z from 'zod/v4';

export const enrichMerchantInputSchema = {
  description: z.string().trim().min(1).nullable().optional(),
  merchantCandidate: z.string().trim().min(1).nullable().optional(),
};

export const enrichMerchantOutputSchema = {
  normalizedMerchantName: z.string().nullable(),
  likelyCategory: z.string().nullable(),
  businessType: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  ambiguityFlags: z.array(z.string()),
  provider: z.string(),
  searchQuery: z.string(),
  sourceSnippets: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      snippet: z.string(),
    }),
  ),
};

export type EnrichMerchantInput = z.infer<z.ZodObject<typeof enrichMerchantInputSchema>>;
export type EnrichMerchantOutput = z.infer<z.ZodObject<typeof enrichMerchantOutputSchema>>;
