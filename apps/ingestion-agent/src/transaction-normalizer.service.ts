import { Injectable } from '@nestjs/common';
import { RawExtractedTransaction, TransactionDirection } from '@prisma/client';
import { createHash } from 'node:crypto';
import { NormalizedTransactionData } from './ingestion.types';

const CURRENCY_ALIASES: Record<string, string> = {
  KZT: 'KZT',
  KGS: 'KGS',
  USD: 'USD',
  EUR: 'EUR',
  RUB: 'RUB',
  TEN: 'KZT',
  TENGE: 'KZT',
  '₸': 'KZT',
  '$': 'USD',
  '€': 'EUR',
  '₽': 'RUB',
};

const GENERIC_MERCHANT_DESCRIPTORS = new Set([
  'ПОКУПКА',
  'ПОПОЛНЕНИЕ',
  'ОПЛАТА',
  'ПЕРЕВОД',
  'СНЯТИЕ',
  'ВОЗВРАТ',
  'СПИСАНИЕ',
  'ЗАЧИСЛЕНИЕ',
  'PURCHASE',
  'TOP UP',
  'TOP-UP',
  'PAYMENT',
  'TRANSFER',
  'WITHDRAWAL',
  'REFUND',
]);

@Injectable()
export class TransactionNormalizerService {
  normalize(rawTransaction: RawExtractedTransaction): {
    data: NormalizedTransactionData | null;
    reason: string | null;
  } {
    const amount = this.parseAmount(rawTransaction.rawAmountText);

    if (amount === null) {
      return { data: null, reason: 'Amount could not be parsed.' };
    }

    const currency = this.parseCurrency(rawTransaction.rawCurrencyText);

    if (!currency) {
      return { data: null, reason: 'Currency could not be parsed.' };
    }

    const direction = this.parseDirection(
      rawTransaction.rawDirectionText,
      rawTransaction.rawAmountText,
    );

    if (!direction) {
      return { data: null, reason: 'Direction could not be parsed.' };
    }

    const occurredAt = this.parseOccurredAt(rawTransaction.rawDateText);

    if (!occurredAt) {
      return { data: null, reason: 'Date could not be parsed.' };
    }

    const merchantCandidate = this.normalizeMerchantCandidate(
      rawTransaction.rawDescription,
      rawTransaction.rawPayload,
    );

    const sourceFingerprint = this.buildFingerprint({
      occurredAt,
      amount,
      direction,
      merchantCandidate,
      rawPayload: rawTransaction.rawPayload,
      precise: true,
    });
    const fuzzyFingerprint = this.buildFingerprint({
      occurredAt,
      amount,
      direction,
      merchantCandidate,
      rawPayload: rawTransaction.rawPayload,
      precise: false,
    });

    return {
      data: {
        amount: amount.toFixed(2),
        currency,
        direction,
        occurredAt,
        merchantCandidate,
        sourceFingerprint,
        fuzzyFingerprint,
      },
      reason: null,
    };
  }

  private parseAmount(rawAmountText: string | null): number | null {
    if (!rawAmountText) {
      return null;
    }

    const sanitized = rawAmountText
      .replace(/\s+/g, '')
      .replace(/[^\d,.-]/g, '')
      .replace(/,(?=\d{1,2}$)/, '.');
    const normalized = sanitized.replace(/,/g, '');
    const parsed = Number.parseFloat(normalized);

    if (!Number.isFinite(parsed)) {
      return null;
    }

    return Math.abs(parsed);
  }

  private parseCurrency(rawCurrencyText: string | null): string | null {
    if (!rawCurrencyText) {
      return null;
    }

    const compact = rawCurrencyText.replace(/\s+/g, '').toUpperCase();

    return CURRENCY_ALIASES[compact] ?? CURRENCY_ALIASES[rawCurrencyText.toUpperCase()] ?? null;
  }

  private parseDirection(
    rawDirectionText: string | null,
    rawAmountText: string | null,
  ): TransactionDirection | null {
    if (rawDirectionText === TransactionDirection.EXPENSE) {
      return TransactionDirection.EXPENSE;
    }

    if (rawDirectionText === TransactionDirection.INCOME) {
      return TransactionDirection.INCOME;
    }

    if (rawAmountText?.includes('-')) {
      return TransactionDirection.EXPENSE;
    }

    return null;
  }

  private parseOccurredAt(rawDateText: string | null): Date | null {
    if (!rawDateText) {
      return null;
    }

    const direct = new Date(rawDateText);

    if (!Number.isNaN(direct.getTime())) {
      return direct;
    }

    const match = rawDateText.match(
      /(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:\D+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
    );

    if (!match) {
      return null;
    }

    const [, dayText, monthText, yearText, hourText, minuteText, secondText] = match;
    const year = yearText.length === 2 ? Number(`20${yearText}`) : Number(yearText);
    const month = Number(monthText) - 1;
    const day = Number(dayText);
    const hour = Number(hourText ?? '0');
    const minute = Number(minuteText ?? '0');
    const second = Number(secondText ?? '0');
    const parsed = new Date(year, month, day, hour, minute, second);

    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed;
  }

  private normalizeMerchantCandidate(
    rawDescription: string | null,
    rawPayload: unknown,
  ): string | null {
    const candidates = [
      this.normalizeTextCandidate(rawDescription),
      this.extractPayloadText(rawPayload, 'details'),
      this.extractPayloadText(rawPayload, 'operationType'),
      this.extractPayloadText(rawPayload, 'reference'),
    ].filter((value): value is string => Boolean(value));

    for (const candidate of candidates) {
      if (!this.isGenericMerchantDescriptor(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private buildFingerprint(params: {
    occurredAt: Date;
    amount: number;
    direction: TransactionDirection;
    merchantCandidate: string | null;
    rawPayload: unknown;
    precise: boolean;
  }): string {
    const base = {
      occurredAt: params.precise
        ? params.occurredAt.toISOString()
        : params.occurredAt.toISOString().slice(0, 10),
      amount: params.amount.toFixed(2),
      direction: params.direction,
      merchantCandidate: params.merchantCandidate ?? null,
      reference: this.extractPayloadField(params.rawPayload, 'reference'),
      account: this.extractPayloadField(params.rawPayload, 'account'),
      operationType: this.extractPayloadField(params.rawPayload, 'operationType'),
    };

    return createHash('sha256').update(JSON.stringify(base)).digest('hex');
  }

  private extractPayloadField(rawPayload: unknown, key: string): string | null {
    if (!rawPayload || typeof rawPayload !== 'object' || !(key in rawPayload)) {
      return null;
    }

    const value = (rawPayload as Record<string, unknown>)[key];

    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private extractPayloadText(rawPayload: unknown, key: string) {
    const value = this.extractPayloadField(rawPayload, key);

    return this.normalizeTextCandidate(value);
  }

  private normalizeTextCandidate(value: string | null | undefined) {
    if (!value?.trim()) {
      return null;
    }

    return value.trim().replace(/\s+/g, ' ').toUpperCase();
  }

  private isGenericMerchantDescriptor(value: string) {
    const normalized = value.replace(/[.,;:!?()"']/g, '').trim();

    return GENERIC_MERCHANT_DESCRIPTORS.has(normalized);
  }
}
