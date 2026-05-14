export const FILE_INGESTION_QUEUE = 'file-ingestion';

export const PROCESS_INGESTION_FILE_JOB = 'process-ingestion-file';

export interface ProcessIngestionFileJobPayload {
  fileId: string;
}