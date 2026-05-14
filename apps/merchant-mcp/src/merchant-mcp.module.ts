import { Module } from '@nestjs/common';
import { MerchantMcpController } from './merchant-mcp.controller';
import { MerchantMcpService } from './merchant-mcp.service';

@Module({
  imports: [],
  controllers: [MerchantMcpController],
  providers: [MerchantMcpService],
})
export class MerchantMcpModule {}
