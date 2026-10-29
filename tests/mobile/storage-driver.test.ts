import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/storage.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

test('separate generic SQLite owners survive repeated open/read/close beside a retained reader', async () => {
  // Model Expo's default shared native root: independent driver lifetimes must
  // not rely on the shared handle surviving another JS owner's cleanup.
  const cached = new Map<string, ReturnType<typeof database>>();
  const opened: Array<{name: string; independent: boolean}> = [];
  function database() {
    let closed = false;
    const read = async () => { if (closed) throw new Error('Native database handle unavailable'); return [{value: 42}]; };
    return {
      getAllAsync: read, getFirstAsync: async () => (await read())[0],
      execAsync: async () => { await read(); }, runAsync: async () => { await read(); },
      closeAsync: async () => { closed = true; },
      withExclusiveTransactionAsync: async (work: (tx: unknown) => Promise<void>) => {
        await read(); await work(database());
      },
    };
  }
  const modules: Record<string, unknown> = {
    './local-read-diagnostics': { diagnoseLocalDriver: (driver: unknown) => driver },
    'expo-sqlite': { async openDatabaseAsync(name: string, options?: {useNewConnection?: boolean}) {
      opened.push({name, independent: options?.useNewConnection === true});
      if (options?.useNewConnection) return database();
      if (!cached.has(name)) cached.set(name, database());
      return cached.get(name);
    } },
    'expo-crypto': {}, 'expo-file-system': { File: class {}, Paths: {document: 'synthetic:'} },
    '@moflight/local-data': {}, './selection-store': {},
  };
  const api = {} as typeof import('../../apps/platform-lab/src/storage');
  runInNewContext(source, {exports: api, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; }});
  const retained = await api.openDriver('synthetic-pilot.sqlite');
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const backup = await api.openDriver('synthetic-pilot.sqlite');
      try {
        assert.equal((await backup.first<{value: number}>('SELECT synthetic'))?.value, 42);
        await backup.transaction(async tx => { assert.equal((await tx.all('SELECT synthetic')).length, 1); });
      } finally { await backup.close(); }
      assert.equal((await retained.all('SELECT synthetic')).length, 1, 'backup cleanup preserves the existing reader');
    }
    assert.ok(opened.every(value => value.independent), 'each closing owner has its own native root');
  } finally { await retained.close(); }
});
