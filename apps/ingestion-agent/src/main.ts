import { NestFactory } from '@nestjs/core';
import { IngestionAgentModule } from './ingestion-agent.module';

async function bootstrap() {
  const app = await NestFactory.create(IngestionAgentModule);
  await app.listen(process.env.port ?? 3001);
}
bootstrap();
