# E1 financial source grammar proof

Tracking: [#101](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/101), [source/money contract and frozen E2 oracle](../../docs/development/expense-analysis-implementation-plan.md#e1-source-and-money-contract--28-october-2026).

The [provider-boundary parser](../../apps/platform-lab/src/vereinsflieger/expense-money-observation.ts) is isolated from the ordinary app. It demonstrates exact bounded German-format EUR minor-unit parsing and source calendar-date validation against [independent synthetic expectations](../../tests/mobile/fixtures/expense-money-cases.ts). It preserves missing/invalid/unsupported states; it does not determine liability, classify movements, reconcile sources or aggregate expenses. No source navigation, storage, backup or UI behavior changes. Keeping the module at the existing provider boundary includes it in the normal TypeScript/lint gates without a new package/dependency.

```powershell
node --import tsx --test tests/mobile/expense-source-contract.test.ts
node --import tsx --test tests/mobile/expense-ledger-observation.test.ts
node --import tsx --test tests/mobile/expense-projection.test.ts
pnpm typecheck
```

Production source mapping remains open. A positive movement is not automatically a refund; balances and flight/invoice representations must never be summed as charges. E2 may reuse the parser after the needed source contract is evidenced, with checked arithmetic and preserved raw observations. Parser success does not establish financial, live-provider or native acceptance.

The authenticated 28 October continuation exposes two own ledger accounts with repeated booking numbers and a split invoice. The isolated [observation validator](../../apps/platform-lab/src/vereinsflieger/expense-ledger-observation.ts) retains exact account-selector/navigation/heading and owner/store/context boundaries; [30 synthetic checks](../../tests/mobile/expense-ledger-observation.test.ts) exercise foreign/late/changed-source and legacy-capture refusal. Matching footer counts retain unverified period coverage. This raw-observation proof has no app source collector, save path, archive extension or kind classification.

The independent [E2 projector](../../apps/platform-lab/src/expenses/expense-projection.ts) now computes from explicitly interpreted synthetic facts: monthly full prices, annual allowance reconciliation, exact evidence/revisions and aircraft/unallocated values. Its [43 tests](../../tests/mobile/expense-projection.test.ts) extend the package to 131 focused passes. No raw provider mapping or ordinary app wiring exists; actual source proof and financial preservation remain separate gates. The [package report](../../docs/verification/2026-10-28-expense-source-contract.md#e2-pure-projection-core--28-october-2026) retains initial transient failures and the final coordinated 5/5 host result, without claiming native expense acceptance.
