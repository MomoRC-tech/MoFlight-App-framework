import { AI_CHAT_ACCEPTANCE_CASES, AI_FIXTURE_FLIGHTS,
  type FrozenExpectedOutput, type FrozenMetricPeriod } from '../../tests/mobile/fixtures/ai-chat-cases.ts';

export const AI_EVALUATION_LIMITS = Object.freeze({
  caseIdChars: 100, referenceChars: 200, references: 200, findings: 200, periods: 16,
  metricCount: 1_000_000, metricMinutes: 10_000_000,
});

type EvaluationMetrics = NonNullable<FrozenExpectedOutput['metrics']>;
type FindingKind = 'duplicate' | 'conflicting-facts' | 'unusual-valid-row';

export interface AiEvaluationObservation {
  caseId: string;
  status: FrozenExpectedOutput['status'];
  supportingFlightRefs: string[];
  metrics?: EvaluationMetrics;
  findings?: { kind: FindingKind; flightRefs: string[] }[];
  detailActionFlightRef?: string;
  showAllFlightRefs?: string[];
  rejectedFlightRefs?: string[];
}

export interface AiEvaluationScore {
  caseId: string;
  checks: {
    status: boolean;
    supportingFlightRefs: boolean;
    actions: boolean;
    metrics: boolean;
    findings: boolean;
    rejectedFlightRefs: boolean;
  };
  structuredChecksPassed: boolean;
  invalidReferences: string[];
  issues: string[];
  semanticReview: 'required';
  gatesNotCovered: readonly string[];
}

const GATES_NOT_COVERED = Object.freeze([
  'Natural-language required and forbidden claims, language matching, clarity, and hallucinations require semantic review.',
  'Synthetic fixture checks do not establish model quality, live retrieval accuracy, provider behavior, privacy, cost, native acceptance, or release readiness.',
]);

interface ScoringCase {
  id: string;
  input: { ownerId: string; accountRef: string; storeId: string; flightRefs: readonly string[] };
  expected: FrozenExpectedOutput;
}

const scoringCases = new Map<string, ScoringCase>();
for (const frozen of AI_CHAT_ACCEPTANCE_CASES) {
  scoringCases.set(frozen.id, { id: frozen.id, input: frozen.input, expected: frozen.expected });
  for (const variant of frozen.variants ?? []) {
    scoringCases.set(variant.id, { id: variant.id, input: variant.input, expected: variant.expected });
  }
}

const flightsByReference = new Map(AI_FIXTURE_FLIGHTS.map(flight => [flight.flightRef, flight]));

function record(value: unknown, allowed: readonly string[], required: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('Invalid evaluation object');
  const keys = Reflect.ownKeys(value);
  if (keys.some(key => typeof key !== 'string' || !allowed.includes(key))) throw new Error('Unsupported evaluation fields');
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key as string);
    if (!descriptor?.enumerable || !('value' in descriptor)) throw new Error('Invalid evaluation property');
  }
  if (required.some(key => !Object.hasOwn(value, key))) throw new Error('Missing evaluation field');
  return value as Record<string, unknown>;
}

function list(value: unknown, maximum: number, minimum = 0): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < minimum || value.length > maximum ||
      Reflect.ownKeys(value).length !== value.length + 1) throw new Error('Invalid evaluation list');
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !('value' in descriptor)) throw new Error('Invalid evaluation list entry');
  }
  return value;
}

function boundedString(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum || value.includes('\0')) throw new Error('Invalid evaluation text');
  return value;
}

function identifier(value: unknown): string {
  const parsed = boundedString(value, AI_EVALUATION_LIMITS.referenceChars);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(parsed)) throw new Error('Invalid evaluation reference');
  return parsed;
}

function date(value: unknown): string {
  const parsed = boundedString(value, 10);
  if (!/^\d{4}-\d\d-\d\d$/.test(parsed) || !Number.isFinite(Date.parse(parsed)) || new Date(parsed).toISOString().slice(0, 10) !== parsed) {
    throw new Error('Invalid evaluation date');
  }
  return parsed;
}

function integer(value: unknown, maximum: number, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error('Invalid evaluation number');
  return value;
}

function metricNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > AI_EVALUATION_LIMITS.metricMinutes) throw new Error('Invalid evaluation metric');
  return value;
}

function references(value: unknown): string[] {
  const parsed = list(value, AI_EVALUATION_LIMITS.references).map(item => identifier(item));
  if (new Set(parsed).size !== parsed.length) throw new Error('Duplicate evaluation reference');
  return parsed;
}

function dateOrNull(value: unknown): string | null {
  return value === null ? null : date(value);
}

const PERIOD_KEYS = ['label', 'from', 'through', 'uniqueFlightCount', 'knownDurationCount', 'knownMinutes', 'averageKnownMinutes',
  'unknownDurationFlightRefs', 'conflictingSourceFlightIds', 'deduplicatedSourceFlightIds', 'suppliedRowCount', 'coverage'] as const;
const COVERAGE_KEYS = ['requestedFrom', 'requestedThrough', 'observedFrom', 'observedThrough', 'fullyCovered'] as const;

function period(value: unknown): FrozenMetricPeriod {
  const p = record(value, PERIOD_KEYS, PERIOD_KEYS);
  const coverage = record(p.coverage, COVERAGE_KEYS, COVERAGE_KEYS);
  if (typeof coverage.fullyCovered !== 'boolean') throw new Error('Invalid evaluation coverage');
  const average = p.averageKnownMinutes;
  if (average !== null) metricNumber(average);
  return {
    label: boundedString(p.label, 100), from: date(p.from), through: date(p.through),
    uniqueFlightCount: integer(p.uniqueFlightCount, AI_EVALUATION_LIMITS.metricCount),
    knownDurationCount: integer(p.knownDurationCount, AI_EVALUATION_LIMITS.metricCount),
    knownMinutes: integer(p.knownMinutes, AI_EVALUATION_LIMITS.metricMinutes),
    averageKnownMinutes: average as number | null,
    unknownDurationFlightRefs: references(p.unknownDurationFlightRefs),
    conflictingSourceFlightIds: references(p.conflictingSourceFlightIds),
    deduplicatedSourceFlightIds: references(p.deduplicatedSourceFlightIds),
    suppliedRowCount: integer(p.suppliedRowCount, AI_EVALUATION_LIMITS.metricCount),
    coverage: {
      requestedFrom: date(coverage.requestedFrom), requestedThrough: date(coverage.requestedThrough),
      observedFrom: dateOrNull(coverage.observedFrom), observedThrough: dateOrNull(coverage.observedThrough),
      fullyCovered: coverage.fullyCovered,
    },
  };
}

const METRIC_KEYS = ['periods', 'flightCountDelta', 'knownMinutesDelta', 'percentagesSuppressedReason', 'latestFlightRef',
  'matchedFlightRefs', 'matchCountAmongAvailableLabels', 'mayBeAdditionalMatches', 'reviewedRowCount', 'duplicateGroupCount',
  'conflictGroupCount', 'unusualValidFlightRefs'] as const;

function metrics(value: unknown): EvaluationMetrics {
  const m = record(value, METRIC_KEYS);
  const parsed: Record<string, unknown> = {};
  for (const key of METRIC_KEYS) {
    if (!Object.hasOwn(m, key)) continue;
    const item = m[key];
    if (key === 'periods') parsed.periods = list(item, AI_EVALUATION_LIMITS.periods).map(period);
    else if (key === 'flightCountDelta') parsed.flightCountDelta = integer(item, AI_EVALUATION_LIMITS.metricCount, -AI_EVALUATION_LIMITS.metricCount);
    else if (key === 'knownMinutesDelta') parsed.knownMinutesDelta = integer(item, AI_EVALUATION_LIMITS.metricMinutes, -AI_EVALUATION_LIMITS.metricMinutes);
    else if (key === 'percentagesSuppressedReason') parsed.percentagesSuppressedReason = boundedString(item, 100);
    else if (key === 'latestFlightRef') parsed.latestFlightRef = identifier(item);
    else if (key === 'matchedFlightRefs' || key === 'unusualValidFlightRefs') parsed[key] = references(item);
    else if (key === 'mayBeAdditionalMatches') {
      if (typeof item !== 'boolean') throw new Error('Invalid evaluation metric');
      parsed[key] = item;
    } else if (key === 'matchCountAmongAvailableLabels' || key === 'reviewedRowCount' || key === 'duplicateGroupCount' || key === 'conflictGroupCount') {
      parsed[key] = integer(item, AI_EVALUATION_LIMITS.metricCount);
    }
  }
  return parsed as EvaluationMetrics;
}

function parseFindings(value: unknown): { kind: FindingKind; flightRefs: string[] }[] {
  const parsed = list(value, AI_EVALUATION_LIMITS.findings).map(item => {
    const finding = record(item, ['kind', 'flightRefs'], ['kind', 'flightRefs']);
    if (!['duplicate', 'conflicting-facts', 'unusual-valid-row'].includes(String(finding.kind))) throw new Error('Invalid evaluation finding kind');
    return { kind: finding.kind as FindingKind, flightRefs: references(finding.flightRefs) };
  });
  const signatures = findingSignatures(parsed);
  if (new Set(signatures).size !== signatures.length) throw new Error('Duplicate evaluation finding');
  return parsed;
}

function parseObservation(value: unknown): AiEvaluationObservation {
  const allowed = ['caseId', 'status', 'supportingFlightRefs', 'metrics', 'findings', 'detailActionFlightRef', 'showAllFlightRefs', 'rejectedFlightRefs'];
  const p = record(value, allowed, ['caseId', 'status', 'supportingFlightRefs']);
  const statuses: FrozenExpectedOutput['status'][] = ['answer', 'partial', 'clarification', 'unavailable', 'explanation'];
  if (!statuses.includes(String(p.status) as FrozenExpectedOutput['status'])) throw new Error('Invalid evaluation status');
  const parsed: AiEvaluationObservation = {
    caseId: boundedString(p.caseId, AI_EVALUATION_LIMITS.caseIdChars),
    status: p.status as FrozenExpectedOutput['status'],
    supportingFlightRefs: references(p.supportingFlightRefs),
  };
  if (Object.hasOwn(p, 'metrics')) parsed.metrics = metrics(p.metrics);
  if (Object.hasOwn(p, 'findings')) parsed.findings = parseFindings(p.findings);
  if (Object.hasOwn(p, 'detailActionFlightRef')) parsed.detailActionFlightRef = identifier(p.detailActionFlightRef);
  if (Object.hasOwn(p, 'showAllFlightRefs')) parsed.showAllFlightRefs = references(p.showAllFlightRefs);
  if (Object.hasOwn(p, 'rejectedFlightRefs')) parsed.rejectedFlightRefs = references(p.rejectedFlightRefs);
  return parsed;
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every(item => right.includes(item));
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((item, index) => sameValue(item, right[index]));
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const a = Object.keys(left as object).sort(), b = Object.keys(right as object).sort();
  return sameSet(a, b) && a.every(key => sameValue((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
}

function equalMetric(expected: EvaluationMetrics | undefined, observed: EvaluationMetrics | undefined): boolean {
  if (expected === undefined || observed === undefined) return expected === observed;
  const expectedKeys = Object.keys(expected).sort(), observedKeys = Object.keys(observed).sort();
  if (!sameSet(expectedKeys, observedKeys)) return false;
  for (const key of expectedKeys) {
    const left = (expected as Record<string, unknown>)[key];
    const right = (observed as Record<string, unknown>)[key];
    if (key === 'matchedFlightRefs' || key === 'unusualValidFlightRefs') {
      if (!sameSet(left as string[], right as string[])) return false;
    } else if (key === 'periods') {
      const leftPeriods = left as FrozenMetricPeriod[], rightPeriods = right as FrozenMetricPeriod[];
      if (leftPeriods.length !== rightPeriods.length) return false;
      for (let index = 0; index < leftPeriods.length; index++) {
        const a = { ...leftPeriods[index]!, unknownDurationFlightRefs: [...leftPeriods[index]!.unknownDurationFlightRefs].sort(),
          conflictingSourceFlightIds: [...leftPeriods[index]!.conflictingSourceFlightIds].sort(),
          deduplicatedSourceFlightIds: [...leftPeriods[index]!.deduplicatedSourceFlightIds].sort() };
        const b = { ...rightPeriods[index]!, unknownDurationFlightRefs: [...rightPeriods[index]!.unknownDurationFlightRefs].sort(),
          conflictingSourceFlightIds: [...rightPeriods[index]!.conflictingSourceFlightIds].sort(),
          deduplicatedSourceFlightIds: [...rightPeriods[index]!.deduplicatedSourceFlightIds].sort() };
        if (!sameValue(a, b)) return false;
      }
    } else if (!sameValue(left, right)) return false;
  }
  return true;
}

function activeFlightRefs(input: ScoringCase['input']): Set<string> {
  return new Set(input.flightRefs.filter(reference => {
    const flight = flightsByReference.get(reference);
    return flight?.ownerId === input.ownerId && flight.accountRef === input.accountRef && flight.storeId === input.storeId;
  }));
}

function findingSignatures(findings: readonly { kind: FindingKind; flightRefs: string[] }[]): string[] {
  return findings.map(finding => `${finding.kind}:${[...finding.flightRefs].sort().join(',')}`).sort();
}

/**
 * Scores only bounded structured observations against the frozen synthetic cases.
 * It never reads, compares or grades natural-language answer claims.
 */
export function scoreAiObservation(value: unknown): AiEvaluationScore {
  const observation = parseObservation(value);
  const frozen = scoringCases.get(observation.caseId);
  if (!frozen) throw new Error('Unknown frozen AI evaluation case');
  const expected = frozen.expected;
  const allowedRefs = activeFlightRefs(frozen.input);
  const invalidSupporting = new Set<string>(), invalidActions = new Set<string>(), invalidMetrics = new Set<string>();
  const invalidFindings = new Set<string>(), invalidRejected = new Set<string>();
  const invalid = new Set<string>();
  const checkActive = (reference: string, issues: Set<string>) => {
    if (!allowedRefs.has(reference)) issues.add(reference);
  };
  const checkSourceId = (sourceId: string, issues: Set<string>) => {
    const knownFromInput = frozen.input.flightRefs.some(reference => flightsByReference.get(reference)?.sourceFlightId === sourceId);
    if (!knownFromInput) issues.add(sourceId);
  };
  const checkRejected = (reference: string) => {
    const flight = flightsByReference.get(reference);
    if (!flight || flight.ownerId === frozen.input.ownerId) invalidRejected.add(reference);
  };

  observation.supportingFlightRefs.forEach(reference => checkActive(reference, invalidSupporting));
  observation.detailActionFlightRef && checkActive(observation.detailActionFlightRef, invalidActions);
  observation.showAllFlightRefs?.forEach(reference => checkActive(reference, invalidActions));
  observation.rejectedFlightRefs?.forEach(checkRejected);
  for (const metric of [observation.metrics]) {
    if (!metric) continue;
    if (metric.latestFlightRef) checkActive(metric.latestFlightRef, invalidMetrics);
    metric.matchedFlightRefs?.forEach(reference => checkActive(reference, invalidMetrics));
    metric.unusualValidFlightRefs?.forEach(reference => checkActive(reference, invalidMetrics));
    metric.periods?.forEach(item => {
      item.unknownDurationFlightRefs.forEach(reference => checkActive(reference, invalidMetrics));
      item.conflictingSourceFlightIds.forEach(sourceId => checkSourceId(sourceId, invalidMetrics));
      item.deduplicatedSourceFlightIds.forEach(sourceId => checkSourceId(sourceId, invalidMetrics));
    });
  }
  observation.findings?.forEach(finding => finding.flightRefs.forEach(reference => checkActive(reference, invalidFindings)));
  for (const group of [invalidSupporting, invalidActions, invalidMetrics, invalidFindings, invalidRejected]) {
    for (const reference of group) invalid.add(reference);
  }

  const expectedSupporting = expected.supportingFlightRefs ?? [];
  const expectedShowAll = expected.showAllFlightRefs ?? [];
  const expectedRejected = expected.rejectedFlightRefs ?? [];
  const expectedFindings = (expected.findings ?? []).map(({ kind, flightRefs }) => ({ kind, flightRefs: [...flightRefs] }));
  const observedFindings = observation.findings ?? [];
  const checks = {
    status: observation.status === expected.status,
    supportingFlightRefs: sameSet(observation.supportingFlightRefs, expectedSupporting) && invalidSupporting.size === 0,
    actions: observation.detailActionFlightRef === expected.detailActionFlightRef &&
      sameSet(observation.showAllFlightRefs ?? [], expectedShowAll) &&
      invalidActions.size === 0,
    metrics: equalMetric(expected.metrics as EvaluationMetrics | undefined, observation.metrics) && invalidMetrics.size === 0,
    findings: sameSet(findingSignatures(observedFindings), findingSignatures(expectedFindings)) &&
      invalidFindings.size === 0,
    rejectedFlightRefs: sameSet(observation.rejectedFlightRefs ?? [], expectedRejected) &&
      invalidRejected.size === 0,
  };
  const issues: string[] = [];
  if (!checks.status) issues.push('status-mismatch');
  if (!checks.supportingFlightRefs) issues.push('supporting-flight-references-mismatch');
  if (!checks.actions) issues.push('action-references-mismatch');
  if (!checks.metrics) issues.push('metric-values-or-references-mismatch');
  if (!checks.findings) issues.push('finding-kind-or-reference-mismatch');
  if (!checks.rejectedFlightRefs) issues.push('rejected-flight-references-mismatch');
  for (const reference of invalid) issues.push(`foreign-or-unverified-reference:${reference}`);
  const structuredChecksPassed = Object.values(checks).every(Boolean) && invalid.size === 0;
  return { caseId: observation.caseId, checks, structuredChecksPassed, invalidReferences: [...invalid].sort(), issues,
    semanticReview: 'required', gatesNotCovered: GATES_NOT_COVERED };
}
