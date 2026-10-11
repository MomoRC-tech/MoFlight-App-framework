// User-supplied blank spread and description, 2026-10-11. Presentation only;
// no legal role allocation, provider conversion, OCR or book activation.
export const glidingFormat = {
  id:'user-eu-fcl-gliding-a6-photo-v1', name:'EU-FCL Flugbuch für Segelflieger',
  language:'de', size:'DIN A6', totalStarts:590, aircraftClasses:['glider'],
  excludes:['TMG'], edition:null, status:'draft-from-user-layout',
  rowCapacity:10, // Ten ruled entry rows counted on the supplied blank spread.
} as const;
export interface GlidingWritingEvidence {
  aircraftClass:'glider'; number:number; date:string|null;
  model:string|null; registration:string|null; pic:string|null; companion:string|null;
  launch:string|null; departure:string|null; arrival:string|null;
  start:string|null; landing:string|null; timeBasis:'UTC'|null;
  minutes:number|null; picMinutes:number|null; dualMinutes:number|null;
  fiMinutes:number|null; feMinutes:number|null;
  winchStarts:number|null; towStarts:number|null; selfStarts:number|null;
  distanceKm:number|null; remarks:string|null;
}
export interface WritingCell {column:string; text:string|null; status:'resolved'|'unknown'}
function duration(n:number|null){return n===null?null:`${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;}
export function glidingWritingCells(e:GlidingWritingEvidence):WritingCell[]{
  if(e.aircraftClass!=='glider'||!Number.isSafeInteger(e.number)||e.number<1)throw new Error('Gliding book and entry number required');
  for(const k of ['minutes','picMinutes','dualMinutes','fiMinutes','feMinutes','winchStarts','towStarts','selfStarts'] as const)if(e[k]!==null&&(!Number.isSafeInteger(e[k])||e[k]!<0))throw new Error('Nonnegative integer evidence required');
  if(e.distanceKm!==null&&(!Number.isFinite(e.distanceKm)||e.distanceKm<0))throw new Error('Invalid distance evidence');
  if(e.minutes!==null&&[e.picMinutes,e.dualMinutes,e.fiMinutes,e.feMinutes].some(n=>n!==null&&n>e.minutes!))throw new Error('Role time exceeds total time');
  if(e.minutes!==null&&e.picMinutes!==null&&e.dualMinutes!==null&&e.picMinutes+e.dualMinutes>e.minutes)throw new Error('Conflicting PIC and training time');
  if(e.date!==null&&(!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||!Number.isFinite(Date.parse(e.date))||new Date(e.date).toISOString().slice(0,10)!==e.date))throw new Error('Invalid date evidence');
  for(const t of [e.start,e.landing])if(t!==null&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(t))throw new Error('Invalid clock evidence');
  if(e.timeBasis!==null&&e.timeBasis!=='UTC')throw new Error('Unverified UTC conversion');
  const cells:[string,string|null][]=[['Lfd. Nr.',String(e.number)],['Jahr',e.date?.slice(0,4)??null],['Tag / Monat',e.date?`${e.date.slice(8,10)}.${e.date.slice(5,7)}.`:null],
    ['Flugzeug / Muster',e.model],['Flugzeug / Kennzeichen',e.registration],['Besatzung / PIC',e.pic],['Besatzung / Begleiter',e.companion],['Startart',e.launch],
    ['Ort / Start',e.departure],['Ort / Landung',e.arrival],['Uhrzeit UTC / Start',e.timeBasis==='UTC'?e.start:null],['Uhrzeit UTC / Landung',e.timeBasis==='UTC'?e.landing:null],
    ['Flugzeit / Gesamtzeit',duration(e.minutes)],['Flugzeit / PIC-Zeit',duration(e.picMinutes)],['Flugzeit / Schul-Zeit',duration(e.dualMinutes)],
    ['Flugzeit / FI(S)-Zeit',duration(e.fiMinutes)],['Flugzeit / FE(S)-Zeit',duration(e.feMinutes)],
    ['Startzahl / W',e.winchStarts===null?null:String(e.winchStarts)],['Startzahl / F',e.towStarts===null?null:String(e.towStarts)],['Startzahl / ES',e.selfStarts===null?null:String(e.selfStarts)],
    ['Strecke / km',e.distanceKm===null?null:String(e.distanceKm).replace('.',',')],['Bemerkungen / Bestätigungen',e.remarks]];
  for(const [,text]of cells)if(text!==null&&(typeof text!=='string'||text.length>2000))throw new Error('Invalid writing evidence');
  return cells.map(([column,text])=>({column,text,status:text===null?'unknown':'resolved'}));
}
export function glidingWritingDraft(e:GlidingWritingEvidence){const cells=glidingWritingCells(e);return {format:glidingFormat.id,cells,missing:cells.filter(c=>c.status==='unknown').map(c=>c.column),activation:'blocked-unverified-mapping-and-continuation' as const};}
