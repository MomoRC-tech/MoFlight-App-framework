import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { nodeDriver } from './sqlite-driver.ts';
import * as scopes from '../../apps/platform-lab/src/vereinsflieger/scope-store.ts';
import * as views from '../../apps/platform-lab/src/vereinsflieger/view-store.ts';
import * as captures from '../../apps/platform-lab/src/vereinsflieger/capture-store.ts';
import * as legacy from '../../apps/platform-lab/src/vereinsflieger/legacy-recovery-store.ts';
import type { ViewPreferences } from '../../apps/platform-lab/src/vereinsflieger/view.ts';
import type { supersedeScopedView } from '../../apps/platform-lab/src/vereinsflieger/scoped-storage.ts';

const source = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/vereinsflieger/scoped-storage.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const scope: scopes.ProviderScope = { version: 1, owner: 'synthetic-owner', connectionId: '11111111-1111-4111-8111-111111111111',
  context: { accountNumber: '123', clubLabel: 'Synthetic', clubIdentity: 'display-label-only', verification: 'observed-profile-number' } };
const view: ViewPreferences = { version: 2 as const, accountLabel: 'Synthetic', preset: 'Original', columns: ['1'], filters: [{ name: 'col1', type: 'text', value: 'example', checked: false }], sort: [], role: 'Pilot', period: 'Das letzte Jahr', reset: false };

test('scoped preparation fences cancellation before open, before write and before commit, and closes every native handle', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'moflight-view-gate-'));
  const registryPath = join(directory, 'registry.sqlite'), viewPath = join(directory, 'view.sqlite');
  try {
    const registry = nodeDriver(registryPath);
    try { await registry.exec(scopes.SCOPE_SCHEMA); await scopes.bindScope(registry, scope); }
    finally { await registry.close(); }
    const db = nodeDriver(viewPath);
    try { await db.exec(views.VIEW_SCHEMA); await views.rememberView(db, view); }
    finally { await db.close(); }
    let opened = 0, closed = 0;
    const modules: Record<string, unknown> = {
      'expo-crypto': {}, './scope-store': scopes, './view-store': views, './capture-store': captures, './legacy-recovery-store': legacy,
      '../storage': { openDriver: async (name: string) => {
        assert.ok(name === 'vereinsflieger-owner-registry.sqlite' || name === `vereinsflieger-owned-${scope.connectionId}.sqlite`);
        const handle = nodeDriver(name.includes('owner-registry') ? registryPath : viewPath); opened++;
        return { ...handle, close: async () => { await handle.close(); closed++; } };
      } },
    };
    const exports: { supersedeScopedView?: typeof supersedeScopedView } = {};
    runInNewContext(source, { exports, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
    for (const cancelAt of [1, 2, 3, 4]) {
      let checks = 0;
      await assert.rejects(exports.supersedeScopedView!(scope, view, () => { if (++checks === cancelAt) throw new Error('Superseded'); }), /Superseded/);
      assert.equal(opened, closed);
      const audit = nodeDriver(viewPath);
      try { assert.deepEqual(await views.pendingView(audit), view, `Cancellation at gate ${cancelAt} preserves recovery`); }
      finally { await audit.close(); }
    }
    await exports.supersedeScopedView!(scope, view);
    assert.equal(opened, closed);
    const audit = nodeDriver(viewPath);
    try {
      assert.equal(await views.pendingView(audit), null);
      const archived = await audit.first<{ payload: string }>('SELECT payload FROM provider_view_superseded_v1');
      assert.deepEqual(JSON.parse(archived!.payload), view);
    } finally { await audit.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
