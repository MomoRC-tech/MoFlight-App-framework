import { canonical } from '@moflight/flight-logbook';
import type { Driver, Hash } from '@moflight/local-data';
import { validateFinancialObservationTarget, type FinancialObservationReceipt } from './expense-observation-store';
import type { FinancialObservationTarget } from './expense-ledger-observation';
import { validateFinancialSourcePages, validateDurableInvoiceBookingEvidence, type DurableInvoiceBookingEvidence } from './expense-projection-adapter';
import type { FlightBillingObservation } from './expense-flight-billing';
import { decodeFinancialCollectionCheckpoint, encodeFinancialCollectionCheckpoint, validateFinancialCollectionCheckpoint,
  validateFinancialEvidenceSnapshot, type FinancialCollectionCheckpoint } from './expense-collection-checkpoint';
export { validateFinancialEvidenceSnapshot } from './expense-collection-checkpoint';
export type { FinancialCollectionCheckpoint } from './expense-collection-checkpoint';

export interface FinancialEvidenceSnapshot {
  version: 1; id: string; target: FinancialObservationTarget; retrievedAt: string; ownRecipientLabel: string;
  contextBefore: FinancialObservationTarget['scope']['context']; contextAfter: FinancialObservationTarget['scope']['context'];
  selection: { sourceFlightRefs: string[]; source: 'verified-own-flight-library' };
  sources: { sourceFlightRef: string; sourceHash: string }[];
  unknown: { sourceFlightRef: string; reason: 'unbilled' | 'unavailable' }[];
  summary: DurableInvoiceBookingEvidence['summary']; ledgers: DurableInvoiceBookingEvidence['ledgers'];
}
export const FINANCIAL_EVIDENCE_FORMAT = 'moflight-financial-evidence-backup';
const LIMIT = 64 * 1024 * 1024;
const copy = <T>(v: T): T => JSON.parse(canonical(v)) as T;
const bytes = (text: string) => new TextEncoder().encode(text).length;
const sha = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
function exact(v: unknown, keys: string[]) {
  if (!v || typeof v !== 'object' || Array.isArray(v) || canonical(Object.keys(v).sort()) !== canonical(keys.sort())) throw Error('Unsupported financial evidence fields.');
}
function id(value: unknown) { if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw Error('Invalid financial evidence identity.'); }
function at(value: string) { if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || new Date(value).toISOString() !== value) throw Error('Invalid financial evidence timestamp.'); }
function flight(value: unknown) { if (typeof value !== 'string' || !/^\d{1,20}$/.test(value)) throw Error('Invalid observed financial flight reference.'); }
export async function encodeFinancialEvidence(target: FinancialObservationTarget, snapshots: FinancialEvidenceSnapshot[], hash: Hash): Promise<string> {
  target = validateFinancialObservationTarget(target);
  const ids = new Set<string>();
  const checked = snapshots.map(value => { const result = validateFinancialEvidenceSnapshot(value,target); if (ids.has(result.id)) throw Error('Repeated financial evidence snapshot.'); ids.add(result.id); return result; });
  const payload = canonical({version:1,target,snapshots:checked}), checksum = await hash(payload);
  if (!sha(checksum) || new TextEncoder().encode(payload).length > LIMIT) throw Error('Financial evidence archive exceeds its bound.');
  return canonical({format:FINANCIAL_EVIDENCE_FORMAT,version:1,payload,checksum});
}
export async function decodeFinancialEvidence(text: string, target: FinancialObservationTarget, hash: Hash): Promise<FinancialEvidenceSnapshot[]> {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > LIMIT) throw Error('Financial evidence archive exceeds its bound.');
  const e = JSON.parse(text); exact(e,['format','version','payload','checksum']);
  if (e.format !== FINANCIAL_EVIDENCE_FORMAT || e.version !== 1 || typeof e.payload !== 'string' || !sha(e.checksum) || await hash(e.payload) !== e.checksum || canonical(e) !== text) throw Error('Corrupt financial evidence archive.');
  const p = JSON.parse(e.payload); exact(p,['version','target','snapshots']);
  if (p.version !== 1 || canonical(validateFinancialObservationTarget(p.target)) !== canonical(target) || !Array.isArray(p.snapshots) || p.snapshots.length > 10_000 || canonical(p) !== e.payload) throw Error('Foreign financial evidence archive.');
  if (await encodeFinancialEvidence(target,p.snapshots,hash) !== text) throw Error('Unsupported financial evidence archive.');
  return copy(p.snapshots);
}

/** Separate append-only sidecar: existing raw v1 SQLite bytes/formats are never
 * migrated or reinterpreted. Candidate filenames bind it to raw selection. */
export class FinancialEvidenceStore {
  private readonly identity: string;
  private queue: Promise<void> = Promise.resolve();
  constructor(readonly db: Driver, target: FinancialObservationTarget, private readonly hash: Hash, private readonly gate: () => Promise<void>) { this.identity = canonical(validateFinancialObservationTarget(target)); }
  get target() { return JSON.parse(this.identity) as FinancialObservationTarget; }
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work); this.queue = run.then(() => {}, () => {}); return run;
  }
  private async manifest() {
    await this.gate(); const row = await this.db.first<{target:string}>('SELECT target FROM financial_evidence_manifest WHERE singleton=1');
    if (row?.target !== this.identity) throw Error('Foreign financial evidence store.');
  }
  async initialize(create = false) {
    await this.gate(); await this.db.exec('PRAGMA synchronous=FULL;');
    await this.db.transaction(async tx => {
      const v = await tx.first<{user_version:number}>('PRAGMA user_version');
      if (v?.user_version === 0) {
        if (!create || (await tx.all("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'")).length) throw Error('Uninitialized financial evidence store.');
        await tx.exec(`CREATE TABLE financial_evidence_manifest(singleton INTEGER PRIMARY KEY CHECK(singleton=1),target TEXT NOT NULL);
CREATE TABLE financial_evidence_snapshots(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,payload TEXT NOT NULL,checksum TEXT NOT NULL);
CREATE TABLE financial_evidence_jobs(id TEXT PRIMARY KEY,payload TEXT NOT NULL,status TEXT NOT NULL);
CREATE TRIGGER financial_evidence_no_update BEFORE UPDATE ON financial_evidence_snapshots BEGIN SELECT RAISE(ABORT,'Immutable financial evidence'); END;
CREATE TRIGGER financial_evidence_no_delete BEFORE DELETE ON financial_evidence_snapshots BEGIN SELECT RAISE(ABORT,'Immutable financial evidence'); END;
PRAGMA user_version=1;`);
        await tx.run('INSERT INTO financial_evidence_manifest VALUES (1,?)',this.identity);
      } else if (v?.user_version !== 1) throw Error('Unsupported financial evidence store.');
    }); await this.manifest();
  }
  async prepare(idValue: string, selection: FinancialEvidenceSnapshot['selection'], atValue: string) {
    id(idValue); at(atValue); selection = copy(selection);
    if (selection.source !== 'verified-own-flight-library' || !Array.isArray(selection.sourceFlightRefs) || selection.sourceFlightRefs.length > 500 || new Set(selection.sourceFlightRefs).size !== selection.sourceFlightRefs.length) throw Error('Invalid financial collection selection.');
    selection.sourceFlightRefs.forEach(flight);
    return this.serial(async () => {
      await this.manifest(); const payload = canonical({target:this.target,selection,at:atValue});
      await this.db.transaction(async tx => { await this.gate(); const prior = await tx.first<{payload:string}>('SELECT payload FROM financial_evidence_jobs WHERE id=?',idValue);
        if (prior && prior.payload !== payload) throw Error('Financial collection selection changed.');
        if (!prior) await tx.run("INSERT INTO financial_evidence_jobs VALUES (?,?,'prepared')",idValue,payload); await this.gate(); });
    });
  }
  private assertCheckpointCompletedBy(value: FinancialEvidenceSnapshot, checkpoint: FinancialCollectionCheckpoint) {
    const refs = checkpoint.selection.sourceFlightRefs;
    const checkpointRefs = checkpoint.batches.flatMap(batch => batch.snapshot.selection.sourceFlightRefs);
    if (canonical(value.target) !== canonical(checkpoint.target) || canonical(value.selection) !== canonical(checkpoint.selection) ||
        canonical(checkpointRefs) !== canonical(refs) || (!refs.length && checkpoint.batches.length !== 1)) {
      throw Error('Financial collection checkpoint is incomplete or differs from the saved snapshot.');
    }
    const last = checkpoint.batches.at(-1)?.snapshot;
    if (!last || value.retrievedAt !== last.retrievedAt || value.ownRecipientLabel !== last.ownRecipientLabel ||
        canonical(value.contextBefore) !== canonical(last.contextBefore) || canonical(value.contextAfter) !== canonical(last.contextAfter) ||
        canonical(value.summary) !== canonical(last.summary) || canonical(value.ledgers) !== canonical(last.ledgers)) {
      throw Error('Financial collection final pages differ from the last checkpoint batch.');
    }
    const order = new Map(refs.map((ref, index) => [ref, index]));
    const sortBySelection = <T extends { sourceFlightRef: string }>(items: T[]) => [...items].sort((left, right) => order.get(left.sourceFlightRef)! - order.get(right.sourceFlightRef)!);
    const expectedSources = sortBySelection(checkpoint.batches.flatMap(batch => batch.snapshot.sources));
    const actualSources = sortBySelection(value.sources);
    const expectedUnknown = sortBySelection(checkpoint.batches.flatMap(batch => batch.snapshot.unknown));
    const actualUnknown = sortBySelection(value.unknown);
    if (canonical(actualSources) !== canonical(expectedSources) || canonical(actualUnknown) !== canonical(expectedUnknown)) {
      throw Error('Financial collection inventory differs from its checkpoint.');
    }
  }
  /** Return the single incomplete checkpoint for this exact ordered source selection. */
  async pendingCollection(refs: readonly string[]): Promise<FinancialCollectionCheckpoint | null> {
    if (!Array.isArray(refs) || refs.length > 500 || new Set(refs).size !== refs.length) throw Error('Invalid financial collection selection.');
    refs.forEach(flight);
    const selection = { source: 'verified-own-flight-library' as const, sourceFlightRefs: [...refs] };
    return this.serial(async () => {
      await this.manifest(); let result: FinancialCollectionCheckpoint | null = null;
      await this.db.transaction(async tx => {
        await this.gate();
        const rows = await tx.all<{id:string;payload:string}>('SELECT id,payload FROM financial_evidence_jobs WHERE status=\'collecting\' ORDER BY rowid');
        if (rows.length > 10_000) throw Error('Financial collection checkpoint history limit reached.');
        for (const row of rows) {
          id(row.id);
          const checkpoint = await decodeFinancialCollectionCheckpoint(row.payload, this.target, this.hash);
          if (checkpoint.id !== row.id) throw Error('Financial collection checkpoint identity conflict.');
          if (canonical(checkpoint.selection) !== canonical(selection)) continue;
          if (result) throw Error('Ambiguous matching financial collection checkpoints.');
          result = checkpoint;
        }
        await this.gate();
      });
      await this.manifest(); return result ? copy(result) : null;
    });
  }
  /** Persist an immutable prefix journal. Replays of the same value are safe;
   * an existing batch can never be replaced or branched. */
  async checkpointCollection(value: FinancialCollectionCheckpoint): Promise<void> {
    const detached = copy(value), checked = await validateFinancialCollectionCheckpoint(detached, this.target, this.hash);
    const payload = await encodeFinancialCollectionCheckpoint(checked, this.target, this.hash);
    return this.serial(async () => {
      await this.manifest();
      await this.db.transaction(async tx => {
        await this.gate();
        const prior = await tx.first<{payload:string;status:string}>('SELECT payload,status FROM financial_evidence_jobs WHERE id=?',checked.id);
        const otherRows = await tx.all<{id:string;payload:string}>('SELECT id,payload FROM financial_evidence_jobs WHERE status=\'collecting\' AND id<>? ORDER BY rowid',checked.id);
        if (otherRows.length > 10_000) throw Error('Financial collection checkpoint history limit reached.');
        for (const row of otherRows) {
          const other = await decodeFinancialCollectionCheckpoint(row.payload, this.target, this.hash);
          if (other.id !== row.id) throw Error('Financial collection checkpoint identity conflict.');
          if (canonical(other.selection) === canonical(checked.selection)) throw Error('Ambiguous matching financial collection checkpoints.');
        }
        if (!prior) {
          if (checked.batches.length !== 0) throw Error('Start a financial collection with an empty checkpoint skeleton.');
          const snapshot = await tx.first<{id:string}>('SELECT id FROM financial_evidence_snapshots WHERE id=?',checked.id);
          if (snapshot) throw Error('Financial collection identity already has saved evidence.');
          await tx.run("INSERT INTO financial_evidence_jobs(id,payload,status) VALUES (?,?, 'collecting')",checked.id,payload);
        } else if (prior.status === 'collecting') {
          const current = await decodeFinancialCollectionCheckpoint(prior.payload, this.target, this.hash);
          if (current.id !== checked.id || canonical(current.target) !== canonical(checked.target) ||
              canonical(current.selection) !== canonical(checked.selection) || current.startedAt !== checked.startedAt ||
              current.batches.length > checked.batches.length || current.batches.some((batch,index) => canonical(batch) !== canonical(checked.batches[index]))) {
            throw Error('Financial collection checkpoint is not an append-only prefix.');
          }
          if (canonical(current) !== canonical(checked)) {
            if (checked.batches.length !== current.batches.length + 1) throw Error('Financial collection checkpoint must append one batch at a time.');
            await tx.run('UPDATE financial_evidence_jobs SET payload=? WHERE id=? AND status=\'collecting\'',payload,checked.id);
          }
        } else if (prior.status === 'complete') {
          const current = await decodeFinancialCollectionCheckpoint(prior.payload, this.target, this.hash);
          if (canonical(current) !== canonical(checked)) throw Error('Completed financial collection cannot be resumed or changed.');
        } else {
          throw Error('Financial collection identity collides with a legacy or unsupported job.');
        }
        await this.gate();
      });
      await this.manifest();
    });
  }
  async save(value: FinancialEvidenceSnapshot) {
    const held = validateFinancialEvidenceSnapshot(value,this.target), payload = canonical(held), checksum = await this.hash(payload);
    if (!sha(checksum)) throw Error('Financial evidence hashing unavailable.'); await this.manifest();
    return this.serial(async () => {
      await this.db.transaction(async tx => {
        await this.gate(); const prior = await tx.first<{payload:string;checksum:string}>('SELECT payload,checksum FROM financial_evidence_snapshots WHERE id=?',held.id);
        if (prior && (prior.payload !== payload || prior.checksum !== checksum)) throw Error('Financial evidence identity conflict.');
        const job = await tx.first<{payload:string;status:string}>('SELECT payload,status FROM financial_evidence_jobs WHERE id=?',held.id);
        if (job?.status === 'collecting') {
          const checkpoint = await decodeFinancialCollectionCheckpoint(job.payload, this.target, this.hash);
          if (checkpoint.id !== held.id) throw Error('Financial collection identity conflict.');
          this.assertCheckpointCompletedBy(held, checkpoint);
        }
        if (!prior) await tx.run('INSERT INTO financial_evidence_snapshots(id,payload,checksum) VALUES (?,?,?)',held.id,payload,checksum);
        await tx.run("UPDATE financial_evidence_jobs SET status='complete' WHERE id=?",held.id); await this.gate();
      }); await this.manifest();
    });
  }
  async snapshots() {
    await this.manifest(); const rows = await this.db.all<{id:string;payload:string;checksum:string}>('SELECT id,payload,checksum FROM financial_evidence_snapshots ORDER BY seq');
    if (rows.length > 10_000) throw Error('Financial evidence history limit reached.'); const result:FinancialEvidenceSnapshot[]=[];
    for (const row of rows) { if (!sha(row.checksum) || await this.hash(row.payload) !== row.checksum) throw Error('Corrupt financial evidence snapshot.'); const value=validateFinancialEvidenceSnapshot(JSON.parse(row.payload),this.target); if(value.id!==row.id||canonical(value)!==row.payload)throw Error('Invalid financial evidence identity.'); result.push(value); }
    await this.manifest(); return result;
  }
  async exportBackup() { return encodeFinancialEvidence(this.target,await this.snapshots(),this.hash); }
  async inventory(){await this.manifest();const rows=await this.db.all<{id:string;seq:number;checksum:string}>('SELECT id,seq,checksum FROM financial_evidence_snapshots ORDER BY seq');if(rows.length>10000)throw Error('Financial evidence inventory limit.');let prior=0;for(const row of rows){id(row.id);if(!sha(row.checksum)||!Number.isSafeInteger(row.seq)||row.seq<=prior)throw Error('Corrupt financial evidence inventory.');prior=row.seq;}await this.manifest();return rows;}
  async restoreBackup(text:string) {
    const snapshots=await decodeFinancialEvidence(text,this.target,this.hash); const current=await this.snapshots();
    if(current.length){if(canonical(current)!==canonical(snapshots))throw Error('Financial evidence restore requires an empty candidate.');return;}
    await this.db.transaction(async tx=>{await this.gate();for(const value of snapshots){const payload=canonical(value),checksum=await this.hash(payload);await tx.run('INSERT INTO financial_evidence_snapshots(id,payload,checksum) VALUES (?,?,?)',value.id,payload,checksum);}await this.gate();});
    if(await this.exportBackup()!==text)throw Error('Financial evidence candidate readback failed.');
  }
}

/** Merge equal raw witnesses, retain every differing variant. No capture time
 * wins. Bundle references are backed by the entire checksummed sidecar. */
export async function financialProofsFor(target: FinancialObservationTarget, snapshots: FinancialEvidenceSnapshot[], receipts: FinancialObservationReceipt[], hash: Hash): Promise<DurableInvoiceBookingEvidence[]> {
  snapshots=snapshots.map(value=>validateFinancialEvidenceSnapshot(value,target)); const result:DurableInvoiceBookingEvidence[]=[];
  const bundle=(await hash(canonical(snapshots.map(value=>value.id)))).slice(0,40);
  for(const receipt of receipts){
    if(receipt.kind!=='billed-flight')throw Error('Financial proof requires a billed receipt.'); const value=receipt.value as FlightBillingObservation;
    const sourceHash=await hash(canonical(value.source)); const relevant=snapshots.filter(snapshot=>snapshot.ownRecipientLabel===value.ownRecipientLabel&&snapshot.sources.some(source=>source.sourceFlightRef===value.source.sourceFlightId&&source.sourceHash===sourceHash));
    if(!relevant.length)continue;
    const refs=value.source.lines.map(line=>/^(\d{1,20}) - .+$/u.exec(line.descriptionRaw.trim())?.[1]); if(refs.some(ref=>!ref)||new Set(refs).size!==1)continue;
    const rows=new Map<string,DurableInvoiceBookingEvidence['summary']['rows'][number]>(),ledgers=new Map<string,DurableInvoiceBookingEvidence['ledgers'][number]>();
    for(const snapshot of relevant){
      for(const row of snapshot.summary.rows.filter(row=>row.numberRaw.trim()===refs[0])){const {position:_,...data}=row;rows.set(canonical(data),row);}
      for(const item of snapshot.ledgers){const {id:_,retrievedAt:__,...capture}=item.observation.capture;const {evidenceRef:___,...rest}=item;const key=canonical({...rest,observation:{...item.observation,capture}});if(!ledgers.has(key))ledgers.set(key,item);}
    }
    if(rows.size>20||ledgers.size>20)throw Error('Financial link history needs explicit review; originals are retained.');
    const summary={...relevant[0]!.summary,evidenceRef:`summary-${bundle}`,rows:[...rows.values()].map((row,position)=>({...row,position})),coverage:{kind:'visible-page' as const,truncated:true,pagination:'unverified' as const}};
    const proof:DurableInvoiceBookingEvidence={version:1,target,billedReceiptId:receipt.id,billedChecksum:receipt.checksum,sourceFlightRef:value.source.sourceFlightId,summary,ledgers:[...ledgers.values()].map((item,index)=>({...item,evidenceRef:`ledger-${bundle}-${index}`}))};
    result.push(validateDurableInvoiceBookingEvidence(proof,receipt,target));
  }return result;
}
