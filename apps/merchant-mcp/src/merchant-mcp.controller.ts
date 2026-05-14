import { Controller, Get } from '@nestjs/common';
import { MerchantMcpService } from './merchant-mcp.service';

@Controller()
export class MerchantMcpController {
  constructor(private readonly merchantMcpService: MerchantMcpService) {}

  @Get()
  getHello(): string {
    return this.merchantMcpService.getHello();
  }
}
