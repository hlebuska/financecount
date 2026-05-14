import { Injectable } from '@nestjs/common';

@Injectable()
export class AnalystAgentService {
  getHello(): string {
    return 'Hello World!';
  }
}
