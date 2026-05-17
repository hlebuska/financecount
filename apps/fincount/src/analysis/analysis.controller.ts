import { Controller, Get, Query } from '@nestjs/common';
import { AnalysisPeriodType } from '@prisma/client';
import { AnalysisService } from './analysis.service';

@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Get('stats')
  findStats(@Query('periodType') periodType?: AnalysisPeriodType) {
    return this.analysisService.findStats('demo-user', periodType);
  }

  @Get('signals')
  findSignals(@Query('periodType') periodType?: AnalysisPeriodType) {
    return this.analysisService.findSignals('demo-user', periodType);
  }
}
