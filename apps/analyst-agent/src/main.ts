import { NestFactory } from '@nestjs/core';
import { AnalystAgentModule } from './analyst-agent.module';

async function bootstrap() {
  const app = await NestFactory.create(AnalystAgentModule);
  await app.listen(process.env.ANALYST_AGENT_PORT ?? process.env.PORT ?? 3002);
}
bootstrap();
