import assert from 'node:assert/strict';
import test from 'node:test';
import { AI_TOOLS, validateAiToolCall, type AiToolCall, type AiToolName } from '../../packages/ai-contracts/src/index.ts';
import { responseTools, type ResponseFunctionTool } from '../../supabase/functions/ai-relay/tool-definitions.ts';

const filter = { from: null, to: null, registrationAlias: null, crewAlias: null, crewSlot: null };

function freezeRecursively<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeRecursively(child);
    Object.freeze(value);
  }
  return value;
}

function schema(tool: ResponseFunctionTool): Record<string, unknown> {
  return tool.parameters as Record<string, unknown>;
}

function properties(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}

function nullableSchema(value: unknown): Record<string, unknown> {
  const candidate = properties(value);
  assert.ok(Array.isArray(candidate.anyOf));
  const branches = candidate.anyOf as Record<string, unknown>[];
  assert.ok(branches.some(branch => branch.type === 'null'));
  return branches.find(branch => branch.type !== 'null')!;
}

function objectProperties(value: unknown): Record<string, unknown> {
  const candidate = properties(value);
  assert.equal(candidate.type, 'object');
  assert.equal(candidate.additionalProperties, false);
  const objectFields = properties(candidate.properties);
  assert.deepEqual(candidate.required, Object.keys(objectFields));
  return objectFields;
}

test('Responses tools define exactly the five allowlisted contracts with closed required objects', () => {
  const definitions = responseTools(AI_TOOLS);
  assert.deepEqual(definitions.map(tool => tool.name), AI_TOOLS);

  for (const tool of definitions) {
    assert.equal(tool.type, 'function');
    assert.equal(tool.strict, true);
    assert.ok(tool.description.length > 0);
    objectProperties(schema(tool));
  }

  const byName = new Map(definitions.map(tool => [tool.name, tool]));
  const describeProperties = objectProperties(schema(byName.get('describeDataset')!));
  assert.deepEqual(describeProperties, {});

  const resolveProperties = objectProperties(schema(byName.get('resolveEntities')!));
  assert.deepEqual(Object.keys(resolveProperties), ['kind', 'text']);
  assert.deepEqual(properties(resolveProperties.kind).enum, ['crew', 'registration']);
  assert.equal(properties(resolveProperties.text).maxLength, 200);

  const queryProperties = objectProperties(schema(byName.get('queryFlights')!));
  assert.deepEqual(Object.keys(queryProperties), ['filter', 'limit', 'pageToken']);
  assert.deepEqual(properties(queryProperties.limit), { type: 'integer', minimum: 1, maximum: 200 });
  assert.equal(properties(nullableSchema(queryProperties.pageToken)).maxLength, 2048);
  const filterProperties = objectProperties(queryProperties.filter);
  for (const name of ['from', 'to', 'registrationAlias', 'crewAlias', 'crewSlot']) {
    assert.equal(properties(nullableSchema(filterProperties[name])).type, 'string');
  }
  assert.equal(properties(nullableSchema(filterProperties.from)).format, 'date');
  assert.equal(properties(nullableSchema(filterProperties.to)).format, 'date');
  assert.deepEqual(properties(nullableSchema(filterProperties.crewSlot)).enum, ['pilot', 'pic', 'companion', 'companion2', 'companion3', 'sic']);

  const aggregateProperties = objectProperties(schema(byName.get('aggregateFlights')!));
  const measures = properties(aggregateProperties.measures);
  assert.equal(measures.type, 'array');
  assert.equal(measures.minItems, 1);
  assert.equal(measures.maxItems, 3);
  assert.equal(measures.uniqueItems, true);
  assert.deepEqual(properties(measures.items).enum, ['count', 'knownMinutes', 'averageKnownMinutes']);

  const evidenceProperties = objectProperties(schema(byName.get('getFlightEvidence')!));
  const referenceIds = properties(evidenceProperties.referenceIds);
  assert.equal(referenceIds.minItems, 1);
  assert.equal(referenceIds.maxItems, 200);
  assert.equal(referenceIds.uniqueItems, true);
  assert.equal(properties(referenceIds.items).maxLength, 100);
});

test('tool selection rejects duplicates and unknown runtime names', () => {
  assert.deepEqual(responseTools(['getFlightEvidence', 'describeDataset']).map(tool => tool.name), ['getFlightEvidence', 'describeDataset']);
  assert.deepEqual(responseTools([]), []);
  assert.throws(() => responseTools(['describeDataset', 'describeDataset']));
  assert.throws(() => responseTools(['sql' as AiToolName]));
});

test('each responseTools result is a detached copy of the frozen canonical definition', () => {
  const first = responseTools(['queryFlights']);
  const second = responseTools(['queryFlights']);
  assert.notStrictEqual(first[0], second[0]);
  assert.notStrictEqual(first[0]!.parameters, second[0]!.parameters);

  const firstSchema = schema(first[0]!);
  properties(firstSchema.properties).filter = { type: 'string' };
  assert.equal(properties(objectProperties(schema(second[0]!)).filter).type, 'object');
  assert.equal(properties(objectProperties(schema(responseTools(['queryFlights'])[0]!)).filter).type, 'object');
});

test('tool-call contracts accept frozen valid arguments and reject invalid bounds or unsupported fields', () => {
  const accepted: AiToolCall[] = [
    { id: 'c1', name: 'describeDataset', arguments: {} },
    { id: 'c2', name: 'resolveEntities', arguments: { kind: 'crew', text: 'Synthetic Person' } },
    { id: 'c3', name: 'queryFlights', arguments: { filter: { ...filter, from: '2026-08-01', to: '2026-08-31' }, limit: 200, pageToken: 'page-1' } },
    { id: 'c4', name: 'aggregateFlights', arguments: { filter, measures: ['count', 'knownMinutes', 'averageKnownMinutes'] } },
    { id: 'c5', name: 'getFlightEvidence', arguments: { referenceIds: ['evidence-1', 'evidence-2'] } },
  ];

  for (const call of accepted) {
    const frozenCall = freezeRecursively(call);
    const parsed = validateAiToolCall(frozenCall);
    assert.deepEqual(parsed, call);
    assert.notStrictEqual(parsed, call);
    assert.notStrictEqual(parsed.arguments, call.arguments);
  }

  for (const call of [
    { id: 'c6', name: 'sql', arguments: {} },
    { id: 'c7', name: 'describeDataset', arguments: { extra: true } },
    { id: 'c8', name: 'resolveEntities', arguments: { kind: 'aircraft', text: 'D-SYN1' } },
    { id: 'c9', name: 'resolveEntities', arguments: { kind: 'crew', text: 'x'.repeat(201) } },
    { id: 'c10', name: 'queryFlights', arguments: { filter, limit: 0, pageToken: null } },
    { id: 'c11', name: 'queryFlights', arguments: { filter, limit: 201, pageToken: null } },
    { id: 'c12', name: 'queryFlights', arguments: { filter: { ...filter, from: '2026-02-30' }, limit: 1, pageToken: null } },
    { id: 'c13', name: 'queryFlights', arguments: { filter, limit: 1, pageToken: 'x'.repeat(2049) } },
    { id: 'c14', name: 'queryFlights', arguments: { filter: { ...filter, crewSlot: 'pilot' }, limit: 1, pageToken: null } },
    { id: 'c15', name: 'aggregateFlights', arguments: { filter, measures: [] } },
    { id: 'c16', name: 'aggregateFlights', arguments: { filter, measures: ['count', 'count'] } },
    { id: 'c17', name: 'aggregateFlights', arguments: { filter, measures: ['count', 'knownMinutes', 'averageKnownMinutes', 'count'] } },
    { id: 'c18', name: 'getFlightEvidence', arguments: { referenceIds: [] } },
    { id: 'c19', name: 'getFlightEvidence', arguments: { referenceIds: ['evidence-1', 'evidence-1'] } },
    { id: 'c20', name: 'getFlightEvidence', arguments: { referenceIds: ['e'.repeat(101)] } },
  ]) {
    assert.throws(() => validateAiToolCall(call as unknown));
  }

  assert.throws(() => validateAiToolCall({ id: 'c21', name: 'getFlightEvidence', arguments: { referenceIds: Array.from({ length: 201 }, (_, i) => `evidence-${i}`) } }));
});
