import test from 'node:test';
import assert from 'node:assert/strict';
import {seasonWorkHours} from '../../apps/platform-lab/src/mobile/season-work-hours.ts';
import type {FeatureSource,WorkSummaryItem} from '../../apps/platform-lab/src/mobile/feature-information.ts';

const item=(period='2026',hours='07:25'):WorkSummaryItem=>({key:period,period,hours,obligation:'90,00 €',performed:'21,50 €'});
const source=(items=[item()]):FeatureSource<WorkSummaryItem>=>({status:'partial',retrievedAt:null,filters:[],truncated:true,items});
test('annual work metric uses the selected year source row, never financial values or other years',()=>{
  assert.equal(seasonWorkHours(source([item('2025','99:00'),item()]),2026),'7:25');
  for(const [raw,expected] of [['0','0'],['00:00','0:00'],['7.25','7,25'],['7,50','7,50']]) assert.equal(seasonWorkHours(source([item('2026',raw)]),2026),expected);
  assert.equal(seasonWorkHours(source([item('2025')]),2026),null);
});
test('missing, invalid, duplicate or unavailable annual hours remain unknown',()=>{
  for(const raw of ['', '07:60','90,00 €','-1','1.234,50','unbekannt']) assert.equal(seasonWorkHours(source([item('2026',raw)]),2026),null);
  assert.equal(seasonWorkHours(undefined,2026),null);
  assert.equal(seasonWorkHours({...source(),status:'unavailable'},2026),null);
  assert.equal(seasonWorkHours({...source(),empty:true},2026),null);
  assert.equal(seasonWorkHours(source([item(),item()]),2026),null);
});


test('observed Jahr prefix selects annual hours without treating arbitrary periods as a year',()=>{
  assert.equal(seasonWorkHours(source([item('Jahr 2026','7.50')]),2026),'7,50');
  assert.equal(seasonWorkHours(source([item('  Jahr\u00a02026  ','0.00')]),2026),'0,00');
  assert.equal(seasonWorkHours(source([item('Jahr 2025','88'),item('Jahr 2026','7:25')]),2026),'7:25');
  for(const period of ['Jahr 2026/2027','01.01.2026 - 31.12.2026','Geschäftsjahr 2026','2026 Summe'])assert.equal(seasonWorkHours(source([item(period)]),2026),null);
  assert.equal(seasonWorkHours(source([item('Jahr 2026'),item('2026')]),2026),null);
});
