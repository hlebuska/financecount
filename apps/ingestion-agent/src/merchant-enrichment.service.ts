import { Injectable, Logger } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export interface MerchantEnrichmentResultPayload {
  normalizedMerchantName: string | null;
  likelyCategory: string | null;
  businessType: string | null;
  confidence: number | null;
  ambiguityFlags: unknown;
  rawResponse: unknown;
}

interface MerchantToolStructuredContent {
  normalizedMerchantName: string | null;
  likelyCategory: string | null;
  businessType: string | null;
  confidence: number;
  ambiguityFlags: string[];
  provider: string;
  searchQuery: string;
  sourceSnippets: Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
}

@Injectable()
export class MerchantEnrichmentService {
  private readonly logger = new Logger(MerchantEnrichmentService.name);
  private readonly merchantMcpUrl = process.env.MERCHANT_MCP_URL;

  async enrich(params: {
    description: string | null;
    merchantCandidate: string | null;
  }): Promise<MerchantEnrichmentResultPayload | null> {
    if (!this.merchantMcpUrl || (!params.description && !params.merchantCandidate)) {
      return null;
    }

    const serverUrl = this.normalizeMcpUrl(this.merchantMcpUrl);
    const client = new Client({
      name: 'ingestion-agent',
      version: '1.0.0',
    });
    const transport = new StreamableHTTPClientTransport(new URL(serverUrl));

    try {
      await client.connect(transport);

      const result = (await client.callTool({
        name: 'enrich_merchant',
        arguments: {
          description: params.description,
          merchantCandidate: params.merchantCandidate,
        },
      })) as {
        structuredContent?: MerchantToolStructuredContent;
      };

      const structuredContent = result.structuredContent;

      if (!structuredContent) {
        return null;
      }

      return {
        normalizedMerchantName: structuredContent.normalizedMerchantName,
        likelyCategory: structuredContent.likelyCategory,
        businessType: structuredContent.businessType,
        confidence: structuredContent.confidence,
        ambiguityFlags: structuredContent.ambiguityFlags,
        rawResponse: structuredContent,
      };
    } catch (error) {
      this.logger.warn(
        `Merchant enrichment failed: ${error instanceof Error ? error.message : String(error)}`,
      );

      return null;
    } finally {
      await client.close().catch(() => undefined);
      await transport.close().catch(() => undefined);
    }
  }

  private normalizeMcpUrl(url: string) {
    return url.endsWith('/mcp') ? url : `${url.replace(/\/$/, '')}/mcp`;
  }
}
