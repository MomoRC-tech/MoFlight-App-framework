import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { canonical } from '../../packages/flight-logbook/src/index.ts';
import { PilotBooks, sourceId, type SourceFlight } from '../../packages/local-data/src/books.ts';
import { nodeDriver } from './sqlite-driver.ts';

const hash = async (value: string) => createHash('sha256').update(value).digest('hex');
const source = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/pilot-backup.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

async function fixture() {
  const owner = 'synthetic-pilot', current = new PilotBooks(nodeDriver(':memory:'), owner, hash);
  await current.initialize();
  for (const id of ['a', 'b']) await current.createBook({ id, owner, name: id, format: 'synthetic-powered-five-row-v1', classes: ['glider'], from: '2020-01-01', through: null });
  const input = JSON.parse(readFileSync('tests/fixtures/local-logbook/mobile.json', 'utf8')).source.flights.at(-1);
  const id = sourceId(owner, 'synthetic-provider', '1');
  const flight: SourceFlight = { id, owner, transport: 'synthetic-proof', connection: 'synthetic-provider', reference: '1', aircraftClass: 'glider', duplicate: false, raw: 'retained synthetic original', flight: { ...input, id, pilot_role: 'PIC' } };
  await current.ingest([flight]); await current.associate('a', id, true); await current.associate('b', id, false);
  await current.saveState('a', 'pending', { draft: 'retained synthetic draft' }); await current.prepare('a');
  const backup = await current.backup();
  const files = new Map<string, string>([['picked.json', backup]]), selections = new Map([[current, 'b']]);
  const candidates: PilotBooks[] = [], closed = new Set<PilotBooks>(), shared: string[] = [], events: string[] = [];
  const state = { cancelled: false, size: 1000, permission: true, sharing: true, corruptReadback: false, failReader: false, failCommit: false, active: 'previous-library' };
  let sequence = 0;
  const modules: Record<string, any> = {
    'expo-file-system': { Paths: { document: 'document:' }, File: class {
      uri: string;
      constructor(...parts: string[]) { this.uri = parts.join('/'); }
      create() { files.set(this.uri, ''); }
      write(text: string) { files.set(this.uri, text); }
      async text() { return files.get(this.uri)!; }
    } },
    'expo-crypto': { randomUUID: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}` },
    'expo-sharing': { isAvailableAsync: async () => state.sharing, shareAsync: async (uri: string) => { shared.push(uri); } },
    'expo-file-system/legacy': { StorageAccessFramework: {
      getUriForDirectoryInRoot: () => 'Documents', requestDirectoryPermissionsAsync: async () => ({ granted: state.permission, directoryUri: 'folder:' }),
      createFileAsync: async (_: string, name: string) => 'folder:/' + name,
      writeAsStringAsync: async (uri: string, text: string) => { files.set(uri, text); },
      readAsStringAsync: async (uri: string) => state.corruptReadback ? 'corrupt external file' : files.get(uri),
    } },
    'expo-document-picker': { getDocumentAsync: async () => state.cancelled ? { canceled: true } : { canceled: false, assets: [{ uri: 'picked.json', size: state.size }] } },
    './book-storage': {
      openBooks: async () => {
        const db = nodeDriver(':memory:'), next = new PilotBooks(db, owner, hash), close = db.close;
        db.close = async () => { closed.add(next); await close(); };
        await next.initialize(); candidates.push(next);
        const history = next.history.bind(next);
        next.history = async (book, tx) => { if (state.failReader && !tx) throw new Error('reader unavailable'); return history(book, tx); };
        return next;
      },
      rememberedBook: async (value: PilotBooks) => selections.get(value),
      rememberBook: async (value: PilotBooks, book: string) => { await value.book(book); selections.set(value, book); events.push('book-ready'); },
      rememberLibrary: async (name: string) => { events.push('pointer-commit'); if (state.failCommit) throw new Error('pointer commit failed'); state.active = name; },
    },
  };
  const api = {} as typeof import('../../apps/platform-lab/src/pilot-backup.ts');
  runInNewContext(source, { exports: api, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
  const close = async () => { await current.db.close(); for (const value of candidates) if (!closed.has(value)) await value.db.close(); };
  return { api, current, backup, files, selections, candidates, closed, shared, events, state, close };
}

test('whole-library restore validates data and chosen book before pointer commit; original stays intact', async () => {
  const f = await fixture();
  try {
    const result = await f.api.restorePilotBackup(f.current);
    assert.equal(result.state, 'restored');
    if (result.state !== 'restored') return;
    assert.equal(await result.library.backup(), f.backup);
    assert.equal(await f.current.backup(), f.backup);
    assert.equal(result.bookId, 'b'); assert.equal(f.selections.get(result.library), 'b');
    assert.deepEqual(f.events, ['book-ready', 'pointer-commit']);
    assert.match(f.state.active, /^pilot-restore-/); assert.equal(f.closed.has(f.current), false);
  } finally { await f.close(); }
});

test('cancelled/oversized or foreign-owner input never activates a library', async () => {
  const f = await fixture();
  try {
    f.state.cancelled = true;
    assert.equal((await f.api.restorePilotBackup(f.current)).state, 'cancelled');
    assert.equal(f.candidates.length, 0);
    f.state.cancelled = false; f.state.size = 2_000_001;
    await assert.rejects(f.api.restorePilotBackup(f.current), /too large/); assert.equal(f.candidates.length, 0);
    f.state.size = 1000;
    const envelope = JSON.parse(f.backup), body = JSON.parse(envelope.payload); body.owner = 'foreign-synthetic-pilot';
    envelope.payload = canonical(body); envelope.checksum = await hash(envelope.payload);
    f.files.set('picked.json', canonical(envelope));
    await assert.rejects(f.api.restorePilotBackup(f.current), /Foreign pilot/);
    assert.equal(f.state.active, 'previous-library'); assert.equal(f.closed.has(f.candidates[0]!), true);
    assert.equal(await f.current.backup(), f.backup);
  } finally { await f.close(); }
});

test('reader and selection-commit failures close only the candidate and keep the previous library usable', async () => {
  for (const failure of ['failReader', 'failCommit'] as const) {
    const f = await fixture();
    try {
      f.state[failure] = true;
      await assert.rejects(f.api.restorePilotBackup(f.current), /reader unavailable|pointer commit failed/);
      assert.equal(f.state.active, 'previous-library'); assert.equal(f.closed.has(f.candidates[0]!), true);
      assert.equal(f.closed.has(f.current), false); assert.equal(f.selections.get(f.current), 'b');
      assert.equal(await f.current.backup(), f.backup);
    } finally { await f.close(); }
  }
});

test('folder cancellation/readback failure and sharing outcomes cannot masquerade as an external saved backup', async () => {
  const f = await fixture();
  try {
    f.state.permission = false;
    assert.equal(await f.api.savePilotBackupToFolder(f.current), 'cancelled'); assert.equal(f.files.size, 1);
    f.state.permission = true; f.state.corruptReadback = true;
    await assert.rejects(f.api.savePilotBackupToFolder(f.current), /verification failed/);
    f.state.corruptReadback = false;
    assert.equal(await f.api.savePilotBackupToFolder(f.current), 'saved');
    assert.equal(await f.api.sharePilotBackup(f.current), 'prepared'); assert.equal(f.shared.length, 1);
    assert.equal(f.files.get(f.shared[0]!), f.backup);
    f.state.sharing = false;
    assert.equal(await f.api.sharePilotBackup(f.current), 'sharing-unavailable'); assert.equal(f.shared.length, 1);
    assert.equal(await f.current.backup(), f.backup); assert.equal(f.state.active, 'previous-library');
  } finally { await f.close(); }
});
