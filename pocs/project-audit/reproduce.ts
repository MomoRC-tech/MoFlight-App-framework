// Synthetic audit probes, separate from acceptance tests and the shipped app.
// Exit 0 means the probes completed, not that restore is safe.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { LocalLogbook } from '../../packages/local-data/src/index.ts';
import { canonical, query, validateFlight } from '../../packages/flight-logbook/src/index.ts';
import { nodeDriver } from '../../tests/mobile/sqlite-driver.ts';

const hash = async (s: string) => createHash('sha256').update(s).digest('hex');
const fixture = JSON.parse(await readFile('tests/fixtures/local-logbook/mobile.json', 'utf8'));
const original = new LocalLogbook(nodeDriver(':memory:'), 'synthetic-lab-a', hash);
await original.initialize();
await original.importSource(fixture.source);
await original.preparePage(fixture.page, fixture.raw_page);
await original.makeTemplate();
const baseline = await original.backup();
const envelope = JSON.parse(baseline);
const body = JSON.parse(envelope.payload);
const results: unknown[] = [];
try {
  for (const name of ['orphan-finding', 'wrong-flight-type', 'record-payload-id-mismatch', 'missing-last-success'] as const) {
    const candidate = structuredClone(body);
    const record = candidate.records.find((r: { kind: string }) => r.kind ===
      (name === 'orphan-finding' ? 'finding' : name === 'missing-last-success' ? 'state' : 'flight'));
    if (!record) throw new Error('Expected fixture record missing');
    const value = JSON.parse(record.payload);
    if (name === 'orphan-finding') value.flight_id = 'fixture:nonexistent';
    if (name === 'wrong-flight-type') value.registration = { unexpected: 'object' };
    if (name === 'record-payload-id-mismatch') value.id = 'fixture:wrong-payload-id';
    if (name === 'missing-last-success') value.source_id = 'fixture:missing-import';
    record.payload = canonical(value);
    const payload = canonical(candidate);
    const backup = canonical({ ...envelope, payload, checksum: await hash(payload) });
    const destination = new LocalLogbook(nodeDriver(':memory:'), 'synthetic-lab-a', hash);
    await destination.initialize();
    let accepted = false, queryError: string | null = null, sourcePresent: boolean | null = null;
    try {
      await destination.restore(backup);
      accepted = true;
      const history = await destination.history();
      sourcePresent = history.source !== null;
      try { query(history); } catch (e) { queryError = e instanceof Error ? e.name : 'unknown'; }
    } catch (e) { queryError = e instanceof Error ? e.name : 'unknown'; }
    finally { await destination.db.close(); }
    results.push({ name, checksumValid: true, restoreAccepted: accepted, queryError, sourcePresent });
  }
  const badFlight = { ...fixture.source.flights[0], registration: { unexpected: 'object' } };
  let accepted = false;
  try { validateFlight(badFlight); accepted = true; } catch { /* report rejection */ }
  results.push({ name: 'validateFlight-wrong-registration-type', accepted });
  console.log(JSON.stringify({ probes: results, originalUnchanged: baseline === await original.backup() }, null, 2));
} finally { await original.db.close(); }
