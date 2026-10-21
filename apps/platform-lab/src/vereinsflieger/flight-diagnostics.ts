import type { Bind, Connection, Driver } from '@moflight/local-data';
import { diagnosticJournal } from '../diagnostics';

type Counter = 'ownerGuard'|'sql'|'transaction'|'hash'|'databaseOpen';
type Totals = Record<Counter,{calls:number;milliseconds:number;failures:number}>;
const keys:Counter[]=['ownerGuard','sql','transaction','hash','databaseOpen'];
/** Fixed counters only: no SQL, parameters, filenames, IDs or source values. */
export class FlightDiagnostics {
  private totals=Object.fromEntries(keys.map(key=>[key,{calls:0,milliseconds:0,failures:0}])) as Totals;
  constructor(private readonly now=()=>performance.now()) {}
  snapshot():Totals {return JSON.parse(JSON.stringify(this.totals)) as Totals;}
  difference(before:Totals):Totals {
    return Object.fromEntries(keys.map(key=>[key,{calls:this.totals[key].calls-before[key].calls,
      milliseconds:this.totals[key].milliseconds-before[key].milliseconds,failures:this.totals[key].failures-before[key].failures}])) as Totals;
  }
  async measure<T>(key:Counter,work:()=>Promise<T>):Promise<T> {
    const start=this.now();this.totals[key].calls++;
    try{return await work();}catch(error){this.totals[key].failures++;throw error;}
    finally{this.totals[key].milliseconds+=this.now()-start;}
  }
  driver(db:Driver):Driver {
    const connection=(sql:Connection):Connection=>({
      exec:text=>this.measure('sql',()=>sql.exec(text)),
      run:(text,...params:Bind[])=>this.measure('sql',()=>sql.run(text,...params)),
      all:<T>(text:string,...params:Bind[])=>this.measure('sql',()=>sql.all<T>(text,...params)),
      first:<T>(text:string,...params:Bind[])=>this.measure('sql',()=>sql.first<T>(text,...params)),
    });
    return {...connection(db),close:()=>db.close(),transaction:work=>this.measure('transaction',()=>db.transaction(tx=>work(connection(tx))))};
  }
}
export const flightDiagnostics=new FlightDiagnostics();
export function startFlightSpan(name:string):(succeeded:boolean)=>void {
  const journalSpan=diagnosticJournal.span(name);
  const start=performance.now(),before=flightDiagnostics.snapshot();let finished=false;
  return succeeded=>{if(finished)return;finished=true;journalSpan(succeeded);console.info('MOFLIGHT_STORED_READ_STAGE '+JSON.stringify({name,milliseconds:performance.now()-start,succeeded,
    inclusiveCounters:flightDiagnostics.difference(before)}));};
}
export async function timeFlightStage<T>(name:string,work:()=>Promise<T>):Promise<T> {
  const finish=startFlightSpan(name);let succeeded=false;
  try{const result=await work();succeeded=true;return result;}finally{finish(succeeded);}
}
