import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  EnrichMerchantInput,
  enrichMerchantInputSchema,
  enrichMerchantOutputSchema,
} from './merchant-mcp.schemas';
import { MerchantMcpToolService } from './merchant-mcp-tool.service';

@Injectable()
export class MerchantMcpServerService {
  constructor(private readonly merchantMcpToolService: MerchantMcpToolService) {}

  createServer() {
    const server = new McpServer({
      name: 'merchant-mcp',
      version: '1.0.0',
    });

    server.registerTool(
      'enrich_merchant',
      {
        title: 'Merchant Enrichment',
        description:
          'Researches merchant context from web search and returns structured enrichment data to help categorization.',
        inputSchema: enrichMerchantInputSchema,
        outputSchema: enrichMerchantOutputSchema,
      },
      async (args: EnrichMerchantInput) => {
        const structuredContent = await this.merchantMcpToolService.enrichMerchant(args);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(structuredContent, null, 2),
            },
          ],
          structuredContent,
        };
      },
    );

    return server;
  }
}
