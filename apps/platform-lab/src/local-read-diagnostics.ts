import type { Bind, Connection, Driver } from '@moflight/local-data';

// Process-local ordinals only. Never retain SQL, paths, owner IDs, rows or raw errors.
type Stage = 'restore-gate' | 'registry-open' | 'session-open' | 'owner-check' | 'pending-command' | 'stored-view' | 'detail' | 'session-close';
type Kind = 'generic' | 'real-flight';
type Event = { connection: number; kind: Kind; operation: string; state: 'start' | 'success' | 'failed'; active: number; closing: boolean };
const recent: Event[] = [];
let sequence = 0;
export function localReadFailureCode(error: unknown): 'released-object' | 'operation-failed' {
  return error instanceof Error && error.message.includes('Cannot use shared object that was already released') ? 'released-object' : 'operation-failed';
}
function report(stage: string, error: unknown) {
  console.warn('MoFlight local-read diagnostic', JSON.stringify({ stage, code: localReadFailureCode(error), lifetime: recent }));
}
export async function traceLocalRead<T>(stage: Stage, work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (error) { report(stage, error); throw error; }
}
/** Observes existing ownership/scheduling only; never retries or alters admission. */
export function diagnoseLocalDriver(driver: Driver, kind: Kind): Driver {
  const id = ++sequence;
  let active = 0, closing = false;
  function event(operation: string, state: Event['state']) {
    recent.push({ connection: id, kind, operation, state, active, closing });
    if (recent.length > 48) recent.shift();
  }
  event('open', 'success');
  async function observe<T>(operation: string, work: () => Promise<T>): Promise<T> {
    active++; event(operation, 'start');
    try { const result = await work(); event(operation, 'success'); return result; }
    catch (error) { event(operation, 'failed'); report('database-' + operation, error); throw error; }
    finally { active--; }
  }
  function connection(value: Connection): Connection {
    return {
      exec: sql => observe('exec', () => value.exec(sql)),
      run: (sql, ...params) => observe('run', () => value.run(sql, ...params)),
      all: <T>(sql: string, ...params: Bind[]) => observe('all', () => value.all<T>(sql, ...params)),
      first: <T>(sql: string, ...params: Bind[]) => observe('first', () => value.first<T>(sql, ...params)),
    };
  }
  return { ...connection(driver),
    transaction: work => observe('transaction', () => driver.transaction(tx => work(connection(tx)))),
    close: () => {
      closing = true; active++; event('close', 'start');
      const result = driver.close();
      void result.then(() => { event('close', 'success'); active--; }, error => { event('close', 'failed'); active--; report('database-close', error); });
      return result;
    },
  };
}
