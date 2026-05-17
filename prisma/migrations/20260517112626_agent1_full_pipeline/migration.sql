-- CreateEnum
CREATE TYPE "TransactionCategoryStatus" AS ENUM ('NOT_ATTEMPTED', 'CATEGORIZED', 'UNCATEGORIZED');

-- CreateEnum
CREATE TYPE "ReviewItemStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ReviewItemType" AS ENUM ('UNCATEGORIZED_TRANSACTION');

-- CreateEnum
CREATE TYPE "RuleMatchType" AS ENUM ('EXACT', 'CONTAINS', 'REGEX');

-- CreateEnum
CREATE TYPE "MerchantCategoryRuleSource" AS ENUM ('USER_CORRECTION', 'SYSTEM_GLOBAL', 'MANUAL_ADMIN');

-- AlterEnum
ALTER TYPE "IngestionIssueType" ADD VALUE 'LOW_CONFIDENCE_CATEGORY';

-- AlterTable
ALTER TABLE "RawExtractedTransaction" ADD COLUMN     "fuzzyFingerprint" TEXT,
ADD COLUMN     "normalizedAmount" DECIMAL(14,2),
ADD COLUMN     "normalizedCurrency" TEXT,
ADD COLUMN     "normalizedDirection" "TransactionDirection",
ADD COLUMN     "normalizedMerchantCandidate" TEXT,
ADD COLUMN     "normalizedOccurredAt" TIMESTAMP(3),
ADD COLUMN     "sourceFingerprint" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "categoryStatus" "TransactionCategoryStatus" NOT NULL DEFAULT 'NOT_ATTEMPTED',
ADD COLUMN     "fuzzyFingerprint" TEXT,
ADD COLUMN     "sourceFingerprint" TEXT;

-- CreateTable
CREATE TABLE "ReviewItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rawExtractedTransactionId" TEXT,
    "transactionId" TEXT,
    "type" "ReviewItemType" NOT NULL,
    "status" "ReviewItemStatus" NOT NULL DEFAULT 'OPEN',
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantCategoryRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "rawPattern" TEXT NOT NULL,
    "matchType" "RuleMatchType" NOT NULL,
    "normalizedMerchantName" TEXT,
    "category" TEXT,
    "businessType" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "source" "MerchantCategoryRuleSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantCategoryRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewItem_userId_status_idx" ON "ReviewItem"("userId", "status");

-- CreateIndex
CREATE INDEX "ReviewItem_rawExtractedTransactionId_idx" ON "ReviewItem"("rawExtractedTransactionId");

-- CreateIndex
CREATE INDEX "ReviewItem_transactionId_idx" ON "ReviewItem"("transactionId");

-- CreateIndex
CREATE INDEX "MerchantCategoryRule_userId_idx" ON "MerchantCategoryRule"("userId");

-- CreateIndex
CREATE INDEX "MerchantCategoryRule_source_idx" ON "MerchantCategoryRule"("source");

-- CreateIndex
CREATE INDEX "Transaction_userId_sourceFingerprint_idx" ON "Transaction"("userId", "sourceFingerprint");

-- AddForeignKey
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_rawExtractedTransactionId_fkey" FOREIGN KEY ("rawExtractedTransactionId") REFERENCES "RawExtractedTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
