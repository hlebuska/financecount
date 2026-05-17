export const FILE_INGESTION_QUEUE = 'file-ingestion';
export const ANALYSIS_REFRESH_QUEUE = 'analysis-refresh';

export const PROCESS_INGESTION_FILE_JOB = 'process-ingestion-file';
export const PROCESS_ANALYSIS_REFRESH_JOB = 'process-analysis-refresh';

export interface ProcessIngestionFileJobPayload {
  fileId: string;
}

export interface ProcessAnalysisRefreshJobPayload {
  userId: string;
}
