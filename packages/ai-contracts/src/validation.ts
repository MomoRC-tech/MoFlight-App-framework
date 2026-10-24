import { AI_LIMITS as L, AI_TOOLS, CREW_SLOTS, type AiContext, type HistoricalProviderIdentity,
  type FlightReference, type FlightFilter, type AiToolCall, type AiRequest, type AiReply,
  type AiBudget, type AiPolicy, type AiAnswer, type AiReceipt, type AiCoverage, type AiToolResult, type AiEvidenceReference } from './types.ts';
import { object, array, text, id, account, integer, literal, choice, nullable, date, unique, wire, tag } from './shape.ts';

export function validateAiContext(value: unknown): AiContext {
  const v = object(value, ['version', 'localOwnerId', 'provider', 'accountRef', 'contextVersion', 'flights']);
  const unavailable = tag(v.flights, 'state') === 'flights-unavailable';
  const f = object(v.flights, unavailable ? ['state'] : ['state', 'storeId', 'generation', 'snapshotRevision']);
  return { version: literal(v.version, 1), localOwnerId: id(v.localOwnerId), provider: literal(v.provider, 'vereinsflieger'),
    accountRef: account(v.accountRef), contextVersion: integer(v.contextVersion, Number.MAX_SAFE_INTEGER, 1),
    flights: unavailable ? { state: literal(f.state, 'flights-unavailable') } : {
      state: literal(f.state, 'available'), storeId: id(f.storeId), generation: integer(f.generation, Number.MAX_SAFE_INTEGER), snapshotRevision: id(f.snapshotRevision) } };
}
export function assertAiContext(actual: AiContext, expected: AiContext): void {
  // Parse again so callers cannot smuggle extra fields or stale invalid contexts.
  if (JSON.stringify(validateAiContext(actual)) !== JSON.stringify(validateAiContext(expected))) throw new Error('AI context changed');
}
export function validateHistoricalProviderIdentity(value: unknown, ownerId: string): HistoricalProviderIdentity {
  const v = object(value, ['version', 'localOwnerId', 'provider', 'accountRef', 'observedAt', 'provenance']);
  const profile = tag(v.provenance, 'kind') === 'authenticated-profile';
  const p = object(v.provenance, profile ? ['kind', 'verification'] : ['kind', 'storeId', 'sourceRevision']);
  const observedAt = text(v.observedAt, 24);
  if (!Number.isFinite(Date.parse(observedAt)) || new Date(observedAt).toISOString() !== observedAt) throw new Error('Invalid AI identity timestamp');
  if (id(v.localOwnerId) !== id(ownerId)) throw new Error('Foreign AI identity');
  return { version: literal(v.version, 1), localOwnerId: ownerId, provider: literal(v.provider, 'vereinsflieger'), accountRef: account(v.accountRef), observedAt,
    provenance: profile ? { kind: literal(p.kind, 'authenticated-profile'), verification: literal(p.verification, 'observed-profile-number') }
      : { kind: literal(p.kind, 'verified-saved-binding'), storeId: id(p.storeId), sourceRevision: id(p.sourceRevision) } };
}
export function validateFlightReference(value: unknown, context: AiContext): FlightReference {
  const v = object(value, ['id', 'flightId', 'factsRevision', 'context']);
  const parsed = validateAiContext(v.context);
  assertAiContext(parsed, context);
  if (parsed.flights.state !== 'available') throw new Error('AI flights unavailable');
  return { id: id(v.id), flightId: id(v.flightId), factsRevision: id(v.factsRevision), context: parsed };
}
export function validateAiEvidenceReference(value: unknown, context: AiContext): AiEvidenceReference {
  if (value && typeof value === 'object' && Object.hasOwn(value, 'kind')) {
    const v = object(value, ['kind', 'id', 'captureId', 'captureSha256', 'rowIndex', 'context']);
    const parsed = validateAiContext(v.context); assertAiContext(parsed, context);
    if (parsed.flights.state !== 'available' || typeof v.captureSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(v.captureSha256)) throw new Error('Invalid AI source evidence');
    return { kind: literal(v.kind, 'source-row'), id: id(v.id), captureId: id(v.captureId), captureSha256: v.captureSha256, rowIndex: integer(v.rowIndex, Number.MAX_SAFE_INTEGER), context: parsed };
  }
  return validateFlightReference(value, context);
}
export function validateFlightFilter(value: unknown): FlightFilter {
  const v = object(value, ['from', 'to', 'registrationAlias', 'crewAlias', 'crewSlot']);
  const from = nullable(v.from, date), to = nullable(v.to, date);
  if (from && to && from > to) throw new Error('Invalid AI date range');
  const crewAlias = nullable(v.crewAlias, id), crewSlot = nullable(v.crewSlot, input => choice(input, CREW_SLOTS));
  if (crewSlot && !crewAlias) throw new Error('AI crew slot requires alias');
  return { from, to, registrationAlias: nullable(v.registrationAlias, id), crewAlias, crewSlot };
}
export function validateAiToolCall(value: unknown): AiToolCall {
  const v = object(value, ['id', 'name', 'arguments']), callId = id(v.id), name = choice(v.name, AI_TOOLS);
  switch (name) {
    case 'describeDataset': object(v.arguments, []); return { id: callId, name, arguments: {} };
    case 'resolveEntities': {
      const a = object(v.arguments, ['kind', 'text']);
      return { id: callId, name, arguments: { kind: choice(a.kind, ['crew', 'registration']), text: text(a.text, 200) } };
    }
    case 'queryFlights': {
      const a = object(v.arguments, ['filter', 'limit', 'pageToken']);
      return { id: callId, name, arguments: { filter: validateFlightFilter(a.filter), limit: integer(a.limit, L.rows, 1), pageToken: nullable(a.pageToken, input => text(input, 2048)) } };
    }
    case 'aggregateFlights': {
      const a = object(v.arguments, ['filter', 'measures']);
      return { id: callId, name, arguments: { filter: validateFlightFilter(a.filter), measures: unique(array(a.measures, 3, 1).map(m => choice(m, ['count', 'knownMinutes', 'averageKnownMinutes']))) } };
    }
    case 'getFlightEvidence': {
      const a = object(v.arguments, ['referenceIds']);
      return { id: callId, name, arguments: { referenceIds: unique(array(a.referenceIds, L.rows, 1).map(id)) } };
    }
  }
}
export function validateAiRequest(value: unknown): AiRequest {
  const start = tag(value, 'kind') === 'start';
  const base = ['version', 'toolVersion', 'provider', 'accountRef', 'conversationId', 'messageId', 'runId', 'attemptId', 'feature', 'kind', 'round'];
  const v = object(value, [...base, ...(start ? ['text', 'history'] : ['policyId', 'runCapability', 'continuation', 'outputs'])]);
  const common = { version: literal(v.version, 1), toolVersion: literal(v.toolVersion, 1), provider: literal(v.provider, 'vereinsflieger'), accountRef: account(v.accountRef),
    conversationId: id(v.conversationId), messageId: id(v.messageId), runId: id(v.runId), attemptId: id(v.attemptId), feature: choice(v.feature, ['question', 'review', 'progress', 'term']) };
  if (start) return { ...common, kind: literal(v.kind, 'start'), round: literal(v.round, 0), text: text(v.text, L.userTextChars),
    history: array(v.history, L.historyExchanges).map(item => { const h = object(item, ['user', 'assistant']); return { user: text(h.user), assistant: text(h.assistant) }; }) };
  const outputs = array(v.outputs, common.feature === 'question' || common.feature === 'term' ? L.questionTools : L.reviewTools, 1).map(item => { const o = object(item, ['callId', 'payload']); return { callId: id(o.callId), payload: text(o.payload, L.protocolChars) }; });
  unique(outputs.map(o => o.callId));
  const runCapability = text(v.runCapability, 128);
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(runCapability)) throw new Error('Invalid AI capability');
  return { ...common, kind: literal(v.kind, 'continue'), round: integer(v.round, common.feature === 'question' || common.feature === 'term' ? L.questionTurns - 1 : L.reviewTurns - 1, 1),
    policyId: id(v.policyId), runCapability, continuation: text(v.continuation, L.protocolChars), outputs };
}
export function parseAiRequest(json: string): AiRequest { return validateAiRequest(wire(json)); }

export function validateAiBudget(value: unknown): AiBudget {
  const v = object(value, ['period', 'timezone', 'capMicroEur', 'settledMicroEur', 'reservedMicroEur', 'unknownMicroEur', 'remainingMicroEur']);
  const period = text(v.period, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('Invalid AI period');
  const capMicroEur = integer(v.capMicroEur, L.monthlyMicroEur);
  // Overage must remain displayable; remaining is zero, never a reset of old exposure.
  const settledMicroEur = integer(v.settledMicroEur, Number.MAX_SAFE_INTEGER), reservedMicroEur = integer(v.reservedMicroEur, Number.MAX_SAFE_INTEGER), unknownMicroEur = integer(v.unknownMicroEur, Number.MAX_SAFE_INTEGER);
  const sum = settledMicroEur + reservedMicroEur + unknownMicroEur;
  if (!Number.isSafeInteger(sum)) throw new Error('AI budget overflow');
  const remainingMicroEur = integer(v.remainingMicroEur, capMicroEur);
  if (remainingMicroEur !== Math.max(0, capMicroEur - sum)) throw new Error('Inconsistent AI budget');
  return { period, timezone: literal(v.timezone, 'Europe/Berlin'), capMicroEur, settledMicroEur, reservedMicroEur, unknownMicroEur, remainingMicroEur };
}
export function validateAiPolicy(value: unknown): AiPolicy {
  const v = object(value, ['version', 'id', 'enabled', 'model', 'reasoning', 'zdrOnly', 'store', 'automaticRetries', 'routes', 'features', 'tools', 'systemPrompt', 'personalCapMicroEur', 'globalCapMicroEur', 'questionCapMicroEur', 'reviewCapMicroEur', 'inputTokens', 'outputTokens', 'questionTurns', 'reviewTurns', 'questionTools', 'reviewTools', 'rowsPerRead']);
  if (typeof v.enabled !== 'boolean') throw new Error('Invalid AI enablement');
  literal(array(v.routes, 1, 1)[0], 'azure');
  const personalCapMicroEur = integer(v.personalCapMicroEur, L.monthlyMicroEur), globalCapMicroEur = integer(v.globalCapMicroEur, L.monthlyMicroEur);
  const questionCapMicroEur = integer(v.questionCapMicroEur, Math.min(L.questionMicroEur, personalCapMicroEur, globalCapMicroEur));
  const reviewCapMicroEur = integer(v.reviewCapMicroEur, Math.min(L.reviewMicroEur, personalCapMicroEur, globalCapMicroEur));
  return { version: literal(v.version, 1), id: id(v.id), enabled: v.enabled, model: literal(v.model, 'openai/gpt-6-luna'), reasoning: literal(v.reasoning, 'max'), zdrOnly: literal(v.zdrOnly, true), store: literal(v.store, false), automaticRetries: literal(v.automaticRetries, 0), routes: ['azure'],
    features: unique(array(v.features, 4).map(f => choice(f, ['question', 'review', 'progress', 'term']))), tools: unique(array(v.tools, AI_TOOLS.length).map(t => choice(t, AI_TOOLS))), systemPrompt: text(v.systemPrompt, 16000),
    personalCapMicroEur, globalCapMicroEur, questionCapMicroEur, reviewCapMicroEur,
    inputTokens: integer(v.inputTokens, L.inputTokens, 1), outputTokens: integer(v.outputTokens, L.outputTokens, 1), questionTurns: integer(v.questionTurns, L.questionTurns, 1), reviewTurns: integer(v.reviewTurns, L.reviewTurns, 1),
    questionTools: integer(v.questionTools, L.questionTools, 1), reviewTools: integer(v.reviewTools, L.reviewTools, 1), rowsPerRead: integer(v.rowsPerRead, L.rows, 1) };
}

export interface AiReplyAuthority {
  context: AiContext; policy: AiPolicy; attemptId: string; runId: string; round: number;
  // Local maps built by deterministic tools. Model-supplied references/metrics cannot
  // enlarge these grants; check current context again immediately before rendering.
  references: readonly AiEvidenceReference[];
  metrics: ReadonlyMap<string, { measure: 'count' | 'knownMinutes' | 'averageKnownMinutes'; value: number | null; unit: 'flights' | 'minutes' }>;
}
function answer(value: unknown, authority: AiReplyAuthority): AiAnswer {
  const v = object(value, ['text', 'evidenceIds', 'actions', 'metrics']);
  const parsedReferences = authority.references.map(r => validateAiEvidenceReference(r, authority.context));
  const refs = new Set(unique(parsedReferences.map(r => r.id)));
  const navigable = new Set(parsedReferences.filter(r => !('kind' in r)).map(r => r.id));
  const reference = (value: unknown): string => { const key = id(value); if (!refs.has(key)) throw new Error('Unknown AI evidence'); return key; };
  const evidenceIds = unique(array(v.evidenceIds, L.rows).map(reference));
  const actions = array(v.actions, 20).map(item => {
    const a = object(item, ['kind', 'referenceIds']), kind = choice(a.kind, ['open-flight', 'show-flights']);
    const referenceIds = unique(array(a.referenceIds, kind === 'open-flight' ? 1 : L.rows, 1).map(reference));
    if (referenceIds.some(ref => !evidenceIds.includes(ref) || !navigable.has(ref))) throw new Error('Uncited or non-flight AI action');
    return { kind, referenceIds };
  });
  const metrics = array(v.metrics, 30).map(item => {
    const m = object(item, ['referenceId', 'measure', 'value', 'unit']), referenceId = id(m.referenceId), granted = authority.metrics.get(referenceId);
    if (!granted || m.measure !== granted.measure || m.value !== granted.value || m.unit !== granted.unit) throw new Error('Unverified AI metric');
    if (granted.value !== null && (!Number.isFinite(granted.value) || granted.value < 0 || (granted.measure !== 'averageKnownMinutes' && !Number.isSafeInteger(granted.value)))) throw new Error('Invalid AI metric');
    if (granted.unit !== (granted.measure === 'count' ? 'flights' : 'minutes')) throw new Error('Invalid AI unit');
    return { referenceId, ...granted };
  });
  unique(metrics.map(m => m.referenceId));
  return { text: text(v.text, 32000), evidenceIds, actions, metrics };
}
export function validateAiReply(value: unknown, authority: AiReplyAuthority): AiReply {
  const status = choice(tag(value, 'status'), ['answer', 'needs-tools', 'needs-clarification', 'partial', 'unavailable', 'failed', 'cancelled', 'interrupted']);
  const content = status === 'needs-tools' ? 'tools' : ['answer', 'needs-clarification', 'partial'].includes(status) ? 'answer' : 'reason';
  const v = object(value, ['version', 'status', 'receipt', content]);
  const r = object(v.receipt, ['policyId', 'attemptId', 'runId', 'round', 'budget']);
  const receipt: AiReceipt = { policyId: literal(r.policyId, authority.policy.id), attemptId: literal(r.attemptId, authority.attemptId), runId: literal(r.runId, authority.runId), round: literal(r.round, authority.round), budget: validateAiBudget(r.budget) };
  const common = { version: literal(v.version, 1), receipt };
  if (status === 'needs-tools') {
    const tools = array(v.tools, L.reviewTools, 1).map(validateAiToolCall); unique(tools.map(t => t.id));
    if (tools.some(t => !authority.policy.tools.includes(t.name))) throw new Error('AI tool disabled');
    return { ...common, status, tools };
  }
  if (status === 'answer' || status === 'needs-clarification' || status === 'partial') return { ...common, status, answer: answer(v.answer, authority) };
  return { ...common, status, reason: choice(v.reason, ['disabled', 'identity', 'budget', 'context-changed', 'incompatible', 'transport', 'cancelled']) };
}
export function parseAiReply(json: string, authority: AiReplyAuthority): AiReply { return validateAiReply(wire(json), authority); }

export function validateAiCoverage(value: unknown): AiCoverage {
  const v = object(value, ['state', 'requestedFrom', 'requestedTo', 'observedFrom', 'observedTo', 'referenceDate', 'timezone', 'totalRows', 'suppliedRows', 'omittedRows', 'unknownDateRows', 'unknownDurationRows', 'unknownCrewRows', 'unknownRegistrationRows', 'conflictingRows']);
  const requestedFrom = nullable(v.requestedFrom, date), requestedTo = nullable(v.requestedTo, date), observedFrom = nullable(v.observedFrom, date), observedTo = nullable(v.observedTo, date);
  if (requestedFrom && requestedTo && requestedFrom > requestedTo || observedFrom && observedTo && observedFrom > observedTo) throw new Error('Invalid AI coverage range');
  const totalRows = integer(v.totalRows, Number.MAX_SAFE_INTEGER), suppliedRows = integer(v.suppliedRows, totalRows), omittedRows = integer(v.omittedRows, totalRows);
  if (suppliedRows + omittedRows !== totalRows) throw new Error('Inconsistent AI coverage');
  const state = choice(v.state, ['complete', 'partial', 'empty', 'unavailable']);
  if (state === 'empty' && totalRows !== 0 || state === 'unavailable' && (totalRows !== 0 || observedFrom !== null || observedTo !== null)) throw new Error('Invalid empty AI coverage');
  return { state, requestedFrom, requestedTo, observedFrom, observedTo, referenceDate: date(v.referenceDate), timezone: literal(v.timezone, 'Europe/Berlin'), totalRows, suppliedRows, omittedRows,
    unknownDateRows: integer(v.unknownDateRows, totalRows), unknownDurationRows: integer(v.unknownDurationRows, totalRows), unknownCrewRows: integer(v.unknownCrewRows, totalRows), unknownRegistrationRows: integer(v.unknownRegistrationRows, totalRows), conflictingRows: integer(v.conflictingRows, totalRows) };
}
// This projection is the only structured local tool payload admitted upstream.
// Numeric/source equality remains the deterministic adapter's responsibility.
export function validateAiToolResult(value: unknown): AiToolResult {
  const v = object(value, ['version', 'callId', 'name', 'coverage', 'rows', 'sourceRows', 'sourceReview', 'candidates', 'metrics', 'nextPageToken']);
  const projectedRows = (value: unknown) => array(value, L.rows).map(item => {
    const r = object(item, ['referenceId', 'date', 'registrationAlias', 'startTime', 'landingTime', 'knownMinutes', 'durationState', 'crew']);
    const durationState = choice(r.durationState, ['known', 'unknown', 'conflict']);
    const knownMinutes = nullable(r.knownMinutes, value => integer(value, Number.MAX_SAFE_INTEGER));
    if ((durationState === 'known') !== (knownMinutes !== null)) throw new Error('Inconsistent AI duration');
    const crew = array(r.crew, 6).map(item => { const c = object(item, ['alias', 'slot']); return { alias: id(c.alias), slot: choice(c.slot, CREW_SLOTS) }; });
    unique(crew.map(c => c.slot));
    const clock = (value: unknown) => { const result = text(value, 5); if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(result)) throw new Error('Invalid AI source clock'); return result; };
    return { referenceId: id(r.referenceId), date: nullable(r.date, date), registrationAlias: nullable(r.registrationAlias, id), startTime: nullable(r.startTime, clock), landingTime: nullable(r.landingTime, clock), knownMinutes, durationState, crew };
  });
  const rows = projectedRows(v.rows), sourceRows = projectedRows(v.sourceRows);
  if (rows.length + sourceRows.length > L.rows) throw new Error('AI evidence read exceeds row bound');
  unique([...rows, ...sourceRows].map(r => r.referenceId));
  const sr = object(v.sourceReview, ['state', 'totalRows', 'omittedRows', 'totalIssues', 'issues']);
  const totalRows = integer(sr.totalRows, Number.MAX_SAFE_INTEGER), omittedRows = integer(sr.omittedRows, totalRows), totalIssues = integer(sr.totalIssues, totalRows);
  const state = choice(sr.state, ['available', 'partial', 'unavailable']);
  if (state === 'unavailable' && (totalRows || omittedRows || totalIssues) || state === 'available' && omittedRows || state === 'partial' && !omittedRows) throw new Error('Invalid AI source-review coverage');
  const issues = array(sr.issues, L.rows).map(item => {
    const i = object(item, ['id', 'kind', 'referenceIds', 'rowCount']);
    const referenceIds = unique(array(i.referenceIds, L.rows, 1).map(id));
    const rowCount = integer(i.rowCount, totalRows, referenceIds.length);
    return { id: id(i.id), kind: choice(i.kind, ['duplicate-source-row', 'conflicting-source-row', 'missing-source-reference']), referenceIds, rowCount };
  });
  unique(issues.map(i => i.id));
  if (issues.length > totalIssues || issues.flatMap(i => i.referenceIds).length > L.rows || sourceRows.length > totalRows - omittedRows) throw new Error('Invalid AI source-review bounds');
  const candidates = array(v.candidates, L.rows).map(item => { const c = object(item, ['alias', 'kind', 'match']); return { alias: id(c.alias), kind: choice(c.kind, ['crew', 'registration']), match: choice(c.match, ['exact', 'candidate']) }; });
  unique(candidates.map(c => c.alias));
  const metrics = array(v.metrics, 30).map(item => {
    const m = object(item, ['referenceId', 'measure', 'value', 'unit']), measure = choice(m.measure, ['count', 'knownMinutes', 'averageKnownMinutes']), unit = choice(m.unit, ['flights', 'minutes']);
    if (unit !== (measure === 'count' ? 'flights' : 'minutes')) throw new Error('Invalid AI measure unit');
    let value: number | null = null;
    if (m.value !== null) {
      if (typeof m.value !== 'number' || !Number.isFinite(m.value) || m.value < 0 || m.value > Number.MAX_SAFE_INTEGER || measure !== 'averageKnownMinutes' && !Number.isSafeInteger(m.value)) throw new Error('Invalid AI measure');
      value = m.value;
    }
    return { referenceId: id(m.referenceId), measure, value, unit };
  });
  unique(metrics.map(m => m.referenceId));
  const coverage = validateAiCoverage(v.coverage);
  if (coverage.suppliedRows < rows.length) throw new Error('Invalid AI supplied coverage');
  const name = choice(v.name, AI_TOOLS), nextPageToken = nullable(v.nextPageToken, value => text(value, 2048));
  if (name !== 'queryFlights' && nextPageToken !== null || name !== 'resolveEntities' && candidates.length || name !== 'aggregateFlights' && metrics.length || !['queryFlights', 'getFlightEvidence'].includes(name) && rows.length || name !== 'getFlightEvidence' && sourceRows.length || name !== 'describeDataset' && issues.length) throw new Error('Invalid AI tool result fields');
  return { version: literal(v.version, 1), callId: id(v.callId), name, coverage, rows, sourceRows, sourceReview: { state, totalRows, omittedRows, totalIssues, issues }, candidates, metrics, nextPageToken };
}
