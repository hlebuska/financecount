import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

export interface MerchantEnrichmentResultPayload {
  normalizedMerchantName: string | null;
  likelyCategory: string | null;
  businessType: string | null;
  confidence: number | null;
  ambiguityFlags: unknown;
  rawResponse: unknown;
}

@Injectable()
export class MerchantEnrichmentService {
  private readonly logger = new Logger(MerchantEnrichmentService.name);
  private readonly merchantMcpUrl = process.env.MERCHANT_MCP_URL;

  constructor(private readonly httpService: HttpService) {}

  async enrich(params: {
    description: string | null;
    merchantCandidate: string | null;
  }): Promise<MerchantEnrichmentResultPayload | null> {
    if (!this.merchantMcpUrl || (!params.description && !params.merchantCandidate)) {
      return null;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post<MerchantEnrichmentResultPayload>(`${this.merchantMcpUrl}/enrich`, {
          description: params.description,
          merchantCandidate: params.merchantCandidate,
        }),
      );

      return response.data;
    } catch (error) {
      this.logger.warn(
        `Merchant enrichment failed: ${error instanceof Error ? error.message : String(error)}`,
      );

      return null;
    }
  }
}
