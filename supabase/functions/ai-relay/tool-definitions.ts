import { AI_TOOLS, type AiToolName } from '../../../packages/ai-contracts/src/types.ts';

type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;
interface JsonObject { [key: string]: JsonValue }

export interface ResponseFunctionTool {
  type: 'function';
  name: AiToolName;
  description: string;
  parameters: JsonObject;
  strict: true;
}

const objectSchema = (properties: Record<string, JsonValue>): JsonObject => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const nullable = (schema: JsonObject): JsonObject => ({ anyOf: [schema, { type: 'null' }] });

const identifier: JsonObject = {
  type: 'string',
  minLength: 1,
  maxLength: 100,
  pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$',
};

const date = (): JsonObject => nullable({
  type: 'string',
  format: 'date',
  minLength: 10,
  maxLength: 10,
  pattern: '^\\d{4}-\\d{2}-\\d{2}$',
});

const filter = (): JsonObject => objectSchema({
  from: date(),
  to: date(),
  registrationAlias: nullable(identifier),
  crewAlias: nullable(identifier),
  crewSlot: nullable({ type: 'string', enum: ['pilot', 'pic', 'companion', 'companion2', 'companion3', 'sic'] }),
});

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const TOOL_DEFINITIONS: Record<AiToolName, ResponseFunctionTool> = deepFreeze({
  describeDataset: {
    type: 'function',
    name: 'describeDataset',
    description: 'Describe the available saved flight history and its coverage.',
    parameters: objectSchema({}),
    strict: true,
  },
  resolveEntities: {
    type: 'function',
    name: 'resolveEntities',
    description: 'Resolve a crew or registration label to available local aliases.',
    parameters: objectSchema({
      kind: { type: 'string', enum: ['crew', 'registration'] },
      text: { type: 'string', minLength: 1, maxLength: 200 },
    }),
    strict: true,
  },
  queryFlights: {
    type: 'function',
    name: 'queryFlights',
    description: 'Read a bounded page of saved flights matching the supplied filters.',
    parameters: objectSchema({
      filter: filter(),
      limit: { type: 'integer', minimum: 1, maximum: 200 },
      pageToken: nullable({ type: 'string', minLength: 1, maxLength: 2048 }),
    }),
    strict: true,
  },
  aggregateFlights: {
    type: 'function',
    name: 'aggregateFlights',
    description: 'Calculate selected deterministic measures over saved flights.',
    parameters: objectSchema({
      filter: filter(),
      measures: {
        type: 'array',
        items: { type: 'string', enum: ['count', 'knownMinutes', 'averageKnownMinutes'] },
        minItems: 1,
        maxItems: 3,
        uniqueItems: true,
      },
    }),
    strict: true,
  },
  getFlightEvidence: {
    type: 'function',
    name: 'getFlightEvidence',
    description: 'Read saved flight evidence for locally issued reference IDs.',
    parameters: objectSchema({
      referenceIds: {
        type: 'array',
        items: identifier,
        minItems: 1,
        maxItems: 200,
        uniqueItems: true,
      },
    }),
    strict: true,
  },
});

const ALLOWED_NAMES = new Set<string>(AI_TOOLS);

function copyDefinition(definition: ResponseFunctionTool): ResponseFunctionTool {
  return JSON.parse(JSON.stringify(definition)) as ResponseFunctionTool;
}

export function responseTools(names: readonly AiToolName[]): ResponseFunctionTool[] {
  if (!Array.isArray(names)) throw new TypeError('AI tool names must be an array');
  const seen = new Set<string>();
  return names.map(name => {
    if (typeof name !== 'string' || !ALLOWED_NAMES.has(name)) throw new Error('Unsupported AI tool name');
    if (seen.has(name)) throw new Error('Duplicate AI tool name');
    seen.add(name);
    return copyDefinition(TOOL_DEFINITIONS[name as AiToolName]);
  });
}
