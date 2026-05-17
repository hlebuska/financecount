import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class MerchantMcpCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MerchantMcpCacheService.name);
  private client: RedisClientType;
  private readonly ttlSeconds = Number(process.env.MERCHANT_MCP_CACHE_TTL_SECONDS ?? 604800);
  private readonly useMemoryCache =
    process.env.MERCHANT_MCP_CACHE_MODE === 'memory' || process.env.NODE_ENV === 'test';
  private readonly memoryCache = new Map<string, string>();

  constructor() {
    const redisUrl =
      process.env.REDIS_URL ??
      `redis://${process.env.REDIS_HOST ?? 'localhost'}:${process.env.REDIS_PORT ?? '6379'}`;

    this.client = createClient({ url: redisUrl });
  }

  async onModuleInit() {
    if (this.useMemoryCache) {
      this.logger.log('Using in-memory cache mode.');
      return;
    }

    this.logger.log('Connecting to Redis cache.');
    await this.client.connect();
    this.logger.log('Connected to Redis cache.');
  }

  async onModuleDestroy() {
    if (this.useMemoryCache) {
      return;
    }

    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.useMemoryCache) {
      const value = this.memoryCache.get(key);

      return value ? (JSON.parse(value) as T) : null;
    }

    try {
      const value = await this.client.get(key);

      return value ? (JSON.parse(value) as T) : null;
    } catch (error) {
      this.logger.error(
        `Cache read failed for key=${key}`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }

  async set(key: string, value: unknown) {
    if (this.useMemoryCache) {
      this.memoryCache.set(key, JSON.stringify(value));
      return;
    }

    try {
      await this.client.set(key, JSON.stringify(value), {
        EX: this.ttlSeconds,
      });
    } catch (error) {
      this.logger.error(
        `Cache write failed for key=${key}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
