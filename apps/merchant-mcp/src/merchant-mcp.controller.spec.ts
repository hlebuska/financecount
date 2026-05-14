import { Test, TestingModule } from '@nestjs/testing';
import { MerchantMcpController } from './merchant-mcp.controller';
import { MerchantMcpService } from './merchant-mcp.service';

describe('MerchantMcpController', () => {
  let merchantMcpController: MerchantMcpController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [MerchantMcpController],
      providers: [MerchantMcpService],
    }).compile();

    merchantMcpController = app.get<MerchantMcpController>(MerchantMcpController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(merchantMcpController.getHello()).toBe('Hello World!');
    });
  });
});
