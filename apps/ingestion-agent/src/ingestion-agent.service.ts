import { Injectable } from '@nestjs/common';

@Injectable()
export class IngestionAgentService {
  getHello(): string {
    return 'Hello World!';
  }
}
