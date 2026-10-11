import {test} from 'node:test';import assert from 'node:assert/strict';
import {glidingFormat,glidingWritingDraft,type GlidingWritingEvidence} from '../../packages/flight-logbook/src/gliding-format.ts';
const e:GlidingWritingEvidence={aircraftClass:'glider',number:1,date:'2026-10-11',model:'Synthetic glider',registration:'D-0000',pic:'Synthetic pilot',companion:'',launch:'W',departure:'Synthetic field',arrival:'Synthetic field',start:'23:50',landing:'00:15',timeBasis:'UTC',minutes:25,picMinutes:25,dualMinutes:0,fiMinutes:0,feMinutes:0,winchStarts:1,towStarts:0,selfStarts:0,distanceKm:0,remarks:''};
test('supplied gliding layout preserves exact destinations, explicit zero/blank and integer durations without deriving time from midnight clocks',()=>{
  const d=glidingWritingDraft(e),cells=Object.fromEntries(d.cells.map(c=>[c.column,c.text]));assert.equal(d.missing.length,0);assert.equal(cells['Flugzeit / Gesamtzeit'],'0:25');assert.equal(cells['Startzahl / F'],'0');assert.equal(cells['Besatzung / Begleiter'],'');assert.equal(cells['Uhrzeit UTC / Landung'],'00:15');assert.equal(glidingFormat.totalStarts,590);assert.equal(glidingFormat.rowCapacity,10);assert.deepEqual(glidingFormat.excludes,['TMG']);
});
test('unknown UTC, role allocation, launch counters and distance remain unknown and block a ready writing profile',()=>{
  const d=glidingWritingDraft({...e,timeBasis:null,fiMinutes:null,feMinutes:null,towStarts:null,distanceKm:null});assert.equal(d.cells.find(c=>c.column==='Uhrzeit UTC / Start')?.text,null);assert.ok(d.missing.includes('Flugzeit / FE(S)-Zeit'));assert.ok(d.missing.includes('Startzahl / F'));assert.equal(d.activation,'blocked-unverified-mapping-and-continuation');
});
test('wrong category, impossible dates, fractional minutes and conflicting role evidence are rejected',()=>{
  for(const changed of [{aircraftClass:'TMG'},{date:'2026-02-30'},{minutes:1.5},{fiMinutes:26},{dualMinutes:25},{distanceKm:NaN}])assert.throws(()=>glidingWritingDraft({...e,...changed} as GlidingWritingEvidence));
});
