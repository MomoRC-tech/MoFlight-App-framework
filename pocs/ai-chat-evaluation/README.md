# AI chat evaluation scorer

This preparation package scores a bounded structured observation against the frozen synthetic cases in `tests/mobile/fixtures/ai-chat-cases.ts`. It performs no model calls and has no runtime dependencies.

`scoreAiObservation` accepts a fixture `caseId`, expected status, supplied flight references, and optional structured metrics, findings, and navigation or rejected-reference fields. It checks status, owner-scoped source references, action targets, rejected foreign references, period labels and windows, counts, known minutes, averages, unknown-duration references, coverage, and anomaly finding kinds and flight-reference sets. It rejects unknown fields, unbounded collections, and malformed values. Case variants can be selected by their own IDs.

The scorer deliberately ignores `requiredClaims`, `forbiddenClaims`, classification prose, answer wording, language matching, and `answerKind`. A structurally passing score is not a model-quality result; `semanticReview` is always `required`, and the returned `gatesNotCovered` field names the main limits.

Run the deterministic scorer tests with:

```powershell
node --import tsx --test tests/mobile/ai-evaluation.test.ts
```

Actual model evaluation remains a separate, unperformed step. It requires explicit approval of funding and the permitted input scope before any model run. This scorer includes no default benchmark observations, measured cost claims, credentials, or network access. Synthetic fixture checks do not establish live accuracy, provider behavior, privacy, cost, native acceptance, or release readiness.
