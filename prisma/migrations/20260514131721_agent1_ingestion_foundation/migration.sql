-- CreateEnum
CREATE TYPE "FileProcessingStatus" AS ENUM ('UPLOADED', 'QUEUED', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_WARNINGS', 'FAILED', 'DUPLICATE_FILE');

-- CreateEnum
CREATE TYPE "RawTransactionStatus" AS ENUM ('EXTRACTED', 'NORMALIZED', 'SKIPPED_DUPLICATE', 'INVALID', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "TransactionDirection" AS ENUM ('EXPENSE', 'INCOME');

-- CreateEnum
CREATE TYPE "IngestionIssueSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "IngestionIssueType" AS ENUM ('DUPLICATE_FILE', 'PARSE_ERROR', 'MALFORMED_TRANSACTION', 'AMBIGUOUS_MERCHANT', 'DUPLICATE_TRANSACTION', 'UNSUPPORTED_FILE_TYPE', 'INTERNAL_ERROR');

-- CreateTable
CREATE TABLE "IngestionFile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "extension" TEXT,
    "sizeBytes" INTEGER NOT NULL,
    "sha256Hash" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "status" "FileProcessingStatus" NOT NULL DEFAULT 'UPLOADED',
    "queueJobId" TEXT,
    "processingAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processingStartedAt" TIMESTAMP(3),
    "processingFinishedAt" TIMESTAMP(3),
    "extractedTransactionsCount" INTEGER NOT NULL DEFAULT 0,
    "normalizedTransactionsCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateTransactionsCount" INTEGER NOT NULL DEFAULT 0,
    "invalidTransactionsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawExtractedTransaction" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceRowIndex" INTEGER,
    "rawDescription" TEXT,
    "rawAmountText" TEXT,
    "rawCurrencyText" TEXT,
    "rawDirectionText" TEXT,
    "rawDateText" TEXT,
    "rawPayload" JSONB,
    "status" "RawTransactionStatus" NOT NULL DEFAULT 'EXTRACTED',
    "parserConfidence" DOUBLE PRECISION,
    "skipReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RawExtractedTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rawExtractedTransactionId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "direction" "TransactionDirection" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "rawMerchantLabel" TEXT,
    "normalizedMerchantName" TEXT,
    "category" TEXT,
    "businessType" TEXT,
    "merchantConfidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantEnrichmentResult" (
    "id" TEXT NOT NULL,
    "rawExtractedTransactionId" TEXT NOT NULL,
    "normalizedMerchantName" TEXT,
    "likelyCategory" TEXT,
    "businessType" TEXT,
    "confidence" DOUBLE PRECISION,
    "ambiguityFlags" JSONB,
    "rawResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantEnrichmentResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionIssue" (
    "id" TEXT NOT NULL,
    "fileId" TEXT,
    "rawExtractedTransactionId" TEXT,
    "severity" "IngestionIssueSeverity" NOT NULL,
    "type" "IngestionIssueType" NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestionIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IngestionFile_userId_status_idx" ON "IngestionFile"("userId", "status");

-- CreateIndex
CREATE INDEX "IngestionFile_userId_sha256Hash_idx" ON "IngestionFile"("userId", "sha256Hash");

-- CreateIndex
CREATE INDEX "RawExtractedTransaction_fileId_idx" ON "RawExtractedTransaction"("fileId");

-- CreateIndex
CREATE INDEX "RawExtractedTransaction_userId_status_idx" ON "RawExtractedTransaction"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_rawExtractedTransactionId_key" ON "Transaction"("rawExtractedTransactionId");

-- CreateIndex
CREATE INDEX "Transaction_userId_occurredAt_idx" ON "Transaction"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "Transaction_userId_amount_occurredAt_idx" ON "Transaction"("userId", "amount", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantEnrichmentResult_rawExtractedTransactionId_key" ON "MerchantEnrichmentResult"("rawExtractedTransactionId");

-- CreateIndex
CREATE INDEX "IngestionIssue_fileId_idx" ON "IngestionIssue"("fileId");

-- CreateIndex
CREATE INDEX "IngestionIssue_rawExtractedTransactionId_idx" ON "IngestionIssue"("rawExtractedTransactionId");

-- AddForeignKey
ALTER TABLE "RawExtractedTransaction" ADD CONSTRAINT "RawExtractedTransaction_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "IngestionFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_rawExtractedTransactionId_fkey" FOREIGN KEY ("rawExtractedTransactionId") REFERENCES "RawExtractedTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantEnrichmentResult" ADD CONSTRAINT "MerchantEnrichmentResult_rawExtractedTransactionId_fkey" FOREIGN KEY ("rawExtractedTransactionId") REFERENCES "RawExtractedTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionIssue" ADD CONSTRAINT "IngestionIssue_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "IngestionFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionIssue" ADD CONSTRAINT "IngestionIssue_rawExtractedTransactionId_fkey" FOREIGN KEY ("rawExtractedTransactionId") REFERENCES "RawExtractedTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
