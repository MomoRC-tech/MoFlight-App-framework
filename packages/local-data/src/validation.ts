import { canonical, validateFlight, literalFields, counters as flightCounters, counterKeys, RULES, type Flight } from '@moflight/flight-logbook';

type ObjectValue = Record<string, unknown>;
export interface BackupRow { seq: number; kind: string; id: string; revision: number; payload: string }
const fail = (): never => { throw new Error('Invalid backup semantics; original data preserved'); };
const object = (v: unknown): ObjectValue => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as ObjectValue : fail();
const string = (v: unknown): string => typeof v === 'string' && v.trim().length > 0 ? v : fail();
const nullable = (v: unknown) => { if (v !== null && typeof v !== 'string') fail(); };
const integer = (v: unknown, min = 0): number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min ? v : fail();
const array = (v: unknown): unknown[] => Array.isArray(v) ? v : fail();
const timestamp = (v: unknown) => { if (!Number.isFinite(Date.parse(string(v)))) fail(); };
const date = (v: unknown): string => { const s = string(v); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString().slice(0, 10) !== s) fail(); return s; };
const choice = (v: unknown, values: unknown[]) => { if (!values.includes(v)) fail(); };
function counters(v: unknown) { const c = object(v); for (const k of counterKeys) integer(c[k]); }
function flight(v: unknown): Flight { validateFlight(v as Flight); return v as Flight; }
function rows(v: unknown, snapshot = false) {
  const seen = new Set<string>();
  array(v).forEach((value, i) => {
    const r = object(value); if (integer(r.row, 1) !== i + 1 || i >= 10) fail(); integer(r.nr, 1);
    const f = flight(r.flight); if (seen.has(f.id)) fail(); seen.add(f.id);
    if (snapshot) { choice(r.entry_state, ['existing-context-do-not-copy', 'new-copy']); literalFields(r as unknown as Parameters<typeof literalFields>[0]); }
    else if (r.entry_state !== undefined) choice(r.entry_state, ['existing-context-do-not-copy', 'new-copy']);
  });
}
function finding(v: unknown, status = false) {
  const f = object(v); string(f.id); string(f.flight_id); choice(f.field, ['aircraft_model', 'registration']); nullable(f.paper_value); choice(f.rules, [RULES]);
  if (f.id !== `${f.flight_id}:${f.field}`) fail();
  if (status) { nullable(f.source_value); choice(f.status, ['open', 'ignore', 'override', 'stale-review-required']); }
}
function decision(v: unknown) {
  const d = object(v); string(d.id); choice(d.action, ['ignore', 'override', 'reverse']); nullable(d.value);
  if (d.action === 'override') string(d.value);
  string(d.evidence); object(JSON.parse(string(d.evidence))); string(d.reason); timestamp(d.at); string(d.author);
}

// All revisions are checked in sequence, so historical snapshots may refer to
// earlier evidence without being reinterpreted using today's corrected flights.
export async function validateBackupRecords(values: unknown[], datasetId: string, hash: (s: string) => Promise<string>): Promise<BackupRow[]> {
  const records: BackupRow[] = [], latest = new Map<string, ObjectValue>(), revisions = new Map<string, number>();
  let seq = 0;
  const get = (kind: string, id: unknown) => latest.get(kind + ':' + string(id)) ?? fail();
  for (const value of values) {
    const r = object(value); const kind = string(r.kind), id = string(r.id), payload = string(r.payload);
    const currentSeq = integer(r.seq, 1), revision = integer(r.revision, 1), key = kind + ':' + id;
    if (currentSeq <= seq || revision !== (revisions.get(key) ?? 0) + 1) fail();
    const p = object(JSON.parse(payload));
    const identity = () => { if (p.id !== id) fail(); };
    switch (kind) {
      case 'import': {
        identity(); choice(p.transport, ['synthetic-prepared-csv']); if (typeof p.raw_csv !== 'string' || typeof p.successful !== 'boolean') fail(); timestamp(p.retrieved_at);
        const c = object(p.coverage); if (date(c.from) > date(c.through) || typeof c.complete !== 'boolean') fail();
        const ids = new Map<string, string>(); for (const v of array(p.flights)) { const f = flight(v), bytes = canonical(f); if (ids.has(f.id) && ids.get(f.id) !== bytes) fail(); ids.set(f.id, bytes); }
        const { id: ignored, ...input } = p; if (await hash(canonical(input)) !== id) fail(); break;
      }
      case 'flight': identity(); flight(p); break;
      case 'flight_source': {
        identity(); get('flight', id); const source = get('import', p.source_id);
        if (source.successful !== true || !array(source.flights).some(v => object(v).id === id && canonical(v) === canonical(get('flight', id)))) fail(); break;
      }
      case 'state': if (id !== 'last_success' || get('import', p.source_id).successful !== true) fail(); break;
      case 'observation': choice(p.provenance, ['synthetic-prepared-observations-no-OCR']); object(JSON.parse(string(p.raw_page))); break;
      case 'page': {
        identity(); integer(p.page, 1); rows(p.rows); counters(p.carry); timestamp(p.confirmed_at); choice(p.provenance, ['synthetic-prepared-observations-no-OCR']);
        if (array(p.rows).length !== 9 || canonical(JSON.parse(string(get('observation', id).raw_page))) !== canonical(p)) fail(); break;
      }
      case 'paper': {
        if (flight(p.flight).id !== id) fail(); integer(p.row, 1); if (integer(p.row, 1) > 10) fail(); integer(p.nr, 1); integer(p.page, 1); timestamp(p.confirmed_at); string(p.author);
        const reference = string(p.evidence), prepared = reference.startsWith('prepared:');
        if (!prepared && !reference.startsWith('user-assertion:')) fail();
        const anchor = get(prepared ? 'page' : 'template', reference.slice(reference.indexOf(':') + 1));
        const pages = prepared ? [anchor] : array(anchor.pages).map(object);
        if (!pages.some(page => page.page === p.page && array(page.rows).some(v => { const row = object(v); return row.row === p.row && row.nr === p.nr && canonical(row.flight) === canonical(p.flight) && (prepared || row.entry_state === 'new-copy'); }))) fail(); break;
      }
      case 'finding': identity(); finding(p); get('flight', p.flight_id); if (object(get('paper',p.flight_id).flight)[string(p.field)] !== p.paper_value) fail(); break;
      case 'decision': {
        identity(); decision(p); const f=get('finding',id), proof=object(JSON.parse(string(p.evidence)));
        if (proof.flight_id!==f.flight_id || proof.field!==f.field || proof.paper!==f.paper_value || proof.rules!==f.rules) fail(); nullable(proof.source); break;
      }
      case 'template': {
        identity(); if (p.dataset_id !== datasetId || integer(p.revision) !== seq) fail(); choice(p.rules, [RULES]); choice(p.presentation, ['native-field-view-v1']); get('import', p.source_id);
        for (const d of array(p.decisions)) { decision(d); get('finding', object(d).id); }
        for (const f of array(p.findings)) { finding(f, true); get('flight', object(f).flight_id); }
        const pages = array(p.pages); if (!pages.length) fail(); let previous = 0;
        let priorCarry: unknown = null, nr=0;
        for (const [index,v] of pages.entries()) {
          const page = object(v); const n = integer(page.page, 1); if (previous && n !== previous + 1) fail(); previous = n; counters(page.carry); rows(page.rows, true);
          if(priorCarry && canonical(page.carry)!==canonical(priorCarry)) fail();
          const pageRows=array(page.rows); if(!pageRows.length || index<pages.length-1 && pageRows.length!==10)fail();
          for(const value of pageRows){const row=object(value); if(nr && row.nr!==nr+1)fail(); nr=integer(row.nr,1);}
          if(pageRows.length===10){const total=Object.fromEntries(counterKeys.map(k=>[k,0])) as Record<string,number>;for(const row of pageRows){const count=flightCounters(flight(object(row).flight));for(const k of counterKeys)total[k]!+=count[k];}const carry=object(page.carry), cumulative=Object.fromEntries(counterKeys.map(k=>[k,integer(carry[k])+total[k]!]));if(canonical(total)!==canonical(page.page_total)||canonical(cumulative)!==canonical(page.cumulative_total))fail();priorCarry=cumulative;}
          else if(page.page_total!==null||page.cumulative_total!==null)fail();
        }
        const { id: ignored, ...input } = p; if (await hash(canonical(input)) !== id) fail(); break;
      }
      default: fail();
    }
    latest.set(key, p); revisions.set(key, revision); seq = currentSeq;
    records.push({ seq, kind, id, revision, payload });
  }
  for (const [key, p] of latest) if (key.startsWith('flight:')) get('flight_source', p.id);
  return records;
}
