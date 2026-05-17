import { Body, Controller, Delete, Get, Logger, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { MerchantMcpServerService } from './merchant-mcp-server.service';

@Controller()
export class MerchantMcpController {
  private readonly logger = new Logger(MerchantMcpController.name);

  constructor(private readonly merchantMcpServerService: MerchantMcpServerService) {}

  @Get('health')
  getHealth() {
    return { ok: true };
  }

  @Post('mcp')
  async handleMcpPost(@Req() req: Request, @Res() res: Response, @Body() body: unknown) {
    const method =
      body && typeof body === 'object' && 'method' in body && typeof body.method === 'string'
        ? body.method
        : 'unknown';
    const requestId =
      body && typeof body === 'object' && 'id' in body
        ? JSON.stringify(body.id)
        : 'unknown';

    this.logger.log(`Handling MCP request: method=${method} id=${requestId}`);

    const server = this.merchantMcpServerService.createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
      this.logger.log(`Completed MCP request: method=${method} id=${requestId} status=${res.statusCode}`);
    } catch (error) {
      this.logger.error(
        `MCP request failed: method=${method} id=${requestId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    } finally {
      await transport.close();
      await server.close();
    }
  }

  @Get('mcp')
  handleMcpGet(@Res() res: Response) {
    res.status(405).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed.',
      },
      id: null,
    });
  }

  @Delete('mcp')
  handleMcpDelete(@Res() res: Response) {
    res.status(405).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed.',
      },
      id: null,
    });
  }
}
