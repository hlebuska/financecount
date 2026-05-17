import { Test, TestingModule } from '@nestjs/testing';
import { MerchantMcpController } from './merchant-mcp.controller';
import { MerchantMcpServerService } from './merchant-mcp-server.service';

describe('MerchantMcpController', () => {
  let merchantMcpController: MerchantMcpController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [MerchantMcpController],
      providers: [
        {
          provide: MerchantMcpServerService,
          useValue: {
            createServer: jest.fn(),
          },
        },
      ],
    }).compile();

    merchantMcpController = app.get<MerchantMcpController>(MerchantMcpController);
  });

  describe('health', () => {
    it('should return ok', () => {
      expect(merchantMcpController.getHealth()).toEqual({ ok: true });
    });
  });
});
