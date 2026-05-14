import { NestFactory } from '@nestjs/core';
import { MerchantMcpModule } from './merchant-mcp.module';

async function bootstrap() {
  const app = await NestFactory.create(MerchantMcpModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
