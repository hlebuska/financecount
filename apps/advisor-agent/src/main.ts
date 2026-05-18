import { NestFactory } from '@nestjs/core';
import { AdvisorAgentModule } from './advisor-agent.module';

async function bootstrap() {
  const app = await NestFactory.create(AdvisorAgentModule);
  app.enableCors({
    origin: true,
  });
  await app.listen(process.env.ADVISOR_AGENT_PORT ?? process.env.PORT ?? 3003);
}
bootstrap();
