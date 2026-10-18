import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptPreview, confirmPreviewChoice, planImportPreview, recordEvidence, type PreviewSession } from '../../apps/platform-lab/src/import-preview.ts';
import { syntheticImportPreview } from '../../apps/platform-lab/src/import-preview-fixture.ts';
import { sourceIdentity } from '../../apps/platform-lab/src/vereinsflieger/reconciliation.ts';

const plan = (s: PreviewSession) => planImportPreview(s.workspace, s.batch);
function choose(s: PreviewSession, reference: string, bookId: string | null, variant = 0) {
  const row = plan(s).rows.find(r => r.reference === reference)!;
  s.workspace = confirmPreviewChoice(s.workspace, s.batch, row.id, recordEvidence(row.variants[variant]!), bookId);
}

test('review groups source IDs, keeps conflicting and previous evidence, and explains distinct book suggestions', () => {
  const s = syntheticImportPreview(), before = structuredClone(s), p = plan(s);
  assert.deepEqual(p.counts, { added: 5, changed: 1, unchanged: 1, conflict: 1 });
  assert.equal(p.repeatedRows, 1);
  const row = (id: string) => p.rows.find(r => r.reference === id)!;
  assert.deepEqual(row('1002').changedFields, ['minutes']);
  assert.equal(row('1002').previous!.flight.minutes, 12);
  assert.equal(row('1002').variants[0]!.flight.minutes, 14);
  assert.equal(row('1002').reason, 'stale'); assert.equal(row('1002').bookId, 'preview-glider-b');
  assert.equal(row('1003').selected, null); assert.equal(row('1003').variants.length, 2);
  assert.equal(row('1004').reason, 'category'); assert.equal(row('1004').bookId, 'preview-powered');
  assert.equal(row('1005').reason, 'history'); assert.equal(row('1005').bookId, 'preview-glider-a');
  assert.equal(row('1006').reason, 'multiple-books'); assert.equal(row('1006').bookId, null);
  assert.equal(row('1007').reason, 'unknown-class'); assert.equal(row('1007').variants[0]!.flight.minutes, null);
  assert.equal(row('1008').reason, 'duplicate'); assert.equal(row('1008').bookId, null);
  assert.deepEqual(s, before);
  p.rows[0]!.variants[0]!.flight.minutes = 999; assert.deepEqual(s, before);
});

test('manual correction, explicit deferral and chosen conflict variants survive repeats and simulated acceptance', () => {
  const s = syntheticImportPreview();
  choose(s, '1002', 'preview-glider-a'); choose(s, '1003', 'preview-glider-b', 1); choose(s, '1005', null); choose(s, '1006', 'preview-glider-b');
  assert.equal(plan(s).rows.find(r => r.reference === '1003')!.selected, 1);
  const before = structuredClone(s); s.workspace = acceptPreview(s.workspace, plan(s));
  assert.equal(s.workspace.records.length, 9); // Eight incoming IDs plus omitted 1009.
  assert.equal(new Set(s.workspace.records.map(r => r.sourceFlightId)).size, 9);
  assert.equal(s.workspace.records.find(r => r.sourceFlightId === '1003')!.flight.minutes, 25);
  assert.deepEqual(s.workspace.observations.filter(r => r.sourceFlightId === '1002').map(r => r.flight.minutes).sort(), [12, 14]);
  assert.deepEqual(s.workspace.observations.filter(r => r.sourceFlightId === '1003').map(r => r.flight.minutes).sort(), [18, 20, 25]);
  assert.deepEqual(s.workspace.choices, before.workspace.choices);
  // A suggestion is not user consent and never adds a credited membership.
  assert.equal(s.workspace.choices.some(c => c.id === sourceIdentity(s.workspace.binding, '1004')), false);
  assert.equal(plan(s).rows.find(r => r.reference === '1005')!.reason, 'confirmed');
  assert.equal(plan(s).rows.find(r => r.reference === '1005')!.bookId, null);
  const accepted = structuredClone(s.workspace); s.workspace = acceptPreview(s.workspace, plan(s)); assert.deepEqual(s.workspace, accepted);
  // Source duplicate state remains a conflict even after choosing one observation.
  assert.deepEqual(plan(s).counts, { added: 0, changed: 0, unchanged: 7, conflict: 1 });
});

test('stale choices need explicit review, preserve incompatible books and cannot silently reroute', () => {
  const s = syntheticImportPreview(), before = structuredClone(s);
  assert.throws(() => acceptPreview(s.workspace, plan(s)), /Review changed/); assert.deepEqual(s, before);
  choose(s, '1002', 'preview-glider-b'); choose(s, '1003', null);
  const changed = s.batch.records.find(r => r.sourceFlightId === '1002')!; changed.aircraftClass = 'powered';
  const row = plan(s).rows.find(r => r.reference === '1002')!;
  assert.equal(row.reason, 'stale'); assert.equal(row.bookId, 'preview-glider-b');
  assert.throws(() => choose(s, '1002', 'preview-glider-b'), /not eligible/);
  choose(s, '1002', null); assert.equal(plan(s).rows.find(r => r.reference === '1002')!.reason, 'confirmed');
});

test('partial/unverified/foreign batches and forged book/flight IDs leave the previous workspace intact', () => {
  const original = syntheticImportPreview();
  for (const mutate of [
    (s: PreviewSession) => { s.batch.owner = 'other'; },
    (s: PreviewSession) => { s.batch.binding = { ...s.batch.binding, accountRef: 'other' }; },
    (s: PreviewSession) => { s.batch.binding = { ...s.batch.binding, clubRef: 'other' }; },
    (s: PreviewSession) => { s.batch.coverage.complete = false; },
    (s: PreviewSession) => { s.batch.identityVerified = false; },
    (s: PreviewSession) => { s.batch.timeBasisVerified = false; },
    (s: PreviewSession) => { s.batch.sourceIdsVerified = false; },
    (s: PreviewSession) => { s.workspace.books[0]!.owner = 'other'; },
    (s: PreviewSession) => { s.workspace.owner = s.batch.owner = 'other'; s.workspace.books.forEach(b => { b.owner = 'other'; }); },
    (s: PreviewSession) => { s.workspace.choices[0]!.bookId = 'foreign'; },
    (s: PreviewSession) => { s.workspace.choices[0]!.id = sourceIdentity({ ...s.workspace.binding, accountRef: 'other' }, '1001'); },
  ]) {
    const s = structuredClone(original); mutate(s); const before = structuredClone(s);
    assert.throws(() => plan(s)); assert.deepEqual(s, before);
  }
  const before = structuredClone(original);
  assert.throws(() => choose(original, '1004', 'foreign'), /not eligible/);
  assert.throws(() => choose(original, '1007', 'preview-glider-a'), /not eligible/);
  assert.throws(() => choose(original, '1008', 'preview-glider-a'), /not eligible/);
  assert.throws(() => confirmPreviewChoice(original.workspace, original.batch, 'forged', 'forged', null));
  assert.deepEqual(original, before);
  const other = syntheticImportPreview(); other.workspace.owner = other.batch.owner = 'other';
  other.workspace.books.forEach(b => { b.owner = 'other'; }); other.workspace.choices = [];
  assert.equal(plan(other).rows.length, 8); // A valid second owner cannot reuse the first owner's choices, even with matching book IDs.
});

test('book effective dates, unsupported formats and conflicting confirmed aircraft history remain unresolved', () => {
  const s = syntheticImportPreview();
  s.batch.records.find(r => r.sourceFlightId === '1002')!.aircraftRef = 'synthetic-aircraft-a';
  choose(s, '1002', 'preview-glider-b');
  // Save its reviewed new evidence to make it eligible as historical preference.
  s.workspace.records[1] = structuredClone(s.batch.records.find(r => r.sourceFlightId === '1002')!);
  assert.equal(plan(s).rows.find(r => r.reference === '1005')!.reason, 'ambiguous-history');
  s.workspace.books[0]!.through = '2026-10-09';
  assert.deepEqual(plan(s).rows.find(r => r.reference === '1006')!.candidateBookIds, ['preview-glider-b']);
  s.workspace.books[1]!.format = 'future-format';
  assert.equal(plan(s).rows.find(r => r.reference === '1006')!.reason, 'no-book');
  s.workspace.books[2]!.from = '2026-10-11';
  assert.equal(plan(s).rows.find(r => r.reference === '1004')!.reason, 'no-book');
});

test('metadata conflicts and identical aircraft/date/values with different source IDs are never silently merged', () => {
  const s = syntheticImportPreview();
  const duplicate = structuredClone(s.batch.records.find(r => r.sourceFlightId === '1004')!);
  duplicate.aircraftClass = 'glider'; s.batch.records.push(duplicate);
  assert.equal(plan(s).rows.find(r => r.reference === '1004')!.status, 'conflict');
  assert.equal(plan(s).rows.find(r => r.reference === '1004')!.selected, null);
  s.batch.records.push({ ...structuredClone(s.batch.records[0]!), sourceFlightId: '2001' });
  assert.ok(plan(s).rows.find(r => r.reference === '2001'));
});

test('stale or forged plans are rejected atomically, and unresolved conflicts and omissions preserve old records', () => {
  const s = syntheticImportPreview(); choose(s, '1002', null); // Leave conflict stale to explicitly test protection first.
  assert.throws(() => acceptPreview(s.workspace, plan(s)), /Review changed/);
  // No old choice for this conflict: it must remain untouched while other rows can be staged.
  s.workspace.choices = s.workspace.choices.filter(c => c.id !== sourceIdentity(s.workspace.binding, '1003'));
  const p = plan(s), before = structuredClone(s.workspace), forged = structuredClone(p);
  forged.rows[0]!.bookId = 'forged'; assert.throws(() => acceptPreview(s.workspace, forged), /Comparison changed/);
  choose(s, '1004', 'preview-powered'); assert.throws(() => acceptPreview(s.workspace, p), /Comparison changed/);
  s.workspace = before;
  const accepted = acceptPreview(s.workspace, p);
  assert.equal(accepted.records.find(r => r.sourceFlightId === '1003')!.flight.minutes, 18);
  assert.ok(accepted.records.find(r => r.sourceFlightId === '1009'));
  assert.deepEqual(s.workspace, before);
  const empty = { ...s.batch, records: [] };
  assert.deepEqual(acceptPreview(s.workspace, planImportPreview(s.workspace, empty)), s.workspace);
});
