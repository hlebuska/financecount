import { RawTransactionStatus, TransactionDirection } from '@prisma/client';
import { TransactionNormalizerService } from './transaction-normalizer.service';

describe('TransactionNormalizerService', () => {
  const service = new TransactionNormalizerService();

  describe('positive scenarios', () => {
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

    it('uses payload details when raw description is only a generic transaction descriptor', () => {
      const result = service.normalize({
        id: 'raw-3',
        fileId: 'file-1',
        userId: 'user-1',
        sourceRowIndex: 3,
        rawDescription: 'ПОКУПКА',
        rawAmountText: '-500',
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
          details: 'Magnum Cash&Carry Almaty',
        },
        status: RawTransactionStatus.EXTRACTED,
        parserConfidence: 0.91,
        skipReason: null,
        createdAt: new Date('2026-05-17T00:00:00.000Z'),
        updatedAt: new Date('2026-05-17T00:00:00.000Z'),
      });

      expect(result.reason).toBeNull();
      expect(result.data?.merchantCandidate).toBe('MAGNUM CASH&CARRY ALMATY');
    });
  });

  describe('negative scenarios', () => {
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

    it('rejects rows when direction cannot be inferred from either field or sign', () => {
      const result = service.normalize({
        id: 'raw-direction-missing',
        fileId: 'file-1',
        userId: 'user-1',
        sourceRowIndex: 2,
        rawDescription: 'Incoming transfer',
        rawAmountText: '500',
        rawCurrencyText: 'KZT',
        rawDirectionText: null,
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
      expect(result.reason).toBe('Direction could not be parsed.');
    });
  });

  describe('adversarial scenarios', () => {
    it('parses currency aliases with punctuation, separators, and Cyrillic names', () => {
      const baseTransaction = {
        fileId: 'file-1',
        userId: 'user-1',
        sourceRowIndex: 4,
        rawDescription: 'Test merchant',
        rawAmountText: '-100',
        rawDirectionText: 'EXPENSE',
        rawDateText: '17.05.2026 14:20',
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
      };

      expect(
        service.normalize({
          ...baseTransaction,
          id: 'raw-kzt',
          rawCurrencyText: 'KZT/₸',
        }).data?.currency,
      ).toBe('KZT');

      expect(
        service.normalize({
          ...baseTransaction,
          id: 'raw-rub',
          rawCurrencyText: 'руб.',
        }).data?.currency,
      ).toBe('RUB');

      expect(
        service.normalize({
          ...baseTransaction,
          id: 'raw-kgs',
          rawCurrencyText: 'сом',
        }).data?.currency,
      ).toBe('KGS');
    });

    it('avoids using generic payload text as the merchant candidate when all extracted values are generic', () => {
      const result = service.normalize({
        id: 'raw-generic-only',
        fileId: 'file-1',
        userId: 'user-1',
        sourceRowIndex: 5,
        rawDescription: 'ПОКУПКА',
        rawAmountText: '-900',
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
          details: 'PAYMENT',
          operationType: 'TRANSFER',
          reference: 'TOP UP',
        },
        status: RawTransactionStatus.EXTRACTED,
        parserConfidence: 0.3,
        skipReason: null,
        createdAt: new Date('2026-05-17T00:00:00.000Z'),
        updatedAt: new Date('2026-05-17T00:00:00.000Z'),
      });

      expect(result.reason).toBeNull();
      expect(result.data?.merchantCandidate).toBeNull();
    });
  });
});
