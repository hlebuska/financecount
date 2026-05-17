import { Injectable } from '@nestjs/common';
import { DEFAULT_CATEGORIES, normalizeCategorySlug } from '@app/contracts';
import OpenAI from 'openai';
import {
  Prisma,
  RuleMatchType,
  TransactionCategoryStatus,
} from '@prisma/client';
import { z } from 'zod';
import { DbService } from '@app/db';
import {
  CategorizationResult,
  NormalizedTransactionData,
} from './ingestion.types';
import {
  MerchantEnrichmentResultPayload,
  MerchantEnrichmentService,
} from './merchant-enrichment.service';
import { CategorizationMemoryService } from 'libs/categorization-memory/categorization-memory.service';

const classificationSchema = z.object({
  category: z.string().nullable(),
  normalizedMerchantName: z.string().nullable(),
  businessType: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

function getConfiguredModel() {
  const model = process.env.CHAT_MODEL;

  if (!model || model === 'your_chat_model_here') {
    return 'gpt-4o-mini';
  }

  return model;
}

@Injectable()
export class TransactionCategorizerService {
  private readonly model = getConfiguredModel();

  private readonly openai =
    (process.env.OPENAI_API_KEY ?? process.env.LLM_API_KEY)
      ? new OpenAI({
          apiKey: process.env.OPENAI_API_KEY ?? process.env.LLM_API_KEY,
        })
      : null;

  constructor(
    private readonly prisma: DbService,
    private readonly categorizationMemoryService: CategorizationMemoryService,
    private readonly merchantEnrichmentService: MerchantEnrichmentService,
  ) {}

  async categorize(params: {
    userId: string;
    rawExtractedTransactionId: string;
    rawDescription: string | null;
    normalized: NormalizedTransactionData;
  }): Promise<CategorizationResult> {
    const ruleMatch = await this.findRuleMatch(
      params.userId,
      params.normalized.merchantCandidate,
    );

    if (ruleMatch) {
      return {
        normalizedMerchantName:
          ruleMatch.normalizedMerchantName ??
          params.normalized.merchantCandidate,
        categoryId: ruleMatch.category?.id ?? null,
        categoryName: ruleMatch.category?.name ?? null,
        businessType: ruleMatch.businessType ?? null,
        confidence: ruleMatch.confidence,
        categoryStatus: ruleMatch.category
          ? TransactionCategoryStatus.CATEGORIZED
          : TransactionCategoryStatus.UNCATEGORIZED,
      };
    }

    const memoryMatch =
      await this.categorizationMemoryService.findBestCategoryMatch({
        rawDescription: params.rawDescription,
        merchantCandidate: params.normalized.merchantCandidate,
        direction: params.normalized.direction,
      });

    if (memoryMatch && memoryMatch.score >= 0.65) {
      return {
        normalizedMerchantName:
          memoryMatch.normalizedMerchantName ??
          params.normalized.merchantCandidate,
        categoryId: memoryMatch.categoryId,
        categoryName: memoryMatch.categoryName,
        businessType: memoryMatch.businessType ?? null,
        confidence: memoryMatch.score,
        categoryStatus: TransactionCategoryStatus.CATEGORIZED,
      };
    }

    const enrichment = await this.persistEnrichment(
      params.rawExtractedTransactionId,
      params.normalized,
      params.rawDescription,
    );

    if (enrichment?.likelyCategory && (enrichment.confidence ?? 0) >= 0.85) {
      const category = await this.resolveCategory(enrichment.likelyCategory);

      if (category) {
        return {
          normalizedMerchantName:
            enrichment.normalizedMerchantName ??
            params.normalized.merchantCandidate,
          categoryId: category.id,
          categoryName: category.name,
          businessType: enrichment.businessType ?? null,
          confidence: enrichment.confidence ?? 0,
          categoryStatus: TransactionCategoryStatus.CATEGORIZED,
        };
      }
    }

    const llmClassification = await this.classifyWithLlm({
      rawDescription: params.rawDescription,
      normalized: params.normalized,
    });

    if (llmClassification?.category && llmClassification.confidence >= 0.85) {
      const category = await this.resolveCategory(llmClassification.category);

      if (category) {
        return {
          normalizedMerchantName:
            llmClassification.normalizedMerchantName ??
            params.normalized.merchantCandidate,
          categoryId: category.id,
          categoryName: category.name,
          businessType: llmClassification.businessType,
          confidence: llmClassification.confidence,
          categoryStatus: TransactionCategoryStatus.CATEGORIZED,
        };
      }
    }

    return {
      normalizedMerchantName: params.normalized.merchantCandidate,
      categoryId: null,
      categoryName: null,
      businessType: null,
      confidence: llmClassification?.confidence ?? enrichment?.confidence ?? 0,
      categoryStatus: TransactionCategoryStatus.UNCATEGORIZED,
    };
  }

  private async persistEnrichment(
    rawExtractedTransactionId: string,
    normalized: NormalizedTransactionData,
    rawDescription: string | null,
  ) {
    if (!normalized.merchantCandidate) {
      return null;
    }

    const enrichment = await this.merchantEnrichmentService.enrich({
      description:
        normalized.merchantCandidate === rawDescription?.trim().toUpperCase()
          ? null
          : rawDescription,
      merchantCandidate: normalized.merchantCandidate,
    });

    if (!enrichment) {
      return null;
    }

    await this.prisma.merchantEnrichmentResult.upsert({
      where: {
        rawExtractedTransactionId,
      },
      update: {
        normalizedMerchantName: enrichment.normalizedMerchantName,
        likelyCategory: enrichment.likelyCategory,
        businessType: enrichment.businessType,
        confidence: enrichment.confidence,
        ambiguityFlags: enrichment.ambiguityFlags as never,
        rawResponse: enrichment.rawResponse as never,
      },
      create: {
        rawExtractedTransactionId,
        normalizedMerchantName: enrichment.normalizedMerchantName,
        likelyCategory: enrichment.likelyCategory,
        businessType: enrichment.businessType,
        confidence: enrichment.confidence,
        ambiguityFlags: enrichment.ambiguityFlags as never,
        rawResponse: enrichment.rawResponse as never,
      },
    });

    return enrichment;
  }

  private async findRuleMatch(
    userId: string,
    merchantCandidate: string | null,
  ): Promise<Prisma.MerchantCategoryRuleGetPayload<{
    include: { category: true };
  }> | null> {
    if (!merchantCandidate) {
      return null;
    }

    const rules = await this.prisma.merchantCategoryRule.findMany({
      where: {
        OR: [{ userId }, { userId: null }],
      },
      include: {
        category: true,
      },
      orderBy: [{ userId: 'desc' }, { confidence: 'desc' }],
    });

    for (const rule of rules) {
      if (this.matchesRule(rule, merchantCandidate)) {
        return rule;
      }
    }

    return null;
  }

  private matchesRule(
    rule: Prisma.MerchantCategoryRuleGetPayload<{
      include: { category: true };
    }>,
    merchantCandidate: string,
  ): boolean {
    const pattern = rule.rawPattern.trim().toUpperCase();
    const subject = merchantCandidate.toUpperCase();

    switch (rule.matchType) {
      case RuleMatchType.EXACT:
        return subject === pattern;
      case RuleMatchType.CONTAINS:
        return subject.includes(pattern);
      case RuleMatchType.REGEX:
        return new RegExp(rule.rawPattern, 'i').test(merchantCandidate);
      default:
        return false;
    }
  }

  private async resolveCategory(categoryName: string) {
    const slug = normalizeCategorySlug(categoryName);

    return this.prisma.category.findUnique({
      where: {
        slug,
      },
    });
  }

  private async classifyWithLlm(params: {
    rawDescription: string | null;
    normalized: NormalizedTransactionData;
  }): Promise<z.infer<typeof classificationSchema> | null> {
    if (!this.openai) {
      return null;
    }

    const categories = await this.prisma.category.findMany({
      select: {
        name: true,
      },
    });

    const categoryNames = categories.map((c) => c.name);

    const response = await this.openai.responses.create({
      model: this.model,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: [
                'Classify a financial transaction into a spending category when reasonably confident.',
                'Return strict JSON only. Convert currencies to ISO 4217 codes (CAPS). Use the following categories:',
                'If uncertain, set category and merchant name to null and use low confidence.',
                `Only choose one of these existing categories: ${categoryNames.join(', ')}.`,
                'Do not invent new categories.',
              ].join(' '),
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify({
                rawDescription: params.rawDescription,
                merchantCandidate: params.normalized.merchantCandidate,
                amount: params.normalized.amount,
                currency: params.normalized.currency,
                direction: params.normalized.direction,
              }),
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'transaction_category',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              category: { type: ['string', 'null'] },
              normalizedMerchantName: { type: ['string', 'null'] },
              businessType: { type: ['string', 'null'] },
              confidence: { type: 'number' },
            },
            required: [
              'category',
              'normalizedMerchantName',
              'businessType',
              'confidence',
            ],
          },
        },
      },
    });

    return classificationSchema.parse(JSON.parse(response.output_text));
  }
}
