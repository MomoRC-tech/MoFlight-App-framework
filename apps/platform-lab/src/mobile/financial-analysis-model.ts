import { projectExpenses } from '../expenses/expense-projection';
import type { ExpensePeriod, UnversionedExpenseSnapshot } from '../expenses/expense-types';
import type { FinancialEvidenceSnapshot } from '../vereinsflieger/expense-evidence-store';
import type { FinancialObservationReceipt } from '../vereinsflieger/expense-observation-store';
import { parseObservedEuro, parseObservedFinancialDate } from '../vereinsflieger/expense-money-observation';

export interface FinancialAnalysisData {
  snapshot:UnversionedExpenseSnapshot;
  evidence:FinancialEvidenceSnapshot[];
  receipts:FinancialObservationReceipt[];
}
export const expenseMonths=['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
/** Exact display at the same supported integer boundary as the calculator. */
export function expenseMoney(value:number|null):string {
  if(value===null||!Number.isSafeInteger(value))return '—';const n=BigInt(value),abs=n<0n?-n:n;
  return `${n<0n?'−':''}${(abs/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.')},${(abs%100n).toString().padStart(2,'0')} €`;
}
export function expenseDate(value:string|null){return value&&/^\d{4}-\d\d-\d\d$/.test(value)?`${value.slice(8)}.${value.slice(5,7)}.${value.slice(0,4)}`:'Datum unbekannt';}
export function expensePeriodLabel(period:ExpensePeriod){return period.mode==='year'?String(period.year):period.mode==='month'?`${expenseMonths[period.month-1]} ${period.year}`:`${expenseDate(period.from)} – ${expenseDate(period.through)}`;}
export function financialAnalysisView(data:FinancialAnalysisData,period:ExpensePeriod){
  const projection=projectExpenses(data.snapshot,data.snapshot.scope,period),latest=data.evidence.at(-1)??null;
  const inside=(raw:string)=>{const date=parseObservedFinancialDate(raw);return date.state==='value'&&date.date>=projection.period.from&&date.date<=projection.period.through;};
  const accounts=(latest?.ledgers??[]).map(item=>{const c=item.observation.capture;const date=c.columns.findIndex(column=>column.key==='date');const balance=c.columns.findIndex(column=>column.key==='balance');const rows=c.rows.filter(row=>inside(row.values[date]!));const last=rows.at(-1);const parsed=last?parseObservedEuro(last.values[balance],'EUR'):null;
    return {...item,rows,balanceMinor:parsed?.state==='value'?parsed.minorUnits:null,balanceDateRaw:last?.values[date]??null};});
  const statements=(latest?.summary.rows??[]).filter(row=>inside(row.dateRaw)).map(row=>{const parsed=parseObservedEuro(row.amountRaw,'EUR');return {...row,amountMinor:parsed.state==='value'?parsed.minorUnits:null};});
  const year=period.mode==='custom'?Number(period.from.slice(0,4)):period.year;
  const monthly=period.mode==='custom'?[]:expenseMonths.map((label,index)=>{const result=projectExpenses(data.snapshot,data.snapshot.scope,{mode:'month',year,month:index+1});return {label,month:index+1,year,knownMinor:result.flying.knownMinor,state:result.state};});
  return {projection,latest,accounts,statements,monthly,year};
}
