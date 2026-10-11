import { canonical } from '@moflight/flight-logbook';
import type { Connection } from '@moflight/local-data';
import { validateContext, sameContext, type ObservedContext } from './context';
import { validateCapture, type ProbeSnapshot } from './probe';
import { decodeDetail, detailReference, type DetailObservation } from './details';
export interface CaptureRun { version: 1; id: string; revision: number; context: ObservedContext; list: ProbeSnapshot; listCoverage: 'bounded-visible-list'; detailScope: string[]; details: DetailObservation[]; stop: 'none' | 'session-required' | 'unsupported-detail' | 'context-changed'; }
const url = (id: string) => `https://vereinsflieger.de/member/profile/viewflight.php?flid=${id}`;
export function createRun(id: string, context: ObservedContext, list: ProbeSnapshot): CaptureRun {
  const snapshot = validateCapture(list), c = validateContext(context); if (!/^[a-zA-Z0-9-]{1,100}$/.test(id)) throw new Error('Invalid capture run identity');
  const detailScope = [...new Set(snapshot.rows.map(r=>r.sourceFlightId).filter((id): id is string=>!!id))].slice(0,3);
  return { version:1,id,revision:1,context:c,list:snapshot,listCoverage:'bounded-visible-list',detailScope,details:[],stop:'none' };
}
export function validateRun(value: unknown): CaptureRun {
  if (!value || typeof value !== 'object') throw new Error('Invalid capture checkpoint'); const r = value as CaptureRun;
  const expected = createRun(r.id, r.context, r.list);
  if (r.version !== 1 || !Number.isSafeInteger(r.revision) || r.revision < 1 || r.listCoverage !== expected.listCoverage || canonical(r.detailScope) !== canonical(expected.detailScope) || !Array.isArray(r.details) || r.details.length > 3 || !['none','session-required','unsupported-detail','context-changed'].includes(r.stop)) throw new Error('Invalid capture checkpoint metadata');
  const seen = new Set<string>(); const details = r.details.map(d => { if (!d || !r.detailScope.includes(d.sourceFlightId) || seen.has(d.sourceFlightId) || d.sourceIdentity !== 'unverified' || d.costs !== 'not-captured' || !Number.isFinite(Date.parse(d.retrievedAt))) throw new Error('Foreign or repeated detail'); seen.add(d.sourceFlightId); return decodeDetail({ url:url(d.sourceFlightId), fields:d.fields },url(d.sourceFlightId),d.retrievedAt); });
  return { ...expected,revision:r.revision,details,stop:r.stop };
}
export function nextDetail(run: CaptureRun, observed: ObservedContext, freshList: ProbeSnapshot): string | null {
  const r=validateRun(run); if (!sameContext(r.context,validateContext(observed))) throw new Error('Provider context changed; checkpoint retained');
  const fresh=validateCapture(freshList); const next = r.detailScope.find(id=>!r.details.some(d=>d.sourceFlightId===id));
  if (!next) return null; if (!fresh.rows.some(row=>row.sourceFlightId===next)) throw new Error('Pending detail no longer appears in fresh own-flight list; checkpoint retained'); return url(next);
}
export function completeDetail(run: CaptureRun, observed: ObservedContext, expectedUrl: string, payload: unknown, at: string): CaptureRun {
  const r=validateRun(run); if(!sameContext(r.context,validateContext(observed))) return {...r,revision:r.revision+1,stop:'context-changed'};
  const id=detailReference(expectedUrl); if(!id || !r.detailScope.includes(id) || r.details.some(d=>d.sourceFlightId===id)) throw new Error('Unexpected or already completed detail');
  try { const d=decodeDetail(payload,expectedUrl,at); return {...r,revision:r.revision+1,details:[...r.details,d],stop:'none'}; }
  catch {return {...r,revision:r.revision+1,stop:payload&&typeof payload==='object'&&(payload as {error?:unknown}).error==='session-required'?'session-required':'unsupported-detail'};}
}
export const RUN_SCHEMA = 'CREATE TABLE IF NOT EXISTS capture_runs(id TEXT NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(id,revision));';
export async function persistRun(db: Connection, value: CaptureRun) {
  const r=validateRun(value), bytes=canonical(r); const old=await db.first<{revision:number;payload:string}>('SELECT revision,payload FROM capture_runs WHERE id=? ORDER BY revision DESC LIMIT 1',r.id);
  if(old?.revision===r.revision && old.payload===bytes)return;
  if(r.revision!==(old?.revision??0)+1)throw new Error('Stale capture checkpoint');
  if(old) { const previous=validateRun(JSON.parse(old.payload)); if(canonical(previous.context)!==canonical(r.context)||canonical(previous.list)!==canonical(r.list)||previous.details.some(d=>!r.details.some(next=>canonical(next)===canonical(d)))) throw new Error('Earlier capture evidence cannot be replaced'); }
  // SQLite serializes this compare-and-append without a network transaction.
  await db.run('INSERT INTO capture_runs SELECT ?,?,? WHERE coalesce((SELECT max(revision) FROM capture_runs WHERE id=?),0)=?',r.id,r.revision,bytes,r.id,r.revision-1);
  const stored=await db.first<{payload:string}>('SELECT payload FROM capture_runs WHERE id=? AND revision=?',r.id,r.revision); if(stored?.payload!==bytes)throw new Error('Capture checkpoint conflict');
}
export async function latestRun(db: Connection): Promise<CaptureRun|null> { const row=await db.first<{id:string;revision:number;payload:string}>('SELECT id,revision,payload FROM capture_runs ORDER BY rowid DESC LIMIT 1');if(!row)return null;const r=validateRun(JSON.parse(row.payload));if(r.id!==row.id||r.revision!==row.revision)throw new Error('Capture checkpoint identity mismatch');return r; }
