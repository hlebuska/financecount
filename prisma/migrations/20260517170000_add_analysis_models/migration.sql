CREATE TYPE "AnalysisPeriodType" AS ENUM ('WEEK', 'MONTH', 'ALL_TIME');

CREATE TYPE "AnalysisDimensionType" AS ENUM ('OVERALL', 'CATEGORY', 'MERCHANT');

CREATE TYPE "FinancialMetric" AS ENUM ('TOTAL_INCOME', 'TOTAL_EXPENSE', 'NET_CASHFLOW', 'TRANSACTION_COUNT');

CREATE TYPE "AnalysisSignalType" AS ENUM (
  'CATEGORY_INCREASE',
  'CATEGORY_DECREASE',
  'HIGH_UNCATEGORIZED_SHARE',
  'TOP_CATEGORY_CHANGED'
);

CREATE TYPE "AnalysisSignalSeverity" AS ENUM ('INFO', 'NOTICE', 'WARNING');

CREATE TABLE "AnalysisRefreshRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "dirtyWeekStarts" JSONB,
  "dirtyMonthStarts" JSONB,
  "latestReason" TEXT,
  "queuedJobId" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AnalysisRefreshRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AnalysisRefreshRequest_userId_key" ON "AnalysisRefreshRequest"("userId");

CREATE TABLE "FinancialStat" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "periodType" "AnalysisPeriodType" NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "dimensionType" "AnalysisDimensionType" NOT NULL,
  "dimensionKey" TEXT,
  "dimensionLabel" TEXT,
  "metric" "FinancialMetric" NOT NULL,
  "value" DOUBLE PRECISION NOT NULL,
  "currency" TEXT,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FinancialStat_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FinancialStat_userId_periodType_periodStart_idx" ON "FinancialStat"("userId", "periodType", "periodStart");
CREATE INDEX "FinancialStat_userId_dimensionType_metric_idx" ON "FinancialStat"("userId", "dimensionType", "metric");

CREATE TABLE "AnalysisSignal" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "AnalysisSignalType" NOT NULL,
  "severity" "AnalysisSignalSeverity" NOT NULL,
  "periodType" "AnalysisPeriodType" NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "dimensionKey" TEXT,
  "dimensionLabel" TEXT,
  "currency" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "evidenceJson" JSONB,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AnalysisSignal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AnalysisSignal_userId_periodType_periodStart_idx" ON "AnalysisSignal"("userId", "periodType", "periodStart");
CREATE INDEX "AnalysisSignal_userId_type_computedAt_idx" ON "AnalysisSignal"("userId", "type", "computedAt");
