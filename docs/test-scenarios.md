# Test Scenarios

This document groups the project test coverage into positive, negative, and adversarial scenarios for capstone review.

## Purpose

The goal of this suite is to show that the system does more than work on happy paths. It also rejects malformed input, degrades safely when confidence is low, and resists misleading or low-quality upstream data.

## Positive Scenarios

These scenarios verify expected business behavior when inputs are valid and dependencies behave normally.

### Transaction normalization

- Valid raw transaction rows are normalized into typed fields and fingerprints.
- Merchant candidates are extracted from useful payload details when the raw description is generic.

Implemented in:

- `apps/ingestion-agent/src/transaction-normalizer.service.spec.ts`

### Transaction categorization

- Categorization memory is preferred when a strong historical match exists.
- Stale memory references are ignored and the service falls through to merchant enrichment.
- Confident enrichment results map transactions into existing categories.

Implemented in:

- `apps/ingestion-agent/src/transaction-categorizer.service.spec.ts`

### Review resolution

- Resolving an existing review item updates its status, writes categorization memory, and schedules analytics refresh.
- Manually categorizing a transaction without a prior review item creates a resolved review record and schedules analytics refresh.

Implemented in:

- `apps/fincount/src/review-resolution/review-resolution.service.spec.ts`

### Ingestion file upload handling

- Valid PDF uploads are stored, hashed, and queued for downstream processing.
- Re-uploading the same file is allowed and creates a fresh queued ingestion record instead of failing as a duplicate.

Implemented in:

- `apps/fincount/src/ingestion-files/ingestion-files.service.spec.ts`

## Negative Scenarios

These scenarios verify that the system rejects incomplete or invalid input instead of silently producing bad data.

### Transaction normalization failures

- Rows with missing or unparsable amounts are rejected.
- Rows with no reliable direction hint are rejected.

Implemented in:

- `apps/ingestion-agent/src/transaction-normalizer.service.spec.ts`

### Categorization fallback behavior

- Transactions remain uncategorized when neither memory nor enrichment produces a confident allowed category.

Implemented in:

- `apps/ingestion-agent/src/transaction-categorizer.service.spec.ts`

### Review resolution failures

- The service throws if a transaction cannot be reloaded after a resolution attempt.
- Follow-up memory and analysis refresh steps are not triggered after that failure.

Implemented in:

- `apps/fincount/src/review-resolution/review-resolution.service.spec.ts`

### Ingestion file validation failures

- Non-PDF uploads are rejected before they are stored or queued.

Implemented in:

- `apps/fincount/src/ingestion-files/ingestion-files.service.spec.ts`

## Adversarial Scenarios

These scenarios model messy, misleading, or unsafe input patterns that could trick the system into poor decisions.

### Ambiguous and noisy financial input

- Currency aliases with punctuation, separators, and Cyrillic labels are normalized safely.
- Generic merchant descriptors such as `PAYMENT`, `TRANSFER`, or `ПОКУПКА` are not incorrectly treated as trustworthy merchant identities.

Implemented in:

- `apps/ingestion-agent/src/transaction-normalizer.service.spec.ts`

### Unsafe categorization suggestions

- Transactions stay uncategorized when enrichment suggests a category outside the existing allowed category set.
- Enrichment persistence is skipped when there is no merchant candidate worth enriching.

Implemented in:

- `apps/ingestion-agent/src/transaction-categorizer.service.spec.ts`

### State-transition edge cases

- Review resolution keeps the explicit `review_resolution` reason path when resolving a review-backed category change.

Implemented in:

- `apps/fincount/src/review-resolution/review-resolution.service.spec.ts`

## How To Run

Run the full backend test suite:

```bash
npm run test
```

Run the targeted scenario-based specs:

```bash
npm test -- --runInBand apps/ingestion-agent/src/transaction-normalizer.service.spec.ts apps/ingestion-agent/src/transaction-categorizer.service.spec.ts apps/fincount/src/review-resolution/review-resolution.service.spec.ts apps/fincount/src/ingestion-files/ingestion-files.service.spec.ts
```

## Notes For Review Committee

- The current scenario taxonomy is strongest in the ingestion and review-resolution paths because those are the most risk-sensitive parts of the system.
- The repository also contains controller and e2e tests, but the scenarios in this document focus on core business logic where data quality and safe fallbacks matter most.
- This structure is intended to make Phase 4 explicit: expected behavior, invalid behavior, and adversarial behavior are tested separately rather than mixed together.
