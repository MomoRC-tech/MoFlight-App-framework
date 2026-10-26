import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { canonical } from '../../packages/flight-logbook/src/index.ts';
import { createDutyRosterSnapshot, DUTY_RETENTION_MS } from '../../apps/platform-lab/src/vereinsflieger/duties.ts';
import type { ProviderScope } from '../../apps/platform-lab/src/vereinsflieger/scope-store.ts';
import { validateInformationCapture } from '../../apps/platform-lab/src/vereinsflieger/information.ts';

function harness(mode: 'success' | 'bad-readback' | 'registry-changed' = 'success') {
  const rows = [{ owner: 'existing-owner', payload: 'existing exact bytes' }];
  let info: unknown[] = [], roster: ReturnType<typeof createDutyRosterSnapshot> | null = null, opens = 0, closes = 0;
  const authorized = (scope: ProviderScope, gate: () => void) => {
    gate(); if (scope.context.accountNumber !== '999990007') throw new Error('Unowned provider scope');
  };
  const modules: Record<string, unknown> = {
    'expo-crypto': { randomUUID: () => '11111111-2222-4333-8444-555555555555' },
    '@moflight/flight-logbook': { canonical },
    '../storage': { openDriver: async () => {
      opens++; return { exec: async () => {}, all: async () => rows.map(row => ({ ...row })), close: async () => { closes++; } };
    } },
    '../vereinsflieger/scope-store': { SCOPE_SCHEMA: 'schema', bindScope: async (_db: unknown, scope: ProviderScope) => {
      rows.push({ owner: scope.owner, payload: canonical(scope) });
    } },
    '../vereinsflieger/information-native': {
      saveAndLoadInformation: async (scope: ProviderScope, value: unknown, gate: () => void) => {
        authorized(scope, gate); info = [validateInformationCapture(value)];
        if (mode === 'registry-changed') rows[0]!.payload = 'corrupt';
        return mode === 'bad-readback' ? [] : info;
      },
      loadInformation: async (scope: ProviderScope, gate: () => void) => { authorized(scope, gate); return info; },
    },
    '../vereinsflieger/duty-native': {
      saveAndLoadDutyRoster: async (scope: ProviderScope, value: typeof roster, gate: () => void) => { authorized(scope, gate); roster = value; return roster; },
      loadDutyRoster: async (scope: ProviderScope, gate: () => void, now: () => number) => {
        authorized(scope, gate);
        if (roster && now() >= Date.parse(roster.retrievedAt) + DUTY_RETENTION_MS) roster = null;
        return roster;
      },
    },
    '../vereinsflieger/duties': { createDutyRosterSnapshot, DUTY_RETENTION_MS },
    '../user-backup-restore-journal-native': { assertNoPendingUserBackupRestore: async () => {} },
  };
  const source = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/development/native-source-readback-proof.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {} as typeof import('../../apps/platform-lab/src/development/native-source-readback-proof.ts');
  runInNewContext(source, { exports, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
  return { run: exports.runNativeSourceReadbackProof, rows, handlesClosed: () => opens === closes };
}

test('native proof orchestration preserves originals and exercises readbacks and guards', async () => {
  const h = harness(), result = await h.run();
  assert.equal(result.checks.length, 4);
  assert.equal(h.rows[0]!.payload, 'existing exact bytes');
  assert.equal(h.rows.length, 2);
  assert.ok(h.handlesClosed());
});
test('native proof refuses fabricated readback success and closes registry handles', async () => {
  const h = harness('bad-readback');
  await assert.rejects(h.run(), /Medical committed readback mismatch/);
  assert.ok(h.handlesClosed());
});
test('native proof fails if any original registry row changes', async () => {
  const h = harness('registry-changed');
  await assert.rejects(h.run(), /Original provider registry rows changed/);
  assert.ok(h.handlesClosed());
});
