import { NestFactory } from '@nestjs/core';
import { AdvisorAgentModule } from './advisor-agent.module';

async function bootstrap() {
  const app = await NestFactory.create(AdvisorAgentModule);
  await app.listen(process.env.port ?? 3000);
}
bootstrap();
