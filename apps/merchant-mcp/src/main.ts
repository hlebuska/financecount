import { NestFactory } from '@nestjs/core';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { MerchantMcpModule } from './merchant-mcp.module';
import { MerchantMcpServerService } from './merchant-mcp-server.service';

async function bootstrap() {
  const transportMode = process.env.MCP_TRANSPORT ?? (process.argv.includes('--stdio') ? 'stdio' : 'http');

  if (transportMode === 'stdio') {
    const app = await NestFactory.createApplicationContext(MerchantMcpModule, {
      logger: false,
    });
    const serverFactory = app.get(MerchantMcpServerService);
    const server = serverFactory.createServer();
    const transport = new StdioServerTransport();

    await server.connect(transport);
    console.error('merchant-mcp started in stdio mode');

    const shutdown = async () => {
      await transport.close();
      await server.close();
      await app.close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    return;
  }

  const app = await NestFactory.create(MerchantMcpModule);
  const port = Number(process.env.MCP_SERVER_PORT ?? process.env.PORT ?? 3004);
  await app.listen(port);
  console.log(`merchant-mcp listening on http://localhost:${port}`);
}
bootstrap();
