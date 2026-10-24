import { canonical } from '@moflight/flight-logbook';
import { CREW_SLOTS, validateAiContext, validateFlightReference,
  type AiContext, type AiProjectedFlight, type FlightReference } from '../../../../packages/ai-contracts/src/index.ts';
import { validateHistoryFacts } from '../vereinsflieger/history-facts';
import type { RealFlightListItem } from '../vereinsflieger/real-flight-library';
import { REAL_FLIGHT_LIBRARY_RECORD_LIMIT } from '../vereinsflieger/real-flight-library-model';

export interface AiProjection {
  rows: AiProjectedFlight[];
  references: FlightReference[];
  /** Local source-label authority; callers serialize only the validated tool DTO. */
  candidates: { alias: string; kind: 'crew' | 'registration'; label: string; normalized: string }[];
  /** Local evidence authority; never serialize this projection object upstream. */
  sourceByReference: ReadonlyMap<string, RealFlightListItem>;
}

/** Match source labels by Unicode case and whitespace only; spelling and accents stay significant. */
export function normalizeAiSourceLabel(text: string): string {
  if (typeof text !== 'string') throw new Error('AI source label must be text.');
  return text.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase().normalize('NFC');
}

function cloneFlight(flight: RealFlightListItem): RealFlightListItem {
  // Library rows are validated JSON records. Canonical JSON gives the local
  // evidence index a detached copy, so later source mutations cannot change it.
  return JSON.parse(canonical(flight)) as RealFlightListItem;
}

function requireFlightRow(flight: RealFlightListItem, context: AiContext): void {
  if (!flight || typeof flight !== 'object' || flight.accountRef !== context.accountRef) {
    throw new Error('Foreign AI flight account.');
  }
  if (flight.unassigned !== true || typeof flight.bindingId !== 'string' || !flight.bindingId ||
      typeof flight.flightId !== 'string' || !flight.flightId || typeof flight.sourceFlightRef !== 'string' || !/^\d{1,20}$/.test(flight.sourceFlightRef) ||
      typeof flight.firstCaptureId !== 'string' || !flight.firstCaptureId ||
      !Number.isSafeInteger(flight.factsRevision) || flight.factsRevision < 1) {
    throw new Error('Invalid AI flight identity or facts revision.');
  }
  const scope = { ownerId: context.localOwnerId, scopeId: flight.bindingId };
  if (flight.facts?.scope?.ownerId !== scope.ownerId || flight.facts.scope.scopeId !== scope.scopeId) {
    throw new Error('Foreign AI flight facts scope.');
  }
  validateHistoryFacts(flight.facts, scope);
  if (flight.facts.assessment.observation.row.sourceFlightId !== flight.sourceFlightRef) {
    throw new Error('AI flight source reference does not match its captured evidence.');
  }
}

function parsed(value: { state: string; value: string | null } | undefined): string | null {
  return value?.state === 'parsed' ? value.value : null;
}

function sourceField(assessment: RealFlightListItem['facts']['assessment'], field: 'registration' | typeof CREW_SLOTS[number]) {
  const value = assessment.fields[field];
  return value.state === 'value' ? value.raw : null;
}

export function projectAiFlights(flights: readonly RealFlightListItem[], context: AiContext): AiProjection {
  const validatedContext = validateAiContext(context);
  if (validatedContext.flights.state !== 'available') throw new Error('AI flights unavailable.');
  if (!Array.isArray(flights)) throw new Error('AI flights must be a list.');
  if (flights.length > REAL_FLIGHT_LIBRARY_RECORD_LIMIT) throw new Error('AI flight projection input exceeds the library bound.');

  const uniqueFlights: RealFlightListItem[] = [];
  const seenFlights = new Map<string, string>();
  const seenSourceReferences = new Map<string, string>();
  for (const flight of flights) {
    requireFlightRow(flight, validatedContext);
    const fingerprint = canonical(flight);
    const sourceReferenceFlight = seenSourceReferences.get(flight.sourceFlightRef);
    if (sourceReferenceFlight !== undefined && sourceReferenceFlight !== flight.flightId) {
      throw new Error('Conflicting AI flights share a source reference.');
    }
    seenSourceReferences.set(flight.sourceFlightRef, flight.flightId);
    const seen = seenFlights.get(flight.flightId);
    if (seen !== undefined) {
      if (seen !== fingerprint) throw new Error('Conflicting duplicate AI flight.');
      continue;
    }
    seenFlights.set(flight.flightId, fingerprint);
    uniqueFlights.push(flight);
  }

  const candidates: AiProjection['candidates'] = [];
  const aliases = {
    registration: new Map<string, string>(),
    crew: new Map<string, string>(),
  };
  const aliasFor = (kind: 'crew' | 'registration', label: string): string => {
    const normalized = normalizeAiSourceLabel(label);
    const known = aliases[kind].get(normalized);
    if (known) return known;
    const alias = `${kind === 'registration' ? 'a' : 'p'}${aliases[kind].size + 1}`;
    aliases[kind].set(normalized, alias);
    candidates.push({ alias, kind, label, normalized });
    return alias;
  };

  const rows: AiProjectedFlight[] = [];
  const references: FlightReference[] = [];
  const sourceByReference = new Map<string, RealFlightListItem>();
  for (let index = 0; index < uniqueFlights.length; index++) {
    const flight = uniqueFlights[index]!;
    const reference: FlightReference = validateFlightReference({
      id: `e${index + 1}`,
      flightId: flight.flightId,
      factsRevision: String(flight.factsRevision),
      context: validatedContext,
    }, validatedContext);
    references.push(reference);
    sourceByReference.set(reference.id, cloneFlight(flight));

    const assessment = flight.facts.assessment;
    const registration = sourceField(assessment, 'registration');
    const duration = assessment.durations.flight;
    const known = duration.state === 'known' && Number.isSafeInteger(duration.minutes) && duration.minutes >= 0;
    const crew: AiProjectedFlight['crew'] = [];
    for (const slot of CREW_SLOTS) {
      const label = sourceField(assessment, slot);
      if (label !== null) crew.push({ alias: aliasFor('crew', label), slot });
    }
    rows.push({
      referenceId: reference.id,
      date: parsed(assessment.date),
      startTime: parsed(assessment.clocks.start),
      landingTime: parsed(assessment.clocks.landing),
      registrationAlias: registration === null ? null : aliasFor('registration', registration),
      knownMinutes: known ? duration.minutes : null,
      durationState: known ? 'known' : duration.state === 'unknown' ? 'unknown' : 'conflict',
      crew,
    });
  }

  return { rows, references, candidates, sourceByReference };
}
