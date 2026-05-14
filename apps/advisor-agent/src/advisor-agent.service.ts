import { Injectable } from '@nestjs/common';

@Injectable()
export class AdvisorAgentService {
  getHello(): string {
    return 'Hello World!';
  }
}
