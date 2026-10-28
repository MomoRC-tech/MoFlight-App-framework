# E1 financial source grammar proof

Tracking: [#101](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/101), [source/money contract and frozen E2 oracle](../../docs/development/expense-analysis-implementation-plan.md#e1-source-and-money-contract--28-october-2026).

The [provider-boundary parser](../../apps/platform-lab/src/vereinsflieger/expense-money-observation.ts) is isolated from the ordinary app. It demonstrates exact bounded German-format EUR minor-unit parsing and source calendar-date validation against [independent synthetic expectations](../../tests/mobile/fixtures/expense-money-cases.ts). It preserves missing/invalid/unsupported states; it does not determine liability, classify movements, reconcile sources or aggregate expenses. No source navigation, storage, backup or UI behavior changes. Keeping the module at the existing provider boundary includes it in the normal TypeScript/lint gates without a new package/dependency.

```powershell
node --import tsx --test tests/mobile/expense-source-contract.test.ts
pnpm typecheck
```

Production source mapping remains open. A positive movement is not automatically a refund; balances and flight/invoice representations must never be summed as charges. E2 may reuse the parser after the needed source contract is evidenced, with checked arithmetic and preserved raw observations. Parser success does not establish financial, live-provider or native acceptance.
