import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

interface ParseFileResponse {
  text: string;
}

@Injectable()
export class ParserClientService {
  private readonly parserServiceUrl =
    process.env.PARSER_SERVICE_URL ?? 'http://localhost:8001';

  constructor(private readonly httpService: HttpService) {}

  async parseFile(filePath: string): Promise<string> {
    const response = await firstValueFrom(
      this.httpService.post<ParseFileResponse>(`${this.parserServiceUrl}/parse`, {
        filePath,
      }),
    );

    return response.data.text;
  }
}
