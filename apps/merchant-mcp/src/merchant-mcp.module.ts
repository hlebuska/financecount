import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MerchantMcpController } from './merchant-mcp.controller';
import { MerchantMcpCacheService } from './merchant-mcp-cache.service';
import { MerchantMcpServerService } from './merchant-mcp-server.service';
import { MerchantMcpToolService } from './merchant-mcp-tool.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [MerchantMcpController],
  providers: [
    MerchantMcpCacheService,
    MerchantMcpServerService,
    MerchantMcpToolService,
  ],
  exports: [MerchantMcpServerService],
})
export class MerchantMcpModule {}
