import { Injectable, Logger } from '@nestjs/common';
import { DEFAULT_CATEGORIES } from '@app/contracts';
import OpenAI from 'openai';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  EnrichMerchantInput,
  EnrichMerchantOutput,
} from './merchant-mcp.schemas';
import { MerchantMcpCacheService } from './merchant-mcp-cache.service';

const llmOutputSchema = z.object({
  normalizedMerchantName: z.string().nullable(),
  likelyCategory: z.string().nullable(),
  businessType: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  ambiguityFlags: z.array(z.string()),
  sourceSnippets: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      snippet: z.string(),
    }),
  ),
});

function getConfiguredModel() {
  const model = process.env.CHAT_MODEL;

  if (!model || model === 'your_chat_model_here') {
    return 'gpt-5.5';
  }

  return model;
}

@Injectable()
export class MerchantMcpToolService {
  private readonly logger = new Logger(MerchantMcpToolService.name);
  private readonly openai = process.env.OPENAI_API_KEY ?? process.env.LLM_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? process.env.LLM_API_KEY })
    : null;
  private readonly model = getConfiguredModel();

  constructor(private readonly cache: MerchantMcpCacheService) {}

  async enrichMerchant(input: EnrichMerchantInput): Promise<EnrichMerchantOutput> {
    const searchQuery = this.buildSearchQuery(input);

    if (!searchQuery) {
      this.logger.warn('Merchant enrichment received empty search query.');
    }

    const cacheKey = this.buildCacheKey(input, searchQuery);
    this.logger.debug(`Computed cache key for query=${searchQuery}: ${cacheKey}`);
    const cached = await this.cache.get<EnrichMerchantOutput>(cacheKey);

    if (cached) {
      this.logger.log(`Cache hit for merchant query: ${searchQuery}`);
      return cached;
    }

    this.logger.log(`Running merchant enrichment for query: ${searchQuery}`);

    const result = this.openai
      ? await this.classifyWithWebSearch(input, searchQuery)
      : this.buildHeuristicFallback(input, 'OpenAI client is not configured.');

    const enriched: EnrichMerchantOutput = {
      normalizedMerchantName: result.normalizedMerchantName,
      likelyCategory: result.likelyCategory,
      businessType: result.businessType,
      confidence: result.confidence,
      ambiguityFlags: result.ambiguityFlags,
      provider: 'openai-web-search',
      searchQuery,
      sourceSnippets: result.sourceSnippets,
    };

    await this.cache.set(cacheKey, enriched);

    this.logger.log(
      `Enrichment completed: merchant=${enriched.normalizedMerchantName ?? 'unknown'} category=${enriched.likelyCategory ?? 'none'} confidence=${enriched.confidence}`,
    );

    return enriched;
  }

  private buildSearchQuery(input: EnrichMerchantInput) {
    const merchantCandidate = input.merchantCandidate?.trim();
    const description = input.description?.trim();

    if (merchantCandidate && description && !description.includes(merchantCandidate)) {
      return `${merchantCandidate} ${description}`;
    }

    return merchantCandidate ?? description ?? '';
  }

  private buildCacheKey(input: EnrichMerchantInput, searchQuery: string) {
    const normalized = JSON.stringify({
      merchantCandidate: input.merchantCandidate?.trim().toUpperCase() ?? null,
      description: input.description?.trim().toUpperCase() ?? null,
      searchQuery: searchQuery.trim().toUpperCase(),
    });

    return `merchant-mcp:${createHash('sha256').update(normalized).digest('hex')}`;
  }

  private async classifyWithWebSearch(input: EnrichMerchantInput, searchQuery: string) {
    this.logger.debug(`Calling OpenAI web search for query: ${searchQuery}`);
    try {
      const response = await this.openai!.responses.create({
        model: this.model,
        tools: [
          {
            type: 'web_search',
            search_context_size: 'low',
          },
        ],
        input: this.buildWebSearchPrompt(input, searchQuery),
      });

      this.logger.debug(`OpenAI web search response received for query: ${searchQuery}`);

      const parsed = this.parseJsonObject(response.output_text);
      return llmOutputSchema.parse(parsed);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `OpenAI web search failed for query=${searchQuery}`,
        error instanceof Error ? error.stack : String(error),
      );
      return this.buildHeuristicFallback(input, `OpenAI web search failed: ${reason}`);
    }
  }

  private buildWebSearchPrompt(input: EnrichMerchantInput, searchQuery: string) {
    return [
      'You are enriching a merchant from transaction context using web search evidence.',
      'Research the merchant and return strict JSON only.',
      'Do not wrap the JSON in markdown fences.',
      'If uncertain, keep fields null and lower confidence.',
      `Only choose likelyCategory from these existing categories: ${DEFAULT_CATEGORIES.map((category) => category.name).join(', ')}.`,
      'Do not invent new categories.',
      'Return this exact JSON shape:',
      '{"normalizedMerchantName":string|null,"likelyCategory":string|null,"businessType":string|null,"confidence":number,"ambiguityFlags":string[],"sourceSnippets":[{"title":string,"url":string,"snippet":string}]}',
      'Include up to 5 sourceSnippets.',
      `searchQuery: ${searchQuery}`,
      `merchantCandidate: ${input.merchantCandidate ?? 'null'}`,
      `description: ${input.description ?? 'null'}`,
    ].join('\n');
  }

  private parseJsonObject(outputText: string) {
    const trimmed = outputText.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const candidate = fenced?.[1] ?? trimmed;

    try {
      return JSON.parse(candidate);
    } catch (error) {
      this.logger.error(
        `Failed to parse OpenAI output as JSON: ${candidate}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  private buildHeuristicFallback(input: EnrichMerchantInput, reason: string) {
    this.logger.warn(`${reason} Using heuristic fallback.`);

    const normalizedMerchantName =
      input.merchantCandidate?.trim() ??
      input.description?.trim() ??
      null;

    return {
      normalizedMerchantName,
      likelyCategory: null,
      businessType: null,
      confidence: normalizedMerchantName ? 0.2 : 0,
      ambiguityFlags: ['openai_web_search_unavailable'],
      sourceSnippets: [],
    };
  }
}
