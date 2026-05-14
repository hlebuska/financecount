import { NestFactory } from '@nestjs/core';
import { AnalystAgentModule } from './analyst-agent.module';

async function bootstrap() {
  const app = await NestFactory.create(AnalystAgentModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
