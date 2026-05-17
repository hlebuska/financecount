import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingsService } from '../rag/embeddings.service';
import { QdrantService } from '../rag/qdrant.service';

type ResolvedTransactionForMemory = {
  id: string;
  rawMerchantLabel: string | null;
  normalizedMerchantName: string | null;
  businessType: string | null;
  direction: string;
  category: {
    id: string;
    name: string;
    slug: string;
  } | null;
};

@Injectable()
export class CategorizationMemoryService {
  private readonly logger = new Logger(CategorizationMemoryService.name);

  constructor(
    private readonly embeddingsService: EmbeddingsService,
    private readonly qdrantService: QdrantService,
  ) {}

  async upsertFromResolvedTransaction(transaction: ResolvedTransactionForMemory) {
    if (!transaction.category) {
      this.logger.warn(`Skipping memory upsert: transaction ${transaction.id} has no category`);
      return;
    }

    this.logger.log(`Creating categorization memory for transaction ${transaction.id}`);

    const embeddingText = [
      `raw merchant label: ${transaction.rawMerchantLabel ?? 'unknown'}`,
      `normalized merchant name: ${transaction.normalizedMerchantName ?? 'unknown'}`,
      `business type: ${transaction.businessType ?? 'unknown'}`,
      `direction: ${transaction.direction}`,
      `category: ${transaction.category.name}`,
    ].join('\n');

    this.logger.debug(`Embedding text:\n${embeddingText}`);

    const vector = await this.embeddingsService.embed(embeddingText);
    const pointId = randomUUID();

    this.logger.log(`Upserting Qdrant point ${pointId} into categorization_memory`);

    await this.qdrantService.upsertPoint({
      collectionName: 'categorization_memory',
      id: pointId,
      vector,
      payload: {
        transactionId: transaction.id,
        rawMerchantLabel: transaction.rawMerchantLabel,
        normalizedMerchantName: transaction.normalizedMerchantName,
        businessType: transaction.businessType,
        direction: transaction.direction,
        categoryId: transaction.category.id,
        categoryName: transaction.category.name,
        categorySlug: transaction.category.slug,
        source: 'USER_REVIEW',
      },
    });

    this.logger.log(
      `Saved categorization memory: ${transaction.normalizedMerchantName ?? transaction.rawMerchantLabel} → ${transaction.category.name}`,
    );
  }

  async findBestCategoryMatch(input: {
    rawDescription: string | null;
    merchantCandidate: string | null;
    direction: string;
  }) {
    this.logger.log(
      `Searching categorization memory for: ${input.merchantCandidate ?? input.rawDescription ?? 'unknown'}`,
    );

    const results = await this.searchSimilar(input);
    const best = results[0];

    if (!best?.payload) {
      this.logger.log('No categorization memory matches found');
      return null;
    }

    this.logger.log(
      `Best memory match score=${best.score}, category=${String(best.payload.categoryName)}`,
    );

    return {
      score: best.score,
      categoryId: String(best.payload.categoryId),
      categoryName: String(best.payload.categoryName),
      categorySlug: String(best.payload.categorySlug),
      normalizedMerchantName:
        typeof best.payload.normalizedMerchantName === 'string'
          ? best.payload.normalizedMerchantName
          : null,
      businessType: typeof best.payload.businessType === 'string' ? best.payload.businessType : null,
    };
  }

  async searchSimilar(input: {
    rawDescription: string | null;
    merchantCandidate: string | null;
    direction: string;
  }) {
    const queryText = [
      `raw merchant label: ${input.rawDescription ?? 'unknown'}`,
      `merchant candidate: ${input.merchantCandidate ?? 'unknown'}`,
      `direction: ${input.direction}`,
    ].join('\n');

    this.logger.debug(`Memory search query:\n${queryText}`);

    const vector = await this.embeddingsService.embed(queryText);

    const results = await this.qdrantService.search({
      collectionName: 'categorization_memory',
      vector,
      limit: 5,
    });

    this.logger.log(`Found ${results.length} memory match(es)`);

    return results;
  }
}