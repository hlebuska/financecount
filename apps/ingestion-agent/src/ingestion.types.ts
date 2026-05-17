import { TransactionDirection, TransactionCategoryStatus } from '@prisma/client';

export interface NormalizedTransactionData {
  amount: string;
  currency: string;
  direction: TransactionDirection;
  occurredAt: Date;
  merchantCandidate: string | null;
  sourceFingerprint: string;
  fuzzyFingerprint: string;
}

export interface CategorizationResult {
  normalizedMerchantName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  businessType: string | null;
  confidence: number;
  categoryStatus: TransactionCategoryStatus;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  duplicateType: 'exact' | 'fuzzy' | null;
}
