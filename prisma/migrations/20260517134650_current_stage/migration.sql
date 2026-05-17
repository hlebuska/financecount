-- CreateEnum
CREATE TYPE "IngestionFileStage" AS ENUM ('UPLOADING', 'QUEUED', 'PARSING_FILE', 'STRUCTURING_TRANSACTIONS', 'PROCESSING_TRANSACTIONS', 'CATEGORIZING_TRANSACTIONS', 'FINALIZING_FILE', 'COMPLETED', 'FAILED', 'DUPLICATE_FILE');

-- AlterTable
ALTER TABLE "IngestionFile" ADD COLUMN     "currentRowIndex" INTEGER,
ADD COLUMN     "currentStage" "IngestionFileStage" NOT NULL DEFAULT 'UPLOADING',
ADD COLUMN     "currentStageMessage" TEXT,
ADD COLUMN     "processedRows" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "progressPercent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalRows" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "IngestionFileProcessingEvent" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "stage" "IngestionFileStage" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestionFileProcessingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IngestionFileProcessingEvent_fileId_createdAt_idx" ON "IngestionFileProcessingEvent"("fileId", "createdAt");

-- AddForeignKey
ALTER TABLE "IngestionFileProcessingEvent" ADD CONSTRAINT "IngestionFileProcessingEvent_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "IngestionFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
