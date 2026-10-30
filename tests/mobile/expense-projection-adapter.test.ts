import assert from 'node:assert/strict';
import test from 'node:test';
import { canonical } from '../../packages/flight-logbook/src/index.ts';
import { projectCapturedFinancialArchive, type CapturedExpenseProjectionPorts, type DurableInvoiceBookingEvidence } from '../../apps/platform-lab/src/vereinsflieger/expense-projection-adapter.ts';
import { FinancialObservationStore, validateFinancialObservationBackup, type FinancialObservationReceipt } from '../../apps/platform-lab/src/vereinsflieger/expense-observation-store.ts';
import type { FinancialLedgerObservation } from '../../apps/platform-lab/src/vereinsflieger/expense-ledger-observation.ts';
import { financialAt, financialHash, financialObservation, financialTarget } from './fixtures/expense-capture.ts';
import { nodeDriver } from './sqlite-driver.ts';

const month = { mode: 'month', year: 2026, month: 6 } as const;
const invoiceUrl = 'https://vereinsflieger.de/member/profile/printuserinvoice.php?uiid=99999';
function billed() {
  const value = financialObservation();
  value.source.lines.forEach((line, index) => { line.descriptionRaw = `500000001 - Synthetic invoice - Fee ${index}`; line.amountRaw = index ? '40,00 EUR' : '60,00 EUR'; });
  value.source.statedTotalRaw = '100,00 EUR'; return value;
}
function ledger(selector: string): FinancialLedgerObservation {
  const label = `Synthetic account ${selector}`, url = `https://vereinsflieger.de/member/profile/account.php?caid=${selector}`;
  return { version: 1, ...structuredClone(financialTarget), contextBefore: structuredClone(financialTarget.scope.context), contextAfter: structuredClone(financialTarget.scope.context),
    sourceAccount: { selector, label }, ownNavigation: { label, url }, sourceUrl: url, pageAccountLabel: label, reportedRowCount: 1,
    capture: { version: 1, id: 'same-capture-number', retrievedAt: financialAt, owner: financialTarget.scope.owner, connectionId: financialTarget.scope.connectionId,
      category: 'ledger', path: '/member/profile/account.php', sourceIdentity: 'provisional-observed-profile',
      columns: [{ key: 'date', label: 'Datum', index: 0 }, { key: 'booking', label: 'BuchungsNr.', index: 1 },
        { key: 'invoice', label: 'Abrechnung', index: 2 }, { key: 'information', label: 'Informationen', index: 3 },
        { key: 'value', label: 'Wert (EUR)', index: 4 }, { key: 'balance', label: 'Saldo (EUR)', index: 5 }],
      rows: [{ position: 0, values: ['01.06.2026', 'same-booking', '500000001', 'Synthetic movement', selector === '101' ? '-60,00' : '-40,00', '0,00'] }],
      filters: ['Jahr 2026'], empty: false, coverage: { kind: 'visible-page', pagination: 'unverified', truncated: false } } };
}
function proof(receipt: FinancialObservationReceipt): DurableInvoiceBookingEvidence {
  return { version: 1, target: structuredClone(financialTarget), billedReceiptId: receipt.id, billedChecksum: receipt.checksum,
    sourceFlightRef: billed().source.sourceFlightId,
    summary: { evidenceRef: 'summary-receipt', sourceUrl: 'https://vereinsflieger.de/member/profile/userinvoice.php',
      rows: [{ position: 0, numberRaw: '500000001', recipientRaw: billed().ownRecipientLabel, url: invoiceUrl, dateRaw: '02.06.2026', amountRaw: '999,00' }],
      coverage: { kind: 'visible-page', pagination: 'unverified', truncated: false } },
    ledgers: ['101', '202'].map(selector => ({ evidenceRef: `ledger-${selector}`, observation: ledger(selector), invoiceLinks: [{ rowPosition: 0, url: invoiceUrl }] })) };
}
async function fixture(observations = [billed()]) {
  const db = nodeDriver(':memory:'), store = new FinancialObservationStore(db, financialTarget, financialHash, async () => {});
  await store.initialize(true);
  const receipts: FinancialObservationReceipt[] = [];
  for (const [index, value] of observations.entries()) receipts.push(await store.save(`billed-${index}`, 'billed-flight', value));
  const archive = await store.exportBackup();
  return { db, store, receipts, archive };
}
function ports(evidence: DurableInvoiceBookingEvidence[]): CapturedExpenseProjectionPorts {
  return { gate: async target => { assert.deepEqual(target, financialTarget); }, hash: financialHash, readInvoiceBookingEvidence: async () => evidence };
}

test('real host SQLite archive plus synthetic trusted links yields full billed price once, with null revisions', async () => {
  const f = await fixture();
  try {
    const result = await projectCapturedFinancialArchive(f.archive, financialTarget, month, ports(f.receipts.map(proof)));
    assert.deepEqual(result.flying, { knownMinor: 10000, totalMinor: null });
    assert.equal(result.contributions[0]!.bookingDate, '2026-06-01');
    assert.equal(result.contributions[0]!.revision, null);
    assert.equal(result.contributions[0]!.coveredMinor, null);
    assert.deepEqual(result.contributions[0]!.evidenceRefs, ['bill:billed-0', 'ledger:ledger-101/row/0', 'ledger:ledger-202/row/0', 'summary:summary-receipt']);
    assert.equal(result.aircraft[0]!.aircraftRef, 'D-TEST');
    assert.equal(result.usageAndClub.knownMinor, null);
    assert.equal(await f.store.exportBackup(), f.archive);
    const year = await projectCapturedFinancialArchive(f.archive, financialTarget, { mode: 'year', year: 2026 }, ports(f.receipts.map(proof)));
    assert.ok(Object.values(year.annual!).every(value => value.knownMinor === null && value.totalMinor === null));
  } finally { await f.db.close(); }
});

test('duplicate observations retain both billed receipts and supporting evidence without a second cost', async () => {
  const f = await fixture([billed(), billed()]);
  try {
    const result = await projectCapturedFinancialArchive(f.archive, financialTarget, month, ports(f.receipts.map(proof)));
    assert.equal(result.flying.knownMinor, 10000); assert.equal(result.contributions.length, 1);
    assert.ok(result.contributions[0]!.evidenceRefs.includes('bill:billed-1'));
  } finally { await f.db.close(); }
});

test('raw stored ledger/payment/balance representations add no flying expense', async () => {
  const f = await fixture();
  try {
    await f.store.save('member-raw', 'ledger', ledger('101'));
    const payment = ledger('202'); payment.capture.rows[0]!.values[2] = ''; payment.capture.rows[0]!.values[4] = '100,00';
    await f.store.save('payment-raw', 'ledger', payment);
    const archive = await f.store.exportBackup(), p = ports(f.receipts.map(proof));
    p.readInvoiceBookingEvidence = async (_target, receipts) => { assert.equal(receipts.length, 1); return receipts.map(proof); };
    const result = await projectCapturedFinancialArchive(archive, financialTarget, month, p);
    assert.equal(result.flying.knownMinor, 10000); assert.equal(result.contributions.length, 1);
    assert.equal(await f.store.exportBackup(), archive);
  } finally { await f.db.close(); }
});

test('all bounded matching rows remain distinct despite reused account/capture strings', async () => {
  const f = await fixture();
  try {
    const evidence = proof(f.receipts[0]!);
    evidence.ledgers = Array.from({ length: 20 }, (_, capture) => {
      const observation = ledger('101');
      observation.capture.rows = Array.from({ length: 20 }, (_, position) => ({ position, values: [...observation.capture.rows[0]!.values] }));
      observation.reportedRowCount = 20;
      return { evidenceRef: `ledger-${capture}`, observation, invoiceLinks: Array.from({ length: 20 }, (_, rowPosition) => ({ rowPosition, url: invoiceUrl })) };
    });
    const result = await projectCapturedFinancialArchive(f.archive, financialTarget, month, ports([evidence]));
    assert.equal(result.flying.knownMinor, 10000);
    assert.equal(result.contributions[0]!.evidenceRefs.length, 402);
  } finally { await f.db.close(); }
});

test('changed raw wording blocks a subtotal even when dates and monetary values still agree', async () => {
  const changed = billed(); changed.source.lines[0]!.descriptionRaw += ' changed';
  const f = await fixture([billed(), changed]);
  try {
    const result = await projectCapturedFinancialArchive(f.archive, financialTarget, month, ports(f.receipts.map(proof)));
    assert.equal(result.state, 'conflict'); assert.equal(result.flying.knownMinor, null);
    assert.ok(result.issues.some(issue => issue.code === 'source-variant-conflict'));
    assert.equal(await f.store.exportBackup(), f.archive);
  } finally { await f.db.close(); }
});

test('a missing durable proof cannot borrow another receipt proof or a text-only date candidate', async () => {
  const f = await fixture([billed(), billed()]);
  try {
    for (const proofs of [[], [proof(f.receipts[0]!)]]) {
      const result = await projectCapturedFinancialArchive(f.archive, financialTarget, month, ports(proofs));
      assert.equal(result.flying.knownMinor, null); assert.equal(result.contributions.length, 0);
      assert.ok(result.issues.some(issue => issue.code === 'invoice-link-unavailable'));
    }
  } finally { await f.db.close(); }
});

for (const [name, mutate, state] of [
  ['missing row link', (value: DurableInvoiceBookingEvidence) => { value.ledgers[0]!.invoiceLinks = []; }, 'partial'],
  ['incompatible row link', (value: DurableInvoiceBookingEvidence) => { value.ledgers[0]!.invoiceLinks[0]!.url = invoiceUrl.replace('99999', '88888'); }, 'conflict'],
  ['ambiguous invoice summary', (value: DurableInvoiceBookingEvidence) => { value.summary.rows.push({ ...value.summary.rows[0]!, position: 1, url: invoiceUrl.replace('99999', '88888') }); }, 'conflict'],
  ['changed ledger booking date', (value: DurableInvoiceBookingEvidence) => { value.ledgers[0]!.observation.capture.rows[0]!.values[0] = '03.06.2026'; }, 'conflict'],
  ['invalid invoice date', (value: DurableInvoiceBookingEvidence) => { value.summary.rows[0]!.dateRaw = '31.06.2026'; }, 'partial'],
  ['absent selected invoice', (value: DurableInvoiceBookingEvidence) => { value.summary.rows = []; }, 'partial'],
] as const) {
  test(`${name} remains unavailable/conflicting with no service/invoice-date fallback`, async () => {
    const f = await fixture();
    try {
      const evidence = proof(f.receipts[0]!); mutate(evidence);
      const result = await projectCapturedFinancialArchive(f.archive, financialTarget, month, ports([evidence]));
      assert.equal(result.state, state); assert.equal(result.flying.knownMinor, null); assert.equal(result.contributions.length, 0);
    } finally { await f.db.close(); }
  });
}

for (const [name, mutate] of [
  ['receipt ID', (value: DurableInvoiceBookingEvidence) => { value.billedReceiptId = 'foreign'; }],
  ['receipt checksum', (value: DurableInvoiceBookingEvidence) => { value.billedChecksum = '0'.repeat(64); }],
  ['flight reference', (value: DurableInvoiceBookingEvidence) => { value.sourceFlightRef = '999'; }],
  ['invoice recipient', (value: DurableInvoiceBookingEvidence) => { value.summary.rows[0]!.recipientRaw = 'Other, Person'; }],
  ['foreign invoice URL', (value: DurableInvoiceBookingEvidence) => { value.summary.rows[0]!.url = 'https://evil.test/member/profile/printuserinvoice.php?uiid=99999'; }],
  ['extra URL query', (value: DurableInvoiceBookingEvidence) => { value.summary.rows[0]!.url += '&other=1'; }],
  ['invented row coordinate', (value: DurableInvoiceBookingEvidence) => { value.ledgers[0]!.invoiceLinks[0]!.rowPosition = 9; }],
  ['duplicate row link', (value: DurableInvoiceBookingEvidence) => { value.ledgers[0]!.invoiceLinks.push({ ...value.ledgers[0]!.invoiceLinks[0]! }); }],
  ['new proof format', (value: DurableInvoiceBookingEvidence) => { (value as { version: number }).version = 2; }],
] as const) {
  test(`reject forged/foreign ${name} and preserve original archive/evidence`, async () => {
    const f = await fixture();
    try {
      const evidence = proof(f.receipts[0]!); mutate(evidence); const original = structuredClone(evidence);
      await assert.rejects(() => projectCapturedFinancialArchive(f.archive, financialTarget, month, ports([evidence])));
      assert.deepEqual(evidence, original); assert.equal(await f.store.exportBackup(), f.archive);
    } finally { await f.db.close(); }
  });
}

for (const field of ['owner', 'connectionId', 'accountNumber', 'clubLabel', 'storeId'] as const) {
  test(`reject foreign ${field} in both durable proof target and ledger observations`, async () => {
    const f = await fixture();
    try {
      for (const choose of ['target', 'ledger']) {
        const evidence = proof(f.receipts[0]!);
        const target = choose === 'target' ? evidence.target : evidence.ledgers[0]!.observation;
        if (field === 'storeId') target.storeId = '44444444-4444-4444-8444-444444444444';
        else if (field === 'owner' || field === 'connectionId') target.scope[field] = 'foreign';
        else target.scope.context[field] = 'foreign';
        await assert.rejects(() => projectCapturedFinancialArchive(f.archive, financialTarget, month, ports([evidence])));
      }
    } finally { await f.db.close(); }
  });
}

test('current-owner gate is rechecked after durable reader and source hashing', async () => {
  const f = await fixture();
  try {
    for (const stage of ['reader', 'hash']) {
      let revoked = false;
      const p = ports(f.receipts.map(proof));
      p.gate = async () => { if (revoked) throw Error('Synthetic lease revoked'); };
      if (stage === 'reader') p.readInvoiceBookingEvidence = async () => { revoked = true; return f.receipts.map(proof); };
      if (stage === 'hash') p.hash = async value => {
        const hash = await financialHash(value); if (value === canonical(billed().source)) revoked = true; return hash;
      };
      await assert.rejects(() => projectCapturedFinancialArchive(f.archive, financialTarget, month, p));
    }
  } finally { await f.db.close(); }
});

test('a later durable booking proof cannot replace an older differently dated proof for identical billed HTML', async () => {
  const f = await fixture([billed(), billed()]);
  try {
    const evidence = f.receipts.map(proof);
    for (const item of evidence[1]!.ledgers) item.observation.capture.rows[0]!.values[0] = '02.06.2026';
    const result = await projectCapturedFinancialArchive(f.archive, financialTarget, month, ports(evidence));
    assert.equal(result.state, 'conflict'); assert.equal(result.flying.knownMinor, null);
    assert.equal(result.contributions.length, 0);
  } finally { await f.db.close(); }
});

test('trusted port receives detached targets/receipts and cannot mutate admitted archive input', async () => {
  const f = await fixture();
  try {
    const p = ports(f.receipts.map(proof));
    p.readInvoiceBookingEvidence = async (target, receipts) => {
      target.scope.owner = 'mutated'; receipts[0]!.checksum = 'mutated'; return f.receipts.map(proof);
    };
    const result = await projectCapturedFinancialArchive(f.archive, financialTarget, month, p);
    assert.equal(result.flying.knownMinor, 10000); assert.equal(await f.store.exportBackup(), f.archive);
  } finally { await f.db.close(); }
});

test('a same-owner raw append during link reading invalidates the pinned source inventory', async () => {
  const f = await fixture();
  try {
    const p = ports(f.receipts.map(proof));
    p.gate = async (target, inventory) => {
      if (inventory === null) return;
      const current = await validateFinancialObservationBackup(await f.store.exportBackup(), target, financialHash);
      assert.deepEqual(inventory, current.receipts.map(({ id, sequence, checksum }) => ({ id, sequence, checksum })));
    };
    p.readInvoiceBookingEvidence = async () => {
      const changed = billed(); changed.source.statedTotalRaw = '99,00 EUR';
      await f.store.save('new-conflicting-receipt', 'billed-flight', changed);
      return f.receipts.map(proof);
    };
    await assert.rejects(() => projectCapturedFinancialArchive(f.archive, financialTarget, month, p));
    assert.equal((await f.store.history()).total, 2);
    assert.deepEqual(await f.store.find(f.receipts[0]!.id), f.receipts[0]);
  } finally { await f.db.close(); }
});

test('empty archives remain unknown, malformed archives reject, and unavailable native link port does not fall back', async () => {
  const f = await fixture([]);
  try {
    const result = await projectCapturedFinancialArchive(f.archive, financialTarget, month, ports([]));
    assert.equal(result.state, 'unavailable'); assert.equal(result.flying.knownMinor, null);
    await assert.rejects(() => projectCapturedFinancialArchive('corrupt', financialTarget, month, ports([])));
    await assert.rejects(() => projectCapturedFinancialArchive(f.archive, financialTarget, month, { ...ports([]), readInvoiceBookingEvidence: undefined } as never));
  } finally { await f.db.close(); }
});

test('amount mismatch/negative amounts and invoice/payment representations never replace full flying source', async () => {
  for (const kind of ['mismatch', 'negative']) {
    const value = billed();
    if (kind === 'mismatch') value.source.statedTotalRaw = '99,99 EUR';
    else { value.source.lines[0]!.amountRaw = '-60,00 EUR'; value.source.lines[1]!.amountRaw = '-40,00 EUR'; value.source.statedTotalRaw = '-100,00 EUR'; }
    const f = await fixture([value]);
    try {
      const result = await projectCapturedFinancialArchive(f.archive, financialTarget, month, ports(f.receipts.map(proof)));
      assert.equal(result.flying.knownMinor, null); assert.equal(result.contributions.length, 0);
    } finally { await f.db.close(); }
  }
});
