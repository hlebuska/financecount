import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { z } from 'zod';

const structuredTransactionSchema = z.object({
  sourceRowIndex: z.number().int().positive().nullable().optional(),
  rawDescription: z.string().nullable().optional(),
  rawAmountText: z.string().nullable().optional(),
  rawCurrencyText: z.string().nullable().optional(),
  rawDirectionText: z.enum(['INCOME', 'EXPENSE']).nullable().optional(),
  rawDateText: z.string().nullable().optional(),
  rawPayload: z
    .object({
      sourceTextExcerpt: z.string().nullable().optional(),
      account: z.string().nullable().optional(),
      operationType: z.string().nullable().optional(),
      details: z.string().nullable().optional(),
      reference: z.string().nullable().optional(),
      confidence: z.number().min(0).max(1).nullable().optional(),
    })
    .nullable()
    .optional(),
});

const structureResponseSchema = z.object({
  transactions: z.array(structuredTransactionSchema),
});

export type StructuredTransaction = z.infer<typeof structuredTransactionSchema>;

function getConfiguredModel() {
  const model = process.env.CHAT_MODEL;

  if (!model || model === 'your_chat_model_here') {
    return 'gpt-4o-mini';
  }

  return model;
}

@Injectable()
export class TransactionStructurerService {
  private readonly openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY ?? process.env.LLM_API_KEY,
  });

  private readonly model = getConfiguredModel();

  async structure(parserOutputText: string): Promise<StructuredTransaction[]> {
    const response = await this.openai.responses.create({
      model: this.model,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: [
                'Extract bank statement transactions from parser output.',
                'Return strict JSON only using the provided schema.',
                'Do not include summary rows, balance rows, section headings, or table headers.',
                'Only extract posted account transactions from sections like "Транзакции по счету".',
                'Do not extract pending or in-processing transactions from sections like "Сумма в обработке", "Сумма в обработке по счету", or similar pending/processing blocks.',
                'Use raw text values exactly as shown in the source when possible.',
                'Set rawDescription to the human-readable operation or merchant name for the transaction.',
                'Do not use authorization codes, reference numbers, account numbers, or other opaque identifiers as rawDescription.',
                'If a row contains both an operation name and a reference or authorization code, keep the operation name in rawDescription and put the code in rawPayload.reference.',
                'Set rawDirectionText to INCOME when money enters the account and EXPENSE when money leaves the account.',
                'Put the source table row, account, operation type, details, and any references in rawPayload.',
              ].join(' '),
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: parserOutputText,
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'structured_transactions',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              transactions: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    sourceRowIndex: {
                      type: ['integer', 'null'],
                      description: 'Approximate source row number if available.',
                    },
                    rawDescription: {
                      type: ['string', 'null'],
                      description:
                        'Raw human-readable merchant, counterparty, or operation name. Do not put authorization or reference codes here.',
                    },
                    rawAmountText: {
                      type: ['string', 'null'],
                      description: 'Raw transaction amount text.',
                    },
                    rawCurrencyText: {
                      type: ['string', 'null'],
                      description: 'Raw currency code or text.',
                    },
                    rawDirectionText: {
                      type: ['string', 'null'],
                      enum: ['INCOME', 'EXPENSE', null],
                    },
                    rawDateText: {
                      type: ['string', 'null'],
                      description: 'Raw date and time text.',
                    },
                    rawPayload: {
                      type: ['object', 'null'],
                      additionalProperties: false,
                      properties: {
                        sourceTextExcerpt: {
                          type: ['string', 'null'],
                          description: 'Short exact source excerpt used for this transaction.',
                        },
                        account: {
                          type: ['string', 'null'],
                          description: 'Source account identifier if visible.',
                        },
                        operationType: {
                          type: ['string', 'null'],
                          description: 'Raw operation type, for example purchase or top-up.',
                        },
                        details: {
                          type: ['string', 'null'],
                          description: 'Additional raw details from the source row.',
                        },
                        reference: {
                          type: ['string', 'null'],
                          description: 'Reference or authorization code if present.',
                        },
                        confidence: {
                          type: ['number', 'null'],
                          description: 'Extraction confidence from 0 to 1.',
                        },
                      },
                      required: [
                        'sourceTextExcerpt',
                        'account',
                        'operationType',
                        'details',
                        'reference',
                        'confidence',
                      ],
                    },
                  },
                  required: [
                    'sourceRowIndex',
                    'rawDescription',
                    'rawAmountText',
                    'rawCurrencyText',
                    'rawDirectionText',
                    'rawDateText',
                    'rawPayload',
                  ],
                },
              },
            },
            required: ['transactions'],
          },
        },
      },
    });

    const parsed = structureResponseSchema.parse(JSON.parse(response.output_text));

    return parsed.transactions;
  }
}
