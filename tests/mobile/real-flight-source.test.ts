import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  REAL_FLIGHT_SOURCE_ADAPTER,
  createRealFlightSourceObservation,
  validateRealFlightSourceForImport,
  validateRealFlightSourceObservation,
  type RealFlightSourceInput,
} from '../../apps/platform-lab/src/vereinsflieger/real-flight-source';

const hash = async (text: string) => createHash('sha256').update(text).digest('hex');
const before = {
  accountNumber: '12345',
  clubLabel: 'Example club',
  clubIdentity: 'display-label-only' as const,
  verification: 'observed-profile-number' as const,
};
const requestedWindow = { from: '2026-10-01', to: '2026-10-20', participation: 'Pilot oder Fluglehrer' as const };
const headers = ['Datum', 'Lfz.', 'Start', 'Landung', 'Flugzeit', 'Pilot'];
const oneRow = {
  values: ['20.10.2026', 'D-TEST', '09:00', '10:00', '1:00', 'Synthetic pilot'],
  sourceFlightId: '101',
};

function input(complete = true): RealFlightSourceInput {
  return {
    version: 1,
    binding: { provider: 'vereinsflieger', accountRef: '12345' },
    contextBefore: { ...before },
    contextAfter: { ...before },
    requestedWindow: { ...requestedWindow },
    capture: {
      captureId: 'synthetic-capture-1',
      retrievedAt: '2026-10-20T10:00:00.000Z',
      headers: [...headers],
      rows: [{ ...oneRow, values: [...oneRow.values] }],
      sourceIdentity: 'unverified',
      coverage: complete ? 'complete-requested-list' : 'visible-personal-list-only',
      timeBasis: 'unknown',
      ...(complete ? {
        exportContext: {
          from: requestedWindow.from,
          to: requestedWindow.to,
          preset: 'Konfiguration laden',
          participation: requestedWindow.participation,
          accountLabel: 'Example account',
          recordCount: 1,
          pageCount: 1,
          columnIds: ['1', '2', '3', '4', '5', '6'],
          adapterVersion: 2,
        },
      } : {}),
    },
  };
}

test('complete capture is deterministic, immutable raw evidence with scoped context and no inferred fields', async () => {
  const original = input(), observation = await createRealFlightSourceObservation(original, hash);
  assert.equal(observation.adapter.method, REAL_FLIGHT_SOURCE_ADAPTER.method);
  assert.equal(observation.adapter.claim, 'adapter-contract-only');
  assert.equal(observation.binding.accountRef, '12345');
  assert.equal(observation.context.before.clubLabel, 'Example club');
  assert.equal(observation.context.clubIdentity, 'display-label-only');
  assert.deepEqual(observation.requestedWindow, requestedWindow);
  assert.equal(observation.coverage.state, 'complete');
  assert.deepEqual(observation.coverage.referenceIntegrity, { missingCount: 0, duplicateCount: 0 });
  assert.deepEqual(observation.rows, [{ sourceFlightRef: '101', rawValues: oneRow.values }]);
  assert.equal(observation.rows[0]!.rawValues[4], '1:00');
  assert.equal('minutes' in observation.rows[0]!, false);
  assert.equal(observation.capture.rawCaptureSha256, await hash(observation.capture.rawCaptureJson));
  assert.deepEqual(await validateRealFlightSourceObservation(JSON.parse(JSON.stringify(observation)), hash), observation);
  assert.throws(() => (observation.rows as unknown[]).push({ sourceFlightRef: '102', rawValues: [] }));
  assert.throws(() => (observation.rows[0]!.rawValues as string[]).push('changed'));
  assert.equal(original.capture.rows[0]!.values[4], '1:00');
});

test('capture input is snapshotted before the injected digest can yield', async () => {
  const candidate = input();
  const pending = createRealFlightSourceObservation(candidate, async text => {
    await Promise.resolve();
    return hash(text);
  });
  candidate.capture.rows[0]!.values[0] = '01.10.2026';
  const observation = await pending;
  assert.equal(observation.rows[0]!.rawValues[0], '20.10.2026');
  assert.equal(JSON.parse(observation.capture.rawCaptureJson).rows[0].values[0], '20.10.2026');
  assert.equal(observation.capture.rawCaptureSha256, await hash(observation.capture.rawCaptureJson));
});

test('empty complete requested window is valid coverage-only evidence', async () => {
  const candidate = input();
  candidate.capture.rows = [];
  candidate.capture.exportContext!.recordCount = 0;
  candidate.capture.exportContext!.pageCount = 1;
  const observation = await createRealFlightSourceObservation(candidate, hash);
  assert.equal(observation.coverage.state, 'empty');
  assert.equal(observation.coverage.observedRecordCount, 0);
  assert.equal(observation.coverage.reportedRecordCount, 0);
  assert.deepEqual(observation.rows, []);
  assert.equal((await validateRealFlightSourceForImport(observation, hash)).coverage.state, 'empty');
});

test('visible list remains readable partial evidence but cannot be imported', async () => {
  const observation = await createRealFlightSourceObservation(input(false), hash);
  assert.equal(observation.coverage.state, 'partial');
  assert.equal(observation.coverage.displayedWindow, null);
  assert.equal(observation.coverage.reportedRecordCount, null);
  assert.equal(observation.rows[0]!.sourceFlightRef, '101');
  await assert.rejects(validateRealFlightSourceForImport(observation, hash), /Partial/);
});

test('foreign account, changing club context and mismatched request scope are rejected', async () => {
  const foreign = input(); foreign.contextAfter = { ...before, accountNumber: '99999' };
  await assert.rejects(createRealFlightSourceObservation(foreign, hash), /changed/);

  const mismatched = input(); mismatched.binding.accountRef = '99999';
  await assert.rejects(createRealFlightSourceObservation(mismatched, hash), /expected provider account/);

  const changedClub = input(); changedClub.contextAfter = { ...before, clubLabel: 'Other club' };
  await assert.rejects(createRealFlightSourceObservation(changedClub, hash), /changed/);

  const wrongDates = input(); wrongDates.capture.exportContext!.from = '2026-09-30';
  await assert.rejects(createRealFlightSourceObservation(wrongDates, hash), /requested dates/);

  const wrongCount = input(); wrongCount.capture.exportContext!.recordCount = 2;
  await assert.rejects(createRealFlightSourceObservation(wrongCount, hash));
});

test('duplicate and missing references remain raw review evidence but fail import validation', async () => {
  const duplicate = input();
  duplicate.capture.rows.push({ ...oneRow, values: [...oneRow.values] });
  duplicate.capture.exportContext!.recordCount = 2;
  const duplicateEvidence = await createRealFlightSourceObservation(duplicate, hash);
  assert.equal(duplicateEvidence.coverage.state, 'complete');
  assert.deepEqual(duplicateEvidence.coverage.referenceIntegrity, { missingCount: 0, duplicateCount: 1 });
  assert.deepEqual(duplicateEvidence.rows.map(row => row.sourceFlightRef), ['101', '101']);
  assert.deepEqual(await validateRealFlightSourceObservation(duplicateEvidence, hash), duplicateEvidence);
  await assert.rejects(validateRealFlightSourceForImport(duplicateEvidence, hash), /references require review/);

  const missing = input();
  (missing.capture.rows[0] as { sourceFlightId: string | null }).sourceFlightId = null;
  const missingEvidence = await createRealFlightSourceObservation(missing, hash);
  assert.deepEqual(missingEvidence.coverage.referenceIntegrity, { missingCount: 1, duplicateCount: 0 });
  assert.equal(missingEvidence.rows[0]!.sourceFlightRef, null);
  await assert.rejects(validateRealFlightSourceForImport(missingEvidence, hash), /references require review/);
});

test('unsupported keys, invalid dates, mutated digest and oversized source windows are rejected', async () => {
  const extra = input();
  Object.assign(extra.capture, { verified: true });
  await assert.rejects(createRealFlightSourceObservation(extra, hash), /keys/);

  const extraRow = input();
  Object.assign(extraRow.capture.rows[0]!, { identityVerified: true });
  await assert.rejects(createRealFlightSourceObservation(extraRow, hash), /keys/);

  const invalidDate = input();
  invalidDate.requestedWindow.from = '2026-02-30';
  await assert.rejects(createRealFlightSourceObservation(invalidDate, hash), /requested flight window/);

  const observation = await createRealFlightSourceObservation(input(), hash);
  const forged: unknown = structuredClone(observation);
  (forged as { coverage: { reportedRecordCount: number } }).coverage.reportedRecordCount = 9;
  await assert.rejects(validateRealFlightSourceObservation(forged, hash), /does not match/);

  const tooMany = input();
  tooMany.capture.rows = Array.from({ length: 5_001 }, (_, index) => ({
    values: ['20.10.2026', 'D-TEST', '', '', '', 'Synthetic pilot'],
    sourceFlightId: String(index + 1),
  }));
  tooMany.capture.exportContext!.recordCount = tooMany.capture.rows.length;
  tooMany.capture.exportContext!.pageCount = 6;
  await assert.rejects(createRealFlightSourceObservation(tooMany, hash), /row limit/);
});
