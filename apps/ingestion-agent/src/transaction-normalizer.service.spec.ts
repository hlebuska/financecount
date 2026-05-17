import { RawTransactionStatus, TransactionDirection } from '@prisma/client';
import { TransactionNormalizerService } from './transaction-normalizer.service';

describe('TransactionNormalizerService', () => {
  const service = new TransactionNormalizerService();

  it('normalizes a valid raw transaction into typed fields and fingerprints', () => {
    const result = service.normalize({
      id: 'raw-1',
      fileId: 'file-1',
      userId: 'user-1',
      sourceRowIndex: 1,
      rawDescription: 'Yandex Go Almaty',
      rawAmountText: '-1 250,50',
      rawCurrencyText: 'KZT',
      rawDirectionText: 'EXPENSE',
      rawDateText: '17.05.2026 14:20',
      normalizedAmount: null,
      normalizedCurrency: null,
      normalizedDirection: null,
      normalizedOccurredAt: null,
      normalizedMerchantCandidate: null,
      sourceFingerprint: null,
      fuzzyFingerprint: null,
      rawPayload: {
        reference: 'abc-123',
      },
      status: RawTransactionStatus.EXTRACTED,
      parserConfidence: 0.91,
      skipReason: null,
      createdAt: new Date('2026-05-17T00:00:00.000Z'),
      updatedAt: new Date('2026-05-17T00:00:00.000Z'),
    });

    expect(result.reason).toBeNull();
    expect(result.data).toMatchObject({
      amount: '1250.50',
      currency: 'KZT',
      direction: TransactionDirection.EXPENSE,
      merchantCandidate: 'YANDEX GO ALMATY',
    });
    expect(result.data?.occurredAt).toEqual(new Date(2026, 4, 17, 14, 20, 0));
    expect(result.data?.sourceFingerprint).toHaveLength(64);
    expect(result.data?.fuzzyFingerprint).toHaveLength(64);
  });

  it('marks rows invalid when required fields cannot be parsed', () => {
    const result = service.normalize({
      id: 'raw-2',
      fileId: 'file-1',
      userId: 'user-1',
      sourceRowIndex: 2,
      rawDescription: 'Kaspi QR',
      rawAmountText: null,
      rawCurrencyText: 'KZT',
      rawDirectionText: 'EXPENSE',
      rawDateText: '17.05.2026',
      normalizedAmount: null,
      normalizedCurrency: null,
      normalizedDirection: null,
      normalizedOccurredAt: null,
      normalizedMerchantCandidate: null,
      sourceFingerprint: null,
      fuzzyFingerprint: null,
      rawPayload: null,
      status: RawTransactionStatus.EXTRACTED,
      parserConfidence: null,
      skipReason: null,
      createdAt: new Date('2026-05-17T00:00:00.000Z'),
      updatedAt: new Date('2026-05-17T00:00:00.000Z'),
    });

    expect(result.data).toBeNull();
    expect(result.reason).toBe('Amount could not be parsed.');
  });
});
