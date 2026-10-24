import test from 'node:test';
import assert from 'node:assert/strict';
import { MONEY_CASES, BERLIN_PERIOD_CASES } from './fixtures/ai-money-cases.ts';
import { worstCaseMicroEur, settledMicroEur, usdToNanoUsd, assertPriceEvidence, berlinPeriod } from '../../supabase/functions/ai-relay/money.ts';
for(const c of MONEY_CASES)test('independent money vector: '+c.id,()=>{
  const {id:_,inputTokens,outputTokens,expectedMicroEur,...rates}=c;
  assert.equal(worstCaseMicroEur(rates,inputTokens,outputTokens),expectedMicroEur);
});
for(const c of BERLIN_PERIOD_CASES)test('independent Berlin period: '+c.id,()=>assert.equal(berlinPeriod(c.instantUtc),c.expectedPeriod));
test('decimal USD and gross settlement round upward without binary floating-point multiplication',()=>{
  assert.equal(usdToNanoUsd('0.0000000001'),1);assert.equal(usdToNanoUsd('1.000000000000000001'),1000000001);
  assert.equal(settledMicroEur(usdToNanoUsd('0.000001'),1150000),2);
  for(const value of ['1e-3','-1','NaN','1.2.3','00.5','Infinity'])assert.throws(()=>usdToNanoUsd(value));
});
test('missing/stale/unapproved rate, fee or route evidence blocks any safe-cost claim',()=>{
  const rates={inputNanoUsd:1,cacheReadNanoUsd:0,cacheWriteNanoUsd:0,outputNanoUsd:1,requestNanoUsd:0,grossMicroEurPerUsd:1000000,marginBps:1000};
  const price={...rates,version:1,id:'synthetic',validFrom:'2026-10-01T00:00:00.000Z',validUntil:'2026-11-01T00:00:00.000Z',
    approved:true,feesCovered:true,model:'openai/gpt-6-luna',reasoning:'max',route:'azure',zdr:true,evidenceRef:'synthetic-only'};
  assert.equal(assertPriceEvidence(price,'2026-10-24T12:00:00.000Z').id,'synthetic');
  for(const change of [{approved:false},{feesCovered:false},{grossMicroEurPerUsd:null},{cacheWriteNanoUsd:undefined},{route:'unreviewed'},{marginBps:Infinity}])assert.throws(()=>assertPriceEvidence({...price,...change},'2026-10-24T12:00:00.000Z'));
  assert.throws(()=>assertPriceEvidence(price,price.validUntil));assert.throws(()=>assertPriceEvidence(price,'2026-09-30T23:59:59.000Z'));
});
