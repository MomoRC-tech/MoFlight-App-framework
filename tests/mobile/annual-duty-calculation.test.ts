import test from 'node:test';
import assert from 'node:assert/strict';
import { annualDutyCalculation } from '../../apps/platform-lab/src/mobile/annual-duty-calculation.ts';
import type { FeatureSource, WorkSummaryItem } from '../../apps/platform-lab/src/mobile/feature-information.ts';

export function annualSummary(obligation='150,00 EUR',performed='60,00 EUR',hours='6.00',retrievedAt='2026-05-01T12:00:00.000Z'): FeatureSource<WorkSummaryItem> {
  return {status:'partial',empty:false,truncated:false,filters:[],retrievedAt,items:[{key:'synthetic:0',period:'Jahr 2026',obligation,performed,hours}]};
}
test('owner-selected annual ratio uses unequal monetary totals and rounds only the final hour target',()=>{
  assert.equal(annualDutyCalculation(annualSummary(),2026)?.hours,15);
  assert.equal(annualDutyCalculation(annualSummary('100,00 EUR','30,00 EUR','1.00'),2026)?.hours,3.33);
  assert.equal(annualDutyCalculation(annualSummary('100,00 EUR','30,00 EUR','1:30'),2026)?.hours,5);
  assert.equal(annualDutyCalculation(annualSummary('1.000,00 €','250,00 EUR','25,00'),2026)?.hours,100);
  assert.equal(annualDutyCalculation(annualSummary('0,00 EUR','10,00 EUR','1'),2026)?.hours,0);
  assert.equal(annualDutyCalculation(annualSummary('100,00 EUR','120,00 EUR','12'),2026)?.hours,10,'Unequal includes earned above Pflicht, as selected');
});
test('equality, year-start zero and undefined ratios cannot replace the last calculated target',()=>{
  for(const source of [annualSummary('150,00 EUR','150,00 EUR','16'),annualSummary('150,00 EUR','0,00 EUR','0'),annualSummary('0,00 EUR','0,00 EUR','0'),annualSummary('150,00 EUR','50,00 EUR','0')])
    assert.equal(annualDutyCalculation(source,2026),null);
});
test('ambiguous years, truncated/unavailable source, bad units, negative values and overflow fail closed',()=>{
  const base=annualSummary();
  for(const source of [undefined,{...base,status:'unavailable' as const},{...base,truncated:true},{...base,retrievedAt:null},{...base,retrievedAt:'bad'},
    {...base,items:[...base.items,...base.items]}, {...base,items:[{...base.items[0]!,period:'2025/2026'}]}])assert.equal(annualDutyCalculation(source,2026),null);
  assert.equal(annualDutyCalculation(base,2027),null);
  for(const [required,earned,hours] of [['150 USD','50,00 EUR','5'],['150.00 EUR','50,00 EUR','5'],['150,00 EUR','-50,00 EUR','5'],['150,00 EUR','50,00 EUR','-5'],['150,00 EUR','50,00 EUR','1:60'],['150,00 EUR','0,01 EUR','10000']])
    assert.equal(annualDutyCalculation(annualSummary(required,earned,hours),2026),null);
});
