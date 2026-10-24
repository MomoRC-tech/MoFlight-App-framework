// Vendor-free contracts. Shape validation never establishes provider authentication.
export const AI_VERSION = 1 as const;
export const AI_STORAGE_VERSIONS = Object.freeze({ chat: 1, historicalIdentity: 1, userBackup: 2, oldestUserBackup: 1 });
export const AI_LIMITS = Object.freeze({
  monthlyMicroEur: 1_000_000, questionMicroEur: 50_000, reviewMicroEur: 100_000,
  questionTurns: 6, reviewTurns: 16, questionTools: 12, reviewTools: 48,
  rows: 200, inputTokens: 32_000, outputTokens: 16_384, historyExchanges: 8,
  conversations: 50, settledRetentionDays: 90, userTextChars: 16_000,
  wireBytes: 512_000, protocolChars: 262_144,
});
export const AI_TOOLS = ['describeDataset', 'resolveEntities', 'queryFlights', 'aggregateFlights', 'getFlightEvidence'] as const;
export const CREW_SLOTS = ['pilot', 'pic', 'companion', 'companion2', 'companion3', 'sic'] as const;
export type AiToolName = typeof AI_TOOLS[number];
export type AiFeature = 'question' | 'review' | 'progress' | 'term';
export interface AiContext {
  version: 1; localOwnerId: string; provider: 'vereinsflieger'; accountRef: string;
  contextVersion: number;
  flights: { state: 'available'; storeId: string; generation: number; snapshotRevision: string }
    | { state: 'flights-unavailable' };
}
export interface HistoricalProviderIdentity {
  version: 1; localOwnerId: string; provider: 'vereinsflieger'; accountRef: string;
  observedAt: string;
  provenance: { kind: 'authenticated-profile'; verification: 'observed-profile-number' }
    | { kind: 'verified-saved-binding'; storeId: string; sourceRevision: string };
}
export interface FlightReference { id: string; flightId: string; factsRevision: string; context: AiContext }
export interface FlightFilter {
  from: string | null; to: string | null; registrationAlias: string | null;
  crewAlias: string | null; crewSlot: typeof CREW_SLOTS[number] | null;
}
export type AiToolCall = { id: string } & (
  | { name: 'describeDataset'; arguments: Record<string, never> }
  | { name: 'resolveEntities'; arguments: { kind: 'crew' | 'registration'; text: string } }
  | { name: 'queryFlights'; arguments: { filter: FlightFilter; limit: number; pageToken: string | null } }
  | { name: 'aggregateFlights'; arguments: { filter: FlightFilter; measures: ('count' | 'knownMinutes' | 'averageKnownMinutes')[] } }
  | { name: 'getFlightEvidence'; arguments: { referenceIds: string[] } }
);
// References are issued locally; model aliases are never source or navigation authority.
export interface AiAction { kind: 'open-flight' | 'show-flights'; referenceIds: string[] }
export interface AiMetric { referenceId: string; measure: 'count' | 'knownMinutes' | 'averageKnownMinutes'; value: number | null; unit: 'flights' | 'minutes' }
export interface AiAnswer { text: string; evidenceIds: string[]; actions: AiAction[]; metrics: AiMetric[] }
export interface AiBudget {
  period: string; timezone: 'Europe/Berlin'; capMicroEur: number;
  settledMicroEur: number; reservedMicroEur: number; unknownMicroEur: number;
  remainingMicroEur: number;
}
export interface AiReceipt { policyId: string; attemptId: string; runId: string; round: number; budget: AiBudget }
export type AiReply = { version: 1; receipt: AiReceipt } & (
  | { status: 'needs-tools'; tools: AiToolCall[] }
  | { status: 'answer' | 'needs-clarification' | 'partial'; answer: AiAnswer }
  | { status: 'unavailable' | 'failed' | 'cancelled' | 'interrupted'; reason: 'disabled' | 'identity' | 'budget' | 'context-changed' | 'incompatible' | 'transport' | 'cancelled' }
);
export interface AiRequestBase {
  version: 1; toolVersion: 1; provider: 'vereinsflieger'; accountRef: string;
  conversationId: string; messageId: string; runId: string; attemptId: string;
  feature: AiFeature;
}
export type AiRequest = AiRequestBase & (
  | { kind: 'start'; round: 0; text: string; history: { user: string; assistant: string }[] }
  // This opaque authenticated envelope must be verified by AI04/07, never parsed into
  // privileged roles from a client object. No raw provider Responses item is accepted.
  | { kind: 'continue'; round: number; policyId: string; runCapability: string;
      continuation: string; outputs: { callId: string; payload: string }[] }
);
export interface AiPolicy {
  version: 1; id: string; enabled: boolean; model: 'openai/gpt-6-luna'; reasoning: 'max';
  zdrOnly: true; store: false; automaticRetries: 0; routes: ['azure'];
  features: AiFeature[]; tools: AiToolName[]; systemPrompt: string;
  personalCapMicroEur: number; globalCapMicroEur: number;
  questionCapMicroEur: number; reviewCapMicroEur: number;
  inputTokens: number; outputTokens: number; questionTurns: number; reviewTurns: number;
  questionTools: number; reviewTools: number; rowsPerRead: number;
}
export interface AiCoverage {
  state: 'complete' | 'partial' | 'empty' | 'unavailable';
  requestedFrom: string | null; requestedTo: string | null;
  observedFrom: string | null; observedTo: string | null;
  referenceDate: string; timezone: 'Europe/Berlin';
  totalRows: number; suppliedRows: number; omittedRows: number;
  unknownDateRows: number; unknownDurationRows: number; unknownCrewRows: number; unknownRegistrationRows: number; conflictingRows: number;
}
export interface AiProjectedFlight {
  referenceId: string; date: string | null; registrationAlias: string | null;
  startTime: string | null; landingTime: string | null;
  knownMinutes: number | null; durationState: 'known' | 'unknown' | 'conflict';
  crew: { alias: string; slot: typeof CREW_SLOTS[number] }[];
}
export interface AiToolResult {
  version: 1; callId: string; name: AiToolName;
  // Context remains local. Neither provider ID nor local source IDs occur here.
  coverage: AiCoverage;
  rows: AiProjectedFlight[];
  candidates: { alias: string; kind: 'crew' | 'registration'; match: 'exact' | 'candidate' }[];
  metrics: { referenceId: string; measure: 'count' | 'knownMinutes' | 'averageKnownMinutes'; value: number | null; unit: 'flights' | 'minutes' }[];
  nextPageToken: string | null;
}
