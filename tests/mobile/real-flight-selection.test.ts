import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { nodeDriver } from './sqlite-driver.ts';
import { RealFlightSelection, IndeterminateRealActivation, type RealSelectionAuthorization, type RealSelectionGate, type RealSelectionSnapshot } from '../../apps/platform-lab/src/vereinsflieger/real-flight-selection.ts';
import { realHistoryCandidateName, type RealHistoryManifest } from '../../apps/platform-lab/src/vereinsflieger/real-history-contract.ts';

const owner = '11111111-1111-4111-8111-111111111111', store = '22222222-2222-4222-8222-222222222222';
const id = (n: number) => `33333333-3333-4333-8333-${String(n).padStart(12,'0')}`;
const at = '2026-10-20T10:00:00.000Z';
const hash = async (text: string) => createHash('sha256').update(text).digest('hex');
const manifest: RealHistoryManifest = {singleton:1,family:'moflight-real-flight-history',schema_version:1,payload_version:1,owner_id:owner,store_id:store,created_at:at};
class Candidate {
  closed = false;
  constructor(readonly graph: RealSelectionSnapshot, readonly authorize: RealSelectionAuthorization, readonly gate?: RealSelectionGate,
    readonly afterSnapshot?: () => void) {}
  async snapshot() {
    if (this.closed || !this.authorize()) throw new Error('Unavailable candidate');
    await this.gate?.(false);
    const snapshot = structuredClone(this.graph); this.afterSnapshot?.(); return snapshot;
  }
  async write() { await this.gate?.(true); if (!this.authorize()?.writable) throw new Error('Read-only candidate'); }
  async close() { this.closed = true; }
}
async function fixture(fault: (stage: string) => Promise<void> = async () => {}) {
  const db = nodeDriver(':memory:');
  let permit: {ownerId:string;storeId:string;leaseId:string;writable:boolean} | null = {ownerId:owner,storeId:store,leaseId:'lease-one',writable:true};
  let expireAfterAuthorize = false, expireAtOpenIndex = -1;
  const authorize: RealSelectionAuthorization = () => {
    const current = permit;
    if (expireAfterAuthorize) { expireAfterAuthorize = false; permit = null; }
    return current;
  };
  const files = new Map<string,RealSelectionSnapshot>();
  const opened: Candidate[] = [];
  const opener = async (name: string, auth: RealSelectionAuthorization, gate?: RealSelectionGate) => {
    const graph = files.get(name); if (!graph) throw new Error('Missing or unreadable retained candidate');
    const expire = opened.length === expireAtOpenIndex ? () => { expireAfterAuthorize = true; } : undefined;
    const candidate = new Candidate(graph,auth,gate,expire); opened.push(candidate); return candidate;
  };
  const journal = await RealFlightSelection.open(db,owner,store,authorize,opener,hash,true,fault);
  function file(n: number, receipts: unknown[] = []) {
    const name = realHistoryCandidateName(id(n)); files.set(name,{manifest:{...manifest},generation:receipts.length,receipts}); return name;
  }
  return {db,journal,authorize,opener,files,opened,file,expireAfterNextFinalCheck:()=>{expireAtOpenIndex=opened.length+1;},
    switchOwner:()=>{permit={ownerId:id(99),storeId:store,leaseId:'lease-two',writable:true};},revoke:()=>{permit=null;}};
}

test('explicit validated activation selects a candidate; exact retry reuses one durable selection', async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.journal.select(),/No active/);
    const name = f.file(1,[{receipt:'one'}]);
    assert.equal(await f.journal.activate(id(11),name,null,at),1);
    assert.equal(await f.journal.activate(id(11),name,null,at),1);
    const selected = await f.journal.select();
    assert.equal(selected.name,name); assert.equal(selected.sequence,1); assert.equal(selected.recoveryRequired,false); assert.equal(selected.warning,null);
    await selected.candidate.write(); await selected.candidate.close();
    assert.equal((await f.db.first<{n:number}>('SELECT count(*) AS n FROM real_history_selection'))?.n,1);
    await assert.rejects(f.journal.activate(id(11),name,null,'2026-10-20T11:00:00.000Z'),/reused/);
  } finally { await f.journal.close(); }
});

test('foreign identity, unsafe names and missing files preserve the active selection', async () => {
  const f = await fixture();
  try {
    const name = f.file(1); await f.journal.activate(id(11),name,null,at);
    const foreign = f.file(2); f.files.get(foreign)!.manifest = {...manifest,owner_id:id(98)};
    await assert.rejects(f.journal.activate(id(12),foreign,1,at),/Foreign/);
    await assert.rejects(f.journal.activate(id(12),'../'+name,1,at),/basename/);
    await assert.rejects(f.journal.activate(id(12),realHistoryCandidateName(id(3)),1,at),/Missing/);
    assert.equal((await f.journal.select()).sequence,1); assert.equal(f.files.size,2);
    f.switchOwner(); const before = f.opened.length;
    await assert.rejects(f.journal.select(),/foreign/); assert.equal(f.opened.length,before);
  } finally { await f.journal.close(); }
});

test('activation IDs cannot be replayed across owners and collisions reject before opening that owner candidate', async () => {
  const f = await fixture();
  let other: RealFlightSelection<Candidate> | undefined;
  try {
    const firstName = f.file(1); await f.journal.activate(id(11),firstName,null,at);
    const otherOwner = id(90), otherStore = id(91), otherName = realHistoryCandidateName(id(92));
    const otherManifest = {...manifest,owner_id:otherOwner,store_id:otherStore};
    let otherOpens = 0;
    const otherPermit = {ownerId:otherOwner,storeId:otherStore,leaseId:'other-lease',writable:true};
    const otherAuthorize: RealSelectionAuthorization = () => otherPermit;
    const otherOpener = async (name: string, authorize: RealSelectionAuthorization, gate?: RealSelectionGate) => {
      otherOpens++;
      assert.equal(name,otherName);
      return new Candidate({manifest:otherManifest,generation:0,receipts:[]},authorize,gate);
    };
    other = await RealFlightSelection.open(f.db,otherOwner,otherStore,otherAuthorize,otherOpener,hash);
    await assert.rejects(other.activate(id(11),otherName,null,at),/Activation ID already belongs/);
    assert.equal(otherOpens,0);
    assert.equal((await f.db.first<{n:number}>('SELECT count(*) AS n FROM real_history_selection'))?.n,1);
    assert.equal(await f.journal.activate(id(11),firstName,null,at),1);
  } finally {
    await f.journal.close();
  }
});

test('journal transaction failure preserves predecessor and uncertain commit resolves its original activation ID', async () => {
  let stage = '';
  const f = await fixture(async s => { if (s === stage) throw new Error('Injected interruption'); });
  try {
    const one = f.file(1), two = f.file(2,[{receipt:'new'}]);
    await f.journal.activate(id(11),one,null,at);
    stage = 'after-selection-write'; await assert.rejects(f.journal.activate(id(12),two,1,at),/Injected/);
    assert.equal((await f.journal.select()).sequence,1);
    stage = 'after-selection-commit'; await assert.rejects(f.journal.activate(id(12),two,1,at),IndeterminateRealActivation);
    stage = ''; assert.equal(await f.journal.activate(id(12),two,1,at),2);
    assert.equal((await f.journal.select()).sequence,2);
  } finally { await f.journal.close(); }
});

test('missing newest candidate visibly falls back read-only without deleting either retained record', async () => {
  const f = await fixture();
  try {
    const one = f.file(1,[{receipt:'one'}]), two = f.file(2,[{receipt:'one'},{receipt:'two'}]);
    await f.journal.activate(id(11),one,null,at); await f.journal.activate(id(12),two,1,at); f.files.delete(two);
    const result = await f.journal.select();
    assert.equal(result.name,one); assert.equal(result.recoveryRequired,true); assert.ok(result.warning);
    await assert.rejects(result.candidate.write(),/recovery|Read-only/); await result.candidate.close();
    assert.equal((await f.db.first<{n:number}>('SELECT count(*) AS n FROM real_history_selection'))?.n,2);
    f.files.delete(one); await assert.rejects(f.journal.select(),/No readable/);
  } finally { await f.journal.close(); }
});

test('rollback preserves newer receipts and disables writes/replay on older history', async () => {
  const f = await fixture();
  try {
    const one = f.file(1,[{receipt:'one'}]), two = f.file(2,[{receipt:'one'},{receipt:'two'}]);
    await f.journal.activate(id(11),one,null,at); await f.journal.activate(id(12),two,1,at);
    const oldHandle = await f.journal.select(); await f.journal.activate(id(13),one,2,at);
    await assert.rejects(oldHandle.candidate.write(),/changed/); await oldHandle.candidate.close();
    const rollback = await f.journal.select(); assert.equal(rollback.name,one); assert.equal(rollback.recoveryRequired,true);
    await assert.rejects(rollback.candidate.write(),/recovery|Read-only/); await rollback.candidate.close(); assert.equal(f.files.size,2);
  } finally { await f.journal.close(); }
});

test('selection must close the reopened candidate when the owner lease expires before publication', async () => {
  const f = await fixture();
  try {
    const name = f.file(1); await f.journal.activate(id(11),name,null,at);
    f.expireAfterNextFinalCheck();
    await assert.rejects(f.journal.select(),/Expired or foreign/);
    assert.equal(f.opened.at(-1)?.closed,true);
  } finally { await f.journal.close(); }
});

test('selection predecessor is immediate within its owner/store chain and malformed history is rejected on open', async () => {
  const f = await fixture();
  try {
    const one = f.file(1), two = f.file(2);
    await f.journal.activate(id(11),one,null,at); await f.journal.activate(id(12),two,1,at);
    const insert = 'INSERT INTO real_history_selection(owner_id,store_id,candidate_name,manifest_sha256,validated_generation,activation_id,previous_seq,activated_at) VALUES (?,?,?,?,?,?,?,?)';
    const row = [owner,store,realHistoryCandidateName(id(3)),'0'.repeat(64),0,id(13),1,at] as const;
    await assert.rejects(f.db.run(insert,...row),/predecessor/);

    const trigger = await f.db.first<{sql:string}>("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='real_selection_valid_predecessor'");
    assert.ok(trigger?.sql);
    await f.db.exec('DROP TRIGGER real_selection_valid_predecessor');
    await f.db.run(insert,...row);
    await f.db.exec(trigger.sql);
    await assert.rejects(RealFlightSelection.open(f.db,owner,store,f.authorize,f.opener,hash),/predecessor/);
  } finally { await f.journal.close(); }
});

test('open refuses unsupported journal schema without rewriting data; replacement cannot bypass immutability', async () => {
  const f = await fixture();
  try {
    const one = f.file(1); await f.journal.activate(id(11),one,null,at);
    await assert.rejects(f.db.exec('DELETE FROM real_history_selection'),/Append-only/);
    await assert.rejects(f.db.exec('UPDATE real_history_selection SET seq=seq'),/Append-only/);
    await f.db.exec('PRAGMA recursive_triggers=OFF;');
    await assert.rejects(f.db.exec('INSERT OR REPLACE INTO real_history_selection SELECT * FROM real_history_selection'),/collision/);
    await f.db.exec('PRAGMA user_version=2;');
    await assert.rejects(RealFlightSelection.open(f.db,owner,store,f.authorize,f.opener,hash),/Unsupported/);
    assert.equal((await f.db.first<{n:number}>('SELECT count(*) AS n FROM real_history_selection'))?.n,1);
    await assert.rejects(RealFlightSelection.open(f.db,owner,store,f.authorize,f.opener,hash,true),/preserved/);
  } finally { await f.journal.close(); }
});
