import assert from 'node:assert/strict';
import test from 'node:test';
import { closeSync, existsSync, openSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { reopenFinancialNativeProof, runFinancialNativeProof, type FinancialProofEnvironment } from '../../apps/platform-lab/src/development/financial-native-proof.ts';
import { nodeDriver } from './sqlite-driver.ts';

const hash = async (text: string) => createHash('sha256').update(text).digest('hex');
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'moflight-financial-proof-'));
  let sequence = 10, clock = 0; const state = { authorized: true, failWrite: '', opened: 0, closed: 0 };
  const path = (name: string) => { assert.match(name, /^[a-zA-Z0-9_.-]+$/); assert.ok(!name.includes('..')); return join(directory, name); };
  const env: FinancialProofEnvironment = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', hash,
    uuid: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`, clock: () => ++clock,
    exists: name => existsSync(path(name)), reserve(name) { if (!existsSync(path(name))) closeSync(openSync(path(name), 'wx')); },
    async open(name, create) {
      if (!existsSync(path(name)) && !create) return null;
      if (!existsSync(path(name))) closeSync(openSync(path(name), 'wx'));
      state.opened++; const db = nodeDriver(path(name)); return { ...db, async close() { state.closed++; await db.close(); } };
    },
    async read(name) { return existsSync(path(name)) ? readFile(path(name), 'utf8') : null; },
    async write(name, value) { if (name === state.failWrite) throw Error('Synthetic write interruption'); await writeFile(path(name), value); },
  };
  return { env, state, directory, gate: async () => { if (!state.authorized) throw Error('Synthetic scope revoked'); }, async close() {
    assert.equal(state.opened, state.closed, 'every native-style driver is closed');
    assert.equal(dirname(resolve(directory)), resolve(tmpdir())); await rm(directory, { recursive: true, force: true });
  } };
}

test('native financial proof executes production raw store/v4/selection/journal, preserves originals and reopens from disk', async () => {
  const f = await fixture(); try {
    const report = await runFinancialNativeProof(f.env, f.gate);
    assert.equal(report.state, 'passed', JSON.stringify(report)); assert.equal(report.checks.length, 8);
    assert.equal(report.samples.length, 10); assert.ok(report.samples.every(sample => sample.outcome === 'passed' && sample.elapsedMs > 0));
    assert.ok((await readdir(f.directory)).some(name => name.includes('-restore-')));
    await reopenFinancialNativeProof({ ...f.env }, f.gate);
    assert.equal(f.state.opened, f.state.closed);
  } finally { await f.close(); }
});

test('proof failure records the failed stage and preserves its partial synthetic files without publishing a checkpoint', async () => {
  const f = await fixture(); try {
    f.state.failWrite = 'archive.json'; const report = await runFinancialNativeProof(f.env, f.gate);
    assert.equal(report.state, 'failed'); assert.equal(report.samples.at(-1)?.stage, 'total');
    assert.equal(report.samples.find(sample => sample.stage === 'archive-file-roundtrip')?.outcome, 'failed');
    assert.ok((await readdir(f.directory)).length > 0); assert.equal(await f.env.read('checkpoint.json'), null);
    await assert.rejects(reopenFinancialNativeProof(f.env, f.gate), /unavailable/);
  } finally { await f.close(); }
});

test('offline reopen rejects changed archive/checkpoint/target and revoked authority without replacing any source', async () => {
  const f = await fixture(); try {
    assert.equal((await runFinancialNativeProof(f.env, f.gate)).state, 'passed');
    const archive = await f.env.read('archive.json'), checkpoint = await f.env.read('checkpoint.json'); assert.ok(archive && checkpoint);
    await f.env.write('archive.json', archive + ' '); await assert.rejects(reopenFinancialNativeProof(f.env, f.gate), /changed/);
    await f.env.write('archive.json', archive);
    await f.env.write('checkpoint.json', checkpoint.replace(f.env.id, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'));
    await assert.rejects(reopenFinancialNativeProof(f.env, f.gate), /Invalid/); await f.env.write('checkpoint.json', checkpoint);
    f.state.authorized = false; await assert.rejects(reopenFinancialNativeProof(f.env, f.gate), /revoked/);
    f.state.authorized = true; await reopenFinancialNativeProof(f.env, f.gate);
    assert.equal(await f.env.read('archive.json'), archive);
  } finally { await f.close(); }
});
